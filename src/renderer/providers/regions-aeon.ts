// THE REGIONS PANEL'S DERIVATIONS — editor spec §3.4, the list and the bindings
// rows. Pure: plain data in, plain data out, no store reads, no React, no I/O.
// The components in `components/regions/` render exactly what this produces, so
// every sentence on screen is under a node test.
//
// ═══ THREE THINGS §3.4's PROSE SAYS THAT THE LANDED CONTRACT DOES NOT ══════
//
// §3.4 and §2.3 were written under the PAINTER'S-ORDER model, which the owner's
// Q1 ruling of 2026-09-14T14:54:34Z overturned ("Yeah probablyy go with how we
// think about it" = A, cut right away). The spec carries supersession banners on
// §2.3, §2.5, §3.2 and §5.2 but NOT on §3.4, and §3.4 is the section that draws
// the panel — so three of its sentences have no referent in the document this
// panel edits, and each one is answered here rather than silently dropped:
//
//   1. "top to bottom in painter's order with the topmost entry first". There is
//      no painter's order: `region-geometry.ts`'s header states the ruled model
//      in as many words — "There is NO painter's order here, no layering, no
//      z-index … list order carries no meaning". `regionListRows` therefore
//      preserves DOCUMENT ORDER exactly, 1:1 with `regions[]`, and sorts
//      nothing. A sort would invent a mapping between list index and document
//      index that step 8's editing would then have to maintain, in service of an
//      order the ruling deleted.
//
//   2. "the act `defaults` as a fixed bottom row labelled 'act'". There is no
//      `defaults` object: the landed contract is `{schema, act, regions[]}`
//      (`aurora-regions.schema.json`, the §2.3 banner). The act row survives
//      anyway, and it is NOT a fossil, because three of the four bindings are
//      genuinely nullable and a null genuinely resolves act-side —
//      `Act.sceneRef` for `scene`, nothing at all for `raster`, the act's own
//      background for `bg`. So the row shows what a null inherits FROM. What it
//      cannot show is a preset: `preset` is `required` and non-null per region
//      in the schema, and the engine has no act-level preset at all (§2.3's own
//      reason for making it required), which is why `preset`'s badge is a third
//      kind rather than "explicit".
//
//   3. "a listed region entirely covered by later ones is marked 'hidden'".
//      IMPOSSIBLE under the ruling: regions are disjoint, so no region is ever
//      covered and nothing can be hidden. The hazard the mark existed for — "a
//      region that paints nothing is never a mystery" — has a different shape
//      now, and it is the one the ruling CREATED: overlap is no longer legal
//      layering but a rule violation a hand-edited file can carry, and where two
//      regions share a pixel the engine's answer depends on its own scan order.
//      So the list mark is `overlaps <other id>`, derived from `disjointness`,
//      and it names the other region. That is a SUBSTITUTION, not a
//      transcription, and it is flagged for the owner in
//      `docs/reviews/2026-09-16-regions-step6.md`.
//
// ═══ THE BACKGROUND IS NAMED IN WORDS ON EVERY ROW, UNCONDITIONALLY ════════
//
// Ruling `docs/superpowers/notes/2026-09-16-region-background-label-ruling.md`
// at empyrean `origin/main`: ALWAYS. "The background's name is the second line
// of every region label whenever the Regions facet is shown, in every act,
// including the all-shared launch state." The ruling's subject is the MAP label,
// which is step 8; `regionBgLabel` is that sentence's one derivation and the
// list row is its first reader, so step 8 inherits the function rather than
// re-deciding the question. Its three arms are the ruling's own: the resolved
// name, `act` for the act's own background, and `MISSING <id>` in the warning
// tone for a dangling ref (the ruling's reason 3 — the arm that makes the
// conditional version three states rather than two).
//
// NEVER CONDITIONAL ON THERE BEING A SECOND BACKGROUND, and never signalled by
// absence. The ruling's reason 4 is the tree's own rule, cited from four other
// files: represent a state, never represent it by absence.

import type { Region, RegionRect, RegionsDocument } from '../../core/formats/regions/document';
import type { Act, BgLibraryEntry, S4Project, Section } from '../../core/model/s4-types';
import { SECTION_PIXEL_SIZE } from '../../core/model/s4-types';
import { regionBindingVocabulary } from '../../core/formats/regions/vocabulary';
import type { Notice } from '../../core/project/notice';
import type { SetRegionsCommand } from '../../core/editing/commands';
import { cloneRegionsDocument } from '../../core/formats/regions/act-regions';
import {
  BG_ACT_SENTINEL,
  regionsValidationNotices,
  type ActExtent,
  type RegionBindingVocabulary,
} from '../../core/formats/regions/validate';
import {
  coverage,
  disjointness,
  validateRect,
  validateRectInAct,
  type RegionPiece,
} from '../../core/editing/region-geometry';
import {
  regionRulesNotRead,
  type RegionRuleResolution,
} from '../../core/formats/regions/act-constants';
// THE OVERLAY'S `unionBounds`, IMPORTED AND NOT COPIED. Both modules are under
// `src/renderer`, so this import is legal where a `src/core` one would not be,
// and a second copy of the arithmetic is how the panel's box and the map's
// label anchor come to disagree about where a carved region is.
import { unionBounds } from '../canvas/region-overlay';

// ---------------------------------------------------------------------------
// The act's side of the two-level inheritance
// ---------------------------------------------------------------------------

