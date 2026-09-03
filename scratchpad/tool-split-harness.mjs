#!/usr/bin/env node
// Step-E smoke: drive classic's chip row in the real app and check that the
// dual-purpose `object` tool really did split cleanly into select / place-object.
//
// The node suite proves the derivation (armedPlacementId) and the store wiring.
// What it cannot see is the thing a user would actually hit: whether the map's
// mouse dispatch, hover ghost, cursor and status hint all agree about which of
// the two tools is active — five separate branches that used to read one flag.
//
// The status hint is the probe. It is rendered straight off the same tool and
// armed-id the click handlers read, so if it says "click selects" while the
// tool is armed, the branches have desynced.
//
// ═══ WHAT WAS STALE HERE, AND WHY IT WENT RED (O50-TRIAGE-C, 2026-09-03) ═════
//
// The SUBJECT above is intact — every hint branch this file quotes is still in
// ClassicMapToolOptions.tsx. Four separate things about HOW it looked had
// drifted, and together they cost 5 of 9 rows:
//
//  1. THE CHIP ROW IS NOT TEXT ANY MORE. The row of labelled chips was replaced
//     by the engine-neutral `MapFacetDock`, which renders `ToolButton`s —
//     icon-only `<button title=… aria-label=…>` with NO text content
//     (components/ui/primitives.tsx:90). A leaf-text scan for "Stamp Chunk"
//     therefore matched nothing. What it DID match was `"View"` — the View
//     MENU in the shell menubar. So the row failed reporting `["View"]`, which
//     reads like "three tools vanished" and was in fact "the finder is looking
//     for the wrong kind of element and found an unrelated one". Tools are
//     found by `aria-label` now, against the label table itself.
//
//  2. `place-object` IS NOT ON THE LAYOUT FACET. It left `facetTools.layout`
//     when the Objects facet was restored (owner, 2026-08-14 — the three-step
//     history is written out in core/project/s1/index.ts around the
//     declaration). Layout is `view / stamp-chunk / select`; `place-object`
//     lives on OBJECTS. Rows 4 and 5 arm an object, so they now switch facet
//     first and say so.
//
//  3. RAIL ORDER IS `dockOrder`, NOT MANIFEST ORDER. The manifest declares
//     `['view','stamp-chunk','select']` (first entry = the facet DEFAULT); the
//     dock sorts by the one vocabulary order `TOOL_IDS`, so the rail reads
//     View / Select / Stamp Chunk. The old literal had them in manifest order.
//
//  4. ⚠ THE FACET WAS NEVER ASSERTED, AND IT IS PERSISTED. The facet is
//     restored from the previous session, so this harness measured whichever
//     facet the last app run happened to leave behind. Measured 2026-09-03:
//     a run that inherited the Collision facet showed a rail of
//     `["View","Paint Collision"]` and the collision palette's words in the
//     DOM, while the harness went on describing its failures as if it were on
//     Layout. `localStorage` is cleared before the open now, and every rail row
//     names the facet it set.
//
// Two method rules follow from that and are load-bearing below:
//   · a tool is armed by a REAL `Input.dispatchMouseEvent` on the rail button's
//     measured rect, never `element.click()`. The assertion is then
//     self-proving about placement: a button that is not where the rect says
//     takes the click somewhere else and `tool` does not change, so the row
//     goes red rather than reading the previous screen.
//   · every gesture row asserts the ARMED TOOL (`__dbg.aeon.state().tool`, the
//     shared editorStore both engines write) *and* the hint. The hint alone
//     cannot tell "the click missed" from "the branches desynced", which is the
//     one distinction this file exists to make.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = 9342;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
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
  return {
    ready, send, evalExpr,
    // Round-trip through JSON so an object result survives `returnByValue`
    // without the harness having to flatten it into a string first.
    json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)),
    close: () => ws.close(),
  };
}

const fails = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(name);
}

