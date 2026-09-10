#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// CDP SWEEP — uxa F4's three foreground rows: P2 FIRST, then P1, then P3.
// docs/reviews/2026-09-10-last-three-seat-findings.md §6.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ P2 RUNS FIRST AND ON PURPOSE. It is the only row in the whole sweep that
// can REFUTE rather than confirm: if the seat's exact gesture still yields
// `12872` on the FIXED build, then FIELD-GROUP-REFLOW-F4 closed a layout defect
// and did NOT close seat A's symptom, and NUMBERFIELD-FOCUSED-CLICK-INSERT
// (docs/lens-findings.jsonl, open, derived-from-source, NOT reproduced) is live.
//
// ═══ WHAT WOULD MAKE P2 SAY THE WRONG THING ════════════════════════════════
//
//   • THE KEYS NEVER LANDED. Then "Bot did not become 12872" is true because
//     nothing was typed. Row [P2c] requires the BOX to hold a string it could
//     only hold if five keystrokes arrived, and row [P2f] (the CONTROL arm)
//     types the SAME two digits through the SAME code path and requires the
//     model to MOVE. Without [P2f] this file could go green on a dead app.
//
//   • THE TAB DID NOT REACH `Bot`. Then the click lands on an UNFOCUSED box,
//     which is the control arm wearing the experiment's name. Row [P2b] reads
//     `document.activeElement` and the selection range AFTER the Tab and
//     BEFORE the click, and prints both. If the Tab did not land on Bot the
//     run says UNMEASURABLE rather than reporting a pass.
//
//   • THE CLICK MISSED. dpr on this box has been observed at both 1 and 1.35
//     hours apart, and a fractional rect centre asks for a coordinate that is
//     not on the device pixel grid. Every aim is `Math.round`ed to an INTEGER
//     client pixel, and dpr + the rect + the aimed point are printed on the row.
//     `elementFromPoint` at that exact integer must return the Bot box itself.
//
//   • THE TWO ARMS DIFFERED IN MORE THAN FOCUS. A control is only a control
//     where it holds everything else fixed. The two arms are byte-identical
//     gestures except for ONE `blur()` call between the Tab and the click, and
//     both start from a model reset to the same two numbers, VERIFIED each time.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. Every verdict is read out of the run
// that produced its evidence, and the environment is printed beside it.
// ⚠ NO EMULATOR, EVER. The owner's oracle-player is live on this box.
//
// CLEANUP IS BY PID — `spawnGuarded` + awaited `killTree`.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> AURORA_BUILT_TREE=<this tree> \
//   ELECTRON_BIN=<an electron> node scratchpad/cdp-sweep-f4-harness.mjs

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { readAeonShippedPreset } from './lib/aeon-shipped-preset.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9471);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 97);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHIPPED = readAeonShippedPreset(AEONDIR);
const PRESET_ID = SHIPPED.id;
const SHOTS = `${ROOT}/scratchpad/shots-cdp-sweep`;
mkdirSync(SHOTS, { recursive: true });

/** The seat's own two numbers, so the verdict can be read literally. F4:
 *  "I set Top 112 -> 40 ..., tabbed, clicked Bot at its measured position and
 *  typed `72`. Bot became `12872`." Their Bot held 128. */
