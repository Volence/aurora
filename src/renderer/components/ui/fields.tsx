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
 * A REFUSAL THAT CANNOT READ AS "NOTHING CHANGED" (cold read 2026-09-05, C8).
 *
 * ═══ THE DEFECT ═══
 *
 * With `Top = 40`, the cold reader clicked Top and typed `250`. The panel said:
 *
 *   > Top: 250 is not a screen line — … Refused; **Top is still 25.**
 *
 * Note *25*, not *40*. This field commits per keystroke, so `2` and `25` were
 * each legal on their own and each LANDED; only `250` was refused. The sentence
 * is literally true and reads to a human as "nothing changed" — while the value
 * they had actually set is gone, replaced by a prefix of the number they were
 * halfway through typing. Anyone typing a three-digit line hits it.
 *
 * ═══ WHY THE CLAUSE IS BUILT HERE AND NOT IN THE PROVIDER ═══
 *
 * ⚠ ONLY THIS COMPONENT KNOWS THE FACT. The provider's `refuse` callback is
 * handed one number and the document; it cannot tell a refusal that follows a
 * partial commit from one that follows no commit at all, so a provider-side
 * sentence would have to be either always-on (and often false — a single
 * illegal keystroke over a legal value really does change nothing) or invented.
 * This field knows both halves: what the document held when focus arrived, and
 * whether IT committed anything since. So the clause is added exactly when it is
 * true, and is silent otherwise.
 *
 * It also lands only on `NumberField` refusals. The same `Refused; X is still N`
 * shape is produced for `Select`-backed controls in `effects-preset.ts`, where
 * there is no per-keystroke commit and the sentence would be a lie of its own.
 *
 * ═══ WHY NOT COMMIT-ON-BLUR, WHICH WOULD DELETE THE DEFECT ═══
 *
 * MEASURED, not assumed — see this file's `NumberField` docblock for the
 * original argument and `docs/reviews/2026-09-05-coldread-fixes.md` for the
 * count. 45 usages across 5 files; two of them (`BgAnimBandPanel`'s candidate
 * fields, which tint `MapViewport` live, and `ObjectInspector`'s X/Y, which move
 * the marker) depend on the commit landing as you type. And the registered
 * harness `scratchpad/numberfield-empty-harness.mjs` asserts the property
 * commit-on-blur would remove, naming it in its own words at check `4a`:
 *
 *   > the spinner arrow still moves the value immediately, without blurring …
 *   > This is the behaviour commit-on-blur would have cost, and the stated
 *   > reason the parcel did not choose it
 *
 * plus four `type()`-then-assert-`commits` rows in `number-field-empty.test.ts`
 * that never blur. Commit-on-blur lands RED on all of them. A correct narrow fix
 * beats a broad one that lands red, so the timing is unchanged and the WORDING
 * is what is fixed.
 */
export function refusalWithCommittedDrift(
  why: string, heldAtFocus: number | null, holdsNow: number, committedSinceFocus: number,
): string {
  const drift = committedDriftParts(heldAtFocus, holdsNow, committedSinceFocus);
  if (drift === null) return why;
  return `${why} ${drift.finding} ${drift.mechanism} ${drift.remedies}`;
}

/**
 * THE SAME CLAUSE IN THE THREE HALVES `Advisory` TAKES, or null when it does not
 * apply.
 *
 * ⚠ THE SPLIT IS NOT COSMETIC, AND THE STRING FORM IS COMPOSED FROM IT. Appended
 * to a provider's own refusal this tail roughly doubles the block, and on the
 * effects layer cards that pushed the whole paragraph to 280px inside a scroller
 * 129px tall: a block no scroll position shows whole, which is the bar
 * `Advisory`'s docblock (EW-LAYER-CARD-SCROLLER) already converts prose for. A
 * caller with room paints `refusalWithCommittedDrift`; a caller in a small box
 * paints these three, and both are the same words because one is built out of the
 * other. Two hand-kept copies would drift apart with neither being wrong alone.
 *
 * WHICH HALF IS WHICH, and why it is not a free choice: `finding` is what
 * happened to THIS author's document and can never be folded; `remedies` is what
 * to do about it and O15 forbids folding a remedy that exists; `mechanism` is the
 * why, which is exactly what O15 says may go behind a disclosure.
 */
