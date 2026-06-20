import { create } from 'zustand';
import { EditHistory } from '../../core/editing/history';
import type { AnyCommand, S4Level } from '../../core/editing/commands';
import { useArtStore } from './artStore';
import { registerRedoClearer, invalidateSiblingRedos } from '../../core/editing/undo-bus';

export type EditorTool =
  | 'view' | 'select' | 'paint-tile' | 'paint-block' | 'stamp-chunk'
  | 'paint-collision' | 'eraser' | 'place-object' | 'place-ring';

export interface Selection {
  type: 'object' | 'ring';
  sectionIndex: number;
  index: number;
}

export interface MultiSelection {
  sectionIndex: number;
  objects: number[];
  rings: number[];
}

export interface RingPattern {
  name: string;
  offsets: Array<{ dx: number; dy: number }>;
}

export const RING_PATTERNS: RingPattern[] = [
  { name: 'Single', offsets: [{ dx: 0, dy: 0 }] },
  { name: 'H×2', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }] },
  { name: 'H×3', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }] },
  { name: 'H×4', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }, { dx: 72, dy: 0 }] },
  { name: 'H×5', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }, { dx: 72, dy: 0 }, { dx: 96, dy: 0 }] },
  { name: 'H×8', offsets: Array.from({ length: 8 }, (_, i) => ({ dx: i * 24, dy: 0 })) },
  { name: 'V×2', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }] },
  { name: 'V×3', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }] },
  { name: 'V×4', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }, { dx: 0, dy: 72 }] },
  { name: 'V×5', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }, { dx: 0, dy: 72 }, { dx: 0, dy: 96 }] },
  { name: 'V×8', offsets: Array.from({ length: 8 }, (_, i) => ({ dx: 0, dy: i * 24 })) },
  { name: 'Diamond', offsets: [
    { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 48, dy: 24 }, { dx: 24, dy: 48 },
  ]},
  { name: 'Circle', offsets: (() => {
    const r = 36;
    return Array.from({ length: 8 }, (_, i) => ({
      dx: Math.round(r * Math.cos(i * Math.PI / 4)),
      dy: Math.round(r * Math.sin(i * Math.PI / 4)),
    }));
  })()},
  { name: '2×2 Box', offsets: [
    { dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 24, dy: 24 },
  ]},
  { name: '3×3 Box', offsets: [
    { dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 },
    { dx: 0, dy: 24 }, { dx: 24, dy: 24 }, { dx: 48, dy: 24 },
    { dx: 0, dy: 48 }, { dx: 24, dy: 48 }, { dx: 48, dy: 48 },
  ]},
  { name: 'Triangle', offsets: [
    { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 24, dy: 24 }, { dx: 48, dy: 24 },
  ]},
];

export type EditingLayer = 'fg' | 'bg';

export type AppMode = 'map' | 'art' | 'sprite';

interface EditorState {
  tool: EditorTool;
  selection: Selection | null;
  multiSelection: MultiSelection | null;
  dirty: boolean;
  historyVersion: number;
  chunkLibraryVersion: number;
  appMode: AppMode;

  // S4 tool state
  activeSectionIndex: number;
  editingLayer: EditingLayer;
  selectedTileIndex: number;
  selectedPaletteLine: number;
  selectedChunkId: string | null;
  selectedObjectTypeId: string | null;
  selectedObjectSubtype: number;
  selectedRingPattern: number;
  selectedCollisionType: number;
  selectedCollisionProfile: number; // 0-255 attr index for the map collision palette
  collisionPaintPlane: 'a' | 'b';
  collisionBrushSize: number; // brush width in 16px blocks; 1 = reuse, >1 = positional N×N area

  setTool: (tool: EditorTool) => void;
  setSelection: (selection: Selection | null) => void;
  setMultiSelection: (multiSelection: MultiSelection | null) => void;
  setActiveSectionIndex: (index: number) => void;
  setEditingLayer: (layer: EditingLayer) => void;
  setAppMode: (mode: AppMode) => void;
  setSelectedTileIndex: (index: number) => void;
  setSelectedPaletteLine: (line: number) => void;
  setSelectedChunkId: (id: string | null) => void;
  setSelectedObjectTypeId: (id: string | null, subtype?: number) => void;
  setSelectedRingPattern: (index: number) => void;
  setSelectedCollisionType: (type: number) => void;
  setSelectedCollisionProfile: (index: number) => void;
  setCollisionPaintPlane: (plane: 'a' | 'b') => void;
  setCollisionBrushSize: (size: number) => void;
  markDirty: () => void;
  markClean: () => void;
  bumpVersion: () => void;
  bumpChunkLibraryVersion: () => void;
}

