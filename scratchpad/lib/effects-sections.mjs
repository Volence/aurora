/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPENING AN EFFECTS SECTION, BY ITS ID AND NOT BY ITS NAME
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BGANIM-HARNESS-REPAIR, booked 2026-09-06:
 *
 *     "Eight harnesses select on UI wording the app retired, so they fail the
 *      moment anyone runs them."
 *
 * The wording that moved is the tile-animation vocabulary. EFFECTS-W1 defect 2
 * ruled that the two effects features get names sharing no word, so the
 * tile-animation side stopped saying "band"
 * (`src/renderer/components/effects/__tests__/band-vocabulary.test.ts` is the
 * gate). Two section titles moved with it, and the harnesses that opened those
 * sections by title went blind:
 *
 *     BgAnimBandPanel.tsx:457   title={`Tile animations (${budget.bands}/${budget.maxBands})`}
 *     BgAnimBandPanel.tsx:858   title="New tile animation"
 *
 * ⚠ AND A SECOND SHAPE MOVED THAT REPAIRING THE STRINGS WOULD NOT HAVE FIXED.
 * Those two sections now live behind a sub-tab (`EffectsSubTabBar.tsx`, the
 * d-26b `three_sub_tabs_plus_section_strip` ruling), and the facet arrives on
 * `parallax`. A tab that is not shown renders nothing, so on arrival the
 * tile-animation panel IS NOT IN THE DOM AT ALL - measured by
 * `scratchpad/o55-new-band-door-probe.mjs` row 2c. A harness that opened by
 * the CORRECT new title on the arrival tab would still get 'no-section'.
 *
 * ═══ WHY IDS AND ATTRIBUTES RATHER THAN THE NEW WORDS ═══
 *
 * Swapping `BG animation bands` for `Tile animations` repairs today and books
 * the same repair for the next vocabulary parcel. These sections already carry
 * stable machine names that the app itself routes on, so the harnesses can
 * select on those instead:
 *
 *     ui/CollapsibleSection.tsx   <div data-section={id} data-section-collapsed=…>
 *     effects/EffectsSubTabBar.tsx   <button role="tab" data-effects-sub-tab={id} aria-selected=…>
 *
 * Both attributes exist for exactly this: `CollapsibleSection`'s docblock says
 * they are there so `panel-overflow-harness.mjs` can tell an open section from
 * a shut one "without a scan for a rotated chevron that would break on the
 * next icon change". This module is that argument applied to the title too.
 * The ids are load-bearing in the app (`providers/effects-sub-tabs.ts` routes
 * on them, `revealEffectsSection` reveals by them), so a rename breaks the app
 * rather than silently breaking a harness.
 *
 * ⚠ WHAT THIS DOES NOT FIX. A harness that reads a CONTROL by its label still
 * selects on prose; only the two doors are handled here. And the collapsed
 * state read here is the app's own attribute, not a measurement of visibility:
 * a section reported open can still be scrolled out of the panel.
 */

/** The sub-tab that renders the tile-animation sections. `providers/effects-sub-tabs.ts`. */
export const TILE_ANIM_SUB_TAB = 'tileAnim';

/** The band list. `BgAnimBandPanel.tsx`, `<CollapsibleSection id="aeon.bganim.bands">`. */
export const SECTION_TILE_ANIMATIONS = 'aeon.bganim.bands';

/** The creation form. `BgAnimBandPanel.tsx`, `<CollapsibleSection id="aeon.bganim.new">`. */
export const SECTION_NEW_TILE_ANIMATION = 'aeon.bganim.new';

/**
 * Which sub-tab renders which section.
 *
 * SPELLED HERE AND ASSERTED AGAINST THE APP. This is a `.mjs` module and the
 * routing table is TypeScript, so it cannot be imported; `test/harness-effects-
 * selectors.test.ts` imports `EFFECTS_SUB_TABS` from the app and fails if this
 * map disagrees with it. A copy nothing compares is how a harness ends up
 * clicking a tab that no longer owns the section it wants.
 */
export const SECTION_SUB_TAB = {
  [SECTION_TILE_ANIMATIONS]: TILE_ANIM_SUB_TAB,
  [SECTION_NEW_TILE_ANIMATION]: TILE_ANIM_SUB_TAB,
};

/**
 * Activate an effects sub-tab. `'no-tab'` | `'already-active'` | `'clicked'`.
 *
 * `'no-tab'` is a real answer and not an error: an older build, or a facet the
 * caller never navigated to, has no tab bar. The caller decides.
 */
export const OPEN_EFFECTS_SUB_TAB = (tabId) => String.raw`
(() => {
  const b = document.querySelector('[data-effects-sub-tab=${JSON.stringify(tabId)}]');
  if (!b) return 'no-tab';
  if (b.getAttribute('aria-selected') === 'true') return 'already-active';
  b.click();
  return 'clicked';
})()`;

/**
 * Open a CollapsibleSection by id. `'no-section'` | `'already-open'` |
 * `'clicked'` - the same three words the hand-rolled title versions returned,
 * so a caller's branches do not have to change with its selector.
 *
 * The header is the section's first child (`CollapsibleSection.tsx`: the
 * `data-section` div wraps a header div carrying `onClick`, then the children
 * when open), and it is CLICKED rather than having its state written, because
 * a collapse is persisted through `savePanelState` and a harness that set the
 * attribute would be testing itself.
 */
export const OPEN_EFFECTS_SECTION = (sectionId) => String.raw`
(() => {
  const el = document.querySelector('[data-section=${JSON.stringify(sectionId)}]');
  if (!el) return 'no-section';
  if (el.getAttribute('data-section-collapsed') !== 'true') return 'already-open';
  if (!el.firstElementChild) return 'no-header';
  el.firstElementChild.click();
  return 'clicked';
})()`;

/**
 * THE WHOLE DOOR: activate the owning sub-tab, let React mount it, then open
 * the section. Returns the section result, with the tab result attached.
 *
 * ⚠ THE ORDER IS NOT INTERCHANGEABLE, and the app says so at
 * `providers/effects-sub-tabs.ts` (`revealEffectsSection`): "The tab switch has
 * to happen first ... a section on an inactive tab is not mounted". The wait
 * between them is why this is an async function rather than a third
 * expression: the section does not exist in the DOM on the line after the
 * click.
 *
 * `c` is the CDP wrapper every harness in this directory builds, needing only
 * `evalExpr`. `settleMs` is the caller's own wait; it is a parameter rather
 * than a constant here because these harnesses already tune their settles per
 * rig and a hidden one would fight them.
 */
export async function openEffectsSection(c, sectionId, { settleMs = 700 } = {}) {
  const tabId = SECTION_SUB_TAB[sectionId] ?? null;
  let tab = 'not-on-a-sub-tab';
  if (tabId !== null) {
    tab = await c.evalExpr(OPEN_EFFECTS_SUB_TAB(tabId));
    if (tab === 'clicked') await new Promise((r) => setTimeout(r, settleMs));
  }
  const section = await c.evalExpr(OPEN_EFFECTS_SECTION(sectionId));
  return { tab, section };
}
