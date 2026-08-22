#!/usr/bin/env node
// ===========================================================================
// WHAT DOES A NON-FACET SECTION COLUMN ACTUALLY DO ON SCREEN?
// ROADMAP §5.1 item 19 — a MEASUREMENT harness, not a fix harness.
// ===========================================================================
//
// Four surfaces mount `<CollapsibleSection>`s outside `workspace/facets`, and
// every one of their sections is `variant="content"` — the default — so
// `LIST_SECTION`'s share-of-the-column machinery never engages and each column
// degrades to a container scrollbar. `ui/primitives.tsx`'s Panel docblock calls
// that the escape hatch and names SpriteMode as the reason it exists. Nothing
// is asserted broken. What has never happened is the measurement.
//
//   SpriteMode        7 call sites in SpriteMode.tsx + 2 in S1ObjectSection,
//                     in one `<Panel width={240} scroll>`. THE COUNT DEPENDS ON
//                     THE SESSION (see below): 6, 7 or 9.
//   CanvasMode        3, in one `<Panel width={240} scroll>`.
//   Explorer          1 call site, rendered once PER GROUP, in the 240px tree
//                     scroller (styles.treeScroll = flex:1 overflowY:auto).
//   ProjectSetupTab   1 call site, rendered once PER GROUP, in a page scroller
//                     inside an 860px centred column — a document, not a column.
//
// -------------------------------------------------------------------------
// WHY SpriteMode HAS THREE DIFFERENT SECTION COUNTS
// -------------------------------------------------------------------------
// SpriteMode.tsx:49 reads `useProjectStore(s => s.project)` directly and :54
// reads the classic store's status; NEITHER goes through
// `state/open-project.ts`. So the two gates are independent:
//
//   always                       mapping, name, open, palette          = 4
//   + `project` (aeon resident)  export, character                     = 6
//   + `classicOpen`              s1-objects, s1-shared-objects,
//                                save-source                           = 7 or 9
//
// open-project.ts's own docblock says a classic open LEAVES a previously
// resident aeon project in the store, and no app-code path calls
// `useProjectStore.getState().reset()` (grep: tests only). So opening aeon
// FIRST and classic SECOND is a real, reachable session in which all nine
// mount at once. Phase C below drives exactly that order, and row [S9.nine] is
// what proves or refutes it — if the app does clear the aeon project, that row
// reports 7 and the nine-section premise is dead. That would be the most
// useful outcome this harness could have.
//
// The docblock's "SpriteMode mounts six" is the AEON-ONLY count, and it was
// also the aeon-only count at 5399202, the commit that wrote it (SpriteMode.tsx
// already had seven call sites that day). So it is not stale — it is
// unqualified. Row [S6.doc] tests it in the configuration where it is true.
//
// ===========================================================================
// WHAT THIS INSTRUMENT IS
// ===========================================================================
// ui/primitives.tsx's `PanelHeader` is rendered by exactly ONE component in the
// whole renderer — ui/CollapsibleSection (grep "<PanelHeader": no other call
// site). So a DOM element with PanelHeader's computed signature (textTransform
// uppercase + letterSpacing 1px + a leading <span>) is a titled section header
// and nothing else, and its grandparent is the section box:
//
//     <div style={CONTENT_SECTION | LIST_SECTION}>   <- the section box
//       <div onClick style={{cursor:'pointer'}}>     <- the toggle
//         <div ...PanelHeader...><span>TITLE</span>  <- what we match
//
// That makes the enumeration structural and one-to-one with the source call
// sites, rather than a list of names somebody maintains — which is the failure
// mode ROADMAP items 15 and 18 are both about.
//
// The Explorer is PERSISTENT: it is on screen behind every other surface, and
// its groups are titled sections too. So every measurement below is bounded to
// one x-range (`minLeft` / `maxLeft`) and says which. A run that forgot this
// would measure the Explorer four times and report four green columns —
// chunkgrid-hint-harness's row 5t, in another costume.
//
// ===========================================================================
// THE ROWS, AND WHICH OF THEM CAN GO RED
// ===========================================================================
// Read this before believing a green run. Some rows here are TRIPWIRES, not
// discriminators, and saying so is the point (object-label-harness's precedent:
// 23/23 with one row disclosed as passing on master too).
//
//   [V.set] THE VIEWPORT ROW, once, at setup. Did the page actually become the
//        size this run asked for, and by which mechanism. It exists because the
//        first controller run of this harness measured two "different" sizes at
//        an identical 1400x872 — SCREEN sized the xvfb display, not the window.
//        If neither mechanism takes, the run is BLOCKED on the size axis and
//        says so; it does not quietly measure whatever it got.
//
//   [i*] INSTRUMENT rows, per surface. Anti-vacuous, and now GATING (below):
//        i0  a SENTINEL read from the STORE, not the DOM — "is this surface
//            really mounted", answered by something no leftover paint can
//            satisfy;
//        i0b where the subject is data-driven, that the data is there: the
//            Explorer's ~102-row Object Library, the commit plan's 16 rows;
//        i1  the exact expected title set, TRANSCRIBED FROM THE CALL SITES;
//        i2  non-zero painted heights and a real pointer toggle;
//        i3  one shared scroll container with a real height;
//        i4  the viewport has not DRIFTED from what V.set achieved.
//
//        i0 AND i1 ARE THE FIX FOR THIS HARNESS'S OWN WORST DEFECT. The first
//        version read the expected titles OFF THE SCREEN and then asserted the
//        screen matched them — an i1 that compared the subject to itself and
//        could not go red for any reason. In the controller's run CanvasMode
//        never opened (the New Canvas dialog's Create is disabled until a name
//        is typed, and the harness typed none), so the block measured
//        SpriteMode's column a second time under CanvasMode's name and i1
//        reported green. Only C.i0 noticed. Titles are now literals; the
//        sentinel is now the store.
//
//        E.i0b exists for a second trap: the Explorer's groups are
//        `defaultCollapsed` and the obvious way to open them all is the filter
//        box (`collapsedOverride`), but a query also FILTERS the items — so the
//        widest tree in the app would have been measured at its narrowest and
//        reported as comfortable. The groups are opened by clicking their real
//        headers, unfiltered, instead.
//
//   THE GATE. If any instrument row for a surface fails, EVERY claim row and
//        report for that surface is NOT MEASURED — never red, never green. A
//        verdict with no subject is not evidence, and the previous run made the
//        reader reconstruct by hand which failures were downstream of which.
//
//   [c1] NO SECTION PAINTS OVER THE ONE BELOW IT.
//        ** GREEN FOR A TRIVIAL REASON ON AN UNPLANTED TREE. ** Every section
//        here is CONTENT_SECTION = flexShrink:0 inside an overflow:auto box, so
//        the stack grows and the container scrolls rather than anything
//        overlapping. It is the regression tripwire for the shape that DID ship
//        (the effects panel's 954px of layer cards), and it goes red under
//        PLANT=list-no-scroller.
//
//        IT DID NOT, AND THAT WAS THE THIRD DEFECT. c1 compared section BORDER
//        BOXES, and the shape it exists for does not move them: a section sized
//        by the COLUMN paints its children below its own box while the box stays
//        exactly where the column put it. So the row was blind to the one defect
//        it was written for, and the plant that reproduces that defect could not
//        turn it red at any window size. It now compares PAINTED EXTENT
//        (`contentBottom` in the probe), stopping at any box that clips — which
//        is what "paints over" means, and what makes it a real judge of the
//        plant rather than a decoration beside it. A border-box overlap, a
//        strictly worse fault, is reported separately as `c1box`.
//
//   [c2] EVERY SECTION IS REACHABLE BY SCROLLING ITS CONTAINER.
//        Discriminates: red under PLANT=clip. Not trivially green — Explorer's
//        root is overflow:hidden with the scroller nested inside it, and the
//        setup tab keeps its Apply footer OUTSIDE its scroller, so "which box
//        actually scrolls" is a real question on two of the four.
//
//   [c3] A ROW IS AT MOST TWO SCROLLBARS DEEP.
//        Discriminates: red under PLANT=nested. This is "is the nested scroll
//        confusing" made countable. Two of the four genuinely have depth 2
//        today — SpriteMode's scan list (maxHeight 220, SpriteMode.tsx:376) and
//        S1ObjectSection's row lists (maxHeight 240, :132) sit inside the Panel
//        scroller. Three would be the defect.
//
//   [c4] THE WHEEL CHAINS OUT OF AN EXHAUSTED INNER LIST.
//        Discriminates: red under PLANT=contain. Nested scrolling is only
//        confusing if the wheel DEAD-ENDS; nothing in this tree sets
//        overscroll-behavior, so chaining should work — but that has never been
//        checked on a real wheel event, which is the only place it is
//        observable. NOT MEASURED (not passed) where there is no inner list, or
//        where the outer column has nothing to scroll, or where no wheel event
//        reached the page at all.
//
//        C.c4 MUST BE "NOT MEASURED" WHENEVER CanvasMode IS GENUINELY ON
//        SCREEN, and that is a source fact rather than an expectation: there is
//        no `overflow: auto/scroll` anywhere inside CanvasMode's three sections
//        (grep of components/canvas: only `canvasWrap`, which is the canvas area
//        outside the Panel, and the import dialog; PaletteGrid.tsx:173 documents
//        "No overflow: auto anywhere below"). So a RED C.c4 is proof the surface
//        under measurement was not CanvasMode — which is exactly what it was in
//        the first controller run.
//
//        The row now reports the armed element's identity, how many wheel events
//        the page saw, whether anything cancelled them, and the inner scroller's
//        own movement, because "the column did not move" is otherwise compatible
//        with three different findings. Ticks are 400ms apart: Chromium LATCHES
//        a scroll sequence to the element the first event hit, and ticks close
//        together can stay latched to the exhausted inner box and look exactly
//        like a dead-end. That is this row's most likely reason to report a
//        false red, and it is spaced out and disclosed rather than hoped away.
//
//   [c5] THE COLUMN'S NATURAL HEIGHT IS A PROPERTY OF ITS CONTENT, NOT OF THE
//        WINDOW. Cross-run self-check (`--compare`): the summed natural section
//        heights must agree within 4% between the two SCREEN sizes. If they do
//        not, every px number below is window-dependent and the "minimum window
//        height" finding is not a number at all. Reported NOT MEASURED from a
//        single run — never quietly skipped — AND it REFUSES outright when the
//        two summaries were taken at the same viewport height, which is exactly
//        what the xvfb defect produced. EARNED BACK: V.set now passes at two
//        genuinely different viewports (columns measured 975 vs 725px on the
//        setup tab, 706 vs 456px on SpriteMode-9), so c5 compares real
//        cross-size data and is a discriminating row again.
//
//   [r*] REPORTS. No verdict — these ARE the measurement. [r4] is the one the
//        ruling turns on:
//
//        r4 answers "would the flex column even help?" from real geometry. If
//        the tallest section were re-declared variant="list", its share would be
//        `container.clientHeight - (every other section's natural height)`.
//        When that share is below SECTION_LIST_MIN_HEIGHT (read out of
//        CollapsibleSection.tsx at startup, never re-typed here),
//        CollapsibleSection's own floor engages, the deficit goes back to
//        Panel's scrollbar, and the column scrolls EXACTLY AS IT DOES NOW —
//        i.e. the refactor is provably a no-op. r4 prints that share and that
//        verdict per surface, per window size.
//
// ===========================================================================
// HOW TO INVOKE
// ===========================================================================
//   cd /home/volence/sonic_hacks/aurora        # the MAIN checkout: ROOT below
//   VITE_AURORA_DEBUG=1 npm run build          # __dbg only exists with the flag
//
//   # the two window sizes, in either order; each writes a JSON summary
//   SCREEN=1680x1050 node scratchpad/section-column-harness.mjs
//   SCREEN=1280x800  node scratchpad/section-column-harness.mjs
//   # SCREEN sets the PAGE VIEWPORT (verified by V.set), not the xvfb display.
//   # XVFB=WxH sets the virtual display; it only has to be big enough to hold
//   # the viewport, and defaults to 1920x1200.
//   # 800 tall is a 13" laptop with OS chrome; 1050 is what every other harness
//   # in this directory uses, so these numbers are comparable to theirs.
//
//   # then the cross-size self-check + the minimum-window-height derivation:
//   node scratchpad/section-column-harness.mjs --compare
//
//   # red-first: each plant must flip ONLY the rows named above
//   PLANT=clip             SCREEN=1280x800 node scratchpad/section-column-harness.mjs
//   PLANT=nested           SCREEN=1280x800 node scratchpad/section-column-harness.mjs
//   PLANT=contain          SCREEN=1280x800 node scratchpad/section-column-harness.mjs
//   PLANT=list-no-scroller SCREEN=1280x800 node scratchpad/section-column-harness.mjs
//
// Plants are applied AT RUNTIME through CDP (no rebuild): they restyle the live
// DOM into the shape whose absence the row asserts. `list-no-scroller`
// reproduces the effects-panel defect exactly — LIST_SECTION's flex declaration
// on a section whose body has no scroller.
//
// EVERY PLANTED RUN CARRIES TWO INVARIANTS, checked at the end (P.invariant,
// P.invariant2):
//   * at least one row must be RED. A poisoned run that reports every row green
//     is a FAILURE whatever the disclosure says about why;
//   * the plant's NAMED judge (PLANT_JUDGE) is what must go red. Some other row
//     happening to fail does not make the plant coverage for the property it
//     names.
// These exist because `list-no-scroller` once removed the inner scrollers, c4
// is the row that judges inner-scroller behaviour, and the plant deleted its own
// judge: 65/65 green with a defect installed and six honest NOT-MEASURED notes
// underneath. A plant that cannot fail is worse than no plant, because the next
// session reads it as coverage.
//
// THE SPLIT THIS HEADER ONCE PREDICTED IS WITHDRAWN. It said c1 should be red at
// 1280x800 and possibly GREEN at 1680x1050, because flexbox only squeezes when
// free space is negative. The cross-size run settled it: every one of these
// columns is over-subscribed at BOTH viewports by wide margins (the smallest,
// SpriteMode-6, still wants a ~1201px-tall window; ProjectSetupTab wants
// ~6326px). So there is no room to spare to be found at either size and the
// plant is expected RED at both. The prediction was not wrong about flexbox; it
// was wrong that these columns ever have slack.
//
// VERBOSE=1 tees Electron's stdout/stderr. Screenshots land in
// scratchpad/shots-section-column/.
// ===========================================================================

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9381);
const ROOT = '/home/volence/sonic_hacks/aurora';
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const AEONDIR = '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-section-column`;
/**
 * THE VIEWPORT THE MEASUREMENT IS TAKEN AT — and it is NOT the xvfb screen.
 *
 * The first controller run of this harness found the defect: `-screen 0 WxH`
 * sizes the virtual DISPLAY, and Electron opens its window at its own configured
 * size regardless. Both invocations produced a 1400x872 window, so `--compare`
 * would have compared two runs at the SAME size and called it a cross-size
 * check, and the PLANT=list-no-scroller split (predicted red at 1280x800, green
 * at 1680x1050) could never occur. The `i4` rows caught it and failed loudly
 * rather than letting the geometry rows report numbers from a window nobody
 * asked for — which is the anti-vacuous discipline working, and is why this fix
 * exists rather than a quiet re-run.
 *
 * So SCREEN now drives the PAGE VIEWPORT, set explicitly and VERIFIED (see
 * `setViewport`), and XVFB drives the virtual display, which only has to be big
 * enough to hold it.
 */
