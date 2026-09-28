// DO ROW 239 (d)'S STRAGGLER STROKES LAND WITH BOTH EDGES ON WHOLE DEVICE PIXELS?
// (ROADMAP row 239 (d): the strokes rows 237, 238 and 239 (a) left in world units.)
//
// Row 238's packet (docs/reviews/2026-09-28-device-grid-238.md, Open) listed five stroke
// sites MapViewport still drew in world units. This harness puts each one on screen in
// the REAL app, on an aeon COPY, and reads the stroke's edge off two REAL screenshots
// (device px) taken with nothing changed between them but the one state that draws it:
//
//   p   the paste ghost's outline (site 1): paste armed by a real marquee drag, a real
//       Ctrl+C and Ctrl+V, then a real hover. Its TOP edge is read, inside dash-on runs.
//   c   the collision-paint outlines (site 2): the eraser armed, the 'c' key, a real
//       hover over a cell. The cell's LEFT edge is read (scope 1 px + primary 1.5 px,
//       both inset, over the erase fill).
//   m   OverlayRenderer's angle mark (site 3): the angles toggle, over a flat floor
//       the app's own collision-mark report names. The vertical STEM is read (casing
//       then core), at zoom 2 (the compact tier: stem only).
//   b   OverlayRenderer's no-preview object box (site 3): the objects toggle, over an
//       object the app draws as a box (found by looking for the box's own colour).
//   l   the priority lens (site 4): the lens toggle, at a marked tile whose left
//       neighbour is unmarked (found from the app's own nametable, `ntRect`).
//   bp  the both-planes lens (site 4): the lens toggle, at a cell made solid on both
//       planes by a poke of plane B with plane A's own word (in memory, never saved).
//   lg  the legend swatch (site 5): its mark is ALL diagonal, so nothing snaps; the
//       swatch's pixels are compared byte for byte against a baseline build's.
//
// ═══ THE INSTRUMENT: A PREDICTED CROSS-SECTION ═══
//
// For each edge, E is the device index the ruled rule (`snapStrokeEdges` / the inset
// helper) puts the stroke's edge on, restated here from `deviceStrokeWidth`'s parity rule
// and `Math.round`, never read from the app. Every layer the state draws across the edge
// (fills, strokes, their colours and alphas parsed from canvas-colors.ts) is given a
// device interval with WHOLE ends, and each sampled pixel of the "on" shot is predicted
// as those layers composited, source-over, onto the SAME pixel of the "off" shot. A
// pixel matches when every channel is within TOL. A stroke that half-covers a device
// column (master's world-unit strokes, wherever an edge lands off the grid) mixes its
// colour with the pixel beside it and matches NO whole-pixel prediction.
//
// Rows per edge: `.out` the columns just OUTSIDE the stroke are unchanged (nothing
// bleeds past the outer edge), `.stroke` the stroke's own columns, `.in` the columns just
// inside it (the fill-only prediction: nothing crosses the inner edge). Each row prints
// its per-column mismatch counts and one sampled line before and after.
//
// Geometry is chosen so the FILLS have whole edges (zoom 2, integer camera, world
// coordinates on the 8 px grid: whole device px at 1 and at 1.5), so the fills are not
// what a row measures. Where the rule leaves a choice (a stroke width that is an exact
// parity tie, e.g. the stem core's 3.0 device px at dpr 1.5) every candidate is
// predicted and the row passes on any ONE of them for the whole edge, and says which.
//
// ═══ IDENTITY AGAINST A BASELINE BUILD ═══
//
// `EDGE_OUT=<file>` writes each subject's raw cross-section and the legend swatch's
// pixels; `EDGE_BASELINE=<file>` compares this build's against them byte for byte
// (`.id` rows). Without a baseline those rows print NOT MEASURED, never a pass. An `.id`
// row is a CLAIM only where the stroke should not have moved: the paste ghost and the
// object box at dpr 1 (2 device px on a whole edge, as master's world-unit stroke drew)
// and the legend swatch at every dpr. Elsewhere the count is printed as a note.
//
// READ ONLY: the aeon tree is a COPY (AEON_DIR, refused if live); nothing is saved.
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Run:  VITE_AURORA_DEBUG=1 npm run build
//       ELECTRON_BIN=<main checkout>/node_modules/.bin/electron AURORA_BUILT_TREE=<this tree> \
//       AEON_DIR=<a copy of aeon> npm run harness:stragglers-239d  [SCALES=1,1.5] [TAG=run]
//       [PARTS=p,c,m,b,l,bp,lg] [EDGE_OUT=f.json] [EDGE_BASELINE=f.json]
// Read the `root:` / `pinned:` lines first: if they name a tree other than the one you
// built, the run measured somebody else's app and is void.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { session, sleep, ROOT, MAIN } from './canvas-cdp-harness.mjs';
import { checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';

const SCALES = (process.env.SCALES ?? '1,1.5').split(',').map((s) => Number(s.trim()));
const PARTS = new Set((process.env.PARTS ?? 'p,c,m,b,l,bp,lg').split(',').map((s) => s.trim()));
const SHOT_DIR = process.env.SHOT_DIR ?? `${ROOT}/scratchpad/shots-stragglers-239d`;
const TAG = process.env.TAG ?? 'run';
const TOL = 3;
mkdirSync(SHOT_DIR, { recursive: true });
const J = (v) => JSON.stringify(v);

const AEONDIR = checkoutOverride('aeon')?.value ?? null;
if (!AEONDIR || !existsSync(AEONDIR)) throw new Error('AEON_DIR must point at a COPY of an aeon tree: UNMEASURABLE without it');
if (AEONDIR === siblingDefaultPathOrUnresolved('aeon')) throw new Error('AEON_DIR names the live aeon tree: make a copy');

const BASELINE = process.env.EDGE_BASELINE ? JSON.parse(readFileSync(process.env.EDGE_BASELINE, 'utf8')) : null;
const OUT = {};

const rows = [];
const check = (id, what, pass, detail = '') => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n        ${detail}` : ''}`);
};
const notMeasured = (id, what, why) => console.log(`NOT MEASURED  ${id}  ${what}\n        ${why}`);
const note = (id, what, v) => console.log(`      ${id}  ${what}: ${typeof v === 'string' ? v : J(v)}`);

