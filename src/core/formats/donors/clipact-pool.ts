// Per-clip, per-corridor, per-shaft and per-fill pool cost from aeon's
// `clipact.json` (ROADMAP rows 213 and 229).
//
// ═══ WHAT AEON WRITES ═════════════════════════════════════════════════════
//
// aeon `tools/clip_act_bake.py` at 1d9afb25 (PER_CLIP_POOL_FIELDS, pool_contributions):
// `pool.per_clip` (index-aligned with the file's own `clips`), `pool.per_corridor`
// (index-aligned with `corridors`), one row shape
// `{id, index, tiles, tiles_added, pages_touched, pages_exclusive}`, and
// `pool.per_clip_fields`, the meaning of every field, copied verbatim into the
// file so a reader never has to find aeon's comment. The page shows those
// meanings as the column tooltips, read from the file it is showing.
//
// ROW 229 (aeon 8afa8015 and d796ad94, read at cffdf716). An act with vertical
// connectors or a neutral fill also gets `pool.per_shaft` (index-aligned with
// the file's own `shafts`) and `pool.per_fill` (ONE row, id "fill", index 0,
// for the file's own `fill` object, sliced by the fill's cell mask, not a
// rectangle), same row shape, and `per_clip_fields.tiles_added` then states the
// sum over all four lists. Both are written ONLY when the act has them, so an
// older or simpler bake has neither and reads exactly as before.
//
// ═══ WHAT THIS READER REFUSES TO DO ══════════════════════════════════════
//
// * ABSENT IS NOT ZERO. A clipact.json from an aeon before 1d9afb25 has no
//   `per_clip`; the answer is `unavailable` with the reason, never a row of 0s.
//   The same holds for a file whose rows do not line up with its own clips
//   (corridors, shafts, fill), or whose `per_clip_fields` no longer defines a
//   field this page reads: showing numbers under a meaning the file does not
//   state would be Aurora's opinion.
// * NO PAGES SUM. `pages_touched` counts a shared page for every row that
//   touches it, so its sum can exceed `pool.pages`; nothing here totals it.
// * NO PER-CLIP CAMERA WINDOW. aeon reports the worst window for the act only
//   and has not defined a clip's neighbourhood; nothing here derives one.
// * NO SUM OVER ROWS IT DOES NOT SHOW, AND NO ACCUSATION FROM ONE. The tile
//   invariant is checked over exactly the lists this page shows. If `pool`
//   carries any OTHER `per_*` list, that list is NAMED as unshown and the tile
//   sum is "cannot check": widening the sum would hide those tiles' provenance,
//   and narrowing it would tell the author aeon's sums disagree when they may not.
//
// aeon's invariants are CHECKED, not assumed: sum(tiles_added) + 1 (the blank at
// slot 0) == pool.tiles, and sum(pages_exclusive) <= pool.pages. A file that
// breaks one is still shown, with the broken invariant named, because the
// numbers are aeon's and the author should see that aeon's own sums disagree.
// The pages bound and the per-row bounds stay checkable with an unshown list
// present (a subset of rows can only make those sums smaller); only the tile
// EQUALITY needs every row.

/** The row fields this page reads; each must be defined by the file's own `per_clip_fields`. */
export const POOL_ROW_FIELDS = ['id', 'index', 'tiles', 'tiles_added', 'pages_touched', 'pages_exclusive'] as const;
export type PoolRowField = typeof POOL_ROW_FIELDS[number];

/** The pool lists this page shows, in aeon's row order (clips, corridors, shafts, the fill). */
export const SHOWN_POOL_LISTS = ['per_clip', 'per_corridor', 'per_shaft', 'per_fill'] as const;

export interface PoolRow {
  id: string; index: number; tiles: number; tiles_added: number; pages_touched: number; pages_exclusive: number;
}

/** aeon's tile equality, as far as this page can check it. */
export type TilesSum =
  | { state: 'holds'; total: number }
  | { state: 'mismatch'; total: number }
  /** The file carries rows this page does not show, so the equality is not checked either way. */
  | { state: 'cannot-check'; why: string };

export type PoolRows =
  | {
    state: 'present';
    perClip: PoolRow[];
    perCorridor: PoolRow[];
    /** Empty when the file has no `pool.per_shaft` (an act without shafts, or an older bake). */
    perShaft: PoolRow[];
    /** Empty when the file has no `pool.per_fill`; one row when it has. */
    perFill: PoolRow[];
    /** `pool.per_*` lists in the file that this page does not read, by key (e.g. `per_zzz`). */
    unshown: string[];
    /** The file's own `per_clip_fields`, verbatim. */
    fields: Record<string, string>;
    /** The act-level figures the rows are checked against. */
    poolTiles: number;
    poolPages: number;
    tilesSum: TilesSum;
    /** aeon's stated invariants that this file breaks; empty when it keeps them. */
    broken: string[];
  }
  | { state: 'unavailable'; why: string };

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

const OWNER_LIST: Record<'per_clip' | 'per_corridor' | 'per_shaft', string> = {
  per_clip: 'clips', per_corridor: 'corridors', per_shaft: 'shafts',
};

function readRow(r: unknown, name: string, i: number): PoolRow | string {
  if (!isObj(r)) return `pool.${name}[${i}] is not an object`;
  if (typeof r.id !== 'string') return `pool.${name}[${i}].id is not a string`;
  for (const f of ['index', 'tiles', 'tiles_added', 'pages_touched', 'pages_exclusive'] as const) {
    if (!isCount(r[f])) return `pool.${name}[${i}].${f} is ${JSON.stringify(r[f])}, not a count`;
  }
  return {
    id: r.id, index: r.index as number, tiles: r.tiles as number, tiles_added: r.tiles_added as number,
    pages_touched: r.pages_touched as number, pages_exclusive: r.pages_exclusive as number,
  };
}