export function committedDriftParts(
  heldAtFocus: number | null, holdsNow: number, committedSinceFocus: number,
): { finding: string; mechanism: string; remedies: string } | null {
  if (committedSinceFocus === 0) return null;
  if (heldAtFocus === null || !Number.isFinite(heldAtFocus)) return null;
  if (heldAtFocus === holdsNow) return null;
  return {
    finding: `⚠ AND IT HAS ALREADY MOVED: this box held ${heldAtFocus} when you clicked into `
      + `it, and now holds ${holdsNow}.`,
    mechanism: 'It commits on every keystroke, so a shorter number that is '
      + 'legal on its own lands on the way to a longer one.',
    remedies: 'Retype the whole value, or undo.',
  };
}

/**
 * THE FACTS BEHIND A `NumberField` REFUSAL, handed to `onRefusal` beside the
 * sentence.
 *
 * ⚠ FACTS, NEVER PROSE. A caller that must paint the refusal in more than one
 * block (an `Advisory` with a disclosure, say) needs the provider's own halves
 * and the drift's own halves, and it cannot get them by cutting up the composed
 * string: slicing prose at a character count is how a "show more" hides the half
 * an author acts on. So this carries the four numbers the sentence was built
 * from, and the caller calls the same parts functions the composition did.
 *
 * `value` is the number that was REFUSED, so a caller can re-derive the
 * provider's halves from the same input `refuse` saw.
 */
