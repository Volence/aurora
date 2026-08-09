// Classic-project open bridge — the renderer-side glue that turns a chosen
// directory into an opened core ProjectHandle. Kept out of classicProjectStore
// so the store stays a pure state container and tests can substitute a fake
// bridge (see __setClassicBridgeForTest).
//
// See classic-file-access.ts for why open/detect run in the renderer.

import { createIpcFileAccess } from './classic-file-access';
import { openProject, registerAdapter, type ProjectHandle } from '../../core/project/adapter';
import { s1Adapter } from '../../core/project/s1';

// -- Adapter registration (exactly once) ------------------------------------
// The registry lives in core (adapter.ts). registerAdapter throws on a
// duplicate `type`, so a module-level guard makes this idempotent; the try/catch
// additionally tolerates an HMR reload of THIS module that leaves the core
// registry (a different module) already populated.
let adaptersReady = false;
export function ensureAdaptersRegistered(): void {
  if (adaptersReady) return;
  try {
    registerAdapter(s1Adapter);
  } catch {
    // Already registered (HMR / re-entry) — the registry is authoritative.
  }
  adaptersReady = true;
}

export type ClassicOpenResult =
  | { kind: 'opened'; handle: ProjectHandle }
  | { kind: 'not-classic'; aeon: boolean };

export interface ClassicBridge {
  open(dir: string): Promise<ClassicOpenResult>;
}

/** The real bridge: FileAccess over IPC → core openProject in the renderer. */
export const ipcClassicBridge: ClassicBridge = {
  async open(dir: string): Promise<ClassicOpenResult> {
    ensureAdaptersRegistered();
    const fa = createIpcFileAccess(dir);
    const handle = await openProject(fa);
    if (handle) return { kind: 'opened', handle };
    // Not a classic project. Probe the aeon fingerprint (root project.json) so
    // the caller can route aeon dirs to the untouched aeon loader and reserve
    // the "unrecognized project" notice for dirs that are neither.
    const aeon = await fa.exists('project.json');
    return { kind: 'not-classic', aeon };
  },
};
