import { describe, it, expect } from 'vitest';
import {
  CLASSIC_OBJECT_LIMITS,
  classicObjectSchema,
  classicObjectFields,
  applyClassicPatch,
  commitClassicPatch,
} from '../object-inspector-classic';
import type { CommitResult } from '../../components/shared/object-inspector-model';
import type { S1ObjectEntry } from '../../../core/formats/classic/s1-objpos';

const obj = (over: Partial<S1ObjectEntry> = {}): S1ObjectEntry => ({
  x: 0x100, y: 0x200, xflip: false, yflip: false, respawn: false, id: 0x11, subtype: 0x04, ...over,
});

describe('classicObjectSchema', () => {
  it('lists exactly the fields S1 objects have — including respawn', () => {
    // respawn is honestly classic-only: the S1 object word has a bit for it and
    // aeon's placement format has nowhere to put one. It belongs on this schema
    // and must NOT appear on aeon's.
    expect(classicObjectSchema(0x11).map((f) => f.id)).toEqual([
      'id', 'subtype', 'x', 'y', 'xflip', 'yflip', 'respawn',
    ]);
  });

  it('uses classic level-global coordinate limits, not aeon section-local ones', () => {
    const schema = classicObjectSchema(0x11);
    const x = schema.find((f) => f.id === 'x');
    const y = schema.find((f) => f.id === 'y');
    expect(x).toMatchObject({ kind: 'int', min: 0, max: 0xffff });
    // S1 packs y in 12 bits — a different ceiling from x, which is why one
    // shared "coordinate max" would be wrong even within one engine.
    expect(y).toMatchObject({ kind: 'int', min: 0, max: 0x0fff });
    expect(CLASSIC_OBJECT_LIMITS).toEqual({ x: 0xffff, y: 0x0fff, id: 0x7f, subtype: 0xff });
  });

  it('renders subtype as a hex byte', () => {
    expect(classicObjectSchema(0x11).find((f) => f.id === 'subtype'))
      .toMatchObject({ kind: 'int', min: 0, max: 0xff, hex: true });
  });

  it('offers every named id as a type option', () => {
    const type = classicObjectSchema(0x11)[0];
    expect(type.kind).toBe('select');
    if (type.kind !== 'select') return;
    expect(type.options.some((o) => o.value === '17')).toBe(true); // 0x11
    expect(type.options.find((o) => o.value === '17')?.label).toContain('$11');
  });

  it('includes an UNNAMED current id so it round-trips instead of snapping', () => {
    const type = classicObjectSchema(0x7f)[0];
    if (type.kind !== 'select') throw new Error('type field must be a select');
    expect(type.options.map((o) => o.value)).toContain('127');
    // …and keeps the options id-ascending.
    const values = type.options.map((o) => Number(o.value));
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});

describe('classicObjectFields', () => {
  it('carries the type id as a STRING, because a select speaks strings', () => {
    expect(classicObjectFields(obj())).toEqual({
      id: '17', subtype: 4, x: 0x100, y: 0x200, xflip: false, yflip: false, respawn: false,
    });
  });
});

describe('applyClassicPatch', () => {
  it('converts the stringified type id back to a number', () => {
    expect(applyClassicPatch(obj(), { id: '24' }).id).toBe(24);
  });

  it('leaves untouched fields alone', () => {
    expect(applyClassicPatch(obj(), { xflip: true })).toEqual(obj({ xflip: true }));
  });
});

describe('commitClassicPatch', () => {
  const schema = classicObjectSchema(0x11);

  it('writes the whole list ONCE, so one field edit is one undo step', () => {
    const calls: S1ObjectEntry[][] = [];
    const set = (next: S1ObjectEntry[]): CommitResult => { calls.push(next); return { ok: true }; };
    const objects = [obj(), obj({ id: 0x18 })];

    // Three fields at once is still one command — the whole-list-replace command
    // design is what buys that.
    const res = commitClassicPatch(set, objects, 0, { x: 5, y: 6, respawn: true }, schema);

    expect(res).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual(obj({ x: 5, y: 6, respawn: true }));
    expect(calls[0][1]).toEqual(obj({ id: 0x18 }));   // untouched neighbour
    expect(objects[0]).toEqual(obj());                // and the input is not mutated
  });

  it('clamps to CLASSIC limits — x past $FFFF, y past $FFF', () => {
    const calls: S1ObjectEntry[][] = [];
    const set = (next: S1ObjectEntry[]): CommitResult => { calls.push(next); return { ok: true }; };
    commitClassicPatch(set, [obj()], 0, { x: 0x99999, y: 0x9999 }, schema);
    expect(calls[0][0].x).toBe(0xffff);
    expect(calls[0][0].y).toBe(0x0fff);
  });

  it('does not write at all when every field in the patch was rejected', () => {
    const calls: S1ObjectEntry[][] = [];
    const set = (next: S1ObjectEntry[]): CommitResult => { calls.push(next); return { ok: true }; };
    // 'respawn' is a bool field: a number is not clampable to it, and an aeon-only
    // field name is not in this schema at all.
    const res = commitClassicPatch(set, [obj()], 0, { respawn: 1, typeId: 'enemy' }, schema);
    expect(res).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });

  it('reports a bad index instead of writing a corrupt list', () => {
    const set = (): CommitResult => { throw new Error('must not be called'); };
    expect(commitClassicPatch(set, [obj()], 3, { x: 1 }, schema)).toEqual({
      ok: false, error: 'no object at index 3',
    });
  });

  it('passes the store\'s own failure result through unchanged', () => {
    const set = (): CommitResult => ({ ok: false, error: 'object list too long' });
    expect(commitClassicPatch(set, [obj()], 0, { x: 1 }, schema)).toEqual({
      ok: false, error: 'object list too long',
    });
  });

  it('converts a thrown write into {ok:false} too, not just aeon\'s', () => {
    const set = (): CommitResult => { throw new Error('doc vanished'); };
    expect(commitClassicPatch(set, [obj()], 0, { x: 1 }, schema)).toEqual({
      ok: false, error: 'doc vanished',
    });
  });
});
