// Pure overlay-drawing functions for the classic (Sonic 1) level viewport.
//
// Extracted verbatim from ClassicLevelViewport.tsx (Task 14 pre-refactor) so the
// component stays a thin gesture/camera shell over drawing that is otherwise
// straight-line canvas code. These take an already-transformed 2D context (the
// caller has applied `scale(zoom); translate(-cam.x, -cam.y)`) plus the LevelDoc
// and the inverse zoom, and paint the collision / object / start overlays in
// world coordinates. They hold no state and touch no React — behaviour is
// identical to the inline versions they replaced.

import { chunkIndexForId, type LevelDoc } from '../../../core/level-classic/model';
import { chunkPriorityMask, CHUNK_TILES } from '../../../core/level-classic/priority-mask';
import { columnSolidRun } from '../../../core/collision/collision-render';
import { angleNeedle } from './collision-needle';
import { objectFrameRect } from '../../../core/level-classic/object-sprite';
import { objectArtKey } from '../../../core/project/profiles/object-subtype-rules';
import { s1ObjectIsInvisible, s1ObjectName } from '../../../core/project/profiles/s1-objects';
import type { ObjectSprite } from '../../state/classicObjectArtStore';
import { CHUNK_PX, ringGroupPositions } from './viewport-math';
import {
  CANVAS_VOID,
  COLLISION_FILL_ALL, COLLISION_FILL_TOP, COLLISION_FILL_SIDES, COLLISION_FILL_NONE,
  COLLISION_SURFACE_LINE, COLLISION_ANGLE_TICK,
  OBJECT_BOX_FILL, OBJECT_BOX_STROKE, OBJECT_LABEL, RING_FILL, RING_STROKE, START_MARKER,
  OBJECT_SELECTED_STROKE, GHOST_BOX_FILL, GHOST_BOX_STROKE, GHOST_LABEL,
  PRIORITY_FILL, PRIORITY_EDGE,
  OCCLUSION_GHOST_TINT, OCCLUSION_GHOST_ALPHA,
} from '../../canvas/canvas-colors';
import type { WorldRect } from '../../../core/level-classic/object-sprite';

/** S1 ring object id — expands into a visible ring group (Ring_Main rule). */
export const RING_OBJ_ID = 0x25;

/**
 * Bounds of the ghost marker drawn for an invisible/trigger object (a 24×16 box
 * centred on the anchor). Shared by drawObjects (the visual) and the viewport's
 * hit-test (the grab region) so grabbing matches what's drawn.
 */
export const GHOST_MARKER_BOUNDS = { width: 24, height: 16, originX: 12, originY: 8 };

function solidityFill(solidity: number): string {
  switch (solidity) {
    case 1: return COLLISION_FILL_TOP;
    case 2: return COLLISION_FILL_SIDES;
    case 3: return COLLISION_FILL_ALL;
    default: return COLLISION_FILL_NONE;
  }
}

/**
 * Draw the collision overlay for one visible chunk at layout cell (col, row).
 * `chunkId` is the S1 engine id (1-based; $00 = air draws no collision).
 */
