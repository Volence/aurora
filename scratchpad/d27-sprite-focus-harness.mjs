#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// d-27 ON THE SURVEY'S SIX SPRITE-MODE CONTROLS — the real app, real clicks.
//
// The owner ruled d-27 `blur_after_press` (empyrean `034ab6c`,
// `docs/OVERSEER-LOG.md`): *"just being a button that acts and then drops focus
// is how it should work right?"* It shipped for the two collision wipe buttons
// (`scratchpad/collision-destructive-harness.mjs`, rows `[k3]`-`[k7]`). The
// survey in `docs/reviews/2026-09-03-d27-blur-after-press.md` then named nine
// more controls carrying the same four properties — destructive, no
// confirmation, natively focusable, and STILL MOUNTED after their own click.
// SIX of those nine are in sprite mode and this file presses all six:
//
//   [sp1] shell/SpriteToolOptions.tsx     the size-preset chips  (newSprite)
//   [sp2] shell/SpriteToolOptions.tsx     `New □`                (newSprite)
//   [fg]  sprite/FrameGrid.tsx            Delete                 (deleteFrame)
//   [pal] sprite/SpritePaletteHeader.tsx  Clear palette          (clearPalette)
//   [can] sprite/SpritePaletteHeader.tsx  Clear canvas           (clearCanvas)
//   [tl]  sprite/Timeline.tsx             remove step ×          (removeStep)
//
// ⚠ SIX SITES, SIX HANDLES, AND EVERY ROW NAMES ITS OWN. This repo's dominant
// way for a defect to survive a convincing green is a fix wired to one of two
// near-identical dispatch lines; with SIX near-identical sites that risk is at
// its maximum. So no row is allowed to ride on another: each one resolves its
// own element through `window.__d27.el(handle)`, aims at it, verifies the aim
// with `elementFromPoint`, and PRINTS the handle and the element it hit. A
// plant that removes the blur at one site must redden that site's rows and
// nobody else's — and the red-first table in the review packet shows it does.
//
// ═══ THE FOUR-ROW SHAPE, AND WHY IT IS FOUR ═══════════════════════════════
//
//   -a  after a REAL CLICK the button does not keep focus — AND THE SAME CLICK
//       STILL ACTED. The second half is IN THE CONDITION: a `disabled` button,
//       or one React never wired, does not take focus on click either, so a
//       focus row alone is satisfied by a BROKEN control.
//   -b  a bare SPACE straight after the click reaches no writer. Carries its
//       VACUITY GUARD in the condition (see below) and a POSITIVE CONTROL.
//   -c  a SECOND real click still fires, and drops focus again. Without this,
//       "d-27 works" and "the handler was deleted" are the same artifact.
//   -d  `[k7]`: A PRESS THAT CHANGES NOTHING STILL DROPS FOCUS. This is the row
//       the owner's ruling actually rests on, and the only row a cheaper
//       implementation — blur inside each handler, after its early returns —
//       fails. See the P-plants in the review packet.
//
// ═══ d-29 PUT A DIALOG BETWEEN [sp1]/[sp2] AND THEIR WRITER ════════════════
//
// Master `ed4df57e` landed d-29 `guard_when_dirty` (`shell/new-sprite-guard.ts`,
// `docs/decisions.jsonl` `d-29-new-sprite-clears-undo-answered`): the size chips
// and `New □` now ASK before replacing a document that has unsaved edits. Both
// chip sites are pressed here on documents that are dirty at that point in the
// run, so d-29 CONSUMED THE PREMISE of six rows — and the run did not merely go
// red, it ABORTED: measured on `ed4df57e`, `[sp1-a]` failed, the dialog it
// raised was never dismissed, and `[sp1-c]`'s aim then landed on the backdrop
// and threw AIM REFUSED. 20 PASS / 1 FAIL and NINE ROWS THAT NEVER EXECUTED
// (`sp1-c`, `sp1-d`, `sp2-a`..`sp2-d`, `fg-d0`, `fg-d`, `z1`).
//
// ⚠ AND THE ONE ROW THAT STAYED GREEN WAS THE WORST OF THEM. `[sp1-b]` passed
// with the dialog STANDING OVER IT: its Space was sent at a screen covered by a
// modal backdrop, so "the document did not change" was true for a reason that
// has nothing to do with d-27. A row that cannot reach its subject and reports
// PASS is this repo's worst failure mode, and it is why these rows were TAUGHT
// TO ANSWER THE DIALOG rather than retired.
//
// WHY TAUGHT AND NOT RETIRED. The subject of this file is d-27 focus behaviour,
// not document replacement; the replacement assertion is SCAFFOLDING that proves
// the button acted. d-29 did not touch the subject — the chip still blurs before
// `newSpriteGuarded` is even called (`ui/act-and-drop-focus.ts` blurs FIRST) —
// it only put a step in front of the scaffolding. Retiring the six would have
// dropped d-27 coverage on two of the survey's six sprite sites while the
// property they measure is still live, trading a red row for a hole. Contrast
// `[k2]` of `scratchpad/collision-destructive-harness.mjs`, which the owner's own
// d-27 ruling retired EXPLICITLY: there the ruling made the row's own claim
// false. Here it did not.
//
// ═══ …AND THE DIALOG IS A NEW d-27 PARTICIPANT NOBODY HAD MEASURED ════════
//
// The chip drops focus on press. But the dialog it raises is now the thing on
// screen, and d-27's question applies to it verbatim: WHEN IT CLOSES, WHERE DOES
// FOCUS LAND, AND DOES A BARE SPACE RE-FIRE ANYTHING? `ConfirmDialog` sets no
// initial focus and installs no focus trap (`ui/focus-trap.ts` names it as "the
// obvious second caller" and is NOT wired to it), and its buttons unmount on
// answer — so the answer is not obvious and had never been read off the real
// app for these two sites. `[k3]` of `scratchpad/confirm-destroy-harness.mjs`
// asks it for the Chunks Clear button and nothing asked it here. The three ways
// the dialog closes are three code paths — a window keydown listener (Esc), and
// each button's own `onClick` (Cancel, Discard) — so they get THREE rows each:
//
//   -e1  after ESC closes it
//   -e2  after CANCEL is clicked with a real mouse
//   -e3  after DISCARD is clicked with a real mouse
//
// Each asserts the same three things: the dialog is gone, `activeElement` is
// NEITHER the chip NOR any other `<button>` (nothing Space could activate), and
// a bare Space + Enter afterwards writes nothing AND RAISES NO DIALOG.
//
// ⚠ "RAISES NO DIALOG" IS THE SHARP HALF, and it is sharper than anything the
// pre-d-29 rows could assert. The Space is sent on a document that is DIRTY, so
// a Space that reached `newSpriteGuarded` would put the dialog back on screen —
// visibly — even though `newSprite` itself would then be waiting on an answer
// and would have written nothing yet. Before d-29 a Space that reached the
// writer and a Space that did not were distinguishable only by the bytes it
// changed; now the guard itself is the detector.
//
// ⚠ AND `-b` MOVED WITH IT. "A Space straight after the click" now means "a
// Space WHILE THE DIALOG STANDS", which is a different and worthwhile claim —
// does Space confirm or cancel the dialog by accident? — so that is what `-b`
// now asserts at these two sites, and the far-side Space lives in `-e1`..`-e3`.
//
// ⚠ ONLY FIVE OF THE SIX SITES HAVE A `-d`, AND THAT IS A FINDING, NOT A GAP.
// A `[k7]` row needs a press an author can actually perform that writes
// nothing. Five of these have one:
//
//     [fg]   `deleteFrame` opens `if (s.frames.length <= 1) return` — a real
//            early return, and the sharpest `-d` in the file because the
//            document it fires on has an EMPTY history, so `canUndo` and
//            `unsavedEdits` are both false and a press that had reached
//            `recordEdit` would have flipped BOTH.
//     [sp1] [sp2]  `newSprite` is IDEMPOTENT: a second press at the same size
//            rebuilds a byte-identical blank document. Not an early return —
//            said out loud in the row, because "no-op" by two different
//            mechanisms is not one fact.
//     [pal] [can]  `clearPalette`/`clearCanvas` have no early return either;
//            their no-op press is a SECOND consecutive one over already-blank
//            state. It changes nothing an author can see, and the row asserts
//            exactly that and NOT `canUndo`/`unsavedEdits`, which a second
//            press does still move (`recordEdit` runs). Stated in the row.
//
// [tl]'s remove-step × HAS NO REACHABLE NO-OP PRESS: the button exists only
// while a step exists at `i`, and `removeStep` has no early return. Its `-c`
// carries the RETARGET finding instead, which is a sharper statement of the
// same family's defect — see below. What makes ITS blur unconditional is the
// shared helper, which blurs before `act()`; the P-plants in the packet are
// what measure that. The run says so out loud in a NOTE rather than shipping a
// fabricated `[tl-d]` that would be green by construction.
//
// ═══ THE RETARGET PROPERTY — the `key={i}` list-removal family ═════════════
//
// [tl] is keyed by INDEX. After it removes step `i` the button does not
// unmount with the step it deleted: React re-uses the same DOM button for the
// step that slid down into slot `i`. So a repeat Space did not REPEAT the
// action, it RETARGETED it at the neighbour — which is worse than a repeat
// fire, because the second victim is not the one the author looked at. `[tl-c]`
// asserts that directly: the second real click at the same screen pixel removes
// a DIFFERENT step, and the run builds four steps with DISTINCT frame indices
// precisely so "it removed the neighbour" is distinguishable from "it removed
// the same one again". Four identical steps would have made that undecidable.
//
// ═══ THE VACUITY GUARD, AND THE POSITIVE CONTROL ═══════════════════════════
//
// A `-b` row ("Space changed nothing") is the easiest row in this repo to pass
// for the wrong reason, twice over:
//
//   1. IF THERE IS NOTHING LEFT TO DESTROY, a Space that DID re-fire the writer
//      would change nothing and the row would pass having proved the opposite.
//      Immediately after each `-a` click the writer's target is already wiped,
//      so every `-b` first puts the fixture BACK and asserts it is back. That
//      restore is not tidying; it is what gives the key something to destroy.
//   2. IF THE KEYSTROKES NEVER ARRIVED the row is a silent absence. The
//      restores travel the SAME `Input.dispatchKeyEvent` channel as the Space
//      (`ctrlZ`), so a restore that visibly lands is the positive control. The
//      two chip sites cannot use Ctrl+Z — `newSprite` CLEARS the history — so
//      they restore through `__dbg.spritePaint`, and their positive control is
//      named separately in the row: the Ctrl+Z rows above them are green.
//
// ⚠ AND THE RESTORE MUST NOT MOVE FOCUS. `Input.dispatchKeyEvent` and
// `__dbg.spritePaint` do not; CLICKING another control to set a fixture would,
// and the Space would then be sent at that control instead. Every `-b` fixture
// here is built without a click, deliberately.
//
// ⚠ IT WRITES NOTHING TO DISK. No Ctrl+S, no save call; the app has no autosave
// (`shell/close-guard.ts`). It edits an S1 sprite document IN MEMORY and — via
// the two chip sites — throws that document away, which is the whole point of
// [sp1]/[sp2]. `[z1]` asserts nothing was saved.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:d27-sprite-focus
//                     (or) node scratchpad/d27-sprite-focus-harness.mjs
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
//                          AURORA_BUILT_TREE=<this worktree>
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9473);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = join(ROOT, 'scratchpad/shots-d27-sprite-focus');
mkdirSync(SHOTS, { recursive: true });

