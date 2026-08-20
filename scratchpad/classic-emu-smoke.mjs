#!/usr/bin/env node
// Smoke: is the rebuilt headless oracle-aether the post-parser-drop binary
// (35 methods), and does it accept sonic.lst + resolve v_palette_line_2?
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SERVER = '/home/volence/sonic_hacks/oracle-next/target/release/oracle-aether';
const ROM = '/home/volence/sonic_hacks/s1disasm/s1built.bin';
const LST = '/home/volence/sonic_hacks/s1disasm/sonic.lst';
const SOCK = `/run/user/1000/aur-cp-smoke.sock`;
const ROOT = process.cwd();
if (existsSync(SOCK)) rmSync(SOCK);   // a stale socket file refuses the bind

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const workDir = mkdtempSync(join(tmpdir(), 'aur-smoke-'));
const out = join(workDir, 'client.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'src/main/aether/client.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
const { AetherClient } = await import(out);

const emu = spawn(SERVER, [ROM], { env: { ...process.env, ORACLE_SOCKET: SOCK }, stdio: ['ignore', 'pipe', 'pipe'] });
let elog = '';
emu.stdout.on('data', (d) => (elog += d));
emu.stderr.on('data', (d) => (elog += d));
for (let i = 0; i < 50 && !elog.includes('listening on'); i++) await sleep(200);
console.log('banner:', elog.trim().split('\n').slice(0, 6).join(' | '));

const c = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK });
await c.connect();
console.log('methods advertised:', c['methods']?.size ?? '(private)');
try {
  const ls = await c.call('emulator/load_symbols', { path: LST });
  console.log('load_symbols:', JSON.stringify(ls).slice(0, 300));
  const r = await c.call('symbols/resolve', { name: 'v_palette_line_2' }).catch(async () =>
    ({ addr: await c.resolve('v_palette_line_2') }));
  console.log('v_palette_line_2:', JSON.stringify(r).slice(0, 200));
} catch (e) {
  console.log('FAIL:', e.message);
}
emu.kill('SIGTERM');
process.exit(0);
