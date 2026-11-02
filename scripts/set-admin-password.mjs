// Run only in your terminal. Never send this password through chat or commit it.
import readline from 'node:readline';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';

if (!process.stdin.isTTY) throw new Error('Utilisez un terminal interactif pour saisir le mot de passe en privé.');
const local = process.argv.includes('--local');
function readPassword(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt);
    readline.emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
    let value = '';
    const listener = (str,key={}) => {
      if (key.ctrl && key.name === 'c') process.exit(130);
      if (key.name === 'return') {process.stdin.removeListener('keypress',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value)}
      else if (key.name === 'backspace') value=value.slice(0,-1);
      else if (!key.ctrl && !key.meta && str) value+=str;
    };
    process.stdin.on('keypress',listener);
  });
}
const password = await readPassword('Nouveau mot de passe administrateur (14 caractères minimum, saisie masquée) : ');
if (password.length < 14 || password.length > 256) throw new Error('Longueur : entre 14 et 256 caractères.');
if (password !== await readPassword('Confirmez le mot de passe : ')) throw new Error('Les mots de passe ne correspondent pas.');
const salt=randomBytes(16);const derived=pbkdf2Sync(password,salt,100000,32,'sha256');
const value=`pbkdf2$100000$${salt.toString('base64')}$${derived.toString('base64')}`;
if (local) {
  const path='.dev.vars.local';
  try { await access(path); throw new Error('Le fichier .dev.vars.local existe. Conservez sa configuration et utilisez un fichier séparé avant de recommencer.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(path,`ADMIN_PASSWORD_HASH='${value}'\n`,{mode:0o600,flag:'wx'});
  console.log('Mot de passe local configuré dans un fichier ignoré par Git.');
} else {
  const child=spawn(process.platform==='win32'?'npx.cmd':'npx',['wrangler','secret','put','ADMIN_PASSWORD_HASH'],{stdio:['pipe','inherit','inherit']});
  child.stdin.end(value+'\n');
  const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject)});
  if(code!==0)process.exit(code||1);
  console.log('Mot de passe envoyé au stockage secret Cloudflare.');
}
