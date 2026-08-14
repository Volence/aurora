import React from 'react';
import PaletteGrid from '../art-shared/PaletteGrid';
import { useClassicPaletteGridPort } from '../../providers/palette-classic';

// The classic (Sonic 1) palette panel: the act's four CRAM lines in the ONE
// shared swatch grid (art-shared/PaletteGrid), over the classic port.
//
// It is a host and nothing else. Everything it used to hold itself — the grid,
// the selection, the draft word, the shared sliders — is the component both
// engines now render; everything classic-specific about it — that no line is
// locked, that index 0 explains itself instead of binding a brush, the gutter
// labels, the hint, the classicSetPalette write and the ART-facet claim that has
// to travel with it — is the port. Nothing was left in between.
//
// KEEP THE NAME AND THE PATH. Two facet columns mount `<ClassicPalettePanel />`
// by that literal (workspace/facets/s1-facets.tsx: the Palette facet's own
// section and the Art column's), and workspace/__tests__/facet-modules.test.ts
// asserts both by string.
//
// It no longer names a classic command, so it is no longer a COMMAND SITE — the
// classicSetPalette call (and with it the `classicSurfaceProps('art')` claim
// that routes Ctrl+Z to the zone-art document rather than the layout) moved into
// providers/palette-classic.ts, which classic-surface.test.ts now lists instead.

export default function ClassicPalettePanel(): React.ReactElement | null {
  const port = useClassicPaletteGridPort();
  // No act open ⇒ no lines ⇒ nothing to draw. The port reports it as an empty
  // grid rather than as a null of its own, so the hook order never varies.
  if (port.lines.length === 0) return null;
  return <PaletteGrid port={port} />;
}
