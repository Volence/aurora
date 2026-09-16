/**
 * REGION GEOMETRY - the pure rules behind Aurora's painted regions.
 *
 * ═══ THE MODEL, AND THE ONE THING THAT MAKES IT DIFFERENT ═══
 *
 * There is NO painter's order here, no layering, no z-index. Drawing a region
 * over an existing one TRIMS THE EXISTING ONE AT ONCE, so the set on disk holds
 * exactly each region's own area, disjoint, and list order carries no meaning.
 *
 * That is the owner's ruling of 2026-09-14T14:54:34Z, recorded verbatim in §8 of
 * the editor design spec (empyrean `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`
 * at `origin/main`): "Yeah probablyy go with how we think about it", answering an
 * A/B whose A was "cut right away". §8 SUPERSEDES that same document's §2.3,
 * §2.5, §3.2 and §5.2, whose bodies were written under the painter's-order model
 * it overturned. If a future change here starts growing a layer list, it is
 * rebuilding the model that was rejected.
 *
 * Two consequences the rest of this file is built on:
 *   - "carve" is what EVERY draw over an existing region does. It is not a
 *     separate gesture with a modifier.
 *   - an area no region holds is UNASSIGNED. It is a first-class answer, it is
 *     what the editor paints red, and the build refuses it until it is given to
 *     a region. It NEVER silently falls back to a neighbour, which is why
 *     deleting a region is the same operation as subtracting its rectangles.
 *
 * ═══ BOUNDS: HALF-OPEN {x, y, w, h}, AND WHY ═══
 *
 * Everything in this module is HALF-OPEN: a rectangle covers the columns
 * `x <= px < x + w` and the rows `y <= py < y + h`. `w` and `h` are extents, not
 * far edges.
 *
 * This is not a free choice. The regions contract (empyrean
 * `docs/AURORA_REGIONS_SCHEMA.md` §2 at `origin/main` `c3f892f9`) gives the
 * document `rect: {x, y, w, h}` in world pixels, and its §6 says in as many
 * words that "the generator converts `{x,y,w,h}` to the inclusive bounds the
 * engine reads, so a reader of this document must not assume the engine sees
 * these numbers unchanged". So the editor side IS the half-open side, and the
 * inclusive side is aeon's, across one conversion aeon owns.
 *
 * The engine's own form is INCLUSIVE: `ojz_region(x0:, x1:, y0:, y1:)`, whose
 * `ensure` says "Bounds are INCLUSIVE, so a one-pixel column is x0 == x1, never
 * x1 < x0". `toInclusive`/`fromInclusive` below are the only place the two meet,
 * and they exist here because THE PER-RECT RULES ARE WRITTEN IN THE INCLUSIVE
 * FORM in aeon. They are applied here in that form rather than re-derived in
 * half-open terms, so there is one transcription of each rule and it reads like
 * its source. The two cases where an off-by-one would show are the one-pixel
 * column (`w === 1`) and a rectangle flush against the act's far edge; both are
 * under test.
 *
 * ═══ WHAT NOBODY ELSE CHECKS ═══
 *
 * The contract's §6 lists what the schema does NOT check, and two of its
 * silences are this module's whole reason to exist: the schema does not check
 * that a rectangle lies INSIDE the act, and it does not check that regions TILE
 * the act without gaps or how overlaps resolve. A schema cannot: it sees one
 * document and no act. So `coverage`, `disjointness` and `validateRect` are not
 * a second copy of a contract check. They are the only thing that will ever make
 * those properties true on the editor side, and aeon's whole-table `ensure`s are
 * the only thing that makes them true on the other.
 *
 * ═══ SCOPE ═══
 *
 * Pure geometry and the per-rect rules. NO file format, no codec, no schema, no
 * UI, no map overlay, and NO RULE CONSTANTS. `REGION_MIN_SPAN`, the camera
 * centre's reachable band and the act's dimensions belong to aeon; they arrive
 * here as a `RegionRules` parameter so the app can source them from the open
 * project, and the tests derive their real values from aeon at a committed
 * revision. A value typed into this file would be a second home for a number
 * aeon owns.
 *
 * Conventions follow `src/core/editing/section-ops.ts`: plain data in, new data
 * out, nothing mutated, no throwing for author error (a rule break is a
 * structured finding, never an exception and never a silent clamp).
 */

