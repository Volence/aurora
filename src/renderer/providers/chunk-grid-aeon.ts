// Aeon port for the neutral shared/ChunkGrid.
//
// What aeon gains by moving onto classic's grid: lazy first paint, one shared
// scratch canvas instead of one 128x128 OffscreenCanvas per chunk, and — the
// reason this is worth doing at all — PER-CHUNK invalidation. The old
// ChunkLibrary keyed its thumbnail memo on editorStore.chunkLibraryVersion, a
// single global clock bumped by every set-chunk / set-tileset-tiles /
// set-palette-line, so one tile-pixel edit re-rasterized all 256 thumbnails.
// `aeonVersionKey` reads the sharp clock instead
// (core/editing/chunk-invalidation.ts decides who moves).
//
// The pure functions carry every decision; the hook only wires stores to them.

import React from 'react';
import type { ChunkGridPort, ChunkEmptyKind } from '../components/shared/chunk-grid-model';
import { hexLabel } from '../components/shared/chunk-grid-model';
import type { ChunkDef, Palette, Tile } from '../../core/model/s4-types';
import { unpackNametableWord } from '../../core/model/s4-types';
import { rasterizeNametableChunk } from '../../core/art/rasterize';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useSessionStore } from '../state/sessionStore';
import { switchFacet } from '../workspace/facet-tools';
import { docFromChunk } from '../../core/art/composer-buffer';
import { openDocumentGuarded } from '../components/art/open-document';
import AeonChunkActions from '../components/AeonChunkActions';

/** Source render resolution for one aeon chunk (16x16 tiles of 8px). */
export const AEON_CHUNK_PX = 128;
/** Thumbnail display sizes (S / M / L). */
export const AEON_THUMB_SIZES = [56, 88, 120];

/**
 * A chunk with no visible content — every cell references tile 0, the engine's
 * conventionally-transparent tile. It is a REAL chunk with real data (OJZ's
 * $00/$2A/$2B/$45 are legitimately blank, not corrupt); the flag exists because
 * stamping one ERASES the 16x16 area, which is a useful eraser and an easy
 * mis-click. Distinct from classic's air, which is not a chunk at all.
 */
export function isBlankChunk(chunk: ChunkDef): boolean {
  for (const w of chunk.nametable) if (unpackNametableWord(w).tileIndex !== 0) return false;
  return true;
}

export function aeonBlankIds(chunks: readonly ChunkDef[]): Set<string> {
  const s = new Set<string>();
  for (const c of chunks) if (isBlankChunk(c)) s.add(c.id);
  return s;
}

export function aeonEmptyKind(blankIds: ReadonlySet<string>, id: string): ChunkEmptyKind {
  return blankIds.has(id) ? 'blank' : 'none';
}

/** Display position of each chunk id — what the label's hex counts. */
export function aeonChunkOrder(chunks: readonly ChunkDef[]): Map<string, number> {
  const m = new Map<string, number>();
  chunks.forEach((c, i) => m.set(c.id, i));
  return m;
}

/** `$XX` by library position. Aeon chunk ids are source-file strings, so the
 *  index is the number the user actually stamps with. */
export function aeonChunkLabel(order: ReadonlyMap<string, number>, id: string): string {
  const i = order.get(id);
  return i === undefined ? '$??' : hexLabel(i);
}

export function aeonChunkTitle(chunk: ChunkDef | undefined, blank: boolean): string {
  if (!chunk) return '';
  return blank
    ? `${chunk.name} — blank (transparent) chunk; stamping it erases the area`
    : chunk.name;
}

/**
 * This chunk's repaint key. Three parts, each covering a way its pixels change:
 *
 *  - `zoneId` — the library is project-global but thumbnails bake the CURRENT
 *    zone's tileset and palette, so a zone switch restains every chunk without
 *    moving a single revision.
 *  - `epoch` — the library was replaced wholesale (import / clear). Chunk ids
 *    come from the source filename, so a clear-then-import can reuse an id for
 *    different art.
 *  - `revision` — this chunk's own clock: bumped for a set-chunk on it, and for
 *    a tile or palette-line edit it actually draws through.
 */
