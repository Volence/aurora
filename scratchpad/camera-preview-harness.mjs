#!/usr/bin/env node
// THE CAMERA PREVIEW, DRIVEN IN THE REAL APP.
//
// The owner: *"I just want it to appear how it would in game"*, and on how to
// move the camera, *"realistically you should be using arrow keys in the editor
// to get a smoother feel and less immediate jump"*.
//
// ~5,170 vitest rows pass over this tree and not one can see a canvas, a React
// commit or a keystroke. Everything about what appears on screen is here.
//
// ═══ THE ROW THAT DISCRIMINATES, AND WHY A STATIC ONE CANNOT ═══
//
// ⚠ A SINGLE FRAME PASSES WHETHER OR NOT FACTORS ARE APPLIED AT ALL. Every band
// shows SOME column of Plane B for any camera; a row that asserts "the composite
// drew" is green with the factor decode deleted and `scrollX` hard-wired to 0.
// The property is DIFFERENTIAL and it is about the bands AGAINST EACH OTHER:
//
//   THE CATCHER IS 3a. Move the camera 256 px with the arrow keys and assert
//   each band's displacement is `decode(camX+256, fb) - decode(camX, fb)` — and,
//   independently of any absolute value, that the FACTOR_1_2 band moved EIGHT
//   TIMES what the FACTOR_1_16 band moved. Eight is derived from the document's
//   own factor names, not read off a screenshot.
//
//   THE SECOND CATCHER IS 4a: a band whose `fb` is FACTOR_LOCKED must not move
//   at all across the same camera move, while its neighbours do. A locked band
//   that creeps is the sentinel bug, and 3a alone does not see it (no shipped
//   scene has a locked band, which is why this row AUTHORS one).
//
//   THE THIRD CATCHER IS 5b, and it is the owner's other sentence — "if I move
//   the viewport it drags the layers which I don't want". Move the camera and
//   the guides must hold the same WORLD row, because a locked layer top is a
//   PLANE ROW and a locked plane does not track the camera.
//
// ⚠ IF ONE OF THESE WENT GREEN FOR A REASON OTHER THAN THE RULE HOLDING, what
// would it be? Three answers, each with a row that rules it out:
//   (i)  nothing drew, so every band reads its default — ruled out by 2c, which
//        asserts `blits > 0` and `paints` ADVANCING, i.e. a repaint happened.
//   (ii) the arrow key did nothing and both samples are the same frame — ruled
//        out by 3a asserting camX MOVED by exactly the expected amount, and by
//        3b measuring the fine step separately.
//   (iii) the report is a re-derivation rather than what was drawn — ruled out
//        structurally: `cameraPreview()` publishes the array `drawCameraPreview`
//        blitted from, in the same call, plus the blit COUNT.
//
// NON-DISCRIMINATING ROWS ARE LABELLED `[anti-vacuous]` IN THEIR NAME.
//
// ═══ AIM AT INTEGERS ═══
//
// `devicePixelRatio` here has been seen at both 1 and 1.35 in one session. Every
// mouse coordinate rounds to the integer client pixel CDP delivers; dpr, rect,
// load and uptime are printed beside every run.
//
// ⚠ IT WRITES NOTHING TO THE AEON TREE. Ctrl+S is never pressed, and AEON_DIR
// must be a COPY — never the owner's live tree, never
// scratchpad/fixtures/aeon-build-pin, which his window has open.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Build first:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:          AEON_DIR=<copy> node scratchpad/camera-preview-harness.mjs

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9412);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR || !existsSync(AEONDIR)) {
  throw new Error('AEON_DIR must point at a COPY of an aeon tree — never the live one');
}
if (AEONDIR.includes('aeon-build-pin') || AEONDIR === siblingDefaultPathOrUnresolved('aeon')) {
  throw new Error('AEON_DIR names a tree the owner has open — make your own copy');
}
const SHOTS = `${ROOT}/scratchpad/shots-camera-preview`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_FLAT = 'ojz_act1_start';   // 5 layers, locked, no vsplits, no curves
const SCENE_DEEP = 'ojz_act1_depth';   // 5 layers, locked, three vsplits, two curves

