#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// d-29 + d-30 IN THE REAL APP — does it ask, and does it SHUT UP when nothing
// would be lost?
//
//     npm run harness:confirm-destroy
//
// ⚠ WHO RULED THESE. Both cards were answered BY THE SUITE HUB IN THE OWNER'S
// PLACE under a standing delegation, NOT by the owner, and are explicitly
// overturnable on his read-back. `docs/decisions.jsonl`,
// `d-29-new-sprite-clears-undo-answered` and `d-30-chunk-library-clear-answered`.
//
//   d-29 `guard_when_dirty`  the sprite size chips + `New □` ask before
//                            replacing a sprite that has unsaved edits.
//   d-30 `confirm_before`    Clear in the Chunks section asks before emptying
//                            the chunk library.
//
// ═══ WHY A CDP HARNESS AT ALL ═════════════════════════════════════════════
//
// The node suite cannot see React, a dialog, or a click: ~6,950 vitest rows go
// green here while a feature is visibly broken.
// `src/renderer/shell/__tests__/confirm-before-destroying.test.ts` drives the
// stores directly and proves the BRANCH; it cannot prove that a button is wired
// to the guard, that a real mouse press reaches it, that `ConfirmDialog`
// renders, or that Cancel is clickable. This file presses the real controls in
// the real app and reads the real DOM.
//
// ═══ THE ROW THAT ACTUALLY DISCRIMINATES ══════════════════════════════════
//
// A confirmation dialog is the exact shape of a guard that asserts nothing:
// "the dialog appeared" is passed by an implementation that confirms
// UNCONDITIONALLY, which is not what either card answered. The shared principle
// of both rulings is *ask before destroying, AND ONLY WHEN SOMETHING WOULD
// ACTUALLY BE LOST* — a clean document sees no dialog at all, which is what
// keeps this consistent with the owner's own d-27 pick rather than a new
// pattern imposed on him.
//
// So the `[c*]` rows are the ones this file exists for: a CLEAN sprite document
// is clicked and NO DIALOG IS EVER PRESENT while the action still happens. They
// are measured with a `MutationObserver` armed BEFORE the press (see
// `watchStart`), not with a single sample afterwards — a sample after the fact
// cannot tell "never appeared" from "appeared and closed".
//
// ⚠ AND THE OBSERVER NEEDS ITS OWN POSITIVE CONTROL, or "no dialog was seen" is
// just an absence. The `[n*]` rows run FIRST, on the SAME watcher, and each one
// reports `seen=true`. A run whose `[n*]` rows are green is a run in which the
// detector demonstrably fires.
//
// ═══ REAL INPUT, INTEGER PIXELS ═══════════════════════════════════════════
//
// ⚠ NOT `el.click()`. A synthetic click is not a click: if the app does not
// listen for the event dispatched, it no-ops, every later reading comes off the
// previous screen, and the row reports success forever. Everything here goes
// through `Input.dispatchMouseEvent` press/release and `Input.dispatchKeyEvent`.
//
// ⚠ `devicePixelRatio` under Xvfb on this machine has been observed at BOTH 1
// and 1.35 within one session. At 1.35 rects are fractional and a harness
// asking for a position that does not exist on the device grid presents as an
// off-by-one in the feature when the feature is fine. Every aim is rounded to
// integer client pixels BEFORE it is sent, verified with `elementFromPoint`,
// and the dpr and the derived aim are PRINTED. A miss REFUSES rather than
// clicking whatever is underneath and calling the result a measurement.
//
// ⚠ THE DIALOG'S BACKDROP IS `position: fixed; inset: 0`. So an aim at a chip
// while a dialog stands lands on the backdrop and this refuses — which is a
// feature, not a nuisance: it is impossible for this file to silently measure a
// press that the modal ate.
//
// ═══ IT WRITES NOTHING TO DISK ════════════════════════════════════════════
//
// No Ctrl+S, no save call, and the app has no autosave (`shell/close-guard.ts`).
// The sprite half edits an S1 document in memory and throws it away; the chunk
// half empties the chunk library in memory. `AEON_DIR` and `S1DIR` are OPENED
// ONLY. `[z1]` reports the sprite save state at the end.
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

