const COMPANY_EMAIL='EP.FAYAK@GMAIL.COM';
const MAX_FILE=10*1024*1024;
const EMAIL=/^[^\s<>"@\r\n]+@[^\s<>"@\r\n]+\.[^\s<>"@\r\n]+$/;
const encoder=new TextEncoder();
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value))].map(n=>n.toString(16).padStart(2,'0')).join('');
const fail=(message,status=400,publicCode='VALIDATION')=>{throw Object.assign(new Error(message),{status,publicCode})};
const field=(form,key,max,min=1)=>{const value=form.get(key);if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail('Vérifiez les champs obligatoires.');return value.trim()};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanLine=value=>value.replace(/[\r\n]/g,' ').slice(0,150);
export const quoteDestination=env=>EMAIL.test(env.QUOTE_TO_EMAIL||'')?env.QUOTE_TO_EMAIL:COMPANY_EMAIL;
export const quoteConfigured=env=>Boolean(env.DB&&env.BREVO_API_KEY&&EMAIL.test(env.BREVO_SENDER_EMAIL||COMPANY_EMAIL));
function attachmentType(bytes){
 if(new TextDecoder().decode(bytes.slice(0,5))==='%PDF-')return ['pdf'];
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return ['jpg','jpeg'];
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return ['png'];
 return null;
}
function base64(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary)}
async function receipt(env,id,data){await env.DB.prepare('UPDATE settings SET data=?,updated_at=? WHERE id=?').bind(JSON.stringify(data),Date.now(),'quote:'+id).run()}
export async function submitQuote(request,env,{readLimited,services}){
 if(!quoteConfigured(env))fail('L’envoi est temporairement indisponible. Contactez-nous par téléphone ou email.',503,'QUOTE_NOT_READY');
 // Independent quota keys reuse the existing short-lived counters table.
 const now=Date.now(),ipHash=await digest(request.headers.get('CF-Connecting-IP')||'local');
 const counter='quote:'+ipHash;
 await env.DB.batch([
  env.DB.prepare('DELETE FROM login_attempts WHERE expires_at<?').bind(now),
  env.DB.prepare('INSERT INTO login_attempts (ip_hash,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=attempts+1').bind(counter,now+15*60*1000),
  env.DB.prepare("DELETE FROM settings WHERE id LIKE 'quote:%' AND updated_at<?").bind(now-48*60*60*1000)
 ]);
 const attempts=await env.DB.prepare('SELECT attempts FROM login_attempts WHERE ip_hash=?').bind(counter).first();
 if(attempts.attempts>5)fail('Trop de demandes. Réessayez dans 15 minutes ou contactez-nous directement.',429,'QUOTE_LIMIT');
 const bytes=await readLimited(request,MAX_FILE+50000);
 let form;try{form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData()}catch{fail('Formulaire invalide.')}
 if(form.get('website'))fail('Requête non autorisée.',400,'QUOTE_SPAM');
 if(!['on','true'].includes(form.get('consent')))fail('Votre accord est nécessaire pour traiter la demande.');
 const id=field(form,'requestId',36);
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))fail('Identifiant de demande invalide.');
 const name=field(form,'name',150),phone=field(form,'phone',25),email=field(form,'email',150),city=field(form,'city',150),serviceId=field(form,'service',30),description=field(form,'description',6000,15);
 if(!EMAIL.test(email)||!/^\+?[0-9 ()-]{8,25}$/.test(phone)||/[\r\n]/.test(name+city))fail('Vérifiez les coordonnées saisies.');
 const service=services.find(item=>item.id===serviceId);if(!service)fail('Sélectionnez un service valide.');
 let attachment=null,fileHash='';
 const file=form.get('attachment');
 if(file&&typeof file.arrayBuffer==='function'&&file.size){
  if(file.size>MAX_FILE)fail('Le fichier dépasse 10 Mo.',413,'QUOTE_FILE');
  const content=new Uint8Array(await file.arrayBuffer()),types=attachmentType(content),extension=file.name.split('.').pop()?.toLowerCase();
  if(!types||!types.includes(extension))fail('Joignez un fichier PDF, JPG ou PNG valide.',400,'QUOTE_FILE');
  const filename=file.name.replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(-100)||'document.'+extension;
  attachment={name:filename,content:base64(content)};fileHash=await digest(content);
 }
 const fingerprint=await digest(JSON.stringify([name,phone,email,city,serviceId,description,fileHash,attachment?.name||'']));
 const initial={state:'sending',fingerprint};
 const claim=await env.DB.prepare('INSERT OR IGNORE INTO settings (id,data,updated_at) VALUES (?,?,?)').bind('quote:'+id,JSON.stringify(initial),now).run();
 if(!claim.meta.changes){
  const existing=await env.DB.prepare('SELECT data FROM settings WHERE id=?').bind('quote:'+id).first();
  const previous=existing?JSON.parse(existing.data):null;
  if(previous?.fingerprint!==fingerprint)fail('La demande a changé. Rechargez la page pour une nouvelle demande.',409,'QUOTE_CHANGED');
  if(previous.state==='sent')return {ok:true,requestId:id};
  fail('Une demande identique est déjà en cours ou non confirmée. Contactez-nous avant de la renvoyer.',409,'QUOTE_PENDING');
 }
 const rows=[['Nom complet / الاسم',name],['Téléphone / الهاتف',phone],['Email',email],['Ville / المدينة',city],['Service / الخدمة',`${service.nameFr} / ${service.nameAr}`],['Projet / المشروع',description]];
 const message={sender:{name:'Sté EP FAYAK SARL',email:env.BREVO_SENDER_EMAIL||COMPANY_EMAIL},to:[{email:quoteDestination(env),name:'Sté EP FAYAK SARL'}],replyTo:{email,name:cleanLine(name)},subject:'Demande de devis — '+cleanLine(service.nameFr),textContent:'Nouvelle demande de devis\n\n'+rows.map(([label,value])=>label+' : '+value).join('\n\n')+'\n\nRéférence : '+id,htmlContent:`<!doctype html><html><body><h1>Nouvelle demande de devis</h1><table>${rows.map(([label,value])=>`<tr><th align="left" valign="top">${escape(label)}</th><td style="white-space:pre-wrap">${escape(value)}</td></tr>`).join('')}</table><p>Référence : ${id}</p><p>Répondez à cet email pour contacter le client.</p></body></html>`,headers:{idempotencyKey:id},tags:['devis-ep-fayak']};
 if(attachment)message.attachment=[attachment];
 let response;
 try{response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(message),redirect:'manual',signal:AbortSignal.timeout(20000)})}
 catch{await receipt(env,id,{...initial,state:'uncertain'});fail('L’envoi n’a pas pu être confirmé. Contactez-nous avant de renvoyer la demande.',503,'QUOTE_UNCERTAIN')}
 let result;try{result=await response.json()}catch{result=null}
 if(!response.ok){
  if(response.status>=400&&response.status<500&&result?.code!=='duplicate_parameter'){
   await env.DB.prepare('DELETE FROM settings WHERE id=?').bind('quote:'+id).run();
   fail('L’envoi a échoué. Vos informations sont conservées. Contactez-nous directement.',503,'QUOTE_FAILED');
  }
  await receipt(env,id,{...initial,state:'uncertain'});fail('L’envoi n’a pas pu être confirmé. Contactez-nous avant de renvoyer la demande.',503,'QUOTE_UNCERTAIN');
 }
 if(typeof result?.messageId!=='string'||!result.messageId){await receipt(env,id,{...initial,state:'uncertain'});fail('L’envoi n’a pas pu être confirmé.',503,'QUOTE_UNCERTAIN')}
 try{await receipt(env,id,{...initial,state:'sent',messageId:result.messageId})}catch{fail('L’envoi a été accepté mais sa confirmation n’a pas pu être enregistrée. Contactez-nous avant de renvoyer.',503,'QUOTE_UNCERTAIN')}
 return {ok:true,requestId:id};
}
