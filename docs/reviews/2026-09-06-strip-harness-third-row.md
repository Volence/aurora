# The strip harness still believed in two condition rows — and in a shared record aeon deleted

Branch `parcel/strip-harness-third-row`. Repairs
`scratchpad/effects-section-strip-harness.mjs`, the CDP instrument for the
permanent section strip on the Effects tab.

Witnessed on a running app: `npm run harness:effects-section-strip` — **15/15
rows, 0 failed**, three times, `devicePixelRatio = 1` at 1400x872 on every run
(loadavg 3.39 / 26.13 / 27.51 across the three, so the number is not a
quiet-machine artefact). aeon read at `a7a4f640`, rsync'd to a throwaway copy;
Aurora baseline `f89e1ad9`.

| commit | what |
|---|---|
| `6645bece` | the repair |
| this one | the dpr/viewport line and this packet |

---

## 1. What state each affected row was actually in, MEASURED before anything changed

The whole run at Aurora `f89e1ad9`, aeon `a7a4f640`: **8/15 rows**. This is the
table the brief asked for — every row this parcel touches, and what was actually
wrong with it, not what the count made it look like.

| row | state before | why |
|---|---|---|
| `[3a]` the strip carries N condition rows | **loudly red** | `rows.length === 2`; the strip renders 3 |
| `[3b]` section 0's verdicts DIFFER | **loudly red, and red on substance** | count **and** it typed `✗` for a mark the app draws `☐` — see §3 |
| `[3c]` a SHARED section names its sharers | **loudly red, and its SUBJECT is gone** | count **and** aeon has had no shared preset record since `9972ef1d` — see §4 |
| `[3d]` the section that is BOTH | **loudly red, count only** | every other clause was still correct: `✓ / ✓ / OJZ_Preset_Sec5 threads ojz_act1_sec_raster(sec: 5)` all matched |
| `[3e]` each row's contract on `title` | **loudly red, three ways** | count, `^CONDITION 1 of 2`, `^CONDITION 2 of 2` — the strip has said "of 3" for a day |
| `[4a]` the raster binding stays ENABLED | **GREEN — and vacuous** | it never asserted that the section it was taken on failed anything. See §5; this is the row the brief said to look for |
| `[4b]` descriptor unreadable | **loudly red, count only** | the `?` / asymmetry / advisory / absent-act-line clauses were all still correct |
| `[4c]` library unreadable | **loudly red, count only** | ditto, including the `· bound N,N`-tolerant act-line clause a previous parcel had already future-proofed |
| `[0a] [1a] [1b] [1c] [2a] [2b] [2c]` | unaffected, green | permanence and mount; nothing in them mentions the conditions |

Full log: the before run is reproduced by checking out `f89e1ad9` and running the
same command; its aggregate line was `════ 8/15 rows · 49.2s ════` with exactly
`[3a] [3b] [3c] [3d] [3e] [4b] [4c]` named under FAILING.

**The headline is not "seven rows said 2".** It is that the count masked three
substantively different defects — a wrong glyph tier, a fixture that left the
level, and a row that was green for a reason it never checked — and repairing
only the number would have shipped all three green.

---

## 2. Where the number 3 comes from

`src/renderer/components/effects/SectionPicker.tsx` renders three `ConditionRow`
calls, in this DOM order:

| index | `n` | `label` | source |
|---|---|---|---|
| 0 | 1 | `own preset` | `cond.ownPreset` |
| 1 | 2 | `threaded` | `cond.threaded` |
| 2 | 3 | `its channels` | `sectionExtraChannelsCondition(...)` |

each titling itself `CONDITION n of 3`. The third landed on 2026-09-05
(`docs/reviews/2026-09-05-coldread-fixes.md` §1, cold read D-A). **The third row
appends; it does not reorder.** That was read off the component and then
confirmed on the screen — the run prints every row's `n` and label, and `[3a]`
now asserts `n === String(i + 1)` against the row's own DOM index, so a
right-count/wrong-order strip fails instead of silently shifting every `rows[0]`
and `rows[1]` reading below it.

The seven literals are now one constant, `CONDITION_ROWS`, with that citation
beside it. **It is still a literal on purpose:** counting `<ConditionRow` out of
the .tsx would make the harness follow a deletion silently, which is the one
thing `[3e]`'s index guard exists to stop. A fourth row must make this file go
red and be read by a person.

---

## 3. `[3b]` — the count hid a wrong glyph tier

The row asserted `c0.rows[1].mark === '✗'` for section 0's unmet `threaded`
condition. Since C1 (the same 2026-09-05 landing) that is wrong: `ConditionRow`
draws `✗` in the warning tier only when the SECTION binds a `rasterRef`, and `☐`
in the info tier otherwise, because aeon's `effects_seam_gate` fires by name only
on a section with a `rasterRef`. Section 0 has no sidecar, so it draws `☐`.

The repair does not type `☐` either. `independentDerivation()` now also reads
Aurora's own sidecars out of the copy —
`games/sonic4/data/editor/ojz/act1/section_N.meta.json` — and the row asks
`failMark(0)`, which answers `✗` for a bound section and `☐` for a free one. The
run prints the derived set: `bound (Aurora sidecars, decides ☐ vs ✗): [5,6]`.

