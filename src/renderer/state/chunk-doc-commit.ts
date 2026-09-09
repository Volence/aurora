// WRITE-THROUGH FOR A CHUNK DOCUMENT — owner ruling d-37, option
// `route_onto_zone_stack` (docs/decisions.jsonl, and the two measurements it
// rests on: docs/reviews/2026-09-09-chunk-undo-measure.md and
// -chunk-undo-redo.md).
//
// WHAT WAS WRONG. A chunk document was HALF live-editing and half buffered. A
// pencil stroke on an ATLAS-BACKED cell was a `set-tileset-tiles` command on the
// zone-art stack (census path P3a); its EMPTY cells, every `allowCow` gesture
// (paste / cut / selection move / the seven transforms) and every `applyTileCell`
// write (tile stamp / collision paint / palette-apply) wrote only into
// `artStore.open.doc` and recorded NOTHING. `focusedDocId()` resolved the art
// facet to `zoneart:<zone>` regardless, so Ctrl+Z after one of those gestures
// reached the zone-art stack and took back an EARLIER edit — one the author had
// made elsewhere and believed was safe — while their own gesture survived. The
// chunk's atlas-backed cells reference the reverted tile, so the canvas
// repainted and it looked like the undo had worked.
//
// WHAT THIS DOES. Every one of those gestures now folds the document's contents
// into the project as ONE step on the SAME `zoneart:<zone>` history the
// atlas-backed pencil already uses: a `set-chunk` against the library chunk
// (nametable plus both collision planes), preceded where needed by the
// `set-tileset-tiles` that materialises the tiles the gesture painted.
//
// ⚠ ONE DOCUMENT, ONE STACK. That is the whole reason the payload is `set-chunk`
// and not a document-local snapshot: `set-chunk` is already in
// `editorStore.ZONE_SCOPED_COMMAND_TYPES`, so it routes to the SAME document
// P3a routes to. This codebase has already closed a live defect (F1, the comment
// that created the `bgOverride` branch in `focusedDocId`: *"Without this, one
// document had two undo stacks interleaved by facet"*) by refusing a second
// stack on one document, and nothing here mints one.
//
// ⚠ THE COST THE OWNER ACCEPTED, stated here because a reader of this file is
// exactly who needs it: A CHUNK DOCUMENT IS NO LONGER A SCRATCH BUFFER. Painting
// an empty cell APPENDS the painted tile to the zone tileset there and then —
// it has nowhere else to live, because a chunk in the library is a nametable of
// atlas tiles and nothing more. That is the same materialisation Save has always
// done (`sliceForSave`, same function), moved from Save-time to gesture-time.
// Undo removes the appended tiles again, because they are in the same batch.
// What Save still means on a chunk document is written out in
// `art-composer-save.ts` and in docs/reviews/2026-09-09-chunk-undo-routing.md.
//
// ⚠ AND THE DOCUMENT IS RE-DERIVED FROM THE LIBRARY, NOT LEFT WHERE IT WAS.
// After the step lands — and after any undo/redo of one, through
// `syncChunkDocFromLibrary` — the open document's contents are rebuilt from the
// chunk it edits. Without that, an undo would revert the library chunk while the
// composer went on showing the reverted stroke, and the NEXT gesture would fold
// that stale state straight back in: an undo that silently undoes itself.

import { useArtStore } from './artStore';
import type { OpenDocument } from './artStore';
import { useProjectStore, getActiveLevel, getCurrentZone } from './projectStore';
import { executeCommand } from './editorStore';
import { useToastStore } from './toastStore';
import { docFromChunk, restoreComposerDoc, sliceForSave } from '../../core/art/composer-buffer';
import type { AnyCommand } from '../../core/editing/commands';
import type { ChunkDef, Tile } from '../../core/model/s4-types';

