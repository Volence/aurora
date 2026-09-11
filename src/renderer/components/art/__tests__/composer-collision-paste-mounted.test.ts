// THE ART COMPOSER'S Ctrl+V, RUN THROUGH ITS OWN KEY HANDLER.
// (COLLISION-PASTE-ACROSS-TILESETS; docs/reviews/2026-09-11-collision-paste-across-tilesets.md)
//
// With no pixel selection copied, the composer's Ctrl+V pastes the MAP
// clipboard's two collision planes onto the open document, and nothing else. A
// collision word's shape number indexes the project's collision base bank: one
// bank per project, baked into one attr set shared by every zone. So the same
// word means the same shape in every zone of a project, and a paste into another
// zone is correct. It does NOT mean the same shape in another project, whose
// bank can differ, and that paste is refused with a message about COLLISION.
//
// These rows mount the real `ComposerCanvas` with the same no-DOM harness the
// map's mounted rows use (`src/test/render-hooked.ts`, `src/test/window-stub.ts`)
// and press the real keys through the handler the component registers on
// `window`. The clipboard is made by the composer's own Ctrl+C on a chunk
// document, so the identity a paste is checked against is the one the
// production copy captures. Nothing here paints: every assertion is on words.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../../test/window-stub';
import { useProjectStore } from '../../../state/projectStore';
import { useEditorStore } from '../../../state/editorStore';
import { useArtStore } from '../../../state/artStore';
import { useSessionStore } from '../../../state/sessionStore';
import { useToastStore } from '../../../state/toastStore';
import { documentHistoryHub } from '../../../state/history-hub';
import { createDoc, type ComposerDoc } from '../../../../core/art/composer-buffer';
import { packCollisionCell } from '../../../../core/collision/collision-cell-word';
import {
  SECTION_TILES_WIDE, SECTION_TILES_HIGH, createChunkDef, type ChunkDef,
} from '../../../../core/model/s4-types';

// ── the fixture ────────────────────────────────────────────────────────────────

const TILES = 8;
/** Tile i is solid colour pick(i). The two zones' pictures differ at every index
 *  (i against 15 - i, and 15 is odd), so "another tile set" is never vacuous. */
const tilesOf = (pick: (i: number) => number) => ({
  tiles: Array.from({ length: TILES }, (_, i) => ({ pixels: new Uint8Array(64).fill(pick(i)) })),
});

const word = (shape: number): number =>
  packCollisionCell({ shape, xFlip: false, yFlip: false, solidity: 'all' });
/** What the copied chunk carries, one 16px cell, per plane. */
const COPIED = { a: word(1), b: word(2) } as const;
/** What the paste target holds before the paste, every cell, per plane. */
const TARGET = { a: word(5), b: word(6) } as const;

function section() {
  return {
    index: 0, name: 's0',
    tileGrid: {
      widthTiles: SECTION_TILES_WIDE, heightTiles: SECTION_TILES_HIGH,
      nametable: new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH),
    },
    objects: [], rings: [], tiles: null, paletteRef: null, bgLayoutRef: null,
  };
}

function zoneOf(id: string, tileset: ReturnType<typeof tilesOf>) {
  return {
    id, name: id.toUpperCase(), tileset,
    palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
    acts: [{ id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [section()] }],
  };
}

/** A 2x2-tile chunk: exactly one 16px cell, carrying COPIED on both planes. */
function sourceChunk(): ChunkDef {
  const c = createChunkDef('c1', 'c1', 2, 2);
  c.collisionA[0] = COPIED.a;
  c.collisionB[0] = COPIED.b;
  return c;
}

/** Two zones with different tile sets, one project. `pick` lets a second
 *  project give its FIRST zone other pictures under the same ids. */
function project(pick: (i: number) => number = (i) => i) {
  return {
    zones: [zoneOf('ojz', tilesOf(pick)), zoneOf('mgz', tilesOf((i) => 15 - i))],
    chunkLibrary: [sourceChunk()],
    bgLibrary: [],
  };
}

