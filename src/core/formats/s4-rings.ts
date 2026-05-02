import type { RingPlacement } from '../model/s4-types';

export function serializeRingList(rings: RingPlacement[]): Uint8Array {
  const sorted = [...rings].sort((a, b) => a.x - b.x || a.y - b.y);
  const data = new Uint8Array(sorted.length * 4 + 4);
  let offset = 0;
  for (const ring of sorted) {
    data[offset] = (ring.x >> 8) & 0xFF;
    data[offset + 1] = ring.x & 0xFF;
    data[offset + 2] = (ring.y >> 8) & 0xFF;
    data[offset + 3] = ring.y & 0xFF;
    offset += 4;
  }
  data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;
  return data;
}

export function parseRingList(data: Uint8Array): RingPlacement[] {
  const rings: RingPlacement[] = [];
  let offset = 0;
  while (offset + 4 <= data.length) {
    const word = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    if (word === 0) break;
    const x = (data[offset] << 8) | data[offset + 1];
    const y = (data[offset + 2] << 8) | data[offset + 3];
    rings.push({ x, y });
    offset += 4;
  }
  return rings;
}
