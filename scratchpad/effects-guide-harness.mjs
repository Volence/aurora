#!/usr/bin/env node
// CAN A FIRST-TIME USER SITTING IN THE EFFECTS TAB REACH THE GUIDE? (EFFECTS-W1 defect 1.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// The claim this parcel was given is not "a markdown file exists" and not "a
// component compiles". It is:
//
//        A PERSON WHO HAS NEVER SEEN THIS APP, SITTING ON THE EFFECTS TAB,
//        CAN REACH THE GUIDE WITHOUT BEING TOLD IT IS THERE — AND WHAT OPENS
//        IS THE GUIDE'S OWN WORDS, PAINTED, AT THE RIGHT PARAGRAPH.
//
// `guides.test.ts` proves the document parses and every deep link resolves to a
// heading. It cannot prove any of the five clauses above, because the node
// suite has no DOM: ~6,300 rows were green while the application had ZERO help
// affordances of any kind, which is the measurement (docs/reviews/
// 2026-09-02-effects-cold-walkthrough.md §a1/§d1) this file answers.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE COLD READER'S OWN SEARCH STILL FINDS NOTHING. Row [1a] runs that
//     exact search — every element whose text/title/aria-label matches
//     /help|guide|docs|manual|tutorial|\?/ — BEFORE any of this parcel's
//     controls are clicked, and prints the count. It was 0 on master. A row
//     that only asserted "my button exists" would pass on an app where nothing
//     else could be found either.
//
//   • THE BUTTON IS PRESENT BUT UNREACHABLE — collapsed, clipped, covered, or
//     off the scroll edge. Row [2b] asserts `checkVisibility()`, a non-empty
//     `getClientRects()` and a strict `elementFromPoint` at its integer centre.
//     Hidden text is still in `textContent`; this repo has shipped three rows
//     that went green over a permanently-collapsed disclosure.
//
//   • THE TAB OPENS AND THE PAGE IS EMPTY. Row [3b] measures the RENDERED text
//     length of the guide pane and requires several of the document's own
//     sentences, so a blank pane under a helpful title cannot pass.
//
//   • THE DEEP LINK DOES NOTHING. Row [3c] reads the scroller's `scrollTop`
//     and the target heading's position, in ONE run, and requires the heading
//     to be inside the painted viewport. "The anchor exists" is guides.test's
//     claim, not this one.
//
//   • THE APP AGREES WITH ITSELF. Rows [3b]/[4a] compare the RENDERED text
//     against the bytes of docs/guides/effects-first-run.md read from disk by
//     this process, so a component that had forked its own copy of the guide
//     would fail even while looking perfect.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. Every rect, dpr and hit test is read in
// one session and printed together.
//
// ⚠ NO EMULATOR, EVER. Nothing here runs a ROM.
//
// CLEANUP IS BY PID — `spawnGuarded` + `killTree`, awaited. No `pkill`.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:effects-guide
//
//   The aeon copy is only needed to reach the Effects tab (it needs an act
//   open). NOTHING here saves, so the copy is NOT consumed and a re-run on the
//   same directory is legitimate — unlike section-raster-select-harness.
//
//   PLANT=rot-finder  … look for a `?` button by a label nothing carries, so
//                       the finder matches nothing. [2a] must catch it and the
//                       run must ABORT rather than report section 3 as green.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9451);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 95);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-effects-guide`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';

/** The guide on disk — the same bytes the app is supposed to be rendering. */
const GUIDE_MD = readFileSync(`${ROOT}/docs/guides/effects-first-run.md`, 'utf8');

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
      throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
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

/**
 * THE COLD READER'S OWN SEARCH, verbatim from §a1 of the walkthrough: any
 * element whose text, `title` or `aria-label` matches help|guide|docs|manual|
 * tutorial|?. It returned ZERO on master, over the whole application.
 *
 * ⚠ IT COUNTS PAINTED ELEMENTS ONLY. `textContent` sees hidden subtrees, and a
 * hit that is not on screen is not an affordance.
 */
const HELP_SEARCH = String.raw`
(() => {
  const re = /help|guide|docs|manual|tutorial|\?/i;
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' ');
    const hay = (own + ' ' + (el.getAttribute('title') || '') + ' '
                 + (el.getAttribute('aria-label') || '')).trim();
    if (!hay || !re.test(hay)) continue;
    const painted = typeof el.checkVisibility === 'function'
      ? el.checkVisibility() : el.getClientRects().length > 0;
    if (!painted || el.getClientRects().length === 0) continue;
    out.push({ tag: el.tagName.toLowerCase(), text: hay.replace(/\s+/g, ' ').slice(0, 60) });
  }
  return out;
})()`;

