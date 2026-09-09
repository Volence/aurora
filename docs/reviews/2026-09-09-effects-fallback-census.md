# The `??` census of `src/core/formats/effects/`

**Parcel** `parcel/effects-fallback-census` · **base** `c101b764` · 2026-09-09

`GUARD-SEAT-RESIDUE` carried *"the `??` sites across the effects tree remain
unenumerated"* through five parcels. Nothing forced it: no file owned it and no
parcel closed it. This is the enumeration.

**The headline.** 27 `??`/`??=` operators. **One** meets the definition of
CONFLATING (`preset.ts:979`), and its consequence is loud on a guard this parcel
**measured** rather than read. **Zero** sites need a code fix. The one repair
made is to a **docblock** that justified a fallback by naming a registry deleted
in the same commit that deleted it.

That is a weaker-sounding result than "N findings", and it is the honest one.
The effects tree already carries absence on a **separate channel** from value —
a `parsed` flag, a `null` return, a module-load `throw` — which is precisely the
fix the defect family calls for. What it did *not* carry was proof.

---

## 1. Counting method, and the unit

A previous parcel inherited a count of "32" and found 63, because the first
counted guards and the second counted predicates. So the unit is stated three
ways and each number is produced by a program, not by eye.

**The population was defined by READING, not by searching.** Every `.ts` file
directly under `src/core/formats/effects/` was parsed with the TypeScript
compiler (`ts.createSourceFile`, full AST walk) and every `BinaryExpression`
whose `operatorToken.kind` is `QuestionQuestionToken` or
`QuestionQuestionEqualsToken` was recorded with file, line, column, LHS and RHS.
A parser reads the whole file; a `grep` reads the lines it is willing to.

| Unit | Count | What it counts |
|---|---:|---|
| **Operators** (the primitive) | **27** | 25 `??` + 2 `??=`, one per AST node |
| **Expressions** | 26 | `section-wiring.ts:832` carries two operators in one expression |
| **Sites with distinct semantics** | 14 | after grouping repeats of one idea (below) |

The 13-operator gap between the first and third columns is entirely repetition
of six ideas: six `description ?? ''` schema-prose reads in `preset.ts`, two rung
lookups, two `newEffectsLayer` factor copies, two last-record-to-EOF bounds, two
accumulator initialisers, three `threadedHere` emptiness reads, three missing
`docId` reads.

### The search hazard, measured here

The brief warned that `grep -r` may silently skip gitignored paths. It does, in
this shell, and worse than described:

```
$ git check-ignore -v node_modules/.canary/canary.ts
.gitignore:1:node_modules/   node_modules/.canary/canary.ts
$ grep -rl CANARYTOKEN_ZZQ .          # (shell function)
                                       <- nothing, exit 0
$ command grep -rl CANARYTOKEN_ZZQ .
./node_modules/.canary/canary.ts
```

`grep` here is a shell function wrapping `ugrep --ignore-files`, which honours
`.gitignore`. **Positive control**: the same shell `grep` *does* find a tracked
file, so the function is live and the zero is specific to ignored paths. Every
search in this parcel used `command grep`, and none of them defined a population.

### A second instrument that was not looking

While checking this parcel's own test file against `check:test-dashes`, the gate
reported **OK** with two U+2014 characters sitting in strings the file shows a
person. It was not a classifier hole:

```
scripts/check-test-dashes.mjs:228   const allTracked = git('ls-files');
```

The gates enumerate **tracked** files. An untracked new file is invisible and
the gate reports OK on a population that does not include it. Measured with a
deliberate plain-string probe: untracked, `OK ... 605 file(s) ... 583
test-shaped`; after `git add`, the same tree reported `1 dash(es) ... across 1
file(s) of 606` and named the line.

**The rule that falls out: `git add` before believing a check script.** The
counts (605/583 vs 606/584) are the tell — if adding a file does not move them,
the gate did not see it. This cost nothing here only because the numbers were
compared.

---

## 2. The census

Verdict vocabulary is the brief's. "Group" marks operators that share one idea.

### `factor-decode.ts` — 1 operator

| Site | Op | Classification | What a caller would do wrongly | Verdict |
|---|---|---|---|---|
| `:123` `EFFECTS_FACTOR_PACKED[f] ?? null` | `??` | **LOAD-BEARING** | — | keep |

