import { create } from 'zustand';
import { EditHistory } from '../../core/editing/history';
import type { AnyCommand, S4Level } from '../../core/editing/commands';
import type { Level } from '../../core/model/types';

export type EditorTool = 'view' | 'select' | 'place-object' | 'place-ring' | 'paint-chunk';

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

interface EditorState {
  tool: EditorTool;
  selection: Selection | null;
  multiSelection: MultiSelection | null;
  dirty: boolean;
  historyVersion: number;
  selectedChunkIndex: number;
  selectedObjectType: number;
  selectedObjectSubtype: number;
  selectedRingPattern: number;

  setTool: (tool: EditorTool) => void;
  setSelection: (selection: Selection | null) => void;
  setMultiSelection: (multiSelection: MultiSelection | null) => void;
  setSelectedChunkIndex: (index: number) => void;
  setSelectedObjectType: (type: number, subtype?: number) => void;
  setSelectedRingPattern: (index: number) => void;
  markDirty: () => void;
  markClean: () => void;
  bumpVersion: () => void;
}

export const editHistory = new EditHistory();

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'view',
  selection: null,
  multiSelection: null,
  dirty: false,
  historyVersion: 0,
  selectedChunkIndex: 0,
  selectedObjectType: 0x02,
  selectedObjectSubtype: 0,
  selectedRingPattern: 0,

  setTool: (tool) => set({ tool, selection: null, multiSelection: null }),
  setSelection: (selection) => set({ selection, multiSelection: null }),
  setMultiSelection: (multiSelection) => set({ multiSelection, selection: null }),
  setSelectedChunkIndex: (index) => set({ selectedChunkIndex: index }),
  setSelectedObjectType: (type, subtype) => set({ selectedObjectType: type, selectedObjectSubtype: subtype ?? 0 }),
  setSelectedRingPattern: (index) => set({ selectedRingPattern: index }),
  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),
  bumpVersion: () => set((s) => ({ historyVersion: s.historyVersion + 1 })),
}));

/**
 * Execute a command against the current level, updating history and triggering re-render.
 */
export function executeCommand(command: AnyCommand, level: S4Level): void {
  editHistory.execute(command, level);
  useEditorStore.getState().markDirty();
  useEditorStore.getState().bumpVersion();
}

export function undo(level: S4Level): void {
  editHistory.undo(level);
  useEditorStore.getState().bumpVersion();
}

export function redo(level: S4Level): void {
  editHistory.redo(level);
  useEditorStore.getState().bumpVersion();
}
