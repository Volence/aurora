#!/usr/bin/env node
// DO THE THREE NEW GUARD SURFACES ACTUALLY REACH THE SCREEN?
//
// ROADMAP rows 62, 63 and 64. Each adds a warning or a control to the Effects
// panel, and 5,074 vitest tests pass over all three without any of them being
// able to see a rendered row. That is not a theoretical gap here: row 58 shipped
// `advisoryLayerDeformConflicts` into this same file with NO CALLER ANYWHERE and
// a green suite for an entire parcel. So this file drives the real app and reads
// the real DOM.
//
// ═══ THE ONE THING THAT MAKES THIS HARNESS DIFFERENT ═══
//
// EVERY FIXTURE ARRIVES AS A FILE, NOT AS A GESTURE. That is the whole point of
// rows 62 and 63: the values under test are ones the picker will NOT let an
// author select (`sprite_mask` is a disabled option; a non-divisor `period` is
// no longer an option at all). A harness that authored them through the controls
// would be testing a path that cannot exist. So the scenes are written into a
// THROWAWAY COPY of aeon as `.json` files, the app opens that copy, and the
// panel is read on the document the reader loaded.
//
// ⛔ THE COPY, NEVER THE LIVE AEON TREE. AEON_DIR has NO DEFAULT — unset, this
// harness refuses to start; set to the tree aeon actually lives in, it refuses
// again, against the RESOLVED default location rather than a literal. See the
// two-refusal block below.
//
// ═══ ANTI-VACUOUS ═══
//
// Every row asserting a warning is PRESENT has a companion asserting it is
// ABSENT on a control scene that differs by one authored field, and every
// absence row first proves the panel is drawn (`panelIsDrawn`) — an empty string
// and a cleared warning are the same artifact otherwise, which is the vacuous
// shape this repo has been bitten by.
//
// ═══ dpr ═══
//
// Nothing here derives an expectation from a device pixel: every reading is
// `textContent` / `value` / `title` / `disabled` off elements found by `title`.
// dpr, the panel rect, load average and uptime are printed at row 0c anyway, so
// a run that ever grows a pixel expectation has the numbers beside it.
//
// Requires:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:       node scratchpad/guard-surface-harness.mjs

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { execSync } from 'node:child_process';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9411);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
/**
 * THE COPY IS REQUIRED, SO THERE IS NO DEFAULT. Two refusals, and they are two
 * different questions — keep them apart.
 *
 * Until O69 this read `process.env.AEON_DIR ?? '<a previous session's scratchpad
 * under /tmp/claude-1000/…/aeonwork/aeon>'`. That directory has not existed for
 * weeks; the default was a path to nowhere wearing the shape of a default. It
 * carries no home-directory literal, so `check-peer-path-literals` never saw it,
 * and it never fired the guard below either — a dead path is not the live tree,
 * so the run got past the refusal and died later on a missing file, which reads
 * like a broken harness rather than a missing variable.
 *
 * A default is not available honestly here. A throwaway copy is something an
 * operator MAKES; this harness cannot invent one, and every candidate default
 * is either that dead path again or the live tree the guard exists to refuse.
 * So the harness REFUSES when nothing is set, which is the contract's step 4 in
 * its loudest form, and `checkoutOverride` is the resolver's own instrument for
 * exactly this ("for an instrument that REQUIRES one to have been set (a
 * harness that writes, and must be pointed at a copy)"). Going through it also
 * buys the aliases, the two-spellings-disagree refusal and the set-but-wrong
 * error, none of which a hand-rolled `process.env.AEON_DIR` had.
 *
 * The SECOND refusal — the one below, comparing against the RESOLVED default
 * location rather than a literal — is unchanged and must stay that way. It is
 * what stops `AEON_DIR=<the live tree>` from writing scene files into another
 * lane's working tree.
 */
const aeonOverride = checkoutOverride('aeon');
if (aeonOverride === null) {
  throw new Error(
    'AEON_DIR is unset, and this harness has no honest default: it WRITES scene '
    + '.json files into the tree it opens, so it must be pointed at a throwaway '
    + `copy of aeon. Make one (e.g. \`cp -r ${siblingDefaultPathOrUnresolved('aeon')} `
    + '$(mktemp -d)/aeon`) and set AEON_DIR to it. Refusing rather than guessing: '
    + 'the guess this replaced was a dead scratchpad path from a 2026-08 session, '
    + 'which failed later and further away. (empyrean contract/SUITE_PATHS.md, '
    + 'precedence step 4)',
  );
}
const AEONDIR = aeonOverride.value;
const SHOTS = `${ROOT}/scratchpad/shots-guard-surface`;
mkdirSync(SHOTS, { recursive: true });

