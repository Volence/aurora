#!/usr/bin/env node
// DOES BUILD & RUN PUT THE PLAYER BACK ON THE FIRST PAINTED FRAME?
//
// The node suite proves runBuild's sequencing against a MODEL of the engine.
// This proves it against the ENGINE: a real `FAST=1 DEBUG=1 ./build.sh` of
// aeon, a real oracle-aether serving the real s4.debug.bin, and the real
// `runBuild` from src/main/aether/build-run.ts (bundled from this tree, no
// stubs between it and the socket).
//
// Two connections, deliberately:
//   - client A is handed to runBuild — the component under test;
//   - an INDEPENDENT observer client on the same socket reads Player_1's
//     position out of the machine afterwards. The component is never asked
//     whether it worked; a component reporting on itself is not evidence.
//
// THE CONTROL RUN keeps the pass non-vacuous: the same build+reload with
// restorePosition:false must land the player at the AUTHORED act start,
// which must differ from the destination — proving the observer's read
// actually distinguishes restored from unrestored.
//
// SETUP FACTS this file learned the hard way (bo-probe/bo-probe2):
//   - a fresh headless oracle-aether is PAUSED at frame 0 — nothing runs
//     until a resume, so "wait for boot" without one reads reset-RAM garbage;
//   - resumed, it paces ~60fps (30 frames / 500ms);
//   - by frame ~90 the DEBUG ROM is in the level: Player_Bound_Right/Bottom
//     are set and Player_1 sits at the authored spawn.
//
// BEFORE vs AFTER: master's runBuild (resume-then-retry-the-warp) is bundled
// from `git show master:...` and run against the same pipeline. Driven at
// socket speed its first warp write lands BEFORE the boot's RAM clear — the
// clear eats the mailbox AND zeroes the flag, which the old loop reads as an
// ack (the forged-ack failure §4.12b warns about, live). So the honest
// old-mechanism timing is also measured: the identical pause/reload/symbols/
// resume/warp-retry shape, paced so the write survives the clear and the ack
// is the LEVEL's real consumption — that is the draw-then-jump cost the old
// path had when it worked.
//
// Usage: node scratchpad/boot-override-harness.mjs    (VERBOSE=1 for logs)

