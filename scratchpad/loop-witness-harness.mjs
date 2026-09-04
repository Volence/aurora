#!/usr/bin/env node
// AUTHOR A REAL, TRAVERSABLE LOOP THROUGH AURORA'S OWN CONTROLS — LOOPS-P.
//
// O47 proved the arrow `painted crossover -> ROM bytes`. Its own closing line is
// the gap this harness closes: "nobody has driven through one, and no loop
// exists in the act we tested against". This paints one.
//
// WHAT IT DOES, and what each part is worth:
//
//   * every stroke goes through `armCollisionBrush` (the same store actions the
//     palette chips call — O56 measured that equivalence) followed by a REAL
//     pointer press/release on the REAL map canvas. Not a poke. If the brush,
//     the palette or the paint path is broken, this run cannot be green.
//   * the plan comes from scratchpad/loop-plan.py, which derives the radius
//     from aeon's physics constants, the shapes from aeon's own shape bank, and
//     the plane split from a REAL shipped Sonic 2 loop (s2disasm EHZ chunks
//     $19/$1A/$29/$2A). Read that file's docstring before quoting any number.
//   * the app's OWN encoding is the oracle: every arm is checked against the
//     word `selectedCollisionWord` yields, and the shape's canonical entry
//     mirror is corrected for by re-arming, never by assuming.
//   * it SAVES (a real Ctrl+S) into the tree AEON_DIR names, and then verifies
//     the two plane files off disk.
//
// ⚠ AEON_DIR MUST NAME A PINNED CHECKOUT, NOT THE LIVE TREE. The live ../aeon is
// another lane's working directory; a bake over it is a bake over uncommitted
// edits you cannot state. Absent or non-existent AEON_DIR is a hard error here.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run: AEON_DIR=<pinned checkout> npm run harness:loop-witness

import { AURORA_DIR } from '../test/support/sibling-root.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';
import { spawnGuarded, killTree, restoreDiscoveryNow, describeDiscovery,
         discoverySnapshot } from './lib/harness-guard.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9421);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const AEONDIR = process.env.AEON_DIR;
const SHOTS = `${ROOT}/scratchpad/shots-loop-witness`;
mkdirSync(SHOTS, { recursive: true });

if (!AEONDIR || !existsSync(join(AEONDIR, 'games/sonic4/data/editor/ojz/act1'))) {
  console.log(`HARNESS REFUSES: AEON_DIR=${AEONDIR ?? '(unset)'} is not an aeon checkout with editor data.`);
  console.log('        Point it at a PINNED checkout — never at the live ../aeon.');
  process.exit(2);
}
const PLAN = JSON.parse(readFileSync(`${ROOT}/scratchpad/loop-plan.json`, 'utf8'));
const SEC = PLAN.section;
const A_REL = `games/sonic4/data/editor/ojz/act1/section_${SEC}.collattr.bin`;
const B_REL = `games/sonic4/data/editor/ojz/act1/section_${SEC}.collattrb.bin`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(4, '0')}`;

function words(rel) {
  const b = readFileSync(join(AEONDIR, rel));
  const out = new Uint16Array(b.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = (b[i * 2] << 8) | b[i * 2 + 1];
  return out;
}

// ── the field layout, read out of the APP'S OWN SOURCE (never typed) ───────
const XOVER_SRC = `${ROOT}/src/core/collision/layer-transition.ts`;
const xsrc = readFileSync(XOVER_SRC, 'utf8');
const XOVER_SHIFT = Number(/CROSSOVER_SHIFT\s*=\s*(\d+)/.exec(xsrc)?.[1]);
const XOVER_VMASK = Number(/CROSSOVER_VALUE_MASK\s*=\s*(0x[0-9a-fA-F]+|\d+)/.exec(xsrc)?.[1]);
if (!Number.isFinite(XOVER_SHIFT) || !Number.isFinite(XOVER_VMASK)) {
  throw new Error(`could not parse the crossover field out of ${XOVER_SRC}`);
}
const XOVER_BITS = XOVER_VMASK << XOVER_SHIFT;

function getJSON(path, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (ch) => (d += ch));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function portFree() { try { await getJSON('/json/version'); return false; } catch { return true; } }
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
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
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

let pass = 0; const fails = [];
function check(id, name, ok, detail) {
  (ok ? pass++ : fails.push(`[${id}] ${name}`));
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> scratchpad/shots-loop-witness/${name}.png`);
}
async function mouse(c, type, x, y) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const setView = (c, x, y, zoom) => c.evalExpr(`window.__dbg.setView(${x}, ${y}, ${zoom})`);
const view = (c) => c.json('window.__dbg.view()');

