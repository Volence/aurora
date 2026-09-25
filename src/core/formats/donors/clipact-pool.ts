// Per-clip and per-corridor pool cost from aeon's `clipact.json` (ROADMAP row 213).
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
// ═══ WHAT THIS READER REFUSES TO DO ══════════════════════════════════════
//
// * ABSENT IS NOT ZERO. A clipact.json from an aeon before 1d9afb25 has no
//   `per_clip`; the answer is `unavailable` with the reason, never a row of 0s.
//   The same holds for a file whose rows do not line up with its own clips, or
//   whose `per_clip_fields` no longer defines a field this page reads: showing
//   numbers under a meaning the file does not state would be Aurora's opinion.
// * NO PAGES SUM. `pages_touched` counts a shared page for every row that
//   touches it, so its sum can exceed `pool.pages`; nothing here totals it.
// * NO PER-CLIP CAMERA WINDOW. aeon reports the worst window for the act only
//   and has not defined a clip's neighbourhood; nothing here derives one.
//
// aeon's invariants are CHECKED, not assumed: sum(tiles_added) + 1 (the blank at
// slot 0) == pool.tiles, and sum(pages_exclusive) <= pool.pages. A file that
// breaks one is still shown, with the broken invariant named, because the
// numbers are aeon's and the author should see that aeon's own sums disagree.

/** The row fields this page reads; each must be defined by the file's own `per_clip_fields`. */
export const POOL_ROW_FIELDS = ['id', 'index', 'tiles', 'tiles_added', 'pages_touched', 'pages_exclusive'] as const;
export type PoolRowField = typeof POOL_ROW_FIELDS[number];

export interface PoolRow {
  id: string; index: number; tiles: number; tiles_added: number; pages_touched: number; pages_exclusive: number;
}

export type PoolRows =
  | {
    state: 'present';
    perClip: PoolRow[];
    perCorridor: PoolRow[];
    /** The file's own `per_clip_fields`, verbatim. */
    fields: Record<string, string>;
    /** The act-level figures the rows are checked against. */
    poolTiles: number;
    poolPages: number;
    /** aeon's stated invariants that this file breaks; empty when it keeps them. */
    broken: string[];
  }
  | { state: 'unavailable'; why: string };

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

function readRows(raw: unknown, name: string, owners: unknown): PoolRow[] | string {
  if (!Array.isArray(raw)) return `pool.${name} is not a list`;
  const list = Array.isArray(owners) ? owners : null;
  if (list === null) return `the file has no ${name === 'per_clip' ? 'clips' : 'corridors'} list to align pool.${name} with`;
  if (raw.length !== list.length) return `pool.${name} has ${raw.length} row(s) but the file lists ${list.length}`;
  const out: PoolRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!isObj(r)) return `pool.${name}[${i}] is not an object`;
    if (typeof r.id !== 'string') return `pool.${name}[${i}].id is not a string`;
    for (const f of ['index', 'tiles', 'tiles_added', 'pages_touched', 'pages_exclusive'] as const) {
      if (!isCount(r[f])) return `pool.${name}[${i}].${f} is ${JSON.stringify(r[f])}, not a count`;
    }
    const owner = list[i] as { id?: unknown } | null;
    if (r.index !== i || !isObj(owner) || owner.id !== r.id) {
      return `pool.${name}[${i}] (${r.id}, index ${String(r.index)}) does not line up with the file's own entry ${i}`;
    }
    out.push({
      id: r.id, index: r.index as number, tiles: r.tiles as number, tiles_added: r.tiles_added as number,
      pages_touched: r.pages_touched as number, pages_exclusive: r.pages_exclusive as number,
    });
  }
  return out;
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

  const all = [...perClip, ...perCorridor];
  const broken: string[] = [];
  const added = all.reduce((a, r) => a + r.tiles_added, 0);
  if (added + 1 !== pool.tiles) {
    broken.push(`the rows' added tiles plus the blank make ${added + 1}, but pool.tiles is ${pool.tiles}`);
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
    state: 'present', perClip, perCorridor, fields: fields as Record<string, string>,
    poolTiles: pool.tiles, poolPages: pool.pages, broken,
  };
}
