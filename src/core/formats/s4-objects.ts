export interface PackedObject {
  x: number;
  y: number;
  typeIndex: number;
  subtype: number;
  xFlip?: boolean;
  yFlip?: boolean;
  anyY?: boolean;
}

// v2 placement word bit positions (matches engine constants.asm OEF_*)
const OEF_ANY_Y     = 15;
const OEF_YFLIP     = 14;
const OEF_XFLIP     = 13;
const OEF_TYPE_SHIFT = 8;

export function packObject(x: number, y: number, typeIndex: number, subtype: number, xFlip = false, yFlip = false, anyY = false): { x: number; y: number; flags: number } {
  const flags =
    ((anyY ? 1 : 0) << OEF_ANY_Y) |
    ((yFlip ? 1 : 0) << OEF_YFLIP) |
    ((xFlip ? 1 : 0) << OEF_XFLIP) |
    ((typeIndex & 0x1F) << OEF_TYPE_SHIFT) |
    (subtype & 0xFF);
  return { x: x & 0xFFFF, y: y & 0xFFFF, flags };
}

export function unpackObject(x: number, y: number, flagWord: number): PackedObject {
  return {
    x,
    y,
    typeIndex: (flagWord >> OEF_TYPE_SHIFT) & 0x1F,
    subtype: flagWord & 0xFF,
    xFlip: !!(flagWord & (1 << OEF_XFLIP)),
    yFlip: !!(flagWord & (1 << OEF_YFLIP)),
    anyY: !!(flagWord & (1 << OEF_ANY_Y)),
  };
}

// v2: 6 bytes per entry (dc.w x, y, flags), terminated by dc.w $FFFF
export function serializeObjectList(entries: PackedObject[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.x - b.x);
  const data = new Uint8Array(sorted.length * 6 + 2);
  let offset = 0;
  for (const entry of sorted) {
    const { x, y, flags } = packObject(
      entry.x, entry.y, entry.typeIndex, entry.subtype,
      entry.xFlip ?? false, entry.yFlip ?? false, entry.anyY ?? false
    );
    data[offset]     = (x >> 8) & 0xFF;
    data[offset + 1] = x & 0xFF;
    data[offset + 2] = (y >> 8) & 0xFF;
    data[offset + 3] = y & 0xFF;
    data[offset + 4] = (flags >> 8) & 0xFF;
    data[offset + 5] = flags & 0xFF;
    offset += 6;
  }
  // dc.w -1 terminator ($FFFF)
  data[offset]     = 0xFF;
  data[offset + 1] = 0xFF;
  return data;
}

export function parseObjectList(data: Uint8Array): PackedObject[] {
  const objects: PackedObject[] = [];
  let offset = 0;
  while (offset + 6 <= data.length) {
    const x = (data[offset] << 8) | data[offset + 1];
    if (x === 0xFFFF) break;  // dc.w -1 terminator
    const y     = (data[offset + 2] << 8) | data[offset + 3];
    const flags = (data[offset + 4] << 8) | data[offset + 5];
    objects.push(unpackObject(x, y, flags));
    offset += 6;
  }
  return objects;
}
