// DO BOTH MAP CANVASES FOLLOW A DISPLAY-SCALE CHANGE THAT COMES WITH NO RESIZE, AND
// DO THE SONIC 1 CANVAS'S STROKES LAND ON WHOLE DEVICE PIXELS? (ROADMAP row 237)
//
// (a) Row 194 (docs/reviews/2026-09-28-classic-canvas-dpr-194.md, Open) left this: when
//     the window moves to a monitor with another scale factor, the CSS box does not
//     change, so no ResizeObserver fires, and neither the Sonic 1 canvas
//     (ClassicLevelViewport) nor aeon's MapViewport re-sized its backing store. The
//     picture stayed in place and went soft until the next resize.
// (b) RULED 2026-09-28: classic's strokes snap to the device grid through the SAME
//     `snapStroke` / `snapLength` (canvas/device-grid.ts) MapViewport's chrome uses.
//
// ═══ HOW A SCALE CHANGE WITH NO RESIZE IS MADE MID-RUN ═══
//
// `Emulation.setDeviceMetricsOverride` with `width: 0, height: 0` (no size override) and
// a `deviceScaleFactor`: `window.devicePixelRatio` changes and the CSS box does not, which
// is the monitor move's shape. It is EMULATION of the scale, not a second monitor, and
// the rows say so. Every scale row first asserts the premise that makes it a
// no-resize change: the canvas's CSS rect is the same as before the change (to 0.01 px).
// If it moved, a ResizeObserver could have done the work, and the row says
// UNMEASURABLE rather than pass. NOTHING ELSE is done between the change and the read:
// no repaint poke, no camera nudge, no mouse event (dpr-guides-offset-harness calls
// `repaint()` after its emulation step precisely because nothing listened).
//
// ═══ THE ROWS ═══
//
//   a.c  SONIC 1 CANVAS, launched at --force-device-scale-factor=1, GHZ act 1.
//        a.c.0 premise: dpr 1 and the store is the CSS box.
//        a.c.1 emulate 1.5: store = floor(rect * 1.5) (classicBackingStore's rule),
//              CSS box unchanged.                       RED on master: store stays 1x.
//        a.c.2 emulate 2 (THE RE-ARM: a listener armed for 1 only would miss this).
//        a.c.3 clear the emulation: back to 1.
//   a.m  AEON MapViewport, same launch shape, an aeon COPY (AEON_DIR, refused if live).
//        Both of its dpr-sized canvases: #map-canvas (round(rect * dpr), its rule) and
//        #map-preview-canvas (the ghost layer, same rule). Same four rows.
//   b.s  STROKES, launched at --force-device-scale-factor=<s> (STROKE_SCALES, default
//        1.5), GHZ act 1, zoom 2, the stamp tool armed by real clicks, chunk B armed by a
//        real right-click eyedrop. A real hover over cell A paints the stamp ghost and
//        its 1 CSS px outline. Two REAL screenshots, hover off and hover on. Cell A's
//        left edge is device column X (its top edge device row Y). Rows:
//        b.s.1 the column OUTSIDE the edge (X-1) is untouched by the hover, over every
//              sampled row: the outline does not bleed half a pixel outward.
//        b.s.2 column X is the stroke at full strength on every sampled row (each
//              channel inside the band 0.95 * stroke + 0.05 * [0, 255] that an opaque
//              0.95-alpha stroke over ANY pixel lands in).
//        b.s.3/4 the same two for the top edge (row Y-1 untouched, row Y full strength).
//        RED on master: a 1 CSS px stroke centred on the edge is 1.5 device px wide at
//        1.5, so it covers 75% of X-1 and 75% of X, both blends.
//
//   m.s  ROW 238 (a): AEON MapViewport's OWN STAMP GHOST, launched at
//        --force-device-scale-factor=<s> (STROKE_SCALES), an aeon COPY, the Layout facet
//        and the Stamp Chunk tool armed by real clicks and a real `k`, a chunk picked by a
//        real click in the chunk grid, zoom 2 at an integer camera. A real hover paints the
//        ghost and its 2 CSS px SELECTION_MARQUEE outline on #map-preview-canvas. Two real
//        screenshots, hover off and on. C is the device column the shared rule centres the
//        ghost's left edge on (snapStroke: round(edge x dpr) + 0.5, so column C), R the
//        device row for its top edge. At zoom 2 with an integer camera the unsnapped
//        edge sits ON a device boundary at 1.5 (an even CSS x times 1.5 is an integer):
//        master drew 3 device px centred there, half-covering C-2 and C+1.
//        m.s.1 column C-2 untouched on every sampled row (nothing past one partial column).
//        m.s.2 column C-1 changed on every sampled row and NEVER at full strength: the
//              half-covered outer column the shared rule gives every EVEN-width line.
//              ⚠ So the ghost edge is NOT on whole device pixels, and this row says so
//              rather than claiming it. The brief asked for whole device pixels here; a
//              2 CSS px stroke is 2 device px at 1 and 1.5 (deviceStrokeWidth's parity
//              rule), centred on a half-pixel, which cannot give them. See the packet.
//        m.s.3 column C at full strength on every sampled row.
//        m.s.4-6 the same three for the top edge (rows R-2, R-1, R).
//
// Every mouse event is a real `Input.dispatchMouseEvent` at an INTEGER client pixel,
// and every expectation is derived back from that integer. No number crosses sessions.
//
// READ ONLY: GHZ act 1 of the live s1disasm is opened, hovered and right-clicked
// (an eyedrop), nothing is written. The aeon tree is a COPY and is only opened.
//
// Run:  VITE_AURORA_DEBUG=1 npm run build
//       ELECTRON_BIN=<main checkout>/node_modules/.bin/electron AURORA_BUILT_TREE=<this tree> \
//       AEON_DIR=<a copy of aeon> npm run harness:canvas-dpr-237  [PARTS=ac,am,bs,ms] [STROKE_SCALES=1.5]
// Read the `root:` / `pinned:` lines first: if they name a tree other than the one you
// built, the run measured somebody else's app and is void.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { session, openProjectAndAct, sleep, ROOT, MAIN } from './canvas-cdp-harness.mjs';
import { checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';

const PARTS = new Set((process.env.PARTS ?? 'ac,am,bs,ms').split(',').map((s) => s.trim()));
const STROKE_SCALES = (process.env.STROKE_SCALES ?? '1.5').split(',').map((s) => Number(s.trim()));
const SHOT_DIR = process.env.SHOT_DIR ?? `${ROOT}/scratchpad/shots-canvas-dpr-237`;
const TAG = process.env.TAG ?? 'run';
mkdirSync(SHOT_DIR, { recursive: true });
const J = (v) => JSON.stringify(v);

let AEONDIR = null;
if (PARTS.has('am') || PARTS.has('ms')) {
  AEONDIR = checkoutOverride('aeon')?.value ?? null;
  if (!AEONDIR || !existsSync(AEONDIR)) throw new Error('AEON_DIR must point at a COPY of an aeon tree (parts am, ms): UNMEASURABLE without it');
  if (AEONDIR === siblingDefaultPathOrUnresolved('aeon')) throw new Error('AEON_DIR names the live aeon tree: make a copy');
}

const rows = [];
const check = (id, what, pass, detail = '') => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n        ${detail}` : ''}`);
};
const note = (id, what, v) => console.log(`      ${id}  ${what}: ${typeof v === 'string' ? v : J(v)}`);

