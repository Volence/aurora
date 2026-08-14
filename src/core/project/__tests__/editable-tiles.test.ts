import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tileLockReason, isTileEditable } from '../editable-tiles';
import { firstEditableNonBlankTile } from '../../level-classic/tile-pick';
import { s1Adapter } from '../s1';
import type { EditableTileRange, FileAccess } from '../adapter';

// The composer's 🔒 rule and the command's refusal are ONE predicate now (they
// used to be two hand-copied ones, and only the command's copy was testable —
// composer-shared is .tsx, which this suite does not collect).

const RANGE: EditableTileRange = {
  baseTileCount: 10,
  animRanges: [{ start: 4, count: 2 }],
};

describe('tileLockReason', () => {
  it('allows a pristine tile', () => {
    expect(tileLockReason(RANGE, 0)).toBeNull();
    expect(tileLockReason(RANGE, 3)).toBeNull();
    expect(tileLockReason(RANGE, 9)).toBeNull();
  });

  it('locks an animated-art overlay slot, inclusive of its span', () => {
    expect(tileLockReason(RANGE, 4)).toMatch(/animated-art/);
    expect(tileLockReason(RANGE, 5)).toMatch(/animated-art/);
    expect(tileLockReason(RANGE, 6)).toBeNull(); // one past the span
  });

  it('locks gap/appended tiles at and past baseTileCount', () => {
    expect(tileLockReason(RANGE, 10)).toMatch(/gap\/appended/);
    expect(tileLockReason(RANGE, 999)).toMatch(/gap\/appended/);
  });

  it('is permissive when the range is unknown (act not read / fake adapter)', () => {
    expect(tileLockReason(null, 0)).toBeNull();
    expect(tileLockReason(null, 99999)).toBeNull();
    expect(isTileEditable(null, 5)).toBe(true);
  });

  it('never picks a locked tile as the composer landing tile', () => {
    // Tiles 0..3 blank, 4 (an anim slot) non-blank, 7 non-blank.
    const tiles = new Uint8Array(12 * 32);
    tiles[4 * 32] = 0xff;
    tiles[7 * 32] = 0xff;
    expect(firstEditableNonBlankTile(tiles, RANGE)).toBe(7);
    // ...and a tile past baseTileCount is never picked either.
    const appendedOnly = new Uint8Array(12 * 32);
    appendedOnly[11 * 32] = 0xff;
    expect(firstEditableNonBlankTile(appendedOnly, RANGE)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Golden — the real s1disasm (skipped when the disasm tree is absent).
//
// Pins the answer to "is the tile the composer lands on actually editable?" for
// a real act. Green Hill's pool is 965 tiles: 830 pristine, then a gap, then the
// animated-art overlays from 832 up. A low tile index like $1 is nowhere near
// any of that, so a refused pencil there is never the lock rule's doing.
// ---------------------------------------------------------------------------

const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const S1_PRESENT = fs.existsSync(S1DIR);

function realFs(root: string): FileAccess {
  return {
    async exists(rel) { return fs.existsSync(path.join(root, rel)); },
    async read(rel) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
    async list(rel) { return fs.readdirSync(path.join(root, rel)); },
  };
}

describe('editable tiles, real Green Hill act 1', () => {
  it.skipIf(!S1_PRESENT)('leaves the low tile pool editable and locks only the overlays/gap', async () => {
    const handle = await s1Adapter.open(realFs(S1DIR));
    const ghz1 = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!;
    const doc = await handle.levels!.read(ghz1);
    const range = handle.levels!.editableTileRange!(ghz1)!;

    expect(range.baseTileCount).toBeGreaterThan(256);
    expect(range.animRanges.length).toBeGreaterThan(0);
    // Every anim overlay sits above the pristine span — nothing overlays the
    // low tiles, so the composer's default landing tile cannot be locked.
    for (const r of range.animRanges) expect(r.start).toBeGreaterThanOrEqual(range.baseTileCount);

    for (const t of [0, 1, 2, 0x10, 0x80]) {
      expect(tileLockReason(range, t), `tile ${t} should be editable`).toBeNull();
    }
    expect(tileLockReason(range, range.baseTileCount)).toMatch(/gap\/appended/);
    // Green Hill's overlays sit past the pristine span, so they report the
    // gap reason first — either way they are locked, which is what matters.
    expect(tileLockReason(range, range.animRanges[0].start)).not.toBeNull();

    // The tile the composer actually opens on is one the pencil may edit.
    const landing = firstEditableNonBlankTile(doc.tiles, range);
    expect(tileLockReason(range, landing)).toBeNull();
  });
});
