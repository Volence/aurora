import React, { useState } from 'react';
import { T } from './theme';
import { PanelHeader } from './primitives';
import { IconChevron } from './icons';
import { loadPanelState, savePanelState, isCollapsed, togglePanel } from '../../shell/panel-state';

export function CollapsibleSection({ id, title, right, defaultCollapsed = false, children }: {
  id: string; title: string; right?: React.ReactNode; defaultCollapsed?: boolean; children: React.ReactNode;
}) {
  const [state, setState] = useState(loadPanelState);
  const collapsed = isCollapsed(state, id, defaultCollapsed);
  const toggle = () => { const next = togglePanel(state, id, defaultCollapsed); setState(next); savePanelState(next); };
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
