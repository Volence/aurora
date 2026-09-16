# The regions seam leg: Aurora's flattening against aeon's hand-typed rows

2026-09-16, `parcel/regions-seam-leg`.

Aurora could read and write the regions document. Aeon could read the same
document and flatten it into the engine's Region table. **Nothing had ever
compared the two.** Each side had a codec, each side had its own tests, and both
could have been self-consistently wrong about the same arithmetic forever. Aeon
published a shared golden precisely so the leg could be run; this is the leg.

## The headline, twice, because both halves are findings

**The seam agrees.** Aurora's TypeScript flattening of aeon's golden document
reproduces aeon's ten hand-typed Region rows, row for row, on every field —
`index`, `id`, `x0`, `x1`, `y0`, `y1`, `preset`, `sceneRef`, `rasterRef` — plus
`act`, `act_w` and `act_h`. Nothing on either side was adjusted to make that
true.

**Our closed schema accepted aeon's document unchanged.**
`aurora-regions.schema.json` is closed at three levels
(`unevaluatedProperties: false` on the document, on a region and on `bg`). Every
key the golden carries is a key it declares, so nothing was refused, no byte of
the golden was massaged, and the schema was not loosened. The row that says so
asserts `parseRegionsDocument(docBytes)` deep-equals a bare `JSON.parse` of the
same bytes — the codec hands back the object `JSON.parse` produced, so that
equality is the statement that nothing was repaired *or* dropped.

Neither is a silent pass. Both are recorded because a check nobody ran reads the
same as a check that passed.

## What was vendored, and the pin re-derived here

Two files, under `test/fixtures/regions/` beside `regions-vectors.json`, each
with a `*.provenance.json` sidecar:

| Vendored | aeon path | bytes |
|---|---|---|
| `test/fixtures/regions/ojz_act1.regions.json` | `tools/fixtures/regions/ojz_act1.regions.json` | 1866 |
| `test/fixtures/regions/ojz_act1.rows.json` | `tools/fixtures/regions/ojz_act1.rows.json` | 3955 |

### The pin of record is 9772326, not the revision the dispatch named

The pin of record in this repo is **the last commit that touched the path**, not
a tip and not whatever revision a brief happened to quote. Commands beside
answers, all run in the aeon checkout:

```
$ git log --format='%H %ci %s' origin/master -- tools/fixtures/regions/ojz_act1.regions.json
97723264e3ec975e46b1c2569ad9aadb00f5074a 2026-09-15 23:29:02 -0400 regions seam: the flattener, the shared golden, and the ruling that supersedes spec 5.2

$ git log --format='%H %ci %s' origin/master -- tools/fixtures/regions/ojz_act1.rows.json
97723264e3ec975e46b1c2569ad9aadb00f5074a 2026-09-15 23:29:02 -0400 regions seam: the flattener, the shared golden, and the ruling that supersedes spec 5.2
```

One commit each, and the same one: `9772326` is the only commit that has ever
touched either file. The dispatch cited `e3b21e7267fa0590fdf43fbede068a98fc681c16`,
which is eight commits later and twelve before the tip; it resolves both paths to
the same blobs **because it does not touch them**, so the bytes are identical
either way and only the citation differs. `9772326` is the one that carries the
change, which is the convention `aurora-regions.schema.provenance.json` states
and warns will be got wrong at the first re-vendor.

### Published, and current at tip

```
$ git rev-parse origin/master
2f0049015c3b223b92e6361eb3867aa2f0331bdd

$ git merge-base --is-ancestor 97723264e3ec975e46b1c2569ad9aadb00f5074a origin/master ; echo $?
0

$ git merge-base --is-ancestor e3b21e7267fa0590fdf43fbede068a98fc681c16 origin/master ; echo $?
0
```

### Re-hashed on this side before anything was believed about them

Extracted by **redirecting `git show` straight into place** — never retyped,
never reformatted, never hand-edited:

```
$ git -C <aeon> show 9772326…:tools/fixtures/regions/ojz_act1.regions.json > test/fixtures/regions/ojz_act1.regions.json
$ git -C <aeon> show 9772326…:tools/fixtures/regions/ojz_act1.rows.json    > test/fixtures/regions/ojz_act1.rows.json
```

then `git hash-object` over the vendored bytes **on this side**, against aeon's
own object ids resolved independently with `git rev-parse <rev>:<path>`:

| file | `git hash-object` here | aeon at `9772326` | aeon at `origin/master` |
|---|---|---|---|
| `ojz_act1.regions.json` | `f3e191252be76b95f2ef7994bcb2af619d106e87` | same | same |
| `ojz_act1.rows.json` | `b8ca9cd4d21a945d39b66c672583edaa17b235c3` | same | same |

sha256, also computed here, is recorded in each sidecar's `fixture` block.

### Registered in `VENDORED`, which needed the table itself changed