// ── WHAT THE APP DECLARES, PARSED FROM SOURCE ─────────────────────────────
const COLOURS = readFileSync(`${ROOT}/src/renderer/canvas/canvas-colors.ts`, 'utf8');
/** A colour constant as { rgb, a }: `rgba(r, g, b, a)` or `#rrggbb`. */
function colour(name) {
  const rgba = new RegExp(`export const ${name} = 'rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)'`).exec(COLOURS);
  if (rgba) return { name, rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], a: Number(rgba[4]) };
  const hex = new RegExp(`export const ${name} = '#([0-9a-fA-F]{6})'`).exec(COLOURS);
  if (hex) { const n = parseInt(hex[1], 16); return { name, rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 }; }
  throw new Error(`${name} is not an rgba(...) or #rrggbb literal: the prediction cannot be derived, UNMEASURABLE`);
}
const C = {
  marquee: colour('SELECTION_MARQUEE'),
  erase: colour('COLLISION_PREVIEW_ERASE'),
  scope: colour('COLLISION_PREVIEW_SCOPE'),
  primary: colour('COLLISION_PREVIEW_PRIMARY'),
  tick: colour('COLLISION_ANGLE_TICK'),
  casing: colour('COLLISION_ANGLE_CASING'),
  boxFill: colour('OBJECT_BOX_FILL'),
  boxStroke: colour('OBJECT_BOX_STROKE'),
  priFill: colour('PRIORITY_FILL'),
  priEdge: colour('PRIORITY_EDGE'),
  bpFill: colour('BOTH_PLANES_FILL'),
  bpEdge: colour('BOTH_PLANES_EDGE'),
};
/** The mark's widths, from their source: 1.25 / 3 CSS px, the stem at ARROW_WIDTH_SCALE. */
const ARROW = (() => {
  const m = /export const ARROW_WIDTH_SCALE = ([\d.]+);/.exec(readFileSync(`${ROOT}/src/core/collision/collision-angle-mark.ts`, 'utf8'));
  if (!m) throw new Error('ARROW_WIDTH_SCALE not found: UNMEASURABLE');
  return Number(m[1]);
})();

/**
 * `deviceStrokeWidth`'s parity rule, restated (canvas/device-grid.ts): the integer nearest
 * css x dpr with css's (rounded) parity, ties thinner. Returns EVERY candidate when the
 * product is an exact tie, because the app decides a tie by floating-point noise
 * (row 239 (d) finding, overlay-stragglers-device-grid.test.ts).
 */
function widths(css, dpr) {
  const parity = Math.abs(Math.round(css)) % 2;
  const x = css * dpr;
  const k = parity + 2 * Math.ceil((x - parity) / 2 - 0.5);
  const w = Math.max(parity === 1 ? 1 : 2, k);
  const tie = Math.abs(Math.abs(x - w) - 1) < 1e-9;
  return tie ? [w, w + 2 * Math.sign(x - w)].filter((v) => v >= (parity ? 1 : 2)) : [w];
}
/** A stroke of device width w centred by the parity rule nearest device coordinate d: [lo, hi). */
function strokeSpan(d, w) {
  const c = Math.round(d);
  return w % 2 === 1 ? [c - (w - 1) / 2, c + (w + 1) / 2] : [c - w / 2, c + w / 2];
}

const over = (under, col) => under.map((u, i) => col.rgb[i] * col.a + u * (1 - col.a));
const hex = (q) => ((q[0] << 16) | (q[1] << 8) | q[2]).toString(16).padStart(6, '0');
const close = (p, q) => p.every((v, i) => Math.abs(v - q[i]) <= TOL);

