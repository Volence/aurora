#!/usr/bin/env node
// PALETTE LINE 0: THE WARNING, ON SCREEN, AND THE SHARED FILE ON DISK.
//
// Owner ruling 2026-09-13 (docs/decisions.jsonl `PALETTE-LINE0-BLAST-RADIUS-answered`,
// `write_shared_file`): the top row of an aeon zone's palette saves, "with just a
// warning". The node suite executes the gate, the plan and the report
// (providers/__tests__/palette-line0-gate.test.ts, core/project/aeon/__tests__/
// palette-write-target.test.ts, state/__tests__/aeon-save-shared-palette.test.ts),
// but it cannot render React and it cannot click. This drives the real app:
//
//   1. a line 0 swatch, aimed with REAL CDP mouse events at an integer client
//      pixel (a synthetic `.click()` can be ignored by the app), raises the
//      in-app warning, and the warning's text names the resolved shared file,
//      EVERY zone, and each embed site an INDEPENDENT scan of the copy finds;
//   2. declining (a real click on Cancel) changes nothing: no sliders, the
//      swatch's colour, the dirty flag and the file's bytes all unchanged;
//   3. accepting (a real click), editing one channel with real key events and a
//      real Ctrl+S changes the shared file ON THE COPY, and only the edited
//      entry: same length, every other byte identical, the new word the one
//      derived from the old word and the edit;
//   4. the save's report names the shared file.
//
// A HARNESS MUST NOT ASK THE COMPONENT UNDER TEST WHETHER IT WORKED
// (docs/OVERSEER-REFERENCE.md, Instruments). The file verdict reads the bytes
// off the copy with Node; the expected embed sites come from this file's own
// walk of the copy, not from the app.
//
// ⛔ THE COPY, NEVER THE LIVE AEON TREE. AEON_DIR has NO default: unset, this
// refuses; set to the tree aeon actually lives in, it refuses again. It SAVES
// into the project it opens. Make a copy first:
//   rsync -a --exclude .git --exclude .claude <aeon>/ <tmp>/aeon-copy/
//
// Requires:  VITE_AURORA_DEBUG=1 npx electron-vite build   (in the tree under test)
// Run:       AEON_DIR=<copy> AURORA_BUILT_TREE=<this tree> npm run harness:palette-line0-warning
// Captures:  a per-run temp dir; SHOTS=<abs docs/captures/2026-09-13-palette-line0-warning>
//            refreshes the committed ones (scratchpad/lib/capture-dir.mjs).
//
// WHAT IS NOT DRIVEN, said out loud: slider FOCUS is set with `.focus()` (setup;
// the change itself is real key events), and the live push into a running game
// is not exercised (no emulator; line 0 is never pushed by design, and the
// node suite pins that the push loop starts past it).

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';
import { captureDir } from './lib/capture-dir.mjs';

const PORT = Number(process.env.PORT ?? 9447);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

const aeonOverride = checkoutOverride('aeon');
if (aeonOverride === null) {
  throw new Error(
    'AEON_DIR is unset, and this harness has no honest default: it SAVES into the tree it opens, '
    + 'including the shared player palette, so it must be pointed at a throwaway copy of aeon. Make '
    + `one (e.g. \`rsync -a --exclude .git --exclude .claude ${siblingDefaultPathOrUnresolved('aeon')}/ `
    + '$(mktemp -d)/aeon/`) and set AEON_DIR to it. (empyrean contract/SUITE_PATHS.md, precedence step 4)',
  );
}
const AEONDIR = aeonOverride.value;
if (AEONDIR === siblingDefaultPathOrUnresolved('aeon')) {
  throw new Error('refusing to run against the real aeon tree: this harness writes art/palettes/*.bin. Use a copy.');
}

const SHOTS = captureDir({
  root: ROOT, committedRel: 'docs/captures/2026-09-13-palette-line0-warning', label: 'palette-line0-warning',
}).dir;

