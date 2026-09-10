// The EMPTY NUMBER BOX. `NumberField` used to hand its caller
// `Number(e.target.value)`, and `Number('') === 0` — so emptying a number box
// (select-all + delete, or a backspace on the way to retyping) committed a real,
// typed-looking `0` into the document. Every downstream guard that tried to
// notice an empty box — a `Number.isFinite` check, a `raw.trim() === ''` check —
// was defeated BEFORE IT RAN, because the emptiness had already become a number
// inside the field's own `onChange`.
//
// HOW THESE ROWS REACH THE REAL HANDLER. This suite has no DOM, and the
// corruption happens inside `NumberField` itself, so a row that called some
// clamp helper directly could not observe the defect at all — it would be
// handed a number the defect had already manufactured. Instead every row here
// RENDERS the real `NumberField` (through `renderHooked`, which installs a hook
// dispatcher so the component's own `useState`/`useEffect` run), walks to the
// `<input>` it really returns, and calls the LIVE `onChange` off that element
// with the string an `<input type="number">` reports for the keystroke in
// question. That is the user's path, minus the browser.
//
// WHAT A GREEN RESULT RULES OUT (bar 2e), stated per property below rather than
// once: for the empty-box rows, that any value at all reaches the call site
// when the box holds no number. A row that merely asserted "0 was not
// committed" would go green on a field that committed the min instead, which is
// the same defect wearing a different number — so the rows assert the call
// COUNT, not the value.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type React from 'react';
import { renderHooked } from '../../../../test/render-hooked';
import { NumberField, parseNumberFieldText, refusalWithCommittedDrift } from '../fields';
import { FieldRow } from '../../shared/ObjectInspector';
import type { FieldValue, IntField, ObjectField } from '../../shared/object-inspector-model';
import { clampStaticBase } from '../../../providers/bg-anim-aeon';

type ChangeEvent = React.ChangeEvent<HTMLInputElement>;

/** A rendered field plus the values its caller actually received. */
interface Box {
  readonly commits: number[];
  /** What an `<input type="number">` reporting `raw` does to this field. */
  type(raw: string): void;
  focus(): void;
  blur(): void;
  /** What the box shows on screen right now. */
  shown(): string;
  /** Re-render from the caller with a new committed value (a controlled parent). */
  setValue(v: number): void;
  renders(): number;
  /** How many times the component asked the focused element to select itself. */
  readonly selects: { count: number };
  /** A pointer going down on the box. `button` is the DOM code: 0 is primary. */
  mouseDown(button?: number): void;
  /** A pointer coming up on the box. True when the field cancelled the default. */
  mouseUp(): boolean;
}

/** Render the real `NumberField` and drive the real `<input>` it returns. */
function box(
  props: {
    value: number; min?: number; max?: number;
    refuse?: (v: number) => string | null;
    onRefusal?: (reason: string | null) => void;
  },
  sink?: (n: number) => number | void,
): Box {
  const commits: number[] = [];
  const h = renderHooked(NumberField, {
    ...props,
    onChange: (n: number) => {
      commits.push(n);
      const back = sink?.(n);
      // A controlled caller re-renders with whatever it decided to store —
      // which is how a clamp gets back into the field's `value` prop.
      if (typeof back === 'number') h.setProps({ value: back });
    },
  });
  const input = () => {
    const el = h.find('input');
    expect(el.props.type, 'the field must really be a number input').toBe('number');
    return el.props as Record<string, (e: unknown) => void> & { value: string };
  };
  const selects = { count: 0 };
  return {
    commits,
    type: (raw) => { input().onChange({ target: { value: raw } } as unknown as ChangeEvent); },
    // ⚠ THE FAKE FOCUS EVENT CARRIES A `currentTarget`, and it must. The box
    // SELECTS its contents on focus (EFFECTS-W1 defect 5 / walkthrough §a14:
    // clicking a box holding `112` and typing `40` committed `40112`), so an
    // event without one is not the event the DOM delivers — and a `?.` in the
    // component to tolerate it would be the component hiding a real breakage.
    // `selects` counts the calls so a row can assert the behaviour rather than
    // merely surviving it.
    focus: () => {
      input().onFocus({
        currentTarget: { select: () => { selects.count += 1; } },
      } as unknown as ChangeEvent);
    },
    selects,
    blur: () => { input().onBlur({} as unknown as ChangeEvent); },
    // ⚠ WHAT THESE TWO CAN AND CANNOT ASK. The defect they descend from is a
    // NATIVE DEFAULT ACTION — the click's own mouseup collapsing the selection
    // `onFocus` just made — and no default action exists in this suite, so
    // "does the selection survive" is not a question that can be put here at
    // all. It is put to the browser, in
    // scratchpad/numberfield-selection-trace-harness.mjs, arms H and K.
    // What IS reachable is the half a later edit can silently widen: WHICH
    // mouseup the field cancels. See the describe block for why that is the
    // property worth a row.
    mouseDown: (button = 0) => {
      input().onMouseDown({ button } as unknown as ChangeEvent);
    },
    mouseUp: () => {
      let prevented = false;
      input().onMouseUp(
        { preventDefault: () => { prevented = true; } } as unknown as ChangeEvent,
      );
      return prevented;
    },
    shown: () => input().value,
    setValue: (v) => { h.setProps({ value: v }); },
    renders: () => h.renders(),
  };
}