/** The `? Guide` chip in the Effects tool-options bar. */
const GUIDE_BUTTON = String.raw`
(() => {
  const re = ${PLANT === 'rot-finder'
    ? String.raw`/^\?\?\? Manual$/`
    : String.raw`/^\?\s*Guide$/`};
  return [...document.querySelectorAll('button')]
    .find((b) => re.test((b.textContent || '').trim())) || null;
})()`;

/** The guide pane's scroller — marked with a data attribute by GuideTab. */
const GUIDE_PANE = `document.querySelector('[data-guide="effects-first-run"]')`;

async function main() {
  const t0 = Date.now();
  console.log('=== effects-guide harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log(`    guide on disk: ${GUIDE_MD.length} chars`);

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
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npx electron-vite build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. THE INSTRUMENT'S SUBJECT: an act, on the Effects tab. ---------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open with sections — the tab has something to show',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can be measured');
    await sleep(2500);

    const toEffects = await c.evalExpr(clickByText('/^Effects$/'));
    check('1b', 'the Effects facet mounts', toEffects === true, `click → ${toEffects}`);
    await sleep(1400);

    // ---- 2. THE COLD READER'S SEARCH NOW FINDS SOMETHING. ----------------
    //
    // THE ROW THE WHOLE DEFECT IS ABOUT, and it is run on the Effects tab
    // because that is where the owner was when he gave up.
    const help = await c.json(HELP_SEARCH);
    check('2a', 'the cold reader\'s own help search finds a PAINTED affordance on the Effects tab',
      help.length > 0,
      `${help.length} hit(s): ${JSON.stringify(help.slice(0, 6))}`
      + (help.length === 0 ? '  ← this is what master measured, over the WHOLE app' : ''));

    const btn = await c.json(String.raw`(() => {
      const b = ${GUIDE_BUTTON};
      if (!b) return { found: false };
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      const hit = document.elementFromPoint(x, y);
      return {
        found: true, text: (b.textContent || '').trim(), title: (b.title || '').slice(0, 80),
        dpr: window.devicePixelRatio, rect: r.toJSON(), aim: { x, y },
        rects: b.getClientRects().length,
        visible: typeof b.checkVisibility === 'function' ? b.checkVisibility() : null,
        hitIsButton: !!(hit && (hit === b || b.contains(hit))),
      };
    })()`);
    check('2b', 'the `? Guide` chip is FOUND, PAINTED, and answers a hit test at its own centre',
      btn.found === true && btn.rects > 0 && btn.visible !== false && btn.hitIsButton === true,
      btn.found === false
        ? 'NO ELEMENT MATCHED — finder rot, or the chip is not rendered'
        : JSON.stringify(btn));
    if (btn.found !== true) {
      throw new Error('the ? Guide chip was not found — sections 3-4 cannot be measured');
    }

    // ANTI-VACUOUS: no guide tab is open BEFORE the click, so "a guide tab
    // exists" below cannot be true for the wrong reason.
    const before = await c.json(`!!(${GUIDE_PANE})`);
    check('2c', 'ANTI-VACUOUS: no guide pane is rendered before the chip is clicked',
      before === false, `guide pane present at start = ${before}`);

    // ---- 3. ONE CLICK OPENS IT, AT THE RIGHT PARAGRAPH. ------------------
    await c.evalExpr(String.raw`(() => { const b = ${GUIDE_BUTTON}; b.click(); return 'ok'; })()`);
    await sleep(1400);

    const pane = await c.json(String.raw`(() => {
      const p = ${GUIDE_PANE};
      if (!p) return { found: false };
      const r = p.getBoundingClientRect();
      return {
        found: true, textLen: (p.innerText || '').length,
        rects: p.getClientRects().length,
        visible: typeof p.checkVisibility === 'function' ? p.checkVisibility() : null,
        rect: r.toJSON(),
        headings: [...p.querySelectorAll('[id]')].map((h) => h.id).slice(0, 20),
        tables: p.querySelectorAll('table').length,
        codeBlocks: p.querySelectorAll('pre').length,
      };
    })()`);
    check('3a', 'one click opens a PAINTED guide pane',
      pane.found === true && pane.rects > 0 && pane.visible !== false && pane.rect.width > 200,
      JSON.stringify({ ...pane, headings: pane.headings }));
    if (pane.found !== true) throw new Error('the guide pane never appeared');

    // THE PAGE IS THE DOCUMENT, not an empty shell and not a fork of it. Three
    // sentences taken from the markdown ON DISK by this process.
    const probes = [
      'A raster band repaints part of the palette for a range of screen lines',
      'Tile animations are not raster bands',
      'only if it binds a preset that no other section binds',
    ];
    const onDisk = probes.filter((p) => GUIDE_MD.includes(p));
    const rendered = await c.json(String.raw`(() => {
      const p = ${GUIDE_PANE};
      const t = (p.innerText || '').replace(/\s+/g, ' ');
      return ${JSON.stringify(probes)}.map((s) => t.includes(s.replace(/\s+/g, ' ')));
    })()`);
    check('3b', 'the pane renders the DOCUMENT\'S OWN sentences — read off disk by this process',
      onDisk.length === probes.length && rendered.every(Boolean) && pane.textLen > 3000,
      `on disk ${onDisk.length}/${probes.length}; rendered ${JSON.stringify(rendered)}; `
      + `pane innerText = ${pane.textLen} chars`);

    check('3c', 'the tables and code blocks the markdown carries really rendered as such',
      pane.tables >= 4 && pane.codeBlocks >= 2,
      `${pane.tables} table(s), ${pane.codeBlocks} code block(s)`);

    // THE DEEP LINK LANDED. The chip asks for §1; the heading must be inside
    // the pane's painted box, not merely present in the document.
    const anchored = await c.json(String.raw`(() => {
      const p = ${GUIDE_PANE};
      const h = p.querySelector('#what-does-this-tab-do');
      if (!h) return { found: false, ids: [...p.querySelectorAll('[id]')].map((e) => e.id) };
      const hb = h.getBoundingClientRect(), pb = p.getBoundingClientRect();
      const x = Math.round(hb.left + Math.min(hb.width, 40) / 2), y = Math.round(hb.top + hb.height / 2);
      const hit = document.elementFromPoint(x, y);
      return {
        found: true, scrollTop: Math.round(p.scrollTop),
        insideViewport: hb.top >= pb.top - 2 && hb.bottom <= pb.bottom + 2,
        rects: h.getClientRects().length,
        visible: typeof h.checkVisibility === 'function' ? h.checkVisibility() : null,
        hitInside: !!(hit && (hit === h || h.contains(hit) || hit.contains(h))),
        text: (h.innerText || '').trim().slice(0, 50),
      };
    })()`);
    check('3d', 'the chip\'s deep link scrolled §1 into the pane\'s painted viewport',
      anchored.found === true && anchored.insideViewport === true
      && anchored.rects > 0 && anchored.visible !== false && anchored.hitInside === true,
      JSON.stringify(anchored));

    // ---- 4. THE CONTENTS RAIL MOVES THE PAGE. ----------------------------
    //
    // A rail that renders and does nothing is chrome. This clicks the LAST
    // entry and requires the scroll position to move AND that heading to be in
    // view — two facts, because either alone can be true by accident.
    const railed = await c.json(String.raw`(() => {
      const p = ${GUIDE_PANE};
      const links = [...p.querySelectorAll('nav a')];
      if (links.length === 0) return { links: 0 };
      const before = Math.round(p.scrollTop);
      const last = links[links.length - 1];
      const want = (last.getAttribute('href') || '').slice(1);
      last.click();
      const h = p.querySelector('#' + CSS.escape(want));
      const hb = h ? h.getBoundingClientRect() : null, pb = p.getBoundingClientRect();
      return {
        links: links.length, label: (last.textContent || '').trim(), want,
        before, after: Math.round(p.scrollTop),
        inView: !!(hb && hb.top >= pb.top - 2 && hb.bottom <= pb.bottom + 40),
      };
    })()`);
    check('4a', 'the contents rail lists the sections and clicking one MOVES the page to it',
      railed.links >= 6 && railed.after !== railed.before && railed.inView === true,
      JSON.stringify(railed));

    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/effects-guide.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/effects-guide.png`);
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n════ ${pass}/${results.length} rows · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  if (fails.length) {
    console.log('FAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
