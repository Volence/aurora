# LAG-ATTRIBUTION-FALSE — the amendment moved no number, and the painted sentence was still wrong

**Branch** `parcel/lag-attribution-false`, from master `e3fac268`.
**Row** ROADMAP §5.1 row 141. **Parcel** `LAG-ATTRIBUTION-FALSE` (EFFECTS-W1).

Everything below was measured in this worktree unless it says RELAYED.
No emulator was touched. No sibling checkout was written.

---

## 0. The one-sentence finding

Row 137 learned that a "description-only" contract amendment can still be a code
change, because `preset.ts` turns the contract's **sentences** into **numbers**.
This landing is the case that lesson does not cover: **no number moved at all**,
every derived constant parsed to the same value before and after — and the parcel
was still not a no-op, because a description-only amendment is exactly the kind
that moves **confidence**, and confidence is carried by prose that is *painted*.

The ramp readout's `title` said `top + 1` / `top + 2` flatly and closed *"NO
STAGE OF THE ENGINE PATH compensates for any of it … (measured by the engine
lane, 2026-09-03)"*. Every word true. It read as **settled machine behaviour**,
and it is an **instrument's reading**.

**Row 137's rule was "check every `schemaNumberFromProse()` derivation".
This adds: check every PAINTED string.**

---

## 1. The contract, hashed rather than believed

