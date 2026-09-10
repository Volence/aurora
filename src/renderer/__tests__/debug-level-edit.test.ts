// THE DIRTY-DOCUMENT DOOR, and the property that makes it worth having.
//
// `docs/reviews/2026-09-10-cdp-sweep.md` §5 parked S2 (the "Saved!" flash) and
// S3 (the toast that names files) as UNMEASURABLE: four routes to a dirty LEVEL
// document all failed, every one of them a limit of the harness's reach rather
// than a fact about the app. `renderer/debug-level-edit.ts` is the door that
// closes that gap, and the whole question about it is not "does it dirty the
// document" but HOW.
//
// A door that reached in and set `dirty` would dirty the document too, and
// would make S2 vacuous: S2 would then prove the chip reacts to a flag, which
// nobody doubts, instead of proving an EDIT reaches the chip. So the rows here
// are built to go red on that degradation specifically:
//
//   • THE UNDO ROW is the load-bearing one. A raw `setState({ dirty })` records
//     no history entry, so "exactly one undo step, and undoing restores the
//     byte AND clears the domain" cannot pass unless the write went through
//     `classicSetLayoutCells` -> `commitLayout` -> the real history hub.
//   • THE DOC-BYTES ROWS pin that a real byte moved, so a door that dirtied
//     without editing fails them.
//   • THE PRODUCER GUARD reads `ClassicLevelViewport.tsx` rather than this
//     module: the door's whole justification is that a person's stamp gesture
//     ends in the SAME call, and that sentence lives in the viewport. If the
//     viewport is re-routed, the door's claim is stale and this is the only row
//     that could notice.
//
// RUNNER: vitest (`npm test` -> the check:* chain, `npm run typecheck`, then
// `vitest run`). Node environment; no DOM is needed because the door is a store
// write and the fixture is the shared classic fixture the store's own suite
// uses.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampLayoutCell, chooseLayoutStamp } from '../debug-level-edit';
import {
  useClassicLevelStore,
  layoutDocIdForCurrentAct,
} from '../state/classicLevelStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { documentHistoryHub } from '../state/history-hub';
import { makeDoc, openReady } from '../state/__tests__/helpers/classic-fixture';

const st = () => useClassicLevelStore.getState();
const layoutStack = () => documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!);

const HERE = fileURLToPath(new URL('.', import.meta.url));
const read = (rel: string): string => readFileSync(join(HERE, '..', rel), 'utf8');

