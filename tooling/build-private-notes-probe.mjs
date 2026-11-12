// Builds the stage 2 Private Notes API probe into experiments/private-notes/dist.
// Uses the real plugin ID from the root manifest.json (read-only) and never
// writes to the product's root dist or manifest.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const source = new URL('experiments/private-notes/', root);
const destination = new URL('experiments/private-notes/dist/', root);

// ID of the archived Comment Link Probe: it must never be reused here.
const OLD_PROBE_ID = '1702381072003724730';

const rootManifest = JSON.parse(
  await readFile(new URL('manifest.json', root), 'utf8'),
);
const id = rootManifest.id;
if (typeof id !== 'string' || !/^[0-9]+$/.test(id)) {
  throw new Error(
    'Root manifest.json must contain the numeric Figma plugin ID.',
  );
}
if (id === OLD_PROBE_ID) {
  throw new Error('Root manifest.json contains the old Comment Link Probe ID.');
}

await mkdir(destination, { recursive: true });
const common = { absWorkingDir: fileURLToPath(root), bundle: true };

await build({
  ...common,
  entryPoints: ['experiments/private-notes/plugin.ts'],
  outfile: fileURLToPath(new URL('code.js', destination)),
  format: 'iife',
  platform: 'neutral',
  target: 'es2020',
});

const ui = await build({
  ...common,
  entryPoints: ['experiments/private-notes/ui.ts'],
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
});
const script = (ui.outputFiles[0]?.text ?? '').replaceAll(
  '</script',
  '<\\/script',
);
const template = await readFile(new URL('ui.html', source), 'utf8');
const marker = '<!--PROBE_UI_SCRIPT-->';
if (!template.includes(marker)) throw new Error(`ui.html lacks ${marker}`);
await writeFile(
  new URL('ui.html', destination),
  template.replace(marker, () => `<script>\n${script}</script>`),
);

const manifest = {
  name: 'Private Notes — API Probe',
  id,
  api: '1.0.0',
  main: 'code.js',
  ui: 'ui.html',
  editorType: ['figma'],
  documentAccess: 'dynamic-page',
  permissions: ['currentuser'],
  networkAccess: { allowedDomains: ['none'] },
};
await writeFile(
  new URL('manifest.json', destination),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  `Private Notes API probe built with plugin ID ${id}: experiments/private-notes/dist/manifest.json`,
);
