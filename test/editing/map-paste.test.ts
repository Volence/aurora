import { describe, it, expect } from 'vitest';
import { createSection, SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../src/core/model/s4-types';
import type { S4Level } from '../../src/core/editing/commands';
import { EditHistory } from '../../src/core/editing/history';
import { buildPasteCommand, copyFromSection } from '../../src/core/editing/map-clipboard';
import type { MapClipboard } from '../../src/core/editing/map-clipboard';
import { cellTileIndices } from '../../src/core/collision/collision-cell';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';

function seededSection() {
  const section = createSection(0, 'Test');
  section.collisionEdit = new Uint16Array(65536);
  section.collisionEditB = new Uint16Array(65536);
  return section;
}

const WORD_A = packCollisionCell({ shape: 5, xFlip: false, yFlip: false, solidity: 'all' });
const WORD_B = packCollisionCell({ shape: 9, xFlip: true, yFlip: false, solidity: 'top' });

/** Build a source section with distinct nametable words and A/B collision
 *  words over a w*h (even) region at (col,row), then copy it out. */
function buildSourceClip(col: number, row: number, w: number, h: number): MapClipboard {
  const source = seededSection();
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const idx = (row + r) * SECTION_TILES_WIDE + (col + c);
      source.tileGrid.nametable[idx] = 0x1000 + r * w + c;
    }
  }
  const cellsW = w >> 1, cellsH = h >> 1;
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const idx = cellTileIndices(col / 2 + cx, row / 2 + cy, SECTION_TILES_WIDE);
      for (const i of idx) {
        source.collisionEdit![i] = WORD_A;
        source.collisionEditB![i] = WORD_B;
      }
    }
  }
  return copyFromSection(source, col, row, w, h);
}