const SCREEN = process.env.SCREEN ?? '1680x1050';
const [SCREEN_W, SCREEN_H] = SCREEN.split('x').map(Number);
const XVFB = process.env.XVFB ?? '1920x1200';
const [XVFB_W, XVFB_H] = XVFB.split('x').map(Number);
const PLANT = process.env.PLANT ?? '';
/** Filled in by `setViewport`: what we actually got, and how. */
const VIEWPORT = { requested: { w: SCREEN_W, h: SCREEN_H }, achieved: null, mechanism: 'none' };
const SUMMARY = (s) => `${ROOT}/scratchpad/section-column-${s}.json`;
/** x past which the Explorer ends and a right-hand / page column begins. The
 *  Explorer is a fixed 240px wide (Explorer.tsx styles.root). */
const PAGE_X = 280;

// --------------------------------------------------------------------------
// WHAT EACH SURFACE MUST BE SHOWING — READ OUT OF SOURCE, NOT OFF THE SCREEN
// --------------------------------------------------------------------------
// THE DEFECT THIS REPLACES, and it was mine. The first version of this harness
// read the titles off the screen and then asserted the screen matched them — an
// `i1` that compared the subject to itself and could not go red for any reason.
// In the controller's run, CanvasMode never opened, and `C.i1` reported a clean
// green against SpriteMode's titles while `C.i0` (a real anti-vacuous row) was
// the only thing that noticed. That is the exact defect class this repo keeps
// finding, one level inside the instrument built to catch it.
//
// So the expected sets are now LITERALS transcribed from the call sites, and
// each surface additionally carries a SENTINEL read from the STORE — not the
// DOM — so "is this surface even mounted" is answered by something that cannot
// be satisfied by whatever happens to be painted.
const T_SPRITE_ALWAYS = ['Mapping', 'Sprite', 'Open — import a sprite to edit or convert', 'Palette'];
const T_SPRITE_AEON = ['Export to project', 'Load engine character'];
// `${zone.toUpperCase()} objects` is data-driven (S1ObjectSection.tsx:93) — the
// restored act decides the zone, so this one is a matcher rather than a literal.
const T_SPRITE_CLASSIC = [/^[A-Z]{2,4} objects$/, 'Shared objects', 'Save to source (S1)'];
const T_CANVAS = ['Canvas', 'Palette', 'Commit to level'];
/**
 * The section every SpriteMode configuration wheels over, named ONCE.
 *
 * S7 and S9 measure the same column, so they must wheel over the same box or a
 * disagreement between them is about the harness rather than about the app.
 * `${zone} objects` is where S1ObjectSection's maxHeight-240 row list lives
 * (S1ObjectSection.tsx:132) — the deepest real nested scroller on any of the
 * four surfaces.
 */
const SPRITE_WHEEL_SECTION = /^[A-Z]{2,4} objects$/;
const T_EXPLORER_CLASSIC = ['Levels', 'Object Library', 'Canvases', 'Tools'];

/** Does `titles` match `want` exactly, as a set, allowing RegExp entries? */
function titlesMatch(titles, want) {
  if (titles.length !== want.length) return false;
  const left = [...titles];
  for (const w of want) {
    const i = left.findIndex((t) => (w instanceof RegExp ? w.test(t) : t === w));
    if (i === -1) return false;
    left.splice(i, 1);
  }
  return left.length === 0;
}
const showWant = (want) => JSON.stringify(want.map((w) => (w instanceof RegExp ? w.source : w)));

/** CollapsibleSection.tsx's own floor. Read out of the source so r4's
 *  counterfactual uses the app's number rather than one re-typed here — if the
 *  constant is renamed or made non-literal this throws instead of quietly
 *  computing against a stale 160. */
const SECTION_LIST_MIN_HEIGHT = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/components/ui/CollapsibleSection.tsx`, 'utf8');
  const m = src.match(/const SECTION_LIST_MIN_HEIGHT = (\d+);/);
  if (!m) throw new Error('SECTION_LIST_MIN_HEIGHT is no longer a literal in CollapsibleSection.tsx — r4 cannot be computed');
  return Number(m[1]);
})();

mkdirSync(SHOTS, { recursive: true });

// --------------------------------------------------------------------------
// CDP plumbing (same shape as chunkgrid-hint-harness / object-label-harness)
// --------------------------------------------------------------------------
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const mouse = (c, type, x, y, opts = {}) => c.send('Input.dispatchMouseEvent', {
  type, x, y, button: opts.button ?? 'left',
  buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1, modifiers: opts.modifiers ?? 0,
});
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlK = (c) => key(c, 'k', 'KeyK', 75, 2);
const escapeKey = (c) => key(c, 'Escape', 'Escape', 27, 0);
/** Enter WITH its char event — a bare keyDown does not trigger Blink's implicit
 *  form submission (canvas-cdp-harness learned this the expensive way). */
async function enter(c) {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', unmodifiedText: '\r', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', unmodifiedText: '\r', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const typeText = async (c, text) => { await c.send('Input.insertText', { text }); await sleep(60); };
async function clickAt(c, x, y) {
  await mouse(c, 'mousePressed', x, y); await sleep(40);
  await mouse(c, 'mouseReleased', x, y, { buttons: 0 }); await sleep(220);
}
async function clickEl(c, expr) {
  const r = await c.json(`(() => { const e = ${expr}; if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; })()`);
  if (!r) return false;
  await clickAt(c, r.x, r.y);
  return true;
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> scratchpad/shots-section-column/${name}.png`);
}

// --------------------------------------------------------------------------
// MAKING THE PAGE THE SIZE THIS RUN ASKED FOR
// --------------------------------------------------------------------------
/**
 * Two mechanisms, tried best-first, and EVERY ONE IS VERIFIED BY READING
 * `window.innerWidth/innerHeight` BACK. Nothing here trusts a CDP call that
 * returned without throwing — that is precisely how the xvfb defect survived a
 * whole run.
 *
 *   1. `Browser.setWindowBounds` on the BROWSER endpoint. A real OS window
 *      resize: real scrollbars, real chrome, nothing emulated. Electron does not
 *      implement the whole Browser domain, so this may simply throw.
 *   2. `Emulation.setDeviceMetricsOverride` on the page. The layout viewport
 *      becomes exactly WxH and the page reflows. For measuring CSS column
 *      geometry this is equivalent — every piece of chrome in this app is
 *      in-page — but it is EMULATED, and any run that lands here must say so,
 *      because overlay-vs-classic scrollbar width and OS window chrome are
 *      the two things it does not reproduce.
 *
 * If neither takes, the run is BLOCKED on the size axis: `V.set` fails, every
 * size-dependent row reports NOT MEASURED, and nothing silently degrades to
 * "measured at whatever we got".
 */
