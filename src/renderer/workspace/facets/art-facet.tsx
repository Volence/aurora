// Art facet — the composer (Chunk › Block › Tile drill-down, spec §4) as a
// facet module. Content moved from components/art/ArtMode.tsx; the mode's
// EditorShell composition became these slots (LevelWorkspace owns the shell).
// Handlers that only used getState() are module functions; the W/H inputs'
// local state lives in the launcher (Canvas slot); the doc-header Save button
// (ToolOptions slot) shares handleSave via module scope.

import React, { useState, useEffect } from 'react';
import { useArtStore } from '../../state/artStore';
import { openDocumentGuarded, closeDocumentGuarded } from '../../components/art/open-document';
import { createDoc, docFromChunk, sliceForSave } from '../../../core/art/composer-buffer';
import { useProjectStore, getActiveLevel, getCurrentZone } from '../../state/projectStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useAeonHistoryVersion } from '../../hooks/useHistoryVersion';
import { useToastStore } from '../../state/toastStore';
import type { ChunkDef } from '../../../core/model/s4-types';
import type { AnyCommand } from '../../../core/editing/commands';
import {
  buildActPropagationCommand, findOutOfActChunkCopies, describeOutOfActChunkCopies,
} from '../../../core/editing/chunk-links';
import { Panel, CollapsibleSection, T } from '../../components/ui';
import ArtToolDock from '../../shell/ArtToolDock';
import ArtToolOptions from '../../shell/ArtToolOptions';
import ArtStatusBar from '../../shell/ArtStatusBar';
import ComposerCanvas from '../../components/art/ComposerCanvas';
import TilesetPanel from '../../components/art/TilesetPanel';
import PaletteEditor from '../../components/art/PaletteEditor';
import ChunkLibrary from '../../components/ChunkLibrary';
import CollisionPalette from '../../components/CollisionPalette';
import type { FacetModule } from '../facet-registry';
import { bgArtTargetExists } from '../../providers/bg-anim-art';

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chunk';
}

function clampDim(v: number): number {
  return Math.max(1, Math.min(64, Math.round(v)));
}

function handleNewTile() {
  openDocumentGuarded({
    doc: createDoc(1, 1),
    liveTileIndex: null,
    chunkId: null,
    name: 'New Tile (1×1)',
    dirty: false,
  });
}

function handleNewBlock() {
  // A block is the classic 16×16 px unit: 2×2 tiles. (Not to be confused
  // with the s4_engine's internal 128×128 "block" slicing unit — that one
  // is the editor's "chunk".)
  openDocumentGuarded({
    doc: createDoc(2, 2),
    liveTileIndex: null,
    chunkId: null,
    name: 'New Block (16×16)',
    dirty: false,
  });
}

function handleNewChunk(w: number, h: number) {
  openDocumentGuarded({
    doc: createDoc(w, h),
    liveTileIndex: null,
    chunkId: null,
    name: `New Chunk (${w}×${h})`,
    dirty: false,
  });
}

/**
 * Save the open chunk/new document to the chunk library. New local tiles
 * are first appended to the zone tileset (one undoable command); the chunk
 * layout itself goes through set-chunk (existing) or addChunks (new —
 * library adds stay outside history, matching the import flow).
 */
