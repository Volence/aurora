// THE EFFECTS COLUMN'S SHARED RHYTHM — one label column, one row, one hint.
//
// ═══ WHY THIS FILE EXISTS ═══
//
// The owner looked at OJZ act 1's banded canopy scene and said the right panel
// was "a bit messy" (ROADMAP item 41). Two panels draw that column —
// EffectsScenePanel and BgAnimBandPanel — and each carried its OWN private
// `row` and `label` style constants, near-identical but not the same object.
// Two copies of a shared column is one copy too many: the moment one panel's
// label width moves, the other's does not, and no test in this tree can see it.
// So the column's geometry is declared once, here, and both panels import it.
//
// ═══ THE LABEL COLUMN IS A MEASUREMENT, NOT A GUESS ═══
//
// `LABEL_W` was picked by measuring every label in the rendered column with a
// DOM Range (`scratchpad/effects-column-harness.mjs`, row r4), because
// `scrollWidth` is clamped to `clientWidth` for visible overflow and therefore
// cannot answer "is the column wide enough". Measured on the live aeon tree at
// 1680x1050, in px:
//
//     fa 10 · fb 11 · Cols 22 · Rows 27 · Name 32 · Driver 32 · world_y 38
//     V center 43 · From tile 46 · Precision 47 · Section 0 47 · Rate shift 49
//     Transition 52 · Banks 1-7 53 · Blank band 55
//
// `Precision` was REMOVED FROM THE PANEL by ROADMAP row 59 and is left in that
// list on purpose: the list is a MEASUREMENT, and quietly deleting a row from a
// measurement to match today's UI is how a record stops being evidence. It did
// not set LABEL_W (47 < 55), so nothing here needed re-measuring — which is the
// only reason this annotation is enough and a re-run is not.
//
// The widest is 55px, so 64 leaves 9px of headroom. The pre-pass value was 68,
// sized by the one label this pass removed: `#0 world_y` at 57px, which folded
// a layer INDEX into a field name. The index now titles the layer card.
//
// ═══ ⚠ AND THAT POPULATION WENT STALE — RE-MEASURED 2026-09-03 ═══
//
// THE LIST ABOVE IS FIFTEEN LABELS AND THE COLUMN HAD TWENTY-FOUR. A later
// parcel added `Plane B curve to` (84px) and `Plane B split at` (77px) to the
// layer card and did not re-run the measurement, so ten rows of the shipped
// scene wrapped onto two lines while this block still said "9px of headroom".
// The CONSTANT was never wrong; the POPULATION it was derived from stopped
// being the population on screen. That is the failure mode this section exists
// to make visible, and the annotation above — "nothing here needed
// re-measuring" — is exactly the reasoning that let it through a second time.
//
// ⚠ AND THE INSTRUMENT COULD NOT HAVE CAUGHT IT EITHER. `[r4]` measured a
// Range over the label, but a Range over an ALREADY-WRAPPED label returns the
// union of its line boxes, which is bounded by the column: `Plane B curve to`
// reported 42px while wanting 84. A re-derivation from that list would have
// confirmed the very width causing the wrap, with a clean-looking number, for
// ever. `[r4]` now reports the unwrapped width beside it and `[L2]` gates on
// LINE-BOX COUNT, so a wrap is counted rather than inferred from a width the
// wrap itself truncated (O50 triage, merge `ce23e3bf`).
//
// The full re-measured population, 1680x1050, dpr 1, every section OPEN so the
// collapsed ones are in it too (`effects-column-harness` `[r4]`/`[r7]`, run on
// the built tree; `[L2b]` gates all 52 rows):
//
//     Bob 21 · Drift 24 · Name 32 · Editing 37 · Layer 0-4 38 · Deform 40
//     V factor 40 · V offset 40 · Scene id 43 · V center 43 · B split at 45
//     Section 0 47 · V deform 48 · B curve to 52 · Transition 52 · Deform fg 53
//     Deform bg 56 · Screen line 57 · Plane A (fg) 59 · Plane B (bg) 62
//
// `Background` (69px) is measured but NOT in that list and does not size this
// column: it belongs to the Properties section, which draws its OWN 148px label
// column and is excluded by the harness's `FOREIGN_SECTIONS`. It is recorded
// here so the next reader does not "discover" it and widen the column for a
// label that was never in it.
//
// ═══ WHY 64 SURVIVED THE RE-DERIVATION — THE COLUMN IS ZERO-SUM ═══
//
// The widest label is now `Plane B (bg)` at 62px, so 64 leaves 2px. The two
// offenders were SHORTENED instead (`B curve to` / `B split at`,
// `providers/effects-aeon.ts`) and the constant did not move. That was a
// measured choice, not a conservative one:
//
//   THE COLUMN IS 300px AND EVERY PIXEL IS ZERO-SUM. A `<select style="flex:1">`
//   in one of these rows gets 190px. Whatever LABEL_W takes, it takes from
//   there — and unlike a label, a select does NOT wrap and does NOT overflow.
//   It ellipses, and `scrollWidth` is clamped, so nothing about the element
//   afterwards admits that anything was cut.
//
// The triage that found the wrap proposed `LABEL_W` 64 → 100 and measured it
// green on `effects-column-harness` 25/25. Run against the OTHER facet that
// shares this primitive, it breaks three controls the same day: at 100 the
// select falls to 154px, and `±16 px (32 px of travel)` (157px) and
// `8.53 s (512 ticks)` (159px) — both GENERATED ladder rungs — stop fitting,
// while `follow a world Y` goes from tight to hopeless. A width measured green
// on the harness that owns the constant, and red on the panel next door.
// `anchor-authoring-harness` `[W0]`/`[W1]`/`[W2]` is that second measurement
// and it did not exist until this parcel; the two must both be run before this
// number moves. Shortening two redundant labels cost nothing and taxed nobody:
// the row above them already reads `Plane B (bg)`.
//
// IT IS A FIXED WIDTH THAT WRAPS, NOT A FLOOR. It was a `minWidth` floor for
// one pass, on the argument that a label outgrowing the column would push its
// control right and trip the harness's [L1] row. That guard is FOREGROUND, and
// parcel D shipped `Plane A (foreground)` past it: the live app then drew the
// layer card's label column at three widths (68 / 111 / 114px) and the factor
// selects no longer lined up. A shared column that any one label can widen is
// not shared. So the label is `width: LABEL_W` with `whiteSpace: 'normal'`:
// every row is the same width by construction and a long label wraps at its
// spaces. What can still break the column is a single unbreakable token wider
// than it — `label-column-align.test.ts` pins every layer-card label's longest
// token to the bar the static labels above set, so that is caught in node,
// and there is deliberately no `overflowWrap`: a token that is too wide
// overflows visibly rather than splitting mid-word.
//
// ═══ ONE LABEL PER ROW ═══
//
// The half of "mixed label widths" that was actually wrong. Four rows in the
// old column packed two fields into one line — `[V center][box][V offset][box]`,
// `[Precision][select][Transition][select]` (row 59 has since retired
// `Precision` entirely, leaving `Transition` alone on its row),
// `[Cols][box][Rows][select]`, and a
// hint wedged between `From tile`'s box and its Promote chip. A second label
// mid-row sits at whatever x the first control happened to end at, so NO shared
// width can govern it: measured at 1680x1050 every FIRST label already agreed
// on 72px, and the column still read ragged. `Field` takes one label, and the
// harness's [L3] row counts label+control pairs per row to keep it that way.

