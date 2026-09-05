#!/usr/bin/env node
// ⚠ IT DELETES INSIDE THE OPENED PROJECT'S `.aurora/canvas`, so `S1DISASM_DIR`
// must name a WRITABLE COPY of a populated s1disasm. There is no default: the
// guard lives in scratchpad/canvas-cdp-harness.mjs (this file's `CANVAS_DIR`
// comes from there) and refuses at import when the variable is unset or points
// at the live checkout. See docs/reviews/2026-09-03-canvas-harness-live-tree-delete.md.
//
//     cp -r <sibling>/s1disasm /tmp/s1disasm-copy
//     S1DISASM_DIR=/tmp/s1disasm-copy npm run harness:constraints-cdp
//
// Phase 2B verification harness: are the CONSTRAINT READOUTS and the CLASH
// OVERLAY real in the running Electron app?
//
// The suite renders no React and no canvas, so every claim tasks 8 and 9 make
// is unverified until the app is driven. This drives the BUILT
// (VITE_AURORA_DEBUG=1) app under xvfb over CDP, against REAL s1disasm data.
//
// IT REUSES scratchpad/canvas-cdp-harness.mjs's machinery by importing it —
// launch discipline, the page-side helper bundle, input dispatch, the project/
// act opener, the New Canvas dialog driver. That harness's own report records
// three defects that each produced a convincing FALSE result before being
// caught, so a fresh reimplementation would start by re-earning trust this code
// already has.
//
//   node scratchpad/constraints-cdp-harness.mjs
//   ONLY=3,4 node scratchpad/constraints-cdp-harness.mjs   # one row at a time
//
// EVERY MUTATION GOES THROUGH THE REAL UI (clicks, drags, typed input). The
// only reads that bypass the screen are `window.__dbg.canvas.*`, which is
// read-only, and they are used to CORROBORATE what was read off the screen, not
// to replace it.

import { rmSync, existsSync, readdirSync } from 'node:fs';
import {
  session, openProjectAndAct, openNewCanvasDialog, fillDialog,
  INSTALL, sleep, clickEl, drawArt, shot, drain, mouse, CANVAS_DIR,
} from './canvas-cdp-harness.mjs';

// A CANVAS NAMES A FILE, so a canvas left behind by an earlier run makes the
// next run's create REFUSE as a duplicate — the dialog stays open with an
// inline error and no tab appears. That is exactly what happened between run 1
// and run 2 of this harness: run 2 reported ten readout failures whose real
// cause was that no canvas existed at all. Start from a clean directory.
function clearCanvases() {
  if (!existsSync(CANVAS_DIR)) return [];
  const had = readdirSync(CANVAS_DIR);
  for (const f of had) rmSync(`${CANVAS_DIR}/${f}`, { force: true });
  return had;
}

const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim())) : null;
const run = (id) => !ONLY || ONLY.has(String(id));

