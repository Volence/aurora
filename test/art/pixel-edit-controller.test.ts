import { describe, it, expect } from 'vitest';
import { PixelEditController } from '../../src/core/art/pixel-edit-controller';
import { createBuffer } from '../../src/core/art/pixel-ops';
import type { ToolConfig } from '../../src/core/art/pixel-edit-controller';

const cfg = (over: Partial<ToolConfig> = {}): ToolConfig => ({
  tool: 'pencil', color: 5, mirror: null, ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false, ...over,
});
function buf(w: number, h: number, fill = 0) { const b = createBuffer(w, h); b.data.fill(fill); return b; }

describe('PixelEditController — instantaneous tools', () => {
  it('eyedropper begin() returns the pixel under the cursor as pick, no gesture', () => {
    const b = buf(4, 4); b.data[2 * 4 + 1] = 9;
    const c = new PixelEditController(cfg({ tool: 'eyedropper' }));
    const r = c.begin(b, 1, 2, null);
    expect(r).not.toBeNull();
    expect(r!.pick).toBe(9);
    expect(c.isActive).toBe(false);
  });
  it('fill begin() floods and returns the new buffer, no gesture', () => {
    const b = buf(3, 3);
    const c = new PixelEditController(cfg({ tool: 'fill', color: 7 }));
    const r = c.begin(b, 0, 0, null);
    expect(Array.from(r!.buffer.data)).toEqual(new Array(9).fill(7));
    expect(c.isActive).toBe(false);
  });
});

describe('PixelEditController — gesture start (for host commit routing)', () => {
  it('eyedropper/fill report the click position as result.start', () => {
    const e = new PixelEditController(cfg({ tool: 'eyedropper' }));
    expect(e.begin(buf(8, 8), 3, 5, null)!.start).toEqual({ x: 3, y: 5 });
    const f = new PixelEditController(cfg({ tool: 'fill' }));
    expect(f.begin(buf(8, 8), 6, 2, null)!.start).toEqual({ x: 6, y: 2 });
  });
  it('a stroke reports its pointer-down position as result.start', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil' }));
    c.begin(buf(16, 16), 9, 11, null); c.move(12, 11);
    expect(c.end(12, 11).start).toEqual({ x: 9, y: 11 });
  });
  it('line/rect report their anchor as result.start', () => {
    const c = new PixelEditController(cfg({ tool: 'line' }));
    c.begin(buf(16, 16), 2, 4, null);
    expect(c.end(10, 10).start).toEqual({ x: 2, y: 4 });
  });
});

describe('PixelEditController — strokes', () => {
  it('pencil single point sets the pixel', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil', color: 3 }));
    expect(c.begin(buf(4, 4), 1, 1, null)).toBeNull();
    expect(c.isActive).toBe(true);
    const r = c.end(1, 1);
    expect(r.buffer.data[1 * 4 + 1]).toBe(3);
    expect(c.isActive).toBe(false);
  });
  it('pencil drag interpolates a connected diagonal (Bresenham)', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil', color: 1 }));
    c.begin(buf(5, 5), 0, 0, null); c.move(4, 4); const r = c.end(4, 4);
    for (let i = 0; i < 5; i++) expect(r.buffer.data[i * 5 + i]).toBe(1);
  });
  it('eraser paints 0', () => {
    const c = new PixelEditController(cfg({ tool: 'eraser' }));
    c.begin(buf(3, 3, 8), 1, 1, null); const r = c.end(1, 1);
    expect(r.buffer.data[4]).toBe(0);
  });
  it('mirror both reflects each stroke point', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil', color: 2, mirror: 'both' }));
    c.begin(buf(4, 4), 0, 0, null); const r = c.end(0, 0);
    expect(r.buffer.data[0]).toBe(2);
    expect(r.buffer.data[3]).toBe(2);
    expect(r.buffer.data[12]).toBe(2);
    expect(r.buffer.data[15]).toBe(2);
  });
  it('pixel-perfect drops the L-corner middle pixel', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil', color: 1, pixelPerfect: true }));
    c.begin(buf(4, 4), 0, 0, null); c.move(1, 0); c.move(1, 1); const r = c.end(1, 1);
    expect(r.buffer.data[0]).toBe(1);
    expect(r.buffer.data[1]).toBe(0);
    expect(r.buffer.data[5]).toBe(1);
  });
  it('dither lays a checker of color/secondary', () => {
    const c = new PixelEditController(cfg({ tool: 'dither', color: 6, ditherSecondary: 2, ditherPattern: 'checker' }));
    c.begin(buf(2, 2), 0, 0, null); c.move(1, 0); c.move(1, 1); c.move(0, 1); const r = c.end(0, 1);
    expect(r.buffer.data[0]).toBe(6);
    expect(r.buffer.data[1]).toBe(2);
  });
  it('working buffer reflects the in-progress stroke', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil', color: 4 }));
    c.begin(buf(3, 3), 0, 0, null);
    expect(c.workingBuffer()!.data[0]).toBe(4);
  });
});

