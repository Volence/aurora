// src/renderer/shell/Explorer.tsx
// The persistent left explorer (spec §3): grouped, filterable tree present in
// every tab; groups collapsed by default with counts; Ctrl+B (wired in App)
// toggles full width ↔ a 44px icon rail. Group models come from the tested
// builders in explorer-data.ts; this component only renders and routes clicks
// by item-id prefix: 'level:' → guarded tab open, 'obj:' → edit-art handoff,
// 'doc:sprite:' → sprite-doc tab open (aeon Object Library), 'doc:canvas:' →
// canvas-doc tab open, 'tool:' → tool tab, 'recent:' → open recent project.

import React, { useEffect, useMemo, useState } from 'react';
import { T, Icons, CollapsibleSection } from '../components/ui';
import AuroraMark from '../components/AuroraMark';
import { useShellStore } from '../state/shellStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { useOpenEngine } from '../state/open-project';
import { filterExplorer, type ExplorerGroupModel, type ExplorerItemModel, countableItems } from '../../core/shell/explorer';
import {
  classicExplorerGroups, aeonExplorerGroups, noProjectExplorerGroups, resolveObjectSprite,
  NEW_SPRITE_ITEM_ID, NEW_CANVAS_ITEM_ID, IMPORT_SHEET_ITEM_ID, type AeonObjectRow,
} from './explorer-data';
import { requestOpenTab } from './tab-activation';
import { classicLevelTab, aeonLevelTab, parseLevelTabId, spriteDocTab, parseSpriteDocTabId, parseCanvasDocTabId, canvasDocTab, untitledSpriteTab, PROJECT_SETUP_TAB } from './tabs';
import { listCanvasNames, type CanvasListing } from '../state/canvas-file';
import { openProjectDir } from '../state/open-project';
import { useSessionStore } from '../state/sessionStore';
import { editObjectArt } from '../components/sprite/export-sprite';
import type { RecentProject } from '../../shared/ipc-types';
import type { ObjectDef } from '../../core/model/s4-types';

// Referentially-stable fallback: a fresh `[]` per render would defeat the
// zustand selector's equality check and rebuild the whole groups memo on
// every unrelated project mutation (addChunks/addBgToLibrary spread a new
// project object even though objectLibrary itself didn't change).
const EMPTY_LIBRARY: ObjectDef[] = [];

const EMPTY_CANVASES: CanvasListing = { names: [], skipped: [] };

const GROUP_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  levels: Icons.IconLayers,
  objects: Icons.IconObject,
  canvases: Icons.IconPencil,
  tools: Icons.IconTools,
  recents: Icons.IconClock,
};

export interface ExplorerProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  /** Opens the New Canvas dialog, which App owns (one mount, like ConfirmDialog). */
  onNewCanvas: () => void;
  onImportSheet: () => void;
}

