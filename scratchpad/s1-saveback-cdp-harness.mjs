#!/usr/bin/env node
// S1 SAVE-BACK (uncompressed + DPLC) — the real app under CDP, closing the
// TAGGED runtime follow-up from the save-back parcel. Sibling of
// s1-sonic-sprite-harness.mjs (same scaffold: VITE_AURORA_DEBUG=1 build under
// xvfb+CDP, window.__dbg readbacks) and classic-playtest-harness.mjs (temp
// copies, byte-hash evidence).
//
// SAFETY: the app NEVER opens the real s1disasm. A temp copy of the whole
// disasm (minus .git) is made inside scratchpad/ and the project opens THAT;
// the real s1disasm's `git status --short` is captured before and asserted
// byte-identical after.
//
// Every expectation is DERIVED at runtime from the temp copy's files through
// the same core the app ships (parseAsmMappings / parseAsmDPLC /
// reconstructFromFrames bundled from src via esbuild) — no hardcoded frames,
// tiles, offsets, or hashes.
//
// Rows:
//   1  the app opens the TEMP COPY as a classic project (GHZ1 ready)
//   2  Edit-art on $01 checks out Sonic's doc — 88 frames, canvas size matches
//      the node-side render, and the save posture is CAPTURED (relPath
//      artunc/Sonic.unc, compression uncompressed, DPLC lists present, no
//      refusal recorded)
//   3  ANTI-VACUOUS: the derived edit frame renders non-blank, and its FNV
//      hash equals the node-side render of the same files — which proves the
//      sentinel value is ABSENT pre-edit (node knows the pixel's value there,
//      and it differs from the sentinel)
//   4  ZERO-EDIT ROUND TRIP: a same-value paint (real edit path — dirties the
//      doc, changes no pixel) + real Ctrl+S -> the on-disk .unc is
//      BYTE-IDENTICAL to pristine, both .asm files untouched, the save toast
//      fired without any shared-pool note, and the dirty flag cleared
//   5  SHARED-TILE EDIT: paint the sentinel on the derived multi-referenced
//      tile through the derived frame + real Ctrl+S -> (a) on-disk changes
//      confined to the derived tile's 32-byte record (offsets printed),
//      (b) the toast names the DERIVED co-affected frames, (c) both .asm
//      files still byte-identical (DPLC/mappings never rewritten)
//   6  the real s1disasm's `git status --short` is byte-identical to the
//      pre-run capture (nothing ever touched it)
//
// A STALE dist/ MAKES EVERY ROW VACUOUS — same guard as the siblings: refuse
// to run when any source file is newer than the built main bundle.
//
// Usage: node scratchpad/s1-saveback-cdp-harness.mjs
//        (VERBOSE=1 for app logs, KEEP=1 to keep the temp project dir)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import * as http from 'node:http';
import * as esbuild from 'esbuild';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = AURORA_DIR;   // this worktree
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = join(ROOT, 'scratchpad/shots-s1-saveback');
mkdirSync(SHOTS, { recursive: true });

