# GUARD-SEAT-RESIDUE, the two surfaces it named: the effects formats tree and the collision tree

Branch `parcel/guard-residue-validators`, base `e443f98d`. Written as the work
was formed, not after, so a death costs the run and not the read.

The residue row `GUARD-SEAT-RESIDUE` names four surfaces the guard seat did not
reach. Two are not this parcel's: the main-process close guard is CLOSED
(`docs/reviews/2026-09-09-close-guard-witness.md`), and the off-schema road to
the agent handler plus the budget module's currency claim belong to a sibling
parcel. This packet covers the other two, **the effects formats tree** and
**the collision tree**, the latter insofar as tonight's `COLLISION-NEVER-AUDITED`
audit (`docs/reviews/2026-09-09-collision-audit-notes.md`) left it open.

## 0. Read this first: what does NOT discriminate

Two of the plants below change the source and cannot change any outcome. They
are removed from the denominator rather than counted as survivors, because a
mutation nothing can observe is not evidence about the suite:

- **`const` compared with `String()` instead of `deepEqual`.** Every `const` in
  both committed schemas is either a STRING (where the two agree by
  construction), or carries a sibling `type` at its own node -- and `validateNode`
  refuses a type miss and RETURNS, so the coerced comparison is never reached --
  or is the document-version key, where both `parseEffectsPreset` and
  `parseEffectsScene` hold their own `obj.schema !== 1` ahead of the schema.
  A guard resting on a neighbour, three different neighbours deep.
- **`canonicalizeBySchema`'s leftover filter exempting the key `id`.** `id` IS a
  declared property, so `!(k in props)` is already false for it and the added
  clause is unreachable. My error in constructing the plant, recorded rather
  than quietly dropped.

Four further survivors are reported and NOT fixed, with reasons, in section 5.
Every other survivor is closed by a test, and **no source line changed anywhere
in this parcel.**

## 1. Baseline and after

`npm test` at base `e443f98d`, exit 0:

    Test Files  563 passed | 3 skipped (566)
    Tests       8248 passed | 9 skipped (8257)
    skip-report: OK. Every skip named its reason.

`npm test` at this parcel's tip, exit 0:

    Test Files  564 passed | 3 skipped (567)
    Tests       8272 passed | 9 skipped (8281)
    skip-report: OK. Every skip named its reason.

Twenty-four rows added in one new file and five existing ones, and the one new
file is collected: the repo's own `check-test-collection` gate reports 567
test-shaped files on disk and all 567 collected, which is the same 567 the
totals line above counts.

⚠ AN EARLIER DRAFT OF THIS PARAGRAPH CARRIED 8298/8307 AND "fifty rows",
written while the after-run was still going. Both were wrong, and nothing in the
run would have contradicted them: an after-figure is not checkable against
anything except the run that produced it. Recorded rather than silently
corrected, because a fabricated after-figure is the one number in a packet like
this that no reader can catch.

A bare `npx vitest run` is 30s wall on this machine, so **every plant was scored
against the WHOLE suite**, not a scoped subset. No verdict below rests on a
scope argument and no survivor needed a confirming second run. (The red-first
proofs in section 4 are scoped, deliberately: there the question is whether ONE
named row goes red, and the file it lives in is the whole population.)

## 2. Enumeration method, and what it could not see

The unit is the **guard predicate**: one condition inside a validator whose
truth emits a refusal, an advisory, a schema issue or a console report. The
populations were read off the source directly and cross-checked against a
second, independent list wherever one existed:

- `src/core/formats/effects/json-schema-subset.ts` -- the evaluator both
  committed contract schemas are validated by. `grep -n 'issues.push\|throw new'`
  gives the emit sites; the file's OWN keyword tables (`SUPPORTED_KEYWORDS`,
  `IMPLEMENTED_TYPES`, `NAME_KEYED_SUBSCHEMAS`, `SINGLE_SUBSCHEMA`,
  `LIST_SUBSCHEMAS`, `IN_PLACE_APPLICATORS`, `ASSERTION_KEYWORDS`) give the
  keyword-by-keyword census independently of where the code puts its throws.
  The two agree at 18 keyword guards plus about a dozen shape refusals.
- The rest of the effects tree by `grep -nE '^export (function|const) '` filtered
  for validator-shaped names, then read.
