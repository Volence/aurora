#!/usr/bin/env node
// CAN AN ARTIST SEE — AND SET — DEPTH ON THE SURFACE WHERE THEY BUILD THE ART?
//
// ROADMAP O17. The map got the violet priority lens on 2026-08-28 and the map
// brush got the Keep/On/Off chips the same day. The AEON ART FACET — the
// composer, where a chunk is actually built — got neither. Its stamp could only
// ever say `keep` (hard-coded at the call site, with a comment saying so), and
// its canvas drew no veil, so a chunk captured out of a high-priority cliff
// opened looking exactly like one captured out of the sky behind it.
//
// The ~5,900-row node suite cannot see React, a canvas, a chip or a mouse. Every
// row in src/renderer/canvas/__tests__/composer-priority-*.test.ts is a source
// scan or a fake context. So this file drives the REAL app: the REAL aeon
// project, the REAL Art facet pill, the REAL chunk thumbnail, the REAL chips in
// the option bar, a REAL click on the composer canvas, and then reads the
// composer canvas's OWN PIXELS back.
//
// ═══ THE TWO HALVES, AND WHY EACH NEEDS ITS OWN CONTROL ═══
//
// AUTHORING is measured on the MODEL: `composerPriorityLens().priorityCells` is
// the document's own count of cells carrying `pri`, published every repaint. A
// stamp armed `On` must move it by exactly +1 and a stamp armed `Off` on the
// same cell must move it back — one direction alone is a toggle, not authoring,
// and `keep` (row [k]) must move it by 0 while REPLACING THE TILE, which is the
// O12 property re-proven through the shipped control rather than through a unit.
//
// SEEING is measured on PIXELS, and it has to be a DELTA rather than a violet
// predicate. `PRIORITY_FILL` is rgba(200,90,255,0.42) composited over whatever
// art is beneath; over the saturated greens of Oracle Jungle Zone a "is it
// violet" test fails on exactly the tiles that matter. So: sample two pixels
// with the lens off, turn it on, sample again —
//
//   • the priority cell MUST change to exactly `0.42*(200,90,255) + 0.58*before`
//     per channel (+-2 for rounding), the source-over composite of a colour and
//     alpha this harness READS OUT OF src/renderer/canvas/canvas-colors.ts
//     rather than typing;
//   • the cell NEXT TO IT must be BYTE-IDENTICAL. That is the half that makes it
//     a measurement: a whole-canvas violet wash passes the first row and fails
//     this one.
//
// ═══ THE FIXTURE IS AUTHORED, AND SAYS SO ═══
//
// The tile-attribute harness FINDS real priority cells in section 0 rather than
// authoring them, because a constructed fixture proves the code path while a
// real cell proves the bug. That is not available here: the chunk LIBRARY is
// not the section grid, and whether any library chunk carries a priority cell is
// a property of this project on this day, not of the feature. So the lens rows
// measure the cell the AUTHORING rows just created with the app's own new chip —
// and when authoring fails, the lens rows SKIP with that reason printed rather
// than going green on an empty document. [m] prints the document's priority
// count at open so an already-priority chunk is visible in the log if one turns
// up.
//
// ═══ THE CHIP TITLES ARE READ OUT OF THE APP, NOT TYPED ═══
//
// Every chip is addressed by its `title`, and the three titles are parsed out of
// src/renderer/components/shared/PriorityChips.tsx. A literal here would be a
// pin that survives a rename: the buttons would vanish, the harness would report
// "not found", and the fix would look like a harness bug. If the parse fails
// this DIES rather than guessing.
//
// ═══ THE dpr TRAP ═══
//
// `devicePixelRatio` varies run-to-run under Xvfb here. Row [aim] prints it with
// the canvas rect and asserts `canvas.width === Math.floor(rect.width)` — the
// composer's own contract (PixelViewport sets the backing size in CSS px). Every
// click aim is derived from the canvas rect through the app's own tile
// arithmetic, rounded to an integer, and then VERIFIED with `elementFromPoint`
// before it is sent; a miss is a loud refusal, never a red feature row. Pixel
// SAMPLING uses canvas-internal coordinates and is unaffected by scroll.
//
// ═══ WHICH ROWS DISCRIMINATE, MEASURED — NOT ASSERTED ═══
//
// Both halves were reverted on a real build and this harness re-run, so the
// rows below are known to be able to go red rather than merely believed to.
// `scratchpad/o17-plant.mjs` is the planter; it snapshots and restores the file
// byte-for-byte rather than using `git checkout`.
//
//   PLANT p1 — the stamp back to a hard `pri: 'keep'` (the state master shipped
//     after O12): [4] and [k] RED, [6a] [6b] [7] SKIPPED with the reason
//     printed. [5] passes VACUOUSLY there — its shape is "the count returns to
//     what it was", which 0 → 0 satisfies — and that is disclosed rather than
//     hidden: [4] failing beside it is what says so.
//   PLANT p2 — the lens draw call replaced by a zero result: [6a] RED alone.
//     [6b] and [7] are CONTROLS and do not discriminate for this plant by
//     design; they exist to catch a whole-canvas wash and a veil baked into the
//     art, neither of which p2 produces.
//
// Usage: node scratchpad/composer-priority-harness.mjs   (VERBOSE=1 for app logs)

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9414);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// A WORKTREE HAS NO node_modules OF ITS OWN — npm resolves up, and so must this.
function findElectron(from) {
  for (let d = from; d !== '/'; d = dirname(d)) {
    const p = join(d, 'node_modules/.bin/electron');
    if (existsSync(p)) return p;
  }
  throw new Error('no electron binary found walking up from ' + from);
}
const ELECTRON = findElectron(ROOT);
const AEON_DIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';  // OPEN ONLY
const SHOTS = join(ROOT, 'scratchpad/shots-composer-priority');
mkdirSync(SHOTS, { recursive: true });

