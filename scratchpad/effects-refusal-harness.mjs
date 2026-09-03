#!/usr/bin/env node
// DOES THE PANEL REALLY REFUSE WHAT THE BUILD WOULD? (EFFECTS-W1 defects 5 and 7.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// `authoring-refusals.test.ts` proves the derivations refuse and that the panel
// source passes `refuse` to the right boxes. It cannot prove any of this:
//
//        AN AUTHOR CLICKS THE `Top` BOX, TYPES 40112, AND THE DOCUMENT DOES
//        NOT CHANGE — WHILE A SENTENCE NAMING THE PRESET, THE BAND AND THE
//        FIELD IS PAINTED UNDER THAT BOX.
//
// and it CANNOT, on principle: the defect being fixed is precisely that
// `min`/`max` on an `<input type="number">` look like a guard in source and
// stop no typed value in a browser. A source-level assertion about validation
// is the shape of the bug. So every row below types with REAL KEY EVENTS
// through CDP and reads the MODEL back, never the widget.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE KEYSTROKES NEVER LANDED, so "the document did not change" is true
//     because nothing happened. Row [3a] requires the BOX to show `40112` —
//     the keys reached the input — in the same read as the model check. Row
//     [5a] then types a LEGAL value through the same path and requires the
//     model to MOVE, which is the anti-vacuous floor for the whole file.
//
//   • THE SENTENCE IS IN THE DOM AND NOT ON SCREEN. Hidden text is still in
//     `textContent`, and this repo has shipped three rows that went green over
//     a permanently-collapsed disclosure. Every refusal row asserts
//     `checkVisibility()`, a non-empty `getClientRects()` and a strict
//     `elementFromPoint` at the leaf's own centre, plus document order relative
//     to the control it is about.
//
//   • THE BOX WAS ALREADY AT THE VALUE. Row [2c] reads the band out of the
//     model BEFORE anything is typed and prints it.
//
//   • A DIFFERENT CONTROL WAS DRIVEN. The `Top` box is found by the SCHEMA'S
//     OWN description (its `title`), which is the same string the panel is
//     forbidden to retype — not "the third number input in the column", which
//     would silently move.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER.
//
// CLEANUP IS BY PID — `spawnGuarded` + `killTree`, awaited.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:effects-refusal
//
//   ⚠ FRESH COPY PER RUN. This harness AUTHORS into a preset document (it types
//   legal values in section 5 to prove the anti-vacuous floor) and never saves,
//   so nothing reaches disk — but it also opens the project, and an aeon copy
//   another harness has saved into is not the fixture this one describes. The
//   floor rows print what they read, so a contaminated copy is visible rather
//   than silent.
//
//   PLANT=no-refuse  … read the refusal back off the WIDGET's `value` instead
//                      of the model. Reported below with the honest count of
//                      how many rows still pass, which is the size of the
//                      hazard rather than an assertion about it.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { readAeonShippedPreset, reQuote } from './lib/aeon-shipped-preset.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9454);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 92);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-effects-refusal`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';
/** aeon's own shipped preset — a document this repo did not author, and the one
 *  this run types into (in the MODEL only; no save is issued and the band it
 *  edits is a real one, not one Aurora invented for itself).
 *
 *  ⚠ READ BY PATH, AT IMPORT, AND NOT LOOKED UP THROUGH THE APP. This id
 *  belongs to aeon and aeon has BOOKED a rename of it (their
 *  docs/DEFERRED_WORK.md, "PRESET-ID NAMESPACE COLLISION", 2026-09-03). This
 *  file used to carry the string `authored_probe` twice — once here and once
 *  INSIDE ROW [3c]'S REGEX — and would have discovered a rename as "the preset
 *  is absent" at row [1b], or worse as a refusal sentence that did not match a
 *  pattern nobody would think to blame. Now the run refuses BEFORE the app
 *  launches, naming the absolute path and the booking, and [3c]'s pattern is
 *  built from the id that was read. See scratchpad/lib/aeon-shipped-preset.mjs. */
