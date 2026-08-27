import { spawn } from 'node:child_process';
import net from 'node:net'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'s1m-')); const sock = path.join(dir,'o.sock');
const srv = spawn('../oracle/target/release/oracle-aether',['../s1disasm/s1built.bin','--socket',sock],{stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<150&&!fs.existsSync(sock);i++) await sleep(100);
const c=net.connect(sock); let buf=''; const pend=new Map(); let id=0;
c.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);
 if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch{continue};if(m.id!=null&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}});
const call=(m,p={})=>new Promise(r=>{const my=++id;pend.set(my,r);c.write(JSON.stringify({jsonrpc:'2.0',id:my,method:m,params:p})+'\n')});
await new Promise(r=>c.once('connect',r));
await call('initialize',{clientCapabilities:{events:true}});
c.write(JSON.stringify({jsonrpc:'2.0',method:'initialized',params:{}})+'\n');
await call('emulator/load_symbols',{path:'../s1disasm/sonic.lst'});
const gm = await call('emulator/lookup_symbol',{name:'v_gamemode'});
console.log('v_gamemode lookup:', JSON.stringify(gm.result ?? gm));
await call('emulator/resume'); await sleep(6000); await call('emulator/pause');
const st = await call('emulator/status'); console.log('frame', st.result?.frame, 'pc', st.result?.pc, st.result?.symbol ?? '');
for (const a of ['0x00FFF600','0x00FFF601','0x00FFFF00']) {
  const r = await call('emulator/read_memory',{addr:a,len:4});
  console.log(a, '->', JSON.stringify(r.result ?? r.error).slice(0,180));
}
const regs = await call('emulator/registers');
console.log('regs:', JSON.stringify(regs.result ?? regs).slice(0,300));
srv.kill(); process.exit(0);
