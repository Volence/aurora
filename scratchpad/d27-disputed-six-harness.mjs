#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// d-27's SIX EXCLUDED CONTROLS, CLICKED — the measurement two code reads could
// not settle.
//
// `docs/reviews/2026-09-03-d27-blur-after-press.md` ("Tagged, not fixed") and
// `docs/reviews/2026-09-03-d27-survey-nine.md` (§"The six the survey excluded")
// both list six controls as SAFE because "the handler unmounts the button, so
// it loses focus to <body> on its own and the d-27 defect cannot fire". The two
// passes then DISAGREED about four of the six — and neither of them clicked
// anything. This file clicks all six, in the app, with real mouse input, and
// reads `document.activeElement` and DOM-node identity back.
//
//   [chk] components/AeonChunkActions.tsx      Clear   (chunk library)
//   [sgn] components/SectionGridNav.tsx        Remove  (context menu)
//   [esd] effects/EffectsScenePanel.tsx        Delete scene
//   [bpd] effects/BandPresetPanel.tsx          Delete preset
//   [dem] effects/BgAnimBandPanel.tsx          Demote
//   [rem] effects/BgAnimBandPanel.tsx          Remove  (the REFUSING press)
//
// ═══ THE TWO FACTS EVERY ROW REPORTS ══════════════════════════════════════
//
//   SURVIVED — is the DOM element that was clicked still the element the handle
//              resolves to, and still in the document? Compared with `===`
//              against a node latched BEFORE the click, never re-queried by
//              selector: "a button with this label exists again" and "this
//              button was never torn down" are different claims and only the
//              second one answers the survey's question.
//   FOCUS    — `document.activeElement === that same node`.
//
// ═══ ⚠ NO ROW HERE MAY PASS VACUOUSLY ═════════════════════════════════════
//
// The nine-parcel found `[esp-c]` green because the button had GREYED ITSELF
// OUT for an unrelated reason (a list floor) — and a disabled button never
// takes focus either, so the row proved nothing about d-27. Every `-0` row
// below therefore asserts, and PRINTS, that the button was PRESENT and ENABLED
// at the instant it was clicked, and `clickHandle` refuses outright if the
// integer aim does not land inside the button it means.
//
// ═══ ⚠ NOT `el.click()` ═══════════════════════════════════════════════════
//
// A synthetic click does not focus a button, so a `.click()`-driven run can
// neither reproduce nor disprove the focus defect. Every press below is
// `Input.dispatchMouseEvent`. The one synthetic event in this file is the
// `contextmenu` that OPENS the section menu for [sgn] — a setup gesture, in the
// same class as the native-setter `SET_INPUT` every harness here uses, and the
// row says which mechanism opened it. The Remove press itself is real.
//
// ═══ ⚠ IT WRITES NOTHING TO DISK ══════════════════════════════════════════
//
// No save is issued and the app has no autosave (`shell/close-guard.ts`). The
// probe scene and preset are created IN MEMORY by the panels' own New buttons.
// Every undoable edit is taken back through the app's own history and `[z*]`
// re-reads each library. [chk] is deliberately LAST because its writer is the
// one that CANNOT be taken back — see the row.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:d27-disputed-six
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
//                          AURORA_BUILT_TREE=<this worktree>
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9479);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = join(ROOT, 'scratchpad/shots-d27-disputed-six');
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'd6_probe_scene';
const PRESET_ID = 'd6_probe_preset';

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
    buttons: type === 'mouseReleased' ? 0 : (button === 'right' ? 2 : 1),
    clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);