/**
 * What a region's `null` binding resolves to, act-side.
 *
 * ⚠ THESE ARE THE ACT'S VALUES, NOT A DOCUMENT'S. There is no `defaults` object
 * in `regions.json` (see the header); each field below has a different real
 * home, and naming them here is what keeps the panel from inventing one.
 */
export interface ActBindingDefaults {
  /**
   * `Act.sceneRef` — the act's default effects scene, or null meaning the
   * engine's hand-authored `act_parallax_config` stands. Null is shown as
   * `default`, the same word `sceneRefOptions` already uses ("Act default").
   */
  sceneRef: string | null;
  /**
   * ALWAYS NULL TODAY, and typed `null` rather than `string | null` so that a
   * future act-level raster binding is a type change somebody has to make on
   * purpose. There is no act-level `rasterRef` anywhere in this repository:
   * `Section.rasterRef` is per section and `Act` has no counterpart. Shown as
   * `none`, which is the mock's own word for it.
   */
  rasterRef: null;
  /**
   * The act's own `bg.layoutRef` default. `@act` — the sentinel
   * `resolveDisplayedBg` already uses — is the only value the generator accepts
   * today (§2.3's rule 6), so this is `BG_ACT_SENTINEL` until part 2 lands.
   */
  bgLayoutRef: string;
}

/** The act defaults as they stand for an act whose `sceneRef` is `actSceneRef`. */
export function actBindingDefaults(actSceneRef: string | null): ActBindingDefaults {
  return { sceneRef: actSceneRef, rasterRef: null, bgLayoutRef: BG_ACT_SENTINEL };
}

// ---------------------------------------------------------------------------
// The background label — the 2026-09-16 ruling's one derivation
// ---------------------------------------------------------------------------

/** A background name plus whether naming it is a warning. */
export interface RegionBgLabel {
  /** The words. Never empty, never conditional — see the header. */
  text: string;
  /** True only for the dangling arm, which the ruling puts in the warning tone. */
  missing: boolean;
}

/**
 * The background this region resolves to, named in words. ALWAYS.
 *
 * Three arms, and the third is why the conditional design the ruling rejected
 * would have been three states rather than two:
 *   • a library entry            → its `name`
 *   • `@act`, or null inheriting a `@act` act default → `act`
 *   • an id the BG library does not hold → `MISSING <id>`, `missing: true`
 *
 * ⚠ THE NAME, NOT THE ID. `BgLibraryEntry` carries both and they differ; the
 * ruling's worked example is `bg Forest`, which is a name. An id would be the
 * same machine-shaped string the binding row already shows.
 */
