#!/usr/bin/env node
// DOES THE WINDOW ACTUALLY GET AN ICON? (O32, second half)
//
// `src/main/index.ts` passes `icon: join(moduleDir, '../../build/icon.png')` to
// BrowserWindow. A SOURCE LINE IS NOT EVIDENCE. The path is resolved against
// the BUILT bundle (`dist/main` → `<root>/build`), so it breaks the moment the
// output layout moves, and Electron does not throw on an icon it cannot load —
// it runs without one, silently, which is this parcel's whole subject.
//
// ⚠ A CDP SCREENSHOT CANNOT ANSWER THIS, and that is worth stating rather than
// working around. `Page.captureScreenshot` captures the PAGE; the icon lives on
// the window, and under Xvfb there is no window manager and so no titlebar to
// photograph either. A green screenshot would have proved nothing — the same
// artifact for "it works" and "I could not look".
//
// So this drives the REAL APP under CDP on the MAIN-PROCESS target (`electron
// --inspect`), and asks the running process the question the source line only
// asserts: can Electron decode the file that expression resolves to, in the
// process that would use it, at the path the app itself reports it is running
// from (`app.getAppPath()` — not a path retyped here).
//
// Rows:
//   f1  the icon file is where the BUILT bundle resolves it, and is a PNG
//   n1  the real app is up: exactly one BrowserWindow, visible, titled Aurora,
//       on OUR OWN Xvfb display — so g1 is a property of a live window
//   g1  IN THE RUNNING MAIN PROCESS: the icon path derived from the app's own
//       `getAppPath()` decodes to a non-empty image, and its size is read off
//       the file rather than asserted
//   r1  RED CONTROL: the same call on a path that does not exist reports EMPTY,
//       so "non-empty" above is a measurement and not a constant
//   x1  UNMEASURABLE, ON PURPOSE AND OUT LOUD: whether the window server ended
//       up holding `_NET_WM_ICON` could NOT be read on this box (see below).
//       Reported as a third state — never as a pass, never as a silent skip.
//
// WHY x1 IS UNMEASURABLE HERE, so the next person does not re-derive it:
//   • `_NET_WM_ICON` needs a window id. `xprop -root _NET_CLIENT_LIST` is
//     populated by a WINDOW MANAGER, and bare Xvfb has none.
//   • no window-tree enumerator is installed: `xwininfo`, `xdotool`, `wmctrl`
//     and `xlsclients` are all absent; only `xprop` is present.
//   • `BrowserWindow.getNativeWindowHandle()` returns `01 00 00 00` under this
//     Electron's Ozone backend — not a usable XID (measured, 2026-08-31).
//   The honest consequence: this file proves Electron LOADS the icon, and does
//   not prove a taskbar DRAWS it. That last step needs a session with a window
//   manager — foreground work, tagged as such.
//
// Usage: node scratchpad/window-icon-probe.mjs
//   ELECTRON_BIN=… to point at an electron a worktree does not have.

import { AURORA_DIR } from '../test/support/sibling-root.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const ROOT = AURORA_DIR;
const ELECTRON = process.env.ELECTRON_BIN ?? join(ROOT, 'node_modules/.bin/electron');
const MAIN = join(ROOT, 'dist/main/index.mjs');
const INSPECT_PORT = Number(process.env.INSPECT_PORT ?? 9333);
// The SAME expression `main/index.ts` uses, evaluated against the BUILT bundle.
const ICON = join(dirname(MAIN), '../../build/icon.png');

