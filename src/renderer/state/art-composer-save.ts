// THE AEON COMPOSER DOCUMENT'S SAVE — extracted from
// workspace/facets/art-facet.tsx so that something other than one React button
// can reach it.
//
// WHY IT MOVED. `artStore.open` is a document store on the unsaved-work
// perimeter: project-open-guard's snapshot reads `open.dirty`, so a dirty
// composer drawing makes the open and close guards ASK. But the SaveCoordinator
// had four savers and none of them touched this store, and nothing else ever
// clears the flag on an existing entry (artStore has openDocument /
// closeDocument and markOpenDirty — there is no markOpenClean). So "Save &
// open" ran the savers, the guard re-snapshotted, `artDirty` was still true,
// and the guard aborted with a toast telling the user to save or discard first:
// the primary button in that dialog was INERT BY CONSTRUCTION, and only
// Discard — which throws the drawing away — could ever get past it.
//
// This module is the half that makes Save mean something. `composerSaveState`
// is the half that lets the guard refuse to offer Save where even this cannot
// help, because offering a button that cannot work is its own defect.
//
// NOTHING ABOUT THE SAVE ITSELF CHANGED. `saveComposerDocument` is the art
// facet's `handleSave` moved verbatim (with its `slug` helper), so the
// chunk-library write, the act propagation and the out-of-act report are the
// same code the facet's Save button always ran; art-facet.tsx now calls this.

import { useArtStore } from './artStore';
import { useProjectStore, getActiveLevel, getCurrentZone } from './projectStore';
import { useEditorStore, executeCommand } from './editorStore';
import { useToastStore } from './toastStore';
import { docFromChunk, sliceForSave } from '../../core/art/composer-buffer';
import type { ChunkDef } from '../../core/model/s4-types';
import type { AnyCommand } from '../../core/editing/commands';
import {
  buildActPropagationCommand, findOutOfActChunkCopies, describeOutOfActChunkCopies,
} from '../../core/editing/chunk-links';

/**
 * CAN SAVE WRITE THE OPEN COMPOSER DOCUMENT — a discriminated union rather than
 * a boolean, deliberately.
 *
 * A boolean would have to conflate "there is nothing to save" with "there is
 * something to save and no writer for it", and those two demand OPPOSITE things
 * of the guard: the first means Save is irrelevant, the second means Save must
 * not be offered and the user has to be TOLD why. That conflation is the defect
 * this parcel closes, so it is not representable here. (Same shape, for the same
 * reason, as `WriteOutcome` in shared/ipc-types.ts and `PathProbe` in
 * main/file-io.ts.)
 *
 * `blocked` carries the sentence the dialog body and the abort toast show, so
 * the words live beside the rule that decides them rather than being restated
 * at each door.
 */
export type ComposerSaveState =
  | { kind: 'nothing-to-save' }
  | { kind: 'savable' }
  | { kind: 'blocked'; why: string };

/**
 * Derived from the two places that already decide this, so it cannot disagree
 * with either:
 *
 *   • `ArtOptions.showSave` (art-facet.tsx) hides the Save button for a
 *     live-tile document and for a BG-override document, because both commit
 *     every stroke as an undoable command and so have nothing of their own to
 *     save. Neither is SUPPOSED to become dirty — but `ComposerCanvas`'s
 *     `applyTileCell` and its collision paste call `markOpenDirty()` for any
 *     document kind, so a tile-space tool on one of those leaves doc-local
 *     state with no writer. That is REPORTED here, not quietly called clean:
 *     calling it clean is how the perimeter would go back to losing work
 *     silently, which is worse than the loop this parcel is fixing.
 *
 *   • `saveComposerDocument` itself returns without writing anything when there
 *     is no project / current zone / current act to save into.
 *
 *   • ...AND when the chunk it would write back to is GONE from the library. That
 *     fourth early return was MISSED when this function was derived, and the miss
 *     was the very defect the function exists to prevent: a chunk document whose
 *     chunk had been undone or cleared away reported `savable`, so the two
 *     perimeter doors offered `Save & open` / `Save & close` as the PRIMARY button
 *     over work that `saveComposerDocument` answers with
 *     "Chunk no longer exists. Cannot save" and nothing else. The save then ran,
 *     wrote nothing, the re-snapshot saw the same dirt, and the only exit left was
 *     Discard. Reachable: open a chunk, paint it, then Clear the chunk library or
 *     undo the add that created it.
 */
