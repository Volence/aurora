import type { ObjectPlacement, RingPlacement, Section } from '../../core/model/s4-types';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE } from '../../core/model/s4-types';
import type { OverlayOptions } from '../state/viewStore';
import type { ObjectPreview } from '../state/projectStore';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface SectionOverlayInfo {
  section: Section;
  offsetX: number;
  offsetY: number;
}

export class OverlayRenderer {
  render(
    ctx: Ctx,
    sections: SectionOverlayInfo[],
    options: OverlayOptions,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
    objectSprites?: Map<string, ObjectPreview>,
  ): void {
    const { x: vpX, y: vpY, zoom } = viewport;

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-vpX, -vpY);

    if (options.showTileGrid) this.drawTileGrid(ctx, viewport);
    if (options.showBlockGrid) this.drawBlockGrid(ctx, viewport);
    if (options.showChunkGrid) this.drawSectionGrid(ctx, viewport);

    for (const info of sections) {
      if (options.showCollision) {
        this.drawCollisionOverlay(ctx, viewport, info.section.tileGrid.collision, info.offsetX, info.offsetY);
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

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
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

    ctx.strokeStyle = 'rgba(0, 200, 100, 0.25)';
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

    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
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
    collision: Uint8Array,
    offsetX: number,
    offsetY: number,
  ): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;

    const localVpX = vpX - offsetX;
    const localVpY = vpY - offsetY;

    const startCol = Math.max(0, Math.floor(localVpX / 8));
    const startRow = Math.max(0, Math.floor(localVpY / 8));
    const endCol = Math.min(SECTION_TILES_WIDE, Math.ceil((localVpX + vpWidth) / 8));
    const endRow = Math.min(SECTION_TILES_HIGH, Math.ceil((localVpY + vpHeight) / 8));

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const idx = row * SECTION_TILES_WIDE + col;
        const collType = collision[idx];
        if (collType === 0) continue;

        const color = COLLISION_COLORS[collType] ?? 'rgba(255, 0, 255, 0.3)';
        ctx.fillStyle = color;
        ctx.fillRect(col * 8 + offsetX, row * 8 + offsetY, 8, 8);
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
        ctx.drawImage(preview.bitmap, wx - preview.originX, wy - preview.originY);
        continue;
      }

      ctx.fillStyle = 'rgba(255, 100, 100, 0.7)';
      ctx.fillRect(wx - 8, wy - 8, 16, 16);
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(wx - 8, wy - 8, 16, 16);

      ctx.fillStyle = '#ffffff';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(obj.typeId, wx, wy + 3);
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

    ctx.fillStyle = 'rgba(255, 220, 0, 0.8)';
    ctx.strokeStyle = '#ffaa00';
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

const COLLISION_COLORS: Record<number, string> = {
  1: 'rgba(0, 128, 255, 0.3)',
  2: 'rgba(255, 0, 0, 0.3)',
  3: 'rgba(0, 255, 0, 0.3)',
  4: 'rgba(255, 128, 0, 0.3)',
  5: 'rgba(128, 0, 255, 0.3)',
  6: 'rgba(255, 255, 0, 0.3)',
  7: 'rgba(0, 255, 255, 0.3)',
};
