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
/** The picker is a compact bottom strip: one fixed thumbnail size, no S/M/L. */
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
    ? 'Air ($00) — stamp to erase a cell'
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

/** Null when no act is loaded — the picker renders nothing at all then. */
export function useClassicChunkGridPort(): ChunkGridPort | null {
  const doc = useClassicLevelStore((s) => s.doc);
  const status = useClassicLevelStore((s) => s.status);
  const chunkVersions = useClassicLevelStore((s) => s.chunkVersions);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  // Plain left-click select also ARMS the stamp tool (see the store action's doc
  // comment); the viewport's right-click eyedrop calls setSelectedChunkId
  // directly and is untouched by this.
  const selectChunkForStamp = useClassicLevelStore((s) => s.selectChunkForStamp);

  const ready = status === 'ready' && doc !== null;
  const ids = React.useMemo(() => (doc ? classicChunkIds(doc) : []), [doc]);

  return React.useMemo((): ChunkGridPort | null => {
    if (!ready || !doc) return null;
    return {
      heading: `Chunks (${doc.chunks.length})`,
      ids,
      sourcePx: CLASSIC_CHUNK_PX,
      sizes: [CLASSIC_THUMB],
      defaultSize: CLASSIC_THUMB,
      layout: 'strip',
      selectedId: String(selectedChunkId),
      statusBadge: hexLabel(selectedChunkId),
      statusHint: 'click to select · right-click viewport to eyedrop',
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
      select: (id) => selectChunkForStamp(Number(id)),
    };
  }, [ready, doc, ids, selectedChunkId, chunkEpoch, chunkVersions, selectChunkForStamp]);
}
