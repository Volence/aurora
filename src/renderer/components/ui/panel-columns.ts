// src/renderer/components/ui/panel-columns.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// EVERY SCROLLING `Panel` IN THE SHELL, BY NAME — THE CENSUS AN INSTRUMENT
// COUNTS AGAINST.
// ═══════════════════════════════════════════════════════════════════════════
//
// `Panel`'s own docblock explains why the inline axis is closed twice over
// (`overflowX: 'hidden'` plus an `onScroll` that snaps `scrollLeft` to 0): a
// `position: sticky` section strip rides the inline scroll, measured at 89px on
// a wheel gesture and 511px on a `Tab` focus jump. CLIPPING IS QUIETER THAN
// SCROLLING, so a child wider than its column no longer moves anything — it
// just goes invisible, and a truncated label looks like a short label.
//
// ⚠ THE DEFECT THIS FILE EXISTS FOR IS NOT THE CLIPPING. IT IS THAT ONLY ONE
// COLUMN WAS WATCHED. Row `[9a]` of `scratchpad/coldread-fixes-harness.mjs`
// fails on horizontal overflow in the EFFECTS column and nowhere else; the
// other columns clipped with nothing looking at them. A check that covers one
// column reads, in a report, exactly like a check that covers the shell.
//
// So the census is HERE, in source, and not in the harness: a run that reaches
// no columns at all must still be able to PRINT ALL OF THEM and say it reached
// none. "Could not look" and "looked and found nothing" are different answers,
// and a census derived from what happened to mount cannot tell them apart —
// it would report a green zero for a run that opened no project.
//
// HOW IT CANNOT DRIFT
// -------------------
//   1. `PanelColumnId` is the union of the keys below, and `Panel` REQUIRES a
//      `column` of that type whenever `scroll` is set. A sixteenth scrolling
//      column that names nothing does not compile, and `npm test` runs `tsc`.
//   2. `__tests__/panel-columns.test.ts` scans every `.tsx` under
//      `src/renderer` for `<Panel … scroll>` call sites and asserts the set of
//      ids it finds is EXACTLY the set of keys here — so a census entry for a
//      column that no longer exists is red too, not merely stale.
//   3. `owner` is checked against the file the call site was found in, so an
//      entry cannot describe one column while pointing at another.
//
// WHAT `reach` IS FOR
// -------------------
// A column is only measurable once something mounts it, and the columns need
// very different things first (an aeon checkout, an s1disasm checkout, an open
// document). `reach` is the author's own statement of what a runtime sweep must
// do to see this column — so `scratchpad/panel-overflow-harness.mjs` can name
// the reason a column was NOT measured instead of quietly omitting it, and so
// adding a column forces its author to answer the question.

/** What a runtime sweep has to do before this column exists in the DOM. */
export type PanelColumnReach =
  /** An aeon project is open and the tab's facet is `facet`. */
  | { readonly kind: 'aeon-facet'; readonly facet: string }
  /** A classic (s1disasm) project is open and the tab's facet is `facet`. */
  | { readonly kind: 's1-facet'; readonly facet: string }
  /** A whole-window editor mode, which needs a document of its own open. */
  | { readonly kind: 'mode'; readonly mode: 'sprite' | 'canvas' }
  /**
   * NOTHING MOUNTS IT. A `Panel` that is authored and exported but that no
   * import reaches, so no gesture in the running app can produce it. Carries
   * the symbol so the test beside this file can prove the claim rather than
   * take it: an entry that says `unmounted` and IS imported somewhere is red.
   */
  | { readonly kind: 'unmounted'; readonly symbol: string; readonly why: string };

export interface PanelColumnEntry {
  /** What a person would call this column. */
  readonly label: string;
  /** Path of the call site, relative to `src/renderer`. */
  readonly owner: string;
  readonly reach: PanelColumnReach;
}

/**
 * ⚠ KEYS ARE THE CONTRACT. The id is what `data-panel-column` carries into the
 * DOM, what `__dbg.panels()` reports, and what the harness prints — renaming
 * one renames a row in three places at once, which is the point.
 */
