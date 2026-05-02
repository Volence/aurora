import { describe, it, expect } from 'vitest';
import { generateEntityDataAsm } from '../../src/core/export/entity-data';
import type { ObjectPlacement, RingPlacement, ObjectDef } from '../../src/core/model/s4-types';

describe('entity-data asm export', () => {
  it('generates ring list assembly', () => {
    const rings: RingPlacement[] = [
      { x: 128, y: 96 },
      { x: 160, y: 96 },
    ];
    const objects: ObjectPlacement[] = [];
    const objectLibrary: ObjectDef[] = [];
    const result = generateEntityDataAsm('OJZ', 0, rings, objects, objectLibrary);

    expect(result).toContain('OJZ_Sec0_Rings:');
    expect(result).toContain('dc.w $0080, $0060');
    expect(result).toContain('dc.w $00A0, $0060');
    expect(result).toContain('dc.l 0');
  });

  it('generates object list assembly with type table', () => {
    const rings: RingPlacement[] = [];
    const objects: ObjectPlacement[] = [
      { x: 512, y: 176, typeId: 'spring', subtype: 0 },
      { x: 256, y: 96, typeId: 'monitor', subtype: 3 },
    ];
    const objectLibrary: ObjectDef[] = [
      { id: 'spring', name: 'Spring', codeLabel: 'Obj_Spring', defaultSubtype: 0, properties: {} },
      { id: 'monitor', name: 'Monitor', codeLabel: 'Obj_Monitor', defaultSubtype: 0, properties: {} },
    ];
    const result = generateEntityDataAsm('OJZ', 0, rings, objects, objectLibrary);

    expect(result).toContain('OJZ_Sec0_Objects:');
    expect(result).toContain('dc.l 0');
    expect(result).toContain('OJZ_Sec0_TypeTable:');
    expect(result).toContain('dc.b 2'); // count
    expect(result).toContain('Obj_Monitor');
    expect(result).toContain('Obj_Spring');
  });

  it('objects are X-sorted in output', () => {
    const objects: ObjectPlacement[] = [
      { x: 512, y: 176, typeId: 'a', subtype: 0 },
      { x: 256, y: 96, typeId: 'a', subtype: 0 },
    ];
    const objectLibrary: ObjectDef[] = [
      { id: 'a', name: 'A', codeLabel: 'Obj_A', defaultSubtype: 0, properties: {} },
    ];
    const result = generateEntityDataAsm('OJZ', 0, [], objects, objectLibrary);
    const lines = result.split('\n');
    const objLines = lines.filter(l => l.includes('dc.l') && l.includes('X='));
    expect(objLines[0]).toContain('X=$100'); // 256
  });

  it('throws if section exceeds 32 types', () => {
    const objects: ObjectPlacement[] = [];
    const objectLibrary: ObjectDef[] = [];
    for (let i = 0; i < 33; i++) {
      const id = `obj${i}`;
      objects.push({ x: i * 10, y: 0, typeId: id, subtype: 0 });
      objectLibrary.push({ id, name: `Obj${i}`, codeLabel: `Obj_${i}`, defaultSubtype: 0, properties: {} });
    }
    expect(() => generateEntityDataAsm('OJZ', 0, [], objects, objectLibrary)).toThrow(/32/);
  });
});