export function drawCollision(
  ctx: CanvasRenderingContext2D,
  d: LevelDoc,
  col: number,
  row: number,
  chunkId: number,
  showAngles: boolean,
): void {
  const index = chunkIndexForId(d, chunkId);
  if (index === null) return; // air / out-of-range → no collision to draw
  const chunk = d.chunks[index];
  if (!chunk) return;
  const baseX = col * CHUNK_PX;
  const baseY = row * CHUNK_PX;
  const heights = d.collision.shapes.heights;
  const angles = d.collision.shapes.angles;
  for (let i = 0; i < 256; i++) {
    const cell = chunk.cells[i];
    // Block 0 first, because that is the order the engine tests in: FindFloor
    // does `andi.w #$7FF,d0 / beq.s .isblank` BEFORE `btst d5,d4`. Without
    // this, a non-zero colind[0] draws collision the game will never apply.
    if (!cell || cell.block === 0 || cell.solidity === 0) continue;
    const shapeIndex = d.collision.colind[cell.block] ?? 0;
    if (shapeIndex === 0) continue; // shape 0 = empty (no collision)
    const cols = heights[shapeIndex];
    if (!cols) continue;
    const cx = baseX + (i % 16) * 16;
    const cy = baseY + ((i / 16) | 0) * 16;
    ctx.fillStyle = solidityFill(cell.solidity);
    for (let c = 0; c < 16; c++) {
      // Chunk-cell X flip mirrors which column height applies.
      const sc = cell.xf ? 15 - c : c;
      const run = columnSolidRun(cols[sc]);
      if (!run) continue;
      // Chunk-cell Y flip mirrors the run vertically within the 16px cell.
      const ry = cell.yf ? 16 - run.y - run.h : run.y;
      ctx.fillRect(cx + c, cy + ry, 1, run.h);
    }
    if (showAngles) {
      // Direction and flips both come from collision-needle.ts, which is
      // anchored on the engine's own convention and unit-tested; this block
      // used to inline a mirrored formula and ignore cell.xf/yf entirely,
      // while the height rendering above honoured them.
      const { dx, dy } = angleNeedle(angles[shapeIndex] ?? 0, cell.xf, cell.yf);
      const mx = cx + 8, my = cy + 8, len = 6;
      ctx.strokeStyle = COLLISION_ANGLE_TICK;
      ctx.lineWidth = 1 / ctx.getTransform().a;
      ctx.beginPath();
      ctx.moveTo(mx - dx * len, my - dy * len);
      ctx.lineTo(mx + dx * len, my + dy * len);
      ctx.stroke();
    }
  }
  // Crisp surface line along each column's collidable edge.
  ctx.strokeStyle = COLLISION_SURFACE_LINE;
  ctx.lineWidth = 1 / ctx.getTransform().a;
  for (let i = 0; i < 256; i++) {
    const cell = chunk.cells[i];
    // Block 0 first, because that is the order the engine tests in: FindFloor
    // does `andi.w #$7FF,d0 / beq.s .isblank` BEFORE `btst d5,d4`. Without
    // this, a non-zero colind[0] draws collision the game will never apply.
    if (!cell || cell.block === 0 || cell.solidity === 0) continue;
    const shapeIndex = d.collision.colind[cell.block] ?? 0;
    if (shapeIndex === 0) continue;
    const cols = heights[shapeIndex];
    if (!cols) continue;
    const cx = baseX + (i % 16) * 16;
    const cy = baseY + ((i / 16) | 0) * 16;
    for (let c = 0; c < 16; c++) {
      const sc = cell.xf ? 15 - c : c;
      const h = cols[sc];
      const run = columnSolidRun(h);
      if (!run) continue;
      let surfaceY = h >= 0 ? run.y : run.y + run.h;
      if (cell.yf) surfaceY = 16 - surfaceY;
      ctx.beginPath();
      ctx.moveTo(cx + c, cy + surfaceY);
      ctx.lineTo(cx + c + 1, cy + surfaceY);
      ctx.stroke();
    }
  }
}

/**
 * Draw the priority lens for one visible chunk at layout cell (col, row).
 * `chunkId` is the S1 engine id (1-based; $00 = air draws nothing).
 *
 * PRESENTATION — mark the exception, not the rule. High-priority 8x8 tiles
 * (they render ABOVE sprites — they will cover the player in game) get a
 * translucent violet veil so their art stays readable under the mark; every
 * high↔low boundary INSIDE the chunk additionally gets a crisp 1-screen-px
 * stroke so a region of high tiles reads as one outlined shape instead of a
 * tile-grid mush, and a lone high tile is unmissable at any zoom. Low-priority
 * tiles are left untouched: they are ~86% of all tiles (audit §3.2), and
 * veiling the rule would turn the lens into a full-map dimmer. Strokes are
 * skipped on the chunk perimeter — this function sees one chunk, so it cannot
 * know whether the region continues next door, and a false 256px seam grid in
 * SBZ's dense high areas would lie; the fill edge still carries the truth
 * there.
 *
 * Granularity is per 8x8 TILE, not per block — 73 mixed-priority blocks exist
 * (68 in SBZ) — and the mask composes chunk-cell flips exactly as renderChunk
 * does (both measured in the audit; the composition lives in
 * core/level-classic/priority-mask.ts with its own flip-trap tests).
 */
