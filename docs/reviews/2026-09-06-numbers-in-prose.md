# Numbers a person reads, typed instead of derived

Branch `parcel/numbers-in-prose`. Base `165a745e`.

A constant restated in author-facing prose has **two authors and no arbiter**: the
code enforces one value, the sentence beside it states another, and the two rot on
separate clocks. The aeon lane shipped the worst instance of this on 2026-09-06 (a
refusal telling a blocked author *"the limit is the owner's ruled authoring budget
(decision d-9, 12 KiB)"* while the code enforced 20480) and fixed it by **deriving**
the figure.

Aurora has shipped the identical defect before, and the record is in its own source.
`src/core/formats/effects/scene-ui.ts:9-14`:

> This paragraph used to say "the layer count is 1..8" and was wrong within the day
> empyrean `277bc15` raised the ceiling to 16 — the sentence explaining why numbers
> must not be typed in had a typed-in number inside it.

**All four briefed sites were real, and they were a sixth of it.** 26 sentences
across 11 files were re-typing a constant the same module already had.

---

## 1. The predicate, and why it is not aeon's

aeon swept for: a **string literal** of 20+ chars carrying **both** a bound word
(`limit|ceiling|budget|max|at most|no more than|cap|must be under|fits|allows|reserve|floor`)
**and** a numeric literal.

Borrowed unchanged, that predicate is near-useless here, for two **independent**
reasons. Both are measured below, not asserted.

### 1a. Shape — it matches one literal at a time

Aurora's author-facing prose is overwhelmingly multi-line JSX `title=` attributes and
`+`-concatenated chunks, so the number and the words that qualify it routinely live in
**different literals** and neither half matches alone. The clearest case in the tree is
`bg-anim-aeon.ts` `axisOptions()`, where the bound word and its number are in adjacent
literals:

```
'The pattern translates along X. Its period is cols*8 px, and ROWS is the key that must '
  + 'make rows*32 a power of two. …'
```

`must` is in literal 1, `32` is in literal 2.

The census parses with the TypeScript compiler and **folds** `+` chains, template
literals, conditional arms and multi-line JSX attribute values into one sentence before
matching.

### 1b. Vocabulary — Aurora's instances carry no bound word at all

They are **encoding** sentences, not budget sentences: `"s2: second shift (15 = single
term)"`, `"cols * 32 bytes per pattern ROW"`. There is no word from aeon's list anywhere
in them.

So the census predicate is: an **author-facing** string (a position, not a word list:
JSX `title`/`label`/`alt`/`hint`, an object property whose key says it is shown, JSX
text, and — added after it exposed a real gap — a zod `.describe()` argument), 20+ chars,
carrying a **standalone integer**, **ranked** by whether that integer equals a value the
repo derives from a vendored artifact. Ranking, not filtering: coincidence is possible,
so a hit is a candidate for a human verdict, never a finding.

### 1c. Measured: aeon's predicate, borrowed unchanged, on Aurora at the base revision

```
aeon predicate, borrowed unchanged, at 165a745e: 47 candidate(s) over 510 files.
of the FOUR briefed sites, returned: 0
```

**Zero of four.** Not "nearly empty" — empty, on the sites the parcel was chartered
against. It returns 47 other rows, most of them already-derived refusals
(`"block capacity reached: ${MAX_BLOCKS_TOTAL} blocks max …"`), because it does not mask
interpolations. It did independently find one real site
(`classic-surface-plan.ts` "1025th block"), which is fixed here.

That is the honest shape of the disagreement: aeon's predicate is not merely
lower-recall on this tree, it is **orthogonal** to the class this parcel was pointed at.

### 1d. Where I did not follow the mid-flight advice, and why

The coordinator relayed aeon's measurement that joining raises their count 21 → 158 and
that an **80-char proximity window** between the bound word and the number is what makes
the result reviewable again, plus an ISO-date filter.

- **Interpolation masking: already done**, before the advice arrived. `${…}` holes are
  replaced with a non-numeric token in both instruments. Arm 3 below proves it.
- **ISO-date filter: adopted, and it was earning its keep here too.** `2026-08-29` inside
  one collision-tool description yielded a bare `8` that matched `BGANIM_PHASE_BANKS`.
  Masked in both instruments.
- **Proximity window: deliberately not adopted.** Their 158-row explosion comes from
  module **docstrings** becoming one logical string that almost always contains some
  bound word and some number. My population excludes comments by construction — it is
  author-facing *positions* only — so that failure mode does not arise: the census
  returns 64 candidate strings at the base revision, not 158. And a proximity window
  needs an **anchor word** to be proximate to; my predicate has no word list, so there is
  nothing to measure a distance from. The precision job is done instead by the *rank*
  (vendored-value match) and, in the enforceable gate, by the in-scope restriction.
  Measured effect of that restriction: 27 ranked census candidates versus 9 gate rows on
  the same tree.

The **residual noise is real and I am not hiding it**: the census's rank 1 still contains
long MCP tool descriptions whose `3`, `4` or `8` coincide with some schema `minimum`.
Those are exactly the rows that needed a human verdict, and they got one (§3).

---

## 2. The positive control, with its actual output

An empty sweep and a predicate that can never match are the same artifact. The control
runs the three arms the coordinator asked for — including the third, which is the one
that catches an instrument that flags every message carrying a number.

`node scratchpad/numbers-in-prose-sweep.mjs --control`:

```
THREE-ARM SELF TEST (synthetic, independent of tree state)

  PASS  ARM 1 — typed constant, one line
        expected flag, got flag
        folded: "cols * 32 bytes per pattern ROW must be a power of two"
        integers seen: [32]

  PASS  ARM 2 — typed constant SPLIT across two adjacent literals
        expected flag, got flag
        folded: "cols must be constrained so that the pattern row is 32 bytes times cols, an exact power of two"
        integers seen: [32]

  PASS  ARM 3 — the DERIVED form must NOT be flagged
        expected clean, got clean
        folded: "cols * <sub> bytes per pattern ROW must be a power of two"
        integers seen: []

POSITIVE CONTROL against 165a745ec3eaa7fe13eae51d576f583bdb56da44
  swept 510 source files, 64 candidate strings

  FOUND  src/renderer/components/effects/EffectsScenePanel.tsx:267  [jsx title=]  subs=0
         "s1: first shift (15 = term zero / locked)"
         derived-value matches: 15 = TILE_PIXEL_MAX / schema $defs.factor.oneOf.1.properties.s1.maximum / …

  FOUND  src/renderer/components/effects/EffectsScenePanel.tsx:271  [jsx title=]  subs=0
         "s2: second shift (15 = single term)"
         derived-value matches: 15 = TILE_PIXEL_MAX / schema $defs.factor.oneOf.1.properties.s1.maximum / …

  FOUND  src/renderer/components/effects/BgAnimBandPanel.tsx:716  [jsx title=]  subs=0
         "cols: constrained so that cols * 32 bytes per pattern ROW is an exact power of two, because a vertical band rotates a whole row by shifting it"
         derived-value matches: 32 = TILE_BYTES

  FOUND  src/renderer/components/effects/BgAnimBandPanel.tsx:730  [jsx title=]  subs=0
         "rows: constrained so that rows * 32 bytes per column is an exact power of two, because the runtime rotates a column by shifting it"
         derived-value matches: 32 = TILE_BYTES

CONTROL PASSED: 4/4 briefed sites returned by the predicate, 3/3 self-test arms green
(finds a same-line bound, finds a split-literal bound, does NOT flag the derived form).
```

Arm 3's `folded:` line is the proof of masking: the `${TILE_BYTES}` hole became `<sub>`
and `integers seen: []`.

Arm 3 also refuses to pass vacuously — if `collect()` returns nothing at all, "not
flagged" proves nothing about masking, so the arm reports itself as a failure rather
than as green.

---

## 3. The census, with a verdict per site

64 author-facing strings at the base revision carried a standalone integer; 27 of those
(after fixes; 47 before) had an integer equal to some vendored value. Verdicts:

### Derived (26 sentences, 11 files)

| Site | Number | Derived from | Why |
|---|---|---|---|
| `EffectsScenePanel.tsx:267` | 15 | `EFFECTS_PACKED_FACTOR_BOUNDS.s1.max` | **Briefed.** The sentinel is the top of the range, and the spinner *three lines below* already clamps to that bound. Two authors, three lines apart. |
| `EffectsScenePanel.tsx:271` | 15 | `EFFECTS_PACKED_FACTOR_BOUNDS.s2.max` | **Briefed.** Same. |
| `BgAnimBandPanel.tsx` Cols/Rows field + select titles (4) | 32, 8 | `TILE_BYTES`, `TILE_WIDTH_PX` | **Briefed** (2 of 4). Both vendored from aeon's consumer contract. |
| `bg-anim-aeon.ts` `axisOptions()` (4 numbers, 2 arms) | 32, 8 | same | The two functions *above* it go out of their way to evaluate the rule through the codec "rather than restating it one derivation step away" — and then the only part a **person** reads spelled both factors by hand. |
| `effects-aeon.ts` `LAYER_DEFORM_ROW.hint` | 15 | `EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.max` | The three `*Title` siblings in the same object already derive theirs. This one line typed it. |
| `bg-anim-aeon.ts` `phaseFillOptions()` (5) | 7 | `LAST_PHASE_BANK` (new) | `BGANIM_PHASE_BANKS - 1`. |
| `BgAnimBandPanel.tsx` banks field/select/label (3) | 7 | `LAST_PHASE_BANK` | Includes `step & 7`, which equals the last index only because the count is a power of two — now asserted at module load rather than assumed. |
| `BandBankStrip.tsx:87` | 7 | `BGANIM_PHASE_BANKS - 1` | |
| `bg-anim-art.ts` `SHIFT_BUTTON_TITLE`, `BANK_STRIP_HINT` | 7 | `BGANIM_PHASE_BANKS - 1` | The bound this module already enforces 60 lines down. |
| `editor-methods.ts` bganim descriptions + `.describe()`s (8) | 32, 8, 7, 64, 15 | contract constants | Found only after the gate's population was widened to `.describe()`. On the `phases` param the **zod bounds were typed too** (`.max(15).length(64)`), so both halves now read the contract. |
| `classic-surface-plan.ts:240` | 1025 | `MAX_BLOCK_REF + 2` | The guard is `id > MAX_BLOCK_REF` on the line above; the refusal a blocked author reads typed the ordinal. |
| `editor-methods.ts` `check_budget` | 1024 | `FG_TILE_LIMIT` | The description states the number this method's own reply carries as `limit:`. |
| `editor-methods.ts` `add_block` | 1024 | `MAX_BLOCK_REF + 1` | |
| `model.ts` / `BlockTab.tsx` / `ChunkTab.tsx` | 0x3ff | `MAX_BLOCK_REF`, now exported | **Four private copies, none exported**, and two of them *print* the ceiling at a person (`blocks N/1024` in the Paint-mode readout). See §4. |

### Left typed, with the reason (all carried as `EXEMPT` rows in the gate, so the reason travels with the code)

| Site | Number | Verdict |
|---|---|---|
| `effects-preset.ts:1331` | 16 | **Not a real hit.** "ONE 16-bit word" is a **width in bits**, not `CRAM_LINE_ENTRIES` (entries per palette line, also 16). Two quantities sharing a value. The sentence already derives the figure that *is* its bound, `${CRAM_WORD_MAX}` — a correctly-derived message that a careless sweep would have "fixed". |
| `editor-methods.ts` ×2 | 15 | **Not a real hit.** "bits 15:14" is a bit position, not `TILE_PIXEL_MAX`. |
| `editor-methods.ts` | 4096 | **Not a real hit, and an open item.** Matched `BG_LAYOUT_WORDS` by coincidence — and "Max 4096 cells per call" turns out to have **no enforcement anywhere in the module**. A documented cap with zero code-side authors. Interpolating `BG_LAYOUT_WORDS` would invent a coupling and dress a coincidence as a derivation. |
| `editor-methods.ts` `get_tiles` / `write_tiles` | 64, 15 | **Leave, with a reason.** Same hardware fact, **different authority**: these describe the classic (s1disasm) path, and `TILE_PIXELS` is vendored from aeon's *bganim* contract. Reading it here would let an amendment for aeon's BG region silently rewrite a classic-project description. Note the enforcement beside them is itself a typed `.max(15).length(64)`, so deriving only the prose would open a fresh split rather than close one. Closing it properly means giving the classic tile format its own named bound — a change to enforcement, out of this parcel. |
| `editor-methods.ts` ×2 | 255 | **Not a real hit.** A chunk-cell index range (256 cells), not `FLAT_SHAPE`. |
| `editor-methods.ts` | 8 | **Not a real hit.** A maximum zoom factor. Note it only became visible because *my own* import of `BGANIM_PHASE_BANKS` widened this module's scope — the cost of the fix, paid in one exemption row. |
| `atlas-migration.ts` "2048-tile hardware ceiling", `validation.ts` "hardware max 2047" | 2048, 2047 | **Leave.** No named constant for the VDP's tile ceiling exists anywhere in `src`, so there is no arbiter to derive from. Two sites, consistent with each other (count vs max index). Creating the constant is a separate change; recorded as an open item. |
| `BgAnimBandPanel.tsx:524` `(cols*32)` | 32 | **Not a hit.** It is a JSX *comment*. Comments are outside both instruments and say so. |
| test titles containing "1024-block cap" | 1024 | **Not a hit.** Not text a tool shows a person. |

---

## 4. What reading found that no predicate did

Three of the most valuable findings are invisible to **both** instruments, because the
number in prose differs from the constant's value:

1. **`MAX_BLOCK_REF` had four private `0x3ff` copies and none was exported.**
   `ChunkTab.tsx`'s docblock justified its copy: *"Duplicated rather than imported:
   neither source exports it (each treats it as a private implementation constant)."*
   That reason was true, and it rests on **someone else's omission** — so it cannot
   notice when the omission ends. Exporting it from `model.ts` (the validator that
   enforces it) destroyed the justification, and all three copies now point there.
   Two of them render the ceiling on screen.

2. **"banks 1 to 7" said in nine places** beside a contract that carries eight banks.
   Offset by one, so no value match.

3. **"a 1025th block"** beside `0x3ff`. Offset by two.

A fourth: **"banks 1..7"**, whose `7` follows a `.` and is therefore excluded by both
instruments' standalone-integer rule. Found by grep after the family was known.

---

## 5. The one that turned red, and the gate it was hiding in

Reformatting `BgAnimBandPanel.tsx`'s multi-line tooltips into `+`-concatenated chunks
(needed to interpolate) turned `band-vocabulary.test.ts` **red**. The gate was right, and
it had been wrong for longer.

Its literal extractor matched `'((?:[^'\\\n]|\\.)*)'` and the double-quote twin — both
**excluding the newline**. Every long tooltip in these files is a JSX attribute wrapped
across two or three source lines, so **none of them was ever scanned**. Four sentences on
the tile-animation panel said "band" to a person while the gate reported green — which is
EFFECTS-W1 defect 2, the exact confusion that rule exists to end.

This is this parcel's own defect class landing **inside an instrument** rather than inside
a message: a predicate that cannot see the dominant shape of the prose it judges. It is
also the concrete form of the coordinator's warning that a borrowed line-based predicate's
emptiness means nothing.

Measured, not assumed: lifting the newline exclusion over the twelve enumerated
tile-animation sources returns exactly four offenders and nothing else. All four fixed;
`\n` removed from both quote arms. (`\\.` still consumes an escaped quote, so neither arm
can run past its closing quote.)

---

## 6. The enforceable subset: `scripts/check-prose-constants.mjs`

In `npm test`, between `check-guide-text` and `check-scripts-dashes`.

A file is checked only for the constants **it already imports or declares**. A tooltip
saying `32` in a module holding `TILE_BYTES` is a finding; a stray "3" in a module that
never heard of it is not. That restriction is what makes the gate reviewable (9 rows on
the pre-fix tree, against the census's 47) and what keeps it from being the kind of
hostile noise the next lane would rightly disable.

**Stated bound — this is not full coverage:**

- **Offset restatements** (`banks 1 to 7` beside a count of 8; `1025th` beside `0x3ff`;
  `banks 1..7`, whose digit follows a dot). All were found by reading; none would be
  caught here if reintroduced.
- `.md` guide prose (that is `check-guide-text.mjs`), `.mjs` harnesses, shell scripts, JSON.
- Comments — a wrong number there misleads the next author, but this gate is about text a
  tool shows a person.
- Prose assembled through a variable.
- Non-integers, hex in prose, compound tokens (`8x8`, `4bpp`, `16px`).
- **Whether a number is wrong.** It finds re-typing, not staleness.
- Object-valued constants. `EffectsScenePanel`'s `EFFECTS_PACKED_FACTOR_BOUNDS.s1.max` is
  derived at runtime from the schema, so a static resolver cannot get its value: **the two
  briefed sentinel sites are fixed but are not covered by the gate.**

Exemptions are verdicts, not mutes: each names the site, the number and why it is not that
constant, and **a row matching nothing fails the run** (check-guide-text's rule).

---

## 7. Red-first proofs

Every one plants a violation, quotes the mutation from disk, runs red, restores from a
**committed** baseline, and re-runs green.

**P1 — the gate catches a re-typed constant.** Reverted `rows*${TILE_BYTES}` to `rows*32`
in `BgAnimBandPanel.tsx`:

```
-            ? `Rows must make rows*${TILE_BYTES} a power of two, because the runtime shifts a whole column`
+            ? 'Rows must make rows*32 a power of two, because the runtime shifts a whole column'

src/renderer/components/effects/BgAnimBandPanel.tsx:732  [title=]
  "Rows must make rows*32 a power of two, … ‖ … (pattern_px = rows* )"
  types 32, which this module already has as TILE_BYTES.
check-prose-constants FAILED: 1 re-typed constant(s) in author-facing prose.   EXIT=1
```

Note the folded text: the *other* arm of the same ternary shows as `rows* ` — its
`${TILE_WIDTH_PX}` masked, unflagged. Arm 3's behaviour in the wild, in one string.
Restored → `0 re-typed`, EXIT=0.

**P2 — the gate refuses a stale exemption.** Added a row whose regex matches nothing:

```
STALE EXEMPTION: src/main/editor-methods.ts 32 /THIS SENTENCE DOES NOT EXIST ANYWHERE/ matches nothing.
check-prose-constants FAILED: 0 re-typed constant(s), 1 stale exemption(s).   EXIT=1
```

Restored → EXIT=0.

**P3 — the widened vocabulary extractor is load-bearing, with a control arm.** Planted a
**multi-line** JSX title containing "band" in `BgAnimBandPanel.tsx`:

| extractor | same plant on disk | result |
|---|---|---|
| **new** (`\n` allowed) | yes | `Tests 1 failed | 4 passed` — caught |
| **old** (`\n` excluded) | yes | `Tests 5 passed` — **green on a live violation** |

Both restored; row green.

**P4 — the census's three arms**, §2 above.

---

## 8. What I did NOT establish

- **Nothing was confirmed at runtime.** No emulator, no CDP. Every tooltip here is
  asserted from source; that a person sees the derived text on screen is unverified.
  The instrument that reads rendered text is `scratchpad/o55-new-band-door-probe.mjs`.
  **Tagged for foreground follow-up.**
- **Whether any of the 26 numbers was already *wrong*.** Every one happened to equal its
  constant today. The parcel closes the mechanism, not a known incorrect figure — unlike
  aeon's, which fixed a live wrong number.
- **The gate cannot prove a currently-correct re-typing is caught.** P1 shows it catches a
  typed literal; it does so by value equality, which is exactly the case that matters, but
  the row tests elsewhere in the suite that assert on these strings would still pass if the
  number were re-typed *and* still right.
- **Coverage of `.md`, `.mjs`, `.sh` and JSON is zero** in both instruments.
- **The 2048-tile hardware ceiling** is stated twice with no constant anywhere. Not fixed.
- **"Max 4096 cells per call" is enforced by nothing.** Found, recorded, not fixed:
  adding enforcement changes behaviour.
- **The classic tile format's `64` / `0-15` still has two authors** (prose and a typed zod
  bound), left because closing it means adding a named bound to the classic path.
- I did not re-run the census against every historical revision; the control uses the
  parcel's base commit only.
