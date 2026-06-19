import { create } from 'zustand';
import type { LoadedS4Config } from '../../core/config/s4-config';
import type { S4Project, Zone, Act, Tileset, Palette, ObjectDef, ChunkDef, BgLibraryEntry } from '../../core/model/s4-types';
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
