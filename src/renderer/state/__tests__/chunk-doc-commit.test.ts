// THE REPAIR THIS FILE GUARDS, AND THE HALF IT CANNOT.
//
// Owner ruling d-37 `route_onto_zone_stack` closed a defect that destroyed the
// owner's work silently: on a chunk document, every gesture that wrote only
// into the composer's buffer recorded NOTHING, while `focusedDocId()` resolved
// the art facet to `zoneart:<zone>` anyway. Ctrl+Z therefore reached the
// zone-art stack and reverted an EARLIER edit made somewhere else, one per
// press, while the author's own stroke survived. Because the chunk's cells
// reference the reverted tile the canvas repainted, so it looked like a
// successful undo. Both halves are stated as rows below (group C).
//
// The repair landed proven by two CDP harnesses -- `harness:chunk-undo-measure`
// and `harness:chunk-undo-redo` -- and NEITHER RUNS IN `npm test`. A fix for a
// silent-destruction defect guarded only by instruments the suite never invokes
// is the same shape as the defect it fixed: a thing that looks fine and is not.
// This file is the CI half.
//
// WHAT THESE ROWS HOLD: the routing decisions of
// `state/chunk-doc-commit.ts` -- which commands a gesture pushes, onto which
// document, in which order, how many steps one gesture costs, what an undo
// takes back and what it leaves alone, and the fold-back that
// `syncChunkDocFromLibrary` exists to prevent.
//
// WHAT THESE ROWS DO NOT HOLD, and what stays harness-only:
//
//   * THE DELIVERY. Node cannot mount `ComposerCanvas`, so nothing here proves
//     a real pointer gesture reaches `commitWrites` / `endTileGesture`, that
//     the `useEffect([historyVersion, open])` really fires after an undo, or
//     that a real Ctrl+Z reaches `focusedHistory()`. Group F reads the SOURCE
//     for those five sites, which catches deletion and nothing subtler; it is
//     labelled as such and must not be read as behaviour.
//   * THE PAINT. Whether the canvas shows the reverted state is a render, and
//     the whole original defect was that a wrong undo LOOKED right on screen.
//     Only the harnesses can see that.
//   * The transforms, paste, cut and selection move as GESTURES. Group A drives
//     the tail they all share; no row here drives the options-bar button.
//
// See docs/reviews/2026-09-09-chunk-commit-node-rows.md.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  commitChunkDocStep, isChunkDocument, syncChunkDocFromLibrary,
} from '../chunk-doc-commit';
import { useArtStore, isPureDocLocal } from '../artStore';
import type { OpenDocument } from '../artStore';
import { useProjectStore, getActiveLevel, getCurrentZone } from '../projectStore';
import { useSessionStore } from '../sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { useToastStore } from '../toastStore';
import { documentHistoryHub } from '../history-hub';
import { registerHistoryFactories } from '../history-factories';
import { executeCommand, focusedDocId } from '../editorStore';
import { recordComposerEdit } from '../composer-history';
import {
  adoptPaletteLineForEmptyCells, createDoc, docFromChunk, setPixels, stampTile,
} from '../../../core/art/composer-buffer';
import { paintDocCollision } from '../../../core/art/composer-collision';
import {
  createChunkDef, createSection, packNametableWord,
} from '../../../core/model/s4-types';
import type { ChunkDef, Color, Tile } from '../../../core/model/s4-types';
import type { AnyCommand, SetTilesetTilesCommand } from '../../../core/editing/commands';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const ZONE = 'ojz';
const ACT = 'act1';
const TAB = `level:${ZONE}:${ACT}`;
const ZONE_ART = `zoneart:${ZONE}`;
const CHUNK = 'ck';

/** The chunk is 4x4 tiles, so its collision planes are 2x2 cells. */
const CHUNK_W = 4;
const CHUNK_H = 4;

/** Cell (1,0) of the fixture chunk, the one cell left EMPTY. Doc pixel (8,0)
 *  is inside it, which is where every pencil row below paints. */
const EMPTY_CELL = 1;
const EMPTY_CELL_X = 8;

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

/** Distinct art per tile, so "the atlas moved" is never a coin that lands
 *  heads: tile i is filled with i. Tile 0 is all zero, which is also what an
 *  unpainted local buffer looks like -- the pencil rows write a nonzero pixel
 *  so their local tile matches no atlas tile and must really be APPENDED. */
