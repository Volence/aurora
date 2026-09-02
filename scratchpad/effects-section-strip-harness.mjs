#!/usr/bin/env node
// THE PERMANENT SECTION STRIP — EW-SHAPE-STRIP, the owner's
// `three_sub_tabs_plus_section_strip` ruling (decisions.jsonl d-26b).
//
// ============================================================================
// WHY A SECOND HARNESS BESIDE effects-section-picker-harness
// ============================================================================
//
// That one proves wave 1's picker EXISTS, is first in the column, moves the
// model, and says the right sentence. All fifteen of its rows are taken with
// the column AT THE TOP. This one proves the two things the owner's shape adds,
// and both are only visible somewhere else:
//
//        1. THE STRIP IS PERMANENT — painted, and hit-testable, from anywhere
//           in the Effects tab, INCLUDING at the bottom of the column and at the
//           raster binding ~1,600px down, which is the control it captions.
//
//        2. THE TWO WIRING CONDITIONS ARE STATED SEPARATELY, so an author can
//           see WHICH of the two their section fails — condition 1 wants a
//           preset split, condition 2 wants one line of aeon, and one collapsed
//           chip cannot say which.
//
// ============================================================================
// ⚠ THE TRAP THIS HARNESS EXISTS BECAUSE OF — MEASURED, NOT REASONED
// ============================================================================
//
// Before the strip, with the column scrolled to the bottom, the picker's box sat
// at top = -2,635px, entirely outside its scroller. AND:
//
//        checkVisibility()          → true
//        getClientRects().length    → 1
//        elementFromPoint(centre)   → null
//
// Two thirds of this repo's standard paint trio go GREEN on an element scrolled
// 2,635px out of view. So every permanence row below compares the strip's RECT
// AGAINST THE SCROLLER'S OWN BOX and requires the strict `elementFromPoint`;
// `checkVisibility` is recorded in the detail as evidence and is never the gate.
// (`scratchpad/effects-strip-delta-probe.mjs` is the measurement.)
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE SCROLL DID NOT HAPPEN. Every permanence row prints the scroller's
//     `scrollTop` and asserts it is non-zero and at the end, so a strip that is
//     "still visible" because nothing moved fails.
//
//   • THE APP AGREES WITH ITSELF. The verdicts the two condition rows print are
//     re-derived IN THIS PROCESS from the aeon copy's own files, never imported
//     from Aurora's module.
//
//   • THE TWO ROWS SAY THE SAME THING. Row [3b] requires the two verdict marks
//     to DIFFER on section 0 (own preset ✓, threaded ✗) — a strip printing one
//     verdict twice passes a "both rows exist" check and fails this one.
//
//   • THE UNREADABLE CASE IS A GATE, NOT AN ADVISORY. Row [4a] renames aeon's
//     act descriptor inside the COPY, reopens the project, and requires the
//     verdicts to read "could not read" while the per-section raster select
//     stays ENABLED. Then it renames it back.
//
// ⚠ THIS HARNESS MUTATES THE COPY (row [4a] renames one file and puts it back).
//   Run it against a FRESH extract. ⚠ NO EMULATOR, EVER.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:effects-section-strip
//
//   PLANT=rot-strip … find the strip by an attribute nothing carries. [2a] must
//                     catch it and the run must ABORT.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, renameSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9458);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 92);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-effects-section-strip`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';