import React from 'react';
import { T } from '../ui';

/**
 * The label column, in px. See the docblock — it is measured, and it is a FIXED
 * WIDTH THAT WRAPS, not a floor. (It read "it is a floor" here for three
 * parcels after it stopped being one; the docblock forty lines up spent a
 * paragraph on why a floor was wrong.)
 *
 * ⚠ ADDING A LABEL TO THIS COLUMN IS A MEASUREMENT, NOT A JUDGEMENT CALL, and
 * the last two that were added by eye both wrapped. Neither the node suite nor
 * a screenshot can settle it — ~6,535 vitest rows were green while ten rows of
 * the shipped scene drew on two lines, because the node bars are CHARACTER
 * counts (`effects-wording.test.ts` against the longest existing label,
 * `label-column-align.test.ts` against its longest TOKEN) and neither knows
 * what a pixel is. Before adding or rewording anything here, run BOTH:
 *
 *     npm run harness:effects-column      # [L2]/[L2b] the labels, [r4] the widths
 *     npm run harness:anchor-authoring    # [W1] the controls the labels pay for
 *
 * and paste the new `[r4]` line into the population above rather than
 * amending it from memory. Deleting a row from that list is forbidden; see the
 * `Precision` note.
 */
export const LABEL_W = 64;

/**
 * The gutter every hint, sub-row and card action lines up on: the label column
 * plus the row gap, so an explanatory line sits under the control it explains
 * rather than under its label. Derived from LABEL_W and the spacing token, so
 * moving the column moves everything that hangs off it.
 */
