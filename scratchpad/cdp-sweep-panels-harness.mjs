#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// CDP SWEEP — P4/P5 (uxa F5), P6/P7 (uxb F6), and the three save-surface
// questions tagged in docs/reviews/2026-09-10-save-surface-vocabulary.md §5.
// ═══════════════════════════════════════════════════════════════════════════
//
// Every row here is one this repo's node suite CANNOT answer: it has no jsdom,
// no React and no DOM, so "the chip is mounted" is the strongest thing it can
// say and "the chip is on screen" is the thing that was asked for.
//
// ═══ WHAT WOULD MAKE THESE GO GREEN WITHOUT THE PROPERTY HOLDING ═══════════
//
//   • TEXT IN THE DOM THAT IS NOT ON SCREEN. This repo has shipped three rows
//     that went green over a permanently-collapsed disclosure. So no row here
//     is satisfied by `textContent`: each reads `getClientRects()`,
//     `checkVisibility()` AND a strict `elementFromPoint` at the leaf's own
//     centre — and, where there is a scroller, containment IN THE SCROLLER'S
//     OWN BOX, because `checkVisibility()` goes green 2,635px outside one.
//
//   • A SYNTHETIC EVENT THE APP IGNORES. `.click()` is not a click and a
//     dispatched KeyboardEvent is not a keystroke. P7 in particular is about
//     DELIVERY through the real window keydown path, so it goes through
//     `Input.dispatchKeyEvent` with real modifiers, never `dispatchEvent`.
//
//   • A COUNT OVER A SAMPLE THE RECIPE CHOSE. P4 is a depth measurement, and
//     the seat's own number came from four specific wheel deltas. Counting
//     "gestures" with a delta this file invented would be a different unit. So
//     P4 replays THE SEAT'S OWN DELTAS in the seat's own order and reports the
//     count in that unit, plus the raw scrollTop, which has no unit problem.
//
//   • A ZERO THAT IS A BROKEN QUERY. Every "is it there" row has a positive
//     control in the same run: P6 finds the `Filter…` box beside the thing it
//     is asking about, S1 reads the sprite header's Save as well as the level
//     header's, and P4/P5 assert the section they measure is mounted at all.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER.
// CLEANUP IS BY PID — `spawnGuarded` + awaited `killTree`.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> CLASSIC_DIR=<writable copy> \
//   AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<an electron> \
//   node scratchpad/cdp-sweep-panels-harness.mjs

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9473);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 99);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
/** The classic half of the save rows. Absent => those rows say UNMEASURABLE
 *  rather than quietly not running, which is how a sweep loses a check. */
