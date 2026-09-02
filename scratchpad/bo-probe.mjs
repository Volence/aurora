#!/usr/bin/env node
// Probe: what state is the freshly booted s4.debug.bin actually in?
import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import * as esbuild from 'esbuild';

const ROOT = AURORA_DIR;
const SERVER = siblingPathOrUnresolved('oracle', 'target/release/oracle-aether');
const ROM = siblingPathOrUnresolved('aeon', 's4.debug.bin');
const SOCK = `/tmp/bp-${process.pid}.sock`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => '0x' + (n >>> 0).toString(16).toUpperCase();

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'aurora-bp-'));
  let emu = null;
  try {
    const out = join(workDir, 'client.mjs');
    await esbuild.build({ entryPoints: [join(ROOT, 'src/main/aether/client.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
    const { AetherClient } = await import(out);
    emu = spawn(SERVER, [ROM], { env: { ...process.env, ORACLE_SOCKET: SOCK }, stdio: ['ignore', 'pipe', 'pipe'] });
    let elog = '';
    emu.stdout.on('data', (d) => (elog += d)); emu.stderr.on('data', (d) => (elog += d));
    for (let i = 0; i < 60 && !elog.includes('listening on'); i++) await sleep(200);

    const c = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK });
    await c.connect();

    // run a bounded number of frames from reset so we KNOW where we are
    await c.call('emulator/pause', {});
    for (const frames of [30, 60, 60, 120, 240, 600]) {
      await c.call('emulator/run_frames', { frames });
      const st = await c.call('emulator/status');
      const p1 = await c.resolve('Player_1');
      const rd = async (a, l) => (await c.call('emulator/read_memory', { addr: hex(a), len: l })).bytes;
      const x = Number.parseInt((await rd(p1 + 2, 4)).slice(2), 16) >>> 16;
      const y = Number.parseInt((await rd(p1 + 6, 4)).slice(2), 16) >>> 16;
      let bounds = 'n/a';
      try {
        const br = await c.resolve('Player_Bound_Right');
        const bb = await c.resolve('Player_Bound_Bottom');
        bounds = `right=${Number.parseInt((await rd(br, 2)).slice(2), 16)} bottom=${Number.parseInt((await rd(bb, 2)).slice(2), 16)}`;
      } catch (e) { bounds = 'unresolved: ' + e.message; }
      console.log(`frame=${st.frameToken} pc=${st.pc} sym=${st.symbolAtPc ?? '?'}+${st.symbolDisp ?? ''} player=(${x},${y}) ${bounds}`);
    }
  } finally {
    if (emu) emu.kill('SIGKILL');
    rmSync(workDir, { recursive: true, force: true });
  }
}
main().catch((e) => { console.error('ERROR:', e.stack); process.exit(1); });