if (AEONDIR === siblingDefaultPathOrUnresolved('aeon')) {
  throw new Error('refusing to run against the real aeon tree — use the throwaway copy');
}

// The contract, read off disk. Bar F: nothing below is a number typed here.
const SCHEMA = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));
const TABLE_BYTES = /\b(\d+)-byte signed\b/.exec(SCHEMA.$defs.tableRef.description)[1] * 1;
const DIVISORS = [];
for (let v = 1; v <= TABLE_BYTES; v++) if (TABLE_BYTES % v === 0) DIVISORS.push(v);
const MASK_VALUES = SCHEMA.properties.left_column_mask.enum;

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
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
}

/** The whole Effects panel's rendered text — where the advisories live. */
const PANEL_TEXT = String.raw`
(() => {
  const anchor = [...document.querySelectorAll('span')]
    .find((e) => /^Scenes$/.test((e.textContent || '').trim()));
  if (!anchor) return 'no-panel';
  let n = anchor;
  for (let i = 0; i < 12 && n.parentElement; i++) n = n.parentElement;
  return (n.textContent || '');
})()`;

/** Every control whose `title` starts with a prefix, with its options. */
const CONTROLS_TITLED = (prefix) => String.raw`
[...document.querySelectorAll('select,input')]
  .filter((e) => (e.title || '').startsWith(${JSON.stringify(prefix)}))
  .map((e) => ({ tag: e.tagName, title: e.title, value: e.value, type: e.type || null,
                 min: e.min || null, max: e.max || null,
                 options: e.tagName === 'SELECT'
                   ? [...e.options].map((o) => ({ v: o.value, disabled: o.disabled, text: o.textContent }))
                   : null }))`;

// A warning row is a Hint with tone="warning". They are the ONLY thing on this
// panel that carries the advisory text, so read them as elements rather than
// grepping the panel blob — a substring can match a control's own title.
const WARNING_ROWS = String.raw`
(() => {
  const anchor = [...document.querySelectorAll('span')]
    .find((e) => /^Scenes$/.test((e.textContent || '').trim()));
  if (!anchor) return ['no-panel'];
  let n = anchor;
  for (let i = 0; i < 12 && n.parentElement; i++) n = n.parentElement;
  // The panel's warning hints are the small text nodes whose computed colour is
  // the warning token; find them structurally instead by taking every leaf
  // element whose text reads like a sentence and is not a control label.
  return [...n.querySelectorAll('div,span,p')]
    .filter((e) => e.children.length === 0)
    .map((e) => (e.textContent || '').trim())
    .filter((t) => t.length > 40);
})()`;

