// src/renderer/shell/TabStrip.tsx
// The everything-is-a-tab strip (spec §3). Visual language (§11): tabs are
// PAGE-shaped — squared top corners with a 2px emerald top accent on the
// active tab — so they can never be confused with the pill-shaped facet
// control that arrives in Stage 3. Dirty tabs show the emerald dot; Home is
// pinned first and uncloseable. Clicks route through the activation guard.

import React from 'react';
import { T, Icons } from '../components/ui';
import { useSessionStore } from '../state/sessionStore';
import { tabHasDirtyDot } from './dirty-tabs';
import { useDirtySnapshot } from './dirty-snapshot';
import { requestFocusTabId, requestCloseTab } from './tab-activation';
import { DirtyDot, DIRTY_DOT_TITLE } from './DirtyDot';
import type { TabDescriptor } from '../../core/shell/session';

// The dot's texts and look now live in DirtyDot.tsx, shared with the Explorer.
// Re-exported so anything that imported them from here keeps working.
export { DIRTY_DOT_LABEL, DIRTY_DOT_TITLE } from './DirtyDot';

function Tab({ tab, active, dirty }: { tab: TabDescriptor; active: boolean; dirty: boolean }) {
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
      {dirty && (
        // THE TAB DOT IS NOT THE ONLY PLACE THE APP SAYS "UNSAVED" ANY MORE,
        // and this comment used to say it was. It was true, and it was the
        // defect: closing a dirty level tab keeps the edit (no prompt, owner
        // card d-38; the act stays resident, see tab-activation/dispatch.ts),
        // and the close takes this dot with it, so seat B's full-screen scan
        // after the close found nothing while the store still held the work
        // (census B-F3). Three places say it now, all read off the same dirty
        // snapshot:
        //
        //   - this dot, on the tab;
        //   - the same dot on the level's row in the Explorer, and on the
        //     Levels group header so a folded group still shows it
        //     (dirty-tabs.ts `explorerRowDirty`, the same rule as this one);
        //   - a leading `● ` in the window title while ANY open document is
        //     unsaved (window-title.ts, dirty-tabs.ts `hasUnsavedWork`).
        //
        // The dot has a role and an accessible name, not just a `title`, so a
        // screen reader and a DOM scan can both find the state (packet
        // docs/reviews/2026-09-09-save-contract.md, receipt R3). It is drawn by
        // DirtyDot.tsx, one definition for every place it appears.
        <DirtyDot title={DIRTY_DOT_TITLE} />
      )}
      {closeable && (
        <span
          onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0) void requestCloseTab(tab.id); }}
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
    color: T.textLo, fontSize: T.tSm, borderRight: `1px solid ${T.border}`,
    boxShadow: 'inset 0 2px 0 transparent',
  },
  tabHover: { background: T.raised, color: T.textBase },
  tabActive: {
    background: T.surface, color: T.textHi,
    boxShadow: `inset 0 2px 0 ${T.accent}`,
  },
  tabTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  close: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 16, height: 16, borderRadius: T.rSm, color: T.textLo, flexShrink: 0,
  },
};
