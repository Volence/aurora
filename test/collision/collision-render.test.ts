// test/collision/collision-render.test.ts
import { describe, it, expect } from 'vitest';
import { columnSolidRun, heightSparkline } from '../../src/core/collision/collision-render';

describe('columnSolidRun', () => {
  it('positive height fills up from the cell bottom', () => {
    expect(columnSolidRun(16)).toEqual({ y: 0, h: 16 });   // full
    expect(columnSolidRun(4)).toEqual({ y: 12, h: 4 });    // 4px from the bottom
  });
  it('negative height hangs down from the cell top', () => {
    expect(columnSolidRun(-16)).toEqual({ y: 0, h: 16 });  // full ceiling
    expect(columnSolidRun(-4)).toEqual({ y: 0, h: 4 });    // 4px from the top
  });
  it('zero height is empty', () => {
    expect(columnSolidRun(0)).toBeNull();
  });
  it('clamps a malformed >16 magnitude to a full block (engine covers())', () => {
    expect(columnSolidRun(64)).toEqual({ y: 0, h: 16 });   // not a 64px bar above the cell
    expect(columnSolidRun(-64)).toEqual({ y: 0, h: 16 });
  });
});

describe('heightSparkline', () => {
  it('renders a 16-char bar with a level per column', () => {
    const s = heightSparkline(new Int8Array([0, 4, 8, 12, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(s).toHaveLength(16);
    expect(s[0]).toBe(' ');     // empty column
    expect(s[4]).toBe('█');     // full
  });
});