export function drawPriority(
  ctx: CanvasRenderingContext2D,
  d: LevelDoc,
  col: number,
  row: number,
  chunkId: number,
  invZoom: number,
): void {
  const mask = chunkPriorityMask(d, chunkId);
  if (!mask) return; // air / out-of-range
  const baseX = col * CHUNK_PX;
  const baseY = row * CHUNK_PX;
  const TILE = 8;
  const high = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < CHUNK_TILES && ty < CHUNK_TILES && mask[ty * CHUNK_TILES + tx] !== 0;

  // Veils. Merged into horizontal runs so a solid SBZ region is a few wide
  // rects instead of up to 1024 per chunk per frame.
  ctx.fillStyle = PRIORITY_FILL;
  for (let ty = 0; ty < CHUNK_TILES; ty++) {
    for (let tx = 0; tx < CHUNK_TILES; tx++) {
      if (!high(tx, ty)) continue;
      let run = 1;
      while (high(tx + run, ty)) run++;
      ctx.fillRect(baseX + tx * TILE, baseY + ty * TILE, run * TILE, TILE);
      tx += run; // skip past the run (loop's tx++ lands on the first low tile)
    }
  }

  // Boundary strokes: each high tile's sides whose in-chunk neighbor is low.
  ctx.strokeStyle = PRIORITY_EDGE;
  ctx.lineWidth = 1 * invZoom;
  ctx.beginPath();
  for (let ty = 0; ty < CHUNK_TILES; ty++) {
    for (let tx = 0; tx < CHUNK_TILES; tx++) {
      if (!high(tx, ty)) continue;
      const x = baseX + tx * TILE;
      const y = baseY + ty * TILE;
      if (ty > 0 && !high(tx, ty - 1)) { ctx.moveTo(x, y); ctx.lineTo(x + TILE, y); }
      if (ty < CHUNK_TILES - 1 && !high(tx, ty + 1)) { ctx.moveTo(x, y + TILE); ctx.lineTo(x + TILE, y + TILE); }
      if (tx > 0 && !high(tx - 1, ty)) { ctx.moveTo(x, y); ctx.lineTo(x, y + TILE); }
      if (tx < CHUNK_TILES - 1 && !high(tx + 1, ty)) { ctx.moveTo(x + TILE, y); ctx.lineTo(x + TILE, y + TILE); }
    }
  }
  ctx.stroke();
}

/** Blit one bitmap with an object frame's origin/flips, anchored at (ax, ay). */
function blitFlipped(
  ctx: CanvasRenderingContext2D, bitmap: ImageBitmap,
  originX: number, originY: number, ax: number, ay: number, xflip: boolean, yflip: boolean,
): void {
  ctx.save();
  ctx.translate(ax, ay);
  ctx.scale(xflip ? -1 : 1, yflip ? -1 : 1);
  // With the flip scale applied, drawing at (-origin) lands the object origin at
  // the anchor; a negative scale mirrors the frame about that anchor.
  ctx.drawImage(bitmap, -originX, -originY);
  ctx.restore();
}

/** Blit an object sprite anchored at (ax, ay) with the object's flips. */
function drawSprite(ctx: CanvasRenderingContext2D, s: ObjectSprite, ax: number, ay: number, xflip: boolean, yflip: boolean): void {
  blitFlipped(ctx, s.bitmap, s.originX, s.originY, ax, ay, xflip, yflip);
}