export const CONTROL_INSET = `calc(${LABEL_W}px + ${T.s2})`;

/** One row of the column: label gutter, control, nothing else. */
const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: T.s2, marginBottom: T.s2, minWidth: 0,
};

const LABEL: React.CSSProperties = {
  fontSize: T.tXs, color: T.textLo, width: LABEL_W, flexShrink: 0, whiteSpace: 'normal',
};

/** A hint, a readout, a refusal — the column's one non-label text tier. */
export const NOTE: React.CSSProperties = {
  fontSize: T.tXs, color: T.textLo, lineHeight: 1.5,
};
export const WARN: React.CSSProperties = { ...NOTE, color: T.warning };

/**
 * A labelled row.
 *
 * `children` is the CONTROL — one control, or one control plus the button that
 * acts on it. Anything that needs its own label needs its own `Field`.
 */
export function Field({ label, title, children, style }: {
  label: string; title?: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={style ? { ...ROW, ...style } : ROW}>
      <span style={LABEL} title={title}>{label}</span>
      {children}
    </div>
  );
}

/** An unlabelled row that still starts at the control column. */
export function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={style ? { ...ROW, ...style } : ROW}>{children}</div>;
}

/**
 * A line of explanation.
 *
 * `under` hangs it off the control column, which is where the eye already is
 * after reading the control it explains; without it the hint is a full-width
 * paragraph, which is right for anything addressing the whole section.
 */
export function Hint({ children, under = false, tone, style, testid }: {
  children: React.ReactNode; under?: boolean; tone?: 'warning'; style?: React.CSSProperties;
  /**
   * DECLARED, because a hyphenated JSX attribute on a COMPONENT is silently
   * dropped and TypeScript does not catch it.
   *
   * That is not hypothetical here: `data-testid` was passed straight to `<Hint>`
   * in EffectsScenePanel's row-remap block and never reached the DOM, so a
   * harness read zero nodes for sentences that were on screen (the panel's own
   * comment records it, and the workaround there was a wrapping `<span>`). A
   * span marks the TEXT; this marks the BLOCK, which is what anything measuring
   * a hint against the box it renders in has to address.
   */
  testid?: string;
}) {
  return (
    <div data-testid={testid} style={{
      ...(tone === 'warning' ? WARN : NOTE),
      marginBottom: T.s2,
      // ⚠ A HINT MUST NOT BE ABLE TO WIDEN THE COLUMN (cold read 2026-09-05,
      // C9). These sentences are full of `<code>` PATHS and generated symbol
      // names, and a path has no break opportunity. Measured in the running app
      // (`npm run harness:coldread-fixes` row 9a, 1400x872, dpr 1):
      // `data/editor/effects/presets/aurora_ramp_witness.json` rendered 286px
      // inside a 284px scrollport and pushed the panel's scrollWidth to 294 —
      // TEN PIXELS of horizontal scroll on a column whose sticky section strip
      // lives inside the same scroller. Ten pixels is enough to carry the
      // strip's ✓/✗ off the left edge: the two glyphs the strip exists to
      // publish, on a strip the in-app guide calls "always there, never
      // scrolls".
      //
      // ⚠⚠ IT IS NOT WHAT THE COLD READ BLAMED, and the difference is worth
      // keeping. That report attributed the 10px to the `cycles` <select>
      // ("294px wide because its widest option is …"). The select measures
      // 200px; the overflow is a `<code>` in the hint beneath it, found by the
      // harness's deepest-overflowing-node scan. The remedy is the same size
      // either way — but the width also scales with the PRESET ID, so the
      // defect appears and disappears as you select different presets, which is
      // how a first attempt at this fix measured itself green while doing
      // nothing (a short-id preset was selected and there was no overflow to
      // remove). Row 9a now selects the LONGEST id on purpose.
      //
      // ⚠ AND THIS FILE'S "deliberately no `overflowWrap`" RULE IS ABOUT THE
      // LABEL, NOT THIS. See the docblock's zero-sum section: a LABEL that is
      // too wide must overflow visibly rather than split mid-word, and
      // `label-column-align.test.ts` pins that. A `Hint` is prose, is not in
      // that column, and is pinned by nothing there — so wrapping it breaks no
      // rule this file holds. `anywhere` and not `break-word`, because
      // `break-word` still refuses to break a single unbreakable token when it
      // is the only thing on the line, which is this case exactly; and unlike
      // `break-all` it only breaks when a word would otherwise overflow, so
      // ordinary prose wraps at its spaces as before.
      overflowWrap: 'anywhere',
      ...(under ? { marginLeft: CONTROL_INSET } : {}),
      ...style,
    }}>{children}</div>
  );
}

