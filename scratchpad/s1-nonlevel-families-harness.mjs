#!/usr/bin/env node
// S1 NON-LEVEL ART FAMILIES (Parcel B) — the real app under CDP. Sibling of
// s1-sonic-sprite-harness.mjs (same scaffold: VITE_AURORA_DEBUG=1 build under
// xvfb+CDP, real s1disasm, everything read back through window.__dbg / DOM).
//
//   1  boot, open s1disasm, GHZ1 ready
//   2  VENUE: the sprite list's "Shared objects" section carries ALL 13 named
//      family rows (Shield & Invincibility … SS Result Emeralds) alongside
//      Boss Items
//   3  CONTINUE SCREEN: clicking its row opens doc:sprite:s1:continue — 8
//      frames; frame 0's "CONTINUE" letters draw (composite Title Cards slice
//      at +$80 — nonblank well past the primary art's own pixels), and the
//      mini-Sonic frame 6 draws from the frameSources pool
//   4  PALETTE (continue): the standalone palette equals LINE 0 of the real
//      palette/Special Stage Continue Bonus.bin, decoded 3-bit→8-bit exactly
//      as decodeGenesisColor does (index 0 alpha 0) — proving palFile seeding,
//      since NO level palette was involved in a continue-screen doc
//   5  TITLE SCREEN SONIC: its row opens doc:sprite:s1:titlesonic — 8 frames,
//      declared finger-wag frame 6 substantially nonblank
//   6  PALETTE (titlesonic): standalone palette equals LINE 1 of the real
//      palette/Title Screen.bin (Tile_Pal2 in obGfx) AND differs from line 0
//      — the line SELECTION is load-bearing, not just the file read
//   7  LEVEL-FREE: with the level store reset to idle, the Game Over family
//      still opens (named docs are zone-free by construction)
//
// A STALE dist/ MAKES EVERY ROW VACUOUS — same guard as the siblings: refuse
// to run when any source file is newer than the built main bundle.
//
// Usage: node scratchpad/s1-nonlevel-families-harness.mjs   (VERBOSE=1 for app logs)

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));   // this worktree
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const SHOTS = join(ROOT, 'scratchpad/shots-s1-families');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}

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
async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function clickEl(c, expr) {
  const r = await c.json(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  if (!r) return false;
  await mouse(c, 'mousePressed', r.x, r.y);
  await sleep(40);
  await mouse(c, 'mouseReleased', r.x, r.y, { buttons: 0 });
  await sleep(300);
  return true;
}

/** Decode a palette .bin's LINE (32 bytes at line*32) the way the app does
 *  (core/formats/palette.ts decodeGenesisColor: 3-bit channels scaled 0-255,
 *  index 0 alpha 0 per the checkout's sprite convention). */
function decodePalLine(relPath, line) {
  const bytes = readFileSync(join(S1DIR, relPath));
  const out = [];
  for (let i = 0; i < 16; i++) {
    const w = (bytes[line * 32 + i * 2] << 8) | bytes[line * 32 + i * 2 + 1];
    const c3 = (v) => Math.round(v * 255 / 7);
    out.push({ r: c3((w >> 1) & 7), g: c3((w >> 5) & 7), b: c3((w >> 9) & 7), a: i === 0 ? 0 : 255 });
  }
  return out;
}
const sameColors = (a, b) => a.length === 16 && b.length === 16
  && a.every((c, i) => c.r === b[i].r && c.g === b[i].g && c.b === b[i].b && c.a === b[i].a);

// The 13 Parcel B display names, as S1ObjectSection renders them (the row's
// title is "Open <name>'s art + mappings" / "<name> — currently open").
const FAMILY_NAMES = [
  'Shield & Invincibility', 'HUD', 'Title Screen Sonic', 'Press Start / TM',
  'Title Cards', 'Game Over', 'Continue Screen', 'Ending Sonic',
  'Ending Emeralds', 'Ending StH Logo', 'Try Again', 'Credits Font',
  'SS Result Emeralds',
];

const SPRITE_ROW_SCAN = `(() => {
  const rows = [...document.querySelectorAll('button')]
    .filter((b) => (b.title || '').includes('art + mappings') || (b.title || '').includes('currently open'));
  return rows.map((b) => {
    let sect = b.parentElement; // the list div
    const root = sect ? sect.parentElement : null;
    const header = root && root.firstElementChild ? root.firstElementChild.textContent.replace(/\\s+/g, ' ').trim() : '';
    return { text: b.textContent.replace(/\\s+/g, ' ').trim(), title: b.title, header };
  });
})()`;

/** Click a named family's row (by its "Open <name>" title prefix) and wait for
 *  its doc to become active. */
async function openFamily(c, name, docKey) {
  const clicked = await clickEl(c,
    `[...document.querySelectorAll('button')].find((b) => (b.title || '').startsWith(${JSON.stringify(`Open ${name}`)}))`);
  if (!clicked) return { clicked, s: null };
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const s = await c.json('window.__dbg.spriteState()').catch(() => null);
    if (s && s.activeDocId === `doc:sprite:s1:${docKey}`) return { clicked, s };
  }
  return { clicked, s: await c.json('window.__dbg.spriteState()').catch(() => null) };
}

