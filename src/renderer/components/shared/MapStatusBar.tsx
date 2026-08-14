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
import { statusLabel } from './map-status-model';
import type { EditorTool } from '../../state/editorStore';

export interface MapStatusPort {
  tool: EditorTool;
  pasting: boolean;
  /** Uppercased by the bar; engines pass their own plane vocabulary. */
  layer: string;
  zoneName: string;
  /** Right of the zone name. Aeon passes `Section N`; classic passes its dims. */
  scopeInfo: string;
  /** Overrides the tool hint when non-empty — engine-specific context. */
  contextInfo: string;
  zoom: number;
  onZoom(zoom: number): void;
  /** Engine-only trailing content (aeon's Aether bus indicator). */
  right?: React.ReactNode;
  /** Repaint signal: aeon mutates in place and ticks a clock, classic swaps an
   *  immutable doc. Nothing shared can straddle that, so it is explicit. */
  versionKey?: unknown;
}

export default function MapStatusBar({ port }: { port: MapStatusPort }) {
  const info = statusLabel(port);
  const zoomPercent = Math.round(port.zoom * 100);

  const left = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: T.accent, fontWeight: 600 }}>{info.label}</span>
      <span style={{ color: T.textBase }}>{port.layer.toUpperCase()}</span>
      <span style={{ color: T.textLo }}>{port.zoneName}</span>
      <span style={{ color: T.textLo }}>{port.scopeInfo}</span>
      <span style={{ color: T.textLo }}>{port.contextInfo || info.hint}</span>
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
