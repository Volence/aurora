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
// AURORA AUTHORS `rasterRef` THROUGH EXACTLY ONE DOOR: the
// `assign_section_preset` agent tool, over `sectionPresetCommand`
// (renderer/providers/effects-preset.ts) and the `set-section-raster` command.
// There is still no per-section select in the band-preset panel — ROADMAP row
// 93's remaining half — and a control that wants one must call that same
// provider function rather than assign the field, so the agent path and the
// human path cannot diverge on what a no-op is or which ids are valid.
//
// NOTHING READS IT ANYWHERE. Not aeon's generator, not the viewport, not a
// preview — so this file's preserve-it-across-a-round-trip job is still the
// whole job, exactly as it was when nothing wrote the key either. The tool says
// so in its own reply rather than letting `changed: true` imply otherwise; the
// sentence and its expiry live in core/formats/raster-binding.ts.
//
// ═══════════════════════════════════════════════════════════════════════════
// A METHOD BAR, EARNED BY THE PARCEL THAT ADDED `rasterRef` TO THE LIST ABOVE
// ═══════════════════════════════════════════════════════════════════════════
//
// "FOLLOW THE SIBLING KEY" FINDS EVERY SITE THAT HANDLES THE REF SET AND MISSES
// EVERY SITE THAT DESCRIBES IT IN PROSE. Grepping `sceneRef` is how the four
// handling sites in this file, plus save.ts's, get found — they all name the
// sibling key a line or two away. What that grep cannot see is a paragraph that
// enumerates the set in English, and there were SEVEN of them when `rasterRef`
// was added: the four "there is deliberately no assign_section_preset" notes
// (shared/agent-protocol.ts, renderer/agent/agent-handler.ts,
// main/editor-methods.ts, and the effects-preset agent test's header),
// `PRESET_LIMITS.unbound` in renderer/providers/effects-preset.ts, docs/MCP.md,
// and ROADMAP row 93. Left unedited, every one of them tells an author or an
// agent that the key you just landed does not exist.
//
// ⚠ AND ONE OF THE SEVEN WAS UNREACHABLE BY THAT GREP AT ANY GRANULARITY.
// `PRESET_LIMITS.unbound` is AUTHOR-FACING — it renders as visible text at the
// top of the band-preset panel — and its file contained ZERO occurrences of
// `sceneRef`. It named `effectsRef`, the RESERVED key, so it was reachable only
// by grepping for a key that must never be written. (`main/editor-methods.ts`'s
// note is the near miss: no `sceneRef` in the site itself, only elsewhere in the
// file.) The lesson is the enumeration, not the number: when you add a ref,
// search for what the prose CLAIMS — the reserved names, "no such tool", the
// literal brace-list — and not only for the key beside yours.
//
// KEY ORDER is not this file's to choose. Contract §2.2 names the sidecar as a
// document of the contract, so §5 binds it: keys sorted alphabetically, scalar
// document pretty-printed at indent 2 — `canonicalJsonPretty`. The emit
// literal below stays a literal (so the emitted SET is the interface's, type
// checked), but its ORDER is a non-fact: the canonical writer sorts it. Add a
// FIFTH ref wherever reads best; the bytes come out sorted regardless, and
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
