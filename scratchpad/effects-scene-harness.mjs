#!/usr/bin/env node
// CAN AN AUTHOR ACTUALLY MAKE AN EFFECTS SCENE, IN THE RUNNING APP?
//
// The node suite has ~4,000 tests over this feature and cannot see a single
// pixel of it: it cannot tell whether the Effects pill appears, whether the
// panel mounts, whether the factor dropdown has options in it, or whether
// clicking "New" reaches the store. Every row below drives the REAL UI —
// pointer clicks on real elements, real keystrokes into real inputs, real
// Ctrl+Z — and then reads the MODEL back through `window.__dbg.aeon` to see
// what the gesture did.
//
// TWO THINGS IT IS SPECIFICALLY BUILT TO CATCH.
//
// 1. A DROPDOWN THAT RENDERS EMPTY. Every UI constraint on this surface is
//    derived from the vendored contract schema at module load. If a derivation
//    ever yields `undefined`, a `<select>` renders with zero `<option>`s — which
//    on screen is indistinguishable from a panel that has not loaded yet, and
//    which no node test of the derivation itself would notice, because the node
//    test imports the same module and gets the same undefined. Row 3a counts
//    the options in the DOM and names one it must contain.
//
// 2. A CLOCK NOBODY ASKED FOR. reviews/2026-08-22-preview-posture-ruling.md and
//    the MapViewport measurement (37/37: 1602 rAF ticks against 0 repaints over
//    5s idle) leave aeon's viewport with NO idle repaints, and wave 1 must not
//    spend that. Rows 7a/7b sit on the Effects facet for 3s and assert zero map
//    repaints while the page is provably still painting.
//
// THREE MORE THINGS, ADDED BY ROADMAP §5.1 ITEM 15.
//
// 3. A DOCK WITH NO RIGHT PADDING. Section 10 reads the RENDERED geometry of the
//    four controls the landing pass flagged and compares each one's inset to the
//    inset of the section header above it — read off the live computed style, so
//    the number is never typed here. On master every one of them measured
//    rightInset = 0: flush to x = the window's right edge.
//
// 4. WHOSE RED `soli…` BADGE IS IT? Section 12 attributes it instead of
//    assigning it. It scans the map canvas's own pixels for the object
//    overlay's box colours, on the Effects facet AND on Layout, and measures the
//    label in the app's own 2D context. Verdict lives in the row details: the
//    badge does not move between facets, the canvas's right edge does.
//
// 5. THE STATE NOBODY HAD PHOTOGRAPHED. Item 13 flagged "layer cards stack tall
//    with the packed factor spinners open" for human judgement, and then every
//    screenshot it took had that section shut. Section 11 drives the app into
//    that state at two layers AND at the schema's maximum of eight, proves it is
//    genuinely open before it shoots (a collapsed section photographs calm and
//    means nothing), and measures the stack. It found a real defect doing it —
//    the list sections had no scroller, so at eight layers 954px of cards were
//    painted straight over SECTION ASSIGNMENT.
//
// ANTI-VACUOUS THROUGHOUT. Every row that could pass on an empty screen or an
// unloaded project has a companion that proves the instrument saw its subject:
// the project is open with sections, the panel's own heading is on screen, the
// scene count moved, the rAF counter advanced.
//
// THE FIXTURE IS THE REAL AEON TREE, and its `games/sonic4/data/editor/effects/`
// DOES NOT EXIST (verified 2026-08-22). That is not a gap in the harness — it is
// the normal case per schema §2 and the one rows 1a/1b are about. The scenes the
// later rows edit are ones this harness AUTHORS through the UI.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed and `saveAeonProject` is
// never called, so the aeon tree is left exactly as found. The store is dirtied,
// which is why the run ends by reloading the page.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/effects-scene-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9391);
// ROOT defaults to the tree this harness FILE lives in, never a hardcoded path.
// A pinned worktree path is a landmine: run from the main clone it silently
// serves the WORKTREE's dist/, so a "re-verified on the merged tree" run is
// actually re-verifying the branch — the exact thing the landing rule forbids,
// wearing the costume of having followed it. (Caught at landing, 2026-08-22:
// the overseer rebuilt the merged tree, ran this, and got the branch's build.)
// Deriving it from import.meta.url means the harness and the tree it tests
// cannot come apart.
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
// The electron BINARY and the app ROOT are separate on purpose. A git worktree
// has no node_modules of its own (node resolution walks up to the main clone's),
// so a harness run from a worktree has to take the binary from wherever it is
// actually installed while still serving the worktree's own dist/.
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-effects-scene`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'harness_probe';
// Schema §2's layer ceiling, mirrored here so section 11d can grow the stack to
// it. Row 4b already proves the app's own copy of the schema is intact.
const EFFECTS_MAX_LAYERS = 8;

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

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-effects-scene/${name}.png`);
}

