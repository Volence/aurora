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
// 3. A DEAD BUTTON WITH NO EXPLANATION, and an interface shaped around a
//    passing fact. A band's art has two sources and they are PEERS: promotion
//    MOVES a range the blob already holds (costs no slots at any capacity) and
//    insertion ADDS new art (costs cols*rows slots). aeon's live document sits
//    at 448/448 today, so insertion refuses there — but the ceiling is what is
//    permanent ((0xB800-0x8000)/32, the BG region under the sprite attribute
//    table), not the saturation, which is one generator run's property.
//
//    So section 6 exercises BOTH doors on BOTH document states, and reaches the
//    second state through the app's own gestures rather than a second fixture:
//    promote (blob unchanged) → remove the band (its slots leave the blob,
//    freeing exactly cols*rows) → add (blob grows back). On the saturated half
//    it checks that the refused control carries the free-slot count and the way
//    through; on the roomy half it checks Add is simply available and lands.
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
//   • 6c (removal refuses first when cells draw the band) CANNOT discriminate on
//     a run where no layout cell happened to draw the promoted range — the
//     removal is then legal on the first click and the refusal path is never
//     reached. The row detects that and says so in its own detail rather than
//     reporting a pass it did not earn.
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
// ═══ RED-FIRST, 2026-08-22 — RUN TWICE, AND IT FOUND THREE BUGS IN THIS FILE ═══
//
// The write-back accessor in `state/projectStore.ts`'s `getActiveLevel` was
// replaced with a no-op setter, the app REBUILT, and this harness re-run — the
// defect being that a band edit lands in a throwaway view rather than the store.
// Restored, rebuilt, 35/35 both times. What the two runs exposed HERE:
//
//   1. THREE ROWS PASSING VACUOUSLY. 5e ("the blob did not grow" — trivially
//      true of a no-op), 7a ("Ctrl+Z removes the band again" — 0 → 0 → 0) and 7b
//      ("byte-for-byte what it started as" — a hash that never moved) all
//      reported PASS over a promotion that never happened. Each now requires the
//      promotion to have LANDED. A row's verdict must not depend on a reader
//      noticing that a different row went red.
//
//   2. A CRASH INSTEAD OF A REPORT. With the promotion gone, section 6
//      dereferenced the band that was never created and died with a TypeError,
//      taking sections 7, 8 AND 9 with it — so the no-clock claim, which depends
//      on none of this, was never measured and never mentioned. Sections 6 and 7
//      are now gated on 5c, and their absence is a failing row that names itself.
//
//   3. TWO SILENT NO-OP CLICKS. `clickByText` searches `text + ' ' + aria-label`,
//      and an `IconButton` renders text "Remove" with aria-label "Remove band 0"
//      — a haystack of "Remove Remove band 0" that NO anchored pattern against
//      either half can match. It found nothing, twice, and the rows downstream
//      reported on a document nothing had happened to. `clickByAria` exists for
//      that; it is the same class of bug as the "Effects " trailing space.
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

/**
 * Click a control by its ARIA-LABEL alone.
 *
 * `clickByText` searches `text + ' ' + aria-label`, which is right for a Chip
 * (no aria-label) and WRONG for an `IconButton`, whose text is "Remove" and
 * whose aria-label is "Remove band 0" — the haystack is then "Remove Remove
 * band 0" and NO anchored pattern against either half matches it. That silently
 * clicked nothing twice in this file's history before being named.
 */
