import { describe, it, expect } from 'vitest';
import { statusLabel } from '../map-status-model';

describe('statusLabel', () => {
  it('shows the tool label and hint', () => {
    expect(statusLabel({ tool: 'select', pasting: false }))
      .toEqual({ label: 'Select', hint: expect.any(String) });
  });

  it('lets pasting override the active tool, because Ctrl+V does not switch tools', () => {
    const r = statusLabel({ tool: 'stamp-chunk', pasting: true });
    expect(r.label).toBe('Paste');
    expect(r.hint).toContain('Esc to stop');
  });
});