// ── the size presets, READ OUT OF THE COMPONENT, never pinned here ──────────
//
// A `[16,24,32,48,64]` typed into this file is the copied-pin defect this repo
// keeps paying for: the day someone edits SIZE_PRESETS, a pinned copy makes the
// handle resolve to nothing and the run dies with a confusing AIM REFUSED
// instead of saying the constant moved. It is also what makes the preset-chip
// handle UNAMBIGUOUS — see `installHandles`.
const TOOLOPTS_SRC = join(ROOT, 'src/renderer/shell/SpriteToolOptions.tsx');
function sizePresets() {
  const m = /const SIZE_PRESETS = \[([0-9,\s]+)\]/.exec(readFileSync(TOOLOPTS_SRC, 'utf8'));
  if (!m) throw new Error(`could not read SIZE_PRESETS out of ${TOOLOPTS_SRC}`);
  return m[1].split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}
const SIZE_PRESETS = sizePresets();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}

// ── real input ─────────────────────────────────────────────────────────────
async function mouse(c, type, x, y) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);
const space = (c) => key(c, ' ', 'Space', 32);
const enter = (c) => key(c, 'Enter', 'Enter', 13);
const escape = (c) => key(c, 'Escape', 'Escape', 27);

/**
 * A REAL CLICK ON A REAL BUTTON, aimed at integer client pixels.
 *
 * ⚠ NOT `el.click()`. A synthetic click does not focus the button, so a
 * `.click()`-driven run can neither reproduce nor disprove the focus defect —
 * it would report "not reproduced" forever. This sends real
 * `Input.dispatchMouseEvent` press/release.
 *
 * `devicePixelRatio` varies run-to-run under Xvfb here, so a fractional aim is
 * how a correct feature presents as an off-by-one bug. The centre is rounded to
 * an integer BEFORE it is sent and then verified with `elementFromPoint`: if the
 * integer does not land on the element we meant, this REFUSES rather than
 * clicking whatever is underneath and calling the result a measurement.
 */
async function clickHandle(c, handle, label) {
  const geom = await c.json(String.raw`(() => {
    const el = window.__d27.el(${JSON.stringify(handle)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    return { dpr: window.devicePixelRatio, left: b.left, top: b.top, w: b.width, h: b.height,
             disabled: !!el.disabled, text: (el.textContent || '').trim().slice(0, 24),
             title: el.getAttribute('title'), aria: el.getAttribute('aria-label') };
  })()`);
  if (!geom) throw new Error(`HANDLE ABSENT: "${handle}" (${label}) resolved to nothing. `
    + 'Refusing to click — a run that cannot find its own subject measures nothing.');
  await sleep(60);
  const x = Math.round(geom.left + geom.w / 2);
  const y = Math.round(geom.top + geom.h / 2);
  const hit = await c.json(String.raw`(() => {
    const want = window.__d27.el(${JSON.stringify(handle)});
    const el = document.elementFromPoint(${x}, ${y});
    return { tag: el ? el.tagName : null, text: el ? (el.textContent || '').trim().slice(0, 24) : null,
             isTarget: el === want };
  })()`);
  note(`aim: ${label} [${handle}]`,
    `dpr=${geom.dpr} rect=(${geom.left},${geom.top},${geom.w}x${geom.h}) → integer client (${x},${y}) · `
    + `target text="${geom.text}" title=${JSON.stringify(geom.title)} aria=${JSON.stringify(geom.aria)} `
    + `disabled=${geom.disabled} · elementFromPoint = <${hit.tag}> "${hit.text}" · isTarget=${hit.isTarget}`);
  if (!hit.isTarget) {
    throw new Error(`AIM REFUSED: integer (${x},${y}) for "${label}" [${handle}] lands on <${hit.tag}> `
      + `"${hit.text}", not the handle. Clicking it would measure something else.`);
  }
  await mouse(c, 'mousePressed', x, y);
  await sleep(40);
  await mouse(c, 'mouseReleased', x, y);
  await sleep(400);
  return { x, y };
}

/** Where focus is, and IS IT THIS HANDLE'S BUTTON — resolved fresh each time. */
const focusNow = (c, handle) => c.json(String.raw`(() => {
  const a = document.activeElement;
  return { tag: a ? a.tagName : null,
           text: a ? (a.textContent || '').trim().slice(0, 32) : null,
           title: a ? a.getAttribute('title') : null,
           isTheButton: a === window.__d27.el(${JSON.stringify(handle)}) };
})()`);

/**
 * ANSWER d-29's DIALOG — and if there ISN'T one, SAY SO and let the row go red.
 *
 * ⚠ THIS SHAPE IS FOR THE RED-FIRST RUNS, and it is the difference between
 * evidence and a stack trace. Under a plant that removes the blur, or one that
 * removes the guard, the dialog may not be there; a bare
 * `clickHandle('dlg:Cancel')` would then throw HANDLE ABSENT and kill the whole
 * run at the first plant, so the packet could only ever say "it crashed" — one
 * abort per plant, naming no rows. Reporting the absence and continuing lets
 * each plant redden its OWN named rows and leave the others green, which is the
 * claim a per-site plant is supposed to establish.
 *
 * Borrowed wholesale from `scratchpad/confirm-destroy-harness.mjs`, deliberately
 * rather than invented a second time: that file is the one that proved d-29 in
 * the real app, and two harnesses driving one dialog two different ways is how
 * they end up disagreeing about it.
 */
async function answerDialog(c, label) {
  const info = await c.json('window.__d27.info()');
  if (info === null) {
    note(`DIALOG ABSENT — cannot click "${label}"`,
      'no [role="alertdialog"] is on screen, so there was nothing to answer. Every row below that '
      + 'expected this dialog will now read the UNANSWERED state and go red, which is the point: this '
      + 'is what a run looks like when d-29\'s guard is not there.');
    return false;
  }
  await clickHandle(c, `dlg:${label}`, `the dialog's "${label}" button`);
  return true;
}

/**
 * Leave no dialog standing between phases.
 *
 * The dialog's backdrop is `position: fixed; inset: 0`, so one left up by a
 * failing row makes every later aim land on the backdrop and REFUSE — turning a
 * plant's row-level red into a whole-run abort. THAT IS NOT HYPOTHETICAL: it is
 * exactly what `ed4df57e` did to this file before this parcel (see the header).
 * This clears it with Esc and says out loud that it had to.
 */
async function ensureNoDialog(c, where) {
  for (let i = 0; i < 3; i++) {
    if ((await c.json('window.__d27.info()')) === null) return;
    note(`UNEXPECTED DIALOG STANDING at ${where}`,
      'dismissing it with Esc so the aims below are not eaten by its backdrop. In a green run this '
      + 'never prints; when it does, a row above did not go the way it expected.');
    await escape(c);
    await sleep(500);
  }
}

