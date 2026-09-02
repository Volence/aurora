import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';
const PORT = 9359;
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (p) => new Promise((res, rej) => { const q = http.get({host:'127.0.0.1',port:PORT,path:p,timeout:1500},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}); q.on('timeout',()=>q.destroy(new Error('t'))); q.on('error',rej); });
async function wait(){for(let i=0;i<90;i++){try{const l=await getJSON('/json/list');const p=l.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);if(p)return p.webSocketDebuggerUrl}catch{}await sleep(500)}throw new Error('no target')}
function cdp(u){const ws=new WebSocket(u);let id=1;const pend=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});const ready=new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j)});const send=(me,pa={})=>new Promise((rs,rj)=>{const i=id++;pend.set(i,m=>m.error?rj(new Error(JSON.stringify(m.error))):rs(m.result));ws.send(JSON.stringify({id:i,method:me,params:pa}))});const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+(r.exceptionDetails.exception?.description??''));return r.result.value};const json=async(x)=>JSON.parse(await ev(`JSON.stringify(${x})`));return{ready,send,ev,json,close:()=>ws.close()}}
const env={...process.env,AURORA_DEBUG_PORT:String(PORT),AURORA_NO_GPU:'1'};delete env.DISPLAY;
const child=spawnGuarded('/usr/bin/xvfb-run',['-a','-s','-screen 0 1680x1050x24',ELECTRON,MAIN],{cwd:ROOT,env,stdio:['ignore','pipe','pipe'],detached:true});
child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
const H = String.raw`(() => {
  const H = {};
  H.scroller = () => [...document.querySelectorAll('div')].find(d=>d.style&&d.style.width==='240px'&&d.style.height==='240px'&&d.style.overflow==='auto');
  H.canvas = () => { const s=H.scroller(); return s?s.querySelector('canvas'):null; };
  H.zoom = () => { const c=H.canvas(); return c?c.width/8:null; };
  H.optionBar = () => { const cs=[...document.querySelectorAll('div')].filter(d=>d.style&&d.style.height==='32px'&&d.style.display==='flex'&&d.style.borderBottom); return cs.find(d=>[...d.querySelectorAll('button')].some(b=>(b.title||'').startsWith('Mirror mode')))||cs[0]||null; };
  H.clickBar = (t) => { const bar=H.optionBar(); if(!bar) return 'no-bar'; const b=[...bar.querySelectorAll('button')].find(e=>e.title===t); if(!b) return 'no-btn'; b.click(); return 'ok'; };
  /** fractional doc-x/y under a screen point, measured off the CANVAS rect */
  H.docAt = (sx,sy) => { const c=H.canvas(); const r=c.getBoundingClientRect(); const z=c.width/8;
    return { x:(sx-r.left)/z, y:(sy-r.top)/z, z, canvasLeft:r.left, canvasW:r.width }; };
  H.geom = () => { const s=H.scroller(), c=H.canvas(); const sr=s.getBoundingClientRect(), cr=c.getBoundingClientRect();
    return { boxW:sr.width, canvasW:cr.width, scrollLeft:s.scrollLeft, scrollTop:s.scrollTop,
             canvasOriginInContent: Math.round(cr.left - sr.left + s.scrollLeft) }; };
  H.centre = () => { const s=H.scroller(); const r=s.getBoundingClientRect(); return { x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2) }; };
  window.__h=H; return 1; })()`;
try{
  const c=cdp(await wait());await c.ready;await c.send('Runtime.enable');
  for(let i=0;i<60;i++){try{if(await c.ev('typeof window.__dbg==="object"'))break}catch{}await sleep(300)}
  await c.ev('localStorage.clear();1');
  await c.ev(`window.__dbg.openDir(${siblingPathOrUnresolved('s1disasm')})`);await sleep(1800);
  await c.ev('window.__dbg.activate("ghz",1)');await sleep(4000);
  await c.ev(`(()=>{[...document.querySelectorAll('[aria-label="Facets"] button')].find(e=>e.textContent.trim()==='Art').click();return 1})()`);await sleep(1000);
  await c.ev(`(()=>{[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Tile'&&e.parentElement&&e.parentElement.children.length===3).click();return 1})()`);await sleep(900);
  await c.ev(H);
  const setZoom = async (target) => {
    // The stepper doubles/halves, so walk DOWN to the 2 floor first and then up:
    // 24 -> 12 -> 6 -> 3 -> 2, then 4, 8, 16, 32 ... otherwise 32 is unreachable
    // from 24 and the loop oscillates.
    for(let i=0;i<12;i++){const z=await c.ev('window.__h.zoom()');if(z===2)break;await c.ev('window.__h.clickBar("Zoom out")');await sleep(280);}
    for(let i=0;i<12;i++){const z=await c.ev('window.__h.zoom()');if(z>=target)break;await c.ev('window.__h.clickBar("Zoom in")');await sleep(280);}
    await sleep(300); return c.ev('window.__h.zoom()');
  };
  const trial = async (startZoom) => {
    const z = await setZoom(startZoom);
    const g0 = await c.json('window.__h.geom()');
    // OFF-CENTRE on purpose: the box centre is a fixed point of auto-centring,
    // so a centred canvas shows zero drift there no matter what the hook does.
    const pt = await c.json(`(() => { const r = window.__h.scroller().getBoundingClientRect();
      return { x: Math.round(r.left + r.width * 0.30), y: Math.round(r.top + r.height * 0.30) }; })()`);
    const d0 = await c.json(`window.__h.docAt(${pt.x},${pt.y})`);
    await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:pt.x,y:pt.y,deltaX:0,deltaY:-120,button:'none',buttons:0});
    await sleep(800);
    const g1 = await c.json('window.__h.geom()');
    const d1 = await c.json(`window.__h.docAt(${pt.x},${pt.y})`);
    return { startZoom:z, endZoom:d1.z, geomBefore:g0, geomAfter:g1,
             docBefore:{x:+d0.x.toFixed(3),y:+d0.y.toFixed(3)}, docAfter:{x:+d1.x.toFixed(3),y:+d1.y.toFixed(3)},
             driftPx:{x:+(d1.x-d0.x).toFixed(3), y:+(d1.y-d0.y).toFixed(3)} };
  };
  for (const z of [24, 32, 16]) {
    console.log(`\n--- start zoom ${z} ---`);
    console.log(JSON.stringify(await trial(z), null, 1));
  }
  c.close();
}finally{try{process.kill(-child.pid,'SIGKILL')}catch{}}
