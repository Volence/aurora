// src/renderer/shell/session-lifecycle.ts
// Two App-level effects gluing the session model to the stores:
//
// useSessionLifecycle — persists the tab session under the current project's
// key on every change, and on project switch saves nothing extra (continuous
// save already covered it), loads the new project's stored session (pruned to
// tabs that still exist), or builds the default (Home + first level, focused),
// then re-points the singleton editor at the restored active level tab.
// The projectKey is the exact directory string the project was opened with
// (classic dir / aeon config.basePath) — no normalization happens here, so
// every caller that derives a session key must key on that same string.
//
// useActTabSync — some act switches do NOT come from the tab strip, and these
// subscriptions reflect those back into an open+focused tab so the strip never
// lies about what the editor shows. They call sessionStore.open directly (NOT
// requestOpenTab): the act is already loaded, so the activation guard would be
// a no-op self-recursion.
//
// STILL LOAD-BEARING — do not delete as scaffolding. The example this used to
// name (the legacy Toolbar's zone/act selectors) is gone, but three real callers
// switch acts behind the strip's back:
//   • agent/agent-handler.ts — the MCP/agent surface opens acts directly;
//   • renderer/debug-hooks.ts — __dbg.openAct, which the CDP harnesses drive;
//   • state/aeon-open.ts — the loader's own first-act pick, which the restore
//     effect below (see the projectKey comment) explicitly depends on running
//     first.
// Remove this and agent-driven act switching silently stops updating the tabs.

import { useEffect, useRef } from 'react';
import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import { resetProjectRuntime } from '../state/project-runtime';
import { loadStoredSession, saveStoredSession, loadStoredWorkspace, defaultProjectSession } from './session-storage';
import { classicLevelTab, aeonLevelTab, parseSpriteDocTabId, isCanvasDocTabId, PROJECT_SETUP_TAB } from './tabs';
import { activateLevelTarget, activateSpriteDocTarget, activateRestoredCanvasDocTarget } from './tab-activation';
import type { TabDescriptor } from '../../core/shell/session';

function projectLevelTabs(): TabDescriptor[] {
  const classic = useClassicProjectStore.getState();
  if (classic.status === 'open') return classic.zoneTree.map(classicLevelTab);
  const config = useProjectStore.getState().config;
  if (config) {
    return config.zones.flatMap((z) => z.acts.map((a) => aeonLevelTab(z.id, z.name, a.id)));
  }
  return [];
}

function firstOpenableLevelTab(): TabDescriptor | null {
  const classic = useClassicProjectStore.getState();
  if (classic.status === 'open') {
    const ref = classic.zoneTree.find((r) => r.available);
    return ref ? classicLevelTab(ref) : null;
  }
  return projectLevelTabs()[0] ?? null;
}

/**
 * Which restored tabs survive `pruneSession` — EXPORTED so the rule can be
 * tested, because the effect it lives in cannot be (the node suite renders no
 * React), and because deleting any one of its branches leaves a suite that only
 * notices the next time someone restarts the app with that kind of tab open.
 *
 * `enumerated` is the set of ids the open project can list outright (the
 * project-setup tab and every level tab). The two doc kinds are predicates
 * instead because neither is enumerable from the project model: an aeon sprite
 * is a named library entry, an s1 sprite is a per-object checkout, and a canvas
 * is a file the user may have created seconds ago.
 */
export function restoredTabIsValid(
  id: string,
  ctx: { enumerated: ReadonlySet<string>; classicOpen: boolean; aeonOpen: boolean },
): boolean {
  if (ctx.enumerated.has(id)) return true;
  // CANVAS TABS SURVIVE A RESTART (R17(1), decided in Task 13). Gated on ANY
  // project being open, because unlike a sprite a canvas has no engine: the same
  // canvas is equally valid in a classic or an aeon project, and all it needs is
  // a project root to resolve `.aurora/canvas/<name>.png` against.
  //
  // WHY RESTORE THEM AT ALL, given that a deleted PNG then fails to load at
  // every boot: the failure REPORT was the problem, not the restore. A canvas is
  // a document the artist was working in, and dropping its tab on every restart
  // is an editor forgetting your open files — worse here than for a level tab,
  // since a level is two clicks away in the Explorer. The deleted-file case is
  // handled by reporting in the PANE rather than in a boot toast (see
  // activateRestoredCanvasDocTarget).
  if (isCanvasDocTabId(id)) return ctx.classicOpen || ctx.aeonOpen;
  const sd = parseSpriteDocTabId(id);
  return sd !== null && ((sd.engine === 'aeon' && ctx.aeonOpen) || (sd.engine === 's1' && ctx.classicOpen));
}

