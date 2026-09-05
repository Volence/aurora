import { describe, it, expect } from 'vitest';
import type { PixelBuffer } from '../pixel-ops';
import { resolveTileTransform, isTileTransform } from '../classic-tile-transform';
import type { TileTransform } from '../classic-tile-transform';
import { tileToBuffer } from '../classic-tile-buffer';

// Every assertion here goes through the real `bufferToTileBytes` round trip
// (`decode(resolve(...))`) rather than inspecting an intermediate buffer: the
// bytes are what `classicEditTiles` receives, and a transform that is correct in
// PixelBuffer space but mispacked into 4bpp nibbles is still a broken transform.

/** An 8x8 buffer seeded by a per-pixel function. */
const buf8 = (f: (x: number, y: number) => number = () => 0): PixelBuffer => {
  const data = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) data[y * 8 + x] = f(x, y);
  return { width: 8, height: 8, data };
};

/** The 8x8 pixels the committed bytes decode back to. */
const decode = (bytes: Uint8Array): number[] => Array.from(tileToBuffer(bytes, 0).data);

/** Run a transform and return the resulting pixels (fails loudly if refused). */
function pixelsAfter(
  before: PixelBuffer, action: TileTransform,
  selection: { x: number; y: number; w: number; h: number } | null = null,
): number[] {
  const out = resolveTileTransform(before, action, selection, false);
  expect(out.bytes, `'${action}' committed nothing`).not.toBeNull();
  expect(out.bytes!.length).toBe(32);       // classicEditTiles rejects any other length
  return decode(out.bytes!);
}

const at = (px: number[], x: number, y: number) => px[y * 8 + x];

describe('resolveTileTransform: each action on a known tile', () => {
  // A tile with a unique value in each corner and nothing else, so every one of
  // the seven actions has a DIFFERENT expected answer. (A symmetric fixture would
  // let flip-h and flip-v pass each other's assertions.)
  //   (0,0)=1  (7,0)=2  (0,7)=3  (7,7)=4  plus a lone 5 at (1,0).
  const corners = buf8((x, y) => {
    if (x === 0 && y === 0) return 1;
    if (x === 7 && y === 0) return 2;
    if (x === 0 && y === 7) return 3;
    if (x === 7 && y === 7) return 4;
    if (x === 1 && y === 0) return 5;
    return 0;
  });

  it('flip-h mirrors across the vertical axis', () => {
    const px = pixelsAfter(corners, 'flip-h');
    expect(at(px, 7, 0)).toBe(1);
    expect(at(px, 0, 0)).toBe(2);
    expect(at(px, 7, 7)).toBe(3);
    expect(at(px, 0, 7)).toBe(4);
    expect(at(px, 6, 0)).toBe(5);           // the asymmetric marker moved too
  });

  it('flip-v mirrors across the horizontal axis', () => {
    const px = pixelsAfter(corners, 'flip-v');
    expect(at(px, 0, 7)).toBe(1);
    expect(at(px, 7, 7)).toBe(2);
    expect(at(px, 0, 0)).toBe(3);
    expect(at(px, 7, 0)).toBe(4);
    expect(at(px, 1, 7)).toBe(5);
  });

  it('rotate-90 turns the tile clockwise', () => {
    const px = pixelsAfter(corners, 'rotate-90');
    // top-left → top-right, top-right → bottom-right, and so round.
    expect(at(px, 7, 0)).toBe(1);
    expect(at(px, 7, 7)).toBe(2);
    expect(at(px, 0, 0)).toBe(3);
    expect(at(px, 0, 7)).toBe(4);
    expect(at(px, 7, 1)).toBe(5);           // (1,0) → (7,1), not (7,6): pins the direction
  });

  it('shift-left wraps column 0 round to column 7', () => {
    const px = pixelsAfter(corners, 'shift-left');
    expect(at(px, 7, 0)).toBe(1);           // wrapped
    expect(at(px, 6, 0)).toBe(2);
    expect(at(px, 0, 0)).toBe(5);
    expect(at(px, 7, 7)).toBe(3);
  });

  it('shift-right wraps column 7 round to column 0', () => {
    const px = pixelsAfter(corners, 'shift-right');
    expect(at(px, 1, 0)).toBe(1);
    expect(at(px, 0, 0)).toBe(2);           // wrapped
    expect(at(px, 2, 0)).toBe(5);
    expect(at(px, 0, 7)).toBe(4);           // wrapped
  });

  it('shift-up wraps row 0 round to row 7', () => {
    const px = pixelsAfter(corners, 'shift-up');
    expect(at(px, 0, 7)).toBe(1);           // wrapped
    expect(at(px, 7, 7)).toBe(2);           // wrapped
    expect(at(px, 0, 6)).toBe(3);
    expect(at(px, 7, 6)).toBe(4);
  });

  it('shift-down wraps row 7 round to row 0', () => {
    const px = pixelsAfter(corners, 'shift-down');
    expect(at(px, 0, 1)).toBe(1);
    expect(at(px, 7, 1)).toBe(2);
    expect(at(px, 0, 0)).toBe(3);           // wrapped
    expect(at(px, 7, 0)).toBe(4);           // wrapped
  });
});

