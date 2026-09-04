#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// THE NO-BUILD DISCLOSURE IS GONE FROM THE SCREEN — AT ALL FIVE MOUNT SITES
//
// EW-BOUNDARY-LAG-RETIRE. aeon's `boundary` generator arm landed (origin/master
// b3af9847, re-confirmed at 75cd390f), so the sentence the preset panel painted
// above five sets of controls — "aeon's generator does not accept it at
// origin/master and refuses the WHOLE DOCUMENT, so a preset carrying the key
// will not build" — became FALSE. `PRESET_KEYS_AWAITING_AEON` is empty and
// `presetLagDisclosure()` returns null on an empty list, so the sentence should
// have left every surface with NO edit to any card.
//
// ⚠ THE NODE SUITE CANNOT SEE THAT. ~7,100 vitest rows pass while a React
// surface is visibly broken; they call the leaf as a plain function and walk the
// element tree it RETURNS. That proves a return value, not a pixel. This drives
// the built app under CDP and measures the screen.
//
// ═══ ⚠ "THE SENTENCE IS ABSENT" IS THE EASIEST VACUOUS CHECK IN THE WORLD ═══
//
// It passes on a blank screen, an unloaded project, a panel that failed to
// render, a section left collapsed, and a typo in the selector. So NO absence is
// reported on its own. Every site has TWO rows and the absence row is only
// reached through the first:
//
//   [<site>-a]  THE INSTRUMENT SAW ITS SUBJECT — the surface is UP: the
//               document is in the arm this card belongs to (read back through
//               window.__dbg.aeon.presetsJson(), not inferred from the screen),
//               and a control that ONLY this surface has is PRESENT, VISIBLE,
//               ENABLED and INSIDE ITS OWN SCROLLER.
//   [<site>-b]  and only then: the disclosure's lead words are ABSENT from the
//               page.
//
// A site whose -a row fails reports its -b row as UNMEASURED, never as a pass.
//
// ═══ ⚠ AND THE FINDER ITSELF IS PROVEN TO WORK, TWICE ═══
//
//   [ctl] ON EVERY RUN: the SAME finder, on the SAME screen, at the same moment,
//         locates a sentence that IS there (the panel's own "Saved to
//         data/editor/effects/presets/<id>.json" hint) and reports it painted.
//         An absence measured by a finder that can find nothing is not a
//         measurement.
//
//   THE PAIRED RUN: this file is run TWICE, and `LAG_EXPECT` says which state is
//         expected. `LAG_EXPECT=absent` (default) is production. `LAG_EXPECT=
//         present` is run against a build whose PRESET_KEYS_AWAITING_AEON was
//         stubbed back to ['boundary'] ON DISK and rebuilt — the exact shape of
//         the day a lag re-opens. The same five sites, the same selectors, the
//         same gestures: the sentence must be PAINTED at every one. That pair is
//         what makes the absence a measurement instead of a hope, and it is the
//         runtime half of the poison whose load-bearing direction inverted when
//         the premise retired.
//
// ═══ ⚠ NO EMULATOR, AND THE LIMIT IS NARROWER THAN IT LOOKS ═══
//
// Nothing here touches oracle or any emulator MCP tool. Nothing here has seen a
// boundary preset BUILD, and nothing here claims one has: what retired is a
// sentence about what aeon's PAGE ACCEPTS. This harness measures only that the
// sentence left the screen.
//
// ⚠ IT WRITES NOTHING TO AEON. The project opened is a FRESH COPY extracted from
// `git archive origin/master` per run, never the live checkout, so a stray save
// cannot reach the owner's tree and a preset aeon lands mid-run cannot change
// what this measured.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:lag-retire
// The paired poison run:   LAG_EXPECT=present npm run harness:lag-retire
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
//                          AURORA_BUILT_TREE=<this worktree>
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9497);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const SHOTS = join(ROOT, 'scratchpad/shots-lag-retire');
mkdirSync(SHOTS, { recursive: true });

/**
 * WHICH STATE THIS RUN EXPECTS, and the reason it is a parameter rather than two
 * files. The absence rows and the presence rows must use the SAME selectors, the
 * same gestures and the same finder, or the paired run proves nothing about the
 * production run. One file, one switch.
 */
const EXPECT = process.env.LAG_EXPECT === 'present' ? 'present' : 'absent';

