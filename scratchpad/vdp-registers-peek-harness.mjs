#!/usr/bin/env node
// ===========================================================================
// DOES ORACLE'S `emulator/read_vdp_registers` CONFORM, AND IS IT REALLY A PEEK?
// ===========================================================================
//
//     npm run harness:vdp-registers-peek
//
// Row CR-R-VDP-REGISTERS. Oracle began serving the method on 2026-09-05 and
// nobody on this side had verified the serve. This file is aurora's
// independent witness, over the wire, against a REAL oracle-aether.
//
// WHERE THE EXPECTATIONS COME FROM. Every one is transcribed from empyrean
// `contract/protocol.md` read at a COMMITTED revision (`git show
// origin/main:contract/protocol.md`, tip abcff97 when this was written), never
// from a passing reply and never from the sibling working tree, which serves
// whatever is mid-edit. Two places in that document govern:
//
//   * the catalog row, protocol.md line 1388 (VRAM / CRAM / layers):
//       `raw[]` (exactly 24 entries, index-ordered 0-23, each one register as a
//       two-hex-digit `0x..` string), `status{raw}` (the status word as a
//       four-hex-digit `0x....` string). A pure read and a PEEK, never a
//       status-port read: it MUST NOT clear the control-port write-pending
//       toggle, drain the FIFO, or clear the sprite-overflow and collision
//       latches, and it MUST NOT be refused on a free-running machine. Reports
//       live state, never the retained frame's. `decoded{}` struck.
//   * section 8 item 29, protocol.md line 2473, the peek rule.
//
// >>> WHY THE HASH ROW ALONE WOULD BE WORTHLESS, AND WHY THIS FILE HAS TEN
// >>> OTHER ROWS.
//
// Item 29 states the three peek clauses and then states, in the contract's own
// text, that they are INDEPENDENT and that a harness must assert all three:
//
//     "the hash clause alone cannot see a violation, because `state_hash`
//      covers VRAM, CRAM, VSRAM and the register bytes and the toggle and
//      latches live in none of those (oracle's serve proved it: swapping the
//      peek for a status-port read left the hash row green)"
//
// So a harness whose only peek row is "state_hash.combined did not move" is
// KNOWN-VACUOUS IN ADVANCE, by measurement, by the people who wrote the server.
// This file does not take that on trust either: row h2 REPRODUCES it from the
// client side. It makes the guest execute a real `$C00004` status read, watches
// both sticky latches go from set to clear, and shows that all five state_hash
// fingerprints are byte-identical across that clearing. The hash row is present
// because item 29 asks for it, and h2 is the label on the jar saying what it
// cannot see.
//
// The other two clauses use item 29's own game-agnostic recipes rather than
// anything invented here:
//   toggle  write one control word so the toggle is pending, call the method,
//           write the second word, assert the command completed as one.
//   latches with sprite-overflow and collision set, call twice and assert both
//           bits still read set in `status.raw`.
//
// >>> `raw[]` IS THE EMULATOR'S RECORD OF WRITE-ONLY REGISTERS.
//
// The row's closing sentence, and it is not the same statement as the peek
// rule: the reply "MUST NOT be read as what a `$C00004` status read would have
// returned, since a real read there clears flags this method leaves standing."
// The 24 registers are write-only on real hardware; this is the emulator's
// record of what was written to them. `status.raw` is hardware-readable, but a
// real read at that port clears flags this method deliberately leaves alone.
// Rows l2 and l3 are exactly the two halves of that sentence, measured.
//
// >>> HOW THE MACHINE IS REACHED, AND WHAT IS NEVER TOUCHED.
//
// Our OWN headless oracle-aether, one per fixture, on a private mkdtemp socket
// passed with `--socket`. It never consults the default socket chain and never
// reads `ORACLE_SOCKET`, so the owner's on-screen window is untouched. The
// binary is resolved through `siblingPathOrUnresolved`, never typed. No
// Electron, no Aurora, no X: the only processes launched are emulators, each
// killed by the handle this file holds, with an exit net behind it.
//
// >>> THE FIXTURES ARE FOUR HAND-ASSEMBLED ROMs, BUILT HERE.
//
// Nothing here uses a game. Item 29's recipes need a machine in a state no
// commercial ROM reaches on cue, so this file assembles four tiny 68000 images
// (a reset vector and a handful of instructions each) and boots a server on
// each. That is also what makes the red controls possible without touching
// oracle's repo: a control is a DIFFERENT ROM, or a different instruction, on
// the same server build.
//
// >>> RED CONTROLS, AND THE ONE ROW THAT HAS NONE.
//
// Oracle is another lane's repo and must not be written to, so no row here is
// proven red by breaking the server. Each row says instead what was done:
//
//   s7  the shape validator is run over six SYNTHETIC replies (literals in this
//       file) and must reject every one, by name. Same function as s1..s6 read
//       the live reply through, so this is not two strings of mine agreeing.
//   t2  a second ROM whose FIRST control word is replaced by two NOPs. That is
//       precisely the machine state a toggle-clearing peek would leave, and the
//       t1 assertion goes red on it.
//   l3  the SAME machine as l2, one instruction later: the guest executes a
//       real `move.w ($C00004),d0`. Both latches clear. So the bits are
//       clearable here, the assertion can fail, and the peek did not do it.
//   f2  on the same free-running machine, a method that DOES require a paused
//       one is refused. Without it, f1 is green just as readily over a harness
//       that could not see a refusal.
//   v1  is its own control: a reply that was the RETAINED frame's could not
//       give two different status words at two instants inside one frame.
//   h1  has no red control that a client can build. `state_hash` cannot see the
//       only thing this method could plausibly disturb (h2 measures that), and
//       there is no client-reachable action that moves the hash without moving
//       the machine. This is stated as an UNPROVEN red rather than dressed up.
//
// LOUD ON UNMEASURABLE. A missing binary, a server that will not listen, an
// absent method, or a fixture precondition that did not take (both latches must
// be SET before l2 means anything) is BLOCKED or UNMEASURABLE and never green.

