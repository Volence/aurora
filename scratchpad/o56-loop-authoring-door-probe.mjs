#!/usr/bin/env node
// O56 — CAN A PERSON REACH THE LOOP/CROSSOVER AUTHORING CONTROLS?
//
// The engine half landed (aeon, 2026-09-03): painting a crossover changes which
// layer the player collides with. Aurora has the core modules, the lenses, the
// overlay wiring and an AGENT verb (`agent-handler.ts` paint_collision with
// plane:"both" + crossover). The question this probe answers is the OTHER one:
//
//   1. is there a HUMAN-FACING control for "solid on both planes"?
//   2. is there a HUMAN-FACING control for painting a layer transition?
//   3. if both exist, are they discoverable on arrival, or behind disclosures?
//
// METHOD — enumerate, then assert. Every control row in the right panel is
// listed by walking the DOM for the structure `CollisionPalette` actually
// builds (a flex row whose first child is the small grey label span, followed
// by buttons), and PRINTED with its label, its buttons, their selected state
// and their tooltips, BEFORE any row asserts anything about them. A probe that
// searched for the hard-coded string "A+B" could report a pass without ever
// establishing that a person can see it.
//
// VISIBILITY IS MEASURED AGAINST THE SCROLLER, not with checkVisibility() —
// an element scrolled 2,600px out of a scrolling panel passes checkVisibility()
// and getClientRects() both. Each control's rect is intersected with its
// nearest scrolling ancestor's rect and the overlap is printed.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:   AEON_DIR=<a COPY of aeon> node scratchpad/o56-loop-authoring-door-probe.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9436);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-o56-loop-authoring-door`;
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
      const d = r.exceptionDetails;
      throw new Error(`eval threw: ${d.text} ${d.exception?.description ?? d.exception?.value ?? ''}\n  expr: ${expr.slice(0, 200)}`);
    }
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

// ═══ CollapsibleSection headers, found structurally (O55's shape) ═══
const SECTIONS = String.raw`
(() => {
  const out = [];
  for (const el of document.querySelectorAll('div')) {
    const cs = getComputedStyle(el);
    if (cs.textTransform !== 'uppercase') continue;
    const parent = el.parentElement;
    if (!parent || getComputedStyle(parent).cursor !== 'pointer') continue;
    if (!el.firstElementChild) continue;
    const box = parent.parentElement;
    out.push({ title: (el.firstElementChild.textContent || '').trim(),
               open: !!box && box.children.length > 1 });
  }
  return out;
})()`;

// ═══ EVERY LABELLED CONTROL ROW, and whether it is really on screen ═══
// CollisionPalette builds each row as
//    <div style=flex><span LABEL/><button/><button/>…</div>
// The label span is the row's first element child and is not a button. Found by
// that structure, so a row this probe has never heard of still gets printed.
//
// `visible`: the row's rect intersected with the nearest ancestor whose
// computed overflowY is auto/scroll. checkVisibility() is NOT used — it goes
// green on content scrolled clean out of a scroller.
const CONTROL_ROWS = String.raw`
(() => {
  const scrollerOf = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === 'auto' || o === 'scroll') return p;
    }
    return document.documentElement;
  };
  const out = [];
  for (const el of document.querySelectorAll('div')) {
    const kids = [...el.children];
    if (kids.length < 2) continue;
    if (kids[0].tagName !== 'SPAN') continue;
    const btns = kids.filter((k) => k.tagName === 'BUTTON');
    if (btns.length === 0) continue;
    if (btns.length + 1 !== kids.length) continue;
    const r = el.getBoundingClientRect();
    const sc = scrollerOf(el).getBoundingClientRect();
    const ovW = Math.max(0, Math.min(r.right, sc.right) - Math.max(r.left, sc.left));
    const ovH = Math.max(0, Math.min(r.bottom, sc.bottom) - Math.max(r.top, sc.top));
    out.push({
      label: (kids[0].textContent || '').trim(),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      inScroller: { w: Math.round(ovW), h: Math.round(ovH) },
      visible: ovW > 0 && ovH > 0 && r.width > 0 && r.height > 0,
      buttons: btns.map((b) => ({
        text: (b.textContent || '').trim(),
        // The palette marks the armed chip by background alone (styles.planeSel
        // = T.accent). Reported raw rather than decoded: the store read-back in
        // section 5 is the authority on what is armed.
        bg: getComputedStyle(b).backgroundColor,
        disabled: !!b.disabled,
        title: (b.title || '').replace(/\s+/g, ' '),
      })),
    });
  }
  return out;
})()`;

