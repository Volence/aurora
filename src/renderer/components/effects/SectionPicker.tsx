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
  threadedSections, ownPresetSections, boundSections, sectionExtraChannelsCondition,
  extraChannelsAdvisory, type WiringCondition,
} from '../../../core/formats/effects/section-wiring';

/**
 * WHAT AN UNMET CONDITION MEANS RIGHT NOW, which decides how it may be drawn.
 *
 * `limit`    nothing is bound to this section, so nothing is broken and nothing
 *            will be refused. The condition states what the LEVEL DATA does not
 *            carry yet.
 * `refused`  this section binds a raster preset, so aeon's gate fires on exactly
 *            this condition and the build will refuse what is here now.
 */
type UnmetMeaning = 'limit' | 'refused';

/**
 * ONE CONDITION, ONE ROW — a mark, a name, and what the mark is about.
 *
 * ⚠ THE THIRD MARK IS NOT A FAILURE. `unknown` draws `?` in the faint tier and
 * says which file could not be read, because `raster-binding.ts`'s standing
 * refusal turns on exactly that: a row that read `✗` because a file was missing
 * is indistinguishable, to the author, from one that reads `✗` because the thing
 * is impossible.
 *
 * ═══ AND THE FOURTH MARK, FOR THE SAME REASON ONE LAYER OUT (C1) ═══
 *
 * The cold read of 2026-09-05 opened this tab on a project it had not touched
 * and met `✗ threaded` (C1): *"a red ✗ on an untouched document reads as 'you
 * broke it'"*, two minutes lost before the paragraph beside it resolved it.
 *
 * ⚠ THE VERDICT WAS CORRECT. Section 0 genuinely cannot carry an editor-authored
 * raster band until aeon threads it. What was wrong is that a fact about the
 * LEVEL DATA was drawn in the vocabulary of DAMAGE: `✗` is right/wrong, and
 * `T.warning` is the tier this app uses for something going wrong. Neither is
 * true of a section nobody has wired yet, and nothing on the row said whose fact
 * it was, so the only reading left was that the reader had caused it.
 *
 * ⚠⚠ AND THE FIX IS NOT "MAKE IT QUIETER", which would trade one wrong reading
 * for a worse one. The distinction that has to survive is aeon's gate:
 *
 *   nothing bound here     an unmet condition is a LIMIT. The build is green.
 *                          It says what you cannot author here until aeon adds
 *                          one line. Drawn `☐` in `T.info`: an unticked box,
 *                          the informational tier, NOT the alarm tier.
 *   a rasterRef bound      an unmet condition is a REFUSAL. `effects_seam_gate`
 *                          fires by name on this section. Drawn `✗` in
 *                          `T.warning`, exactly as before.
 *
 * That is ONE predicate (`section.rasterRef !== null`) and it is aeon's own
 * trigger, not a mood: the gate reads the sidecar's `rasterRef` and says nothing
 * about a section that has none. So the alarm tier now means what it says, and
 * the case it exists for keeps it — condition 3 can only ever read `no` when a
 * document IS bound (with none, `sectionExtraChannelsCondition` answers `yes`),
 * so the cold read's D-A, the ✓✓ that reached a build error, still draws `✗` in
 * `T.warning` with no special case anywhere.
 *
 * ⚠ ZERO HEIGHT AND ZERO WIDTH, measured, because this strip is PERMANENT.
 *
 * `☐` U+2610 IS CHOSEN ON A MEASUREMENT, not on taste. None of these marks is
 * in JetBrains Mono, so each is laid out at whatever advance its fallback face
 * gives it, and the difference comes straight out of a detail column that is
 * already ellipsis-clipped. Canvas `measureText` at 10px in the strip's own
 * font stack: `✗` 6px, `☐` 6px, `✓` 6.83px, `?` 5px, and the ring `○` 10px.
 * The first candidate WAS `○`; it cost 3.9px, which was enough to eat the `1)`
 * off `nothing threads ojz_act1_sec_raster(sec: 1)` at the 272px width, the one
 * part of that sentence a reader needs. `☐` is `✗`'s advance to the pixel, so
 * nothing moves, and an unticked box says "not filled in yet" in a way a cross
 * cannot. The alternative considered and
 * rejected was a caption framing what the three marks ask (the guide's own
 * "can this section carry a band?"). It is not free in either axis: measured in
 * the running app at 1680x1050, the rows' inner width is 272px to 287px and the
 * detail column is ALREADY ellipsis-clipped on most rows (225px wanted into
 * 201.6px on section 1's row 3, 255px into 229.2px on section 5's row 2), so a
 * caption gutter comes straight out of text that is truncating; and a caption
 * LINE is ~15px of a strip that already stands at 147.53px of a 742px column.
 * The meaning of each mark is on the mark's own `title` instead, which costs
 * neither.
 */