export const editHistory = new EditHistory();
// Let a sibling history (the sprite snapshot history) invalidate this redo when a
// new sprite edit lands, and vice-versa — so sprite mode behaves as one timeline.
const clearLevelRedo = () => editHistory.clearRedo();
registerRedoClearer(clearLevelRedo);

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'view',
  selection: null,
  multiSelection: null,
  dirty: false,
  historyVersion: 0,
  chunkLibraryVersion: 0,
  appMode: 'map' as AppMode,

  activeSectionIndex: 0,
  editingLayer: 'fg',
  selectedTileIndex: 0,
  selectedPaletteLine: 0,
  selectedChunkId: null,
  selectedObjectTypeId: null,
  selectedObjectSubtype: 0,
  selectedRingPattern: 0,
  selectedCollisionType: 0,
  selectedCollisionProfile: 0,
  collisionPaintPlane: 'a',
  collisionBrushSize: 1,

  setTool: (tool) => set({ tool, selection: null, multiSelection: null }),
  setSelection: (selection) => set({ selection, multiSelection: null }),
  setMultiSelection: (multiSelection) => set({ multiSelection, selection: null }),
  setActiveSectionIndex: (index) => set({ activeSectionIndex: index }),
  setEditingLayer: (layer) => set({ editingLayer: layer }),
  setAppMode: (mode) => set({ appMode: mode }),
  setSelectedTileIndex: (index) => set({ selectedTileIndex: index }),
  setSelectedPaletteLine: (line) => set({ selectedPaletteLine: line }),
  setSelectedChunkId: (id) => set({ selectedChunkId: id }),
  setSelectedObjectTypeId: (id, subtype) => set({ selectedObjectTypeId: id, selectedObjectSubtype: subtype ?? 0 }),
  setSelectedRingPattern: (index) => set({ selectedRingPattern: index }),
  setSelectedCollisionType: (type) => set({ selectedCollisionType: type }),
  setSelectedCollisionProfile: (index) => set({ selectedCollisionProfile: Math.max(0, Math.min(255, index | 0)) }),
  setCollisionPaintPlane: (collisionPaintPlane) => set({ collisionPaintPlane }),
  setCollisionBrushSize: (size) => set({ collisionBrushSize: Math.max(1, Math.min(15, size | 0)) }),
  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),
  bumpVersion: () => set((s) => ({ historyVersion: s.historyVersion + 1 })),
  bumpChunkLibraryVersion: () => set((s) => ({ chunkLibraryVersion: s.chunkLibraryVersion + 1 })),
}));

/**
 * Centralized renderer-cache invalidation hook. The component that owns the
 * renderer caches (MapViewport) registers a listener here; every command that
 * goes through executeCommand/undo/redo is forwarded to it so cached canvases
 * can be repainted — regardless of whether the mutation came from the UI,
 * keyboard undo/redo, or the agent handler.
 */
let invalidationListener: ((cmd: AnyCommand) => void) | null = null;

export function setCommandInvalidationListener(fn: ((cmd: AnyCommand) => void) | null): void {
  invalidationListener = fn;
}

/**
 * Store-level invalidation for commands. Unlike the renderer-cache listener
 * above (owned by MapViewport, unmounted in Art mode), these version bumps are
 * pure store concerns and must fire for every execute/undo/redo regardless of
 * which mode is active — e.g. undoing a set-chunk in Art mode must still bust
 * the ChunkLibrary thumbnail cache.
 *
 * chunkLibraryVersion is also bumped for set-palette-line and set-tileset-tiles
 * because chunk thumbnails bake both palette colors and tile pixels: in-place
 * tile edits keep tiles.length constant but change pixels, and palette edits
 * change colors used by the baked thumbs.
 */
function bumpStoreVersions(cmd: AnyCommand): void {
  if (cmd.type === 'batch') {
    for (const c of cmd.commands) bumpStoreVersions(c);
    return;
  }
  if (cmd.type === 'set-chunk'
      || cmd.type === 'set-palette-line'
      || cmd.type === 'set-tileset-tiles') {
    useEditorStore.getState().bumpChunkLibraryVersion();
  }
  // A committed palette-line change (a slider commit, a copy-bridge write, or its
  // undo/redo) must repaint every paletteVersion subscriber — notably the sprite
  // canvas, which watches paletteVersion but not historyVersion. The live slider
  // preview bumps paletteVersion itself; this covers the commit + undo/redo paths.
  if (cmd.type === 'set-palette-line') {
    useArtStore.getState().bumpPaletteVersion();
  }
}

/**
 * Execute a command against the current level, updating history and triggering re-render.
 */
export function executeCommand(command: AnyCommand, level: S4Level): void {
  editHistory.execute(command, level);
  // In sprite mode a palette edit is a new entry in the merged sprite-mode
  // timeline, so it invalidates the sprite history's redo. Gated on sprite mode
  // so ordinary level editing (map/art) never disturbs a sprite's redo stack.
  if (useEditorStore.getState().appMode === 'sprite') invalidateSiblingRedos(clearLevelRedo);
  bumpStoreVersions(command);
  invalidationListener?.(command);
  useEditorStore.getState().markDirty();
  useEditorStore.getState().bumpVersion();
}

export function undo(level: S4Level): void {
  const cmd = editHistory.undo(level);
  if (cmd) {
    bumpStoreVersions(cmd);
    invalidationListener?.(cmd);
  }
  useEditorStore.getState().bumpVersion();
}

export function redo(level: S4Level): void {
  const cmd = editHistory.redo(level);
  if (cmd) {
    bumpStoreVersions(cmd);
    invalidationListener?.(cmd);
  }
  useEditorStore.getState().bumpVersion();
}
