// THROWAWAY probe (not committed): can CDP real key events drive a native <select> here?
import { spawn } from 'node:child_process';
import * as http from 'node:http';
const PORT = 9422;
const ROOT = '/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-af1d3ca5fa3bf08c5';
const ELECTRON = '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron';
const AEONDIR = process.env.AEON_DIR;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(p){return new Promise((res,rej)=>{const q=http.get({host:'127.0.0.1',port:PORT,path:p,timeout:1500},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})});q.on('timeout',()=>q.destroy(new Error('t')));q.on('error',rej)})}
async function waitForTarget(){for(let i=0;i<90;i++){try{const l=await getJSON('/json/list');const p=l.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);if(p)return p.webSocketDebuggerUrl}catch{}await sleep(500)}throw new Error('no target')}
function cdp(u){const ws=new WebSocket(u);let id=1;const pend=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});const ready=new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j)});const send=(m,p={})=>new Promise((res,rej)=>{const i=id++;pend.set(i,x=>x.error?rej(new Error(m+JSON.stringify(x.error))):res(x.result));ws.send(JSON.stringify({id:i,method:m,params:p}))});const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value};return{ready,send,ev,close:()=>ws.close()}}
const env={...process.env,AURORA_DEBUG_PORT:String(PORT),AURORA_NO_GPU:'1'};delete env.DISPLAY;
const child=spawn('/usr/bin/xvfb-run',['-a','-s','-screen 0 1680x1050x24',ELECTRON,`${ROOT}/dist/main/index.mjs`],{cwd:ROOT,env,stdio:['ignore','pipe','pipe'],detached:true});
const c=cdp(await waitForTarget());await c.ready;await c.send('Runtime.enable');
for(let i=0;i<60;i++){if(await c.ev('typeof window.__dbg==="object"').catch(()=>false))break;await sleep(300)}
await c.ev(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(()=>{});
for(let i=0;i<40;i++){const s=await c.ev('JSON.stringify(window.__dbg.aeon.state())').catch(()=>null);if(s&&JSON.parse(s).open)break;await sleep(400)}
await sleep(2500);
await c.ev(`[...document.querySelectorAll('button')].find(e=>/^Effects$/.test((e.textContent||'').trim())).click()`);
await sleep(2000);
const SELQ = `[...document.querySelectorAll('select')].find(x=>/^transition$/.test(x.title||''))`;
const info=await c.ev(`(()=>{const e=${SELQ};if(!e)return 'none';e.focus();return JSON.stringify({v:e.value,opts:[...e.options].map(o=>o.value),focused:document.activeElement===e})})()`);
console.log('BEFORE', info);
const K=async(type,extra={})=>c.send('Input.dispatchKeyEvent',{type,key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:40,...extra});
const read=async(tag)=>console.log(tag, await c.ev(`(()=>{const e=${SELQ};return e.value+'|focus='+(document.activeElement===e)})()`));
await K('rawKeyDown');await K('keyUp');await sleep(300);await read('after rawKeyDown ');
await K('keyDown');await K('keyUp');await sleep(300);await read('after keyDown    ');
const T=async(ch)=>{const vk=ch.toUpperCase().charCodeAt(0);await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:ch,code:'Key'+ch.toUpperCase(),windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,text:ch,unmodifiedText:ch});await c.send('Input.dispatchKeyEvent',{type:'char',key:ch,text:ch});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:ch,code:'Key'+ch.toUpperCase(),windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});await sleep(120)};
const opts=JSON.parse(info).opts; console.log('opts',opts);
const target=opts[opts.length-1]||'x';
for(const ch of target.slice(0,4)) await T(ch);
await sleep(400); await read(`after typeahead "${target.slice(0,4)}"`);
const rect=JSON.parse(await c.ev(`(()=>{const e=${SELQ};const r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})})()`));
console.log('rect',rect);
for(const type of ['mousePressed','mouseReleased']) await c.send('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1});
await sleep(600); await read('after mouse click');
await K('rawKeyDown');await K('keyUp');await sleep(200);
await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
await sleep(600); await read('after click+arrow+enter');
// A NUMBER input, for contrast: real typed digits.
const NUMQ = `[...document.querySelectorAll('input[type=number]')].find(x=>/^v_center\\b/.test(x.title||''))`;
const nb = await c.ev(`(()=>{const e=${NUMQ};if(!e)return 'none';e.focus();return e.value+'|'+(document.activeElement===e)})()`);
console.log('number BEFORE', nb);
await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2});
await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2});
for(const ch of '123'){const vk=ch.charCodeAt(0);await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:ch,code:'Digit'+ch,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,text:ch,unmodifiedText:ch});await c.send('Input.dispatchKeyEvent',{type:'char',key:ch,text:ch});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:ch,code:'Digit'+ch,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});await sleep(120)}
await sleep(500);
console.log('number AFTER ', await c.ev(`(()=>{const e=${NUMQ};return e.value})()`), '| model v_center =', await c.ev(`(()=>{const d=JSON.parse(window.__dbg.aeon.scenesJson());return JSON.stringify(d.map(s=>s.v_center))})()`));
c.close(); try{process.kill(-child.pid,'SIGTERM')}catch{}
process.exit(0);
