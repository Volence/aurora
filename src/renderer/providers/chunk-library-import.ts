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
import { lookupFullBlockShape, type FullBlockShapeLookup } from '../../core/collision/full-block-shape';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useToastStore, type ToastType } from '../state/toastStore';
// The SAME promise-based confirm store the tab-close, project-open and
// window-close doors ask through, rendered by the same shell/ConfirmDialog.
// That reuse is load-bearing rather than convenient: d-30's third ground is
// that this is consistency with a perimeter that already exists, and a second
// dialog mechanism would remove the ground the ruling was made on.
import { useConfirmStore } from '../state/confirmStore';
import { isBlankChunk } from './chunk-grid-aeon';

/**
 * What the author is told after an import, given what the full-block lookup
 * actually answered. Pure and exported so the three sentences can be read
 * side by side, and so a test can hold two of them up against each other: the
 * whole point of the parcel is that the two blind cases must not produce the
 * same words.
 *
 * ⚠ WHY THIS IS NOT THE ANSWER TO d-36, and must not be read as one. The open
 * question is whether Import should REFUSE when the collision shapes are not
 * loaded, or import and warn. That changes what the button does, so it is the
 * owner's call (`docs/decisions.jsonl`, `d-36-air-collision-import`, whose own
 * recommendation is `refuse`). What is fixed here is the DEFECT that stands
 * whichever way d-36 goes: the import used to claim plain success while every
 * chunk came in as air. Telling the truth about what the chunks got is the
 * floor of all three of d-36's options — under `refuse` this same sentence
 * becomes the refusal's text — so it pre-empts none of them, and it removes
 * the silent-wrong-result case in the meantime. THE REFUSAL ARM, IF IT IS
 * RULED, GOES IN `importChunkFiles` BEFORE `addChunks`, not here.
 */
export function chunkImportOutcomeToast(
  count: number, fullBlock: FullBlockShapeLookup,
): { message: string; type: ToastType } {
  switch (fullBlock.status) {
    case 'found':
      return { message: `Imported ${count} chunks -- Save to keep`, type: 'success' };
    // "I could not look." No profile set was loaded, so nothing was searched —
    // the project's collision tables are missing, unreadable, or not where the
    // loader probes. The author's move is to fix the project, not the bank.
    case 'no-profiles':
      return {
        message: `Imported ${count} chunks WITH NO COLLISION -- this project's collision `
          + 'shape tables did not load, so nothing could be marked solid. The art is fine; '
          + 'every cell came in as air. Save to keep the art.',
        type: 'warning',
      };
    // "I looked, and there is nothing to use." A real bank was searched and
    // holds no full block. A different fact and a different fix, which is
    // exactly why it is a different sentence.
    case 'no-full-block':
      return {
        message: `Imported ${count} chunks WITH NO COLLISION -- the project's collision bank `
          + 'loaded but contains no full-block shape to mark cells solid with. The art is '
          + 'fine; every cell came in as air. Save to keep the art.',
        type: 'warning',
      };
  }
}

/**
 * Prompt for the three source files (128x128 chunk mappings, 16x16 block
 * mappings, zone art), merge the art into the zone tileset and add the chunks.
 * Resolves false when the user cancelled a dialog, true on a completed import,
 * and reports its own errors (project error + toast) exactly as before.
 *
 * ⚠ THE COLLISION LOOKUP IS OPENED, NOT SPENT. See `chunkImportOutcomeToast`
 * and ledger row FULLBLOCK-ZERO-IS-TWO-ANSWERS: this call site is the one that
 * read `findFullBlockShapeId`'s 0 as a value and toasted success over it.
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

    // ABSOLUTE PATHS GO IN THE BASE SLOT, `''` IN THE RELATIVE ONE. `selectFile`
    // returns an absolute path, and these three reads used to pass it as the
    // RELATIVE argument with an empty base — the last three call sites in Aurora
    // doing so. `file:read-binary` gained a rel-path guard on 2026-09-08 (see
    // `readBinaryFile` in main/file-io.ts) and an absolute path is exactly what
    // that guard refuses, so these move to the idiom every other
    // outside-the-project read already uses (`readAbsolute` in
    // components/sprite/export-sprite.ts and state/import-sheet.ts, and the
    // agent surface's `readBinaryFile(req.path, '')`). `resolve(abs, '')` is
    // `abs`, so the bytes read are identical; what changed is which argument
    // carries the path.
    const chunkData = new Uint8Array(await window.api.readBinaryFile(chunkPath, ''));
    const blockData = new Uint8Array(await window.api.readBinaryFile(blockPath, ''));
    const artData = new Uint8Array(await window.api.readBinaryFile(artPath, ''));

    const namePrefix = chunkPath.split('/').pop()?.replace('.bin', '') ?? 'Chunk';
    const fullBlock = lookupFullBlockShape(useProjectStore.getState().collisionProfiles);
    const imported = importChunks(chunkData, blockData, namePrefix, fullBlock);

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

    const outcome = chunkImportOutcomeToast(imported.length, fullBlock);
    useToastStore.getState().addToast(outcome.message, outcome.type);
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
        + 'back: the only way back is to re-open the project from disk, which loses any '
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
