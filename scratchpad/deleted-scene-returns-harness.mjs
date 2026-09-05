// ═══════════════════════════════════════════════════════════════════════════
// deleted-scene-returns — DOES A DELETE IN THE PANEL REACH THE DISK?
// ═══════════════════════════════════════════════════════════════════════════
//
// ── THE DEFECT THIS MEASURES ─────────────────────────────────────────────
//
// Reported in `docs/reviews/2026-09-05-sec7-ui-reauthor.md` finding 2, tripped
// over rather than hunted: the Parallax panel's `Delete scene` removes the
// scene from the SESSION, the save leaves its file on disk, and the scene is
// back on the next open. `buildAeonSavePlan` pushes a write for every scene IN
// the library and has no removal step at all. The identical loop writes the
// RASTER PRESETS, so the same shape is expected there and is measured here
// rather than assumed.
//
// ⚠ A ROW THAT ONLY ASKS THE MODEL WOULD PASS AGAINST THE BUG. The whole
// defect is "the library changed and the file did not", so every load-bearing
// row here reads the FILE SYSTEM: `existsSync`, and inode/mtime/size for the
// files that must NOT move. The model is asked too, but never alone.
//
// ── DISTRUST A CLEAN RESULT ──────────────────────────────────────────────
//
// A file that is absent is also what a harness looking at the WRONG DIRECTORY
// produces, and an inode that did not move is what a save that never ran
// produces. So:
//   [0b] every subject file is stamped BEFORE anything is driven and the stamps
//        are printed beside every later claim — an absence is only a finding
//        against a presence this run actually observed.
//   [1f] a bystander scene the author did NOT delete is asserted PRESENT with
//        its inode UNCHANGED. A save that deleted everything, and a harness
//        pointed at an empty temp dir, both fail that row.
//   [1g] two decoys the editor could never have loaded — a .json that will not
//        parse and a file that is not a scene at all — are asserted present.
//        This is the "open a project, save it, lose files you never touched"
//        scythe, and it is the failure mode the fix could INTRODUCE.
//   [5a] aeon's own checkout is stamped at the start and re-stamped at the end.
//        Everything here runs in throwaway copies under mktemp.
//
// ── RUN ──────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   ELECTRON_BIN=<main aurora checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:deleted-scene-returns
//
// AEON_DIR is OPTIONAL and, when set, is only ever READ: this harness builds
// its own writable clone under mktemp and never opens the resolved tree.

import {
  AURORA_DIR, siblingPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import {
  writeFileSync, readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, cpSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9538);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

/** aeon, THROUGH THE RESOLVER — read-only. Never opened by the app. */
const AEON_SRC = siblingPathOrUnresolved('aeon');

const EDITOR_REL = 'games/sonic4/data/editor/effects';
const PRESET_REL = `${EDITOR_REL}/presets`;

const VICTIM_SCENE = 'harness_victim_scene';
const BYSTANDER_SCENE = 'harness_bystander_scene';
const BORN_SCENE = 'harness_born_scene';
const UNSAVED_SCENE = 'harness_unsaved_scene';
const VICTIM_PRESET = 'harness_victim_preset';
const BYSTANDER_PRESET = 'harness_bystander_preset';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURED  [${id}] ${name}\n        ${why}`);
  unmeasured.push(`[${id}] ${name} — ${why}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}

function stamp(p) {
  if (!existsSync(p)) return 'ABSENT';
  const s = statSync(p);
  return `ino=${s.ino} mtimeMs=${Math.round(s.mtimeMs)} size=${s.size}`;
}
/** Inode only — the identity half of the stamp, for "this file did not move". */
function ino(p) {
  return existsSync(p) ? String(statSync(p).ino) : 'ABSENT';
}

