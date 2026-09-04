# EW-REVENDOR-BOUNDARY — the ramp display lag was two numbers wearing one name

**Branch** `parcel/ew-revendor-boundary`, from master `c66e9b12`.
**Row** ROADMAP §5.1 row 136. **Closes** `RAMP-BOUNDARY-CONTESTED`.

Everything below was measured in this worktree unless it says RELAYED.

> ⚠ **SUPERSEDED IN ONE RESPECT, 2026-09-04 — read this before quoting a number
> from this packet.** Every measurement here still stands. What has changed is
> **whose numbers they are.** empyrean `d5e0e7a` and `bfc000e` (re-vendored in
> `parcel/lag-attribution-false`, packet
> `docs/reviews/2026-09-04-lag-attribution-false.md`) state that the ramp display
> lines are **as read on oracle's Rust core**; oracle's legacy C++ core reads
> **both** raster tiers one line earlier on the same ROM bytes and is
> disqualified as a referee because it disagrees with **itself** by 79–83 of 224
> rows between two identical boots, not because it is known wrong; the landing
> line is **UNPINNED** in the Rust core's own recon; and **no hardware referee
> exists on this project.** So where this packet says the question "SETTLED in
> the measurement's favour", read: **the two readers agree** — Aurora's
> derivation and aeon's measurement — **not that hardware has answered.**
> `top + 2` is the instrument's reading today, not a ratified hardware fact. The
> derived constants and their values are unchanged.

---

## 1. The contract, hashed rather than believed

Both files read at a committed revision
(`git -C ../empyrean show origin/main:<path>` / `e9409dc:<path>`, never by path)
and re-hashed with `git hash-object`:

| file | at `e9409dc` | at `origin/main` (`b4ab03e`) | vendored here, before |
|---|---|---|---|
| `contract/schema/aurora-effects-preset.schema.json` | `dce3a9b42c0da1ecf2a6ee70463e82930e222599` | `dce3a9b4…` (same) | `34a83d88d2f85beb2672a792dbea62114763022e` |
| `contract/schema/tests/effects-preset-vectors.json` | `af5b5ceeb857945789033980bbd6ff764bde58cf` | `af5b5cee…` (same) | `af5b5cee…` (**identical**) |

**The vectors really were unchanged.** The claim was worth checking — both files
moved at both previous CRs tonight — and it holds: the blob already vendored in
this repo is byte-identical to the blob at `e9409dc`, so there was nothing to
re-vendor on that side. The schema blob after re-vendoring hashes
`dce3a9b42c0da1ecf2a6ee70463e82930e222599`, verified again after every red-first
restore.

## 2. Description-only, confirmed here and not relayed

Two independent checks on the parsed documents:

- **Stripped comparison.** Both schemas parsed, every `description` key removed
  at every depth, keys sorted, re-serialised: **byte-identical, 3935 characters
  each.**
- **Leaf diff.** A full walk of both documents to scalar leaves finds **exactly
  two changed leaves**, both `description`:
  - `/properties/ramp/description`
  - `/$defs/ramp/properties/top/description`

So this is a re-vendor, not a migration. `git diff --stat` on the vendored file
is `2 insertions, 2 deletions`.

## 3. ⚠ It was not a no-code-change, and the reason is the interesting part

`EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG` parsed `/DISPLAYS on top \+ (\d+)/` and
yielded 1. At the re-vendored sentence it yields **2** — and the constant had
**two consumers using it as two different quantities**:

| use | what it needed | at lag 2 |
|---|---|---|
| `rampDisplaySpan` — `first = top + lag`, `last = top + lines - 1 + lag` | a **first-line offset** | **correct at both ends** |
| `RAMP_DISPLAY_LAG_NOTE` — `"value for index j DISPLAYS on screen line top + j + ${LAG}"` | a **per-index lag** | **false**, and **painted** as the readout's own `title` |

They agreed only because both contract sentences said `1`. The re-vendor as
described would have shipped a false sentence to an author on the surface of the
card.

### The split

Two constants, each parsed from **its own** schema sentence, neither number typed:

```
EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG           = 1
  from properties.ramp:
  "value j (= start + j*step) displays on screen line top + j + 1"

EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET   = 2
  from $defs.ramp.properties.top:
  "the first written value DISPLAYS on top + 2 for a VSRAM target"
```

**Guards on each:** the existing `schemaNumberFromProse` loud-refusal (the regex
is printed in the message and it names the node), plus a per-constant check that
the parse is a whole number `>= 1` — "a lag of 0 is indistinguishable from *no
lag* in every rendered output".

