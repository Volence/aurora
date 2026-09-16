// `set-regions` — one gesture, one undo step, over a WHOLE regions document.
//
// The editor spec's §3.3 (empyrean `2026-09-14-aurora-regions-editor-design.md`)
// asks for a whole-document command specifically because the owner's Q1 ruling
// made carve the DEFAULT: drawing a region over its neighbours trims every one
// of them in the same drag, and "Migrate sections" rewrites the act. The rows
// below are what says the bar is met — a many-rect gesture is ONE step, not one
// per rectangle the arithmetic happened to touch.
//
// They also pin the three ways a whole-document swap can be silently wrong:
//   • aliasing the live object, so the command restores the value it is meant
//     to replace (the defect recorded on `set-effects-scene`);
//   • moving `loadedPath` / `unreadable`, which are the LOAD's verdict about a
//     file on disk and are not an author's to edit;
//   • dropping a key the command's own field list did not know about.
//
// NOTHING HERE READS A PEER REPO OR THE FILESYSTEM. Every document is built in
// this file.

import { describe, it, expect } from 'vitest';
import { EditHistory } from '../history';
import type { S4Level, SetRegionsCommand } from '../commands';
import type { Act } from '../../model/s4-types';
import type { RegionsDocument } from '../../formats/regions/document';
import { noRegionsLoaded, cloneRegionsDocument } from '../../formats/regions/act-regions';

function doc(regions: RegionsDocument['regions']): RegionsDocument {
  return { schema: 1, act: 'ojz_act1', regions };
}

/** A grid of `n` side-by-side rectangles, the shape a carve leaves behind. */
function strips(n: number, w = 256): RegionsDocument {
  return doc(Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    name: `region ${i}`,
    preset: `OJZ_Preset_R${i}`,
    rect: { x: i * w, y: 0, w, h: 2048 },
  })));
}

function level(document: RegionsDocument | null = null): S4Level & { act: Act } {
  const act = {
    id: 'act1',
    regions: { ...noRegionsLoaded(), document },
  } as unknown as Act;
  return { sections: [], act } as unknown as S4Level & { act: Act };
}

const cmd = (over: Partial<SetRegionsCommand> = {}): SetRegionsCommand => ({
  type: 'set-regions',
  description: 'Regions',
  sectionIndex: -1,
  oldDocument: null,
  newDocument: null,
  ...over,
});

const ids = (l: S4Level) => (l.act!.regions.document?.regions ?? []).map(r => r.id);

