#!/usr/bin/env node
// CAN AN AUTHOR ACTUALLY AUTHOR A BgAnim BAND, IN THE RUNNING APP?
//
// The node suite has ~4,400 tests over this feature and cannot see one pixel of
// it. It cannot tell whether the Effects pill exists, whether the band panel
// mounts, whether the driver dropdown has options in it, whether the Promote
// button is reachable, or — the one this harness was built for — whether
// clicking Promote reaches the STORE. Every row below drives the REAL UI:
// pointer clicks on real elements, real keystrokes into real inputs, real
// Ctrl+Z, and then reads the MODEL back through `window.__dbg.aeon`.
//
// ═══ THE THREE DEFECTS IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. AN EDIT THAT NEVER REACHES THE PROJECT. `getActiveLevel` builds a fresh
//    S4Level VIEW per gesture; a band command REPLACES the document rather than
//    mutating it, so `level.bgOverride = applyWithBand(...)` on a plain data
//    field lands in a throwaway object. On screen that is INDISTINGUISHABLE from
//    a correctly-refused operation: the button depresses, nothing changes, no
//    error. Section 5 clicks Promote and reads `__dbg.aeon.bands()`.
//
// 2. A DROPDOWN THAT RENDERS EMPTY. Every constraint on this surface is derived
//    from the vendored consumer contract at module load. A derivation that
//    yielded undefined renders a `<select>` with zero `<option>`s, which looks
//    exactly like a panel that has not finished loading — and no node test of
//    the derivation would notice, because it imports the same module and gets
//    the same undefined. Rows 4a/4b count the DOM's options and name one.
//
// 3. A DEAD BUTTON WITH NO EXPLANATION. aeon's live document ships at 448/448
//    tiles, so "Add band" is unavailable there at every size. The panel's whole
//    layout follows from that. Section 6 proves the app on the LIVE tree shows
//    the free-slot count and a reason, and that PROMOTE is available on the same
//    document — a greyed control beside a working one, not a broken panel.
//
// ═══ A CLOCK NOBODY ASKED FOR ═══
//
// docs/reviews/2026-08-22-preview-posture-ruling.md and the MapViewport
// measurement (37/37: 1602 rAF ticks against 0 repaints over 5s idle) leave
// aeon's viewport with NO idle repaints, and this parcel must not spend that.
// Section 8 sits on the Effects facet with the band panel open for 3s and
// asserts zero map repaints while the page is provably still painting.
//
// ═══ WHICH ROWS DO NOT DISCRIMINATE (bar 3, stated up front) ═══
//
//   • 2a/2b (the pill and the panel headings) would pass on any project with the
//     Effects facet, band panel or not. They are INSTRUMENT CHECKS for the rows
//     below, not findings; 2b names this panel's own heading so it at least
//     cannot pass on the scene panel alone.
//   • 3a (the document loaded) is a precondition. It is reported as a row so a
//     run against a tree without `editor_bg_override.json` reads as "could not
//     measure" rather than silently making 5a–7c vacuous — every one of those
//     rows aborts the run if 3a fails.
//   • 8b (the rAF counter advanced) proves only that the page is alive. It is
//     the anti-vacuous companion to 8a, which is the actual claim.
//   • 9a (nothing was saved) is a property of this harness, not of the app: it
//     asserts the aeon tree's file is untouched, which would also be true if
//     every gesture above had failed. Its value is that it lets the run be
//     re-run; it is not evidence about the feature.
//
// Every other row asserts a MODEL fact that moved, with the instrument's sight
// of its subject asserted first.
//
// ═══ RED-FIRST, 2026-08-22 ═══
//
// The write-back accessor in `state/projectStore.ts`'s `getActiveLevel` was
// replaced with a no-op setter, the app REBUILT, and this harness re-run — the
// defect being that a band edit lands in a throwaway view. 30 → 25, with 5c/5d/
// 5f/5g/7c red. Restored, rebuilt, 30/30.
//
// THAT RUN FOUND A WEAKNESS IN THIS FILE, which is the reason to run poisons at
// all. Three rows reported PASS over a promotion that never happened: 5e ("the
// blob did not grow" — trivially true of a no-op), 7a ("Ctrl+Z removes the band
// again" — 0 → 0 → 0) and 7b ("byte-for-byte what it started as" — the hash
// never moved). Each now carries the precondition that the promotion LANDED, so
// the same poison takes down 8 rows rather than 5. A row's verdict must not
// depend on a reader noticing that a different row went red.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed and `saveAeonProject` is
// never called, so the aeon tree is left exactly as found — row 9a hashes the
// file before and after to say so. The store is dirtied, which is why the run
// ends by reloading the page.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/bganim-band-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9394);
// ROOT defaults to the tree this harness FILE lives in, never a hardcoded path.
// A pinned worktree path is a landmine: run from the main clone it silently
// serves the WORKTREE's dist/, so a "re-verified on the merged tree" run is
// actually re-verifying the branch.
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
// The electron BINARY and the app ROOT are separate on purpose: a git worktree
// has no node_modules of its own.
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const OVERRIDE_FILE = `${AEONDIR}/games/sonic4/data/editor_bg_override.json`;
const SHOTS = `${ROOT}/scratchpad/shots-bganim-band`;
mkdirSync(SHOTS, { recursive: true });