/** One explorer tree row. Local hover state (the way `Tab` does) — never a CSS file. */
function ExplorerItem({ item, onActivate }: { item: ExplorerItemModel; onActivate: (item: ExplorerItemModel) => void }) {
  const [hover, setHover] = useState(false);
  if (item.heading) {
    // A divider labelling the rows after it (ExplorerItemModel.heading) — a
    // plain div, not a button: nothing to activate, nothing to focus.
    return <div data-explorer-heading style={styles.itemHeading}>{item.label}</div>;
  }
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

export default function Explorer({ onOpenProject, onOpenRecent, onNewCanvas, onImportSheet }: ExplorerProps) {
  const collapsed = useShellStore((s) => s.explorerCollapsed);
  const toggle = useShellStore((s) => s.toggleExplorer);
  const [query, setQuery] = useState('');

  const engine = useOpenEngine();
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const classicLabel = useClassicProjectStore((s) => s.label);
  const classicZone = useClassicLevelStore((s) => s.ref?.zone ?? null);
  const docReady = useClassicLevelStore((s) => s.status) === 'ready';
  const config = useProjectStore((s) => s.config);
  const objectLibrary = useProjectStore((s) => s.project?.objectLibrary ?? EMPTY_LIBRARY);
  const objectBindings = useProjectStore((s) => s.objectBindings);

  const [recents, setRecents] = useState<RecentProject[]>([]);
  const noProject = !classicOpen && !config;
  useEffect(() => {
    if (noProject) window.api.getRecentProjects().then(setRecents).catch(() => setRecents([]));
  }, [noProject]);

  // The canvases on disk. A canvas is a FILE, not a store entry, so this is a
  // directory listing rather than something derived from state — which is also
  // why it needs an explicit refresh trigger.
  //
  // THE TRIGGER IS THE TAB SET, and the reason is ordering: `createCanvasDocument`
  // opens the tab only AFTER both files have landed, so a re-list keyed on the
  // tabs cannot race the write. Keying it on the canvas store instead (docs.size
  // changes at create time) would fire while the write was still in flight and
  // list the project without its newest canvas.
  //
  // NOTHING WATCHES THE DIRECTORY. A canvas added or deleted outside Aurora is
  // picked up only OPPORTUNISTICALLY — whenever some tab happens to open or
  // close — so "deleted the PNG in a file manager, alt-tabbed back" leaves a
  // stale row until then. That degrades correctly rather than silently: clicking
  // it runs the ordinary load, which fails and lands on CanvasDocUnloaded with
  // the path and a Retry. A watcher is the real answer if this ever matters.
  const tabs = useSessionStore((s) => s.tabs);
  const [canvases, setCanvases] = useState<CanvasListing>(EMPTY_CANVASES);
  useEffect(() => {
    const dir = openProjectDir();
    if (dir === null) { setCanvases(EMPTY_CANVASES); return; }
    let live = true;
    listCanvasNames(dir)
      .then((l) => { if (live) setCanvases(l); })
      .catch(() => { if (live) setCanvases(EMPTY_CANVASES); });
    return () => { live = false; };
  }, [classicOpen, config, tabs]);

  const groups: ExplorerGroupModel[] = useMemo(() => {
    if (classicOpen) {
      // The library keys availability off the LOADED zone (null before a doc
      // is ready — zone-free art still lists as available level-free).
      return classicExplorerGroups(zoneTree, classicZone, docReady, canvases);
    }
    if (config) {
      const objects: AeonObjectRow[] = objectLibrary.map((o) => ({
        id: o.id, name: o.name, sprite: resolveObjectSprite(o, objectBindings),
      }));
      return aeonExplorerGroups(config.zones.map((z) => ({
        id: z.id, name: z.name, acts: z.acts.map((a) => ({ id: a.id })),
      })), objects, canvases);
    }
    return noProjectExplorerGroups(recents);
  }, [classicOpen, zoneTree, classicZone, docReady, config, objectLibrary, objectBindings, recents, canvases]);

  const filtered = useMemo(() => filterExplorer(groups, query), [groups, query]);

  const activate = (item: ExplorerItemModel) => {
    if (item.disabled) return;
    if (item.id.startsWith('level:')) {
      const ref = parseLevelTabId(item.id)!;
      // Engine identity comes from the shared selector; `config`/`zoneTree` are
      // only consulted for the zone lookup once the engine is known.
      if (engine === 's1') {
        const target = zoneTree.find((r) => r.zone === ref.zone && String(r.act) === ref.act);
        if (target) void requestOpenTab(classicLevelTab(target));
      } else if (engine === 'aeon') {
        const zone = config?.zones.find((z) => z.id === ref.zone);
        if (zone) void requestOpenTab(aeonLevelTab(zone.id, zone.name, ref.act));
      }
    } else if (item.id.startsWith('obj:')) {
      const id = Number(item.id.slice('obj:'.length));
      void editObjectArt(id);
    } else if (item.id === NEW_SPRITE_ITEM_ID) {
      void requestOpenTab(untitledSpriteTab());
    } else if (item.id.startsWith('doc:sprite:')) {
      const p = parseSpriteDocTabId(item.id);
      if (p) void requestOpenTab(spriteDocTab(p.engine, p.ref, item.label));
    } else if (item.id === NEW_CANVAS_ITEM_ID) {
      onNewCanvas();
    } else if (item.id === IMPORT_SHEET_ITEM_ID) {
      onImportSheet();
    } else if (item.id.startsWith('doc:canvas:')) {
      // Rebuilt through canvasDocTab rather than reusing the item id as a
      // descriptor: the tab needs a kind and a title, and the ONE place that
      // knows how a canvas tab is spelled is tabs.ts.
      const p = parseCanvasDocTabId(item.id);
      if (p) void requestOpenTab(canvasDocTab(p.name));
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
              title={`${g.label} (${countableItems(g)})`}
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
            defaultCollapsed
            collapsedOverride={query.trim() !== '' ? false : undefined}
            right={<span style={styles.count}>{countableItems(g)}</span>}
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
    flex: 1, minWidth: 0, fontSize: T.tSm, fontWeight: T.wSemibold, color: T.textHi,
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
    flex: 1, minWidth: 0, background: 'transparent', border: 'none',
    color: T.textHi, fontSize: T.tSm, fontFamily: T.fontUi,
  },
  treeScroll: { flex: 1, overflowY: 'auto' },
  count: { fontSize: T.t2xs, color: T.textFaint, fontFamily: T.fontMono },
  items: { display: 'flex', flexDirection: 'column', padding: '2px 4px 6px' },
  item: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', width: '100%',
    background: 'transparent', border: 'none', borderRadius: T.rMd, cursor: 'pointer',
    color: T.textBase, fontSize: T.tSm, textAlign: 'left' as const,
  },
  itemHover: { background: T.raised },
  itemDisabled: { color: T.textFaint, cursor: 'default' },
  itemLabel: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  itemHint: { fontSize: T.t2xs, color: T.textFaint, fontFamily: T.fontMono, flexShrink: 0 },
  itemHeading: {
    padding: '8px 10px 2px 18px', fontSize: T.t2xs, color: T.textFaint,
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
    borderTop: `1px solid ${T.border}`, marginTop: 4,
  },
  empty: { padding: 16, textAlign: 'center' as const, color: T.textLo, fontSize: T.tSm },
  openButton: {
    padding: '6px 14px', background: T.accent, color: T.onAccent, fontWeight: T.wSemibold,
    border: 'none', borderRadius: T.rMd, cursor: 'pointer', fontSize: T.tSm,
  },
};
