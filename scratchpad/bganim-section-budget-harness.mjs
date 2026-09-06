#!/usr/bin/env node
// DOES THE PANEL ACTUALLY SAY WHICH BUDGET IS BINDING, IN THE RUNNING APP?
//
// The node suite proves `bandBudget` computes the ROM-section budget and that
// every door refuses on the tighter of the two. It cannot see one pixel of the
// readout that is supposed to tell an AUTHOR that, and the readout is the whole
// author-facing half of the parcel: "you have 47 slots" with no reason is a
// number an author argues with.
//
// ═══ THE DEFECTS THIS IS BUILT TO CATCH ═══
//
// 1. A LINE THAT NEVER RENDERS. The section readout is a second `<Hint>` under
//    a `doc !== null && budget.byteSlotsRemaining !== null` guard inside a
//    CollapsibleSection that arrives COLLAPSED. Every one of those can be false
//    while the provider is perfect, and the suite would stay green: a panel
//    that prints one budget and computes two is exactly the state this parcel
//    found the app in.
//
// 2. THE BLOB LINE VANISHING. Both budgets have to be on screen — the answer to
//    "why can I not add this" is WHICH of the two ran out, and a reader cannot
//    see that from one number. A regression that replaced the blob line rather
//    than joining it would read as a success in every unit test.
//
// 3. THE WRONG BUDGET IN THE CREATION FORM. "From new art" prints a free-slot
//    count beside the Add button. It must be the BINDING one. The DOM cannot
//    settle which budget a number came from when they agree, so this row reads
//    the model back through `window.__dbg.aeon.bandBudget()` and requires the
//    two budgets to DISAGREE on the document under test before it believes the
//    screen (aeon's shipped document is such a document, which is why it is the
//    subject).
//
// ═══ WHAT IT DOES NOT ESTABLISH (bar 3, stated up front) ═══
//
//   • Rows 1 and 2 (project open, the Effects pill) are INSTRUMENT CHECKS. They
//     would pass with the section readout entirely absent.
//   • It reads text and the model. It does not judge layout, overflow or
//     legibility; the column-height harnesses are the instrument for that.
//   • It drives ONE document — aeon's shipped act. The unmeasurable arm
//     (`binding: 'unmeasurable'`) needs a two-band default_off act, which no
//     document on this machine has and which this harness does not author.
//
// ═══ IT MUST NOT WRITE TO A PEER'S TREE ═══
//
// `AEON_DIR` is another lane's LIVE working tree. This harness opens it and
// clicks nothing that edits; row 5 hashes the override file before and after
// and FAILS on any difference, so "read-only" is measured rather than intended.
//
//   VITE_AURORA_DEBUG=1 npm run build
//   ELECTRON_BIN=<a tree with node_modules>/node_modules/.bin/electron \
//     node scratchpad/bganim-section-budget-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const OVERRIDE_FILE = `${AEONDIR}/games/sonic4/data/editor_bg_override.json`;
const SHOTS = `${ROOT}/scratchpad/shots-bganim-section-budget`;
mkdirSync(SHOTS, { recursive: true });

// ═══ EXPECTATIONS ARE DERIVED FROM THE VENDORED CONTRACT ═══
// The same JSON the codec reads. A number typed here would be a second copy of
// a bound nothing in this repo could see go stale.
const CONTRACT = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
const K = (n) => CONTRACT.constants[n].value;
const CEILING = K('BGANIM_SECTION_CEILING');
const COUNT_BYTES = K('BGANIM_COUNT_BYTES');
const RECORD_BYTES = K('BGANIM_RECORD_BYTES');
const BYTES_PER_SLOT = K('BGANIM_BYTES_PER_SLOT');
const VIEW_COUNT = K('BGANIM_VIEW_COUNT');
const VIEW_PERIOD = K('BGANIM_VIEW_DERIVED_PERIOD_PX');
const TILE_CAPACITY = K('BG_TILE_CAPACITY');

