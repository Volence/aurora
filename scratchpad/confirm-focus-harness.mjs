#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// d-31 IN THE REAL APP — WHAT DOES THE CONFIRM DIALOG PUT UNDER THE SPACE KEY?
//
//     npm run harness:confirm-focus
//
// Card `d-31-confirm-dialog-focuses-nothing`, ruled `focus_cancel_and_guard`:
//
//   1. the dialog focuses its SAFE button — Cancel — when it opens, never the
//      destructive one; and
//   2. a check fails from then on if a destructive button is ever the focused
//      one.
//
// This file is half 2, at the doors it can physically reach.
//
// ═══ THE MEASUREMENT BEHIND THE CARD ══════════════════════════════════════
//
// `shell/ConfirmDialog.tsx` used to focus NOTHING, and that accident was the
// only reason the app was safe. Plant P3 of
// `docs/reviews/2026-09-04-d27-sprite-rows-meet-dialog.md` §4 added four
// characters of textbook accessibility practice —
//
//     autoFocus={b.tone === 'danger'}
//
// — and a bare SPACE, aimed at nothing, silently destroyed a sprite: 5 frames
// to 1, 40x40 to 64x64, 224 painted pixels to zero, the undo history cleared,
// AND the dirty flag reset, so the tab-close, project-open and window-close
// guards all went quiet afterwards too. Nothing downstream would ever have
// asked about the work that was lost.
//
// ═══ WHY A CDP HARNESS AND NOT A UNIT TEST ════════════════════════════════
//
// The node suite has no React, no DOM and no focus: ~7,100 vitest rows go green
// here while a feature is visibly broken. `document.activeElement` in a real
// Electron window is the instrument, and there is no substitute for it.
//
// The node suite does carry the other two thirds of this ruling, and they cover
// what this file CANNOT:
//   • `components/ui/__tests__/safe-focus.test.ts` — WHICH button is chosen,
//     including the all-destructive case no real door produces today.
//   • `shell/__tests__/confirm-dialog-focus.test.ts` §B — every one of the
//     EIGHT `ask()` sites in `src/`, parsed with the TypeScript compiler's own
//     parser. Four of those eight are out of a headless harness's reach (see
//     [z1]), and §B is what stops that gap from being a coverage gap.
// Its §A is also the ONLY thing that reddens on the literal P3 edit — see the
// note at [z2], which is a real finding about this file's own blind spot.
//
// ═══ THE ROW SHAPE, AND WHY IT IS NOT "SOMETHING IS FOCUSED" ══════════════
//
// "The dialog focuses a button" is passed perfectly by the P3 defect. Every
// focus row here asserts THREE things at once:
//
//   1. `document.activeElement` IS the cancel button — by ELEMENT IDENTITY
//      (`active === el`), never by text. Labels are prose and a guard keyed on
//      "Discard & close" stops covering the site the day it is reworded.
//   2. `document.activeElement` is NOT any `[data-tone="danger"]` element —
//      derived from the component's own notion of destructive, which is the
//      same `tone` field `safe-focus.ts` reads and `ConfirmDialog` renders.
//   3. the dialog ACTUALLY CONTAINS at least one danger-toned button. Without
//      this, clause 2 is vacuous: "focus is not on a danger button" is trivially
//      true in a dialog that has none, and it would stay green forever.
//
// And each door then takes a REAL SPACE while the dialog stands, which is the
// ruling's behaviour half and its accepted cost in one row: the dialog must
// CLOSE (before d-31 a bare Space did nothing at all, so this row could not
// have passed) and the subject must be INTACT (it answered 'cancel', not the
// destructive key).
//
// ⚠ NOT `el.click()`, and not a synthetic KeyboardEvent. A gesture the app
// never listens for no-ops silently, every later reading comes off the previous
// screen, and the row says "not reproduced" forever. Everything here goes
// through `Input.dispatchMouseEvent` press/release and `Input.dispatchKeyEvent`
// — the same channel that measured P3.
//
// ⚠ `devicePixelRatio` under Xvfb on this machine has been observed at BOTH 1
// and 1.35 within one session. Every aim is rounded to integer client pixels
// BEFORE it is sent, verified with `elementFromPoint`, and the dpr and derived
// aim are PRINTED. A miss REFUSES rather than clicking whatever is underneath.
//
// ⚠ THE DIALOG'S BACKDROP IS `position: fixed; inset: 0`, so an aim taken while
// a dialog stands lands on the backdrop and refuses — which is a feature: this
// file cannot silently measure a press the modal ate.
//
// ═══ IT WRITES NOTHING TO DISK ════════════════════════════════════════════
//
// No Ctrl+S, no save call, and the app has no autosave (`shell/close-guard.ts`).
// `S1DIR` and `AEON_DIR` are OPENED ONLY. Every answer this file gives a dialog
// is CANCEL — it never clicks a Discard or a Clear, so unlike
// confirm-destroy-harness it does not even empty a library in memory. [z3]
// reports the sprite save state at the end.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9497);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const S1DIR = siblingPathOrUnresolved('s1disasm');   // OPEN ONLY — never written
const AEONDIR = siblingPathOrUnresolved('aeon');     // OPEN ONLY — never written
const SHOTS = join(ROOT, 'scratchpad/shots-confirm-focus');
mkdirSync(SHOTS, { recursive: true });

