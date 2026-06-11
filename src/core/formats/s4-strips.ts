const STRIP_BYTES = 128;
const NAMETABLE_WORDS_PER_STRIP = 48;
const NAMETABLE_BYTES_PER_STRIP = 96;
const COLLISION_BYTES_PER_STRIP = 24;
const STRIPS_PER_SECTION = 256;

export const STRIP_ROWS = 48;
export const STRIP_COLS = 256;

export interface StripData {
  nametable: Uint16Array;
  collision: Uint8Array;
  width: number;
  height: number;
}

/**
 * Parse a section's strip file (column-major, 128 bytes/strip, 256 strips)
 * into a row-major nametable grid + collision grid.
 *
 * Strip layout (128 bytes each):
 *   [0..95]   48 big-endian 16-bit nametable words (column of 48 tiles)
 *   [96..119] 24 collision bytes (one per pair of rows, or one per tile - TBD)
 *   [120..127] 8 bytes padding
 *
 * Output: row-major grid of STRIP_COLS × STRIP_ROWS
 */
export function parseStrips(data: Uint8Array): StripData {
  if (data.length < STRIPS_PER_SECTION * STRIP_BYTES) {
    throw new Error(
      `Strip file too small: expected ${STRIPS_PER_SECTION * STRIP_BYTES} bytes, got ${data.length}`
    );
  }

  const width = STRIP_COLS;
  const height = STRIP_ROWS;
  const nametable = new Uint16Array(width * height);
  const collision = new Uint8Array(width * height);

  for (let col = 0; col < STRIPS_PER_SECTION; col++) {
    const stripOffset = col * STRIP_BYTES;

    // Read 48 big-endian nametable words (column-major → row-major)
    for (let row = 0; row < NAMETABLE_WORDS_PER_STRIP; row++) {
      const wordOffset = stripOffset + row * 2;
      const word = (data[wordOffset] << 8) | data[wordOffset + 1];
      nametable[row * width + col] = word;
    }

    // Read 24 collision bytes
    // Each byte maps to 2 rows of tiles in the column (48 tiles / 24 bytes = 2 rows per byte)
    const collOffset = stripOffset + NAMETABLE_BYTES_PER_STRIP;
    for (let i = 0; i < COLLISION_BYTES_PER_STRIP; i++) {
      const collByte = data[collOffset + i];
      const row1 = i * 2;
      const row2 = i * 2 + 1;
      // High nibble = first row, low nibble = second row
      collision[row1 * width + col] = (collByte >> 4) & 0x0F;
      collision[row2 * width + col] = collByte & 0x0F;
    }
  }

  return { nametable, collision, width, height };
}

/**
 * Serialize a row-major nametable + collision grid back to column-major strip format.
 */
export function serializeStrips(data: StripData): Uint8Array {
  const output = new Uint8Array(STRIPS_PER_SECTION * STRIP_BYTES);

  for (let col = 0; col < STRIPS_PER_SECTION; col++) {
    const stripOffset = col * STRIP_BYTES;

    // Write nametable words (big-endian)
    for (let row = 0; row < NAMETABLE_WORDS_PER_STRIP; row++) {
      const word = data.nametable[row * data.width + col];
      output[stripOffset + row * 2] = (word >> 8) & 0xFF;
      output[stripOffset + row * 2 + 1] = word & 0xFF;
    }

    // Write collision bytes (2 rows per byte: high nibble = first, low nibble = second)
    const collOffset = stripOffset + NAMETABLE_BYTES_PER_STRIP;
    for (let i = 0; i < COLLISION_BYTES_PER_STRIP; i++) {
      const row1 = i * 2;
      const row2 = i * 2 + 1;
      const hi = data.collision[row1 * data.width + col] & 0x0F;
      const lo = data.collision[row2 * data.width + col] & 0x0F;
      output[collOffset + i] = (hi << 4) | lo;
    }
  }

  return output;
}