describe('resolveTileTransform: a marquee scopes the transform', () => {
  // Distinct value per pixel (1..15 repeating, never 0) so ANY stray write shows.
  const gradient = buf8((x, y) => ((y * 8 + x) % 15) + 1);

  it('flips ONLY the marquee and leaves every outside pixel byte-identical', () => {
    const sel = { x: 2, y: 3, w: 4, h: 2 };
    const px = pixelsAfter(gradient, 'flip-h', sel);
    const inside = (x: number, y: number) => x >= 2 && x < 6 && y >= 3 && y < 5;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (inside(x, y)) continue;
        expect(at(px, x, y), `pixel (${x},${y}) is outside the marquee and moved`)
          .toBe(gradient.data[y * 8 + x]);
      }
    }
    // and inside, the four columns of each marquee row are reversed
    for (let y = 3; y < 5; y++) {
      for (let i = 0; i < 4; i++) {
        expect(at(px, 2 + i, y)).toBe(gradient.data[y * 8 + (5 - i)]);
      }
    }
  });

  it('wrap-shifts WITHIN the marquee, not across the tile', () => {
    const sel = { x: 1, y: 1, w: 3, h: 3 };
    const px = pixelsAfter(gradient, 'shift-left', sel);
    // column 1 of the marquee wrapped to its right edge (x=3), NOT off the tile
    expect(at(px, 3, 2)).toBe(gradient.data[2 * 8 + 1]);
    expect(at(px, 1, 2)).toBe(gradient.data[2 * 8 + 2]);
    // the neighbour just outside the marquee is untouched
    expect(at(px, 4, 2)).toBe(gradient.data[2 * 8 + 4]);
    expect(at(px, 0, 2)).toBe(gradient.data[2 * 8 + 0]);
  });

  it('rotates a SQUARE marquee in place', () => {
    const sel = { x: 4, y: 4, w: 4, h: 4 };
    const px = pixelsAfter(gradient, 'rotate-90', sel);
    // marquee-local (0,0) → marquee-local (3,0)
    expect(at(px, 7, 4)).toBe(gradient.data[4 * 8 + 4]);
    expect(at(px, 0, 0)).toBe(gradient.data[0]);   // far corner untouched
  });

  it('clamps a marquee dragged partly off the tile', () => {
    // The select tool's move-drag does not bounds-check, so this is reachable.
    const sel = { x: 6, y: 0, w: 4, h: 4 };        // overhangs x by 2
    const px = pixelsAfter(gradient, 'flip-h', sel);
    expect(at(px, 6, 0)).toBe(gradient.data[7]);   // the clamped 2-wide region flipped
    expect(at(px, 7, 0)).toBe(gradient.data[6]);
    expect(at(px, 5, 0)).toBe(gradient.data[5]);   // outside untouched
  });

  it('does nothing at all for a marquee entirely off the tile', () => {
    const out = resolveTileTransform(gradient, 'flip-h', { x: 20, y: 20, w: 4, h: 4 }, false);
    expect(out.bytes).toBeNull();
    expect(out.refusal).toBeNull();
  });
});

describe('resolveTileTransform: rotate-90 on a NON-SQUARE marquee', () => {
  const gradient = buf8((x, y) => ((y * 8 + x) % 15) + 1);

  it('refuses, with a reason the host can show: it does not throw and does not write', () => {
    const out = resolveTileTransform(gradient, 'rotate-90', { x: 0, y: 0, w: 4, h: 2 }, false);
    expect(out.bytes).toBeNull();
    expect(out.refusal).toMatch(/square/i);
    expect(out.refusal).toContain('4×2');
  });

  it('refuses a marquee made non-square only by clamping', () => {
    // 4x4 marquee overhanging the right edge → the real region is 2x4.
    const out = resolveTileTransform(gradient, 'rotate-90', { x: 6, y: 0, w: 4, h: 4 }, false);
    expect(out.bytes).toBeNull();
    expect(out.refusal).toContain('2×4');
  });

  it('still accepts the square cases', () => {
    expect(resolveTileTransform(gradient, 'rotate-90', null, false).bytes).not.toBeNull();
    expect(resolveTileTransform(gradient, 'rotate-90', { x: 1, y: 1, w: 3, h: 3 }, false).bytes)
      .not.toBeNull();
  });
});