// Click the element whose trimmed text is exactly `label`.
//
// Two shapes to cover, and getting this wrong produced two rounds of phantom
// failures that were the harness's alone:
//   - the ui kit's Chip is a <span> with an onClick, so the tool / plane /
//     overlay chips are NOT buttons (round 1 found no chips at all);
//   - the object-library rows ARE buttons, but wrap a badge span and a label
//     span, so a leaf-only rule skips them (round 2 stopped arming objects).
// Buttons first (they may have children), then leaf spans.
//
// ⚠ THIS IS `.click()` AND STAYS `.click()` ONLY FOR PLANE/OVERLAY CHIPS. The
// ui kit's Chip is a <span onClick=…>, a React synthetic handler, which a
// dispatched MouseEvent from `.click()` does reach. The TOOL RAIL is not
// reached this way any more — see `armTool` below, and the header's point 1.
const clickByText = (label) => `
  (() => {
    const want = ${JSON.stringify(label)};
    const btn = [...document.querySelectorAll('button,[role=button]')]
      .find((e) => e.textContent.trim() === want);
    if (btn) { btn.click(); return true; }
    const span = [...document.querySelectorAll('span')]
      .find((e) => e.children.length === 0 && e.textContent.trim() === want);
    if (span) { span.click(); return true; }
    return false;
  })()`;

/* ═════════════════════════════════════════════════════════════════════════════
 * THE EXPECTATION FOR THE RAIL ROW, DERIVED FROM THE APP'S OWN SOURCES.
 *
 * Three files, because the rail is the composition of three facts and the row's
 * subject is that the composition still holds:
 *   · WHICH tools  — `facetTools.layout` in core/project/s1/index.ts (the s1
 *                    manifest; the ONE declaration `toolsForFacet` reads);
 *   · WHAT ORDER   — `TOOL_IDS` in core/project/adapter.ts (`dockOrder` sorts
 *                    by index in it, which is NOT the manifest's order);
 *   · WHAT LABEL   — `TOOL_LABELS` in renderer/workspace/tool-meta.ts, which is
 *                    also the `aria-label` the rail buttons carry.
 *
 * A rename in any of the three moves the app AND this expectation together,
 * which is correct: a rename is not a defect. What the row still catches is the
 * rail rendering a set or an order the declaration does not say — which is
 * exactly what a facet re-home breaks, and exactly what happened on 2026-08-14.
 * Nothing here is a frozen literal; `['View','Select','Stamp Chunk']` is never
 * typed.
 *
 * Every reader REFUSES loudly rather than returning an empty list, because an
 * empty expectation would match an empty rail.
 * ═══════════════════════════════════════════════════════════════════════════ */

function readSource(rel) {
  const p = join(ROOT, rel);
  try { return readFileSync(p, 'utf8'); }
  catch (e) { throw new Error(`cannot read ${p} (${e.code ?? e.message}) — the rail row has no expectation to compare against; that is UNMEASURABLE, not a pass`); }
}