/** A rectangle in world pixels, HALF-OPEN: `w` and `h` are extents. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The engine's form: INCLUSIVE far edges. A one-pixel column is `x0 === x1`.
 * Produced only at the boundary, by `toInclusive`, and consumed only by the
 * rule checks, which are transcribed from aeon in exactly these terms.
 */
export interface InclusiveBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * ONE RECTANGLE BELONGING TO ONE REGION.
 *
 * WHY PIECES AND NOT `{id, rects[]}`. The landed contract carries ONE `rect`
 * per `regions[]` entry (`AURORA_REGIONS_SCHEMA.md` §2), and the engine's row is
 * one rectangle too; the editor spec's §2.1 states the engine's reading of it,
 * that "two rows naming the same `rg_effects` are the same region for every
 * engine purpose; an L-shape is two rows". Cutting produces up to four pieces
 * out of one, so a region's area is a SET of pieces sharing an id, and that is
 * the shape that survives both serialisations without this module having to pick
 * one. `regionRects` gathers a region's pieces back up when a caller wants them
 * together.
 */
export interface RegionPiece {
  id: string;
  rect: Rect;
}

/** True when the rectangle covers no pixel at all. */
export function isEmptyRect(r: Rect): boolean {
  return r.w <= 0 || r.h <= 0;
}

/** Pixel count. Zero for an empty rectangle, never negative. */
export function rectArea(r: Rect): number {
  return isEmptyRect(r) ? 0 : r.w * r.h;
}

/** Total pixel count over a set, which is the area of the UNION only when the set is disjoint. */
export function totalArea(rects: readonly Rect[]): number {
  let sum = 0;
  for (const r of rects) sum += rectArea(r);
  return sum;
}

