// ═══════════════════════════════════════════════════════════════════════════
// coldread-fixes — the three fixes, WITNESSED ON A RUNNING APP
// ═══════════════════════════════════════════════════════════════════════════
//
// The three defects in `docs/reviews/2026-09-05-effects-cold-read.md` were all
// found by driving the app, and two of the three fixes are things a unit test
// can only half-see:
//
//   D-A / condition 3   the strip must PUBLISH the third row, with the right
//                       verdict, for the document actually bound — and the unit
//                       tests assert the derivation, not that anything renders.
//   C7 / colours        the refusal must reach the screen and the swatch must
//                       stop painting an invented colour.
//   C8 / NumberField    the refusal text must carry the drift clause after a
//                       real three-keystroke gesture through the real DOM.
//
// It also MEASURES C9 — the cold read's "opening the CYCLES card scrolls the
// pinned strip sideways and clips its ✓/✗" — which is the one finding here that
// cannot be fixed from source without knowing which element overflows.
//
// ── WHAT THIS HARNESS DOES NOT DO ─────────────────────────────────────────
//
// ⚠ IT NEVER SAVES, and it never touches the live aeon checkout. It opens a
// THROWAWAY CLONE, read-only, and presses no Ctrl+S — so it needs no writable
// override and takes none. It also never presses Build & Run: Aurora's bus
// client attaches to whatever holds the socket chain and the owner may have a
// live game window.
//
// ── RUN ───────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=$PWD \
//   COLDREAD_AEON=<a throwaway aeon clone> \
//   npm run harness:coldread-fixes
//
// Two variables, not one: a linked worktree has neither `node_modules/.bin/
// electron` nor a `dist/` of its own, so with only the first the run-root
// resolver walks up and BORROWS the main checkout's built tree — and every row
// below would describe an app this branch did not build. The run root is
// printed and a borrowed one is REFUSED.

import { AURORA_DIR, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9538);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const SHOTS = join(ROOT, 'docs/captures/2026-09-05-coldread-fixes');

