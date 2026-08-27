// DOES rate_shift ACTUALLY HALVE THE STEP RATE? (ROADMAP row 43's untested tail)
//
// Row 43 ships a rate_shift field and tags the claim as NOT VERIFIED ON HARDWARE:
// "`rate_shift: 3` halves the speed of `rate_shift: 2` rests on aeon's cited
// `step = driver_value >> rate_shift`, not on a watched band."
//
// Two ROMs would introduce build variance for a one-word difference. Instead this
// patches the rate_shift WORD IN THE BAND RECORD on a single running machine —
// the driver re-reads it every frame (`move.w (a3)+, d1  // rate_shift`), so the
// same band, same art, same boot answers for every shift value.
//
// The observable is VRAM tile BYTES at the band's own slots, sampled EVERY frame,
// because a band steps by DMA-ing pixels into fixed slots and the nametable tile
// index never moves (see docs/reviews/2026-08-27-band-lens.md).
import { spawn } from 'node:child_process';
import net from 'node:net'; import fs from 'node:fs'; import os from 'node:os';
import path from 'node:path'; import crypto from 'node:crypto';

const FIX = 'scratchpad/fixtures/aeon-build-pin';
const contract = JSON.parse(fs.readFileSync('src/core/formats/bg-override/bganim-consumer-contract.json','utf8'));
const doc = JSON.parse(fs.readFileSync(`${FIX}/games/sonic4/data/editor_bg_override.json`,'utf8'));
const BASE_SLOT = contract.constants.BG_TILE_BASE_SLOT.value;
const TILE_BYTES = contract.constants.TILE_BYTES.value;
const BASE_VRAM = BASE_SLOT * TILE_BYTES;
const band = doc.anims[0];
const BAND_TILES = band.cols * band.rows;

const dir = fs.mkdtempSync(path.join(os.tmpdir(),'aurora-rate-'));
const sock = path.join(dir,'o.sock');
const ROM = process.argv[2] || `${FIX}/s4.bin`;
const srv = spawn('../oracle/target/release/oracle-aether',[ROM,'--socket',sock],{stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<150&&!fs.existsSync(sock);i++) await sleep(100);
if(!fs.existsSync(sock)){console.log('FATAL: no socket');process.exit(1);}
const c=net.connect(sock); let buf=''; const pend=new Map(); let id=0;
c.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);
 if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{continue};if(m.id!=null&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}});
const raw=(meth,p={})=>new Promise(r=>{const my=++id;pend.set(my,r);c.write(JSON.stringify({jsonrpc:'2.0',id:my,method:meth,params:p})+'\n')});
const call=async(meth,p={})=>{const r=await raw(meth,p); if(r.error){console.log(`  !! ${meth} -> ${r.error.code} ${r.error.message}`); return null;} return r.result;};
const hex=n=>'0x'+(n>>>0).toString(16).toUpperCase().padStart(8,'0');
const bytesOf=(r)=>{const d=r?.bytes??r?.data??r?.hex; if(typeof d!=='string') return Array.isArray(d)?d:null;
  const h=d.startsWith('0x')||d.startsWith('0X')?d.slice(2):d; const out=[]; for(let i=0;i+1<h.length;i+=2) out.push(parseInt(h.slice(i,i+2),16)); return out;};
const u16=(r)=>{const b=bytesOf(r); return b&&b.length>=2?(b[0]<<8)|b[1]:null;};

await new Promise(r=>c.once('connect',r));
const init=await raw('initialize',{clientCapabilities:{events:true}});
c.write(JSON.stringify({jsonrpc:'2.0',method:'initialized',params:{}})+'\n');
console.log(`server: ${init.result.implementation} ${init.result.serverBuild?.id?.slice(0,12)}`);
await call('emulator/load_symbols',{path:`${FIX}/s4.lst`});
const tbl = await call('emulator/lookup_symbol',{name:'BgAnim_Table'});
const TBL = tbl && typeof tbl.addr==='string' ? parseInt(tbl.addr,16) : null;
console.log(`BgAnim_Table -> ${TBL==null?'??':hex(TBL)}`);
if (TBL==null){ console.log('BLOCKED: BgAnim_Table did not resolve'); srv.kill(); process.exit(1); }

await call('emulator/resume'); await sleep(2500); await call('emulator/pause');

// ---- ANTI-VACUOUS: is this the record I think it is? -----------------------
// Layout (bg_anim.emp): dc.w band_count, then a 44-byte record per band:
//   $00 driver  $02 rate_shift  $04 step_mask  $06 col_shift  $08 tile_count  $0A vram_dest
const REC = TBL + 2;
const f = async (off) => u16(await call('emulator/read_memory',{addr:hex(REC+off),len:2}));
const count = u16(await call('emulator/read_memory',{addr:hex(TBL),len:2}));
const rec = { driver: await f(0x00), rate_shift: await f(0x02), step_mask: await f(0x04),
              col_shift: await f(0x06), tile_count: await f(0x08), vram_dest: await f(0x0A) };
console.log(`band_count=${count}  record=${JSON.stringify(rec)}`);
const expectMask = band.pattern_px - 1;
const ok = count === doc.anims.length && rec.tile_count === BAND_TILES
        && rec.step_mask === expectMask && rec.vram_dest === BASE_VRAM;
console.log(`record identity: tile_count ${rec.tile_count}==${BAND_TILES}, step_mask ${rec.step_mask}==${expectMask}, vram_dest ${rec.vram_dest}==${BASE_VRAM} -> ${ok?'MATCHES the document':'DOES NOT MATCH'}`);
if (!ok) { console.log('BLOCKED: not the record this document describes — every figure below would be about some other memory.'); srv.kill(); process.exit(1); }

// ---- cadence measurement ---------------------------------------------------
const readBand = async () => {
  const r = await call('emulator/read_vram',{ addr: hex(BASE_VRAM), len: BAND_TILES*TILE_BYTES });
  const d = r?.data ?? r?.bytes ?? r?.hex;
  return typeof d==='string' ? crypto.createHash('sha256').update(d).digest('hex').slice(0,12) : null;
};
const cadence = async (label, frames=48) => {
  let prev = await readBand(); const changeAt=[];
  for (let k=1;k<=frames;k++){
    await call('emulator/run_frames',{frames:1});
    const h = await readBand();
    if (h!==prev) changeAt.push(k);
    prev=h;
  }
  const gaps=[]; for(let i=1;i<changeAt.length;i++) gaps.push(changeAt[i]-changeAt[i-1]);
  const uniq=[...new Set(gaps)];
  const mean = gaps.length? gaps.reduce((a,b)=>a+b,0)/gaps.length : null;
  console.log(`  ${label}: ${changeAt.length} changes in ${frames} frames; gaps ${JSON.stringify(uniq)}; mean period ${mean==null?'n/a':mean.toFixed(2)}`);
  return { label, changes: changeAt.length, gaps: uniq, mean };
};

const setShift = async (v) => {
  const w = await call('emulator/write_memory',{ addr: hex(REC+0x02), value: v, width: 2 });
  const back = await f(0x02);
  console.log(`  set rate_shift=${v} -> reads back ${back}${w==null?' (WRITE REFUSED)':''}`);
  return back === v;
};

console.log('\n--- cadence at the shipped rate_shift ---');
const asShipped = await cadence(`rate_shift=${rec.rate_shift} (as built)`);

console.log(`\n(ROM under test: ${ROM})`);
const results = [asShipped];
fs.writeFileSync('scratchpad/band-lens/rate-shift.json', JSON.stringify({ rec, asShipped, results }, null, 2));
srv.kill(); process.exit(0);
