// Builds the cover and carousel slide pages (HTML) for the Figma Community
// listing. All images use 1920x1080, including the thumbnail.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const pages = join(root, 'work', 'publish', 'pages');
mkdirSync(pages, { recursive: true });

const iconSvg = readFileSync(
  join(root, 'docs', 'private-notes', 'publish', 'assets', 'icon.svg'),
  'utf8',
);

const CSS = String.raw`
* { box-sizing: border-box; margin: 0; }
.brand .icon, .win__bar .icon { display: inline-flex; }
.brand .icon svg, .win__bar .icon svg { width: 100%; height: 100%; display: block; }
html, body { height: 100%; }
body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: #1e1e1e;
  color: #fff;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.scene {
  width: 1920px; height: 1080px; position: relative;
  background:
    radial-gradient(1200px 700px at 78% 42%, rgba(13,153,255,0.10), rgba(13,153,255,0) 62%),
    #1e1e1e;
}
.scene--cover { height: 1080px; }
.privacy-note { margin-top: 32px; font-size: 23px; line-height: 1.4; color: #b9b9b9; max-width: 48ch; }
.dots {
  position: absolute; inset: 0;
  background-image: radial-gradient(rgba(255,255,255,0.055) 1.3px, transparent 1.3px);
  background-size: 40px 40px;
}
.left { position: absolute; left: 150px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; width: 860px; }
.cover .left { width: 820px; }

.brand { display: flex; align-items: center; gap: 26px; margin-bottom: 34px; }
.brand .icon { width: 96px; height: 96px; }
.brand .name { font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 600; font-size: 46px; letter-spacing: -0.01em; color: #f0f0f0; }

h1 {
  font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 600;
  font-size: 92px; line-height: 1.04; letter-spacing: -0.025em;
  margin-bottom: 30px;
}
.slide h1 { font-size: 76px; max-width: 15ch; }
.sub { font-size: 31px; line-height: 1.42; color: #b9b9b9; max-width: 33ch; }
.slide .sub { font-size: 27px; max-width: 30ch; }
.cover .brandline {
  font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 600; font-size: 96px;
  line-height: 1.02; letter-spacing: -0.025em; margin: 6px 0 30px;
}
.features { display: flex; flex-direction: column; gap: 22px; margin-top: 58px; }
.feature { display: flex; align-items: center; gap: 18px; font-size: 25px; color: #cfcfcf; }
.feature svg { flex: none; }

/* Figma-canvas ghost frames behind the plugin window */
.stage { position: absolute; right: 0; top: 0; bottom: 0; width: 900px; }
.ghost {
  position: absolute; border: 2px solid rgba(255,255,255,0.14);
  border-radius: 4px; background: rgba(255,255,255,0.025);
}
.ghost .tag {
  position: absolute; top: -34px; left: -2px;
  font-size: 19px; color: rgba(255,255,255,0.5);
}
.ghost--sel { border-color: rgba(13,153,255,0.85); border-style: solid; }
.ghost--sel .tag { color: #4db2ff; }
.ghost--sel .handle {
  position: absolute; width: 10px; height: 10px; background: #0d99ff;
  border: 2px solid #fff; border-radius: 2px;
}
.handle.tl { top: -6px; left: -6px; } .handle.tr { top: -6px; right: -6px; }
.handle.bl { bottom: -6px; left: -6px; } .handle.br { bottom: -6px; right: -6px; }

/* Plugin window mock */
.win {
  position: absolute; border-radius: 12px; overflow: hidden;
  background: #2c2c2c;
  box-shadow: 0 40px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08);
}
.win__bar {
  height: 46px; display: flex; align-items: center; gap: 10px;
  padding: 0 16px; background: #383838;
  font-size: 15px; font-weight: 500; color: #e6e6e6;
}
.win__bar .icon { width: 20px; height: 20px; }
.win__bar .sp { flex: 1; }
.win__bar .x { color: #9a9a9a; font-size: 18px; }
.win img { display: block; width: 100%; }
`;

