// src/renderer/shell/Explorer.tsx
// The persistent left explorer (spec §3): grouped, filterable tree present in
// every tab; groups collapsed by default with counts; Ctrl+B (wired in App)
// toggles full width ↔ a 44px icon rail. Group models come from the tested
// builders in explorer-data.ts; this component only renders and routes clicks
// by item-id prefix: 'level:' → guarded tab open, 'obj:' → edit-art handoff,
// 'tool:' → tool tab, 'recent:' → open recent project.

import React, { useEffect, useMemo, useState } from 'react';
import { T, Icons, CollapsibleSection } from '../components/ui';
import AuroraMark from '../components/AuroraMark';
import { useShellStore } from '../state/shellStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { filterExplorer, type ExplorerGroupModel, type ExplorerItemModel } from '../../core/shell/explorer';
import { classicExplorerGroups, aeonExplorerGroups, noProjectExplorerGroups, type ClassicObjectRow } from './explorer-data';
import { requestOpenTab } from './tab-activation';
import { classicLevelTab, aeonLevelTab, parseLevelTabId, PROJECT_SETUP_TAB } from './tabs';
import { S1_OBJECT_LIST, s1ObjectHex } from '../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../core/project/profiles/s1-object-art';
import { editObjectArt } from '../components/sprite/export-sprite';
import type { RecentProject } from '../../shared/ipc-types';

const GROUP_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  levels: Icons.IconLayers,
  objects: Icons.IconObject,
  tools: Icons.IconTools,
  recents: Icons.IconClock,
};

export interface ExplorerProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
}

