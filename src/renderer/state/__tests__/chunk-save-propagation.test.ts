// THE PAYOFF HALF OF d-18c, IN CI.
//
// A chunk edited in the Art facet and SAVED rewrites every section tile in the
// act that still REMEMBERS that chunk (a chunk link the author has not painted
// over). That promise is painted in the Chunk links panel
// (`CHUNK_LINK_LINKED_BLURB`) and delivered by `saveComposerDocument`'s
// `buildActPropagationCommand` call.
//
// WHY THIS FILE EXISTS. Until 2026-09-12 the ONLY instrument that walked this
// path end to end was `scratchpad/chunk-links-harness.mjs` row 9 — a CDP rig
// that `npm test` never invokes. `test/editing/chunk-links.test.ts` proves
// `buildChunkPropagationCommand` computes the right entries when it is CALLED,
// and `chunk-doc-commit.test.ts` proves a gesture records the right commands;
// nothing asserted that SAVE still calls the propagation builder with a chunk
// whose nametable differs from the section's. So when the d-37 write-through
// (209acd5d) made a gesture fold its contents into the library chunk BEFORE
// Save ran, Save's propagation went silently vacuous — the chunk and the doc
// already agreed, `sliceForSave` produced the words the library already held,
// and the section tiles were left on the old art with their links intact. Every
// node row stayed green for three days.
//
// The rows below drive the STORE path — `commitChunkDocStep` (the gesture) then
// `saveComposerDocument` (the button) — because that ordering is the regression.
// A row that called `buildActPropagationCommand` directly could not have seen
// it. What stays harness-only is the DELIVERY: that a real pointer gesture and
// a real Save click reach these two functions at all.

import { describe, it, expect, beforeEach } from 'vitest';
import { commitChunkDocStep } from '../chunk-doc-commit';
import { saveComposerDocument } from '../art-composer-save';
import { useArtStore } from '../artStore';
import { useProjectStore, getActiveLevel, getCurrentZone } from '../projectStore';
import { useSessionStore } from '../sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { useToastStore } from '../toastStore';
import { documentHistoryHub } from '../history-hub';
import { registerHistoryFactories } from '../history-factories';
import { executeCommand } from '../editorStore';
import { docFromChunk, stampTile } from '../../../core/art/composer-buffer';
import { buildStampCommand } from '../../../core/editing/map-stamp';
import { chunkOriginAt } from '../../../core/editing/chunk-links';
import {
  createChunkDef, createSection, packNametableWord, unpackNametableWord,
  SECTION_TILES_WIDE,
} from '../../../core/model/s4-types';
import type { ChunkDef, Color, Section, Tile } from '../../../core/model/s4-types';

const ZONE = 'ojz';
const ACT = 'act1';
const TAB = `level:${ZONE}:${ACT}`;
const CHUNK = 'ck';

/** 4x4 tiles, so the collision planes are 2x2 cells and an even base can carry
 *  collision — the same shape the real OJZ chunks the harness stamps have. */
const CHUNK_W = 4;
const CHUNK_H = 4;

/** Where the stamp lands in the section. Even on both axes so the placement
 *  records `collision: true`, which is the propagating kind. */
const BASE_COL = 8;
const BASE_ROW = 6;

/** The chunk cell the composer edits. Derived expectations only: nothing below
 *  types in the word this cell ends up holding. */
const EDIT_CX = 3;
const EDIT_CY = 0;

/** The atlas tile the stamp arms. Distinct from every tile the fixture chunk
 *  already references, so "the nametable moved" cannot be a coin landing heads. */
const BRUSH_TILE = 3;

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

function makeTiles(n: number): Tile[] {
  return Array.from({ length: n }, (_unused, i) => ({
    pixels: new Uint8Array(64).fill(i & 0xF),
  }));
}

function fixtureChunk(): ChunkDef {
  const chunk = createChunkDef(CHUNK, 'Chunk', CHUNK_W, CHUNK_H);
  for (let i = 0; i < chunk.nametable.length; i++) {
    chunk.nametable[i] = packNametableWord(1, 0, false, false, false);
  }
  return chunk;
}

function fixtureSection(): Section {
  const section = createSection(0, 'sec0');
  const n = section.tileGrid.nametable.length;
  section.collisionEdit = new Uint16Array(n);
  section.collisionEditB = new Uint16Array(n);
  return section;
}

function fixtureProject(): never {
  return {
    zones: [{
      id: ZONE,
      name: 'OJZ',
      tileset: { tiles: makeTiles(8) },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: ACT, name: 'act1', gridWidth: 1, gridHeight: 1,
        sections: [fixtureSection()],
      }],
    }],
    chunkLibrary: [fixtureChunk()],
    bgLibrary: [],
  } as never;
}