const CLASSICDIR = process.env.CLASSIC_DIR ?? null;
if (CLASSICDIR && CLASSICDIR.startsWith(siblingDefaultPathOrUnresolved('s1disasm'))) {
  throw new Error('CLASSIC_DIR points at s1disasm itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-cdp-sweep`;
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(path, timeoutMs = 2000) {
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
  for (let i = 0; i < 150; i++) {
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

const results = [];
const fails = [];
const unmeasurable = [];
function check(id, name, ok, detail) {
  const tag = ok === 'UNMEASURABLE' ? 'UNMS' : ok ? 'PASS' : 'FAIL';
  const la = os.loadavg().map((n) => n.toFixed(2)).join('/');
  console.log(`${tag}  [${id}] ${name}   [load ${la}]`
    + `${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok, load: la });
  if (ok === 'UNMEASURABLE') unmeasurable.push(`[${id}] ${name} (load ${la})`);
  else if (!ok) fails.push(`[${id}] ${name} (load ${la})`);
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
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

/**
 * THE PAINT TEST, ALL FOUR PARTS. `checkVisibility()` and `getClientRects()`
 * both go GREEN on an element 2,635px outside its scroller — measured in this
 * repo — so containment in the SCROLLER's box is asked for separately, and the
 * hit test is strict at the element's own centre.
 */
const PAINTED = (selectorExpr) => String.raw`
(() => {
  const el = ${selectorExpr};
  if (!el) return { found: false };
  const b = el.getBoundingClientRect();
  let sc = el.parentElement;
  while (sc && sc !== document.body) {
    const ov = getComputedStyle(sc).overflowY;
    if (ov === 'auto' || ov === 'scroll') break;
    sc = sc.parentElement;
  }
  const sb = sc && sc !== document.body ? sc.getBoundingClientRect() : null;
  const hit = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                        Math.round(b.top + b.height / 2));
  return {
    found: true, text: (el.innerText || el.value || '').trim().slice(0, 120),
    title: (el.title || '').slice(0, 90),
    rect: b.toJSON(), rects: el.getClientRects().length,
    visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
    hitInside: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))),
    inScrollerBox: sb ? (b.top >= sb.top - 0.5 && b.bottom <= sb.bottom + 0.5) : null,
    scrollerRect: sb ? sb.toJSON() : null,
    dpr: window.devicePixelRatio,
  };
})()`;

async function main() {
  const t0 = Date.now();
  const load0 = os.loadavg();
  console.log('=== cdp-sweep panels harness (P4 P5 P6 P7 + save-surface S1 S2 S3) ===');
  console.log(`    node        : ${process.version}`);
  console.log(`    loadavg     : ${load0.map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    CLASSIC_DIR : ${CLASSICDIR ?? '(unset — the classic save rows will say UNMEASURABLE)'}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}   PORT: ${PORT}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const waitDbg = async () => {
      for (let i = 0; i < 100; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');

    // ⚠ COLD. P4 is explicitly "arrive on the Colour sub-tab COLD (no persisted
    // panel state)", and this app persists collapse state in localStorage. A
    // run that inherited a previous run's expanded sections would measure the
    // wrong thing and look fine.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(5000);
    if (!(await waitDbg())) throw new Error('no __dbg after reload');

    const key = async (k, mods = 0, code = undefined) => {
      const p = { key: k, code, modifiers: mods,
        windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : undefined };
      await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...p });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    };

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
    let st = null;
    for (let i = 0; i < 60; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(500);
    }
    check('0a', 'the COPIED aeon project is open (the subject for P4, P5, S1, S2)',
      !!(st && st.open), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2500);

    // ═══════════════════════════════════════════════════════════════════════
    // P4 — arrive on Colour COLD and count wheel gestures to `Preset id`.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n──── P4: wheel gestures from the top of Colour to `Preset id` ────');
    check('0b', 'the Effects facet mounts', (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1600);
    const sub = await c.evalExpr(SUBTAB('colour'));
    await sleep(1400);
    check('P4a', 'the Colour sub-tab is reachable and mounted', sub === 'ok', `SUBTAB -> ${sub}`);

    const PRESET_INPUT = `document.querySelector('input[placeholder="new_preset_id"]')`;
    // ⚠ THE SECTION MUST BE MOUNTED FOR THE COUNT TO MEAN ANYTHING. If the
    // accordion arrives COLLAPSED the input is not in the DOM at all, and "0
    // gestures" would be a measurement of its absence.
    const mounted = await c.evalExpr(`!!(${PRESET_INPUT})`);
    check('P4b', '`Preset id` is MOUNTED on arrival — the section arrives OPEN, so the count is about DEPTH',
      mounted === true,
      mounted === true ? 'present in the DOM without any gesture'
        : 'ABSENT: the section arrived collapsed, so a gesture count would be measuring its absence, '
        + 'not its depth');

    const scrollerFor = String.raw`
(() => {
  const el = ${PRESET_INPUT};
  if (!el) return null;
  let n = el.parentElement;
  while (n && n !== document.body) {
    const ov = getComputedStyle(n).overflowY;
    if ((ov === 'auto' || ov === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return null;
})()`;
    const seen = async () => c.json(String.raw`(() => {
      const el = ${PRESET_INPUT}; const sc = ${scrollerFor};
      if (!el) return { there: false };
      const b = el.getBoundingClientRect();
      const sb = sc ? sc.getBoundingClientRect() : null;
      return {
        there: true,
        inView: sb ? (b.top >= sb.top - 0.5 && b.bottom <= sb.bottom + 0.5) : null,
        scrollTop: sc ? Math.round(sc.scrollTop) : null,
        scrollHeight: sc ? sc.scrollHeight : null,
        clientHeight: sc ? sc.clientHeight : null,
        y: Math.round(b.top), scrollerTop: sb ? Math.round(sb.top) : null,
      };
    })()`);

    if (mounted !== true) {
      check('P4c', 'wheel gestures from the top of Colour to `Preset id` (seat\'s baseline: 4)',
        'UNMEASURABLE', 'the input is not mounted, so there is nothing to scroll to');
    } else {
      const start = await seen();
      // ⚠ THE SEAT'S OWN DELTAS, IN THE SEAT'S OWN ORDER. uxa F5: "4 wheel
      // gestures (2x600 + 2x700 deltaY)". Counting with a delta this file
      // invented would report a different UNIT and read as the same number.
      const DELTAS = [600, 600, 700, 700, 700, 700, 700, 700];
      let gestures = 0;
      let now = start;
      const sp = await c.json(String.raw`(() => { const sc = ${scrollerFor};
        if (!sc) return null; const b = sc.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
      while (!now.inView && gestures < DELTAS.length && sp) {
        await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: sp.x, y: sp.y,
          deltaX: 0, deltaY: DELTAS[gestures] });
        gestures += 1;
        await sleep(500);
        now = await seen();
      }
      check('P4c', 'wheel gestures from the top of Colour to `Preset id` (seat\'s baseline: 4)',
        now.inView === true && gestures <= 4,
        `${gestures} gesture(s) of the seat's own deltas ${JSON.stringify(DELTAS.slice(0, Math.max(gestures, 1)))}`
        + ` — arrived inView=${now.inView}. Start ${JSON.stringify(start)}; end ${JSON.stringify(now)}. `
        + 'scrollTop is the unit-free half of this measurement and is printed on both.');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // P5 — the raster timeline is still EXPANDED with its canvas DRAWN.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n──── P5: the raster timeline below the preset panel ────');
    // The canvas is found by being a <canvas> inside the Colour column that is
    // NOT the map canvas, and its being DRAWN is read off its own pixels —
    // a zero-size or never-painted canvas is exactly the regression P5 guards.
    const timeline = await c.json(String.raw`(() => {
      const all = [...document.querySelectorAll('canvas')].filter((cv) => cv.id !== 'map-canvas');
      const preset = ${PRESET_INPUT};
      const out = all.map((cv) => {
        const b = cv.getBoundingClientRect();
        let drawn = null;
        try {
          const ctx = cv.getContext('2d');
          if (ctx && cv.width > 0 && cv.height > 0) {
            const d = ctx.getImageData(0, 0, Math.min(cv.width, 64), Math.min(cv.height, 32)).data;
            let nonBlank = 0;
            for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) nonBlank += 1;
            drawn = nonBlank;
          }
        } catch (e) { drawn = 'threw: ' + e.message; }
        return {
          w: cv.width, h: cv.height, rect: b.toJSON(),
          rects: cv.getClientRects().length,
          visible: typeof cv.checkVisibility === 'function' ? cv.checkVisibility() : null,
          drawnAlphaPixels: drawn,
          belowPreset: preset
            ? (preset.compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null,
        };
      });
      return { count: all.length, canvases: out };
    })()`);
    const live = timeline.canvases.filter((cv) => cv.w > 0 && cv.h > 0 && cv.rects > 0);
    check('P5a', 'a raster-timeline canvas is MOUNTED, sized and painted below the preset panel',
      live.length > 0 && live.some((cv) => cv.belowPreset === true),
      `${timeline.count} non-map canvas(es); live ${live.length}: ${JSON.stringify(live)}`);
    check('P5b', 'and it has actually been DRAWN INTO (not a blank element holding space)',
      live.some((cv) => typeof cv.drawnAlphaPixels === 'number' && cv.drawnAlphaPixels > 0),
      live.map((cv) => `${cv.w}x${cv.h} drawn=${cv.drawnAlphaPixels}`).join('; ')
      + ' — read off the canvas\'s OWN pixels, because source can prove the absence of '
      + '`defaultCollapsed` and only a screen proves the canvas is there');

    const shotP5 = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/p4-p5-colour-tab.png`, Buffer.from(shotP5.data, 'base64'));

    // ═══════════════════════════════════════════════════════════════════════
    // S1 / S2 — the Save chip on a level header, and its `Saved!` flash.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n──── S1/S2: the Save chip and its flash ────');
    const CHIP = String.raw`
(() => [...document.querySelectorAll('button')]
  .find((b) => /^(Save|Saved!)$/.test((b.textContent || '').trim())
            && /Ctrl\+S|Nothing to save|art composer|composer's own Save/i.test(b.title || ''))
  || [...document.querySelectorAll('button')]
       .find((b) => /^(Save|Saved!)$/.test((b.textContent || '').trim())) || null)()`;
    const chip = await c.json(PAINTED(CHIP));
    check('S1', 'the level header PAINTS a `Save` chip (uxb F7 — the control seat A never found)',
      chip.found === true && chip.rects > 0 && chip.visible !== false && chip.hitInside === true,
      JSON.stringify(chip));

    // ⚠ S2's DIRTY GESTURE IS TAKEN ON THE CLASSIC SIDE, WITH S3's, AND HERE IS
    // WHY, said out loud rather than quietly relocated.
    //
    // Two attempts to dirty the AEON level document from this facet failed for
    // reasons that are about THIS HARNESS'S REACH and not about the app:
    //   - an effects-preset edit writes a DIFFERENT document, and
    //   - `setFacet("layout")` returned null, so the armed tool never left
    //     `view` and the drag on #map-canvas painted nothing.
    // Reporting either of those as "the Save chip does not flash" would be
    // reporting a harness limit as a verdict on the app.
    //
    // ⚠ AND ONE CLAIM IN THAT PARAGRAPH WAS WRONG, corrected here rather than
    // deleted. It said `aeon.state().dirty` "is the editor store's LEVEL flag",
    // which reads as "the flag any level dirties". It is `useEditorStore.dirty`,
    // keyed on the AEON project's zone/act, and a CLASSIC act's dirtiness is a
    // different field entirely (`useClassicLevelStore.dirty`; see
    // `shell/dirty-snapshot.ts`, which carries both as `aeonDirty` and
    // `classicDirty`). The block below says so again where it matters.
    //
    // So the flash is measured on a CLASSIC level below — which is the engine
    // seat A's own jobs were on, and the engine S3's toast is about. ONE dirty
    // document, ONE Ctrl+S, and both S2b and S3c are read off it, in one run.
    // The dirty document now comes from `__dbg.classic.stampLayoutCell`, which
    // commits through the app's own action and sets no flag — see that block.
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n──── P6/P7: the palette affordance and Ctrl+Shift+P ────');
    const AFFORD = String.raw`
(() => [...document.querySelectorAll('button')]
  .find((b) => /Run a command/.test((b.textContent || '') + ' ' + (b.title || ''))) || null)()`;
    const FILTER = `document.querySelector('input[placeholder="Filter…"]')`;

    const aff = await c.json(PAINTED(AFFORD));
    check('P6a', 'the `Run a command` affordance is PAINTED and hit-testable with no hover',
      aff.found === true && aff.rects > 0 && aff.visible !== false && aff.hitInside === true,
      JSON.stringify(aff));

    // ⚠ THE POSITIVE CONTROL FOR "does it read as a second search box": the
    // `Filter…` box it is supposed not to be confused with must itself be found
    // in the same read, or "they do not sit together" is a broken query's zero.
    const pair = await c.json(String.raw`(() => {
      const a = ${AFFORD}; const f = ${FILTER};
      if (!a) return { affordance: false };
      const ab = a.getBoundingClientRect();
      const fb = f ? f.getBoundingClientRect() : null;
      return {
        affordance: true, filterFound: !!f,
        affRect: ab.toJSON(), filterRect: fb ? fb.toJSON() : null,
        affTag: a.tagName, affIsInput: a.tagName === 'INPUT',
        affHasPlaceholder: !!a.getAttribute('placeholder'),
        sameRow: fb ? Math.abs(ab.top - fb.top) < 6 : null,
        verticalGap: fb ? Math.round(ab.top - fb.bottom) : null,
        explorerWidth: (() => {
          let n = a.parentElement;
          while (n && n !== document.body) {
            const b = n.getBoundingClientRect();
            if (b.width > 120 && b.width < 420) return Math.round(b.width);
            n = n.parentElement;
          }
          return null;
        })(),
      };
    })()`);
    check('P6b', 'it does NOT read as a second search box beside `Filter…` (a BUTTON, no placeholder, not on its row)',
      pair.affordance === true && pair.filterFound === true
      && pair.affIsInput === false && pair.affHasPlaceholder === false && pair.sameRow === false,
      `${JSON.stringify(pair)} — `
      + `the \`Filter…\` box is the POSITIVE CONTROL: found=${pair.filterFound}. `
      + 'Without it, "they are not side by side" could be a broken query returning a confident zero.');

    const shotP6 = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/p6-explorer.png`, Buffer.from(shotP6.data, 'base64'));

    // P7 — DELIVERY, through the real window keydown path.
    const openNow = async () => c.evalExpr(
      `!!document.querySelector('input[placeholder="Run a command…"]')`);
    if (await openNow()) { await key('Escape', 0, 'Escape'); await sleep(400); }
    check('P7a', 'ANTI-VACUOUS: the palette is CLOSED before the chord', (await openNow()) === false);
    await key('P', 10 /* Ctrl(2) + Shift(8) */, 'KeyP');
    let opened = false;
    for (let i = 0; i < 20; i++) { if (await openNow()) { opened = true; break; } await sleep(150); }
    check('P7b', '`Ctrl+Shift+P` opens the palette through the REAL window keydown path',
      opened === true,
      opened
        ? 'the palette\'s own input appeared after a real Input.dispatchKeyEvent with '
          + 'Ctrl+Shift — never a synthetic dispatchEvent, which the app would be free to ignore'
        : 'no palette input within ~3s of the chord');
    if (opened) {
      const collide = await c.json(String.raw`(() => {
        const i = document.querySelector('input[placeholder="Run a command…"]');
        const b = i ? i.getBoundingClientRect() : null;
        return { focused: document.activeElement === i, rect: b ? b.toJSON() : null,
                 rects: i ? i.getClientRects().length : 0 }; })()`);
      check('P7c', 'and it arrives PAINTED and focused (not opened underneath something)',
        collide.rects > 0 && collide.focused === true, JSON.stringify(collide));
      await key('Escape', 0, 'Escape');
      await sleep(300);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // S3 — does a CLASSIC save's success toast name the files it wrote?
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n──── S3: the classic save toast ────');
    if (!CLASSICDIR || !existsSync(CLASSICDIR)) {
      check('S3', 'a classic save\'s success toast NAMES the files it wrote', 'UNMEASURABLE',
        `CLASSIC_DIR ${CLASSICDIR ? `(${CLASSICDIR}) does not exist` : 'is unset'} — the classic `
        + 'toast cannot be raised without a classic project, and a green from the aeon toast '
        + 'would be about a different sentence (`Project saved`, which deliberately names no files).');
    } else {
      const st2 = await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(CLASSICDIR)})`)
        .catch((e) => `threw: ${e.message}`);
      await sleep(3500);
      const ps = await c.json('window.__dbg.projStatus()').catch(() => null);
      check('S3a', 'the COPIED classic project is open', !!(ps && ps.status === 'open'),
        `openDir -> ${JSON.stringify(st2)}; projStatus ${JSON.stringify(ps)}`);
      if (!ps || ps.status !== 'open') {
        check('S3b', 'a classic save\'s success toast NAMES the files it wrote', 'UNMEASURABLE',
          'the classic project did not open, so no classic save could be raised');
      } else {
        // ⚠ `openAct(0, 0)` TAKES IDS, NOT INDICES, and the first version of
        // this row passed indices and got "no act 00 in zone tree" — which
        // looks exactly like "the project has no acts". The ids are discovered
        // from the Explorer the reader actually uses, and the act is opened by
        // CLICKING it, which is better evidence than the debug door anyway.
        const rows = await c.json(String.raw`(() => {
          const all = [...document.querySelectorAll('div,button,li')]
            .filter((e) => e.getClientRects().length > 0)
            .filter((e) => ![...e.children].some((k) => (k.innerText || '') === (e.innerText || '')))
            .map((e) => ({ t: (e.innerText || '').trim().slice(0, 40), tag: e.tagName }))
            .filter((r) => r.t.length > 0 && r.t.length < 40);
          return all.slice(0, 60);
        })()`).catch(() => []);
        const clickedZone = await c.evalExpr(clickByText(
          String.raw`/^(Green Hill|GHZ|Zone|Labyrinth|Marble)/i`, 'div'));
        await sleep(1500);
        const clickedAct = await c.evalExpr(clickByText(String.raw`/^(Act ?1|1)$/i`, 'div'));
        await sleep(4000);
        const lvl = await c.json('window.__dbg.levelState()').catch(() => null);
        // ⚠ `ready`, NOT `open`. The first version of this row asked for
        // `status === 'open'` and read a LOADED act as "no act could be
        // opened" — a predicate one word off, reported as a fact about the
        // project. The store's own vocabulary is what is asked for.
        const openedAct = lvl && (lvl.status === 'ready' || lvl.status === 'open')
          ? 'ok' : 'not-open';
        check('S3b', 'an act is open on the classic side (the subject for the save)',
          openedAct === 'ok',
          `levelState ${JSON.stringify(lvl)}; zone click -> ${JSON.stringify(clickedZone)}; `
          + `act click -> ${JSON.stringify(clickedAct)}; explorer rows seen: `
          + `${JSON.stringify(rows.map((r) => r.t).slice(0, 24))}`);
        if (openedAct !== 'ok') {
          check('S2a1', 'the debug door made a real LEVEL edit through the app\'s own commit path',
            'UNMEASURABLE', 'no classic act reached the screen, so there was no document to edit');
          check('S2a2', 'ANTI-VACUOUS: a real BYTE changed in the document, read back out of it',
            'UNMEASURABLE', 'no classic act reached the screen, so nothing could be dirtied');
          check('S2a3', 'and the APP agrees on screen: the chip\'s tooltip flips to the Ctrl+S one',
            'UNMEASURABLE', 'no classic act reached the screen, so no level header was on it');
          check('S2b', 'Ctrl+S on a dirty level tab flashes `Saved!` ON THE CHIP', 'UNMEASURABLE',
            'no dirty level document to save');
          check('S3c', 'a classic save\'s success toast NAMES the files it wrote', 'UNMEASURABLE',
            'no classic act could be opened, so no classic save was raised. '
            + 'This is a limit of the harness\'s reach, NOT evidence about the toast.');
        } else {
          // ── DIRTY IT THROUGH THE DEBUG DOOR ─────────────────────────────
          //
          // ⚠ WHAT CHANGED SINCE THE 2026-09-10 SWEEP, AND WHAT DID NOT.
          //
          // The sweep parked S2 and S3 UNMEASURABLE because four routes to a
          // dirty LEVEL document all failed, and every failure was about THIS
          // HARNESS'S REACH: an Effects-preset edit writes a different
          // document; `__dbg.setFacet("layout")` returns null; the `Layout`
          // pill clicks (it is a BUTTON, not a `div`) but the `t` tool letter
          // leaves `tool` at `view`, so the drag on the canvas painted nothing.
          // `ClassicLevelViewport`'s key handling is not `MapViewport`'s and
          // arming its paint tool from outside is still a door this instrument
          // does not have. THAT IS UNCHANGED.
          //
          // What is new is `__dbg.classic.stampLayoutCell(plane)`
          // (src/renderer/debug-level-edit.ts). It calls
          // `classicSetLayoutCells`, which is EXACTLY the function
          // `ClassicLevelViewport`'s `endStroke` ends a real stamp gesture in --
          // same argument shape, one undo entry, the real dirty domain, the
          // real file on the next save. IT DOES NOT SET A DIRTY FLAG, and that
          // is the whole point: a door that flipped `dirty` would make S2b
          // vacuous, proving only that the chip reacts to a flag.
          //
          // ⚠ SO S2b AND S3c ARE NOW ABOUT EVERYTHING DOWNSTREAM OF THE MOUSE,
          // AND NOTHING UPSTREAM OF IT. The pointer gesture into that call is
          // still unexercised by this harness. A defect between the mouse and
          // `classicSetLayoutCells` would still be invisible here, and no row
          // below claims otherwise.
          //
          // ⚠ AND ONE CORRECTION TO THE ROW THAT USED TO STAND HERE. It read
          // `__dbg.aeon.state().dirty` and called that "the editor store's
          // LEVEL flag". It is `useEditorStore.dirty`, which is keyed on the
          // AEON project's zone/act (editorStore.ts markDirty reads
          // `p.currentZoneId`/`p.currentActId` off `useProjectStore`). A
          // CLASSIC act's dirtiness lives in `useClassicLevelStore.dirty` --
          // `shell/dirty-snapshot.ts` reads the two as separate fields,
          // `classicDirty` and `aeonDirty`. So on the classic subject that
          // predicate could not have gone true even with a working stroke. It
          // is still READ below, and printed, because a reader deserves to see
          // it stay false rather than to take that sentence on trust.
          const NOTHING = 'Nothing to save in this document';
          const CANSAVE = 'Save this document (Ctrl+S). Save All is Ctrl+Shift+S';
          // READ BEFORE THE EDIT, on THIS subject. S1's tooltip was read on the
          // aeon tab and is about a different document; a transition asserted
          // across two documents is not a transition.
          const chipBefore = await c.json(PAINTED(CHIP));
          const stamp = await c.json(
            '(() => { try { return window.__dbg.classic.stampLayoutCell("fg"); } '
            + 'catch (e) { return { ok: false, error: "threw: " + e.message }; } })()',
          ).catch((e) => ({ ok: false, error: `eval threw: ${e.message}` }));
          await sleep(900);
          const aeonDirty = await c.evalExpr(
            '(() => { try { return window.__dbg.aeon.state().dirty; } '
            + 'catch (e) { return "threw: " + e.message; } })()').catch(() => 'threw');

          // THE INDEPENDENT, SCREEN-SIDE WITNESS. `stamp` is the door's own
          // report; believing it alone would make the door the only evidence
          // for the door. The chip's tooltip is the app's OWN verdict --
          // `SaveChip` picks it from `canSaveActive(activeId)`, the same
          // predicate its click uses -- so a flip from "nothing to save" to the
          // Ctrl+S tooltip is the app saying, on screen, that this document now
          // has something to write.
          //
          // The census is PRINTED, never predicated on: if a second Save-shaped
          // button is on screen on the classic side (a sprite header's, say),
          // that must be visible to the reader rather than silently deciding
          // which button these rows are about.
          const CHIP_CENSUS = String.raw`
(() => [...document.querySelectorAll('button')]
  .filter((b) => /^(Save|Saved!)$/.test((b.textContent || '').trim()))
  .map((b) => ({ text: (b.textContent || '').trim(), title: (b.title || '').slice(0, 90),
                 rects: b.getClientRects().length, disabled: !!b.disabled })))()`;
          const chipAfter = await c.json(PAINTED(CHIP));
          const census = await c.json(CHIP_CENSUS).catch(() => []);

          // ⚠ NOT ONE ROW WITH THREE CLAUSES. The door's report, the document
          // bytes and the app's own tooltip are three separate witnesses, and a
          // single row would hide two of them behind whichever failed first.
          const stampOk = stamp && stamp.ok === true;
          check('S2a1', 'the debug door made a real LEVEL edit through the app\'s own commit path',
            stampOk === true,
            `stampLayoutCell -> ${JSON.stringify(stamp)}. This calls classicSetLayoutCells, `
            + 'the same function ClassicLevelViewport endStroke commits a stamp gesture with. '
            + 'It does NOT set a dirty flag; src/renderer/__tests__/debug-level-edit.test.ts '
            + 'reddens on that degradation (the undo row plus four source guards).');
          check('S2a2', 'ANTI-VACUOUS: a real BYTE changed in the document, read back out of it',
            stampOk === true && stamp.docChanged === true && stamp.from !== stamp.to,
            stampOk
              ? `${stamp.plane} cell (${stamp.x},${stamp.y}) ${stamp.from} -> ${stamp.cellAfter} `
                + `(asked for ${stamp.to}); dirty domains ${JSON.stringify(stamp.dirtyBefore)} -> `
                + `${JSON.stringify(stamp.dirtyAfter)}. A save with nothing changed would write the `
                + 'same bytes back and name a file for an edit that does not exist.'
              : `no stamp was made: ${JSON.stringify(stamp)}`);
          // ⚠ UNMEASURABLE, NOT FAIL, IF THE PRECONDITION IS ALREADY GONE. A
          // classic act that arrives with something to save is not a defect in
          // the chip, and a red here would say it was.
          check('S2a3', 'and the APP agrees on screen: the chip\'s tooltip flips to the Ctrl+S one',
            chipBefore.found !== true || chipBefore.title !== NOTHING
              ? 'UNMEASURABLE'
              : chipAfter.found === true && chipAfter.rects > 0 && chipAfter.title === CANSAVE,
            `chip title ${JSON.stringify(chipBefore.title)} -> ${JSON.stringify(chipAfter.title)} `
            + `on the CLASSIC level header (found ${chipBefore.found} -> ${chipAfter.found}). `
            + 'This is SaveChip reading canSaveActive, the same predicate its click uses, so it is '
            + 'the app\'s own verdict rather than the door\'s report about itself. '
            + `Save-shaped buttons on screen: ${JSON.stringify(census)}. `
            + `aeon editorStore dirty = ${JSON.stringify(aeonDirty)}, expected to stay false: it is `
            + 'the AEON flag, and this subject is a CLASSIC act.');

          const dirtyNow = stampOk && stamp.docChanged === true;
          if (dirtyNow !== true) {
            check('S2b', 'Ctrl+S on a dirty level tab flashes `Saved!` ON THE CHIP', 'UNMEASURABLE',
              'the door did not change a byte in the document, so a save would correctly write '
              + 'nothing and correctly not flash — a green here would have been vacuous. '
              + 'S2a1/S2a2 above say WHICH half failed, and neither is a verdict on the chip.');
            check('S3c', 'a classic save\'s success toast NAMES the files it wrote', 'UNMEASURABLE',
              'nothing was dirty, so no `Saved N level(s)` toast is due');
          } else {
            // ONE Ctrl+S. Both rows are read off it, in this one run.
            await key('s', 2, 'KeyS');
            let flashed = null;
            let toast = null;
            for (let i = 0; i < 30; i++) {
              if (flashed === null) {
                const t = await c.evalExpr(String.raw`(() => { const b = ${CHIP};
                  return b ? (b.textContent || '').trim() : 'no-chip'; })()`).catch(() => null);
                if (t === 'Saved!') flashed = t;
              }
              if (toast === null) {
                const t = await c.json(String.raw`(() => [...document.querySelectorAll('*')]
                  .filter((e) => /^Saved \d+ level|^Project saved|^Saved chunk/.test((e.innerText || '').trim())
                              && ![...e.children].some((k) => /^Saved \d+ level|^Project saved|^Saved chunk/
                                  .test((k.innerText || '').trim())))
                  .map((e) => (e.innerText || '').trim()))()`).catch(() => []);
                if (t.length) toast = t[0];
              }
              if (flashed !== null && toast !== null) break;
              await sleep(150);
            }
            check('S2b', 'Ctrl+S on a dirty level tab flashes `Saved!` ON THE CHIP (not only on a click)',
              flashed === 'Saved!',
              flashed === 'Saved!'
                ? 'the chip read "Saved!" inside its 1.5s window, raised by the CHORD — the gesture '
                  + 'a local useState flash could never have answered, which is why '
                  + 'state/save-receipt.ts is a store'
                : `the chip never read "Saved!" within ~4.5s of Ctrl+S (toast seen: ${JSON.stringify(toast)})`);
            check('S3c', 'a classic save\'s success toast NAMES the files it wrote',
              typeof toast === 'string' && /Saved \d+ level/.test(toast)
              && /\.(nem|bin|json)\b/.test(toast),
              toast === null
                ? 'no `Saved N level(s)` toast appeared within ~4.5s of Ctrl+S'
                : `toast = ${JSON.stringify(toast)} — the row asks for a FILE PATH in the sentence, `
                  + 'which is what seat A\'s F3 wanted and what `savedFilesSentence` adds');
          }
        }
      }
    }

    const shotEnd = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/panels-end.png`, Buffer.from(shotEnd.data, 'base64'));
    console.log(`\n    screenshots : ${SHOTS}/p4-p5-colour-tab.png, ${SHOTS}/p6-explorer.png, ${SHOTS}/panels-end.png`);
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok === true).length;
  const load1 = os.loadavg();
  console.log(`\n════ ${pass}/${results.length} rows PASS · ${fails.length} FAIL · `
    + `${unmeasurable.length} UNMEASURABLE · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  console.log(`     loadavg at start ${load0.map((n) => n.toFixed(2)).join(' ')} · `
    + `at end ${load1.map((n) => n.toFixed(2)).join(' ')}`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  if (unmeasurable.length) { console.log('UNMEASURABLE:'); for (const u of unmeasurable) console.log(`  ${u}`); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok === true).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