const ART_REL = 'artunc/Sonic.unc';
const MAP_REL = '_maps/Sonic.asm';
const DPLC_REL = '_maps/Sonic - Dynamic Gfx Script.asm';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const fnv1a = (d) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
function changedOffsets(a, b) {
  if (a.length !== b.length) return null; // length drift is its own failure
  const out = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
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
/** Real Ctrl+S through the window keydown handler (App.tsx saveActive path). */
async function ctrlS(c) {
  const base = { key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 };
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
/** Poll __dbg.toasts() while a save settles; return every message seen. */
async function collectToasts(c, ms = 8000) {
  const seen = new Map();
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ts = await c.json('window.__dbg.toasts()').catch(() => []);
    for (const t of ts) seen.set(t.message, t.type);
    await sleep(150);
  }
  return [...seen.keys()];
}

// ---------------------------------------------------------------------------
// Node-side derivation: bundle the SHIPPED core (same parsers/render the app
// uses) and derive the shared-tile edit spot from the temp copy's real files.
// ---------------------------------------------------------------------------
async function loadCore() {
  const entry = `
    export { parseAsmMappings, parseAsmDPLC } from ${JSON.stringify(join(ROOT, 'src/core/import/asm-mappings.ts'))};
    export { reconstructFromFrames } from ${JSON.stringify(join(ROOT, 'src/core/import/sprite-import.ts'))};
    export { parseTiles } from ${JSON.stringify(join(ROOT, 'src/core/formats/tiles.ts'))};
  `;
  const outfile = join(tmpdir(), `s1-saveback-core-${process.pid}.mjs`);
  await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, sourcefile: 'entry.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  });
  const mod = await import(`file://${outfile}`);
  rmSync(outfile, { force: true });
  return mod;
}

/** The probe's walk: derive the FIRST multi-referenced pool tile with a
 *  single-coverage canvas pixel on one of its frames (nothing hardcoded). */
function deriveSharedSpot(frames, dplc, recon) {
  const { originX, originY, width, height } = recon;
  const sharing = new Map(); // pool tile -> frames covering it (sorted by walk order)
  for (let i = 0; i < frames.length; i++) {
    const seen = new Set();
    for (const p of frames[i].pieces) {
      for (let c = 0; c < p.widthCells; c++) {
        for (let r = 0; r < p.heightCells; r++) {
          const src = dplc[i]?.[p.tile + c * p.heightCells + r];
          if (src !== undefined) seen.add(src);
        }
      }
    }
    for (const t of seen) {
      if (!sharing.has(t)) sharing.set(t, []);
      sharing.get(t).push(i);
    }
  }
  const coverageCount = (i, dx, dy) => {
    let n = 0;
    for (const p of frames[i].pieces) {
      const x0 = p.xOffset + originX, y0 = p.yOffset + originY;
      if (dx >= x0 && dx < x0 + p.widthCells * 8 && dy >= y0 && dy < y0 + p.heightCells * 8) n++;
    }
    return n;
  };
  const sharedTiles = [...sharing.entries()].filter(([, fr]) => fr.length > 1).sort((a, b) => a[0] - b[0]);
  if (sharedTiles.length === 0) throw new Error('unmeasurable: no shared tiles derived — the probe found 178');
  for (const [target, refFrames] of sharedTiles) {
    for (const f of refFrames) {
      for (const p of frames[f].pieces) {
        for (let oc = 0; oc < p.widthCells; oc++) {
          for (let or = 0; or < p.heightCells; or++) {
            const sc = p.xFlip ? p.widthCells - 1 - oc : oc;
            const sr = p.yFlip ? p.heightCells - 1 - or : or;
            if (dplc[f]?.[p.tile + sc * p.heightCells + sr] !== target) continue;
            for (let sy = 0; sy < 8; sy++) {
              for (let sx = 0; sx < 8; sx++) {
                const px = p.xFlip ? 7 - sx : sx;
                const py = p.yFlip ? 7 - sy : sy;
                const dx = p.xOffset + originX + oc * 8 + px;
                const dy = p.yOffset + originY + or * 8 + py;
                if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;
                if (coverageCount(f, dx, dy) === 1) {
                  return { target, refFrames, f, dx, dy, sx, sy, sharedCount: sharedTiles.length };
                }
              }
            }
          }
        }
      }
    }
  }
  throw new Error('unmeasurable: no single-coverage pixel on any shared tile');
}

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS. Both halves of that question name
  // the tree the run is AGAINST, never the tree this file lives in — the O52
  // block in lib/run-root.mjs says why, and this is the only spelling of it.
  assertFreshBuild(RUN);
  if (!existsSync(join(S1DIR, ART_REL))) throw new Error(`${S1DIR}/${ART_REL} missing — nothing to test`);

  // --- Real-disasm safety net: capture status BEFORE anything runs ---------
  const preStatus = execSync('git status --short', { cwd: S1DIR }).toString();

  // --- Temp project copy (the ONLY tree the app opens) ---------------------
  const tempRoot = mkdtempSync(join(ROOT, 'scratchpad/.tmp-s1-saveback-'));
  const PROJ = join(tempRoot, 's1disasm');
  console.log(`[setup] copying s1disasm -> ${PROJ} (minus .git)…`);
  execSync(`cp -a ${JSON.stringify(S1DIR)} ${JSON.stringify(PROJ)}`, { shell: '/bin/bash' });
  rmSync(join(PROJ, '.git'), { recursive: true, force: true });

  const pristineArt = new Uint8Array(readFileSync(join(PROJ, ART_REL)));
  const pristineMapSha = sha(join(PROJ, MAP_REL));
  const pristineDplcSha = sha(join(PROJ, DPLC_REL));

  // --- Node-side derivation from the TEMP copy's files ---------------------
  const core = await loadCore();
  const frames = core.parseAsmMappings(readFileSync(join(PROJ, MAP_REL), 'utf8'));
  const dplc = core.parseAsmDPLC(readFileSync(join(PROJ, DPLC_REL), 'utf8'));
  const tiles = core.parseTiles(pristineArt);
  const recon = core.reconstructFromFrames(frames, pristineArt, 'uncompressed', dplc);
  const spot = deriveSharedSpot(frames, dplc, recon);
  const before = tiles[spot.target].pixels[spot.sy * 8 + spot.sx];
  const sentinel = (before + 1) % 16;
  const expectedCo = spot.refFrames.filter((x) => x !== spot.f);
  const preHash = fnv1a(recon.frames[spot.f]);
  const postFrame = recon.frames[spot.f].slice();
  postFrame[spot.dy * recon.width + spot.dx] = sentinel;
  const postHash = fnv1a(postFrame);
  console.log(`[derived] pool tile ${spot.target} shared by frames [${spot.refFrames}]; edit via frame ${spot.f}`
    + ` at canvas (${spot.dx},${spot.dy}) -> in-tile (${spot.sx},${spot.sy}); value ${before} -> ${sentinel};`
    + ` expect co-affected [${expectedCo}]; ${spot.sharedCount} shared tiles total`);
  if (preHash === postHash) throw new Error('derivation broke: sentinel does not change the frame hash');

  let app = null, c = null;
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN], {
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

    // --- Row 1: open the TEMP COPY as a project -----------------------------
    await c.evalExpr(`void window.__dbg.openDir(${JSON.stringify(PROJ)})`);
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
    check('1', 'the app opened the TEMP COPY as a classic project (GHZ1 ready)',
      proj.zones > 0 && lvl.status === 'ready',
      `proj=${JSON.stringify(proj)} level=${JSON.stringify(lvl)} dir=${PROJ}`);

    // --- Row 2: Sonic checks out with a CAPTURED save posture ---------------
    const opened = await c.evalExpr('window.__dbg.editObjectArt(0x01)');
    await sleep(2500);
    const st = await c.json('window.__dbg.spriteState()');
    const info = await c.json('window.__dbg.spriteSaveInfo()');
    await shot(c, 'sonic-doc');
    check('2', 'Edit-art $01: 88 frames, canvas matches the node render, save-back CAPTURED (unc + DPLC, no refusal)',
      opened === true && st.activeDocId === 'doc:sprite:s1:1' && st.frames === 88
      && st.frameW === recon.width && st.frameH === recon.height
      && info.relPath === ART_REL && info.compression === 'uncompressed'
      && info.hasDplc === true && info.refusal === null,
      `opened=${opened} doc=${st.activeDocId} frames=${st.frames} canvas=${st.frameW}x${st.frameH}`
      + ` (node ${recon.width}x${recon.height}) info=${JSON.stringify(info)}`);

    // --- Row 3: anti-vacuous — non-blank canvas, sentinel provably absent ---
    // The app's frame hash equals the node render of the same files, and the
    // node render's pixel at the edit spot is `before` (!== sentinel): the
    // sentinel is absent BEFORE any edit, and the canvas is genuinely drawn.
    check('3', `frame ${spot.f} renders non-blank AND hashes exactly like the node render (sentinel ${sentinel} absent pre-edit: pixel holds ${before})`,
      st.frameCoverage[spot.f] > 0 && st.frameHashes[spot.f] === preHash && before !== sentinel,
      `coverage=${st.frameCoverage[spot.f]} appHash=${st.frameHashes[spot.f]} nodeHash=${preHash}`);

    // --- Row 4: ZERO-EDIT round trip via real Ctrl+S ------------------------
    // Paint the pixel to its CURRENT value: the real edit path (undo record +
    // dirty flag) with zero net pixel change — Ctrl+S then routes the sprite
    // saver and the delta writer must emit byte-identical bytes.
    const painted0 = await c.evalExpr(`window.__dbg.spritePaint(${spot.f}, ${spot.dx}, ${spot.dy}, ${before})`);
    const dirty0 = (await c.json('window.__dbg.spriteSaveInfo()')).unsavedEdits;
    const hash0 = (await c.json('window.__dbg.spriteState()')).frameHashes[spot.f];
    await ctrlS(c);
    const toasts0 = await collectToasts(c);
    const artAfter0 = new Uint8Array(readFileSync(join(PROJ, ART_REL)));
    const offs0 = changedOffsets(artAfter0, pristineArt);
    const clean0 = (await c.json('window.__dbg.spriteSaveInfo()')).unsavedEdits === false;
    const saveToast0 = toasts0.find((m) => m.startsWith('Saved art to')) ?? '(none)';
    check('4', 'ZERO-EDIT: same-value paint + Ctrl+S -> byte-identical .unc, no shared-pool note, dirty cleared',
      painted0 === true && dirty0 === true && hash0 === preHash
      && offs0 !== null && offs0.length === 0
      && sha(join(PROJ, MAP_REL)) === pristineMapSha && sha(join(PROJ, DPLC_REL)) === pristineDplcSha
      && saveToast0.startsWith('Saved art to artunc/Sonic.unc') && !saveToast0.includes('shared pool tiles')
      && clean0,
      `painted=${painted0} dirtied=${dirty0} hashStable=${hash0 === preHash}`
      + ` changedBytes=${offs0 === null ? 'LENGTH DRIFT' : offs0.length} toast=${JSON.stringify(saveToast0)} cleanAfter=${clean0}`);

    // --- Row 5: SHARED-TILE edit via real Ctrl+S ----------------------------
    const painted1 = await c.evalExpr(`window.__dbg.spritePaint(${spot.f}, ${spot.dx}, ${spot.dy}, ${sentinel})`);
    const hash1 = (await c.json('window.__dbg.spriteState()')).frameHashes[spot.f];
    await ctrlS(c);
    const toasts1 = await collectToasts(c);
    await shot(c, 'after-shared-save');
    const artAfter1 = new Uint8Array(readFileSync(join(PROJ, ART_REL)));
    const offs1 = changedOffsets(artAfter1, pristineArt);
    const lo = spot.target * 32, hi = lo + 32;
    const confined = offs1 !== null && offs1.length > 0 && offs1.every((o) => o >= lo && o < hi);
    const word = expectedCo.length === 1 ? 'frame' : 'frames';
    const expectNote = `shared pool tiles also changed ${word} ${expectedCo.join(', ')}`;
    const saveToast1 = toasts1.find((m) => m.startsWith('Saved art to')) ?? '(none)';
    check('5', `SHARED EDIT: bytes confined to tile ${spot.target}'s record [${lo},${hi}); toast names co-affected [${expectedCo}]`,
      painted1 === true && hash1 === postHash && confined
      && saveToast1.includes(expectNote)
      && sha(join(PROJ, MAP_REL)) === pristineMapSha && sha(join(PROJ, DPLC_REL)) === pristineDplcSha,
      `painted=${painted1} hash=${hash1} (want ${postHash})`
      + ` changedOffsets=[${offs1 === null ? 'LENGTH DRIFT' : offs1.join(', ')}] toast=${JSON.stringify(saveToast1)}`);

    // --- Row 6: the REAL s1disasm was never touched -------------------------
    const postStatus = execSync('git status --short', { cwd: S1DIR }).toString();
    check('6', 'real s1disasm `git status --short` byte-identical to the pre-run capture',
      postStatus === preStatus,
      postStatus === preStatus ? '(identical)' : `PRE:\n${preStatus}POST:\n${postStatus}`);
  } finally {
    if (c) { await shot(c, 'final'); c.close(); }
    if (app) { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* gone */ } }
    if (process.env.KEEP) console.log(`[keep] temp project left at ${tempRoot}`);
    else rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log(`\n${fails.length === 0 ? 'ALL PASS' : `FAILURES: ${fails.join(', ')}`}  (${results.filter((r) => r.ok).length}/${results.length})`);
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`HARNESS ERROR: ${e.stack ?? e}`); process.exit(2); });
