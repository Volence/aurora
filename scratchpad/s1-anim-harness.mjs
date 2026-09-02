#!/usr/bin/env node
// DO S1 OBJECT ANIMATIONS ACTUALLY LOAD AND PLAY? (S1 anim Parcel 1)
//
// Modeled on classic-playtest-harness.mjs: a real `VITE_AURORA_DEBUG=1 npm run
// build` app under xvfb+CDP opening the REAL s1disasm as a project. Everything
// is read back through window.__dbg (store state) or the live DOM — never from
// a loader's return value. No emulator: nothing here needs a running machine.
//
// Rows:
//   1  the app boots, opens s1disasm as a classic project, GHZ1 activates
//   2  "Edit art" on Crabmeat ($1F) checks out its sprite-doc AND the timeline
//      holds all 8 animations of _anim/Crabmeat.asm with HAND-TRANSCRIBED
//      names/step-counts/durations — including the flip channel
//      (.standsloperev = frame 2 + xFlip, the byte the old parsers read as
//      frame 34 and dropped); the first anim is pre-loaded into the timeline
//   3  the loaded steps PLAY: select "walk" (3 steps) in the real picker, click
//      the real Play button — it flips to pause, every step has a nonzero
//      duration, and the live-step highlight visits ≥2 distinct cells
//   4  ANTI-VACUOUS control: an art-linked object with NO anim script AND no
//      SynchroAnimate channel (GHZ Bridge $11) opens with an EMPTY timeline
//      and NO anim picker — the empty-but-honest state, proving rows 2 and 5
//      didn't pass by accident
//   5  SYNCED animations (S1 sync Parcel): Ring ($25) offers BOTH the
//      transcribed SynchroAnimate spin (frames 0-3 at the true 8-frame period,
//      labeled synced in the picker) AND the scripted sparkle — the spin
//      pre-loads as the at-rest look
//   6  the synced spin PLAYS through the real UI: Play engages, and the live
//      step highlight cycles ≥3 of the 4 spin cells at the 8-tick hold
//
// A STALE dist/ MAKES EVERY ROW VACUOUS (guard copied from
// classic-playtest-harness.mjs, which once passed 19/19 against a planted
// defect because the bundle predated the plant): refuse to run when any source
// file is newer than the built main bundle.
//
// Usage: node scratchpad/s1-anim-harness.mjs   (VERBOSE=1 for app logs)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9384);
const ROOT = AURORA_DIR;   // this worktree
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = join(ROOT, 'scratchpad/shots-s1-anim');
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

// HAND-TRANSCRIBED from /home/volence/sonic_hacks/s1disasm/_anim/Crabmeat.asm —
// table order from the dc.w rows; per-anim duration is the script's first dc.b
// byte; step lists are the frame bytes with $20 decoded as xFlip. NEVER derived
// from the parser under test.
const CRABMEAT_EXPECT = [
  { name: 'stand', dur: 15, steps: [[0, false]] },
  { name: 'standslope', dur: 15, steps: [[2, false]] },
  { name: 'standsloperev', dur: 15, steps: [[2, true]] }, // dc.b 2|aniXFlip
  { name: 'walk', dur: 15, steps: [[1, false], [1, true], [0, false]] }, // dc.b 1, 1|aniXFlip, 0
  { name: 'walkslope', dur: 15, steps: [[1, true], [3, false], [2, false]] },
  { name: 'walksloperev', dur: 15, steps: [[1, false], [3, true], [2, true]] },
  { name: 'firing', dur: 15, steps: [[4, false]] },
  { name: 'ball', dur: 1, steps: [[5, false], [6, false]] },
];

