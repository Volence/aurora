#!/usr/bin/env node
// Generate the OWNED donor-zone fixture under test/fixtures/donors/.
//
// WHAT IT IS. A synthetic converted donor zone in exactly the tree shape aeon's
// `tools/s2_zone_convert.py` writes (read at aeon origin/master f4f1a32e, the
// converter's blob ed263a94): tileset.bin, palette.bin, section_N.tiles.bin,
// section_N.collattr.bin, section_N.collattrb.bin and a zone.json carrying
// EVERY key path a real run of that converter wrote (the six real zones agree on
// one key set, recorded in the fixture's provenance sidecar). The ART IS OURS:
// six hand-made tiles and a painted pattern, so no donor bytes are committed.
//
// WHY 2x2 SECTIONS. zone.json's `grid.index` says sections are FLAT ROW-MAJOR,
// N = sy * grid_w + sx. Every real donor is one section tall, where row-major
// and column-major name the same files, so only a fixture two sections tall can
// tell a stitch that transposed them from one that did not.
//
// WHY THE CROP IS SMALLER THAN THE GRID. The converter pads the grid up to whole
// sections with zero words and records the real extent in extent.crop_tiles;
// aeon's R9 refuses a src_rect past the crop. A fixture whose crop filled its
// grid could not show a marquee clamped to it.
//
// SELF-CONSISTENT BY CONSTRUCTION: every count and sha256 in zone.json is
// computed here from the bytes written, the same way the converter computes
// them (painted = tile index != 0; solid = a plane's solidity bits != 0), so a
// row can hold the reader's census against zone.json's own figures.
//
// Re-run (writes only under test/fixtures/donors/):
//   node scripts/gen-donor-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TREE = join(ROOT, 'test/fixtures/donors/aeon-root/games/sonic4/data/donors/s2disasm/FXZ');
mkdirSync(TREE, { recursive: true });

const ST = 256;                       // cells per section edge (2048 px / 8)
const GW = 2;
const GH = 2;
const COLS = GW * ST;
const ROWS = GH * ST;
// The crop, in cells: x 0..300, y 16..400 (exclusive). Crosses both section
// boundaries, so every section holds some crop and some padding.
const CROP = [0, 300, 16, 400];

const sha = (b) => createHash('sha256').update(b).digest('hex');

// ---- tiles: six 4bpp tiles, 32 bytes each ---------------------------------
function tile(fn) {
  const out = Buffer.alloc(32);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x += 2) {
      out[y * 4 + x / 2] = ((fn(x, y) & 15) << 4) | (fn(x + 1, y) & 15);
    }
  }
  return out;
}
const TILES = [
  tile(() => 0),                                   // 0 blank
  tile(() => 1),                                   // 1 solid colour 1
  tile((x, y) => ((x >> 1) + (y >> 1)) & 1 ? 2 : 3), // 2 checker 2/3
  tile((x, y) => (x === y ? 4 : 5)),               // 3 diagonal
  tile((x, y) => (y < 2 ? 6 : 7)),                 // 4 top edge
  tile((x, y) => (x === 0 || y === 0 ? 8 : 9)),    // 5 corner mark
];
const tileset = Buffer.concat(TILES);

// ---- palette: CRAM lines 1..3, 16 words each, big-endian 0BGR --------------
const palette = Buffer.alloc(96);
for (let line = 0; line < 3; line++) {
  for (let i = 0; i < 16; i++) {
    // A distinct ramp per line so a wrong line reads as a wrong colour.
    const v = (i * 2) & 0xe;
    const word = line === 0 ? v << 1 : line === 1 ? v << 5 : v << 9;
    palette.writeUInt16BE(i === 0 ? 0 : word | 0x0222, (line * 16 + i) * 2);
  }
}

// ---- the painted grid -------------------------------------------------------
// Inside the crop: section n paints tile (1 + n % 4) on CRAM line (1 + n % 3),
// with a corner-mark tile (5) wherever (row + col) % 9 == 0, X-flipped on odd
// rows. Plane A is a floor (full block, solid all) from world cell row 320 down;
// plane B is a top-solid ledge at rows 200..203 only. Outside the crop, zero.
const words = new Uint16Array(COLS * ROWS);
const planeA = new Uint16Array(COLS * ROWS);
const planeB = new Uint16Array(COLS * ROWS);
for (let r = CROP[2]; r < CROP[3]; r++) {
  for (let c = CROP[0]; c < CROP[1]; c++) {
    const n = Math.floor(r / ST) * GW + Math.floor(c / ST);
    const mark = (r + c) % 9 === 0;
    const t = mark ? 5 : 1 + (n % 4);
    const pal = 1 + (n % 3);
    const hflip = mark && (r & 1) ? 0x0800 : 0;
    words[r * COLS + c] = t | hflip | (pal << 13);
    if (r >= 320) planeA[r * COLS + c] = 255 | (3 << 12);
    if (r >= 200 && r < 204) planeB[r * COLS + c] = 1 | (1 << 12);
  }
}

function sectionSlice(arr, sx, sy) {
  const out = Buffer.alloc(ST * ST * 2);
  for (let r = 0; r < ST; r++) {
    for (let c = 0; c < ST; c++) out.writeUInt16BE(arr[(sy * ST + r) * COLS + sx * ST + c], (r * ST + c) * 2);
  }
  return out;
}

