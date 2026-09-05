import { describe, it, expect } from 'vitest';
import {
  clampFieldValue,
  clampPatch,
  findField,
  runCommit,
  type ObjectField,
} from '../object-inspector-model';

const select: ObjectField = {
  kind: 'select', id: 'typeId', label: 'Type',
  options: [{ value: 'ring', label: 'Ring' }, { value: 'spike', label: 'Spike' }],
};
const x: ObjectField = { kind: 'int', id: 'x', label: 'X', min: 0, max: 0x7ff };
const subtype: ObjectField = { kind: 'int', id: 'subtype', label: 'Subtype', min: 0, max: 0xff, hex: true };
const xflip: ObjectField = { kind: 'bool', id: 'xflip', label: 'X-flip' };
const schema: readonly ObjectField[] = [select, x, subtype, xflip];

describe('findField', () => {
  it('finds by id and returns undefined for an unknown one', () => {
    expect(findField(schema, 'x')).toBe(x);
    expect(findField(schema, 'respawn')).toBeUndefined();
  });
});

describe('clampFieldValue', () => {
  it('clamps an int into the field range rather than rejecting it', () => {
    expect(clampFieldValue(x, 3000)).toBe(0x7ff);
    expect(clampFieldValue(x, -5)).toBe(0);
    expect(clampFieldValue(x, 100)).toBe(100);
  });

  it('rounds a fractional int', () => {
    expect(clampFieldValue(x, 10.6)).toBe(11);
  });

  it('accepts a numeric string, because the hex input commits text', () => {
    expect(clampFieldValue(subtype, '255')).toBe(255);
  });

  it('rejects a non-numeric or boolean value for an int field', () => {
    expect(clampFieldValue(x, 'abc')).toBeUndefined();
    expect(clampFieldValue(x, '')).toBeUndefined();
    expect(clampFieldValue(x, true)).toBeUndefined();
    expect(clampFieldValue(x, Number.NaN)).toBeUndefined();
    expect(clampFieldValue(x, Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('accepts only a listed option for a select', () => {
    expect(clampFieldValue(select, 'spike')).toBe('spike');
    expect(clampFieldValue(select, 'nope')).toBeUndefined();
    expect(clampFieldValue(select, 3)).toBeUndefined();
  });

  it('accepts only a real boolean for a bool field', () => {
    expect(clampFieldValue(xflip, true)).toBe(true);
    expect(clampFieldValue(xflip, false)).toBe(false);
    expect(clampFieldValue(xflip, 1)).toBeUndefined();
  });
});

describe('clampPatch', () => {
  it('clamps every known field', () => {
    expect(clampPatch(schema, { x: 9999, subtype: 300 })).toEqual({ x: 0x7ff, subtype: 0xff });
  });

  it('drops a field the schema does not declare: an engine cannot be asked for what it lacks', () => {
    // The whole point of a per-engine schema: aeon has no `respawn`, so a patch
    // naming it must never reach the write path.
    expect(clampPatch(schema, { respawn: true, x: 4 })).toEqual({ x: 4 });
  });

  it('drops a rejected value instead of writing garbage', () => {
    expect(clampPatch(schema, { x: 'abc', xflip: true })).toEqual({ xflip: true });
  });

  it('returns an empty object for an empty patch', () => {
    expect(clampPatch(schema, {})).toEqual({});
  });
});

describe('runCommit', () => {
  it('passes a result-returning write straight through', () => {
    expect(runCommit(() => ({ ok: true as const }))).toEqual({ ok: true });
    expect(runCommit(() => ({ ok: false as const, error: 'nope' }))).toEqual({ ok: false, error: 'nope' });
  });

  it('treats a void write as success: aeon commands return nothing', () => {
    expect(runCommit(() => { /* executeCommand returns void */ })).toEqual({ ok: true });
  });

  it('converts a thrown Error into {ok:false} rather than propagating', () => {
    // This is the whole reason the port layer exists: aeon's executeCommand
    // THROWS when the focused document is not an aeon history, and a neutral
    // component must never see that.
    const res = runCommit(() => { throw new Error('the focused document is not an aeon command history'); });
    expect(res).toEqual({ ok: false, error: 'the focused document is not an aeon command history' });
  });

  it('converts a thrown non-Error too', () => {
    expect(runCommit(() => { throw 'plain string'; })).toEqual({ ok: false, error: 'plain string' });
  });
});