// ═══ THE FACTOR TABLE, TRANSCRIBED HERE INDEPENDENTLY ═══
// From aeon engine/level/parallax_dsl.emp:25-40. It is a SECOND statement of the
// same fact, written from the engine rather than imported from the app — the
// harness must not be able to agree with the app by calling it.
const PACKED = {
  FACTOR_LOCKED: [15, 15, 0], FACTOR_0: [15, 15, 0],
  FACTOR_1: [0, 15, 0], FACTOR_1_2: [1, 15, 0], FACTOR_1_4: [2, 15, 0],
  FACTOR_1_8: [3, 15, 0], FACTOR_1_16: [4, 15, 0], FACTOR_1_32: [5, 15, 0],
  FACTOR_3_4: [0, 2, 1], FACTOR_3_8: [2, 3, 0], FACTOR_3_16: [3, 4, 0],
  FACTOR_5_8: [1, 3, 0], FACTOR_5_16: [2, 4, 0], FACTOR_7_8: [0, 3, 1],
  FACTOR_7_16: [1, 4, 1], FACTOR_15_16: [0, 4, 1],
};
const w16 = (v) => ((v | 0) << 16) >> 16;
/** Decode_Factor_A, term for term. 15 in s1 is LOCKED; 15 in s2 is single-term. */
function decode(camX, name) {
  const p = PACKED[name];
  if (!p) return 0;
  const [s1, s2, op] = p;
  if (s1 === 15) return 0;
  const first = w16(camX) >> s1;
  if (s2 === 15) return w16(first);
  const second = w16(camX) >> s2;
  return w16(op === 1 ? first - second : first + second);
}

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
  let closed = null;
  ws.addEventListener('close', (ev) => { closed = `CDP socket closed (code ${ev.code})`; });
  // ⚠ EVERY CALL IS TIMED OUT. Without this a socket that closes mid-run leaves
  // an await that never settles, node's event loop empties, and the process
  // exits 0 having reported nothing — which reads as "the harness passed and
  // stopped printing". It cost a run to find.
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed) { reject(new Error(`${method}: ${closed}`)); return; }
    const id = nextId++;
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method}: no reply in 20s${closed ? ` (${closed})` : ''}`));
    }, 20000);
    pending.set(id, (m) => {
      clearTimeout(t);
      return m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result);
    });
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
  console.log(`        shot → scratchpad/shots-camera-preview/${name}.png`);
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

/** Tick a View-menu checkbox by its LABEL text. Returns the state it ended in. */
const SET_OVERLAY = (labelRe, want) => String.raw`
(() => {
  const lab = [...document.querySelectorAll('label')]
    .find((l) => ${labelRe}.test((l.textContent || '').trim()));
  if (!lab) return { found: false };
  const box = lab.querySelector('input[type=checkbox]');
  if (!box) return { found: false };
  const was = box.checked;
  if (box.checked !== ${want}) box.click();
  return { found: true, was, now: box.checked };
})()`;

/** The Nth <select> whose title starts with `prefix`, set to `value`. */
const SET_NTH_SELECT = (prefix, n, value) => String.raw`
(() => {
  const all = [...document.querySelectorAll('select')]
    .filter((s) => (s.title || '').startsWith(${JSON.stringify(prefix)}));
  const sel = all[${n}];
  if (!sel) return { found: false, count: all.length };
  if (![...sel.options].some((o) => o.value === ${JSON.stringify(value)})) {
    return { found: true, hasOption: false, options: [...sel.options].map((o) => o.value) };
  }
  const was = sel.value;
  sel.value = ${JSON.stringify(value)};
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return { found: true, hasOption: true, was, now: sel.value, count: all.length };
})()`;

const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`;

/** The panel titles its selects per layer: `Layer 0 fb — how far Plane B, ...`. */
const fbTitle = (n) => `Layer ${n} fb — how far Plane B`;

/** Open a collapsible properties section by header text (they arrive shut). */
const SECTION_STATE = (re, click) => String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => ${re}.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return 'no-section';
  const open = hdr.parentElement.parentElement.children.length > 1;
  if (!${click ? 'true' : 'false'}) return open ? 'open' : 'collapsed';
  if (open) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

/** Open the View menu and confirm it is showing before reading a checkbox. */
async function openViewMenu(c) {
  for (let i = 0; i < 4; i++) {
    await c.evalExpr(clickByText('/^View/'));
    await sleep(350);
    const n = await c.evalExpr(
      `[...document.querySelectorAll('label')].filter(l => l.querySelector('input[type=checkbox]')).length`);
    if (n > 0) return n;
    await c.evalExpr('document.body.click()');
    await sleep(200);
  }
  return 0;
}

