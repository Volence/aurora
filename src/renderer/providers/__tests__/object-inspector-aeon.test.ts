import { describe, it, expect } from 'vitest';
import {
  AEON_OBJECT_LIMITS,
  aeonObjectSchema,
  aeonObjectFields,
  applyAeonPatch,
  commitAeonPatch,
} from '../object-inspector-aeon';
import { EditHistory } from '../../../core/editing/history';
import type { AnyCommand, S4Level } from '../../../core/editing/commands';
import { createSection } from '../../../core/model/s4-types';
import type { ObjectDef, ObjectPlacement, Section } from '../../../core/model/s4-types';

const LIBRARY: ObjectDef[] = [
  { id: 'ring', name: 'Ring', codeLabel: 'Obj_Ring', defaultSubtype: 0, properties: {} },
  { id: 'spike', name: 'Spike', codeLabel: 'Obj_Spike', defaultSubtype: 2, properties: {} },
];

const placement = (over: Partial<ObjectPlacement> = {}): ObjectPlacement => ({
  x: 100, y: 200, typeId: 'ring', subtype: 0, ...over,
});

function level(objects: ObjectPlacement[]): { level: S4Level; section: Section } {
  const section = createSection(0, 'Section 0');
  section.objects = objects;
  return { level: { sections: [section] }, section };
}

describe('aeonObjectSchema', () => {
  it('lists exactly the fields an aeon placement has — and NOT respawn', () => {
    // The engine's placement word has no respawn bit, so there is no control for
    // it. A disabled or ignored one would be dead chrome.
    expect(aeonObjectSchema(LIBRARY, 'ring').map((f) => f.id)).toEqual([
      'typeId', 'subtype', 'x', 'y', 'xflip', 'yflip',
    ]);
  });

  it('uses SECTION-LOCAL coordinate limits, both $7FF', () => {
    const schema = aeonObjectSchema(LIBRARY, 'ring');
    expect(schema.find((f) => f.id === 'x')).toMatchObject({ kind: 'int', min: 0, max: 0x7ff });
    expect(schema.find((f) => f.id === 'y')).toMatchObject({ kind: 'int', min: 0, max: 0x7ff });
    expect(AEON_OBJECT_LIMITS).toEqual({ x: 0x7ff, y: 0x7ff, subtype: 0xff });
  });

  it('offers the project library as type options, keyed by the string id', () => {
    const type = aeonObjectSchema(LIBRARY, 'ring')[0];
    if (type.kind !== 'select') throw new Error('type field must be a select');
    expect(type.options).toEqual([
      { value: 'ring', label: 'ring — Ring' },
      { value: 'spike', label: 'spike — Spike' },
    ]);
  });

  it('includes a typeId the library does not declare, so it round-trips', () => {
    const type = aeonObjectSchema(LIBRARY, 'ghost')[0];
    if (type.kind !== 'select') throw new Error('type field must be a select');
    expect(type.options.map((o) => o.value)).toEqual(['ring', 'spike', 'ghost']);
  });

  it('survives an absent library — an unloaded project is not a crash', () => {
    const type = aeonObjectSchema(undefined, 'ring')[0];
    if (type.kind !== 'select') throw new Error('type field must be a select');
    expect(type.options.map((o) => o.value)).toEqual(['ring']);
  });
});

describe('aeonObjectFields', () => {
  it('defaults absent flips to false, because they are optional on the model', () => {
    expect(aeonObjectFields(placement())).toEqual({
      typeId: 'ring', subtype: 0, x: 100, y: 200, xflip: false, yflip: false,
    });
  });

  it('reads flips that are present', () => {
    expect(aeonObjectFields(placement({ xflip: true }))).toMatchObject({ xflip: true, yflip: false });
  });
});

