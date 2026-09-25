// ART-STROKE-FOLLOWUPS (c), UNDO-DIRTY: UNDOING A CHUNK DOCUMENT BACK TO ITS
// SAVED STATE READS CLEAN, AND REDOING AWAY FROM IT READS DIRTY AGAIN.
// (docs/reviews/2026-09-25-art-stroke-followups.md)
//
// A chunk document writes through (owner ruling d-37, state/chunk-doc-commit.ts):
// each gesture is one step on the `zoneart:<zone>` stack, and an undo rewrites
// the LIBRARY chunk, after which `ComposerCanvas`'s history-clock effect rebuilds
// the document from it (`syncChunkDocFromLibrary`). `open.dirty` was set by the
// gesture (`markOpenDirty`) and nothing on that path ever cleared it, so a
// chunk undone back to exactly what was opened still read "unsaved" and the
// discard prompt still asked (row 207's O2). The pure doc-local document has had
// this since the save contract's R5 (`state/composer-history.ts` restores the
// flag its snapshot carried); these rows ask the same of a chunk document.
//
// These rows mount the real `ComposerCanvas` with the no-DOM harness
// (`src/test/render-hooked.ts`), so the history-clock effect that follows an
// undo is the composer's own, not a call made by the test. Strokes go through
// the `hostPointer` it hands PixelViewport; undo and redo go through
// `focusedHistory()`, the stack Ctrl+Z and the toolbar resolve.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../../test/window-stub';
import { useProjectStore } from '../../../state/projectStore';
import { useArtStore } from '../../../state/artStore';
import { useSessionStore } from '../../../state/sessionStore';
import { useWorkspaceStore } from '../../../workspace/workspaceStore';
import { useToastStore } from '../../../state/toastStore';
import { documentHistoryHub } from '../../../state/history-hub';
import { registerHistoryFactories } from '../../../state/history-factories';
import { focusedDocId, focusedHistory } from '../../../state/editorStore';
import { composerSaveState } from '../../../state/art-composer-save';
import { planArtDocDiscard } from '../open-document';
import { docFromChunk, cloneComposerDoc, type ComposerDoc } from '../../../../core/art/composer-buffer';
import { createChunkDef, createSection, packNametableWord } from '../../../../core/model/s4-types';
import type { ChunkDef, Color, Tile } from '../../../../core/model/s4-types';
import PixelViewport, { type HostPointer } from '../../art-shared/PixelViewport';

// ── the fixture ────────────────────────────────────────────────────────────────

const ZONE = 'ojz';
const ACT = 'act1';
const TAB = `level:${ZONE}:${ACT}`;
const ZONE_ART = `zoneart:${ZONE}`;
const CHUNK = 'ck';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });
/** Tile i is filled with i, so no two tiles are alike. */
const makeTiles = (n: number): Tile[] => Array.from({ length: n }, (_u, i) => ({ pixels: new Uint8Array(64).fill(i & 0xF) }));

/** A 4x2-tile chunk: every cell tile 1, line 1, no flips. */
function fixtureChunk(): ChunkDef {
  const chunk = createChunkDef(CHUNK, 'Chunk', 4, 2);
  for (let i = 0; i < chunk.nametable.length; i++) chunk.nametable[i] = packNametableWord(1, 1, false, false, false);
  return chunk;
}

function fixtureProject(): never {
  return {
    zones: [{
      id: ZONE, name: 'OJZ',
      tileset: { tiles: makeTiles(4) },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{ id: ACT, name: 'act1', gridWidth: 1, gridHeight: 1, sections: [createSection(0, 'sec0')] }],
    }],
    chunkLibrary: [fixtureChunk()],
    bgLibrary: [],
  } as never;
}

const liveChunk = () => useProjectStore.getState().project!.chunkLibrary.find((c) => c.id === CHUNK)!;
const open = () => useArtStore.getState().open!;

/** Open the fixture chunk the way the app's opener does: its document, `dirty` as given. */
function openChunk(dirty = false): void {
  useArtStore.getState().openDocument({
    doc: docFromChunk(liveChunk()), liveTileIndex: null, chunkId: CHUNK, name: 'Chunk', dirty,
  });
}

/** The document's nametable half, the part a stamp writes and an undo rebuilds. */
const cells = (d: ComposerDoc) => d.cells.map((c) => ({ ...c }));

// ── the mount ──────────────────────────────────────────────────────────────────

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;

async function mountComposer(): Promise<void> {
  win = installWindowStub();
  const mod = await import('../ComposerCanvas');
  mounted = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
}

