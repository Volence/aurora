#!/usr/bin/env node
// DOES A LIVE PALETTE PUSH ACTUALLY REACH A RUNNING GAME?
//
// The unit tests prove the PLAN (offsets, encoding, payload-then-flag order).
// They cannot prove the thing that matters: that writing `Pal_Base` and raising
// `Pal_Base_Dirty` makes aeon's per-frame compose pick the colours up, and that
// they then SURVIVE — which is the whole reason this feature is not a
// `write_cram`. That needs a real emulator running a real ROM, so it lives here
// rather than in vitest.
//
// This drives the REAL client (`src/main/aether/client.ts`, bundled with
// esbuild) over a REAL unix socket against a real `oracle-aether`. A harness
// that reimplemented the wire protocol would prove the protocol and not the
// code that ships.
//
// ROW 4 IS THE NEGATIVE CONTROL AND IT IS THE POINT. It writes a payload and
// deliberately does NOT raise the dirty flag, then asserts the compose does
// NOT pick it up. Without that row, rows 2-3 would pass just as happily if the
// engine re-read Pal_Base unconditionally — i.e. if the flag we carefully
// order last did nothing at all. It is also an independent check of the aeon
// session's claim about how the compose works.
//
// Usage: node scratchpad/palette-push-harness.mjs   (VERBOSE=1 for server log)

import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import * as esbuild from 'esbuild';

const ROOT = '/home/volence/sonic_hacks/aurora';
const SERVER = '/home/volence/sonic_hacks/oracle-next/target/release/oracle-aether';
const ROM = '/home/volence/sonic_hacks/aeon/s4.bin';

// SHORT PATH ON PURPOSE: a unix socket path must fit sun_path (~104 bytes) and
// the session scratchpad is far too deep. The server's own failure here is a
// bare "path must be shorter than SUN_LEN" naming neither path nor limit.
const SOCK = join(tmpdir(), `aur-pal-${process.pid}.sock`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok });
  if (!ok) fails.push(id);
}

/** Bundle the shipping client so this harness exercises it, not a copy of it. */
async function loadClient(outDir) {
  const out = join(outDir, 'client.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, 'src/main/aether/client.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
  });
  return import(out);
}

/** Same, for the pure planner — so the bytes on the wire are the shipping bytes. */
async function loadPlanner(outDir) {
  const out = join(outDir, 'palette-push.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, 'src/core/aether/palette-push.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
  });
  return import(out);
}

