// A CONVERTED DONOR ZONE: aeon's `tools/s2_zone_convert.py` output, read-only.
//
// ═══ WHAT THE TREE IS (aeon origin/master f4f1a32e, design §8) ═════════════
//
//   games/sonic4/data/donors/<donor>/<ZONE>/
//       tileset.bin              decompressed donor art, 32 B per tile
//       palette.bin              96 B: the zone's CRAM lines 1..3, verbatim
//       section_<N>.tiles.bin    256x256 big-endian nametable words
//       section_<N>.collattr.bin  plane A, Aurora's per-plane cell word
//       section_<N>.collattrb.bin plane B
//       zone.json                grid, crop, counts, per-file sha256
//
// N is FLAT ROW-MAJOR, `N = sy * grid_w + sx` (zone.json `grid.index` says so in
// words; aeon's `clip_manifest.section_word_grid` stitches the same way). A donor
// with a 1-row grid cannot tell row-major from column-major, which is why the
// owned fixture under test/fixtures/donors/ is 2x2.
//
// ═══ WHY THIS IS A NEW READER AND NOT `loadAeonProject` ════════════════════
//
// Aeon's design says a donor tree is shaped so "aurora needs no new loader". That
// is true of the FILE FORMATS (every one below goes through a parser Aurora
// already has) and false of Aurora's code: `loadAeonProject` starts by reading
// `project.json`, which a donor tree does not carry, and a donor tree carries none
// of `regions.json`, meta, objects or rings, all of which the act loader reads.
// So this is a thin reader over the existing parsers, not a second act loader.
//
// ═══ ABSENT, EMPTY AND PRESENT ARE THREE STATES ════════════════════════════
//
// `donors/` is gitignored in aeon and DERIVED: absent is the normal state of a
// fresh checkout (docs/reviews/2026-09-17-s2-donor-page-read-half-settled.md).
// `FileAccess.list` answers `[]` for an absent directory AND for an empty one, so
// absence is asked of `exists` first and never inferred from an empty listing.
// The empty state names the converter command, because that one line is the
// whole difference between a dead page and a fix.
//
// Pure core: all IO through the injected FileAccess.

import type { FileAccess } from '../../project/adapter';
import type { Tile } from '../../model/types';
import { parseNametable } from '../s4-nametable';
import { parseCollAttr } from '../s4-collattr';
import { parseTiles } from '../tiles';

/** Where aeon's converter writes, relative to the aeon project root. */
export const DONOR_ROOT_REL = 'games/sonic4/data/donors';

/** The one command that produces the owner's six zones, run in aeon's root. */
export const CONVERTER_COMMAND = 'python3 tools/s2_zone_convert.py convert --all-six';

/** World pixels per nametable cell. Hardware, not policy. */
export const TILE_PX = 8;

/** Bytes per 4bpp tile. */
export const TILE_BYTES = 32;

/** The only zone.json schema this reader knows. */
export const ZONE_SCHEMA = 1;

/** A refusal to read a donor tree, naming what was wrong and where. */
export class DonorTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DonorTreeError';
  }
}

export type DonorListing =
  | { state: 'absent'; root: string }
  | { state: 'empty'; root: string; strays: string[] }
  | { state: 'present'; root: string; donors: DonorEntry[] };

export interface DonorEntry {
  donor: string;
  /** Zone directories that carry a zone.json, sorted. */
  zones: string[];
}

/** A rectangle in world pixels. */
export interface PxRect { x: number; y: number; w: number; h: number }

export interface DonorSectionRecord {
  n: number;
  sx: number;
  sy: number;
  sha256: string | null;
  collattrSha256: string | null;
  collattrbSha256: string | null;
  paintedCells: number | null;
  distinctTiles: number | null;
  collisionCellsSolid: number | null;
}

/** The part of zone.json this page reads. Every field is REQUIRED unless typed nullable. */
export interface DonorZoneManifest {
  donor: string;
  zone: string;
  gridW: number;
  gridH: number;
  sectionPx: number;
  /** Cells per section edge (sectionPx / 8). */
  sectionTiles: number;
  /** extent.crop_tiles as [x0, x1, y0, y1] in cells, x1 and y1 exclusive. */
  cropTiles: [number, number, number, number];
  /** The crop in world pixels: what aeon's R9 holds a src_rect inside. */
  cropPx: PxRect;
  paintedBboxTiles: [number, number, number, number] | null;
  tilesetFile: string;
  tilesetBytes: number;
  tilesetTiles: number;
  paletteFile: string;
  paletteBytes: number;
  paletteFirstLine: number;
  cramLine0PaintedCells: number | null;
  paintedCells: number | null;
  sections: DonorSectionRecord[];
}

