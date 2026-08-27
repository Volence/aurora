// BAND LENS — aurora, 2026-08-27.
// The tagged question in docs/OVERSEER.md: what does aeon's scattered 8x4 band
// look like STEPPING in a ROM, seen with plane A hidden?
//
// Uses our OWN headless oracle-aether on a private mkdtemp socket. It never
// consults the default socket chain, so the owner's on-screen window is untouched.
//
// Every constant is DERIVED: BG_TILE_BASE_SLOT and the band geometry are read
// from the vendored consumer contract and the pinned override document, never typed.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIX = 'scratchpad/fixtures/aeon-build-pin';
const ROM = `${FIX}/s4.bin`;
const LST = `${FIX}/s4.lst`;
const OVERRIDE = `${FIX}/games/sonic4/data/editor_bg_override.json`;
const CONTRACT = 'src/core/formats/bg-override/bganim-consumer-contract.json';
const BIN = '../oracle/target/release/oracle-aether';
const OUT = 'scratchpad/band-lens';

// ---- derived constants -----------------------------------------------------
const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
const BG_TILE_BASE_SLOT = contract.constants.BG_TILE_BASE_SLOT.value;
const BG_TILE_CAPACITY = contract.constants.BG_TILE_CAPACITY.value;
const doc = JSON.parse(fs.readFileSync(OVERRIDE, 'utf8'));
const BLOB_TILES = doc.tiles.length;
const band = doc.anims[0];
const BAND_TILES = band.cols * band.rows;
const PHASE_BANKS = band.phases.length;

fs.mkdirSync(OUT, { recursive: true });

// ---- bus -------------------------------------------------------------------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-lens-'));
const sock = path.join(dir, 'o.sock');
const srv = spawn(BIN, [ROM, '--socket', sock], { stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = '';
srv.stdout.on('data', d => { srvLog += d; });
srv.stderr.on('data', d => { srvLog += d; });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (p, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fs.existsSync(p)) return true; await sleep(80); }
  return false;
};
if (!await waitFor(sock)) { console.log('FATAL: no socket\n' + srvLog); srv.kill(); process.exit(1); }

const c = net.connect(sock);
let buf = ''; const pending = new Map(); let id = 0;
c.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
const call = (method, params = {}) => new Promise(res => {
  const my = ++id; pending.set(my, res);
  c.write(JSON.stringify({ jsonrpc: '2.0', id: my, method, params }) + '\n');
});
const ok = (r, what) => {
  if (r.error) { console.log(`  !! ${what} -> ${r.error.code} ${r.error.message}`); return null; }
  return r.result;
};
await new Promise(r => c.once('connect', r));
const init = await call('initialize', { clientCapabilities: { events: true } });
c.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }) + '\n');

console.log('=== BAND LENS ===');
console.log(`server   : ${init.result.implementation} build ${init.result.serverBuild?.id?.slice(0,12)} (${init.result.methods.length} methods)`);
console.log(`band     : ${band.cols}x${band.rows} = ${BAND_TILES} tiles, driver=${band.driver}, pattern_px=${band.pattern_px}, ${PHASE_BANKS} phase banks`);
console.log(`blob     : ${BLOB_TILES} tiles (capacity ${BG_TILE_CAPACITY}), base slot ${BG_TILE_BASE_SLOT}`);

ok(await call('emulator/load_symbols', { path: LST }), 'load_symbols');

// ---- run into the level ----------------------------------------------------
ok(await call('emulator/resume'), 'resume');
await sleep(2500);
ok(await call('emulator/pause'), 'pause');
const st = ok(await call('emulator/status'), 'status');
console.log(`status   : frame ${st?.frame}  rom ${st?.romPath}`);

// ---- layer states ----------------------------------------------------------
const layers = ok(await call('emulator/get_layer_states'), 'get_layer_states');
console.log('layers   :', JSON.stringify(layers));

// ---- capture helper --------------------------------------------------------
const shot = async (name) => {
  const r = ok(await call('emulator/screenshot', { path: path.resolve(`${OUT}/${name}.png`) }), `screenshot ${name}`);
  return r;
};

