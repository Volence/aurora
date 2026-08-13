import React from 'react';
import ChunkGrid from './shared/ChunkGrid';
import { useAeonChunkGridPort } from '../providers/chunk-grid-aeon';

/**
 * Aeon's chunk library panel. Now a two-line adapter: the thumbnail wall moved
 * to the engine-neutral shared/ChunkGrid (stage-4 plan 3, task 7), which brought
 * classic's lazy first paint, its one shared scratch canvas, and — the reason
 * for the merge — per-chunk invalidation, so a tile-pixel edit no longer
 * re-rasterizes all 256 thumbnails. Everything aeon-shaped is in
 * providers/chunk-grid-aeon.
 *
 * The wrapper survives so the two facets that show this panel (layout, art) keep
 * the store subscriptions in a leaf rather than in the whole right-hand panel.
 */
export default function ChunkLibrary(): React.ReactElement {
  return <ChunkGrid port={useAeonChunkGridPort()} />;
}
