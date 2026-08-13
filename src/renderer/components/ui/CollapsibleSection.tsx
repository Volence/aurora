import React, { useState } from 'react';
import { T } from './theme';
import { PanelHeader } from './primitives';
import { IconChevron } from './icons';
import { loadPanelState, savePanelState, isCollapsed, togglePanel } from '../../shell/panel-state';

export function CollapsibleSection({ id, title, right, defaultCollapsed = false, collapsedOverride, children }: {
  id: string; title: string; right?: React.ReactNode; defaultCollapsed?: boolean;
  /**
   * When defined, wins over both persisted state and defaultCollapsed (e.g. an
   * active filter force-expanding a group the user previously collapsed). The
   * header toggle becomes a no-op while overridden — it must not write through
   * to panel-state, or the user's persisted preference would be clobbered by a
   * click that only makes sense in the filtered view.
   */
  collapsedOverride?: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState(loadPanelState);
  const collapsed = collapsedOverride ?? isCollapsed(state, id, defaultCollapsed);
  // Re-load the latest persisted state on each toggle (instead of writing this
  // section's mount-time snapshot) so collapsing one section never clobbers
  // another section's persisted collapse state.
  const toggle = () => {
    if (collapsedOverride !== undefined) return; // overridden — not a real toggle
    const next = togglePanel(loadPanelState(), id, defaultCollapsed);
    savePanelState(next);
    setState(next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div onClick={toggle} style={{ cursor: 'pointer' }}>
        <PanelHeader right={right}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-flex', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.1s', color: T.textLo }}>
              <IconChevron size={12} />
            </span>
            {title}
          </span>
        </PanelHeader>
      </div>
      {!collapsed && children}
    </div>
  );
}
