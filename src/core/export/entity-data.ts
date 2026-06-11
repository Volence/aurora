import type { ObjectPlacement, RingPlacement, ObjectDef } from '../model/s4-types';

// v2 placement word bit positions (matches engine constants.asm OEF_*)
const OEF_ANY_Y      = 15;
const OEF_YFLIP      = 14;
const OEF_XFLIP      = 13;
const OEF_TYPE_SHIFT = 8;
const OEF_TYPE_MASK  = 0x1F;
const OEF_SUBTYPE_MASK = 0xFF;

function validatePlacement(secIndex: number, obj: ObjectPlacement, typeCount: number): void {
  if (obj.x < 0 || obj.x > 0x7FF) throw new Error(`Section ${secIndex}: object X ${obj.x} out of bounds (0–$7FF)`);
  if (obj.y < 0 || obj.y > 0x7FF) throw new Error(`Section ${secIndex}: object Y ${obj.y} out of bounds (0–$7FF)`);
  if (obj.subtype > OEF_SUBTYPE_MASK) throw new Error(`Section ${secIndex}: subtype ${obj.subtype} out of range (0–255)`);
  if (typeCount > 32) throw new Error(`Section ${secIndex} has ${typeCount} unique object types (max 32)`);
}

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

  // Hard-fail validation
  for (const obj of sortedObjects) {
    const typeIndex = usedTypeIds.indexOf(obj.typeId);
    validatePlacement(sectionIndex, obj, usedTypeIds.length);
    if (typeIndex > OEF_TYPE_MASK) throw new Error(`Section ${sectionIndex}: type index ${typeIndex} out of range (0–31)`);
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

  // Object list — v2: dc.w x, y, flags|type|subtype; terminated by dc.w -1
  lines.push(`${secLabel}_Objects:`);
  for (const obj of sortedObjects) {
    const typeIndex = usedTypeIds.indexOf(obj.typeId);
    const xHex = obj.x.toString(16).toUpperCase().padStart(4, '0');
    const yHex = obj.y.toString(16).toUpperCase().padStart(4, '0');
    const flags =
      ((typeIndex & OEF_TYPE_MASK) << OEF_TYPE_SHIFT) |
      (obj.subtype & OEF_SUBTYPE_MASK);
    const flagsHex = flags.toString(16).toUpperCase().padStart(4, '0');
    const def = objectLibrary.find(d => d.id === obj.typeId);
    lines.push(`    dc.w $${xHex}, $${yHex}, $${flagsHex}   ; X=$${xHex}, Y=$${yHex}, ${def?.name ?? obj.typeId}:${obj.subtype}`);
  }
  lines.push('    dc.w -1                                 ; terminator');

  return lines.join('\n');
}
