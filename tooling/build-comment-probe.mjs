import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const destination = new URL(
  'experiments/native-comment-navigation/dist/',
  root,
);
const { values } = parseArgs({ options: { registration: { type: 'string' } } });
const registration = values.registration
  ? resolve(fileURLToPath(root), values.registration)
  : new URL('manifest.json', root);
const original = JSON.parse(await readFile(registration, 'utf8'));
if (original.id !== undefined && !/^[0-9]+$/.test(original.id)) {
  throw new Error(
    'The registration manifest must contain a numeric ID assigned by Figma.',
  );
}

await mkdir(destination, { recursive: true });
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['experiments/native-comment-navigation/plugin.ts'],
  outfile: fileURLToPath(new URL('code.js', destination)),
  bundle: true,
  format: 'iife',
  platform: 'neutral',
  target: 'es2020',
});

const manifest = {
  name: 'Common Structurizer — Comment Link Probe',
  ...(original.id ? { id: original.id } : {}),
  api: '1.0.0',
  main: 'code.js',
  editorType: ['figma'],
  documentAccess: 'dynamic-page',
  networkAccess: { allowedDomains: ['none'] },
  parameterOnly: true,
  parameters: [
    {
      name: 'Ссылка на комментарий',
      key: 'commentUrl',
      allowFreeform: true,
      description: 'Вставьте ссылку из меню конкретного комментария Figma.',
    },
  ],
};

// Remove stale importable output when the assigned ID is no longer configured.
// Keep both filenames explicit so this never touches the product's manifest.
const { rm } = await import('node:fs/promises');
const filename = original.id ? 'manifest.json' : 'manifest.template.json';
const staleFilename = original.id ? 'manifest.template.json' : 'manifest.json';
await rm(new URL(staleFilename, destination), { force: true });
await writeFile(
  new URL(filename, destination),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  original.id
    ? 'Probe built with the Figma-assigned ID from the selected registration manifest.'
    : 'Probe compiled. Import requires a real Figma-assigned ID; only manifest.template.json was generated.',
);
