#!/usr/bin/env node
//
// numberfield-selection-trace — WHAT the previous visit left behind.
//
// `NUMBERFIELD-FOCUSED-CLICK-INSERT` is REPRODUCED and its filed mechanism is
// REFUTED (`docs/reviews/2026-09-10-cdp-sweep.md` §3). That census enumerated
// seven gestures, ruled out four candidate mechanisms — an already-focused box,
// the Tab, the inter-keystroke gap, a React flush race — and deliberately named
// no replacement, because seven points support a CORRELATION and not a
// mechanism. Its closing line: *the next step is an experiment rather than more
// reading.* This is that experiment.
//
// ⚠ FIRST, THE INSTRUMENT'S OWN BLINDNESS, BECAUSE THE FIRST VERSION OF THIS
// FILE HAD IT AND REPORTED CLEAN NULLS. The obvious design is to watch
// `selectionStart`/`selectionEnd` across every event between the click and the
// first keystroke, and name the phase where the selection dies. **Chromium does
// not expose those properties on `input[type="number"]`** — the spec lists
// number among the types that do not support selection APIs. The recorder duly
// logged `sel=[null,null]` at every phase in both arms, which reads exactly like
// *"the selection is gone the whole time"* and is in fact *"this instrument
// cannot see selections."* Row `0g` now asserts that refusal out loud and the
// traces record focus and activeElement only. **A harness that cannot report its
// own blindness renders not-looking as a clean result** — this repo's sharpest
// standing bar, and it fired here on the harness written to honour it.
//
// SO THE ONLY OBSERVABLE IS THE OUTCOME: the box's value after ONE keystroke.
// `"7"` means the selection was live and the digit REPLACED it. `"1287"` means
// the caret was placed and the digit was INSERTED. One keystroke, never two:
// `NumberField` commits per keystroke, so a two-key read has to be untangled
// from the per-keystroke refusal arithmetic and a single key does not.
//
// ═══ 2026-09-10, LATER THE SAME DAY: THE FIX LANDED AND THIS FILE CHANGED ════
//
// `NumberField` now guards the FOCUSING click's `mouseup` (`fields.tsx`, the
// block above `onMouseDown`), and arms H and K therefore REPLACE. **Three rows
// went red on the fixed build and every one of them was correct to** — they
// asserted the DEFECT, which is what a red is supposed to mean:
//
//   2a  H and I DISAGREE           the law itself; the fix erases the law
//   2c  at least one arm INSERTED  the discrimination row; see below
//   2d  K INSERTED                 the confound control, cleared before the fix
//
// They are rewritten rather than deleted, and each now states the pre-fix
// measurement it used to make and where that measurement lives
// (`docs/reviews/2026-09-10-numberfield-previous-visit.md`). ⚠ THE ONE THAT
// MATTERS IS 2c. Its job was never "the bug is present" — its job was **can
// this run still tell an INSERT from a REPLACE**, without which every REPLACED
// above is indistinguishable from an instrument that reports REPLACED no matter
// what. Deleting it would have removed the only thing standing between a fixed
// build and a dead one. So it now asserts a gesture that MUST STILL INSERT on a
// correctly fixed build, and there is exactly one: **a click inside a box that
// is ALREADY FOCUSED**, which places a caret and is the capability the fix was
// deliberately scoped not to take (arm N).
//
// Arm S is the other half of that scoping, on the axis nobody was watching: the
// remedy suppresses a default action, and Chromium's number spinner stops its
// auto-repeat in a mouseup default handler. A guard that reached the spin button
// would leave it running. S measures it rather than arguing about it.
//
// ═══ WHAT THIS RUN ADDS, AND WHY IT IS NOT A SIXTH GESTURE ═══════════════════
//
// The census varied WHAT THE HANDS DID and found five inserting gestures and two
// replacing ones. Rebuilding its arm G here — click, blur, click again — but
// with a value TYPED during the first visit produced **REPLACE where the census
// got INSERT**. That is not a contradiction; it is a variable the census never
// moved, because in its arm G nothing was ever typed into the box.
//
// So the arms below vary ONE thing: **what the previous visit to this box left
// behind.** Nothing about the hands changes — every arm ends with the identical
// blur, click, one keystroke.
//
//   D  never focused at all (the census's floor)          expect REPLACE
//   H  visited, NOTHING typed                             the census's arm G
//   I  visited, a LEGAL value typed and committed
//   J  visited, a REFUSED value typed and NOT committed
//   K  visited, `.select()` called, nothing typed         the confound control
//   L  visited, typed with NO explicit select()           the realistic typed case
//   M  arm H's conditions, mouseup default prevented      the remedy probe
//   N  a SECOND click inside the already-focused box      the scope, and 2c's
//                                                         discriminator
//   S  one click on the spin arrow of an unfocused box    the scope, other axis
//
// **H against I isolates whether a commit happened. J against both separates
// TYPING from COMMITTING** — and that boundary is where `NumberField`'s code
// actually forks (`fields.tsx`: `commits += 1` and `onChange(n)` run only when
// the refusal is null), so it is the split most likely to name a mechanism
// rather than another correlation. Three arms and a floor, because a two-case
// test invites stopping at the first matching pair.
//
// ⚠ EVERY ARM RELOADS THE PAGE FIRST. "What the previous visit left behind" is a
// property of the session, so an arm that inherits an earlier arm's box is
// measuring the wrong history — and D's entire content is *never focused*, which
// any earlier row destroys. The reload is the control, not a tidy-up.
//
// ⚠ NO EMULATOR, EVER. The owner's oracle-player is live on this box.
// CLEANUP IS BY PID — `spawnGuarded` + awaited `killTree`.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> AURORA_BUILT_TREE=<this tree> \
//   ELECTRON_BIN=<an electron> node scratchpad/numberfield-selection-trace-harness.mjs

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { readAeonShippedPreset } from './lib/aeon-shipped-preset.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9473);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 99);
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