/** Half-open containment. A rectangle does not contain the pixel at its far edge. */
export function rectContainsPoint(r: Rect, x: number, y: number): boolean {
  return !isEmptyRect(r) && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/**
 * The overlapping part of two rectangles, or null.
 *
 * EDGE-TOUCHING IS NOT OVERLAP, which is the half-open form earning its place:
 * `{x: 0, w: 10}` and `{x: 10, w: 10}` share no pixel and this returns null, so
 * a draw that abuts an existing region trims nothing off it.
 */
export function intersectRects(a: Rect, b: Rect): Rect | null {
  if (isEmptyRect(a) || isEmptyRect(b)) return null;
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** True when the two rectangles share at least one pixel. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return intersectRects(a, b) !== null;
}

/**
 * `existing` MINUS `incoming`: the disjoint pieces of `existing` that survive.
 *
 * THE PRIMITIVE EVERYTHING ELSE IS BUILT FROM, and where the bugs live. It
 * returns between zero and four rectangles, always in the same order (above,
 * below, left, right), so a draw is deterministic and two runs of the editor
 * produce the same set:
 *
 *   0 pieces  `incoming` covers `existing` entirely
 *   1 piece   no overlap at all (`existing` comes back), or a cut off one side
 *   2 pieces  a cut straight through, splitting the rectangle in two
 *   3 pieces  a notch out of one edge
 *   4 pieces  a hole punched in the middle
 *
 * The left and right pieces are cut to the OVERLAP's rows, not the whole
 * rectangle's, which is what keeps the four pieces from sharing pixels with the
 * above and below pieces.
 */
export function subtractRect(existing: Rect, incoming: Rect): Rect[] {
  if (isEmptyRect(existing)) return [];
  const clip = intersectRects(existing, incoming);
  if (clip === null) return [{ x: existing.x, y: existing.y, w: existing.w, h: existing.h }];

  const ex1 = existing.x + existing.w;
  const ey1 = existing.y + existing.h;
  const cx1 = clip.x + clip.w;
  const cy1 = clip.y + clip.h;
  const out: Rect[] = [];

  if (clip.y > existing.y) out.push({ x: existing.x, y: existing.y, w: existing.w, h: clip.y - existing.y });
  if (cy1 < ey1) out.push({ x: existing.x, y: cy1, w: existing.w, h: ey1 - cy1 });
  if (clip.x > existing.x) out.push({ x: existing.x, y: clip.y, w: clip.x - existing.x, h: clip.h });
  if (cx1 < ex1) out.push({ x: cx1, y: clip.y, w: ex1 - cx1, h: clip.h });

  return out;
}

/** Every rectangle of `existing`, each cut by `incoming`, flattened. Empties never survive. */
export function subtractRectFromSet(existing: readonly Rect[], incoming: Rect): Rect[] {
  const out: Rect[] = [];
  for (const r of existing) {
    for (const piece of subtractRect(r, incoming)) out.push(piece);
  }
  return out;
}

/** What a draw did, beyond the new set: which regions lost area and which lost all of it. */
export interface DrawResult {
  /** The new, disjoint set. The drawn region's piece is last. */
  pieces: RegionPiece[];
  /** Ids whose area was reduced by this draw, each named once, in encounter order. */
  trimmedIds: string[];
  /**
   * Ids that had area before this draw and have none after.
   *
   * THEY ARE NOT DROPPED FROM `pieces` BY THIS FUNCTION because they have no
   * pieces left to drop; the id survives only in the caller's document, where its
   * bindings live. An emptied region is an author-visible event (the editor shows
   * it, the author either redraws it or deletes it), never a silent deletion of
   * the preset and scene they bound to it.
   */
  emptiedIds: string[];
}

/**
 * APPLY A DRAW: the new region takes its rectangle, every existing region is cut
 * by it, and the result is disjoint by construction.
 *
 * Drawing with an id that already has pieces REPLACES that region's area with
 * the new rectangle, because its old pieces are cut by the draw like anyone
 * else's and the new piece is then appended. A caller that means "add to this
 * region" calls this once per rectangle and keeps both pieces; that is the same
 * operation, so there is no second code path for it.
 */
export function applyDraw(pieces: readonly RegionPiece[], draw: RegionPiece): DrawResult {
  const next: RegionPiece[] = [];
  const trimmedIds: string[] = [];
  const emptiedIds: string[] = [];
  const hadArea = new Set<string>();
  const keepsArea = new Set<string>();

  if (isEmptyRect(draw.rect)) {
    for (const p of pieces) next.push({ id: p.id, rect: { ...p.rect } });
    return { pieces: next, trimmedIds, emptiedIds };
  }

  for (const p of pieces) {
    hadArea.add(p.id);
    const survivors = subtractRect(p.rect, draw.rect);
    if (survivors.length !== 1 || rectArea(survivors[0]) !== rectArea(p.rect)) {
      if (!trimmedIds.includes(p.id)) trimmedIds.push(p.id);
    }
    for (const rect of survivors) {
      next.push({ id: p.id, rect });
      keepsArea.add(p.id);
    }
  }

  for (const id of hadArea) {
    if (!keepsArea.has(id) && id !== draw.id) emptiedIds.push(id);
  }

  next.push({ id: draw.id, rect: { ...draw.rect } });
  return { pieces: next, trimmedIds, emptiedIds };
}

/** What a delete gave back to UNASSIGNED. */
export interface DeleteResult {
  pieces: RegionPiece[];
  /** The rectangles the region held. They are now unassigned, not a neighbour's. */
  vacated: Rect[];
}

/**
 * Remove a region. Its area becomes UNASSIGNED and nothing grows into it.
 *
 * There is no merge, no nearest-neighbour, no fallback: with the act's identity
 * carried by regions alone, "whose is it now" has no answer but "nobody's", and
 * the build refuses the act until an author gives it to someone.
 */
export function deleteRegion(pieces: readonly RegionPiece[], id: string): DeleteResult {
  const next: RegionPiece[] = [];
  const vacated: Rect[] = [];
  for (const p of pieces) {
    if (p.id === id) vacated.push({ ...p.rect });
    else next.push({ id: p.id, rect: { ...p.rect } });
  }
  return { pieces: next, vacated };
}

/** Every rectangle belonging to one region, in set order. */
export function regionRects(pieces: readonly RegionPiece[], id: string): Rect[] {
  return pieces.filter((p) => p.id === id).map((p) => ({ ...p.rect }));
}

/** A pair of pieces that share pixels, with the shared rectangle itself. */
export interface OverlapFinding {
  indexA: number;
  indexB: number;
  idA: string;
  idB: string;
  rect: Rect;
}

/** The answer to "does this set tile without overlapping". */
export interface DisjointnessResult {
  disjoint: boolean;
  /** Every overlapping pair, not just the first: an author fixing one wants to see the rest. */
  overlaps: OverlapFinding[];
}

/**
 * Prove the set has no two pieces sharing a pixel.
 *
 * Usable as a test invariant and, later, at save time. Pieces of the SAME region
 * are checked against each other too: a region whose own rectangles overlap
 * would double-count in `coverage` and would emit two engine rows covering one
 * pixel, which is the exact thing aeon's `region_first_overlap` refuses.
 */
export function disjointness(pieces: readonly RegionPiece[]): DisjointnessResult {
  const overlaps: OverlapFinding[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const rect = intersectRects(pieces[i].rect, pieces[j].rect);
      if (rect !== null) {
        overlaps.push({ indexA: i, indexB: j, idA: pieces[i].id, idB: pieces[j].id, rect });
      }
    }
  }
  return { disjoint: overlaps.length === 0, overlaps };
}

