/**
 * UX seat A — task-walk driver.
 *
 * Launches the built Aurora under xvfb-run through `spawnGuarded`, attaches CDP,
 * then serves a FILE-QUEUE so one launch can carry a whole walk: the operator
 * drops `<n>.json` into $UXA_CMD_DIR and reads `<n>.out.json` back. That shape
 * exists because a newcomer's walk is one continuous session — relaunching the
 * app per gesture would make every job look like a cold start.
 *
 * Commands: {op:'eval',expr}, {op:'shot',path}, {op:'click',x,y[,button,clicks]},
 *           {op:'move',x,y}, {op:'key',...}, {op:'text',text},
 *           {op:'wheel',x,y,dx,dy}, {op:'quit'}
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CMD_DIR = process.env.UXA_CMD_DIR;
const PORT = Number(process.env.AURORA_DEBUG_PORT || 39301);
const LOG = join(CMD_DIR, 'driver.log');
if (!CMD_DIR) { console.error('UXA_CMD_DIR required'); process.exit(2); }
mkdirSync(CMD_DIR, { recursive: true });
const log = (s) => { const line = `[${new Date().toISOString()}] ${s}\n`; process.stdout.write(line); appendFileSync(LOG, line); };

const RUN = announceRunRoot(runTarget(ROOT));
log(`root: ${RUN.root}`);
log(`in-tree: ${RUN.borrowed ? 'NO — BORROWED' : 'YES'}  here=${RUN.here}`);
log(`source: ${RUN.source}`);
log(`electron: ${RUN.electron}`);
log(`main: ${RUN.main}  exists=${existsSync(RUN.main)}`);
if (!existsSync(RUN.main)) { log('FATAL: no built main bundle'); process.exit(2); }

const env = { ...process.env };
delete env.DISPLAY;
delete env.WAYLAND_DISPLAY;
env.ORACLE_SOCKET = process.env.ORACLE_SOCKET;

const args = [
  '-a', '-s', '-screen 0 1680x1050x24',
  RUN.electron, RUN.main,
  `--remote-debugging-port=${PORT}`,
];
log(`spawn: /usr/bin/xvfb-run ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
const child = spawnGuarded('/usr/bin/xvfb-run', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (d) => appendFileSync(LOG, `APP-OUT ${d}`));
child.stderr.on('data', (d) => appendFileSync(LOG, `APP-ERR ${d}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return null;
}

let ws = null; let nextId = 1; const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}`)); } }, 45000);
  });
}

async function connect(page) {
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
}

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails) };
  return { value: r.result?.value };
}

async function shot(path) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(r.data, 'base64'));
  return { path, bytes: Buffer.from(r.data, 'base64').length };
}

async function click(x, y, button = 'left', clickCount = 1) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await sleep(30);
  const buttons = button === 'left' ? 1 : button === 'right' ? 2 : 4;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount, buttons });
  await sleep(30);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount, buttons });
  return { clicked: [x, y], button, clickCount };
}

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
};

async function key(name, modifiers = 0) {
  const k = KEYS[name] || { key: name, code: `Key${name.toUpperCase()}`, text: name, windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0) };
  await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', modifiers, ...k });
  await sleep(20);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode });
  return { key: name, modifiers };
}

async function typeText(text) {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    await sleep(12);
  }
  return { typed: text };
}

async function run() {
  const page = await findPage();
  if (!page) { log('FATAL: CDP page target never appeared'); return; }
  log(`CDP page: ${page.title} ${page.url}`);
  await connect(page);
  const geom = await evaluate(`return JSON.stringify({
    screen: [screen.width, screen.height], avail: [screen.availWidth, screen.availHeight],
    dpr: devicePixelRatio, inner: [innerWidth, innerHeight], outer: [outerWidth, outerHeight],
  });`);
  log(`GEOMETRY (measured from inside the display): ${geom.value ?? geom.error}`);
  writeFileSync(join(CMD_DIR, 'READY'), 'ready\n');

  const done = new Set();
  for (;;) {
    let files;
    try { files = readdirSync(CMD_DIR).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b)); }
    catch { files = []; }
    let acted = false;
    for (const f of files) {
      if (done.has(f)) continue;
      done.add(f);
      acted = true;
      const outPath = join(CMD_DIR, f.replace('.json', '.out.json'));
      let cmds;
      try { cmds = JSON.parse(readFileSync(join(CMD_DIR, f), 'utf8')); } catch (e) { writeFileSync(outPath, JSON.stringify({ error: String(e) })); continue; }
      if (!Array.isArray(cmds)) cmds = [cmds];
      const results = [];
      for (const c of cmds) {
        try {
          if (c.op === 'eval') results.push(await evaluate(c.expr));
          else if (c.op === 'shot') results.push(await shot(c.path));
          else if (c.op === 'click') results.push(await click(c.x, c.y, c.button, c.clicks));
          else if (c.op === 'move') { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none', buttons: 0 }); results.push({ moved: [c.x, c.y] }); }
          else if (c.op === 'key') results.push(await key(c.key, c.modifiers || 0));
          else if (c.op === 'text') results.push(await typeText(c.text));
          else if (c.op === 'wheel') { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c.x, y: c.y, deltaX: c.dx || 0, deltaY: c.dy || 0 }); results.push({ wheel: [c.dx, c.dy] }); }
          else if (c.op === 'sleep') { await sleep(c.ms || 500); results.push({ slept: c.ms || 500 }); }
          else if (c.op === 'quit') { writeFileSync(outPath, JSON.stringify(results.concat([{ quitting: true }]), null, 1)); log('quit requested'); return; }
          else results.push({ error: `unknown op ${c.op}` });
        } catch (e) { results.push({ error: String(e && e.message || e) }); }
      }
      writeFileSync(outPath, JSON.stringify(results, null, 1));
      log(`ran ${f} (${cmds.length} ops)`);
    }
    if (!acted) await sleep(300);
  }
}

try { await run(); }
finally { log('tearing down'); await killTree(child); log('DRIVER-END'); }