async function mouseEv(c, type, x, y, button = 'none', buttons = 0) {
  await c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
}
async function realClick(c, pt, button = 'left') {
  await mouseEv(c, 'mouseMoved', pt.x, pt.y);
  await sleep(60);
  await mouseEv(c, 'mousePressed', pt.x, pt.y, button, button === 'left' ? 1 : 2);
  await sleep(40);
  await mouseEv(c, 'mouseReleased', pt.x, pt.y, button, 0);
  await sleep(250);
}

// The classic map canvas carries no id; found the way row 194's harness finds it.
const GEOM = String.raw`((sel) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  let c = null;
  if (sel === 'classic') {
    const all = [...document.querySelectorAll('canvas')].filter(vis).filter((k) => {
      const p = k.parentElement; if (!p) return false;
      const cs = getComputedStyle(k), ps = getComputedStyle(p);
      return cs.position === 'absolute' && ps.overflow === 'hidden' && ps.position === 'relative';
    });
    all.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return rb.width * rb.height - ra.width * ra.height; });
    c = all[0] || null;
  } else c = document.getElementById(sel);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { dpr: window.devicePixelRatio, left: r.left, top: r.top, width: r.width, height: r.height, bw: c.width, bh: c.height,
    innerWidth: window.innerWidth, innerHeight: window.innerHeight };
})`;
const geom = (c, sel) => c.json(`${GEOM}(${J(sel)})`);

/** The store each canvas's own sizing rule gives for a rect at a scale. */
const RULES = {
  classic: (len, dpr) => Math.max(1, Math.floor(len * dpr)),   // classicBackingStore
  'map-canvas': (len, dpr) => Math.round(len * dpr),           // MapViewport.redraw
  'map-preview-canvas': (len, dpr) => Math.round(len * dpr),   // drawCollisionPreview
};

