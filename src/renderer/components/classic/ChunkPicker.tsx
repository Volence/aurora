import React from 'react';
import ChunkGrid from '../shared/ChunkGrid';
import type { ChunkGridLayout } from '../shared/chunk-grid-model';
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
 * `layout` defaults to the picker's real home — the s1 Layout facet's right panel
 * (stage-4 plan 5, task 7). The one caller that passes `'strip'` is the legacy
 * bottom dock, which task 9 deletes; DELETE THIS PROP WITH IT. See the port hook
 * for why the slot, not the engine, owns this choice.
 */
export default function ChunkPicker({ layout = 'panel' }: {
  layout?: ChunkGridLayout;
}): React.ReactElement | null {
  const port = useClassicChunkGridPort(layout);
  if (!port) return null;
  return <ChunkGrid port={port} />;
}
