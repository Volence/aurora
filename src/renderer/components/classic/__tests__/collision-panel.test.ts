// The collision panel, by source scan: this suite is node-only and never
// executes .tsx. What is guarded is the shape of the thing, not its pixels —
// that both tiers are labelled, that the read-only state is stated rather than
// implied, and that the panel routes through the pure probe instead of
// re-deriving the lookup inline (a second copy of FindFloor's order is exactly
// how the overlay came to disagree with the engine).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'ClassicCollisionPanel.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('ClassicCollisionPanel', () => {
  it('uses the pure probe rather than re-deriving the lookup', () => {
    expect(src).toMatch(/probeCollision/);
    expect(src, 'colind indexed inline = a second copy of the lookup')
      .not.toMatch(/collision\.colind\[/);
  });

  it('labels both tiers', () => {
    expect(src).toMatch(/This cell/);
    expect(src).toMatch(/This block/);
  });

  it('states that it cannot write yet, and where solidity is edited', () => {
    expect(src).toMatch(/Chunk tab/);
  });

  it('claims the collision overlay through the shared scope helper', () => {
    expect(src).toMatch(/claimCollisionOverlay/);
    expect(src, 'setOverlay called directly bypasses the implicit-revert rule')
      .not.toMatch(/setOverlay\(/);
  });

  it('qualifies both sharing counts by scope', () => {
    expect(src).toMatch(/this act/i);
    expect(src).toMatch(/chunk cells/i);
  });

  it('names all three non-collision reasons', () => {
    for (const r of ['air', 'block0', 'solidity']) expect(src).toContain(`'${r}'`);
  });

  it('surfaces the loop ambiguity the probe reports', () => {
    expect(src).toMatch(/loopAmbiguous/);
  });
});
