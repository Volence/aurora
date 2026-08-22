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
