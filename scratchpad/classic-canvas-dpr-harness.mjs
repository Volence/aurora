// IS THE SONIC 1 LEVEL CANVAS CRISP AT EVERY DISPLAY SCALE, AND DOES A CLICK STILL
// LAND ON THE CELL IT IS DRAWN OVER? (ROADMAP row 194, CLASSIC-CANVAS-BLUR-DPR)
//
// The defect: `ClassicLevelViewport` sized its backing store as `floor(rect)` CSS
// pixels and never times `devicePixelRatio`, so above 100% the browser stretched a
// too-small bitmap up to the element's device box with its default filter, and
// every pixel-art edge came out blended. Found, not fixed, by the scaled-display
// fix (docs/reviews/2026-09-12-dpr-guides-offset.md section 9). Ruled 2026-09-28:
// crisp, the backing store follows the display scale, pixel art nearest-neighbour,
// and drawing and grabbing must still agree at every scale.
//
// ═══ ONE LAUNCH PER SCALE, EVERY ROW JUDGED INSIDE ITS OWN LAUNCH ═══
//
// Each scale in SCALES (default `1,1.5`) is its own app launch with
// `--force-device-scale-factor=<s>`, and row `<s>.0` asserts the factor TOOK
// (`devicePixelRatio` reads it back). No row compares a number from one launch
// with a number from another: the display scale on this machine's Xvfb varies
// between runs, and a stitched observation is self-consistent and wrong
// (docs/OVERSEER-REFERENCE.md, Instruments).
//
// ═══ THE ROWS, PER SCALE s ═══
//
//   s.0  PREMISE: the forced factor took; GHZ act 1 is ready; the camera the
//        harness set is the camera the viewport published; a boundary between two
//        DIFFERENT chunks (A left, B right) is on screen.
//   s.1  THE BACKING STORE IS DEVICE-SIZED: `canvas.width` is within one pixel of
//        `rect.width * dpr` (and height likewise). `clientWidth * dpr` is printed
//        beside it. RED on master above 1: there `canvas.width` is the CSS width.
//   s.2  HARD PIXELS ON SCREEN: in a real screenshot (device pixels) of a window
//        around the A|B chunk edge, every pixel's colour is one the canvas's own
//        backing store holds in the matching region. A filtered upscale invents
//        colours between two neighbours; nearest-neighbour cannot. The device row
//        across the edge is printed. Anti-vacuous: the window must hold at least
//        two colours and at least ten colour changes between neighbours. RED on
//        master above 1.
//   s.3  A REAL RIGHT-CLICK GRABS THE CELL: `Input.dispatchMouseEvent` right
//        press/release two CSS px LEFT of the edge eyedrops chunk A, and two CSS px
//        RIGHT of it eyedrops chunk B. The expected cell is derived from the
//        INTEGER client pixel actually aimed at, through the camera contract
//        (world = cam + (clientX - rect.left) / zoom), never from the float wanted.
//   s.4  WHAT IS GRABBED IS WHERE IT IS DRAWN: with the stamp tool armed by real
//        clicks (the Layout facet, then the dock's Stamp Chunk) and chunk B selected, a real hover over cell A paints the stamp
//        ghost; the bounding box of the backing-store pixels that hover changed
//        must be cell A's rectangle, converted to backing pixels by the measured
//        ratio `canvas.width / rect.width` (so this row holds on master too: it is
//        the guard that the fix did not break the mapping, and it is proved to
//        discriminate by a planted pointer-mapping mutation, see the packet).
//
// Animated art playback is switched OFF (`setOverlay('playAnimatedArt', false)`,
// the View menu's own action) before any pixel row, so a pixel that changed
// between two captures changed because of the gesture and not the clock.
//
// READ ONLY. It opens the live s1disasm checkout and loads GHZ act 1; a right-click
// eyedrop, a facet and tool click and a hover write no document and save nothing. Not in
// canvas-cdp-harness.mjs's CANVAS_WRITERS list, deliberately.
//
// Run:  VITE_AURORA_DEBUG=1 npm run build
//       ELECTRON_BIN=<main checkout>/node_modules/.bin/electron AURORA_BUILT_TREE=<this tree> \
//         npm run harness:classic-canvas-dpr        [SCALES=1,1.5]
// Read the `root:` / `pinned:` lines first: if they name a tree other than the one
// you built, the run measured somebody else's app and is void.
import { writeFileSync, mkdirSync } from 'node:fs';
import { session, openProjectAndAct, sleep, ROOT, MAIN } from './canvas-cdp-harness.mjs';