describe('NumberField: the empty box commits nothing', () => {
  it('is really rendering a live number input (anti-vacuous guard for every row below)', () => {
    // If the harness silently rendered nothing, or `find` matched some other
    // element, every row below would be driving a handler that is not on
    // screen — and would go green for that reason alone.
    const b = box({ value: 12 });
    expect(b.renders()).toBeGreaterThan(0);
    expect(b.shown()).toBe('12');
    b.type('34');
    expect(b.commits).toEqual([34]);
  });

  it('commits NOTHING for an emptied box, rather than a 0 the author never typed', () => {
    // GREEN RULES OUT: any call to the caller's `onChange` when the box holds
    // no number. `Number('')` is 0, so the old field committed 0 here.
    const b = box({ value: 12 });
    b.type('');
    expect(b.commits).toEqual([]);
    expect(b.shown(), 'and the box is allowed to LOOK empty while it is').toBe('');
  });

  it('commits nothing for a lone "-", a lone ".", or whitespace', () => {
    // The three other texts a real box can hold with no number in it. A lone
    // `-` and a lone `.` are `NaN` under `Number`; whitespace is another 0.
    for (const raw of ['-', '.', '   ', '\t']) {
      const b = box({ value: 12 });
      b.type(raw);
      expect(b.commits, `"${raw}" must commit nothing`).toEqual([]);
      expect(b.shown()).toBe(raw);
    }
  });

  it('still commits every text that does hold a finite number', () => {
    // The other half of the contract: this fix must not cost the field its job.
    const cases: Array<[string, number]> = [['0', 0], ['42', 42], ['-5', -5], ['3.5', 3.5], [' 7 ', 7]];
    for (const [raw, want] of cases) {
      const b = box({ value: 1 });
      b.type(raw);
      expect(b.commits, `"${raw}"`).toEqual([want]);
    }
  });

  it('an emptied box with a NON-ZERO min commits neither 0 nor the min', () => {
    // The boundary the brief names, and the one a value-based assertion would
    // miss: with `Number('')` the caller received 0, and a floor clamp turned
    // that into `min` — a number the author never typed, written to the
    // document, and indistinguishable from a deliberate edit.
    const floor = 19_200;
    const stored: number[] = [];
    const b = box({ value: floor + 50, min: floor }, (n) => {
      const v = clampStaticBase(n, floor); // the real "From tile" clamp
      stored.push(v);
      return v;
    });
    b.type('');
    expect(b.commits, 'nothing reaches the caller').toEqual([]);
    expect(stored, 'so nothing reaches the document either').toEqual([]);
  });

  it('resyncs from the document when the value changes from outside the box', () => {
    // An undo, a canvas drag, a different selection. GREEN RULES OUT a field
    // that shows a stale number after the document moved under it.
    const b = box({ value: 12 });
    b.setValue(99);
    expect(b.shown()).toBe('99');
  });

  it('shows the document again after a blur, so junk cannot sit there looking committed', () => {
    const b = box({ value: 12 });
    b.focus();
    b.type('');
    expect(b.shown()).toBe('');
    b.blur();
    expect(b.shown()).toBe('12');
  });
});

