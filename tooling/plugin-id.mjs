import { readFile, writeFile } from 'node:fs/promises';
const id = process.argv[2];
if (!id || !/^\d+$/.test(id))
  throw new Error('Usage: pnpm plugin:id <numeric ID assigned by Figma>');
const url = new URL('../manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(url, 'utf8'));
manifest.id = id;
await writeFile(url, JSON.stringify(manifest, null, 2) + '\n');
console.log('Figma plugin ID configured.');