/** What is covered, what is not, and what is outside the act entirely. */
export interface CoverageResult {
  /** The act's area, in pixels. */
  actArea: number;
  /** Area held by regions, counted INSIDE the act only. */
  assignedArea: number;
  /** Area inside the act that no region holds. */
  unassignedArea: number;
  /** That area as rectangles, disjoint, deterministic. Empty means the act is fully painted. */
  unassigned: Rect[];
  /**
   * Pieces reaching outside the act, with the part that is outside.
   *
   * Kept apart from `unassigned` on purpose: a rectangle hanging off the act is
   * an author error the schema does not catch (`AURORA_REGIONS_SCHEMA.md` §6),
   * not a hole, and clamping it here would be the silent fix this module refuses
   * to make.
   */
  outside: Array<{ index: number; id: string; rect: Rect }>;
}

/**
 * The UNASSIGNED area, as rectangles: the act minus every region piece.
 *
 * Computed by subtraction rather than by scanning pixels, so it is exact at any
 * act size and its output is the same shape a draw produces.
 */
export function coverage(act: Rect, pieces: readonly RegionPiece[]): CoverageResult {
  let remaining: Rect[] = isEmptyRect(act) ? [] : [{ ...act }];
  let assignedArea = 0;
  const outside: Array<{ index: number; id: string; rect: Rect }> = [];

  for (let i = 0; i < pieces.length; i += 1) {
    const p = pieces[i];
    const inside = intersectRects(p.rect, act);
    if (inside === null) {
      if (!isEmptyRect(p.rect)) outside.push({ index: i, id: p.id, rect: { ...p.rect } });
    } else {
      assignedArea += rectArea(inside);
      if (rectArea(inside) !== rectArea(p.rect)) {
        for (const out of subtractRect(p.rect, act)) outside.push({ index: i, id: p.id, rect: out });
      }
    }
    remaining = subtractRectFromSet(remaining, p.rect);
  }

  return {
    actArea: rectArea(act),
    assignedArea,
    unassignedArea: totalArea(remaining),
    unassigned: sortRects(remaining),
    outside,
  };
}

/** Which region owns a point. */
export type ResolveResult =
  | { kind: 'region'; id: string; pieceIndex: number }
  | { kind: 'unassigned' }
  /**
   * More than one piece contains the point. IMPOSSIBLE in a disjoint set, which
   * is why it is an ANSWER and not a first match: a resolver that returned the
   * first hit would paper over exactly the defect `disjointness` exists to find,
   * and the editor would show one identity while the engine, scanning its own
   * table in its own order, installed the other.
   */
  | { kind: 'ambiguous'; ids: string[]; pieceIndexes: number[] };

