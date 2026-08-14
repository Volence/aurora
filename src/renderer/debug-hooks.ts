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
import { useProjectStore } from './state/projectStore';
import { useViewStore } from './state/viewStore';
import { activateLevelTarget } from './shell/tab-activation';
import { levelDocId } from './shell/tabs';

interface DebugApi {
  openDir(dir: string): Promise<string>;
  projStatus(): { status: string; zones: number };
  openAct(zone: string, act: number): Promise<void>;
  levelState(): { status: string; zone: string | null; act: number | null };
  artState(): { version: number; sprites: number };
  /**
   * The shared camera. Classic's viewport keeps its own `camRef` as the hot path
   * and publishes here once per painted frame, so `view()` is how a harness sees
   * that publish, and `setView()` is how it drives the adopt-subscription — the
   * two halves of the camera seam, neither of which the node suite can reach.
   */
  view(): { x: number; y: number; zoom: number };
  setView(x: number, y: number, zoom: number): void;
  /**
   * Open an act the way the UI does — through the tab activation guard, which is
   * what carries the per-tab viewport snapshot/restore. `openAct` above goes
   * straight to the store and bypasses all of it, so a harness testing restore
   * must use this one.
   */
  activate(zone: string, act: number): Promise<boolean>;
  /**
   * Put the classic level store back to IDLE while leaving the level TAB open —
   * the "a level tab is focused but no act is loaded" state. A cold open cannot
   * be photographed in it (session-lifecycle restores an act immediately, and the
   * load beats any CDP round-trip), so a screenshot harness has no other way in
   * and the facets' empty renders had never been looked at.
   */
  resetLevel(): void;
  /**
   * aeon's counterpart to resetLevel: point the project at NO act while leaving
   * the level tab open, which is what makes `useActLoaded` false for aeon
   * (workspace/level-presence.ts reads getCurrentAct).
   *
   * IT EXISTS BECAUSE THE OLD ROUTE IN WAS A BUG. Harnesses used to reach this
   * state with `activate(zone, '__none__')`, which worked only because the aeon
   * activation path never checked that the act resolved — it opened a TAB for
   * the phantom id too, so the screenshots came with a spurious tab in the
   * strip. That hole is now closed (shell/tab-activation.ts), and closing it
   * would otherwise have made aeon's no-act screen unphotographable.
   */
  resetAct(): void;
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
    view: () => {
      const v = useViewStore.getState();
      return { x: v.vpX, y: v.vpY, zoom: v.zoom };
    },
    setView: (x, y, zoom) => useViewStore.getState().setViewport(x, y, zoom),
    activate: (zone, act) => activateLevelTarget(levelDocId(zone, String(act))),
    resetLevel: () => useClassicLevelStore.getState().reset(),
    // setState rather than setCurrentAct: the store action takes an act id, and
    // "no act" is exactly the value it has no way to express.
    resetAct: () => useProjectStore.setState({ currentActId: null }),
    perf: () => ({ marks: [], readCount: 0, readTotalMs: 0, mtimeCount: 0, mtimeTotalMs: 0 }),
  };
  (window as unknown as { __dbg: DebugApi }).__dbg = dbg;
}
