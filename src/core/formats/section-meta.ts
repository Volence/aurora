// Per-section metadata sidecar ({dataPath}section_N.meta.json).
//
// Sections persist as raw binaries (.tiles.bin/.coll.bin) plus JSON sidecars
// for objects/rings; there is no general section-meta file. This sidecar holds
// the scalar refs the binaries can't carry — currently the per-section
// background assignment (bgLayoutRef: null = act default, else an
// S4Project.bgLibrary id) and paletteRef. It is written only when at least one
// field is non-null (serializeSectionMeta returns null otherwise) so the
// common all-default case adds no files.

export interface SectionMeta {
  bgLayoutRef: string | null;
  paletteRef: string | null;
}

/**
 * Serialize a section meta sidecar, or null when every field is null —
 * callers skip (or clear) the write in that case.
 */
export function serializeSectionMeta(meta: SectionMeta): string | null {
  if (meta.bgLayoutRef === null && meta.paletteRef === null) return null;
  return JSON.stringify({ bgLayoutRef: meta.bgLayoutRef, paletteRef: meta.paletteRef }, null, 2);
}

/** Parse a section meta sidecar; missing or non-string fields read as null. */
export function parseSectionMeta(text: string): SectionMeta {
  const raw = JSON.parse(text) as Partial<SectionMeta> | null;
  return {
    bgLayoutRef: typeof raw?.bgLayoutRef === 'string' ? raw.bgLayoutRef : null,
    paletteRef: typeof raw?.paletteRef === 'string' ? raw.paletteRef : null,
  };
}