// ═══ HOW THE KEYS ARE DELIVERED, AND THE ONE THING THAT IS NOT PROVEN ═══
//
// ⚠ `Input.dispatchKeyEvent` NEVER REPLIES ON THIS TARGET. Two runs were spent
// on it: the call is accepted and no response ever arrives, and without a
// per-call timeout that leaves an await that never settles, an empty event loop,
// and a process that exits 0 having reported nothing — which reads as a passing
// run that stopped printing. The timeout in `send` is from that.
//
// So the keys are dispatched as real `KeyboardEvent`s from inside the page, on
// `document.body`, which BUBBLES TO WINDOW — where MapViewport's listener is.
// The event carries `key` and `shiftKey`, `preventDefault` works, and
// `isTypingTarget(e.target)` sees a genuine element, so every branch of the
// handler runs exactly as it does for a real press.
//
// WHAT THIS DOES NOT PROVE: that the OS/Electron layer delivers an arrow key to
// this window at all. It is stated rather than glossed. Everything downstream of
// the listener — the step size, the axis split, the document write, the repaint
// — is under test.
//
// The blur is not tidiness: a `<select>` still focused from row 4a would eat
// the arrows itself, exactly as it would for the author.
const PRESS = (name, shift) => String.raw`
(() => {
  const a = document.activeElement;
  if (a && a !== document.body && typeof a.blur === 'function') a.blur();
  const ev = new KeyboardEvent('keydown', {
    key: ${JSON.stringify(name)}, code: ${JSON.stringify(name)},
    shiftKey: ${shift ? 'true' : 'false'}, bubbles: true, cancelable: true,
  });
  document.body.dispatchEvent(ev);
  return ev.defaultPrevented;
})()`;

async function arrow(c, name, { shift = false, times = 1 } = {}) {
  let prevented = 0;
  for (let i = 0; i < times; i++) {
    if (await c.evalExpr(PRESS(name, shift))) prevented++;
    await sleep(60);
  }
  await sleep(200);
  return prevented;
}

const sceneOf = (doc, id) => doc.find((s) => s.id === id) ?? null;
const fbNames = (scene) => scene.layers.map((l) => (typeof l.fb === 'string' ? l.fb : null));

