import type { ObjectPlacement, RingPlacement, Section } from '../../core/model/s4-types';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE } from '../../core/model/s4-types';
import type { OverlayOptions } from '../state/viewStore';
import type { ObjectPreview } from '../state/projectStore';
import {
  GRID_TILE, GRID_BLOCK, GRID_SECTION,
  COLLISION_FILL_ALL, COLLISION_FILL_TOP, COLLISION_FILL_SIDES, COLLISION_FILL_NONE,
  COLLISION_SURFACE_LINE, COLLISION_ANGLE_TICK, COLLISION_ANGLE_CASING,
  COLLISION_UNKNOWN, COLLISION_FALLBACK, COLLISION_DIFF,
  OBJECT_BOX_FILL, OBJECT_BOX_STROKE, OBJECT_LABEL, RING_FILL, RING_STROKE,
} from './canvas-colors';
import { fitLabelInContext, labelBudget } from './label-fit';
import type { CollisionProfileSet, Solidity } from '../../core/collision/collision-model';
import { columnSolidRun } from '../../core/collision/collision-render';
import { angleMark, drawAngleMark, MIN_CELL_PX_FOR_MARK } from '../../core/collision/collision-angle-mark';
import type { MarkDrawCtx } from '../../core/collision/collision-angle-mark';
import { resolveCell, resolvePlaneWords, SECTION_PLANE_WORDS } from '../../core/collision/collision-cell-resolve';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface SectionOverlayInfo {
  section: Section;
  offsetX: number;
  offsetY: number;
}

// ---- the generic "no sprite preview" object marker (ROADMAP §5.1 item 17) ----
// One set of numbers for the box AND for the label's budget, so the two cannot
// drift apart the way they did when the box was a literal 16 in `fillRect` and
// the label was never measured against anything at all.
/** Side of the marker box, in WORLD pixels, centred on the placement point. */
export const OBJECT_BOX_SIZE = 16;
/** `ctx.lineWidth` for the marker's border, world px — painted centred on the path. */
export const OBJECT_BOX_STROKE_WIDTH = 1;
/** Label size in SCREEN pixels — see the note at the draw site for why. */
export const OBJECT_LABEL_FONT_PX = 8;
/** Baseline drop from the box centre, in screen px (the pre-existing `+3`). */
export const OBJECT_LABEL_BASELINE_PX = 3;

function solidityFill(s: Solidity): string {
  switch (s) {
    case 'all': return COLLISION_FILL_ALL;
    case 'top': return COLLISION_FILL_TOP;
    case 'sides-bottom': return COLLISION_FILL_SIDES;
    default: return COLLISION_FILL_NONE;
  }
}

export class OverlayRenderer {
  render(
    ctx: Ctx,
    sections: SectionOverlayInfo[],
    options: OverlayOptions,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
    objectSprites?: Map<string, ObjectPreview>,
    collisionProfiles?: CollisionProfileSet | null,
  ): void {
    const { x: vpX, y: vpY, zoom } = viewport;

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-vpX, -vpY);

    if (options.showTileGrid) this.drawTileGrid(ctx, viewport);
    if (options.showBlockGrid) this.drawBlockGrid(ctx, viewport);
    if (options.showChunkGrid) this.drawSectionGrid(ctx, viewport);

