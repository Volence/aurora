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
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import * as esbuild from 'esbuild';

const ROOT = '/home/volence/sonic_hacks/aurora';
const SERVER = '/home/volence/sonic_hacks/oracle-next/target/release/oracle-aether';
// The mailbox is DEBUG-shape only — Warp_Req_* are absent from release listings.
const ROM = '/home/volence/sonic_hacks/aeon/s4.debug.bin';
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

    // VISIBLE WINDOW ONLY, adopted from aeon's gate after they measured that the
    // full 64x64 ring is legitimately path-dependent OUTSIDE the view — two
    // CORRECT walks disagreed by 26 words out there. A whole-plane diff
    // therefore has a false-positive floor, which is fine for "is it torn?"
    // (the tearing dwarfs it) and fatal for "is it clean?", which is exactly
    // what this run has to answer about the mailbox.
    //
    // Plane is 64 cells wide; the visible window is 40x28 cells at the origin.
    const PLANE_W = 64, VIEW_W = 40, VIEW_H = 28;
    const diffWords = (a, b) => {
      let n = 0;
      for (let row = 0; row < VIEW_H; row++) {
        for (let col = 0; col < VIEW_W; col++) {
          const i = (row * PLANE_W + col) * 2;
          if (i + 1 >= Math.min(a.length, b.length)) continue;
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) n++;
        }
      }
      return n;
    };
    const VIEW_WORDS = VIEW_W * VIEW_H;

    /**
     * The whole 64x64 ring, reported ALONGSIDE the window rather than instead
     * of it.
     *
     * CAVEAT ON THE WINDOW METRIC, stated because it changes how much a zero is
     * worth: `diffWords` samples the nametable's first 40x28 cells, which is
     * the view ONLY when plane A's scroll is at the origin. Under scroll the
     * true window is elsewhere in the ring, so the window number is a fixed
     * SAMPLE of the plane, not the view. That makes it a fine tearing detector
     * (tearing is broad) and weak evidence of cleanliness — hence this.
     */
    const diffAll = (a, b) => {
      let n = 0;
      for (let i = 0; i + 1 < Math.min(a.length, b.length); i += 2) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) n++;
      }
      return n;
    };
    const ALL_WORDS = PLANE_LEN / 2;
    const shot = async (name) => {
      // `emulator/screenshot` WRITES A FILE and returns its `path`; it does not
      // return image bytes. This read `r.png ?? r.data ?? r.image` until
      // 2026-08-22 — three guesses at fields the server has never had, so every
      // call silently captured nothing while the harness reported clean. `bytes`
      // is a byte COUNT, not the image, and is the field that makes the mistake
      // look plausible. Ask for the destination explicitly rather than letting
      // the server default it into a tempdir we would then have to guess at.
      const dest = join(SHOTS, `${name}.png`);
      const r = await call('emulator/screenshot', { path: dest });
      if (!r || r.path !== dest) {
        throw new Error(`screenshot did not write ${dest}: ${JSON.stringify(r)}`);
      }
      if (!existsSync(dest)) throw new Error(`screenshot reported ${dest} but no file is there`);
    };

    /** Put camera + player at (x,y) with zeroed velocities, the bare-poke way. */
    const poke = async (x, y) => {
      await wr(camX, be16(x));
      await wr(camY, be16(y));
      await wr(player + 0x02, be32(x << 16));   // SST x, 16.16 fixed
      await wr(player + 0x06, be32(y << 16));   // SST y
      await wr(player + 0x10, be32(0));         // zero velocities so no momentum
    };

    // TWO SAMPLE POINTS, and the early one is the load-bearing one.
    //
    // The first run of the mailbox comparison used only SETTLE=90 and reported
    // the BARE POKE as clean — because restricting the diff to the visible
    // window (aeon's refinement) removed the off-screen ring, and the engine
    // reconciles what is on screen well before it finishes the ring. The tear
    // is real; 90 frames is simply past it in the view. aeon's own gate samples
    // at +30, so this does too, and keeps the settle sample as the "has it all
    // converged" check.
    const EARLY = 30;
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
    /** The reference at the EARLY sample point, walked the safe way. */
    const runPathBEarly = async () => {
      await call('emulator/restore', { id: cp });
      for (let x = startX + STEP; x <= destX; x += STEP) {
        await poke(x, destY);
        await call('emulator/run_frames', { frames: 2 });
      }
      await call('emulator/run_frames', { frames: EARLY });
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

    await call('emulator/run_frames', { frames: EARLY });
    const aEarly = await plane();
    const bEarly = await runPathBEarly();
    const tornEarly = diffWords(aEarly, bEarly);
    const tornEarlyAll = diffAll(aEarly, bEarly);
    console.log(`        at +${EARLY}f: ${tornEarly}/${VIEW_WORDS} window words, ${tornEarlyAll}/${ALL_WORDS} whole-plane words disagree`);

    // Back to path A for the settle sample.
    await call('emulator/restore', { id: cp });
    await poke(destX, destY);
    await call('emulator/run_frames', { frames: SETTLE });
    const a1 = await plane();
    await shot('pathA-one-big-poke');

    const torn = tornEarly;
    check('1', 'a single far poke tears the VISIBLE WINDOW at the early sample',
      tornEarly > 0,
      `${torn} of ${VIEW_WORDS} visible-window words disagree after ${SETTLE} settle frames ` +
      `(${(torn / VIEW_WORDS * 100).toFixed(1)}% of the view)`);

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

    // ---- Rows 4-6: THE MAILBOX, which is what all of the above justifies ----
    //
    // Same instrument, same destination, same settle — only the METHOD changes.
    // That is the point: a before/after measured two different ways would prove
    // nothing about the fix.
    const wx = await client.resolve('Warp_Req_X').catch(() => null);
    const wy = await client.resolve('Warp_Req_Y').catch(() => null);
    const wf = await client.resolve('Warp_Req_Flag').catch(() => null);
    check('4', 'the DEBUG warp mailbox symbols resolve',
      wx !== null && wy !== null && wf !== null,
      wx === null ? 'absent — is this a release ROM?' : `X=${hx(wx)} Y=${hx(wy)} Flag=${hx(wf)}`);

    if (wx !== null) {
      await call('emulator/restore', { id: cp });
      // Write X, Y, then the flag LAST — a torn read must never act on half a
      // destination.
      await wr(wx, be16(destX));
      await wr(wy, be16(destY));
      await wr(wf, Uint8Array.of(1));

      // The engine clears the flag when it has consumed the request. Poll it
      // rather than sleeping a guessed interval; their gate measured ~21 frames.
      let ackFrames = null;
      for (let f = 0; f < 120; f++) {
        await call('emulator/run_frames', { frames: 1 });
        const flag = (await rd(wf, 1))[0];
        if (flag === 0) { ackFrames = f + 1; break; }
      }
      check('5', 'the engine acknowledges by clearing the flag',
        ackFrames !== null, ackFrames === null ? 'never cleared within 120 frames' : `ack after ${ackFrames} frames`);

      // Sample at the SAME early point the bare poke was judged at, so the two
      // numbers are comparable. The ack already cost ~20 frames, so top up to
      // EARLY rather than adding EARLY on top.
      const topUp = Math.max(0, EARLY - (ackFrames ?? 0));
      if (topUp) await call('emulator/run_frames', { frames: topUp });
      const viaMailbox = await plane();
      const mailboxDiff = diffWords(viaMailbox, bEarly);
      const mailboxDiffAll = diffAll(viaMailbox, bEarly);
      check('6', 'the mailbox lands CLEAN at the distance and frame where the bare poke tears',
        mailboxDiff === 0,
        `window ${mailboxDiff}/${VIEW_WORDS} and whole-plane ${mailboxDiffAll}/${ALL_WORDS} words disagree ` +
        `at ${DIST}px, +${EARLY}f (bare poke at the same point: ${tornEarly} window, ${tornEarlyAll} whole-plane) ` +
        `— landed at (${u16(await rd(wx, 2))},${u16(await rd(wy, 2))})`);
      // OFF-VIEW FLOOR, not a tuned threshold. aeon measured that two CORRECT
      // walks disagree by up to 26 whole-plane words outside the view, because
      // the ring outside the window is legitimately path-dependent — which is
      // why they restricted their own gate to the view. That floor was stated
      // before this run, so comparing against it is a citation rather than a
      // number chosen to make a red row green. What this asserts is the useful
      // thing: the mailbox is inside the noise, and the bare poke is not.
      const OFF_VIEW_FLOOR = 26;
      // ---- Row 8: do the EDITOR's world pixels mean the same thing as the
      // ENGINE's? Aurora's warp-math assumes they do (an aeon act is flat world
      // coordinates end to end, and the editor lays sections out on the same
      // grid at the same scale). Assumed correspondences between two codebases
      // are exactly what has bitten this work repeatedly, so it is measured:
      // ask for a known world point and see where the PLAYER ends up.
      const playerAddr = await client.resolve('Player_1');
      const warpAndRead = async (ax, ay) => {
        await call('emulator/restore', { id: cp });
        await wr(wx, be16(ax));
        await wr(wy, be16(ay));
        await wr(wf, Uint8Array.of(1));
        for (let f = 0; f < 120; f++) {
          await call('emulator/run_frames', { frames: 1 });
          if ((await rd(wf, 1))[0] === 0) break;
        }
        // SETTLE BEFORE READING. The player arrives airborne, so reading at the
        // ack (~20 frames) catches them mid-fall — and two warps read at the
        // same elapsed time have both fallen the same distance, which preserves
        // their difference and imitates a constant offset exactly. The first
        // run of this row fell for that: it reported a fixed -11 that was
        // really two unfinished falls.
        await call('emulator/run_frames', { frames: 240 });
        return {
          x: (await rd(playerAddr + 0x02, 4)).readUInt32BE(0) >>> 16,   // SST x, 16.16
          y: (await rd(playerAddr + 0x06, 4)).readUInt32BE(0) >>> 16,   // SST y
        };
      };

      const askX = 1536;
      const low = await warpAndRead(askX, 320);
      check('8', 'X is the editor world coordinate, exactly — the spaces correspond',
        low.x === askX, `asked x=${askX}, player x=${low.x}`);

      // Y needs characterising rather than a tolerance. aeon says the player
      // "arrives airborne with zeroed velocities and falls to the ground", so
      // two different asked-Y values at the same X should converge to the SAME
      // ground if it is a fall, and stay a CONSTANT offset apart if it is a
      // placement convention Aurora would have to compensate for.
      const high = await warpAndRead(askX, 120);
      // What matters to the client is not the offset's VALUE but whether it is
      // PREDICTABLE. A fall-to-ground would make Y terrain-dependent and
      // uncorrectable; a constant offset is a convention Aurora can compensate
      // for (or deliberately not, once aeon says which point it means).
      const dLow = low.y - 320, dHigh = high.y - 120;
      const constant = dLow === dHigh;
      check('9', 'Y differs from the request by a CONSTANT, not by terrain',
        constant,
        `asked 320 -> ${low.y} (${dLow}); asked 120 -> ${high.y} (${dHigh}). ` +
        (constant
          ? `A stable ${dLow}px convention — Player_1.y is not the point the warp takes. ` +
            `Measured after 240 settle frames, so it is not an unfinished fall. Aurora does NOT ` +
            `compensate: the engine's read-back reports the request, and which point it means ` +
            `(feet vs origin) is aeon's to define.`
          : 'Terrain-dependent — Y cannot be predicted client-side.'));

      // ---- Row 10: terrain snap, or a constant shift? aeon's discriminator.
      //
      // If the engine grounds the player, every request in clear air above the
      // SAME x must settle to the SAME resting y (surface - radius), ignoring
      // the requested height. If instead resting y tracks the request, then
      // something is applying a constant shift and the terrain-snap account is
      // falsified.
      //
      // Note all of these share one x, so they share one terrain column — which
      // is what makes the sweep discriminating rather than a survey of spots.
      const sweep = [];
      for (const ay of [64, 128, 192, 256, 320, 384]) {
        const r = await warpAndRead(askX, ay);
        sweep.push({ ask: ay, rest: r.y, delta: r.y - ay });
      }
      for (const s of sweep) {
        console.log(`        ask y=${String(s.ask).padStart(3)} -> rest ${String(s.rest).padStart(3)} (delta ${s.delta})`);
      }
      const restingYs = new Set(sweep.map((s) => s.rest));
      const deltas = new Set(sweep.map((s) => s.delta));
      const snapped = restingYs.size === 1;
      const shifted = deltas.size === 1;
      // NOTE THE WORDING. This row reports WHAT the sweep shows; it deliberately
      // does not conclude anything about the engine's intent, because row 11
      // below establishes whether the player is being simulated at all — and if
      // it is not, "no terrain snap" is trivially true and means nothing.
      // An earlier version of this row announced terrain snap FALSIFIED on this
      // evidence alone. It was not entitled to.
      check('10', 'the sweep resolves to one regime, whatever that regime means',
        snapped || shifted,
        snapped
          ? `all six settle at y=${[...restingYs][0]} regardless of the request (consistent with terrain snap)`
          : shifted
            ? `resting y tracks the request at a constant ${[...deltas][0]}px across all six, ` +
              `same x throughout — READ ROW 11 BEFORE CONCLUDING ANYTHING FROM THIS`
            : `neither: resting ${[...restingYs].join(',')} deltas ${[...deltas].join(',')}`);

      // RESOLVED ENGINE-SIDE (aeon b3169c26), recorded so nobody re-opens it:
      // the placement is VERBATIM, and the -11 is DESTINATION-DEPENDENT — an
      // engine raw probe at this same x got delta 0 for a request in clear air
      // and -11 for one intersecting terrain. Prime suspect is a one-shot
      // terrain resolve inside the ack window that runs once and then never
      // ticks again in this state. So all six of the sweep's points sat in
      // terrain. Aurora still does NOT compensate: doing so would break the
      // clear-air case, which is the common one.
      //
      // ---- Row 11: is the player's PHYSICS even running in this state?
      //
      // Row 10's conclusion only means something if the player is being
      // simulated. If gameplay is not advancing, "no terrain snap" is trivially
      // true and says nothing about the engine's intent — so trace y frame by
      // frame after a warp into clear air instead of assuming.
      await call('emulator/restore', { id: cp });
      await wr(wx, be16(askX));
      await wr(wy, be16(64));
      await wr(wf, Uint8Array.of(1));
      for (let f = 0; f < 120; f++) {
        await call('emulator/run_frames', { frames: 1 });
        if ((await rd(wf, 1))[0] === 0) break;
      }
      const trace = [];
      for (const step of [0, 1, 4, 15, 40, 120, 240]) {
        if (step) await call('emulator/run_frames', { frames: step - (trace.at(-1)?.f ?? 0) });
        trace.push({ f: step, y: (await rd(playerAddr + 0x06, 4)).readUInt32BE(0) >>> 16 });
      }
      console.log(`        y after ack: ${trace.map((s) => `+${s.f}f=${s.y}`).join('  ')}`);
      const moved = new Set(trace.map((s) => s.y)).size > 1;
      check('11', 'the player is actually being simulated (y moves after the warp)',
        moved,
        moved
          ? 'y changes over time, so row 10 compares real physics outcomes'
          : 'y NEVER changes — the player is not being simulated here, so row 10 cannot ' +
            'distinguish terrain snap from a shift and its conclusion must not be trusted');

      check('7', 'the mailbox whole-plane diff is inside the known off-view floor',
        mailboxDiffAll <= OFF_VIEW_FLOOR,
        `${mailboxDiffAll} of ${ALL_WORDS} whole-plane words (floor ${OFF_VIEW_FLOOR}; ` +
        `bare poke ${tornEarlyAll})`);
      await shot('mailbox-warp');
    }
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
