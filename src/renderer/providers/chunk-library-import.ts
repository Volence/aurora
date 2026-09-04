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
// The SAME promise-based confirm store the tab-close, project-open and
// window-close doors ask through, rendered by the same shell/ConfirmDialog.
// That reuse is load-bearing rather than convenient: d-30's third ground is
// that this is consistency with a perimeter that already exists, and a second
// dialog mechanism would remove the ground the ruling was made on.
import { useConfirmStore } from '../state/confirmStore';
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

/**
 * Empty the chunk library, ASKING FIRST — decision d-30, answered
 * `confirm_before` (`docs/decisions.jsonl`, `d-30-chunk-library-clear-answered`).
 *
 * ⚠ WHO ANSWERED IT. That entry records the ruling as made BY THE SUITE HUB IN
 * THE OWNER'S PLACE under a standing delegation, NOT by the owner, and says it
 * is explicitly overturnable on his read-back. Read the entry itself.
 *
 * WHY A CONFIRM AND NOT AN UNDO. `clearChunks` is a bare `set` in
 * `state/projectStore.ts` that never enters the undo machinery, so Ctrl+Z does
 * not bring the library back — measured on a real click, 71 chunks to 0 and
 * still 0 after undo. Library ADDS deliberately live outside undo history (the
 * store says so beside `addChunks`) and the removal simply inherited that path;
 * nobody chose it for the removal.
 *
 * ⚠ AND `make_it_undoable` WAS CONSIDERED AND REJECTED, so do not "improve"
 * this into an undoable command. It would make clearing undoable while
 * IMPORTING still is not, and a half-working undo is worse than a consistently
 * absent one — you learn to trust it in the wrong place.
 *
 * WHAT THE COPY DOES AND DOES NOT SAY. A save after clearing does NOT persist
 * the empty library (the save plan includes that file only when the library is
 * non-empty), so re-opening the project really does recover it — the amendment
 * entry `d-30-chunk-library-clear-measured` pins that. It is in the dialog body
 * because it is true and useful at the moment of the decision. It is NOT a
 * reason the confirm is optional: the recovery is a step nobody would guess
 * from the app, which is what made the defect worth a dialog in the first
 * place.
 *
 * THE EMPTY CASE ASKS NOTHING, by the same rule as d-29's clean document: the
 * dialog is paid for only where something is actually lost. In practice the
 * button is not even rendered then (`AeonChunkActions` gates it on
 * `hasChunks`), so this arm is a belt-and-braces guarantee for any future
 * caller rather than a path an author can reach today — and it is the reason a
 * count can be named in the body without ever reading "Clear all 0 chunks".
 *
 * Resolves true when the library was cleared, false when the author cancelled.
 * Esc, the backdrop and a superseded request all answer 'cancel'.
 */
export async function clearChunkLibrary(): Promise<boolean> {
  const count = useProjectStore.getState().project?.chunkLibrary.length ?? 0;

  if (count > 0) {
    const answer = await useConfirmStore.getState().ask({
      title: 'Clear the chunk library?',
      body: `This removes all ${count} chunks from the project. Undo will not bring them `
        + 'back — the only way back is to re-open the project from disk, which loses any '
        + 'other unsaved edits with it.',
      buttons: [
        { key: 'clear', label: 'Clear library', tone: 'danger' },
        { key: 'cancel', label: 'Cancel' },
      ],
    });
    if (answer !== 'clear') return false;
  }

  useProjectStore.getState().clearChunks();
  useEditorStore.getState().markDirty();
  useEditorStore.getState().resetChunkVersions();
  return true;
}
