// Render local publishing artwork and the compiled UI with demo host messages.
// Windows/Edge only. This does not launch or control a Figma session.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const work = join(root, 'work', 'publish');
const assets = join(root, 'docs', 'private-notes', 'publish', 'assets');
const edge =
  process.env.PN_EDGE_PATH ??
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!existsSync(edge)) throw new Error('Edge not found; set PN_EDGE_PATH.');
for (const directory of [work, join(work, 'out'), join(assets, 'ui-shots')]) {
  mkdirSync(directory, { recursive: true });
}
const run = mkdtempSync(join(work, 'render-'));
const baseArgs = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
];
const files = [];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function runEdge(args) {
  return execFileSync(
    edge,
    [
      ...baseArgs,
      `--user-data-dir=${mkdtempSync(join(run, 'profile-'))}`,
      ...args,
    ],
    {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
}

function record(path, width, height) {
  const bytes = readFileSync(path);
  if (
    bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
    bytes.readUInt32BE(16) !== width ||
    bytes.readUInt32BE(20) !== height
  ) {
    throw new Error(`Unexpected PNG size: ${path}`);
  }
  files.push({
    file: path.slice(assets.length + 1).replaceAll('\\', '/'),
    width,
    height,
    bytes: bytes.length,
    sha256: sha256(bytes),
  });
}

function screenshot(name, source, width, height, scale, destination) {
  const output = join(run, `${name}.png`);
  runEdge([
    `--screenshot=${output}`,
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${scale}`,
    '--virtual-time-budget=15000',
    pathToFileURL(source).href,
  ]);
  // A unique run directory prevents silently accepting old screenshots.
  record(output, width * scale, height * scale);
  files.pop();
  copyFileSync(output, destination);
  record(destination, width * scale, height * scale);
  console.log(`Rendered ${name}`);
}

await import('./make-harness.mjs');
const states = {
  list: [520, 640],
  empty: [520, 480],
  search: [520, 640],
  create: [520, 640],
  edit: [520, 560],
  picker: [520, 760],
  bulk: [520, 640],
  export: [520, 640],
  scope: [520, 520],
  del: [520, 640],
  conflict: [520, 640],
};
for (const [name, [width, height]] of Object.entries(states)) {
  const destination = join(assets, 'ui-shots', `${name}.png`);
  screenshot(
    name,
    join(work, 'shots', `${name}.html`),
    width,
    height,
    2,
    destination,
  );
  copyFileSync(destination, join(work, 'out', `${name}.png`));
}

await import('./make-pages.mjs');
for (const name of [
  'cover',
  'slide-1',
  'slide-2',
  'slide-3',
  'slide-4',
  'slide-5',
]) {
  screenshot(
    name,
    join(work, 'pages', `${name}.html`),
    1920,
    1080,
    1,
    join(assets, `${name}.png`),
  );
}

const svg = readFileSync(join(assets, 'icon.svg'));
for (const size of [128, 512]) {
  const page = join(run, `icon-${size}.html`);
  const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  writeFileSync(
    page,
    `<!doctype html><canvas id="c" width="${size}" height="${size}"></canvas><script>
    const img = new Image();
    img.onload = () => {
      const canvas = document.getElementById('c');
      canvas.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
      document.body.textContent = 'DATAURL:' + canvas.toDataURL('image/png');
    };
    img.src = ${JSON.stringify(uri)};
  </script>`,
  );
  const dom = runEdge([
    '--dump-dom',
    '--virtual-time-budget=8000',
    pathToFileURL(page).href,
  ]);
  const result = dom.match(/DATAURL:data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (!result) throw new Error('Icon render did not produce a PNG.');
  const output = join(assets, `icon-${size}.png`);
  writeFileSync(output, Buffer.from(result[1], 'base64'));
  record(output, size, size);
}

writeFileSync(
  join(assets, 'provenance.json'),
  JSON.stringify(
    {
      product: 'Personal Notes & Tasks',
      method:
        'Compiled production UI in headless Edge with fixture Plugin Main messages; artwork is a composed illustration, not a live Figma screenshot.',
      bundleSha256: sha256(readFileSync(join(root, 'dist', 'index.html'))),
      pluginMainSha256: sha256(readFileSync(join(root, 'dist', 'code.js'))),
      fixtureSha256: sha256(readFileSync(join(here, 'make-harness.mjs'))),
      artworkSourceSha256: sha256(readFileSync(join(here, 'make-pages.mjs'))),
      iconSourceSha256: sha256(svg),
      files,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Verified ${files.length} PNGs. Publishing assets are ready.`);