// ── THE INDEPENDENT SECOND DERIVATION ────────────────────────────────────────
// Deliberately NOT an import of section-wiring.ts — the point is to check the
// app against aeon's FILES, not against Aurora's own module.
const DESC = `${AEONDIR}/games/sonic4/data/levels/ojz/act1/act_descriptor.emp`;
const LIB = `${AEONDIR}/games/sonic4/data/effects/ojz_effects.emp`;
function independentDerivation() {
  const desc = readFileSync(DESC, 'utf8');
  const lib = readFileSync(LIB, 'utf8');
  const bind = {};
  const chunks = desc.split(/\bojz_sec\s*\(\s*sec\s*:\s*(\d+)/g);
  for (let i = 1; i < chunks.length; i += 2) {
    const m = /effects\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(chunks[i + 1] ?? '');
    if (m) bind[Number(chunks[i])] = m[1];
  }
  const counts = {};
  for (const v of Object.values(bind)) counts[v] = (counts[v] ?? 0) + 1;
  const own = Object.keys(bind).map(Number).filter((s) => counts[bind[s]] === 1).sort((a, b) => a - b);
  const threaded = [];
  const call = /raster\s*:\s*ojz_act1_sec_raster\s*\(\s*sec\s*:\s*(\d+)/g;
  let m;
  while ((m = call.exec(lib)) !== null) threaded.push(Number(m[1]));
  threaded.sort((a, b) => a - b);
  const sharers = (s) => Object.keys(bind).map(Number)
    .filter((k) => bind[k] === bind[s]).sort((a, b) => a - b);
  return { bind, own, threaded, sharers };
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

const STRIP = PLANT === 'rot-strip'
  ? `document.querySelector('[data-effects-section-strip-XXX]')`
  : `document.querySelector('[data-effects-section-strip]')`;

/**
 * THE PERMANENCE MEASUREMENT, at whatever scroll the column is at.
 *
 * `insideScroller` is the gate; `visible` and `rects` are recorded because they
 * are the two that do NOT discriminate (see the header).
 */
const STRIP_PAINT = String.raw`(() => {
  const p = ${STRIP};
  if (!p) return { found: false };
  let sc = p.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const b = p.getBoundingClientRect();
  const cb = sc ? sc.getBoundingClientRect() : null;
  const s = p.querySelector('select');
  const sb = s ? s.getBoundingClientRect() : null;
  const hit = sb ? document.elementFromPoint(
    Math.round(sb.left + sb.width / 2), Math.round(sb.top + sb.height / 2)) : null;
  return {
    found: true,
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) },
    col: cb ? { top: Math.round(cb.top), bottom: Math.round(cb.bottom) } : null,
    insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
    hitIsSelect: hit === s,
    sectionShown: s ? s.value : null,
    // Recorded, NEVER the gate — both of these were true on the defect.
    visible: typeof p.checkVisibility === 'function' ? p.checkVisibility() : null,
    rects: p.getClientRects().length,
    scroll: sc ? { top: Math.round(sc.scrollTop), h: Math.round(sc.clientHeight),
                   sh: Math.round(sc.scrollHeight) } : null,
  };
})()`;

const SCROLL_END = String.raw`(() => {
  const p = ${STRIP};
  let sc = p ? p.parentElement : null;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  if (!sc) return -1;
  sc.scrollTop = sc.scrollHeight;
  return Math.round(sc.scrollTop);
})()`;

/** Both condition rows: mark, label, detail, and paint, in order. */
const CONDITIONS = String.raw`(() => {
  const p = ${STRIP};
  if (!p) return { found: false };
  const rows = [...p.querySelectorAll('[data-effects-wiring-condition]')].map((r) => {
    const b = r.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    const parts = [...r.children].map((k) => (k.innerText || '').trim());
    return {
      n: r.getAttribute('data-effects-wiring-condition'),
      mark: parts[0], label: parts[1], detail: parts[2],
      titleLen: (r.title || '').length,
      title: (r.title || '').slice(0, 90),
      rects: r.getClientRects().length,
      visible: typeof r.checkVisibility === 'function' ? r.checkVisibility() : null,
      hitInside: !!(hit && (hit === r || r.contains(hit))),
    };
  });
  return { found: true, rows };
})()`;

const SET_SELECT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;
const STRIP_SELECT = String.raw`(() => { const p = ${STRIP}; return p ? p.querySelector('select') : null; })()`;

/**
 * SHOW ONE OF THE THREE JOBS — added by EW-SHAPE-TABS (d-26b), which re-parented
 * this column's panels under three sub-tabs.
 *
 * ⚠ WHY THIS HARNESS NEEDED A LINE AT ALL. Every row below is still about the
 * STRIP, which is outside the tabs and unchanged. But two of them are taken
 * somewhere else in the column — at the raster binding, and at the bottom of a
 * column tall enough for "permanent" to mean anything — and the raster binding
 * now lives on the COLOUR tab. On Parallax that control is not in the DOM at
 * all (unmounted, not hidden), and the tab does not scroll on arrival, which is
 * that parcel's measured result. So the permanence rows moved to the tab that
 * still has both properties; nothing about what they assert changed.
 */
const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/** The per-section raster binding at the bottom of RASTER BAND PRESETS. */
const RASTER_SELECT = String.raw`
  [...document.querySelectorAll('select')]
    .find((s) => /^Which raster band preset this section uses \(rasterRef\)/.test(s.title || '')) || null`;

async function main() {
  const t0 = Date.now();
  const truth = independentDerivation();
  console.log('=== effects-section-strip harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log('    INDEPENDENT DERIVATION (this process, from aeon\'s own files):');
  console.log(`      own preset: [${truth.own.join(',')}]   threaded: [${truth.threaded.join(',')}]`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', RUN.electron, RUN.main],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  /** The file row [4b]/[4c] currently has moved aside, or null. */
  let renamed = null;
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

    const openProject = async () => {
      await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
      for (let i = 0; i < 40; i++) {
        const s = await c.json('window.__dbg.aeon.state()').catch(() => null);
        if (s && s.open) return s;
        await sleep(400);
      }
      return null;
    };
    const st = await openProject();
    check('1a', 'the COPIED aeon project is open, with the nine sections this act has',
      !!(st && st.open && st.sections === 9), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2500);
    check('1b', 'the Effects facet mounts', (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1500);
    // The COLOUR job: the tab that carries the raster binding this strip
    // captions, and the one whose column is still taller than the window.
    check('1c', 'the Colour sub-tab is reachable — the raster binding lives there since d-26b',
      (await c.evalExpr(SUBTAB('colour'))) === 'ok');
    await sleep(1100);

    // ---- 2. PERMANENCE. --------------------------------------------------
    const top = await c.json(STRIP_PAINT);
    check('2a', 'the strip is FOUND and painted with the column at the top',
      top.found === true && top.insideScroller === true && top.hitIsSelect === true,
      top.found === false
        ? 'NO ELEMENT MATCHED — finder rot, or the strip is not rendered'
        : JSON.stringify(top));
    if (top.found !== true) throw new Error('strip not found — nothing below can be measured');

    // Open every collapsible so the column is at the height an author who has
    // been working in it has. A short column cannot fail a permanence row.
    const opened = await c.evalExpr(String.raw`(() => {
      const col = ${STRIP}.parentElement;
      const before = col.scrollHeight;
      for (const h of [...col.querySelectorAll('div')].filter((d) => d.style && d.style.cursor === 'pointer')) {
        h.click();
      }
      return before;
    })()`);
    await sleep(2000);

    const at = await c.evalExpr(SCROLL_END);
    await sleep(700);
    const bottom = await c.json(STRIP_PAINT);
    check('2b', 'AT THE BOTTOM OF THE COLUMN the strip is still inside the scroller and hit-testable',
      bottom.insideScroller === true && bottom.hitIsSelect === true
      && bottom.scroll.top > 0 && bottom.scroll.top >= bottom.scroll.sh - bottom.scroll.h - 2
      && bottom.scroll.sh > bottom.scroll.h * 2,
      `${JSON.stringify(bottom)}\n        column was ${opened}px before expanding; scrolled to ${at}`
      + `\n        ⚠ the two that do NOT discriminate: checkVisibility=${bottom.visible} `
      + `rects=${bottom.rects} — both were TRUE at top=-2635 before this parcel`);

    // AT THE SECOND BINDING — the control the strip captions.
    const rasterAt = await c.json(String.raw`(() => {
      const s = ${RASTER_SELECT};
      if (!s) return { found: false };
      s.scrollIntoView({ block: 'center' });
      return { found: true, label: (s.parentElement.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30) };
    })()`);
    await sleep(600);
    const atRaster = await c.json(STRIP_PAINT);
    // ⚠ THE TRAVEL CLAUSE IS DERIVED NOW, NOT A LITERAL 500 (EW-SHAPE-TABS).
    // It exists so that "the strip is still visible because nothing moved"
    // fails, and 500 was a proxy for the 1,600px this control used to sit
    // down the single column. On the Colour sub-tab the same binding is 395px
    // down, so the literal started refusing a strip that had genuinely
    // survived the scroll. The property is: the column has moved by MORE THAN
    // THE STRIP'S OWN HEIGHT, which is exactly the condition under which a
    // non-sticky strip is entirely above the scrollport (its bottom would be
    // at colTop - scrollTop + height < colTop).
    check('2c', 'AT THE RASTER BINDING — the control it captions — the strip is still painted',
      rasterAt.found === true && atRaster.insideScroller === true && atRaster.hitIsSelect === true
      && atRaster.scroll.top > atRaster.rect.height,
      `raster select: ${JSON.stringify(rasterAt)}\n        ${JSON.stringify(atRaster)}`);

    // ---- 3. THE TWO CONDITIONS, APART. -----------------------------------
    await c.evalExpr(SET_SELECT(STRIP_SELECT, 0));
    await sleep(900);
    const c0 = await c.json(CONDITIONS);
    check('3a', 'the strip carries TWO condition rows, both painted and hit-testable',
      c0.found === true && c0.rows.length === 2
      && c0.rows.every((r) => r.rects > 0 && r.visible !== false && r.hitInside === true)
      && c0.rows[0].label === 'own preset' && c0.rows[1].label === 'threaded',
      JSON.stringify(c0.rows));

    // Section 0 owns its preset and nothing threads it: the two marks DIFFER,
    // and that difference is the whole point of splitting the chip.
    check('3b', 'on section 0 the two verdicts DIFFER — ✓ own preset, ✗ threaded — matching this '
      + 'process\'s own parse',
      c0.rows.length === 2 && c0.rows[0].mark === '✓' && c0.rows[1].mark === '✗'
      && c0.rows[0].detail === truth.bind[0]
      && c0.rows[1].detail === 'nothing threads ojz_act1_sec_raster(sec: 0)'
      && truth.own.includes(0) && !truth.threaded.includes(0),
      `${JSON.stringify(c0.rows.map((r) => `${r.mark} ${r.label} ${r.detail}`))}`
      + `\n        independent: own=[${truth.own.join(',')}] threaded=[${truth.threaded.join(',')}]`
      + ` bind[0]=${truth.bind[0]}`);

    // Section 7 shares its record: condition 1 fails, and condition 2 is STILL
    // ASKED rather than short-circuited.
    await c.evalExpr(SET_SELECT(STRIP_SELECT, 7));
    await sleep(900);
    const c7 = await c.json(CONDITIONS);
    check('3c', 'on a SHARED section condition 1 fails NAMING the sharers, and condition 2 is still asked',
      c7.rows.length === 2 && c7.rows[0].mark === '✗' && c7.rows[1].mark === '✗'
      && c7.rows[0].detail === `${truth.bind[7]}, shared with sections `
        + `${truth.sharers(7).filter((s) => s !== 7).join(' and ')}`
      && c7.rows[1].detail === 'nothing threads ojz_act1_sec_raster(sec: 7)'
      && !truth.own.includes(7),
      `${JSON.stringify(c7.rows.map((r) => `${r.mark} ${r.label} ${r.detail}`))}`
      + `\n        independent: bind[7]=${truth.bind[7]} sharers=[${truth.sharers(7).join(',')}]`);

    // Section 5 is the one that is both.
    await c.evalExpr(SET_SELECT(STRIP_SELECT, 5));
    await sleep(900);
    const c5 = await c.json(CONDITIONS);
    check('3d', 'on the one section that is BOTH, both marks are ✓ and the second names the call',
      c5.rows.length === 2 && c5.rows[0].mark === '✓' && c5.rows[1].mark === '✓'
      && c5.rows[1].detail === `${truth.bind[5]} threads ojz_act1_sec_raster(sec: 5)`
      && truth.own.includes(5) && truth.threaded.includes(5),
      JSON.stringify(c5.rows.map((r) => `${r.mark} ${r.label} ${r.detail}`)));

    // ⚠ INDEXES GUARDED. A poison that DELETES a condition row must make this
    // row FAIL, not throw: a throw aborts the run and the rows below it are
    // never taken, which reads as a truncation rather than as a verdict.
    check('3e', 'each condition row carries its own contract on `title` — stated, not just marked',
      c5.rows.length === 2 && c5.rows.every((r) => r.titleLen > 250)
      && /^CONDITION 1 of 2/.test(c0.rows[0]?.title ?? '')
      && /^CONDITION 2 of 2/.test(c0.rows[1]?.title ?? ''),
      JSON.stringify(c5.rows.map((r) => ({ n: r.n, titleLen: r.titleLen, head: r.title.slice(0, 40) }))));

    // ---- 4. IT ADVISES; IT DOES NOT GATE. --------------------------------
    await c.evalExpr(SET_SELECT(STRIP_SELECT, 0));
    await sleep(900);
    const notGated = await c.json(String.raw`(() => {
      const s = ${RASTER_SELECT};
      if (!s) return { found: false };
      return { found: true, disabled: s.disabled, options: s.options.length };
    })()`);
    check('4a', 'the raster binding stays ENABLED on a section that fails a condition — it advises',
      notGated.found === true && notGated.disabled === false && notGated.options > 1,
      JSON.stringify(notGated));

    // THE UNREADABLE CASE — and it is run TWICE, once per file, because the two
    // conditions read DIFFERENT files and must degrade independently. Hiding one
    // file and finding both rows blind would mean the strip answers neither
    // whenever it can answer only one, which is a "could not read" that has
    // quietly become "not allowed".
    //
    // ⚠ THE FIRST VERSION OF THIS ROW EXPECTED BOTH MARKS TO GO `?` AND WENT
    // RED, correctly: with only the descriptor gone the effects library is still
    // there, so condition 2 is genuinely answerable and genuinely `no`. The row
    // now asserts that ASYMMETRY, which is the stronger claim.
    const blindRun = async (missing, label) => {
      renameSync(missing, `${missing}.harness-bak`);
      renamed = missing;
      await c.send('Page.reload');
      await sleep(4000);
      await waitDbg();
      const s2 = await openProject();
      await sleep(2500);
      await c.evalExpr(clickByText('/^Effects$/'));
      await sleep(1500);
      await c.evalExpr(SUBTAB('colour'));
      await sleep(1000);
      const got = await c.json(String.raw`(() => {
        const conds = ${CONDITIONS};
        const s = ${RASTER_SELECT};
        const adv = document.querySelector('[data-effects-section-advisory]');
        const sets = document.querySelector('[data-effects-act-sets]');
        return {
          conds, rasterDisabled: s ? s.disabled : null, rasterFound: !!s,
          advisory: adv ? (adv.innerText || '').replace(/\s+/g, ' ').trim() : null,
          actSets: sets ? (sets.innerText || '').trim() : null,
        };
      })()`);
      renameSync(`${missing}.harness-bak`, missing);
      renamed = null;
      return { open: !!(s2 && s2.open), label, ...got };
    };

    const noDesc = await blindRun(DESC, 'act_descriptor.emp');
    check('4b', 'with the DESCRIPTOR unreadable, condition 1 reads "could not read" — never "not '
      + 'allowed" — while condition 2, whose file is still there, still answers',
      noDesc.open === true
      && noDesc.conds.found === true && noDesc.conds.rows.length === 2
      && noDesc.conds.rows[0].mark === '?'
      && noDesc.conds.rows[0].detail === 'could not read act_descriptor.emp'
      && noDesc.conds.rows[1].mark !== '?'
      && noDesc.rasterFound === true && noDesc.rasterDisabled === false
      && noDesc.advisory !== null && /could not read/.test(noDesc.advisory)
      && !/you cannot|not allowed|may not|is refused/i.test(noDesc.advisory)
      // The act-wide sets line is ABSENT rather than printing an empty set:
      // "I read the file and it says none" and "I could not read the file" must
      // not render the same.
      && noDesc.actSets === null,
      `${JSON.stringify(noDesc.conds.rows.map((r) => `${r.mark} ${r.label} ${r.detail}`))}`
      + `\n        raster select disabled = ${noDesc.rasterDisabled}; act-sets line = `
      + `${JSON.stringify(noDesc.actSets)}\n        advisory: ${String(noDesc.advisory).slice(0, 200)}`);

    const noLib = await blindRun(LIB, 'ojz_effects.emp');
    check('4c', 'and with the LIBRARY unreadable it is the OTHER way round — the two conditions '
      + 'degrade independently',
      noLib.open === true
      && noLib.conds.found === true && noLib.conds.rows.length === 2
      && noLib.conds.rows[0].mark !== '?'
      && noLib.conds.rows[1].mark === '?'
      && noLib.conds.rows[1].detail === 'could not read ojz_effects.emp'
      && noLib.rasterFound === true && noLib.rasterDisabled === false
      // The act-wide line still prints the set it COULD derive and marks the
      // other `?` rather than printing an empty one.
      //
      // ⚠ AND IT MUST NOT CONTRADICT THE ROW ABOVE IT. The first version of the
      // strip printed `own preset none` here while the condition row two lines
      // up read `✓ own preset OJZ_Preset_Sec0` — `eligibleSections` folds in
      // library-readability. This clause is that defect's gate on the screen.
      && noLib.actSets !== null && / · threaded \?$/.test(noLib.actSets)
      && noLib.actSets.startsWith(`act: own preset ${truth.own.join(',')} ·`),
      `${JSON.stringify(noLib.conds.rows.map((r) => `${r.mark} ${r.label} ${r.detail}`))}`
      + `\n        raster select disabled = ${noLib.rasterDisabled}; act-sets line = `
      + `${JSON.stringify(noLib.actSets)}`);

    // ---- 5. THE CAPTURE FOR THE OWNER. -----------------------------------
    // ⚠ He ruled the SHAPE from an ASCII mockup and an argument; d-26b's own
    // note says the visual detail is UNRATIFIED. So the built strip is captured
    // for him, scrolled DOWN — the state the whole parcel is about — rather
    // than at the top, where wave 1's capture already shows it.
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();
    await openProject();
    await sleep(2500);
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1500);
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1000);
    await c.evalExpr(SET_SELECT(STRIP_SELECT, 0));
    await sleep(600);
    // ⚠ SCROLLED, AND THE SCROLL IS READ BACK. The point of the capture is the
    // strip standing still while the column moves under it, so a shot taken at
    // scrollTop 0 would show him the one state that was never in question. An
    // "expand everything" pass is NOT used here — those headers TOGGLE, so it
    // shuts whatever was already open and the column can end up shorter.
    const shotScroll = await c.evalExpr(String.raw`(() => {
      const col = ${STRIP}.parentElement;
      col.scrollTop = Math.round(col.scrollHeight * 0.55);
      return JSON.stringify({ top: Math.round(col.scrollTop), sh: Math.round(col.scrollHeight) });
    })()`);
    await sleep(800);
    console.log(`    capture at  : scroll ${shotScroll}`);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/effects-section-strip-scrolled.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/effects-section-strip-scrolled.png`);
  } finally {
    // THE COPY IS PUT BACK EVEN IF A ROW THREW MID-RENAME — a harness that
    // leaves the subject mutilated makes the NEXT run's numbers a fiction.
    if (renamed && existsSync(`${renamed}.harness-bak`)) renameSync(`${renamed}.harness-bak`, renamed);
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
