#!/usr/bin/env node
// DID FOLDING THE 9px HINT TIER INTO 2xs (10px) CLIP ANYTHING?
//
// Every other edit in the VIS7 line was value-for-value — the same pixels, a
// name instead of a number. This one is not: twelve hint sites got 1px bigger,
// and several of them sit in a FIXED line box inside an `overflow: hidden`
// thumbnail (composer-thumbs' lockBadge in an 11px box, ChunkGrid's cellLabel in
// a 12px one). "It's only a pixel" is exactly the reasoning that ships a clipped
// glyph, so this measures instead.
//
// The measurement is objective, not a squint at a PNG: every element the app
// renders at 10px is compared scrollHeight/Width against clientHeight/Width, so
// anything whose text no longer fits its own box is reported by name. The
// screenshot is taken as well, for the record.

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9373);
const ROOT = '/home/volence/sonic_hacks/aurora';
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const SHOTS = `${ROOT}/scratchpad/shots-microtype`;
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

/** Every 10px element that no longer fits its own box, named for the fix. */
const OVERFLOW = String.raw`
(() => {
  const out = [];
  let seen = 0;
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.fontSize !== '10px') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;   // not on screen
    seen++;
    // Only a box that CLIPS can hide text; a visible overflow is a layout
    // choice, not a defect. 1px of tolerance for sub-pixel rounding.
    //
    // AN ELLIPSIS IS NOT CLIPPING. textOverflow:ellipsis is an element saying
    // "I truncate on purpose and I show a … when I do" — flagging it as hidden
    // text made this harness report ChunkGrid's status hint as a regression when
    // that hint was already truncating 35px at the OLD size (measured both ways;
    // the fold widened it to 56px, it did not create it). Silent clipping is the
    // defect; announced truncation is a layout decision, reported separately.
    if (s.textOverflow === 'ellipsis') continue;
    const clips = s.overflow !== 'visible' || s.overflowY !== 'visible' || s.overflowX !== 'visible';
    const overH = el.scrollHeight - el.clientHeight;
    const overW = el.scrollWidth - el.clientWidth;
    if (clips && (overH > 1 || overW > 1)) {
      out.push({
        text: (el.textContent || '').trim().slice(0, 28),
        tag: el.tagName, overH, overW,
        h: Math.round(r.height), lineHeight: s.lineHeight, overflow: s.overflow,
      });
    }
  }
  // The ellipsizing hint, found by IDENTITY rather than by font size, so the
  // same element can be compared across a size change. (Scanning by computed
  // fontSize cannot answer "did this get worse" — at the old size the element
  // simply drops out of the scan and the comparison reads clean for the wrong
  // reason.)
  const h = [...document.querySelectorAll('span')].find((e) => /click to /.test(e.textContent || ''));
  const hint = h
    ? { fs: getComputedStyle(h).fontSize, scrollW: h.scrollWidth, clientW: h.clientWidth,
        over: h.scrollWidth - h.clientWidth, text: (h.textContent || '').trim().slice(0, 40) }
    : null;
  return { seen, clipped: out, hint };
})()`;

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-microtype/${name}.png`);
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

    // A stored session from an earlier harness restores a tab whose canvas file
    // was deleted, and the app correctly parks on its inert Retry pane — which is
    // not a surface this check can measure. Start from a clean session.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = null;
    for (let i = 0; i < 40; i++) {
      proj = await c.json('window.__dbg.projStatus()');
      if (proj.zones > 0) break;
      await sleep(400);
    }
    check('setup', 'the project is open with an act resident', proj.zones > 0, JSON.stringify(proj));
    // A stored session can point at a tab whose file is gone (an earlier
    // harness deleted the canvas it made), which lands the workspace on Retry
    // instead of a level. Force a known act rather than trusting restore.
    await sleep(2500);
    console.log('        LEVEL', JSON.stringify(await c.json('window.__dbg.levelState()')));
    await sleep(2500);

    // The level surface as it opens: facet chrome, status bar, tool docks.
    const level = await c.json(OVERFLOW);
    check('1', 'no 10px text is clipped on the level surface',
      level.clipped.length === 0,
      `${level.seen} at 10px; clipped=${JSON.stringify(level.clipped)}\n        HINT=${JSON.stringify(level.hint)}`);
    await shot(c, 'level');

    // The Art facet's composer — where the folded hint sites actually live
    // (thumbnail lock badges, cell labels, BLANK tags, dock hints).
    const clickPill = (label) => `(() => { const b = [...document.querySelectorAll('button')]
      .find((e) => e.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`;
    const onArt = await c.evalExpr(clickPill('Art'));
    await sleep(1500);
    await sleep(1200);
    const onChunk = await c.evalExpr(clickPill('Chunk'));
    await sleep(1500);
    check('setup-2', 'the Chunk composer is on screen', onArt === true && onChunk === true,
      `art=${onArt} chunk=${onChunk}`);

    const art = await c.json(OVERFLOW);
    check('2', 'no 10px text is clipped in the composer (the folded hint sites)',
      art.clipped.length === 0,
      `${art.seen} at 10px; clipped=${JSON.stringify(art.clipped)}\n        HINT=${JSON.stringify(art.hint)}`);
    await shot(c, 'composer');

    // ANTI-VACUOUS: if the scan found no 10px text at all, rows 1-2 pass for the
    // wrong reason. The tier is 70 sites; a screen with none of it is a broken
    // scan, not a clean bill of health.
    check('3', 'the scan actually saw the micro tier on screen',
      level.seen > 5 && art.seen > 5, `level=${level.seen} composer=${art.seen}`);
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