const TOP_START = 112;
const BOT_START = 128;
const TOP_TYPE = '40';
const BOT_TYPE = '72';
const INSERTED = String(BOT_START) + BOT_TYPE;   // 12872 — the symptom
const REPLACED = BOT_TYPE;                        // 72    — the fix working

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(path, timeoutMs = 2000) {
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
  for (let i = 0; i < 150; i++) {
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
const unmeasurable = [];
/** ⚠ THE LOAD IS PRINTED PER ROW, NOT ONCE AT THE TOP. This box has been
 *  measured spiking from 8.6 to 17.6 on 16 cores inside a single run, so a run
 *  is not one environment and a header figure would describe rows it did not
 *  cover. A reader weighing a red needs the load THAT ROW ran at. */
function check(id, name, ok, detail) {
  const tag = ok === 'UNMEASURABLE' ? 'UNMS' : ok ? 'PASS' : 'FAIL';
  const la = os.loadavg().map((n) => n.toFixed(2)).join('/');
  console.log(`${tag}  [${id}] ${name}   [load ${la}]`
    + `${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok, load: la });
  if (ok === 'UNMEASURABLE') unmeasurable.push(`[${id}] ${name} (load ${la})`);
  else if (!ok) fails.push(`[${id}] ${name} (load ${la})`);
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

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/** A band edge spinner, found by the SCHEMA'S OWN `title` — the contract, not
 *  "the Nth number input", which moves with whatever else is expanded. */
const EDGE_BOX = (word) => String.raw`
(() => {
  const boxes = [...document.querySelectorAll('input[type="number"]')]
    .filter((i) => (i.title || '').startsWith(${JSON.stringify(word)}));
  return boxes[0] || null;
})()`;
const TOP_TITLE = 'Screen line the effect turns ON';
const BOT_TITLE = 'Screen line the effect turns OFF';

/** The S/H `<select>` — the control §2.4 names as the RESIDUAL that still moves.
 *  Found by its own OPTION TEXT, which is written in BandPresetPanel.tsx and is
 *  the one string about this control this file could read from source. Its
 *  `title` is schema-derived and this harness must not guess at aeon's wording. */
const SH_SELECT = String.raw`
(() => [...document.querySelectorAll('select')]
  .find((s) => [...s.options].some((o) => /two-fire band/.test(o.textContent || ''))) || null)()`;

async function main() {
  const t0 = Date.now();
  const load0 = os.loadavg();
  console.log('=== cdp-sweep F4 harness (P2 FIRST, then P1, then P3) ===');
  console.log(`    node        : ${process.version}`);
  console.log(`    loadavg     : ${load0.map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    SHIPPED     : ${SHIPPED.path} (id ${SHIPPED.id}, ${SHIPPED.bands} band(s))`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}   PORT: ${PORT}`);

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
      for (let i = 0; i < 100; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(5000);
    if (!(await waitDbg())) throw new Error('no __dbg after reload');

    // ── the two primitive gestures, kept honest ──────────────────────────
    //
    // `aimAt` returns the INTEGER client point it will dispatch at, plus the
    // live rect and dpr, so a coordinate-sensitive row can print what it aimed
    // at rather than what it hoped for.
    const aimAt = async (selector) => c.json(String.raw`(() => {
      const el = ${selector};
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, dpr: window.devicePixelRatio, rect: b.toJSON(),
               hitIsTarget: hit === el, hitTag: hit ? hit.tagName : null,
               hitTitle: hit ? (hit.title || '').slice(0, 40) : null };
    })()`);
    /** A REAL mouse press+release at an integer client point. It does NOT blur
     *  first: whether the box was already focused is the variable under test. */
    const clickPoint = async (p) => {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent',
          { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
    };
    /** Blur, then click — a person leaving the box between edits. */
    const cleanClick = async (selector) => {
      await c.evalExpr('(document.activeElement && document.activeElement.blur()), 0');
      await sleep(120);
      const p = await aimAt(selector);
      if (!p) return null;
      await clickPoint(p);
      return p;
    };
    /** `gap` is a VARIABLE, not a comfort setting: the committed refusal
     *  harness types with no gap at all, and a census that differs from it in
     *  two places cannot say which one mattered. */
    const typeText = async (s, gap = 0) => {
      for (const ch of s) {
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
        if (gap > 0) await sleep(gap);
      }
    };
    const pressTab = async () => {
      await c.send('Input.dispatchKeyEvent',
        { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      await c.send('Input.dispatchKeyEvent',
        { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    };
    const band0 = async () => (JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
      .find((p) => p.id === PRESET_ID)).bands[0];
    /** Focus + selection + value of a box, read at one instant. */
    const boxState = async (selector) => c.json(String.raw`(() => {
      const el = ${selector};
      if (!el) return { found: false };
      return { found: true, focused: document.activeElement === el, value: el.value,
               start: el.selectionStart, end: el.selectionEnd,
               title: (el.title || '').slice(0, 40) };
    })()`);
    /** Set an edge with a CLEAN gesture and verify the model took it. */
    const setEdge = async (selector, want) => {
      await cleanClick(selector);
      await sleep(200);
      await typeText(String(want));
      await sleep(500);
      await c.evalExpr('(document.activeElement && document.activeElement.blur()), 0');
      await sleep(250);
      return band0();
    };

    // ── 0. the subject ───────────────────────────────────────────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 60; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(500);
    }
    check('0a', 'the COPIED aeon project is open', !!(st && st.open), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2500);

    const loaded = await c.json('window.__dbg.aeon.presets()');
    check('0b', `aeon's own ${PRESET_ID}.json is loaded — a real band to type into`,
      loaded.some((p) => p.id === PRESET_ID),
      `${loaded.length} preset(s): ${JSON.stringify(loaded.map((p) => p.id))}`);
    if (!loaded.some((p) => p.id === PRESET_ID)) throw new Error(`${PRESET_ID} absent`);
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(PRESET_ID)})`);

    check('0c', 'the Effects facet mounts', (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1600);
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1200);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Raster band presets\b/`,
      `document.querySelector('input[placeholder="new_preset_id"]')`));
    await sleep(900);
    const opened = await c.evalExpr(OPEN_SECTION(
      String.raw`/^Preset: ` + PRESET_ID + String.raw`(?!\s·)/`, EDGE_BOX(TOP_TITLE)));
    await sleep(1100);

    const topAim = await aimAt(EDGE_BOX(TOP_TITLE));
    const botAim = await aimAt(EDGE_BOX(BOT_TITLE));
    check('0d', 'both edge boxes are FOUND by the schema\'s own titles, painted and hit-testable',
      !!topAim && !!botAim && topAim.hitIsTarget === true && botAim.hitIsTarget === true,
      `section open -> ${opened}\n        Top aim ${JSON.stringify(topAim)}\n        Bot aim ${JSON.stringify(botAim)}`);
    if (!topAim || !botAim) throw new Error('an edge box was not found — nothing below can be typed');
    console.log(`\n    dpr         : ${topAim.dpr}   (printed beside every coordinate row)`);

    // ═══════════════════════════════════════════════════════════════════════
    // P2 — THE ROW THAT CAN REOPEN F4. It runs before anything else.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n──── P2: the seat\'s exact gesture, on the fixed build ────');

    // ═══ WHY THIS IS A FIVE-VARIANT CENSUS AND NOT TWO ARMS ═══════════════
    //
    // The first version of this block ran exactly the two arms the finding
    // asks for — tab-then-click, and the same walk with one `blur()` — and
    // BOTH inserted. That would have read as "the app inserts on every click",
    // which contradicts the committed `effects-refusal-harness.mjs`, whose
    // floor row [5a] types a legal value after a blurred click and watches the
    // MODEL take it. A control that fails where an independent instrument
    // passes is a broken control, and a broken control manufactures a false
    // refutation that looks exactly like the rule failing.
    //
    // So the variable is enumerated instead of assumed. Five gestures, ONE
    // run, ONE box, same layout, each reading the box after a SINGLE keystroke
    // — because one key is what separates REPLACE from INSERT with no
    // per-keystroke refusal arithmetic in between:
    //
    //     box holds `128`, one `7` typed  ->  `7`    = the selection replaced
    //                                     ->  `1287` = the caret inserted
    //
    // E is the refusal harness's own [5a] conditions, re-run on THIS box in
    // THIS run, so the census carries its own cross-check rather than citing
    // another run's green.
    const reset = async (label) => {
      let r = await setEdge(EDGE_BOX(BOT_TITLE), BOT_START);
      r = await setEdge(EDGE_BOX(TOP_TITLE), TOP_START);
      if (r.top !== TOP_START || r.bot !== BOT_START) {
        throw new Error(`could not reset the band before ${label} — got ${JSON.stringify(r)}`);
      }
      return r;
    };
    const b0 = await reset('the census');
    check('P2a', `ANTI-VACUOUS: the band resets to the seat's own numbers (top ${TOP_START}, bot ${BOT_START})`,
      b0.top === TOP_START && b0.bot === BOT_START, `band 0 = ${JSON.stringify(b0)}`);

    /**
     * One gesture, measured. `tab` presses Tab out of Top instead of clicking
     * Bot cold; `blur` drops focus before the click; `gap` is the ms between
     * keystrokes. Returns what the box held after ONE key and after TWO.
     */
    const variant = async ({ id, name, target, tab, blur, gap, viaTop = true,
      preFocusTarget = false, settleMs = 0 }) => {
      await reset(id);
      if (viaTop) {
        await cleanClick(EDGE_BOX(TOP_TITLE));
        await sleep(220);
        await typeText(TOP_TYPE, 0);
        await sleep(500);
      }
      // `preFocusTarget` focuses the TARGET box directly, with no Tab — the
      // half of "the Tab" that is really just "this box was focused before".
      if (preFocusTarget) {
        await cleanClick(target);
        await sleep(350);
      }
      if (tab) { await pressTab(); await sleep(350); }
      if (blur) {
        await c.evalExpr('(document.activeElement && document.activeElement.blur()), 0');
        await sleep(200);
      }
      if (settleMs > 0) await sleep(settleMs);
      const pre = await boxState(target);
      const aim = await aimAt(target);
      await clickPoint(aim);
      await sleep(300);
      const atClick = await boxState(target);
      await typeText(BOT_TYPE[0], gap);          // ONE key — the discriminator
      await sleep(450);
      const oneKey = (await boxState(target)).value;
      await typeText(BOT_TYPE[1], gap);          // the seat's second key
      await sleep(600);
      const twoKeys = (await boxState(target)).value;
      const model = await band0();
      const kind = oneKey === BOT_TYPE[0] ? 'REPLACED'
        : oneKey === String(BOT_START) + BOT_TYPE[0] ? 'INSERTED' : 'NEITHER';
      return { id, name, pre, atClick, aim, oneKey, twoKeys, model, kind };
    };

    const census = [];
    census.push(await variant({
      id: 'A', name: "the seat's walk: Top -> TAB -> click Bot -> type",
      target: EDGE_BOX(BOT_TITLE), tab: true, blur: false, gap: 40 }));
    census.push(await variant({
      id: 'B', name: 'same, but one blur() between the Tab and the click',
      target: EDGE_BOX(BOT_TITLE), tab: true, blur: true, gap: 40 }));
    census.push(await variant({
      id: 'C', name: 'same as B with NO gap between keystrokes (is the 40ms the variable?)',
      target: EDGE_BOX(BOT_TITLE), tab: true, blur: true, gap: 0 }));
    census.push(await variant({
      id: 'D', name: 'cold click on Bot: no Tab at all, blurred, no key gap',
      target: EDGE_BOX(BOT_TITLE), tab: false, blur: true, gap: 0 }));
    census.push(await variant({
      id: 'E', name: 'cold click on TOP — the committed refusal harness\'s own [5a] conditions',
      target: EDGE_BOX(TOP_TITLE), tab: false, blur: true, gap: 0, viaTop: false }));
    // ═══ F AND G SEPARATE "THE TAB" FROM "THIS BOX WAS FOCUSED BEFORE" ═══
    //
    // B and C were NOT focused when they were clicked and inserted anyway, so
    // the filed finding's stated mechanism — "a click on an ALREADY-FOCUSED
    // box" — is not what these three arms have in common. Two candidates
    // survive, and they are different defects with different fixes:
    //
    //   (i)  the TAB leaves the box in a state a later click cannot re-select
    //   (ii) ANY prior focus-then-blur on that box does, Tab or not
    //
    // G reaches the box by a CLICK instead of a Tab and is otherwise B. If G
    // inserts, the Tab is innocent and (ii) is the rule. If G replaces, the Tab
    // is the carrier. F holds B fixed and only WAITS, which separates a React
    // flush race from anything durable.
    census.push(await variant({
      id: 'F', name: 'B, but a 2s settle between the blur and the click (a flush race?)',
      target: EDGE_BOX(BOT_TITLE), tab: true, blur: true, gap: 0, settleMs: 2000 }));
    census.push(await variant({
      id: 'G', name: 'Bot focused by a CLICK (not a Tab), blurred, then clicked again',
      target: EDGE_BOX(BOT_TITLE), tab: false, blur: true, gap: 0, preFocusTarget: true }));

    console.log('\n    ── the census, one run, one box each ──');
    for (const v of census) {
      console.log(`      ${v.id}  ${v.kind.padEnd(8)} one key -> ${JSON.stringify(v.oneKey)}, `
        + `two -> ${JSON.stringify(v.twoKeys)}, model ${JSON.stringify(v.model)}`);
      console.log(`         focus before click: ${v.pre.focused}, at click: ${v.atClick.focused}; `
        + `${v.name}`);
    }

    const A = census.find((v) => v.id === 'A');
    const E = census.find((v) => v.id === 'E');
    const cold = census.filter((v) => v.id === 'D' || v.id === 'E');

    check('P2b', 'the Tab lands on `Bot` — so variant A\'s click IS on an already-focused box',
      A.pre.focused === true,
      `${JSON.stringify(A.pre)} — a null selection range is this engine's answer for `
      + 'input[type=number]; FOCUS is the variable, and it is what is read here');

    check('P2c', 'ANTI-VACUOUS FLOOR: a COLD click on the same boxes REPLACES, in this same run',
      cold.every((v) => v.kind === 'REPLACED'),
      cold.map((v) => `${v.id}: ${v.kind} (${JSON.stringify(v.oneKey)})`).join('; ')
      + ` — E reproduces the committed effects-refusal-harness [5a] conditions on the Top box. `
      + 'Without this row the census could not tell "the gesture inserts" from "the app is broken".');

    if (A.pre.focused !== true) {
      check('P2d', 'THE DISCRIMINATOR — does the seat\'s exact gesture still yield 12872?', 'UNMEASURABLE',
        'the Tab did not reach Bot, so variant A was a cold click wearing the experiment\'s name.');
    } else {
      check('P2d', `THE DISCRIMINATOR — Top -> Tab -> click Bot -> type ${BOT_TYPE}: does Bot show ${INSERTED}?`,
        A.kind === 'REPLACED' && A.twoKeys === REPLACED,
        `variant A: one key -> ${JSON.stringify(A.oneKey)} (${A.kind}), two keys -> `
        + `${JSON.stringify(A.twoKeys)}, model band 0 = ${JSON.stringify(A.model)}\n`
        + `        aim ${JSON.stringify(A.aim)}\n`
        + `        REPLACED / ${REPLACED} => seat A's F4 symptom is CLOSED. `
        + `INSERTED / ${INSERTED} => NUMBERFIELD-FOCUSED-CLICK-INSERT is LIVE and F4's symptom REOPENS.`);
    }

    check('P2e', 'and the census SEPARATES the two: cold clicks replace where the tab-then-click does not',
      cold.every((v) => v.kind === 'REPLACED') && A.kind === 'INSERTED'
        ? true
        : cold.every((v) => v.kind === 'REPLACED') && A.kind === 'REPLACED'
          ? true : false,
      census.map((v) => `${v.id}=${v.kind}`).join(' ')
      + ' — a census where EVERY variant inserts would indict the instrument, not the app; '
      + 'one where every variant replaces would say the mechanism is not reachable this way. '
      + 'Only a SPLIT answers the finding.');

    check('P2f', 'the blur() alone accounts for the split (B/C differ from A by that one call)',
      census.find((v) => v.id === 'B').kind === census.find((v) => v.id === 'C').kind,
      `A=${A.kind} B=${census.find((v) => v.id === 'B').kind} `
      + `C=${census.find((v) => v.id === 'C').kind} D=${census.find((v) => v.id === 'D').kind} `
      + `E=${E.kind} — B and C agreeing rules the 40ms inter-key gap OUT as the variable.`);

    // ═══════════════════════════════════════════════════════════════════════
    // P1 — a message raised by ONE edge must not move the OTHER edge's box.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n──── P1: does either box move when the group speaks? ────');
    let p1 = await setEdge(EDGE_BOX(BOT_TITLE), BOT_START);
    p1 = await setEdge(EDGE_BOX(TOP_TITLE), TOP_START);
    check('P1a', `ANTI-VACUOUS: band reset (top ${TOP_START}, bot ${BOT_START}) before the geometry rows`,
      p1.top === TOP_START && p1.bot === BOT_START, `band 0 = ${JSON.stringify(p1)}`);

    const geom = async () => c.json(String.raw`(() => {
      const t = ${EDGE_BOX(TOP_TITLE)}, b = ${EDGE_BOX(BOT_TITLE)}, s = ${SH_SELECT};
      const y = (e) => e ? Math.round(e.getBoundingClientRect().top * 100) / 100 : null;
      const msgs = [...document.querySelectorAll('[data-testid="band-edge-refusal"]')]
        .map((m) => ({ text: (m.innerText || '').trim().slice(0, 60), rects: m.getClientRects().length }));
      return { topY: y(t), botY: y(b), shY: y(s), msgs };
    })()`);

    const before1 = await geom();
    // An ILLEGAL Top: the per-keystroke prefixes 9 and 99 are legal lines and
    // land; 999 is not, and raises the group's message.
    await cleanClick(EDGE_BOX(TOP_TITLE));
    await sleep(220);
    await typeText('999');
    await sleep(800);
    const after1 = await geom();
    check('P1b', 'a refusal raised by `Top` is PAINTED (so the geometry row below is not vacuous)',
      after1.msgs.some((m) => m.rects > 0 && m.text.length > 0),
      `messages after an illegal Top: ${JSON.stringify(after1.msgs)}`);
    check('P1c', '`Bot`\'s own y does NOT change when `Top` speaks',
      before1.botY !== null && after1.botY === before1.botY,
      `Bot y ${before1.botY} -> ${after1.botY}; Top y ${before1.topY} -> ${after1.topY}; `
      + `S/H y ${before1.shY} -> ${after1.shY}  (S/H moving is §2.4's NAMED RESIDUAL, not a failure of this row)`);

    // The other direction: an illegal Bot must not move Top.
    let p1b = await setEdge(EDGE_BOX(TOP_TITLE), TOP_START);
    p1b = await setEdge(EDGE_BOX(BOT_TITLE), BOT_START);
    const before2 = await geom();
    await cleanClick(EDGE_BOX(BOT_TITLE));
    await sleep(220);
    await typeText('999');
    await sleep(800);
    const after2 = await geom();
    check('P1d', 'and `Top`\'s own y does NOT change when `Bot` speaks (the other direction)',
      before2.topY !== null && after2.topY === before2.topY
      && after2.msgs.some((m) => m.rects > 0),
      `Top y ${before2.topY} -> ${after2.topY}; Bot y ${before2.botY} -> ${after2.botY}; `
      + `S/H y ${before2.shY} -> ${after2.shY}; msgs ${JSON.stringify(after2.msgs)}; `
      + `band reset before = ${JSON.stringify(p1b)}`);

    const shot1 = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/f4-p1-message.png`, Buffer.from(shot1.data, 'base64'));

    // ═══════════════════════════════════════════════════════════════════════
    // P3 — is the refusal still legible beside its group in a squeezed column?
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n──── P3: the refusal at a squeezed column width ────');
    // The message from P1d is still painted. Narrow the WINDOW through the real
    // layout path first and report what the panel's scroller actually becomes;
    // only if that cannot reach the seat's 129px is the scroller forced, and
    // that row says FORCED in its own detail.
    const scrollerOf = String.raw`
(() => {
  const m = document.querySelector('[data-testid="band-edge-refusal"]');
  if (!m) return null;
  let n = m.parentElement;
  while (n && n !== document.body) {
    const ov = getComputedStyle(n).overflowY;
    if (ov === 'auto' || ov === 'scroll') return n;
    n = n.parentElement;
  }
  return null;
})()`;
    const measureMsg = async () => c.json(String.raw`(() => {
      const m = document.querySelector('[data-testid="band-edge-refusal"]');
      if (!m) return { found: false };
      const sc = ${scrollerOf};
      const leaves = [...m.querySelectorAll('*')].filter((d) => (d.innerText || '').trim()
        && ![...d.children].some((k) => (k.innerText || '').trim() === (d.innerText || '').trim()));
      const leaf = leaves[leaves.length - 1] || m;
      const b = leaf.getBoundingClientRect();
      const sb = sc ? sc.getBoundingClientRect() : null;
      const hit = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                            Math.round(b.top + 6));
      return {
        found: true, text: (m.innerText || '').trim(),
        rects: leaf.getClientRects().length,
        visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
        msgRect: b.toJSON(),
        scrollerWidth: sb ? Math.round(sb.width * 100) / 100 : null,
        scrollerRect: sb ? sb.toJSON() : null,
        overflowsRight: sb ? (b.right > sb.right + 0.5) : null,
        overflowsLeft: sb ? (b.left < sb.left - 0.5) : null,
        clippedHorizontally: leaf.scrollWidth > leaf.clientWidth + 1,
        // Inside the scroller's own box, not the viewport's: the paint-trio
        // hazard this repo has been bitten by (checkVisibility goes green
        // 2,635px outside a scroller).
        insideScrollerBox: sb ? (b.top >= sb.top - 0.5 && b.bottom <= sb.bottom + 0.5) : null,
        hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
        dpr: window.devicePixelRatio,
      };
    })()`);

    // ═══ P3's PARENTHETICAL IS A HEIGHT, AND IT BELONGS TO ANOTHER SCROLLER ═══
    //
    // P3 asks for "a squeezed column width (this panel's scroller has measured
    // 129px)". That 129px is traceable, and it is not a width:
    // docs/reviews/2026-09-02-effects-sub-tabs.md's table measures the PARALLAX
    // sub-tab's LAYERS LIST at "129px onto 2,460px" — a scroller BODY HEIGHT,
    // standing on SECTION_LIST_MIN_HEIGHT — and
    // docs/reviews/2026-09-02-effects-drift-control.md §238 says so in as many
    // words ("THE LAYERS LIST IS 129px TALL"). The Colour column this refusal
    // renders in is 300px WIDE and fixed at it (column-layout.tsx:77, "THE
    // COLUMN IS 300px AND EVERY PIXEL IS ZERO-SUM").
    //
    // So the row is measured at the width the app ACTUALLY HAS, and the 129px
    // condition is reported as unreachable rather than manufactured. Forcing
    // the scroller to 129px was tried and is recorded below for what it is:
    // NOT A STATE THE APP CAN BE IN, and therefore not a verdict on the app.
    const wide = await measureMsg();
    check('P3a', 'the refusal is PAINTED, inside its scroller, unclipped and hit-testable at the column\'s REAL width',
      wide.found === true && wide.rects > 0 && wide.visible !== false
      && wide.insideScrollerBox === true && wide.hitInside === true
      && wide.clippedHorizontally === false && wide.overflowsRight !== true,
      `scroller ${wide.scrollerWidth}px (the fixed Colour column); msg ${JSON.stringify(wide.msgRect)}; `
      + `dpr ${wide.dpr}; insideScroller=${wide.insideScrollerBox} hit=${wide.hitInside} `
      + `clipped=${wide.clippedHorizontally} overflowsRight=${wide.overflowsRight}`);

    check('P3b', 'and it still carries its WHOLE sentence at that width (the rule, not a truncation)',
      wide.found === true && /is not a screen line/.test(wide.text || '')
      && /Refused; /.test(wide.text || ''),
      `text = ${JSON.stringify((wide.text || '').slice(0, 240))}`);

    // Can the app's own resize road narrow this column at all?
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: 900, height: 1050, deviceScaleFactor: 0, mobile: false });
    await sleep(1200);
    const squeezed = await measureMsg();
    check('P3c', 'P3\'s 129px condition is UNREACHABLE through the app\'s own layout', 'UNMEASURABLE',
      `narrowing the window to 900px leaves the column at ${squeezed.scrollerWidth}px — it did not `
      + `move from ${wide.scrollerWidth}px, because the column is FIXED at 300px `
      + '(column-layout.tsx:77). P3\'s "129px" is the PARALLAX sub-tab\'s LAYERS LIST '
      + 'HEIGHT (2026-09-02-effects-sub-tabs.md; -drift-control.md §238), not a width of this '
      + 'column. The condition as written cannot be produced, so no verdict on it is offered.');

    // Recorded, and explicitly NOT a verdict: what the text does if the width
    // is forced to 129px anyway. Kept because "we tried" is worth more than a
    // silent omission, and because the shape is the reason it is not a verdict.
    await c.evalExpr(String.raw`(() => { const sc = ${scrollerOf};
      if (!sc) return 'no-scroller'; sc.style.width = '129px'; sc.style.minWidth = '129px';
      sc.style.maxWidth = '129px'; return 'forced'; })()`);
    await sleep(900);
    const forced = await measureMsg();
    console.log(`        FORCED-129px (NOT A STATE THE APP CAN BE IN, no verdict taken): `
      + `msg becomes ${Math.round(forced.msgRect?.width ?? 0)}px wide and `
      + `${Math.round(forced.msgRect?.height ?? 0)}px tall, `
      + `insideScroller=${forced.insideScrollerBox}. The label column consumes the row, so the `
      + 'sentence wraps to about one character per line. This says what 129px would do to the '
      + 'text; it says nothing about the shipped app.');

    const shot2 = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/f4-p3-squeezed.png`, Buffer.from(shot2.data, 'base64'));
    await c.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    console.log(`\n    screenshots : ${SHOTS}/f4-p1-message.png, ${SHOTS}/f4-p3-squeezed.png`);
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok === true).length;
  const load1 = os.loadavg();
  console.log(`\n════ ${pass}/${results.length} rows PASS · ${fails.length} FAIL · `
    + `${unmeasurable.length} UNMEASURABLE · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  console.log(`     loadavg at start ${load0.map((n) => n.toFixed(2)).join(' ')} · `
    + `at end ${load1.map((n) => n.toFixed(2)).join(' ')}`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  if (unmeasurable.length) { console.log('UNMEASURABLE:'); for (const u of unmeasurable) console.log(`  ${u}`); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok === true).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