async function setViewport(c, browserWsUrl, targetId, w, h) {
  const read = () => c.json('({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })');
  const before = await read();
  const fits = (v) => Math.abs(v.w - w) <= 4 && Math.abs(v.h - h) <= 4;

  // --- 1. a real window resize ------------------------------------------
  if (browserWsUrl && targetId) {
    try {
      const b = cdp(browserWsUrl);
      await b.ready;
      const { windowId } = await b.send('Browser.getWindowForTarget', { targetId });
      // normal first: a maximized/fullscreen window ignores bounds.
      await b.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {});
      await b.send('Browser.setWindowBounds', { windowId, bounds: { width: w, height: h } });
      b.close();
      await sleep(1200);
      const after = await read();
      if (fits(after)) {
        VIEWPORT.achieved = after; VIEWPORT.mechanism = 'Browser.setWindowBounds';
        return VIEWPORT;
      }
      // A real resize that lands short by the OS frame is still a REAL resize —
      // accept it and record the delta rather than emulating on top of it.
      if (Math.abs(after.w - before.w) > 4 || Math.abs(after.h - before.h) > 4) {
        note('V.bounds', 'Browser.setWindowBounds moved the window but not to the exact size asked for',
          `asked ${w}x${h}, got ${after.w}x${after.h} (was ${before.w}x${before.h}) — `
          + 'falling through to the emulation path so the two SCREEN runs differ by a known amount');
      }
    } catch (e) {
      note('V.bounds', 'Browser.setWindowBounds is not available on this Electron build', e.message);
    }
  }

  // --- 2. emulate the layout viewport -----------------------------------
  try {
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(1200);
    const after = await read();
    if (fits(after)) {
      VIEWPORT.achieved = after; VIEWPORT.mechanism = 'Emulation.setDeviceMetricsOverride';
      return VIEWPORT;
    }
    note('V.emul', 'Emulation.setDeviceMetricsOverride did not take',
      `asked ${w}x${h}, page reports ${after.w}x${after.h}`);
  } catch (e) {
    note('V.emul', 'Emulation.setDeviceMetricsOverride threw', e.message);
  }

  VIEWPORT.achieved = await read();
  VIEWPORT.mechanism = 'none';
  return VIEWPORT;
}

/** Re-assert the viewport after anything that can drop it (a Page.reload drops
 *  a device-metrics override on some builds). Verified, like the first time. */
async function reassertViewport(c) {
  if (VIEWPORT.mechanism === 'none') return;
  const now = await c.json('({ w: window.innerWidth, h: window.innerHeight })');
  if (Math.abs(now.w - SCREEN_W) <= 4 && Math.abs(now.h - SCREEN_H) <= 4) return;
  if (VIEWPORT.mechanism === 'Emulation.setDeviceMetricsOverride') {
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: SCREEN_W, height: SCREEN_H, deviceScaleFactor: 1, mobile: false,
    }).catch(() => {});
    await sleep(900);
  }
  const after = await c.json('({ w: window.innerWidth, h: window.innerHeight })');
  if (Math.abs(after.h - SCREEN_H) > 4) {
    note('V.drift', 'the viewport drifted and could not be re-asserted',
      `now ${after.w}x${after.h}, wanted ${SCREEN_W}x${SCREEN_H} — the i4 rows after this point will fail`);
  }
}

// --------------------------------------------------------------------------
// Result ledger
// --------------------------------------------------------------------------
const results = [];
const fails = [];
const notes = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  notes.push({ id, name, detail });
}
function report(id, lines) {
  console.log(`REPORT [${id}]`);
  for (const l of [].concat(lines)) console.log(`        ${l}`);
}

