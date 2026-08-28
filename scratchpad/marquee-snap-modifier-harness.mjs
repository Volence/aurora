#!/usr/bin/env node
// DOES HOLDING CTRL DURING A MARQUEE DRAG ACTUALLY CHANGE THE RECT —
// IN THE RUNNING APP, WITH A REAL KEY AND A REAL MOUSE?
//
// The owner: *"what if with select tool if you hold control it behaves like it
// did where it forces to draw collision size?"*
//
// The node suite (5,362 tests) cannot see a React component, a canvas, a mouse
// gesture, or a keyboard modifier held across one — a modifier during a drag is
// DOUBLY invisible to it. So this drives the real app over CDP: real
// `Input.dispatchMouseEvent` with the `modifiers` bit set, real bare-Control
// key events, and reads the committed rect back out of the app's own store.
//
// ═══ THE EXPOSURE THIS FILE IS BUILT AROUND ═══
//
// TWO OF THE FOUR COMBINATIONS PRODUCE IDENTICAL RECTS.
//
//        armed      modifier   →  rect          same as
//        block      plain      →  rounded out   = tile+held
//        block      HELD       →  exact tiles   = tile+plain
//        tile       plain      →  exact tiles   = block+held
//        tile       HELD       →  rounded out   = block+plain
//
// So "is the committed rect block-aligned?" CANNOT distinguish the modifier
// working from the Snap setting working — and a harness that only ever dragged
// in the default (block) mode would go green with the modifier entirely
// unimplemented, because block+plain is what it would get either way.
//
// WHICH ROWS DISCRIMINATE, AND WHY:
//
//  3b  block + plain  — the CONTROL. Establishes what this exact drag gives
//                       with no key held. Discriminates nothing on its own;
//                       it is the baseline the next row is measured against.
//  3c  block + HELD   — DISCRIMINATING. Same drag, same setting, one key.
//                       Asserts the EXACT odd rect *and* that it differs from
//                       3b's. With the modifier unimplemented this is 3b's
//                       rect and the row fails on the value, not on a flag.
//  4b  tile  + plain  — the CONTROL for the other half.
//  4c  tile  + HELD   — DISCRIMINATING, and in the OPPOSITE direction: it must
//                       round out. This is the owner's literal request, and it
//                       is the row that would fail if the modifier were
//                       implemented as a constant ("Ctrl means tile") rather
//                       than as an inversion.
//  5   THE GRID       — all four rects side by side, asserting the two
//                       collapsed pairs are equal AND the pairs differ. A
//                       modifier that only worked one way survives 3c or 4c
//                       alone but cannot survive this.
//
// EVERY DISCRIMINATING DRAG TARGETS AN ODD RECT. The store's own comment says
// "a Tile-mode drag that lands on even bounds behaves exactly like a Block-mode
// one" — on even bounds the two granularities AGREE and the row proves nothing.
// Origin and size are both forced odd (§2).
//
// ═══ SECTION 6: THE DESIGN QUESTION, MEASURED ═══
//
// Is the modifier sampled live, or only at release? LIVE, with ONE WRITER:
// `handleMouseUp` never re-snaps, so the rect on screen IS the rect that
// stands. Section 6 proves both halves with the MOUSE COMPLETELY STILL —
// press Ctrl (no mouse event at all), read the rect; release Ctrl, read it
// again; then release the button and read it a third time. If the modifier
// were sampled only from mouse events the first two reads would be identical
// and the row fails; if mouseup re-snapped independently the third would
// disagree with the second and the row fails.
//
// ═══ SECTION 7: THE MODIFIER-CONFLICT CHECK ═══
//
// Ctrl is already bound in this viewport (Ctrl+C copy, Ctrl+V paste, and a
// blanket `if (e.ctrlKey || e.metaKey || e.altKey) return` before the tool
// letters). Section 7 holds Ctrl through a drag and then presses C, presses B,
// and copies after release — asserting the clipboard footprint equals the rect
// that was on screen, that Ctrl+B still cannot arm paint-block, and that an
// ordinary Ctrl+C still works once the key has been through a drag.
//
// ═══ AIM AT INTEGER CLIENT PIXELS ═══
//
// devicePixelRatio under Xvfb is not 1 on every host here (measured at 1 and at
// 1.35 on the same tree). At 1.35 the canvas rect is fractional, CDP delivers
// the nearest integer, and a correct app resolves a coordinate one lower —
// which presents as an off-by-one in the feature. Every coordinate goes through
// integer `aimX`/`aimY`, and every expectation is derived from THAT integer
// through the app's own transform (`tileAt`) and through `map-clipboard.ts`'s
// own snap arithmetic (`expectBlock`/`expectTile`, transcribed with the source
// beside them). No tolerance windows anywhere. dpr, rect and aim are printed.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed; a marquee is a
//   selection and pushes no command, so there is nothing to undo either.
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:marquee-snap-modifier

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9397);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently
// re-verifies the branch.
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-snap-modifier`;
mkdirSync(SHOTS, { recursive: true });

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
    } catch { /* not up yet */ }
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
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
const eq = (a, b) => !!a && !!b && a.col === b.col && a.row === b.row && a.w === b.w && a.h === b.h;
const rectStr = (m) => (m ? `{col:${m.col},row:${m.row},w:${m.w},h:${m.h}}` : 'null');

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-snap-modifier/${name}.png`);
}

