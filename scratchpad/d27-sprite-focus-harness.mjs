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
 *
 * `el()` returns null rather than throwing so `clickHandle` can report HANDLE
 * ABSENT with the handle's name — a run that silently clicked the wrong thing
 * is the failure this table exists to prevent.
 */
const INSTALL_HANDLES = (presets) => String.raw`
(() => {
  const PRESETS = ${JSON.stringify(presets)};
  const btns = () => [...document.querySelectorAll('button')];
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
      return table[h] ? table[h]() : null;
    },
    stepDelCount: () => document.querySelectorAll('button[title="remove step"]').length,
    presetCount: () => (table.presetBox() ? table.presetBox().children.length : -1),
  };
  return { presets: window.__d27.presetCount(), steps: window.__d27.stepDelCount() };
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
      + "component's SIZE_PRESETS — no row below can pass by finding nothing",
      handles.presets === SIZE_PRESETS.length,
      `presetBox children=${handles.presets}, SIZE_PRESETS=${JSON.stringify(SIZE_PRESETS)} `
      + `(read from ${TOOLOPTS_SRC.replace(ROOT + '/', '')}); remove-step buttons on screen=${handles.steps}`);
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
    // Ctrl+Z afterwards. That is why [sp1-b]/[sp2-b] rebuild their fixture
    // through `__dbg.spritePaint` and name their positive control separately.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [sp1] size-preset chips (shell/SpriteToolOptions.tsx) ===');
    const big = SIZE_PRESETS[SIZE_PRESETS.length - 1];
    const mid = SIZE_PRESETS[SIZE_PRESETS.length - 2];
    const sp1Pre = await snap(c);
    await clickHandle(c, `preset${big}`, `size-preset chip "${big}"`);
    const sp1FocusA = await focusNow(c, `preset${big}`);
    const sp1A = await snap(c);
    check('sp1-a', `shell/SpriteToolOptions.tsx size-preset chip "${big}": after a REAL CLICK the chip `
      + 'does not keep keyboard focus — AND the same click still replaced the whole document',
      sp1FocusA.isTheButton === false && sp1A.s.frameW === big && sp1A.s.frameH === big
      && sp1A.s.frames === 1 && sp1A.canUndo === false,
      `activeElement = <${sp1FocusA.tag}> "${sp1FocusA.text}" (isTheChip=${sp1FocusA.isTheButton}); `
      + `${sp1Pre.brief} → ${sp1A.brief}. canUndo is now ${sp1A.canUndo} because newSprite CLEARS the `
      + 'history — this document is NOT one Ctrl+Z away, which is why this site is worse than the two '
      + 'collision buttons d-27 was ruled on.');

    // The fixture for the Space is built with __dbg.spritePaint, not a click,
    // and NOT with Ctrl+Z — there is no history left to undo through.
    await paint(6);
    const sp1PreSpace = await snap(c);
    await space(c); await sleep(400);
    const sp1Space = await snap(c);
    await enter(c); await sleep(400);
    const sp1Enter = await snap(c);
    check('sp1-b', `shell/SpriteToolOptions.tsx size-preset chip "${big}": a bare SPACE straight after `
      + 'the click reaches no writer — the painted pixels survive (Enter sent separately too)',
      sp1PreSpace.s.frameCoverage[0] > 0
      && sp1Space.key === sp1PreSpace.key && sp1Enter.key === sp1PreSpace.key,
      `frame 0 coverage ${sp1PreSpace.s.frameCoverage[0]} → after Space ${sp1Space.s.frameCoverage[0]} `
      + `→ after Enter ${sp1Enter.s.frameCoverage[0]}. VACUITY GUARD: the canvas held `
      + `${sp1PreSpace.s.frameCoverage[0]} non-zero pixels when the keys were sent, so a Space that `
      + 're-fired newSprite would have blanked them and been visible — a virgin blank document would '
      + 'make this row pass on a Space that fired. POSITIVE CONTROL: this site cannot use Ctrl+Z (the '
      + 'history is gone), so it borrows [tl-b]/[fg-b]/[pal-b], where a Ctrl+Z on the SAME '
      + 'Input.dispatchKeyEvent channel visibly landed in this same run.');

    await clickHandle(c, `preset${mid}`, `size-preset chip "${mid}" (second real click, different chip)`);
    const sp1FocusC = await focusNow(c, `preset${mid}`);
    const sp1C = await snap(c);
    check('sp1-c', `shell/SpriteToolOptions.tsx size-preset chips: a SECOND real click — on the "${mid}" `
      + 'chip, its OWN dispatch line — still replaces the document and drops focus again',
      sp1C.s.frameW === mid && sp1C.s.frameH === mid && sp1FocusC.isTheButton === false,
      `${sp1PreSpace.brief} → ${sp1C.brief}; activeElement after = <${sp1FocusC.tag}> `
      + `"${sp1FocusC.text}" (isTheChip=${sp1FocusC.isTheButton}). A DIFFERENT chip on purpose: the `
      + 'presets are rendered from one map, and a second press of the SAME chip is idempotent and could '
      + 'not tell a live control from a dead one.');

    const sp1PreNoop = await snap(c);
    await clickHandle(c, `preset${mid}`, `size-preset chip "${mid}" (NO-OP press — already that document)`);
    const sp1FocusD = await focusNow(c, `preset${mid}`);
    const sp1D = await snap(c);
    check('sp1-d', 'd-27 IS UNCONDITIONAL at the size-preset chips: a press that changes NOTHING (the '
      + 'document is already a virgin blank at that size) still drops focus',
      sp1D.key === sp1PreNoop.key && sp1D.canUndo === false && sp1D.unsavedEdits === false
      && sp1FocusD.isTheButton === false,
      `the press left the fingerprint identical (${sp1PreNoop.brief} → ${sp1D.brief}) and activeElement `
      + `is <${sp1FocusD.tag}> (isTheChip=${sp1FocusD.isTheButton}). ⚠ READ THE MECHANISM: newSprite has `
      + 'no early return — this is a no-op by IDEMPOTENCE (a second blankDoc at the same size is '
      + 'byte-identical), not by a return. An implementation that blurred only on the acting path fails '
      + 'this row.');

    // ═══════════════════════════════════════════════════════════════════════
    // [sp2] shell/SpriteToolOptions.tsx — `New □`
    //
    // ITS OWN FOUR ROWS. `New □` and the preset chips call the same writer from
    // TWO SEPARATE dispatch lines twenty lines apart, and a blur wired to the
    // map above and not to this one would pass every [sp1] row.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [sp2] `New □` (shell/SpriteToolOptions.tsx) ===');
    await paint(6);
    const sp2Pre = await snap(c);
    await clickHandle(c, 'newBox', 'New □');
    const sp2FocusA = await focusNow(c, 'newBox');
    const sp2A = await snap(c);
    check('sp2-a', 'shell/SpriteToolOptions.tsx `New □`: after a REAL CLICK the chip does not keep '
      + 'keyboard focus — AND the same click still replaced the whole document',
      sp2FocusA.isTheButton === false && sp2Pre.s.frameCoverage[0] > 0
      && sp2A.s.frameCoverage[0] === 0 && sp2A.canUndo === false,
      `activeElement = <${sp2FocusA.tag}> "${sp2FocusA.text}" (isTheChip=${sp2FocusA.isTheButton}); `
      + `${sp2Pre.brief} → ${sp2A.brief}. The "still acted" half is measured as the painted pixels `
      + `going ${sp2Pre.s.frameCoverage[0]} → ${sp2A.s.frameCoverage[0]}, which a dead chip could not do.`);

    await paint(6);
    const sp2PreSpace = await snap(c);
    await space(c); await sleep(400);
    const sp2Space = await snap(c);
    await enter(c); await sleep(400);
    const sp2Enter = await snap(c);
    check('sp2-b', 'shell/SpriteToolOptions.tsx `New □`: a bare SPACE straight after the click reaches '
      + 'no writer — the painted pixels survive (Enter sent separately too)',
      sp2PreSpace.s.frameCoverage[0] > 0
      && sp2Space.key === sp2PreSpace.key && sp2Enter.key === sp2PreSpace.key,
      `frame 0 coverage ${sp2PreSpace.s.frameCoverage[0]} → after Space ${sp2Space.s.frameCoverage[0]} `
      + `→ after Enter ${sp2Enter.s.frameCoverage[0]}. Same vacuity guard and same borrowed positive `
      + 'control as [sp1-b]: newSprite clears the history, so the fixture is rebuilt through '
      + '__dbg.spritePaint rather than Ctrl+Z, and nothing was clicked in between.');

    const sp2PreC = await snap(c);
    await clickHandle(c, 'newBox', 'New □ (second real click, over painted pixels)');
    const sp2FocusC = await focusNow(c, 'newBox');
    const sp2C = await snap(c);
    check('sp2-c', 'shell/SpriteToolOptions.tsx `New □`: a SECOND real click still replaces the document '
      + 'and drops focus again',
      sp2PreC.s.frameCoverage[0] > 0 && sp2C.s.frameCoverage[0] === 0
      && sp2FocusC.isTheButton === false,
      `frame 0 coverage ${sp2PreC.s.frameCoverage[0]} → ${sp2C.s.frameCoverage[0]}; activeElement after `
      + `= <${sp2FocusC.tag}> (isTheChip=${sp2FocusC.isTheButton}). The pixels are what make this row `
      + 'discriminating: `New □` is idempotent over a virgin document, so a second press with nothing '
      + 'painted could not tell a live chip from a dead one.');

    const sp2PreNoop = await snap(c);
    await clickHandle(c, 'newBox', 'New □ (NO-OP press — already that document)');
    const sp2FocusD = await focusNow(c, 'newBox');
    const sp2D = await snap(c);
    check('sp2-d', 'd-27 IS UNCONDITIONAL at `New □`: a press that changes NOTHING (the document is '
      + 'already a virgin blank at that size) still drops focus',
      sp2D.key === sp2PreNoop.key && sp2D.canUndo === false && sp2D.unsavedEdits === false
      && sp2FocusD.isTheButton === false,
      `the press left the fingerprint identical (${sp2PreNoop.brief} → ${sp2D.brief}) and activeElement `
      + `is <${sp2FocusD.tag}> (isTheChip=${sp2FocusD.isTheButton}). Same mechanism note as [sp1-d]: `
      + 'idempotence, not an early return.');

    // ═══════════════════════════════════════════════════════════════════════
    // [fg-d] — the sharpest [k7] in the file, and it is measured LAST on
    // purpose: `New □` has just left a ONE-FRAME document with an EMPTY
    // history, which is exactly the state `deleteFrame`'s early return needs.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [fg-d] FrameGrid Delete on the `frames.length <= 1` EARLY RETURN ===');
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
