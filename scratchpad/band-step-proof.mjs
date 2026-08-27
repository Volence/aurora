// BAND STEP PROOF — aurora, 2026-08-27.
// Does the trunk band actually STEP in the ROM, and can we tell that apart from
// the level merely scrolling? A band steps by DMA-ing new PIXELS into fixed slots,
// so the nametable tile INDEX never moves and a screenshot diff cannot separate
// stepping from scrolling. The quantity that answers it is VRAM tile BYTES.
//
// Discriminator: sample the band's own slots AND a control run of static blob
// slots the band does not own. If both change, this instrument cannot separate
// "the band stepped" from "the engine rewrote all background art" — and it says so.
import { spawn } from 'node:child_process';
import net from 'node:net'; import fs from 'node:fs'; import os from 'node:os';
import path from 'node:path'; import crypto from 'node:crypto';

const FIX = 'scratchpad/fixtures/aeon-build-pin';
const contract = JSON.parse(fs.readFileSync('src/core/formats/bg-override/bganim-consumer-contract.json','utf8'));
const doc = JSON.parse(fs.readFileSync(`${FIX}/games/sonic4/data/editor_bg_override.json`,'utf8'));

const BASE_SLOT = contract.constants.BG_TILE_BASE_SLOT.value;
const TILE_BYTES = contract.constants.TILE_BYTES.value;
const BASE_VRAM = BASE_SLOT * TILE_BYTES;          // derived, not typed
const band = doc.anims[0];
const BAND_TILES = band.cols * band.rows;
const BLOB_TILES = doc.tiles.length;
const CONTROL_SLOT = BAND_TILES + 64;               // well past the band, inside the blob
if (CONTROL_SLOT + BAND_TILES > BLOB_TILES) { console.log('FATAL: control run would leave the blob'); process.exit(1); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(),'aurora-step-'));
const sock = path.join(dir,'o.sock');
const srv = spawn('../oracle/target/release/oracle-aether',[`${FIX}/s4.bin`,'--socket',sock],{stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<150 && !fs.existsSync(sock);i++) await sleep(100);
if(!fs.existsSync(sock)){console.log('FATAL: no socket');process.exit(1);}
const c=net.connect(sock); let buf=''; const pend=new Map(); let id=0;
c.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);
 if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{continue};if(m.id!=null&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}});
const call=(m,p={})=>new Promise(r=>{const my=++id;pend.set(my,r);c.write(JSON.stringify({jsonrpc:'2.0',id:my,method:m,params:p})+'\n')});
await new Promise(r=>c.once('connect',r));
const init=await call('initialize',{clientCapabilities:{events:true}});
c.write(JSON.stringify({jsonrpc:'2.0',method:'initialized',params:{}})+'\n');
console.log(`server: ${init.result.implementation} ${init.result.serverBuild?.id?.slice(0,12)}`);
console.log(`band slots 0..${BAND_TILES-1} at VRAM 0x${BASE_VRAM.toString(16)}; control slots ${CONTROL_SLOT}..${CONTROL_SLOT+BAND_TILES-1}`);

await call('emulator/resume'); await sleep(2500); await call('emulator/pause');

const readRun = async (slot, tiles) => {
  const r = await call('emulator/read_vram', { addr: '0x' + (BASE_VRAM + slot*TILE_BYTES).toString(16).toUpperCase().padStart(8,'0'), len: tiles*TILE_BYTES });
  if (r.error) { console.log(`  !! read_vram -> ${r.error.code} ${r.error.message}`); return null; }
  const d = r.result?.data ?? r.result?.bytes ?? r.result?.hex;
  return typeof d === 'string' ? d : JSON.stringify(d);
};
const h = s => s == null ? null : crypto.createHash('sha256').update(s).digest('hex').slice(0,16);

const rows = [];
for (let k=0;k<6;k++){
  const st = (await call('emulator/status')).result;
  const bandBytes = await readRun(0, BAND_TILES);
  const ctrlBytes = await readRun(CONTROL_SLOT, BAND_TILES);
  if (bandBytes == null) { console.log('BLOCKED: read_vram unavailable — question retired to another instrument, not answered'); break; }
  rows.push({ frame: st.frame, band: h(bandBytes), control: h(ctrlBytes) });
  console.log(`  frame ${String(st.frame).padStart(4)}  band ${h(bandBytes)}  control ${h(ctrlBytes)}`);
  await call('emulator/run_frames',{ frames: 20 });
}

const uniq = k => new Set(rows.map(r=>r[k])).size;
const bandMoves = uniq('band'), ctrlMoves = uniq('control');
console.log(`\ndistinct band-slot contents across ${rows.length} captures: ${bandMoves}`);
console.log(`distinct control contents:                          ${ctrlMoves}`);
if (bandMoves > 1 && ctrlMoves === 1) {
  console.log('\nVERDICT: the band STEPS. Its own slots are rewritten while a control run of');
  console.log('static blob slots is byte-stable across the same frames — so this is the band');
  console.log('animating, not the level scrolling and not a wholesale art reload.');
} else if (bandMoves > 1 && ctrlMoves > 1) {
  console.log('\nVERDICT: UNDETERMINED — both the band slots and the control run changed, so this');
  console.log('instrument cannot separate the band stepping from background art being rewritten.');
} else if (bandMoves === 1) {
  console.log('\nVERDICT: the band did NOT step over these frames — its slot bytes are unchanged.');
}
fs.writeFileSync('scratchpad/band-lens/step-proof.json', JSON.stringify({ BASE_VRAM, BAND_TILES, CONTROL_SLOT, rows }, null, 2));
srv.kill(); process.exit(0);
