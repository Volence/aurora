import { create } from 'zustand';
import type { LoadedS4Config } from '../../core/config/s4-config';
import type { S4Project, Zone, Act, Tileset, Palette, ObjectDef, ChunkDef, BgLibraryEntry, Section } from '../../core/model/s4-types';
import { createSection, MAX_ACT_SECTIONS } from '../../core/model/s4-types';
import type { S4Level } from '../../core/editing/commands';

/** A rendered object-preview image + its origin (for centering on the placement point). */
export interface ObjectPreview {
  bitmap: ImageBitmap;
  originX: number;
  originY: number;
}

interface ProjectState {
  config: LoadedS4Config | null;
  project: S4Project | null;
  currentZoneId: string | null;
  currentActId: string | null;
  loading: boolean;
  error: string | null;
  /** Object id → rendered preview (from a sprite binding). Empty until built. */
  objectSprites: Map<string, ObjectPreview>;

  setConfig: (config: LoadedS4Config) => void;
  setProject: (project: S4Project) => void;
  setCurrentAct: (zoneId: string, actId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setObjectSprites: (sprites: Map<string, ObjectPreview>) => void;
  addChunks: (chunks: ChunkDef[]) => void;
  addBgToLibrary: (entry: BgLibraryEntry) => void;
  /**
   * Create a blank section in the current act. Fills the first empty grid slot;
   * if the grid is full, appends a new ROW (grid_h+1) — never grows grid_w, since
   * the flat index depends on grid_w and growing it would re-map every section.
   * Returns the new section's flat index, or null if at the engine cap
   * (grid_w * grid_h would exceed MAX_ACT_SECTIONS) or no act is loaded.
   */
  addSection: (atIndex?: number) => number | null;
  /**
   * Resize the act's section grid to newWidth × newHeight, preserving every
   * section's (col,row) position (only its flat index changes); new slots are
   * null. Returns false (no change) if it would exceed MAX_ACT_SECTIONS or drop
   * a non-null section off a shrunk edge.
   */
  resizeGrid: (newWidth: number, newHeight: number) => boolean;
  /** Clear a section slot to empty (null). Returns true if a section was removed. */
  removeSection: (index: number) => boolean;
  clearChunks: () => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  config: null,
  project: null,
  currentZoneId: null,
  currentActId: null,
  loading: false,
  error: null,
  objectSprites: new Map(),

  setConfig: (config) => set({ config, error: null }),
  setProject: (project) => set({ project }),
  setCurrentAct: (zoneId, actId) => set({ currentZoneId: zoneId, currentActId: actId, loading: false }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  setObjectSprites: (objectSprites) => set({ objectSprites }),
  addChunks: (chunks) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        chunkLibrary: [...state.project.chunkLibrary, ...chunks],
      },
    };
  }),
  // Library adds are additive and live outside undo history, like addChunks
  // (save_chunk). Sections only reference entries by id (set-section-bg IS a
  // history command), so an un-undoable add is non-destructive.
  addBgToLibrary: (entry) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        bgLibrary: [...state.project.bgLibrary, entry],
      },
    };
  }),
  addSection: (atIndex) => {
    const state = get();
    if (!state.project || !state.currentZoneId || !state.currentActId) return null;
    const zone = state.project.zones.find((z) => z.id === state.currentZoneId);
    const act = zone?.acts.find((a) => a.id === state.currentActId);
    if (!zone || !act) return null;

    const sections = act.sections.slice();
    let gridHeight = act.gridHeight;
    let targetIndex: number;

    if (atIndex !== undefined && atIndex >= 0 && atIndex < sections.length && sections[atIndex] == null) {
      // Fill the specifically-requested empty slot.
      targetIndex = atIndex;
    } else {
      const firstNull = sections.findIndex((s) => s == null);
      if (firstNull >= 0) {
        targetIndex = firstNull;
      } else {
        // Grid is full — append a new row (grid_w null slots). Appending keeps
        // every existing flat index stable; growing grid_w would re-map them all.
        if (act.gridWidth * (gridHeight + 1) > MAX_ACT_SECTIONS) return null; // engine cap
        targetIndex = sections.length;
        for (let i = 0; i < act.gridWidth; i++) sections.push(null);
        gridHeight += 1;
      }
    }

    const newSection: Section = createSection(targetIndex, `Section ${targetIndex}`);
    sections[targetIndex] = newSection;

    const newAct: Act = { ...act, sections, gridHeight };
    const newZone: Zone = { ...zone, acts: zone.acts.map((a) => (a.id === act.id ? newAct : a)) };
    const newProject: S4Project = { ...state.project, zones: state.project.zones.map((z) => (z.id === zone.id ? newZone : z)) };
    set({ project: newProject });
    return targetIndex;
  },
  resizeGrid: (newWidth, newHeight) => {
    const state = get();
    if (!state.project || !state.currentZoneId || !state.currentActId) return false;
    const zone = state.project.zones.find((z) => z.id === state.currentZoneId);
    const act = zone?.acts.find((a) => a.id === state.currentActId);
    if (!zone || !act) return false;
    if (newWidth < 1 || newHeight < 1 || newWidth * newHeight > MAX_ACT_SECTIONS) return false;

    const oldW = act.gridWidth, oldH = act.gridHeight, old = act.sections;
    // Refuse if shrinking would drop a non-null section off a removed edge.
    for (let row = 0; row < oldH; row++) {
      for (let col = 0; col < oldW; col++) {
        if ((col >= newWidth || row >= newHeight) && old[row * oldW + col] != null) return false;
      }
    }
    // Reshape: keep each section's (col,row); only its flat index changes.
    const next: (Section | null)[] = new Array(newWidth * newHeight).fill(null);
    const copyH = Math.min(oldH, newHeight), copyW = Math.min(oldW, newWidth);
    for (let row = 0; row < copyH; row++) {
      for (let col = 0; col < copyW; col++) {
        const sec = old[row * oldW + col];
        if (sec) { const flat = row * newWidth + col; next[flat] = { ...sec, index: flat }; }
      }
    }
    const newAct: Act = { ...act, gridWidth: newWidth, gridHeight: newHeight, sections: next };
    const newZone: Zone = { ...zone, acts: zone.acts.map((a) => (a.id === act.id ? newAct : a)) };
    set({ project: { ...state.project, zones: state.project.zones.map((z) => (z.id === zone.id ? newZone : z)) } });
    return true;
  },
  removeSection: (index) => {
    const state = get();
    if (!state.project || !state.currentZoneId || !state.currentActId) return false;
    const zone = state.project.zones.find((z) => z.id === state.currentZoneId);
    const act = zone?.acts.find((a) => a.id === state.currentActId);
    if (!zone || !act) return false;
    if (index < 0 || index >= act.sections.length || act.sections[index] == null) return false;
    const sections = act.sections.slice();
    sections[index] = null;
    const newAct: Act = { ...act, sections };
    const newZone: Zone = { ...zone, acts: zone.acts.map((a) => (a.id === act.id ? newAct : a)) };
    set({ project: { ...state.project, zones: state.project.zones.map((z) => (z.id === zone.id ? newZone : z)) } });
    return true;
  },
  clearChunks: () => set((state) => {
    if (!state.project) return {};
    return { project: { ...state.project, chunkLibrary: [] } };
  }),
  reset: () => set({ config: null, project: null, currentZoneId: null, currentActId: null, loading: false, error: null, objectSprites: new Map() }),
}));

export function getCurrentZone(state: ProjectState): Zone | null {
  if (!state.project || !state.currentZoneId) return null;
  return state.project.zones.find(z => z.id === state.currentZoneId) ?? null;
}

export function getCurrentAct(state: ProjectState): Act | null {
  const zone = getCurrentZone(state);
  if (!zone || !state.currentActId) return null;
  return zone.acts.find(a => a.id === state.currentActId) ?? null;
}

/**
 * Build the S4Level view used by the undo/redo system. Always includes the
 * zone-level tileset and palette so zone commands (set-palette-line,
 * set-tileset-tiles) can be applied/undone — a level missing those fields
 * makes the history layer throw rather than silently no-op. The current act
 * is included for the same reason (set-bg swaps act.bgLayout/bgTiles).
 */
export function getActiveLevel(state: ProjectState): S4Level | null {
  const zone = getCurrentZone(state);
  const act = getCurrentAct(state);
  if (!zone || !act) return null;
  return {
    sections: act.sections,
    tileset: zone.tileset,
    palette: zone.palette,
    chunkLibrary: state.project?.chunkLibrary,
    act,
  };
}