const BOT_TITLE = 'Screen line the effect turns OFF';
const TOP_TITLE = 'Screen line the effect turns ON';
const ONE_KEY = '7';
/** A single digit low enough to be outside any band-edge window — one keystroke,
 *  refused, so the arm has ZERO commits rather than a legal prefix that landed.
 *  Verified per-run against the model rather than assumed (row `Jx`). */
const REFUSED_KEY = '1';

/**
 * WHERE `key` WAS INSERTED INTO `before` TO PRODUCE `after`, or -1.
 *
 * ⚠ WIDENED WHEN THE FIX LANDED, and the widening is load-bearing rather than
 * tidying. Until then this was `after.endsWith(key)`, which is true only for a
 * caret at the END of the text — fine while every inserting arm clicked the
 * CENTRE of a short left-aligned box, where the caret can land nowhere else.
 * Arm N clicks the LEFT edge on purpose, so its insert lands at position 0 and
 * `endsWith` would have called `"7156"` NEITHER — a verdict that reads as "the
 * app did something inexplicable" for a caret doing exactly its job.
 *
 * Verdicts for every pre-existing arm are unchanged by this: `"156"` -> `"1567"`
 * is index 3 here and passed `endsWith` before.
 */
function insertedAt(before, after, key) {
  for (let i = 0; i <= before.length; i++) {
    if (before.slice(0, i) + key + before.slice(i) === after) return i;
  }
  return -1;
}

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
function check(id, name, ok, detail) {
  const tag = ok === 'UNMEASURABLE' ? 'UNMS' : ok ? 'PASS' : 'FAIL';
  const la = os.loadavg().map((n) => n.toFixed(2)).join('/');
  console.log(`${tag}  [${id}] ${name}   [load ${la}]${detail !== undefined ? `\n        ${detail}` : ''}`);
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
  if (!hdr) return 'no-header';
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
const EDGE_BOX = (word) => String.raw`
(() => {
  const boxes = [...document.querySelectorAll('input[type="number"]')]
    .filter((i) => (i.title || '').startsWith(${JSON.stringify(word)}));
  return boxes[0] || null;
})()`;

/**
 * Does this element expose a selection at all? Asked of the live element rather
 * than assumed from the spec, and it reports WHICH refusal — a throw and a null
 * are different facts and the harness must not collapse them.
 */
const SELECTION_VISIBILITY = String.raw`
(() => {
  const box = ${EDGE_BOX(BOT_TITLE)};
  if (!box) return { found: false };
  let mode = 'readable', start = null, err = null;
  try {
    start = box.selectionStart;
    if (start === null || start === undefined) mode = 'null';
  } catch (e) { mode = 'throws'; err = String(e && e.name); }
  return { found: true, type: box.type, mode, start, err };
})()`;

/**
 * The recorder. Capture phase on `document`, so it sees each event before
 * React's delegated listener at the root. It records focus and activeElement
 * ONLY — see the blindness note at the top of this file. It does not record a
 * selection, because it cannot, and a field of nulls would say otherwise.
 */
const INSTALL_RECORDER = String.raw`
(() => {
  const box = ${EDGE_BOX(BOT_TITLE)};
  if (!box) return 'no-box';
  window.__nfTrace = [];
  const snap = (phase) => window.__nfTrace.push({
    phase, value: box.value, isActive: document.activeElement === box,
    t: Math.round(performance.now()),
  });
  for (const type of ['mousedown', 'focusin', 'mouseup', 'click', 'keydown']) {
    document.addEventListener(type, (ev) => {
      if (ev.target === box) snap(type);
    }, true);
  }
  return 'installed';
})()`;

const TRACE = 'JSON.parse(JSON.stringify(window.__nfTrace || []))';
const RESET_TRACE = '(window.__nfTrace = [], "ok")';

async function main() {
  const t0 = Date.now();
  const load0 = os.loadavg();
  console.log('=== numberfield-selection-trace: what the PREVIOUS VISIT left behind ===');
  console.log(`    node        : ${process.version}`);
  console.log(`    loadavg     : ${load0.map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}   PORT: ${PORT}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  const arms = [];
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

    const aimAt = async (selector) => c.json(String.raw`(() => {
      const el = ${selector};
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, dpr: window.devicePixelRatio, hitIsTarget: hit === el };
    })()`);
    const clickPoint = async (p) => {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
    };
    const typeText = async (s) => {
      for (const ch of s) {
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
    };
    const boxState = async (selector) => c.json(String.raw`(() => {
      const el = ${selector};
      if (!el) return { found: false };
      return { found: true, focused: document.activeElement === el, value: el.value };
    })()`);
    const blur = async () => { await c.evalExpr('(document.activeElement && document.activeElement.blur()), 0'); };
    const band0 = async () => (JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
      .find((p) => p.id === PRESET_ID)).bands[0];

    /** Reload and re-navigate to the band panel. Returns the Bot box's aim. */
    const freshPanel = async () => {
      await c.send('Page.reload');
      await sleep(5000);
      if (!(await waitDbg())) throw new Error('no __dbg after reload');
      await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
      let st = null;
      for (let i = 0; i < 60; i++) {
        st = await c.json('window.__dbg.aeon.state()').catch(() => null);
        if (st && st.open) break;
        await sleep(500);
      }
      if (!st || !st.open) throw new Error('project did not open');
      await sleep(2200);
      await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(PRESET_ID)})`);
      await c.evalExpr(clickByText('/^Effects$/'));
      await sleep(1500);
      await c.evalExpr(SUBTAB('colour'));
      await sleep(1100);
      await c.evalExpr(OPEN_SECTION(String.raw`/^Raster band presets\b/`,
        `document.querySelector('input[placeholder="new_preset_id"]')`));
      await sleep(800);
      await c.evalExpr(OPEN_SECTION(String.raw`/^Preset: ` + PRESET_ID + String.raw`(?!\s·)/`, EDGE_BOX(TOP_TITLE)));
      await sleep(1000);
      const aim = await aimAt(EDGE_BOX(BOT_TITLE));
      if (!aim || !aim.hitIsTarget) throw new Error(`Bot box not hit-testable: ${JSON.stringify(aim)}`);
      await c.evalExpr(INSTALL_RECORDER);
      return aim;
    };

    // ── 0. the instrument, before any arm ────────────────────────────────
    const aim0 = await freshPanel();
    console.log(`\n    dpr         : ${aim0.dpr}   (printed beside every coordinate row)`);
    const vis = await c.json(SELECTION_VISIBILITY);
    check('0g', 'INSTRUMENT BLINDNESS DECLARED: this element exposes NO selection to read',
      vis.found === true && vis.mode !== 'readable',
      `input type=${vis.type}, selectionStart is ${vis.mode}${vis.err ? ` (${vis.err})` : ''}. `
      + 'Chromium does not support the selection API on number inputs, so no phase-by-phase '
      + '"where did the selection die" trace is possible here and this harness does not pretend '
      + 'to one. The ONLY observable is the value after one keystroke. ⚠ A green on this row is '
      + 'the harness declaring what it CANNOT see; if it ever goes red, selections became '
      + 'readable and a far better experiment than this one is available.');

    const started = await band0();
    console.log(`        band[0] at start: ${JSON.stringify(started)}`);

    /**
     * One arm. `prep` is what the PREVIOUS visit does; everything after it is
     * identical across arms, which is what makes the arms comparable.
     */
    const runArm = async (id, label, prep) => {
      const aim = await freshPanel();
      const before = await boxState(EDGE_BOX(BOT_TITLE));
      if (before.focused !== false) throw new Error(`${id}: box already focused after a reload`);
      const modelBefore = await band0();

      const prepNote = await prep(aim);

      // ── the identical tail, every arm ──
      await blur();
      await sleep(250);
      const armed = await boxState(EDGE_BOX(BOT_TITLE));
      await c.evalExpr(RESET_TRACE);
      await clickPoint(aim);
      await sleep(350);
      const afterClick = await boxState(EDGE_BOX(BOT_TITLE));
      await typeText(ONE_KEY);
      await sleep(350);
      const afterKey = await boxState(EDGE_BOX(BOT_TITLE));
      const trace = await c.json(TRACE);
      const modelAfter = await band0();

      const replaced = afterKey.value === ONE_KEY;
      const at = insertedAt(armed.value, afterKey.value, ONE_KEY);
      const verdict = replaced ? 'REPLACED' : at >= 0 ? 'INSERTED' : 'NEITHER';
      arms.push({ id, label, verdict, armedValue: armed.value, afterKey: afterKey.value, at, prepNote });

      console.log(`\n──── ARM ${id}: ${label} ────`);
      if (prepNote) console.log(`        prep        : ${prepNote}`);
      console.log(`        model before: ${JSON.stringify(modelBefore)}`);
      console.log(`        box at click: ${JSON.stringify(armed)}`);
      console.log(`        after click : ${JSON.stringify(afterClick)}`);
      console.log(`        after "${ONE_KEY}"   : ${JSON.stringify(afterKey)}   -> ${verdict}`
        + `${at >= 0 ? `  (caret at ${at})` : ''}`);
      console.log(`        model after : ${JSON.stringify(modelAfter)}`);
      console.log(`        trace       : ${trace.map((r) => `${r.phase}(${r.isActive ? 'focused' : 'not'})`).join(' -> ')}`);
      return { verdict, armed, afterKey };
    };

    // ── ARM D — the floor. Never focused. ────────────────────────────────
    const D = await runArm('D', 'never focused at all — the census\'s floor', async () => 'nothing; the box is untouched since the reload');
    check('1a', 'ARM D REPLACES — the census\'s floor reproduces inside THIS run',
      D.verdict === 'REPLACED',
      `${JSON.stringify(D.armed.value)} + "${ONE_KEY}" -> ${JSON.stringify(D.afterKey.value)}. `
      + '⚠ A red here is not a finding about the bug: it means this run has no floor, and nothing '
      + 'below may be read as a difference between arms.');

    // ── ARM H — visited, nothing typed. The census's arm G. ──────────────
    const H = await runArm('H', 'visited, NOTHING typed — the census\'s arm G', async (aim) => {
      await clickPoint(aim);
      await sleep(300);
      return 'clicked once, typed nothing';
    });

    // ── ARM I — visited, a LEGAL value typed and committed. ──────────────
    let legalTyped = null;
    const I = await runArm('I', 'visited, a LEGAL value typed and COMMITTED', async (aim) => {
      const m = await band0();
      // A value one line INSIDE the current bot, so it is legal by the panel's
      // own law rather than by a number this harness invented.
      legalTyped = String(Math.max(2, m.bot - 1));
      await clickPoint(aim);
      await sleep(250);
      await c.evalExpr(`(${EDGE_BOX(BOT_TITLE)}).select(), 0`);
      await typeText(legalTyped);
      await sleep(350);
      const m2 = await band0();
      return `typed ${legalTyped}; model bot ${m.bot} -> ${m2.bot} (${m2.bot === Number(legalTyped) ? 'COMMITTED' : 'NOT committed'})`;
    });

    // ── ARM J — visited, a REFUSED value typed, nothing committed. ───────
    let refusedNote = null;
    const J = await runArm('J', 'visited, a REFUSED value typed — typed but NOT committed', async (aim) => {
      const m = await band0();
      await clickPoint(aim);
      await sleep(250);
      await c.evalExpr(`(${EDGE_BOX(BOT_TITLE)}).select(), 0`);
      await typeText(REFUSED_KEY);
      await sleep(350);
      const m2 = await band0();
      refusedNote = { before: m.bot, after: m2.bot, refused: m2.bot === m.bot };
      return `typed "${REFUSED_KEY}"; model bot ${m.bot} -> ${m2.bot} (${refusedNote.refused ? 'REFUSED, zero commits' : '⚠ COMMITTED — this arm is NOT the refused case'})`;
    });
    check('Jx', 'ARM J\'s premise holds — the typed value was REFUSED and the model never moved',
      refusedNote !== null && refusedNote.refused === true,
      `${JSON.stringify(refusedNote)}. ⚠ If red, arm J measured a COMMITTED value and is a `
      + 'duplicate of arm I — its verdict below says nothing about typing-without-committing.');

    // ── ARMS K and L — THE CONFOUND THIS RUN INTRODUCED ITSELF ──────────
    //
    // ⚠ FOUND BY RE-READING THE PREP CODE, NOT BY A RED ROW. Arms I and J both
    // call `.select()` before typing and arm H does not — because typing over a
    // caret would otherwise produce a scrambled value and defeat the arm. So
    // "I and J replaced, H inserted" has TWO available causes: the typing, and
    // the `select()` call sitting beside it in the same prep. **A variable that
    // rides along inside the manipulation is not controlled by varying the
    // manipulation**, and the four arms above cannot tell them apart.
    //
    //   K  visited, `.select()` called, NOTHING typed   -> isolates select() alone
    //   L  visited, typed with NO explicit select()     -> the realistic typed case
    //
    // K inserting and L replacing clears the confound and leaves TYPING as the
    // variable. K replacing means the `select()` call did the work and arms I
    // and J say nothing about typing. L is also the arm closest to what a person
    // does, since nobody calls `select()` — they click and type.
    const K = await runArm('K', 'visited, .select() called, NOTHING typed', async (aim) => {
      await clickPoint(aim);
      await sleep(250);
      await c.evalExpr(`(${EDGE_BOX(BOT_TITLE)}).select(), 0`);
      await sleep(150);
      return 'clicked, called .select(), typed nothing';
    });
    const L = await runArm('L', 'visited, typed with NO explicit select()', async (aim) => {
      const m = await band0();
      await clickPoint(aim);
      await sleep(250);
      await typeText(REFUSED_KEY);
      await sleep(350);
      const m2 = await band0();
      return `typed "${REFUSED_KEY}" with no select() call; model bot ${m.bot} -> ${m2.bot}`;
    });

    // ── ARM M — DOES THE CANONICAL FIX HOLD? ─────────────────────────────
    //
    // The five arms above give a LAW and not a mechanism: a keystroke during the
    // previous visit makes the next click select; a visit with no keystroke
    // leaves it inserting. A law is enough to write a repro and not enough to
    // choose a fix, so this arm tests the one candidate that can be tested from
    // outside the app: **the click's own `mouseup` default action collapsing the
    // selection `select()` just made.** That is the textbook cause of a
    // select-on-focus that does not stick, and its textbook remedy is to
    // `preventDefault()` the mouseup on the field.
    //
    // ⚠ THIS ARM PROVES A REMEDY, NOT A CAUSE, AND IT IS NOT THE SHIPPED APP. The
    // listener is injected from the harness onto the live element; the fix, if
    // taken, belongs in `NumberField` where every caller gets it. A green here
    // says the remedy works on arm H's exact conditions — the strongest thing
    // obtainable without editing the component, and deliberately labelled so
    // nobody reads it as the component having been fixed.
    const M = await runArm('M', 'arm H\'s conditions, with mouseup default PREVENTED (remedy probe)', async (aim) => {
      await c.evalExpr(String.raw`(() => {
        const box = ${EDGE_BOX(BOT_TITLE)};
        if (!box) return 'no-box';
        if (box.__nfMouseupGuard) return 'already';
        box.__nfMouseupGuard = (ev) => ev.preventDefault();
        box.addEventListener('mouseup', box.__nfMouseupGuard);
        return 'guarded';
      })()`);
      await clickPoint(aim);
      await sleep(300);
      return 'mouseup default prevented on the box; clicked once, typed nothing (= arm H)';
    });

    // ── ARM N — THE SCOPE, AND THIS RUN'S ABILITY TO DISCRIMINATE ────────
    //
    // ⚠ THIS ARM EXISTS BECAUSE THE FIX RETIRED THE OLD ONE. Every arm above
    // REPLACES on a fixed build, and a run in which nothing inserts cannot tell
    // a fixed app from an instrument that has stopped seeing. Row 2c used to
    // get that guarantee for free from the defect itself; it now has to be
    // earned by a gesture that MUST STILL INSERT when the fix is correct.
    //
    // There is exactly one, and it is the constraint the fix was written to
    // honour: **a click inside a box that is ALREADY FOCUSED places a caret.**
    // Preventing every mouseup would have taken that away, which is why the
    // guard is armed on mousedown and only for the click that brings the box
    // from unfocused to focused. So one row now asserts BOTH halves — that this
    // run can still see an insert, and that the fix left the deliberate caret
    // alone.
    //
    // THE SECOND CLICK AIMS AT THE LEFT EDGE, not the centre, so the caret it
    // asks for is position 0 and the resulting `"7156"` cannot be confused with
    // a stray append. `insertedAt` reports the index, so the row can say where
    // the caret went rather than only that it went somewhere.
    const N = await (async () => {
      const aim = await freshPanel();
      const cold = await boxState(EDGE_BOX(BOT_TITLE));
      if (cold.focused !== false) throw new Error('N: box already focused after a reload');
      await c.evalExpr(RESET_TRACE);
      await clickPoint(aim);            // the FOCUSING click — this one selects
      await sleep(350);
      const focused = await boxState(EDGE_BOX(BOT_TITLE));
      const caret = await c.json(String.raw`(() => {
        const el = ${EDGE_BOX(BOT_TITLE)};
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left + 3), y: Math.round(b.top + b.height / 2) };
      })()`);
      if (!caret) throw new Error('N: box vanished between the click and the aim');
      await clickPoint(caret);          // a SECOND click — already focused
      await sleep(350);
      const armed = await boxState(EDGE_BOX(BOT_TITLE));
      await typeText(ONE_KEY);
      await sleep(350);
      const afterKey = await boxState(EDGE_BOX(BOT_TITLE));
      const at = insertedAt(armed.value, afterKey.value, ONE_KEY);
      const verdict = afterKey.value === ONE_KEY ? 'REPLACED' : at >= 0 ? 'INSERTED' : 'NEITHER';
      arms.push({
        id: 'N', label: 'a SECOND click inside the ALREADY-FOCUSED box', verdict,
        armedValue: armed.value, afterKey: afterKey.value, at,
        prepNote: 'focusing click, then a click at the box\'s LEFT edge',
      });
      console.log('\n──── ARM N: a SECOND click inside the ALREADY-FOCUSED box ────');
      console.log(`        after click 1: ${JSON.stringify(focused)}`);
      console.log(`        caret aim    : ${JSON.stringify(caret)}   (left edge, not the centre)`);
      console.log(`        after click 2: ${JSON.stringify(armed)}`);
      console.log(`        after "${ONE_KEY}"    : ${JSON.stringify(afterKey)}   -> ${verdict}`
        + `${at >= 0 ? `  (caret at ${at})` : ''}`);
      return { verdict, at, armed, afterKey };
    })();

    // ── ARM S — THE OTHER AXIS OF THE SCOPE: THE SPIN BUTTON ─────────────
    //
    // ⚠ A REMEDY THAT SUPPRESSES A DEFAULT ACTION HAS TO SAY WHOSE. Chromium's
    // number input carries a spin button in its UA shadow root; events from it
    // retarget to the input, so a `mouseup` listener on the field sees the
    // arrow's mouseup too. The spin button STEPS on mousedown and STOPS ITS
    // AUTO-REPEAT in a mouseup default handler — and Blink runs a default
    // handler only when nothing called `preventDefault`. So the failure mode of
    // this fix is NOT a spinner that does nothing; it is a spinner that never
    // stops. That is what this arm watches, and it is why the second sample is
    // taken a beat later rather than immediately.
    //
    // DOWN AND NOT UP, because arm I already proved `bot - 1` is a value the
    // panel accepts, and a step the panel REFUSES would look exactly like a
    // spinner that stopped working.
    //
    // ⚠ THIS ARM CAN COME BACK UNMEASURABLE, and says so rather than failing:
    // if the value never moves at all, the pointer did not land on a spin
    // button and this instrument measured nothing. That is a different fact
    // from a runaway and the row separates them.
    const S = await (async () => {
      const aim = await freshPanel();
      if (!aim) throw new Error('S: no panel');
      const spin = await c.json(String.raw`(() => {
        const el = ${EDGE_BOX(BOT_TITLE)};
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.right - 4), y: Math.round(b.bottom - 4), w: Math.round(b.width) };
      })()`);
      if (!spin) throw new Error('S: box vanished before the aim');
      const v0 = (await boxState(EDGE_BOX(BOT_TITLE))).value;
      await clickPoint(spin);
      await sleep(600);
      const v1 = (await boxState(EDGE_BOX(BOT_TITLE))).value;
      await sleep(1400);
      const v2 = (await boxState(EDGE_BOX(BOT_TITLE))).value;
      console.log('\n──── ARM S: one click on the spin arrow of an UNFOCUSED box ────');
      console.log(`        aim         : ${JSON.stringify(spin)}   (right edge, lower half)`);
      console.log(`        value       : ${JSON.stringify(v0)} -> +600ms ${JSON.stringify(v1)}`
        + ` -> +2000ms ${JSON.stringify(v2)}`);
      return { v0, v1, v2, spin };
    })();

    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n──── the arms, one variable ────');
    console.log('        arm  what the PREVIOUS visit left behind                   verdict');
    for (const a of arms) {
      console.log(`        ${a.id.padEnd(4)} ${a.label.padEnd(52)} ${a.verdict}`
        + `   (${JSON.stringify(a.armedValue)} + "${ONE_KEY}" -> ${JSON.stringify(a.afterKey)})`);
    }

    const v = Object.fromEntries(arms.map((a) => [a.id, a.verdict]));
    check('2a', 'THE LAW IS GONE, WHICH IS THE FIX: H no longer disagrees with I',
      v.H === 'REPLACED' && v.I === 'REPLACED',
      `H (nothing typed) ${v.H}, I (legal value committed) ${v.I}. `
      + 'BEFORE THE FIX this row asserted the opposite — H INSERTED and I REPLACED, which is the '
      + 'law the packet states and the measurement is recorded there '
      + '(docs/reviews/2026-09-10-numberfield-previous-visit.md, 9/9 rows, loads 2.7-4.0). '
      + '⚠ It was CORRECT for this row to go red the moment the component was fixed: it asserted '
      + 'the defect. It is inverted rather than deleted so the pair keeps being watched — a red '
      + 'here now means H inserts again and the guard in `NumberField` has been lost or narrowed.');
    check('2b', 'J tells TYPING apart from COMMITTING',
      v.J !== undefined && (v.J === v.H || v.J === v.I),
      `J (typed, refused, zero commits) ${v.J}. Matching H (${v.H}) means COMMITTING is what `
      + `matters; matching I (${v.I}) means merely TYPING is. Both are informative; this row `
      + 'only asserts J landed on one of them.');
    check('2c', 'THIS RUN CAN STILL TELL AN INSERT FROM A REPLACE — arm N inserts, at the caret '
      + 'the pointer asked for',
      v.N === 'INSERTED' && N.at === 0,
      `N (a second click at the LEFT edge of the already-focused box) ${v.N}`
      + `${N.at >= 0 ? `, caret at ${N.at}` : ''}: `
      + `${JSON.stringify(N.armed.value)} + "${ONE_KEY}" -> ${JSON.stringify(N.afterKey.value)}. `
      + 'WHAT THIS ROW IS FOR, TWICE OVER. (1) Every other arm now REPLACES, and a run in which '
      + 'nothing inserts cannot be told apart from an instrument that has stopped seeing — so the '
      + 'discriminating population is this arm. Until the fix landed it was the DEFECT that '
      + 'played this part (arms H and K, INSERTED, recorded in '
      + 'docs/reviews/2026-09-10-numberfield-previous-visit.md); a fixed build cannot supply that '
      + 'and must not be asked to. (2) A click inside a box the author is ALREADY IN is the '
      + 'capability the fix was scoped not to take, so this is also the constraint\'s own row. '
      + '⚠ A red here is ambiguous by construction and must be read before it is believed: either '
      + 'the guard widened past the focusing click and ate the deliberate caret, or this run lost '
      + 'the ability to observe an insert — in which case every REPLACED above says nothing.');

    check('2d', 'THE FIX REACHES THE `.select()`-ONLY GESTURE TOO: K replaces',
      v.K === 'REPLACED',
      `K (select() called, nothing typed) ${v.K}. BEFORE THE FIX this row asserted K INSERTED, `
      + 'and that was the control clearing this run\'s own confound: `.select()` alone did not '
      + 'cause the replace, so arms I and J were about TYPING '
      + '(docs/reviews/2026-09-10-numberfield-previous-visit.md). That question is settled and '
      + 'cannot be re-asked on a build where nothing inserts. What the row is worth now is '
      + 'narrower and still worth having: K is the arm whose previous visit called `select()` and '
      + 'typed nothing, and it is fixed too.');
    check('2e', 'AND THE REALISTIC TYPED GESTURE REPLACES with no select() anywhere',
      v.L === 'REPLACED',
      `L (typed one digit, no select() call) ${v.L}. This is the arm closest to what a person `
      + 'does. Green here plus green on 2d leaves TYPING as the variable; red here means the '
      + 'earlier arms were carried by their select() call.');

    check('3a', 'THE REMEDY PROBE: preventing the mouseup default makes arm H select correctly',
      v.M === 'REPLACED',
      `M (arm H's conditions + mouseup preventDefault) ${v.M}, against H's ${v.H}. `
      + '⚠ This is a REMEDY probe on a listener injected by the harness — it is NOT the shipped '
      + 'component and must not be reported as one. ⚠ AND SINCE THE FIX LANDED IT DISCRIMINATES '
      + 'NOTHING: the injected listener now duplicates a guard `NumberField` already has, so M '
      + 'and H agree and this row would stay green with the probe deleted. It is kept because it '
      + 'is the arm that NAMED the remedy, and it becomes informative again the moment the '
      + 'component regresses — H red and M green would say the mechanism still holds and only the '
      + 'component lost it. Read it beside 2a, never alone.');

    check('4a', 'THE GUARD DID NOT COST THE SPIN BUTTON: one click on the arrow of an UNFOCUSED '
      + 'box steps ONCE and then stops',
      S.v1 === S.v0 ? 'UNMEASURABLE'
        : Math.abs(Number(S.v1) - Number(S.v0)) === 1 && S.v2 === S.v1,
      `${JSON.stringify(S.v0)} -> +600ms ${JSON.stringify(S.v1)} -> +2000ms ${JSON.stringify(S.v2)} `
      + `(aim ${JSON.stringify(S.spin)}). THE FAILURE MODE THIS WATCHES IS NOT AN INERT SPINNER. `
      + 'Chromium steps on mousedown, which no mouseup guard can stop; it STOPS THE AUTO-REPEAT '
      + 'in a mouseup default handler, which a mouseup `preventDefault` would skip. So a '
      + 'regression here looks like a value that keeps sliding — the +2000ms sample against the '
      + '+600ms one — and not like a value that never moved. ⚠ UNMEASURABLE, NOT PASS, when the '
      + 'value never moves at all: that means the pointer did not land on a spin button and this '
      + 'arm observed nothing. Distinguish the two before reporting either; the reverted build '
      + 'is the control, and an UNMEASURABLE on BOTH builds is this instrument, not the app.');
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok === true).length;
  const load1 = os.loadavg();
  console.log(`\n════ ${pass}/${results.length} rows PASS · ${fails.length} FAIL · `
    + `${unmeasurable.length} UNMEASURABLE · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  console.log(`     loadavg at start ${load0.map((n) => n.toFixed(2)).join(' ')} · at end ${load1.map((n) => n.toFixed(2)).join(' ')}`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok === true).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
