#!/usr/bin/env node
// HOW BADLY DOES A BARE CAMERA+PLAYER POKE TEAR, AND DOES IT SELF-HEAL?
//
// The aeon session's account: the tile cache latches its streaming DIRECTION
// and prefetch baselines from per-frame camera DELTAS, so a teleport-shaped
// jump hands it a huge spurious delta and mis-latches. Small jumps are fine.
// This is the client-side measurement of that failure — the one the
// `Warp_Req_*` mailbox exists to delete.
//
// MEASURING "TORN" WITHOUT SQUINTING AT A PNG. Comparing screenshots is no
// good: two paths to the same place run different frame counts, so sprites and
// animated tiles differ for reasons that are not the defect. Instead this
// reaches the SAME destination two ways and diffs the PLANE NAMETABLE:
//
//   Path A — one big poke straight to the destination.
//   Path B — the same distance in small steps (which aeon says is safe),
//            from the same checkpoint.
//
// For a given camera position the background nametable should be identical
// however you arrived. Every differing entry is a cell holding art that
// streaming got wrong. Animated tiles change tile PIXELS, not nametable
// entries, so they do not pollute the count.
//
// Row 0 is the anti-vacuous control: Path B against itself must diff to ZERO,
// or the comparison is measuring nondeterminism rather than tearing.
//
// Usage: node scratchpad/warp-tearing-harness.mjs   (VERBOSE=1 for server log)

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import * as esbuild from 'esbuild';

const ROOT = '/home/volence/sonic_hacks/aurora';
const SERVER = '/home/volence/sonic_hacks/oracle-next/target/release/oracle-aether';
const ROM = '/home/volence/sonic_hacks/aeon/s4.bin';
const SOCK = join(tmpdir(), `aur-warp-${process.pid}.sock`);
const SHOTS = join(ROOT, 'scratchpad/shots-warp-tearing');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok });
  if (!ok) fails.push(id);
}
function note(label, detail) { console.log(`NOTE  ${label}\n        ${detail}`); }

async function loadClient(outDir) {
  const out = join(outDir, 'client.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, 'src/main/aether/client.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
  });
  return import(out);
}

