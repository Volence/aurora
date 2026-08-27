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
//   R3  "Add layer" is clicked LAYERS times; LAYERS defaults to the app's own
//       ceiling (click until the control disables itself), so the count is
//       derived and not chosen.
//
//       ⚠ IT IS PINNABLE NOW, AND THE 2026-08-27 RUN PINNED IT TO 8. Read this
//       before assuming a re-run reproduces a previous one. When this fixture
//       was last originated (2026-08-23) the app's ceiling was 8, and the file
//       carries 8 layers with v_factor/v_center/v_offset all derived from that
//       8. ROADMAP row 56 then raised the ceiling to 16 (empyrean 277bc15,
//       `layers` maxItems 8 -> 16) and NOBODY RE-RAN THIS FIXTURE, so it was
//       already stale against its own gesture rule before row 59 touched it.
//
//       A literal ceiling-driven re-run therefore moves ~9 lines at once — eight
//       new layer blocks plus three N-derived scalars — and that would CONFOUND
//       the corroboration this fixture is verified by: the re-origination
//       protocol (see the provenance) reads a re-run as faithful when the delta
//       is exactly the lines the contract change touched, and a delta carrying
//       an unrelated capability change proves nothing about either. Row 59's
//       brief refuses the same conflation for the row-58 deform controls in as
//       many words ("do NOT widen the gesture sequence ... that would confound
//       the one-line-delta corroboration"); the ceiling is that case exactly.
//
//       So LAYERS=8 was PINNED for row 59's run, with this note as the record,
//       and the ceiling re-origination is booked as its own ROADMAP row. Row 4a
//       still MEASURES the app's real ceiling and prints it, so the staleness
//       stays visible instead of being hidden by the pin.
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
//   R9  transition = the LAST option that select offers. It USED to read
//       "precision and transition"; ROADMAP row 59 retired `precision` — aeon
//       deleted the storage (scene_dsl.emp:422-423) and empyrean 0bd4753 cut the
//       key from the schema — so the control is gone and the gesture is one
//       select, not two. Its ABSENCE is measured instead, on the rendered
//       surface, by row 6f: the node suite cannot see a React tree, so "the
//       dropdown is gone" is a claim only a live app can settle.
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