const PORT = Number(process.env.PORT ?? 9481);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const S1DIR = siblingPathOrUnresolved('s1disasm');   // OPEN ONLY — never written
const AEONDIR = siblingPathOrUnresolved('aeon');     // OPEN ONLY — never written
const SHOTS = join(ROOT, 'scratchpad/shots-confirm-destroy');
mkdirSync(SHOTS, { recursive: true });

// ── the two size constants, READ OUT OF THE COMPONENTS, never pinned here ───
//
// A `[16,24,32,48,64]` or a `32` typed into this file is the copied-pin defect
// this repo keeps paying for: the day someone edits either constant, a pinned
// copy makes a handle resolve to nothing and the run dies with a confusing AIM
// REFUSED instead of saying the constant moved. `NEW_BOX_SIZE` matters twice
// over — `[c2]` needs `New □`'s size to DIFFER from the size `[c1]` left on
// screen, or an idempotent press could not tell a live chip from a dead one.
const TOOLOPTS_SRC = join(ROOT, 'src/renderer/shell/SpriteToolOptions.tsx');
const SPRITEMODE_SRC = join(ROOT, 'src/renderer/components/sprite/SpriteMode.tsx');
function sizePresets() {
  const m = /const SIZE_PRESETS = \[([0-9,\s]+)\]/.exec(readFileSync(TOOLOPTS_SRC, 'utf8'));
  if (!m) throw new Error(`could not read SIZE_PRESETS out of ${TOOLOPTS_SRC}`);
  return m[1].split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}
function newBoxSize() {
  const m = /const \[newSize, setNewSize\] = useState\((\d+)\)/.exec(readFileSync(SPRITEMODE_SRC, 'utf8'));
  if (!m) throw new Error(`could not read the newSize default out of ${SPRITEMODE_SRC}`);
  return Number(m[1]);
}
const SIZE_PRESETS = sizePresets();
const NEW_BOX_SIZE = newBoxSize();

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
const escape = (c) => key(c, 'Escape', 'Escape', 27);

/**
 * A REAL CLICK ON A REAL ELEMENT, aimed at integer client pixels and verified
 * with the browser's own hit testing before a single event is sent.
 *
 * The three refusals are all failures this file would otherwise report as a
 * feature bug: a handle that resolved to nothing, an element scrolled outside
 * the window, and an integer aim that lands on something else (the dialog
 * backdrop being the one that matters here).
 */
async function clickHandle(c, handle, label) {
  const geom = await c.json(String.raw`(() => {
    const el = window.__cd.el(${JSON.stringify(handle)});
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
      + `${geom.vw}x${geom.vh} window. A rect with non-zero width says nothing about whether it is `
      + 'on screen; dispatching into space would read as a dead control.');
  }
  const hit = await c.json(String.raw`(() => {
    const want = window.__cd.el(${JSON.stringify(handle)});
    const el = document.elementFromPoint(${x}, ${y});
    return { tag: el ? el.tagName : null, text: el ? (el.textContent || '').trim().slice(0, 32) : null,
             isTarget: el === want };
  })()`);
  note(`aim: ${label} [${handle}]`,
    `dpr=${geom.dpr} rect=(${geom.left},${geom.top},${geom.w}x${geom.h}) → integer client (${x},${y}) · `
    + `target text="${geom.text}" title=${JSON.stringify(geom.title)} disabled=${geom.disabled} · `
    + `elementFromPoint = <${hit.tag}> "${hit.text}" · isTarget=${hit.isTarget}`);
  if (!hit.isTarget) {
    throw new Error(`AIM REFUSED: integer (${x},${y}) for "${label}" [${handle}] lands on <${hit.tag}> `
      + `"${hit.text}", not the handle. Clicking it would measure something else. (A dialog's backdrop `
      + 'is `position: fixed; inset: 0`, so this is what a press eaten by a modal looks like.)');
  }
  await mouse(c, 'mousePressed', x, y);
  await sleep(40);
  await mouse(c, 'mouseReleased', x, y);
  await sleep(500);
  return { x, y };
}

