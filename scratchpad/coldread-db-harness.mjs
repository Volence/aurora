// ═══════════════════════════════════════════════════════════════════════════
// coldread D-B — the occupancy disclosure, WITNESSED ON A RUNNING APP
// ═══════════════════════════════════════════════════════════════════════════
//
// `docs/reviews/2026-09-05-effects-cold-read.md`, D-B: the strip printed
// `act: … threaded 5,6` and both of those sections already carried a preset, so
// every home the strip named was occupied and taking one made aeon's build red
// on the document that was displaced.
//
// The unit rows assert the two DERIVATIONS and that the two components call
// them. What they cannot see is the screen, and three of this parcel's claims
// are about the screen:
//
//   the act line   a THIRD set really renders on that one line, and the numbers
//                  in it are the sections whose sidecars really carry a ref.
//   the notice     it really paints under the Section select, in the NOTE tier,
//                  on an occupied section — and is really ABSENT on a free one.
//   the cost       the strip is PERMANENT, so a longer act line is charged to
//                  every screen. Height and horizontal overflow are measured
//                  rather than eyeballed (C9 is what an unmeasured 10px cost).
//
// ── WHAT THIS HARNESS DOES NOT DO ─────────────────────────────────────────
//
// ⚠ IT NEVER SAVES, and it never opens the live aeon checkout. It opens a
// THROWAWAY CLONE, read-only, and presses no Ctrl+S. It never presses
// Build & Run and calls no emulator tool.
//
// ── RUN ───────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=$PWD \
//   COLDREAD_DB_AEON=<a throwaway aeon clone> \
//   npm run harness:coldread-db
//
// Two variables for the build, not one: a linked worktree has neither
// `node_modules/.bin/electron` nor a `dist/` of its own, so with only the first
// the run-root resolver BORROWS the main checkout's built tree and every row
// below would describe an app this branch did not build. A borrowed root is
// REFUSED, loudly, before anything launches.

import { AURORA_DIR, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9547);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const SHOTS = join(ROOT, 'docs/captures/2026-09-06-coldread-db');

/** Its own variable, never `AEON_DIR`: this harness needs no writable clone. */
const AEON = process.env.COLDREAD_DB_AEON ?? '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** NOT a pass and NOT a zero — its own bucket, and it makes the run non-zero. */
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
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res); ws.addEventListener('error', rej);
  });
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

async function clickRect(c, rect, what) {
  if (!rect || rect.w < 1 || rect.h < 1) throw new Error(`no rect for ${what}: ${JSON.stringify(rect)}`);
  const x = Math.round(rect.x + rect.w / 2);
  const y = Math.round(rect.y + rect.h / 2);
  const hit = await c.evalExpr(
    `(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? e.tagName : 'null'; })()`);
  if (hit === 'null') throw new Error(`aim for ${what} hit nothing at ${x},${y}`);
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return { x, y, hit };
}

/** The act line: its text, its title, and its own overflow. */
const ACT_LINE = String.raw`
(() => {
  const e = document.querySelector('[data-effects-act-sets]');
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { text: (e.textContent || '').trim(), title: (e.getAttribute('title') || ''),
           w: r.width, h: r.height, scrollW: e.scrollWidth, clientW: e.clientWidth };
})()`;

/** The permanent strip's box, and the scrollport it is sticky against. */
const STRIP_GEOM = String.raw`
(() => {
  const s = document.querySelector('[data-effects-section-strip]');
  if (!s) return null;
  let p = s.parentElement;
  while (p && p !== document.body) {
    const o = getComputedStyle(p);
    if (/auto|scroll|hidden/.test(o.overflowY) || /auto|scroll|hidden/.test(o.overflowX)) break;
    p = p.parentElement;
  }
  const sr = s.getBoundingClientRect();
  const pr = p ? p.getBoundingClientRect() : null;
  return { stripH: sr.height, stripW: sr.width,
           panelScrollW: p ? p.scrollWidth : -1, panelClientW: p ? p.clientWidth : -1,
           panelScrollLeft: p ? p.scrollLeft : -1,
           overflowX: p ? getComputedStyle(p).overflowX : '?',
           shift: pr ? Math.round(sr.left - pr.left) : -999 };
})()`;

