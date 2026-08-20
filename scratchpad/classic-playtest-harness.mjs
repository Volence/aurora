#!/usr/bin/env node
// DOES THE CLASSIC PLAYTEST LOOP ACTUALLY CLOSE? (links 1 + 3 on s1disasm)
//
// Modeled on boot-override-harness.mjs / live-palette-e2e-harness.mjs: a real
// `VITE_AURORA_DEBUG=1 npm run build` app under xvfb+CDP opening the REAL
// s1disasm as a project, a real headless oracle-aether on s1built.bin, and an
// INDEPENDENT observer client on the same socket. The component under test is
// never asked whether it worked: every landing is read back out of the machine
// (or off the disk) by the observer.
//
// Rows:
//   0  the emulator is the post-parser-drop binary (35 methods) — fewer means
//      the STALE binary launched and nothing below means anything
//   1  sonic.lst loads (accepted unverified) and v_palette_line_1..4 resolve
//      as four lines exactly $20 apart (geometry transcribed from
//      _Variables.asm:318-321, not hardcoded addresses)
//   2  the app opens s1disasm as a classic project; BEFORE connecting, the
//      palette capability is honestly absent (anti-vacuous control)
//   3  connect: paletteKind === 'classic', and the Aether badge EXISTS in the
//      classic map status bar and says connected (the new UI wiring)
//   4  live push (editor line 1) lands in v_palette_line_2 — read back over
//      the observer; the sentinel was NOT there before; v_palette_line_1 is
//      untouched (a line-0-shifted mapping would move it)
//   5  the MAPPING row: a second sentinel on editor line 2 lands in
//      v_palette_line_3 (cycled entries 8-11 tolerated — PaletteCycle repaints
//      them every 6 frames in GHZ) while line_2 still holds row 4's words —
//      an off-by-one implementation fails both halves
//   6  a real swatch edit in the real Palette facet reaches the machine (the
//      port -> store -> IPC path, not the seam)
//   7  BUILD & RUN: the swatch edit is saved, `lua build.lua` runs, and
//      s1built.bin's mtime AND content move; the emulator reloads it (romPath
//      + the ROM's own Pal_GHZ bytes now carry the edited word); no restore is
//      claimed (restoredVia absent) and the summary says (classic); wall time
//      reported
//   8  F7 in the classic viewport greys out WITH the classic reason (S1 has no
//      warp mailbox), via real key dispatch and the real toast
//   9  RESTORE: one Ctrl+Z-equivalent undo + rebuild puts the palette file and
//      the ROM back byte-identical; s1disasm's `git status --short` is
//      byte-identical to the pre-run capture
//
// Usage: node scratchpad/classic-playtest-harness.mjs   (VERBOSE=1 for logs)

import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import * as http from 'node:http';
import * as esbuild from 'esbuild';

const PORT = Number(process.env.PORT ?? 9382);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));   // this worktree
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const SERVER = '/home/volence/sonic_hacks/oracle-next/target/release/oracle-aether';
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const ROM = join(S1DIR, 's1built.bin');
const LST = join(S1DIR, 'sonic.lst');
const GHZPAL = join(S1DIR, 'palette/Green Hill Zone.bin');
const SONICPAL = join(S1DIR, 'palette/Sonic.bin');
const SOCK = `/run/user/1000/aur-cp-${process.pid}.sock`;
const SHOTS = join(ROOT, 'scratchpad/shots-classic-playtest');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  return { ready, send, evalExpr, json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)), close: () => ws.close() };
}
async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}
async function key(c, k, code, vk) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// Words the sentinel pushes use — valid Genesis CRAM (0000BBB0GGG0RRR0, even
// channels), distinct per row so a shifted mapping cannot alias.
const SENT_A = Array.from({ length: 16 }, (_, i) => ((i * 0x0222) & 0x0eee));
const SENT_B = Array.from({ length: 16 }, (_, i) => ((0x0e00 - i * 0x0020) & 0x0eee));
const wordsToBE = (ws) => { const b = Buffer.alloc(32); ws.forEach((w, i) => b.writeUInt16BE(w & 0xffff, i * 2)); return b; };

