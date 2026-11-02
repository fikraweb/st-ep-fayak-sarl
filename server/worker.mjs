import { quoteConfigured, quoteDestination, submitQuote } from './quotes.mjs';
import { storageConfigured, storeMedia, getMedia, deleteMedia } from './cloudinary.mjs';
import { defaultServices, defaultPhotos } from './defaults.mjs';

const ids = new Set(defaultServices.map(s => s.id));
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_VIDEO = 20 * 1024 * 1024;
const SESSION_TTL = 8 * 60 * 60;
const encoder = new TextEncoder();
const hex = buffer => [...new Uint8Array(buffer)].map(n => n.toString(16).padStart(2, '0')).join('');
const hash = value => crypto.subtle.digest('SHA-256', encoder.encode(value)).then(hex);
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const problem = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function text(value, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) problem('Texte manquant ou trop long.');
  return value.trim();
}
function originCheck(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('X-Fayak-Request') !== '1') problem('Requête non autorisée.', 403);
}
async function readLimited(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) problem('Requête trop volumineuse.', 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let length = 0;
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); problem('Requête trop volumineuse.',413); }
    chunks.push(value);
  }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk,offset); offset += chunk.byteLength; }
  return result;
}
async function bodyJSON(request) {
  const body = new TextDecoder().decode(await readLimited(request,40000));
  try { const value = JSON.parse(body); if (!value || typeof value !== 'object' || Array.isArray(value)) problem('JSON invalide.'); return value; }
  catch { problem('JSON invalide.'); }
}
const photoJSON = p => ({ mediaType:/\.(mp4|webm)$/.test(p.url)?'video':'image',id: p.id, service: p.service, url: p.url, captionFr: p.caption_fr, captionAr: p.caption_ar, published: Boolean(p.published), sortOrder: p.sort_order, bytes: p.bytes, createdAt: p.created_at });
async function publicContent(env, admin = false) {
  if (!env.DB) return { settings: {}, services: defaultServices, photos: defaultPhotos, configured: false };
  const [settings, services, photos] = await Promise.all([
    env.DB.prepare('SELECT data FROM settings WHERE id = ?').bind('site').first(),
    env.DB.prepare('SELECT id,data FROM services').all(),
    env.DB.prepare(`SELECT * FROM photos ${admin ? '' : 'WHERE published = 1'} ORDER BY sort_order, created_at DESC`).all()
  ]);
  const overrides = new Map(services.results.map(s => [s.id, JSON.parse(s.data)]));
  return { settings: settings ? JSON.parse(settings.data) : {}, services: defaultServices.map(s => ({ ...s, ...overrides.get(s.id), id: s.id })), photos: photos.results.map(photoJSON), configured: true };
}
async function authenticated(request, env) {
  if (!env.DB || !env.ADMIN_PASSWORD_HASH) problem('Administration à activer dans Cloudflare.', 503);
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.match(/(?:^|;\s*)__Host-fayak_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) problem('Connexion requise.', 401);
  const session = await env.DB.prepare('SELECT expires_at,password_version FROM sessions WHERE token_hash = ?').bind(await hash(token)).first();
  if (!session || session.expires_at <= Date.now() || session.password_version !== await hash(env.ADMIN_PASSWORD_HASH)) problem('Session expirée. Reconnectez-vous.', 401);
  return token;
}
const cookie = (token, age = SESSION_TTL) => `__Host-fayak_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function passwordMatches(password, stored) {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2' || parts[1] !== '100000') return false;
  try {
    const salt = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
    const expected = Uint8Array.from(atob(parts[3]), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256));
    if (actual.length !== expected.length) return false;
    let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}
async function log(env, action) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO activity (action,created_at) VALUES (?,?)').bind(action, Date.now()),
    env.DB.prepare('DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 200)')
  ]);
}
function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ['image/jpeg', 'jpg'];
  if ([137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return ['image/png', 'png'];
  if (new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') return ['image/webp', 'webp'];
  return null;
}
function videoType(bytes) {
  const ascii=(start,end)=>new TextDecoder().decode(bytes.slice(start,end));
  if(bytes.length>=16&&ascii(4,8)==='ftyp'&&/^(isom|iso[1-9]|mp41|mp42|avc1|M4V |dash|MSNV)$/.test(ascii(8,12)))return ['video/mp4','mp4'];
  if([0x1a,0x45,0xdf,0xa3].every((v,i)=>bytes[i]===v)&&ascii(0,Math.min(bytes.length,512)).includes('webm'))return ['video/webm','webm'];
  return null;
}
const settingFields = { companyName: 100, sloganFr: 180, sloganAr: 180, heroTitleFr: 200, heroTitleAr: 200, heroDescriptionFr: 1000, heroDescriptionAr: 1000, aboutFr: 3000, aboutAr: 3000, phone1: 25, phone2: 25, email: 150, addressFr: 300, addressAr: 300 };
function validateSettings(data) {
  const result = {};
  for (const [key,limit] of Object.entries(settingFields)) if (key in data) result[key] = text(data[key],limit,true);
  for (const key of ['phone1','phone2']) if (result[key] && !/^\+?[0-9 ()-]{8,25}$/.test(result[key])) problem('Téléphone invalide.');
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) problem('Email invalide.');
  return result;
}
async function api(request, env, url) {
  const path = url.pathname;
  if(path==='/api/quotes'&&request.method==='POST'){
    originCheck(request);
    const saved=env.DB?await env.DB.prepare('SELECT id,data FROM services').all():{results:[]};
    const overrides=new Map(saved.results.map(row=>[row.id,JSON.parse(row.data)]));
    const services=defaultServices.map(service=>({...service,...overrides.get(service.id),id:service.id}));
    return json(await submitQuote(request,env,{readLimited,services}));
  }
  if (path === '/api/public' && request.method === 'GET') {
    try { return json(await publicContent(env)); }
    catch { return json({ settings: {}, services: defaultServices, photos: defaultPhotos, configured: false, unavailable: true }); }
  }
  if (path === '/api/admin/status' && request.method === 'GET') {
    let database = false;
    if (env.DB) try { await env.DB.prepare('SELECT id FROM settings LIMIT 1').first(); database = true; } catch {}
    return json({ ready: database && storageConfigured(env) && Boolean(env.ADMIN_PASSWORD_HASH), database, storage: storageConfigured(env), password: Boolean(env.ADMIN_PASSWORD_HASH),quotes:quoteConfigured(env) });
  }
  if (path === '/api/admin/login' && request.method === 'POST') {
    originCheck(request);
    if (!env.DB || !env.ADMIN_PASSWORD_HASH) problem('Administration à activer dans Cloudflare.', 503);
    const { password } = await bodyJSON(request);
    text(password, 256, true);
    const now = Date.now();
    const ipHash = await hash(request.headers.get('CF-Connecting-IP') || 'local');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM login_attempts WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      env.DB.prepare('INSERT INTO login_attempts (ip_hash,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=attempts+1').bind(ipHash, now + 15 * 60 * 1000)
    ]);
    const attempts = await env.DB.prepare('SELECT attempts FROM login_attempts WHERE ip_hash = ?').bind(ipHash).first();
    if (attempts.attempts > 5) return json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, 429, { 'Retry-After': '900' });
    if (!await passwordMatches(password, env.ADMIN_PASSWORD_HASH)) problem('Mot de passe incorrect.', 401);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ?').bind(ipHash),
      env.DB.prepare('INSERT INTO sessions (token_hash,password_version,expires_at) VALUES (?,?,?)').bind(await hash(token), await hash(env.ADMIN_PASSWORD_HASH), now + SESSION_TTL * 1000)
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(token) });
  }
  const token = await authenticated(request, env);
  if (!['GET','HEAD'].includes(request.method)) originCheck(request);
  if (path === '/api/admin/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('',0) });
  }
  if (path === '/api/admin/dashboard' && request.method === 'GET') {
    const content = await publicContent(env,true);
    const activity = await env.DB.prepare('SELECT action,created_at FROM activity ORDER BY id DESC LIMIT 12').all();
    return json({ ...content, activity: activity.results, storage: storageConfigured(env), origin: url.origin,quotes:{configured:quoteConfigured(env),destination:quoteDestination(env)} });
  }
  if (path === '/api/admin/settings' && request.method === 'PUT') {
    const data = validateSettings(await bodyJSON(request));
    await env.DB.prepare('INSERT INTO settings (id,data,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind('site',JSON.stringify(data),Date.now()).run();
    await log(env,'Informations générales mises à jour'); return json({ ok: true });
  }
  const service = path.match(/^\/api\/admin\/services\/([a-z]+)$/)?.[1];
  if (service && request.method === 'PUT') {
    if (!ids.has(service)) problem('Service inconnu.',404);
    const body = await bodyJSON(request);
    const data = {};
    for (const [key,limit] of Object.entries({ nameFr: 120,nameAr: 120,descriptionFr: 2000,descriptionAr: 2000 })) data[key] = text(body[key],limit,true);
    if (body.coverId) {
      const cover = await env.DB.prepare('SELECT url FROM photos WHERE id = ? AND service = ? AND published = 1').bind(body.coverId,service).first();
      if (!cover||/\.(mp4|webm)$/.test(cover.url)) problem('La couverture doit être une photo publiée de ce service, pas une vidéo.');
      data.image = cover.url;
    }
    await env.DB.prepare('INSERT INTO services (id,data,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(service,JSON.stringify(data),Date.now()).run();
    await log(env,`Service ${service} mis à jour`); return json({ ok: true });
  }
  if (path === '/api/admin/photos' && request.method === 'POST') {
    if (!storageConfigured(env)) problem('Stockage Cloudinary à configurer.',503);
    if (Number(request.headers.get('Content-Length')) > MAX_VIDEO + 50000) problem('Fichier : 20 Mo maximum.',413);
    const body = await readLimited(request,MAX_VIDEO+50000);
    let form;
    try { form = await new Response(body,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData(); }
    catch { problem('Formulaire invalide.'); }
    const service = form.get('service'); if (!ids.has(service)) problem('Service inconnu.');
    if (form.get('authorized') !== 'true') problem('Confirmez votre autorisation de publier cette photo.');
    const captionFr = text(form.get('captionFr') || '',200,true);
    const captionAr = text(form.get('captionAr') || '',200,true);
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function' || !file.size || file.size > MAX_VIDEO) problem('Fichier invalide ou supérieur à 20 Mo.',413);
    const bytes = new Uint8Array(await file.arrayBuffer()); const type = imageType(bytes)||videoType(bytes);
    if (!type) {if(file.size>MAX_IMAGE)problem('Image : 8 Mo maximum. Vidéo : MP4/WebM, 20 Mo maximum.',413);problem('Formats acceptés : JPG, PNG, WebP, MP4 et WebM.');}
    if(type[0].startsWith('image/')&&file.size>MAX_IMAGE)problem('Image : 8 Mo maximum.',413);
    const id = crypto.randomUUID(); const key = `${service}/${id}.${type[1]}`;
    const photoUrl = `/media/${key}`;
    await storeMedia(env,key,bytes,type[0]);
    try {
      await env.DB.prepare('INSERT INTO photos (id,service,object_key,url,caption_fr,caption_ar,published,sort_order,bytes,created_at) VALUES (?,?,?,?,?,?,?,0,?,?)').bind(id,service,'cloudinary:'+key,photoUrl,captionFr,captionAr,form.get('published') === 'true' ? 1 : 0,file.size,Date.now()).run();
    } catch (error) { await deleteMedia(env,key); throw error; }
    await log(env,`${type[0].startsWith('video/')?'Vidéo ajoutée au service':'Photo ajoutée au service'} ${service}`); return json({ ok: true,id },201);
  }
  const photoId = path.match(/^\/api\/admin\/photos\/([a-z0-9-]+)$/)?.[1];
  if (photoId && ['PUT','DELETE'].includes(request.method)) {
    const photo = await env.DB.prepare('SELECT * FROM photos WHERE id = ?').bind(photoId).first();
    if (!photo) problem('Photo introuvable.',404);
    // Reset a selected cover before hiding or deleting the photo.
    const body = request.method === 'PUT' ? await bodyJSON(request) : null;
    if (body) {
      if (typeof body.published !== 'boolean' || !Number.isInteger(body.sortOrder) || Math.abs(body.sortOrder) > 10000) problem('Publication ou ordre invalide.');
      body.captionFr=text(body.captionFr,200,true); body.captionAr=text(body.captionAr,200,true);
    }
    if (!body || body.published === false) {
      const current = await env.DB.prepare('SELECT data FROM services WHERE id = ?').bind(photo.service).first();
      if (current) { const data = JSON.parse(current.data); if (data.image === photo.url) { delete data.image; await env.DB.prepare('UPDATE services SET data = ?,updated_at = ? WHERE id = ?').bind(JSON.stringify(data),Date.now(),photo.service).run(); } }
    }
    if (request.method === 'PUT') {
      if (typeof body.published !== 'boolean' || !Number.isInteger(body.sortOrder) || Math.abs(body.sortOrder) > 10000) problem('Publication ou ordre invalide.');
      await env.DB.prepare('UPDATE photos SET caption_fr=?,caption_ar=?,published=?,sort_order=? WHERE id=?').bind(text(body.captionFr,200,true),text(body.captionAr,200,true),body.published ? 1 : 0,body.sortOrder,photoId).run();
    } else {
      if (photo.object_key) {
        if (!photo.object_key.startsWith('cloudinary:')) problem('Cette photo utilise un ancien stockage : migration nécessaire.',409);
        await deleteMedia(env,photo.object_key.slice('cloudinary:'.length));
      }
      await env.DB.prepare('DELETE FROM photos WHERE id=?').bind(photoId).run();
    }
    await log(env,`${/\.(mp4|webm)$/.test(photo.url)?'Vidéo':'Photo'} ${request.method === 'DELETE' ? 'supprimée' : 'mise à jour'} (${photo.service})`); return json({ ok: true });
  }
  problem('Route introuvable.',404);
}
async function media(request, env, url) {
  if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405});
  if (!env.DB || !storageConfigured(env)) return new Response(null,{status:404});
  const key = url.pathname.slice('/media/'.length);
  if (!/^[a-z]+\/[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm)$/.test(key)) return new Response(null,{status:404});
  const row = await env.DB.prepare('SELECT published FROM photos WHERE object_key=?').bind('cloudinary:'+key).first();
  if (!row) return new Response(null,{status:404});
  if (!row.published) { try { await authenticated(request,env); } catch { return new Response(null,{status:404}); } }
  const range=request.headers.get('Range');
  if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))return new Response(null,{status:416});
  const object = await getMedia(env,key,range); if (!object) return new Response(null,{status:404});
  const headers = new Headers({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" });
  if(object.contentType)headers.set('Content-Type',object.contentType);
  headers.set('Accept-Ranges','bytes');
  if(object.contentRange&&/^bytes (?:\d+-\d+|\*)\/\d+$/.test(object.contentRange))headers.set('Content-Range',object.contentRange);
  if (request.method === 'HEAD') { await object.body?.cancel(); return new Response(null,{headers,status:object.status||200}); }
  return new Response(object.body,{headers,status:object.status||200});
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(request,env,url);
      if (url.pathname.startsWith('/media/')) return await media(request,env,url);
      const response = await env.ASSETS.fetch(request);
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin.') || url.pathname.includes('admin.')) {
        const headers = new Headers(response.headers); headers.set('Cache-Control','no-store'); headers.set('X-Robots-Tag','noindex, nofollow'); headers.set('X-Frame-Options','DENY');
        headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
        return new Response(response.body,{status:response.status,headers});
      }
      return response;
    } catch (error) {
      if (!error.status) console.error('CMS request failed', url.pathname, error.message);
      return json({ error: error.status ? error.message : 'Service temporairement indisponible. Réessayez plus tard.',...(error.publicCode?{code:error.publicCode}:{}) },error.status || 503);
    }
  }
};