const TARGET = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="8.5" stroke="#0d99ff" stroke-width="2"/><circle cx="13" cy="13" r="3" fill="#0d99ff"/></svg>`;
const OFFNET = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none"><rect x="3" y="5" width="20" height="6.5" rx="2" stroke="#0d99ff" stroke-width="2"/><rect x="3" y="14.5" width="20" height="6.5" rx="2" stroke="#0d99ff" stroke-width="2"/><circle cx="18.5" cy="8.2" r="1.3" fill="#0d99ff"/><circle cx="18.5" cy="17.7" r="1.3" fill="#0d99ff"/><path d="M4 23 22 3" stroke="#0d99ff" stroke-width="2" stroke-linecap="round"/></svg>`;
const TASKS = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none"><rect x="4" y="4" width="18" height="18" rx="5" stroke="#0d99ff" stroke-width="2"/><path d="M8.5 13.2 11.6 16.3 17.8 9.8" stroke="#0d99ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function win(shot, w, top, right) {
  return `
  <div class="win" style="width:${w}px; top:${top}px; right:${right}px;">
    <div class="win__bar">
      <span class="icon">${iconSvg}</span>
      <span>Personal Notes & Tasks</span>
      <span class="sp"></span>
      <span class="x">&#10005;</span>
    </div>
    <img src="../out/${shot}" />
  </div>`;
}

function page(body, cls) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body class="${cls}"><div class="scene ${cls === 'cover' ? 'scene--cover' : ''}">
<div class="dots"></div>${body}</div></body></html>`;
}

const ghosts = `
  <div class="ghost" style="left:10px; top:110px; width:300px; height:190px;"><span class="tag">Order summary</span></div>
  <div class="ghost ghost--sel" style="left:250px; top:170px; width:330px; height:400px;">
    <span class="tag">Payment methods</span>
    <span class="handle tl"></span><span class="handle tr"></span>
    <span class="handle bl"></span><span class="handle br"></span>
  </div>
  <div class="ghost" style="left:40px; top:430px; width:260px; height:250px;"><span class="tag">Delivery options</span></div>`;

// ------------------------------------------------------------- cover
writeFileSync(
  join(pages, 'cover.html'),
  page(
    `
  <div class="left">
    <div class="brand"><span class="icon">${iconSvg}</span><span class="name">Personal Notes & Tasks</span></div>
    <p class="sub">Keep design reminders and tasks in your Figma file, organized by file, page, and frame.</p>
    <div class="features">
      <div class="feature">${TARGET} Attach notes to the whole file, a page, or any frame</div>
      <div class="feature">${TASKS} Notes and tasks without comments or canvas layers</div>
      <div class="feature">${OFFNET} No external account, analytics, or plugin backend</div>
    </div>
    <p class="privacy-note">Your account’s records in the plugin. Stored in the file, not encrypted.</p>
  </div>
  <div class="stage">
    ${ghosts}
    ${win('list.png', 460, 235, 60)}
  </div>
`,
    'cover',
  ),
);

// ------------------------------------------------------------- slides
// Height/width of each raw shot (1040x1280 for most, 1040x1040 for scope).
const RATIOS = { 'scope.png': 1.0, 'picker.png': 1520 / 1040 };
const ratioOf = (shot) => RATIOS[shot] ?? 1280 / 1040;

const slides = [
  {
    file: 'slide-1.html',
    shot: 'list.png',
    h1: 'Every note lives where the work happens',
    sub: 'One grouped list: the whole file, each page, and the frames inside it — with counters and collapsible groups.',
  },
  {
    file: 'slide-2.html',
    shot: 'scope.png',
    h1: 'The notes you need, where you need them',
    sub: '“Current selection” follows the frame you work in — including notes on frames nested inside it.',
  },
  {
    file: 'slide-3.html',
    shot: 'create.png',
    h1: 'Choose where a note belongs',
    sub: 'Pick the target once — the file, a page, or a frame — then write. Rebind later if the layout moves.',
  },
  {
    file: 'slide-4.html',
    shot: 'bulk.png',
    h1: 'Select, act, hand off',
    sub: 'Bulk-select notes to close, reopen, move, or delete them — or copy the selection as clean Markdown.',
  },
  {
    file: 'slide-5.html',
    shot: 'conflict.png',
    h1: 'Review conflicting edits',
    sub: 'When a stale edit is detected, compare your draft with the stored version before saving again.',
  },
];

for (const s of slides) {
  const w = 480;
  const winH = 46 + w * ratioOf(s.shot);
  const top = Math.round((1080 - winH) / 2);
  writeFileSync(
    join(pages, s.file),
    page(
      `
    <div class="left">
      <h1>${s.h1}</h1>
      <p class="sub">${s.sub}</p>
    </div>
    <div class="stage">
      ${ghosts}
      ${win(s.shot, w, top, 110)}
    </div>
  `,
      'slide',
    ),
  );
}
console.log('pages written');