// ==========================================================================
// THE PROBE. Runs in the page; returns every titled section in the x-window
// currently selected, with the geometry a layout claim is made of.
// ==========================================================================
const INSTALL = String.raw`
window.__sc = (() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  const A = {};
  // The x-window this measurement is bounded to. The Explorer is persistent and
  // its groups are titled sections too, so an unbounded scan would enrol them
  // into every other surface's numbers.
  A.minLeft = 0;
  A.maxLeft = 1e9;

  /**
   * PanelHeader's computed signature. Rendered by ui/CollapsibleSection and by
   * nothing else in the renderer, so this is one-to-one with call sites.
   *
   * THE COLLISION CHECK, because a signature scan is only as good as what else
   * could match it. Two other styles in the tree pair uppercase with
   * letterSpacing 1px: HomeTab's sectionTitle (a DIV, but its children are bare
   * TEXT, so children[0] is undefined) and ProjectSetupTab's infoKey (a SPAN,
   * excluded by the tagName test). Everything else in src/renderer uses
   * letterSpacing 0.5. Both exclusions are load-bearing, not decoration.
   */
  const isHeader = (e) => {
    if (e.tagName !== 'DIV') return false;
    const s = getComputedStyle(e);
    if (s.textTransform !== 'uppercase') return false;
    if (s.letterSpacing !== '1px') return false;
    const first = e.children[0];
    return !!first && first.tagName === 'SPAN';
  };
  /** Every section header in the current x-window, in DOM order. */
  const hdrs = () => [...document.querySelectorAll('div')].filter(isHeader).filter(vis)
    .filter((e) => { const l = e.getBoundingClientRect().left; return l >= A.minLeft && l <= A.maxLeft; });
  const secOf = (h) => (h.parentElement ? h.parentElement.parentElement : null);
  const secEls = () => hdrs().map(secOf).filter(Boolean);

  const scrolls = (e) => {
    const s = getComputedStyle(e);
    return /(auto|scroll)/.test(s.overflowY) || /(auto|scroll)/.test(s.overflow);
  };
  /** Every scrollable ancestor, innermost first — the "how many bars deep" count. */
  const scrollAncestors = (e) => {
    const out = [];
    for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      if (scrolls(p)) out.push(p);
    }
    return out;
  };
  const containerOf = (sec) => scrollAncestors(sec)[0] || null;

  const box = (e) => { const r = e.getBoundingClientRect(); return {
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left),
    right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; };

  /*
   * HOW FAR DOWN THIS SECTION ACTUALLY PAINTS — which is NOT its border box.
   *
   * THE DEFECT THIS REPLACES. c1 used to compare section BORDER BOXES, and the
   * shape it claims to guard does not move them. The effects panel's 954px
   * defect was a section sized by the COLUMN whose CHILDREN, laid out at their
   * natural height with overflow visible, painted straight over the rows
   * beneath. The box stayed exactly where the column put it. So c1 was blind to
   * the one defect it existed for, and PLANT=list-no-scroller — which
   * reproduces that shape exactly — could not turn it red at any window size.
   *
   * STOP AT ANYTHING THAT CLIPS. A child inside an overflow:auto list still
   * reports a layout rect below that list's bottom when it is scrolled out of
   * view, but it does not PAINT there. Descending into a clipping box would
   * report every capped inner list in the app as an overlap — a false red on an
   * unplanted tree, which is the opposite failure and just as useless.
   */
  const contentBottom = (sec) => {
    let bottom = sec.getBoundingClientRect().bottom;
    const walk = (el) => {
      for (const ch of el.children) {
        const cs = getComputedStyle(ch);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        /* A fixed-position child is out of this flow entirely (portals, tooltips). */
        if (cs.position === 'fixed') continue;
        const r = ch.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        bottom = Math.max(bottom, r.bottom);
        if (cs.overflowY === 'visible' && cs.overflowX === 'visible') walk(ch);
      }
    };
    walk(sec);
    return Math.round(bottom);
  };

  /** Descendant scrollers INSIDE one section — a nested list with its own bar. */
  const innerScrollers = (sec) => [...sec.querySelectorAll('*')].filter((e) => {
    if (!scrolls(e) || !vis(e)) return false;
    const s = getComputedStyle(e);
    // A box that declares overflow but can never overflow is not a scroller a
    // user ever meets; one with a maxHeight is a scroller waiting for data.
    return e.scrollHeight > e.clientHeight + 1 || s.maxHeight !== 'none';
  });

  A.headerEl = (t) => hdrs().find((e) => (e.children[0].textContent || '').trim() === t) || null;
  A.sectionEl = (t) => { const h = A.headerEl(t); return h ? secOf(h) : null; };

  A.sections = () => hdrs().map((h) => {
    const toggle = h.parentElement;
    const sec = secOf(h);
    const inner = sec ? innerScrollers(sec) : [];
    const cs = sec ? getComputedStyle(sec) : null;
    return {
      title: (h.children[0].textContent || '').trim(),
      right: h.children[1] ? (h.children[1].textContent || '').trim() : null,
      toggleIsPointer: toggle ? getComputedStyle(toggle).cursor === 'pointer' : false,
      header: box(h),
      section: sec ? box(sec) : null,
      // A collapsed section renders no children at all (CollapsibleSection:71),
      // so its box is just its header row.
      collapsed: sec ? sec.children.length === 1 : null,
      /* The lowest pixel this section paints, clipping boxes respected. */
      contentBottom: sec ? contentBottom(sec) : null,
      flexShrink: cs ? cs.flexShrink : null,
      flexGrow: cs ? cs.flexGrow : null,
      flexBasis: cs ? cs.flexBasis : null,
      minHeight: cs ? cs.minHeight : null,
      maxHeight: cs ? cs.maxHeight : null,
      overflowY: cs ? cs.overflowY : null,
      depth: sec ? scrollAncestors(sec).length : null,
      innerScrollers: inner.map((e) => ({
        h: Math.round(e.getBoundingClientRect().height),
        clientH: e.clientHeight, scrollH: e.scrollHeight,
        maxHeight: getComputedStyle(e).maxHeight,
        overscroll: getComputedStyle(e).overscrollBehaviorY,
        // Counted from the page, so a THIRD bar shows up as 3.
        depth: scrollAncestors(e).length,
      })),
    };
  });

  A.containerEl = () => { const s = secEls(); return s.length ? containerOf(s[0]) : null; };
  A.container = () => {
    const secs = secEls();
    if (!secs.length) return null;
    const conts = secs.map(containerOf);
    const first = conts[0];
    if (!first) return null;
    return {
      shared: conts.every((x) => x === first),
      clientH: first.clientHeight, scrollH: first.scrollHeight,
      clientW: first.clientWidth, scrollTop: first.scrollTop,
      overflowPx: first.scrollHeight - first.clientHeight,
      overflowY: getComputedStyle(first).overflowY,
      overflow: getComputedStyle(first).overflow,
      box: box(first),
      // How many boxes above it also scroll. Explorer nests its scroller in an
      // overflow:hidden root; the setup tab keeps a footer outside it.
      outerScrollers: scrollAncestors(first).length,
    };
  };
  A.setScrollTop = (v) => { const el = A.containerEl(); if (!el) return null; el.scrollTop = v; return el.scrollTop; };
  A.outerScrollTop = () => { const el = A.containerEl(); return el ? el.scrollTop : null; };

  /**
   * Instrument the wheel BEFORE dispatching any, so a red c4 can name its cause.
   * A capture-phase listener on window sees every wheel event whatever
   * stopPropagation does, and re-reading defaultPrevented in a BUBBLE-phase
   * listener on window (the last thing to run) is how we learn whether anything
   * in between cancelled it. Without this, "the column did not move" is
   * compatible with the app preventing default, with Chromium latching the
   * scroll sequence to the inner box, and with a genuine dead-end — three
   * different findings behind one red row.
   */
  A.watchWheel = () => {
    if (A._wheelOff) A._wheelOff();
    const st = { seen: 0, cancelled: 0, cancelledBy: null, target: null };
    const cap = (ev) => {
      st.seen++;
      if (st.target === null) {
        const t = ev.target;
        st.target = t && t.tagName
          ? t.tagName.toLowerCase() + (t.className && typeof t.className === 'string'
              ? '.' + t.className.split(/\s+/)[0] : '')
            + ' "' + ((t.textContent || '').trim().slice(0, 24)) + '"'
          : String(t);
      }
    };
    const bub = (ev) => {
      if (ev.defaultPrevented) {
        st.cancelled++;
        if (st.cancelledBy === null) st.cancelledBy = 'something between capture and bubble on window';
      }
    };
    window.addEventListener('wheel', cap, { capture: true, passive: true });
    window.addEventListener('wheel', bub, { capture: false, passive: true });
    A._wheel = st;
    A._wheelOff = () => {
      window.removeEventListener('wheel', cap, { capture: true });
      window.removeEventListener('wheel', bub, { capture: false });
    };
    return true;
  };
  A.wheelReport = () => {
    const st = A._wheel || { seen: 0, cancelled: 0, cancelledBy: null, target: null };
    const el = A._armed;
    return {
      seen: st.seen, cancelled: st.cancelled, cancelledBy: st.cancelledBy,
      target: st.target,
      innerTopAfter: el ? Math.round(el.scrollTop) : null,
      innerMax: el ? el.scrollHeight - el.clientHeight : null,
    };
  };

  A.scrollIntoViewByTitle = (t) => {
    const sec = A.sectionEl(t);
    if (!sec) return null;
    const el = containerOf(sec);
    if (!el) return null;
    // Bring the section's own top to the container's top, clamped by the
    // container's real scroll range — the same thing a user's scrollbar does.
    el.scrollTop = Math.min(el.scrollHeight - el.clientHeight,
      Math.max(0, sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop));
    const h = sec.children[0];
    const hb = h.getBoundingClientRect(); const cb = el.getBoundingClientRect();
    return { headerTop: Math.round(hb.top), headerBottom: Math.round(hb.bottom),
             contTop: Math.round(cb.top), contBottom: Math.round(cb.bottom),
             scrollTop: Math.round(el.scrollTop), maxScroll: el.scrollHeight - el.clientHeight };
  };
  A.headerPoint = (t) => {
    const h = A.headerEl(t);
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  };
  /** The innermost scroller inside a named section, parked at its bottom, with a
   *  point to put the wheel over. For the chaining row. */
  A.armInnerScroller = (t) => {
    const sec = A.sectionEl(t);
    if (!sec) return { armed: false, why: 'no such section' };
    const inner = innerScrollers(sec).filter((e) => e.scrollHeight > e.clientHeight + 1);
    if (!inner.length) return { armed: false, why: 'no inner scroller with anything to scroll' };
    /* THE TALLEST OVERFLOW, not the last in DOM order. "Shared objects" holds
       TWO maxHeight-240 lists (the row list and the named-art-docs list), and
       taking whichever came last made which box got wheeled depend on the data.
       Two configurations measuring the same column must arm the same element or
       a disagreement between them is about this harness, not about the app. */
    inner.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    const el = inner[0];
    el.scrollTop = el.scrollHeight;
    A._armed = el;
    const r = el.getBoundingClientRect();
    const outer = scrollAncestors(el)[0] || null;
    return {
      armed: true,
      // Named, so a red row says WHAT it wheeled over rather than only that it
      // wheeled. overflow: auto on a box nobody thinks of as a list is the
      // most likely way this row arms the wrong element.
      what: el.tagName.toLowerCase()
        + (typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/)[0] : '')
        + ' [maxHeight ' + getComputedStyle(el).maxHeight + ']',
      innerTop: Math.round(el.scrollTop), innerMax: el.scrollHeight - el.clientHeight,
      x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      outerTop: outer ? Math.round(outer.scrollTop) : null,
      outerMax: outer ? outer.scrollHeight - outer.clientHeight : null,
      overscroll: getComputedStyle(el).overscrollBehaviorY,
    };
  };

  // ---- plant helpers (see PLANTS below; kept here so they reuse this file's
  // one definition of "a section" rather than re-deriving it from a click point)
  A.plantClip = () => { const el = A.containerEl(); if (!el) return 'no container';
    el.style.overflow = 'hidden'; return 'clipped the shared container (' + el.clientHeight + 'px tall)'; };
  A.tallestTitle = () => { const s = A.sections(); if (!s.length) return null;
    return s.slice().sort((a, b) => (b.section ? b.section.h : 0) - (a.section ? a.section.h : 0))[0].title; };
  A.plantNested = () => { const t = A.tallestTitle(); const sec = t ? A.sectionEl(t) : null;
    if (!sec) return 'no section'; const body = sec.children[1];
    if (!body) return 'the tallest section is collapsed — nothing to nest into';
    body.style.overflowY = 'auto'; body.style.maxHeight = '120px';
    return 'nested a third bar into "' + t + '"'; };
  A.plantContain = () => { let n = 0;
    for (const e of document.querySelectorAll('*')) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1) {
        e.style.overscrollBehavior = 'contain'; n++; } }
    return 'contained ' + n + ' scrollers'; };
  A.plantListNoScroller = () => { const t = A.tallestTitle(); const sec = t ? A.sectionEl(t) : null;
    if (!sec) return 'no section';
    // LIST_SECTION, verbatim (CollapsibleSection.tsx:137) ...
    sec.style.flex = '1 1 0'; sec.style.minHeight = '160px'; sec.style.maxHeight = 'max-content';
    // ... and the half the effects panel was missing: no scroller inside it.
    for (const e of sec.querySelectorAll('*')) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowY)) { e.style.overflowY = 'visible'; e.style.maxHeight = 'none'; } }
    return 'LIST_SECTION applied to "' + t + '" with its inner scrollers removed'; };

  // ---- app-driving helpers ------------------------------------------------
  A.filterInput = () => [...document.querySelectorAll('input')].find(
    (i) => i.placeholder === 'Filter…' && vis(i)) || null;
  A.explorerRows = () => [...document.querySelectorAll('button')]
    .filter((b) => vis(b) && b.getBoundingClientRect().left < 280).map((b) => b.textContent.trim());
  A.clickExplorerRow = (label) => {
    const e = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim().indexOf(label) === 0 && vis(b) && b.getBoundingClientRect().left < 280);
    if (!e) return false; e.click(); return true;
  };
  A.dlg = () => document.querySelector('[role="dialog"][aria-label="New Canvas"]');
  A.dlgNums = () => { const d = A.dlg(); return d ? [...d.querySelectorAll('input[type=number]')] : []; };
  A.dlgName = () => { const d = A.dlg(); return d ? d.querySelector('input:not([type=number])') : null; };
  A.dlgSelect = () => { const d = A.dlg(); return d ? d.querySelector('select') : null; };
  A.dlgCreate = () => { const d = A.dlg(); return d
    ? [...d.querySelectorAll('button')].find((b) => /^Creat/.test(b.textContent.trim())) : null; };
  /* The dialog opens with an EMPTY name and a disabled Create (new-canvas.ts:77).
     A harness that fills only the size clicks a dead button and creates nothing,
     which is exactly what the first controller run did. */
  A.dlgSnapshot = () => { const d = A.dlg(); if (!d) return null;
    const cr = A.dlgCreate(); const nm = A.dlgName();
    return { name: nm ? nm.value : null, nums: A.dlgNums().map((n) => n.value),
             profile: A.dlgSelect() ? A.dlgSelect().value : null,
             createDisabled: cr ? cr.disabled : null,
             createText: cr ? cr.textContent.trim() : null }; };
  A.paletteInput = () => [...document.querySelectorAll('input')].find(
    (i) => i.placeholder && /command|search|type/i.test(i.placeholder) && vis(i)) || null;
  /** Anti-vacuous readout for CanvasMode: CommitPlanView draws one "chunk N"
   *  label per 256x256 chunk. A canvas under 256px shows "nothing to commit
   *  yet" and the section collapses to one line — which would make every
   *  geometry row green for the wrong reason. */
  A.commitRows = () => [...document.querySelectorAll('span')]
    .filter((e) => /^chunk [0-9]+$/.test((e.textContent || '').trim())).length;
  A.win = () => ({ innerW: window.innerWidth, innerH: window.innerHeight, dpr: window.devicePixelRatio });
  return A;
})();
true`;

const PLANT_CALLS = {
  clip: 'window.__sc.plantClip()',
  nested: 'window.__sc.plantNested()',
  contain: 'window.__sc.plantContain()',
  'list-no-scroller': 'window.__sc.plantListNoScroller()',
};

/**
 * WHICH ROW EACH PLANT IS SUPPOSED TO TURN RED.
 *
 * Not decoration — `P.invariant2` asserts it. A plant whose named judge stays
 * green while some OTHER row happens to go red would otherwise satisfy the
 * general invariant below and still be worthless as coverage.
 */
const PLANT_JUDGE = {
  clip: /\.c2$/,
  nested: /\.c3$/,
  contain: /\.c4$/,
  'list-no-scroller': /\.c1$/,
};

async function applyPlant(c, tag) {
  if (!PLANT) return;
  const call = PLANT_CALLS[PLANT];
  if (!call) throw new Error(`unknown PLANT=${PLANT}; known: ${Object.keys(PLANT_CALLS).join(', ')}`);
  const out = await c.evalExpr(call);
  note(`plant.${tag}`, `PLANT=${PLANT} applied to ${tag}`, String(out));
  await sleep(500);
}

/** Point the probe at one x-window and re-read the titles there. */
async function bound(c, minLeft, maxLeft) {
  await c.evalExpr(`window.__sc.minLeft = ${minLeft}; window.__sc.maxLeft = ${maxLeft}; true`);
  return c.json('window.__sc.sections().map((s) => s.title)');
}

// ==========================================================================
// ONE SURFACE, MEASURED
// ==========================================================================
/**
 * @param tag     row-id prefix, e.g. 'S9'
 * @param label   human name for the surface + configuration
 * @param expect  { titles } — the EXACT expected title set. The anti-vacuous
 *                spine: it proves the workspace on screen is the one this block
 *                claims to measure. chunkgrid-hint-harness's row 5t exists
 *                because four green "aeon" rows had measured classic twice.
 * @param opts    { minLeft, maxLeft, expandAll, wheelSection }
 *
 * The caller has ALREADY bounded the probe (see `bound`); this re-asserts the
 * same bounds so the block is self-contained if it is ever reordered.
 */
