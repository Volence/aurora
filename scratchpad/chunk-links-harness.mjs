#!/usr/bin/env node
// CHUNK IDENTITY, DRIVEN THROUGH THE REAL APP — owner ruling d-18c, ROADMAP row 91.
//
// The node suite cannot see any of this. `withLinkBreaks` at the two MapViewport
// brush sites, the stamp-time checkbox, the hover readout and the Detach button
// are a rendered surface plus a mouse gesture, and ~3,400 vitest tests pass while
// all four are broken. So every row below is a REAL pointer/keyboard event
// against the REAL aeon project, read back through `window.__dbg.aeon`.
//
// ═══ WHAT EACH ROW PROVES, AND WHICH ONES DO NOT DISCRIMINATE ═══
//
//   1   setup: the real aeon project opens, the Layout facet mounts the real
//       MapViewport, and the Chunk links panel is actually in the DOM.
//       DOES NOT DISCRIMINATE ALONE — it is the anti-vacuous gate for 2..9.
//   2   the checkbox exists, is UNCHECKED, and the store agrees. The ruling's
//       default is REMEMBER, and a checkbox defaulted the other way would look
//       identical in a screenshot.
//   2b  the panel's explanatory sentence PAINTS the ACT-scoped promise, and is
//       the live paragraph — it changes when the checkbox is really clicked and
//       changes back. It used to promise "every copy" while propagation reached
//       one act; the words themselves are asserted in node
//       (core/editing/__tests__/chunk-links-cross-act.test.ts), this row is
//       only "and they reach the screen".
//   3   a real stamp click records a placement over the WHOLE footprint, with
//       the armed chunk's id. Prints the plane readout it judges.
//   4   hovering the stamped region makes the panel NAME it — both the store
//       latch and the rendered text, printed.
//   5   the panel's real Detach button clears that placement AND LEAVES THE ART
//       ALONE (detaching turns a link into a copy). The nametable comparison is
//       the half that separates "detached" from "erased".
//   6   a real paint-tile STROKE breaks the links of exactly the tiles it
//       painted — the MapViewport `endPaintStroke` site, invisible to node.
//   7   a real paint-block CLICK breaks the links of exactly its 2x2 — the
//       MapViewport `paint-block` site, also invisible to node.
//   8   a real click on the checkbox arms detach, and the next real stamp writes
//       the art but records NO placement.
//   9   PROPAGATION: a real chunk edit saved from the Art facet rewrites the
//       tiles that still remember the chunk and NOT the one painted by hand in
//       row 6/7. Skipped with a stated reason if the composer gesture cannot be
//       reached (it reports SKIP, never PASS).
//
// ═══ DEVICE PIXELS ═══
// `devicePixelRatio` varies run to run on this box (observed at 1 and at 1.35
// hours apart), and at 1.35 the canvas rect is fractional. Every aim below is
// rounded to an INTEGER client pixel and every expectation is derived from that
// integer back through the app's own tile arithmetic; dpr and the rect are
// printed beside the results so the environment is visible in the log.
//
// Usage: node scratchpad/chunk-links-harness.mjs   (VERBOSE=1 for app logs)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9411);
const ROOT = AURORA_DIR;
// A WORKTREE HAS NO node_modules OF ITS OWN — npm resolves up, and so must this.
// Hardcoding `${ROOT}/node_modules/...` fails instantly here (ENOENT inside
// xvfb-run) and presents as "CDP target never appeared", which reads like a
// timing problem and is not one.
// That walk used to be a private copy here; O72 moved it into the module below,
// where it also requires a built `dist/` before calling a tree runnable and
// where a test can execute it.
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEON_DIR = siblingPathOrUnresolved('aeon');   // OPEN ONLY — never written; O66: a copy may be named
const SHOTS = join(ROOT, 'scratchpad/shots-chunk-links');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = []; const skips = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
function skip(id, name, why) {
  console.log(`SKIP  [${id}] ${name}\n        ${why}`);
  skips.push(id);
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
  const exceptions = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push(d.exception?.description ?? d.text ?? '(unknown)');
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
    ready, send, evalExpr, exceptions,
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
    buttons: opts.buttons ?? ((type === 'mousePressed' || (type === 'mouseMoved' && opts.down)) ? 1 : 0),
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
  });
}
async function click(c, x, y) {
  await mouse(c, 'mouseMoved', x, y);
  await mouse(c, 'mousePressed', x, y);
  await mouse(c, 'mouseReleased', x, y);
}

/** Click a DOM element found by a predicate over its text. Returns 'clicked' or
 *  a diagnostic string — never a silent no-op, so a row cannot go green on a
 *  gesture that never happened. */
