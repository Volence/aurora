// src/renderer/components/ui/fields.tsx
import React from 'react';
import { T } from './theme';

const base: React.CSSProperties = {
  background: T.raised, color: T.textHi, border: `1px solid ${T.border}`,
  borderRadius: T.rMd, fontSize: T.tSm, padding: `${T.s2} ${T.s3}`,
};

export function Select({ value, onChange, children, title, style }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
  title?: string; style?: React.CSSProperties;
}) {
  return (
    <select title={title} value={value} onChange={(e) => onChange(e.target.value)}
            style={{ ...base, ...style }}>{children}</select>
  );
}

/**
 * What a number box's raw text is worth: a number, or NOTHING.
 *
 * `Number('')` IS `0`, and that one coercion is the whole reason this function
 * exists. Every caller of `NumberField` treats the value it receives as a
 * number the author typed, so an emptied box used to arrive as a real, typed,
 * committed zero — select-all-and-delete, or a backspace on the way to
 * retyping, silently wrote 0 into `v_center`, a layer's screen line, a band's
 * static base. Guards downstream that tried to catch the empty box could not:
 * by the time they ran, the emptiness had already become a number.
 *
 * `undefined` means "there is no number in this text", which is not the same
 * claim as "the number is zero" and is not the same claim as `NaN` either —
 * see `NumberField`'s docblock for why a `NaN` would still have been written.
 *
 * WHITESPACE FIRST, because `Number(' ')` is also 0. Everything else that is
 * not a finite number — a lone `-`, a lone `.`, `1e`, `Infinity` — falls out of
 * the `Number.isFinite` check.
 */
export function parseNumberFieldText(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** The text a committed value is shown as. A non-finite value has no text. */
function numberFieldText(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

/**
 * A number box that REFUSES an empty one instead of committing a `0` for it.
 *
 * THE CONTRACT: `onChange` fires only for text that holds a finite number. Was
 * `onChange={(e) => onChange(Number(e.target.value))}`, which fired for every
 * keystroke including the ones with no number in them.
 * Empty, whitespace, a lone `-`, a lone `.` — nothing is committed at all, and
 * the caller's value stands untouched. There is no sentinel and no `NaN` to
 * handle: a call site that never hears from the box is a call site that cannot
 * corrupt its document from one.
 *
 * WHY NOT EMIT `NaN` AND LET EACH SITE REFUSE. Because most sites would not
 * have refused. `clampStaticBase`, `clampVCenter`, `clampVFactor`,
 * `clampLayerTop`, `clampVSplitAt` and `clampRateShift` all map a non-finite
 * input to a SUBSTITUTE NUMBER (their min, or a schema default) and commit it —
 * that is the right answer for a value arriving from a canvas drag or a file,
 * and exactly the wrong one for a box the author is halfway through retyping.
 * Emitting `NaN` would have moved the defect rather than fixed it, and left the
 * fix's correctness spread over a dozen call sites where the next one added
 * gets it wrong.
 *
 * WHY NOT A SENTINEL. A magic number every call site must recognise is a
 * contract enforced by memory: the site that forgets does not fail loudly, it
 * writes the sentinel into a document. Twelve sites today, and the thirteenth
 * is written by someone who never read this file.
 *
 * WHY NOT COMMIT-ON-BLUR, which is what `GridOriginField` (CanvasMode.tsx)
 * does. That contract also fixes this, and it fixes more besides — it collapses
 * a typed number into ONE undo entry, which is why that field has it. But it
 * changes WHEN every one of these boxes lands its value, including the spinner
 * arrows, which would appear inert until focus left the box. Aurora's suite has
 * no DOM: an interaction change across a dozen controls that cannot be verified
 * anywhere but on screen is not a change to make while fixing a data-corruption
 * bug. `GridOriginField` keeps its own contract for its own reason (an undo
 * snapshot there clones the whole pixel buffer); this is the smaller claim.
 *
 * WHY THE LOCAL TEXT: a controlled `<input>` cannot show an empty box while its
 * `value` prop is a number. Holding the text here is what lets the box be empty
 * without the document being 0.
 *
 * WHY THE TEXT IS NOT RESYNCED WHILE FOCUSED. A call site that clamps to a
 * NON-ZERO floor used to rewrite the box mid-keystroke: typing `2`, `5`, `0`
 * into "From tile" committed `2`, which clamped up to the first promotable slot
 * and came straight back as the input's `value`, so the next keystroke appended
 * to THAT. While the box has focus the text on screen is the author's own; the
 * document still updates on every keystroke that parses (nothing about when a
 * value commits has changed), and the box resyncs to whatever the document
 * really holds on blur.
 */
export function NumberField({ value, onChange, min, max, title, width = 48, refuse, onRefusal }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; title?: string; width?: number;
  /**
   * WHY THIS VALUE CANNOT BE WRITTEN, or null when it can — the REAL refusal.
   *
   * ⚠ `min`/`max` ABOVE ARE NOT A REFUSAL AND NEVER WERE. On
   * `<input type="number">` they govern the spinner arrows and the `:invalid`
   * pseudo-class and stop NO typed value: `min={3}` lets an author type 40112
   * and fires `onChange(40112)`. This repo has been bitten by exactly that —
   * EFFECTS-W1 defect 5, where a screen line of 40112 and a `Top 200 / Bot 100`
   * were both accepted in silence and became four build errors. So a caller
   * that means "this cannot be written" passes `refuse`; `min`/`max` stay for
   * the spinner's step behaviour only.
   *
   * When it returns a reason the value is NOT committed — `onChange` does not
   * fire — and `onRefusal` is called with the sentence so the caller can paint
   * it AT the control. The box keeps the author's text while they are typing
   * and resyncs to the document on blur, so the illegal number visibly snaps
   * back with the reason still on screen beside it.
   */
  refuse?: (v: number) => string | null;
  /** Called with the refusal sentence, or null when a value commits cleanly. */
  onRefusal?: (reason: string | null) => void;
}) {
  const [text, setText] = React.useState(() => numberFieldText(value));
  const [editing, setEditing] = React.useState(false);

  // Resync from the document — an undo, a drag on the canvas, a different
  // selection — but only when the author is not typing into this box.
  React.useEffect(() => {
    if (!editing) setText(numberFieldText(value));
  }, [value, editing]);

  return (
    <input type="number" title={title} value={text} min={min} max={max}
      onFocus={(e) => {
        setEditing(true);
        // SELECT ON FOCUS. Clicking a box holding `112` and typing `40` used to
        // commit `40112` — the caret landed where the pointer did and the digits
        // were INSERTED (walkthrough §a14; it produced Top 40112 / Bot 72128 and
        // no warning anywhere). Selecting makes the first keystroke replace,
        // which is what every author expects of a small numeric field and what
        // makes the refusal below a backstop rather than a daily obstacle.
        e.currentTarget.select();
        onRefusal?.(null);
      }}
      onBlur={() => { setEditing(false); setText(numberFieldText(value)); }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parseNumberFieldText(raw);
        if (n === undefined) return;
        const why = refuse?.(n) ?? null;
        onRefusal?.(why);
        if (why === null) onChange(n);
      }}
      style={{ ...base, width }} />
  );
}
