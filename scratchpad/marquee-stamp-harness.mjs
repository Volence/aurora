#!/usr/bin/env node
// THE OWNER'S FIRST REAL CRASH, AS A SCRIPT: marquee-select a region of the
// REAL aeon map, save it as a chunk stamp, arm the stamp, hover, click.
//
// The narrative this reproduces (owner report, 2026-08-19 session): they
// marquee-selected a region wanting copy/paste, found only "save as chunk",
// and when they went to USE the stamp "there was no press" and the app died —
// the sole terminal trace was `[close] renderer did not answer; closing
// anyway` (dev server, so the renderer exception never reached the terminal).
//
// Root cause under test: MapViewport's stamp ghost sizes its ImageData to the
// chunk's NATIVE pixel dims (widthTiles*8 x heightTiles*8) but fills it from
// rasterizeAeonChunk, which always returns a fixed 128x128 buffer — so any
// marquee-saved chunk smaller than 16x16 tiles throws RangeError on
// `img.data.set(rgba)`. Thrown from mousemove it eats the ghost (the "no
// press" half); after the stamp click bumps historyVersion the SAME throw
// re-fires inside the render useEffect, React unmounts the whole root, and
// the close guard's confirm UI can never run — hence the 15s timeout line.
//
// Rows (all read back through real DOM + the read-only aeon probe):
//   1  the app opens the REAL aeon project (never written to) and a level tab
//      + Layout facet mount the real MapViewport
//   2  a real 'm' arms the marquee; a real 5x3-tile drag commits, and the
//      committed rect is the 16px-block SNAP of the drag (6x4) — the measured
//      granularity finding, asserted not narrated
//   3  the real "Save as chunk" button adds the selection to the library:
//      dims match the marquee, and the chunk carries actual art
//      (nonzeroTiles > 0 — the anti-vacuous control for row 7)
//   4  a real click on the new thumbnail selects it; a real 'k' arms the stamp
//   5  hovering the armed stamp over the map raises NO renderer exception
//      (RED on the broken build: RangeError from drawCollisionPreview)
//   6  the armed-stamp ghost is actually VISIBLE: the preview canvas has
//      painted pixels over the hovered footprint ("there was no press")
//   7  the stamp click WRITES THE DOCUMENT: the target footprint — all-air
//      before, asserted — now equals the chunk's nametable, nonzero words
//      included; and no exception fired, and the React root is still alive
//      (RED on the broken build: the effect-phase re-throw kills the root)
//
// Usage: node scratchpad/marquee-stamp-harness.mjs   (VERBOSE=1 for app logs)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9388);
const ROOT = AURORA_DIR;   // this worktree
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEON_DIR = siblingPathOrUnresolved('aeon');               // OPEN ONLY — never written
const SHOTS = join(ROOT, 'scratchpad/shots-marquee-stamp');
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
  const exceptions = [];        // every Runtime.exceptionThrown, verbatim
  const consoleErrors = [];     // console.error lines — React logs its unmount here
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push(d.exception?.description ?? d.text ?? '(unknown)');
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
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
  return {
    ready, send, evalExpr, exceptions, consoleErrors,
    json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)),
    close: () => ws.close(),
  };
}
async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}
async function key(c, k, code) {
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
}
async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mousePressed' || type === 'mouseMoved' && opts.down ? 1 : 0),
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
  });
}

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS (lesson inherited from
  // classic-playtest-harness.mjs): refuse to run when any source file is newer
  // than the built main bundle.
  const distM = statSync(MAIN).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }

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
    await sleep(3000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // --- Row 1: open the real aeon project; mount the real map -------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEON_DIR)})`);
    await sleep(1500);
    const st0 = await c.json('window.__dbg.aeon.state()');
    await c.evalExpr(`window.__dbg.activate(${JSON.stringify(st0.zone)}, ${JSON.stringify(st0.act)})`);
    await sleep(800);
    const layoutClicked = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === 'Layout');
      if (!b) return 'no-pill'; b.click(); return 'clicked';
    })()`);
    await sleep(1200);
    const hasMap = await c.evalExpr('!!document.getElementById("map-canvas")');
    check('1', 'the real aeon project opens and the Layout facet mounts the real MapViewport',
      st0.open === true && st0.sections > 0 && layoutClicked === 'clicked' && hasMap,
      `state=${JSON.stringify(st0)} layout=${layoutClicked} map=${hasMap}`);
    if (!hasMap) throw new Error('no map canvas — nothing below can run');

    // Deterministic camera. Section 0 sits at world (0,0) whatever the grid is.
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(400);
    const rect = await c.json(`document.getElementById('map-canvas').getBoundingClientRect().toJSON()`);
    const toScreen = (tileCol, tileRow) => ({           // center of the tile, zoom 1, vp (0,0)
      x: rect.left + tileCol * 8 + 4,
      y: rect.top + tileRow * 8 + 4,
    });

    // Find, in the visible corner of section 0, (a) a 5x3-tile drag whose
    // content has art, and (b) a chunk-aligned all-air target for the stamp.
    // The nametable is read through the probe; the numbers assert the document.
    const SCAN_W = Math.min(120, Math.floor(rect.width / 8));
    const SCAN_H = Math.min(100, Math.floor(rect.height / 8));
    const scan = await c.json(`window.__dbg.aeon.ntRect(0, 0, 0, ${SCAN_W}, ${SCAN_H})`);
    if (!scan) throw new Error('section 0 is missing — pick another section');
    const nt = (col, row) => scan[row * SCAN_W + col] ?? 0;
    const rectHasArt = (c0, r0, w, h) => {
      let n = 0;
      for (let r = r0; r < r0 + h; r++) for (let x = c0; x < c0 + w; x++) if (nt(x, r) !== 0) n++;
      return n;
    };
    // (a) the drag: 5x3 tiles with at least 2 REAL-TILE words (tileIndex != 0,
    // the blank-chunk rule's own test — attribute-only words with tile 0 count
    // as invisible), ODD-sized on purpose so the snap has something to snap.
    const rectHasTiles = (c0, r0, w, h) => {
      let n = 0;
      for (let r = r0; r < r0 + h; r++) for (let x = c0; x < c0 + w; x++) if ((nt(x, r) & 0x7ff) !== 0) n++;
      return n;
    };
    let drag = null;
    for (let r = 1; r < SCAN_H - 4 && !drag; r++) {
      for (let x = 1; x < SCAN_W - 6 && !drag; x++) {
        if (rectHasTiles(x, r, 5, 3) >= 2) drag = { c0: x, r0: r };
      }
    }
    if (!drag) throw new Error('no art in the visible corner of section 0 — scan wider');
    const expCol = Math.floor(drag.c0 / 2) * 2, expRow = Math.floor(drag.r0 / 2) * 2;
    const expW = Math.ceil((drag.c0 + 5) / 2) * 2 - expCol, expH = Math.ceil((drag.r0 + 3) / 2) * 2 - expRow;

    // --- Row 2: real 'm', real drag; the committed marquee is the SNAP -----
    // Focus the map first with a plain left click on an empty-ish corner.
    await key(c, 'm', 'KeyM');
    await sleep(200);
    const armed = await c.json('window.__dbg.aeon.state()');
    const p0 = toScreen(drag.c0, drag.r0), p1 = toScreen(drag.c0 + 4, drag.r0 + 2);
    await mouse(c, 'mousePressed', p0.x, p0.y);
    await mouse(c, 'mouseMoved', (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, { down: true });
    await mouse(c, 'mouseMoved', p1.x, p1.y, { down: true });
    await mouse(c, 'mouseReleased', p1.x, p1.y);
    await sleep(300);
    const m = await c.json('window.__dbg.aeon.marquee()');
    check('2', "a real 5x3-tile drag commits the 16px-block SNAP of itself (the granularity finding, measured)",
      armed.tool === 'marquee' && !!m && m.sectionIndex === 0
      && m.col === expCol && m.row === expRow && m.w === expW && m.h === expH,
      `tool=${armed.tool} marquee=${JSON.stringify(m)} expected={col:${expCol},row:${expRow},w:${expW},h:${expH}} (dragged 5x3 at ${drag.c0},${drag.r0})`);
    if (!m) throw new Error('no committed marquee — nothing below can run');
    await shot(c, '1-marquee');

    // --- Row 3: the real Save-as-chunk button ------------------------------
    const before = await c.json('window.__dbg.aeon.chunkIds()');
    const saveClicked = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Save as chunk');
      if (!b) return 'no-button'; b.click(); return 'clicked';
    })()`);
    await sleep(400);
    const after = await c.json('window.__dbg.aeon.chunkIds()');
    const newId = after.find((id) => !before.includes(id));
    const info = newId ? await c.json(`window.__dbg.aeon.chunkInfo(${JSON.stringify(newId)})`) : null;
    // Saving also ARMS the saved chunk as the stamp source — the user's next
    // act is stamping it, not finding it again in a 70+ thumbnail wall.
    const autoSel = await c.evalExpr('window.__dbg.aeon.selectedChunk()');
    check('3', 'Save as chunk adds the selection to the library (dims = marquee dims, real art) and selects it as the stamp source',
      saveClicked === 'clicked' && !!newId && !!info
      && info.widthTiles === m.w && info.heightTiles === m.h && info.nonzeroTiles > 0
      && autoSel === newId,
      `save=${saveClicked} new=${newId} autoSelected=${autoSel === newId} info=${JSON.stringify(info)}`);
    if (!newId || !info) throw new Error('no saved chunk — nothing below can run');

    // --- Row 4: select it in the REAL grid; arm the stamp ------------------
    await key(c, 'k', 'KeyK');           // stamp-chunk — mounts the Chunks grid
    await sleep(500);
    const thumbClicked = await c.evalExpr(`(() => {
      const cells = [...document.querySelectorAll('button')].filter((e) => e.querySelector('canvas'));
      const b = cells.find((e) => e.title === ${JSON.stringify(info.name)});
      if (!b) {
        return 'no-thumb: cells=' + cells.length
          + ' lastTitles=' + JSON.stringify(cells.slice(-3).map((e) => e.title));
      }
      b.scrollIntoView(); b.click(); return 'clicked';
    })()`);
    await sleep(300);
    const sel = await c.evalExpr('window.__dbg.aeon.selectedChunk()');
    const st1 = await c.json('window.__dbg.aeon.state()');
    check('4', "clicking the new thumbnail in the real grid selects it and 'k' armed the stamp",
      thumbClicked === 'clicked' && sel === newId && st1.tool === 'stamp-chunk',
      `thumb=${thumbClicked} selected=${sel} tool=${st1.tool}`);

    // (b) the target: a chunk-aligned all-air footprint, found NOW (the saved
    // chunk's dims decide the stamp's own snap: base = floor(t/dim)*dim).
    let target = null;
    const overlapsMarquee = (bc, br) =>
      bc < m.col + m.w && bc + info.widthTiles > m.col && br < m.row + m.h && br + info.heightTiles > m.row;
    for (let br = 0; br + info.heightTiles <= SCAN_H && !target; br += info.heightTiles) {
      for (let bc = 0; bc + info.widthTiles <= SCAN_W && !target; bc += info.widthTiles) {
        if (rectHasArt(bc, br, info.widthTiles, info.heightTiles) === 0
            && !overlapsMarquee(bc, br)) target = { col: bc, row: br };
      }
    }
    if (!target) throw new Error('no all-air aligned footprint in view — scan wider or pan');
    const preRect = await c.json(
      `window.__dbg.aeon.ntRect(0, ${target.col}, ${target.row}, ${info.widthTiles}, ${info.heightTiles})`);
    const preBlank = preRect.every((wd) => wd === 0);

    // --- Row 5: hover must not throw ---------------------------------------
    const exBeforeHover = c.exceptions.length;
    const hoverPt = toScreen(target.col + 1, target.row + 1);   // inside the footprint
    await mouse(c, 'mouseMoved', hoverPt.x, hoverPt.y);
    await sleep(150);
    await mouse(c, 'mouseMoved', hoverPt.x + 2, hoverPt.y + 1);
    await sleep(400);
    const hoverExceptions = c.exceptions.slice(exBeforeHover);
    check('5', 'hovering the armed stamp over the map raises NO renderer exception',
      hoverExceptions.length === 0,
      hoverExceptions.length ? `EXCEPTION: ${hoverExceptions[0].split('\n')[0]}` : 'clean');

    // --- Row 6: the ghost is actually visible ("there was no press") -------
    // The preview canvas is #map-canvas's sibling; count painted pixels over
    // the hovered footprint. The ghost = art at 55% alpha + a footprint
    // outline, so ANY painted pixel there means the user saw something.
    const ghostPixels = await c.evalExpr(`(() => {
      const pcv = document.querySelector('#map-canvas + canvas');
      if (!pcv) return -1;
      const ctx = pcv.getContext('2d');
      const d = ctx.getImageData(${Math.round(target.col * 8)}, ${Math.round(target.row * 8)},
        ${info.widthTiles * 8}, ${info.heightTiles * 8}).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
      return n;
    })()`);
    check('6', 'the armed-stamp ghost is VISIBLE on the preview canvas over the hovered footprint',
      ghostPixels > 0, `paintedPixels=${ghostPixels}`);
    await shot(c, '2-ghost');

    // --- Row 7: the click writes the document and the app survives ---------
    const exBeforeClick = c.exceptions.length;
    const clickPt = toScreen(target.col + 1, target.row + 1);
    await mouse(c, 'mousePressed', clickPt.x, clickPt.y);
    await mouse(c, 'mouseReleased', clickPt.x, clickPt.y);
    await sleep(700);
    const clickExceptions = c.exceptions.slice(exBeforeClick);
    const rootAlive = await c.evalExpr(
      '(document.getElementById("root")?.childElementCount ?? 0) > 0').catch(() => false);
    const postRect = await c.json(
      `window.__dbg.aeon.ntRect(0, ${target.col}, ${target.row}, ${info.widthTiles}, ${info.heightTiles})`)
      .catch(() => null);
    // Compare the stamped footprint to the SOURCE marquee region — the chunk
    // was captured from (m.col,m.row,m.w,m.h), so the document must now carry
    // those exact words at the target. Air words in the source clear too, but
    // preBlank means only the nonzero ones distinguish anything.
    const srcRect = await c.json(
      `window.__dbg.aeon.ntRect(0, ${m.col}, ${m.row}, ${m.w}, ${m.h})`).catch(() => null);
    const matches = !!postRect && !!srcRect && postRect.length === srcRect.length
      && postRect.every((wd, i) => wd === srcRect[i]);
    const nonzeroWritten = !!postRect && postRect.some((wd) => wd !== 0);
    check('7', 'the stamp click WRITES the map (blank target now equals the saved selection, nonzero words included), no exception, root alive',
      preBlank && clickExceptions.length === 0 && rootAlive === true && matches && nonzeroWritten,
      `preBlank=${preBlank} exceptions=${clickExceptions.length ? clickExceptions[0].split('\n')[0] : 0} `
      + `rootAlive=${rootAlive} matches=${matches} nonzeroWritten=${nonzeroWritten}`);
    await shot(c, '3-after-stamp');

    if (c.consoleErrors.length && process.env.VERBOSE) {
      console.log('\nconsole.error lines:');
      for (const e of c.consoleErrors.slice(0, 10)) console.log(`  ${e.split('\n')[0]}`);
    }
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) { try { process.kill(-app.pid, 'SIGKILL'); } catch { try { process.kill(app.pid, 'SIGKILL'); } catch { /* gone */ } } }
  }

  console.log(`\n${results.length - fails.length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