// ---------------------------------------------------------------------------
// Real gestures.
//
// A React-controlled <input>/<select> ignores a plain `el.value = x`: React's
// synthetic onChange never fires, so the store never sees it and the field snaps
// back on the next render. The native setter + a bubbling `input`/`change` event
// is what a real keystroke does from React's point of view — this is NOT a
// shortcut past the component, it is the only way to reach it from outside.
// ---------------------------------------------------------------------------
const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  const proto = el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

// NOTE the .trim(): the first run of this harness reported "the facet bar offers
// an Effects pill" as a FAILURE while printing 'Effects' in the very list of
// buttons on screen, because the concatenated haystack was "Effects " and the
// anchored /^Effects$/ did not match it. The harness was wrong, not the app.
const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

/** Every <select> in the right-hand panel whose title says what it drives. */
const SELECT_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

const REPAINT_PROBE = String.raw`
(() => {
  if (window.__fxProbe) return 'already';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: 0, ticks: 0, ticking: false };
  window.__fxProbe = P;
  P.bound = () => P.canvas === document.getElementById('map-canvas');
  const tick = () => { if (P.ticking) { P.ticks++; requestAnimationFrame(tick); } };
  P.start = () => { if (!P.ticking) { P.ticking = true; requestAnimationFrame(tick); } };
  P.stop = () => { P.ticking = false; };
  // The same repaint START signal the MapViewport baseline harness uses: the
  // draw effect's canvas.width assignment.
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true, enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) { if (this === P.canvas) P.repaints++; return wd.set.call(this, v); },
  });
  return 'installed';
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
    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon. The effects directory does not exist there. ---------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the aeon project is open, with sections', !!(st && st.open && st.sections > 0),
      JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');

    // THE NORMAL CASE: an absent editor/effects/ is "no scenes", never an error.
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    const unreadable0 = await c.json('window.__dbg.aeon.unreadableScenes()');
    const toasts0 = await c.json('window.__dbg.aeon.toasts()');
    check('1b', 'an absent editor/effects/ loads as ZERO scenes with no error toast',
      scenes0.length === 0 && unreadable0.length === 0
      && !toasts0.some((t) => t.type === 'error'),
      `scenes=${scenes0.length} unreadable=${unreadable0.length} `
      + `toasts=${JSON.stringify(toasts0.map((t) => `${t.type}:${t.message}`.slice(0, 60)))}`);

    // ---- 2. The Effects pill, and the panel behind it. --------------------
    await sleep(2500);
    const pills = await c.json(
      `[...document.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean)`);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill', clicked === true,
      `buttons on screen: ${JSON.stringify(pills.slice(0, 25))}`);
    await sleep(1200);

    const headings = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^(Scenes|Layers|Section assignment|Scene —)/.test(t))`);
    check('2b', 'the Effects panel is mounted (its own section headings are on screen)',
      headings.some((h) => h === 'Scenes') && headings.some((h) => h === 'Section assignment'),
      JSON.stringify(headings));
    await shot(c, '1-effects-facet-empty');

    // ---- 3. Create a scene through the real form. -------------------------
    const typed = await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    check('3a', 'the new-scene id field accepts a real keystroke', typed === 'ok', `typed=${typed}`);
    const pressedNew = await c.evalExpr(clickByText('/^New$/'));
    check('3b', 'the New button is on screen and clickable', pressedNew === true);
    await sleep(800);

    let scenes = await c.json('window.__dbg.aeon.scenes()');
    check('3c', 'clicking New created the scene in the MODEL, not just on screen',
      scenes.length === 1 && scenes[0].id === SCENE_ID && scenes[0].layers === 1,
      JSON.stringify(scenes));
    check('3d', 'the create is undoable (one step is on the stack)',
      (await c.evalExpr('window.__dbg.aeon.canUndo()')) === true);

    // ---- 4. The factor dropdowns actually have options in them. -----------
    await sleep(600);
    const factorSel = await c.json(String.raw`
      (() => {
        const sels = [...document.querySelectorAll('select')].filter(e => /fa|v_factor|fb/.test(e.title || ''));
        return sels.map(s => ({
          title: s.title,
          options: [...s.options].map(o => o.value),
          value: s.value,
        }));
      })()`);
    check('4a', 'a layer fa/fb picker and the scene v_factor picker are all on screen',
      factorSel.length >= 3, JSON.stringify(factorSel.map((s) => s.title)));
    const anyFactor = factorSel[0];
    // THE ROW THIS HARNESS EXISTS FOR: 16 published names + one custom sentinel.
    // A derivation that yielded undefined renders an EMPTY select, and nothing
    // in the node suite can tell that apart from a working one.
    check('4b', 'the factor picker offers all 16 schema factors plus the custom form',
      !!anyFactor && anyFactor.options.length === 17
      && anyFactor.options.includes('FACTOR_15_16')
      && anyFactor.options.includes('FACTOR_LOCKED')
      && anyFactor.options.includes('__packed__'),
      anyFactor ? `${anyFactor.options.length} options: ${JSON.stringify(anyFactor.options)}` : 'no picker');
    // Wave 1 exposes cell precision only; "line" is a reserved engine tier.
    const precision = await c.json(
      `(() => { const s = ${SELECT_BY_TITLE('/precision/')}; return s ? [...s.options].map(o => o.value) : null; })()`);
    check('4c', 'the precision picker offers "cell" and NOT the reserved "line" tier',
      Array.isArray(precision) && precision.length === 1 && precision[0] === 'cell',
      JSON.stringify(precision));

    // ---- 5. Editing a layer reaches the document. -------------------------
    const beforeEdit = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const setFa = await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => /Layer 0 fa/.test(e.title || ''))`,
      'FACTOR_3_16'));
    check('5a', "the layer 0 fa picker took a real change event", setFa === 'ok', `setFa=${setFa}`);
    await sleep(600);
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5b', 'the picked factor is in the DOCUMENT',
      doc[0]?.layers?.[0]?.fa === 'FACTOR_3_16',
      `before=${beforeEdit[0]?.layers?.[0]?.fa} after=${doc[0]?.layers?.[0]?.fa}`);

    // Switching to the custom packed form must write a packed TRIPLE, and expose
    // its three fields.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => /Layer 0 fb/.test(e.title || ''))`, '__packed__'));
    await sleep(600);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const packed = doc[0]?.layers?.[0]?.fb;
    check('5c', 'choosing the custom form writes a schema-legal packed triple',
      packed && typeof packed === 'object'
      && Number.isInteger(packed.s1) && packed.s1 >= 0 && packed.s1 <= 15
      && Number.isInteger(packed.s2) && packed.s2 >= 0 && packed.s2 <= 15
      && (packed.op === 0 || packed.op === 1),
      JSON.stringify(packed));
    const packedFields = await c.json(
      `[...document.querySelectorAll('input[type=number]')].map(e => e.title).filter(t => /^s[12] —/.test(t))`);
    check('5d', 'the packed s1/s2 spinners appear once the custom form is chosen',
      packedFields.length >= 2, JSON.stringify(packedFields));

    // ---- 6. Add a layer, then undo the whole session step by step. --------
    // Matched on the ARIA LABEL ("Add layer"), not the visible glyph: the
    // control is an IconButton, so its haystack here is "Add Add layer" and an
    // anchored /^Add$/ misses it — the same trap row 2a fell into.
    const added = await c.evalExpr(clickByText('/Add layer/'));
    check('6a', 'the Add layer control is on screen', added === true);
    await sleep(600);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('6b', 'adding a layer grew the document to two layers',
      doc[0]?.layers?.length === 2, `layers=${doc[0]?.layers?.length}`);
    await shot(c, '2-scene-two-layers');

    // ---- 7. Section assignment. -------------------------------------------
    const assigned = await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/sceneRef/'), SCENE_ID));
    check('7a', 'the section assignment dropdown took a real change event', assigned === 'ok',
      `assigned=${assigned}`);
    await sleep(600);
    const activeSection = await c.evalExpr('window.__dbg.aeon.activeSection()');
    const ref = await c.evalExpr(`window.__dbg.aeon.sceneRef(${activeSection})`);
    check('7b', "the assignment reached the section's sceneRef in the model",
      ref === SCENE_ID, `section ${activeSection} sceneRef=${JSON.stringify(ref)}`);

    // THE NO-OP GUARD, in the real UI. Re-picking the option already selected
    // fires onChange, and a command there would be an undo step that visibly
    // does nothing. Measured by undoing ONCE and checking the ref is gone.
    await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/sceneRef/'), SCENE_ID));
    await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/sceneRef/'), SCENE_ID));
    await sleep(500);
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2,
    });
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2,
    });
    await sleep(700);
    const refAfterUndo = await c.evalExpr(`window.__dbg.aeon.sceneRef(${activeSection})`);
    // ANTI-VACUOUS: `null` after an undo proves nothing if the ref was never set
    // — which is exactly how this row passed on the harness's own first (broken)
    // run, when the Effects pill had never been clicked. The pre-state is part
    // of the assertion.
    check('7c', 'ONE Ctrl+Z clears the assignment — the two re-picks issued nothing',
      ref === SCENE_ID && refAfterUndo === null,
      `assigned=${JSON.stringify(ref)} -> after one undo sceneRef=${JSON.stringify(refAfterUndo)}`
      + ' (non-null after means a no-op command consumed a step)');

    // ---- 8. NO CLOCK WAS ADDED. -------------------------------------------
    // The MapViewport measurement (37/37) left aeon's viewport with zero idle
    // repaints. Wave 1 must not spend that, and the preview-posture ruling says
    // so explicitly. Idle here means: the Effects facet is up, a scene is
    // selected, nobody touches anything.
    const installed = await c.evalExpr(REPAINT_PROBE);
    check('8a', 'the repaint probe bound to the live #map-canvas',
      installed === 'installed' || installed === 'already', `install=${installed}`);
    if (installed === 'installed' || installed === 'already') {
      await c.evalExpr('window.__fxProbe.repaints = 0; window.__fxProbe.ticks = 0; window.__fxProbe.start()');
      await sleep(3000);
      const idle = await c.json(
        '({ repaints: window.__fxProbe.repaints, ticks: window.__fxProbe.ticks, bound: window.__fxProbe.bound() })');
      await c.evalExpr('window.__fxProbe.stop()');
      // ANTI-VACUOUS: zero repaints proves nothing if the renderer is dead or
      // the probe lost its element. The rAF counter and the binding say it is
      // neither.
      check('8b', 'the page IS still painting and the probe is still bound',
        idle.ticks > 60 && idle.bound === true, JSON.stringify(idle));
      check('8c', 'the Effects facet adds NO idle map repaints (the preview-posture ruling)',
        idle.repaints === 0, `${idle.repaints} repaints over 3.0s idle against ${idle.ticks} rAF ticks`);
    }

    // ---- 9. Undo the whole session back to an empty library. --------------
    let undos = 0;
    for (let i = 0; i < 12; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2,
      });
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2,
      });
      undos++;
      await sleep(350);
    }
    scenes = await c.json('window.__dbg.aeon.scenes()');
    // ANTI-VACUOUS again: an empty library is the STARTING state, so
    // `scenes.length === 0` alone would pass a run in which nothing ever
    // happened. At least one undo must have been available to press.
    check('9a', 'undoing the session returns the library to empty',
      undos > 0 && scenes.length === 0,
      `${undos} undos, scenes left: ${JSON.stringify(scenes)}`);
    check('9b', 'the whole session was a SMALL number of steps, not one per keystroke',
      undos > 0 && undos <= 8, `${undos} undo steps for 6 authoring gestures`);
    await shot(c, '3-after-undo');

    // ---- 10. THE DOCK'S OWN GEOMETRY, and the state nobody had seen. ------
    //
    // Everything below re-authors a scene from scratch, AFTER the undo
    // accounting in section 9 has finished. That is deliberate: rows 9a/9b
    // assert the whole authoring session was a small number of undo steps, and
    // an extra half-dozen gestures folded in above would have moved a number
    // those rows exist to pin. Nothing here is undone; the run ends with a
    // reload, and nothing was ever written to disk.
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(700);
    await c.evalExpr(clickByText('/Add layer/'));
    await sleep(700);

    // OPEN EVERY PACKED-FACTOR FORM. This is the state item 13 flagged for human
    // judgement ("layer cards stack tall with the packed-factor spinners open")
    // and which no screenshot has ever contained. Each `__packed__` choice
    // replaces a named factor with the s1/s2/op triple, and the triple's three
    // controls are what makes a layer card tall.
    const openAllPackedForms = async () => {
      const titles = await c.json(String.raw`
        [...document.querySelectorAll('select')].map(e => e.title || '')
          .filter(t => /^Layer \d+ f[ab]$/.test(t))`);
      for (const t of titles) {
        await c.evalExpr(SET_INPUT(
          `[...document.querySelectorAll('select')].find(e => e.title === ${JSON.stringify(t)})`,
          '__packed__'));
        await sleep(150);
      }
      await sleep(600);
      return titles;
    };
    const packedOpened = await openAllPackedForms();

    // ---- 10a/10b. THE RIGHT PADDING, derived rather than eyeballed. --------
    //
    // The number this row compares against is NOT typed here. It is read off the
    // live computed style of the section header the controls sit under, which
    // gets it from ui/primitives' PANEL_INSET — the same constant PanelHeader
    // has always used. So the assertion is "the body is inset like the header
    // above it", and it keeps holding if the token ever changes.
    const geom = await c.json(String.raw`
      (() => {
        const hdrSpan = [...document.querySelectorAll('span')]
          .find(e => (e.textContent || '').trim() === 'Scenes');
        if (!hdrSpan) return { error: 'no Scenes heading on screen' };
        let header = hdrSpan;
        while (header && !(header.tagName === 'DIV'
               && parseFloat(getComputedStyle(header).paddingLeft) > 0)) {
          header = header.parentElement;
        }
        if (!header) return { error: 'no padded header ancestor' };
        const hcs = getComputedStyle(header);
        let panel = header;
        while (panel) {
          const cs = getComputedStyle(panel);
          if (cs.overflowY === 'auto' && parseFloat(cs.borderLeftWidth) >= 1) break;
          panel = panel.parentElement;
        }
        if (!panel) return { error: 'no Panel ancestor (overflow:auto + borderLeft)' };
        const pcs = getComputedStyle(panel);
        const pr = panel.getBoundingClientRect();
        const contentLeft = pr.left + parseFloat(pcs.borderLeftWidth);
        const contentRight = contentLeft + panel.clientWidth;
        const rowInput = (t) => {
          const s = [...document.querySelectorAll('span')]
            .find(e => (e.textContent || '').trim() === t);
          return s && s.parentElement ? s.parentElement.querySelector('input, select') : null;
        };
        const named = [
          ['new_scene_id', document.querySelector('input[placeholder="new_scene_id"]')],
          ['Name', rowInput('Name')],
          ['V factor', document.querySelector('select[title="Scene v_factor"]')],
          ['Section select', [...document.querySelectorAll('select')]
            .find(e => /sceneRef/.test(e.title || '')) || null],
        ];
        return {
          headerPadLeft: parseFloat(hcs.paddingLeft),
          headerPadRight: parseFloat(hcs.paddingRight),
          windowRight: document.documentElement.clientWidth,
          panel: {
            left: Math.round(pr.left), right: Math.round(pr.right),
            contentLeft: Math.round(contentLeft), contentRight: Math.round(contentRight),
            clientWidth: panel.clientWidth, clientHeight: panel.clientHeight,
            scrollHeight: panel.scrollHeight, overflowY: pcs.overflowY,
          },
          controls: named.map(([name, el]) => {
            if (!el) return { name, found: false };
            const r = el.getBoundingClientRect();
            return {
              name, found: true,
              left: Math.round(r.left), right: Math.round(r.right),
              leftInset: Math.round((r.left - contentLeft) * 10) / 10,
              rightInset: Math.round((contentRight - r.right) * 10) / 10,
            };
          }),
        };
      })()`);

    // ANTI-VACUOUS: an inset assertion over zero controls, or against a header
    // whose own padding is 0, passes on an empty screen. Both are asserted here
    // so the row below cannot be satisfied by absence.
    const found = (geom.controls ?? []).filter((x) => x.found);
    check('10a', 'the four flagged controls are on screen under a header with a real inset',
      !geom.error && found.length === 4 && geom.headerPadRight > 0 && geom.panel.clientWidth > 100,
      geom.error ?? `headerPad=${geom.headerPadLeft}/${geom.headerPadRight} `
        + `panel ${geom.panel.contentLeft}..${geom.panel.contentRight} of ${geom.windowRight} `
        + `| ${(geom.controls ?? []).map((x) => `${x.name}:${x.found ? 'yes' : 'MISSING'}`).join(' ')}`);

    // THE ROW ITEM 15(a) IS ABOUT. On master every one of these reads
    // rightInset=0 — the input, the Name field, the V factor select and the
    // Section select all end at the window's right edge.
    const flush = found.filter((x) => x.rightInset < geom.headerPadRight - 0.5
      || x.leftInset < geom.headerPadLeft - 0.5);
    check('10b', 'no dock control runs flush to the panel edge — every one is inset like its header',
      found.length === 4 && flush.length === 0,
      found.map((x) => `${x.name} L+${x.leftInset} R+${x.rightInset}`).join(' | ')
      + ` (header inset ${geom.headerPadLeft}/${geom.headerPadRight})`);

    // ---- 11. THE DENSITY EVIDENCE GAP (item 15c). -------------------------
    //
    // The layer stack has never been photographed with its factor forms open,
    // so "layer cards stack tall" has never been judgeable. These rows prove the
    // section really is expanded and the spinners really are open — a shot of a
    // collapsed section would look calm and mean nothing — and then MEASURE the
    // stack. No aesthetic claim is made here; the numbers are the deliverable.
    const DENSITY_PROBE = String.raw`
      (() => {
        const hdrSpan = [...document.querySelectorAll('span')]
          .find(e => /^Layers \(\d+\/\d+\)$/.test((e.textContent || '').trim()));
        if (!hdrSpan) return { error: 'no Layers heading on screen' };
        let header = hdrSpan;
        while (header && !(header.tagName === 'DIV'
               && parseFloat(getComputedStyle(header).paddingLeft) > 0)) {
          header = header.parentElement;
        }
        // section = the CollapsibleSection div: header -> click wrapper -> section
        const section = header.parentElement.parentElement;
        let panel = section;
        while (panel) {
          const cs = getComputedStyle(panel);
          if (cs.overflowY === 'auto' && parseFloat(cs.borderLeftWidth) >= 1) break;
          panel = panel.parentElement;
        }
        // A layer card is a bordered box holding a "#N world_y" label.
        // A layer CARD is the bordered box. Its inner "#N world_y" row matches a
        // naive text query too, which is how the first run of this row counted
        // four cards for two layers and reported [154,24,154,24] — the 24s were
        // the rows inside the 154s. The border is what distinguishes them.
        const cards = [...section.querySelectorAll('div')].filter((d) =>
          parseFloat(getComputedStyle(d).borderTopWidth) >= 1
          && /^#\d+ world_y$/.test((d.querySelector('span')?.textContent || '').trim()));
        const spinners = [...section.querySelectorAll('input[type=number]')]
          .filter((e) => /^s[12] —/.test(e.title || ''));
        const pr = panel.getBoundingClientRect();
        const sr = section.getBoundingClientRect();
        const hr = header.getBoundingClientRect();
        const rects = cards.map((d) => {
          const r = d.getBoundingClientRect();
          return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
        });
        // FULLY VISIBLE means inside BOTH clips: the section body's own window
        // and the dock's. getBoundingClientRect knows nothing about clipping, so
        // a card "at" y=1200 in a 306px scroller still reports a rect — which is
        // why this counts against the body box rather than the card's own.
        const bodyEl = cards.length ? cards[0].parentElement : null;
        const br = bodyEl ? bodyEl.getBoundingClientRect() : sr;
        const top = Math.max(br.top, pr.top), bot = Math.min(br.bottom, pr.bottom);
        const visible = rects.filter((r) => r.top >= top - 1 && r.bottom <= bot + 1).length;
        // The body box between the header and the cards — the thing that either
        // scrolls or lets the stack out over the sections underneath.
        const body = bodyEl;
        const bcs = body ? getComputedStyle(body) : null;
        return {
          title: hdrSpan.textContent.trim(),
          cards: cards.length, spinners: spinners.length,
          headerHeight: Math.round(hr.height),
          sectionHeight: Math.round(sr.height),
          bodyHeight: Math.round(sr.height - hr.height),
          cardHeights: rects.map((r) => r.h),
          stackHeight: rects.reduce((a, r) => a + r.h, 0),
          cardsFullyVisibleInDock: visible,
          panelClientHeight: panel.clientHeight,
          panelScrollHeight: panel.scrollHeight,
          panelOverflowY: getComputedStyle(panel).overflowY,
          sectionBottomBelowDock: Math.round(sr.bottom - pr.bottom),
          bodyOverflowY: bcs ? bcs.overflowY : null,
          bodyClientHeight: body ? body.clientHeight : null,
          bodyScrollHeight: body ? body.scrollHeight : null,
          // How much of the stack is outside the section's window. With a
          // scroller that is what the scrollbar reaches; with overflow visible
          // — which is what shipped — it is what gets PAINTED over the section
          // below instead.
          beyondTheWindow: body ? body.scrollHeight - body.clientHeight : null,
        };
      })()`;
    const density = await c.json(DENSITY_PROBE);

    // ANTI-VACUOUS, and the whole point of the row: a shot of a COLLAPSED
    // section is what the item-13 parcel already had, and it showed nothing.
    // `bodyHeight > 0` is what distinguishes expanded from collapsed —
    // CollapsibleSection renders `{!collapsed && children}`, so a collapsed
    // section is exactly its header tall.
    check('11a', 'the Layers section is genuinely EXPANDED (a body, not just a header)',
      !density.error && density.cards === 2 && density.bodyHeight > density.headerHeight,
      density.error ?? `${density.title}: ${density.cards} cards, header ${density.headerHeight}px, `
        + `body ${density.bodyHeight}px`);
    // 2 layers x (fa + fb) x (s1 + s2) = 8 packed spinners, and their `op`
    // selects beside them. Fewer means a factor form did not open and the shot
    // would be of the compact state again.
    check('11b', 'every packed-factor form is genuinely OPEN (8 spinners for 2 layers)',
      density.spinners === 8,
      `${density.spinners} packed spinners; opened: ${JSON.stringify(packedOpened)}`);
    // THE ONLY NON-AESTHETIC INVARIANT HERE: whatever the density turns out to
    // be, the stack must be REACHABLE — it either fits the dock or the dock
    // scrolls to it. "Tall" is a judgement; "present but unreachable" is a bug.
    // THE INVARIANT, and it is not an aesthetic one: whatever the stack's height
    // turns out to be, it must stay INSIDE the section that titles it. A list
    // section that lets its rows out paints them over the section below —
    // ui/CollapsibleSection's model says a list "scrolls inside its share", and
    // this is that half of the model, measured.
    const describe = (d) => `stack ${d.stackHeight}px (${(d.cardHeights || []).join('+')}) in a `
      + `${d.bodyHeight}px section body [overflowY:${d.bodyOverflowY}, `
      + `${d.bodyClientHeight}px window on ${d.bodyScrollHeight}px of content, `
      + `${d.beyondTheWindow}px beyond it]; dock ${d.panelClientHeight}px tall over `
      + `${d.panelScrollHeight}px of column; layer cards fully visible: `
      + `${d.cardsFullyVisibleInDock}/${d.cards}`;
    check('11c', 'the layer stack is clipped by its own section rather than let out over the next one',
      density.bodyOverflowY === 'auto' && density.bodyClientHeight > 0,
      describe(density));
    console.log(`        DENSITY (reported, not judged): ${JSON.stringify(density)}`);
    await shot(c, '4-layers-expanded-packed-spinners');

    // ---- 11d. THE SAME STATE AT THE SCHEMA'S MAXIMUM. --------------------
    // Two layers is what the item-13 shots had; eight is what the schema
    // permits, and a density question answered only at the small end is half an
    // answer. Grown here through the real Add-layer control, with every packed
    // form re-opened afterwards so the tall state is the tall state.
    for (let i = 0; i < EFFECTS_MAX_LAYERS - 2; i++) {
      await c.evalExpr(clickByText('/Add layer/'));
      await sleep(300);
    }
    await sleep(600);
    const openedMax = await openAllPackedForms();
    const dense = await c.json(DENSITY_PROBE);
    check('11d', 'the maximum stack really is at the maximum, expanded, with every form open',
      !dense.error && dense.cards === EFFECTS_MAX_LAYERS
      && dense.spinners === EFFECTS_MAX_LAYERS * 4
      && dense.bodyHeight > dense.headerHeight,
      dense.error ?? `${dense.title}: ${dense.cards} cards, ${dense.spinners} spinners `
        + `(opened ${openedMax.length} forms)`);
    // THE ROW THE DENSITY MEASUREMENT WAS ACTUALLY FOR. At eight layers with
    // every packed form open the stack is four times its section's height, and
    // before the list scroller landed `overflowY` read `visible`, so all 966px
    // of it beyond the window was PAINTED over the SECTION ASSIGNMENT rows —
    // photographed on master, shots-effects-scene/6-*.png. It must scroll.
    check('11e', 'the maximum stack scrolls inside its section instead of painting over the one below',
      dense.bodyOverflowY === 'auto' && dense.beyondTheWindow > 100,
      describe(dense));
    console.log(`        DENSITY AT MAX (reported, not judged): ${JSON.stringify(dense)}`);
    await shot(c, '6-layers-max-expanded-packed-spinners');

    // ---- 12. THE RED `soli…` BADGE — whose is it? (item 15b) --------------
    //
    // Attribution, not repair. The badge is the generic object box the map
    // overlay draws for a placement with no sprite preview
    // (canvas/OverlayRenderer.drawObjects): a red box with the placement's
    // typeId centred in it, in 8px monospace. aeon's act1 section_0 holds
    // exactly one placement and its typeId is the five-letter string "solid".
    const obj0 = await c.json('window.__dbg.aeon.objectAt(0, 0)');
    check('12a', 'the fixture still holds the placement this attribution was made against',
      !!obj0 && obj0.typeId === 'solid', JSON.stringify(obj0));

    // The scan is for the object box's OWN colours (canvas-colors.ts:
    // fill rgba(255,100,100,.7) over the art, stroke #ff4444) — reddish, and
    // nothing else on this act's canvas is. The control is spatial: the hits
    // must form ONE small cluster. A scan that matched the artwork would light
    // up the whole canvas and fail its own bounding-box check.
    const SCAN = String.raw`
      (() => {
        const cv = document.getElementById('map-canvas');
        if (!cv) return { error: 'no-map-canvas' };
        const ctx = cv.getContext('2d');
        const im = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < cv.height; y++) {
          for (let x = 0; x < cv.width; x++) {
            const i = (y * cv.width + x) * 4;
            const r = im[i], g = im[i + 1], b = im[i + 2];
            if (r > 190 && r - g > 60 && r - b > 60 && Math.abs(g - b) < 34) {
              n++;
              if (x < x0) x0 = x; if (y < y0) y0 = y;
              if (x > x1) x1 = x; if (y > y1) y1 = y;
            }
          }
        }
        ctx.save(); ctx.font = '8px monospace';
        const labelWidth = ctx.measureText('solid').width;
        ctx.restore();
        const r = cv.getBoundingClientRect();
        // The dock beside the canvas — the thing the badge is said to bleed into.
        const dock = [...document.querySelectorAll('div')].find((d) => {
          const cs = getComputedStyle(d);
          return cs.overflowY === 'auto' && parseFloat(cs.borderLeftWidth) >= 1
            && d.getBoundingClientRect().left > r.left;
        });
        const dockLeft = dock ? Math.round(dock.getBoundingClientRect().left) : null;
        const sx = (px) => Math.round(r.left + px * (r.width / cv.width));
        return {
          hits: n, bbox: n ? [x0, y0, x1, y1] : null,
          w: n ? x1 - x0 + 1 : 0, h: n ? y1 - y0 + 1 : 0,
          labelWidth, canvas: { w: cv.width, h: cv.height },
          css: { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) },
          screen: n ? { left: sx(x0), right: sx(x1 + 1) } : null,
          gapToCanvasRight: n ? Math.round(r.right - sx(x1 + 1)) : null,
          dockLeftEdge: dockLeft,
        };
      })()`;

    const onEffects = await c.json(SCAN);
    // Now the SAME window, a DIFFERENT facet. If the badge is the Effects
    // facet's, it is not here.
    const wentLayout = await c.evalExpr(clickByText('/^Layout$/'));
    await sleep(2000);
    const onLayout = await c.json(SCAN);
    await shot(c, '5-badge-on-layout-facet');
    check('12b', 'the facet bar switched away from Effects to Layout', wentLayout === true);
    check('12c', 'the red badge is on the LAYOUT facet too — it is the map overlay, not Effects',
      onLayout.hits > 0 && onEffects.hits > 0
      && Math.abs(onLayout.bbox[0] - onEffects.bbox[0]) <= 2
      && Math.abs(onLayout.bbox[1] - onEffects.bbox[1]) <= 2,
      `effects ${onEffects.hits} px bbox ${JSON.stringify(onEffects.bbox)} | `
      + `layout ${onLayout.hits} px bbox ${JSON.stringify(onLayout.bbox)}`);
    // THE SPATIAL CONTROL: one 16px box, not a canvas full of red artwork.
    check('12d', 'the scan found ONE small cluster, not reddish artwork everywhere',
      onLayout.w > 0 && onLayout.w <= 24 && onLayout.h > 0 && onLayout.h <= 24,
      `cluster ${onLayout.w}x${onLayout.h}px on a ${onLayout.canvas.w}x${onLayout.canvas.h} canvas`);
    // WHY IT LOOKS CUT OFF: the label is drawn centred on a 16px box and is
    // wider than it, measured in the app's own renderer. The "bleed" is that
    // overflow meeting the canvas's right edge — it has nothing to do with the
    // panel beside it.
    check('12e', 'the label is WIDER than the 16px box it is centred in (the truncation)',
      onLayout.labelWidth > 16,
      `"solid" measures ${onLayout.labelWidth}px in 8px monospace, box is 16px wide`);

    // WHY IT ONLY LOOKS WRONG ON THE EFFECTS FACET, stated as a measurement
    // rather than a guess: the badge does not move (same screen x on both
    // facets, from the same act at the same camera) — the CANVAS's right edge
    // moves, because the Effects dock is wider than every other map facet's.
    // The object simply lands near the edge of the narrower canvas.
    check('12f', 'the badge does not move between facets — the canvas edge does',
      onEffects.screen && onLayout.screen
      && Math.abs(onEffects.screen.right - onLayout.screen.right) <= 2,
      `badge screen x ${JSON.stringify(onEffects.screen)} on Effects vs `
      + `${JSON.stringify(onLayout.screen)} on Layout | canvas css width `
      + `${onEffects.css.width} vs ${onLayout.css.width}, dock left edge `
      + `${onEffects.dockLeftEdge} vs ${onLayout.dockLeftEdge} | clearance to the canvas's own `
      + `right edge: ${onEffects.gapToCanvasRight}px on Effects, `
      + `${onLayout.gapToCanvasRight}px on Layout`);

    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(600);

    // Leave the tree as found: nothing was ever written, and the store is reset
    // by the reload so a stray Ctrl+S from a later session cannot pick this up.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload').catch(() => {});
  } finally {
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