export function composerSaveState(): ComposerSaveState {
  const o = useArtStore.getState().open;
  if (!o || !o.dirty) return { kind: 'nothing-to-save' };
  if (o.liveTileIndex !== null) {
    return {
      kind: 'blocked',
      why: 'A tile document writes straight to the tileset, so the document-local '
        + 'changes stacked on top of it have nowhere to be saved.',
    };
  }
  if (o.bgOverride) {
    return {
      kind: 'blocked',
      why: 'A band-art document commits every stroke as a command, so the '
        + 'document-local changes stacked on top of it have nowhere to be saved.',
    };
  }
  const pstate = useProjectStore.getState();
  if (!pstate.project || !getCurrentZone(pstate) || !getActiveLevel(pstate)) {
    return {
      kind: 'blocked',
      why: `The art document "${o.name}" has no open zone and act to be saved into, `
        + 'so Save cannot write it.',
    };
  }
  // The same lookup `saveComposerDocument` does before it touches history, asked
  // BEFORE a door promises a save. Its refusal sentence is the model for this one.
  if (o.chunkId !== null
    && !pstate.project.chunkLibrary.some((c) => c.id === o.chunkId)) {
    return {
      kind: 'blocked',
      why: `The chunk "${o.name}" is no longer in the chunk library, so Save has `
        + 'nothing to write those strokes back to.',
    };
  }
  return { kind: 'savable' };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chunk';
}

/**
 * Save the open chunk/new document to the chunk library. New local tiles
 * are first appended to the zone tileset (one undoable command); the chunk
 * layout itself goes through set-chunk (existing) or addChunks (new —
 * library adds stay outside history, matching the import flow).
 */
