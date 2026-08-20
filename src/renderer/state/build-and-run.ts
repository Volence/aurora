/**
 * Build & Run routing — THE one place that decides which project a build runs
 * against.
 *
 * The UI (Ctrl+Shift+B / the app-bar action), the agent surface
 * (`build_and_run`) and the debug hooks all call this, deliberately: the
 * classic gate used to live twice (App.tsx's toast and agent-handler's throw),
 * and two dispatch sites is how one of them rots. Routing:
 *
 *   - classic project open  → save the classic project, then build its dir
 *     with the sidecar config (`.aurora/project.json`, which carries
 *     buildCommand/romPath/symbolsPath — seeded at open) as the raw record;
 *   - aeon project open     → save all dirty editor docs, then build from
 *     project.json exactly as before;
 *   - neither               → 'none'; the caller says so in its own voice.
 *
 * SAVE BEFORE BUILDING, always, on both routes. The build reads editor files
 * off disk, so building without saving assembles the previous state and hands
 * back a ROM that does not contain the change being tested — the single most
 * confusing outcome this feature could produce. And a FAILED save must not
 * fall through to the build, for exactly the same reason.
 */

import { useProjectStore } from './projectStore';
import { useClassicProjectStore } from './classicProjectStore';
import { useAetherStore } from './aetherStore';
import { useToastStore } from './toastStore';
import { saveAllDirty } from './project-runtime';

export type BuildRoute = 'aeon' | 'classic' | 'none';

export interface BuildRouteResult {
  route: BuildRoute;
  /** False when the pre-build save failed and the build was refused. */
  ran: boolean;
}

export async function startBuildAndRun(): Promise<BuildRouteResult> {
  const classic = useClassicProjectStore.getState();
  if (classic.status === 'open' && classic.dir) {
    // Timed separately: the save writes every dirty editor file and is a real
    // candidate for the loop's wall time, but it is the renderer's half and
    // the main process cannot see it.
    const tSave = performance.now();
    const { saveClassicProject } = await import('./classic-save');
    const saveResult = await saveClassicProject();
    if (saveResult.kind !== 'saved' && saveResult.kind !== 'nothing') {
      // The save already toasted its failure; building now would assemble the
      // PREVIOUS state under a green "Build succeeded".
      return { route: 'classic', ran: false };
    }
    const saveMs = performance.now() - tSave;
    await useAetherStore.getState().build(
      classic.dir,
      (classic.sidecar?.config ?? {}) as Record<string, unknown>,
      saveMs,
      'classic',
    );
    return { route: 'classic', ran: true };
  }

  const cfg = useProjectStore.getState().config;
  if (!cfg) return { route: 'none', ran: false };
  const tSave = performance.now();
  await saveAllDirty();
  const saveMs = performance.now() - tSave;
  await useAetherStore.getState().build(
    cfg.basePath, cfg.raw as unknown as Record<string, unknown>, saveMs, 'aeon',
  );
  return { route: 'aeon', ran: true };
}

/**
 * The UI wrapper: route, then report in toasts — success or failure, plus the
 * no-project case in its own words. Kept apart from `startBuildAndRun` so the
 * agent surface can reuse the routing without inheriting UI side effects.
 */
export async function startBuildAndRunWithToasts(): Promise<void> {
  const r = await startBuildAndRun();
  if (r.route === 'none') {
    useToastStore.getState().addToast(
      'Build & Run needs a project open — aeon or a classic disassembly', 'info');
    return;
  }
  if (!r.ran) return;                       // the save already said why
  const st = useAetherStore.getState();
  // Emit the phase split to the LAUNCH TERMINAL via the existing perf channel,
  // so the split can be read off a log without transcribing a fading toast.
  window.api.perfLog?.(`[build] ${st.buildSummary ?? ''}`);
  if (st.buildSummary) {
    useToastStore.getState().addToast(st.buildSummary, st.buildState === 'failed' ? 'error' : 'success');
  }
}
