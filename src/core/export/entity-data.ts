import type { ObjectPlacement, RingPlacement, ObjectDef } from '../model/s4-types';

export function generateEntityDataAsm(
  zonePrefix: string,
  sectionIndex: number,
  rings: RingPlacement[],
  objects: ObjectPlacement[],
  objectLibrary: ObjectDef[],
): string {
  const lines: string[] = [];
  const secLabel = `${zonePrefix}_Sec${sectionIndex}`;

  // --- Rings ---
  lines.push(`${secLabel}_Rings:`);
  const sortedRings = [...rings].sort((a, b) => a.x - b.x || a.y - b.y);
  for (const ring of sortedRings) {
    const xHex = ring.x.toString(16).toUpperCase().padStart(4, '0');
    const yHex = ring.y.toString(16).toUpperCase().padStart(4, '0');
    lines.push(`    dc.w $${xHex}, $${yHex}`);
  }
  lines.push('    dc.l 0               ; terminator');
  lines.push('');

  // --- Objects + Type Table ---
  const sortedObjects = [...objects].sort((a, b) => a.x - b.x);

  // Build type table from unique typeIds used (preserving first-encounter order from sorted list)
  const usedTypeIds: string[] = [];
  for (const obj of sortedObjects) {
    if (!usedTypeIds.includes(obj.typeId)) {
      usedTypeIds.push(obj.typeId);
    }
  }

  if (usedTypeIds.length > 32) {
    throw new Error(`Section ${sectionIndex} has ${usedTypeIds.length} unique object types (max 32)`);
  }

  // Type table
  lines.push(`${secLabel}_TypeTable:`);
  lines.push(`    dc.b ${usedTypeIds.length}       ; count`);
  lines.push('    dc.b 0           ; pad');
  for (const typeId of usedTypeIds) {
    const def = objectLibrary.find(d => d.id === typeId);
    const label = def?.codeLabel ?? `Obj_Unknown_${typeId}`;
    lines.push(`    dc.l ${label}    ; ${def?.name ?? typeId}`);
  }
  lines.push('');

  // Object list
  lines.push(`${secLabel}_Objects:`);
  for (const obj of sortedObjects) {
    const typeIndex = usedTypeIds.indexOf(obj.typeId);
    const xHex = obj.x.toString(16).toUpperCase().padStart(3, '0');
    const yHex = obj.y.toString(16).toUpperCase().padStart(3, '0');
    const packed = ((obj.x & 0x3FF) << 20) | ((obj.y & 0x3FF) << 10) | ((typeIndex & 0x1F) << 5) | (obj.subtype & 0x1F);
    const packedHex = packed.toString(16).toUpperCase().padStart(8, '0');
    const def = objectLibrary.find(d => d.id === obj.typeId);
    lines.push(`    dc.l $${packedHex}   ; X=$${xHex}, Y=$${yHex}, ${def?.name ?? obj.typeId}:${obj.subtype}`);
  }
  lines.push('    dc.l 0                                 ; terminator');

  return lines.join('\n');
}