- `src/core/collision` the same way, then **subtracted**: tonight's audit already
  planted 25 mutations there and named each. Nothing it planted was re-planted
  here; this parcel took the tree's VALIDATORS and BLINDNESS REPORTERS, which
  were largely not in its list.

⚠ **THREE THINGS THIS ENUMERATION CANNOT SEE, and a reader should treat them as
uncovered rather than covered:**

1. **Guards that silently CORRECT rather than emit.** A clamp, a coalesce, a
   `?? 0`. `scene-ui.ts` has at least one by name (`clampRowRemapPlaneY`) and
   the effects tree's `??` sites were not enumerated at all.
2. **`preset.ts` (2,290 lines) and `scene-ui.ts` (2,344 lines, 71 throws).**
   Between them these two files hold more refusal sites than everything planted
   here. Section 6 says exactly which.
3. **Anything a compiler could have answered that a grep did not.** The
   consumer-side question ("who calls this validator") was not asked by deleting
   symbols and reading `tsc`'s caller list, because the questions here were all
   about a guard's INTERNAL predicate rather than about its reach. Where reach
   mattered -- the `canonicalizeBySchema` callers, the `json-schema-subset`
   importers -- it was a grep, and a grep is what missed a transitive edge in
   the `MAPVIEWPORT-UNTESTED` case.

## 3. The result, as a ratio

**74 plants applied. 2 shown not to discriminate (section 0). 72 scored:
44 killed, 28 survived -- 61%.**

Of the 28 survivors, **24 are now closed by tests and 4 are reported unfixed**
(section 5). Zero source lines changed.

The ratio is not the finding. The survivors are not scattered, and they fall
into three classes:

### CLASS A -- the guards that face a schema AMENDMENT (12 survivors, all closed)

> Every guard a committed document exercises is killed. Every guard that exists
> so a FUTURE amendment cannot pass silently survived.

`validateNode`'s keyword checks are 18 killed of 19 planted: `$ref`, `type`,
`enum`, `pattern`, `minimum`, `maximum`, `multipleOf`, `minItems`, `maxItems`,
`uniqueItems`, `required`, the closed-schema rule, `not`, `anyOf`, `oneOf` in
both directions, and both recursions. Off-by-one plants, not deletions, on every
bound. That half is genuinely held and this parcel adds nothing to it.

`assertSupported`, `assertSchemaSupported`'s whole-schema walk, `resolveRef` and
`canonicalizeBySchema` are 8 killed of 20. That is the half whose entire job is
to say **"I cannot look at this"**, and it is the half that had no assertions
beyond the shapes the committed schema happens to contain. The file's own header
names the hazard it was written against: a preset amendment shipped a `type`
spelled as an ARRAY, and the keyword-NAME gate could not see it because the
keyword name was already supported. The name question is tested. The SHAPE
question was not.

Two are holes rather than merely missing rows:

- **The applicator census is asserted ONE MEMBER AT A TIME, and one member was
  missing.** `effects-schema-drift.test.ts` proves the `unevaluatedProperties`
  refusal for `oneOf` and for a `not` wrapping a `oneOf`. `anyOf` is in the same
  `IN_PLACE_APPLICATORS` list and had no row, so exempting `anyOf` from the
  prover left the suite at 8248 passed. The committed scene schema already uses
  the keyword.
- **The walk's own coverage had one green-on-green row.** Its only assertion
  elsewhere is that the committed schema passes -- and a walk that silently skips
  a whole KIND of subschema passes that row exactly as well as a correct one
  does. Dropping `not` from the walk's table was invisible; so was dropping
  `anyOf`. Dropping `$defs` was NOT, which is what partial coverage looks like
  from outside: the instrument found something once, so nobody asked what else
  it covers.

Also in this class, and worth its own line: **`IMPLEMENTED_TYPES` and
`matchesType`'s switch are two hand-maintained lists that must agree, and
nothing compared them.** Neither is exported. The new row derives its population
from JSON Schema's own type vocabulary rather than from either list, so it
cannot agree with a wrong list by construction, and asserts the accepted set
non-empty before asserting what it equals.

### CLASS B -- advisories held only at a comfortable distance from their edge (6 survivors, all closed)

Every one of these predicates has a test. Every one of those tests uses a
fixture far inside the defect, so the predicate survives being loosened by one:

