#!/usr/bin/env node
// WRITER-ORIGINATED EFFECTS SCENE — author one in the running app, save it
// through the app's own Ctrl+S, and take the bytes off disk untouched.
//
// WHY THIS EXISTS (ROADMAP item 31). `test/fixtures/effects/canopy_dusk.json` is
// writer-CERTIFIED: hand-written for shape coverage, then proven byte-identical
// through `serializeEffectsScene(parseEffectsScene(GOLDEN))`. That is a real
// implementation cross-check, but it is not corroboration of the VALUES, because
// a hand-written fixture was derived by reading the same schema the codec reads.
// Two derivations that share a frame are echo. A file that falls out of a real
// authoring session was enumerated over the UI's own option lists — a parameter
// nobody chose while writing the schema — which is what breaks the shared frame.
//
// THEREFORE: nothing in this harness types a JSON key, and nothing hand-edits the
// result. Every value that lands in the document is either
//   • the app's own default (never touched — a create writes minimal keys), or
//   • the option at a computed INDEX into a `<select>`'s own option list, or
//   • a number derived from the layer index by one rule stated once, below.
//
// THE GESTURE RULE, in full (this is the provenance):
//   R1  scene id typed into the real `new_scene_id` field, then "New" clicked.
//   R2  the Name field takes a real keystroke.
//   R3  "Add layer" is clicked until the control DISABLES itself — the layer
//       count is the app's ceiling, not a number chosen here.
//   R4  layer i: world_y = i * 32.
//   R5  layer i: fa = the option at index i of that select's own option list.
//   R6  layer i: fb = the option at index (len - 1 - i) of the same list.
//       For i = 0 that is the LAST option, which is the custom-packed sentinel —
//       so the packed triple in the emitted file is whatever the app seeds, never
//       something typed here.
//   R7  scene v_factor = N (N = the layer count from R3), typed into the real
//       spinner. It USED to be "the option at index N of the v_factor select",
//       and that select is gone: ROADMAP item 35 retyped `v_factor` from a
//       $defs/factor to a plain 0..15 shift count, so the control is a bounded
//       number field. N is chosen by the same rule R8 uses and for the same
//       reason — it is the app's own ceiling, not a number picked here — and it
//       is deliberately NOT the field's `max`, because `max` is also the
//       new-scene default and a fixture carrying it would prove the control
//       moved nothing. The affordance itself is checked separately (row 6d).
//   R8  v_center = N, v_offset = -N.
//   R9  precision and transition = the LAST option each select offers.
//   R10 the section-assignment select is set to the scene's id.
//   R11 Ctrl+S, dispatched as a real key event to the real window.
//
// ⚠ IT WRITES TO A COPY, NEVER TO AEON. `AEON_DIR` here defaults to a copy of the
// aeon tree under this session's scratchpad. aeon's own tree is another session's
// live working directory and is never opened, never saved to, never read for
// anything but that copy.
//
// ANTI-VACUOUS. The effects directory must not exist before the save (row 1b),
// the scene must reach the MODEL and not just the screen (row 3c), the layer
// count must be > 1 (row 4a), and the emitted file must contain that many layers
// (row 7c). A run where the panel never mounted cannot pass any of them.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/writer-originated-scene-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9394);
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
// A WRITABLE COPY of the aeon project. Never aeon's own tree.
const AEONDIR = process.env.AEON_DIR;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
const SHOTS = `${ROOT}/scratchpad/shots-writer-originated`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = process.env.SCENE_ID ?? 'writer_session_ojz';
const SCENE_NAME = process.env.SCENE_NAME ?? 'Oracle Jungle Zone — writer session';
const OUT = process.env.OUT ?? `${ROOT}/scratchpad/writer-originated-emitted.json`;
const SCENE_FILE = `${AEONDIR}/games/sonic4/data/editor/effects/${SCENE_ID}.json`;

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
  console.log(`        shot → scratchpad/shots-writer-originated/${name}.png`);
}

// A React-controlled input ignores `el.value = x`. The native setter plus a
// bubbling input/change event is what a real keystroke looks like to React.
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

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;
const NUM_BY_TITLE = (re) => `[...document.querySelectorAll('input[type=number]')].find((e) => ${re}.test(e.title || ''))`;

