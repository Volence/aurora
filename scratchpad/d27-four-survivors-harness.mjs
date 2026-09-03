#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// d-27's FOUR SURVIVING CONTROLS, AFTER THE FIX — they act, and then they drop
// the keyboard.
//
// `docs/reviews/2026-09-03-d27-disputed-six.md` CLICKED the six controls the
// d-27 survey had excluded as self-unmounting and found FOUR of the exclusions
// wrong: the button survives its own press and KEEPS KEYBOARD FOCUS. That file
// measured and fixed nothing. This one measures the fix.
//
//   [esd] effects/EffectsScenePanel.tsx   Delete scene
//   [bpd] effects/BandPresetPanel.tsx     Delete preset
//   [dem] effects/BgAnimBandPanel.tsx     Demote
//   [rem] effects/BgAnimBandPanel.tsx     Remove — the REFUSING press
//
// ═══ WHAT THE TWO DELETES ARE ACTUALLY PREVENTING ═════════════════════════
//
// Not a repeat-fire. Measured on the unfixed build: the SAME DOM node (`===`,
// latched before the click) had its `aria-label` go from
// `"Delete scene d6_probe_scene"` to `"Delete scene ojz_act1_depth"` with
// `document.activeElement` still on it. **A bare Space does not re-delete the
// document that is gone — it deletes a DIFFERENT FILE.** The retarget is still
// there after the fix (it is a selection question, not a focus one, and it is
// NOT what d-27 was ruled on); what is gone is the keyboard sitting on it.
// `[esd-b]` and `[bpd-b]` measure the retarget and DELIBERATELY do not mention
// focus, so they survive every blur plant — a retarget row that reddened under
// a blur plant would be measuring the blur.
//
// ═══ THE [k7] ROW, AND THE THREE PLACES ONE CANNOT HONESTLY EXIST ═════════
//
// `[k7]` is d-27's load-bearing shape: *a press that changes NOTHING still
// drops focus*. It is the only row a cheaper implementation — blur inside the
// handler, after its early returns — fails, and it needs a press an author can
// really perform that writes nothing.
//
// **Exactly one of these four has one**, and it is `[rem-k7]`: the Remove
// button's first press asks `removeBandCommand(doc, i, false)`, which REFUSES
// when layout cells draw the band, and that path applies nothing at all. The
// other three have no reachable no-op press and this file says so in a NOTE
// rather than shipping a row that would be green however the code behaved:
//
//   [esd] `deleteSceneCommand`'s only null path is "no scene with this id" —
//         and the button renders only inside `{selected && …}`, i.e. only for a
//         scene that IS in the library.
//   [bpd] same null path, plus a `disabled={deleteRefusal !== null}` predicate.
//         A DISABLED BUTTON FIRES NO onClick, so a row built on it would pass
//         however the code behaved — the exact green-by-construction shape the
//         nine-parcel refused for `Remove layer` / `Remove raster band`.
//   [dem] `demoteBandCommand` refuses only with no document loaded (the panel
//         does not render at all then) or when `planBandDemotion` throws for a
//         static-blob capacity reason this run cannot construct without WRITING
//         to the sibling aeon checkout, which decision d-28 forbids.
//
// ═══ ⚠ NO ROW HERE MAY PASS VACUOUSLY ═════════════════════════════════════
//
// The nine-parcel's `[esp-c]` was green because the button had GREYED ITSELF
// OUT at a list floor — and a disabled button never takes focus either, so the
// row proved nothing about d-27. Every `-0` row below asserts, and PRINTS, that
// the button was PRESENT, VISIBLE and ENABLED at the instant it was clicked,
// and `clickHandle` refuses outright if the integer aim does not land inside
// the button it means.
//
// And every "it dropped focus" row asserts IN ITS OWN CONDITION that the click
// REALLY ACTED. A plant that made a control do nothing left a pure focus row
// green in both prior parcels; a button that acts on nothing drops focus for
// free.
//
// ═══ ⚠ NOT `el.click()` ═══════════════════════════════════════════════════
//
// A synthetic click does not focus a button, so a `.click()`-driven run can
// neither reproduce nor disprove a focus defect. Every press below is
// `Input.dispatchMouseEvent` at an integer client pixel verified with
// `elementFromPoint` first. The synthetic events in this file are SETUP only
// (facet pills, section headers, the panels' own `New`/`Promote`), in the same
// class as the native-setter `SET_INPUT`.
//
// ═══ ⚠ IT WRITES NOTHING TO DISK ══════════════════════════════════════════
//
// No save is issued and the app has no autosave (`shell/close-guard.ts`). The
// probe scene and preset are created IN MEMORY through the panels' own New
// buttons and taken back through the app's own history; `[z]` re-reads both
// libraries. The sibling aeon checkout is opened READ-ONLY (decision d-28's
// writable-copy rule binds harnesses that write; this one does not).
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:d27-four-survivors
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
//                          AURORA_BUILT_TREE=<this worktree>
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9481);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = join(ROOT, 'scratchpad/shots-d27-four-survivors');
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'd4_probe_scene';
const PRESET_ID = 'd4_probe_preset';

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

