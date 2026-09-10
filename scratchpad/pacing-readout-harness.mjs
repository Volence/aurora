#!/usr/bin/env node
/**
 * pacing-readout-harness — Aurora is §11.42's named reviewer, and this is the
 * client the spec's adoption condition waits on: *"CR-S closes when a client
 * reads a figure from the owner's live window over the bus"*.
 *
 * It is READ-ONLY by construction. The only methods it sends are `initialize`,
 * the `initialized` notification, and `emulator/pacing` — none of which is in
 * the server's `require_paused` set and none of which moves the machine. It is
 * pointed at a window a person is USING, so nothing here may change its state.
 *
 * WHY THE READ RATE IS LOW AND IS NOT A KNOB. §11.42 M1 chose a method over an
 * event *because* "an event would tax a window the owner is using per frame, a
 * method costs one drain per call at the caller's rate." The caller's rate is
 * therefore the safety argument, not an implementation detail — so this reads
 * a handful of times, seconds apart, and prints the machine's load beside each
 * figure so a reader can see what the box was doing when the number was taken.
 *
 * TWO SHAPES THAT LOOK LIKE DEFECTS AND ARE THE SPEC (M3, S2). `fps.value` of
 * 0.0 over an elapsed window is a MEASURED zero — a fact about the window, not
 * an unmeasured arm. `frameTimeMs.samples: 0` with `p50`/`p99` ABSENT is
 * correct; the percentile pair is present exactly when samples is above 0.
 * Rows below assert the conditional in BOTH directions rather than assuming
 * which arm the live window happens to be in.
 *
 *   node scratchpad/pacing-readout-harness.mjs
 *   node scratchpad/pacing-readout-harness.mjs --socket /tmp/oracle-mcp-x/oracle.sock --expect-absent
 *
 * The second form is the CONTROL, and it is what makes the membership row
 * discriminating: M4 says only a process that PRESENTS frames advertises
 * `emulator/pacing`, so a headless `oracle-aether` must not. Without it, "the
 * method is served here" is a row that cannot fail.
 */

import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const EXPECT_ABSENT = flag('--expect-absent');
const READS = Number(opt('--reads', '4'));
const GAP_MS = Number(opt('--gap-ms', '2000'));

/**
 * The socket chain, spelled the way `src/main/aether/socket-path.ts` spells it:
 * SELECTED by env-var presence, never searched, and the step that answered is
 * printed. Nothing here stats or probes alternatives — a dead path must fail
 * loudly at connect rather than silently resolving to a different machine.
 */
function resolveSocket(env) {
  const explicit = opt('--socket', null);
  if (explicit) return { path: explicit, step: '--socket argument' };
  for (const name of ['ORACLE_SOCKET', 'EXODUS_SOCKET']) {
    const v = env[name];
    if (v !== undefined && v !== '') return { path: v, step: `$${name}` };
  }
  const xdg = env.XDG_RUNTIME_DIR;
  if (xdg !== undefined && xdg !== '') return { path: `${xdg}/oracle.sock`, step: '$XDG_RUNTIME_DIR/oracle.sock' };
  return { path: '/tmp/oracle.sock', step: '/tmp/oracle.sock (chain fallback)' };
}

/**
 * WHICH PROCESS ANSWERS THIS SOCKET — the one identity a server cannot forge,
 * because this side chose the path (protocol §2.1/§11.44: `serverName` is a
 * build-time constant and cannot discriminate two processes). Read from the
 * kernel, not from the handshake: the listening inode in /proc/net/unix, then
 * whichever pid holds it.
 */
function listenerOf(sockPath) {
  let inode = null;
  try {
    for (const line of fs.readFileSync('/proc/net/unix', 'utf8').split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 8) continue;
      const st = parts[5];              // 01 = listening
      const ino = parts[6];
      const path = parts.slice(7).join(' ');
      if (path === sockPath && st === '01') { inode = ino; break; }
    }
  } catch { return { pid: null, argv: null, why: '/proc/net/unix unreadable' }; }
  if (inode === null) return { pid: null, argv: null, why: 'no LISTENING entry for that path' };

  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    let fds;
    try { fds = fs.readdirSync(`/proc/${pid}/fd`); } catch { continue; }
    for (const fd of fds) {
      let link;
      try { link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { continue; }
      if (link === `socket:[${inode}]`) {
        let argv = null;
        try { argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim(); } catch { /* gone */ }
        return { pid: Number(pid), argv, why: null };
      }
    }
  }
  return { pid: null, argv: null, why: `inode ${inode} listening but held by no readable pid` };
}