describe('buildPasteCommand', () => {
  it('(a) round-trip: nametable + both planes byte-identical over the footprint after pasting into an empty section', () => {
    const clip = buildSourceClip(4, 4, 4, 4); // 2x2 cells
    const dest = seededSection();
    const level: S4Level = { sections: [dest] };
    const history = new EditHistory();

    const baseCol = 20, baseRow = 20;
    const cmd = buildPasteCommand({
      clip, section: dest, sectionIndex: 0, baseCol, baseRow, layers: 'both', description: 'paste',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const idx = (baseRow + r) * SECTION_TILES_WIDE + (baseCol + c);
        expect(dest.tileGrid.nametable[idx]).toBe(clip.nametable[r * 4 + c]);
      }
    }
    for (let cy = 0; cy < 2; cy++) {
      for (let cx = 0; cx < 2; cx++) {
        const indices = cellTileIndices(baseCol / 2 + cx, baseRow / 2 + cy, SECTION_TILES_WIDE);
        for (const i of indices) {
          expect(dest.collisionEdit![i]).toBe(clip.collisionA[cy * 2 + cx]);
          expect(dest.collisionEditB![i]).toBe(clip.collisionB[cy * 2 + cx]);
        }
      }
    }
  });

  it('(b) one history.undo restores everything', () => {
    const clip = buildSourceClip(4, 4, 4, 4);
    const dest = seededSection();
    const level: S4Level = { sections: [dest] };
    const history = new EditHistory();

    const baseCol = 20, baseRow = 20;
    const ntIdx = baseRow * SECTION_TILES_WIDE + baseCol;
    const cellIndices = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);
    const origNt = dest.tileGrid.nametable[ntIdx];
    const origA = cellIndices.map(i => dest.collisionEdit![i]);
    const origB = cellIndices.map(i => dest.collisionEditB![i]);

    const cmd = buildPasteCommand({
      clip, section: dest, sectionIndex: 0, baseCol, baseRow, layers: 'both', description: 'paste',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);
    history.undo(level);

    expect(dest.tileGrid.nametable[ntIdx]).toBe(origNt);
    cellIndices.forEach((i, k) => {
      expect(dest.collisionEdit![i]).toBe(origA[k]);
      expect(dest.collisionEditB![i]).toBe(origB[k]);
    });
  });

  it("(c) layers:'art' leaves both collision planes untouched", () => {
    const clip = buildSourceClip(4, 4, 4, 4);
    const dest = seededSection();
    const level: S4Level = { sections: [dest] };
    const history = new EditHistory();

    const baseCol = 20, baseRow = 20;
    const cellIndices = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);
    const preA = cellIndices.map(i => dest.collisionEdit![i]);
    const preB = cellIndices.map(i => dest.collisionEditB![i]);

    const cmd = buildPasteCommand({
      clip, section: dest, sectionIndex: 0, baseCol, baseRow, layers: 'art', description: 'paste art',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);

    const ntIdx = baseRow * SECTION_TILES_WIDE + baseCol;
    expect(dest.tileGrid.nametable[ntIdx]).toBe(clip.nametable[0]);
    cellIndices.forEach((i, k) => {
      expect(dest.collisionEdit![i]).toBe(preA[k]);
      expect(dest.collisionEditB![i]).toBe(preB[k]);
    });
  });

  it("(c) layers:'collision' leaves the nametable untouched", () => {
    const clip = buildSourceClip(4, 4, 4, 4);
    const dest = seededSection();
    const level: S4Level = { sections: [dest] };
    const history = new EditHistory();

    const baseCol = 20, baseRow = 20;
    const ntIdx = baseRow * SECTION_TILES_WIDE + baseCol;
    const preNt = dest.tileGrid.nametable[ntIdx];

    const cmd = buildPasteCommand({
      clip, section: dest, sectionIndex: 0, baseCol, baseRow, layers: 'collision', description: 'paste collision',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);

    expect(dest.tileGrid.nametable[ntIdx]).toBe(preNt);
    const cellIndices = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);
    for (const i of cellIndices) {
      expect(dest.collisionEdit![i]).toBe(clip.collisionA[0]);
      expect(dest.collisionEditB![i]).toBe(clip.collisionB[0]);
    }
  });

  it('(d) clipboard air clears destination solid cells in the pasted layers only', () => {
    // 1x1-cell clipboard, all-air (never painted).
    const emptySource = seededSection();
    const clip = copyFromSection(emptySource, 0, 0, 2, 2);
    expect(clip.collisionA[0]).toBe(0);
    expect(clip.collisionB[0]).toBe(0);

    const dest = seededSection();
    const baseCol = 10, baseRow = 10;
    const cellIndices = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);
    for (const i of cellIndices) {
      dest.collisionEdit![i] = WORD_A;
      dest.collisionEditB![i] = WORD_B;
    }

    const level: S4Level = { sections: [dest] };
    const history = new EditHistory();
    const cmd = buildPasteCommand({
      clip, section: dest, sectionIndex: 0, baseCol, baseRow, layers: 'both', description: 'paste air',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);

    for (const i of cellIndices) {
      expect(dest.collisionEdit![i]).toBe(0);
      expect(dest.collisionEditB![i]).toBe(0);
    }
  });

  it('(e) paste into a DIFFERENT section object works (clipboard has no section identity)', () => {
    const sourceRegionClip = buildSourceClip(4, 4, 2, 2); // 1x1 cell
    const otherDest = seededSection();
    const level: S4Level = { sections: [otherDest] };
    const history = new EditHistory();

    const baseCol = 30, baseRow = 30;
    const cmd = buildPasteCommand({
      clip: sourceRegionClip, section: otherDest, sectionIndex: 0, baseCol, baseRow,
      layers: 'both', description: 'paste cross-section',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);

    const ntIdx = baseRow * SECTION_TILES_WIDE + baseCol;
    expect(otherDest.tileGrid.nametable[ntIdx]).toBe(sourceRegionClip.nametable[0]);
    const cellIndices = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);
    for (const i of cellIndices) {
      expect(otherDest.collisionEdit![i]).toBe(WORD_A);
      expect(otherDest.collisionEditB![i]).toBe(WORD_B);
    }
  });

  it('(f) edge clamp: paste hanging off the right/bottom edge writes only in-bounds, no wrap/throw', () => {
    const clip = buildSourceClip(4, 4, 4, 4); // 2x2 cells
    const dest = seededSection();
    const level: S4Level = { sections: [dest] };
    const history = new EditHistory();

    const baseCol = SECTION_TILES_WIDE - 2; // only the left 2-tile column fits
    const baseRow = SECTION_TILES_HIGH - 2; // only the top 2-tile row fits

    expect(() => {
      const cmd = buildPasteCommand({
        clip, section: dest, sectionIndex: 0, baseCol, baseRow, layers: 'both', description: 'paste edge',
      });
      expect(cmd).not.toBeNull();
      history.execute(cmd!, level);
    }).not.toThrow();

    // In-bounds top-left tile landed.
    expect(dest.tileGrid.nametable[baseRow * SECTION_TILES_WIDE + baseCol]).toBe(clip.nametable[0]);
    // Out-of-bounds neighbor never wrapped to column/row 0.
    expect(dest.tileGrid.nametable[baseRow * SECTION_TILES_WIDE + 0]).toBe(0);
    expect(dest.tileGrid.nametable[0 * SECTION_TILES_WIDE + baseCol]).toBe(0);

    // In-bounds cell landed in both planes.
    const inBoundsCell = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);
    for (const idx of inBoundsCell) {
      expect(dest.collisionEdit![idx]).toBe(WORD_A);
      expect(dest.collisionEditB![idx]).toBe(WORD_B);
    }
    // No wraparound into cell (0,0).
    const wrapCell = cellTileIndices(0, 0, SECTION_TILES_WIDE);
    for (const idx of wrapCell) {
      expect(dest.collisionEdit![idx]).toBe(0);
      expect(dest.collisionEditB![idx]).toBe(0);
    }
  });

  it('(g) an unchanged paste (identical destination content) returns null', () => {
    const emptySource = seededSection();
    const clip = copyFromSection(emptySource, 0, 0, 4, 4); // all-zero art + air planes
    const dest = seededSection(); // fresh section: also all-zero art + air planes

    const cmd = buildPasteCommand({
      clip, section: dest, sectionIndex: 0, baseCol: 16, baseRow: 16, layers: 'both', description: 'paste noop',
    });
    expect(cmd).toBeNull();
  });
});