/**
 * ⚠ ITS OWN VARIABLE, NOT `AEON_DIR`, and the difference is deliberate.
 * `checkoutOverride('aeon')` is for a harness that genuinely REQUIRES a
 * writable clone; this one requires nothing of the sort because it never saves.
 * Naming its own variable keeps it out of the way of the harnesses that do, and
 * the DEFAULT-LOCATION guard below still refuses the live tree either way.
 */
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
/** NOT a pass and NOT a zero — its own bucket, and it makes the run non-zero. */
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURED  [${id}] ${name}\n        ${why}`);
  unmeasured.push(`[${id}] ${name} — ${why}`);
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

/**
 * A REAL POINTER GESTURE, hit-tested first.
 *
 * ⚠ `element.click()` IS NOT A CLICK, and a gesture the app never listens for
 * no-ops silently: every later reading then comes off the previous screen and
 * the control gets written up as broken. This aims at INTEGER client pixels —
 * `devicePixelRatio` varies run to run on this box — and REFUSES rather than
 * clicking whatever happens to be underneath.
 */
/**
 * Click the element an expression names, and PROVE the gesture landed on IT.
 *
 * ⚠ `clickRect` REFUSES ONLY ON `null`, WHICH IS NOT ENOUGH. A rect read while
 * the target is below the fold is a real rect at a real viewport coordinate —
 * occupied by whatever else is there. `elementFromPoint` returns that other
 * element, the aim passes, the click lands on a stranger, and every later
 * reading comes off a screen the harness never made. Measured here: the colours
 * box came back `focused: false` with `document.activeElement` still the preset
 * row BUTTON, and the rows below reported "the refusal never appeared" about a
 * box nothing had typed into. So: scroll it in, re-read, and require the hit to
 * BE the target (or a descendant of it).
 */
async function clickElement(c, selectorExpr, what) {
  await c.evalExpr(`(() => { const e = ${selectorExpr}; if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  await sleep(350);
  const probe = await c.json(String.raw`
    (() => {
      const e = ${selectorExpr};
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, w: r.width, h: r.height,
               onTarget: hit === e || (hit ? e.contains(hit) : false),
               hit: hit ? hit.tagName + '/' + (hit.getAttribute('placeholder') || hit.type || '') : 'null' };
    })()`);
  if (!probe) throw new Error(`${what}: no element matched`);
  if (probe.w < 1 || probe.h < 1) throw new Error(`${what}: zero-sized rect ${JSON.stringify(probe)}`);
  if (!probe.onTarget) {
    throw new Error(`${what}: the aim at ${probe.x},${probe.y} would hit ${probe.hit}, NOT the `
      + 'target — refusing to click a stranger and read the result as this control\'s.');
  }
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: probe.x, y: probe.y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: probe.x, y: probe.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(250);
  return probe;
}

async function clickRect(c, rect, what) {
  if (!rect || rect.w < 1 || rect.h < 1) throw new Error(`no rect for ${what}: ${JSON.stringify(rect)}`);
  const x = Math.round(rect.x + rect.w / 2);
  const y = Math.round(rect.y + rect.h / 2);
  const hit = await c.evalExpr(
    `(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? (e.tagName + '#' + (e.id||'') + '.' + (e.className||'').toString().slice(0,40)) : 'null'; })()`);
  if (hit === 'null') throw new Error(`aim for ${what} hit nothing at ${x},${y}`);
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return { x, y, hit };
}
async function key(c, k, code, vk, modifiers = 0, text) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  // ⚠ ONE `keyDown` CARRYING `text`, AND NO SEPARATE `char`. Blink synthesises
  // the keypress from the keyDown alone; sending both types every character
  // TWICE (the cold read's own rig defect — `coldread_drift` arrived as
  // `ccoollddrreeaadd__ddrriifftt`).
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(text ? { text } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const RECT = (sel) => `(() => { const e = ${sel}; if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`;

const SUBTAB = (id) => `(() => { const t = document.querySelector('[data-effects-sub-tab="${id}"]');
  if (!t) return null; const r = t.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; })()`;

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
 * A `CollapsibleSection`'s HEADER, which is a plain `<div onClick>` with a
 * `cursor: pointer` — not a button, not a summary. Finding it by its text and
 * dispatching a REAL press/release is the only thing that opens it; the first
 * cut of this harness looked for `button,summary` and found nothing, which
 * silently made C7 and C8 unmeasurable rather than failing loudly.
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

/** What is on screen, when a target is missing — so an absence names itself. */
const NEARBY = String.raw`
(() => ({
  headers: [...document.querySelectorAll('div')].filter((e) =>
    e.style && e.style.cursor === 'pointer').map((e) => (e.textContent||'').trim().slice(0, 48)).slice(0, 25),
  texts: [...document.querySelectorAll('input[type=text]')].map((e) => (e.title||'').slice(0, 48)),
  numbers: [...document.querySelectorAll('input[type=number]')].map((e) => (e.title||'').slice(0, 48)).slice(0, 25),
}))()`;

/** The three condition rows, as the strip renders them right now. */
const CONDITIONS = String.raw`
(() => {
  const rows = [...document.querySelectorAll('[data-effects-wiring-condition]')];
  return rows.map((r) => ({
    n: r.getAttribute('data-effects-wiring-condition'),
    text: (r.textContent || '').trim(),
    title: (r.getAttribute('title') || '').slice(0, 200),
  }));
})()`;

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree — the app under test '
      + `would be ${RUN.root}, whose dist/ does not contain this branch's edits, and every row `
      + 'below would describe the wrong build. Set ELECTRON_BIN and AURORA_BUILT_TREE.');
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
    throw new Error('COLDREAD_AEON must name an aeon clone to open (read-only).');
  }
  // ⚠ THE DEFAULT-LOCATION FORM. The override-aware `siblingPath` would compare
  // the clone against itself and let the REAL tree through — failing open on
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

    // Effects tab.
    const fx = await c.json(RECT(
      `[...document.querySelectorAll('button')].find((e) => /^Effects\\b/.test((e.textContent||'').trim()))`));
    await clickRect(c, fx, 'Effects tab');
    await sleep(900);
    await shot(c, '01-effects-tab');

    // ───────────────────────────────────────────────────────────────────────
    // D-A — THE THIRD CONDITION ROW
    // ───────────────────────────────────────────────────────────────────────

    const rows0 = await c.json(CONDITIONS);
    check('1a', 'the strip publishes THREE condition rows, not two',
      rows0.length === 3, `rows = ${rows0.length}: ${rows0.map((r) => r.n).join(',')}`);
    check('1b', 'and every row is labelled "of 3", so the count on screen is the count published',
      rows0.length === 3 && rows0.every((r) => /of 3/.test(r.title)),
      rows0.map((r) => (r.title.match(/CONDITION \d of \d/) || ['?'])[0]).join(' · '));
    note('section 0 rows', rows0.map((r) => `[${r.n}] ${r.text}`).join('\n        '));

    // Section 5 — the cold reader's own case. It is ✓ own preset ✓ threaded,
    // and the third row is what a `cycles`-carrying document meets there.
    // ⚠ A PREFIX PATTERN, NEVER END-ANCHORED. Titles carry long suffixes, and
    // an end-anchored one silently matches nothing — which reads exactly like a
    // control that does not work.
    const setSec = await c.evalExpr(
      SET_SELECT(SEL_BY_TITLE(String.raw`/The section both bindings/`), '5'));
    check('1c', 'the section picker really moved to section 5 (anti-vacuous for every row below)',
      setSec === 'ok', String(setSec));
    await sleep(700);
    const rows5 = await c.json(CONDITIONS);
    note('section 5 rows', rows5.map((r) => `[${r.n}] ${r.text}`).join('\n        '));
    const [own5, thr5, extra5] = rows5;
    check('1d', 'section 5 is ✓ own preset AND ✓ threaded — the two ticks that were the whole verdict',
      /^✓/.test(own5?.text ?? '') && /^✓/.test(thr5?.text ?? ''),
      `${own5?.text} | ${thr5?.text}`);
    check('1e', 'and the THIRD row exists and reports on what section 5 binds today',
      typeof extra5?.text === 'string' && extra5.text.includes('its channels'),
      extra5?.text);
    await shot(c, '02-section-5-three-conditions');

    // ───────────────────────────────────────────────────────────────────────
    // C9 — DOES OPENING THE CYCLES CARD STILL SCROLL THE PINNED STRIP?
    // ───────────────────────────────────────────────────────────────────────
    //
    // ⚠ MEASURED AGAINST THE SCROLLER'S OWN BOX, never `checkVisibility()`:
    // both it and `getClientRects()` go green on an element scrolled 2,635px
    // out of its own scroll container (SectionPicker.tsx's own measurement).

    const colour = await c.json(SUBTAB('colour'));
    if (!colour) throw new Error('the Colour sub-tab was not found — the panel is not where '
      + 'this harness thinks it is, and every row below would read off the wrong screen.');
    await clickRect(c, colour, 'Colour sub-tab');
    await sleep(900);

    /**
     * Leave one `CollapsibleSection` OPEN, whatever state it was in.
     *
     * ⚠ IDEMPOTENT ON PURPOSE. A header click TOGGLES, so a harness that just
     * clicks closes every card that happened to arrive open — and the first cut
     * of this one did exactly that, then reported "opened=false" for a card it
     * had shut itself. The control count says which way it went, and a decrease
     * is undone rather than reported.
     */
    async function ensureOpen(reSrc, what) {
      const n = () => c.evalExpr('document.querySelectorAll("input,select").length');
      // ⚠ SCROLL IT INTO THE VIEWPORT FIRST, then RE-READ the rect. This column
      // is ~3,400px of content in a 742px scrollport, so most of these headings
      // sit outside the window and their rects are real but unclickable — the
      // aim above refused one at y=909 in a 872px-tall window, correctly. A
      // harness that skipped this would have to either click blind or call the
      // control broken.
      const scrolled = await c.json(HEADER_RECT(reSrc));
      if (!scrolled) return { ok: false, why: `no header matching ${reSrc}` };
      await c.evalExpr(String.raw`
        (() => { const e = [...document.querySelectorAll('div')].filter((x) =>
            x.style && x.style.cursor === 'pointer' && ${reSrc}.test((x.textContent||'').trim().slice(0,80)))
            .sort((a,b) => (a.textContent||'').length - (b.textContent||'').length)[0];
          if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
      await sleep(400);
      const h = await c.json(HEADER_RECT(reSrc));
      if (!h) return { ok: false, why: `header vanished after scrolling to it` };
      const before = await n();
      await clickRect(c, h, what);
      await sleep(700);
      let after = await n();
      if (after < before) {                       // it was OPEN; put it back
        const h2 = await c.json(HEADER_RECT(reSrc));
        await clickRect(c, h2 ?? h, what);
        await sleep(700);
        after = await n();
        return { ok: after >= before, why: `was already open (${before} → ${after})` };
      }
      if (after === before) return { ok: false, why: `click revealed no controls (${before})` };
      return { ok: true, why: `${before} → ${after} controls` };
    }

    // ⚠ CASE-INSENSITIVE, AND THAT IS NOT A CONVENIENCE. These headings render
    // in Title Case ("Raster band presets"); the first cut matched
    // /^RASTER BAND PRESETS/ against the cold read's UPPERCASE transcription of
    // them and found nothing — which surfaced as two UNMEASURED rows rather
    // than as the rig fault it was.
    const bandsOpen = await ensureOpen(String.raw`/^Raster band presets/i`, 'Raster band presets');
    note('raster band presets', JSON.stringify(bandsOpen));

    // ⚠ WHICH PRESET IS SELECTED IS PART OF EVERY MEASUREMENT BELOW, and both
    // earlier cuts of this harness were burned by leaving it to chance.
    //
    //   C7/C8 need a document with BANDS. Run 1 landed on `aurora_ramp_witness`,
    //   a RAMP document with no `colours` box and no band `Top` at all, and both
    //   rows came back UNMEASURED — which reads as a missing control rather than
    //   as the wrong document being open.
    //
    //   C9 needs a document with a LONG ID, because the element that overflows
    //   is a `<code>` holding `data/editor/effects/presets/<id>.json`. Run 2
    //   fixed C7/C8 by selecting a short-id bands preset — and C9 then went
    //   GREEN WITH THE FIX REVERTED, because there was no longer any overflow to
    //   remove. An applied mutation that stays green is a runner defect and not
    //   a pass, and this was exactly one: the harness had quietly stopped
    //   reproducing the condition it was named for.
    //
    // So the two measurements each get the preset they need, explicitly. The
    // rows are plain `<button>`s whose title is `<label> (<id>)`.
    const PRESET_ROWS = String.raw`
      [...document.querySelectorAll('button')].filter((e) => /\(\w+\)$/.test(e.title || ''))`;
    async function pickPreset(rankExpr, what) {
      const chosen = await c.evalExpr(String.raw`
        (() => {
          const rows = ${PRESET_ROWS};
          const e = ${rankExpr};
          if (!e) return 'none:' + JSON.stringify(rows.map((b) => (b.title || '').slice(0, 50)));
          return e.title;
        })()`);
      if (String(chosen).startsWith('none:')) return { ok: false, why: String(chosen) };
      await clickElement(c, `(${PRESET_ROWS}).find((e) => e.title === ${JSON.stringify(chosen)})`,
        `preset row (${what})`);
      await sleep(800);
      return { ok: true, title: chosen };
    }

    // C9's fixture: the LONGEST id in the library — the longest path, and so the
    // widest `<code>`. Deterministic, and it names itself in the output.
    // ⚠ RANKED BY THE ID, NOT THE TITLE. The title is `<label> (<id>)` and the
    // label is prose, so ranking by title length picks the preset with the
    // chattiest NAME — which is not the one with the longest PATH. It chose
    // `ojz_sec6_baseswap` (17) over `aurora_ramp_witness` (19) and measured a
    // narrower `<code>` than the library actually contains.
    const ID_OF = String.raw`((e) => ((e.title || '').match(/\(([^()]*)\)\s*$/) || ['', ''])[1])`;
    const longId = await pickPreset(String.raw`
      rows.slice().sort((a, b) => ${ID_OF}(b).length - ${ID_OF}(a).length)[0]`,
      'longest id');
    note('preset for C9 (longest id)', JSON.stringify(longId));

    const presetOpen = await ensureOpen(String.raw`/^Preset — [a-z_0-9]+$/i`, 'the preset card');
    note('preset card', JSON.stringify(presetOpen));

    // ───────────────────────────────────────────────────────────────────────
    // C9 — DOES OPENING THE CYCLES CARD STILL SCROLL THE PINNED STRIP?
    // ───────────────────────────────────────────────────────────────────────
    //
    // ⚠ THE CONDITION HAS TO BE REPRODUCED BEFORE IT IS MEASURED. The first cut
    // of this row measured the Colour tab with every card SHUT, found no
    // overflow and printed PASS — a green on a state that is not the defect's
    // state. The cold read is explicit that it is opening the CYCLES card that
    // does it: its `<select>` is 294px wide because its widest option is "keep
    // the section's hand-authored cycle (key absent)".
    //
    // ⚠⚠ AND THE SCROLLER IS FOUND BY ITS `overflow` STYLE, not by hunting for
    // an ancestor whose scrollWidth exceeds its clientWidth. That walk has no
    // stopping condition when nothing overflows, so it climbed to a 1400px
    // window element and reported "overflow 0" about the wrong box entirely.
    const cycles = await ensureOpen(String.raw`/— cycles, variants/i`, 'the cycles/variants card');
    const cyclesOpened = cycles.ok;
    note('cycles card', JSON.stringify(cycles));
    const scroll = await c.json(String.raw`
      (() => {
        const strip = document.querySelector('[data-effects-section-strip]');
        if (!strip) return null;
        let s = strip.parentElement;
        while (s && s !== document.body) {
          const o = getComputedStyle(s);
          if (/auto|scroll/.test(o.overflowY) || /auto|scroll/.test(o.overflowX)) break;
          s = s.parentElement;
        }
        if (!s || s === document.body) return null;
        const sr = s.getBoundingClientRect(), br = strip.getBoundingClientRect();
        return { scrollWidth: s.scrollWidth, clientWidth: s.clientWidth,
                 scrollLeft: s.scrollLeft, stripLeft: br.x, scrollerLeft: sr.x,
                 stripWidth: br.width, overflow: s.scrollWidth - s.clientWidth };
      })()`);
    const cyclesSel = await c.evalExpr(String.raw`
      (() => { const e = ${SEL_BY_TITLE(String.raw`/CRAM colour|cycle/i`)};
        return e ? Math.round(e.getBoundingClientRect().width) : -1; })()`);
    // WHICH ELEMENT IS WIDER THAN THE SCROLLPORT — the question a
    // scrollWidth/clientWidth pair cannot answer, and the one a fix needs. It
    // reports the DEEPEST offenders (an overflowing child makes every ancestor
    // overflow too, so the ancestors are noise).
    const widest = await c.json(String.raw`
      (() => {
        const strip = document.querySelector('[data-effects-section-strip]');
        let s = strip && strip.parentElement;
        while (s && s !== document.body) {
          const o = getComputedStyle(s);
          if (/auto|scroll/.test(o.overflowY) || /auto|scroll/.test(o.overflowX)) break;
          s = s.parentElement;
        }
        if (!s || s === document.body) return [];
        const right = s.getBoundingClientRect().left + s.clientWidth;
        const out = [];
        for (const e of s.querySelectorAll('*')) {
          const r = e.getBoundingClientRect();
          if (r.right > right + 0.5 && !e.querySelector('*')) {
            out.push({ tag: e.tagName, over: Math.round((r.right - right) * 10) / 10,
                       w: Math.round(r.width), cls: (e.className||'').toString().slice(0, 30),
                       text: (e.textContent||'').trim().slice(0, 40) });
          }
        }
        return out.slice(0, 8);
      })()`);
    note('C9 — what actually overflows (deepest nodes only)',
      widest.length === 0 ? '(nothing)' : JSON.stringify(widest, null, 1));
    if (scroll === null || !cyclesOpened) {
      cannotMeasure('9a', 'C9: the pinned strip is not clipped by horizontal overflow',
        `the condition was not reproduced (cycles card opened=${cyclesOpened}, `
        + `scroller found=${scroll !== null}), so NOTHING was measured — a reading taken with `
        + 'the card shut is a reading of a different screen.');
    } else {
      note('C9 geometry', `${JSON.stringify(scroll)} · cycles select ${cyclesSel}px (dpr ${dpr})`);
      check('9a', 'C9: with the CYCLES card OPEN, the panel scroller has no horizontal overflow',
        scroll.overflow <= 0,
        `scrollWidth ${scroll.scrollWidth} clientWidth ${scroll.clientWidth} `
        + `overflow ${scroll.overflow}px scrollLeft ${scroll.scrollLeft} · the strip's ✓/✗ are `
        + 'clipped by exactly this overflow when it is positive');
      // The strip's own box against the SCROLLER's box — never checkVisibility().
      check('9b', 'and the strip still starts at the scrollport\'s own left edge',
        Math.abs(scroll.stripLeft - scroll.scrollerLeft) <= 1,
        `strip x ${scroll.stripLeft} vs scroller x ${scroll.scrollerLeft} (dpr ${dpr})`);
    }
    await shot(c, '03-colour-tab-cycles-open');

    // ───────────────────────────────────────────────────────────────────────
    // C7 — AN OUT-OF-RANGE COLOUR WORD IS REFUSED, AND NO SWATCH IS INVENTED
    // ───────────────────────────────────────────────────────────────────────

    // C7/C8's fixture: a document that actually HAS bands. Selected here and
    // not at the top, because C9 above needed the other one — and a run that
    // measured C9 on this preset would measure nothing at all.
    const withBands = await pickPreset(
      String.raw`rows.find((e) => /\b\d+ bands?\b/.test(e.textContent || ''))`, 'has bands');
    note('preset for C7/C8 (has bands)', JSON.stringify(withBands));
    if (!withBands.ok) {
      cannotMeasure('7/8', 'C7 and C8 on the running app',
        `no preset in this project carries bands, so neither the colours box nor a band Top was `
        + `reachable and NOTHING below was measured: ${withBands.why}`);
    }
    await ensureOpen(String.raw`/^Preset — [a-z_0-9]+$/i`, 'the preset card');

    const COLOURS_BOX = String.raw`
      [...document.querySelectorAll('input')].find((e) =>
        e.placeholder === '14 3584' || /CRAM colour words/.test(e.title || ''))`;
    const coloursBox = await c.json(RECT(COLOURS_BOX));
    if (!coloursBox) note('on screen', JSON.stringify(await c.json(NEARBY), null, 1));
    if (!coloursBox) {
      cannotMeasure('7a', 'C7: an impossible colour word is refused',
        'no `colours` text box was on screen — the preset card did not open, so NOTHING about '
        + 'the colours refusal was measured on the running app. The unit rows in '
        + 'effects-preset-colours.test.ts still cover the rule.');
    } else {
      const aimC = await clickElement(c, COLOURS_BOX, 'colours box');
      note('C7 aim', JSON.stringify(aimC) + ` (dpr ${dpr})`);
      // ⚠ THE COLD READER'S OWN MEASUREMENT, and the reason C7 happened at all:
      // he read `selectionStart`/`selectionEnd` as `3, 3` here (the caret at the
      // end, so the next keystroke APPENDS) against `null, null` on Top, which
      // is a number input the browser selects for you. A real click must now
      // leave the whole value selected, so the first keystroke REPLACES.
      const sel = await c.json(String.raw`
        (() => { const e = ${COLOURS_BOX}; if (!e) return null;
          const a = document.activeElement;
          return { start: e.selectionStart, end: e.selectionEnd, len: e.value.length,
                   value: e.value, focused: a === e,
                   active: a ? (a.tagName + '/' + (a.getAttribute('placeholder')||a.type||'')) : 'none',
                   hasMouseHandlers: !!e.onmousedown || 'react' }; })()`);
      note('C7 selection after a real click', JSON.stringify(sel));
      check('7c', 'C7: clicking the colours box SELECTS its contents, as the guide promises',
        sel !== null && sel.len > 0 && sel.start === 0 && sel.end === sel.len,
        `selectionStart/End ${sel?.start}/${sel?.end} over a value of length ${sel?.len} `
        + `(${JSON.stringify(sel?.value)}) — the cold read measured 3/3 here, a caret at the end, `
        + 'which is what made `0` + `14` + `3584` into `0143584`');
      // The cold reader's own value, typed the way he reached it.
      for (const d of ['1', '4', '3', '5', '8', '4']) {
        await key(c, d, `Digit${d}`, d.charCodeAt(0), 0, d);
      }
      await sleep(600);
      const typed = await c.evalExpr(`(${COLOURS_BOX} || {}).value`);
      check('7z', 'C7 (rig): the six keystrokes really reached the colours box',
        typed === '143584', `box shows ${JSON.stringify(typed)}`);
      const refusal = await c.evalExpr(String.raw`
        (() => {
          const t = [...document.querySelectorAll('*')].map((e) =>
            (e.children.length === 0 ? (e.textContent || '') : '')).join(' ');
          const m = t.match(/[^.]*not a CRAM word[^]{0,240}/);
          return m ? m[0].trim() : '';
        })()`);
      check('7a', 'C7: the panel REFUSES an impossible colour word, in words, at the control',
        refusal.includes('not a CRAM word'), JSON.stringify(refusal.slice(0, 200)));
      check('7b', 'and it says the swatch masks, so the author does not trust the colour beside it',
        /swatch masks/.test(refusal), JSON.stringify(refusal.slice(0, 200)));
      await shot(c, '04-colour-refused');
    }

    // ───────────────────────────────────────────────────────────────────────
    // C8 — THE REFUSAL AFTER A PARTIAL COMMIT
    // ───────────────────────────────────────────────────────────────────────
    //
    // The cold reader's exact gesture: a band edge holding a two-digit value,
    // then three digits typed over it. `25` lands; `250` is refused.

    // ⚠ BY THE SCHEMA'S OWN DESCRIPTION, as a PREFIX, AND DEFINED ONCE. These
    // boxes' titles are the vendored contract's `description` verbatim
    // (`presetFieldTitle`), so "Top" appears nowhere in them — the first cut
    // matched /\bTop\b/ against the Field's LABEL and found no input, which
    // reported as "no band Top box was on screen" for a box plainly there. The
    // second cut fixed the RECT selector and left the value-read on the old
    // one, so it printed `held "undefined"` and every row below it read off a
    // box the harness had never touched. One constant, both uses.
    const TOP_BOX = String.raw`
      [...document.querySelectorAll('input[type=number]')].find((e) =>
        /^Screen line the effect turns ON/.test(e.title || ''))`;
    const topBox = await c.json(RECT(TOP_BOX));
    if (!topBox) {
      cannotMeasure('8a', 'C8: the refusal names the value it already destroyed',
        'no band `Top` number box was on screen, so NOTHING about the drift clause was measured '
        + 'on the running app. The six rows in number-field-empty.test.ts drive the real '
        + 'component and still cover it.');
    } else {
      const aimT = await clickElement(c, TOP_BOX, 'Top box');
      note('C8 aim', JSON.stringify(aimT) + ` (dpr ${dpr})`);
      const heldBefore = await c.evalExpr(`(${TOP_BOX} || {}).value`);
      for (const d of ['2', '5', '0']) await key(c, d, `Digit${d}`, d.charCodeAt(0), 0, d);
      await sleep(600);
      const shown = await c.evalExpr(`(${TOP_BOX} || {}).value`);
      // ANTI-VACUOUS: the keystrokes really reached the box. Without this an
      // empty refusal string is ambiguous between "the fix does not work" and
      // "the harness typed into nothing", and the second reads as the first.
      check('8z', 'C8 (rig): the three keystrokes really reached the Top box',
        shown === '250', `box shows ${JSON.stringify(shown)} (held ${JSON.stringify(heldBefore)} before)`);
      const say = await c.evalExpr(String.raw`
        (() => {
          const t = [...document.querySelectorAll('*')].map((e) =>
            (e.children.length === 0 ? (e.textContent || '') : '')).join(' ');
          const m = t.match(/[^.]*is not a screen line[^]{0,400}/);
          return m ? m[0].trim() : '';
        })()`);
      note('C8 refusal on screen', `held "${heldBefore}" before · ${JSON.stringify(say.slice(0, 320))}`);
      check('8a', 'C8: the refusal still names the rule',
        /is not a screen line|would put Top/.test(say), JSON.stringify(say.slice(0, 160)));
      check('8b', 'C8: and it says the value ALREADY MOVED, rather than stopping at "is still 25"',
        /ALREADY MOVED/.test(say), JSON.stringify(say.slice(0, 320)));
      check('8c', 'C8: it names BOTH numbers — what the box held on focus and what it holds now',
        /held \d+ when you clicked into it/.test(say) && /now holds \d+/.test(say),
        JSON.stringify(say.slice(0, 320)));
      await shot(c, '05-numberfield-drift-refusal');
    }

    console.log(`\n${'═'.repeat(70)}`);
    const pass = results.filter((r) => r.ok).length;
    console.log(`ROWS: ${pass} passed, ${fails.length} failed, ${unmeasured.length} UNMEASURED`);
    if (fails.length) console.log(`FAILED:\n  ${fails.join('\n  ')}`);
    if (unmeasured.length) console.log(`UNMEASURED (not a pass, not a zero):\n  ${unmeasured.join('\n  ')}`);
    console.log(`shots: ${SHOTS}`);
    // ⚠ AN UNMEASURED ROW MAKES THE RUN NON-ZERO. A harness whose exit code
    // ignores what it could not reach reports a partial run as a clean one.
    process.exitCode = (fails.length || unmeasured.length) ? 1 : 0;
  } finally {
    try { c?.close(); } catch { /* closing */ }
    const { killTree } = await import('./lib/harness-guard.mjs');
    await killTree(child);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
