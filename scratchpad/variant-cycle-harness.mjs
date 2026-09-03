#!/usr/bin/env node
// THE PRESET `cycles` / `variants` CONTROLS, IN THE RUNNING APP. (ROADMAP row
// 97, second half — parcel EW-VARIANT-CYCLE.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// `effects-preset-channels.test.ts` drives the PROVIDER and proves the three
// spellings of each key are authored and never collapsed; the disclosure test
// walks the leaf's element tree. Neither can make the claim this file is for:
//
//        IN THE RUNNING APP, AN AUTHOR OPENS A PRESET'S "cycles, variants"
//        SECTION, AUTHORS A CYCLE CHANNEL, AUTHORS A VARIANT SLOT, CLEARS THE
//        NEXT SLOT WITH null, SWITCHES CYCLES OFF, PRESSES Ctrl+S — AND THE
//        BYTES ON DISK SAY EXACTLY THAT, WHILE THE DOCUMENT AEON SHIPPED,
//        OPENED AND NEVER TOUCHED, IS BYTE-IDENTICAL.
//
//        …and row [2f] checks what the panel SAYS above those controls. Until
//        2026-09-02 that was "Not consumed by the engine yet.", required
//        painted and first. aeon MERGED EFFECTS-W1 item 5, the premise in
//        core/formats/effects/preset-lag.ts emptied, and [2f] now requires the
//        OPPOSITE: no element on the open section still makes that claim. The
//        row reads the premise from that file and asks whichever question it
//        makes true, so re-filling the premise re-arms the original check with
//        no edit here.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • A SELECTOR THAT MATCHES NOTHING. Every control here is found by the
//     LABEL of its own Field row (the `<span>` that precedes it) — never by
//     position, because the column holds the scene panel's selects, the S/H
//     picker, the ON-arm picker and the raster-ref select, and "the third
//     select" is a different control depending on what is open. Row [2d] is
//     the floor: both key selects FOUND, each offering the provider's option
//     set, BEFORE anything is picked.
//
//   • THE WIDGET MOVES AND THE MODEL DOES NOT. Every authoring row reads
//     `window.__dbg.aeon.presetsJson()` — the MODEL — and section 7 reads the
//     FILE after a real Ctrl+S. The widget is quoted beside the model where the
//     two could disagree, never instead of it.
//
//   • ABSENT AND null AND [] READ ALIKE. They do not: the model rows check
//     `'cycles' in doc`, `doc.cycles === null` and `Array.isArray` separately,
//     and the file rows grep the BYTES for `"cycles": null` and for the absence
//     of the key in the untouched document.
//
//   • THE DISCLOSURE IS RENDERED SOMEWHERE — or, since the retirement, IS NOT.
//     Row [2f] scopes to the smallest element carrying the lead sentence. With
//     the premise open it requires that element PAINTED (checkVisibility + a
//     strict elementFromPoint) and PRECEDING the first control by document
//     order; with the premise empty it requires no such element to exist at
//     all, which is the only way a retired warning is proven gone rather than
//     merely unlooked-for. The lead, the date AND the premise are all read from
//     the file that owns them (core/formats/effects/preset-lag.ts), never
//     retyped here — so this row cannot be told which answer it wants.
//
//   • A BOUND SLIPPED IN. Row [5b] types a `first` of 300 — a value no CRAM
//     line count reaches — and requires the model to hold 300: the control
//     forwards verbatim, and aeon's constructor keeps its own refusal.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. Every rect, `dpr` and height is read in
// ONE session and printed together — `devicePixelRatio` on this machine has
// been observed at both 1 and 1.35 hours apart.
//
// ⚠ NO EMULATOR, EVER. Nothing here runs a ROM. aeon's generator now lowers
// both keys (item 5, MERGED on aeon's master 2026-09-02 — merged, not
// certified: sigil dd5eaad2 records chain 198 RED with no ROM byte moved), but
// that changes nothing about what this file can claim. It photographs the
// AUTHORING surface and the FILE, and a ROM obeying these keys is aeon's and
// sigil's to show, never this harness's.
//
// CLEANUP IS BY PID, ALWAYS — `spawnGuarded` + `killTree`. No `pkill` on a
// pattern: from a worktree that kills the owner's editor and spares this run's
// orphan.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> [SCREEN=1920x1080] npm run harness:variant-cycle
//
//   ⚠ FRESH COPY PER RUN (O66). The Ctrl+S in section 7 rewrites the whole
//   project and leaves `harness_vc.json` in presets/. A second run on the same
//   copy is refused before the app is launched — exit 2, `HARNESS ABORTED:
//   LEFTOVER FROM A PRIOR RUN: …` — never a silent partial pass. Re-materialise:
//     git -C <aeon> archive <committed rev> | tar -x -C <fresh dir>
//
//   PLANT=rot-select   … rot the row-label finder so it matches nothing. MEASURED
//                        (aeon bf32a54c copy, 2026-09-02): [2c] goes red — its
//                        open-proof IS the cycles select — and the run ABORTS
//                        at 8/9 with exit 2, before any authoring row.
//
//   THERE IS NO PLANT=no-model HERE, AND THAT IS A MEASUREMENT. The first draft
//   carried one (read the cycles state off the widget instead of the model);
//   it left 31/31 green, because every authoring row in this file already
//   reads the DOCUMENT through `presetsJson()` and the widget is only ever
//   quoted beside it. A plant that changes no verdict is not a plant, so it
//   was removed rather than kept as a decoration.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9439);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 97);
/** The X screen. ⚠ 1680x1050 is THIS FILE'S default and not a display in this
 *  workspace (the owner's primary is 1920x1080 — O15's packet, §1); every height
 *  printed below is stamped with the screen it was read at. */
