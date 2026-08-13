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
// useActTabSync — the legacy Toolbar's zone/act selectors switch acts without
// touching the session; these subscriptions reflect any act switch back into
// an open+focused tab so the strip never lies about what the editor shows.
// They call sessionStore.open directly (NOT requestOpenTab): the act is
// already loaded, so the activation guard would be a no-op self-recursion.

import { useEffect, useRef } from 'react';
import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import { resetProjectRuntime } from '../state/project-runtime';
import { loadStoredSession, saveStoredSession, loadStoredWorkspace, defaultProjectSession } from './session-storage';
import { classicLevelTab, aeonLevelTab, parseSpriteDocTabId, PROJECT_SETUP_TAB } from './tabs';
import { activateLevelTarget, activateSpriteDocTarget } from './tab-activation';
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

export function useSessionLifecycle(): void {
  const classicDir = useClassicProjectStore((s) => (s.status === 'open' ? s.dir : null));
  // The aeon key gates on the PROJECT being resident, not just the config:
  // useProject.loadFromPath commits setConfig FIRST, then awaits
  // addRecentProject (React can flush renders/effects in that gap), then
  // setProject, then unconditionally setCurrentAct(zones[0].acts[0]). Keyed on
  // config alone, the restore would run inside that gap — project still null,
  // so currentEngine() is null and activateLevelTarget plans 'none' — and the
  // loader's first-act setCurrentAct would then open/focus the first-act tab
  // over the restored activeId (and the save subscription would persist it,
  // converging the stored session to first-act on every reopen). Keyed on
  // project-resident, the restore runs AFTER the loader's default-act
  // selection; the transient first-act tab that selection opened under the
  // previous key is healed by the restore's replace+prune.
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
    // Sprite-doc tabs aren't enumerable (aeon sprites are named library entries;
    // s1 checkouts are per-object), so accept them by predicate: a sprite-doc id
    // survives the prune when its engine matches the open project kind. Content
    // is NOT loaded here — activation runs only when the tab is focused (below).
    const classicOpen = classicDir !== null;
    const aeonOpen = aeonBase !== null;
    const isValid = (t: TabDescriptor): boolean => {
      if (validIds.has(t.id)) return true;
      const sd = parseSpriteDocTabId(t.id);
      return sd !== null && ((sd.engine === 'aeon' && aeonOpen) || (sd.engine === 's1' && classicOpen));
    };
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
