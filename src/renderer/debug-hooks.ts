// Dev-only debug hooks for the automated crash/perf harnesses.
//
// Installs `window.__dbg` ONLY when the renderer is built/run with
// VITE_AURORA_DEBUG=1 (see scratchpad/crash-investigation/launch.sh). It is a thin
// façade over the classic project/level/object-art stores so a headless CDP driver
// can open a project, load acts, and read load/paint state without reaching into
// the bundled zustand internals. Tree-shaken out of any build where the flag is
// unset — never present in a normal `npm run dev` / production bundle.
//
// This is investigation infrastructure, not product code: it holds no state of its
// own and only calls existing store methods.

import { useClassicProjectStore } from './state/classicProjectStore';
import { useClassicLevelStore } from './state/classicLevelStore';
import { useClassicObjectArtStore } from './state/classicObjectArtStore';

interface DebugApi {
  openDir(dir: string): Promise<string>;
  projStatus(): { status: string; zones: number };
  openAct(zone: string, act: number): Promise<void>;
  levelState(): { status: string; zone: string | null; act: number | null };
  artState(): { version: number; sprites: number };
  /**
   * Stub for the richer read/mtime instrumentation the investigation harness once
   * carried. The load/paint numbers the harnesses actually assert on come from
   * levelState()/artState() and a self-installed setTransform draw counter, so
   * these fields are reported as empty/zero here (kept for shape compatibility).
   */
  perf(): { marks: unknown[]; readCount: number; readTotalMs: number; mtimeCount: number; mtimeTotalMs: number };
}

export function installDebugHooks(): void {
  const dbg: DebugApi = {
    openDir: (dir) => useClassicProjectStore.getState().openDirectory(dir),
    projStatus: () => {
      const s = useClassicProjectStore.getState();
      return { status: s.status, zones: s.zoneTree.length };
    },
    openAct: async (zone, act) => {
      const tree = useClassicProjectStore.getState().zoneTree;
      const ref = tree.find((r) => r.zone === zone && r.act === act);
      if (!ref) throw new Error(`no act ${zone}${act} in zone tree`);
      await useClassicLevelStore.getState().openAct(ref);
    },
    levelState: () => {
      const s = useClassicLevelStore.getState();
      return { status: s.status, zone: s.ref?.zone ?? null, act: s.ref?.act ?? null };
    },
    artState: () => {
      const s = useClassicObjectArtStore.getState();
      return { version: s.version, sprites: s.sprites.size };
    },
    perf: () => ({ marks: [], readCount: 0, readTotalMs: 0, mtimeCount: 0, mtimeTotalMs: 0 }),
  };
  (window as unknown as { __dbg: DebugApi }).__dbg = dbg;
}