`EMPYREAN_DIR` came from **this repo's own resolver** —
`test/support/sibling-root.mjs` `requireSiblingPath('empyrean')`, which answered
by **precedence step 3** (`git rev-parse --git-common-dir`). No absolute sibling
path was typed anywhere, which is what `scripts/check-peer-path-literals.mjs`
polices; every read went through `git show <rev>:<path>` against git **objects**,
never through the sibling working tree (it is another lane's live checkout).

| file | at `bfc000e` | at `origin/main` (`1eecdc35`) | vendored here, before |
|---|---|---|---|
| `contract/schema/aurora-effects-preset.schema.json` | `b3decf6f9005618d8152b4dd4bec8d46c28a80b3` | `b3decf6f…` (same) | `dce3a9b42c0da1ecf2a6ee70463e82930e222599` |
| `contract/schema/tests/effects-preset-vectors.json` | `af5b5ceeb857945789033980bbd6ff764bde58cf` | `af5b5cee…` (same) | `af5b5cee…` (**identical**) |

`git merge-base --is-ancestor bfc000e origin/main` → reachable. The re-vendored
file on disk re-hashes to `b3decf6f…`, re-verified after every red-first restore.

**Every pin in the brief reproduced exactly.** Nothing here disagrees with it.

### 1.1 The vectors — re-measured, not inherited

Row 137 already found the vectors unchanged at `e9409dc`. **That is a finding
about `e9409dc` and not about `bfc000e`**, so it was measured again — and with a
method the previous landing did not use:

```
git log --follow origin/main -- contract/schema/tests/effects-preset-vectors.json
  5bd76ba  … the preset document gains `base_swap` …
  9233883  … the preset document gains `ramp` …
  09472ce  gate: G7 runs the preset document vectors …
```

**Neither `d5e0e7a` nor `bfc000e` appears at all.** Hashing two revisions proves
they are equal; the log proves **nothing in between moved the file and moved it
back**. Blob `af5b5cee` at `5bd76ba`, `e9409dc`, `d5e0e7a`, `bfc000e`,
`origin/main` and on disk. The sidecar revision advances alone; the bytes were
not rewritten.

### 1.2 The revision we skipped, recorded so nobody hunts for it

`d5e0e7a` (blob `780ef0d4…`) sits between `e9409dc` and `bfc000e` and **Aurora
never carried it**. It is the amendment that first named the instrument;
`bfc000e` supersedes it ~2 hours later by sharpening the same clause. Vendoring
it now would be vendoring a superseded blob. Both sidecars say so, so a reader
who finds `780ef0d4` in empyrean's history does not conclude a pin was lost.

---

## 2. Description-only, established here — and now an instrument

Both commit messages assert it. Both readings row 137 used were re-run:

- **Parsed leaf diff.** **0 added, 0 removed, 2 changed-in-place**, both
  `description`, at `/properties/ramp` and `/$defs/ramp/properties/top`. 209
  leaves either side.
- **Stripped comparison.** Every `description` removed at every depth, keys
  sorted, re-serialised: **byte-identical, 3935 characters each** — the *same
  count as at `e9409dc`*, so no structure has moved on this file since.
- `git diff --stat` on the vendored file: **2 insertions, 2 deletions.**

**Both readings agree**, which is the check that matters: they are blind to
different things (a leaf diff to an empty container; a stripped comparison to
anything inside a `description`), so **disagreement would have been the finding.**

### The readings are now committed, not a transcript

`scratchpad/schema-revendor-proof.mjs` — the third time this proof was needed, so
it stops being retyped. Exit **0** description-only, **1** structure moved,
**2** the two readings DISAGREE (never rendered green).

**All three paths proven at this landing with the mutation shown applied on disk:**

| mutation applied | shown | exit |
|---|---|---|
| *(none — the real bytes)* | blobs re-hashed | **0**, both readings DESCRIPTION-ONLY |
| `$defs.ramp.properties.top.minimum = 999` | printed back off disk as `999` | **1**, both readings STRUCTURE MOVED |
| a `description` whose **value is an object** differing only at a nested leaf | `old .n = 1 \| new .n = 2` | **2**, readings DISAGREE — reading 1 flags the leaf, reading 2 strips the subtree |

### At the evaluator level

Nothing was forced in `json-schema-subset.ts`, **measured not assumed**: the
keyword census and the whole-schema walk `assertSchemaSupported` were re-run
against the new bytes (`test/formats/effects-preset-schema-drift.test.ts`, 16
rows green) and the 24 contract vectors re-run unchanged. That is what
"description-only" means at the evaluator level, and it was worth asking —
`multipleOf` was forced into that module by an amendment two CRs ago.

---

## 3. The derived constants — both sides measured

A probe test imported all four and printed them, **before** the re-vendor and
again **after**:

| constant | before | after |
|---|---|---|
| `EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG` | **1** | **1** |
| `EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET` | **2** | **2** |
| `EFFECTS_PRESET_RAMP_TARGET_ARMS` | `['vsram']` | `['vsram']` |
| `EFFECTS_PRESET_RAMP_SPAN_MAX` | **223** | **223** |

No guard threw. The `top` sentence gained its clause **in the middle** —

> …the first written value DISPLAYS on top + 2 for a VSRAM target, not top + 1,
> **AS READ ON ORACLE'S RUST CORE (…)**: screen lines top and top + 1 both
> render…

— and `/DISPLAYS on top \+ (\d+)/` still matched at the same position. The
regexes were **not** widened; each still reads its own node.

---

## 4. The fix — an attribution parsed, not written

`RAMP_DISPLAY_INSTRUMENT` (`src/renderer/providers/effects-preset.ts`) follows
`RAMP_MUST_NOT`'s pattern and parses **two spans of the contract's own text**,
each from **its own node** — the same split `RAMP_KEY` documents in the codec:

```
verdict      properties.ramp
             "top+2 is the instrument's reading today and not a ratified hardware fact"

attribution  $defs.ramp.properties.top
             "AS READ ON ORACLE'S RUST CORE (the legacy core reads one line earlier and
              is self-inconsistent; the landing line is unpinned in the Rust core's own
              model; no hardware referee exists)"
```

The `top` node's clause was chosen for the painted half because **the contract
itself wrote it at author length** — it names the core, the disqualified referee,
the unpinned line and the missing hardware referee in ~180 characters. The
trailing intra-document cross-reference *"see the ramp description"* is dropped
by an **anchored** rule (a reworded clause refuses rather than being half-
trimmed), because a tooltip reader cannot follow it.

**Four module-load refusals**, each naming its regex and its node:

1. the verdict missing from `properties.ramp` — *"dropping it silently restores
   the flat over-attribution this whole derivation exists to end"*;
2. the instrument clause missing from `$defs.ramp.properties.top`;
3. the clause having lost **any of the three facts the note promises an author**
   (a disqualified second core, an unpinned landing line, no hardware referee) —
   a clause missing one would paint a hollow caveat that *looks* like an
   attribution;
4. **the interlock**: the offset the verdict names must equal
   `EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET`, which is parsed from a
   **different sentence in a different node**. Three contract statements of one
   quantity; two of them disagreeing now refuses rather than painting a number
   the contract does not agree with itself about.

### The painted note now reads

> …so a run at the very bottom (top + lines = 223) puts its last value on line
> 224, where it can never be seen. **WHOSE NUMBERS THESE ARE: top+2 is the
> instrument's reading today and not a ratified hardware fact — AS READ ON
> ORACLE'S RUST CORE (the legacy core reads one line earlier and is
> self-inconsistent; the landing line is unpinned in the Rust core's own model;
> no hardware referee exists).** NO STAGE OF THE ENGINE PATH compensates for any
> of it…