async function mouseEv(c, type, x, y, button = 'none', buttons = 0, modifiers = 0) {
  await c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1, modifiers });
}
async function keyPress(c, k, modifiers = 0) {
  const special = { Escape: { code: 'Escape', windowsVirtualKeyCode: 27 } }[k];
  const p = special ? { key: k, ...special, modifiers } : { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  await sleep(400);
}
const CTRL = 2;
const geom = (c) => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
  const r = cv.getBoundingClientRect(); return { dpr: window.devicePixelRatio, left: r.left, top: r.top, width: r.width, height: r.height,
  innerWidth: window.innerWidth, innerHeight: window.innerHeight }; })()`);
const shotB64 = async (c) => (await c.send('Page.captureScreenshot', { format: 'png' })).data;
const SHOT_PIXELS = String.raw`((b64, pts) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => {
    const k = document.createElement('canvas'); k.width = img.naturalWidth; k.height = img.naturalHeight;
    const kc = k.getContext('2d', { willReadFrequently: true }); kc.imageSmoothingEnabled = false; kc.drawImage(img, 0, 0);
    const d = kc.getImageData(0, 0, k.width, k.height).data;
    res({ natW: img.naturalWidth, natH: img.naturalHeight, px: pts.map(([x, y]) => { const i = (y * k.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; }) });
  };
  img.onerror = () => rej(new Error('screenshot did not decode'));
  img.src = 'data:image/png;base64,' + b64;
}))`;

/**
 * The rows for one edge.
 *   vertical  the stroke runs vertically, so offsets step across device COLUMNS
 *   E         the device index offsets are relative to (the edge the rule puts it on)
 *   along     device rows (vertical) or columns (horizontal) to sample
 *   layers    [{ col, span: [lo, hi) in offsets }] in draw order, one alternative per
 *             candidate width set; the row passes if one alternative predicts every pixel
 *   groups    { out: [...offsets], stroke: [...], in: [...] }
 */
async function edgeRows(c, g, id, what, offB64, onB64, vertical, E, along, alternatives, groups, minN = 12, sameAsBaseline = false) {
  const offsets = [...new Set(Object.values(groups).flat())].sort((a, b) => a - b);
  const pts = [];
  for (const o of offsets) for (const a of along) pts.push(vertical ? [E + o, a] : [a, E + o]);
  const off = await c.evalExpr(`${SHOT_PIXELS}(${J(offB64)}, ${J(pts)})`);
  const on = await c.evalExpr(`${SHOT_PIXELS}(${J(onB64)}, ${J(pts)})`);
  const shotIsDevice = on.natW === Math.round(g.innerWidth * g.dpr) && on.natH === Math.round(g.innerHeight * g.dpr);
  const n = along.length;
  const at = (k, t) => k * n + t;
  const predict = (layers, o, under) => layers.reduce((u, L) => (o >= L.span[0] && o < L.span[1] ? over(u, L.col) : u), under);
  // Score each alternative over EVERY offset; keep the best (fewest mismatches overall).
  const scored = alternatives.map((alt) => {
    const miss = offsets.map((o, k) => {
      let m = 0;
      for (let t = 0; t < n; t++) if (!close(on.px[at(k, t)], predict(alt.layers, o, off.px[at(k, t)]))) m++;
      return { o, m };
    });
    return { alt, miss, total: miss.reduce((s, x) => s + x.m, 0) };
  }).sort((a, b) => a.total - b.total);
  const best = scored[0];
  const mid = Math.floor(n / 2);
  const line = (w) => offsets.map((o, k) => hex(w.px[at(k, mid)])).join(' ');
  note(id, `${what}: ${n} sampled ${vertical ? 'rows' : 'columns'}, E = device ${vertical ? 'column' : 'row'} ${E}; alternative "${best.alt.name}"`
    + (alternatives.length > 1 ? ` (of ${alternatives.map((a) => a.name).join(' | ')})` : ''),
    best.miss.map((x) => `E${x.o >= 0 ? '+' : ''}${x.o}: ${x.m}/${n} mismatch`).join('; '));
  note(id, `one line across it, E${offsets[0]}..E+${offsets[offsets.length - 1]}, off`, line(off));
  note(id, `one line across it, E${offsets[0]}..E+${offsets[offsets.length - 1]}, on `, line(on));
  OUT[id] = { offsets, n, on: on.px.map(hex) };
  const sd = `screenshot in device px: ${shotIsDevice} (${on.natW}x${on.natH}); ${n} sampled (at least ${minN} required)`;
  const bad = (os) => best.miss.filter((x) => os.includes(x.o) && x.m > 0);
  const ok = (os) => shotIsDevice && n >= minN && bad(os).length === 0;
  const say = (os) => `${os.map((o) => `E${o >= 0 ? '+' : ''}${o}`).join(',')} mismatched ${J(bad(os))}; ${sd}`;
  if (groups.out) check(`${id}.out`, `${what}: the columns OUTSIDE the stroke are unchanged (nothing past the outer edge)`, ok(groups.out), say(groups.out));
  if (groups.stroke) check(`${id}.stroke`, `${what}: the stroke's own columns are the whole-pixel composite (both edges whole)`, ok(groups.stroke), say(groups.stroke));
  if (groups.in) check(`${id}.in`, `${what}: the columns INSIDE the stroke are the fill-only composite (nothing past the inner edge)`, ok(groups.in), say(groups.in));
  identity(`${id}.id`, `${what}: the on-shot cross-section`, on.px.map(hex), sameAsBaseline);
  return best;
}

/**
 * Byte-for-byte against the baseline build's run, or NOT MEASURED. A CLAIM (a row) only
 * where the stroke is expected to be unchanged from the baseline (`claim`); elsewhere the
 * count is printed as a note, because the fix is meant to move those pixels.
 */
function identity(id, what, hexes, claim = true) {
  OUT[id] = hexes;
  if (!BASELINE) return claim ? notMeasured(id, `${what} is byte-identical to the baseline build`, 'no EDGE_BASELINE given') : undefined;
  const base = BASELINE[id];
  if (!base) return notMeasured(id, `${what} vs the baseline build`, 'the baseline has no such key');
  const differ = base.length === hexes.length ? hexes.filter((h, i) => h !== base[i]).length : -1;
  const detail = differ < 0 ? `length ${hexes.length} vs baseline ${base.length}` : `${differ} of ${hexes.length} px differ`;
  if (claim) check(id, `${what} is byte-identical to the baseline build`, differ === 0, detail);
  else note(id, `${what} vs the baseline build (not a claim: this stroke is meant to move)`, detail);
}

/** Device indices from CSS fromCss..toCss (exclusive), skipping CSS coordinates near `avoid`. */
function sampleLine(origin, fromCss, toCss, dpr, keep = () => true, cap = 60) {
  const out = [];
  for (let d = Math.ceil(fromCss * dpr); d < Math.floor(toCss * dpr) && out.length < cap; d++) {
    if (keep(d / dpr)) out.push(origin + d);
  }
  return out;
}

const Z = 2;