// ── §COLOUR — the veil, read out of the app's own source ───────────────────
const COLORS_SRC = join(ROOT, 'src/renderer/canvas/canvas-colors.ts');
function priorityFill() {
  const src = readFileSync(COLORS_SRC, 'utf8');
  const m = /export const PRIORITY_FILL = 'rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)'/.exec(src);
  if (!m) throw new Error(`could not read PRIORITY_FILL out of ${COLORS_SRC}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
}
const VEIL = priorityFill();
/** source-over: dst' = src*a + dst*(1-a), per channel. The app's own blend. */
const composited = (b) => ({
  r: VEIL.r * VEIL.a + b.r * (1 - VEIL.a),
  g: VEIL.g * VEIL.a + b.g * (1 - VEIL.a),
  b: VEIL.b * VEIL.a + b.b * (1 - VEIL.a),
});
const BLEND_TOL = 2;
function blendMatches(before, after) {
  const w = composited(before);
  return Math.abs(after.r - w.r) <= BLEND_TOL
    && Math.abs(after.g - w.g) <= BLEND_TOL
    && Math.abs(after.b - w.b) <= BLEND_TOL;
}
const same = (a, b) => !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
const px = (p) => (p ? `(${p.r},${p.g},${p.b},${p.a})` : 'null');

// ── §TITLES — the chips' selectors, read out of the app's own source ───────
const CHIPS_SRC = join(ROOT, 'src/renderer/components/shared/PriorityChips.tsx');
function chipTitles() {
  const src = readFileSync(CHIPS_SRC, 'utf8');
  const out = {};
  const re = /value:\s*'(keep|on|off)',\s*label:\s*'[^']*',\s*\n\s*title:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out[m[1]] = m[2].replace(/\\'/g, "'");
  if (!out.keep || !out.on || !out.off) {
    throw new Error(
      `PriorityChips.tsx no longer has the three-spec shape this harness derives its selectors from `
      + `(got ${JSON.stringify(Object.keys(out))}). REFUSING TO GUESS — fix the derivation, do not type a literal.`);
  }
  return out;
}
const TITLE = chipTitles();

/** The lens toggle's own title, read out of the bar that renders it — same rule
 *  as the chips: a literal here is a pin that survives a rewording. */
const BAR_SRC = join(ROOT, 'src/renderer/shell/ArtToolOptions.tsx');
function lensTitle() {
  const src = readFileSync(BAR_SRC, 'utf8');
  const m = /title="(Priority lens[^"]*)"/.exec(src);
  if (!m) {
    throw new Error(
      `no Priority-lens toggle title found in ${BAR_SRC}. On master there is none — that IS the `
      + `finding, and this harness refuses to guess a selector for a control that does not exist.`);
  }
  return m[1];
}
const LENS_TITLE = lensTitle();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = []; const skips = []; const notes = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
function skip(id, name, why) {
  console.log(`SKIP  [${id}] ${name}\n        ${why}`);
  skips.push(id);
}
function note(label, detail) {
  console.log(`NOTE  ${label}\n        ${detail}`);
  notes.push(label);
}

function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map(); const exceptions = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push(d.exception?.description ?? d.text ?? '(unknown)');
    }
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
  return {
    ready, send, evalExpr, exceptions,
    json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)),
    close: () => ws.close(),
  };
}
async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}
async function mouse(c, type, x, y) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left',
    buttons: type === 'mousePressed' ? 1 : 0,
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
  });
}
async function click(c, x, y) {
  await mouse(c, 'mouseMoved', x, y);
  await mouse(c, 'mousePressed', x, y);
  await mouse(c, 'mouseReleased', x, y);
}
const clickByText = (sel, text) => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
  const b = els.find((e) => e.textContent.trim() === ${JSON.stringify(text)});
  if (!b) return 'not-found: ' + JSON.stringify(els.slice(0, 12).map((e) => e.textContent.trim()));
  b.scrollIntoView(); b.click(); return 'clicked';
})()`;
/** Click a control by its exact `title`. Returns 'clicked' or a diagnostic. */
const clickByTitle = (title) => `(() => {
  const b = [...document.querySelectorAll('button')].find((e) => e.title === ${JSON.stringify(title)});
  if (!b) return 'not-found';
  if (b.disabled) return 'disabled';
  b.scrollIntoView(); b.click(); return 'clicked';
})()`;
const titleExists = (title) =>
  `[...document.querySelectorAll('button')].some((e) => e.title === ${JSON.stringify(title)})`;

/** The composer canvas — the one inside the auto-margin / 24px-padding holder
 *  (ComposerCanvas's own `styles.holder`), and only while it is on screen. */
const COMPOSER_CANVAS = `[...document.querySelectorAll('canvas')].find((k) =>
  k.parentElement && k.parentElement.style.margin === 'auto'
  && k.parentElement.style.padding === '24px' && k.offsetParent !== null)`;

/** One pixel off the LIVE composer canvas, in CANVAS-INTERNAL coordinates —
 *  the context the app already drew with, so scroll position cannot move it. */
const PIXEL_AT = (x, y) => `(() => {
  const cv = ${COMPOSER_CANVAS};
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(${x}, ${y}, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
})()`;

/** Force one composer repaint so a publish-based reading is current. A nudge on
 *  the canvas is the app's own path to a re-render; nothing here mutates. */
async function repaint(c) {
  await c.evalExpr(`(() => { const cv = ${COMPOSER_CANVAS};
    if (cv) cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: -1, clientY: -1 }));
    return true; })()`);
  await sleep(350);
}

async function main() {
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }
  note('PRIORITY_FILL', `rgba(${VEIL.r},${VEIL.g},${VEIL.b},${VEIL.a}) read out of `
    + COLORS_SRC.replace(ROOT + '/', ''));
  note('chip titles', `keep/on/off selectors read out of ${CHIPS_SRC.replace(ROOT + '/', '')}`);
  note('lens toggle', `${JSON.stringify(LENS_TITLE)} read out of ${BAR_SRC.replace(ROOT + '/', '')}`);

  let app = null, c = null;
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawnGuarded('/usr/bin/xvfb-run',
      ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
      { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // ── [1] the real project, the real Art facet, the real composer ─────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEON_DIR)})`);
    await sleep(1500);
    const st0 = await c.json('window.__dbg.aeon.state()');
    await c.evalExpr(`window.__dbg.activate(${JSON.stringify(st0.zone)}, ${JSON.stringify(st0.act)})`);
    await sleep(900);
    const artPill = await c.evalExpr(clickByText('[aria-label="Facets"] button', 'Art'));
    await sleep(1200);

    // Open a library chunk by double-clicking its own thumbnail (ChunkCell's
    // `activate`) — the artist's route, not a store poke.
    const opened = await c.evalExpr(`(() => {
      const cells = [...document.querySelectorAll('button')].filter((e) => e.querySelector('canvas'));
      const b = cells[0];
      if (!b) return 'no-thumb';
      b.scrollIntoView();
      b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return 'dblclicked';
    })()`);
    await sleep(1400);
    const open1 = await c.json('window.__dbg.aeon.artChunkOpen()');
    check('1', 'the real aeon project opens and the Art facet mounts the composer on a real chunk',
      st0.open === true && artPill === 'clicked' && !!open1 && open1.chunkId !== null,
      `state=${JSON.stringify(st0)} artPill=${artPill} dbl=${opened} open=${JSON.stringify(open1)}`);
    if (!open1 || open1.chunkId === null) throw new Error('no composer document — nothing below can run');
    await shot(c, '01-composer-open');

    // Arm the Tile stamp tool: the only art tool that writes a cell's tile
    // reference and its attributes. Every other tool edits pixels.
    const armTool = await c.evalExpr(`(() => {
      const b = document.querySelector('button[aria-label="Tile stamp"]');
      if (!b) return 'no-tool'; b.click(); return 'clicked';
    })()`);
    await sleep(500);

    // ── [aim] the geometry contract ────────────────────────────────────────
    const geo = await c.json(`(() => {
      const cv = ${COMPOSER_CANVAS};
      if (!cv) return { ok: false };
      const r = cv.getBoundingClientRect();
      return { ok: true, left: r.left, top: r.top, rectW: r.width, rectH: r.height,
        w: cv.width, h: cv.height, dpr: window.devicePixelRatio };
    })()`);
    if (!geo.ok) throw new Error('composer canvas not found — nothing below can run');
    const zoom = geo.w / (open1.widthTiles * 8);
    check('aim', 'the composer canvas backing store is CSS px (the dpr trap is closed)',
      geo.w === Math.floor(geo.rectW) && Number.isInteger(zoom) && zoom >= 1,
      `dpr=${geo.dpr} rect=${geo.left.toFixed(1)},${geo.top.toFixed(1)} `
      + `${geo.rectW.toFixed(1)}x${geo.rectH.toFixed(1)} canvas=${geo.w}x${geo.h} `
      + `doc=${open1.widthTiles}x${open1.heightTiles} tiles → zoom=${zoom}`);

    // ── [2] THE CHIPS EXIST, and `keep` is what a fresh composer is armed to ──
    const chipsPresent = await c.json(`({
      keep: ${titleExists(TITLE.keep)}, on: ${titleExists(TITLE.on)}, off: ${titleExists(TITLE.off)} })`);
    check('2', 'the Art facet draws the three priority chips, and the stamp opens armed to KEEP',
      chipsPresent.keep && chipsPresent.on && chipsPresent.off && open1.stampPriority === 'keep',
      `chips=${JSON.stringify(chipsPresent)} armed=${open1.stampPriority} (tool=${armTool})\n`
      + `        keep-title=${JSON.stringify(TITLE.keep)}`);

    // ── [m] the document's own priority count at open (anti-vacuous context) ──
    await repaint(c);
    const lens0 = await c.json('window.__dbg.aeon.composerPriorityLens()');
    note('document at open',
      `${lens0.cells} cells, ${lens0.priorityCells} carrying priority, lens ${lens0.active ? 'ON' : `OFF (${lens0.reason})`}`);

    // ── [3] arming a chip RAISES THE LENS, on this facet, with no View menu ──
    const armOn = await c.evalExpr(clickByTitle(TITLE.on));
    await sleep(500);
    await repaint(c);
    const afterArm = await c.json('window.__dbg.aeon.artChunkOpen()');
    const lensArm = await c.json('window.__dbg.aeon.composerPriorityLens()');
    check('3', 'clicking On arms the stamp AND surfaces the lens — you cannot author a field you cannot see',
      armOn === 'clicked' && afterArm.stampPriority === 'on'
      && lensArm.active === true && lensArm.paints > lens0.paints,
      `click=${armOn} armed=${afterArm.stampPriority} lens=${JSON.stringify(lensArm)}`);
    await shot(c, '02-armed-on');

    // ── the cell to stamp: on screen, and NOT already carrying priority ─────
    const cellPoint = (cx, cy) => ({
      x: Math.round(geo.left + (cx * 8 + 4) * zoom),
      y: Math.round(geo.top + (cy * 8 + 4) * zoom),
    });
    let cell = null;
    for (let cy = 0; cy < open1.heightTiles && !cell; cy++) {
      for (let cx = 0; cx < open1.widthTiles && !cell; cx++) {
        const pt = cellPoint(cx, cy);
        // The app's own hit test — the ONLY honest way to ask whether an aim
        // lands on the canvas rather than on the scroller or a panel over it.
        const hits = await c.evalExpr(
          `document.elementFromPoint(${pt.x}, ${pt.y}) === ${COMPOSER_CANVAS}`);
        if (hits) cell = { cx, cy, ...pt };
      }
    }
    if (!cell) throw new Error('no composer cell is on screen — every aim would miss');

    // Arm a tileset tile. The index is DERIVED from what the click actually
    // armed (`artChunkOpen().brushTile`), never assumed.
    const tsGeo = await c.json(`(() => {
      const wrap = [...document.querySelectorAll('div')].find((d) =>
        d.style.position === 'relative' && d.style.overflow === 'hidden'
        && d.querySelectorAll('canvas').length === 2);
      if (!wrap) return { ok: false, why: 'no tileset wrap' };
      const r = wrap.querySelector('canvas').getBoundingClientRect();
      return { ok: true, left: r.left, top: r.top, width: r.width, height: r.height };
    })()`);
    let armedTile = null;
    if (tsGeo.ok) {
      const stride = 18, half = 8;
      const cols = Math.max(1, Math.floor(tsGeo.width / stride));
      for (let n = 1; n < Math.min(24, cols * 3) && armedTile === null; n++) {
        const x = Math.round(tsGeo.left + (n % cols) * stride + half);
        const y = Math.round(tsGeo.top + Math.floor(n / cols) * stride + half);
        if (y > tsGeo.top + tsGeo.height - 2) break;
        await click(c, x, y);
        await sleep(150);
        const st = await c.json('window.__dbg.aeon.artChunkOpen()');
        if (st && st.brushTile > 0) armedTile = st.brushTile;
      }
    }

    // ── [4] AUTHORING: a stamp armed On adds priority to the cell it touches ──
    await repaint(c);
    const beforeOn = await c.json('window.__dbg.aeon.composerPriorityLens()');
    await click(c, cell.x, cell.y);
    await sleep(500);
    await repaint(c);
    const afterOn = await c.json('window.__dbg.aeon.composerPriorityLens()');
    const dirtyOn = await c.json('window.__dbg.aeon.artChunkOpen()');
    const authored = afterOn.priorityCells === beforeOn.priorityCells + 1;
    check('4', 'a stamp armed ON writes the priority bit onto the cell it lands on (+1, exactly)',
      authored && dirtyOn.dirty === true,
      `cell=(${cell.cx},${cell.cy}) at ${cell.x},${cell.y} armedTile=${armedTile} dirty=${dirtyOn.dirty}\n`
      + `        priorityCells ${beforeOn.priorityCells} → ${afterOn.priorityCells} of ${afterOn.cells}`);

    // ── [5] the other direction — Off CLEARS it, on the same cell ───────────
    // Without this row, [4] is satisfied by a control that can only ever add.
    const armOff = await c.evalExpr(clickByTitle(TITLE.off));
    await sleep(400);
    await click(c, cell.x, cell.y);
    await sleep(500);
    await repaint(c);
    const afterOff = await c.json('window.__dbg.aeon.composerPriorityLens()');
    check('5', 'a stamp armed OFF clears it again — the control AUTHORS the bit, it does not only add it',
      armOff === 'clicked' && afterOff.priorityCells === beforeOn.priorityCells,
      `armOff=${armOff} priorityCells ${afterOn.priorityCells} → ${afterOff.priorityCells} `
      + `(must return to ${beforeOn.priorityCells})`);

    // ── [k] KEEP still keeps — O12's property, through the shipped control ──
    // Put the bit back with On, then stamp the SAME cell armed Keep and demand
    // the count hold. A `keep` that had regressed to `false` would show here.
    await c.evalExpr(clickByTitle(TITLE.on));
    await sleep(300);
    await click(c, cell.x, cell.y);
    await sleep(400);
    await repaint(c);
    const withPri = await c.json('window.__dbg.aeon.composerPriorityLens()');
    const armKeep = await c.evalExpr(clickByTitle(TITLE.keep));
    await sleep(300);
    await click(c, cell.x, cell.y);
    await sleep(400);
    await repaint(c);
    const afterKeep = await c.json('window.__dbg.aeon.composerPriorityLens()');
    const keptState = await c.json('window.__dbg.aeon.artChunkOpen()');
    check('k', 'a stamp armed KEEP leaves the depth it found — O12, re-proven through the shipped chips',
      armKeep === 'clicked' && keptState.stampPriority === 'keep'
      && withPri.priorityCells === beforeOn.priorityCells + 1
      && afterKeep.priorityCells === withPri.priorityCells,
      `armed=${keptState.stampPriority} priorityCells ${withPri.priorityCells} → ${afterKeep.priorityCells}`);

    // ── the pixel rows' fixture: the cell now carries priority ─────────────
    if (afterKeep.priorityCells !== beforeOn.priorityCells + 1) {
      skip('6a', 'the veil', 'authoring did not leave a priority cell to look at — see [4]/[5]/[k]');
      skip('6b', 'the control', 'same');
      skip('7', 'the lens goes back off cleanly', 'same');
    } else {
      // A NEIGHBOUR that is NOT priority — the control half. It must be a cell
      // the same document draws art into, or "it did not change" is trivially
      // true of empty space.
      const nx = cell.cx + 1 < open1.widthTiles ? cell.cx + 1 : cell.cx - 1;
      const sampleAt = (cx, cy) => ({ x: Math.round((cx * 8 + 4) * zoom), y: Math.round((cy * 8 + 4) * zoom) });
      const hiPt = sampleAt(cell.cx, cell.cy);
      const loPt = sampleAt(nx, cell.cy);

      // Lens OFF first — the chip is a toggle onto the shared `showPriority`.
      const lensState = await c.json('window.__dbg.aeon.composerPriorityLens()');
      if (lensState.active) {
        await c.evalExpr(clickByTitle(LENS_TITLE));
        await sleep(400);
      }
      await repaint(c);
      const offReport = await c.json('window.__dbg.aeon.composerPriorityLens()');
      const hiBefore = await c.json(PIXEL_AT(hiPt.x, hiPt.y));
      const loBefore = await c.json(PIXEL_AT(loPt.x, loPt.y));
      await shot(c, '03-lens-off');

      const lensOn = await c.evalExpr(clickByTitle(LENS_TITLE));
      await sleep(500);
      await repaint(c);
      const onReport = await c.json('window.__dbg.aeon.composerPriorityLens()');
      const hiAfter = await c.json(PIXEL_AT(hiPt.x, hiPt.y));
      const loAfter = await c.json(PIXEL_AT(loPt.x, loPt.y));
      await shot(c, '04-lens-on');

      check('6a', 'THE PRIORITY CELL GAINS THE VEIL — exactly the PRIORITY_FILL composite',
        lensOn === 'clicked' && onReport.active === true && onReport.veils > 0
        && !!hiBefore && !!hiAfter && blendMatches(hiBefore, hiAfter),
        `toggle=${lensOn} report=${JSON.stringify(onReport)}\n`
        + `        cell(${cell.cx},${cell.cy}) canvas(${hiPt.x},${hiPt.y}) before=${px(hiBefore)} after=${px(hiAfter)}\n`
        + `        want=(${composited(hiBefore ?? { r: 0, g: 0, b: 0 }).r.toFixed(1)},`
        + `${composited(hiBefore ?? { r: 0, g: 0, b: 0 }).g.toFixed(1)},`
        + `${composited(hiBefore ?? { r: 0, g: 0, b: 0 }).b.toFixed(1)}) +-${BLEND_TOL}`);

      check('6b', 'and the cell NEXT TO IT is byte-identical — this is a lens, not a wash',
        same(loBefore, loAfter),
        `cell(${nx},${cell.cy}) canvas(${loPt.x},${loPt.y}) before=${px(loBefore)} after=${px(loAfter)}\n`
        + `        lens-off report=${JSON.stringify(offReport)}`);

      // ── [7] and it comes back OFF cleanly — nothing baked into the art ────
      const lensOff = await c.evalExpr(clickByTitle(LENS_TITLE));
      await sleep(500);
      await repaint(c);
      const backReport = await c.json('window.__dbg.aeon.composerPriorityLens()');
      const hiBack = await c.json(PIXEL_AT(hiPt.x, hiPt.y));
      const loBack = await c.json(PIXEL_AT(loPt.x, loPt.y));
      check('7', 'switching the lens back off restores both pixels byte-for-byte — no veil is baked into the art',
        lensOff === 'clicked' && backReport.active === false && backReport.reason === 'off'
        && same(hiBefore, hiBack) && same(loBefore, loBack),
        `toggle=${lensOff} report=${JSON.stringify(backReport)}\n`
        + `        hi ${px(hiBefore)} → ${px(hiBack)} ; lo ${px(loBefore)} → ${px(loBack)}`);
    }

    // ── [x] no exceptions were thrown behind any of it ─────────────────────
    check('x', 'the app threw no uncaught exception across the whole run',
      c.exceptions.length === 0,
      c.exceptions.length ? c.exceptions.slice(0, 4).join('\n        ') : 'none');
  } finally {
    if (c) c.close();
    if (app) await killTree(app);
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed`
    + `${skips.length ? `, ${skips.length} skipped (${skips.join(', ')})` : ''}`);
  if (fails.length) { console.log(`FAILED: ${fails.join(', ')}`); process.exit(1); }
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
