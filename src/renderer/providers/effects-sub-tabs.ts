// THREE JOBS, THREE SUB-TABS — the owner's `three_sub_tabs_plus_section_strip`
// ruling (decisions.jsonl `d-26b-effects-tooling-shape-ANSWERED`), second half.
//
// ═══ WHAT WAS WRONG ═══
//
// The Effects tab was ONE scrolling column carrying every job this facet can do.
// Measured on the running app with every section open, at 1680x1050:
//
//     742px visible against 4,843px of content — 6.5 screens
//     the LAYERS list inside it: a 129px window (its section pinned at the
//     160px floor, because the column was over-subscribed before the list
//     was reached at all)
//
// The cold walkthrough (docs/reviews/2026-09-02-effects-cold-walkthrough.md)
// found the consequences: eleven cards with no index (§a8), a nineteen-screen
// list in one sixth of one screen (§a9), and — the expensive one — the word
// "band" reading as one feature across two unrelated ones because THEY WERE
// ADJACENT IN ONE LIST (§c1). The owner: "I don't know if having the tabs and
// stuff to the right is the correct tooling for it."
//
// ═══ THE TABLE IS THE POINT OF THIS FILE ═══
//
// Every `CollapsibleSection` in the Effects column belongs to EXACTLY ONE
// sub-tab, and this is where that is declared. It is not a comment and not a
// convention: `effects-sub-tabs.test.ts` walks the three panel modules for
// `id="aeon.…"` and requires the set to equal the union below, so a section
// added to a panel and not to a tab fails in node rather than becoming a
// control nobody can reach.
//
// ⚠ AND IT IS THE SEAM A REVEAL CROSSES. `revealPanel(id)` opens a section
// wherever it is mounted — but a section on an INACTIVE sub-tab is not mounted
// at all, so the reveal that made "I press add a band bank and idk where it is"
// work (providers/band-follow) would silently do nothing the moment the author
// was on Parallax. `revealEffectsSection` is the one door: it switches to the
// owning tab FIRST and then reveals. Nothing outside this module should call
// `revealPanel` with an effects section id.

import { revealPanel } from '../shell/panel-state';
import { useEditorStore } from '../state/editorStore';

/** The three jobs. `parallax` is the default — it is the one a scene needs. */
export type EffectsSubTabId = 'parallax' | 'colour' | 'tileAnim';

export interface EffectsSubTab {
  id: EffectsSubTabId;
  /** The word on the button. The owner's mockup names all three. */
  label: string;
  /**
   * What this tab is for, in one sentence, on the button's own `title`.
   *
   * The walkthrough's §a3 is "nine unfamiliar nouns and no orientation": the
   * tab bar is the first thing an author reads on this facet and is the
   * cheapest place in the product to say what the three jobs ARE.
   */
  blurb: string;
  /** The `CollapsibleSection` ids this tab renders, in column order. */
  sections: readonly string[];
}

/**
 * ⚠ THE TWO "BAND" FEATURES ARE ON DIFFERENT TABS, AND THAT IS THE DEFECT THIS
 * SHAPE FIXES. `aeon.effects.presets` (a range of SCREEN LINES over which CRAM
 * is repainted) is Colour; `aeon.bganim.bands` (a block of BACKGROUND TILES
 * with phase banks) is Tile anim. Wave 1 gave them names sharing no word; this
 * puts them where they can no longer be read as one list.
 */
export const EFFECTS_SUB_TABS: readonly EffectsSubTab[] = [
  {
    id: 'parallax',
    label: 'Parallax',
    blurb: 'How the background SCROLLS: the layers of one scene, their scroll factors, '
      + 'their drift, and which scene this section uses.',
    sections: ['aeon.effects.scenes', 'aeon.effects.layers', 'aeon.effects.scene',
      'aeon.effects.assign'],
  },
  {
    id: 'colour',
    label: 'Colour',
    blurb: 'RASTER BANDS: a range of screen lines over which the palette is repainted, '
      + 'plus its cycles and variants. Costs no tiles.',
    // `aeon.effects.preset.anchors` is the MOVING ANCHOR (ROADMAP row 95): a
    // patch channel's world-Y seed and its sweep. It is on Colour rather than
    // Parallax because it is a property of the raster PRESET document — the
    // same file as the bands, the cycles and the variants beside it — and not
    // of a scene's layers, however much "it moves" sounds like the scroll job.
    sections: ['aeon.effects.timeline', 'aeon.effects.presets', 'aeon.effects.preset.bands',
      'aeon.effects.preset.channels', 'aeon.effects.preset.anchors'],
  },
  {
    id: 'tileAnim',
    label: 'Tile anim',
    blurb: 'TILE ANIMATIONS: a block of background tiles with phase banks, DMA\'d over the '
      + 'same slots. Costs tile slots; four per act.',
    sections: ['aeon.bganim.bands', 'aeon.bganim.new'],
  },
];

/** The tab that renders this section, or null when no tab claims it. */
export function subTabOfSection(sectionId: string): EffectsSubTabId | null {
  for (const tab of EFFECTS_SUB_TABS) {
    if (tab.sections.includes(sectionId)) return tab.id;
  }
  return null;
}

/** The tab with this id, or null. */
export function effectsSubTab(id: EffectsSubTabId): EffectsSubTab | null {
  return EFFECTS_SUB_TABS.find((t) => t.id === id) ?? null;
}

/**
 * OPEN A SECTION AND MAKE IT REACHABLE — the sub-tab AND the disclosure.
 *
 * ⚠ THE ORDER MATTERS AND IS NOT INTERCHANGEABLE. The tab switch has to happen
 * first: `revealPanel` notifies the mounted sections, and a section on an
 * inactive tab is not mounted, so a reveal-then-switch would notify nothing and
 * the newly mounted section would read the (correct) persisted state anyway —
 * which works today and stops working the moment anything ELSE in the sequence
 * depends on the section existing. `band-follow` is exactly that case: it asks
 * the panel to scroll to a card that does not exist until both have run.
 *
 * Returns the tab it switched to, or null when the id belongs to no tab (in
 * which case it still reveals — a caller outside this facet is not this
 * module's business to refuse).
 */
export function revealEffectsSection(sectionId: string): EffectsSubTabId | null {
  const tab = subTabOfSection(sectionId);
  if (tab !== null) useEditorStore.getState().setEffectsSubTab(tab);
  revealPanel(sectionId);
  return tab;
}