const results = []; const fails = []; const unmeasurable = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
/** A THIRD STATE. Not a pass, not a failure, and never invisible. */
function cannotMeasure(id, name, why) {
  console.log(`UNMEAS [${id}] ${name}\n        ${why}`);
  unmeasurable.push(id);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getJSON = (path) => new Promise((resolve, reject) => {
  const req = http.get({ host: '127.0.0.1', port: INSPECT_PORT, path, timeout: 2000 }, (res) => {
    let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => {
      try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
    });
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', reject);
});

async function main() {
  if (!existsSync(MAIN)) { check('f1', 'dist/main/index.mjs exists (npm run build first)', false, 'BLOCKED'); return; }
  if (!existsSync(ELECTRON)) {
    check('f1', `an electron binary at ${ELECTRON}`, false,
      'BLOCKED — set ELECTRON_BIN; an agent worktree has no node_modules/.bin/electron');
    return;
  }

  const bytes = existsSync(ICON) ? readFileSync(ICON) : null;
  const isPng = bytes !== null && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  // Dimensions off the IHDR, so the row below compares the app's answer with
  // the file rather than with a number typed here.
  const fileW = isPng ? bytes.readUInt32BE(16) : 0;
  const fileH = isPng ? bytes.readUInt32BE(20) : 0;
  check('f1', 'the icon file is where the BUILT bundle resolves it, and is really a PNG',
    isPng, `${ICON} — ${isPng ? `PNG ${fileW}x${fileH}, ${bytes.length} bytes` : 'MISSING or not a PNG'}`);

  const env = { ...process.env };
  delete env.DISPLAY;          // never the owner's X session
  // AND NEVER HIS COMPOSITOR. Deleting DISPLAY alone is not enough on a Wayland
  // desktop: Electron's Ozone backend will happily take WAYLAND_DISPLAY and put
  // the window on the owner's screen instead of our Xvfb.
  delete env.WAYLAND_DISPLAY;
  env.ELECTRON_OZONE_PLATFORM_HINT = 'x11';
  env.AURORA_NO_GPU = '1';

  const app = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1280x800x24', ELECTRON, `--inspect=${INSPECT_PORT}`, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  app.stdout.on('data', (d) => { log += d; if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
  app.stderr.on('data', (d) => { log += d; if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

  let ws = null;
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(500);
      try { target = (await getJSON('/json/list'))[0] ?? null; } catch { /* not up */ }
    }
    if (!target) { check('n1', 'the main-process CDP target appeared', false, `log: ${log.slice(-400)}`); return; }

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    let id = 1; const pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    const evaluate = (expression) => new Promise((res) => {
      const i = id++; pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });

    // ⚠ `require`, not `import()`. The main bundle is ESM and the inspector
    // context has no dynamic-import callback — `await import('electron')` fails
    // with ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING. Measured, not guessed.
    const probe = `(() => {
      const e = (typeof require === 'function' ? require : process.mainModule.require)('electron');
      const path = (typeof require === 'function' ? require : process.mainModule.require)('path');
      const wins = e.BrowserWindow.getAllWindows();
      // The app's OWN report of where it is running from, put through the same
      // expression src/main/index.ts uses. Nothing here is a path this probe typed.
      const iconPath = path.join(e.app.getAppPath(), '../../build/icon.png');
      const img = e.nativeImage.createFromPath(iconPath);
      const bogus = e.nativeImage.createFromPath(iconPath + '.does-not-exist');
      return JSON.stringify({
        windows: wins.length,
        title: wins[0] ? wins[0].getTitle() : null,
        visible: wins[0] ? wins[0].isVisible() : false,
        display: process.env.DISPLAY ?? null,
        wayland: process.env.WAYLAND_DISPLAY ?? null,
        appPath: e.app.getAppPath(),
        iconPath,
        iconEmpty: img.isEmpty(),
        iconSize: img.getSize(),
        bogusEmpty: bogus.isEmpty(),
      });
    })()`;
    const r = await evaluate(probe);
    if (r.result?.exceptionDetails || typeof r.result?.result?.value !== 'string') {
      check('n1', 'the running main process answered the probe', false, JSON.stringify(r).slice(0, 400));
      return;
    }
    const s = JSON.parse(r.result.result.value);

    const ownDisplay = typeof s.display === 'string' && /^:\d+$/.test(s.display) && s.display !== ':0';
    check('n1', 'the REAL app is up: one visible window titled Aurora, on OUR OWN Xvfb (never :0, never Wayland)',
      s.windows === 1 && s.title === 'Aurora' && s.visible === true && ownDisplay && s.wayland === null,
      `windows=${s.windows} title=${JSON.stringify(s.title)} visible=${s.visible} `
      + `DISPLAY=${s.display} WAYLAND_DISPLAY=${s.wayland} appPath=${s.appPath}`);

    check('g1', 'the RUNNING process decodes the icon at the path its own getAppPath() resolves — and it matches the file',
      s.iconEmpty === false && s.iconSize.width === fileW && s.iconSize.height === fileH,
      `${s.iconPath}\n        empty=${s.iconEmpty} size=${s.iconSize.width}x${s.iconSize.height} `
      + `(file says ${fileW}x${fileH})`);

    check('r1', 'RED CONTROL — the same call on a path that does not exist reports EMPTY',
      s.bogusEmpty === true, `bogusEmpty=${s.bogusEmpty}`);

    cannotMeasure('x1', 'whether the window server holds _NET_WM_ICON for that window',
      'no window manager under bare Xvfb, so `xprop -root _NET_CLIENT_LIST` is empty; no window-tree '
      + 'enumerator installed (xwininfo / xdotool / wmctrl / xlsclients all absent, only xprop); and '
      + 'getNativeWindowHandle() returns 01 00 00 00 under this Ozone backend, not a usable XID. '
      + 'THIS FILE PROVES ELECTRON LOADS THE ICON, NOT THAT A TASKBAR DRAWS IT. Foreground follow-up: '
      + 'run Aurora in a real session and look.');
  } finally {
    try { ws?.close(); } catch { /* already closed */ }
    await killTree(app);
  }
}

main()
  .catch((e) => { console.error(e); fails.push('threw'); })
  .finally(() => {
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed`
      + `${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`
      + `${unmeasurable.length ? ` · ${unmeasurable.length} UNMEASURABLE: ${unmeasurable.join(', ')}` : ''}`);
    process.exit(fails.length ? 1 : 0);
  });
