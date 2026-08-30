// Per-section metadata sidecar ({dataPath}section_N.meta.json).
//
// Sections persist as raw binaries (.tiles.bin/.collattr.bin) plus JSON sidecars
// for objects/rings; there is no general section-meta file. This sidecar holds
// the scalar refs the binaries can't carry — the per-section background
// assignment (bgLayoutRef: null = act default, else an S4Project.bgLibrary id),
// paletteRef, the effects scene assignment (sceneRef: null = act default, else
// an id from the editor effects library), and the raster-preset binding
// (rasterRef: null = this section keeps its hand-authored raster channel, else
// a preset-document id). It is written only when at least one field is non-null
// (serializeSectionMeta returns null otherwise) so the common all-default case
// adds no files.
//
// `rasterRef` IS NOT `effectsRef`, and the difference is a ruling rather than a
// spelling (empyrean docs/AURORA_EFFECTS_SCHEMA.md §3.1, adjudicated 2026-08-30
// on aeon's CR): a preset document can only supply the RASTER channel of aeon's
// eight-channel EffectsPreset, so the narrow binding gets an honest narrow name
// and `effectsRef` stays RESERVED AND UNSPENT for the day the document is total.
// Do not repurpose `effectsRef` into this key, and do not delete its reservation.
//
// Every ref is spelled out FOUR times below — the all-null check, the emit
// literal, the parse, and the interface — and once more in the cleared-overwrite
// body in project/aeon/save.ts. That repetition is load-bearing and hostile:
// parse builds a fresh object from known keys only and serialize emits only what
// it enumerates, so a ref missed at any one of them is erased on the next save
// round-trip with no error on any path. Preserving every ref across
// parse->serialize is a cross-tool contract requirement, not local hygiene —
// aeon's generator writes sceneRef into these same files, and rasterRef next
// (empyrean docs/AURORA_EFFECTS_SCHEMA.md §3/§3.1/§6/§8; aeon
// tools/EFFECTS_CONSUMER_CONTRACT.md §2.2). Add a ref here and to save.ts
// together, or don't add it.
//
// NOTHING IN AURORA AUTHORS `rasterRef` — no command, no panel, no agent tool.
// That does NOT make the field dead the way the deleted `parallaxRef` was: it is
// READ from disk by load.ts and WRITTEN BACK by save.ts, which is the whole job.
// A ref this editor cannot author is exactly the ref a partial extension erases.
//
// KEY ORDER is not this file's to choose. Contract §2.2 names the sidecar as a
// document of the contract, so §5 binds it: keys sorted alphabetically, scalar
// document pretty-printed at indent 2 — `canonicalJsonPretty`. The emit
// literal below stays a literal (so the emitted SET is the interface's, type
// checked), but its ORDER is a non-fact: the canonical writer sorts it. Add a
// fourth ref wherever reads best; the bytes come out sorted regardless, and
// test/formats/section-meta.test.ts asserts they do.

import { canonicalJsonPretty } from './canonical-json';

export interface SectionMeta {
  bgLayoutRef: string | null;
  paletteRef: string | null;
  /**
   * The raster-preset binding (schema §3.1): a preset-document id from §7.1, or
   * null. NEVER a numeric index — see `parseSectionMeta`'s note, which is the
   * stated reason both this key and `sceneRef` are string ids.
   */
  rasterRef: string | null;
  sceneRef: string | null;
}

/**
 * Serialize a section meta sidecar, or null when every field is null —
 * callers skip (or clear) the write in that case.
 */
export function serializeSectionMeta(meta: SectionMeta): string | null {
  if (
    meta.bgLayoutRef === null && meta.paletteRef === null
    && meta.rasterRef === null && meta.sceneRef === null
  ) return null;
  return canonicalJsonPretty({
    bgLayoutRef: meta.bgLayoutRef,
    paletteRef: meta.paletteRef,
    rasterRef: meta.rasterRef,
    sceneRef: meta.sceneRef,
  });
}

/**
 * Parse a section meta sidecar; missing or non-string fields read as null.
 *
 * A non-string value in a KNOWN key reading as null is quiet by design, and the
 * contract leans on it rather than fixing it: it is the stated reason sceneRef
 * is a string id and never a numeric scene index, since `sceneRef: 3` would be
 * read as null here and then erased on the next save, presenting to the user as
 * "the assignment didn't stick" (AURORA_EFFECTS_SCHEMA.md §3). §3.1 forbids a
 * numeric `rasterRef` for the same reason, citing these very lines.
 */
export function parseSectionMeta(text: string): SectionMeta {
  const raw = JSON.parse(text) as Partial<SectionMeta> | null;
  return {
    bgLayoutRef: typeof raw?.bgLayoutRef === 'string' ? raw.bgLayoutRef : null,
    paletteRef: typeof raw?.paletteRef === 'string' ? raw.paletteRef : null,
    rasterRef: typeof raw?.rasterRef === 'string' ? raw.rasterRef : null,
    sceneRef: typeof raw?.sceneRef === 'string' ? raw.sceneRef : null,
  };
}