**And a third guard, the interlock:** the offset must equal `lag + 1`, because
**`j` starts at 1** — the interpreter adds `step` before it writes, so `start` is
never emitted and the first written value is index 1. Substituting `j = 1` into
the per-index rule *derives* the `top` sentence. If the two sentences ever
disagree the module refuses at load naming both numbers, rather than picking one.
That is the comment the parcel asked for, and it is enforced rather than written
down.

The old ambiguous name is **removed, not repointed**, so every stale caller fails
to compile. `tsc` found all three (`test/formats/effects-preset-ramp.test.ts`,
`src/renderer/providers/__tests__/effects-preset-ramp-control.test.ts`,
`src/renderer/components/effects/__tests__/ramp-control-wording.test.ts`) and
none was missed.

### ⚠ A finding the guard produced on its first real outing

**The two sentences live in two different schema nodes.** `$defs.ramp` carries
the shape rules (fields, the `top + lines <= 223` interlock, the per-field
sentences); the **key** paragraph `properties.ramp` carries the per-index and
CRAM sentences. My first derivation read `$defs.ramp` for both and **threw at
module load with the regex and the node printed** — the exact failure the loud
parse exists for, catching a wrong-node read that a silent `?? 1` would have
turned into a plausible number. `RAMP_KEY` now names the second path with the
distinction written beside it, and the codec suite asserts both sentences from
their own nodes with regexes written in the test rather than imported.

### The corrected note text

`RAMP_DISPLAY_LAG_NOTE` now states **both** quantities, each from its own
constant, and says why they differ:

> A VSRAM run's value for index j DISPLAYS on screen line top + j + **1** — the
> N+1 VSRAM latency (raster.emp:602-609). AND **j STARTS AT 1**: the interpreter
> adds the step before it writes, so `start` itself is never emitted and the
> FIRST value an author sees lands on top + **2**, not top + 1. A run of `lines`
> values therefore occupies screen lines top + **2** .. top + lines + **1**, so a
> run at the very bottom (top + lines = 223) puts its last value on line **224**,
> where it can never be seen. NO STAGE OF THE ENGINE PATH compensates for any of
> it — not the constructor, not the generator (measured by the engine lane,
> 2026-09-03). The Top field above is the ENGINE's top and is written to the file
> verbatim; the lag is a DISPLAY fact, so it is applied to this readout and to
> nothing else. Correcting it in the document instead would change what the
> engine runs in order to fix what an editor shows.

Every number in it is interpolated from a derived constant — `223` is
`EFFECTS_PRESET_RAMP_SPAN_MAX`, `224` is `SPAN_MAX + OFFSET - 1`.

## 4. CRAM — recorded, pinned, and deliberately not built

The contract now states a CRAM rule (value `j` on `top + j`, **one line
earlier**), but `$defs.ramp_target` has `properties: {vsram}`, `required:
[vsram]`, `unevaluatedProperties: false`. **There is no CRAM arm, so a CRAM ramp
cannot be authored here at all.** No CRAM path was built.

The fact is recorded in the docblock where the constants live, and — because a
comment is the thing this lane keeps having to remove — it is also **pinned by a
derived constant**, `EFFECTS_PRESET_RAMP_TARGET_ARMS`, whose guard throws at
module load if an arm is ever added, naming the one-line difference. A codec row
also asserts the CRAM sentence is present, that the arm list is `['vsram']`, that
`required`/`unevaluatedProperties` say what the paragraph claims, and that a
document carrying `target: {cram: …}` is **refused**, not merely unhandled.

## 5. Sparse vs dense — the check, and the answer

> ⚠ **THE RELAYED CLAIM BELOW WAS WITHDRAWN AT empyrean `d5e0e7a` (2026-09-03)
> AND IS STRUCK, NOT DELETED.** aeon's own two-core test refuted its own finding:
> **BOTH raster tiers shift by one line between oracle's Rust core and oracle's
> legacy C++ core on the same ROM bytes**, so what moved on 2026-08-19 was the
> reading instrument, not the engine. Do not cite it. The MEASURED paragraph that
> follows the strike is unaffected — it is a statement about Aurora's own source,
> and its answer ("no finding") is the same either way. See
> `docs/reviews/2026-09-04-lag-attribution-false.md`.

