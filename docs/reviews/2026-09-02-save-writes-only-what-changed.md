# EW-SAVE-NOISE — a save writes a file only when its MEANING changed

**Branch** `fix/save-writes-only-what-changed` · **2026-09-02** · aurora, base master `eae81833`
**Status** FIXED and MEASURED in the running app. Nothing pushed.
**Defect** EFFECTS-W1 item 9, `docs/reviews/2026-09-02-effects-cold-walkthrough.md` **d9**.

> One Ctrl+S rewrote **25 files**. Twenty-three were byte-different but
> semantically identical … A person reverting a bad experiment has to find his
> two real changes inside a 25-file diff.

The owner's account of the same surface — *"it kept giving errors during build
time that I would have to stop and revert the changes"* — is why this is not a
tidiness item. **Every revert put the 23 back**, so the noise is not a one-time
migration a tree absorbs; it is a rider on every save, forever, for the exact
person who is trying to undo something.

---

## 1. The measurement — before and after, both taken here

`scratchpad/save-file-count-harness.mjs` (`npm run harness:save-file-count`).
Both runs: aeon `b294234b` extracted with `git archive` into a **fresh** temp
tree per run (aeon's working tree is never opened), the app driven under CDP,
**one** editor change through the real control, **one real Ctrl+S**, then the
whole 310-file tree re-hashed. Same machine, same session, same afternoon —
neither figure is quoted from anyone.

| | files moved by ONE edit + ONE Ctrl+S |
|---|---|
| **before** (master `eae81833`, built from that tree) | **24** |
| **after** (this branch) | **1** |

**The one that still moves, named and justified:**

| path | why |
|---|---|
| `games/sonic4/data/editor/ojz/act1/section_0.meta.json` (108 → 142 B) | **the edit itself.** The author bound raster preset `authored_probe` to section 0; this is the sidecar that records it. Row [4b] reads the bytes back and asserts `rasterRef === "authored_probe"`. |

**The 23 that no longer move, classified before they were removed** — not
absorbed into a total:

| count | what differed | why it is not a change |
|---|---|---|
| 22 | exactly **+1 byte**: the §8 canonical trailing newline | aeon's Python writers use `json.dumps`, which emits none. Parsed value identical. Includes `chunks.json`, `ojz_bglib.json`, `editor_bg_override.json`, every section's `.objects.json`/`.rings.json`, and `effects/ojz_act1_start.json` — **the scene the cold reader never opened.** |
| 1 | `section_4.meta.json` 80 → 101 B: gained `"rasterRef": null` | §2 below. |

(The walkthrough counted 25 from **two** edits; this run makes one, so 24 is the
same measurement with one less real file in it.)

### ⚠ One row in that harness does not carry the claim

Row **[2a]** — *"a save with NO EDIT moves NOTHING on disk"* — passed on the
**defective** build too, so it has zero discriminating power for this fix. The
reason is `saveActive` (`src/renderer/state/project-runtime.ts:213-218`): *"a
tab nothing owns … or a clean one is a silent no-op"*. A Ctrl+S over an
unedited project never reaches the save plan at all, on either build. The row is
KEPT because the property is worth pinning, and it is named here because a
reader counting 8 green rows would otherwise credit it with half the proof. The
discriminating rows are **[4a]** (24 → 1) and **[4b]**.

**Anti-vacuous plant, run:** `PLANT=blind-walk` points the tree walk at a
directory that does not exist — the failure that makes every "0 files moved"
row true in the most convincing possible way. Row **[1b]** goes red and the run
**aborts (exit 2)** rather than printing a green zero.

---

## 2. What `"rasterRef": null` actually does downstream

**Nothing.** Absent and explicit-null are the same state for this key, and three
independent readers agree — this was established by reading each, not by
trusting the contract sentence:

1. **aeon's generator**, `tools/effects_gen.py` at `origin/master`
   (`_load_section_refs` → `_scene_ref(path, meta.get(key), …)`): `dict.get` on
   a missing key yields `None`, and `_scene_ref` returns `None` for `None`. An
   absent key and a null key produce byte-identical generated output.
   `tools/effects_seam_gate.py` uses the same loader. The same file also rules
   that the sidecar "will grow keys this generator does not read", so an unknown
   key there is not a build break either.
2. **The contract**, empyrean `docs/AURORA_EFFECTS_SCHEMA.md` §3.1: *"Absent and
   explicit-null are the same state, exactly as for `sceneRef`."*
3. **Aurora's own parser**, `core/formats/section-meta.ts` — a missing key folds
   to `null`; `Section.rasterRef` has no third state.

⚠ **THE THREE-STATE TRAP IS REAL AND IT IS SOMEWHERE ELSE.** `cycles` and
`variants` inside a **preset document** have three states each, and absent
lowers differently from null (`core/formats/effects/preset.ts:169-187`). Any
"null is absent" relaxation applied document-wide would silently swallow a
preset turning cycling OFF. So the relaxation here is scoped to the sidecar and
nowhere else, and there is a test whose only job is that scope.

**So the defect in d9's second half is not what the key MEANS — it is that the
file was touched at all to add it.** The fix is therefore not to change what the
writer emits (a `rasterRef` unbind must still write `null`): it is to stop
rewriting a file whose meaning has not moved. `section_4.meta.json` now keeps
its committed bytes until something in it actually changes.

That also closes the STOP condition recorded in
`docs/reviews/2026-09-02-rasterref-absent-save.md` §4 without paying its price:
that lane's Option B needed `Section.rasterRef` to carry a third state through
thirteen ref-set sites and a contract amendment. **Neither was needed.** The
`aeon-save.rasterref-absent.test.ts` pin it left behind is untouched and still
green: the writer's canonical body is genuinely unchanged.

---

## 3. Which fix, and why not the other one

**Chosen: selective write by semantic equivalence.** Not stable formatting.

`state/aeon-save.ts` already skipped byte-identical writes (for the mtime reason
stated there — aeon's build re-bakes the level tree when an editor source looks
newer than a generated one). That skip was too weak: it cannot see that two
different byte strings say the same thing. `planFileNeedsWrite`
(`src/core/project/aeon/save-skip.ts`) replaces the byte test:

- **`'bytes'`** — byte identity. **The default**, and what every binary uses. A
  push site that forgets its tag writes MORE, never less.
- **`'json'`** — same parsed JSON value. Whitespace, indentation, key order and
  the trailing newline do not count; **a null and a missing key DO**.
- **`'section-meta'`** — `'json'`, plus the sidecar's ruled two-state
  relaxation, applied to top-level keys that are `null` on one side and absent
  on the other. Nothing else.

Anything that fails to decode as UTF-8 or fails to parse as JSON is **written** —
a file whose meaning we cannot read has no meaning to compare.

**The alternative — make an untouched document round-trip byte-identical — was
rejected on two counts, both of which would have been a parcel overruling a
ruling:**

- The trailing newline is ruled (`AURORA_EFFECTS_SCHEMA.md` §8: *"one rule, one
  writer-side fix across all writers"*). Reproducing the source's newline state
  is the "churn rider" that ruling explicitly superseded.
- Keeping `rasterRef` absent is the thirteen-site third state above.

**⚠ THE CONSEQUENCE, NAMED.** aeon's committed JSON keeps its
no-trailing-newline form until something in it actually changes. That is the
position `test/handover/ojz-sec5-showcase.test.ts` already took in as many
words — the 24-file reformat *"is aeon's call to take and not ours to smuggle in
beside a band"*. Anyone who wants the migration can take it deliberately; it is
no longer a rider on every save. **The writer's canonical form is unchanged**:
when a document's meaning HAS moved it is written in full canonical form,
newline and all.

---

## 4. Proof the fix does not swallow a write that was needed

A save that silently skips a file that DID change is far worse than one that
writes too many. Every plant below was applied **on disk**, shown with `git
diff`, run, and restored from the committed baseline (`git status` clean after).

| plant | what it does | rows red |
|---|---|---|
| **1** | revert to the old byte-only skip | **5** — every SKIP row, unit and end-to-end. Every WRITE row stays green, correctly: the byte test never over-skips. |
| **2** | skip every tagged write | **8** — *every* class of real change: JSON value moved, key added/dropped, preset null-vs-absent, sidecar bind / rebind / **unbind**, numeric ref, and both end-to-end write rows. |
| **3** | let the sidecar relaxation escape its scope to all JSON | **1** — the preset three-state row, and only it. That row is the sole witness for the trap §2 names. |
| **4** | re-tag the PRESET push site as `'section-meta'` | **⚠ GREEN at first** — see below. Now **1** red. |
| **5** | treat an unparsable disk file as "same" | **2** — the unparsable and non-UTF-8 rows. |
| **6** | drop the `compare` tag from the `objects.json` push site | **2** — the tag-coverage row and the end-to-end newline row. |

### ⚠ Plant 4 came back green, and that is a finding

`planFileNeedsWrite` is unit-tested exhaustively and the glue is tested end to
end, and **both stayed green** when the preset push site was mis-tagged — a
mutation that would let a preset's `cycles: null` be mistaken for an absent
`cycles` and the write silently skipped. Nothing observed the **tags**: the
predicate's tests supply their own tag, and the glue fixture has no preset in
it. The matcher was not the problem; the **seam** had no author.

`src/core/project/aeon/__tests__/save-compare-tags.test.ts` closes it. Its rows
are derived from the format's own three-state rule, not from a list of expected
strings, so a re-tag is caught by what it would DO. Plant 4 is now red on
exactly the preset row; plant 6 (a dropped tag) is red on the coverage row.

---

## 5. What changed

| file | |
|---|---|
| `src/core/project/aeon/save-skip.ts` | NEW — `planFileNeedsWrite`, `jsonValueEqual`, and the only place the sidecar relaxation is spelled, with its three sources cited. |
| `src/core/project/aeon/save.ts` | `AeonSaveFile` gains `compare?`; the eleven JSON push sites are tagged. Binaries deliberately untagged. |
| `src/renderer/state/aeon-save.ts` | the byte comparison becomes `planFileNeedsWrite`. |
| `src/core/project/aeon/__tests__/save-skip.test.ts` | NEW — 18 rows, skip and write halves. |
| `src/core/project/aeon/__tests__/save-compare-tags.test.ts` | NEW — 5 rows, the plant-4 seam. |
| `src/renderer/state/__tests__/aeon-save.test.ts` | +4 end-to-end rows: newline-only skip, sidecar absent-ref skip, and the two WRITE rows that would catch either going too far. |
| `scratchpad/save-file-count-harness.mjs` | NEW, **registered in `package.json` in the same commit**. |

**Suite:** 6405 → **6432** (+27), 465 → 467 files, 8 skipped either side, all
green. `npx tsc --noEmit` clean. Both harness gates
(`scratchpad/check-harness-guards.mjs`, `scripts/check-peer-path-literals.mjs`)
pass on the new file.

## 6. Not touched

- The writer's canonical form, in either document class.
- `Section.rasterRef`'s two states, and every one of the thirteen ref-set sites.
- The unbind semantics: an unbind still writes `"rasterRef": null`, and the test
  for it is one of plant 2's eight.
- aeon. Read at revisions through `git show` / `git archive` only; its working
  tree was never opened, and every save in this parcel went to a temp copy.
- No emulator was run. Nothing here needs one.
