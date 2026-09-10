// THE DEBUG DOOR THAT MAKES A REAL LEVEL EDIT, and the one rule that decides
// whether it is worth anything.
//
// ═══ WHY IT EXISTS ═══════════════════════════════════════════════════════
//
// `docs/reviews/2026-09-10-cdp-sweep.md` §5 parked two foreground checks as
// UNMEASURABLE because nothing could dirty a LEVEL document from outside the
// app:
//
//   S2 — does Ctrl+S flash "Saved!" on the Save chip?
//   S3 — does a classic save's success toast name the files it wrote?
//
// Four routes were tried and all four failed for reasons about the HARNESS'S
// REACH rather than about the app: an Effects-preset edit writes a different
// document; `__dbg.setFacet("layout")` returns null; the `Layout` pill clicks
// but leaves `tool` at `view`, so a drag on the classic canvas paints nothing.
// The classic viewport is `ClassicLevelViewport`, whose key handling is not
// `MapViewport`'s, and arming its paint tool from outside is a door that sweep
// did not have. This is that door.
//
// ═══ THE ONE RULE ════════════════════════════════════════════════════════
//
// IT COMMITS THROUGH THE APP'S OWN PATH AND IT DOES NOT SET A DIRTY FLAG.
//
// The tempting shortcut is one line: reach into `useClassicLevelStore` and
// `setState({ dirty: { fg: true } })`. That would make S2 VACUOUS. S2 would
// then prove the chip reacts to a flag, which nobody doubts, and would prove
// nothing about whether an EDIT reaches the chip — the difference between a row
// phrased against the mechanism and one phrased against the thing it stands in
// for. So this module never writes `dirty`, never calls `useClassicLevelStore
// .setState`, and never touches `commitLayout` directly either.
//
// It calls `classicSetLayoutCells`, which is EXACTLY the function a person's
// stamp gesture ends in: `ClassicLevelViewport.tsx`'s `endStroke` flattens a
// whole press-move-release into one `classicSetLayoutCells(plane, cells)` call
// (see its "Commit the stamp gesture as ONE undoable command" comment). Same
// function, same argument shape, same single undo entry, same dirty domain, and
// the same file on the next save (`dirty.fg` routes to `paths.fg` in
// `core/level-classic/s1-io.ts`). Everything downstream of the mouse is
// identical; only the mouse is missing.
//
// This follows the precedent `debug-hooks.ts` already states for this class
// ("classicPaintSurface stays the ONLY way pixels get committed"): go through
// the public action, do not reach past it.
//
// ═══ WHY THE LAYOUT AND NOT SOMETHING SMALLER ════════════════════════════
//
// The smallest edit a person can make on a classic act is one stamped chunk-id
// cell. It needs no art pool, no palette, no object, no collision shape; it is
// one byte in an uncompressed file that round-trips byte-identically
// (`core/formats/classic/s1-layout.ts`), so a save actually persists it and the
// success toast actually names a file. The alternatives all cost more: an
// object move needs a placed object, a tile write needs an editable tile out of
// the reserved set, a palette write needs a palette source on disk.
//
// ═══ WHAT IT DOES NOT PROVE ══════════════════════════════════════════════
//
// It does not prove a POINTER GESTURE on the classic canvas reaches
// `classicSetLayoutCells`. Everything from that call onward is the real path;
// the arming and the drag are not exercised, and a defect between the mouse and
// that call would still be invisible. A row that wants the gesture needs the
// gesture.

import {
  useClassicLevelStore,
  classicSetLayoutCells,
  type LayoutPlane,
} from './state/classicLevelStore';
import type { LevelDoc } from '../core/level-classic/model';

/** The stamp this door would make: which cell, and which byte replaces which. */
export interface LayoutStampChoice {
  plane: LayoutPlane;
  x: number;
  y: number;
  /** The layout byte currently in that cell. */
  from: number;
  /** The layout byte to write. Guaranteed `!== from`, or there is no choice. */
  to: number;
}

export type StampLayoutCellReport =
  | { ok: false; error: string }
  | (LayoutStampChoice & {
      ok: true;
      /** The byte read back OUT of the store after the commit. */
      cellAfter: number;
      /** `cellAfter === to && to !== from`, read from the doc, not assumed. */
      docChanged: boolean;
      /** The store's dirty-domain keys before/after. READ, never written here. */
      dirtyBefore: string[];
      dirtyAfter: string[];
    });

/**
 * Pick a cell and a byte that is guaranteed to CHANGE the document.
 *
 * Pure, and separated from the commit so the choice can be tested without a
 * store. Two properties matter and both are asserted by the suite:
 *
 *   • the cell is inside the WRITABLE region `classicSetLayoutCells` enforces
 *     (`index < min(cells.length, width*height)`), so the commit cannot be
 *     refused for being out of bounds, and
 *   • `to !== from`, so the commit is a real edit. A stamp of the byte already
 *     there would still dirty the document (the store has no identical-value
 *     short circuit on this command) but it would write the same bytes back to
 *     disk, and a save that changes nothing is a bad subject for a row about
 *     what a save wrote.
 *
 * The byte chosen is air ($00) whenever the cell holds anything else, because
 * air is valid on every act regardless of pool size. Only when the cell is
 * already $00 does it need a real engine id, and then it takes the first one.
 */
export function chooseLayoutStamp(
  doc: LevelDoc,
  plane: LayoutPlane,
): LayoutStampChoice | { error: string } {
  const grid = plane === 'bg' ? doc.bg : doc.fg;
  const bound = Math.min(grid.cells.length, grid.width * grid.height);
  if (bound < 1) {
    return { error: `the ${plane} layout has no writable cells (${grid.width}x${grid.height}, ${grid.cells.length} bytes)` };
  }
  const from = grid.cells[0];
  // Air is always a legal id. When the cell is already air, the first engine id
  // is the only other byte guaranteed to be in the pool.
  const to = from !== 0 ? 0 : 1;
  if (to === 1 && doc.chunks.length < 1) {
    return { error: 'the chunk pool is empty, so air is the only legal byte and the cell already holds it' };
  }
  return { plane, x: 0, y: 0, from, to };
}

/**
 * Make one real level edit, through the app's own commit path.
 *
 * Returns everything a harness needs to be anti-vacuous about it: the byte
 * before, the byte after READ BACK OUT OF THE DOCUMENT, and the store's dirty
 * domains on each side. Nothing here decides a verdict; it reports facts and
 * the caller asserts on them.
 */
export function stampLayoutCell(plane: LayoutPlane = 'fg'): StampLayoutCellReport {
  const doc = useClassicLevelStore.getState().doc;
  if (!doc) return { ok: false, error: 'no classic level is open' };

  const choice = chooseLayoutStamp(doc, plane);
  if ('error' in choice) return { ok: false, error: choice.error };

  const dirtyBefore = Object.keys(useClassicLevelStore.getState().dirty);

  // THE COMMIT. The same call `ClassicLevelViewport`'s `endStroke` makes.
  const res = classicSetLayoutCells(choice.plane, [
    { x: choice.x, y: choice.y, chunkId: choice.to },
  ]);
  if (!res.ok) return { ok: false, error: res.error };

  const after = useClassicLevelStore.getState();
  const grid = choice.plane === 'bg' ? after.doc?.bg : after.doc?.fg;
  const cellAfter = grid ? grid.cells[choice.y * grid.width + choice.x] : -1;
  return {
    ...choice,
    ok: true,
    cellAfter,
    docChanged: cellAfter === choice.to && choice.to !== choice.from,
    dirtyBefore,
    dirtyAfter: Object.keys(after.dirty),
  };
}
