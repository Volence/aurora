// ═══════════════════════════════════════════════════════════════════════════
// coldread-c1 — WHAT AN UNTOUCHED PROJECT SAYS TO YOU ON ARRIVAL
// ═══════════════════════════════════════════════════════════════════════════
//
// The cold read of 2026-09-05 (`docs/reviews/2026-09-05-effects-cold-read.md`)
// opened the Effects tab on a project it had not edited and met a red mark:
//
//   C1  a red x greets you on an untouched project  |  the strip
//       reads as "you broke it" before the paragraph beside it is read
//
// THE VERDICT WAS CORRECT, which is what makes this hard. Section 0 genuinely
// cannot carry an editor-authored raster band until aeon threads it. The claim
// under test is therefore not "the mark is wrong" but "a right verdict is drawn
// in the vocabulary of damage", and that is a claim about WHAT IS PAINTED. A
// source assertion cannot see it. So every row below reads the running app.
//
// ── WHAT EACH ROW IS FOR ─────────────────────────────────────────────────
//
//   1x  ARRIVAL. Nothing has been touched. No mark and no paragraph may sit in
//       the alarm tier, AND the unmet condition must still be published and
//       still be told apart from a met one and from an unreadable one.
//   2x  THE CONDITION CONSTRUCTED, through the real control. Binding a
//       rasterRef to section 0 is exactly what makes aeon's gate fire on this
//       section, and the same row must then go to the alarm tier. These rows
//       PASS on a pre-fix build on purpose: they are the control that says the
//       distinction survived rather than being softened away.
//   3x  THE UNREADABLE CASE. One of aeon's two files is taken away and the row
//       must draw `?` in the faint tier, never a no. Also a control.
//
// ── THE PREDICATE, AND WHY IT IS NOT "IS IT ORANGE" ──────────────────────
//
// "Highlighted = background not transparent" once reported every row in this
// app highlighted. The tiers here are CSS custom properties, so the harness
// resolves `--warning`, `--success`, `--info` and `--text-faint` through a real
// probe element and compares the mark's own computed colour against those four
// strings. Row 2a is what proves the predicate discriminates: the SAME element,
// the SAME section, one real gesture apart, must move from one named tier to
// another. A predicate that cannot see that move fails 2a.
//
// ── MEASURED ON BOTH BUILDS, WHICH IS THE ONLY WAY A ROW EARNS TRUST ─────
//
// A row that cannot tell the fixture from the fix ships green and says nothing.
// Same harness, same clone, same screen size (1680x1050, dpr 1), one file apart:
//
//   a build of MASTER's sources   14 passed, 4 failed
//     [1b]  a mark IS in the alarm tier: "✗" warning
//     [1b2] and it IS the cross
//     [1d]  and the paragraph is in the alarm tier too, 107px of it
//     [2c]  unbinding does NOT put it back, because on master the alarm was
//           never conditional on anything: it is the same "✗" warning either way
//   this branch                   18 passed, 0 failed
//
// The other fourteen pass on BOTH, on purpose. 2a/2a2/2b are the escalation and
// 3a/3a2 the unreadable case: they are what says the distinctions survived
// rather than being softened away, and a parcel that broke them would go red
// here while [1b] still went green.
//
// ── RUN ──────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=$PWD \
//   COLDREAD_AEON=<a throwaway aeon clone> \
//   npm run harness:coldread-c1
//
// Two variables, not one: a linked worktree has neither `node_modules/.bin/
// electron` nor a `dist/` of its own, so with only the first the run-root
// resolver BORROWS the main checkout's built tree and every row below would
// describe an app this branch did not build. A borrowed root is refused.
//
// ⚠ IT NEVER PRESSES Build & Run and it never opens the live aeon tree. It DOES
// write to the clone: row 3a takes one of aeon's two wiring files away and puts
// it back, and rows 2x drive a real binding through the UI (in memory; nothing
// is saved). Point `COLDREAD_AEON` at a throwaway.

