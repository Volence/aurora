import React, { useState, useEffect } from 'react';
import { useArtStore } from '../../state/artStore';
import { openDocumentGuarded } from './open-document';
import { createDoc, docFromChunk, sliceForSave } from '../../../core/art/composer-buffer';
import { useProjectStore, getActiveLevel, getCurrentZone } from '../../state/projectStore';
import { useEditorStore, undo, redo, executeCommand } from '../../state/editorStore';
import { useToastStore } from '../../state/toastStore';
import type { ChunkDef } from '../../../core/model/s4-types';
import ComposerCanvas from './ComposerCanvas';
import ToolColumn from './ToolColumn';
import TilesetPanel from './TilesetPanel';
import PaletteEditor from './PaletteEditor';
import ChunkLibrary from '../ChunkLibrary';

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chunk';
}

export default function ArtMode() {
  const open = useArtStore((s) => s.open);
  const openDocument = useArtStore((s) => s.openDocument);
  const historyVersion = useEditorStore((s) => s.historyVersion);
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
      useToastStore.getState().addToast('Tile no longer exists (undone) — document closed', 'info');
      return;
    }
    if (o.chunkId !== null && state.project
        && !state.project.chunkLibrary.some((c) => c.id === o.chunkId)) {
      useArtStore.getState().closeDocument();
      useToastStore.getState().addToast('Chunk no longer exists — document closed', 'info');
    }
  }, [historyVersion, project]);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y: MapViewport (which owns the map-mode
  // handler) is unmounted while in Art mode, so undo/redo must be re-bound
  // here. Same call pattern as MapViewport's keyboard path — the level view
  // includes the zone tileset/palette so zone commands undo correctly.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip undo/redo only for text-entry inputs; allow range/checkbox/button/
      // radio so Ctrl+Z works immediately after a palette slider commit.
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT'
          && !['range', 'checkbox', 'button', 'radio'].includes(
            (target as HTMLInputElement).type)) return;
      const level = getActiveLevel(useProjectStore.getState());
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (level) undo(level);
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        if (level) redo(level);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

  function handleNewChunk() {
    const w = clampDim(chunkW);
    const h = clampDim(chunkH);
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
        useToastStore.getState().addToast('Chunk no longer exists — cannot save', 'error');
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
    if (o.chunkId !== null) {
      const chunk = existingChunk!;
      executeCommand({
        type: 'set-chunk',
        description: `art: edit chunk ${chunk.name}`,
        sectionIndex: -1,
        chunkId: chunk.id,
        oldNametable: new Uint16Array(chunk.nametable),
        newNametable: new Uint16Array(slice.nametable),
        oldCollision: new Uint8Array(chunk.collision),
        newCollision: new Uint8Array(slice.collision),
      }, level);
      saved = chunk;
    } else {
      saved = {
        id: `${slug(o.name)}-${Date.now()}`,
        name: o.name,
        widthTiles: o.doc.widthTiles,
        heightTiles: o.doc.heightTiles,
        nametable: new Uint16Array(slice.nametable),
        collision: new Uint8Array(slice.collision),
      };
      useProjectStore.getState().addChunks([saved]);
      useEditorStore.getState().markDirty();
    }
    // Thumbnail invalidation: the set-chunk path bumps chunkLibraryVersion in
    // editorStore (bumpStoreVersions); the addChunks path changes chunks.length,
    // which is part of ChunkLibrary's thumb cache key. No explicit bump needed.

    // Re-open from the saved source so locals collapse to atlas references.
    openDocument({
      doc: docFromChunk(saved),
      liveTileIndex: null,
      chunkId: saved.id,
      name: saved.name,
      dirty: false,
    });
    useToastStore.getState().addToast(
      o.chunkId !== null
        ? `Saved chunk "${saved.name}"`
        : `Added "${saved.name}" to chunk library — Save project to keep`,
      'success');
  }

  const showSave = open !== null && open.liveTileIndex === null;
  // Chunk docs whose cells reference atlas tiles: pixel edits to those cells
  // write the shared tileset tile, so they show up everywhere it's used.
  const hasSharedTiles = open !== null && open.chunkId !== null
    && open.doc.cells.some((c) => c.atlasTile !== null);

  return (
    <div style={styles.root}>
      {/* Left panel: tool column */}
      <div style={styles.leftPanel}>
        <div style={styles.panelHeader}>Tools</div>
        <ToolColumn />
      </div>

      {/* Center: composer canvas or new-document launcher */}
      <div style={styles.center}>
        {open ? (
          <div style={styles.canvasArea}>
            <div style={styles.docHeader}>
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
            </div>
            <ComposerCanvas />
          </div>
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
              <button style={styles.newButton} onClick={handleNewChunk}>
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

      {/* Right panel: tileset + palette + chunk library */}
      <div style={styles.rightPanel}>
        <TilesetPanel />
        <div style={styles.panelHeader}>Palette</div>
        <PaletteEditor />
        <ChunkLibrary />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    background: '#12151E',
    color: '#E8EAF2',
  },
  leftPanel: {
    width: 56,
    display: 'flex',
    flexDirection: 'column',
    background: '#0A0C12',
    borderRight: '1px solid #2A2F3D',
    flexShrink: 0,
  },
  rightPanel: {
    width: 220,
    display: 'flex',
    flexDirection: 'column',
    background: '#0A0C12',
    borderLeft: '1px solid #2A2F3D',
    flexShrink: 0,
    overflow: 'auto',
  },
  panelHeader: {
    padding: '4px 8px',
    fontSize: 10,
    fontWeight: 600,
    color: '#6E7589',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    borderBottom: '1px solid #2A2F3D',
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#12151E',
  },
  canvasArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  docHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 12px',
    background: '#0A0C12',
    borderBottom: '1px solid #2A2F3D',
    flexShrink: 0,
  },
  docName: {
    fontSize: 12,
    color: '#E8EAF2',
    fontWeight: 500,
  },
  sharedWarning: {
    fontSize: 10,
    color: '#f9e2af',
  },
  dirtyBadge: {
    fontSize: 9,
    color: '#12151E',
    background: '#f9e2af',
    padding: '0 4px',
    borderRadius: 3,
    lineHeight: '14px',
    fontWeight: 600,
  },
  saveButton: {
    marginLeft: 'auto',
    padding: '2px 10px',
    background: '#a6e3a1',
    color: '#12151E',
    border: '1px solid #a6e3a1',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
  },
  saveDisabled: {
    background: '#2A2F3D',
    color: '#6E7589',
    borderColor: '#3A4152',
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
  },
  launcherTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: '#E8EAF2',
    marginBottom: 8,
  },
  newButton: {
    padding: '8px 20px',
    background: '#2A2F3D',
    color: '#E8EAF2',
    border: '1px solid #3A4152',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
    justifyContent: 'center',
  },
  preset: {
    fontSize: 11,
    color: '#34D399',
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
    fontSize: 12,
    color: '#B8BECE',
  },
  dimInput: {
    width: 44,
    padding: '4px 6px',
    background: '#2A2F3D',
    color: '#E8EAF2',
    border: '1px solid #3A4152',
    borderRadius: 4,
    fontSize: 12,
  },
};