const sections = [];
const shapes = new Set();
for (let sy = 0; sy < GH; sy++) {
  for (let sx = 0; sx < GW; sx++) {
    const n = sy * GW + sx;
    const t = sectionSlice(words, sx, sy);
    const a = sectionSlice(planeA, sx, sy);
    const b = sectionSlice(planeB, sx, sy);
    writeFileSync(join(TREE, `section_${n}.tiles.bin`), t);
    writeFileSync(join(TREE, `section_${n}.collattr.bin`), a);
    writeFileSync(join(TREE, `section_${n}.collattrb.bin`), b);
    let painted = 0; let solid = 0; let line0 = 0; let donorCells = 0;
    const distinct = new Set();
    for (let i = 0; i < ST * ST; i++) {
      const w = t.readUInt16BE(i * 2);
      if ((w & 0x7ff) !== 0) {
        painted++;
        distinct.add(w & 0x7ff);
        if (((w >> 13) & 3) === 0) line0++;
      }
      for (const p of [a, b]) {
        const cw = p.readUInt16BE(i * 2);
        if ((cw >> 12) & 3) { solid++; shapes.add(cw & 0x3ff); }
      }
      const r = sy * ST + Math.floor(i / ST);
      const c = sx * ST + (i % ST);
      if (r >= CROP[2] && r < CROP[3] && c >= CROP[0] && c < CROP[1]) donorCells++;
    }
    sections.push({
      attr_entries_added: n === 0 ? 2 : 0,
      collattr_sha256: sha(a),
      collattrb_sha256: sha(b),
      collision_cells_solid: solid,
      cram_line0_cells: line0,
      distinct_tiles: distinct.size,
      donor_cells: donorCells,
      n,
      painted_cells: painted,
      sha256: sha(t),
      sx,
      sy,
      world_rect_px: [sx * ST * 8, sy * ST * 8, ST * 8, ST * 8],
    });
  }
}
writeFileSync(join(TREE, 'tileset.bin'), tileset);
writeFileSync(join(TREE, 'palette.bin'), palette);

let paintedAll = 0; let maxIdx = 0; let line0All = 0;
const distinctAll = new Set();
for (let i = 0; i < words.length; i++) {
  const idx = words[i] & 0x7ff;
  if (idx) { paintedAll++; distinctAll.add(idx); if (((words[i] >> 13) & 3) === 0) line0All++; }
  if (idx > maxIdx) maxIdx = idx;
}

// Every key path a real converter run writes, in the converter's own nesting.
// Values are synthetic; the NOTE strings say so rather than imitate aeon's prose.
const zone = {
  collision: {
    attr_entries: 2,
    attr_entries_note: 'SYNTHETIC FIXTURE: not measured by collision_pipeline.',
    base_bank: 'games/sonic4/data/collision/base_s2',
    base_bank_angles_sha256: '0'.repeat(64),
    base_bank_heightmaps_sha256: '0'.repeat(64),
    base_bank_note: 'SYNTHETIC FIXTURE.',
    cell_px: [8, 16],
    cell_px_note: 'SYNTHETIC FIXTURE.',
    crossover_marks: 0,
    distinct_shapes: [...shapes].sort((x, y) => x - y),
    files: ['section_N.collattr.bin (plane A)', 'section_N.collattrb.bin (plane B)'],
    format: 'aurora per-plane cell word, big-endian u16: 9:0 base-bank shape, 10 X-flip, 11 Y-flip, 13:12 this plane\'s solidity, 15:14 XOVER',
    index_note: 'SYNTHETIC FIXTURE.',
    index_primary: 'none (synthetic)',
    index_secondary: 'none (synthetic)',
  },
  content: 'SYNTHETIC FIXTURE shaped like tools/s2_zone_convert.py output: foreground art + layout + both collision planes',
  counts: {
    cram_line0_note: 'SYNTHETIC FIXTURE.',
    cram_line0_painted_cells: line0All,
    crop_cells: (CROP[1] - CROP[0]) * (CROP[3] - CROP[2]),
    distinct_tiles_referenced: distinctAll.size,
    max_tile_index: maxIdx,
    painted_cells: paintedAll,
  },
  donor: 's2disasm',
  donor_env_var: 'AEON_S2DISASM_DIR',
  donor_role: 'SYNTHETIC FIXTURE: no donor bytes',
  extent: {
    anchored_at: 'donor world tile (0, 0)',
    camera_box_is_placeholder: false,
    camera_box_px: [0, CROP[1] * 8, CROP[2] * 8, CROP[3] * 8],
    crop_tiles: CROP,
    pad_rule: 'zero words; the grid is padded up to whole sections and NEVER cropped',
    painted_bbox_tiles: CROP,
    ystart_clamped: false,
  },
  game: 'Sonic 2 (synthetic fixture)',
  grid: { h: GH, index: 'flat row-major, N = sy * grid_w + sx', section_px: ST * 8, sections: GW * GH, w: GW },
  layout: 'FXZ_1 (synthetic)',
  palette: {
    bytes: 96, cram_first_line: 1, cram_lines: [1, 2, 3], file: 'palette.bin',
    sha256: sha(palette), source: 'scripts/gen-donor-fixture.mjs',
  },
  produced_by: 'scripts/gen-donor-fixture.mjs (shaped like tools/s2_zone_convert.py)',
  schema: 1,
  sections,
  tileset: {
    bytes: tileset.length, file: 'tileset.bin', sha256: sha(tileset),
    sources: [['scripts/gen-donor-fixture.mjs', 0]], tile_bytes: 32, tiles: TILES.length, vram_base_tile: 0,
  },
  zone: 'FXZ',
};
writeFileSync(join(TREE, 'zone.json'), JSON.stringify(zone, null, 2) + '\n');
console.log(`wrote ${TREE}: ${GW}x${GH} sections, ${paintedAll} painted cells, crop ${JSON.stringify(CROP)}`);
