#!/usr/bin/env node
// CAN YOU MIDDLE-DRAG THE MAP WHILE PASTE MODE IS ARMED?
//
// The owner, 2026-08-28: *"When I'm in paste mode with marquee I can't middle
// mouse click to move around"*.
//
// ═══ THE DEFECT SHAPE, WHICH IS NOW WELL EVIDENCED IN THIS FACET ═══
//
// A RULE ENFORCED IN ONE HANDLER AND NOT HONOURED BY ITS SIBLING. Three
// instances in one day: the batch-command repaint recursed on one path and not
// the other; the paint tools truncated the nametable word in the press handler
// AND in the drag handler, and only the press one was found by reading; and
// here `handleMouseDown` says in a comment *"Left-click only (button 0) —
// middle-click must still fall through to pan"* and keeps that promise, while
// `handleMouseMove` returns out of its paste branch before the pan handler at
// the bottom ever runs. The press starts a pan the move handler then discards.
//
// ═══ WHY THE FIX COULD NOT SIMPLY BE AN EARLY RETURN ═══
//
// The paste branch's own comment records a prior decision: it is unconditional
// so *"the ghost can't get stuck showing a stale cell"*. `if
// (isDragging.current) return;` at the top would put that bug straight back.
// Both behaviours are wanted at once and they are not in tension — a pan moves
// the map under the cursor, so the world position beneath the pointer really
// does change and the ghost SHOULD follow it. Row 4c is what holds that half.
//
// ═══ WHAT EACH ROW IS BUILT TO CATCH ═══
//
//  4a  THE BUG ITSELF. Camera position read from `__dbg.view()`, before and
//      after — never from the ghost, which is the quantity the bug leaves
//      moving. Asserts the camera moved by the amount `viewStore.pan` itself
//      defines for that delta, derived below with the source beside it.
//  4b  NO PASTE WAS COMMITTED. Section 0's own nametable, hashed in the page,
//      identical across the whole gesture,
//      and `canUndo` still false. A pan that pasted at the end would be far
//      worse than a pan that did not work.
//  4c  THE GHOST AND THE CAMERA AGREE — the ghost's footprint is the one the
//      app's own transform predicts for the cursor under the NEW camera. A
//      grab-drag holds the world under the pointer still, so the right answer
//      is the cell it started on: the ghost stays glued to the map.
//  4d  THE GHOST IS LIVE — the property the existing comment protects, tested
//      where the answers actually differ. 4c alone CANNOT see a frozen ghost
//      (post-fix, frozen and live both read the same cell), so 4d hovers to a
//      new point after the pan: frozen fails, stale-camera fails, and 4d2
//      asserts those three candidate answers are all different.
//  5a  THE CONTROL. A LEFT drag in paste mode must still behave as it does
//      today — commit a paste on the press and NOT pan. Without it, rows 4a-4c
//      cannot distinguish "middle-click now pans" from "paste mode stopped
//      working", which a `return` in the wrong place would produce.
//  5b  ...and the left press must still have pasted, proven on the document
//      hash, not on a toast.
//
// ANTI-VACUOUS: 3a proves paste mode is actually armed with a real clipboard
// before any of it (a middle-drag with paste mode OFF pans on master already,
// so a row that forgot to enter the mode would be green from the first line).
//
// ⚠ AIM AT INTEGER CLIENT PIXELS. devicePixelRatio under Xvfb is not 1 on every
//   host here. Every coordinate is an integer and every expectation is derived
//   from that integer through the app's own transform. dpr, rect and aim print.
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed; the one paste row 5
//   commits is undone before the run ends.
// ⚠ NO EMULATOR.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:paste-pan

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9398);
const ROOT = AURORA_DIR;
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron'));
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-paste-pan`;
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
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-paste-pan/${name}.png`);
}

/**
 * THE SECTION-0 FOREGROUND NAMETABLE, hashed in the page.
 *
 * `__dbg.docHash` belongs to the CLASSIC composer document and returns nothing
 * for an aeon act — the first run of this file threw on it. This hashes the
 * quantity a paste actually writes, which is a better measurement anyway: it
 * cannot report "unchanged" because it was reading some other document.
 */