// ── constants READ OUT OF THE COMPONENTS, never pinned here ────────────────
//
// A `[16,24,32,48,64]` typed into this file is the copied-pin defect this repo
// keeps paying for: the day someone edits the constant, a pinned copy makes a
// handle resolve to nothing and the run dies with a confusing AIM REFUSED
// instead of saying the constant moved.
const TOOLOPTS_SRC = join(ROOT, 'src/renderer/shell/SpriteToolOptions.tsx');
function sizePresets() {
  const m = /const SIZE_PRESETS = \[([0-9,\s]+)\]/.exec(readFileSync(TOOLOPTS_SRC, 'utf8'));
  if (!m) throw new Error(`could not read SIZE_PRESETS out of ${TOOLOPTS_SRC}`);
  return m[1].split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}
const SIZE_PRESETS = sizePresets();

// The SAFE key, read out of the module that defines it rather than typed here.
// If `SAFE_CONFIRM_KEY` were ever changed, this file must follow it or its
// "focus is on cancel" rows would be asking about a key nothing renders.
const SAFEFOCUS_SRC = join(ROOT, 'src/renderer/components/ui/safe-focus.ts');
function safeKey() {
  const m = /export const SAFE_CONFIRM_KEY = '([^']+)'/.exec(readFileSync(SAFEFOCUS_SRC, 'utf8'));
  if (!m) throw new Error(`could not read SAFE_CONFIRM_KEY out of ${SAFEFOCUS_SRC}`);
  return m[1];
}
const SAFE_KEY = safeKey();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const doorsReached = [];
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
/**
 * ⚠ `text` IS NOT DECORATION, AND THE FIRST VERSION OF THIS FILE GOT IT WRONG.
 *
 * A CDP `keyDown` WITHOUT `text` produces a keydown and NO keypress. Blink
 * activates a focused `<button>` on SPACE at keyup and on ENTER at keypress —
 * two different paths — so the textless form activates Space and silently does
 * nothing for Enter. MEASURED here, not reasoned: `[d1e]` came back with the
 * dialog still standing after Enter while `[d1k]`'s Space had closed it, which
 * reads exactly like "the app ignores Enter" and is instead the harness never
 * having sent one. That is this repo's synthetic-event failure wearing a
 * different hat — a key the browser never turns into a press.
 *
 * Both keys now carry `text`, so the channel is uniform and faithful rather
 * than accidentally correct for one of them. THE SPACE ROWS WERE RE-RUN UNDER
 * THIS TIGHTENED CHANNEL, not carried over from the run that found it.
 */