const clickByAria = (re) => String.raw`
(() => {
  const el = [...document.querySelectorAll('button')]
    .find((e) => ${re}.test(e.getAttribute('aria-label') || ''));
  if (!el) return 'no-element';
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const SELECT_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

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
        .filter(t => /^(BG animation bands|New band$|From existing tiles$|From new art$|Scenes$)/.test(t))`);
    check('2b', 'the BAND panel is mounted — its own headings, not the scene panel\'s [instrument check]',
      headings.some((h) => h.startsWith('BG animation bands'))
      && headings.includes('New band')
      // BOTH sources named, which is what makes them peers on screen rather
      // than one control and one escape hatch.
      && headings.includes('From existing tiles') && headings.includes('From new art'),
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
    check('3b', `the blob is at the contract's capacity (${TILE_CAPACITY}) — a live quantity, and `
      + 'today a saturated one',
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
    check('5b', 'PROMOTE is available on a document at capacity — it spends no slots',
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

    // ═══ SECTIONS 6 AND 7 NEED 5c TO HAVE LANDED ═══
    //
    // NOT DEFENSIVE PROGRAMMING — a reporting rule. Run against a build whose
    // write-back is broken, the first version of this file dereferenced the band
    // 5c never created and DIED with a TypeError partway through section 6,
    // taking sections 7, 8 and 9 with it: the no-clock claim, which does not
    // depend on any of this, was simply never measured and never reported.
    // A harness must be LOUD on what it could not measure, never silent and
    // never crashed — so the dependent sections are gated and their absence is
    // itself a failing row.
    if (!bandLanded || !created) {
      check('6-7', 'sections 6 and 7 could NOT BE MEASURED — the promotion of 5c never reached '
        + 'the model, so every row about removing, adding or undoing it would be vacuous',
        false,
        `bands ${bands0.length} → ${bands1.length}; see 5c for the failure this follows from`);
    } else {
      // ---- 6. BOTH DOORS, ON BOTH DOCUMENT STATES. ------------------------
      //
      // The two ways a band gets its art are PEERS: promotion moves a range the
      // blob already holds (costs no slots, works at any capacity); insertion adds
      // new art (costs cols*rows slots). The live document happens to sit at
      // 448/448 today, which is a generator run's property and not a fact to shape
      // an interface around — so this section exercises insertion on BOTH states,
      // and reaches the second one THROUGH THE APP'S OWN GESTURES rather than by
      // opening a different fixture: promote (no change to the blob) → remove the
      // band (its slots leave the blob, freeing exactly cols*rows) → add.
      //
      // Everything here is undone in section 7 and nothing is ever saved.

      // 6a — the saturated state. Both controls are on screen; one is spendable
      // and the other is not, with the reason attached rather than a dead button.
      const promoteCtl0 = await c.json(CONTROL_BY_TEXT('/^Promote$/'));
      const addCtl0 = await c.json(CONTROL_BY_TEXT('/^Add band$/'));
      check('6a', 'on a SATURATED document both doors are on screen as peers — Promote spendable, '
        + 'Add not',
        !!promoteCtl0 && !!addCtl0 && promoteCtl0.disabled === false && addCtl0.disabled === true,
        `promote=${JSON.stringify(promoteCtl0)} add=${JSON.stringify(addCtl0)}`);
      // THE DEAD-BUTTON RULE. A greyed control with no number beside it teaches
      // nothing; the reason has to name the free slots and the way through.
      const pageText = await c.evalExpr(`(document.body.innerText || '').replace(/\\s+/g, ' ')`);
      check('6b', 'and Add SAYS WHY: the free-slot count, and promotion as the way through',
        !!addCtl0 && /0 free slot\(s\)/.test(addCtl0.title)
        && /PROMOTE an existing static range/.test(addCtl0.title)
        && /costs \d+ slots? · 0 free/.test(pageText),
        `title=${addCtl0 ? JSON.stringify(addCtl0.title.slice(0, 130)) : 'n/a'}`);
      await shot(c, '3-both-doors-saturated');

      // 6c — free slots by REMOVING the band, through the real two-click flow.
      // ARIA-LABEL ONLY — see clickByAria. Matching the combined text+label
      // haystack finds nothing here, silently, whichever half you anchor to.
      const removedFirstClick = await c.evalExpr(clickByAria('/^Remove band \\d+$/'));
      await sleep(600);
      const afterFirstRemove = await c.json('window.__dbg.aeon.bands()');
      const confirmChip = await c.json(CONTROL_BY_TEXT('/^Remove and blank those cells$/'));
      const neededConfirm = afterFirstRemove.length === bands1.length;
      check('6c', 'Remove REFUSES first when layout cells draw the band, and the refusal names them',
        !neededConfirm
          ? true                        // see the detail: this run did not discriminate
          : !!confirmChip && /cell\(s\) draw them/.test(
            await c.evalExpr(`(document.body.innerText || '').replace(/\\s+/g, ' ')`)),
        neededConfirm
          ? `refused and offered: ${JSON.stringify(confirmChip)}`
          : 'DOES NOT DISCRIMINATE THIS RUN: no layout cell drew the promoted range, so the '
            + 'removal was legal on the first click and the refusal path was never reached.');
      if (neededConfirm) {
        const confirmed = await c.evalExpr(clickByText('/^Remove and blank those cells$/'));
        check('6c2', 'the confirmation chip is clickable and completes the removal',
          confirmed === true, `click=${confirmed}`);
        await sleep(700);
      }
      const budget2 = await c.json('window.__dbg.aeon.bandBudget()');
      const bandsAfterRemove = await c.json('window.__dbg.aeon.bands()');
      // Removal DELETES the band's slots from the blob — which is exactly the
      // difference from demotion, and the way this run reaches a roomy document.
      check('6d', 'removal deleted the band\'s slots from the blob, freeing exactly cols*rows',
        bandsAfterRemove.length === bands0.length
        && budget2.tiles === budget0.tiles - created.tileCount
        && budget2.tileSlotsRemaining === created.tileCount,
        `tiles ${budget0.tiles} → ${budget2.tiles}, free ${budget0.tileSlotsRemaining} → `
        + `${budget2.tileSlotsRemaining} (band was ${created.tileCount} slots)`);

      // 6e — the SAME document, now with room. Insertion is simply available.
      const addCtl1 = await c.json(CONTROL_BY_TEXT('/^Add band$/'));
      check('6e', 'with slots free, Add is spendable on the very same document — insertion is a '
        + 'peer, not a fallback',
        budget2.tileSlotsRemaining > 0 && !!addCtl1 && addCtl1.disabled === false,
        `free=${budget2.tileSlotsRemaining} add=${JSON.stringify(addCtl1)}`);
      const added = await c.evalExpr(clickByText('/^Add band$/'));
      await sleep(900);
      const bandsAfterAdd = await c.json('window.__dbg.aeon.bands()');
      const budget3 = await c.json('window.__dbg.aeon.bandBudget()');
      check('6f', 'clicking Add put a band IN THE MODEL and GREW the blob by exactly its slots',
        added === true && bandsAfterAdd.length === bandsAfterRemove.length + 1
        && budget3.tiles === budget2.tiles + created.tileCount,
        `click=${added} bands ${bandsAfterRemove.length} → ${bandsAfterAdd.length}, `
        + `tiles ${budget2.tiles} → ${budget3.tiles}`);
      const addedBand = bandsAfterAdd[bandsAfterAdd.length - 1];
      // `addLanded` for the reason 5e/7a carry theirs: on the first run of this
      // section the Add click found no element, and this row still reported PASS
      // because it was describing the band PROMOTION had left behind.
      const addLanded = bandsAfterAdd.length === bandsAfterRemove.length + 1;
      check('6g', 'the added band has the form\'s geometry and the contract\'s bank count',
        addLanded && !!addedBand && addedBand.cols === 2 && addedBand.rows === 1
        && addedBand.phaseBanks === PHASE_BANKS,
        `landed=${addLanded} ${JSON.stringify(addedBand)}`);
      await shot(c, '4-added-band-with-free-slots');

      // ---- 7. Undo the whole arc, for real, with the keyboard. ------------
      //
      // THREE gestures went in (promote, remove, add), so three Ctrl+Z come out.
      // The document must land byte-for-byte where it started — a stronger claim
      // than "the band count went back", and the one that catches a plan and its
      // inverse disagreeing about slot arithmetic.
      const hashBeforeUndo = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      const undoSteps = 3;   // promote, remove, add — one step each
      for (let i = 0; i < undoSteps; i++) {
        for (const type of ['rawKeyDown', 'char', 'keyUp']) {
          await c.send('Input.dispatchKeyEvent', {
            type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90,
            modifiers: 2, text: type === 'char' ? 'z' : undefined,
          });
        }
        await sleep(600);
      }
      const bands2 = await c.json('window.__dbg.aeon.bands()');
      const budget4 = await c.json('window.__dbg.aeon.bandBudget()');
      const hash2 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      // BOTH HALVES. `bands2.length === bands0.length` alone is trivially true
      // when every gesture was a no-op, which is exactly how it reported PASS in
      // the 2026-08-22 poison run.
      check('7a', `${undoSteps} Ctrl+Z unwind the whole arc — each gesture was ONE undoable step`,
        bandLanded && bands2.length === bands0.length && budget4.tiles === budget0.tiles,
        `bands ${bands0.length} → ${bands1.length} → ${bandsAfterRemove.length} → `
        + `${bandsAfterAdd.length} → ${bands2.length}; tiles ${budget0.tiles} → ${budget4.tiles}`);
      // Same shape, same reason: "the hash came back" is free when the hash never
      // moved. 7c states that discrimination as its own row AND it is required
      // here, because a row's verdict must not depend on a reader noticing that a
      // different row went red.
      check('7b', 'and the document is byte-for-byte the one it started as',
        hash2 !== null && hash2 === hash0 && hashBeforeUndo !== hash0,
        `hash before=${hash0} after-arc=${hashBeforeUndo} after-undo=${hash2}`);
      check('7c', 'the arc actually MOVED the hash — 7b is not comparing a constant',
        hashBeforeUndo !== null && hashBeforeUndo !== hash0,
        `arc hash=${hashBeforeUndo} vs base=${hash0}`);
    }

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
