import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net'; import fs from 'node:fs';
import os from 'node:os'; import path from 'node:path';

const BIN = siblingPathOrUnresolved('oracle', 'target/release/oracle-aether');
const ROM = siblingPathOrUnresolved('aeon', 's4.debug.bin');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aur-init-'));
const sock = path.join(dir, 'o.sock');

const srv = spawn(BIN, [ROM, '--socket', sock], { stdio: ['ignore','pipe','pipe'] });
let banner = '';
srv.stdout.on('data', d => banner += d); srv.stderr.on('data', d => banner += d);

const wait = async (p, ms=15000) => { const t0=Date.now();
  while (Date.now()-t0<ms) { if (fs.existsSync(p)) return true; await new Promise(r=>setTimeout(r,100)); } return false; };
if (!await wait(sock)) { console.log('NO SOCKET\n'+banner); srv.kill(); process.exit(1); }

const c = net.connect(sock); let buf=''; const pend=new Map(); let id=0;
c.on('data', d => { buf += d;
  let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0,i); buf = buf.slice(i+1);
    if (!line.trim()) continue; const m = JSON.parse(line);
    if (m.id != null && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } } });
const call = (method, params={}) => new Promise(res => { const n = ++id;
  pend.set(n, res); c.write(JSON.stringify({jsonrpc:'2.0', id:n, method, params})+'\n'); });
await new Promise(r => c.once('connect', r));

const init = await call('initialize', { clientCapabilities: { events: true } });
const r = init.result ?? {};
console.log('--- BANNER LINES MENTIONING methods/aether ---');
console.log(banner.split('\n').filter(l=>/method|aether/i.test(l)).join('\n') || '(none)');
console.log('--- initialize result KEYS ---');
console.log(Object.keys(r).sort().join(', '));
console.log('--- methods array length (does NOT trust the banner) ---');
console.log('methods.length =', Array.isArray(r.methods) ? r.methods.length : '(not an array)');
console.log('--- serverBuild ---');
console.log(JSON.stringify(r.serverBuild, null, 2));
console.log('--- implementation ---');
console.log(JSON.stringify(r.implementation, null, 2));
console.log('--- capabilities ---');
console.log(JSON.stringify(r.capabilities, null, 2));
console.log('--- serverName / serverVersion ---');
console.log('serverName =', JSON.stringify(r.serverName), ' serverVersion =', JSON.stringify(r.serverVersion));
srv.kill(); process.exit(0);