function handleSave() {
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

function ArtCanvas() {
  const open = useArtStore((s) => s.open);
  const historyVersion = useAeonHistoryVersion();
  const project = useProjectStore((s) => s.project);

  // State for the "New Chunk" W/H inputs (default = one 128×128 px chunk)
  const [chunkW, setChunkW] = useState(16);
  const [chunkH, setChunkH] = useState(16);

  // Close stale documents: undo can shrink the tileset below an open live
  // tile, and the chunk library can lose the open chunk (Clear).
  useEffect(() => {
    const o = useArtStore.getState().open;
    if (!o) return;
    const state = useProjectStore.getState();
    const zone = getCurrentZone(state);
    if (o.liveTileIndex !== null && zone
        && o.liveTileIndex >= zone.tileset.tiles.length) {
      useArtStore.getState().closeDocument();
      useToastStore.getState().addToast('Tile no longer exists (undone). Document closed', 'info');
      return;
    }
    // A BG override document can lose its target the same way: an undone
    // band insert takes the bank with it; an undone add shrinks the blob.
    if (o.bgOverride && !bgArtTargetExists(state.project?.bgOverride.doc ?? null, o.bgOverride)) {
      useArtStore.getState().closeDocument();
      useToastStore.getState().addToast('Band art no longer exists (undone). Document closed', 'info');
      return;
    }
    if (o.chunkId !== null && state.project
        && !state.project.chunkLibrary.some((c) => c.id === o.chunkId)) {
      useArtStore.getState().closeDocument();
      useToastStore.getState().addToast('Chunk no longer exists. Document closed', 'info');
    }
  }, [historyVersion, project]);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y are NOT bound here — LevelWorkspace, which
  // hosts every facet, owns the one binding.

  // Fill the shell's canvas slot. The slot is a flex item with a definite
  // height but is not itself a flex container, so an absolutely-positioned
  // full-fill column gives ComposerCanvas (flex:1) a context to expand in —
  // matching how MapViewport fills the same slot.
  return (
    <div style={styles.canvasFill}>
      {open ? (
        <ComposerCanvas />
      ) : (
        <div style={styles.launcher}>
          <div style={styles.launcherTitle}>New Document</div>

          <button style={styles.newButton} onClick={handleNewTile}>
            New Tile <span style={styles.preset}>1×1 (8px)</span>
          </button>

          <button style={styles.newButton} onClick={handleNewBlock}>
            Block <span style={styles.preset}>16×16 px (2×2 tiles)</span>
          </button>

          <div style={styles.newChunkRow}>
            <button
              style={styles.newButton}
              onClick={() => handleNewChunk(clampDim(chunkW), clampDim(chunkH))}
            >
              New Chunk <span style={styles.preset}>(128×128 px = 16×16 tiles)</span>
            </button>
            <label style={styles.dimLabel}>
              W
              <input
                type="number"
                min={1}
                max={64}
                value={chunkW}
                onChange={(e) => setChunkW(clampDim(Number(e.target.value)))}
                style={styles.dimInput}
              />
            </label>
            <label style={styles.dimLabel}>
              H
              <input
                type="number"
                min={1}
                max={64}
                value={chunkH}
                onChange={(e) => setChunkH(clampDim(Number(e.target.value)))}
                style={styles.dimInput}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function ArtOptions() {
  const open = useArtStore((s) => s.open);
  // BG override docs commit every stroke as a command; there is nothing to Save.
  const showSave = open !== null && open.liveTileIndex === null && !open.bgOverride;
  // Chunk docs whose cells reference atlas tiles: pixel edits to those cells
  // write the shared tileset tile, so they show up everywhere it's used.
  const hasSharedTiles = open !== null && open.chunkId !== null
    && open.doc.cells.some((c) => c.atlasTile !== null);

  // Doc header info (name + dirty badge + shared-tile warning + Save) rides at
  // the left edge of the tool-options bar.
  const docHeader = open ? (
    <span style={styles.docHeader}>
      <span style={styles.docName}>{open.name}</span>
      {open.dirty && <span style={styles.dirtyBadge}>unsaved</span>}
      {hasSharedTiles && (
        <span style={styles.sharedWarning}>
          ⚠ pixel edits to existing tiles propagate everywhere they're used
        </span>
      )}
      {showSave && (
        <button
          style={{ ...styles.saveButton, ...(open.dirty ? {} : styles.saveDisabled) }}
          disabled={!open.dirty}
          onClick={handleSave}
          title={open.chunkId !== null
            ? 'Save changes back to this chunk (new tiles are added to the tileset)'
            : 'Save this document as a new chunk in the library'}
        >
          {open.chunkId !== null ? 'Save' : 'Save to library'}
        </button>
      )}
      {/* The only route back to the New Document launcher, which is the facet's
          no-document state. It used to be reachable by simply not having opened
          anything; a project open now lands on the first chunk, so without this
          button "new tile / new block / new chunk" would be unreachable. */}
      <button style={styles.newDocButton} onClick={closeDocumentGuarded}
        title="Close this document and show the New Document options">
        New…
      </button>
    </span>
  ) : null;

  return <ArtToolOptions before={docHeader} />;
}

function ArtPanels() {
  const tool = useArtStore((s) => s.tool);
  const open = useArtStore((s) => s.open);
  // Collision tool needs a tile-space doc (chunk/block/new — not a single live
  // tile, same guard ComposerCanvas uses to hint-and-bail on live tiles).
  const showCollisionPanel = tool === 'collision' && open !== null && open.liveTileIndex === null
    && !open.bgOverride;
  return (
    <Panel width={240} scroll>
      {showCollisionPanel && (
        <CollapsibleSection id="art.collision" title="Collision">
          <CollisionPalette variant="art" />
        </CollapsibleSection>
      )}
      <CollapsibleSection id="art.tileset" title="Tileset">
        <TilesetPanel />
      </CollapsibleSection>
      <CollapsibleSection id="art.palette" title="Palette">
        <PaletteEditor />
      </CollapsibleSection>
      <CollapsibleSection id="art.chunks" title="Chunks" variant="list">
        <ChunkLibrary />
      </CollapsibleSection>
    </Panel>
  );
}

export const artFacet: FacetModule = {
  id: 'art',
  Canvas: ArtCanvas,
  ToolDock: ArtToolDock,
  ToolOptions: ArtOptions,
  RightPanel: ArtPanels,
  StatusBar: ArtStatusBar,
};

const styles: Record<string, React.CSSProperties> = {
  canvasFill: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  docHeader: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },
  docName: {
    fontSize: T.tSm,
    color: T.textHi,
    fontWeight: T.wMedium,
  },
  sharedWarning: {
    fontSize: T.t2xs,
    color: T.warning,
  },
  dirtyBadge: {
    fontSize: T.t2xs,
    color: T.onAccent,
    background: T.warning,
    padding: '0 4px',
    borderRadius: 3,
    lineHeight: '14px',
    fontWeight: T.wSemibold,
  },
  saveButton: {
    padding: '2px 10px',
    background: T.success,
    color: T.onAccent,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: T.success,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: T.tXs,
    fontWeight: T.wSemibold,
  },
  newDocButton: {
    padding: '2px 10px',
    background: T.raised,
    color: T.textBase,
    border: `1px solid ${T.borderStrong}`,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: T.tXs,
  },
  saveDisabled: {
    background: T.raised,
    color: T.textLo,
    borderColor: T.borderStrong,
    cursor: 'default',
  },
  launcher: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
    height: '100%',
  },
  launcherTitle: {
    fontSize: 18,
    fontWeight: T.wSemibold,
    color: T.textHi,
    marginBottom: 8,
  },
  newButton: {
    padding: '8px 20px',
    background: T.raised,
    color: T.textHi,
    border: `1px solid ${T.borderStrong}`,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: T.tBase,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
    justifyContent: 'center',
  },
  preset: {
    fontSize: T.tXs,
    color: T.accent,
  },
  newChunkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dimLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: T.tSm,
    color: T.textBase,
  },
  dimInput: {
    width: 44,
    padding: '4px 6px',
    background: T.raised,
    color: T.textHi,
    border: `1px solid ${T.borderStrong}`,
    borderRadius: 4,
    fontSize: T.tSm,
  },
};