describe('PixelEditController — shapes', () => {
  it('line draws between endpoints on end()', () => {
    const c = new PixelEditController(cfg({ tool: 'line', color: 7 }));
    c.begin(buf(5, 5), 0, 0, null); c.move(4, 0); const r = c.end(4, 0);
    for (let x = 0; x < 5; x++) expect(r.buffer.data[x]).toBe(7);
  });
  it('rect is filled', () => {
    const c = new PixelEditController(cfg({ tool: 'rect', color: 3 }));
    c.begin(buf(4, 4), 1, 1, null); const r = c.end(2, 2);
    expect(r.buffer.data[1 * 4 + 1]).toBe(3);
    expect(r.buffer.data[2 * 4 + 2]).toBe(3);
    expect(r.buffer.data[0]).toBe(0);
  });
  it('line preview is reported during the gesture', () => {
    const c = new PixelEditController(cfg({ tool: 'line', color: 1 }));
    c.begin(buf(5, 5), 0, 0, null); c.move(3, 1);
    expect(c.preview()).toEqual({ kind: 'line', x0: 0, y0: 0, x1: 3, y1: 1 });
  });
  it('mirror reflects line endpoints', () => {
    const c = new PixelEditController(cfg({ tool: 'line', color: 9, mirror: 'h' }));
    c.begin(buf(5, 1), 0, 0, null); const r = c.end(1, 0);
    expect(r.buffer.data[0]).toBe(9); // (0,0)
    expect(r.buffer.data[4]).toBe(9); // mirrored (4,0)
  });
});

describe('PixelEditController — select + move', () => {
  it('marquee outside any selection returns a normalized selection', () => {
    const c = new PixelEditController(cfg({ tool: 'select' }));
    c.begin(buf(8, 8), 1, 1, null); c.move(4, 3); const r = c.end(4, 3);
    expect(r.selection).toEqual({ x: 1, y: 1, w: 4, h: 3 });
  });
  it('a <2px marquee clears the selection', () => {
    const c = new PixelEditController(cfg({ tool: 'select' }));
    c.begin(buf(8, 8), 2, 2, null); const r = c.end(2, 2);
    expect(r.selection).toBeNull();
  });
  it('beginning inside a selection moves its pixels', () => {
    const b = buf(8, 8);
    b.data[2 * 8 + 2] = 5; // a pixel inside the selection region (2,2)-(3,3)
    const sel = { x: 2, y: 2, w: 2, h: 2 };
    const c = new PixelEditController(cfg({ tool: 'select' }));
    c.begin(b, 2, 2, sel);          // grab inside selection
    c.move(4, 2);                    // drag +2 in x
    const r = c.end(4, 2);
    expect(r.buffer.data[2 * 8 + 2]).toBe(0); // original cleared
    expect(r.buffer.data[2 * 8 + 4]).toBe(5); // moved +2
    expect(r.selection).toEqual({ x: 4, y: 2, w: 2, h: 2 });
  });
});
