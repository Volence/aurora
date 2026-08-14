import React from 'react';
import ChunkGrid from '../shared/ChunkGrid';
import { useClassicChunkGridPort } from '../../providers/chunk-grid-classic';

/**
 * The chunk picker for the classic level editor. Now a two-line adapter: the
 * thumbnails, the lazy paint, the shared scratch canvas and the per-chunk paint
 * cache all moved to the engine-neutral shared/ChunkGrid (stage-4 plan 3, task
 * 7), and everything S1-shaped about them moved to providers/chunk-grid-classic.
 *
 * The wrapper survives only because the port is null until an act is loaded, and
 * hooks cannot be called conditionally at the call site.
 *
 * It takes no props: there is exactly ONE mount, the s1 Layout facet's right
 * panel (stage-4 plan 5, task 7). The `layout` prop that briefly existed here
 * served the legacy bottom dock, and went with it at task 9.
 */
export default function ChunkPicker(): React.ReactElement | null {
  const port = useClassicChunkGridPort();
  if (!port) return null;
  return <ChunkGrid port={port} />;
}
