// WRITE ONLY WHAT CHANGED — the *meaning* test, not the byte test.
//
// `state/aeon-save.ts` has skipped byte-identical writes since 2026-08-18, for
// the mtime reason stated there (aeon's build re-bakes the level tree when an
// editor source looks newer than a generated one). That skip is too weak, and
// the cold-reader walkthrough measured exactly how weak: **one Ctrl+S rewrote
// 25 files, 23 of which were byte-different and semantically identical**
// (docs/reviews/2026-09-02-effects-cold-walkthrough.md item d9). A person
// reverting a bad experiment then has to find his two real edits inside a
// 25-file diff — which is the owner's own account of why reverting is
// miserable, not a cosmetic complaint.
//
// The 23 are not mysterious; `test/handover/ojz-sec5-showcase.test.ts` had
// already classified them file-by-file against aeon's object store:
//
//   • 22 JSON documents differ ONLY by the canonical trailing newline (§8,
//     ruled 2026-08-26). aeon's Python writers use `json.dumps`, which emits
//     none, so every one of their committed documents gains one byte the first
//     time Aurora saves — and gains it AGAIN every time the author reverts.
//   • 2 section sidecars differ ONLY by `"rasterRef": null`, a key written
//     before `rasterRef` existed. Absent and explicit-null are the SAME state
//     for this file — see `sectionMetaEquivalent` below, which is the only
//     place that relaxation is spelled and cites its evidence.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY A SKIP AND NOT A DIFFERENT SERIALIZER
// ═══════════════════════════════════════════════════════════════════════════
//
// The other repair for "an untouched document must not move" is to make the
// writer reproduce the source bytes — drop the trailing newline when the
// source lacked it, keep `rasterRef` absent when the source omitted it. Both
// halves were considered and both are worse:
//
//   • The trailing newline is a RULED CONTRACT (empyrean
//     AURORA_EFFECTS_SCHEMA.md §8: "one rule, one writer-side fix across all
//     writers"). Reproducing the source's newline state is the "churn rider"
//     that ruling explicitly superseded. A parcel does not retract a contract.
//   • Keeping `rasterRef` absent needs `Section.rasterRef` to carry a third
//     state through thirteen ref-set sites, for a key the contract defines as
//     having two — the STOP condition recorded in
//     docs/reviews/2026-09-02-rasterref-absent-save.md §4.
//
// A skip needs neither. The writer's canonical form is untouched: when a
// document's meaning HAS changed, it is written in full canonical form, newline
// and all. What changes is only whether an unchanged document is touched at all.
//
// ⚠ THE CONSEQUENCE, NAMED: aeon's committed JSON keeps its no-trailing-newline
// form until something in it actually changes. That is the same position the
// sec5 handover took in as many words — the 24-file reformat "is aeon's call to
// take and not ours to smuggle in beside a band". Anyone who wants the
// migration can take it deliberately; it is no longer a rider on every save.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE DIRECTION THAT WOULD BE A DEFECT
// ═══════════════════════════════════════════════════════════════════════════
//
// A save that silently skips a file that DID change is far worse than one that
// writes too many, so every rule here is the conservative one:
//
//   • The default is `'bytes'` — today's behaviour. A new writer that forgets
//     to tag its push site writes MORE, never less.
//   • Anything that fails to decode or fails to parse as JSON is WRITTEN. A
//     file we cannot read the meaning of has no meaning to compare.
//   • `null` is NEVER treated as absent except for the section-meta sidecar,
//     where the format's own two-state rule says so. It is emphatically NOT
//     true of preset documents, where `cycles` and `variants` have three states
//     each and absent lowers differently from null
//     (core/formats/effects/preset.ts) — those are compared as plain JSON
//     values, where absent and null are different.

/** How a planned write decides whether the file on disk already says this. */
export type SaveCompare =
  /** Byte identity, and nothing else. The default, and what every binary uses. */
  | 'bytes'
  /** Same parsed JSON value: whitespace, indentation, key order and the
   *  trailing newline do not count; a null and a missing key DO. */
  | 'json'
  /** `json`, plus the sidecar's ruled two-state relaxation for its ref keys. */
  | 'section-meta';

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Deep equality over JSON values. Arrays are POSITIONAL (a layout, a tile row
 * and a band list all mean something by index); objects are compared by key
 * SET and value, so key order — the thing `sort_keys` moves — does not count.
 */
export function jsonValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonValueEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    // NaN cannot appear in parsed JSON, so `===` above is the whole story for
    // scalars; anything reaching here with different identity differs.
    return false;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!jsonValueEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/** Drop TOP-LEVEL keys whose value is exactly `null`. Not recursive: the
 *  relaxation below is a property of the sidecar's own scalar ref keys, and
 *  nothing about it generalises to nested documents. */
function withoutNullKeys(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) if (src[k] !== null) out[k] = src[k];
  return out;
}

/**
 * The section-meta sidecar's relaxation: an ABSENT key and an explicit `null`
 * are the same state, so a document that differs from the planned bytes only in
 * which of its all-null keys are spelled out means the same thing.
 *
 * EVIDENCE, not assumption — three independent readers agree:
 *
 *   1. THE CONTRACT. empyrean docs/AURORA_EFFECTS_SCHEMA.md §3.1: "`null` /
 *      absent = 'this section keeps its hand-authored raster channel.' Absent
 *      and explicit-null are the same state, exactly as for `sceneRef`."
 *   2. AEON'S GENERATOR, read at origin/master in `tools/effects_gen.py`
 *      (`_load_section_refs` → `_scene_ref(path, meta.get(key), …)`):
 *      `dict.get` on a missing key yields `None`, and `_scene_ref` returns
 *      `None` for `None`. An absent key and a null key produce byte-identical
 *      generated output. `tools/effects_seam_gate.py` uses the same loader.
 *   3. AURORA'S OWN PARSER. `core/formats/section-meta.ts` `parseSectionMeta`
 *      folds a missing key to `null`; `Section.rasterRef` has no third state.
 *
 * ⚠ SCOPE. The relaxation is for keys that are null on ONE side and missing on
 * the other. A key whose value differs in any other way — a real binding, an
 * unbinding, a numeric `rasterRef` an author typed by hand — is a difference
 * and the file is written. And it is not applied to any other document class:
 * aeon's own `_load_section_refs` says the sidecar "will grow keys this
 * generator does not read", which is true of the SIDECAR and of nothing else.
 */
function sectionMetaEquivalent(a: unknown, b: unknown): boolean {
  return jsonValueEqual(withoutNullKeys(a), withoutNullKeys(b));
}

/**
 * Does this planned write have to reach disk?
 *
 * `old` is the file's current bytes, or null when it is absent or could not be
 * read — in which case the answer is always yes.
 */
export function planFileNeedsWrite(
  compare: SaveCompare | undefined,
  old: Uint8Array | null,
  next: Uint8Array,
): boolean {
  if (!old) return true;
  if (bytesEqual(old, next)) return false;
  if (!compare || compare === 'bytes') return true;

  let a: unknown;
  let b: unknown;
  try {
    const dec = new TextDecoder('utf-8', { fatal: true });
    a = JSON.parse(dec.decode(old));
    b = JSON.parse(dec.decode(next));
  } catch {
    // Undecodable or unparsable on EITHER side: no comparable meaning, so the
    // planned bytes win. (The plan's own `understood()` gates already refuse to
    // overwrite a file the LOAD could not read; this is the backstop for
    // everything else.)
    return true;
  }

  if (jsonValueEqual(a, b)) return false;
  if (compare === 'section-meta' && sectionMetaEquivalent(a, b)) return false;
  return true;
}
