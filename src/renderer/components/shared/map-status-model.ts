// The one piece of the map status bar with a decision in it. Everything else
// the bar shows is supplied by an engine port (providers/map-status-*.ts).

import { TOOL_LABELS, TOOL_HINTS } from '../../workspace/tool-meta';
import type { EditorTool } from '../../state/editorStore';

export interface StatusLabel { label: string; hint: string }

/** Pasting is independent of the active tool — Ctrl+V does not switch tools —
 *  so it overrides whatever the tool vocabulary would otherwise show. */
export function statusLabel(s: { tool: EditorTool; pasting: boolean }): StatusLabel {
  if (s.pasting) {
    return {
      label: 'Paste',
      hint: 'Click to paste · Alt: art only · Shift: collision only · Esc to stop',
    };
  }
  return { label: TOOL_LABELS[s.tool], hint: TOOL_HINTS[s.tool] };
}
