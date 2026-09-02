#!/usr/bin/env node
// Probe 2: does a resumed (free-running) headless oracle-aether advance frames?
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import * as esbuild from 'esbuild';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER = siblingPathOrUnresolved('oracle', 'target/release/oracle-aether');
const ROM = siblingPathOrUnresolved('aeon', 's4.debug.bin');
const SOCK = `/tmp/bq-${process.pid}.sock`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'aurora-bq-'));
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
    const f = async () => (await c.call('emulator/status')).frameToken;
    console.log('at connect: frame =', await f());
    await sleep(500);
    console.log('after 500ms untouched: frame =', await f());
    await c.call('emulator/pause', {});
    console.log('paused: frame =', await f());
    await c.call('emulator/resume', {});
    await sleep(500);
    console.log('after resume + 500ms: frame =', await f());
    await sleep(1000);
    console.log('after another 1000ms: frame =', await f());
  } finally {
    if (emu) emu.kill('SIGKILL');
    rmSync(workDir, { recursive: true, force: true });
  }
}
main().catch((e) => { console.error('ERROR:', e.stack); process.exit(1); });
