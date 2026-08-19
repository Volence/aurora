#!/usr/bin/env node
// DOES THE CHUNKS STATUS HINT STILL EAT ITS OWN SENTENCE?
//
// The hint used to share the panel toolbar row with the count, the selection
// badge and the size buttons, taking whatever was left. In a 260px column that
// leftover measured ~157px for a sentence wanting ~213px, so it ellipsized
// mid-sentence — and aeon is the worse case, not classic: its badge is a chunk
// NAME (maxWidth 120) and it renders the S/M/L control, so a long name can
// squeeze the leftover toward zero. The fix gives the hint its own line
// (ChunkGrid `hintLine`, flexBasis 100%).
//
// This measures the claim rather than eyeballing a PNG: for each engine, the
// hint's scrollWidth is compared against its clientWidth (>1px of overflow means
// the sentence is being cut), and its bounding box is compared against the
// count's (its top must clear the count's bottom, i.e. it is on its OWN line).
//
// PLANTED-DEFECT NOTE, and the measurement that settled the design question.
// Reverting `hintLine` to the old shared style (`flex: 1, textAlign: 'right'`
// instead of `flexBasis: '100%'`) and rebuilding fails SIX rows — 2c/3c, 2t/3t,
// 2s/3s — with these widths:
//
//     classic, stamp state      wants 214px, has 156px   → 58px cut
//     aeon, nothing selected    wants 103px, has  82px   → 21px cut
//     aeon, chunk selected      wants 187px, has  29px   → 158px cut
//
// The last row is the point. The packet recorded this as classic's problem
// (213px into 157px) and framed it as "the copy is too long". Aeon is far worse:
// with a chunk NAME in the badge (maxWidth 120) and the S/M/L control holding
// the right end, the leftover collapses to 29px — no sentence fits that, so no
// amount of rewriting could have fixed it. That is why this is a layout change.
// A green run WITHOUT re-planting that style means nothing.

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9374);
const ROOT = '/home/volence/sonic_hacks/aurora';
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const AEONDIR = '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-chunkgrid-hint`;
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
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