/** Resolve a world pixel to its region, or to "nobody's", or to the defect. */
export function resolveRegion(pieces: readonly RegionPiece[], x: number, y: number): ResolveResult {
  const pieceIndexes: number[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    if (rectContainsPoint(pieces[i].rect, x, y)) pieceIndexes.push(i);
  }
  if (pieceIndexes.length === 0) return { kind: 'unassigned' };
  if (pieceIndexes.length === 1) {
    return { kind: 'region', id: pieces[pieceIndexes[0]].id, pieceIndex: pieceIndexes[0] };
  }
  return { kind: 'ambiguous', ids: pieceIndexes.map((i) => pieces[i].id), pieceIndexes };
}

/**
 * Deterministic order for a rectangle set: top to bottom, then left to right.
 * Two runs that cover the same area produce the same list, which is what a
 * golden fixture and an undo history both need.
 */
export function sortRects(rects: readonly Rect[]): Rect[] {
  return [...rects].map((r) => ({ ...r })).sort((a, b) => (
    a.y - b.y || a.x - b.x || a.h - b.h || a.w - b.w
  ));
}

/**
 * Merge rectangles that are adjacent and would form a rectangle, until no pair
 * can merge. The union is unchanged; only the decomposition gets coarser.
 *
 * WHY IT IS HERE AND NOT LEFT TO THE GENERATOR. Subtraction fragments: draw
 * three regions across an act and the first one is four pieces that are visibly
 * one shape. The per-rect rules then fire on fragments an author never drew,
 * which would teach them to distrust the rules. The generator does the same step
 * for the same reason, as the editor spec's §5.2 step 3 ("merge adjacent pieces
 * with identical resolved bindings where the merge is a rectangle"), and the
 * shape of it is pure geometry, so it lives with the rest of the geometry.
 *
 * SCOPE CALL, recorded rather than assumed: this was not one of the operations
 * the parcel named. It is included because without it `applyDraw`'s output
 * fragments without bound across an editing session.
 */
export function coalesceRects(rects: readonly Rect[]): Rect[] {
  let work = sortRects(rects).filter((r) => !isEmptyRect(r));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < work.length; i += 1) {
      for (let j = i + 1; j < work.length; j += 1) {
        const a = work[i];
        const b = work[j];
        const sameRows = a.y === b.y && a.h === b.h;
        const sameCols = a.x === b.x && a.w === b.w;
        if (sameRows && (a.x + a.w === b.x || b.x + b.w === a.x)) {
          const x = Math.min(a.x, b.x);
          work = work.filter((_, k) => k !== i && k !== j);
          work.push({ x, y: a.y, w: a.w + b.w, h: a.h });
          merged = true;
          break outer;
        }
        if (sameCols && (a.y + a.h === b.y || b.y + b.h === a.y)) {
          const y = Math.min(a.y, b.y);
          work = work.filter((_, k) => k !== i && k !== j);
          work.push({ x: a.x, y, w: a.w, h: a.h + b.h });
          merged = true;
          break outer;
        }
      }
    }
  }
  return sortRects(work);
}

// ---------------------------------------------------------------------------
// The boundary: half-open here, inclusive in the engine
// ---------------------------------------------------------------------------

/**
 * Half-open rectangle to the engine's inclusive bounds: `x1 = x + w - 1`.
 *
 * Returns null for an empty rectangle rather than emitting `x1 < x0`, because
 * aeon's own `ensure` names that shape as the one that "contains no point" and
 * refuses it. A one-pixel column converts to `x0 === x1`, which is that same
 * `ensure`'s stated legal minimum.
 *
 * AURORA DOES NOT WRITE INCLUSIVE BOUNDS ANYWHERE. This exists because the
 * per-rect rules below are aeon's, written in aeon's terms, and are applied in
 * them. The document's conversion is the generator's, and the editor spec's §5.1
 * keeps it that way so there is one conversion site in the suite.
 */