`test/formats/aeon-fixture-currency.test.ts` holds the one table that answers
both vendoring questions — pin integrity and content currency — and a sweep that
fails when a sidecar claims a verbatim aeon blob whose fixture is not in it. Its
entries were **bare basenames resolved against `test/fixtures/effects`**, so a
regions fixture added as a basename would have thrown `ENOENT` at collection time
and invited a second copy of the machinery beside it, which that table's own note
forbids. The entries are now paths under `test/fixtures`. Both halves now get a
pin-integrity row, a content-currency row against aeon `origin/master`, and
coverage by the completeness sweep.

The pair is pinned at **one** revision deliberately: a document from one aeon
commit compared against rows from another certifies nothing about either. A row
in the seam test asserts the two sidecars agree on their revision, because they
are hand-edited.

## The flattening

`src/core/formats/regions/flatten.ts`, app code and not test-only code: the
editor needs to know what the engine's table will look like, and where the holes
are, while somebody is drawing. It carries the one exclusive-to-inclusive
conversion site in Aurora (`x1 = x + w - 1`), the rectangle algebra, and aeon's
three checks in aeon's order — per-row, then pairwise disjointness, then
coverage — refusing rather than repairing.

Two things it deliberately does not do:

* **It does not invent the act's size.** The document carries none; `act_w` and
  `act_h` are `ACT_W`/`ACT_H` in the act's `.emp` descriptor, which Aurora does
  not have. `flattenRegionsDocument` takes bounds as a **required** argument,
  because a size taken from the thing being checked would make the coverage rule
  true by construction and therefore unfalsifiable. `actExtentFromDocument` is a
  separate function whose docblock says in its own words that it is **not** the
  act's bounds.
* **It does not restate three of aeon's six per-row rules.** `REGION_MIN_SPAN`
  and the four reachable-edge rules need `CENTRE_{X,Y}_{MIN,MAX}`, which live in
  the descriptor. They stay the generator's refusals. A document green here can
  still be refused by aeon's build for one of the three, and the file's header
  says so at the point of use rather than leaving the silence to read as
  coverage.

### `act_w` is derived, not copied

The test does not read `6144` out of the rows file and hand it back to the
flattener — that would make the `act_w` assertion a tautology. It computes the
document's own covered extent with `actExtentFromDocument` and asserts *that*
equals the golden's `act_w`/`act_h`. It is not circular with the coverage check
either: a document with a hole punched in the middle has the same extent, and
`uncoveredRects` still finds the hole. Mutation **M5** below is the proof that
this row can fail.

### Row by row, on every field

`test/formats/regions-seam.test.ts` compares **whole row objects**, not a
projection over the shared key list, so an *extra* key on our side goes red too.
`name` is in the document and must not be in a row: the engine never reads an
author's label. The same claim is then re-asserted field by field in ten
separate rows, so a failure names the field that moved instead of printing the
whole table.

Explicit nulls get their own row. Aeon's `load_act_regions` normalises every
optional key to an explicit `None` and says why: a caller comparing rows must not
be able to pass by reading a missing key as a null. `toBe(null)` cannot tell an
absent key from a null one in JS either, so one row asserts
`hasOwnProperty('sceneRef')` and a second asserts the *non*-null bindings are
carried across verbatim — a flattener that wrote `null` into every binding would
pass the first alone.

## The red-first proof of each check, with the mutation shown on disk

Baseline committed at `06c62023` before any mutation; each mutation applied to a
clean tree, quoted back from the file, run, then restored with
`git checkout HEAD -- <path>` and the tree confirmed clean (and, for the fixture
mutations, the restored blob id re-checked).

| # | Mutation, as it appeared on disk | Result |
|---|---|---|
| M1 | `flatten.ts:223` → `return { x0: x, x1: x + w, y0: y, y1: y + h };` | **19 failed / 10 passed** |
| M2 | `regionToRow` emits an *absent* key instead of an explicit null: `...(region.sceneRef === undefined ? {} : { sceneRef: region.sceneRef }),` | **12 failed / 17 passed** |
| M3 | `uncoveredRects` line 191 → `return [];` | **2 failed / 27 passed** |
| M4 | `firstOverlap` line 209 → `return null;` | **2 failed / 27 passed** |
| M5 | `actExtentFromDocument` → `Math.max(actW, x + w - 1)` | **18 failed / 11 passed** |
| M6 | the vendored **document** tidied onto the 2048 grid (night → `x 4096 w 2048`, sec1 → `w 2048`) | **21 failed / 21 passed** across the seam + currency files |
| M6b | the vendored **rows** half tidied (`night x0 3400 x1 4799` → `4096 / 6143`) | **4 failed / 25 passed** |
| M7 | `'regions/ojz_act1.rows.json'` deleted from `VENDORED` | **1 failed / 10 passed** |
| M8 | `"effectsRef": "ojz_act1_start"` added to region `sec0` of the vendored document | **24 failed / 5 passed** |