async function measureSurface(c, tag, label, expect, opts = {}) {
  const minLeft = opts.minLeft ?? 0;
  const maxLeft = opts.maxLeft ?? 1e9;
  await c.evalExpr(`window.__sc.minLeft = ${minLeft}; window.__sc.maxLeft = ${maxLeft}; true`);
  await sleep(300);

  // Expand everything first, through REAL header clicks, so the WORST case is
  // what gets measured. Explorer and the setup tab default their groups
  // collapsed, and SpriteMode collapses `sprite.open` in a classic session
  // (SpriteMode.tsx:223, defaultCollapsed={classicOpen}).
  if (opts.expandAll) {
    for (let pass = 0; pass < 4; pass++) {
      const collapsed = await c.json('window.__sc.sections().filter((s) => s.collapsed).map((s) => s.title)');
      if (!collapsed.length) break;
      for (const t of collapsed) {
        // SCROLL IT INTO VIEW FIRST. Each expansion pushes the headers below it
        // down, and a header that has moved past the bottom of the container
        // still has a non-zero rect — so a click at its coordinates would land
        // on whatever is painted there instead, silently expanding the wrong
        // section (or nothing) and reporting a shorter column than exists.
        await c.json(`window.__sc.scrollIntoViewByTitle(${JSON.stringify(t)})`);
        await sleep(120);
        const p = await c.json(`window.__sc.headerPoint(${JSON.stringify(t)})`);
        if (p) await clickAt(c, p.x, p.y);
      }
      await sleep(600);
    }
    const stillCollapsed = await c.json('window.__sc.sections().filter((s) => s.collapsed).map((s) => s.title)');
    if (stillCollapsed.length) {
      note(`${tag}.expand`, `${label}: ${stillCollapsed.length} section(s) would not expand`,
        JSON.stringify(stillCollapsed) + ' — the heights below UNDERSTATE the worst case');
    }
  }

  // ---- i0: THE SENTINEL, read from the STORE, not from the DOM -----------
  // "Is this surface even mounted?" answered by something no amount of leftover
  // paint can satisfy. In the controller's first run CanvasMode never opened and
  // the harness measured SpriteMode's column a second time under CanvasMode's
  // name; this row is what makes that impossible to repeat.
  let sentinelOk = true;
  if (expect.sentinel) {
    const v = await c.json(expect.sentinel.expr).catch((e) => ({ threw: e.message }));
    sentinelOk = !!expect.sentinel.ok(v);
    check(`${tag}.i0`, `${label}: the surface is really mounted — ${expect.sentinel.desc}`,
      sentinelOk, JSON.stringify(v));
  }

  // ANTI-VACUOUS for a data-driven tree: the Explorer's Object Library carries
  // ~102 named S1 objects (s1-objects.ts's S1_OBJECT_LIST), and a run that
  // measured it filtered, collapsed or before the project loaded would report a
  // short, tidy column that no user ever sees.
  let rowsOk = true;
  if (opts.rowFloor) {
    const rows = await c.evalExpr('window.__sc.explorerRows().length');
    rowsOk = rows >= opts.rowFloor;
    check(`${tag}.i0b`, `${label}: the tree is fully populated (>= ${opts.rowFloor} rows on screen)`,
      rowsOk, `${rows} clickable rows in the Explorer column`);
  }

  await applyPlant(c, tag);
  await sleep(300);

  const secs = await c.json('window.__sc.sections()');
  const cont = await c.json('window.__sc.container()');
  const win = await c.json('window.__sc.win()');

  // ---- instrument rows --------------------------------------------------
  const titles = secs.map((s) => s.title);
  const want = expect.titles ?? null;
  let titlesOk = true;
  if (want) {
    titlesOk = titlesMatch(titles, want);
    check(`${tag}.i1`, `${label}: exactly the ${want.length} sections this surface declares are on screen`,
      titlesOk,
      `saw ${titles.length}: ${JSON.stringify(titles)}\n        wanted ${want.length}: ${showWant(want)}`);
  } else {
    // Data-driven group titles (the setup tab's are zone ids). A literal set is
    // not available, so the row asserts a floor AND leans on the sentinel above.
    titlesOk = secs.length >= (expect.minCount ?? 1);
    check(`${tag}.i1`, `${label}: at least ${expect.minCount ?? 1} data-driven sections are on screen`,
      titlesOk, `${secs.length}: ${JSON.stringify(titles)}`);
  }
  check(`${tag}.i2`, `${label}: every section header is painted (h > 0) and its toggle is a pointer`,
    secs.length > 0 && secs.every((s) => s.header.h > 0 && s.toggleIsPointer),
    secs.map((s) => `${s.title}=${s.header.h}px/${s.toggleIsPointer}`).join(' ') || '(no sections)');
  check(`${tag}.i3`, `${label}: every section shares ONE scroll container with a real height`,
    !!cont && cont.shared === true && cont.clientH > 0,
    cont ? `shared=${cont.shared} clientH=${cont.clientH} scrollH=${cont.scrollH} `
      + `overflowY=${cont.overflowY} overflow=${cont.overflow} outerScrollers=${cont.outerScrollers}` : 'no container');
  // i4 checks the viewport has not DRIFTED from what setViewport achieved.
  // Whether that achievement matched the request is `V.set`'s job, once, at
  // setup — two different failures that used to be one confusing row.
  const gotH = VIEWPORT.achieved ? VIEWPORT.achieved.h : SCREEN_H;
  const gotW = VIEWPORT.achieved ? VIEWPORT.achieved.w : SCREEN_W;
  check(`${tag}.i4`, `${label}: the viewport is still the one this run set (${gotW}x${gotH} via ${VIEWPORT.mechanism})`,
    Math.abs(win.innerH - gotH) <= 4 && Math.abs(win.innerW - gotW) <= 4,
    `innerW=${win.innerW} innerH=${win.innerH} dpr=${win.dpr} (set ${gotW}x${gotH}, asked ${SCREEN_W}x${SCREEN_H})`);

  // ---- THE GATE -----------------------------------------------------------
  // A claim row underneath a failed instrument row has no subject, and its
  // verdict is NOT MEASURED — never red, never green. The controller inferred
  // exactly this about C.c4 in the first run; it is now enforced rather than
  // inferred, so no future reader has to reconstruct which failures were
  // downstream of which.
  const instrumentOk = sentinelOk && rowsOk && titlesOk && !!cont && secs.length > 0;
  if (!instrumentOk) {
    note(`${tag}.gated`, `${label}: INSTRUMENT ROWS FAILED — every claim row (c1..c4) and every `
      + 'report (r1..r4) for this surface is NOT MEASURED',
      `sentinel=${sentinelOk} rows=${rowsOk} titles=${titlesOk} container=${!!cont} sections=${secs.length}`);
    await shot(c, `${tag}-${SCREEN}${PLANT ? `-plant-${PLANT}` : ''}-GATED`);
    return null;
  }

  // ---- c1: nothing paints over the section below it ----------------------
  // A TRIPWIRE on an unplanted tree — every section here is flexShrink:0 in an
  // overflow:auto box, so the stack grows and the container scrolls rather than
  // anything overlapping — but it is NOW A REAL JUDGE of the planted shape,
  // which it was not before: it compares PAINTED EXTENT, not border boxes.
  const overlaps = [];
  const boxOverlaps = [];
  for (let i = 0; i + 1 < secs.length; i++) {
    const a = secs[i], b = secs[i + 1];
    if (!a.section || !b.section) continue;
    // THE SUBJECT IS PAINTED PIXELS, NOT THE BORDER BOX. See `contentBottom` in
    // the probe: a section squeezed by the column paints its children below its
    // own box without moving it, which is what the effects panel shipped.
    if (a.contentBottom > b.section.top + 1) {
      overlaps.push(`"${a.title}" paints to ${a.contentBottom} over "${b.title}" top=${b.section.top} `
        + `(${a.contentBottom - b.section.top}px of overlap; its own box ends at ${a.section.bottom})`);
    }
    if (a.section.bottom > b.section.top + 1) {
      boxOverlaps.push(`"${a.title}" box ${a.section.bottom} over "${b.title}" ${b.section.top}`);
    }
  }
  check(`${tag}.c1`, `${label}: no section PAINTS over the one below it`,
    overlaps.length === 0,
    overlaps.length ? overlaps.join('\n        ')
      : `all ${Math.max(0, secs.length - 1)} consecutive pairs disjoint `
        + `(content extents: ${secs.map((x) => `${x.contentBottom - x.section.top}px in ${x.section.h}px`).join(', ')})`);
  if (boxOverlaps.length) {
    note(`${tag}.c1box`, `${label}: section BORDER BOXES overlap too — a stronger fault than painting over`,
      boxOverlaps.join('\n        '));
  }

  // ---- c2: every section is reachable by scrolling -----------------------
  const unreachable = [];
  for (const s of secs) {
    const r = await c.json(`window.__sc.scrollIntoViewByTitle(${JSON.stringify(s.title)})`);
    if (!r) { unreachable.push(`"${s.title}" has no scroll container`); continue; }
    const inside = r.headerTop >= r.contTop - 1 && r.headerBottom <= r.contBottom + 1;
    if (!inside) {
      unreachable.push(`"${s.title}" header ${r.headerTop}..${r.headerBottom} vs container `
        + `${r.contTop}..${r.contBottom} (scrolled to ${r.scrollTop} of ${r.maxScroll})`);
    }
  }
  await c.evalExpr('window.__sc.setScrollTop(0)');
  await sleep(250);
  check(`${tag}.c2`, `${label}: every section can be scrolled fully into view`,
    unreachable.length === 0, unreachable.length ? unreachable.join('\n        ') : `all ${secs.length} reachable`);

  // ---- c3: at most two scrollbars deep -----------------------------------
  const deep = [];
  for (const s of secs) {
    for (const inner of s.innerScrollers) {
      if (inner.depth > 2) deep.push(`"${s.title}" has a scroller ${inner.depth} bars deep (maxHeight=${inner.maxHeight})`);
    }
    if (s.depth !== null && s.depth > 1) deep.push(`"${s.title}"'s own box sits ${s.depth} scrollers deep`);
  }
  const maxDepth = Math.max(1, ...secs.flatMap((s) => s.innerScrollers.map((i) => i.depth)), ...secs.map((s) => s.depth ?? 1));
  check(`${tag}.c3`, `${label}: no row is more than two scrollbars deep`,
    deep.length === 0, deep.length ? deep.join('\n        ') : `deepest row is ${maxDepth} bar(s) deep`);

  // ---- c4: the wheel chains out of an exhausted inner list ---------------
  //
  // WHY THIS ROW GREW DIAGNOSTICS. In the controller's first run `C.c4` came
  // back red with a one-line detail that could not distinguish three completely
  // different worlds: a genuine `overscroll-behavior` dead-end, a handler that
  // calls preventDefault on the wheel, and Chromium's scroll LATCHING keeping
  // the sequence pinned to the inner box. A red row that cannot say which is not
  // a finding — so the row now reports the armed element's identity, whether the
  // wheel events reached the page at all, whether anything cancelled them, and
  // the inner scroller's own movement alongside the outer column's.
  const named = opts.wheelSection instanceof RegExp
    ? secs.find((s) => opts.wheelSection.test(s.title))?.title
    : opts.wheelSection;
  const wheelTarget = named
    ?? (secs.find((s) => s.innerScrollers.some((i) => i.scrollH > i.clientH + 1))?.title ?? null);
  if (opts.wheelSection && !named) {
    note(`${tag}.c4pick`, `${label}: the named wheel section was not on screen; falling back to the `
      + 'first section with an overflowing inner list', String(opts.wheelSection));
  }
  if (!wheelTarget) {
    note(`${tag}.c4`, `${label}: NOT MEASURED — no section here has an inner list with anything to scroll, `
      + 'so nested-scroll dead-ending cannot arise on this surface in this configuration');
  } else {
    const armed = await c.json(`window.__sc.armInnerScroller(${JSON.stringify(wheelTarget)})`);
    if (!armed || !armed.armed) {
      note(`${tag}.c4`, `${label}: NOT MEASURED — could not park "${wheelTarget}"'s inner list at its end`,
        JSON.stringify(armed));
    } else if (!armed.outerMax) {
      note(`${tag}.c4`, `${label}: NOT MEASURED — the outer column has nothing to scroll `
        + `(outerMax=${armed.outerMax}), so chaining has no observable effect at this window size`);
    } else {
      await c.evalExpr('window.__sc.watchWheel()');
      const before = armed.outerTop;
      // 400ms between ticks, deliberately: Chromium LATCHES a scroll sequence to
      // the element the first event hit, and the latch only releases after the
      // sequence idles. Ticks 140ms apart can stay latched to the exhausted inner
      // box and look exactly like a dead-end. This is the harness's own most
      // likely reason to report a false red, so it is spaced out and disclosed.
      for (let i = 0; i < 5; i++) {
        await c.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: armed.x, y: armed.y, deltaX: 0, deltaY: 120, modifiers: 0,
        });
        await sleep(400);
      }
      await sleep(600);
      const w = await c.json('window.__sc.wheelReport()');
      const after = await c.evalExpr('window.__sc.outerScrollTop()');
      if (w.seen === 0) {
        note(`${tag}.c4`, `${label}: NOT MEASURED — no wheel event reached the page at all `
          + `(dispatched 5 at ${armed.x},${armed.y}). The verdict would be about CDP, not about scroll chaining.`,
          JSON.stringify(w));
      } else {
        check(`${tag}.c4`, `${label}: a wheel over an exhausted inner list chains out to the column`,
          after > before,
          `inner "${wheelTarget}" = ${armed.what}; wheel landed on ${w.target}; `
          + `parked at ${armed.innerTop}/${armed.innerMax} `
          + `-> ${w.innerTopAfter}; overscroll-behavior=${armed.overscroll}; `
          + `column scrollTop ${before} -> ${after} (max ${armed.outerMax}); `
          + `wheel events seen=${w.seen}, cancelled=${w.cancelled}, cancelledBy=${w.cancelledBy}`);
      }
      await c.evalExpr('window.__sc.setScrollTop(0)');
    }
  }

  // ---- reports -----------------------------------------------------------
  const natural = secs.reduce((n, s) => n + (s.section?.h ?? 0), 0);
  const visibleAtTop = secs.filter((s) => s.header.top >= cont.box.top - 1 && s.header.bottom <= cont.box.bottom + 1).length;
  report(`${tag}.r1`, [
    `COLUMN  clientH=${cont.clientH}  scrollH=${cont.scrollH}  overflow=${cont.overflowPx}px`
      + `  (${cont.clientH ? (100 * cont.overflowPx / cont.clientH).toFixed(0) : '-'}% of a screenful)`
      + `  width=${cont.clientW}  outerScrollers=${cont.outerScrollers}`,
    `WINDOW  ${win.innerW}x${win.innerH}   SECTIONS ${secs.length}   natural stack height ${natural}px`,
  ]);
  report(`${tag}.r2`, secs.map((s) => {
    const inner = s.innerScrollers.map((i) => `${i.clientH}/${i.scrollH}@max${i.maxHeight}`).join(',') || '-';
    return `${String(s.section?.h ?? 0).padStart(5)}px  ${s.collapsed ? '[collapsed] ' : ''}${s.title}`
      + `   shrink=${s.flexShrink} grow=${s.flexGrow} basis=${s.flexBasis} inner=[${inner}]`;
  }));
  report(`${tag}.r3`, [
    `${visibleAtTop}/${secs.length} section headers are on screen with the column at scrollTop 0`,
  ]);

  // ---- r4: THE COUNTERFACTUAL, and the reason this parcel exists ---------
  const sorted = secs.slice().sort((a, b) => (b.section?.h ?? 0) - (a.section?.h ?? 0));
  const tallest = sorted[0];
  const tallestH = tallest.section?.h ?? 0;
  const others = natural - tallestH;
  const share = cont.clientH - others;
  const floored = share < SECTION_LIST_MIN_HEIGHT;
  report(`${tag}.r4`, [
    `IF "${tallest.title}" (${tallestH}px, the tallest) WERE variant="list":`,
    `  every other section keeps its natural height    = ${others}px`,
    `  the column has                                  = ${cont.clientH}px`,
    `  so its share would be                           = ${share}px`,
    `  SECTION_LIST_MIN_HEIGHT (read from source)      = ${SECTION_LIST_MIN_HEIGHT}px`,
    floored
      ? `  -> THE FLOOR ENGAGES. The section is pinned at ${SECTION_LIST_MIN_HEIGHT}px, the deficit goes back to `
        + `Panel's own scrollbar, and the column scrolls EXACTLY AS IT DOES NOW. The flex model is a NO-OP here.`
      : `  -> the flex model WOULD bind: a ${share}px share, above the floor. That section would gain its own `
        + `scrollbar and the column's ${cont.overflowPx}px of overflow would `
        + `${share >= tallestH ? 'not change — it already fits' : `drop to about ${Math.max(0, cont.overflowPx - (tallestH - share))}px`}.`,
  ]);

  await shot(c, `${tag}-${SCREEN}${PLANT ? `-plant-${PLANT}` : ''}`);
  return { tag, label, screen: SCREEN, plant: PLANT, sections: secs, container: cont, win, natural, share, floored };
}

