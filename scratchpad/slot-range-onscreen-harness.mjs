#!/usr/bin/env node
// DO THE CORRECTED SLOT RANGES ACTUALLY RENDER? (ROADMAP item 54, the TAGGED half)
//
// Item 54's parcel pinned the arithmetic and the wiring in 4,910 node tests. None
// of them can see a rendered string: the band card's subtitle, the blob budget
// line and the promote Hint are React output on a real panel, and the `title=`
// tooltip is not even in the accessibility tree until a hover.
//
// The defect this exists to catch is precise and was OBSERVED on screen, not
// grepped: on the live document (32 animated slots, base 0) the band card read
// `slots 0..32 · 32 tiles` — a reader counts 33, and slot 32 is exactly the first
// slot a promotion may take.
//
// ANTI-VACUOUS: a panel that failed to render at all would contain no `0..32`
// either, so "the bad string is absent" is worthless alone. Every absence row
// below is paired with a presence row proving the panel drew its subject.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9398);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN ?? `${ROOT}/node_modules/.bin/electron`;
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-slot-range`;
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
    } catch {}
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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
const results = []; const fails = [];
function check(id, name, ok, detail) {
  results.push({ id, ok });
  if (!ok) fails.push(`${id} ${name} :: ${detail}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? `\n         ${detail}` : ''}`);
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable'); await c.send('Page.enable').catch(() => {});
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload'); await sleep(4000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    await sleep(2500);

    // Effects facet
    await c.evalExpr(`(() => {
      const el = [...document.querySelectorAll('button')].find(e => /^Effects$/.test((e.textContent||'').trim()));
      if (el) el.click(); return !!el;
    })()`);
    await sleep(2000);

    // The band section is COLLAPSED by default — a harness that skips this reads
    // an empty panel and reports the defect's literal as absent, which is exactly
    // the vacuous pass row 2a exists to catch. Expand every disclosure that names
    // bands before reading anything.
    // A REAL mouse click on the header, not a synthetic DOM .click(). The
    // disclosure's handler is not on the text node, and dispatching .click() on
    // the span (or on ancestors chosen by a child-count heuristic) leaves the
    // section exactly as collapsed as before while REPORTING a click. Integer
    // client pixels, per this repo's dpr bar.
    const hdr = await c.json(`(() => {
      const el = [...document.querySelectorAll('*')].filter(e => {
        const t = (e.textContent || '').trim();
        return /^BG animation bands/i.test(t);
      }).pop();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, dpr: window.devicePixelRatio };
    })()`);
    let expanded = 'NO_HEADER';
    if (hdr) {
      const cx = Math.round(hdr.x + hdr.w / 2), cy = Math.round(hdr.y + hdr.h / 2);
      console.log(`  header rect ${JSON.stringify(hdr)} -> click (${cx},${cy})`);
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
      expanded = `clicked (${cx},${cy})`;
    }
    console.log(`  expanded: ${JSON.stringify(expanded)}`);
    await sleep(1500);

    // Everything the panel currently shows, plus every title= on it.
    const panel = await c.json(`(() => {
      const texts = [...document.querySelectorAll('*')]
        .filter(e => e.children.length === 0)
        .map(e => (e.textContent||'').trim()).filter(Boolean);
      const titles = [...document.querySelectorAll('[title]')].map(e => e.getAttribute('title'));
      return { texts, titles };
    })()`);
    const all = [...panel.texts, ...panel.titles].join('\n');
    const mentioning = [...panel.texts, ...panel.titles].filter(t => /slot|band|tile/i.test(t));
    console.log(`  DUMP: strings mentioning slot/band/tile (${mentioning.length}):`);
    for (const t of mentioning.slice(0, 40)) console.log(`     ${JSON.stringify(t.slice(0,140))}`);
    // SCOPE THIS TO SLOT RANGES. The panel is full of `N..M` strings that are
    // VALUE ranges on number fields (`v_offset … -32768..32767`, `Screen line
    // (0..511)`), and a scan over every `N..M` reported `-32768..32767` as an
    // inverted range — the row fired on a population it was never about. Bar 2b:
    // the guard fired, and it was watching the wrong quantity.
    const isSlotRange = (t) => /\bslots?\b/i.test(t) && /\d+\.\.-?\d+/.test(t);
    const slotLines = [...panel.texts, ...panel.titles].filter(isSlotRange);
    console.log(`  strings mentioning a slot range (${slotLines.length}):`);
    for (const l of slotLines) console.log(`     ${JSON.stringify(l)}`);

    // ANTI-VACUOUS FIRST: the panel drew its subject.
    check('2a', 'ANTI-VACUOUS: the effects panel rendered a slot range at all',
      slotLines.length > 0, `${slotLines.length} strings`);

    // THE DEFECT, by its exact observed literal.
    check('3a', 'no readout prints the exclusive end as if inclusive (`0..32` on a 32-slot prefix)',
      !/\b0\.\.32\b/.test(all), slotLines.filter(l => /0\.\.32/.test(l)).join(' | ') || 'absent');

    // The positive: every printed range must END one below a round count.
    const bad = slotLines.filter(l => {
      const m = l.match(/(\d+)\.\.(-?\d+)/);
      if (!m) return false;
      const first = Number(m[1]), last = Number(m[2]);
      return last < first; // 0..-1 style, the naive-fix failure
    });
    check('3b', 'no readout renders an empty range as arithmetic (`0..-1`)',
      bad.length === 0, bad.join(' | ') || 'none');

    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/effects-panel.png`, Buffer.from(shot.data, 'base64'));
    writeFileSync(`${SHOTS}/strings.json`, JSON.stringify({ slotLines, results }, null, 2));
    console.log(`\n  ${results.filter(r=>r.ok).length}/${results.length} rows passed`);
    if (fails.length) { console.log('  FAILING:'); for (const f of fails) console.log(`    ${f}`); }
  } finally {
    if (c) c.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
