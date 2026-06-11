// Engine wide-strip format — must match s4_engine/tools/ojz_strip_gen.py
// (STRIP_TILE_HEIGHT=256, COLLISION_ROWS_PER_STRIP=128, STRIP_COLLISION_PAD=8).
//
// Per column (WIDE_STRIP_SIZE = 776 bytes):
//   [0..511]    256 big-endian nametable words (full section height)
//   [512..639]  128 collision bytes, path A — 1 byte per 16px cell (2 tile rows)
//   [640..767]  128 collision bytes, path B (engine ships B = copy of A)
//   [768..775]  8 bytes padding (0)

export const STRIP_ROWS = 256;
export const STRIP_COLS = 256;

const NT_BYTES_PER_STRIP = STRIP_ROWS * 2;          // 512
const COLL_CELLS_PER_STRIP = STRIP_ROWS / 2;        // 128
const STRIP_PAD = 8;
export const WIDE_STRIP_SIZE =
  NT_BYTES_PER_STRIP + 2 * COLL_CELLS_PER_STRIP + STRIP_PAD; // 776

export interface StripData {
  nametable: Uint16Array;
  collision: Uint8Array;
  width: number;
  height: number;
}

/**
 * Parse a section's wide-strip file (column-major) into row-major grids.
 * Collision is read from path A only; each cell byte covers two tile rows.
 */
export function parseStrips(data: Uint8Array): StripData {
  const expected = STRIP_COLS * WIDE_STRIP_SIZE;
  if (data.length < expected) {
    throw new Error(`Strip file too small: expected ${expected} bytes, got ${data.length}`);
  }

  const width = STRIP_COLS;
  const height = STRIP_ROWS;
  const nametable = new Uint16Array(width * height);
  const collision = new Uint8Array(width * height);

  for (let col = 0; col < STRIP_COLS; col++) {
    const stripOffset = col * WIDE_STRIP_SIZE;

    for (let row = 0; row < STRIP_ROWS; row++) {
      const wordOffset = stripOffset + row * 2;
      nametable[row * width + col] = (data[wordOffset] << 8) | data[wordOffset + 1];
    }

    const collOffset = stripOffset + NT_BYTES_PER_STRIP;
    for (let cell = 0; cell < COLL_CELLS_PER_STRIP; cell++) {
      const value = data[collOffset + cell];
      collision[(cell * 2) * width + col] = value;
      collision[(cell * 2 + 1) * width + col] = value;
    }
  }

  return { nametable, collision, width, height };
}

/**
 * Serialize row-major grids back to the wide-strip format.
 * Path A is sampled from even tile rows; path B is emitted as a copy of A.
 */
export function serializeStrips(data: StripData): Uint8Array {
  const output = new Uint8Array(STRIP_COLS * WIDE_STRIP_SIZE);

  for (let col = 0; col < STRIP_COLS; col++) {
    const stripOffset = col * WIDE_STRIP_SIZE;

    for (let row = 0; row < STRIP_ROWS; row++) {
      const word = data.nametable[row * data.width + col];
      output[stripOffset + row * 2] = (word >> 8) & 0xFF;
      output[stripOffset + row * 2 + 1] = word & 0xFF;
    }

    const collOffset = stripOffset + NT_BYTES_PER_STRIP;
    for (let cell = 0; cell < COLL_CELLS_PER_STRIP; cell++) {
      const value = data.collision[(cell * 2) * data.width + col] & 0xFF;
      output[collOffset + cell] = value;                          // path A
      output[collOffset + COLL_CELLS_PER_STRIP + cell] = value;   // path B
    }
    // pad bytes already 0
  }

  return output;
}
