#!/usr/bin/env node
// THE BAND PRESET PANEL, IN THE RUNNING APP.
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// The node suite cannot see React. `band-preset-wording.test.ts` greps the panel
// source for `<LimitBlock />` and asserts the provider's strings — which is the
// best a node suite can do, and is NOT the same claim as:
//
//        IN THE RUNNING APP, AN AUTHOR OPENING THIS PANEL SEES ALL THREE
//        LIMITS AS BODY TEXT BEFORE ANY CONTROL, AND THE PANEL ROUND-TRIPS A
//        PRESET DOCUMENT AURORA DID NOT AUTHOR.
//
// ⚠ THE FIRST HALF OF THAT CLAIM WAS AMENDED, NOT DROPPED — `b8d16256`
// (2026-09-02, EFFECTS-W1 defect 3), and section 3 was a day late following it.
// The block painted 8,059 characters of design memo before the first control in
// a 285px column; it now paints 875 and carries the contract-length wording on
// the SAME elements' `title`. "Render the limits in full, never a tooltip" was
// right that a hover-only limit is a limit the panel does not carry — and a
// limit nobody reaches the bottom of is also one — so the split is BY AUDIENCE
// and the claim now has two halves:
//
//        EVERY LIMIT RENDERS VISIBLY AND UNCONDITIONALLY AT AUTHOR LENGTH,
//        AND THE CONTRACT WORDING IS ONE HOVER AWAY ON THE SAME ELEMENT.
//
// Rows 3a-3e assert BOTH, per element. A row that checked only the painted half
// would go green on a build that dropped every hover, which is the re-point this
// repo names as its dominant defect class; one that checked only the hover is
// what section 3 accidentally became for a day, and it could not go green at all.
//
// Two claims. The second is what makes the first worth anything: a panel that
// only warns is not a feature, and a panel that only works is the lie aeon's
// page was written to prevent.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE SELECTOR MATCHES NOTHING, every `.find()` is `undefined`, and a row
//     shaped "no X is missing" passes vacuously. Row 2a asserts the panel was
//     FOUND and holds a plausible amount of text BEFORE anything reads a
//     substring off it, and PLANT=rot-selector reproduces the end-anchored rot
//     that has bitten this repo five times.
//   • THE LIMITS ARE PRESENT BUT INVISIBLE — in a `title=`, in a collapsed
//     detail, or below the section's scroll edge. Rows 3a..3e read the author's
//     half out of `innerText` (which excludes attribute text and `display:none`
//     subtrees) and never out of `textContent`, so a limit that slid entirely
//     into its own hover reads as ABSENT from the painted half; row 3f asserts
//     the block is inside the painted box of its own scroller.
//   • THE CONTRACT WORDING QUIETLY LEAVES THE HOVER once the author-length
//     sentence is what the row reads. That is the mirror failure the O77 repair
//     created the room for, and each row's SECOND half is what closes it: the
//     `title` is asserted on the same element, by phrases only that limit's
//     contract wording carries. Row 2c is the floor under both — four titled
//     prose parts, three distinct leads, every part with a painted body AND a
//     hover — asserted before any row reads a substring off one.
//   • THE PANEL RENDERS THE LIMITS AND NOTHING ELSE WORKS. Section 4 drives a
//     real edit and reads the DOCUMENT back through `__dbg.aeon.presetsJson()`,
//     so "the warning is there" cannot substitute for "the feature is there".
//   • THE DOCUMENT IS AURORA'S OWN, so a round-trip proves nothing. Section 5
//     reads aeon's SHIPPED `authored_probe.json` — a file this repo did not
//     write — and compares the bytes on disk before and after an unrelated
//     edit elsewhere in the library.
//
// ⚠ NOTHING HERE IS STITCHED FROM TWO RUNS. `dpr`, the rects and the clip are
// read in ONE session and printed together, because `devicePixelRatio` on this
// machine has been observed at both 1 and 1.35 hours apart. Every coordinate is
// an INTEGER derived from the rect printed beside it.
//
// ⚠ NO EMULATOR, EVER. Nothing here runs a ROM or calls an emulator tool. The
// band this panel authors has been looked at on screen exactly once in this
// suite — aeon `4a4d3474` (2026-08-30), `docs/research/reference_captures/
// 2026-08-30-sec5-band/`, in aeon's emulator, in aeon's tree — and this
// harness does not add to that: it photographs the AUTHORING SURFACE, which
// is all that is in scope. What a band LOOKS like in THIS editor remains
// unmeasured (it draws none), and row 3e pins that the panel says so.
//
// CLEANUP IS BY PID, ALWAYS. `killTree` walks /proc for descendants of the pid
// THIS process spawned. No `pkill` on a pattern: from a worktree that kills the
// owner's editor and spares this run's orphan.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> node scratchpad/band-preset-harness.mjs
//   PLANT=rot-selector   … rot the LIMIT_BLOCK finder; row 2b must catch it and
//                          the run must ABORT rather than pass section 3
//   PLANT=rot-section    … rot the bands-section header selector with the `\b`
//                          that really failed here; row 4c must go red
//   PLANT=rot-swatch     … rot the colour-swatch finder (section 7's every row
//                          reads that list); row 7b must catch it and ABORT

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9431);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 96);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — this harness saves, and must never write there');
}
const SHOTS = `${ROOT}/scratchpad/shots-band-preset`;
mkdirSync(SHOTS, { recursive: true });

const PLANT = process.env.PLANT ?? '';
const PRESET_ID = process.env.PRESET_ID ?? 'harness_band';
/** aeon's own shipped document — the round-trip subject this repo did not write. */
const SHIPPED = `${AEONDIR}/games/sonic4/data/editor/effects/presets/authored_probe.json`;
/** Where THIS harness's own preset lands. Deleted before every run — see below. */
const MINE = `${AEONDIR}/games/sonic4/data/editor/effects/presets/${PRESET_ID}.json`;

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

// `\b`, NEVER `$` — five selectors in a sibling harness were caught matching
// nothing because they end-anchored a title that carries a suffix.
//
// ⚠ AND THE FIRST PLANT WRITTEN HERE WAS ITSELF VACUOUS, which is worth leaving
// on the record. It end-anchored THIS title — but the presets section has no
// `right` action, so its header renders the title bare and `$` matched happily:
// the "plant" ran green and proved nothing. A plant has to rot a selector that
// the shape of the DOM can actually break, so PLANT=rot-selector now breaks the
// LIMIT_BLOCK finder (the one every row in section 3 depends on) and
// PLANT=rot-section reproduces the `\b`-before-an-action-label rot that really
// did cost two runs of this harness.
const SECTION_RE = String.raw`/^Raster band presets\b/`;

/** Open a CollapsibleSection by its header text, and report what happened. */
const OPEN_SECTION = (re, proofSelector) => String.raw`
(() => {
  const open = () => !!(${proofSelector});
  if (open()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${re}.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) {
    // NAME WHAT WAS THERE INSTEAD. "no-header" alone sent one run chasing a
    // product bug that was a selector bug; the candidates make the difference
    // visible in the log rather than in the next run.
    const seen = [...document.querySelectorAll('div')]
      .filter((d) => d.style && d.style.cursor === 'pointer')
      .map((d) => (d.textContent || '').trim().slice(0, 48));
    return 'no-header: ' + JSON.stringify(seen);
  }
  hdr.click();
  // NOT the open() probe HERE. React has not re-rendered yet, so it reports
  // 'clicked-shut' for a click that worked — measured, and it cost a run. The
  // caller re-checks after a settle; this only reports that a header was hit.
  return 'clicked';
})()`;

/** Did the section really open? Re-checked after a settle, never synchronously. */
const SECTION_IS_OPEN = (proofSelector) => `!!(${proofSelector})`;