/**
 * A document that edits a chunk ALREADY IN THE LIBRARY — the kind this module
 * writes through.
 *
 * The three exclusions are the same three `artStore.isPureDocLocal` names, read
 * the other way round: a live-tile document is one atlas tile and commits
 * `set-tileset-tiles`; a BG-override document commits BG commands on the ACT
 * stack; and a document with `chunkId === null` is an unsaved buffer with no
 * chunk to write through TO, which is precisely the case that owns its own
 * composer stack (`docs/reviews/2026-09-09-art-undo-fix.md`) and must keep it.
 */
export function isChunkDocument(open: OpenDocument | null): boolean {
  return open !== null
    && open.chunkId !== null
    && open.liveTileIndex === null
    && !open.bgOverride;
}

function sameWords(a: Uint16Array, b: Uint16Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The atlas as it will be AFTER `leading` applies — the in-place tile edits the
 * same gesture produced on atlas-backed cells.
 *
 * `sliceForSave` dedupes the document's local tiles against the atlas, so
 * slicing against the PRE-edit pixels could point a freshly painted cell at a
 * tile whose art is being rewritten in the very same step. Copy-on-write, and
 * only for indices that already exist: an out-of-range write here would extend
 * the array and make `atlas.length` — which is where `sliceForSave` puts the
 * first appended tile — wrong.
 */
function atlasAfter(atlas: Tile[], leading: readonly AnyCommand[]): Tile[] {
  let view = atlas;
  for (const cmd of leading) {
    if (cmd.type !== 'set-tileset-tiles') continue;
    for (let i = 0; i < cmd.newTiles.length; i++) {
      const at = cmd.at + i;
      if (at >= atlas.length) continue;
      if (view === atlas) view = atlas.slice();
      view[at] = cmd.newTiles[i];
    }
  }
  return view;
}

/**
 * Fold the open chunk document's current contents into the project as ONE
 * undoable step on the zone-art stack, together with `leading` — the
 * `set-tileset-tiles` commands the same gesture already produced for its
 * atlas-backed cells, which apply first.
 *
 * Returns true when a command was executed.
 *
 * ⚠ IT MUST BE CALLED AFTER THE DOCUMENT HAS BEEN MUTATED, not before. Unlike
 * the snapshot histories (`state/composer-history.ts`, which record the BEFORE
 * state and let the caller apply the edit), a command carries both states and is
 * built by DIFFING the mutated document against the library chunk. There is
 * nothing to record until the write has landed.
 *
 * ⚠ IT ALWAYS EXECUTES `leading`, even when the chunk half cannot be built (no
 * project, the chunk gone from the library, or a tileset that would overflow
 * 2048 tiles). Dropping the atlas edits in those cases would turn a refusal to
 * record into a refusal to EDIT.
 */
export function commitChunkDocStep(description: string, leading: readonly AnyCommand[] = []): boolean {
  const o = useArtStore.getState().open;
  const pstate = useProjectStore.getState();
  const level = getActiveLevel(pstate);
  const zone = getCurrentZone(pstate);
  if (!level) return false;

  const chunkCmds: AnyCommand[] = [];
  let chunk: ChunkDef | undefined;
  if (isChunkDocument(o) && zone && pstate.project) {
    chunk = pstate.project.chunkLibrary.find((c) => c.id === o!.chunkId);
    if (!chunk) {
      // The same refusal `composerSaveState` states for Save, at the same
      // moment: a chunk whose library entry was undone or cleared away has
      // nothing to be written back to. Reported, never silently called clean.
      useToastStore.getState().addToast(
        `The chunk "${o!.name}" is no longer in the chunk library, so this edit `
        + 'cannot be recorded on it', 'error');
    } else {
      const atlas = zone.tileset.tiles;
      try {
        const slice = sliceForSave(o!.doc, atlasAfter(atlas, leading));
        if (slice.newTiles.length > 0) {
          chunkCmds.push({
            type: 'set-tileset-tiles',
            description: `${description} (+${slice.newTiles.length} tiles)`,
            sectionIndex: -1,
            at: atlas.length,
            oldTiles: slice.newTiles.map(() => null),
            newTiles: slice.newTiles,
          });
        }
        if (!sameWords(chunk.nametable, slice.nametable)
          || !sameWords(chunk.collisionA, o!.doc.collisionA)
          || !sameWords(chunk.collisionB, o!.doc.collisionB)) {
          chunkCmds.push({
            type: 'set-chunk',
            description,
            sectionIndex: -1,
            chunkId: chunk.id,
            oldNametable: new Uint16Array(chunk.nametable),
            newNametable: new Uint16Array(slice.nametable),
            oldCollisionA: new Uint16Array(chunk.collisionA),
            newCollisionA: new Uint16Array(o!.doc.collisionA),
            oldCollisionB: new Uint16Array(chunk.collisionB),
            newCollisionB: new Uint16Array(o!.doc.collisionB),
          });
        } else if (chunkCmds.length > 0) {
          // New tiles with an unchanged nametable is not reachable (a tile is
          // only appended because a cell now points at it), but appending art
          // nothing references would be a leak, so it is refused rather than
          // recorded.
          chunkCmds.length = 0;
        }
      } catch (err) {
        // `sliceForSave` throws at the 2048-tile ceiling. The stroke stays in
        // the document (un-recorded, exactly as before this parcel) rather than
        // being thrown away, and the author is told why.
        useToastStore.getState().addToast(
          String(err instanceof Error ? err.message : err), 'error');
      }
    }
  }

  const all = [...leading, ...chunkCmds];
  if (all.length === 0) return false;
  executeCommand(all.length === 1 ? all[0] : {
    type: 'batch', description, sectionIndex: -1, commands: all,
  }, level);

  // Re-derive so the document and the chunk it edits cannot diverge: the local
  // tiles the step just materialised collapse to the atlas references the
  // nametable now holds, which is what makes the NEXT gesture a diff against
  // this state rather than against a buffer that still thinks it owns them.
  if (chunk && chunkCmds.length > 0 && o) restoreComposerDoc(o.doc, docFromChunk(chunk));
  return true;
}

/**
 * Rebuild the open chunk document from the library chunk it edits, when the two
 * have drifted apart. Driven off the aeon history clock by `ComposerCanvas`.
 *
 * THIS IS WHAT MAKES UNDO VISIBLE. `commitChunkDocStep` records a `set-chunk`,
 * and undoing it rewrites the LIBRARY chunk — a project object the composer only
 * ever read at open time. Without this the canvas would go on showing the stroke
 * that had just been reverted, and the next gesture would diff against it and
 * fold it back in.
 *
 * A no-op when the two already agree, which is the common case: the same clock
 * ticks for every `set-tileset-tiles` on an atlas-backed cell (census P3a),
 * which changes tile pixels and no nametable word.
 */
export function syncChunkDocFromLibrary(): void {
  const s = useArtStore.getState();
  const o = s.open;
  if (!isChunkDocument(o)) return;
  const pstate = useProjectStore.getState();
  const zone = getCurrentZone(pstate);
  const chunk = pstate.project?.chunkLibrary.find((c) => c.id === o!.chunkId);
  if (!chunk || !zone) return;
  const slice = (() => {
    try { return sliceForSave(o!.doc, zone.tileset.tiles); } catch { return null; }
  })();
  // CANNOT TELL, so do nothing: `sliceForSave` throws at the 2048-tile ceiling,
  // and a document holding art this cannot resolve is exactly the one whose
  // contents a blind rebuild would destroy.
  if (!slice) return;
  if (sameWords(slice.nametable, chunk.nametable)
    && sameWords(o!.doc.collisionA, chunk.collisionA)
    && sameWords(o!.doc.collisionB, chunk.collisionB)) return;
  restoreComposerDoc(o!.doc, docFromChunk(chunk));
  s.bumpDoc();
}