// ---------------------------------------------------------------------------
// Sprite occlusion (ROADMAP §5.1 item 7) — the VDP draws high-priority PLANE
// tiles in front of low-priority SPRITE pixels (layer order, back → front:
// B-low, A-low, sprite-low, B-high, A-high, sprite-high), while the flat
// preview composite draws every object above all map art. The occlusion pass
// re-draws the high-priority map-tile PIXELS (non-transparent only — a hi-pri
// tile's color-0 pixels render nothing and must not erase the sprite) above
// each drawn sprite, keeps the hidden portion discoverable as a translucent
// violet-washed ghost, and re-raises HIGH-priority sprite PIECES on top (their
// mappings-word bit — attrs bit 15 — outranks even a high plane tile). The
// per-pixel rule is core/level-classic/occlusion.ts's occlusionWinner;
// canvas compositing below implements exactly that decision.
// ---------------------------------------------------------------------------

/** Occlusion context the viewport passes into drawObjects when the pass is on. */
export interface SpriteOcclusion {
  /**
   * The hi-pri overlay canvas (256x256, ONLY the high-priority tiles' opaque
   * pixels, everything else transparent) for the chunk at layout cell
   * (col, row), or null when that chunk has none / is air. Cached by the
   * viewport on the same version key as the base chunk cache.
   */
  hiPriCanvasAt: (col: number, row: number) => HTMLCanvasElement | null;
  /** Visible world rect — objects outside it skip the pass (they are clipped
   *  off-canvas anyway; building hi-pri canvases for them would be waste). */
  visible: WorldRect;
  /** Re-apply the priority lens veil on the re-drawn hi-pri pixels, so lens +
   *  occlusion stacked stay consistent (the veil the sprite covered returns
   *  when the map pixel does). */
  lensVeil: boolean;
  /** Wall-clock cost hook: total ms this drawObjects call spent occluding. */
  onCost?: (ms: number) => void;
}

/** Two reusable scratch canvases (created lazily — unit tests never draw). */
let occlScratch: { a: HTMLCanvasElement; b: HTMLCanvasElement } | null = null;

function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width &&
    a.top < b.top + b.height && b.top < a.top + a.height;
}

/**
 * Occlude one drawn sprite frame: blit the intersecting chunks' hi-pri overlay
 * pixels over its rect, then draw the occluded portion (sprite ∩ hi-pri map)
 * back as the translucent violet ghost. Returns true when any hi-pri overlay
 * intersected (so the caller knows a re-raise pass is needed).
 */