/**
 * ONE COLLAPSIBLE SECTION'S OWN BOX — height, and how many children it has.
 *
 * The section ROOT is the header div's parent: `CollapsibleSection` renders
 * `<div>{header}{!collapsed && children}</div>`, so `children === 1` IS the
 * shut state (structurally, not by reading a chevron's rotation) and the height
 * of that div is the height the column pays for the section.
 *
 * ⚠ THE HEIGHT ALONE CANNOT TELL SHUT FROM OPEN-AND-EMPTY, which is why the
 * child count travels with it. A row that only compared numbers would call a
 * section that failed to render its body "shut" and report a flattering figure.
 */
const SECTION_BOX = (re) => String.raw`
(() => {
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${re}.test((d.textContent || '').trim()))
    .pop();
  if (!hdr || !hdr.parentElement) return null;
  const root = hdr.parentElement;
  const b = root.getBoundingClientRect();
  return { height: Math.round(b.height * 100) / 100, children: root.childElementCount,
           headerHeight: Math.round(hdr.getBoundingClientRect().height * 100) / 100 };
})()`;

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7's PAGE-SIDE HELPERS — the colour picker (EW-COLOUR-PICKER)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The band's swatch buttons.
 *
 * `PLANT=rot-swatch` points this at an attribute the panel never writes, so it
 * matches NOTHING — every row in section 7 reads off this list, so a rot here
 * is the worst thing that can happen to that section and row 7b is the floor
 * that must catch it.
 */
const SWATCHES = PLANT === 'rot-swatch'
  ? String.raw`[...document.querySelectorAll('[data-band-colours]')]`
  : String.raw`[...document.querySelectorAll('[data-band-colour]')]`;

/**
 * A CRAM word as the CSS colour Chrome will report, re-derived HERE.
 *
 * NOT imported from the app, deliberately. The claim of row 7c is "the swatch
 * shows the colour the word means", and checking the app's rendering against the
 * app's own conversion would only prove it called its own function. This is the
 * VDP's 0BGR layout written out independently (3 bits per channel, low bit of
 * each nibble dead, scaled 0-7 → 0-255), matched against `getComputedStyle`.
 */
const CSS_OF_WORD = String.raw`
((w) => {
  const s = (v) => Math.round(v * 255 / 7);
  return 'rgb(' + s((w >> 1) & 7) + ', ' + s((w >> 5) & 7) + ', ' + s((w >> 9) & 7) + ')';
})`;

/**
 * The limit block's own element: the div carrying the warning-coloured left
 * rule that `LimitBlock` draws. Found by STRUCTURE (the border) rather than by
 * matching a sentence, so the rows below can then assert the sentences are
 * inside it — matching on the sentence first would make those rows circular.
 */
