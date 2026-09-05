// Classic (S1 disasm) port for the neutral shared/ChunkGrid.
//
// The S1-shaped facts the grid must not know about, all of them in pure
// functions so they are node-testable:
//
//  - **1-based ids.** A layout byte of $00 is air; byte N>=1 is the (N-1)-th
//    chunk in the map256 file (chunkIndexForId owns the shift). So the picker's
//    id space is one LONGER than the file's chunk list, with a synthetic air
//    entry in front, and the heading still counts the file's chunks.
//  - **Air is not a blank chunk.** There is no data behind $00 at all; it exists
//    so the Stamp tool can paint "nothing" over a layout cell. The grid draws it
//    as a checkerboard. Aeon's blank chunks are the other thing entirely — real
//    data that happens to be transparent.
//  - **The loop flag rides IN-BAND in bit 7 of the layout cell**, packed with the
//    chunk id, which is why only ids $01..$7F can carry one and why the toggle
//    is header state rather than a property of the chunk.
//
// `cells.length !== width*height` for four real S1 files, but that is a LAYOUT
// property (LayoutGrid), not a chunk-pool one — it never reaches this port.

import React from 'react';
import type { ChunkEmptyKind, ChunkGridPort } from '../components/shared/chunk-grid-model';
import { hexLabel } from '../components/shared/chunk-grid-model';
import { chunkIndexForId, type LevelDoc } from '../../core/level-classic/model';
import { renderChunk } from '../../core/level-classic/render';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { CHUNK_PX } from '../components/classic/viewport-math';
import ChunkPickerHeader from '../components/classic/ChunkPickerHeader';

/** Source render resolution for one classic chunk (16x16 blocks of 16px). */
export const CLASSIC_CHUNK_PX = CHUNK_PX;
/**
 * One fixed thumbnail size, no S/M/L — `sizes` with a single entry is what hides
 * the size control. 56px is small enough that four cells fit a row of the 260px
 * facet panel, so the panel home needs no new size scale; giving classic aeon's
 * S/M/L is a separate call nobody has asked for.
 */
export const CLASSIC_THUMB = 56;

/** Engine ids in display order: air ($00) then $01..N for the file's chunks. */
export function classicChunkIds(doc: LevelDoc): string[] {
  return Array.from({ length: doc.chunks.length + 1 }, (_, id) => String(id));
}

export function classicEmptyKind(id: string): ChunkEmptyKind {
  return Number(id) === 0 ? 'air' : 'none';
}

export function classicChunkLabel(id: string): string {
  return Number(id) === 0 ? 'air' : hexLabel(Number(id));
}

export function classicChunkTitle(id: string): string {
  return Number(id) === 0
    ? 'Air ($00): stamp to erase a cell'
    : `Chunk ${hexLabel(Number(id))}`;
}

/**
 * Can this engine id carry S1's loop flag? The flag is bit 7 of the LAYOUT cell,
 * in-band with the chunk id, so it is only meaningful for a real id ($01..$7F):
 * air cannot loop, and $80+ would collide with the flag bit itself.
 */
export function classicCanLoop(id: number): boolean {
  return id >= 1 && id <= 0x7f;
}

/** `${epoch}:${revision}` — the same key the classic viewport's offscreen chunk
 *  cache uses, so a click never repaints art and an edit repaints one chunk. */
export function classicVersionKey(
  epoch: number,
  versions: ReadonlyMap<number, number>,
  id: string,
): string {
  return `${epoch}:${versions.get(Number(id)) ?? 0}`;
}

/** RGBA for one chunk at CLASSIC_CHUNK_PX, or null when the id draws nothing
 *  (air, or past the pool) — the grid then paints its own empty treatment. */
export function rasterizeClassicChunk(doc: LevelDoc, id: string): Uint8ClampedArray | null {
  const n = Number(id);
  if (!Number.isInteger(n) || chunkIndexForId(doc, n) === null) return null;
  return renderChunk(doc, n);
}

/**
 * What a click in this picker MEANS, which is not the same question in the two
 * columns the picker is mounted in (workspace/facets/s1-facets.tsx):
 *
 *  - `'stamp'` (the map's column) — select the chunk AND arm the stamp tool.
 *    Selecting a chunk beside a map expresses intent to paint it, and it is what
 *    makes the picker the way INTO stamping (see the mount site's argument for
 *    why the panel is therefore never gated on the stamp tool being active).
 *  - `'edit'` (the composer's column) — select the chunk and nothing else. The
 *    Art facet has no map and no tool dock, so arming there changes a tool the
 *    screen cannot show, and the change PERSISTS: picking a chunk to edit left
 *    you armed to paint terrain the moment you went back to Layout.
 *
 * Both write the same `selectedChunkId` — that one field is genuinely both the
 * stamp target and the composer's subject (ChunkTab.tsx), and the two columns
 * agreeing about which chunk is current is the point of mounting it twice. Only
 * the tool side-effect differs.
 */