function ConditionRow({ n, label, cond, title, unmet }: {
  n: number; label: string; cond: WiringCondition; title: string;
  /** What a `no` on THIS row means today. See `UnmetMeaning`. */
  unmet: UnmetMeaning;
}) {
  const refused = cond.verdict === 'no' && unmet === 'refused';
  const mark = cond.verdict === 'yes' ? '✓'
    : cond.verdict === 'unknown' ? '?'
      : refused ? '✗' : '☐';
  const colour = cond.verdict === 'yes' ? T.success
    : cond.verdict === 'unknown' ? T.textFaint
      : refused ? T.warning : T.info;
  // WHAT THE GLYPH MEANS, ON THE GLYPH. The row's own `title` is about the
  // CONDITION; this is about the MARK, and putting it here is the only place a
  // reader who is puzzled by the mark will actually point at.
  const markTitle = cond.verdict === 'yes' ? 'This condition is met.'
    : cond.verdict === 'unknown'
      ? 'Not a no: one of aeon\'s two files could not be read, so this condition could not be '
        + 'answered either way. The detail says which file.'
      : refused
        ? 'This section BINDS a raster preset and this condition is not met, so aeon\'s build '
          + 'refuses it by name. The paragraph below says what to ask a programmer for.'
        : 'Not yet, and not something you did: aeon\'s level data does not carry this. Nothing '
          + 'is bound to this section, so nothing is broken and no build is refused. It is what '
          + 'you cannot author here until aeon adds it.';
  return (
    <div
      data-effects-wiring-condition={String(n)}
      data-effects-wiring-verdict={refused ? 'refused' : cond.verdict}
      title={title}
      style={{
        display: 'flex', gap: T.s2, alignItems: 'baseline',
        fontSize: T.t2xs, lineHeight: 1.4, minWidth: 0,
      }}>
      <span title={markTitle}
        style={{ color: colour, fontFamily: T.fontMono, flexShrink: 0 }}>{mark}</span>
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

  // THE THREE CONDITIONS, APART. Not one chip: which of the three a section
  // fails decides whether the author asks for a preset split, for one line of
  // aeon on the raster chooser, or for one line on a DIFFERENT chooser — and a
  // single word cannot say which. See section-wiring.ts.
  const cond = sectionWiringConditions(act.rasterWiring, activeSectionIndex, chooser);

  // CONDITION 3 IS ABOUT A PAIR — this section AND the document it binds today
  // — because which choosers a section owes is a function of that document's
  // KEYS (aeon `effects_gen.document_channels`). The cold read's D-A: section 5
  // showed ✓✓ and the build still refused, because the preset it bound carried
  // `cycles` and nothing threads `ojz_act1_sec_cycle(sec: 5)`.
  const boundPreset = section?.rasterRef ?? null;
  const boundDoc = boundPreset === null ? null
    : (useProjectStore.getState().project?.effectsPresets.presets
        .find((p) => p.id === boundPreset) ?? null);
  const extra = sectionExtraChannelsCondition(
    act.rasterWiring, activeSectionIndex, boundDoc, zoneId, act.id, boundPreset);
  const extraAdvisory = extraChannelsAdvisory(
    extra.gaps, activeSectionIndex, boundPreset, act.rasterWiring.bindings[activeSectionIndex]);

  // ⚠ AEON'S OWN TRIGGER, NOT A MOOD (C1 — see ConditionRow's docblock).
  // `effects_seam_gate` fires on a section whose sidecar names a `rasterRef`;
  // it says nothing at all about a section that has none. So with nothing
  // bound, an unmet condition is a LIMIT on what can be authored here, and with
  // something bound the SAME condition is a refusal of what is here now. One
  // predicate, read from the section rather than from which row is asking.
  const unmet: UnmetMeaning = boundPreset === null ? 'limit' : 'refused';

  // Derived, per act, from aeon's own files — never a list in this repository.
  // ⚠ EACH SET IS DERIVED FROM ITS OWN CONDITION. `eligibleSections` folds in
  // library-readability and would print `own preset none` beside a condition row
  // reading `✓ own preset OJZ_Preset_Sec0` — see ownPresetSections' docblock.
  const threaded = threadedSections(act.rasterWiring, act.sections.length);
  const own = ownPresetSections(act.rasterWiring, act.sections.length, chooser);
  // THE COLD READ'S D-B. `threaded 5,6` was read as "5 and 6 are available";
  // both already carried a preset, so every home the strip named was occupied.
  // This set is Aurora's OWN files (`section.rasterRef`) and not aeon's, which
  // is why it takes the sections and never the wiring parse — see
  // `boundSections`' docblock for that, and for why it is a set on this line
  // rather than a fourth condition row.
  const bound = boundSections(act.sections);

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
          title="Both per-section bindings on this tab (the scene, under LAYERS, and the raster
            preset, at the bottom of RASTER BAND PRESETS) act on THIS section. It is the same
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
                {`Section ${i}${s === null ? ' (empty)' : ''}`}
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
            <>This section is empty: nothing is bound to it.</>
          ) : (
            <>
              scene <code style={{ color: T.textHi }}>{section.sceneRef ?? 'act default'}</code>
              {' · '}
              raster <code style={{ color: T.textHi }}>{section.rasterRef ?? 'hand-authored'}</code>
            </>
          )}
        </div>

        {/* THE THREE CONDITIONS, SEPARATELY AND NEVER COLLAPSED. Each carries
            its own full advisory on `title`, so the paragraphs below are context
            and not the only place the reason exists.

            ⚠ THE THIRD ROW EXISTS BECAUSE THE FIRST TWO WERE A LIE TOGETHER.
            ✓✓ read as "you can bind a raster band here" and the build refused
            anyway the moment the bound preset also carried `cycles` — the cold
            read's D-A. Three rows is more surface on a panel already called
            confusing, and that cost was weighed: a verdict that is wrong is
            worse than a verdict that is long. */}
        <ConditionRow n={1} label="own preset" cond={cond.ownPreset} unmet={unmet}
          title={`CONDITION 1 of 3: a section can carry an editor-authored raster band only if it `
            + `binds a preset record NO OTHER SECTION binds. Threading a section-keyed band into a `
            + `shared record would give every section that shares it the same band, and aeon's `
            + `build refuses that by name. Read from the act descriptor on every load.`
            + (advisory ? `\n\n${advisory}` : '')} />
        <ConditionRow n={2} label="threaded" cond={cond.threaded} unmet={unmet}
          title={`CONDITION 2 of 3: some preset() in the game's effects library must actually pass `
            + `${chooser}(sec: N) to its raster: channel. Without it the generator emits the binding `
            + `row and nothing reads it, which presents to the author as an assignment that did `
            + `nothing. That is one line in aeon. Read from the effects library on every load.`
            + (advisory ? `\n\n${advisory}` : '')} />
        <ConditionRow n={3} label="its channels" cond={extra} unmet={unmet}
          title={`CONDITION 3 of 3: one rasterRef binds the WHOLE preset document (aeon ruling Q1), `
            + `so every OTHER key it carries (cycles, variants, patch_world_ys, patch_motion) owes `
            + `its OWN generated chooser at this section's preset(), beside the raster one. This row `
            + `is about the document bound here TODAY: change the binding and it re-derives. `
            + `Conditions 1 and 2 can both be ✓ and this one ✗, which is exactly the case that `
            + `reached a build error after Aurora had said yes.`
            + (extraAdvisory ? `\n\n${extraAdvisory}` : '')} />

        {/* THE SETS, NOT A SENTENCE ABOUT THE SETS. Which sections can carry a
            raster band is a property of the LEVEL DATA and is re-derived on
            every load; printing it here means an author can see the answer
            change when aeon changes the level, instead of reading a number
            somebody wrote down.

            ⚠ THE THIRD SET IS NOT A THIRD CONDITION. `own preset` and
            `threaded` are conditions 1 and 2 act-wide, out of aeon's two files;
            `bound` is out of Aurora's OWN sidecars and answers a different
            question — not "can a band go here" but "is something already
            here". It is here because the cold read's D-B is exactly the gap
            between those two questions: `threaded 5,6` was read as "5 and 6 are
            available" while both were occupied, and the reader had no route to
            a green build. A set in this line's own grammar costs no row; the
            CONSEQUENCE of taking an occupied section is stated at the control
            that takes it (`rebindOrphanNotice`, under the Section dropdown in
            RASTER BAND PRESETS), because that is where it is charged.

            ⚠ THE LINE IS STILL GATED ON THE DESCRIPTOR, deliberately: with it
            unreadable the two aeon sets are not printed at all, so there is no
            false impression to correct, and `bound` alone under an `act:` label
            would read as a statement about wiring. Nothing is lost — the
            rebind notice reads no aeon file and is unaffected. */}
        {act.rasterWiring.descriptor.parsed && (
          <div style={{ fontSize: T.t2xs, color: T.textFaint, fontFamily: T.fontMono }}
            data-effects-act-sets=""
            title={'Three act-wide sets, each derived from its own question.\n\n'
              + 'own preset: the sections whose aeon preset RECORD no other section shares '
              + '(condition 1).\n'
              + `threaded: the sections some preset() passes ${chooser}(sec: N) to (condition 2).\n`
              + 'bound: the sections whose sidecar ALREADY NAMES a raster preset document. '
              + 'This one is Aurora\'s own file, not aeon\'s, and it is here because the first '
              + 'two sets say where a band CAN go and say nothing about what is already '
              + 'there. A section in all three is occupied: binding here replaces its '
              + 'incumbent, and if nothing else names that document aeon refuses the build '
              + 'for it. The paragraph at the Section dropdown, under RASTER BAND PRESETS, '
              + 'says so at the control.'}>
            {`act: own preset ${own.length === 0 ? 'none' : own.join(',')}`}
            {act.rasterWiring.library.parsed
              ? ` · threaded ${threaded.length === 0 ? 'none' : threaded.join(',')}`
              : ' · threaded ?'}
            {/* THE SEPARATOR IS ITS OWN NODE so the set's own string BEGINS
                with its label. `scripts/check-guide-text.mjs` verifies a label
                the guide quotes against a leading chunk of the string that
                renders it, and ` · bound ` leads with punctuation, which is
                unverifiable by construction. The two sets above are held by
                their ConditionRow labels instead; this one has no row. */}
            {' · '}
            {`bound ${bound.length === 0 ? 'none' : bound.join(',')}`}
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
          it in the sticky box cost 200px of a 742px column.

          ⚠ THE SAME PREDICATE AS THE MARKS ABOVE, and it has to be, or the two
          surfaces say different things about one fact. This paragraph is 107px
          of arrival screen (measured, 1680x1050, section 0) and it was the
          LOUDEST thing the cold read met: a quiet `☐` over a full-width orange
          block is not a fix, it is a contradiction. Not one word of it changes
          — the cold read credits this text with resolving C1 — only the tier
          it is drawn in, which now tracks whether a build is actually refused.
          Its `warning` tone is unchanged the moment a rasterRef is bound. */}
      {advisory !== null && (
        <div data-effects-section-advisory=""
          data-effects-advisory-tone={state !== 'unknown' && unmet === 'refused' ? 'warning' : 'note'}
          style={{ padding: `${T.s2} ${T.s3} 0` }}>
          <Hint tone={state !== 'unknown' && unmet === 'refused' ? 'warning' : undefined}
            style={{ marginBottom: T.s2 }}>
            {advisory}
          </Hint>
        </div>
      )}

      {/* CONDITION 3'S REMEDY, IN ITS OWN PARAGRAPH AND NOT APPENDED TO THE ONE
          ABOVE. The two are about different things and can both be live: the
          first says what is wrong with the SECTION, this says what is missing
          for the DOCUMENT bound to it, and it spells the exact `preset()`
          argument to write — copied from aeon's own `prescription`, whose rule
          is that a gate must never prescribe a spelling nobody can write.
          `whiteSpace: pre-wrap` because the remedy is a bulleted list and a
          collapsed one runs the chooser calls together. */}
      {extraAdvisory !== null && (
        <div data-effects-section-channel-advisory=""
          style={{ padding: `${T.s2} ${T.s3} 0` }}>
          <Hint tone="warning" style={{ marginBottom: T.s2, whiteSpace: 'pre-wrap' }}>
            {extraAdvisory}
          </Hint>
        </div>
      )}
    </>
  );
}
