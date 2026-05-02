export interface PackedObject {
  x: number;
  y: number;
  typeIndex: number;
  subtype: number;
}

export function packObject(x: number, y: number, typeIndex: number, subtype: number): number {
  return ((x & 0x3FF) << 20) | ((y & 0x3FF) << 10) | ((typeIndex & 0x1F) << 5) | (subtype & 0x1F);
}

export function unpackObject(packed: number): PackedObject {
  return {
    x: (packed >> 20) & 0x3FF,
    y: (packed >> 10) & 0x3FF,
    typeIndex: (packed >> 5) & 0x1F,
    subtype: packed & 0x1F,
  };
}

export function serializeObjectList(entries: PackedObject[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.x - b.x);
  const data = new Uint8Array((sorted.length + 1) * 4);
  let offset = 0;
  for (const entry of sorted) {
    const packed = packObject(entry.x, entry.y, entry.typeIndex, entry.subtype);
    data[offset] = (packed >> 24) & 0xFF;
    data[offset + 1] = (packed >> 16) & 0xFF;
    data[offset + 2] = (packed >> 8) & 0xFF;
    data[offset + 3] = packed & 0xFF;
    offset += 4;
  }
  data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;
  return data;
}

export function parseObjectList(data: Uint8Array): PackedObject[] {
  const objects: PackedObject[] = [];
  let offset = 0;
  while (offset + 4 <= data.length) {
    const packed = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    if (packed === 0) break;
    objects.push(unpackObject(packed));
    offset += 4;
  }
  return objects;
}