function occludeDrawnSprite(
  ctx: CanvasRenderingContext2D,
  occl: SpriteOcclusion,
  rect: WorldRect,
  s: ObjectSprite,
  ax: number, ay: number, xf: boolean, yf: boolean,
): boolean {
  if (!rectsIntersect(rect, occl.visible)) return false;
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);
  if (w <= 0 || h <= 0) return false;
  // Which chunks intersect the frame rect, and their hi-pri canvases (if any).
  const overlaps: { canvas: HTMLCanvasElement; ox: number; oy: number }[] = [];
  const c0 = Math.floor(rect.left / CHUNK_PX);
  const c1 = Math.floor((rect.left + rect.width - 1) / CHUNK_PX);
  const r0 = Math.floor(rect.top / CHUNK_PX);
  const r1 = Math.floor((rect.top + rect.height - 1) / CHUNK_PX);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const canvas = occl.hiPriCanvasAt(col, row);
      if (canvas) overlaps.push({ canvas, ox: col * CHUNK_PX - rect.left, oy: row * CHUNK_PX - rect.top });
    }
  }
  if (overlaps.length === 0) return false;

  if (!occlScratch) {
    occlScratch = { a: document.createElement('canvas'), b: document.createElement('canvas') };
  }
  const { a, b } = occlScratch;
  // Setting width/height clears the canvas — exact size, no stale pixels.
  a.width = w; a.height = h;
  b.width = w; b.height = h;
  const actx = a.getContext('2d', { willReadFrequently: true });
  const bctx = b.getContext('2d', { willReadFrequently: true });
  if (!actx || !bctx) return false;
  actx.imageSmoothingEnabled = false;
  bctx.imageSmoothingEnabled = false;

  // Scratch A = the hi-pri map pixels within the rect (transparent elsewhere).
  for (const o of overlaps) actx.drawImage(o.canvas, o.ox, o.oy);
  if (occl.lensVeil) {
    // The lens veiled these pixels before the sprite covered them; veil the
    // re-drawn copies too so lens + occlusion stacked don't flicker holes.
    actx.globalCompositeOperation = 'source-atop';
    actx.fillStyle = PRIORITY_FILL;
    actx.fillRect(0, 0, w, h);
    actx.globalCompositeOperation = 'source-over';
  }

  // THE occlusion: high-priority plane pixels over the low sprite pixels
  // (occlusionWinner's 'map' arm — transparent map pixels blit nothing, so
  // per-pixel transparency is honored by plain source-over compositing).
  ctx.drawImage(a, rect.left, rect.top);

  // Ghost affordance: the occluded portion = sprite pixels ∩ hi-pri map
  // pixels, tinted with the lens's violet and blitted translucently ON TOP of
  // the occluding art — hidden objects stay discoverable (and selectable: the
  // hit-test uses the full static bounds, unchanged).
  drawSprite(bctx, s, ax - rect.left, ay - rect.top, xf, yf);
  bctx.globalCompositeOperation = 'destination-in';
  bctx.drawImage(a, 0, 0);
  bctx.globalCompositeOperation = 'source-atop';
  bctx.fillStyle = OCCLUSION_GHOST_TINT;
  bctx.fillRect(0, 0, w, h);
  bctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = OCCLUSION_GHOST_ALPHA;
  ctx.drawImage(b, rect.left, rect.top);
  ctx.globalAlpha = 1;
  return true;
}

/**
 * Build a chunk's hi-pri overlay canvas from its already-rasterized base
 * canvas: ONLY the pixels of high-priority 8x8 tiles are copied (their
 * transparent pixels stay transparent — the base canvas carries alpha 0 for
 * color 0, so per-pixel opacity comes along for free). Null when the chunk is
 * air / out-of-range / has no high tiles at all — the common case, and the
 * viewport caches that verdict on the same version key as the base canvas.
 * Reuses the SAME flip-exact per-tile mask as the priority lens
 * (chunkPriorityMask) — one derivation, two consumers.
 */
export function buildHiPriChunkCanvas(
  d: LevelDoc,
  chunkId: number,
  base: HTMLCanvasElement,
): HTMLCanvasElement | null {
  const mask = chunkPriorityMask(d, chunkId);
  if (!mask) return null;
  let any = false;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== 0) { any = true; break; }
  if (!any) return null;
  const c = document.createElement('canvas');
  c.width = CHUNK_PX;
  c.height = CHUNK_PX;
  const cctx = c.getContext('2d', { willReadFrequently: true });
  if (!cctx) return null;
  cctx.imageSmoothingEnabled = false;
  const TILE = 8;
  // Horizontal runs, like drawPriority: a solid hi region is a few wide blits.
  for (let ty = 0; ty < CHUNK_TILES; ty++) {
    for (let tx = 0; tx < CHUNK_TILES; tx++) {
      if (mask[ty * CHUNK_TILES + tx] === 0) continue;
      let run = 1;
      while (tx + run < CHUNK_TILES && mask[ty * CHUNK_TILES + tx + run] !== 0) run++;
      cctx.drawImage(base, tx * TILE, ty * TILE, run * TILE, TILE, tx * TILE, ty * TILE, run * TILE, TILE);
      tx += run;
    }
  }
  return c;
}

