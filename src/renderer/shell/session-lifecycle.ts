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
import { resetProjectRuntime } from '../state/project-runtime';
import { loadStoredSession, saveStoredSession, defaultProjectSession } from './session-storage';
import { classicLevelTab, aeonLevelTab, PROJECT_SETUP_TAB } from './tabs';
import { activateLevelTarget } from './tab-activation';
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
  const aeonBase = useProjectStore((s) => s.config?.basePath ?? null);
  const projectKey = classicDir ?? aeonBase;
  // undefined = "no project key adopted yet" — the save subscription stays
  // quiet until the first restore has run, so a default session can never
  // clobber a stored one during boot.
  const keyRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    return useSessionStore.subscribe((s) => {
      if (keyRef.current === undefined) return;
      saveStoredSession(localStorage, keyRef.current, { tabs: s.tabs, activeId: s.activeId });
    });
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
    const stored = loadStoredSession(localStorage, projectKey, (t) => validIds.has(t.id));
    const next =
      stored ?? (projectKey !== null ? defaultProjectSession(firstOpenableLevelTab()) : undefined) ??
      { tabs: useSessionStore.getState().tabs.slice(0, 1), activeId: 'home' };
    useSessionStore.getState().replace(next);
    if (next.activeId.startsWith('level:')) void activateLevelTarget(next.activeId);
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