/**
 * The rebind notice, if it is rendered, WITH A REAL PAINT TEST.
 *
 * ⚠ AREA IS NOT VISIBILITY, and this harness printed the proof: the notice
 * measures 200x231px at y=1480 in a 1050px-tall window, which is real area on
 * an element scrolled out of its own scroller. `checkVisibility()` and
 * `getClientRects()` both go GREEN on exactly that (SectionPicker.tsx's own
 * measurement, an element 2,635px out). So this scrolls the notice into its
 * scroller, re-reads the rect, and hit-tests the centre with
 * `elementFromPoint` — a stranger under the aim is a FAIL, not a pass.
 */
const NOTICE = String.raw`
(() => {
  const e = document.querySelector('[data-testid="effects-rebind-notice"]');
  if (!e) return null;
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  const cs = getComputedStyle(e);
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const hit = (r.width > 0 && r.height > 0) ? document.elementFromPoint(x, y) : null;
  return { text: (e.textContent || '').trim(), w: r.width, h: r.height, y: r.y,
           aimX: x, aimY: y,
           onTarget: !!(hit && (hit === e || e.contains(hit))),
           hit: hit ? hit.tagName : 'null',
           colour: cs.color, background: cs.backgroundColor,
           borderLeft: cs.borderLeftColor };
})()`;

/** The WARNING tier, read off a sibling hint so the comparison is this app's. */
const WARN_TIER = String.raw`
(() => {
  const e = document.querySelector('[data-effects-section-advisory] > *');
  if (!e) return null;
  const cs = getComputedStyle(e);
  return { colour: cs.color, background: cs.backgroundColor, borderLeft: cs.borderLeftColor };
})()`;