| guard | tested with | loosening that survived |
|---|---|---|
| `loHi` | a band inverted by 100 lines | `lo <= hi + 1` |
| `lineInBand` | a line 90 lines outside | `>= lo - 1 && <= hi + 1` |
| `noMotion` channel range | never at the edge | `>=` to `>` |
| `boundaryAdvisories` absence | `undefined` only | dropping the `null` arm |
| `advisoryLayerDeformConflicts` | a fixture setting TWO of three sources | `clashes.length < 2` |
| `resolveCell` bank bound | a shape 200 past the bank | `<` to `<=` |

`lineInBand` is the sharpest of these because it LOOKS complete: it asserts both
endpoints of the band. But only that they are ACCEPTED. Nothing said the first
line past each end is refused, and a one-sided assertion about a bound is
exactly what a widened bound looks like from inside the suite.

### CLASS C -- blindness reporters whose silence had nothing holding it (6 survivors, 5 closed)

These are console reports and prose caveats on paths that must not throw, which
means the sentence is the ONLY signal a producer bug ever produces.

- **`reportPlaneLength`'s once-only key.** Collapsing it to the source name
  swallows every later DIFFERENT mismatch for the life of the process. The plane
  that silently renders as air is then the one nobody was told about.
- **The over-long plane went unreported.** It is handed back untouched, which is
  correct -- nothing reads past `length` -- and that is precisely why the report
  is the whole signal.
- **The consequence sentence names the direction**, and the two are opposite
  (`render as air` versus `unreachable`). Inverting it was invisible.
