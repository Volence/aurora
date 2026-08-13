// Import / clear for the aeon chunk library — the two actions that live in the
// chunk grid's header. Lifted verbatim out of ChunkLibrary.tsx when that became
// the neutral shared/ChunkGrid, minus the `importing` flag, which stays UI state
// in AeonChunkActions.
//
// One thing is NEW here: both actions reset the per-chunk thumbnail clocks.
// Chunk ids are derived from the source filename ($00.. per file), so a
// clear-then-import can hand back the same ids carrying different art; without
// the epoch bump those thumbnails would keep their old version key and never
// repaint.

import { importChunks } from '../../core/formats/chunk-mappings';
import { kosinskiDecompress } from '../../core/formats/kosinski';
import { parseTiles } from '../../core/formats/tiles';
import { migrateChunkTilesIntoTileset } from '../../core/art/atlas-migration';
import { findFullBlockShapeId } from '../../core/collision/full-block-shape';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useToastStore } from '../state/toastStore';
import { isBlankChunk } from './chunk-grid-aeon';

/**
 * Prompt for the three source files (128x128 chunk mappings, 16x16 block
 * mappings, zone art), merge the art into the zone tileset and add the chunks.
 * Resolves false when the user cancelled a dialog, true on a completed import,
 * and reports its own errors (project error + toast) exactly as before.
 */
export async function importChunkFiles(): Promise<boolean> {
  try {
    const chunkPath = await window.api.selectFile(
      'Select 128x128 chunk mappings (Kosinski)', [{ name: 'Binary', extensions: ['bin'] }]);
    if (!chunkPath) return false;

    const blockPath = await window.api.selectFile(
      'Select 16x16 block mappings (Kosinski)', [{ name: 'Binary', extensions: ['bin'] }]);
    if (!blockPath) return false;

    const artPath = await window.api.selectFile(
      'Select zone art tiles (Kosinski)', [{ name: 'Binary', extensions: ['bin'] }]);
    if (!artPath) return false;

    const chunkData = new Uint8Array(await window.api.readBinaryFile('', chunkPath));
    const blockData = new Uint8Array(await window.api.readBinaryFile('', blockPath));
    const artData = new Uint8Array(await window.api.readBinaryFile('', artPath));

    const namePrefix = chunkPath.split('/').pop()?.replace('.bin', '') ?? 'Chunk';
    const fullBlockShape = findFullBlockShapeId(useProjectStore.getState().collisionProfiles);
    const imported = importChunks(chunkData, blockData, namePrefix, fullBlockShape);

    const artDecompressed = kosinskiDecompress(artData);
    const artTiles = parseTiles(artDecompressed);

    // Unified atlas: merge the imported art into the zone tileset (flip-aware
    // dedup) and remap the imported chunks' nametables to zone-tileset indices.
    const zone = getCurrentZone(useProjectStore.getState());
    if (!zone) throw new Error('no active zone to import into');
    migrateChunkTilesIntoTileset(zone.tileset.tiles, artTiles, imported, []);

    useProjectStore.getState().addChunks(imported);
    useEditorStore.getState().markDirty();
    useEditorStore.getState().resetChunkVersions();

    // Default-select the first chunk with actual content (skip blank/eraser
    // chunks like $00 so a fresh stamp doesn't silently erase).
    const firstContent = imported.find((c) => !isBlankChunk(c)) ?? imported[0];
    if (firstContent) useEditorStore.getState().setSelectedChunkId(firstContent.id);

    useToastStore.getState().addToast(`Imported ${imported.length} chunks -- Save to keep`, 'success');
    return true;
  } catch (err) {
    useProjectStore.getState().setError(
      `Chunk import failed: ${err instanceof Error ? err.message : String(err)}`);
    useToastStore.getState().addToast('Chunk import failed', 'error');
    return false;
  }
}

export function clearChunkLibrary(): void {
  useProjectStore.getState().clearChunks();
  useEditorStore.getState().markDirty();
  useEditorStore.getState().resetChunkVersions();
}