import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import * as esbuild from 'esbuild';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // this tree (worktree-safe)
const SERVER = '/home/volence/sonic_hacks/oracle-next/target/release/oracle-aether';
const ROM = '/home/volence/sonic_hacks/aeon/s4.debug.bin';
const AEON = '/home/volence/sonic_hacks/aeon';
// Short and in /tmp directly — a long unix socket path dies on SUN_LEN.
const SOCK = `/tmp/bo-${process.pid}.sock`;
const BUILD_ENV = {
  ...process.env,
  SIGIL_BUILD: process.env.SIGIL_BUILD ?? '/home/volence/sonic_hacks/sigil/target/release/sigil',
  SIGIL_EMIT: process.env.SIGIL_EMIT ?? '/home/volence/sonic_hacks/sigil/target/release/emit_sound_blob',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
const hex = (n) => '0x' + (n >>> 0).toString(16).toUpperCase();
const eq = (a, b) => a && b && a.x === b.x && a.y === b.y;
const s = (p) => p ? `(${p.x}, ${p.y})` : String(p);

async function bundle(workDir, entry, out) {
  const outfile = join(workDir, out);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent', external: ['electron'] });
  return outfile;
}

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'aurora-bo-'));
  let emu = null;
  const oldSrcPath = join(ROOT, 'src/main/aether/__old_build_run_measure.ts');
  try {
    // --- bundle the real modules from THIS tree ----------------------------
    const { AetherClient } = await import(await bundle(workDir, join(ROOT, 'src/main/aether/client.ts'), 'client.mjs'));
    const { runBuild } = await import(await bundle(workDir, join(ROOT, 'src/main/aether/build-run.ts'), 'build-run.mjs'));
    const { warpTo } = await import(await bundle(workDir, join(ROOT, 'src/main/aether/warp.ts'), 'warp.mjs'));
    // …and master's runBuild, for the BEFORE lane. Written into src/
    // temporarily so its relative imports resolve; removed in the finally.
    const oldSrc = execSync('git show master:src/main/aether/build-run.ts', { cwd: ROOT, encoding: 'utf8' });
    writeFileSync(oldSrcPath, oldSrc);
    const { runBuild: runBuildOld } = await import(await bundle(workDir, oldSrcPath, 'build-run-old.mjs'));

    // --- the emulator -------------------------------------------------------
    emu = spawn(SERVER, [ROM], {
      env: { ...process.env, ORACLE_SOCKET: SOCK }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let elog = '';
    emu.stdout.on('data', (d) => { elog += d; if (process.env.VERBOSE) process.stdout.write(`[emu] ${d}`); });
    emu.stderr.on('data', (d) => { elog += d; if (process.env.VERBOSE) process.stderr.write(`[emu!] ${d}`); });
    for (let i = 0; i < 60 && !elog.includes('listening on'); i++) await sleep(200);
    check('setup-1', 'the emulator is serving', elog.includes('listening on'), SOCK);

    const mkClient = async () => {
      const c = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK });
      await c.connect();
      return c;
    };
    const appClient = await mkClient();   // handed to runBuild
    const observer = await mkClient();    // never handed to anything

    // The observer's instruments: Player_1's 16.16 position (whole pixels in
    // the high words — x_pos @ $02 / y_pos @ $06, aeon engine/objects/sst.emp)
    // and the act bounds the level init publishes.
    const player = await observer.resolve('Player_1');
    const boundR = await observer.resolve('Player_Bound_Right');
    const readPx = async (off) => {
      const r = await observer.call('emulator/read_memory', { addr: hex(player + off), len: 4 });
      return Number.parseInt(r.bytes.replace(/^0x/i, ''), 16) >>> 16;
    };
    const playerPos = async () => ({ x: await readPx(0x02), y: await readPx(0x06) });
    const boundRight = async () => {
      const r = await observer.call('emulator/read_memory', { addr: hex(boundR), len: 2 });
      return Number.parseInt(r.bytes.replace(/^0x/i, ''), 16);
    };
    const frameOf = async () => (await observer.call('emulator/status')).frameToken;
    /**
     * Wait until the LEVEL is up after a reload, then settle. Two conditions,
     * both needed: right after a reload the RAM still holds the OLD session's
     * values until the boot's clear runs inside frame 0-1, so a bare
     * "bounds nonzero" poll can pass on STALE data — the frame clock
     * (frameToken >= 120; the level is live by ~90, probed) rules that out.
     */
    const waitForLevel = async (budgetMs = 20000) => {
      const t = Date.now();
      while (Date.now() - t < budgetMs) {
        if ((await frameOf()) >= 120 && (await boundRight()) !== 0) { await sleep(300); return true; }
        await sleep(100);
      }
      return false;
    };

    // --- boot DETERMINISTICALLY, note the authored start --------------------
    // The server starts paused at frame 0; step past the boot (level is live
    // by frame ~90 — probed, not assumed: bounds nonzero is the assertion).
    await observer.call('emulator/pause', {});
    await observer.call('emulator/run_frames', { frames: 150 });
    const authored = await playerPos();
    const br0 = await boundRight();
    check('setup-2', 'the level is up and the player spawned (instrument sees its subject)',
      br0 !== 0 && (authored.x !== 0 || authored.y !== 0),
      `authored start = ${s(authored)}, Player_Bound_Right = ${br0}`);
    // From here the machine RUNS, like the app's emulator does.
    await observer.call('emulator/resume', {});

    // --- park the player somewhere that is NOT the authored start -----------
    const ask = { x: authored.x + 2048, y: authored.y + 512 };
    const w = await warpTo(appClient, ask.x, ask.y);
    const dest = w.landed ?? ask;
    check('setup-3', 'the warp mailbox parked the player away from spawn (mid-session warp path intact)',
      w.warped === true && eq(await playerPos(), dest),
      `asked ${s(ask)} -> landed ${s(w.landed)} in ${w.polls} polls; observer agrees`);
    check('setup-4', 'the destination differs from the authored start (else every later row is vacuous)',
      !eq(dest, authored), `dest ${s(dest)} vs authored ${s(authored)}`);

    const buildOpts = { basePath: AEON, env: BUILD_ENV, raw: undefined };

    // --- BEFORE, as-is: master's resume-then-retry-the-warp restore ---------
    const t0 = Date.now();
    const oldR = await runBuildOld({ ...buildOpts, client: appClient });
    const oldWall = Date.now() - t0;
    console.log(`        master runBuild: ok=${oldR.ok} reloaded=${oldR.reloaded} restoredTo=${s(oldR.restoredTo)} timings=${JSON.stringify(oldR.timings)} wall=${oldWall}ms`);
    await waitForLevel();
    const oldPos = await playerPos();
    const oldGenuine = eq(oldPos, dest);
    const oldForged = oldR.restoredTo !== undefined && !oldGenuine;
    check('before-1', 'the machine settled somewhere definite after the old-shape restore',
      eq(oldPos, dest) || eq(oldPos, authored),
      `observer read ${s(oldPos)}; dest ${s(dest)}, authored ${s(authored)} — verdict: ${oldGenuine ? 'GENUINE restore' : oldForged ? 'FORGED ack (boot RAM clear ate the write and zeroed the flag; §4.12b\'s pre-resume hazard, live)' : 'no restore claimed'}`);

    // --- BEFORE, honest: the old mechanism when its write SURVIVES ----------
    // Identical shape (pause -> reload -> symbols -> resume -> retry warpTo)
    // but paced so the mailbox write lands after the boot's RAM clear: this
    // is the draw-then-jump cost the old path had when it worked.
    if (!eq(await playerPos(), dest)) {
      const wpark = await warpTo(appClient, dest.x, dest.y);
      check('before-2a', 're-parked at the destination for the honest lane', wpark.warped === true,
        `landed ${s(wpark.landed)}`);
    }
    const status = await appClient.call('emulator/status');
    const romPath = status.romPath;
    const lstPath = romPath.replace(/\.bin$/, '.lst');
    const tHonest = Date.now();
    await appClient.call('emulator/pause');
    await appClient.call('emulator/reload_rom', { path: romPath });
    await appClient.loadSymbols(lstPath);
    await appClient.call('emulator/resume');
    const tRestoreOld = Date.now();
    await sleep(100); // past the RAM clear (frame ~1-2), as the app's IPC latency was
    let honest = { warped: false };
    let attempts = 0;
    for (; attempts < 40 && !honest.warped; attempts++) {
      honest = await warpTo(appClient, dest.x, dest.y, { maxPolls: 40 });
      if (!honest.warped) await sleep(100);
    }
    const oldRestoreMs = Date.now() - tRestoreOld;
    const oldHonestWall = Date.now() - tHonest;
    check('before-2', 'the old mechanism restores for real once its write survives the clear',
      honest.warped === true && eq(await playerPos(), dest),
      `landed ${s(honest.landed)} after ${attempts} attempt(s); restore=${oldRestoreMs}ms of wall=${oldHonestWall}ms (reload+boot+warp)`);

    // --- AFTER: this branch's boot-position override -------------------------
    const t1 = Date.now();
    const newR = await runBuild({ ...buildOpts, client: appClient });
    const newWall = Date.now() - t1;
    check('after-1', 'runBuild restored via the boot override',
      newR.ok === true && newR.reloaded === true && newR.restoredVia === 'boot-override',
      `restoredVia=${newR.restoredVia} timings=${JSON.stringify(newR.timings)} wall=${newWall}ms`);
    check('after-2', 'restoredTo is the engine-published pair (the destination)',
      eq(newR.restoredTo, dest), `restoredTo=${s(newR.restoredTo)}, expected ${s(dest)}`);
    const newPos = await playerPos();
    check('after-3', 'observer: the machine agrees — player is AT the saved position',
      eq(newPos, dest), `observer read ${s(newPos)}, expected ${s(dest)}`);
    const frameA = await frameOf();
    await sleep(300);
    const frameB = await frameOf();
    check('after-4', 'the machine is RUNNING at the destination (restore resumed it; not a frozen frame)',
      typeof frameA === 'number' && frameB > frameA, `frameToken ${frameA} -> ${frameB} over 300ms`);

    console.log(`\nRESTORE TIME  before (warp retry loop, honest lane): ${oldRestoreMs}ms`
      + `\n              after  (boot override):                ${newR.timings?.restore}ms`
      + `\n              (whole build+reload+restore walls: old=${oldHonestWall + (oldR.timings?.build ?? 0)}ms-ish, new=${newWall}ms)`);

    // --- CONTROL: no restore -> authored start (the instrument can fail) ----
    const ctlR = await runBuild({ ...buildOpts, client: appClient, restorePosition: false });
    check('control-1', 'the control build reloaded without restoring',
      ctlR.ok === true && ctlR.reloaded === true && ctlR.restoredTo === undefined && ctlR.restoredVia === undefined,
      `restoredVia=${ctlR.restoredVia}`);
    await waitForLevel();
    const ctlPos = await playerPos();
    check('control-2', 'without the override the boot comes out AUTHORED, not at the destination',
      eq(ctlPos, authored) && !eq(ctlPos, dest),
      `observer read ${s(ctlPos)}; authored ${s(authored)}; dest ${s(dest)}`);

    appClient.disconnect(); observer.disconnect();
  } finally {
    if (emu) emu.kill('SIGKILL'); // only the process this harness spawned, by PID
    try { unlinkSync(oldSrcPath); } catch { /* never written */ }
    try { unlinkSync(SOCK); } catch { /* server removed it */ }
    rmSync(workDir, { recursive: true, force: true });
  }
  console.log(fails.length ? `\nFAILED (${fails.length}/${results.length}): ${fails.join(', ')}` : `\nALL PASS (${results.length}/${results.length})`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error('ERROR:', e.stack ?? e.message); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