// ─── Expectations, DERIVED ─────────────────────────────────────────────────
// The candidate list and the accept key are read out of the source the app was
// built from, never retyped here; a parse that finds nothing stops the run.
function parseOrDie(rel, re, what) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const m = re.exec(src);
  if (!m) throw new Error(`could not read ${what} out of ${rel}: this harness would be guessing`);
  return m[1];
}
const CANDIDATES = [...parseOrDie('src/core/project/aeon/player-palette.ts',
  /PLAYER_PALETTE_CANDIDATES: readonly string\[\] = \[([\s\S]*?)\];/, 'PLAYER_PALETTE_CANDIDATES')
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);
const ACCEPT_KEY = parseOrDie('src/renderer/providers/palette-line0-gate.ts',
  /export const LINE0_ACCEPT_KEY = '([^']+)'/, 'LINE0_ACCEPT_KEY');
const SHARED_PATH = CANDIDATES.find((p) => existsSync(join(AEONDIR, p)));
if (!SHARED_PATH) throw new Error(`no player palette candidate (${CANDIDATES.join(', ')}) exists in ${AEONDIR}`);

/** Every embed of `target` in the copy's .emp sources, by an independent walk
 *  and a line search that shares no code with the app's scan. */
function expectedSites(root, target) {
  const hits = [];
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const full = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, r);
      else if (name.endsWith('.emp')) {
        readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
          if (!line.trimStart().startsWith('//') && line.includes(`embed("${target}")`)) hits.push(`${r}:${i + 1}`);
        });
      }
    }
  };
  walk(root, '');
  return hits.sort();
}
const SITES = expectedSites(AEONDIR, SHARED_PATH);

// Hub ruling 2026-09-14T00:24:36Z (empyrean docs/OVERSEER.md, empyrean 8a7476f):
// the warning ALSO names the project's spring character-swap check. Its path is
// read out of the source the app was built from; whether the COPY has it, and
// whether it reads the resolved shared file, is this file's own look at the
// copy, sharing no code with the app's scan. Row 3h expects the name exactly
// when both hold, and its absence otherwise.
const GATE_PATH = parseOrDie('src/core/project/aeon/shared-palette-warning.ts',
  /export const SPRING_LINE0_GATE_PATH = '([^']+)'/, 'SPRING_LINE0_GATE_PATH');
const GATE_EXPECTED = (() => {
  const p = join(AEONDIR, GATE_PATH);
  if (!existsSync(p)) return false;
  const src = readFileSync(p, 'utf8');
  return src.includes(`"${SHARED_PATH}"`) || src.includes(`'${SHARED_PATH}'`);
})();

const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const readShared = () => readFileSync(join(AEONDIR, SHARED_PATH));

// ─── CDP plumbing (the palette-grid-harness shape) ─────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (ch) => (d += ch));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function portFree() { try { await getJSON('/json/version'); return false; } catch { return true; } }
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

// ─── Rows ──────────────────────────────────────────────────────────────────
const fails = []; const negFails = []; let passes = 0;
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  if (ok) passes++; else fails.push(`[${id}] ${name} :: ${detail}`);
}
/** A condition that MUST be false. If it is true the probe cannot see. */
function neg(id, name, ok, detail) {
  const good = ok === false;
  console.log(`${good ? 'neg-ok' : 'NEG-BROKEN'}  [${id}] (planted) ${name}${detail !== undefined ? ` :: ${detail}` : ''}`);
  if (!good) negFails.push(`[${id}] ${name} :: ${detail}`);
}
function note(id, name, detail) { console.log(`NOTE  [${id}] ${name} :: ${detail}`); }
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  const path = join(SHOTS, `${name}.png`);
  writeFileSync(path, Buffer.from(data, 'base64'));
  return path;
}