/** `TOOL_IDS`, in vocabulary order — `dockOrder`'s sort key. */
function toolIdsFromSource() {
  const m = readSource('src/core/project/adapter.ts')
    .match(/export const TOOL_IDS = \[([\s\S]*?)\] as const;/);
  if (!m) throw new Error('core/project/adapter.ts no longer spells `export const TOOL_IDS = [ … ] as const;` — this harness cannot derive dock order');
  const ids = [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
  if (!ids.length) throw new Error('TOOL_IDS parsed to an EMPTY list — refusing to compare a rail against nothing');
  return ids;
}

/** `TOOL_LABELS`: tool id → the label that is also the button's aria-label. */
function toolLabelsFromSource() {
  const m = readSource('src/renderer/workspace/tool-meta.ts')
    .match(/export const TOOL_LABELS: Record<ToolId, string> = \{([\s\S]*?)\n\};/);
  if (!m) throw new Error('renderer/workspace/tool-meta.ts no longer spells `export const TOOL_LABELS: Record<ToolId, string> = { … };`');
  const out = {};
  for (const [, id, label] of m[1].matchAll(/'?([a-z-]+)'?:\s*'([^']+)'/g)) out[id] = label;
  if (!Object.keys(out).length) throw new Error('TOOL_LABELS parsed to an EMPTY map — refusing to compare a rail against nothing');
  return out;
}

/** `facetTools[facet]` as the s1 manifest declares it, or null when undeclared
 *  (the facet then takes the shell default, which is a different file's fact —
 *  the caller says so rather than guessing). */
function s1FacetToolsFromSource(facet) {
  const body = readSource('src/core/project/s1/index.ts')
    .match(/facetTools:\s*\{([\s\S]*?)\n\s*\},/);
  if (!body) throw new Error('core/project/s1/index.ts no longer declares a `facetTools: { … }` block');
  const row = body[1].match(new RegExp(`\\n\\s*${facet}:\\s*\\[([^\\]]*)\\]`));
  if (!row) return null;
  const ids = [...row[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
  if (!ids.length) throw new Error(`the s1 manifest declares \`${facet}\` with an EMPTY tool list — refusing to compare a rail against nothing`);
  return ids;
}

/** The aria-labels the rail should carry for `facet`, in dock order. */
function expectedRail(facet) {
  const declared = s1FacetToolsFromSource(facet);
  if (declared === null) return null;
  const order = toolIdsFromSource();
  const labels = toolLabelsFromSource();
  return [...declared]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((id) => {
      if (!(id in labels)) throw new Error(`the s1 manifest declares tool '${id}' for ${facet} but TOOL_LABELS has no label for it`);
      return labels[id];
    });
}

/** Every label in the vocabulary — how a rail button is told from every other
 *  labelled button on screen (the sprite-mode rows, zoom, the Aether pill). */
function allToolLabels() { return Object.values(toolLabelsFromSource()); }

// The classic viewport's right-aligned status hint.
const HINT = `
  (() => {
    const s = [...document.querySelectorAll('span')]
      .map((e) => e.textContent.trim())
      .filter((t) => /drag to pan|click selects|click to place|stamp \\$|no object armed|FG-only/.test(t));
    return s[0] ?? '';
  })()`;

/** The rail's aria-labels, in DOM order — every labelled button whose label is
 *  in the tool vocabulary. Derived, so a new tool joins it without an edit. */
const railExpr = (labels) => `
  (() => {
    const vocab = ${JSON.stringify(labels)};
    return [...document.querySelectorAll('button[aria-label]')]
      .map((b) => b.getAttribute('aria-label'))
      .filter((l) => vocab.includes(l));
  })()`;

/**
 * Arm a tool by a REAL click on its rail button — measured rect, dispatched
 * mouse event, no `element.click()`.
 *
 * Returns `{ found, rect, onscreen, tool, hint }`. `onscreen` compares the
 * button's rect against the WINDOW box rather than asking `checkVisibility()`,
 * which returns true for an element scrolled far out of its scroller (measured
 * in this repo: green at 2,635px out). It is reported as evidence; the GATE is
 * that `tool` actually changed, which a click landing anywhere else cannot fake.
 */
async function armTool(c, label) {
  const r = await c.json(`
    (() => {
      const b = [...document.querySelectorAll('button[aria-label]')]
        .find((e) => e.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!b) return null;
      const q = b.getBoundingClientRect();
      return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2),
               left: q.left, top: q.top, right: q.right, bottom: q.bottom,
               onscreen: q.width > 0 && q.height > 0 && q.right > 0 && q.bottom > 0
                 && q.left < innerWidth && q.top < innerHeight };
    })()`);
  if (!r) return { found: false, onscreen: false, tool: null, hint: '' };
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(40);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(250);
  return {
    found: true, onscreen: r.onscreen, at: `${r.x},${r.y}`,
    tool: await c.evalExpr('window.__dbg.aeon.state().tool'),
    hint: await c.evalExpr(HINT),
  };
}

async function main() {
  // The expectations are read BEFORE the app is launched: an unreadable source
  // tree must refuse here, not halfway through a run whose earlier rows have
  // already printed PASS.
  const wantLayoutRail = expectedRail('layout');
  if (wantLayoutRail === null) throw new Error('the s1 manifest no longer declares facetTools.layout, so the layout rail is the SHELL DEFAULT and this harness is asserting the wrong file — retarget it at renderer/workspace/facet-tools.ts FACET_TOOLS or retire this row');
  const vocab = allToolLabels();

  // UNDER Xvfb, at a stated size — it used to spawn Electron bare, which meant
  // it opened a real window on whatever display the operator happened to have
  // and measured rects at whatever size that window took. Every rect and every
  // click position below is only reproducible against a stated screen.
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const electron = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
  electron.stderr.on('data', () => {});

  try {
    const c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 40; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"')) break;
      await sleep(250);
    }
    // ⚠ THE FACET IS PERSISTED. Without this the run inherits whichever facet
    // the previous app run left behind, and every rail row below measures a
    // facet nobody chose. See the header, point 4.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3000);
    for (let i = 0; i < 40; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(250);
    }
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(2500);
    console.log(`        devicePixelRatio=${await c.evalExpr('window.devicePixelRatio')}`);

    // --- the facet under test, SET and asserted, never assumed ------------
    const onLayout = await c.json(`window.__dbg.aeon.setFacet('layout')`);
    await sleep(400);
    check('the run is on the Layout facet (set, not inherited from the last run)',
      onLayout?.facet === 'layout', JSON.stringify(onLayout));

    // --- the rail is profile-declared -------------------------------------
    const rail = await c.evalExpr(railExpr(vocab));
    check('the Layout rail is exactly the s1 manifest\'s facetTools.layout, in dock order',
      JSON.stringify(rail) === JSON.stringify(wantLayoutRail),
      `want ${JSON.stringify(wantLayoutRail)}  got ${JSON.stringify(rail)}`);

    // --- each tool drives BOTH the armed tool and the hint the split predicts
    const stamp = await armTool(c, 'Stamp Chunk');
    check('Stamp Chunk arms stamp-chunk and selects the stamp branch',
      stamp.tool === 'stamp-chunk' && /^stamp \$/.test(stamp.hint),
      `found=${stamp.found} onscreen=${stamp.onscreen} at=${stamp.at} tool=${stamp.tool} hint=${stamp.hint}`);

    const select = await armTool(c, 'Select');
    check('Select arms select and selects the pick/move branch (was `object` unarmed)',
      select.tool === 'select' && select.hint.startsWith('click selects'),
      `found=${select.found} onscreen=${select.onscreen} at=${select.at} tool=${select.tool} hint=${select.hint}`);

    const view = await armTool(c, 'View');
    check('View arms view and selects the pan branch (was `pan`)',
      view.tool === 'view' && view.hint.startsWith('drag to pan'),
      `found=${view.found} onscreen=${view.onscreen} at=${view.at} tool=${view.tool} hint=${view.hint}`);

    // --- place-object lives on OBJECTS now, not on Layout ------------------
    // `objects` declares no facetTools, so its set is the SHELL default and
    // `expectedRail` returns null for it; the claim this row makes is the one
    // the 2026-08-14 revert established and that broke the old row 1 — the tool
    // is reachable, and it is reachable THERE.
    check('Place Object is NOT on the Layout rail (it left facetTools.layout on 2026-08-14)',
      !rail.includes('Place Object'), JSON.stringify(rail));
    const onObjects = await c.json(`window.__dbg.aeon.setFacet('objects')`);
    await sleep(500);
    const objRail = await c.evalExpr(railExpr(vocab));
    check('the Objects rail carries Place Object',
      onObjects?.facet === 'objects' && objRail.includes('Place Object'),
      `facet=${onObjects?.facet} rail=${JSON.stringify(objRail)}`);

    // --- arming from the object library drives the tool ------------------
    const armedOk = await c.evalExpr(clickByText('$1FCrabmeat'));
    await sleep(300);
    const armedTool = await c.evalExpr('window.__dbg.aeon.state().tool');
    const armedHint = await c.evalExpr(HINT);
    check('arming an object from the library switches to place-object',
      armedOk && armedTool === 'place-object' && /^click to place /.test(armedHint),
      `clicked=${armedOk} tool=${armedTool} hint=${armedHint}`);

    // --- and Esc disarms back to select, not to a dead armed tool --------
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(250);
    const escTool = await c.evalExpr('window.__dbg.aeon.state().tool');
    const escHint = await c.evalExpr(HINT);
    check('Esc disarms to Select rather than leaving place-object empty',
      escTool === 'select' && escHint.startsWith('click selects'),
      `tool=${escTool} hint=${escHint}`);

    // --- plane still drives the viewport ---------------------------------
    // ⚠ THIS ROW USED TO ASSERT NOTHING. It read
    //     bgHint.includes('FG-only') || bgHint.startsWith('drag to pan')
    // and `drag to pan …` is the hint's FINAL ELSE — what it says for every
    // tool that is not stamp/collision/place/select. So a BG chip that was
    // never found, never clicked, or wired to nothing produced a green row.
    // The FG-only clause only ever renders under `select`, so the tool is
    // armed first and BOTH sides of the switch are now asserted, each against
    // the string only its own branch can produce.
    await armTool(c, 'Select');
    await c.evalExpr(clickByText('BG')); await sleep(300);
    const bgHint = await c.evalExpr(HINT);
    check('BG plane switch reaches the viewport through editorStore.editingLayer',
      bgHint.startsWith('objects are FG-only'), bgHint);
    await c.evalExpr(clickByText('FG')); await sleep(300);
    const fgHint = await c.evalExpr(HINT);
    check('and FG switches back — the plane is a live control, not a one-way trip',
      fgHint.startsWith('click selects'), fgHint);

    // --- the overlay chip actually moves the shared store ------------------
    // ⚠ AND SO DID THIS ONE. It asserted the string `'clicked'` — that the
    // harness had CALLED `.click()` — and said nothing about the store. It is
    // the exact shape O50's effects packet found in `chunkgrid-hint` ("its
    // anti-vacuous row asserted the click call, not the selection").
    //
    // It also had a live MIS-AIM, and this is the more interesting half.
    // `'Collision'` is a FACET PILL's label. It is NOT the overlay's: the
    // overlay lives in the View MENU (shell/ViewMenu.tsx) as a checkbox
    // `<label>` reading `'Collision (path A)'`, and the menu has to be OPENED
    // before it is in the DOM at all. So the old row searched the whole
    // document for a leaf reading exactly `Collision`, found the FACET PILL,
    // clicked it — silently switching facet under the two rows that follow —
    // and reported PASS because "we called .click()" was the whole assertion.
    //
    // The menu is opened first, the label is read out of `ViewMenu.tsx`'s own
    // LABELS table rather than typed, and the gate is the STORE moving.
    const ovLabel = (readSource('src/renderer/shell/ViewMenu.tsx')
      .match(/showCollision:\s*'([^']+)'/) ?? [])[1];
    if (!ovLabel) throw new Error('shell/ViewMenu.tsx no longer maps `showCollision` to a label — this row cannot name the chip it is about');
    const ovBefore = await c.json('window.__dbg.overlays()');
    await c.evalExpr(`
      (() => {
        const m = [...document.querySelectorAll('button,[role=button]')]
          .find((e) => e.textContent.replace(/\\s+/g, ' ').trim().startsWith('View'));
        if (m) m.click();
      })()`);
    await sleep(300);
    const clickedOverlay = await c.evalExpr(`
      (() => {
        const el = [...document.querySelectorAll('label')]
          .find((e) => e.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(ovLabel)});
        if (!el) return false;
        const box = el.querySelector('input[type=checkbox]');
        if (!box) return false;
        box.click();
        return true;
      })()`);
    await sleep(300);
    const ovAfter = await c.json('window.__dbg.overlays()');
    check(`the "${ovLabel}" overlay chip moves viewStore.overlays.showCollision`,
      clickedOverlay && ovAfter.showCollision !== ovBefore.showCollision,
      `foundChip=${clickedOverlay} showCollision ${ovBefore.showCollision} -> ${ovAfter.showCollision}`);

    const alive = await c.evalExpr('!!document.querySelector("canvas")');
    check('the viewport survived all of it', alive === true, String(alive));

    c.close();
  } finally {
    // ⚠ `electron.kill('SIGKILL')` KILLED THE WRAPPER, NOT THE TREE, and this
    // harness therefore never exited: the O50 sweep killed it at the 600s cap
    // and recorded its tally as a LOWER BOUND. `killTree` is what the guard
    // exports for this and was already imported here, unused.
    await killTree(electron, { quiet: true });
  }
  console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
