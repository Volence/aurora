// classicProjectStore — renderer state for an opened classic (disasm) project.
//
// ARCHITECTURE (decision for Task 9): the ProjectHandle lives HERE, in the
// renderer, not in the main process. Aurora's existing aeon project load runs
// entirely in the renderer (useProject.ts imports the core parsers and reads
// files through window.api; main only does raw file IO), so the classic path
// matches that seam: detect/open run in the renderer against a FileAccess that
// bridges per-file over IPC (classic-file-access.ts), and the resulting handle —
// functions and all — is held in this store. Consequences:
//   • No ProjectHandle / LevelDoc serialization across IPC (the alternative
//     "handle in main + narrow IPC calls" design is unnecessary here).
//   • The aeon open path is left 100% untouched; this is a parallel store.
//   • The classic level store reads levels via handle.levels.read() directly, in
//     the renderer (classicLevelStore.openAct) — this store intentionally holds
//     NO level-doc state.
//
// The open ORCHESTRATION lives in classic-bridge.ts (injectable for tests);
// this store is the state container + transitions.

import { create } from 'zustand';
import type {
  ProjectHandle,
  ProjectType,
  CapabilityManifest,
  ZoneActRef,
  SidecarState,
} from '../../core/project/adapter';
import type { ResolutionReport } from '../../core/project/report';
import { ipcClassicBridge, type ClassicBridge } from './classic-bridge';

export type ClassicStatus = 'closed' | 'opening' | 'open';

/**
 * Outcome of openDirectory, so the shell open-menu wiring can route: 'opened'
 * (classic project loaded — this store owns the view), 'not-classic' (hand the
 * dir to the untouched aeon loader), 'error' (a notice was set here).
 */
export type OpenOutcome = 'opened' | 'not-classic' | 'error';

interface ClassicProjectState {
  status: ClassicStatus;
  dir: string | null;
  /** Human label of the opened project (adapter's detect label), for recents. */
  label: string | null;
  type: ProjectType | null;
  capabilities: CapabilityManifest | null;
  report: ResolutionReport | null;
  zoneTree: ZoneActRef[];
  error: string | null;
  /**
   * The opened core handle (renderer-side; non-serializable — holds levels
   * closures + read-state cache). Null until a classic project is open. Later
   * tasks read/write levels through this.
   */
  handle: ProjectHandle | null;
  /** Parsed .aurora/project.json + issues, from the opened handle (null when closed/aeon). */
  sidecar: SidecarState | null;

  openDirectory: (dir: string) => Promise<OpenOutcome>;
  clearError: () => void;
  reset: () => void;
}

// -- Injectable bridge (test seam) ------------------------------------------
let bridge: ClassicBridge = ipcClassicBridge;
export function __setClassicBridgeForTest(b: ClassicBridge): void {
  bridge = b;
}
export function __resetClassicBridgeForTest(): void {
  bridge = ipcClassicBridge;
}

const CLOSED = {
  status: 'closed' as ClassicStatus,
  dir: null,
  label: null,
  type: null,
  capabilities: null,
  report: null,
  zoneTree: [] as ZoneActRef[],
  error: null,
  handle: null,
  sidecar: null,
};

export const useClassicProjectStore = create<ClassicProjectState>((set) => ({
  ...CLOSED,

  openDirectory: async (dir: string): Promise<OpenOutcome> => {
    set({ ...CLOSED, status: 'opening', dir });
    try {
      const res = await bridge.open(dir);
      if (res.kind === 'opened') {
        const h = res.handle;
        set({
          status: 'open',
          dir,
          label: res.label,
          type: h.type,
          capabilities: h.capabilities,
          report: h.report,
          zoneTree: h.levels ? h.levels.list() : [],
          handle: h,
          sidecar: h.sidecar ?? null,
          error: null,
        });
        return 'opened';
      }
      // Not a classic project.
      if (res.aeon) {
        // A real aeon project — clear back to closed and let the untouched aeon
        // loader take over (the shell wiring calls it on 'not-classic').
        set({ ...CLOSED });
        return 'not-classic';
      }
      // Neither classic nor aeon — surface a helpful notice about what each
      // known project type expects, plus the specific aeon-reject reason when a
      // project.json was present but unusable (invalid JSON / wrong engine).
      const msg =
        `"${dir}" is not a recognized project.\n` +
        `• Sonic 1 disassembly expects: sonic.asm + artnem/ + map256/ + levels/\n` +
        `• Aeon project expects: project.json (engine "s4")` +
        (res.detail ? `\n${res.detail}` : '');
      set({ ...CLOSED, error: msg });
      return 'error';
    } catch (e) {
      set({ ...CLOSED, error: e instanceof Error ? e.message : String(e) });
      return 'error';
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({ ...CLOSED }),
}));
