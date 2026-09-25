// Donors facet: the donor-level page (S2-DONOR-PAGE, project REGIONS).
//
// The owner, aeon session 2026-09-17T16:00:34Z: "we convert the levels to our
// format, but then I load them on a page and can marquee parts of it, copy it
// over to our layout, and paste it in as a region or something."
//
// A CANVAS SWAP, NOT A LENS: the canvas is a converted donor zone (aeon's
// derived `games/sonic4/data/donors/<donor>/<ZONE>/` tree) above the clip act it
// is pasted into, neither of which is the act MapViewport draws. So this module
// supplies its own Canvas and no tool dock: its gestures are the canvas's own
// (drag marquees, right-drag pans, wheel zooms), and no EditorTool means
// anything here. Plan: docs/superpowers/plans/2026-09-25-s2-donor-page.md.

import type { FacetModule } from '../facet-registry';
import DonorsCanvas from '../../components/donors/DonorsCanvas';
import DonorsPanel from '../../components/donors/DonorsPanel';

export const donorsFacet: FacetModule = {
  id: 'donors',
  Canvas: DonorsCanvas,
  RightPanel: DonorsPanel,
};
