// Neutral map status bar. Takes a port; imports no store and no command, so it
// cannot throw for a non-aeon document (spec §3.0.1, editorStore.ts:372-381).
// Engine-specific extras (aeon's Aether indicator) ride the `right` slot.
//
// Labels and hints come from workspace/tool-meta.ts via map-status-model — one
// vocabulary, named once, so this bar and classic's chip row cannot call the
// same tool different things. Engine-specific modifiers (aeon's stamp Alt) ride
// `contextInfo`, which the port supplies.

import React from 'react';
import { StatusBar, T, IconButton } from '../ui';
import { statusContext, statusLabel, type MapStatusPort } from './map-status-model';

export default function MapStatusBar({ port }: { port: MapStatusPort }): React.ReactElement {
  const info = statusLabel(port);
  // The tool label stays whatever the tool is; only the trailing HINT defers —
  // see statusContext, which owns the three cases so a node test can reach them.
  const context = statusContext(port);
  const zoomPercent = Math.round(port.zoom * 100);

  const left = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: T.accent, fontWeight: 600 }}>{info.label}</span>
      <span style={{ color: T.textBase }}>{port.layer.toUpperCase()}</span>
      <span style={{ color: T.textLo }}>{port.zoneName}</span>
      <span style={{ color: port.scopeTone === 'error' ? T.error : T.textLo }}>{port.scopeInfo}</span>
      <span style={{ color: T.textLo }}>{context}</span>
    </span>
  );

  const right = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <IconButton icon={<span>−</span>} label="Zoom out" onClick={() => port.onZoom(port.zoom / 1.5)} />
      <span style={{ minWidth: 36, textAlign: 'center', color: T.textBase }}>{zoomPercent}%</span>
      <IconButton icon={<span>+</span>} label="Zoom in" onClick={() => port.onZoom(port.zoom * 1.5)} />
      {port.right && <span style={{ marginLeft: 8 }}>{port.right}</span>}
    </span>
  );

  return <StatusBar left={left} right={right} />;
}
