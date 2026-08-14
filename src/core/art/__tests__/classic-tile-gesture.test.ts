import { describe, it, expect } from 'vitest';
import { PixelEditController } from '../pixel-edit-controller';
import type { ToolConfig } from '../pixel-edit-controller';
import type { PixelBuffer } from '../pixel-ops';
import { resolveTileGesture } from '../classic-tile-gesture';
import { tileToBuffer } from '../classic-tile-buffer';

// These cases drive the REAL controller rather than hand-built GestureResults:
// the rules in classic-tile-gesture.ts are all claims about what the controller
// actually returns, and a fixture would let the controller drift out from under
// them silently. Nothing here imports from src/renderer.

const cfg = (tool: ToolConfig['tool'], color = 3): ToolConfig => ({
  tool, color, mirror: null, ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false,
});

/** An 8x8 buffer, optionally seeded by a per-pixel function. */
const buf8 = (f: (x: number, y: number) => number = () => 0): PixelBuffer => {
  const data = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) data[y * 8 + x] = f(x, y);
  return { width: 8, height: 8, data };
};

describe('resolveTileGesture — the marquee answer (rule 1)', () => {
  it('leaves the marquee alone for a pencil stroke (the key is absent, not null)', () => {
    const before = buf8();
    const c = new PixelEditController(cfg('pencil'));
    c.begin(before, 1, 1, { x: 0, y: 0, w: 4, h: 4 });
    const r = c.end(2, 1);
    expect(r.selection).toBeUndefined();               // pins the controller's half of rule 1
    expect(resolveTileGesture(before, r, false).applySelection).toBe(false);
  });

  it('reports a CLEARED marquee (a click-sized select drag returns null)', () => {
    const before = buf8();
    const c = new PixelEditController(cfg('select'));
    c.begin(before, 3, 3, null);
    const r = c.end(3, 3);                              // 1x1 → "cleared", not a selection
    expect(r.selection).toBeNull();
    const out = resolveTileGesture(before, r, false);
    expect(out.applySelection).toBe(true);
    expect(out.selection).toBeNull();
  });

  it('reports a new marquee for a real select drag', () => {
    const before = buf8();
    const c = new PixelEditController(cfg('select'));
    c.begin(before, 1, 2, null);
    const out = resolveTileGesture(before, c.end(4, 5), false);
    expect(out.applySelection).toBe(true);
    expect(out.selection).toEqual({ x: 1, y: 2, w: 4, h: 4 });
  });
});

describe('resolveTileGesture — locked tiles (rule 2)', () => {
  it('refuses a fill on a locked tile', () => {
    const before = buf8();
    const c = new PixelEditController(cfg('fill'));
    const r = c.begin(before, 0, 0, null)!;             // fill resolves immediately
    expect(r).not.toBeNull();
    expect(resolveTileGesture(before, r, true).bytes).toBeNull();
    expect(resolveTileGesture(before, r, false).bytes).not.toBeNull();
  });

  it('refuses a pencil stroke on a locked tile', () => {
    const before = buf8();
    const c = new PixelEditController(cfg('pencil'));
    c.begin(before, 0, 0, null);
    expect(resolveTileGesture(before, c.end(3, 0), true).bytes).toBeNull();
  });

  // The load-bearing case: a select MOVE carries both a marquee and moved pixels.
  // On a locked tile the marquee must land and only the pixels are refused.
  it('applies the moved marquee on a locked tile while refusing the moved pixels', () => {
    const before = buf8((x, y) => (x < 2 && y < 2 ? 5 : 0));
    const sel = { x: 0, y: 0, w: 2, h: 2 };
    const c = new PixelEditController(cfg('select'));
    c.begin(before, 0, 0, sel);                          // grab inside the selection
    const r = c.end(4, 4);                               // drag it +4,+4
    const locked = resolveTileGesture(before, r, true);
    expect(locked.applySelection).toBe(true);
    expect(locked.selection).toEqual({ x: 4, y: 4, w: 2, h: 2 });
    expect(locked.bytes).toBeNull();
    // unlocked, the same gesture is a real write
    expect(resolveTileGesture(before, r, false).bytes).not.toBeNull();
  });
});

describe('resolveTileGesture — no change, no undo entry (rule 3)', () => {
  it('commits nothing when a stroke repaints the colour already there', () => {
    const before = buf8(() => 3);
    const c = new PixelEditController(cfg('pencil', 3));
    c.begin(before, 2, 2, null);
    expect(resolveTileGesture(before, c.end(5, 2), false).bytes).toBeNull();
  });

  it('commits nothing for a plain select drag (its buffer is the untouched snapshot)', () => {
    const before = buf8((x) => x & 7);
    const c = new PixelEditController(cfg('select'));
    c.begin(before, 0, 0, null);
    const out = resolveTileGesture(before, c.end(6, 6), false);
    expect(out.selection).toEqual({ x: 0, y: 0, w: 7, h: 7 });
    expect(out.bytes).toBeNull();                        // a marquee is not an edit
  });

  it('commits nothing when a fill seeds on the colour already there', () => {
    const before = buf8(() => 3);
    const c = new PixelEditController(cfg('fill', 3));
    expect(resolveTileGesture(before, c.begin(before, 0, 0, null)!, false).bytes).toBeNull();
  });
});

describe('resolveTileGesture — the bytes it hands the command', () => {
  it('returns 32 bytes that decode back to the drawn pixels', () => {
    const before = buf8();
    const c = new PixelEditController(cfg('pencil', 9));
    c.begin(before, 0, 0, null);
    c.move(2, 0);                                        // the drag the viewport would report
    const bytes = resolveTileGesture(before, c.end(2, 0), false).bytes!;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);                       // classicEditTiles rejects any other length
    const back = tileToBuffer(bytes, 0);
    expect(Array.from(back.data.slice(0, 4))).toEqual([9, 9, 9, 0]);
  });
});