/** Rows index-aligned with one of the file's own lists (`clips`, `corridors`, `shafts`). */
function readRows(raw: unknown, name: 'per_clip' | 'per_corridor' | 'per_shaft', owners: unknown): PoolRow[] | string {
  if (!Array.isArray(raw)) return `pool.${name} is not a list`;
  const list = Array.isArray(owners) ? owners : null;
  if (list === null) return `the file has no ${OWNER_LIST[name]} list to align pool.${name} with`;
  if (raw.length !== list.length) return `pool.${name} has ${raw.length} row(s) but the file lists ${list.length}`;
  const out: PoolRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = readRow(raw[i], name, i);
    if (typeof row === 'string') return row;
    const owner = list[i] as { id?: unknown } | null;
    if (row.index !== i || !isObj(owner) || owner.id !== row.id) {
      return `pool.${name}[${i}] (${row.id}, index ${String(row.index)}) does not line up with the file's own entry ${i}`;
    }
    out.push(row);
  }
  return out;
}

/** The fill's rows: aeon writes ONE (index 0) for the file's own `fill` object, which is not a list. */
function readFillRows(raw: unknown, fill: unknown): PoolRow[] | string {
  if (!Array.isArray(raw)) return 'pool.per_fill is not a list';
  if (!isObj(fill)) return 'the file has no fill object to align pool.per_fill with';
  if (raw.length !== 1) return `pool.per_fill has ${raw.length} row(s) but the file has one fill`;
  const row = readRow(raw[0], 'per_fill', 0);
  if (typeof row === 'string') return row;
  if (row.index !== 0) return `pool.per_fill[0] (${row.id}, index ${row.index}) does not line up with the file's one fill`;
  return [row];
}

/** The per-rectangle pool rows of one clipact.json, or why they cannot be shown. */
export function readPoolRows(clipact: Record<string, unknown>): PoolRows {
  const pool = clipact.pool;
  if (!isObj(pool)) return { state: 'unavailable', why: 'this clipact.json has no pool object' };
  if (!('per_clip' in pool)) {
    return { state: 'unavailable', why: 'this clipact.json has no pool.per_clip: the aeon that baked it predates the per-clip rows (aeon 1d9afb25)' };
  }
  const fields = pool.per_clip_fields;
  if (!isObj(fields) || Object.values(fields).some((v) => typeof v !== 'string')) {
    return { state: 'unavailable', why: 'pool.per_clip_fields is missing or not a map of field to meaning, so the rows have no stated meaning' };
  }
  const undefinedHere = POOL_ROW_FIELDS.filter((f) => !(f in fields));
  if (undefinedHere.length > 0) {
    return { state: 'unavailable', why: `pool.per_clip_fields no longer defines ${undefinedHere.join(', ')}, which this page reads` };
  }
  if (!isCount(pool.tiles) || !isCount(pool.pages)) {
    return { state: 'unavailable', why: 'pool.tiles or pool.pages is not a count, so the rows cannot be checked against the act' };
  }
  const perClip = readRows(pool.per_clip, 'per_clip', clipact.clips);
  if (typeof perClip === 'string') return { state: 'unavailable', why: perClip };
  const perCorridor = readRows(pool.per_corridor, 'per_corridor', clipact.corridors);
  if (typeof perCorridor === 'string') return { state: 'unavailable', why: perCorridor };
  const perShaft = 'per_shaft' in pool ? readRows(pool.per_shaft, 'per_shaft', clipact.shafts) : [];
  if (typeof perShaft === 'string') return { state: 'unavailable', why: perShaft };
  const perFill = 'per_fill' in pool ? readFillRows(pool.per_fill, clipact.fill) : [];
  if (typeof perFill === 'string') return { state: 'unavailable', why: perFill };

  const shown: readonly string[] = SHOWN_POOL_LISTS;
  const unshown = Object.keys(pool).filter((k) => k.startsWith('per_') && Array.isArray(pool[k]) && !shown.includes(k)).sort();

  const all = [...perClip, ...perCorridor, ...perShaft, ...perFill];
  const broken: string[] = [];
  const total = all.reduce((a, r) => a + r.tiles_added, 0) + 1;
  let tilesSum: TilesSum;
  if (unshown.length > 0) {
    tilesSum = { state: 'cannot-check', why: `${unshown.map((k) => `pool.${k}`).join(', ')} ${unshown.length === 1 ? 'is' : 'are'} in this file and not shown` };
  } else if (total !== pool.tiles) {
    tilesSum = { state: 'mismatch', total };
    broken.push(`the rows' added tiles plus the blank make ${total}, but pool.tiles is ${pool.tiles}`);
  } else {
    tilesSum = { state: 'holds', total };
  }
  const exclusive = all.reduce((a, r) => a + r.pages_exclusive, 0);
  if (exclusive > pool.pages) {
    broken.push(`the rows' own pages add up to ${exclusive}, more than pool.pages ${pool.pages}`);
  }
  for (const r of all) {
    if (r.tiles_added > r.tiles) broken.push(`${r.id} adds ${r.tiles_added} tiles but references only ${r.tiles}`);
    if (r.pages_exclusive > r.pages_touched) broken.push(`${r.id} owns ${r.pages_exclusive} pages but touches only ${r.pages_touched}`);
  }
  return {
    state: 'present', perClip, perCorridor, perShaft, perFill, unshown, fields: fields as Record<string, string>,
    poolTiles: pool.tiles, poolPages: pool.pages, tilesSum, broken,
  };
}
