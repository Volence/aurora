// ProjectAdapter — the engine-agnostic seam between Aurora's core and a concrete
// on-disk disassembly project (Sonic 1, aeon, …). An adapter knows how to
// *fingerprint* a project directory (`detect`) and how to *open* it into a
// ProjectHandle exposing only the capabilities it actually supports.
//
// Core stays fs-free: detect/open receive a FileAccess, and the main process
// supplies a real (fs-backed) implementation. Nothing in this module imports
// fs or Electron.
//
// This is Task 4 of the disasm-project abstraction (spec §2.1): the foundational
// interface. Task 5 registers a concrete S1 adapter against it; Task 17 migrates
// aeon behind it. Keep it minimal — no exports beyond what those tasks need.

import type { ResolutionReport } from './report';
import type { SidecarState } from './mapping';
import type { LoadedS4Config } from '../config/s4-config';
import type { S4Project } from '../model/s4-types';
import type { CollisionProfileSet } from '../collision/collision-model';
import type { EffectsSceneLibrary } from '../formats/effects/scene';
import type { BgOverrideState } from '../formats/bg-override/bg-override-io';

/**
 * The narrow file-system view core code is allowed to use. Paths are always
 * project-relative (POSIX-style, forward slashes); the FileAccess implementation
 * owns the project root and any platform path handling.
 */
export interface FileAccess {
  exists(rel: string): Promise<boolean>;
  read(rel: string): Promise<Uint8Array>;
  /** List immediate entry names under a project-relative directory. */
  list(relDir: string): Promise<string[]>;
  /**
   * The file's last-modified time in floating-point milliseconds (fs.stat's
   * `mtimeMs`), or null when it is missing/unknown. OPTIONAL and additive
   * (Task 10, spec §2.6): the fs-backed bridge supplies it so s1-io can capture
   * a read-time mtime per file for the guarded-save conflict check; in-memory
   * test fakes may omit it (capture is then skipped and every save is treated as
   * a fresh write with no expected mtime).
   */
  mtime?(rel: string): Promise<number | null>;
  /**
   * Batch-read many project-relative files in one round-trip, returning each
   * file's bytes and read-time mtime. OPTIONAL and additive: the fs/IPC-backed
   * bridge supplies it so a level read (which fans out ~18 mandatory files) pays
   * one round-trip instead of ~18 sequential ones. When absent (in-memory test
   * fakes), callers fall back to per-file `read` + `mtime`. A missing/unsafe path
   * resolves with `bytes: null` (the caller decides whether that is fatal).
   */
  readMany?(rels: string[]): Promise<Map<string, { bytes: Uint8Array | null; mtime: number | null }>>;
  /** Absolute directory this FileAccess is rooted at, when known. aeon open
   *  records it as config.basePath, which the renderer later uses as the root
   *  for real IPC file IO — a missing rootDir there would make path resolution
   *  (`path.resolve(basePath, relPath)` in file-io.ts / guarded-write.ts) silently
   *  fall back to the main process's cwd, i.e. reads/writes against the WRONG
   *  directory, not a safe failure. Every PRODUCTION FileAccess MUST set it (the
   *  IPC bridge does); in-memory test fakes may omit it only when nothing
   *  downstream performs real IO. */
  rootDir?: string;
}

export type ProjectType = 'aeon' | 's1';

/** The result of a successful fingerprint: enough to offer the project to the user. */
export interface ProjectMatch {
  type: ProjectType;
  label: string;
}

/** Capability keys a profile may grant (spec §7): which level-workspace facets
 *  its levels get. Superset of the facets built so far — parallax/events/preview
 *  are declared now so profiles can be authored against them before those
 *  facets exist (the shell renders registered-facets ∩ granted, so an
 *  unbuilt capability simply renders nothing).
 *
 *  Runtime list backing FacetCapability, exported so zod schemas and facet
 *  registries can enumerate/validate without duplicating the union. Canonical
 *  home of the facet vocabulary (import from here, not core/shell/facets). */
export const FACET_CAPABILITIES = [
  'layout', 'art', 'objects', 'rings', 'collision', 'palette',
  'parallax', 'events', 'preview',
] as const;
export type FacetCapability = (typeof FACET_CAPABILITIES)[number];

/** The ONE editing-tool vocabulary, shared by every engine (spec §3.6).
 *
 *  It lives here beside FACET_CAPABILITIES, not in the renderer's editorStore,
 *  for the same reason the facet vocabulary does: a profile has to be able to
 *  DECLARE which tools its facets offer (see CapabilityManifest.facetTools),
 *  and core cannot import the renderer. The renderer's `EditorTool` is an alias
 *  of this union, so every existing `EditorTool` import keeps working.
 *
 *  Runtime list exported so exhaustiveness checks (label maps, icon maps) can
 *  enumerate the vocabulary without duplicating it. */