// ═══ EXPECTATIONS ARE DERIVED FROM THE VENDORED CONTRACT, NOT TYPED IN ═══
// The same JSON the codec reads its constants out of. A number typed here would
// be a second copy of a bound that the contract-drift test cannot see.
const CONTRACT = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
const DRIVERS = Object.keys(CONTRACT.drivers).filter((k) => !k.startsWith('$'));
const MAX_BANDS = CONTRACT.constants.BGANIM_MAX_BANDS.value;
const TILE_CAPACITY = CONTRACT.constants.BG_TILE_CAPACITY.value;
const TILE_BYTES = CONTRACT.constants.TILE_BYTES.value;
const PHASE_BANKS = CONTRACT.constants.BGANIM_PHASE_BANKS.value;

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
  console.log(`        shot → scratchpad/shots-bganim-band/${name}.png`);
}

// A React-controlled <input>/<select> ignores a plain `el.value = x`: React's
// synthetic onChange never fires. The native setter + a bubbling input/change
// event is what a real keystroke does from React's point of view — not a
// shortcut past the component, the only way to reach it from outside.
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

// NOTE the .trim(): a concatenated haystack of "Effects " does not match an
// anchored /^Effects$/, which once reported a PASSING feature as a failure.
const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

/** A control's disabled state and its title — "why is this off", read off screen. */
const CONTROL_BY_TEXT = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return null;
  return { text: (el.textContent || '').trim(), disabled: !!el.disabled, title: el.title || '' };
})()`;

const SELECT_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

/**
 * Open a CollapsibleSection by its title.
 *
 * ITS HEADER IS A `<div onClick>`, NOT A BUTTON (ui/CollapsibleSection.tsx:61) —
 * the first version of section 6 clicked `button` and silently found nothing,
 * then judged a section it had never opened. `el.click()` on the div dispatches a
 * real bubbling click, which is exactly what React's delegated handler listens
 * for, so this is a real gesture and not a state poke.
 */
const OPEN_SECTION = (titleRe) => String.raw`
(() => {
  const head = [...document.querySelectorAll('div')]
    .find((d) => d.style.cursor === 'pointer'
      && ${titleRe}.test((d.textContent || '').trim()));
  if (!head) return 'no-header';
  head.click();
  return 'clicked';
})()`;
const INPUT_BY_TITLE = (re) => `[...document.querySelectorAll('input')].find((e) => ${re}.test(e.title || ''))`;

const REPAINT_PROBE = String.raw`
(() => {
  if (window.__bgProbe) return 'already';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: 0, ticks: 0, ticking: false };
  window.__bgProbe = P;
  P.bound = () => P.canvas === document.getElementById('map-canvas');
  const tick = () => { if (P.ticking) { P.ticks++; requestAnimationFrame(tick); } };
  P.start = () => { if (!P.ticking) { P.ticking = true; requestAnimationFrame(tick); } };
  P.stop = () => { P.ticking = false; };
  // The same repaint START signal the MapViewport baseline harness uses: the
  // draw effect's canvas.width assignment.
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true, enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) { if (this === P.canvas) P.repaints++; return wd.set.call(this, v); },
  });
  return 'installed';
})()`;

const fileHash = () => (existsSync(OVERRIDE_FILE)
  ? createHash('sha256').update(readFileSync(OVERRIDE_FILE)).digest('hex') : 'absent');

async function main() {
  console.log(`\nDERIVED FROM THE VENDORED CONTRACT (${CONTRACT.source.repo}@${CONTRACT.source.commit.slice(0, 7)}):`);
  console.log(`  drivers = ${JSON.stringify(DRIVERS)}   BGANIM_MAX_BANDS = ${MAX_BANDS}`);
  console.log(`  BG_TILE_CAPACITY = ${TILE_CAPACITY}   TILE_BYTES = ${TILE_BYTES}   PHASE_BANKS = ${PHASE_BANKS}\n`);

  const hashBefore = fileHash();

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

    // ---- 1. Open the REAL aeon tree. ------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the aeon project is open, with sections', !!(st && st.open && st.sections > 0),
      JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');

    const toasts0 = await c.json('window.__dbg.aeon.toasts()');
    check('1b', 'opening the project raised no error toast about the override file',
      !toasts0.some((t) => t.type === 'error' && /bg_override/i.test(t.message)),
      JSON.stringify(toasts0.map((t) => `${t.type}:${t.message}`.slice(0, 70))));

    // ---- 2. INSTRUMENT CHECKS (do not discriminate — see the header). ----
    await sleep(2500);
    const pills = await c.json(
      `[...document.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean)`);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill [instrument check]', clicked === true,
      `buttons on screen: ${JSON.stringify(pills.slice(0, 25))}`);
    await sleep(1200);

    const headings = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^(BG animation bands|Promote static tiles|Add a band|Scenes)/.test(t))`);
    check('2b', 'the BAND panel is mounted — its own headings, not the scene panel\'s [instrument check]',
      headings.some((h) => h.startsWith('BG animation bands'))
      && headings.some((h) => h.startsWith('Promote static tiles')),
      JSON.stringify(headings));
    await shot(c, '1-effects-facet-with-bands');

    // ---- 3. THE DOCUMENT IS REALLY THERE, at the size the panel claims. --
    const status = await c.json('window.__dbg.aeon.bgOverrideStatus()');
    const budget0 = await c.json('window.__dbg.aeon.bandBudget()');
    const present = !!(status && status.present && status.unreadable === null);
    check('3a', 'aeon\'s editor_bg_override.json loaded [precondition — every row below needs it]',
      present, JSON.stringify(status));
    if (!present) throw new Error('no override document — 4a onward would be vacuous');

    // Derived, not typed: the capacity comes from the vendored contract, and the
    // panel's own budget must agree with it.
    check('3b', `the blob is at the contract's capacity (${TILE_CAPACITY}) — the shape that makes `
      + 'PROMOTE the primary gesture',
      budget0.tileCapacity === TILE_CAPACITY && budget0.tiles === TILE_CAPACITY
      && budget0.tileSlotsRemaining === 0,
      JSON.stringify(budget0));
    check('3c', `the band ceiling on screen is the contract's (${MAX_BANDS})`,
      budget0.maxBands === MAX_BANDS, `maxBands=${budget0.maxBands}`);

    // The budget numbers must be ON SCREEN, not merely in the store — the whole
    // point of surfacing them is that a greyed control has a reason beside it.
    const budgetText = await c.evalExpr(
      `(document.body.innerText || '').replace(/\\s+/g, ' ')`);
    check('3d', 'the panel PRINTS the blob budget, so a full document explains itself',
      budgetText.includes(`Blob ${TILE_CAPACITY}/${TILE_CAPACITY} tiles`)
      && budgetText.includes('0 free'),
      `looked for "Blob ${TILE_CAPACITY}/${TILE_CAPACITY} tiles" and "0 free"`);

    // ---- 4. The driver dropdown really has options in it. ---------------
    const driverSel = await c.json(String.raw`
      (() => {
        const s = ${SELECT_BY_TITLE('/Which scalar drives/')};
        if (!s) return null;
        return { options: [...s.options].map(o => ({ v: o.value, t: o.title || '' })), value: s.value };
      })()`);
    check('4a', 'the driver picker is on screen', driverSel !== null,
      driverSel ? `value=${JSON.stringify(driverSel.value)}` : 'no <select> with that title');
    // THE ROW THIS EXISTS FOR: contract drivers + one "leave the key out" option.
    // A derivation yielding undefined renders an EMPTY select.
    check('4b', `the driver picker offers the contract's ${DRIVERS.length} drivers plus the `
      + '"(default)" option that leaves the key out',
      !!driverSel && driverSel.options.length === DRIVERS.length + 1
      && DRIVERS.every((d) => driverSel.options.some((o) => o.v === d))
      && driverSel.options.some((o) => o.v === ''),
      driverSel ? JSON.stringify(driverSel.options.map((o) => o.v)) : 'n/a');
    // THE AXIS CORRECTION, on the actual rendered options.
    check('4c', 'no driver option names an AXIS, and each says the band shifts horizontally',
      !!driverSel && driverSel.options.filter((o) => o.v !== '')
        .every((o) => /HORIZONTALLY/.test(o.t) && !/vertical/i.test(o.v)),
      driverSel ? JSON.stringify(driverSel.options.map((o) => o.t.slice(0, 40))) : 'n/a');

    const rowsSel = await c.json(String.raw`
      (() => {
        const s = ${SELECT_BY_TITLE('/rows —/')};
        return s ? [...s.options].map(o => Number(o.value)) : null;
      })()`);
    // Derived from the contract's TILE_BYTES: rows*TILE_BYTES must be a power of
    // two. Computed here from the vendored number, never listed.
    const legalRows = [];
    for (let r = 1; r <= TILE_CAPACITY; r++) {
      const b = r * TILE_BYTES;
      if ((b & (b - 1)) === 0) legalRows.push(r);
    }
    check('4d', 'the rows picker offers exactly the counts making rows*TILE_BYTES a power of two',
      !!rowsSel && JSON.stringify(rowsSel) === JSON.stringify(legalRows),
      `on screen ${JSON.stringify(rowsSel)}   derived ${JSON.stringify(legalRows)}`);

    // ---- 5. THE ROW THIS HARNESS WAS BUILT FOR. -------------------------
    // Click Promote for real and read the MODEL back. On a broken write-back the
    // button depresses and nothing changes — which on screen is identical to a
    // correct refusal.
    const bands0 = await c.json('window.__dbg.aeon.bands()');
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    // Set a real geometry through real keystrokes: 2 cols x 1 row.
    const typedCols = await c.evalExpr(SET_INPUT(INPUT_BY_TITLE('/^cols —/'), 2));
    const chosenRows = await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/rows —/'), 1));
    check('5a', 'the cols field and the rows picker take real input',
      typedCols === 'ok' && chosenRows === 'ok', `cols=${typedCols} rows=${chosenRows}`);
    await sleep(400);

    const promoteBtn = await c.json(CONTROL_BY_TEXT('/^Promote$/'));
    check('5b', 'PROMOTE is available on a document at capacity — the gesture that works here',
      !!promoteBtn && promoteBtn.disabled === false,
      JSON.stringify(promoteBtn));
    const promoted = await c.evalExpr(clickByText('/^Promote$/'));
    await sleep(900);

    const bands1 = await c.json('window.__dbg.aeon.bands()');
    const budget1 = await c.json('window.__dbg.aeon.bandBudget()');
    check('5c', 'clicking Promote created the band IN THE MODEL, not just on screen',
      promoted === true && bands1.length === bands0.length + 1,
      `before=${bands0.length} after=${bands1.length} click=${promoted}`);
    const created = bands1[bands1.length - 1];
    check('5d', 'the created band has the geometry the form asked for, and 8 phase banks',
      !!created && created.cols === 2 && created.rows === 1
      && created.tileCount === 2 && created.phaseBanks === PHASE_BANKS,
      JSON.stringify(created));
    // PROMOTION DOES NOT GROW THE BLOB — the property that makes it work here.
    //
    // THE `bandLanded` CONJUNCT IS NOT DECORATION. Run against a build whose
    // write-back is broken, "the blob did not grow" is TRUE because nothing
    // happened at all, and this row reported green over a no-op in the poison
    // run of 2026-08-22. A row about what an operation did must first assert the
    // operation happened.
    const bandLanded = bands1.length === bands0.length + 1;
    check('5e', 'the tile blob did NOT grow: promotion moves art, it never adds any',
      bandLanded && budget1.tiles === budget0.tiles && budget1.tiles === TILE_CAPACITY,
      `landed=${bandLanded} before=${budget0.tiles} after=${budget1.tiles}`);
    // The driver key was left out, so the file tracks the engine default.
    check('5f', 'the band leaves `driver` unspelled, so the document tracks the engine default',
      created && created.driverIsExplicit === false && DRIVERS.includes(created.driver),
      `driver=${created && created.driver} explicit=${created && created.driverIsExplicit}`);
    check('5g', 'the new band is on screen in the list, with its slot range',
      (await c.evalExpr(`(document.body.innerText||'').includes('#${bands1.length - 1}')`)) === true);
    await shot(c, '2-after-promote');

    // ---- 6. Add-band is OFF, and says why. ------------------------------
    // Open the collapsed section first — a section that is shut photographs calm
    // and proves nothing about what is inside it.
    const opened = await c.evalExpr(OPEN_SECTION('/^Add a band \\(needs free tiles\\)/'));
    await sleep(500);
    // ANTI-VACUOUS: prove the section is genuinely open before judging what is
    // inside it. A shut section has no controls, and "no disabled button found"
    // would otherwise read as a finding about the app.
    const sectionOpen = await c.evalExpr(
      `(document.body.innerText || '').includes('Adding a band puts NEW art into the blob')`);
    check('6a-setup', 'the collapsed Add-band section really opened [instrument check]',
      opened === 'clicked' && sectionOpen === true, `open=${opened} bodyHasCopy=${sectionOpen}`);
    const addBtn = await c.json(CONTROL_BY_TEXT('/^Add \\d+x\\d+ band$/'));
    check('6a', 'the Add-band control is on screen and DISABLED on a full document',
      !!addBtn && addBtn.disabled === true, JSON.stringify(addBtn));
    // THE DEAD-BUTTON RULE. A greyed control with no number beside it teaches
    // nothing; the reason has to name the free slots and point at promotion.
    const pageText = await c.evalExpr(`(document.body.innerText || '').replace(/\\s+/g, ' ')`);
    check('6b', 'and the panel SAYS WHY: the free-slot count, and "PROMOTE" as the way through',
      /0 free slot\(s\)/.test(pageText) && /PROMOTE an existing static range/.test(pageText),
      `title=${addBtn ? JSON.stringify(addBtn.title.slice(0, 120)) : 'n/a'}`);
    await shot(c, '3-add-band-disabled-with-reason');

    // ---- 7. Undo, for real, with the keyboard. --------------------------
    const hashBeforeUndo = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    for (const type of ['rawKeyDown', 'char', 'keyUp']) {
      await c.send('Input.dispatchKeyEvent', {
        type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90,
        modifiers: 2, text: type === 'char' ? 'z' : undefined,
      });
    }
    await sleep(900);
    const bands2 = await c.json('window.__dbg.aeon.bands()');
    const hash2 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    // BOTH HALVES, and the first half is what stops this reading green over a
    // promotion that never happened: `bands2.length === bands0.length` alone is
    // trivially true when the promote was a no-op, which is exactly how it
    // reported PASS in the 2026-08-22 poison run.
    check('7a', 'Ctrl+Z removes the band again — the promotion was ONE undoable step',
      bandLanded && bands2.length === bands0.length,
      `before=${bands0.length} after-promote=${bands1.length} after-undo=${bands2.length}`);
    // STRONGER THAN A COUNT. A document that came back to the same band count
    // with different bytes would pass the row above; this asserts the exact
    // document, layout words and tile art included.
    // Same shape, same reason: "the hash came back" is free when the hash never
    // moved. 7c states that discrimination as its own row AND it is required
    // here, because a row's own verdict must not depend on a reader noticing a
    // different row went red.
    check('7b', 'and the document is byte-for-byte the one it started as',
      hash2 !== null && hash2 === hash0 && hashBeforeUndo !== hash0,
      `hash before=${hash0} after-promote=${hashBeforeUndo} after-undo=${hash2}`);
    check('7c', 'the promote actually MOVED the hash — 7b is not comparing a constant',
      hashBeforeUndo !== null && hashBeforeUndo !== hash0,
      `promote hash=${hashBeforeUndo} vs base=${hash0}`);

    // ---- 8. No clock. ---------------------------------------------------
    const probe = await c.evalExpr(REPAINT_PROBE);
    check('8a-setup', 'the repaint probe bound to the live map canvas', probe === 'installed',
      `probe=${probe}`);
    await c.evalExpr('window.__bgProbe.repaints = 0; window.__bgProbe.ticks = 0; window.__bgProbe.start()');
    await sleep(3000);
    await c.evalExpr('window.__bgProbe.stop()');
    const idle = await c.json('({repaints: window.__bgProbe.repaints, ticks: window.__bgProbe.ticks, bound: window.__bgProbe.bound()})');
    check('8a', 'sitting on the Effects facet with the band panel open starts NO clock: '
      + 'zero map repaints over 3s', idle.repaints === 0 && idle.bound === true,
      JSON.stringify(idle));
    check('8b', 'and the page was provably still painting [anti-vacuous companion to 8a]',
      idle.ticks > 60, `${idle.ticks} rAF ticks in 3s`);

    // ---- 9. Nothing was written. ----------------------------------------
    const hashAfter = fileHash();
    check('9a', 'the aeon tree\'s editor_bg_override.json is untouched [harness property, not a finding]',
      hashAfter === hashBefore, `${hashBefore.slice(0, 12)} → ${hashAfter.slice(0, 12)}`);

    // Leave the session clean: the store is dirty, the disk is not.
    await c.send('Page.reload').catch(() => {});
  } finally {
    if (c) c.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed`);
  if (fails.length) {
    console.log('FAILURES:');
    for (const f of fails) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