/**
 * ═══ THE MESSAGES FOR A GROUP OF FIELDS, RENDERED AFTER THE WHOLE GROUP ═══
 *
 * UX seat A, F4. A seat filling a raster band set `Top`, tabbed, clicked `Bot`
 * at the position they had MEASURED, typed `72`, and got `12872`. Committing
 * `Top` had rendered an explanatory block inside the field group and moved the
 * panel below it by 120px: `S/H` went from y=704 to y=824, `addr` from 763 to
 * 883. They had aimed at a control that had moved.
 *
 * ⚠ THAT SEAT RAN A CONTROL BEFORE BELIEVING THEIR OWN DIAGNOSIS, and it is why
 * this component is about LAYOUT and nothing else. With the panel settled they
 * repeated the identical click and typed `72` again, and got `72`. So
 * click-selects-contents works and the bad value was not a difference between
 * the two boxes. Nothing here changes what a refusal SAYS: that seat quoted this
 * app's refusal approvingly at length (it named the value, the rule, the legal
 * range, WHY the range is what it is, and what the field still held, and clamped
 * nothing), and improving it was never the finding.
 *
 * WHAT THIS FIXES, EXACTLY. A message rendered between two boxes of a group can
 * move the second box under a hand already aimed at it. Rendered after the last
 * box of the group, it cannot move ANY of them: the group is rigid, and the
 * shape is `home/OpenByPath.tsx`'s, which landed the same night for the same
 * reason and put its refusal below the only control in its row.
 *
 * ⚠ AND THE RESIDUAL, NAMED RATHER THAN GLOSSED. Content BELOW the group still
 * moves, so a message about the last box of a group displaces whatever follows
 * it. Two alternatives close that and both are worse:
 *
 *   RESERVING the row's height costs 120px of blank column per field group in a
 *   ~300px column that already has cards below the fold, and these messages are
 *   long because they carry the rule and the committed-drift clause.
 *
 *   OVERLAYING it (absolute, out of flow) moves nothing and either eats the
 *   clicks meant for the control it covers, or - with pointer events off -
 *   paints an unclearable sentence over a `<select>` that has no focus handler
 *   to dismiss it.
 *
 * What is NOT an option is moving the message far from its field: a refusal the
 * author cannot see is a silent refusal, which is the defect the whole
 * refuse-at-the-control parcel exists to end. So the rule this component
 * encodes is "after the group, still beside it", and the residual is one
 * `<select>` moving after a refused edge rather than a number field taking an
 * appended value.
 *
 * `messages` takes nulls so the caller can hand over its whole slot in source
 * order without an `.filter()` at every call site; a group with nothing to say
 * renders nothing at all and occupies no height.
 */
export function GroupHints({ messages, tone, testid }: {
  messages: readonly (string | null)[];
  tone?: 'warning';
  testid?: string;
}): React.ReactElement | null {
  const live = messages.filter((m): m is string => m !== null && m !== '');
  if (live.length === 0) return null;
  return (
    <>
      {live.map((m, i) => (
        <Hint key={m} under tone={tone} testid={i === 0 ? testid : undefined}>{m}</Hint>
      ))}
    </>
  );
}

