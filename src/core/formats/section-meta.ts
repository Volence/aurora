// Per-section metadata sidecar ({dataPath}section_N.meta.json).
//
// Sections persist as raw binaries (.tiles.bin/.collattr.bin) plus JSON sidecars
// for objects/rings; there is no general section-meta file. This sidecar holds
// the scalar refs the binaries can't carry — the per-section background
// assignment (bgLayoutRef: null = act default, else an S4Project.bgLibrary id),
// paletteRef, and the effects scene assignment (sceneRef: null = act default,
// else an id from the editor effects library). It is written only when at least
// one field is non-null (serializeSectionMeta returns null otherwise) so the
// common all-default case adds no files.
//
// Every ref is spelled out FOUR times below — the all-null check, the emit
// literal, the parse, and the interface — and once more in the cleared-overwrite
// body in project/aeon/save.ts. That repetition is load-bearing and hostile:
// parse builds a fresh object from known keys only and serialize emits only what
// it enumerates, so a ref missed at any one of them is erased on the next save
// round-trip with no error on any path. Preserving every ref across
// parse->serialize is a cross-tool contract requirement, not local hygiene —
// aeon's generator writes sceneRef into these same files (empyrean
// docs/AURORA_EFFECTS_SCHEMA.md §3/§6/§8; aeon tools/EFFECTS_CONSUMER_CONTRACT.md
// §2.2). Add a ref here and to save.ts together, or don't add it.

export interface SectionMeta {
  bgLayoutRef: string | null;
  paletteRef: string | null;
  sceneRef: string | null;
}

/**
 * Serialize a section meta sidecar, or null when every field is null —
 * callers skip (or clear) the write in that case.
 */
export function serializeSectionMeta(meta: SectionMeta): string | null {
  if (meta.bgLayoutRef === null && meta.paletteRef === null && meta.sceneRef === null) return null;
  return JSON.stringify({
    bgLayoutRef: meta.bgLayoutRef,
    paletteRef: meta.paletteRef,
    sceneRef: meta.sceneRef,
  }, null, 2);
}

/**
 * Parse a section meta sidecar; missing or non-string fields read as null.
 *
 * A non-string value in a KNOWN key reading as null is quiet by design, and the
 * contract leans on it rather than fixing it: it is the stated reason sceneRef
 * is a string id and never a numeric scene index, since `sceneRef: 3` would be
 * read as null here and then erased on the next save, presenting to the user as
 * "the assignment didn't stick" (AURORA_EFFECTS_SCHEMA.md §3).
 */
export function parseSectionMeta(text: string): SectionMeta {
  const raw = JSON.parse(text) as Partial<SectionMeta> | null;
  return {
    bgLayoutRef: typeof raw?.bgLayoutRef === 'string' ? raw.bgLayoutRef : null,
    paletteRef: typeof raw?.paletteRef === 'string' ? raw.paletteRef : null,
    sceneRef: typeof raw?.sceneRef === 'string' ? raw.sceneRef : null,
  };
}