/** What the CLONE's own sidecars say — the derivation's independent answer. */
function boundFromDisk(aeon) {
  const dir = join(aeon, 'games/sonic4/data/editor/ojz/act1');
  if (!existsSync(dir)) return null;
  const out = [];
  for (const f of readdirSync(dir).filter((n) => /^section_\d+\.meta\.json$/.test(n))) {
    const i = Number(/^section_(\d+)\./.exec(f)[1]);
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (j.rasterRef !== undefined && j.rasterRef !== null) out.push([i, j.rasterRef]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree — the app under test '
      + `would be ${RUN.root}, whose dist/ does not contain this branch's edits, and every row `
      + 'below would describe the wrong build. Set ELECTRON_BIN and AURORA_BUILT_TREE.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) {
      throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
    }
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);

  if (AEON === '' || !existsSync(AEON)) {
    throw new Error('COLDREAD_DB_AEON must name an aeon clone to open (read-only).');
  }
  // ⚠ THE DEFAULT-LOCATION FORM, not the override-aware one, which would compare
  // the clone against itself and let the REAL tree through.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEON) === resolve(liveAeon)) {
    throw new Error(`Refusing: COLDREAD_DB_AEON names aeon's DEFAULT checkout (${liveAeon}), a `
      + 'live lane tree another agent is editing. Point it at a clone.');
  }

  const onDisk = boundFromDisk(AEON);
  if (onDisk === null) throw new Error(`no ojz/act1 sidecars under ${AEON}`);
  note('the clone\'s own sidecars', onDisk.map(([i, id]) => `section ${i} -> ${id}`).join('; '));

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

    const dpr = await c.evalExpr('window.devicePixelRatio');
    note('dpr', `devicePixelRatio = ${dpr} (printed beside every positional reading below)`);

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEON)})`);
    await sleep(2500);

    const fx = await c.json(RECT(
      `[...document.querySelectorAll('button')].find((e) => /^Effects\\b/.test((e.textContent||'').trim()))`));
    await clickRect(c, fx, 'Effects tab');
    await sleep(900);
    await shot(c, '01-effects-tab');

    // ───────────────────────────────────────────────────────────────────────
    // 1 — THE ACT LINE NOW CARRIES A THIRD SET
    // ───────────────────────────────────────────────────────────────────────

    const line = await c.json(ACT_LINE);
    if (line === null) {
      cannotMeasure('1a', 'the act line', 'no [data-effects-act-sets] element on screen: the '
        + 'strip did not render, or the act descriptor did not parse in this clone. Every row '
        + 'about that line below is unmeasured, NOT green.');
    } else {
      note('act line', `${line.text}\n        (${Math.round(line.w)}x${Math.round(line.h)}px, dpr ${dpr})`);
      check('1a', 'the line publishes THREE sets, the third of them `bound`',
        /own preset/.test(line.text) && /threaded/.test(line.text) && /bound/.test(line.text),
        line.text);
      // ⚠ THE NUMBERS ARE CHECKED AGAINST THE CLONE'S OWN FILES, read in node,
      // not against a number typed into this harness. A set the app derived
      // from its own load and a set read straight off disk are two independent
      // answers to one question, which is the only form of this row worth
      // running.
      const printed = (/bound ([0-9,]+|none)/.exec(line.text) || [])[1] ?? '(absent)';
      const expected = onDisk.length === 0 ? 'none' : onDisk.map(([i]) => i).join(',');
      check('1b', 'and its numbers are the sections whose sidecars really carry a rasterRef',
        printed === expected,
        `the strip prints "bound ${printed}"; the clone's sidecars on disk say "${expected}"`);
      check('1c', 'the `bound` set is not a restatement of `threaded`: they are derived apart',
        /threaded [0-9,]+|threaded none|threaded \?/.test(line.text),
        line.text);
      check('1d', 'the line explains all three sets on its own title, at the line',
        /bound/.test(line.title) && /binding here replaces its\s+incumbent|replaces its/.test(line.title),
        line.title.slice(0, 160));
    }

    // ⚠ THE ROW COUNT, ON SCREEN. The design decision this parcel defends is
    // that occupancy is a SET and not a fourth condition row.
    const rows = await c.json(String.raw`
      [...document.querySelectorAll('[data-effects-wiring-condition]')].map((r) => ({
        n: r.getAttribute('data-effects-wiring-condition'),
        text: (r.textContent || '').trim() }))`);
    check('1e', 'the strip still publishes exactly THREE condition rows: occupancy took no row',
      rows.length === 3, `rows = ${rows.length}: ${rows.map((r) => `[${r.n}]`).join('')}`);

    // ───────────────────────────────────────────────────────────────────────
    // 2 — WHAT THE PERMANENT STRIP NOW COSTS
    // ───────────────────────────────────────────────────────────────────────
    //
    // ⚠ MEASURED AGAINST THE SCROLLER'S OWN BOX, never `checkVisibility()`:
    // both it and `getClientRects()` go green on an element scrolled 2,635px
    // out of its own scroll container (SectionPicker.tsx's own measurement).
    // C9 of the same cold read was TEN pixels of horizontal overflow, so a
    // wider act line is exactly the shape that has to be re-measured.

    const geom = await c.json(STRIP_GEOM);
    if (geom === null) {
      cannotMeasure('2a', 'the strip geometry', 'no [data-effects-section-strip] on screen.');
    } else {
      note('strip geometry', `strip ${Math.round(geom.stripW)}x${geom.stripH.toFixed(2)}px · `
        + `scrollport ${geom.panelClientW}px wide, content ${geom.panelScrollW}px, `
        + `overflowX ${geom.overflowX}, scrollLeft ${geom.panelScrollLeft}`);
      check('2a', 'the longer act line forces no horizontal overflow of its own',
        line !== null && line.scrollW <= line.clientW + 1,
        line === null ? 'act line unmeasured'
          : `act line scrollWidth ${line.scrollW} vs clientWidth ${line.clientW}`);
      check('2b', 'and the strip is not dragged sideways off the scrollport',
        Math.abs(geom.shift) <= 1,
        `the strip's left edge is ${geom.shift}px inside the scrollport's `
        + `(scrollLeft ${geom.panelScrollLeft})`);
      // A NOTE and not a check: the strip's height is a COST, not a property.
      // 147.53px is what SectionPicker.tsx's own docblock recorded before this
      // parcel, at 1680x1050; the delta is what a third set actually charged.
      note('the permanent cost', `the strip stands at ${geom.stripH.toFixed(2)}px. `
        + 'SectionPicker.tsx recorded 147.53px before this parcel, at 1680x1050. The delta is '
        + 'what the third set charges every screen.');
    }

    // ───────────────────────────────────────────────────────────────────────
    // 3 — THE NOTICE, AT THE CONTROL THAT CHARGES IT
    // ───────────────────────────────────────────────────────────────────────

    // The select lives on the COLOUR sub-tab, inside RASTER BAND PRESETS. The
    // first cut of this harness looked for the card on the arrival tab and got
    // `no-header`, which correctly reported UNMEASURED rather than an absence.
    const colour = await c.json(RECT(`document.querySelector('[data-effects-sub-tab="colour"]')`));
    await clickRect(c, colour, 'Colour sub-tab');
    await sleep(900);
    // ⚠ AN ABSENCE MUST NAME ITSELF. When the header is not found this returns
    // the pointer-cursor headings that ARE on screen, because "no-header" alone
    // is indistinguishable from "the sub-tab never switched" and the first cut
    // of this harness spent a run on exactly that ambiguity.
    const openPresets = await c.evalExpr(String.raw`
      (() => {
        if (document.querySelector('select[title*="Which raster band preset"]')) return 'ok';
        const heads = [...document.querySelectorAll('div')].filter((e) =>
          e.style && e.style.cursor === 'pointer' && (e.textContent || '').trim().length > 0);
        const h = heads.filter((e) => /raster band presets/i.test((e.textContent || '').trim()))
          .sort((a, b) => (a.textContent||'').length - (b.textContent||'').length)[0];
        if (!h) {
          return 'no-header; pointer headings on screen: '
            + JSON.stringify(heads.map((e) => (e.textContent||'').trim().slice(0, 40)).slice(0, 12));
        }
        h.click();
        return 'clicked';
      })()`);
    note('RASTER BAND PRESETS', openPresets);
    await sleep(900);
    const SELECT_EXPR = `document.querySelector('select[title*="Which raster band preset"]')`;
    const haveSelect = await c.evalExpr(`!!${SELECT_EXPR}`);
    if (!haveSelect) {
      cannotMeasure('3*', 'every row about the rebind notice',
        `the RASTER BAND PRESETS Section select never mounted (open said "${openPresets}"), so `
        + 'an absent notice below would be the absence of the whole card. UNMEASURED, NOT green.');
    } else {
      // Section 0: nothing bound. THE ANTI-VACUOUS HALF, taken FIRST so a
      // notice that renders unconditionally cannot be mistaken for one that
      // fired.
      const set0 = await c.evalExpr(
        SET_SELECT(SEL_BY_TITLE(String.raw`/The section both bindings/`), '0'));
      check('3a', 'the section picker really moved to section 0 (anti-vacuous for 3b)',
        set0 === 'ok', String(set0));
      await sleep(800);
      const none = await c.json(NOTICE);
      check('3b', 'section 0 binds nothing, so there is NO rebind notice: it is not boilerplate',
        none === null, none === null ? 'absent, as it must be'
          : `PRESENT: ${none.text.slice(0, 120)}`);
      await shot(c, '02-section-0-no-notice');

      // ⚠ THE TIER IS COMPARED AGAINST THIS APP'S OWN WARNING TIER, and the
      // only way to have one on screen beside the notice is to CREATE the
      // refused state: section 0 is not threaded, so binding a preset there
      // turns the section advisory from a note into a warning. Two hints, one
      // card, one screenshot. Nothing is saved.
      const bind0 = await c.evalExpr(SET_SELECT(SELECT_EXPR, 'authored_probe'));
      await sleep(900);
      const warn = await c.json(WARN_TIER);
      const bound0 = await c.json(NOTICE);
      check('3c', 'binding a preset to an UNTHREADED section 0 raises the warning advisory',
        bind0 === 'ok' && warn !== null,
        `set-select ${bind0}; advisory ${warn === null ? 'absent' : 'present'}`);
      if (bound0 === null) {
        check('3d', 'and the rebind notice follows the new binding onto section 0', false,
          'no [data-testid="effects-rebind-notice"] after binding authored_probe');
      } else {
        check('3d', 'and the rebind notice follows the new binding onto section 0',
          bound0.text.includes('"authored_probe"'), bound0.text.slice(0, 120));
        if (warn === null) {
          cannotMeasure('3e', "the notice's tier",
            'no warning-toned advisory was on screen to compare against, so "it is not the alarm '
            + 'tier" was compared with nothing. UNMEASURED, NOT green.');
        } else {
          check('3e', "it is NOT the alarm tier: a different tier from this app's own warning",
            bound0.background !== warn.background || bound0.borderLeft !== warn.borderLeft,
            `notice bg ${bound0.background} border ${bound0.borderLeft} · `
            + `warning bg ${warn.background} border ${warn.borderLeft}`);
        }
      }
      await shot(c, '03-section-0-bound-note-beside-warning');

      // ...and it re-derives: unbinding removes it. Store only, no Ctrl+S.
      const unbind0 = await c.evalExpr(SET_SELECT(SELECT_EXPR, ''));
      await sleep(800);
      const after0 = await c.json(NOTICE);
      // ⚠ IT ASSERTS ITS OWN PRECONDITION. Measured under a planted build where
      // `rebindOrphanNotice` returned null unconditionally: this row went GREEN,
      // because a notice that never rendered is also a notice that "went away".
      // `bound0 !== null` is what makes the disappearance a measurement.
      check('3f', 'unbinding section 0 removes the notice: it tracks the binding, not the section',
        bound0 !== null && unbind0 === 'ok' && after0 === null,
        `it was ${bound0 === null ? 'NEVER THERE (this row measures nothing without that)' : 'there'}; `
        + `set-select ${unbind0}; notice ${after0 === null ? 'gone' : 'STILL PRESENT'}`);

      // Section 5: the cold reader's own case, unedited.
      const set5 = await c.evalExpr(
        SET_SELECT(SEL_BY_TITLE(String.raw`/The section both bindings/`), '5'));
      check('3g', 'the section picker really moved to section 5 (anti-vacuous for 3h/3i)',
        set5 === 'ok', String(set5));
      await sleep(900);
      const notice = await c.json(NOTICE);
      const incumbent = (onDisk.find(([i]) => i === 5) || [])[1] ?? null;
      if (notice === null) {
        check('3h', 'section 5 is occupied, so the rebind notice is on screen', false,
          `no notice on screen; the clone's section 5 binds ${incumbent ?? '(nothing)'}`);
      } else {
        note('the notice', `${notice.text}\n        (${Math.round(notice.w)}x${Math.round(notice.h)}px `
          + `at y=${Math.round(notice.y)}, dpr ${dpr})`);
        check('3h', 'section 5 is occupied, so the rebind notice PAINTS: hit-tested, not just sized',
          notice.w > 1 && notice.h > 1 && notice.onTarget === true,
          `${Math.round(notice.w)}x${Math.round(notice.h)}px; the aim at `
          + `${notice.aimX},${notice.aimY} hits ${notice.hit} and onTarget=${notice.onTarget}`);
        check('3i', "and it NAMES the document it would orphan, read from this clone's sidecar",
          incumbent !== null && notice.text.includes(`"${incumbent}"`),
          `sidecar says ${incumbent}; the notice says ${notice.text.slice(0, 90)}`);
        check('3j', "it quotes aeon's own refusal and says what Aurora cannot see",
          /reachable by NOTHING/.test(notice.text)
          && /Aurora does not read that table/.test(notice.text),
          notice.text.slice(0, 200));
      }
      await shot(c, '04-section-5-rebind-notice');
    }
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  console.log(`\n${results.length} row(s): ${results.filter((r) => r.ok).length} passed, `
    + `${fails.length} failed, ${unmeasured.length} UNMEASURED.`);
  if (fails.length) console.log(`FAILED: ${fails.join('; ')}`);
  if (unmeasured.length) console.log(`UNMEASURED: ${unmeasured.join('; ')}`);
  if (fails.length || unmeasured.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
