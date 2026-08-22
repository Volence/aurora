#!/usr/bin/env node
// Sonic_Animate live study — closes the animation audit's standing TAGs:
//   (1) duration byte ⇒ N+1 tick hold, immediate advance after anim change
//   (2) walk/run inertia→duration formula: max(0, $800-|inertia|) >> 8
//   (3) walk/run rotation fan-out: obFrame += octant*6 (walk) / *4 (run)
//   (4) roll formula max(0, $400-|inertia|)>>8; push (>>6) if reachable
// Method: teacher-forced twin of Sonic_Animate (s1disasm _incObj/01 Sonic.asm:2176,
// FixBugs=0) stepped against per-frame reads of v_player, scripts read FROM ROM.
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as esbuild from 'esbuild';

const SERVER = '/home/volence/sonic_hacks/oracle-next/target/release/oracle-aether';
const ROM = '/home/volence/sonic_hacks/s1disasm/s1built.bin';
const LST = '/home/volence/sonic_hacks/s1disasm/sonic.lst';
const SOCK = '/run/user/1000/aur-sonanim.sock';
if (existsSync(SOCK)) rmSync(SOCK);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const workDir = mkdtempSync(join(tmpdir(), 'sonanim-'));
const out = join(workDir, 'client.mjs');
await esbuild.build({
  entryPoints: [join(process.cwd(), 'src/main/aether/client.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
const { AetherClient } = await import(out);

const emu = spawn(SERVER, [ROM], { env: { ...process.env, ORACLE_SOCKET: SOCK }, stdio: ['ignore', 'pipe', 'pipe'] });
let elog = '';
emu.stdout.on('data', (d) => (elog += d)); emu.stderr.on('data', (d) => (elog += d));
for (let i = 0; i < 50 && !elog.includes('listening on'); i++) await sleep(200);

const c = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK });
await c.connect();
await c.call('emulator/load_symbols', { path: LST });
const resolve = async (name) => {
  try { return await c.resolve(name); } catch { return null; }
};
const read = async (addr, len) => {
  const r = await c.call('emulator/read_memory', { addr: '0x' + addr.toString(16).toUpperCase(), len });
  return Buffer.from(r.bytes.replace(/^0x/i, ''), 'hex');
};

const vGamemode = await resolve('v_gamemode');
const vInvinc = await resolve('v_invinc');
let vPlayer = await resolve('v_player');
if (vPlayer == null) vPlayer = await resolve('v_objspace');
const aniSonic = await resolve('Ani_Sonic');
const lblWalk = await resolve('SonAni_Walk'), lblRun = await resolve('SonAni_Run');
const lblRoll = await resolve('SonAni_Roll'), lblRoll2 = await resolve('SonAni_Roll2'), lblPush = await resolve('SonAni_Push');
console.log('symbols: v_gamemode=0x' + vGamemode?.toString(16), 'v_player=0x' + vPlayer?.toString(16), 'Ani_Sonic=0x' + aniSonic?.toString(16));
if ([vGamemode, vPlayer, aniSonic].some((x) => x == null)) { console.log('FATAL: symbol resolution failed'); emu.kill(); process.exit(1); }

// ---- scripts straight from ROM ----
const blob = await read(aniSonic, 0x400);
const NANIMS = 31;
const tableOff = []; for (let i = 0; i < NANIMS; i++) tableOff.push(blob.readUInt16BE(i * 2));
if (!tableOff.every((o) => o >= NANIMS * 2 && o < 0x400)) { console.log('FATAL: Ani_Sonic offsets out of read window', tableOff); emu.kill(); process.exit(1); }
const scriptAt = (animId) => blob.subarray(tableOff[animId]);
// cross-check labels vs table entries 0..4
const lbls = [lblWalk, lblRun, lblRoll, lblRoll2, lblPush];
const lblOk = lbls.every((l, i) => l == null || l === aniSonic + tableOff[i]);
console.log('label/table cross-check ($00..$04):', lblOk ? 'OK' : 'MISMATCH ' + lbls.map((l, i) => `${l?.toString(16)}!=${(aniSonic + tableOff[i]).toString(16)}`).join(' '));

// ---- boot to gameplay ----
const gm = async () => (await read(vGamemode, 1))[0];
let t0 = Date.now();
while ((await gm()) !== 4) { await c.call('emulator/run_frames', { frames: 60 }); if (Date.now() - t0 > 60000) { console.log('FATAL: no title'); emu.kill(); process.exit(1); } }
// Start is only accepted once the title finishes its intro; a demo (gm=8) also
// bounces back to title on Start. Retry until the level (gm=$0C) actually loads.
t0 = Date.now();
for (;;) {
  const g = await gm();
  if (g === 0x0c) break;
  if (g === 4 || g === 8) await c.call('emulator/press', { buttons: ['start'], frames: 8 });
  await c.call('emulator/run_frames', { frames: 45 });
  if (Date.now() - t0 > 120000) { console.log('FATAL: no level, gm=' + (await gm())); emu.kill(); process.exit(1); }
}
await c.call('emulator/run_frames', { frames: 300 }); // past title card fade-in
// control check: hold right, expect inertia to move
await c.call('emulator/hold', { buttons: ['right'], down: true });
await c.call('emulator/run_frames', { frames: 30 });
let pv = await read(vPlayer, 0x40);
if (pv.readInt16BE(0x14) <= 0) { console.log('FATAL: no control (inertia=' + pv.readInt16BE(0x14) + ')'); emu.kill(); process.exit(1); }
await c.call('emulator/hold', { buttons: ['right'], down: false });
await c.call('emulator/run_frames', { frames: 180 }); // settle back to idle/wait

// ---- sampling ----
const S = (b) => ({
  render: b[0x01], inertia: b.readInt16BE(0x14), frame: b[0x1a], aniFrame: b[0x1b],
  anim: b[0x1c], prevAni: b[0x1d], timeFrame: b[0x1e], status: b[0x22], angle: b[0x26],
});
const samples = [];
const tick = async (phase) => {
  // keep Sonic invincible so blind badnik contact can't kill the run (deaths
  // zeroed two earlier captures); v_invinc is the flag Sonic_Hurt checks
  if (vInvinc != null) await c.call('emulator/write_memory', { addr: '0x' + vInvinc.toString(16).toUpperCase(), bytes: '0x01' });
  await c.call('emulator/run_frames', { frames: 1 });
  samples.push({ phase, ...S(await read(vPlayer, 0x40)) });
};
for (let i = 0; i < 100; i++) await tick('idle');
await c.call('emulator/hold', { buttons: ['right'], down: true });
for (let i = 0; i < 260; i++) await tick('walk');
for (let i = 0; i < 60; i++) await tick('run');
await c.call('emulator/hold', { buttons: ['right', 'c'], down: true });
for (let i = 0; i < 8; i++) await tick('run');
await c.call('emulator/hold', { buttons: ['c'], down: false });
for (let i = 0; i < 632; i++) await tick('run');
await c.call('emulator/hold', { buttons: ['right', 'c'], down: true });
for (let i = 0; i < 10; i++) await tick('jump');
await c.call('emulator/hold', { buttons: ['c'], down: false });
for (let i = 0; i < 120; i++) await tick('jump');
await c.call('emulator/hold', { buttons: ['right'], down: false });
emu.kill('SIGTERM');

// ---- the twin (teacher-forced) ----
const loadframe = (script, st) => {
  let d1 = st.aniFrame, d0 = script[1 + d1];
  if (d0 < 0x80) { st.frame = d0; st.aniFrame = (d1 + 1) & 0xff; return; }
  if (d0 === 0xff) { st.aniFrame = 0; st.frame = script[1]; st.aniFrame = 1; return; }
  if (d0 === 0xfe) {
    const back = script[2 + d1];
    st.aniFrame = (st.aniFrame - back) & 0xff; d1 = (d1 - back) & 0xff;
    st.frame = script[1 + d1]; st.aniFrame = (st.aniFrame + 1) & 0xff; return;
  }
  if (d0 === 0xfd) { st.animChange = script[2 + d1]; return; } // frame/aniFrame untouched
};
// returns predicted {frame,aniFrame,timeFrame,renderLow} + event tags
const twin = (prev, cur) => {
  const st = { frame: prev.frame, aniFrame: prev.aniFrame, timeFrame: prev.timeFrame, renderLow: prev.render & 3, ev: [] };
  const procAnim = cur.prevAni;                 // Animate syncs prevAni:=anim before processing
  if (procAnim !== prev.prevAni) { st.aniFrame = 0; st.timeFrame = 0; st.ev.push('animchange'); }
  const script = scriptAt(procAnim);
  const dur = script[0];
  const spd = Math.abs(cur.inertia);
  if (dur < 0x80) {                             // regular script
    st.renderLow = cur.status & 1;
    const tf = (st.timeFrame - 1) & 0xff;
    if ((tf & 0x80) === 0) { st.timeFrame = tf; return st; }
    st.timeFrame = dur; st.ev.push('reload:regular:' + dur);
    loadframe(script, st); return st;
  }
  // specials: shared decrement first
  const tf = (st.timeFrame - 1) & 0xff;
  if ((tf & 0x80) === 0) { st.timeFrame = tf; return st; }
  if (dur === 0xff) {                           // walk/run (or push via status bit 5)
    let d1f = 0, d0 = cur.angle;
    const xf = cur.status & 1;
    if (xf === 0) d0 = ~d0 & 0xff;
    d0 = (d0 + 0x10) & 0xff;
    if (d0 & 0x80) d1f = 3;
    st.renderLow = xf ^ d1f;
    if (cur.status & 0x20) return push(st, spd, cur);
    const oct = (d0 >> 4) & 6;
    let d3, script2;
    if (spd >= 0x600) { script2 = scriptAt(1); d3 = oct * 2; st.ev.push('reload:run:oct' + oct); }
    else { script2 = scriptAt(0); d3 = (oct + (oct >> 1)) * 2; st.ev.push('reload:walk:oct' + oct); }
    let d2 = 0x800 - spd; if (d2 < 0) d2 = 0;
    st.timeFrame = (d2 >> 8) & 0xff; st.dur = st.timeFrame;
    loadframe(script2, st);
    st.frame = (st.frame + d3) & 0xff;
    return st;
  }
  if (dur === 0xfe) {                           // roll
    const script2 = spd >= 0x600 ? scriptAt(3) : scriptAt(2);
    let d2 = 0x400 - spd; if (d2 < 0) d2 = 0;
    st.timeFrame = (d2 >> 8) & 0xff; st.ev.push('reload:roll');
    st.renderLow = cur.status & 1;
    loadframe(script2, st); return st;
  }
  return push(st, spd, cur);                    // dur === 0xfd
};
const push = (st, spd, cur) => {
  let d2 = 0x800 - spd; if (d2 < 0) d2 = 0;
  st.timeFrame = (d2 >> 6) & 0xff; st.ev.push('reload:push');
  st.renderLow = cur.status & 1;
  loadframe(scriptAt(4), st); return st;
};

// ---- compare + coverage ----
// The emulator's frame boundary does not coincide with the game loop's object
// update: observed obTimeFrame decrements alternate 0 and 2 per stepped frame.
// So each observed transition must be explained by exactly 0, 1 or 2 twin steps
// (teacher-forced), and total steps must conserve (≈ number of ticks).
const fieldsOf = (x) => ({ frame: x.frame, aniFrame: x.aniFrame, timeFrame: x.timeFrame, renderLow: x.render & 3 });
const eq = (a, b) => a.frame === b.frame && a.aniFrame === b.aniFrame && a.timeFrame === b.timeFrame && a.renderLow === b.renderLow;
let unexplained = 0, totalSteps = 0; const shown = [];
const stepCounts = { 0: 0, 1: 0, 2: 0 };
const cov = { regular: 0, walkDur: new Set(), walkOct: new Set(), run: 0, runOct: new Set(), roll: 0, pushN: 0, animchangeImmediate: 0 };
const credit = (evs) => {
  for (const e of evs) {
    if (e.startsWith('reload:regular')) cov.regular++;
    if (e.startsWith('reload:walk')) cov.walkOct.add(e.slice(-1));
    if (e.startsWith('reload:run')) { cov.run++; cov.runOct.add(e.slice(-1)); }
    if (e === 'reload:roll') cov.roll++;
    if (e === 'reload:push') cov.pushN++;
  }
  if (evs.includes('animchange') && evs.some((e) => e.startsWith('reload:'))) cov.animchangeImmediate++;
};
for (let t = 1; t < samples.length; t++) {
  const prev = samples[t - 1], cur = samples[t];
  const obs = fieldsOf(cur);
  const p1 = twin(prev, cur);
  if (eq(p1, obs)) {
    stepCounts[1]++; totalSteps += 1; credit(p1.ev);
    if (p1.ev.some((e) => e.startsWith('reload:walk'))) cov.walkDur.add(p1.dur);
    continue;
  }
  // two steps: feed p1's interpreter fields back as "prev", same inputs
  const mid = { ...cur, frame: p1.frame, aniFrame: p1.aniFrame, timeFrame: p1.timeFrame, render: p1.renderLow, prevAni: cur.prevAni };
  const p2 = twin(mid, cur);
  if (eq(p2, obs)) {
    stepCounts[2]++; totalSteps += 2; credit([...p1.ev, ...p2.ev]);
    for (const px of [p1, p2]) if (px.ev.some((e) => e.startsWith('reload:walk'))) cov.walkDur.add(px.dur);
    continue;
  }
  if (eq(fieldsOf(prev), obs)) { stepCounts[0]++; continue; }
  unexplained++;
  if (shown.length < 8) shown.push({ t, phase: cur.phase, prev, cur, p1: fieldsOf ? { frame: p1.frame, aniFrame: p1.aniFrame, timeFrame: p1.timeFrame, renderLow: p1.renderLow } : p1 });
}
console.log('\nticks:', samples.length - 1, 'stepCounts:', JSON.stringify(stepCounts), 'totalTwinSteps:', totalSteps, 'unexplained:', unexplained);
console.log('coverage:', JSON.stringify({ regularReloads: cov.regular, walkDurations: [...cov.walkDur].sort((a, b) => a - b), walkOctants: [...cov.walkOct], runReloads: cov.run, runOctants: [...cov.runOct], rollReloads: cov.roll, pushReloads: cov.pushN, animChangeImmediateAdvance: cov.animchangeImmediate }));
const animsSeen = new Set(samples.map((x) => x.prevAni));
console.log('anims seen (prevAni):', [...animsSeen].map((a) => '$' + a.toString(16)).join(' '));
for (const m of shown) console.log('UNEXPLAINED', JSON.stringify(m));
const drift = Math.abs(totalSteps - (samples.length - 1));
const unmeasured = [];
if (cov.walkDur.size < 2) unmeasured.push('walk durations <2 distinct');
if (cov.run < 3) unmeasured.push('run reloads <3');
if (cov.roll < 1) unmeasured.push('roll never observed');
if (cov.regular < 3) unmeasured.push('regular reloads <3');
if (cov.animchangeImmediate < 1) unmeasured.push('no anim-change immediate advance observed');
if (cov.pushN < 1) unmeasured.push('push never observed (needs a wall)');
if (cov.walkOct.size < 2 && cov.runOct.size < 2) unmeasured.push('rotation confirmed only at octant(s) ' + [...new Set([...cov.walkOct, ...cov.runOct])]);
console.log('step conservation: |totalSteps - ticks| =', drift, drift <= 3 ? '(conserved)' : '(NOT conserved — cadence model wrong)');
console.log(unmeasured.length ? 'REGIME LIMITS: ' + unmeasured.join(' | ') : 'coverage: all buckets hit');
console.log(unexplained === 0 ? 'TWIN LOCKSTEP: every tick explained by 0/1/2 exact interpreter steps' : 'TWIN LOCKSTEP: ' + unexplained + ' unexplained ticks');
process.exit(0);