/** aeon's formula, recomputed here from the contract — the independent witness. */
function sectionBytes(nBands, slots, nViews) {
  const table = COUNT_BYTES + RECORD_BYTES * nBands;
  return table + nViews * table + slots * BYTES_PER_SLOT;
}
function slotsAllowed(nBands, nViews) {
  const table = COUNT_BYTES + RECORD_BYTES * nBands;
  return Math.max(0, Math.floor((CEILING - table - nViews * table) / BYTES_PER_SLOT));
}

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
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res); ws.addEventListener('error', rej);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error
      ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate',
      { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} `
        + `${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

// A CollapsibleSection renders NO children while shut, so every readout below
// comes back absent unless this runs first. Opened by clicking its header, the
// way a person opens it.
//
// TWO WAYS THIS HARNESS GOT A FALSE "THE FEATURE IS MISSING", both recorded
// because both looked exactly like the defect it exists to find:
//
//  1. bganim-band-harness.mjs finds the header by `text-transform: uppercase` +
//     `letter-spacing: 1px`. That recipe returned `no-section` on a panel whose
//     section was plainly on screen. The styling is not the contract; the TEXT
//     is. (That harness also still looks for "BG animation bands", which the
//     rename to "Tile animations" retired - so it is blind here today.)
//  2. Clicking every ancestor of the title in one pass TOGGLES THE SECTION
//     TWICE: the header opens it and its wrapper shuts it again. Worse, a
//     `document.body.innerText` read taken immediately after a click is taken
//     before React has re-rendered, so the toggle looks like a no-op and the
//     loop walks on. ONE CLICK PER ATTEMPT, and the verification happens back in
//     node after a settle.
const CLICK_TITLE = (titleRe, level) => String.raw`
(() => {
  const all = [...document.querySelectorAll('div,span,button')];
  const hits = all.filter((e) => ${titleRe}.test((e.textContent || '').replace(/\s+/g, ' ').trim()));
  if (hits.length === 0) {
    return { clicked: false, saw: all.map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0 && t.length < 60).slice(-40) };
  }
  let el = hits[hits.length - 1];          // the deepest match IS the title node
  for (let i = 0; i < ${level} && el.parentElement; i++) el = el.parentElement;
  el.click();
  return { clicked: true, tag: el.tagName };
})()`;

/**
 * Click the title, settle, and ask `present()` whether the body is showing.
 * Walks OUT one ancestor per attempt because the clickable header is not always
 * the text node itself; stops the moment the body appears, so no attempt can
 * toggle a section that a previous attempt already opened.
 */
async function openSection(c, titleRe, present) {
  if (await present()) return { opened: true, via: 'already-open' };
  let last = null;
  for (let level = 0; level < 4; level++) {
    last = await c.json(CLICK_TITLE(titleRe, level));
    if (last.clicked !== true) return { opened: false, ...last };
    await sleep(700);
    if (await present()) return { opened: true, via: `${last.tag} at level ${level}` };
  }
  return { opened: false, ...last, why: 'clicked the title and 3 ancestors; the body never appeared' };
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

/** Every visible line of text in the effects column, normalised. */
const SCREEN_TEXT = String.raw`
[...document.querySelectorAll('div,span,p')]
  .filter(e => e.children.length === 0 || [...e.children].every(c => ['STRONG','SPAN','B','I'].includes(c.tagName)))
  .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim())
  .filter(t => t.length > 0)`;

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> scratchpad/shots-bganim-section-budget/${name}.png`);
}
const fileHash = () => createHash('sha256').update(readFileSync(OVERRIDE_FILE)).digest('hex');

async function main() {
  console.log(`\nDERIVED FROM THE VENDORED CONTRACT (${CONTRACT.source.repo}@${CONTRACT.source.commit.slice(0, 7)}):`);
  console.log(`  BGANIM_SECTION_CEILING = ${CEILING}   COUNT = ${COUNT_BYTES}   RECORD = ${RECORD_BYTES}`);
  console.log(`  BYTES_PER_SLOT = ${BYTES_PER_SLOT}   VIEW_COUNT = ${VIEW_COUNT}   VIEW_PERIOD = ${VIEW_PERIOD}`);
  console.log(`  BG_TILE_CAPACITY = ${TILE_CAPACITY}\n`);

  const hashBefore = fileHash();

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
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon (INSTRUMENT CHECK). --------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the aeon project is open, with sections [instrument check]',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');

    // ---- 2. Reach the panel (INSTRUMENT CHECK). --------------------------
    await sleep(2000);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill [instrument check]', clicked === true);
    await sleep(1200);
    // ⚠ THE PANEL IS BEHIND A SUB-TAB, and this cost a run. The Effects facet
    // has three of them (d-26b) and `parallax` is the default, so clicking the
    // Effects pill alone reaches a column in which BgAnimBandPanel is NOT
    // MOUNTED AT ALL. The DOM then reads exactly like "the readout does not
    // render", which is the verdict this harness exists to give — so the miss
    // had to be diagnosed rather than believed. `Tile anim` is the tab's label
    // (providers/effects-sub-tabs).
    await sleep(1200);
    const tabbed = await c.evalExpr(clickByText('/^Tile anim$/'));
    check('2a2', 'the Effects facet offers a "Tile anim" sub-tab [instrument check]',
      tabbed === true, String(tabbed));
    await sleep(2500);
    const before2b = await c.json(SCREEN_TEXT);
    note('2b-dump', 'what the effects column shows before the section is opened',
      JSON.stringify(before2b.slice(-45)));
    const hasBlobLine = async () => (await c.json(SCREEN_TEXT))
      .some((t) => /^Blob \d+\/\d+ tiles/.test(t));
    const opened = await openSection(c, '/^Tile animations \\(\\d+\\/\\d+\\)$/', hasBlobLine);
    check('2b', 'the tile-animation section is on screen and open [instrument check]',
      opened.opened === true, JSON.stringify(opened).slice(0, 700));
    await sleep(600);

    // ---- 3. THE MODEL, and the independent recomputation. ----------------
    const budget = await c.json('window.__dbg.aeon.bandBudget()');
    const bands = await c.json('window.__dbg.aeon.bands()');
    console.log(`\n        model: ${JSON.stringify(budget)}`);
    console.log(`        bands: ${JSON.stringify(bands)}\n`);

    // The twins are emitted only for a single-band `default_off` act at the
    // derived period. `bands()` does not expose `default_off`, so the harness
    // infers the view count from the SIZE the model reports rather than
    // assuming one — and then checks that inference against the formula.
    const slots = bands.reduce((n, b) => n + b.tileCount, 0);
    const withTwins = sectionBytes(bands.length, slots, VIEW_COUNT);
    const without = sectionBytes(bands.length, slots, 0);
    const views = budget.sectionBytes === withTwins ? VIEW_COUNT
      : budget.sectionBytes === without ? 0 : null;
    check('3a', 'the section size the app reports is aeon\'s formula, recomputed here',
      views !== null,
      `app ${budget.sectionBytes} B; formula gives ${without} B with no twins and `
      + `${withTwins} B with ${VIEW_COUNT}`);
    if (views === null) throw new Error('the section size does not match the formula');
    note('3b', `this act emits ${views} debug view twin(s)`,
      views === VIEW_COUNT ? 'so it is a single default_off band at the derived period' : '');

    const expectedByteFree = slotsAllowed(bands.length, views) - slots;
    check('3c', 'byteSlotsRemaining is the ceiling\'s allowance minus what the act already animates',
      budget.byteSlotsRemaining === expectedByteFree,
      `app ${budget.byteSlotsRemaining}, recomputed ${expectedByteFree}`);

    // ANTI-VACUOUS, and the whole reason this document is the subject: the two
    // budgets must DISAGREE here, or every row below would pass on an app that
    // models one of them.
    check('3d', 'ON THIS DOCUMENT THE BYTE BUDGET IS THE TIGHTER ONE (anti-vacuous)',
      budget.byteSlotsRemaining < budget.tileSlotsRemaining && budget.binding === 'bytes',
      `blob leaves ${budget.tileSlotsRemaining} free slot(s); the ROM section admits `
      + `${budget.byteSlotsRemaining} more animated slot(s); binding = ${budget.binding}`);
    check('3e', 'the spendable figure is the tighter one, not the blob\'s',
      budget.slotsRemaining === budget.byteSlotsRemaining
      && budget.slotsRemaining !== budget.tileSlotsRemaining,
      `slotsRemaining ${budget.slotsRemaining}`);

    // ---- 4. THE SCREEN. --------------------------------------------------
    const lines = await c.json(SCREEN_TEXT);
    const blobLine = lines.find((t) => /^Blob \d+\/\d+ tiles/.test(t));
    const romLine = lines.find((t) => /^ROM section /.test(t));
    check('4a', 'the BLOB budget line is still on screen (both budgets, not one)',
      blobLine !== undefined && blobLine.includes(`${budget.tileSlotsRemaining} free`),
      blobLine ?? 'NO LINE MATCHING /^Blob \\d+\\/\\d+ tiles/ ON SCREEN');
    check('4b', 'the ROM SECTION budget line is on screen at all',
      romLine !== undefined,
      romLine ?? 'NO LINE MATCHING /^ROM section / ON SCREEN — the readout did not render');
    if (romLine !== undefined) {
      check('4c', 'it prints the size and the ceiling the model holds',
        romLine.includes(`${budget.sectionBytes}/${budget.sectionCeiling} bytes`), romLine);
      check('4d', 'it prints how many MORE animated slots fit',
        new RegExp(`\\b${budget.byteSlotsRemaining} more animated slot`).test(romLine), romLine);
      check('4e', 'and it says WHICH budget is binding, in words',
        /this is the binding budget/.test(romLine)
        && romLine.includes(`${budget.tileSlotsRemaining} free blob slot`), romLine);
    }

    // The creation form's own free count must be the BINDING one. Its section
    // arrives collapsed, so open it first.
    const hasCostLine = async () => (await c.json(SCREEN_TEXT))
      .some((t) => /^costs \d+ slots? ·/.test(t));
    const openedNew = await openSection(c, '/^New tile animation$/', hasCostLine);
    await sleep(600);
    const lines2 = await c.json(SCREEN_TEXT);
    const costLine = lines2.find((t) => /^costs \d+ slots? ·/.test(t));
    check('4f', 'the "From new art" note prints the BINDING free count and names the reason',
      costLine !== undefined
      && new RegExp(`\\b${budget.slotsRemaining} free`).test(costLine)
      && /ROM section is the limit/.test(costLine),
      costLine ?? `NO "costs N slots" NOTE ON SCREEN (New tile animation section: `
        + `${JSON.stringify(openedNew).slice(0, 400)})`);

    await shot(c, 'section-budget');

    // ---- 5. THE PEER'S TREE IS UNTOUCHED. --------------------------------
    await sleep(500);
    check('5a', 'the live override file is byte-identical: this harness wrote nothing to aeon',
      fileHash() === hashBefore, `${hashBefore.slice(0, 12)} -> ${fileHash().slice(0, 12)}`);
  } finally {
    try { c?.close(); } catch { /* closing a dead socket */ }
    await killTree(child);
  }

  console.log(`\n════ ${results.filter((r) => r.ok).length}/${results.length} passed ════`);
  if (fails.length > 0) {
    console.log('FAILING:');
    for (const f of fails) console.log(`  ${f}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e.message); process.exit(2); });