// ==========================================================================
// Session helpers
// ==========================================================================
async function waitDbg(c) {
  for (let i = 0; i < 60; i++) {
    if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
    await sleep(300);
  }
  return false;
}
async function freshSession(c) {
  await c.evalExpr('localStorage.clear()').catch(() => {});
  await c.send('Page.reload');
  await sleep(4500);
  const ok = await waitDbg(c);
  if (!ok) throw new Error('__dbg never installed after reload — was the build made with VITE_AURORA_DEBUG=1?');
  // A Page.reload can drop a device-metrics override, and a run that lost it
  // between phases would report two phases at two different sizes under one
  // SCREEN heading. Verified, not assumed.
  await reassertViewport(c);
  await c.evalExpr(INSTALL);
}
async function openClassic(c) {
  await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`).catch((e) => note('open', 'classic open threw', e.message));
  let proj = null;
  for (let i = 0; i < 40; i++) {
    proj = await c.json('window.__dbg.projStatus()').catch(() => null);
    if (proj && proj.zones > 0) break;
    await sleep(400);
  }
  // An act has to finish loading before S1ObjectSection has a zone to list.
  let lvl = null;
  for (let i = 0; i < 40; i++) {
    lvl = await c.json('window.__dbg.levelState()').catch(() => null);
    if (lvl && lvl.status !== 'loading' && lvl.zone) break;
    await sleep(500);
  }
  await sleep(2000);
  await c.evalExpr(INSTALL);
  return { proj, lvl };
}
async function openAeon(c) {
  await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch((e) => note('open', 'aeon open threw', e.message));
  let st = null;
  for (let i = 0; i < 40; i++) {
    st = await c.json('window.__dbg.aeon.state()').catch(() => null);
    if (st && st.open) break;
    await sleep(400);
  }
  await sleep(3000);
  await c.evalExpr(INSTALL);
  return st;
}
/** Type into the Explorer filter, which force-expands every group
 *  (`collapsedOverride`, Explorer.tsx:250) — the supported way in. */
async function explorerFilter(c, text) {
  const has = await c.evalExpr('window.__sc.filterInput() !== null');
  if (!has) return false;
  await clickEl(c, 'window.__sc.filterInput()');
  await key(c, 'a', 'KeyA', 65, 2);
  if (text) await typeText(c, text); else await key(c, 'Backspace', 'Backspace', 8, 0);
  await sleep(900);
  await c.evalExpr(INSTALL);
  return true;
}

// ==========================================================================
// MAIN
// ==========================================================================
async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  console.log(`=== section-column harness — SCREEN=${SCREEN}${PLANT ? `  PLANT=${PLANT}` : ''} ===`);
  console.log(`    SECTION_LIST_MIN_HEIGHT read from source = ${SECTION_LIST_MIN_HEIGHT}px`);
  console.log(`    uptime/load at start: ${execSync('uptime', { encoding: 'utf8' }).trim()}`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  // The xvfb screen only has to be big enough to HOLD the viewport; it does not
  // set it. That confusion is what the first controller run exposed.
  const child = spawn('/usr/bin/xvfb-run', ['-a', '-s', `-screen 0 ${XVFB_W}x${XVFB_H}x24`, ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  const measured = [];
  let c;
  try {
    const wsUrl = await waitForTarget();
    c = cdp(wsUrl);
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    await waitDbg(c);

    // ---- SIZE THE VIEWPORT, AND PROVE IT TOOK --------------------------
    let browserWs = null, targetId = null;
    try {
      browserWs = (await getJSON('/json/version')).webSocketDebuggerUrl ?? null;
      const list = await getJSON('/json/list');
      targetId = (list.find((t) => t.webSocketDebuggerUrl === wsUrl) ?? {}).id ?? null;
    } catch { /* the Browser path is optional */ }
    await setViewport(c, browserWs, targetId, SCREEN_W, SCREEN_H);
    // THE ROW THAT WOULD HAVE CAUGHT THE xvfb DEFECT AT ITS SOURCE. Before, the
    // only symptom was six confusing i4 failures scattered through the run.
    check('V.set', `the page viewport is the ${SCREEN_W}x${SCREEN_H} this run asked for`,
      !!VIEWPORT.achieved && Math.abs(VIEWPORT.achieved.w - SCREEN_W) <= 4
        && Math.abs(VIEWPORT.achieved.h - SCREEN_H) <= 4,
      `achieved ${VIEWPORT.achieved ? `${VIEWPORT.achieved.w}x${VIEWPORT.achieved.h}` : '(none)'} `
      + `via ${VIEWPORT.mechanism}; xvfb screen ${XVFB_W}x${XVFB_H}`);
    if (VIEWPORT.mechanism === 'none') {
      note('V.blocked', 'BLOCKED ON THE SIZE AXIS — neither Browser.setWindowBounds nor '
        + 'Emulation.setDeviceMetricsOverride moved the viewport. Every number in this run is taken at '
        + `${VIEWPORT.achieved ? `${VIEWPORT.achieved.w}x${VIEWPORT.achieved.h}` : 'an unknown size'}, `
        + 'the i4 rows will fail, c5 is not computable, and the PLANT=list-no-scroller split cannot be '
        + 'observed. Do not read the cross-size comparison from this run.');
    } else if (VIEWPORT.mechanism === 'Emulation.setDeviceMetricsOverride') {
      note('V.emulated', 'THE SIZE AXIS IS EMULATED, not a real OS window resize. The layout viewport '
        + 'is exactly the size asked for and the page reflows, which is what CSS column geometry is made '
        + 'of — but scrollbar gutter width and OS window chrome are NOT reproduced. Every px number below '
        + 'carries that caveat.');
    }

    // =====================================================================
    // PHASE A — a CLASSIC-ONLY session: Explorer, ProjectSetupTab,
    //           SpriteMode(7), CanvasMode(3 at its worst case)
    // =====================================================================
    await freshSession(c);
    const a = await openClassic(c);
    check('A.setup', 'the classic project (s1disasm) is open with an act loaded',
      !!(a.proj && a.proj.zones > 0) && !!(a.lvl && a.lvl.zone),
      `proj=${JSON.stringify(a.proj)} level=${JSON.stringify(a.lvl)}`);

    // --- Explorer -------------------------------------------------------
    // Its groups are `defaultCollapsed`, and the tempting way to open them all
    // is the filter box (`collapsedOverride`, Explorer.tsx:250). THAT WOULD BE
    // THE WRONG MEASUREMENT: a query force-expands the groups but also FILTERS
    // their items, so the widest tree would be measured at its narrowest. The
    // groups are expanded by clicking their real headers instead, with no query
    // — which is the state a user leaves behind and localStorage remembers.
    note('E.titles', 'Explorer groups on screen (no filter — every group expanded by clicking its header)',
      JSON.stringify(await bound(c, 0, PAGE_X)));
    measured.push(await measureSurface(c, 'E', 'Explorer (classic, all groups expanded, UNFILTERED)', {
      titles: T_EXPLORER_CLASSIC,
      sentinel: {
        expr: '({ proj: window.__dbg.projStatus(), filter: window.__sc.filterInput() !== null })',
        desc: 'the classic project is open and the Explorer\'s own filter field is on screen',
        ok: (v) => v && v.proj && v.proj.status === 'open' && v.filter === true,
      },
    }, { minLeft: 0, maxLeft: PAGE_X, expandAll: true, rowFloor: 100 }));

    // --- ProjectSetupTab -------------------------------------------------
    await explorerFilter(c, 'Project Setup');
    const openedSetup = await c.evalExpr(`window.__sc.clickExplorerRow('Project Setup')`);
    await sleep(2500);
    await explorerFilter(c, '');
    await sleep(800);
    check('P.setup', 'the Project Setup tab is open', openedSetup === true, `clicked=${openedSetup}`);
    if (openedSetup) {
      note('P.titles', 'ProjectSetupTab groups on screen',
        JSON.stringify(await bound(c, PAGE_X, 1e9)));
      // The setup tab's group titles are ZONE IDS (ProjectSetupTab.tsx:251,
      // `g.id.toUpperCase()`), so there is no literal set to transcribe — the
      // profile decides them. A floor plus a DOM sentinel that only this page
      // can satisfy is the honest substitute; both halves are load-bearing.
      measured.push(await measureSurface(c, 'P', 'ProjectSetupTab (classic, all groups expanded)', {
        minCount: 2,
        sentinel: {
          expr: `(() => { const t = [...document.querySelectorAll('div')]
              .some((e) => e.children.length === 0 && e.textContent.trim() === 'Project Setup');
            const apply = [...document.querySelectorAll('button')]
              .some((b) => /Apply & re-validate/.test(b.textContent || ''));
            return { title: t, apply }; })()`,
          desc: 'the page draws its own "Project Setup" title AND its Apply & re-validate footer',
          ok: (v) => v && v.title === true && v.apply === true,
        },
      }, { minLeft: PAGE_X, expandAll: true }));
    }

    // --- SpriteMode, CLASSIC ONLY (expect 7) -----------------------------
    // editObjectArt is the same tab-open the object rows drive. $25 is a GHZ
    // object with art; any zone-resident object works.
    const openedSprite = await c.evalExpr('window.__dbg.editObjectArt(0x25)').catch((e) => `threw: ${e.message}`);
    await sleep(4000);
    await c.evalExpr(INSTALL);
    check('S7.setup', 'a sprite document is open in a CLASSIC-ONLY session',
      openedSprite === true, `editObjectArt(0x25) -> ${JSON.stringify(openedSprite)}`);
    const s7 = await bound(c, PAGE_X, 1e9);
    note('S7.titles', 'SpriteMode sections, classic-only session', JSON.stringify(s7));
    // The classic-only count: the four unconditional sections + the three the
    // classic gate adds. `project` is null here, so export/character are absent.
    check('S7.seven', 'SpriteMode mounts SEVEN sections in a classic-only session',
      s7.length === 7, `${s7.length}: ${JSON.stringify(s7)}`);
    measured.push(await measureSurface(c, 'S7', 'SpriteMode (classic only — seven)', {
      titles: [...T_SPRITE_ALWAYS, ...T_SPRITE_CLASSIC],
      sentinel: {
        expr: '({ sprite: window.__dbg.spriteState().activeDocId, '
          + 'aeon: window.__dbg.aeon.state().open, classic: window.__dbg.projStatus().status })',
        desc: 'a sprite doc is checked out, classic is open and NO aeon project is resident',
        ok: (v) => v && v.sprite && v.classic === 'open' && v.aeon !== true,
      },
    }, { minLeft: PAGE_X, expandAll: true, wheelSection: SPRITE_WHEEL_SECTION }));

    // --- CanvasMode, worst case (1024x1024 -> 16 commit rows) ------------
    // CommitPlanView renders one target row per 256x256 chunk
    // (CommitPlanView.tsx:128) with no cap and no scroller of its own, and
    // CANVAS_MAX_SIDE = 1024 (canvas-doc.ts:142) makes 4x4 = 16 the ceiling.
    // That is the largest a `canvas.commit` content section can ever be.
    // THE BUG THE FIRST CONTROLLER RUN EXPOSED, and it was in this block.
    // `NEW_CANVAS_DEFAULTS` has no default NAME on purpose (new-canvas.ts:77:
    // "the name field opens empty on purpose — Create starts disabled until the
    // artist types one"). The first version of this harness set only the width
    // and height, so Create was disabled, the click did nothing, NO CANVAS WAS
    // EVER CREATED, and the block went on to measure SpriteMode's column a
    // second time under CanvasMode's name. `C.i0` was the only row that noticed.
    // Type the name first, set the profile explicitly, and VERIFY Create is
    // enabled before clicking it.
    let dlg = false;
    for (let i = 0; i < 3 && !dlg; i++) {
      await escapeKey(c); await sleep(300);
      await ctrlK(c); await sleep(700);
      await c.evalExpr(INSTALL);
      if (await c.evalExpr('window.__sc.paletteInput() !== null')) {
        await typeText(c, 'New Canvas'); await sleep(500); await enter(c); await sleep(900);
      }
      await c.evalExpr(INSTALL);
      dlg = await c.evalExpr('window.__sc.dlg() !== null');
    }
    check('C.setup', 'the New Canvas dialog opened', dlg === true, `dlgOpen=${dlg}`);
    if (dlg) {
      const canvasName = `sectioncol${Date.now().toString(36)}`;
      await clickEl(c, 'window.__sc.dlgName()');
      await key(c, 'a', 'KeyA', 65, 2);
      await typeText(c, canvasName);
      for (const [i, v] of [[0, '1024'], [1, '1024']]) {
        await clickEl(c, `window.__sc.dlgNums()[${i}]`);
        await key(c, 'a', 'KeyA', 65, 2);
        await typeText(c, v);
      }
      // `genesis-level-art` is the default AND the only profile whose grids match
      // the tile/block/chunk ladder a commit speaks; set it explicitly so a
      // changed default cannot silently move this measurement.
      await c.evalExpr(`(() => { const s = window.__sc.dlgSelect(); if (!s) return null;
        const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        set.call(s, 'genesis-level-art'); s.dispatchEvent(new Event('change', { bubbles: true }));
        return s.value; })()`);
      await sleep(500);
      const snap = await c.json('window.__sc.dlgSnapshot()');
      // The row that would have caught the original defect at its own site,
      // rather than four steps downstream in a geometry number.
      check('C.setup2', 'the New Canvas form is valid and Create is ENABLED before it is clicked',
        snap !== null && snap.createDisabled === false, JSON.stringify(snap));
      await clickEl(c, 'window.__sc.dlgCreate()');
      await sleep(4000);
      await c.evalExpr(INSTALL);
      // STORE-LEVEL PROOF that a 1024x1024 canvas exists, before any DOM is read.
      const cdoc = await c.json(`(() => { const id = window.__dbg.canvas.activeDocId();
        return { id, state: id ? window.__dbg.canvas.state(id) : null,
                 dlgStillOpen: window.__sc.dlg() !== null }; })()`).catch((e) => ({ threw: e.message }));
      check('C.setup3', 'a 1024x1024 canvas document is checked out',
        !!(cdoc.state && cdoc.state.width === 1024 && cdoc.state.height === 1024), JSON.stringify(cdoc));
      const rows = await c.evalExpr('window.__sc.commitRows()');
      note('C.rows', 'commit-plan target rows on screen', `${rows} (16 expected for 1024x1024)`);
      measured.push(await measureSurface(c, 'C', 'CanvasMode (1024x1024 — worst case)', {
        titles: T_CANVAS,
        sentinel: {
          expr: `(() => { const id = window.__dbg.canvas.activeDocId();
            return { id, w: id ? window.__dbg.canvas.state(id).width : null,
                     h: id ? window.__dbg.canvas.state(id).height : null,
                     commitRows: window.__sc.commitRows() }; })()`,
          desc: 'the canvas store has a 1024x1024 document checked out AND the commit '
            + 'plan drew its 16 per-chunk rows',
          ok: (v) => v && v.id && v.w === 1024 && v.h === 1024 && v.commitRows === 16,
        },
      }, { minLeft: PAGE_X, expandAll: true }));
    }

    // =====================================================================
    // PHASE B — an AEON-ONLY session: SpriteMode(6), the docblock's number
    // =====================================================================
    await freshSession(c);
    const ast = await openAeon(c);
    const classicAfter = await c.json('window.__dbg.projStatus()').catch(() => null);
    check('B.setup', 'the aeon project is open and NO classic project is',
      !!(ast && ast.open) && !!(classicAfter && classicAfter.status !== 'open'),
      `aeon=${JSON.stringify(ast)} classic=${JSON.stringify(classicAfter)}`);
    if (ast && ast.open) {
      await explorerFilter(c, 'New Sprite');
      const newSprite = await c.evalExpr(`window.__sc.clickExplorerRow('New Sprite')`);
      await sleep(3500);
      await explorerFilter(c, '');
      await sleep(700);
      check('S6.setup', 'a sprite document is open in an AEON-ONLY session', newSprite === true, `clicked=${newSprite}`);
      const s6 = await bound(c, PAGE_X, 1e9);
      note('S6.titles', 'SpriteMode sections, aeon-only session', JSON.stringify(s6));
      // THE DOCBLOCK'S CLAIM, tested. ui/primitives.tsx:27 says "SpriteMode
      // mounts six". This is the configuration in which that is true.
      check('S6.doc', 'ui/primitives.tsx\'s "SpriteMode mounts six" holds in an aeon-only session',
        s6.length === 6, `${s6.length} sections: ${JSON.stringify(s6)}`);
      measured.push(await measureSurface(c, 'S6', 'SpriteMode (aeon only — the docblock\'s six)', {
        titles: [...T_SPRITE_ALWAYS, ...T_SPRITE_AEON],
        sentinel: {
          expr: '({ sprite: window.__dbg.spriteState().activeDocId, '
            + 'aeon: window.__dbg.aeon.state().open, classic: window.__dbg.projStatus().status })',
          desc: 'a sprite doc is checked out, aeon is open and NO classic project is resident',
          ok: (v) => v && v.sprite && v.aeon === true && v.classic !== 'open',
        },
      }, { minLeft: PAGE_X, expandAll: true }));

      // =================================================================
      // PHASE C — THE NINE. Aeon first, classic SECOND, without clearing:
      // open-project.ts's docblock says the resident aeon project survives a
      // classic open, and no app path resets it. If that is true, both gates
      // in SpriteMode.tsx are open at once and all nine sections mount.
      // =================================================================
      const cph = await openClassic(c);
      const both = await c.json('({ aeon: window.__dbg.aeon.state(), classic: window.__dbg.projStatus() })');
      check('S9.setup', 'BOTH projects are resident at once (aeon opened first, classic second)',
        !!(both.aeon && both.aeon.open) && both.classic.status === 'open', JSON.stringify(both));
      const opened9 = await c.evalExpr('window.__dbg.editObjectArt(0x25)').catch((e) => `threw: ${e.message}`);
      await sleep(4000);
      await c.evalExpr(INSTALL);
      check('S9.open', 'a sprite document is open with both projects resident',
        opened9 === true, `editObjectArt(0x25) -> ${JSON.stringify(opened9)} level=${JSON.stringify(cph.lvl)}`);
      const s9 = await bound(c, PAGE_X, 1e9);
      note('S9.titles', 'SpriteMode sections, BOTH projects resident', JSON.stringify(s9));
      // THE BOOKING'S CENTRAL NUMBER. Red here means the nine-section column is
      // NOT reachable and item 19's extreme case does not exist — which would be
      // the most useful possible outcome of this harness, not a failure of it.
      check('S9.nine', 'the nine-section SpriteMode column is REACHABLE (item 19\'s extreme case)',
        s9.length === 9, `${s9.length} sections: ${JSON.stringify(s9)}`);
      measured.push(await measureSurface(c, 'S9', 'SpriteMode (BOTH projects — the nine)', {
        titles: [...T_SPRITE_ALWAYS, ...T_SPRITE_AEON, ...T_SPRITE_CLASSIC],
        sentinel: {
          expr: '({ sprite: window.__dbg.spriteState().activeDocId, '
            + 'aeon: window.__dbg.aeon.state().open, classic: window.__dbg.projStatus().status })',
          desc: 'a sprite doc is checked out and BOTH projects are resident at once',
          ok: (v) => v && v.sprite && v.aeon === true && v.classic === 'open',
        },
      }, { minLeft: PAGE_X, expandAll: true, wheelSection: SPRITE_WHEEL_SECTION }));
    }
  } finally {
    if (c) {
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* */ }
      await sleep(3000);
      try { c.close(); } catch { /* */ }
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    try { execSync(`pkill -f 'aurora/dist/main/inde[x].mjs' 2>/dev/null; true`, { shell: '/bin/bash' }); } catch { /* */ }
    await sleep(1000);
    console.log(`\nport free after teardown: ${await portFree()}`);
  }

  const clean = measured.filter(Boolean);
  const file = SUMMARY(SCREEN + (PLANT ? `-plant-${PLANT}` : ''));
  writeFileSync(file, JSON.stringify({
    screen: SCREEN, plant: PLANT, when: new Date().toISOString(),
    uptime: execSync('uptime', { encoding: 'utf8' }).trim(),
    // The window as the PAGE saw it, not as xvfb was asked for — the two differ
    // by the OS frame, and every derived "needs a window N px tall" is computed
    // from this rather than from SCREEN_H.
    innerH: VIEWPORT.achieved ? VIEWPORT.achieved.h : (clean.length ? clean[0].win.innerH : null),
    innerW: VIEWPORT.achieved ? VIEWPORT.achieved.w : (clean.length ? clean[0].win.innerW : null),
    viewport: VIEWPORT.mechanism,
    surfaces: clean.map((m) => ({
      tag: m.tag, label: m.label, natural: m.natural, share: m.share, floored: m.floored,
      clientH: m.container.clientH, scrollH: m.container.scrollH, overflowPx: m.container.overflowPx,
      sections: m.sections.map((s) => ({ title: s.title, h: s.section?.h ?? 0 })),
    })),
    results, notes,
  }, null, 2));
  console.log(`\nsummary -> ${file}`);

  // ======================================================================
  // THE POISONED-RUN INVARIANT
  // ======================================================================
  // A run with a defect installed that reports every row green is a FAILURE,
  // whatever the disclosure says about why.
  //
  // EARNED, NOT ANTICIPATED. PLANT=list-no-scroller removes the inner scrollers
  // from a section and c4 is the row that judges inner-scroller behaviour, so
  // the plant deleted its own judge and the run reported a clean 65/65 with six
  // extra NOT-MEASURED notes. Each note was honest and said exactly why; the
  // HEADLINE still read as a green run with a poison installed, which is the
  // "passes for the wrong reason" shape wearing a disclosure as cover. This is
  // the general fix, so it protects every future plant rather than that one.
  if (PLANT) {
    const red = results.filter((r) => !r.ok);
    check('P.invariant', `PLANT=${PLANT} is installed, so at least one row MUST be red`,
      red.length > 0,
      red.length
        ? `${red.length} red: ${red.map((r) => r.id).join(', ')}`
        : `EVERY ROW PASSED WITH A DEFECT INSTALLED. ${notes.length} NOT-MEASURED notes were emitted — `
          + 'if the plant disabled the very rows that judge it, the plant is not coverage and must be '
          + 're-aimed or retired (see the harness header). A plant that cannot fail is worse than no '
          + 'plant, because the next session reads it as coverage.');
    const judge = PLANT_JUDGE[PLANT];
    if (judge) {
      const hit = red.filter((r) => judge.test(r.id));
      check('P.invariant2', `PLANT=${PLANT}'s NAMED judge (${judge.source}) is what went red`,
        hit.length > 0,
        hit.length ? `${hit.map((r) => r.id).join(', ')}`
          : `no row matching ${judge.source} is red. Red rows: ${red.map((r) => r.id).join(', ') || '(none)'}. `
            + 'Some other row going red does not make this plant coverage for the property it names.');
    }
  }

  compare(true);

  console.log(`\n    uptime/load at end: ${execSync('uptime', { encoding: 'utf8' }).trim()}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed   (+${notes.length} NOT-MEASURED / context notes)`);
  if (fails.length) { console.log(`\nfailed rows:\n  ${fails.join('\n  ')}`); process.exit(1); }
}

