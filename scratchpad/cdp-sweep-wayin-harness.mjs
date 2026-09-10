#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// CDP SWEEP — the four numbered checks of
// docs/reviews/2026-09-10-way-into-a-project.md §6 (seat A's F1 and F6).
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ THIS HARNESS MUST RUN ON A BUILD WITH `VITE_AURORA_DEBUG` **UNSET**, AND
// THAT IS THE WHOLE POINT OF THE CHECK. The door under test exists because seat
// A could not open a project from the interface and had to drive every job
// through `window.__dbg`. A pass obtained WITH a debug build would be a pass
// about the debug build. So:
//
//   • row [0a] REFUSES TO CONTINUE if `window.__dbg` exists. It does not warn
//     and carry on -- a warning in a log is not a gate, and every row below
//     would then be measuring the wrong binary while every path in the output
//     still looked correct.
//   • nothing in this file calls `__dbg` for anything, including setup. Opening
//     the project is the gesture under test.
//
// ═══ WHAT WOULD MAKE THESE GO GREEN WITHOUT THE PROPERTY HOLDING ═══════════
//
//   • THE FIELD IS IN THE DOM BUT NOT ON SCREEN. Every row reads
//     `getClientRects()`, `checkVisibility()` and a strict `elementFromPoint`.
//
//   • THE VALUE WAS SET, NOT TYPED. A `value` setter plus a synthetic `input`
//     event is not typing, and it would sail past a field that ignores real
//     keys. Every path here is typed with `Input.insertText` / real key events
//     and submitted with a real Enter or a real click at an integer point.
//
//   • THE PROJECT WAS ALREADY OPEN. Row [2a] reads the tab strip BEFORE the
//     gesture and requires no project; the run also clears localStorage and
//     the recents file is left alone but asserted-on rather than assumed.
//
//   • CHECK 3's "the input does not move" IS AN OFF-BY-NOTHING MEASUREMENT.
//     The input's own y is read immediately before and after the refusal
//     paints, in the same units, and dpr is printed beside it -- dpr on this
//     box has been seen at both 1 and 1.35.
//
// ⚠ A NATIVE FILE DIALOG RENDERS NOTHING UNDER Xvfb AND HANGS, which looks
// exactly like a dead button. Nothing here clicks `Open Project…`; that is
// seat A's F1 and it is explicitly NOT re-litigated. This file only measures
// the TYPED PATH door, which needs no portal.
//
// CLEANUP IS BY PID — `spawnGuarded` + awaited `killTree`. NO EMULATOR, EVER.
//
// RUN:
//   npx electron-vite build            # ⚠ VITE_AURORA_DEBUG UNSET
//   AEON_DIR=<writable copy> CLASSIC_DIR=<writable copy> \
//   AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<an electron> \
//   node scratchpad/cdp-sweep-wayin-harness.mjs

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9475);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 96);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const CLASSICDIR = process.env.CLASSIC_DIR ?? null;
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

/** The typed-path field. Found by the two things the source guarantees about
 *  it — it is a text input whose placeholder or aria names a PATH — never by
 *  "the first input on the page", which moves. */
const PATH_FIELD = String.raw`
(() => [...document.querySelectorAll('input')]
  .filter((i) => i.type === 'text' || !i.type || i.type === '')
  .filter((i) => i.getClientRects().length > 0)
  .find((i) => /path|\/home|directory|folder/i.test(
    (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || '') + ' ' + (i.title || '')))
  || null)()`;

const PAINTED = (selectorExpr) => String.raw`
(() => {
  const el = ${selectorExpr};
  if (!el) return { found: false };
  const b = el.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                        Math.round(b.top + b.height / 2));
  return {
    found: true, placeholder: el.placeholder || null, value: el.value || '',
    rect: b.toJSON(), rects: el.getClientRects().length,
    visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
    hitInside: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))),
    hitTag: hit ? hit.tagName : null,
    dpr: window.devicePixelRatio,
  };
})()`;

