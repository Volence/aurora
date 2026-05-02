/**
 * Legacy S2 object placement format parser.
 * Not used by the S4 engine (which uses JSON), but kept for compatibility
 * with older project configs.
 */

export interface LegacyObjectPlacement {
  x: number;
  y: number;
  yRaw: number;
  respawn: boolean;
  xFlip: boolean;
  yFlip: boolean;
  type: number;
  subtype: number;
}

/**
 * Parse object placement data.
 * Standard S2 format: 6 bytes per object.
 *   Bytes 0-1: X position (16-bit, big-endian)
 *   Bytes 2-3: Y word (big-endian):
 *     bit 15: respawn flag (object remembers state)
 *     bit 14: Y flip
 *     bit 13: X flip
 *     bits 11-0: Y pixel position
 *   Byte 4: object type
 *   Byte 5: subtype
 * Terminated by 0xFFFF in X position.
 */
export function parseObjects(
  data: Uint8Array,
  entrySize: number = 6,
  terminator: number[] = [0xFF, 0xFF],
): LegacyObjectPlacement[] {
  const objects: LegacyObjectPlacement[] = [];
  let offset = 0;

  while (offset + terminator.length <= data.length) {
    // Check for terminator
    let isTerminator = true;
    for (let i = 0; i < terminator.length; i++) {
      if (data[offset + i] !== terminator[i]) {
        isTerminator = false;
        break;
      }
    }
    if (isTerminator) break;

    if (offset + entrySize > data.length) break;

    const x = (data[offset] << 8) | data[offset + 1];
    const yRaw = (data[offset + 2] << 8) | data[offset + 3];
    const type = data[offset + 4];
    const subtype = data[offset + 5];

    const respawn = (yRaw & 0x8000) !== 0;
    const yFlip = (yRaw & 0x4000) !== 0;
    const xFlip = (yRaw & 0x2000) !== 0;
    const y = yRaw & 0x0FFF;

    objects.push({ x, y, yRaw, respawn, xFlip, yFlip, type, subtype });
    offset += entrySize;
  }

  return objects;
}