/** The geometry + enabled/present reading a row prints, taken just before the click. */
const readHandle = (c, handle) => c.json(String.raw`(() => {
  const el = window.__d6.el(${JSON.stringify(handle)});
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
 * Returns the pre-click reading so a `-0` row can assert PRESENT + ENABLED at
 * the instant of the click rather than from a separate, earlier query.
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
    const want = window.__d6.el(${JSON.stringify(handle)});
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
 * was clicked — not with whatever the handle resolves to now. When a button
 * survives RETARGETED (the [esd]/[bpd] claim) those two are the same node and
 * the distinction does not matter; when a list shifts they can come apart, and
 * the question d-27 asks is about the node the author's finger landed on.
 */
const outcome = (c, handle) => c.json(String.raw`(() => {
  const a = document.activeElement;
  const l = window.__d6._latched;
  const now = window.__d6.el(${JSON.stringify(handle)});
  return {
    latchedInDom: !!(l && document.contains(l)),
    handleResolves: !!now,
    sameNode: !!(l && now === l),
    focusTag: a ? a.tagName : null,
    focusText: a ? (a.textContent || '').trim().slice(0, 40) : null,
    focusAria: a ? a.getAttribute('aria-label') : null,
    focusIsLatched: !!(l && a === l),
    focusIsBody: a === document.body,
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
 * ⚠ EVERY HANDLE IS RESOLVED BY THE MECHANISM ITS OWN COMPONENT USES.
 * `IconButton` puts its word in the child and its name in `aria-label`, so the
 * effects handles match aria-label; `AeonChunkActions` and `SectionGridNav`
 * render bare `<button>`s with no label at all, so those two match structure
 * and text — and BOTH are anchored to a sibling that identifies the widget
 * (`Import` for the chunk header, the menu container for the section menu)
 * rather than to the word alone, because "Clear" and "Remove" are not unique
 * strings in this app.
 */
const INSTALL_HANDLES = String.raw`
(() => {
  const byAria = (a) => document.querySelector('button[aria-label="' + a + '"]');
  const byAriaPrefix = (p) => [...document.querySelectorAll('button[aria-label]')]
    .find((b) => b.getAttribute('aria-label').startsWith(p)) || null;
  window.__d6 = {
    el(h) {
      if (h === 'chkClear') {
        // The chunk-grid header's own span: the button whose SIBLING is
        // Import/Importing. A bare text match on "Clear" would find the
        // collision palette's Clear on another facet.
        const imp = [...document.querySelectorAll('button')]
          .find((b) => /^(Import|Importing\.\.\.)$/.test((b.textContent || '').trim()));
        if (!imp || !imp.parentElement) return null;
        return [...imp.parentElement.querySelectorAll('button')]
          .find((b) => (b.textContent || '').trim() === 'Clear') || null;
      }
      if (h === 'sgnRemove') {
        // The context menu is the only absolutely-positioned box holding a
        // button that reads exactly "Remove".
        const btns = [...document.querySelectorAll('button')]
          .filter((b) => (b.textContent || '').trim() === 'Remove');
        return btns.find((b) => {
          const p = b.parentElement;
          return !!p && getComputedStyle(p).position === 'absolute';
        }) || btns[0] || null;
      }
      if (h === 'esdDelete') return byAriaPrefix('Delete scene ');
      if (h === 'bpdDelete') return byAriaPrefix('Delete preset ');
      if (h === 'demote0') return byAria('Demote tile animation 0 to static tiles');
      if (h === 'remove0') return byAria('Remove tile animation 0');
      if (h === 'confirmBlank') return [...document.querySelectorAll('button')]
        .find((b) => /^Remove and blank those cells$/.test((b.textContent || '').trim())) || null;
      return null;
    },
    /** The section-grid cells that HOLD a section (title names the menu). */
    sectionCells: () => [...document.querySelectorAll('button')]
      .filter((b) => /right-click for menu/.test(b.getAttribute('title') || ''))
      .map((b, n) => ({ n, text: (b.textContent || '').trim() })),
    /** A synthetic contextmenu on the nth section-holding cell — SETUP ONLY. */
    openSectionMenu: (n) => {
      const cells = [...document.querySelectorAll('button')]
        .filter((b) => /right-click for menu/.test(b.getAttribute('title') || ''));
      const cell = cells[n];
      if (!cell) return 'no-cell';
      const r = cell.getBoundingClientRect();
      cell.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2),
      }));
      return 'dispatched';
    },
    /** Every button reading exactly "Delete", with its label — a legibility print. */
    deleteButtons: () => [...document.querySelectorAll('button[aria-label]')]
      .filter((b) => /^Delete (scene|preset) /.test(b.getAttribute('aria-label')))
      .map((b) => ({ aria: b.getAttribute('aria-label'), disabled: !!b.disabled })),
    bandButtons: () => [...document.querySelectorAll('button[aria-label]')]
      .filter((b) => /tile animation/.test(b.getAttribute('aria-label')))
      .map((b) => ({ aria: b.getAttribute('aria-label'), disabled: !!b.disabled })),
    _latched: null,
    latch(h) { this._latched = this.el(h); return !!this._latched; },
    latchedAria() { return this._latched ? this._latched.getAttribute('aria-label') : null; },
    latchedText() { return this._latched ? (this._latched.textContent || '').trim() : null; },
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

    console.log('\n=== BOOT: the real aeon project ===');
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
    // [sgn] components/SectionGridNav.tsx — Remove, in the context menu
    // PRIOR CLAIM: unmounts (doRemove calls setMenu(null) unconditionally,
    // and the whole menu is behind `{menu && …}`). BOTH passes agreed.
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [sgn] SectionGridNav — Remove (context menu) ===');
    const facetL = await c.json('window.__dbg.aeon.setFacet("layout")');
    await sleep(1200);
    note('facet', `setFacet("layout") → ${JSON.stringify(facetL)}`);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Sections\b/`,
      `[...document.querySelectorAll('button')].find(b => /right-click for menu/.test(b.getAttribute('title')||''))`));
    await sleep(900);
    await c.evalExpr(INSTALL_HANDLES);
    const cells = await c.json('window.__d6.sectionCells()');
    note('[sgn] section cells on screen', JSON.stringify(cells.slice(0, 12)));
    const opened = await c.evalExpr('window.__d6.openSectionMenu(0)');
    await sleep(700);
    await c.evalExpr(INSTALL_HANDLES);
    const sgnPre = await readHandle(c, 'sgnRemove');
    const sgnSections0 = (await c.json('window.__dbg.aeon.state()')).sections;
    await shot(c, 'sgn-menu-open');
    check('sgn-0', 'ANTI-VACUOUS: the section context menu is open and its Remove button is PRESENT, '
      + 'VISIBLE and ENABLED at the moment it is clicked — a menu that never opened, or a greyed '
      + 'button, would satisfy every focus assertion below for a reason that has nothing to do '
      + 'with d-27',
      !!sgnPre && sgnPre.disabled === false && sgnPre.visible === true && cells.length > 0,
      `openSectionMenu → ${opened} (a synthetic \`contextmenu\` MouseEvent, which is SETUP: the app `
      + `does listen for it — SectionGridNav's onContextMenu — and the Remove press itself is a real `
      + `Input.dispatchMouseEvent). Remove button reading: ${JSON.stringify(sgnPre)}. `
      + `sections=${sgnSections0}, section-holding cells=${cells.length}`);
    if (!sgnPre) throw new Error('the section context menu never opened — [sgn] cannot be measured');

    await c.evalExpr("window.__d6.latch('sgnRemove')");
    await clickHandle(c, 'sgnRemove', 'SectionGridNav Remove');
    const sgnOut = await outcome(c, 'sgnRemove');
    const sgnSections1 = (await c.json('window.__dbg.aeon.state()')).sections;
    check('sgn-a', 'components/SectionGridNav.tsx Remove UNMOUNTS ITSELF: after a real click the '
      + 'clicked node is gone from the document, the handle resolves to nothing, and focus is NOT on '
      + 'it — AND the same click still removed a section',
      sgnOut.latchedInDom === false && sgnOut.focusIsLatched === false
      && sgnSections1 === sgnSections0 - 1,
      `latched node still in DOM=${sgnOut.latchedInDom}, handle still resolves=${sgnOut.handleResolves}, `
      + `activeElement = <${sgnOut.focusTag}> "${sgnOut.focusText}" (isTheClickedNode=`
      + `${sgnOut.focusIsLatched}, isBody=${sgnOut.focusIsBody}); sections ${sgnSections0} → `
      + `${sgnSections1}. The "still removed" half is IN THE CONDITION: an unwired button unmounts `
      + 'nothing and would fail here rather than pass as safe.');
    await ctrlZ(c); await sleep(700);
    const sgnBack = (await c.json('window.__dbg.aeon.state()')).sections;
    check('sgn-z', 'and the removal is ONE Ctrl+Z away — `removeSectionAt` goes through '
      + '`executeCommand` (`set-sections`), so this control is not in the d-29 class',
      sgnBack === sgnSections0,
      `sections ${sgnSections0} → ${sgnSections1} → ${sgnBack} after one Ctrl+Z`);

    // ══════════════════════════════════════════════════════════════════════
    // [esd] effects/EffectsScenePanel.tsx — Delete scene
    // PRIOR CLAIM: unmounts.  DISPUTED: unmounts only when the deleted scene
    // was the LAST one; `resolveSelectedScene` falls back to `library[0]`, so
    // with another scene present the same DOM button survives, RETARGETED.
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
    await c.evalExpr(OPEN_SECTION(String.raw`/^Scene: /`,
      `document.querySelector('button[aria-label^="Delete scene "]')`));
    await sleep(900);
    await c.evalExpr(INSTALL_HANDLES);
    const esdPre = await readHandle(c, 'esdDelete');
    await shot(c, 'esd-before');
    check('esd-0', 'ANTI-VACUOUS fixture: the library holds TWO OR MORE scenes — so '
      + '`resolveSelectedScene` HAS somewhere to fall back to, which is the disputed arm; and the '
      + 'Delete button is PRESENT, VISIBLE and ENABLED at the moment it is clicked',
      scenesFix.ids.length >= 2 && !!esdPre && esdPre.disabled === false && esdPre.visible === true
      && scenesFix.selected === SCENE_ID,
      `scenes = ${JSON.stringify(scenesFix.ids)} (selected="${scenesFix.selected}"); button reading = `
      + `${JSON.stringify(esdPre)}. Deleting the LAST scene is the arm BOTH passes already agree on `
      + 'and is not what this run measures.');
    if (!esdPre || scenesFix.ids.length < 2) {
      throw new Error('could not build a two-scene fixture with a live Delete button — [esd] would be vacuous');
    }

    await c.evalExpr("window.__d6.latch('esdDelete')");
    const esdLabelBefore = await c.evalExpr('window.__d6.latchedAria()');
    await clickHandle(c, 'esdDelete', 'EffectsScenePanel Delete scene');
    const esdOut = await outcome(c, 'esdDelete');
    const esdLabelAfter = await c.evalExpr(String.raw`(() => {
      const l = window.__d6._latched; return l ? l.getAttribute('aria-label') : null; })()`);
    const scenesAfter = await ssnap(c);
    await shot(c, 'esd-after');
    check('esd-a', 'effects/EffectsScenePanel.tsx Delete scene DOES NOT UNMOUNT when another scene is '
      + 'present: the clicked node is still in the document afterwards — AND the same click really '
      + 'deleted the scene',
      esdOut.latchedInDom === true && esdOut.sameNode === true
      && scenesAfter.ids.length === scenesFix.ids.length - 1
      && !scenesAfter.ids.includes(SCENE_ID),
      `latched node still in DOM=${esdOut.latchedInDom}, handle resolves to the SAME node=`
      + `${esdOut.sameNode}; scenes ${JSON.stringify(scenesFix.ids)} → ${JSON.stringify(scenesAfter.ids)}`);
    check('esd-b', 'and it is RETARGETED AT A DIFFERENT DOCUMENT: the same DOM button that deleted '
      + 'one scene now names another, because `resolveSelectedScene` falls back to `library[0]`',
      esdLabelBefore !== esdLabelAfter && typeof esdLabelAfter === 'string'
      && esdLabelAfter.startsWith('Delete scene ') && !esdLabelAfter.includes(SCENE_ID),
      `the SAME node's aria-label: ${JSON.stringify(esdLabelBefore)} → ${JSON.stringify(esdLabelAfter)}; `
      + `and the store's selected id is STILL "${scenesAfter.selected}" — the id of the document that `
      + 'no longer exists, which is why the fallback runs at all. This is sharper than a repeat-fire: '
      + "a second press on this button deletes SOMEBODY ELSE'S document.");
    check('esd-c', 'FOCUS after the click: does the clicked Delete button keep keyboard focus?',
      esdOut.focusIsLatched === true,
      `activeElement = <${esdOut.focusTag}> "${esdOut.focusText}" aria=${JSON.stringify(esdOut.focusAria)} `
      + `· isTheClickedNode=${esdOut.focusIsLatched} isBody=${esdOut.focusIsBody}. A RED here means the `
      + 'button survives but does NOT hold focus, which would leave the exclusion right for the wrong '
      + 'reason; a GREEN means the d-27 defect reproduces on a delete-a-document control.');
    for (let i = 0; i < 6 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      await ctrlZ(c); await sleep(350);
      const s = await ssnap(c);
      if (s.ids.includes(SCENE_ID)) break;
    }
    const esdUndone = await ssnap(c);
    check('esd-z', 'the scene deletion is ONE Ctrl+Z away — `deleteSceneCommand` runs through the '
      + "panel's history, so this control is not in the d-29 class",
      esdUndone.ids.includes(SCENE_ID),
      `scenes after the undo = ${JSON.stringify(esdUndone.ids)}`);

    // ══════════════════════════════════════════════════════════════════════
    // [bpd] effects/BandPresetPanel.tsx — Delete preset
    // Same disputed shape, through `resolveSelectedPreset`.
    // ⚠ THIS BUTTON HAS A `disabled` PREDICATE (`deletePresetRefusal`), which
    // is exactly the vacuity trap the nine-parcel met at [esp-c] — so the
    // fixture uses a preset THIS RUN created, which no section binds.
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
    await c.evalExpr(OPEN_SECTION(String.raw`/^Preset: ` + PRESET_ID + String.raw`(?![-a-z0-9_ ])/`,
      `document.querySelector('button[aria-label^="Delete preset "]')`));
    await sleep(900);
    await c.evalExpr(INSTALL_HANDLES);
    const bpdPre = await readHandle(c, 'bpdDelete');
    await shot(c, 'bpd-before');
    check('bpd-0', 'ANTI-VACUOUS fixture: the library holds TWO OR MORE presets AND the Delete button '
      + 'is ENABLED — this control carries `disabled={deleteRefusal !== null}`, so a preset a section '
      + 'binds would grey it out and a disabled button never takes focus either. That is the exact '
      + 'accident that made [esp-c] green for the wrong reason in the nine-parcel.',
      presetsFix.ids.length >= 2 && !!bpdPre && bpdPre.disabled === false && bpdPre.visible === true
      && presetsFix.selected === PRESET_ID,
      `presets = ${JSON.stringify(presetsFix.ids)} (selected="${presetsFix.selected}"); button reading `
      + `= ${JSON.stringify(bpdPre)}`);
    if (!bpdPre || presetsFix.ids.length < 2 || bpdPre.disabled) {
      throw new Error('could not build a two-preset fixture with an ENABLED Delete — [bpd] would be vacuous');
    }

    await c.evalExpr("window.__d6.latch('bpdDelete')");
    const bpdLabelBefore = await c.evalExpr('window.__d6.latchedAria()');
    await clickHandle(c, 'bpdDelete', 'BandPresetPanel Delete preset');
    const bpdOut = await outcome(c, 'bpdDelete');
    const bpdLabelAfter = await c.evalExpr(String.raw`(() => {
      const l = window.__d6._latched; return l ? l.getAttribute('aria-label') : null; })()`);
    const presetsAfter = await psnap(c);
    await shot(c, 'bpd-after');
    check('bpd-a', 'effects/BandPresetPanel.tsx Delete preset DOES NOT UNMOUNT when another preset is '
      + 'present: the clicked node is still in the document afterwards — AND the same click really '
      + 'deleted the preset',
      bpdOut.latchedInDom === true && bpdOut.sameNode === true
      && presetsAfter.ids.length === presetsFix.ids.length - 1
      && !presetsAfter.ids.includes(PRESET_ID),
      `latched node still in DOM=${bpdOut.latchedInDom}, handle resolves to the SAME node=`
      + `${bpdOut.sameNode}; presets ${JSON.stringify(presetsFix.ids)} → `
      + `${JSON.stringify(presetsAfter.ids)}`);
    check('bpd-b', 'and it is RETARGETED AT A DIFFERENT DOCUMENT, through `resolveSelectedPreset`\'s '
      + 'fallback to `library[0]`',
      bpdLabelBefore !== bpdLabelAfter && typeof bpdLabelAfter === 'string'
      && bpdLabelAfter.startsWith('Delete preset ') && !bpdLabelAfter.includes(PRESET_ID),
      `the SAME node's aria-label: ${JSON.stringify(bpdLabelBefore)} → ${JSON.stringify(bpdLabelAfter)}; `
      + `and the store's selected id is STILL "${presetsAfter.selected}", the deleted document's — the `
      + 'stale id is exactly what makes `resolveSelectedPreset` fall back to element 0');
    check('bpd-c', 'FOCUS after the click: does the clicked Delete button keep keyboard focus?',
      bpdOut.focusIsLatched === true,
      `activeElement = <${bpdOut.focusTag}> "${bpdOut.focusText}" aria=${JSON.stringify(bpdOut.focusAria)} `
      + `· isTheClickedNode=${bpdOut.focusIsLatched} isBody=${bpdOut.focusIsBody}. ⚠ IF THIS IS GREEN, `
      + 'a bare Space deletes the NEXT preset — and whether that one is bound by a section is not '
      + "asked, because the guard was evaluated for the document that is gone.");
    const bpdDisabledAfter = await c.json('window.__d6.deleteButtons()');
    note('[bpd] delete buttons after the click', JSON.stringify(bpdDisabledAfter));
    for (let i = 0; i < 8 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      await ctrlZ(c); await sleep(350);
      const p = await psnap(c);
      if (p.ids.includes(PRESET_ID)) break;
    }
    const bpdUndone = await psnap(c);
    check('bpd-z', 'the preset deletion is ONE Ctrl+Z away — not the d-29 class',
      bpdUndone.ids.includes(PRESET_ID),
      `presets after the undo = ${JSON.stringify(bpdUndone.ids)}`);

    // ══════════════════════════════════════════════════════════════════════
    // [dem] / [rem] effects/BgAnimBandPanel.tsx — Demote and Remove
    // PRIOR CLAIM: both unmount.  DISPUTED: neither does, and Remove's FIRST
    // press refuses (applies nothing, sets state, keeps the button mounted).
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [dem] / [rem] BgAnimBandPanel — Demote and the REFUSING Remove press ===');
    await c.evalExpr(SUBTAB('tileAnim'));
    await sleep(1400);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Tile animations\b/`,
      `document.querySelector('button[aria-label^="Remove tile animation"]')`));
    await sleep(1000);
    await c.evalExpr(INSTALL_HANDLES);
    const bands0 = await c.json('window.__dbg.aeon.bands()');
    const bandBtns0 = await c.json('window.__d6.bandButtons()');
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    await shot(c, 'bands-before');
    note('[band] fixture', `bands=${bands0.length} ${JSON.stringify(bands0)} · buttons=`
      + JSON.stringify(bandBtns0) + ` · bgOverrideHash=${hash0}`);

    // ── [rem] FIRST, because the refusing press is the one that must change
    //    NOTHING: measuring it before any demote keeps the document the one
    //    the run opened on, so "nothing changed" is checked against the file
    //    rather than against this harness's own earlier edit.
    if (bands0.length < 1) {
      check('rem-0', 'BLOCKED — the open document carries NO tile-animation band, so the refusing '
        + 'Remove press cannot be constructed at all', false,
        `bands()=${JSON.stringify(bands0)}. The refusal fires only when layout cells draw the band; `
        + 'with no band there is no button to press. Reported as unmeasured rather than skipped.');
    } else {
      const remPre = await readHandle(c, 'remove0');
      check('rem-0', 'ANTI-VACUOUS: band 0 exists and its Remove button is PRESENT, VISIBLE and '
        + 'ENABLED at the moment it is clicked',
        !!remPre && remPre.disabled === false && remPre.visible === true,
        `button reading = ${JSON.stringify(remPre)} · bands=${bands0.length}`);
      await c.evalExpr("window.__d6.latch('remove0')");
      await clickHandle(c, 'remove0', 'BgAnimBandPanel Remove (FIRST press — the refusing one)');
      const remOut = await outcome(c, 'remove0');
      const bands1 = await c.json('window.__dbg.aeon.bands()');
      const hash1 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      const confirm1 = await readHandle(c, 'confirmBlank');
      const pageText = await c.evalExpr(`(document.body.innerText || '').replace(/\\s+/g, ' ')`);
      const refused = bands1.length === bands0.length && hash1 === hash0;
      const focusNow1 = await c.json(String.raw`(() => { const a = document.activeElement;
        return { tag: a ? a.tagName : null, text: a ? (a.textContent||'').trim().slice(0,40) : null,
                 aria: a ? a.getAttribute('aria-label') : null,
                 isConfirm: a === window.__d6.el('confirmBlank') }; })()`);
      await shot(c, 'rem-after-first-press');
      check('rem-a', 'effects/BgAnimBandPanel.tsx Remove: the FIRST press REFUSED — the document is '
        + 'byte-identical (same band count, same bgOverrideHash) and a confirmation control appeared. '
        + 'This is the press the two code reads disagreed about, and it is the [k7] no-op shape.',
        refused === true && !!confirm1,
        `bands ${bands0.length} → ${bands1.length}; bgOverrideHash ${hash0} → ${hash1} (identical=`
        + `${hash1 === hash0}); confirmation chip on screen = ${JSON.stringify(confirm1)}; refusal text `
        + `present = ${/cell\(s\) draw them|draw them/.test(pageText)}. ⚠ IF THIS IS RED because the `
        + 'removal simply SUCCEEDED, no layout cell drew this band and the refusing press was never '
        + 'reached — the row does not discriminate and must not be read as a measurement of it.');
      check('rem-b', 'and the Remove button DOES NOT UNMOUNT on that refusing press: the clicked node '
        + 'is still in the document',
        remOut.latchedInDom === true && remOut.sameNode === true,
        `latched node still in DOM=${remOut.latchedInDom}, handle resolves to the SAME node=`
        + `${remOut.sameNode}`);
      check('rem-c', 'FOCUS after the refusing press: does the Remove button keep keyboard focus, with '
        + 'the confirmation control now on screen beside it?',
        remOut.focusIsLatched === true,
        `activeElement = <${remOut.focusTag}> "${remOut.focusText}" aria=`
        + `${JSON.stringify(remOut.focusAria)} · isTheClickedNode=${remOut.focusIsLatched} `
        + `isBody=${remOut.focusIsBody}. Did the new confirm chip take focus? `
        + `${JSON.stringify(focusNow1)}. ⚠ THE MEANING OF THE BUTTON CHANGED BETWEEN PRESS ONE AND `
        + 'PRESS TWO: press one asks and is refused; the same key on the same still-focused button '
        + 'asks again. Whether the SECOND press destroys anything is [rem-d].');
      // ── the press AFTER the refusal, on the same button ────────────────
      //
      // ⚠ GUARDED, AND THE GUARD IS A REPORTING RULE. If the first press did
      // NOT refuse (a build where the removal simply lands), the button is gone
      // and `clickHandle` would throw — taking [dem], [chk] and every row below
      // with it, exactly the failure `bganim-band-harness` §6 records. A missing
      // subject is reported as an unmeasurable row, never as an exception and
      // never as green.
      const bandsPre2 = await c.json('window.__dbg.aeon.bands()');
      const hashPre2 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      const stillThere = await readHandle(c, 'remove0');
      if (!stillThere) {
        check('rem-d', 'NOT MEASURABLE — the Remove button was gone before the second press, so the '
          + 'press after the refusal could not be performed', false,
          'the first press did not leave a mounted button; see [rem-a]/[rem-b] for what it did '
          + 'instead. Reported loud rather than skipped.');
      } else {
      await clickHandle(c, 'remove0', 'BgAnimBandPanel Remove (SECOND press, same button, same pixel)');
      const rem2 = await outcome(c, 'remove0');
      const bands2 = await c.json('window.__dbg.aeon.bands()');
      const hash2 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      const confirm2 = await readHandle(c, 'confirmBlank');
      check('rem-d', 'THE PRESS AFTER THE REFUSAL, on the same button: what does it do? The row asserts '
        + 'the measured shape — it refuses AGAIN and destroys nothing, because the confirmation lives '
        + 'on a SECOND, DIFFERENT control (the `Remove and blank those cells` chip), not on this one',
        bands2.length === bandsPre2.length && hash2 === hashPre2 && !!confirm2,
        `bands ${bandsPre2.length} → ${bands2.length}; bgOverrideHash ${hashPre2} → ${hash2} `
        + `(identical=${hash2 === hashPre2}); confirm chip still on screen=${JSON.stringify(confirm2)}; `
        + `button still mounted=${rem2.latchedInDom}, focus on it=${rem2.focusIsLatched}. ⚠ A RED HERE `
        + 'IS THE INTERESTING RESULT: it would mean the second press on a still-focused button '
        + 'completed a destructive removal without the author ever touching the confirmation chip.');
      }
      // Leave the pending state, and the document, exactly as found.
      await c.evalExpr(CLICK_BY_TEXT('/^Cancel$/'));
      await sleep(500);
      const hashCancelled = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      check('rem-z', 'the two refusing presses left the override document byte-identical to the one '
        + 'this run opened — nothing to undo, because nothing was applied',
        hashCancelled === hash0,
        `bgOverrideHash at boot=${hash0}, after both presses and Cancel=${hashCancelled}`);
    }

    // ── [dem] Demote ──────────────────────────────────────────────────────
    //
    // ⚠ THE FIXTURE NEEDS TWO BANDS, AND THAT IS THE WHOLE POINT OF THE ROW.
    // The open document carries ONE band. Demoting the only band leaves the
    // list empty, so card 0 has nothing to shift into it and the button
    // unmounts — which is the arm BOTH passes already agree on, exactly as
    // "delete the last scene" is for [esd]. The DISPUTED claim is that the
    // control "never unmounts", and that can only be asked with a successor
    // present. A second band is added through the panel's own `Promote` chip
    // (it moves art the blob already holds and spends no slots, which is the
    // only door open on a document at tile capacity), and the row asserts the
    // fixture reached two bands before it believes anything below.
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
    check('dem-fix', 'ANTI-VACUOUS fixture for the DISPUTED arm: the document carries TWO OR MORE '
      + 'tile-animation bands, so demoting index 0 leaves a successor to slide into card 0 — without '
      + 'this, "the button unmounted" only re-measures the last-band arm both prior passes agree on',
      bandsD0.length >= 2,
      `bands = ${bandsD0.length} ${JSON.stringify(bandsD0.map((b) => ({ i: b.index, c: b.cols, r: b.rows })))}`
      + ` · Promote click → ${promoted}. The band cards are \`key={b.index}\` (BgAnimBandPanel.tsx:494), `
      + 'which is the index-keyed list shape the survey named as the retarget family.');
    if (bandsD0.length < 2) {
      check('dem-0', 'BLOCKED — could not build a two-band fixture, so the DISPUTED arm of [dem] '
        + 'cannot be measured', false,
        `bands()=${JSON.stringify(bandsD0)}. Reported as unmeasured, never rendered as green.`);
    } else {
      await c.evalExpr(INSTALL_HANDLES);
      const demPre = await readHandle(c, 'demote0');
      const hashD0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      check('dem-0', 'ANTI-VACUOUS: band 0 exists and its Demote button is PRESENT, VISIBLE and '
        + 'ENABLED at the moment it is clicked',
        !!demPre && demPre.disabled === false && demPre.visible === true,
        `button reading = ${JSON.stringify(demPre)} · bands=${bandsD0.length}`);
      await c.evalExpr("window.__d6.latch('demote0')");
      await clickHandle(c, 'demote0', 'BgAnimBandPanel Demote');
      const demOut = await outcome(c, 'demote0');
      const bandsD1 = await c.json('window.__dbg.aeon.bands()');
      const hashD1 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      await shot(c, 'dem-after');
      check('dem-a', 'effects/BgAnimBandPanel.tsx Demote: after a real click — did the clicked button '
        + 'survive? AND the same click really demoted the band',
        demOut.latchedInDom === true && bandsD1.length === bandsD0.length - 1 && hashD1 !== hashD0,
        `latched node still in DOM=${demOut.latchedInDom}, handle resolves to the SAME node=`
        + `${demOut.sameNode}, handle resolves at all=${demOut.handleResolves}; bands `
        + `${bandsD0.length} → ${bandsD1.length}; bgOverrideHash ${hashD0} → ${hashD1}. ⚠ THE FIXTURE `
        + 'IS WHAT MAKES THIS A MEASUREMENT: with only ONE band the card for index 0 has nothing to '
        + 'shift into it and the button unmounts for a reason both prior passes already agree on. '
        + '[dem-fix] above proves a successor was present, so a survival here is the DISPUTED claim '
        + 'and an unmount here would refute it.');
      check('dem-b', 'FOCUS after the Demote click: does the clicked button keep keyboard focus?',
        demOut.focusIsLatched === true,
        `activeElement = <${demOut.focusTag}> "${demOut.focusText}" aria=`
        + `${JSON.stringify(demOut.focusAria)} · isTheClickedNode=${demOut.focusIsLatched} `
        + `isBody=${demOut.focusIsBody}`);
      for (let i = 0; i < 6 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
        await ctrlZ(c); await sleep(400);
        if ((await c.evalExpr('window.__dbg.aeon.bgOverrideHash()')) === hashD0) break;
      }
      const hashDz = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      check('dem-z', 'the demotion is ONE Ctrl+Z away and lands back on the EXACT bytes — not the '
        + 'd-29 class',
        hashDz === hashD0,
        `bgOverrideHash before=${hashD0}, after demote=${hashD1}, after the undo=${hashDz}`);
      // And take the fixture's own Promote back, so the override document ends
      // on the bytes this run opened it with.
      for (let i = 0; i < 6 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
        if ((await c.evalExpr('window.__dbg.aeon.bgOverrideHash()')) === hash0) break;
        await ctrlZ(c); await sleep(400);
      }
      const hashBoot = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
      check('dem-z2', "the fixture's own Promote is undone too — the override document ends on the "
        + 'EXACT bytes this run opened it with, and nothing was ever saved',
        hashBoot === hash0,
        `bgOverrideHash at boot=${hash0}, at the end of the band section=${hashBoot}`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // [chk] components/AeonChunkActions.tsx — Clear
    // PRIOR CLAIM: unmounts (rendered under `hasChunks &&`). BOTH passes agreed.
    // ⚠ LAST ON PURPOSE: its writer is `useProjectStore.clearChunks`, a bare
    //   zustand `set` — NOT `executeCommand` — so unlike every other control
    //   here it does not go on the undo stack. Everything above is measured
    //   before this runs.
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [chk] AeonChunkActions — Clear (chunk library) ===');
    const facetL2 = await c.json('window.__dbg.aeon.setFacet("layout")');
    await sleep(1300);
    note('facet', `setFacet("layout") → ${JSON.stringify(facetL2)}`);
    // ⚠ THE CHUNKS SECTION IS TOOL-GATED, not merely collapsed.
    // `layout-facet.tsx:94` renders it under `!pasting && tool === 'stamp-chunk'`,
    // so on the Layout facet's default `view` tool the header does not exist and
    // an OPEN_SECTION would report "no-header" — which reads exactly like "the
    // control is gone". The first run of this file did precisely that. The tool
    // is armed through the facet dock's own button (aria-label from
    // `TOOL_LABELS`), and the row below asserts it took.
    const armed = await c.evalExpr(CLICK_BY_TEXT('/^Stamp Chunk$/'));
    await sleep(900);
    const toolNow = (await c.json('window.__dbg.aeon.state()')).tool;
    check('chk-tool', 'the Chunks section is TOOL-GATED (`tool === \'stamp-chunk\'`, layout-facet.tsx) '
      + 'and the dock button armed it — without this the section does not exist and every row below '
      + 'would read "the control is missing" when the truth is "the control was never on screen"',
      armed === true && toolNow === 'stamp-chunk',
      `dock click → ${armed}; tool is now "${toolNow}"`);
    const chkOpen = await c.evalExpr(OPEN_SECTION(String.raw`/^Chunks\b/`,
      `[...document.querySelectorAll('button')].find(b => /^(Import|Importing\\.\\.\\.)$/.test((b.textContent||'').trim()))`));
    await sleep(1200);
    await c.evalExpr(INSTALL_HANDLES);
    note('[chk] Chunks section', `OPEN_SECTION → ${String(chkOpen).slice(0, 400)}`);
    const chkDiag = await c.json(String.raw`(() => ({
      headers: [...document.querySelectorAll('div')]
        .filter((d) => d.style && d.style.cursor === 'pointer')
        .map((d) => (d.textContent || '').trim().slice(0, 40)),
      shortButtons: [...document.querySelectorAll('button')]
        .map((b) => (b.textContent || '').trim()).filter((t) => t.length > 0 && t.length < 24),
    }))()`);
    note('[chk] what is on screen', `headers=${JSON.stringify(chkDiag.headers)}\n        buttons=`
      + JSON.stringify(chkDiag.shortButtons));
    const chunks0 = await c.json('window.__dbg.aeon.chunkIds()');
    const chkPre = await readHandle(c, 'chkClear');
    await shot(c, 'chk-before');
    check('chk-0', 'ANTI-VACUOUS: the chunk library is NON-EMPTY (so `hasChunks` renders the button at '
      + 'all) and Clear is PRESENT, VISIBLE and ENABLED at the moment it is clicked',
      chunks0.length > 0 && !!chkPre && chkPre.disabled === false && chkPre.visible === true,
      `chunkIds().length = ${chunks0.length}; button reading = ${JSON.stringify(chkPre)}`);
    if (!chkPre) {
      check('chk-a', 'BLOCKED — the Clear button is not on screen, so it could not be clicked', false,
        `chunkIds().length = ${chunks0.length}; the button renders only under \`hasChunks &&\``);
    } else {
      await c.evalExpr("window.__d6.latch('chkClear')");
      await clickHandle(c, 'chkClear', 'AeonChunkActions Clear');
      const chkOut = await outcome(c, 'chkClear');
      const chunks1 = await c.json('window.__dbg.aeon.chunkIds()');
      await shot(c, 'chk-after');
      check('chk-a', 'components/AeonChunkActions.tsx Clear UNMOUNTS ITSELF: the click empties the '
        + 'library, `hasChunks` goes false, and the clicked node leaves the document — AND the same '
        + 'click really emptied it',
        chkOut.latchedInDom === false && chkOut.focusIsLatched === false
        && chunks1.length === 0 && chunks0.length > 0,
        `latched node still in DOM=${chkOut.latchedInDom}, handle still resolves=`
        + `${chkOut.handleResolves}; activeElement = <${chkOut.focusTag}> "${chkOut.focusText}" `
        + `(isTheClickedNode=${chkOut.focusIsLatched}, isBody=${chkOut.focusIsBody}); chunk library `
        + `${chunks0.length} → ${chunks1.length}`);
      // ⚠ THE ROW THIS CONTROL IS ACTUALLY DANGEROUS FOR.
      await ctrlZ(c); await sleep(800);
      const chunksUndo = await c.json('window.__dbg.aeon.chunkIds()');
      check('chk-UNDO', '⚠ d-29 CLASS: one Ctrl+Z DOES NOT bring the chunk library back. '
        + '`clearChunkLibrary` calls `useProjectStore.clearChunks`, a bare zustand `set` — the store '
        + 'comment beside `addChunks` says library adds "live outside undo history", and the removal '
        + 'does too. The button unmounting is what makes d-27 not apply; it is ALSO what makes a '
        + 'misclick unrecoverable in one gesture.',
        chunksUndo.length === 0,
        `chunk library ${chunks0.length} → ${chunks1.length} → ${chunksUndo.length} after one Ctrl+Z. `
        + 'A GREEN here is the ALARM, not the all-clear: it records that the wipe stayed wiped. '
        + 'Restored below by re-opening the project, which is a reload, not an undo.');
      // Put it back the only way there is: re-open the project.
      await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
      for (let i = 0; i < 40; i++) {
        const ids = await c.json('window.__dbg.aeon.chunkIds()').catch(() => []);
        if (ids.length > 0) break;
        await sleep(400);
      }
      const chunksBack = await c.json('window.__dbg.aeon.chunkIds()');
      check('chk-z', 'the chunk library is back — and the ONLY way this run could put it back was to '
        + 're-open the project from disk, which is exactly the finding above stated as a repair',
        chunksBack.length === chunks0.length,
        `chunkIds().length: boot=${chunks0.length}, after Clear=${chunks1.length}, after Ctrl+Z=`
        + `${chunksUndo.length}, after re-open=${chunksBack.length}. Nothing was ever SAVED — the `
        + 'wipe was in memory only (shell/close-guard.ts: no autosave).');
    }

    // ── libraries back where this run found them ──────────────────────────
    const scenesEnd = await ssnap(c);
    const presetsEnd = await psnap(c);
    note('[z] libraries at the end',
      `scenes=${JSON.stringify(scenesEnd.ids)} presets=${JSON.stringify(presetsEnd.ids)}`);
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