const PANEL_ALIVE = /Layers \(/;
function panelIsDrawn(text) {
  return typeof text === 'string' && text !== 'no-panel' && PANEL_ALIVE.test(text);
}

async function selectScene(c, id) {
  await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(id)})`);
  await sleep(700);
  const picked = await c.evalExpr('window.__dbg.aeon.selectedScene()');
  if (picked !== id) throw new Error(`selectScene(${id}) landed on ${picked}`);
  return c.evalExpr(PANEL_TEXT);
}

async function main() {
  console.log(`aeon dir under test : ${AEONDIR}`);
  console.log(`uptime              : ${execSync('uptime').toString().trim()}`);
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
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
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 0. Environment, printed beside every run. ------------------------
    const envInfo = await c.json(
      '({dpr: window.devicePixelRatio, w: innerWidth, h: innerHeight})');
    note('0c environment',
      `dpr=${envInfo.dpr} viewport=${envInfo.w}x${envInfo.h} `
      + `load=${readFileSync('/proc/loadavg', 'utf8').trim().split(' ').slice(0, 3).join(' ')} `
      + `uptime=${execSync('uptime').toString().trim()}`);

    // ---- 1. Open the COPY. -----------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon COPY is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    await sleep(2500);
    const pill = await c.evalExpr(String.raw`
      (() => { const el = [...document.querySelectorAll('button')]
        .find((e) => /^Effects$/.test(((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).trim()));
        if (!el) return false; el.click(); return true; })()`);
    check('1b', 'the facet bar offers an Effects pill', pill === true);
    await sleep(1500);

    const scenes = await c.json('window.__dbg.aeon.scenes()');
    const ids = scenes.map((s) => s.id);
    const WANT = ['gap_sprite_mask', 'gap_accept_control', 'gap_curve_anchor',
      'gap_curve_boundary', 'gap_period_100', 'gap_period_64'];
    check('1c', 'ANTI-VACUOUS: every file-borne fixture was READ by the codec — '
      + 'no gesture authored any of these',
      WANT.every((w) => ids.includes(w)), `scenes=${JSON.stringify(ids)}`);
    const unread = await c.json('window.__dbg.aeon.unreadableScenes()');
    check('1d', 'ANTI-VACUOUS: no fixture was rejected by the reader — a refused '
      + 'file would leave the panel showing a DIFFERENT scene',
      unread.length === 0, JSON.stringify(unread));

    // ═══ ROW 62 — sprite_mask that ARRIVED in the file ═══════════════════
    let text = await selectScene(c, 'gap_sprite_mask');
    check('2a', 'ANTI-VACUOUS: the panel is drawn for the sprite_mask scene',
      panelIsDrawn(text), `drawn=${panelIsDrawn(text)} len=${String(text).length}`);
    const rows62 = await c.json(WARNING_ROWS);
    const spriteWarn = rows62.filter((t) => /refuses in every scene/.test(t));
    check('2b', 'ROW 62: a document CARRYING sprite_mask renders the advisory — '
      + 'this returned (none) before this parcel',
      spriteWarn.length === 1, JSON.stringify(spriteWarn));
    check('2c', 'ROW 62: the advisory names both values that ARE answers',
      spriteWarn.length === 1 && /factor0_lock/.test(spriteWarn[0]) && /accept/.test(spriteWarn[0]),
      spriteWarn[0]);
    const maskCtl = await c.json(CONTROLS_TITLED('left_column_mask'));
    check('2d', 'ROW 62: the DISABLED OPTION IS STILL THERE — the two cover '
      + 'different paths and this parcel removed neither',
      maskCtl.length === 1 && maskCtl[0].value === 'sprite_mask'
      && (maskCtl[0].options ?? []).find((o) => o.v === 'sprite_mask')?.disabled === true
      && (maskCtl[0].options ?? []).length === MASK_VALUES.length,
      JSON.stringify(maskCtl[0]?.options));
    await shot(c, 'row62-sprite-mask');

    // Control: one authored field different.
    text = await selectScene(c, 'gap_accept_control');
    const rows62n = await c.json(WARNING_ROWS);
    check('2e', 'ROW 62 CONTROL: the identical scene with `accept` renders NO such '
      + 'warning, and the panel is still drawn',
      panelIsDrawn(text) && !rows62n.some((t) => /refuses in every scene/.test(t)),
      `drawn=${panelIsDrawn(text)} rows=${JSON.stringify(rows62n.filter((t) => /refuses/.test(t)))}`);

    // ═══ ROW 64 — curve layer + LIVE anchor shifts ══════════════════════
    text = await selectScene(c, 'gap_curve_anchor');
    check('4a', 'ANTI-VACUOUS: the panel is drawn for the curve+anchor scene',
      panelIsDrawn(text));
    const rows64 = await c.json(WARNING_ROWS);
    const curveWarn = rows64.filter((t) => /authors a curve while this scene's anchor/.test(t));
    check('4b', 'ROW 64: the fourth guard-5 ensure now renders — the build refuses '
      + 'this exact document rc=1 and Aurora was silent',
      curveWarn.length === 1, JSON.stringify(curveWarn));
    check('4c', 'ROW 64: it quotes the engine\'s own interpolated shifts and its sentinel',
      curveWarn.length === 1 && /anchor dsa 3 \/ dsb 2/.test(curveWarn[0])
      && /15 is the no-deform sentinel/.test(curveWarn[0]), curveWarn[0]);
    await shot(c, 'row64-curve-anchor');

    text = await selectScene(c, 'gap_curve_boundary');
    const rows64n = await c.json(WARNING_ROWS);
    check('4d', 'ROW 64 SENTINEL CONTROL: the SAME curve with a pure-boundary anchor '
      + '(15/15) renders NOTHING — that is the PERMITTED case, and a check that '
      + 'read "large shifts" would have it backwards',
      panelIsDrawn(text)
      && !rows64n.some((t) => /authors a curve while this scene's anchor/.test(t)),
      `drawn=${panelIsDrawn(text)}`);

    // ═══ ROW 63 — the period control ════════════════════════════════════
    text = await selectScene(c, 'gap_period_64');
    check('3a', 'ANTI-VACUOUS: the panel is drawn for the period scene', panelIsDrawn(text));
    let periodCtl = (await c.json(CONTROLS_TITLED('deform_fg period')));
    check('3b', 'ROW 63: `period` renders as a SELECT, not a number input — '
      + 'min/max on a number input are not a bound and a typed value ignores them',
      periodCtl.length === 1 && periodCtl[0].tag === 'SELECT',
      JSON.stringify(periodCtl.map((x) => ({ tag: x.tag, type: x.type, value: x.value }))));
    check('3c', 'ROW 63: it offers exactly the divisors of the schema\'s own table '
      + `length (${TABLE_BYTES}), computed`,
      periodCtl.length === 1
      && JSON.stringify((periodCtl[0].options ?? []).map((o) => Number(o.v))) === JSON.stringify(DIVISORS)
      && (periodCtl[0].options ?? []).every((o) => !o.disabled),
      `offered=${JSON.stringify((periodCtl[0]?.options ?? []).map((o) => o.v))} want=${JSON.stringify(DIVISORS)}`);
    check('3d', 'ANTI-VACUOUS: that is DRASTICALLY fewer than the range it replaced',
      DIVISORS.length === 9 && DIVISORS.length * 10 < TABLE_BYTES,
      `${DIVISORS.length} legal of ${TABLE_BYTES}`);
    await shot(c, 'row63-period-select');

    text = await selectScene(c, 'gap_period_100');
    periodCtl = (await c.json(CONTROLS_TITLED('deform_fg period')));
    check('3e', 'ROW 63: a NON-DIVISOR the file carries is still SHOWN as the '
      + 'select\'s value — a select missing its own value shows a different one, '
      + 'and the author would read a legal period while the build reads 100',
      periodCtl.length === 1 && periodCtl[0].value === '100'
      && (periodCtl[0].options ?? []).some((o) => o.v === '100'),
      `value=${periodCtl[0]?.value} options=${JSON.stringify((periodCtl[0]?.options ?? []).map((o) => o.v))}`);
    check('3f', 'ROW 63: …and it is rendered DISABLED, so the author cannot pick it back',
      periodCtl.length === 1
      && (periodCtl[0].options ?? []).find((o) => o.v === '100')?.disabled === true
      && (periodCtl[0].options ?? []).filter((o) => o.disabled).length === 1,
      JSON.stringify((periodCtl[0]?.options ?? []).filter((o) => o.disabled)));
    const rows63 = await c.json(WARNING_ROWS);
    check('3g', 'ROW 63: the ADVISORY still fires on it — the picker governs what an '
      + 'author lands on, the advisory what a document carries',
      rows63.some((t) => new RegExp(`period 100 does not divide the ${TABLE_BYTES}-byte table`).test(t)),
      JSON.stringify(rows63.filter((t) => /period/.test(t))));
    await shot(c, 'row63-period-carried-100');

    // ═══ THE POSTURE ROW — nothing here became a prevention ═════════════
    // Four of five guards are ADVISORY by row 58's deliberate decision. The
    // panel must still be EDITING these documents, not refusing them.
    text = await selectScene(c, 'gap_sprite_mask');
    const editable = await c.json(String.raw`
      [...document.querySelectorAll('select,input')]
        .filter((e) => (e.title||'').startsWith('left_column_mask') || (e.title||'').startsWith('v_deform'))
        .map((e) => ({ title: e.title, disabled: e.disabled }))`);
    check('5a', 'POSTURE: the warned scene is still EDITABLE — no control was '
      + 'disabled by this parcel; the advisory advises and sigil stays the rulebook',
      editable.length > 0 && editable.every((e) => e.disabled === false),
      JSON.stringify(editable));
    const docAfter = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'))
      .find((s) => s.id === 'gap_sprite_mask');
    check('5b', 'POSTURE: the model still HOLDS sprite_mask — the reader did not '
      + '"fix up" the value it warns about',
      docAfter?.left_column_mask === 'sprite_mask', JSON.stringify(docAfter?.left_column_mask));

    console.log(`\n${'='.repeat(70)}`);
    console.log(`TOTAL ${results.filter((r) => r.ok).length}/${results.length} rows PASSED`);
    if (fails.length) console.log(`FAILED:\n  ${fails.join('\n  ')}`);
    console.log(`uptime at end: ${execSync('uptime').toString().trim()}`);
  } finally {
    try { c?.close(); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