const LIMIT_BLOCK = String.raw`
(() => {
  const hit = [...document.querySelectorAll('div')]
    .filter((d) => d.style && ${PLANT === 'rot-selector'
      // THE PLANT: a border width the block never draws, so this matches
      // NOTHING. Every row in section 3 reads text out of this element, so a
      // rot here is the single worst thing that can happen to this harness —
      // and row 2b is the floor that must catch it.
      ? String.raw`/^9px solid/` : String.raw`/^2px solid/`}.test(d.style.borderLeft || ''));
  return hit.length ? hit[0] : null;
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
  console.log('=== band-preset-panel harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);

  // ⚠ THE HARNESS SAVES, SO THE HARNESS POLLUTES ITS OWN FIXTURE — and this
  // caught it red-handed rather than in review. Run 2 wrote `harness_band.json`
  // into the copy; run 3 then OPENED it, so the preset already existed before
  // any click, `presetIdRefusal` refused the id as taken, `create` returned
  // early — and the row "clicking New created the preset in the MODEL" WENT
  // GREEN on a document the click had nothing to do with. Two paths, one
  // observable, exactly as the standing invariant warns.
  //
  // The fix is both halves: delete the artifact, and ASSERT IT IS GONE before
  // the click, so a failed delete cannot quietly restore the same false green.
  rmSync(MINE, { force: true });
  if (existsSync(MINE)) throw new Error(`could not clear ${MINE} — the create rows would be vacuous`);

  // The shipped document's bytes BEFORE the app ever touches them.
  const shippedBefore = existsSync(SHIPPED) ? readFileSync(SHIPPED, 'utf8') : null;
  console.log(`    SHIPPED     : ${SHIPPED} (${shippedBefore === null ? 'ABSENT' : `${shippedBefore.length}B`})`);

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
    let haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npx electron-vite build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open the COPY and mount Effects. -----------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can be measured');
    await sleep(2500);

    // ---- 1b. THE LOAD PATH: aeon's shipped preset reached the MODEL. -----
    //
    // Before any UI question. If the loader never read the file, every later
    // row about round-tripping it would be about a document that does not
    // exist, and "unchanged on disk" would be trivially true.
    const loaded = await c.json('window.__dbg.aeon.presets()');
    check('1b', "aeon's own authored_probe.json was LOADED into the model",
      loaded.some((p) => p.id === 'authored_probe' && p.bands === 2),
      `${loaded.length} presets: ${JSON.stringify(loaded)}`);
    const unreadable = await c.json('window.__dbg.aeon.unreadablePresets()');
    check('1c', 'no preset file in the project was unreadable',
      unreadable.length === 0, JSON.stringify(unreadable));

    check('1c2', `ANTI-VACUOUS: ${PRESET_ID} is ABSENT before anything is clicked`,
      !loaded.some((p) => p.id === PRESET_ID),
      `presets at open: ${JSON.stringify(loaded.map((p) => p.id))}`);

    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('1d', 'the Effects facet mounts', clicked === true, `click → ${clicked}`);
    await sleep(1200);
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1000);

    // ---- 2. The panel is on screen. --------------------------------------
    const PRESET_PROOF = `document.querySelector('input[placeholder="new_preset_id"]')`;
    const opened = await c.evalExpr(OPEN_SECTION(SECTION_RE, PRESET_PROOF));
    await sleep(900);
    const isOpen = await c.evalExpr(SECTION_IS_OPEN(PRESET_PROOF));
    const panelText = await c.evalExpr(String.raw`
      (() => {
        const box = ${LIMIT_BLOCK};
        return box ? box.innerText : '';
      })()`);
    // ANTI-VACUOUS FLOOR: the block was FOUND and holds a real amount of text,
    // asserted BEFORE anything reads a substring off it. Without this a rotted
    // selector makes every substring test below false for the wrong reason —
    // or, worse, a `.not.toMatch` row true for the wrong reason.
    check('2a', 'the preset section is OPEN, its controls on screen',
      isOpen === true && opened !== 'no-header',
      `section → ${opened}, open after settle = ${isOpen}`);
    check('2b', 'the limit block holds body text, not an empty shell',
      panelText.length > 400,
      panelText.length === 0
        ? 'NO ELEMENT MATCHED — selector rot, or the block is not rendered'
        : `${panelText.length} chars of innerText`);
    if (panelText.length === 0) {
      throw new Error('limit block not found — section 3 cannot be measured');
    }

    // ═════════════════════════════════════════════════════════════════════
    // 2c. THE TWO HALVES OF EACH LIMIT, PULLED APART — O77
    // ═════════════════════════════════════════════════════════════════════
    //
    // ⚠ WHY THIS EXISTS AT ALL, AND WHAT IT REPLACES. Until O77 every row in
    // section 3 matched its phrases against ONE string: `panelText`, the block's
    // `innerText`. That was right while the block painted the contract-length
    // wording. `b8d16256` (2026-09-02, EFFECTS-W1 defect 3) amended the ruling
    // it was written to: the panel now paints the AUTHOR-length sentence and
    // carries the contract-length one on the SAME element's `title`. innerText
    // excludes attribute text BY DESIGN — that is the whole reason this harness
    // reads it — so from that commit rows 3a, 3b and 3e were matching the
    // contract wording against a string it had deliberately left, and were
    // INCAPABLE OF GREEN. They carried no information for a day, and the reason
    // was invisible to a grep: every phrase they asserted is still in the
    // provider, just no longer painted. MEASURED here 2026-09-03: the block's
    // innerText is 875 chars (it was 8,059) and the four `title`s hold
    // 6474 + 384 + 230 + 797.
    //
    // THE AMENDMENT IS NOT A RETIREMENT, so neither is the repair. The ruling
    // now has TWO halves — "every limit renders visibly at author length" AND
    // "the contract wording is one hover away on the same element" — and a row
    // that checked only the painted half would be the re-point this repo calls
    // its dominant defect: it would go green on a build that dropped the hover
    // entirely. Each row below asserts BOTH halves of ONE element, so neither
    // can quietly become the other, and both are scoped to that element rather
    // than to the whole block — which also ends the uniqueness problem that bit
    // row 3b (`fails loudly` occurs 3× in effects-preset.ts, and the SHORT body
    // is one of them: the pre-O77 row printed `loud=true` while every one of its
    // other conjuncts was false).
    //
    // KEYED BY THE PAINTED LEAD-IN, NOT BY INDEX. `LimitBlock` renders each
    // limit as `<span>{title}.</span> {body}` under a `title={full}`, and
    // NO_PREVIEW as the same div with no lead span — so the lead is a structural
    // key the panel already draws, and a reorder is caught by row 2c rather than
    // silently re-attributing one limit's wording to another.
    const LIMIT_PARTS = String.raw`
      (() => {
        const box = ${LIMIT_BLOCK};
        if (!box) return [];
        return [...box.children]
          .filter((el) => el.tagName === 'DIV' && el.hasAttribute('title'))
          .map((el) => ({
            text: el.innerText,
            title: el.getAttribute('title') || '',
            lead: (el.firstElementChild && el.firstElementChild.tagName === 'SPAN')
              ? (el.firstElementChild.textContent || '').trim() : '',
          }));
      })()`;
    const parts = await c.json(LIMIT_PARTS);
    /** The lead-ins `PRESET_LIMITS` supplies, in the order the panel renders them. */
    const LEADS = [
      'Saving does not install the band.',
      'Seeing it is a debug chord.',
      'Nothing checks that a band is visible.',
    ];
    // NOT `?? {}`. A part that is not there must make its row say so, not make
    // it pass over an empty string — an absent limit and a silent one read the
    // same otherwise. The sentinel is impossible to match, and it PRINTS.
    const MISSING = Object.freeze({ text: '', title: '', missing: true });
    const partByLead = (lead) => parts.find((p) => p.lead === lead) ?? MISSING;
    const noPreviewParts = parts.filter((p) => p.lead === '');
    const noPreview = noPreviewParts.length === 1 ? noPreviewParts[0] : MISSING;
    // ANTI-VACUOUS FLOOR FOR EVERYTHING BELOW, asserted before any row reads a
    // substring off a part. Four titled prose divs, the three leads present and
    // distinct, exactly one unled (the no-preview line), and every part carrying
    // BOTH a painted body and a hover. A build that dropped every `title` would
    // stop here rather than at three separate rows naming three sentences.
    check('2c', 'each limit is ONE element carrying a painted body AND the contract wording on its hover',
      parts.length === 4
      && LEADS.every((l) => parts.filter((p) => p.lead === l).length === 1)
      && noPreviewParts.length === 1
      && parts.every((p) => p.text.length > 80 && p.title.length > 100),
      `${parts.length} titled prose parts: `
      + JSON.stringify(parts.map((p) => ({
        lead: p.lead || '(no lead — the no-preview line)',
        painted: p.text.length, hover: p.title.length,
      }))));
    const unbound = partByLead(LEADS[0]);
    const debugChord = partByLead(LEADS[1]);
    const unchecked = partByLead(LEADS[2]);
    /** Every word the block can put in front of an author, painted or hovered. */
    const allProse = [panelText, ...parts.map((p) => p.title)].join('\n');

    // ---- 3. THE CLAIM: all three limits, as VISIBLE BODY TEXT. -----------
    //
    // `innerText`, NOT `textContent`, and that is the whole point of the row:
    // innerText excludes `title=` attribute text and any `display:none`
    // subtree, so a limit buried in a tooltip reads as ABSENT here. That is
    // exactly the failure the brief forbids ("do not bury this in a tooltip").
    // ⚠ RE-CUT 2026-08-30, TWICE-STALE. This row asserted /effectsRef/ and
    // /not implemented in either repo/ — wording retired when the limit was rewritten
    // for a key that exists and a build that reads it. Worse than merely stale: it
    // demanded the RESERVED key be on screen, which the unit gate now forbids outright,
    // so the two instruments had come to contradict each other. Re-pointed at phrases
    // LIMIT 1 alone owns today. `costs ROM` survives both rewrites and is kept.
    // ⚠ RE-PHRASED 2026-08-30, and the OLD phrases are why this row is checked
    // by hand every time the limit moves. It read `/the band does not play/i`
    // and `/one line per section/i` — the constant's UNIVERSAL call-site clause
    // — until aeon `9cdf32d8` threaded the chooser for section 5 and the clause
    // became a case split. Both phrases left the constant, so both `.test()`s
    // would have gone false and this row would have reddened on a wording change
    // rather than on a painting failure. It now anchors on the case split's two
    // halves, which is the pair an author must SEE together: bind section 5 and
    // aeon can carry it, bind any other and nothing consumes the key.
    check('3a', 'LIMIT 1: the author-length sentence is PAINTED and the contract wording is on its hover',
      // PAINTED — the author's half. `SHORT_BODIES.unbound`, and the two clauses
      // an author has to act on: that a SECTION must bind the document, and that
      // the control which does it is the one below this block.
      /a section has to BIND it/.test(unbound.text)
      && /aeon has to have wired that section/.test(unbound.text)
      && /at the dropdown below/.test(unbound.text)
      // HOVERED — the contract half, `RASTER_SECTION_BINDING_LIMIT`, the sentence
      // this panel, `assign_section_preset`'s reply and the published tool
      // descriptions all quote. Same five phrases the pre-O77 row asserted; the
      // string they are asserted against is the one that carries them.
      && /rasterRef/.test(unbound.title)
      && /ONLY SECTION 5 IS WIRED/.test(unbound.title)
      && /BINDING ANY OTHER SECTION STILL REACHES NOTHING/.test(unbound.title)
      && /a preset split plus one call-site line/i.test(unbound.title)
      && /costs ROM/i.test(unbound.title),
      unbound.missing ? 'NO ELEMENT LED "Saving does not install the band." — the limit is gone'
        : `painted(${unbound.text.length}B): mustBind=${/a section has to BIND it/.test(unbound.text)} `
        + `aeonWired=${/aeon has to have wired that section/.test(unbound.text)} `
        + `namesTheControl=${/at the dropdown below/.test(unbound.text)}; `
        + `hover(${unbound.title.length}B): rasterRef=${/rasterRef/.test(unbound.title)} `
        + `sec5Wired=${/ONLY SECTION 5 IS WIRED/.test(unbound.title)} `
        + `othersReachNothing=${/BINDING ANY OTHER SECTION STILL REACHES NOTHING/.test(unbound.title)} `
        + `splitPlusLine=${/a preset split plus one call-site line/i.test(unbound.title)} `
        + `costsROM=${/costs ROM/i.test(unbound.title)}`);
    check('3b', 'LIMIT 2: the author-length sentence is PAINTED and the debug chord is on its hover',
      // PAINTED. ⚠ `fails loudly` ALONE IS NOT THIS ROW'S PHRASE and never was:
      // it occurs three times in effects-preset.ts and one of them is this very
      // short body, so before O77 it was the one conjunct that stayed true while
      // the row was measuring the wrong string. Scoped to this element and
      // carried through to its object.
      // ⚠ `\x27`, NOT A BARE `'`, AND IT IS NOT STYLE. `check-harness-guards.mjs`
      // (in `npm test`) strips comments before hunting for `pkill`, and its
      // `stripInert` has no regex-literal case: a bare apostrophe inside `/…/`
      // opens a string to it, the scanner desynchronises, and a COMMENT further
      // down this file — the one saying there is no `pkill` here — survives
      // stripping and trips G2. Measured: the same file with `aeon's` in these
      // two regexes fails `check:harness-guards`; with `\x27` it is clean. The
      // character matched is identical. The checker's fragility is filed in the
      // O77 packet; this spelling is the local fix, not the general one.
      /a row in aeon\x27s band-demo table or a section binding/.test(debugChord.text)
      && /fails loudly when it has neither/.test(debugChord.text)
      // HOVERED — the chord itself, and the fact the table is hand-typed. These
      // are what a programmer needs and an author does not, which is why the cut
      // put them here rather than deleting them.
      && /START/.test(debugChord.title)
      && /hand-typed dc\.l list/.test(debugChord.title)
      && /does not add itself/i.test(debugChord.title)
      && /aeon 4aa2abc0/.test(debugChord.title),
      debugChord.missing ? 'NO ELEMENT LED "Seeing it is a debug chord." — the limit is gone'
        : `painted(${debugChord.text.length}B): `
        + `rowOrBinding=${/a row in aeon\x27s band-demo table or a section binding/.test(debugChord.text)} `
        + `loudWhenNeither=${/fails loudly when it has neither/.test(debugChord.text)}; `
        + `hover(${debugChord.title.length}B): chord=${/START/.test(debugChord.title)} `
        + `handTyped=${/hand-typed dc\.l list/.test(debugChord.title)} `
        + `notSelfAdding=${/does not add itself/i.test(debugChord.title)} `
        + `anchor=${/aeon 4aa2abc0/.test(debugChord.title)}`);
    // ⚠ THIS ROW WAS GREEN THROUGH THE WHOLE O77 OUTAGE, AND THAT IS THE FINDING
    // rather than a reprieve. `SHORT_BODIES.unchecked_visibility` happens to keep
    // both phrases the long body used, so the row went on passing while its two
    // neighbours could not go green — same instrument, same drift, one accident
    // of wording apart. It was measuring the painted half only and claiming the
    // contract wording; it now says which half it reads, like the other three.
    check('3c', 'LIMIT 3: the author-length sentence is PAINTED and the full wording is on its hover',
      /builds green and shows nothing/i.test(unchecked.text)
      && /unused palette entry/i.test(unchecked.text)
      && /Nothing checks that a band is VISIBLE/.test(unchecked.text)
      && /No check anywhere in the pipeline catches that/.test(unchecked.title)
      && /not this panel, not the schema, not the build/.test(unchecked.title),
      unchecked.missing ? 'NO ELEMENT LED "Nothing checks that a band is visible." — the limit is gone'
        : `painted(${unchecked.text.length}B): `
        + `buildsGreen=${/builds green and shows nothing/i.test(unchecked.text)} `
        + `unusedEntry=${/unused palette entry/i.test(unchecked.text)}; `
        + `hover(${unchecked.title.length}B): `
        + `nothingCatches=${/No check anywhere in the pipeline catches that/.test(unchecked.title)} `
        + `namesAllThree=${/not this panel, not the schema, not the build/.test(unchecked.title)}`);
    check('3d', "the ACCURATE headline is visible, not the inaccurate one",
      /An author can author a raster band/.test(panelText)
      && /programmer wires it up in one line/.test(panelText)
      // ⚠ THE NEGATIVE IS TAKEN OVER `allProse`, NOT `panelText` — O77. The
      // sentence aeon's page exists to prevent must not appear ANYWHERE the
      // panel can put it in front of an author, and after `b8d16256` most of
      // this block's prose is in a `title`, which `panelText` does not see. A
      // negative asserted over the string that lost 88% of the words is a
      // negative that mostly stopped looking.
      && !/no longer needs a programmer/i.test(allProse),
      `headline=${/An author can author a raster band/.test(panelText)} `
      + `wiresItUp=${/programmer wires it up in one line/.test(panelText)} `
      + `forbiddenSentenceAbsent=${!/no longer needs a programmer/i.test(allProse)} `
      + `(searched ${allProse.length}B: ${panelText.length}B painted + ${allProse.length - panelText.length - 4}B hovered)`);
    // ⚠ MATCHER MOVED 2026-08-30 (O64): it pinned "never been looked at on
    // screen", which aeon `4a4d3474` made false; NO_PREVIEW now cites that
    // one frame and says none is built against it. Both halves are pinned
    // here so "aeon measured it" cannot paint as "you can preview it".
    check('3e', 'and it says there is no preview — PAINTED, with the provenance on its hover',
      // PAINTED — `NO_PREVIEW_SHORT`. The absence of a preview is the one thing
      // in this block an author must not have to hover to find: an empty space
      // where a preview would be reads as "not built yet", and a hover-only
      // disclosure is a silence to everyone who does not hover.
      /No preview\. Aurora draws no raster band/.test(noPreview.text)
      && /a wrong preview would be worse than none/.test(noPreview.text)
      && /You see it when the ROM runs/.test(noPreview.text)
      // HOVERED — `NO_PREVIEW`, with the one measured frame it cites. Both halves
      // of the O64 matcher are kept, on the string that carries them.
      && /No preview\. This editor draws no band/.test(noPreview.title)
      && /could at most be checked against that one frame; none is built/i.test(noPreview.title)
      && /aeon 4a4d3474 \(2026-08-30\)/.test(noPreview.title)
      // ⚠ AND THE RETIRED PHRASE IS HUNTED ACROSS BOTH HALVES — O77. Before the
      // prose cut this negative was asserted over the string that held the
      // provenance; after it, that string holds none of it, so a `NO_PREVIEW`
      // that regressed to "never been looked at on screen" would have sat in the
      // hover unseen while the row reported the phrase gone.
      && !/never been looked at on screen/i.test(noPreview.text)
      && !/never been looked at on screen/i.test(noPreview.title),
      noPreview.missing ? 'NO UNLED TITLED DIV IN THE BLOCK — the no-preview line is gone'
        : `painted(${noPreview.text.length}B): `
        + `auroraDrawsNone=${/No preview\. Aurora draws no raster band/.test(noPreview.text)} `
        + `worseThanNone=${/a wrong preview would be worse than none/.test(noPreview.text)} `
        + `whenTheROMRuns=${/You see it when the ROM runs/.test(noPreview.text)}; `
        + `hover(${noPreview.title.length}B): `
        + `drawsNone=${/No preview\. This editor draws no band/.test(noPreview.title)} `
        + `noneBuilt=${/none is built/i.test(noPreview.title)} `
        + `anchor=${/aeon 4a4d3474 \(2026-08-30\)/.test(noPreview.title)}; `
        + `retiredPhraseGoneFromBOTH=`
        + `${!/never been looked at on screen/i.test(noPreview.text + noPreview.title)}`);

    // IS IT ACTUALLY PAINTED? A rect is real even when the scrolling section
    // has clipped it away — the way a sibling harness's first capture came back
    // showing a control over an absent sentence. Containment in the nearest
    // scroller's box is the test, not "does it have a rect".
    await c.evalExpr(String.raw`(() => {
      const b = ${LIMIT_BLOCK}; if (b) b.scrollIntoView({ block: 'start' }); return 'ok';
    })()`);
    await sleep(600);
    const painted = await c.json(String.raw`(() => {
      const box = ${LIMIT_BLOCK};
      if (!box) return { found: false };
      const b = box.getBoundingClientRect();
      let sc = box.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
      const outer = sc ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      return {
        found: true, rect: b.toJSON(),
        inside: b.top >= outer.top - 1 && b.top < outer.bottom,
        heightPx: Math.round(b.height),
      };
    })()`);
    // SCROLLED TO FIRST, deliberately. This section is the fifth in a scrolling
    // 300px column, so at the launch geometry it starts below the fold — which
    // is a property of the column, not of the block, and an author reaches it
    // the same way. What the row asserts is that once reached it is PAINTED
    // (contained in its scroller's box), not clipped to nothing.
    check('3f', 'once scrolled to, the limit block is inside the painted area of its scroller',
      painted.found === true && painted.inside === true && painted.heightPx > 60,
      `rect top=${painted.rect && Math.round(painted.rect.top)} h=${painted.heightPx} `
      + `inside=${painted.inside}`);

    // ---- 3g. THE LIMITS COME BEFORE THE CONTROLS. -----------------------
    //
    // "Before any control" is a placement claim and needs a placement
    // measurement. An author who meets the limits after authoring has met them
    // too late.
    const order = await c.json(String.raw`(() => {
      const box = ${LIMIT_BLOCK};
      const input = document.querySelector('input[placeholder="new_preset_id"]');
      if (!box || !input) return null;
      return { limitTop: box.getBoundingClientRect().top,
               controlTop: input.getBoundingClientRect().top };
    })()`);
    check('3g', 'the limits are ABOVE the first control, not after it',
      order !== null && order.limitTop < order.controlTop,
      order === null ? 'could not locate both' : JSON.stringify(order));

    // ---- 4. THE FEATURE WORKS. -------------------------------------------
    //
    // Without this section the harness only proves the panel warns, and a panel
    // that only warns is not the deliverable. The preset is made THROUGH THE UI
    // — the id box and the New button — because one conjured into the store
    // would not prove the surface can make one.
    const typed = await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_preset_id"]')`, PRESET_ID));
    // ⚠ SCOPED TO THE PRESET ROW, AND THAT IS NOT FUSSINESS. A bare
    // `^New$` also matches the SCENE panel's chip higher in the same column —
    // the first run of this harness clicked THAT one, found it disabled, and
    // reported the preset feature broken. Two paths, one observable: exactly
    // the trap the standing invariants name. The button is found from the id
    // INPUT's own row, which is unique.
    const pressedNew = await c.evalExpr(String.raw`
      (() => {
        const input = document.querySelector('input[placeholder="new_preset_id"]');
        if (!input) return 'no-input';
        const row = input.parentElement;
        const btn = [...row.querySelectorAll('button')].find((b) => /^New$/.test((b.textContent || '').trim()));
        if (!btn) return 'no-button';
        if (btn.disabled) return 'disabled';
        btn.click();
        return true;
      })()`);
    await sleep(900);
    const after = await c.json('window.__dbg.aeon.presets()');
    check('4a', 'clicking New created the preset in the MODEL, not just on screen',
      typed === 'ok' && pressedNew === true && after.some((p) => p.id === PRESET_ID),
      // Anti-vacuous: aeon's pre-existing preset is listed too, so a green here
      // is the NEW document appearing rather than the model being empty.
      `typed=${typed} new=${pressedNew}; ${after.length} presets: `
      + JSON.stringify(after.map((p) => p.id)));

    const docs = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    const mine = docs.find((p) => p.id === PRESET_ID);
    check('4b', 'the new document is SCHEMA-SHAPED: one band, all four keys, exactly one arm',
      mine !== undefined && mine.schema === 1 && mine.bands.length === 1
      && ['top', 'bot', 'sh', 'on'].every((k) => k in mine.bands[0])
      && Object.keys(mine.bands[0].on).length === 1,
      JSON.stringify(mine));

    // Open the band editor and drive a real field.
    // CREATING SELECTS IT. Not cosmetic: the band editor below is the SELECTED
    // preset's, so a create that did not select would leave the author editing
    // the document they did not just make. Read from the store, not inferred
    // from the section title, which is a consequence rather than the fact.
    const selNow = await c.evalExpr('window.__dbg.aeon.selectedPreset()');
    const idBox = await c.evalExpr(`(document.querySelector('input[placeholder="new_preset_id"]')||{}).value`);
    check('4a2', 'creating a preset SELECTS it and clears the id box',
      selNow === PRESET_ID && idBox === '',
      `selectedPreset = ${JSON.stringify(selNow)}, id box = ${JSON.stringify(idBox)}`);
    const BANDS_PROOF = `[...document.querySelectorAll('input')].find((e) => e.placeholder === '${PRESET_ID}')`;

    // ---- 4b0. THE SECTION'S SHUT HEIGHT, BEFORE IT IS EVER OPENED. --------
    //
    // ROADMAP row 97 / O15's precedent: a parcel that adds controls to a section
    // measures that section SHUT and OPEN, before and after, and reports all four
    // numbers. The shut number is the one that must not move — an author scrolling
    // past a collapsed section pays its height whether or not they want it.
    //
    // ⚠ IT IS MEASURED HERE, NOT LATER, and the ordering is the measurement. This
    // section is `defaultCollapsed`, so this is the only moment in the run when it
    // is shut; row 4c opens it and nothing closes it again. The BEFORE half of the
    // pair comes from running THIS FILE against a build of master — same
    // instrument, two builds — rather than from a number typed into a packet.
    // NEITHER \b NOR (?!\w) HERE, and BOTH cost a run. The header's textContent
    // runs straight into the `right` slot's own label — "Preset —
    // harness_bandDelete" — so there is no word boundary between "d" and "D",
    // and "D" is itself a word character. The bound that is actually correct
    // comes from the ID'S OWN CHARSET (^[a-z][a-z0-9_]{0,31}$ in the schema): no
    // legal id character can follow, so a longer id cannot be matched by
    // mistake, and any action label can.
    //
    // ⚠ AND A SPACE MAY NOT FOLLOW EITHER — found by EW-COLOUR-PICKER, 2026-09-03,
    // and it is a THIRD rot of this same selector. `(?![a-z0-9_])` was correct
    // when one section carried this prefix. There are now THREE:
    //
    //     Preset — harness_bandDelete                     <- the bands editor
    //     Preset — harness_band — cycles, variants        <- ROADMAP row 97
    //     Preset — harness_band — moving anchors          <- ROADMAP row 95
    //
    // …and `OPEN_SECTION` takes `.pop()`, the LAST match. So this harness had
    // been clicking the MOVING ANCHORS header open and then looking for the band
    // editor's controls inside it: rows 4c, 4d, 4e and 4f all failed, naming the
    // controls rather than the selector, on a panel where every one of them
    // works. Excluding a following SPACE keeps the two suffixed sections out
    // while still admitting any action label, which cannot begin with one.
    const BANDS_RE = PLANT === 'rot-section'
      // THE PLANT: the `\b` this really carried for two runs.
      ? String.raw`/^Preset — ${PRESET_ID}\b/`
      : String.raw`/^Preset — ${PRESET_ID}(?![a-z0-9_ ])/`;
    const shutBox = await c.json(SECTION_BOX(BANDS_RE));
    check('4b0', 'the band section is SHUT and is a header only — no body in the DOM',
      shutBox !== null && shutBox.children === 1 && shutBox.height > 0,
      `SHUT HEIGHT = ${shutBox && shutBox.height}px, children=${shutBox && shutBox.children} `
      + `(a CollapsibleSection renders no children while shut, so 1 = header alone)`);

    const openedBands = await c.evalExpr(OPEN_SECTION(BANDS_RE, BANDS_PROOF));
    await sleep(900);
    const bandsOpen = await c.evalExpr(SECTION_IS_OPEN(BANDS_PROOF));
    check('4c', 'the band editor section opens',
      bandsOpen === true && openedBands !== 'no-header',
      `bands section → ${openedBands}, open after settle = ${bandsOpen}`);

    // ---- 4c2. THE SECTION'S OPEN HEIGHT, ON A FRESH PRESET. --------------
    //
    // The second of the four numbers, taken at a DEFINED document state: the
    // preset row 4a just created, whose one band is `newBand()` — top 112, bot
    // 128, sh off, cram addr 74, colours [0]. Nothing has been edited yet, so
    // this number is comparable between two builds; taken after row 4d it would
    // be a height of whatever the run happened to have typed.
    const openBox = await c.json(SECTION_BOX(BANDS_RE));
    check('4c2', 'the band section is OPEN and its body is in the DOM',
      openBox !== null && openBox.children > 1 && openBox.height > (shutBox?.height ?? 0),
      `OPEN HEIGHT = ${openBox && openBox.height}px (shut was ${shutBox && shutBox.height}px), `
      + `children=${openBox && openBox.children}`);

    const topField = String.raw`[...document.querySelectorAll('input')]
      .find((e) => /^Screen line the effect turns ON\b/.test(e.title || ''))`;
    const setTop = await c.evalExpr(SET_INPUT(topField, '96'));
    await sleep(600);
    const docs2 = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    const mine2 = docs2.find((p) => p.id === PRESET_ID);
    check('4d', "editing `top` reaches the DOCUMENT, not just the widget",
      setTop === 'ok' && mine2 !== undefined && mine2.bands[0].top === 96,
      `set → ${setTop}; band 0 top = ${mine2 && mine2.bands[0].top}`);

    // THE SPINNER CARRIES NO RANGE — aeon E.4, in the live DOM rather than in
    // the source. A `min`/`max` attribute would be the clamp that ruling
    // forbids, and the source grep in the node suite cannot see what React
    // actually put on the element.
    const spinnerAttrs = await c.json(String.raw`(() => {
      const e = ${topField};
      if (!e) return null;
      return { min: e.getAttribute('min'), max: e.getAttribute('max'), type: e.type };
    })()`);
    check('4e', 'the band-line spinner carries NO min/max — values are forwarded verbatim (aeon E.4)',
      spinnerAttrs !== null && spinnerAttrs.min === null && spinnerAttrs.max === null,
      JSON.stringify(spinnerAttrs));

    // THE ARM PICKER: both arms offered, neither disabled — the strictness
    // answer, measured in the live DOM.
    const armSel = await c.json(String.raw`(() => {
      const e = [...document.querySelectorAll('select')]
        .find((s) => /^The ON op the band turns on\b/.test(s.title || ''));
      if (!e) return null;
      return { value: e.value,
               options: [...e.options].map((o) => ({ value: o.value, disabled: o.disabled })) };
    })()`);
    check('4f', 'the ON-arm picker offers both arms, neither disabled',
      armSel !== null && armSel.options.length === 2
      && armSel.options.every((o) => !o.disabled)
      && armSel.options.map((o) => o.value).sort().join(',') === 'cram,pal_region',
      JSON.stringify(armSel));

    // ═════════════════════════════════════════════════════════════════════
    // 7. CRAM AUTHORING IS SIGHTED — EW-COLOUR-PICKER, defect 13's colour half
    // ═════════════════════════════════════════════════════════════════════
    //
    // The cold-read walkthrough measured this surface asking an author to know
    // the BBB GGG RRR packing and convert it to base 10 by hand (a12), and to
    // read `addr = 74` off a three-letter label with no rendering of where it
    // lands (a13). The node suite (providers/__tests__/effects-preset-colours,
    // core/formats/__tests__/cram-geometry) owns the DOCUMENT half of the fix;
    // it cannot see a swatch. These rows are the pixels.
    //
    // ⚠ RUN BEFORE SECTION 5 ON PURPOSE. The Ctrl+S below then carries a colour
    // this section picked, so row 5c's file-on-disk check covers the picker's
    // write as well as the spinner's.
    //
    // WHAT WOULD MAKE THIS GREEN WITHOUT THE FEATURE:
    //   • the swatch selector matches nothing and every `.every()` passes over an
    //     empty list — row 7b asserts a COUNT against the document's own array
    //     before anything else reads the list, and PLANT=rot-swatch reproduces it;
    //   • the swatches are in the DOM but painted outside the scrolling column —
    //     row 7e compares their rect to the SCROLLER's box, never checkVisibility;
    //   • the sliders move and nothing is written — row 7g reads the DOCUMENT
    //     back through `presetsJson()` and compares every OTHER entry too.
    const colDoc0 = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
      .find((p) => p.id === PRESET_ID);
    const cram0 = colDoc0 && colDoc0.bands[0].on.cram;
    check('7a', 'ANTI-VACUOUS FLOOR: the band under test really carries a cram arm',
      cram0 !== undefined && cram0 !== null && Array.isArray(cram0.colours)
      && cram0.colours.length > 0 && Number.isInteger(cram0.addr),
      `on = ${JSON.stringify(colDoc0 && colDoc0.bands[0].on)}`);

    const swatchInfo = await c.json(String.raw`(() => {
      const els = ${SWATCHES};
      return els.map((e) => ({
        i: Number(e.getAttribute('data-band-colour')),
        bg: getComputedStyle(e).backgroundColor,
        title: e.title || '',
        w: Math.round(e.getBoundingClientRect().width),
        h: Math.round(e.getBoundingClientRect().height),
      }));
    })()`);
    check('7b', 'one swatch per colour — the count comes from the DOCUMENT, not from the DOM',
      swatchInfo.length === cram0.colours.length
      && swatchInfo.map((s) => s.i).join(',') === cram0.colours.map((_, i) => i).join(','),
      swatchInfo.length === 0
        ? 'NO SWATCH MATCHED — selector rot, or the strip is not rendered'
        : `${swatchInfo.length} swatches for ${cram0.colours.length} colours: `
          + JSON.stringify(swatchInfo.map((s) => ({ i: s.i, bg: s.bg, size: `${s.w}x${s.h}` }))));
    if (swatchInfo.length === 0) {
      throw new Error('no swatches — the rest of section 7 cannot be measured');
    }

    const swatchPaint = await c.json(String.raw`(() => {
      const words = ${JSON.stringify(cram0.colours)};
      const cssOf = ${CSS_OF_WORD};
      return ${SWATCHES}.map((e, i) => ({
        i, want: cssOf(words[i]), got: getComputedStyle(e).backgroundColor,
      }));
    })()`);
    check('7c', 'each swatch is PAINTED the colour its CRAM word decodes to (0BGR, re-derived here)',
      swatchPaint.length === cram0.colours.length && swatchPaint.every((p) => p.got === p.want),
      JSON.stringify(swatchPaint));

    const glossRow = await c.json(String.raw`(() => {
      const box = [...document.querySelectorAll('input')]
        .find((e) => /^CRAM BYTE address the colours are written to\b/.test(e.title || ''));
      if (!box) return null;
      const row = box.parentElement;
      const label = row.firstElementChild;
      return {
        value: box.value,
        min: box.getAttribute('min'), max: box.getAttribute('max'),
        labelText: (label.textContent || '').trim(),
        labelWidth: Math.round(label.getBoundingClientRect().width * 100) / 100,
        gloss: [...row.querySelectorAll('span')]
          .map((s) => (s.textContent || '').trim())
          .filter((t) => /^line /.test(t))[0] || null,
        rowRight: Math.round(row.getBoundingClientRect().right),
        cardRight: Math.round((() => {
          let p = row.parentElement;
          while (p && !(p.style && /solid/.test(p.style.border || ''))) p = p.parentElement;
          return (p || row).getBoundingClientRect().right;
        })()),
      };
    })()`);
    // THE EXPECTATION IS DERIVED, AND FROM THE CONTRACT'S ARITHMETIC — not from
    // the app's constants and not typed. The vendored schema states the geometry
    // as two shift formulas in `$defs.pal_region`'s own descriptions
    // ("addr >> 5 == pal_line", "(addr >> 1) & 15 == entry"); those two shifts
    // are written out here so this instrument and the app agree only if both are
    // right. core/formats/__tests__/cram-geometry.test.ts is what pins the
    // formulas to the vendored bytes.
    const wantGloss = `line ${cram0.addr >> 5} · entry ${(cram0.addr >> 1) & 15}`;
    check('7d', "`addr` carries a derived `line N · entry M` gloss BESIDE the raw number (a13)",
      glossRow !== null && glossRow.gloss === wantGloss
      && Number(glossRow.value) === cram0.addr,
      glossRow === null ? 'the addr spinner was not found at all'
        : `addr=${glossRow.value} gloss=${JSON.stringify(glossRow.gloss)} want=${JSON.stringify(wantGloss)}`);
    // THE NUMBER STAYS TYPEABLE AND UNCLAMPED. The gloss is an addition; if it
    // ever arrives with a min/max it has become the clamp aeon E.4 forbids.
    check('7d2', 'the addr spinner still carries NO min/max, and the label column did not move',
      glossRow !== null && glossRow.min === null && glossRow.max === null
      && glossRow.labelWidth === 64,
      `min=${glossRow && glossRow.min} max=${glossRow && glossRow.max} `
      + `label "${glossRow && glossRow.labelText}" = ${glossRow && glossRow.labelWidth}px `
      + `(LABEL_W is 64 and this parcel must not move it)`);
    check('7d3', 'the addr row does not overflow the band card it sits in',
      glossRow !== null && glossRow.rowRight <= glossRow.cardRight + 1,
      `row right ${glossRow && glossRow.rowRight} vs card right ${glossRow && glossRow.cardRight}`);

    // IS IT ON SCREEN? checkVisibility() and getClientRects() both return GREEN
    // for an element scrolled 2,635px out of its scroller — measured in this
    // repo. Containment in the SCROLLER's own box is the test.
    await c.evalExpr(String.raw`(() => {
      const e = ${SWATCHES}[0]; if (e) e.scrollIntoView({ block: 'center' }); return 'ok';
    })()`);
    await sleep(500);
    const onScreen = await c.json(String.raw`(() => {
      const e = ${SWATCHES}[0];
      if (!e) return null;
      const b = e.getBoundingClientRect();
      let sc = e.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
      const o = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
      return {
        rect: { top: Math.round(b.top), left: Math.round(b.left),
                w: Math.round(b.width), h: Math.round(b.height) },
        scroller: { top: Math.round(o.top), bottom: Math.round(o.bottom),
                    left: Math.round(o.left), right: Math.round(o.right) },
        inside: b.top >= o.top - 1 && b.bottom <= o.bottom + 1
                && b.left >= o.left - 1 && b.right <= o.right + 1,
        // PRINTED AS EVIDENCE, NEVER AS THE GATE — the paint trio is two thirds
        // vacuous and this repo has the measurement.
        trio: { vis: e.checkVisibility ? e.checkVisibility() : null,
                rects: e.getClientRects().length > 0 },
      };
    })()`);
    check('7e', 'the swatch is inside the PAINTED box of its scroller, at a real size',
      onScreen !== null && onScreen.inside === true
      && onScreen.rect.w >= 8 && onScreen.rect.h >= 8,
      JSON.stringify(onScreen));

    // ---- 7f/7g. THE PICKER ACTUALLY WRITES. ------------------------------
    //
    // A real click on the swatch (not `.click()` on something nothing listens
    // to — this IS a <button> and React does listen), then the shared R/G/B
    // sliders. `pointerup` is what `GenesisColorSliders` commits on.
    const slidersBefore = await c.evalExpr(
      `document.querySelectorAll('input[type=range]').length`);
    await c.evalExpr(String.raw`(() => { ${SWATCHES}[0].click(); return 'ok'; })()`);
    await sleep(600);
    const slidersAfter = await c.evalExpr(
      `document.querySelectorAll('input[type=range]').length`);
    check('7f', 'clicking a swatch opens the app\'s own R/G/B sliders under the strip',
      slidersAfter - slidersBefore === 3,
      `range inputs ${slidersBefore} -> ${slidersAfter} (GenesisColorSliders draws three)`);

    const beforeColours = cram0.colours.slice();
    const drove = await c.evalExpr(String.raw`
      (() => {
        const s = [...document.querySelectorAll('input[type=range]')];
        if (s.length < 3) return 'no-sliders';
        const r = s[s.length - 3];   // R, G, B in order; take this panel's R
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(r, '7');
        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return 'ok';
      })()`);
    await sleep(800);
    const colDoc1 = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
      .find((p) => p.id === PRESET_ID);
    const after0 = colDoc1.bands[0].on.cram.colours;
    // R at level 7 is bits 3..1 set: the low nibble of the word reads 0xE.
    const changedOnly = after0.length === beforeColours.length
      && after0.every((w, i) => (i === 0 ? true : w === beforeColours[i]));
    check('7g', 'driving R to 7 writes the DOCUMENT — entry 0 only, every other entry untouched',
      drove === 'ok' && changedOnly && after0[0] !== beforeColours[0]
      && ((after0[0] >> 1) & 7) === 7 && Number.isInteger(after0[0]),
      `colours ${JSON.stringify(beforeColours)} -> ${JSON.stringify(after0)}; `
      + `R level of entry 0 = ${(after0[0] >> 1) & 7}; drove=${drove}`);
    // THE WIRE FORM. A picker that started writing `"$0E00"` or an object would
    // still look right on screen and would break every consumer of the file.
    check('7g2', 'what it wrote is a plain decimal integer — the wire format did not move',
      after0.every((w) => Number.isInteger(w))
      && /"colours":\s*\[\s*\d/.test(JSON.stringify(colDoc1).replace(/\s+/g, ' ')),
      `typeof entries: ${JSON.stringify(after0.map((w) => typeof w))}`);

    // ---- 7h. ONE GESTURE, ONE UNDO STEP. ---------------------------------
    //
    // A drag emits an onChange per slider tick and commits on pointerup AND on
    // the blur after it. If either wrote history, one undo would land the author
    // mid-drag instead of before it. A real Ctrl+Z, and the assertion is the
    // WHOLE array back at its pre-gesture value.
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await sleep(900);
    const undone = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
      .find((p) => p.id === PRESET_ID).bands[0].on.cram.colours;
    check('7h', 'ONE Ctrl+Z restores the colour list exactly — one gesture, one step',
      JSON.stringify(undone) === JSON.stringify(beforeColours),
      `after undo ${JSON.stringify(undone)}, want ${JSON.stringify(beforeColours)}`);

    // Redo the pick so section 5 saves a document the picker authored.
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 10 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 10 });
    await sleep(700);
    const redone = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
      .find((p) => p.id === PRESET_ID).bands[0].on.cram.colours;

    // ---- 7i. THE TEXT FIELD STILL READS THE DOCUMENT. --------------------
    //
    // The list field and the swatches are two views of one array. If the field
    // kept a draft across a swatch edit, an author would see the swatch change
    // under a box still showing the old numbers — two sources of truth, in one
    // card.
    const listBox = await c.evalExpr(String.raw`
      (() => {
        const e = [...document.querySelectorAll('input')]
          .find((x) => x.placeholder === '14 3584');
        return e ? e.value : null;
      })()`);
    check('7i', 'the raw decimal list field is still there and shows the document, not a stale draft',
      listBox !== null && listBox === redone.join(' '),
      `field = ${JSON.stringify(listBox)}, document = ${JSON.stringify(redone.join(' '))}`);

    // ---- 5. ROUND-TRIP A DOCUMENT AURORA DID NOT AUTHOR. -----------------
    //
    // Save the project — which re-serializes the WHOLE preset library, aeon's
    // shipped document included — and compare that file's bytes to what was on
    // disk before the app ever opened it. This is the claim the codec's design
    // turns on, and it cannot be made from a document Aurora wrote itself.
    // A REAL Ctrl+S, not a store call. The save PLAN is what serializes the
    // preset library, and driving the keystroke is what proves the plan is
    // wired to it — a `__dbg` shortcut would test the writer and skip the
    // wiring, which is the half that was actually added this parcel.
    const dirtyBefore = (await c.json('window.__dbg.aeon.state()')).dirty;
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS',
      windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS',
      windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
    await sleep(3500);
    const shippedAfter = existsSync(SHIPPED) ? readFileSync(SHIPPED, 'utf8') : null;
    const dirtyAfter = (await c.json('window.__dbg.aeon.state()')).dirty;
    check('5a', 'a REAL Ctrl+S ran and cleared the dirty flag',
      dirtyBefore === true && dirtyAfter === false,
      `dirty ${dirtyBefore} -> ${dirtyAfter}`);
    check('5b', "aeon's shipped authored_probe.json is BYTE-IDENTICAL after a save",
      shippedBefore !== null && shippedAfter === shippedBefore,
      shippedBefore === null ? 'the shipped file was ABSENT — nothing was round-tripped'
        : `${shippedBefore.length}B before, ${shippedAfter === null ? 'ABSENT' : `${shippedAfter.length}B`} after`);

    const minePath = `${AEONDIR}/games/sonic4/data/editor/effects/presets/${PRESET_ID}.json`;
    const wrote = existsSync(minePath) ? readFileSync(minePath, 'utf8') : null;
    check('5c', 'the NEW preset was written to presets/, not into a scene file',
      wrote !== null && JSON.parse(wrote).id === PRESET_ID
      && JSON.parse(wrote).bands[0].top === 96,
      wrote === null ? `NOT WRITTEN at ${minePath}` : `${wrote.length}B at ${minePath}`);
    // aeon's normative form is json.dumps(obj, sort_keys=True, indent=2) plus the
    // file-form newline. RECURSIVELY sorted — the band objects and the arm bodies
    // too — which is why a band reads bot, on, sh, top rather than in the order a
    // human types. Reproduced here independently of the codec, so this row
    // measures the BYTES rather than agreeing with the writer.
    const sortDeep = (v) => Array.isArray(v) ? v.map(sortDeep)
      : (v && typeof v === 'object')
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]))
        : v;
    const canonical = wrote === null ? null
      : JSON.stringify(sortDeep(JSON.parse(wrote)), null, 2) + '\n';
    check('5d', "the written bytes are aeon's canonical form: recursively sorted, indent 2, one newline",
      wrote !== null && wrote === canonical
      && wrote.endsWith('}\n') && !wrote.endsWith('\n\n')
      // ...and the recursion really reached INSIDE a band, which is the half a
      // top-level-only sort would silently pass.
      && wrote.indexOf('"bot"') < wrote.indexOf('"top"'),
      wrote === null ? 'nothing written'
        : `bytes ${wrote === canonical ? 'ARE' : 'are NOT'} canonical; `
          + `top-level order ${JSON.stringify(Object.keys(JSON.parse(wrote)))}; `
          + `band order bot<top = ${wrote.indexOf('"bot"') < wrote.indexOf('"top"')}`);

    // The scene library must be untouched by any of this — a `bands` key on a
    // scene file is refused, so a panel that wrote there would produce a file
    // nothing loads.
    const sceneFiles = await c.json('window.__dbg.aeon.scenes()');
    check('5e', 'the SCENE library is unchanged — bands never went near a scene file',
      sceneFiles.every((s) => s.id !== PRESET_ID),
      `scenes: ${JSON.stringify(sceneFiles.map((s) => s.id))}`);

    // ---- 6. THE PICTURE. -------------------------------------------------
    //
    // dpr and the rects are read in THIS run and printed with the integer clip
    // derived from them, because dpr here has been 1 and 1.35 on the same day.
    // `deviceScaleFactor: 0` KEEPS the native dpr — only the height changes, so
    // the whole limit block and the first controls fit one capture.
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: 1400, height: 1600, deviceScaleFactor: 0, mobile: false,
    });
    await sleep(900);
    await c.evalExpr(String.raw`(() => { const b = ${LIMIT_BLOCK}; if (b) b.scrollIntoView({ block: 'start' }); return 'ok'; })()`);
    await sleep(600);

    const envShot = await c.json('({ dpr: window.devicePixelRatio, inner: [window.innerWidth, window.innerHeight] })');
    const clip = await c.json(String.raw`(() => {
      const box = ${LIMIT_BLOCK};
      const input = document.querySelector('input[placeholder="new_preset_id"]');
      const a = box.getBoundingClientRect();
      const b = input ? input.getBoundingClientRect() : a;
      const top = Math.floor(Math.min(a.top, b.top)) - 34;
      const bottom = Math.ceil(Math.max(a.bottom, b.bottom)) + 12;
      const left = Math.floor(Math.min(a.left, b.left)) - 16;
      const right = Math.ceil(Math.max(a.right, b.right)) + 12;
      return { x: left, y: top, width: right - left, height: bottom - top };
    })()`);
    console.log(`        CAPTURE ENV  dpr=${envShot.dpr}  inner=${JSON.stringify(envShot.inner)}`);
    console.log(`        CLIP      ${JSON.stringify(clip)}  <- integer, from the block's and the id row's own rects`);
    check('6a', 'the clip is integer client pixels, derived from the rects printed above',
      Number.isInteger(clip.x) && Number.isInteger(clip.y)
      && Number.isInteger(clip.width) && Number.isInteger(clip.height)
      && clip.width > 100 && clip.height > 100);

    const full = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/1-effects-column.png`, Buffer.from(full.data, 'base64'));
    const clipped = await c.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 2 },
    });
    const shot = `${SHOTS}/2-band-preset-panel-limits.png`;
    writeFileSync(shot, Buffer.from(clipped.data, 'base64'));
    console.log(`        SHOT PATH ${shot}`);
    check('6b', 'both captures are real images, not a blank server',
      Buffer.from(clipped.data, 'base64').length > 5000
      && Buffer.from(full.data, 'base64').length > 20000,
      `clip ${Buffer.from(clipped.data, 'base64').length}B, full ${Buffer.from(full.data, 'base64').length}B`);

    // A capture of the BAND CARD too — the controls the limits are about.
    await c.evalExpr(String.raw`(() => {
      const e = ${topField}; if (e) e.scrollIntoView({ block: 'center' }); return 'ok';
    })()`);
    await sleep(600);
    const cardClip = await c.json(String.raw`(() => {
      const e = ${topField};
      if (!e) return null;
      let card = e.parentElement;
      while (card && !(card.style && /solid/.test(card.style.border || ''))) card = card.parentElement;
      const b = (card || e).getBoundingClientRect();
      return { x: Math.floor(b.left) - 8, y: Math.floor(b.top) - 8,
               width: Math.ceil(b.width) + 16, height: Math.ceil(b.height) + 16 };
    })()`);
    if (cardClip && cardClip.width > 50 && cardClip.height > 50) {
      const cardShot = await c.send('Page.captureScreenshot', {
        format: 'png',
        clip: { ...cardClip, scale: 2 },
      });
      const shot2 = `${SHOTS}/3-band-card.png`;
      writeFileSync(shot2, Buffer.from(cardShot.data, 'base64'));
      console.log(`        SHOT PATH ${shot2}`);
      console.log(`        CARD CLIP ${JSON.stringify(cardClip)}`);
    }
    await c.send('Emulation.clearDeviceMetricsOverride');
  } finally {
    try { c && c.close(); } catch { /* ignore */ }
    // BY PID ONLY. killTree walks /proc for descendants of the pid THIS
    // process spawned; nothing here signals a pid outside that set, and there
    // is no `pkill` on a pattern anywhere in this file.
    //
    // O65: this line used to read `killTree(child.pid)`. The helper took the
    // ChildProcess and read `.pid` off it, so a bare number was a SILENT no-op:
    // all 12 processes of the tree outlived this `finally`, the stdout/stderr
    // pipes to them kept this process's event loop alive, and the summary line
    // below was followed by a hang that only a `timeout` wrapper ended
    // (measured 2026-08-30, 30 s after the summary: same 12 pids, `cleanup:`
    // never printed). The helper now accepts a pid too and shouts on anything
    // else; this passes the ChildProcess, the shape the helper was written for.
    await killTree(child);
  }

  console.log(`\n=== ${results.length} rows, ${fails.length} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  if (fails.length) { console.log(fails.join('\n')); process.exitCode = 1; }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
