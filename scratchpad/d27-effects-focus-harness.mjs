#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// d-27 ON THE SURVEY'S EFFECTS-PANEL CONTROLS — the real app, real clicks.
//
// Sibling of `scratchpad/d27-sprite-focus-harness.mjs`, which covers the six
// sprite-mode controls; this file covers the effects half of the same survey
// (`docs/reviews/2026-09-03-d27-blur-after-press.md`, "Tagged, not fixed"):
//
//   [esp] effects/EffectsScenePanel.tsx   Remove layer   (removeLayerCommand)
//   [bnd] effects/BandPresetPanel.tsx     Remove raster band  (removeBandCommand)
//   [cyc] effects/BandPresetPanel.tsx     Remove cycle channel
//                                              (removeCycleChannelCommand)
//
// All three are the `key={i}` LIST-REMOVAL family, and [cyc] is the purest
// instance of the d-27 shape anywhere in the survey: no `disabled` predicate,
// no refusal, no confirmation, and a schema that accepts an empty `cycles`
// list — so before the ruling nothing at all stopped a held Space walking the
// whole channel list away, one keystroke per channel.
//
// ═══ THE ROW SHAPE, AND THE ONE ROW THIS SITE CANNOT HAVE ═════════════════
//
//   -a  a REAL click drops focus AND the same click still removed a layer.
//       The second half is IN THE CONDITION: a `disabled` button, or one React
//       never wired, does not take focus on click either.
//   -b  a bare Space afterwards reaches no writer, with its vacuity guard in
//       the condition and a positive control on the same key channel.
//   -c  a SECOND real click at the SAME pixel still fires and drops focus.
//       Without it, "d-27 works" and "the handler was deleted" are the same
//       artifact.
//   -e  THE RETARGET, proved by DOM NODE IDENTITY: the button that removed
//       layer 0 is the SAME DOM node afterwards, still mounted, now addressing
//       the layer that slid down into slot 0.
//
// ⚠ THERE IS NO `-d` (`[k7]`) AT THIS SITE, AND THAT IS A FINDING RATHER THAN
// A GAP. `[k7]` needs a press an author can actually perform that writes
// nothing. `removeLayerCommand` has three null paths and `editSceneCommand` a
// fourth, but every one of them is UNREACHABLE from an enabled button: the
// scene exists (it is the selected one), the index is in range (the card
// renders it), the splice always changes the document, and the floor
// (`EFFECTS_LAYER_COUNT.min`) is exactly the predicate that DISABLES the
// button — and a disabled button fires no onClick at all. So the honest report
// is a NOTE, not a row that would be green by construction. The
// unconditionality of the blur here is carried by the shared helper, which
// blurs before `act()`, and by plant P8 in the review packet, which shows the
// `[k7]`-shaped row dying at the one site that HAS a reachable no-op press.
//
// ═══ WHY NODE IDENTITY FOR THE RETARGET, AND NOT LAYER CONTENT ════════════
//
// The sprite harness proves the same property by CONTENT: its four timeline
// steps are built with distinct frame indices, so "removed the neighbour" and
// "removed the same one again" are distinguishable. Layers added by `Add layer`
// are IDENTICAL to each other, so content cannot distinguish those two
// readings here at all — a row that tried would be undecidable and would look
// like it had measured something. Node identity answers the question the
// survey actually asked ("does the button survive its own click?") directly
// and without a fabricated fixture: the element is captured before the click
// and compared with `===` after it.
//
// ⚠ IT WRITES NOTHING TO DISK. No save is issued and the app has no autosave
// (`shell/close-guard.ts`). The scene it creates is created IN MEMORY by the
// panel's own New button; `[z1]` re-reads the library at the end and reports
// what this run added, and every removal is undone through the app's history.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:d27-effects-focus
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
//                          AURORA_BUILT_TREE=<this worktree>
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9475);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = join(ROOT, 'scratchpad/shots-d27-effects-focus');
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'd27_focus_probe';
const PRESET_ID = 'd27_focus_preset';

// ── the layer floor and ceiling, READ OUT OF THE SCHEMA, never pinned ───────
//
// `EFFECTS_LAYER_COUNT` is derived from `aurora-effects-scene.schema.json`'s
// `minItems`/`maxItems`, and the ceiling has already moved once (8 → 16,
// empyrean 277bc15). A pinned copy here would make the fixture rows lie the
// next time it moves.
const SCHEMA_SRC = join(ROOT, 'src/core/formats/effects/aurora-effects-scene.schema.json');
function layerBounds() {
  const schema = JSON.parse(readFileSync(SCHEMA_SRC, 'utf8'));
  const node = schema?.properties?.layers;
  if (!node || typeof node.minItems !== 'number' || typeof node.maxItems !== 'number') {
    throw new Error(`could not read properties.layers minItems/maxItems out of ${SCHEMA_SRC}`);
  }
  return { min: node.minItems, max: node.maxItems };
}
const LAYERS = layerBounds();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}

async function mouse(c, type, x, y) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);
const space = (c) => key(c, ' ', 'Space', 32);
const enter = (c) => key(c, 'Enter', 'Enter', 13);

