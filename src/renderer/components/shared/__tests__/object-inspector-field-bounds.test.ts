// ROADMAP item 40, site 1: the OBJECT FIELD bound.
//
// WHAT THE BUG WAS. `FieldRow` rendered `<NumberField min={field.min}
// max={field.max} … onChange={onCommit}>`. On an `<input type="number">`,
// `min`/`max` govern the spinner and `:invalid` styling and stop NO TYPED
// VALUE — so the two attributes ADVERTISED a range the row itself did not
// enforce, and a typed `9999` reached `onCommit` verbatim. That the two ports
// then happened to sanitise it (each calls `clampPatch` with a schema it
// RE-DERIVES inside its own commit callback) is not the row enforcing
// anything: it is two other files remembering to, from a second derivation
// that can drift from the one the props were read out of.
//
// WHAT IS ASSERTED, AND WHY IT IS NOT ANOTHER VACUOUS BOUND. These rows do not
// look at `min`/`max` attributes at all — an attribute is exactly the thing
// that proves nothing here. They take the element `FieldRow` really returns,
// pull the live `onChange` off it, and CALL it with the out-of-range number a
// keystroke delivers (`NumberField` hands its `onChange` `Number(input.value)`
// and nothing else, so invoking it IS the typed-value path — not the clamped
// path a test that went through some helper would take). A green row therefore
// rules out precisely the defect: a value outside the rendered field's own
// definition arriving at `onCommit`.
//
// Every expectation is derived from the `ObjectField` the row was handed —
// never a literal — so a row cannot pass by agreeing with a number typed here.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type React from 'react';
import { FieldRow } from '../ObjectInspector';
import { NumberField } from '../../ui';
import type { FieldValue, IntField, ObjectField } from '../object-inspector-model';

/** A bounded int field whose bounds are neither 0 nor 255, so a clamp that
 *  quietly used some other range could not pass by coincidence. */
const x: IntField = { kind: 'int', id: 'x', label: 'X', min: 7, max: 2047 };

interface Captured { readonly calls: FieldValue[]; readonly onChange: (v: number) => void }

/** Render the row (a pure function — the int branch takes no hooks) and pull
 *  the live `onChange` off the `NumberField` element it actually returned. */
function numberFieldOf(field: ObjectField, value: FieldValue): Captured {
  const calls: FieldValue[] = [];
  const el = FieldRow({ field, value, onCommit: (v) => { calls.push(v); } });
  const found = find(el);
  if (!found) throw new Error(`FieldRow rendered no NumberField for ${field.id}`);
  return { calls, onChange: found.props.onChange as (v: number) => void };
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

describe('ObjectInspector number field: the displayed bound is the enforced one', () => {
  it('is really rendering a NumberField whose advertised bounds are the field def', () => {
    // Anti-vacuous guard for the rows below: if the finder silently matched
    // nothing, or matched some other control, every clamp row would be testing
    // an `onChange` that is not the one on screen.
    const el = find(FieldRow({ field: x, value: 100, onCommit: () => {} }));
    expect(el, 'the int branch must render a NumberField').not.toBeNull();
    expect(el?.props.min).toBe(x.min);
    expect(el?.props.max).toBe(x.max);
  });

  it('clamps a typed value past the top of the range down to the field max', () => {
    const f = numberFieldOf(x, 100);
    f.onChange(x.max + 1);
    f.onChange(x.max * 4 + 3);
    expect(f.calls).toEqual([x.max, x.max]);
  });

  it('clamps a typed value below the bottom of the range up to the field min', () => {
    const f = numberFieldOf(x, 100);
    f.onChange(x.min - 1);
    f.onChange(-9999);
    expect(f.calls).toEqual([x.min, x.min]);
  });

  it('passes the bounds themselves through untouched', () => {
    const f = numberFieldOf(x, 100);
    f.onChange(x.min);
    f.onChange(x.max);
    expect(f.calls).toEqual([x.min, x.max]);
  });

  it('refuses a NaN rather than committing a number for it', () => {
    // `Number('')` is 0, but a half-typed '-' or '1e' parses to NaN, and the
    // field model's own convention is that a value with no honest number in it
    // is REJECTED (there is nothing to clamp it to), not written.
    //
    // WHERE SUCH A VALUE COMES FROM, since it is no longer the field. When this
    // row was written `NumberField` handed on `Number(e.target.value)`, so an
    // EMPTIED box arrived as a finite 0 and this arm never saw it — the guard
    // below it in `clampFieldValue` (`raw.trim() === ''`) could not fire either.
    // `NumberField` now commits nothing for text with no number in it (see
    // `parseNumberFieldText`), which is what finally closed that hole; this row
    // keeps the model's own convention honest for every OTHER caller.
    const f = numberFieldOf(x, 100);
    f.onChange(Number.NaN);
    f.onChange(Number.POSITIVE_INFINITY);
    expect(f.calls).toEqual([]);
  });

  it('takes its bounds from the field it was handed, not from a second source', () => {
    // The point of the whole item: a different field def moves the enforced
    // bound with it, because the clamp reads the SAME object the props do.
    const narrow: IntField = { ...x, min: 3, max: 9 };
    const f = numberFieldOf(narrow, 5);
    f.onChange(narrow.max + 1);
    f.onChange(narrow.min - 1);
    expect(f.calls).toEqual([narrow.max, narrow.min]);
    expect(f.calls).not.toEqual([x.max, x.min]);
  });
});

// The wiring, by source scan. TWO precautions, both load-bearing:
//
//   • comments are STRIPPED FIRST — a whole-file `toMatch` over a .tsx is
//     otherwise satisfied by prose quoting the very call it looks for, and the
//     comment beside this element quotes `onChange={onCommit}` on purpose so
//     the strip has something to bite on (see the poison row below);
//   • the scan is SCOPED TO THE `<NumberField>` ELEMENT, because a whole-file
//     scan for `onChange={onCommit}` matches the `<Select>` branch — which
//     binds it legitimately (its options are a closed set) and would have made
//     the row red for a reason that has nothing to do with this item.
const RAW = (): string => readFileSync(join(__dirname, '..', 'ObjectInspector.tsx'), 'utf8');
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const numberFieldEl = (src: string): string => {
  const els = src.match(/<NumberField[\s\S]*?\/>/g) ?? [];
  expect(els, 'exactly one NumberField is expected in this file').toHaveLength(1);
  return els[0] ?? '';
};

describe('ObjectInspector wiring', () => {
  it('binds the number field to a clamp keyed on the same field def as its bounds', () => {
    const el = numberFieldEl(strip(RAW()));
    expect(el).toMatch(/min=\{field\.min\}/);
    expect(el).toMatch(/max=\{field\.max\}/);
    expect(el).toMatch(/clampFieldValue\(field,/);
    expect(el).not.toMatch(/onChange=\{onCommit\}/);
  });

  it('strips comments before scanning (the poison the last two parcels hit)', () => {
    // The element's own comment quotes the old wiring, so the UNSTRIPPED
    // element text matches the forbidden pattern and the stripped one does not.
    // If the strip were dropped, the row above would go green on a comment.
    expect(numberFieldEl(RAW()), 'the comment must quote the old call')
      .toMatch(/onChange=\{onCommit\}/);
    expect(numberFieldEl(strip(RAW()))).not.toMatch(/onChange=\{onCommit\}/);
  });
});