describe('resolveTileTransform: a locked tile writes nothing', () => {
  const gradient = buf8((x, y) => ((y * 8 + x) % 15) + 1);
  const ALL: TileTransform[] = [
    'flip-h', 'flip-v', 'rotate-90', 'shift-up', 'shift-down', 'shift-left', 'shift-right',
  ];

  it('produces no bytes for any action, and says why', () => {
    for (const action of ALL) {
      const out = resolveTileTransform(gradient, action, null, true);
      expect(out.bytes, `'${action}' wrote to a locked tile`).toBeNull();
      expect(out.refusal, `'${action}' refused silently`).toMatch(/view-only/);
      // the same action on the same tile UNLOCKED is a real write — so the null
      // above is the lock, not a transform that happens to do nothing.
      expect(resolveTileTransform(gradient, action, null, false).bytes).not.toBeNull();
    }
  });

  it('refuses a marquee-scoped transform too', () => {
    const out = resolveTileTransform(gradient, 'flip-v', { x: 0, y: 0, w: 2, h: 2 }, true);
    expect(out.bytes).toBeNull();
    expect(out.refusal).toMatch(/view-only/);
  });
});

describe('resolveTileTransform: nothing to say, nothing to commit', () => {
  it('commits nothing when the transform is a no-op (one undo entry per real change)', () => {
    const flat = buf8(() => 7);                    // uniform: every action is identity
    for (const a of ['flip-h', 'flip-v', 'rotate-90', 'shift-left', 'shift-down'] as TileTransform[]) {
      const out = resolveTileTransform(flat, a, null, false);
      expect(out.bytes, `'${a}' minted an empty undo entry`).toBeNull();
      expect(out.refusal).toBeNull();
    }
  });

  it('stays quiet about a locked tile when the transform would have changed nothing', () => {
    const flat = buf8(() => 7);
    const out = resolveTileTransform(flat, 'flip-h', null, true);
    expect(out.bytes).toBeNull();
    expect(out.refusal).toBeNull();                // no lock toast for a non-event
  });

  it('ignores an action it does not own without throwing', () => {
    const gradient = buf8((x, y) => ((y * 8 + x) % 15) + 1);
    for (const junk of ['zoom-in', 'flip', 'rotate-180', '']) {
      const out = resolveTileTransform(gradient, junk, null, false);
      expect(out.bytes, `'${junk}' was treated as a transform`).toBeNull();
      expect(out.refusal).toBeNull();
    }
  });
});

describe('isTileTransform', () => {
  it('accepts exactly the seven actions the shared option bar arms', () => {
    // Kept in step with ArtToolOptions' TRANSFORMS table by hand; if a button is
    // added there and not here, its clicks reach classic and are ignored.
    const grid = ['flip-h', 'flip-v', 'rotate-90', 'shift-up', 'shift-down', 'shift-left', 'shift-right'];
    for (const a of grid) expect(isTileTransform(a), a).toBe(true);
    for (const a of ['pencil', 'shift', 'rotate-90 ', 'FLIP-H']) expect(isTileTransform(a), a).toBe(false);
  });
});

// A STRUCTURAL claim, and the only kind of assertion that can hold it: this
// module used to synthesise a fake `GestureResult` and call `resolveTileGesture`
// with `locked: false` — a lock-aware function asked to lie about the lock, two
// lines above where this module makes its own lock decision — purely to borrow a
// private `differs` + packer pair. That pair is now `tileBytesIfChanged` in
// classic-tile-buffer, and the dependency is gone. Nothing about the behaviour
// above would change if it came back, so the shape is what gets pinned.
describe('classic-tile-transform does not reach through the gesture resolver', () => {
  it('imports the shared no-op rule, not classic-tile-gesture', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'classic-tile-transform.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');            // comment-stripped: the docblock discusses both by name
    expect(src, 'the transform module depends on classic-tile-gesture again')
      .not.toMatch(/from\s*'\.\/classic-tile-gesture'/);
    expect(src, 'resolveTileGesture is being called from the transform path')
      .not.toMatch(/\bresolveTileGesture\b/);
    expect(src, 'the shared no-op rule is not the one being used')
      .toMatch(/\btileBytesIfChanged\(/);
  });
});