async function mouse(c, type, x, y, button = 'left') {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button,
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);

/** The geometry + enabled/present reading every `-0` row prints, taken just before the click. */
const readHandle = (c, handle) => c.json(String.raw`(() => {
  const el = window.__d4.el(${JSON.stringify(handle)});
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const b = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { dpr: window.devicePixelRatio, left: b.left, top: b.top, w: b.width, h: b.height,
           disabled: !!el.disabled, ariaDisabled: el.getAttribute('aria-disabled'),
           visible: cs.visibility !== 'hidden' && cs.display !== 'none' && b.width > 0 && b.height > 0,
           text: (el.textContent || '').trim().slice(0, 32),
           aria: el.getAttribute('aria-label') };
})()`);

/**
 * A REAL CLICK, aimed at integer client pixels and verified before it is sent.
 *
 * Returns the pre-click reading so a `-0` row asserts PRESENT + ENABLED at the
 * instant of the click rather than from a separate, earlier query. `dpr` varies
 * run-to-run on this machine (seen at 1 and 1.35 in one session), which is why
 * the aim is rounded and then re-verified rather than trusted.
 */
async function clickHandle(c, handle, label) {
  const geom = await readHandle(c, handle);
  if (!geom) throw new Error(`HANDLE ABSENT: "${handle}" (${label}) resolved to nothing. Refusing to `
    + 'click — a run that cannot find its own subject measures nothing.');
  await sleep(80);
  const g2 = await readHandle(c, handle);
  const x = Math.round(g2.left + g2.w / 2);
  const y = Math.round(g2.top + g2.h / 2);
  // The hit may be a DESCENDANT and that is still a hit: IconButton renders its
  // word as <span>Delete</span> INSIDE the button, so elementFromPoint returns
  // the span. `contains` is the check that means "the pixel is in the button we
  // meant"; a strict === refuses a perfectly good aim.
  const hit = await c.json(String.raw`(() => {
    const want = window.__d4.el(${JSON.stringify(handle)});
    const el = document.elementFromPoint(${x}, ${y});
    return { tag: el ? el.tagName : null, text: el ? (el.textContent || '').trim().slice(0, 32) : null,
             isTarget: el === want, insideTarget: !!(want && el && want.contains(el)) };
  })()`);
  note(`aim: ${label} [${handle}]`,
    `dpr=${g2.dpr} rect=(${g2.left},${g2.top},${g2.w}x${g2.h}) → integer client (${x},${y}) · `
    + `text="${g2.text}" aria=${JSON.stringify(g2.aria)} disabled=${g2.disabled} `
    + `aria-disabled=${g2.ariaDisabled} visible=${g2.visible} · `
    + `elementFromPoint = <${hit.tag}> "${hit.text}" isTarget=${hit.isTarget} `
    + `insideTarget=${hit.insideTarget}`);
  if (!hit.insideTarget) {
    throw new Error(`AIM REFUSED: integer (${x},${y}) for "${label}" [${handle}] lands on <${hit.tag}> `
      + `"${hit.text}", which is NOT inside the handle's button. Clicking it would measure `
      + 'something else.');
  }
  await mouse(c, 'mousePressed', x, y);
  await sleep(50);
  await mouse(c, 'mouseReleased', x, y);
  await sleep(500);
  return { x, y, pre: g2 };
}

/**
 * SURVIVED + FOCUS, in one reading, against the LATCHED node.
 *
 * `focusIsLatched` compares `document.activeElement` with the very element that
 * was clicked — not with whatever the handle resolves to now. That is the node
 * the author's finger landed on, and the one a stray Space would fire.
 */
const outcome = (c, handle) => c.json(String.raw`(() => {
  const a = document.activeElement;
  const l = window.__d4._latched;
  const now = window.__d4.el(${JSON.stringify(handle)});
  return {
    latchedInDom: !!(l && document.contains(l)),
    handleResolves: !!now,
    sameNode: !!(l && now === l),
    focusTag: a ? a.tagName : null,
    focusText: a ? (a.textContent || '').trim().slice(0, 40) : null,
    focusAria: a ? a.getAttribute('aria-label') : null,
    focusIsLatched: !!(l && a === l),
    focusIsBody: a === document.body,
    focusIsAnyButton: !!(a && a.tagName === 'BUTTON'),
  };
})()`);

/** React-controlled input: the native setter plus the events React listens for. */
const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

