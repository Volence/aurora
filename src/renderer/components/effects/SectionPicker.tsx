// WHICH SECTION AM I EDITING, AND WHAT IS IT BOUND TO. (EFFECTS-W1 defect 4;
// EW-SHAPE-STRIP, the owner's `three_sub_tabs_plus_section_strip` ruling.)
//
// ═══ WHAT WAS WRONG ═══
//
// This tab has TWO per-section bindings — `SECTION ASSIGNMENT` for the scene and
// the `Section <n>` select at the bottom of `RASTER BAND PRESETS` for the raster
// preset — and they sit ~1,600px apart in one 300px column. Both act on "the
// active section", which was set on a DIFFERENT TAB and named nowhere here.
//
// The cold reader spent eight minutes editing scene `ojz_act1_depth` before
// discovering that the section he was on used `ojz_act1_start` (§a18), and could
// not bind another section without leaving for the Layout tab and coming back —
// which nothing said (§a19, §d6).
//
// ═══ WHY IT IS AT THE TOP, AND NOT BESIDE EITHER BINDING ═══
//
// Because it is about BOTH of them. A picker next to the scene binding would
// leave the raster binding far away silently following it; one next to the
// raster binding would do the same to the scene. The single number both controls
// read (`editorStore.activeSectionIndex`) is a property of the whole column, so
// it is stated once, first, and never collapsed — a `CollapsibleSection` renders
// no children while shut, and an author who collapsed this would be back where
// they started.
//
// ═══ WHY IT IS STICKY, AND WHAT THAT FIXED — MEASURED, NOT ASSUMED ═══
//
// Wave 1 put this first in the column and stopped there. "First in the column"
// and "he can see it" are different claims, and the second one was false.
// Measured in the running app (`scratchpad/effects-strip-delta-probe.mjs`,
// 1680x1050, aeon `cb0e5eb1`), with every section of the column open:
//
//     column        742px visible against 3,483px of content
//     at the raster binding  — the very control this caption is about —
//                   the picker's box sat at top = -1,496px
//     scrolled to the bottom
//                   top = -2,635px
//
// ⚠ AND `checkVisibility()` RETURNED **true** AND `getClientRects().length` WAS
// **1** AT BOTH OF THOSE POSITIONS. An element scrolled 2,635px out of its own
// scroll container passes the whole standard paint trio except a strict
// `elementFromPoint`, which returned `null`. Anything asserting this strip's
// permanence must compare its rect against the SCROLLER'S OWN BOX; a
// `checkVisibility()` row would have gone green on the defect.
//
// `position: sticky` on a DIRECT child of the scrolling `Panel` is what makes
// the fact permanent, which is why this component renders a FRAGMENT of two
// siblings rather than one box: sticky resolves against the nearest scrollport,
// so a sticky element nested inside a non-scrolling wrapper would stick to the
// wrapper and scroll away with it.
//
// ═══ WHAT IS PERMANENT AND WHAT IS NOT, AND WHY THAT LINE IS THERE ═══
//
// PERMANENT (the sticky strip): the section, its two bindings, and the TWO
// WIRING CONDITIONS as two rows. The whole strip is ~100px of a 742px column;
// the pre-strip box was 200px, most of it the advisory paragraph, and a
// permanent header costing 27% of the column is a different defect.
//
// NOT PERMANENT (the sibling below it, still first in the scrolling flow, still
// never collapsed): the paragraph that says what to ASK A PROGRAMMER FOR. It is
// two sentences of context on a fact the strip already states, and the strip's
// condition rows carry it verbatim on `title`.
//
// ⚠ IT WRITES THE SAME STORE VALUE THE LAYOUT TAB WRITES. There is no second
// notion of "the section being looked at" — the two-sources-of-truth defect this
// column has already met once (ROADMAP item 43). Changing it here and changing
// it on the Layout tab are the same act, which is exactly why this is a picker
// and not a display.

import React from 'react';
import { T, Select } from '../ui';
import { Field, Hint } from './column-layout';
import { useProjectStore, getActiveLevel, getCurrentZone } from '../../state/projectStore';
import { useEditorStore } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import {
  sectionRasterState, sectionRasterAdvisory, rasterChooserName, sectionWiringConditions,
  threadedSections, ownPresetSections, type WiringCondition,
} from '../../../core/formats/effects/section-wiring';