const SCALES = (process.env.SCALES ?? '1,1.5').split(',').map((s) => Number(s.trim()));
if (SCALES.some((s) => !Number.isFinite(s) || s <= 0)) throw new Error(`SCALES must be positive numbers, got ${process.env.SCALES}`);
const SHOT_DIR = process.env.SHOT_DIR ?? `${ROOT}/scratchpad/shots-classic-dpr`;
const TAG = process.env.TAG ?? 'run';
mkdirSync(SHOT_DIR, { recursive: true });

/** Camera zoom for every row: 2 CSS px per world px, so a world pixel is a whole
 *  number of device pixels at 1 and at 1.5 and an edge is a clean edge. */
const ZOOM = 2;
const J = (v) => JSON.stringify(v);

const rows = [];
const check = (id, what, pass, detail = '') => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n        ${detail}` : ''}`);
};
const note = (id, what, v) => console.log(`      ${id}  ${what}: ${typeof v === 'string' ? v : J(v)}`);

const P = String.raw`
(() => {
  const Q = {};
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // The classic map canvas carries no id; found the way it is built (the same
  // finder classic-wheel-passive-harness.mjs uses): the largest visible absolute
  // canvas in a relative, overflow-hidden container.
  Q.mapCanvas = () => {
    const all = [...document.querySelectorAll('canvas')].filter(vis).filter((c) => {
      const p = c.parentElement; if (!p) return false;
      const cs = getComputedStyle(c), ps = getComputedStyle(p);
      return cs.position === 'absolute' && ps.overflow === 'hidden' && ps.position === 'relative';
    });
    all.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return rb.width * rb.height - ra.width * ra.height; });
    return all[0] || null;
  };
  Q.geom = () => {
    const c = Q.mapCanvas(); if (!c) return null;
    const r = c.getBoundingClientRect();
    return { dpr: window.devicePixelRatio, left: r.left, top: r.top, width: r.width, height: r.height,
      clientWidth: c.clientWidth, clientHeight: c.clientHeight, bw: c.width, bh: c.height,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      styleWidth: c.style.width, styleHeight: c.style.height, imageRendering: getComputedStyle(c).imageRendering };
  };
  // Backing-store pixels of a rect given in BACKING px, as packed 0xRRGGBB (alpha
  // reported separately so a translucent store is not silently read as opaque).
  Q.backing = (x, y, w, h) => {
    const c = Q.mapCanvas(); const ctx = c.getContext('2d', { willReadFrequently: true });
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(c.width, Math.ceil(x + w)), y1 = Math.min(c.height, Math.ceil(y + h));
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    return { x0, y0, w: x1 - x0, h: y1 - y0, d };
  };
  // THE DIFF IS COMPUTED IN THE PAGE: the store is millions of pixels, and only
  // the bounding box and the count leave it.
  Q.snap = () => { const c = Q.mapCanvas(); const b = Q.backing(0, 0, c.width, c.height); Q._snap = b; return b.w + 'x' + b.h; };
  Q.diffSince = () => {
    const a = Q._snap; const c = Q.mapCanvas(); const b = Q.backing(0, 0, c.width, c.height);
    if (!a || a.w !== b.w || a.h !== b.h) return { error: 'store size moved between the captures' };
    let n = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const i = (y * b.w + x) * 4;
      if (a.d[i] !== b.d[i] || a.d[i + 1] !== b.d[i + 1] || a.d[i + 2] !== b.d[i + 2]) {
        n++; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
    return n ? { n, minX, minY, maxX, maxY } : { n };
  };
  // Decode a PNG screenshot IN THE PAGE (an <img> at its natural size drawn 1:1
  // into a scratch canvas, which copies pixels exactly) and return one window of it.
  Q.shotWindow = (b64, x, y, w, h) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = document.createElement('canvas'); k.width = img.naturalWidth; k.height = img.naturalHeight;
      const kc = k.getContext('2d', { willReadFrequently: true });
      kc.imageSmoothingEnabled = false; kc.drawImage(img, 0, 0);
      const d = kc.getImageData(x, y, w, h).data;
      res({ natW: img.naturalWidth, natH: img.naturalHeight, px: Array.from({ length: w * h }, (_, i) => (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]) });
    };
    img.onerror = () => rej(new Error('screenshot did not decode'));
    img.src = 'data:image/png;base64,' + b64;
  });
  Q.backingColours = (x, y, w, h) => {
    const b = Q.backing(x, y, w, h); const set = new Set(); let translucent = 0;
    for (let i = 0; i < b.w * b.h; i++) { set.add((b.d[i * 4] << 16) | (b.d[i * 4 + 1] << 8) | b.d[i * 4 + 2]); if (b.d[i * 4 + 3] !== 255) translucent++; }
    return { colours: [...set], translucent, x0: b.x0, y0: b.y0, w: b.w, h: b.h };
  };
  Q.offAim = () => ({ x: 4, y: 4 });
  return (window.__q = Q), 'ok';
})()
`;

