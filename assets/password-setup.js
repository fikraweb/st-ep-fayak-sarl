'use strict';
// Local-only derivation helper. It never sends or stores the entered password.
window.attachPasswordSetup = function attachPasswordSetup(root, arabic, reset=false) {
  const t=(fr,ar)=>arabic?ar:fr;
  root.innerHTML=`<details class="password-setup"><summary>${reset?t('Réinitialiser mon mot de passe','إعادة تعيين كلمة السر'):t('Créer mon mot de passe administrateur','تجهيز كلمة سر الإدارة')}</summary><p class="form-help">${t('Choisissez votre mot de passe ici, puis copiez son empreinte dans le secret Cloudflare ADMIN_PASSWORD_HASH (Rotate pour remplacer une valeur existante). Cette préparation reste dans votre navigateur et ne crée aucun accès à elle seule.','اختاروا كلمة السر هنا، ثم انسخوا بصمتها إلى Secret في Cloudflare باسم ADMIN_PASSWORD_HASH (استعملوا Rotate لتغيير القيمة القديمة). تتم العملية في متصفحكم فقط، ولا تفعّل الدخول بوحدها.')}</p><form id="password-setup-form"><label class="form-label">${t('Nouveau mot de passe (14 caractères minimum)','كلمة سر جديدة (14 حرفاً على الأقل)')}<input type="password" name="newPassword" autocomplete="new-password" required minlength="14" maxlength="256"></label><label class="form-label">${t('Confirmer le mot de passe','تأكيد كلمة السر')}<input type="password" name="confirmPassword" autocomplete="new-password" required minlength="14" maxlength="256"></label><button class="btn" type="submit">${t('Préparer mon empreinte','تجهيز بصمة كلمة السر')}</button></form><button class="btn secondary password-copy" type="button" disabled>${t('Copier la valeur pour Cloudflare','نسخ القيمة لوضعها في Cloudflare')}</button><p class="password-setup-status form-help" role="status" aria-live="polite"></p></details>`;
  const form=root.querySelector('form'),copy=root.querySelector('.password-copy'),status=root.querySelector('.password-setup-status');
  let prepared='';
  const clear=()=>{prepared='';copy.disabled=true;status.textContent='';status.className='password-setup-status form-help'};
  form.addEventListener('input',clear);
  root.querySelector('details').addEventListener('toggle',e=>{if(!e.target.open){clear();form.reset()}});
  form.addEventListener('submit',async e=>{
    e.preventDefault();clear();
    const password=form.elements.newPassword.value,confirmation=form.elements.confirmPassword.value;
    if(password.length<14||password.length>256||password!==confirmation){status.textContent=t('Les mots de passe doivent correspondre et contenir entre 14 et 256 caractères.','يجب أن تتطابق كلمتا السر وأن تحتوي على 14 إلى 256 حرفاً.');status.className='password-setup-status error';return}
    const submit=form.querySelector('button');submit.disabled=true;
    try{
      if(!window.isSecureContext||!crypto.subtle)throw Error('secure-context');
      const salt=crypto.getRandomValues(new Uint8Array(16));
      const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
      const digest=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256));
      const base64=bytes=>btoa(String.fromCharCode(...bytes));
      prepared=`pbkdf2$100000$${base64(salt)}$${base64(digest)}`;
      form.reset();copy.disabled=false;
      status.textContent=t('Empreinte prête. Conservez votre mot de passe dans votre gestionnaire de mots de passe, puis copiez la valeur dans Cloudflare : Type Secret, nom ADMIN_PASSWORD_HASH. N’envoyez ni le mot de passe ni l’empreinte dans le chat.','البصمة واجدة. احتفظوا بكلمة السر في مدير كلمات المرور، ثم انسخوا القيمة إلى Cloudflare: النوع Secret والاسم ADMIN_PASSWORD_HASH. لا ترسلوا كلمة السر ولا البصمة في المحادثة.');
    }catch{status.textContent=t('La préparation nécessite un navigateur récent et une page HTTPS.','تجهيز البصمة يتطلب متصفحاً حديثاً وصفحة HTTPS.');status.className='password-setup-status error'}finally{submit.disabled=false}
  });
  copy.addEventListener('click',async()=>{
    if(!prepared)return;
    try{await navigator.clipboard.writeText(prepared);status.textContent=t('Valeur copiée. Collez-la dans le secret ADMIN_PASSWORD_HASH du Worker, enregistrez/appliquez, puis cliquez « Vérifier à nouveau ». Connectez-vous ensuite avec le mot de passe que vous avez choisi, pas avec cette empreinte.','تم النسخ. ألصقوا القيمة في Secret باسم ADMIN_PASSWORD_HASH داخل Worker، ثم احفظوا وطبقوا التغيير واضغطوا «التحقق مجدداً». من بعد سجلوا الدخول بكلمة السر التي اخترتم، وليس بهذه البصمة.')}catch{status.textContent=t('Copie refusée par le navigateur. Autorisez l’accès au presse-papiers pour ce site, puis réessayez.','المتصفح رفض النسخ. اسمحوا لهذا الموقع باستخدام الحافظة، ثم أعيدوا المحاولة.');status.className='password-setup-status error'}
  });
};