/**
 * The label on the disclosure. One string, so the harness and the app cannot
 * drift, and so nobody re-words it per surface.
 */
export const WHY_THIS_HAPPENS = 'Why this happens';

/**
 * AN ADVISORY THAT DOES NOT BURY THE FORM UNDER IT — ROADMAP O15.
 *
 * ⚠ THE SPLIT IS SEMANTIC, NEVER POSITIONAL, AND THAT IS THE WHOLE DESIGN.
 * `diagnosis` (what is wrong, and which layers) and `remedies` (what to do) are
 * ALWAYS on screen; only `mechanism` (why) is behind the disclosure, collapsed
 * by default. The remedies are LAST in the composed sentence, so a "show more"
 * that cut at a character count would hide exactly the part an author acts on —
 * which is why this component takes three fields and never one string to slice.
 * The provider returns them separately (`vsplitLockAdvisoryParts`); nothing here
 * decides where a sentence ends.
 *
 * Measured: the v_factor row's advisory was 21 wrapped lines / ~460px of a
 * ~1010px panel and pushed five controls below the fold
 * (`docs/reviews/2026-08-30-o15-advisory-shape.md`, capture
 * `scratchpad/shots-o15/before-1920x1080-panel.png`).
 *
 * ⚠ THE MECHANISM IS IN THE DOM WHILE COLLAPSED, hidden with `display: none`
 * rather than unmounted. That is deliberate — find-in-page still reaches it and
 * `aria-expanded` says what the button does — but it means `textContent` CANNOT
 * tell a working disclosure from a permanently hidden one. Every check on this
 * must measure `checkVisibility()` + `elementFromPoint`, never text;
 * `scratchpad/vsplit-advisory-harness.mjs` rows `[5e] [5f] [5g] [5h] [5i] [9e]`
 * are that check, and the packet's §4 is why they exist.
 *
 * ⚠ SCOPE, NAMED RATHER THAN SILENTLY WIDENED. The `Deform bg` hint is the next
 * longest block in the same panel and is clipped at the fold in the same
 * capture. It has the same shape problem and is NOT converted here — it is a
 * different sentence with a different owner, and O15's scope says so out loud.
 *
 * ═══ THE SCOPE WIDENED ONCE, AND ONLY WHERE A MEASUREMENT ASKED FOR IT ═══
 * (EW-LAYER-CARD-SCROLLER, `scratchpad/layer-card-height-harness.mjs`.)
 *
 * O15 was ruled on the SCENE surface, where a 460px advisory pushed five
 * controls below the fold. The layer cards have the same hazard in a much
 * smaller box, and it has a hard edge the scene form does not: their section is
 * `variant="list"`, so its body is only ever as tall as the column leaves it,
 * and the shell's floor (`SECTION_LIST_MIN_HEIGHT`) is a promise that it may be
 * squeezed that far. Floor minus that section's own header is therefore the
 * SMALLEST box any block in it can ever be given — 129px, measured — and a
 * paragraph taller than that is one no scroll position can show whole.
 *
 * Measured on the running app, 34 prose blocks in the layer cards: 32 at 49.5px
 * or 82.5px (89..165 chars) and TWO at 165px (333 and 355 chars), both the row
 * remap's. Those two are converted. Nothing else is, because nothing else is
 * over the bar, and converting a block that fits would buy a disclosure button
 * with no clipping to prevent.
 *
 * ═══ `mechanism` AND `remedies` ARE OPTIONAL, AND THAT IS NOT THE INVERSION ═══
 *
 * The O15 ruling is that a remedy which EXISTS may never be the half behind the
 * disclosure. It does not say every advisory has one. A precondition names an
 * input the document is missing and the control that supplies it is the row this
 * hint hangs off, so there is no separate sentence to print; an advisory whose
 * "why" is already inside its diagnosis has no second half to fold. Both cases
 * used to be spelled by passing `''`, which drew an empty paragraph and, worse,
 * a disclosure button with nothing behind it — a control that lies about having
 * something to show. Absent means absent: no button, no empty div.
 */