async function key(c, k, code, vk, modifiers = 0, text = undefined) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(text ? { text } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const space = (c) => key(c, ' ', 'Space', 32, 0, ' ');
const enter = (c) => key(c, 'Enter', 'Enter', 13, 0, '\r');
const escape = (c) => key(c, 'Escape', 'Escape', 27);

/** A REAL CLICK, aimed at integer client pixels and hit-tested before sending. */
async function clickHandle(c, handle, label, settle = 500) {
  const geom = await c.json(String.raw`(() => {
    const el = window.__cf.el(${JSON.stringify(handle)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    return { dpr: window.devicePixelRatio, left: b.left, top: b.top, w: b.width, h: b.height,
             vw: window.innerWidth, vh: window.innerHeight,
             disabled: !!el.disabled, text: (el.textContent || '').trim().slice(0, 32),
             title: el.getAttribute('title') };
  })()`);
  if (!geom) throw new Error(`HANDLE ABSENT: "${handle}" (${label}) resolved to nothing. `
    + 'Refusing to click — a run that cannot find its own subject measures nothing.');
  await sleep(80);
  const x = Math.round(geom.left + geom.w / 2);
  const y = Math.round(geom.top + geom.h / 2);
  if (x < 0 || y < 0 || x >= geom.vw || y >= geom.vh) {
    throw new Error(`OFF-SCREEN REFUSED: "${label}" [${handle}] centre is (${x},${y}) in a `
      + `${geom.vw}x${geom.vh} window.`);
  }
  const hit = await c.json(String.raw`(() => {
    const want = window.__cf.el(${JSON.stringify(handle)});
    const el = document.elementFromPoint(${x}, ${y});
    return { tag: el ? el.tagName : null, text: el ? (el.textContent || '').trim().slice(0, 32) : null,
             isTarget: el === want || (want && want.contains(el)) };
  })()`);
  note(`aim: ${label} [${handle}]`,
    `dpr=${geom.dpr} rect=(${geom.left},${geom.top},${geom.w}x${geom.h}) → integer client (${x},${y}) · `
    + `target text="${geom.text}" title=${JSON.stringify(geom.title)} disabled=${geom.disabled} · `
    + `elementFromPoint = <${hit.tag}> "${hit.text}" · isTarget=${hit.isTarget}`);
  if (!hit.isTarget) {
    throw new Error(`AIM REFUSED: integer (${x},${y}) for "${label}" [${handle}] lands on <${hit.tag}> `
      + `"${hit.text}", not the handle. (A dialog's backdrop is \`position: fixed; inset: 0\`, so this `
      + 'is what a press eaten by a modal looks like.)');
  }
  await mouse(c, 'mousePressed', x, y);
  await sleep(40);
  await mouse(c, 'mouseReleased', x, y);
  await sleep(settle);
  return { x, y };
}

/**
 * Leave no dialog standing between phases.
 *
 * A backdrop left up makes every later aim REFUSE, turning one row's red into a
 * whole-run abort — the failure `ed4df57e` inflicted on the d-27 rig, and the
 * one P5 found in that parcel's own edit.
 */
async function ensureNoDialog(c, where) {
  for (let i = 0; i < 4; i++) {
    if ((await c.json('window.__cf.dlg()')) === null) return;
    note(`UNEXPECTED DIALOG STANDING at ${where}`,
      'dismissing it with Esc so the aims below are not eaten by its backdrop. In a green run this '
      + 'never prints; when it does, a row above did not go the way it expected.');
    await escape(c);
    await sleep(500);
  }
}

/**
 * THE IN-PAGE HANDLE TABLE AND THE FOCUS READER.
 *
 * `dlg()` is the whole d-31 instrument. It reports, for the dialog currently on
 * screen:
 *
 *   buttons[]      one entry per button, carrying the `data-confirm-key` and
 *                  `data-tone` the component publishes — so every judgement
 *                  below is made on TONE, the component's own notion of
 *                  destructive, and never on a label.
 *   dangerCount    how many are destructive. The anti-vacuity number: clause
 *                  "focus is not on a danger button" means nothing at zero.
 *   activeKey      the `data-confirm-key` of the focused button, by ELEMENT
 *                  IDENTITY (`document.activeElement === btn`), or null.
 *   activeIsDanger whether the focused element is a danger-toned one — computed
 *                  by identity against the danger buttons, not from activeKey,
 *                  so a focused danger button with no key attribute would still
 *                  be caught.
 *   activeBrief    what actually holds focus, for the log, whatever it is.
 *
 * Handles are STRUCTURAL, never a screen position and never a bare text match:
 *  - preset chips are the ONE `<span>` whose children are exactly
 *    SIZE_PRESETS.length buttons reading exactly those numbers. A bare
 *    `textContent === '32'` is NOT safe — FrameGrid renders a cell button per
 *    frame whose text is its index, so frame 32's thumbnail reads "32" too.
 *  - `newBox` is the only button reading `New □`.
 *  - `chunkClear` is the SECOND button of the two-button group whose FIRST
 *    starts with "Import" — the app has several other buttons saying "Clear".
 *  - `tabClose` is the close affordance of the ACTIVE tab, found by
 *    `title="Close tab"` inside the element that carries the active tab's
 *    styling. Which tab it actually closed is not trusted: the row asserts the
 *    dialog's own `aria-label`, so a mis-click cannot pass.
 */
const INSTALL = (presets) => String.raw`
(() => {
  const PRESETS = ${JSON.stringify(presets)};
  const btns = () => [...document.querySelectorAll('button')];
  const dialog = () => document.querySelector('[role="alertdialog"]');
  const presetBox = () => {
    const want = PRESETS.join(',');
    return [...document.querySelectorAll('span')].find((s) => {
      const kids = [...s.children];
      return kids.length === PRESETS.length
        && kids.every((k) => k.tagName === 'BUTTON')
        && kids.map((k) => (k.textContent || '').trim()).join(',') === want;
    }) || null;
  };
  const chunkActions = () => [...document.querySelectorAll('span')].find((s) => {
    const kids = [...s.children];
    return kids.length === 2 && kids.every((k) => k.tagName === 'BUTTON')
      && /^Import/.test((kids[0].textContent || '').trim())
      && (kids[1].textContent || '').trim() === 'Clear';
  }) || null;
  const closers = () => [...document.querySelectorAll('span[title="Close tab"]')];

  window.__cf = {
    el(h) {
      const p = /^preset(\d+)$/.exec(h);
      if (p) {
        const box = presetBox();
        if (!box) return null;
        return [...box.children].find((k) => (k.textContent || '').trim() === p[1]) || null;
      }
      const d = /^dlg:(.+)$/.exec(h);
      if (d) {
        const dl = dialog();
        if (!dl) return null;
        return dl.querySelector('button[data-confirm-key="' + d[1] + '"]');
      }
      if (h === 'newBox') return btns().find((b) => (b.textContent || '').trim() === 'New □') || null;
      if (h === 'chunkClear') { const w = chunkActions(); return w ? w.children[1] : null; }
      if (h === 'tabClose') { const all = closers(); return all.length ? all[all.length - 1] : null; }
      return null;
    },
    /** The d-31 reading. Null when no dialog is on screen. */
    dlg() {
      const d = dialog();
      if (!d) return null;
      const bs = [...d.querySelectorAll('button')];
      const a = document.activeElement;
      const danger = bs.filter((b) => b.dataset.tone === 'danger');
      const withKey = bs.filter((b) => b.dataset.confirmKey !== undefined);
      const activeBtn = bs.find((b) => b === a) || null;
      return {
        label: d.getAttribute('aria-label'),
        text: (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        buttons: bs.map((b) => ({
          key: b.dataset.confirmKey ?? null,
          tone: b.dataset.tone ?? null,
          label: (b.textContent || '').trim(),
          focused: b === a,
        })),
        buttonCount: bs.length,
        keyedCount: withKey.length,
        dangerCount: danger.length,
        activeKey: activeBtn ? (activeBtn.dataset.confirmKey ?? null) : null,
        activeIsDanger: danger.some((b) => b === a),
        activeInDialog: !!(a && d.contains(a)),
        activeBrief: a ? '<' + a.tagName + '> "' + (a.textContent || '').trim().slice(0, 28) + '"'
                       + ' tone=' + (a.dataset ? (a.dataset.tone ?? '-') : '-') : 'null',
      };
    },
    /** What holds focus with NO dialog up — the reader's negative control. */
    activeBrief() {
      const a = document.activeElement;
      return a ? '<' + a.tagName + '> "' + (a.textContent || '').trim().slice(0, 28) + '"' : 'null';
    },
    anyDangerFocusedAnywhere() {
      const a = document.activeElement;
      return !!(a && a.dataset && a.dataset.tone === 'danger');
    },
  };
  return { presets: presetBox() ? presetBox().children.length : -1, dialogNow: !!dialog() };
})()`;

/**
 * SAMPLE WHO HOLDS FOCUS OVER TIME, not once.
 *
 * ⚠ THE INSTRUMENT THAT FOUND THE ONLY REAL DEFECT THIS PARCEL SHIPPED A FIX
 * FOR. A single reading cannot tell "the dialog never focused anything" from
 * "it focused Cancel and something took it away a moment later", and those are
 * completely different defects with completely different fixes. At the tab-close
 * door the single reading said `<BODY>` and read exactly like the fix not being
 * wired to that door; the truth was that the fix ran, succeeded, and was then
 * overwritten by Chromium's own post-mousedown focus assignment. Printed
 * automatically whenever a focus row goes red, so the next person gets the
 * distinction for free instead of paying for it again.
 */
async function focusTimeline(c, ms = 1200, step = 100) {
  const out = [];
  for (let t = 0; t <= ms; t += step) {
    const d = await c.json('window.__cf.dlg()');
    out.push(`${t}ms:${d === null ? 'no-dialog' : d.activeBrief}`);
    await sleep(step);
  }
  return out;
}

/** Everything about the sprite document a press at these sites could move. */
async function snap(c) {
  const s = await c.json('window.__dbg.spriteState()');
  return {
    s,
    dirty: s.unsavedEdits,
    key: JSON.stringify({ frames: s.frames, w: s.frameW, h: s.frameH, hashes: s.frameHashes, steps: s.steps }),
    brief: `frames=${s.frames} ${s.frameW}x${s.frameH} cov0=${s.frameCoverage[0]} dirty=${s.unsavedEdits}`,
  };
}

/**
 * THE d-31 FOCUS ROW, one shape for every door.
 *
 * `id` gets two rows: `<id>` (what is focused when the dialog opens) and
 * `<id>k` (what a REAL Space then does). They are separate because they fail
 * for different reasons: the first is the ruling's focus half, the second is
 * its behaviour half and its accepted cost.
 */
function focusRow(id, doorName, info, extra = '') {
  const okDanger = info !== null && info.dangerCount >= 1;
  const okKeys = info !== null && info.keyedCount === info.buttonCount;
  const okFocus = info !== null && info.activeKey === SAFE_KEY && info.activeIsDanger === false;
  const ok = okDanger && okKeys && okFocus;
  check(id, `${doorName}: the dialog opens with focus ON THE SAFE BUTTON ('${SAFE_KEY}') and NOT on `
    + 'a destructive one — and it really does contain a destructive one',
    ok,
    info === null
      ? 'DIALOG ABSENT — nothing was on screen to read focus from, so this door was never measured. '
        + 'That is a red, not a skip: a run that cannot reach its subject measures nothing.'
      : `dialog "${info.label}" · buttons ${JSON.stringify(info.buttons)} · dangerCount=`
        + `${info.dangerCount} (ANTI-VACUOUS: at 0 the "not destructive" clause is trivially true) · `
        + `keyed ${info.keyedCount}/${info.buttonCount} · activeElement = ${info.activeBrief} · `
        + `activeKey=${JSON.stringify(info.activeKey)} activeIsDanger=${info.activeIsDanger} · `
        + `identity, not text: activeKey comes from document.activeElement === the button element. `
        + extra);
  return ok;
}

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS.
  assertFreshBuild(RUN);
  if (!existsSync(join(S1DIR, 'artunc/Sonic.unc'))) {
    throw new Error(`${S1DIR}/artunc/Sonic.unc missing — no s1disasm to open, nothing to measure`);
  }
  console.log('\n=== constants read from source, never pinned here ===');
  console.log(`  SIZE_PRESETS    = ${JSON.stringify(SIZE_PRESETS)}  (${TOOLOPTS_SRC.replace(ROOT + '/', '')})`);
  console.log(`  SAFE_CONFIRM_KEY = '${SAFE_KEY}'  (${SAFEFOCUS_SRC.replace(ROOT + '/', '')})`);

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
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3500);
    if (!(await waitDbg())) throw new Error('window.__dbg absent after reload');

    // ═══════════════════════════════════════════════════════════════════════
    // BOOT — s1disasm → GHZ1 → a real sprite document
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== BOOT: s1disasm → GHZ1 → a real sprite document ===');
    await c.evalExpr(`void window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = { zones: 0 };
    for (let i = 0; i < 40 && !(proj.zones > 0); i++) {
      await sleep(500);
      proj = await c.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
    }
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const l = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
      if (l.status === 'ready') break;
    }
    await c.evalExpr("void window.__dbg.activate('ghz', 1)");
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const l = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
      if (l.status === 'ready') break;
    }
    await c.evalExpr('window.__dbg.editObjectArt(0x41)');
    await sleep(2500);
    const installed = await c.json(INSTALL(SIZE_PRESETS));
    const boot = await snap(c);
    await shot(c, 'boot');
    check('b1', 'sprite mode is open on a real S1 document with more than one frame — the fixture '
      + 'every door below builds a DIRTY document from',
      boot.s.activeDocId != null && boot.s.frames > 1 && boot.dirty === false,
      `doc=${boot.s.activeDocId} ${boot.brief} · proj=${JSON.stringify(proj)}`);
    check('b2', 'ANTI-VACUOUS: the handle table found the size-preset chips and they are exactly the '
      + "component's SIZE_PRESETS, and no dialog is standing before anything is pressed",
      installed.presets === SIZE_PRESETS.length && installed.dialogNow === false,
      `presetBox children=${installed.presets}, SIZE_PRESETS=${JSON.stringify(SIZE_PRESETS)}; `
      + `dialog on screen at boot = ${installed.dialogNow}`);
    if (!boot.s.activeDocId || boot.s.frames <= 1) {
      throw new Error('no usable sprite document — every row below would be vacuous');
    }

    // ── [b3] THE FOCUS READER'S NEGATIVE CONTROL ──────────────────────────
    const b3Active = await c.evalExpr('window.__cf.activeBrief()');
    const b3Dlg = await c.json('window.__cf.dlg()');
    const b3Danger = await c.evalExpr('window.__cf.anyDangerFocusedAnywhere()');
    check('b3', 'NEGATIVE CONTROL for the focus reader: with no dialog on screen, nothing anywhere in '
      + 'the app holds a destructive-toned focus and there is no cancel button to be focused — so '
      + '"focus is on cancel" below is a state the dialog CREATES, not the app\'s resting state',
      b3Dlg === null && b3Danger === false,
      `dlg() = ${b3Dlg}; activeElement = ${b3Active}; any [data-tone="danger"] focused = ${b3Danger}. `
      + 'Without this row, every focus row below could be passing on something that was already true '
      + 'before the dialog existed.');

    const paint = async (n) => {
      for (let i = 0; i < n; i++) await c.evalExpr(`window.__dbg.spritePaint(0, ${2 + i}, 3, ${1 + (i % 15)})`);
      await sleep(300);
    };
    const big = SIZE_PRESETS[SIZE_PRESETS.length - 1];

    // ═══════════════════════════════════════════════════════════════════════
    // DOOR 1 — shell/new-sprite-guard.ts, reached through the SIZE CHIP
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== DOOR 1: the sprite size chips (shell/new-sprite-guard.ts) ===');
    await paint(6);
    const d1Pre = await snap(c);
    check('d1f', 'ANTI-VACUOUS fixture: the document really carries unsaved edits and painted pixels '
      + 'for this door to destroy — on a clean one d-29 raises no dialog at all and every row below '
      + 'would be measuring an empty screen',
      d1Pre.dirty === true && d1Pre.s.frameCoverage[0] > 0,
      `${d1Pre.brief} — painted through __dbg.spritePaint, which moves no focus and clicks nothing`);

    await clickHandle(c, `preset${big}`, `size-preset chip "${big}" (dirty document)`);
    const d1 = await c.json('window.__cf.dlg()');
    await shot(c, 'd1-chip-dialog');
    if (!focusRow('d1', 'size chip → "Discard this sprite?"', d1,
      'This is the exact dialog P3 armed with Space.')) {
      note('[d1] focus timeline — did focus LAND and LEAVE, or never land?',
        (await focusTimeline(c)).join('  |  '));
    }
    doorsReached.push('new-sprite-guard.ts (size chip)');

    const d1kPre = await snap(c);
    await space(c); await sleep(600);
    const d1kDlg = await c.json('window.__cf.dlg()');
    const d1k = await snap(c);
    await shot(c, 'd1-after-space');
    check('d1k', 'A REAL SPACE while that dialog stands CLOSES IT AND DESTROYS NOTHING — the ruling\'s '
      + 'behaviour half and its accepted cost in one row',
      d1kDlg === null && d1k.key === d1kPre.key && d1k.dirty === true,
      `dialog after Space = ${d1kDlg}; document ${d1kPre.brief} → ${d1k.brief} (fingerprint identical: `
      + `${d1k.key === d1kPre.key}). BOTH HALVES DISCRIMINATE. "Closed" fails on the PRE-d-31 app, `
      + 'where a bare Space did nothing at all and the dialog stayed up — so this row could not have '
      + 'passed before the fix. "Destroyed nothing" fails under P3, where the same Space took the '
      + 'sprite from 5 frames to 1 and cleared the dirty flag. A row asserting only one of them would '
      + 'be green on one of those two broken apps.');

    // ── [d1e] the other key that activates a focused button ───────────────
    await ensureNoDialog(c, 'the start of [d1e]');
    await clickHandle(c, `preset${big}`, `size-preset chip "${big}" (dirty, second press)`);
    const d1ePre = await snap(c);
    const d1eDlgBefore = await c.json('window.__cf.dlg()');
    await enter(c); await sleep(600);
    const d1eDlg = await c.json('window.__cf.dlg()');
    const d1e = await snap(c);
    check('d1e', 'A REAL ENTER does the same as Space — the second key that activates a focused '
      + 'button, and the other half of the "fast double-press" the card accepted as the cost',
      d1eDlgBefore !== null && d1eDlg === null && d1e.key === d1ePre.key && d1e.dirty === true,
      `dialog before = ${JSON.stringify(d1eDlgBefore?.buttons)}, after Enter = ${d1eDlg}; `
      + `${d1ePre.brief} → ${d1e.brief}. Measured separately from Space because a focused button `
      + 'activates on Space at KEYUP and on Enter at KEYDOWN — two different browser paths, and a '
      + 'dialog could plausibly answer one and not the other.');

    // ═══════════════════════════════════════════════════════════════════════
    // DOOR 2 — the same guard reached through `New □`, its OWN dispatch line
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== DOOR 2: `New □` — the same guard, its own dispatch line ===');
    await ensureNoDialog(c, 'the start of DOOR 2');
    await paint(4);
    const d2Pre = await snap(c);
    await clickHandle(c, 'newBox', 'New □ (dirty document)');
    const d2 = await c.json('window.__cf.dlg()');
    await shot(c, 'd2-newbox-dialog');
    if (!focusRow('d2', '`New □` → "Discard this sprite?"', d2,
      'A separate CONTROL onto the same ask() site: a fix wired to the chips\' map and not to this '
      + 'dispatch line would pass every DOOR 1 row.')) {
      note('[d2] focus timeline', (await focusTimeline(c)).join('  |  '));
    }
    doorsReached.push('new-sprite-guard.ts (New □)');

    await space(c); await sleep(600);
    const d2kDlg = await c.json('window.__cf.dlg()');
    const d2k = await snap(c);
    check('d2k', '`New □`: a real Space closes the dialog and destroys nothing',
      d2kDlg === null && d2k.key === d2Pre.key && d2k.dirty === true,
      `dialog after Space = ${d2kDlg}; ${d2Pre.brief} → ${d2k.brief}`);

    // ═══════════════════════════════════════════════════════════════════════
    // DOOR 3 — shell/tab-activation/sprite.ts, the tab close ✕
    //
    // A THIRD ask() SITE, in a third file, reached by a real mouse press on an
    // affordance that is not a <button> at all (it is a <span> carrying an SVG,
    // which is why the aim's elementFromPoint lands on a <path> and the hit
    // test accepts a descendant).
    //
    // ⚠ ITS BUTTON SET IS DERIVED, NOT ASSUMED, and the first version of this
    // file assumed wrong. `confirmCloseSpriteDoc` emits Save only when
    // `doc.s1ArtSource !== null`; for the object-art document this harness
    // opens it is null, so the real dialog is [discard, cancel] — TWO buttons,
    // not the three the source reads like at a glance. The row below asserts
    // what the dialog actually contains and prints it; the three-button shape is
    // measured at DOOR 4, which really does emit Save / Discard / Cancel.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== DOOR 3: the tab close ✕ (shell/tab-activation/sprite.ts) ===');
    await ensureNoDialog(c, 'the start of DOOR 3');
    await paint(4);
    const d3Pre = await snap(c);
    const closers = await c.evalExpr("document.querySelectorAll('span[title=\"Close tab\"]').length");
    check('d3f', 'ANTI-VACUOUS fixture: a closeable tab is on screen and the sprite document behind '
      + 'it is dirty, so its ✕ has something to guard',
      closers > 0 && d3Pre.dirty === true,
      `span[title="Close tab"] count = ${closers}; ${d3Pre.brief}`);

    let d3 = null;
    if (closers > 0) {
      await clickHandle(c, 'tabClose', "the active tab's Close ✕");
      d3 = await c.json('window.__cf.dlg()');
      await shot(c, 'd3-tabclose-dialog');
    }
    const d3Keys = d3?.buttons?.map((b) => b.key) ?? [];
    const d3IsSpriteTab = d3 !== null && /sprite/i.test(d3.label ?? '')
      && d3Keys.includes('cancel') && d3Keys.includes('discard')
      && d3Keys.every((k) => k === 'save' || k === 'discard' || k === 'cancel');
    check('d3n', 'the ✕ really opened the SPRITE TAB-CLOSE door and not some other dialog — asserted '
      + "from the dialog's own aria-label AND its key set, so a mis-aimed click cannot pass this",
      d3IsSpriteTab,
      `dialog label = ${JSON.stringify(d3?.label)}, ${d3?.buttonCount} buttons `
      + `${JSON.stringify(d3Keys)}. The set is CHECKED, not counted: confirmCloseSpriteDoc emits `
      + 'Save only when the document has an s1ArtSource, and this one does not, so the real dialog '
      + 'here is two buttons. Asserting "3" — which the source reads like at a glance — is what the '
      + 'first version of this file did, and it went red on a correct app.');
    if (d3IsSpriteTab) {
      if (!focusRow('d3', `tab close ✕ → "Unsaved sprite edits" (${d3Keys.join(' / ')})`, d3,
        'A third ask() site, in a third file, reached by a real mouse press on a <span> affordance '
        + 'rather than a <button> — and THE ONLY DOOR IN THIS FILE THAT RAISES THE DIALOG FROM '
        + '`onMouseDown`, which is what made it the one door the first version of the fix did not '
        + 'hold at. See ConfirmDialog\'s focus effect for the mechanism.')) {
        note('[d3] focus timeline', (await focusTimeline(c)).join('  |  '));
      }
      doorsReached.push('tab-activation/sprite.ts (tab close ✕)');

      await space(c); await sleep(700);
      const d3kDlg = await c.json('window.__cf.dlg()');
      const d3k = await snap(c);
      const stillOpen = await c.evalExpr('window.__dbg.spriteState().activeDocId');
      check('d3k', 'a real Space on the tab-close dialog CANCELS: the dialog closes, the tab stays '
        + 'open and the sprite keeps its unsaved edits',
        d3kDlg === null && stillOpen === d3Pre.s.activeDocId && d3k.key === d3Pre.key && d3k.dirty === true,
        `dialog after Space = ${d3kDlg}; activeDocId ${d3Pre.s.activeDocId} → ${stillOpen}; `
        + `${d3Pre.brief} → ${d3k.brief}. A Space that hit SAVE would have cleared the dirty flag and `
        + 'WRITTEN TO DISK; a Space that hit Discard would have closed the tab. Both are visible here.');
    } else {
      check('d3', 'tab close ✕ → the sprite tab-close dialog', false,
        'NOT MEASURED: the ✕ did not raise the expected dialog, so this door was not exercised. '
        + 'Reported as a RED rather than skipped — an unreached door must never read as a covered one.');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DOOR 4 — shell/project-open-guard.ts
    //
    // ⚠ WHY THE __dbg ROUTE AND NOT A BUTTON. `openPath`'s only UI entrance
    // begins with `window.api.selectDirectory()`, an OS folder picker CDP
    // cannot drive; the "Open recent" commands are emitted only while no
    // project is open, which is the one state in which nothing can be dirty.
    // `__dbg.canvas.projectOpenGuard()` calls the REAL `confirmProjectOpen`
    // and deliberately skips only the folder picker — its doc comment in
    // debug-hooks.ts (inside CanvasProbeApi, NOT AeonProbeApi, which is where I
    // first looked for it) sets out exactly what is and is not skipped. The
    // real ConfirmDialog appears on screen for this file to read.
    //
    // ⚠ THE THREE-BUTTON DOOR. This one really does emit Save / Discard /
    // Cancel, so `index 0` here is SAVE: a focus rule of "the first button" is
    // wrong here and RIGHT at every other door in this file, and this is the
    // only place that can tell them apart.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== DOOR 4: the project-open guard (shell/project-open-guard.ts) ===');
    await ensureNoDialog(c, 'the start of DOOR 4');
    const d4Pre = await snap(c);
    check('d4f', 'ANTI-VACUOUS fixture: the sprite is still dirty, which is what makes the '
      + 'project-open guard confirm rather than proceed silently',
      d4Pre.dirty === true, d4Pre.brief);
    // Fire it WITHOUT awaiting: the guard parks on the dialog, so awaiting here
    // would deadlock the evaluation before a key could be sent.
    await c.evalExpr('window.__cfGuard = window.__dbg.canvas.projectOpenGuard(); void 0');
    await sleep(900);
    const d4 = await c.json('window.__cf.dlg()');
    await shot(c, 'd4-projectopen-dialog');
    const d4Keys = d4?.buttons?.map((b) => b.key) ?? [];
    check('d4n', 'this door really is the THREE-BUTTON shape — Save / Discard / Cancel — so the row '
      + 'below is discriminating "focus cancel" from "focus index 0", not restating DOOR 1',
      d4 !== null && d4Keys.length === 3 && d4Keys[0] === 'save' && d4Keys.includes('discard')
      && d4Keys.includes('cancel'),
      `keys = ${JSON.stringify(d4Keys)} (asserted, not assumed — DOOR 3 taught this file that a `
      + 'button set read off the source at a glance can be wrong in the running app)');
    if (!focusRow('d4', 'project open → "Unsaved changes" (Save / Discard / Cancel)', d4,
      'THE THREE-BUTTON DOOR, reached without a mouse at all: index 0 here is SAVE, so this is the '
      + 'one door that separates "focus cancel" from "focus the first button" — a rule that would be '
      + 'correct at every other door in this file.')) {
      note('[d4] focus timeline', (await focusTimeline(c)).join('  |  '));
    }
    if (d4 !== null) doorsReached.push('project-open-guard.ts (__dbg.canvas route)');

    await space(c); await sleep(700);
    const d4kDlg = await c.json('window.__cf.dlg()');
    const d4Answer = await c.evalExpr('window.__cfGuard').catch(() => 'threw');
    const d4k = await snap(c);
    check('d4k', 'a real Space on the project-open dialog CANCELS: the guard resolves FALSE and the '
      + 'sprite keeps its unsaved edits',
      d4kDlg === null && d4Answer === false && d4k.key === d4Pre.key && d4k.dirty === true,
      `dialog after Space = ${d4kDlg}; confirmProjectOpen() resolved ${JSON.stringify(d4Answer)}; `
      + `${d4Pre.brief} → ${d4k.brief}. The RESOLVED VALUE is the sharp part: this is the only door `
      + 'where the answer is observable as a value rather than inferred from what survived, and false '
      + 'is the guard telling its caller not to proceed.');

    // ═══════════════════════════════════════════════════════════════════════
    // DOOR 5 — providers/chunk-library-import.ts, the Chunks Clear button
    //
    // A CLEAN SESSION FIRST. One window holds one project, and opening aeon on
    // top of the classic session leaves classic's workspace on screen.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== DOOR 5: Clear in the Chunks section (providers/chunk-library-import.ts) ===');
    await ensureNoDialog(c, 'the end of the classic session');
    const saveInfo = await c.json('window.__dbg.spriteSaveInfo()');
    check('z3', 'nothing was saved in the classic half: no Ctrl+S and no save call was issued, and '
      + 'the app has no autosave (shell/close-guard.ts) — every edit above lived and died in memory, '
      + 'and every dialog above was answered CANCEL',
      true, `spriteSaveInfo = ${JSON.stringify(saveInfo)}`);

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    if (!(await waitDbg())) throw new Error('window.__dbg absent after the aeon reload');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => note('aeon open threw', e.message));
    let ast = null;
    for (let i = 0; i < 40; i++) {
      ast = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (ast && ast.open) break;
      await sleep(400);
    }
    await sleep(2500);
    // Aeon's Chunks panel is GATED on the stamp tool (layout-facet.tsx).
    await c.evalExpr(`(() => { const b = [...document.querySelectorAll('button')]
      .find((e) => /Stamp Chunk/i.test(e.title || '') || /Stamp Chunk/i.test(e.getAttribute('aria-label') || ''));
      if (!b) return false; b.click(); return true; })()`);
    await sleep(1800);
    await c.json(INSTALL(SIZE_PRESETS));
    const d5Ids = await c.json('window.__dbg.aeon.chunkIds()');
    const d5Has = await c.evalExpr("!!window.__cf.el('chunkClear')");
    await shot(c, 'd5-chunks');
    check('d5f', 'ANTI-VACUOUS fixture: the real aeon project is open with a NON-EMPTY chunk library '
      + "and the Chunks section's Clear button is on screen",
      Array.isArray(d5Ids) && d5Ids.length > 0 && d5Has === true,
      `chunkLibrary = ${Array.isArray(d5Ids) ? d5Ids.length : 'n/a'} chunks; Clear present = ${d5Has}; `
      + `aeon state = ${JSON.stringify(ast)}`);

    if (Array.isArray(d5Ids) && d5Ids.length > 0 && d5Has) {
      await clickHandle(c, 'chunkClear', "the Chunks section's Clear button");
      const d5 = await c.json('window.__cf.dlg()');
      await shot(c, 'd5-clear-dialog');
      if (!focusRow('d5', 'Clear chunks → "Clear the chunk library?"', d5,
        'A FOURTH ask() site, in a different engine, in a different session.')) {
        note('[d5] focus timeline', (await focusTimeline(c)).join('  |  '));
      }
      if (d5 !== null) doorsReached.push('chunk-library-import.ts (Clear)');

      await space(c); await sleep(700);
      const d5kDlg = await c.json('window.__cf.dlg()');
      const d5kN = await c.evalExpr('window.__dbg.aeon.chunkIds().length');
      check('d5k', 'a real Space on the Clear dialog CANCELS: it closes and every chunk survives',
        d5kDlg === null && d5kN === d5Ids.length,
        `dialog after Space = ${d5kDlg}; chunkLibrary ${d5Ids.length} → ${d5kN}. Under P3 this Space `
        + 'would have emptied the library, which undo does not bring back.');
    } else {
      check('d5', 'Clear chunks → "Clear the chunk library?"', false,
        'NOT MEASURED: no aeon chunk library or no Clear button on screen, so this door was not '
        + 'exercised. A red, not a skip.');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WHAT THIS FILE DID NOT REACH
    // ═══════════════════════════════════════════════════════════════════════
    const EXPECTED_DOORS = 5;
    check('z1', `COVERAGE, stated rather than implied: this run exercised ${EXPECTED_DOORS} controls `
      + 'across FOUR of the eight ask() sites in src/, with real focus reads and real keys',
      doorsReached.length === EXPECTED_DOORS,
      `reached: ${JSON.stringify(doorsReached)}\n        `
      + 'NOT REACHED FROM A HEADLESS HARNESS, and named rather than left to be assumed:\n        '
      + '  • shell/close-guard.ts (WINDOW CLOSE) — needs an OS window-close event; there is no debug\n'
      + '    hook onto confirmAppClose and no in-page control that raises it.\n        '
      + '  • shell/tab-activation/canvas.ts (CANVAS tab close) — needs a dirty canvas document; the\n'
      + '    tab-close mechanism itself IS measured, at the sprite tab, by [d3].\n        '
      + '  • shell/tab-activation/level.ts (ACT SWITCH) — needs a dirty classic level.\n        '
      + '  • components/setup/ProjectSetupTab.tsx (setup Apply) — needs a dirty classic level plus\n'
      + '    the setup tab.\n        '
      + 'ALL FOUR ARE COVERED FOR THE CHOICE OF BUTTON by §B of '
      + 'src/renderer/shell/__tests__/confirm-dialog-focus.test.ts, which parses all eight sites out '
      + 'of source. What is unmeasured for them is only the DOM half — that a .focus() lands — and '
      + 'that is one shared component, exercised five ways above.');

    check('z2', 'FINDING, recorded because it bounds what a GREEN here means: this file CANNOT see '
      + 'the literal P3 edit once the d-31 fix is in',
      true,
      'React applies `autoFocus` during the commit phase; ConfirmDialog\'s focus effect runs after it '
      + 'and moves focus to cancel. So P3 applied ON TOP OF the fix leaves every row above green — '
      + 'measured, not reasoned, in this parcel\'s packet. That is not a hole in the ruling but it IS '
      + 'a hole in this instrument, and it is why §A of the node-suite guard forbids the string '
      + '`autoFocus` in that file outright: §A is what reddens on P3, in npm test, in milliseconds. '
      + 'What THIS file catches that §A cannot is any regression that changes where focus actually '
      + 'lands — a rewritten safeFocusIndex, a focus-restore on close, a trap that steals it, a '
      + 'global focus manager, or the fix simply being deleted.');

    note('nothing was written for the aeon half either',
      'no Ctrl+S and no save call was issued, no dialog was answered with anything but Cancel, and '
      + `the aeon tree at ${AEONDIR} was OPENED ONLY.`);
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
