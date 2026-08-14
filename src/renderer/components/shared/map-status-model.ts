// The map status bar's port contract, and the one piece of it with a decision in
// it. Everything else the bar shows is supplied by an engine port
// (providers/map-status-*.ts).
//
// `ToolId` comes from workspace/tool-meta, not state/editorStore: this module is
// on the neutral side of the line, where reaching into a store — even for a type
// — is what tool-meta's re-export exists to prevent (and what
// __tests__/shared-purity.test.ts enforces).

import type React from 'react';
import { TOOL_LABELS, TOOL_HINTS, type ToolId } from '../../workspace/tool-meta';

export interface StatusLabel { label: string; hint: string }

/**
 * Everything the neutral bar draws. No engine can be inferred from it: aeon's
 * `Section N` and classic's chunk/block counts are both just `scopeInfo`.
 */
export interface MapStatusPort {
  readonly tool: ToolId;
  readonly pasting: boolean;
  /** Uppercased by the bar; engines pass their own plane vocabulary. */
  readonly layer: string;
  readonly zoneName: string;
  /** Right of the zone name. Aeon passes `Section N`; classic passes its dims. */
  readonly scopeInfo: string;
  /** Overrides the tool hint when non-empty — engine-specific context. */
  readonly contextInfo: string;
  readonly zoom: number;
  onZoom(zoom: number): void;
  /** Engine-only trailing content (aeon's Aether bus indicator). */
  readonly right?: React.ReactNode;
}

/** Pasting is independent of the active tool — Ctrl+V does not switch tools —
 *  so it overrides whatever the tool vocabulary would otherwise show. */
export function statusLabel(s: { tool: ToolId; pasting: boolean }): StatusLabel {
  if (s.pasting) {
    return {
      label: 'Paste',
      hint: 'Click to paste · Alt: art only · Shift: collision only · Esc to stop',
    };
  }
  return { label: TOOL_LABELS[s.tool], hint: TOOL_HINTS[s.tool] };
}
