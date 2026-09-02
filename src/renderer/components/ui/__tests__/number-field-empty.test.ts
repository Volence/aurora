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
import { NumberField, parseNumberFieldText } from '../fields';
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
    shown: () => input().value,
    setValue: (v) => { h.setProps({ value: v }); },
    renders: () => h.renders(),
  };
}

describe('NumberField — the empty box commits nothing', () => {
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

describe('NumberField — a clamp to a non-zero floor no longer rewrites the box mid-typing', () => {
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

describe('ObjectInspector — the whole path from the keystroke to the commit', () => {
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
    const askAt = src.indexOf('refuse?.(n)');
    const commitAt = src.indexOf('if (why === null) onChange(n)');
    expect(askAt).toBeGreaterThan(-1);
    expect(commitAt).toBeGreaterThan(askAt);
  });

  it('the box SELECTS its contents on focus — the cause of `40112`', () => {
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
    expect(renderers.length, 'no file renders a NumberField — the scan is dead').toBeGreaterThan(1);
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
