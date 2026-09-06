#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// effects-bar-overflow — DOES the Effects tool-options bar overflow its 32px?
// ═══════════════════════════════════════════════════════════════════════════
//
//     VITE_AURORA_DEBUG=1 npm run build
//     AURORA_BUILT_TREE=<this worktree> \
//       ELECTRON_BIN=<...>/node_modules/.bin/electron \
//       node scratchpad/effects-bar-overflow-harness.mjs
//
// ═══ WHY IT EXISTS ═══
//
// The `default_off` parcel's packet shows a capture in which the Effects
// tool-options bar paints the whole twin refusal across the top of the window.
// That parcel did NOT measure the same state on the master it branched from and
// said so. This file is that measurement, and it is written to be RUNNABLE AT AN
// OLDER REVISION: it names no string this repo has shipped since 2026-09-05, it
// opens no collapsed section, and it clicks exactly one pill. `git checkout
// <rev>` leaves it in place (it is untracked at every revision) and the only
// repo file it imports — scratchpad/lib/{harness-guard,run-root}.mjs — exists at
// every revision in range.
//
// ═══ WHAT IT ASKS ═══
//
// `OptionBar` is `height: 32; align-items: center` with NO overflow rule and no
// wrapping rule. Its last child on the Effects facet is a bare `<span>` holding
// `line`. A flex item whose text is longer than the free width wraps, the
// wrapped box is centred in 32px, and the excess paints OUTSIDE the bar over
// whatever the shell put below it. So the question is not "is the text long"
// but a rect comparison, and the rect it is compared against is THE BAR'S OWN
// BOX — not the viewport, which would go green on a bar that overflowed by 200px
// as long as the window was tall.
//
// Every geometric row prints `devicePixelRatio` and the raw rects beside it.
//
// ═══ WHAT IT DOES NOT DO ═══
//
// It writes nothing. It opens aeon's project read-only through `__dbg.aeon.open`
// and issues no command. It does not touch the tile-animation sub-tab: the bar
// is mounted by the Effects FACET, so `Parallax` (the tab the facet arrives on)
// is where the defect is seen, and adding a second click would make the
// measurement depend on a sub-tab label that has moved once already.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9401);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const TAG = process.env.SHOT_TAG ?? 'run';
const SHOTS = `${ROOT}/scratchpad/shots-effects-bar-overflow`;
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
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    // ⚠ A BLANK PAGE HAS TO BE ABLE TO SAY WHY. Without this the first run of
    // this file reported "the Effects facet does not exist" for an 18-node
    // document, which is the shape of every renderer crash.
    if (msg.method === 'Runtime.exceptionThrown') {
      events.push(`EXCEPTION ${msg.params?.exceptionDetails?.text} `
        + `${msg.params?.exceptionDetails?.exception?.description ?? ''}`.slice(0, 800));
    } else if (msg.method === 'Log.entryAdded' && msg.params?.entry?.level === 'error') {
      events.push(`LOG ${msg.params.entry.text}`.slice(0, 400));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      events.push(`CONSOLE ${(msg.params.args || []).map((a) => a.description ?? a.value).join(' ')}`.slice(0, 800));
    }
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
  return { ready, send, evalExpr, json, events, close: () => ws.close() };
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