const hex = (bytes) => '0x' + Buffer.from(bytes).toString('hex').toUpperCase();

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'aurora-aether-'));
  let child = null;
  let client = null;
  try {
    const { AetherClient } = await loadClient(workDir);
    const planner = await loadPlanner(workDir);

    child = spawn(SERVER, [ROM], {
      env: { ...process.env, ORACLE_SOCKET: SOCK },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    let serverLog = '';
    child.stdout.on('data', (d) => { serverLog += d; if (process.env.VERBOSE) process.stdout.write(`[srv] ${d}`); });
    child.stderr.on('data', (d) => { serverLog += d; if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

    // Wait for the socket rather than sleeping a guessed interval.
    for (let i = 0; i < 60 && !serverLog.includes('listening on'); i++) await sleep(200);
    check('setup-1', 'the server is listening', serverLog.includes('listening on'), serverLog.trim().split('\n').pop());

    client = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK });
    await client.connect();
    check('setup-2', 'the real client completes the two-step handshake',
      client.status === 'connected', `server=${client.server.name} ${client.server.version}`);

    // The feature gates on both symbols resolving; if either is missing the UI
    // greys out rather than writing into nowhere.
    let palBase = null, palDirty = null, resolveErr = null;
    try {
      palBase = await client.resolve(planner.PAL_BASE_SYMBOL);
      palDirty = await client.resolve(planner.PAL_BASE_DIRTY_SYMBOL);
    } catch (e) { resolveErr = e.message; }
    check('setup-3', 'Pal_Base and Pal_Base_Dirty resolve by symbol',
      palBase !== null && palDirty !== null,
      resolveErr ?? `Pal_Base=0x${palBase?.toString(16).toUpperCase()} Pal_Base_Dirty=0x${palDirty?.toString(16).toUpperCase()}`);
    if (palBase === null) throw new Error('cannot continue without symbols');

    const paletteBuffer = await client.resolve('Palette_Buffer');

    // Deterministic advance: pause, then run a fixed number of frames, so the
    // machine is in the same place on every run rather than wherever free-run
    // happened to be when we connected.
    await client.call('emulator/pause', {});
    await client.call('emulator/run_frames', { frames: 300 });

    const readBytes = async (addr, len) => {
      const r = await client.call('emulator/read_memory', { addr: '0x' + addr.toString(16).toUpperCase(), len });
      return Buffer.from(r.bytes.replace(/^0x/i, ''), 'hex');
    };
    // Pal_Base holds lines 1-3; Palette_Buffer is the composed 4-line result,
    // so base line 1 lands at composed line 1 = byte 32.
    const composedLine = (line) => readBytes(paletteBuffer + line * 32, 32);

    // --- Row 1-3: the real push -------------------------------------------
    const LINE = 2;
    const before = await composedLine(LINE);

    // A colour ramp nothing in the ROM is likely to hold, so a pass cannot be
    // the palette that happened to already be there.
    const colors = Array.from({ length: 16 }, (_, i) => ({
      r: (i % 8) * 36, g: ((i + 3) % 8) * 36, b: ((i + 5) % 8) * 36, a: 255,
    }));
    const plan = planner.planPalettePush(LINE, colors);
    const expected = Buffer.from(plan.writes[0].bytes);

    check('1', 'the pushed line differs from what was already composed',
      !before.equals(expected), `before=${hex(before.subarray(0, 8))}… expected=${hex(expected.subarray(0, 8))}…`);

    for (const w of plan.writes) {
      const addr = (w.symbol === planner.PAL_BASE_SYMBOL ? palBase : palDirty) + w.offset;
      await client.call('emulator/write_memory', {
        addr: '0x' + addr.toString(16).toUpperCase(),
        bytes: '0x' + Buffer.from(w.bytes).toString('hex'),
      });
    }
    await client.call('emulator/run_frames', { frames: 2 });

    const after = await composedLine(LINE);
    check('2', 'the compose picked the pushed line up',
      after.equals(expected), `composed=${hex(after.subarray(0, 8))}… expected=${hex(expected.subarray(0, 8))}…`);

    // The whole reason this is not a write_cram: it has to SURVIVE.
    await client.call('emulator/run_frames', { frames: 120 });
    const later = await composedLine(LINE);
    check('3', 'and it survives 120 further frames (a CRAM write would not)',
      later.equals(expected), `after 120 frames=${hex(later.subarray(0, 8))}…`);

    // --- Row 4: NEGATIVE CONTROL — the flag is load-bearing ----------------
    const colors2 = colors.map((c) => ({ ...c, r: 255 - c.r }));
    const plan2 = planner.planPalettePush(LINE, colors2);
    const payloadOnly = plan2.writes[0];
    await client.call('emulator/write_memory', {
      addr: '0x' + (palBase + payloadOnly.offset).toString(16).toUpperCase(),
      bytes: '0x' + Buffer.from(payloadOnly.bytes).toString('hex'),
    });
    await client.call('emulator/run_frames', { frames: 4 });
    const unflagged = await composedLine(LINE);
    check('4', 'WITHOUT the dirty flag the compose does NOT take the write (payload-then-flag is real)',
      unflagged.equals(expected) && !unflagged.equals(Buffer.from(plan2.writes[0].bytes)),
      `composed still=${hex(unflagged.subarray(0, 8))}… (would be ${hex(Buffer.from(plan2.writes[0].bytes).subarray(0, 8))}… if the flag were decorative)`);

    // ...and raising it afterwards lets the same bytes through, proving row 4
    // failed for the flag and not because the second payload was rejected.
    await client.call('emulator/write_memory', {
      addr: '0x' + palDirty.toString(16).toUpperCase(), bytes: '0x01',
    });
    await client.call('emulator/run_frames', { frames: 2 });
    const flagged = await composedLine(LINE);
    check('5', 'raising the flag afterwards lets the same bytes through',
      flagged.equals(Buffer.from(plan2.writes[0].bytes)), `composed=${hex(flagged.subarray(0, 8))}…`);

    // --- Row 6: line 0 is refused before it reaches the wire ---------------
    let threw = null;
    try { planner.planPalettePush(0, colors); } catch (e) { threw = e.message; }
    check('6', 'line 0 is refused client-side (character palette, engine never writes it)',
      threw !== null && /line 0/i.test(threw), threw ?? 'did not throw');
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
