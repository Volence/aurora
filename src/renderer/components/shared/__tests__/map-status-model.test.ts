import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { statusContext, statusLabel } from '../map-status-model';
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

describe('statusContext: who gets to explain the tool', () => {
  const base = { tool: 'select', pasting: false } as const;

  it('prefers the port\'s own context over everything', () => {
    expect(statusContext({ ...base, contextInfo: 'Chunk: 07 · Alt: art only' }))
      .toBe('Chunk: 07 · Alt: art only');
    // Even when the facet has its own hint line: contextInfo is LIVE state
    // (which chunk is armed), not a restatement of what the tool does.
    expect(statusContext({ ...base, contextInfo: 'Chunk: 07', ownHintLine: true }))
      .toBe('Chunk: 07');
  });

  it('falls back to the generic tool hint for a facet with nowhere else to say it', () => {
    // Aeon's map facets mount no ToolOptions, so this bar is the only
    // explanation of the active tool on screen.
    expect(statusContext({ ...base, contextInfo: '' })).toBe(TOOL_HINTS.select);
    expect(statusContext({ ...base, contextInfo: '', ownHintLine: false })).toBe(TOOL_HINTS.select);
  });

  it('says NOTHING when the facet mounts its own hint line', () => {
    // The contradiction this closes: classic's ClassicMapToolOptions says
    // "objects are FG-only — switch to FG to edit" for `select` on the BG plane,
    // and this bar's generic hint said "Click to select, drag to move, Del to
    // remove" one row below it. The canvas agrees with the options bar.
    expect(statusContext({ ...base, contextInfo: '', ownHintLine: true })).toBe('');
  });

  it('suppresses the PASTE hint too, for the same reason', () => {
    // Pasting overrides the tool label; it must not smuggle the hint back past a
    // facet that speaks for itself.
    expect(statusContext({ tool: 'select', pasting: true, contextInfo: '', ownHintLine: true }))
      .toBe('');
    expect(statusContext({ tool: 'select', pasting: true, contextInfo: '' }))
      .toContain('Esc to stop');
  });
});

// MapStatusBar is .tsx and the suite is node-only, so no test MOUNTS it — a port
// field the bar quietly ignores would type-check, register, and be assembled by
// every provider while changing nothing on screen. `scopeTone` exists solely to
// carry classic's failed-load red across the re-home, so "the bar reads it" is
// the whole point of the field and is asserted at the source level, the same way
// shared-purity.test.ts asserts the import rule.
describe('MapStatusBar consumes scopeTone', () => {
  const source = readFileSync(join(__dirname, '..', 'MapStatusBar.tsx'), 'utf8');

  // Asserted as three properties rather than one verbatim expression: hoisting
  // the ternary into a `const scopeColor` is a zero-behaviour-change refactor,
  // and a guard that a refactor can break is a guard people learn to edit
  // without thinking. Each of these still fails if the bar goes back to ignoring
  // the field.
  it('reads the tone off the port', () => {
    expect(source).toContain('port.scopeTone');
  });

  it('has an error colour to render it in', () => {
    expect(source).toContain('T.error');
  });

  it('routes the trailing hint through statusContext, not its own fallback', () => {
    // The decision has to live in the model, where a node test can reach it —
    // `port.contextInfo || info.hint` inline in the .tsx is exactly the shape
    // that let the two hint lines contradict each other unnoticed.
    expect(source).toContain('statusContext(port)');
    expect(source).not.toMatch(/port\.contextInfo\s*\|\|/);
  });

  it('does not pin the scope span to the low-contrast colour', () => {
    // A NEGATIVE on the exact pre-change shape, so any other formatting or a
    // hoisted const passes while a revert does not. (Negatives only fail when
    // they match, so looser source formatting can never trip this.)
    expect(source).not.toMatch(/color:\s*T\.textLo\s*\}\}>\s*\{port\.scopeInfo\}/);
  });
});