The connective words are mine; **every claim is the contract's.** The
"no stage compensates" sentence **stays**: it is aeon's measurement about
compensation and it was not withdrawn — what was withdrawn is a different claim
(§5).

---

## 5. The withdrawn attribution

*"the engine moved `fire+1 → fire+2` on 2026-08-19 (aeon `c44c80ad..727715f4`)"*
— withdrawn at `d5e0e7a`. **aeon's own two-core test refuted its own finding:**
BOTH raster tiers shift by one line between oracle's Rust core and oracle's
legacy C++ core on the same ROM bytes, so what moved on 2026-08-19 was the
**reading instrument**, not the engine.

A row asserts it never reaches an author from this surface
(`expect(RAMP_DISPLAY_LAG_NOTE).not.toMatch(/2026-08-19/)`).

---

## 6. The sweep — by PHRASE, not by touched files

Two greps over `src/`, `test/`, `scratchpad/`, `docs/`, `scripts/`: one for the
withdrawn attribution (`fire+1` / `fire+2` / `2026-08-19`), one for the display
claim (`top + 2`, `top + j`, `N+1`). Unrelated `N+1` hits (animation duration
bytes, `v_palette_line_(N+1)`, chunk ids) were triaged out.

**13 corrections in 12 files.** Each corrected **in place**, saying what replaced
it and why — struck and annotated, never deleted.

| # | file | what was wrong |
|---|---|---|
| 1 | `src/core/formats/effects/preset.ts` | the display-geometry docblock stated the numbers as though the machine had been asked |
| 2 | `src/core/formats/effects/preset-lag.ts` | *"IT IS SETTLED, AND THE MEASUREMENT WON"* — and ⚠ **it named the WRONG CORE**: *"oracle is Exodus-derived"* is true of **oracle-old**, the legacy C++ port; the readings are the ground-up **Rust** core's, and the distinction is now load-bearing because the two cores disagree |
| 3 | `src/core/formats/effects/ramp-scroll-mode.ts` | *"IT IS NO LONGER CONTESTED — do not re-add a caveat"* |
| 4 | `src/renderer/components/effects/BandPresetPanel.tsx` (lag-disclosure mount) | *"SETTLED AND IS NOT A CAVEAT ANY MORE … Do not re-add a contested note"* |
| 5 | `src/renderer/components/effects/BandPresetPanel.tsx` (scroll-mode hint) | *"did not move when the display-span question SETTLED"* |
| 6 | `src/renderer/providers/effects-preset.ts` | **the painted note** — §4 |
| 7 | `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts` | header: *"SETTLED … Do not re-add it as a caveat"* |
| 8 | `src/renderer/providers/__tests__/effects-preset-ramp-scroll-mode.test.ts` | header: *"a real ROM rendered 5..223 … SETTLED in the ROM's favour"* |
| 9 | `src/renderer/components/effects/__tests__/ramp-control-wording.test.ts` | *"the contract SETTLED it in the ROM's favour"* |
| 10 | `test/formats/effects-preset-ramp.test.ts` | header item 2 stated the lag with no instrument |
| 11 | **`scratchpad/ramp-control-harness.mjs`** | the witness-mode note argued from *"the contract's own arithmetic"* as if a witness run ratified 5..224 |
| 12 | **`scratchpad/ramp-scroll-mode-harness.mjs`** | *"It SETTLED in the ROM's favour"* — and *"a real ROM"* was an emulator core |
| 13 | `docs/ROADMAP.md` row 137 | the SPARSE/DENSE paragraph carried the **withdrawn** attribution |

