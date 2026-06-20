import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import { createSection } from '../../src/core/model/s4-types';
import type { S4Level } from '../../src/core/editing/commands';

function level(): S4Level {
  const s = createSection(0, 'S0');
  s.collisionEdit = new Uint8Array(256 * 256);
  return { sections: [s] };
}

describe('set-collision-edit', () => {
  it('applies and undoes attr writes on the chosen plane', () => {
    const h = new EditHistory();
    const lv = level();
    lv.sections[0]!.collisionEditB = new Uint8Array(256 * 256);
    h.execute({ type: 'set-collision-edit', plane: 'a', description: 'paint', sectionIndex: 0,
      entries: [{ index: 5, oldColl: 0, newColl: 40 }] }, lv);
    h.execute({ type: 'set-collision-edit', plane: 'b', description: 'paint', sectionIndex: 0,
      entries: [{ index: 7, oldColl: 0, newColl: 12 }] }, lv);
    expect(lv.sections[0]!.collisionEdit![5]).toBe(40);
    expect(lv.sections[0]!.collisionEditB![7]).toBe(12);
    expect(lv.sections[0]!.collisionEditB![5]).toBe(0); // A's write didn't touch B
    h.undo(lv); // undo the B paint
    expect(lv.sections[0]!.collisionEditB![7]).toBe(0);
    expect(lv.sections[0]!.collisionEdit![5]).toBe(40); // A unaffected
  });
  it('no-ops safely when the target plane is null', () => {
    const h = new EditHistory();
    const s = createSection(0, 'S0'); // collisionEdit + collisionEditB null
    const lv: S4Level = { sections: [s] };
    expect(() => h.execute({ type: 'set-collision-edit', plane: 'b', description: 'x', sectionIndex: 0,
      entries: [{ index: 0, oldColl: 0, newColl: 1 }] }, lv)).not.toThrow();
  });
});
