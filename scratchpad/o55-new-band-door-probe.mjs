#!/usr/bin/env node
// O55 — IS THE "New band" DOOR BROKEN, OR ARE THE HARNESSES?
//
// Three harnesses (bganim-band, bganim-rate-shift,
// bganim-ui-authored-composition) all die with
//     Error: no "New band" section on screen
// This probe answers whether that sentence is TRUE OF THE APP.
//
// It is deliberately NOT a copy of those harnesses' section-finder. It
// enumerates EVERY CollapsibleSection header the Effects facet renders, by
// walking the DOM for the header structure `CollapsibleSection` actually
// builds (a clickable div wrapping `PanelHeader`), and prints the titles. A
// probe that searched for one hard-coded string would reproduce exactly the
// mistake under investigation.
//
// It then drives the creation door end to end with the SAME gesture the
// harnesses use (`HTMLElement.click()`), so that if the app's door opens here
// the harnesses' failure cannot be an event-type mismatch.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:   AEON_DIR=<a COPY of aeon> node scratchpad/o55-new-band-door-probe.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9421);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-o55-new-band-door`;
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text}`);
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

// ═══ FIND HEADERS THE WAY THE COMPONENT BUILDS THEM ═══
// `CollapsibleSection` renders `<div onClick style="cursor:pointer"><PanelHeader>
// <span><span>chevron</span>TITLE</span>{right}</PanelHeader></div>`, and
// `PanelHeader` is the uppercase / letter-spaced div. So a header is: a div
// whose computed textTransform is uppercase, whose parent has cursor:pointer,
// and whose firstElementChild is the title span. Structure, not a label.
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
    out.push({
      title: (el.firstElementChild.textContent || '').trim(),
      letterSpacing: cs.letterSpacing,
      firstChildTag: el.firstElementChild.tagName,
      open: !!box && box.children.length > 1,
    });
  }
  return out;
})()`;

const OPEN_BY_TITLE = (title) => String.raw`
(() => {
  for (const el of document.querySelectorAll('div')) {
    const cs = getComputedStyle(el);
    if (cs.textTransform !== 'uppercase') continue;
    const parent = el.parentElement;
    if (!parent || getComputedStyle(parent).cursor !== 'pointer') continue;
    if (!el.firstElementChild) continue;
    if ((el.firstElementChild.textContent || '').trim() !== ${JSON.stringify(title)}) continue;
    const box = parent.parentElement;
    if (box && box.children.length > 1) return 'already-open';
    el.click();
    return 'clicked';
  }
  return 'no-section';
})()`;

// Every word on the Effects column that a person reads, filtered to the two
// feature nouns. This is what the node-side vocabulary gate cannot see.
const RENDERED_BAND_WORDS = String.raw`
(() => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent || '').trim();
    if (!t || !/\bbands?\b/i.test(t)) continue;
    const owner = n.parentElement;
    out.push({ text: t.slice(0, 120), tag: owner ? owner.tagName : '?' });
  }
  return out;
})()`;

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

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the aeon project is open [precondition]', !!(st && st.open && st.sections > 0),
      JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — UNMEASURABLE');

    await sleep(2500);
    const clicked = await c.evalExpr(String.raw`
      (() => { const b = [...document.querySelectorAll('button')]
        .find(e => /^Effects$/.test((e.textContent||'').trim())); if (!b) return false; b.click(); return true; })()`);
    check('2a', 'the facet bar offers an Effects pill [instrument check]', clicked === true, `click=${clicked}`);
    await sleep(1500);

    // ---- 2b. THE SUB-TAB BAR (d-26b). ------------------------------------
    // `effects-facet.tsx` UNMOUNTS the panel of every job but the active one
    // ("A tab that is not shown renders nothing"), and `editorStore`'s default
    // is `parallax`. So on arrival the tile-animation panel does not exist in
    // the DOM at all. Enumerated first, then selected, so the row that follows
    // says whether the DOOR works rather than whether a string is present.
    const tabs = await c.json(
      `[...document.querySelectorAll('[role="tab"]')].map(e => ({ label: (e.textContent||'').trim(),
        selected: e.getAttribute('aria-selected') === 'true' }))`);
    check('2b', 'the Effects column carries a sub-tab bar, defaulting to Parallax',
      tabs.length === 3 && tabs.find((t) => t.selected)?.label === 'Parallax', JSON.stringify(tabs));

    const beforeTab = await c.json(SECTIONS);
    console.log(`\n        SECTIONS ON THE DEFAULT (Parallax) TAB (${beforeTab.length}):`);
    for (const s of beforeTab) console.log(`          ${s.open ? 'open  ' : 'closed'}  ${JSON.stringify(s.title)}`);
    check('2c', 'on arrival NO tile-animation section is mounted (this is the harnesses\' failure)',
      !beforeTab.some((s) => /tile animation/i.test(s.title)));

    const tabClicked = await c.evalExpr(String.raw`
      (() => { const b = [...document.querySelectorAll('[role="tab"]')]
        .find(e => (e.textContent||'').trim() === 'Tile anim'); if (!b) return 'no-tab'; b.click(); return 'clicked'; })()`);
    check('2d', 'the "Tile anim" sub-tab activates on the same .click() the harnesses send',
      tabClicked === 'clicked', `result=${tabClicked}`);
    await sleep(1200);

    // ---- 3. WHAT SECTIONS ARE ACTUALLY ON SCREEN ------------------------
    const sections = await c.json(SECTIONS);
    console.log(`\n        SECTION HEADERS ON THE "Tile anim" TAB (${sections.length}):`);
    for (const s of sections) console.log(`          ${s.open ? 'open  ' : 'closed'}  ${JSON.stringify(s.title)}`);
    console.log('');
    check('3a', 'the probe found CollapsibleSection headers at all [anti-vacuous]',
      sections.length > 0, `${sections.length} headers`);

    const titles = sections.map((s) => s.title);
    check('3b', 'NO section on screen is titled "New band" (what the 3 harnesses demand)',
      !titles.includes('New band'), `titles = ${JSON.stringify(titles)}`);
    check('3c', 'a creation section IS on screen, titled "New tile animation"',
      titles.includes('New tile animation'));
    check('3d', 'the band-list section is titled "Tile animations (n/4)", not "BG animation bands"',
      titles.some((t) => /^Tile animations \(\d+\/\d+\)$/.test(t))
      && !titles.some((t) => /^BG animation bands/.test(t)));

    // ---- 4. DOES THE DOOR OPEN, WITH .click()? --------------------------
    const openedByStaleLabel = await c.evalExpr(OPEN_BY_TITLE('New band'));
    check('4a', 'opening by the STALE label "New band" returns no-section (reproduces the throw)',
      openedByStaleLabel === 'no-section', `result=${openedByStaleLabel}`);

    const openedByRealLabel = await c.evalExpr(OPEN_BY_TITLE('New tile animation'));
    await sleep(700);
    check('4b', 'opening by the REAL label with the SAME .click() gesture works',
      openedByRealLabel === 'clicked' || openedByRealLabel === 'already-open',
      `result=${openedByRealLabel}`);

    const after = await c.json(SECTIONS);
    const nt = after.find((s) => s.title === 'New tile animation');
    check('4c', 'the creation section is now OPEN (its children exist)', !!nt && nt.open,
      JSON.stringify(nt));

    // ---- 5. CAN A PERSON ACTUALLY MAKE ONE? -----------------------------
    const creators = await c.json(String.raw`
      [...document.querySelectorAll('button,[role="button"]')]
        .map(e => ({ text: (e.textContent||'').trim(), title: (e.title||'').replace(/\s+/g,' ').slice(0,90),
                     disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true' }))
        .filter(e => /^(Promote|Add|Add band|Add blank tile animation)$/.test(e.text))`);
    check('5a', 'the two creation controls are on screen and reachable',
      creators.length >= 2, JSON.stringify(creators, null, 2));

    // ---- 6. THE VOCABULARY LEAK THE NODE GATE CANNOT SEE ----------------
    // Every section on this tab is opened first: a collapsed section renders no
    // children, so a sweep over the arrival state would under-count and read as
    // a clean bill. `band-vocabulary.test.ts` scans QUOTED literals only, so a
    // label written as JSX text (`<Chip>Add band</Chip>`) is outside it — this
    // is the row that can see one.
    for (const t of ['Tile animations (1/4)', 'New tile animation']) {
      await c.evalExpr(OPEN_BY_TITLE(t));
      await sleep(400);
    }
    const allOpen = await c.json(SECTIONS);
    check('6a', 'every tile-animation section is OPEN for the sweep [anti-vacuous]',
      allOpen.filter((s) => /^(Tile animations|New tile animation)/.test(s.title)).every((s) => s.open),
      JSON.stringify(allOpen.filter((s) => /^(Tile animations|New tile animation)/.test(s.title))));

    const bandWords = await c.json(RENDERED_BAND_WORDS);
    console.log(`\n        RENDERED TEXT SAYING "band" ON THE TILE-ANIM TAB (${bandWords.length}):`);
    for (const w of bandWords) console.log(`          <${w.tag}>  ${JSON.stringify(w.text)}`);
    console.log('');
    // The welcome blurb's "raster bands" is a correct use of the raster noun.
    const leaks = bandWords.filter((w) => !/raster bands/i.test(w.text));
    check('6b', 'NO tile-animation surface says "band" on screen (EFFECTS-W1 defect 2)',
      leaks.length === 0, `${leaks.length} leak(s): ${JSON.stringify(leaks, null, 2)}`);

    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/effects-new-tile-animation-open.png`, Buffer.from(data, 'base64'));
    console.log(`        shot → scratchpad/shots-o55-new-band-door/effects-new-tile-animation-open.png`);
  } finally {
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} rows passed`);
  if (bad.length) { for (const b of bad) console.log(`  FAIL ${b.id} ${b.name}`); process.exit(1); }
}

main().catch((e) => { console.error(`\nUNMEASURABLE / ERROR: ${e.message}`); process.exit(2); });