Plus three review packets annotated with superseding notes (dated records, so
struck rather than rewritten): `2026-09-03-ew-revendor-boundary.md` (which
carried the withdrawn attribution as RELAYED — **the second copy, found by
phrase and not named in the brief**), `2026-09-03-ew-revendor-ramp.md` §5.2, and
`2026-09-03-certification-record.md` (whose paragraph still says in the present
tense that *"Aurora derives first-displayed-line `top + 1`"*, which stopped being
true at `e9409dc`).

**⚠ THE `.mjs` HALF IS THE HALF THAT NEEDED THE PHRASE SEARCH.** Neither `tsc`
nor a compile-error sweep reaches `scratchpad/*.mjs`, and
`ramp-control-harness.mjs` has been stale in exactly this way before (it once
carried a typed `delta === 1`). Searching the files this parcel touched would
have found neither harness.

**The distinction the corrections draw**, everywhere: *what settled is that **two
readers agree** — Aurora's derivation and aeon's measurement — **not that
hardware has answered**.* The old text is kept so nobody "fixes" the wrong side
back.

---

## 7. Gates

### 7.1 Two new node rows — runner: `npm test` (vitest)

`src/renderer/providers/__tests__/effects-preset-ramp-control.test.ts`, **34 → 36
rows**, in a suite already wired into `npm test`. No new runner.

**Expectations derived from source, not from the module.** The file re-reads the
vendored schema **with its own regexes** and requires the painted string to carry
those spans — so it is a second independent reading, not
`RAMP_DISPLAY_INSTRUMENT` compared to itself. If the module ever hand-writes the
attribution, these fail. Anti-vacuous asserts confirm the two nodes really carry
the clauses before anything is compared.

**Red-first, each mutation shown applied on disk, each restored from the
committed baseline `43093fc6` (`git checkout 43093fc6 -- <path>`, never
`git checkout --` on a dirty tree):**