export function regionBgLabel(
  layoutRef: string | null | undefined,
  defaults: ActBindingDefaults,
  bgLibrary: readonly BgLibraryEntry[],
): RegionBgLabel {
  const ref = layoutRef ?? defaults.bgLayoutRef;
  if (ref === BG_ACT_SENTINEL) return { text: 'act', missing: false };
  const entry = bgLibrary.find((b) => b.id === ref);
  if (entry) return { text: entry.name, missing: false };
  return { text: `MISSING ${ref}`, missing: true };
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/**
 * One row of the region list: ONE ROW PER REGION `id`, in first-appearance
 * document order.
 *
 * ⚠ ONE ROW PER ID, NOT PER `regions[]` ENTRY — changed at step 8B. A region
 * with several rectangles is several entries sharing an `id` (forced by the
 * contract: one `rect` per entry, an L-shape is two engine rows, a carve splits
 * one rect into up to four — `applyRegionGestureToDocument`'s docblock), and a
 * 1:1 mapping listed an L-shaped region TWICE, as two selectable rows that
 * select the same region, carry the same bindings, and differ only in a
 * rectangle the panel cannot edit. Latent until 8B wired the gesture layer.
 *
 * FIRST-APPEARANCE ORDER, AND STILL NO SORT: the header's point 1 stands — list
 * order carries no meaning and nothing here reorders anything. Grouping by id
 * only removes repeats; each id keeps the position of its first entry.
 */
export interface RegionListRow {
  /**
   * Index into `doc.regions` of this region's FIRST entry.
   *
   * ⚠ ITS MEANING CHANGED AT 8B: it is no longer "the row's position", because
   * a row can cover several entries. It is kept because a row still needs one
   * canonical entry to stand for it, and the first one is that entry
   * everywhere else too — `regionsPanelState` resolves `selected` with
   * `.find()`, and `applyRegionGestureToDocument` takes its bindings template
   * from the id's first entry. SELECTION IS BY ID (`selectedRegionId`), never by
   * this number.
   */
  index: number;
  /**
   * EVERY `doc.regions` index this row covers, in document order. Length ≥ 1,
   * and > 1 exactly when the region is several rectangles.
   *
   * Added ALONGSIDE `index` rather than folded into it: the per-entry view is a
   * real question (which rows of the file does this region own) and a caller
   * that needs it must not have to re-derive it by scanning for the id.
   */
  entryIndices: number[];
  id: string;
  /** `name` when the document carries one, else the id. Never empty. */
  label: string;
  /**
   * THE UNION BOUNDS OF EVERY PIECE — `unionBounds`, imported from the overlay
   * rather than copied, so the panel's box and the map's label anchor are the
   * same arithmetic.
   *
   * ⚠ FOR A CARVED REGION THIS IS NOT THE REGION'S SHAPE. An L-shape's bounds
   * include the notch that was carved out of it. `rects` below is what makes
   * that legible instead of silent: a row showing bounds as if they were the
   * shape is the quiet lie this pair exists to prevent, and the panel says
   * "N rects" from it.
   */
  rect: RegionRect;
  /**
   * Every piece's own rectangle, in document order. `rects.length` is the row's
   * rectangle count — §3.4's mock prints exactly that ("1 rect", "2 rects").
   */
  rects: RegionRect[];
  /** The background, in words, always (the 2026-09-16 ruling). */
  bg: RegionBgLabel;
  /**
   * Ids of OTHER regions this one shares pixels with. EMPTY IS THE NORMAL CASE
   * and means the set is disjoint, which is what the ruling requires. A
   * non-empty list is the successor to §3.4's "hidden" mark — see the header.
   *
   * ⚠ A REGION NEVER NAMES ITSELF HERE, even when two of its own entries
   * overlap. The hazard this mark exists for is the one the Q1 ruling created:
   * "where two regions share a pixel the engine's answer depends on its own
   * scan order". Two entries of ONE id are not that — every scan order answers
   * with the same region — so `overlaps: ['forest']` on forest's own row would
   * be a warning about nothing, in the field an author reads to find out which
   * OTHER region to move. It is not dropped from the panel either: a same-id
   * overlap is still counted and named as a pair by the `overlap` status row.
   */
  overlaps: string[];
}

/**
 * THE ACT ROW'S REASON, IN WORDS ON THE ROW.
 *
 * ⚠ IT LIVES HERE, AND NOT ONLY IN A `title=`. Until the 2026-09-16 ruling on
 * §3.4's three open calls (`docs/superpowers/notes/
 * 2026-09-16-regions-panel-three-calls.md`, CALL 3) this sentence was a tooltip
 * on the act row's `Card` and nothing else, which is a state represented by the
 * absence of a control plus a hover — the same house rule CALL 1's `ok` arm is
 * about. A tooltip is not a representation: an author who never hovers never
 * learns why the row does not take a click.
 *
 * WHY THE ROW IS READ-ONLY, AND WHY THAT IS A SCOPING RATHER THAN A GAP: Aurora
 * has no writer for any of the three values it shows. `Act.sceneRef`'s own type
 * says so (`src/core/model/s4-types.ts`: "Aurora does not WRITE this key. The
 * save re-serialises the raw parsed project.json"), `raster` has no act-level
 * home at all (`actBindingDefaults` types it `null` on purpose), and the act
 * background is generator-gated to the `@act` sentinel. An editable act row
 * would be Aurora's FIRST writer of a project.json act key, which is a contract
 * question and not a panel one.
 *
 * It is a CONSTANT so that the node row and the CDP harness both take the
 * sentence FROM HERE rather than retyping it; a retyped expectation goes green
 * against a panel showing different words.
 */
export const ACT_ROW_NOTE = 'The act\'s own values. A region binding left null inherits '
  + 'these. Aurora does not write them, so this row cannot be edited.';

/** The fixed bottom row: what a null binding inherits. Never selectable. */
export interface ActListRow {
  /** Literally "act" — §3.4's word, and the only part of that sentence that survives. */
  label: 'act';
  /** The act's id, for the panel header. */
  actId: string;
  defaults: ActBindingDefaults;
  /** The act's own background, named the same way a region's is. */
  bg: RegionBgLabel;
}

/**
 * The document's entries grouped BY ID, in first-appearance order.
 *
 * The one place the per-id grouping is decided, so the list, the map overlay's
 * inputs and anything else that asks "which entries are this region" cannot
 * answer differently.
 */
export function regionEntryGroups(doc: RegionsDocument): Array<{ id: string; indices: number[] }> {
  const order: string[] = [];
  const byId = new Map<string, number[]>();
  for (let i = 0; i < doc.regions.length; i += 1) {
    const { id } = doc.regions[i];
    let indices = byId.get(id);
    if (indices === undefined) { indices = []; byId.set(id, indices); order.push(id); }
    indices.push(i);
  }
  return order.map((id) => ({ id, indices: byId.get(id) as number[] }));
}

/**
 * The list: ONE ROW PER REGION ID, in first-appearance DOCUMENT ORDER. No sort
 * — see the header, point 1, and `RegionListRow` for why grouping is not one.
 *
 * Overlaps are computed once across the whole set rather than per row, because
 * `disjointness` answers about PAIRS and a per-row call would be quadratic in
 * the number of rows for an answer it already has. They are then folded from
 * pairs of ENTRIES onto pairs of IDS, which is the unit the row speaks in;
 * same-id pairs are dropped there, for the reason `overlaps` documents.
 */
export function regionListRows(
  doc: RegionsDocument,
  defaults: ActBindingDefaults,
  bgLibrary: readonly BgLibraryEntry[],
): RegionListRow[] {
  const pieces: RegionPiece[] = doc.regions.map((r) => ({ id: r.id, rect: r.rect }));
  const byId = new Map<string, Set<string>>();
  const note = (a: string, b: string) => {
    if (!byId.has(a)) byId.set(a, new Set());
    byId.get(a)!.add(b);
  };
  for (const o of disjointness(pieces).overlaps) {
    if (o.idA === o.idB) continue;
    note(o.idA, o.idB);
    note(o.idB, o.idA);
  }
  return regionEntryGroups(doc).map(({ id, indices }) => {
    // THE FIRST ENTRY IS THE REPRESENTATIVE for everything that is not
    // geometry — the same entry `setRegionBinding` converges the others onto
    // and `applyRegionGestureToDocument` templates from.
    const first = doc.regions[indices[0]];
    const rects = indices.map((i) => doc.regions[i].rect);
    return {
      index: indices[0],
      entryIndices: indices,
      id,
      label: first.name && first.name.length > 0 ? first.name : id,
      // `unionBounds` returns null only when EVERY piece is empty, which the
      // schema's "at least 1" forbids and a hand-edited file can still carry.
      // The first entry's own rectangle is then the honest answer — it is what
      // the row showed before grouping — rather than a fabricated box.
      rect: unionBounds(rects) ?? first.rect,
      rects,
      bg: regionBgLabel(first.bg?.layoutRef, defaults, bgLibrary),
      overlaps: [...(byId.get(id) ?? [])],
    };
  });
}

/** The act row. `bg` is resolved through the same function a region's is. */
export function actListRow(
  doc: RegionsDocument,
  defaults: ActBindingDefaults,
  bgLibrary: readonly BgLibraryEntry[],
): ActListRow {
  return {
    label: 'act',
    actId: doc.act,
    defaults,
    bg: regionBgLabel(null, defaults, bgLibrary),
  };
}

// ---------------------------------------------------------------------------
// The four bindings rows
// ---------------------------------------------------------------------------

export type RegionBindingKey = 'preset' | 'scene' | 'raster' | 'bg';

/** The four §3.4 row labels, in §3.4's order. */
export const BINDING_LABELS: Record<RegionBindingKey, string> = {
  preset: 'preset',
  scene: 'scene',
  raster: 'raster',
  bg: 'bg layout',
};

export const BINDING_ORDER: readonly RegionBindingKey[] = ['preset', 'scene', 'raster', 'bg'];

/**
 * Which of the three states a row is in.
 *
 * §3.4's prose says "one of TWO badges", and there are three, because the
 * landed contract made `preset` required and non-null. A row that can never be
 * inherited is not the same fact as one that happens to be explicit today, and
 * collapsing them would put a "revert to inherited" control on a row where
 * reverting is a schema violation.
 */
export type RegionBindingState = 'required' | 'explicit' | 'inherited';

export interface RegionBindingRow {
  key: RegionBindingKey;
  label: string;
  /** The region's own stored value. Null exactly when the row is `inherited`. */
  value: string | null;
  state: RegionBindingState;
  /**
   * THE BADGE TEXT, and the subject of §7 row 6's named gate ("badge text
   * differs per row"). `inherited (act: X)` carries the ACT'S VALUE for that
   * binding, which is what §3.4 means by "showing the value it resolves to" —
   * `default` / `none` / `@act`, the mock's own three words. The background's
   * name in WORDS is the LIST row's job (the 2026-09-16 ruling), not this one's:
   * this badge is about where the value comes from.
   */
  badge: string;
  /** True exactly when a "revert to inherited" control belongs on this row. */
  canRevert: boolean;
}

/** The act's value for one binding, as the badge spells it. */
export function actValueWord(key: RegionBindingKey, defaults: ActBindingDefaults): string {
  if (key === 'preset') {
    // No act preset exists, in the document or in the engine. Reached only by a
    // caller asking the wrong question; answering "none" would read as "the act
    // has one and it is empty".
    return 'no act preset';
  }
  if (key === 'scene') return defaults.sceneRef ?? 'default';
  if (key === 'raster') return defaults.rasterRef ?? 'none';
  return defaults.bgLayoutRef;
}

/** The region's own stored value for one binding, or null when inherited. */
export function regionBindingValue(region: Region, key: RegionBindingKey): string | null {
  if (key === 'preset') return region.preset;
  if (key === 'scene') return region.sceneRef ?? null;
  if (key === 'raster') return region.rasterRef ?? null;
  return region.bg?.layoutRef ?? null;
}

/**
 * The four rows for one region, in §3.4's order.
 *
 * `preset` is `required`: the schema makes it non-null, so it is always
 * explicit, it never carries "inherited (act: …)", and it never offers a revert.
 * The other three detach on edit and revert back.
 */
export function regionBindingRows(
  region: Region,
  defaults: ActBindingDefaults,
): RegionBindingRow[] {
  return BINDING_ORDER.map((key) => {
    const value = regionBindingValue(region, key);
    if (key === 'preset') {
      return {
        key,
        label: BINDING_LABELS[key],
        value,
        state: 'required' as const,
        badge: 'explicit (required)',
        canRevert: false,
      };
    }
    if (value === null) {
      return {
        key,
        label: BINDING_LABELS[key],
        value: null,
        state: 'inherited' as const,
        badge: `inherited (act: ${actValueWord(key, defaults)})`,
        canRevert: false,
      };
    }
    return {
      key,
      label: BINDING_LABELS[key],
      value,
      state: 'explicit' as const,
      badge: 'explicit',
      // THE DETACHMENT IS NEVER INVISIBLE (§3.4). The control appears on exactly
      // the rows a revert is legal on, which is every explicit row of a nullable
      // binding — not only on ones detached in THIS session, because a document
      // loaded from disk arrives explicit and its author needs the same way back.
      canRevert: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Detach on edit, and revert
// ---------------------------------------------------------------------------

/** Write one binding into ONE entry, in place. The four keys' arms, once. */
function writeRegionBinding(region: Region, key: RegionBindingKey, value: string | null): void {
  if (key === 'preset') region.preset = value as string;
  else if (key === 'scene') region.sceneRef = value;
  else if (key === 'raster') region.rasterRef = value;
  else {
    // `bg` is an OBJECT in the contract, and a region may not have one yet.
    // Writing `layoutRef: null` into a fresh `bg` rather than deleting the key
    // keeps "explicitly the act's" and "absent" distinguishable for a reader —
    // the schema allows both and they mean the same thing to the generator, so
    // the codec must carry back whatever was there.
    if (value === null) {
      if (region.bg) region.bg.layoutRef = null;
    } else {
      region.bg = { ...(region.bg ?? {}), layoutRef: value };
    }
  }
}

/**
 * Set one binding of one region, returning a NEW document. `null` reverts to
 * inherited; anything else detaches.
 *
 * ═══ EVERY ENTRY SHARING THE ID IS EDITED, NOT THE FIRST ═══════════════════
 *
 * A REGION WITH SEVERAL RECTANGLES IS SEVERAL `regions[]` ENTRIES SHARING AN
 * `id`, and that is forced rather than chosen: the landed contract carries one
 * `rect` per entry (`aurora-regions.schema.json`), an L-shape is two engine
 * rows (spec §2.1), and a carve splits one rectangle into as many as four.
 * `applyRegionGestureToDocument`'s docblock states the invariant that pairs
 * with this one — EVERY ENTRY OF ONE ID CARRIES IDENTICAL BINDINGS — and
 * copies the bindings onto each piece it makes. A binding edit is the other
 * half of that contract: this function must leave every piece agreeing, or one
 * click on a carved region's `scene` picker silently gives its pieces two
 * different scenes and the ROM two different answers for one named region.
 *
 * Until step 8B this used `findIndex` and edited only the FIRST entry. It was
 * latent because nothing called the gesture layer; wiring the map is what makes
 * a multi-entry region reachable, so the fix lands with the wiring.
 *
 * ═══ WHICH ENTRY IS THE REPRESENTATIVE, AND FOR WHAT ═══════════════════════
 *
 * For DISPLAY the representative is the FIRST entry with the id: that is what
 * `regionsPanelState` resolves with `.find()` and hands to `regionBindingRows`,
 * and it is what `applyRegionGestureToDocument` takes its template from.
 *
 * FOR THE NO-OP SHORT-CIRCUIT THERE IS NO REPRESENTATIVE, deliberately. The
 * refusal is "every entry already carries this value", never "the first one
 * does". A document whose entries have DRIFTED apart — hand-edited, or written
 * by some future writer that does not hold the invariant — must not be read as
 * already-that-value and skipped, because that is exactly the document a
 * binding edit has to repair. Asking the first entry alone would refuse the one
 * edit that converges them, and the disagreement would be unfixable from the
 * panel. So a drifted id always writes, and writing always converges.
 *
 * Returns null when the edit is a no-op or is refused, so the caller pushes no
 * undo entry — the `run(command)` null-guard's own rule. Two refusals:
 *   • `preset` cannot be null (the schema's `required`, and there is nothing to
 *     inherit from);
 *   • a value every entry of the id already carries.
 *
 * THE WHOLE DOCUMENT IS CLONED, not spliced in place. `SetRegionsCommand`
 * records whole old/new halves and `writeActRegionsDocument` clones again on the
 * way in; a shared nested object between the two halves is the aliasing defect
 * step 5's M1 mutation exists to catch, reintroduced one layer up.
 */
export function setRegionBinding(
  doc: RegionsDocument,
  regionId: string,
  key: RegionBindingKey,
  value: string | null,
): RegionsDocument | null {
  if (key === 'preset' && value === null) return null;
  const indices: number[] = [];
  for (let i = 0; i < doc.regions.length; i += 1) {
    if (doc.regions[i].id === regionId) indices.push(i);
  }
  if (indices.length === 0) return null;
  if (indices.every((i) => regionBindingValue(doc.regions[i], key) === value)) return null;

  const next = cloneRegionsDocument(doc);
  for (const i of indices) writeRegionBinding(next.regions[i], key, value);
  return next;
}

/** The `set-regions` command for one binding edit, or null when there is none. */
export function regionBindingCommand(
  doc: RegionsDocument,
  regionId: string,
  key: RegionBindingKey,
  value: string | null,
): SetRegionsCommand | null {
  const next = setRegionBinding(doc, regionId, key, value);
  if (next === null) return null;
  return {
    type: 'set-regions',
    description: value === null
      ? `Revert ${regionId} ${BINDING_LABELS[key]} to inherited`
      : `Set ${regionId} ${BINDING_LABELS[key]}`,
    // Act-ambient, like every other whole-document command — see commands.ts.
    sectionIndex: -1,
    oldDocument: cloneRegionsDocument(doc),
    newDocument: next,
  };
}

// ---------------------------------------------------------------------------
// The status line
// ---------------------------------------------------------------------------

/**
 * `unmeasurable` is NOT a third shade of warning. It means the check did not
 * run, and it exists so that a rule Aurora cannot answer never renders as green
 * — the load path's own "loud on unmeasurable" rule (`validate.ts`'s header),
 * carried onto the surface that shows the same rules live.
 */
export type RegionStatusTone = 'ok' | 'warning' | 'unmeasurable';

export interface RegionStatusRow {
  /** Stable id: what a test and the CDP harness address a row by. */
  id: string;
  tone: RegionStatusTone;
  text: string;
}

/** Everything the status line needs that the document does not carry. */
export interface RegionStatusInput {
  doc: RegionsDocument;
  act: ActExtent;
  vocab: RegionBindingVocabulary;
  /**
   * How many `section_N.meta.json` sidecars of THIS act still carry a non-null
   * `sceneRef` or `rasterRef`. §2.5 rule 5: with a regions document present the
   * generator REFUSES such a sidecar, so the panel says so until §4's migration
   * has run.
   */
  sidecarsWithRefs: number;
  /**
   * RULE 4's CONSTANTS, resolved from aeon's own files at load time, or every
   * reason they could not be — `Act.regionRules`.
   *
   * REQUIRED, and not defaulted here. A default would be the one thing this
   * row has always refused to be: a number with no source producing verdicts.
   * A caller with no aeon files says so with `regionRulesNotRead(reason)` and
   * the row stays `unmeasurable` with that reason on it.
   */
  rules: RegionRuleResolution;
}

/**
 * The live §2.5 results, as the panel's status line.
 *
 * ═══ WHAT IS HERE THAT THE LOAD DELIBERATELY DOES NOT DO ═══════════════════
 *
 * COVERAGE AND NON-OVERLAP. `validate.ts`'s header and the step-5 landing note
 * both record the ruling: they are NOT load notices, because under Q1 an
 * UNASSIGNED area is a first-class editing state and an error toast on every
 * open would make an ordinary half-finished act shout at its author. They belong
 * HERE, where the author is looking at the thing being judged. This is the
 * surface that ruling deferred them to.
 *
 * ═══ RULE 4 RUNS NOW, AND STAYS LOUD WHEN IT CANNOT ═══════════════════════
 *
 * RULE 4 — the 32 px minimum span and the reachable-edge family. Until ROADMAP
 * row 201 this row was hard-wired `unmeasurable`, and its sentence said the
 * numbers come "from the act's .emp descriptor, which Aurora does not read".
 * THAT SENTENCE WAS RIGHT ABOUT THE READ AND WRONG ABOUT THE FILE, which is
 * why it is quoted here rather than quietly deleted: measured at aeon
 * `e0317db8`, the descriptor DERIVES the five constants and every leaf they
 * name leaves the file, into `engine/system/constants.emp`. A parcel that had
 * only taught Aurora to read an act descriptor would have resolved none of
 * them. `core/formats/regions/act-constants.ts` reads both halves and carries
 * the measurement.
 *
 * `region-geometry.ts` implements the rule in `validateRect` and has since
 * step 5; it takes the constants as PARAMETERS and its header forbids a
 * default, because "a value typed into this file would be a second home for a
 * number aeon owns". Nothing here supplies one: the resolution arrives on
 * `RegionStatusInput.rules`, and when it failed this row is `unmeasurable`
 * with the names of the constants that failed and the files looked in. Never
 * 0, never a default, never green.
 *
 * ⚠ AND IT REPORTS ONLY RULE 4's OWN CODES. `validateRect` also runs the three
 * act-extent rules, and those already reach the reader through the binding
 * rows above (`regionsValidationNotices` calls `validateRectInAct`). Pushing
 * the whole finding list here would say each of them twice, in two voices,
 * which is how a panel and a load come to look like they disagree.
 *
 * ⚠ AND THE SENTENCE §3.4 ASKS FOR IS ITSELF SUPERSEDED. "a piece below 32 px
 * names the TWO REGIONS that make it" is a FLATTENING sentence: under painter's
 * order a sliver was the gap between two rectangles, neither region's own. Under
 * the ruling the set is disjoint and a piece IS one region's rectangle, so when
 * this row can run it will name ONE region. The two-region sentence survives in
 * the `overlap` row, which is the only place two regions still make one
 * rectangle.
 *
 * Rules 1 (shape) and 6 (`bg.layoutRef` while the engine has no consumer) are
 * elsewhere by design: 1 is a codec REFUSAL that shows as an unreadable file,
 * and 6 is the generator's, with the picker staying locked until step 11.
 */
export function regionStatusRows(input: RegionStatusInput): RegionStatusRow[] {
  const { doc, act, vocab, sidecarsWithRefs } = input;
  const rows: RegionStatusRow[] = [];
  const pieces: RegionPiece[] = doc.regions.map((r) => ({ id: r.id, rect: r.rect }));

  // ── Rule 2 (rects) and rule 3 (bindings) — THROUGH THE LOAD'S OWN FUNCTION ─
  //
  // Not a second transcription. `regionsValidationNotices` already names the
  // file for an unresolvable binding, already keeps "missing" and "exists and
  // refused" apart, and is already loud when the preset library could not be
  // read; re-deriving any of that here is how the panel and the load come to
  // disagree about one document. Its `Notice` severities map onto the tones.
  for (const [i, n] of noticesFor(doc, act, vocab).entries()) {
    rows.push({ id: `binding-${i}`, tone: toneOf(n), text: n.message });
  }

  // ── Non-overlap: the only place two regions still make one rectangle ──────
  const overlaps = disjointness(pieces).overlaps;
  if (overlaps.length > 0) {
    const named = overlaps
      .map((o) => `${o.idA} and ${o.idB} (${o.rect.w}x${o.rect.h} at ${o.rect.x},${o.rect.y})`);
    rows.push({
      id: 'overlap',
      tone: 'warning',
      text: `${overlaps.length} overlapping ${overlaps.length === 1 ? 'pair' : 'pairs'}: `
        + `${named.join('; ')}. Identity must be a function of the camera centre alone; `
        + 'where two regions overlap it depends on scan order instead.',
    });
  } else {
    // ⚠ THIS ARM IS NOT DECORATION, and it was missing until the 2026-09-16
    // ruling on §3.4's three open calls (`docs/superpowers/notes/
    // 2026-09-16-regions-panel-three-calls.md`, CALL 1). Without it the overlap
    // row was the ONLY status row that said nothing when it passed, so a reader
    // could not tell "checked, disjoint" from "this check did not run" — the
    // house rule this file states at `RegionStatusTone` (represent a state,
    // never by absence) and the exact confusion the `unmeasurable` tone exists
    // to prevent. The two rows beside it, `unassigned` and `sidecars`, each have
    // their own `else`; this is the third.
    //
    // The COUNT is here for the same reason `unassigned`'s pixel figures are:
    // "no two regions overlap" is also what a document with no regions at all
    // produces, and the number says which of the two the reader is looking at.
    rows.push({
      id: 'overlap',
      tone: 'ok',
      text: `No two regions overlap (${pieces.length} `
        + `${pieces.length === 1 ? 'region' : 'regions'} checked).`,
    });
  }

  // ── Coverage: UNASSIGNED is an editing state, not a malformed document ────
  const cov = coverage({ x: 0, y: 0, w: act.actW, h: act.actH }, pieces);
  if (cov.unassigned.length > 0) {
    const named = cov.unassigned.slice(0, 3)
      .map((r) => `${r.w}x${r.h} at ${r.x},${r.y}`)
      .join('; ');
    const more = cov.unassigned.length > 3 ? `, +${cov.unassigned.length - 3} more` : '';
    rows.push({
      id: 'unassigned',
      tone: 'warning',
      text: `UNASSIGNED: ${cov.unassigned.length} `
        + `${cov.unassigned.length === 1 ? 'area belongs' : 'areas belong'} to no region `
        + `(${cov.unassignedArea} px of ${cov.actArea}): ${named}${more}. `
        + 'Give each to a region; the build refuses an area with no identity.',
    });
  } else {
    rows.push({
      id: 'unassigned',
      tone: 'ok',
      text: `Every pixel of the act is assigned (${cov.assignedArea} of ${cov.actArea} px).`,
    });
  }

  // ── Rule 5: the sidecars ─────────────────────────────────────────────────
  if (sidecarsWithRefs > 0) {
    rows.push({
      id: 'sidecars',
      tone: 'warning',
      text: `${sidecarsWithRefs} ${sidecarsWithRefs === 1 ? 'sidecar' : 'sidecars'} still `
        + `${sidecarsWithRefs === 1 ? 'carries' : 'carry'} refs: migrate. Regions rule 5: with a `
        + 'regions document present the build refuses a section_N.meta.json whose sceneRef or '
        + 'rasterRef is non-null, and never merges it.',
    });
  } else {
    rows.push({ id: 'sidecars', tone: 'ok', text: 'sidecars: none carry refs.' });
  }

  // ── Rule 4: CHECKED when the constants resolved, loud when they did not ──
  rows.push(rule4Row(doc, input.rules));

  return rows;
}

/** Rule 4's own finding codes. The other three `validateRect` emits are the binding rows'. */
const RULE_4_CODES = new Set([
  'min-span',
  'edge-left-unreachable',
  'edge-right-unreachable',
  'edge-top-unreachable',
  'edge-bottom-unreachable',
]);

/**
 * The rule-4 status row: the verdict, or the reason there is none.
 *
 * ⚠ THE PASSING ARM NAMES THE NUMBERS IT USED. "Rule 4 passes" and "rule 4 was
 * skipped" look identical on screen unless the row says which constants it
 * checked against, and the whole point of row 201 is that this row used to be
 * unable to say anything at all. The figures are the RESOLVED values, printed
 * from the resolution rather than retyped, so the sentence cannot drift from
 * the check the way a typed-in 32 would.
 */
function rule4Row(doc: RegionsDocument, rules: RegionRuleResolution): RegionStatusRow {
  if (rules.kind === 'unresolved') {
    const named = rules.unresolved.map((u) => `${u.name} (${u.reason})`).join(' ');
    const where = rules.unresolved[0]?.lookedIn ?? [];
    return {
      id: 'min-span',
      tone: 'unmeasurable',
      text: 'Rule 4 (minimum span, reachable edges) NOT CHECKED: '
        + `${rules.unresolved.length} of ${rules.unresolved.length + rules.resolved.length} `
        + `constants did not resolve. ${named}`
        + (where.length > 0 ? ` Looked in: ${where.join(', ')}.` : '')
        + ' A document clean here can still be refused by the build.',
    };
  }

  const r = rules.rules;
  const findings = doc.regions.flatMap((region, i) => validateRect(
    region.rect, r, { regionId: region.id, pieceIndex: i },
  )).filter((f) => RULE_4_CODES.has(f.code));

  const bands = `minimum span ${r.minSpan} px, camera centre reachable on x in `
    + `[${r.centreXMin}, ${r.centreXMax}] and y in [${r.centreYMin}, ${r.centreYMax}]`;

  if (findings.length > 0) {
    return {
      id: 'min-span',
      tone: 'warning',
      text: `Rule 4: ${findings.length} ${findings.length === 1 ? 'problem' : 'problems'} `
        + `(${bands}). ${findings.map((f) => f.message).join(' ')}`,
    };
  }
  return {
    id: 'min-span',
    tone: 'ok',
    text: `Rule 4 passes for all ${doc.regions.length} `
      + `${doc.regions.length === 1 ? 'region' : 'regions'}: ${bands}.`,
  };
}

/** Rules 2 and 3, from the load's own module. Split out so a test can aim at it. */
function noticesFor(
  doc: RegionsDocument, act: ActExtent, vocab: RegionBindingVocabulary,
): Notice[] {
  return regionsValidationNotices(doc, doc.act, act, vocab);
}

/**
 * `NoticeSeverity` is `success | warning | error`, and both non-success arms are
 * `warning` here rather than being folded into one: the status line's tones are
 * about whether the author must act, and `regionsValidationNotices` only ever
 * emits `warning` today. A future `error` must not silently become `ok`, which
 * is what a `=== 'warning'` test would have made it.
 */
function toneOf(n: Notice): RegionStatusTone {
  return n.severity === 'success' ? 'ok' : 'warning';
}

/**
 * Rule 2's per-region findings, for the list row that owns the rectangle.
 *
 * The status line coalesces (a wall of one notice per region is what
 * `nameSome` exists to prevent); a row that IS one region can be specific.
 */
export function regionRectFindings(region: Region, act: ActExtent): string[] {
  return validateRectInAct(region.rect, act, { regionId: region.id }).map((f) => f.message);
}

// ---------------------------------------------------------------------------
// The store side — everything above this line is pure and is what the node
// suite tests. Below it the same derivations are fed from the open project.
// ---------------------------------------------------------------------------

/**
 * Everything the Regions panel renders for the current act, or a reason it
 * renders nothing.
 *
 * ⚠ THE THREE STATES OF `ActRegionsState` SURVIVE INTO THE PANEL. `kind` is
 * `none` / `open` / `refused`, never a bare "no regions", because a
 * `regions.json` Aurora REFUSED is not an act without regions: the save neither
 * overwrites nor removes it, and a panel that said "no regions yet" over a file
 * on disk would invite the author to build a second one. `act-regions.ts`'s
 * header carries the long version.
 */
export type RegionsPanelState =
  | { kind: 'no-project' }
  | { kind: 'none'; actId: string }
  | { kind: 'refused'; actId: string; path: string; reason: string }
  | {
    kind: 'open';
    actId: string;
    doc: RegionsDocument;
    defaults: ActBindingDefaults;
    act: ActExtent;
    rows: RegionListRow[];
    actRow: ActListRow;
    status: RegionStatusRow[];
    /** The selected region, resolved BY ID (see `editorStore.selectedRegionId`). */
    selected: Region | null;
    /** The `EffectsPreset` record names the picker offers, or null: unreadable. */
    presetRecords: string[] | null;
  };

/**
 * How many of this act's section sidecars still carry a `sceneRef` or a
 * `rasterRef` — §2.5 rule 5's count.
 *
 * ⚠ IT COUNTS SECTIONS, NOT FILES, and the two agree because one section is one
 * `section_N.meta.json`. An EMPTY section slot is skipped rather than counted as
 * clean: it has no sidecar to carry anything, and counting it would make the
 * number an act-grid size rather than a migration debt.
 */
export function sidecarsCarryingRefs(sections: readonly (Section | null)[]): number {
  let n = 0;
  for (const s of sections) {
    if (s === null) continue;
    if (s.sceneRef !== null || s.rasterRef !== null) n += 1;
  }
  return n;
}

/**
 * Build the whole panel state from an act and its project's libraries.
 *
 * SPLIT FROM THE HOOK ON PURPOSE: this takes plain arguments, so the node suite
 * can drive the three `kind`s without a store, and the hook below is the thin
 * part that reads one.
 */
export function regionsPanelState(
  act: Act | null,
  project: S4Project | null,
  selectedRegionId: string | null,
  /**
   * `projectDataRoot(config.raw)`: the root the effects libraries were loaded
   * from, which rule 3 needs to read a refused document's path back as its id.
   * Null only without a config, which `openLoaded` never leaves beside a project.
   */
  dataRoot: string | null,
): RegionsPanelState {
  if (!act || !project || dataRoot === null) return { kind: 'no-project' };
  const st = act.regions;
  // ⚠ `unreadable` IS READ BEFORE `document`. A refused file leaves `document`
  // null, so testing the document first would report the refusal as "no
  // regions" — the collapse `ActRegionsState` exists to prevent, arriving from
  // the surface instead of from the save.
  if (st.unreadable !== null) {
    return {
      kind: 'refused', actId: act.id,
      path: st.unreadable.path, reason: st.unreadable.reason,
    };
  }
  if (st.document === null) return { kind: 'none', actId: act.id };

  const doc = st.document;
  const defaults = actBindingDefaults(act.sceneRef);
  const extent: ActExtent = {
    // THE ACT'S OWN SIZE, FROM ITS GRID, never from the document under test —
    // the load's own rule at the same call: a bound taken from the thing being
    // checked makes the rule true by construction.
    actW: act.gridWidth * SECTION_PIXEL_SIZE,
    actH: act.gridHeight * SECTION_PIXEL_SIZE,
  };
  const vocab = regionBindingVocabulary({
    dataRoot,
    rasterWiring: act.rasterWiring,
    effectsScenes: project.effectsScenes,
    effectsPresets: project.effectsPresets,
    bgLibrary: project.bgLibrary,
    bgLibraryUnresolved: project.bgLibraryUnresolved,
  });

  return {
    kind: 'open',
    actId: act.id,
    doc,
    defaults,
    act: extent,
    rows: regionListRows(doc, defaults, project.bgLibrary),
    actRow: actListRow(doc, defaults, project.bgLibrary),
    status: regionStatusRows({
      doc, act: extent, vocab,
      sidecarsWithRefs: sidecarsCarryingRefs(act.sections),
      // RULE 4's CONSTANTS AS THE LOAD RESOLVED THEM, never re-derived here.
      // The load has the aeon files; this module is pure.
      rules: act.regionRules,
    }),
    // BY ID: an id that no longer names a region resolves to null, which is a
    // visible "nothing selected" rather than a silent jump to a neighbour.
    selected: doc.regions.find((r) => r.id === selectedRegionId) ?? null,
    presetRecords: vocab.presetRecords,
  };
}