export function toInclusive(r: Rect): InclusiveBounds | null {
  if (isEmptyRect(r)) return null;
  return { x0: r.x, x1: r.x + r.w - 1, y0: r.y, y1: r.y + r.h - 1 };
}

/** The inverse. `w = x1 - x0 + 1`, so an inclusive one-pixel column comes back as `w === 1`. */
export function fromInclusive(b: InclusiveBounds): Rect {
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 };
}

// ---------------------------------------------------------------------------
// The two per-rect rules
// ---------------------------------------------------------------------------

/**
 * The numbers the rules are made of. EVERY ONE BELONGS TO AEON and none is
 * defined in this file.
 *
 * Their home is aeon's `games/sonic4/data/levels/ojz/act1/act_descriptor.emp`,
 * around `ojz_region()`, over the camera constants it imports from
 * `engine/system/constants.emp`. The app sources them from the open project; the
 * tests derive them from aeon at a committed revision through git objects. A
 * default value here would be a second home for a number that moves when aeon's
 * camera or act grid moves, and it would keep being wrong quietly.
 */
export interface RegionRules {
  /** The act's width in world pixels, EXCLUSIVE. Aeon: `ACT_W = GRID_W << SECTION_SIZE_SHIFT`. */
  actW: number;
  /** The act's height in world pixels, EXCLUSIVE. Aeon: `ACT_H`. */
  actH: number;
  /** Aeon: `REGION_MIN_SPAN = 2 * CAM_MAX_Y_STEP`. The camera can step over anything narrower. */
  minSpan: number;
  /** Aeon: `CENTRE_X_MIN = CAM_SCREEN_HALF_W`. */
  centreXMin: number;
  /** Aeon: `CENTRE_X_MAX = ACT_W - SCREEN_WIDTH + CAM_SCREEN_HALF_W`. */
  centreXMax: number;
  /** Aeon: `CENTRE_Y_MIN = CAM_SCREEN_HALF_H`. */
  centreYMin: number;
  /** Aeon: `CENTRE_Y_MAX = ACT_H - SCREEN_HEIGHT + CAM_SCREEN_HALF_H`. */
  centreYMax: number;
}

/**
 * What went wrong, by name. The codes are stable; the messages are for a person.
 *
 * `inverted`, `negative-edge` and `outside-act` are aeon's other three per-row
 * `ensure`s, carried here so the editor refuses the same rectangles the build
 * would, rather than discovering three of the seven at build time.
 */
export type RegionRuleCode =
  | 'inverted'
  | 'negative-edge'
  | 'outside-act'
  | 'min-span'
  | 'edge-left-unreachable'
  | 'edge-right-unreachable'
  | 'edge-top-unreachable'
  | 'edge-bottom-unreachable'
  | 'overlap'
  | 'unassigned';

/**
 * One thing wrong with one rectangle, or with the set.
 *
 * SHAPED SO A CHECK THIS PARCEL DOES NOT OWN HAS AN OBVIOUS HOME. The contract's
 * §5 names one that is coming and that no schema can make: `bg.span` against the
 * layout it refers to. A future check adds a code and pushes a finding with the
 * region it belongs to; it does not need a second result type or a second call.
 */
export interface RegionFinding {
  code: RegionRuleCode;
  /** The region the finding is about, or null for a finding about the act's empty space. */
  regionId: string | null;
  /** Index into the set the finding was produced from, or null. */
  pieceIndex: number | null;
  /** The rectangle at fault, or the unassigned/overlapping rectangle itself. */
  rect: Rect;
  /** A sentence for a person. Never thrown, never logged from here. */
  message: string;
}

/**
 * Check ONE rectangle against the per-rect rules.
 *
 * NEVER THROWS AND NEVER CLAMPS. It returns what is wrong, so the caller decides
 * whether that is a red badge in a panel or a refusal at save. An empty array is
 * the rectangle passing.
 *
 * The rules are transcribed from aeon's `ojz_region()` and evaluated in aeon's
 * inclusive terms. The reachable-edge rule is not symmetric between the low and
 * high edge, and the asymmetry is real, not a slip in the transcription: aeon
 * asks `x0 - 1 >= CENTRE_X_MIN` on the LEFT edge, because the camera centre must
 * be able to stand on the pixel BEFORE it to cross into the region, and
 * `x1 + 1 <= CENTRE_X_MAX` on the RIGHT, for the pixel after it. The act's own
 * outer edges are exempt: nothing has to cross into the act from outside it.
 */