const SCREEN = process.env.SCREEN ?? '1680x1050';
if (!/^\d{3,4}x\d{3,4}$/.test(SCREEN)) throw new Error(`SCREEN must look like 1920x1080, got ${JSON.stringify(SCREEN)}`);
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
const SHOTS = `${ROOT}/scratchpad/shots-variant-cycle`;
mkdirSync(SHOTS, { recursive: true });

const PLANT = process.env.PLANT ?? '';
/** aeon's own shipped document — opened, never touched, and required to come
 *  back byte-identical from a save that re-serialises the whole library. */
const SHIPPED_ID = 'authored_probe';
const SHIPPED = `${AEONDIR}/games/sonic4/data/editor/effects/presets/${SHIPPED_ID}.json`;
/** THIS run's preset — created through the UI, authored through the UI. */
const PRESET_ID = process.env.PRESET_ID ?? 'harness_vc';
const MINE = `${AEONDIR}/games/sonic4/data/editor/effects/presets/${PRESET_ID}.json`;

/** The disclosure's date, lead AND PREMISE, read from the ONE file that owns
 *  them. A retyped copy here would be the second source of truth the parcel
 *  forbids — and the premise is read for the same reason the date is: row [2f]
 *  asks the OPPOSITE question depending on it, and must not be told which. */
const LAG_SRC = readFileSync(`${ROOT}/src/core/formats/effects/preset-lag.ts`, 'utf8');
const LAG_DATE = (LAG_SRC.match(/PRESET_LAG_MEASURED_ON = '(\d{4}-\d{2}-\d{2})'/) || [])[1];
const LAG_LEAD = (LAG_SRC.match(/PRESET_LAG_LEAD = '([^']+)'/) || [])[1];
if (!LAG_DATE || !LAG_LEAD) throw new Error('preset-lag.ts no longer carries the date/lead this harness reads');
// ⚠ `=\s*`, NOT `= `. EW-CHANNELS-FILTER re-filled this premise on 2026-09-03 and
// the declaration WRAPPED onto a second line; the literal single space made this
// harness THROW at import — before its first row — on a repo where nothing about
// the cycles/variants surface had changed. Found while adding the sibling
// moving-anchor section; the breakage is on master and predates that work.
const LAG_PREMISE_M = LAG_SRC.match(/PRESET_KEYS_AWAITING_AEON: readonly string\[\] =\s*Object\.freeze\(\[([^\]]*)\]\)/);
if (!LAG_PREMISE_M) throw new Error('preset-lag.ts no longer carries the premise list this harness reads');
const LAG_KEYS = LAG_PREMISE_M[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
/** EMPTY again since 2026-09-03: aeon merged item 4's step 4 and its generator
 *  now reads `patch_world_ys` / `patch_motion`, so the sentence retired for the
 *  second time. Read, never assumed — this flag has flipped four times. */
const PREMISE_OPEN = LAG_KEYS.length > 0;

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

/** Drive a real `change` through React's synthetic layer. */
const SET_SELECT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  if (![...el.options].some((o) => o.value === ${JSON.stringify(String(value))})) {
    return 'no-such-option: ' + JSON.stringify([...el.options].map((o) => o.value));
  }
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;
const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

/**
 * A CONTROL BY THE LABEL OF ITS OWN ROW. `Field` renders `<div><span>label</span>
 * {control}</div>`, so the control's parent's first child is the label — the
 * one thing that is unique per row in this section (`cycles`, `variants`,
 * `Slot 0`, `first`, `shift_r`…). Never by position: see the head note.
 */
const IN_ROW = (labelRe, tag) => String.raw`
(() => {
  const re = ${PLANT === 'rot-select' ? String.raw`/^NO SUCH ROW\b/` : labelRe};
  return [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((el) => {
      const row = el.parentElement;
      const lab = row && row.firstElementChild;
      return !!(lab && lab.tagName === 'SPAN' && re.test((lab.textContent || '').trim()));
    }) || null;
})()`;
const CYCLES_SEL = IN_ROW(String.raw`/^cycles$/`, 'select');
const VARIANTS_SEL = IN_ROW(String.raw`/^variants$/`, 'select');
const SLOT_SEL = (i) => IN_ROW(String.raw`/^Slot ${i}$/`, 'select');
const NUM_IN = (label) => IN_ROW(String.raw`/^${label}$/`, 'input[type="number"]');

// `\b`, NEVER `$` — a `right` slot's label would run straight into a bare
// title (band-preset-harness paid two runs for exactly that).
const BANDS_RE = String.raw`/^Raster band presets\b/`;
const CHANNELS_RE = (id) => String.raw`/^Preset — ${id} — cycles, variants\b/`;

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

/** A CollapsibleSection's ROOT (the header's parent) by its title. */
const SECTION_ROOT = (re) => String.raw`
(() => {
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${re}.test((d.textContent || '').trim()))
    .pop();
  return hdr ? hdr.parentElement : null;
})()`;

/** Heights, all in ONE evaluation: the column scroller, the bands section,
 *  the channels section, the viewport, and dpr. */
const HEIGHTS = (id) => String.raw`
(() => {
  const bands = ${SECTION_ROOT(BANDS_RE)};
  const chan = ${SECTION_ROOT(CHANNELS_RE(id))};
  let sc = bands && bands.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
  return {
    dpr: window.devicePixelRatio, screen: { w: screen.width, h: screen.height },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    column: sc ? { client: sc.clientHeight, scroll: sc.scrollHeight } : null,
    bandsSection: h(bands), channelsSection: h(chan),
  };
})()`;

const KEY = async (c, key, code, vk) => {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: 2 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: 2 });
};
const UNDO = (c) => KEY(c, 'z', 'KeyZ', 90);
const SAVE = (c) => KEY(c, 's', 'KeyS', 83);

