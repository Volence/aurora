#!/usr/bin/env node
// ===========================================================================
// THE VERTICAL BOB'S CONTROL, AS RENDERED — ROADMAP row 99, first split.
// ===========================================================================
//
// WHY THIS EXISTS RATHER THAN MORE NODE ROWS. The node suite proves what
// `BOB_AMPLITUDE_OPTIONS` CONTAINS. It cannot prove that a `<select>` built from
// it is on screen, that the two ladder rows appear when the toggle is switched
// and vanish when it is switched back, or that no shift exponent leaks into the
// rendered text — and "the discontinuity is unreachable through the UI" is a
// claim about the UI. `test/formats/effects-scene-bob.test.ts` measures the
// values; this file measures the WIDGET.
//
// THE ONE THING IT IS NOT FOR. Column geometry — whether the three new rows push
// the column past the fold — is `effects-column-harness.mjs`'s question, and it
// was answered with a CONTROL RUN on the stashed tree rather than by this file:
//   before  Scene section 395px, column overflow 613px, headroom 0px
//   after   Scene section 478px, column overflow 697px, headroom 0px
// +83px of section, +84px of overflow, into a column that ALREADY overflowed and
// already had zero headroom (its own [r9] reports 0px on both trees). Every row
// that fails there fails on both trees. Recorded here because a number with no
// control is an accusation, not a measurement.
//
// ===========================================================================
// ROWS, AND WHY EACH CAN SEE ITS DEFECT
// ===========================================================================
//   [B1] the Bob row is on screen while the scene does NOT bob, and the two
//        ladder rows are NOT. From the rendered label spans, so a row that
//        renders with no label (or renders and is display:none) is not counted.
//   [B2] the toggle offers exactly two options and neither is a number — the
//        proof that OFF IS A STATE and not a ladder position.
//   [B3] switched on, the amplitude row offers exactly the legal ladder: the
//        option VALUES are read off the DOM and compared to the ladder, and the
//        hole (0 and 9..14) must appear in no option's value. This is the row
//        the whole presentation exists for.
//   [B4] every amplitude option's TEXT is a pixel count, ascending — no exponent
//        reaches the screen, and the list reads small-to-large.
//   [B5] the period row offers exactly the legal periods, labelled in seconds or
//        minutes, fastest first.
//   [B6] the readout under the rows says pixels AND time.
//   [B7] switching the toggle back to `none` REMOVES both ladder rows — the
//        state really is a state, not a disabled pair.
//   [B8] nowhere in the rendered Scene section does the text `bob_shift`,
//        `bob_period` or a bare shift exponent appear as a VALUE an author could
//        read as the setting. (Titles/tooltips are allowed to name the wire
//        field; visible row text is not.)
//
// RED-FIRST (each plant names ONE judge; a plant whose judge stays green fails
// the run):
//   PLANT=hole      splice an `0` option into the amplitude select  -> B3
//   PLANT=exponent  relabel an amplitude option as its shift        -> B4
//   PLANT=noperiod  delete the period row after it appears          -> B5
//   PLANT=sticky    re-add the ladder rows after switching off      -> B7
//
// ===========================================================================
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a WRITABLE COPY> node scratchpad/effects-bob-harness.mjs
//   AEON_DIR=... PLANT=hole node scratchpad/effects-bob-harness.mjs
//
// AEON_DIR MUST BE A WRITABLE COPY, never a sibling's live checkout:
//   git -C ../aeon archive <rev> games/sonic4/data project.json | tar -x -C <dir>
// This file presses no Ctrl+S and executes no save, but the app opens the tree
// for writing and a peer lane's working tree is not ours to open.
// ===========================================================================

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9433);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR;
if (!AEONDIR) throw new Error('AEON_DIR is required and must be a WRITABLE COPY, not ../aeon');
const SHOTS = `${ROOT}/scratchpad/shots-effects-bob`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';
const PLANT_JUDGE = { hole: 'B3', exponent: 'B4', noperiod: 'B5', sticky: 'B7' };

/**
 * THE CONTRACT'S OWN NUMBERS, read from the VENDORED SCHEMA at run time — not
 * typed here, and not imported from the module under test. A harness that
 * asserted `[1,2,4,…]` would be asserting a list it wrote; a harness that
 * imported `BOB_AMPLITUDE_OPTIONS` would be asserting the DOM equals the module
 * that built the DOM. The schema is the third party both of them answer to.
 */
