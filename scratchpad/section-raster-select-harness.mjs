#!/usr/bin/env node
// THE PER-SECTION RASTER SELECT, IN THE RUNNING APP. (ROADMAP row 93.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// The node suite cannot see React. `section-raster-select.test.ts` reads the
// panel SOURCE and calls the provider — the best a node suite can do, and NOT
// the same claim as:
//
//        IN THE RUNNING APP, AN AUTHOR OPENS THE BAND PRESET PANEL, PICKS A
//        PRESET FROM A DROPDOWN, AND THAT SECTION'S `rasterRef` IS BOUND —
//        THEN PICKS THE EMPTY OPTION AND IT IS UNBOUND AGAIN, ALL THE WAY TO
//        THE SIDECAR ON DISK.
//
// Two claims: that the control is reachable and that it works. This repo's
// observed rate for UI shipped on unit tests alone is three defects in ten
// minutes of real use, and every one of the rows below is the kind a source
// grep cannot make.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE SELECTOR MATCHES NOTHING and every `.find()` is undefined, so a row
//     shaped "no X went wrong" passes vacuously. Row [2b] is the FLOOR: the
//     select was found, it holds more than one option, and one of them is
//     aeon's shipped preset — asserted BEFORE anything is picked. PLANT=rot-
//     select reproduces the end-anchored rot that has cost this repo five runs.
//
//   • NOTHING IS LOADED. A project that failed to open has no sections, so
//     "the binding is null" is true for the wrong reason and every unbind row
//     passes over an empty app. Rows [1a]/[1b]/[1c] refuse to continue unless
//     the project is open WITH sections and aeon's own preset reached the
//     model, and the run THROWS rather than printing passes.
//
//   • THE CONTROL IS PRESENT BUT UNREACHABLE — in a collapsed section, below
//     the scroll edge, or clipped away. Row [2c] asserts the select is inside
//     the painted box of its own scroller and that `elementFromPoint` at its
//     centre lands on it, which a `display:none` subtree cannot satisfy.
//
//   • THE WIDGET MOVES AND THE MODEL DOES NOT. A `<select>` renders whatever
//     option the browser put on screen even when `onChange` does nothing, so
//     reading the control back measures the BROWSER. Every binding row reads
//     `window.__dbg.aeon.rasterRef(N)` — the MODEL — and section 5 reads the
//     SIDECAR BYTES after a real Ctrl+S.
//
//   • THE LIMIT IS NOT ABOVE THE CONTROL. The placement is the design call;
//     row [2d] measures it with `getBoundingClientRect`, not by assuming.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. Every rect, `dpr` and hit test is read
// in ONE session and printed together — `devicePixelRatio` on this machine has
// been observed at both 1 and 1.35 hours apart.
//
// ⚠ NO EMULATOR, EVER. Nothing here runs a ROM. The band a bound preset names
// has been looked at on screen once in this suite — aeon `4a4d3474`
// (2026-08-30), in aeon's emulator, in aeon's tree; until then never — and this
// harness does not add to that: it photographs the AUTHORING surface. What a
// bound band LOOKS like in THIS editor stays unmeasured, which is
// `RASTER_SECTION_BINDING_LIMIT`'s own subject.
//
// CLEANUP IS BY PID, ALWAYS — `spawnGuarded` + `killTree`. No `pkill` on a
// pattern: from a worktree that kills the owner's editor and spares this run's
// orphan.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:section-raster-select
//
//   ⚠ FRESH COPY PER RUN (O66). The Ctrl+S in section 5 rewrites the whole
//   project and section 6 plants a ghost rasterRef in section 0's sidecar, so
//   the copy is CONSUMED. A second run on the same copy is refused before the
//   app is launched — exit 2, `HARNESS ABORTED: LEFTOVER FROM A PRIOR RUN: …`
//   naming the sidecar and the value — never a silent 21/23. Re-materialise:
//     git -C <aeon> archive <committed rev> | tar -x -C <fresh dir>
//
//   PLANT=rot-select   … rot the select finder so it matches nothing; [2b] must
//                        catch it and the run must ABORT before section 3
//   PLANT=no-model     … read the binding back off the WIDGET instead of the
//                        model. MEASURED: 20/23 rows stay GREEN — [1c], [4c]
//                        and [6a] are the only three that can tell the two
//                        apart. That is the honest size of the hazard: reading
//                        a `<select>` back mostly agrees with the model, and
//                        the disagreement only shows up at the anti-vacuous
//                        floor, across a section switch, and on a ref the
//                        control cannot offer. Every binding row reads the
//                        model anyway, because "mostly agrees" is how this
//                        defect survives.
//
// A THIRD PLANT LIVES IN THE PANEL, NOT HERE, and it is the one that justifies
// this file existing: `value={o.label}` on the option (one character of the
// panel's JSX) left the WHOLE node suite green and `tsc` clean while turning
// NINE rows red here — the select offered display labels as values, so no pick
// could match a preset id and nothing could be bound at all. Restored; a source
// row now covers that instance, and the class stays this harness's.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9438);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 98);
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
const SHOTS = `${ROOT}/scratchpad/shots-section-raster-select`;
mkdirSync(SHOTS, { recursive: true });

