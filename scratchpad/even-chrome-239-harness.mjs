// DO MAPVIEWPORT'S EVEN-WIDTH CHROME STROKES LAND WITH BOTH EDGES ON WHOLE DEVICE PIXELS?
// (ROADMAP row 239 (a), ruled 2026-09-28 under the owner's 2026-09-18 look permission)
//
// Row 238 (docs/reviews/2026-09-28-device-grid-238.md sections 7.2 and Open) found that
// `snapStroke`'s pre-existing callers passing 2 CSS px draw an EVEN device width centred
// on a device HALF-pixel, so each edge half-covers a device row or column at every dpr:
// the active screen frame (screen-frame.ts), the selected region's outline and the
// dragged region rect (region-overlay.ts), and the hovered, dragged or refused layer
// guide (effects-guides.ts). The ruling moves them to `snapStrokeEdges` (parity-aware
// centring: an even width centres on a WHOLE device pixel).
//
// ═══ WHAT EACH SUBJECT MEASURES ═══
//
// Every subject is two REAL screenshots of the page (device px) taken with nothing
// changed between them but the one state that makes the stroke 2 CSS px:
//
//   g  a layer guide, hovered by a real mouse move onto its row (vs parked: 1 px).
//   f  the screen frame, made active by a real hover on its right edge (vs parked: 1 px).
//      Its RIGHT and BOTTOM edges are read, because the frame's left and top can sit on
//      the canvas edge itself.
//   r  a region's outline, selected by a real click on its panel row (vs unselected: 1 px).
//   d  the dragged region rect, mid-drag by a real press inside the selected region and a
//      real move with the tint hidden (vs the same view before the press: nothing drawn).
//
// For each edge E is the device index `snapStrokeEdges` puts the even stroke's centre on:
// the device origin of the canvas plus round(css edge x dpr) (plus a whole-px size for a
// right or bottom edge). A 2 CSS px line is 2 device px at dpr 1 and 1.5, so:
//
//   .1  E-2 is UNCHANGED between the two shots (nothing bleeds past the outer boundary)
//   .2  E-1 is the opaque stroke colour on every sampled line
//   .3  E   is the opaque stroke colour on every sampled line
//   .4  E+1 is UNCHANGED between the two shots (nothing crosses the inner boundary)
//
// On master (half-pixel centre E+0.5) the line covers E-1 and E+1 by HALF: .2 is not full
// strength and .4 is changed. So .2 and .4 are the discriminating rows; .1 and .3 are the
// bound and the anti-vacuous witness that the stroke is where it is expected at all.
// Every colour is read from canvas-colors.ts, never retyped. Every mouse event is a real
// `Input.dispatchMouseEvent` at an INTEGER client pixel. The sampled lines skip every
// place another piece of chrome can sit (labels, the other guide, the frame's corners).
//
// READ ONLY: the aeon tree is a COPY (AEON_DIR, refused if live). A probe effects scene
// and a regions document are made in memory and never saved; the drag is released where
// it was pressed (a zero delta pushes no command) and the document is checked unchanged.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Run:  VITE_AURORA_DEBUG=1 npm run build
//       ELECTRON_BIN=<main checkout>/node_modules/.bin/electron AURORA_BUILT_TREE=<this tree> \
//       AEON_DIR=<a copy of aeon> npm run harness:even-chrome-239  [SCALES=1,1.5] [TAG=run]
// Read the `root:` / `pinned:` lines first: if they name a tree other than the one you
// built, the run measured somebody else's app and is void.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { session, sleep, ROOT, MAIN } from './canvas-cdp-harness.mjs';
import { checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';

const SCALES = (process.env.SCALES ?? '1,1.5').split(',').map((s) => Number(s.trim()));
const SHOT_DIR = process.env.SHOT_DIR ?? `${ROOT}/scratchpad/shots-even-chrome-239`;
const TAG = process.env.TAG ?? 'run';
mkdirSync(SHOT_DIR, { recursive: true });
const J = (v) => JSON.stringify(v);

const AEONDIR = checkoutOverride('aeon')?.value ?? null;
if (!AEONDIR || !existsSync(AEONDIR)) throw new Error('AEON_DIR must point at a COPY of an aeon tree: UNMEASURABLE without it');
if (AEONDIR === siblingDefaultPathOrUnresolved('aeon')) throw new Error('AEON_DIR names the live aeon tree: make a copy');

const rows = [];
const check = (id, what, pass, detail = '') => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n        ${detail}` : ''}`);
};
const note = (id, what, v) => console.log(`      ${id}  ${what}: ${typeof v === 'string' ? v : J(v)}`);

