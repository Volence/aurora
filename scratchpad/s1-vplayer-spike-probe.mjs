// ITEM 48's GATE: what does poking `v_player` on a RUNNING S1 machine actually cost?
//
// The row says the only route to play-from-cursor on the s1disasm path is poking
// v_player, that this is the link's UNMEASURED SPIKE, and that anyone picking the
// item up measures the spike FIRST — because shipping an unmeasured mechanism
// would reverse the original decline by silence rather than by evidence.
//
// This measures. It does not implement anything.
//
// DISCIPLINE (this repo's bar 4, same-destination-two-ways): every reading is
// taken from ONE checkpoint, and the control path is re-run against ITSELF and
// required to be identical — otherwise the comparison is measuring the
// emulator's nondeterminism rather than the poke.
//
// Own headless server on a private socket. Nothing touches the default chain.
import { spawn } from 'node:child_process';
import net from 'node:net'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const ROM = '../s1disasm/s1built.bin';
const LST = '../s1disasm/sonic.lst';
const BIN = '../oracle/target/release/oracle-aether';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-s1-'));
const sock = path.join(dir, 'o.sock');
const srv = spawn(BIN, [ROM, '--socket', sock], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 150 && !fs.existsSync(sock); i++) await sleep(100);
if (!fs.existsSync(sock)) { console.log('FATAL: no socket\n' + log); process.exit(1); }

const c = net.connect(sock);
let buf = ''; const pend = new Map(); let id = 0;
c.on('data', d => { buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; }
    if (m.id != null && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } } });
const raw = (meth, p = {}) => new Promise(r => { const my = ++id; pend.set(my, r);
  c.write(JSON.stringify({ jsonrpc: '2.0', id: my, method: meth, params: p }) + '\n'); });
const call = async (meth, p = {}) => { const r = await raw(meth, p);
  if (r.error) { console.log(`  !! ${meth} -> ${r.error.code} ${r.error.message}`); return null; }
  return r.result; };
const hex = n => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');

// The reply spells memory as `bytes`, a hex STRING like "0x04000000".
// ⚠ Stripping the prefix with a hex-character class is WRONG and silently shifts
// every byte: 'x' is not a hex digit but the leading '0' of "0x" is, so
// "0x04000000" becomes "004000000" and byte 0 reads as 0x00 instead of 0x04.
// That misread the game mode as the SEGA screen for an entire debugging pass,
// and the position reads carried the identical defect.
const bytesOf = (r) => {
  const d = r?.bytes ?? r?.data ?? r?.hex;
  if (typeof d !== 'string') return Array.isArray(d) ? d : null;
  const h = d.startsWith('0x') || d.startsWith('0X') ? d.slice(2) : d;
  const out = [];
  for (let i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
};
const u16 = (r) => { const b = bytesOf(r); return b && b.length >= 2 ? (b[0] << 8) | b[1] : null; };
const u8 = (r) => { const b = bytesOf(r); return b && b.length >= 1 ? b[0] : null; };

await new Promise(r => c.once('connect', r));
const init = await raw('initialize', { clientCapabilities: { events: true } });
c.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }) + '\n');
console.log(`server: ${init.result.implementation} ${init.result.serverBuild?.id?.slice(0,12)}`);

const sym = await call('emulator/load_symbols', { path: LST });
console.log(`symbols: ${JSON.stringify(sym).slice(0,160)}`);
const vp = await call('emulator/lookup_symbol', { name: 'v_player' });
console.log(`v_player -> ${JSON.stringify(vp)}`);
// The reply spells it `addr` (a hex STRING), not `address` — an earlier version of
// this probe checked `.address`, found undefined, and refused. Refusing was right;
// the field name was not.
const BASE = vp && typeof vp.addr === 'string' ? parseInt(vp.addr, 16) : null;
if (BASE == null) { console.log('BLOCKED: v_player did not resolve; the question is retired to another instrument, not answered'); srv.kill(); process.exit(1); }

