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

describe('PixelEditController — colour values above the 4bpp range', () => {
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
});