import { AURORA_DIR, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, existsSync, renameSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9541);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const SHOTS = join(ROOT, 'docs/captures/2026-09-06-coldread-c1');
const AEON = process.env.COLDREAD_AEON ?? '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** NOT a pass and NOT a zero. Its own bucket, and it makes the run non-zero. */
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURED  [${id}] ${name}\n        ${why}`);
  unmeasured.push(`[${id}] ${name}: ${why}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
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

async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
    return true;
  } catch { return false; }
}

const RECT = (sel) => `(() => { const e = ${sel}; if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`;

async function clickRect(c, rect, what) {
  if (!rect || rect.w < 1 || rect.h < 1) throw new Error(`no rect for ${what}: ${JSON.stringify(rect)}`);
  const x = Math.round(rect.x + rect.w / 2);
  const y = Math.round(rect.y + rect.h / 2);
  const hit = await c.evalExpr(
    `(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? e.tagName : 'null'; })()`);
  if (hit === 'null') throw new Error(`aim for ${what} hit nothing at ${x},${y}`);
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(250);
  return { x, y, hit };
}

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

const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

/**
 * A `CollapsibleSection`'s HEADER: a plain `<div onClick>` with `cursor:
 * pointer`, not a button and not a summary. A shut one renders NO children, so
 * the control inside it is absent from the DOM rather than hidden, and a
 * harness that skips this reports "the control was not found" about a control
 * one click away.
 */
const HEADER_RECT = (re) => String.raw`
(() => {
  const el = [...document.querySelectorAll('div')].filter((e) =>
    e.style && e.style.cursor === 'pointer' && ${re}.test((e.textContent || '').trim().slice(0, 80)))
    .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, text: (el.textContent||'').trim().slice(0, 60) };
})()`;

/**
 * Leave one card OPEN, whatever state it arrived in.
 *
 * ⚠ IDEMPOTENT ON PURPOSE. A header click TOGGLES, so a harness that simply
 * clicks SHUTS a card that arrived open and then reports the control missing.
 * The control count says which way it went, and a decrease is undone.
 * ⚠ AND IT SCROLLS FIRST. This column is thousands of pixels of content in a
 * ~742px scrollport, so most headers sit outside the window: their rects are
 * real and unclickable, and an aim taken without scrolling lands on a stranger.
 */