/** The MODEL's document, always — never the widget's. */
const docOf = async (c, id) => {
  const docs = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
  return docs.find((p) => p.id === id) ?? null;
};
/** The cycles key's spelling in the MODEL: the three states, told apart by the
 *  three different questions (`in`, `=== null`, `isArray`), never by falsiness. */
const cyclesStateOf = async (c, id) => {
  const d = await docOf(c, id);
  if (d === null) return 'NO-DOC';
  return !('cycles' in d) ? 'absent' : d.cycles === null ? 'off' : Array.isArray(d.cycles) ? 'authored' : 'WRONG-TYPE';
};

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
  console.log('=== variant-cycle harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}  screen ${SCREEN} (${process.env.SCREEN ? 'SCREEN env' : 'this file\'s default, NOT a display here'})`);
  console.log(`    disclosure  : lead ${JSON.stringify(LAG_LEAD)}, measured ${LAG_DATE} (from preset-lag.ts)`);

  // O66: FRESH COPY PER RUN, ENFORCED — before anything is launched. The
  // leftovers that change a verdict: this run's own preset file (row [4a]'s
  // anti-vacuous floor needs it absent), and a shipped document that a prior
  // run's save has already rewritten (row [7d] compares against the bytes
  // aeon shipped, and cannot tell a rewritten file from a shipped one).
  if (existsSync(MINE)) {
    throw new Error(`LEFTOVER FROM A PRIOR RUN: ${MINE} exists. Row [4a] needs ${PRESET_ID} ABSENT at open, `
      + 'and the Ctrl+S that wrote it rewrote the whole project. Re-materialise AEON_DIR — FRESH COPY PER RUN.');
  }
  if (!existsSync(SHIPPED)) throw new Error(`${SHIPPED} is ABSENT — nothing to round-trip`);
  const shippedBefore = readFileSync(SHIPPED, 'utf8');
  const shippedParsed = JSON.parse(shippedBefore);
  if ('cycles' in shippedParsed || 'variants' in shippedParsed) {
    throw new Error(`${SHIPPED} already carries cycles/variants — the "absent key stays absent" round trip `
      + 'has no subject. Re-materialise AEON_DIR from a committed aeon revision.');
  }

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', `-screen 0 ${SCREEN}x24`, ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  let heightsBefore = null;
  let heightsAfter = null;
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
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npx electron-vite build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. THE INSTRUMENT CAN SEE ITS SUBJECT. --------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open', !!(st && st.open), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can be measured');
    await sleep(2500);

    const loaded = await c.json('window.__dbg.aeon.presets()');
    check('1b', `aeon's own ${SHIPPED_ID}.json was LOADED — there is a document to leave untouched`,
      loaded.some((p) => p.id === SHIPPED_ID),
      `${loaded.length} presets: ${JSON.stringify(loaded.map((p) => p.id))}`);
    if (!loaded.some((p) => p.id === SHIPPED_ID)) throw new Error(`${SHIPPED_ID} absent — the round trip has no subject`);
    const unreadable = await c.json('window.__dbg.aeon.unreadablePresets()');
    check('1c', 'no preset file in the project was unreadable', unreadable.length === 0, JSON.stringify(unreadable));
    const shippedDoc = await docOf(c, SHIPPED_ID);
    check('1d', `ANTI-VACUOUS: the loaded ${SHIPPED_ID} has NEITHER key in the MODEL, and ${PRESET_ID} is absent`,
      shippedDoc !== null && !('cycles' in shippedDoc) && !('variants' in shippedDoc)
      && !loaded.some((p) => p.id === PRESET_ID),
      `keys of ${SHIPPED_ID}: ${JSON.stringify(Object.keys(shippedDoc ?? {}))}`);

    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('1e', 'the Effects facet mounts', clicked === true, `click → ${clicked}`);
    await sleep(1200);
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1000);

    // ---- 2. THE SECTION, THE DISCLOSURE, THE CONTROLS. -------------------
    const PRESET_PROOF = `document.querySelector('input[placeholder="new_preset_id"]')`;
    const opened = await c.evalExpr(OPEN_SECTION(BANDS_RE, PRESET_PROOF));
    await sleep(900);
    const isOpen = await c.evalExpr(`!!(${PRESET_PROOF})`);
    check('2a', 'the Raster band presets section is OPEN', isOpen === true && opened !== 'no-header',
      `section → ${opened}, open after settle = ${isOpen}`);

    // Select the shipped preset THROUGH ITS LIST BUTTON (title = `label (id)`).
    const pickedShipped = await c.evalExpr(String.raw`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.title || '').endsWith('(${SHIPPED_ID})'));
      if (!b) return 'no-button'; b.click(); return true;
    })()`);
    await sleep(700);
    const selNow = await c.json('window.__dbg.aeon.selectedPreset()');
    check('2b', `clicking the list entry selects ${SHIPPED_ID} — the channels section has a subject`,
      pickedShipped === true && selNow === SHIPPED_ID, `click → ${pickedShipped}; selected = ${JSON.stringify(selNow)}`);

    // THE FOLD, BEFORE: the channels section is SHUT by default, so what the
    // parcel adds to the column at rest is one header row. Measured, not
    // assumed; the bands section's own height is the number O15 guards.
    heightsBefore = await c.json(HEIGHTS(SHIPPED_ID));
    const chanOpened = await c.evalExpr(OPEN_SECTION(CHANNELS_RE(SHIPPED_ID), CYCLES_SEL));
    await sleep(900);
    const chanIsOpen = await c.evalExpr(`!!(${CYCLES_SEL})`);
    heightsAfter = await c.json(HEIGHTS(SHIPPED_ID));
    check('2c', `the "Preset — ${SHIPPED_ID} — cycles, variants" section exists, was SHUT, and opens`,
      chanOpened === 'clicked' && chanIsOpen === true,
      `open → ${chanOpened}; cycles select present after = ${chanIsOpen}; `
      + `before ${JSON.stringify(heightsBefore)} after ${JSON.stringify(heightsAfter)}`);
    if (chanIsOpen !== true) throw new Error('channels section did not open — nothing below can be measured');

    // THE FLOOR: both selects FOUND, offering the provider's three/two spellings.
    const shape = await c.json(String.raw`(() => {
      const opts = (s) => (s ? [...s.options].map((o) => o.value) : null);
      return { cycles: opts(${CYCLES_SEL}), variants: opts(${VARIANTS_SEL}),
               cyclesValue: (${CYCLES_SEL} || {}).value, variantsValue: (${VARIANTS_SEL} || {}).value };
    })()`);
    check('2d', 'the cycles and variants selects are FOUND by their row labels, each offering every spelling',
      shape.cycles !== null && shape.variants !== null
      && shape.cycles.slice().sort().join(',') === 'absent,authored,off'
      && shape.variants.slice().sort().join(',') === 'absent,present',
      shape.cycles === null || shape.variants === null
        ? `NO ELEMENT MATCHED — selector rot, or the control is not rendered: ${JSON.stringify(shape)}`
        : JSON.stringify(shape));
    if (shape.cycles === null || shape.variants === null) throw new Error('key selects not found — sections 3-7 cannot be measured');
    check('2e', `both read "absent" for ${SHIPPED_ID} — the widget agrees with the model's missing keys`,
      shape.cyclesValue === 'absent' && shape.variantsValue === 'absent'
      && (await cyclesStateOf(c, SHIPPED_ID)) === 'absent',
      `widgets ${shape.cyclesValue}/${shape.variantsValue}; model cycles state ${await cyclesStateOf(c, SHIPPED_ID)}`);

    // THE DISCLOSURE: smallest element carrying the lead; painted; FIRST.
    const disc = await c.json(String.raw`(() => {
      const lead = ${JSON.stringify(LAG_LEAD)};
      const s = ${CYCLES_SEL};
      // The WHOLE sentence's smallest carrier — the lead alone lives in an
      // inner <span> (first run of this row found that span, and "same body"
      // then measured the span's parent). Carrying the measurement clause too
      // is what distinguishes the Hint from its own first word.
      const whole = (d) => (d.innerText || '').startsWith(lead) && /Measured \d{4}-\d{2}-\d{2}/.test(d.innerText || '');
      const leaves = [...document.querySelectorAll('div,span,p')]
        .filter((d) => whole(d) && ![...d.children].some(whole));
      const leaf = leaves[0] || null;
      if (!leaf) return { leaf: false };
      leaf.scrollIntoView({ block: 'center' });
      const b = leaf.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return {
        leaf: true, text: (leaf.innerText || '').trim(), rect: b.toJSON(),
        rects: leaf.getClientRects().length,
        visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
        hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
        // 4 = DOCUMENT_POSITION_FOLLOWING: the FIRST control comes AFTER the sentence.
        beforeCycles: !!(s && (leaf.compareDocumentPosition(s) & 4) === 4),
        sameBody: !!(s && leaf.parentElement && leaf.parentElement.contains(s)),
      };
    })()`);
    // ROW [2f] ASKS WHICHEVER QUESTION THE PREMISE MAKES TRUE, and it is told
    // which by preset-lag.ts, not by a constant here. Until 2026-09-02 the
    // premise was ['cycles','variants'] and this row required the sentence
    // PAINTED and FIRST. aeon MERGED item 5, the premise emptied, and the row
    // now requires the opposite: NOTHING on this screen may still tell the
    // author the engine ignores what they are about to type. Both branches
    // screenshot, so the retirement is photographed the way the sentence was.
    check('2f', PREMISE_OPEN
      ? 'the disclosure is on screen — painted, dated, and BEFORE the first control in the same body'
      : `the disclosure is RETIRED (premise empty in preset-lag.ts) — NO element on the open `
        + `section says ${JSON.stringify(LAG_LEAD)}`,
      PREMISE_OPEN
        ? (disc.leaf === true && disc.text.startsWith(LAG_LEAD)
          && disc.text.includes(`Measured ${LAG_DATE}`) && disc.text.includes(`Expires (${LAG_DATE})`)
          // ⚠ WORDING-AGNOSTIC ON PURPOSE, fixed 2026-09-03. This clause used to
          // pin `/refuses (?:it|both) by name at origin\/master/` — the 12aecd5
          // phrasing. EW-CHANNELS-WRITER re-worded the sentence for the sharper
          // `patch_*` lag ("does not accept them at origin/master and refuses
          // the WHOLE DOCUMENT") and this row went red on a correct screen; it
          // was one of the four pre-existing failures the EW-TIMELINE-CLOCK
          // control run isolated. The two clauses below are the ones BOTH
          // wordings have carried, and the exact phrasing is owned by
          // preset-lag-disclosure.test.ts, which drives the derivation directly.
          // A copy of today's sentence here would be a second source of truth
          // that goes stale the next time the premise's flavour changes.
          && /at origin\/master/.test(disc.text)
          && /nothing set below reaches a ROM/.test(disc.text)
          && disc.rects > 0 && disc.visible !== false && disc.hitInside === true
          && disc.beforeCycles === true && disc.sameBody === true)
        : disc.leaf === false,
      JSON.stringify({ premise: LAG_KEYS, ...disc }));
    {
      const shot = await c.send('Page.captureScreenshot', { format: 'png' });
      const name = disc.leaf ? 'disclosure.png' : 'disclosure-retired.png';
      writeFileSync(`${SHOTS}/${name}`, Buffer.from(shot.data, 'base64'));
      console.log(`        screenshot  : ${SHOTS}/${name}`);
    }

    // ---- 3. TOUCH NOTHING ON THE SHIPPED DOCUMENT. -----------------------
    // The section was opened for it; that alone must not dirty the project or
    // write a key. (The byte identity itself is row [7d], after the real save.)
    const stAfterOpen = await c.json('window.__dbg.aeon.state()');
    const shippedAfterOpen = await docOf(c, SHIPPED_ID);
    check('3a', `opening the section for ${SHIPPED_ID} authored nothing: not dirty, still no keys`,
      stAfterOpen.dirty === false && !('cycles' in shippedAfterOpen) && !('variants' in shippedAfterOpen),
      `dirty=${stAfterOpen.dirty}; keys ${JSON.stringify(Object.keys(shippedAfterOpen))}`);

    // ---- 4. CREATE THIS RUN'S PRESET THROUGH THE UI. ---------------------
    const typed = await c.evalExpr(SET_INPUT(PRESET_PROOF, PRESET_ID));
    const pressedNew = await c.evalExpr(String.raw`(() => {
      const input = ${PRESET_PROOF};
      if (!input) return 'no-input';
      const btn = [...input.parentElement.querySelectorAll('button')].find((b) => /^New$/.test((b.textContent || '').trim()));
      if (!btn) return 'no-button'; if (btn.disabled) return 'disabled'; btn.click(); return true;
    })()`);
    await sleep(900);
    const mine0 = await docOf(c, PRESET_ID);
    const chanMine = await c.evalExpr(`!!(${SECTION_ROOT(CHANNELS_RE(PRESET_ID))}) && !!(${CYCLES_SEL})`);
    check('4a', `New creates ${PRESET_ID} in the MODEL with neither key, and the channels section follows it`,
      typed === 'ok' && pressedNew === true && mine0 !== null && !('cycles' in mine0) && !('variants' in mine0)
      && chanMine === true && (await c.json('window.__dbg.aeon.selectedPreset()')) === PRESET_ID,
      `typed=${typed} new=${pressedNew}; doc=${JSON.stringify(mine0)}; section for ${PRESET_ID} open=${chanMine}`);
    if (mine0 === null) throw new Error(`${PRESET_ID} was not created — nothing below can be measured`);

    // ---- 5. CYCLES: absent → authored → (edit, add, undo) → off. ---------
    const pickAuth = await c.evalExpr(SET_SELECT(CYCLES_SEL, 'authored'));
    await sleep(600);
    let d = await docOf(c, PRESET_ID);
    check('5a', 'picking "authored" writes ONE seeded channel with exactly the four required fields',
      pickAuth === 'ok' && (await cyclesStateOf(c, PRESET_ID)) === 'authored'
      && Array.isArray(d.cycles) && d.cycles.length === 1
      && Object.keys(d.cycles[0]).sort().join(',') === 'count,first,line,period',
      `set → ${pickAuth}; cycles = ${JSON.stringify(d.cycles)}`);

    // NO BOUND: 300 is past any CRAM index; the control forwards it verbatim.
    const typed300 = await c.evalExpr(SET_INPUT(NUM_IN('first'), 300));
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    const firstWidget = await c.evalExpr(String.raw`(${NUM_IN('first')}).value`);
    const firstAttrs = await c.json(String.raw`(() => { const i = ${NUM_IN('first')}; return { min: i.getAttribute('min'), max: i.getAttribute('max') }; })()`);
    check('5b', 'typing first=300 lands 300 in the MODEL — no clamp, no min/max on the spinner',
      typed300 === 'ok' && d.cycles[0].first === 300 && firstWidget === '300'
      && firstAttrs.min === null && firstAttrs.max === null,
      `model first=${JSON.stringify(d.cycles[0].first)} widget=${firstWidget} attrs=${JSON.stringify(firstAttrs)}`);

    // The optional field: absent → "absent — set" chip → 0 → Unset → absent.
    const setDir = await c.evalExpr(String.raw`(() => {
      const row = [...document.querySelectorAll('div')].find((x) => x.firstElementChild && x.firstElementChild.tagName === 'SPAN'
        && (x.firstElementChild.textContent || '').trim() === 'dir');
      if (!row) return 'no-row';
      const chip = [...row.querySelectorAll('button')].find((b) => /absent — set/.test(b.textContent || ''));
      if (!chip) return 'no-chip'; chip.click(); return true;
    })()`);
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    const dirSet = d.cycles[0].dir;
    const unsetDir = await c.evalExpr(clickByText('/Unset dir on cycle channel 0$/'));
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    check('5c', 'dir: the "absent — set" chip writes 0, and Unset deletes the key again (not 0, not null)',
      setDir === true && dirSet === 0 && unsetDir === true && !('dir' in d.cycles[0]),
      `set → ${setDir}, dir=${JSON.stringify(dirSet)}; unset → ${unsetDir}, keys ${JSON.stringify(Object.keys(d.cycles[0]))}`);

    const added = await c.evalExpr(clickByText('/^Add channel$/'));
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    const lenAfterAdd = Array.isArray(d.cycles) ? d.cycles.length : -1;
    await UNDO(c);
    await sleep(700);
    d = await docOf(c, PRESET_ID);
    check('5d', 'Add channel appends one; ONE Ctrl+Z removes exactly that one (one undo step per gesture)',
      added === true && lenAfterAdd === 2 && Array.isArray(d.cycles) && d.cycles.length === 1 && d.cycles[0].first === 300,
      `after add ${lenAfterAdd}; after one undo ${JSON.stringify(d.cycles)}`);

    const pickOff = await c.evalExpr(SET_SELECT(CYCLES_SEL, 'off'));
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    const offState = await cyclesStateOf(c, PRESET_ID);
    const rePickOff = await c.evalExpr(SET_SELECT(CYCLES_SEL, 'off'));
    await sleep(400);
    await UNDO(c);
    await sleep(700);
    const backState = await cyclesStateOf(c, PRESET_ID);
    const back = await docOf(c, PRESET_ID);
    check('5e', 'picking "off" writes null (the key PRESENT); re-picking burns no step; one Ctrl+Z restores the script',
      pickOff === 'ok' && 'cycles' in d && d.cycles === null && offState === 'off'
      && rePickOff === 'ok' && backState === 'authored' && Array.isArray(back.cycles) && back.cycles[0].first === 300,
      `off → ${JSON.stringify(d.cycles)} (${offState}); after re-pick + one undo → ${JSON.stringify(back.cycles)} (${backState})`);
    // Leave it OFF for the file — the brief's ask.
    await c.evalExpr(SET_SELECT(CYCLES_SEL, 'off'));
    await sleep(600);
    const finalCycles = await docOf(c, PRESET_ID);
    check('5f', 'cycles ends OFF: null on the model, and the widget shows "off"',
      finalCycles.cycles === null && (await c.evalExpr(String.raw`(${CYCLES_SEL}).value`)) === 'off',
      JSON.stringify(finalCycles.cycles));

    // ---- 6. VARIANTS: absent → [] → slot 0 authored → fields → slot 1 null.
    const pickPresent = await c.evalExpr(SET_SELECT(VARIANTS_SEL, 'present'));
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    const slot0Opts = await c.json(String.raw`(() => { const s = ${SLOT_SEL(0)}; return s ? { value: s.value, options: [...s.options].map((o) => o.value) } : null; })()`);
    check('6a', 'picking "present" writes [] — the key PRESENT and EMPTY — and offers ONE unreached slot card',
      pickPresent === 'ok' && 'variants' in d && Array.isArray(d.variants) && d.variants.length === 0
      && slot0Opts !== null && slot0Opts.value === 'unreached'
      && slot0Opts.options.slice().sort().join(',') === 'authored,cleared,unreached'
      && (await c.evalExpr(`!!(${SLOT_SEL(1)})`)) === false,
      `variants = ${JSON.stringify(d.variants)}; slot 0 = ${JSON.stringify(slot0Opts)}`);

    const auth0 = await c.evalExpr(SET_SELECT(SLOT_SEL(0), 'authored'));
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    check('6b', 'slot 0 → "author" writes {} at index 0 and a slot 1 card (unreached) appears',
      auth0 === 'ok' && Array.isArray(d.variants) && d.variants.length === 1
      && d.variants[0] !== null && typeof d.variants[0] === 'object' && Object.keys(d.variants[0]).length === 0
      && (await c.evalExpr(String.raw`((${SLOT_SEL(1)}) || {}).value`)) === 'unreached',
      `variants = ${JSON.stringify(d.variants)}`);

    // A numeric field: the "absent" chip seeds 0; typing forwards verbatim.
    const chipShiftR = await c.evalExpr(String.raw`(() => {
      const row = [...document.querySelectorAll('div')].find((x) => x.firstElementChild && x.firstElementChild.tagName === 'SPAN'
        && (x.firstElementChild.textContent || '').trim() === 'absent');
      if (!row) return 'no-row';
      const chip = [...row.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'shift_r');
      if (!chip) return 'no-chip'; chip.click(); return true;
    })()`);
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    const seeded = d.variants[0].shift_r;
    const typedShift = await c.evalExpr(SET_INPUT(NUM_IN('shift_r'), 3));
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    check('6c', 'the shift_r chip seeds 0; typing 3 lands 3 in the model, and nothing else was written',
      chipShiftR === true && seeded === 0 && typedShift === 'ok' && d.variants[0].shift_r === 3
      && Object.keys(d.variants[0]).join(',') === 'shift_r',
      `seeded ${JSON.stringify(seeded)}; typed → ${typedShift}; slot 0 = ${JSON.stringify(d.variants[0])}`);

    // The bitmask: the chip seeds 0b1110; L0 flips bit 0 on; L2 flips bit 2 off.
    const chipLines = await c.evalExpr(String.raw`(() => {
      const row = [...document.querySelectorAll('div')].find((x) => x.firstElementChild && x.firstElementChild.tagName === 'SPAN'
        && (x.firstElementChild.textContent || '').trim() === 'absent');
      if (!row) return 'no-row';
      const chip = [...row.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'lines');
      if (!chip) return 'no-chip'; chip.click(); return true;
    })()`);
    await sleep(600);
    const linesSeed = (await docOf(c, PRESET_ID)).variants[0].lines;
    const l0 = await c.evalExpr(clickByText('/^L0$/'));
    await sleep(500);
    const linesL0 = (await docOf(c, PRESET_ID)).variants[0].lines;
    const l2 = await c.evalExpr(clickByText('/^L2$/'));
    await sleep(500);
    d = await docOf(c, PRESET_ID);
    const readout = await c.evalExpr(String.raw`(() => {
      const row = [...document.querySelectorAll('div')].find((x) => x.firstElementChild && x.firstElementChild.tagName === 'SPAN'
        && (x.firstElementChild.textContent || '').trim() === 'lines');
      return row ? (row.innerText || '').replace(/\s+/g, ' ').trim() : null;
    })()`);
    check('6d', 'lines is the INTEGER BITMASK on the wire: chip seeds 14 (0b1110), L0 → 15, L2 → 11, readout shows the integer',
      chipLines === true && linesSeed === 14 && l0 === true && linesL0 === 15 && l2 === true && d.variants[0].lines === 11
      && typeof d.variants[0].lines === 'number' && /= 11\b/.test(readout || ''),
      `seed ${linesSeed} → L0 ${linesL0} → L2 ${JSON.stringify(d.variants[0].lines)}; row reads ${JSON.stringify(readout)}`);

    const clear1 = await c.evalExpr(SET_SELECT(SLOT_SEL(1), 'cleared'));
    await sleep(600);
    d = await docOf(c, PRESET_ID);
    check('6e', 'slot 1 → "clear" writes null at index 1 — the array now reaches it, and slot 0 is untouched',
      clear1 === 'ok' && Array.isArray(d.variants) && d.variants.length === 2 && d.variants[1] === null
      && d.variants[0] !== null && d.variants[0].shift_r === 3 && d.variants[0].lines === 11
      && (await c.evalExpr(String.raw`((${SLOT_SEL(2)}) || {}).value`)) === 'unreached',
      `variants = ${JSON.stringify(d.variants)}`);

    // Unreached TRUNCATES, and one undo puts the null back — then leave it.
    const unreach1 = await c.evalExpr(SET_SELECT(SLOT_SEL(1), 'unreached'));
    await sleep(600);
    const truncated = (await docOf(c, PRESET_ID)).variants;
    await UNDO(c);
    await sleep(700);
    d = await docOf(c, PRESET_ID);
    check('6f', 'slot 1 → "keep hand-authored" TRUNCATES the array to 1 (never writes undefined); one Ctrl+Z restores the null',
      unreach1 === 'ok' && Array.isArray(truncated) && truncated.length === 1
      && Array.isArray(d.variants) && d.variants.length === 2 && d.variants[1] === null,
      `truncated ${JSON.stringify(truncated)}; after one undo ${JSON.stringify(d.variants)}`);

    // ---- 7. ALL THE WAY TO THE FILE. -------------------------------------
    const dirtyBefore = (await c.json('window.__dbg.aeon.state()')).dirty;
    await SAVE(c);
    await sleep(3500);
    const dirtyAfter = (await c.json('window.__dbg.aeon.state()')).dirty;
    check('7a', 'a REAL Ctrl+S ran and cleared the dirty flag',
      dirtyBefore === true && dirtyAfter === false, `dirty ${dirtyBefore} -> ${dirtyAfter}`);

    const wrote = existsSync(MINE) ? readFileSync(MINE, 'utf8') : null;
    const parsed = wrote === null ? null : JSON.parse(wrote);
    check('7b', `${PRESET_ID}.json ON DISK: cycles is null, variants is [{lines: 11, shift_r: 3}, null]`,
      parsed !== null && 'cycles' in parsed && parsed.cycles === null
      && JSON.stringify(parsed.variants) === JSON.stringify([{ lines: 11, shift_r: 3 }, null]),
      wrote === null ? `NOT WRITTEN at ${MINE}` : `${wrote.length}B: ${wrote.replace(/\s+/g, ' ')}`);
    // aeon's normative form, reproduced independently of the codec so this row
    // measures the BYTES rather than agreeing with the writer.
    const sortDeep = (v) => Array.isArray(v) ? v.map(sortDeep)
      : (v && typeof v === 'object')
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]))
        : v;
    const canonical = wrote === null ? null : JSON.stringify(sortDeep(JSON.parse(wrote)), null, 2) + '\n';
    check('7c', 'the bytes are canonical, spell `"cycles": null` literally, and spell the cleared slot as a bare `null`',
      wrote !== null && wrote === canonical && /"cycles": null,\n/.test(wrote) && /\},\n\s+null\n\s+\]/.test(wrote),
      wrote === null ? 'nothing written' : `canonical=${wrote === canonical}; top-level ${JSON.stringify(Object.keys(parsed))}`);

    const shippedAfter = existsSync(SHIPPED) ? readFileSync(SHIPPED, 'utf8') : null;
    check('7d', `${SHIPPED_ID}.json — opened, section shown, never touched — is BYTE-IDENTICAL, and still has neither key`,
      shippedAfter === shippedBefore && !/"cycles"/.test(shippedAfter ?? '"cycles"') && !/"variants"/.test(shippedAfter ?? '"variants"'),
      `${shippedBefore.length}B before, ${shippedAfter === null ? 'ABSENT' : `${shippedAfter.length}B`} after; `
      + `identical=${shippedAfter === shippedBefore}`);

    // ---- 8. THE PICTURE OF THE AUTHORED STATE. ---------------------------
    await c.evalExpr(String.raw`(() => { const s = ${CYCLES_SEL}; if (s) s.scrollIntoView({ block: 'start' }); return 'ok'; })()`);
    await sleep(500);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/authored.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/authored.png`);
    const heightsEnd = await c.json(HEIGHTS(PRESET_ID));
    console.log(`    heights     : before(shut) ${JSON.stringify(heightsBefore)}`);
    console.log(`                  after(open, ${SHIPPED_ID}, neither key) ${JSON.stringify(heightsAfter)}`);
    console.log(`                  end(open, ${PRESET_ID}, authored) ${JSON.stringify(heightsEnd)}`);
    check('8a', 'O15: the BANDS section height did not move when the channels section opened, and the shut header is one row',
      heightsBefore !== null && heightsAfter !== null
      && heightsBefore.bandsSection === heightsAfter.bandsSection
      && heightsBefore.channelsSection !== null && heightsBefore.channelsSection < 48
      && heightsAfter.channelsSection > heightsBefore.channelsSection,
      `bands ${heightsBefore?.bandsSection} → ${heightsAfter?.bandsSection}; channels ${heightsBefore?.channelsSection} → ${heightsAfter?.channelsSection} → ${heightsEnd.channelsSection}`);
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    // O66: AWAITED, and the ChildProcess rather than its pid — rule G5.
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