/** A loaded donor zone: the whole padded grid, stitched. */
export interface DonorZone {
  manifest: DonorZoneManifest;
  /** Project-relative directory the zone was read from. */
  dir: string;
  cols: number;
  rows: number;
  /** Nametable words, row-major over the whole grid (`rows * cols`). */
  words: Uint16Array;
  planeA: Uint16Array;
  planeB: Uint16Array;
  tiles: Tile[];
  /** The raw 96-byte palette (CRAM lines `paletteFirstLine`..3). */
  palette: Uint8Array;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function at(root: unknown, path: string, label: string): unknown {
  let cur: unknown = root;
  for (const key of path.split('.')) {
    if (!isObj(cur) || !(key in cur)) {
      throw new DonorTreeError(`${label}: zone.json has no ${path}; the page reads it and will not guess`);
    }
    cur = cur[key];
  }
  return cur;
}

function int(root: unknown, path: string, label: string, min = 0): number {
  const v = at(root, path, label);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    throw new DonorTreeError(`${label}: zone.json ${path} = ${JSON.stringify(v)} is not an integer >= ${min}`);
  }
  return v;
}

function str(root: unknown, path: string, label: string): string {
  const v = at(root, path, label);
  if (typeof v !== 'string' || v === '') {
    throw new DonorTreeError(`${label}: zone.json ${path} = ${JSON.stringify(v)} is not a non-empty string`);
  }
  return v;
}

function quad(root: unknown, path: string, label: string): [number, number, number, number] {
  const v = at(root, path, label);
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => Number.isInteger(n) && n >= 0)) {
    throw new DonorTreeError(`${label}: zone.json ${path} = ${JSON.stringify(v)} is not four non-negative integers`);
  }
  return [v[0], v[1], v[2], v[3]];
}

function optInt(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

function optStr(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' ? v : null;
}

/**
 * Parse the zone.json fields the page depends on, refusing by key.
 *
 * The crop is checked against the grid because R9 holds a src_rect inside the
 * crop, and a crop that ran past the padded grid would let the page offer a
 * rectangle with no bytes under it.
 */
export function parseZoneManifest(text: string, label = 'zone.json'): DonorZoneManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new DonorTreeError(`${label}: not JSON (${(e as Error).message})`);
  }
  if (!isObj(raw)) throw new DonorTreeError(`${label}: top level is not an object`);
  const schema = int(raw, 'schema', label);
  if (schema !== ZONE_SCHEMA) {
    throw new DonorTreeError(`${label}: schema ${schema}; this page reads schema ${ZONE_SCHEMA}`);
  }
  const gridW = int(raw, 'grid.w', label, 1);
  const gridH = int(raw, 'grid.h', label, 1);
  const sectionPx = int(raw, 'grid.section_px', label, TILE_PX);
  if (sectionPx % TILE_PX !== 0) {
    throw new DonorTreeError(`${label}: grid.section_px ${sectionPx} is not a whole number of ${TILE_PX}-px cells`);
  }
  const sectionTiles = sectionPx / TILE_PX;
  const cropTiles = quad(raw, 'extent.crop_tiles', label);
  const [x0, x1, y0, y1] = cropTiles;
  if (x1 <= x0 || y1 <= y0 || x1 > gridW * sectionTiles || y1 > gridH * sectionTiles) {
    throw new DonorTreeError(
      `${label}: extent.crop_tiles ${JSON.stringify(cropTiles)} is empty or runs past the `
      + `${gridW}x${gridH}-section grid (${gridW * sectionTiles}x${gridH * sectionTiles} cells)`,
    );
  }
  const ext = at(raw, 'extent', label) as Record<string, unknown>;
  const bbox = ext.painted_bbox_tiles;
  const paintedBboxTiles = Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => Number.isInteger(n))
    ? [bbox[0], bbox[1], bbox[2], bbox[3]] as [number, number, number, number]
    : null;
  const tileBytes = int(raw, 'tileset.tile_bytes', label, 1);
  if (tileBytes !== TILE_BYTES) {
    throw new DonorTreeError(`${label}: tileset.tile_bytes ${tileBytes}; a 4bpp tile is ${TILE_BYTES}`);
  }
  const counts = isObj(raw.counts) ? raw.counts : {};
  const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: DonorSectionRecord[] = sectionsRaw.filter(isObj).map((s) => ({
    n: optInt(s, 'n') ?? -1,
    sx: optInt(s, 'sx') ?? -1,
    sy: optInt(s, 'sy') ?? -1,
    sha256: optStr(s, 'sha256'),
    collattrSha256: optStr(s, 'collattr_sha256'),
    collattrbSha256: optStr(s, 'collattrb_sha256'),
    paintedCells: optInt(s, 'painted_cells'),
    distinctTiles: optInt(s, 'distinct_tiles'),
    collisionCellsSolid: optInt(s, 'collision_cells_solid'),
  }));
  return {
    donor: str(raw, 'donor', label),
    zone: str(raw, 'zone', label),
    gridW,
    gridH,
    sectionPx,
    sectionTiles,
    cropTiles,
    cropPx: { x: x0 * TILE_PX, y: y0 * TILE_PX, w: (x1 - x0) * TILE_PX, h: (y1 - y0) * TILE_PX },
    paintedBboxTiles,
    tilesetFile: str(raw, 'tileset.file', label),
    tilesetBytes: int(raw, 'tileset.bytes', label, 0),
    tilesetTiles: int(raw, 'tileset.tiles', label, 0),
    paletteFile: str(raw, 'palette.file', label),
    paletteBytes: int(raw, 'palette.bytes', label, 1),
    paletteFirstLine: int(raw, 'palette.cram_first_line', label, 0),
    cramLine0PaintedCells: optInt(counts, 'cram_line0_painted_cells'),
    paintedCells: optInt(counts, 'painted_cells'),
    sections,
  };
}