describe('NumberField: a clamp to a non-zero floor no longer rewrites the box mid-typing', () => {
  it('keeps the author\'s own text while the box is focused', () => {
    // The adjacent wrinkle: "From tile" clamps to the first promotable slot, so
    // the FIRST keystroke of `19250` used to commit `2`, clamp up to 19200, and
    // come back as the input's `value` — the author's next keystroke then
    // appended to 19200. GREEN RULES OUT the box's text being replaced by the
    // caller's clamped value while the author is still typing.
    const floor = 19_200;
    const b = box({ value: floor + 50, min: floor }, (n) => clampStaticBase(n, floor));
    b.focus();
    b.type('2');
    expect(b.shown(), 'the box still shows what was typed').toBe('2');
    b.type('19');
    b.type('192');
    b.type('1925');
    b.type('19250');
    expect(b.shown()).toBe('19250');
    expect(b.commits.at(-1)).toBe(19_250);
  });

  it('but a value pushed in while NOT focused still lands', () => {
    // The other side of the same rule — the buffer must not become a place the
    // document cannot reach.
    const b = box({ value: 5 });
    b.focus();
    b.type('7');
    b.blur();
    b.setValue(41);
    expect(b.shown()).toBe('41');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE MOUSEUP GUARD, AND ONLY THE HALF THIS SUITE CAN HONESTLY ASK ABOUT
// ═══════════════════════════════════════════════════════════════════════════
//
// THE DEFECT (`docs/reviews/2026-09-10-numberfield-previous-visit.md`, 9 arms):
// click a box holding 156, type NOTHING, click away, click back, type `7`, and
// the box reads `1567`. `onFocus`'s `select()` runs in both arms of that pair;
// what differs is that the click's own `mouseup` DEFAULT ACTION collapses the
// selection it just made. The field now cancels that default, for the FOCUSING
// click only.
//
// ⚠ WHAT IS NOT ASSERTED HERE, deliberately, and where it is. Whether the
// selection survives is a fact about a native default action, and this suite has
// no DOM and therefore no default actions at all. A row here asserting "the
// selection stuck" would be asserting a fake event object back at itself: it
// could not fail for the right reason, which is worse than not existing. That
// question is put to a real browser in
// `scratchpad/numberfield-selection-trace-harness.mjs`, arms H and K, which
// INSERTED before this fix and REPLACE after it.
//
// WHAT IS ASSERTED HERE is the SCOPE, which is a different property with a
// different failure mode. Cancelling every mouseup would also cancel a
// deliberate caret placement and a drag-selection inside a box the author is
// already in. That is a real capability, it is the constraint the fix was
// written to honour, and it is exactly the kind of thing a later edit widens by
// accident while making some other row go green. The scope is decided by plain
// component state (`editing`, and the arm ref), reachable without a browser,
// and every row below fails if the guard reaches one mouseup more than it
// should. The browser harness watches the same constraint from the other side
// (arm N, a second click inside the already-focused box, which must still
// place a caret).

describe('NumberField cancels the FOCUSING click\'s mouseup, and no other', () => {
  it('cancels it on the click that brings the box from unfocused to focused', () => {
    const b = box({ value: 156 });
    b.mouseDown();
    expect(b.mouseUp(), 'the focusing click\'s mouseup default must be cancelled').toBe(true);
  });

  it('THE SCOPE: leaves a click inside a box that is ALREADY focused alone', () => {
    // GREEN RULES OUT a field that has quietly become a blanket
    // `preventDefault`, which would take the caret and the drag-selection with
    // it. This is the row that fails if the fix is widened to make something
    // else pass.
    const b = box({ value: 156 });
    b.focus();
    b.mouseDown();
    expect(b.mouseUp(), 'a click inside an already focused box must keep its default').toBe(false);
  });

  it('and the two really are the same box in the same run (anti-vacuous)', () => {
    // Both halves on ONE field, so neither can be green because it was handed a
    // different component than the other row was.
    const b = box({ value: 156 });
    b.mouseDown();
    expect(b.mouseUp(), 'first click, unfocused').toBe(true);
    b.focus();
    b.mouseDown();
    expect(b.mouseUp(), 'second click, now focused').toBe(false);
    b.blur();
    b.mouseDown();
    expect(b.mouseUp(), 'and a click after it lost focus is a focusing click again').toBe(true);
  });

  it('never cancels a non-primary button', () => {
    // A middle click pastes the primary selection on mouseup under X11. That is
    // not this component's to cancel, and the box being unfocused is exactly
    // the case where an over-broad guard would have eaten it.
    for (const button of [1, 2]) {
      const b = box({ value: 156 });
      b.mouseDown(button);
      expect(b.mouseUp(), `button ${button} must keep its default`).toBe(false);
    }
  });

  it('fires ONCE per press: a second mouseup with no mousedown is not cancelled', () => {
    const b = box({ value: 156 });
    b.mouseDown();
    expect(b.mouseUp()).toBe(true);
    expect(b.mouseUp(), 'the arm is spent, so a stray mouseup keeps its default').toBe(false);
  });

  it('disarms on blur, so a drag that leaves the box cannot arm the next mouseup', () => {
    // The one window a later mousedown does not close by itself: press inside
    // the box, drag out, release somewhere else. The arm would otherwise still
    // be set when some later mouseup lands here.
    const b = box({ value: 156 });
    b.mouseDown();
    b.focus();
    b.blur();
    expect(b.mouseUp(), 'the arm must not survive a blur').toBe(false);
  });

  it('and the focusing click still SELECTS, which is the half the guard protects', () => {
    // Anti-vacuous for the whole block: a field that had lost its select() would
    // pass every row above and be exactly as broken as before.
    const b = box({ value: 156 });
    b.mouseDown();
    b.focus();
    expect(b.selects.count, 'focus must still select the contents').toBe(1);
    expect(b.mouseUp()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A REFUSAL THAT CANNOT READ AS "NOTHING CHANGED" (cold read 2026-09-05, C8)
// ═══════════════════════════════════════════════════════════════════════════
//
// With `Top = 40`, typing `250` produced "Refused; Top is still 25." — literally
// true, and it reads as "nothing changed" while the 40 the author had set is
// gone. The commit TIMING is deliberately unchanged (the measurement is in
// docs/reviews/2026-09-05-coldread-fixes.md; commit-on-blur lands red on the
// four `type()`-without-`blur()` rows ABOVE and on the registered harness's
// check 4a). What is fixed is that the field now says so.
//
// ⚠ THESE ROWS DRIVE THE REAL COMPONENT, like every row above. The clause is
// built inside `NumberField`'s own `onChange`, from state only it holds, so a
// row that called the string helper alone would prove the sentence exists and
// not that the field ever produces it. Both are asserted, in that order.

describe('a refusal after a partial commit says the value already moved', () => {
  /** The band-edge rule the cold reader met: a screen line is 3..223. */
  const line = (v: number): string | null =>
    (v >= 3 && v <= 223) ? null : `${v} is not a screen line. Refused; Top is still ${v}.`;

  function refusing(value: number) {
    const reasons: (string | null)[] = [];
    const b = box(
      { value, refuse: (v) => (v >= 3 && v <= 223 ? null : line(v)), onRefusal: (r) => reasons.push(r) },
      (n) => n,
    );
    return { b, reasons };
  }

  it('THE COLD READER\'S GESTURE: 250 over 40 names the 40 it destroyed', () => {
    const { b, reasons } = refusing(40);
    b.focus();
    b.type('2');    // legal on its own — commits
    b.type('25');   // legal on its own — commits
    b.type('250');  // refused
    // ANTI-VACUOUS: an intermediate commit really did happen. Without it this
    // row would be asserting the clause on a field that never moved.
    //
    // ⚠ AND IT IS `[25]`, NOT `[2, 25]` — the packet's own reconstruction says
    // "`2` → 2" and the rule says otherwise: 3..223, because lines 0-2 belong to
    // the priming records. So the FIRST keystroke was refused too and only `25`
    // landed. It does not soften the defect one bit: one committed prefix is all
    // it takes to destroy the 40, and the message still said "still 25".
    expect(b.commits).toEqual([25]);
    const last = reasons.at(-1)!;
    expect(last, 'the refusal still names the rule').toContain('is not a screen line');
    expect(last, 'and it must not stop at "Top is still 25"').toContain('ALREADY MOVED');
    expect(last).toContain('held 40 when you clicked into it');
    expect(last).toContain('now holds 25');
    expect(last).toContain('commits on every keystroke');
  });

  it('a SINGLE illegal keystroke over a legal value says nothing extra', () => {
    // The other half, and the reason the clause cannot live in the provider:
    // here "Top is still 40" is the whole truth and an added warning would be
    // its own lie.
    const { b, reasons } = refusing(40);
    b.focus();
    b.type('400');
    expect(b.commits).toEqual([]);
    expect(reasons.at(-1)).not.toContain('ALREADY MOVED');
    expect(reasons.at(-1)).toContain('is not a screen line');
  });

  it('a commit that lands back on the FOCUS value says nothing extra', () => {
    // 4 → 40 → refused 400, but the document is back at 40: nothing was lost,
    // so the clause would be false. It compares values, not commit counts.
    const { b, reasons } = refusing(40);
    b.focus();
    b.type('4');
    b.type('40');
    b.type('400');
    expect(b.commits).toEqual([4, 40]);
    expect(reasons.at(-1)).not.toContain('ALREADY MOVED');
  });

  it('a SECOND visit to the box does not inherit the first visit\'s commits', () => {
    // The counter and the baseline reset on focus. Without that, every later
    // refusal in the session would carry a stale "it held 40" for ever.
    const { b, reasons } = refusing(40);
    b.focus();
    b.type('2');
    b.type('25');
    b.blur();
    b.focus();            // a fresh gesture, on a document now holding 25
    b.type('900');
    expect(reasons.at(-1)).not.toContain('ALREADY MOVED');
  });

  it('a clean commit clears the refusal, as before', () => {
    const { b, reasons } = refusing(40);
    b.focus();
    b.type('2');
    b.type('25');
    b.type('250');
    expect(reasons.at(-1)).toContain('ALREADY MOVED');
    b.type('25');
    expect(reasons.at(-1), 'a legal value clears the whole message, clause and all').toBeNull();
  });

  it('the sentence itself: silent when it would be false, loud when it is true', () => {
    // The helper, directly — the four gates, each on its own.
    expect(refusalWithCommittedDrift('why.', 40, 25, 0), 'nothing committed').toBe('why.');
    expect(refusalWithCommittedDrift('why.', null, 25, 2), 'never focused').toBe('why.');
    expect(refusalWithCommittedDrift('why.', 40, 40, 2), 'landed back on the start').toBe('why.');
    expect(refusalWithCommittedDrift('why.', NaN, 25, 2), 'no usable baseline').toBe('why.');
    const say = refusalWithCommittedDrift('why.', 40, 25, 2);
    expect(say.startsWith('why. '), 'the rule comes first, the clause after').toBe(true);
    expect(say).toContain('40');
    expect(say).toContain('25');
    // It tells the author what to DO, which is the thing "is still 25" omits.
    expect(say).toMatch(/Retype the whole value, or undo/);
  });
});

// --- The call site, end to end -------------------------------------------

/** A bounded int field whose min is NOT zero, so a commit of `min` and a
 *  commit of `0` are distinguishable. */
const x: IntField = { kind: 'int', id: 'x', label: 'X', min: 7, max: 2047 };

function fieldRowNumberField(field: ObjectField, value: FieldValue): {
  commits: FieldValue[]; props: Record<string, unknown>;
} {
  const commits: FieldValue[] = [];
  const el = FieldRow({ field, value, onCommit: (v) => { commits.push(v); } });
  const found = find(el);
  if (!found) throw new Error(`FieldRow rendered no NumberField for ${field.id}`);
  return { commits, props: found.props };
}

function find(node: unknown): React.ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const c of node) { const hit = find(c); if (hit) return hit; }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const el = node as React.ReactElement<Record<string, unknown>>;
  if (el.type === NumberField) return el;
  return el.props ? find((el.props as { children?: unknown }).children) : null;
}

describe('ObjectInspector: the whole path from the keystroke to the commit', () => {
  it('an emptied object field writes nothing (item 40\'s guard can finally fire)', () => {
    // Composed of the two techniques on purpose: `FieldRow` is walked for the
    // `NumberField` element it really renders (item 40's row), and that element
    // is then RENDERED so its own `<input>`'s `onChange` can be called with the
    // `''` an emptied box reports. Nothing in between is simulated.
    //
    // GREEN RULES OUT: the row committing anything for an empty box. On the old
    // field this committed `x.min` — `Number('')` → 0 → `clampFieldValue` floors
    // it to 7 — which is exactly the silent write item 40's `raw.trim() === ''`
    // arm was added to prevent and could never see.
    const site = fieldRowNumberField(x, 100);
    const h = renderHooked(NumberField, site.props as Parameters<typeof NumberField>[0]);
    const input = h.find('input').props as Record<string, (e: unknown) => void>;
    input.onChange({ target: { value: '' } } as unknown as ChangeEvent);
    expect(site.commits).toEqual([]);
  });

  it('and a real typed value at that same site still commits, clamped', () => {
    const site = fieldRowNumberField(x, 100);
    const h = renderHooked(NumberField, site.props as Parameters<typeof NumberField>[0]);
    const input = h.find('input').props as Record<string, (e: unknown) => void>;
    input.onChange({ target: { value: '9999' } } as unknown as ChangeEvent);
    input.onChange({ target: { value: '1' } } as unknown as ChangeEvent);
    expect(site.commits).toEqual([x.max, x.min]);
  });
});

// --- The parse rule, on its own ------------------------------------------

describe('parseNumberFieldText', () => {
  it('reports "no number" for every text a box can hold that has none', () => {
    for (const raw of ['', ' ', '\t\n', '-', '.', '-.', '+', '1e', 'abc', 'Infinity', '-Infinity']) {
      expect(parseNumberFieldText(raw), `"${raw}"`).toBeUndefined();
    }
  });

  it('reports the number for every text that has one', () => {
    expect(parseNumberFieldText('0')).toBe(0);
    expect(parseNumberFieldText('-0')).toBe(-0);
    expect(parseNumberFieldText('12')).toBe(12);
    expect(parseNumberFieldText('-3.25')).toBe(-3.25);
    expect(parseNumberFieldText('1e3')).toBe(1000);
  });

  it('is not `Number` with a coat of paint (the coercion this whole item is about)', () => {
    // Stated as the difference, so the row cannot pass if the implementation
    // ever degrades back to a bare `Number()`.
    expect(Number(''), 'the coercion that caused the defect').toBe(0);
    expect(Number('   ')).toBe(0);
    expect(parseNumberFieldText('')).not.toBe(Number(''));
  });
});

// --- Wiring, by source scan ----------------------------------------------
//
// Comments are STRIPPED FIRST. A whole-file `toMatch` over a `.tsx` is
// satisfied by prose quoting the very call it looks for — including prose this
// change itself added, which is the false green this repo hit three times this
// week. The docblock in `fields.tsx` quotes `Number(e.target.value)` on
// purpose, so the strip has something to bite on, and the poison row below
// proves the strip is what makes the scan honest.

const RAW = (): string => readFileSync(join(__dirname, '..', 'fields.tsx'), 'utf8');
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('fields.tsx wiring', () => {
  it('the number input no longer coerces its raw text with `Number()`', () => {
    const src = strip(RAW());
    expect(src).not.toContain('Number(e.target.value)');
    expect(src).toMatch(/parseNumberFieldText\(raw\)/);
    // ⚠ THE COMMIT MOVED BEHIND A REFUSAL (EFFECTS-W1 defect 5), so the shape
    // this row pins moved with it: parse, ask `refuse`, then commit only if
    // nothing objected. The two halves are asserted in ORDER, because a
    // `refuse` consulted AFTER the commit would be decoration over a value
    // already in the document.
    expect(src).toMatch(/if \(n === undefined\) return;/);
    // ⚠ RE-SPELLED 2026-09-05, NOT WEAKENED. The commit moved inside a BLOCK
    // (the drift counter increments beside it), so the single-line
    // `if (why === null) onChange(n)` this row used to find no longer exists —
    // and an `indexOf` for it returned -1, which `toBeGreaterThan(askAt)` would
    // have read as a FAILURE rather than as "the text moved". The three
    // positions are now asserted in order, which pins the same rule harder: ask,
    // then guard, then commit.
    const askAt = src.indexOf('refuse?.(n)');
    const guardAt = src.indexOf('if (why === null)');
    const commitAt = src.indexOf('onChange(n);');
    expect(askAt, '`refuse` is consulted').toBeGreaterThan(-1);
    expect(guardAt, 'and its answer guards something').toBeGreaterThan(askAt);
    expect(commitAt, 'and the commit is behind that guard').toBeGreaterThan(guardAt);
  });

  it('the box SELECTS its contents on focus: the cause of `40112`', () => {
    // Behaviour, not source: the harness counts the `select()` the component
    // calls on the focused element.
    const b = box({ value: 112 });
    expect(b.selects.count).toBe(0);
    b.focus();
    expect(b.selects.count).toBe(1);
  });

  it('a value the caller REFUSES is never committed, and the reason is reported', () => {
    const seen: (string | null)[] = [];
    const b = box({
      value: 112,
      refuse: (n: number) => (n > 223 ? `${n} is off the screen` : null),
      onRefusal: (r: string | null) => seen.push(r),
    });
    b.type('40112');
    expect(b.commits, 'a refused value reached the document').toEqual([]);
    expect(seen).toEqual(['40112 is off the screen']);
    // ANTI-VACUOUS: the same box still commits a value the caller allows, so
    // the row above is not passing because nothing works.
    b.type('40');
    expect(b.commits).toEqual([40]);
    expect(seen).toEqual(['40112 is off the screen', null]);
  });

  it('strips comments before scanning (the known false green)', () => {
    // The docblock quotes the old coercion VERBATIM; the UNSTRIPPED source
    // therefore contains the forbidden text and the stripped source does not.
    // Drop the strip and the row above goes green on a comment — the false
    // green this repo hit three times this week.
    expect(RAW(), 'a comment must quote the old call for this poison to bite')
      .toContain('Number(e.target.value)');
    expect(strip(RAW())).not.toContain('Number(e.target.value)');
  });
});

// --- The contract cannot be bypassed --------------------------------------
//
// The whole fix lives in ONE component, which is what makes every call site
// deliberately handled rather than a dozen places to remember. That only holds
// while every site really is rendering THIS component: a second local
// `NumberField`, or an import from somewhere else, would reintroduce the defect
// at a site whose JSX still reads `<NumberField>`. These rows check exactly
// that, by walking the tree rather than by trusting a list written down here.

const SRC_ROOT = join(__dirname, '..', '..', '..', '..');

/** Every app source file. `__tests__` is skipped: a suite that quotes
 *  `<NumberField` or `export function NumberField` inside a regex — as the
 *  scans in this very file do — is not a call site, and counting it would make
 *  the rows below fail on their own prose. */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out.push(...tsFiles(p)); continue; }
    if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('every NumberField on screen is the one with the contract', () => {
  const files = tsFiles(SRC_ROOT)
    .map((p) => ({ p: p.slice(SRC_ROOT.length), src: strip(readFileSync(p, 'utf8')) }));
  const renderers = files.filter((f) => f.src.includes('<NumberField'));

  it('finds the call sites at all (anti-vacuous guard for the two rows below)', () => {
    expect(renderers.length, 'no file renders a NumberField: the scan is dead').toBeGreaterThan(1);
  });

  it('has exactly one definition of it, in fields.tsx', () => {
    const defs = files.filter((f) => /export function NumberField\b/.test(f.src));
    expect(defs.map((d) => d.p)).toEqual(['/renderer/components/ui/fields.tsx']);
  });

  it('and every site imports that one rather than declaring its own', () => {
    for (const f of renderers) {
      const imports = f.src.match(/import\s*\{[^}]*\bNumberField\b[^}]*\}\s*from\s*'([^']+)'/g) ?? [];
      expect(imports, `${f.p} renders a NumberField it does not import`).toHaveLength(1);
      expect(imports[0], `${f.p} imports NumberField from somewhere other than the shared ui module`)
        .toMatch(/from '(\.\.\/)+(components\/)?ui'$/);
    }
  });
});