// obX/obY are EQUATES, and this listing's equates cannot answer an address lookup
// in either direction — so they are read out of the disassembly's own constants
// file rather than guessed or asked for. Derived, never typed.
const CONSTS = fs.readFileSync('../s1disasm/_Constants.asm', 'utf8');
const equ = (name) => {
  const m = CONSTS.match(new RegExp('^' + name + ':\\s*equ\\s+(\\$?[0-9A-Fa-f]+)', 'm'));
  if (!m) return null;
  return m[1].startsWith('$') ? parseInt(m[1].slice(1), 16) : parseInt(m[1], 10);
};
const OBX = equ('obX'), OBY = equ('obY');
if (OBX == null || OBY == null) { console.log('BLOCKED: obX/obY not found in _Constants.asm'); srv.kill(); process.exit(1); }
console.log(`derived: v_player=${hex(BASE)} obX=+${OBX} obY=+${OBY}`);

// ---- get into a level, DRIVEN BY THE GAME MODE, not by guessed timings -----
// An earlier version pressed start six times on a fixed cadence and read
// positions off the SEGA screen: gamemode 0x00, a "player" drifting a pixel or
// two a frame, and a perfectly clean spike figure describing nothing at all.
const gmSym = await call('emulator/lookup_symbol', { name: 'v_gamemode' });
const GM = gmSym && typeof gmSym.addr === 'string' ? parseInt(gmSym.addr, 16) : null;
if (GM == null) { console.log('BLOCKED: v_gamemode did not resolve'); srv.kill(); process.exit(1); }
const readMode = async () => u8(await call('emulator/read_memory', { addr: hex(GM), len: 1 }));
let mode = null;
for (let k = 0; k < 60; k++) {
  await call('emulator/resume');
  await sleep(500);
  await call('emulator/pause');
  mode = await readMode();
  const stx = await call('emulator/status');
  if (k % 6 === 0 || mode === 0x0C) console.log(`   k=${k} frame=${stx?.frame} mode=${mode == null ? '??' : '0x'+mode.toString(16).padStart(2,'0')}`);
  if (mode === 0x0C) break;
  // 0x04 title, 0x08 attract demo, 0x00 SEGA screen. Start advances the first two.
  if (mode === 0x04 || mode === 0x08 || mode === 0x00) {
    await call('emulator/press', { buttons: ['start'] });
    await call('emulator/run_frames', { frames: 8 });
  }
}
console.log(`reached v_gamemode = ${mode == null ? 'UNREADABLE' : '0x' + mode.toString(16).padStart(2,'0')} (0x0C = Level)`);

// The camera is the half that decides whether a poke is USABLE: a player moved
// 512px with the camera left behind is off-screen, which is a warp that "worked"
// and shows the author nothing. v_screenposx/y are LONGS in S1's variable map.
let CAMX = null, CAMY = null;
{
  const cx = await call('emulator/lookup_symbol', { name: 'v_screenposx' });
  const cy = await call('emulator/lookup_symbol', { name: 'v_screenposy' });
  CAMX = cx && typeof cx.addr === 'string' ? parseInt(cx.addr, 16) : null;
  CAMY = cy && typeof cy.addr === 'string' ? parseInt(cy.addr, 16) : null;
  console.log(`camera: v_screenposx=${CAMX == null ? '??' : hex(CAMX)} v_screenposy=${CAMY == null ? '??' : hex(CAMY)}`);
}
const readCam = async () => CAMX == null ? null : ({
  // long, but the meaningful half is the high word for a screen position in px
  x: u16(await call('emulator/read_memory', { addr: hex(CAMX), len: 2 })),
  y: u16(await call('emulator/read_memory', { addr: hex(CAMY), len: 2 })),
});

const readPos = async () => ({
  x: u16(await call('emulator/read_memory', { addr: hex(BASE + OBX), len: 2 })),
  y: u16(await call('emulator/read_memory', { addr: hex(BASE + OBY), len: 2 })),
});
// ANTI-VACUOUS, kept as a hard gate: measuring the title screen instead of a
// level produces a clean figure about nothing, and that is exactly what the
// first run of this probe did.
if (mode !== 0x0C) {
  console.log('BLOCKED: never reached a level — every figure below would describe an intro screen.');
  console.log('The spike question is UNANSWERED, not answered negatively.');
  srv.kill(); process.exit(1);
}