async function main() {
  console.log('\n=== THE CAMERA PREVIEW — one canvas, arrow keys, and the differential ===\n');
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  note('environment',
    `uptime: ${os.uptime().toFixed(0)}s · load ${os.loadavg().map((n) => n.toFixed(2)).join(' ')} · aeon copy ${AEONDIR}`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');

    // ---- 0. PROVENANCE ---------------------------------------------------
    const haveProbe = await c.evalExpr('typeof window.__dbg.aeon.cameraPreview === "function"');
    check('0a', '[anti-vacuous] the build under test carries the cameraPreview probe',
      haveProbe === true, `${RUN.root}/dist`);
    if (!haveProbe) throw new Error('wrong build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open the aeon COPY ------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', '[anti-vacuous] the aeon COPY is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    await sleep(2500);
    const pill = await c.evalExpr(clickByText('/^Effects$/'));
    check('1b', '[anti-vacuous] the facet bar offers an Effects pill', pill === true);
    await sleep(1200);

    // ---- 2. The shipped flat scene, and the composite switched on --------
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_FLAT)})`);
    await sleep(700);
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const flat = sceneOf(doc, SCENE_FLAT);
    check('2a', '[anti-vacuous] the shipped flat scene is selected, LOCKED, with five layers',
      !!flat && flat.v_factor === 15 && flat.layers.length === 5,
      `v_factor=${flat?.v_factor} layers=${flat?.layers.length} fb=${JSON.stringify(fbNames(flat))}`);

    // The two toggles, through the real View menu.
    const menuBoxes = await openViewMenu(c);
    note(`View menu opened with ${menuBoxes} checkboxes`);
    const bgOn = await c.json(SET_OVERLAY('/Bg Plane/i', true));
    const camOn = await c.json(SET_OVERLAY('/Compose the background in the frame/i', true));
    check('2b', 'the View menu OFFERS the composite as a toggle, and it turns on',
      camOn.found === true && camOn.now === true,
      `camera=${JSON.stringify(camOn)} bgPlane=${JSON.stringify(bgOn)}`);
    await c.evalExpr('document.body.click()');
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(900);

    const rect = await c.json(CANVAS_RECT);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    note('aim environment',
      `dpr=${dpr} rect=${JSON.stringify(rect)} load=${os.loadavg().map((n) => n.toFixed(2)).join(' ')} uptime=${os.uptime().toFixed(0)}s`);

    let cam0 = await c.json('window.__dbg.aeon.cameraPreview()');
    check('2c', '[anti-vacuous] ★ THE COMPOSITE ACTUALLY DREW ★ — active, with blits, on a real repaint',
      cam0.active === true && cam0.sceneId === SCENE_FLAT && cam0.blits > 0 && cam0.paints > 0
      && cam0.bands.length === 5,
      `active=${cam0.active} blits=${cam0.blits} paints=${cam0.paints} bands=${cam0.bands.length}`);
    if (!cam0.active) throw new Error('composite inactive — nothing below can discriminate');

    check('2d', '[anti-vacuous] the bands tile the 224-row screen with no gap and no overlap',
      cam0.bands[0].screenTop === 0
      && cam0.bands[cam0.bands.length - 1].screenBottom === 224
      && cam0.bands.every((b, i) => i === 0 || b.screenTop === cam0.bands[i - 1].screenBottom),
      JSON.stringify(cam0.bands.map((b) => [b.screenTop, b.screenBottom])));

    await shot(c, 'flat-cam0');

    // ---- 3. ★ THE HORIZONTAL DIFFERENTIAL ★ ------------------------------
    //
    // Sixteen SHIFT presses = 256 camera px. Each band must move by its own
    // factor's decode difference, and the fast band must outrun the slow one by
    // the ratio their NAMES imply.
    const before = cam0.bands.map((b) => b.scrollX);
    const camXBefore = cam0.camX;
    await arrow(c, 'ArrowRight', { shift: true, times: 16 });
    await sleep(600);
    let cam1 = await c.json('window.__dbg.aeon.cameraPreview()');
    const after = cam1.bands.map((b) => b.scrollX);
    const moved = after.map((v, i) => v - before[i]);
    const names = fbNames(flat);
    const expect = names.map((n) => decode(cam1.camX, n) - decode(camXBefore, n));

    check('3a', '★ CATCHER ★ every band moved by its OWN factor\'s decode over the same camera move',
      cam1.camX - camXBefore === 256 && JSON.stringify(moved) === JSON.stringify(expect),
      `camX ${camXBefore} -> ${cam1.camX} (+${cam1.camX - camXBefore})\n`
      + `        fb       = ${JSON.stringify(names)}\n`
      + `        moved    = ${JSON.stringify(moved)}\n`
      + `        expected = ${JSON.stringify(expect)}  (independent transcription of Decode_Factor_A)`);

    const iSlow = names.indexOf('FACTOR_1_16');
    const iFast = names.indexOf('FACTOR_1_2');
    const iMid = names.indexOf('FACTOR_1_4');
    check('3b', '★ CATCHER ★ the ratios between bands are the ones the factor NAMES imply '
      + '(1/2 : 1/16 = 8, 1/4 : 1/16 = 4) — no absolute value involved',
      iSlow >= 0 && iFast >= 0 && iMid >= 0 && moved[iSlow] > 0
      && moved[iFast] / moved[iSlow] === 8 && moved[iMid] / moved[iSlow] === 4,
      `slow(1/16)=${moved[iSlow]} mid(1/4)=${moved[iMid]} fast(1/2)=${moved[iFast]} `
      + `· fast/slow=${moved[iFast] / moved[iSlow]} mid/slow=${moved[iMid] / moved[iSlow]}`);

    // 3c. The FINE step, measured on its own — this is what rules out
    //     "the arrow did nothing and both samples are one frame".
    const camBeforeFine = cam1.camX;
    const slowBeforeFine = cam1.bands[iSlow].scrollX;
    await arrow(c, 'ArrowRight', { times: 1 });
    await sleep(400);
    let cam2 = await c.json('window.__dbg.aeon.cameraPreview()');
    check('3c', 'a plain arrow moves the camera exactly ONE pixel',
      cam2.camX - camBeforeFine === 1,
      `camX ${camBeforeFine} -> ${cam2.camX}`);
    check('3d', 'and one pixel of camera does NOT move a 1/16 band — which is the whole '
      + 'reason a drag cannot show slow parallax, and the reason the coarse step is 16',
      cam2.bands[iSlow].scrollX === slowBeforeFine,
      `1/16 band scrollX ${slowBeforeFine} -> ${cam2.bands[iSlow].scrollX} at camX ${cam2.camX}`);

    // 3e. ...and fifteen more fine presses DO move it, exactly once.
    await arrow(c, 'ArrowRight', { times: 15 });
    await sleep(500);
    let cam3 = await c.json('window.__dbg.aeon.cameraPreview()');
    check('3e', 'sixteen fine presses move the SLOWEST published band by exactly one pixel — '
      + 'the derivation CAMERA_KEY_STEP_COARSE = 16 comes from',
      cam3.camX - camBeforeFine === 16 && cam3.bands[iSlow].scrollX - slowBeforeFine === 1,
      `camX +${cam3.camX - camBeforeFine} · 1/16 band +${cam3.bands[iSlow].scrollX - slowBeforeFine}`);

    // 3f. LEFT is the inverse of RIGHT.
    await arrow(c, 'ArrowLeft', { shift: true, times: 1 });
    await sleep(400);
    let cam4 = await c.json('window.__dbg.aeon.cameraPreview()');
    check('3f', 'ArrowLeft moves the camera the other way by the same step',
      cam3.camX - cam4.camX === 16, `camX ${cam3.camX} -> ${cam4.camX}`);

    await shot(c, 'flat-moved');

    // ---- 4. ★ THE LOCKED BAND ★ -----------------------------------------
    //
    // No shipped scene has one, so this row AUTHORS it: layer 0's fb becomes
    // FACTOR_LOCKED through the panel's own picker.
    const layersOpen = await c.evalExpr(SECTION_STATE('/^Layers/', true));
    await sleep(700);
    const setLock = await c.json(SET_NTH_SELECT(fbTitle(0), 0, 'FACTOR_LOCKED'));
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const locked = sceneOf(doc, SCENE_FLAT);
    check('4a', '[anti-vacuous] layer 0\'s fb is now FACTOR_LOCKED in the DOCUMENT',
      setLock.found === true && setLock.hasOption === true && locked.layers[0].fb === 'FACTOR_LOCKED',
      `layersSection=${layersOpen} ${JSON.stringify(setLock)} · fb now ${JSON.stringify(fbNames(locked))}`);

    let camL0 = await c.json('window.__dbg.aeon.cameraPreview()');
    const lockedBefore = camL0.bands.map((b) => b.scrollX);
    await arrow(c, 'ArrowRight', { shift: true, times: 16 });
    await sleep(600);
    let camL1 = await c.json('window.__dbg.aeon.cameraPreview()');
    const lockedMoved = camL1.bands.map((b, i) => b.scrollX - lockedBefore[i]);
    check('4b', '★ CATCHER ★ the LOCKED band does not move at all over 256 camera px, '
      + 'while its neighbours do — the sentinel, on screen',
      camL1.camX - camL0.camX === 256 && lockedMoved[0] === 0
      && camL1.bands[0].locked === true && lockedMoved.slice(1).every((m) => m > 0),
      `camX +${camL1.camX - camL0.camX} · moved=${JSON.stringify(lockedMoved)} · `
      + `band0.locked=${camL1.bands[0].locked}`);

    // Put it back, so the fixture copy ends as it started in the MODEL.
    await c.evalExpr(SET_NTH_SELECT(fbTitle(0), 0, names[0]));
    await sleep(500);

    // ---- 5. ★ THE VERTICAL, AND THE GUIDES ★ ----------------------------
    //
    // On a LOCKED scene `Vscroll_BG = v_offset` and Camera_Y is never read, so
    // the frame's Y IS the scene's v_offset and the layer tops are PLANE ROWS
    // fixed on the art.
    let guides0 = await c.json('window.__dbg.aeon.guides()');
    let view0 = await c.json('window.__dbg.view()');
    let frame0 = await c.json('window.__dbg.aeon.screenFrame()');
    let camV0 = await c.json('window.__dbg.aeon.cameraPreview()');
    const worldRows = (g, v) => g.rows.map((r) => v.y + r.canvasY / v.zoom);
    const rows0 = worldRows(guides0, view0);
    check('5a', '[anti-vacuous] the guides are drawn, one per layer, in screen/plane space',
      guides0.active === true && guides0.space === 'screen' && guides0.rows.length === 5,
      `space=${guides0.space} rows=${JSON.stringify(guides0.rows.map((r) => r.worldY))}`);
    check('5b', 'a locked layer\'s guide sits at its own PLANE ROW in the world — the tops '
      + 'ARE the world rows, with no frame in the answer',
      JSON.stringify(rows0) === JSON.stringify(guides0.rows.map((r) => r.worldY)),
      `worldRows=${JSON.stringify(rows0)} tops=${JSON.stringify(guides0.rows.map((r) => r.worldY))}`);

    // 5c. ⚠ MEASURED NON-DISCRIMINATING FOR THE ANCHOR RULE, AND KEPT ANYWAY.
    //     It was written as the catcher for the owner's sentence and PLANT B
    //     (row 65's frame-anchored origin, restored) came back GREEN on it — the
    //     old rule read the frame's Y, and moving the camera HORIZONTALLY does
    //     not change the frame's Y. That is failure mode (iii) from the header:
    //     the row measured the wrong axis. THE CATCHER IS 5e. This row still
    //     rules out an origin that reads camera X, which nothing proposes but
    //     which would be silent everywhere else.
    await arrow(c, 'ArrowRight', { shift: true, times: 8 });
    await sleep(600);
    let guides1 = await c.json('window.__dbg.aeon.guides()');
    let view1 = await c.json('window.__dbg.view()');
    let camV1 = await c.json('window.__dbg.aeon.cameraPreview()');
    check('5c', '[non-discriminating — GREEN under plant B; the catcher is 5e] the camera '
      + 'moved 128 px horizontally and every guide held its world row',
      camV1.camX - camV0.camX === 128
      && JSON.stringify(worldRows(guides1, view1)) === JSON.stringify(rows0),
      `camX +${camV1.camX - camV0.camX} · before=${JSON.stringify(rows0)} after=${JSON.stringify(worldRows(guides1, view1))}`);

    // 5d. ArrowDown on a LOCKED scene edits v_offset — a DOCUMENT field.
    const vo0 = locked.v_offset ?? 0;
    await arrow(c, 'ArrowDown', { shift: true, times: 2 });
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const afterDown = sceneOf(doc, SCENE_FLAT);
    let frame1 = await c.json('window.__dbg.aeon.screenFrame()');
    let camV2 = await c.json('window.__dbg.aeon.cameraPreview()');
    check('5d', 'ArrowDown on a LOCKED scene edits the SCENE\'s v_offset — not a session '
      + 'anchor — because a locked plane has no vertical camera to move',
      (afterDown.v_offset ?? 0) === vo0 + 32 && camV2.vscrollBase === vo0 + 32,
      `v_offset ${vo0} -> ${afterDown.v_offset} · composite vscrollBase=${camV2.vscrollBase}`);

    // 5e. ★ THE CATCHER FOR THE OWNER'S SENTENCE ★ — "if I move the viewport it
    //     drags the layers which I don't want". The FRAME moved down the plane
    //     by 32 and the guides did not follow, because a locked layer's top is a
    //     plane row. Under plant B (the frame-anchored origin) every guide moves
    //     by exactly the 32, which is the reported symptom.
    check('5e', '★ CATCHER ★ the frame followed v_offset 32 rows down the plane and the '
      + 'guides did NOT move with it — "if I move the viewport it drags the layers '
      + 'which I don\'t want"',
      frame1.anchor.y - frame0.anchor.y === 32
      && JSON.stringify(worldRows(await c.json('window.__dbg.aeon.guides()'),
        await c.json('window.__dbg.view()'))) === JSON.stringify(rows0),
      `frame.y ${frame0.anchor.y} -> ${frame1.anchor.y}`);

    // Put v_offset back.
    await arrow(c, 'ArrowUp', { shift: true, times: 2 });
    await sleep(600);

    // 5f. KEPT FROM ROW 65: a pan still moves a guide on the canvas by the pan.
    const guideCanvasAt = async (vpY) => {
      await c.evalExpr(`window.__dbg.setView(0, ${vpY}, 1)`);
      await sleep(400);
      const g = await c.json('window.__dbg.aeon.guides()');
      return g.rows[2].canvasY;
    };
    const p0 = await guideCanvasAt(0);
    const p1 = await guideCanvasAt(100);
    check('5f', '[kept from row 65] a pan moves the guide on the canvas by exactly the pan '
      + '(under the original `vp.y` origin this difference is 0)',
      p0 - p1 === 100, `canvasY at vpY 0 = ${p0}, at vpY 100 = ${p1}, difference ${p0 - p1}`);
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(400);

    // ---- 6. VSPLITS, AND THE ABSENCE LINE -------------------------------
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_DEEP)})`);
    await sleep(900);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const deep = sceneOf(doc, SCENE_DEEP);
    let camD = await c.json('window.__dbg.aeon.cameraPreview()');
    const splitOf = (l) => (l.vsplit && l.vsplit !== 'none' ? l.vsplit.at : null);
    // Walk the document the way the raster does: each split takes over from its
    // own band down.
    let running = deep.v_offset ?? 0;
    const expectVscroll = camD.bands.map((b) => {
      const s = splitOf(deep.layers[b.layer]);
      if (s !== null) running = s;
      return running;
    });
    check('6a', 'a vsplit changes the composite\'s vertical scroll from ITS band DOWN, and '
      + 'the bands above it are untouched',
      JSON.stringify(camD.bands.map((b) => b.vscroll)) === JSON.stringify(expectVscroll)
      && new Set(camD.bands.map((b) => b.vscroll)).size > 1,
      `document splits=${JSON.stringify(deep.layers.map(splitOf))}\n`
      + `        composite vscroll=${JSON.stringify(camD.bands.map((b) => b.vscroll))}\n`
      + `        expected         =${JSON.stringify(expectVscroll)}`);

    check('6b', 'the composite SAYS it does not draw the curve ramps this scene carries — '
      + 'the boundary of the claim, on the canvas',
      camD.absent.some((a) => /curve/.test(a)) && camD.absent.some((a) => /foreground/.test(a)),
      JSON.stringify(camD.absent));

    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_FLAT)})`);
    await sleep(700);
    let camBack = await c.json('window.__dbg.aeon.cameraPreview()');
    check('6c', '[anti-vacuous] the flat scene reports NO curve absence — so 6b is about '
      + 'this scene\'s content and not a constant string',
      camBack.absent.every((a) => !/curve/.test(a)) && camBack.absent.length > 0,
      JSON.stringify(camBack.absent));

    // ---- 7. THE TOGGLE OFF ----------------------------------------------
    const menuBoxes2 = await openViewMenu(c);
    note(`View menu reopened with ${menuBoxes2} checkboxes`);
    const camOff = await c.json(SET_OVERLAY('/Compose the background in the frame/i', false));
    await c.evalExpr('document.body.click()');
    await sleep(600);
    let camGone = await c.json('window.__dbg.aeon.cameraPreview()');
    check('7a', 'turning the toggle off stops the composite — and the arrows go back to '
      + 'panning the map, so panning is never unreachable',
      camOff.now === false && camGone.active === false && camGone.blits === 0,
      `toggle=${JSON.stringify(camOff)} report=${JSON.stringify({ active: camGone.active, blits: camGone.blits })}`);

    const viewBeforePan = await c.json('window.__dbg.view()');
    await arrow(c, 'ArrowRight', { times: 1 });
    await sleep(400);
    const viewAfterPan = await c.json('window.__dbg.view()');
    check('7b', 'with the composite off ArrowRight pans the map by 64 as it always did',
      viewAfterPan.x - viewBeforePan.x === 64,
      `vpX ${viewBeforePan.x} -> ${viewAfterPan.x}`);

    await shot(c, 'toggle-off');

    // ---- SUMMARY ---------------------------------------------------------
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} rows passed`);
    if (fails.length) console.log(`FAILED:\n  ${fails.join('\n  ')}`);
    note('aim environment (end)',
      `dpr=${dpr} load=${os.loadavg().map((n) => n.toFixed(2)).join(' ')} uptime=${os.uptime().toFixed(0)}s`);
    process.exitCode = fails.length ? 1 : 0;
  } finally {
    try { c?.close(); } catch { /* closing */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