// ─── In-page queries (read-only) ───────────────────────────────────────────
// A palette row is any element with exactly 16 <button> children (the
// palette-grid-harness rule). Queries return rects and text; every GESTURE
// below goes through Input.dispatch*, never through these.
const Q = String.raw`(() => {
  const rows = () => [...document.querySelectorAll('div')]
    .filter((d) => [...d.children].filter((c) => c.tagName === 'BUTTON').length === 16);
  const cell = (l, i) => { const r = rows()[l]; return r ? [...r.children].filter((c) => c.tagName === 'BUTTON')[i] ?? null : null; };
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  window.__l0 = {
    shape: () => rows().map((r) => [...r.children].filter((c) => c.tagName === 'BUTTON').length),
    cellRect: (l, i) => rect(cell(l, i)),
    title: (l, i) => cell(l, i)?.getAttribute('title') ?? null,
    color: (l, i) => { const c = cell(l, i); return c ? getComputedStyle(c).backgroundColor : null; },
    sliders: () => document.querySelectorAll('input[type=range]').length,
    heading: () => { const s = [...document.querySelectorAll('span')].find((e) => e.children.length === 0 && /·\s*Index \d+/.test(e.textContent)); return s ? s.textContent.trim() : null; },
    dialog: () => { const d = document.querySelector('[role=alertdialog]'); return d ? { title: d.getAttribute('aria-label'), text: d.innerText } : null; },
    buttonRect: (key) => rect(document.querySelector('button[data-confirm-key="' + key + '"]')),
    pillRect: (label) => rect([...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === label) ?? null),
    sliderRect: (n) => rect(document.querySelectorAll('input[type=range]')[n] ?? null),
    sliderValue: (n) => { const s = document.querySelectorAll('input[type=range]')[n]; return s ? Number(s.value) : null; },
    bodyText: () => document.body.innerText,
  };
  return true;
})()`;

/** A real click at the INTEGER centre of a rect (docs/OVERSEER-REFERENCE.md:
 *  dpr varies here, so aim at a whole client pixel and derive from that). */
async function realClick(c, r, label) {
  if (!r) throw new Error(`nothing to click for ${label}`);
  const x = Math.round(r.x + r.w / 2);
  const y = Math.round(r.y + r.h / 2);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  return { x, y };
}
/** A real key press, in the shape the band-preset and bganim rigs use for the
 *  same Ctrl+S (`keyDown` then `keyUp`), which is known to reach App.tsx. */
async function realKey(c, key, code, vk, modifiers = 0) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
/** Poll until `pred()` is truthy or `ms` passes; returns the last value. An
 *  event wait, not a fixed sleep: it returns the moment the app gets there. */
async function until(pred, ms = 8000, step = 100) {
  const t0 = Date.now();
  let v;
  while (Date.now() - t0 < ms) {
    v = await pred();
    if (v) return v;
    await sleep(step);
  }
  return v;
}
const wordOf = (title) => { const m = /\$([0-9A-F]{4})/.exec(title ?? ''); return m ? parseInt(m[1], 16) : null; };
const fmt = (w) => `$${w.toString(16).toUpperCase().padStart(4, '0')}`;

const LINE = 0;
const ENTRY = 5;
const CONTROL_LINE = 1;