async function main() {
  if (existsSync(SOCK)) rmSync(SOCK);       // a stale socket file refuses the bind
  const preStatus = execSync('git status --short', { cwd: S1DIR }).toString();
  const preGhzPal = sha(GHZPAL); const preSonicPal = sha(SONICPAL);
  const preRomSha = existsSync(ROM) ? sha(ROM) : '(absent)';

  const workDir = mkdtempSync(join(tmpdir(), 'aurora-cp-'));
  let emu = null, app = null, c = null, observer = null;
  try {
    // --- observer client (bundled from the same client source) -------------
    const out = join(workDir, 'client.mjs');
    await esbuild.build({
      entryPoints: [join(ROOT, 'src/main/aether/client.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    });
    const { AetherClient } = await import(out);

    // --- Row 0: the emulator, and it must be the fresh binary --------------
    emu = spawn(SERVER, [ROM], {
      env: { ...process.env, ORACLE_SOCKET: SOCK }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    let elog = '';
    emu.stdout.on('data', (d) => { elog += d; if (process.env.VERBOSE) process.stdout.write(`[emu] ${d}`); });
    emu.stderr.on('data', (d) => { elog += d; if (process.env.VERBOSE) process.stderr.write(`[emu!] ${d}`); });
    for (let i = 0; i < 60 && !elog.includes('listening on'); i++) await sleep(200);
    const methods = /(\d+) methods advertised/.exec(elog)?.[1] ?? '0';
    check('0', 'the emulator serves and advertises 35 methods (post-parser-drop binary)',
      elog.includes('listening on') && methods === '35', `methods=${methods} sock=${SOCK}`);
    if (methods !== '35') throw new Error('stale oracle-aether binary — aborting; nothing below would mean anything');

    observer = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK });
    await observer.connect();

    // --- Row 1: symbols + geometry ------------------------------------------
    let lsErr = null, ls = null;
    try { ls = await observer.call('emulator/load_symbols', { path: LST }); }
    catch (e) { lsErr = e.message; }
    const lineAddr = [];
    if (!lsErr) {
      for (let n = 1; n <= 4; n++) lineAddr.push(await observer.resolve(`v_palette_line_${n}`));
    }
    const deltas = lineAddr.slice(1).map((a, i) => a - lineAddr[i]);
    check('1', 'sonic.lst is ACCEPTED and v_palette_line_1..4 resolve as $20-apart lines',
      !lsErr && deltas.every((d) => d === 0x20),
      lsErr ?? `binding=${ls?.binding} addrs=${lineAddr.map((a) => '0x' + a.toString(16)).join(',')}`);

    const readLine = async (n) => {
      const r = await observer.call('emulator/read_memory', {
        addr: '0x' + lineAddr[n - 1].toString(16).toUpperCase(), len: 32,
      });
      return Buffer.from(r.bytes.replace(/^0x/i, ''), 'hex');
    };

    // Advance the machine to a QUIESCENT state (past the boot fades), then
    // keep it paused and step frames explicitly — deterministic, and the app's
    // own pushes respect wasRunning=false so nothing resumes underneath us.
    await observer.call('emulator/pause', {});
    await observer.call('emulator/run_frames', { frames: 900 });
    let quiet = false;
    for (let i = 0; i < 8 && !quiet; i++) {
      const a = await readLine(2);
      await observer.call('emulator/run_frames', { frames: 60 });
      const b = await readLine(2);
      if (a.equals(b) && !a.every((x) => x === 0)) quiet = true;
      else await observer.call('emulator/run_frames', { frames: 240 });
    }
    check('1b', 'the machine reached a quiescent, non-blank palette state (fades done)', quiet);

    // --- Row 2: the app opens s1disasm; palette honestly absent pre-connect --
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ORACLE_SOCKET: SOCK };
    delete env.DISPLAY;
    app = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3500);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    const opened = await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await c.evalExpr('window.__dbg.openAct("ghz", 1)');
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(1500);
    const lvl = await c.json('window.__dbg.levelState()');
    const preConnect = await c.json('window.__dbg.aether.state()');
    check('2', 'the app opened s1disasm (GHZ1 ready) and reports NO palette capability before connect',
      opened === 'opened' && lvl.status === 'ready'
      && preConnect.status !== 'connected' && preConnect.palette === false,
      `open=${opened} level=${lvl.status} preConnect=${JSON.stringify(preConnect)}`);

    // --- Row 3: connect; kind + the badge in the CLASSIC status bar ---------
    const badgeClicked = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('button')].find((e) => /Aether/.test(e.textContent || ''));
      if (!b) return 'no-badge'; b.click(); return 'clicked';
    })()`);
    await sleep(2500);
    const st = await c.json('window.__dbg.aether.state()');
    const badgeText = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('button')].find((e) => /Aether/.test(e.textContent || ''));
      return b ? b.textContent.replace(/\\s+/g, ' ').trim() : null;
    })()`);
    check('3', 'clicking the Aether badge IN THE CLASSIC UI connects, and paletteKind is classic',
      badgeClicked === 'clicked' && st.status === 'connected'
      && st.palette === true && st.paletteKind === 'classic' && /connected/i.test(badgeText ?? ''),
      `badge=${JSON.stringify(badgeText)} state=${JSON.stringify(st)}`);
    await shot(c, '1-connected');

    // --- Row 4: seam push, observed independently ----------------------------
    const before2 = await readLine(2);
    const expectA = wordsToBE(SENT_A);
    check('4a', 'control: the sentinel is NOT already in v_palette_line_2', !before2.equals(expectA),
      `before=${before2.toString('hex').slice(0, 16)}…`);
    const before1 = await readLine(1);
    await c.evalExpr(`window.__dbg.aether.push(1, ${JSON.stringify(SENT_A)}, 'classic')`);
    await sleep(600);                                    // clear the ~10Hz throttle
    await observer.call('emulator/run_frames', { frames: 3 });
    const after2 = await readLine(2);
    const after1 = await readLine(1);
    check('4', 'editor line 1 lands VERBATIM in v_palette_line_2 (read back by the observer)',
      after2.equals(expectA),
      `after=${after2.toString('hex').slice(0, 16)}… want=${expectA.toString('hex').slice(0, 16)}…`);
    check('4b', 'and v_palette_line_1 is untouched — a line-shifted mapping would have moved it',
      after1.equals(before1),
      `line1 before=${before1.toString('hex').slice(0, 16)}… after=${after1.toString('hex').slice(0, 16)}…`);

    // --- Row 5: the mapping row ------------------------------------------------
    const expectB = wordsToBE(SENT_B);
    await c.evalExpr(`window.__dbg.aether.push(2, ${JSON.stringify(SENT_B)}, 'classic')`);
    await sleep(600);
    await observer.call('emulator/run_frames', { frames: 3 });
    const after3 = await readLine(3);
    const still2 = await readLine(2);
    // GHZ's PaletteCycle repaints line 3's colours 8-11 (v_palette_line_3+$10,
    // 4 entries) every 6 frames — tolerated, per the report; compare the rest.
    const stable = (buf, want) =>
      buf.subarray(0, 16).equals(want.subarray(0, 16)) && buf.subarray(24, 32).equals(want.subarray(24, 32));
    check('5', 'editor line 2 lands in v_palette_line_3 (cycled entries 8-11 tolerated)',
      stable(after3, expectB),
      `line3=${after3.toString('hex')} want=${expectB.toString('hex')}`);
    check('5b', 'and v_palette_line_2 still holds row 4 — nothing shifted underneath',
      still2.equals(expectA));

    // --- Row 6: a REAL swatch edit in the REAL Palette facet -------------------
    const pillClicked = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === 'Palette');
      if (!b) return 'no-pill'; b.click(); return 'clicked';
    })()`);
    await sleep(1500);
    // MOUNTING the panel already live-pushes the doc's four lines (the mount
    // is a palette change from the effect's point of view), overwriting the
    // sentinels above. Capture that as the UI baseline; the row's edit must
    // then move index 5's word off THIS baseline — "!= sentinel" alone passed
    // on the first run with no commit at all.
    await sleep(600);
    await observer.call('emulator/run_frames', { frames: 3 });
    const uiBase2 = await readLine(2);
    // Line 1 index 5 (inside the zone palette, not the transparent index).
    // The grid is found structurally: a row is any div with exactly 16 buttons.
    const picked = await c.evalExpr(`(() => {
      const rows = [...document.querySelectorAll('div')]
        .filter((d) => [...d.children].filter((c) => c.tagName === 'BUTTON').length === 16);
      const cell = rows[1] && [...rows[1].children].filter((c) => c.tagName === 'BUTTON')[5];
      if (!cell) return 'no-cell'; cell.click(); return 'picked';
    })()`);
    await sleep(800);
    const slid = await c.evalExpr(`(() => {
      const ranges = [...document.querySelectorAll('input[type=range]')];
      if (!ranges.length) return 'no-sliders';
      const el = ranges[0];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const max = Number(el.max || 7);
      const next = el.value === String(max) ? String(max - 1) : String(max);
      const prev = el.value;
      setter.call(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      // COMMIT IS ON RELEASE, and release is a POINTER event
      // (GenesisColorSliders onPointerUp) — MouseEvent 'mouseup' commits
      // nothing, which is exactly how the first run of this harness produced a
      // "pass" with an uncommitted document.
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return 'moved:' + next + ':' + prev;
    })()`);
    await sleep(900);
    await observer.call('emulator/run_frames', { frames: 3 });
    const uiAfter2 = await readLine(2);
    const idx5Moved = !uiAfter2.subarray(10, 12).equals(uiBase2.subarray(10, 12));
    check('6', 'a real slider commit in the Palette facet reaches the machine (index 5 of line_2 moved)',
      pillClicked === 'clicked' && picked === 'picked' && String(slid).startsWith('moved') && idx5Moved,
      `pill=${pillClicked} pick=${picked} slide=${slid} idx5 ${uiBase2.subarray(10, 12).toString('hex')} -> ${uiAfter2.subarray(10, 12).toString('hex')}`);
    await shot(c, '2-swatch-edit');

    // --- Row 7: BUILD & RUN -----------------------------------------------------
    // NOTE the promise plumbing: c.json would stringify the PROMISE (an empty
    // object) before awaitPromise could help; .then(JSON.stringify) makes the
    // outer expression the promise CDP awaits. The first run of this harness
    // read `routed={}` and a buildState captured before the build began.
    const buildAwaited = async () => JSON.parse(await c.evalExpr(
      'window.__dbg.aether.build().then((r) => JSON.stringify(r))'));
    const mtimeBefore = statSync(ROM).mtimeMs;
    const romShaBefore = sha(ROM);
    const t0 = Date.now();
    const routed = await buildAwaited();
    const wallMs = Date.now() - t0;
    const bst = await c.json('window.__dbg.aether.state()');
    const mtimeAfter = statSync(ROM).mtimeMs;
    const romShaAfter = sha(ROM);
    check('7a', 'build routed CLASSIC, ran, and reported ok',
      routed.route === 'classic' && routed.ran === true && bst.buildState === 'ok',
      `routed=${JSON.stringify(routed)} summary=${JSON.stringify(bst.buildSummary)}`);
    check('7b', 's1built.bin was actually rebuilt — mtime AND content moved (the edit is in the ROM)',
      mtimeAfter > mtimeBefore && romShaAfter !== romShaBefore,
      `mtime ${mtimeBefore} -> ${mtimeAfter}; sha ${romShaBefore.slice(0, 12)} -> ${romShaAfter.slice(0, 12)}`);
    check('7c', 'the summary names (classic), reports a reload, and claims NO restore',
      /\(classic\)/.test(bst.buildSummary ?? '') && /reloaded/.test(bst.buildSummary ?? '')
      && !/back at/.test(bst.buildSummary ?? ''),
      bst.buildSummary);
    // The reload dropped the listing and the app re-loaded it; re-arm the
    // observer's view of the machine and read the ROM's OWN copy of the GHZ
    // palette (Pal_GHZ) — if the emulator reloaded the new image, the edited
    // word is in ROM, not just in RAM.
    await observer.call('emulator/load_symbols', { path: LST }).catch(() => {});
    const palGhz = await observer.resolve('Pal_GHZ');
    const romPal = Buffer.from((await observer.call('emulator/read_memory', {
      addr: '0x' + palGhz.toString(16).toUpperCase(), len: 32,
    })).bytes.replace(/^0x/i, ''), 'hex');
    const fileNow = readFileSync(GHZPAL).subarray(0, 32);
    const emuStatus = await observer.call('emulator/status', {});
    // ANTI-VACUOUS: without the sha(GHZPAL)!=pre clause this row passed on the
    // first harness run with NO build at all — unchanged ROM bytes equalled
    // the unchanged file bytes. The row must prove the edit was SAVED into the
    // file AND that the machine's ROM now carries it.
    check('7d', 'the EMULATOR is running the new image: the SAVED edit is in ROM-resident Pal_GHZ',
      sha(GHZPAL) !== preGhzPal && romPal.equals(fileNow)
      && String(emuStatus.romPath ?? '').endsWith('s1built.bin'),
      `fileChanged=${sha(GHZPAL) !== preGhzPal} rom=${romPal.toString('hex').slice(0, 24)}… file=${fileNow.toString('hex').slice(0, 24)}… romPath=${emuStatus.romPath}`);
    check('7e', 'no env vars were reported missing (classic requires none)',
      !/missing/i.test(bst.buildSummary ?? ''), bst.buildSummary);
    console.log(`        [wall] classic Build & Run end-to-end (save+build+reload): ${wallMs} ms — ${bst.buildSummary}`);
    await shot(c, '3-built');

    // --- Row 8: F7 greys out with the classic reason ---------------------------
    // Best-effort facet switch (the label set varies); the F7 listener is a
    // window listener guarded by levelKeysEnabled + the open doc, and the
    // first run proved it fires from the Palette facet too, so the pill is
    // context, not a gate.
    const mapPill = await c.evalExpr(`(() => {
      const pills = [...document.querySelectorAll('[aria-label="Facets"] button')];
      const b = pills.find((e) => /Map|Layout/i.test(e.textContent.trim()));
      if (!b) return 'no-pill:' + JSON.stringify(pills.map((p) => p.textContent.trim()));
      b.click(); return 'clicked';
    })()`);
    await sleep(1200);
    await key(c, 'F7', 'F7', 118);
    await sleep(1500);
    // The SMALLEST matching element, not the first: the app root's
    // textContent contains everything, so an unfiltered query returns the
    // whole page (which is exactly what the first run of this harness got).
    const toastText = await c.evalExpr(`(() => {
      const hits = [...document.querySelectorAll('div,span')]
        .map((e) => (e.textContent || '').trim())
        .filter((s) => s.length > 0 && s.length < 200 && /warp mailbox|Play-from-cursor/i.test(s));
      hits.sort((a, b) => a.length - b.length);
      return hits[0] ?? null;
    })()`);
    check('8', 'F7 on classic is refused WITH the classic reason (no mailbox on S1, not "build DEBUG")',
      toastText !== null
      && /S1 has no warp mailbox/.test(toastText) && !/DEBUG build/.test(toastText),
      `facet=${mapPill} toast=${JSON.stringify(toastText)}`);
    await shot(c, '4-f7-gate');

    // --- Row 9: RESTORE the tree -------------------------------------------------
    // Drive the SAME swatch back to its pre-edit slider value through the same
    // real-UI path, rebuild through the same loop, and the tree and ROM must
    // come back byte-identical to the pre-run capture. (An earlier version
    // tried Ctrl+Z; synthetic slider events do not plant the classic ART
    // surface claim the undo routing keys on, so the explicit inverse edit is
    // the deterministic restore.)
    const prevVal = String(slid).split(':')[2];
    await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === 'Palette');
      if (b) b.click(); return true;
    })()`);
    await sleep(1200);
    const restored = await c.evalExpr(`(() => {
      const rows = [...document.querySelectorAll('div')]
        .filter((d) => [...d.children].filter((c) => c.tagName === 'BUTTON').length === 16);
      const cell = rows[1] && [...rows[1].children].filter((c) => c.tagName === 'BUTTON')[5];
      if (!cell) return 'no-cell'; cell.click();
      return 'picked';
    })()`);
    await sleep(800);
    const slidBack = await c.evalExpr(`(() => {
      const ranges = [...document.querySelectorAll('input[type=range]')];
      if (!ranges.length) return 'no-sliders';
      const el = ranges[0];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify('%PREV%')});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return 'restored:' + el.value;
    })()`.replace('%PREV%', prevVal));
    await sleep(900);
    const rebuilt = await buildAwaited();
    const palShaEnd = sha(GHZPAL); const sonicShaEnd = sha(SONICPAL);
    const romShaEnd = sha(ROM);
    const postStatus = execSync('git status --short', { cwd: S1DIR }).toString();
    check('9', 'the inverse edit + rebuild restores the palette files and the ROM byte-identically',
      rebuilt.ran === true && palShaEnd === preGhzPal && sonicShaEnd === preSonicPal && romShaEnd === preRomSha,
      `pick=${restored} slide=${slidBack} pal ${palShaEnd === preGhzPal} sonic ${sonicShaEnd === preSonicPal} rom ${romShaEnd === preRomSha}`);
    check('9b', 's1disasm git status is byte-identical to the pre-run capture',
      postStatus === preStatus,
      postStatus === preStatus ? undefined : `pre=${JSON.stringify(preStatus)} post=${JSON.stringify(postStatus)}`);
  } finally {
    // Kill ONLY what this harness spawned, by the child handles it holds.
    for (const p of [app, emu]) {
      if (p && p.pid) { try { process.kill(-p.pid, 'SIGTERM'); } catch { try { p.kill('SIGTERM'); } catch { /* gone */ } } }
    }
    try { observer?.disconnect(); } catch { /* gone */ }
    try { c?.close(); } catch { /* gone */ }
    rmSync(workDir, { recursive: true, force: true });
    if (existsSync(SOCK)) rmSync(SOCK);
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
