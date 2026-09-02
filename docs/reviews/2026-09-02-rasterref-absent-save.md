# SAVE-ADDS-RASTERREF-NULL — the writer does add the key, and the contract says that is the same state

**Branch** `fix/save-rasterref-absent` · **2026-09-02** · aurora, base master `c9b7e20e`
**Commits** see `git log --oneline master..fix/save-rasterref-absent`
**Status** MEASURED, NOT FIXED — a fix is a contract question (§4), reported with both options.

The hub reported that a full-project save on 2026-08-30 left **33 uncommitted
editor files in aeon's checkout, each having gained `"rasterRef": null`**. Two
things were checked: whether Aurora's section-meta writer adds a key that was
absent in the source file, and whether 33 is a number the tree can produce.

---

## 1. What is in aeon's tree (git objects only, never a working tree)

aeon `origin/master` at **`d78f9090`** (fetched 2026-09-02).

| File | Keys | `rasterRef` | Tail |
|---|---|---|---|
| `games/sonic4/data/editor/ojz/act1/section_0.meta.json` | `bgLayoutRef`, `paletteRef`, `sceneRef` | **absent** | no trailing `\n` (sha256 `3b375c4e…8227b9`) |
| `games/sonic4/data/editor/ojz/act1/section_4.meta.json` | `bgLayoutRef`, `paletteRef`, `sceneRef` | **absent** | one `\n` (sha256 `f16ce9cb…22bdd`) |
| `games/sonic4/data/editor/ojz/act1/section_5.meta.json` | all four | `"ojz_sec5_showcase"` | one `\n` |

**3 sidecars exist at `origin/master`; 2 lack the key; 1 carries a value; 0
carry an explicit `null`.** Across *every* aeon remote ref (22 refs), `git log
--all --diff-filter=A -- '*.meta.json'` names only these three files (plus
`section_0`'s pre-move path). **The 33-file count is not producible as
sidecars**: at most two tracked `meta.json` files can gain the key on any
save. A full save regenerates ~40 files per act (`state/aeon-save.ts` writes
only those whose bytes differ), so 33 modified files is plausible for a full
save, but "each having gained `rasterRef: null`" can be true of at most two of
them. The other 31 are outside this item and were not read (no working tree
access).

## 2. The measurement — the writer adds the key

`src/core/project/aeon/__tests__/aeon-save.rasterref-absent.test.ts` loads the
verbatim bytes of `section_4` / `section_0` above through the exact
full-save path for an untouched section — `loadAeonProject` →
`buildAeonSavePlan`, the pair `src/renderer/state/aeon-save.ts:54` drives —
and compares emitted bytes to input. The first cut asserted byte identity and
was **RED on both fixtures**:

```
  {
    "bgLayoutRef": null,
    "paletteRef": null,
+   "rasterRef": null,
    "sceneRef": "ojz_act1_depth"
  }
```

(`section_0` additionally gains the §8 trailing `\n`, already ruled.)

**The code path, file:line at `c9b7e20e`:**

1. `src/core/project/aeon/load.ts:421-425` — `parseSectionMeta(text)` then
   `section.rasterRef = meta.rasterRef`.
2. `src/core/formats/section-meta.ts:145` —
   `rasterRef: typeof raw?.rasterRef === 'string' ? raw.rasterRef : null` —
   **absent folds to `null` here.** The model has no "absent":
   `Section.rasterRef` is `string | null` (`src/core/model/s4-types.ts:263`,
   default `null` at `:279`).
3. `src/core/project/aeon/save.ts:144-153` — `serializeSectionMeta({...
   rasterRef: section.rasterRef ...})`.
4. `src/core/formats/section-meta.ts:122-127` — emits all four keys through
   `canonicalJsonPretty` (sorted, indent 2, one `\n`).

**The other candidates, eliminated:** `assign_section_preset` /
`set-section-raster` writes one section's field only
(`src/core/editing/history.ts:242-244`, `section.rasterRef = cmd.newRef` on the
addressed section) — it is not what adds the key to every file; the save does,
for every section that has a sidecar on disk, edited or not. There is no
separate "canonicalise on load" step; step 2 *is* the fold.

## 3. What the contract says (empyrean `origin/main` `e7e5a51`, `git show`)

`docs/AURORA_EFFECTS_SCHEMA.md`:

- **§3.1:** *"`null` / absent = 'this section keeps its hand-authored raster
  channel.' Absent and explicit-null are the same state, exactly as for
  `sceneRef`."*
- **§3.1:** *"Canonical form is unchanged (§8): `sort_keys=True, indent=2`,
  exactly one trailing `\n`."* — and §3.1's own example body carries all four
  keys.
- **§3:** *"Write condition (explicit-null semantics, matching the existing
  refs exactly …)"*; the cleared-overwrite body is all explicit nulls.