/**
 * THE IN-PAGE HANDLE TABLE AND THE DIALOG WATCHER.
 *
 * Every handle is STRUCTURAL, never a screen position and never a bare text
 * match:
 *
 *  - the preset chips are the ONE `<span>` whose children are exactly
 *    `SIZE_PRESETS.length` buttons reading exactly those numbers. A bare
 *    `textContent === '32'` is NOT safe: FrameGrid renders a cell button per
 *    frame whose text is its index, so frame 32's thumbnail reads "32" too.
 *  - `newBox` is the only button reading `New □`.
 *  - `chunkClear` is the SECOND button of the two-button group whose FIRST
 *    button's text starts with "Import" — i.e. `AeonChunkActions`'s own wrap,
 *    and not any other button in the app that says "Clear". The app has several
 *    (`Clear palette`, `Clear canvas`, the collision palette's `Clear`), and a
 *    text match would have found whichever the layout put first.
 *  - `dlg:<label>` is a button INSIDE the `role="alertdialog"` whose text is
 *    exactly `<label>`, so answering the dialog can never hit the page behind
 *    it.
 *
 * `watchStart` / `watchStop` are the `[c*]` rows' instrument. A single sample
 * after a click cannot tell "no dialog ever appeared" from "a dialog appeared
 * and went"; the observer runs from before the press to after it and latches.
 * It seeds itself with a direct check so a dialog ALREADY standing counts.
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

  let obs = null, seen = false;
  window.__cd = {
    dialog,
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
        return [...dl.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === d[1]) || null;
      }
      if (h === 'newBox') return btns().find((b) => (b.textContent || '').trim() === 'New □') || null;
      if (h === 'chunkClear') { const w = chunkActions(); return w ? w.children[1] : null; }
      if (h === 'chunkImport') { const w = chunkActions(); return w ? w.children[0] : null; }
      return null;
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
    focusIsHandle(h) { return document.activeElement === this.el(h); },
    activeBrief() {
      const a = document.activeElement;
      return a ? '<' + a.tagName + '> "' + (a.textContent || '').trim().slice(0, 24) + '"' : 'null';
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
    presetCount() { const b = presetBox(); return b ? b.children.length : -1; },
    hasChunkClear() { return !!this.el('chunkClear'); },
  };
  return { presets: window.__cd.presetCount(), dialogNow: !!dialog() };
})()`;

/** Everything about the sprite document a press at these sites could move. */
async function snap(c) {
  const s = await c.json('window.__dbg.spriteState()');
  return {
    s,
    dirty: s.unsavedEdits,
    key: JSON.stringify({ frames: s.frames, w: s.frameW, h: s.frameH, hashes: s.frameHashes,
      steps: s.steps }),
    brief: `frames=${s.frames} ${s.frameW}x${s.frameH} cov0=${s.frameCoverage[0]} dirty=${s.unsavedEdits}`,
  };
}

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS, and a run that cannot show its
  // bundle fresh refuses rather than proceeding.
  assertFreshBuild(RUN);
  if (!existsSync(join(S1DIR, 'artunc/Sonic.unc'))) {
    throw new Error(`${S1DIR}/artunc/Sonic.unc missing — no s1disasm to open, nothing to measure`);
  }
  console.log(`\n=== constants read from source, never pinned here ===`);
  console.log(`  SIZE_PRESETS = ${JSON.stringify(SIZE_PRESETS)}  (${TOOLOPTS_SRC.replace(ROOT + '/', '')})`);
  console.log(`  New □ size   = ${NEW_BOX_SIZE}  (${SPRITEMODE_SRC.replace(ROOT + '/', '')})`);

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
    // Panel disclosure is persisted per author; a previous run's collapsed
    // section would hide a handle and read as a missing control.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3500);
    if (!(await waitDbg())) throw new Error('window.__dbg absent after reload');

    // ═══════════════════════════════════════════════════════════════════════
    // d-29 — the sprite size chips and `New □`
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
    check('b1', 'sprite mode is open on a real S1 document with more than one frame and NO unsaved '
      + 'edits — the clean fixture the [c*] rows need and the dirty fixture the [n*] rows build from',
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

    const paint = async (n) => {
      for (let i = 0; i < n; i++) await c.evalExpr(`window.__dbg.spritePaint(0, ${2 + i}, 3, ${1 + (i % 15)})`);
      await sleep(300);
    };
    const big = SIZE_PRESETS[SIZE_PRESETS.length - 1];
    const mid = SIZE_PRESETS[SIZE_PRESETS.length - 2];

    // ── [n*] the DIRTY document — and the watcher's positive control ───────
    console.log('\n=== [n*] a DIRTY sprite: the chips ask first (d-29 guard_when_dirty) ===');
    await paint(6);
    const n0 = await snap(c);
    check('n0', 'ANTI-VACUOUS fixture: the document really carries unsaved edits and painted pixels '
      + 'for the chip to destroy — a clean document would make every [n*] row below pass for the '
      + 'wrong reason',
      n0.dirty === true && n0.s.frameCoverage[0] > 0,
      `${n0.brief} — painted through __dbg.spritePaint, which moves no focus and clicks nothing`);

    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, `preset${big}`, `size-preset chip "${big}" (dirty document)`);
    const n1Info = await c.json('window.__cd.info()');
    const n1 = await snap(c);
    await shot(c, 'n1-dialog');
    check('n1', `shell/SpriteToolOptions.tsx size-preset chip "${big}" on a DIRTY document: a real `
      + 'click puts the confirm dialog on screen, it says what is lost, and THE DOCUMENT IS UNTOUCHED '
      + 'while it stands',
      n1Info !== null && /discard/i.test(n1Info.label ?? '') && /Ctrl\+Z/.test(n1Info.text ?? '')
      && n1.key === n0.key && n1.dirty === true,
      `dialog = ${JSON.stringify(n1Info)}; document ${n0.brief} → ${n1.brief} (fingerprint identical). `
      + 'The "untouched while it stands" half is IN THE CONDITION: a guard that asked and replaced '
      + 'anyway would satisfy a dialog-exists assertion perfectly. This row is also the POSITIVE '
      + "CONTROL for the [c*] rows' MutationObserver — it proves the detector fires.");

    await escape(c); await sleep(500);
    const n2Info = await c.json('window.__cd.info()');
    const n2 = await snap(c);
    const n2Seen = await c.evalExpr('window.__cd.watchStop()');
    check('n2', 'Esc answers the dialog as CANCEL: it closes and the sprite survives intact, dirty '
      + 'flag included',
      n2Info === null && n2.key === n0.key && n2.dirty === true && n2Seen === true,
      `dialog after Esc = ${n2Info}; ${n1.brief} → ${n2.brief}; the watcher armed before the press `
      + `reported seen=${n2Seen}. The dirty flag matters as much as the pixels: blankDoc CLEARS it, `
      + 'and a cleared flag is what silences the tab-close and project-open guards downstream.');

    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, `preset${big}`, `size-preset chip "${big}" (dirty, second press)`);
    const n3Pre = await c.json('window.__cd.info()');
    await clickHandle(c, 'dlg:Cancel', 'the dialog\'s Cancel button (a REAL click, not Esc)');
    const n3 = await snap(c);
    const n3Info = await c.json('window.__cd.info()');
    const n3Seen = await c.evalExpr('window.__cd.watchStop()');
    check('n3', 'CANCEL, clicked with the mouse, really keeps the work: every pixel, the frame size, '
      + 'the frame count and the dirty flag all survive',
      n3Pre !== null && n3Info === null && n3.key === n0.key && n3.dirty === true && n3Seen === true,
      `dialog before Cancel = ${JSON.stringify(n3Pre?.buttons)}, after = ${n3Info}; document `
      + `${n0.brief} → ${n3.brief}; watcher seen=${n3Seen}. Esc ([n2]) and a mouse click on Cancel are `
      + 'measured separately on purpose — the dialog answers them through two different code paths '
      + '(a window keydown listener, and the button\'s own onClick).');

    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, `preset${big}`, `size-preset chip "${big}" (dirty, third press)`);
    await clickHandle(c, 'dlg:Discard & start new', 'the dialog\'s Discard button');
    const n4 = await snap(c);
    const n4Info = await c.json('window.__cd.info()');
    const n4Seen = await c.evalExpr('window.__cd.watchStop()');
    await shot(c, 'n4-discarded');
    check('n4', 'DISCARD really proceeds: the document is replaced at the chip\'s size, the painted '
      + 'pixels are gone and the dirty flag is cleared',
      n4Info === null && n4.s.frameW === big && n4.s.frameH === big && n4.s.frames === 1
      && n4.s.frameCoverage[0] === 0 && n4.dirty === false && n4Seen === true,
      `${n0.brief} → ${n4.brief}; watcher seen=${n4Seen}. Without this row, "the dialog appears" and `
      + '"the chip is dead" would be the same artifact.');

    // ── [c*] THE ROWS THIS FILE EXISTS FOR ────────────────────────────────
    console.log('\n=== [c*] a CLEAN sprite: NO dialog at all, and the action still happens ===');
    note('why these rows are the discriminating ones',
      'both rulings say "ask before destroying, AND ONLY WHEN SOMETHING WOULD ACTUALLY BE LOST". An '
      + 'implementation that confirms unconditionally passes every [n*] row above and fails the '
      + 'ruling. These are the rows it fails. The MutationObserver is armed BEFORE the press and '
      + 'latches, so "never appeared" is distinguishable from "appeared and closed" — and [n1]-[n4] '
      + 'above proved, in this same run, that it fires when a dialog does appear.');
    const c1Pre = await snap(c);
    check('c0', 'ANTI-VACUOUS fixture: the document [c1] presses on is genuinely CLEAN, so a dialog '
      + 'appearing here would be the defect and not the design',
      c1Pre.dirty === false,
      `${c1Pre.brief} — left clean by [n4]'s discard, which is how an author reaches this state too`);

    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, `preset${mid}`, `size-preset chip "${mid}" (CLEAN document)`);
    const c1Seen = await c.evalExpr('window.__cd.watchStop()');
    const c1 = await snap(c);
    check('c1', `shell/SpriteToolOptions.tsx size-preset chip "${mid}" on a CLEAN document: NO DIALOG `
      + 'was ever on screen, and the chip still replaced the document',
      c1Seen === false && c1.s.frameW === mid && c1.s.frameH === mid && c1.dirty === false,
      `watcher seen=${c1Seen} (armed before the press, latching, disconnected after); document `
      + `${c1Pre.brief} → ${c1.brief}. The "still replaced" half is IN THE CONDITION: a chip wired to `
      + 'nothing at all would also show no dialog. A DIFFERENT chip from [n1]-[n4] on purpose — the '
      + `presets render from one map, and a press of "${big}" again would have been idempotent.`);

    const c2Pre = await snap(c);
    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, 'newBox', 'New □ (CLEAN document — its OWN dispatch line)');
    const c2Seen = await c.evalExpr('window.__cd.watchStop()');
    const c2 = await snap(c);
    check('c2', '`New □` on a CLEAN document: NO DIALOG either, and it still replaced the document — '
      + 'its own dispatch line, twenty lines from the chips\' map',
      c2Seen === false && NEW_BOX_SIZE !== mid && c2.s.frameW === NEW_BOX_SIZE
      && c2.s.frameH === NEW_BOX_SIZE && c2.dirty === false,
      `watcher seen=${c2Seen}; ${c2Pre.brief} → ${c2.brief}. The size moved ${mid} → ${NEW_BOX_SIZE}, `
      + `which is what makes this discriminating: New □'s size (${NEW_BOX_SIZE}, read from `
      + `${SPRITEMODE_SRC.replace(ROOT + '/', '')}) DIFFERS from the size [c1] left on screen, so an `
      + 'idempotent no-op could not be mistaken for a live chip. The inequality is asserted, not assumed.');

    // ── [n5]/[n6] `New □` DIRTY — its own dispatch line, both answers ──────
    console.log('\n=== [n5]/[n6] `New □` on a DIRTY sprite — the second dispatch line ===');
    await paint(6);
    const n5Pre = await snap(c);
    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, 'newBox', 'New □ (dirty document)');
    const n5Info = await c.json('window.__cd.info()');
    await clickHandle(c, 'dlg:Cancel', 'the dialog\'s Cancel button');
    const n5 = await snap(c);
    const n5Seen = await c.evalExpr('window.__cd.watchStop()');
    check('n5', '`New □` on a DIRTY document asks first, and Cancel keeps the work — measured on its '
      + 'OWN dispatch line, because a guard wired to the chips\' map and not to this one would pass '
      + 'every [n1]-[n4] row',
      n5Pre.dirty === true && n5Pre.s.frameCoverage[0] > 0 && n5Info !== null
      && /discard/i.test(n5Info.label ?? '') && n5.key === n5Pre.key && n5.dirty === true
      && n5Seen === true,
      `fixture ${n5Pre.brief}; dialog = ${JSON.stringify(n5Info)}; after Cancel ${n5.brief} `
      + `(fingerprint identical); watcher seen=${n5Seen}`);

    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, 'newBox', 'New □ (dirty, second press)');
    await clickHandle(c, 'dlg:Discard & start new', 'the dialog\'s Discard button');
    const n6 = await snap(c);
    const n6Info = await c.json('window.__cd.info()');
    const n6Seen = await c.evalExpr('window.__cd.watchStop()');
    check('n6', '`New □` DISCARD proceeds: the painted pixels are gone and the dirty flag is cleared',
      n6Info === null && n6.s.frameCoverage[0] === 0 && n6.dirty === false
      && n6.s.frameW === NEW_BOX_SIZE && n6Seen === true,
      `${n5.brief} → ${n6.brief}; watcher seen=${n6Seen}`);

    const saveInfo = await c.json('window.__dbg.spriteSaveInfo()');
    check('z1', 'nothing was saved: no Ctrl+S and no save call was issued, and the app has no '
      + 'autosave (shell/close-guard.ts) — every edit above lived and died in memory',
      true,
      `spriteSaveInfo = ${JSON.stringify(saveInfo)}`);

    // ═══════════════════════════════════════════════════════════════════════
    // d-30 — Clear in the Chunks section
    //
    // A CLEAN SESSION FIRST. One window holds one project, and opening aeon on
    // top of the classic session leaves classic's workspace on screen — a
    // hazard chunkgrid-hint-harness.mjs paid for with four green rows that were
    // measuring classic twice. [k0] re-derives the engine from the chunk
    // library itself, so that cannot pass silently here.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== d-30: Clear in the Chunks section (aeon) ===');
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
    // Aeon's Chunks panel is GATED on the stamp tool (layout-facet.tsx) — unlike
    // classic, which mounts its picker unconditionally. Arm the tool or there is
    // no Clear button on screen and [k0] reports "not found" rather than a
    // clean bill.
    await c.evalExpr(`(() => { const b = [...document.querySelectorAll('button')]
      .find((e) => /Stamp Chunk/i.test(e.title || '') || /Stamp Chunk/i.test(e.getAttribute('aria-label') || ''));
      if (!b) return false; b.click(); return true; })()`);
    await sleep(1800);
    await c.json(INSTALL(SIZE_PRESETS));
    const k0Ids = await c.json('window.__dbg.aeon.chunkIds()');
    const k0Has = await c.evalExpr('window.__cd.hasChunkClear()');
    await shot(c, 'k0-chunks');
    check('k0', 'ANTI-VACUOUS fixture: the real aeon project is open with a NON-EMPTY chunk library, '
      + 'and the Chunks section\'s Clear button is on screen — the one thing d-30 is about',
      Array.isArray(k0Ids) && k0Ids.length > 0 && k0Has === true,
      `chunkLibrary = ${Array.isArray(k0Ids) ? k0Ids.length : 'n/a'} chunks; Clear button present = `
      + `${k0Has}; aeon state = ${JSON.stringify(ast)}. Reading the library through __dbg.aeon (which `
      + 'reads useProjectStore) is also what proves the AEON workspace is on screen and not classic\'s.');
    if (!Array.isArray(k0Ids) || k0Ids.length === 0 || !k0Has) {
      throw new Error('no aeon chunk library or no Clear button — every [k*] row would be vacuous');
    }
    const chunkCount = () => c.evalExpr('window.__dbg.aeon.chunkIds().length');

    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, 'chunkClear', 'the Chunks section\'s Clear button');
    const k1Info = await c.json('window.__cd.info()');
    const k1N = await chunkCount();
    await shot(c, 'k1-dialog');
    check('k1', 'components/AeonChunkActions.tsx Clear: a real click puts the confirm dialog on '
      + 'screen, it NAMES THE COUNT and names the undo, and the library is still whole while it stands',
      k1Info !== null && /clear the chunk library/i.test(k1Info.label ?? '')
      && (k1Info.text ?? '').includes(String(k0Ids.length)) && /[Uu]ndo/.test(k1Info.text ?? '')
      && k1N === k0Ids.length,
      `dialog = ${JSON.stringify(k1Info)}; chunkLibrary ${k0Ids.length} → ${k1N} (unchanged). The `
      + 'count comes from the store at ask time, so a body naming it is a body that read the real '
      + 'library rather than a fixed sentence.');

    await escape(c); await sleep(500);
    const k2Info = await c.json('window.__cd.info()');
    const k2N = await chunkCount();
    const k2Seen = await c.evalExpr('window.__cd.watchStop()');
    check('k2', 'Esc answers it as CANCEL and every chunk survives',
      k2Info === null && k2N === k0Ids.length && k2Seen === true,
      `dialog after Esc = ${k2Info}; chunkLibrary = ${k2N}; watcher seen=${k2Seen}`);

    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, 'chunkClear', 'Clear (second press)');
    const k3Pre = await c.json('window.__cd.info()');
    await clickHandle(c, 'dlg:Cancel', 'the dialog\'s Cancel button (a REAL click)');
    const k3N = await chunkCount();
    const k3Info = await c.json('window.__cd.info()');
    const k3Still = await c.evalExpr('window.__cd.hasChunkClear()');
    const k3Focus = await c.evalExpr('window.__cd.focusIsHandle("chunkClear")');
    const k3Active = await c.evalExpr('window.__cd.activeBrief()');
    const k3Seen = await c.evalExpr('window.__cd.watchStop()');
    check('k3', 'CANCEL, clicked with the mouse, keeps every chunk — AND the Clear button, which now '
      + 'SURVIVES ITS OWN PRESS, did not keep keyboard focus (d-27)',
      k3Pre !== null && k3Info === null && k3N === k0Ids.length && k3Still === true
      && k3Focus === false && k3Seen === true,
      `dialog before Cancel = ${JSON.stringify(k3Pre?.buttons)}, after = ${k3Info}; chunkLibrary = `
      + `${k3N}; Clear still mounted = ${k3Still}; activeElement = ${k3Active} (isTheClearButton=`
      + `${k3Focus}). THE FOCUS HALF IS NEW WITH d-30: before the confirm this button dropped focus by `
      + 'UNMOUNTING (hasChunks goes false the instant the library empties), which is why d-27\'s survey '
      + 'excluded it. The cancel path leaves it mounted, so the exemption expired and it now goes '
      + 'through actAndDropFocus like every other destructive control.');

    await c.evalExpr('window.__cd.watchStart()');
    await clickHandle(c, 'chunkClear', 'Clear (third press)');
    await clickHandle(c, 'dlg:Clear library', 'the dialog\'s Clear library button');
    const k4N = await chunkCount();
    const k4Info = await c.json('window.__cd.info()');
    const k4Seen = await c.evalExpr('window.__cd.watchStop()');
    await shot(c, 'k4-cleared');
    check('k4', 'CLEAR really proceeds: the chunk library goes to zero',
      k4Info === null && k4N === 0 && k4Seen === true,
      `chunkLibrary ${k0Ids.length} → ${k4N}; watcher seen=${k4Seen}. Without this row, "it asks" and `
      + '"it is dead" would be the same artifact.');

    const k5Has = await c.evalExpr('window.__cd.hasChunkClear()');
    check('k5', 'd-30\'s "nothing to lose" case is UNREACHABLE rather than silently confirming: with '
      + 'the library empty the Clear button is gone from the DOM entirely',
      k5Has === false,
      `Clear button present = ${k5Has}. AeonChunkActions gates it on hasChunks, so an author cannot `
      + 'reach a press that would destroy nothing. This is d-30\'s analogue of the [c*] rows — the '
      + 'guard\'s own count>0 arm is belt-and-braces for a future caller and is measured in the node '
      + 'suite (src/renderer/shell/__tests__/confirm-before-destroying.test.ts), because there is no '
      + 'button here to press.');
    note('nothing was written for the chunk half either',
      'no Ctrl+S and no save call was issued; clearChunkLibrary marks the editor dirty in memory and '
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