/**
 * A REAL CLICK, aimed at integer client pixels and verified before it is sent.
 *
 * ⚠ NOT `el.click()`. A synthetic click does not focus the button, so a
 * `.click()`-driven run can neither reproduce nor disprove the focus defect.
 * `devicePixelRatio` varies run-to-run under Xvfb here, so the centre is
 * rounded to an integer BEFORE it is sent and then checked with
 * `elementFromPoint`; a miss REFUSES rather than measuring something else.
 */
async function clickHandle(c, handle, label) {
  const geom = await c.json(String.raw`(() => {
    const el = window.__d27e.el(${JSON.stringify(handle)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    return { dpr: window.devicePixelRatio, left: b.left, top: b.top, w: b.width, h: b.height,
             disabled: !!el.disabled, text: (el.textContent || '').trim().slice(0, 24),
             aria: el.getAttribute('aria-label') };
  })()`);
  if (!geom) throw new Error(`HANDLE ABSENT: "${handle}" (${label}) resolved to nothing. Refusing to `
    + 'click — a run that cannot find its own subject measures nothing.');
  await sleep(60);
  const x = Math.round(geom.left + geom.w / 2);
  const y = Math.round(geom.top + geom.h / 2);
  // ⚠ THE HIT MAY BE A DESCENDANT, AND THAT IS STILL A HIT. `IconButton`
  // renders its word as `<span>Add</span>` INSIDE the button, so
  // `elementFromPoint` at the centre returns the span, not the button. A
  // strict `el === want` refuses a perfectly good aim — this file's first run
  // died exactly there. What the row needs is that the pixel lies inside the
  // button we meant, because the click event bubbles to it and the browser
  // focuses it; `want.contains(el)` says that and nothing weaker. The note
  // prints WHICH of the two it was, so a future reader can see that the
  // relaxation is a containment check and not a match on tag or text.
  const hit = await c.json(String.raw`(() => {
    const want = window.__d27e.el(${JSON.stringify(handle)});
    const el = document.elementFromPoint(${x}, ${y});
    return { tag: el ? el.tagName : null, text: el ? (el.textContent || '').trim().slice(0, 24) : null,
             isTarget: el === want,
             insideTarget: !!(want && el && want.contains(el)) };
  })()`);
  note(`aim: ${label} [${handle}]`,
    `dpr=${geom.dpr} rect=(${geom.left},${geom.top},${geom.w}x${geom.h}) → integer client (${x},${y}) · `
    + `target text="${geom.text}" aria=${JSON.stringify(geom.aria)} disabled=${geom.disabled} · `
    + `elementFromPoint = <${hit.tag}> "${hit.text}" · isTarget=${hit.isTarget} `
    + `insideTarget=${hit.insideTarget}`);
  if (!hit.insideTarget) {
    throw new Error(`AIM REFUSED: integer (${x},${y}) for "${label}" [${handle}] lands on <${hit.tag}> `
      + `"${hit.text}", which is NOT inside the handle's button. Clicking it would measure `
      + 'something else.');
  }
  await mouse(c, 'mousePressed', x, y);
  await sleep(40);
  await mouse(c, 'mouseReleased', x, y);
  await sleep(450);
  return { x, y };
}

const focusNow = (c, handle) => c.json(String.raw`(() => {
  const a = document.activeElement;
  return { tag: a ? a.tagName : null,
           text: a ? (a.textContent || '').trim().slice(0, 32) : null,
           aria: a ? a.getAttribute('aria-label') : null,
           isTheButton: a === window.__d27e.el(${JSON.stringify(handle)}) };
})()`);

/**
 * The scene library, as the RAW STRING `scenesJson()` returns.
 *
 * ⚠ COMPARED AS A STRING, never round-tripped through CDP's `returnByValue`.
 * The layer schema carries `oneOf` arms and `returnByValue` flattens those
 * inconsistently, so re-stringifying a parsed copy is a comparison of the
 * flattening rather than of the document.
 */
async function snap(c) {
  const scenes = await c.evalExpr('window.__dbg.aeon.scenesJson()');
  const canUndo = await c.evalExpr('window.__dbg.aeon.canUndo()');
  const list = await c.json('window.__dbg.aeon.scenes()');
  const mine = list.find((s) => s.id === SCENE_ID) ?? null;
  return { scenes, canUndo, list, layers: mine ? mine.layers : -1 };
}

/**
 * The PRESET library, as the RAW STRING `presetsJson()` returns, plus the two
 * counts the band/channel rows compare.
 *
 * ⚠ RAW STRING for the same reason as `snap()`: a band's ON arm is a schema
 * `oneOf`, and CDP's `returnByValue` flattens those inconsistently, so a
 * parse-and-re-stringify would compare the flattening rather than the document.
 */
async function psnap(c, presetId) {
  const presets = await c.evalExpr('window.__dbg.aeon.presetsJson()');
  const canUndo = await c.evalExpr('window.__dbg.aeon.canUndo()');
  const list = JSON.parse(presets);
  const mine = list.find((p) => p.id === presetId) ?? null;
  return {
    presets, canUndo, ids: list.map((p) => p.id),
    bands: mine ? mine.bands.length : -1,
    cycles: mine && Array.isArray(mine.cycles) ? mine.cycles.length : -1,
  };
}

