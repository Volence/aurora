// src/core/art/__tests__/pixel-edit-controller.test.ts
import { describe, it, expect } from 'vitest';
import { PixelEditController } from '../pixel-edit-controller';
import type { ToolConfig } from '../pixel-edit-controller';
import type { PixelBuffer } from '../pixel-ops';

// The controller is shared by classic hosts (4bpp, values 0..15) and the
// origination canvas (canvas-doc.ts, values 0..63) — see the range note on
// ToolConfig.color and on PixelBuffer in pixel-ops.ts. It must never assume
// the narrower 4bpp range: a stray `& 15` anywhere in here would silently
// flatten every canvas pixel to palette line 0. This test is the guard that
// turns that comment into something that actually fails if broken.

const buf = (w: number, h: number): PixelBuffer => ({ width: w, height: h, data: new Uint8Array(w * h) });

describe('PixelEditController: colour values above the 4bpp range', () => {
  it('a pencil stroke with a canvas-range colour (>15) survives untouched', () => {
    const cfg: ToolConfig = {
      tool: 'pencil', color: 47, mirror: null,
      ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false,
    };
    const c = new PixelEditController(cfg);
    c.begin(buf(4, 4), 1, 1, null);
    const r = c.end(1, 1);
    expect(r.buffer.data[1 * 4 + 1]).toBe(47);
  });

  // Pencil paints through the controller's OWN setPx and never reaches
  // pixel-ops at all, so the case above cannot guard pixel-ops.ts's write
  // sites. Fill/line/rect call floodFill/drawLine/drawRect directly, and
  // dither's value carrier (ditherValue) also lives in pixel-ops.ts — these
  // four are what actually back the "must not add an `& 15` in here" comment
  // on PixelBuffer.

  it('a fill gesture with a canvas-range colour reaches floodFill untouched', () => {
    const cfg: ToolConfig = {
      tool: 'fill', color: 47, mirror: null,
      ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false,
    };
    const c = new PixelEditController(cfg);
    const r = c.begin(buf(4, 4), 0, 0, null); // fill is instantaneous: begin returns the result
    expect(r).not.toBeNull();
    expect(r!.buffer.data[0]).toBe(47);
  });

  it('a line gesture with a canvas-range colour reaches drawLine untouched', () => {
    const cfg: ToolConfig = {
      tool: 'line', color: 47, mirror: null,
      ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false,
    };
    const c = new PixelEditController(cfg);
    c.begin(buf(4, 4), 0, 0, null);
    const r = c.end(3, 0);
    for (let x = 0; x <= 3; x++) expect(r.buffer.data[x]).toBe(47);
  });

  it('a rect gesture with a canvas-range colour reaches drawRect untouched', () => {
    const cfg: ToolConfig = {
      tool: 'rect', color: 47, mirror: null,
      ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false,
    };
    const c = new PixelEditController(cfg);
    c.begin(buf(4, 4), 0, 0, null);
    const r = c.end(2, 2);
    for (let y = 0; y <= 2; y++) for (let x = 0; x <= 2; x++) expect(r.buffer.data[y * 4 + x]).toBe(47);
  });

  it('a dither stroke carries both canvas-range colours through ditherValue untouched', () => {
    // Also backs the ditherSecondary comment: that field has the same
    // documented-but-unguarded status color had before this suite existed.
    const cfg: ToolConfig = {
      tool: 'dither', color: 47, mirror: null,
      ditherPattern: 'checker', ditherSecondary: 33, pixelPerfect: false,
    };
    const c = new PixelEditController(cfg);
    c.begin(buf(4, 4), 0, 0, null); // (0+0)%2===0 -> primary colour
    c.move(1, 0);                  // (1+0)%2!==0 -> secondary colour
    const r = c.end(1, 0);
    expect(r.buffer.data[0]).toBe(47);
    expect(r.buffer.data[1]).toBe(33);
  });
});
