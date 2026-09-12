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
 *
 * ═══ ⚠ NOT ONE OF THESE REPAIRS HAS BEEN RUN. FOREGROUND WORK, TAGGED ═══
 *
 * The repair landed from a background agent worktree, which has no
 * `node_modules/.bin/electron` at all, and a harness that appears to run from
 * one may in fact be driving the MAIN checkout's `dist/` rather than the tree
 * under test. So every claim behind this module is STATIC: the strings and ids
 * were read out of `src/`, `test/harness-effects-selectors.test.ts` asserts
 * they still agree with it, and nothing was watched on screen.
 *
 * A foreground seat should run, against a tree built with
 * `VITE_AURORA_DEBUG=1 npm run build`:
 *
 *     npm run harness:bganim-band                     (the row's named harness)
 *     npm run harness:bganim-rate-shift
 *     npm run harness:bganim-ui-authored-composition
 *     npm run harness:band-art-foreground
 *     npm run harness:bganim-insert-roomy
 *     npm run harness:effects-column                  (its `nobands` plant)
 *     node scratchpad/band-trunk-demo.mjs
 *     node scratchpad/fromtile-typing-probe.mjs
 *
 * A PASS IS NOT "IT EXITED 0". Read the instrument-check rows: `2b` in the
 * first three must report the panel's own headings ON SCREEN (`Tile
 * animations`, `New tile animation`), which is the row that goes red if the
 * door did not open; `openEffectsSection` must return `section: 'clicked'` or
 * `'already-open'` and never `'no-section'`, and `tab` must never be
 * `'no-tab'`. For `effects-column`, the `nobands` plant must report
 * `planted: removed "Tile animations (n/m)"` rather than `no-bands-section` -
 * it had been silently removing nothing, so its row was asserting against an
 * unplanted column. `fromtile-typing-probe`'s docblock records a dead end
 * measured while this selector was wrong; that dead end is unverified until
 * the probe is run again.
 */

/** The sub-tab that renders the tile-animation sections. `providers/effects-sub-tabs.ts`. */
export const TILE_ANIM_SUB_TAB = 'tileAnim';

/** The scroll job's tab, and the facet's arrival tab. `providers/effects-sub-tabs.ts`. */
export const PARALLAX_SUB_TAB = 'parallax';

/** The band list. `BgAnimBandPanel.tsx`, `<CollapsibleSection id="aeon.bganim.bands">`. */
export const SECTION_TILE_ANIMATIONS = 'aeon.bganim.bands';

/** The creation form. `BgAnimBandPanel.tsx`, `<CollapsibleSection id="aeon.bganim.new">`. */
export const SECTION_NEW_TILE_ANIMATION = 'aeon.bganim.new';

/**
 * The SCENE FORM — `v_factor`, `v_offset`, the deform attachments, the name.
 * `EffectsScenePanel.tsx`, `<CollapsibleSection id="aeon.effects.scene">`.
 *
 * ⚠ THE SECOND INSTANCE OF THIS MODULE'S OWN DEFECT, and it cost two rigs their
 * whole measurement. `effects-deform-harness` and `vsplit-advisory-harness` each
 * carried a private copy of a title-based opener:
 *
 *     [...document.querySelectorAll('div')]
 *       .filter((d) => d.style && d.style.cursor === 'pointer'
 *                   && /^SCENE\s*—/i.test((d.innerText || '').trim()))[0]
 *
 * That needle — `SCENE` followed by an EM DASH — died on 2026-09-05 in
 * `24541886` ("dash sweep (effects panels): the last 85, and two assertions
 * moved with them"), which gave every effects section header a colon. The
 * header reads `Scene: <id>` today, so the opener returned `'no-scene-header'`,
 * the form stayed shut, and every control inside it was absent. Neither rig
 * reached the round trip it exists for; `effects-deform` went as far as
 * throwing `wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build` at a
 * build that was correct.
 *
 * ⚠ AND THE TITLE IS NOT A FIXED STRING AT ALL: the call site composes it as
 * `` `Scene: ${selected.id}` ``, so it changes with the document under test.
 * There is nothing here for a harness to type. The id is.
 */
export const SECTION_SCENE_FORM = 'aeon.effects.scene';

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
  [SECTION_SCENE_FORM]: PARALLAX_SUB_TAB,
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

/** The app's own answer to "is this section open?": `'true' | 'false' | 'absent'`. */
export const SECTION_COLLAPSED_ATTR = (sectionId) => String.raw`
(() => {
  const el = document.querySelector('[data-section=${JSON.stringify(sectionId)}]');
  return el === null ? 'absent' : String(el.getAttribute('data-section-collapsed'));
})()`;

/**
 * THE DOOR, WITH A VERDICT ON IT — `{ tab, section, collapsed, ok, why }`.
 *
 * `ok` is the APP's own `data-section-collapsed`, read back AFTER the click,
 * and not the click's return value: a header whose handler was removed still
 * takes a click, and `openEffectsSection` would still answer `'clicked'`.
 *
 * ⚠ IT RETURNS RATHER THAN THROWS SO A CALLER CAN MAKE IT A ROW. A door that
 * can only throw gives its harness a row that cannot fail — success and failure
 * emitting the same artifact, which is the defect class this whole module
 * exists inside. Callers with a row check `ok` and then stop; callers without
 * one (a re-open deeper in a run) use `openEffectsSectionOrThrow` below.
 */
export async function openEffectsSectionState(c, sectionId, { settleMs = 700 } = {}) {
  const r = await openEffectsSection(c, sectionId, { settleMs });
  await new Promise((res) => setTimeout(res, settleMs));
  const collapsed = await c.evalExpr(SECTION_COLLAPSED_ATTR(sectionId));
  const tabWanted = String(SECTION_SUB_TAB[sectionId] ?? 'none');
  let why = null;
  if (r.section === 'no-section' || collapsed === 'absent') {
    why = `AIM MISSED: no [data-section=${JSON.stringify(sectionId)}] in the DOM `
      + `(sub-tab ${JSON.stringify(tabWanted)} -> ${r.tab}). Nothing below this point can measure `
      + 'what it was written to measure.';
  } else if (collapsed !== 'false') {
    why = `AIM MISSED: [data-section=${JSON.stringify(sectionId)}] is still collapsed after `
      + `${r.section} (data-section-collapsed=${JSON.stringify(collapsed)}). The header took the `
      + 'click and the section did not open.';
  }
  return { ...r, collapsed, ok: why === null, why };
}

/**
 * THE SAME DOOR, BUT IT REFUSES TO REPORT A MISS AS A CLOSED SECTION.
 *
 * ⚠ WHY THIS EXISTS RATHER THAN THE CALLERS EACH CHECKING. The defect this
 * module was written for is an opener that silently finds nothing, and
 * `openEffectsSection` still hands `'no-section'` back as an ordinary value —
 * correct for a caller that wants to branch on it, and exactly the shape that
 * let `effects-deform-harness` carry on past a shut form and then blame the
 * BUILD for controls that were merely unmounted. A caller that has no branch
 * for a miss should not have to invent one.
 *
 * It re-reads `data-section-collapsed` AFTER the click and throws unless the
 * app itself says the section is open. That is a different claim from "the
 * click returned 'clicked'": a header whose handler was removed still takes a
 * click. Returns `{ tab, section, collapsed }` for the caller's row to print.
 *
 * NOT a visibility measurement — the section can be open and scrolled out of
 * the panel (this module's own docblock says so). It is the door, not the view.
 */
export async function openEffectsSectionOrThrow(c, sectionId, { settleMs = 700 } = {}) {
  const r = await openEffectsSectionState(c, sectionId, { settleMs });
  if (!r.ok) {
    throw new Error(`${r.why} The run stops here rather than reporting the section's contents `
      + 'as missing from the app.');
  }
  return r;
}