const CELL_PX = 16;

/** Aim at a 16px CELL's centre and INVERT the transform to prove it lands there. */
async function aimAtCell(c, cc, cr, origin, rect) {
  const vp = await view(c);
  const worldX = origin.x + cc * CELL_PX + CELL_PX / 2;
  const worldY = origin.y + cr * CELL_PX + CELL_PX / 2;
  const x = Math.round(rect.left + (worldX - vp.x) * vp.zoom);
  const y = Math.round(rect.top + (worldY - vp.y) * vp.zoom);
  const backCol = Math.floor(((x - rect.left) / vp.zoom + vp.x - origin.x) / CELL_PX);
  const backRow = Math.floor(((y - rect.top) / vp.zoom + vp.y - origin.y) / CELL_PX);
  if (backCol !== cc || backRow !== cr) {
    throw new Error(`AIM REFUSED: meant cell (${cc},${cr}), integer (${x},${y}) inverts to (${backCol},${backRow})`);
  }
  if (!(x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height)) {
    throw new Error(`AIM REFUSED: cell (${cc},${cr}) is OFF THE CANVAS at (${x},${y}); rect `
      + `(${rect.left},${rect.top}) ${rect.width}x${rect.height} — park the viewport first`);
  }
  return { x, y };
}

async function main() {
  console.log('\n=== THE PLAN ===');
  console.log(`  section ${SEC}, centre (${PLAN.centre[0]},${PLAN.centre[1]}) r_in=${PLAN.r_in} r_out=${PLAN.r_out}`);
  console.log(`  ${PLAN.geometry.length} geometry strokes + ${PLAN.marks.length} mark strokes`);
  console.log(`  worst per-cell fit residual ${PLAN.worst_fit_residual_px} px of 256`);
  console.log(`  crossover field, parsed from ${XOVER_SRC.replace(ROOT + '/', '')}: `
    + `shift=${XOVER_SHIFT} valueMask=${XOVER_VMASK} bits=${hex(XOVER_BITS)}`);
  note('AEON_DIR (the tree that will be written)', AEONDIR);

  // The tree must be clean of crossovers before we paint: every shipped cell is
  // XOVER_NONE (aeon anchor §2.1), so any mark here is a previous run's residue
  // and the honest answer is to stop rather than measure over it.
  {
    const stale = [];
    for (const rel of [A_REL, B_REL]) {
      const w = words(rel);
      for (let i = 0; i < w.length; i++) if (w[i] & XOVER_BITS) stale.push(`${rel}#${i}=${hex(w[i])}`);
    }
    if (stale.length) {
      console.log(`HARNESS REFUSES: ${AEONDIR} already carries ${stale.length} crossover word(s) — leftover state.`);
      console.log(`        first few: ${stale.slice(0, 6).join(' ')}`);
      process.exit(2);
    }
    note('pre-paint state', `0 crossover words in either plane (${words(A_REL).length} words each)`);
  }
  const beforeA = words(A_REL), beforeB = words(B_REL);

  if (!(await portFree())) throw new Error(`port ${PORT} already serving a CDP target — kill it first`);
  const child = spawnGuarded('/usr/bin/xvfb-run', [
    '-a', '--server-args=-screen 0 1920x1200x24',
    ELECTRON, '.', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  ], {
    cwd: RUN.root,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log(`  discovery snapshot: ${describeDiscovery(discoverySnapshot())}`);
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    let hasDbg = 'undefined';
    for (let i = 0; i < 60; i++) {
      hasDbg = await c.evalExpr('typeof window.__dbg');
      if (hasDbg === 'object') break;
      await sleep(500);
    }
    if (hasDbg !== 'object') throw new Error('window.__dbg absent after 30s — needs a VITE_AURORA_DEBUG=1 build of dist/');

    const encRun = await c.json('window.__dbg.aeon.crossoverEncoding()');
    check('enc', 'the RUNNING build\'s crossover encoding matches this source tree (dist is not stale)',
      encRun.shift === XOVER_SHIFT && encRun.valueMask === XOVER_VMASK,
      JSON.stringify(encRun));

    console.log('\n=== OPENING THE PINNED AEON CHECKOUT ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    let st = null;
    for (let i = 0; i < 90; i++) {
      st = await c.json('window.__dbg.aeon.state()');
      if (st.open && st.sections > 0) break;
      await sleep(500);
    }
    check('open', 'the project Aurora opened is the PINNED checkout, with section data',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st?.open) throw new Error('aeon project never opened');

    const facet = await c.json("window.__dbg.aeon.setFacet('collision')");
    note('facet', JSON.stringify(facet));
    const rect = await c.json(String.raw`(() => {
      const b = document.getElementById('map-canvas').getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    })()`);
    note('canvas rect', JSON.stringify(rect));
    const origin = await c.json(`window.__dbg.aeon.sectionOrigin ? window.__dbg.aeon.sectionOrigin(${SEC}) : {x:0,y:0}`);
    note('section origin', JSON.stringify(origin));

    // Park the viewport so the WHOLE loop box fits, with margin. Derived from
    // the plan's own extent, never a typed pair of numbers.
    const ccs = [...PLAN.geometry, ...PLAN.marks].map((g) => g.cc);
    const crs = [...PLAN.geometry, ...PLAN.marks].map((g) => g.cr);
    const box = { c0: Math.min(...ccs), c1: Math.max(...ccs), r0: Math.min(...crs), r1: Math.max(...crs) };
    const zoom = 2;
    const vx = origin.x + (box.c0 + box.c1 + 1) / 2 * CELL_PX - rect.width / (2 * zoom);
    const vy = origin.y + (box.r0 + box.r1 + 1) / 2 * CELL_PX - rect.height / (2 * zoom);
    await setView(c, Math.round(vx), Math.round(vy), zoom);
    note('viewport parked', `${JSON.stringify(await view(c))} for cells `
      + `(${box.c0}..${box.c1}, ${box.r0}..${box.r1})`);
    await c.evalExpr("window.__dbg.aeon.setLayer && window.__dbg.aeon.setLayer('fg')");
    await c.evalExpr("window.__dbg.aeon.armCollisionBrush({ brush: 1 })");

    // ── STROKING ───────────────────────────────────────────────────────────
    //
    // The canonical entry mirror: `selectedCollisionWord` XORs the shape entry's
    // own mirror flag with the user's Flip-H, so `xFlip: true` does NOT always
    // set bit 10. Rather than reimplement that rule, arm and READ BACK the word
    // the app yields; if bit 10 is not what the plan wants, re-arm with the
    // user flip inverted. The app's encoding is the oracle throughout.
    const SHAPE_MASK = 0x3FF, XF_BIT = 0x400, YF_BIT = 0x800;
    let corrected = 0;
    async function armFor(g, plane) {
      const wantXf = g.xFlip;
      for (const userXf of [wantXf, !wantXf]) {
        const armed = await c.json(`window.__dbg.aeon.armCollisionBrush(${JSON.stringify({
          plane, shape: g.shape, solidity: g.solidity, xFlip: userXf, yFlip: g.yFlip,
          bothPlanes: false, crossover: g.crossover,
        })})`);
        const w = armed.word;
        const okShape = g.solidity === 'none' || (w & SHAPE_MASK) === g.shape;
        const okXf = g.solidity === 'none' || (!!(w & XF_BIT)) === wantXf;
        const okYf = g.solidity === 'none' || (!!(w & YF_BIT)) === g.yFlip;
        if (okShape && okXf && okYf) {
          if (userXf !== wantXf) corrected++;
          return armed;
        }
      }
      throw new Error(`ARM REFUSED for ${JSON.stringify(g)} on plane ${plane}: the app would not yield `
        + 'the intended shape/flip under either user Flip-H');
    }

    async function strokeAt(cc, cr) {
      const { x, y } = await aimAtCell(c, cc, cr, origin, rect);
      await mouse(c, 'mousePressed', x, y);
      await mouse(c, 'mouseReleased', x, y);
    }

    console.log('\n=== PAINTING THE GEOMETRY (real arms + real strokes) ===');
    let strokes = 0;
    for (const g of PLAN.geometry) {
      const planes = g.plane === 'both' ? ['a', 'b'] : [g.plane];
      for (const p of planes) {
        await armFor(g, p);
        await strokeAt(g.cc, g.cr);
        strokes++;
      }
    }
    note('geometry strokes issued', `${strokes} (entry-mirror corrections: ${corrected})`);

    console.log('\n=== PAINTING THE TWO ONE-WAY CROSSOVER MARKS ===');
    for (const m of PLAN.marks) {
      await armFor(m, m.plane);
      await strokeAt(m.cc, m.cr);
      strokes++;
    }
    await shot(c, 'after-paint');

    // ── what the app itself says about what is now in the document ─────────
    const audit = await c.json(`window.__dbg.aeon.crossoverAudit(${SEC})`);
    note('Aurora\'s own paint-time loop audit', JSON.stringify(audit));
    check('audit-legal', 'the document holds NO self-mark and NO reserved value (aeon rules R1/R2)',
      audit.selfMarks === 0 && audit.reserved === 0,
      `selfMarks=${audit.selfMarks} reserved=${audit.reserved} severity=${audit.severity}`);
    check('audit-shape', 'the marks are the ONE-WAY pattern this loop needs: marks on both planes, ZERO two-way pairs',
      audit.marksA > 0 && audit.marksB > 0 && audit.pairs === 0,
      `marksA=${audit.marksA} marksB=${audit.marksB} pairs=${audit.pairs} oneWay=${audit.oneWay}`);
    check('audit-divergent', 'the two planes DIVERGE — the loop\'s two legs are on different planes',
      audit.divergent > 0, `divergent=${audit.divergent} solidBoth=${audit.solidBoth}`);

    // ── save, for real ────────────────────────────────────────────────────
    console.log('\n=== SAVING (real Ctrl+S) ===');
    // The app's OWN dirty flag is the pre-condition: a save that "worked" over a
    // document the strokes never dirtied would rewrite the same bytes and every
    // later row would still be green. `state().dirty` is the editor store's.
    const dirtyBefore = (await c.json('window.__dbg.aeon.state()')).dirty;
    check('dirty', 'the strokes actually dirtied the document (so the save below has something to write)',
      dirtyBefore === true, `state().dirty = ${dirtyBefore}`);
    await sleep(1200);
    await key(c, 's', 'KeyS', 83, 2);
    let dirtyAfter = true;
    for (let i = 0; i < 60; i++) {
      dirtyAfter = (await c.json('window.__dbg.aeon.state()')).dirty;
      if (dirtyAfter === false) break;
      await sleep(500);
    }
    await sleep(2000);
    note('dirty after save', String(dirtyAfter));

    const afterA = words(A_REL), afterB = words(B_REL);
    const diffA = [], diffB = [];
    for (let i = 0; i < afterA.length; i++) if (afterA[i] !== beforeA[i]) diffA.push(i);
    for (let i = 0; i < afterB.length; i++) if (afterB[i] !== beforeB[i]) diffB.push(i);
    check('saved', 'the save reached BOTH plane files on disk', diffA.length > 0 && diffB.length > 0,
      `plane A: ${diffA.length} words changed · plane B: ${diffB.length} words changed`);

    const markWordsA = [...afterA].filter((w) => w & XOVER_BITS).length;
    const markWordsB = [...afterB].filter((w) => w & XOVER_BITS).length;
    // Aurora paints 16px cells as 2x2 identical 8px sub-tiles, so N marked cells
    // is 4N marked words. Derived from the app's own cell->tile rule, and it is
    // the quantity that catches a mark that only landed on part of a cell.
    check('marks-a', 'plane A carries exactly the marked cells the plan asked for, all four sub-tiles each',
      markWordsA === PLAN.marks.filter((m) => m.plane === 'a').length * 4,
      `${markWordsA} marked words = ${markWordsA / 4} cells (plan: ${PLAN.marks.filter((m) => m.plane === 'a').length})`);
    check('marks-b', 'plane B carries exactly the marked cells the plan asked for, all four sub-tiles each',
      markWordsB === PLAN.marks.filter((m) => m.plane === 'b').length * 4,
      `${markWordsB} marked words = ${markWordsB / 4} cells (plan: ${PLAN.marks.filter((m) => m.plane === 'b').length})`);

    // The values, by name, off the LIVE document — the one thing that separates
    // "a mark is there" from "the RIGHT mark is there".
    const names = { a: new Set(), b: new Set() };
    for (const m of PLAN.marks) {
      const idx = (m.cr * 2) * 256 + m.cc * 2;
      names[m.plane].add(await c.evalExpr(`window.__dbg.aeon.crossoverAt(${SEC}, '${m.plane}', ${idx})`));
    }
    check('mark-values', 'plane A hands to B and plane B hands to A — the per-plane absolute pair, no self-mark',
      names.a.size === 1 && [...names.a][0] === 'to-b' && names.b.size === 1 && [...names.b][0] === 'to-a',
      `plane A -> ${[...names.a].join(',')}   plane B -> ${[...names.b].join(',')}`);

    // The ground the loop stands on must be UNTOUCHED and still solid on both.
    const groundRow = (PLAN.ground_top / 16) | 0;
    let groundMoved = 0;
    for (const i of [...diffA, ...diffB]) if (Math.floor(i / 256) >= groundRow * 2) groundMoved++;
    check('ground', 'nothing was written at or below the floor the loop stands on',
      groundMoved === 0, `${groundMoved} changed words at tile row >= ${groundRow * 2} (world y >= ${PLAN.ground_top})`);

    // The plan's own geometry, read back off the saved files.
    let wrong = 0; const sample = [];
    for (const g of PLAN.geometry) {
      const idx = (g.cr * 2) * 256 + g.cc * 2;
      for (const [p, arr] of [['a', afterA], ['b', afterB]]) {
        const want = g.plane === 'both' || g.plane === p;
        const got = (arr[idx] & ~XOVER_BITS) !== 0 && ((arr[idx] >> 12) & 3) !== 0;
        if (want !== got) { wrong++; if (sample.length < 6) sample.push(`(${g.cc},${g.cr})/${p} want=${want} got=${hex(arr[idx])}`); }
      }
    }
    check('split', 'every geometry cell is solid on exactly the plane(s) the plan assigns it',
      wrong === 0, wrong ? sample.join(' ') : `${PLAN.geometry.length} cells x 2 planes verified`);

    await shot(c, 'final');
  } finally {
    try { c && c.close(); } catch { /* closing */ }
    killTree(child);
    restoreDiscoveryNow();
  }

  console.log(`\n=== ${pass} passed, ${fails.length} failed ===`);
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