async function mouseEv(c, type, x, y, button = 'none', buttons = 0) {
  await c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
}
async function rightClick(c, x, y) {
  await mouseEv(c, 'mouseMoved', x, y);
  await sleep(60);
  await mouseEv(c, 'mousePressed', x, y, 'right', 2);
  await sleep(40);
  await mouseEv(c, 'mouseReleased', x, y, 'right', 0);
  await sleep(250);
}
const hex = (n) => n.toString(16).padStart(6, '0');

/** The layout boundary the rows aim at: a column edge `col` on row `row` whose
 *  left cell (A) and right cell (B) hold two different non-air chunks. Chosen by
 *  reading the document, never by pinning GHZ's layout. */
async function findBoundary(c) {
  const size = await c.json('window.__dbg.classic.layoutSize("fg")');
  if (!size) return null;
  const midRow = Math.floor(size.height / 2);
  const rowsInOrder = [...Array(size.height).keys()].sort((a, b) => Math.abs(a - midRow) - Math.abs(b - midRow));
  for (const row of rowsInOrder) {
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

async function runScale(scale) {
  const label = `s${scale}`;
  await session(`classic canvas at --force-device-scale-factor=${scale}`, async (c) => {
    console.log(`      provenance  app entry ${MAIN} (the root:/pinned: lines above name the tree)`);
    const lvl = await openProjectAndAct(c);
    await sleep(1200);
    await c.evalExpr(P);
    await c.evalExpr('window.__dbg.setOverlay("playAnimatedArt", false)');
    await sleep(300);
    const g0 = await c.json('window.__q.geom()');
    if (!g0) throw new Error('no classic map canvas on screen: UNMEASURABLE, not a pass');
    const bnd = await findBoundary(c);
    if (!bnd) throw new Error('no boundary between two different non-air chunks in GHZ1 fg: UNMEASURABLE');
    const cssW = g0.width, cssH = g0.height;
    // Camera: the A|B edge at the canvas's horizontal middle, the row's middle at
    // its vertical middle, integers so every world pixel edge is a CSS pixel edge.
    const camX = Math.max(0, Math.round(bnd.col * 256 - cssW / 2 / ZOOM));
    const camY = Math.max(0, Math.round(bnd.row * 256 + 128 - cssH / 2 / ZOOM));
    await c.evalExpr(`window.__dbg.setView(${camX}, ${camY}, ${ZOOM})`);
    await sleep(700);
    const cam = await c.json('window.__dbg.view()');
    const g = await c.json('window.__q.geom()');
    const took = Math.abs(g.dpr - scale) < 1e-6;
    check(`${label}.0`, `PREMISE: --force-device-scale-factor=${scale} took, GHZ1 ready, the camera set is the camera published, and an A|B chunk edge is on screen`,
      took && /"status":"ready"/.test(lvl) && cam.x === camX && cam.y === camY && cam.zoom === ZOOM,
      `dpr ${g.dpr}; level ${lvl}; camera set ${J({ camX, camY, ZOOM })} read ${J(cam)}; boundary ${J({ col: bnd.col, row: bnd.row, A: bnd.A, B: bnd.B })}; grid ${J(bnd.size)}`);
    note(`${label}.0`, 'canvas geometry', g);

    // ---- s.1 backing store size ------------------------------------------
    const wantW = g.width * g.dpr, wantH = g.height * g.dpr;
    check(`${label}.1`, 'the backing store is the CSS box times devicePixelRatio (within one device px)',
      Math.abs(g.bw - wantW) < 1 && Math.abs(g.bh - wantH) < 1,
      `canvas.width ${g.bw} vs rect.width*dpr ${wantW.toFixed(3)} (clientWidth*dpr ${(g.clientWidth * g.dpr).toFixed(3)}); `
      + `canvas.height ${g.bh} vs rect.height*dpr ${wantH.toFixed(3)} (clientHeight*dpr ${(g.clientHeight * g.dpr).toFixed(3)})`);

    // ---- s.2 hard pixels on screen ------------------------------------------
    await mouseEv(c, 'mouseMoved', 4, 4); // off the map: no hover ghost in the shot
    await sleep(400);
    const edgeCssX = (bnd.col * 256 - cam.x) * ZOOM;        // canvas-relative CSS
    const midCssY = (bnd.row * 256 + 128 - cam.y) * ZOOM;
    const HALF = 24;                                        // CSS px either side
    const dx0 = Math.round((g.left + edgeCssX - HALF) * g.dpr);
    const dy0 = Math.round((g.top + midCssY - HALF) * g.dpr);
    const dw = Math.round(2 * HALF * g.dpr), dh = dw;
    const { data: b64 } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}.png`, Buffer.from(b64, 'base64'));
    // evalExpr, not json: this one is a PROMISE, and JSON.stringify of a pending
    // promise is `{}`.
    const win = await c.evalExpr(`window.__q.shotWindow(${J(b64)}, ${dx0}, ${dy0}, ${dw}, ${dh})`);
    const shotIsDevice = win.natW === Math.round(g.innerWidth * g.dpr) && win.natH === Math.round(g.innerHeight * g.dpr);
    const ratio = g.bw / g.width;                           // backing px per CSS px, measured
    const MARGIN = 4;
    const src = await c.json(`window.__q.backingColours(${(edgeCssX - HALF) * ratio - MARGIN}, ${(midCssY - HALF) * ratio - MARGIN}, ${2 * HALF * ratio + 2 * MARGIN}, ${2 * HALF * ratio + 2 * MARGIN})`);
    const srcSet = new Set(src.colours);
    const foreign = new Map();
    for (const px of win.px) if (!srcSet.has(px)) foreign.set(px, (foreign.get(px) ?? 0) + 1);
    const nForeign = [...foreign.values()].reduce((a, b) => a + b, 0);
    const shotColours = new Set(win.px).size;
    let changes = 0;
    for (let y = 0; y < dh; y++) for (let x = 1; x < dw; x++) if (win.px[y * dw + x] !== win.px[y * dw + x - 1]) changes++;
    const edgeRow = Math.floor(dh / 2);
    const edgeDevX = Math.round(HALF * g.dpr);
    const sample = win.px.slice(edgeRow * dw + edgeDevX - 8, edgeRow * dw + edgeDevX + 8).map(hex);
    note(`${label}.2`, 'screenshot', `${win.natW}x${win.natH} device px (innerWidth*dpr ${(g.innerWidth * g.dpr).toFixed(1)}); window [${dx0},${dy0},${dw}x${dh}] device px; shot saved ${TAG}-scale${scale}.png`);
    note(`${label}.2`, 'device row across the A|B edge (8 px each side)', sample.join(' '));
    note(`${label}.2`, 'backing-store source region', `${src.w}x${src.h} at ${src.x0},${src.y0}; ${src.colours.length} colours; translucent ${src.translucent}`);
    check(`${label}.2`, 'every on-screen pixel around the chunk edge is a colour the backing store drew (no filtered blends)',
      shotIsDevice && src.translucent === 0 && shotColours >= 2 && changes >= 10 && nForeign === 0,
      `${nForeign} of ${win.px.length} device px are colours the store never drew (${foreign.size} distinct${foreign.size ? `, e.g. ${[...foreign.keys()].slice(0, 6).map(hex).join(' ')}` : ''}); `
      + `window holds ${shotColours} colours and ${changes} neighbour changes (anti-vacuous: >=2 and >=10); screenshot in device px: ${shotIsDevice}`);

    // ---- s.3 a real right-click grabs the cell ----------------------------
    const aimFor = (worldX) => {
      const x = Math.round(g.left + (worldX - cam.x) * ZOOM);
      const y = Math.round(g.top + midCssY);
      // Derived back from the INTEGER aim through the camera contract.
      const wx = cam.x + (x - g.left) / ZOOM, wy = cam.y + (y - g.top) / ZOOM;
      return { x, y, wx, wy, col: Math.floor(wx / 256), row: Math.floor(wy / 256) };
    };
    const edgeWorld = bnd.col * 256;
    const aimA = aimFor(edgeWorld - 1), aimB = aimFor(edgeWorld + 1);
    const aimsOk = aimA.col === bnd.col - 1 && aimB.col === bnd.col && aimA.row === bnd.row && aimB.row === bnd.row;
    await c.evalExpr('window.__dbg.classic.setSelectedChunk(0)');
    await rightClick(c, aimA.x, aimA.y);
    const gotA = await c.json('window.__dbg.classic.selectedChunk()');
    await c.evalExpr('window.__dbg.classic.setSelectedChunk(0)');
    await rightClick(c, aimB.x, aimB.y);
    const gotB = await c.json('window.__dbg.classic.selectedChunk()');
    check(`${label}.3`, 'a real right-click 2 CSS px either side of the A|B edge eyedrops A on the left and B on the right',
      aimsOk && gotA === bnd.A && gotB === bnd.B,
      `aim A ${J(aimA)} -> ${gotA} (want ${bnd.A}); aim B ${J(aimB)} -> ${gotB} (want ${bnd.B}); aims derive to the intended cells: ${aimsOk}`);

    // ---- s.4 the grabbed cell is where it is drawn -------------------------
    // chunk B is armed by the eyedrop above; now arm the stamp tool.
    // The stamp tool lives on the Layout facet, so the facet is chosen the way a
    // person chooses it: a real click on its button in the facet strip.
    const facetBtn = await c.json(String.raw`(() => {
      const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === 'Layout');
      if (!b) return null; const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!facetBtn) throw new Error('no Layout facet button in [aria-label="Facets"]: row 4 cannot arm the stamp tool, UNMEASURABLE');
    await mouseEv(c, 'mouseMoved', facetBtn.x, facetBtn.y);
    await mouseEv(c, 'mousePressed', facetBtn.x, facetBtn.y, 'left', 1);
    await mouseEv(c, 'mouseReleased', facetBtn.x, facetBtn.y, 'left', 0);
    await sleep(600);
    // Classic binds no tool KEYS (toolForKey is wired in aeon's MapViewport only), so
    // the tool is armed by a real click on the facet dock's "Stamp Chunk" button.
    const stampBtn = await c.json(String.raw`(() => {
      const b = document.querySelector('button[aria-label="Stamp Chunk"]');
      if (!b) return null; const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!stampBtn) throw new Error('no "Stamp Chunk" button in the facet dock: row 4 cannot arm the stamp tool, UNMEASURABLE');
    await mouseEv(c, 'mouseMoved', stampBtn.x, stampBtn.y);
    await mouseEv(c, 'mousePressed', stampBtn.x, stampBtn.y, 'left', 1);
    await mouseEv(c, 'mouseReleased', stampBtn.x, stampBtn.y, 'left', 0);
    await sleep(300);
    const toolNow = await c.json('window.__dbg.classic.tool()');
    const selNow = await c.json('window.__dbg.classic.selectedChunk()');
    // ZOOM 1 FOR THIS ROW, so the whole of cell A (256 world px = 256 CSS px) is
    // on screen and all FOUR edges of the changed box are constrained; at zoom 2
    // the cell is wider than half the canvas and its left edge is clipped away.
    const Z4 = 1;
    const cam4X = Math.max(0, Math.round(bnd.col * 256 - g.width / 2 / Z4));
    const cam4Y = Math.max(0, Math.round(bnd.row * 256 + 128 - g.height / 2 / Z4));
    await c.evalExpr(`window.__dbg.setView(${cam4X}, ${cam4Y}, ${Z4})`);
    await sleep(700);
    const cam4 = await c.json('window.__dbg.view()');
    const hx = Math.round(g.left + (bnd.col * 256 - 1 - cam4.x) * cam4.zoom);
    const hy = Math.round(g.top + (bnd.row * 256 + 128 - cam4.y) * cam4.zoom);
    const hw = { x: cam4.x + (hx - g.left) / cam4.zoom, y: cam4.y + (hy - g.top) / cam4.zoom };
    const hoverCell = { col: Math.floor(hw.x / 256), row: Math.floor(hw.y / 256) };
    await mouseEv(c, 'mouseMoved', 4, 4);
    await sleep(400);
    await c.evalExpr('window.__q.snap()');
    await mouseEv(c, 'mouseMoved', hx, hy);
    await sleep(500);
    const diff = await c.json('window.__q.diffSince()');
    // Cell A in backing px, through the MEASURED ratio.
    const cellL = ((bnd.col - 1) * 256 - cam4.x) * cam4.zoom * ratio, cellT = (bnd.row * 256 - cam4.y) * cam4.zoom * ratio;
    const cellR = cellL + 256 * cam4.zoom * ratio, cellB = cellT + 256 * cam4.zoom * ratio;
    const want = { minX: cellL, minY: cellT, maxX: cellR - 1, maxY: cellB - 1 };
    const inside = want.minX > 4 && want.minY > 4 && want.maxX < g.bw - 5 && want.maxY < g.bh - 5;
    // The ghost's outline is a 1 CSS px stroke centred ON the cell edge, so it
    // reaches half a CSS px (ratio/2 backing px) outside; +1 for the pixel it
    // partly covers.
    const tol = Math.ceil(ratio / 2) + 1;
    const near = (a, b) => Math.abs(a - b) <= tol;
    const bboxOk = diff.n > 0 && near(diff.minX, want.minX) && near(diff.minY, want.minY) && near(diff.maxX, want.maxX) && near(diff.maxY, want.maxY);
    check(`${label}.4`, 'a real hover over cell A (stamp tool, chunk B armed) changes exactly cell A\'s rectangle in the backing store',
      toolNow === 'stamp-chunk' && selNow === bnd.B && cam4.zoom === Z4 && hoverCell.col === bnd.col - 1 && hoverCell.row === bnd.row
        && inside && diff.n > 1000 && bboxOk,
      `tool ${toolNow}; armed ${selNow}; camera ${J(cam4)}; hover (${hx},${hy}) -> world ${J(hw)} cell ${J(hoverCell)}; `
      + `changed ${J(diff)}; cell A in backing px ${J(want)} wholly inside the store: ${inside} (ratio ${ratio.toFixed(4)}, tolerance ${tol})`);
    await mouseEv(c, 'mouseMoved', 4, 4);
  }, { electronArgs: [`--force-device-scale-factor=${scale}`] });
}

let aborted = null;
try {
  for (const s of SCALES) await runScale(s);
} catch (e) {
  aborted = e;
  console.log(`\nHARNESS ABORTED: ${e.stack ?? e.message}`);
}
const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed${aborted ? ' (RUN ABORTED: the rows above are a prefix, not a result)' : ''}`);
process.exit(bad.length || aborted || rows.length === 0 ? 1 : 0);
