// Signed, authenticated Cloudinary storage. No public/unsigned upload preset.
const encoder = new TextEncoder();
const hex = buffer => [...new Uint8Array(buffer)].map(n => n.toString(16).padStart(2, '0')).join('');
function unavailable(message = 'Stockage Cloudinary indisponible. Réessayez plus tard.') {
  throw Object.assign(new Error(message), { status: 503 });
}
export function storageConfigured(env) {
  return typeof env.CLOUDINARY_CLOUD_NAME === 'string'
    && /^[a-zA-Z0-9_-]{1,100}$/.test(env.CLOUDINARY_CLOUD_NAME)
    && Boolean(env.CLOUDINARY_API_KEY) && Boolean(env.CLOUDINARY_API_SECRET);
}
async function signed(env, params) {
  if (!storageConfigured(env)) unavailable('Le stockage Cloudinary doit être configuré.');
  // Cloudinary API signature: sorted nonblank parameters + secret, SHA-1 hex.
  const values = Object.fromEntries(Object.entries(params).filter(([,value]) => value !== undefined && value !== null && value !== ''));
  const payload = Object.keys(values).sort().map(key => `${key}=${String(values[key]).replace(/&/g, '%26')}`).join('&');
  const signature = hex(await crypto.subtle.digest('SHA-1', encoder.encode(payload + env.CLOUDINARY_API_SECRET)));
  return { ...values, api_key: env.CLOUDINARY_API_KEY, signature };
}
function endpoint(env, action) {
  return `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/${action}`;
}
function reference(key) {
  const match = key.match(/^([a-z]+)\/([a-f0-9-]{36})\.(jpg|png|webp)$/);
  if (!match) unavailable('Référence de photo invalide.');
  return { publicId: `ep-fayak/${match[1]}/${match[2]}`, format: match[3] };
}
async function post(env, action, params, file) {
  const fields = await signed(env, { ...params, timestamp: Math.floor(Date.now() / 1000) });
  const body = new FormData();
  for (const [key,value] of Object.entries(fields)) body.set(key, String(value));
  if (file) body.set('file', file.blob, file.name);
  let response;
  try { response = await fetch(endpoint(env,action), { method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(30000) }); }
  catch { unavailable(); }
  let result;
  try { result = await response.json(); } catch { unavailable(); }
  if (!response.ok) unavailable(response.status === 401 || response.status === 403
    ? 'Connexion Cloudinary refusée. Vérifiez les clés et le nom du cloud dans les paramètres du Worker.'
    : 'Cloudinary a refusé l’opération. Vérifiez le format de la photo et les limites de votre compte.');
  return result;
}
export async function storePhoto(env, key, bytes, contentType) {
  const { publicId,format } = reference(key);
  const result = await post(env,'upload',{public_id: publicId, type: 'authenticated', format, overwrite: false},{blob: new Blob([bytes],{type:contentType}), name: `photo.${format}`});
  if (result.public_id !== publicId || result.type !== 'authenticated' || result.resource_type !== 'image' || result.format !== format) unavailable('Réponse Cloudinary inattendue : la photo n’a pas été enregistrée dans la galerie.');
}
export async function deletePhoto(env, key) {
  const { publicId } = reference(key);
  const result = await post(env,'destroy',{public_id: publicId, type: 'authenticated', invalidate: true});
  if (!['ok','not found'].includes(result.result)) unavailable('La suppression Cloudinary n’a pas été confirmée. Réessayez.');
}
export async function getPhoto(env, key) {
  const { publicId,format } = reference(key);
  const timestamp = Math.floor(Date.now() / 1000);
  // Official private_download_url API. The signed URL stays on the server.
  const params = await signed(env,{public_id:publicId,format,type:'authenticated',attachment:false,timestamp,expires_at:timestamp+60});
  const url = endpoint(env,'download')+'?'+new URLSearchParams(params);
  let response;
  try { response = await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(30000)}); }
  catch { unavailable(); }
  if (response.status === 404) return null;
  if (!response.ok) unavailable();
  const type = response.headers.get('Content-Type')?.split(';')[0].trim();
  const expected = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
  if (type !== expected) { await response.body?.cancel(); unavailable('Format de livraison Cloudinary inattendu.'); }
  return { body:response.body, contentType:expected };
}