const PLANT = process.env.PLANT ?? '';
/** aeon's own shipped preset document — the id this harness binds TO. It is
 *  deliberately a document this repo did not author, so a green here is not
 *  Aurora agreeing with itself. */
const PRESET_ID = process.env.PRESET_ID ?? 'authored_probe';
/** The section under test. 0 has a sidecar in aeon's tree; 1 is the SECOND
 *  section, used to prove the select follows `activeSectionIndex` rather than
 *  drawing section 0 forever. */
const SEC_A = 0;
const SEC_B = 1;
const metaPath = (n) => `${AEONDIR}/games/sonic4/data/editor/ojz/act1/section_${n}.meta.json`;

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

// `\b`, NEVER `$` — the presets section renders its title bare, but a `right`
// slot's label would run straight into it (band-preset-harness paid two runs for
// exactly that). See its note.
const SECTION_RE = String.raw`/^Raster band presets\b/`;

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

/**
 * THE SELECT ITSELF, found by its own `title` — which comes from
 * `RASTER_REF_ROW.title` in the provider, so this selector is pinned to the
 * string the panel is forbidden to retype.
 *
 * ⚠ FOUND BY TITLE, NOT BY POSITION. "the second select in the column" would
 * match the scene panel's assignment row, the S/H picker or the ON-arm picker
 * depending on what is open — three wrong answers that all look like a working
 * selector until the day they are not.
 */
const SELECT = String.raw`
(() => {
  const re = ${PLANT === 'rot-select'
    // THE PLANT: a title no control carries, so this matches NOTHING. Every row
    // from [2b] down reads this element; row [2b] is the floor that must catch
    // it, and the run must abort rather than report section 3 as green.
    ? String.raw`/^Which raster band preset this section uses ONCE\b/`
    : String.raw`/^Which raster band preset this section uses \(rasterRef\)/`};
  return [...document.querySelectorAll('select')].find((s) => re.test(s.title || '')) || null;
})()`;

/** The MODEL's answer, always — never the widget's. PLANT=no-model swaps it for
 *  the widget so the discriminating power of section 3 can be demonstrated
 *  rather than asserted. */
const modelRef = (n) => (PLANT === 'no-model'
  ? String.raw`(() => { const s = ${SELECT}; return s ? (s.value === '' ? null : s.value) : 'NO-SELECT'; })()`
  : `window.__dbg.aeon.rasterRef(${n})`);