export function aeonVersionKey(
  zoneId: string,
  epoch: number,
  versions: ReadonlyMap<string, number>,
  id: string,
): string {
  return `${zoneId}:${epoch}:${versions.get(id) ?? 0}`;
}

/** RGBA for one chunk at AEON_CHUNK_PX, or null when there is no such chunk. */
export function rasterizeAeonChunk(
  chunk: ChunkDef | undefined,
  tiles: readonly Tile[],
  palette: Palette,
): Uint8ClampedArray | null {
  if (!chunk) return null;
  return rasterizeNametableChunk(chunk, tiles, palette, AEON_CHUNK_PX, AEON_CHUNK_PX);
}

const EMPTY_PALETTE: Palette = { lines: [] };
const EMPTY_CHUNKS: ChunkDef[] = [];

/** Double-click: open the chunk as a composer document in Art mode. */
function openChunkInComposer(id: string): void {
  const chunk = useProjectStore.getState().project?.chunkLibrary.find((c) => c.id === id);
  if (!chunk) return;
  if (!openDocumentGuarded({
    doc: docFromChunk(chunk), liveTileIndex: null, chunkId: chunk.id, name: chunk.name, dirty: false,
  })) return;
  switchFacet(useSessionStore.getState().activeId, 'art');
}

export function useAeonChunkGridPort(): ChunkGridPort {
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const selectedChunkId = useEditorStore((s) => s.selectedChunkId);
  const chunkVersions = useEditorStore((s) => s.chunkVersions);
  const chunkEpoch = useEditorStore((s) => s.chunkEpoch);
  // The coarse clock is still the right key for a WHOLE-LIBRARY rescan: a
  // set-chunk rewrites `chunk.nametable` in place, so a chunk can become blank
  // (or stop being blank) without the array or the chunk object changing
  // identity. It is no longer what a thumbnail paints on.
  const chunkLibraryVersion = useEditorStore((s) => s.chunkLibraryVersion);

  const chunks = project?.chunkLibrary ?? EMPTY_CHUNKS;
  const zoneId = currentZoneId ?? '';

  const order = React.useMemo(() => aeonChunkOrder(chunks), [chunks]);
  const byId = React.useMemo(() => new Map(chunks.map((c) => [c.id, c])), [chunks]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- see chunkLibraryVersion above
  const blankIds = React.useMemo(() => aeonBlankIds(chunks), [chunks, chunkLibraryVersion]);
  const ids = React.useMemo(() => chunks.map((c) => c.id), [chunks]);

  const selectedName = selectedChunkId
    ? byId.get(selectedChunkId)?.name ?? selectedChunkId
    : null;

  return React.useMemo((): ChunkGridPort => ({
    countLabel: `${chunks.length} chunks`,
    ids,
    sourcePx: AEON_CHUNK_PX,
    sizes: AEON_THUMB_SIZES,
    defaultSize: AEON_THUMB_SIZES[1],
    layout: 'panel',
    selectedId: selectedChunkId,
    statusBadge: selectedName,
    statusHint: selectedName ? 'Click map to stamp · dbl-click to edit' : 'Click a chunk to select',
    emptyState: {
      message: 'No chunks loaded',
      hint: 'Import 128x128 + 16x16 + art from S2/S3K/hack',
    },
    HeaderExtra: AeonChunkActions,
    // Read the zone at PAINT time rather than closing over it: the zone object
    // is mutated in place by the command layer, so a captured `tiles` array is
    // the same object with different contents. The key above is what says when.
    rasterize: (id) => {
      const zone = getCurrentZone(useProjectStore.getState());
      return rasterizeAeonChunk(byId.get(id), zone?.tileset.tiles ?? [], zone?.palette ?? EMPTY_PALETTE);
    },
    versionKey: (id) => aeonVersionKey(zoneId, chunkEpoch, chunkVersions, id),
    label: (id) => aeonChunkLabel(order, id),
    title: (id) => aeonChunkTitle(byId.get(id), blankIds.has(id)),
    emptyKind: (id) => aeonEmptyKind(blankIds, id),
    select: (id) => { useEditorStore.getState().setSelectedChunkId(id); },
    activate: openChunkInComposer,
  }), [chunks.length, ids, selectedChunkId, selectedName, byId, order, blankIds, zoneId, chunkEpoch, chunkVersions]);
}
