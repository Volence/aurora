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
import {
  COLLISION_TABLE_FILES, collisionTableSearchPaths,
} from '../../core/project/aeon/load';
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
 * The lookup answers an import is allowed to PROCEED on.
 *
 * ⚠ `no-profiles` IS ABSENT, AND ITS ABSENCE IS THE GUARANTEE. Decision
 * `d-36b-air-collision-import-split-closed` (answered `refuse_a_warn_b`) rules
 * that the blind case must stop before anything is written. Encoding that as a
 * TYPE rather than an `if` is deliberate and follows the parcel that made the
 * split visible in the first place: FULLBLOCK-ZERO-IS-TWO-ANSWERS deleted the
 * conflated `0` return instead of guarding it, so the compiler now enforces the
 * narrowing. Delete the refusal in `importChunkFiles` and this file stops
 * compiling; a runtime guard would have let it go quietly green.
 */
export type ProceedingFullBlockShape = Exclude<FullBlockShapeLookup, { status: 'no-profiles' }>;

/** `a.bin, b.bin and c.bin` — the tables named the way a person lists files. */
function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * CASE A. The project's collision shape tables never loaded, so the editor
 * could not look — this is the editor reporting ITS OWN BLINDNESS, not a fact
 * about anyone's bank. Decision `d-36b-air-collision-import-split-closed`:
 * Import refuses, before writing anything, and names which tables it needs and
 * where it looked.
 *
 * ⚠ WHY THE TABLES AND THE PATHS ARE PASSED IN AND NOT WRITTEN OUT HERE. Both
 * come from `core/project/aeon/load.ts`, which is the module that actually does
 * the looking: `COLLISION_TABLE_FILES` is the set its `Promise.all` demands
 * together, and `collisionTableSearchPaths` is its candidate dirs expanded
 * through its own base-then-flat probe. A refusal that says "here is where it
 * looked" must be derived from the looker. A hand-written list would be a
 * second opinion about a layout that has already changed once (the post-split
 * `games/<game>/data/collision/`), and a stale one reads as a lie at exactly
 * the moment someone is trying to follow it.
 *
 * `searchPaths` empty means no project config is loaded, so the locations
 * genuinely cannot be listed; the sentence says that rather than trailing off.
 */
export function chunkImportBlindRefusal(
  searchPaths: readonly string[],
): { message: string; type: ToastType } {
  const where = searchPaths.length > 0
    ? `It looked in: ${searchPaths.join(', ')}`
    : 'It cannot list where it looked, because no project configuration is loaded';
  return {
    message: 'Import refused: this project\'s collision shape tables did not load, so nothing '
      + 'could be marked solid and every chunk would have come in as air. Nothing was imported '
      + 'and the project is unchanged. Aurora needs '
      + `${nameList(Object.values(COLLISION_TABLE_FILES))} together in one directory. ${where}.`,
    type: 'error',
  };
}

/**
 * What the author is told after an import THAT HAPPENED, given what the
 * full-block lookup answered. Pure and exported so the sentences can be read
 * side by side, and so a test can hold them up against each other: the point of
 * the work behind this file is that two different facts must not arrive as the
 * same message.
 *
 * ⚠ CASE B LIVES HERE AND IS NOT A REFUSAL. A real bank loaded and simply holds
 * no full-block shape. That is a true statement about a project someone
 * authored, not a blindness, so the import PROCEEDS and says so
 * (`d-36b-air-collision-import-split-closed`). Refusing there would turn away
 * an author who HAS collision data and may just not have a full block yet,
 * which is a project state we have no evidence is wrong.
 *
 * ⚠ THIS FUNCTION CANNOT BE HANDED THE BLIND CASE. See
 * `ProceedingFullBlockShape`. It used to have a third arm for `no-profiles`;
 * that arm is now `chunkImportBlindRefusal`, and the type is what keeps the
 * refusal from being quietly bypassed back into a warning.
 */
export function chunkImportOutcomeToast(
  count: number, fullBlock: ProceedingFullBlockShape,
): { message: string; type: ToastType } {
  switch (fullBlock.status) {
    case 'found':
      return { message: `Imported ${count} chunks -- Save to keep`, type: 'success' };
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
 * Resolves false when the user cancelled a dialog OR when the import was
 * refused, true on a completed import, and reports its own errors (project
 * error + toast) exactly as before.
 *
 * ⚠ THE COLLISION LOOKUP IS OPENED, NOT SPENT. See `chunkImportOutcomeToast`
 * and ledger row FULLBLOCK-ZERO-IS-TWO-ANSWERS: this call site is the one that
 * read `findFullBlockShapeId`'s 0 as a value and toasted success over it.
 */
export async function importChunkFiles(): Promise<boolean> {
  // ═══ CASE A REFUSES HERE, AND "HERE" IS THE WHOLE POINT ═══
  //
  // Decision `d-36b-air-collision-import-split-closed`, answered
  // `refuse_a_warn_b`. The cost recorded in ledger row
  // FULLBLOCK-ZERO-IS-TWO-ANSWERS is not that the author was told the wrong
  // thing: it is that the write ALREADY HAPPENED and is not recoverable by undo
  // the way an author expects (library adds live outside undo history on
  // purpose — see `clearChunkLibrary` below), so the chunks carry the wrong
  // collision from that moment and the project is already marked unsaved. A
  // refusal after `addChunks` with a rollback would be a different, weaker
  // promise. So this stands BEFORE the first mutation and before `markDirty`.
  //
  // ⚠ AND BEFORE THE THREE FILE DIALOGS, deliberately. `collisionProfiles` is
  // written only by `openLoaded` (`setCollisionProfiles` has no callers in
  // src/), so nothing the author picks in those dialogs can turn a null profile
  // set into a bank. Asking for three files and then refusing would spend their
  // time for an answer that was already fixed when they clicked.
  //
  // ⚠ CASE B IS NOT REFUSED and must not be folded in here. A loaded bank with
  // no full block reaches `chunkImportOutcomeToast` and imports. The two look
  // identical downstream — both end with an all-air library — which is exactly
  // why the discrimination has to happen on the LOOKUP STATUS and not on
  // anything measured from the result.
  const fullBlock = lookupFullBlockShape(useProjectStore.getState().collisionProfiles);
  if (fullBlock.status === 'no-profiles') {
    const raw = useProjectStore.getState().config?.raw;
    const refusal = chunkImportBlindRefusal(raw ? collisionTableSearchPaths(raw) : []);
    useToastStore.getState().addToast(refusal.message, refusal.type);
    return false;
  }

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
    // `fullBlock` was resolved and narrowed at the top of this function, above
    // the refusal. It is not re-read here: a second lookup would be a second
    // chance to get a different answer than the one the refusal was decided on.
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