export function useSessionLifecycle(): void {
  const classicDir = useClassicProjectStore((s) => (s.status === 'open' ? s.dir : null));
  // The aeon key gates on the PROJECT being resident, not just the config:
  // openAeonProject (state/aeon-open.ts) commits config+project atomically via
  // projectStore.openLoaded, so there is no config-without-project gap for the
  // key to observe mid-open. Immediately after that atomic commit (no await in
  // between), the loader still does its own first-act selection
  // (setCurrentAct(zone[0].acts[0])), so the restore effect below — which only
  // fires once the key changes — always runs AFTER that default-act pick. The
  // transient first-act tab the loader opened is healed by the restore's
  // replace+prune, converging on the stored session (or the default, if none).
  const aeonBase = useProjectStore((s) => (s.project !== null ? s.config?.basePath ?? null : null));
  const projectKey = classicDir ?? aeonBase;
  // undefined = "no project key adopted yet" — the save subscription stays
  // quiet until the first restore has run, so a default session can never
  // clobber a stored one during boot.
  const keyRef = useRef<string | null | undefined>(undefined);

  // Persist BOTH the tab session and the per-tab workspace record (facet +
  // viewport) under the current key, on any change to either store. Stays quiet
  // until the first restore has adopted a key (keyRef.current === undefined), so
  // a default/empty state can't clobber a stored one during boot.
  useEffect(() => {
    const persist = (): void => {
      if (keyRef.current === undefined) return;
      const { tabs, activeId } = useSessionStore.getState();
      saveStoredSession(
        localStorage, keyRef.current, { tabs, activeId },
        useWorkspaceStore.getState().record);
    };
    const unsubSession = useSessionStore.subscribe(persist);
    const unsubWorkspace = useWorkspaceStore.subscribe(persist);
    return () => { unsubSession(); unsubWorkspace(); };
  }, []);

  useEffect(() => {
    if (keyRef.current === projectKey) return;
    const isProjectSwitch = keyRef.current !== undefined;
    keyRef.current = projectKey;
    if (isProjectSwitch) resetProjectRuntime();

    const validIds = new Set<string>([
      PROJECT_SETUP_TAB.id,
      ...projectLevelTabs().map((t) => t.id),
    ]);
    // Sprite-doc and canvas-doc tabs aren't enumerable, so they are accepted by
    // predicate — the rule, and its reasoning, live in `restoredTabIsValid`
    // above. Content is NOT loaded here: activation runs only for the tab that
    // ends up focused (below).
    const ctx = { enumerated: validIds, classicOpen: classicDir !== null, aeonOpen: aeonBase !== null };
    const isValid = (t: TabDescriptor): boolean => restoredTabIsValid(t.id, ctx);
    // Read BOTH stored payloads BEFORE mutating any store below. replace() and
    // seed() fire the persist subscriptions SYNCHRONOUSLY (zustand), and persist
    // serializes whatever the stores CURRENTLY hold — a not-yet-seeded (empty)
    // workspace record serializes WITHOUT the `workspace` field, which strips the
    // stored workspace from localStorage. Capturing both reads up front makes
    // those interleaved writes harmless (they re-persist values we already hold;
    // the final seed write is correct). seed() also subsumes any per-switch reset:
    // it replaces the WHOLE record, so a new project with nothing stored gets {}.
    const stored = loadStoredSession(localStorage, projectKey, isValid);
    const storedWorkspace = loadStoredWorkspace(localStorage, projectKey);
    const next =
      stored ?? (projectKey !== null ? defaultProjectSession(firstOpenableLevelTab()) : undefined) ??
      { tabs: useSessionStore.getState().tabs.slice(0, 1), activeId: 'home' };
    useSessionStore.getState().replace(next);
    // ORDER: seed the workspace record BEFORE the activation dispatch below. The
    // aeon-switch activation path reads viewFor(activeId) to restore the seeded
    // viewport, so the seed must land first or the restore sees an empty record.
    useWorkspaceStore.getState().seed(storedWorkspace);
    if (parseSpriteDocTabId(next.activeId)) void activateSpriteDocTarget(next.activeId);
    // Only the ACTIVE tab's canvas is read, exactly as the sprite and level
    // branches do: the others load on their first focus. That also keeps
    // reportCanvasWarnings' stated ceiling of "3 toasts per load" true — N
    // canvases loaded at once would have made it 3N.
    else if (isCanvasDocTabId(next.activeId)) void activateRestoredCanvasDocTarget(next.activeId);
    // skipViewSnapshot: this is a restore, not a user switch — the "outgoing" act
    // is the loader default with viewStore at its fresh default, so snapshotting
    // would clobber that act's just-seeded viewport. The restore branch still
    // applies the target act's seeded view.
    else if (next.activeId.startsWith('level:')) void activateLevelTarget(next.activeId, { skipViewSnapshot: true });
  }, [projectKey]);
}

export function useActTabSync(): void {
  useEffect(() => {
    return useClassicLevelStore.subscribe((s, prev) => {
      if (s.ref && s.ref !== prev.ref) {
        useSessionStore.getState().open(classicLevelTab(s.ref));
      }
    });
  }, []);
  useEffect(() => {
    return useProjectStore.subscribe((s, prev) => {
      if (!s.currentZoneId || !s.currentActId) return;
      if (s.currentZoneId === prev.currentZoneId && s.currentActId === prev.currentActId) return;
      const zone = s.config?.zones.find((z) => z.id === s.currentZoneId);
      if (zone) useSessionStore.getState().open(aeonLevelTab(zone.id, zone.name, s.currentActId));
    });
  }, []);
}