function focus(zoneId: string): void {
  useProjectStore.getState().setCurrentAct(zoneId, 'act1');
  useSessionStore.setState({ activeId: `level:${zoneId}:act1` });
}

// ── the events ─────────────────────────────────────────────────────────────────

/** A keydown as the composer's handler reads one. */
function key(k: string, mods: { ctrlKey?: boolean } = {}) {
  let prevented = false;
  return {
    key: k,
    ctrlKey: mods.ctrlKey ?? false, metaKey: false, altKey: false, shiftKey: false,
    repeat: false, target: null,
    preventDefault: () => { prevented = true; },
    wasPrevented: () => prevented,
  };
}

// ── the mount ──────────────────────────────────────────────────────────────────

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;

async function mountComposer(): Promise<void> {
  win = installWindowStub();
  const mod = await import('../ComposerCanvas');
  mounted = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
}

/** Press a key through the handler the component registered. Loud when nothing
 *  is listening: a dispatch to an empty registry is the silent no-op that makes
 *  a behavioural row read like a passing one. */
function press(e: ReturnType<typeof key>): void {
  const ran = win!.dispatch('keydown', e);
  expect(ran, 'no keydown listener is registered: the composer never mounted its handler').toBeGreaterThan(0);
}

/** The author's copy: open the chunk as a CHUNK document and press Ctrl+C with
 *  no pixel selection, which copies the whole chunk to the map clipboard. */
function copyChunk(): void {
  const chunk = useProjectStore.getState().project!.chunkLibrary.find((c) => c.id === 'c1')!;
  const doc = createDoc(2, 2);
  doc.collisionA.set(chunk.collisionA);
  doc.collisionB.set(chunk.collisionB);
  useArtStore.getState().openDocument({ doc, chunkId: 'c1', liveTileIndex: null, name: 'c1', dirty: false });
  press(key('c', { ctrlKey: true }));
  const clip = useEditorStore.getState().mapClipboard;
  expect(clip, 'the composer\'s Ctrl+C copied nothing').not.toBeNull();
  expect([...clip!.collisionA, ...clip!.collisionB], 'the copy did not carry the chunk\'s collision')
    .toEqual([COPIED.a, COPIED.b]);
}

/** A fresh doc-local 4x4 document (four cells) holding TARGET on both planes,
 *  opened as the paste target. */
function openTarget(): ComposerDoc {
  const doc = createDoc(4, 4);
  doc.collisionA.fill(TARGET.a);
  doc.collisionB.fill(TARGET.b);
  useArtStore.getState().openDocument({ doc, chunkId: null, liveTileIndex: null, name: 'target', dirty: false });
  return doc;
}

const planesOf = (doc: ComposerDoc) => ({ a: [...doc.collisionA], b: [...doc.collisionB] });
/** The copy lands on cell 0 of each plane and nowhere else (the clipboard is
 *  one cell and the composer pastes at the origin). */
const LANDED = { a: [COPIED.a, TARGET.a, TARGET.a, TARGET.a], b: [COPIED.b, TARGET.b, TARGET.b, TARGET.b] };
const UNTOUCHED = { a: [TARGET.a, TARGET.a, TARGET.a, TARGET.a], b: [TARGET.b, TARGET.b, TARGET.b, TARGET.b] };

function toasts(fragment: string): string[] {
  return useToastStore.getState().toasts.map((t) => t.message).filter((m) => m.includes(fragment));
}

/** Did the open doc-local document take an undo entry? */
function targetCanUndo(): boolean {
  const id = useArtStore.getState().composerDocId;
  expect(id, 'the premise: a doc-local document owns a stack').not.toBeNull();
  return documentHistoryHub.has(id!) && documentHistoryHub.historyFor(id!).canUndo;
}

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useProjectStore.setState({
    config: { basePath: '/composer-paste/first-checkout', zones: [] } as never,
    project: project() as never,
  });
  focus('ojz');
  useEditorStore.getState().setMapClipboard(null);
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  useArtStore.getState().closeDocument();
  useEditorStore.getState().setMapClipboard(null);
  win?.restore();
  win = null;
  useProjectStore.getState().reset();
  documentHistoryHub.clearAll();
  useToastStore.setState({ toasts: [] });
});