async function main() {
  const t0 = Date.now();
  console.log('=== section-raster-select harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  for (const n of [SEC_A, SEC_B]) {
    console.log(`    section ${n} sidecar: ${existsSync(metaPath(n))
      ? JSON.stringify(readFileSync(metaPath(n), 'utf8')) : 'ABSENT'}`);
  }

  // O66: FRESH COPY PER RUN, ENFORCED — before anything is launched.
  //
  // The Ctrl+S in section 5 rewrites the WHOLE project: 25 files measured on
  // aeon 6e2495a5 (every section's objects/rings json, the sidecars, the
  // effects scene, editor_bg_override.json, ojz_bglib.json, chunks.json — the
  // save plan's serialisation, not a set this harness chooses), and the last
  // thing section 6 does is plant `rasterRef: "ghost_preset"` into section
  // SEC_A's sidecar. Nothing here can honestly put those bytes back (a restore
  // in `finally` never runs on Ctrl+C either), so a second run on the same
  // copy used to open on a section that was ALREADY bound and print 21/23 with
  // [1c] red for a reason that was this harness's own doing. The one leftover
  // that changes a verdict is a rasterRef on a section this run binds; it is
  // read straight off the disk, and the run REFUSES (exit 2, via the abort
  // path below) naming the file and the value.
  for (const n of [SEC_A, SEC_B]) {
    if (!existsSync(metaPath(n))) continue;
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(metaPath(n), 'utf8')); } catch (e) {
      throw new Error(`LEFTOVER CHECK CANNOT READ ${metaPath(n)}: ${e.message} — `
        + 'refusing to launch over a sidecar it cannot classify');
    }
    if (parsed && parsed.rasterRef !== undefined && parsed.rasterRef !== null) {
      throw new Error(`LEFTOVER FROM A PRIOR RUN: ${metaPath(n)} already carries `
        + `rasterRef=${JSON.stringify(parsed.rasterRef)}. This harness binds section ${n} and its `
        + 'anti-vacuous floor [1c] needs it UNBOUND at open; a previous run\'s Ctrl+S (or its ghost plant) '
        + 'left this, and that Ctrl+S rewrote the whole project, so nothing here can restore it. '
        + 'Re-materialise AEON_DIR from a committed aeon revision — FRESH COPY PER RUN.');
    }
  }

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
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npx electron-vite build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. THE INSTRUMENT CAN SEE ITS SUBJECT. --------------------------
    //
    // Every row below is about a binding on a section, so an app with no
    // project and no sections would make the unbind rows true for the wrong
    // reason. These three refuse rather than report.
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open, with at least two sections',
      !!(st && st.open && st.sections > 1), JSON.stringify(st));
    if (!st || !st.open || st.sections < 2) {
      throw new Error('project did not open with two sections — nothing below can be measured');
    }
    await sleep(2500);

    const loaded = await c.json('window.__dbg.aeon.presets()');
    check('1b', `aeon's own ${PRESET_ID}.json was LOADED — there is something to bind TO`,
      loaded.some((p) => p.id === PRESET_ID),
      `${loaded.length} presets: ${JSON.stringify(loaded.map((p) => p.id))}`);
    if (!loaded.some((p) => p.id === PRESET_ID)) {
      throw new Error(`${PRESET_ID} absent — every binding row below would be vacuous`);
    }

    // ANTI-VACUOUS: the section starts UNBOUND, asserted before anything is
    // picked. Without this, "binding landed" cannot be told from "it was
    // already there", which is the false green band-preset-harness caught in
    // its own fixture.
    const startRef = await c.json(modelRef(SEC_A));
    check('1c', `ANTI-VACUOUS: section ${SEC_A} has NO rasterRef before anything is picked`,
      startRef === null, `rasterRef(${SEC_A}) at open = ${JSON.stringify(startRef)}`);

    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('1d', 'the Effects facet mounts', clicked === true, `click → ${clicked}`);
    await sleep(1200);

    // ---- 2. THE CONTROL IS ON SCREEN AND REACHABLE. ----------------------
    const PRESET_PROOF = `document.querySelector('input[placeholder="new_preset_id"]')`;
    const opened = await c.evalExpr(OPEN_SECTION(SECTION_RE, PRESET_PROOF));
    await sleep(900);
    const isOpen = await c.evalExpr(`!!(${PRESET_PROOF})`);
    check('2a', 'the Raster band presets section is OPEN',
      isOpen === true && opened !== 'no-header',
      `section → ${opened}, open after settle = ${isOpen}`);

    // THE FLOOR. Found, populated, and offering the id this run is about —
    // asserted BEFORE anything reads a value off it.
    const shape = await c.json(String.raw`(() => {
      const s = ${SELECT};
      if (!s) return { found: false };
      return { found: true, value: s.value, title: (s.title || '').slice(0, 60),
               options: [...s.options].map((o) => ({ value: o.value, label: o.textContent })) };
    })()`);
    check('2b', 'the raster select is FOUND, and offers the unbind option plus aeon\'s preset',
      shape.found === true
      && shape.options.length >= 2
      && shape.options[0].value === ''
      && shape.options.some((o) => o.value === PRESET_ID),
      shape.found === false
        ? 'NO ELEMENT MATCHED — selector rot, or the control is not rendered'
        : JSON.stringify(shape));
    if (shape.found !== true) {
      throw new Error('raster select not found — sections 3-5 cannot be measured');
    }

    // PAINTED, not merely present. A rect is real even when a scrolling section
    // has clipped it away; and a strict `elementFromPoint` at the integer
    // centre is what a `display:none` or covered control cannot satisfy.
    await c.evalExpr(String.raw`(() => { const s = ${SELECT}; if (s) s.scrollIntoView({ block: 'center' }); return 'ok'; })()`);
    await sleep(600);
    const paint = await c.json(String.raw`(() => {
      const s = ${SELECT};
      const b = s.getBoundingClientRect();
      let sc = s.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
      const outer = sc ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { dpr: window.devicePixelRatio, rect: b.toJSON(), aim: { x, y },
               inside: b.top >= outer.top - 1 && b.bottom <= outer.bottom + 1,
               rects: s.getClientRects().length,
               visible: typeof s.checkVisibility === 'function' ? s.checkVisibility() : null,
               hitIsSelect: hit === s };
    })()`);
    check('2c', 'the select is PAINTED inside its scroller and answers a hit test at its own centre',
      paint.inside === true && paint.rects > 0 && paint.visible !== false && paint.hitIsSelect === true,
      JSON.stringify(paint));

    // THE PLACEMENT CLAIM, MEASURED — AND STATED AT THE RIGHT STRENGTH. The
    // whole reason this control is in this panel rather than the scene panel is
    // that the limit block is inside the SAME CollapsibleSection, above it, and
    // a collapsed section renders no children: an author cannot open the select
    // without the limit rendering above it.
    //
    // ⚠ THAT IS NOT "BOTH ARE ON SCREEN AT ONCE", and the first draft of this
    // row implied it was. Measured: the limit block is ~2.7k characters and the
    // section is taller than the 300px column, so with the select scrolled to
    // centre the limit sits ~1000px above the viewport top. The row therefore
    // asserts CONTAINMENT + DOCUMENT ORDER, which is the claim the design
    // actually rests on, and PRINTS the pixel gap so the honest version of the
    // fact is on the record rather than in a comment.
    const order = await c.json(String.raw`(() => {
      const s = ${SELECT};
      const box = [...document.querySelectorAll('div')]
        .filter((d) => d.style && /^2px solid/.test(d.style.borderLeft || ''))[0];
      if (!box) return { found: false };
      // The nearest common ancestor that is a section BODY: the limit and the
      // control must live in one collapsible unit, or opening one would not
      // render the other.
      let body = box.parentElement;
      while (body && !body.contains(s)) body = body.parentElement;
      return {
        found: true,
        limitChars: box.innerText.length,
        // 4 = DOCUMENT_POSITION_FOLLOWING.
        selectFollowsLimit: (box.compareDocumentPosition(s) & 4) === 4,
        sameSectionBody: !!(body && body.contains(box) && body.contains(s)),
        gapPx: Math.round(s.getBoundingClientRect().top - box.getBoundingClientRect().bottom),
      };
    })()`);
    check('2d', 'the binding limit is in the SAME collapsible section and precedes the select',
      order.found === true && order.limitChars > 400
      && order.selectFollowsLimit === true && order.sameSectionBody === true,
      JSON.stringify(order));

    // ---- 3. PICK A PRESET → THE BINDING LANDS IN THE MODEL. --------------
    const picked = await c.evalExpr(SET_SELECT(SELECT, PRESET_ID));
    await sleep(700);
    const boundRef = await c.json(modelRef(SEC_A));
    const boundValue = await c.evalExpr(String.raw`(${SELECT}).value`);
    check('3a', `picking "${PRESET_ID}" binds section ${SEC_A}'s rasterRef IN THE MODEL`,
      picked === 'ok' && boundRef === PRESET_ID,
      `set → ${picked}; rasterRef(${SEC_A}) = ${JSON.stringify(boundRef)}; widget = ${JSON.stringify(boundValue)}`);
    check('3b', 'and the control shows what the model holds — the two agree',
      boundValue === PRESET_ID, `widget = ${JSON.stringify(boundValue)}`);

    // THE SIBLING KEY IS UNTOUCHED. `set-section-raster` is a SEPARATE command
    // from `set-section-scene` precisely so binding one does not move the other;
    // this is the row that would catch a fold.
    const sceneAfter = await c.json(`window.__dbg.aeon.sceneRef(${SEC_A})`);
    check('3c', "binding a raster preset did NOT move that section's sceneRef",
      sceneAfter === null || typeof sceneAfter === 'string',
      `sceneRef(${SEC_A}) = ${JSON.stringify(sceneAfter)}`);

    // ONE UNDO STEP, and re-picking the SAME value burns none. This is the
    // no-op rule `sectionPresetCommand` owns, and the only place it is
    // observable is a real history.
    const rePick = await c.evalExpr(SET_SELECT(SELECT, PRESET_ID));
    await sleep(500);
    const stillBound = await c.json(modelRef(SEC_A));
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await sleep(700);
    const afterUndo = await c.json(modelRef(SEC_A));
    check('3d', 'ONE undo step: re-picking the same value adds none, and Ctrl+Z unbinds',
      rePick === 'ok' && stillBound === PRESET_ID && afterUndo === null,
      `re-pick → ${rePick}; still ${JSON.stringify(stillBound)}; after one Ctrl+Z → ${JSON.stringify(afterUndo)}`);

    // Put it back for the rest of the run, through the control.
    await c.evalExpr(SET_SELECT(SELECT, PRESET_ID));
    await sleep(600);

    // ---- 4. THE EMPTY OPTION UNBINDS. ------------------------------------
    const cleared = await c.evalExpr(SET_SELECT(SELECT, ''));
    await sleep(700);
    const clearedRef = await c.json(modelRef(SEC_A));
    check('4a', 'picking the empty option UNBINDS — the model holds null, not ""',
      cleared === 'ok' && clearedRef === null,
      `set → ${cleared}; rasterRef(${SEC_A}) = ${JSON.stringify(clearedRef)} `
      + `(typeof ${typeof clearedRef})`);

    // THE SENTINEL, NAMED. `rasterRef: ""` is what the sidecar parser reads
    // back as null and erases, so "not the empty string" is a separate and
    // load-bearing assertion from "falsy".
    check('4b', 'the unbind is NULL and never the empty string',
      clearedRef !== '', `rasterRef(${SEC_A}) = ${JSON.stringify(clearedRef)}`);

    // ---- 4c. THE SELECT FOLLOWS THE ACTIVE SECTION. ----------------------
    //
    // Two sections, one control. A select that drew section 0 forever would
    // pass every row above and silently bind the wrong section for the rest of
    // the act.
    await c.evalExpr(SET_SELECT(SELECT, PRESET_ID));
    await sleep(600);
    await c.evalExpr(`window.__dbg.aeon.setActiveSection(${SEC_B})`);
    await sleep(800);
    const bShown = await c.evalExpr(String.raw`(${SELECT}).value`);
    // The row's own label, which names the section the control is about —
    // scoped to the Field (the select's own flex row), not an ancestor whose
    // first line is the panel headline.
    const bLabel = await c.json(String.raw`(() => {
      const s = ${SELECT};
      const row = s.parentElement;
      return (row.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    })()`);
    const aRef = await c.json(modelRef(SEC_A));
    check('4c', `switching to section ${SEC_B} shows ITS binding (empty), not section ${SEC_A}'s`,
      bShown === '' && aRef === PRESET_ID,
      `section ${SEC_B} widget = ${JSON.stringify(bShown)}, row label = ${JSON.stringify(bLabel)}, `
      + `section ${SEC_A} still ${JSON.stringify(aRef)}`);

    const bBound = await c.evalExpr(SET_SELECT(SELECT, PRESET_ID));
    await sleep(700);
    const bRef = await c.json(modelRef(SEC_B));
    const aStill = await c.json(modelRef(SEC_A));
    check('4d', `binding section ${SEC_B} moves ONLY section ${SEC_B}`,
      bBound === 'ok' && bRef === PRESET_ID && aStill === PRESET_ID,
      `rasterRef(${SEC_B}) = ${JSON.stringify(bRef)}, rasterRef(${SEC_A}) = ${JSON.stringify(aStill)}`);

    // Leave B unbound so the sidecar rows below have one of each.
    await c.evalExpr(SET_SELECT(SELECT, ''));
    await sleep(600);
    await c.evalExpr(`window.__dbg.aeon.setActiveSection(${SEC_A})`);
    await sleep(600);

    // ---- 5. ALL THE WAY TO THE SIDECAR. ----------------------------------
    //
    // A REAL Ctrl+S, not a store call: the save PLAN is what serializes the
    // sidecar, and driving the keystroke is what proves the control's write is
    // wired to it.
    const dirtyBefore = (await c.json('window.__dbg.aeon.state()')).dirty;
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS',
      windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS',
      windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
    await sleep(3500);
    const dirtyAfter = (await c.json('window.__dbg.aeon.state()')).dirty;
    check('5a', 'a REAL Ctrl+S ran and cleared the dirty flag',
      dirtyBefore === true && dirtyAfter === false, `dirty ${dirtyBefore} -> ${dirtyAfter}`);

    const metaA = existsSync(metaPath(SEC_A)) ? readFileSync(metaPath(SEC_A), 'utf8') : null;
    const metaB = existsSync(metaPath(SEC_B)) ? readFileSync(metaPath(SEC_B), 'utf8') : null;
    const parsedA = metaA === null ? null : JSON.parse(metaA);
    const parsedB = metaB === null ? null : JSON.parse(metaB);
    check('5b', `section ${SEC_A}'s SIDECAR ON DISK carries rasterRef = "${PRESET_ID}"`,
      parsedA !== null && parsedA.rasterRef === PRESET_ID,
      `${metaPath(SEC_A)} → ${metaA === null ? 'ABSENT' : metaA.replace(/\s+/g, ' ')}`);
    check('5c', `and section ${SEC_B}'s carries NO rasterRef — the unbind reached disk too`,
      parsedB === null || parsedB.rasterRef === null || !('rasterRef' in parsedB),
      `${metaPath(SEC_B)} → ${metaB === null ? 'ABSENT' : metaB.replace(/\s+/g, ' ')}`);

    // ---- 6. A BINDING THAT NAMES NOTHING IS SAID. ------------------------
    //
    // The question asked by name: what does an author SEE when a section is
    // bound to a preset id that does not exist? A plain `<select>` renders an
    // unknown value by falling back to its FIRST option, which here reads
    // "Hand-authored raster" — so silence would draw the section as unbound
    // while the file says otherwise, and the author would meet the truth as
    // aeon's build refusing the id by name.
    //
    // REACHED THE WAY IT IS REALLY REACHED: the sidecar is hand-editable and
    // aeon's generator writes it too, so the ref is planted IN THE FILE and the
    // project reopened. The select cannot be used to create this state — it
    // only offers ids that exist — which is exactly why it has to be tested
    // from the file side.
    const { writeFileSync: wf } = await import('node:fs');
    wf(metaPath(SEC_A), JSON.stringify(
      { ...(parsedA ?? {}), rasterRef: 'ghost_preset' }, null, 2) + '\n');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        reopen threw:', e.message));
    for (let i = 0; i < 40; i++) {
      const s = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (s && s.open) break;
      await sleep(400);
    }
    await sleep(2000);
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1200);
    await c.evalExpr(OPEN_SECTION(SECTION_RE, PRESET_PROOF));
    await sleep(900);
    await c.evalExpr(`window.__dbg.aeon.setActiveSection(${SEC_A})`);
    await sleep(800);

    const ghostRef = await c.json(modelRef(SEC_A));
    check('6a', 'the hand-planted dangling ref really reached the MODEL — the row below has a subject',
      ghostRef === 'ghost_preset', `rasterRef(${SEC_A}) = ${JSON.stringify(ghostRef)}`);

    // ⚠ SCOPED TO THE SMALLEST ELEMENT THAT CARRIES THE SENTENCE, and the first
    // draft of this row was not. Reading `innerText` off an ancestor two levels
    // up matched the whole section body — it happened to be green, but it would
    // have stayed green with the advisory rendered anywhere in the panel, or
    // rendered invisibly, which is this repo's most-repeated defect. The leaf is
    // found, then PAINTED (checkVisibility + a strict elementFromPoint, since a
    // hidden node still has an innerText), then placed AFTER the select by
    // document order rather than by the app's word.
    const ghostView = await c.json(String.raw`(() => {
      const s = ${SELECT};
      if (!s) return { found: false };
      const leaves = [...document.querySelectorAll('div')]
        .filter((d) => /ghost_preset/.test(d.innerText || '')
                    && ![...d.children].some((k) => /ghost_preset/.test(k.innerText || '')));
      const leaf = leaves[0] || null;
      if (!leaf) {
        return { found: true, widget: s.value,
                 offersGhost: [...s.options].some((o) => o.value === 'ghost_preset'),
                 leaf: false };
      }
      leaf.scrollIntoView({ block: 'center' });
      const b = leaf.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return {
        found: true, widget: s.value,
        offersGhost: [...s.options].some((o) => o.value === 'ghost_preset'),
        leaf: true,
        text: (leaf.innerText || '').trim(),
        rects: leaf.getClientRects().length,
        visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
        // contains(), not identity: the hint may wrap its text in a span.
        hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
        // 4 = DOCUMENT_POSITION_FOLLOWING: the advisory comes AFTER the select.
        afterSelect: (s.compareDocumentPosition(leaf) & 4) === 4,
      };
    })()`);
    check('6b', 'the select falls back to the unbind option — which is why silence would LIE',
      ghostView.found === true && ghostView.widget === '' && ghostView.offersGhost === false,
      `widget = ${JSON.stringify(ghostView.widget)}, offers ghost_preset = ${ghostView.offersGhost}`);
    check('6c', 'a warning naming the id sits UNDER the select — and it is painted, not merely present',
      ghostView.leaf === true
      && /^Assigned to "ghost_preset", which is not a raster preset in this project\.$/.test(ghostView.text)
      && ghostView.rects > 0 && ghostView.visible !== false
      && ghostView.hitInside === true && ghostView.afterSelect === true,
      JSON.stringify(ghostView));

    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${SHOTS}/section-raster-select.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/section-raster-select.png`);
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    // O66: AWAITED, and the ChildProcess rather than its pid. `process.exit()`
    // follows the summary below; the dropped promise meant the app never got
    // the ordered SIGTERM grace and the exit net SIGKILLed it (measured: no
    // `cleanup: ORDERED` line, exit 261 ms after the summary — the shape that
    // left Chromium SIGTRAP cores, O65). Rule G5 in check-harness-guards.mjs
    // holds this line.
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
  // A HARNESS THAT CANNOT REACH ITS SUBJECT IS LOUD, NEVER GREEN. Every abort
  // above throws rather than skipping, and this is what makes that visible in
  // the exit code as well as the log.
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
