// src/renderer/shell/WindowTitle.tsx
// Keeps `document.title` (the window title) in step with the project, the active
// tab and whether any open document is unsaved. The string is decided by
// `windowTitle` (window-title.ts); this only reads the stores.
//
// A COMPONENT THAT RENDERS NOTHING, rather than an effect in App, on purpose.
// The unsaved half needs `useDirtySnapshot`, which subscribes to the history
// clock, so its host re-renders on every edit. In App that host would be the
// whole window. Here it is this null.

import { useEffect } from 'react';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useProjectStore } from '../state/projectStore';
import { useSessionStore } from '../state/sessionStore';
import { useDirtySnapshot } from './dirty-snapshot';
import { hasUnsavedWork } from './dirty-tabs';
import { windowTitle } from './window-title';

export default function WindowTitle(): null {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicLabel = useClassicProjectStore((s) => s.label);
  const configName = useProjectStore((s) => s.config?.name);
  const activeTab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeId));
  const unsaved = hasUnsavedWork(useDirtySnapshot());

  const projectName = classicOpen ? classicLabel : configName;
  const tabTitle = activeTab && activeTab.kind !== 'home' ? activeTab.title : null;
  useEffect(() => {
    document.title = windowTitle({ projectName, tabTitle, unsaved });
  }, [projectName, tabTitle, unsaved]);
  return null;
}
