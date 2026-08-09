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
}

export interface ClassicLevelAccess {
  list(): ZoneActRef[];
  read(ref: ZoneActRef): Promise<LevelDoc>;
  write(ref: ZoneActRef, doc: LevelDoc, dirty: DirtyDomains): Promise<WriteResult>;
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
