import { cp, mkdir, readdir, rm, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
// Only deploy public website files, never the checkout, tooling or attachments.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of await readdir(root)) {
  if (name.endsWith('.html') || ['robots.txt', 'sitemap.xml'].includes(name)) {
    await copyFile(resolve(root, name), resolve(output, name));
  }
}
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true });
console.log('Website prepared in dist/');