    for (const info of sections) {
      if (options.showCollision || options.showCollisionPathB) {
        // Two independent planes (read-only engine attr indices from strips):
        // "Collision" = path A, "Collision Path B" = path B. When BOTH are on,
        // render path A as the base and outline the cells where B differs, so the
        // dual-layer/loop regions stand out instead of the planes hiding each other.
        // Resolve each plane to a uniform array of 16-bit packed cell words
        // (editable plane verbatim, else the engine baseline packed to words).
        // The bound is the SECTION GEOMETRY, not whatever length the stored
        // arrays happen to have: drawCollisionOverlay below indexes
        // (cr*2)*SECTION_TILES_WIDE + cc*2 over the full cell grid regardless.
        // Deriving it from `collisionEdit?.length ?? engineCollision?.length`
        // let a short plane A set the bound for plane B as well, and left a
        // short plane B to be read past its end (ROADMAP §5.1 item 10).
        const len = SECTION_PLANE_WORDS;
        const a = resolvePlaneWords(info.section.collisionEdit, info.section.engineCollision, len);
        const b = (info.section.collisionEditB || info.section.engineCollisionB)
          ? resolvePlaneWords(info.section.collisionEditB, info.section.engineCollisionB, len)
          : null;
        if (options.showCollision && options.showCollisionPathB && b) {
          this.drawCollisionOverlay(ctx, viewport, a, info.offsetX, info.offsetY, collisionProfiles ?? null, options.showCollisionAngles, b);
        } else {
          const coll = (options.showCollisionPathB ? (b ?? a) : a);
          this.drawCollisionOverlay(ctx, viewport, coll, info.offsetX, info.offsetY, collisionProfiles ?? null, options.showCollisionAngles, null);
        }
      }
      if (options.showRings) {
        this.drawRings(ctx, info.section.rings, viewport, info.offsetX, info.offsetY);
      }
      if (options.showObjects) {
        this.drawObjects(ctx, info.section.objects, viewport, info.offsetX, info.offsetY, objectSprites);
      }
    }