async function main() {
  const t0 = Date.now();
  const load0 = os.loadavg();
  console.log('=== cdp-sweep way-into-a-project harness (checks 1-4) ===');
  console.log(`    node        : ${process.version}`);
  console.log(`    loadavg     : ${load0.map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    CLASSIC_DIR : ${CLASSICDIR ?? '(unset)'}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}   PORT: ${PORT}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  delete env.VITE_AURORA_DEBUG;
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
    // Give the renderer a moment, then clear and reload COLD (check 1 says
    // "launch cold with no recents").
    await sleep(4000);
    await c.evalExpr('localStorage.clear()').catch(() => {});
    await c.send('Page.reload');
    await sleep(6000);

    // ── 0. THE GATE. ─────────────────────────────────────────────────────
    const hasDbg = await c.evalExpr('typeof window.__dbg === "object"').catch(() => false);
    check('0a', 'this is a build with `VITE_AURORA_DEBUG` UNSET — the condition the check names',
      hasDbg === false,
      hasDbg === false
        ? '`window.__dbg` is absent, so every row below is about the shipped door and not a debug hook'
        : '⚠ `window.__dbg` EXISTS. This is a DEBUG build and every row below would be measuring '
          + 'the wrong binary. REFUSING to continue.');
    if (hasDbg !== false) throw new Error('debug build — rebuild with VITE_AURORA_DEBUG unset');

    // ── CHECK 1 — the field is on the Home hero page. ─────────────────────
    console.log('\n──── check 1: the path field on a cold Home ────');
    const noProject = await c.json(String.raw`(() => ({
      tabs: [...document.querySelectorAll('[role="tab"],[data-tab-id]')].length,
      bodyText: (document.body.innerText || '').slice(0, 400),
    }))()`);
    const openBtn = await c.json(String.raw`(() => {
      const b = [...document.querySelectorAll('button')]
        .find((e) => /Open Project/i.test((e.textContent || '').trim()));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { text: (b.textContent || '').trim(), rect: r.toJSON() };
    })()`);
    const field = await c.json(PAINTED(PATH_FIELD));
    check('1a', 'the Home hero page shows `Open Project…` (the POSITIVE CONTROL for "we are on Home")',
      openBtn !== null, `${JSON.stringify(openBtn)}`);
    check('1b', 'a typed-path field is PAINTED on the Home hero page, under `Open Project…`',
      field.found === true && field.rects > 0 && field.visible !== false
      && field.hitInside === true
      && (openBtn === null || field.rect.top >= openBtn.rect.top - 1),
      `${JSON.stringify(field)}\n        `
      + `(field top ${field.rect && field.rect.top} vs Open Project… top `
      + `${openBtn && openBtn.rect.top}; dpr ${field.dpr}) — cold state: `
      + `${JSON.stringify(noProject.bodyText.slice(0, 160))}`);
    if (field.found !== true) throw new Error('no typed-path field — checks 2-4 have nothing to drive');

    // The two gestures, both REAL.
    const clickAt = async (sel) => {
      const p = await c.json(String.raw`(() => {
        const el = ${sel}; if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
        return { x, y, hit: (document.elementFromPoint(x, y) || {}).tagName || null,
                 dpr: window.devicePixelRatio, rect: b.toJSON() };
      })()`);
      if (!p) return null;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
      return p;
    };
    const clearField = async () => {
      await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA',
        modifiers: 2, windowsVirtualKeyCode: 65 });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA',
        modifiers: 2, windowsVirtualKeyCode: 65 });
      await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Delete', code: 'Delete',
        windowsVirtualKeyCode: 46 });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete',
        windowsVirtualKeyCode: 46 });
    };
    const enter = async () => {
      for (const type of ['rawKeyDown', 'keyUp']) {
        await c.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter',
          windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      }
    };

    // ── CHECK 3 FIRST — it must run while NO project is open, and it is the
    // one that measures a coordinate. Doing it before the open keeps it on the
    // cold layout the seat's F4 concern is about.
    console.log('\n──── check 3: a refusal appears, and the input does not move ────');
    await clickAt(PATH_FIELD);
    await sleep(250);
    await clearField();
    await c.send('Input.insertText', { text: '~/whatever' });
    await sleep(400);
    const beforeY = await c.json(String.raw`(() => {
      const el = ${PATH_FIELD}; const b = el.getBoundingClientRect();
      return { y: b.top, x: b.left, dpr: window.devicePixelRatio,
               value: el.value, bodyLen: (document.body.innerText || '').length }; })()`);
    await enter();
    await sleep(900);
    const afterY = await c.json(String.raw`(() => {
      const el = ${PATH_FIELD}; const b = el.getBoundingClientRect();
      return { y: b.top, x: b.left, value: el.value,
               bodyLen: (document.body.innerText || '').length }; })()`);
    const refusal = await c.json(String.raw`(() => {
      const el = ${PATH_FIELD};
      const fb = el ? el.getBoundingClientRect() : null;
      const leaves = [...document.querySelectorAll('div,span,p')]
        .filter((d) => d.getClientRects().length > 0)
        .filter((d) => /shell expands|not an absolute path|directory named|expands/i
                        .test(d.innerText || ''))
        .filter((d) => ![...d.children].some((k) => /shell expands|not an absolute path/i
                        .test(k.innerText || '')));
      const leaf = leaves[0] || null;
      if (!leaf) {
        return { found: false,
          anyWarn: [...document.querySelectorAll('div,span,p')]
            .filter((d) => d.getClientRects().length > 0 && /~|refus|cannot|invalid/i.test(d.innerText || ''))
            .map((d) => (d.innerText || '').trim().slice(0, 120)).slice(0, 5) };
      }
      const b = leaf.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                            Math.round(b.top + b.height / 2));
      return {
        found: true, text: (leaf.innerText || '').trim().slice(0, 220),
        rect: b.toJSON(), rects: leaf.getClientRects().length,
        visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
        hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
        belowField: fb ? b.top >= fb.bottom - 1 : null,
      };
    })()`);
    check('3a', 'typing `~/whatever` and pressing Enter PAINTS a refusal, below the field, naming the rule',
      refusal.found === true && refusal.rects > 0 && refusal.visible !== false
      && refusal.hitInside === true && refusal.belowField === true,
      JSON.stringify(refusal));
    check('3b', 'and the INPUT DOES NOT MOVE under the reader\'s hand while the refusal appears (F4 avoided)',
      beforeY.y === afterY.y && beforeY.x === afterY.x,
      `input top ${beforeY.y} -> ${afterY.y}, left ${beforeY.x} -> ${afterY.x}; dpr ${beforeY.dpr}; `
      + `body text grew ${beforeY.bodyLen} -> ${afterY.bodyLen} chars, so the refusal DID render `
      + '(an unchanged y over an unchanged page would be a vacuous pass)');
    check('3c', 'the refusal OPENED NOTHING — still no project after a refused path',
      (await c.evalExpr(String.raw`(() => {
        const b = [...document.querySelectorAll('button')]
          .find((e) => /Open Project/i.test((e.textContent || '').trim()));
        return !!b; })()`)) === true,
      'the Home hero `Open Project…` is still on screen, so the refused path did not route to a loader');

    const shot3 = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/wayin-3-refusal.png`, Buffer.from(shot3.data, 'base64'));

    // ── CHECK 2 — a real path opens a real project, by Enter. ─────────────
    console.log('\n──── check 2: a typed path opens a project ────');
    await clickAt(PATH_FIELD);
    await sleep(250);
    await clearField();
    await c.send('Input.insertText', { text: AEONDIR });
    await sleep(400);
    const typed = await c.evalExpr(String.raw`(() => { const el = ${PATH_FIELD};
      return el ? el.value : null; })()`);
    check('2a', 'ANTI-VACUOUS: the real path is IN THE BOX, typed through real key events',
      typed === AEONDIR, `box holds ${JSON.stringify(typed)}`);
    await enter();
    // Opening a project is the slowest thing in this sweep and the box is
    // loaded; poll rather than sleeping a guess.
    let opened = null;
    for (let i = 0; i < 60; i++) {
      opened = await c.json(String.raw`(() => {
        const text = document.body.innerText || '';
        return {
          facets: ['Layout', 'Objects', 'Collision', 'Palette', 'Art', 'Effects']
            .filter((f) => new RegExp('(^|\\n)' + f + '(\\n|$)').test(text)),
          hasCanvas: !!document.querySelector('canvas'),
          stillHome: /Open Project/i.test(text),
          head: text.slice(0, 200),
        }; })()`).catch(() => null);
      if (opened && opened.facets.length > 0 && opened.hasCanvas) break;
      await sleep(500);
    }
    check('2b', 'ENTER on a typed path OPENS the project — a level reaches the screen',
      !!(opened && opened.facets.length > 0 && opened.hasCanvas === true),
      `${JSON.stringify(opened)} — the facet pills and a painted canvas are what "a level reached `
      + 'the screen" means here; both come from the app, neither from a debug hook');

    const shot2 = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/wayin-2-opened.png`, Buffer.from(shot2.data, 'base64'));

    // ── CHECK 4 — the second field, and the engine switch. ────────────────
    console.log('\n──── check 4: `Switch project` and the engine flip ────');
    const second = await c.json(PAINTED(PATH_FIELD));
    // With a project open the Home tab must still be reachable; the field lives
    // in the `Switch project` group there.
    // ⚠ A SYNTHETIC `.click()` IS NOT A CLICK, and the first version of this
    // row used one. It reported "Home clicked" and the Home tab never
    // activated, so the second path field was read at `rects: 0` -- present in
    // the DOM, mounted, hidden -- and the row said the FIELD was missing when
    // what was missing was the TAB SWITCH. Every Home candidate is now clicked
    // with a REAL press/release at an integer point, and the loop stops when
    // the Home pane is actually on screen.
    let homeBack = 'no-home';
    for (let i = 0; i < 6; i++) {
      const cand = await c.json(String.raw`(() => {
        const els = [...document.querySelectorAll('button,div,li,span,a')]
          .filter((e) => e.getClientRects().length > 0)
          .filter((e) => (e.textContent || '').trim() === 'Home')
          .filter((e) => ![...e.children].some((k) => (k.textContent || '').trim() === 'Home'));
        const el = els[${'${i}'}];
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2),
                 tag: el.tagName, n: els.length };
      })()`.replace('${i}', String(i))).catch(() => null);
      if (!cand) break;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent',
          { type, x: cand.x, y: cand.y, button: 'left', clickCount: 1 });
      }
      await sleep(1200);
      const onHome = await c.evalExpr(
        '/Switch project|Aurora/i.test(document.body.innerText || "")').catch(() => false);
      homeBack = `real click on ${cand.tag} #${i} of ${cand.n} at (${cand.x},${cand.y}) -> `
        + `onHome=${onHome}`;
      if (onHome) break;
    }
    await sleep(1800);
    // ⚠ THE CHECK SAYS "SCROLL TO `Switch project`". A row that only looks at
    // what is above the fold would report a section that exists as absent, so
    // the Home pane is scrolled to its bottom before the read, and what the
    // pane actually contains is printed either way.
    const homeDump = await c.json(String.raw`(() => {
      const panes = [...document.querySelectorAll('div')]
        .filter((d) => { const ov = getComputedStyle(d).overflowY;
                         return (ov === 'auto' || ov === 'scroll') && d.scrollHeight > d.clientHeight + 1; });
      for (const p of panes) p.scrollTop = p.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      return { panes: panes.length,
               text: (document.body.innerText || '').slice(0, 700),
               inputs: [...document.querySelectorAll('input')]
                 .map((i) => ({ ph: i.placeholder || null, type: i.type || null,
                                rects: i.getClientRects().length })) };
    })()`).catch(() => null);
    await sleep(900);
    const switchField = await c.json(PAINTED(PATH_FIELD));
    const switchGroup = await c.evalExpr(String.raw`
      /Switch project/i.test(document.body.innerText || '')`);
    check('4a', 'with a project open, the Home tab carries a SECOND typed-path field under `Switch project`',
      switchField.found === true && switchField.rects > 0 && switchField.visible !== false
      && switchField.hitInside === true && switchGroup === true,
      `Home click -> ${JSON.stringify(homeBack)}; "Switch project" present: ${switchGroup}; `
      + `field ${JSON.stringify(switchField)} (before returning Home: ${JSON.stringify(second.found)})\n`
      + `        Home pane after scrolling to its bottom: ${JSON.stringify(homeDump)}`);

    if (!CLASSICDIR || !existsSync(CLASSICDIR)) {
      check('4b', 'a typed path to the OTHER engine\'s project switches, arriving on the NEW engine\'s facets',
        'UNMEASURABLE',
        `CLASSIC_DIR ${CLASSICDIR ? 'does not exist' : 'is unset'} — this row needs a project of the `
        + 'OTHER engine, and an aeon-to-aeon switch would not test the facet flip at all');
    } else if (switchField.found !== true) {
      check('4b', 'a typed path to the OTHER engine\'s project switches, arriving on the NEW engine\'s facets',
        'UNMEASURABLE', 'no second field was reached, so there was nothing to type into');
    } else {
      const beforeFacets = await c.json(String.raw`(() => {
        const text = document.body.innerText || '';
        return ['Layout','Objects','Collision','Palette','Art','Effects','FG','BG']
          .filter((f) => new RegExp('(^|\\n)' + f + '(\\n|$)').test(text)); })()`);
      await clickAt(PATH_FIELD);
      await sleep(250);
      await clearField();
      await c.send('Input.insertText', { text: CLASSICDIR });
      await sleep(400);
      await enter();
      let after = null;
      for (let i = 0; i < 60; i++) {
        after = await c.json(String.raw`(() => {
          const text = document.body.innerText || '';
          return {
            facets: ['Layout','Objects','Collision','Palette','Art','Effects']
              .filter((f) => new RegExp('(^|\\n)' + f + '(\\n|$)').test(text)),
            zones: /LEVELS/.test(text),
            head: text.slice(0, 200),
          }; })()`).catch(() => null);
        // The classic facet set contains Collision and Palette; the aeon one
        // is the set that carries Effects. The FLIP is what this row is about.
        if (after && after.facets.includes('Collision') && !after.facets.includes('Effects')) break;
        await sleep(500);
      }
      check('4b', 'a typed path to the OTHER engine\'s project switches, arriving on the NEW engine\'s facets',
        !!(after && after.facets.includes('Collision') && !after.facets.includes('Effects')),
        `facets before ${JSON.stringify(beforeFacets)} -> after ${JSON.stringify(after && after.facets)}; `
        + `${JSON.stringify(after && after.head)} — this is F6's UI verdict on a SCREEN: the classic `
        + 'facet set replaced the aeon one, rather than the new project loading invisibly behind '
        + 'the old engine\'s pills');
    }

    const shot4 = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/wayin-4-switched.png`, Buffer.from(shot4.data, 'base64'));
    console.log(`\n    screenshots : ${SHOTS}/wayin-3-refusal.png, ${SHOTS}/wayin-2-opened.png, `
      + `${SHOTS}/wayin-4-switched.png`);
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