export const PANEL_COLUMNS = {
  'aeon-layout': {
    label: 'Layout (aeon)', owner: 'workspace/facets/layout-facet.tsx',
    reach: { kind: 'aeon-facet', facet: 'layout' },
  },
  'aeon-art': {
    label: 'Art (aeon)', owner: 'workspace/facets/art-facet.tsx',
    reach: { kind: 'aeon-facet', facet: 'art' },
  },
  'aeon-objects': {
    label: 'Objects (aeon)', owner: 'workspace/facets/objects-facet.tsx',
    reach: { kind: 'aeon-facet', facet: 'objects' },
  },
  'aeon-rings': {
    label: 'Rings (aeon)', owner: 'workspace/facets/rings-facet.tsx',
    reach: { kind: 'aeon-facet', facet: 'rings' },
  },
  'aeon-collision': {
    label: 'Collision (aeon)', owner: 'workspace/facets/collision-facet.tsx',
    reach: { kind: 'aeon-facet', facet: 'collision' },
  },
  'aeon-palette': {
    label: 'Palette (aeon)', owner: 'workspace/facets/palette-facet.tsx',
    reach: { kind: 'aeon-facet', facet: 'palette' },
  },
  'aeon-effects': {
    label: 'Effects (aeon)', owner: 'workspace/facets/effects-facet.tsx',
    reach: { kind: 'aeon-facet', facet: 'parallax' },
  },
  's1-layout': {
    label: 'Layout (classic)', owner: 'workspace/facets/s1-facets.tsx',
    reach: { kind: 's1-facet', facet: 'layout' },
  },
  's1-objects': {
    label: 'Objects (classic)', owner: 'workspace/facets/s1-facets.tsx',
    reach: { kind: 's1-facet', facet: 'objects' },
  },
  's1-palette': {
    label: 'Palette (classic)', owner: 'workspace/facets/s1-facets.tsx',
    reach: { kind: 's1-facet', facet: 'palette' },
  },
  's1-collision': {
    label: 'Collision (classic)', owner: 'workspace/facets/s1-facets.tsx',
    reach: { kind: 's1-facet', facet: 'collision' },
  },
  's1-art': {
    label: 'Art (classic)', owner: 'workspace/facets/s1-facets.tsx',
    reach: { kind: 's1-facet', facet: 'art' },
  },
  'sprite-mode': {
    label: 'Sprite mode', owner: 'components/sprite/SpriteMode.tsx',
    reach: { kind: 'mode', mode: 'sprite' },
  },
  'canvas-mode': {
    label: 'Canvas mode', owner: 'components/canvas/CanvasMode.tsx',
    reach: { kind: 'mode', mode: 'canvas' },
  },
  /**
   * ⚠ MEASURED 2026-09-06 AND IT SURPRISED ME: this one is DEAD.
   * `EffectsScenePanel.tsx` exports `EffectsPanels`, and the Effects facet
   * declares a `EffectsPanels` OF ITS OWN (`effects-facet.tsx:126`) which is the
   * one wired to `RightPanel`. Nothing imports the exported one, so this
   * fifteenth scrolling Panel cannot appear on anybody's screen. It is listed
   * rather than deleted because deleting it is a different parcel's call, and
   * because an entry that says so out loud makes the sweep's fifteenth row
   * honest instead of perpetually UNMEASURABLE for an unexplained reason.
   */
  'effects-scene-standalone': {
    label: 'Effects scene (standalone wrapper)',
    owner: 'components/effects/EffectsScenePanel.tsx',
    reach: {
      kind: 'unmounted', symbol: 'EffectsPanels',
      why: 'exported by EffectsScenePanel.tsx and imported by nobody; the Effects '
        + 'facet mounts its own same-named local component instead',
    },
  },
} as const satisfies Record<string, PanelColumnEntry>;

export type PanelColumnId = keyof typeof PANEL_COLUMNS;

export const PANEL_COLUMN_IDS = Object.keys(PANEL_COLUMNS) as readonly PanelColumnId[];

/** The DOM attribute every scrolling `Panel` stamps its id into. */
export const PANEL_COLUMN_ATTR = 'data-panel-column';
