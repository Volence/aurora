import { describe, it, expect } from 'vitest';
import { statusLabel } from '../map-status-model';
import { TOOL_IDS, TOOL_LABELS, TOOL_HINTS } from '../../../workspace/tool-meta';

describe('statusLabel', () => {
  it('shows the tool label and hint', () => {
    expect(statusLabel({ tool: 'select', pasting: false }))
      .toEqual({ label: 'Select', hint: TOOL_HINTS.select });
  });

  it('speaks the one shared vocabulary for every tool, never a second table', () => {
    for (const tool of TOOL_IDS) {
      expect(statusLabel({ tool, pasting: false }))
        .toEqual({ label: TOOL_LABELS[tool], hint: TOOL_HINTS[tool] });
    }
  });

  it('lets pasting override the active tool, because Ctrl+V does not switch tools', () => {
    const r = statusLabel({ tool: 'stamp-chunk', pasting: true });
    expect(r.label).toBe('Paste');
    expect(r.hint).toContain('Esc to stop');
  });

  it('overrides every tool while pasting, not just the stamp', () => {
    for (const tool of TOOL_IDS) {
      expect(statusLabel({ tool, pasting: true }).label).toBe('Paste');
    }
  });
});