const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`;

/** Click a button whose visible text matches EXACTLY (trimmed), and only when
 *  exactly one such button exists — "Tile" must not be able to match "Tileset"
 *  or "Paint tile". */
const clickExactButton = (text) => String.raw`
(() => {
  const want = ${JSON.stringify(text)};
  const els = [...document.querySelectorAll('button')]
    .filter((e) => (e.textContent || '').trim() === want);
  if (els.length !== 1) return 'found:' + els.length;
  els[0].click();
  return 'ok';
})()`;

/**
 * WHICH Snap button is HIGHLIGHTED, read off the rendered pixels of the DOM.
 *
 * Not off the store — the store is what the rect already comes from, so a row
 * that read it would be asking the same source twice and would go green over a
 * panel that had been left describing the armed mode while the drag used
 * another. `planeSel` paints `background: T.accent`; the unselected one keeps
 * `T.overlay`. So "selected" is defined here as "the one whose computed
 * background differs from the other's", which is a property of the styling
 * rather than a pinned colour and survives any theme change.
 */
const SNAP_BUTTON_STATE = String.raw`
(() => {
  const find = (t) => [...document.querySelectorAll('button')]
    .filter((e) => (e.textContent || '').trim() === t);
  const b = find('Block'), t = find('Tile');
  if (b.length !== 1 || t.length !== 1) return { error: 'buttons ' + b.length + '/' + t.length };
  const bg = (e) => getComputedStyle(e).backgroundColor;
  const bBg = bg(b[0]), tBg = bg(t[0]);
  if (bBg === tBg) return { error: 'both buttons render identically: ' + bBg };
  return { blockBg: bBg, tileBg: tBg };
})()`;

/** Is the Ctrl-override caption on the page, and what does it say? */
const OVERRIDE_LINE = String.raw`
(() => {
  const hits = [...document.querySelectorAll('div')]
    .map((e) => (e.textContent || '').trim())
    .filter((t) => /^Ctrl held/.test(t));
  return { count: hits.length, text: hits[0] ?? null };
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});

    await c.evalExpr(String.raw`
      (() => {
        window.__harnessErrors = window.__harnessErrors || [];
        if (!window.__harnessErrHooked) {
          window.__harnessErrHooked = true;
          window.addEventListener('error', (e) => window.__harnessErrors.push(String(e.message || e.error)));
          window.addEventListener('unhandledrejection', (e) => window.__harnessErrors.push('rejection: ' + String(e.reason)));
        }
        return 'ok';
      })()`);
    const readErrors = async () => c.json('window.__harnessErrors || []');

    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');

    // ---- 0. PROVENANCE. --------------------------------------------------
    // `marqueeSnapModifier` is introduced by THIS branch and exists nowhere on
    // master. Without this row every PASS below could be describing a build
    // that has none of the parcel in it.
    const probes = await c.json(`({
      snapModifier: typeof window.__dbg.aeon.marqueeSnapModifier,
      granularity: typeof window.__dbg.aeon.marqueeGranularity,
      marquee: typeof window.__dbg.aeon.marquee,
    })`);
    const haveProbes = probes.snapModifier === 'function' && probes.granularity === 'function'
      && probes.marquee === 'function';
    check('0a', 'the build under test contains this branch (marqueeSnapModifier probe present)',
      haveProbes, `${ROOT}/dist — ${JSON.stringify(probes)}`);
    if (!haveProbes) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();
    await c.evalExpr('window.__harnessErrors = []');

    // ---- 1. Open aeon and pin the camera. --------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));

    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(500);
    const view = await c.json('window.__dbg.view()');
    check('1b', 'ANTI-VACUOUS: the camera is at a known, unzoomed origin',
      view.x === 0 && view.y === 0 && view.zoom === 1, JSON.stringify(view));

    const rect = await c.json(CANVAS_RECT);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    check('1c', 'ANTI-VACUOUS: the map canvas is mounted and has a real box',
      !!rect && rect.width > 200 && rect.height > 200,
      `dpr=${dpr} rect=${JSON.stringify(rect)}`);

    const aimX = (canvasX) => Math.round(rect.left + canvasX);
    const aimY = (canvasY) => Math.round(rect.top + canvasY);
    /** The app's own transform: `screenToWorld` + `worldToSectionTile` spelled
     *  out for section 0 at view (0,0,1). Expectations go through THIS, never
     *  through a typed number, so a row fails for any transform error and only
     *  stops failing for the device pixel grid, which is an input. */
    const tileAt = (clientX, clientY) => ({
      col: Math.floor((view.x + (clientX - rect.left) / view.zoom) / 8),
      row: Math.floor((view.y + (clientY - rect.top) / view.zoom) / 8),
    });
    const canvasOfTile = (col, row) => ({
      x: (col * 8 - view.x) * view.zoom,
      y: (row * 8 - view.y) * view.zoom,
    });

    const CTRL = 2;   // CDP modifier bitmask: Alt 1, Ctrl 2, Meta 4, Shift 8.
    const mouse = (type, x, y, mods = 0) => c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1, modifiers: mods,
    });
    /** A BARE Control press — no character. This is the channel the live
     *  re-snap listener reads, and the one section 7 proves claims no chord. */
    const ctrlKey = async (down) => {
      await c.send('Input.dispatchKeyEvent', {
        type: down ? 'rawKeyDown' : 'keyUp',
        key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17,
        nativeVirtualKeyCode: 17, modifiers: down ? CTRL : 0, location: 1,
      });
      await sleep(200);
    };
    /**
     * A chord, PRESSED THE WAY A HAND PRESSES ONE: Ctrl goes down first, the
     * letter goes down and up under it, and Ctrl comes up last.
     *
     * The first version skipped the two Control events and only set the
     * `modifiers` bit on the letter — which is not what a browser delivers, and
     * it showed: the letter's keyUp still carries `ctrlKey: true` (correct — the
     * modifier really is still down at that instant), so nothing in the run ever
     * told the app the key had been let go, and the override flag stayed set
     * with no finger on anything. That was the HARNESS mis-modelling the
     * keyboard, not the app mis-reading it.
     *
     * `holdCtrl` keeps the final release back for the rows that mean to go on
     * holding it — a chord pressed DURING a Ctrl-held drag.
     */
    const chord = async (k, mods, { holdCtrl = false } = {}) => {
      const wantsCtrl = (mods & CTRL) !== 0;
      if (wantsCtrl) await ctrlKey(true);
      const base = {
        key: k, code: `Key${k.toUpperCase()}`,
        windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods,
      };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(320);
      if (wantsCtrl && !holdCtrl) await ctrlKey(false);
    };
    const key = async (k) => chord(k, 0);
    const marquee = () => c.json('window.__dbg.aeon.marquee()');
    const modState = () => c.json('window.__dbg.aeon.marqueeSnapModifier()');

    // ---- 2. Arm the tool, and choose an ODD target rect. -----------------
    await key('m');
    st = await c.json('window.__dbg.aeon.state()');
    check('2a', "the 'm' hotkey armed the marquee tool", st.tool === 'marquee', JSON.stringify(st.tool));

    // ODD IN ORIGIN AND ODD IN SIZE. Both halves matter: `isBlockAligned`
    // demands all four bounds even, and the store's own comment warns that a
    // Tile-mode drag landing on even bounds "behaves exactly like a Block-mode
    // one" — on even bounds the two granularities AGREE and every row below
    // would be measuring nothing. Row 2b asserts the oddness rather than
    // trusting these four literals, and 2d asserts the two derived
    // expectations actually differ.
    const SEL = { col: 11, row: 7, w: 5, h: 3 };
    const endCol = SEL.col + SEL.w - 1, endRow = SEL.row + SEL.h - 1;
    check('2b', 'ANTI-VACUOUS: the target rect is ODD in origin AND size — on even bounds '
      + 'the two granularities agree and no row below could discriminate',
      SEL.col % 2 === 1 && SEL.row % 2 === 1 && SEL.w % 2 === 1 && SEL.h % 2 === 1,
      JSON.stringify(SEL));

    // Aim at tile centres (+3 of 8) so the delivered integer cannot round into
    // a neighbouring tile at any device scale factor.
    const a = canvasOfTile(SEL.col, SEL.row);
    const b = canvasOfTile(endCol, endRow);
    const p0 = { x: aimX(a.x + 3), y: aimY(a.y + 3) };
    const p1 = { x: aimX(b.x + 3), y: aimY(b.y + 3) };
    const t0 = tileAt(p0.x, p0.y), t1 = tileAt(p1.x, p1.y);
    note('aim', `dpr=${dpr} rect.left=${rect.left} rect.top=${rect.top}\n        `
      + `press ${JSON.stringify(p0)} -> tile ${JSON.stringify(t0)} · `
      + `release ${JSON.stringify(p1)} -> tile ${JSON.stringify(t1)}`);
    check('2c', "ANTI-VACUOUS: the aim resolves through the app's own transform to the "
      + 'intended tiles — a device-pixel slip here would present as a feature bug',
      t0.col === SEL.col && t0.row === SEL.row && t1.col === endCol && t1.row === endRow,
      `wanted (${SEL.col},${SEL.row})..(${endCol},${endRow})`);

    /**
     * THE TWO EXPECTATIONS, DERIVED — transcribed from `snapMarquee` in
     * src/core/editing/map-clipboard.ts, with the source beside them, and fed
     * the tiles the app ITSELF resolved from the delivered integers (t0/t1),
     * never the tiles this file intended.
     *
     *   tile:   { col: minC, row: minR, w: maxC - minC + 1, h: maxR - minR + 1 }
     *   block:  col = floor(minC/2)*2 ; row = floor(minR/2)*2
     *           endCol = ceil((maxC+1)/2)*2 ; endRow = ceil((maxR+1)/2)*2
     *           { col, row, w: endCol - col, h: endRow - row }
     */
    const expectTile = (q0, q1) => ({
      col: Math.min(q0.col, q1.col), row: Math.min(q0.row, q1.row),
      w: Math.abs(q1.col - q0.col) + 1, h: Math.abs(q1.row - q0.row) + 1,
    });
    const expectBlock = (q0, q1) => {
      const minC = Math.min(q0.col, q1.col), maxC = Math.max(q0.col, q1.col);
      const minR = Math.min(q0.row, q1.row), maxR = Math.max(q0.row, q1.row);
      const col = Math.floor(minC / 2) * 2, row = Math.floor(minR / 2) * 2;
      return {
        col, row,
        w: Math.ceil((maxC + 1) / 2) * 2 - col,
        h: Math.ceil((maxR + 1) / 2) * 2 - row,
      };
    };
    const WANT_TILE = expectTile(t0, t1);
    const WANT_BLOCK = expectBlock(t0, t1);
    note('derived expectations',
      `tile-granular ${rectStr(WANT_TILE)} · block-granular ${rectStr(WANT_BLOCK)}`);
    check('2d', 'ANTI-VACUOUS: the two derived expectations DIFFER — if they agreed, every '
      + 'row below would pass under either granularity',
      !eq(WANT_TILE, WANT_BLOCK), `${rectStr(WANT_TILE)} vs ${rectStr(WANT_BLOCK)}`);

    /** One drag, start to finish, with `mods` on every mouse event. */
    const drag = async (mods) => {
      await mouse('mousePressed', p0.x, p0.y, mods);
      for (let i = 1; i <= 5; i++) {
        await mouse('mouseMoved',
          Math.round(p0.x + (p1.x - p0.x) * i / 5),
          Math.round(p0.y + (p1.y - p0.y) * i / 5), mods);
      }
      await mouse('mouseReleased', p1.x, p1.y, mods);
      await sleep(300);
      return marquee();
    };

    const GRID = {};

    // ---- 3. ARMED TO BLOCK (the shipped default). ------------------------
    check('3a', 'the marquee starts armed to BLOCK — the shipped default is untouched, which '
      + 'is exactly why a literal "Ctrl means block" would have been a no-op',
      (await c.evalExpr('window.__dbg.aeon.marqueeGranularity()')) === 'block');

    GRID.blockPlain = await drag(0);
    check('3b', 'CONTROL — block + no modifier rounds the odd drag OUT to even bounds',
      eq(GRID.blockPlain, WANT_BLOCK),
      `got ${rectStr(GRID.blockPlain)} want ${rectStr(WANT_BLOCK)}`);

    GRID.blockHeld = await drag(CTRL);
    check('3c', 'DISCRIMINATING — block + CTRL commits the dragged tiles EXACTLY. Same drag, '
      + 'same setting, one key: with the modifier unimplemented this is 3b\'s rounded rect',
      eq(GRID.blockHeld, WANT_TILE) && !eq(GRID.blockHeld, GRID.blockPlain),
      `got ${rectStr(GRID.blockHeld)} want ${rectStr(WANT_TILE)} · `
      + `unheld was ${rectStr(GRID.blockPlain)}`);
    check('3d', '...and it is reported NOT block-aligned, which is what gates collision',
      GRID.blockHeld?.aligned === false, JSON.stringify(GRID.blockHeld));
    await shot(c, '1-block-plus-ctrl');

    // ---- 4. ARMED TO TILE — the owner's literal request. -----------------
    const clicked = await c.evalExpr(clickExactButton('Tile'));
    check('4a', "the panel's Snap 'Tile' button exists exactly once and was clicked — the "
      + 'setting is changed through the real control, never through a store setter',
      clicked === 'ok', String(clicked));
    await sleep(250);
    check('4a2', 'clicking it reached the STORE — the control is wired, not decorative',
      (await c.evalExpr('window.__dbg.aeon.marqueeGranularity()')) === 'tile');

    GRID.tilePlain = await drag(0);
    check('4b', 'CONTROL — tile + no modifier takes the odd drag exactly',
      eq(GRID.tilePlain, WANT_TILE),
      `got ${rectStr(GRID.tilePlain)} want ${rectStr(WANT_TILE)}`);

    GRID.tileHeld = await drag(CTRL);
    check('4c', "DISCRIMINATING, THE OTHER WAY — tile + CTRL forces collision size, which is "
      + 'the owner\'s request in his own words. A modifier built as a CONSTANT rather than '
      + 'an inversion fails here while passing 3c',
      eq(GRID.tileHeld, WANT_BLOCK) && !eq(GRID.tileHeld, GRID.tilePlain),
      `got ${rectStr(GRID.tileHeld)} want ${rectStr(WANT_BLOCK)} · `
      + `unheld was ${rectStr(GRID.tilePlain)}`);
    check('4d', '...and it IS block-aligned, so it carries collision',
      GRID.tileHeld?.aligned === true, JSON.stringify(GRID.tileHeld));
    await shot(c, '2-tile-plus-ctrl');

    // ---- 5. THE WHOLE GRID AT ONCE. --------------------------------------
    note('the four combinations',
      `block+plain ${rectStr(GRID.blockPlain)}\n        `
      + `block+CTRL  ${rectStr(GRID.blockHeld)}\n        `
      + `tile +plain ${rectStr(GRID.tilePlain)}\n        `
      + `tile +CTRL  ${rectStr(GRID.tileHeld)}`);
    check('5a', 'THE COLLAPSED PAIRS ARE EQUAL: block+plain == tile+CTRL, and block+CTRL == '
      + 'tile+plain — the modifier is an INVERSION of the setting, not a second setting',
      eq(GRID.blockPlain, GRID.tileHeld) && eq(GRID.blockHeld, GRID.tilePlain),
      `${rectStr(GRID.blockPlain)}=${rectStr(GRID.tileHeld)} · `
      + `${rectStr(GRID.blockHeld)}=${rectStr(GRID.tilePlain)}`);
    check('5b', 'AND THE PAIRS DIFFER — which is what makes 3c and 4c measurements rather '
      + 'than two ways of asking whether the Snap button works',
      !eq(GRID.blockPlain, GRID.blockHeld),
      `${rectStr(GRID.blockPlain)} vs ${rectStr(GRID.blockHeld)}`);

    // ---- 6. LIVE-SAMPLED, WITH THE MOUSE COMPLETELY STILL. ---------------
    //
    // THE DESIGN QUESTION, MEASURED. Not one mouse event is sent between the
    // three reads: the drag is left open at p1 and only the KEY moves.
    {
      await c.evalExpr(clickExactButton('Block'));   // back to the default
      await sleep(200);
      await mouse('mousePressed', p0.x, p0.y, 0);
      for (let i = 1; i <= 5; i++) {
        await mouse('mouseMoved',
          Math.round(p0.x + (p1.x - p0.x) * i / 5),
          Math.round(p0.y + (p1.y - p0.y) * i / 5), 0);
      }
      await sleep(250);
      const midPlain = await marquee();
      check('6a', 'ANTI-VACUOUS: mid-drag, before any key, the rect is the block-snapped one',
        eq(midPlain, WANT_BLOCK), `got ${rectStr(midPlain)} want ${rectStr(WANT_BLOCK)}`);

      // The Snap row's rendering BEFORE the key, as the reference for what
      // "highlighted" looks like on this theme. Read from the two buttons
      // themselves rather than from a third control: the first version compared
      // against the Layers row's `Art` button and got `null`, because the shell
      // has an `Art` FACET button too and the exact-text lookup refused an
      // ambiguous match. The claim is a SWAP, and a swap needs no third party.
      const snapBtnPlain = await c.json(SNAP_BUTTON_STATE);
      note('Snap row, nothing held', JSON.stringify(snapBtnPlain));

      await ctrlKey(true);                            // ← the ONLY event
      const midHeld = await marquee();
      const modHeld = await modState();
      check('6b', 'A BARE CTRL PRESS RE-SNAPS THE LIVE RECT WITH THE MOUSE MOTIONLESS — this '
        + 'is what "live-sampled" has to mean; sampling only mouse events would leave a '
        + 'still hand watching a rect the panel disagrees with',
        eq(midHeld, WANT_TILE) && modHeld.invert === true && modHeld.effective === 'tile',
        `got ${rectStr(midHeld)} want ${rectStr(WANT_TILE)} · modifier=${JSON.stringify(modHeld)}`);

      const overrideDuring = await c.json(OVERRIDE_LINE);
      const snapBtnDuring = await c.json(SNAP_BUTTON_STATE);
      check('6c', 'THE PANEL SAYS SO WHILE IT IS HELD: the Ctrl-override caption is on screen '
        + 'exactly once, and the Snap highlight has SWAPPED onto the effective mode — a '
        + 'control still claiming Block here would be lying about the rect beside it',
        overrideDuring.count === 1 && /snapping to tiles/i.test(overrideDuring.text ?? '')
        && snapBtnDuring.tileBg === snapBtnPlain.blockBg
        && snapBtnDuring.blockBg === snapBtnPlain.tileBg,
        `caption=${JSON.stringify(overrideDuring)}\n        `
        + `buttons before=${JSON.stringify(snapBtnPlain)} during=${JSON.stringify(snapBtnDuring)}`);
      await shot(c, '3-live-override-held');

      await ctrlKey(false);                           // ← and released, still still
      const midReleased = await marquee();
      check('6d', 'RELEASING IT SNAPS BACK, still with no mouse event — the modifier is a '
        + 'live state, not a latch taken at mousedown',
        eq(midReleased, WANT_BLOCK), `got ${rectStr(midReleased)} want ${rectStr(WANT_BLOCK)}`);

      const overrideAfter = await c.json(OVERRIDE_LINE);
      const snapBtnAfter = await c.json(SNAP_BUTTON_STATE);
      check('6e', 'and the caption is GONE and the highlight has swapped straight back onto '
        + 'the armed mode',
        overrideAfter.count === 0
        && snapBtnAfter.blockBg === snapBtnPlain.blockBg
        && snapBtnAfter.tileBg === snapBtnPlain.tileBg,
        `caption=${JSON.stringify(overrideAfter)}\n        `
        + `buttons after=${JSON.stringify(snapBtnAfter)} vs before=${JSON.stringify(snapBtnPlain)}`);

      // NOW release the button. mouseup must not recompute anything.
      await mouse('mouseReleased', p1.x, p1.y, 0);
      await sleep(300);
      const committed = await marquee();
      check('6f', 'PREVIEW AND COMMIT ARE THE SAME VALUE: mouseup changes the rect not at '
        + 'all. It is the one authority question this design has to answer, and it answers '
        + 'it by having exactly one writer — a rect that re-snapped at release could show '
        + 'one grid and commit another',
        eq(committed, midReleased),
        `at last repaint ${rectStr(midReleased)} · after mouseup ${rectStr(committed)}`);
    }

    // ---- 6g. THE OTHER ORDER: release the KEY last. ----------------------
    //
    // The awkward case named in the brief — the key goes up between the last
    // mousemove and the mouseup. Here mouseup fires FIRST (key still down), so
    // the rect must be the held one and the later keyup must not touch a
    // selection whose drag is over.
    {
      await mouse('mousePressed', p0.x, p0.y, CTRL);
      await mouse('mouseMoved', p1.x, p1.y, CTRL);
      await sleep(200);
      await ctrlKey(true);                 // the key really is down now
      await mouse('mouseReleased', p1.x, p1.y, CTRL);
      await sleep(250);
      const atRelease = await marquee();
      await ctrlKey(false);                // ...and released AFTER the button
      await sleep(250);
      const afterKeyUp = await marquee();
      check('6g', 'a keyup AFTER the button came up leaves the committed rect alone — the '
        + 'drag is over, and a stale cursor tile must not let a key re-write a finished '
        + 'selection',
        eq(atRelease, WANT_TILE) && eq(afterKeyUp, atRelease),
        `at release ${rectStr(atRelease)} · after keyup ${rectStr(afterKeyUp)} · `
        + `want ${rectStr(WANT_TILE)}`);
    }

    // ---- 7. THE MODIFIER-CONFLICT CHECK. ---------------------------------
    //
    // Ctrl is already bound here: Ctrl+C copy, Ctrl+V paste, and a blanket
    // `if (e.ctrlKey || e.metaKey || e.altKey) return` before the tool letters.
    // These rows hold it through a drag and then use those bindings.
    {
      // 7a — Ctrl+C MID-DRAG, with Ctrl held for the drag itself. The question
      // is whether the chord copies the rect the author can SEE.
      await ctrlKey(true);
      await mouse('mousePressed', p0.x, p0.y, CTRL);
      await mouse('mouseMoved', p1.x, p1.y, CTRL);
      await sleep(250);
      const onScreen = await marquee();
      await chord('c', CTRL, { holdCtrl: true });
      await sleep(250);
      const clip = await c.json('window.__dbg.aeon.mapClipboardInfo()');
      check('7a', 'CONFLICT CHECK — Ctrl+C pressed MID-DRAG with Ctrl already held for the '
        + 'drag copies exactly the rect on screen (the INVERTED one), not some other rect '
        + 'and not nothing',
        !!clip && !!onScreen && clip.widthTiles === onScreen.w && clip.heightTiles === onScreen.h
        && eq(onScreen, WANT_TILE),
        `on screen ${rectStr(onScreen)} · clipboard ${JSON.stringify(clip)}`);

      // 7b — the tool letters must still be unreachable under Ctrl. 'b' is
      // paint-block; the existing guard is what keeps Ctrl+B (whose real owner
      // is the Explorer toggle) from arming a paint tool, and this parcel must
      // not have opened it.
      //
      // ⚠ CTRL+B MOVES THE CANVAS. Its real owner opens a left sidebar, and the
      // first run of this file measured the consequence rather than the feature:
      // the drag in 7c landed at tile col 34 instead of 10 — exactly the 192px
      // the Explorer is wide — and the row failed against an app that was right.
      // So it is pressed twice, and the restored geometry is ASSERTED against
      // the rect every expectation in this file was derived from. That the
      // layout moved at all is itself the evidence the chord reached its owner
      // and not us.
      await chord('b', CTRL, { holdCtrl: true });
      await sleep(300);
      const toolAfter = (await c.json('window.__dbg.aeon.state()')).tool;
      const rectShifted = await c.json(CANVAS_RECT);
      check('7b', 'CONFLICT CHECK — Ctrl+B mid-drag still cannot arm paint-block: the tool '
        + "letters' modifier guard is untouched, and this parcel claimed no chord. (The map "
        + 'canvas MOVED, which is its real owner — the Explorer toggle — receiving it.)',
        toolAfter === 'marquee' && rectShifted.left !== rect.left,
        `tool=${JSON.stringify(toolAfter)} · canvas left ${rect.left} -> ${rectShifted.left}`);

      await chord('b', CTRL, { holdCtrl: true });   // ...and put the layout back
      await sleep(400);
      const rectBack = await c.json(CANVAS_RECT);
      check('7b2', 'ANTI-VACUOUS: the layout is restored, so every derived expectation below '
        + 'still refers to the geometry it was computed from',
        rectBack.left === rect.left && rectBack.top === rect.top,
        `${JSON.stringify(rectBack)} vs ${JSON.stringify(rect)}`);

      await mouse('mouseReleased', p1.x, p1.y, CTRL);
      await ctrlKey(false);
      await sleep(250);

      // 7c — and an ORDINARY Ctrl+C, after the key has been through a drag,
      // still works. A listener that latched or swallowed would show here.
      const plain = await drag(0);
      await chord('c', CTRL);
      await sleep(300);
      const clip2 = await c.json('window.__dbg.aeon.mapClipboardInfo()');
      check('7c', 'CONFLICT CHECK — an ordinary Ctrl+C after the key has been held through a '
        + 'drag copies the plain block-snapped rect, unaffected',
        !!clip2 && eq(plain, WANT_BLOCK)
        && clip2.widthTiles === plain.w && clip2.heightTiles === plain.h,
        `rect ${rectStr(plain)} · clipboard ${JSON.stringify(clip2)}`);

      const modIdle = await modState();
      check('7d', 'the modifier flag is FALSE once nothing is held — a stuck override would '
        + 'leave the panel narrating a key no finger is on',
        modIdle.invert === false && modIdle.effective === modIdle.armed,
        JSON.stringify(modIdle));
    }

    // ---- 8. NOTHING BROKE. -----------------------------------------------
    const errs = await readErrors();
    const alive = await c.json('window.__dbg.aeon.state()').catch(() => null);
    const rooted = await c.evalExpr(
      `!!document.getElementById('map-canvas') && document.querySelectorAll('canvas').length > 0`);
    check('8a', 'the whole run threw nothing and left the React root mounted',
      errs.length === 0 && !!alive && alive.open === true && rooted === true,
      `pageErrors=${JSON.stringify(errs)} rootMounted=${rooted}`);
    check('8b', 'nothing was written: a marquee is a selection and pushes no command, so the '
      + 'undo stack is where it started',
      (await c.evalExpr('window.__dbg.aeon.canUndo()')) === false,
      `canUndo=${await c.evalExpr('window.__dbg.aeon.canUndo()')}`);

    await c.send('Page.reload');
  } catch (err) {
    // A THROW MUST NOT EXIT 0 — a tidy "N/N rows passed" over rows that never
    // ran is worse than a failure.
    check('ZZ', 'the harness ran to completion (a throw here means the rows below it never ran)',
      false, `${err && err.stack ? err.stack : err}`);
  } finally {
    console.log('');
    const pass = results.filter((r) => r.ok).length;
    console.log(`${pass}/${results.length} rows passed`);
    if (fails.length) { console.log('FAILING ROWS:'); for (const f of fails) console.log('  ' + f); }
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
    process.exit(fails.length ? 1 : 0);
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