export type ClassicChunkPick = 'stamp' | 'edit';

/**
 * Null when no act is loaded — the picker renders nothing at all then.
 *
 * `layout` is a constant again, matching aeon's port. It was briefly a parameter
 * (stage-4 plan 5, task 7) because classic had two live picker slots at once —
 * the s1 Layout facet's 260px column and the legacy bottom dock, which needed
 * `'strip'` to stop `containerPanel`'s `flex: 1` from taking half the window off
 * the canvas row. Task 9 deleted that dock, so there is one slot and it is a
 * panel.
 */
export function useClassicChunkGridPort(pick: ClassicChunkPick): ChunkGridPort | null {
  const doc = useClassicLevelStore((s) => s.doc);
  const status = useClassicLevelStore((s) => s.status);
  const chunkVersions = useClassicLevelStore((s) => s.chunkVersions);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  // Both select actions are subscribed unconditionally — a hook may not sit
  // behind a branch — and `pick` chooses between them below. `selectChunkForStamp`
  // also ARMS the stamp tool (see the store action's doc comment);
  // `setSelectedChunkId` is the same select without the tool change, which is
  // also what the viewport's right-click eyedrop calls.
  //
  // That force-arm is why classic's picker is mounted UNCONDITIONALLY rather than
  // behind aeon's `tool === 'stamp-chunk'` gate — beside the map the picker is
  // the way INTO stamping, so gating it on stamping is circular. The full
  // argument is at the mount site (workspace/facets/s1-facets.tsx).
  const selectChunkForStamp = useClassicLevelStore((s) => s.selectChunkForStamp);
  const setSelectedChunkId = useClassicLevelStore((s) => s.setSelectedChunkId);

  const ready = status === 'ready' && doc !== null;
  const ids = React.useMemo(() => (doc ? classicChunkIds(doc) : []), [doc]);

  return React.useMemo((): ChunkGridPort | null => {
    if (!ready || !doc) return null;
    return {
      // The FILE's chunk count, which is one short of `ids.length` — the id space
      // has a synthetic air entry in front of it (classicChunkIds).
      countLabel: `${doc.chunks.length} chunks`,
      ids,
      sourcePx: CLASSIC_CHUNK_PX,
      sizes: [CLASSIC_THUMB],
      defaultSize: CLASSIC_THUMB,
      layout: 'panel',
      selectedId: String(selectedChunkId),
      statusBadge: hexLabel(selectedChunkId),
      // The eyedrop half of the hint names the VIEWPORT, which the composer
      // column has no sight of — so the two columns say what their own screen
      // can do, and neither points at a surface that is not there.
      //
      // Sentence case, matching aeon's provider and both engines' empty-state
      // hints — classic's lowercase was the outlier, unified 2026-08-19.
      statusHint: pick === 'stamp'
        ? 'Click to select · right-click viewport to eyedrop'
        // Not "opens" it: the click changes the SUBJECT the Chunk tab is
        // already showing, and does not switch tabs from Block or Tile.
        : 'Click to pick the chunk the Chunk tab edits',
      HeaderExtra: ChunkPickerHeader,
      // `doc` is read at PAINT time through the store rather than closed over:
      // its identity churns on every edit (a layout stamp replaces the doc while
      // bumping no chunk version), and the version key above is what decides
      // when a thumbnail is stale.
      rasterize: (id) => {
        const live = useClassicLevelStore.getState().doc;
        return live ? rasterizeClassicChunk(live, id) : null;
      },
      versionKey: (id) => classicVersionKey(chunkEpoch, chunkVersions, id),
      label: classicChunkLabel,
      title: classicChunkTitle,
      emptyKind: classicEmptyKind,
      select: (id) => (pick === 'stamp' ? selectChunkForStamp : setSelectedChunkId)(Number(id)),
    };
  }, [
    ready, doc, ids, selectedChunkId, chunkEpoch, chunkVersions,
    pick, selectChunkForStamp, setSelectedChunkId,
  ]);
}