describe('the composer\'s collision-only Ctrl+V: zones share the collision shapes, projects do not', () => {
  it('CONTROL: in the zone it was copied in, Ctrl+V pastes the copied collision onto the open document', async () => {
    await mountComposer();
    copyChunk();
    const doc = openTarget();
    expect(planesOf(doc), 'ANTI-VACUOUS: the target already holds the copy').not.toEqual(LANDED);
    useToastStore.setState({ toasts: [] });
    const e = key('v', { ctrlKey: true });
    press(e);
    expect(planesOf(doc), 'the paste did not land on cell 0 of both planes, and only there').toEqual(LANDED);
    expect(toasts('Pasted collision'), 'the paste was silent').toHaveLength(1);
    expect(toasts('Not pasted'), 'a paste that landed was also refused').toHaveLength(0);
    expect(e.wasPrevented(), 'the handled Ctrl+V fell through to the page').toBe(true);
    expect(targetCanUndo(), 'the paste put nothing on the document\'s undo stack').toBe(true);
  });

  it('in ANOTHER ZONE of the same project it pastes too, because a shape number means the same shape in every zone', async () => {
    await mountComposer();
    copyChunk();
    const from = useEditorStore.getState().mapClipboard!.tileset;
    focus('mgz');
    const here = useProjectStore.getState().project!.zones.find((z) => z.id === 'mgz')!.tileset;
    expect(here, 'the premise: the open zone draws with another tile set').not.toBe(from);
    expect([...here.tiles[1].pixels], 'the premise: the two tile sets differ in content too')
      .not.toEqual([...from.tiles[1].pixels]);
    const doc = openTarget();
    useToastStore.setState({ toasts: [] });
    press(key('v', { ctrlKey: true }));
    expect(planesOf(doc), 'a collision paste into another zone of the same project was not made').toEqual(LANDED);
    expect(toasts('Not pasted'), 'a paste whose words mean the same here was refused').toHaveLength(0);
  });

  it('in ANOTHER PROJECT it is REFUSED, with a message about COLLISION, and nothing is written', async () => {
    // Two checkouts of one tree, and a reopen of this one, are this shape: the
    // ids agree and the collision bank is a fresh load that may differ on disk.
    await mountComposer();
    copyChunk();
    useProjectStore.getState().openLoaded({
      config: { basePath: '/composer-paste/another-checkout', zones: [] },
      project: project((i) => 15 - i),
      collisionProfiles: null, capabilities: null, legacyAtlasMerged: false,
    } as never);
    focus('ojz');
    expect(useProjectStore.getState().project!.zones.some((z) => z.tileset === useEditorStore.getState().mapClipboard!.tileset),
      'the premise: the clipboard was copied in a project that is no longer open').toBe(false);
    const doc = openTarget();
    useToastStore.setState({ toasts: [] });
    const e = key('v', { ctrlKey: true });
    press(e);
    expect(planesOf(doc), 'another project\'s shape numbers were pasted into this one').toEqual(UNTOUCHED);
    const said = toasts('Not pasted');
    expect(said, 'the refusal was silent').toHaveLength(1);
    expect(said[0], 'the refusal did not name what it refused').toContain('collision');
    expect(said[0], 'the refusal did not say where the copy came from').toContain('another project');
    expect(said[0], 'a paste that writes no tile word was refused in terms of tiles').not.toContain('tiles');
    expect(toasts('Pasted collision'), 'a refused paste also announced itself as pasted').toHaveLength(0);
    expect(e.wasPrevented(), 'the refused Ctrl+V fell through to the page, which reads as a dead key').toBe(true);
    expect(targetCanUndo(), 'a refusal put an entry on the undo stack').toBe(false);
  });
});