- **§8:** *"a no-edit save flipped one byte, the scenes defect mirrored. One
  rule, one writer-side fix across all writers"* — the trailing-newline ruling,
  which accepted a one-byte no-edit flip **as the writer migrating a file to
  canonical form**, not as a defect in the writer.

So the sidecar's `rasterRef` is **two-state by contract**. The three-state rule
in `src/core/formats/effects/preset.ts:175-187` is scoped to `cycles` /
`variants` *inside a preset document*, where absent and `null` lower to
different engine values; it is not the sidecar's rule and the contract says
so in as many words. What the contract does **not** say is whether a writer
may spell the same state differently from the source file — it defines the
canonical spelling and calls absent equivalent to it.

Precedent in aeon's own tree: `"paletteRef": null` sits in every one of the
three committed sidecars; no author set a palette. It is the writer's canonical
body, committed once.

## 4. Why no fix landed — the STOP condition

A fix that keeps an absent key absent needs `Section.rasterRef` to hold a
third state (`undefined`), carried through the thirteen ref-set sites the §3
audit names (`cloneSection`, `history.ts` both arms, the command, the cleared
body, the interface, the codec's four sites …), for a key the contract
defines as having two states. And it changes what an explicit unbind writes:
today unbinding writes `"rasterRef": null`; under preserve-absence, unbinding
a section whose file never had the key would either write `null` (a new key
appears — the very diff this item complains of) or stay absent (an unbind that
is indistinguishable from never-bound on disk). Either way the unbind's bytes
change, which the dispatch named as the STOP condition. This is a contract
question, not a parcel's.

**Option A — leave the writer as it is (contract as written).** Cost: a
one-time 2-file diff in aeon's tree (`section_0`, `section_4`) the next time
anyone saves, which aeon commits once as it committed `paletteRef: null` and
the §8 newline. Every later no-edit save is byte-stable. Nothing in Aurora
changes.

**Option B — rule that the writer preserves the source spelling.** Cost: the
three-state model above (thirteen sites, the `Section` type, both history
arms); a contract amendment to §3.1 retracting "the same state" or adding a
"preserve the spelling" clause; the unbind semantics decided explicitly (write
`null` or drop the key); aeon's `effects_gen.py` unaffected (it already reads
absent as null). `section_5` is unaffected either way.

Recommended: **A**, on the contract's own text and its §8 precedent — and the
hub should be told the 33 figure is at most 2 for this key.

## 5. The pin, and its red-first evidence

The test was re-cut as a **pin of the measured behaviour** so a change in
either direction is loud: 4 rows —

- `section_4`: output is the input with **exactly one line** inserted after
  `paletteRef` (expectation derived from the input text, not typed);
- `section_0`: the same insertion plus the §8 tail, nothing else;
- the parsed state is unchanged (`parseSectionMeta(out) ≡ parseSectionMeta(in)`,
  `rasterRef === null`) — §3.1's normative claim;
- the key set is the input's ∪ `{rasterRef}` — no second key, none dropped.

Poisons planted in `section-meta.ts` and restored (`git status` clean
after):

| Plant | Rows red |
|---|---|
| serializer omits `rasterRef` when `null` (the preserve-absence direction) | **3/4** — both byte rows and the key-set row; the state row stays green, correctly (the state did not change) |
| serializer emits a second key `effectsRef: null` | **3/4** — the same three |

`npx vitest run` and `npx tsc --noEmit` aggregates are in the branch report.

## 6. Loose ends noted, not touched

- `aeon-save.test.ts:83-97` `SCENE_META_ON_DISK` says it is "the contract's
  example body (§3 at 1326ceb)" and "as some OTHER writer leaves it", yet was
  widened at `3674d85a` to carry `"rasterRef": null` — so the sceneRef
  round-trip golden no longer resembles aeon's actual `section_0` / `section_4`.
  This file's fixtures are the real bodies; the older comment is stale.
- ROADMAP row 93 is untouched: no fix landed, so there is no row to replace.
- No emulator was run; nothing here needs one. Nothing pushed.
