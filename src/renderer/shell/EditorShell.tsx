import React from 'react';
import { T } from '../components/ui';

export interface EditorShellProps {
  appBar: React.ReactNode;
  toolOptions?: React.ReactNode;
  toolDock: React.ReactNode;
  children: React.ReactNode;     // canvas slot
  panels: React.ReactNode;       // right column
  bottomExtra?: React.ReactNode; // e.g. palette strip / sprite timeline, above status bar
  status?: React.ReactNode;      // StatusBar content
}

export default function EditorShell(p: EditorShellProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.surface, color: T.textHi }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 8px', background: T.void, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        {p.appBar}
      </div>
      {p.toolOptions != null && p.toolOptions}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 0', background: T.void, borderRight: `1px solid ${T.border}`, flexShrink: 0 }}>
          {p.toolDock}
        </div>
        {/* display:flex so a flow child (e.g. MapViewport's flex:1 root) stretches to
            fill; still position:relative so absolute-inset:0 children (Art/Sprite
            canvases) fill it too. Without display:flex, MapViewport collapses to 0 height. */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden', background: T.surface }}>
          {p.children}
        </div>
        <div style={{ display: 'flex', flexShrink: 0 }}>{p.panels}</div>
      </div>
      {p.bottomExtra}
      {p.status}
    </div>
  );
}