export type NumberFieldRefusalDetail = {
  /** The value that was refused: what `refuse` was called with. */
  value: number;
  /** What the document held when focus arrived, or null when this box has not been focused. */
  heldAtFocus: number | null;
  /** What the document holds now. */
  holdsNow: number;
  /** How many values THIS box has landed since focus arrived. */
  committedSinceFocus: number;
};

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
export function NumberField({ value, onChange, min, max, step, title, width = 48, refuse, onRefusal }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; title?: string; width?: number;
  /**
   * The spinner arrows' increment. `<input type="number">` defaults it to `1`
   * and — because a browser SNAPS to a multiple of the step — one press on a
   * fractional value jumps to a whole number: `0.125` becomes `1`. Every field
   * in this app was an integer until the drift row, which is authored in
   * px/frame over a ⅛..6 corpus, so it passes its own.
   *
   * LIKE `min`/`max`, THIS IS NOT A REFUSAL. It governs the arrows and
   * `:invalid`; a typed value that is not a multiple of it still fires
   * `onChange`. `refuse` is the only thing that withholds a commit.
   */
  step?: number;
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
  /**
   * Called with the refusal sentence, or null when a value commits cleanly.
   *
   * The second argument carries the FACTS that sentence was composed from, for a
   * caller that must paint it in more than one block. It is absent on the null
   * call and on every caller that never reads it, which is all of them but the
   * row-remap plane line: adding an argument nobody is obliged to take is what
   * kept this change off the other call sites.
   */
  onRefusal?: (reason: string | null, detail?: NumberFieldRefusalDetail) => void;
}) {
  const [text, setText] = React.useState(() => numberFieldText(value));
  const [editing, setEditing] = React.useState(false);
  // WHAT THE DOCUMENT HELD WHEN FOCUS ARRIVED, and how many values THIS BOX has
  // landed since — the two halves of `refusalWithCommittedDrift`, and the only
  // place in the app that can know either. A ref and not state: they are read
  // inside the very handler that would set them, and a re-render for them would
  // be a render per keystroke for a fact nothing draws.
  const focusState = React.useRef<{ held: number | null; commits: number }>(
    { held: null, commits: 0 });
  // IS THE CLICK IN FLIGHT THE ONE THAT BROUGHT THIS BOX INTO FOCUS? Armed on
  // `mousedown`, read on `mouseup`, and the whole reason is in the two handlers
  // at the bottom of this component. A ref and not state for the reason above:
  // it is written and read inside the same gesture, and nothing draws it.
  const focusingClick = React.useRef(false);
  // A RE-SELECT THE FOCUSING CLICK SCHEDULED FOR AFTER ITSELF, or null. The
  // `onClick` block below is the whole derivation; this is the handle that lets
  // a blur or an unmount cancel one that has not run yet.
  const reselect = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelReselect = (): void => {
    if (reselect.current === null) return;
    clearTimeout(reselect.current);
    reselect.current = null;
  };
  // A field unmounted between the click and the task it queued would otherwise
  // leave a timer holding a detached input. Nothing draws this; it is hygiene
  // with a real referent.
  React.useEffect(() => cancelReselect, []);

  // Resync from the document — an undo, a drag on the canvas, a different
  // selection — but only when the author is not typing into this box.
  React.useEffect(() => {
    if (!editing) setText(numberFieldText(value));
  }, [value, editing]);

  return (
    <input type="number" title={title} value={text} min={min} max={max} step={step}
      /**
       * ═══ THE SELECT-ON-FOCUS THAT DID NOT STICK ═══
       *
       * `onFocus` below has called `select()` since EFFECTS-W1 defect 5, and it
       * was RIGHT AND NOT ENOUGH. Measured, 9 arms, 2026-09-10
       * (`docs/reviews/2026-09-10-numberfield-previous-visit.md`): click a box
       * holding 156, type NOTHING, click away, click back, type `7` and the box
       * reads `1567`. The `select()` runs in both arms of that pair. **What
       * differs is that the click's own `mouseup` DEFAULT ACTION collapses the
       * selection the `focus` handler just made** — the textbook cause of a
       * select-on-focus that does not stick.
       *
       * ⚠ THE OBVIOUS REMEDY WAS TRIED FIRST, BUILT, AND MEASURED WRONG. The
       * packet's arm M prevents that mouseup's default and arm H then replaces,
       * so `preventDefault` on the focusing click's mouseup was written here
       * and it DID fix the digits. It also broke the spinner. Chromium's number
       * input carries a spin button in its UA shadow root; it STEPS on
       * mousedown, which no mouseup guard can stop, and it STOPS ITS AUTO-REPEAT
       * in a mouseup DEFAULT handler, which Blink skips once `preventDefault`
       * has been called. Measured on this component with that remedy in place
       * (harness arm S): one click on the down arrow of an unfocused box took
       * 156 to 147 within 600ms and to 119 by 2s, still sliding. The spinner is
       * a capability this repo has already refused to trade away once —
       * `numberfield-empty-harness.mjs` check 4a exists to hold it — so the
       * remedy moved rather than the constraint.
       *
       * WHAT IS HERE INSTEAD SUPPRESSES NOTHING. It does not stop the selection
       * being collapsed; it puts it back, from a task queued after the whole
       * gesture. Every default action on the way — the spin button's, the
       * caret's, the primary-selection paste's — happens exactly as the browser
       * intended, and arm S measures the spinner stepping once and stopping.
       *
       * ⚠ AND IT IS QUEUED, NOT DONE IN THE `click` HANDLER, BECAUSE THAT WAS
       * TRIED AND MEASURED. Re-selecting inside `onClick` reads as if it must
       * work — click is dispatched after mouseup's default action — and it does
       * NOT: arms H and K INSERTED with it in place (harness run, fixed build,
       * load 35.7 -> 10.2). Blink's selection update for a mouse gesture lands
       * after the click dispatch and inside the same task, so a handler cannot
       * outrun it and a `setTimeout(0)` can. Anything that fires within that
       * task is too early; that is the fact, and the `0` is not a race against a
       * typist, it is a task boundary.
       *
       * ⚠ WHY IT IS ARMED ON `mousedown` AND NOT DONE ON EVERY CLICK. Selecting
       * on every click would take a deliberate caret placement and a
       * drag-selection INSIDE A BOX THE AUTHOR IS ALREADY IN — a real
       * capability, and one the defect never touched: the insert appears only
       * on the click that brings the box from unfocused to focused. So the arm
       * is set on `mousedown`, which fires BEFORE the focus default action, and
       * `editing` there still answers exactly the right question: was this box
       * unfocused when the pointer went down?
       *
       * WHY `editing` AND NOT `document.activeElement`. They agree — `editing`
       * is set true on focus and false on blur and nowhere else — and the
       * component then reaches for no global, which is what lets the SCOPE be
       * unit-tested in a suite with no DOM
       * (`__tests__/number-field-empty.test.ts`, the focusing-click rows). The
       * behaviour it protects is a native default action and is NOT unit
       * testable; the scope is, and the scope is the part a later edit can
       * silently widen.
       *
       * ⚠ PRIMARY BUTTON ONLY. A middle-click on X11 pastes the primary
       * selection, and a field that grabbed the selection out from under that
       * paste would be inventing a second defect out of the fix for the first.
       */
      onMouseDown={(e) => { focusingClick.current = e.button === 0 && !editing; }}
      onClick={(e) => {
        if (!focusingClick.current) return;
        focusingClick.current = false;
        // ⚠ THE ELEMENT IS CAPTURED SYNCHRONOUSLY. React nulls a synthetic
        // event's `currentTarget` once the handler returns, so reading it
        // inside the queued task would find `null`. The local binding is the
        // element itself and is unaffected.
        const el = e.currentTarget;
        cancelReselect();
        reselect.current = setTimeout(() => { reselect.current = null; el.select(); }, 0);
      }}
      onFocus={(e) => {
        setEditing(true);
        // SELECT ON FOCUS. Clicking a box holding `112` and typing `40` used to
        // commit `40112` — the caret landed where the pointer did and the digits
        // were INSERTED (walkthrough §a14; it produced Top 40112 / Bot 72128 and
        // no warning anywhere). Selecting makes the first keystroke replace,
        // which is what every author expects of a small numeric field and what
        // makes the refusal below a backstop rather than a daily obstacle.
        // ⚠ THIS LINE ALONE DOES NOT HOLD THE SELECTION AGAINST A CLICK, and it
        // is still the only thing that selects for a Tab, which has no click to
        // land in. The `onClick` above is the other half; see its block.
        e.currentTarget.select();
        // The baseline for the drift clause: what the author is about to type
        // OVER. Reset the counter with it — a second visit to the same box is a
        // second gesture and must not inherit the first one's commits.
        focusState.current = { held: value, commits: 0 };
        onRefusal?.(null);
      }}
      onBlur={() => {
        setEditing(false);
        // DISARM. A mousedown that arms the guard and then finishes somewhere
        // else (a drag out of the box) fires no `click` here, so the arm would
        // otherwise stay set and the NEXT click to land here would re-select
        // inside an already-focused box — the exact regression the scoping
        // exists to avoid. Every later mousedown on this box recomputes the arm
        // anyway; this closes the one window where none does. A queued
        // re-select goes with it: a box that has lost focus must not grab a
        // selection back a task later.
        focusingClick.current = false;
        cancelReselect();
        // ⚠ THE COUNTER IS NOT CLEARED HERE, only on the next focus. The refusal
        // text stays painted after the box snaps back, and it is exactly then
        // that an author reads it — a clause deleted on blur would vanish at the
        // moment it is needed.
        setText(numberFieldText(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parseNumberFieldText(raw);
        if (n === undefined) return;
        const why = refuse?.(n) ?? null;
        onRefusal?.(
          why === null ? null : refusalWithCommittedDrift(
            why, focusState.current.held, value, focusState.current.commits),
          why === null ? undefined : {
            value: n,
            heldAtFocus: focusState.current.held,
            holdsNow: value,
            committedSinceFocus: focusState.current.commits,
          },
        );
        if (why === null) {
          focusState.current.commits += 1;
          onChange(n);
        }
      }}
      style={{ ...base, width }} />
  );
}
