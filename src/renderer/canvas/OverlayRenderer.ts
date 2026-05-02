import type { ObjectPlacement, RingPlacement } from '../../core/model/s4-types';
import type { OverlayOptions } from '../state/viewStore';

/**
 * Renders overlay elements (objects, rings, grid, collision) on the canvas.
 */
export class OverlayRenderer {
  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    objects: ObjectPlacement[],
    rings: RingPlacement[],
    options: OverlayOptions,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
    collision?: Uint8Array,
  ): void {
    const { x: vpX, y: vpY, zoom } = viewport;

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-vpX, -vpY);

    if (options.showTileGrid) {
      this.drawTileGrid(ctx, viewport);
    }

    if (options.showBlockGrid) {
      this.drawBlockGrid(ctx, viewport);
    }

    if (options.showChunkGrid) {
      this.drawChunkGrid(ctx, viewport);
    }

    if (options.showCollision && collision) {
      this.drawCollisionOverlay(ctx, viewport, collision);
    }

    if (options.showRings) {
      this.drawRings(ctx, rings, viewport);
    }

    if (options.showObjects) {
      this.drawObjects(ctx, objects, viewport);
    }

    ctx.restore();
  }

  drawTileGrid(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
  ): void {
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

  drawBlockGrid(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
  ): void {
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

  private drawChunkGrid(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
  ): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;

    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.lineWidth = 2;

    // Section boundary at 2048px
    const startX = Math.floor(vpX / 2048) * 2048;
    const startY = Math.floor(vpY / 2048) * 2048;

    for (let x = startX; x < vpX + vpWidth; x += 2048) {
      ctx.beginPath();
      ctx.moveTo(x, vpY);
      ctx.lineTo(x, vpY + vpHeight);
      ctx.stroke();
    }

    for (let y = startY; y < vpY + vpHeight; y += 2048) {
      ctx.beginPath();
      ctx.moveTo(vpX, y);
      ctx.lineTo(vpX + vpWidth, y);
      ctx.stroke();
    }
  }

  drawCollisionOverlay(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
    collision: Uint8Array,
  ): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;
    const tilesWide = 256; // SECTION_TILES_WIDE

    const startCol = Math.max(0, Math.floor(vpX / 8));
    const startRow = Math.max(0, Math.floor(vpY / 8));
    const endCol = Math.min(tilesWide, Math.ceil((vpX + vpWidth) / 8));
    const endRow = Math.min(256, Math.ceil((vpY + vpHeight) / 8));

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const idx = row * tilesWide + col;
        const collType = collision[idx];
        if (collType === 0) continue;

        const color = COLLISION_COLORS[collType] ?? 'rgba(255, 0, 255, 0.3)';
        ctx.fillStyle = color;
        ctx.fillRect(col * 8, row * 8, 8, 8);
      }
    }
  }

  private drawObjects(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    objects: ObjectPlacement[],
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
  ): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;

    for (const obj of objects) {
      if (obj.x < vpX - 64 || obj.x > vpX + vpWidth + 64) continue;
      if (obj.y < vpY - 64 || obj.y > vpY + vpHeight + 64) continue;

      // Colored rectangle fallback
      ctx.fillStyle = 'rgba(255, 100, 100, 0.7)';
      ctx.fillRect(obj.x - 8, obj.y - 8, 16, 16);
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(obj.x - 8, obj.y - 8, 16, 16);

      ctx.fillStyle = '#ffffff';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      const label = obj.typeId;
      ctx.fillText(label, obj.x, obj.y + 3);
    }
  }

  private drawRings(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    rings: RingPlacement[],
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
  ): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpWidth = width / zoom;
    const vpHeight = height / zoom;

    ctx.fillStyle = 'rgba(255, 220, 0, 0.8)';
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 1;

    for (const ring of rings) {
      if (ring.x < vpX - 16 || ring.x > vpX + vpWidth + 16) continue;
      if (ring.y < vpY - 16 || ring.y > vpY + vpHeight + 16) continue;

      ctx.beginPath();
      ctx.arc(ring.x, ring.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

const COLLISION_COLORS: Record<number, string> = {
  1: 'rgba(0, 128, 255, 0.3)',   // solid
  2: 'rgba(255, 0, 0, 0.3)',     // hazard/spike
  3: 'rgba(0, 255, 0, 0.3)',     // platform (top-solid)
  4: 'rgba(255, 128, 0, 0.3)',   // slope
  5: 'rgba(128, 0, 255, 0.3)',   // water
  6: 'rgba(255, 255, 0, 0.3)',   // death
  7: 'rgba(0, 255, 255, 0.3)',   // special
};