// Every word on screen, filtered to the loop/crossover/both-planes vocabulary.
// This is the arrival-screen census: does ANYTHING point at the feature?
const LOOP_WORDS = String.raw`
(() => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent || '').trim();
    if (!t) continue;
    if (!/\b(loop|crossover|cross-over|both paths|both planes|handoff|hand-off|path A|path B)\b/i.test(t)) continue;
    const owner = n.parentElement;
    const r = owner ? owner.getBoundingClientRect() : null;
    out.push({ text: t.slice(0, 110), tag: owner ? owner.tagName : '?',
               onScreen: !!r && r.width > 0 && r.height > 0 });
  }
  return out;
})()`;

const CLICK_TEXT = (text, sel = 'button') => String.raw`
(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})]
  .find(e => (e.textContent||'').trim() === ${JSON.stringify(text)});
  if (!b) return 'not-found'; b.click(); return 'clicked'; })()`;

const results = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  console.log(`AEON_DIR = ${AEONDIR}`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', RUN.electron, RUN.main],
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
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (VITE_AURORA_DEBUG=1 build)', haveDbg);
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    // A FRESH ARRIVAL. localStorage carries the facet and the collapse state, so
    // measuring "what a person sees on arrival" over a warm profile would
    // measure this probe's own earlier clicks.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    const dpr = await c.evalExpr('window.devicePixelRatio');
    console.log(`        devicePixelRatio = ${dpr}   (all pixel figures below are CSS px)`);

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'a project with a level is open [precondition]',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — UNMEASURABLE');
    await sleep(2500);

    // ═══ 2. THE ARRIVAL SCREEN — ZERO CLICKS ═══════════════════════════
    const pills = await c.json(String.raw`
      [...document.querySelectorAll('button')]
        .map(e => (e.textContent||'').trim())
        .filter(t => /^(Layout|Art|Objects|Rings|Collision|Palette|Effects|Sprites|Music|Code)$/.test(t))`);
    console.log(`\n        FACET PILLS ON ARRIVAL (${pills.length}): ${JSON.stringify(pills)}`);
    check('2a', 'the facet bar offers a Collision pill', pills.includes('Collision'));

    const arrivalSections = await c.json(SECTIONS);
    console.log(`        SECTIONS ON THE ARRIVAL FACET (${arrivalSections.length}):`);
    for (const s of arrivalSections) console.log(`          ${s.open ? 'open  ' : 'closed'}  ${JSON.stringify(s.title)}`);

    const arrivalWords = await c.json(LOOP_WORDS);
    console.log(`\n        TEXT NAMING THE LOOP FEATURE ON THE ARRIVAL SCREEN (${arrivalWords.length}):`);
    for (const w of arrivalWords) console.log(`          <${w.tag}> ${w.onScreen ? '' : '(0x0) '}${JSON.stringify(w.text)}`);
    // NOT a gate on the count — a census. The row asserts only that the sweep
    // executed over a populated screen, so a zero below is a measurement and
    // not a broken walker.
    const bodyText = await c.evalExpr('document.body.innerText.length');
    check('2b', 'the arrival-screen text census ran over a populated screen [anti-vacuous]',
      bodyText > 500, `document.body.innerText = ${bodyText} chars; ${arrivalWords.length} loop-vocabulary node(s)`);

    // ═══ 3. ONE CLICK — the Collision facet ════════════════════════════
    const facetClick = await c.evalExpr(CLICK_TEXT('Collision'));
    check('3a', 'CLICK 1: the Collision facet pill takes a plain .click()',
      facetClick === 'clicked', `result=${facetClick}`);
    await sleep(1800);

    const secs = await c.json(SECTIONS);
    console.log(`\n        SECTIONS ON THE COLLISION FACET (${secs.length}):`);
    for (const s of secs) console.log(`          ${s.open ? 'open  ' : 'closed'}  ${JSON.stringify(s.title)}`);
    const collSec = secs.find((s) => s.title === 'Collision');
    check('3b', 'the "Collision" section is OPEN on arrival at the facet (no disclosure to click)',
      !!collSec && collSec.open, JSON.stringify(collSec));

    // ═══ 4. EVERY CONTROL ROW, PRINTED BEFORE ANYTHING IS ASSERTED ═════
    const rows = await c.json(CONTROL_ROWS);
    console.log(`\n        LABELLED CONTROL ROWS IN THE COLLISION PANEL (${rows.length}):`);
    for (const r of rows) {
      console.log(`          ${r.visible ? 'VISIBLE' : 'OFFSCR '} ${JSON.stringify(r.label).padEnd(12)} `
        + `rect=${r.rect.w}x${r.rect.h}@(${r.rect.x},${r.rect.y}) inScroller=${r.inScroller.w}x${r.inScroller.h}`);
      for (const b of r.buttons) {
        console.log(`              [${b.text}]${b.disabled ? ' DISABLED' : ''}`
          + (b.title ? `\n                  title: ${b.title.slice(0, 150)}` : ''));
      }
    }
    check('4a', 'the row walker found control rows at all [anti-vacuous]', rows.length >= 3,
      `${rows.length} rows: ${JSON.stringify(rows.map((r) => r.label))}`);

    // ── Q1: a human-facing "solid on both planes" control ──────────────
    // Found by MEANING, not by the string "A+B": a button whose tooltip names
    // both paths. A probe pinned to the glyph would go green on a relabel and
    // could never tell a control from a coincidence.
    const bothBtns = rows.flatMap((r) => r.buttons
      .filter((b) => /both (paths|planes)/i.test(b.title))
      .map((b) => ({ row: r.label, ...b, rowVisible: r.visible })));
    check('4b', 'Q1 — a HUMAN-FACING control for "solid on both planes" is on screen',
      bothBtns.length === 1 && bothBtns[0].rowVisible && !bothBtns[0].disabled,
      JSON.stringify(bothBtns, null, 2));

    // ── Q2: a human-facing layer-transition (crossover) control ────────
    // ⚠ The predicate is "a button that says it WRITES a handoff", not "a
    // tooltip mentioning the word crossover". The first shape of this row said
    // /crossover|handed to path/ and matched the Sec N Reset/Clear row too,
    // whose tooltips warn that they DESTROY a crossover. A row that cannot tell
    // the authoring control from the two that erase it is not measuring Q2.
    const xoverRows = rows.filter((r) => r.buttons.some((b) => /handed to path/i.test(b.title)));
    check('4c', 'Q2 — a HUMAN-FACING control row for painting a layer transition is on screen',
      xoverRows.length === 1 && xoverRows[0].visible && xoverRows[0].buttons.length === 3
      && xoverRows[0].buttons.every((b) => !b.disabled),
      JSON.stringify(xoverRows, null, 2));

    // ═══ 4d. Q3 — WHAT THE FACET SAYS BEFORE ANYTHING IS ARMED ═════════
    // ⚠ Taken HERE, not with the section-6 census, and that ordering is the
    // point. Both chips surface a lens and each lens writes an explanatory hint
    // onto the panel, so a census run AFTER the clicks reads back this probe's
    // own doing and would answer "the feature explains itself" about a screen no
    // arriving author ever sees.
    const preArm = await c.json(LOOP_WORDS);
    console.log(`\n        TEXT NAMING THE LOOP FEATURE ON ARRIVAL AT THE COLLISION FACET,`
      + `\n        BEFORE ANY CHIP IS ARMED (${preArm.length}):`);
    for (const w of preArm) console.log(`          <${w.tag}> ${JSON.stringify(w.text)}`);
    const { data: preShot } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/collision-facet-arrival.png`, Buffer.from(preShot, 'base64'));
    check('4d', 'Q3 — on arrival at the facet the loop control is on screen with NO disclosure opened',
      xoverRows.length === 1 && xoverRows[0].visible && preArm.length > 0,
      `${preArm.length} loop-vocabulary node(s) before arming`
      + ` → scratchpad/shots-o56-loop-authoring-door/collision-facet-arrival.png`);

    // ═══ 5. DO THE CLICKS ACTUALLY ARM THE BRUSH? ══════════════════════
    // A control a person can see but that writes nothing is the defect class
    // this repo keeps finding. `armCollisionBrush({})` sets nothing and reports
    // the live editorStore, so these rows read back the real state a click made.
    const before = await c.json('window.__dbg.aeon.armCollisionBrush({})');
    check('5a', 'brush starts NOT on both planes and with crossover "keep" [baseline]',
      before.bothPlanes === false && before.crossover === 'keep', JSON.stringify(before));

    const bothLabel = bothBtns[0]?.text;
    const bothClick = await c.evalExpr(CLICK_TEXT(bothLabel ?? ' '));
    await sleep(500);
    const afterBoth = await c.json('window.__dbg.aeon.armCollisionBrush({})');
    check('5b', `CLICK 2: clicking [${bothLabel}] arms both-planes painting in the store`,
      bothClick === 'clicked' && afterBoth.bothPlanes === true,
      `click=${bothClick} state=${JSON.stringify(afterBoth)}`);

    const handLabel = xoverRows[0]?.buttons.find((b) => /handed to path/i.test(b.title))?.text;
    const handClick = await c.evalExpr(CLICK_TEXT(handLabel ?? ' '));
    await sleep(500);
    const afterHand = await c.json('window.__dbg.aeon.armCollisionBrush({})');
    check('5c', `CLICK 3: clicking [${handLabel}] arms the crossover brush in the store`,
      handClick === 'clicked' && afterHand.crossover === 'hand-off',
      `click=${handClick} state=${JSON.stringify(afterHand)}`);

    // ── the two lenses the chips are documented to surface ─────────────
    const lensB = await c.json('window.__dbg.aeon.bothPlanesLens()').catch(() => null);
    const lensX = await c.json('window.__dbg.aeon.crossoverLens()').catch(() => null);
    console.log(`\n        LENS REPORTS AFTER ARMING:`);
    console.log(`          bothPlanesLens: ${JSON.stringify(lensB)}`);
    console.log(`          crossoverLens:  ${JSON.stringify(lensX)}`);
    // ⚠ `.active`, NOT `!!report`. The first shape of this row asserted the two
    // reports were non-null and PASSED under the red-first mutation while
    // bothPlanesLens answered {"active":false,"reason":"off"} — a lens that
    // never ran still publishes a report saying so, which is the whole point of
    // `reason`. A row that cannot tell "drew nothing" from "never armed" is
    // asserting nothing.
    check('5d', 'arming the two chips surfaced BOTH lenses (they are not silent modes)',
      lensB?.active === true && lensX?.active === true,
      `bothPlanes.active=${lensB?.active} (reason=${lensB?.reason}) `
      + `crossover.active=${lensX?.active} (reason=${lensX?.reason})`);

    // ═══ 6. THE DISCOVERABILITY CENSUS, ON THE FACET ═══════════════════
    const facetWords = await c.json(LOOP_WORDS);
    console.log(`\n        TEXT NAMING THE LOOP FEATURE ON THE COLLISION FACET (${facetWords.length}):`);
    for (const w of facetWords) console.log(`          <${w.tag}> ${JSON.stringify(w.text)}`);
    check('6a', 'the collision facet names the loop feature in on-screen text',
      facetWords.filter((w) => w.onScreen).length > 0, `${facetWords.length} node(s)`);

    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/collision-facet-armed.png`, Buffer.from(data, 'base64'));
    console.log(`        shot → scratchpad/shots-o56-loop-authoring-door/collision-facet-armed.png`);
  } finally {
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} rows passed`);
  if (bad.length) { for (const b of bad) console.log(`  FAIL ${b.id} ${b.name}`); process.exit(1); }
}

main().catch((e) => { console.error(`\nUNMEASURABLE / ERROR: ${e.message}`); process.exit(2); });