The row also now reads `data-effects-wiring-verdict` alongside the glyph, because
since C1 the two are no longer the same question: one verdict (`no`) draws two
glyphs depending on a fact about the section rather than about the condition.

---

## 4. `[3c]` — the row's subject left aeon's level

This is the one that could not be repaired by re-deriving. Measured in aeon at
`a7a4f640`:

```
sec 0 OJZ_Preset_Sec0   sec 3 OJZ_Preset_Sec3   sec 6 OJZ_Preset_Sec6
sec 1 OJZ_Preset_Sec1   sec 4 OJZ_Preset_Depth  sec 7 OJZ_Preset_Sec7
sec 2 OJZ_Preset_Sec2   sec 5 OJZ_Preset_Sec5   sec 8 OJZ_Preset_Plain
```

Nine sections, nine distinct records. **There is no shared preset record in
ojz/act1 any more.** Section 6 stopped sharing `OJZ_Preset_Plain` at aeon
`6ae88363`, section 7 at `9972ef1d` ("OJZ act 1 gets a SECOND section with live
patch channels", 2026-09-05), leaving section 8 the sole binder. The harness's
own independent parse says so on every run: `own preset: [0,1,2,3,4,5,6,7,8]`.

So the row was reporting *aeon's level edits* as *this app's defect*, which is
what a row does when its fixture is somebody else's data.

**The repair builds the fixture instead of finding it.** `[3c]` rewrites one line
of the COPY's descriptor to point section 7 at the record section 8 binds,
reopens the project, takes the reading, and puts the file back — and again in the
outer `finally` if anything throws. This is the technique the harness already
used for `[4b]`/`[4c]`, which rename a whole file and restore it.

Nothing in the expectation is typed. Both the source and destination strings come
from the parse (`effects: ${truth.bind[7]}` → `effects: ${truth.bind[8]}`), the
rewrite refuses unless that string appears **exactly once**, and the expected
detail is re-derived from the MUTATED file by a second `independentDerivation()`
— including the pluralisation, which the old row got structurally wrong: it hard-
coded `shared with sections` and today's two-way share renders the singular. The
measured line is `☐ own preset OJZ_Preset_Plain, shared with section 8`.

---

## 5. `[4a]` — the row that was green and should not have been

> *the raster binding stays ENABLED on a section that fails a condition — it advises*

It asserted `disabled === false` and `options > 1`. It never asserted that the
section it was taken on failed anything. Today the premise happens to hold
(section 0's `threaded` is `no`), so the row was green **for the right reason and
by luck**: on an act where nothing failed anything it would have gone on reading
green while its own name was false, and the whole point of the row — that Aurora
advises where aeon gates — would have been untested.

It now reads the conditions in the SAME state as the select it is about, with no
reload between the two readings, and requires at least one row's verdict to be
something other than `yes`.

**This is not an argument, it is a measurement.** Under plant E below (nothing
ever fails a condition), with that plant compiled into the app and no rebuild
between the two runs:

| harness | `[4a]` |
|---|---|
| `f89e1ad9` (before) | **PASS** — 8/15 |
| this branch | **FAIL** — 12/15 |

---

## 6. Re-poison — every row I touched, planted on disk, rebuilt, shown red

Each plant was applied to app source with a `python3` exact-string replacement,
`VITE_AURORA_DEBUG=1 npm run build` re-run (exit code checked before the harness
— a hash or a run after a red build reads the stale artifact), the harness run,
and then `git checkout -- <path>` from the committed baseline. `git diff --stat`
is quoted for each. **No plant lived in the harness itself.**

| plant | mutation on disk | `git diff --stat` | result |
|---|---|---|---|
| **A** delete the third row | the whole `<ConditionRow n={3} label="its channels" …>` element removed from `SectionPicker.tsx` | `SectionPicker.tsx \| 8 --------` | **7/15** — `[3a] [3b] [3c] [3d] [3e] [4a] [4b] [4c]` all red, and the run **did not throw**: the indexes stayed guarded, which is what that row's own comment demands |
| **B** renumber the third row | `<ConditionRow n={3} label="its channels"` → `n={4}` | `SectionPicker.tsx \| 2 +-` | **14/15** — `[3a]` alone. The identity clause, isolated |
| **C** always draw the refusal tier | `const refused = cond.verdict === 'no' && unmet === 'refused';` → `const refused = cond.verdict === 'no';` | `SectionPicker.tsx \| 2 +-` | **13/15** — `[3b] [3c]`. The derived `☐`/`✗` is load-bearing |
| **D** stop naming the sharers | condition 1's shared branch `detail:` collapsed to `record` in `section-wiring.ts` | `section-wiring.ts \| 2 +-` | **14/15** — `[3c]` alone |
| **E** nothing ever fails | `if (by.length === 0) return { verdict: 'no', …}` → `'yes'` in `section-wiring.ts` | `section-wiring.ts \| 2 +-` | **12/15** — `[3b] [3c] [4a]`. §5 is this plant |
| **F** a stale header number | `` title={`CONDITION 3 of 3: …`` → `CONDITION 3 of 2` | `SectionPicker.tsx \| 2 +-` | **14/15** — `[3e]` alone |

Restored from the committed baseline after each; `git status --porcelain` empty
before the final runs, and 15/15 green three times after.

Coverage of what was changed: the count clause on all eight rows (A), `[3a]`'s
new identity clause (B), `[3b]`'s derived mark (C), `[3c]`'s naming (D) and its
manufactured fixture (A, C, D, E all reach it), `[4a]`'s new premise (E),
`[3e]`'s header numbering (F).

---

## 7. The copy, and aeon

The harness now mutates the copy in two ways (a rename for `[4b]`/`[4c]`, a
one-line rewrite for `[3c]`). After every run in this parcel:

* the copy's `act_descriptor.emp` is byte-identical to aeon's;
* `find <copy> -name '*.harness-bak'` is empty;
* `git -C <aeon> status --porcelain` shows only `M docs/lane-status.json`, which
  was another lane's and was already there before this session started.

aeon was read through `rsync -a --exclude=.git --exclude=.claude` and
`git -C <aeon> log`/`show` only. Nothing was written into it. `AEON_DIR` is
resolved through `test/support/sibling-root.mjs`, and the harness's existing
import guard refuses an `AEON_DIR` that points at aeon itself.

---

## 8. Which runner executes this — plainly: none

`npm test` does **not** run this harness or any other. The chain is
`check-test-collection` → `check-pseudo-skip` → `check-peer-path-literals` →
`check-cited-paths` → `check-doc-citations` → `check-object-stringify` → four
dash checks → `check-guide-text` → `check-scripts-dashes` →
`check-ledger-timestamps` → `check-python-resolver` → `check-harness-guards` →
`npm run typecheck` → `vitest run`. Every `harness:*` script, this one included,
is run by hand. `scratchpad/check-harness-guards.mjs` is in the chain and does
classify this file (as a guarded launcher), but it reads source; it never runs
the harness.

**So nothing would have caught this drift, and nothing will catch the next one.**
That is why the repair is a single constant with the component cited beside it
rather than seven corrected numbers.

---

## 9. The sibling instrument — VERIFIED STALE, and NOT fixed here

`scratchpad/effects-section-picker-harness.mjs` row `[4a]` was reported to me as
stale. It is. I checked it against aeon's data myself and then measured it,
rather than relaying the report:

```
npm run harness:effects-section-picker   →   14/15 rows, FAILING: [4a]
```

It asserts the literal sentence `Sections 6, 7 and 8 all share the preset record
OJZ_Preset_Plain`, and §4 above is why that can no longer be true. It is the same
defect as this parcel's `[3c]`, from the same aeon commits.

**I did not repair it.** It belongs to another packet's instrument, it has no
mutate-and-restore machinery at all (its header states "Nothing here saves; the
copy is not consumed"), and giving it some is a design change to a file this
parcel was not sent to. The two honest shapes are (a) build the shared record the
way `[3c]` now does, which means teaching that harness to write, or (b) derive the
subject section from its own parse and report UNMEASURED — loud, never green —
when no section shares. **Open, tagged for the controller.**

---

## 10. What I did NOT establish

* **Nothing on hardware.** No emulator tool was called. Whether aeon's build
  actually refuses any of the cases the strip describes is untested here and was
  never in scope.
* **Condition 3's own degradation is unasserted.** `[4b]`/`[4c]` assert that
  conditions 1 and 2 degrade independently. The measured runs show condition 3
  reading `✓ nothing bound; no extra chooser threaded here` with the descriptor
  gone and `? could not read ojz_effects.emp` with the library gone — correct,
  and recorded in the run's detail lines, but **not gated**. A third row that
  started answering with the descriptor missing would not fail anything.
* **The `✗` refusal tier is not exercised by this harness at all.** With aeon at
  `a7a4f640` no section of ojz/act1 is both bound and failing — 5 and 6 are the
  only bound sections and both pass conditions 1 and 2 — so every unmet mark in
  every row above is `☐`. `failMark()` will follow the data if that changes, but
  today nothing here proves the warning tier still renders. `harness:coldread-c1`
  is the instrument for that; I did not run it.
* **The `PLANT=rot-strip` control was not re-run.** It exercises `[2a]`, which
  this parcel did not touch.
* **`[3d]` says nothing about condition 3.** Its clauses are still only about
  rows 0 and 1. The cold read's D-A case (✓ ✓ and a refused build) no longer
  reproduces on section 5 with today's data — condition 3 reads
  `✓ patch world-Y, patch motion threaded` — so asserting it would have meant
  inventing a fixture for a row that was not asked to have one.
* **One machine, one window size.** dpr was 1 on all six poison runs and all
  three final runs; the 1.35 this environment has shown was not reproduced, so
  nothing here says the geometric rows `[2a]`-`[2c]` behave at that scale.