/**
 * Draw all object placements: their real sprite where its art is linked/loaded
 * (`sprites.get(id)`), else the hex-box fallback. Ring groups ($25) expand to
 * individual rings, drawing the ring SPRITE at each position when loaded (else
 * the circle markers). Selection is a box sized to the drawn frame's bounds.
 *
 * `previewPos`, if given, overrides the selected object's centre only (the live
 * position during an in-progress drag, before the store commit lands on mouseup).
 *
 * `animFor`, if given, is the animated-preview override (the play toggle): per
 * placement it returns the CURRENT anim-step sprite + the final flips (script
 * step flips already XORed with the placement's own), or null → the static
 * sprite draws as ever. Overlay-only: the doc and the sprite map are untouched;
 * a strip simply swaps which bitmap this pass blits.
 *
 * `occlusion`, if given, turns on occlusion-correct compositing (the default
 * view — it is what the game shows): high-priority map pixels re-drawn above
 * each drawn sprite with the hidden portion ghosted, and hi-pri sprite PIECES
 * re-raised on top afterwards. Only real sprite previews participate — the
 * hex-box / ghost-marker / ring-circle fallbacks are editor chrome, not game
 * pixels, and stay un-occluded. Composes with animation: whatever frame is
 * showing gets occluded, and that frame's own priBitmap is what re-raises.
 */
