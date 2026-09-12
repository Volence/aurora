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
import {
  seedClassicBuildConfig,
  serializeProjectConfig,
  sidecarMayBeOverwritten,
  sidecarRefusalMessage,
} from '../../core/project/mapping';
import { useToastStore } from './toastStore';
import { ipcClassicBridge, type ClassicBridge } from './classic-bridge';
// classicLevelStore.ts imports useClassicProjectStore back from this module —
// an intentional lazy (function-body-only) circular reference: both stores
// only reach into each other inside action bodies (openDirectory below,
// openAct/editableTileRange over there), never at module-eval time, so the
// cycle resolves fine regardless of which module's top level runs first.
import { useClassicLevelStore } from './classicLevelStore';

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

export const useClassicProjectStore = create<ClassicProjectState>((set, get) => ({
  ...CLOSED,

  openDirectory: async (dir: string): Promise<OpenOutcome> => {
    // A FAILED OPEN LEAVES A RESIDENT PROJECT OPEN (CLASSIC-FAILED-OPEN-CLOSES-
    // PROJECT), which is what the aeon loader has always done: its setLoading /
    // setError leave `config` and `project` in place. This used to begin with
    // `set({ ...CLOSED, status: 'opening', dir })` whatever was open, so a typo
    // in Home's path box closed the Sonic 1 project before the bridge was even
    // asked, flipped the session key (resetProjectRuntime), and, with an aeon
    // project left underneath from earlier, surfaced THAT one instead.
    //
    // So nothing resident is touched until the outcome is known. Only a cold
    // open (nothing classic resident) passes through 'opening'.
    const resident = get().status === 'open';
    if (resident) {
      set({ error: null });
    } else {
      set({ ...CLOSED, status: 'opening', dir });
      useClassicLevelStore.getState().reset();
    }
    // The failure answer for both kinds of start: a resident project keeps
    // everything and gains the error; a cold open goes back to CLOSED with it.
    const fail = (error: string): OpenOutcome => {
      set(resident ? { error } : { ...CLOSED, error });
      return 'error';
    };
    try {
      const res = await bridge.open(dir);
      if (res.kind === 'opened') {
        const h = res.handle;
        // SEED THE BUILD FIELDS into the sidecar, once, so Build & Run runs a
        // channel the owner can see and edit (`.aurora/project.json` —
        // buildCommand/romPath/symbolsPath). Fill-only: declared values are
        // never overwritten, and an already-seeded project writes nothing. A
        // failed write is non-fatal — the build planner carries the same
        // values as defaults — but the seeded config still feeds this session
        // so the plan and the file cannot disagree.
        //
        // `sidecarMayBeOverwritten` is not decoration. This write runs at OPEN,
        // with no gesture behind it and before any UI renders, over a file the
        // user writes by hand. `sidecar &&` was never the guard it looked like:
        // an unreadable sidecar arrives here as a truthy object carrying
        // `issues` and an EMPTY config, seedClassicBuildConfig fills all three
        // keys, and the user's overrides are replaced by a 3-key document. A
        // trailing comma in their JSON was enough. Aurora has not read this
        // file, so it does not know what it would be destroying, so it does not
        // write — the canvas path's rule (canvas-save.ts:72), reached here
        // through the project sidecar's own door.
        let sidecar = h.sidecar ?? null;
        if (sidecar && !sidecarMayBeOverwritten(sidecar)) {
          // TOLD, not merely spared. `sidecar.issues` renders only on the
          // Project Setup tab, which the person opening a project need never
          // visit; refusing in silence would leave them with a file they think
          // is live and a Build & Run quietly running planner defaults.
          useToastStore.getState().addToast(
            sidecarRefusalMessage('the Build & Run settings'),
            'error',
          );
        } else if (sidecar && bridge.writeSidecar) {
          const seeded = seedClassicBuildConfig(sidecar.config);
          if (seeded.changed) {
            sidecar = { ...sidecar, config: seeded.config };
            try {
              await bridge.writeSidecar(dir, serializeProjectConfig(seeded.config));
            } catch { /* planner defaults cover it; the setup tab shows the sidecar state */ }
          }
        }
        // The switch commits HERE, so the previous project's loaded doc goes
        // here: a surviving doc would hold a handle into the project being left.
        // (It used to go at the top, which is also what made a failed open drop
        // the act of a project that stayed.) Before the set, so no subscriber
        // sees the new project over the old doc.
        useClassicLevelStore.getState().reset();
        set({
          status: 'open',
          dir,
          label: res.label,
          type: h.type,
          capabilities: h.capabilities,
          report: h.report,
          zoneTree: h.levels ? h.levels.list() : [],
          handle: h,
          sidecar,
          error: null,
        });
        return 'opened';
      }
      // Not a classic project.
      if (res.aeon) {
        // A real aeon project: hand it to the aeon loader (the shell wiring
        // calls it on 'not-classic'). A resident classic project is NOT closed
        // here: the aeon load can still fail, and openAeonProject closes it
        // itself once the aeon project is loaded (aeon-open.ts,
        // closeResidentClassicProject). A cold open just leaves 'opening'.
        if (!resident) set({ ...CLOSED });
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
      return fail(msg);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({ ...CLOSED }),
}));