const pstate = () => useProjectStore.getState();
const level = () => getActiveLevel(pstate())!;
const section = () => level().sections[0]!;
const library = () => pstate().project!.chunkLibrary;
const liveChunk = () => library().find((c) => c.id === CHUNK)!;
const openDoc = () => useArtStore.getState().open!.doc;

const idx = (col: number, row: number) => row * SECTION_TILES_WIDE + col;
/** The section tile that carries the chunk cell the composer edits. */
const editedTileIndex = () => idx(BASE_COL + EDIT_CX, BASE_ROW + EDIT_CY);

function setUp(): void {
  documentHistoryHub.clearAll();
  documentHistoryHub.clearFactories();
  registerHistoryFactories();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useArtStore.getState().closeDocument();
  useToastStore.setState({ toasts: [] });
  useProjectStore.setState({ project: fixtureProject() });
  useProjectStore.getState().setCurrentAct(ZONE, ACT);
  useSessionStore.setState({
    tabs: [{ id: TAB, kind: 'level', title: 'OJZ act1' }], activeId: TAB,
  });
  useWorkspaceStore.getState().setFacet(TAB, 'art');

  // THE STAMP, through the real builder the map uses, so the placement and the
  // link plane below are the app's own and not an assertion about their shape.
  const cmd = buildStampCommand({
    chunk: liveChunk(), section: section(), sectionIndex: 0,
    baseCol: BASE_COL, baseRow: BASE_ROW, artOnly: false, description: 'stamp',
  });
  expect(cmd).not.toBeNull();
  executeCommand(cmd!, level());

  // ...then the chunk is opened in the composer, exactly as the Art facet opens
  // one (a double click on its thumbnail).
  useArtStore.getState().openDocument({
    doc: docFromChunk(liveChunk()), liveTileIndex: null, chunkId: CHUNK,
    name: 'Chunk', dirty: false,
  });
}

beforeEach(setUp);

/**
 * The whole authoring gesture: arm a tile, stamp one composer cell, and let the
 * gesture record itself the way `ComposerCanvas.endTileGesture` does (d-37).
 */
function stampCellInComposer(): void {
  const store = useArtStore.getState();
  store.setBrushTile(BRUSH_TILE);
  stampTile(openDoc(), EDIT_CX, EDIT_CY, {
    tile: BRUSH_TILE, pal: 0, hf: false, vf: false, pri: 'keep',
  });
  useArtStore.getState().markOpenDirty();
  commitChunkDocStep(`art: edit chunk ${useArtStore.getState().open!.name}`);
}

describe('a saved chunk edit propagates into the section tiles that still remember it', () => {
  it('[P0] CONTROL: the stamped tile is linked to the chunk and carries the chunk word the edit will change', () => {
    const linked = chunkOriginAt(section(), editedTileIndex());
    expect(linked).not.toBeNull();
    expect(linked!.chunkId).toBe(CHUNK);
    // The section tile holds exactly what the chunk cell holds — so a row that
    // finds them equal AFTER the edit has found a propagation that did nothing,
    // not a fixture that was already right.
    expect(section().tileGrid.nametable[editedTileIndex()])
      .toBe(liveChunk().nametable[EDIT_CY * CHUNK_W + EDIT_CX]);
    expect(unpackNametableWord(liveChunk().nametable[EDIT_CY * CHUNK_W + EDIT_CX]).tileIndex)
      .not.toBe(BRUSH_TILE);
  });

  it('[P1] the gesture moves the chunk in the library, so Save has something to propagate', () => {
    stampCellInComposer();
    expect(unpackNametableWord(liveChunk().nametable[EDIT_CY * CHUNK_W + EDIT_CX]).tileIndex)
      .toBe(BRUSH_TILE);
  });

  it('[P2] SAVE rewrites the linked section tile to the chunk cell the author changed', () => {
    stampCellInComposer();
    saveComposerDocument();
    // Derived from the library chunk as it now stands, never typed in: the
    // section tile must hold the word the chunk holds for that cell.
    expect(section().tileGrid.nametable[editedTileIndex()])
      .toBe(liveChunk().nametable[EDIT_CY * CHUNK_W + EDIT_CX]);
    expect(unpackNametableWord(section().tileGrid.nametable[editedTileIndex()]).tileIndex)
      .toBe(BRUSH_TILE);
  });

  it('[P3] and the tile is STILL linked afterwards, so the next edit propagates too', () => {
    stampCellInComposer();
    saveComposerDocument();
    const linked = chunkOriginAt(section(), editedTileIndex());
    expect(linked).not.toBeNull();
    expect(linked!.chunkId).toBe(CHUNK);
  });
});
