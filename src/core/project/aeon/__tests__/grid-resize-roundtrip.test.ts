// GRID RESIZE ROUND TRIP: resize the act's section grid, save, reopen.
//
// WHAT THIS PINS
//
// The act's grid dimensions live in TWO places that are separate objects:
//
//   * the MODEL, `Act.gridWidth` / `Act.gridHeight` (core/model/s4-types.ts),
//     which is what the editor draws and what `set-sections` writes
//     (core/editing/history.ts);
//   * the CONFIG, `S4ActConfig.gridWidth` / `.gridHeight`
//     (core/config/s4-config.ts), which is what project.json holds and what
//     the loader reads back (core/project/aeon/load.ts builds every Act from
//     `actConfig.gridWidth`).
//
// A resize that only reaches the first is a resize that does not survive a
// reopen, and every other fixture in this directory is 1x1, where a resize has
// nowhere to go wrong. So this file builds a 2x2 act, runs the exact op the
// grid control runs (`resizeGrid` from core/editing/section-ops.ts, wrapped in
// the same `set-sections` command SectionGridNav.tsx raises), applies the real
// `buildAeonSavePlan` output to the file map, and reopens with the real
// `loadAeonProject`.
//
// EXPECTATIONS ARE DERIVED, never observed: the expected dimensions are the
// arguments handed to `resizeGrid`, and the expected set of on-disk section
// files is computed from the resized grid's own occupancy, not from a listing
// anyone printed once.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { EditHistory } from '../../../editing/history';
import { resizeGrid } from '../../../editing/section-ops';
import type { S4Level } from '../../../editing/commands';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

/** In-memory FileAccess over a Map<rel, bytes>. read() throws on a miss, like the IPC bridge. */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async () => [],
  };
}

const ZONE_ID = 'ojz';
const ACT_ID = 'act1';
const DATA_PATH = 'data/ojz/act1/';

/**
 * A section's identity, written into word 0 of its nametable. Every populated
 * slot gets a different one so a reopen can say WHICH section's bytes came back
 * in a given slot, not merely that some section did.
 */
function markerFor(flatIndex: number): number {
  return 0x0100 + flatIndex;
}