/** Just the act's own extent — everything `validateRectInAct` needs. */
export interface ActExtentRules {
  /** The act's width in world pixels, EXCLUSIVE. Aeon: `ACT_W = GRID_W << SECTION_SIZE_SHIFT`. */
  actW: number;
  /** The act's height in world pixels, EXCLUSIVE. Aeon: `ACT_H`. */
  actH: number;
}

/**
 * The three per-rect rules that need NOTHING but the act's size: `inverted`
 * (`w, h >= 1`), `negative-edge` and `outside-act`.
 *
 * ═══ WHY THIS IS A SEPARATE ENTRY POINT AND NOT A FLAG ON `validateRect` ═══
 *
 * Because of what Aurora does and does not have. `validateRect`'s other four
 * rules — `min-span` and the reachable-edge family — need
 * `CENTRE_{X,Y}_{MIN,MAX}` and `REGION_MIN_SPAN`, which live in the act's `.emp`
 * descriptor. The LOAD does not have them (see the regions seam review,
 * "three of aeon's six per-row rules are unreachable from here"), so the
 * load-time notices can report exactly these three and no more. They are
 * §2.5 rule 2 of the editor spec, whole.
 *
 * Calling `validateRect` with invented camera constants and filtering its
 * findings would be worse in the way this repo keeps paying for: a number with
 * no source, quietly producing verdicts. Calling it with real constants is what
 * the FACET will do once it reads the descriptor, and `validateRect` is still
 * the entry point for that.
 *
 * NEVER THROWS AND NEVER CLAMPS; an empty array is the rectangle passing.
 */
export function validateRectInAct(
  rect: Rect,
  act: ActExtentRules,
  context: { regionId?: string | null; pieceIndex?: number | null } = {},
): RegionFinding[] {
  const regionId = context.regionId ?? null;
  const pieceIndex = context.pieceIndex ?? null;
  const found: RegionFinding[] = [];
  const add = (code: RegionRuleCode, message: string): void => {
    found.push({ code, regionId, pieceIndex, rect: { ...rect }, message });
  };
  const where = regionId === null ? 'this rectangle' : `region "${regionId}"`;

  const b = toInclusive(rect);
  if (b === null) {
    add(
      'inverted',
      `${where} has an extent of ${rect.w} by ${rect.h}, which contains no pixel. `
      + 'Both w and h must be at least 1.',
    );
    return found;
  }

  if (b.x0 < 0 || b.y0 < 0) {
    add(
      'negative-edge',
      `${where} starts at (${b.x0}, ${b.y0}), which is outside every act: world pixels start at 0.`,
    );
  }

  if (b.x1 >= act.actW || b.y1 >= act.actH) {
    add(
      'outside-act',
      `${where} reaches (${b.x1}, ${b.y1}), past the act, whose last pixel is `
      + `(${act.actW - 1}, ${act.actH - 1}). No camera centre can stand there.`,
    );
  }

  return found;
}