async function ensureOpen(c, reSrc, what) {
  const n = () => c.evalExpr('document.querySelectorAll("input,select").length');
  await c.evalExpr(String.raw`
    (() => { const e = [...document.querySelectorAll('div')].filter((x) =>
        x.style && x.style.cursor === 'pointer' && ${reSrc}.test((x.textContent||'').trim().slice(0,80)))
        .sort((a,b) => (a.textContent||'').length - (b.textContent||'').length)[0];
      if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  await sleep(400);
  const h = await c.json(HEADER_RECT(reSrc));
  if (!h) return { ok: false, why: `no header matching ${reSrc}` };
  const before = await n();
  await clickRect(c, h, what);
  await sleep(700);
  let after = await n();
  if (after < before) {
    const h2 = await c.json(HEADER_RECT(reSrc));
    await clickRect(c, h2 ?? h, what);
    await sleep(700);
    after = await n();
    return { ok: after >= before, why: `was already open (${before} to ${after})` };
  }
  if (after === before) return { ok: false, why: `click revealed no controls (${before})` };
  return { ok: true, why: `${before} to ${after} controls` };
}

/**
 * THE FOUR NAMED TIERS, RESOLVED THROUGH A REAL PROBE ELEMENT.
 *
 * The theme is CSS custom properties, so `T.warning` is the STRING
 * `var(--warning)` in source and something else entirely in `getComputedStyle`.
 * Painting a throwaway span in each tier and reading back its computed colour
 * is the only way to compare what is on screen against what the token means,
 * and it keeps working if the palette changes.
 */
const TIERS = String.raw`
(() => {
  const out = {};
  for (const name of ['warning', 'success', 'info', 'text-faint', 'text-lo', 'error']) {
    const p = document.createElement('span');
    p.style.color = 'var(--' + name + ')';
    document.body.appendChild(p);
    out[name] = getComputedStyle(p).color;
    p.remove();
  }
  return out;
})()`;

/** The three condition rows exactly as painted: glyph, colour, text. */
const CONDITIONS = String.raw`
(() => {
  const rows = [...document.querySelectorAll('[data-effects-wiring-condition]')];
  return rows.map((r) => {
    const sp = [...r.querySelectorAll('span')];
    return {
      n: r.getAttribute('data-effects-wiring-condition'),
      mark: sp[0] ? (sp[0].textContent || '').trim() : null,
      markColour: sp[0] ? getComputedStyle(sp[0]).color : null,
      markW: sp[0] ? Math.round(sp[0].getBoundingClientRect().width * 100) / 100 : null,
      label: sp[1] ? (sp[1].textContent || '').trim() : null,
      detail: sp[2] ? (sp[2].textContent || '').trim() : null,
      detailW: sp[2] ? Math.round(sp[2].getBoundingClientRect().width * 100) / 100 : null,
      rowH: Math.round(r.getBoundingClientRect().height * 100) / 100,
      title: (r.getAttribute('title') || '').slice(0, 120),
    };
  });
})()`;

/** The strip's own geometry, plus the advisory paragraph under it. */
const GEOMETRY = String.raw`
(() => {
  const strip = document.querySelector('[data-effects-section-strip]');
  const adv = document.querySelector('[data-effects-section-advisory]');
  const advText = adv ? adv.querySelector('div') : null;
  const bind = document.querySelector('[data-effects-section-bindings]');
  let s = strip && strip.parentElement;
  while (s && s !== document.body) {
    const o = getComputedStyle(s);
    if (/auto|scroll/.test(o.overflowY) || /auto|scroll/.test(o.overflowX)) break;
    s = s.parentElement;
  }
  const sr = s && s !== document.body ? s.getBoundingClientRect() : null;
  const br = strip ? strip.getBoundingClientRect() : null;
  return {
    stripH: br ? Math.round(br.height * 100) / 100 : null,
    stripTop: br ? Math.round(br.y * 100) / 100 : null,
    scrollerTop: sr ? Math.round(sr.y * 100) / 100 : null,
    scrollerH: sr ? s.clientHeight : null,
    scrollerContentH: sr ? s.scrollHeight : null,
    bindText: bind ? (bind.textContent || '').trim() : null,
    advH: adv ? Math.round(adv.getBoundingClientRect().height * 100) / 100 : 0,
    advColour: advText ? getComputedStyle(advText).color : null,
    advText: adv ? (adv.textContent || '').trim().slice(0, 120) : null,
  };
})()`;

/** Name the tier a colour belongs to, or say it belongs to none of them. */
function tierOf(colour, tiers) {
  if (colour === null) return 'none';
  for (const [name, value] of Object.entries(tiers)) if (value === colour) return name;
  return `unnamed(${colour})`;
}

/** The aeon effects library this project reads, found under the clone. */
function findEffectsLibrary(root) {
  const games = join(root, 'games');
  if (!existsSync(games)) return null;
  for (const game of readdirSync(games)) {
    const dir = join(games, game, 'data', 'effects');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('_effects.emp')) return join(dir, f);
  }
  return null;
}

/**
 * Open the project and land on the Effects tab, WAITING for the tab rather than
 * sleeping at it.
 *
 * ⚠ A FIXED SLEEP AFTER `open()` IS A COIN FLIP. Measured here: the same clone,
 * the same build, opened inside 2.5s on three runs and not on the fourth, and
 * the failure surfaced as "no rect for Effects tab" — which reads as a missing
 * control rather than as the harness being early. It polls, and only refuses
 * after the wait it actually spent.
 */
async function openOnEffects(c, dir) {
  await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(dir)})`);
  const EFFECTS_TAB = `[...document.querySelectorAll('button')]`
    + `.find((e) => /^Effects\\b/.test((e.textContent||'').trim()))`;
  for (let i = 0; i < 40; i++) {
    const r = await c.json(RECT(EFFECTS_TAB));
    if (r && r.w >= 1 && r.h >= 1) {
      await clickRect(c, r, 'Effects tab');
      await sleep(1200);
      return r;
    }
    await sleep(500);
  }
  throw new Error(`the Effects tab never appeared after 20s of waiting on ${dir}. The project did `
    + 'not open, so every row below would read off a screen this harness never made.');
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree, so the app under test '
      + `would be ${RUN.root}, whose dist/ does not contain this branch's edits. Every row below `
      + 'would describe the wrong build. Set ELECTRON_BIN and AURORA_BUILT_TREE.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) {
      throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}. Left alone `
        + 'this reaches xvfb-run and fails 45s later as "CDP target never appeared", which reads '
        + 'as a timing problem rather than a missing build.');
    }
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);

  if (AEON === '' || !existsSync(AEON)) {
    throw new Error('COLDREAD_AEON must name a throwaway aeon clone to open. Row 3a moves one of '
      + 'its files and puts it back, so this must never be a tree anybody is working in.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM. The override-aware `siblingPath` would compare
  // the clone against itself and let the REAL tree through, failing open on
  // exactly the case this guard exists for.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEON) === resolve(liveAeon)) {
    throw new Error(`Refusing: COLDREAD_AEON names aeon's DEFAULT checkout (${liveAeon}), a live `
      + 'lane tree another agent is editing. Point it at a clone.');
  }

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  let c;
  let movedLibrary = null;
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
    if (!haveDbg) throw new Error('window.__dbg absent: needs a VITE_AURORA_DEBUG=1 build');

    const dpr = await c.evalExpr('window.devicePixelRatio');
    note('dpr', `devicePixelRatio = ${dpr} (printed beside every positional reading below)`);

    await openOnEffects(c, AEON);

    const tiers = await c.json(TIERS);
    note('the named tiers, resolved in the running app', JSON.stringify(tiers));

    // ───────────────────────────────────────────────────────────────────────
    // 1x — ARRIVAL. Nothing has been touched.
    // ───────────────────────────────────────────────────────────────────────

    const rows0 = await c.json(CONDITIONS);
    const geo0 = await c.json(GEOMETRY);
    note('arrival, section 0', rows0.map((r) =>
      `[${r.n}] "${r.mark}" ${tierOf(r.markColour, tiers)} ${r.label} :: ${r.detail}`).join('\n        '));
    note('arrival geometry', JSON.stringify(geo0));
    await shot(c, '01-arrival');

    // THE ROW EVERY OTHER ROW HANGS OFF. If this project happens to be fully
    // wired there is no unmet condition on screen and nothing below means
    // anything, so this is a hard refusal rather than a green.
    const unmetRows = rows0.filter((r) => r.mark !== '✓' && r.mark !== '?');
    check('1a', 'rig: an untouched project really does show an unmet condition on arrival',
      rows0.length === 3 && unmetRows.length >= 1,
      `${rows0.length} rows, ${unmetRows.length} unmet: `
      + `${unmetRows.map((r) => `[${r.n}] "${r.mark}"`).join(' ') || '(none, so every row below would be vacuous)'}`);

    if (unmetRows.length === 0) {
      cannotMeasure('1b/1c/1d', 'C1 on arrival',
        'this project has no unmet condition on section 0, so the screen C1 is about was never '
        + 'reached. Nothing below was measured.');
    } else {
      const alarm = rows0.filter((r) => r.markColour === tiers.warning || r.markColour === tiers.error);
      check('1b', 'C1: no mark on an untouched project is drawn in the alarm tier',
        alarm.length === 0,
        alarm.length === 0
          ? `all ${rows0.length} marks: ${rows0.map((r) => `"${r.mark}" ${tierOf(r.markColour, tiers)}`).join(' · ')}`
          : `${alarm.length} in the alarm tier: ${alarm.map((r) => `[${r.n}] "${r.mark}" ${tierOf(r.markColour, tiers)}`).join(' · ')}`);
      check('1b2', 'C1: and none of them is the cross, which reads right/wrong whatever its colour',
        rows0.every((r) => r.mark !== '✗'),
        rows0.map((r) => `"${r.mark}"`).join(' '));

      // ⚠ THE OTHER HALF, AND THE ONE THAT MAKES 1b MEAN SOMETHING. A strip that
      // simply stopped marking unmet conditions would pass 1b and be a worse
      // tool. The unmet mark must still be published, still differ from a met
      // one, and still differ from the unreadable tier.
      const met = rows0.filter((r) => r.mark === '✓');
      const u = unmetRows[0];
      check('1c', 'and the unmet condition is still marked, still apart from a met one',
        u.mark !== null && u.mark !== '' && met.length > 0
          && u.mark !== met[0].mark && u.markColour !== met[0].markColour,
        `unmet [${u.n}] "${u.mark}" ${tierOf(u.markColour, tiers)} vs met [${met[0]?.n}] `
        + `"${met[0]?.mark}" ${tierOf(met[0]?.markColour, tiers)}`);
      check('1c2', 'and apart from the unreadable tier, which must never be confusable with a no',
        u.markColour !== tiers['text-faint'] && u.mark !== '?',
        `unmet mark is ${tierOf(u.markColour, tiers)}, the unreadable tier is text-faint`);
      check('1c3', 'and it still names the fact, in the level data\'s own terms',
        typeof u.detail === 'string' && u.detail.length > 0, JSON.stringify(u.detail));

      check('1d', 'C1: and the paragraph beside it is not in the alarm tier either',
        geo0.advColour === null || geo0.advColour !== tiers.warning,
        `advisory is ${tierOf(geo0.advColour, tiers)}, ${geo0.advH}px tall: ${JSON.stringify(geo0.advText)}`);
      check('1d2', 'and not one word of that paragraph was dropped to get there',
        geo0.advH >= 90,
        `${geo0.advH}px of paragraph still on screen (it was 107px before this parcel)`);
    }

    // THE HEIGHT CLAIM. The strip is PERMANENT, so a fix that buys calm with
    // pixels is a different defect. Measured against the figure this parcel
    // recorded on a build of master's sources at the same size.
    const MASTER_STRIP_H = 147.53;
    check('1e', 'the permanent strip is no taller than it was before this parcel',
      geo0.stripH !== null && geo0.stripH <= MASTER_STRIP_H + 0.01,
      `strip ${geo0.stripH}px vs ${MASTER_STRIP_H}px measured on a build of master's sources, `
      + `in a ${geo0.scrollerH}px scrollport (dpr ${dpr})`);
    check('1e2', 'and no wider: the mark cell is the advance it always was',
      rows0.every((r) => r.markW !== null && r.markW <= 6.9),
      rows0.map((r) => `[${r.n}] "${r.mark}" ${r.markW}px`).join(' · ')
      + ' (master: 6.8px for the tick, 6px for the cross)');
    check('1e3', 'and the strip is still pinned to the scrollport it sticks to',
      geo0.stripTop !== null && geo0.scrollerTop !== null
        && Math.abs(geo0.stripTop - geo0.scrollerTop) <= 1,
      `strip y ${geo0.stripTop} vs scroller y ${geo0.scrollerTop} `
      + '(never checkVisibility: it goes green on an element scrolled 2,635px out of this scroller)');

    // ───────────────────────────────────────────────────────────────────────
    // 2x — THE CONDITION CONSTRUCTED, through the real control
    // ───────────────────────────────────────────────────────────────────────
    //
    // Binding a rasterRef to section 0 is precisely what makes aeon's gate fire
    // on this section: `effects_seam_gate` reads the sidecar's `rasterRef` and
    // says nothing at all about a section that has none. So the same row, one
    // real gesture later, must be in the alarm tier.

    const colour = await c.json(
      `(() => { const t = document.querySelector('[data-effects-sub-tab="colour"]');
        if (!t) return null; const r = t.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    if (!colour) {
      cannotMeasure('2a', 'the escalation to the alarm tier',
        'the Colour sub-tab was not found, so the rasterRef control was never reached and NOTHING '
        + 'about the escalation was measured. A quiet mark with no measured escalation is exactly '
        + 'the softening this parcel must not be.');
    } else {
      await clickRect(c, colour, 'Colour sub-tab');
      await sleep(900);
      // ⚠ CASE-INSENSITIVE. These headings render in Title Case; matching them
      // against an UPPERCASE transcription finds nothing, which surfaces as an
      // UNMEASURED row rather than as the rig fault it is.
      const cardOpen = await ensureOpen(c, String.raw`/^Raster band presets/i`, 'Raster band presets');
      note('raster band presets card', JSON.stringify(cardOpen));
      const REF_SELECT = SEL_BY_TITLE(String.raw`/^Which raster band preset this section uses/`);
      const options = await c.json(String.raw`
        (() => { const e = ${REF_SELECT}; return e ? [...e.options].map((o) => o.value) : null; })()`);
      const pick = options === null ? null : options.find((v) => v !== '');
      if (pick === null || pick === undefined) {
        cannotMeasure('2a', 'the escalation to the alarm tier',
          `no bindable preset was on offer (options = ${JSON.stringify(options)}), so the `
          + 'condition could not be constructed and NOTHING below was measured.');
      } else {
        const before = (await c.json(GEOMETRY)).bindText;
        const set = await c.evalExpr(SET_SELECT(REF_SELECT, pick));
        await sleep(900);
        const rows1 = await c.json(CONDITIONS);
        const geo1 = await c.json(GEOMETRY);
        note('after binding a rasterRef to section 0', rows1.map((r) =>
          `[${r.n}] "${r.mark}" ${tierOf(r.markColour, tiers)} ${r.label} :: ${r.detail}`).join('\n        '));

        // ANTI-VACUOUS. Without this, an unchanged screen and a working control
        // are the same reading, and the first one reads as the second.
        check('2z', 'rig: the binding gesture really landed, and the strip says so',
          set === 'ok' && geo1.bindText !== before && String(geo1.bindText).includes(pick),
          `set=${set} · "${before}" became "${geo1.bindText}" (bound ${pick})`);

        const nowAlarm = rows1.filter((r) => r.markColour === tiers.warning);
        check('2a', 'the SAME condition escalates to the alarm tier once a rasterRef is bound',
          nowAlarm.length >= 1,
          nowAlarm.length >= 1
            ? `${nowAlarm.map((r) => `[${r.n}] "${r.mark}" ${r.label}`).join(' · ')} `
              + '(this row also passes on a pre-fix build: it is the control that says the '
              + 'distinction survived)'
            : `no mark reached the alarm tier: ${rows1.map((r) => `[${r.n}] "${r.mark}" ${tierOf(r.markColour, tiers)}`).join(' · ')}`);
        check('2a2', 'and it does so as the cross, the mark this app uses for a refusal',
          rows1.some((r) => r.mark === '✗' && r.markColour === tiers.warning),
          rows1.map((r) => `"${r.mark}" ${tierOf(r.markColour, tiers)}`).join(' · '));
        check('2b', 'and the paragraph goes with it, so the two surfaces never disagree',
          geo1.advColour === tiers.warning,
          `advisory is ${tierOf(geo1.advColour, tiers)} (it was ${tierOf(geo0.advColour, tiers)} on arrival)`);
        await shot(c, '02-bound-escalates');

        // PUT IT BACK, so row 3a measures the arrival state and not this one.
        await c.evalExpr(SET_SELECT(REF_SELECT, ''));
        await sleep(700);
        const geo2 = await c.json(GEOMETRY);
        check('2c', 'and unbinding puts it back: the alarm is a statement about NOW, not a latch',
          !String(geo2.bindText).includes(pick)
            && (await c.json(CONDITIONS)).every((r) => r.markColour !== tiers.warning),
          `bindings line back to "${geo2.bindText}"`);
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // 3x — THE UNREADABLE CASE, which must never become a no
    // ───────────────────────────────────────────────────────────────────────
    //
    // `raster-binding.ts`'s standing refusal turns on exactly this: a row that
    // reads "no" because a file was missing is indistinguishable, to the author,
    // from one that reads "no" because the thing is impossible. This parcel
    // rewrote the expression that chooses the mark, so the branch is measured
    // rather than assumed.

    const lib = findEffectsLibrary(AEON);
    if (lib === null) {
      cannotMeasure('3a', 'the unreadable file still draws `?` and never a no',
        `no <zone>_effects.emp was found under ${AEON}/games/*/data/effects, so the unreadable `
        + 'case could not be constructed and NOTHING about it was measured.');
    } else {
      movedLibrary = `${lib}.coldread-c1-moved`;
      renameSync(lib, movedLibrary);
      note('row 3a fixture', `moved ${lib} aside`);
      await openOnEffects(c, AEON);
      const rows2 = await c.json(CONDITIONS);
      note('with the effects library taken away', rows2.map((r) =>
        `[${r.n}] "${r.mark}" ${tierOf(r.markColour, tiers)} ${r.label} :: ${r.detail}`).join('\n        '));
      const unknown = rows2.filter((r) => r.mark === '?');
      check('3a', 'a file that cannot be read draws `?` in the faint tier, never a no',
        unknown.length >= 1 && unknown.every((r) => r.markColour === tiers['text-faint']),
        unknown.length === 0
          ? `NO row drew the question mark: ${rows2.map((r) => `[${r.n}] "${r.mark}" ${tierOf(r.markColour, tiers)}`).join(' · ')}`
          : unknown.map((r) => `[${r.n}] "${r.mark}" ${tierOf(r.markColour, tiers)} :: ${r.detail}`).join(' · '));
      check('3a2', 'and it says which file, so the author can tell absent from impossible',
        unknown.some((r) => /could not read/.test(r.detail || '')),
        unknown.map((r) => JSON.stringify(r.detail)).join(' · '));
      await shot(c, '03-library-unreadable');
      renameSync(movedLibrary, lib);
      movedLibrary = null;
    }

    console.log(`\n${'='.repeat(70)}`);
    const pass = results.filter((r) => r.ok).length;
    console.log(`ROWS: ${pass} passed, ${fails.length} failed, ${unmeasured.length} UNMEASURED`);
    if (fails.length) console.log(`FAILED:\n  ${fails.join('\n  ')}`);
    if (unmeasured.length) console.log(`UNMEASURED (not a pass, not a zero):\n  ${unmeasured.join('\n  ')}`);
    console.log(`shots: ${SHOTS}`);
    // ⚠ AN UNMEASURED ROW MAKES THE RUN NON-ZERO. A harness whose exit code
    // ignores what it could not reach reports a partial run as a clean one.
    process.exitCode = (fails.length || unmeasured.length) ? 1 : 0;
  } finally {
    // ⚠ THE FIXTURE IS PUT BACK EVEN WHEN A ROW THREW. A harness that moves a
    // file aside and dies leaves the clone permanently mis-wired, and the next
    // run measures a project nobody meant to make.
    if (movedLibrary !== null && existsSync(movedLibrary)) {
      renameSync(movedLibrary, movedLibrary.replace(/\.coldread-c1-moved$/, ''));
      console.log('cleanup: row 3a fixture restored');
    }
    try { c?.close(); } catch { /* closing */ }
    const { killTree } = await import('./lib/harness-guard.mjs');
    await killTree(child);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