// ---- A: both planes, then plane A hidden -----------------------------------
await shot('01-both-planes');
ok(await call('emulator/set_layer_enabled', { layer: 'planeA', enabled: false }), 'hide planeA');
// Measure that the hide took, never assert it (this repo's bar 2e).
const afterHide = ok(await call('emulator/get_layer_states'), 'get_layer_states/afterHide');
console.log('layers after hiding planeA:', JSON.stringify(afterHide));
if (afterHide && afterHide.planeA !== false) {
  console.log('  !! INSTRUMENT DID NOT TAKE — planeA still enabled; every reading below is of the wrong subject');
}
await shot('02-planeB-only');

// ---- B: does the band STEP? sample the same pixels across frames ------------
// pixel_attribution gives cell.tile (VRAM-absolute); rebase to blob-local.
const rebase = (vramTile) => {
  const local = vramTile - BG_TILE_BASE_SLOT;
  if (local < 0) return { local, verdict: 'not part of your background (below the blob base)' };
  if (local >= BLOB_TILES) return { local, verdict: `not part of your background (past the ${BLOB_TILES}-tile blob)` };
  if (local < BAND_TILES) return { local, verdict: `BAND slot ${local}` };
  return { local, verdict: `static blob tile ${local}` };
};

const samplePts = [];
for (let x = 24; x < 320; x += 48) for (let y = 40; y < 200; y += 40) samplePts.push({ x, y });

const sampleFrame = async () => {
  const out = [];
  for (const p of samplePts) {
    const r = ok(await call('emulator/pixel_attribution', { x: p.x, y: p.y }), `attr ${p.x},${p.y}`);
    // NB: `cell` hangs off the RESULT, not off `winner` — docs/OVERSEER.md records
    // it under `winner` and that is wrong; a consumer written to the banked shape
    // reads undefined and silently sees no tiles at all.
    out.push({ ...p, layer: r?.winner?.layer ?? null, tile: r?.cell?.tile ?? null });
  }
  return out;
};

console.log('\n--- stepping the band ---');
const frames = [];
for (let k = 0; k < 4; k++) {
  const s = ok(await call('emulator/status'), 'status');
  const sm = await sampleFrame();
  await shot(`03-step-${k}`);
  frames.push({ frame: s?.frame, sample: sm });
  console.log(`  frame ${s?.frame}: ${sm.filter(v => v.layer === 'planeB').length}/${sm.length} sample points on planeB`);
  ok(await call('emulator/run_frames', { frames: 30 }), 'run_frames');
}

// ---- C: which sample points changed tile between captures? -----------------
console.log('\n--- band identification (rebased through the contract) ---');
const seen = new Map();
for (const f of frames) for (const s of f.sample) {
  if (s.layer !== 'planeB' || s.tile == null) continue;
  const key = `${s.x},${s.y}`;
  if (!seen.has(key)) seen.set(key, new Set());
  seen.get(key).add(s.tile);
}
let movers = 0, bandPts = 0, outside = 0;
for (const [key, tiles] of seen) {
  const list = [...tiles];
  const rs = list.map(rebase);
  const isBand = rs.some(r => r.verdict.startsWith('BAND'));
  if (rs.some(r => r.verdict.startsWith('not part'))) outside++;
  if (isBand) bandPts++;
  if (list.length > 1) {
    movers++;
    console.log(`  (${key}) tiles ${list.join(' -> ')}  ::  ${rs.map(r => r.verdict).join(' -> ')}`);
  }
}
console.log(`\nsample points on planeB: ${seen.size}`);
console.log(`  changed tile across the captures: ${movers}`);
console.log(`  ever resolving into the band's slot range: ${bandPts}`);
console.log(`  rebasing OUTSIDE the blob (must be reported, never indexed): ${outside}`);

fs.writeFileSync(`${OUT}/lens-result.json`, JSON.stringify({
  server: init.result.implementation, build: init.result.serverBuild,
  band, BLOB_TILES, BG_TILE_BASE_SLOT, layers, frames,
}, null, 2));
console.log(`\nartifacts in ${OUT}/  (socket ${sock}, srv pid ${srv.pid})`);
srv.kill();
process.exit(0);