function getJSON(path, timeoutMs = 1500) {
  return new Promise((res, rej) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (r) => {
      let d = ''; r.on('data', (ch) => (d += ch));
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', rej);
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
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${JSON.stringify(m.error)}`)) : res(m.result)));
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

async function mouse(c, type, x, y, button = 'left') {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button, buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlS = (c) => key(c, 's', 'KeyS', 83, 2);

/**
 * A REAL POINTER TARGET. ⚠ `element.click()` is not a click where the app
 * listens for pointer events; the rect comes back so the caller dispatches
 * press/release at INTEGER client pixels (dpr varies run to run on this box),
 * and the rect is compared to its SCROLLER's box rather than trusting
 * checkVisibility(), which goes green on an element scrolled far out of view.
 */
const RECT_BY = (re, tag = 'button', attr = 'textContent') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(${attr === 'title' ? '(e.getAttribute("title") || "")'
      : '(((e.textContent || "") + " " + (e.getAttribute("aria-label") || "")).trim())'}));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const sc = el.closest('[style*="overflow"]') || document.scrollingElement;
  const s = sc ? sc.getBoundingClientRect() : null;
  return {
    x: r.x, y: r.y, w: r.width, h: r.height, disabled: !!el.disabled,
    dpr: window.devicePixelRatio,
    scroller: s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null,
    insideScroller: s ? (r.top >= s.top - 1 && r.bottom <= s.bottom + 1) : null,
  };
})()`;

/**
 * Bring a control into its scroller before measuring it. The effects column is
 * a scroller and both pickers are lists inside it; a rect read without this is
 * a real rect for an element nobody can click, and the press lands on whatever
 * is at those coordinates instead — which is how [2b] failed the first time
 * this harness ran (`ensureSection -> still-closed`, and the preset half of the
 * defect went unmeasured while looking like a second failure).
 */
const SCROLL_INTO_VIEW = (re, tag = 'button', attr = 'textContent') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(${attr === 'title' ? '(e.getAttribute("title") || "")'
      : '(((e.textContent || "") + " " + (e.getAttribute("aria-label") || "")).trim())'}));
  if (!el) return 'no-element';
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  return 'ok';
})()`;

const RECT_BY_SELECTOR = (sel) => String.raw`
(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, disabled: !!el.disabled,
           dpr: window.devicePixelRatio };
})()`;

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/** The confirm dialog as the SCREEN holds it, or null when none is up. */
const CONFIRM_STATE = String.raw`
(() => {
  const p = document.querySelector('[role="alertdialog"]');
  if (!p) return null;
  const active = document.activeElement;
  return {
    title: p.getAttribute('aria-label'),
    text: (p.textContent || '').replace(/\s+/g, ' ').trim(),
    buttons: [...p.querySelectorAll('button[data-confirm-key]')]
      .map((b) => ({ key: b.getAttribute('data-confirm-key'), tone: b.getAttribute('data-tone'),
                     label: (b.textContent || '').trim(),
                     focused: b === active })),
    focusedKey: active && active.getAttribute
      ? active.getAttribute('data-confirm-key') : null,
    focusedTone: active && active.getAttribute ? active.getAttribute('data-tone') : null,
  };
})()`;

async function clickRect(c, rect) {
  const x = Math.round(rect.x + rect.w / 2);
  const y = Math.round(rect.y + rect.h / 2);
  await mouse(c, 'mousePressed', x, y);
  await mouse(c, 'mouseReleased', x, y);
  return { x, y };
}

/** THE GESTURE LEDGER — the last row asserts every drive said 'ok'. */
const driven = [];
async function drive(c, label, expr) {
  const r = await c.evalExpr(expr);
  driven.push({ label, r });
  if (r !== 'ok') note(`gesture "${label}" returned`, JSON.stringify(r));
  return r;
}

async function main() {
  // ═══ WHICH TREE IS ACTUALLY UNDER TEST — ASSERTED, NOT READ OFF A BANNER ═══
  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree — the app under test '
      + `would be ${RUN.root}, whose dist/ does not contain this worktree's edits. Set `
      + 'AURORA_BUILT_TREE, and give this tree a VITE_AURORA_DEBUG=1 npm run build.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);

  if (!existsSync(AEON_SRC)) {
    throw new Error(`aeon did not resolve to an existing tree (${AEON_SRC}) — this harness needs `
      + 'a project to clone. Set AEON_DIR or EMPYREAN_SUITE_ROOT.');
  }

  // ── THE CLONE. Only `project.json` and `games/` are copied (18M); nothing
  // the app writes can reach the resolved tree, which is opened by nothing.
  const WORK = mkdtempSync(join(tmpdir(), 'deleted-scene-returns-'));
  const CLONE = join(WORK, 'clone');
  mkdirSync(CLONE, { recursive: true });
  for (const rel of ['project.json', 'games']) {
    cpSync(join(AEON_SRC, rel), join(CLONE, rel), { recursive: true, dereference: false });
  }
  note('working copy', `${CLONE}\n        cloned (READ-ONLY) from ${AEON_SRC}`);

  const scenePath = (id) => join(CLONE, EDITOR_REL, `${id}.json`);
  const presetPath = (id) => join(CLONE, PRESET_REL, `${id}.json`);

  // ── THE SUBJECTS. Authored into the CLONE as setup, from the project's own
  // documents so they are real, canonical files the loader accepts.
  const donorScene = join(CLONE, EDITOR_REL, 'ojz_act1_start.json');
  const donorPreset = join(CLONE, PRESET_REL, 'ramp_probe.json');
  if (!existsSync(donorScene)) throw new Error(`clone has no donor scene at ${donorScene}`);
  if (!existsSync(donorPreset)) throw new Error(`clone has no donor preset at ${donorPreset}`);
  const reid = (text, from, to) =>
    `${text.replace(`"id": ${JSON.stringify(from)}`, `"id": ${JSON.stringify(to)}`).trimEnd()}\n`;
  const sceneDonorText = readFileSync(donorScene, 'utf8');
  const presetDonorText = readFileSync(donorPreset, 'utf8');
  for (const id of [VICTIM_SCENE, BYSTANDER_SCENE]) {
    writeFileSync(scenePath(id), reid(sceneDonorText, 'ojz_act1_start', id));
  }
  for (const id of [VICTIM_PRESET, BYSTANDER_PRESET]) {
    writeFileSync(presetPath(id), reid(presetDonorText, 'ramp_probe', id));
  }
  // ── THE DECOYS. Neither can ever be in the editor's LOADED set: one is a
  // .json the parser refuses (it lands in `unreadable`), the other is not a
  // .json at all and the loader skips it outright. A save that removed either
  // is the scythe this parcel must not build.
  const DECOY_BAD = join(CLONE, EDITOR_REL, 'zz_harness_unreadable.json');
  const DECOY_TXT = join(CLONE, EDITOR_REL, 'zz_harness_notes.txt');
  const DECOY_BAD_P = join(CLONE, PRESET_REL, 'zz_harness_unreadable.json');
  writeFileSync(DECOY_BAD, '{ "not": "a scene" }\n');
  writeFileSync(DECOY_TXT, 'hand notes the editor never reads\n');
  writeFileSync(DECOY_BAD_P, '{ "not": "a preset" }\n');

  // ── [0a] THE SOURCE IS ONLY READ. Stamped now, re-asserted at [5a].
  const srcEffects = join(AEON_SRC, EDITOR_REL);
  const srcStamps = ['ojz_act1_start.json', 'ojz_act1_depth.json', 'ojz_act1_floor.json']
    .map((f) => `${f}: ${stamp(join(srcEffects, f))}`);
  check('0a', 'the app will open a CLONE under mktemp, never the resolved aeon tree',
    resolve(CLONE).startsWith(resolve(tmpdir())) && resolve(CLONE) !== resolve(AEON_SRC),
    `clone ${CLONE}\n        source ${AEON_SRC} (stamped for [5a])\n        `
    + srcStamps.join('\n        '));

  // ── [0b] EVERY SUBJECT IS PRESENT BEFORE ANYTHING IS DRIVEN ───────────
  // ⚠ THE ANTI-VACUITY ROW. "The file is gone" is only a finding against a
  // presence this run observed; an empty directory produces the same absence.
  const subjects = {
    [`${VICTIM_SCENE}.json`]: scenePath(VICTIM_SCENE),
    [`${BYSTANDER_SCENE}.json`]: scenePath(BYSTANDER_SCENE),
    [`${VICTIM_PRESET}.json`]: presetPath(VICTIM_PRESET),
    [`${BYSTANDER_PRESET}.json`]: presetPath(BYSTANDER_PRESET),
    'zz_harness_unreadable.json': DECOY_BAD,
    'zz_harness_notes.txt': DECOY_TXT,
    'presets/zz_harness_unreadable.json': DECOY_BAD_P,
  };
  const before = Object.fromEntries(Object.entries(subjects).map(([k, p]) => [k, stamp(p)]));
  check('0b', 'every subject file EXISTS in the clone before a gesture is driven',
    Object.values(before).every((s) => s !== 'ABSENT'),
    Object.entries(before).map(([k, v]) => `${k}: ${v}`).join('\n        '));
  check('0c', 'the born-in-session scene does NOT exist yet — [4a] creates it through the UI',
    !existsSync(scenePath(BORN_SCENE)), `${scenePath(BORN_SCENE)}: ${stamp(scenePath(BORN_SCENE))}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
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
    await c.send('Page.enable').catch(() => {});

    let haveDbg = false;
    for (let i = 0; i < 40 && !haveDbg; i++) {
      haveDbg = await c.evalExpr('!!(window.__dbg && window.__dbg.aeon)');
      if (!haveDbg) await sleep(500);
    }
    if (!haveDbg) throw new Error('window.__dbg absent — needs a VITE_AURORA_DEBUG=1 build');

    // ⚠ THE ONE NON-UI DOOR, AND IT IS DECLARED. aeon's only real open route is
    // a NATIVE FOLDER PICKER that CDP cannot drive. Nothing that touches a
    // DOCUMENT below uses `__dbg`; every delete, every create and every save is
    // a real input event.
    async function openProject(tag, sub = 'parallax') {
      await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(CLONE)})`);
      await sleep(3500);
      const s = await c.json('window.__dbg.aeon.state()');
      check(`${tag}-open`, `the clone opened (${tag})`, s && s.open === true, JSON.stringify(s));
      const fx = await c.json(RECT_BY(String.raw`/^Effects$/`, 'button,div,span,a'));
      if (fx === null) { cannotMeasure(`${tag}-nav`, 'reach the Effects tab', 'nothing reads "Effects"'); return; }
      await clickRect(c, fx);
      await sleep(1200);
      await drive(c, `${tag} sub-tab ${sub}`, SUBTAB(sub));
      await sleep(800);
    }

    /** Scroll a control into its scroller, then press it at integer client px. */
    async function pressBy(re, tag, attr, tag2) {
      await c.evalExpr(SCROLL_INTO_VIEW(re, tag, attr));
      await sleep(250);
      const r = await c.json(RECT_BY(re, tag, attr));
      if (r === null) return null;
      note(`rect (${tag2})`, `x=${r.x} y=${r.y} w=${r.w} h=${r.h} dpr=${r.dpr} `
        + `disabled=${r.disabled} insideScroller=${r.insideScroller}`);
      if (r.insideScroller === false) {
        note(`⚠ (${tag2}) STILL outside its scroller after scrollIntoView`,
          `element ${JSON.stringify({ x: r.x, y: r.y, w: r.w, h: r.h })} vs scroller `
          + JSON.stringify(r.scroller));
      }
      return { at: await clickRect(c, r), rect: r };
    }

    /** Click a picker row whose title ends in `(id)`. Real press/release. */
    async function selectByPicker(id, tag) {
      return pressBy(new RegExp(`\\(${id}\\)`).toString(), 'button', 'title', `${tag} ${id}`);
    }

    /** Expand a CollapsibleSection by clicking its header, if its body is missing. */
    async function ensureSection(c2, titleRe, probeExpr, tag) {
      if (await c2.evalExpr(`!!(${probeExpr})`)) return 'already-open';
      const hit = await pressBy(titleRe, 'span', 'textContent', `${tag} header`);
      if (hit === null) return 'no-header';
      await sleep(600);
      return (await c2.evalExpr(`!!(${probeExpr})`)) ? 'opened' : 'still-closed';
    }

    /**
     * Press a Delete button and, if a confirm dialog comes up, answer it with a
     * REAL POINTER PRESS on the named key. Returns the dialog as it was seen
     * (null when none appeared) so the caller can assert on it — the absence of
     * a dialog is itself a measurement here, not a fallback.
     */
    async function pressDelete(label, answerKey) {
      const re = new RegExp(label).toString();
      await c.evalExpr(SCROLL_INTO_VIEW(re, 'button'));
      await sleep(250);
      const del = await c.json(RECT_BY(re, 'button'));
      if (del === null) return { pressed: false, dialog: null };
      note(`Delete rect (${label})`, `x=${del.x} y=${del.y} w=${del.w} h=${del.h} `
        + `disabled=${del.disabled} insideScroller=${del.insideScroller}`);
      if (del.disabled) return { pressed: false, disabled: true, dialog: null };
      await clickRect(c, del);
      await sleep(600);
      const dialog = await c.json(CONFIRM_STATE);
      if (dialog === null) return { pressed: true, dialog: null };
      const btn = await c.json(RECT_BY_SELECTOR(
        `[role="alertdialog"] button[data-confirm-key="${answerKey}"]`));
      if (btn === null) return { pressed: true, dialog, answered: false };
      await clickRect(c, btn);
      await sleep(700);
      return { pressed: true, dialog, answered: true };
    }

    const sceneIds = () => c.json('window.__dbg.aeon.scenes().map((s) => s.id)');
    const presetIds = () => c.json('window.__dbg.aeon.presets().map((p) => p.id)');

    // ═══════════════════════════════════════════════════════════════════════
    // [1] SCENE — DELETE, SAVE, AND ASK THE DISK
    // ═══════════════════════════════════════════════════════════════════════
    await openProject('1', 'parallax');
    const listed = await sceneIds();
    check('1a', 'the panel lists both the victim and the bystander scene',
      listed.includes(VICTIM_SCENE) && listed.includes(BYSTANDER_SCENE),
      `library holds: ${JSON.stringify(listed)}`);

    const sel = await selectByPicker(VICTIM_SCENE, 'scene');
    await sleep(700);
    check('1b', 'a REAL pointer gesture selected the victim scene',
      (await c.evalExpr('window.__dbg.aeon.selectedScene()')) === VICTIM_SCENE,
      `clicked at ${JSON.stringify(sel)} · selected=`
      + `${JSON.stringify(await c.evalExpr('window.__dbg.aeon.selectedScene()'))}`);

    const del1 = await pressDelete(`Delete scene ${VICTIM_SCENE}`, 'delete');
    check('1c', 'the Delete gesture landed, and the destructive act ASKS FIRST',
      del1.pressed && del1.dialog !== null && del1.answered === true,
      del1.dialog === null
        ? `pressed=${del1.pressed} · NO confirm dialog appeared — the file is destroyed with no `
          + 'question asked'
        : `dialog: ${JSON.stringify(del1.dialog)}`);
    if (del1.dialog) {
      check('1c2', 'the dialog NAMES the file that will be removed',
        typeof del1.dialog.text === 'string' && del1.dialog.text.includes(`${VICTIM_SCENE}.json`),
        `body: ${JSON.stringify(del1.dialog.text)}`);
      // safe-focus.ts's rule, measured on the live dialog rather than read.
      check('1c3', 'the dialog does NOT focus its destructive button (safe-focus.ts)',
        del1.dialog.focusedTone !== 'danger',
        `focusedKey=${JSON.stringify(del1.dialog.focusedKey)} `
        + `focusedTone=${JSON.stringify(del1.dialog.focusedTone)}`);
    } else {
      cannotMeasure('1c2', 'read the confirm dialog\'s body', 'no dialog appeared');
      cannotMeasure('1c3', 'read the confirm dialog\'s focus', 'no dialog appeared');
    }

    check('1d', 'the victim left the SESSION (the half that already worked)',
      !(await sceneIds()).includes(VICTIM_SCENE),
      `library now holds: ${JSON.stringify(await sceneIds())}`);

    const victimBefore = stamp(scenePath(VICTIM_SCENE));
    const bystanderInoBefore = ino(scenePath(BYSTANDER_SCENE));
    await ctrlS(c);
    await sleep(2800);

    // ⚠ THE ROW THE WHOLE PARCEL IS ABOUT. Not "the library dropped it" — the
    // library dropped it before the save and would drop it against the bug too.
    check('1e', 'THE DELETION REACHES DISK: after Ctrl+S the scene FILE is gone',
      !existsSync(scenePath(VICTIM_SCENE)),
      `${scenePath(VICTIM_SCENE)}\n        before save: ${victimBefore}\n        `
      + `after save:  ${stamp(scenePath(VICTIM_SCENE))}`);

    check('1f', 'CONTROL: the bystander scene SURVIVES and its inode did not move',
      existsSync(scenePath(BYSTANDER_SCENE))
        && ino(scenePath(BYSTANDER_SCENE)) === bystanderInoBefore,
      `before: ${before[`${BYSTANDER_SCENE}.json`]}\n        after:  `
      + `${stamp(scenePath(BYSTANDER_SCENE))}`);

    check('1g', 'CONTROL: files the editor NEVER LOADED are untouched — the save is not a scythe',
      existsSync(DECOY_BAD) && existsSync(DECOY_TXT) && existsSync(DECOY_BAD_P),
      `unparsable scene: ${stamp(DECOY_BAD)}\n        not-a-scene:     ${stamp(DECOY_TXT)}\n        `
      + `unparsable preset: ${stamp(DECOY_BAD_P)}`);

    await openProject('1h', 'parallax');
    check('1h', 'and it does NOT come back on the next open of the same project',
      !(await sceneIds()).includes(VICTIM_SCENE),
      `after re-opening ${CLONE} the library holds: ${JSON.stringify(await sceneIds())}`);

    // ═══════════════════════════════════════════════════════════════════════
    // [2] RASTER PRESET — THE SAME QUESTION, THE OTHER LOOP
    // ═══════════════════════════════════════════════════════════════════════
    await drive(c, 'sub-tab colour', SUBTAB('colour'));
    await sleep(900);
    const openedPresets = await ensureSection(c, String.raw`/^Raster band presets$/`,
      `document.querySelector('input[placeholder="new_preset_id"]')`, 'presets');
    note('preset section', `ensureSection -> ${openedPresets}`);
    const pListed = await presetIds();
    check('2a', 'the panel lists both the victim and the bystander preset',
      pListed.includes(VICTIM_PRESET) && pListed.includes(BYSTANDER_PRESET),
      `library holds: ${JSON.stringify(pListed)}`);

    await selectByPicker(VICTIM_PRESET, 'preset');
    await sleep(700);
    check('2b', 'a REAL pointer gesture selected the victim preset',
      (await c.evalExpr('window.__dbg.aeon.selectedPreset()')) === VICTIM_PRESET,
      `selected=${JSON.stringify(await c.evalExpr('window.__dbg.aeon.selectedPreset()'))}`);

    const del2 = await pressDelete(`Delete preset ${VICTIM_PRESET}`, 'delete');
    check('2c', 'the preset Delete gesture landed, and it ASKS FIRST too',
      del2.pressed && del2.dialog !== null && del2.answered === true,
      del2.dialog === null
        ? `pressed=${del2.pressed} disabled=${del2.disabled === true} · NO confirm dialog appeared`
        : `dialog: ${JSON.stringify(del2.dialog)}`);

    const presetVictimBefore = stamp(presetPath(VICTIM_PRESET));
    const presetBystanderIno = ino(presetPath(BYSTANDER_PRESET));
    await ctrlS(c);
    await sleep(2800);
    check('2d', 'THE PRESET DELETION REACHES DISK: after Ctrl+S the preset FILE is gone',
      !existsSync(presetPath(VICTIM_PRESET)),
      `${presetPath(VICTIM_PRESET)}\n        before save: ${presetVictimBefore}\n        `
      + `after save:  ${stamp(presetPath(VICTIM_PRESET))}`);
    check('2e', 'CONTROL: the bystander preset SURVIVES with its inode unmoved',
      existsSync(presetPath(BYSTANDER_PRESET))
        && ino(presetPath(BYSTANDER_PRESET)) === presetBystanderIno,
      `before: ${before[`${BYSTANDER_PRESET}.json`]}\n        after:  `
      + `${stamp(presetPath(BYSTANDER_PRESET))}`);

    await openProject('2f', 'colour');
    await ensureSection(c, String.raw`/^Raster band presets$/`,
      `document.querySelector('input[placeholder="new_preset_id"]')`, 'presets-2f');
    check('2f', 'and the preset does NOT come back on the next open',
      !(await presetIds()).includes(VICTIM_PRESET),
      `library holds: ${JSON.stringify(await presetIds())}`);

    // ═══════════════════════════════════════════════════════════════════════
    // [3] THE CONFIRM'S OTHER TWO ARMS — CANCEL, AND THE CASE WITH NOTHING
    //     TO LOSE. A file with only the "it asked" row has tested a dialog,
    //     not the ruling (new-sprite-guard.ts's own rule, borrowed).
    // ═══════════════════════════════════════════════════════════════════════
    await drive(c, 'sub-tab parallax (phase 3)', SUBTAB('parallax'));
    await sleep(900);
    await selectByPicker(BYSTANDER_SCENE, 'scene-cancel');
    await sleep(700);
    const cancelIno = ino(scenePath(BYSTANDER_SCENE));
    const del3 = await pressDelete(`Delete scene ${BYSTANDER_SCENE}`, 'cancel');
    await ctrlS(c);
    await sleep(2500);
    check('3a', 'CANCEL keeps the scene — in the panel AND on disk, same inode',
      del3.dialog !== null
        && (await sceneIds()).includes(BYSTANDER_SCENE)
        && ino(scenePath(BYSTANDER_SCENE)) === cancelIno,
      del3.dialog === null
        ? 'no dialog appeared, so there was no Cancel arm to press — the scene was deleted outright'
        : `still listed: ${(await sceneIds()).includes(BYSTANDER_SCENE)} · `
          + `${stamp(scenePath(BYSTANDER_SCENE))} (was ino=${cancelIno})`);

    // A scene that has never been saved has NO FILE, so deleting it destroys
    // nothing a Ctrl+Z cannot return. It must NOT interrupt the author.
    const idInput = String.raw`[...document.querySelectorAll('input[type=text],input:not([type])')]
      .find((e) => (e.placeholder || '') === 'new_scene_id')`;
    const typeId = (id) => String.raw`
(() => {
  const el = ${idInput};
  if (!el) return 'no-element';
  el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    .call(el, ${JSON.stringify(id)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`;
    async function createScene(id, tag) {
      await drive(c, `${tag} type scene id ${id}`, typeId(id));
      await sleep(300);
      const newRect = await c.json(RECT_BY(String.raw`/^New$/`, 'button'));
      if (newRect === null) return false;
      await clickRect(c, newRect);
      await sleep(900);
      return (await sceneIds()).includes(id);
    }

    const madeUnsaved = await createScene(UNSAVED_SCENE, '3b');
    if (!madeUnsaved) {
      cannotMeasure('3b', 'delete a never-saved scene', 'the New chip did not create it');
    } else {
      const del4 = await pressDelete(`Delete scene ${UNSAVED_SCENE}`, 'delete');
      check('3b', 'a scene with NO FILE deletes with no dialog — the question is paid for only '
        + 'where something on disk is at stake',
        del4.pressed && del4.dialog === null && !(await sceneIds()).includes(UNSAVED_SCENE),
        `dialog: ${JSON.stringify(del4.dialog)} · still listed: `
        + `${(await sceneIds()).includes(UNSAVED_SCENE)}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // [4] THE LEDGER'S OWN CASE: born in this session, SAVED, then deleted.
    //     Its file was never LOADED, so a removable set derived from the load
    //     alone would leave it behind forever.
    // ═══════════════════════════════════════════════════════════════════════
    const madeBorn = await createScene(BORN_SCENE, '4a');
    if (!madeBorn) {
      cannotMeasure('4a', 'create a scene through the UI', 'the New chip did not create it');
      cannotMeasure('4b', 'delete a scene born this session', 'it was never created');
    } else {
      await ctrlS(c);
      await sleep(2800);
      check('4a', 'a scene created THIS SESSION is written to disk by the save',
        existsSync(scenePath(BORN_SCENE)), `${scenePath(BORN_SCENE)}: ${stamp(scenePath(BORN_SCENE))}`);
      const bornBefore = stamp(scenePath(BORN_SCENE));
      const del5 = await pressDelete(`Delete scene ${BORN_SCENE}`, 'delete');
      await ctrlS(c);
      await sleep(2800);
      check('4b', 'and deleting it AFTER that save removes the file it just wrote — the ledger '
        + 'follows what the session persisted, not only what it loaded',
        !existsSync(scenePath(BORN_SCENE)),
        `dialog: ${del5.dialog === null ? 'NONE' : JSON.stringify(del5.dialog.title)}\n        `
        + `before: ${bornBefore}\n        after:  ${stamp(scenePath(BORN_SCENE))}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // [5] THE BOUNDARY, AND THE LEDGER
    // ═══════════════════════════════════════════════════════════════════════
    const srcAfter = ['ojz_act1_start.json', 'ojz_act1_depth.json', 'ojz_act1_floor.json']
      .map((f) => `${f}: ${stamp(join(srcEffects, f))}`);
    check('5a', 'aeon\'s own checkout is BYTE-FOR-BYTE where it was — nothing here wrote to it',
      srcAfter.join('|') === srcStamps.join('|'),
      `before:\n        ${srcStamps.join('\n        ')}\n        after:\n        `
      + srcAfter.join('\n        '));

    const bad = driven.filter((x) => x.r !== 'ok');
    check('5b', 'EVERY scripted gesture found its control and drove it',
      driven.length > 0 && bad.length === 0,
      `${driven.length} gesture(s); ${bad.length} did not return 'ok'`
      + (bad.length ? `: ${JSON.stringify(bad, null, 1)}` : ''));
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    const { killTree } = await import('./lib/harness-guard.mjs');
    await killTree(child);
    if (!process.env.KEEP_WORK) rmSync(WORK, { recursive: true, force: true });
    else note('working copy KEPT', WORK);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} rows passed · `
    + `${fails.length} failed · ${unmeasured.length} unmeasured`);
  if (fails.length) console.log(`FAILED: ${fails.join(', ')}`);
  if (unmeasured.length) console.log(`UNMEASURED: ${unmeasured.join(', ')}`);
  process.exitCode = (fails.length || unmeasured.length) ? 1 : 0;
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.message ?? e}`); process.exitCode = 1; });
