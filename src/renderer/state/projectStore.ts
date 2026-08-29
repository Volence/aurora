import { create } from 'zustand';
import type { LoadedS4Config } from '../../core/config/s4-config';
import type { S4Project, Zone, Act, Tileset, Palette, ObjectDef, ChunkDef, BgLibraryEntry } from '../../core/model/s4-types';
import type { S4Level } from '../../core/editing/commands';
import type { CollisionProfileSet } from '../../core/collision/collision-model';
import type { CapabilityManifest } from '../../core/project/adapter';
import type { BgOverrideDocument } from '../../core/formats/bg-override/bg-override';

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
  /**
   * Object id → bound saved-sprite NAME, from the editor-side sidecar
   * (`<dataRoot>sprites/object-bindings.json`). This is the authoritative
   * object→sprite link: `ObjectDef.sprite` comes from the hand-authored
   * objects.json that Aurora never writes, so the sidecar is what any UI
   * binding produces. Published on project open — deliberately NOT gated on a
   * zone/palette the way objectSprites is, because the Explorer's Object
   * Library needs only the NAME and must not stay greyed until a level opens.
   */
  objectBindings: Record<string, string>;
  collisionProfiles: CollisionProfileSet | null;
  capabilities: CapabilityManifest | null;
  legacyAtlasMerged: boolean;

  setConfig: (config: LoadedS4Config) => void;
  setProject: (project: S4Project) => void;
  setCurrentAct: (zoneId: string, actId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setObjectSprites: (sprites: Map<string, ObjectPreview>) => void;
  setObjectBindings: (bindings: Record<string, string>) => void;
  setCollisionProfiles: (profiles: CollisionProfileSet | null) => void;
  /** Atomic full-project commit (aeon open). ONE set so no subscriber ever
   *  observes config-without-project — the gap behind the aeon→aeon session-
   *  restore sliver (stage-3 notes gap #2). */
  openLoaded: (p: {
    config: LoadedS4Config; project: S4Project;
    collisionProfiles: CollisionProfileSet | null;
    capabilities: CapabilityManifest | null; legacyAtlasMerged: boolean;
  }) => void;
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
  objectBindings: {},
  collisionProfiles: null,
  capabilities: null,
  legacyAtlasMerged: false,

  setConfig: (config) => set({ config, error: null }),
  setProject: (project) => set({ project }),
  setCurrentAct: (zoneId, actId) => set({ currentZoneId: zoneId, currentActId: actId, loading: false }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  setObjectSprites: (objectSprites) => set({ objectSprites }),
  setObjectBindings: (objectBindings) => set({ objectBindings }),
  setCollisionProfiles: (collisionProfiles) => set({ collisionProfiles }),
  openLoaded: ({ config, project, collisionProfiles, capabilities, legacyAtlasMerged }) =>
    set({ config, project, collisionProfiles, capabilities, legacyAtlasMerged, loading: false, error: null }),
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
  reset: () => set({ config: null, project: null, currentZoneId: null, currentActId: null, loading: false, error: null, objectSprites: new Map(), objectBindings: {}, collisionProfiles: null, capabilities: null, legacyAtlasMerged: false }),
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
  const level: S4Level = {
    sections: act.sections,
    tileset: zone.tileset,
    palette: zone.palette,
    chunkLibrary: state.project?.chunkLibrary,
    bgLibrary: state.project?.bgLibrary,
    // Same rule as the two above: `set-effects-scene` THROWS on a level without
    // it rather than silently consuming an undo slot, so it is always included.
    effectsScenes: state.project?.effectsScenes,
    // Same rule again — `set-effects-preset` throws on a level without it.
    effectsPresets: state.project?.effectsPresets,
    act,
  };

  // `bgOverride` IS AN ACCESSOR, AND IT HAS TO BE. Every other field above is a
  // reference to an object the project owns, so a command that mutates one
  // (`level.act.bgLayout = …`, `placeEffectsScene(level.effectsScenes, …)`)
  // mutates the project. A BgAnim band command does not mutate — the plan
  // appliers are pure and return a NEW document, and history.ts accordingly
  // writes `level.bgOverride = applyWithBand(…)`.
  //
  // This object is not the project. It is rebuilt from scratch on every gesture
  // and on every undo (BoundEditHistory calls its `getLevel` supplier fresh each
  // time), so a plain data field here would take that assignment, hold it for
  // the length of one call, and be garbage-collected with the band edit still
  // inside it. The document would never reach the store, the panel would never
  // repaint, and the save plan would write the file it loaded — a whole editing
  // surface silently doing nothing, with the node suite unable to see it.
  //
  // So the field READS the project's holder and WRITES BACK INTO IT. The
  // command layer's `level.bgOverride = doc` stays exactly as items 20/23/27
  // landed it; the aliasing that makes it an edit lives here, where the view is
  // built, which is the only place that knows the view is a view.
  const holder = state.project?.bgOverride;
  if (holder) {
    Object.defineProperty(level, 'bgOverride', {
      enumerable: true,
      configurable: true,
      // null (absent/unreadable file) surfaces as `undefined`, so the command's
      // own `if (!level.bgOverride) throw` fires with its own message rather
      // than this layer inventing a second refusal.
      get: () => holder.doc ?? undefined,
      set: (doc: BgOverrideDocument) => { holder.doc = doc; },
    });
  }
  return level;
}
