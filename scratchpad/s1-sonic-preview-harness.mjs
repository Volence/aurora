#!/usr/bin/env node
// S1 SONIC ANIMATION PREVIEW (sonani parcel) — the real app under CDP. Sibling
// of s1-nonlevel-families-harness.mjs (same scaffold: VITE_AURORA_DEBUG=1
// build under xvfb+CDP, real s1disasm, everything read back through
// window.__dbg / DOM — no screenshots as assertions).
//
//   1  boot, open s1disasm, GHZ1 ready
//   2  SONIC OPENS: __dbg.editObjectArt(0x01) → doc:sprite:s1:1, 88 DPLC
//      frames
//   3  TIMELINE: the picker lists EVERY sonani-table anim — count derived by
//      this harness from the real `_anim/Sonic.asm`'s own sonani rows (31
//      today, never a hardcoded constant) — and exactly the five special
//      scripts are dynamic with their modes (walkrun ×2, roll ×2, push)
//   4  WALK IS DYNAMIC: the auto-selected first anim (Walk) activates the
//      interpreter preview — sonicPreview() active with mode walkrun, the
//      picker option text says "(dynamic walk/run)", and the steps strip
//      carries the dynamic hint instead of fake steps
//   5  LIVE CLOCK: sample.tick advances between polls, and the displayed
//      frame is in the walk fan-out set DERIVED from the file (walk body
//      frames + d3(oct)) at the current scrub inputs
//   6  INERTIA CADENCE: scrubbing the REAL slider ($300 → $680) crosses the
//      $600 run boundary — variant flips to run and sample.hold equals the
//      study formula max(0,$800−|inertia|)>>8 at BOTH points (5 vs 1): the
//      cadence demonstrably changed with inertia
//   7  ANGLE FAN-OUT: angle detent $E0 (octant 2) at walk speed shifts the
//      displayed frames by +6 — the walk rotation set, derived from the file
//   8  REGULAR ANIM: picking a non-special anim deactivates the interpreter
//      (sonicPreview inactive) and loads ordinary playable steps
//
// A STALE dist/ MAKES EVERY ROW VACUOUS — same guard as the siblings: refuse
// to run when any source file is newer than the built main bundle.
//
// Usage: node scratchpad/s1-sonic-preview-harness.mjs   (VERBOSE=1 for app logs)

import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9401);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));   // this worktree
// Worktrees have no node_modules of their own — walk up (the same resolution
// npx uses) until the electron binary appears.
const ELECTRON = (() => {
  for (let d = ROOT; d !== dirname(d); d = dirname(d)) {
    const p = join(d, 'node_modules/.bin/electron');
    if (existsSync(p)) return p;
  }
  throw new Error('electron binary not found above ' + ROOT);
})();
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = join(ROOT, 'scratchpad/shots-s1-sonic-preview');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}

function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up */ }
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  return { ready, send, evalExpr, json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)), close: () => ws.close() };
}
async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}

// ---------------------------------------------------------------------------
// DERIVED expectations — read straight from the real _anim/Sonic.asm, the same
// way the vitest round-trip does (independent regex resolver, no parser code).
function sonicFileFacts() {
  const text = readFileSync(join(S1DIR, '_anim/Sonic.asm'), 'utf8');
  const lines = text.split(/\r?\n/).map((l) => l.replace(/;.*$/, ''));
  const equ = {};
  for (const l of lines) {
    const m = l.match(/^(\w+):\s*equ\s+(\$?[0-9A-Fa-f]+)\s*$/);
    if (m) equ[m[1]] = m[2].startsWith('$') ? parseInt(m[2].slice(1), 16) : parseInt(m[2], 10);
  }
  const rows = lines.map((l) => l.match(/^(id_\w+):\s*sonani\s+(\w+)/)).filter(Boolean);
  const body = (label) => {
    const start = lines.findIndex((l) => l.startsWith(`${label}:`));
    const out = [];
    for (let i = start; i < lines.length && start >= 0; i++) {
      if (i > start && /^\w+:/.test(lines[i])) break;
      const src = i === start ? lines[i].replace(`${label}:`, '') : lines[i];
      const m = src.trim().match(/^dc\.b\s+(.*)$/);
      if (!m) { if (src.trim() === 'even') break; continue; }
      for (const tok of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        if (/^\$[0-9A-Fa-f]+$/.test(tok)) out.push(parseInt(tok.slice(1), 16));
        else if (/^\d+$/.test(tok)) out.push(parseInt(tok, 10));
        else if (tok === 'afEnd') out.push(0xff);
        else if (tok in equ) out.push(equ[tok]);
        else throw new Error(`harness resolver: unknown token ${tok} in ${label}`);
      }
    }
    return out;
  };
  return {
    animCount: rows.length,
    walkFrames: body('SonAni_Walk').slice(1).filter((b) => b < 0x80),
    runFrames: body('SonAni_Run').slice(1).filter((b) => b < 0x80),
  };
}
// Study formulas (docs/reviews/2026-08-21-sonic-animate-live-study.md).
const holdWalkRun = (i) => Math.max(0, 0x800 - Math.abs(i)) >> 8;
const oct = (angle, xflip) => (((xflip ? angle : ~angle & 0xff) + 0x10) >> 4) & 6;
const d3walk = (o) => (o + (o >> 1)) * 2;