/**
 * ONE CONDITION, ONE ROW — a mark, a name, and what the mark is about.
 *
 * ⚠ THE THIRD MARK IS NOT A FAILURE. `unknown` draws `?` in the faint tier and
 * says which file could not be read, because `raster-binding.ts`'s standing
 * refusal turns on exactly that: a row that read `✗` because a file was missing
 * is indistinguishable, to the author, from one that reads `✗` because the thing
 * is impossible.
 */
function ConditionRow({ n, label, cond, title }: {
  n: number; label: string; cond: WiringCondition; title: string;
}) {
  const mark = cond.verdict === 'yes' ? '✓' : cond.verdict === 'no' ? '✗' : '?';
  const colour = cond.verdict === 'yes' ? T.success
    : cond.verdict === 'no' ? T.warning : T.textFaint;
  return (
    <div
      data-effects-wiring-condition={String(n)}
      title={title}
      style={{
        display: 'flex', gap: T.s2, alignItems: 'baseline',
        fontSize: T.t2xs, lineHeight: 1.4, minWidth: 0,
      }}>
      <span style={{ color: colour, fontFamily: T.fontMono, flexShrink: 0 }}>{mark}</span>
      <span style={{ color: T.textLo, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: T.textFaint, fontFamily: T.fontMono, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{cond.detail}</span>
    </div>
  );
}

export default function SectionPicker({ children }: {
  /**
   * THE LAST ROW OF THE STICKY BOX — the sub-tab bar, and nothing else today.
   *
   * ⚠ IT IS A SLOT AND NOT AN IMPORT so that this component keeps knowing
   * nothing about the three jobs: the strip is about WHICH SECTION, the bar is
   * about WHICH JOB, and folding one into the other's module is how a permanent
   * header starts collecting rows. What it buys is the one thing a sibling
   * cannot have — permanence — for the reason `EffectsSubTabBar`'s own docblock
   * gives: two sticky siblings at `top: 0` occupy the same 0.
   */
  children?: React.ReactNode;
} = {}): React.ReactElement | null {
  useHistoryVersion();
  useProjectStore((s) => s.project);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const setActiveSectionIndex = useEditorStore((s) => s.setActiveSectionIndex);
  const level = getActiveLevel(useProjectStore.getState());
  const act = level?.act ?? null;
  if (act === null) return null;
  const zoneId = getCurrentZone(useProjectStore.getState())?.id ?? '';
  const chooser = rasterChooserName(zoneId, act.id);

  const section = act.sections[activeSectionIndex] ?? null;
  const state = sectionRasterState(act.rasterWiring, activeSectionIndex);
  const advisory = sectionRasterAdvisory(act.rasterWiring, activeSectionIndex, chooser);

  // THE TWO CONDITIONS, APART. Not one chip: which of the two a section fails
  // decides whether the author asks for a preset split or for one line of aeon,
  // and a single word cannot say which. See section-wiring.ts.
  const cond = sectionWiringConditions(act.rasterWiring, activeSectionIndex, chooser);

  // Derived, per act, from aeon's own files — never a list in this repository.
  // ⚠ EACH SET IS DERIVED FROM ITS OWN CONDITION. `eligibleSections` folds in
  // library-readability and would print `own preset none` beside a condition row
  // reading `✓ own preset OJZ_Preset_Sec0` — see ownPresetSections' docblock.
  const threaded = threadedSections(act.rasterWiring, act.sections.length);
  const own = ownPresetSections(act.rasterWiring, act.sections.length, chooser);

  return (
    <>
      {/* THE PERMANENT STRIP. `sticky` against the Panel's scrollport — see the
          docblock for the measurement that made this necessary and for why it
          is a direct child of the Panel rather than a box inside one. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 3,
        background: T.void, borderBottom: `1px solid ${T.borderStrong}`,
        padding: `${T.s3} ${T.s3} ${T.s2}`,
        display: 'flex', flexDirection: 'column', gap: T.s1, flexShrink: 0,
      }} data-effects-section-picker="" data-effects-section-strip="">
        {/* `Editing`, not `Editing section` — the shared label column is 64px
            (column-layout.tsx measures why) and the longer string wraps to two
            lines, spending ~14px of a PERMANENT strip on a word the control
            beside it already says: the option reads `Section 0`. */}
        <Field label="Editing"
          title="Both per-section bindings on this tab — the scene, under LAYERS, and the raster
            preset, at the bottom of RASTER BAND PRESETS — act on THIS section. It is the same
            number the Layout tab's SECTIONS grid sets."
          style={{ marginBottom: 0 }}>
          <Select
            title="The section both bindings on this tab act on."
            value={String(activeSectionIndex)}
            style={{ flex: 1, minWidth: 0 }}
            onChange={(v) => setActiveSectionIndex(Number(v))}>
            {act.sections.map((s, i) => (
              // AN EMPTY SECTION IS OFFERED AND LABELLED, not hidden. An act's
              // grid can carry holes, and a picker that silently skipped them
              // would renumber the world for the reader.
              <option key={i} value={String(i)}>
                {`Section ${i}${s === null ? ' — empty' : ''}`}
              </option>
            ))}
          </Select>
        </Field>

        {/* THE SENTENCE THE WALKTHROUGH ASKED FOR, in the terms of the two
            bindings it is about: what this section uses today, said once, at the
            top, so eight minutes cannot be spent editing a scene the section does
            not use. Both refs are read from the SECTION, not from either panel's
            selection — those are different questions and reading the wrong one is
            the defect this states away. */}
        <div style={{ fontSize: T.tXs, color: T.textBase, lineHeight: 1.45 }}
          data-effects-section-bindings="">
          {section === null ? (
            <>This section is empty — nothing is bound to it.</>
          ) : (
            <>
              scene <code style={{ color: T.textHi }}>{section.sceneRef ?? 'act default'}</code>
              {' · '}
              raster <code style={{ color: T.textHi }}>{section.rasterRef ?? 'hand-authored'}</code>
            </>
          )}
        </div>

        {/* THE TWO CONDITIONS, SEPARATELY AND NEVER COLLAPSED. Both carry the
            full advisory on `title`, so the paragraph below is context and not
            the only place the reason exists. */}
        <ConditionRow n={1} label="own preset" cond={cond.ownPreset}
          title={`CONDITION 1 of 2 — a section can carry an editor-authored raster band only if it `
            + `binds a preset record NO OTHER SECTION binds. Threading a section-keyed band into a `
            + `shared record would give every section that shares it the same band, and aeon's `
            + `build refuses that by name. Read from the act descriptor on every load.`
            + (advisory ? `\n\n${advisory}` : '')} />
        <ConditionRow n={2} label="threaded" cond={cond.threaded}
          title={`CONDITION 2 of 2 — some preset() in the game's effects library must actually pass `
            + `${chooser}(sec: N) to its raster: channel. Without it the generator emits the binding `
            + `row and nothing reads it, which presents to the author as an assignment that did `
            + `nothing. That is one line in aeon. Read from the effects library on every load.`
            + (advisory ? `\n\n${advisory}` : '')} />

        {/* THE SETS, NOT A SENTENCE ABOUT THE SETS — and the same two facts the
            two rows above state, act-wide. Which sections can carry a raster
            band is a property of the LEVEL DATA and is re-derived on every load;
            printing it here means an author can see the answer change when aeon
            changes the level, instead of reading a number somebody wrote down. */}
        {act.rasterWiring.descriptor.parsed && (
          <div style={{ fontSize: T.t2xs, color: T.textFaint, fontFamily: T.fontMono }}
            data-effects-act-sets="">
            {`act: own preset ${own.length === 0 ? 'none' : own.join(',')}`}
            {act.rasterWiring.library.parsed
              ? ` · threaded ${threaded.length === 0 ? 'none' : threaded.join(',')}`
              : ' · threaded ?'}
          </div>
        )}

        {/* THE SUB-TAB BAR, LAST IN THE PERMANENT BOX. See the prop's docblock:
            it is here because permanence has exactly one mechanism in this
            column and it is the `sticky` above. */}
        {children}
      </div>

      {/* WHAT TO ASK A PROGRAMMER FOR — first in the scrolling flow, directly
          under the strip, never collapsed, and NOT sticky. It is context on a
          fact the strip already states permanently, and it is 5 lines: keeping
          it in the sticky box cost 200px of a 742px column. */}
      {advisory !== null && (
        <div data-effects-section-advisory=""
          style={{ padding: `${T.s2} ${T.s3} 0` }}>
          <Hint tone={state === 'unknown' ? undefined : 'warning'} style={{ marginBottom: T.s2 }}>
            {advisory}
          </Hint>
        </div>
      )}
    </>
  );
}