    ctx.restore();
  }

  drawTileGrid(ctx: Ctx, viewport: { x: number; y: number; width: number; height: number; zoom: number }): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;

    ctx.strokeStyle = GRID_TILE;
    ctx.lineWidth = 0.5;

    const startX = Math.floor(vpX / 8) * 8;
    const startY = Math.floor(vpY / 8) * 8;

    for (let x = startX; x < vpX + vpWidth; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, vpY);
      ctx.lineTo(x, vpY + vpHeight);
      ctx.stroke();
    }

    for (let y = startY; y < vpY + vpHeight; y += 8) {
      ctx.beginPath();
      ctx.moveTo(vpX, y);
      ctx.lineTo(vpX + vpWidth, y);
      ctx.stroke();
    }
  }

  drawBlockGrid(ctx: Ctx, viewport: { x: number; y: number; width: number; height: number; zoom: number }): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;

    ctx.strokeStyle = GRID_BLOCK;
    ctx.lineWidth = 1;

    const startX = Math.floor(vpX / 128) * 128;
    const startY = Math.floor(vpY / 128) * 128;

    for (let x = startX; x < vpX + vpWidth; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, vpY);
      ctx.lineTo(x, vpY + vpHeight);
      ctx.stroke();
    }

    for (let y = startY; y < vpY + vpHeight; y += 128) {
      ctx.beginPath();
      ctx.moveTo(vpX, y);
      ctx.lineTo(vpX + vpWidth, y);
      ctx.stroke();
    }
  }

  private drawSectionGrid(ctx: Ctx, viewport: { x: number; y: number; width: number; height: number; zoom: number }): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;

    ctx.strokeStyle = GRID_SECTION;
    ctx.lineWidth = 2;

    const startX = Math.floor(vpX / SECTION_PIXEL_SIZE) * SECTION_PIXEL_SIZE;
    const startY = Math.floor(vpY / SECTION_PIXEL_SIZE) * SECTION_PIXEL_SIZE;

    for (let x = startX; x < vpX + vpWidth; x += SECTION_PIXEL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, vpY);
      ctx.lineTo(x, vpY + vpHeight);
      ctx.stroke();
    }

    for (let y = startY; y < vpY + vpHeight; y += SECTION_PIXEL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(vpX, y);
      ctx.lineTo(vpX + vpWidth, y);
      ctx.stroke();
    }
  }

  drawCollisionOverlay(
    ctx: Ctx,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
    collision: Uint16Array,
    offsetX: number,
    offsetY: number,
    profiles: CollisionProfileSet | null,
    showAngles: boolean,
    diffWith: Uint16Array | null,
  ): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpW = width / zoom, vpH = height / zoom;
    const localVpX = vpX - offsetX, localVpY = vpY - offsetY;
    // 16px cells = 128×128 per section (256 tiles / 2). cellsW bounds the column
    // loop, cellsH the row loop (a section is square today, but keep them distinct).
    const cellsW = SECTION_TILES_WIDE / 2, cellsH = SECTION_TILES_HIGH / 2;
    // How many SCREEN px one 16px collision cell occupies — the quantity the
    // angle mark's density gate is stated in (see MIN_CELL_PX_FOR_MARK).
    const cellScreenPx = 16 * zoom;
    const startCol = Math.max(0, Math.floor(localVpX / 16));
    const startRow = Math.max(0, Math.floor(localVpY / 16));
    const endCol = Math.min(cellsW, Math.ceil((localVpX + vpW) / 16));
    const endRow = Math.min(cellsH, Math.ceil((localVpY + vpH) / 16));

    for (let cr = startRow; cr < endRow; cr++) {
      for (let cc = startCol; cc < endCol; cc++) {
        // Sample the cell's top-left tile (both tiles of a cell share the word).
        const cellIdx = (cr * 2) * SECTION_TILES_WIDE + (cc * 2);
        const word = collision[cellIdx];
        const rc = resolveCell(profiles, word);
        // Dual-layer diff: does the other plane differ at this cell? (Computed
        // even for air cells, so a B-only-solid cell still gets highlighted.)
        const differs = diffWith !== null && diffWith[cellIdx] !== word;
        const cx = cc * 16 + offsetX, cy = cr * 16 + offsetY;

        if (!rc.air) {
          if (!profiles) { // no tables: flat fallback fill
            ctx.fillStyle = COLLISION_FALLBACK;
            ctx.fillRect(cx, cy, 16, 16);
          } else if (!rc.known) { // stale / out-of-range
            ctx.fillStyle = COLLISION_UNKNOWN;
            ctx.fillRect(cx, cy, 16, 16);
          } else {
            const p = rc.profile!;
            ctx.fillStyle = solidityFill(p.solidity);
            // Per-column silhouette.
            for (let c = 0; c < 16; c++) {
              const run = columnSolidRun(p.heights[c]);
              if (!run) continue;
              ctx.fillRect(cx + c, cy + run.y, 1, run.h);
            }
            // Crisp line along the collidable surface — top of a floor (h>0) or
            // the underside of a hanging ceiling (h<0).
            ctx.strokeStyle = COLLISION_SURFACE_LINE;
            ctx.lineWidth = 1 / zoom;
            for (let c = 0; c < 16; c++) {
              const h = p.heights[c];
              const run = columnSolidRun(h);
              if (!run) continue;
              const surfaceY = h >= 0 ? run.y : run.y + run.h;
              ctx.beginPath();
              ctx.moveTo(cx + c, cy + surfaceY);
              ctx.lineTo(cx + c + 1, cy + surfaceY);
              ctx.stroke();
            }
            // The angle mark. THIS BLOCK USED TO BE THE BUG: it drew a centred,
            // symmetric segment at `(cos a, -sin a)` — vertically MIRRORED
            // against both classic's overlay and the picker's thumbnails, so on
            // the one surface an author actually paints on, the tick lay across
            // the slope instead of along it. It is now the shared mark.
            //
            // ZOOM: the mark's LENGTHS are cell-local (world) px, because it
            // annotates a 16px cell and must stay proportional to it; the
            // stroke WIDTHS are `/zoom`, so a hairline stays a hairline. Below
            // MIN_CELL_PX_FOR_MARK screen px per cell the mark is skipped
            // outright — that density, not the mark itself, is what made the
            // old overlay read as scattered noise when zoomed out. The
            // silhouette and surface line still carry the shape down there.
            if (showAngles && cellScreenPx >= MIN_CELL_PX_FOR_MARK) {
              const mark = angleMark(p);
              if (mark) {
                drawAngleMark(ctx as unknown as MarkDrawCtx, cx, cy, 16, mark, {
                  color: COLLISION_ANGLE_TICK,
                  casing: COLLISION_ANGLE_CASING,
                  coreWidth: 1.25 / zoom,
                  casingWidth: 3 / zoom,
                });
              }
            }
          }
        }

        // Outline cells where the two planes disagree (dual-layer regions).
        if (differs) {
          const inset = 0.75 / zoom;
          ctx.strokeStyle = COLLISION_DIFF;
          ctx.lineWidth = 1.5 / zoom;
          ctx.strokeRect(cx + inset, cy + inset, 16 - 2 * inset, 16 - 2 * inset);
        }
      }
    }
  }

  drawObjects(
    ctx: Ctx,
    objects: ObjectPlacement[],
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
    offsetX: number,
    offsetY: number,
    objectSprites?: Map<string, ObjectPreview>,
  ): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;

    for (const obj of objects) {
      const wx = obj.x + offsetX;
      const wy = obj.y + offsetY;
      if (wx < vpX - 64 || wx > vpX + vpWidth + 64) continue;
      if (wy < vpY - 64 || wy > vpY + vpHeight + 64) continue;

      const preview = objectSprites?.get(obj.typeId);
      if (preview) {
        // Sprite preview, origin aligned to the placement point.
        ctx.imageSmoothingEnabled = false;
        if (obj.xflip || obj.yflip) {
          // Mirror about the placement point, so the origin stays put and the
          // map shows what the OEF_XFLIP/OEF_YFLIP bits will do on hardware.
          const sx = obj.xflip ? -1 : 1;
          const sy = obj.yflip ? -1 : 1;
          ctx.save();
          ctx.translate(wx, wy);
          ctx.scale(sx, sy);
          ctx.drawImage(preview.bitmap, -preview.originX, -preview.originY);
          ctx.restore();
        } else {
          ctx.drawImage(preview.bitmap, wx - preview.originX, wy - preview.originY);
        }
        continue;
      }

      const half = OBJECT_BOX_SIZE / 2;
      ctx.fillStyle = OBJECT_BOX_FILL;
      ctx.fillRect(wx - half, wy - half, OBJECT_BOX_SIZE, OBJECT_BOX_SIZE);
      ctx.strokeStyle = OBJECT_BOX_STROKE;
      ctx.lineWidth = OBJECT_BOX_STROKE_WIDTH;
      ctx.strokeRect(wx - half, wy - half, OBJECT_BOX_SIZE, OBJECT_BOX_SIZE);

      // The label is sized in SCREEN pixels — `8 * invZoom` world px — which is
      // the convention `classic-overlays.drawObjects` has always used. Under the
      // old world-space `8px` the fit was zoom-INVARIANT: the box and the glyphs
      // scaled together, so a typeId too wide for its box at zoom 1 was too wide
      // at every zoom and no amount of zooming could ever reveal it. Screen-
      // constant turns zoom into the affordance: a 16px box holds 3 cells at
      // zoom 1 (=> `s…` for "solid"), 7 at zoom 2 — where the whole id reads.
      // At zoom 1, the default and the configuration item 15 measured, the drawn
      // glyph size is exactly what it was.
      const invZoom = 1 / zoom;
      ctx.fillStyle = OBJECT_LABEL;
      ctx.font = `${OBJECT_LABEL_FONT_PX * invZoom}px monospace`;
      ctx.textAlign = 'center';
      // MEASURED against the box, in the box's own world units (the font is set
      // in world units too, so `measureText` answers in the same space). An
      // empty fit means nothing legible fits and the box goes unlabelled — never
      // a bare ellipsis, never the half glyph this item was booked for.
      const fit = fitLabelInContext(ctx, obj.typeId,
        labelBudget(OBJECT_BOX_SIZE, OBJECT_BOX_STROKE_WIDTH));
      if (fit.text) ctx.fillText(fit.text, wx, wy + OBJECT_LABEL_BASELINE_PX * invZoom);
    }
  }

  drawRings(
    ctx: Ctx,
    rings: RingPlacement[],
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
    offsetX: number,
    offsetY: number,
  ): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;

    ctx.fillStyle = RING_FILL;
    ctx.strokeStyle = RING_STROKE;
    ctx.lineWidth = 1;

    for (const ring of rings) {
      const wx = ring.x + offsetX;
      const wy = ring.y + offsetY;
      if (wx < vpX - 16 || wx > vpX + vpWidth + 16) continue;
      if (wy < vpY - 16 || wy > vpY + vpHeight + 16) continue;

      ctx.beginPath();
      ctx.arc(wx, wy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