const hx = (n) => '0x' + (n >>> 0).toString(16).toUpperCase();

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'aurora-warp-'));
  let child = null, client = null;
  try {
    const { AetherClient } = await loadClient(workDir);
    child = spawn(SERVER, [ROM], {
      env: { ...process.env, ORACLE_SOCKET: SOCK },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; if (process.env.VERBOSE) process.stdout.write(`[srv] ${d}`); });
    child.stderr.on('data', (d) => { log += d; if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });
    for (let i = 0; i < 60 && !log.includes('listening on'); i++) await sleep(200);

    client = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK });
    await client.connect();

    const call = (m, p) => client.call(m, p);
    const rd = async (addr, len) => {
      const r = await call('emulator/read_memory', { addr: hx(addr), len });
      return Buffer.from(r.bytes.replace(/^0x/i, ''), 'hex');
    };
    const wr = (addr, bytes) =>
      call('emulator/write_memory', { addr: hx(addr), bytes: '0x' + Buffer.from(bytes).toString('hex') });
    const u16 = (b) => (b[0] << 8) | b[1];
    const be16 = (v) => Uint8Array.of((v >> 8) & 0xff, v & 0xff);
    const be32 = (v) => Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);

    const camX = await client.resolve('Camera_X');
    const camY = await client.resolve('Camera_Y');
    const player = await client.resolve('Player_1');
    const prevCamX = await client.resolve('Cache_Prev_Cam_X');
    const prevCamRow = await client.resolve('Cache_Prev_Cam_Row');

    await call('emulator/pause', {});
    await call('emulator/run_frames', { frames: 600 });   // boot into a level

    const startX = u16(await rd(camX, 2));
    const startY = u16(await rd(camY, 2));
    check('setup', 'the game is in a level with a live camera',
      Number.isFinite(startX), `Camera=(${startX},${startY}) Player_1=${hx(player)}`);

    const cp = (await call('emulator/checkpoint', { label: 'pre-warp' })).id;
    note('checkpoint', `id=${cp} — both paths start from exactly this machine`);

    // Plane A nametable. VRAM $C000 is aeon's plane A base for this build; the
    // absolute address does not matter to the comparison, only that both paths
    // read the same window.
    const PLANE_A = 0xC000, PLANE_LEN = 0x1000;
    const plane = async () => {
      const r = await call('emulator/read_vram', { addr: hx(PLANE_A), len: PLANE_LEN });
      return Buffer.from(r.bytes.replace(/^0x/i, ''), 'hex');
    };
    const diffWords = (a, b) => {
      let n = 0;
      for (let i = 0; i + 1 < Math.min(a.length, b.length); i += 2) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) n++;
      }
      return n;
    };
    const shot = async (name) => {
      const r = await call('emulator/screenshot', {});
      const b64 = typeof r === 'string' ? r : (r.png ?? r.data ?? r.image);
      if (typeof b64 === 'string') {
        writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(b64.replace(/^data:image\/png;base64,/, ''), 'base64'));
      }
    };

    /** Put camera + player at (x,y) with zeroed velocities, the bare-poke way. */
    const poke = async (x, y) => {
      await wr(camX, be16(x));
      await wr(camY, be16(y));
      await wr(player + 0x02, be32(x << 16));   // SST x, 16.16 fixed
      await wr(player + 0x06, be32(y << 16));   // SST y
      await wr(player + 0x10, be32(0));         // zero velocities so no momentum
    };

    const SETTLE = 90;

    // ---- Path B first: many small steps, which aeon says the cache handles.
    const DIST = 2048;                 // several sections east
    const STEP = 64;
    const destX = startX + DIST, destY = startY;

    const runPathB = async () => {
      await call('emulator/restore', { id: cp });
      for (let x = startX + STEP; x <= destX; x += STEP) {
        await poke(x, destY);
        await call('emulator/run_frames', { frames: 2 });
      }
      await call('emulator/run_frames', { frames: SETTLE });
      return plane();
    };

    const b1 = await runPathB();
    await shot('pathB-small-steps');

    // ROW 0 — ANTI-VACUOUS. Same path twice must agree exactly, or every
    // number below is measuring nondeterminism instead of tearing.
    const b2 = await runPathB();
    const selfDiff = diffWords(b1, b2);
    check('0', 'the small-step path is reproducible (self-diff is zero)',
      selfDiff === 0, `${selfDiff} differing nametable words between two identical runs`);

    // ---- Path A: one big poke.
    await call('emulator/restore', { id: cp });
    const preX = u16(await rd(prevCamX, 2));
    await poke(destX, destY);
    const postCacheX = u16(await rd(prevCamX, 2));
    note('delta the cache sees',
      `Cache_Prev_Cam_X=${preX} while Camera_X jumps ${startX}->${destX} (${DIST}px). ` +
      `Still ${postCacheX} immediately after the poke — the latch input for the next frame.`);

    await call('emulator/run_frames', { frames: SETTLE });
    const a1 = await plane();
    await shot('pathA-one-big-poke');

    const torn = diffWords(a1, b1);
    check('1', 'a single far poke leaves the plane DIFFERENT from the same place reached safely',
      torn > 0,
      `${torn} of ${PLANE_LEN / 2} nametable words disagree after ${SETTLE} settle frames ` +
      `(${(torn / (PLANE_LEN / 2) * 100).toFixed(1)}% of plane A)`);

    // ---- Does it self-heal, and how long does the mess stay on screen?
    //
    // The first run of this harness asserted it does NOT recover. That was
    // wrong — it recovers completely. The assertion has been replaced by the
    // measurement it should have been: recovery TIME is the number that
    // matters, because ~N seconds of visibly wrong art is what a
    // play-from-cursor feature cannot ship with, not permanence.
    let recoveredAt = null;
    let elapsed = SETTLE;
    for (const step of [30, 30, 60, 60, 120, 120, 180, 180]) {
      await call('emulator/run_frames', { frames: step });
      elapsed += step;
      const d = diffWords(await plane(), b1);
      console.log(`        +${String(elapsed).padStart(4)} frames -> ${String(d).padStart(4)} differing words`);
      if (d === 0) { recoveredAt = elapsed; break; }
    }
    check('2', 'the tear is TRANSIENT — it heals, but only after seconds of wrong art',
      recoveredAt !== null,
      recoveredAt !== null
        ? `clean again at ${recoveredAt} frames (~${(recoveredAt / 60).toFixed(1)}s at 60fps) after the poke`
        : `still torn after ${elapsed} frames`);
    await shot('pathA-after-recovery');

    // ---- Where is the threshold? Sweep jump distance.
    const rows = [];
    for (const dist of [64, 128, 256, 512, 1024, 2048]) {
      await call('emulator/restore', { id: cp });
      await poke(startX + dist, startY);
      await call('emulator/run_frames', { frames: SETTLE });
      const jumped = await plane();

      await call('emulator/restore', { id: cp });
      for (let x = startX + STEP; x <= startX + dist; x += STEP) {
        await poke(x, startY);
        await call('emulator/run_frames', { frames: 2 });
      }
      await call('emulator/run_frames', { frames: SETTLE });
      const walked = await plane();

      const d = diffWords(jumped, walked);
      rows.push({ dist, d });
      console.log(`        jump ${String(dist).padStart(5)}px -> ${String(d).padStart(4)} differing words`);
    }
    const clean = rows.filter((r) => r.d === 0).map((r) => r.dist);
    const dirty = rows.filter((r) => r.d > 0).map((r) => r.dist);
    check('3', 'small jumps are clean and large ones are not — there is a threshold',
      clean.length > 0 && dirty.length > 0,
      `clean at ${clean.join(', ') || 'none'}px; torn at ${dirty.join(', ') || 'none'}px`);
  } finally {
    try { client?.disconnect(); } catch { /* */ }
    if (child) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
      await sleep(300);
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    }
    try { rmSync(SOCK, { force: true }); } catch { /* */ }
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* */ }
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