/** React-controlled <select>: the native setter plus the change React listens for. */
const SET_SELECT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
})()`;

/** The effects sub-tab bar writes `data-effects-sub-tab` — a real hook, not a guess. */
const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/**
 * Open a CollapsibleSection by its header text, and REPORT WHAT HAPPENED
 * rather than returning a bare boolean — when this misses, the reason is
 * always "which headers were actually on screen", so it says so.
 *
 * `.pop()` takes the LAST matching header, which is why every caller's regex
 * has to exclude its siblings: this panel renders three sections whose titles
 * all begin `Preset — <id>`.
 */
const OPEN_SECTION = (re, proofSelector) => String.raw`
(() => {
  const open = () => !!(${proofSelector});
  if (open()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${re}.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) {
    const seen = [...document.querySelectorAll('div')]
      .filter((d) => d.style && d.style.cursor === 'pointer')
      .map((d) => (d.textContent || '').trim().slice(0, 56));
    return 'no-header; headers on screen: ' + JSON.stringify(seen);
  }
  hdr.click();
  return 'clicked';
})()`;

/** React-controlled input: the native setter plus the events React listens for. */
const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

const CLICK_BY_TEXT = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

/**
 * THE IN-PAGE HANDLE TABLE, plus the node-identity latch [esp-e] needs.
 *
 * `removeLayer<i>` is found by `aria-label`, which is authored text in the
 * component (`Remove layer ${i}`) — NOT by position and NOT by textContent:
 * `IconButton` renders its word as the child and the label as `aria-label`, so
 * a text match on this panel reads "Remove Remove layer 0" and a `/^Remove$/`
 * would silently find nothing. That exact mistake produced a control row with
 * no control in it once already in this repo.
 */
const INSTALL_HANDLES = String.raw`
(() => {
  const byAria = (a) => document.querySelector('button[aria-label="' + a + '"]');
  const byText = (t) => [...document.querySelectorAll('button')]
    .find((b) => (b.textContent || '').trim() === t) || null;
  window.__d27e = {
    el(h) {
      const m = /^remove(Layer|Band|Channel)(\d+)$/.exec(h);
      if (m) {
        const word = { Layer: 'Remove layer ', Band: 'Remove raster band ',
                       Channel: 'Remove cycle channel ' }[m[1]];
        return byAria(word + m[2]);
      }
      if (h === 'addLayer') return byAria('Add layer');
      // The two Add controls on the band-preset panel are Chips, not
      // IconButtons, so they carry no aria-label and ARE matched by text --
      // the opposite of the Remove buttons above, and the reason each is
      // resolved by the mechanism its own component actually uses.
      if (h === 'addBand') return byText('Add raster band');
      if (h === 'addChannel') return byText('Add channel');
      return null;
    },
    removeButtons: (kind) => [...document.querySelectorAll('button[aria-label]')]
      .filter((b) => new RegExp('^' + kind + ' \\d+$').test(b.getAttribute('aria-label')))
      .map((b) => ({ aria: b.getAttribute('aria-label'), disabled: !!b.disabled })),
    layerButtons: () => [...document.querySelectorAll('button[aria-label]')]
      .filter((b) => /^Remove layer \d+$/.test(b.getAttribute('aria-label')))
      .map((b) => ({ aria: b.getAttribute('aria-label'), disabled: !!b.disabled })),
    // The cycles picker, found by its OPTION VALUES rather than by position or
    // by a title string: the provider owns 'absent' / 'off' / 'authored', and
    // an option set is the one thing about this control that cannot drift
    // without the fixture below becoming wrong anyway.
    cyclesSelect: () => [...document.querySelectorAll('select')].find((sel) => {
      const vals = [...sel.options].map((o) => o.value).join(',');
      return vals === 'absent,off,authored';
    }) || null,
    // THE NODE-IDENTITY LATCH. latch(h) remembers the actual DOM element a
    // handle resolves to right now; isSameNode(h) says whether the handle
    // still resolves to that same element -- a triple-equals on the node, not
    // a re-query by selector, which is what makes it evidence that the button
    // SURVIVED its own click rather than being torn down and rebuilt.
    _latched: null,
    latch(h) { this._latched = this.el(h); return !!this._latched; },
    isSameNode(h) { return this._latched !== null && this.el(h) === this._latched; },
    latchedStillInDom() { return !!(this._latched && document.contains(this._latched)); },
  };
  return window.__d27e.layerButtons();
})()`;

async function main() {
  assertFreshBuild(RUN);
  console.log(`\n=== LAYER BOUNDS, read from ${SCHEMA_SRC.replace(ROOT + '/', '')} ===`);
  console.log(`  min=${LAYERS.min} max=${LAYERS.max}`);

  for (let i = 0; i < 60 && !(await portFree()); i++) {
    if (i === 0) note('port', `${PORT} still serving — waiting for a previous run to exit`);
    await sleep(1000);
  }
  if (!(await portFree())) throw new Error(`port ${PORT} still serves a CDP target after 60s`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  let c;
  let created = false;
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
    if (!(await waitDbg())) throw new Error('window.__dbg absent — needs a VITE_AURORA_DEBUG=1 build');
    // The disclosure state of every CollapsibleSection is persisted per author,
    // so a previous session's collapsed Layers section would hide every handle.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    if (!(await waitDbg())) throw new Error('window.__dbg absent after reload');

    console.log('\n=== BOOT: the real aeon project, the Effects facet, a scene of this run\'s own ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => note('aeon open threw', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('b1', 'the aeon project is open, with sections', !!(st && st.open && st.sections > 0),
      JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');

    await sleep(1500);
    const facet = await c.evalExpr(CLICK_BY_TEXT('/^Effects$/'));
    await sleep(1500);
    check('b2', 'the Effects facet mounts', facet === true, `facet pill click → ${facet}`);

    // A SCENE THIS RUN OWNS. Selecting an existing one would put this file's
    // clicks on a document somebody else authored, and every removal below
    // would be an edit to real content rather than to a fixture.
    const before = await snap(c);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await sleep(400);
    await c.evalExpr(CLICK_BY_TEXT('/^New$/'));
    await sleep(1200);
    created = true;
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);
    await sleep(800);
    await c.evalExpr(INSTALL_HANDLES);

    // GROW IT TO FOUR LAYERS, AND FOUR IS NOT A ROUND NUMBER — it is what
    // [esp-c] needs. At three, the second consecutive removal lands ON the
    // schema floor, which DISABLES the Remove button, and a disabled button
    // never takes focus: [esp-c]'s "focus is not the button" half then reads
    // green for a reason that has nothing to do with d-27. That is not a
    // hypothetical — it was measured. Under plant P9 (the blur removed at this
    // site) a three-layer fixture left [esp-c] GREEN while [esp-a] and [esp-b]
    // went red, which is a row satisfied by an accident. From four, the second
    // removal leaves two, the button stays ENABLED, and [esp-c] asserts that
    // too so the accident cannot come back silently.
    //
    // `Add layer` is an IconButton, so it is found by aria-label; a `/^Add$/`
    // text match reads "Add Add layer" and finds nothing.
    for (let i = 0; i < 8; i++) {
      const s = await snap(c);
      if (s.layers >= 4) break;
      await clickHandle(c, 'addLayer', `Add layer (fixture, at ${s.layers})`);
      await c.evalExpr(INSTALL_HANDLES);
    }
    await c.evalExpr(INSTALL_HANDLES);
    const fixture = await snap(c);
    const buttons0 = await c.evalExpr('window.__d27e.layerButtons()');
    await shot(c, 'fixture');
    note('[esp] fixture', `scene "${SCENE_ID}" has ${fixture.layers} layers · remove buttons = `
      + JSON.stringify(buttons0));
    check('esp-0', `ANTI-VACUOUS fixture: this run's own scene holds >= 4 layers — two clear of the `
      + `schema floor of ${LAYERS.min}, so the Remove buttons are ENABLED and BOTH consecutive clicks `
      + 'land above the floor rather than on it',
      fixture.layers >= 4 && buttons0.length === fixture.layers
      && buttons0.every((b) => b.disabled === false),
      `layers=${fixture.layers} (was ${before.list.length} scenes before this run created one), `
      + `remove buttons=${JSON.stringify(buttons0)}, schema floor min=${LAYERS.min} max=${LAYERS.max} `
      + `(read from ${SCHEMA_SRC.replace(ROOT + '/', '')})`);
    if (fixture.layers < 4) throw new Error('could not build a 4-layer fixture — every row below would be vacuous');

    // ── [esp-a] ───────────────────────────────────────────────────────────
    await c.evalExpr("window.__d27e.latch('removeLayer0')");
    const espPre = await snap(c);
    await clickHandle(c, 'removeLayer0', 'Remove layer 0');
    const espFocusA = await focusNow(c, 'removeLayer0');
    const espA = await snap(c);
    check('esp-a', 'effects/EffectsScenePanel.tsx Remove layer: after a REAL CLICK the button does not '
      + 'keep keyboard focus — AND the same click still removed a layer',
      espFocusA.isTheButton === false && espA.layers === espPre.layers - 1,
      `activeElement = <${espFocusA.tag}> "${espFocusA.text}" aria=${JSON.stringify(espFocusA.aria)} `
      + `(isTheRemoveButton=${espFocusA.isTheButton}); layers ${espPre.layers} → ${espA.layers}. `
      + 'The "still removed" half is IN THE CONDITION: a disabled or unwired button would satisfy a '
      + 'focus-only assertion perfectly.');

    // ── [esp-e] — the RETARGET, by DOM node identity ──────────────────────
    const sameNode = await c.evalExpr('window.__d27e.isSameNode("removeLayer0")');
    const stillInDom = await c.evalExpr('window.__d27e.latchedStillInDom()');
    check('esp-e', 'the `key={i}` RETARGET: the button that removed layer 0 is the SAME DOM NODE '
      + 'afterwards — it did not unmount with the layer it deleted, it stayed and now addresses the '
      + 'layer that slid down into slot 0',
      sameNode === true && stillInDom === true && espA.layers === espPre.layers - 1,
      `the element latched before the click still resolves from "Remove layer 0" (=== identity: `
      + `${sameNode}) and is still in the document (${stillInDom}), while the scene went `
      + `${espPre.layers} → ${espA.layers} layers. NODE IDENTITY rather than layer CONTENT on purpose: `
      + '`Add layer` produces identical layers, so a content comparison could not tell "removed the '
      + 'neighbour" from "removed the same one again" and would look like it had measured something. '
      + 'This is the property that made the survey count these nine and exclude six others.');

    // ── [esp-b] — vacuity guard + positive control ────────────────────────
    await ctrlZ(c); await sleep(600);
    const espRestored = await snap(c);
    const espFocusPre = await focusNow(c, 'removeLayer0');
    note('[esp] before the keys', `Ctrl+Z over the SAME key channel restored layers `
      + `${espA.layers} → ${espRestored.layers} · activeElement = ${JSON.stringify(espFocusPre)}`);
    await space(c); await sleep(500);
    const espSpace = await snap(c);
    await enter(c); await sleep(500);
    const espEnter = await snap(c);
    check('esp-b', 'effects/EffectsScenePanel.tsx Remove layer: a bare SPACE straight after the click '
      + 'reaches no writer — the scene library is byte-identical (Enter sent separately too)',
      espRestored.layers >= 4 && espRestored.scenes === espPre.scenes
      && espSpace.scenes === espRestored.scenes && espEnter.scenes === espRestored.scenes,
      `layers after Space = ${espSpace.layers}, after Enter = ${espEnter.layers} (unchanged from `
      + `${espRestored.layers}); scenesJson compared as a RAW STRING. VACUITY GUARD: the scene held `
      + `${espRestored.layers} layers when the keys were sent — above the floor of ${LAYERS.min}, so the `
      + 'button was ENABLED and a Space that reached it had a layer to destroy. A scene sitting at the '
      + 'floor would have a disabled button and make this row pass for the wrong reason. POSITIVE '
      + 'CONTROL: the Ctrl+Z immediately before travelled the same Input.dispatchKeyEvent channel and '
      + 'put the layer back.');

    // ── [esp-c] — the anti-cheat row ─────────────────────────────────────
    const espPreC = await snap(c);
    await clickHandle(c, 'removeLayer0', 'Remove layer 0 (second real click, SAME pixel)');
    const espFocusC = await focusNow(c, 'removeLayer0');
    const espC = await snap(c);
    const buttonsC = await c.evalExpr('window.__d27e.layerButtons()');
    const slot0EnabledAfter = buttonsC.length > 0 && buttonsC[0].disabled === false;
    check('esp-c', 'effects/EffectsScenePanel.tsx Remove layer: a SECOND real click still removes a '
      + 'layer and drops focus again — WITH THE BUTTON STILL ENABLED, so the focus half cannot be '
      + 'satisfied by the schema floor greying it out',
      espC.layers === espPreC.layers - 1 && espFocusC.isTheButton === false && slot0EnabledAfter,
      `layers ${espPreC.layers} → ${espC.layers}; slot 0's Remove button after the click is `
      + `disabled=${!slot0EnabledAfter} (buttons now ${JSON.stringify(buttonsC)}); activeElement after `
      + `= <${espFocusC.tag}> (isTheButton=${espFocusC.isTheButton}). ⚠ THE ENABLED CLAUSE IS NOT `
      + 'DECORATION: with a three-layer fixture the second removal lands ON the floor, the button '
      + 'greys out, and a disabled button never takes focus — under plant P9 (the blur removed here) '
      + 'that made this row GREEN while [esp-a] and [esp-b] went red. Measured, then fixed. Without '
      + 'this row at all, blurring by simply removing the handler would pass [esp-a] and [esp-b].');

    note('[esp-d] NOT MEASURABLE, and that is a finding',
      'this site has NO reachable no-op press. `removeLayerCommand` has three null paths and '
      + '`editSceneCommand` a fourth, and every one is unreachable from an ENABLED button: the scene '
      + 'exists, the index is in range because the card renders it, the splice always changes the '
      + 'document, and the schema floor is exactly the predicate that DISABLES the button — a disabled '
      + 'button fires no onClick. A [k7] row here would be green by construction. The unconditional '
      + 'half is carried by the shared helper (it blurs BEFORE act()) and measured by plant P8 in the '
      + 'review packet, at the one site that HAS a reachable no-op press.');

    // ═══════════════════════════════════════════════════════════════════
    // [bnd] effects/BandPresetPanel.tsx — Remove raster band
    // [cyc] effects/BandPresetPanel.tsx — Remove cycle channel
    //
    // The last two of the survey's nine. They live in the colour sub-tab, on a
    // preset this run creates, and they get the same rows as [esp] — with the
    // same "still ENABLED after the click" clause on -c, because the raster
    // band button carries a disabled predicate of its own (lastBandRefusal,
    // the schema's one-band floor) and would otherwise be able to pass its
    // focus half by greying out.
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n=== [bnd] / [cyc] BandPresetPanel (effects/BandPresetPanel.tsx) ===');
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1200);
    const presetsBefore = await psnap(c, PRESET_ID);
    const openList = await c.evalExpr(OPEN_SECTION(
      String.raw`/^Raster band presets\b/`,
      `document.querySelector('input[placeholder="new_preset_id"]')`));
    await sleep(900);
    note('preset list section', `OPEN_SECTION → ${openList}`);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_preset_id"]')`, PRESET_ID));
    await sleep(400);
    await c.evalExpr(CLICK_BY_TEXT('/^New$/'));
    await sleep(1200);
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(PRESET_ID)})`);
    await sleep(800);
    // ⚠ THE REGEX EXCLUDES ITS OWN SIBLINGS. Three sections on this panel are
    // titled "Preset — <id>…" and OPEN_SECTION takes the LAST match, so a bare
    // prefix would open "cycles, variants" and the band rows would find no
    // buttons at all.
    const bandsOpen = await c.evalExpr(OPEN_SECTION(
      String.raw`/^Preset — ` + PRESET_ID + String.raw`(?![-a-z0-9_ ])/`,
      `document.querySelector('button[aria-label^="Remove raster band"]')`));
    await sleep(900);
    await c.evalExpr(INSTALL_HANDLES);
    note('bands section', `OPEN_SECTION → ${bandsOpen}`);
    for (let i = 0; i < 8; i++) {
      const st2 = await psnap(c, PRESET_ID);
      if (st2.bands >= 4) break;
      await clickHandle(c, 'addBand', `Add raster band (fixture, at ${st2.bands})`);
      await c.evalExpr(INSTALL_HANDLES);
    }
    await c.evalExpr(INSTALL_HANDLES);
    const bndFixture = await psnap(c, PRESET_ID);
    const bndButtons0 = await c.evalExpr("window.__d27e.removeButtons('Remove raster band')");
    await shot(c, 'bands-fixture');
    check('bnd-0', "ANTI-VACUOUS fixture: this run's own preset holds >= 4 raster bands — clear of the "
      + 'schema floor of one band, so the Remove buttons are ENABLED and BOTH consecutive clicks land '
      + 'above the floor',
      bndFixture.bands >= 4 && bndButtons0.length === bndFixture.bands
      && bndButtons0.every((b) => b.disabled === false),
      `preset "${PRESET_ID}" bands=${bndFixture.bands}, remove buttons=${JSON.stringify(bndButtons0)}. `
      + "The floor is lastBandRefusal's `bands.length <= 1`, which is the SAME predicate "
      + 'removeBandCommand returns null on — one derivation, so the greyed button and the sentence '
      + 'under it cannot disagree.');
    if (bndFixture.bands < 4) throw new Error('could not build a 4-band fixture — the [bnd] rows would be vacuous');

    await c.evalExpr("window.__d27e.latch('removeBand0')");
    const bndPre = await psnap(c, PRESET_ID);
    await clickHandle(c, 'removeBand0', 'Remove raster band 0');
    const bndFocusA = await focusNow(c, 'removeBand0');
    const bndA = await psnap(c, PRESET_ID);
    check('bnd-a', 'effects/BandPresetPanel.tsx Remove raster band: after a REAL CLICK the button does '
      + 'not keep keyboard focus — AND the same click still removed a band',
      bndFocusA.isTheButton === false && bndA.bands === bndPre.bands - 1,
      `activeElement = <${bndFocusA.tag}> "${bndFocusA.text}" aria=${JSON.stringify(bndFocusA.aria)} `
      + `(isTheRemoveButton=${bndFocusA.isTheButton}); bands ${bndPre.bands} → ${bndA.bands}.`);

    const bndSame = await c.evalExpr('window.__d27e.isSameNode("removeBand0")');
    const bndInDom = await c.evalExpr('window.__d27e.latchedStillInDom()');
    check('bnd-e', 'the key={i} RETARGET at Remove raster band: the button that removed band 0 is the '
      + 'SAME DOM NODE afterwards — it stayed and now addresses the band that slid into slot 0',
      bndSame === true && bndInDom === true && bndA.bands === bndPre.bands - 1,
      `=== identity across the click: ${bndSame}; still in the document: ${bndInDom}; bands `
      + `${bndPre.bands} → ${bndA.bands}. Node identity rather than band CONTENT, for the same reason `
      + 'as [esp-e]: Add raster band produces identical bands, so a content comparison could not tell '
      + '"removed the neighbour" from "removed the same one again".');

    await ctrlZ(c); await sleep(600);
    const bndRestored = await psnap(c, PRESET_ID);
    note('[bnd] before the keys', `Ctrl+Z over the SAME key channel restored bands `
      + `${bndA.bands} → ${bndRestored.bands}`);
    await space(c); await sleep(500);
    const bndSpace = await psnap(c, PRESET_ID);
    await enter(c); await sleep(500);
    const bndEnter = await psnap(c, PRESET_ID);
    check('bnd-b', 'effects/BandPresetPanel.tsx Remove raster band: a bare SPACE straight after the '
      + 'click reaches no writer — the preset library is byte-identical (Enter sent separately too)',
      bndRestored.bands >= 4 && bndRestored.presets === bndPre.presets
      && bndSpace.presets === bndRestored.presets && bndEnter.presets === bndRestored.presets,
      `bands after Space = ${bndSpace.bands}, after Enter = ${bndEnter.bands} (unchanged from `
      + `${bndRestored.bands}); presetsJson compared as a RAW STRING. VACUITY GUARD: the preset held `
      + `${bndRestored.bands} bands when the keys were sent — clear of the floor, so the button was `
      + 'ENABLED and a Space that reached it had a band to destroy. POSITIVE CONTROL: the Ctrl+Z '
      + 'immediately before travelled the same Input.dispatchKeyEvent channel and put the band back.');

    const bndPreC = await psnap(c, PRESET_ID);
    await clickHandle(c, 'removeBand0', 'Remove raster band 0 (second real click, SAME pixel)');
    const bndFocusC = await focusNow(c, 'removeBand0');
    const bndC = await psnap(c, PRESET_ID);
    const bndButtonsC = await c.evalExpr("window.__d27e.removeButtons('Remove raster band')");
    const bndSlot0Enabled = bndButtonsC.length > 0 && bndButtonsC[0].disabled === false;
    check('bnd-c', 'effects/BandPresetPanel.tsx Remove raster band: a SECOND real click still removes a '
      + 'band and drops focus again — WITH THE BUTTON STILL ENABLED, so the focus half cannot be '
      + 'satisfied by the one-band floor greying it out',
      bndC.bands === bndPreC.bands - 1 && bndFocusC.isTheButton === false && bndSlot0Enabled,
      `bands ${bndPreC.bands} → ${bndC.bands}; slot 0's Remove button after the click is `
      + `disabled=${!bndSlot0Enabled} (buttons now ${JSON.stringify(bndButtonsC)}); activeElement after `
      + `= <${bndFocusC.tag}> (isTheButton=${bndFocusC.isTheButton}). The enabled clause is the same one `
      + '[esp-c] needed after a three-layer fixture let the floor answer for d-27.');
    note('[bnd-d] NOT MEASURABLE, and that is a finding',
      'no reachable no-op press. removeBandCommand returns null when the preset is missing, the index '
      + 'is out of range, or bands.length <= 1 — and that last one is EXACTLY the predicate '
      + 'lastBandRefusal uses to DISABLE the button, so an author cannot press it there. A [k7] row '
      + 'would be green by construction; plant P8 measures the unconditional half at the one site '
      + 'where a no-op press IS reachable.');
    for (let i = 0; i < 4 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      const st3 = await psnap(c, PRESET_ID);
      if (st3.bands >= 4) break;
      await ctrlZ(c); await sleep(300);
    }

    // ── [cyc] the cycle-channel card ─────────────────────────────────────
    //
    // A fresh preset carries NO cycles key at all (newPreset writes only
    // schema/id/bands), so cyclesState is 'absent' and neither the Add chip nor
    // any card renders. The picker has to be driven to 'authored' first, which
    // is what seeds the array — done through the select's own change event
    // rather than by poking the store, so the fixture is built by the same path
    // an author would use.
    const cycOpen = await c.evalExpr(OPEN_SECTION(
      String.raw`/^Preset — ` + PRESET_ID + String.raw` — cycles/`,
      'window.__d27e.cyclesSelect()'));
    await sleep(900);
    await c.evalExpr(INSTALL_HANDLES);
    const cycSel = await c.evalExpr(SET_SELECT('window.__d27e.cyclesSelect()', 'authored'));
    await sleep(900);
    await c.evalExpr(INSTALL_HANDLES);
    note('cycles section', `OPEN_SECTION → ${cycOpen} · cycles picker set to → ${JSON.stringify(cycSel)}`);
    for (let i = 0; i < 8; i++) {
      const st4 = await psnap(c, PRESET_ID);
      if (st4.cycles >= 3) break;
      await clickHandle(c, 'addChannel', `Add channel (fixture, at ${st4.cycles})`);
      await c.evalExpr(INSTALL_HANDLES);
    }
    await c.evalExpr(INSTALL_HANDLES);
    const cycFixture = await psnap(c, PRESET_ID);
    const cycButtons0 = await c.evalExpr("window.__d27e.removeButtons('Remove cycle channel')");
    await shot(c, 'cycles-fixture');
    check('cyc-0', "ANTI-VACUOUS fixture: the preset's cycles list is AUTHORED and holds >= 3 channels, "
      + 'so both consecutive clicks have a channel to remove',
      cycFixture.cycles >= 3 && cycButtons0.length === cycFixture.cycles
      && cycButtons0.every((b) => b.disabled === false),
      `cycles=${cycFixture.cycles}, remove buttons=${JSON.stringify(cycButtons0)}. This control has NO `
      + 'disabled predicate at all — no floor, no refusal, no confirmation — which is what makes it the '
      + 'purest instance of the d-27 shape on this panel.');
    if (cycFixture.cycles < 3) throw new Error('could not build a cycles fixture — the [cyc] rows would be vacuous');

    await c.evalExpr("window.__d27e.latch('removeChannel0')");
    const cycPre = await psnap(c, PRESET_ID);
    await clickHandle(c, 'removeChannel0', 'Remove cycle channel 0');
    const cycFocusA = await focusNow(c, 'removeChannel0');
    const cycA = await psnap(c, PRESET_ID);
    check('cyc-a', 'effects/BandPresetPanel.tsx Remove cycle channel: after a REAL CLICK the button does '
      + 'not keep keyboard focus — AND the same click still removed a channel',
      cycFocusA.isTheButton === false && cycA.cycles === cycPre.cycles - 1,
      `activeElement = <${cycFocusA.tag}> "${cycFocusA.text}" aria=${JSON.stringify(cycFocusA.aria)} `
      + `(isTheRemoveButton=${cycFocusA.isTheButton}); cycles ${cycPre.cycles} → ${cycA.cycles}.`);

    const cycSame = await c.evalExpr('window.__d27e.isSameNode("removeChannel0")');
    const cycInDom = await c.evalExpr('window.__d27e.latchedStillInDom()');
    check('cyc-e', 'the key={i} RETARGET at Remove cycle channel: the button that removed channel 0 is '
      + 'the SAME DOM NODE afterwards — it stayed and now addresses the channel that slid into slot 0',
      cycSame === true && cycInDom === true && cycA.cycles === cycPre.cycles - 1,
      `=== identity across the click: ${cycSame}; still in the document: ${cycInDom}; cycles `
      + `${cycPre.cycles} → ${cycA.cycles}. Worst case of the family: NOTHING disables this button at `
      + 'any count — the schema accepts an empty cycles list by design — so before d-27 a held Space '
      + 'walked the whole list away one keystroke at a time.');

    await ctrlZ(c); await sleep(600);
    const cycRestored = await psnap(c, PRESET_ID);
    note('[cyc] before the keys', `Ctrl+Z over the SAME key channel restored cycles `
      + `${cycA.cycles} → ${cycRestored.cycles}`);
    await space(c); await sleep(500);
    const cycSpace = await psnap(c, PRESET_ID);
    await enter(c); await sleep(500);
    const cycEnter = await psnap(c, PRESET_ID);
    check('cyc-b', 'effects/BandPresetPanel.tsx Remove cycle channel: a bare SPACE straight after the '
      + 'click reaches no writer — the preset library is byte-identical (Enter sent separately too)',
      cycRestored.cycles >= 3 && cycRestored.presets === cycPre.presets
      && cycSpace.presets === cycRestored.presets && cycEnter.presets === cycRestored.presets,
      `cycles after Space = ${cycSpace.cycles}, after Enter = ${cycEnter.cycles} (unchanged from `
      + `${cycRestored.cycles}). VACUITY GUARD: the list held ${cycRestored.cycles} channels when the `
      + 'keys were sent, so a re-fire had one to destroy. POSITIVE CONTROL: the Ctrl+Z immediately '
      + 'before travelled the same Input.dispatchKeyEvent channel and put the channel back.');

    const cycPreC = await psnap(c, PRESET_ID);
    await clickHandle(c, 'removeChannel0', 'Remove cycle channel 0 (second real click, SAME pixel)');
    const cycFocusC = await focusNow(c, 'removeChannel0');
    const cycC = await psnap(c, PRESET_ID);
    const cycButtonsC = await c.evalExpr("window.__d27e.removeButtons('Remove cycle channel')");
    check('cyc-c', 'effects/BandPresetPanel.tsx Remove cycle channel: a SECOND real click still removes '
      + 'a channel and drops focus again',
      cycC.cycles === cycPreC.cycles - 1 && cycFocusC.isTheButton === false,
      `cycles ${cycPreC.cycles} → ${cycC.cycles}; buttons now ${JSON.stringify(cycButtonsC)}; `
      + `activeElement after = <${cycFocusC.tag}> (isTheButton=${cycFocusC.isTheButton}). Without this `
      + 'row, blurring by simply removing the handler would pass [cyc-a] and [cyc-b].');
    note('[cyc-d] NOT MEASURABLE, and that is a finding',
      'removeCycleChannelCommand no-ops only when cycles is not an array or the index is out of range '
      + '— and a card cannot render in either case, so no author can perform that press. As everywhere '
      + 'else in this family, the unconditional half comes from the shared helper and is measured by '
      + 'plant P8.');

    // ── put the preset library back ──────────────────────────────────────
    for (let i = 0; i < 25 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      await ctrlZ(c); await sleep(200);
      const st5 = await psnap(c, PRESET_ID);
      if (st5.ids.length === presetsBefore.ids.length) break;
    }
    const presetsEnd = await psnap(c, PRESET_ID);
    check('z2', 'the preset library is back where this run found it — the probe preset was created IN '
      + "MEMORY by the panel's own New button and taken back through the app's history",
      presetsEnd.ids.length === presetsBefore.ids.length,
      `presets before this run = ${JSON.stringify(presetsBefore.ids)}, after the undos = `
      + `${JSON.stringify(presetsEnd.ids)}`);

    // ── put the scene back the way this run found it ──────────────────────
    for (let i = 0; i < 12 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      await ctrlZ(c); await sleep(250);
      const s = await snap(c);
      if (s.list.length === before.list.length) break;
    }
    const end = await snap(c);
    check('z1', 'nothing was written to disk, and the scene library is back where this run found it — '
      + 'no save was issued and the app has no autosave (shell/close-guard.ts)',
      end.list.length === before.list.length,
      `scenes before this run = ${JSON.stringify(before.list.map((s) => s.id))}, after the undos = `
      + `${JSON.stringify(end.list.map((s) => s.id))}. The probe scene was created IN MEMORY by the `
      + `panel's own New button and taken back through the app's history.`);
  } finally {
    if (created) note('cleanup', `the probe scene "${SCENE_ID}" was created in memory only; see [z1]`);
    try { c?.close(); } catch { /* already gone */ }
    const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
    killGroup('SIGTERM');
    await sleep(500);
    killGroup('SIGKILL');
    for (let i = 0; i < 30 && !(await portFree()); i++) await sleep(500);
    if (!(await portFree())) console.log(`WARN       port ${PORT} still held after teardown`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} ════`);
  if (fails.length) {
    console.log('FAILING ROWS:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(2); });
