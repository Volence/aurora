import { create } from 'zustand';
import { EditHistory } from '../../core/editing/history';
import type { AnyCommand, S4Level } from '../../core/editing/commands';

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

interface EditorState {
  tool: EditorTool;
  selection: Selection | null;
  multiSelection: MultiSelection | null;
  dirty: boolean;
  historyVersion: number;
  chunkLibraryVersion: number;

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

  setTool: (tool: EditorTool) => void;
  setSelection: (selection: Selection | null) => void;
  setMultiSelection: (multiSelection: MultiSelection | null) => void;
  setActiveSectionIndex: (index: number) => void;
  setEditingLayer: (layer: EditingLayer) => void;
  setSelectedTileIndex: (index: number) => void;
  setSelectedPaletteLine: (line: number) => void;
  setSelectedChunkId: (id: string | null) => void;
  setSelectedObjectTypeId: (id: string | null, subtype?: number) => void;
  setSelectedRingPattern: (index: number) => void;
  setSelectedCollisionType: (type: number) => void;
  markDirty: () => void;
  markClean: () => void;
  bumpVersion: () => void;
  bumpChunkLibraryVersion: () => void;
}

export const editHistory = new EditHistory();

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'view',
  selection: null,
  multiSelection: null,
  dirty: false,
  historyVersion: 0,
  chunkLibraryVersion: 0,

  activeSectionIndex: 0,
  editingLayer: 'fg',
  selectedTileIndex: 0,
  selectedPaletteLine: 0,
  selectedChunkId: null,
  selectedObjectTypeId: null,
  selectedObjectSubtype: 0,
  selectedRingPattern: 0,
  selectedCollisionType: 0,

  setTool: (tool) => set({ tool, selection: null, multiSelection: null }),
  setSelection: (selection) => set({ selection, multiSelection: null }),
  setMultiSelection: (multiSelection) => set({ multiSelection, selection: null }),
  setActiveSectionIndex: (index) => set({ activeSectionIndex: index }),
  setEditingLayer: (layer) => set({ editingLayer: layer }),
  setSelectedTileIndex: (index) => set({ selectedTileIndex: index }),
  setSelectedPaletteLine: (line) => set({ selectedPaletteLine: line }),
  setSelectedChunkId: (id) => set({ selectedChunkId: id }),
  setSelectedObjectTypeId: (id, subtype) => set({ selectedObjectTypeId: id, selectedObjectSubtype: subtype ?? 0 }),
  setSelectedRingPattern: (index) => set({ selectedRingPattern: index }),
  setSelectedCollisionType: (type) => set({ selectedCollisionType: type }),
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
 * Execute a command against the current level, updating history and triggering re-render.
 */
export function executeCommand(command: AnyCommand, level: S4Level): void {
  editHistory.execute(command, level);
  invalidationListener?.(command);
  useEditorStore.getState().markDirty();
  useEditorStore.getState().bumpVersion();
}

export function undo(level: S4Level): void {
  const cmd = editHistory.undo(level);
  if (cmd) invalidationListener?.(cmd);
  useEditorStore.getState().bumpVersion();
}

export function redo(level: S4Level): void {
  const cmd = editHistory.redo(level);
  if (cmd) invalidationListener?.(cmd);
  useEditorStore.getState().bumpVersion();
}