~~RELAYED (empyrean `e9409dc`'s message): the engine moved `fire+1 → fire+2` on
2026-08-19 (aeon `c44c80ad..727715f4`) and the **sparse tier is still `fire+1`**;
the two tiers agreed then and disagree now.~~

MEASURED HERE: **nothing in Aurora models sparse and dense as sharing a landing
rule.** Swept `effects-aeon.ts`, `effects-preset.ts` and
`core/formats/effects/` for latency / `N+1` / display-line language: the **only**
display-line model in the repo is the ramp's, and it is dense-only. There is no
`bandDisplaySpan`, no fire display-line gloss, and no shared lag constant.

What sparse and dense *do* share is the `fire()` **authoring** bound —
`EFFECTS_FIRE_LINE_MIN/MAX` = 3..223 for a fire, ramp `top` 3..222 — imported
rather than retyped, and cited as the same bound at
`renderer/providers/effects-preset.ts` §"THE FIRE BOUND". That is a **refusal**
bound, not a landing rule, and the tier divergence does not touch it. **No
finding; nothing needed changing.**

## 6. Stale contested-notes found and corrected

`RAMP-BOUNDARY-CONTESTED` closes: **the measurement won and the contract sentence
was the wrong one** — which is the argument for deriving rather than typing, and
it is written into each correction rather than just deleted. Ten sites, in six
files, two of them landed hours ago:

| file | what was stale |
|---|---|
| `src/core/formats/effects/preset-lag.ts` | the "⚠ AND THE SPAN IS CONTESTED BY EXACTLY ONE LINE" block — rewritten as settled, with the resolution, the two new constants, and the bottom-edge consequence; the rest of the caveat (peer's unmerged branch, emulation not silicon) is explicitly **not** retired |
| `src/renderer/components/effects/BandPresetPanel.tsx` | the lag-disclosure mount comment ("we derive `top + 1`, they measured `top + 2`") |
| `src/renderer/components/effects/BandPresetPanel.tsx` | the scroll-mode mount comment ("the card's display-span readout is CONTESTED … we derive 4..223") |
| `src/core/formats/effects/ramp-scroll-mode.ts` | the docblock's contested paragraph — kept, because its **structural** claim (nothing here reads a line number) is now *demonstrated*: the number moved and no sentence in that file moved with it |
| `src/core/formats/effects/ramp-scroll-mode.ts` | ⚠ a **PAINTED** sentence — `RAMP_SCROLL_MODE_NOTE` ended "…which is contested", shipped to authors on the element's own `title` |
| `src/renderer/providers/__tests__/effects-preset-ramp-scroll-mode.test.ts` | header |
| `src/renderer/components/effects/__tests__/ramp-control-wording.test.ts` | the row docblock "INDEPENDENT OF THE CONTESTED READOUT" |
| `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts` | header |
| `scratchpad/ramp-scroll-mode-harness.mjs` | run header |
| `src/renderer/providers/effects-preset.ts` | see below |

### The one that argued the wrong way round

`rampDisplaySpan`'s docblock carried a paragraph titled "A CORROBORATION WORTH
KNOWING": *"the two constants meet exactly at the bottom of the display … a lag
of 0 would leave a line spare and **a lag of 2 would run off the screen**"* —
offered as evidence that the lag was 1. It was reasoning from a first-line offset
of 1, which is the premise that turned out to be wrong. **It is inverted, not
deleted**, so the old argument cannot come back as a "fix": the run really does
go one line over — a maximal run's last value lands on **224**, and a 220-line
run from `top` 3 **renders 219 lines**. The matching test row
(`a maximal run's last DISPLAYED line lands ONE PAST the span bound`) is inverted
with it and now also asserts the visible-line count.

### The harness that would have sat stale

`scratchpad/ramp-control-harness.mjs`'s `[ds-b]` asserted `delta === 1` at both
ends of the readout — **a typed number in a `.mjs`, which cannot import the
TypeScript constant**, so the compile-error sweep that caught the three test
files could never have reached it. It now **parses the same two schema sentences
itself**, with its own regexes, its own missing-sentence refusal and the same
`offset === lag + 1` interlock, and prints both in the row's evidence line. That
makes the harness a second independent reading of the contract rather than a
restatement. Its witness-mode comment ("it displays on 4..223") and its printed
display span were corrected the same way.

## 7. Gates — red-first, on disk, restored from a committed baseline

Every mutation was applied to the working tree, shown by `grep`, run, and then
restored with `git checkout HEAD -- <path>` from the **committed** baseline
`67db577e` (tree verified clean by `git status --short`, and the schema
re-verified at `dce3a9b4…` after restore).

| # | mutation on disk | shown | result |
|---|---|---|---|
| 1 | `rampDisplaySpan` uses `INDEX_LAG` instead of `FIRST_LINE_OFFSET` — i.e. the pre-split bug | `grep -n "MUTATION: the pre-split bug"` | **3 rows red** across the codec and control suites |
| 2 | `RAMP_DISPLAY_LAG_NOTE` interpolates `FIRST_LINE_OFFSET` into the `top + j + N` position | `grep -n "MUTATION: one number for both"` | **1 row red** (`the painted readout shows BOTH spans`) |
| 3 | the vendored schema's `top` sentence set back to `top + 1` | `grep -o "DISPLAYS on top + [0-9]"` → `1` | **module-load refusal**, naming both numbers and refusing to reconcile them |
| 4 | a `cram` arm added to `$defs.ramp_target` | arms printed as `['vsram', 'cram']` | **module-load refusal**, naming the one-line CRAM difference |

**`dist/` grep, for the painted string.** `RAMP_DISPLAY_LAG_NOTE` is rendered, so
mutation 2 was also built (`npm run build`) and the bundle grepped:
`dist/renderer/assets/index-*.js` carried
`…index j DISPLAYS on screen line top + j + ${EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET} — MUTATION-IN-DIST-PROBE`.
After restore and rebuild the same bundle reads
`…top + j + ${EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG} — the N+1 VSRAM latency…`
and the probe is gone (0 occurrences). So the constant that reaches an author's
screen is the per-index one, verified in the artifact and not only in source.

**Runner.** No new runner: the rows live in suites already wired into `npm test`
(`test/formats/effects-preset-ramp.test.ts` and the two `__tests__` suites), and
the harness rows in `npm run harness:ramp-control`, registered in `package.json`.

**Expectations are derived.** No row types 1 or 2. The codec suite re-parses both
sentences from the vendored schema with its own regexes; the control suite
expresses every expectation through the constants; the wording suite asserts
**neither** constant name appears in the panel.

**Loud on unmeasurable.** Both derivations throw at module load with the regex
and the node in the message — demonstrated twice, once by mutation 3 and once
accidentally by my own wrong-node first draft (§3).

## 8. What this parcel did NOT do

- **No CRAM path.** The arm does not exist; code for it would be unreachable.
- **No emulator.** No `mcp__oracle__*` tool was touched. Nothing here measures a
  ROM; the `top + 2` measurement is aeon's, relayed through the contract.
- **No preview.** There is still no drawn ramp preview on this surface;
  `NO_PREVIEW` is unchanged.
- **No sibling checkout was written.** `../empyrean` was read at committed
  revisions only.

## 9. Two provenance sidecars, and what the drift gate caught

Re-vendoring turned three drift rows red, which is the gate working:

- `src/core/formats/effects/aurora-effects-preset.schema.provenance.json` —
  re-pinned to `e9409dc` / `dce3a9b4…`, `vendored.bytes` 36124 → **36725**,
  ancestry re-checked with `git merge-base --is-ancestor` against `origin/main`
  (`b4ab03ed`), and a pin-history entry recording the leaf diff, the
  stripped-comparison corroboration, and — the part the pin history did not
  previously have a shape for — that **a description-only CR is not a no-op when
  a codec parses prose**.
- `test/fixtures/effects/effects-preset-vectors.provenance.json` — the vectors
  test asserts **both sidecars cite one revision**, so the vectors sidecar's
  `revision` advances to `e9409dc` while its **blob stays `af5b5cee`**, with the
  no-move recorded and hashed both ways. Same shape as `d36d704`, different
  reason: no vector can notice prose.

## 10. `npm test`

**`486 passed | 2 skipped (488)` files, `6844 passed | 8 skipped (6852)` tests**,
green repo-wide, run from this worktree at the final tree.

**Reconciliation.** Master `c66e9b12` reads **6843 / 7** in the main checkout and
**6843 / 8** here — the linked-worktree invariant: `test/support/sibling-root.ts`
step 3 is *unmeasurable* in a linked worktree (`--git-common-dir` answers an
absolute path there whatever it is asked), so it skips loudly instead of passing.
The total is the same either way. This parcel adds **+1 test** (the single
`⚠ THE VSRAM DISPLAY LAG IS +1` row became two: the two-numbers row and the CRAM
row; the three control rows were replaced one-for-one), so **6851 → 6852**, and
the main checkout would read **6845 / 7** for the same total. Every skip named its
reason (`skip-report: OK`).