const results = [];
const fails = [];
const negFails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok, detail });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function neg(id, name, ok, detail) {
  const good = ok === false;
  console.log(`${good ? 'neg-ok' : 'NEG-BROKEN'}  [${id}] (planted) ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  results.push({ id, name: `(planted false) ${name}`, ok: good, detail, negative: true });
  if (!good) negFails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  results.push({ id, name, ok: null, detail });
}

// --- 2B's own page-side helpers, on top of the 2A bundle -------------------
const INSTALL_2B = String.raw`
(() => {
  const H = window.__c;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  /** The whole status bar as text — the readouts live here.
   *
   *  THE VISIBLE footer, not the first one. The classic level editor's pane
   *  stays MOUNTED at display:none while a canvas tab is active (that is why
   *  its undo handler has to gate on levelKeysEnabled), so a bare
   *  querySelector('footer') returns the LEVEL status bar and every readout
   *  check reads 'Green Hill Zone Act 1 - 48x5 chunks' and fails. Found by a
   *  first run in which ten checks failed with that string in the detail.
   *  (No backticks in this comment: it lives inside a String.raw template, and
   *  a backtick here ends the template mid-sentence.) */
  H.status = () => {
    const f = [...document.querySelectorAll('footer')].find(vis);
    return f ? f.textContent : null;
  };
  H.footerCount = () => document.querySelectorAll('footer').length;
  H.footerTexts = () => [...document.querySelectorAll('footer')].map(
    (f) => ({ visible: vis(f), text: f.textContent.slice(0, 60) }));
  /** The tiles readout, e.g. 'tiles 37 unique · 17 free in GHZ 1 · pool 239/256'. */
  H.tilesReadout = () => {
    const t = H.status() || '';
    const m = /tiles \d+ unique[^·]*(· \d+ free in [^·]+)?(· pool \d+\/\d+)?(· \d+px outside the grid)?/.exec(t);
    return m ? m[0].trim() : null;
  };
  H.coloursReadout = () => {
    const m = /colours [^/]+\/ \d+ per line/.exec(H.status() || '');
    return m ? m[0].trim() : null;
  };
  H.frameReadout = () => {
    const m = /frame \d+×\d+ tiles( \(one sprite is \d+×\d+ max\))?/.exec(H.status() || '');
    return m ? m[0].trim() : null;
  };
  H.constraintsOff = () => (H.status() || '').includes('constraints --');
  /** Unique-tile count as a NUMBER, straight off the screen. */
  H.uniqueTiles = () => {
    const m = /tiles (\d+) unique/.exec(H.status() || '');
    return m ? Number(m[1]) : null;
  };
  H.freeInAct = () => {
    const m = /(\d+) free in (\S+) (\d+)/.exec(H.status() || '');
    return m ? { free: Number(m[1]), zone: m[2], act: Number(m[3]) } : null;
  };
  H.poolReadout = () => {
    const m = /pool (\d+)\/(\d+)/.exec(H.status() || '');
    return m ? { used: Number(m[1]), total: Number(m[2]) } : null;
  };

  /** Does the whole status bar contain a bare count of clashing cells? Spec
   *  §4.3 says structural violations never get a number, so this must stay
   *  false however many cells are tinted. */
  H.statusMentionsClashCount = () => /\d+\s*(cells?|clashes?)\b/i.test(H.status() || '');

  /** The Clashes chip's warning tone — border colour, read live. */
  H.chipBorder = (label) => {
    const e = H.chip(label); if (!e) return null;
    return getComputedStyle(e).borderTopColor;
  };
  H.chipActive = (label) => {
    const e = H.chip(label); if (!e) return null;
    const s = getComputedStyle(e);
    return s.backgroundColor === s.borderTopColor;
  };

  /** Count tinted (clash) pixels on the canvas by sampling each cell's centre.
   *  Reads the REAL backing store, so it sees what the artist sees. Returns the
   *  art-space cell origins whose centre is tinted, which is what lets a check
   *  assert WHICH cells lit rather than merely how many. */
  H.tintedCells = (bufW, bufH, originX = 0, originY = 0) => {
    const c = H.canvas(), g = H.ctx(); if (!c || !g) return null;
    const z = c.width / bufW;
    const ph = (n) => ((n % 8) + 8) % 8;
    const out = [];
    const starts = (span, p) => { const a = []; if (p > 0) a.push([0, Math.min(p, span)]); for (let s = p; s < span; s += 8) a.push([s, Math.min(8, span - s)]); return a; };
    for (const [cy, ch] of starts(bufH, ph(originY))) {
      for (const [cx, cw] of starts(bufW, ph(originX))) {
        // Sample a pixel that is TRANSPARENT in the art wherever possible, so
        // the tint is what dominates; the centre is good enough for the
        // fixtures here, which paint whole cells.
        const px = Math.floor((cx + cw / 2) * z), py = Math.floor((cy + ch / 2) * z);
        const d = g.getImageData(px, py, 1, 1).data;
        out.push({ x: cx, y: cy, rgba: d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3] });
      }
    }
    return out;
  };

  /** Classify a cell sample as untinted / red / amber.
   *
   *  CALIBRATED AGAINST THE ACTUAL COMPOSITE, not against the source colours.
   *  Both tints are low-alpha (0.28 and 0.26) over whatever is beneath, and the
   *  cells being sampled are mostly TRANSPARENT at their centre — so over the
   *  dark checkerboard, amber composites to roughly (87, 66, 29), nowhere near
   *  its nominal (255, 176, 32). The first version of this tested g > b + 40
   *  AND g > 90 and therefore saw no amber at all, which was reported as "the
   *  sprite profile flags nothing" — a harness defect wearing an app bug's
   *  clothes.
   *
   *  What actually separates them survives compositing: BOTH tints lift red
   *  well above blue; only amber also lifts GREEN above blue. */
  H.tintOf = (rgba) => {
    const [r, g, b] = rgba.split(',').map(Number);
    if (r <= b + 25) return 'none';
    return g > b + 20 ? 'amber' : 'red';
  };
  H.cellsTinted = (kind, bufW, bufH, ox = 0, oy = 0) => (H.tintedCells(bufW, bufH, ox, oy) || [])
    .filter((c) => H.tintOf(c.rgba) === kind).map((c) => c.x + ',' + c.y);
  H.redCells = (bufW, bufH, ox = 0, oy = 0) => H.cellsTinted('red', bufW, bufH, ox, oy);
  H.amberCells = (bufW, bufH, ox = 0, oy = 0) => H.cellsTinted('amber', bufW, bufH, ox, oy);
  /** Raw samples for the cells that are tinted at all — so a failing check can
   *  show what the screen actually held rather than only that it disagreed. */
  H.tintSamples = (bufW, bufH, ox = 0, oy = 0) => (H.tintedCells(bufW, bufH, ox, oy) || [])
    .map((c) => ({ ...c, tint: H.tintOf(c.rgba) })).filter((c) => c.tint !== 'none');

  /** The profile <select> in the right-hand Canvas panel. */
  H.profileSelect = () => [...document.querySelectorAll('select')].find(
    (s) => vis(s) && [...s.options].some((o) => o.textContent.includes('Genesis level art')));
  H.profileValue = () => { const s = H.profileSelect(); return s ? s.value : null; };

  /** The two grid-origin number inputs in the Canvas panel. */
  H.originInputs = () => [...document.querySelectorAll('input[type=number]')].filter(
    (i) => vis(i) && /grid origin/i.test(i.title || ''));

  return true;
})()
`;

async function install(c) { await c.evalExpr(INSTALL); await c.evalExpr(INSTALL_2B); }

/** Arm a canvas colour by clicking its real swatch, then drag a filled band. */
async function paintCell(c, paintIndex, x0, y0, x1, y1, bufW) {
  const armed = await c.evalExpr(`window.__c.clickSwatch(${paintIndex})`);
  if (!armed) throw new Error(`no swatch arms canvas index ${paintIndex}`);
  await sleep(200);
  for (let y = y0; y <= y1; y++) await drawArt(c, x0, y, x1, y, bufW, Math.max(2, x1 - x0 + 1));
  await sleep(250);
}

/** Change the document's profile through the panel's real <select>, and REPORT
 *  what actually happened. Returning silently is how a step that did nothing
 *  passes the checks that follow it: the first run's row 6 reported "no cells
 *  are flagged" for a profile switch whose success nothing had confirmed. */
async function setProfile(c, value) {
  const got = await c.evalExpr(`(() => { const s = window.__c.profileSelect();
    if (!s) return 'NO-SELECT';
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    set.call(s, ${JSON.stringify(value)});
    s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  await sleep(600);
  if (got !== value) throw new Error(`profile switch to ${value} did not take: select reported ${got}`);
  return got;
}

async function setOrigin(c, axis, value) {
  const idx = axis === 'x' ? 0 : 1;
  await clickEl(c, `window.__c.originInputs()[${idx}]`);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await c.send('Input.insertText', { text: String(value) });
  await sleep(120);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(500);
}

const BUF = 64; // canvas side used throughout — 8 cells across, easy to reason about

/** Create a canvas through the real dialog AND PROVE IT WORKED.
 *
 *  The first version returned as soon as it had clicked Create, so a refused
 *  create (duplicate name) left the run continuing against a level tab —
 *  producing a screen of readout "failures" that were nothing of the kind. A
 *  setup step that cannot fail is a setup step that poisons every check after
 *  it. */
async function makeCanvas(c, name, profile = 'genesis-level-art') {
  const opened = await openNewCanvasDialog(c);
  if (!opened) throw new Error('New Canvas dialog would not open');
  await fillDialog(c, { name, width: BUF, height: BUF, profile });
  await clickEl(c, 'window.__c.dlgCreate()');
  await sleep(2500);
  await install(c);
  const stillOpen = await c.evalExpr('window.__c.dlgOpen()');
  if (stillOpen) {
    const err = await c.json('window.__c.dlgError()');
    throw new Error(`create was refused: ${JSON.stringify(err)}`);
  }
  // The canvas pane really is on screen: its palette exists and the visible
  // status bar is the canvas's, not the level editor's.
  const swatches = await c.evalExpr('window.__c.swatches().length');
  const status = await c.evalExpr('window.__c.status()');
  if (!swatches || !status || !status.includes(name)) {
    throw new Error(`canvas "${name}" did not take focus — swatches=${swatches} status=${JSON.stringify(status)}`);
  }
  return { swatches, status };
}

// ===========================================================================
async function body(c) {
  const lvl = await openProjectAndAct(c);
  note('setup', 'GHZ act 1 open', lvl);
  await install(c);
  const made = await makeCanvas(c, 'clash-probe');
  note('setup3', 'canvas created and focused', JSON.stringify(made).slice(0, 200));
  await drain(c);
  await install(c);
  note('setup2', 'footers on screen (the level pane stays mounted, hidden)',
    JSON.stringify(await c.json('window.__c.footerTexts()')));

  // --- 1: the readouts exist and name the open act ------------------------
  if (run(1)) {
    const status = await c.evalExpr('window.__c.status()');
    const tiles = await c.json('window.__c.freeInAct()');
    const pool = await c.json('window.__c.poolReadout()');
    const unique = await c.evalExpr('window.__c.uniqueTiles()');
    check('1a', 'the status bar carries a tiles readout', unique !== null, `status: ${JSON.stringify(status)}`);
    check('1b', 'a blank canvas is ONE unique tile (the blank one)', unique === 1, `unique=${unique}`);
    check('1c', 'the readout names the open act in the app own spelling (GHZ, not ghz)', tiles !== null && tiles.zone === 'GHZ' && tiles.act === 1,
      JSON.stringify(tiles));
    check('1d', 'the pool numbers are real, not placeholders',
      pool !== null && pool.total > 0 && pool.used <= pool.total, JSON.stringify(pool));
    // CORROBORATION: the free count the canvas shows must match what the level
    // store actually holds. Read-only, and only after the screen has been read.
    const dbgFree = await c.json(`(() => {
      const st = window.__dbg.classicLevel ? window.__dbg.classicLevel() : null; return st; })()`).catch(() => null);
    note('1e', 'level store cross-read (informational)', JSON.stringify(dbgFree));
    await shot(c, '2b-01-readouts');
  }

  // --- 2: drawing moves the numbers ---------------------------------------
  if (run(2)) {
    const before = await c.evalExpr('window.__c.uniqueTiles()');
    const coloursBefore = await c.evalExpr('window.__c.coloursReadout()');
    await paintCell(c, 1 /* line 0, entry 1 */, 0, 0, 3, 3, BUF);
    await install(c);
    const after = await c.evalExpr('window.__c.uniqueTiles()');
    const coloursAfter = await c.evalExpr('window.__c.coloursReadout()');
    check('2a', 'a stroke raises the unique-tile count', after > before, `${before} -> ${after}`);
    check('2b', 'the colours readout moves on the line that was painted',
      coloursAfter !== coloursBefore && /colours 1/.test(coloursAfter),
      `${JSON.stringify(coloursBefore)} -> ${JSON.stringify(coloursAfter)}`);
    check('2c', 'and on NO other line', /colours 1·0·0·0/.test(coloursAfter), coloursAfter);
  }

  // --- 3: two lines in one cell tints exactly that cell --------------------
  if (run(3)) {
    // Cell (8,0) gets line 0 AND line 1 — a real clash. Cell (0,0) already
    // holds line-0 art only, so it must stay clean.
    await paintCell(c, 1, 8, 0, 11, 3, BUF);          // line 0, entry 1
    await paintCell(c, 1 + 16, 12, 0, 15, 3, BUF);    // line 1, entry 1
    await install(c);
    const red = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    check('3a', 'the clashing cell is tinted', red.includes('8,0'), `red cells: ${JSON.stringify(red)}`);
    check('3b', 'and ONLY that cell', red.length === 1, `red cells: ${JSON.stringify(red)}`);
    const mentions = await c.evalExpr('window.__c.statusMentionsClashCount()');
    check('3c', 'no COUNT of clashing cells anywhere in the status bar (spec §4.3)',
      mentions === false, `status: ${JSON.stringify(await c.evalExpr('window.__c.status()'))}`);
    const border = await c.evalExpr('window.__c.chipBorder("Clashes")');
    note('3d', 'Clashes chip border while the tint is ON', border);
    await shot(c, '2b-03-clash-tint');
  }

  // --- 4: THE TRANSPARENT RULE, live --------------------------------------
  if (run(4)) {
    // Line-3 art on transparency, alone in its cell. Transparent pixels have no
    // line, so this is LEGAL — a rule reading the high nibble raw would tint it.
    await paintCell(c, 1 + 48, 24, 0, 26, 2, BUF);    // line 3, entry 1, part of the cell
    await install(c);
    const red = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    check('4a', 'line-3 art on transparency does NOT tint (transparency has no line)',
      !red.includes('24,0'), `red cells: ${JSON.stringify(red)}`);
    await shot(c, '2b-04-transparent-ok');
  }

  // --- 5: erasing back to one line clears the tint ------------------------
  if (run(5)) {
    const beforeRed = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    // Repaint the line-1 half of the clashing cell in line 0 — one line again.
    await paintCell(c, 1, 12, 0, 15, 3, BUF);
    await install(c);
    const afterRed = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    check('5a', 'the tint clears when the cell goes back to one line',
      beforeRed.includes('8,0') && !afterRed.includes('8,0'),
      `${JSON.stringify(beforeRed)} -> ${JSON.stringify(afterRed)}`);
  }

  // --- 6: the sprite profile flags out-of-range lines ---------------------
  if (run(6)) {
    await setProfile(c, 'genesis-sprite');
    await install(c);
    const amber = await c.json(`window.__c.amberCells(${BUF}, ${BUF})`);
    const red = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    const samples = await c.json(`window.__c.tintSamples(${BUF}, ${BUF})`);
    check('6a', 'a one-line profile flags the cell drawing from line 3',
      amber.includes('24,0'),
      `amber: ${JSON.stringify(amber)} red: ${JSON.stringify(red)} raw: ${JSON.stringify(samples)}`);
    check('6a2', 'and it is AMBER (re-assign), not red (redraw) — the two repairs differ',
      red.length === 0, `red: ${JSON.stringify(red)}`);
    const colours = await c.evalExpr('window.__c.coloursReadout()');
    // The SHAPE, not the digit 3. The first version tested /3/ and read "line
    // 3" where the readout prints line 3's COUNT, which is 1 — so it demanded a
    // character the correct output never contains. What must hold: lines the
    // one-line profile does not have print as an em dash, EXCEPT line 3, which
    // is in use and therefore still shows its count.
    check('6b', 'the colours readout still shows a line the profile does not have',
      /colours \d+·—·—·\d+ \/ 15 per line/.test(colours || ''), `colours: ${JSON.stringify(colours)}`);
    const frame = await c.evalExpr('window.__c.frameReadout()');
    check('6c', 'the sprite profile adds a frame readout',
      frame !== null && /frame 8×8 tiles/.test(frame), `frame: ${JSON.stringify(frame)}`);
    check('6d', 'and names the 4×4 bound, because 64px is 8 tiles',
      /one sprite is 4×4 max/.test(frame || ''), `frame: ${JSON.stringify(frame)}`);
    await shot(c, '2b-06-sprite-profile');
    await setProfile(c, 'genesis-level-art');
    await install(c);
  }

  // --- 7: the grid origin moves the cells the rule evaluates --------------
  if (run(7)) {
    // THE CLAIM IS THAT THE ORIGIN RE-CUTS THE GRID, not that the tile count
    // must move. The first version asserted the count changes and failed at
    // 4 -> 4 — correctly: this art is three separated blobs, and cutting the
    // grid differently still leaves three distinct shapes plus the blank tile.
    // What MUST change is the band of pixels no cell can claim, which is 0 on
    // an aligned grid and non-zero the moment the origin is off-phase.
    const outsideBefore = await c.evalExpr('/(\\d+)px outside the grid/.test(window.__c.status())');
    const uniqueBefore = await c.evalExpr('window.__c.uniqueTiles()');
    const redBefore = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    await setOrigin(c, 'x', 3);
    await install(c);
    const uniqueAfter = await c.evalExpr('window.__c.uniqueTiles()');
    const redAfter = await c.json(`window.__c.redCells(${BUF}, ${BUF}, 3, 0)`);
    const outsideAfter = await c.evalExpr('/(\\d+)px outside the grid/.test(window.__c.status())');
    check('7a', 'an aligned grid reports NO pixels outside it', outsideBefore === false,
      `before: ${JSON.stringify(await c.evalExpr('window.__c.tilesReadout()'))}`);
    note('7b', 'tile count and clash cells across the nudge',
      `unique ${uniqueBefore} -> ${uniqueAfter}; red ${JSON.stringify(redBefore)} -> ${JSON.stringify(redAfter)}`);
    const outside = outsideAfter;
    check('7c', 'nudging the origin puts a band outside the grid, and it is reported',
      outside === true, await c.evalExpr('window.__c.status()'));
    await shot(c, '2b-07-origin-nudge');
    await setOrigin(c, 'x', 0);
    await install(c);
  }

  // --- 8: the unconstrained escape hatch ----------------------------------
  if (run(8)) {
    await c.evalExpr('window.__c.clickChip("Constraints")');
    await sleep(600);
    await install(c);
    const off = await c.evalExpr('window.__c.constraintsOff()');
    const redOff = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    const tilesOff = await c.evalExpr('window.__c.uniqueTiles()');
    const clashChipEnabled = await c.evalExpr('window.__c.chipEnabled("Clashes")');
    check('8a', 'every readout becomes "constraints --"', off === true,
      `status: ${JSON.stringify(await c.evalExpr('window.__c.status()'))}`);
    check('8b', 'no stale number survives the switch-off', tilesOff === null, `unique=${tilesOff}`);
    check('8c', 'the tint disappears', redOff.length === 0, JSON.stringify(redOff));
    check('8d', 'the Clashes chip greys out', clashChipEnabled === false, `enabled=${clashChipEnabled}`);
    await shot(c, '2b-08-unconstrained');

    await c.evalExpr('window.__c.clickChip("Constraints")');
    await sleep(600);
    await install(c);
    const backOn = await c.evalExpr('window.__c.uniqueTiles()');
    const redBack = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    check('8e', 're-enabling rescans without a tab switch or redraw',
      backOn !== null && backOn > 0, `unique=${backOn}`);
    note('8f', 'tint after re-enabling', JSON.stringify(redBack));
  }

  // --- 9: the overlay toggles alone ---------------------------------------
  if (run(9)) {
    // Put a clash back so there is something to hide.
    await paintCell(c, 1 + 32, 12, 0, 15, 3, BUF);   // line 2 into the line-0 cell
    await install(c);
    const redOn = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    await c.evalExpr('window.__c.clickChip("Clashes")');
    await sleep(600);
    await install(c);
    const redOff = await c.json(`window.__c.redCells(${BUF}, ${BUF})`);
    const tilesStill = await c.evalExpr('window.__c.uniqueTiles()');
    const border = await c.evalExpr('window.__c.chipBorder("Clashes")');
    check('9a', 'hiding the overlay removes the tint',
      redOn.length > 0 && redOff.length === 0,
      `${JSON.stringify(redOn)} -> ${JSON.stringify(redOff)}`);
    check('9b', 'the readouts stay while the tint is hidden', tilesStill !== null, `unique=${tilesStill}`);
    check('9c', 'the Clashes chip takes a warning tone while it is hiding a real clash',
      border !== null && /^rgb/.test(border) && border !== 'rgba(0, 0, 0, 0)',
      `border: ${border}`);
    await shot(c, '2b-09-overlay-hidden');
    await c.evalExpr('window.__c.clickChip("Clashes")');
    await sleep(500);
    await install(c);
  }

  // --- 10: undo carries the readouts and the tint with it ------------------
  if (run(10)) {
    // ONE GESTURE, so ONE Ctrl+Z undoes all of it. The first version painted a
    // 4-row blob — which paintCell issues as FOUR drags, hence four undo
    // entries — then pressed Ctrl+Z once and reported "undo moves nothing"
    // when three quarters of the paint was still there. The app was right and
    // the check was wrong.
    const base = await c.evalExpr('window.__c.uniqueTiles()');
    await c.evalExpr('window.__c.clickSwatch(2)');   // line 0, entry 2 — a shape not yet used
    await sleep(200);
    await drawArt(c, 40, 40, 45, 40, BUF, 6);        // exactly one gesture
    await sleep(400);
    await install(c);
    const after = await c.evalExpr('window.__c.uniqueTiles()');
    const hashAfter = await c.evalExpr('window.__c.canvasHash()');
    check('10a', 'one stroke adds one distinct tile', after === base + 1, `${base} -> ${after}`);

    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await sleep(900);
    await install(c);
    const undone = await c.evalExpr('window.__c.uniqueTiles()');
    const hashUndone = await c.evalExpr('window.__c.canvasHash()');
    check('10b', 'and one Ctrl+Z takes the readout back with it', undone === base, `${after} -> ${undone}`);
    check('10c', 'the canvas itself changed, so the readout is not tracking a phantom',
      hashAfter !== hashUndone, `hash ${hashAfter} -> ${hashUndone}`);
    await shot(c, '2b-10-after-undo');
  }

  return { fails, negFails, results };
}

async function main() {
  console.log('=== phase 2B constraint harness ===');
  const cleared = clearCanvases();
  if (cleared.length) console.log(`   cleared ${cleared.length} leftover canvas file(s): ${cleared.join(', ')}`);
  await session('2B constraints', body);

  console.log('\n=== summary ===');
  const pass = results.filter((r) => r.ok === true).length;
  const fail = results.filter((r) => r.ok === false).length;
  const notes = results.filter((r) => r.ok === null).length;
  console.log(`${pass} passed, ${fail} failed, ${notes} notes`);
  if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log('  ' + f)); }
  if (negFails.length) { console.log('\nBROKEN NEGATIVE CONTROLS:'); negFails.forEach((f) => console.log('  ' + f)); }
  process.exitCode = fails.length || negFails.length ? 1 : 0;
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 2; });
