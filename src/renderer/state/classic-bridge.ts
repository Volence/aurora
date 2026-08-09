// Classic-project open bridge — the renderer-side glue that turns a chosen
// directory into an opened core ProjectHandle. Kept out of classicProjectStore
// so the store stays a pure state container and tests can substitute a fake
// bridge (see __setClassicBridgeForTest).
//
// See classic-file-access.ts for why open/detect run in the renderer.

import { createIpcFileAccess } from './classic-file-access';
import { detectProject, openProject, registerAdapter, type ProjectHandle } from '../../core/project/adapter';
import { s1Adapter } from '../../core/project/s1';
import { aeonAdapter, explainAeonReject } from '../../core/project/aeon';

// -- Adapter registration (exactly once) ------------------------------------
// The registry lives in core (adapter.ts). registerAdapter throws on a
// duplicate `type`, so a module-level guard makes this idempotent; the try/catch
// additionally tolerates an HMR reload of THIS module that leaves the core
// registry (a different module) already populated.
//
// Registration order is priority, but s1's and aeon's fingerprints are DISJOINT
// (s1 keys on sonic.asm + data dirs and never reads project.json; aeon keys on a
// project.json with engine:"s4" and has no sonic.asm), so the order can never
// resolve a genuine tie — it is chosen s1-then-aeon only to mirror the original
// classic-first probe. Registering aeon is what lets the old ad-hoc
// `fa.exists('project.json')` aeon probe below collapse into a single
// detectProject call (Task 17, spec §2.7).
let adaptersReady = false;
export function ensureAdaptersRegistered(): void {
  if (adaptersReady) return;
  // Register each independently: an HMR reload can leave the core registry with
  // one adapter already present, and a single shared try/catch would let that
  // adapter's duplicate-throw skip the others. A per-adapter catch keeps them
  // independent — the registry is authoritative and end state is both present.
  for (const a of [s1Adapter, aeonAdapter]) {
    try {
      registerAdapter(a);
    } catch {
      // Already registered (HMR / re-entry).
    }
  }
  adaptersReady = true;
}

export type ClassicOpenResult =
  | { kind: 'opened'; handle: ProjectHandle; label: string }
  // `detail` (only when aeon:false) carries the reason a project.json-bearing dir
  // was rejected as aeon, so the unrecognized-project notice can surface it.
  | { kind: 'not-classic'; aeon: boolean; detail?: string };

export interface ClassicBridge {
  open(dir: string): Promise<ClassicOpenResult>;
}

/** The real bridge: FileAccess over IPC → core openProject in the renderer. */
export const ipcClassicBridge: ClassicBridge = {
  async open(dir: string): Promise<ClassicOpenResult> {
    ensureAdaptersRegistered();
    const fa = createIpcFileAccess(dir);
    // A single registry fingerprint decides the route (Task 17, spec §2.7):
    //  • a classic adapter (s1) → open into a ProjectHandle this store owns;
    //  • an aeon match → NOT opened here — reported as not-classic so the caller
    //    runs the untouched renderer aeon loader (useProject.loadFromPath),
    //    exactly as before. This replaces the old ad-hoc
    //    `fa.exists('project.json')` probe: it stays 'not-classic aeon:true' for a
    //    real aeon project (engine:"s4" → loadFromPath opens/errors identically),
    //    while a non-aurora or malformed project.json no longer misroutes into the
    //    aeon loader — it falls through to the unrecognized-project notice.
    const match = await detectProject(fa);
    if (match && match.type !== 'aeon') {
      const handle = await openProject(fa);
      if (handle) return { kind: 'opened', handle, label: match.label };
    }
    if (match?.type === 'aeon') return { kind: 'not-classic', aeon: true };
    // Neither classic nor aeon: if a project.json is present but was rejected,
    // explain why so the notice doesn't hide the reason (invalid JSON / wrong engine).
    const detail = await explainAeonReject(fa);
    return { kind: 'not-classic', aeon: false, ...(detail ? { detail } : {}) };
  },
};