function makeTiles(n: number): Tile[] {
  return Array.from({ length: n }, (_unused, i) => ({
    pixels: new Uint8Array(64).fill(i & 0xF),
  }));
}

function fixtureChunk(): ChunkDef {
  const chunk = createChunkDef(CHUNK, 'Chunk', CHUNK_W, CHUNK_H);
  for (let i = 0; i < chunk.nametable.length; i++) {
    chunk.nametable[i] = packNametableWord(2, 1, false, false, false);
  }
  chunk.nametable[0] = packNametableWord(1, 1, false, false, false);
  chunk.nametable[EMPTY_CELL] = 0;
  return chunk;
}

function fixtureProject(tileCount = 4): never {
  return {
    zones: [{
      id: ZONE,
      name: 'OJZ',
      tileset: { tiles: makeTiles(tileCount) },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: ACT, name: 'act1', gridWidth: 1, gridHeight: 1,
        sections: [createSection(0, 'sec0')],
      }],
    }],
    chunkLibrary: [fixtureChunk()],
    bgLibrary: [],
  } as never;
}

const pstate = () => useProjectStore.getState();
const level = () => getActiveLevel(pstate())!;
const atlas = () => getCurrentZone(pstate())!.tileset.tiles;
const library = () => pstate().project!.chunkLibrary;
const liveChunk = () => library().find((c) => c.id === CHUNK);
const openDoc = () => useArtStore.getState().open!.doc;
const artStack = () => documentHistoryHub.historyFor(ZONE_ART);

function chunkDoc(over: Partial<OpenDocument> = {}): OpenDocument {
  return {
    doc: docFromChunk(liveChunk()!), liveTileIndex: null, chunkId: CHUNK,
    name: 'Chunk', dirty: false, ...over,
  };
}

/** Open the fixture chunk through the REAL opener, so `composerDocId` is
 *  derived the way the app derives it rather than asserted into place. */
function openChunkDocument(): void {
  useArtStore.getState().openDocument(chunkDoc());
}

function setUp(tileCount = 4): void {
  documentHistoryHub.clearAll();
  documentHistoryHub.clearFactories();
  registerHistoryFactories();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useArtStore.getState().closeDocument();
  useToastStore.setState({ toasts: [] });
  useProjectStore.setState({ project: fixtureProject(tileCount) });
  useProjectStore.getState().setCurrentAct(ZONE, ACT);
  useSessionStore.setState({
    tabs: [{ id: TAB, kind: 'level', title: 'OJZ act1' }], activeId: TAB,
  });
  useWorkspaceStore.getState().setFacet(TAB, 'art');
  openChunkDocument();
}

beforeEach(() => setUp());

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/**
 * Every command pushed onto the zone-art stack while `fn` runs, as the object
 * the stack received.
 *
 * This reads the PAYLOAD, not a call count and not a message: the whole class
 * of defect this file guards is a gesture that records the wrong thing (or
 * nothing) on the right stack, which a count alone cannot see. Group C then
 * checks the same claim from the state side by walking the stack with undo,
 * so no property here rests on the spy alone.
 */
function stepsOf(fn: () => void): AnyCommand[] {
  const stack = artStack() as unknown as {
    execute?: (cmd: AnyCommand, lvl?: unknown) => void;
  };
  const real = stack.execute!.bind(stack);
  const steps: AnyCommand[] = [];
  stack.execute = (cmd, lvl) => { steps.push(cmd); real(cmd, lvl); };
  try { fn(); } finally { delete stack.execute; }
  return steps;
}

/** Every document id the history hub was asked for while `fn` runs. A second
 *  stack cannot be minted without appearing here. */
function docIdsTouchedBy(fn: () => void): string[] {
  const hub = documentHistoryHub as unknown as { historyFor?: unknown };
  const real = documentHistoryHub.historyFor.bind(documentHistoryHub);
  const seen: string[] = [];
  hub.historyFor = (id: string) => { seen.push(id); return real(id); };
  try { fn(); } finally { delete hub.historyFor; }
  return seen;
}

/** The leaves of a step, whether or not it was batched. */
function leaves(cmd: AnyCommand): AnyCommand[] {
  return cmd.type === 'batch' ? cmd.commands.flatMap(leaves) : [cmd];
}

const typesOf = (cmd: AnyCommand) => leaves(cmd).map((c) => c.type);