// ═══ THE MEASUREMENT ═══
//
// The bar is found from a chip it has carried since 6c3e3e5a (`? Guide`) OR,
// failing that, by shape: a flex row 32px tall directly under the workspace
// header whose last element child is a bare text span. Two finders because this
// file runs at revisions where the chip roster differs; the one that fired is
// reported, so a row can never be read as measuring a bar it did not find.
const MEASURE = String.raw`
(() => {
  const round = (r) => ({
    x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,
    w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100,
    top: Math.round(r.top * 100) / 100, bottom: Math.round(r.bottom * 100) / 100,
    left: Math.round(r.left * 100) / 100, right: Math.round(r.right * 100) / 100,
  });
  // NO BACKTICKS IN THIS COMMENT ON PURPOSE - it lives inside a String.raw
  // template, and the first draft of it ended the template mid-sentence.
  //
  // THE FIRST VERSION OF THIS PREDICATE MATCHED height === 32px AND SO INHERITED
  // THE DEFECT IT MEASURES. The repair under test lets the bar GROW, so the
  // finder stopped finding it and the run reported "the Effects tool-options bar
  // was found: no" for a bar that was on screen and correct. A gate written
  // inside the change it verifies takes that change's blind spot with it. The
  // height is READ here, never matched on.
  const isBar = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    if (cs.display !== 'flex' || cs.alignItems !== 'center') return false;
    // A chrome strip, not a page column: bordered below, and never tall.
    if (el.getBoundingClientRect().height < 24) return false;
    if (el.getBoundingClientRect().height > 200) return false;
    if (cs.borderBottomWidth === '0px') return false;
    const last = el.lastElementChild;
    return !!last && last.tagName === 'SPAN' && (last.textContent || '').trim().length > 0;
  };
  const bars = [...document.querySelectorAll('div')].filter(isBar);
  // Disambiguate: the Effects bar is the one carrying a chip labelled with a
  // lone question mark + word (? Guide, since 6c3e3e5a). Falls back to the
  // first bar by document order, and the finder that fired is REPORTED, so a row
  // can never be read as measuring a bar it did not find.
  const guideBar = bars.find((b) => [...b.querySelectorAll('button')]
    .some((x) => /^\?\s/.test((x.textContent || '').trim())));
  const bar = guideBar || bars[0] || null;
  if (!bar) return { found: false, barsSeen: bars.length,
    finder: 'none', allBars: [...document.querySelectorAll('div')].length };

  const span = bar.lastElementChild;
  const barRect = bar.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const csBar = getComputedStyle(bar);
  const csSpan = getComputedStyle(span);

  // WHAT IS DIRECTLY UNDER THE BAR — sampled at the span's own left edge, two
  // px below the bar's bottom border, with the span itself skipped. If the span
  // paints there, elementsFromPoint returns it FIRST, which is itself the
  // overlap finding; the next entry names the victim.
  const probeX = Math.round(Math.min(spanRect.left + 8, window.innerWidth - 2));
  const probeY = Math.round(barRect.bottom + 2);
  const stack = document.elementsFromPoint(probeX, probeY).slice(0, 5).map((e) => ({
    tag: e.tagName,
    cls: (e.className && typeof e.className === 'string') ? e.className.slice(0, 40) : '',
    text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    isTheSpan: e === span,
    rect: round(e.getBoundingClientRect()),
  }));

  // THE CLIPPER, if any: the nearest ancestor that would cut the span off.
  let clipper = null;
  for (let p = bar.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      clipper = { tag: p.tagName, overflow: cs.overflow, overflowX: cs.overflowX,
        overflowY: cs.overflowY, rect: round(p.getBoundingClientRect()) };
      break;
    }
  }

  const text = (span.textContent || '').replace(/\s+/g, ' ').trim();
  // Line count, from the span's own client rects: one rect per line box.
  const lineRects = [...span.getClientRects()].map(round);
  return {
    found: true,
    finder: guideBar ? 'guide-chip' : 'shape-only',
    barsSeen: bars.length,
    dpr: window.devicePixelRatio,
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    barRect: round(barRect),
    spanRect: round(spanRect),
    barOverflow: csBar.overflow,
    spanWhiteSpace: csSpan.whiteSpace,
    spanOverflow: csSpan.overflow,
    spanTextOverflow: csSpan.textOverflow,
    spanMinWidth: csSpan.minWidth,
    spanFlex: csSpan.flex,
    fontSize: csSpan.fontSize, lineHeight: csSpan.lineHeight,
    lines: lineRects.length,
    lineRects,
    textLength: text.length,
    text: text.slice(0, 600),
    // ── THE VERDICT ARITHMETIC, printed rather than reduced to a boolean ──
    overflowTopPx: Math.round((barRect.top - spanRect.top) * 100) / 100,
    overflowBottomPx: Math.round((spanRect.bottom - barRect.bottom) * 100) / 100,
    overflowRightPx: Math.round((spanRect.right - barRect.right) * 100) / 100,
    barScrollHeight: bar.scrollHeight, barClientHeight: bar.clientHeight,
    // TRUNCATION: is any of the string unreachable to a reader? A span whose
    // scrollWidth exceeds its clientWidth has text a reader cannot see.
    spanScrollWidth: span.scrollWidth, spanClientWidth: span.clientWidth,
    spanScrollHeight: span.scrollHeight, spanClientHeight: span.clientHeight,
    belowBar: stack,
    clipper,
  };
})()`;

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> scratchpad/shots-effects-bar-overflow/${name}.png`);
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    await c.send('Log.enable').catch(() => {});
    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg - nothing below can be measured');

    // ⚠ NO `localStorage.clear()` + `Page.reload` HERE, and that is deliberate.
    // The harness next door does both; run against a build in a linked worktree
    // the reload came back with an 18-node document and an empty body — React
    // never re-mounted, `__dbg` did, and every row below read that blank page as
    // "the Effects facet does not exist". `harness-guard` already gives this run
    // a private Electron profile, so the storage this would clear is empty by
    // construction and the reload buys nothing.

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the aeon project is open', !!(st && st.open), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open - nothing below can be measured');

    // ⚠ RETRIED, AND THE FAILURE PRINTS THE ROSTER. The pill mounts when the
    // project's facets do, which is later than `state().open`; a single click
    // attempt read that race as "there is no Effects facet".
    let clicked = false;
    for (let i = 0; i < 30; i++) {
      clicked = await c.evalExpr(clickByText('/^Effects$/'));
      if (clicked === true) break;
      await sleep(500);
    }
    const roster = clicked === true ? null
      : await c.json(String.raw`({
          buttons: [...document.querySelectorAll('button')]
            .map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 60),
          nodes: document.querySelectorAll('*').length,
          bodyText: (document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 400),
        })`);
    if (roster) { await shot(c, `${TAG}-no-effects-pill`);
      console.log('        renderer errors: ' + JSON.stringify(c.events.slice(0, 6), null, 2)); }
    check('2a', 'the facet bar offers an Effects pill [instrument check]', clicked === true,
      `clicked=${JSON.stringify(clicked)}${roster ? `; buttons on screen: ${JSON.stringify(roster)}` : ''}`);
    await sleep(1500);

    const m = await c.json(MEASURE);
    check('3a', 'the Effects tool-options bar was found [instrument check]', m.found === true,
      JSON.stringify({ finder: m.finder, barsSeen: m.barsSeen }));
    if (!m.found) throw new Error('no OptionBar found - nothing below can be measured');

    console.log('\n──── RAW MEASUREMENT ────');
    console.log(JSON.stringify(m, null, 2));
    console.log('─────────────────────────\n');

    check('3b', 'devicePixelRatio and the window are reported beside every rect',
      true, `dpr=${m.dpr}  window=${m.innerWidth}x${m.innerHeight}`);

    const spills = m.overflowBottomPx > 0.5 || m.overflowTopPx > 0.5;
    check('3c', 'THE VERDICT: the trailing line stays INSIDE the 32px bar',
      !spills,
      `bar=${JSON.stringify(m.barRect)} span=${JSON.stringify(m.spanRect)}\n`
      + `        lines=${m.lines} overflowTop=${m.overflowTopPx}px `
      + `overflowBottom=${m.overflowBottomPx}px overflowRight=${m.overflowRightPx}px\n`
      + `        textLength=${m.textLength} whiteSpace=${m.spanWhiteSpace} `
      + `barOverflow=${m.barOverflow} clipper=${JSON.stringify(m.clipper)}`);

    const overlapped = m.belowBar.filter((e) => !e.isTheSpan);
    check('3d', 'nothing the span paints over sits below the bar',
      !(m.belowBar[0] && m.belowBar[0].isTheSpan),
      `stack at the probe point: ${JSON.stringify(m.belowBar)}\n`
      + `        (first entry is the span => the span paints below the bar's bottom edge)\n`
      + `        victims: ${JSON.stringify(overlapped.slice(0, 2).map((e) => e.text))}`);

    check('3e', 'no part of the sentence is unreachable to a reader (no truncation)',
      m.spanScrollWidth <= m.spanClientWidth + 1 && m.spanScrollHeight <= m.spanClientHeight + 1,
      `span scroll=${m.spanScrollWidth}x${m.spanScrollHeight} `
      + `client=${m.spanClientWidth}x${m.spanClientHeight}`);

    await shot(c, `${TAG}-effects-bar`);
  } finally {
    try { c && c.close(); } catch { /* */ }
    await killTree(child);
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILING ROWS:\n  ' + fails.join('\n  ')); process.exitCode = 1; }
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exitCode = 2; });