async function runChecks(c) {
  const envInfo = await c.json('({dpr: window.devicePixelRatio, w: innerWidth, h: innerHeight})');
  note('0a', 'environment', `dpr=${envInfo.dpr} viewport=${envInfo.w}x${envInfo.h} `
    + `load=${readFileSync('/proc/loadavg', 'utf8').trim().split(' ').slice(0, 3).join(' ')}`);
  note('0b', 'derived expectations', `shared=${SHARED_PATH} (candidates ${CANDIDATES.join(', ')}) `
    + `accept-key=${ACCEPT_KEY} embed-sites=${JSON.stringify(SITES)} `
    + `spring-check=${GATE_PATH} (${GATE_EXPECTED ? 'on the copy and reads the shared file: expect NAMED' : 'not on the copy, or reads another file: expect NOT named'})`);
  check('0c', 'ANTI-VACUOUS: the independent scan of the copy found embed sites to look for',
    SITES.length > 0, `${SITES.length} site(s)`);

  // ── 1. Open the copy and reach the Palette facet (setup) ──────────────────
  const opened = await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch((e) => `threw ${e.message}`);
  const st = await until(() => c.json('window.__dbg.aeon.state()').then((s) => (s.open && s.sections > 0 ? s : null)).catch(() => null), 30000, 300);
  check('1a', 'ANTI-VACUOUS: the aeon COPY is open, with sections', !!st, `open()=${opened} state=${JSON.stringify(st)}`);
  if (!st) throw new Error('aeon did not open');
  await c.evalExpr(Q);
  const pill = await until(() => c.json('window.__l0.pillRect("Palette")'), 10000);
  await realClick(c, pill, 'the Palette facet pill');
  const shape = await until(async () => { await c.evalExpr(Q); const s = await c.json('window.__l0.shape()'); return s.length >= 4 ? s : null; }, 15000, 200);
  check('1b', 'ANTI-VACUOUS: the Palette facet shows the zone grid, four rows of sixteen',
    JSON.stringify(shape?.slice(0, 4)) === JSON.stringify([16, 16, 16, 16]), JSON.stringify(shape));

  const bytes0 = readShared();
  const title0 = await c.json(`window.__l0.title(${LINE}, ${ENTRY})`);
  const color0 = await c.json(`window.__l0.color(${LINE}, ${ENTRY})`);
  const fileWord = (bytes0[ENTRY * 2] << 8) | bytes0[ENTRY * 2 + 1];
  check('1c', 'the line 0 swatch shows the shared file\'s word and says it is shared by every zone',
    wordOf(title0) === (fileWord & 0x0eee) && /Sonic and Tails, shared by every zone/.test(title0 ?? ''),
    `title=${JSON.stringify(title0)} file word=${fmt(fileWord)} (${SHARED_PATH} sha ${sha(bytes0)})`);

  // ── 2. CONTROL: a zone line opens with no warning ─────────────────────────
  neg('2n', 'a warning dialog is up before anything was clicked', !!(await c.json('window.__l0.dialog()')));
  await realClick(c, await c.json(`window.__l0.cellRect(${CONTROL_LINE}, ${ENTRY})`), 'a line 1 swatch');
  const ctl = await until(() => c.json('window.__l0.sliders()'), 3000);
  const ctlDialog = await c.json('window.__l0.dialog()');
  check('2a', 'CONTROL: a real click on a line 1 swatch opens its sliders with NO warning',
    ctl === 3 && ctlDialog === null, `sliders=${ctl} dialog=${JSON.stringify(ctlDialog)}`);
  // Close them the way a person would: the eraser (index 0) selects without editing.
  await realClick(c, await c.json(`window.__l0.cellRect(${CONTROL_LINE}, 0)`), 'the line 1 eraser');
  await until(async () => (await c.json('window.__l0.sliders()')) === 0, 3000);

  // ── 3. The warning, raised by a REAL click on line 0 ──────────────────────
  const aim = await realClick(c, await c.json(`window.__l0.cellRect(${LINE}, ${ENTRY})`), 'the line 0 swatch');
  note('3.', 'aim', `line ${LINE} index ${ENTRY} at client (${aim.x}, ${aim.y})`);
  const dlg = await until(() => c.json('window.__l0.dialog()'), 10000);
  check('3a', 'a real click on a line 0 swatch raises the IN-APP warning (role=alertdialog, not a native dialog)',
    !!dlg, JSON.stringify(dlg?.title));
  const text = dlg?.text ?? '';
  check('3b', 'the warning names the resolved shared file', text.includes(SHARED_PATH), SHARED_PATH);
  check('3c', 'the warning says the change reaches EVERY zone, and that there is no per-level copy',
    text.includes('EVERY zone') && /no per-level copy/.test(text), JSON.stringify(dlg?.title));
  const missing = SITES.filter((s) => !text.includes(s));
  check('3d', 'the warning names EVERY embed site the independent scan of the copy found',
    SITES.length > 0 && missing.length === 0, missing.length ? `missing ${JSON.stringify(missing)}` : `${SITES.length} named`);
  check('3e', 'the warning never claims line 0 is pushed live', /until it is rebuilt/.test(text) && !/pushes only lines 0/.test(text));
  // [3h] ADDED 2026-09-14 (PALETTE-WARNING-NAMES-SPRING-GATE), not yet run by its
  // author: the controller runs CDP rigs. Red-first plant for that run: in
  // src/renderer/providers/palette-line0-gate.ts pass `{ kind: 'absent' }` as
  // sharedLine0Warning's third argument instead of `gate`, rebuild, and on a copy
  // that has the check this row must FAIL naming the missing path.
  check('3h', GATE_EXPECTED
    ? 'the warning names the spring character-swap check the copy holds'
    : 'the warning does not name a spring check the copy lacks (or that reads another file)',
  text.includes(GATE_PATH) === GATE_EXPECTED,
  `${GATE_PATH} expected ${GATE_EXPECTED ? 'NAMED' : 'NOT named'}; ${text.includes(GATE_PATH) ? 'named' : 'missing'} in the warning`);
  check('3f', 'no sliders opened while the warning is up', (await c.json('window.__l0.sliders()')) === 0);
  const warnShot = await shot(c, 'warning');
  note('3g', 'capture', warnShot);
  console.log('        --- warning text, verbatim ---\n' + text.split('\n').map((l) => `        | ${l}`).join('\n'));

  // ── 4. DECLINE changes nothing ────────────────────────────────────────────
  await realClick(c, await c.json('window.__l0.buttonRect("cancel")'), 'Cancel');
  const gone = await until(async () => (await c.json('window.__l0.dialog()')) === null, 3000);
  const after = {
    sliders: await c.json('window.__l0.sliders()'),
    title: await c.json(`window.__l0.title(${LINE}, ${ENTRY})`),
    color: await c.json(`window.__l0.color(${LINE}, ${ENTRY})`),
    dirty: (await c.json('window.__dbg.aeon.state()')).dirty,
    sha: sha(readShared()),
  };
  check('4a', 'a real click on Cancel closes the warning', gone === true);
  check('4b', 'DECLINE: no sliders, the swatch unchanged, nothing dirty, the shared file byte-identical',
    after.sliders === 0 && after.title === title0 && after.color === color0 && after.dirty === false && after.sha === sha(bytes0),
    JSON.stringify({ ...after, before: { title: title0, color: color0, sha: sha(bytes0) } }));

  // ── 5. It asks AGAIN after a decline, and ACCEPTING opens the sliders ─────
  await realClick(c, await c.json(`window.__l0.cellRect(${LINE}, ${ENTRY})`), 'the line 0 swatch, again');
  const again = await until(() => c.json('window.__l0.dialog()'), 10000);
  check('5a', 'a declined warning is asked again on the next line 0 click', !!again);
  await realClick(c, await c.json(`window.__l0.buttonRect(${JSON.stringify(ACCEPT_KEY)})`), 'the accept button');
  const opened5 = await until(async () => ((await c.json('window.__l0.sliders()')) === 3 ? true : null), 5000);
  const heading = await c.json('window.__l0.heading()');
  check('5b', 'ACCEPT: the line 0 sliders open, under a heading that says every zone',
    opened5 === true && /^Line 0 · Index 5 · every zone/.test(heading ?? ''), JSON.stringify(heading));

  // ── 6. One channel moved with a REAL pointer press on the slider track ─────
  // The first run of this rig drove it with an arrow key after a `.focus()`,
  // and the value never moved (red 3 -> null): nothing was edited, so rows 6b
  // to 7e measured nothing. A press on the track is the gesture a person makes,
  // and its release is the pointerup the sliders commit on.
  //
  // WHERE TO PRESS, derived: a range input's value is linear in the pointer's x
  // across the track minus one thumb width. The thumb is not queryable, so the
  // press aims at the CENTRE of the target step (an error of half a thumb moves
  // it well under half a step); the value it lands on is read back and printed,
  // and the row fails if it is not the one aimed at.
  const oldWord = wordOf(title0);
  const r0 = (oldWord >> 1) & 7;
  const target = r0 < 7 ? r0 + 1 : r0 - 1;
  const track = await c.json('window.__l0.sliderRect(0)');
  const THUMB = 16;
  const pressX = track.x + THUMB / 2 + (target * (track.w - THUMB)) / 7;
  const at = await realClick(c, { x: pressX, y: track.y, w: 0, h: track.h }, 'the red slider');
  const r1 = await until(async () => { const v = await c.json('window.__l0.sliderValue(0)'); return v !== r0 ? v : null; }, 3000);
  // Derived: the same word with its red level set to the level aimed at.
  const expectWord = (oldWord & ~(7 << 1)) | (target << 1);
  const title6 = await until(async () => { const t = await c.json(`window.__l0.title(${LINE}, ${ENTRY})`); return wordOf(t) === expectWord ? t : null; }, 3000);
  check('6a', 'a real press on the red slider moved it one level, and the swatch shows the derived word',
    r1 === target && !!title6,
    `red ${r0} -> ${r1} (aimed ${target}, track ${JSON.stringify(track)}, pressed at ${at.x},${at.y}); `
    + `expected ${fmt(expectWord)}; title=${JSON.stringify(title6)}`);
  const dirty6 = await until(async () => ((await c.json('window.__dbg.aeon.state()')).dirty ? true : null), 3000);
  check('6b', 'the committed edit made the project dirty', dirty6 === true);

  // ── 7. A real Ctrl+S writes the SHARED file on the copy, one entry only ───
  await realKey(c, 's', 'KeyS', 83, 2);
  const bytes7 = await until(() => { const b = readShared(); return sha(b) !== sha(bytes0) ? b : null; }, 15000, 200);
  check('7a', 'Ctrl+S changed the shared file on the copy', !!bytes7, bytes7 ? `sha ${sha(bytes0)} -> ${sha(bytes7)}` : 'unchanged after 15s');
  if (bytes7) {
    const moved = [...bytes7.keys()].filter((i) => bytes7[i] !== bytes0[i]);
    const outside = moved.filter((i) => i !== ENTRY * 2 && i !== ENTRY * 2 + 1);
    const newWord = (bytes7[ENTRY * 2] << 8) | bytes7[ENTRY * 2 + 1];
    check('7b', 'the file kept its length', bytes7.length === bytes0.length, `${bytes0.length} -> ${bytes7.length}`);
    check('7c', 'ONLY the edited entry moved: every other byte is identical', outside.length === 0 && moved.length > 0,
      `moved bytes ${JSON.stringify(moved)}`);
    check('7d', 'the entry on disk is the derived word', newWord === expectWord, `${fmt(newWord)} vs ${fmt(expectWord)}`);
  }
  const toast = await until(async () => {
    const ts = await c.json('window.__dbg.aeon.toasts()').catch(() => []);
    return ts.find((t) => t.message.includes(SHARED_PATH)) ?? null;
  }, 5000);
  check('7e', 'the save report names the shared file, as a change to every zone',
    !!toast && /every zone/.test(toast.message) && (await c.json('window.__l0.bodyText()')).includes(SHARED_PATH),
    JSON.stringify(toast));
  note('7f', 'capture', await shot(c, 'saved'));
}

