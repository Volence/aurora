// Palette facet — the level through a palette lens: view-only canvas, the
// single palette editor (spec §4) as the panel content, and the palette-LINE
// strip along the bottom.
//
// ---------------------------------------------------------------------------
// WHY THIS FACET STILL EXISTS, WHEN CLASSIC'S WAS DROPPED (stage-4 plan 5)
// ---------------------------------------------------------------------------
// Classic's `palette` facet was deleted because it was pixel-identical to its
// Art facet — same canvas, same column, same status bar, differing in `id`
// alone (see s1-facets.tsx). Aeon's was flagged for the same reason and it is
// NOT the same case, for one reason that survives contact with the code:
//
//   THE CANVAS IS THE LEVEL. Aeon's Art facet puts the same PaletteEditor next
//   to the COMPOSER, so a recolour is judged against the 128px chunk you happen
//   to have open. Here it is judged against the act. Those are different jobs,
//   and the second one is the reason level editors have a palette screen at all
//   — a Genesis palette line is shared by everything drawn with it, so "did that
//   change break anything?" is a question only the level can answer.
//
// The case AGAINST it was that it gave you strictly LESS than Art did: one tool,
// no option bar, a 110px swatch grid in a 270px column with ~700px of dead space
// under it. (The reviewed screenshot also read as having no RGB editor — that
// part is not so: PaletteEditor's R/G/B channel sliders appear on swatch
// selection, and the shot simply had no swatch selected.)
//
// So it keeps the grant and gains the thing Art cannot have:
//
//   `BottomExtra: PaletteViewer` — the PAL LINE strip. `selectedPaletteLine` is
//   what the MAP and the ArtBrowser preview tiles through, so on this facet
//   picking a line and editing that line's colours are finally one screen, with
//   the act repainting under both. On the Art facet the same strip would be
//   driving a line the composer canvas does not read (it renders each cell
//   through the line stored IN the cell), which is why Layout and this facet are
//   the only two that mount it.
//
// STILL OPEN, and step-H shaped: the dead space under the editor, and whether
// this facet and Art's palette section should be one component with two hosts.

import React from 'react';
import PaletteEditor from '../../components/art/PaletteEditor';
import PaletteViewer from '../../components/PaletteViewer';
import { Panel, CollapsibleSection } from '../../components/ui';
import { mapFacet, type FacetModule } from '../facet-registry';

function PalettePanels() {
  return (
    <Panel width={280} scroll>
      <CollapsibleSection id="palette.editor" title="Palette">
        <PaletteEditor />
      </CollapsibleSection>
    </Panel>
  );
}

export const paletteFacet: FacetModule = mapFacet('palette', {
  RightPanel: PalettePanels,
  BottomExtra: PaletteViewer,
});