/**
 * ⚠ THE NEEDLE AND THE PREMISE ARE READ OFF THE PRODUCTION SOURCE, NEVER TYPED.
 *
 * A harness that spelled "Not consumed by the engine yet." itself would keep
 * reporting ABSENT for ever after somebody reworded the sentence — the absence
 * would be the harness's own typo, not the retirement, and nothing would say so.
 * `PRESET_LAG_LEAD` is the export `PresetLagDisclosure` renders through, and
 * `PRESET_KEYS_AWAITING_AEON` is the premise the paired poison run stubs.
 *
 * Read from the .ts SOURCE rather than imported, because this is a `.mjs` node
 * process and the module is TypeScript. The regexes are anchored on `export
 * const <name>` and this throws — loudly, before the app is spawned — if either
 * stops matching, so a rename cannot silently turn every row below vacuous.
 *
 * ⚠ AND IT IS READ FROM THE TREE THE BUILD WAS MADE FROM (`RUN.root`), not from
 * this script's own checkout. Those are two different directories whenever a
 * harness borrows a built tree, and the sentence on screen is the BUILT one's.
 */
const LAG_SRC_PATH = join(RUN.root, 'src/core/formats/effects/preset-lag.ts');
function readLagSource() {
  let src;
  try { src = readFileSync(LAG_SRC_PATH, 'utf8'); }
  catch (e) { throw new Error(`cannot read ${LAG_SRC_PATH} (${e.code}) — the needle for every row `
    + 'below is derived from it, so this refuses rather than measuring nothing'); }
  const lead = /^export const PRESET_LAG_LEAD = '([^']+)';$/m.exec(src);
  if (!lead) {
    throw new Error(`PRESET_LAG_LEAD is no longer a single-quoted literal in ${LAG_SRC_PATH}. `
      + 'Every row below hunts for that string on screen; deriving it is the whole reason an '
      + 'absence here means anything, so this refuses rather than typing it.');
  }
  const keys = /^export const PRESET_KEYS_AWAITING_AEON: readonly string\[\] = Object\.freeze\(\[([^\]]*)\]\);$/m
    .exec(src);
  if (!keys) {
    throw new Error(`PRESET_KEYS_AWAITING_AEON is no longer an Object.freeze([...]) literal in `
      + `${LAG_SRC_PATH} — the paired poison run derives its expectation from it.`);
  }
  return {
    lead: lead[1],
    keys: [...keys[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
  };
}
const LAG_SRC = readLagSource();
const LEAD = LAG_SRC.lead;
const PREMISE = LAG_SRC.keys;

// ⚠ MUST NOT COLLIDE WITH A PRESET AEON SHIPS. The fixture is created THROUGH
// the panel into a copy of aeon's editor tree, so its id shares a namespace with
// every preset aeon commits; a short id (`ramp_probe`) collided with a real file
// aeon landed hours later and every row after it measured somebody else's
// document.
const PRESET_ID = 'aurora_local_lagretire_probe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/**
 * ⚠ NOT A PASS AND NOT A ZERO. A row whose subject could not be reached says so
 * in its own bucket and makes the run non-zero. "Couldn't measure" rendered as
 * green is how a whole surface goes untested while a rig reports success — and
 * on THIS harness it is the specific way a false green would arrive, because
 * every absence row would pass on a surface that never rendered.
 */
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURED  [${id}] ${name}\n        ${why}`);
  unmeasured.push(`[${id}] ${name} — ${why}`);
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
      .map((d) => (d.innerText || '').trim().split('\n')[0]);
    return 'no-header; headers on screen: ' + JSON.stringify(seen);
  }
  hdr.click();
  return 'clicked';
})()`;

/** Drive a real `change` through React's synthetic layer. */
const SET_SELECT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  if (![...el.options].some((o) => o.value === ${JSON.stringify(String(value))})) {
    return 'no-such-option: ' + JSON.stringify([...el.options].map((o) => o.value));
  }
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

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

/**
 * A CONTROL BY THE LABEL OF ITS OWN ROW, never by position. `Field` renders
 * `<div><span>label</span>{control}</div>`, so a control's parent's first child
 * is its label. Every anchor below is an `===`-style anchored regex because this
 * panel is full of near-identical spinners.
 */
const IN_ROW = (labelRe, tag) => String.raw`
(() => {
  return [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((el) => {
      const row = el.parentElement;
      const lab = row && row.firstElementChild;
      return !!(lab && lab.tagName === 'SPAN' && ${labelRe}.test((lab.textContent || '').trim()));
    }) || null;
})()`;

const PROGRAM_SEL = IN_ROW(String.raw`/^Program$/`, 'select');
const ADD_BAND = String.raw`([...document.querySelectorAll('button')]
  .find((b) => /^Add raster band$/.test((b.textContent || '').trim())) || null)`;

/**
 * ⚠ IS IT PAINTED — a real element whose rect lands inside its OWN scroller?
 *
 * `checkVisibility()` and `getClientRects()` BOTH GO GREEN on an element
 * scrolled thousands of pixels out of its scroller, so the rect is compared
 * against the SCROLLING ANCESTOR's box and never merely against zero. `dpr` is
 * printed beside every reading because it has been observed at both 1 and 1.35
 * in one session on this machine.
 */
const PAINTED = (needle) => String.raw`
(() => {
  const all = [...document.querySelectorAll('div,span')]
    .filter((e) => (e.innerText || '').includes(${JSON.stringify(needle)}));
  if (!all.length) return { found: false, matches: 0, dpr: window.devicePixelRatio };
  // The SHORTEST element carrying the needle — the smallest thing an author
  // could point at and say "it says that". \`.pop()\` alone takes the innermost
  // match, which for this leaf is a 31-character lead <span> inside the Hint
  // that carries the rest of the sentence.
  const hit = all.slice().sort(
    (a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
  hit.scrollIntoView({ block: 'center' });
  const b = hit.getBoundingClientRect();
  let sc = hit.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  const sb = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const full = (hit.innerText || '').trim().replace(/\s+/g, ' ');
  return {
    found: true, matches: all.length, tag: hit.tagName,
    w: b.width, h: b.height, dpr: window.devicePixelRatio,
    rect: { top: Math.round(b.top), left: Math.round(b.left), bottom: Math.round(b.bottom), right: Math.round(b.right) },
    scrollerRect: { top: Math.round(sb.top), left: Math.round(sb.left), bottom: Math.round(sb.bottom), right: Math.round(sb.right) },
    inScroller: b.bottom > sb.top && b.top < sb.bottom && b.right > sb.left && b.left < sb.right,
    scroller: sc ? (sc.className || sc.tagName) : 'viewport',
    length: full.length,
    text: full.slice(0, 260) + (full.length > 260 ? ' …[truncated for the console only]' : ''),
    full,
  };
})()`;

/** Geometry + enabled/present for one control, the anti-vacuous reading. */
const readSel = (c, selector) => c.json(String.raw`(() => {
  const el = ${selector};
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const b = el.getBoundingClientRect();
  let sc = el.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  const sb = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName, disabled: !!el.disabled,
    w: Math.round(b.width), h: Math.round(b.height), dpr: window.devicePixelRatio,
    rect: { top: Math.round(b.top), left: Math.round(b.left) },
    visible: cs.visibility !== 'hidden' && cs.display !== 'none' && b.width > 0 && b.height > 0,
    inScroller: b.bottom > sb.top && b.top < sb.bottom && b.right > sb.left && b.left < sb.right,
    scroller: sc ? (sc.className || sc.tagName) : 'viewport',
  };
})()`);

async function doc(c) {
  const all = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
  return all.find((p) => p.id === PRESET_ID) ?? null;
}

const ARM_KEYS = ['bands', 'ramp', 'base_swap', 'boundary'];
/** Which exclusive arm the document actually carries, read from the DOCUMENT. */
function armOf(d) {
  if (!d) return null;
  const on = ARM_KEYS.filter((k) => d[k] !== undefined);
  return on.length === 1 ? on[0] : `AMBIGUOUS(${on.join(',')})`;
}

async function convertArm(c, want) {
  const r = await c.evalExpr(SET_SELECT(PROGRAM_SEL, want));
  await sleep(900);
  return `native value setter + real \`change\` (${r}); document arm is now ${armOf(await doc(c))}`;
}

/**
 * A FRESH, WRITABLE COPY OF AEON, PER RUN — never the live checkout.
 *
 * `git archive origin/master | tar -x`: a committed revision, so nothing a peer
 * lands mid-run can move what this measured, and nothing this run does can reach
 * the owner's tree.
 */
function aeonCopy() {
  const src = siblingPathOrUnresolved('aeon');
  if (!src || !existsSync(src)) return { ok: false, why: `aeon checkout not resolved (got ${src})` };
  const dest = join(tmpdir(), `aurora-lagretire-aeon-${process.pid}`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  let rev;
  try {
    rev = execSync('git rev-parse origin/master', { cwd: src, encoding: 'utf8' }).trim();
    execSync(`git archive origin/master | tar -x -C ${JSON.stringify(dest)}`,
      { cwd: src, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    return { ok: false, why: `git archive from ${src} failed: ${e.message}` };
  }
  return { ok: true, dir: dest, rev, src };
}

async function main() {
  assertFreshBuild(RUN);
  console.log(`\n=== EXPECTING THE DISCLOSURE TO BE ${EXPECT.toUpperCase()} `
    + `(LAG_EXPECT=${process.env.LAG_EXPECT ?? '<unset, default absent>'}) ===`);
  console.log(`    needle, read off ${LAG_SRC_PATH}: ${JSON.stringify(LEAD)}`);
  console.log(`    PRESET_KEYS_AWAITING_AEON in that source: ${JSON.stringify(PREMISE)}`);

  // ⚠ THE RUN'S EXPECTATION MUST MATCH THE PREMISE IT WAS BUILT FROM. Running
  // the poison expectation against a production tree (or the reverse) would fail
  // five rows and read as a broken feature rather than as a mis-invoked rig, and
  // the two runs' whole value is that they differ ONLY in the premise on disk.
  const impliedByDisk = PREMISE.length === 0 ? 'absent' : 'present';
  if (impliedByDisk !== EXPECT) {
    throw new Error(`LAG_EXPECT=${EXPECT} but PRESET_KEYS_AWAITING_AEON on disk is `
      + `${JSON.stringify(PREMISE)}, which implies the sentence should be ${impliedByDisk}. `
      + 'Either the wrong expectation was passed, or the tree was not rebuilt after the premise '
      + 'was changed. Refusing rather than reporting five failures that would read as a broken '
      + 'panel.');
  }

  const copy = aeonCopy();
  if (!copy.ok) throw new Error(`cannot make a fresh aeon copy — ${copy.why}`);
  note('aeon copy', `${copy.dir}\n        extracted from ${copy.src} at origin/master ${copy.rev}`);

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

    console.log('\n=== BOOT: a FRESH COPY of aeon at origin/master (never the live checkout) ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(copy.dir)})`)
      .catch((e) => note('aeon open threw', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('b1', 'the aeon copy is open, with sections — without this NOTHING below is measurable, '
      + 'and every "the sentence is absent" row would pass on an empty screen',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');
    await sleep(1500);

    // ══════════════════════════════════════════════════════════════════════
    // FIXTURE — a bands preset of this run's own making
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== FIXTURE: a fresh BANDS preset, created through the panel ===');
    await c.evalExpr(CLICK_BY_TEXT('/^Effects$/'));
    await sleep(1500);
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1300);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Raster band presets\b/`,
      `document.querySelector('input[placeholder="new_preset_id"]')`));
    await sleep(900);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_preset_id"]')`, PRESET_ID));
    await sleep(400);
    await c.evalExpr(CLICK_BY_TEXT('/^New$/'));
    await sleep(1400);
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(PRESET_ID)})`);
    await sleep(900);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Preset — ` + PRESET_ID + String.raw`(?![-a-z0-9_ ])/`,
      `[...document.querySelectorAll('button')].some(b => (b.textContent||'').trim() === 'Add raster band')`));
    await sleep(900);

    const fixtureDoc = await doc(c);
    const addPre = await readSel(c, ADD_BAND);
    await shot(c, `${EXPECT}-fixture`);
    check('f0', 'ANTI-VACUOUS FIXTURE: the probe preset exists, is a BANDS document of THIS run\'s '
      + 'making, and `Add raster band` is PRESENT, VISIBLE, IN ITS SCROLLER and ENABLED. Every '
      + 'row below is measured on a surface reached from this one',
      !!fixtureDoc && armOf(fixtureDoc) === 'bands'
      && !!addPre && addPre.disabled === false && addPre.visible === true && addPre.inScroller === true,
      `arm = ${armOf(fixtureDoc)}; Add raster band = ${JSON.stringify(addPre)}`);
    if (!fixtureDoc) throw new Error('the probe preset was never created — nothing below is measurable');

    // ══════════════════════════════════════════════════════════════════════
    // [ctl] THE FINDER WORKS ON THIS SCREEN, AT THIS MOMENT
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⚠ WITHOUT THIS ROW EVERY ABSENCE BELOW IS UNFALSIFIABLE. A finder that
    // returns nothing for a sentence that IS on screen returns nothing for the
    // disclosure too, and the run reports five clean passes. So the identical
    // machinery is aimed at a sentence the panel definitely renders — its own
    // "Saved to …/<id>.json" hint — and must find it PAINTED.
    console.log('\n=== [ctl] the finder is not blind: it locates a sentence that IS on screen ===');
    await c.evalExpr(OPEN_SECTION(
      String.raw`/^Preset — ` + PRESET_ID + String.raw` — cycles, variants/`,
      IN_ROW(String.raw`/^cycles$/`, 'select')));
    await sleep(900);
    // ⚠ THE NEEDLE IS THE PROBE'S OWN FILE PATH, AND THE FIRST SPELLING OF THIS
    // ROW WAS TOO LOOSE. `'Saved to'` matched SIXTEEN elements on this screen
    // and the shortest — which is what `PAINTED` deliberately selects — was a
    // different hint entirely ("Saved to section_0.meta.json as rasterRef."),
    // so the row failed against a finder that was working perfectly. A control
    // has to name something only its own subject says.
    const CTL_NEEDLE = `${PRESET_ID}.json`;
    const ctl = await c.json(PAINTED(CTL_NEEDLE));
    await shot(c, `${EXPECT}-ctl`);
    check('ctl', '⚠ THE CONTROL FOR EVERY ABSENCE ROW BELOW: the SAME finder, on the SAME screen, '
      + 'at the same moment, locates a sentence that really is there and reports it PAINTED (a '
      + 'real element whose rect lands inside its own scroller). A green absence measured by a '
      + 'blind finder is the vacuous result this row exists to rule out',
      !!ctl && ctl.found === true && ctl.inScroller === true && ctl.w > 0 && ctl.h > 0
      && ctl.full.includes('data/editor/effects/presets/'),
      `needle ${JSON.stringify(CTL_NEEDLE)}; control sentence = `
      + `${JSON.stringify(ctl && { ...ctl, full: undefined })}`);

    // ══════════════════════════════════════════════════════════════════════
    // THE FIVE MOUNT SITES
    // ══════════════════════════════════════════════════════════════════════
    //
    // BandPresetPanel.tsx lines 654, 686, 1560, 1799, 1925. The boundary
    // parcel's design claim was that the disclosure retires across ALL FIVE with
    // no edit to any card; a guard that checked one site and reported coverage
    // is the partial-coverage failure this repo has been bitten by, so each site
    // is reached by its own gesture and measured by its own pair of rows.
    const sites = [
      {
        id: 'ch', label: 'the CHANNELS section (cycles + variants) — panel line 654',
        arm: 'bands',
        control: IN_ROW(String.raw`/^cycles$/`, 'select'),
        controlName: 'the `cycles` state select',
        async reach() {
          await c.evalExpr(OPEN_SECTION(
            String.raw`/^Preset — ` + PRESET_ID + String.raw` — cycles, variants/`,
            IN_ROW(String.raw`/^cycles$/`, 'select')));
          await sleep(900);
        },
      },
      {
        id: 'an', label: 'the ANCHORS section (moving anchors) — panel line 686',
        arm: 'bands',
        control: IN_ROW(String.raw`/^Channel 0$/`, 'select'),
        controlName: 'the `Channel 0` anchor seed select',
        async reach() {
          await c.evalExpr(OPEN_SECTION(
            String.raw`/^Preset — ` + PRESET_ID + String.raw` — moving anchors/`,
            IN_ROW(String.raw`/^Channel 0$/`, 'select')));
          await sleep(900);
        },
      },
      {
        id: 'rp', label: 'the RAMP card — panel line 1560',
        arm: 'ramp',
        control: IN_ROW(String.raw`/^Top$/`, 'input'),
        controlName: 'the ramp `Top` spinner',
        async reach() { note('[rp] converting the arm', await convertArm(c, 'ramp')); },
      },
      {
        id: 'bs', label: 'the BASE-SWAP card — panel line 1799',
        arm: 'base_swap',
        control: IN_ROW(String.raw`/^Line$/`, 'input'),
        controlName: 'the base-swap `Line` spinner',
        async reach() { note('[bs] converting the arm', await convertArm(c, 'base_swap')); },
      },
      {
        id: 'bd', label: 'the BOUNDARY card — panel line 1925',
        arm: 'boundary',
        control: IN_ROW(String.raw`/^Lo$/`, 'input'),
        controlName: 'the boundary `Lo` spinner',
        async reach() { note('[bd] converting the arm', await convertArm(c, 'boundary')); },
      },
    ];

    for (const s of sites) {
      console.log(`\n=== [${s.id}] ${s.label} ===`);
      await s.reach();
      await sleep(500);
      const d = await doc(c);
      const ctrl = await readSel(c, s.control);
      await shot(c, `${EXPECT}-${s.id}`);

      const up = armOf(d) === s.arm
        && !!ctrl && ctrl.visible === true && ctrl.inScroller === true && ctrl.disabled === false;
      check(`${s.id}-a`, `THE INSTRUMENT SAW ITS SUBJECT — ${s.label} is UP: the document is in `
        + `the \`${s.arm}\` arm (read back from window.__dbg.aeon.presetsJson(), not inferred `
        + `from the screen) and ${s.controlName} is PRESENT, VISIBLE, ENABLED and INSIDE ITS OWN `
        + 'SCROLLER. Without this the row below would pass on a collapsed section, an unrendered '
        + 'card or a typo in the selector',
        up, `arm = ${armOf(d)} (wanted ${s.arm}); ${s.controlName} = ${JSON.stringify(ctrl)}`);

      if (!up) {
        cannotMeasure(`${s.id}-b`, `the disclosure at ${s.label}`,
          `[${s.id}-a] failed, so this surface was never on screen. Reporting the sentence as `
          + 'ABSENT here would be an absence of the surface, not of the sentence.');
        continue;
      }

      const lag = await c.json(PAINTED(LEAD));
      if (EXPECT === 'absent') {
        check(`${s.id}-b`, `⚠ THE NO-BUILD DISCLOSURE IS GONE FROM ${s.label} — the sentence that `
          + 'told an author their document "will not build" is not on this surface, measured on a '
          + 'surface [' + s.id + '-a] just proved is up and with a finder [ctl] just proved can '
          + 'see. WHAT A GREEN HERE RULES OUT: a card that hard-coded the sentence, a mount that '
          + 'kept rendering it from a stale copy, and a leaf whose retirement reached some '
          + 'surfaces and not this one',
          !!lag && lag.found === false,
          lag && lag.found
            ? `STILL PAINTED — ${lag.matches} element(s) carry it; dpr ${lag.dpr}; rect `
              + `${JSON.stringify(lag.rect)} in scroller ${JSON.stringify(lag.scrollerRect)}; `
              + `text = ${JSON.stringify(lag.text)}`
            : `absent (0 elements carry ${JSON.stringify(LEAD)}); dpr ${lag && lag.dpr}`);
      } else {
        // The key names are the PREMISE READ OFF DISK, never typed here, so this
        // row measures the tree it was actually built from.
        const namesEvery = !!lag && lag.found && PREMISE.every((k) => lag.full.includes(`\`${k}\``));
        check(`${s.id}-b`, `⚠ PAIRED POISON RUN: with PRESET_KEYS_AWAITING_AEON stubbed back to `
          + `${JSON.stringify(PREMISE)} ON DISK and rebuilt, the disclosure IS PAINTED at `
          + `${s.label} — a real element whose rect lands inside its own scroller — and it names `
          + 'every key in the premise plus the sharper-flavour wording. This is what makes the '
          + 'production run\'s absence a measurement: same file, same selectors, same gestures, '
          + 'opposite premise, opposite result',
          !!lag && lag.found === true && lag.inScroller === true && lag.w > 0 && lag.h > 0
          && namesEvery && lag.full.includes('WHOLE DOCUMENT')
          && lag.full.includes('will not build'),
          `painted = ${JSON.stringify(lag && { ...lag, full: undefined })}; names every premise `
          + `key ${JSON.stringify(PREMISE)} = ${namesEvery}`);
      }
    }

    console.log('\n=== leaving the app: the copy is disposable, so nothing is undone ===');
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
    rmSync(copy.dir, { recursive: true, force: true });
  }

  console.log(`\n══ ${results.filter((r) => r.ok).length}/${results.length} passed, `
    + `${unmeasured.length} unmeasured (expected the disclosure ${EXPECT.toUpperCase()}) ══`);
  console.log(`   shots: ${SHOTS}`);
  if (unmeasured.length) {
    console.log('\nUNMEASURED — not a pass and not a zero:');
    for (const u of unmeasured) console.log(`  ${u}`);
  }
  if (fails.length) {
    console.log('\nFAILED:');
    for (const f of fails) console.log(`  ${f}`);
  }
  if (fails.length || unmeasured.length) process.exit(1);
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e.stack || e.message}`); process.exit(1); });
