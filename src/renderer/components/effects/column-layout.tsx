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
export function Hint({ children, under = false, tone, style }: {
  children: React.ReactNode; under?: boolean; tone?: 'warning'; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      ...(tone === 'warning' ? WARN : NOTE),
      marginBottom: T.s2,
      ...(under ? { marginLeft: CONTROL_INSET } : {}),
      ...style,
    }}>{children}</div>
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
 */
export function Advisory({ diagnosis, mechanism, remedies, under = false }: {
  diagnosis: string; mechanism: string; remedies: string; under?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Hint under={under} tone="warning">
      <div>{diagnosis}</div>
      <button
        type="button"
        aria-expanded={open}
        title={`${WHY_THIS_HAPPENS} — the mechanism behind this refusal`}
        onClick={() => setOpen((v) => !v)}
        style={WHY_BUTTON}
      >{open ? '▾' : '▸'} {WHY_THIS_HAPPENS}</button>
      {/*
        `display: none`, not `{open && …}` — see the docblock. The style is on
        the element that RENDERS the mechanism, so `checkVisibility()` on the
        node a text search finds is the answer, with no wrapper in between.
      */}
      <div style={{ display: open ? 'block' : 'none', marginBottom: T.s2 }}>{mechanism}</div>
      <div>{remedies}</div>
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