// The layer count. Unset = the app's own ceiling (fully derived, the original
// rule). Set = pinned, and the run prints BOTH so a pinned run can never be
// mistaken for a ceiling-driven one. See R3 above for why row 59 pinned it.
const LAYERS_PIN = process.env.LAYERS ? Number(process.env.LAYERS) : null;

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
    // WAS `scenes.length === 1 && scenes[0].id === SCENE_ID`, and that stopped
    // being true for a reason that has nothing to do with this harness: when the
    // fixture was originated (2026-08-23) the aeon project had NO
    // games/sonic4/data/editor/effects/ directory at all, so the scene this
    // session created was the only one and index 0 was safe. The project has
    // since gained real scenes (ojz_act1_start, ojz_act1_depth), so index 0 is
    // now somebody else's scene — which is why every `doc[0]` below became
    // `sceneOf(doc)`. Addressing BY ID is what the rows meant all along.
    check('3c', 'clicking New created the scene in the MODEL, not just on screen',
      scenes.some((x) => x.id === SCENE_ID),
      // Anti-vacuous: the pre-existing scenes are visible too, so a green here
      // is the new scene appearing rather than the model being unreadable.
      `${scenes.length} scenes: ${JSON.stringify(scenes.map((x) => x.id))}`);

    // The Name field is the ONE text input on the surface with neither a title
    // nor a placeholder (the Filter box and new_scene_id both have placeholders).
    const named = await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input')].find(e => e.type === 'text'
         && !e.getAttribute('placeholder') && !e.title)`,
      SCENE_NAME));
    check('3d0', 'the Name field was found and took a real keystroke', named === 'ok', `named=${named}`);
    await sleep(600);
    // The scene THIS session authored, by id — never by index. See row 3c.
    const sceneOf = (d) => {
      const hit = (d ?? []).find((x) => x && x.id === SCENE_ID);
      if (!hit) throw new Error(`the authored scene ${SCENE_ID} is not in the document`);
      return hit;
    };
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('3d', 'the typed name reached the DOCUMENT', sceneOf(doc).name === SCENE_NAME,
      `name=${JSON.stringify(sceneOf(doc).name)}`);

    // ---- 4. R3: add layers. Until the control refuses, or to LAYERS_PIN. ---
    // The ceiling is MEASURED either way (see `ceiling` below), so a pinned run
    // still reports what the app would have allowed. That is what keeps the pin
    // honest rather than hiding the very staleness it exists to sidestep.
    let adds = 0;
    let refused = false;
    for (let i = 0; i < 32; i++) {
      if (LAYERS_PIN !== null && adds + 1 >= LAYERS_PIN) break;
      const r = await c.evalExpr(clickByText('/Add layer/'));
      if (r !== true) { refused = true; break; }
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
    const N = sceneOf(doc).layers.length;
    // The app's OWN ceiling, read off the panel rather than inferred from where
    // the clicking stopped — a pinned run never reaches the ceiling, so the two
    // are different numbers and the row must not confuse them.
    const ceiling = await c.json(`(() => {
      const m = /\\((\\d+)\\s*\\/\\s*(\\d+)/.exec(document.body.innerText || '');
      return { layersTitle: m ? { shown: +m[1], max: +m[2] } : null };
    })()`);
    check('4a', LAYERS_PIN === null
      ? "the layer stack grew to the app's own ceiling (not a number typed here)"
      : `the layer stack reached the PINNED count (${LAYERS_PIN}), and the app's own `
        + 'ceiling is reported beside it, not hidden by the pin',
      adds > 0 && N === adds + 1
      && (LAYERS_PIN === null ? refused : N === LAYERS_PIN)
      // Anti-vacuous in both modes: more than one layer, and a pin may never
      // exceed what the app would allow.
      && N > 1
      && (ceiling.layersTitle === null || N <= ceiling.layersTitle.max),
      `${adds} Add-layer clicks → ${N} layers; pin=${LAYERS_PIN ?? 'none (ceiling-driven)'}; `
      + `refused=${refused}; app ceiling reads ${JSON.stringify(ceiling.layersTitle)}`);
    // ROW 4c — the staleness this fixture's R3 note is about, MEASURED. It is a
    // report, not a pass/fail on row 59: if the app's ceiling is above the count
    // this fixture carries, the fixture is stale against its own gesture rule and
    // a ceiling re-origination is owed. Row 59 deliberately does not do it, to
    // keep its own delta interpretable.
    check('4c', 'the app ceiling vs this run\'s layer count is REPORTED, not assumed',
      ceiling.layersTitle !== null,
      ceiling.layersTitle === null
        ? 'could not read the "Layers (n/m)" title — ceiling UNMEASURED'
        : `app ceiling ${ceiling.layersTitle.max}, this run authored ${N}`
          + (ceiling.layersTitle.max > N
            ? ` — STALE by ${ceiling.layersTitle.max - N}: a ceiling re-origination is owed (own ROADMAP row)`
            : ' — at the ceiling'));

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
      // `\\b`, NOT `$`. These read `/^Layer i fa$/` until 2026-08-27 and had
      // SILENTLY STOPPED MATCHING: the factor rows' titles gained an explanatory
      // suffix (`PLANE_FACTOR_ROWS.fa.title` = "fa — how far Plane A, the
      // foreground level plane, scrolls per pixel of camera movement"), so an
      // end-anchored title match found nothing, SET_INPUT returned 'no-element',
      // and every layer kept its default FACTOR_1. The fixture has not been
      // re-originated since 2026-08-23, which is why nobody saw it. Row 5c is
      // what catches this — see its note.
      await c.evalExpr(SET_INPUT(SEL_BY_TITLE(`/^Layer ${i} fa\\b/`), factorOpts[i % factorOpts.length]));
      await sleep(180);
      await c.evalExpr(SET_INPUT(SEL_BY_TITLE(`/^Layer ${i} fb\\b/`),
        factorOpts[(factorOpts.length - 1 - i + factorOpts.length) % factorOpts.length]));
      await sleep(180);
    }
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5b', 'every layer took its enumerated world_y',
      sceneOf(doc).layers.every((l, i) => l.world_y === i * 32),
      JSON.stringify(sceneOf(doc).layers.map((l) => l.world_y)));
    // ROW 5c EARNED ITS KEEP ON 2026-08-27. It is the only row that can tell
    // "the session drove the factor selects" from "the session left every layer
    // at the app's default", because FACTOR_1 is BOTH a legal enumerated answer
    // and the default. Layer 0's fb is the one cell where the enumeration lands
    // on the packed sentinel — a value no default ever produces — so a run that
    // silently drove nothing cannot fake it. It went red here, which is how the
    // rotted `$`-anchored selectors above were found.
    check('5c', 'layer 0 fb is a PACKED triple, seeded by the app, not typed here',
      typeof sceneOf(doc).layers[0].fb === 'object' && sceneOf(doc).layers[0].fb !== null,
      JSON.stringify(sceneOf(doc).layers[0].fb));

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
    // `/^v_offset$/` until 2026-08-27, same silent no-match as the factor rows
    // above: the title is "v_offset — signed pixel offset added after the shift,
    // …". Row 6b is what caught it, by reading the DOCUMENT rather than trusting
    // the gesture — the key was simply absent from the authored scene.
    await c.evalExpr(SET_INPUT(NUM_BY_TITLE('/^v_offset\\b/'), -N));
    await sleep(300);
    // ROW 6f — ROADMAP row 59, ON THE RENDERED SURFACE.
    //
    // THE BAR THIS ROW EXISTS FOR: ~5,000 node tests pass while a feature is
    // visibly broken, because vitest cannot see React or a mounted panel. The
    // node suite can prove `SCENE_FORM_CHOICES` has no `precision` key and that
    // the panel SOURCE has no literal; only a running app can prove there is no
    // `Precision` dropdown on screen.
    //
    // MEASURED THREE WAYS, because each alone has an alternative green path:
    //   (a) no <select> whose title mentions precision — but a control rendered
    //       with a changed title would slip past that, so
    //   (b) no visible LABEL reading "Precision" anywhere in the panel, and
    //   (c) the Scene section is genuinely MOUNTED and populated, so (a) and (b)
    //       are not passing because the panel failed to render at all. (c) is
    //       the one that makes the other two mean anything: an unmounted panel
    //       trivially contains no Precision control.
    const precGone = await c.json(`(() => {
      const titled = [...document.querySelectorAll('select')]
        .filter(e => /precision/i.test(e.title || ''));
      const labels = [...document.querySelectorAll('label, span, div')]
        .filter(e => e.children.length === 0
          && (e.textContent || '').trim().toLowerCase() === 'precision');
      const transition = [...document.querySelectorAll('select')]
        .filter(e => /^transition$/.test(e.title || ''));
      const vfactor = [...document.querySelectorAll('input')]
        .filter(e => /^v_factor/.test(e.title || ''));
      return {
        precisionSelects: titled.length,
        precisionLabels: labels.length,
        transitionSelects: transition.length,
        vFactorInputs: vfactor.length,
        selectsInPanel: document.querySelectorAll('select').length,
      };
    })()`);
    check('6f', 'the RETIRED Precision control is GONE from the running app '
      + '(and the Scene form around it is really mounted)',
      precGone.precisionSelects === 0
      && precGone.precisionLabels === 0
      // Anti-vacuous: its ROW-MATES are on screen, so the two zeroes above are
      // an absent control, not an absent panel.
      && precGone.transitionSelects === 1
      && precGone.vFactorInputs === 1
      && precGone.selectsInPanel > 1,
      JSON.stringify(precGone));

    const transOpts = await c.json(
      `(() => { const s = ${SEL_BY_TITLE('/^transition$/')}; return s ? [...s.options].map(o => o.value) : null; })()`);
    check('6a', 'the transition select has options in it',
      Array.isArray(transOpts) && transOpts.length > 0,
      `transition=${JSON.stringify(transOpts)}`);
    await c.evalExpr(SET_INPUT(SEL_BY_TITLE('/^transition$/'), transOpts[transOpts.length - 1]));
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    // ROW 6b LIKEWISE. It reads the model rather than trusting that a gesture
    // landed, so a selector that matches nothing shows up as a missing key.
    check('6b', 'the scene-level enumerated choices reached the DOCUMENT',
      sceneOf(doc).v_factor === N
      && sceneOf(doc).v_center === N && sceneOf(doc).v_offset === -N
      && sceneOf(doc).transition === transOpts[transOpts.length - 1],
      JSON.stringify({ v_center: sceneOf(doc).v_center, v_offset: sceneOf(doc).v_offset,
        transition: sceneOf(doc).transition, v_factor: sceneOf(doc).v_factor }));
    // ROW 6g — the retired key must not reach the DOCUMENT by any other route.
    // 6f watches the screen; this watches the model the writer will serialise.
    // A default seeded in `newEffectsScene`, or a stale command replayed from
    // history, would put `precision` back in the file without any control on
    // screen, and 6f alone would stay green through it.
    check('6g', 'no `precision` key reached the authored DOCUMENT',
      !('precision' in sceneOf(doc)),
      `scene keys: ${JSON.stringify(Object.keys(sceneOf(doc)))}`);

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
    // ROW 7f — the end of the chain: screen (6f), model (6g), FILE ON DISK.
    // This is the one that matters for the fixture, because the fixture IS these
    // bytes. Checked on the raw text as well as the parse, so a key that
    // survived as a string but not as JSON could not hide.
    check('7f', 'the retired `precision` is absent from the emitted FILE',
      !('precision' in parsed) && !/precision/.test(text),
      `keys=${JSON.stringify(Object.keys(parsed))}`);
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