async function main() {
  console.log(`aeon dir under test : ${AEONDIR}`);
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  let crashed = null;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const dbg = await until(() => c.evalExpr('typeof window.__dbg === "object"').catch(() => false), 20000, 300);
    if (!dbg) throw new Error('no __dbg: rebuild with VITE_AURORA_DEBUG=1');
    await c.evalExpr('localStorage.clear(); 1');
    await c.send('Page.reload');
    await until(() => c.evalExpr('typeof window.__dbg === "object" && document.readyState === "complete"').catch(() => false), 20000, 300);
    await runChecks(c);
  } catch (e) {
    crashed = e;
    console.error(`HARNESS ABORTED: ${e.stack ?? e}`);
  } finally {
    if (c) { try { c.close(); } catch { /* gone */ } }
    await killTree(child);
    console.log(`port free after teardown: ${await portFree()}`);
  }
  console.log(`\n=== palette-line0-warning: ${passes} PASS, ${fails.length} FAIL, ${negFails.length} broken negatives${crashed ? ', ABORTED' : ''} ===`);
  if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
  if (negFails.length) console.log('!!! BLIND PROBES:\n  ' + negFails.join('\n  '));
  process.exit(crashed ? 2 : (fails.length || negFails.length ? 1 : 0));
}

main().catch((e) => { console.error(e); process.exit(2); });