async function partScale(scale) {
  const P = `s${scale}`;
  await session(`${P}: row 239 (d) stragglers at --force-device-scale-factor=${scale}`, async (c) => {
    console.log(`      provenance  app entry ${MAIN}; aeon COPY ${AEONDIR} (the root:/pinned: lines above name the tree)`);
    await c.evalExpr('localStorage.clear(); 1');
    await c.evalExpr(`window.__dbg.aeon.open(${J(AEONDIR)})`).catch((e) => note(P, 'aeon open threw', e.message));
    let st = null;
    for (let i = 0; i < 50; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open && st.sections > 0) break;
      await sleep(400);
    }
    if (!st || !st.open) throw new Error(`aeon copy did not open: ${J(st)}: UNMEASURABLE`);
    await sleep(2500);
    await c.evalExpr("window.__dbg.setOverlay('playAnimatedArt', false)").catch(() => null);
    for (const k of ['showCollision', 'showCollisionPathB', 'showCollisionAngles', 'showPriority', 'showSolidBothPlanes', 'showObjects', 'showRings']) {
      await c.evalExpr(`window.__dbg.setOverlay(${J(k)}, false)`).catch(() => null);
    }
    const park = async () => { await mouseEv(c, 'mouseMoved', 2, 2); await sleep(350); };
    const setView = async (x, y) => {
      await c.evalExpr(`window.__dbg.setView(${x}, ${y + 1}, ${Z})`); await sleep(250);
      await c.evalExpr(`window.__dbg.setView(${x}, ${y}, ${Z})`); await sleep(500);
    };
    await setView(0, 0); await park();
    const g = await geom(c);
    const devLeft = g.left * g.dpr, devTop = g.top * g.dpr;
    const devAligned = Math.abs(devLeft - Math.round(devLeft)) < 1e-6 && Math.abs(devTop - Math.round(devTop)) < 1e-6;
    const ox = Math.round(devLeft), oy = Math.round(devTop);
    check(`${P}.0`, `PREMISE: dpr ${scale} took and the map canvas sits on whole device px`,
      Math.abs(g.dpr - scale) < 1e-6 && devAligned, `dpr ${g.dpr}; canvas rect ${J({ left: g.left, top: g.top, width: g.width, height: g.height })}; device origin (${devLeft}, ${devTop})`);
    const cssW = g.width, cssH = g.height;
    /** Device column / row of a world coordinate under camera (cx, cy) at zoom Z. */
    const dx = (wx, cx) => ox + (wx - cx) * Z * g.dpr;
    const dy = (wy, cy) => oy + (wy - cy) * Z * g.dpr;
    const client = (wx, wy, cx, cy) => ({ x: Math.round(g.left + (wx - cx) * Z), y: Math.round(g.top + (wy - cy) * Z) });
    const save = (name, b64) => writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-${name}.png`, Buffer.from(b64, 'base64'));

    // ── p: the paste ghost (site 1) ───────────────────────────────────────
    if (PARTS.has('p')) {
      const id = `${P}.p`;
      const CX = 64, CY = 64;
      await setView(CX, CY);
      await keyPress(c, 'm');
      // Copy a 4x4-tile block-aligned region at world (80, 80): press/release inside tiles.
      const a = client(80 + 3, 80 + 3, CX, CY), b = client(80 + 24 + 3, 80 + 24 + 3, CX, CY);
      await mouseEv(c, 'mouseMoved', a.x, a.y); await sleep(100);
      await mouseEv(c, 'mousePressed', a.x, a.y, 'left', 1); await sleep(80);
      await mouseEv(c, 'mouseMoved', b.x, b.y, 'left', 1); await sleep(80);
      await mouseEv(c, 'mouseReleased', b.x, b.y, 'left', 0); await sleep(300);
      await keyPress(c, 'c', CTRL);
      const clip = await c.json('window.__dbg.aeon.mapClipboardInfo()');
      await keyPress(c, 'v', CTRL);
      await park();
      const pOff = await shotB64(c);
      // Hover world (208+3, 112+3): tile (26, 14), already on the 2-tile step.
      const TX = 208, TY = 112;
      const h = client(TX + 3, TY + 3, CX, CY);
      await mouseEv(c, 'mouseMoved', h.x, h.y); await sleep(600);
      const ghost = await c.json('window.__dbg.aeon.pasteGhost()');
      const pOn = await shotB64(c);
      save('paste-off', pOff); save('paste-on', pOn);
      check(`${id}.0`, 'PREMISE: a real marquee drag and Ctrl+C filled a 4x4 block-aligned clipboard, Ctrl+V armed paste, and the real hover put the ghost at tile (26, 14)',
        !!clip && clip.widthTiles === 4 && clip.heightTiles === 4 && !clip.artOnly && !!ghost && ghost.pasting === true
          && !!ghost.hover && ghost.hover.baseCol === 26 && ghost.hover.baseRow === 14,
        `clipboard ${J(clip)}; ghost ${J(ghost)}; hover client (${h.x},${h.y}); shots ${TAG}-scale${scale}-paste-{off,on}.png`);
      // Top edge, 2 CSS px, EVEN: centred on the whole device row round(edge).
      const Ey = Math.round(dy(TY, CY));
      const [w] = widths(2, g.dpr);
      const [lo, hi] = strokeSpan(dy(TY, CY), w).map((v) => v - Ey);
      // Columns inside dash-ON runs, [8k + 1, 8k + 3] CSS from the left corner, k >= 1,
      // clear of the right corner.
      const L = (TX - CX) * Z, Wd = 32 * Z;
      const along = sampleLine(ox, L + 8, L + Wd - 8, g.dpr, (css) => { const r = (css - L) % 8; return r >= 1 && r <= 3; });
      await edgeRows(c, g, `${id}.top`, 'paste ghost outline, top edge (horizontal, dashed, 2 CSS px)', pOff, pOn, false, Ey, along,
        [{ name: `width ${w}`, layers: [{ col: C.marquee, span: [lo, hi] }] }],
        { out: [lo - 2, lo - 1], stroke: [lo, hi - 1] }, 12, g.dpr === 1);
      await keyPress(c, 'Escape'); await keyPress(c, 'Escape');
      await c.evalExpr('window.__dbg.aeon.setTool ? window.__dbg.aeon.setTool("view") : null').catch(() => null);
      await keyPress(c, 'v');
      await park();
    }

    // ── c: the collision-paint outlines (site 2) ──────────────────────────
    if (PARTS.has('c')) {
      const id = `${P}.c`;
      const CX = 64, CY = 64;
      await setView(CX, CY);
      await c.evalExpr('window.__dbg.aeon.setFacet("collision")').catch(() => null);
      await sleep(500);
      await keyPress(c, 'c');
      const armed = await c.json('window.__dbg.aeon.armCollisionBrush({ shape: 0, brush: 1 })');
      const tool = await c.json('window.__dbg.aeon.state()');
      await park();
      const cOff = await shotB64(c);
      // Hover world (176+8, 96+8): cell (11, 6), world (176, 96).
      const WX = 176, WY = 96;
      const h = client(WX + 8, WY + 8, CX, CY);
      await mouseEv(c, 'mouseMoved', h.x, h.y); await sleep(600);
      const cOn = await shotB64(c);
      save('paint-off', cOff); save('paint-on', cOn);
      check(`${id}.0`, 'PREMISE: the \'c\' key armed paint-collision with the eraser (word 0)',
        tool.tool === 'paint-collision' && armed.word === 0, `state tool ${tool.tool}; armed ${J(armed)}; hover (${h.x},${h.y}); shots ${TAG}-scale${scale}-paint-{off,on}.png`);
      // Left edge: the cell edge E is whole (world on the 16 grid, zoom 2, integer camera).
      const E = Math.round(dx(WX, CX));
      const [ws] = widths(1, g.dpr), [wp] = widths(1.5, g.dpr);
      const cellDev = Math.round(16 * Z * g.dpr);
      const top = (WY - CY) * Z, bot = top + 16 * Z;
      const along = sampleLine(oy, top + 4, bot - 4, g.dpr);
      await edgeRows(c, g, `${id}.left`, `collision-paint cell, left edge (inset scope ${ws} + primary ${wp} device px over the erase fill)`, cOff, cOn, true, E, along,
        [{ name: `scope ${ws}, primary ${wp}`, layers: [
          { col: C.erase, span: [0, cellDev] }, { col: C.scope, span: [0, ws] }, { col: C.primary, span: [0, wp] }] }],
        { out: [-2, -1], stroke: [...Array(wp).keys()], in: [wp, wp + 1] });
      await keyPress(c, 'v');
      await park();
    }

    // ── m: the angle mark's stem (site 3) ─────────────────────────────────
    if (PARTS.has('m')) {
      const id = `${P}.m`;
      await c.evalExpr('window.__dbg.setOverlay("showCollision", true)');
      await c.evalExpr('window.__dbg.setOverlay("showCollisionAngles", true)');
      // An AXIS-ALIGNED stem the app's own report names (a vertical stem: a floor or
      // ceiling mark; a horizontal one: a wall's), with a known open side, searched over a
      // grid of cameras across section 0. Aeon's flat ground carries no angle (no mark at
      // all), so most marks on screen are slopes, which the rule leaves diagonal.
      let pick = null, cam = null, vertical = true;
      const seen = { cameras: 0, marks: 0 };
      const vw = cssW / Z, vh = cssH / Z;
      search:
      for (let CY = 0; CY <= 2048 - vh; CY += 256) {
        for (let CX = 0; CX <= 2048 - vw; CX += 256) {
          await c.evalExpr(`window.__dbg.setView(${CX}, ${CY}, ${Z})`); await sleep(220);
          const rep = await c.json('window.__dbg.aeon.collisionMarks()');
          seen.cameras++; seen.marks += (rep.rows ?? []).length;
          const inView = (r) => Math.min(r.ax, r.tipx) - CX > 24 && Math.max(r.ax, r.tipx) - CX < vw - 24
            && Math.min(r.ay, r.tipy) - CY > 24 && Math.max(r.ay, r.tipy) - CY < vh - 24;
          for (const r of rep.rows ?? []) {
            if (!r.normalKnown || !inView(r)) continue;
            if (Math.abs(r.tipx - r.ax) < 1e-9) { pick = r; vertical = true; cam = [CX, CY]; break search; }
            if (Math.abs(r.tipy - r.ay) < 1e-9) { pick = r; vertical = false; cam = [CX, CY]; break search; }
          }
        }
      }
      note(id, 'real axis-aligned marks in section 0', pick ? J(pick) : `none over ${seen.cameras} cameras (${seen.marks} marks reported, every one slanted)`);
      if (!pick) {
        // AUTHORED FIXTURE, SAID SO: section 0 draws no axis-aligned mark (aeon's flat
        // ground carries the odd "no angle" byte). So an air cell is poked, in memory
        // only, with each shape the bank gives an AXIS-ALIGNED angle byte (read from the
        // copy's own angles.bin, base dir first as the loader probes), through the app's
        // own word packing (`armCollisionBrush`), until the app's report names its mark.
        const bank = ['base/angles.bin', 'angles.bin'].map((f) => `${AEONDIR}/games/sonic4/data/collision/${f}`).find((f) => existsSync(f));
        const angles = bank ? [...readFileSync(bank)] : [];
        const shapes = angles.map((v, i) => ((v & 0xff) % 0x40 === 0 && i > 0 ? i : -1)).filter((i) => i > 0).slice(0, 40);
        const CX = 512, CY = 512;
        await c.evalExpr(`window.__dbg.setView(${CX}, ${CY}, ${Z})`); await sleep(300);
        const W = 256;
        let cell = null;
        // The right half of the view: the collision legend (a DOM box over the map) sits
        // at its left and grows a row when the angles are switched on.
        for (let cr = Math.ceil((CY + 64) / 16); cr < (CY + vh - 64) / 16 && !cell; cr++) {
          for (let cc = Math.ceil((CX + vw * 0.55) / 16); cc < (CX + vw - 64) / 16; cc++) {
            const around = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].map(([x, y]) => ((cr + y) * 2) * W + (cc + x) * 2);
            const words = [];
            for (const i of around) words.push(await c.json(`window.__dbg.aeon.collisionAt(0, 'a', ${i})`));
            if (words.every((w) => w === 0)) { cell = { cc, cr }; break; }
          }
        }
        for (const shape of cell ? shapes : []) {
          const { word } = await c.json(`window.__dbg.aeon.armCollisionBrush({ shape: ${shape}, solidity: 'all' })`);
          for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) await c.json(`window.__dbg.aeon.collisionPoke(0, 'a', ${(cell.cr * 2 + y) * W + cell.cc * 2 + x}, ${word})`);
          await c.evalExpr(`window.__dbg.setView(${CX}, ${CY + 1}, ${Z})`); await sleep(200);
          await c.evalExpr(`window.__dbg.setView(${CX}, ${CY}, ${Z})`); await sleep(300);
          const rep = await c.json('window.__dbg.aeon.collisionMarks()');
          const r = (rep.rows ?? []).find((q) => q.ax >= cell.cc * 16 && q.ax <= cell.cc * 16 + 16 && q.ay >= cell.cr * 16 && q.ay <= cell.cr * 16 + 16);
          if (r && r.normalKnown && (Math.abs(r.tipx - r.ax) < 1e-9 || Math.abs(r.tipy - r.ay) < 1e-9)) {
            pick = r; vertical = Math.abs(r.tipx - r.ax) < 1e-9; cam = [CX, CY];
            note(id, 'authored fixture', `shape ${shape} (angle byte 0x${angles[shape].toString(16)}), word 0x${word.toString(16)}, poked into air cell ${J(cell)} of plane A`);
            break;
          }
        }
        if (!pick) note(id, 'authored fixture', `no shape of ${J(shapes)} (bank ${bank}) drew an axis-aligned mark in air cell ${J(cell)}`);
      }
      await c.evalExpr('window.__dbg.setOverlay("showCollisionAngles", false)');
      if (!pick) {
        check(`${id}.0`, 'PREMISE: an axis-aligned stem is on screen (a real one, or the authored fixture)', false, 'UNMEASURABLE on screen');
      } else {
        const [CX, CY] = cam;
        await setView(CX, CY); await park();
        const mOff = await shotB64(c);
        await c.evalExpr('window.__dbg.setOverlay("showCollisionAngles", true)'); await sleep(600);
        const rep = await c.json('window.__dbg.aeon.collisionMarks()');
        const mOn = await shotB64(c);
        save('mark-off', mOff); save('mark-on', mOn);
        check(`${id}.0`, `PREMISE: an axis-aligned (${vertical ? 'vertical' : 'horizontal'}) stem is drawn at the compact tier (stem only) at zoom 2`,
          rep.active && !rep.suppressed && rep.tier === 'compact' && (rep.rows ?? []).some((r) => r.ax === pick.ax && r.ay === pick.ay),
          `camera (${CX},${CY}); mark ${J(pick)}; report ${J({ active: rep.active, suppressed: rep.suppressed, tier: rep.tier, drawn: rep.drawn })}; searched ${seen.cameras} cameras; shots ${TAG}-scale${scale}-mark-{off,on}.png`);
        const X = vertical ? dx(pick.ax, CX) : dy(pick.ay, CY);
        const E = Math.round(X);
        const [wc] = widths(3 * ARROW, g.dpr);
        const cores = widths(1.25 * ARROW, g.dpr);
        const [cl, ch] = strokeSpan(X, wc).map((v) => v - E);
        const a0 = vertical ? (Math.min(pick.ay, pick.tipy) - CY) * Z : (Math.min(pick.ax, pick.tipx) - CX) * Z;
        const a1 = vertical ? (Math.max(pick.ay, pick.tipy) - CY) * Z : (Math.max(pick.ax, pick.tipx) - CX) * Z;
        // The stem is only NORMAL_LEN (6.5 world px, 13 CSS at zoom 2) long: 1 CSS px clear of each end.
        const along = sampleLine(vertical ? oy : ox, a0 + 1, a1 - 1, g.dpr);
        const alts = cores.map((wk) => {
          const [kl, kh] = strokeSpan(X, wk).map((v) => v - E);
          return { name: `casing ${wc}, core ${wk}`, layers: [{ col: C.casing, span: [cl, ch] }, { col: C.tick, span: [kl, kh] }] };
        });
        await edgeRows(c, g, `${id}.stem`, `angle mark stem (${vertical ? 'vertical' : 'horizontal'}; casing ${3 * ARROW} CSS px, core ${1.25 * ARROW})`, mOff, mOn, vertical, E, along, alts,
          { out: [cl - 2, cl - 1, ch, ch + 1], stroke: [...Array(ch - cl).keys()].map((k) => cl + k) }, 8);
      }
      await c.evalExpr('window.__dbg.setOverlay("showCollisionAngles", false)');
      await c.evalExpr('window.__dbg.setOverlay("showCollision", false)');
    }

    // ── b: the no-preview object box (site 3) ─────────────────────────────
    if (PARTS.has('b')) {
      const id = `${P}.b`;
      const objs = [];
      for (let i = 0; i < 400; i++) {
        const o = await c.json(`window.__dbg.aeon.objectAt(0, ${i})`);
        if (!o) break;
        objs.push(o);
      }
      let found = null;
      for (const o of objs.slice(0, 40)) {
        if (!Number.isInteger(o.x) || !Number.isInteger(o.y)) continue;
        const CX = o.x - 64, CY = o.y - 64;
        if (CX < 0 || CY < 0) continue;
        await setView(CX, CY); await park();
        await c.evalExpr('window.__dbg.setOverlay("showObjects", false)'); await sleep(400);
        const bOff = await shotB64(c);
        await c.evalExpr('window.__dbg.setOverlay("showObjects", true)'); await sleep(500);
        const bOn = await shotB64(c);
        // The box's top-left stroke pixel, just inside the corner: the box colour, or not a box.
        const px = await c.evalExpr(`${SHOT_PIXELS}(${J(bOn)}, ${J([[Math.round(dx(o.x - 8, CX)), Math.round(dy(o.y - 8 + 4, CY))]])})`);
        const s = px.px[0];
        if (s[0] === C.boxStroke.rgb[0] && s[1] === C.boxStroke.rgb[1] && s[2] === C.boxStroke.rgb[2]) { found = { o, CX, CY, bOff, bOn }; break; }
      }
      await c.evalExpr('window.__dbg.setOverlay("showObjects", false)');
      check(`${id}.0`, 'PREMISE: an object the app draws as a no-preview box is found by its own stroke colour',
        !!found, found ? `object ${J(found.o)} at camera (${found.CX},${found.CY}); of ${objs.length} in section 0` : `none of the first ${Math.min(40, objs.length)} of ${objs.length}: UNMEASURABLE`);
      if (found) {
        const { o, CX, CY, bOff, bOn } = found;
        save('object-off', bOff); save('object-on', bOn);
        const E = Math.round(dx(o.x - 8, CX));
        const [w] = widths(Math.max(1 * Z, 0.5), g.dpr);
        const [lo, hi] = strokeSpan(dx(o.x - 8, CX), w).map((v) => v - E);
        const boxDev = Math.round(16 * Z * g.dpr);
        const top = (o.y - 8 - CY) * Z;
        // Rows in the box's top and bottom quarters, clear of the corners and the label.
        const along = [...sampleLine(oy, top + 3, top + 10, g.dpr), ...sampleLine(oy, top + 32 - 10, top + 32 - 3, g.dpr)];
        await edgeRows(c, g, `${id}.left`, `object box, left edge (world width ${Z} CSS px)`, bOff, bOn, true, E, along,
          [{ name: `width ${w}`, layers: [{ col: C.boxFill, span: [0, boxDev] }, { col: C.boxStroke, span: [lo, hi] }] }],
          { out: [lo - 2, lo - 1], stroke: [...Array(hi - lo).keys()].map((k) => lo + k), in: [hi, hi + 1] }, 12, g.dpr === 1);
      }
    }

    // ── l: the priority lens (site 4) ─────────────────────────────────────
    if (PARTS.has('l')) {
      const id = `${P}.l`;
      // A marked tile whose two left neighbours are unmarked, found in the app's own nametable.
      let pick = null;
      for (let r0 = 0; r0 < 256 && !pick; r0 += 32) {
        const rect = await c.json(`window.__dbg.aeon.ntRect(0, 0, ${r0}, 256, 32)`);
        if (!rect) continue;
        for (let r = 0; r < 32 && !pick; r++) {
          for (let col = 10; col < 246; col++) {
            const w = (cc) => rect[r * 256 + cc];
            const hi = (v) => (v & 0x8000) !== 0;
            if (hi(w(col)) && !hi(w(col - 1)) && !hi(w(col - 2))) { pick = { col, row: r0 + r }; break; }
          }
        }
      }
      if (!pick) {
        check(`${id}.0`, 'PREMISE: section 0 has a marked tile with unmarked left neighbours', false, 'none found: UNMEASURABLE');
      } else {
        const WX = pick.col * 8, WY = pick.row * 8;
        const CX = Math.max(0, WX - 64), CY = Math.max(0, WY - 64);
        await setView(CX, CY); await park();
        const lOff = await shotB64(c);
        await c.evalExpr('window.__dbg.setOverlay("showPriority", true)'); await sleep(600);
        const rep = await c.json('window.__dbg.aeon.priorityLens()');
        const lOn = await shotB64(c);
        await c.evalExpr('window.__dbg.setOverlay("showPriority", false)');
        save('priority-off', lOff); save('priority-on', lOn);
        check(`${id}.0`, 'PREMISE: the priority lens drew (veils and segments in view)', rep.active && rep.veils > 0 && rep.segments > 0,
          `tile ${J(pick)}; camera (${CX},${CY}); report ${J(rep)}; shots ${TAG}-scale${scale}-priority-{off,on}.png`);
        const E = Math.round(dx(WX, CX));
        const [w] = widths(1, g.dpr);
        const [lo, hi] = strokeSpan(dx(WX, CX), w).map((v) => v - E);
        const top = (WY - CY) * Z;
        const along = sampleLine(oy, top + 2, top + 8 * Z - 2, g.dpr);
        await edgeRows(c, g, `${id}.left`, 'priority lens, a region\'s left boundary (1 CSS px over the veil)', lOff, lOn, true, E, along,
          [{ name: `width ${w}`, layers: [{ col: C.priFill, span: [0, 99] }, { col: C.priEdge, span: [lo, hi] }] }],
          { out: [lo - 2, lo - 1], stroke: [...Array(hi - lo).keys()].map((k) => lo + k), in: [hi, hi + 1] });
      }
    }

    // ── bp: the both-planes lens (site 4) ─────────────────────────────────
    if (PARTS.has('bp')) {
      const id = `${P}.bp`;
      const W = 256; // SECTION_TILES_WIDE
      let pick = null;
      for (let cr = 4; cr < 120 && !pick; cr++) {
        for (let cc = 4; cc < 120; cc++) {
          const i = cr * 2 * W + cc * 2, il = cr * 2 * W + (cc - 1) * 2;
          const a = await c.json(`window.__dbg.aeon.collisionAt(0, 'a', ${i})`);
          if (!a) continue;
          const b = await c.json(`window.__dbg.aeon.collisionAt(0, 'b', ${i})`);
          const bl = await c.json(`window.__dbg.aeon.collisionAt(0, 'b', ${il})`);
          if (b === 0 && bl === 0) { pick = { cc, cr, word: a }; break; }
        }
      }
      if (!pick) {
        check(`${id}.0`, 'PREMISE: a cell solid on plane A with plane B air there and to its left', false, 'none found: UNMEASURABLE');
      } else {
        const idx = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => (pick.cr * 2 + y) * W + pick.cc * 2 + x);
        for (const i of idx) await c.json(`window.__dbg.aeon.collisionPoke(0, 'b', ${i}, ${pick.word})`);
        const WX = pick.cc * 16, WY = pick.cr * 16;
        const CX = Math.max(0, WX - 64), CY = Math.max(0, WY - 64);
        await setView(CX, CY); await park();
        const bOff = await shotB64(c);
        await c.evalExpr('window.__dbg.setOverlay("showSolidBothPlanes", true)'); await sleep(600);
        const rep = await c.json('window.__dbg.aeon.bothPlanesLens()');
        const bOn = await shotB64(c);
        await c.evalExpr('window.__dbg.setOverlay("showSolidBothPlanes", false)');
        save('bothplanes-off', bOff); save('bothplanes-on', bOn);
        check(`${id}.0`, 'PREMISE: after the in-memory poke of plane B, the both-planes lens drew', rep.active && rep.veils > 0 && rep.segments > 0,
          `cell ${J(pick)}; camera (${CX},${CY}); report ${J(rep)}; shots ${TAG}-scale${scale}-bothplanes-{off,on}.png`);
        const E = Math.round(dx(WX, CX));
        const [w] = widths(1, g.dpr);
        const [lo, hi] = strokeSpan(dx(WX, CX), w).map((v) => v - E);
        const top = (WY - CY) * Z;
        const along = sampleLine(oy, top + 2, top + 16 * Z - 2, g.dpr);
        await edgeRows(c, g, `${id}.left`, 'both-planes lens, a cell\'s left boundary (1 CSS px over the veil)', bOff, bOn, true, E, along,
          [{ name: `width ${w}`, layers: [{ col: C.bpFill, span: [0, 99] }, { col: C.bpEdge, span: [lo, hi] }] }],
          { out: [lo - 2, lo - 1], stroke: [...Array(hi - lo).keys()].map((k) => lo + k), in: [hi, hi + 1] });
      }
    }

    // ── lg: the legend swatch (site 5) ────────────────────────────────────
    if (PARTS.has('lg')) {
      const id = `${P}.lg`;
      await c.evalExpr('window.__dbg.setOverlay("showCollision", true)');
      await c.evalExpr('window.__dbg.setOverlay("showCollisionAngles", true)');
      await setView(0, 0); await park(); await sleep(400);
      const sw = await c.json(String.raw`(() => { const cv = [...document.querySelectorAll('canvas')].find((e) => e.style.width === '18px' && e.style.height === '18px');
        if (!cv) return null; const r = cv.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, store: [cv.width, cv.height] }; })()`);
      const lgOn = await shotB64(c);
      save('legend', lgOn);
      check(`${id}.0`, 'PREMISE: the legend\'s angle swatch is on screen, its store sized to the display', !!sw && sw.store[0] === Math.round(18 * g.dpr),
        `swatch ${J(sw)}`);
      if (sw) {
        const pts = [];
        const x0 = Math.round(sw.left * g.dpr), y0 = Math.round(sw.top * g.dpr), n = Math.round(18 * g.dpr);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) pts.push([x0 + x, y0 + y]);
        const px = await c.evalExpr(`${SHOT_PIXELS}(${J(lgOn)}, ${J(pts)})`);
        const hexes = px.px.map(hex);
        note(id, 'swatch pixels', `${n}x${n} device px at (${x0},${y0}); ${new Set(hexes).size} distinct colours`);
        identity(`${id}.id`, 'the legend swatch (its $20 mark is all diagonal, so the routing must change no pixel)', hexes);
      }
      await c.evalExpr('window.__dbg.setOverlay("showCollisionAngles", false)');
      await c.evalExpr('window.__dbg.setOverlay("showCollision", false)');
    }
  }, { electronArgs: [`--force-device-scale-factor=${scale}`] });
}

let aborted = null;
try {
  for (const s of SCALES) await partScale(s);
} catch (e) {
  aborted = e;
  console.log(`\nHARNESS ABORTED: ${e.stack ?? e.message}`);
}
if (process.env.EDGE_OUT) { writeFileSync(process.env.EDGE_OUT, J(OUT)); console.log(`wrote ${process.env.EDGE_OUT}`); }
const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed${aborted ? ' (RUN ABORTED: the rows above are a prefix, not a result)' : ''}`);
if (bad.length) console.log(`FAILED: ${bad.map((r) => r.id).join(', ')}`);
process.exit(bad.length || aborted || rows.length === 0 ? 1 : 0);