export function drawObjects(
  ctx: CanvasRenderingContext2D,
  d: LevelDoc,
  invZoom: number,
  sprites: Map<string, ObjectSprite>,
  zone: string,
  selectedIndex?: number | null,
  previewPos?: { x: number; y: number } | null,
  animFor?: (obj: LevelDoc['objects'][number]) => { sprite: ObjectSprite; xf: boolean; yf: boolean } | null,
  occlusion?: SpriteOcclusion | null,
): void {
  ctx.lineWidth = 1 * invZoom;
  ctx.font = `${8 * invZoom}px monospace`;
  ctx.textAlign = 'center';
  // Occlusion bookkeeping: rects the pass actually covered with map pixels,
  // and every drawn frame that carries a hi-pri piece bitmap (re-raised at the
  // end if any occlusion could have covered it — including a LATER object's
  // occlusion blit overlapping an earlier hi-pri piece).
  const occludedRects: WorldRect[] = [];
  const priRaises: { s: ObjectSprite; ax: number; ay: number; xf: boolean; yf: boolean; rect: WorldRect }[] = [];
  let occlMs = 0;
  const occlude = (s: ObjectSprite, rect: WorldRect, ax: number, ay: number, xf: boolean, yf: boolean): void => {
    if (s.priBitmap && s.priBitmap.width > 0) priRaises.push({ s, ax, ay, xf, yf, rect });
    if (!occlusion) return;
    const t0 = occlusion.onCost ? performance.now() : 0;
    if (occludeDrawnSprite(ctx, occlusion, rect, s, ax, ay, xf, yf)) occludedRects.push(rect);
    if (occlusion.onCost) occlMs += performance.now() - t0;
  };
  d.objects.forEach((obj, i) => {
    const isSel = selectedIndex != null && i === selectedIndex;
    const ox = isSel && previewPos ? previewPos.x : obj.x;
    const oy = isSel && previewPos ? previewPos.y : obj.y;
    // Detached-bitmap guard: an act switch publishes the new-epoch sprite map and
    // then closes the PRIOR epoch's ImageBitmaps (classicObjectArtStore.evictStale).
    // The main render effect has no dep array, so a render that committed with the
    // previous map can still flush its draw AFTER those bitmaps were closed — and
    // drawImage on a closed (detached) bitmap throws InvalidStateError, which would
    // escape the effect and unmount the whole viewport. A closed ImageBitmap reports
    // width/height === 0 (spec), so treat that as "no sprite" and fall back to the
    // hex box / ring markers; the fresh map's live bitmaps redraw on the next frame.
    const raw = sprites.get(objectArtKey(obj.id, zone, obj.subtype));
    const sprite = raw && raw.bitmap.width > 0 ? raw : null;
    // Animated-preview override (guarded against closed bitmaps exactly like
    // the static map above — a strip replaced mid-flush reports width 0).
    const animRaw = animFor?.(obj) ?? null;
    const anim = animRaw && animRaw.sprite.bitmap.width > 0 ? animRaw : null;
    // Selection box: sized to the drawn frame when a sprite is loaded, else the
    // legacy anchor box. Computed per-object so it tracks flips + frame size.
    let selRect = { left: ox - 11, top: oy - 11, width: 22, height: 22 };
    // What this pass actually blits: the animated step when playing, else the
    // static sprite with the placement's own flips.
    const drawn = anim ?? (sprite ? { sprite, xf: obj.xflip, yf: obj.yflip } : null);

    if (obj.id === RING_OBJ_ID) {
      const positions = ringGroupPositions(obj.subtype, ox, oy);
      if (drawn) {
        for (const p of positions) {
          drawSprite(ctx, drawn.sprite, p.x, p.y, drawn.xf, drawn.yf);
          occlude(drawn.sprite, objectFrameRect(drawn.sprite, p.x, p.y, drawn.xf, drawn.yf), p.x, p.y, drawn.xf, drawn.yf);
        }
        // Selection box spans the whole ring row/column footprint.
        const rects = positions.map((p) => objectFrameRect(drawn.sprite, p.x, p.y, drawn.xf, drawn.yf));
        const l = Math.min(...rects.map((r) => r.left));
        const t = Math.min(...rects.map((r) => r.top));
        const r2 = Math.max(...rects.map((r) => r.left + r.width));
        const b2 = Math.max(...rects.map((r) => r.top + r.height));
        selRect = { left: l, top: t, width: r2 - l, height: b2 - t };
      } else {
        ctx.fillStyle = RING_FILL;
        ctx.strokeStyle = RING_STROKE;
        for (const p of positions) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    } else if (drawn) {
      drawSprite(ctx, drawn.sprite, ox, oy, drawn.xf, drawn.yf);
      selRect = objectFrameRect(drawn.sprite, ox, oy, drawn.xf, drawn.yf);
      occlude(drawn.sprite, selRect, ox, oy, drawn.xf, drawn.yf);
    } else if (s1ObjectIsInvisible(obj.id)) {
      // Ghost marker: an invisible/trigger object has no real sprite. Draw a muted
      // dashed box labelled with the object NAME so it reads as a deliberate marker,
      // not an un-ported hex blob. Still selectable (the box is its hit region).
      const gw = GHOST_MARKER_BOUNDS.width, gh = GHOST_MARKER_BOUNDS.height;
      const gl = ox - GHOST_MARKER_BOUNDS.originX, gt = oy - GHOST_MARKER_BOUNDS.originY;
      ctx.fillStyle = GHOST_BOX_FILL;
      ctx.fillRect(gl, gt, gw, gh);
      ctx.strokeStyle = GHOST_BOX_STROKE;
      ctx.setLineDash([3 * invZoom, 2 * invZoom]);
      ctx.strokeRect(gl, gt, gw, gh);
      ctx.setLineDash([]);
      ctx.fillStyle = GHOST_LABEL;
      ctx.fillText(s1ObjectName(obj.id), ox, oy + 3 * invZoom);
      selRect = { left: gl, top: gt, width: gw, height: gh };
    } else {
      ctx.fillStyle = OBJECT_BOX_FILL;
      ctx.fillRect(ox - 8, oy - 8, 16, 16);
      ctx.strokeStyle = OBJECT_BOX_STROKE;
      ctx.strokeRect(ox - 8, oy - 8, 16, 16);
      ctx.fillStyle = OBJECT_LABEL;
      ctx.fillText(obj.id.toString(16).toUpperCase().padStart(2, '0'), ox, oy + 3 * invZoom);
    }
    if (isSel) {
      // Highlight box around the drawn frame, drawn last so it sits on top.
      ctx.strokeStyle = OBJECT_SELECTED_STROKE;
      ctx.lineWidth = 2 * invZoom;
      const pad = 2 * invZoom;
      ctx.strokeRect(selRect.left - pad, selRect.top - pad, selRect.width + pad * 2, selRect.height + pad * 2);
      ctx.lineWidth = 1 * invZoom;
    }
  });
  // Re-raise pass: HIGH-priority sprite pieces sit above even high plane tiles
  // (sprite-high is the VDP's topmost layer), so any drawn frame carrying a
  // priBitmap whose rect an occlusion blit could have covered gets its hi-pri
  // pixels blitted back at full opacity — over the map pixels AND the ghost.
  // Frames no occlusion touched are already correct (the full bitmap shows).
  if (occlusion && occludedRects.length > 0) {
    const t0 = occlusion.onCost ? performance.now() : 0;
    for (const r of priRaises) {
      if (!occludedRects.some((o) => rectsIntersect(o, r.rect))) continue;
      blitFlipped(ctx, r.s.priBitmap!, r.s.originX, r.s.originY, r.ax, r.ay, r.xf, r.yf);
    }
    if (occlusion.onCost) occlMs += performance.now() - t0;
  }
  if (occlusion?.onCost) occlusion.onCost(occlMs);
}

/**
 * Draw the player-spawn crosshair marker.
 *
 * `previewPos`, if given, overrides the spawn point's drawn position (the live
 * position during an in-progress start drag, before the store commit lands on
 * mouseup) — mirroring `drawObjects`' preview override.
 */
export function drawStart(
  ctx: CanvasRenderingContext2D,
  d: LevelDoc,
  invZoom: number,
  previewPos?: { x: number; y: number } | null,
): void {
  const { x, y } = previewPos ?? d.start;
  ctx.strokeStyle = START_MARKER;
  ctx.fillStyle = START_MARKER;
  ctx.lineWidth = 2 * invZoom;
  // Crosshair + ring so the spawn point reads distinctly from object markers.
  const r = 10;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r - 4, y); ctx.lineTo(x + r + 4, y);
  ctx.moveTo(x, y - r - 4); ctx.lineTo(x, y + r + 4);
  ctx.stroke();
  ctx.font = `${9 * invZoom}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('START', x + r + 6, y - r);
}

/**
 * Animated-art play overlay for one visible chunk (audit §2.2's cost verdict:
 * an overlay blit over just the animated cells, never chunk-cache
 * invalidation — the MZ magma redraws every 2 frames across 28 chunks, which
 * rules out re-rasterizing chunk canvases per tick).
 *
 * `cells` comes from animatedCellsForChunk (derived on the chunk's version
 * key); `getPlacementCanvas` returns the 16x16 canvas of that block placement
 * composed from the CURRENT animation-frame tiles (viewport-cached per
 * distinct block+flip per tick). Each cell is first filled with the canvas
 * void so a color-0 (transparent) pixel in the current frame shows the void
 * exactly as the base pass composes it — NOT the stale frame-0 art underneath
 * (SBZ's blank smoke state is entirely transparent; without the fill the
 * overlay could never blank anything).
 */
export function drawAnimatedArt(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  cells: readonly { cell: number; block: number; xf: boolean; yf: boolean }[],
  getPlacementCanvas: (block: number, xf: boolean, yf: boolean) => HTMLCanvasElement,
): void {
  const baseX = col * CHUNK_PX;
  const baseY = row * CHUNK_PX;
  ctx.fillStyle = CANVAS_VOID;
  for (const c of cells) {
    const x = baseX + (c.cell % 16) * 16;
    const y = baseY + ((c.cell / 16) | 0) * 16;
    ctx.fillRect(x, y, 16, 16);
    ctx.drawImage(getPlacementCanvas(c.block, c.xf, c.yf), x, y);
  }
}