/** One scale-change sequence over a set of canvases, inside ONE session. */
async function scaleSequence(c, prefix, sels) {
  const before = {};
  for (const sel of sels) {
    before[sel] = await geom(c, sel);
    if (!before[sel]) throw new Error(`${prefix}: no ${sel} canvas on screen: UNMEASURABLE, not a pass`);
  }
  const g0 = before[sels[0]];
  check(`${prefix}.0`, 'PREMISE: the launch is at dpr 1 and every canvas\'s store is its own rule at 1',
    g0.dpr === 1 && sels.every((s) => before[s].bw === RULES[s](before[s].width, 1) && before[s].bh === RULES[s](before[s].height, 1)),
    sels.map((s) => `${s} ${J(before[s])}`).join('; '));
  const steps = [
    { id: 1, dpr: 1.5, what: 'emulated 1.5' },
    { id: 2, dpr: 2, what: 'emulated 2, a SECOND change (the listener must have re-armed for 1.5)' },
    { id: 3, dpr: null, what: 'emulation cleared, back to the launch scale 1' },
  ];
  for (const st of steps) {
    if (st.dpr === null) await c.send('Emulation.clearDeviceMetricsOverride');
    else await c.send('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: st.dpr, mobile: false });
    await sleep(900);                                  // nothing else happens here, by design
    const want = st.dpr ?? 1;
    const parts = [];
    let ok = true, unmeasurable = false;
    for (const sel of sels) {
      const g = await geom(c, sel);
      const b = before[sel];
      const sameBox = g && Math.abs(g.width - b.width) < 0.01 && Math.abs(g.height - b.height) < 0.01;
      if (!sameBox) unmeasurable = true;
      const wantW = RULES[sel](g.width, want), wantH = RULES[sel](g.height, want);
      const follows = g.dpr === want && g.bw === wantW && g.bh === wantH;
      if (!follows) ok = false;
      parts.push(`${sel}: dpr ${g.dpr}, CSS ${g.width}x${g.height} (unchanged: ${sameBox}), store ${g.bw}x${g.bh} want ${wantW}x${wantH}`);
    }
    if (unmeasurable) {
      check(`${prefix}.${st.id}`, `UNMEASURABLE (${st.what}): a CSS box moved, so a ResizeObserver could have re-sized the store`, false, parts.join('; '));
    } else {
      check(`${prefix}.${st.id}`, `${st.what}: with NO resize, every store re-sized to its rule at the new scale`, ok, parts.join('; '));
    }
  }
}

async function partClassic() {
  await session('a.c: Sonic 1 canvas, launched at 1, scale changed mid-run', async (c) => {
    console.log(`      provenance  app entry ${MAIN} (the root:/pinned: lines above name the tree)`);
    const lvl = await openProjectAndAct(c);
    await sleep(1200);
    await c.evalExpr('window.__dbg.setOverlay("playAnimatedArt", false)');
    note('a.c', 'level', lvl);
    await mouseEv(c, 'mouseMoved', 4, 4);
    await sleep(300);
    await scaleSequence(c, 'a.c', ['classic']);
  }, { electronArgs: ['--force-device-scale-factor=1'] });
}

async function partAeon() {
  await session('a.m: aeon MapViewport, launched at 1, scale changed mid-run', async (c) => {
    console.log(`      provenance  app entry ${MAIN}; aeon COPY ${AEONDIR}`);
    await c.evalExpr('localStorage.clear(); 1');
    await c.evalExpr(`window.__dbg.aeon.open(${J(AEONDIR)})`).catch((e) => note('a.m', 'aeon open threw', e.message));
    let st = null;
    for (let i = 0; i < 50; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open && st.sections > 0) break;
      await sleep(400);
    }
    if (!st || !st.open) throw new Error(`aeon copy did not open: ${J(st)}: UNMEASURABLE`);
    await sleep(3000);
    note('a.m', 'aeon state', st);
    await mouseEv(c, 'mouseMoved', 4, 4);
    await sleep(300);
    await scaleSequence(c, 'a.m', ['map-canvas', 'map-preview-canvas']);
  }, { electronArgs: ['--force-device-scale-factor=1'] });
}

/** The layout boundary between two different non-air chunks (row 194's finder). */
async function findBoundary(c) {
  const size = await c.json('window.__dbg.classic.layoutSize("fg")');
  if (!size) return null;
  const midRow = Math.floor(size.height / 2);
  const order = [...Array(size.height).keys()].sort((a, b) => Math.abs(a - midRow) - Math.abs(b - midRow));
  for (const row of order) {
    if (row < 1) continue;
    const cells = await c.json(`Array.from({ length: ${size.width} }, (_, i) => window.__dbg.classic.layoutCell(i, ${row}, "fg"))`);
    for (let col = 2; col < size.width - 2; col++) {
      const a = cells[col - 1], b = cells[col];
      if (a == null || b == null) continue;
      const A = a & 0x7f, B = b & 0x7f;
      if (A !== 0 && B !== 0 && A !== B) return { col, row, A, B, size };
    }
  }
  return null;
}