function host(): HostPointer {
  const hp = mounted!.find(PixelViewport).props.hostPointer as HostPointer | null;
  expect(hp, 'the premise: the tile stamp is armed, so the composer routes the press to its host hook').not.toBeNull();
  return hp!;
}
const EV = {} as React.PointerEvent;
/** One tile-stamp stroke across tiles (from..to, 0). */
function stroke(from: number, to: number): void {
  host().down({ x: from * 8 + 4, y: 4 }, EV);
  for (let t = from + 1; t <= to; t++) host().move({ x: t * 8 + 4, y: 4 }, EV);
  host().up(null, EV);
  mounted!.el();
}
/** Ctrl+Z / Ctrl+Shift+Z resolve `focusedHistory()`. The harness flushes
 *  lazily, so each is followed by a read of the tree: what React does after the
 *  history clock ticks (re-render, then the composer's effects). */
function undo(): void { focusedHistory()!.undo(); mounted!.el(); }
function redo(): void { focusedHistory()!.redo(); mounted!.el(); }

beforeEach(() => {
  documentHistoryHub.clearAll();
  documentHistoryHub.clearFactories();
  registerHistoryFactories();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useArtStore.getState().closeDocument();
  useToastStore.setState({ toasts: [] });
  useProjectStore.setState({ project: fixtureProject() });
  useProjectStore.getState().setCurrentAct(ZONE, ACT);
  useSessionStore.setState({ tabs: [{ id: TAB, kind: 'level', title: 'OJZ act1' }], activeId: TAB });
  useWorkspaceStore.getState().setFacet(TAB, 'art');
  const art = useArtStore.getState();
  art.setTool('tile-stamp');
  art.setBrushTile(3);
  art.setPaletteLine(2);
  art.setStampPriority('keep');
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  useArtStore.getState().closeDocument();
  useArtStore.getState().setTool('pencil');
  win?.restore();
  win = null;
  useProjectStore.getState().reset();
  documentHistoryHub.clearAll();
  useToastStore.setState({ toasts: [] });
});

describe('ART-STROKE-FOLLOWUPS (c): a chunk document undone back to its saved state reads clean', () => {
  it('UNDO-DIRTY: one stroke then one Ctrl+Z reads clean, and the discard prompt stops asking; Ctrl+Shift+Z reads dirty again', async () => {
    openChunk();
    await mountComposer();
    expect(focusedDocId(), 'the premise: Ctrl+Z on the Art facet resolves the zone-art stack').toBe(ZONE_ART);
    const saved = cells(open().doc);
    expect(open().dirty, 'the premise: the chunk opens clean').toBe(false);
    stroke(0, 2);
    expect(cells(open().doc), 'ANTI-VACUOUS: the stroke changed nothing').not.toEqual(saved);
    expect(open().dirty, 'the premise: the stroke marked the document dirty').toBe(true);
    const edited = cells(open().doc);
    undo();
    expect(cells(open().doc), 'the premise: one Ctrl+Z put the document back to what was opened').toEqual(saved);
    expect(open().dirty, 'undoing back to the saved state left the chunk document marked dirty').toBe(false);
    expect(planArtDocDiscard(open(), composerSaveState()).kind, 'the discard prompt still asks about a chunk back at its saved state').toBe('proceed');
    redo();
    expect(cells(open().doc), 'the premise: one redo put the stroke back').toEqual(edited);
    expect(open().dirty, 'redoing away from the saved state left the chunk document reading clean').toBe(true);
    expect(planArtDocDiscard(open(), composerSaveState()).kind, 'the discard prompt does not ask about a redone stroke').toBe('confirm');
  });

  it('UNDO-DIRTY CONTROL: two strokes then one Ctrl+Z is not the saved state, and stays dirty', async () => {
    openChunk();
    await mountComposer();
    const saved = cells(open().doc);
    stroke(0, 1);
    stroke(2, 3);
    undo();
    expect(cells(open().doc), 'the premise: one Ctrl+Z left the first stroke in place').not.toEqual(saved);
    expect(open().dirty, 'a chunk one stroke away from its saved state read clean').toBe(true);
    undo();
    expect(open().dirty, 'the second Ctrl+Z, back to the saved state, left it dirty').toBe(false);
  });

  it('UNDO-DIRTY CONTROL: a chunk document OPENED dirty is never computed clean (its opened state is not a saved one)', async () => {
    openChunk(true);
    await mountComposer();
    const opened = cloneComposerDoc(open().doc);
    stroke(0, 2);
    undo();
    expect(cells(open().doc), 'the premise: one Ctrl+Z put the document back to what was opened').toEqual(cells(opened));
    expect(open().dirty, 'a document opened dirty read clean after an undo to its opening state').toBe(true);
  });
});
