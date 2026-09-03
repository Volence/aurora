#!/usr/bin/env node
// WHAT DO THE TWO WHOLESALE DESTRUCTIVE COLLISION BUTTONS ACTUALLY DO?
//
// `CollisionPalette`'s map variant carries a row — `Sec N · Reset · Clear` —
// that no gesture in this repo had ever pressed. O48 enumerated the collision
// surfaces by gesture, found every other one covered, and named these two as
// the hole it did not close:
//
//     "Reset and Clear […] the two wholesale, destructive writers
//      (resetToEngineEntries / clearCollisionEntries, the latter the only
//      gesture in the editor allowed to wipe unowned bits)."
//
// Every other collision writer means something NARROWER than the cell and is
// held to the preservation rule (`collision-word.ts`). These two do not: Reset
// replaces a whole plane with the engine baseline, and Clear writes a bare 0
// into every cell of a plane, unowned bits included, BY DESIGN and on purpose.
// So the question this file answers is not "are they broken" — it is "does the
// reach the code has match the reach the button's words promise, is it undoable
// from where the author actually is when they want it back, and can either fire
// without the author meaning it".
//
// ═══ THE ANTI-VACUOUS RULE, INHERITED AND RE-STATED ═══
//
// EVERY CELL IN EVERY SHIPPED ACT HOLDS ZERO IN THE UNOWNED BITS. A row that
// asks "did Clear destroy the unowned bits" over real content is a coin that
// always lands heads: 0 destroyed and 0 preserved are the same sixteen bits.
// [f0] measures that zero in-run, and every row that says anything about
// unowned bits AUTHORS its destination first through `collisionPoke` and
// re-reads it, refusing to continue if the fixture did not land.
//
// And the converse control, which matters more here than anywhere: a button
// that did NOTHING would sail through every "the unowned bits are gone" row if
// the fixture were absent, and through every "the other plane is untouched" row
// unconditionally. So each phase opens with a CONTROL row proving the write
// happened at all, and [f0] refuses to run the phases if the plane is empty.
//
// ═══ THE MASKS ARE DERIVED, NEVER PINNED ═══
//
// `owned`/`unowned` come from the app's own `collisionWordMasks()`, which
// returns `COLLISION_CELL_OWNED_MASK` and its complement — the constant
// `collision-word.ts` derives from `packCollisionCell` itself. A `0x3fff` typed
// here would be the copied-pin defect this repo keeps paying for. [m0] asserts
// the pair is a real complement and that `unowned` is non-empty, because a
// degenerate mask would make every preservation statement below meaningless.
//
// ═══ THE ROWS THAT CANNOT CARRY THEIR CLAIM ALONE — SAID HERE, NOT IN A
//     FOOTNOTE ═══
//
// [c3] [c4] [r4] [r5] are SCOPE rows: "the other plane / the other section did
// not change". A button that did nothing at all satisfies every one of them.
// They are only measurements BESIDE their phase's control row ([c1], [r1]),
// which is what says a write happened. Read them as a pair or not at all.
//
// ⚠ AND [c4] WAS ACTUALLY VACUOUS, FOUND BY ITS OWN RED-FIRST PLANT. Plant P5
// pointed Clear's command at `activeSectionIndex + 1` — a wipe of the wrong
// SECTION, the worst thing either button could do — and [c4] stayed GREEN. The
// command carries the entry list built from section 0, so it only touches the
// indices section 0 had content at, and section 1 held ZERO at every one of
// them: a write that landed in the wrong section destroyed nothing and the row
// was satisfied by an absence. The fix is the same rule the preservation rows
// already obey — the CONTROL DESTINATION is authored too (see "control
// destinations authored" below), so a mis-targeted apply now has something to
// destroy. P5 re-run is RED.
//
// [k1] — "no keystroke reaches the wholesale writers" — has the matching
// hazard from the other direction: it would go green if the keystrokes never
// arrived. Its positive control is that the SAME `Input.dispatchKeyEvent`
// channel delivers the Ctrl+Z that [c8] and [r8] measure, and those pass. If
// they ever go red, [k1]'s green means nothing.
//
// ═══ d-27, 2026-09-03 — THE BUTTONS NOW ACT AND DROP FOCUS ════════════════
//
// The owner ruled `blur_after_press`: *"just being a button that acts and then
// drops focus is how it should work right?"* (empyrean 034ab6c). The two
// buttons blur unconditionally as they fire, so the Space that used to re-fire
// a wholesale wipe on the still-focused button no longer reaches either writer.
//
// THREE ROWS IN THIS FILE CHANGED MEANING WITH THAT RULING, AND ALL THREE SAY
// SO WHERE THEY LIVE RATHER THAN HERE ONLY:
//
//   [k2] RETIRED — its premise ("the KEYBOARD-fired wipe is as recoverable as
//        the clicked one") describes an event that can no longer occur. It is
//        not deleted quietly and it is not re-pointed at something vacuous; the
//        full accounting, and what replaces it, is at the retirement block.
//   [k3] [k4] [k5] [k6] [k7] NEW — the positive form of the ruling: neither
//        button keeps focus after a real click, a bare Space afterwards changes
//        nothing, a SECOND real click still fires (the anti-cheat row, without
//        which the others pass on buttons that simply do nothing), and a press
//        that changes NOTHING drops focus too ([k7], the row that makes
//        "unconditional" a measurement rather than a comment).
//   [c8] REWORDED — it used to say "pressed with focus still on the button",
//        and proved `isTypingTarget`'s <button> exemption in passing. The
//        Ctrl+Z now arrives from <body>. What it ASSERTS is unchanged (one
//        undo, plane exact) and it prints the measured activeElement beside it.
//   [k1] UNCHANGED and still meaningful, but read its green carefully: it
//        proves there is no GLOBAL key path to the writers, with focus proved
//        off the buttons first. That is a different mechanism from the focused
//        button's own activation, which is [k5]'s. Since d-27, Space cannot
//        reach a writer by either road — so [k1]'s Space is now
//        over-determined and [k5] is the row that would catch a regression of
//        the ruling. Neither subsumes the other: a stray window listener would
//        redden [k1] alone, a lost blur [k5] alone.
//
// ⚠ AND ONE ROW HERE WAS ALREADY WRONG ONCE, IN THE OTHER DIRECTION. The first
// [k1] focused `#map-canvas` and called that "focus is off the buttons". A
// <canvas> has no tabindex, so `.focus()` is a no-op: focus stayed on the Reset
// button the previous phase had clicked, and the Enter and Space in the key set
// re-fired RESET — 1794 cells, exactly [r1]'s own count. The row went red on a
// feature that was fine. It now PROVES where the focus is before it sends
// anything, and sends the keys one at a time so a red names the key.
//
// ═══ WHAT IS DELIBERATELY NOT HERE ═══
//
// O48 also named brush size, Flip H/V, the Floor solidity chips, the kind
// filter tabs and Alt-propagate as gesture-untested. They are booked elsewhere
// and OUT OF SCOPE: ordinary controls with ordinary failure modes. This file
// presses two buttons.
//
// ⚠ IT WRITES NOTHING TO DISK. No Ctrl+S, no save call; the app has no autosave
// (shell/close-guard.ts). Poked fixture cells are restored at the end and the
// restoration is asserted. The wholesale edits are undone through the app's own
// history before the run ends.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:collision-destructive
//                     (or) node scratchpad/collision-destructive-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9451);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-collision-destructive`;
mkdirSync(SHOTS, { recursive: true });

