// The field model both engines' object inspectors reduce to, plus the only logic
// worth testing in them: what a field will accept, and how a write's outcome is
// reported. Deliberately store-free and engine-free.
//
// The two engines disagree about almost everything an object IS — classic keys a
// type by number and aeon by string; classic coordinates are level-global (x to
// $FFFF, y to $FFF) and aeon's are section-local (both to $7FF); classic has a
// `respawn` flag aeon's format has no room for. None of that belongs in the
// component, so it arrives as a SCHEMA: the port declares which fields its engine
// actually has and what each one accepts, and the inspector renders exactly those.
// A field an engine does not support is absent, never disabled — dead chrome that
// silently does nothing is worse than a missing control.
//
// They also disagree about how a write REPORTS: classic's named commands return
// `{ok} | {ok:false, error}`, while aeon's executeCommand THROWS (loudly, by
// design, when the focused document is not an aeon command history). `runCommit`
// is the funnel that normalises the second into the first, so the neutral
// component only ever sees one convention and a misrouted aeon command degrades
// into an error message instead of unmounting the panel.

import type React from 'react';

/** Everything a field can hold. `string` is load-bearing: classic's type id is a
 *  number and aeon's is a string, so the shared carrier is the stringified form
 *  a `<select>` speaks, converted back by the port that owns the model. */
export type FieldValue = string | number | boolean;

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** A closed choice — the object's type. Options always include the current value,
 *  even when it is not one the engine names, so an unknown id round-trips
 *  instead of snapping to whatever happens to be first. */
export interface SelectField {
  readonly kind: 'select';
  readonly id: string;
  readonly label: string;
  readonly options: readonly SelectOption[];
}

/** A bounded integer. `min`/`max` are the ENGINE's limits, which is why they ride
 *  on the schema rather than living in the component: clamping a section-local
 *  aeon coordinate to classic's level-global range would silently place objects
 *  outside their section, and the exporter would reject the act at bake time. */
export interface IntField {
  readonly kind: 'int';
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  /** Render as a fixed-width hex byte input rather than a numeric spinner. */
  readonly hex?: boolean;
  readonly title?: string;
}

export interface BoolField {
  readonly kind: 'bool';
  readonly id: string;
  readonly label: string;
}

export type ObjectField = SelectField | IntField | BoolField;

/** Classic's convention, adopted as the shared one. See `runCommit`. */
export type CommitResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

export function findField(
  schema: readonly ObjectField[],
  id: string,
): ObjectField | undefined {
  return schema.find((f) => f.id === id);
}

/**
 * Coerce one raw value to what its field accepts, or `undefined` to reject it.
 *
 * Ints CLAMP (classic's long-standing `clampInt` behaviour — dragging a slider
 * past the end should stop at the end, not refuse), but a value that is not a
 * number at all is REJECTED, because there is no honest number to clamp it to.
 * Selects and booleans only ever reject: there is no nearest legal value.
 */
export function clampFieldValue(field: ObjectField, raw: FieldValue): FieldValue | undefined {
  switch (field.kind) {
    case 'select':
      if (typeof raw !== 'string') return undefined;
      return field.options.some((o) => o.value === raw) ? raw : undefined;
    case 'bool':
      return typeof raw === 'boolean' ? raw : undefined;
    case 'int': {
      // Booleans coerce to 0/1 under Number(), and '' coerces to 0 — both are
      // silent data loss, so neither is accepted.
      if (typeof raw === 'boolean') return undefined;
      if (typeof raw === 'string' && raw.trim() === '') return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n)) return undefined;
      return Math.max(field.min, Math.min(field.max, Math.round(n)));
    }
  }
}

/**
 * Sanitize a whole patch against a schema: unknown ids and rejected values are
 * dropped, everything else is clamped. Dropping rather than throwing means the
 * inspector's other fields still commit when one is mid-edit and unparseable.
 */
export function clampPatch(
  schema: readonly ObjectField[],
  patch: Readonly<Record<string, FieldValue>>,
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const [id, raw] of Object.entries(patch)) {
    const field = findField(schema, id);
    if (!field) continue;
    const value = clampFieldValue(field, raw);
    if (value !== undefined) out[id] = value;
  }
  return out;
}

/**
 * Run a write and report it in classic's `{ok} | {ok:false, error}` convention.
 *
 * A write that returns a result passes it through (classic); a write that returns
 * nothing succeeded (aeon's executeCommand is `void`); a write that THREW becomes
 * `{ok:false}`. That last case is the reason this exists — `executeCommand` throws
 * for a non-aeon focused document, and an uncaught throw out of an onChange
 * handler takes the whole panel down.
 */
export function runCommit(write: () => CommitResult | void): CommitResult {
  try {
    return write() ?? { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Everything `ObjectInspector` needs, supplied by a per-engine provider hook. The
 * component subscribes to NOTHING — same discipline as `ObjectListPort`, and for
 * the same two reasons: aeon's command executor throws for a classic document,
 * and the engines repaint off different signals, so `versionKey` is the only one
 * the neutral side may trust.
 */
export interface ObjectInspectorPort {
  /** The object being edited; null shows `emptyHint` instead of the form. `key`
   *  identifies it for the port's own staleness check — the neutral side never
   *  parses it. */
  readonly selected: {
    readonly key: string;
    readonly fields: Readonly<Record<string, FieldValue>>;
  } | null;
  /** Exactly the fields THIS engine supports, in render order. */
  readonly schema: readonly ObjectField[];
  /** Commit one edit as ONE undo step. `key` is checked against the port's own
   *  current selection so a blur that lands after the selection moved cannot
   *  write the edit into a different object. */
  commit(key: string, patch: Readonly<Record<string, FieldValue>>): CommitResult;
  /** Header line, e.g. "Object #3 · $11". */
  readonly title: string;
  /** Plain text shown when nothing is selected (or when a placement is armed). */
  readonly emptyHint: string;
  /** Changes when the edited object or its art changes; the form keys its live
   *  preview on it. */
  readonly versionKey: string;
  /** Live, field-reactive preview of the object. */
  readonly Preview?: React.ComponentType<{ fields: Readonly<Record<string, FieldValue>> }>;
  /** Clears the selection; the header's ✕ is hidden without it. */
  readonly onDeselect?: () => void;
  /** One optional trailing button — classic's "Edit art…". */
  readonly action?: { readonly label: string; readonly title: string; run(): void };
  /** Props spread on the root element — classic uses this to claim its facet. */
  readonly rootProps?: React.HTMLAttributes<HTMLElement>;
}