/** One explorer tree row. Local hover state (the way `Tab` does) — never a CSS file. */
function ExplorerItem({ item, onActivate }: { item: ExplorerItemModel; onActivate: (item: ExplorerItemModel) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => onActivate(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={item.disabled}
      title={item.disabled ? item.reason : item.hint ?? item.label}
      style={{
        ...styles.item,
        ...(item.disabled ? styles.itemDisabled : {}),
        ...(!item.disabled && hover ? styles.itemHover : {}),
      }}
    >
      <span style={styles.itemLabel}>{item.label}</span>
      {item.hint && <span style={styles.itemHint}>{item.hint}</span>}
    </button>
  );
}

export default function Explorer({ onOpenProject, onOpenRecent }: ExplorerProps) {
  const collapsed = useShellStore((s) => s.explorerCollapsed);
  const toggle = useShellStore((s) => s.toggleExplorer);
  const [query, setQuery] = useState('');

  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const classicLabel = useClassicProjectStore((s) => s.label);
  const classicZone = useClassicLevelStore((s) => s.ref?.zone ?? null);
  const docReady = useClassicLevelStore((s) => s.status) === 'ready';
  const config = useProjectStore((s) => s.config);

  const [recents, setRecents] = useState<RecentProject[]>([]);
  const noProject = !classicOpen && !config;
  useEffect(() => {
    if (noProject) window.api.getRecentProjects().then(setRecents).catch(() => setRecents([]));
  }, [noProject]);

  const groups: ExplorerGroupModel[] = useMemo(() => {
    if (classicOpen) {
      // The object list keys art off the LOADED zone; before a doc is ready we
      // pass zone '' so linked-ness still computes for zone-independent art.
      const objects: ClassicObjectRow[] = S1_OBJECT_LIST.map(({ id, name }) => ({
        id, name, hex: s1ObjectHex(id),
        linked: resolveObjectArt(id, classicZone ?? '') !== undefined,
      }));
      return classicExplorerGroups(zoneTree, objects, docReady);
    }
    if (config) {
      return aeonExplorerGroups(config.zones.map((z) => ({
        id: z.id, name: z.name, acts: z.acts.map((a) => ({ id: a.id })),
      })));
    }
    return noProjectExplorerGroups(recents);
  }, [classicOpen, zoneTree, classicZone, docReady, config, recents]);

  const filtered = useMemo(() => filterExplorer(groups, query), [groups, query]);

  const activate = (item: ExplorerItemModel) => {
    if (item.disabled) return;
    if (item.id.startsWith('level:')) {
      const ref = parseLevelTabId(item.id)!;
      if (classicOpen) {
        const target = zoneTree.find((r) => r.zone === ref.zone && String(r.act) === ref.act);
        if (target) void requestOpenTab(classicLevelTab(target));
      } else if (config) {
        const zone = config.zones.find((z) => z.id === ref.zone);
        if (zone) void requestOpenTab(aeonLevelTab(zone.id, zone.name, ref.act));
      }
    } else if (item.id.startsWith('obj:')) {
      const id = Number(item.id.slice('obj:'.length));
      if (classicZone) void editObjectArt(id, classicZone);
    } else if (item.id === PROJECT_SETUP_TAB.id) {
      void requestOpenTab(PROJECT_SETUP_TAB);
    } else if (item.id.startsWith('recent:')) {
      onOpenRecent(item.id.slice('recent:'.length));
    }
  };

  const projectName = classicOpen ? (classicLabel ?? 'Project') : config ? config.name : 'No project';

  if (collapsed) {
    return (
      <div style={styles.rail}>
        <div style={styles.railBrand} title="Aurora"><AuroraMark size={20} /></div>
        {groups.map((g) => {
          const Icon = GROUP_ICONS[g.id] ?? Icons.IconLayers;
          return (
            <button
              key={g.id}
              title={`${g.label} (${g.items.length})`}
              onClick={toggle}
              style={styles.railButton}
            >
              <Icon size={16} />
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button title="Expand explorer (Ctrl+B)" onClick={toggle} style={styles.railButton}>
          <Icons.IconPanelToggle size={16} />
        </button>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <AuroraMark size={18} />
        <span style={styles.projectName} title={projectName}>{projectName}</span>
        <button title="Collapse explorer (Ctrl+B)" onClick={toggle} style={styles.headerButton}>
          <Icons.IconPanelToggle size={14} />
        </button>
      </div>
      <div style={styles.filterWrap}>
        <Icons.IconSearch size={12} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          style={styles.filter}
          spellCheck={false}
        />
      </div>
      <div style={styles.treeScroll}>
        {filtered.length === 0 && query.trim() !== '' && (
          <div style={styles.empty}>No matches</div>
        )}
        {filtered.length === 0 && query.trim() === '' && noProject && (
          <div style={styles.empty}>
            <button onClick={onOpenProject} style={styles.openButton}>Open Project…</button>
          </div>
        )}
        {filtered.map((g) => (
          <CollapsibleSection
            key={g.id}
            id={`explorer.${g.id}`}
            title={g.label}
            defaultCollapsed={query.trim() === ''}
            right={<span style={styles.count}>{g.items.length}</span>}
          >
            <div style={styles.items}>
              {g.items.map((item) => (
                <ExplorerItem key={item.id} item={item} onActivate={activate} />
              ))}
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
    background: T.void, borderRight: `1px solid ${T.border}`, overflow: 'hidden',
  },
  rail: {
    width: 44, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 4, padding: '6px 0', background: T.void, borderRight: `1px solid ${T.border}`,
  },
  railBrand: { padding: '2px 0 8px' },
  railButton: {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', color: T.textLo, border: 'none', borderRadius: T.rMd, cursor: 'pointer',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 10px',
    borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  projectName: {
    flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: T.textHi,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  headerButton: {
    display: 'flex', alignItems: 'center', background: 'transparent', color: T.textLo,
    border: 'none', cursor: 'pointer', padding: 2, borderRadius: T.rSm,
  },
  filterWrap: {
    display: 'flex', alignItems: 'center', gap: 6, margin: 8, padding: '4px 8px',
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd,
    color: T.textLo, flexShrink: 0,
  },
  filter: {
    flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
    color: T.textHi, fontSize: 12, fontFamily: T.fontUi,
  },
  treeScroll: { flex: 1, overflowY: 'auto' },
  count: { fontSize: 10, color: T.textFaint, fontFamily: T.fontMono },
  items: { display: 'flex', flexDirection: 'column', padding: '2px 4px 6px' },
  item: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', width: '100%',
    background: 'transparent', border: 'none', borderRadius: T.rMd, cursor: 'pointer',
    color: T.textBase, fontSize: 12, textAlign: 'left' as const,
  },
  itemHover: { background: T.raised },
  itemDisabled: { color: T.textFaint, cursor: 'default' },
  itemLabel: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  itemHint: { fontSize: 10, color: T.textFaint, fontFamily: T.fontMono, flexShrink: 0 },
  empty: { padding: 16, textAlign: 'center' as const, color: T.textLo, fontSize: 12 },
  openButton: {
    padding: '6px 14px', background: T.accent, color: T.onAccent, fontWeight: 600,
    border: 'none', borderRadius: T.rMd, cursor: 'pointer', fontSize: 12,
  },
};