const clickByText = (sel, text) => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
  const b = els.find((e) => e.textContent.trim() === ${JSON.stringify(text)});
  if (!b) return 'not-found: ' + JSON.stringify(els.slice(0, 12).map((e) => e.textContent.trim()));
  b.scrollIntoView(); b.click(); return 'clicked';
})()`;

async function main() {
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

    // ── Row 1: the real project, the real map, the real panel ───────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEON_DIR)})`);
    await sleep(1500);
    const st0 = await c.json('window.__dbg.aeon.state()');
    await c.evalExpr(`window.__dbg.activate(${JSON.stringify(st0.zone)}, ${JSON.stringify(st0.act)})`);
    await sleep(900);
    const layoutClicked = await c.evalExpr(clickByText('[aria-label="Facets"] button', 'Layout'));
    await sleep(1000);
    await key(c, 'k', 'KeyK');            // arm stamp-chunk — mounts Chunks + Chunk links
    await sleep(600);
    const hasMap = await c.evalExpr('!!document.getElementById("map-canvas")');
    const hasPanel = await c.evalExpr(
      '!!document.querySelector(\'input[aria-label="Detach on stamp"]\')');
    const st1 = await c.json('window.__dbg.aeon.state()');
    check('1', 'the real aeon project opens, the Layout facet mounts the real MapViewport, and the Chunk links panel is in the DOM',
      st0.open === true && st0.sections > 0 && layoutClicked === 'clicked'
      && hasMap && hasPanel && st1.tool === 'stamp-chunk',
      `state=${JSON.stringify(st0)} layout=${layoutClicked} map=${hasMap} panel=${hasPanel} tool=${st1.tool}`);
    if (!hasMap || !hasPanel) throw new Error('no map or no panel — nothing below can run');

    // ── Row 2: the ruling's DEFAULT is remember ─────────────────────────────
    const boxState = await c.json(`(() => {
      const el = document.querySelector('input[aria-label="Detach on stamp"]');
      return el ? { found: true, checked: el.checked, disabled: el.disabled } : { found: false };
    })()`);
    const storeDetached = await c.evalExpr('window.__dbg.aeon.stampDetached()');
    check('2', "the stamp-time checkbox exists, is UNCHECKED, and the store agrees — d-18c's default is REMEMBER",
      boxState.found === true && boxState.checked === false && storeDetached === false,
      `checkbox=${JSON.stringify(boxState)} store.stampDetached=${storeDetached}`);

    // ── Row 2b: THE PANEL'S SENTENCE SAYS WHAT THE MECHANISM DOES ───────────
    //
    // The panel used to promise "editing the chunk later updates every copy"
    // while `buildActPropagationCommand` reaches ONE ACT and the chunk library
    // is project-wide — so a stamp of the same chunk in a second act kept its
    // link, was never re-stamped, and diverged in silence. The words are
    // asserted for real in node (chunk-links-cross-act.test.ts, on the exported
    // constants); what node cannot see is whether they PAINT, which is this row.
    //
    // ANTI-VACUOUS BY TOGGLE, not by a substring alone: the checkbox is really
    // clicked and the paragraph must CHANGE to the detached wording and back.
    // A static string baked anywhere else in the DOM, or a stale render, fails
    // that even though it would satisfy a bare "contains IN THIS ACT".
    const scopeText = () => c.evalExpr(
      '(document.querySelector(\'[data-testid="chunk-link-scope"]\') || {}).textContent || ""');
    const blurbLinked = await scopeText();
    await c.evalExpr(
      'document.querySelector(\'input[aria-label="Detach on stamp"]\').click()');
    await sleep(300);
    const blurbDetached = await scopeText();
    await c.evalExpr(
      'document.querySelector(\'input[aria-label="Detach on stamp"]\').click()');
    await sleep(300);
    const blurbBack = await scopeText();
    check('2b', 'the panel PAINTS the act-scoped promise, and it is the live paragraph (it changes when the checkbox is toggled and changes back)',
      blurbLinked.includes('IN THIS ACT')
      && blurbLinked.includes('other acts')
      && !/updates every copy (that )?you have not/i.test(blurbLinked)
      && blurbDetached.includes('will NOT change them')
      && blurbDetached !== blurbLinked
      && blurbBack === blurbLinked,
      `linked=${JSON.stringify(blurbLinked)}\n        detached=${JSON.stringify(blurbDetached)}\n`
      + `        back=${JSON.stringify(blurbBack)}`);

    // Deterministic camera; section 0 sits at world (0,0) whatever the grid is.
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(400);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    const rect = await c.json("document.getElementById('map-canvas').getBoundingClientRect().toJSON()");
    // INTEGER CLIENT PIXELS. `rect.left/top` can be fractional at dpr 1.35; the
    // origin is rounded ONCE and every aim is derived from that integer, so an
    // expectation and the pixel CDP actually delivers cannot disagree.
    const ox = Math.round(rect.left), oy = Math.round(rect.top);
    const toScreen = (col, row) => ({ x: ox + col * 8 + 4, y: oy + row * 8 + 4 });
    console.log(`\n        [env] dpr=${dpr} mapRect=${JSON.stringify(rect)} integerOrigin=(${ox},${oy})\n`);

    // PICK THE STAMP SOURCE FROM WHAT IS ACTUALLY ON SCREEN, then look up what
    // it is — not the other way round. A chunk chosen out of the library and
    // then hunted for in the DOM can simply not be rendered (the grid paints
    // lazily), and the row then fails describing the wrong thing.
    //
    // The cell's own `$XX` label is its LIBRARY POSITION (providers/
    // chunk-grid-aeon.ts `aeonChunkLabel`), so it maps to `chunkIds()` exactly.
    // Names are not unique and titles carry a suffix for blank chunks; the
    // position does neither.
    const chunkIds = await c.json('window.__dbg.aeon.chunkIds()');
    const cellSlots = await c.json(`(() => {
      const cells = [...document.querySelectorAll('button')].filter((e) => e.querySelector('canvas'));
      return cells.map((e) => {
        const t = e.lastElementChild ? e.lastElementChild.textContent.trim() : '';
        // No regex: a backslash-escaped $ inside this template literal collapses
        // to a bare $ and the pattern silently matches nothing.
        if (t.charAt(0) !== '$') return -1;
        const n = parseInt(t.slice(1), 16);
        return Number.isFinite(n) ? n : -1;
      });
    })()`);
    let chunkId = null, info = null, slot = -1;
    for (const s of cellSlots) {
      if (s < 0 || s >= chunkIds.length) continue;
      const i = await c.json(`window.__dbg.aeon.chunkInfo(${JSON.stringify(chunkIds[s])})`);
      if (i && i.nonzeroTiles > 0 && i.widthTiles >= 4 && i.heightTiles >= 4) {
        chunkId = chunkIds[s]; info = i; slot = s; break;
      }
    }
    if (!chunkId) {
      throw new Error(`no rendered chunk cell with real art (cells=${cellSlots.length}, library=${chunkIds.length})`);
    }
    // Arm it through the REAL thumbnail, so the row below is about a stamp the
    // user could have made.
    const label = '$' + slot.toString(16).toUpperCase().padStart(2, '0');
    const thumb = await c.evalExpr(`(() => {
      const cells = [...document.querySelectorAll('button')].filter((e) => e.querySelector('canvas'));
      const b = cells.find((e) => e.lastElementChild
        && e.lastElementChild.textContent.trim().toUpperCase() === ${JSON.stringify(label)});
      if (!b) return 'no-thumb: labels=' + JSON.stringify(
        cells.slice(0, 8).map((e) => e.lastElementChild && e.lastElementChild.textContent.trim()));
      b.scrollIntoView(); b.click(); return 'clicked';
    })()`);
    await sleep(300);
    const armedChunk = await c.evalExpr('window.__dbg.aeon.selectedChunk()');

    const SCAN_W = Math.min(120, Math.floor(rect.width / 8));
    const SCAN_H = Math.min(100, Math.floor(rect.height / 8));
    const scan = await c.json(`window.__dbg.aeon.ntRect(0, 0, 0, ${SCAN_W}, ${SCAN_H})`);
    if (!scan) throw new Error('section 0 is missing');
    const nt = (col, row) => scan[row * SCAN_W + col] ?? 0;
    let target = null;
    for (let br = 0; br + info.heightTiles <= SCAN_H && !target; br += info.heightTiles) {
      for (let bc = 0; bc + info.widthTiles <= SCAN_W && !target; bc += info.widthTiles) {
        let art = 0;
        for (let r = br; r < br + info.heightTiles; r++) {
          for (let x = bc; x < bc + info.widthTiles; x++) if (nt(x, r) !== 0) art++;
        }
        if (art === 0) target = { col: bc, row: br };
      }
    }
    if (!target) throw new Error('no all-air aligned footprint in view');
    const W = info.widthTiles, H = info.heightTiles;
    // COL/ROW everywhere: the probe does the section-width arithmetic with the
    // app's own SECTION_TILES_WIDE, so nothing here can disagree with it.
    const linkAt = (col, row) => `window.__dbg.aeon.chunkLinkAt(0, ${col}, ${row})`;
    const planeRow = async () => c.json(`(() => {
      const out = [];
      for (let r = 0; r < ${H}; r++) { const line = [];
        for (let cx = 0; cx < ${W}; cx++) {
          const p = window.__dbg.aeon.chunkLinkAt(0, ${target.col} + cx, ${target.row} + r);
          line.push(p ? p.id : 0);
        } out.push(line.join(' ')); }
      return out;
    })()`);

    // ── Row 3: the real stamp click RECORDS a placement ─────────────────────
    const before = await c.json(`window.__dbg.aeon.hasChunkLinks(0)`);
    const clickPt = toScreen(target.col + 1, target.row + 1);
    await click(c, clickPt.x, clickPt.y);
    await sleep(600);
    const placements = await c.json('window.__dbg.aeon.chunkPlacements(0)');
    const mine = placements.filter((p) => p.chunkId === chunkId);
    const plane3 = await planeRow();
    const wholeFootprint = mine.length === 1
      && plane3.every((line) => line.split(' ').every((v) => Number(v) === mine[0]?.id));
    const artLanded = await c.json(
      `window.__dbg.aeon.ntRect(0, ${target.col}, ${target.row}, ${W}, ${H})`);
    check('3', 'a real stamp click records ONE placement of the armed chunk over the WHOLE footprint (and the art landed)',
      thumb === 'clicked' && armedChunk === chunkId && mine.length === 1 && wholeFootprint
      && artLanded.some((w) => w !== 0),
      `thumb=${thumb} armed=${armedChunk} hadLinksBefore=${before} chunk=${chunkId} (${W}x${H} at ${target.col},${target.row})\n`
      + `        placements=${JSON.stringify(placements)}\n`
      + `        plane (placement id per tile):\n          ${plane3.join('\n          ')}\n`
      + `        nonzeroArtWords=${artLanded.filter((w) => w !== 0).length}/${artLanded.length}`);
    if (mine.length !== 1) throw new Error('no placement recorded — rows 4..9 cannot run');
    const placementId = mine[0].id;
    await shot(c, '1-stamped');

    // ── Row 4: the hover readout NAMES it ───────────────────────────────────
    const hoverPt = toScreen(target.col + 2, target.row + 2);
    await mouse(c, 'mouseMoved', hoverPt.x, hoverPt.y);
    await sleep(120);
    await mouse(c, 'mouseMoved', hoverPt.x + 1, hoverPt.y + 1);
    await sleep(400);
    const hoverStore = await c.json('window.__dbg.aeon.linkHover()');
    const hoverText = await c.evalExpr(
      "document.querySelector('[data-testid=\"chunk-link-hover\"]')?.textContent ?? '(no readout)'");
    const detachEnabled = await c.json(`(() => {
      const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Detach');
      return b ? { found: true, disabled: b.disabled } : { found: false };
    })()`);
    check('4', 'hovering the stamped region makes the panel NAME the placement (store latch + rendered text + an enabled Detach)',
      !!hoverStore && hoverStore.placementId === placementId && hoverStore.chunkId === chunkId
      && hoverText.includes(`#${placementId}`) && hoverText.includes(info.name)
      && detachEnabled.found === true && detachEnabled.disabled === false,
      `store=${JSON.stringify(hoverStore)} button=${JSON.stringify(detachEnabled)}\n`
      + `        rendered readout: ${JSON.stringify(hoverText)}`);
    await shot(c, '2-hover');

    // ── Row 5: the real Detach button — link gone, ART UNTOUCHED ────────────
    const artBeforeDetach = await c.json(
      `window.__dbg.aeon.ntRect(0, ${target.col}, ${target.row}, ${W}, ${H})`);
    const detachClicked = await c.evalExpr(clickByText('button', 'Detach'));
    await sleep(500);
    const afterPlacements = await c.json('window.__dbg.aeon.chunkPlacements(0)');
    const plane5 = await planeRow();
    const artAfterDetach = await c.json(
      `window.__dbg.aeon.ntRect(0, ${target.col}, ${target.row}, ${W}, ${H})`);
    const artIdentical = artBeforeDetach.length === artAfterDetach.length
      && artBeforeDetach.every((w, i) => w === artAfterDetach[i]);
    check('5', 'the real Detach button drops the placement and LEAVES THE ART EXACTLY AS IT WAS (a link becomes a copy, not an erase)',
      detachClicked === 'clicked'
      && !afterPlacements.some((p) => p.id === placementId)
      && plane5.every((line) => line.split(' ').every((v) => Number(v) === 0))
      && artIdentical && artAfterDetach.some((w) => w !== 0),
      `click=${detachClicked} placements=${JSON.stringify(afterPlacements)}\n`
      + `        plane after detach:\n          ${plane5.join('\n          ')}\n`
      + `        art identical=${artIdentical} nonzeroWords=${artAfterDetach.filter((w) => w !== 0).length}`);

    // Re-stamp for rows 6..9 — the detach above consumed the placement.
    await key(c, 'k', 'KeyK');
    await sleep(200);
    await click(c, clickPt.x, clickPt.y);
    await sleep(600);
    const p2 = (await c.json('window.__dbg.aeon.chunkPlacements(0)')).filter((p) => p.chunkId === chunkId);
    if (p2.length !== 1) throw new Error(`re-stamp did not produce one placement (${p2.length})`);
    const id2 = p2[0].id;

    // ── Row 6: a real paint-tile STROKE breaks exactly what it painted ──────
    // `endPaintStroke`'s dispatch, which no node row can reach.
    await c.evalExpr('window.__dbg.aeon.setLayer("fg")');
    await c.evalExpr('window.__dbg.aeon.setSelectedTile(3, 0)');
    // 't', not 'b' — TOOL_KEYS (workspace/tool-meta.ts) gives paint-tile 't' and
    // paint-block 'b'. Getting this wrong armed paint-block and the row then
    // measured the WRONG SITE while looking like a real failure of this one.
    await key(c, 't', 'KeyT');           // paint-tile
    await sleep(300);
    const toolPaint = (await c.json('window.__dbg.aeon.state()')).tool;
    const strokeA = toScreen(target.col + 0, target.row + 0);
    const strokeB = toScreen(target.col + 2, target.row + 0);
    await mouse(c, 'mousePressed', strokeA.x, strokeA.y);
    await mouse(c, 'mouseMoved', strokeA.x + 8, strokeA.y, { down: true });
    await mouse(c, 'mouseMoved', strokeB.x, strokeB.y, { down: true });
    await mouse(c, 'mouseReleased', strokeB.x, strokeB.y);
    await sleep(600);
    const plane6 = await planeRow();
    const painted6 = await c.json(`[
      ${linkAt(target.col, target.row)},
      ${linkAt(target.col + 1, target.row)},
      ${linkAt(target.col + 2, target.row)}]`);
    const untouched6 = await c.json(linkAt(target.col + W - 1, target.row + H - 1));
    const wordsChanged6 = await c.json(
      `window.__dbg.aeon.ntRect(0, ${target.col}, ${target.row}, 3, 1)`);
    check('6', 'a real paint-tile STROKE breaks the links of exactly the tiles it painted (MapViewport endPaintStroke — invisible to the node suite)',
      toolPaint === 'paint-tile'
      && painted6.every((p) => p === null)
      && untouched6 !== null && untouched6.id === id2
      && wordsChanged6.every((w) => (w & 0x7ff) === 3),
      `tool=${toolPaint} paintedLinks=${JSON.stringify(painted6)} cornerLink=${JSON.stringify(untouched6)}\n`
      + `        painted words=${JSON.stringify(wordsChanged6)} (tile index must be the armed 3)\n`
      + `        plane after stroke:\n          ${plane6.join('\n          ')}`);

    // ── Row 7: a real paint-block CLICK breaks exactly its 2x2 ──────────────
    // The block snaps to an even base, so aim at an even cell well away from
    // row 6's stroke; the expectation is derived from that snap, not guessed.
    const blkCol = target.col + (W >= 4 ? 2 : 0), blkRow = target.row + 2;
    const bBase = { col: Math.floor(blkCol / 2) * 2, row: Math.floor(blkRow / 2) * 2 };
    await c.evalExpr('window.__dbg.aeon.setSelectedTile(5, 0)');
    await key(c, 'b', 'KeyB');           // paint-block, per TOOL_KEYS
    await sleep(250);
    const toolBlock = (await c.json('window.__dbg.aeon.state()')).tool;
    const blkPt = toScreen(blkCol, blkRow);
    await click(c, blkPt.x, blkPt.y);
    await sleep(600);
    const blkLinks = await c.json(`[
      ${linkAt(bBase.col, bBase.row)},
      ${linkAt(bBase.col + 1, bBase.row)},
      ${linkAt(bBase.col, bBase.row + 1)},
      ${linkAt(bBase.col + 1, bBase.row + 1)}]`);
    const blkNeighbour = await c.json(linkAt(bBase.col + 2, bBase.row));
    const blkWords = await c.json(
      `window.__dbg.aeon.ntRect(0, ${bBase.col}, ${bBase.row}, 2, 2)`);
    const plane7 = await planeRow();
    check('7', 'a real paint-block CLICK breaks the links of exactly its snapped 2x2 (MapViewport paint-block — invisible to the node suite)',
      toolBlock === 'paint-block'
      && blkLinks.every((p) => p === null)
      && blkNeighbour !== null && blkNeighbour.id === id2
      && blkWords.every((w, i) => (w & 0x7ff) === 5 + i),
      `tool=${toolBlock} snappedBase=(${bBase.col},${bBase.row}) blockLinks=${JSON.stringify(blkLinks)}\n`
      + `        neighbour(+2 col)=${JSON.stringify(blkNeighbour)} blockWords=${JSON.stringify(blkWords)}\n`
      + `        plane after block:\n          ${plane7.join('\n          ')}`);
    await shot(c, '3-painted');

    // ── Row 8: the checkbox arms detach, and the next stamp records nothing ─
    await key(c, 'k', 'KeyK');
    await sleep(400);
    const boxClicked = await c.evalExpr(`(() => {
      const el = document.querySelector('input[aria-label="Detach on stamp"]');
      if (!el) return 'no-box'; el.click(); return 'clicked';
    })()`);
    await sleep(300);
    const armed = await c.evalExpr('window.__dbg.aeon.stampDetached()');
    // A fresh all-air footprint so "no placement" is not confused with the one
    // already sitting under the first target.
    let target2 = null;
    for (let br = 0; br + H <= SCAN_H && !target2; br += H) {
      for (let bc = 0; bc + W <= SCAN_W && !target2; bc += W) {
        if (bc === target.col && br === target.row) continue;
        let art = 0;
        for (let r = br; r < br + H; r++) for (let x = bc; x < bc + W; x++) if (nt(x, r) !== 0) art++;
        if (art === 0) target2 = { col: bc, row: br };
      }
    }
    if (!target2) throw new Error('no second all-air footprint in view');
    const pt2 = toScreen(target2.col + 1, target2.row + 1);
    const placementsBefore8 = await c.json('window.__dbg.aeon.chunkPlacements(0)');
    await click(c, pt2.x, pt2.y);
    await sleep(600);
    const placementsAfter8 = await c.json('window.__dbg.aeon.chunkPlacements(0)');
    const art8 = await c.json(
      `window.__dbg.aeon.ntRect(0, ${target2.col}, ${target2.row}, ${W}, ${H})`);
    const link8 = await c.json(linkAt(target2.col + 1, target2.row + 1));
    check('8', 'clicking the real checkbox arms detach: the next stamp WRITES THE ART and records NO placement',
      boxClicked === 'clicked' && armed === true
      && placementsAfter8.length === placementsBefore8.length
      && link8 === null && art8.some((w) => w !== 0),
      `click=${boxClicked} store.stampDetached=${armed} at (${target2.col},${target2.row})\n`
      + `        placements before=${placementsBefore8.length} after=${placementsAfter8.length}\n`
      + `        linkUnderStamp=${JSON.stringify(link8)} nonzeroArtWords=${art8.filter((w) => w !== 0).length}/${art8.length}`);
    await shot(c, '4-detached-stamp');

    // Leave the checkbox as we found it, so a re-run starts from the default.
    await c.evalExpr(`(() => {
      const el = document.querySelector('input[aria-label="Detach on stamp"]');
      if (el && el.checked) el.click();
    })()`);

    // ── Rows 9/10: PROPAGATION ──────────────────────────────────────────────
    await runPropagationRows(c, {
      chunkId, info, label, target, target2, W, H, id2, linkAt,
    });

    if (c.exceptions.length) {
      console.log(`\n  renderer exceptions during the run (${c.exceptions.length}):`);
      for (const e of c.exceptions.slice(0, 6)) console.log(`    ${e.split('\n')[0]}`);
    }
  } finally {
    try { c?.close(); } catch { /* closing */ }
    // O66: AWAITED. `process.exit()` follows the summary below; a dropped
    // promise here meant the app never got the ordered SIGTERM grace and the
    // exit net SIGKILLed it (measured: no `cleanup: ORDERED` line, exit 261 ms
    // after the summary — the shape that left Chromium SIGTRAP cores, O65).
    // Rule G5 in check-harness-guards.mjs holds this line.
    await killTree(app);
  }

  const passed = results.length - fails.length;
  console.log(`\n${passed}/${results.length} rows passed`
    + `${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`
    + `${skips.length ? ` — SKIPPED: ${skips.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

/**
 * PROPAGATION, END TO END, THROUGH THE REAL COMPOSER.
 *
 * Row 9 is the payoff and row 10 is the safety property, and they are read out
 * of ONE observation of the document — never two runs stitched together.
 *
 *   9   a chunk edited and saved in the Art facet rewrites the section tiles
 *       that still remember it.
 *  10   ...and does NOT touch (a) the tiles painted by hand in rows 6/7, nor
 *       (b) the DETACHED copy stamped in row 8. Those are two different reasons
 *       a tile is not the chunk's any more, and both must hold.
 *
 * The whole path is real gestures: the Art facet pill, a double click on the
 * chunk's own thumbnail, the Tile stamp button on the tool rail, a click in the
 * tileset panel to arm a tile, a click on the composer canvas, and the Save
 * button. `artChunkOpen()` is read-only and is what makes the row anti-vacuous
 * — it names the chunk that was opened and reports the doc going dirty, so a
 * gesture that silently missed cannot be mistaken for a propagation that
 * refused.
 */
async function runPropagationRows(c, ctx) {
  const { chunkId, label, target, target2, W, H, id2, linkAt } = ctx;

  // Open the Art facet and the chunk (double click = `activate` on ChunkCell).
  const artPill = await c.evalExpr(clickByText('[aria-label="Facets"] button', 'Art'));
  await sleep(1000);
  const opened = await c.evalExpr(`(() => {
    const cells = [...document.querySelectorAll('button')].filter((e) => e.querySelector('canvas'));
    const b = cells.find((e) => e.lastElementChild
      && e.lastElementChild.textContent.trim().toUpperCase() === ${JSON.stringify(label)});
    if (!b) return 'no-thumb';
    b.scrollIntoView();
    b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return 'dblclicked';
  })()`);
  await sleep(1200);
  const open1 = await c.json('window.__dbg.aeon.artChunkOpen()');
  if (!open1 || open1.chunkId !== chunkId) {
    skip('9', 'propagation',
      `the composer did not open ${chunkId} (pill=${artPill} dbl=${opened} open=${JSON.stringify(open1)})`);
    return;
  }

  // Arm the Tile stamp tool — the only art tool that writes a CELL'S TILE
  // REFERENCE; every other one edits pixels and would leave the nametable
  // identical, which propagation correctly treats as nothing to do.
  const armTool = await c.evalExpr(`(() => {
    const b = document.querySelector('button[aria-label="Tile stamp"]');
    if (!b) return 'no-tool'; b.click(); return 'clicked';
  })()`);
  await sleep(300);

  // THE CELL TO EDIT, chosen against TWO constraints and neither assumed:
  //   (a) the section tile it owns must still be LINKED after rows 6/7, which
  //       painted over parts of this same footprint;
  //   (b) the composer cell must be ON SCREEN. At zoom 8 a 16x16 chunk is
  //       1024px tall inside a scroller, so the bottom-right cells are off the
  //       viewport — an aim at one of those is delivered to whatever is there
  //       instead, the stamp never lands, and the row reads like a propagation
  //       failure. `elementFromPoint` is the app's own hit test and is the only
  //       honest way to ask.
  const geo = await c.json(`(() => {
    const cv = [...document.querySelectorAll('canvas')].find((k) =>
      k.parentElement && k.parentElement.style.margin === 'auto'
      && k.parentElement.style.padding === '24px' && k.offsetParent !== null);
    if (!cv) return { ok: false };
    const r = cv.getBoundingClientRect();
    return { ok: true, left: r.left, top: r.top, w: cv.width, h: cv.height };
  })()`);
  if (!geo.ok) { skip('9', 'propagation', 'composer canvas not found'); return; }
  const zoom = geo.w / (open1.widthTiles * 8);
  const cellPoint = (cx, cy) => ({
    x: Math.round(geo.left + (cx * 8 + 4) * zoom),
    y: Math.round(geo.top + (cy * 8 + 4) * zoom),
  });
  let cell = null, px = 0, py = 0;
  for (let cy = 0; cy < H && !cell; cy++) {
    for (let cx = 0; cx < W && !cell; cx++) {
      const pt = cellPoint(cx, cy);
      const onCanvas = await c.evalExpr(`(() => {
        const cv = [...document.querySelectorAll('canvas')].find((k) =>
          k.parentElement && k.parentElement.style.margin === 'auto'
          && k.parentElement.style.padding === '24px' && k.offsetParent !== null);
        return document.elementFromPoint(${pt.x}, ${pt.y}) === cv;
      })()`);
      if (!onCanvas) continue;
      const p = await c.json(linkAt(target.col + cx, target.row + cy));
      if (p && p.id === id2) { cell = { cx, cy }; px = pt.x; py = pt.y; }
    }
  }
  if (!cell) {
    skip('9', 'propagation', 'no still-linked footprint cell whose composer cell is on screen');
    return;
  }
  const before = await c.json(
    `window.__dbg.aeon.ntRect(0, ${target.col + cell.cx}, ${target.row + cell.cy}, 1, 1)`);
  const oldTile = before[0] & 0x7ff;

  // Arm a tile in the REAL tileset panel. Its geometry is stride 18 / itemSize
  // 16 (TilesetPanel), and the index is derived from the click point rather
  // than assumed: whatever lands, `artChunkOpen().brushTile` reports it and
  // every expectation below is derived from THAT.
  const armTile = await c.json(`(() => {
    const wrap = [...document.querySelectorAll('div')].find((d) =>
      d.style.position === 'relative' && d.style.overflow === 'hidden'
      && d.querySelectorAll('canvas').length === 2);
    if (!wrap) return { ok: false, why: 'no tileset wrap' };
    const base = wrap.querySelector('canvas');
    const r = base.getBoundingClientRect();
    return { ok: true, left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  if (!armTile.ok) { skip('9', 'propagation', armTile.why); return; }
  const stride = 18, half = 8;
  const cols = Math.max(1, Math.floor(armTile.width / stride));
  // Walk cells until the armed tile DIFFERS from the one already in the chunk
  // cell — stamping the same index would produce an identical nametable and
  // propagation would (correctly) have nothing to write, making the row
  // unfalsifiable.
  let armed = null;
  for (let n = 1; n < Math.min(24, cols * 3) && armed === null; n++) {
    const x = Math.round(armTile.left + (n % cols) * stride + half);
    const y = Math.round(armTile.top + Math.floor(n / cols) * stride + half);
    if (y > armTile.top + armTile.height - 2) break;
    await click(c, x, y);
    await sleep(150);
    const st = await c.json('window.__dbg.aeon.artChunkOpen()');
    if (st && st.brushTile !== oldTile && st.brushTile > 0) armed = st.brushTile;
  }
  if (armed === null) { skip('9', 'propagation', 'could not arm a tileset tile different from the cell'); return; }

  // Stamp the cell on the REAL composer canvas.
  await click(c, px, py);
  await sleep(400);
  const open2 = await c.json('window.__dbg.aeon.artChunkOpen()');
  if (!open2 || open2.dirty !== true) {
    skip('9', 'propagation',
      `the tile stamp did not land (tool=${armTool} open=${JSON.stringify(open2)} zoom=${zoom} at ${px},${py})`);
    return;
  }

  // Save — the only surface that dispatches `set-chunk`.
  const saveClicked = await c.evalExpr(`(() => {
    const b = document.querySelector('button[title^="Save changes back to this chunk"]');
    if (!b) return 'no-save'; if (b.disabled) return 'disabled'; b.click(); return 'clicked';
  })()`);
  await sleep(900);

  // ONE observation of the document; both rows are read out of it.
  const linkedAfter = await c.json(
    `window.__dbg.aeon.ntRect(0, ${target.col + cell.cx}, ${target.row + cell.cy}, 1, 1)`);
  const paintedAfter = await c.json(
    `window.__dbg.aeon.ntRect(0, ${target.col}, ${target.row}, 3, 1)`);
  const detachedAfter = await c.json(
    `window.__dbg.aeon.ntRect(0, ${target2.col + cell.cx}, ${target2.row + cell.cy}, 1, 1)`);
  const stillLinked = await c.json(linkAt(target.col + cell.cx, target.row + cell.cy));

  check('9', 'a chunk edited and SAVED in the real Art facet rewrites the section tiles that still remember it',
    saveClicked === 'clicked' && stillLinked !== null && stillLinked.id === id2
    && (linkedAfter[0] & 0x7ff) === armed && oldTile !== armed,
    `save=${saveClicked} composerCell=(${cell.cx},${cell.cy}) armedTile=${armed} previousTile=${oldTile}\n`
    + `        section word before=${before[0]} after=${linkedAfter[0]} (tileIndex ${linkedAfter[0] & 0x7ff})\n`
    + `        that tile's link=${JSON.stringify(stillLinked)}`);

  check('10', 'and it REFUSES the hand-painted tiles (rows 6/7) and the DETACHED copy (row 8) — two different reasons, both held',
    paintedAfter.every((w) => (w & 0x7ff) === 3)
    && (detachedAfter[0] & 0x7ff) !== armed,
    `hand-painted words at (${target.col},${target.row})x3 = ${JSON.stringify(paintedAfter)} `
    + `(must all still be the armed-3 stroke, NOT ${armed})\n`
    + `        detached copy word at (${target2.col + cell.cx},${target2.row + cell.cy}) = `
    + `${detachedAfter[0]} (tileIndex ${detachedAfter[0] & 0x7ff}, must not be ${armed})`);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