export function validateRect(
  rect: Rect,
  rules: RegionRules,
  context: { regionId?: string | null; pieceIndex?: number | null } = {},
): RegionFinding[] {
  const regionId = context.regionId ?? null;
  const pieceIndex = context.pieceIndex ?? null;
  const found: RegionFinding[] = [];
  const add = (code: RegionRuleCode, message: string): void => {
    found.push({ code, regionId, pieceIndex, rect: { ...rect }, message });
  };
  const where = regionId === null ? 'this rectangle' : `region "${regionId}"`;

  // The three ACT-ONLY rules, through their own entry point so there is ONE
  // transcription of each — see `validateRectInAct` for who else calls it and
  // why it is separate.
  found.push(...validateRectInAct(rect, rules, context));
  const b = toInclusive(rect);
  if (b === null) return found;

  if (rect.w < rules.minSpan || rect.h < rules.minSpan) {
    add(
      'min-span',
      `${where} is ${rect.w} by ${rect.h}, narrower than the minimum span of ${rules.minSpan} px `
      + 'on an axis. The camera can step over it in one frame and never notice it.',
    );
  }

  if (!(b.x0 === 0 || (b.x0 - 1 >= rules.centreXMin && b.x0 <= rules.centreXMax))) {
    add(
      'edge-left-unreachable',
      `the left edge of ${where}, at x = ${b.x0}, is outside the camera centre's reachable band `
      + `[${rules.centreXMin}, ${rules.centreXMax}], so it can never be crossed and the region `
      + 'can never be entered from the left.',
    );
  }

  if (!(b.x1 === rules.actW - 1 || (b.x1 >= rules.centreXMin && b.x1 + 1 <= rules.centreXMax))) {
    add(
      'edge-right-unreachable',
      `the right edge of ${where}, at x = ${b.x1}, is outside the camera centre's reachable band `
      + `[${rules.centreXMin}, ${rules.centreXMax}], so it can never be crossed.`,
    );
  }

  if (!(b.y0 === 0 || (b.y0 - 1 >= rules.centreYMin && b.y0 <= rules.centreYMax))) {
    add(
      'edge-top-unreachable',
      `the top edge of ${where}, at y = ${b.y0}, is outside the camera centre's reachable band `
      + `[${rules.centreYMin}, ${rules.centreYMax}], so it can never be crossed.`,
    );
  }

  if (!(b.y1 === rules.actH - 1 || (b.y1 >= rules.centreYMin && b.y1 + 1 <= rules.centreYMax))) {
    add(
      'edge-bottom-unreachable',
      `the bottom edge of ${where}, at y = ${b.y1}, is outside the camera centre's reachable band `
      + `[${rules.centreYMin}, ${rules.centreYMax}], so it can never be crossed.`,
    );
  }

  return found;
}

/** Everything wrong with a whole set, per rectangle and across it. */
export interface RegionSetValidation {
  findings: RegionFinding[];
  disjoint: DisjointnessResult;
  coverage: CoverageResult;
  /** True when nothing is wrong: every rectangle legal, no overlap, no unassigned pixel. */
  ok: boolean;
}

/**
 * Validate a whole region set against the act and the rules.
 *
 * The three set-level answers are the ones a schema cannot give
 * (`AURORA_REGIONS_SCHEMA.md` §6): inside the act, disjoint, and tiling. An
 * unassigned rectangle is reported as a finding, because that is the state the
 * build refuses and the editor paints red.
 */
export function validateRegionSet(
  pieces: readonly RegionPiece[],
  act: Rect,
  rules: RegionRules,
): RegionSetValidation {
  const findings: RegionFinding[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    for (const f of validateRect(pieces[i].rect, rules, { regionId: pieces[i].id, pieceIndex: i })) {
      findings.push(f);
    }
  }

  const disjoint = disjointness(pieces);
  for (const o of disjoint.overlaps) {
    findings.push({
      code: 'overlap',
      regionId: o.idA,
      pieceIndex: o.indexA,
      rect: o.rect,
      message: `regions "${o.idA}" and "${o.idB}" both hold the ${o.rect.w} by ${o.rect.h} `
        + `rectangle at (${o.rect.x}, ${o.rect.y}). Identity must be a function of the camera `
        + 'centre alone; where two regions overlap it depends on scan order instead.',
    });
  }

  const cov = coverage(act, pieces);
  for (const rect of cov.unassigned) {
    findings.push({
      code: 'unassigned',
      regionId: null,
      pieceIndex: null,
      rect,
      message: `the ${rect.w} by ${rect.h} area at (${rect.x}, ${rect.y}) belongs to no region. `
        + 'A place with no identity is refused by the build; give it to a region.',
    });
  }

  return { findings, disjoint, coverage: cov, ok: findings.length === 0 };
}
