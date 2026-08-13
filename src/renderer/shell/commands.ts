// src/renderer/shell/commands.ts
// ⌘K content (spec §3: search everything — commands, tabs, levels, objects,
// tools). Pure builder: snapshot + injected actions → the Command[] the
// existing CommandPalette renders. Ordering: global commands, then go-to-tab,
// then open-level, then edit-art, then edit-sprite (aeon Object Library),
// then recents — cheapest wayfinding first.

import type { Command } from '../components/CommandPalette';
import type { TabDescriptor } from '../../core/shell/session';
import type { RecentProject } from '../../shared/ipc-types';
import { PROJECT_SETUP_TAB } from './tabs';

export interface CommandSnapshot {
  tabs: TabDescriptor[];
  activeId: string;
  engine: 's1' | 'aeon' | null;
  /** Every openable level in the project, as ready-to-open tab descriptors. */
  levelTabs: TabDescriptor[];
  /** Classic art-linked objects (empty for aeon / no project / doc not ready). */
  objects: { id: number; name: string; hex: string }[];
  /** aeon Object Library defs bound to a saved sprite (empty for classic / no project). */
  aeonSprites: { name: string; sprite: string }[];
  /** Recent projects (only offered when no project is open). */
  recents: RecentProject[];
}

export interface CommandActions {
  openProjectDialog: () => void;
  /** Ctrl+S — the active tab's document only. */
  save: () => void;
  /** Ctrl+Shift+S — every dirty surface. */
  saveAll: () => void;
  toggleExplorer: () => void;
  openTab: (tab: TabDescriptor) => void;
  editObjectArt: (id: number) => void;
  openRecent: (path: string) => void;
}

export function buildCommands(s: CommandSnapshot, a: CommandActions): Command[] {
  const cmds: Command[] = [
    { id: 'open-project', label: 'Open Project…', hint: 'project', run: a.openProjectDialog },
    // Both save bindings are listed, and labelled apart: "Save" writes only what
    // you are looking at, "Save All" writes every dirty surface.
    { id: 'save', label: 'Save', hint: 'Ctrl+S', run: a.save },
    { id: 'save-all', label: 'Save All', hint: 'Ctrl+Shift+S', run: a.saveAll },
    { id: 'toggle-explorer', label: 'Toggle Explorer', hint: 'Ctrl+B', run: a.toggleExplorer },
    { id: 'open-setup', label: 'Project Setup', hint: 'tool', run: () => a.openTab(PROJECT_SETUP_TAB) },
  ];

  for (const tab of s.tabs) {
    if (tab.id === s.activeId) continue;
    cmds.push({ id: `goto:${tab.id}`, label: `Go to tab: ${tab.title}`, hint: 'tab', run: () => a.openTab(tab) });
  }

  const openIds = new Set(s.tabs.map((t) => t.id));
  for (const tab of s.levelTabs) {
    if (openIds.has(tab.id)) continue;
    cmds.push({ id: `open-level:${tab.id}`, label: `Open level: ${tab.title}`, hint: 'level', run: () => a.openTab(tab) });
  }

  for (const o of s.objects) {
    cmds.push({ id: `edit-art:${o.id}`, label: `Edit art: ${o.name}`, hint: o.hex, run: () => a.editObjectArt(o.id) });
  }

  for (const sp of s.aeonSprites) {
    cmds.push({
      id: `edit-sprite:${sp.sprite}`, label: `Edit sprite: ${sp.name}`, hint: 'sprite',
      run: () => a.openTab({ id: `doc:sprite:aeon:${sp.sprite}`, kind: 'sprite-doc', title: sp.name }),
    });
  }

  if (s.engine === null) {
    for (const r of s.recents) {
      cmds.push({ id: `recent:${r.path}`, label: `Open recent: ${r.name}`, hint: r.path, run: () => a.openRecent(r.path) });
    }
  }

  return cmds;
}
