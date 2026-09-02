import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';
const PORT = 9357;
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
function cdp(u){const ws=new WebSocket(u);let id=1;const pend=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});const ready=new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j)});const send=(me,pa={})=>new Promise((rs,rj)=>{const i=id++;pend.set(i,m=>m.error?rj(new Error(JSON.stringify(m.error))):rs(m.result));ws.send(JSON.stringify({id:i,method:me,params:pa}))});const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+(r.exceptionDetails.exception?.description??''));return r.result.value};return{ready,send,ev,close:()=>ws.close()}}
const env={...process.env,AURORA_DEBUG_PORT:String(PORT),AURORA_NO_GPU:'1'};delete env.DISPLAY;
const child=spawnGuarded('/usr/bin/xvfb-run',['-a','-s','-screen 0 1680x1050x24',ELECTRON,MAIN],{cwd:ROOT,env,stdio:['ignore','pipe','pipe'],detached:true});
child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
try{
  const c=cdp(await wait());await c.ready;await c.send('Runtime.enable');
  for(let i=0;i<60;i++){try{if(await c.ev('typeof window.__dbg==="object"'))break}catch{}await sleep(300)}
  await c.ev('localStorage.clear();1');
  await c.ev(`window.__dbg.openDir(${siblingPathOrUnresolved('s1disasm')})`);await sleep(1800);
  await c.ev('window.__dbg.activate("ghz",1)');await sleep(4000);
  await c.ev(`(()=>{const b=[...document.querySelectorAll('[aria-label="Facets"] button')].find(e=>e.textContent.trim()==='Art');b.click();return 1})()`);await sleep(1000);
  await c.ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Tile'&&e.parentElement&&e.parentElement.children.length===3);b.click();return 1})()`);await sleep(900);
  const H = String.raw`(() => {
    const H = {};
    H.swatches = () => [...document.querySelectorAll('button[title]')].filter((b) => /^index \d+/.test(b.title));
    H.pickSwatch = (i) => { const s = H.swatches(); if (!s[i]) return false; s[i].click(); return true; };
    H.selectedSwatch = () => { const s = H.swatches(); return { count: s.length, index: s.findIndex((b) => getComputedStyle(b).borderWidth.startsWith('2px')) }; };
    window.__h = H; return Object.keys(H).length;
  })()`;
  await c.ev(H);
  console.log('selected at rest:', await c.ev('JSON.stringify(window.__h.selectedSwatch())'));
  console.log('pick 9:', await c.ev('window.__h.pickSwatch(9)'));
  await sleep(400);
  console.log('after pick 9:', await c.ev('JSON.stringify(window.__h.selectedSwatch())'));
  console.log('raw widths:', await c.ev(`JSON.stringify(window.__h.swatches().map(b=>getComputedStyle(b).borderWidth))`));
  console.log('--- 22px buttons:', await c.ev(`[...document.querySelectorAll('button')].filter(b=>b.style&&b.style.width==='22px'&&b.style.height==='22px').length`));
  c.close();
}finally{try{process.kill(-child.pid,'SIGKILL')}catch{}}
