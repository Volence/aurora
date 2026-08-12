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
import type { FacetCapability } from '../shell/facets';

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
}

export type ProjectType = 'aeon' | 's1';

/** The result of a successful fingerprint: enough to offer the project to the user. */
export interface ProjectMatch {
  type: ProjectType;
  label: string;
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
}

/** Sidecar `.aurora/project.json` shape: user path overrides for resolution. */
export interface ProjectOverrides {
  paths?: Record<string, string>;
}

export interface ProjectHandle {
  type: ProjectType;
  capabilities: CapabilityManifest;
  report: ResolutionReport;
  levels: ClassicLevelAccess | null;
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

export type { FacetCapability } from '../shell/facets';

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