describe('set-regions', () => {
  it('CREATES the act\'s first regions document, and one undo removes it again', () => {
    const l = level(null);
    const h = new EditHistory();
    const first = strips(1);

    h.execute(cmd({ newDocument: cloneRegionsDocument(first) }), l);
    expect(l.act.regions.document).toEqual(first);

    h.undo(l);
    // ABSENT, not an empty document: the contract's `regions` is minItems 1, so
    // "a document with no regions" is not a value the file can hold.
    expect(l.act.regions.document).toBeNull();
    expect(h.canUndo).toBe(false);

    h.redo(l);
    expect(l.act.regions.document).toEqual(first);
  });

  it('a MANY-RECT gesture is ONE undo step, however many regions it rewrote', () => {
    // A carve across a row of nine regions: every rectangle in the act changes
    // in one drag. This is the case the per-rect delta design would have turned
    // into nine undo steps.
    const before = strips(9);
    const l = level(cloneRegionsDocument(before));
    const h = new EditHistory();

    const after = cloneRegionsDocument(before);
    for (const r of after.regions) r.rect.w = 128;          // nine rects moved
    after.regions.push({
      id: 'night', name: 'Night', preset: 'OJZ_Preset_Night',
      rect: { x: 2304, y: 0, w: 3840, h: 2048 },
    });

    h.execute(cmd({
      oldDocument: cloneRegionsDocument(before),
      newDocument: cloneRegionsDocument(after),
    }), l);
    expect(ids(l)).toHaveLength(10);
    expect(l.act.regions.document).toEqual(after);

    h.undo(l);
    expect(l.act.regions.document, 'ten rectangles must come back in ONE step').toEqual(before);
    expect(h.canUndo, 'the ten-rect carve must be ONE step').toBe(false);

    h.redo(l);
    expect(l.act.regions.document).toEqual(after);
  });

  it('DELETES the last region, and undo restores every key the document had', () => {
    // `rasterRef` and `sceneRef` are keys no part of this command enumerates.
    // A delete that restored only the fields a field list knew about would lose
    // them, which is why the command carries the document and not a summary.
    const original = doc([{
      id: 'sec5', name: 'Band showcase', preset: 'OJZ_Preset_Sec5',
      rasterRef: 'ojz_sec5_showcase', sceneRef: 'ojz_act1_depth',
      bg: { layoutRef: '@act', span: 512 },
      rect: { x: 4096, y: 2048, w: 2048, h: 2048 },
    }]);
    const l = level(cloneRegionsDocument(original));
    const h = new EditHistory();

    h.execute(cmd({ oldDocument: cloneRegionsDocument(original), newDocument: null }), l);
    expect(l.act.regions.document).toBeNull();

    h.undo(l);
    expect(l.act.regions.document).toEqual(original);
    expect(l.act.regions.document!.regions[0].bg).toEqual({ layoutRef: '@act', span: 512 });
  });

  it('does NOT alias the act\'s live document: editing it afterwards cannot rewrite history', () => {
    const before = strips(2);
    const l = level(cloneRegionsDocument(before));
    const h = new EditHistory();
    const after = strips(3);

    h.execute(cmd({
      oldDocument: cloneRegionsDocument(before),
      newDocument: cloneRegionsDocument(after),
    }), l);

    // Somebody mutates what is on the act, in place, after the command ran.
    l.act.regions.document!.regions[0].id = 'vandalised';
    l.act.regions.document!.regions.pop();

    h.undo(l);
    expect(l.act.regions.document, 'undo must restore the document as it WAS').toEqual(before);
    h.redo(l);
    expect(l.act.regions.document, 'redo must restore the command\'s own new half').toEqual(after);
  });

  it('never moves the LOAD\'s verdict: loadedPath and unreadable survive apply and undo', () => {
    // The act's regions.json was read and understood; the author then deletes
    // every region. `loadedPath` is what will authorise removing the file, and
    // an edit must not be able to revoke or invent that permission.
    const before = strips(2);
    const l = level(cloneRegionsDocument(before));
    l.act.regions.loadedPath = 'data/ojz/act1/regions.json';
    const h = new EditHistory();

    h.execute(cmd({ oldDocument: cloneRegionsDocument(before), newDocument: null }), l);
    expect(l.act.regions.loadedPath).toBe('data/ojz/act1/regions.json');
    expect(l.act.regions.unreadable).toBeNull();

    h.undo(l);
    expect(l.act.regions.loadedPath).toBe('data/ojz/act1/regions.json');
  });

  it('a REFUSED regions.json stays refused across an edit', () => {
    // The load could not read the file. Nothing an author does in the session
    // may turn that into "there is nothing here" — the save reads `unreadable`
    // to decide whether it may touch the file at all.
    const l = level(null);
    l.act.regions.unreadable = { path: 'data/ojz/act1/regions.json', reason: 'unexpected token' };
    const h = new EditHistory();

    h.execute(cmd({ newDocument: strips(1) }), l);
    expect(l.act.regions.unreadable).toEqual(
      { path: 'data/ojz/act1/regions.json', reason: 'unexpected token' });

    h.undo(l);
    expect(l.act.regions.unreadable).not.toBeNull();
  });

  it('THROWS on a level with no act rather than consuming an undo slot silently', () => {
    const h = new EditHistory();
    expect(() => h.execute(cmd({ newDocument: strips(1) }), { sections: [] } as unknown as S4Level))
      .toThrow('set-regions requires level.act');
  });

  it('is ACT-AMBIENT: sectionIndex is -1, like set-effects-scene', () => {
    // Not a taste rule. The shipped night region straddles a section line, so
    // there is no section a regions edit could be recorded on.
    expect(cmd().sectionIndex).toBe(-1);
  });
});