describe('applyAeonPatch', () => {
  it('keeps the typeId a string — no numeric coercion', () => {
    expect(applyAeonPatch(placement(), { typeId: 'spike' })).toEqual(placement({ typeId: 'spike' }));
  });

  it('writes flips explicitly so an unflip is persisted, not dropped', () => {
    expect(applyAeonPatch(placement({ xflip: true }), { xflip: false }).xflip).toBe(false);
  });
});

describe('commitAeonPatch', () => {
  const schema = aeonObjectSchema(LIBRARY, 'ring');

  it('produces exactly ONE undo step for a multi-field edit, and it reverses', () => {
    const { level: lvl, section } = level([placement(), placement({ typeId: 'spike' })]);
    const history = new EditHistory();
    const exec = (cmd: AnyCommand, l: S4Level): void => { history.execute(cmd, l); };

    const res = commitAeonPatch(exec, lvl, 0, 0, { x: 5, subtype: 9, xflip: true }, schema);

    expect(res).toEqual({ ok: true });
    expect(section.objects[0]).toEqual(placement({ x: 5, subtype: 9, xflip: true }));
    expect(section.objects[1]).toEqual(placement({ typeId: 'spike' }));  // neighbour untouched

    expect(history.canUndo).toBe(true);
    history.undo(lvl);
    expect(section.objects[0]).toEqual(placement());
    expect(history.canUndo).toBe(false);   // ONE step, not three
  });

  it('clamps to SECTION-LOCAL limits — where classic would have allowed $9999', () => {
    const { level: lvl, section } = level([placement()]);
    const exec = (cmd: AnyCommand, l: S4Level): void => { new EditHistory().execute(cmd, l); };
    commitAeonPatch(exec, lvl, 0, 0, { x: 0x9999, y: 0x9999 }, schema);
    expect(section.objects[0].x).toBe(0x7ff);
    expect(section.objects[0].y).toBe(0x7ff);
  });

  it('converts a THROWN executeCommand into {ok:false} rather than propagating', () => {
    // The landmine this whole port layer exists for: executeCommand throws when
    // the focused document is not an aeon command history, and the neutral
    // inspector must degrade into an error message, not unmount.
    const { level: lvl } = level([placement()]);
    const exec = (): void => {
      throw new Error("executeCommand: the focused document 'classic' is not an aeon command history");
    };
    const res = commitAeonPatch(exec, lvl, 0, 0, { x: 5 }, schema);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('not an aeon command history');
  });

  it('reports a missing level instead of throwing', () => {
    const exec = (): void => { throw new Error('must not be called'); };
    expect(commitAeonPatch(exec, null, 0, 0, { x: 5 }, schema)).toEqual({
      ok: false, error: 'no aeon level is open',
    });
  });

  it('reports a stale selection instead of writing into the wrong object', () => {
    const { level: lvl } = level([placement()]);
    const exec = (): void => { throw new Error('must not be called'); };
    expect(commitAeonPatch(exec, lvl, 0, 7, { x: 5 }, schema)).toEqual({
      ok: false, error: 'no object at section 0 index 7',
    });
    expect(commitAeonPatch(exec, lvl, 4, 0, { x: 5 }, schema)).toEqual({
      ok: false, error: 'no object at section 4 index 0',
    });
  });

  it('records NO command for a no-op edit, so undo never eats an empty step', () => {
    const { level: lvl } = level([placement()]);
    const history = new EditHistory();
    const exec = (cmd: AnyCommand, l: S4Level): void => { history.execute(cmd, l); };
    expect(commitAeonPatch(exec, lvl, 0, 0, { x: 100 }, schema)).toEqual({ ok: true });
    expect(history.canUndo).toBe(false);
  });

  it('drops a field aeon does not have — a respawn patch writes nothing', () => {
    const { level: lvl } = level([placement()]);
    const history = new EditHistory();
    const exec = (cmd: AnyCommand, l: S4Level): void => { history.execute(cmd, l); };
    expect(commitAeonPatch(exec, lvl, 0, 0, { respawn: true }, schema)).toEqual({ ok: true });
    expect(history.canUndo).toBe(false);
  });
});