// `eraser` was in this list with nothing behind it: no FACET_TOOLS entry, no
// profile's facetTools, and no branch in either engine's canvas — so the only
// thing it could ever do was carry a label, a hint ("Click to erase tiles") and
// a dock icon for a button no facet offered. Deleted rather than implemented:
// stamping classic's air chunk and aeon's blank chunk is how each engine already
// erases, and a vocabulary entry no canvas answers is a promise to the profile
// author that nothing keeps.
export const TOOL_IDS = [
  'view', 'select', 'paint-tile', 'paint-block', 'stamp-chunk',
  'paint-collision', 'place-object', 'place-ring', 'marquee',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/**
 * One rung of a profile's art hierarchy, outermost first. The breadcrumb in the
 * Art facet has exactly one segment per tier, so this list IS the navigable
 * depth — a profile with no middle tier simply declares two rungs.
 */
export interface ArtTier {
  /** Stable id: 'chunk' | 'block' | 'tile' today. Used for behaviour lookups. */
  readonly id: string;
  /** Breadcrumb label. */
  readonly label: string;
  /** Edge length in px of one unit, or null when the tier is variable-size. */
  readonly pixelSize: number | null;
  /**
   * True when placements REFERENCE a unit by id, so editing it changes every
   * placement — which is what makes usage counts, a shared-edit banner and
   * Duplicate meaningful. False when a placement FLATTENS a copy at stamp time
   * (aeon chunks), where those affordances are meaningless and clipboard /
   * save-to-library take their place.
   *
   * NOT named `pooled`: aeon's chunk tier IS a pooled id-addressed library; it
   * is the STAMP that copies. See spec §3.0.2.
   */
  readonly shared: boolean;
}

/**
 * What an opened project can do. Fields are null/false when the capability is
 * absent so callers can feature-gate UI without probing the adapter further.
 */
export interface CapabilityManifest {
  levels: 'chunk-hierarchy' | 'aeon' | null;
  sprites: boolean;
  objects: 'objpos' | 'json' | null;
  /** Aurora never drives the assembler; build is always false for now. */
  build: false;
  /** Which level-workspace facets this project's levels get (spec §4/§7).
   *  The shell renders registered-facets ∩ this list and nothing else. */
  facets: FacetCapability[];
  /** This profile's art hierarchy, outermost tier first (spec §3.3 as amended
   *  by §3.0.2). Optional: absent means the profile declares no ladder yet. */
  artTiers?: readonly ArtTier[];
  /**
   * Which tools this profile's facets offer, for the facets it names. Absent,
   * or absent for a given facet, means the shell's default set applies
   * (renderer `FACET_TOOLS`); `toolsForFacet` is the one reader.
   *
   * REPLACES the default rather than intersecting it. Spec §3.6 says intersect,
   * written before contact with the code: a declaration must be able to NAME a
   * tool the default set lacks, or it can only ever subtract. The example that
   * settled it was classic's layout carrying `place-object`, which the default
   * layout set has no entry for — that declaration is since gone (it made the
   * Objects facet a strict subset of Layout), so today every shipping profile
   * happens to declare a SUBSET and nothing real distinguishes the two rules.
   * The renderer keeps a synthetic guard for it — workspace/__tests__/
   * facet-tools.test.ts, "keeps a declared tool the shell default does NOT have".
   * Replacement also lets a profile ORDER its tools (first entry is the facet
   * default).
   */
  facetTools?: Partial<Record<FacetCapability, readonly ToolId[]>>;
}

/** Sidecar `.aurora/project.json` shape: user path overrides for resolution. */
export interface ProjectOverrides {
  paths?: Record<string, string>;
}

/**
 * The fully-loaded aeon project an aeon adapter open() returns (spec §7:
 * "loading logic moves out of the renderer"). Aeon's level model is all-acts-
 * resident, so the handle carries the whole project rather than a per-act
 * read/write access like classic's `levels`.
 */
export interface AeonProjectData {
  config: LoadedS4Config;
  project: S4Project;
  collisionProfiles: CollisionProfileSet | null;
  /** Human notices produced during load (e.g. atlas unification), for toasts. */
  notices: string[];
  /** True when the legacy chunk-tiles atlas was merged THIS load — gates the
   *  save-time truncation of chunks_tiles.bin (see buildAeonSavePlan). */
  legacyAtlasMerged: boolean;
  /**
   * The effects-scene library this project declares (empyrean
   * AURORA_EFFECTS_SCHEMA.md §2; hazard 2 names its absence here by name — "nothing
   * in `AeonProjectData` names a scene, preset, band or budget").
   *
   * IT IS THE SAME VALUE AS `project.effectsScenes`, not a copy. Two names for one
   * object rather than two objects: the handle-level name is what makes the scene
   * concept legible at the adapter boundary, and the model-level one is what save,
   * the store and the undo history all reach. A copy would be free to drift the
   * moment anything mutated one of them; `aeon-load.test.ts` pins the identity with
   * `toBe`, not `toEqual`.
   *
   * An ABSENT `{dataRoot}editor/effects/` directory yields an empty library and no
   * error — §2 says so in as many words, and today that is the ordinary case, since
   * the directory does not exist in the aeon tree at all.
   */
  scenes: EffectsSceneLibrary;
  /**
   * The BG override document + its file facts (aeon EFFECTS_CONSUMER_CONTRACT.md
   * §1.1), which is where this project's BgAnim BANDS live — the third of the
   * four nouns hazard 2 said `AeonProjectData` named none of.
   *
   * IT IS THE SAME VALUE AS `project.bgOverride`, not a copy, on exactly the
   * rule `scenes` states above: the handle-level name is what makes the concept
   * legible at the adapter boundary, and a copy would be free to drift the
   * moment a band edit replaced one holder's `doc` and not the other's.
   */
  bgOverride: BgOverrideState;
}

export interface ProjectHandle {
  type: ProjectType;
  capabilities: CapabilityManifest;
  report: ResolutionReport;
  levels: ClassicLevelAccess | null;
  /** Parsed `.aurora/project.json` + per-entry diagnostics (spec §7), for the
   *  Project Setup tab. Absent on adapters that read no sidecar (aeon v1). */
  sidecar?: SidecarState;
  /** The loaded aeon project (aeon adapter only; absent on classic handles). */
  aeon?: AeonProjectData;
}

export interface ProjectAdapter {
  readonly type: ProjectType;
  detect(fa: FileAccess): Promise<ProjectMatch | null>;
  open(fa: FileAccess, overrides?: ProjectOverrides): Promise<ProjectHandle>;
}

// ---------------------------------------------------------------------------
// Level access — the classic hierarchical level document lives in
// core/level-classic/model; re-exported here so ClassicLevelAccess signatures
// (and downstream adapter callers) reference it through the project layer.
// ---------------------------------------------------------------------------

export type { LevelDoc } from '../level-classic/model';
import type { LevelDoc } from '../level-classic/model';

export type { SidecarState, ConfigIssue, ProjectConfig } from './mapping';

export interface ZoneActRef {
  zone: string;
  act: number;
  label: string;
  available: boolean;
  reason?: string;
}

export type DirtyDomains = Partial<
  Record<'tiles' | 'blocks' | 'chunks' | 'fg' | 'bg' | 'objects' | 'palette' | 'colind' | 'start', boolean>
>;

export interface WriteResult {
  written: string[];
  skipped: string[];
  errors: { path: string; message: string }[];
  /**
   * The actual buffers to persist, keyed by resolved path (a superset accounting
   * of `written`). Pure-core produces these; Task 10's IPC layer does the real fs
   * writes. This — NOT `written` — is the SOURCE OF TRUTH the renderer save path
   * consumes for bytes; `written` is display metadata only. Optional so
   * non-classic adapters need not supply it.
   */
  files?: { path: string; bytes: Uint8Array }[];
  /**
   * Read-time mtime (fs.stat `mtimeMs`) captured for each written path, for the
   * guarded-save conflict check (Task 10, spec §2.6). A path absent here (or the
   * whole map absent, when the FileAccess had no `mtime`) means "no expected
   * mtime" → the renderer sends `expectedMtimeMs: null` for that file.
   */
  fileMtimes?: Record<string, number>;
}

/**
 * Which tile-pool indices of an act are writable, exposed so the editing store
 * (Task 12) can REJECT a tile edit at edit time rather than letting it fail the
 * s1-io write self-check (spec §2.2 / s1-io write contract). The overlay ranges
 * live in the adapter-side read state (S1ReadState), NOT in the LevelDoc, so this
 * query surfaces them without leaking that bookkeeping into the doc:
 *  • indices in [0, baseTileCount) come from a pristine source art file → writable
 *  • indices >= baseTileCount are gap/appended tiles → NOT writable in v1
 *  • indices inside any `animRanges` span are animated-art overlays → NOT writable
 */
export interface EditableTileRange {
  baseTileCount: number;
  animRanges: { start: number; count: number }[];
}

export interface ClassicLevelAccess {
  list(): ZoneActRef[];
  read(ref: ZoneActRef): Promise<LevelDoc>;
  /**
   * Palette-only read: the act's four composed 16-word CRAM lines, exactly as
   * `read()` would produce in `LevelDoc.palettes`, without touching the other
   * ~18 files of a full level read. For consumers that need zone COLORS but no
   * level — the S1 object-art checkout re-running from a restored session, where
   * no act is loaded and loading one just to seed a sprite palette would drag a
   * whole LevelDoc (and a level tab's worth of state) behind a sprite tab.
   * OPTIONAL — omitted by non-classic adapters and simple test fakes; callers
   * must treat its absence (or a rejection) as "no palette available", not as
   * an error in the thing they were actually loading.
   */
  readPalettes?(ref: ZoneActRef): Promise<Uint16Array[]>;
  write(ref: ZoneActRef, doc: LevelDoc, dirty: DirtyDomains): Promise<WriteResult>;
  /**
   * Refresh the cached read-time mtimes for an act after a successful guarded
   * write (Task 10): the freshly-written files now have new on-disk mtimes, so
   * the NEXT write's conflict check must expect these rather than the original
   * read-time values. OPTIONAL — omitted by non-classic adapters and test fakes.
   */
  updateMtimes?(ref: ZoneActRef, newMtimes: Record<string, number>): void;
  /**
   * The writable tile-pool span for an act (see EditableTileRange). Returns null
   * when the act has not been read yet (no cached read state). OPTIONAL — omitted
   * by non-classic adapters and simple test fakes; when absent the editing store
   * falls back to the pool-size bound only.
   */
  editableTileRange?(ref: ZoneActRef): EditableTileRange | null;
  /**
   * Level-pool tile indices this act's objects draw through mappings rather
   * than blocks — a GHZ platform, an MZ brick, the SYZ boss's blocks, and
   * similar sprites that read `ArtTile_Level` directly (see
   * `s1-levelart-reservations.ts`). `buildUsageIndex` cannot see these: it only
   * walks blocks/chunks, so one of these tiles looks like a free slot to
   * anything that does not also consult this set.
   *
   * Returns null when unknown (the act has not been read yet, or a test fake
   * omits the query) — PERMISSIVE, matching `editableTileRange`'s null
   * convention, not "nothing is reserved".
   *
   * The semantics are load-bearing and easy to get backwards: this is NOT a
   * lock and must NOT be folded into `tileLockReason` / editableTileRange.
   * Painting a reserved tile IN PLACE is a legitimate edit — it is how you
   * repaint a GHZ platform, and the object sprite updates live through
   * `tileEpoch`. The rule this set exists to support is narrower and additive:
   * never CLAIM a reserved slot as a free slot for someone else's divergent
   * copy, and always DIVERGE a shared tile away from a reserved slot instead
   * of repainting it in place when the edit did not target it directly. See
   * `PlanInput.reservedTiles` in `classic-surface-plan.ts` for the enforcement.
   * OPTIONAL — omitted by non-classic adapters (aeon has no such objects) and
   * simple test fakes.
   */
  reservedTiles?(ref: ZoneActRef): ReadonlySet<number> | null;
}

// ---------------------------------------------------------------------------
// Registry — registration order is priority; the first adapter whose detect()
// matches wins. Fingerprints are disjoint by design, so at most one should match
// a given directory; ordering only decides among adapters, never resolves a
// genuine tie.
// ---------------------------------------------------------------------------

const adapters: ProjectAdapter[] = [];

/**
 * Register an adapter. Registration is controlled startup code, so a second
 * adapter claiming an already-registered `type` is always a bug, not a runtime
 * condition to tolerate — we throw rather than silently shadow or duplicate it.
 */
export function registerAdapter(a: ProjectAdapter): void {
  if (adapters.some((x) => x.type === a.type)) {
    throw new Error(`ProjectAdapter for type '${a.type}' is already registered`);
  }
  adapters.push(a);
}

/** Test support: reset the global registry so tests don't leak into each other. */
export function clearAdapters(): void {
  adapters.length = 0;
}

/**
 * Fingerprint a directory against every registered adapter in registration
 * order, returning the first match (or null if none match / registry is empty).
 */
export async function detectProject(fa: FileAccess): Promise<ProjectMatch | null> {
  for (const a of adapters) {
    const match = await a.detect(fa);
    if (match) return match;
  }
  return null;
}

/**
 * Detect and open in one step: fingerprint in registration order, then open the
 * first matching adapter, returning its ProjectHandle (or null if nothing
 * matches). This is the standard entry point for consumers (Task 9's open flow)
 * — `detectProject` remains available for detect-only callers, e.g. an open
 * dialog that wants to name/preview a project before committing to opening it.
 */
export async function openProject(
  fa: FileAccess,
  overrides?: ProjectOverrides,
): Promise<ProjectHandle | null> {
  for (const a of adapters) {
    const match = await a.detect(fa);
    if (match) return a.open(fa, overrides);
  }
  return null;
}