export function Advisory({ diagnosis, mechanism, remedies, under = false, testid }: {
  diagnosis: string;
  /** Why, in the engine's own terms. Omitted when the diagnosis already carries it. */
  mechanism?: string;
  /** What to do next. Omitted only when there is nothing to say, NEVER to shorten. */
  remedies?: string;
  under?: boolean;
  /**
   * Marks the WHOLE advisory, not one of its paragraphs.
   *
   * On the hint root on purpose: a harness measuring "is this advisory taller
   * than its box" must measure the block, and a testid on the diagnosis would
   * answer with one paragraph of it. `Hint` carries the prop for the same
   * reason its own comment in EffectsScenePanel gives — a `data-testid` passed
   * to a component that does not declare it is silently dropped, which is how a
   * harness once read zero nodes for sentences that were visibly on screen.
   */
  testid?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Hint under={under} tone="warning" testid={testid}>
      <div>{diagnosis}</div>
      {mechanism !== undefined && (
        <>
          <button
            type="button"
            aria-expanded={open}
            title={`${WHY_THIS_HAPPENS}: the mechanism behind this refusal`}
            onClick={() => setOpen((v) => !v)}
            style={WHY_BUTTON}
          >{open ? '▾' : '▸'} {WHY_THIS_HAPPENS}</button>
          {/*
            `display: none`, not `{open && …}` — see the docblock. The style is on
            the element that RENDERS the mechanism, so `checkVisibility()` on the
            node a text search finds is the answer, with no wrapper in between.
          */}
          <div style={{ display: open ? 'block' : 'none', marginBottom: T.s2 }}>{mechanism}</div>
        </>
      )}
      {remedies !== undefined && <div>{remedies}</div>}
    </Hint>
  );
}

/**
 * A text button, not a chip: it toggles a paragraph inside a hint, so it must
 * read as part of the hint's own tier rather than as a control in the form. The
 * colour is the warning tone it sits in, underlined so it is legibly a target.
 */
const WHY_BUTTON: React.CSSProperties = {
  display: 'inline-block',
  margin: `${T.s1} 0`,
  padding: 0,
  border: 'none',
  background: 'none',
  font: 'inherit',
  fontSize: T.tXs,
  color: T.warning,
  textDecoration: 'underline',
  textUnderlineOffset: 2,
  cursor: 'pointer',
};

/**
 * The one sub-level a section is allowed: a named group of fields inside it.
 *
 * NOT heading type. `panel-headings.test.ts` forbids a panel inside a titled
 * section from drawing bold+uppercase text, because that is `PanelHeader`'s
 * signature and a second one reads as a second section. A group label here is
 * ordinary text at the body tier, distinguished by colour — the same way the
 * type scale's docblock says this app's micro tiers are distinguished.
 */
export function Group({ label, note, children }: {
  label: string; note?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: T.s4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: T.s2, marginBottom: T.s2, minWidth: 0 }}>
        <span style={{ fontSize: T.tSm, color: T.textHi, flexShrink: 0 }}>{label}</span>
        {note !== undefined && <span style={{ ...NOTE, minWidth: 0 }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * A card in a data-driven list — a layer, a band.
 *
 * The border is what groups the rows; the rows inside it use the SAME label
 * column as the panel's own, so a card is a nested form rather than a
 * differently-shaped one.
 */
export function Card({ children, raised = false, selected = false, onClick, title, domId }: {
  children: React.ReactNode;
  raised?: boolean;
  /** Drawn with the accent border — the card the map's band lens is lighting. */
  selected?: boolean;
  /** Makes the card itself a target. Buttons inside still get their own clicks. */
  onClick?: () => void;
  title?: string;
  /**
   * A DOM id, so something outside this card can find it and scroll to it.
   *
   * The band cards had no ref, no id and no data attribute, which is why "take
   * me to the band I just made" had nothing to take anyone to (and why every
   * harness finds a card by reading its text). Optional — a card nobody needs
   * to address stays anonymous.
   */
  domId?: string;
}) {
  return (
    <div
      id={domId}
      onClick={onClick}
      title={title}
      style={{
        border: `1px solid ${selected ? T.accent : T.border}`, borderRadius: T.rMd,
        padding: `${T.s2} ${T.s2} 0`, marginBottom: T.s2,
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...(raised ? { background: T.raised } : {}),
      }}>{children}</div>
  );
}