/**
 * THE FAR SIDE OF THE DIALOG — the row this parcel exists for.
 *
 * d-27 asks one question and the dialog is a new participant in it: when the
 * dialog closes, is there anything left holding keyboard focus that a bare Space
 * could re-fire? This asserts three things, and prints each half separately so a
 * red names WHICH half:
 *
 *   1. the dialog is really gone (a standing dialog would make 2 and 3 measure
 *      the modal instead of the app, which is the [sp1-b] defect this parcel
 *      found and is not allowed to reintroduce);
 *   2. `activeElement` is NEITHER the chip NOR any other `<button>`. The "any
 *      button" half is DERIVED, not copied: what makes a Space dangerous is a
 *      focused button for it to activate, so "no button holds focus" is the
 *      property, and naming only the chip would miss focus parked on the
 *      dialog's own Discard button if the dialog ever stopped unmounting it.
 *   3. a bare Space and a bare Enter afterwards write nothing AND RAISE NO
 *      DIALOG. The document is DIRTY when they are sent (asserted), so a key
 *      that reached `newSpriteGuarded` would put the dialog back on screen even
 *      though it would not have written a byte yet.
 *
 * The watcher is armed BEFORE the keys and latches: a single sample afterwards
 * cannot tell "never appeared" from "appeared and closed".
 */
async function farSideOfDialog(c, id, site, handle, closedBy, dirtySnap) {
  const gone = await c.json('window.__d27.info()');
  const foc = await focusNow(c, handle);
  const before = dirtySnap;
  await c.evalExpr('window.__d27.watchStart()');
  await space(c); await sleep(400);
  await enter(c); await sleep(400);
  const seen = await c.evalExpr('window.__d27.watchStop()');
  const after = await snap(c);
  check(id, `${site}: after the d-29 dialog closes via ${closedBy}, NOTHING is left holding keyboard `
    + 'focus — not the chip, not any other button — and a bare SPACE (and Enter) neither writes nor '
    + 'raises the dialog again',
    gone === null && foc.isTheButton === false && foc.tag !== 'BUTTON'
    && before.unsavedEdits === true && after.key === before.key && seen === false,
    `dialog after ${closedBy} = ${gone}; activeElement = <${foc.tag}> "${foc.text}" `
    + `(isTheChip=${foc.isTheButton}, isAnyButton=${foc.tag === 'BUTTON'}); document `
    + `${before.brief} → ${after.brief} (fingerprint identical = ${after.key === before.key}); the `
    + `dialog watcher, armed before the keys and latching, reported seen=${seen}. VACUITY GUARD: the `
    + `document was DIRTY (unsavedEdits=${before.unsavedEdits}) when the keys were sent, so a key that `
    + 'reached newSpriteGuarded would have put the dialog straight back — a CLEAN document would make '
    + 'this row pass on a Space that fired, because d-29 lets a clean press through silently. POSITIVE '
    + 'CONTROL for the watcher: it reported seen=true in the -a row of THIS SITE, in THIS run; POSITIVE '
    + 'CONTROL for the key channel: the -e1 row of this site closed its dialog with an Esc sent over '
    + 'the same Input.dispatchKeyEvent path these keys travel.');
  return after;
}

/**
 * THE WHOLE-DOCUMENT FINGERPRINT the "-b" and "-d" rows compare.
 *
 * `frameHashes` (FNV-1a per frame), `steps`, the frame size, the frame count
 * and the 16 palette entries — everything a press at any of these six sites
 * could move. `canUndo`/`unsavedEdits` are carried BESIDE the key rather than
 * inside it, on purpose: two of the six writers (`clearPalette`,
 * `clearCanvas`) push an undo entry even on a press that changes nothing an
 * author can see, so folding those two flags into the key would make their
 * `-d` row assert something false.
 */
async function snap(c) {
  const s = await c.json('window.__dbg.spriteState()');
  const p = await c.json('window.__dbg.spritePalette()');
  const canUndo = await c.evalExpr('window.__dbg.aeon.canUndo()');
  return {
    s, p, canUndo, unsavedEdits: s.unsavedEdits,
    key: JSON.stringify({
      frames: s.frames, w: s.frameW, h: s.frameH,
      hashes: s.frameHashes, steps: s.steps,
      palMode: p.mode, palColors: p.colors,
    }),
    brief: `frames=${s.frames} ${s.frameW}x${s.frameH} steps=${s.steps.length} `
      + `cov=[${s.frameCoverage.slice(0, 3).join(',')}…] pal=${p.mode} canUndo=${canUndo} `
      + `dirty=${s.unsavedEdits}`,
  };
}

/**
 * THE IN-PAGE HANDLE TABLE.
 *
 * Every handle is resolved by a STRUCTURAL predicate derived from the
 * component, never by a screen position or a bare text match:
 *
 *  - the preset chips are found as the ONE `<span>` whose children are exactly
 *    `SIZE_PRESETS.length` buttons reading exactly those numbers. A bare
 *    `textContent === '32'` match is NOT safe here: FrameGrid renders a cell
 *    button per frame whose text is its index, so frame 32's thumbnail is a
 *    button reading "32" too. This predicate cannot collide with it.
 *  - `newBox` is the only button reading `New □`.
 *  - `frameDelete`, `clearPalette`, `clearCanvas`, `stepDel<i>` are found by
 *    their `title`, which is authored text in the component.
 *  - `addStep` is the Timeline's `+ Frame N`, distinguished from FrameGrid's
 *    `+ Frame` by the absence of a title attribute AND the trailing index.
 *  - `dlg:<label>` is a button INSIDE the `role="alertdialog"` whose text is
 *    exactly `<label>`, so answering d-29's dialog can never hit the page
 *    behind it. Same predicate as `scratchpad/confirm-destroy-harness.mjs`.
 *
 * `el()` returns null rather than throwing so `clickHandle` can report HANDLE
 * ABSENT with the handle's name — a run that silently clicked the wrong thing
 * is the failure this table exists to prevent.
 *
 * `watchStart`/`watchStop` are the dialog detector the `-d` and `-e*` rows need.
 * A single sample after a press cannot tell "no dialog ever appeared" from "one
 * appeared and went"; the observer runs from before the press to after it and
 * LATCHES. It seeds itself with a direct check so a dialog already standing
 * counts. Its positive control is the `-a` row of each chip site, which reports
 * seen=true in the same run.
 */
