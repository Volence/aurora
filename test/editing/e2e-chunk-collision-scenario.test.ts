import { describe, it, expect } from 'vitest';
import { createChunkDef, createSection, SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../src/core/model/s4-types';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import { cellTileIndices } from '../../src/core/collision/collision-cell';
import { ensureCollisionPlanes } from '../../src/core/collision/collision-cell-resolve';
import { buildStampCommand } from '../../src/core/editing/map-stamp';
import { copyFromSection, buildPasteCommand } from '../../src/core/editing/map-clipboard';
import { EditHistory } from '../../src/core/editing/history';
import { serializeCollAttr, parseCollAttr } from '../../src/core/formats/s4-collattr';

// The design spec's end-to-end scenario (docs/specs/2026-08-08-...-design.md §6),
// run headlessly through the real command/history/serialize path — everything
// short of the Electron save IPC and the aeon bake, whose input format
// (16-bit BE .collattr.bin) is asserted at the bottom.
describe('e2e: chunk-carried collision scenario', () => {
  const FB = 1; // any nonzero shape id — the bake resolves it against the base bank
  const GROUND = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
  const GROUND_B = packCollisionCell({ shape: FB, xFlip: true, yFlip: false, solidity: 'top' });

  function authorChunk() {
    // 16x16-tile chunk: bottom half ground (solid, distinct A/B), top half
    // decorative grass (art present, collision air).
    const chunk = createChunkDef('e2e', 'E2E', 16, 16);
    for (let ty = 0; ty < 16; ty++) {
      for (let tx = 0; tx < 16; tx++) {
        chunk.nametable[ty * 16 + tx] = 0x100 + (ty < 8 ? 1 : 2); // grass vs ground art
      }
    }
    for (let cy = 4; cy < 8; cy++) {
      for (let cx = 0; cx < 8; cx++) {
        chunk.collisionA[cy * 8 + cx] = GROUND;
        chunk.collisionB[cy * 8 + cx] = GROUND_B;
      }
    }
    return chunk;
  }

  it('stamp twice → identical collision at both placements; grass passable; paste round-trips; save format is 16-bit BE', () => {
    const chunk = authorChunk();
    const section = createSection(0, 'S0');
    ensureCollisionPlanes(section);
    const history = new EditHistory();
    const level = { sections: [section] };

    // Stamp the same chunk at two placements (chunk-aligned, as the UI snaps).
    for (const [bc, br] of [[0, 0], [32, 16]] as const) {
      const cmd = buildStampCommand({
        chunk, section, sectionIndex: 0, baseCol: bc, baseRow: br,
        artOnly: false, description: `stamp at (${bc},${br})`,
      });
      expect(cmd).not.toBeNull();
      history.execute(cmd!, level);
    }

    // Both placements carry identical collision; decorative cells are air.
    for (const [bc, br] of [[0, 0], [32, 16]] as const) {
      const baseCellCol = bc >> 1, baseCellRow = br >> 1;
      for (let cy = 0; cy < 8; cy++) {
        for (let cx = 0; cx < 8; cx++) {
          const want = cy >= 4 ? GROUND : 0;
          const wantB = cy >= 4 ? GROUND_B : 0;
          for (const idx of cellTileIndices(baseCellCol + cx, baseCellRow + cy, SECTION_TILES_WIDE)) {
            expect(section.collisionEdit![idx]).toBe(want);
            expect(section.collisionEditB![idx]).toBe(wantB);
          }
        }
      }
    }

    // Marquee-copy the first placement's footprint, paste (both layers) into a
    // different section — the clipboard half of the user scenario.
    const clip = copyFromSection(section, 0, 0, 16, 16);
    const section2 = createSection(1, 'S1');
    ensureCollisionPlanes(section2);
    const level2 = { sections: [null, section2] };
    const paste = buildPasteCommand({
      clip, section: section2, sectionIndex: 1, baseCol: 64, baseRow: 64,
      layers: 'both', description: 'paste',
    });
    expect(paste).not.toBeNull();
    history.execute(paste!, level2);
    for (let cy = 0; cy < 8; cy++) {
      for (let cx = 0; cx < 8; cx++) {
        const src = cellTileIndices(cx, cy, SECTION_TILES_WIDE)[0];
        const dst = cellTileIndices(32 + cx, 32 + cy, SECTION_TILES_WIDE)[0];
        expect(section2.collisionEdit![dst]).toBe(section.collisionEdit![src]);
        expect(section2.collisionEditB![dst]).toBe(section.collisionEditB![src]);
      }
    }

    // The exact bytes the aeon bake consumes: 16-bit BIG-ENDIAN, full
    // 256x256-tile index space, round-trips through the parser.
    const bytes = serializeCollAttr(section.collisionEdit!);
    expect(bytes.length).toBe(SECTION_TILES_WIDE * SECTION_TILES_HIGH * 2);
    const groundIdx = cellTileIndices(0, 4, SECTION_TILES_WIDE)[0];
    expect(bytes[groundIdx * 2]).toBe((GROUND >> 8) & 0xff);
    expect(bytes[groundIdx * 2 + 1]).toBe(GROUND & 0xff);
    expect(Array.from(parseCollAttr(bytes))).toEqual(Array.from(section.collisionEdit!));

    // One undo unwinds the paste as a single step.
    history.undo(level2);
    expect(section2.collisionEdit!.every((w) => w === 0)).toBe(true);
  });
});