async function main() {
  // --- Stale-dist guard (see header) ---------------------------------------
  const distM = statSync(MAIN).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }
  if (!existsSync(join(S1DIR, '_anim'))) throw new Error(`${S1DIR}/_anim missing — nothing to test`);

  let app = null, c = null;
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN], {
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

    // --- Row 1: open s1disasm, activate GHZ1 --------------------------------
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await c.evalExpr('window.__dbg.openAct("ghz", 1)');
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(1500);
    const lvl = await c.json('window.__dbg.levelState()');
    check('1', 'the app opened s1disasm and GHZ1 is the active classic level',
      lvl.status === 'ready' && lvl.zone === 'ghz' && lvl.act === 1, JSON.stringify(lvl));

    // --- Row 2: Crabmeat's animations arrive with its art -------------------
    const opened = await c.evalExpr('window.__dbg.editObjectArt(0x1f)');
    await sleep(1200);
    const st = await c.json('window.__dbg.spriteState()');
    await shot(c, 'crabmeat-doc');

    const namesOk = st.anims.length === 8 && st.anims.every((a, i) => a.name === CRABMEAT_EXPECT[i].name);
    const stepsOk = namesOk && st.anims.every((a, i) => {
      const e = CRABMEAT_EXPECT[i];
      return a.steps.length === e.steps.length && a.steps.every((s, j) =>
        s.frameIndex === e.steps[j][0] && s.duration === e.dur &&
        !!s.xFlip === e.steps[j][1] && !s.yFlip);
    });
    const firstLoaded = st.steps.length === 1 && st.steps[0].frameIndex === 0 && st.steps[0].duration === 15;
    check('2', 'Crabmeat checkout: sprite-doc checked out; all 8 anims match the hand transcription (flips incl.); first anim pre-loaded',
      opened === true && st.activeDocId === 'doc:sprite:s1:31' && st.frames === 7 && stepsOk && firstLoaded && !st.unsavedEdits,
      `opened=${opened} doc=${st.activeDocId} frames=${st.frames} anims=${st.anims.map((a) => `${a.name}(${a.steps.length})`).join(',')} steps0=${JSON.stringify(st.steps[0] ?? null)} unsaved=${st.unsavedEdits}`);

    // --- Row 3: it PLAYS — through the real picker + Play button ------------
    // Select "walk" (3 steps) in the anim picker (the select whose options are
    // the anim names), with the native-setter trick so React sees the change.
    const picked = await c.evalExpr(`(() => {
      const sels = [...document.querySelectorAll('select')];
      const sel = sels.find((s) => [...s.options].some((o) => o.text.startsWith('walk (')));
      if (!sel) return 'no picker';
      const idx = [...sel.options].findIndex((o) => o.text.startsWith('walk ('));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, String(idx));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()`);
    await sleep(300);
    const walkSteps = (await c.json('window.__dbg.spriteState()')).steps;
    const playClicked = await c.evalExpr(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Play'));
      if (!btn) return 'no play button';
      btn.click(); return 'ok';
    })()`);
    // Sample the live-step highlight (the cell styled with the live box-shadow,
    // inside the steps strip that ends in the "+ Frame N" button) over ~1.6s:
    // walk holds each step (15+1)/60 s ≈ 0.27s, so ≥2 distinct cells must light.
    const seen = new Set();
    for (let i = 0; i < 16; i++) {
      const live = await c.evalExpr(`(() => {
        // The TIMELINE's add-step button is "+ Frame <n>"; the frames strip has
        // a bare "+ Frame" button — match the numbered one.
        const add = [...document.querySelectorAll('button')].find((b) => /^\\+ Frame \\d+$/.test(b.textContent.trim()));
        if (!add) return -2;
        const cells = [...add.parentElement.children].filter((el) => el.tagName === 'DIV');
        return cells.findIndex((el) => el.style.boxShadow);
      })()`);
      if (live >= 0) seen.add(live);
      await sleep(100);
    }
    const paused = await c.evalExpr(
      `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Pause'))`);
    await shot(c, 'crabmeat-playing');
    check('3', 'walk plays in the shipped timeline: picker works, Play engages, nonzero durations, live step advances',
      picked === 'ok' && playClicked === 'ok' && paused === true &&
      walkSteps.length === 3 && walkSteps.every((s) => s.duration > 0) &&
      walkSteps[1].xFlip === true && seen.size >= 2,
      `picked=${picked} play=${playClicked} paused=${paused} walkSteps=${JSON.stringify(walkSteps)} liveCells=${[...seen].join(',')}`);

    // --- Row 4: anti-vacuous — a no-anim object is empty-but-honest ---------
    const opened2 = await c.evalExpr('window.__dbg.editObjectArt(0x11)'); // GHZ Bridge: art link, NO anim script
    await sleep(1200);
    const st2 = await c.json('window.__dbg.spriteState()');
    const pickerGone = await c.evalExpr(`(() => {
      const sels = [...document.querySelectorAll('select')];
      return !sels.some((s) => [...s.options].some((o) => /\\(\\d+f\\)$/.test(o.text)));
    })()`);
    await shot(c, 'bridge-empty');
    check('4', 'GHZ Bridge (no anim script, no sync channel): empty timeline, no picker, no synced entry — rows 2 and 5 were earned',
      opened2 === true && st2.activeDocId === 'doc:sprite:s1:17' && st2.anims.length === 0 && st2.steps.length === 0 && pickerGone === true,
      `opened=${opened2} doc=${st2.activeDocId} anims=${st2.anims.length} steps=${st2.steps.length} pickerGone=${pickerGone}`);

    // --- Row 5: Ring — synced spin AND scripted sparkle ---------------------
    // Expectations hand-derived, never from the code under test:
    //   spin: SynchroAnimate Sync2 (s1disasm sonic.asm:3147-3152) steps every
    //     8 frames (`#8-1` reset) through frames 0-3 (`andi #3`), consumed by
    //     Ring_Animate (_incObj/25, 37 Rings.asm:134). AnimStepUI stores the
    //     raw byte, timeline holds duration+1 → duration 7 plays the true 8.
    //   sparkle: _anim/Rings.asm — dc.b 5 / 4,5,6,7 / afRoutine.
    //   Ring art (REV00 map, 8 frames) → doc:sprite:s1:37 with 8 frames.
    const opened3 = await c.evalExpr('window.__dbg.editObjectArt(0x25)');
    await sleep(1200);
    const st3 = await c.json('window.__dbg.spriteState()');
    await shot(c, 'ring-doc');
    const spinOk = st3.anims.length === 2
      && st3.anims[0].name === 'spin' && st3.anims[0].synced === true
      && st3.anims[0].steps.length === 4
      && st3.anims[0].steps.every((s, i) => s.frameIndex === i && s.duration === 7 && !s.xFlip && !s.yFlip)
      && st3.anims[1].name === 'sparkle' && !st3.anims[1].synced
      && st3.anims[1].steps.every((s, i) => s.frameIndex === i + 4 && s.duration === 5);
    const spinPreloaded = st3.steps.length === 4 && st3.steps.every((s, i) => s.frameIndex === i && s.duration === 7);
    // The picker must SAY it's synced — the real option label, not store state.
    const pickerLabels = await c.evalExpr(`(() => {
      const sels = [...document.querySelectorAll('select')];
      const sel = sels.find((s) => [...s.options].some((o) => /\\(\\d+f/.test(o.text)));
      return sel ? [...sel.options].map((o) => o.text.trim()).join(' | ') : 'no picker';
    })()`);
    check('5', 'Ring: picker offers synced spin (labeled) AND scripted sparkle; spin pre-loads',
      opened3 === true && st3.activeDocId === 'doc:sprite:s1:37' && st3.frames === 8 && spinOk && spinPreloaded
      && pickerLabels === 'spin (4f, synced) | sparkle (4f)',
      `opened=${opened3} doc=${st3.activeDocId} frames=${st3.frames} anims=${st3.anims.map((a) => `${a.name}(${a.steps.length}${a.synced ? ',sync' : ''})`).join(',')} labels="${pickerLabels}" steps0=${JSON.stringify(st3.steps[0] ?? null)}`);

    // --- Row 6: the spin PLAYS through the real UI --------------------------
    // Spin is already the loaded timeline (row 5) — just press Play and watch
    // the live-step highlight: 8 ticks ≈ 0.133s/step, so ~1.6s of sampling at
    // 100ms must catch ≥3 distinct cells of the 4.
    const playClicked2 = await c.evalExpr(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Play'));
      if (!btn) return 'no play button';
      btn.click(); return 'ok';
    })()`);
    const seen2 = new Set();
    for (let i = 0; i < 16; i++) {
      const live = await c.evalExpr(`(() => {
        const add = [...document.querySelectorAll('button')].find((b) => /^\\+ Frame \\d+$/.test(b.textContent.trim()));
        if (!add) return -2;
        const cells = [...add.parentElement.children].filter((el) => el.tagName === 'DIV');
        return cells.findIndex((el) => el.style.boxShadow);
      })()`);
      if (live >= 0) seen2.add(live);
      await sleep(100);
    }
    const paused2 = await c.evalExpr(
      `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Pause'))`);
    await shot(c, 'ring-spinning');
    check('6', 'the synced spin plays: Play engages and the live step cycles the real spin frames',
      playClicked2 === 'ok' && paused2 === true && seen2.size >= 3 && [...seen2].every((i) => i >= 0 && i <= 3),
      `play=${playClicked2} paused=${paused2} liveCells=${[...seen2].sort().join(',')}`);
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* gone */ } }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