// Decode a PNG screenshot in the page and return a window of packed 0xRRGGBB.
const SHOT_WINDOW = String.raw`((b64, x, y, w, h) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => {
    const k = document.createElement('canvas'); k.width = img.naturalWidth; k.height = img.naturalHeight;
    const kc = k.getContext('2d', { willReadFrequently: true }); kc.imageSmoothingEnabled = false; kc.drawImage(img, 0, 0);
    const d = kc.getImageData(x, y, w, h).data;
    res({ natW: img.naturalWidth, natH: img.naturalHeight, px: Array.from({ length: w * h }, (_, i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]) });
  };
  img.onerror = () => rej(new Error('screenshot did not decode'));
  img.src = 'data:image/png;base64,' + b64;
}))`;

/** STAMP_PREVIEW_STROKE, read from source so the band follows the constant. */
async function strokeColour() {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(`${ROOT}/src/renderer/canvas/canvas-colors.ts`, 'utf8');
  const m = /export const STAMP_PREVIEW_STROKE = 'rgba\((\d+),(\d+),(\d+),([\d.]+)\)'/.exec(src);
  if (!m) throw new Error('STAMP_PREVIEW_STROKE is not an rgba() literal any more: the full-strength band cannot be derived, UNMEASURABLE');
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
}