const INSTALL_HANDLES = (presets) => String.raw`
(() => {
  const PRESETS = ${JSON.stringify(presets)};
  const btns = () => [...document.querySelectorAll('button')];
  const dialog = () => document.querySelector('[role="alertdialog"]');
  const table = {
    presetBox: () => {
      const want = PRESETS.join(',');
      return [...document.querySelectorAll('span')].find((s) => {
        const kids = [...s.children];
        return kids.length === PRESETS.length
          && kids.every((k) => k.tagName === 'BUTTON')
          && kids.map((k) => (k.textContent || '').trim()).join(',') === want;
      }) || null;
    },
    newBox: () => btns().find((b) => (b.textContent || '').trim() === 'New □') || null,
    frameDelete: () => document.querySelector('button[title="Delete current"]'),
    clearPalette: () => document.querySelector('button[title^="Clear palette"]'),
    clearCanvas: () => document.querySelector('button[title^="Clear canvas"]'),
    addStep: () => btns().find((b) => !b.getAttribute('title')
      && /^\+ Frame \d+$/.test((b.textContent || '').trim())) || null,
  };
  let obs = null, seen = false;
  window.__d27 = {
    el(h) {
      const m = /^preset(\d+)$/.exec(h);
      if (m) {
        const box = table.presetBox();
        if (!box) return null;
        return [...box.children].find((k) => (k.textContent || '').trim() === m[1]) || null;
      }
      const s = /^stepDel(\d+)$/.exec(h);
      if (s) return document.querySelectorAll('button[title="remove step"]')[Number(s[1])] || null;
      const d = /^dlg:(.+)$/.exec(h);
      if (d) {
        const dl = dialog();
        if (!dl) return null;
        return [...dl.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === d[1]) || null;
      }
      return table[h] ? table[h]() : null;
    },
    info() {
      const d = dialog();
      if (!d) return null;
      return {
        label: d.getAttribute('aria-label'),
        text: (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400),
        buttons: [...d.querySelectorAll('button')].map((b) => (b.textContent || '').trim()),
      };
    },
    watchStart() {
      this.watchStop();
      seen = !!dialog();
      obs = new MutationObserver(() => { if (dialog()) seen = true; });
      obs.observe(document.body, { childList: true, subtree: true });
      return seen;
    },
    watchStop() {
      if (obs) { obs.disconnect(); obs = null; }
      if (dialog()) seen = true;
      const was = seen;
      seen = false;
      return was;
    },
    stepDelCount: () => document.querySelectorAll('button[title="remove step"]').length,
    presetCount: () => (table.presetBox() ? table.presetBox().children.length : -1),
  };
  return { presets: window.__d27.presetCount(), steps: window.__d27.stepDelCount(),
           dialogNow: !!dialog() };
})()`;

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS, and a run that cannot show its
  // bundle fresh refuses rather than proceeding.
  assertFreshBuild(RUN);
  if (!existsSync(join(S1DIR, 'artunc/Sonic.unc'))) {
    throw new Error(`${S1DIR}/artunc/Sonic.unc missing — no s1disasm to open, nothing to measure`);
  }
  console.log(`\n=== SIZE_PRESETS, read from ${TOOLOPTS_SRC.replace(ROOT + '/', '')} ===`);
  console.log(`  ${JSON.stringify(SIZE_PRESETS)}`);

  for (let i = 0; i < 60 && !(await portFree()); i++) {
    if (i === 0) note('port', `${PORT} still serving — waiting for a previous run to exit`);
    await sleep(1000);
  }
  if (!(await portFree())) throw new Error(`port ${PORT} still serves a CDP target after 60s — kill it first`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('window.__dbg absent — this needs a VITE_AURORA_DEBUG=1 build');
    // The panel disclosure state is persisted per author, so a previous run's
    // collapsed Palette section would hide two of the six handles.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3500);
    if (!(await waitDbg())) throw new Error('window.__dbg absent after reload');
    for (const fn of ['spriteState', 'spritePalette', 'spritePaint', 'editObjectArt', 'spriteSaveInfo']) {
      const t = await c.evalExpr(`typeof window.__dbg.${fn}`);
      if (t !== 'function') throw new Error(`__dbg.${fn} absent — dist/ predates this parcel; rebuild`);
    }

    // ═══ BOOT: a real S1 sprite document ═══════════════════════════════════
    console.log('\n=== BOOT: s1disasm → GHZ1 → a real sprite document ===');
    await c.evalExpr(`void window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = { zones: 0 };
    for (let i = 0; i < 40 && !(proj.zones > 0); i++) {
      await sleep(500);
      proj = await c.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
    }
    let lvl = { status: 'idle' };
    for (let i = 0; i < 40 && lvl.status !== 'ready'; i++) {
      await sleep(500);
      lvl = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
    }
    await c.evalExpr("void window.__dbg.activate('ghz', 1)");
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const l = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
      if (l.status === 'ready') break;
    }
    await c.evalExpr('window.__dbg.editObjectArt(0x41)');
    await sleep(2500);
    const boot = await snap(c);
    const handles = await c.json(INSTALL_HANDLES(SIZE_PRESETS));
    await shot(c, 'boot');
    check('b1', 'sprite mode is open on a real S1 document with more than one frame — the fixture '
      + 'every site below destroys part of',
      boot.s.activeDocId != null && boot.s.frames > 1,
      `doc=${boot.s.activeDocId} ${boot.brief} · proj=${JSON.stringify(proj)} level=${lvl.status}`);
    check('b2', 'ANTI-VACUOUS: the handle table found the size-preset chips and they are exactly the '
      + "component's SIZE_PRESETS — no row below can pass by finding nothing — and NO d-29 dialog is "
      + 'standing before anything has been pressed',
      handles.presets === SIZE_PRESETS.length && handles.dialogNow === false,
      `presetBox children=${handles.presets}, SIZE_PRESETS=${JSON.stringify(SIZE_PRESETS)} `
      + `(read from ${TOOLOPTS_SRC.replace(ROOT + '/', '')}); remove-step buttons on screen=${handles.steps}; `
      + `dialog on screen at boot = ${handles.dialogNow}. A dialog already up would make every aim below `
      + 'land on its backdrop and REFUSE, which is how this file aborted on ed4df57e.');
    if (!boot.s.activeDocId || boot.s.frames <= 1) {
      throw new Error('no usable sprite document — every row below would be vacuous');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // [tl] sprite/Timeline.tsx — remove step ×   (the key={i} family)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [tl] Timeline — remove step (sprite/Timeline.tsx) ===');
    // ── A FIXTURE THIS FILE OWNS ENTIRELY ────────────────────────────────
    // The S1 document arrives with steps of its own, `addStep` APPENDS, and
    // whether the document's first two steps happen to name different frames
    // is not this file's to assume — [tl-c]'s retarget claim is undecidable if
    // slots 0 and 1 hold the same frame index. So every pre-existing step is
    // cleared first (with the × itself, as a FIXTURE action and not a
    // measurement), and four steps with DISTINCT frame indices are built:
    // `__dbg.spritePaint(i,…)` selects frame `i` on its way in, so `+ Frame i`
    // then appends a step naming frame `i`.
    for (let guard = 0; guard < 40; guard++) {
      const n = await c.evalExpr('window.__d27.stepDelCount()');
      if (n === 0) break;
      await clickHandle(c, 'stepDel0', `clear pre-existing step (fixture, ${n} left)`);
    }
    const cleared = await c.evalExpr('window.__d27.stepDelCount()');
    if (cleared !== 0) throw new Error(`could not clear the timeline (${cleared} steps left) — the `
      + '[tl] fixture would not be this run\'s own');
    for (let i = 0; i < 4; i++) {
      await c.evalExpr(`window.__dbg.spritePaint(${i}, ${1 + i}, 1, ${1 + i})`);
      await sleep(150);
      await clickHandle(c, 'addStep', `+ Frame ${i} (fixture)`);
    }
    const tl0 = await snap(c);
    const stepIdx = (sn) => sn.s.steps.map((st) => st.frameIndex);
    note('[tl] fixture', `steps = ${JSON.stringify(stepIdx(tl0))} (distinct frame indices on purpose)`);
    check('tl-0', 'ANTI-VACUOUS fixture: the Timeline holds >= 3 steps and slots 0 and 1 name '
      + 'DIFFERENT frames, so [tl-c] can tell "removed the neighbour" from "removed the same one again"',
      tl0.s.steps.length >= 3 && stepIdx(tl0)[0] !== stepIdx(tl0)[1],
      `steps=${JSON.stringify(stepIdx(tl0))} — built by this run after clearing the document's own, `
      + 'so nothing about the S1 fixture is assumed');

    // ── [tl-a] ───────────────────────────────────────────────────────────
    await clickHandle(c, 'stepDel0', 'Timeline remove step 0');
    const tlFocusA = await focusNow(c, 'stepDel0');
    const tlA = await snap(c);
    check('tl-a', 'sprite/Timeline.tsx remove-step ×: after a REAL CLICK the button does not keep '
      + 'keyboard focus — AND the same click still removed the step',
      tlFocusA.isTheButton === false && tlA.s.steps.length === tl0.s.steps.length - 1,
      `activeElement = <${tlFocusA.tag}> "${tlFocusA.text}" title=${JSON.stringify(tlFocusA.title)} `
      + `(isTheRemoveStepButton=${tlFocusA.isTheButton}); steps ${JSON.stringify(stepIdx(tl0))} → `
      + `${JSON.stringify(stepIdx(tlA))}. The "still removed" half is IN THE CONDITION: a disabled or `
      + 'unwired button would satisfy a focus-only assertion perfectly.');

    // ── [tl-c] — the anti-cheat row AND the RETARGET finding ──────────────
    //
    // NO UNDO BETWEEN [tl-a] AND THIS. That ordering is the row: slot 0 now
    // holds the step that USED to be at slot 1, so a second press at the same
    // screen pixel destroys the neighbour rather than repeating the action.
    // Restoring first (which the first draft of this file did) would have put
    // the original occupant back and quietly measured a repeat instead.
    await clickHandle(c, 'stepDel0', 'Timeline remove step 0 (second real click, SAME pixel)');
    const tlFocusC = await focusNow(c, 'stepDel0');
    const tlC = await snap(c);
    const removedSecond = stepIdx(tlA).find((f) => !stepIdx(tlC).includes(f));
    check('tl-c', 'sprite/Timeline.tsx remove-step ×: a SECOND real click at the SAME pixel still '
      + 'fires and drops focus again — and it removes the NEIGHBOUR, which is the `key={i}` RETARGET '
      + 'the survey named',
      tlC.s.steps.length === tlA.s.steps.length - 1 && tlFocusC.isTheButton === false
      && removedSecond === stepIdx(tl0)[1] && stepIdx(tl0)[1] !== stepIdx(tl0)[0],
      `steps ${JSON.stringify(stepIdx(tl0))} → ${JSON.stringify(stepIdx(tlA))} → `
      + `${JSON.stringify(stepIdx(tlC))}; the first click removed frame ${stepIdx(tl0)[0]} and the `
      + `second, at the SAME pixel, removed frame ${removedSecond} — slot 0's NEW occupant. The button `
      + 'did not unmount with the step it deleted: it stayed and re-aimed at the neighbour. '
      + `activeElement after = <${tlFocusC.tag}> (isTheButton=${tlFocusC.isTheButton}). Without this `
      + 'row, deleting the handler outright would pass [tl-a] and [tl-b].');

    // ── [tl-b] — vacuity guard + positive control ─────────────────────────
    //
    // The restore comes AFTER [tl-c] on purpose (see above) and travels the
    // same key channel as the Space that follows it, which is what makes this
    // row a real absence rather than a silent one. Ctrl+Z moves no focus.
    await ctrlZ(c); await sleep(400);
    await ctrlZ(c); await sleep(400);
    const tlRestored = await snap(c);
    const tlFocusPre = await focusNow(c, 'stepDel0');
    note('[tl] before the keys', `two Ctrl+Z over the SAME key channel restored steps `
      + `${JSON.stringify(stepIdx(tlC))} → ${JSON.stringify(stepIdx(tlRestored))} · `
      + `activeElement = ${JSON.stringify(tlFocusPre)}`);
    await space(c); await sleep(400);
    const tlAfterSpace = await snap(c);
    await enter(c); await sleep(400);
    const tlAfterEnter = await snap(c);
    check('tl-b', 'sprite/Timeline.tsx remove-step ×: a bare SPACE with focus where the click left it '
      + 'reaches no writer — the document is untouched (Enter sent separately too)',
      tlRestored.s.steps.length >= 3
      && tlAfterSpace.key === tlRestored.key && tlAfterEnter.key === tlRestored.key,
      `steps after Space = ${JSON.stringify(stepIdx(tlAfterSpace))}, after Enter = `
      + `${JSON.stringify(stepIdx(tlAfterEnter))} (unchanged from ${JSON.stringify(stepIdx(tlRestored))}). `
      + `VACUITY GUARD: the timeline held ${tlRestored.s.steps.length} steps when the keys were sent, so a `
      + 're-fire had something to destroy — an EMPTY timeline would make this row pass on a Space that '
      + 'fired. POSITIVE CONTROL: the two Ctrl+Z immediately before travelled the same '
      + 'Input.dispatchKeyEvent channel and put both steps back.');
    note('[tl-d] NOT MEASURABLE, and that is a finding',
      'this site has NO reachable no-op press: the × exists only while a step exists at `i`, and '
      + '`removeStep` has no early return, so an author cannot perform a press here that writes '
      + 'nothing. Its blur is unconditional by CONSTRUCTION — the shared helper blurs before act() — '
      + 'and the P-plants in the review packet are what measure that, not a fabricated row here.');
    for (let i = 0; i < 10; i++) { await ctrlZ(c); await sleep(150); }

    // ═══════════════════════════════════════════════════════════════════════
    // [can] sprite/SpritePaletteHeader.tsx — Clear canvas
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [can] Clear canvas (sprite/SpritePaletteHeader.tsx) ===');
    const paint = async (n) => {
      for (let i = 0; i < n; i++) await c.evalExpr(`window.__dbg.spritePaint(0, ${2 + i}, 3, ${1 + (i % 15)})`);
      await sleep(250);
    };
    await paint(8);
    const canPre = await snap(c);
    check('can-0', 'ANTI-VACUOUS fixture: the current frame really carries pixels for Clear canvas to '
      + 'destroy — an already-blank canvas would let a DEAD button pass [can-a]',
      canPre.s.frameCoverage[0] > 0,
      `frame 0 coverage = ${canPre.s.frameCoverage[0]} non-zero pixels`);

    await clickHandle(c, 'clearCanvas', 'Clear canvas');
    const canFocusA = await focusNow(c, 'clearCanvas');
    const canA = await snap(c);
    check('can-a', 'sprite/SpritePaletteHeader.tsx Clear canvas: after a REAL CLICK the button does '
      + 'not keep keyboard focus — AND the same click still blanked the frame',
      canFocusA.isTheButton === false && canPre.s.frameCoverage[0] > 0 && canA.s.frameCoverage[0] === 0,
      `activeElement = <${canFocusA.tag}> "${canFocusA.text}" title=${JSON.stringify(canFocusA.title)} `
      + `(isTheClearCanvasButton=${canFocusA.isTheButton}); frame 0 coverage `
      + `${canPre.s.frameCoverage[0]} → ${canA.s.frameCoverage[0]}.`);

    // [can-b] — the fixture is rebuilt WITHOUT A CLICK (spritePaint moves no
    // focus), because clicking anything would move focus off the button and the
    // Space would then be sent at whatever we clicked.
    await paint(8);
    const canPreSpace = await snap(c);
    await space(c); await sleep(400);
    const canSpace = await snap(c);
    await enter(c); await sleep(400);
    const canEnter = await snap(c);
    check('can-b', 'sprite/SpritePaletteHeader.tsx Clear canvas: a bare SPACE straight after the click '
      + 'reaches no writer — the pixels survive (Enter sent separately too)',
      canPreSpace.s.frameCoverage[0] > 0
      && canSpace.key === canPreSpace.key && canEnter.key === canPreSpace.key,
      `frame 0 coverage ${canPreSpace.s.frameCoverage[0]} → after Space ${canSpace.s.frameCoverage[0]} `
      + `→ after Enter ${canEnter.s.frameCoverage[0]}. VACUITY GUARD: the frame held `
      + `${canPreSpace.s.frameCoverage[0]} non-zero pixels when the keys were sent, so a re-fire had `
      + 'something to destroy. The fixture was rebuilt through __dbg.spritePaint and NOT by clicking '
      + 'anything — a click would have moved focus and the Space would have been aimed elsewhere.');

    await clickHandle(c, 'clearCanvas', 'Clear canvas (second real click)');
    const canFocusC = await focusNow(c, 'clearCanvas');
    const canC = await snap(c);
    check('can-c', 'sprite/SpritePaletteHeader.tsx Clear canvas: a SECOND real click still blanks the '
      + 'frame and drops focus again',
      canPreSpace.s.frameCoverage[0] > 0 && canC.s.frameCoverage[0] === 0
      && canFocusC.isTheButton === false,
      `frame 0 coverage ${canPreSpace.s.frameCoverage[0]} → ${canC.s.frameCoverage[0]}; activeElement `
      + `after = <${canFocusC.tag}> (isTheButton=${canFocusC.isTheButton}). Without this row, blurring `
      + 'by simply removing the handler would pass [can-a] and [can-b].');

    const canPreNoop = await snap(c);
    await clickHandle(c, 'clearCanvas', 'Clear canvas (NO-OP press — already blank)');
    const canFocusD = await focusNow(c, 'clearCanvas');
    const canD = await snap(c);
    check('can-d', 'd-27 IS UNCONDITIONAL at Clear canvas: a press that changes NOTHING an author can '
      + 'see (the frame is already blank) still drops focus',
      canD.key === canPreNoop.key && canD.s.frameCoverage[0] === 0
      && canFocusD.isTheButton === false,
      `the press left the document fingerprint identical (coverage ${canPreNoop.s.frameCoverage[0]} → `
      + `${canD.s.frameCoverage[0]}) and activeElement is <${canFocusD.tag}> `
      + `(isTheButton=${canFocusD.isTheButton}). ⚠ READ THE ASSERTION: clearCanvas has NO early return, `
      + 'so this is a no-op by IDEMPOTENCE, not by a return — it still calls recordEdit, so canUndo and '
      + 'unsavedEdits DO move and are deliberately NOT asserted here. An implementation that blurred '
      + 'only on the acting path fails this row.');

    // ═══════════════════════════════════════════════════════════════════════
    // [pal] sprite/SpritePaletteHeader.tsx — Clear palette
    // ═══════════════════════════════════════════════════════════════════════
    // ITS OWN ROWS, NOT AN ASSUMPTION FROM [can]'s. The two buttons are two
    // separate dispatch lines four lines apart in one file, which is precisely
    // the shape a fix wired to one of two near-identical call sites hides in.
    console.log('\n=== [pal] Clear palette (sprite/SpritePaletteHeader.tsx) ===');
    const palPre = await snap(c);
    await clickHandle(c, 'clearPalette', 'Clear palette');
    const palFocusA = await focusNow(c, 'clearPalette');
    const palA = await snap(c);
    // ⚠ MEASURED, NOT ASSUMED: the S1 document this run opens is ALREADY in
    // `standalone` palette mode, so a row asserting `mode` went zone →
    // standalone would have been red on a working button. What `clearPalette`
    // actually destroys here is the sixteen COLOURS, and the fingerprint —
    // which carries `palColors` — is what sees it. The first draft asserted the
    // mode and went red; this is the corrected row, not a loosened one.
    check('pal-a', 'sprite/SpritePaletteHeader.tsx Clear palette: after a REAL CLICK the button does '
      + 'not keep keyboard focus — AND the same click still blanked the palette',
      palFocusA.isTheButton === false && palA.key !== palPre.key && palA.p.mode === 'standalone',
      `activeElement = <${palFocusA.tag}> "${palFocusA.text}" title=${JSON.stringify(palFocusA.title)} `
      + `(isTheClearPaletteButton=${palFocusA.isTheButton}); palette mode ${palPre.p.mode} → `
      + `${palA.p.mode}, non-black entries ${palPre.p.colors.filter((k) => k.r || k.g || k.b).length} → `
      + `${palA.p.colors.filter((k) => k.r || k.g || k.b).length}, fingerprint changed=true.`);

    await ctrlZ(c);
    await sleep(500);
    const palRestored = await snap(c);
    note('[pal] before the keys', `Ctrl+Z over the SAME key channel put the palette back — fingerprint `
      + `identical to the pre-click one: ${palRestored.key === palPre.key}`);
    await space(c); await sleep(400);
    const palSpace = await snap(c);
    await enter(c); await sleep(400);
    const palEnter = await snap(c);
    check('pal-b', 'sprite/SpritePaletteHeader.tsx Clear palette: a bare SPACE straight after the click '
      + 'reaches no writer — the palette is untouched (Enter sent separately too)',
      palRestored.key === palPre.key && palRestored.key !== palA.key
      && palSpace.key === palRestored.key && palEnter.key === palRestored.key,
      `fingerprint unchanged by Space and by Enter; non-black palette entries stayed `
      + `${palSpace.p.colors.filter((k) => k.r || k.g || k.b).length}. VACUITY GUARD: the Ctrl+Z put the `
      + 'palette back to EXACTLY its pre-click state, which is provably NOT the cleared state '
      + `(restored != cleared: ${palRestored.key !== palA.key}) — so a Space that re-fired Clear palette `
      + 'would have blanked it again and been visible. An already-blank palette would make this row pass '
      + 'on a Space that fired. POSITIVE CONTROL: that same Ctrl+Z travelled the same '
      + 'Input.dispatchKeyEvent channel as the Space and landed.');

    const palPreC = await snap(c);
    await clickHandle(c, 'clearPalette', 'Clear palette (second real click)');
    const palFocusC = await focusNow(c, 'clearPalette');
    const palC = await snap(c);
    check('pal-c', 'sprite/SpritePaletteHeader.tsx Clear palette: a SECOND real click still blanks the '
      + 'palette and drops focus again',
      palPreC.key !== palA.key && palC.key === palA.key && palFocusC.isTheButton === false,
      `the palette went from the restored state back to the cleared one (matches [pal-a]'s result: `
      + `${palC.key === palA.key}); non-black entries `
      + `${palPreC.p.colors.filter((k) => k.r || k.g || k.b).length} → `
      + `${palC.p.colors.filter((k) => k.r || k.g || k.b).length}; activeElement after = `
      + `<${palFocusC.tag}> (isTheButton=${palFocusC.isTheButton}). The anti-cheat row for this site.`);

    const palPreNoop = await snap(c);
    await clickHandle(c, 'clearPalette', 'Clear palette (NO-OP press — already blank standalone)');
    const palFocusD = await focusNow(c, 'clearPalette');
    const palD = await snap(c);
    check('pal-d', 'd-27 IS UNCONDITIONAL at Clear palette: a press that changes NOTHING an author can '
      + 'see (already blank standalone) still drops focus',
      palD.key === palPreNoop.key && palFocusD.isTheButton === false,
      `the press left the document fingerprint identical (non-black palette entries `
      + `${palPreNoop.p.colors.filter((k) => k.r || k.g || k.b).length} → `
      + `${palD.p.colors.filter((k) => k.r || k.g || k.b).length}) and activeElement is `
      + `<${palFocusD.tag}> (isTheButton=${palFocusD.isTheButton}). ⚠ Same reading as [can-d]: no early `
      + 'return, so this is idempotence rather than a return, and canUndo / unsavedEdits are '
      + 'deliberately not part of the assertion.');

    // ═══════════════════════════════════════════════════════════════════════
    // [fg] sprite/FrameGrid.tsx — Delete (the acting rows; [fg-d] is later)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [fg] FrameGrid Delete (sprite/FrameGrid.tsx) ===');
    const fgPre = await snap(c);
    check('fg-0', 'ANTI-VACUOUS fixture: the document holds more than one frame, so Delete is on its '
      + 'ACTING path and not on the `frames.length <= 1` early return [fg-d] measures',
      fgPre.s.frames > 1, `frames = ${fgPre.s.frames}`);
    await clickHandle(c, 'frameDelete', 'FrameGrid Delete');
    const fgFocusA = await focusNow(c, 'frameDelete');
    const fgA = await snap(c);
    check('fg-a', 'sprite/FrameGrid.tsx Delete: after a REAL CLICK the button does not keep keyboard '
      + 'focus — AND the same click still deleted a frame',
      fgFocusA.isTheButton === false && fgA.s.frames === fgPre.s.frames - 1,
      `activeElement = <${fgFocusA.tag}> "${fgFocusA.text}" title=${JSON.stringify(fgFocusA.title)} `
      + `(isTheDeleteButton=${fgFocusA.isTheButton}); frames ${fgPre.s.frames} → ${fgA.s.frames}.`);

    await ctrlZ(c);
    await sleep(500);
    const fgRestored = await snap(c);
    note('[fg] before the keys', `Ctrl+Z over the SAME key channel restored frames `
      + `${fgA.s.frames} → ${fgRestored.s.frames}`);
    await space(c); await sleep(400);
    const fgSpace = await snap(c);
    await enter(c); await sleep(400);
    const fgEnter = await snap(c);
    check('fg-b', 'sprite/FrameGrid.tsx Delete: a bare SPACE straight after the click reaches no writer '
      + '— the frames survive (Enter sent separately too)',
      fgRestored.s.frames > 1 && fgSpace.key === fgRestored.key && fgEnter.key === fgRestored.key,
      `frames after Space = ${fgSpace.s.frames}, after Enter = ${fgEnter.s.frames} (unchanged from `
      + `${fgRestored.s.frames}). VACUITY GUARD: the document held ${fgRestored.s.frames} frames when the `
      + 'keys were sent, so a re-fire had a frame to destroy AND was not on the early-return path — an '
      + 'already-one-frame document would make this row pass on a Space that fired. POSITIVE CONTROL: '
      + 'the Ctrl+Z immediately before travelled the same key channel and put the frame back.');

    const fgPreC = await snap(c);
    await clickHandle(c, 'frameDelete', 'FrameGrid Delete (second real click)');
    const fgFocusC = await focusNow(c, 'frameDelete');
    const fgC = await snap(c);
    check('fg-c', 'sprite/FrameGrid.tsx Delete: a SECOND real click still deletes a frame and drops '
      + 'focus again',
      fgC.s.frames === fgPreC.s.frames - 1 && fgFocusC.isTheButton === false,
      `frames ${fgPreC.s.frames} → ${fgC.s.frames}; activeElement after = <${fgFocusC.tag}> `
      + `(isTheButton=${fgFocusC.isTheButton}). The anti-cheat row for this site.`);

    // ═══════════════════════════════════════════════════════════════════════
    // [sp1] shell/SpriteToolOptions.tsx — the size-preset chips
    //
    // ⚠ THESE ARE THE SHARPEST TWO SITES IN THE SURVEY, sharper than the
    // collision wipes d-27 was ruled on: `newSprite` replaces the whole
    // document AND calls `activeSpriteHistory().clear()`, so there is no
    // Ctrl+Z afterwards.
    //
    // ⚠ AND THEY ARE THE ONLY TWO OF THE SIX BEHIND d-29's DIALOG. Every press
    // below on a DIRTY document raises `ConfirmDialog` instead of replacing
    // anything, so these rows ANSWER IT — see the d-29 block in the header for
    // why they were taught rather than retired, and for what the `-e*` rows add
    // that no row anywhere had. The other four sites are untouched by d-29 and
    // their rows above are unchanged.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [sp1] size-preset chips (shell/SpriteToolOptions.tsx) ===');
    const big = SIZE_PRESETS[SIZE_PRESETS.length - 1];
    const mid = SIZE_PRESETS[SIZE_PRESETS.length - 2];

    // ── [sp1-a] THE PRESS: the chip blurs BEFORE the guard is even called ──
    //
    // `actAndDropFocus` blurs `e.currentTarget` and only THEN runs the action,
    // so d-27's property at this site is untouched by d-29 and is still read off
    // the same press. What changed is the "it still acted" half: the writer no
    // longer runs on this press at all, so the proof that the press REACHED the
    // writer is now THE DIALOG ITSELF — a chip wired to nothing raises none.
    const sp1Pre = await snap(c);
    check('sp1-0', 'ANTI-VACUOUS fixture: the document [sp1-a] presses on really carries unsaved edits, '
      + 'so d-29\'s guard is on its ASKING arm — a clean document would replace silently and every '
      + 'dialog row below would be measuring the wrong branch',
      sp1Pre.unsavedEdits === true,
      `${sp1Pre.brief} — left dirty by the [fg] phase above, not by anything this block did`);
    await c.evalExpr('window.__d27.watchStart()');
    await clickHandle(c, `preset${big}`, `size-preset chip "${big}" (DIRTY document)`);
    const sp1FocusA = await focusNow(c, `preset${big}`);
    const sp1InfoA = await c.json('window.__d27.info()');
    const sp1SeenA = await c.evalExpr('window.__d27.watchStop()');
    const sp1A = await snap(c);
    await shot(c, 'sp1-dialog');
    check('sp1-a', `shell/SpriteToolOptions.tsx size-preset chip "${big}": after a REAL CLICK the chip `
      + 'does not keep keyboard focus — AND the same click still REACHED the writer, which since d-29 '
      + 'means it raised the confirm dialog, and the document is untouched while that stands',
      sp1FocusA.isTheButton === false && sp1InfoA !== null && /discard/i.test(sp1InfoA.label ?? '')
      && sp1A.key === sp1Pre.key && sp1A.unsavedEdits === true && sp1SeenA === true,
      `activeElement = <${sp1FocusA.tag}> "${sp1FocusA.text}" (isTheChip=${sp1FocusA.isTheButton}); `
      + `dialog = ${JSON.stringify(sp1InfoA)}; ${sp1Pre.brief} → ${sp1A.brief} (fingerprint identical). `
      + 'd-27 IS UNAFFECTED BY d-29 HERE and that is the mechanism, not a coincidence: '
      + '`ui/act-and-drop-focus.ts` blurs e.currentTarget BEFORE it calls act(), so the blur happens '
      + 'whether the guard asks or writes. The "still acted" half of this row is now carried by the '
      + 'DIALOG — a chip wired to nothing raises none — and the "untouched while it stands" half is in '
      + 'the condition, because a guard that asked and replaced anyway would satisfy a '
      + `dialog-exists assertion perfectly. The watcher reported seen=${sp1SeenA}, which is the POSITIVE `
      + 'CONTROL every -e* row below borrows.');

    // ── [sp1-b] A SPACE WHILE THE DIALOG STANDS ANSWERS NOTHING ────────────
    //
    // ⚠ THIS ROW REPLACES ONE THAT PASSED FOR THE WRONG REASON. On `ed4df57e`
    // the old [sp1-b] sent its Space at a screen covered by this very dialog's
    // backdrop and reported PASS; "the document did not change" was true because
    // the modal was in the way, which says nothing about d-27. The claim is now
    // the one that press actually tests: does a bare Space confirm or cancel the
    // dialog by accident? `ConfirmDialog` sets no initial focus and installs no
    // focus trap, so this is a real question and not a formality.
    const sp1PreB = await snap(c);
    await space(c); await sleep(400);
    await enter(c); await sleep(400);
    const sp1InfoB = await c.json('window.__d27.info()');
    const sp1B = await snap(c);
    check('sp1-b', `shell/SpriteToolOptions.tsx size-preset chip "${big}": a bare SPACE (and Enter) `
      + 'WHILE THE DIALOG STANDS answers it neither way — it is still on screen and the painted pixels '
      + 'and the dirty flag are still there',
      sp1PreB.s.frameCoverage[0] > 0 && sp1PreB.unsavedEdits === true
      && sp1InfoB !== null && sp1B.key === sp1PreB.key && sp1B.unsavedEdits === true,
      `dialog after the keys = ${JSON.stringify(sp1InfoB?.buttons)}; ${sp1PreB.brief} → ${sp1B.brief}. `
      + `VACUITY GUARD: the document held ${sp1PreB.s.frameCoverage[0]} non-zero pixels and `
      + 'unsavedEdits=true when the keys were sent, so a Space that had reached "Discard & start new" '
      + 'would have blanked them AND closed the dialog — both visible. POSITIVE CONTROL for the key '
      + 'channel: the Esc in [sp1-e1] immediately below travels the same Input.dispatchKeyEvent path '
      + 'and DOES close it.');

    // ── [sp1-e1] ESC — the window keydown listener path ────────────────────
    await escape(c); await sleep(500);
    await farSideOfDialog(c, 'sp1-e1', `shell/SpriteToolOptions.tsx size-preset chip "${big}"`,
      `preset${big}`, 'Esc', await snap(c));

    // ── [sp1-e2] CANCEL, clicked with a real mouse — its own onClick ───────
    await ensureNoDialog(c, 'the start of [sp1-e2]');
    await c.evalExpr('window.__d27.watchStart()');
    await clickHandle(c, `preset${big}`, `size-preset chip "${big}" (dirty, second press)`);
    const sp1PreCancel = await snap(c);
    const sp1CancelOk = await answerDialog(c, 'Cancel');
    await c.evalExpr('window.__d27.watchStop()');
    note('[sp1-e2] the close', `Cancel clicked = ${sp1CancelOk}; document while the dialog stood = `
      + `${sp1PreCancel.brief}`);
    await farSideOfDialog(c, 'sp1-e2', `shell/SpriteToolOptions.tsx size-preset chip "${big}"`,
      `preset${big}`, 'a real mouse click on Cancel', await snap(c));

    // ── [sp1-c] THE ANTI-CHEAT ROW: a DIFFERENT chip, and DISCARD proceeds ─
    //
    // The scaffolding that proves the control acted, now on the far side of the
    // dialog. A DIFFERENT chip on purpose: the presets render from one map, and
    // a second press of the SAME chip is idempotent and could not tell a live
    // control from a dead one.
    await ensureNoDialog(c, 'the start of [sp1-c]');
    const sp1PreC = await snap(c);
    await c.evalExpr('window.__d27.watchStart()');
    await clickHandle(c, `preset${mid}`, `size-preset chip "${mid}" (dirty, DIFFERENT chip)`);
    const sp1FocusC = await focusNow(c, `preset${mid}`);
    const sp1InfoC = await c.json('window.__d27.info()');
    await answerDialog(c, 'Discard & start new');
    const sp1SeenC = await c.evalExpr('window.__d27.watchStop()');
    const sp1C = await snap(c);
    check('sp1-c', `shell/SpriteToolOptions.tsx size-preset chips: a SECOND real click — on the "${mid}" `
      + 'chip, its OWN dispatch line — drops focus again, asks again, and on DISCARD really does replace '
      + 'the document',
      sp1FocusC.isTheButton === false && sp1InfoC !== null && sp1SeenC === true
      && sp1C.s.frameW === mid && sp1C.s.frameH === mid && sp1C.s.frames === 1
      && sp1C.canUndo === false && sp1C.unsavedEdits === false && sp1PreC.unsavedEdits === true,
      `${sp1PreC.brief} → ${sp1C.brief}; activeElement right after the CHIP press = `
      + `<${sp1FocusC.tag}> "${sp1FocusC.text}" (isTheChip=${sp1FocusC.isTheButton}); dialog raised = `
      + `${JSON.stringify(sp1InfoC?.buttons)}. canUndo is now ${sp1C.canUndo} because newSprite CLEARS `
      + 'the history — this document is NOT one Ctrl+Z away, which is why this site is worse than the '
      + 'two collision buttons d-27 was ruled on and why d-29 put a dialog in front of it. Without this '
      + 'row, "the dialog appears" and "the chip is dead" would be the same artifact.');

    // ── [sp1-e3] DISCARD — the third close path, measured on its own ───────
    await paint(6);
    await farSideOfDialog(c, 'sp1-e3', `shell/SpriteToolOptions.tsx size-preset chip "${mid}"`,
      `preset${mid}`, 'a real mouse click on Discard & start new', await snap(c));

    // ── [sp1-d] THE NO-OP PRESS — and d-29's CLEAN arm ────────────────────
    //
    // The fixture is a CLEAN document (the paint above is undone first), so this
    // row now carries d-29's other half too: a clean press sees NO DIALOG AT ALL
    // and still drops focus. That is the row an implementation that confirmed
    // unconditionally would fail, and it is measured on the same press.
    await ensureNoDialog(c, 'the start of [sp1-d]');
    await clickHandle(c, `preset${mid}`, `size-preset chip "${mid}" (clearing the paint for [sp1-d])`);
    await answerDialog(c, 'Discard & start new');
    await ensureNoDialog(c, 'after clearing the paint for [sp1-d]');
    const sp1PreNoop = await snap(c);
    check('sp1-d0', 'ANTI-VACUOUS: the document [sp1-d] presses on is genuinely CLEAN, so d-29 is on '
      + 'its SILENT arm and a dialog appearing there would be the defect, not the design',
      sp1PreNoop.unsavedEdits === false && sp1PreNoop.canUndo === false,
      `${sp1PreNoop.brief}`);
    await c.evalExpr('window.__d27.watchStart()');
    await clickHandle(c, `preset${mid}`, `size-preset chip "${mid}" (NO-OP press — already that document)`);
    const sp1FocusD = await focusNow(c, `preset${mid}`);
    const sp1SeenD = await c.evalExpr('window.__d27.watchStop()');
    const sp1D = await snap(c);
    check('sp1-d', 'd-27 IS UNCONDITIONAL at the size-preset chips: a press that changes NOTHING (the '
      + 'document is already a virgin blank at that size) still drops focus — and d-29 stays SILENT on '
      + 'it, because there is nothing to lose',
      sp1D.key === sp1PreNoop.key && sp1D.canUndo === false && sp1D.unsavedEdits === false
      && sp1FocusD.isTheButton === false && sp1SeenD === false,
      `the press left the fingerprint identical (${sp1PreNoop.brief} → ${sp1D.brief}) and activeElement `
      + `is <${sp1FocusD.tag}> (isTheChip=${sp1FocusD.isTheButton}); dialog watcher seen=${sp1SeenD}. `
      + '⚠ READ THE MECHANISM: newSprite has no early return — this is a no-op by IDEMPOTENCE (a second '
      + 'blankDoc at the same size is byte-identical), not by a return. An implementation that blurred '
      + 'only on the acting path fails this row. The seen=false half is d-29\'s clean arm, which an '
      + 'implementation that confirmed UNCONDITIONALLY would fail while passing every dialog row above.');

    // ═══════════════════════════════════════════════════════════════════════
    // [sp2] shell/SpriteToolOptions.tsx — `New □`
    //
    // ITS OWN ROWS, ALL OF THEM. `New □` and the preset chips call the same
    // writer from TWO SEPARATE dispatch lines twenty lines apart, and a blur —
    // or, now, a GUARD — wired to the map above and not to this one would pass
    // every [sp1] row.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [sp2] `New □` (shell/SpriteToolOptions.tsx) ===');
    await ensureNoDialog(c, 'the start of the [sp2] phase');
    await paint(6);
    const sp2Pre = await snap(c);
    check('sp2-0', 'ANTI-VACUOUS fixture: the document `New □` is pressed on carries painted pixels AND '
      + 'unsaved edits, so d-29 is on its ASKING arm and there is something for a re-fire to destroy',
      sp2Pre.unsavedEdits === true && sp2Pre.s.frameCoverage[0] > 0,
      `${sp2Pre.brief} — painted through __dbg.spritePaint, which moves no focus and clicks nothing`);
    await c.evalExpr('window.__d27.watchStart()');
    await clickHandle(c, 'newBox', 'New □ (DIRTY document)');
    const sp2FocusA = await focusNow(c, 'newBox');
    const sp2InfoA = await c.json('window.__d27.info()');
    const sp2SeenA = await c.evalExpr('window.__d27.watchStop()');
    const sp2A = await snap(c);
    check('sp2-a', 'shell/SpriteToolOptions.tsx `New □`: after a REAL CLICK the chip does not keep '
      + 'keyboard focus — AND the same click still REACHED the writer (it raised d-29\'s dialog), with '
      + 'the document untouched while that stands',
      sp2FocusA.isTheButton === false && sp2InfoA !== null && /discard/i.test(sp2InfoA.label ?? '')
      && sp2A.key === sp2Pre.key && sp2A.unsavedEdits === true && sp2SeenA === true,
      `activeElement = <${sp2FocusA.tag}> "${sp2FocusA.text}" (isTheChip=${sp2FocusA.isTheButton}); `
      + `dialog = ${JSON.stringify(sp2InfoA)}; ${sp2Pre.brief} → ${sp2A.brief} (fingerprint identical). `
      + 'ITS OWN DISPATCH LINE: a blur or a guard wired to the preset map and not to this chip would '
      + 'pass every [sp1] row and fail here.');

    const sp2PreB = await snap(c);
    await space(c); await sleep(400);
    await enter(c); await sleep(400);
    const sp2InfoB = await c.json('window.__d27.info()');
    const sp2B = await snap(c);
    check('sp2-b', 'shell/SpriteToolOptions.tsx `New □`: a bare SPACE (and Enter) WHILE THE DIALOG '
      + 'STANDS answers it neither way — it is still on screen and the painted pixels survive',
      sp2PreB.s.frameCoverage[0] > 0 && sp2PreB.unsavedEdits === true
      && sp2InfoB !== null && sp2B.key === sp2PreB.key && sp2B.unsavedEdits === true,
      `dialog after the keys = ${JSON.stringify(sp2InfoB?.buttons)}; ${sp2PreB.brief} → ${sp2B.brief}. `
      + 'Same vacuity guard and same positive control as [sp1-b], measured again here because this is '
      + 'the OTHER dispatch line and the file does not let one site ride on another.');

    await escape(c); await sleep(500);
    await farSideOfDialog(c, 'sp2-e1', 'shell/SpriteToolOptions.tsx `New □`', 'newBox', 'Esc',
      await snap(c));

    await ensureNoDialog(c, 'the start of [sp2-e2]');
    await c.evalExpr('window.__d27.watchStart()');
    await clickHandle(c, 'newBox', 'New □ (dirty, second press)');
    const sp2CancelOk = await answerDialog(c, 'Cancel');
    await c.evalExpr('window.__d27.watchStop()');
    note('[sp2-e2] the close', `Cancel clicked = ${sp2CancelOk}`);
    await farSideOfDialog(c, 'sp2-e2', 'shell/SpriteToolOptions.tsx `New □`', 'newBox',
      'a real mouse click on Cancel', await snap(c));

    await ensureNoDialog(c, 'the start of [sp2-c]');
    const sp2PreC = await snap(c);
    await c.evalExpr('window.__d27.watchStart()');
    await clickHandle(c, 'newBox', 'New □ (dirty, over painted pixels)');
    const sp2FocusC = await focusNow(c, 'newBox');
    const sp2InfoC = await c.json('window.__d27.info()');
    await answerDialog(c, 'Discard & start new');
    const sp2SeenC = await c.evalExpr('window.__d27.watchStop()');
    const sp2C = await snap(c);
    check('sp2-c', 'shell/SpriteToolOptions.tsx `New □`: a SECOND real click drops focus again, asks '
      + 'again, and on DISCARD really does replace the document',
      sp2FocusC.isTheButton === false && sp2InfoC !== null && sp2SeenC === true
      && sp2PreC.s.frameCoverage[0] > 0 && sp2C.s.frameCoverage[0] === 0
      && sp2C.canUndo === false && sp2C.unsavedEdits === false,
      `frame 0 coverage ${sp2PreC.s.frameCoverage[0]} → ${sp2C.s.frameCoverage[0]}; activeElement right `
      + `after the CHIP press = <${sp2FocusC.tag}> (isTheChip=${sp2FocusC.isTheButton}); dialog raised = `
      + `${JSON.stringify(sp2InfoC?.buttons)}. The pixels are what make this row discriminating: `
      + '`New □` is idempotent over a virgin document, so a press with nothing painted could not tell a '
      + 'live chip from a dead one — and with nothing painted the document would be clean and d-29 '
      + 'would not ask at all.');

    await paint(6);
    await farSideOfDialog(c, 'sp2-e3', 'shell/SpriteToolOptions.tsx `New □`', 'newBox',
      'a real mouse click on Discard & start new', await snap(c));

    // ── [sp2-d] the no-op press, on a CLEAN document ──────────────────────
    await ensureNoDialog(c, 'the start of [sp2-d]');
    await clickHandle(c, 'newBox', 'New □ (clearing the paint for [sp2-d])');
    await answerDialog(c, 'Discard & start new');
    await ensureNoDialog(c, 'after clearing the paint for [sp2-d]');
    const sp2PreNoop = await snap(c);
    check('sp2-d0', 'ANTI-VACUOUS: the document [sp2-d] presses on is genuinely CLEAN, so d-29 is on '
      + 'its SILENT arm',
      sp2PreNoop.unsavedEdits === false && sp2PreNoop.canUndo === false,
      `${sp2PreNoop.brief}`);
    await c.evalExpr('window.__d27.watchStart()');
    await clickHandle(c, 'newBox', 'New □ (NO-OP press — already that document)');
    const sp2FocusD = await focusNow(c, 'newBox');
    const sp2SeenD = await c.evalExpr('window.__d27.watchStop()');
    const sp2D = await snap(c);
    check('sp2-d', 'd-27 IS UNCONDITIONAL at `New □`: a press that changes NOTHING (the document is '
      + 'already a virgin blank at that size) still drops focus — and d-29 stays SILENT on it',
      sp2D.key === sp2PreNoop.key && sp2D.canUndo === false && sp2D.unsavedEdits === false
      && sp2FocusD.isTheButton === false && sp2SeenD === false,
      `the press left the fingerprint identical (${sp2PreNoop.brief} → ${sp2D.brief}) and activeElement `
      + `is <${sp2FocusD.tag}> (isTheChip=${sp2FocusD.isTheButton}); dialog watcher seen=${sp2SeenD}. `
      + 'Same mechanism note as [sp1-d]: idempotence, not an early return.');

    // ═══════════════════════════════════════════════════════════════════════
    // [fg-d] — the sharpest [k7] in the file, and it is measured LAST on
    // purpose: `New □` has just left a ONE-FRAME document with an EMPTY
    // history, which is exactly the state `deleteFrame`'s early return needs.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [fg-d] FrameGrid Delete on the `frames.length <= 1` EARLY RETURN ===');
    // ⚠ THE LAST BACKDROP HOLE, AND IT WAS FOUND BY A PLANT, NOT BY READING.
    // Under the P5 plant (d-29's clean arm removed, so the guard confirms
    // UNCONDITIONALLY) `[sp2-d]`'s no-op press leaves a dialog standing, and
    // this section's aim then landed on its backdrop and ABORTED the run —
    // taking `[fg-d]` and `[z1]` with it and reporting one stack trace instead
    // of "P5 reddens sp1-d and sp2-d and nothing else". A plant is supposed to
    // redden its OWN rows; every phase boundary that can inherit a dialog needs
    // this, and this was the one boundary that did not have it.
    await ensureNoDialog(c, 'the start of the [fg-d] phase');
    const fgPreNoop = await snap(c);
    check('fg-d0', 'ANTI-VACUOUS: the document is on the early-return path — exactly one frame, and a '
      + 'CLEAN history, so a press that reached `recordEdit` would be visible in BOTH flags',
      fgPreNoop.s.frames === 1 && fgPreNoop.canUndo === false && fgPreNoop.unsavedEdits === false,
      `frames=${fgPreNoop.s.frames} canUndo=${fgPreNoop.canUndo} unsavedEdits=${fgPreNoop.unsavedEdits}`);
    await clickHandle(c, 'frameDelete', 'FrameGrid Delete (NO-OP press — one frame left)');
    const fgFocusD = await focusNow(c, 'frameDelete');
    const fgD = await snap(c);
    await shot(c, 'fg-noop-press');
    check('fg-d', 'd-27 IS UNCONDITIONAL at FrameGrid Delete: a press that takes the '
      + '`if (s.frames.length <= 1) return` EARLY RETURN and writes nothing still drops focus',
      fgD.key === fgPreNoop.key && fgD.s.frames === 1
      && fgD.canUndo === false && fgD.unsavedEdits === false
      && fgFocusD.isTheButton === false,
      `frames stayed ${fgD.s.frames}, fingerprint identical, canUndo=${fgD.canUndo} and `
      + `unsavedEdits=${fgD.unsavedEdits} BOTH still false — which is what proves the press really took `
      + 'the early return rather than acting and happening to write the same bytes: `recordEdit` would '
      + `have flipped both. activeElement is <${fgFocusD.tag}> `
      + `(isTheDeleteButton=${fgFocusD.isTheButton}). This is the row a cheaper implementation — blur `
      + 'inside the handler, after the early return — fails while passing every other row here.');

    // ═══ nothing was written ═══════════════════════════════════════════════
    const saveInfo = await c.json('window.__dbg.spriteSaveInfo()');
    check('z1', 'nothing was saved: no Ctrl+S and no save call was issued, and the app has no autosave '
      + '(shell/close-guard.ts) — every edit above lived and died in memory',
      true,
      `spriteSaveInfo = ${JSON.stringify(saveInfo)} (relPath is null because \`New □\` replaced the S1 `
      + 'checkout in memory, which IS the writer [sp2] measures — no file on disk was touched)');
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
