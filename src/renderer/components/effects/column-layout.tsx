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
// The widest is 55px, so 64 leaves 9px of headroom. The pre-pass value was 68,
// sized by the one label this pass removed: `#0 world_y` at 57px, which folded
// a layer INDEX into a field name. The index now titles the layer card.
//
// IT IS A FLOOR (`minWidth`), NOT A FIXED WIDTH, and that is deliberate: a
// label that outgrows the column pushes its own control right, which the
// harness's [L1] row sees as a second distinct column width and fails on. A
// hard `width` would instead wrap or clip the label silently. A guard that
// fires beats a layout that lies.
//
// ═══ ONE LABEL PER ROW ═══
//
// The half of "mixed label widths" that was actually wrong. Four rows in the
// old column packed two fields into one line — `[V center][box][V offset][box]`,
// `[Precision][select][Transition][select]`, `[Cols][box][Rows][select]`, and a
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
  fontSize: T.tXs, color: T.textLo, minWidth: LABEL_W, flexShrink: 0,
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
export function Card({ children, raised = false }: { children: React.ReactNode; raised?: boolean }) {
  return (
    <div style={{
      border: `1px solid ${T.border}`, borderRadius: T.rMd,
      padding: `${T.s2} ${T.s2} 0`, marginBottom: T.s2,
      ...(raised ? { background: T.raised } : {}),
    }}>{children}</div>
  );
}