// ── WHAT THE APP DECLARES, PARSED FROM SOURCE ─────────────────────────────
const COLOURS = readFileSync(`${ROOT}/src/renderer/canvas/canvas-colors.ts`, 'utf8');
/** An OPAQUE colour constant, as [r, g, b]; anything else is unmeasurable here. */
function opaqueColour(name) {
  const rgba = new RegExp(`export const ${name} = 'rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*1\\)'`).exec(COLOURS);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
  const hex = new RegExp(`export const ${name} = '#([0-9a-fA-F]{6})'`).exec(COLOURS);
  if (hex) { const n = parseInt(hex[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  throw new Error(`${name} is not an opaque rgba(...,1) or #rrggbb literal: the full-strength test cannot be derived, UNMEASURABLE`);
}
function regionHueZero() {
  const m = /export const REGION_HUES: readonly string\[\] = \[\s*'#([0-9a-fA-F]{6})'/.exec(COLOURS);
  if (!m) throw new Error('REGION_HUES[0] is not an opaque #rrggbb literal: UNMEASURABLE');
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const GUIDE_ACTIVE = opaqueColour('EFFECTS_GUIDE_ACTIVE');
const FRAME_ACTIVE = opaqueColour('SCREEN_FRAME_ACTIVE');
const REGION_HUE0 = regionHueZero();
const REGION_KEY = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/workspace/tool-meta.ts`, 'utf8');
  const m = /['"]?region['"]?\s*:\s*'([a-z])'/.exec(src);
  if (!m) throw new Error('TOOL_KEYS.region not found: UNMEASURABLE');
  return m[1];
})();
const REGION_SNAP = (() => {
  const src = readFileSync(`${ROOT}/src/core/editing/region-marquee.ts`, 'utf8');
  const m = /export const REGION_SNAP_PX = (\d+);/.exec(src);
  if (!m) throw new Error('REGION_SNAP_PX not found: UNMEASURABLE');
  return Number(m[1]);
})();
/** The 2 CSS px device width, restated from the parity rule (deviceStrokeWidth). */
const evenWidth = (dpr) => Math.max(2, 2 * Math.ceil((2 * dpr) / 2 - 0.5));

async function mouseEv(c, type, x, y, button = 'none', buttons = 0) {
  await c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
}
async function realClick(c, pt) {
  await mouseEv(c, 'mouseMoved', pt.x, pt.y); await sleep(60);
  await mouseEv(c, 'mousePressed', pt.x, pt.y, 'left', 1); await sleep(40);
  await mouseEv(c, 'mouseReleased', pt.x, pt.y, 'left', 0); await sleep(300);
}
async function keyPress(c, k) {
  const p = { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  await sleep(400);
}
const elCentre = (c, expr) => c.json(String.raw`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y); return { x, y, hitOk: !!(hit && (hit === el || el.contains(hit))) }; })()`);
const geom = (c) => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
  const r = cv.getBoundingClientRect(); return { dpr: window.devicePixelRatio, left: r.left, top: r.top, width: r.width, height: r.height,
  innerWidth: window.innerWidth, innerHeight: window.innerHeight }; })()`);
const shotB64 = async (c) => (await c.send('Page.captureScreenshot', { format: 'png' })).data;

// Decode a PNG screenshot in the page and return the listed device pixels as [r, g, b].
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

const hex = (q) => ((q[0] << 16) | (q[1] << 8) | q[2]).toString(16).padStart(6, '0');
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * The four rows for one edge. `vertical` means the stroke runs vertically (a left or
 * right edge), so the offsets step across device COLUMNS and `along` lists device rows.
 */
async function edgeRows(c, g, id, what, offB64, onB64, vertical, E, along, colour) {
  const offsets = [-3, -2, -1, 0, 1, 2, 3];
  const pts = [];
  for (const o of offsets) for (const a of along) pts.push(vertical ? [E + o, a] : [a, E + o]);
  const off = await c.evalExpr(`${SHOT_PIXELS}(${J(offB64)}, ${J(pts)})`);
  const on = await c.evalExpr(`${SHOT_PIXELS}(${J(onB64)}, ${J(pts)})`);
  const shotIsDevice = on.natW === Math.round(g.innerWidth * g.dpr) && on.natH === Math.round(g.innerHeight * g.dpr);
  const full = (px) => px.every((v, i) => Math.abs(v - colour[i]) <= 2);
  const n = along.length;
  const stat = offsets.map((o, k) => {
    let changed = 0, fullN = 0;
    for (let t = 0; t < n; t++) {
      const i = k * n + t;
      if (!same(off.px[i], on.px[i])) changed++;
      if (full(on.px[i])) fullN++;
    }
    return { o, changed, full: fullN };
  });
  const at = (o) => stat.find((s) => s.o === o);
  const mid = Math.floor(n / 2);
  const line = (w) => offsets.map((o, k) => hex(w.px[k * n + mid])).join(' ');
  note(id, `${what}, per device ${vertical ? 'column' : 'row'} E-3..E+3 over ${n} sampled ${vertical ? 'rows' : 'columns'}`,
    stat.map((s) => `E${s.o >= 0 ? '+' : ''}${s.o}: changed ${s.changed}, full ${s.full}`).join('; '));
  note(id, `one line across it, E-3..E+3, before`, line(off));
  note(id, `one line across it, E-3..E+3, after `, line(on));
  const sd = `screenshot in device px: ${shotIsDevice} (${on.natW}x${on.natH})`;
  check(`${id}.1`, `${what}: E-2 is unchanged on every sampled line (nothing past the outer boundary)`,
    shotIsDevice && n >= 20 && at(-2).changed === 0, `E-2 changed ${at(-2).changed}/${n}; ${sd}`);
  check(`${id}.2`, `${what}: E-1 is the opaque stroke colour on every sampled line (BOTH edges on whole device px)`,
    shotIsDevice && n >= 20 && at(-1).full === n, `E-1 full ${at(-1).full}/${n}`);
  check(`${id}.3`, `${what}: E is the opaque stroke colour on every sampled line`,
    shotIsDevice && n >= 20 && at(0).full === n, `E full ${at(0).full}/${n}`);
  check(`${id}.4`, `${what}: E+1 is unchanged on every sampled line (nothing crosses the inner boundary)`,
    shotIsDevice && n >= 20 && at(1).changed === 0, `E+1 changed ${at(1).changed}/${n}`);
}

/** Device indices from `fromCss` for `count` device px, skipping any within `avoid` CSS px of a listed CSS coordinate. */
function sampleLine(origin, fromCss, toCss, dpr, avoidCss = [], avoidPx = 6) {
  const out = [];
  for (let d = Math.ceil(fromCss * dpr); d < Math.floor(toCss * dpr) && out.length < 60; d++) {
    const css = d / dpr;
    if (avoidCss.some((a) => Math.abs(css - a) < avoidPx)) continue;
    out.push(origin + d);
  }
  return out;
}

const SCENE_ID = 'even_chrome_probe';
const TOPS = [60, 200];
const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${J(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;
const TOP_INPUT = (i) => `[...document.querySelectorAll('input[type=number]')].find(e => new RegExp('^Layer ${i} (world_y|Screen line)').test(e.title||''))`;
const BTN_TEXT = (re) => `([...document.querySelectorAll('button')].find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim())) || null)`;
const SUBTAB = (id) => `document.querySelector('[data-effects-sub-tab="${id}"]')`;
const FACET = (name) => `([...document.querySelectorAll('[aria-label="Facets"] button')].find((b) => b.textContent.trim() === ${J(name)}) || null)`;

async function partScale(scale) {
  const P = `e${scale}`;
  await session(`${P}: even-width chrome at --force-device-scale-factor=${scale}`, async (c) => {
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
    await sleep(2500);
    await c.evalExpr("window.__dbg.setOverlay('playAnimatedArt', false)").catch(() => null);
    const park = async () => {
      const g = await geom(c);
      if (g) { await mouseEv(c, 'mouseMoved', Math.round(g.left + g.width - 20), Math.round(g.top + g.height - 20)); await sleep(200); }
      await mouseEv(c, 'mouseMoved', 2, 2); await sleep(300);
    };
    const repaint = async (x = 0, y = 0, z = 1) => {
      await c.evalExpr(`window.__dbg.setView(${x}, ${y + 1}, ${z})`); await sleep(250);
      await c.evalExpr(`window.__dbg.setView(${x}, ${y}, ${z})`); await sleep(450);
    };

    // ── the Effects facet and the probe scene (guides + locked frame) ───────
    const pill = await elCentre(c, FACET('Effects'));
    if (!pill || !pill.hitOk) throw new Error(`no Effects facet button to click: ${J(pill)}: UNMEASURABLE`);
    await realClick(c, pill); await sleep(1200);
    const sub = await elCentre(c, SUBTAB('parallax'));
    if (sub && sub.hitOk) await realClick(c, sub);
    await sleep(400);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(`${BTN_TEXT('/^New$/')}?.click()`); await sleep(900);
    await c.evalExpr(`${BTN_TEXT('/Add layer/')}?.click()`); await sleep(700);
    await c.evalExpr(SET_INPUT(TOP_INPUT(0), TOPS[0]));
    await c.evalExpr(SET_INPUT(TOP_INPUT(1), TOPS[1]));
    await sleep(700);
    await c.evalExpr('window.__dbg.aeon.setBandLensTarget(null)').catch(() => null);
    await c.evalExpr(`window.__dbg.aeon.selectScene(${J(SCENE_ID)})`); await sleep(500);
    const tile = await elCentre(c, SUBTAB('tileAnim'));
    if (tile && tile.hitOk) await realClick(c, tile);
    await sleep(400);
    await repaint(); await park();
    const g = await geom(c);
    const gd = await c.json('window.__dbg.aeon.guides()');
    const fr = await c.json('window.__dbg.aeon.screenFrame()');
    const devLeft = g.left * g.dpr, devTop = g.top * g.dpr;
    const devAligned = Math.abs(devLeft - Math.round(devLeft)) < 1e-6 && Math.abs(devTop - Math.round(devTop)) < 1e-6;
    const ox = Math.round(devLeft), oy = Math.round(devTop);
    check(`${P}.0`, `PREMISE: dpr ${scale} took, the map canvas sits on whole device px, the probe's two guides and the frame are drawn, a 2 CSS px line is ${evenWidth(scale)} device px`,
      Math.abs(g.dpr - scale) < 1e-6 && devAligned && gd.active && gd.sceneId === SCENE_ID
        && J(gd.rows.map((r) => r.canvasY)) === J(TOPS) && fr.active && !!fr.rect && evenWidth(scale) === 2,
      `geometry ${J(g)}; guides ${J({ active: gd.active, sceneId: gd.sceneId, rows: gd.rows.map((r) => r.canvasY) })}; frame ${J({ active: fr.active, rect: fr.rect })}`);
    if (!fr.rect || !gd.active) throw new Error('the probe did not draw: UNMEASURABLE');
    const r = fr.rect;

    // ── g: a guide, hovered ─────────────────────────────────────────────────
    {
      const id = `${P}.g`;
      const gOff = await shotB64(c);
      const aimX = Math.round(g.left + Math.min(r.x + r.w + 120, g.width - 40));
      const aimY = Math.round(g.top + TOPS[1]);
      await mouseEv(c, 'mouseMoved', aimX, aimY); await sleep(600);
      const gh = await c.json('window.__dbg.aeon.guides()');
      const gOn = await shotB64(c);
      writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-guide-off.png`, Buffer.from(gOff, 'base64'));
      writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-guide-on.png`, Buffer.from(gOn, 'base64'));
      check(`${id}.0`, 'PREMISE: a real mouse move onto layer 1\'s row hovers layer 1', gh.hoverIndex === 1 && gh.dragIndex === null,
        `aim (${aimX},${aimY}); guides hoverIndex ${gh.hoverIndex} dragIndex ${gh.dragIndex}; shots ${TAG}-scale${scale}-guide-{off,on}.png`);
      const E = oy + Math.round(TOPS[1] * g.dpr);
      // Columns right of the frame and clear of every label (guide labels sit at x 4..).
      const along = sampleLine(ox, r.x + r.w + 12, g.width - 12, g.dpr, [aimX - g.left]);
      await edgeRows(c, g, id, 'hovered guide (horizontal)', gOff, gOn, false, E, along, GUIDE_ACTIVE);
      await park();
    }

    // ── f: the frame, made active by a hover on its right edge ─────────────
    {
      const id = `${P}.f`;
      const fOff = await shotB64(c);
      const guideRows = TOPS;
      let hy = r.y + r.h / 2;
      if (guideRows.some((t) => Math.abs(t - hy) < 12)) hy = r.y + r.h * 0.3;
      const aimX = Math.round(g.left + r.x + r.w), aimY = Math.round(g.top + hy);
      await mouseEv(c, 'mouseMoved', aimX, aimY); await sleep(600);
      const gh = await c.json('window.__dbg.aeon.guides()');
      const fOn = await shotB64(c);
      writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-frame-off.png`, Buffer.from(fOff, 'base64'));
      writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-frame-on.png`, Buffer.from(fOn, 'base64'));
      check(`${id}.0`, 'PREMISE: the hover on the frame\'s right edge hovers no guide (so only the frame changed)', gh.hoverIndex === null,
        `aim (${aimX},${aimY}); frame rect ${J(r)}; guides hoverIndex ${gh.hoverIndex}; shots ${TAG}-scale${scale}-frame-{off,on}.png`);
      // Right edge: centre at the snapped left plus a whole-px width.
      const ER = ox + Math.round(r.x * g.dpr) + Math.round(r.w * g.dpr);
      const alongR = sampleLine(oy, r.y + 20, r.y + r.h - 8, g.dpr, [...guideRows, aimY - g.top]);
      await edgeRows(c, g, `${id}.right`, 'active frame, right edge (vertical)', fOff, fOn, true, ER, alongR, FRAME_ACTIVE);
      const EB = oy + Math.round(r.y * g.dpr) + Math.round(r.h * g.dpr);
      const alongB = sampleLine(ox, r.x + 12, r.x + r.w - 12, g.dpr);
      await edgeRows(c, g, `${id}.bottom`, 'active frame, bottom edge (horizontal)', fOff, fOn, false, EB, alongB, FRAME_ACTIVE);
      await park();
    }

    // ── r and d: the regions facet ─────────────────────────────────────────
    const rp = await elCentre(c, FACET('Regions'));
    if (!rp || !rp.hitOk) throw new Error(`no Regions facet button to click: ${J(rp)}: UNMEASURABLE`);
    await realClick(c, rp); await sleep(1200);
    await park();
    const st2 = await c.json('window.__dbg.aeon.state()');
    const FX = 512, FY = 512, FW = 1024, FH = 1024;
    const seedDoc = {
      schema: 1, act: st2.actId ?? 'act1',
      regions: [{ id: 'forest', name: 'Forest', preset: 'OJZ_Preset_Sec1', rect: { x: FX, y: FY, w: FW, h: FH } }],
    };
    const seeded = await c.json(`window.__dbg.aeon.setRegions(${J(J(seedDoc))})`);
    await sleep(500);
    await c.evalExpr('window.__dbg.setOverlay("showRegions", true)');
    const CAMX = FX - 40, CAMY = FY - 40;
    await repaint(CAMX, CAMY, 1);
    await park();
    const docBefore = J(await c.json('window.__dbg.aeon.regionsDocument()'));
    const gR = await geom(c);
    const oxR = Math.round(gR.left * gR.dpr), oyR = Math.round(gR.top * gR.dpr);
    const view = await c.json('window.__dbg.view()');
    check(`${P}.r.0a`, 'PREMISE: the one-region document is in the app, the view is zoom 1 at an integer camera, the canvas on whole device px',
      !!(seeded && seeded.ok !== false) && view.x === CAMX && view.y === CAMY && view.zoom === 1
        && Math.abs(gR.left * gR.dpr - oxR) < 1e-6 && Math.abs(gR.top * gR.dpr - oyR) < 1e-6,
      `setRegions ${J(seeded)}; view ${J(view)}; geometry ${J(gR)}`);
    {
      const id = `${P}.r`;
      const rOff = await shotB64(c);
      const row = await elCentre(c, `document.getElementById('region-row-forest')`);
      if (!row || !row.hitOk) throw new Error(`no region-row-forest to click: ${J(row)}: UNMEASURABLE`);
      await realClick(c, row);
      await sleep(600);
      const sel = await c.json('window.__dbg.aeon.regions()');
      const rep = await c.json('window.__dbg.aeon.regionOverlayReport()');
      const rOn = await shotB64(c);
      writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-region-off.png`, Buffer.from(rOff, 'base64'));
      writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-region-on.png`, Buffer.from(rOn, 'base64'));
      check(`${id}.0`, 'PREMISE: a real click on the panel row selected forest, and the overlay drew it selected',
        sel.selectedRegionId === 'forest' && rep && rep.mode === 'full' && rep.regions.some((x) => x.id === 'forest' && x.selected),
        `click ${J(row)}; selectedRegionId ${sel.selectedRegionId}; report ${J(rep && { mode: rep.mode, regions: rep.regions })}; shots ${TAG}-scale${scale}-region-{off,on}.png`);
      const cssL = (FX - CAMX), cssT = (FY - CAMY);
      const EL = oxR + Math.round(cssL * gR.dpr);
      const alongL = sampleLine(oyR, cssT + 60, Math.min(cssT + FH, gR.height) - 12, gR.dpr);
      await edgeRows(c, gR, `${id}.left`, 'selected region outline, left edge (vertical)', rOff, rOn, true, EL, alongL, REGION_HUE0);
      const ET = oyR + Math.round(cssT * gR.dpr);
      const alongT = sampleLine(oxR, cssL + 120, Math.min(cssL + FW, gR.width) - 12, gR.dpr);
      await edgeRows(c, gR, `${id}.top`, 'selected region outline, top edge (horizontal)', rOff, rOn, false, ET, alongT, REGION_HUE0);
    }
    {
      const id = `${P}.d`;
      await keyPress(c, REGION_KEY);
      const armed = await c.json('window.__dbg.aeon.state()');
      await c.evalExpr('window.__dbg.setOverlay("showRegions", false)');
      await repaint(CAMX, CAMY, 1);
      const px = Math.round(gR.left + (FX - CAMX) + 200), py = Math.round(gR.top + (FY - CAMY) + 200);
      const DELTA = 4 * REGION_SNAP;   // a whole number of snap cells: every snapping rule moves it exactly this far
      await mouseEv(c, 'mouseMoved', px, py); await sleep(400);
      const dOff = await shotB64(c);
      await mouseEv(c, 'mousePressed', px, py, 'left', 1); await sleep(200);
      await mouseEv(c, 'mouseMoved', px + DELTA / 2, py + DELTA / 2, 'left', 1); await sleep(200);
      await mouseEv(c, 'mouseMoved', px + DELTA, py + DELTA, 'left', 1); await sleep(600);
      const rep = await c.json('window.__dbg.aeon.regionOverlayReport()');
      const dOn = await shotB64(c);
      await mouseEv(c, 'mouseMoved', px, py, 'left', 1); await sleep(300);
      await mouseEv(c, 'mouseReleased', px, py, 'left', 0); await sleep(700);
      const docAfter = J(await c.json('window.__dbg.aeon.regionsDocument()'));
      writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-drag-off.png`, Buffer.from(dOff, 'base64'));
      writeFileSync(`${SHOT_DIR}/${TAG}-scale${scale}-drag-on.png`, Buffer.from(dOn, 'base64'));
      check(`${id}.0`, `PREMISE: the '${REGION_KEY}' key armed the region tool, the tint is hidden, a real press inside forest and a real move of ${DELTA} px drew the gesture (one dragged outline), and releasing at the press point left the document as seeded`,
        armed.tool === 'region' && !!rep && rep.mode === 'gesture' && rep.drew.gestureOutlines === 1 && rep.drew.trimmedOutlines === 0 && docAfter === docBefore,
        `tool ${armed.tool}; press (${px},${py}) move +${DELTA}; report ${J(rep && { mode: rep.mode, drew: rep.drew })}; document unchanged ${docAfter === docBefore}; shots ${TAG}-scale${scale}-drag-{off,on}.png`);
      const cssL = (FX + DELTA - CAMX), cssT = (FY + DELTA - CAMY);
      const EL = oxR + Math.round(cssL * gR.dpr);
      const alongL = sampleLine(oyR, cssT + 12, Math.min(cssT + FH, gR.height) - 12, gR.dpr, [py - gR.top, py + DELTA - gR.top]);
      await edgeRows(c, gR, `${id}.left`, 'dragged region rect, left edge (vertical)', dOff, dOn, true, EL, alongL, REGION_HUE0);
      const ET = oyR + Math.round(cssT * gR.dpr);
      const alongT = sampleLine(oxR, cssL + 12, Math.min(cssL + FW, gR.width) - 12, gR.dpr, [px - gR.left, px + DELTA - gR.left]);
      await edgeRows(c, gR, `${id}.top`, 'dragged region rect, top edge (horizontal)', dOff, dOn, false, ET, alongT, REGION_HUE0);
      await c.evalExpr('window.__dbg.setOverlay("showRegions", true)');
    }
    await park();
  }, { electronArgs: [`--force-device-scale-factor=${scale}`] });
}

let aborted = null;
try {
  for (const s of SCALES) await partScale(s);
} catch (e) {
  aborted = e;
  console.log(`\nHARNESS ABORTED: ${e.stack ?? e.message}`);
}
const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed${aborted ? ' (RUN ABORTED: the rows above are a prefix, not a result)' : ''}`);
if (bad.length) console.log(`FAILED: ${bad.map((r) => r.id).join(', ')}`);
process.exit(bad.length || aborted || rows.length === 0 ? 1 : 0);