// Drive a REACT-controlled input/select: native value setter + the event React
// listens for (range inputs: 'input'; selects: 'change').
const setNativeValue = (selectorExpr, value, eventName, proto) => `(() => {
  const el = ${selectorExpr};
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event(${JSON.stringify(eventName)}, { bubbles: true }));
  return true;
})()`;
const INERTIA_SLIDER = `document.querySelector('label[title="sonic inertia"] input')`;
const ANGLE_SLIDER = `document.querySelector('label[title="sonic angle"] input')`;
// The anim picker: the select whose options mention "(dynamic".
const ANIM_PICKER = `[...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.text.includes('(dynamic')))`;

async function pollSample(c, pred, tries = 20, gapMs = 150) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await c.json('window.__dbg.sonicPreview()').catch(() => null);
    if (last && pred(last)) return last;
    await sleep(gapMs);
  }
  return last;
}

async function main() {
  // --- Stale-dist guard (see header) ---------------------------------------
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }
  if (!existsSync(join(S1DIR, '_anim/Sonic.asm'))) {
    throw new Error(`${S1DIR}/_anim/Sonic.asm missing — nothing to test`);
  }
  const facts = sonicFileFacts();

  let app = null, c = null;
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3500);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // --- Row 1: open s1disasm; GHZ1 auto-opens ------------------------------
    await c.evalExpr(`void window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = { zones: 0 };
    for (let i = 0; i < 30 && !(proj.zones > 0); i++) {
      await sleep(500);
      proj = await c.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
    }
    let lvl = { status: 'idle' };
    for (let i = 0; i < 30 && lvl.status !== 'ready'; i++) {
      await sleep(500);
      lvl = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
    }
    check('1', 'the app opened s1disasm and GHZ1 is ready',
      proj.zones > 0 && lvl.status === 'ready' && lvl.zone === 'ghz',
      `proj=${JSON.stringify(proj)} level=${JSON.stringify(lvl)}`);

    // --- Row 2: Sonic's doc opens with the 88 DPLC frames -------------------
    await c.evalExpr('window.__dbg.editObjectArt(0x01)');
    let s = null;
    for (let i = 0; i < 24; i++) {
      await sleep(500);
      s = await c.json('window.__dbg.spriteState()').catch(() => null);
      if (s && s.activeDocId === 'doc:sprite:s1:1' && s.anims.length > 0) break;
    }
    await shot(c, 'sonic-doc');
    check('2', 'Sonic opens: doc:sprite:s1:1 with 88 DPLC frames',
      s?.activeDocId === 'doc:sprite:s1:1' && s?.frames === 88,
      `doc=${s?.activeDocId} frames=${s?.frames}`);

    // --- Row 3: the whole sonani table is in the picker ---------------------
    const dynAnims = (s?.anims ?? []).filter((a) => a.dynamic);
    check('3', `timeline lists every table anim (${facts.animCount} from the file), five dynamic with modes`,
      s?.anims.length === facts.animCount
      && dynAnims.length === 5
      && JSON.stringify(dynAnims.map((a) => [a.name, a.dynamic]))
        === JSON.stringify([['Walk', 'walkrun'], ['Run', 'walkrun'], ['Roll', 'roll'], ['Roll2', 'roll'], ['Push', 'push']])
      && dynAnims.every((a) => a.steps.length === 0),
      `anims=${s?.anims.length} dyn=${JSON.stringify(dynAnims.map((a) => [a.name, a.dynamic, a.steps.length]))}`);

    // --- Row 4: Walk (auto-selected) shows the dynamic label ----------------
    const sp0 = await c.json('window.__dbg.sonicPreview()');
    const pickerText = await c.evalExpr(`(() => { const p = ${ANIM_PICKER}; return p ? p.options[p.selectedIndex].text : null; })()`);
    const hintText = await c.evalExpr(
      `[...document.querySelectorAll('div')].some((d) => d.childElementCount === 0 && d.textContent.includes('Dynamic walk/run script'))`);
    check('4', 'Walk is active as DYNAMIC: interpreter live, picker label "(dynamic walk/run)", steps strip shows the dynamic hint',
      sp0.active && sp0.mode === 'walkrun' && sp0.name === 'Walk'
      && pickerText === 'Walk (dynamic walk/run)' && hintText === true,
      `active=${sp0.active} mode=${sp0.mode} picker=${JSON.stringify(pickerText)} hint=${hintText}`);

    // --- Row 5: the editor clock drives it — tick advances, frames in-set ---
    const a1 = await pollSample(c, (p) => p.sample !== null);
    await sleep(400);
    const a2 = await c.json('window.__dbg.sonicPreview()');
    const walkSetHere = facts.walkFrames.map((f) => f + d3walk(oct(a2.angle, a2.xflip)));
    check('5', 'preview is LIVE on the editor clock and draws the walk fan-out set derived from the file',
      a1?.sample && a2?.sample && a2.sample.tick > a1.sample.tick
      && walkSetHere.includes(a2.sample.frame) && a2.sample.variant === 'walk',
      `tick ${a1?.sample?.tick}→${a2?.sample?.tick} frame=${a2?.sample?.frame} set=${JSON.stringify(walkSetHere)}`);

    // --- Row 6: scrubbing inertia through the REAL slider changes cadence ---
    const holdBefore = a2?.sample?.hold;
    const inertiaBefore = a2?.inertia;
    const scrubbed = await c.evalExpr(setNativeValue(INERTIA_SLIDER, 0x680, 'input', 'HTMLInputElement'));
    const b = await pollSample(c, (p) => p.sample?.variant === 'run');
    await shot(c, 'sonic-run-scrub');
    check('6', 'inertia scrub $300→$680 crosses the $600 boundary: variant run, hold = study formula at both points',
      scrubbed === true && b?.inertia === 0x680
      && holdBefore === holdWalkRun(inertiaBefore) && b?.sample?.hold === holdWalkRun(0x680)
      && b?.sample?.hold !== holdBefore && b?.sample?.variant === 'run'
      && facts.runFrames.includes(b?.sample?.frame),
      `scrubbed=${scrubbed} inertia=${inertiaBefore}→${b?.inertia} hold=${holdBefore}→${b?.sample?.hold} `
      + `(want ${holdWalkRun(inertiaBefore)}→${holdWalkRun(0x680)}) variant=${b?.sample?.variant} frame=${b?.sample?.frame}`);

    // --- Row 7: angle detent $E0 (octant 2) fans walk out by +6 -------------
    await c.evalExpr(setNativeValue(INERTIA_SLIDER, 0x300, 'input', 'HTMLInputElement'));
    const angleOk = await c.evalExpr(setNativeValue(ANGLE_SLIDER, 0xe0, 'input', 'HTMLInputElement'));
    const walkOct2 = facts.walkFrames.map((f) => f + d3walk(oct(0xe0, false)));
    const g = await pollSample(c, (p) => p.sample && p.angle === 0xe0 && p.sample.variant === 'walk'
      && walkOct2.includes(p.sample.frame));
    check('7', 'angle $E0 (octant 2) at walk speed draws the +6 rotation set derived from the file',
      angleOk === true && g?.angle === 0xe0 && g?.sample && walkOct2.includes(g.sample.frame)
      && oct(0xe0, false) === 2, // the derivation itself is the study's confirmed octant formula
      `angle=${g?.angle} frame=${g?.sample?.frame} set=${JSON.stringify(walkOct2)}`);

    // --- Row 8: a regular anim deactivates the interpreter ------------------
    // Pick the first NON-dynamic entry through the real picker.
    const regIdx = s.anims.findIndex((a) => !a.dynamic);
    await c.evalExpr(setNativeValue(ANIM_PICKER, regIdx, 'change', 'HTMLSelectElement'));
    await sleep(400);
    const spReg = await c.json('window.__dbg.sonicPreview()');
    const sReg = await c.json('window.__dbg.spriteState()');
    check('8', 'picking a regular anim deactivates the interpreter and loads ordinary steps',
      spReg.active === false && sReg.steps.length > 0
      && sReg.steps.length === s.anims[regIdx].steps.length,
      `active=${spReg.active} steps=${sReg.steps.length} anim=${s.anims[regIdx]?.name}`);
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* gone */ } }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