export function saveComposerDocument(): void {
  const o = useArtStore.getState().open;
  const pstate = useProjectStore.getState();
  const zone = getCurrentZone(pstate);
  const level = getActiveLevel(pstate);
  if (!o || !zone || !level || !pstate.project) return;
  const atlas = zone.tileset.tiles;

  let slice;
  try {
    slice = sliceForSave(o.doc, atlas);
  } catch (err) {
    useToastStore.getState().addToast(String(err instanceof Error ? err.message : err), 'error');
    return;
  }
  // Note: sliceForSave already throws when atlas.length + newTiles >= 0x800,
  // so an additional > 0x800 ceiling guard here is unreachable.

  // Verify the chunk still exists before touching history.
  let existingChunk: ChunkDef | undefined;
  if (o.chunkId !== null) {
    existingChunk = pstate.project.chunkLibrary.find((c) => c.id === o.chunkId);
    if (!existingChunk) {
      useToastStore.getState().addToast('Chunk no longer exists. Cannot save', 'error');
      return;
    }
  }

  if (slice.newTiles.length > 0) {
    executeCommand({
      type: 'set-tileset-tiles',
      description: `art: add ${slice.newTiles.length} tiles for ${o.name}`,
      sectionIndex: -1,
      at: atlas.length,
      oldTiles: slice.newTiles.map(() => null),
      newTiles: slice.newTiles,
    }, level);
  }

  let saved: ChunkDef | undefined;
  /** Set on the EDIT path only: the sentence naming the linked copies this
   *  act-scoped propagation did not reach, or null when there are none. A NEW
   *  chunk has no copies anywhere yet, so the add path leaves it null. */
  let outOfActNote: string | null = null;
  if (o.chunkId !== null) {
    const chunk = existingChunk!;
    const setChunk: AnyCommand = {
      type: 'set-chunk',
      description: `art: edit chunk ${chunk.name}`,
      sectionIndex: -1,
      chunkId: chunk.id,
      oldNametable: new Uint16Array(chunk.nametable),
      newNametable: new Uint16Array(slice.nametable),
      oldCollisionA: new Uint16Array(chunk.collisionA),
      newCollisionA: new Uint16Array(o.doc.collisionA),
      oldCollisionB: new Uint16Array(chunk.collisionB),
      newCollisionB: new Uint16Array(o.doc.collisionB),
    };

    // ═══ PROPAGATION — owner ruling d-18c, the payoff half ═══
    //
    // Every tile in this act that still REMEMBERS a placement of this chunk is
    // rewritten to the chunk's new contents. Tiles whose link was broken —
    // hand-painted, pasted, flipped, or buried by a later stamp — are left
    // alone; that refusal is the whole reason the identity plane exists, and
    // `withLinkBreaks` at the brush sites (previous commit on this branch) is
    // what makes it true. THIS CALL MUST NOT LAND WITHOUT THAT ONE: it would
    // silently overwrite art the author had already corrected by hand.
    //
    // ⚠ BUILT HERE, AT CONSTRUCTION TIME, NOT INSIDE AN APPLIER. A command has
    // to carry BOTH states — the applier is handed no way to record what it
    // overwrote, so a propagation assembled there could never be undone. It is
    // built from a chunk carrying the NEW contents and the OLD sections, before
    // `setChunk` runs; `set-chunk` touches only the library, so the section
    // words this reads are the same either way.
    //
    // ONE UNDO STEP, deliberately: a chunk edit that propagated into four
    // sections and then took five presses to undo would leave the level in a
    // state the author never authored. The batch is mixed-scope (`set-chunk` is
    // zone data, the propagation children are act data) — `isZoneScopedCommand`
    // anticipates exactly this and pins a mixed batch to the ACT stack. Here it
    // changes nothing, because this call site uses `executeCommand`, which
    // routes by focus rather than by scope, and did so for the bare `set-chunk`
    // too. When nothing is linked the batch is not built at all, so the common
    // case is byte-for-byte the command this used to issue.
    //
    // ACT-SCOPED, and that is a real limit rather than an oversight: the chunk
    // library is project-wide, so copies of this chunk stamped in OTHER acts
    // keep their links and are not updated here. `buildActPropagationCommand`
    // is indexed by flat act slot and one command belongs to one act's undo
    // stack; a cross-act step would be undoable from a tab it did not belong to.
    //
    // ...AND THE LIMIT IS NOW REPORTED RATHER THAN SILENT. `outOfAct` below
    // names every act that still links this chunk and was not reached, and the
    // save toast says so. The panel's sentence (CHUNK_LINK_LINKED_BLURB) states
    // the same scope. Before 2026-08-30 the panel promised "every copy" and
    // nothing here contradicted it, so a second act's stamps diverged unseen.
    // The reasoning behind reporting rather than propagating is written out at
    // the top of chunk-links.ts's out-of-act section.
    const outOfAct = findOutOfActChunkCopies({
      chunkId: chunk.id,
      zones: pstate.project.zones,
      currentAct: level.act ?? null,
    });
    const propagation = buildActPropagationCommand({
      chunk: {
        ...chunk,
        nametable: new Uint16Array(slice.nametable),
        collisionA: new Uint16Array(o.doc.collisionA),
        collisionB: new Uint16Array(o.doc.collisionB),
      },
      sections: level.sections,
      description: `art: edit chunk ${chunk.name}`,
    });
    executeCommand(propagation
      ? {
        type: 'batch',
        description: `art: edit chunk ${chunk.name}`,
        sectionIndex: propagation.sectionIndex,
        commands: [setChunk, propagation],
      }
      : setChunk, level);
    outOfActNote = describeOutOfActChunkCopies(outOfAct);
    saved = chunk;
  } else {
    saved = {
      id: `${slug(o.name)}-${Date.now()}`,
      name: o.name,
      widthTiles: o.doc.widthTiles,
      heightTiles: o.doc.heightTiles,
      nametable: new Uint16Array(slice.nametable),
      collisionA: new Uint16Array(o.doc.collisionA),
      collisionB: new Uint16Array(o.doc.collisionB),
    };
    useProjectStore.getState().addChunks([saved]);
    useEditorStore.getState().markDirty();
  }
  // Thumbnail invalidation: the set-chunk path bumps THIS chunk's version in
  // editorStore (bumpStoreVersions → chunkIdsAffectedByCommand); the addChunks
  // path mints a timestamped id, so the grid mounts a fresh cell that paints on
  // first sight and cannot inherit a stale key. No explicit bump needed.

  // Re-open from the saved source so locals collapse to atlas references.
  useArtStore.getState().openDocument({
    doc: docFromChunk(saved),
    liveTileIndex: null,
    chunkId: saved.id,
    name: saved.name,
    dirty: false,
  });
  // A WARNING, not a success, when copies survived outside the act: nothing
  // FAILED, but "your other act still shows the old art" is a sentence that has
  // to be ACTED on, and toastStore's 2.2s success dwell is not enough time to
  // read one (see toastStore.dwellMs — the warning tier exists for exactly this
  // shape). With no out-of-act copies the toast is byte-for-byte the old one.
  useToastStore.getState().addToast(
    o.chunkId !== null
      ? (outOfActNote ? `Saved chunk "${saved.name}": ${outOfActNote}` : `Saved chunk "${saved.name}"`)
      : `Added "${saved.name}" to chunk library. Save project to keep`,
    outOfActNote ? 'warning' : 'success');
}