Documented at `factor-decode.ts:117-121`: null "for a name this table does not
know ... returned rather than thrown because the caller is a DRAW PASS: a
viewport that stops painting is worse than a band that does not move." The
contract is asserted, not assumed, at
`test/formats/effects-factor-decode.test.ts:142-145` ("an unknown name is treated
as locked, not as a crash").

**The one thing worth naming**, because it is real and is *not* a defect: all
four consumers map `null` onto the locked answer — `decodeFactorScroll` → 0,
`factorIsLocked` → true, `factorRatio` → 0/1, and `factorRatioLabel` → the string
`'locked'`, which reaches an author's screen. An unknown factor is therefore
indistinguishable from a locked one *in the UI*. It is contained because the
population that could reach it is closed by the COVERAGE row
(`test/formats/effects-factor-decode.test.ts:41-47`), which drives off
`EFFECTS_FACTOR_NAMES` read out of the vendored schema — so a contract that gains
a factor goes red there instead of shipping a dead band. See the parked question
in §5.

### `json-schema-subset.ts` — 2 operators

| Site | Op | Classification | What a caller would do wrongly | Verdict |
|---|---|---|---|---|
| `:433` `schema.properties ?? {}` | `??` | **BENIGN** — means the same | — | keep |
| `:576` `root ?? schema` | `??` | **BENIGN** — unreachable below the root | — | keep |

`:433` — a present `properties: {}` and an absent `properties` are the same
statement: no declared properties. Both make `unevaluatedProperties: false`
report every key unknown, and both leave the `required` loop unaffected.

`:576` — verified by enumerating every recursive call rather than assuming:
`canonicalizeBySchema` recurses at `:580`, `:638`, `:641`, `:645`, `:653` and
**all five pass `rootSchema` explicitly**. The fallback can only fire at the
top-level entry, where `schema` genuinely is the root. (A missed `root` argument
would be a real `$ref`-resolution bug — it is the hazard this line *looks* like
it carries, and it is not present.)

### `preset.ts` — 10 operators

| Site | Op | Group | Classification | Verdict |
|---|---|---|---|---|
| `:679` `(node.required …) ?? []` | `??` | — | **BENIGN** — means the same | keep |
| `:706` `…description ?? ''` | `??` | prose-read | **BENIGN** — funnels into a loud throw | keep |
| `:757` `…description ?? ''` | `??` | prose-read | **BENIGN** — loud throw | keep |
| `:979` `node.description ?? ''` | `??` | — | **CONFLATING (contained)** | keep + test |
| `:1348` `…description ?? ''` | `??` | prose-read | **BENIGN** — loud throw | keep |
| `:1388` `.find(…) ?? null` | `??` | rung | **LOAD-BEARING** | keep |
| `:1393` `.find(…) ?? null` | `??` | rung | **LOAD-BEARING** | keep |
| `:1621` `…description ?? ''` | `??` | prose-read | **BENIGN** — loud throw | keep |
| `:1720` `…description ?? ''` | `??` | prose-read | **BENIGN** — loud throw | keep |
| `:1925` `…description ?? ''` | `??` | prose-read | **BENIGN** — loud throw | keep |

`:679` — a present `required: []` means what an absent `required` means.

**The prose-read group (5 operators).** Each reads a number or a name out of the
vendored schema's `description` prose, and each is immediately followed by
`if (!m) throw new Error(...)` naming the path and the shape it expected. The
fallback `''` cannot match any of the regexes, so absence becomes a **loud
refusal at module load** within two lines. This is the opposite of the defect
family, and it is the tree's own idiom.

`:1388`/`:1393` — `Array.prototype.find` returns `undefined`; `?? null`
normalises it. Documented at `preset.ts:1378-1385`: "NULL RATHER THAN THE NEAREST
RUNG, deliberately ... a caller that means to snap must say so by calling
`anchorSnapPeakPx`."

#### `:979` — the one CONFLATING site

```ts
return /lowers into EffectsPreset\.ep_patched/.test(String(node.description ?? ''));
```

Absence (`description` missing from a program arm's property node) yields
`false`, which is **exactly** what a present description that does not claim
`ep_patched` yields. A caller cannot tell which happened. It meets the
definition.

**What a caller would do wrongly.** The arm drops out of
`EFFECTS_PRESET_PATCHED_ARMS` and into its complement
`EFFECTS_PRESET_RASTER_CHANNELS`. Those two lists answer two different questions
(`preset.ts:903-906`): "may these two keys coexist?" and "does this key write
`ep_raster`?". A patched arm counted as a raster channel is a document offered
the wrong editor and exempted from the exclusivity rule that exists because
`preset()` refuses a record carrying both, "whichever installs last wins
destructively" (aeon `preset.emp:153-154`).

**Why it is contained, and how that was established.** Not by reading the
docblock — the docblock was wrong about the mechanism (§3). By planting the
absence and measuring: `test/formats/effects-fallback-census.test.ts` deletes the
`description` key and asserts the provider refuses to load.

⚠ **The existing poison row does not cover this input.**
`test/formats/effects-preset-boundary.test.ts:242-292` *rewrites* the sentence to
`'lowers into somewhere else entirely'`, so `description` remains a string and
the `?? ''` never fires. The two mutations travel the same downstream path, but
only the new one exercises the operator being censused. A census that had cited
the existing row would have been citing a test of a different input.

### `scene-ui.ts` — 3 operators

| Site | Op | Classification | Verdict |
|---|---|---|---|
| `:1150` `copyFactorsFrom?.fa ?? 'FACTOR_1'` | `??` | **LOAD-BEARING** | keep |
| `:1151` `copyFactorsFrom?.fb ?? 'FACTOR_1'` | `??` | **LOAD-BEARING** | keep |
| `:1464` `parts.mechanism ?? ''` | `??` | **BENIGN** — caller cannot act differently | keep |

`:1150`/`:1151` — documented directly above at `scene-ui.ts:1137-1142`: a new
layer copies the layer above "because a new band that scrolls identically to its
neighbour is a visible no-op an author then TUNES."

`:1464` — the invariant that makes this safe is written down twice, at
`scene-ui.ts:1350` and `:1716`: "`mechanism` is ABSENT rather than empty when the
diagnosis already carries the why." So `''` is never a *present* value, and the
result is `.trim()`ed — the caller is string concatenation and cannot act
differently on "empty" versus "absent".

### `section-wiring.ts` — 11 operators

| Site | Op | Group | Classification | Verdict |
|---|---|---|---|---|
| `:154` `chunks[i+1] ?? ''` | `??` | — | **BENIGN** — unreachable | keep |
| `:180` `marks[i+1]?.at ?? lib.length` | `??` | EOF-bound | **BENIGN** — means the right thing | keep |
| `:747` `marks[i+1]?.at ?? lib.length` | `??` | EOF-bound | **BENIGN** | keep |
| `:753` `out[…] ??= {}` | `??=` | accumulator | **BENIGN** — the fallback IS the initial state | keep |
| `:754` `perPreset[sec] ??= []` | `??=` | accumulator | **BENIGN** | keep |
| `:831` `channelThreadedBy[ch.channel] ?? {}` | `??` | threadedHere | **BENIGN** — absence intercepted upstream | keep |
| `:832` `perPreset[owner] ?? {}` | `??` | threadedHere | **BENIGN** | keep |
| `:832` `(…)[sectionIndex] ?? []` | `??` | threadedHere | **BENIGN** | keep |
| `:868` `docId ?? null` | `??` | docId | **BENIGN** — normalisation | keep |
| `:872` `name ?? 'the bound preset'` | `??` | docId | **BENIGN** | keep |
| `:917` `docId ?? 'The bound preset'` | `??` | docId | **BENIGN** | keep |

`:154` — `String.prototype.split` with a **one-capture-group** regex yields
`2n+1` elements for `n` matches. The loop runs `i = 1, 3, … 2n-1`, so the maximum
`i+1` is `2n`, always in range. Unreachable. (And were it reachable, `''` means
"no `effects:` in this chunk", which is the genuine no-binding state.)

`:180`/`:747` — the last record's body runs to end of file. No *present*
`marks[i+1].at` can equal `lib.length`, because a match index is strictly less
than the length, so the fallback is distinguishable in principle and correct in
fact.

**`:831`/`:832` — the group most likely to have been a finding, and the reason it
is not.** This is `threadedHere`, which answers "which indices thread this
chooser here?" with `[]`. `[]` is the value for *both* "the library was not read"
and "the library was read and nothing threads it" — the shape the brief's
`boundSocketPaths()` example takes. It is not a conflation here because **the
absence is carried on a different channel and intercepted before these operators
run**:

- `sectionExtraChannelsCondition` returns `{verdict: 'unknown'}` at
  `section-wiring.ts:835-840` if `!w.library.parsed`, and **every call to
  `threadedHere` is after that guard** (`:843` and the owed-channels loop).
- `unknownWiring()` (`:120-129`) sets `channelThreadedBy: {}` *and*
  `library.parsed: false` together, so it can never present an empty map as an
  answer.
- The producer states the rule explicitly at
  `src/core/project/aeon/load.ts:711-715`: "⚠ AN EMPTY CALL MAP IS A REAL ANSWER
  HERE, unlike an empty binding map ... only a file that could not be READ is
  unknown. The two are different facts and the parse flag says which."

That is the brief's prescribed fix already implemented — absence as its own
value, on its own field. The residual fragility is that `threadedHere` is a
closure whose safety depends on **call ordering** rather than on its own type: a
future edit that calls it above the `parsed` guard reintroduces the conflation
silently. Noted, not fixed; converting it would be a design change to a module
that is currently correct.

`:868` — `docId?: string | null`, so `undefined` (not supplied) and `null`
(explicitly none) both mean "no name to print". `:872`/`:917` — a present
`docId` is an `.emp` identifier (`[A-Za-z_][A-Za-z0-9_]*`) and cannot contain
spaces, so it can never collide with the literal `'the bound preset'`.

---

## 3. What was fixed

**One repair, and it is prose.** `preset.ts`'s `EFFECTS_PRESET_PATCHED_ARMS`
docblock justified the `?? ''` at `:979` like this:

> the renderer's per-channel registries — `RASTER_CHANNEL_NOUNS`,
> `PROGRAM_ARM_LABELS` — have module-load guards that throw on a channel with no
> entry.

That mechanism does not exist. Measured, not inferred:

```
$ git grep -c RASTER_CHANNEL_NOUNS 46bfbb58^ -- src
46bfbb58^:src/renderer/providers/effects-preset.ts:10
$ git grep -c RASTER_CHANNEL_NOUNS 46bfbb58 -- src
46bfbb58:src/core/formats/effects/preset.ts:1
```

`46bfbb58` re-keyed those registries **by arm** rather than by the raster list —
which is what lets the fourth arm be authored at all — taking
`RASTER_CHANNEL_NOUNS` from 10 occurrences to zero. The single surviving mention
in the entire tree is this docblock. The reference has been dangling since that
commit, and the provider's own docblock
(`src/renderer/providers/effects-preset.ts:5708-5717`) records the change:
"removed that consequence: the poisoned classification now loads perfectly."

The **conclusion** still holds — the failure is loud — but through a different
surface: `PROGRAM_ARM_OPTIONS` compares the hand-written dropdown label against
the derived classification in **both directions** at module load
(`effects-preset.ts:5739-5752`).

This is worth a commit precisely because it cannot be caught by testing: a
correct rule with a stale reason passes every test of the rule. The next reader
to refactor `PROGRAM_ARM_OPTIONS` would have consulted `preset.ts`, been told
the registries protect them, and deleted the only thing that does.

**What was NOT changed:** no behaviour, anywhere. No fallback was altered. The
census found no site where changing the code is the right answer.

---

## 4. The test, and the bars

`test/formats/effects-fallback-census.test.ts` — 2 rows, collected by **vitest**
via the repo's `npm test` chain (confirmed present in the collection:
`check-test-collection: 584 test-shaped file(s) on disk, all 584 collected`).

- **ABSENT** — deletes the `description` key, asserts the patched set collapses
  *and* that importing the provider rejects with `/PROGRAM_ARM_LABELS/`.
- **PRESENT** — the real vendored schema still classifies the arm as patched and
  the provider still loads.

Both directions, as required: a rule that only ever fires one way has not been
shown to be a rule.

**Expectations derive from source.** The arm is never typed as `'boundary'`; it
is derived from the schema by the same sentence `preset.ts` uses, and
`patchedArmFromSchema` **throws** if the tree stops carrying exactly one such arm
— loud when it cannot measure, rather than vacuously green.

### Red-first, from a committed baseline

Baseline committed at `044ef61b` before either mutation. Each mutation was
placed on disk, shown with `git diff`, run, then restored with `git checkout --`.

| Mutation (on disk) | Row killed | Row still green | Failure class |
|---|---|---|---|
| `effects-preset.ts:5739` `if (saysPatched !== isPatched)` → `if (false && saysPatched !== isPatched)` | ABSENT | PRESENT | **AssertionError** |
| `preset.ts:979` regex → `ep_patchedZZZ` | PRESENT | ABSENT | **AssertionError** |

Each mutation killed exactly one row and left the other green, so the two rows
are independent rather than two spellings of one assertion.

⚠ **Scored on the failure class, not the count.** Both kills are
`AssertionError` per the repo's `failure-class` reporter — neither is a timeout
being miscounted as a catch.

### Suite

Scored on **vitest's own `Test Files` line**, not the aggregate exit code.

| | `Test Files` | `Tests` |
|---|---|---|
| **BASE** (`c101b764`) | 580 passed \| 3 skipped (583) | 8712 passed \| 9 skipped (8721) |
| **TIP** | 581 passed \| 3 skipped (584) | 8714 passed \| 9 skipped (8723) |

The delta is **+1 file and +2 tests** — this parcel's two rows and nothing else.
`failure-class: no failures in this run (584 module(s) reported)` at tip.

⚠ This worktree shows **no phantom failures at base** — the second-React-instance
77 that some worktrees carry is not present here, so the tip figure is a clean
comparison rather than a difference of two noisy numbers. Both ends were run,
because that is the only way to know which.

---

## 5. Parked question — a design choice, not picked

**`factorRatioLabel` prints `'locked'` for a factor name the table does not
know.** This is the only census-adjacent conflation that reaches an author's
screen as text. It is currently correct-by-contract, and changing it is a design
choice, so it is parked rather than decided.

- **Option A — leave it.** The behaviour is documented
  (`factor-decode.ts:117-121`) and asserted
  (`test/formats/effects-factor-decode.test.ts:142-145`), and the population that
  could reach it is closed by the COVERAGE row driven off the vendored schema.
  Cost: an author who somehow sees it reads "locked" for "Aurora does not know
  this name".
- **Option B — split the label surface only.** Give `factorRatioLabel` a distinct
  string (e.g. `'unknown'`) for the unresolvable case, leaving
  `decodeFactorScroll` and `factorIsLocked` on the tested draw-pass contract.
  Cost: one more string a caller must handle; the draw pass is untouched.
- **Option C — a `resolveFactorOrThrow` for non-draw callers.** Correct for
  label/report paths, wrong for the draw pass, so it means classifying every
  caller.

**Recommendation: A**, with the reasoning recorded here rather than rediscovered.
The label is a *display* of the decode, and a label that disagreed with what the
canvas draws would be a second, worse conflation. **Revisit if and only if** a
factor name can reach `factorRatioLabel` from outside the schema-validated path —
at which point B, not C, is the smaller change.

---

## 6. Scope

⚠ **`boundary.ts` and `scene.ts` are out of scope, and are NOT deferred debt.**
Measured with the same AST instrument: they contain **zero** `??` and `??=`
operators between them. The exclusion costs nothing — there is no residue behind
it and nobody should inherit one.

The `__tests__/` subdirectory is likewise not in the population: a fallback in a
test has no caller who could act on it wrongly.

**Named non-population:** `||` and `?.` fallbacks were not censused. `??` was the
row's subject. If a follow-up wants them, `||` is the larger and more dangerous
set (it swallows `0` and `''` as well as absence) and deserves its own parcel
rather than being quietly folded into this one's numbers.

---

## 7. Provenance

- Census instrument: TypeScript compiler AST walk over every `.ts` directly under
  `src/core/formats/effects/`; operators identified by `operatorToken.kind`.
- All searches used `command grep`; none defined a population.
- Commits: `044ef61b` (test baseline), `400d46cb` (docblock repair).
