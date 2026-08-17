// ONE WORD PER CONCEPT ON THE COMPOSER BAR (UX-A6).
//
// The block and chunk composers used to put three copy-flavoured words within
// one row of each other:
//
//   [Assign|Paint]  [Duplicate]  [+ New blank]      ← the header row
//   Diverge: [Isolate|Link]  ...                    ← the paint row
//
// "Duplicate" is a COMMAND (copy this id to a new one, now). "Isolate|Link" is a
// MODE (when I paint, does the edit fork or propagate). Those are two different
// things and both names are good. "Diverge:" was a third word for the second
// one — an imperative-sounding group label sitting a few pixels from the actual
// imperative, naming the axis with a synonym of one of its own values.
//
// The replacement is "Edits:", which is the question the two chips answer and
// the exact frame the SharedBanner above them already uses ("Edits appear in all
// of them"). Not "Paint:", which is a mode chip in the same component.
//
// The STORE still says `paintDivergeMode` / `SurfaceDivergeMode`, deliberately:
// UX-A6 is about the words on screen, and those identifiers are documented at
// length in classicLevelStore. This file guards the screen.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = join(__dirname, '../../..');
// Comment-stripped: both files DISCUSS Link/Isolate/divergence in their
// docblocks, so a raw-source scan would pass on prose alone.
const code = (p: string): string => readFileSync(join(R, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SURFACES: Array<[string, string]> = [
  ['BlockTab', code('components/classic/BlockTab.tsx')],
  ['ChunkTab', code('components/classic/ChunkTab.tsx')],
];

describe.each(SURFACES)('%s composer vocabulary', (name, src) => {
  it('labels the paint-mode chips "Edits:", not a third copy-word', () => {
    expect(src, `${name}: the paint row lost its group label`).toMatch(/>Edits:</);
  });

  it('shows no "Diverge" anywhere the artist can read it', () => {
    // Screen text only — `paintDivergeMode` is the store field and stays.
    const rendered = src.replace(/\bpaint(?:Diverge|)Mode\b|\bsetPaintDivergeMode\b|\bSurfaceDivergeMode\b/g, '');
    expect(rendered, `${name}: "Diverge" is still rendered`).not.toMatch(/Diverge/);
  });

  it('still offers both modes by their own names', () => {
    expect(src).toMatch(/>Isolate</);
    expect(src).toMatch(/>Link</);
  });
});
