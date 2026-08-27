// DOES THE "From tile" BOX SNAP WHILE YOU TYPE? (item 40's TAGGED wrinkle)
//
// Item 40 made this field enforce the floor it displays. The floor is NON-ZERO
// (the animated prefix), and the field is a controlled input clamped on every
// change — so the parcel itself flagged that typing "250" one key at a time may
// land on "19250" instead, because the box snaps to 192 after the first key.
//
// Node cannot see this. It is a keystroke on a controlled React input.
//
// ⚠ WHERE THIS PROBE STOPPED, AND THE WAY IN — recorded so the next attempt does
// not repeat the search. The "From tile" field is NOT reachable by expanding the
// "BG animation bands" disclosure: a real CDP click on that header (found at
// y=777, so the element is located correctly) does not open it, and scrolling
// every scrollable container to the bottom does not reveal the field either.
// Only the ten SCENE/LAYER number inputs are ever in the DOM.
//
// The field lives in the promote form, which renders only once a BAND CANDIDATE
// exists — and `__dbg.aeon` exposes `bandCandidate()` as a GETTER ONLY, with no
// setter. The way in is therefore to CREATE a candidate the way a user does: a
// drag on the blob strip. `scratchpad/bganim-strip-range-harness.mjs` already
// performs exactly that gesture and gets the panel into this state (its own
// screenshots show NEW BAND expanded with Cols/Rows/Driver). Start from that
// harness's section 6 rather than from this file's DOM search.
//
// Until then item 40's typing wrinkle is UNTESTED, which is not the same as absent.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url'; import { dirname } from 'node:path';
import * as http from 'node:http';
const PORT = Number(process.env.PORT ?? 9399);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const AEONDIR = '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-fromtile`; mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(p, t = 1500) { return new Promise((res, rej) => {
  const q = http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: t }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); });
  q.on('timeout', () => q.destroy(new Error('t'))); q.on('error', rej); }); }