// ---------------------------------------------------------------------------
// Gestures, built the way ComposerCanvas builds them
// ---------------------------------------------------------------------------

/** An in-place edit of an EXISTING atlas tile: what a pencil stroke on an
 *  atlas-backed cell hands `commitChunkDocStep` as `leading` (census P3a). */
function leadingTileEdit(tileIndex: number, value: number): SetTilesetTilesCommand {
  const old = new Uint8Array(atlas()[tileIndex].pixels);
  const next = new Uint8Array(old);
  next[0] = value & 0xF;
  return {
    type: 'set-tileset-tiles', description: `art: edit tile #${tileIndex}`,
    sectionIndex: -1, at: tileIndex,
    oldTiles: [{ pixels: old }], newTiles: [{ pixels: next }],
  };
}

/** The doc-local half of a pencil stroke on the EMPTY cell, applied exactly as
 *  `commitWrites` applies it (palette adoption, then `setPixels`). */
function paintEmptyCell(value = 5): void {
  const writes = [{ x: EMPTY_CELL_X, y: 0, value }];
  adoptPaletteLineForEmptyCells(openDoc(), writes, useArtStore.getState().paletteLine);
  setPixels(openDoc(), atlas(), writes);
  useArtStore.getState().markOpenDirty();
}

/** The whole P3b gesture: paint an empty cell, then commit it. */
function pencilOnEmptyCell(value = 5): boolean {
  paintEmptyCell(value);
  return commitChunkDocStep('art: edit chunk Chunk');
}

/** An EARLIER zone-art edit, made before the author opens the chunk: the thing
 *  the defect ate. Returns the pixels it wrote. */
function earlierZoneArtEdit(value = 7): Uint8Array {
  const cmd = leadingTileEdit(0, value);
  executeCommand(cmd, level());
  return new Uint8Array(cmd.newTiles[0].pixels);
}

const tile0 = () => Array.from(atlas()[0].pixels);

// ---------------------------------------------------------------------------
// A. One gesture becomes ONE step, and the step is the right shape
// ---------------------------------------------------------------------------