const SCHEMA = JSON.parse(
  await import('node:fs').then(fs => fs.promises.readFile(
    `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8')),
);
const SHIFT_ARMS = SCHEMA.properties.bob_shift.anyOf;
const SENTINEL = SHIFT_ARMS.find(a => typeof a.const === 'number').const;
const LADDER_ARM = SHIFT_ARMS.find(a => typeof a.minimum === 'number');
const LADDER = { min: LADDER_ARM.minimum, max: LADDER_ARM.maximum };
const PERIOD = {
  min: SCHEMA.properties.bob_period.minimum,
  max: SCHEMA.properties.bob_period.maximum,
};
const AMPLITUDE_BASE = Number(
  /peak excursion (\d+) >> bob_shift px/.exec(SCHEMA.properties.bob_shift.description)[1]);
const LEGAL_SHIFTS = Array.from({ length: LADDER.max - LADDER.min + 1 }, (_, i) => LADDER.min + i);
const HOLE = Array.from({ length: SENTINEL + 1 }, (_, i) => i)
  .filter(v => v !== SENTINEL && !LEGAL_SHIFTS.includes(v));
const LEGAL_PERIODS = Array.from({ length: PERIOD.max - PERIOD.min + 1 }, (_, i) => PERIOD.min + i);

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
      if (page) return page;
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
function report(id, name, detail) {
  console.log(`  ..  [${id}] ${name}\n        ${detail}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-effects-bob/${name}.png`);
}

/**
 * THE SCENE FORM'S ROWS, read structurally.
 *
 * `column-layout`'s `Field` renders `<label-span><control>`; the Scene section is
 * the one whose header text starts "Scene —". Rows are collected with their
 * VISIBLE text and, for a `<select>`, its option values and texts — so a row
 * that renders but is hidden contributes nothing an author can see.
 */
const FORM_PROBE = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const header = [...document.querySelectorAll('div')].filter(isHeader)
    .find(h => /^SCENE\s*—/i.test((h.textContent || '').trim()));
  if (!header) return { error: 'no "Scene —" section header on screen' };
  const box = header.parentElement && header.parentElement.parentElement;
  if (!box) return { error: 'the Scene header has no section box' };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const rows = [];
  for (const sel of box.querySelectorAll('select, input')) {
    if (!visible(sel)) continue;
    const row = sel.closest('div');
    const labelSpan = row && [...row.querySelectorAll('span')]
      .find(s => s.getBoundingClientRect().left < sel.getBoundingClientRect().left);
    rows.push({
      label: labelSpan ? (labelSpan.textContent || '').trim() : null,
      tag: sel.tagName,
      value: sel.value,
      title: sel.getAttribute('title') || '',
      options: sel.tagName === 'SELECT'
        ? [...sel.options].map(o => ({ value: o.value, text: (o.textContent || '').trim() }))
        : null,
    });
  }
  // Every piece of text the section paints, for the leak check.
  return { rows, text: (box.innerText || '').trim(), boxHeight: box.getBoundingClientRect().height };
})()`;

/** Pick a value in the labelled `<select>` and fire React's change. */
const setSelect = (label, value) => String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const header = [...document.querySelectorAll('div')].filter(isHeader)
    .find(h => /^SCENE\s*—/i.test((h.textContent || '').trim()));
  const box = header && header.parentElement && header.parentElement.parentElement;
  if (!box) return 'no scene box';
  const sel = [...box.querySelectorAll('select')].find((s) => {
    const row = s.closest('div');
    const span = row && [...row.querySelectorAll('span')]
      .find(x => x.getBoundingClientRect().left < s.getBoundingClientRect().left);
    return span && (span.textContent || '').trim() === ${JSON.stringify(label)};
  });
  if (!sel) return 'no such labelled select';
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, ${JSON.stringify(String(value))});
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const rowFor = (probe, label) => (probe.rows || []).find(r => r.label === label) ?? null;

async function main() {
  console.log('\n=== THE VERTICAL BOB CONTROL, AS RENDERED — ROADMAP row 99 ===');
  console.log(`aeon copy: ${AEONDIR}   plant: ${PLANT || 'none'}`);
  console.log(`contract: ladder ${LADDER.min}..${LADDER.max}, sentinel ${SENTINEL}, `
    + `hole [${HOLE.join(',')}], period ${PERIOD.min}..${PERIOD.max}, base ${AMPLITUDE_BASE}\n`);
  if (PLANT && !PLANT_JUDGE[PLANT]) throw new Error(`unknown plant ${PLANT}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1920x1200x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    const page = await waitForTarget();
    c = cdp(page.webSocketDebuggerUrl);
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
    check('i0', 'window.__dbg exists (a VITE_AURORA_DEBUG=1 build) [instrument]', haveDbg);
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('i1', 'the aeon project is open, with sections [instrument]',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    await sleep(2500);
    const clickEffects = String.raw`
(() => { const el = [...document.querySelectorAll('button')]
  .find(e => /^Effects$/.test(((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).trim()));
  if (!el) return false; el.click(); return true; })()`;
    const clicked = await c.evalExpr(clickEffects);
    await sleep(1800);
    check('i2', 'the Effects facet is mounted [instrument]', clicked === true, `click=${clicked}`);
    if (clicked !== true) throw new Error('could not reach the Effects facet');

    // ---- OFF: the arrival state, and the state every saved scene is in -----
    const off = await c.json(FORM_PROBE);
    check('i3', 'the Scene form was found, with labelled rows [instrument]',
      !off.error && (off.rows || []).length > 3,
      off.error ?? `${off.rows.length} rows: ${off.rows.map(r => r.label).join(', ')}`);
    if (off.error) throw new Error(off.error);
    await shot(c, `bob-off${PLANT ? `-${PLANT}` : ''}`);

    const bobOff = rowFor(off, 'Bob');
    check('B1', 'the Bob row is on screen, and the two ladder rows are NOT, while off',
      bobOff !== null && rowFor(off, 'Sway') === null && rowFor(off, 'Period') === null,
      `Bob=${bobOff ? JSON.stringify(bobOff.value) : 'ABSENT'}  `
      + `Sway=${rowFor(off, 'Sway') ? 'present' : 'absent'}  `
      + `Period=${rowFor(off, 'Period') ? 'present' : 'absent'}`);

    check('B2', 'the toggle offers exactly two options, NEITHER of them a number',
      bobOff !== null && bobOff.options.length === 2
        && bobOff.options.every(o => !/^-?\d+$/.test(o.text)),
      bobOff ? JSON.stringify(bobOff.options) : 'no Bob row');

    // ---- ON ---------------------------------------------------------------
    const on1 = await c.evalExpr(setSelect('Bob', 'on'));
    await sleep(700);
    if (PLANT === 'hole') {
      await c.evalExpr(String.raw`
(() => { const sel = [...document.querySelectorAll('select')]
  .find(s => [...s.options].some(o => /px$/.test((o.textContent||'').trim())));
  if (!sel) return false;
  const o = document.createElement('option'); o.value = '0'; o.textContent = '256 px';
  sel.appendChild(o); return true; })()`);
    }
    if (PLANT === 'exponent') {
      await c.evalExpr(String.raw`
(() => { const sel = [...document.querySelectorAll('select')]
  .find(s => [...s.options].some(o => /px$/.test((o.textContent||'').trim())));
  if (!sel) return false; sel.options[0].textContent = String(sel.options[0].value); return true; })()`);
    }
    if (PLANT === 'noperiod') {
      await c.evalExpr(String.raw`
(() => { const spans = [...document.querySelectorAll('span')]
  .filter(s => (s.textContent||'').trim() === 'Period');
  if (!spans.length) return false;
  for (const s of spans) { const row = s.closest('div'); if (row) row.remove(); } return true; })()`);
    }
    const onProbe = await c.json(FORM_PROBE);
    check('i4', 'switching the toggle to "sway" revealed new rows [instrument]',
      on1 === true && (onProbe.rows || []).length > off.rows.length,
      `set=${on1}; ${off.rows.length} rows -> ${(onProbe.rows || []).length}`);
    await shot(c, `bob-on${PLANT ? `-${PLANT}` : ''}`);

    const sway = rowFor(onProbe, 'Sway');
    const period = rowFor(onProbe, 'Period');

    const swayValues = sway ? sway.options.map(o => Number(o.value)) : [];
    check('B3', 'the amplitude ladder offers EXACTLY the legal shifts — the hole is unreachable',
      sway !== null
        && swayValues.length === LEGAL_SHIFTS.length
        && LEGAL_SHIFTS.every(v => swayValues.includes(v))
        && HOLE.every(v => !swayValues.includes(v))
        && !swayValues.includes(SENTINEL),
      sway === null ? 'no Sway row' : `values ${JSON.stringify(swayValues)}; `
        + `legal ${JSON.stringify(LEGAL_SHIFTS)}; hole ${JSON.stringify(HOLE)} must be absent; `
        + `sentinel ${SENTINEL} must be absent`);

    const swayTexts = sway ? sway.options.map(o => o.text) : [];
    const swayPx = swayTexts.map(t => /^(\d+) px$/.exec(t)).map(m => (m ? Number(m[1]) : NaN));
    check('B4', 'every amplitude option reads as PIXELS, ascending — no exponent on screen',
      sway !== null
        && swayPx.every(n => Number.isFinite(n))
        && swayPx.every((n, i) => i === 0 || n > swayPx[i - 1])
        && sway.options.every(o => (AMPLITUDE_BASE >> Number(o.value)) === Number(/^(\d+) px$/.exec(o.text)?.[1])),
      sway === null ? 'no Sway row' : JSON.stringify(swayTexts));

    const periodValues = period ? period.options.map(o => Number(o.value)) : [];
    const periodTexts = period ? period.options.map(o => o.text) : [];
    check('B5', 'the period ladder offers exactly the legal periods, in TIME, fastest first',
      period !== null
        && periodValues.length === LEGAL_PERIODS.length
        && LEGAL_PERIODS.every(v => periodValues.includes(v))
        && periodValues[0] === PERIOD.min
        && periodTexts.every(t => /^(\d+(\.\d)? s|\d+m \d+s)$/.test(t)),
      period === null ? 'no Period row' : `${JSON.stringify(periodValues)} / ${JSON.stringify(periodTexts)}`);

    const readout = /(\d+) px peak, one sway every ([^\n]+)/.exec(onProbe.text || '');
    check('B6', 'the row says what the bob DOES, in pixels and time',
      readout !== null, readout ? readout[0] : `no readout in:\n${(onProbe.text || '').slice(0, 400)}`);

    // ---- BACK OFF ---------------------------------------------------------
    const off2set = await c.evalExpr(setSelect('Bob', 'none'));
    await sleep(700);
    if (PLANT === 'sticky') {
      await c.evalExpr(String.raw`
(() => { const spans = [...document.querySelectorAll('span')]
  .filter(s => (s.textContent||'').trim() === 'Bob');
  if (!spans.length) return false;
  const row = spans[0].closest('div');
  const clone = row.cloneNode(true);
  clone.querySelector('span').textContent = 'Sway';
  row.parentElement.insertBefore(clone, row.nextSibling);
  return true; })()`);
    }
    const off2 = await c.json(FORM_PROBE);
    check('B7', 'switching back to none REMOVES both ladder rows (a state, not a disable)',
      off2set === true && rowFor(off2, 'Sway') === null && rowFor(off2, 'Period') === null
        && rowFor(off2, 'Bob') !== null,
      `set=${off2set}; rows now: ${(off2.rows || []).map(r => r.label).join(', ')}`);

    check('B8', 'no wire field name and no bare exponent is painted as a VALUE in the form',
      !/bob_shift|bob_period/.test(onProbe.text || ''),
      `scene section text contains bob_shift/bob_period: `
      + `${/bob_shift|bob_period/.test(onProbe.text || '')}`);

    report('r1', 'the Scene section box height, off and on',
      `${off.boxHeight}px off -> ${onProbe.boxHeight}px on (+${(onProbe.boxHeight - off.boxHeight).toFixed(0)}px)`);
    report('r2', 'the amplitude ladder as an author sees it',
      swayTexts.join('  |  '));
    report('r3', 'the period ladder as an author sees it', periodTexts.join('  |  '));

    // ---- verdict ----------------------------------------------------------
    const gated = results.filter(r => r.ok !== null);
    console.log(`\n${gated.filter(r => r.ok).length}/${gated.length} gated rows passed`);
    if (PLANT) {
      const judge = results.find(r => r.id === PLANT_JUDGE[PLANT]);
      const red = judge && judge.ok === false;
      console.log(`PLANT=${PLANT} judge [${PLANT_JUDGE[PLANT]}] went ${red ? 'RED — good' : 'GREEN — THE PLANT PROVED NOTHING'}`);
      process.exitCode = red ? 0 : 1;
      return;
    }
    if (fails.length) {
      console.log('FAILING ROWS:');
      for (const f of fails) console.log(`  ${f}`);
      process.exitCode = 1;
    }
  } finally {
    try { c && c.close(); } catch { /* closing */ }
    killTree(child);
  }
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e.message); process.exitCode = 1; });
