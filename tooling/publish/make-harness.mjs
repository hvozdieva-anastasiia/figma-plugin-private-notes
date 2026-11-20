// Builds screenshot harness pages: the real dist/index.html plus an injected
// stub that plays the role of Plugin Main (fixture notes, context, answers).
// Usage: node make-harness.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const distHtml = readFileSync(join(root, 'dist', 'index.html'), 'utf8');

const STUB = String.raw`
<script>
// ---- Screenshot stub: pretends to be Plugin Main ------------------------------
(function () {
  var params = new URLSearchParams(location.search);
  var STATE = params.get('state') || 'list';

  var PAGE1 = { id: '1:2', name: 'Checkout flow' };
  var PAGE2 = { id: '2:1', name: 'Onboarding' };
  var PAGE3 = { id: '3:7', name: 'Components' };

  function fileTarget() {
    return { type: 'file', id: null, pageId: null, nameSnapshot: null, pageNameSnapshot: null };
  }
  function pageTarget(page) {
    return { type: 'page', id: page.id, pageId: page.id, nameSnapshot: page.name, pageNameSnapshot: page.name };
  }
  function frameTarget(id, name, page) {
    return { type: 'frame', id: id, pageId: page.id, nameSnapshot: name, pageNameSnapshot: page.name };
  }
  var T = Date.parse('2026-11-10T09:00:00Z');
  function note(id, kind, status, target, text, ageHours) {
    var t = T + (ageHours || 0) * 3600000;
    return {
      schemaVersion: 1, id: id, authorId: 'demo', kind: kind, text: text,
      status: status, target: target, createdAt: t, updatedAt: t, revision: 1,
    };
  }

  var NOTES = [
    note('n-file-1', 'task', 'open', fileTarget(),
      'Bring the refund edge cases to Friday’s design review', 1),
    note('n-page-1', 'note', null, pageTarget(PAGE1),
      'Empty-state copy still waiting on Legal — chase before handoff', 5),
    note('n-f105-1', 'task', 'open', frameTarget('10:5', 'Payment methods', PAGE1),
      'Ask backend: can a failed 3-D Secure be retried in place?', 3),
    note('n-f105-2', 'task', 'done', frameTarget('10:5', 'Payment methods', PAGE1),
      'Swap the old Apple Pay glyph for the current one', 30),
    note('n-f108-1', 'note', null, frameTarget('10:8', 'Card list item', PAGE1),
      'Corner radius is 4 dp here, not 8 dp — match the spec sheet', 8),
    note('n-f112-1', 'note', null, frameTarget('11:2', 'Order summary', PAGE1),
      'Discount field overflows at 320 px — wrap or truncate', 12),
    note('n-page-2', 'task', 'open', pageTarget(PAGE2),
      'Check contrast on the step dots (aim for AA)', 20),
    note('n-f204-1', 'note', null, frameTarget('20:4', 'Welcome carousel', PAGE2),
      'Lottie file is 1.8 MB — compress or replace before ship', 26),
    note('n-lost-1', 'note', null, frameTarget('55:9', 'Header experiment v2', PAGE1),
      'Leftover idea: re-run the sticky header test with the new nav', 90),
  ];

  var CONTEXT = {
    page: { id: PAGE1.id, name: PAGE1.name },
    selection: [{ id: '10:5', type: 'FRAME', name: 'Payment methods' }],
    selectionCount: 1,
    focusFrame: { id: '10:5', name: 'Payment methods' },
  };

  var RESOLUTIONS = {
    'page:1:2': { type: 'page', id: '1:2', state: 'available', name: 'Checkout flow', pageId: '1:2', pageName: 'Checkout flow' },
    'page:2:1': { type: 'page', id: '2:1', state: 'available', name: 'Onboarding', pageId: '2:1', pageName: 'Onboarding' },
    'page:3:7': { type: 'page', id: '3:7', state: 'available', name: 'Components', pageId: '3:7', pageName: 'Components' },
    'frame:10:5': { type: 'frame', id: '10:5', state: 'available', name: 'Payment methods', pageId: '1:2', pageName: 'Checkout flow', ancestorFrameIds: [] },
    'frame:10:8': { type: 'frame', id: '10:8', state: 'available', name: 'Card list item', pageId: '1:2', pageName: 'Checkout flow', ancestorFrameIds: ['10:5'] },
    'frame:11:2': { type: 'frame', id: '11:2', state: 'available', name: 'Order summary', pageId: '1:2', pageName: 'Checkout flow', ancestorFrameIds: [] },
    'frame:20:4': { type: 'frame', id: '20:4', state: 'available', name: 'Welcome carousel', pageId: '2:1', pageName: 'Onboarding', ancestorFrameIds: [] },
    'frame:55:9': { type: 'frame', id: '55:9', state: 'missing' },
  };

  var PAGES = [
    { type: 'page', id: '1:2', pageId: '1:2', name: 'Checkout flow', pageName: 'Checkout flow' },
    { type: 'page', id: '2:1', pageId: '2:1', name: 'Onboarding', pageName: 'Onboarding' },
    { type: 'page', id: '3:7', pageId: '3:7', name: 'Components', pageName: 'Components' },
  ];
  var FRAMES = {
    '1:2': [
      { type: 'frame', id: '10:5', pageId: '1:2', name: 'Payment methods', pageName: 'Checkout flow' },
      { type: 'frame', id: '11:2', pageId: '1:2', name: 'Order summary', pageName: 'Checkout flow' },
      { type: 'frame', id: '11:9', pageId: '1:2', name: 'Delivery options', pageName: 'Checkout flow' },
    ],
    '2:1': [
      { type: 'frame', id: '20:4', pageId: '2:1', name: 'Welcome carousel', pageName: 'Onboarding' },
      { type: 'frame', id: '20:8', pageId: '2:1', name: 'Permissions primer', pageName: 'Onboarding' },
    ],
    '3:7': [],
  };

  var COMMAND_TYPES = {
    READY: 1, REFRESH_NOTES: 1, LIST_TARGETS: 1, CREATE_NOTE: 1, UPDATE_NOTE: 1,
    SET_TASK_STATUS: 1, DELETE_NOTE: 1, REBIND_NOTE: 1, REFRESH_TARGETS: 1,
    FOCUS_NOTE: 1, BULK_DELETE: 1, BULK_SET_STATUS: 1, BULK_REBIND: 1,
    RESIZE_WINDOW: 1, SET_PREFS: 1,
  };

  function initData() {
    return {
      notes: STATE === 'empty' ? [] : NOTES,
      problems: [],
      context: CONTEXT,
      prefs: { scope: 'all' },
    };
  }

  function answer(type, payload) {
    switch (type) {
      case 'READY':
      case 'REFRESH_NOTES':
        return { ok: true, value: initData() };
      case 'REFRESH_TARGETS': {
        var resolutions = (payload.targets || []).map(function (ref) {
          return RESOLUTIONS[ref.type + ':' + ref.id] || { type: ref.type, id: ref.id, state: 'missing' };
        });
        return { ok: true, value: { resolutions: resolutions } };
      }
      case 'LIST_TARGETS': {
        var options = payload.kind === 'page'
          ? PAGES
          : (FRAMES[payload.pageId] || []);
        var q = (payload.query || '').trim().toLowerCase();
        if (q) options = options.filter(function (o) { return o.name.toLowerCase().indexOf(q) !== -1; });
        return { ok: true, value: { options: options, truncated: false } };
      }
      case 'UPDATE_NOTE':
        if (STATE === 'conflict') {
          return { ok: false, code: 'REVISION_CONFLICT', message: 'expected revision 1, stored 2' };
        }
        return { ok: true, value: NOTES[0] };
      case 'SET_PREFS':
        return { ok: true, value: payload };
      case 'RESIZE_WINDOW':
        return { ok: true, value: payload };
      case 'CREATE_NOTE':
      case 'SET_TASK_STATUS':
      case 'DELETE_NOTE':
      case 'REBIND_NOTE':
      case 'FOCUS_NOTE':
        return { ok: true, value: {} };
      case 'BULK_DELETE':
      case 'BULK_SET_STATUS':
      case 'BULK_REBIND':
        return { ok: true, value: { results: [] } };
      default:
        return { ok: false, code: 'INVALID_COMMAND', message: 'stub' };
    }
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object' || !('pluginMessage' in data)) return;
    var msg = data.pluginMessage;
    if (!msg || typeof msg !== 'object' || !COMMAND_TYPES[msg.type]) return;
    var result = answer(msg.type, msg.payload || {});
    window.postMessage({
      pluginMessage: {
        protocolVersion: 1,
        type: 'RESPONSE',
        command: msg.type,
        requestId: msg.requestId,
        runId: msg.runId,
        result: result,
      },
    }, '*');
  });

  // ---- Driver: puts the real UI into the state the shot needs -----------------

  function setValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function byText(tag, text) {
    return $all(tag).find(function (el) { return el.textContent.trim() === text; });
  }
  function waitFor(sel, cb, tries) {
    var n = tries || 200;
    var timer = setInterval(function () {
      var el = $(sel);
      if (el || --n <= 0) { clearInterval(timer); cb(el); }
    }, 25);
  }
  function click(selOrEl) {
    var el = typeof selOrEl === 'string' ? $(selOrEl) : selOrEl;
    if (el) el.click();
    return el;
  }

  var DRIVERS = {
    list: function () {},
    empty: function () {},
    search: function () {
      waitFor('.search input', function (el) { if (el) setValue(el, '3-D'); });
    },
    create: function () {
      waitFor('[aria-label="Add note"]', function (btn) {
        if (!btn) return;
        btn.click();
        waitFor('.editor textarea', function (area) {
          if (area) setValue(area, 'Prototype the retry banner before Thursday — reuse the error toast styles');
        });
      });
    },
    edit: function () {
      waitFor('[aria-label="Edit note"]', function (btn) { if (btn) btn.click(); });
    },
    picker: function () {
      waitFor('[aria-label="Add note"]', function (btn) {
        if (!btn) return;
        btn.click();
        waitFor('.editor select', function (sel) {
          if (!sel) return;
          setValue(sel, '__other__');
        });
      });
    },
    bulk: function () {
      waitFor('.note', function () {
        var selectBtn = byText('button', 'Select');
        if (selectBtn) selectBtn.click();
        setTimeout(function () {
          var boxes = $all('.note .check--row');
          if (boxes[1]) boxes[1].click();
          if (boxes[2]) boxes[2].click();
          if (boxes[3]) boxes[3].click();
        }, 150);
      });
    },
    export: function () {
      waitFor('.note', function () {
        var selectBtn = byText('button', 'Select');
        if (selectBtn) selectBtn.click();
        setTimeout(function () {
          var boxes = $all('.note .check--row');
          if (boxes[2]) boxes[2].click();
          if (boxes[3]) boxes[3].click();
          var copy = $('[aria-label="Copy as Markdown"]');
          if (copy) copy.click();
        }, 150);
      });
    },
    scope: function () {
      waitFor('.note', function () {
        var btn = byText('button', 'Current selection');
        if (btn) btn.click();
      });
    },
    del: function () {
      waitFor('[aria-label="Delete note"]', function (btn) { if (btn) btn.click(); });
    },
    conflict: function () {
      waitFor('[aria-label="Edit note"]', function (btn) {
        if (!btn) return;
        btn.click();
        waitFor('.editor textarea', function (area) {
          if (!area) return;
          setValue(area, 'Confirm retry UX with backend — they said it works in place now');
          setTimeout(function () {
            var save = byText('button', 'Save');
            if (save) save.click();
          }, 100);
        });
      });
    },
  };

  window.addEventListener('load', function () {
    setTimeout(function () {
      var driver = DRIVERS[STATE];
      if (driver) driver();
    }, 300);
  });
})();
</script>
`;

// Inject the stub right after <head ...> so it runs before the module bundle.
const marker = '<head>';
const idx = distHtml.indexOf(marker);
if (idx === -1) throw new Error('no <head> marker');
const html =
  distHtml.slice(0, idx + marker.length) +
  '\n' +
  STUB +
  distHtml.slice(idx + marker.length);

const states = [
  'list',
  'empty',
  'search',
  'create',
  'edit',
  'picker',
  'bulk',
  'export',
  'scope',
  'del',
  'conflict',
];
const outDir = join(root, 'work', 'publish', 'shots');
mkdirSync(outDir, { recursive: true });
for (const state of states) {
  writeFileSync(
    join(outDir, `${state}.html`),
    html.replaceAll(
      `var STATE = params.get('state') || 'list';`,
      `var STATE = '${state}';`,
    ),
  );
}
console.log('harness pages:', states.join(', '));
