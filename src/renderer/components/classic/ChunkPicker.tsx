import React from 'react';
import ChunkGrid from '../shared/ChunkGrid';
import { useClassicChunkGridPort, type ClassicChunkPick } from '../../providers/chunk-grid-classic';

/**
 * The chunk picker for the classic level editor. Now a two-line adapter: the
 * thumbnails, the lazy paint, the shared scratch canvas and the per-chunk paint
 * cache all moved to the engine-neutral shared/ChunkGrid (stage-4 plan 3, task
 * 7), and everything S1-shaped about them moved to providers/chunk-grid-classic.
 *
 * The wrapper survives only because the port is null until an act is loaded, and
 * hooks cannot be called conditionally at the call site.
 *
 * TWO MOUNTS, and `pick` is required so each one has to say which it is: the s1
 * Layout facet's right panel (`'stamp'` — selecting a chunk beside a map arms the
 * stamp tool) and the Art facet's (`'edit'` — selecting a chunk beside the
 * composer must NOT, because that tool change persists into Layout and leaves you
 * armed to paint terrain you only meant to edit). Both write the same
 * `selectedChunkId`; see providers/chunk-grid-classic.ts for the full argument.
 *
 * No default value on purpose: the harmful direction is the silent one, and a
 * defaulted `pick` is how the arming got into the composer column in the first
 * place. The `layout` prop that briefly existed here served the legacy bottom
 * dock, and went with it at task 9.
 */
export default function ChunkPicker({ pick }: { pick: ClassicChunkPick }): React.ReactElement | null {
  const port = useClassicChunkGridPort(pick);
  if (!port) return null;
  return <ChunkGrid port={port} />;
}