/** Project-relative directory of one donor zone. */
export function donorZoneDir(donor: string, zone: string): string {
  return `${DONOR_ROOT_REL}/${donor}/${zone}`;
}

/**
 * The three states of `donors/`, each distinct.
 *
 * `present` needs at least one zone directory that carries a zone.json; a
 * `donors/` holding only directories with nothing converted in them is `empty`,
 * and names what it found so a half-converted tree is not silently blank.
 */
export async function listDonors(fa: FileAccess): Promise<DonorListing> {
  const root = DONOR_ROOT_REL;
  if (!(await fa.exists(root))) return { state: 'absent', root };
  const donors: DonorEntry[] = [];
  const strays: string[] = [];
  for (const donor of [...(await fa.list(root))].sort()) {
    const zones: string[] = [];
    for (const zone of [...(await fa.list(`${root}/${donor}`))].sort()) {
      if (await fa.exists(`${root}/${donor}/${zone}/zone.json`)) zones.push(zone);
      else strays.push(`${donor}/${zone}`);
    }
    if (zones.length > 0) donors.push({ donor, zones });
    else strays.push(donor);
  }
  if (donors.length === 0) return { state: 'empty', root, strays };
  return { state: 'present', root, donors };
}

/** Bytes one section file must be: one big-endian word per cell. */
export function sectionFileBytes(sectionTiles: number): number {
  return sectionTiles * sectionTiles * 2;
}

async function readSized(fa: FileAccess, path: string, want: number, what: string): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = await fa.read(path);
  } catch (e) {
    throw new DonorTreeError(`${path}: could not read ${what} (${(e as Error).message})`);
  }
  if (bytes.length !== want) {
    throw new DonorTreeError(`${path}: ${bytes.length} bytes, ${what} must be ${want}`);
  }
  return bytes;
}

/**
 * Load one converted zone, every section, both collision planes.
 *
 * A section file of the wrong length is a REFUSAL (aeon's `section_word_grid`
 * raises on the same thing), and a missing plane file is too: a tree without
 * them was written by the row-2 converter and is stale, so the refusal says to
 * re-run it rather than drawing a zone with no collision under it.
 */
