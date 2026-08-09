// Sonic 1 collision shapes — read-only parsers for the two files that drive the
// collision overlay renderer. Ported from SonLVLAPI (LevelData.LoadLevelColArr /
// LoadLevelAngles):
//
//   'collide/Collision Array (Normal).bin' — 256 shapes * 16 bytes. Each byte is
//     a signed column height (SonLVL stores ColArr1 as sbyte[256][16]:
//     `ColArr1[i][j] = unchecked((sbyte)tmp[i*16 + j])`), so we read them as Int8.
//   'collide/Angle Map.bin' — 256 unsigned angle bytes (LevelData.Angles is a
//     raw byte[256]).
//
// There is no encoder: these tables are static engine data, consumed only for
// rendering the collision overlay.

const SHAPE_COUNT = 256;
const SHAPE_HEIGHTS = 16;

export interface S1CollisionShapes {
  /** 256 shapes, each 16 signed column heights. */
  heights: Int8Array[];
  /** 256 unsigned angle bytes. */
  angles: Uint8Array;
}

export function decodeS1CollisionArray(b: Uint8Array): Int8Array[] {
  const need = SHAPE_COUNT * SHAPE_HEIGHTS;
  if (b.length < need) {
    throw new Error(`S1 collision array too short: need ${need} bytes, got ${b.length}`);
  }
  const heights: Int8Array[] = new Array(SHAPE_COUNT);
  for (let i = 0; i < SHAPE_COUNT; i++) {
    // new Int8Array(bytes) reinterprets each 0..255 value as a signed -128..127.
    heights[i] = new Int8Array(b.subarray(i * SHAPE_HEIGHTS, i * SHAPE_HEIGHTS + SHAPE_HEIGHTS));
  }
  return heights;
}

export function decodeS1AngleMap(b: Uint8Array): Uint8Array {
  if (b.length < SHAPE_COUNT) {
    throw new Error(`S1 angle map too short: need ${SHAPE_COUNT} bytes, got ${b.length}`);
  }
  return b.slice(0, SHAPE_COUNT);
}

export function decodeS1CollisionShapes(array: Uint8Array, angleMap: Uint8Array): S1CollisionShapes {
  return { heights: decodeS1CollisionArray(array), angles: decodeS1AngleMap(angleMap) };
}