class Link {
  constructor(sock) {
    this.sock = sock;
    this.buf = '';
    this.pending = new Map();
    this.nextId = 1;
    sock.setEncoding('utf8');
    sock.on('data', (chunk) => {
      this.buf += chunk;
      let nl;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl);
        this.buf = this.buf.slice(nl + 1);
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
          else resolve(msg.result);
        }
      }
    });
  }
  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sock.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`timeout waiting for ${method}`));
      }, 10000);
    });
  }
  notify(method, params) {
    this.sock.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }
  close() { this.sock.destroy(); }
}

const rows = [];
const row = (id, ok, what) => { rows.push({ id, ok, what }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}  ${what}`); };
const load = () => os.loadavg().map((n) => n.toFixed(2)).join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { path: sockPath, step } = resolveSocket(process.env);
  console.log(`pacing-readout-harness: socket ${sockPath}`);
  console.log(`  step that answered: ${step}`);
  console.log(`  mode: ${EXPECT_ABSENT ? 'CONTROL (expect emulator/pacing ABSENT)' : 'READ (expect emulator/pacing served)'}`);

  const who = listenerOf(sockPath);
  console.log(`  listener: ${who.pid ? `pid ${who.pid} — ${who.argv}` : `UNKNOWN (${who.why})`}`);
  console.log(`  load at start: ${load()}`);
  console.log('');

  const presenting = who.argv !== null && /oracle-player/.test(who.argv);
  row('1a', who.pid !== null,
    `the socket has a readable listening process${who.pid ? ` (pid ${who.pid})` : ''} — the identity the handshake cannot forge`);
  row('1b', EXPECT_ABSENT ? !presenting : presenting,
    EXPECT_ABSENT
      ? `the control's listener is NOT a presenting process (${presenting ? 'it is oracle-player — wrong socket' : 'headless oracle-aether'})`
      : `the listener IS a presenting process (oracle-player), which is what M4 scopes advertisement to`);

  const sock = await new Promise((resolve, reject) => {
    const s = net.connect(sockPath);
    s.once('connect', () => resolve(s));
    s.once('error', reject);
  });
  const link = new Link(sock);

  const init = await link.request('initialize', {
    protocolVersion: 1,
    clientName: 'aurora',
    clientVersion: '0.1.0',
    clientCapabilities: { events: true },
  });
  link.notify('initialized');

  const methods = init.methods ?? [];
  const impl = init.implementation ?? null;
  const build = init.serverBuild ?? null;
  console.log(`  implementation: ${impl ?? 'UNIDENTIFIED'} · build ${build ? `${build.id?.slice(0, 12)} (${build.source}${build.dirty ? ', dirty' : ''})` : 'unstated'} · ${methods.length} methods`);
  console.log('');

  row('2a', impl !== null,
    `handshake states \`implementation\` (${impl ?? 'ABSENT'}) — read that, never \`serverName\` (${init.serverName ?? 'unset'})`);
  // MEMBERSHIP, NEVER A COUNT AND NEVER A PINNED LIST — the CR's own flagged
  // hazard (`F-BANNER-INVITES-A-PIN`) on a surface whose served set is
  // deployment-dependent by design.
  const advertises = methods.includes('emulator/pacing');
  row('2b', EXPECT_ABSENT ? !advertises : advertises,
    EXPECT_ABSENT
      ? `M4: a headless server does NOT advertise emulator/pacing (advertised: ${advertises})`
      : `M4: this presenting process advertises emulator/pacing (membership test, not a total)`);

  if (EXPECT_ABSENT) {
    // The control stops here on purpose. Calling a method the server did not
    // advertise would measure the server's error path, which is a different
    // claim from the one this run makes.
    link.close();
    return finish();
  }

  const samples = [];
  for (let i = 0; i < READS; i++) {
    const at = Date.now();
    const p = await link.request('emulator/pacing', {});
    samples.push({ at, load: load(), p });
    console.log(`  read ${i + 1}/${READS}  load ${samples[i].load}  ${JSON.stringify(p)}`);
    if (i < READS - 1) await sleep(GAP_MS);
  }
  console.log('');

  const first = samples[0].p;

  // M1 — every number named as the quantity it is; targetFps REQUIRED so a
  // paced 60 and a free-running 60 cannot be read as the same fact.
  row('3a', typeof first.presented === 'number' && typeof first.targetFps === 'number',
    `M1: \`presented\` and \`targetFps\` both present and numeric (presented=${first.presented}, targetFps=${first.targetFps})`);

  // M2 — fps is an object; the window is part of the quantity.
  const fps = first.fps;
  row('3b', fps !== null && typeof fps === 'object' && typeof fps.value === 'number' && typeof fps.windowMs === 'number',
    `M2: \`fps\` is {value,windowMs}, never a bare number (${JSON.stringify(fps)})`);

  // M3 — unmeasured is expressible and MUST NOT be a zero; `underruns` present
  // exactly when unmeasured is false. Asserted as an iff, in both directions.
  const audio = first.audio ?? {};
  const audioOk = typeof audio.unmeasured === 'boolean'
    && (audio.unmeasured === false ? typeof audio.underruns === 'number' : audio.underruns === undefined);
  row('3c', audioOk,
    `M3: \`audio.unmeasured\` required, \`underruns\` present iff it is false (${JSON.stringify(audio)})`);

  // M3/S2 — the percentile pair is present exactly when samples is above 0.
  const ft = first.frameTimeMs ?? {};
  const ftOk = typeof ft.samples === 'number'
    && (ft.samples > 0
      ? typeof ft.p50 === 'number' && typeof ft.p99 === 'number'
      : ft.p50 === undefined && ft.p99 === undefined);
  row('3d', ftOk,
    `M3/S2: \`frameTimeMs.samples\` required, p50/p99 present iff samples>0 (${JSON.stringify(ft)})`);

  // THE ANTI-VACUOUS ROW, and the one this whole run exists for. A schema-shaped
  // reply proves the fields; it does not prove the numbers are being MEASURED.
  // `presented` is frames put on the glass, so on a window that is drawing it
  // must ADVANCE between two reads seconds apart. A constant across varied
  // sampling instants is exactly the confound shape — it would mean the field is
  // a literal, and every row above would still pass.
  const advanced = samples[samples.length - 1].p.presented - first.presented;
  const elapsedMs = samples[samples.length - 1].at - samples[0].at;
  row('4a', advanced > 0,
    `presented ADVANCED across ${(elapsedMs / 1000).toFixed(1)}s of wall clock: ${first.presented} → ${samples[samples.length - 1].p.presented} (+${advanced}) — a live measurement, not a literal`);

  // The figure itself, which is what §11.42's adoption condition asks a client
  // to read from the owner's live window.
  const fpsSeries = samples.map((s) => `${s.p.fps.value.toFixed(2)} (load ${s.load.split(' ')[0]})`).join(', ');
  row('4b', samples.every((s) => typeof s.p.fps.value === 'number'),
    `THE FIGURE, from the owner's live window: fps ${fpsSeries} over a ${fps.windowMs}ms window, target ${first.targetFps}`);

  link.close();
  return finish();
}

function finish() {
  const passed = rows.filter((r) => r.ok).length;
  console.log('');
  console.log(`pacing-readout-harness: ${passed}/${rows.length}`);
  console.log(`  load at end: ${load()}`);
  process.exitCode = passed === rows.length ? 0 : 1;
}

main().catch((e) => {
  console.error(`pacing-readout-harness: UNMEASURABLE — ${e.message}`);
  process.exitCode = 2;
});
