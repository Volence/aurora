// Canonical JSON serialization — the one place Aurora spells aeon's §5.
//
// CONTRACT: aeon `tools/EFFECTS_CONSUMER_CONTRACT.md` §5, read at aeon
// origin/master `768eb2d8e67474b73982859aa17e9ef81e21626b` (the commit that
// ruled §5's scope). The clause has two halves with deliberately different
// scopes:
//
//   DETERMINISM binds universally — no exceptions, no document classes. Keys
//   sorted alphabetically, RECURSIVELY (Python's `sort_keys=True` is
//   recursive; nested band and layer objects sort too).
//
//   COMPACTNESS is per document class. Tile-array documents
//   (`editor_bg_override.json` and kin) are minified with separators
//   `(",", ":")`. Scalar documents — the effects scene files — are
//   pretty-printed at indent 2.
//
// aeon's two spellings are `json.dumps(obj, sort_keys=True,
// separators=(",", ":"))` and `json.dumps(obj, sort_keys=True, indent=2)`.
// This module is "the equivalent on the Aurora side" for both, and it exists
// as a module rather than two inline calls for the same reason aeon funnels
// its three writers through `bg_override_io.atomic_write_json`: a rule spelled
// once cannot be adopted inconsistently.
//
// WHY ALPHABETICAL AND NOT CONTRACT ORDER (§5, ruled): alphabetical is a total
// order both repos can derive from the data alone. Contract order needs a key
// list maintained identically in two repos, and has no answer at all for the
// unknown keys Aurora round-trips untouched, because insertion order is not
// reproducible across writers.
//
// WHAT THIS MODULE DOES NOT DO: it does not validate, refuse, add defaults or
// drop anything. It is a pure reordering. Every caller keeps its own refusal
// logic, and `bg-override.ts` keeps its own assertion that reordering did not
// become dropping.
//
// NOT IN SCOPE — vendored provenance fixtures. §5: "Canonicalization governs
// what a tool WRITES as output, never what it VENDORS as evidence." A fixture
// whose value IS byte-identity with the artifact it was captured from
// (`test/fixtures/bg-override/editor_bg_override.b0e5a661.json`) keeps the
// bytes it was captured with.

/**
 * Compare two keys by CODE POINT, which is what Python's `sorted` does to
 * `str` keys.
 *
 * JavaScript's default array comparator compares UTF-16 code units, and the
 * two disagree above the BMP: an astral key's leading surrogate is 0xD800,
 * which sorts BELOW U+FFFF even though the code point 0x10000 is above it. No
 * key in today's documents is astral, but the BG override codec is a sole
 * writer of record that round-trips unknown keys it did not author, so the
 * key set is not ours to bound.
 */
function byCodePoint(a: string, b: string): number {
  if (a === b) return 0;
  const ac = Array.from(a);
  const bc = Array.from(b);
  const n = Math.min(ac.length, bc.length);
  for (let i = 0; i < n; i++) {
    const d = ac[i].codePointAt(0)! - bc[i].codePointAt(0)!;
    if (d !== 0) return d;
  }
  return ac.length - bc.length;
}

/**
 * Rewrite `value` with every object's keys in canonical (alphabetical) order,
 * at every depth. Arrays keep their order — an array is a sequence, and
 * `layout`, `tiles`, `phases` and `layers` all mean something positional.
 *
 * Nothing is added and nothing is dropped: the object branch is a LOOP over
 * `Object.keys`, not a list of names, which is what makes "carry what you do
 * not understand" structural rather than a promise someone has to remember.
 * The input is not mutated.
 */
export function canonicalKeyOrder<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => canonicalKeyOrder(item)) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort(byCodePoint)) {
      out[key] = canonicalKeyOrder(src[key]);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * The tile-array document class: canonical order, minified.
 * Equivalent to `json.dumps(obj, sort_keys=True, separators=(",", ":"))`.
 */
export function canonicalJsonMinified(value: unknown): string {
  return JSON.stringify(canonicalKeyOrder(value));
}

/**
 * The scalar document class: canonical order, pretty-printed at indent 2.
 * Equivalent to `json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False)`.
 *
 * The `ensure_ascii=False` half is not a §5 requirement — the clause is silent
 * on escaping — but it is what `JSON.stringify` does, so it is what a Python
 * reader must pass to reproduce Aurora's bytes on a document carrying
 * non-ASCII (the scene golden's display `name` does).
 */
export function canonicalJsonPretty(value: unknown): string {
  return JSON.stringify(canonicalKeyOrder(value), null, 2);
}