function projectJson(gridWidth: number, gridHeight: number): string {
  return JSON.stringify({
    name: 'Grid Resize Fixture',
    engine: 's4',
    objectLibrary: 'data/objects.json',
    chunkLibrary: '',
    zones: [{
      id: ZONE_ID, name: 'OJ Zone',
      tileset: 'data/ojz_tiles.bin',
      palette: 'data/ojz_pal.bin',
      acts: [{
        id: ACT_ID, gridWidth, gridHeight,
        dataPath: DATA_PATH,
        bgLayout: '', bgTiles: '', sceneRef: null,
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
  });
}

/**
 * A project whose act is `gridWidth` x `gridHeight` with EVERY slot populated.
 * The only fixture in this directory that is not 1x1, which is the gap that let
 * a grid resize go unmeasured.
 */
function fixtureFiles(gridWidth: number, gridHeight: number): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(projectJson(gridWidth, gridHeight)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
  for (let i = 0; i < gridWidth * gridHeight; i++) {
    const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    nt[0] = markerFor(i);
    files.set(`${DATA_PATH}section_${i}.tiles.bin`, serializeNametable(nt));
  }
  files.set('data/objects.json', new TextEncoder().encode(JSON.stringify([])));
  return files;
}

/** Every `section_N.tiles.bin` in the map, as the flat indices N, ascending. */
function sectionTileFileIndices(files: Map<string, Uint8Array>): number[] {
  const out: number[] = [];
  for (const path of files.keys()) {
    const m = /^data\/ojz\/act1\/section_(\d+)\.tiles\.bin$/.exec(path);
    if (m) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

/**
 * Load, resize the act's grid to `newWidth` x `newHeight` through the real
 * command path, save through the real plan builder, apply the plan to `files`,
 * and load again. Returns both loads plus the plan so a test can assert on any
 * stage.
 */
async function resizeSaveReopen(
  files: Map<string, Uint8Array>,
  newWidth: number,
  newHeight: number,
) {
  const before = await loadAeonProject(memFa(files), '');
  const act = before.project.zones[0].acts[0];

  // Exactly what SectionGridNav.tsx's applyGridOp does: run the pure op over a
  // snapshot of the live grid, then wrap before/after in one `set-sections`.
  const result = resizeGrid(
    { gridWidth: act.gridWidth, gridHeight: act.gridHeight, sections: act.sections },
    newWidth, newHeight, 0,
  );
  if (!result) throw new Error(`resizeGrid refused ${newWidth}x${newHeight}`);

  const level: S4Level = { sections: act.sections, act };
  new EditHistory().execute({
    type: 'set-sections', description: 'Resize grid', sectionIndex: 0,
    oldGridWidth: act.gridWidth, oldGridHeight: act.gridHeight, oldSections: act.sections.slice(),
    newGridWidth: result.gridWidth, newGridHeight: result.gridHeight, newSections: result.sections,
  }, level);

  const plan = await buildAeonSavePlan(
    memFa(files), before.config, before.project, ZONE_ID, ACT_ID,
    { legacyAtlasMerged: before.legacyAtlasMerged },
  );
  for (const f of plan.files) files.set(f.path, f.bytes);
  for (const r of plan.removals) files.delete(r.path);

  const after = await loadAeonProject(memFa(files), '');
  return { before, after, plan, resized: result };
}

describe('aeon grid resize round trip', () => {
  it('a widened grid keeps its new dimensions across save and reopen', async () => {
    const files = fixtureFiles(2, 2);
    // Derived from the input, not from a run: the control calls
    // resizeGridTo(gridWidth + 1, gridHeight), so the act is 3x2 afterwards.
    const expectedWidth = 3;
    const expectedHeight = 2;

    const { before, after } = await resizeSaveReopen(files, expectedWidth, expectedHeight);

    // The in-memory resize itself is not in question; assert it so a failure
    // below cannot be blamed on the command not having run.
    expect(before.project.zones[0].acts[0].gridWidth).toBe(expectedWidth);
    expect(before.project.zones[0].acts[0].gridHeight).toBe(expectedHeight);

    const reopened = after.project.zones[0].acts[0];
    expect(reopened.gridWidth).toBe(expectedWidth);
    expect(reopened.gridHeight).toBe(expectedHeight);
  });

  it('a widened grid leaves no orphaned section file on disk', async () => {
    const files = fixtureFiles(2, 2);
    const { resized } = await resizeSaveReopen(files, 3, 2);

    // Derived from the resized grid's own occupancy: a slot holds a section
    // after the resize exactly when a file should name it.
    const expected = resized.sections
      .map((s, i) => (s == null ? -1 : i))
      .filter((i) => i >= 0);
    expect(sectionTileFileIndices(files)).toEqual(expected);
  });

  it('a widened grid puts every section back where the resize put it', async () => {
    const files = fixtureFiles(2, 2);
    const { resized, after } = await resizeSaveReopen(files, 3, 2);

    const reopened = after.project.zones[0].acts[0];
    // Each populated slot must come back holding the SAME section that the
    // resize placed there, identified by the marker the fixture wrote.
    const expectedMarkers = resized.sections.map((s) => {
      if (s == null) return null;
      return s.tileGrid.nametable[0];
    });
    const actualMarkers = reopened.sections.map((s) => (s == null ? null : s.tileGrid.nametable[0]));
    expect(actualMarkers).toEqual(expectedMarkers);
  });

  it('a shrunk grid keeps its new dimensions across save and reopen', async () => {
    // Start 3x2, empty the last column, then remove it. The control refuses a
    // shrink that would drop a populated section, so the fixture has to make
    // room the way an author would.
    const files = fixtureFiles(3, 2);
    files.delete(`${DATA_PATH}section_2.tiles.bin`);
    files.delete(`${DATA_PATH}section_5.tiles.bin`);

    const { after } = await resizeSaveReopen(files, 2, 2);

    const reopened = after.project.zones[0].acts[0];
    expect(reopened.gridWidth).toBe(2);
    expect(reopened.gridHeight).toBe(2);
  });
});
