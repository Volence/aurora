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
import type { BgLibraryEntry } from '../../core/model/s4-types';
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
  validateRectInAct,
  type RegionPiece,
} from '../../core/editing/region-geometry';

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

/** One row of the region list, in DOCUMENT order. */
export interface RegionListRow {
  /** Index into `doc.regions` — the row's identity for selection and for edits. */
  index: number;
  id: string;
  /** `name` when the document carries one, else the id. Never empty. */
  label: string;
  rect: RegionRect;
  /** The background, in words, always (the 2026-09-16 ruling). */
  bg: RegionBgLabel;
  /**
   * Ids of other regions this one shares pixels with. EMPTY IS THE NORMAL CASE
   * and means the set is disjoint, which is what the ruling requires. A
   * non-empty list is the successor to §3.4's "hidden" mark — see the header.
   */
  overlaps: string[];
}

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
 * The list, in DOCUMENT ORDER. No sort — see the header, point 1.
 *
 * Overlaps are computed once across the whole set rather than per row, because
 * `disjointness` answers about PAIRS and a per-row call would be quadratic in
 * the number of rows for an answer it already has.
 */
export function regionListRows(
  doc: RegionsDocument,
  defaults: ActBindingDefaults,
  bgLibrary: readonly BgLibraryEntry[],
): RegionListRow[] {
  const pieces: RegionPiece[] = doc.regions.map((r) => ({ id: r.id, rect: r.rect }));
  const byIndex = new Map<number, Set<string>>();
  for (const o of disjointness(pieces).overlaps) {
    if (!byIndex.has(o.indexA)) byIndex.set(o.indexA, new Set());
    if (!byIndex.has(o.indexB)) byIndex.set(o.indexB, new Set());
    byIndex.get(o.indexA)!.add(o.idB);
    byIndex.get(o.indexB)!.add(o.idA);
  }
  return doc.regions.map((r, index) => ({
    index,
    id: r.id,
    label: r.name && r.name.length > 0 ? r.name : r.id,
    rect: r.rect,
    bg: regionBgLabel(r.bg?.layoutRef, defaults, bgLibrary),
    overlaps: [...(byIndex.get(index) ?? [])],
  }));
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

/**
 * Set one binding of one region, returning a NEW document. `null` reverts to
 * inherited; anything else detaches.
 *
 * Returns null when the edit is a no-op or is refused, so the caller pushes no
 * undo entry — the `run(command)` null-guard's own rule. Two refusals:
 *   • `preset` cannot be null (the schema's `required`, and there is nothing to
 *     inherit from);
 *   • a value identical to the current one.
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
  const index = doc.regions.findIndex((r) => r.id === regionId);
  if (index < 0) return null;
  if (regionBindingValue(doc.regions[index], key) === value) return null;

  const next = cloneRegionsDocument(doc);
  const region = next.regions[index];
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
 * ═══ AND WHAT IS NOT HERE, LOUDLY ═════════════════════════════════════════
 *
 * RULE 4 — the 32 px minimum span and the reachable-edge family. It is NOT
 * checked and it renders as `unmeasurable`, never as silence and never as a
 * pass. `region-geometry.ts` implements it in `validateRect` and takes
 * `REGION_MIN_SPAN` and `CENTRE_{X,Y}_{MIN,MAX}` as PARAMETERS, because those
 * numbers belong to aeon's act descriptor and that module's header forbids a
 * default: "a value typed into this file would be a second home for a number
 * aeon owns". Aurora does not read an act descriptor — the parcel is "Aurora
 * reads an act descriptor", booked at the step-5 landing — so typing 32 here to
 * make the row green would be a number with no source quietly producing
 * verdicts, which is the failure the whole module is shaped against.
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

  // ── Rule 4: NOT CHECKED, and said out loud ───────────────────────────────
  rows.push({
    id: 'min-span',
    tone: 'unmeasurable',
    text: 'Rule 4 (minimum span, reachable edges) NOT CHECKED: it needs REGION_MIN_SPAN and '
      + "CENTRE_{X,Y}_{MIN,MAX} from the act's .emp descriptor, which Aurora does not read. "
      + 'A document clean here can still be refused by the build.',
  });

  return rows;
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
