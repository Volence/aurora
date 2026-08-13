// src/renderer/shell/TabStrip.tsx
// The everything-is-a-tab strip (spec §3). Visual language (§11): tabs are
// PAGE-shaped — squared top corners with a 2px emerald top accent on the
// active tab — so they can never be confused with the pill-shaped facet
// control that arrives in Stage 3. Dirty tabs show the emerald dot; Home is
// pinned first and uncloseable. Clicks route through the activation guard.

import React from 'react';
import { T, Icons } from '../components/ui';
import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import { useSpriteStore } from '../state/spriteStore';
import { tabHasDirtyDot, type DirtySnapshot } from './dirty-tabs';
import { requestFocusTabId } from './tab-activation';
import type { TabDescriptor } from '../../core/shell/session';

function useDirtySnapshot(): DirtySnapshot {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicRefState = useClassicLevelStore((s) => s.ref);
  const classicDirty = useClassicLevelStore((s) => Object.values(s.dirty).some(Boolean));
  const aeonOpen = useProjectStore((s) => s.project) !== null;
  const aeonDirty = useEditorStore((s) => s.dirty);
  const spriteArtPending = useSpriteStore((s) => s.s1ArtSource) !== null;
  return {
    classicOpen,
    // classicRef = the LOADED act (store's ref), not a tree selection — dirty dots must track the doc that owns the edits.
    classicRef: classicRefState ? { zone: classicRefState.zone, act: classicRefState.act } : null,
    classicDirty,
    aeonOpen,
    aeonDirty,
    spriteArtPending,
  };
}

function Tab({ tab, active, dirty }: { tab: TabDescriptor; active: boolean; dirty: boolean }) {
  const close = useSessionStore((s) => s.close);
  const [hover, setHover] = React.useState(false);
  const closeable = tab.kind !== 'home';
  return (
    <div
      onMouseDown={(e) => { if (e.button === 0) void requestFocusTabId(tab.id); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={tab.title}
      style={{
        ...styles.tab,
        ...(active ? styles.tabActive : {}),
        ...(!active && hover ? styles.tabHover : {}),
      }}
    >
      {tab.kind === 'home' && <Icons.IconHome size={13} />}
      <span style={styles.tabTitle}>{tab.title}</span>
      {dirty && <span style={styles.dot} title="Unsaved changes — Ctrl+S to save" />}
      {closeable && (
        <span
          onMouseDown={(e) => { e.stopPropagation(); close(tab.id); }}
          title="Close tab"
          style={{ ...styles.close, opacity: hover || active ? 1 : 0 }}
        >
          <Icons.IconClose size={11} />
        </span>
      )}
    </div>
  );
}

export default function TabStrip() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeId = useSessionStore((s) => s.activeId);
  const dirtySnap = useDirtySnapshot();
  return (
    <div style={styles.strip} role="tablist">
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          active={tab.id === activeId}
          dirty={tabHasDirtyDot(tab.id, tab.kind, dirtySnap)}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  strip: {
    display: 'flex', alignItems: 'stretch', height: 34, flexShrink: 0,
    background: T.void, borderBottom: `1px solid ${T.border}`,
    overflowX: 'auto', scrollbarWidth: 'none' as const,
  },
  tab: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 0 12px',
    maxWidth: 180, minWidth: 0, cursor: 'pointer', userSelect: 'none' as const,
    color: T.textLo, fontSize: 12, borderRight: `1px solid ${T.border}`,
    boxShadow: 'inset 0 2px 0 transparent',
  },
  tabHover: { background: T.raised, color: T.textBase },
  tabActive: {
    background: T.surface, color: T.textHi,
    boxShadow: `inset 0 2px 0 ${T.accent}`,
  },
  tabTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  dot: {
    width: 6, height: 6, borderRadius: '50%', background: T.accent, flexShrink: 0,
  },
  close: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 16, height: 16, borderRadius: T.rSm, color: T.textLo, flexShrink: 0,
  },
};