const CLICK_BY_TEXT = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/** Open a CollapsibleSection by its header text, reporting what it found. */
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
      .map((d) => (d.textContent || '').trim().slice(0, 56));
    return 'no-header; headers on screen: ' + JSON.stringify(seen);
  }
  hdr.click();
  return 'clicked';
})()`;

/**
 * THE IN-PAGE HANDLE TABLE.
 *
 * ⚠ EVERY HANDLE IS RESOLVED BY THE MECHANISM ITS OWN COMPONENT USES —
 * `IconButton` puts its word in the child and its name in `aria-label`, so all
 * four subjects here match aria-label rather than text. `demote0` and `remove0`
 * are a NEAR-IDENTICAL PAIR two lines apart in one `Row`; each is addressed by
 * its own full label, never by position, so a row cannot silently measure the
 * neighbour.
 */
const INSTALL_HANDLES = String.raw`
(() => {
  const byAria = (a) => document.querySelector('button[aria-label="' + a + '"]');
  const byAriaPrefix = (p) => [...document.querySelectorAll('button[aria-label]')]
    .find((b) => b.getAttribute('aria-label').startsWith(p)) || null;
  window.__d4 = {
    el(h) {
      if (h === 'esdDelete') return byAriaPrefix('Delete scene ');
      if (h === 'bpdDelete') return byAriaPrefix('Delete preset ');
      if (h === 'demote0') return byAria('Demote tile animation 0 to static tiles');
      if (h === 'remove0') return byAria('Remove tile animation 0');
      if (h === 'confirmBlank') return [...document.querySelectorAll('button')]
        .find((b) => /^Remove and blank those cells$/.test((b.textContent || '').trim())) || null;
      return null;
    },
    deleteButtons: () => [...document.querySelectorAll('button[aria-label]')]
      .filter((b) => /^Delete (scene|preset) /.test(b.getAttribute('aria-label')))
      .map((b) => ({ aria: b.getAttribute('aria-label'), disabled: !!b.disabled })),
    bandButtons: () => [...document.querySelectorAll('button[aria-label]')]
      .filter((b) => /tile animation/.test(b.getAttribute('aria-label')))
      .map((b) => ({ aria: b.getAttribute('aria-label'), disabled: !!b.disabled })),
    _latched: null,
    latch(h) { this._latched = this.el(h); return !!this._latched; },
    latchedAria() { return this._latched ? this._latched.getAttribute('aria-label') : null; },
  };
  return 'ok';
})()`;

/** The scene library + which scene the panel is showing. */
async function ssnap(c) {
  const list = await c.json('window.__dbg.aeon.scenes()');
  const selected = await c.evalExpr('window.__dbg.aeon.selectedScene()');
  return { ids: list.map((s) => s.id), selected };
}
async function psnap(c) {
  const list = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
  const selected = await c.evalExpr('window.__dbg.aeon.selectedPreset()');
  return { ids: list.map((p) => p.id), selected };
}

async function main() {
  assertFreshBuild(RUN);

  for (let i = 0; i < 60 && !(await portFree()); i++) {
    if (i === 0) note('port', `${PORT} still serving — waiting for a previous run to exit`);
    await sleep(1000);
  }
  if (!(await portFree())) throw new Error(`port ${PORT} still serves a CDP target after 60s`);

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
    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('window.__dbg absent — needs a VITE_AURORA_DEBUG=1 build');
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    if (!(await waitDbg())) throw new Error('window.__dbg absent after reload');

    console.log('\n=== BOOT: the real aeon project (READ-ONLY — no save is ever issued) ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => note('aeon open threw', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('b1', 'the aeon project is open, with sections', !!(st && st.open && st.sections > 0),
      JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');
    await sleep(1500);
    await c.evalExpr(INSTALL_HANDLES);

    // ══════════════════════════════════════════════════════════════════════
    // [esd] effects/EffectsScenePanel.tsx — Delete scene
    // Measured unfixed: survives, RETARGETS at another document, keeps focus.
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [esd] EffectsScenePanel — Delete scene (TWO scenes present) ===');
    const facetE = await c.evalExpr(CLICK_BY_TEXT('/^Effects$/'));
    await sleep(1500);
    note('facet', `Effects pill click → ${facetE}`);
    const scenes0 = await ssnap(c);
    note('[esd] scenes before this run', JSON.stringify(scenes0));
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await sleep(400);
    await c.evalExpr(CLICK_BY_TEXT('/^New$/'));
    await sleep(1400);
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);
    await sleep(900);
    const scenesFix = await ssnap(c);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Scene — /`,
      `document.querySelector('button[aria-label^="Delete scene "]')`));
    await sleep(900);
    await c.evalExpr(INSTALL_HANDLES);
    const esdPre = await readHandle(c, 'esdDelete');
    await shot(c, 'esd-before');
    check('esd-0', 'ANTI-VACUOUS fixture: the library holds TWO OR MORE scenes — so '
      + '`resolveSelectedScene` HAS somewhere to fall back to and the button SURVIVES its own press, '
      + 'which is the arm the whole row is about; and the Delete button is PRESENT, VISIBLE and '
      + 'ENABLED at the moment it is clicked, because a disabled button never takes focus either and '
      + 'would make every row below green for a reason that has nothing to do with d-27',
      scenesFix.ids.length >= 2 && !!esdPre && esdPre.disabled === false && esdPre.visible === true
      && scenesFix.selected === SCENE_ID,
      `scenes = ${JSON.stringify(scenesFix.ids)} (selected="${scenesFix.selected}"); button reading = `
      + `${JSON.stringify(esdPre)}. Deleting the LAST scene unmounts the button on its own and is not `
      + 'what this run measures.');
    if (!esdPre || scenesFix.ids.length < 2 || esdPre.disabled) {
      throw new Error('could not build a two-scene fixture with an ENABLED Delete — [esd] would be vacuous');
    }

    await c.evalExpr("window.__d4.latch('esdDelete')");
    const esdLabelBefore = await c.evalExpr('window.__d4.latchedAria()');
    await clickHandle(c, 'esdDelete', 'EffectsScenePanel Delete scene');
    const esdOut = await outcome(c, 'esdDelete');
    const esdLabelAfter = await c.evalExpr(String.raw`(() => {
      const l = window.__d4._latched; return l ? l.getAttribute('aria-label') : null; })()`);
    const scenesAfter = await ssnap(c);
    await shot(c, 'esd-after');
    check('esd-a', 'd-27 AT effects/EffectsScenePanel.tsx Delete scene: the click REALLY DELETED THE '
      + 'SCENE and the button DROPPED THE KEYBOARD — `document.activeElement` is not the clicked node',
      scenesAfter.ids.length === scenesFix.ids.length - 1
      && !scenesAfter.ids.includes(SCENE_ID)
      && esdOut.focusIsLatched === false,
      `scenes ${JSON.stringify(scenesFix.ids)} → ${JSON.stringify(scenesAfter.ids)}; activeElement = `
      + `<${esdOut.focusTag}> "${esdOut.focusText}" aria=${JSON.stringify(esdOut.focusAria)} · `
      + `isTheClickedNode=${esdOut.focusIsLatched} isBody=${esdOut.focusIsBody} `
      + `isSomeButton=${esdOut.focusIsAnyButton}. ⚠ THE "REALLY DELETED" HALF IS IN THE CONDITION, `
      + 'not in prose beside it: a button wired to nothing keeps no focus either, and that exact '
      + 'plant left a pure focus row green in both prior d-27 parcels.');
    check('esd-b', '⚠ WHAT THE BLUR IS PREVENTING, measured and stated without mentioning focus: the '
      + 'clicked button SURVIVES (same node, `===` against the node latched before the click) and is '
      + 'RETARGETED AT A DIFFERENT DOCUMENT — `resolveSelectedScene` falls back to `library.scenes[0]` '
      + 'because the store\'s selected id is still the deleted one. So a bare Space on a still-focused '
      + 'button would not re-delete the document that is gone: IT WOULD DELETE A DIFFERENT FILE',
      esdOut.latchedInDom === true && esdOut.sameNode === true
      && esdLabelBefore !== esdLabelAfter && typeof esdLabelAfter === 'string'
      && esdLabelAfter.startsWith('Delete scene ') && !esdLabelAfter.includes(SCENE_ID),
      `latched node still in DOM=${esdOut.latchedInDom}, handle resolves to the SAME node=`
      + `${esdOut.sameNode}; the SAME node's aria-label: ${JSON.stringify(esdLabelBefore)} → `
      + `${JSON.stringify(esdLabelAfter)}; the store's selected id is still "${scenesAfter.selected}". `
      + '⚠ THIS ROW DELIBERATELY SAYS NOTHING ABOUT FOCUS, so it SURVIVES every blur plant — a '
      + 'retarget row that reddened under one would be measuring the blur. The retarget is a '
      + 'SELECTION question and d-27 did not rule on it; it is why the focus row matters.');
    for (let i = 0; i < 6 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      await ctrlZ(c); await sleep(350);
      const s = await ssnap(c);
      if (s.ids.includes(SCENE_ID)) break;
    }
    const esdUndone = await ssnap(c);
    check('esd-z', 'the scene deletion is ONE Ctrl+Z away, and the undo still reaches the app from '
      + '`<body>` after the blur — `LevelWorkspace`\'s `isTypingTarget` lets it through',
      esdUndone.ids.includes(SCENE_ID),
      `scenes after the undo = ${JSON.stringify(esdUndone.ids)}. This row is also the one that would `
      + 'catch a blur that had broken the keyboard path it moved focus onto.');
    note('[esd] NO HONEST [k7] ROW EXISTS HERE, and none is shipped',
      '`deleteSceneCommand` (providers/effects-aeon.ts) has exactly one null path — "no scene with '
      + 'this id" — and the button renders only inside `{selected && …}`, i.e. only for a scene that '
      + 'IS in the library. There is no press an author can perform that reaches this handler and '
      + 'writes nothing, so a "no-op press still drops focus" row here would pass however the code '
      + 'behaved. The unconditional half is carried by the shared helper (blur BEFORE act) and is '
      + 'measured at [rem-k7], where a no-op press is genuinely reachable.');

    // ══════════════════════════════════════════════════════════════════════
    // [bpd] effects/BandPresetPanel.tsx — Delete preset
    // ⚠ THIS BUTTON HAS A `disabled` PREDICATE (`deleteRefusal`), which is the
    // vacuity trap the nine-parcel met at [esp-c] — so the fixture uses a
    // preset THIS RUN created, which no section binds.
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [bpd] BandPresetPanel — Delete preset (TWO presets present) ===');
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1300);
    const presets0 = await psnap(c);
    note('[bpd] presets before this run', JSON.stringify(presets0));
    await c.evalExpr(OPEN_SECTION(String.raw`/^Raster band presets\b/`,
      `document.querySelector('input[placeholder="new_preset_id"]')`));
    await sleep(900);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_preset_id"]')`, PRESET_ID));
    await sleep(400);
    await c.evalExpr(CLICK_BY_TEXT('/^New$/'));
    await sleep(1400);
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(PRESET_ID)})`);
    await sleep(900);
    const presetsFix = await psnap(c);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Preset — ` + PRESET_ID + String.raw`(?![-a-z0-9_ ])/`,
      `document.querySelector('button[aria-label^="Delete preset "]')`));
    await sleep(900);
    await c.evalExpr(INSTALL_HANDLES);
    const bpdPre = await readHandle(c, 'bpdDelete');
    await shot(c, 'bpd-before');
    check('bpd-0', 'ANTI-VACUOUS fixture: TWO OR MORE presets AND the Delete button is ENABLED — this '
      + 'control carries `disabled={deleteRefusal !== null}`, so a preset a section binds would grey '
      + 'it out, and a disabled button never takes focus. That is the exact accident that made '
      + '[esp-c] green for the wrong reason in the nine-parcel',
      presetsFix.ids.length >= 2 && !!bpdPre && bpdPre.disabled === false && bpdPre.visible === true
      && presetsFix.selected === PRESET_ID,
      `presets = ${JSON.stringify(presetsFix.ids)} (selected="${presetsFix.selected}"); button reading `
      + `= ${JSON.stringify(bpdPre)}`);
    if (!bpdPre || presetsFix.ids.length < 2 || bpdPre.disabled) {
      throw new Error('could not build a two-preset fixture with an ENABLED Delete — [bpd] would be vacuous');
    }

    await c.evalExpr("window.__d4.latch('bpdDelete')");
    const bpdLabelBefore = await c.evalExpr('window.__d4.latchedAria()');
    await clickHandle(c, 'bpdDelete', 'BandPresetPanel Delete preset');
    const bpdOut = await outcome(c, 'bpdDelete');
    const bpdLabelAfter = await c.evalExpr(String.raw`(() => {
      const l = window.__d4._latched; return l ? l.getAttribute('aria-label') : null; })()`);
    const presetsAfter = await psnap(c);
    await shot(c, 'bpd-after');
    check('bpd-a', 'd-27 AT effects/BandPresetPanel.tsx Delete preset: the click REALLY DELETED THE '
      + 'PRESET and the button DROPPED THE KEYBOARD',
      presetsAfter.ids.length === presetsFix.ids.length - 1
      && !presetsAfter.ids.includes(PRESET_ID)
      && bpdOut.focusIsLatched === false,
      `presets ${JSON.stringify(presetsFix.ids)} → ${JSON.stringify(presetsAfter.ids)}; activeElement `
      + `= <${bpdOut.focusTag}> "${bpdOut.focusText}" aria=${JSON.stringify(bpdOut.focusAria)} · `
      + `isTheClickedNode=${bpdOut.focusIsLatched} isBody=${bpdOut.focusIsBody} `
      + `isSomeButton=${bpdOut.focusIsAnyButton}`);
    const bpdButtonsAfter = await c.json('window.__d4.deleteButtons()');
    check('bpd-b', '⚠ WHAT THE BLUR IS PREVENTING, without mentioning focus: the same node survives '
      + 'and is RETARGETED at `library.presets[0]` — and its `disabled` guard is SILENTLY RE-DERIVED '
      + 'for the new target, so the guard is live for a document the author never chose',
      bpdOut.latchedInDom === true && bpdOut.sameNode === true
      && bpdLabelBefore !== bpdLabelAfter && typeof bpdLabelAfter === 'string'
      && bpdLabelAfter.startsWith('Delete preset ') && !bpdLabelAfter.includes(PRESET_ID),
      `the SAME node's aria-label: ${JSON.stringify(bpdLabelBefore)} → ${JSON.stringify(bpdLabelAfter)}; `
      + `the store's selected id is still "${presetsAfter.selected}"; delete buttons on screen after `
      + `the click = ${JSON.stringify(bpdButtonsAfter)}. This row SURVIVES every blur plant on purpose.`);
    for (let i = 0; i < 8 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      await ctrlZ(c); await sleep(350);
      const p = await psnap(c);
      if (p.ids.includes(PRESET_ID)) break;
    }
    const bpdUndone = await psnap(c);
    check('bpd-z', 'the preset deletion is ONE Ctrl+Z away, and the undo still reaches the app from '
      + '`<body>` after the blur',
      bpdUndone.ids.includes(PRESET_ID),
      `presets after the undo = ${JSON.stringify(bpdUndone.ids)}`);
    note('[bpd] NO HONEST [k7] ROW EXISTS HERE EITHER, and none is shipped',
      '`deletePresetCommand`\'s only null path is "no preset with this id", unreachable while the '
      + 'button renders; the other floor is `disabled={deleteRefusal !== null}` — and A DISABLED '
      + 'BUTTON FIRES NO onClick, so a row built on it would be green by construction. That is the '
      + 'same reason the nine-parcel refused a [k7] for `Remove layer` and `Remove raster band`.');

    // ══════════════════════════════════════════════════════════════════════
    // [rem] / [dem] effects/BgAnimBandPanel.tsx — the near-identical pair
    // ⚠ [rem] RUNS FIRST, because the refusing press must change NOTHING:
    // measuring it before any demote keeps the document the one this run
    // opened on, so "nothing changed" is checked against the file rather than
    // against this harness's own earlier edit.
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [rem] BgAnimBandPanel — Remove, the REFUSING press (the only real [k7] here) ===');
    await c.evalExpr(SUBTAB('tileAnim'));
    await sleep(1400);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Tile animations\b/`,
      `document.querySelector('button[aria-label^="Remove tile animation"]')`));
    await sleep(1000);
    await c.evalExpr(INSTALL_HANDLES);
    const bands0 = await c.json('window.__dbg.aeon.bands()');
    const bandBtns0 = await c.json('window.__d4.bandButtons()');
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    await shot(c, 'bands-before');
    note('[band] fixture', `bands=${bands0.length} · buttons=${JSON.stringify(bandBtns0)} · `
      + `bgOverrideHash=${hash0}`);

    if (bands0.length < 1) {
      check('rem-0', 'BLOCKED — the open document carries NO tile-animation band, so the refusing '
        + 'Remove press cannot be constructed at all', false,
        `bands()=${JSON.stringify(bands0)}. Reported as unmeasured rather than skipped.`);
    } else {
      const remPre = await readHandle(c, 'remove0');
      check('rem-0', 'ANTI-VACUOUS: band 0 exists and its Remove button is PRESENT, VISIBLE and '
        + 'ENABLED at the moment it is clicked',
        !!remPre && remPre.disabled === false && remPre.visible === true,
        `button reading = ${JSON.stringify(remPre)} · bands=${bands0.length}`);
      await c.evalExpr("window.__d4.latch('remove0')");
      await clickHandle(c, 'remove0', 'BgAnimBandPanel Remove (the REFUSING press)');
      const remOut = await outcome(c, 'remove0');
      const bands1 = await c.json('window.__dbg.aeon.bands()');
      const hash1 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      const confirm1 = await readHandle(c, 'confirmBlank');
      const pageText = await c.evalExpr(`(document.body.innerText || '').replace(/\\s+/g, ' ')`);
      const refused = bands1.length === bands0.length && hash1 === hash0;
      await shot(c, 'rem-after');
      check('rem-a', 'the FIRST press REFUSED and the handler REALLY RAN: the document is '
        + 'byte-identical (same band count, same bgOverrideHash) AND the confirmation control the '
        + 'refusal reveals is on screen — which is what tells "the command refused" apart from "the '
        + 'click never registered"',
        refused === true && !!confirm1,
        `bands ${bands0.length} → ${bands1.length}; bgOverrideHash ${hash0} → ${hash1} `
        + `(identical=${hash1 === hash0}); confirmation chip = ${JSON.stringify(confirm1)}; refusal `
        + `text on screen = ${/draw them/.test(pageText)}. ⚠ IF THIS IS RED BECAUSE THE REMOVAL `
        + 'SIMPLY SUCCEEDED, no layout cell draws this band, the refusing press was never reached, '
        + 'and [rem-k7] below is not measuring what it says.');
      check('rem-k7', '⚠⚠ THE [k7] ROW — THE ONE d-27 ACTUALLY RESTS ON, and the only place among '
        + 'these four where an author can really perform a press that WRITES NOTHING: the refusing '
        + 'press applied nothing at all, the button did NOT unmount, and IT STILL DROPPED THE '
        + 'KEYBOARD. This is the row a cheaper implementation — blur inside the handler, after its '
        + 'early returns — fails, and it is why the shared helper blurs BEFORE `act()`',
        refused === true && !!confirm1
        && remOut.latchedInDom === true && remOut.sameNode === true
        && remOut.focusIsLatched === false,
        `wrote nothing: bands ${bands0.length} → ${bands1.length}, bgOverrideHash identical=`
        + `${hash1 === hash0}; the handler ran: confirmation chip present=${!!confirm1}; the button `
        + `survived: stillInDom=${remOut.latchedInDom} sameNode=${remOut.sameNode}; activeElement = `
        + `<${remOut.focusTag}> "${remOut.focusText}" aria=${JSON.stringify(remOut.focusAria)} · `
        + `isTheClickedNode=${remOut.focusIsLatched} isBody=${remOut.focusIsBody} `
        + `isSomeButton=${remOut.focusIsAnyButton}. ⚠ WHAT IS AND IS NOT FIXED HERE: the `
        + 'confirmation lives on a SECOND, DIFFERENT control ("Remove and blank those cells"), so a '
        + 'destructive control the author did not ask for is now one Tab away. Dropping focus stops '
        + 'a stray Space re-asking a question that has already been answered; it does NOT announce '
        + 'the new control, and that residual is recorded rather than fixed.');
      // Leave the pending state, and the document, exactly as found.
      await c.evalExpr(CLICK_BY_TEXT('/^Cancel$/'));
      await sleep(500);
      const hashCancelled = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      check('rem-z', 'the refusing press left the override document byte-identical to the one this '
        + 'run opened — nothing to undo, because nothing was applied',
        hashCancelled === hash0,
        `bgOverrideHash at boot=${hash0}, after the press and Cancel=${hashCancelled}`);
    }

    // ── [dem] Demote ──────────────────────────────────────────────────────
    //
    // ⚠ THE FIXTURE IS HALF THE ROW. The open document carries ONE band.
    // Demoting the only band empties the list, so card 0 has nothing to shift
    // into it and the button UNMOUNTS — which is the arm both prior code reads
    // already agreed on and proves nothing about d-27, exactly as "delete the
    // last scene" does for [esd]. A second band is promoted through the panel's
    // own `Promote` chip (it moves art the blob already holds and spends no
    // slots, the only door open on a document at tile capacity), and the row
    // asserts `bands >= 2` before anything below is believed.
    console.log('\n=== [dem] BgAnimBandPanel — Demote (needs a SECOND band to be meaningful) ===');
    let promoted = null;
    for (let i = 0; i < 3 && (await c.json('window.__dbg.aeon.bands()')).length < 2; i++) {
      await c.evalExpr(OPEN_SECTION(String.raw`/^New tile animation/`,
        `[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Promote')`));
      await sleep(900);
      promoted = await c.evalExpr(CLICK_BY_TEXT('/^Promote$/'));
      await sleep(1200);
      await c.evalExpr(INSTALL_HANDLES);
    }
    const bandsD0 = await c.json('window.__dbg.aeon.bands()');
    check('dem-fix', 'ANTI-VACUOUS fixture: the document carries TWO OR MORE tile-animation bands, so '
      + 'demoting index 0 leaves a successor to slide into card 0 (`key={b.index}`) and the button '
      + 'SURVIVES — without this the row would only re-measure the last-band arm, where the control '
      + 'unmounts on its own and d-27 cannot fire',
      bandsD0.length >= 2,
      `bands = ${bandsD0.length} `
      + `${JSON.stringify(bandsD0.map((b) => ({ i: b.index, c: b.cols, r: b.rows })))} · Promote click `
      + `→ ${promoted}`);
    if (bandsD0.length < 2) {
      check('dem-0', 'BLOCKED — could not build a two-band fixture, so the surviving arm of [dem] '
        + 'cannot be measured', false,
        `bands()=${JSON.stringify(bandsD0)}. Reported as unmeasured, never rendered as green.`);
    } else {
      await c.evalExpr(INSTALL_HANDLES);
      const demPre = await readHandle(c, 'demote0');
      const hashD0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      check('dem-0', 'ANTI-VACUOUS: band 0 exists and its Demote button is PRESENT, VISIBLE and '
        + 'ENABLED at the moment it is clicked — and it is addressed by its OWN full aria-label, '
        + 'never by position, because `Remove` sits two lines away in the same `Row` and reads the same',
        !!demPre && demPre.disabled === false && demPre.visible === true
        && demPre.aria === 'Demote tile animation 0 to static tiles',
        `button reading = ${JSON.stringify(demPre)} · bands=${bandsD0.length}`);
      await c.evalExpr("window.__d4.latch('demote0')");
      await clickHandle(c, 'demote0', 'BgAnimBandPanel Demote');
      const demOut = await outcome(c, 'demote0');
      const bandsD1 = await c.json('window.__dbg.aeon.bands()');
      const hashD1 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      await shot(c, 'dem-after');
      check('dem-a', 'd-27 AT effects/BgAnimBandPanel.tsx Demote: the click REALLY DEMOTED THE BAND '
        + '(one band fewer AND the override document changed) and the button DROPPED THE KEYBOARD',
        bandsD1.length === bandsD0.length - 1 && hashD1 !== hashD0
        && demOut.focusIsLatched === false,
        `bands ${bandsD0.length} → ${bandsD1.length}; bgOverrideHash ${hashD0} → ${hashD1}; `
        + `activeElement = <${demOut.focusTag}> "${demOut.focusText}" `
        + `aria=${JSON.stringify(demOut.focusAria)} · isTheClickedNode=${demOut.focusIsLatched} `
        + `isBody=${demOut.focusIsBody} isSomeButton=${demOut.focusIsAnyButton}. The "really demoted" `
        + 'half is IN THE CONDITION: a Demote wired to nothing left this exact row green in the '
        + 'disputed-six parcel (its plant P4).');
      check('dem-b', '⚠ WHAT THE BLUR IS PREVENTING, without mentioning focus: the clicked Demote '
        + 'button SURVIVES — same node, `===` against the node latched before the click — because '
        + 'the band cards are `key={b.index}` and the successor slides into card 0. So the button '
        + 'under the author\'s finger now names a DIFFERENT band',
        demOut.latchedInDom === true && demOut.sameNode === true,
        `latched node still in DOM=${demOut.latchedInDom}, handle resolves to the SAME node=`
        + `${demOut.sameNode}, handle resolves at all=${demOut.handleResolves}. This row SURVIVES `
        + 'every blur plant on purpose.');
      for (let i = 0; i < 6 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
        await ctrlZ(c); await sleep(400);
        if ((await c.evalExpr('window.__dbg.aeon.bgOverrideHash()')) === hashD0) break;
      }
      const hashDz = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      check('dem-z', 'the demotion is ONE Ctrl+Z away and lands back on the EXACT bytes — and the '
        + 'undo still reaches the app from `<body>` after the blur',
        hashDz === hashD0,
        `bgOverrideHash before=${hashD0}, after demote=${hashD1}, after the undo=${hashDz}`);
      for (let i = 0; i < 6 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
        if ((await c.evalExpr('window.__dbg.aeon.bgOverrideHash()')) === hash0) break;
        await ctrlZ(c); await sleep(400);
      }
      const hashBoot = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      check('dem-z2', "the fixture's own Promote is undone too — the override document ends on the "
        + 'EXACT bytes this run opened it with, and nothing was ever saved',
        hashBoot === hash0,
        `bgOverrideHash at boot=${hash0}, at the end of the band section=${hashBoot}`);
      note('[dem] NO HONEST [k7] ROW EXISTS HERE, and none is shipped',
        '`demoteBandCommand` (providers/bg-anim-aeon.ts) refuses in two cases: no BG override '
        + 'document is loaded — the panel does not render at all then — or `planBandDemotion` throws '
        + 'for a static-blob capacity reason. The second is a real no-op press with the button still '
        + 'enabled, but constructing it means WRITING to the sibling aeon checkout, which decision '
        + 'd-28 forbids this run. Reported as unbuilt rather than shipped as a green-by-construction '
        + 'row; the unconditional half is measured at [rem-k7].');
    }

    // ── libraries back where this run found them ──────────────────────────
    //
    // The `-z` rows above put the two probe documents BACK (that is what they
    // measure). This unwinds the run's own `New` presses as well, so the app
    // ends holding exactly what it opened. Nothing is saved either way; this is
    // hygiene, and [z1] is what checks it happened rather than assuming it.
    for (let i = 0; i < 12; i++) {
      const s = await ssnap(c);
      const p = await psnap(c);
      if (!s.ids.includes(SCENE_ID) && !p.ids.includes(PRESET_ID)) break;
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await ctrlZ(c); await sleep(350);
    }
    const scenesEnd = await ssnap(c);
    const presetsEnd = await psnap(c);
    check('z1', 'both effects libraries hold exactly the documents this run opened on — the probe '
      + 'scene and preset were re-created by the undos and then removed again, so neither id is left '
      + 'behind and neither library changed size, and NOTHING WAS EVER SAVED',
      !scenesEnd.ids.includes(SCENE_ID) && !presetsEnd.ids.includes(PRESET_ID)
      && scenesEnd.ids.length === scenes0.ids.length
      && presetsEnd.ids.length === presets0.ids.length,
      `scenes: boot=${JSON.stringify(scenes0.ids)} end=${JSON.stringify(scenesEnd.ids)}; `
      + `presets: boot=${JSON.stringify(presets0.ids)} end=${JSON.stringify(presetsEnd.ids)}. `
      + 'The probe documents are undone through the app\'s own history; a leftover probe id here '
      + 'means the undo loop did not reach it, and the run wrote nothing to disk either way.');
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
