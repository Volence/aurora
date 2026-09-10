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

import { describe, it, expect, vi } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { EditHistory } from '../../../editing/history';
import { resizeGrid } from '../../../editing/section-ops';
import type { S4Level } from '../../../editing/commands';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Act, Tile } from '../../../model/s4-types';

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
  /**
   * Runs on the loaded act BETWEEN the load and the save, which is the only
   * seam where a state the CURRENT loader cannot produce can be handed to the
   * plan builder. Used by the future-loader row below; every other row leaves
   * it undefined and gets the unmodified round trip.
   */
  afterLoad?: (act: Act) => void,
) {
  const before = await loadAeonProject(memFa(files), '');
  const act = before.project.zones[0].acts[0];
  afterLoad?.(act);

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

  it('a widened grid loses no section: every one comes back where the resize put it', async () => {
    const files = fixtureFiles(2, 2);
    const { resized, after } = await resizeSaveReopen(files, 3, 2);

    const reopened = after.project.zones[0].acts[0];
    // Every slot the resize POPULATED must come back holding the SAME section,
    // identified by the marker the fixture wrote into nametable word 0. This is
    // the property that was broken: widening 2x2 to 3x2 moves the bottom row
    // from flat 2,3 to flat 3,4, and a reopen that still enumerated 2x2 never
    // read flat 4 at all, so that section was gone.
    for (let i = 0; i < resized.sections.length; i++) {
      const placed = resized.sections[i];
      if (placed == null) continue;
      const back = reopened.sections[i];
      expect(back, `slot ${i} came back empty`).not.toBeNull();
      expect(back!.tileGrid.nametable[0]).toBe(placed.tileGrid.nametable[0]);
    }
    // and every one of them is a DIFFERENT section, so the round trip did not
    // fill a slot by copying its neighbour. Restricted to the slots the resize
    // populated: the empty slots are the open orphan row's business, pinned by
    // the next test.
    const markers = resized.sections
      .map((s, i) => (s == null ? null : reopened.sections[i]?.tileGrid.nametable[0] ?? null))
      .filter((m): m is number => m != null);
    expect(new Set(markers).size).toBe(markers.length);
  });

  /**
   * WAS `KNOWN DEFECT, still open: a stranded section file resurrects a phantom
   * section`, and is the same property with its two pinned assertions restored
   * (2026-09-10, docs/reviews/2026-09-10-resize-orphan-sweep.md). The defect:
   *
   * The grid-dimension sync (core/project/aeon/save.ts) stops the widening
   * resize from LOSING a section. It did not clean up the section files the
   * re-index stranded: widening 2x2 to 3x2 writes the bottom row to its new
   * flat indices 3 and 4 and leaves the pre-resize section_2 and section_3
   * files on disk. section_3 is overwritten, section_2 is not, and flat 2 is a
   * slot the resize left EMPTY, so the reopen found a file there and
   * resurrected a phantom duplicate of the section that used to live at flat 2.
   *
   * What made the sweep a separate row was that the save could not tell a slot
   * the author emptied from a slot whose `tiles.bin` the LOADER refused to
   * parse: load.ts pushes `null` for both. `Act.sectionFiles` now carries that
   * apart, and the sweep is gated on it. The REFUSED half is the next row down,
   * and the load-side discrimination is __tests__/section-file-ledger.test.ts.
   */
  it('a stranded section file is swept, so no phantom section comes back', async () => {
    const files = fixtureFiles(2, 2);
    const { resized, after } = await resizeSaveReopen(files, 3, 2);

    // Derived, not observed: flat 2 is empty in the resized grid, and the
    // stranded file at that path held the section the fixture put at flat 2
    // BEFORE the resize, so it carried markerFor(2). Asserting the marker is
    // gone by name, not merely that the slot is empty.
    expect(resized.sections[2]).toBeNull();
    expect(markerFor(2)).toBe(0x0102);

    // The file set on disk is exactly the resized grid's own occupancy.
    expect(sectionTileFileIndices(files)).toEqual(
      resized.sections.map((s, i) => (s == null ? -1 : i)).filter((i) => i >= 0));
    const reopened = after.project.zones[0].acts[0];
    expect(reopened.sections[2]).toBeNull();
  });

  /**
   * THE DESTRUCTIVE HALF, ON THE SIDE THAT MATTERS.
   *
   * The sweep above deletes files. The one thing it must never delete is a
   * section file Aurora could not read: `act.sections[i] === null` is the value
   * the loader produces both for a slot with nothing in it and for a slot whose
   * `tiles.bin` was truncated, and a sweep reading THAT would take the
   * truncated file away on the next Ctrl+S. The author's repairable file would
   * be gone, silently, exactly as the 2026-09-05 unreadable-table defect went.
   *
   * The fixture puts a truncated `tiles.bin` at flat 2 of a 2x2 act and then
   * widens the grid, which is the same op the row above runs. Flat 2 is empty
   * afterwards for BOTH reasons at once, and the two must come out different:
   * the file the loader READ (flat 3, re-indexed to flat 4) is swept; the file
   * the loader REFUSED (flat 2) is left byte for byte where it is.
   */
  it('a section file the loader REFUSED is neither swept nor overwritten', async () => {
    const files = fixtureFiles(2, 2);
    // Truncated by one row: a hand edit or an interrupted write, not a stub.
    const whole = files.get(`${DATA_PATH}section_2.tiles.bin`)!;
    const truncated = whole.slice(0, whole.length - SECTION_TILES_WIDE * 2);
    files.set(`${DATA_PATH}section_2.tiles.bin`, truncated);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let plan;
    let before;
    try {
      ({ plan, before } = await resizeSaveReopen(files, 3, 2));
    } finally {
      warn.mockRestore();
    }

    // The fixture is doing what it claims: the loader refused this file, said
    // so, and dropped the section. Without this the row could pass on a
    // fixture whose file parsed fine.
    const refusedPath = `${DATA_PATH}section_2.tiles.bin`;
    const act = before.project.zones[0].acts[0];
    expect(act.sectionFiles.unreadablePaths).toContain(refusedPath);
    expect(act.sectionFiles.loadedPaths).not.toContain(refusedPath);

    // NOT DELETED.
    expect(plan.removals.map(r => r.path)).not.toContain(refusedPath);
    // NOT OVERWRITTEN.
    expect(plan.files.map(f => f.path)).not.toContain(refusedPath);
    // And still on disk, byte for byte, after the plan was applied.
    expect(files.get(refusedPath)).toEqual(truncated);

    // Meanwhile the sweep DID run in this same save: the file the loader read
    // at flat 3, whose section the resize moved to flat 4, is gone. A row that
    // only proved the refusal would also pass with the sweep switched off.
    expect(plan.removals.map(r => r.path)).toContain(`${DATA_PATH}section_3.tiles.bin`);
  });

  /**
   * THE GUARD ON THE GUARD — see docs/lens-findings.jsonl
   * `SWEEP-SECOND-SUBTRACTION-UNGUARDED`.
   *
   * The row above passes THROUGH THE LOAD SIDE: today's loader never puts a
   * refused path into `loadedPaths`, so the refused file is already outside the
   * removable set before `removalsFor` subtracts `unreadablePaths` from it a
   * second time. That second subtraction is therefore invisible to every
   * standing row — deleting it (`act.sectionFiles.unreadablePaths` -> `[]` at
   * the sweep's `removalsFor` call in save.ts) leaves the whole suite green,
   * which is measured in docs/reviews/2026-09-10-resize-orphan-sweep.md as
   * mutation M4 and is exactly how a defence-in-depth line gets removed as dead
   * code at the moment it starts mattering. Precedent: O20, a gate resting on
   * its neighbour is discovered the day the neighbour moves, so every gate gets
   * a row asserting ITS OWN refusal reason.
   *
   * So this row asserts the SUBTRACTION, not the feature. It hands the plan
   * builder the state the docblock names and today's loader cannot reach — an
   * act whose `loadedPaths` wrongly contains a refused path — and requires the
   * file to survive anyway. The M4 run needed a fixture invariant suspended by
   * hand to get here; the injection below is that step made standing.
   *
   * Everything except the one injected push is real: the truncation, the
   * loader's refusal, the resize, and the plan builder.
   */
  it('the refused subtraction is load-bearing: a loader that admitted a refused path to loadedPaths still does not get it deleted', async () => {
    const files = fixtureFiles(2, 2);
    const refusedPath = `${DATA_PATH}section_2.tiles.bin`;
    const whole = files.get(refusedPath)!;
    const truncated = whole.slice(0, whole.length - SECTION_TILES_WIDE * 2);
    files.set(refusedPath, truncated);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let plan;
    let before;
    try {
      ({ plan, before } = await resizeSaveReopen(files, 3, 2, (act) => {
        // THE FUTURE LOADER, in one line: a load.ts that recorded the refusal
        // AND still admitted the path to the ledger of files it understood.
        // Nothing today does this — that is the point; the subtraction exists
        // so that when something does, the file is still not deleted.
        expect(act.sectionFiles.unreadablePaths).toContain(refusedPath);
        act.sectionFiles.loadedPaths.push(refusedPath);
      }));
    } finally {
      warn.mockRestore();
    }

    const act = before.project.zones[0].acts[0];
    // The injected state is what the plan builder actually saw. Without this
    // the row could pass on an act where the push never landed, which is the
    // same artifact as the property holding.
    expect(act.sectionFiles.loadedPaths).toContain(refusedPath);
    expect(act.sectionFiles.unreadablePaths).toContain(refusedPath);

    // ANTI-VACUITY, and the reason this row discriminates: the path is not in
    // the plan's `keep` set either, because `understood()` refuses to write a
    // file the load could not read. So the FIRST subtraction (minus the paths
    // this plan writes) does not save it, and the only thing standing between
    // this file and an unlink is the second subtraction. If a future save ever
    // did write refused files, this assertion goes red rather than letting the
    // row pass for the wrong reason.
    expect(plan.files.map(f => f.path)).not.toContain(refusedPath);

    // THE PROPERTY. Red when the second subtraction is deleted.
    expect(plan.removals.map(r => r.path)).not.toContain(refusedPath);
    expect(files.get(refusedPath)).toEqual(truncated);

    // And the sweep was live in this same save, so the row cannot pass by the
    // removable set being empty for an unrelated reason: the file the loader
    // READ at flat 3, re-indexed to flat 4, is gone.
    expect(plan.removals.map(r => r.path)).toContain(`${DATA_PATH}section_3.tiles.bin`);
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