// ── the section geometry, read out of the app's own constants ───────────────
const TYPES_SRC = `${ROOT}/src/core/model/s4-types.ts`;
function constFrom(name) {
  const src = readFileSync(TYPES_SRC, 'utf8');
  const m = new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(src);
  if (!m) throw new Error(`could not read ${name} out of ${TYPES_SRC}`);
  return Number(m[1]);
}
const STW = constFrom('SECTION_TILES_WIDE');
const STH = constFrom('SECTION_TILES_HIGH');
const PLANE_WORDS = STW * STH;   // = SECTION_PLANE_WORDS, derived the same way

const hex = (w) => (w === null || w === undefined ? 'null' : `0x${(w >>> 0).toString(16).padStart(4, '0')}`);
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
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-collision-destructive/${name}.png`);
}

// ── real input ─────────────────────────────────────────────────────────────
async function mouse(c, type, x, y, buttons) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', buttons: buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);

const collAt = (c, s, p, i) => c.evalExpr(`window.__dbg.aeon.collisionAt(${s}, '${p}', ${i})`);
const poke = (c, s, p, i, w) => c.evalExpr(`window.__dbg.aeon.collisionPoke(${s}, '${p}', ${i}, ${w})`);
const canUndo = (c) => c.evalExpr('window.__dbg.aeon.canUndo()');

/**
 * A REAL CLICK ON A REAL BUTTON, aimed at integer client pixels.
 *
 * `devicePixelRatio` varies run-to-run under Xvfb here, so a fractional aim is
 * how a correct feature presents as an off-by-one bug. The centre is rounded to
 * an integer BEFORE it is sent and then verified with `elementFromPoint`: if the
 * integer does not land on the button we meant, this REFUSES rather than
 * clicking whatever is underneath and calling the result a measurement.
 */
async function clickHandle(c, handle, label) {
  const geom = await c.json(String.raw`(() => {
    const el = window.__o48b.el(${JSON.stringify(handle)});
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    return { dpr: window.devicePixelRatio, left: b.left, top: b.top, w: b.width, h: b.height };
  })()`);
  const x = Math.round(geom.left + geom.w / 2);
  const y = Math.round(geom.top + geom.h / 2);
  const hit = await c.json(String.raw`(() => {
    const el = document.elementFromPoint(${x}, ${y});
    return { tag: el ? el.tagName : null, text: el ? (el.textContent || '').trim() : null,
             isTarget: el === window.__o48b.el(${JSON.stringify(handle)}) };
  })()`);
  note(`aim: ${label}`, `dpr=${geom.dpr} rect=(${geom.left},${geom.top},${geom.w}x${geom.h}) `
    + `→ integer client (${x},${y}) · elementFromPoint = <${hit.tag}> "${hit.text}" · isTarget=${hit.isTarget}`);
  if (!hit.isTarget) {
    throw new Error(`AIM REFUSED: integer (${x},${y}) for "${label}" lands on <${hit.tag}> "${hit.text}", `
      + 'not the button. Clicking it would measure something else.');
  }
  await mouse(c, 'mousePressed', x, y);
  await mouse(c, 'mouseReleased', x, y);
  await sleep(350);
  return { x, y };
}

async function main() {
  console.log(`\n=== SECTION GEOMETRY (from ${TYPES_SRC.replace(ROOT + '/', '')}) ===`);
  console.log(`  SECTION_TILES_WIDE = ${STW} · SECTION_TILES_HIGH = ${STH}`);
  console.log(`  one plane = ${PLANE_WORDS} words — the reach both buttons claim`);

  for (let i = 0; i < 60 && !(await portFree()); i++) {
    if (i === 0) note('port', `${PORT} still serving — waiting for the previous run to exit`);
    await sleep(1000);
  }
  if (!(await portFree())) throw new Error(`port ${PORT} still serving a CDP target after 60s — kill it first`);

  const child = spawnGuarded('/usr/bin/xvfb-run', [
    '-a', '--server-args=-screen 0 1680x1050x24',
    ELECTRON, '.', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  ], {
    cwd: RUN.root,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  let c;
  const restore = [];   // { sec, plane, index, word } — put back before exit
  try {
    const ws = await waitForTarget();
    c = cdp(ws);
    await c.ready;

    let hasDbg = 'undefined';
    for (let i = 0; i < 60; i++) {
      hasDbg = await c.evalExpr('typeof window.__dbg');
      if (hasDbg === 'object') break;
      await sleep(500);
    }
    if (hasDbg !== 'object') {
      throw new Error('window.__dbg absent after 30s — this needs a VITE_AURORA_DEBUG=1 build of dist/');
    }
    for (const fn of ['collisionPoke', 'collisionAt', 'collisionWordMasks', 'collisionBaseline']) {
      const t = await c.evalExpr(`typeof window.__dbg.aeon.${fn}`);
      if (t !== 'function') throw new Error(`__dbg.aeon.${fn} absent — dist/ predates this parcel; rebuild`);
    }

    console.log('\n=== OPENING THE REAL AEON PROJECT ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    for (let i = 0; i < 60; i++) {
      const st = await c.json('window.__dbg.aeon.state()');
      if (st.open && st.sections > 0) { note('project open', JSON.stringify(st)); break; }
      await sleep(500);
    }
    const st0 = await c.json('window.__dbg.aeon.state()');
    if (!st0.open) throw new Error('aeon project never opened');

    // ── the in-page toolkit: whole-plane snapshots, compared IN THE PAGE ────
    //
    // A plane is 65536 words. Shipping two of them over CDP per comparison is
    // slow enough to change what the run measures, so snapshots are stored in
    // the page and diffed there; only the SUMMARY crosses the wire. `el()` is
    // the handle table the click helper aims through, so a button found once
    // structurally is the same element every later row acts on.
    await c.evalExpr(String.raw`(() => {
      const N = ${PLANE_WORDS};
      window.__o48b = {
        N, snaps: {}, handles: {},
        el(h) { return this.handles[h]; },
        read(sec, plane) {
          const dbg = window.__dbg.aeon, a = new Array(N);
          for (let i = 0; i < N; i++) a[i] = dbg.collisionAt(sec, plane, i);
          return a;
        },
        stats(a, unownedMask, ownedMask) {
          let cells = 0, nulls = 0, nonzero = 0, shaped = 0, carrying = 0;
          for (let i = 0; i < a.length; i++) {
            const w = a[i];
            if (w === null || w === undefined) { nulls++; continue; }
            cells++;
            if (w !== 0) nonzero++;
            if (w & ownedMask) shaped++;
            if (w & unownedMask) carrying++;
          }
          return { cells, nulls, nonzero, shaped, carrying };
        },
        snap(name, sec, plane) { this.snaps[name] = this.read(sec, plane); return this.snaps[name].length; },
        // Live plane vs a stored snapshot. Returns the number of differing
        // cells and the first three, so a red row names a cell rather than a
        // count.
        diff(name, sec, plane) {
          const before = this.snaps[name], now = this.read(sec, plane);
          let changed = 0; const first = [];
          for (let i = 0; i < now.length; i++) {
            if (before[i] !== now[i]) {
              changed++;
              if (first.length < 3) first.push({ i, was: before[i], now: now[i] });
            }
          }
          return { changed, first, len: now.length };
        },
      };
      return true;
    })()`);

    const M = await c.json('window.__dbg.aeon.collisionWordMasks()');
    console.log('\n=== §MASKS — DERIVED FROM THE APP, NEVER PINNED ===');
    note('collisionWordMasks()', `owned=${hex(M.owned)} unowned=${hex(M.unowned)} `
      + '(COLLISION_CELL_OWNED_MASK, itself derived from packCollisionCell)');
    check('m0', 'the mask pair is a real 16-bit complement with a NON-EMPTY unowned half',
      ((M.owned | M.unowned) & 0xFFFF) === 0xFFFF && (M.owned & M.unowned) === 0 && M.unowned !== 0,
      `owned|unowned=${hex((M.owned | M.unowned) & 0xFFFF)} owned&unowned=${hex(M.owned & M.unowned)}. `
      + 'A degenerate pair would make every unowned-bit row below vacuous.');
    const PROBE = M.unowned;   // every unowned bit lit — DERIVED, not typed

    // ── the facet that mounts the buttons ──────────────────────────────────
    await c.evalExpr("window.__dbg.aeon.setLayer('fg')");
    const facet = await c.json("window.__dbg.aeon.setFacet('collision')");
    note('facet', JSON.stringify(facet));
    await sleep(400);

    // ═══ §BUTTONS — FOUND STRUCTURALLY, NOT BY THEIR WORDS ════════════════
    //
    // Located by the row's own `Sec N` label and taken as "the buttons in that
    // row", NOT by matching the title text — because the title text is one of
    // the things this run MEASURES, and a locator that matched on it could
    // never report a wording change. The labels and titles are read back and
    // asserted afterwards.
    console.log('\n=== §BUTTONS: the Sec N row, located structurally ===');
    const row = await c.json(String.raw`(() => {
      const spans = [...document.querySelectorAll('span')]
        .filter((s) => /^Sec \d+$/.test((s.textContent || '').trim()));
      if (spans.length !== 1) return { found: spans.length };
      const label = spans[0];
      const btns = [...label.parentElement.querySelectorAll('button')];
      btns.forEach((b, i) => { window.__o48b.handles['sec' + i] = b; });
      return {
        found: 1,
        label: label.textContent.trim(),
        buttons: btns.map((b) => ({ text: (b.textContent || '').trim(), title: b.getAttribute('title') || '' })),
      };
    })()`);
    if (row.found !== 1) {
      throw new Error(`expected exactly one "Sec N" label in the collision panel, found ${row.found} — `
        + 'the palette is not mounted, or the section is collapsed. Refusing to run.');
    }
    note('the row', `label "${row.label}" · ${row.buttons.length} button(s)`);
    for (const b of row.buttons) note(`  button "${b.text}"`, `title: ${b.title}`);
    check('b0', 'the Sec N row carries exactly two buttons, labelled Reset and Clear',
      row.buttons.length === 2 && row.buttons[0].text === 'Reset' && row.buttons[1].text === 'Clear',
      `got [${row.buttons.map((b) => `"${b.text}"`).join(', ')}]`);
    const RESET = 'sec0', CLEAR = 'sec1';
    const resetTitle = row.buttons[0]?.title ?? '';
    const clearTitle = row.buttons[1]?.title ?? '';

    // THE SECTION THE ROW SAYS IT ACTS ON, taken from the label — not assumed.
    // Everything below measures against THIS index, so "the button acted on the
    // section it named" is a real comparison rather than a tautology.
    const SEC = Number(/^Sec (\d+)$/.exec(row.label)[1]);
    const PLANE = 'a';
    const OTHER = st0.sections > 1 ? (SEC === 0 ? 1 : 0) : null;
    note('under test', `section ${SEC}, plane ${PLANE} · control section ${OTHER ?? 'NONE (single-section act)'}`);

    // Seed both planes of both sections the way a first paint would, so a
    // snapshot reads words rather than nulls.
    for (const s of [SEC, ...(OTHER === null ? [] : [OTHER])]) {
      for (const p of ['a', 'b']) {
        const w = await collAt(c, s, p, 0);
        await poke(c, s, p, 0, w ?? 0);
      }
    }

    // ═══ §FIXTURE — the measurement that forces every row to author ════════
    console.log('\n=== §FIXTURE: what the plane holds before anything is pressed ===');
    await c.evalExpr(`window.__o48b.snap('virgin', ${SEC}, '${PLANE}')`);
    const virgin = await c.json(`window.__o48b.stats(window.__o48b.snaps.virgin, ${M.unowned}, ${M.owned})`);
    note(`section ${SEC} plane ${PLANE}, as the app holds it`,
      `${virgin.cells} cells (${virgin.nulls} null) · ${virgin.nonzero} non-zero · `
      + `${virgin.shaped} with owned bits · ${virgin.carrying} carrying unowned bits`);
    check('f0', 'the plane holds REAL content and ZERO cells carry unowned bits — so every '
      + 'unowned-bit row below MUST author its own destination',
      virgin.cells === PLANE_WORDS && virgin.nonzero > 0 && virgin.carrying === 0,
      `cells=${virgin.cells}/${PLANE_WORDS} nonzero=${virgin.nonzero} carrying=${virgin.carrying}`);
    if (virgin.nonzero === 0) {
      throw new Error('the plane is already empty — a Clear row against it would be vacuous. Refusing to run.');
    }

    // Four fixture cells: two over real content, two over empty cells, spread
    // across the plane so a partial writer cannot pass by covering one corner.
    const FIX = await c.json(String.raw`(() => {
      const a = window.__o48b.snaps.virgin, owned = ${M.owned};
      const withArt = [], without = [];
      for (let i = 0; i < a.length && (withArt.length < 2 || without.length < 2); i++) {
        const step = 1 + ((i * 7919) % 97);   // walk unevenly, not the first N in a row
        const j = (i * step) % a.length;
        if ((a[j] & owned) && withArt.length < 2 && !withArt.includes(j)) withArt.push(j);
        else if (a[j] === 0 && without.length < 2 && !without.includes(j)) without.push(j);
      }
      return { withArt, without };
    })()`);
    const FIXTURE = [...FIX.withArt, ...FIX.without];
    if (FIXTURE.length < 3) throw new Error(`could not find fixture cells: ${JSON.stringify(FIX)}`);
    note('fixture cells', `${FIXTURE.join(', ')} — ${FIX.withArt.length} over existing content, `
      + `${FIX.without.length} over empty cells`);

    /** Author unowned bits into the fixture cells and REFUSE unless they land. */
    const remembered = new Set();
    async function seed(sec, plane, remember) {
      const landed = [];
      for (const i of FIXTURE) {
        const was = await collAt(c, sec, plane, i);
        // ONCE per cell. A second seed of the same cell would record the
        // ALREADY-SEEDED word as its "original", and the restore at the end
        // would then put the fixture back instead of the run's opening state.
        const k = `${sec}/${plane}/${i}`;
        if (remember && !remembered.has(k)) { remembered.add(k); restore.push({ sec, plane, index: i, word: was ?? 0 }); }
        const want = ((was ?? 0) | PROBE) & 0xFFFF;
        const got = await poke(c, sec, plane, i, want);
        if (got === null) throw new Error(`FIXTURE REFUSED: collisionPoke(${sec},${plane},${i}) returned null`);
        landed.push(got);
      }
      if (!landed.every((w) => (w & M.unowned) === PROBE)) {
        throw new Error(`FIXTURE REFUSED: cells did not read back carrying ${hex(PROBE)} — `
          + `got ${landed.map(hex).join(' ')}. Every row using them would be vacuous.`);
      }
      return landed;
    }

    const seeded = await seed(SEC, PLANE, true);
    note('seeded', FIXTURE.map((i, k) => `${i}:=${hex(seeded[k])}`).join('  '));

    // ⚠ AND THE CONTROL DESTINATIONS TOO — THE ROW THIS FIXES WAS VACUOUS.
    //
    // [c4] ("section N+1 is untouched") went GREEN under a plant that pointed
    // Clear's command at `activeSectionIndex + 1`. The command still carried
    // section 0's entry list — only the cells section 0 had content in — and
    // section 1's plane happened to hold ZERO at every one of those indices, so
    // a write that landed in entirely the wrong section changed nothing
    // measurable and the row was satisfied by an absence.
    //
    // A scope row needs its control destination AUTHORED for exactly the reason
    // a preservation row does. These put a non-zero word at the fixture indices
    // in the other plane and the other section — indices that ARE in the entry
    // list, because the fixture made them non-zero here — so a mis-targeted
    // apply now has something to destroy.
    await seed(SEC, 'b', true);
    if (OTHER !== null) await seed(OTHER, PLANE, true);
    note('control destinations authored',
      `section ${SEC} plane b and section ${OTHER ?? '—'} plane ${PLANE} carry ${hex(PROBE)} at the `
      + 'same fixture indices, so a write aimed at the wrong plane or the wrong section is visible');

    // The history must be EMPTY here for the "exactly one undo step" rows below
    // to mean anything: `collisionPoke` bypasses the command system on purpose,
    // so nothing so far should have pushed a command.
    const undoBefore = await canUndo(c);
    note('history', `canUndo before any button press = ${undoBefore}`);

    // ═══ [c] CLEAR ════════════════════════════════════════════════════════
    console.log('\n=== [c] CLEAR — a real click on the real button ===');
    await c.evalExpr(`window.__o48b.snap('preClear', ${SEC}, '${PLANE}')`);
    await c.evalExpr(`window.__o48b.snap('preClearB', ${SEC}, 'b')`);
    if (OTHER !== null) await c.evalExpr(`window.__o48b.snap('preClearOther', ${OTHER}, '${PLANE}')`);
    const dialogBefore = await c.evalExpr("document.querySelectorAll('[role=\"dialog\"], dialog').length");
    const toastsBefore = await c.json('window.__dbg.aeon.toasts()');

    await clickHandle(c, CLEAR, 'Clear');

    const afterClear = await c.json(`window.__o48b.stats(window.__o48b.read(${SEC}, '${PLANE}'), ${M.unowned}, ${M.owned})`);
    const clearedFixture = [];
    for (const i of FIXTURE) clearedFixture.push(await collAt(c, SEC, PLANE, i));
    note('after Clear', `${afterClear.nonzero} non-zero of ${afterClear.cells} · `
      + `fixture cells now ${clearedFixture.map(hex).join(' ')}`);

    check('c1', 'CONTROL + REACH: one click zeroed EVERY cell of the plane — all '
      + `${PLANE_WORDS} words, not a region`,
      afterClear.cells === PLANE_WORDS && afterClear.nonzero === 0,
      `non-zero after = ${afterClear.nonzero} (was ${virgin.nonzero}); cells read = ${afterClear.cells}`);
    check('c2', "Clear DOES destroy the cell's unowned bits — the documented behaviour of the one "
      + 'gesture allowed to (collision-word.ts, COLLISION_CLEAR_WORD)',
      clearedFixture.every((w) => w === 0),
      `authored ${hex(PROBE)} into ${FIXTURE.length} cells; after Clear they read `
      + `${clearedFixture.map(hex).join(' ')}`);
    const bAfter = await c.json(`window.__o48b.diff('preClearB', ${SEC}, 'b')`);
    check('c3', 'SCOPE: the OTHER plane of the same section is untouched — "this plane" is true',
      bAfter.changed === 0,
      `plane B cells changed = ${bAfter.changed}${bAfter.changed ? ` first ${JSON.stringify(bAfter.first)}` : ''}`);
    if (OTHER !== null) {
      const oAfter = await c.json(`window.__o48b.diff('preClearOther', ${OTHER}, '${PLANE}')`);
      check('c4', `SCOPE: section ${OTHER} is untouched — "section ${SEC}" is true`,
        oAfter.changed === 0,
        `section ${OTHER} plane ${PLANE} cells changed = ${oAfter.changed}`);
    } else {
      check('c4', 'SCOPE: a second section exists to check the section bound against',
        false, 'the act has one section — the section half of the scope claim is UNMEASURABLE here');
    }
    const dialogAfter = await c.evalExpr("document.querySelectorAll('[role=\"dialog\"], dialog').length");
    check('c5', 'MEASURED, and it is the design: Clear fires on ONE CLICK with no confirmation — '
      + 'the wipe is already done and no dialog was raised',
      afterClear.nonzero === 0 && dialogAfter === dialogBefore,
      `dialogs before=${dialogBefore} after=${dialogAfter}; the plane was already zero when read back. `
      + 'The app HAS a confirm facility (state/confirmStore.ts) and this does not use it; '
      + 'undo is the whole safety net.');
    await shot(c, 'c-after-clear');

    // The section the words NAMED, against the section that CHANGED.
    const clearNamed = /\bsection (\d+)\b/i.exec(clearTitle);
    check('c6', 'WORDING: the tooltip names the section that actually changed',
      clearNamed !== null && Number(clearNamed[1]) === SEC,
      `title "${clearTitle}" · named ${clearNamed ? clearNamed[1] : 'NOTHING'} · changed ${SEC}`);
    check('c7', 'WORDING: the tooltip claims ALL of the section\'s collision on this plane, and the '
      + 'reach measured is exactly that — the words are not narrower than the write',
      /\ball\b/i.test(clearTitle) && /this plane/i.test(clearTitle) && afterClear.nonzero === 0,
      `title "${clearTitle}"; measured reach = all ${PLANE_WORDS} words of one plane of one section`);

    // ── undo, from WHEREVER THE CLICK LEFT FOCUS ─────────────────────────
    //
    // This is the sequence a person is actually in: they click Clear, see the
    // section go blank, and hit Ctrl+Z without touching anything in between.
    //
    // ⚠ WHAT "WHEREVER" MEANS CHANGED WITH d-27, AND THIS COMMENT USED TO SAY
    // THE OLD THING. Before the ruling it said "focus is on the button, not the
    // canvas", and the row proved that `LevelWorkspace`'s `isTypingTarget`
    // exempts <button> so the undo gets through. Since d-27 the button DROPS
    // focus as it fires, so the Ctrl+Z below is delivered from <body> instead
    // and this row no longer exercises that <button> exemption — the exemption
    // is still live and still matters for every other button in the app, it is
    // simply not what these two hand it any more. The row is unchanged in what
    // it asserts (one Ctrl+Z, plane exact) and it PRINTS the measured
    // activeElement beside it, so the day either half moves again it is visible
    // in the note rather than inferred from a comment.
    const focusAfter = await c.json(String.raw`(() => {
      const a = document.activeElement;
      return { tag: a ? a.tagName : null, text: a ? (a.textContent || '').trim().slice(0, 32) : null,
               isClear: a === window.__o48b.el('sec1') };
    })()`);
    note('focus after the click', JSON.stringify(focusAfter));
    const undoAfterClear = await canUndo(c);
    await ctrlZ(c);
    await sleep(400);
    const undone = await c.json(`window.__o48b.diff('preClear', ${SEC}, '${PLANE}')`);
    check('c8', 'ONE Ctrl+Z — pressed immediately after the click, from wherever the click left '
      + 'focus, as a person would — puts the whole plane back EXACTLY, unowned bits included',
      undone.changed === 0,
      `cells still differing from the pre-click snapshot = ${undone.changed}`
      + `${undone.changed ? ` first ${JSON.stringify(undone.first)}` : ''}. `
      + `activeElement when the Ctrl+Z was sent: ${JSON.stringify(focusAfter)} — since d-27 that is `
      + 'BODY rather than the Clear button, so the undo path this measures is the window listener '
      + 'reached from body, not the <button> exemption in isTypingTarget.');
    const restoredFixture = [];
    for (const i of FIXTURE) restoredFixture.push(await collAt(c, SEC, PLANE, i));
    check('c9', 'the undo restores the UNOWNED bits too, not just the shape fields',
      restoredFixture.every((w) => (w & M.unowned) === PROBE),
      `want unowned ${hex(PROBE)}; got ${restoredFixture.map((w) => hex(w & M.unowned)).join(' ')}`);
    const undoAfterUndo = await canUndo(c);
    check('c10', 'Clear pushed EXACTLY ONE command: canUndo went false→true on the click and '
      + 'true→false after a single undo',
      undoBefore === false && undoAfterClear === true && undoAfterUndo === false,
      `canUndo: before=${undoBefore} after-click=${undoAfterClear} after-one-undo=${undoAfterUndo}`);

    // ═══ [r] RESET TO ENGINE ══════════════════════════════════════════════
    console.log('\n=== [r] RESET — a real click on the real button ===');
    const baseA = await c.json(`window.__dbg.aeon.collisionBaseline(${SEC}, '${PLANE}')`);
    note('engine baseline', `section ${SEC} plane ${PLANE}: ${JSON.stringify(baseA)}`);
    await c.evalExpr(`window.__o48b.snap('preReset', ${SEC}, '${PLANE}')`);
    await c.evalExpr(`window.__o48b.snap('preResetB', ${SEC}, 'b')`);
    if (OTHER !== null) await c.evalExpr(`window.__o48b.snap('preResetOther', ${OTHER}, '${PLANE}')`);
    const undoBeforeReset = await canUndo(c);
    const toastsPreReset = (await c.json('window.__dbg.aeon.toasts()')).length;

    await clickHandle(c, RESET, 'Reset');

    const resetDiff = await c.json(`window.__o48b.diff('preReset', ${SEC}, '${PLANE}')`);
    const resetFixture = [];
    for (const i of FIXTURE) resetFixture.push(await collAt(c, SEC, PLANE, i));
    const afterReset = await c.json(`window.__o48b.stats(window.__o48b.read(${SEC}, '${PLANE}'), ${M.unowned}, ${M.owned})`);
    note('after Reset', `${resetDiff.changed} cells changed · ${afterReset.nonzero} non-zero · `
      + `${afterReset.carrying} still carrying unowned bits · fixture ${resetFixture.map(hex).join(' ')}`);

    check('r1', 'CONTROL: the click actually wrote — at least the authored cells changed, so every '
      + 'row below measures a write that happened',
      resetDiff.changed >= FIXTURE.length,
      `cells changed = ${resetDiff.changed} (fixture cells = ${FIXTURE.length}); `
      + `baseline present = ${baseA?.present} length = ${baseA?.length}`);
    check('r2', 'Reset discards the unowned bits — unavoidable, because the engine baseline is a '
      + 'per-cell BYTE with nothing to revert them to (aeon bake_plane_cell)',
      resetFixture.every((w) => (w & M.unowned) === 0),
      `authored ${hex(PROBE)}; after Reset the fixture cells hold `
      + `${resetFixture.map((w) => hex(w & M.unowned)).join(' ')}`);
    check('r3', 'NOT SILENT: the discard raises a toast naming how many cells lost them',
      (await c.json('window.__dbg.aeon.toasts()')).some(
        (t) => /reserved bits/i.test(t.message) && new RegExp(`\\b${FIXTURE.length}\\b`).test(t.message)),
      `toasts now: ${JSON.stringify(await c.json('window.__dbg.aeon.toasts()'))} `
      + `(was ${toastsPreReset} before the click; ${FIXTURE.length} cells carried unowned bits)`);
    const rbAfter = await c.json(`window.__o48b.diff('preResetB', ${SEC}, 'b')`);
    check('r4', 'SCOPE: the OTHER plane of the same section is untouched',
      rbAfter.changed === 0, `plane B cells changed = ${rbAfter.changed}`);
    if (OTHER !== null) {
      const roAfter = await c.json(`window.__o48b.diff('preResetOther', ${OTHER}, '${PLANE}')`);
      check('r5', `SCOPE: section ${OTHER} is untouched`,
        roAfter.changed === 0, `section ${OTHER} cells changed = ${roAfter.changed}`);
    } else {
      check('r5', 'SCOPE: a second section exists to check the section bound against',
        false, 'the act has one section — UNMEASURABLE here');
    }
    const resetNamed = /\bsection (\d+)\b/i.exec(resetTitle);
    check('r6', 'WORDING: the tooltip names the section that actually changed',
      resetNamed !== null && Number(resetNamed[1]) === SEC,
      `title "${resetTitle}" · named ${resetNamed ? resetNamed[1] : 'NOTHING'} · changed ${SEC}`);
    await shot(c, 'r-after-reset');

    // ── the SECOND consecutive press: `if (!entries.length) return` ───────
    //
    // The plane is now AT the baseline, so a second Reset has nothing to do and
    // takes CollisionPalette's silent early return. That return is the same one
    // a plane with no baseline at all takes, and from the author's chair the two
    // are the same event: a click that changes nothing and says nothing. What
    // is asserted here is the CORRECTNESS half — an edit that writes nothing
    // must not push a phantom step onto the undo stack, because the next Ctrl+Z
    // would then appear to do nothing. The SILENCE is measured in the detail and
    // left for a design call.
    const toastsPre2 = (await c.json('window.__dbg.aeon.toasts()')).length;
    await c.evalExpr(`window.__o48b.snap('preSecond', ${SEC}, '${PLANE}')`);
    await clickHandle(c, RESET, 'Reset (second consecutive press)');
    const second = await c.json(`window.__o48b.diff('preSecond', ${SEC}, '${PLANE}')`);
    const toastsPost2 = (await c.json('window.__dbg.aeon.toasts()')).length;
    check('r7', 'a second consecutive Reset — nothing left to do — writes nothing and pushes NO '
      + 'phantom undo step (an empty command would make the next Ctrl+Z look broken)',
      second.changed === 0,
      `cells changed by the second press = ${second.changed}; toasts ${toastsPre2}→${toastsPost2}. `
      + 'MEASURED AND LEFT FOR A DESIGN CALL: the press is completely silent — no toast, no disabled '
      + 'state, no change. `resetToEngine` returns early on `!entries.length` exactly as it does on '
      + '`!engine`, so "already at the baseline" and "there is nothing to reset to" look identical.');

    await ctrlZ(c);
    await sleep(400);
    const resetUndone = await c.json(`window.__o48b.diff('preReset', ${SEC}, '${PLANE}')`);
    const resetRestored = [];
    for (const i of FIXTURE) resetRestored.push(await collAt(c, SEC, PLANE, i));
    check('r8', 'ONE Ctrl+Z puts the plane back EXACTLY, unowned bits included — the toast\'s '
      + '"Undo restores them" is true',
      resetUndone.changed === 0 && resetRestored.every((w) => (w & M.unowned) === PROBE),
      `cells still differing = ${resetUndone.changed}; fixture unowned = `
      + `${resetRestored.map((w) => hex(w & M.unowned)).join(' ')}`);
    const undoAfterResetUndo = await canUndo(c);
    check('r9', 'Reset pushed EXACTLY ONE command across BOTH presses',
      undoBeforeReset === false && undoAfterResetUndo === false,
      `canUndo: before=${undoBeforeReset} after-one-undo=${undoAfterResetUndo}`);

    // ═══ [n] RESET WITH NO BASELINE — the silent early return ══════════════
    //
    // `resetToEngine` opens with `if (!engine) return;`. From outside the app,
    // "already at the baseline" and "there is no baseline" are the same event:
    // a click that changed nothing and said nothing. `collisionBaseline` is
    // what separates them, and this phase only runs when the app reports a
    // plane with no baseline to reset to.
    console.log('\n=== [n] Reset on a plane the act has NO engine baseline for ===');
    const baseB = await c.json(`window.__dbg.aeon.collisionBaseline(${SEC}, 'b')`);
    note('engine baseline', `section ${SEC} plane b: ${JSON.stringify(baseB)}`);
    if (baseB && baseB.present) {
      note('[n] not applicable', `section ${SEC} plane b HAS a baseline (${baseB.length} bytes) — `
        + 'the silent-early-return case does not arise here and is not asserted either way.');
    } else {
      // Arm plane B through the palette's REAL button, not a store poke: the
      // pick carries an overlay side effect and Reset reads the same field.
      await c.evalExpr(String.raw`(() => {
        const b = [...document.querySelectorAll('button')].filter((x) => {
          const s = (x.textContent || '').trim();
          return s === 'B' && /plane/i.test(x.parentElement.textContent || '');
        });
        window.__o48b.handles.planeB = b[0];
        return !!b[0];
      })()`);
      await clickHandle(c, 'planeB', 'Plane B');
      const planeNow = (await c.json('window.__dbg.aeon.armCollisionBrush({})')).plane;
      note('armed plane', planeNow);
      await seed(SEC, 'b', true);
      await c.evalExpr(`window.__o48b.snap('preNoBase', ${SEC}, 'b')`);
      const undoPre = await canUndo(c);
      const toastsPre = (await c.json('window.__dbg.aeon.toasts()')).length;
      await clickHandle(c, RESET, 'Reset (plane B, no baseline)');
      const nDiff = await c.json(`window.__o48b.diff('preNoBase', ${SEC}, 'b')`);
      const toastsPost = (await c.json('window.__dbg.aeon.toasts()')).length;
      const undoPost = await canUndo(c);
      note('after the click', `cells changed=${nDiff.changed} toasts ${toastsPre}→${toastsPost} `
        + `canUndo ${undoPre}→${undoPost}`);
      check('n1', 'Reset on a plane with NO engine baseline gives the author SOME signal — a change, '
        + 'a toast, or a visible refusal — rather than behaving identically to a no-op',
        nDiff.changed > 0 || toastsPost > toastsPre || undoPost !== undoPre,
        `plane b baseline present=${baseB?.present}. The click changed ${nDiff.changed} cells, raised `
        + `${toastsPost - toastsPre} toast(s) and moved canUndo ${undoPre}→${undoPost}. `
        + 'CollisionPalette.resetToEngine opens with `if (!engine) return;` — an author cannot tell '
        + '"already at the baseline" from "there is nothing to reset to".');
      // Put the plane pick back where the rest of the run expects it.
      await c.evalExpr(String.raw`(() => {
        const b = [...document.querySelectorAll('button')].filter((x) => {
          const s = (x.textContent || '').trim();
          return s === 'A' && /plane/i.test(x.parentElement.textContent || '');
        });
        window.__o48b.handles.planeA = b[0];
        return !!b[0];
      })()`);
      await clickHandle(c, 'planeA', 'Plane A');
    }

    // ═══ [k] CAN EITHER FIRE WITHOUT THE AUTHOR MEANING IT? ════════════════
    //
    // ⚠ THE FIRST VERSION OF [k1] WAS RED, AND THE INSTRUMENT WAS THE FAULT.
    // It focused `#map-canvas` and called that "focus is off the buttons". A
    // <canvas> carries no tabindex, so `.focus()` is a NO-OP: `activeElement`
    // stayed on the Reset button the previous phase had clicked, and the Enter
    // and Space in the key set re-fired RESET — 1794 cells, exactly [r1]'s
    // count. A stray global key path and a re-fire of the focused button are
    // two different findings, and that row could not tell them apart. So the
    // phase is now split, and each half PROVES where the focus is before it
    // sends anything.
    console.log('\n=== [k] unintended firing ===');
    await c.evalExpr(`window.__o48b.snap('preKeys', ${SEC}, '${PLANE}')`);
    const blurred = await c.json(String.raw`(() => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const a = document.activeElement;
      return { tag: a ? a.tagName : null, text: a ? (a.textContent || '').trim().slice(0, 24) : null,
               onAButton: a === window.__o48b.el('sec0') || a === window.__o48b.el('sec1') };
    })()`);
    note('focus for [k1]', JSON.stringify(blurred));
    if (blurred.onAButton) {
      throw new Error('could not move focus off the destructive buttons — [k1] would measure a re-fire '
        + 'rather than a global key path. Refusing to run it.');
    }
    const KEYS = [
      ['Delete', 'Delete', 46, 0], ['Backspace', 'Backspace', 8, 0],
      ['Enter', 'Enter', 13, 0], [' ', 'Space', 32, 0], ['Escape', 'Escape', 27, 0],
      ['x', 'KeyX', 88, 0], ['Delete', 'Delete', 46, 8], ['Delete', 'Delete', 46, 2],
    ];
    const culprits = [];
    for (const [k, code, vk, mod] of KEYS) {
      await key(c, k, code, vk, mod);
      await sleep(120);
      const d = await c.json(`window.__o48b.diff('preKeys', ${SEC}, '${PLANE}')`);
      if (d.changed > 0) {
        culprits.push(`${mod === 2 ? 'Ctrl+' : mod === 8 ? 'Alt+' : ''}${code} → ${d.changed} cells`);
        // Put it back before the next key, so one culprit cannot mask another.
        for (let i = 0; i < 3 && (await canUndo(c)); i++) { await ctrlZ(c); await sleep(250); }
        await c.evalExpr(`window.__o48b.snap('preKeys', ${SEC}, '${PLANE}')`);
      }
    }
    check('k1', 'with focus OFF the buttons (proved above), no bare or modified Delete/Backspace/'
      + 'Enter/Space/Escape/x reaches either wholesale writer — there is no stray global key path',
      culprits.length === 0,
      `${KEYS.length} keystrokes sent one at a time, each measured; keys that changed the plane: `
      + `${culprits.length ? culprits.join(' · ') : 'none'}. POSITIVE CONTROL for this green: the same `
      + 'Input.dispatchKeyEvent channel delivers the Ctrl+Z that [c8] and [r8] measure — if those are '
      + 'green, keystrokes are arriving and this is a real absence rather than a silent one. '
      + 'SCOPE (d-27): this is the GLOBAL key path only — focus is deliberately moved off the buttons '
      + 'first. The focused button\'s own activation is [k5]\'s subject, and a lost blur reddens that '
      + 'row, not this one.');

    // ═══ [k2] — PREMISE RETIRED (not tuned green), 2026-09-03, d-27 ════════
    //
    // WHAT [k2] MEASURED. The buttons were ordinary <button>s, so once clicked
    // one KEPT keyboard focus and the platform's own activate-on-Space applied
    // to a wholesale destructive writer that asks for no confirmation. [k2]
    // clicked Clear, took it back with Ctrl+Z, then sent bare Enter and bare
    // Space at the still-focused button and asserted the thing that decided how
    // bad it was: **the keyboard-fired wipe is exactly as recoverable as the
    // clicked one** — one Ctrl+Z, plane whole, `canUndo` back where it started.
    // Space re-fired it; Enter did not, over this input channel, and the two
    // were sent separately because "a keystroke re-fires it" without naming
    // which is how a finding gets waved away as unreproducible.
    //
    // WHY THE PREMISE IS GONE. The owner ruled d-27 `blur_after_press`
    // (empyrean 034ab6c): *"just being a button that acts and then drops focus
    // is how it should work right?"* `CollisionPalette.actAndDropFocus` blurs
    // the button unconditionally as it fires, so **there is no longer a
    // keyboard-fired wipe** for [k2] to measure the recoverability of. The row
    // is not merely inverted — its subject does not occur. Re-authoring it as
    // "the keyboard-fired wipe is undoable" would assert a property of an event
    // that cannot happen, which is green by construction and measures nothing;
    // that is the vacuity this file already paid for once at [c4]. So it is
    // RETIRED rather than re-pointed, and deliberately not deleted in silence.
    //
    // WHAT REPLACES IT. Five positive rows below, which assert the ruling
    // instead of the old behaviour: [k3]/[k4] the button does not keep focus,
    // [k5] a bare Space afterwards changes nothing on the plane, [k6] a second
    // real click still fires (without which [k3]-[k5] could all be satisfied by
    // simply breaking the buttons), and [k7] a press that changes NOTHING drops
    // focus too — the row that gates the UNCONDITIONAL half of the design.
    //
    // WHAT IS NOT LOST WITH IT. The undo property [k2] asserted still has an
    // owner: [c8]/[c9] prove one Ctrl+Z restores a CLICKED wipe exactly,
    // unowned bits included, and [c10]/[r9] pin the one-command-per-press half.
    // Nothing that only [k2] covered has gone unmeasured.

    console.log('\n=== [k3..k7] d-27 — the button acts and DROPS FOCUS ===');
    const planeStats = () =>
      c.json(`window.__o48b.stats(window.__o48b.read(${SEC}, '${PLANE}'), ${M.unowned}, ${M.owned})`);
    const focusNow = (handle) => c.json(String.raw`(() => {
      const a = document.activeElement;
      return { tag: a ? a.tagName : null, id: a ? (a.id || null) : null,
               text: a ? (a.textContent || '').trim().slice(0, 32) : null,
               isTheButton: a === window.__o48b.el(${JSON.stringify(handle)}) };
    })()`);

    // ── [k3] CLEAR gives up focus, and the click still wiped ──────────────
    //
    // The "still wiped" half is IN THE CONDITION on purpose. A `disabled`
    // button, or one React never wired, does not take focus on click either —
    // so a focus row alone is satisfied by a broken control, which is the
    // failure mode this whole file was written to refuse.
    await c.evalExpr(`window.__o48b.snap('preK3Click', ${SEC}, '${PLANE}')`);
    const preK3 = await planeStats();
    await clickHandle(c, CLEAR, 'Clear (d-27 focus)');
    const focusAfterClearBlur = await focusNow(CLEAR);
    const postK3 = await planeStats();
    note('after the Clear click', `activeElement = ${JSON.stringify(focusAfterClearBlur)} · `
      + `non-zero ${preK3.nonzero} → ${postK3.nonzero}`);
    check('k3', 'd-27: after a REAL CLICK, Clear does not keep keyboard focus — and the same click '
      + 'still performed the wipe',
      focusAfterClearBlur.isTheButton === false && preK3.nonzero > 0 && postK3.nonzero === 0,
      `document.activeElement is <${focusAfterClearBlur.tag}> "${focusAfterClearBlur.text}" `
      + `(isTheClearButton=${focusAfterClearBlur.isTheButton}); the click took the plane `
      + `${preK3.nonzero} → ${postK3.nonzero} non-zero cells. Before d-27 this read `
      + '<BUTTON> "Clear" isTheClearButton=true.');

    // ── [k5] and its VACUITY GUARD ───────────────────────────────────────
    //
    // The plane is all zeros right now, and `clearCollisionEntries` on an empty
    // plane returns no entries — so a Space that DID re-fire Clear would change
    // nothing and this row would pass having proved the opposite of what it
    // claims. The Ctrl+Z below is therefore not tidying: it is what gives the
    // key something to destroy, and `preSpace.nonzero > 0` is asserted IN THE
    // ROW so the guard cannot silently stop holding.
    //
    // That same Ctrl+Z is the POSITIVE CONTROL for the green: it travels the
    // identical `Input.dispatchKeyEvent` channel as the Space, so a restore of
    // >0 cells proves keystrokes are arriving and [k5] is a real absence rather
    // than a silent one.
    await ctrlZ(c);
    await sleep(400);
    const restoredByKey = await c.json(`window.__o48b.diff('preK3Click', ${SEC}, '${PLANE}')`);
    const preSpace = await planeStats();
    await c.evalExpr(`window.__o48b.snap('preSpace', ${SEC}, '${PLANE}')`);
    const focusBeforeSpace = await focusNow(CLEAR);
    note('before the keys', `plane restored by a Ctrl+Z over the SAME key channel `
      + `(${preSpace.nonzero} non-zero cells back; ${restoredByKey.changed} still differing from `
      + `pre-click) · activeElement = ${JSON.stringify(focusBeforeSpace)}`);
    const stillFired = [];
    for (const [k, code, vk] of [[' ', 'Space', 32], ['Enter', 'Enter', 13]]) {
      await key(c, k, code, vk);
      await sleep(400);
      const d = await c.json(`window.__o48b.diff('preSpace', ${SEC}, '${PLANE}')`);
      note(`  bare ${code} after the click`, `${d.changed} cells changed`);
      if (d.changed > 0) {
        stillFired.push(`${code} → ${d.changed} cells`);
        for (let i = 0; i < 3 && (await canUndo(c)); i++) { await ctrlZ(c); await sleep(300); }
        await c.evalExpr(`window.__o48b.snap('preSpace', ${SEC}, '${PLANE}')`);
      }
    }
    check('k5', 'd-27: a bare SPACE straight after the click reaches no wholesale writer — the plane '
      + 'is untouched (Enter sent too, and it never fired this even before the ruling)',
      preSpace.nonzero > 0 && stillFired.length === 0,
      `keys that changed the plane: ${stillFired.length ? stillFired.join(' · ') : 'none of Space, Enter'}. `
      + `VACUITY GUARD: the plane held ${preSpace.nonzero} non-zero cells when the keys were sent, so a `
      + 're-fire of Clear had ~1.8k cells to destroy and would be visible (an EMPTY plane would make '
      + 'this row pass on a Space that fired). POSITIVE CONTROL: the Ctrl+Z immediately before travelled '
      + `the same Input.dispatchKeyEvent channel and put ${preSpace.nonzero} cells back. Before d-27, `
      + 'Space here wiped the plane with no confirmation.');

    // ── [k6] the anti-cheat row: clicking again STILL WORKS ──────────────
    //
    // [k3]-[k5] are all satisfiable by a button that does nothing at all. This
    // is the row that stops that, and it is a SECOND real click through the
    // same integer-aimed helper, not a synthetic .click().
    await c.evalExpr(`window.__o48b.snap('preSecondClick', ${SEC}, '${PLANE}')`);
    const preK6 = await planeStats();
    await clickHandle(c, CLEAR, 'Clear (second real click)');
    const postK6 = await planeStats();
    const focusAfterSecond = await focusNow(CLEAR);
    check('k6', 'd-27 did not break the control: a SECOND real click on Clear fires the wipe again, '
      + 'and drops focus again',
      preK6.nonzero > 0 && postK6.nonzero === 0 && focusAfterSecond.isTheButton === false,
      `second click took the plane ${preK6.nonzero} → ${postK6.nonzero} non-zero cells; `
      + `activeElement after it = <${focusAfterSecond.tag}> "${focusAfterSecond.text}" `
      + `(isTheClearButton=${focusAfterSecond.isTheButton}). Without this row, blurring by simply `
      + 'removing the handler would pass [k3], [k5] and [k4].');
    for (let i = 0; i < 3 && (await canUndo(c)); i++) { await ctrlZ(c); await sleep(300); }

    // ── [k4] RESET gives up focus too ────────────────────────────────────
    //
    // Same shape as [k3], and it needs its own row rather than an assumption:
    // the two buttons are two separate JSX dispatch lines, and a fix applied to
    // one of two near-identical call sites is this repo's dominant way for a
    // defect to survive a convincing green.
    await c.evalExpr(`window.__o48b.snap('preResetBlur', ${SEC}, '${PLANE}')`);
    await clickHandle(c, RESET, 'Reset (d-27 focus)');
    const focusAfterResetBlur = await focusNow(RESET);
    const resetBlurDiff = await c.json(`window.__o48b.diff('preResetBlur', ${SEC}, '${PLANE}')`);
    note('after the Reset click', `activeElement = ${JSON.stringify(focusAfterResetBlur)} · `
      + `${resetBlurDiff.changed} cells changed`);
    check('k4', 'd-27: after a REAL CLICK, Reset does not keep keyboard focus either — and the same '
      + 'click still performed the reset',
      focusAfterResetBlur.isTheButton === false && resetBlurDiff.changed > 0,
      `document.activeElement is <${focusAfterResetBlur.tag}> "${focusAfterResetBlur.text}" `
      + `(isTheResetButton=${focusAfterResetBlur.isTheButton}); the click changed `
      + `${resetBlurDiff.changed} cells. Reset is a SEPARATE onClick from Clear's — a blur wired to `
      + 'only one of the two would pass [k3] and fail here.');

    // ── [k7] THE NO-OP PRESS, which is the half a cheaper fix would miss ──
    //
    // The plane is now AT the baseline, so this second consecutive Reset takes
    // `if (!entries.length) return` and writes nothing ([r7] proves that return
    // is real and pushes no phantom undo step). It is measured HERE because it
    // is the case d-27's implementation had a choice about: blurring inside the
    // handler AFTER the early returns would satisfy [k3] and [k4] and leave the
    // button focused on exactly the press an author is least likely to notice —
    // and a repeat Space is most pointless precisely when the last press did
    // nothing. `actAndDropFocus` blurs BEFORE the action for that reason, and
    // this row is what makes "unconditional" a measurement rather than a claim
    // in a comment.
    await c.evalExpr(`window.__o48b.snap('preNoopPress', ${SEC}, '${PLANE}')`);
    await clickHandle(c, RESET, 'Reset (no-op press — already at the baseline)');
    const focusAfterNoop = await focusNow(RESET);
    const noopDiff = await c.json(`window.__o48b.diff('preNoopPress', ${SEC}, '${PLANE}')`);
    check('k7', 'd-27 is UNCONDITIONAL: a press that changes NOTHING (second consecutive Reset, the '
      + '`!entries.length` early return) still drops focus',
      noopDiff.changed === 0 && focusAfterNoop.isTheButton === false,
      `the press changed ${noopDiff.changed} cells (0 = it really did take the early return, which is `
      + `what makes this the no-op path) and activeElement after it is <${focusAfterNoop.tag}> `
      + `"${focusAfterNoop.text}" (isTheResetButton=${focusAfterNoop.isTheButton}). An implementation `
      + 'that blurred only on the acting path passes [k3] and [k4] and fails HERE.');
    for (let i = 0; i < 3 && (await canUndo(c)); i++) { await ctrlZ(c); await sleep(300); }

    // ── restore the poked fixture cells ──────────────────────────────────
    console.log('\n=== restoring (nothing was ever written to disk) ===');
    for (let i = 0; i < 8 && (await canUndo(c)); i++) { await ctrlZ(c); await sleep(250); }
    for (const r of restore) await poke(c, r.sec, r.plane, r.index, r.word);
    const restored = [];
    for (const r of restore) restored.push((await collAt(c, r.sec, r.plane, r.index)) === r.word);
    check('z1', 'every poked fixture cell is back to the word this run found',
      restored.length > 0 && restored.every(Boolean),
      `${restored.filter(Boolean).length}/${restored.length} cells restored`);
    const finalVirgin = await c.json(`window.__o48b.diff('virgin', ${SEC}, '${PLANE}')`);
    check('z2', 'the section plane is back to the exact words this run opened on',
      finalVirgin.changed === 0,
      `cells differing from the opening snapshot = ${finalVirgin.changed}`
      + `${finalVirgin.changed ? ` first ${JSON.stringify(finalVirgin.first)}` : ''}`);
    note('disk', 'no save was issued; the app has no autosave (shell/close-guard.ts)');
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
    killGroup('SIGTERM');
    await sleep(500);
    killGroup('SIGKILL');
    for (let i = 0; i < 30 && !(await portFree()); i++) await sleep(500);
    if (!(await portFree())) console.log(`WARN       port ${PORT} still held after teardown`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} ════`);
  if (fails.length) {
    console.log('FAILING ROWS:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(2); });
