import { cp, mkdir, readdir, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const publicAssets = (await readdir(resolve(root,'assets'))).filter(name=>/\.(js|css)$/.test(name)).sort();
const hash = createHash('sha256');
for (const name of publicAssets) { hash.update(name); hash.update(await readFile(resolve(root,'assets',name))); }
const assetVersion = hash.digest('hex').slice(0,12);
let revision = process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || '';
if (!/^[a-f0-9]{7,40}$/.test(revision)) {
  try { revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); }
  catch { revision='unversioned'; }
}
// Only deploy public website files, never the checkout, tooling or attachments.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of await readdir(root)) {
  if (name.endsWith('.html')) {
    const html=await readFile(resolve(root,name),'utf8');
    const versioned=html.replace(/((?:src|href)="assets\/[^"?]+\.(?:js|css))(?:\?v=[^" ]*)?"/g,`$1?v=${assetVersion}"`);
    await writeFile(resolve(output,name),versioned);
  } else if (['robots.txt', 'sitemap.xml'].includes(name)) {
    await copyFile(resolve(root, name), resolve(output, name));
  }
}
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true });
await writeFile(resolve(output,'version.json'),JSON.stringify({revision,assetVersion,builtAt:new Date().toISOString(),quoteMode:'direct'},null,2)+'\n');
console.log(`Website prepared in dist/ (assets ${assetVersion})`);
