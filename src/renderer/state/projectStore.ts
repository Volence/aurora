import { create } from 'zustand';
import type { LoadedS4Config } from '../../core/config/s4-config';
import type { S4Project, Zone, Act, Tileset, Palette, ObjectDef, ChunkDef } from '../../core/model/s4-types';

interface ProjectState {
  config: LoadedS4Config | null;
  project: S4Project | null;
  currentZoneId: string | null;
  currentActId: string | null;
  loading: boolean;
  error: string | null;
  objectSprites: Map<string, ImageBitmap>;

  setConfig: (config: LoadedS4Config) => void;
  setProject: (project: S4Project) => void;
  setCurrentAct: (zoneId: string, actId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setObjectSprites: (sprites: Map<string, ImageBitmap>) => void;
  addChunks: (chunks: ChunkDef[], tiles?: import('../../core/model/s4-types').Tile[]) => void;
  clearChunks: () => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
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
  addChunks: (chunks, tiles) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        chunkLibrary: [...state.project.chunkLibrary, ...chunks],
        chunkTiles: tiles ?? state.project.chunkTiles,
      },
    };
  }),
  clearChunks: () => set((state) => {
    if (!state.project) return {};
    return { project: { ...state.project, chunkLibrary: [], chunkTiles: [] } };
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
