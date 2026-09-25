// ART-OPTIONS-BAR-HEIGHT (ROADMAP row 210): THE COMPACT SHARED-TILE WARNING
// KEEPS ITS WHOLE SENTENCE.
//
// The Art facet's tool-options bar is one fixed-height row now, so the warning
// that used to be a sentence of bar text shows "⚠ shared tiles". The ruling is
// that nothing is dropped: the sentence stays on hover (`title`) and for
// assistive tech (`aria-label`, on an element whose role takes a name). These
// rows call the hookless component as a plain function and read the element it
// returns, as object-inspector-field-bounds.test.ts does; the live harness row
// AOB.t (scratchpad/map-behaviour-fixes-harness.mjs) asks the same of the
// running app.

import { describe, it, expect } from 'vitest';
import type React from 'react';
import SharedTileWarning, { SHARED_TILE_WARNING } from '../SharedTileWarning';

type Props = { title?: string; 'aria-label'?: string; role?: string; children?: React.ReactNode };
const el = () => SharedTileWarning() as React.ReactElement<Props>;
const text = (n: React.ReactNode): string => (Array.isArray(n) ? n.map(text).join('') : typeof n === 'string' ? n : '');

describe('SharedTileWarning', () => {
  it('names the warning in full on hover', () => {
    expect(el().props.title).toBe(SHARED_TILE_WARNING);
  });

  it('names the warning in full to assistive tech, on a role that takes a name', () => {
    expect(el().props['aria-label']).toBe(SHARED_TILE_WARNING);
    expect(el().props.role).toBe('note');
  });

  it('shows a short label with the warning sign, not the sentence', () => {
    const shown = text(el().props.children).trim();
    expect(shown.startsWith('⚠')).toBe(true);
    expect(shown).not.toContain(SHARED_TILE_WARNING);
    expect(shown.length).toBeLessThan(SHARED_TILE_WARNING.length);
  });
});
