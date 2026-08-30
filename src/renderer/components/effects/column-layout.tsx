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

/** The label column, in px. See the docblock — it is measured, and it is a floor. */
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
