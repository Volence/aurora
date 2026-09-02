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
//     detail, or below the section's scroll edge. Rows 3a..3c read
//     `innerText` (which excludes attribute text and `display:none` subtrees),
//     not `textContent`, and row 3e asserts the block is inside the painted box
//     of its own scroller.
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
    check('3a', 'LIMIT 1 is visible: section 5 is wired and no other section is',
      /rasterRef/.test(panelText) && /ONLY SECTION 5 IS WIRED/.test(panelText)
      && /BINDING ANY OTHER SECTION STILL REACHES NOTHING/.test(panelText)
      && /a preset split plus one call-site line/i.test(panelText)
      && /costs ROM/i.test(panelText),
      `rasterRef=${/rasterRef/.test(panelText)} `
      + `sec5Wired=${/ONLY SECTION 5 IS WIRED/.test(panelText)} `
      + `othersReachNothing=${/BINDING ANY OTHER SECTION STILL REACHES NOTHING/.test(panelText)} `
      + `splitPlusLine=${/a preset split plus one call-site line/i.test(panelText)} `
      + `costsROM=${/costs ROM/i.test(panelText)}`);
    check('3b', 'LIMIT 2 is visible: seeing it is a debug chord over a hand-typed table',
      /START/.test(panelText) && /hand-typed dc\.l list/.test(panelText)
      && /does not add itself/i.test(panelText) && /fails loudly/i.test(panelText),
      `chord=${/START/.test(panelText)} handTyped=${/hand-typed dc\.l list/.test(panelText)} `
      + `notSelfAdding=${/does not add itself/i.test(panelText)} `
      + `loud=${/fails loudly/i.test(panelText)}`);
    check('3c', 'LIMIT 3 is visible: nothing checks that a band is visible',
      /builds green and shows nothing/i.test(panelText)
      && /unused palette entry/i.test(panelText));
    check('3d', "the ACCURATE headline is visible, not the inaccurate one",
      /An author can author a raster band/.test(panelText)
      && /programmer wires it up in one line/.test(panelText)
      // The sentence aeon's page exists to prevent must not appear anywhere.
      && !/no longer needs a programmer/i.test(panelText));
    // ⚠ MATCHER MOVED 2026-08-30 (O64): it pinned "never been looked at on
    // screen", which aeon `4a4d3474` made false; NO_PREVIEW now cites that
    // one frame and says none is built against it. Both halves are pinned
    // here so "aeon measured it" cannot paint as "you can preview it".
    check('3e', 'and it says there is no preview, rather than leaving a silence',
      /No preview\. This editor draws no band/.test(panelText)
      && /could at most be checked against that one frame; none is built/i.test(panelText)
      && /aeon 4a4d3474 \(2026-08-30\)/.test(panelText)
      && !/never been looked at on screen/i.test(panelText),
      `drawsNone=${/This editor draws no band/.test(panelText)} `
      + `noneBuilt=${/none is built/i.test(panelText)} `
      + `anchor=${/aeon 4a4d3474 \(2026-08-30\)/.test(panelText)} `
      + `retiredPhraseGone=${!/never been looked at on screen/i.test(panelText)}`);

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
    const openedBands = await c.evalExpr(OPEN_SECTION(
      // NEITHER \b NOR (?!\w) HERE, and BOTH cost a run. The header's
      // textContent runs straight into the `right` slot's own label —
      // "Preset — harness_bandDelete" — so there is no word boundary between
      // "d" and "D", and "D" is itself a word character. The bound that is
      // actually correct comes from the ID'S OWN CHARSET (^[a-z][a-z0-9_]{0,31}$
      // in the schema): no legal id character can follow, so a longer id cannot
      // be matched by mistake, and any action label can.
      PLANT === 'rot-section'
        // THE PLANT: the `\b` this really carried for two runs. "Preset —
        // harness_bandDelete" has no boundary between "d" and "D".
        ? String.raw`/^Preset — ${PRESET_ID}\b/`
        : String.raw`/^Preset — ${PRESET_ID}(?![a-z0-9_])/`, BANDS_PROOF));
    await sleep(900);
    const bandsOpen = await c.evalExpr(SECTION_IS_OPEN(BANDS_PROOF));
    check('4c', 'the band editor section opens',
      bandsOpen === true && openedBands !== 'no-header',
      `bands section → ${openedBands}, open after settle = ${bandsOpen}`);

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
