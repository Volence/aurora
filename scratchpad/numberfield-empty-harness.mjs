#!/usr/bin/env node
// DOES AN EMPTIED NUMBER BOX STILL WRITE A 0? (the parcel's five TAGGED items)
//
// `NumberField` used to do `Number(e.target.value)`, and `Number('') === 0`, so
// select-all-and-delete committed a real 0 into whatever the box drove —
// v_center, v_offset, a band's static base. The fix gives the field a local text
// buffer and commits only finite numbers. Twelve call sites changed behaviour.
//
// None of that is visible to the node suite: it is a keystroke on a controlled
// React input. This drives the real app.
//
// ANTI-VACUOUS THROUGHOUT: "the value did not change" is exactly what a harness
// that never typed anything reports, so every row that asserts a NON-change is
// paired with one proving the instrument reached the box and that a REAL edit
// still lands.
import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url'; import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9401);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-numberfield`; mkdirSync(SHOTS, { recursive: true });
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

const results = []; const fails = [];
const check = (id, name, ok, detail) => { results.push({ id, ok }); if (!ok) fails.push(`${id} ${name} :: ${detail}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? `\n         ${detail}` : ''}`); };

if (!(await portFree())) throw new Error(`port ${PORT} busy`);
const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' }; delete env.DISPLAY;
const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
  { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let c;
try {
  c = cdp(await waitTarget()); await c.ready;
  await c.send('Runtime.enable'); await c.send('Page.enable').catch(() => {});
  const waitDbg = async () => { for (let i = 0; i < 60; i++) { if (await c.ev('typeof window.__dbg === "object"').catch(() => false)) return true; await sleep(300); } return false; };
  await waitDbg();
  await c.ev('localStorage.clear()'); await c.send('Page.reload'); await sleep(4000); await waitDbg();
  await c.ev(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
  let st = null;
  for (let i = 0; i < 40; i++) { st = await c.json('window.__dbg.aeon.state()').catch(() => null); if (st && st.open) break; await sleep(400); }
  check('0a', 'ANTI-VACUOUS: the aeon project is open with sections', !!(st && st.open && st.sections > 0), JSON.stringify(st));
  await sleep(2000);
  await c.ev(`(() => { const b=[...document.querySelectorAll('button')].find(e=>/^Effects$/.test((e.textContent||'').trim())); if(b)b.click(); return !!b; })()`);
  await sleep(2000);

  // SELECT A SCENE FIRST. Without this `selectedScene()` is null, every model
  // read is `undefined`, and the two "commits nothing" rows pass by comparing
  // undefined to undefined — green, and about nothing. The paired positive row
  // (3a) is what exposed it.
  const scenePick = await c.json(`(() => {
    const list = JSON.parse(window.__dbg.aeon.scenesJson());
    if (!list.length) return { ok:false, n:0 };
    window.__dbg.aeon.selectScene(list[0].id);
    return { ok:true, n:list.length, id:list[0].id };
  })()`);
  console.log(`  selected scene: ${JSON.stringify(scenePick)}`);
  await sleep(1200);
  check('0c', 'ANTI-VACUOUS: a scene is selected, so the model reads below are real',
    !!(scenePick && scenePick.ok), JSON.stringify(scenePick));

  const inputs = async () => c.json(`(() => [...document.querySelectorAll('input[type=number]')].map((i,ix) => {
    const r = i.getBoundingClientRect();
    return { ix, min:i.getAttribute('min'), max:i.getAttribute('max'), value:i.value,
             title:(i.getAttribute('title')||'').slice(0,60),
             x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), vis:r.width>0 };
  }))()`);
  const all = await inputs();
  const pick = (re) => all.find(i => i.vis && re.test(i.title));
  const vcenter = pick(/^v_center/), voffset = pick(/^v_offset/);
  check('0b', 'ANTI-VACUOUS: found the v_center and v_offset boxes on screen',
    !!(vcenter && voffset), JSON.stringify({ vcenter: vcenter?.title, voffset: voffset?.title }));
  if (!vcenter || !voffset) throw new Error('fields not on screen');

  // Model-side truth, read independently of the box.
  const sceneVals = async () => c.json(`(() => {
    const id = window.__dbg.aeon.selectedScene();
    const s = JSON.parse(window.__dbg.aeon.scenesJson()).find(x => x.id === id) || {};
    return { id, v_center: s.v_center, v_offset: s.v_offset };
  })()`);
  const before = await sceneVals();
  console.log(`  scene before: ${JSON.stringify(before)}`);
  check('0d', 'ANTI-VACUOUS: the scene actually carries the two fields we are about to test',
    typeof before.v_center === 'number' && typeof before.v_offset === 'number',
    JSON.stringify(before));

  const clickField = async (f, clicks = 3) => {
    await c.send('Input.dispatchMouseEvent', { type:'mousePressed', x:f.x, y:f.y, button:'left', clickCount:clicks });
    await c.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:f.x, y:f.y, button:'left', clickCount:clicks });
    await sleep(300);
  };
  const key = async (k, code, vk, text) => {
    await c.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key:k, code, windowsVirtualKeyCode:vk, ...(text ? { text } : {}) });
    await c.send('Input.dispatchKeyEvent', { type:'keyUp', key:k, code, windowsVirtualKeyCode:vk });
    await sleep(250);
  };
  const boxVal = () => c.ev(`(() => { const i=document.activeElement; return i && i.tagName==='INPUT' ? i.value : 'NOT_FOCUSED'; })()`);

  // ⚠ ORDER MATTERS, AND THE OBVIOUS ORDER IS VACUOUS.
  // The defect committed a literal 0 for an emptied box. Both these fields sit
  // at 0 on a fresh document — so "I cleared it and the value is still 0" is
  // EXACTLY what the bug produces, and a harness that clears first reports a
  // confident green against the unfixed app. So: put a NON-ZERO value in first,
  // then clear, and require the non-zero value to survive.

  // ---- 1. seed a real value (this is also the anti-vacuous positive) -----
  await clickField(vcenter);
  for (const d of ['1','2','8']) await key(d, `Digit${d}`, d.charCodeAt(0), d);
  await sleep(400);
  const seeded = await sceneVals();
  check('1a', 'ANTI-VACUOUS PAIR: a real typed value still commits',
    seeded.v_center === 128, `typed 128 -> v_center=${seeded.v_center} (was ${before.v_center})`);
  check('1b', 'the box keeps the author\'s own text while focused (no mid-typing snap to a floor)',
    (await boxVal()) === '128', JSON.stringify(await boxVal()));

  // ---- 2. NOW clear it — the discriminating row --------------------------
  await clickField(vcenter);
  await key('Delete', 'Delete', 46);
  const emptied = await boxVal();
  const afterDel = await sceneVals();
  check('2a', 'the box actually goes EMPTY when you clear it', emptied === '', JSON.stringify(emptied));
  check('2b', 'THE ROW THIS PARCEL EXISTS FOR: clearing a box holding 128 does NOT write a 0',
    afterDel.v_center === 128,
    `v_center=${afterDel.v_center} (128 = held, 0 = the defect this parcel fixed)`);

  // ---- 3. a lone "-" in v_offset, also seeded first ----------------------
  await clickField(voffset);
  for (const d of ['4','2']) await key(d, `Digit${d}`, d.charCodeAt(0), d);
  await sleep(400);
  const seededOff = await sceneVals();
  check('3a', 'ANTI-VACUOUS: v_offset really took a non-zero value first',
    seededOff.v_offset === 42, `v_offset=${seededOff.v_offset}`);
  await clickField(voffset);
  await key('-', 'Minus', 189, '-');
  const afterDash = await sceneVals();
  check('3b', 'a lone "-" over a box holding 42 commits nothing',
    afterDash.v_offset === 42, `v_offset=${afterDash.v_offset} box=${JSON.stringify(await boxVal())}`);

  // ---- 4. spinner arrows still move the value IMMEDIATELY ----------------
  // This is the behaviour commit-on-blur would have cost, and the stated reason
  // the parcel did not choose it — so it is worth checking rather than assuming.
  await clickField(vcenter);
  const beforeArrow = (await sceneVals()).v_center;
  await key('ArrowUp', 'ArrowUp', 38);
  await sleep(400);
  const afterArrow = (await sceneVals()).v_center;
  check('4a', 'the spinner arrow still moves the value immediately, without blurring',
    afterArrow !== beforeArrow, `${beforeArrow} -> ${afterArrow}`);

  const shot = await c.send('Page.captureScreenshot', { format:'png' });
  writeFileSync(`${SHOTS}/numberfield.png`, Buffer.from(shot.data, 'base64'));
  writeFileSync(`${SHOTS}/result.json`, JSON.stringify({ before, seeded, afterDel, seededOff, afterDash, results, fails }, null, 2));
  console.log(`\n  ${results.filter(r=>r.ok).length}/${results.length} rows passed`);
  if (fails.length) { console.log('  FAILING:'); for (const f of fails) console.log(`    ${f}`); }
} finally { if (c) c.close(); try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
process.exit(fails.length ? 1 : 0);