async function portFree() { try { await getJSON('/json/version'); return false; } catch { return true; } }
async function waitTarget() { for (let i = 0; i < 90; i++) { try { const l = await getJSON('/json/list');
  const p = l.find(t => t.type === 'page' && t.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(500); }
  throw new Error('no CDP target'); }
function cdp(u) { const ws = new WebSocket(u); let n = 1; const pend = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const ready = new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = (meth, params = {}) => new Promise((res, rej) => { const id = n++;
    pend.set(id, m => m.error ? rej(new Error(`${meth}: ${JSON.stringify(m.error)}`)) : res(m.result));
    ws.send(JSON.stringify({ id, method: meth, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  return { ready, send, ev, json: async x => JSON.parse(await ev(`JSON.stringify(${x})`)), close: () => ws.close() }; }

if (!(await portFree())) throw new Error(`port ${PORT} busy`);
const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' }; delete env.DISPLAY;
const child = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
  { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let c;
try {
  c = cdp(await waitTarget()); await c.ready;
  await c.send('Runtime.enable'); await c.send('Page.enable').catch(() => {});
  for (let i = 0; i < 60; i++) { if (await c.ev('typeof window.__dbg === "object"').catch(() => false)) break; await sleep(300); }
  await c.ev('localStorage.clear()'); await c.send('Page.reload'); await sleep(4000);
  for (let i = 0; i < 60; i++) { if (await c.ev('typeof window.__dbg === "object"').catch(() => false)) break; await sleep(300); }
  await c.ev(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
  for (let i = 0; i < 40; i++) { const s = await c.json('window.__dbg.aeon.state()').catch(() => null); if (s && s.open) break; await sleep(400); }
  await sleep(2500);
  await c.ev(`(() => { const b=[...document.querySelectorAll('button')].find(e=>/^Effects$/.test((e.textContent||'').trim())); if(b)b.click(); return !!b; })()`);
  await sleep(2000);

  // Expand the bands section with a REAL click (synthetic .click() misses the handler).
  const hdr = await c.json(`(() => { const el=[...document.querySelectorAll('*')].filter(e=>/^BG animation bands/i.test((e.textContent||'').trim())).pop();
    if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; })()`);
  console.log(`  bands header: ${JSON.stringify(hdr)}`);
  if (hdr) { const x = Math.round(hdr.x + hdr.w/2), y = Math.round(hdr.y + hdr.h/2);
    await c.send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', clickCount:1 });
    await c.send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', clickCount:1 }); }
  await sleep(1500);
  // The band fields live below the fold of a scrolling dock. Scroll every
  // scrollable container to the bottom so they are laid out before enumerating —
  // an un-scrolled panel yields "no such input", which is indistinguishable from
  // the field not existing.
  const scrolled = await c.json(`(() => {
    const out = [];
    for (const e of document.querySelectorAll('*')) {
      if (e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 100) {
        e.scrollTop = e.scrollHeight; out.push({ h: e.clientHeight, s: e.scrollHeight });
      }
    }
    return out;
  })()`);
  console.log(`  scrolled ${scrolled.length} container(s) to the bottom`);
  await sleep(1200);

  // Find the "From tile" number input by its label text.
  // Enumerate EVERY number input with its bounds and its own title, and pick the
  // one whose title names the static base. Hunting a label string failed: the
  // field lives behind a second disclosure, and "no label found" is
  // indistinguishable from "no such field" (this probe reported exactly that).
  const inputs = await c.json(`(() => {
    return [...document.querySelectorAll('input[type=number]')].map(i => {
      const r = i.getBoundingClientRect();
      return { min: i.getAttribute('min'), max: i.getAttribute('max'), value: i.value,
               title: (i.getAttribute('title')||'').slice(0,90),
               x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
               visible: r.width > 0 && r.height > 0 };
    });
  })()`);
  console.log(`  number inputs on screen (${inputs.length}):`);
  for (const i of inputs) console.log(`     min=${i.min} max=${i.max} value=${i.value} vis=${i.visible} title=${JSON.stringify(i.title)}`);
  const cand = inputs.find(i => i.visible && /static base/i.test(i.title));
  const found = cand ? { found: true, ...cand } : { found: false, labels: [] };
  console.log(`From tile field: ${JSON.stringify(found)}`);
  if (!found.found) {
    console.log('BLOCKED: could not locate the From tile input — the wrinkle is UNTESTED, not absent.');
  } else {
    // Focus, select all, then type "250" one key at a time, reading the box after each.
    await c.send('Input.dispatchMouseEvent', { type:'mousePressed', x:found.x, y:found.y, button:'left', clickCount:3 });
    await c.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:found.x, y:found.y, button:'left', clickCount:3 });
    await sleep(300);
    const readVal = () => c.ev(`(() => { const i=document.activeElement; return i && i.tagName==='INPUT' ? i.value : 'NOT_FOCUSED'; })()`);
    console.log(`  after select-all, box = ${JSON.stringify(await readVal())}`);
    const trace = [];
    for (const ch of ['2','5','0']) {
      await c.send('Input.dispatchKeyEvent', { type:'keyDown', text:ch, key:ch, code:`Digit${ch}`, windowsVirtualKeyCode: ch.charCodeAt(0) });
      await c.send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, code:`Digit${ch}`, windowsVirtualKeyCode: ch.charCodeAt(0) });
      await sleep(400);
      const v = await readVal();
      trace.push({ typed: ch, box: v });
      console.log(`  typed ${ch} -> box = ${JSON.stringify(v)}`);
    }
    const final = trace[trace.length-1].box;
    console.log(`\n  TYPED "250"; the box ended at ${JSON.stringify(final)}`);
    console.log(`  VERDICT: ${final === '250' ? 'NO SNAP — the box holds what you typed.' : `SNAPS — a user typing 250 gets ${final}.`}`);
    writeFileSync(`${SHOTS}/trace.json`, JSON.stringify({ found, trace }, null, 2));
    const shot = await c.send('Page.captureScreenshot', { format:'png' });
    writeFileSync(`${SHOTS}/fromtile.png`, Buffer.from(shot.data, 'base64'));
  }
} finally { if (c) c.close(); try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
process.exit(0);