describe('one gesture, one step, on the zone-art stack', () => {
  it('[A1] the fixture really routes to the zone-art document, so the rows below discriminate', () => {
    expect(isChunkDocument(useArtStore.getState().open)).toBe(true);
    expect(focusedDocId()).toBe(ZONE_ART);
    expect(artStack().canUndo).toBe(false);
    // ...and the cell the pencil rows paint really is empty, so "the stroke
    // had to materialise a tile" is a measurement rather than an assumption.
    expect(openDoc().cells[EMPTY_CELL].atlasTile).toBeNull();
    expect(openDoc().cells[EMPTY_CELL].localId).toBeNull();
  });

  it('[A2] a pencil on an EMPTY cell records exactly one step: the tile append, then the set-chunk', () => {
    const steps = stepsOf(() => expect(pencilOnEmptyCell()).toBe(true));
    expect(steps.length).toBe(1);
    expect(typesOf(steps[0])).toEqual(['set-tileset-tiles', 'set-chunk']);
  });

  it('[A3] the appended tile is the painted one, and the cell now points at it', () => {
    const before = atlas().length;
    const steps = stepsOf(() => pencilOnEmptyCell(5));
    const append = leaves(steps[0])[0] as SetTilesetTilesCommand;
    expect(append.at).toBe(before);
    expect(append.oldTiles).toEqual([null]);          // appended, so undo truncates
    expect(append.newTiles[0].pixels[0]).toBe(5);
    expect(atlas().length).toBe(before + 1);
    expect(liveChunk()!.nametable[EMPTY_CELL] & 0x7FF).toBe(before);
  });

  it('[A4] a collision paint records ONE bare set-chunk: no tile is materialised', () => {
    const steps = stepsOf(() => {
      paintDocCollision(openDoc(), 'a', 0, 0, 0x1234);
      expect(commitChunkDocStep('art: edit chunk Chunk collision')).toBe(true);
    });
    expect(steps.length).toBe(1);
    expect(typesOf(steps[0])).toEqual(['set-chunk']);
    expect(liveChunk()!.collisionA[0]).toBe(0x1234);
  });

  it('[A5] a tile stamp of an art tile already in the atlas records ONE bare set-chunk', () => {
    const before = atlas().length;
    const steps = stepsOf(() => {
      stampTile(openDoc(), 1, 0, { tile: 3, pal: 1, hf: false, vf: false, pri: 'keep' });
      expect(commitChunkDocStep('art: edit chunk Chunk')).toBe(true);
    });
    expect(steps.length).toBe(1);
    expect(typesOf(steps[0])).toEqual(['set-chunk']);
    expect(atlas().length).toBe(before);            // nothing materialised
    expect(liveChunk()!.nametable[EMPTY_CELL] & 0x7FF).toBe(3);
  });

  it('[A6] a stroke wholly on ATLAS-BACKED cells records ONE bare set-tileset-tiles: no set-chunk', () => {
    // P3a. The document does not change, so there is nothing for the chunk half
    // to record -- "only where needed", read from the other side.
    const steps = stepsOf(() => {
      expect(commitChunkDocStep('art: edit chunk Chunk', [leadingTileEdit(1, 9)])).toBe(true);
    });
    expect(steps.length).toBe(1);
    expect(typesOf(steps[0])).toEqual(['set-tileset-tiles']);
    expect(atlas()[1].pixels[0]).toBe(9);
  });

  it('[A7] a stroke crossing both kinds of cell is ONE batch, atlas edit first', () => {
    const steps = stepsOf(() => {
      paintEmptyCell(5);
      expect(commitChunkDocStep('art: edit chunk Chunk', [leadingTileEdit(1, 9)])).toBe(true);
    });
    expect(steps.length).toBe(1);
    expect(typesOf(steps[0])).toEqual([
      'set-tileset-tiles', 'set-tileset-tiles', 'set-chunk',
    ]);
    // The in-place edit is the one that goes first: it is the caller's, and the
    // append is measured against the atlas AFTER it.
    const [inPlace, append] = leaves(steps[0]) as SetTilesetTilesCommand[];
    expect(inPlace.at).toBe(1);
    expect(append.at).toBe(4);
  });

  it('[A8] a commit with nothing new to record records NOTHING, so a drag is not two steps', () => {
    pencilOnEmptyCell();
    const steps = stepsOf(() => expect(commitChunkDocStep('art: edit chunk Chunk')).toBe(false));
    expect(steps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B. No second stack is minted
// ---------------------------------------------------------------------------

describe('a chunk document does not acquire a stack of its own', () => {
  it('[B1] opening one mints no composer document id', () => {
    expect(useArtStore.getState().composerDocId).toBeNull();
    expect(isPureDocLocal(useArtStore.getState().open)).toBe(false);
  });

  it('[B2] the only history a gesture touches is the zone-art one', () => {
    const seen = docIdsTouchedBy(() => pencilOnEmptyCell());
    expect(seen.length).toBeGreaterThan(0);
    expect([...new Set(seen)]).toEqual([ZONE_ART]);
  });

  it('[B3] recordComposerEdit, which the allowCow tail still calls, mints nothing here', () => {
    // The two mechanisms each state the other's half in their headers; this is
    // the half a node row can hold. A snapshot stack for the doc-local writes
    // would be the second history on one document that `focusedDocId`'s
    // bgOverride comment says already caused a live defect.
    const seen = docIdsTouchedBy(() => recordComposerEdit());
    expect(seen).toEqual([]);
    expect(artStack().canUndo).toBe(false);
  });

  it.each([
    ['no document at all', null],
    ['a pure doc-local buffer with no chunk', { chunkId: null }],
    ['a live-tile document', { liveTileIndex: 3 }],
    ['a BG-override document', { bgOverride: { kind: 'band', index: 0 } }],
  ])('[B4] isChunkDocument says no to %s', (_name, over) => {
    const open = over === null ? null : chunkDoc(over as Partial<OpenDocument>);
    expect(isChunkDocument(open)).toBe(false);
  });

  it('[B5] a pure doc-local document gets nothing from commitChunkDocStep', () => {
    useArtStore.getState().openDocument({
      doc: createDoc(2, 2), liveTileIndex: null, chunkId: null,
      name: 'New Chunk', dirty: false,
    });
    const steps = stepsOf(() => expect(commitChunkDocStep('art: new chunk')).toBe(false));
    expect(steps).toEqual([]);
    expect(artStack().canUndo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. THE DEFECT, both halves: undo takes back the author's own gesture and
//    leaves the earlier zone-art edit alone
// ---------------------------------------------------------------------------

describe('undo on a chunk document means what it says', () => {
  it('[C1] one press takes back the stroke; the earlier zone-art edit survives it', () => {
    const eaten = earlierZoneArtEdit(7);              // the edit the defect ate
    expect(tile0()).toEqual([...eaten]);

    const chunkBefore = new Uint16Array(liveChunk()!.nametable);
    const tilesBefore = atlas().length;
    expect(pencilOnEmptyCell()).toBe(true);
    expect(liveChunk()!.nametable).not.toEqual(chunkBefore);   // the stroke landed
    expect(atlas().length).toBe(tilesBefore + 1);

    artStack().undo();

    // The author's OWN gesture is what came back.
    expect(liveChunk()!.nametable).toEqual(chunkBefore);
    expect(atlas().length).toBe(tilesBefore);
    // ...and the earlier edit is untouched, which is the half that made the
    // defect silent: the canvas repainted either way.
    expect(tile0()).toEqual([...eaten]);
    expect(artStack().canUndo).toBe(true);

    // Exactly one slot was consumed: the next press is the earlier edit, and
    // then the stack is empty. Two recorded steps would leave one over.
    artStack().undo();
    expect(tile0()).toEqual(new Array(64).fill(0));
    expect(artStack().canUndo).toBe(false);
  });

  it('[C2] the same for a collision paint, which carries no art at all', () => {
    const eaten = earlierZoneArtEdit(7);
    paintDocCollision(openDoc(), 'a', 0, 0, 0x1234);
    paintDocCollision(openDoc(), 'b', 0, 0, 0x0678);
    expect(commitChunkDocStep('art: edit chunk Chunk collision')).toBe(true);
    expect(liveChunk()!.collisionA[0]).toBe(0x1234);
    expect(liveChunk()!.collisionB[0]).toBe(0x0678);

    artStack().undo();

    expect(liveChunk()!.collisionA[0]).toBe(0);
    expect(liveChunk()!.collisionB[0]).toBe(0);
    expect(tile0()).toEqual([...eaten]);
    expect(artStack().canUndo).toBe(true);
  });

  it('[C3] redo puts the author\'s own gesture back, not somebody else\'s', () => {
    const eaten = earlierZoneArtEdit(7);
    pencilOnEmptyCell();
    const after = new Uint16Array(liveChunk()!.nametable);

    artStack().undo();
    artStack().redo();

    expect(liveChunk()!.nametable).toEqual(after);
    expect(tile0()).toEqual([...eaten]);
  });
});

// ---------------------------------------------------------------------------
// D. syncChunkDocFromLibrary: what stops an undo from undoing itself
// ---------------------------------------------------------------------------

describe('the composer follows the library after an undo', () => {
  it('[D1] an undo leaves the open document STALE, and the sync is what resolves it', () => {
    pencilOnEmptyCell();
    const appended = atlas().length - 1;
    expect(openDoc().cells[EMPTY_CELL].atlasTile).toBe(appended);

    artStack().undo();
    // The library chunk went back; the document did not. It still points at a
    // tile index the undo has just truncated away.
    expect(liveChunk()!.nametable[EMPTY_CELL]).toBe(0);
    expect(openDoc().cells[EMPTY_CELL].atlasTile).toBe(appended);
    expect(atlas().length).toBe(appended);

    syncChunkDocFromLibrary();

    expect(openDoc().cells[EMPTY_CELL].atlasTile).toBeNull();
    expect(openDoc().cells[EMPTY_CELL].localId).toBeNull();
  });

  it('[D2] WITHOUT the sync, the next gesture folds the undone stroke straight back in', () => {
    // This is the defect the effect exists to prevent, stated as a property:
    // the next commit diffs the STALE document against the reverted chunk and
    // records the undone work all over again.
    pencilOnEmptyCell();
    artStack().undo();
    const reverted = new Uint16Array(liveChunk()!.nametable);

    const steps = stepsOf(() => expect(commitChunkDocStep('art: next gesture')).toBe(true));

    expect(typesOf(steps[0])).toContain('set-chunk');
    expect(liveChunk()!.nametable).not.toEqual(reverted);   // the undo was undone
  });

  it('[D3] WITH the sync, the same next gesture records nothing and the undo stands', () => {
    pencilOnEmptyCell();
    artStack().undo();
    const reverted = new Uint16Array(liveChunk()!.nametable);

    syncChunkDocFromLibrary();
    const steps = stepsOf(() => expect(commitChunkDocStep('art: next gesture')).toBe(false));

    expect(steps).toEqual([]);
    expect(liveChunk()!.nametable).toEqual(reverted);
  });

  it('[D4] it is a no-op when the two already agree, so the clock can tick freely', () => {
    // The same clock ticks for every in-place atlas edit, which moves pixels
    // and no nametable word. A rebuild on every tick would be a repaint storm.
    const version = useArtStore.getState().docVersion;
    syncChunkDocFromLibrary();
    expect(useArtStore.getState().docVersion).toBe(version);
  });

  it('[D5] and a no-op on a document that is not a chunk document', () => {
    useArtStore.getState().openDocument({
      doc: createDoc(2, 2), liveTileIndex: null, chunkId: null,
      name: 'New Chunk', dirty: false,
    });
    const before = openDoc().cells.map((c) => ({ ...c }));
    syncChunkDocFromLibrary();
    expect(openDoc().cells).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// E. A refusal to RECORD must never become a refusal to EDIT
// ---------------------------------------------------------------------------

describe('when the chunk half cannot be built', () => {
  it('[E1] the atlas edits it was handed still execute, alone', () => {
    useProjectStore.setState({
      project: { ...pstate().project!, chunkLibrary: [] } as never,
    });
    const steps = stepsOf(() => {
      expect(commitChunkDocStep('art: edit chunk Chunk', [leadingTileEdit(1, 9)])).toBe(true);
    });
    expect(steps.length).toBe(1);
    expect(typesOf(steps[0])).toEqual(['set-tileset-tiles']);
    expect(atlas()[1].pixels[0]).toBe(9);             // the edit LANDED
    expect(useToastStore.getState().toasts.length).toBeGreaterThan(0);
  });

  it('[E2] and with no atlas edits to execute there is simply no step', () => {
    useProjectStore.setState({
      project: { ...pstate().project!, chunkLibrary: [] } as never,
    });
    const steps = stepsOf(() => {
      paintEmptyCell();
      expect(commitChunkDocStep('art: edit chunk Chunk')).toBe(false);
    });
    expect(steps).toEqual([]);
  });

  it('[E3] at the tileset ceiling the stroke stays in the document, unrecorded, not thrown away', () => {
    setUp(0x800);                                     // a full tileset
    paintEmptyCell(5);
    const localId = openDoc().cells[EMPTY_CELL].localId;
    expect(localId).not.toBeNull();

    const steps = stepsOf(() => expect(commitChunkDocStep('art: edit chunk Chunk')).toBe(false));

    expect(steps).toEqual([]);
    // The pixels are still the author's to look at and to save later. Dropping
    // them would turn "cannot record this" into "cannot draw this".
    expect(openDoc().localPixels.get(localId!)![0]).toBe(5);
    expect(useToastStore.getState().toasts.length).toBeGreaterThan(0);
  });

  it('[E4] and the sync refuses to rebuild there too, rather than destroying the document', () => {
    setUp(0x800);
    paintEmptyCell(5);
    const before = openDoc().cells.map((c) => ({ ...c }));
    syncChunkDocFromLibrary();
    expect(openDoc().cells).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// F. THE CALL SITES -- A SOURCE READ, NOT A BEHAVIOUR
//
// ⚠ These two rows catch DELETION of a call site and nothing subtler. They do
// not prove a gesture reaches one, that the effect fires, or that anything is
// rendered. `harness:chunk-undo-measure` and `harness:chunk-undo-redo` are the
// only instruments that hold those, and they do not run in `npm test`.
// ---------------------------------------------------------------------------

describe('the call sites still exist in ComposerCanvas (source read)', () => {
  const SRC = join(__dirname, '..', '..');
  const code = () => readFileSync(
    join(SRC, 'components', 'art', 'ComposerCanvas.tsx'), 'utf8');

  it('[F1] all four commit sites are present', () => {
    // commitWrites' atlas branch, its allowCow doc-local tail, endTileGesture,
    // and the map clipboard's collision paste.
    const calls = code().match(/commitChunkDocStep\(/g) ?? [];
    expect(calls.length).toBe(4);
  });

  it('[F2] the re-sync effect is present and keyed on the history clock', () => {
    expect(code()).toMatch(
      /useEffect\(\(\) => \{ syncChunkDocFromLibrary\(\); \}, \[historyVersion, open\]\)/);
  });
});