| # | mutation on disk | shown | result |
|---|---|---|---|
| 1 | the attribution derived but **not painted** | `grep -n 'MUTATION: the attribution is derived but NOT painted'`, `git diff --stat` = 1 file, +1/−2 | **1 row red** (`the painted note attributes its numbers…`), 35 passed |
| 2 | the attribution **hand-typed** instead of derived | `grep -n 'MUTATION: typed, not derived'`, `git diff --stat` = +1/−1 | **1 row red**, 35 passed |
| 3 | the contract's instrument clause replaced by *"as measured"* | the `top` description printed back off disk | **module-load refusal** naming the regex `/(AS READ ON ORACLE'S RUST CORE) \(([^)]*)\)/` and the node — the whole suite cannot load, which is the design |
| 4 | the verdict says `top+3` while the `top` sentence yields 2 | the verdict printed back off disk | **module-load refusal**: *"names top+3 while its `top` field sentence yields 2 … painting either would ship a number the contract does not agree with itself about"* |

After the last restore the schema re-hashes to `b3decf6f…` and `git status` is
clean.

### 7.2 Proven in `dist/` — and stated precisely

`RAMP_DISPLAY_LAG_NOTE` is **painted**, so a source-only proof does not show what
an author sees. `npm run build`, then grep the bundle:

| | `WHOSE NUMBERS THESE ARE` | probe |
|---|---|---|
| **under mutation** (`MUTATION-IN-DIST-PROBE-NO-ATTRIBUTION`) | **0** | `index-CoML-V7W.js:1` |
| **after restore + rebuild** | `index-Du_zRZkj.js:2` | **0** |

and in the code-split chunk carrying the schema
(`classicProjectStore-5QeP9M-w.js`): `no hardware referee exists` ×2,
`unpinned in the Rust core` ×1, `legacy core reads one line earlier` ×1.

**⚠ WHAT THIS PROVES AND WHAT IT DOES NOT.** The note is **composed at runtime**
from the bundled schema, so the `dist/` grep shows that the composition site and
the contract clause **both shipped** — it does not execute the composition. Row
7.3 is the step that does. Saying otherwise would be the over-claim this parcel
is about.

*(The one `2026-08-19` occurrence in the bundle was chased down: it is my own new
docblock, in the sentence marking the attribution **withdrawn**. Not a survivor.)*

### 7.3 One harness row changed — runner: `npm run harness:ramp-control`

`scratchpad/ramp-control-harness.mjs` gains **`[ds-d]`** — **22 → 23 `check()` sites**, counted
off the file (`git show HEAD:…` before, the working copy after) rather than quoted; ROADMAP row
128's *"18 rows"* predates three later additions and is stale. Beside
the existing `[ds-c]`. `[ds-c]` proves the reason reaches the author; it says
nothing about **whose** reason it is.

`[ds-d]` reads the display-span readout's own `title` in the running app and
requires the contract's **verdict** and **instrument clause**, plus
`no hardware referee exists`, and requires the withdrawn `2026-08-19` attribution
to be **absent**. The expectation is parsed from the **same vendored schema**
with the harness's own regexes (a `.mjs` imports nothing from the TypeScript, so
a typed phrase here would go stale unnoticed — the `=== 1` defect this file has
already had once), with its own loud refusal if the contract stops attributing
its numbers. **Loud on unmeasurable:** if the readout is not on screen the detail
reads `UNMEASURABLE: … this is not a pass`, never a green.

**⚠ `[ds-d]` HAS NOT BEEN RUN.** It needs Electron and this lane does not launch
one. **TAGGED for the owner's foreground run** on the merged tree, which the
brief already plans.

---

## 8. Suite

Run in the **linked worktree** (`.claude/worktrees/agent-af43182b1c44ceddc`), so
`sibling-root` step 3 is unmeasurable here and the total legitimately differs
from the main checkout by one pass / one skip.

- `npx tsc --noEmit` — **clean**, exit 0.
- `npm test` — see §9 for the aggregate.

---

## 9. Left open

- **`[ds-d]` is unrun** (§7.3). TAGGED — needs Electron.
- **Nothing else in Aurora models the SPARSE tier's landing rule**, so the
  withdrawal of the `fire+1 → fire+2` attribution leaves no derived value to
  correct. Row 137 swept for this and found no model; the phrase sweep here
  re-confirmed there is still no `bandDisplaySpan`, no fire display-line gloss
  and no shared lag constant. **No finding, and no follow-up.**
- **ROADMAP row number 141** was taken as the next free number after 140. **No
  collision was hit**; if a parallel lane also took 141, renumber this one.
- **The instrument's own question is oracle's, not Aurora's.** What would settle
  `top + 2` is oracle's sub-line VDP modelling; nothing in this repo can produce
  that, and nothing here should pretend to be waiting on it as a blocker.