/**
 * c5 — the natural stack height must be a property of the CONTENT, not of the
 * window — plus the minimum-window-height derivation both runs make possible.
 *
 * Reads the two UNPLANTED summaries. If both are not present this reports NOT
 * MEASURED rather than passing: a self-check that quietly skips is the vacuous-
 * guard failure this repo keeps finding.
 */
function compare(quiet = false) {
  const a = SUMMARY('1680x1050'), b = SUMMARY('1280x800');
  if (!existsSync(a) || !existsSync(b)) {
    const msg = `need BOTH ${a} and ${b}; run the harness at both SCREEN sizes, then --compare`;
    if (quiet) console.log(`\n[c5] cross-size self-check NOT MEASURED — ${msg}`);
    else note('c5', 'NOT MEASURED', msg);
    return;
  }
  const A = JSON.parse(readFileSync(a, 'utf8')), B = JSON.parse(readFileSync(b, 'utf8'));
  // THE GUARD THE FIRST CONTROLLER RUN EARNED. `SCREEN` used to size the xvfb
  // display rather than the window, so both runs came back at 1400x872 and this
  // comparison would have reported "0.0% drift, PASS" about two runs at the SAME
  // size — measuring nondeterminism and calling it cross-size behaviour. c5
  // cannot discriminate unless the sizes actually differ, so it refuses.
  if (A.innerH === null || B.innerH === null || Math.abs(A.innerH - B.innerH) < 40) {
    console.log(`FAIL  [c5] NOT COMPUTABLE — the two runs were taken at the SAME viewport height `
      + `(${A.innerH} vs ${B.innerH}). c5 measures cross-SIZE behaviour; comparing two identically `
      + 'sized runs would measure run-to-run noise and report it as a size property.');
    console.log(`      mechanisms: ${A.viewport ?? '?'} / ${B.viewport ?? '?'}. Fix the viewport before `
      + 'reading anything below, and treat the minimum-window-height derivation as NOT MEASURED.');
    return;
  }
  console.log('\n=== [c5] cross-size self-check: is the natural stack height a content property? ===');
  console.log(`    viewports: ${A.innerW}x${A.innerH} (${A.viewport}) vs ${B.innerW}x${B.innerH} (${B.viewport})`);
  let worst = 0;
  let compared = 0;
  for (const sa of A.surfaces) {
    const sb = B.surfaces.find((s) => s.tag === sa.tag);
    if (!sb) { console.log(`  ${sa.tag}: only measured at 1680x1050 — NOT COMPARABLE`); continue; }
    compared++;
    const drift = Math.abs(sa.natural - sb.natural) / Math.max(1, sa.natural);
    worst = Math.max(worst, drift);
    console.log(`  ${sa.tag.padEnd(3)} natural ${String(sa.natural).padStart(5)}px @1050  vs `
      + `${String(sb.natural).padStart(5)}px @800   drift ${(drift * 100).toFixed(1)}%   `
      + `column ${sa.clientH}->${sb.clientH}   overflow ${sa.overflowPx}->${sb.overflowPx}px`);
  }
  if (!compared) { console.log('  NOTHING COMPARABLE — the two runs measured no surface in common.'); return; }
  const ok = worst <= 0.04;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [c5] the natural stack height is a content property `
    + `(worst drift ${(worst * 100).toFixed(1)}% across ${compared} surfaces, budget 4%)`);
  console.log('      If this is RED, every px number above is window-dependent and the');
  console.log('      "minimum window height" derivation below is not a number at all.');

  // WHAT WINDOW WOULD BE BIG ENOUGH? Derived, not modelled: the shell's chrome
  // (app bar + tool options + status bar) is whatever the two runs say it is —
  // `innerH - column.clientH` — read off BOTH sizes so a chrome that is itself
  // height-dependent shows up as a disagreement rather than hiding.
  console.log('\n=== MINIMUM WINDOW HEIGHT for a scrollbar-free column, per surface ===');
  for (const sa of A.surfaces) {
    const sb = B.surfaces.find((s) => s.tag === sa.tag);
    if (!sb) continue;
    const chromeA = A.innerH - sa.clientH;
    const chromeB = B.innerH - sb.clientH;
    const chrome = Math.round((chromeA + chromeB) / 2);
    console.log(`  ${sa.tag.padEnd(3)} ${sa.label}`);
    console.log(`      natural stack ${sa.natural}px + shell chrome ${chrome}px `
      + `(measured ${chromeA} @innerH ${A.innerH} / ${chromeB} @innerH ${B.innerH})`);
    console.log(`      -> needs a window about ${sa.natural + chrome}px tall to lose its scrollbar`);
    console.log(`      at 1050: column ${sa.clientH}px, overflow ${sa.overflowPx}px`
      + `   |   at 800: column ${sb.clientH}px, overflow ${sb.overflowPx}px`);
    if (Math.abs(chromeA - chromeB) > 24) {
      console.log('      WARNING: the chrome is not constant across the two sizes, so the');
      console.log('      "needs a window N px tall" number above is an ESTIMATE, not a measurement.');
    }
  }
}

if (process.argv.includes('--compare')) { compare(); }
else main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