async function main() {
  // --- Stale-dist guard (see header) ---------------------------------------
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }
  if (!existsSync(join(S1DIR, 'artnem/Continue Screen Sonic.nem'))) {
    throw new Error(`${S1DIR}/artnem/Continue Screen Sonic.nem missing — nothing to test`);
  }

  let app = null, c = null;
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
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

    // --- Row 1: open s1disasm; GHZ1 auto-opens ------------------------------
    await c.evalExpr(`void window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = { zones: 0 };
    for (let i = 0; i < 30 && !(proj.zones > 0); i++) {
      await sleep(500);
      proj = await c.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
    }
    let lvl = { status: 'idle' };
    for (let i = 0; i < 30 && lvl.status !== 'ready'; i++) {
      await sleep(500);
      lvl = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
    }
    check('1', 'the app opened s1disasm and GHZ1 is ready',
      proj.zones > 0 && lvl.status === 'ready' && lvl.zone === 'ghz',
      `proj=${JSON.stringify(proj)} level=${JSON.stringify(lvl)}`);

    // Surface sprite mode (any object doc brings up the sprite list panel).
    await c.evalExpr('window.__dbg.editObjectArt(0x25)'); // Ring — cheap, zone-free
    await sleep(2500);

    // --- Row 2: VENUE — all 13 family rows under "Shared objects" -----------
    const rows = await c.json(SPRITE_ROW_SCAN);
    await shot(c, 'sprite-list');
    const missing = FAMILY_NAMES.filter((n) => !rows.some((r) =>
      (r.title.startsWith(`Open ${n}`) || r.title.startsWith(`${n} —`)) && r.header === 'Shared objects'));
    check('2', 'all 13 named family rows sit under "Shared objects"',
      missing.length === 0,
      missing.length ? `missing: ${missing.join(' | ')}` : `${FAMILY_NAMES.length} rows present`);

    // --- Rows 3+4: Continue Screen — composite render + palFile palette -----
    const cont = await openFamily(c, 'Continue Screen', 'continue');
    await shot(c, 'continue-doc');
    // Frame 0 ("CONTINUE" text): its letters resolve ONLY through the Title
    // Cards slice at +$80; the vitest render suite measured 995 nonblank px
    // for the whole frame — demand a real spread here without pinning it.
    // Frame 6 (mini-Sonic) draws from the frameSources pool.
    check('3', 'Continue Screen opens: 8 frames, letters frame 0 nonblank (composite slice), mini-Sonic frame 6 nonblank (frameSources)',
      cont.clicked && cont.s?.activeDocId === 'doc:sprite:s1:continue' && cont.s?.frames === 8
      && cont.s?.frameCoverage[0] > 500 && cont.s?.frameCoverage[6] > 100,
      `clicked=${cont.clicked} doc=${cont.s?.activeDocId} frames=${cont.s?.frames} coverage[0,6]=${JSON.stringify([cont.s?.frameCoverage?.[0], cont.s?.frameCoverage?.[6]])}`);

    const contPal = await c.json('window.__dbg.spritePalette()');
    const contWant = decodePalLine('palette/Special Stage Continue Bonus.bin', 0);
    check('4', 'Continue palette = LINE 0 of palette/Special Stage Continue Bonus.bin (palFile seeding, no level palette)',
      contPal.mode === 'standalone' && sameColors(contPal.colors, contWant),
      `mode=${contPal.mode} first3=${JSON.stringify(contPal.colors?.slice(0, 3))} want=${JSON.stringify(contWant.slice(0, 3))}`);

    // --- Rows 5+6: Title Screen Sonic — declared frame + palette LINE 1 -----
    const tson = await openFamily(c, 'Title Screen Sonic', 'titlesonic');
    await shot(c, 'titlesonic-doc');
    check('5', 'Title Screen Sonic opens: 8 frames, finger-wag frame 6 selected and substantially nonblank',
      tson.clicked && tson.s?.activeDocId === 'doc:sprite:s1:titlesonic' && tson.s?.frames === 8
      && tson.s?.frameCoverage[6] > 2000,
      `clicked=${tson.clicked} doc=${tson.s?.activeDocId} frames=${tson.s?.frames} coverage[6]=${tson.s?.frameCoverage?.[6]}`);

    const tsonPal = await c.json('window.__dbg.spritePalette()');
    const tsonWant = decodePalLine('palette/Title Screen.bin', 1);
    const tsonLine0 = decodePalLine('palette/Title Screen.bin', 0);
    check('6', 'Title Sonic palette = LINE 1 of palette/Title Screen.bin (Tile_Pal2) and line 1 ≠ line 0 (selection is load-bearing)',
      tsonPal.mode === 'standalone' && sameColors(tsonPal.colors, tsonWant) && !sameColors(tsonWant, tsonLine0),
      `mode=${tsonPal.mode} first3=${JSON.stringify(tsonPal.colors?.slice(0, 3))} want=${JSON.stringify(tsonWant.slice(0, 3))}`);

    // --- Row 7: LEVEL-FREE — Game Over with the level store idle ------------
    // The zone-gated sprite list unmounts with no level, so this row drives
    // the SAME editNamedArtDoc doorway the Explorer's ungated named rows use,
    // via the debug hook (string ref) — proving the zone-free named open.
    await c.evalExpr('window.__dbg.resetLevel()');
    await sleep(300);
    const lvlDown = await c.json('window.__dbg.levelState()');
    const goClicked = await c.evalExpr(`window.__dbg.editObjectArt('gameover')`);
    await sleep(2000);
    const gover = { clicked: goClicked === true, s: await c.json('window.__dbg.spriteState()').catch(() => null) };
    await shot(c, 'gameover-doc');
    check('7', 'LEVEL-FREE: with the level idle, Game Over still opens (named docs are zone-free) — 4 frames, "GAME" frame nonblank',
      lvlDown.status !== 'ready' && gover.clicked && gover.s?.activeDocId === 'doc:sprite:s1:gameover'
      && gover.s?.frames === 4 && gover.s?.frameCoverage[0] > 300,
      `levelBefore=${lvlDown.status} clicked=${gover.clicked} doc=${gover.s?.activeDocId} frames=${gover.s?.frames} coverage[0]=${gover.s?.frameCoverage?.[0]}`);
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* gone */ } }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