- **`ensureCollisionPlanes` seeds each plane from its own baseline.** Swapping
  plane B's source for plane A's left the suite green. This is the one survivor
  in the whole parcel that corrupts DATA rather than muting a report: seeding is
  a write path (paint, stamp, the agent's stamp handler), it is idempotent, and
  a plane seeded from the wrong baseline is indistinguishable afterwards from
  one an author painted that way.
- **`crossoverAuditMessage`'s stride caveat did not cover the one-way class.**
  That class is audited with no stride, so its "index 1" is a flat sub-tile
  index and not a cell; the caveat is the only thing between a reader and a
  number that looks like a coordinate.
- **`markTier`'s gate is spelled `!(px >= MIN)` and not `px < MIN`**, and only a
  value comparing false both ways can tell them apart. All three callers arrive
  through a multiplication by a zoom.

## 4. Red-first evidence

Every new assertion was proven red against the plant it exists for, with the
mutation quoted from disk by `git diff -U0` before the run and the tree proven
clean after it. 32 red-first legs, all KILLED:

- schema support gate, 16 legs: `A05 A07 A08 A09b A10 A12 A14 A15-defs A16-not
  A16b-items A17-anyof A17b-oneof C02 C03 TYPEDRIFT-gate-wider
  TYPEDRIFT-eval-narrower`
- advisories, 7 legs: `B01 B02 B05 B07 B04-control S03 S04-control`
- collision reporters, 5 legs: `P02 P03 P04 P05 P05b-not-idempotent`
- collision edges, 4 legs: `P17 P17b-always P09 P07`

⚠ **ONE ROW WAS WRITTEN WRONG FIRST AND THE PLANT CAUGHT IT.** The non-local
`$ref` row used a remote url. A url shares no leading character with a local
pointer, so `startsWith('#/')` loosened to `startsWith('#')` still refused it and
the row stayed green while its own subject was gone. The discriminating case is
one character away: JSON Schema's plain-name fragment `#anchor`, which under the
loosened guard slips this refusal and is answered several lines later by the
pointer resolver, with a sentence about a schema that does not resolve. Both
throw; only one says the true reason. **A case at the extreme is a bad control
for anything that clips there** -- the same rule that made class B a class.

### Two traps this parcel hit, recorded

1. **A MISSING LOG IS NOT A VERDICT.** The first baseline run wrote to a
   directory that did not exist, because the `mkdir` had been in a command the
   sandbox refused. The run reported exit 1 and the log was absent. Read as a
   red baseline it would have poisoned every figure in this packet.
2. **A LEGITIMATE CATCH CAN WEAR THE MALFORMED-RUN SIGNATURE.** Dropping
   `noMotion` from `boundaryAdvisories`' dispatch list reddened ELEVEN files at
   collection time and dropped the total by 905 tests -- the exact shape tonight's
   collision audit discarded two runs for. It is a real kill: `effects-preset.ts`
   holds a MODULE-LOAD-TIME invariant asserting the fresh boundary's advisory
   set, and it throws at import. The discriminator is the error TEXT (a named
   invariant, not a `SyntaxError`), not the totals line. Suspected, re-planted a
   third way, got the same signature, read the text, counted it.

## 5. The four survivors NOT fixed, and why

- **`matchesType`'s `default` throw.** Unreachable by construction:
  `assertSupported` refuses any type name outside `IMPLEMENTED_TYPES` before a
  value is seen, so the default fires only if the two lists disagree. A row
  asserting the default directly would need a schema the gate refuses first.
  What the new file does instead is pin the AGREEMENT that makes it unreachable,
  in both directions. Defence in depth, correctly left as such.
- **`isAir` widened from `index === 0` to `index <= 0`.** A shape index comes
  out of an unsigned bit field, so a negative one cannot occur. Reachable the day
  a signed index can exist; not today.
- **`AUDIT_SAMPLE_CAP`'s VALUE.** `crossover-audit.test.ts` asserts the sample
  list is capped AT `AUDIT_SAMPLE_CAP`, restating the constant on both sides, so
  the row is invariant under any value of it. That is the right shape: the
  docblock's stated property is "bounded, because the report is meant to be
  read", and a cap of one satisfies that sentence as well as sixteen does.
  There is no property to assert that is not an assumption, so none was written.
- **`crossoverAuditMessage`'s empty-sample disclosure** -- the `at()` fallback
  reading "nowhere (the sample list is empty, which is a bug in this audit)".
  Deleting the parenthetical left the suite green. Reaching it needs a
  hand-built `CrossoverAudit` with a positive count and an empty sample list,
  which is a state `auditCrossovers` cannot produce. It is a self-blindness
  disclosure about a state that should not exist, and a test for it would be
  building the broken object the sentence is about. **Genuinely unfixed rather
  than ruled out**: worth a row if anyone ever hand-constructs a `CrossoverAudit`,
  which the agent road could.

## 6. Where the budget ended, named so nobody reads it as covered

This is the standard the residue row was written to, so it is specific:

- **`src/core/formats/effects/scene-ui.ts` -- 2,344 lines, 71 throws, NOTHING
  PLANTED.** Its refusal functions are enumerated and untouched:
  `bobShiftRefusal`, `sceneIdRefusal` / `isValidSceneId`, `driftRateRefusal` and
  `driftRateRefusalParts`, `driftPxPerFrameRefusal` and its parts,
  `rowRemapPlaneYRefusal`, `rowRemapHeightShiftRefusal`, `reelRateRefusal`,
  `reelRatesRefusal`, and the derived constants `EFFECTS_DRIFT_RATE_REFUSED`,
  `EFFECTS_DRIFT_UNITS_PER_PIXEL`, `EFFECTS_ROW_REMAP_REFUSED_KEYS`,
  `EFFECTS_ROW_REMAP_GENERATOR_REFUSALS`. **`clampRowRemapPlaneY` is the one I
  would plant first**, because it is the tree's only named CORRECTING guard and
  this parcel's whole method is blind to that shape.
- **`src/core/formats/effects/preset.ts` -- 2,290 lines, 38 throws.** Only
  `parseEffectsPreset`'s dispatch was read. Unplanted: `presetArmIssue`,
  `baseSwapOrderRefusal`, `isBaseSwapTargetAligned`, `presetDefFields`, the
  reserved-wave-2-key refusal, the id/filename-stem refusal, and the dozens of
  schema-prose drift throws in the 700-1450 range.
- **`ramp-scroll-mode.ts` (7 advisory pushes), `ramp-sign-lag.ts`,
  `preset-lag.ts`, `channel-bands.ts`, `curve-rate.ts`, `section-wiring.ts`** --
  none planted. `section-wiring.ts`'s `sectionRasterAdvisory` is the one to do
  next: its `'unknown'` state is literally the "I could not read the file"
  answer sitting in the same union as "I looked and found nothing", which is the
  worst case this method is for.
- **`boundaryAdvisories`' `sweepTravel`** was planted once (killed) but its
  `cannot-tell` verdict -- the docblock's own "the silence is not a clearance" --
  was not probed at all.
- **Collision**: `collision-region-read.ts` (`collisionCellGlyph`,
  `readCollisionCell`, `renderCollisionAscii`) and `collision-paint.ts` were
  read but not planted; tonight's audit reached them only partially too.
- **No runtime confirmation anywhere.** No emulator touched, none attempted.
  Nothing in this parcel needs one: every row is a pure-function assertion.