Four of these are worth more than their count.

**M3 is the one that justifies the anti-vacuous row.** Under `return []`, the
row that asserts `uncoveredRects(rects, …)` equals `[]` over the golden **stayed
green** — `[]` is what a correct document produces *and* what a dead instrument
produces. Only the row that punches a hole on purpose and requires the list to
name it went red. The same shape holds for M4 and `firstOverlap` returning
`null`.

**M6 and M6b are two different halves and each covers one.** Tidying the
*document* leaves the night-straddle row green, because that row reads the
*rows* file; tidying the *rows* half is what turns it red. The document half is
covered instead by the row asserting `sec1`/`sec2` widths are not section
multiples. Both are needed; neither alone covers a re-vendor of the pair. Both
mutations also turned the pin-integrity row red, which is that instrument working.

**M8 is the finding path, run deliberately even though the finding did not
occur.** A key the closed schema does not declare must be *seen*, not silently
tolerated. It was, with the pointer:

```
RegionsDocumentError: ojz_act1.regions.json does not match the regions schema
  - /regions/0: unknown property "effectsRef" (the schema is closed)
```

`effectsRef` was chosen because ruling Q8 keeps exactly that key reserved and
refused, so the mutation is the disagreement the seam would actually have had if
aeon's generator had spent it. It has not.

**M1 also fixed a defect in the test rather than only proving a check.** The
first run of M1 printed `Test Files 1 failed (1) / Tests: no tests`: the document
and the table were built at module scope, so a throw happened during
*collection* and every row in the file vanished — including the ones whose whole
job is to say what disagreed, and including the codec-acceptance row that is
supposed to report a schema refusal as a finding. Both are now lazy and memoised
(commit `06c62023`), which is why M1's artifact above names nineteen rows.
Applied-and-still-green is a runner defect; applied-and-red-but-unreadable is one
too.

## Aggregate results

Unmutated tree, foreground runs:

```
$ npx vitest run test/formats/regions-seam.test.ts
 Test Files  1 passed (1)
      Tests  29 passed (29)

$ npx vitest run test/formats/
 Test Files  69 passed (69)
      Tests  1268 passed (1268)
```

Zero skipped in both (`skip-report: no tests were skipped in this run`), so the
currency rows against aeon `origin/master` **measured** rather than skipping past
an absent peer. `npx tsc --noEmit` exits 0, and all fifteen `check:*` /
harness-guard scripts in the `npm test` chain exit 0.

## What is left open, and why

* **No ROM, no emulator, nothing assembled.** The golden is aeon's transcription
  of `act_descriptor.emp`, not bytes read out of a built table. Aeon's own
  `TestShippedTableMatchesGolden` carries a `needs_build` marker and does that
  comparison; nothing on Aurora's side can. **TAGGED for foreground follow-up:**
  whether the shipped release ROM's Region table equals these ten rows is an
  aeon-side, build-gated question.
* **The DEBUG shape is out of reach by contract, not by omission.** The rows
  file's provenance records an eleventh row (`OJZ_E2_SNAP_ROWS`, a look fixture
  at x 5600..6143 y 0..2047 binding `OJZ_Preset_NightSnap`) that also shortens
  `sec2` to `x1 = 5599`. A regions document has no way to say `DEBUG` — the
  contract schema is closed and carries no shape key, and the hub ruled on
  2026-09-16 at empyrean `39b8405` that it stays closed — so these ten rows are
  the release table and a disagreement with a DEBUG ROM is **not** a flattener
  defect on either side. It is booked in aeon's `docs/DEFERRED_WORK.md` under
  `REGIONS-GOLDEN-GAP`.
* **Three of aeon's per-row rules are unreachable from here** (`REGION_MIN_SPAN`
  and the reachable-edge family), because their bounds are in the act's `.emp`
  descriptor. Closing that would mean Aurora reading an act descriptor, which is
  a different parcel; inventing the bounds here would be a rule the engine does
  not have.
* **One act, one document.** `ojz_act1` is the only regions document that exists
  anywhere, so the seam is proven over a single act. Aeon's own test file says
  the same of its side: no act in that repo has a `regions.json` yet and the real
  tree exercises only the legacy arm.
* **`bg` is untested across the seam.** The golden carries no `bg` block on any
  region, so the part-2 background placement — `layoutRef`, and the derived
  `span` that this layer cannot check at all — crosses the seam nowhere in this
  fixture. `flatten.ts` does not carry `bg` into a row, because the golden's
  `ROW_KEYS` does not have it; if the engine's table ever reads `rg_bg_layout`
  and `rg_bg_span` out of the document, that is a row this file does not have and
  a golden aeon has not published.
* **Nothing here draws a region.** `uncoveredRects` returns holes as rectangles
  precisely so the editor can show them in red, which is the direction of travel
  the 2026-09-14 cut-on-draw ruling chose. No UI consumes it yet.