// A DEFECT THIS HARNESS HAD TO ROUTE AROUND, recorded rather than fixed here.
//
// CollapsibleSection wraps its whole PanelHeader — including the `right` action
// slot — in `<div onClick={toggle}>`, and IconButton does not stop propagation.
// So every click of the "Add layer" button in the Layers header ALSO toggles the
// Layers section. Seven adds is an odd number of toggles, which is why the first
// run of this harness found "Layers (8/8)" on screen with not one layer card
// under it: the model had eight layers and the section was shut.
//
// It is a real UI bug (same shape for the Scene section's Delete button), it is
// out of this parcel's scope, and it is booked in the report. Here the section is
// simply re-opened by clicking its own header — a real click, same as a user's.
const EXPAND_LAYERS = String.raw`
(() => {
  const open = () => [...document.querySelectorAll('select')].some((e) => /^Layer 0 fa$/.test(e.title || ''));
  if (open()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer'
      && /^Layers \(/.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) return 'no-header';
  hdr.click();
  return 'clicked';
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

    // ---- 1. Open the COPY. Its editor/effects/ must not exist yet. --------
    check('1b', 'no effects scene file exists on disk before the session', !existsSync(SCENE_FILE),
      SCENE_FILE);
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the copied aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can be measured');

    // ---- 2. The Effects facet. -------------------------------------------
    await sleep(2500);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill', clicked === true, `click=${clicked}`);
    await sleep(1500);
    const headings = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^(Scenes|Layers|Section assignment|Scene —)/.test(t))`);
    check('2b', 'the Effects panel is mounted (its own headings are on screen)',
      headings.some((h) => h === 'Scenes'), JSON.stringify(headings));

    // ---- 3. R1/R2: create the scene, name it. ----------------------------
    const typed = await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    check('3a', 'the new-scene id field accepts a real keystroke', typed === 'ok', `typed=${typed}`);
    const pressedNew = await c.evalExpr(clickByText('/^New$/'));
    check('3b', 'the New button is on screen and clickable', pressedNew === true, `new=${pressedNew}`);
    await sleep(900);
    let scenes = await c.json('window.__dbg.aeon.scenes()');
    check('3c', 'clicking New created the scene in the MODEL, not just on screen',
      scenes.length === 1 && scenes[0].id === SCENE_ID, JSON.stringify(scenes));

    // The Name field is the ONE text input on the surface with neither a title
    // nor a placeholder (the Filter box and new_scene_id both have placeholders).
    const named = await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input')].find(e => e.type === 'text'
         && !e.getAttribute('placeholder') && !e.title)`,
      SCENE_NAME));
    check('3d0', 'the Name field was found and took a real keystroke', named === 'ok', `named=${named}`);
    await sleep(600);
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('3d', 'the typed name reached the DOCUMENT', doc[0]?.name === SCENE_NAME,
      `name=${JSON.stringify(doc[0]?.name)}`);

    // ---- 4. R3: add layers until the control disables itself. -------------
    let adds = 0;
    for (let i = 0; i < 32; i++) {
      const r = await c.evalExpr(clickByText('/Add layer/'));
      if (r !== true) break;
      adds++;
      await sleep(400);
      // See EXPAND_LAYERS: the add click also toggles the section it lives in.
      await c.evalExpr(EXPAND_LAYERS);
      await sleep(250);
    }
    const expanded = await c.evalExpr(EXPAND_LAYERS);
    await sleep(400);
    check('4b', 'the Layers section is open, so its cards are on screen to be driven',
      expanded === 'already-open' || expanded === 'clicked', `expand=${expanded}`);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const N = doc[0]?.layers?.length ?? 0;
    check('4a', 'the layer stack grew to the app\'s own ceiling (not a number typed here)',
      adds > 0 && N === adds + 1, `${adds} Add-layer clicks → ${N} layers`);

    // ---- 5. R4/R5/R6: enumerate the factor selects by INDEX. --------------
    if (process.env.INVENTORY) {
      const inv = await c.json(`({
        selects: [...document.querySelectorAll('select')].map(e => e.title),
        inputs: [...document.querySelectorAll('input')].map(e => e.title + '|' + e.type + '|' + (e.getAttribute('placeholder')||'')),
        headings: [...document.querySelectorAll('span')].map(e => (e.textContent||'').trim()).filter(t => t.length && t.length < 40),
      })`);
      console.log('        INVENTORY', JSON.stringify(inv, null, 1));
    }
    const factorOpts = await c.json(
      `(() => { const s = ${SEL_BY_TITLE('/Layer 0 fa/')}; return s ? [...s.options].map(o => o.value) : null; })()`);
    check('5a', 'the layer factor select has options in it (a derivation that yielded undefined renders empty)',
      Array.isArray(factorOpts) && factorOpts.length > 1,
      `${factorOpts?.length} options: ${JSON.stringify(factorOpts)}`);
    if (!Array.isArray(factorOpts) || factorOpts.length < 2) throw new Error('empty factor select');

    for (let i = 0; i < N; i++) {
      await c.evalExpr(SET_INPUT(NUM_BY_TITLE(`/^Layer ${i} world_y/`), i * 32));
      await sleep(180);
      await c.evalExpr(SET_INPUT(SEL_BY_TITLE(`/^Layer ${i} fa$/`), factorOpts[i % factorOpts.length]));
      await sleep(180);
      await c.evalExpr(SET_INPUT(SEL_BY_TITLE(`/^Layer ${i} fb$/`),
        factorOpts[(factorOpts.length - 1 - i + factorOpts.length) % factorOpts.length]));
      await sleep(180);
    }
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5b', 'every layer took its enumerated world_y',
      doc[0].layers.every((l, i) => l.world_y === i * 32),
      JSON.stringify(doc[0].layers.map((l) => l.world_y)));
    check('5c', 'layer 0 fb is a PACKED triple, seeded by the app, not typed here',
      typeof doc[0].layers[0].fb === 'object' && doc[0].layers[0].fb !== null,
      JSON.stringify(doc[0].layers[0].fb));

    // ---- 6. R7/R8/R9: scene-level fields. --------------------------------
    // ITEM 35, ON THE RENDERED SURFACE. `v_factor` is a shift count, so its
    // control must be a bounded number input and must NOT be the factor picker.
    // Read the affordance off the DOM before driving it: what the running app
    // offers is the parameter this whole item turned on, and the node suite
    // cannot see it.
    const vfCtl = await c.json(`(() => {
      const sel = [...document.querySelectorAll('select')]
        .find(e => /v_factor/.test(e.title || ''));
      const inp = [...document.querySelectorAll('input')]
        .find(e => /^v_factor/.test(e.title || ''));
      return {
        isSelect: !!sel,
        selOptions: sel ? [...sel.options].map(o => o.value) : null,
        isNumber: !!inp && inp.type === 'number',
        min: inp ? inp.min : null,
        max: inp ? inp.max : null,
      };
    })()`);
    check('6d', 'v_factor is a bounded NUMBER control, and offers no FACTOR_* name',
      vfCtl.isNumber && !vfCtl.isSelect
      && Number(vfCtl.min) === 0 && Number(vfCtl.max) > Number(vfCtl.min),
      JSON.stringify(vfCtl));
    check('6e', 'the v_factor control the session drives is NOT the layer factor picker',
      !(vfCtl.selOptions || []).some((o) => /^FACTOR_/.test(o)),
      `select options at v_factor: ${JSON.stringify(vfCtl.selOptions)}`);
    await c.evalExpr(SET_INPUT(NUM_BY_TITLE('/^v_factor/'), N));
    await sleep(300);
    await c.evalExpr(SET_INPUT(NUM_BY_TITLE('/^v_center/'), N));
    await sleep(300);
    await c.evalExpr(SET_INPUT(NUM_BY_TITLE('/^v_offset$/'), -N));
    await sleep(300);
    const precOpts = await c.json(
      `(() => { const s = ${SEL_BY_TITLE('/precision/')}; return s ? [...s.options].map(o => o.value) : null; })()`);
    const transOpts = await c.json(
      `(() => { const s = ${SEL_BY_TITLE('/^transition$/')}; return s ? [...s.options].map(o => o.value) : null; })()`);
    check('6a', 'the precision and transition selects have options in them',
      Array.isArray(precOpts) && precOpts.length > 0 && Array.isArray(transOpts) && transOpts.length > 0,
      `precision=${JSON.stringify(precOpts)} transition=${JSON.stringify(transOpts)}`);
    await c.evalExpr(SET_INPUT(SEL_BY_TITLE('/precision/'), precOpts[precOpts.length - 1]));
    await sleep(300);
    await c.evalExpr(SET_INPUT(SEL_BY_TITLE('/^transition$/'), transOpts[transOpts.length - 1]));
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('6b', 'the scene-level enumerated choices reached the DOCUMENT',
      doc[0].v_factor === N
      && doc[0].v_center === N && doc[0].v_offset === -N
      && doc[0].precision === precOpts[precOpts.length - 1]
      && doc[0].transition === transOpts[transOpts.length - 1],
      JSON.stringify({ v_center: doc[0].v_center, v_offset: doc[0].v_offset,
        precision: doc[0].precision, transition: doc[0].transition, v_factor: doc[0].v_factor }));

    // ---- R10: assign the scene to the active section. --------------------
    const assigned = await c.evalExpr(SET_INPUT(SEL_BY_TITLE('/sceneRef/'), SCENE_ID));
    await sleep(600);
    const activeSection = await c.evalExpr('window.__dbg.aeon.activeSection()');
    const ref = await c.evalExpr(`window.__dbg.aeon.sceneRef(${activeSection})`);
    check('6c', "the assignment reached the section's sceneRef in the model",
      assigned === 'ok' && ref === SCENE_ID,
      `section ${activeSection} sceneRef=${JSON.stringify(ref)}`);
    await shot(c, '1-authored-scene');

    // ---- 7. R11: SAVE, through the app's own Ctrl+S. ---------------------
    for (const type of ['keyDown', 'keyUp']) {
      await c.send('Input.dispatchKeyEvent', {
        type, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2,
      });
    }
    let sawFile = false;
    for (let i = 0; i < 40; i++) {
      if (existsSync(SCENE_FILE)) { sawFile = true; break; }
      await sleep(500);
    }
    const toasts = await c.json('window.__dbg.aeon.toasts()');
    check('7a', 'Ctrl+S wrote the scene file through the app\'s own save path', sawFile,
      `${SCENE_FILE}\n        toasts: ${JSON.stringify(toasts.map((t) => `${t.type}:${t.message}`.slice(0, 80)))}`);
    if (!sawFile) throw new Error('no file written — nothing below can be measured');

    const bytes = readFileSync(SCENE_FILE);
    const text = bytes.toString('utf8');
    const parsed = JSON.parse(text);
    check('7b', 'the emitted file is the scene the session authored',
      parsed.id === SCENE_ID && parsed.name === SCENE_NAME, `id=${parsed.id}`);
    check('7c', 'the emitted file carries every layer the session added (not an empty stub)',
      Array.isArray(parsed.layers) && parsed.layers.length === N,
      `${parsed.layers?.length} layers in the file, ${N} in the model`);
    check('7d', 'the emitted file is non-trivial', bytes.length > 200, `${bytes.length} bytes`);
    // ITEM 35: the value the engine reads must be a number the engine can read.
    // The old select wrote 'FACTOR_0', which folds to the byte 255.
    check('7e', 'the emitted v_factor is an integer in the control\'s own range',
      Number.isInteger(parsed.v_factor)
      && parsed.v_factor >= Number(vfCtl.min) && parsed.v_factor <= Number(vfCtl.max),
      `v_factor=${JSON.stringify(parsed.v_factor)} range=[${vfCtl.min},${vfCtl.max}]`);
    writeFileSync(OUT, bytes);
    console.log(`\n        emitted bytes → ${OUT} (${bytes.length} bytes)`);
    console.log(`        sha256 = ${(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')}`);
    console.log('---- FILE AS EMITTED ----');
    console.log(text);
    console.log('---- END ----');
    await shot(c, '2-after-save');
  } finally {
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