async function partStrokes(scale) {
  const P = `b.s${scale}`;
  const stroke = await strokeColour();
  // A pixel the stroke covers WHOLLY is a*stroke + (1-a)*under for some under in [0,255].
  const inBand = (px) => px.every((v, i) => v >= stroke.a * stroke.rgb[i] - 1 && v <= stroke.a * stroke.rgb[i] + (1 - stroke.a) * 255 + 1);
  await session(`${P}: classic stamp-ghost outline at --force-device-scale-factor=${scale}`, async (c) => {
    console.log(`      provenance  app entry ${MAIN} (the root:/pinned: lines above name the tree)`);
    const lvl = await openProjectAndAct(c);
    await sleep(1200);
    await c.evalExpr('window.__dbg.setOverlay("playAnimatedArt", false)');
    await sleep(300);
    const g0 = await geom(c, 'classic');
    if (!g0) throw new Error('no classic map canvas: UNMEASURABLE');
    const bnd = await findBoundary(c);
    if (!bnd) throw new Error('no A|B boundary in GHZ1 fg: UNMEASURABLE');
    // Arm chunk B with a real right-click eyedrop, at zoom 1 with the edge centred.
    const Z = 2;
    const camEX = Math.max(0, Math.round(bnd.col * 256 - g0.width / 2 / Z));
    const camEY = Math.max(0, Math.round(bnd.row * 256 + 128 - g0.height / 2 / Z));
    await c.evalExpr(`window.__dbg.setView(${camEX}, ${camEY}, ${Z})`);
    await sleep(600);
    const bx = Math.round(g0.left + (bnd.col * 256 + 8 - camEX) * Z), by = Math.round(g0.top + (bnd.row * 256 + 128 - camEY) * Z);
    await realClick(c, { x: bx, y: by }, 'right');
    const armed = await c.json('window.__dbg.classic.selectedChunk()');
    // Arm the stamp tool: the Layout facet, then the dock's Stamp Chunk (real clicks).
    const facetBtn = await c.json(String.raw`(() => {
      const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === 'Layout');
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!facetBtn) throw new Error('no Layout facet button: UNMEASURABLE');
    await realClick(c, facetBtn);
    await sleep(400);
    const stampBtn = await c.json(String.raw`(() => {
      const b = document.querySelector('button[aria-label="Stamp Chunk"]');
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!stampBtn) throw new Error('no Stamp Chunk button: UNMEASURABLE');
    await realClick(c, stampBtn);
    const tool = await c.json('window.__dbg.classic.tool()');
    // Camera: cell A's top-left corner 40 world px in from the canvas's top-left.
    const cellL = (bnd.col - 1) * 256, cellT = bnd.row * 256;
    const camX = cellL - 40, camY = cellT - 40;
    await c.evalExpr(`window.__dbg.setView(${camX}, ${camY}, ${Z})`);
    await sleep(600);
    const cam = await c.json('window.__dbg.view()');
    const g = await geom(c, 'classic');
    const devLeft = g.left * g.dpr, devTop = g.top * g.dpr;
    const devAligned = Math.abs(devLeft - Math.round(devLeft)) < 1e-6 && Math.abs(devTop - Math.round(devTop)) < 1e-6;
    const X = Math.round(devLeft) + (cellL - cam.x) * cam.zoom * g.dpr;     // cell A's first device column
    const Y = Math.round(devTop) + (cellT - cam.y) * cam.zoom * g.dpr;      // cell A's first device row
    const whole = Number.isInteger(X) && Number.isInteger(Y);
    check(`${P}.0`, `PREMISE: dpr ${scale} took, chunk B armed by a real eyedrop, stamp tool armed by real clicks, camera set, the canvas sits on whole device px, cell A's edges are whole device px`,
      Math.abs(g.dpr - scale) < 1e-6 && /"status":"ready"/.test(lvl) && armed === bnd.B && tool === 'stamp-chunk'
        && cam.x === camX && cam.y === camY && cam.zoom === Z && devAligned && whole,
      `dpr ${g.dpr}; boundary ${J({ col: bnd.col, row: bnd.row, A: bnd.A, B: bnd.B })}; armed ${armed}; tool ${tool}; camera ${J(cam)}; canvas device origin ${devLeft},${devTop}; cell A edge device X ${X} Y ${Y}`);
    // Hover point inside cell A, integer, derived back to its cell.
    const hx = Math.round(g.left + (cellL + 100 - cam.x) * cam.zoom), hy = Math.round(g.top + (cellT + 100 - cam.y) * cam.zoom);
    const hw = { x: cam.x + (hx - g.left) / cam.zoom, y: cam.y + (hy - g.top) / cam.zoom };
    const hoverCell = { col: Math.floor(hw.x / 256), row: Math.floor(hw.y / 256) };
    await mouseEv(c, 'mouseMoved', 4, 4);
    await sleep(500);
    const off = (await c.send('Page.captureScreenshot', { format: 'png' })).data;
    await mouseEv(c, 'mouseMoved', hx, hy);
    await sleep(600);
    const on = (await c.send('Page.captureScreenshot', { format: 'png' })).data;
    writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-hover-off.png`, Buffer.from(off, 'base64'));
    writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-hover-on.png`, Buffer.from(on, 'base64'));
    await mouseEv(c, 'mouseMoved', 4, 4);
    note(`${P}`, 'hover', `(${hx},${hy}) -> world ${J(hw)} cell ${J(hoverCell)} (cell A is ${bnd.col - 1},${bnd.row}); shots ${TAG}-scale${scale}-hover-{off,on}.png`);
    if (hoverCell.col !== bnd.col - 1 || hoverCell.row !== bnd.row) throw new Error('the hover aim is not in cell A: UNMEASURABLE');
    // Sample span along each edge: away from the corner, inside the canvas.
    const SPAN = 200;                        // device px along the edge
    const S0 = 30;                           // device px in from the corner
    // A device window 3 px either side of each edge line.
    const winV = { x: X - 3, y: Y + S0, w: 7, h: SPAN };        // left edge, columns X-3..X+3
    const winH = { x: X + S0, y: Y - 3, w: SPAN, h: 7 };        // top edge, rows Y-3..Y+3
    const read = async (b64, w) => c.evalExpr(`${SHOT_WINDOW}(${J(b64)}, ${w.x}, ${w.y}, ${w.w}, ${w.h})`);
    const vOff = await read(off, winV), vOn = await read(on, winV);
    const hOff = await read(off, winH), hOn = await read(on, winH);
    const shotIsDevice = vOn.natW === Math.round(g.innerWidth * g.dpr) && vOn.natH === Math.round(g.innerHeight * g.dpr);
    const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    // Column k of the vertical window (0..6 = X-3..X+3) over every sampled row.
    const colStats = (k) => {
      let changed = 0, full = 0;
      for (let y = 0; y < winV.h; y++) {
        const i = y * winV.w + k;
        if (!same(vOff.px[i], vOn.px[i])) changed++;
        if (inBand(vOn.px[i])) full++;
      }
      return { changed, full };
    };
    const rowStats = (k) => {
      let changed = 0, full = 0;
      for (let x = 0; x < winH.w; x++) {
        const i = k * winH.w + x;
        if (!same(hOff.px[i], hOn.px[i])) changed++;
        if (inBand(hOn.px[i])) full++;
      }
      return { changed, full };
    };
    const cols = [0, 1, 2, 3, 4, 5, 6].map(colStats);
    const rws = [0, 1, 2, 3, 4, 5, 6].map(rowStats);
    const fmt = (arr, base) => arr.map((s, k) => `${base}${k - 3 >= 0 ? '+' : ''}${k - 3}: changed ${s.changed}/${SPAN}, full-strength ${s.full}/${SPAN}`).join('; ');
    note(`${P}`, 'left edge, per device column (X = cell A\'s first column)', fmt(cols, 'X'));
    note(`${P}`, 'top edge, per device row (Y = cell A\'s first row)', fmt(rws, 'Y'));
    const hexs = (px) => px.map((p) => ((p[0] << 16) | (p[1] << 8) | p[2]).toString(16).padStart(6, '0')).join(' ');
    const mid = Math.floor(winV.h / 2);
    note(`${P}`, 'one device row across the left edge, X-3..X+3, hover off', hexs(vOff.px.slice(mid * 7, mid * 7 + 7)));
    note(`${P}`, 'one device row across the left edge, X-3..X+3, hover on ', hexs(vOn.px.slice(mid * 7, mid * 7 + 7)));
    note(`${P}`, 'full-strength band per channel', stroke.rgb.map((v) => `[${(stroke.a * v).toFixed(1)}, ${(stroke.a * v + (1 - stroke.a) * 255).toFixed(1)}]`).join(' '));
    // Anti-vacuous: the hover drew an outline AT this edge at all (X-1 or X changed on
    // every sampled row). Not "the inside changed": the ghost art is chunk B at 0.6
    // alpha, and where chunk B is as dark as the map under it the art changes nothing.
    const edgeDrawn = cols[2].changed + cols[3].changed >= SPAN;
    check(`${P}.1`, 'left edge: the device column OUTSIDE cell A (X-1) is untouched by the hover on every sampled row (no half-covered column outward)',
      shotIsDevice && edgeDrawn && cols[2].changed === 0,
      `X-1 changed on ${cols[2].changed}/${SPAN} rows; anti-vacuous: the hover drew at this edge (X-1 + X changed on >= ${SPAN} rows): ${edgeDrawn}; screenshot in device px: ${shotIsDevice} (${vOn.natW}x${vOn.natH})`);
    check(`${P}.2`, 'left edge: device column X is the stroke at full strength on every sampled row',
      shotIsDevice && cols[3].full === SPAN, `X full-strength on ${cols[3].full}/${SPAN} rows`);
    const edgeDrawnH = rws[2].changed + rws[3].changed >= SPAN;
    check(`${P}.3`, 'top edge: the device row OUTSIDE cell A (Y-1) is untouched by the hover on every sampled column',
      shotIsDevice && edgeDrawnH && rws[2].changed === 0,
      `Y-1 changed on ${rws[2].changed}/${SPAN} columns; anti-vacuous: the hover drew at this edge: ${edgeDrawnH}`);
    check(`${P}.4`, 'top edge: device row Y is the stroke at full strength on every sampled column',
      shotIsDevice && rws[3].full === SPAN, `Y full-strength on ${rws[3].full}/${SPAN} columns`);
  }, { electronArgs: [`--force-device-scale-factor=${scale}`] });
}

/** SELECTION_MARQUEE, read from source so the full-strength test follows the constant. */
async function marqueeColour() {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(`${ROOT}/src/renderer/canvas/canvas-colors.ts`, 'utf8');
  const m = /export const SELECTION_MARQUEE = '#([0-9a-fA-F]{6})'/.exec(src);
  if (!m) throw new Error('SELECTION_MARQUEE is not an opaque #rrggbb literal any more: the full-strength test cannot be derived, UNMEASURABLE');
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function key(c, k) {
  const p = { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  await sleep(400);
}

async function partMapStrokes(scale) {
  const P = `m.s${scale}`;
  const rgb = await marqueeColour();
  // An opaque stroke over any pixel is the stroke colour itself (+-1 for the PNG round trip).
  const full = (px) => px.every((v, i) => Math.abs(v - rgb[i]) <= 1);
  await session(`${P}: aeon MapViewport stamp-ghost outline at --force-device-scale-factor=${scale}`, async (c) => {
    console.log(`      provenance  app entry ${MAIN}; aeon COPY ${AEONDIR}`);
    await c.evalExpr('localStorage.clear(); 1');
    await c.evalExpr(`window.__dbg.aeon.open(${J(AEONDIR)})`).catch((e) => note(P, 'aeon open threw', e.message));
    let st = null;
    for (let i = 0; i < 50; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open && st.sections > 0) break;
      await sleep(400);
    }
    if (!st || !st.open) throw new Error(`aeon copy did not open: ${J(st)}: UNMEASURABLE`);
    await c.evalExpr(`window.__dbg.activate(${J(st.zone)}, ${J(st.act)})`);
    await sleep(2500);
    const facetBtn = await c.json(String.raw`(() => {
      const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === 'Layout');
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!facetBtn) throw new Error('no Layout facet button: UNMEASURABLE');
    await realClick(c, facetBtn);
    await sleep(800);
    // Focus the map (a real click on an empty corner would stamp, so a real move only),
    // then the real `k` chord arms Stamp Chunk and mounts the chunk grid.
    await mouseEv(c, 'mouseMoved', 4, 4);
    await key(c, 'k');
    await sleep(600);
    // Pick a chunk with art by a REAL click in the chunk grid.
    const CELLS = String.raw`[...document.querySelectorAll('button')].filter((b) => b.title && !/^tile /i.test(b.title) && !/blank/i.test(b.title)
      && b.querySelector(':scope > canvas') && b.getBoundingClientRect().width > 0)`;
    const nCells = await c.evalExpr(`${CELLS}.length`);
    let chunk = null;
    for (let n = 0; n < Math.min(nCells, 40) && !chunk; n++) {
      const aim = await c.json(String.raw`(() => { const b = ${CELLS}[${n}]; if (!b) return null; b.scrollIntoView({ block: 'nearest' });
        const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
      if (!aim) continue;
      await sleep(150);
      await realClick(c, aim);
      const id = await c.json('window.__dbg.aeon.selectedChunk()');
      const info = id ? await c.json(`window.__dbg.aeon.chunkInfo(${J(id)})`) : null;
      if (info && info.nonzeroTiles > 0) chunk = { id, info, aim };
    }
    const st1 = await c.json('window.__dbg.aeon.state()');
    // Camera: zoom 2, integer, the ghost's top-left 40 world px in from the canvas corner.
    const Z = 2;
    const g0 = await geom(c, 'map-preview-canvas');
    if (!g0 || !chunk) throw new Error(`no ghost canvas (${J(g0)}) or no chunk with art picked in ${nCells} cells: UNMEASURABLE`);
    const wT = chunk.info.widthTiles, hT = chunk.info.heightTiles;
    const baseCol = wT * 4, baseRow = hT * 4;               // section 0, chunk-aligned, well inside it
    const gx = baseCol * 8, gy = baseRow * 8;                // the ghost's world top-left
    const camX = gx - 40, camY = gy - 40;
    await c.evalExpr(`window.__dbg.setView(${camX}, ${camY}, ${Z})`);
    await sleep(700);
    const cam = await c.json('window.__dbg.view()');
    const g = await geom(c, 'map-preview-canvas');
    const devLeft = g.left * g.dpr, devTop = g.top * g.dpr;
    const devAligned = Math.abs(devLeft - Math.round(devLeft)) < 1e-6 && Math.abs(devTop - Math.round(devTop)) < 1e-6;
    // The unsnapped edge, in device px from the canvas origin, and the shared rule's column.
    const cssEdgeX = (gx - cam.x) * cam.zoom, cssEdgeY = (gy - cam.y) * cam.zoom;
    const C = Math.round(devLeft) + Math.round(cssEdgeX * g.dpr);
    const Rw = Math.round(devTop) + Math.round(cssEdgeY * g.dpr);
    const onBoundary = Number.isInteger(cssEdgeX * g.dpr) && Number.isInteger(cssEdgeY * g.dpr);
    check(`${P}.0`, `PREMISE: dpr ${scale} took, the Layout facet and Stamp Chunk armed by real input, a chunk with art picked by a real click, camera set, the canvas on whole device px, the unsnapped ghost edges ON device boundaries`,
      Math.abs(g.dpr - scale) < 1e-6 && st1.tool === 'stamp-chunk' && !!chunk
        && cam.x === camX && cam.y === camY && cam.zoom === Z && devAligned && onBoundary,
      `dpr ${g.dpr}; tool ${st1.tool}; chunk ${J(chunk)}; camera ${J(cam)}; canvas device origin ${devLeft},${devTop}; ghost world ${gx},${gy}; unsnapped edge device ${cssEdgeX * g.dpr},${cssEdgeY * g.dpr} from the origin; C ${C} R ${Rw}`);
    // Hover inside the chunk's footprint, integer, derived back to its base.
    const hx = Math.round(g.left + (gx + wT * 4 - cam.x) * cam.zoom), hy = Math.round(g.top + (gy + hT * 4 - cam.y) * cam.zoom);
    const hw = { x: cam.x + (hx - g.left) / cam.zoom, y: cam.y + (hy - g.top) / cam.zoom };
    const hoverBase = { col: Math.floor(Math.floor(hw.x / 8) / wT) * wT, row: Math.floor(Math.floor(hw.y / 8) / hT) * hT };
    if (hoverBase.col !== baseCol || hoverBase.row !== baseRow) throw new Error(`the hover aim snaps to ${J(hoverBase)}, not ${baseCol},${baseRow}: UNMEASURABLE`);
    const off = (await c.send('Page.captureScreenshot', { format: 'png' })).data;
    await mouseEv(c, 'mouseMoved', hx, hy);
    await sleep(700);
    const on = (await c.send('Page.captureScreenshot', { format: 'png' })).data;
    writeFileSync(`${SHOT_DIR}/${TAG}-map-scale${scale}-hover-off.png`, Buffer.from(off, 'base64'));
    writeFileSync(`${SHOT_DIR}/${TAG}-map-scale${scale}-hover-on.png`, Buffer.from(on, 'base64'));
    note(P, 'hover', `(${hx},${hy}) -> world ${J(hw)} base ${J(hoverBase)}; shots ${TAG}-map-scale${scale}-hover-{off,on}.png`);
    const SPAN = Math.min(60, Math.round(Math.min(wT, hT) * 8 * cam.zoom * g.dpr) - 12);
    const S0 = 6;
    if (SPAN < 20) throw new Error(`the ghost is too small to sample (${SPAN} device px): UNMEASURABLE`);
    const winV = { x: C - 3, y: Rw + S0, w: 7, h: SPAN };
    const winH = { x: C + S0, y: Rw - 3, w: SPAN, h: 7 };
    const read = async (b64, w) => c.evalExpr(`${SHOT_WINDOW}(${J(b64)}, ${w.x}, ${w.y}, ${w.w}, ${w.h})`);
    const vOff = await read(off, winV), vOn = await read(on, winV);
    const hOff = await read(off, winH), hOn = await read(on, winH);
    const shotIsDevice = vOn.natW === Math.round(g.innerWidth * g.dpr) && vOn.natH === Math.round(g.innerHeight * g.dpr);
    const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const stats = (offW, onW, w, k, vertical) => {
      let changed = 0, fullN = 0;
      const n = vertical ? w.h : w.w;
      for (let t = 0; t < n; t++) {
        const i = vertical ? t * w.w + k : k * w.w + t;
        if (!same(offW.px[i], onW.px[i])) changed++;
        if (full(onW.px[i])) fullN++;
      }
      return { changed, full: fullN };
    };
    const cols = [0, 1, 2, 3, 4, 5, 6].map((k) => stats(vOff, vOn, winV, k, true));
    const rws = [0, 1, 2, 3, 4, 5, 6].map((k) => stats(hOff, hOn, winH, k, false));
    const fmt = (arr, base) => arr.map((q, k) => `${base}${k - 3 >= 0 ? '+' : ''}${k - 3}: changed ${q.changed}/${SPAN}, full ${q.full}/${SPAN}`).join('; ');
    note(P, 'left edge, per device column', fmt(cols, 'C'));
    note(P, 'top edge, per device row', fmt(rws, 'R'));
    const hexs = (px) => px.map((q) => ((q[0] << 16) | (q[1] << 8) | q[2]).toString(16).padStart(6, '0')).join(' ');
    const mid = Math.floor(winV.h / 2);
    note(P, 'one device row across the left edge, C-3..C+3, hover off', hexs(vOff.px.slice(mid * 7, mid * 7 + 7)));
    note(P, 'one device row across the left edge, C-3..C+3, hover on ', hexs(vOn.px.slice(mid * 7, mid * 7 + 7)));
    check(`${P}.1`, 'left edge: device column C-2 is untouched by the hover on every sampled row',
      shotIsDevice && cols[1].changed === 0 && cols[3].full === SPAN,
      `C-2 changed on ${cols[1].changed}/${SPAN}; anti-vacuous: C full on ${cols[3].full}/${SPAN}; screenshot in device px: ${shotIsDevice} (${vOn.natW}x${vOn.natH})`);
    check(`${P}.2`, 'left edge: device column C-1 is changed on every sampled row and never at full strength (the half-covered column of an even-width line: NOT whole device px, by the shared rule)',
      shotIsDevice && cols[2].changed === SPAN && cols[2].full === 0,
      `C-1 changed ${cols[2].changed}/${SPAN}, full ${cols[2].full}/${SPAN}`);
    check(`${P}.3`, 'left edge: device column C is the stroke at full strength on every sampled row',
      shotIsDevice && cols[3].full === SPAN, `C full on ${cols[3].full}/${SPAN}`);
    check(`${P}.4`, 'top edge: device row R-2 is untouched by the hover on every sampled column',
      shotIsDevice && rws[1].changed === 0 && rws[3].full === SPAN,
      `R-2 changed on ${rws[1].changed}/${SPAN}; anti-vacuous: R full on ${rws[3].full}/${SPAN}`);
    check(`${P}.5`, 'top edge: device row R-1 is changed on every sampled column and never at full strength (half-covered, by the shared rule)',
      shotIsDevice && rws[2].changed === SPAN && rws[2].full === 0,
      `R-1 changed ${rws[2].changed}/${SPAN}, full ${rws[2].full}/${SPAN}`);
    check(`${P}.6`, 'top edge: device row R is the stroke at full strength on every sampled column',
      shotIsDevice && rws[3].full === SPAN, `R full on ${rws[3].full}/${SPAN}`);
    await mouseEv(c, 'mouseMoved', 4, 4);
  }, { electronArgs: [`--force-device-scale-factor=${scale}`] });
}

let aborted = null;
try {
  if (PARTS.has('ac')) await partClassic();
  if (PARTS.has('am')) await partAeon();
  if (PARTS.has('bs')) for (const s of STROKE_SCALES) await partStrokes(s);
  if (PARTS.has('ms')) for (const s of STROKE_SCALES) await partMapStrokes(s);
} catch (e) {
  aborted = e;
  console.log(`\nHARNESS ABORTED: ${e.stack ?? e.message}`);
}
const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed${aborted ? ' (RUN ABORTED: the rows above are a prefix, not a result)' : ''}`);
if (bad.length) console.log(`FAILED: ${bad.map((r) => r.id).join(', ')}`);
process.exit(bad.length || aborted || rows.length === 0 ? 1 : 0);