export async function loadDonorZone(fa: FileAccess, donor: string, zone: string): Promise<DonorZone> {
  const dir = donorZoneDir(donor, zone);
  const label = `${dir}/zone.json`;
  let text: string;
  try {
    text = new TextDecoder().decode(await fa.read(label));
  } catch (e) {
    throw new DonorTreeError(`${label}: could not read (${(e as Error).message})`);
  }
  const manifest = parseZoneManifest(text, label);
  if (manifest.donor !== donor || manifest.zone !== zone) {
    throw new DonorTreeError(
      `${label}: names ${manifest.donor}/${manifest.zone} but sits under ${donor}/${zone}`,
    );
  }
  const st = manifest.sectionTiles;
  const cols = manifest.gridW * st;
  const rows = manifest.gridH * st;
  const words = new Uint16Array(cols * rows);
  const planeA = new Uint16Array(cols * rows);
  const planeB = new Uint16Array(cols * rows);
  const want = sectionFileBytes(st);
  for (let sy = 0; sy < manifest.gridH; sy++) {
    for (let sx = 0; sx < manifest.gridW; sx++) {
      const n = sy * manifest.gridW + sx;
      const prefix = `${dir}/section_${n}`;
      const t = parseNametable(await readSized(fa, `${prefix}.tiles.bin`, want, 'a section nametable'), st, st);
      const pa = parseCollAttr(await readSized(fa, `${prefix}.collattr.bin`, want,
        'a collision plane (re-run the converter if this tree predates both planes)'));
      const pb = parseCollAttr(await readSized(fa, `${prefix}.collattrb.bin`, want,
        'a collision plane (re-run the converter if this tree predates both planes)'));
      for (let r = 0; r < st; r++) {
        const dst = (sy * st + r) * cols + sx * st;
        words.set(t.subarray(r * st, (r + 1) * st), dst);
        planeA.set(pa.subarray(r * st, (r + 1) * st), dst);
        planeB.set(pb.subarray(r * st, (r + 1) * st), dst);
      }
    }
  }
  const tilesetPath = `${dir}/${manifest.tilesetFile}`;
  const tileset = await readSized(fa, tilesetPath, manifest.tilesetBytes, 'the tileset zone.json describes');
  if (manifest.tilesetBytes !== manifest.tilesetTiles * TILE_BYTES) {
    throw new DonorTreeError(
      `${label}: tileset.bytes ${manifest.tilesetBytes} is not tileset.tiles ${manifest.tilesetTiles} x ${TILE_BYTES}`,
    );
  }
  const palette = await readSized(fa, `${dir}/${manifest.paletteFile}`, manifest.paletteBytes, 'the palette zone.json describes');
  return { manifest, dir, cols, rows, words, planeA, planeB, tiles: parseTiles(tileset), palette };
}

/** Bits 10:0 of a nametable word: the 11-bit tile index. Aeon counts a cell PAINTED when it is non-zero. */
export const TILE_INDEX_MASK = 0x7ff;

/** Bits 13:12 of a per-plane collision word: this plane's solidity. */
export const PLANE_SOLIDITY_SHIFT = 12;

export interface RectCensus {
  cells: number;
  /** Cells whose tile index is non-zero (aeon's `painted_cells` instrument). */
  painted: number;
  /** Cells whose plane-A solidity is non-zero. */
  solidA: number;
  solidB: number;
}

/**
 * What a rectangle of the donor carries, counted from the bytes a paste would
 * take. Counted the way aeon's converter counts `painted_cells` and
 * `collision_cells_solid`, so the page's figure for a whole section equals the
 * zone.json figure for it (the fidelity rig holds that).
 */
export function rectCensus(zoneData: Pick<DonorZone, 'cols' | 'rows' | 'words' | 'planeA' | 'planeB'>, rect: PxRect): RectCensus {
  const c0 = Math.max(0, Math.floor(rect.x / TILE_PX));
  const r0 = Math.max(0, Math.floor(rect.y / TILE_PX));
  const c1 = Math.min(zoneData.cols, Math.ceil((rect.x + rect.w) / TILE_PX));
  const r1 = Math.min(zoneData.rows, Math.ceil((rect.y + rect.h) / TILE_PX));
  const out: RectCensus = { cells: 0, painted: 0, solidA: 0, solidB: 0 };
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const i = r * zoneData.cols + c;
      out.cells++;
      if ((zoneData.words[i] & TILE_INDEX_MASK) !== 0) out.painted++;
      if (((zoneData.planeA[i] >> PLANE_SOLIDITY_SHIFT) & 3) !== 0) out.solidA++;
      if (((zoneData.planeB[i] >> PLANE_SOLIDITY_SHIFT) & 3) !== 0) out.solidB++;
    }
  }
  return out;
}
