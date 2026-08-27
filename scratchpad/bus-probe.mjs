// Headless Aether probe: spawn our OWN oracle-aether on a private socket,
// do the two-message handshake, print the advertised method list.
// Never touches the default socket chain, so the owner's window is untouched.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROM = process.argv[2];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-bus-'));
const sock = path.join(dir, 'o.sock');
const BIN = '../oracle/target/release/oracle-aether';

const srv = spawn(BIN, [ROM, '--socket', sock], { stdio: ['ignore', 'pipe', 'pipe'] });
let banner = '';
srv.stdout.on('data', d => { banner += d; });
srv.stderr.on('data', d => { banner += d; });

const waitFor = async (p, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fs.existsSync(p)) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
};

if (!await waitFor(sock)) { console.log('NO SOCKET APPEARED\nbanner:', banner); srv.kill(); process.exit(1); }

const c = net.connect(sock);
let buf = '';
const pending = new Map();
let id = 0;
c.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
const call = (method, params = {}) => new Promise(res => {
  const myId = ++id;
  pending.set(myId, res);
  c.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
});
const notify = (method, params = {}) =>
  c.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');

await new Promise(r => c.once('connect', r));
const init = await call('initialize', { clientCapabilities: { events: true } });
notify('initialized', {});

const r = init.result || {};
console.log('serverName   :', r.serverName);
console.log('serverVersion:', r.serverVersion);
console.log('implementation:', r.implementation);
console.log('serverBuild  :', JSON.stringify(r.serverBuild));
const methods = r.methods || r.capabilities?.methods || [];
console.log('methodCount  :', methods.length);
console.log('--- layer/attribution methods ---');
for (const m of methods) if (/layer|attribution|screenshot|vram|cram/i.test(m)) console.log('   ', m);
console.log('--- all ---');
console.log(methods.join(' '));
fs.writeFileSync('scratchpad/bus-probe-methods.json', JSON.stringify({ init: r, sock }, null, 2));
console.log('\nSOCKET:', sock, ' SRVPID:', srv.pid);
process.exit(0);