// LET THE LEVEL SETTLE BEFORE CHECKPOINTING. Entering mode 0x0C is not the same
// as the level being ready: S1's init clears object RAM and seeds Sonic from the
// start-position table, so a poke applied in that window is silently overwritten
// and the machine ends BYTE-IDENTICAL to the control — which reads exactly like
// "the engine snapped him back" and is a completely different mechanism.
// Measured: poking immediately after 0x0C gave drift -512 and an identical state
// hash. Settling first is what makes the figure below about the poke.
await call('emulator/run_frames', { frames: 180 });
const settle = await readPos();
console.log(`settled 180 frames after entering the level: ${JSON.stringify(settle)}`);

const st0 = await call('emulator/status');
const pos0 = await readPos();
console.log(`\nafter intro: frame ${st0?.frame}  player at ${JSON.stringify(pos0)}`);
if (pos0.x == null) { console.log('BLOCKED: could not read the player position'); srv.kill(); process.exit(1); }

// ---- ONE checkpoint, three runs from it -----------------------------------
const cp = await call('emulator/checkpoint', { label: 'preplay' });
console.log(`checkpoint: ${JSON.stringify(cp).slice(0,120)}`);

const CP_ID = cp?.id ?? cp?.checkpointId ?? cp?.label;
const runFrom = async (label, poke) => {
  const rr = await call('emulator/restore', { id: CP_ID });
  if (rr == null) throw new Error('restore failed — every run below would continue from the previous one, and the control would diverge from itself for a reason that has nothing to do with the subject');
  if (poke) {
    const wx = await call('emulator/write_memory', { addr: hex(BASE + OBX), value: poke.x, width: 2 });
    const wy = await call('emulator/write_memory', { addr: hex(BASE + OBY), value: poke.y, width: 2 });
    if (wx == null || wy == null) throw new Error('write_memory refused — the poke never happened, and every figure below would be the control wearing the poke run\'s label');
    // Read it back BEFORE running: a write that silently did not land is exactly
    // how this probe would report "the engine snapped him back" about a poke that
    // was never applied.
    const landed = await readPos();
    console.log(`  wrote ${JSON.stringify(poke)}; immediately reads back ${JSON.stringify(landed)}`);
    if (landed.x !== poke.x) console.log('  !! the write did not stick even before a frame ran');
  }
  const samples = [];
  for (let k = 0; k < 6; k++) {
    await call('emulator/run_frames', { frames: 10 });
    samples.push({ ...(await readPos()), cam: await readCam() });
  }
  const h = await call('emulator/state_hash');
  return { label, samples, hash: h?.hash ?? JSON.stringify(h) };
};

const ctrlA = await runFrom('control-A', null);
const ctrlB = await runFrom('control-B', null);
console.log(`\ncontrol A: ${JSON.stringify(ctrlA.samples)}`);
console.log(`control B: ${JSON.stringify(ctrlB.samples)}`);
const deterministic = JSON.stringify(ctrlA.samples) === JSON.stringify(ctrlB.samples) && ctrlA.hash === ctrlB.hash;
console.log(`CONTROL AGAINST ITSELF: ${deterministic ? 'IDENTICAL — the comparison below measures the poke' : 'DIVERGED — this instrument is measuring nondeterminism, not the poke'}`);

if (!deterministic) { console.log('\nVERDICT: UNDETERMINED. Not reporting a spike figure from a bed that will not hold still.'); srv.kill(); process.exit(1); }

const target = { x: (pos0.x + 512) & 0xFFFF, y: pos0.y };
const poked = await runFrom('poked', target);
console.log(`\npoked to ${JSON.stringify(target)}:`);
console.log(`poked:     ${JSON.stringify(poked.samples)}`);

const stuck = poked.samples[poked.samples.length - 1];
const drift = stuck.x - target.x;
console.log(`\n--- THE SPIKE ---`);
console.log(`asked for x=${target.x}; 60 frames later the player is at x=${stuck.x} (drift ${drift})`);
console.log(`control ended at x=${ctrlA.samples[ctrlA.samples.length-1].x}`);
console.log(`state hash differs from control: ${poked.hash !== ctrlA.hash}`);
fs.writeFileSync('scratchpad/s1-vplayer-spike.json', JSON.stringify({ BASE, OBX, OBY, pos0, target, ctrlA, ctrlB, poked, deterministic }, null, 2));
srv.kill(); process.exit(0);