import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';

const METHOD = 'emulator/read_vdp_registers';
const SERVER = siblingPathOrUnresolved('oracle', 'target/release/oracle-aether');

const results = [];
const fails = [];
const blocked = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok });
  if (!ok) fails.push(id);
}
function stop(id, kind, why) {
  console.log(`${kind}  [${id}] ${why}`);
  results.push({ id, ok: false });
  blocked.push(`${id}: ${kind} ${why}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// A 68000 assembler just large enough for the four fixtures
// ---------------------------------------------------------------------------
// Opcodes are spelled out rather than emitted by a table so a reader can check
// each one against a 68000 manual:
//   41F9 xxxxxxxx  lea (xxx).l,a0        43F9 xxxxxxxx  lea (xxx).l,a1
//   30BC iiii      move.w #iiii,(a0)     32BC iiii      move.w #iiii,(a1)
//   3010           move.w (a0),d0        4E71           nop
//   4239 xxxxxxxx  clr.b (xxx).l         4A39 xxxxxxxx  tst.b (xxx).l
//   67 dd          beq.s *+2+dd          60FE           bra.s * (spin)
const CTRL_PORT = 0x00C00004;
const DATA_PORT = 0x00C00000;
const RESET_SSP = 0x00FFFFFE;
const RESET_PC = 0x00000200;
const FLAG_ADDR = 0x00FF0000; // a work-RAM byte this harness pokes to release a spin

function assembler(size = 0x800) {
  const rom = Buffer.alloc(size);
  rom.writeUInt32BE(RESET_SSP, 0x0);
  rom.writeUInt32BE(RESET_PC, 0x4);
  let p = RESET_PC;
  return {
    rom,
    w: (v) => { rom.writeUInt16BE(v & 0xFFFF, p); p += 2; },
    l: (v) => { rom.writeUInt32BE(v >>> 0, p); p += 4; },
    b: (v) => { rom.writeUInt8(v & 0xFF, p); p += 1; },
    at: () => p,
  };
}

/**
 * FIXTURE 1 and 2: the split control word.
 *
 * A two-word VRAM-write command issued as two SEPARATE instructions, with the
 * data write behind it. Stopping between them leaves the control-port
 * write-pending toggle ARMED, which is the state item 29 names.
 *
 * `arm: false` replaces the first control word with two NOPs, keeping every
 * later address identical. That is the red control: the second word then lands
 * on a machine with the toggle NOT armed, which is exactly what a
 * toggle-clearing peek would produce, and the word never reaches TARGET.
 */
const SPLIT_TARGET = 0x0100; // VRAM byte address the completed command aims at
const SPLIT_WORD = 0xBEEF;
function splitControlWordRom(arm) {
  const a = assembler();
  a.w(0x41F9); a.l(CTRL_PORT);
  a.w(0x43F9); a.l(DATA_PORT);
  a.w(0x30BC); a.w(0x8174);                  // reg 1: display on, M5, DMA enable
  a.w(0x30BC); a.w(0x8F02);                  // reg 15: autoincrement 2
  // Word 1 of a VRAM-write command at SPLIT_TARGET: CD1..CD0 = 01 in bits
  // 15..14, A13..A0 in the low 14. Word 2 carries CD5..CD2 and A15..A14.
  const word1 = 0x4000 | (SPLIT_TARGET & 0x3FFF);
  const word2 = (SPLIT_TARGET >> 14) & 0x0003;
  if (arm) { a.w(0x30BC); a.w(word1); } else { a.w(0x4E71); a.w(0x4E71); }
  const secondWordPc = a.at();
  a.w(0x30BC); a.w(word2);
  a.w(0x32BC); a.w(SPLIT_WORD);
  const endPc = a.at();
  a.w(0x60FE);
  return { rom: a.rom, secondWordPc, endPc };
}

/**
 * FIXTURE 3: a rendering machine that can be made to perform a real status read.
 *
 * Sets the VDP up for H40 with the display on and the sprite attribute table at
 * $F800, then spins on a work-RAM flag. Poking that flag releases it into a
 * single `move.w ($C00004),d0`, which is a genuine status-port read and the one
 * thing on this bus that clears the sticky sprite latches. It is the red
 * control for l2 and the instrument for h2.
 *
 * `clr.b` on the flag first because work RAM is RANDOMIZED at power-on: the
 * first draft of this ROM omitted it, the flag booted non-zero, the guest ran
 * straight through its status read before the harness ever got there, and the
 * "red" control moved nothing.
 */
const SAT_BASE = 0xF800;
const SOLID_TILE = 1;
const SPRITE_COUNT = 24; // H40 admits 20 per line, so 24 overflows; all overlap, so they collide
function renderingRom() {
  const a = assembler();
  a.w(0x41F9); a.l(CTRL_PORT);
  // Register 1 FIRST: while M5 is clear the register mask discards writes above
  // register 10, so a $10 written ahead of it is silently dropped.
  const REGS = [
    [0x01, 0x74], // display on, M5, DMA enable, VINT enable
    [0x00, 0x04],
    [0x02, 0x30], // plane A nametable at $C000
    [0x03, 0x00],
    [0x04, 0x07], // plane B nametable at $E000
    [0x05, SAT_BASE >> 9], // sprite attribute table at $F800
    [0x07, 0x00],
    [0x0A, 0xFF],
    [0x0B, 0x00],
    [0x0C, 0x81], // H40
    [0x0D, 0x2C], // hscroll table at $B000
    [0x0F, 0x02], // autoincrement 2
    [0x10, 0x01], // 64 x 32 cell planes
    [0x11, 0x00],
    [0x12, 0x00],
  ];
  for (const [r, v] of REGS) { a.w(0x30BC); a.w(0x8000 | (r << 8) | v); }
  a.w(0x4239); a.l(FLAG_ADDR);
  const spinPc = a.at();
  a.w(0x4A39); a.l(FLAG_ADDR);
  a.b(0x67); a.b(0xF8);              // beq.s spinPc
  const statusReadPc = a.at();
  a.w(0x3010);                       // move.w ($C00004),d0 : a REAL status-port read
  const afterStatusReadPc = a.at();
  a.w(0x60FE);
  return { rom: a.rom, spinPc, statusReadPc, afterStatusReadPc };
}

/**
 * FIXTURE 4: the index-order marker machine.
 *
 * Writes a value unique to its own index into every one of registers 0..23, so
 * `raw[i]` has exactly one correct answer and a rotated, reversed or truncated
 * array cannot pass. The marker keeps bit 2 set in every value so that register
 * 1 (written first) leaves M5 on and the writes above register 10 are not
 * discarded.
 */
const marker = (i) => ((i << 3) | 0x04) & 0xFF;
function markerRom() {
  const a = assembler();
  a.w(0x41F9); a.l(CTRL_PORT);
  a.w(0x30BC); a.w(0x8100 | marker(1));
  for (let i = 0; i < 24; i++) {
    if (i === 1) continue;
    a.w(0x30BC); a.w(0x8000 | (i << 8) | marker(i));
  }
  a.w(0x60FE);
  return { rom: a.rom };
}

// ---------------------------------------------------------------------------
// One server per fixture, on a private socket
// ---------------------------------------------------------------------------
const live = new Set();
async function killServer(srv) {
  if (!srv || srv.exitCode !== null || srv.signalCode !== null) return;
  const gone = new Promise((r) => srv.once('exit', r));
  try { srv.kill('SIGKILL'); } catch { /* already gone */ }
  // Wait for the EVENT, never a fixed duration: a sleep cannot escalate and
  // cannot report that the tree is still up.
  await Promise.race([gone, (async () => { for (let i = 0; i < 100 && srv.exitCode === null; i++) await sleep(50); })()]);
}
process.on('exit', () => { for (const s of live) { try { s.kill('SIGKILL'); } catch { /* gone */ } } });

async function boot(work, name, rom) {
  const romPath = path.join(work, `${name}.bin`);
  fs.writeFileSync(romPath, rom);
  const sock = path.join(work, `${name}.sock`);
  const srv = spawn(SERVER, [romPath, '--socket', sock, '--no-pace'], { stdio: ['ignore', 'pipe', 'pipe'] });
  live.add(srv);
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120 && !fs.existsSync(sock); i++) await sleep(50);
  if (!fs.existsSync(sock)) { await killServer(srv); live.delete(srv); return { failed: `server never listened on ${sock}: ${log.trim()}` }; }

  const c = net.connect(sock);
  let buf = '';
  const pending = new Map();
  let id = 0;
  c.on('error', () => { /* reported through the call that times out */ });
  c.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  await new Promise((r) => c.once('connect', r));
  const raw = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    const t = setTimeout(() => { pending.delete(i); rej(new Error(`${method} did not answer in 20s`)); }, 20000);
    pending.set(i, (m) => { clearTimeout(t); res(m); });
    c.write(`${JSON.stringify({ jsonrpc: '2.0', id: i, method, params })}\n`);
  });
  const hs = await raw('initialize', { client: { name: 'aurora-vdpreg-harness', version: '1' }, protocolVersion: 1 });
  const ok = async (method, params) => {
    const m = await raw(method, params);
    if (m.error) throw new Error(`${method} answered ${m.error.code}: ${m.error.message}`);
    return m.result;
  };
  const close = async () => { try { c.destroy(); } catch { /* gone */ } await killServer(srv); live.delete(srv); };
  return { raw, ok, handshake: hs.result, close, log: () => log };
}

const hex32 = (n) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
const hex16 = (n) => `0x${(n & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}`;

// ---------------------------------------------------------------------------
// The shape validator: ONE function, read by the live rows and by s7's poisons
// ---------------------------------------------------------------------------
// Every clause is the catalog row's own words. It returns a list of violations
// so a row can name what was wrong rather than printing a bare false.
const BYTE_RE = /^0x[0-9A-Fa-f]{2}$/;
const WORD_RE = /^0x[0-9A-Fa-f]{4}$/;
// The envelope keys every reply carries (protocol.md section 2.2 stamp and
// section 2.3 droppedEvents). They are not part of this row's result and must
// not be counted as extra keys.
const ENVELOPE = new Set(['frame', 'mclk', 'running', 'droppedEvents', 'stampCached', 'stoppedAtFrame', 'stoppedAtMclk']);

function shapeViolations(result) {
  const v = [];
  if (result === null || typeof result !== 'object') { v.push('result is not an object'); return v; }
  if (!Array.isArray(result.raw)) v.push('raw is not an array');
  else {
    if (result.raw.length !== 24) v.push(`raw has ${result.raw.length} entries, the row says exactly 24`);
    const bad = result.raw
      .map((e, i) => (typeof e === 'string' && BYTE_RE.test(e) ? null : `raw[${i}]=${JSON.stringify(e)}`))
      .filter(Boolean);
    if (bad.length) v.push(`not a two-hex-digit 0x.. string: ${bad.join(' ')}`);
  }
  if (result.status === null || typeof result.status !== 'object' || Array.isArray(result.status)) v.push('status is not an object');
  else {
    if (!WORD_RE.test(String(result.status.raw))) v.push(`status.raw=${JSON.stringify(result.status.raw)} is not a four-hex-digit 0x.... string`);
    const extra = Object.keys(result.status).filter((k) => k !== 'raw');
    if (extra.length) v.push(`status carries key(s) beyond raw: ${extra.join(' ')}`);
  }
  if ('decoded' in result) v.push('decoded is present; section 11.41 M1 STRUCK it');
  const extraTop = Object.keys(result).filter((k) => k !== 'raw' && k !== 'status' && !ENVELOPE.has(k));
  if (extraTop.length) v.push(`result carries unexpected top-level key(s): ${extraTop.join(' ')}`);
  return v;
}

// Six synthetic replies, each wrong in exactly one way the row forbids. These
// are DATA, not server output: they exist so s7 can prove the validator above
// is not a function that returns [] for everything.
function conformingSynthetic() {
  return {
    raw: Array.from({ length: 24 }, (_, i) => `0x${i.toString(16).toUpperCase().padStart(2, '0')}`),
    status: { raw: '0x02E4' },
    frame: 4, mclk: 1, running: false, droppedEvents: 0,
  };
}
const POISONS = [
  ['23 entries', () => { const r = conformingSynthetic(); r.raw.pop(); return r; }, /exactly 24/],
  ['25 entries', () => { const r = conformingSynthetic(); r.raw.push('0x00'); return r; }, /exactly 24/],
  ['an unprefixed register byte', () => { const r = conformingSynthetic(); r.raw[7] = '74'; return r; }, /two-hex-digit/],
  ['a three-digit status word', () => { const r = conformingSynthetic(); r.status.raw = '0x2E4'; return r; }, /four-hex-digit/],
  ['a second key in status', () => { const r = conformingSynthetic(); r.status.vblank = true; return r; }, /beyond raw/],
  ['a resurrected decoded{}', () => { const r = conformingSynthetic(); r.decoded = { h40: true }; return r; }, /STRUCK/],
];

// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(SERVER)) {
    stop('p1', 'BLOCKED', `the oracle-aether binary is not at ${SERVER}. It is another lane's build artifact and this harness must not run cargo.`);
    return;
  }
  check('p1', 'the oracle-aether binary resolves through the resolver and is on disk', true, SERVER);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aur-vdpreg-'));
  const sessions = [];
  try {
    // ---- fixture 4: shape and index order -------------------------------
    const mk = await boot(work, 'marker', markerRom().rom);
    if (mk.failed) { stop('p2', 'BLOCKED', mk.failed); return; }
    sessions.push(mk);

    const advertised = mk.handshake?.methods ?? [];
    if (!advertised.includes(METHOD)) {
      stop('p2', 'BLOCKED', `${METHOD} is not in this server's own initialize reply. ${advertised.length} methods advertised; nothing below can be measured.`);
      return;
    }
    // A COUNT IS NOT A CAPABILITY: this row is a precondition, not evidence
    // about what the method returns. Everything after it is the evidence.
    check('p2', `the server advertises ${METHOD} in its own handshake (precondition, not a capability claim)`,
      true, `${advertised.length} methods advertised (REPORTED, matched against nothing).\n`
      + `        implementation=${mk.handshake?.implementation ?? '?'} serverBuild.id=${mk.handshake?.serverBuild?.id ?? '?'}`
      + `${mk.handshake?.serverBuild?.dirty ? ' DIRTY' : ''} source=${mk.handshake?.serverBuild?.source ?? '?'}`
      + ` protocolVersion=${mk.handshake?.protocolVersion ?? '?'}`);

    await mk.ok('emulator/run_frames', { frames: 1 });
    const shaped = await mk.ok(METHOD);
    const viol = shapeViolations(shaped);

    check('s1', 'raw[] is an array of EXACTLY 24 entries',
      Array.isArray(shaped.raw) && shaped.raw.length === 24,
      `length=${Array.isArray(shaped.raw) ? shaped.raw.length : 'not an array'}`);
    check('s2', 'every entry is one register as a two-hex-digit 0x.. string',
      Array.isArray(shaped.raw) && shaped.raw.every((e) => typeof e === 'string' && BYTE_RE.test(e)),
      `${JSON.stringify(shaped.raw)}`);

    const expected = Array.from({ length: 24 }, (_, i) => `0x${marker(i).toString(16).toUpperCase().padStart(2, '0')}`);
    const got = (shaped.raw ?? []).map((e) => String(e).toUpperCase().replace('0X', '0x'));
    const mism = expected.map((e, i) => (e === got[i] ? null : `[${i}] want ${e} got ${got[i]}`)).filter(Boolean);
    check('s3', 'raw[] is INDEX-ORDERED 0 to 23: every index carries the marker this ROM wrote to that register',
      mism.length === 0,
      mism.length === 0
        ? `24 unique markers, all in place: ${got.join(' ')}`
        : `${mism.length} mismatch(es): ${mism.join(' · ')}`);

    check('s4', 'status.raw is the status word as a four-hex-digit 0x.... string',
      WORD_RE.test(String(shaped.status?.raw)), `status.raw=${JSON.stringify(shaped.status?.raw)}`);
    check('s5', 'decoded{} is ABSENT: section 11.41 M1 struck it, so a server still sending it is a finding',
      !('decoded' in shaped), `top-level keys: ${Object.keys(shaped).sort().join(' ')}`);
    check('s6', 'status carries no key but raw',
      shaped.status && typeof shaped.status === 'object' && Object.keys(shaped.status).length === 1 && 'raw' in shaped.status,
      `status keys: ${Object.keys(shaped.status ?? {}).join(' ')}`);
    check('s0', 'the live reply has ZERO violations against the whole row, read through one validator',
      viol.length === 0, viol.length === 0 ? 'clean' : viol.join(' · '));

    // ---- s7: the validator can fail -------------------------------------
    const cleanSynthetic = shapeViolations(conformingSynthetic());
    const poisonRows = POISONS.map(([label, make, want]) => {
      const vs = shapeViolations(make());
      return { label, ok: vs.length > 0 && vs.some((s) => want.test(s)), vs };
    });
    check('s7', 'SHAPE RED CONTROL: the same validator passes a conforming synthetic and rejects six poisoned ones, each by name',
      cleanSynthetic.length === 0 && poisonRows.every((r) => r.ok),
      `conforming synthetic: ${cleanSynthetic.length} violation(s)\n        `
      + poisonRows.map((r) => `${r.ok ? 'caught' : 'MISSED'} ${r.label}: ${r.vs.join(' | ') || '(nothing)'}`).join('\n        '));

    // ---- x1: the row's params column is a dash ---------------------------
    const guessed = await mk.raw(METHOD, { reg: 4 });
    check('x1', 'a guessed selection param is REFUSED with -32602, not silently filtered (the row takes no params)',
      guessed.error?.code === -32602 && guessed.result === undefined,
      `code=${guessed.error?.code ?? 'none'} message=${JSON.stringify(guessed.error?.message ?? null)}`);

    // ---- fixture 1: the write-pending toggle ------------------------------
    const armed = splitControlWordRom(true);
    const tog = await boot(work, 'toggle-armed', armed.rom);
    if (tog.failed) { stop('t1', 'BLOCKED', tog.failed); } else {
      sessions.push(tog);
      const at = await tog.ok('emulator/run_to', { addr: hex32(armed.secondWordPc) });
      const before = await tog.ok('emulator/read_vram', { addr: hex16(SPLIT_TARGET), len: 2 });
      if (!at.reached || at.pc !== hex32(armed.secondWordPc)) {
        stop('t1', 'UNMEASURABLE', `could not park the machine between the two control words: reached=${at.reached} pc=${at.pc}`);
      } else if (String(before.bytes).toUpperCase() === `0X${SPLIT_WORD.toString(16).toUpperCase()}`) {
        stop('t1', 'UNMEASURABLE', `VRAM ${hex16(SPLIT_TARGET)} already held ${before.bytes} before the command ran, so the row cannot discriminate`);
      } else {
        for (let i = 0; i < 4; i++) await tog.ok(METHOD);
        await tog.ok('emulator/run_to', { addr: hex32(armed.endPc) });
        const after = await tog.ok('emulator/read_vram', { addr: hex16(SPLIT_TARGET), len: 2 });
        const landed = String(after.bytes).toUpperCase() === `0X${SPLIT_WORD.toString(16).toUpperCase()}`;
        check('t1', 'PEEK CLAUSE 2, the write-pending toggle: a two-word control command begun before four calls still completes as ONE after them',
          landed,
          `parked at ${at.pc} with the toggle armed, called ${METHOD} 4 times, then wrote word 2 and the data word.\n`
          + `        VRAM ${hex16(SPLIT_TARGET)}: ${before.bytes} before, ${after.bytes} after (want 0x${SPLIT_WORD.toString(16).toUpperCase()})`);
      }
    }

    // ---- fixture 2: t2, the toggle red control ---------------------------
    const unarmed = splitControlWordRom(false);
    const tog2 = await boot(work, 'toggle-unarmed', unarmed.rom);
    if (tog2.failed) { stop('t2', 'BLOCKED', tog2.failed); } else {
      sessions.push(tog2);
      await tog2.ok('emulator/run_to', { addr: hex32(unarmed.secondWordPc) });
      for (let i = 0; i < 4; i++) await tog2.ok(METHOD);
      await tog2.ok('emulator/run_to', { addr: hex32(unarmed.endPc) });
      const after = await tog2.ok('emulator/read_vram', { addr: hex16(SPLIT_TARGET), len: 2 });
      const landed = String(after.bytes).toUpperCase() === `0X${SPLIT_WORD.toString(16).toUpperCase()}`;
      check('t2', 'TOGGLE RED CONTROL: with the first control word replaced by NOPs, the identical tail does NOT land the word, so t1 can fail',
        !landed,
        `same instruction addresses, first control word absent (this is the state a toggle-clearing peek leaves).\n`
        + `        VRAM ${hex16(SPLIT_TARGET)} after: ${after.bytes} (t1's assertion evaluates to ${landed} here)`);
    }

    // ---- fixture 3: the latches, the hash, live state, free running -------
    const rr = renderingRom();
    const ren = await boot(work, 'rendering', rr.rom);
    if (ren.failed) { stop('l1', 'BLOCKED', ren.failed); return; }
    sessions.push(ren);

    await ren.ok('emulator/run_frames', { frames: 2 });
    // The sprite attribute table and one solid tile, poked rather than written
    // by the guest. `emulator/write_vram` maintains the SAT cache the renderer
    // reads, so a poked table is walked exactly as a port-written one is.
    await ren.ok('emulator/write_vram', { addr: '0x0020', bytes: `0x${'11111111'.repeat(8)}` });
    let sat = '';
    for (let i = 0; i < SPRITE_COUNT; i++) {
      const link = i === SPRITE_COUNT - 1 ? 0 : i + 1;
      // y = 128 + 64, size = 1x1, tile = SOLID_TILE, x = 128 + 64: every sprite
      // in the same 8x8 box, so the line both overflows (24 > 20 on H40) and
      // collides (opaque over opaque).
      sat += '00C0' + link.toString(16).padStart(4, '0')
           + SOLID_TILE.toString(16).padStart(4, '0') + '00C0';
    }
    await ren.ok('emulator/write_vram', { addr: hex16(SAT_BASE), bytes: `0x${sat}` });
    await ren.ok('emulator/run_frames', { frames: 2 });

    const OVERFLOW = 1 << 6;
    const COLLISION = 1 << 5;
    const statusOf = (r) => parseInt(String(r.status.raw).slice(2), 16);
    const pre = await ren.ok(METHOD);
    const preS = statusOf(pre);
    const bothSet = (preS & OVERFLOW) !== 0 && (preS & COLLISION) !== 0;
    check('l1', 'FIXTURE PRECONDITION: both sticky latches read SET before the rule is tested',
      bothSet,
      `status.raw=${pre.status.raw} overflow(b6)=${(preS & OVERFLOW) !== 0} collision(b5)=${(preS & COLLISION) !== 0}`
      + ` after ${SPRITE_COUNT} overlapping sprites on one H40 line`);

    if (!bothSet) {
      stop('l2', 'UNMEASURABLE', 'the latches were never set, so "they stay set" cannot be measured. Not a pass.');
    } else {
      const seen = [];
      let kept = true;
      for (let i = 0; i < 4; i++) {
        const r = await ren.ok(METHOD);
        const s = statusOf(r);
        seen.push(r.status.raw);
        if ((s & OVERFLOW) === 0 || (s & COLLISION) === 0) kept = false;
      }
      check('l2', 'PEEK CLAUSE 3, the latches: with overflow and collision set, four calls leave BOTH bits still set in status.raw',
        kept, `four replies: ${seen.join(' ')} (b6 and b5 set in every one)`);
    }

    // ---- h1 / h2: the hash clause, and what it cannot see -----------------
    const hashes = [];
    for (let i = 0; i < 4; i++) {
      hashes.push(await ren.ok('emulator/state_hash'));
      await ren.ok(METHOD);
      await ren.ok(METHOD);
    }
    hashes.push(await ren.ok('emulator/state_hash'));
    const fields = ['combined', 'vram', 'cram', 'vsram', 'regs'];
    const moved = fields.filter((f) => hashes.some((h) => h[f] !== hashes[0][f]));
    check('h1', 'PEEK CLAUSE 1, the hash: eight calls on a paused machine leave every state_hash fingerprint byte-identical',
      moved.length === 0,
      `combined=${hashes[0].combined} across ${hashes.length} samples; moved: ${moved.length ? moved.join(' ') : 'none'}`);

    // v1 needs a beam position inside the active display, and it also puts the
    // machine far from the sprite line before h2 steps the guest.
    const line100 = await ren.ok('emulator/run_to_scanline', { line: 100 });
    const at100 = await ren.ok(METHOD);
    const line230 = await ren.ok('emulator/run_to_scanline', { line: 230 });
    const at230 = await ren.ok(METHOD);
    const VBLANK = 1 << 3;
    const s100 = statusOf(at100);
    const s230 = statusOf(at230);
    check('v1', 'LIVE STATE, never the retained frame\'s: two paused instants inside ONE frame give DIFFERENT status words',
      at100.status.raw !== at230.status.raw
      && (s100 & VBLANK) === 0 && (s230 & VBLANK) !== 0
      && line100.frame === line230.frame,
      `line 100: ${at100.status.raw} vblank(b3)=${(s100 & VBLANK) !== 0} · line 230: ${at230.status.raw} vblank(b3)=${(s230 & VBLANK) !== 0}`
      + `\n        frame ${line100.frame} both times, so no frame completed between them. A retained-frame answer could not differ.`);

    // ---- h2: the vacuity disclosure, measured on this machine -------------
    await ren.ok('emulator/run_to_scanline', { line: 100 });
    const beforeRead = await ren.ok(METHOD);
    const hashBefore = await ren.ok('emulator/state_hash');
    await ren.ok('emulator/write_memory', { addr: hex32(FLAG_ADDR), value: 1, width: 1 });
    const ranTo = await ren.ok('emulator/run_to', { addr: hex32(rr.afterStatusReadPc) });
    const afterRead = await ren.ok(METHOD);
    const hashAfter = await ren.ok('emulator/state_hash');
    const bS = statusOf(beforeRead);
    const aS = statusOf(afterRead);
    const cleared = (bS & OVERFLOW) !== 0 && (bS & COLLISION) !== 0
      && (aS & OVERFLOW) === 0 && (aS & COLLISION) === 0;
    const hashStill = fields.every((f) => hashBefore[f] === hashAfter[f]);

    check('l3', 'LATCH RED CONTROL: the guest\'s own move.w ($C00004),d0 CLEARS both bits on this same machine, so l2 has a way to fail',
      cleared && ranTo.reached,
      `one instruction executed at ${hex32(rr.statusReadPc)}, pc now ${ranTo.pc}.\n`
      + `        status.raw ${beforeRead.status.raw} -> ${afterRead.status.raw}; overflow ${(bS & OVERFLOW) !== 0} -> ${(aS & OVERFLOW) !== 0}, collision ${(bS & COLLISION) !== 0} -> ${(aS & COLLISION) !== 0}`);

    check('h2', 'VACUITY DISCLOSURE: that clearing moved NO state_hash fingerprint, so the hash row alone could never have seen it',
      cleared && hashStill,
      `combined ${hashBefore.combined} -> ${hashAfter.combined}; vram/cram/vsram/regs all unchanged: ${hashStill}\n`
      + '        This is item 29\'s own sentence reproduced from the client side: the toggle and the latches live in none of the hashed regions.\n'
      + '        h1 is present because item 29 asks for it. On its own it is not evidence of anything.');

    // ---- f1 / f2: a free-running machine ----------------------------------
    await ren.ok('emulator/resume');
    const run1 = await ren.raw(METHOD);
    await sleep(120);
    const run2 = await ren.raw(METHOD);
    const running = run1.result?.running === true && run2.result?.running === true;
    const advanced = (run2.result?.frame ?? 0) > (run1.result?.frame ?? 0);
    check('f1', 'NOT REFUSED on a free-running machine, and the machine really was free-running',
      run1.error === undefined && run2.error === undefined && running && advanced && shapeViolations(run2.result).length === 0,
      `running=${run1.result?.running}/${run2.result?.running} frame ${run1.result?.frame} -> ${run2.result?.frame}`
      + ` status ${run1.result?.status?.raw} -> ${run2.result?.status?.raw}; the second reply is shape-clean too`);

    const refused = await ren.raw('emulator/write_cram', { line: 0, index: 0, raw: '0x0EEE' });
    check('f2', 'FREE-RUN POSITIVE CONTROL: on that same running machine a paused-only method IS refused, so f1 could have seen a refusal',
      refused.error !== undefined && refused.result === undefined,
      `emulator/write_cram answered code=${refused.error?.code ?? 'none'} reason=${JSON.stringify(refused.error?.data?.reason ?? null)}`);
    await ren.ok('emulator/pause');
  } finally {
    for (const s of sessions) { try { await s.close(); } catch { /* gone */ } }
    for (const s of live) await killServer(s);
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* gone */ }
  }
}

main()
  .catch((e) => { console.error(e); fails.push('threw'); })
  .finally(() => {
    if (blocked.length) {
      console.log(`\nNOT MEASURED (${blocked.length}), and a row that could not be measured is never a pass:`);
      for (const b of blocked) console.log(`  ${b}`);
    }
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} rows passed${fails.length ? ` FAILED: ${fails.join(', ')}` : ''}${blocked.length ? ` BLOCKED/UNMEASURABLE: ${blocked.length}` : ''}`);
    process.exit(fails.length || blocked.length ? 1 : 0);
  });
