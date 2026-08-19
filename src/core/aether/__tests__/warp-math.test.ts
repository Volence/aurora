import { describe, it, expect } from 'vitest';
import { warpTargetFor, SECTION_PX_WIDE, SECTION_PX_HIGH, WARP_COORD_MAX } from '../warp-math';

const act3x3 = { gridWidth: 3, gridHeight: 3 };

describe('warpTargetFor', () => {
  it('passes an in-bounds point straight through', () => {
    const t = warpTargetFor(2144, 429, act3x3);
    expect(t).toMatchObject({ x: 2144, y: 429, clampedToAct: false, clampedToProtocol: false, reachable: true });
  });

  it('rounds a fractional cursor rather than truncating toward the origin', () => {
    expect(warpTargetFor(100.6, 200.4, act3x3)).toMatchObject({ x: 101, y: 200 });
  });

  it('derives the act extent from the section size, not a pinned number', () => {
    // A 3x3 act of 2048px sections is 6144px, so the last addressable pixel is
    // 6143. Written as arithmetic so changing SECTION_TILES_WIDE moves the test.
    const t = warpTargetFor(999999, 999999, act3x3);
    expect(t.x).toBe(3 * SECTION_PX_WIDE - 1);
    expect(t.y).toBe(3 * SECTION_PX_HIGH - 1);
    expect(t.clampedToAct).toBe(true);
  });

  it('clamps a negative cursor to the act origin', () => {
    // The viewport shows more than the act, so the cursor legitimately sits
    // outside it — that is a clamp, not a bug to refuse.
    expect(warpTargetFor(-500, -1, act3x3)).toMatchObject({ x: 0, y: 0, clampedToAct: true });
  });

  it('reports an act that outgrows the u16 protocol as unreachable', () => {
    // 33 sections of 2048px is 67584px, past the mailbox's u16. No act is close
    // today; when mega-acts land, floating origin keeps runtime coordinates
    // 16-bit and the mailbox gains an origin field — so this is a diagnostic,
    // not a wall we are expected to hit.
    const huge = { gridWidth: 33, gridHeight: 1 };
    const t = warpTargetFor(70000, 10, huge);
    expect(t.reachable).toBe(false);
    expect(t.x).toBe(WARP_COORD_MAX);
    expect(t.clampedToProtocol).toBe(true);
  });

  it('keeps an in-range point in a too-big act reachable-flagged but unmoved', () => {
    const huge = { gridWidth: 33, gridHeight: 1 };
    const t = warpTargetFor(1000, 10, huge);
    expect(t.x).toBe(1000);
    expect(t.clampedToProtocol).toBe(false);
    expect(t.reachable).toBe(false);      // the ACT is unreachable, this point is fine
  });

  it('survives a zero-size act without producing a negative bound', () => {
    expect(warpTargetFor(50, 50, { gridWidth: 0, gridHeight: 0 })).toMatchObject({ x: 0, y: 0 });
  });
});