const NT_HASH = String.raw`
(() => {
  const g = window.__dbg.aeon.ntRect(0, 0, 0, 64, 64);
  if (!g) return null;
  let h = 2166136261;
  for (let i = 0; i < g.length; i++) { h = ((h ^ g[i]) >>> 0) * 16777619 >>> 0; }
  return h;
})()`;

const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`;

/** WHERE THE FOREGROUND ART IS, in section-0 tile coords — a window with real
 *  non-zero tile indices, so the paste in section 5 has something to write and
 *  the document hash it moves is moved by art rather than by nothing. */
const FG_RICH = (wTiles, hTiles) => String.raw`
(() => {
  const N = 64;
  const grid = window.__dbg.aeon.ntRect(0, 0, 0, N, N);
  if (!grid) return null;
  const W = ${wTiles}, H = ${hTiles};
  let best = null;
  for (let r = 0; r + H <= N; r++) {
    for (let c = 0; c + W <= N; c++) {
      const tiles = new Set();
      for (let dr = 0; dr < H; dr++) for (let dc = 0; dc < W; dc++) {
        const w = grid[(r + dr) * N + (c + dc)];
        if (w !== 0 && (w & 0x7FF) !== 0) tiles.add(w & 0x7FF);
      }
      const rec = { col: c, row: r, distinctTiles: tiles.size };
      if (!best || rec.distinctTiles > best.distinctTiles) best = rec;
    }
  }
  return best;
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
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
        }
        return 'ok';
      })()`);

    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');

    // ---- 0. PROVENANCE. --------------------------------------------------
    // `pasteGhost` is introduced by THIS parcel and exists nowhere on master.
    // Without it, row 4c could not read the quantity it is about at all, and
    // the row's absence would be invisible in a green total.
    const probes = await c.json(`({
      pasteGhost: typeof window.__dbg.aeon.pasteGhost,
      view: typeof window.__dbg.view,
      ntRect: typeof window.__dbg.aeon.ntRect,
    })`);
    check('0a', 'the build under test contains this parcel (pasteGhost probe present) and the '
      + 'camera/document probes row 4a and 4b read',
      probes.pasteGhost === 'function' && probes.view === 'function' && probes.ntRect === 'function',
      `${ROOT}/dist — ${JSON.stringify(probes)}`);

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();
    await c.evalExpr('window.__harnessErrors = []');

    // ---- 1. Open aeon, pin the camera. -----------------------------------
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
    const view0 = await c.json('window.__dbg.view()');
    check('1b', 'ANTI-VACUOUS: the camera is at a known, unzoomed origin',
      view0.x === 0 && view0.y === 0 && view0.zoom === 1, JSON.stringify(view0));

    const rect = await c.json(CANVAS_RECT);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    check('1c', 'ANTI-VACUOUS: the map canvas is mounted and has a real box',
      !!rect && rect.width > 200 && rect.height > 200,
      `dpr=${dpr} rect=${JSON.stringify(rect)}`);

    const aimX = (cx) => Math.round(rect.left + cx);
    const aimY = (cy) => Math.round(rect.top + cy);
    /** The app's own transform, for section 0 at zoom 1 with an arbitrary
     *  camera. Expectations go through THIS, never through a typed number. */
    const tileAtWithView = (clientX, clientY, v) => ({
      col: Math.floor((v.x + (clientX - rect.left) / v.zoom) / 8),
      row: Math.floor((v.y + (clientY - rect.top) / v.zoom) / 8),
    });
    const canvasOfTile = (col, row) => ({ x: col * 8 - view0.x, y: row * 8 - view0.y });

    const mouse = (type, x, y, button, buttons, mods = 0) =>
      c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1, modifiers: mods });
    const chord = async (k, mods) => {
      const base = {
        key: k, code: `Key${k.toUpperCase()}`,
        windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods,
      };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(320);
    };
    const key = async (k) => chord(k, 0);
    const CTRL = 2;

    // ---- 2. Copy something, so there is a clipboard to paste. ------------
    await key('m');
    const art = await c.json(FG_RICH(4, 4));
    check('2a', 'ANTI-VACUOUS: section 0 has a foreground-rich 4x4 region to copy — a paste '
      + 'of blank ground would move no document hash and row 5b would prove nothing',
      !!art && art.distinctTiles >= 3, JSON.stringify(art));
    {
      // An EVEN origin and size, so the clipboard carries collision and pastes
      // on the block grid — the ordinary case the owner was in.
      const src = { col: art.col & ~1, row: art.row & ~1, w: 4, h: 4 };
      const a = canvasOfTile(src.col, src.row);
      const b = canvasOfTile(src.col + src.w - 1, src.row + src.h - 1);
      await mouse('mousePressed', aimX(a.x + 3), aimY(a.y + 3), 'left', 1);
      await mouse('mouseMoved', aimX(b.x + 3), aimY(b.y + 3), 'left', 1);
      await mouse('mouseReleased', aimX(b.x + 3), aimY(b.y + 3), 'left', 0);
      await sleep(300);
      await chord('c', CTRL);
      await sleep(300);
    }
    const clip = await c.json('window.__dbg.aeon.mapClipboardInfo()');
    check('2b', 'ANTI-VACUOUS: the map clipboard holds real art',
      !!clip && clip.nonzeroTiles > 0, JSON.stringify(clip));

    // ---- 3. Enter paste mode. --------------------------------------------
    await chord('v', CTRL);
    await sleep(400);
    // Hover once so the ghost has a cell before anything drags.
    const HOVER = { col: 20, row: 20 };
    const h0 = canvasOfTile(HOVER.col, HOVER.row);
    await mouse('mouseMoved', aimX(h0.x + 3), aimY(h0.y + 3), 'none', 0);
    await sleep(300);
    const ghost0 = await c.json('window.__dbg.aeon.pasteGhost()');
    check('3a', 'ANTI-VACUOUS: paste mode is ARMED and the ghost has a cell. A middle-drag '
      + 'with paste mode OFF pans on master already, so a run that forgot to enter the mode '
      + 'would be green from the first line',
      !!ghost0 && ghost0.pasting === true && ghost0.hover !== null,
      JSON.stringify(ghost0));
    await shot(c, '1-paste-mode-armed');

    // ---- 4. THE BUG: middle-drag must pan. -------------------------------
    const PAN_DX = -96, PAN_DY = -64;   // move the cursor left/up: the map follows
    {
      const before = await c.json('window.__dbg.view()');
      const hashBefore = await c.evalExpr(NT_HASH);
      const undoBefore = await c.evalExpr('window.__dbg.aeon.canUndo()');

      const from = { x: aimX(h0.x + 3), y: aimY(h0.y + 3) };
      const to = { x: from.x + PAN_DX, y: from.y + PAN_DY };
      // `buttons` bitmask on the MOVE events matters: 4 is the middle button
      // held. A move with buttons 0 is a hover, not a drag.
      await mouse('mousePressed', from.x, from.y, 'middle', 4);
      for (let i = 1; i <= 4; i++) {
        await mouse('mouseMoved',
          Math.round(from.x + PAN_DX * i / 4), Math.round(from.y + PAN_DY * i / 4), 'middle', 4);
        await sleep(60);
      }
      await mouse('mouseReleased', to.x, to.y, 'middle', 0);
      await sleep(400);

      const after = await c.json('window.__dbg.view()');
      /**
       * THE EXPECTATION, DERIVED — `viewStore.pan(dx, dy)` moves the camera by
       * `-dx / zoom`, which is what makes a drag feel like grabbing the map:
       * the world under the cursor is meant to stay put. Summed over the four
       * steps that is exactly `-PAN_DX / zoom`, whatever the intermediate
       * rounding, because each step's delta is taken from the previous
       * position.
       */
      // ...and `pan` CLAMPS at 0 (`Math.max(0, vpX - dx / zoom)`), transcribed
      // here rather than assumed away: this run pans in the positive direction
      // so the clamp never bites, but a derivation that omitted it would be a
      // different function from the one under test.
      const wantX = Math.max(0, before.x - PAN_DX / before.zoom);
      const wantY = Math.max(0, before.y - PAN_DY / before.zoom);
      note('pan', `dpr=${dpr} · cursor ${JSON.stringify(from)} -> ${JSON.stringify(to)}\n        `
        + `camera ${JSON.stringify(before)} -> ${JSON.stringify(after)} · `
        + `want (${wantX}, ${wantY})`);
      check('4a', 'THE BUG — a MIDDLE-DRAG in paste mode moves the camera. Read from the '
        + "camera itself, never from the ghost, which is the quantity the defect leaves "
        + 'moving',
        after.x === wantX && after.y === wantY,
        `got (${after.x}, ${after.y}) want (${wantX}, ${wantY}) — `
        + `unmoved would be (${before.x}, ${before.y})`);

      const hashAfter = await c.evalExpr(NT_HASH);
      const undoAfter = await c.evalExpr('window.__dbg.aeon.canUndo()');
      check('4b', 'NO PASTE WAS COMMITTED BY THE PAN — the document hash is identical across '
        + 'the whole gesture and the undo stack never grew. A pan that pasted at the end '
        + 'would be far worse than a pan that did not work',
        hashAfter === hashBefore && undoAfter === undoBefore,
        `section-0 nametable hash ${hashBefore} -> ${hashAfter} · `
        + `canUndo ${undoBefore} -> ${undoAfter}`);

      // 4c — THE PROPERTY THE EXISTING COMMENT PROTECTS. The paste branch is
      // unconditional so "the ghost can't get stuck showing a stale cell"; a
      // fix that pans while freezing the ghost trades one bug for another.
      const ghost1 = await c.json('window.__dbg.aeon.pasteGhost()');
      const cursorTile = tileAtWithView(to.x, to.y, after);
      const step = clip.artOnly ? 1 : 2;
      const wantHover = {
        baseCol: Math.floor(cursorTile.col / step) * step,
        baseRow: Math.floor(cursorTile.row / step) * step,
      };
      check('4c', "THE GHOST AND THE CAMERA AGREE: the ghost's footprint is the one the "
        + "app's OWN transform predicts for the cursor under the NEW camera. A grab-drag "
        + 'holds the world under the pointer STILL, so the right answer here is the cell it '
        + 'started on — the ghost stays glued to the map, which is what a pan means',
        !!ghost1?.hover && ghost1.hover.baseCol === wantHover.baseCol
        && ghost1.hover.baseRow === wantHover.baseRow,
        `ghost ${JSON.stringify(ghost1?.hover)} want ${JSON.stringify(wantHover)} · `
        + `cursor tile ${JSON.stringify(cursorTile)} step=${step} · `
        + `before the pan it was ${JSON.stringify(ghost0.hover)}`);
      check('4c2', 'ANTI-VACUOUS: the paste branch RAN during the drag rather than being '
        + 'skipped — the published paint count moved',
        ghost1.paints > ghost0.paints, `paints ${ghost0.paints} -> ${ghost1.paints}`);

      // ═══ 4d — CAN THIS FILE SEE A FROZEN GHOST AT ALL? ═══
      //
      // The first version asked whether the ghost MOVED during the pan and
      // failed the fixed app, because it was measuring the wrong property: a
      // grab-drag keeps the world under the cursor invariant, so a correct
      // ghost stays exactly where it was. That made 4c vacuous in the same
      // stroke — post-fix, a ghost frozen at (20,20) and a live one both read
      // (20,20), and no row could tell them apart.
      //
      // So the ghost is exercised where the two answers DIFFER: a plain hover
      // (no buttons) to a new point after the pan. A frozen ghost stays put and
      // fails; a ghost computed against the PRE-pan camera lands on a different
      // cell and fails; only a live ghost reading the panned camera passes.
      const probe = { x: to.x + 120, y: to.y + 80 };
      await mouse('mouseMoved', probe.x, probe.y, 'none', 0);
      await sleep(300);
      const ghost2 = await c.json('window.__dbg.aeon.pasteGhost()');
      const probeTile = tileAtWithView(probe.x, probe.y, after);
      const wantProbe = {
        baseCol: Math.floor(probeTile.col / step) * step,
        baseRow: Math.floor(probeTile.row / step) * step,
      };
      const staleCameraTile = tileAtWithView(probe.x, probe.y, before);
      const wantStale = {
        baseCol: Math.floor(staleCameraTile.col / step) * step,
        baseRow: Math.floor(staleCameraTile.row / step) * step,
      };
      check('4d', 'THE GHOST IS LIVE AND USES THE PANNED CAMERA — hovering to a new point '
        + 'after the pan puts it on the cell the NEW camera predicts. A frozen ghost stays on '
        + "the old cell; one reading the stale camera lands somewhere else again. This is the "
        + 'row that catches a fix which pans while stranding the ghost',
        !!ghost2?.hover && ghost2.hover.baseCol === wantProbe.baseCol
        && ghost2.hover.baseRow === wantProbe.baseRow,
        `ghost ${JSON.stringify(ghost2?.hover)} want ${JSON.stringify(wantProbe)} · `
        + `frozen would be ${JSON.stringify(wantHover)} · `
        + `stale-camera would be ${JSON.stringify(wantStale)}`);
      check('4d2', 'ANTI-VACUOUS for 4d: the three candidate answers are all DIFFERENT, so '
        + 'that row is a measurement rather than a coincidence',
        (wantProbe.baseCol !== wantHover.baseCol || wantProbe.baseRow !== wantHover.baseRow)
        && (wantProbe.baseCol !== wantStale.baseCol || wantProbe.baseRow !== wantStale.baseRow),
        `live ${JSON.stringify(wantProbe)} · frozen ${JSON.stringify(wantHover)} · `
        + `stale-camera ${JSON.stringify(wantStale)}`);
      await shot(c, '2-after-middle-pan');
    }

    // ---- 5. THE CONTROL: a LEFT drag in paste mode is unchanged. ---------
    //
    // Without this, 4a-4c cannot distinguish "middle-click now pans" from
    // "paste mode stopped working" — which a `return` in the wrong place would
    // produce, and which would look identical in every row above.
    {
      const viewBefore = await c.json('window.__dbg.view()');
      const hashBefore = await c.evalExpr(NT_HASH);
      const p = { x: aimX(h0.x + 3), y: aimY(h0.y + 3) };
      await mouse('mouseMoved', p.x, p.y, 'none', 0);
      await sleep(250);
      await mouse('mousePressed', p.x, p.y, 'left', 1);
      await mouse('mouseMoved', p.x + 40, p.y + 40, 'left', 1);
      await mouse('mouseReleased', p.x + 40, p.y + 40, 'left', 0);
      await sleep(500);

      const viewAfter = await c.json('window.__dbg.view()');
      check('5a', 'CONTROL — a LEFT drag in paste mode still does NOT pan: paste mode keeps '
        + 'the left button, exactly as it does today',
        viewAfter.x === viewBefore.x && viewAfter.y === viewBefore.y,
        `${JSON.stringify(viewBefore)} -> ${JSON.stringify(viewAfter)}`);

      const hashAfter = await c.evalExpr(NT_HASH);
      check('5b', "...and it still PASTED, proven on section 0's own nametable rather than on "
        + 'a toast',
        hashAfter !== hashBefore && (await c.evalExpr('window.__dbg.aeon.canUndo()')) === true,
        `section-0 nametable hash ${hashBefore} -> ${hashAfter}`);
      check('5c', 'and paste mode is STILL armed after the commit — repeat pastes, as before',
        (await c.json('window.__dbg.aeon.pasteGhost()')).pasting === true);
    }

    // ---- 6. LEAVE NOTHING BEHIND. ----------------------------------------
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    let guard = 0;
    while ((await c.evalExpr('window.__dbg.aeon.canUndo()')) === true && guard++ < 20) {
      await chord('z', CTRL);
    }
    const errs = await c.json('window.__harnessErrors || []');
    check('6a', 'the run undid its one paste and threw nothing (no Ctrl+S either way)',
      guard < 20 && errs.length === 0, `undos=${guard} pageErrors=${JSON.stringify(errs)}`);
    await c.send('Page.reload');
  } catch (err) {
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