/**
 * Source with comments removed, so a guard about CODE cannot be satisfied or
 * broken by prose. Every one of these files documents its own rule at length,
 * and a `not.toMatch` over raw source would fire on the sentence explaining why
 * the thing is forbidden.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  documentHistoryHub.clearAll();
});

// ---------------------------------------------------------------------------
// The choice: pure, and it must never pick a byte that is already there.
// ---------------------------------------------------------------------------

describe('chooseLayoutStamp', () => {
  it('picks a byte that DIFFERS from the one in the cell, on both planes', () => {
    const doc = makeDoc(); // fg cells [0,1,0,1]; bg cells [0,0,0,0]
    const fg = chooseLayoutStamp(doc, 'fg');
    const bg = chooseLayoutStamp(doc, 'bg');
    expect('error' in fg, JSON.stringify(fg)).toBe(false);
    expect('error' in bg, JSON.stringify(bg)).toBe(false);
    if ('error' in fg || 'error' in bg) return;
    expect(fg.to).not.toBe(fg.from);
    expect(bg.to).not.toBe(bg.from);
    // Both fixture cells hold air, so both choices must reach for a real id.
    expect(fg.from).toBe(0);
    expect(fg.to).toBe(1);
    expect(bg.to).toBe(1);
  });

  it('picks air when the cell holds a real chunk id', () => {
    const doc = makeDoc();
    doc.fg.cells[0] = 2;
    const c = chooseLayoutStamp(doc, 'fg');
    expect('error' in c).toBe(false);
    if ('error' in c) return;
    expect(c.from).toBe(2);
    expect(c.to).toBe(0);
  });

  it('picks a cell inside the WRITABLE region the store enforces', () => {
    const doc = makeDoc();
    const c = chooseLayoutStamp(doc, 'fg');
    expect('error' in c).toBe(false);
    if ('error' in c) return;
    const bound = Math.min(doc.fg.cells.length, doc.fg.width * doc.fg.height);
    expect(c.y * doc.fg.width + c.x).toBeLessThan(bound);
  });

  it('refuses, rather than guessing, when no legal different byte exists', () => {
    const doc = makeDoc();
    doc.chunks = []; // no engine id exists, and the cell already holds air
    expect(chooseLayoutStamp(doc, 'fg')).toHaveProperty('error');

    const empty = makeDoc();
    empty.fg = { width: 0, height: 0, cells: new Uint8Array(0) };
    expect(chooseLayoutStamp(empty, 'fg')).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// The door: a real edit, committed through the app's own action.
// ---------------------------------------------------------------------------

describe('stampLayoutCell', () => {
  it('changes a real byte in the document and reports the byte it READ BACK', () => {
    openReady();
    expect(Array.from(st().doc!.fg.cells)).toEqual([0, 1, 0, 1]);

    const r = stampLayoutCell('fg');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.from).toBe(0);
    expect(r.to).toBe(1);
    expect(r.cellAfter).toBe(1);
    expect(r.docChanged).toBe(true);
    // The document itself, not the report about it.
    expect(Array.from(st().doc!.fg.cells)).toEqual([1, 1, 0, 1]);
  });

  it('dirties the LEVEL document, and names only the domain it edited', () => {
    openReady();
    const r = stampLayoutCell('fg');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dirtyBefore).toEqual([]);
    expect(r.dirtyAfter).toEqual(['fg']);
    // Read off the store rather than off the report, so the report cannot be
    // the only witness to its own claim.
    expect(st().dirty.fg).toBe(true);
    expect(Object.keys(st().dirty)).toEqual(['fg']);
  });

  // ⚠ THE ROW THAT REFUSES THE DEGRADATION. A door that set `dirty` directly
  // would pass every row above except the byte reads, and would pass all of
  // them if it also poked the doc. It could not pass this one: history is
  // recorded by `commitLayout`, so an undo step existing at all is evidence
  // that the app's own commit path ran.
  it('records exactly ONE undo step, and undoing restores the byte AND clears the domain', () => {
    openReady();
    expect(layoutStack().canUndo).toBe(false);

    const r = stampLayoutCell('fg');
    expect(r.ok).toBe(true);
    expect(layoutStack().canUndo).toBe(true);

    layoutStack().undo();
    expect(Array.from(st().doc!.fg.cells)).toEqual([0, 1, 0, 1]);
    expect(st().dirty.fg).toBeUndefined();
    // One step, not two: a second undo has nothing left to take.
    expect(layoutStack().canUndo).toBe(false);

    layoutStack().redo();
    expect(st().doc!.fg.cells[0]).toBe(1);
    expect(st().dirty.fg).toBe(true);
  });

  it('targets the bg plane independently when asked', () => {
    openReady();
    const r = stampLayoutCell('bg');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plane).toBe('bg');
    expect(st().doc!.bg.cells[0]).toBe(1);
    expect(st().dirty.bg).toBe(true);
    expect(st().dirty.fg).toBeUndefined();
    expect(Array.from(st().doc!.fg.cells)).toEqual([0, 1, 0, 1]);
  });

  it('defaults to the fg plane', () => {
    openReady();
    const r = stampLayoutCell();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plane).toBe('fg');
  });

  it('refuses with no level open, and dirties nothing', () => {
    const r = stampLayoutCell('fg');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('no classic level is open');
    expect(Object.keys(st().dirty)).toEqual([]);
  });

  it('refuses when no legal different byte exists, and dirties nothing', () => {
    const doc = makeDoc();
    doc.chunks = [];
    openReady(doc);
    const r = stampLayoutCell('fg');
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(Object.keys(st().dirty)).toEqual([]);
    expect(layoutStack().canUndo).toBe(false);
  });

  it('a second call is still a real change, not a repeat of the same byte', () => {
    openReady();
    const a = stampLayoutCell('fg');
    const b = stampLayoutCell('fg');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.from).toBe(a.to);
    expect(b.to).not.toBe(b.from);
    expect(b.docChanged).toBe(true);
    expect(st().doc!.fg.cells[0]).toBe(b.to);
  });
});

// ---------------------------------------------------------------------------
// Source guards. Two of them read files this module does not own, on purpose.
// ---------------------------------------------------------------------------

describe('the door goes through the public action and nothing else', () => {
  // ⚠ FOUR ROWS, NOT ONE, and the reason is a measured one. Written as a single
  // row with four assertions, the first failure aborts the rest, so a mutation
  // that trips three of them reddens one line and the other two are never
  // evaluated. That is indistinguishable from three guards that do not exist.
  it('the door module commits with classicSetLayoutCells', () => {
    expect(codeOnly(read('debug-level-edit.ts'))).toContain('classicSetLayoutCells(');
  });

  it('the door module never calls setState', () => {
    expect(codeOnly(read('debug-level-edit.ts'))).not.toMatch(/\.setState\s*\(/);
  });

  it('the door module never assigns a dirty flag', () => {
    expect(codeOnly(read('debug-level-edit.ts'))).not.toMatch(/\bdirty\s*:/);
  });

  it('the door module never reaches past the public action to commitLayout', () => {
    expect(codeOnly(read('debug-level-edit.ts'))).not.toMatch(/\bcommitLayout\s*\(/);
  });

  it('the probe delegates to the door module rather than committing inline', () => {
    const src = codeOnly(read('debug-hooks.ts'));
    expect(src).toContain("stampLayoutCell, type StampLayoutCellReport } from './debug-level-edit'");
    expect(src).toMatch(/stampLayoutCell:\s*\(plane\)\s*=>\s*stampLayoutCell\(/);
    expect(src, 'debug-hooks must not commit a layout edit of its own')
      .not.toMatch(/classicSetLayoutCells\s*\(/);
  });

  // ⚠ THIS ROW IS ABOUT THE PRODUCER, NOT THE DOOR. The door's justification is
  // one sentence: a person's stamp gesture ends in this same call. That
  // sentence is true in ClassicLevelViewport, not here, so this is the only row
  // that can notice it going stale.
  it("the viewport's own stamp gesture still ends in the same call", () => {
    const src = codeOnly(read('components/classic/ClassicLevelViewport.tsx'));
    expect(src).toMatch(/classicSetLayoutCells\(\s*plane\s*,\s*cells\s*\)/);
  });
});