// The hint is found by its TEXT, not by a class or a font size: the copy is the
// subject, and a size-based scan would silently stop finding it the moment the
// tier changes. `count` is its row-1 neighbour, found the same way.
const PROBE = String.raw`
(() => {
  const spans = [...document.querySelectorAll('span')];
  const hintEl = spans.find((e) => /Click (map|a chunk|to (select|pick))/.test((e.textContent || '').trim()));
  const countEl = spans.find((e) => /^\d+ chunks$/.test((e.textContent || '').trim()));
  if (!hintEl || !countEl) return { found: false, hintText: hintEl ? hintEl.textContent : null };
  const h = hintEl.getBoundingClientRect();
  const c = countEl.getBoundingClientRect();
  const bar = hintEl.parentElement.getBoundingClientRect();
  const sizeCtl = [...hintEl.parentElement.children].find((e) => e.querySelector && e.querySelector('button'));
  return {
    found: true,
    text: (hintEl.textContent || '').trim(),
    fontSize: getComputedStyle(hintEl).fontSize,
    scrollW: hintEl.scrollWidth, clientW: hintEl.clientWidth,
    over: hintEl.scrollWidth - hintEl.clientWidth,
    hintTop: Math.round(h.top), hintLeft: Math.round(h.left), hintW: Math.round(h.width),
    countBottom: Math.round(c.bottom), countLeft: Math.round(c.left),
    barRight: Math.round(bar.right), barW: Math.round(bar.width),
    sizeCtlRight: sizeCtl ? Math.round(sizeCtl.getBoundingClientRect().right) : null,
  };
})()`;

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-chunkgrid-hint/${name}.png`);
}

function assertHint(tag, p, expectSizeCtl) {
  check(`0${tag}`, `${tag}: the hint and the count are both on screen`, p.found === true, JSON.stringify(p).slice(0, 200));
  if (!p.found) return;
  // ANTI-VACUOUS: an empty or one-word hint would pass the width rows for the
  // wrong reason. The sentence has to actually be the long one.
  check(`1${tag}`, `${tag}: the hint is the full sentence, not a stub`, p.text.length >= 23, `"${p.text}" (${p.text.length} chars)`);
  check(`2${tag}`, `${tag}: the hint is not cut off (scrollW <= clientW + 1)`, p.over <= 1,
    `want ${p.scrollW}px, has ${p.clientW}px, over by ${p.over}px @ ${p.fontSize}`);
  check(`3${tag}`, `${tag}: the hint has its own line below the count`, p.hintTop >= p.countBottom,
    `hint.top=${p.hintTop} count.bottom=${p.countBottom} hint.left=${p.hintLeft} count.left=${p.countLeft}`);
  if (expectSizeCtl) {
    check(`4${tag}`, `${tag}: the size control still sits flush right on row 1`,
      p.sizeCtlRight !== null && Math.abs(p.barRight - p.sizeCtlRight) <= 12,
      `bar.right=${p.barRight} sizeCtl.right=${p.sizeCtlRight}`);
  }
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // --- classic (S1): no size control (one thumb size), 3-char hex badge.
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = null;
    for (let i = 0; i < 40; i++) {
      proj = await c.json('window.__dbg.projStatus()');
      if (proj.zones > 0) break;
      await sleep(400);
    }
    check('setup-c', 'the classic project is open', proj.zones > 0, JSON.stringify(proj));
    await sleep(3000);
    assertHint('c', await c.json(PROBE), false);
    await shot(c, 'classic-layout');

    // --- aeon: the worse case — a chunk NAME badge (maxWidth 120) AND the S/M/L
    // control competing for the same row the hint used to share.
    //
    // A CLEAN SESSION FIRST. One window holds one project, and opening aeon on
    // top of the classic session left classic's workspace on screen: the first
    // run of this harness reported four green aeon rows that were measuring
    // classic's hint a second time. The engine is now re-derived from the text
    // itself (row 5t) so that cannot pass silently again.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch((e) => console.log('        aeon open threw:', e.message));
    let ast = null;
    for (let i = 0; i < 40; i++) {
      ast = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (ast && ast.open) break;
      await sleep(400);
    }
    check('setup-t', 'the aeon project is open', !!(ast && ast.open), JSON.stringify(ast));
    await sleep(3000);
    // Aeon's Chunks panel is GATED on the stamp tool (layout-facet.tsx:33) —
    // unlike classic, which mounts its picker unconditionally because the picker
    // is the way INTO stamping there. Arm the tool, or there is nothing to
    // measure and row 0t reports "not found" rather than a clean bill.
    const armed = await c.evalExpr(`(() => { const b = [...document.querySelectorAll('button')]
      .find((e) => /Stamp Chunk/i.test(e.title || '') || /Stamp Chunk/i.test(e.getAttribute('aria-label') || ''));
      if (!b) return false; b.click(); return true; })()`);
    check('setup-t2', 'the aeon stamp tool is armed, so the Chunks panel is mounted', armed === true, `armed=${armed}`);
    await sleep(1500);
    if (ast && ast.open) {
      const p = await c.json(PROBE);
      // ANTI-VACUOUS, and the reason this row exists: the aeon hint is the ONLY
      // proof the aeon workspace is what is on screen. Classic's strings start
      // "Click to"; aeon's start "Click map" / "Click a chunk".
      check('5t', 't: the hint on screen is aeon\'s, not classic\'s',
        p.found === true && /^Click (map|a chunk)/.test(p.text), `"${p.found ? p.text : '(not found)'}"`);
      assertHint('t', p, true);
      await shot(c, 'aeon-layout');

      // THE WORST CASE, and the one that broke the "just shorten the copy"
      // framing: with a chunk selected, aeon's badge becomes the chunk NAME
      // (maxWidth 120) and the hint grows to the two-clause sentence, all while
      // the S/M/L control still holds the row's right end. On the old shared
      // row this is the state whose leftover could collapse toward zero.
      const picked = await c.evalExpr(`(() => { const cells = [...document.querySelectorAll('[title]')]
        .filter((e) => /chunk/i.test(e.getAttribute('title') || ''));
        if (!cells.length) return false; cells[cells.length - 1].click(); return true; })()`);
      check('6t', 't: a chunk is selected, so the badge is a name and the hint is the long one', picked === true, `picked=${picked}`);
      await sleep(1200);
      const sel = await c.json(PROBE);
      check('7t', 't: the selected-state hint is the two-clause sentence',
        sel.found === true && /^Click map to stamp/.test(sel.text), `"${sel.found ? sel.text : '(not found)'}"`);
      assertHint('s', sel, true);
      await shot(c, 'aeon-selected');
    }
  } finally {
    if (c) {
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* */ }
      await sleep(2500);
      try { c.close(); } catch { /* */ }
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    try { execSync(`pkill -f 'aurora/dist/main/inde[x].mjs' 2>/dev/null; true`, { shell: '/bin/bash' }); } catch { /* */ }
    await sleep(1000);
    console.log(`\nport free after teardown: ${await portFree()}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