const SHIPPED = process.env.PRESET_ID ? null : readAeonShippedPreset(AEONDIR);
const PRESET_ID = process.env.PRESET_ID ?? SHIPPED.id;
if (SHIPPED) console.log(`    SHIPPED     : ${SHIPPED.path} (${SHIPPED.text.length}B, id ${SHIPPED.id}, ${SHIPPED.bands} band(s))`);
else console.log(`    SHIPPED     : OVERRIDDEN by PRESET_ID=${PRESET_ID} — the by-path identity check is SKIPPED`);

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

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

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
      .map((d) => (d.textContent || '').trim().slice(0, 48));
    return 'no-header: ' + JSON.stringify(seen);
  }
  hdr.click();
  return 'clicked';
})()`;

/**
 * A band spinner, found by the SCHEMA'S OWN description — the string the panel
 * puts on `title` and is forbidden to retype, so this selector is pinned to the
 * contract rather than to a position in the column.
 *
 * ⚠ NOT "the Nth number input": the column also holds the scene's V factor, V
 * center, V offset and every layer's screen line, and which one is Nth depends
 * on what is expanded. Three wrong answers that all look like a working
 * selector until the day they are not.
 */
const EDGE_BOX = (word) => String.raw`
(() => {
  const want = ${JSON.stringify(word)};
  const boxes = [...document.querySelectorAll('input[type="number"]')]
    .filter((i) => (i.title || '').startsWith(want));
  return boxes[0] || null;
})()`;

/** The leaf element carrying `text`, painted — never an ancestor. */
const PAINTED_LEAF = (needle, afterSelector) => String.raw`
(() => {
  const anchor = ${afterSelector};
  const leaves = [...document.querySelectorAll('div')]
    .filter((d) => (d.innerText || '').includes(${JSON.stringify(needle)})
                && ![...d.children].some((k) => (k.innerText || '').includes(${JSON.stringify(needle)})));
  const leaf = leaves[0] || null;
  if (!leaf) return { leaf: false, candidates: leaves.length };
  leaf.scrollIntoView({ block: 'center' });
  const b = leaf.getBoundingClientRect();
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  return {
    leaf: true, text: (leaf.innerText || '').trim(),
    rects: leaf.getClientRects().length,
    visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
    hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
    afterControl: anchor ? (anchor.compareDocumentPosition(leaf) & 4) === 4 : null,
  };
})()`;

/**
 * SHOW ONE OF THE THREE JOBS - d-26b's sub-tabs (EW-SHAPE-TABS).
 *
 * The Effects column's panels are re-parented under three sub-tabs, so the
 * sections this instrument measures are UNMOUNTED (not hidden) until their job
 * is shown. One click, immediately after the facet mounts; nothing else about
 * what these rows assert changed. A missing bar returns 'no-sub-tab' rather
 * than throwing, so the row below reports "not found" instead of a stack.
 */
const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

async function main() {
  const t0 = Date.now();
  console.log('=== effects-refusal harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
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
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', true);

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // A real click on an element's painted centre, then real key events.
    //
    // ⚠ IT BLURS FIRST, AND THAT IS NOT TIDINESS. Clicking an input that is
    // ALREADY focused fires no `focus` event, so the select-on-focus never
    // runs and the next keystrokes APPEND. The first version of this file
    // clicked twice in a row and produced `40112200` in the box, which made
    // three rows red for the harness's own reason. A person leaves the box
    // between edits; the harness has to as well.
    const clickAt = async (selector) => {
      await c.evalExpr('(document.activeElement && document.activeElement.blur()), 0');
      const p = await c.json(String.raw`(() => {
        const el = ${selector};
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
      })()`);
      if (!p) return false;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent',
          { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
      return p;
    };
    const typeText = async (s) => {
      for (const ch of s) {
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
    };

    // ---- 1. THE SUBJECT: an act, the Effects tab, a preset with a band. ---
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open', !!(st && st.open), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2500);

    const loaded = await c.json('window.__dbg.aeon.presets()');
    check('1b', `aeon's own ${PRESET_ID}.json is loaded — a real band to type into`,
      loaded.some((p) => p.id === PRESET_ID),
      `${loaded.length} preset(s): ${JSON.stringify(loaded.map((p) => p.id))}`);
    if (!loaded.some((p) => p.id === PRESET_ID)) {
      throw new Error(`${PRESET_ID} absent — every row below would be vacuous`);
    }
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(PRESET_ID)})`);

    check('1c', 'the Effects facet mounts',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1400);
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1000);

    const PRESET_PROOF = `document.querySelector('input[placeholder="new_preset_id"]')`;
    await c.evalExpr(OPEN_SECTION(String.raw`/^Raster band presets\b/`, PRESET_PROOF));
    await sleep(700);
    // The schema's own first words for `top` and `bot` — the strings the panel
    // puts on `title`, read from the contract rather than retyped here.
    const TOP_TITLE = 'Screen line the effect turns ON';
    const BOT_TITLE = 'Screen line the effect turns OFF';
    const BAND_PROOF = EDGE_BOX(TOP_TITLE);
    // ⚠ `(?!\s—)` AND NOT `\b`. A CollapsibleSection's `right` slot runs its
    // label straight into the title, so this header's textContent is
    // "Preset — authored_probeDelete" — `\b` finds no boundary between `e` and
    // `D` and matches nothing. The lookahead is what separates this section
    // from its sibling "Preset — authored_probe — cycles, variants". Two runs
    // were paid for exactly this in band-preset-harness; a third here.
    const opened = await c.evalExpr(OPEN_SECTION(
      String.raw`/^Preset — ` + PRESET_ID + String.raw`(?!\s—)/`, BAND_PROOF));
    await sleep(900);

    // ---- 2. THE CONTROL, AND THE STATE BEFORE ANYTHING IS TYPED. ---------
    const box = await c.json(String.raw`(() => {
      const el = ${EDGE_BOX(TOP_TITLE)};
      if (!el) return { found: false };
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return {
        found: true, value: el.value, title: (el.title || '').slice(0, 70),
        hasMin: el.hasAttribute('min'), hasMax: el.hasAttribute('max'),
        dpr: window.devicePixelRatio, rect: b.toJSON(),
        rects: el.getClientRects().length,
        visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
        hitIsBox: hit === el,
      };
    })()`);
    check('2a', 'the `Top` box is FOUND by the schema\'s own description, PAINTED, and hit-testable',
      box.found === true && box.rects > 0 && box.visible !== false && box.hitIsBox === true,
      box.found === false ? `NOT FOUND (section open → ${opened})` : JSON.stringify(box));
    if (box.found !== true) throw new Error('the Top box was not found — nothing below can be typed');

    // ⚠ THE `min`/`max` ROW, AND IT ASSERTS THEIR ABSENCE. They are what a
    // reader assumes is doing the work; they stop no typed value, and rows
    // [3a]/[3b] below are only meaningful because nothing else could be.
    check('2b', 'the box carries NO min/max — so any refusal below is the real one',
      box.hasMin === false && box.hasMax === false,
      `min=${box.hasMin} max=${box.hasMax}`);

    const before = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
      .find((p) => p.id === PRESET_ID);
    check('2c', 'ANTI-VACUOUS: the band\'s edges BEFORE anything is typed',
      Number.isInteger(before?.bands?.[0]?.top) && Number.isInteger(before?.bands?.[0]?.bot),
      `band 0 = ${JSON.stringify(before?.bands?.[0])}`);
    const top0 = before.bands[0].top;

    // ---- 3. SELECT-ON-FOCUS, then the typo that used to reach the build. --
    const aim = await clickAt(EDGE_BOX(TOP_TITLE));
    await sleep(300);
    const sel = await c.json(String.raw`(() => {
      const el = ${EDGE_BOX(TOP_TITLE)};
      return { focused: document.activeElement === el, value: el.value,
               start: el.selectionStart, end: el.selectionEnd };
    })()`);
    // A `<input type="number">` reports null selection ranges in some engines;
    // the row accepts either a full selection or a browser that will not say,
    // AND PRINTS WHICH, rather than pretending to have measured it.
    const fullySelected = sel.start === 0 && sel.end === String(sel.value).length;
    check('3a', 'clicking the box focuses it and SELECTS its contents (the cause of `40112`)',
      sel.focused === true && (fullySelected || sel.start === null),
      `${JSON.stringify(sel)} — aim ${JSON.stringify(aim)}; `
      + `${sel.start === null ? 'selection range NOT REPORTED by this engine for type=number; '
        + 'the replace behaviour is measured by row [5a] instead' : 'range measured'}`);

    await typeText('40112');
    await sleep(600);
    const afterTypo = await c.json(String.raw`(() => {
      const el = ${EDGE_BOX(TOP_TITLE)};
      return { shown: el.value };
    })()`);
    const modelAfterTypo = PLANT === 'no-refuse'
      ? { bands: [{ top: Number(afterTypo.shown) }] }
      : JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
        .find((p) => p.id === PRESET_ID);
    // ⚠ THE PROPERTY IS "THE DOCUMENT NEVER HOLDS WHAT THE BUILD REFUSES",
    // NOT "the document did not move", and the first draft of this row asserted
    // the second. `NumberField` commits per keystroke — its own long-standing
    // contract, deliberately not changed by this parcel — so typing `40112`
    // over a selected `112` walks through `4` and `40`, which ARE legal screen
    // lines and DO land. The box then holds `40112` and the document holds
    // `40`. That is measured here, and it is why the refusal sentence names
    // what the document still holds instead of only saying "not written".
    const held = modelAfterTypo.bands[0].top;
    check('3b', 'the keys REACHED the box, and the document holds a LEGAL line — never 40112',
      afterTypo.shown === '40112'
      && held !== 40112 && held >= 3 && held <= 223 && held < modelAfterTypo.bands[0].bot,
      `box shows ${JSON.stringify(afterTypo.shown)}; model top = ${held} (was ${top0}, `
      + `bot ${modelAfterTypo.bands[0].bot}) — the per-keystroke prefixes 4 and 40 are legal `
      + 'lines and landed; the illegal 401/4011/40112 did not');

    const refusal = await c.json(PAINTED_LEAF('is not a screen line', EDGE_BOX(TOP_TITLE)));
    check('3c', 'a PAINTED refusal sits under the box and names preset, band and field',
      refusal.leaf === true && refusal.rects > 0 && refusal.visible !== false
      && refusal.hitInside === true && refusal.afterControl === true
      && new RegExp(`^preset "${reQuote(PRESET_ID)}" · Raster band 0 · Top: 40112 is not a screen line`)
        .test(refusal.text)
      && new RegExp(`Refused; Top is still ${held}\\.$`).test(refusal.text),
      JSON.stringify(refusal));

    // ---- 4. Top >= Bot, the walkthrough's own two-field mistake. ----------
    await clickAt(EDGE_BOX(TOP_TITLE));
    await sleep(250);
    await typeText('200');
    await sleep(600);
    const order = await c.json(PAINTED_LEAF('Move the other edge first', EDGE_BOX(TOP_TITLE)));
    const modelAfterOrder = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
      .find((p) => p.id === PRESET_ID);
    // Same property as [3b], for the ORDER rule: the illegal 200 never lands,
    // and the document is left holding a line that is still above `bot`. The
    // per-keystroke prefixes (`2`, `20`) are legal and do land, which is the
    // pre-existing NumberField contract and why the sentence names what is held.
    const orderTop = modelAfterOrder.bands[0].top;
    check('4a', 'Top 200 against a lower Bot is refused, painted, and says which edge to move',
      order.leaf === true && order.rects > 0 && order.visible !== false
      && order.hitInside === true
      && /top must stay above bot/.test(order.text)
      && orderTop !== 200 && orderTop < modelAfterOrder.bands[0].bot,
      `${JSON.stringify(order)}; model top = ${orderTop} (was ${top0}), `
      + `bot = ${modelAfterOrder.bands[0].bot} — 200 never landed`);

    // ---- 5. THE FLOOR: a LEGAL value still lands, through the same path. --
    //
    // Without this every row above is satisfied by a box that accepts nothing.
    await clickAt(EDGE_BOX(TOP_TITLE));
    await sleep(250);
    const legal = String(Math.max(4, Math.min(200, before.bands[0].bot - 8)));
    await typeText(legal);
    await sleep(700);
    const modelAfterLegal = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
      .find((p) => p.id === PRESET_ID);
    check('5a', 'ANTI-VACUOUS FLOOR: a LEGAL value typed the same way DOES reach the document',
      modelAfterLegal.bands[0].top === Number(legal),
      `typed ${legal} → model top = ${modelAfterLegal.bands[0].top} (was ${top0}); `
      + 'this also measures SELECT-ON-FOCUS: without it the digits would have been '
      + 'appended to whatever the box held and the result would not be ' + legal);

    const gone = await c.json(PAINTED_LEAF('is not a screen line', EDGE_BOX(TOP_TITLE)));
    check('5b', 'and the refusal clears once a legal value commits',
      gone.leaf === false, JSON.stringify(gone));

    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/effects-refusal.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/effects-refusal.png`);
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n════ ${pass}/${results.length} rows · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  if (fails.length) {
    console.log('FAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
