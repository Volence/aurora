# SECTIONS-0-7-UNBARRED-AFTER-REGIONS: the reader reads aeon's region rows, and sections 0 and 7 come back barred

2026-09-14 UTC (the evening of 2026-09-13, -0400). Branch `fix/sections-0-7-regions-reader` off
master `98989d4b`. Target: aeon `6bd8ed8925d292d5f70f13ea24302161bef405bc`, which was aeon's
`origin/master` when read (`git rev-parse origin/master` in aeon's checkout). Every aeon byte in
this parcel was read through git objects at a named revision (`git show <rev>:<path>`), never
aeon's working tree. Governing bar: `docs/OVERSEER-REVIEW-BARS.md` bar 19. Follows
`docs/reviews/2026-09-13-section-wiring-off-live-aeon.md` (row 178), which measured the defect.

| commit | what |
|---|---|
| `4f04d587` | the reader pairs each `effects:` with the `sec:` inside its own call; the load's descriptor step moves into `readDescriptorWiring`; honest wording for a file read and not used; 7 synthetic rows and 6 currency rows |
| `d7c378ff` | row 8 ("SECTIONS 1 TO 4") asserts its instrument saw a record |
| `55c2de28` | an unusable descriptor makes arm exclusivity `unknown`, never a silent `open` (a RULE CHANGE, in its own commit) |
| `4ee10559` | the currency rows assert the second instrument saw the region table before looping over it |
| `90f19730` | this packet and ROADMAP row 180 (written as 179; renumbered at the master merge, because master's own 179 is the palette warning) |
| the commit after it | the full-suite totals below, measured on `90f19730` |

## The defect, re-measured at aeon `6bd8ed89`

aeon's act 1 descriptor no longer writes `ojz_sec(sec: N, …, effects: X)`. Its section
constructor is `comptime fn ojz_sec(blocks: Label, objects: Label, rings: Label, type_table: Label,
dict: int, dict_len: int) -> Sec` (aeon `act_descriptor.emp:223` at `6bd8ed89`), and each
section's preset is in the region table `OJZ_ACT1_REGION_ROWS` (`:508-518`):

    ojz_region(x0:    0, x1: 2047, y0:    0, y1: 2047, effects: OJZ_Preset_Sec0,  parallax: ojz_act1_sec_scene(sec: 0)),

Master's reader, run verbatim by a scratch instrument (esbuild bundle, node, the blobs dumped with
`git show`), returns `{}` there. Its control is the pre-regions pin `31c0ddd8`, where the same
instrument returns the nine bindings. So the defect row 178 recorded still holds at the target.

## aeon's answer, point by point

aeon's answer (`docs/reviews/2026-09-14-aeon-answer-sections-0-7.md`) was read at aeon
`eec81e48`. At `eec81e48` and `6bd8ed89` the four files it cites have the same blobs (`git
ls-tree`): act_descriptor `a25f55e7`, ojz_effects `86b630e9`, effects_gen `0ba8a14c`,
region_table `b01351de`. So every point below was checked at `6bd8ed89`, which is the same
bytes aeon read.

| # | aeon's claim | verdict | what I read |
|---|---|---|---|
| 1a | step 4 is `1a657990` and removed both `sec:` and `effects:` from `ojz_sec(...)` | CONFIRMED | `git log -1 1a657990`: "regions-p1 step 4: delete the section identity fields", sole parent `31c0ddd8`. The constructor at `6bd8ed89` `:223` has neither argument; at `31c0ddd8` `:228` it has both |
| 1b | so `descriptorEffectsBindings` (split on `ojz_sec(sec: N`) finds nothing | CONFIRMED | master's reader returns `{}` at `6bd8ed89` (above). Mutation M0 below restores master's reader and the currency rows go red |
| 1c | the binding is now `Region.rg_effects`, in the hand-authored const `OJZ_ACT1_REGION_ROWS` | CONFIRMED | `ojz_region()` returns `Region{ …, rg_effects: effects, … }` (`:478`); the const is `:508-518`, and its row for section 1 (`:510`) matches aeon's quoted line character for character |
| 1d | the section key is the `sec:` inside the row's `parallax:` sidecar call | CONFIRMED | all nine rows, `:509-517`: `parallax: ojz_act1_sec_scene(sec: N)` |
| 2a | in a region row `effects:` comes BEFORE `sec:` | CONFIRMED | on every row line, measured by the currency instrument row (it asserts `effects:` precedes `sec:` on each of the nine lines) |
| 2b | "split on sec:, search the following chunk for effects:" pairs every row with the NEXT row's preset | CONFIRMED at `6bd8ed89` | the scratch instrument's neighbour reader gives 0 to 7 each the next row's preset (0 to `OJZ_Preset_Sec1`, …, 7 to `OJZ_Preset_Plain`) and DROPS section 8. aeon's "section 8 to section 0's" is about its own step-1 tree and its "nearest `sec:` before" rule; neither was read here, so that part is NOT CHECKED, and it is not contradicted |
| 2c | aeon's reader pairs by enclosing call (balanced parens), in `tools/effects_gen.py` `section_preset_symbols` (~:570-600) with the comment at ~:434-447 | CONFIRMED as to location and method | `section_preset_symbols` is `:573-593`, the comment `:434-447`. It uses `_enclosing_call_span` and keeps a call only when `len(secs) == 1`. It never invents a key, but it also SKIPS a zero- or two-key call without a trace in its result; its comment says the caller refuses. That is a difference in shape, not a contradiction. My expectations were derived from the data, not from this code |
| 2d | the engine's own Region parser is `tools/region_table.py` | CONFIRMED to exist (blob `b01351de`); NOT READ | not needed for this fix |
| 3a | `OJZ_Preset_Sec0` binds `patched: OJZ_TwoChannel`; `OJZ_Preset_Sec7` binds `patched: OJZ_WorldWater` | CONFIRMED | aeon `ojz_effects.emp:1516` and `:1925`, both inside their own `preset(...)` call, found by two instruments (below) |
| 3b | the barred set is stated at `ojz_effects.emp:1707` | CONFIRMED that the line exists, and it is a COMMENT | `:1707` reads "so THE BARRED SET IS [0, 7]" inside a `//` block that ends "Derive the barred set from the `preset()` declarations … never from this prose" (`:1711-1712`). Not used as a source |
| 3c | region rows 0 and 7 bind those two presets, so once the reader pairs correctly 0 and 7 come back barred | CONFIRMED | rows `:509` and `:516`; measured barred set `[0, 7]` (below) |
| 3d | the map keyed by sidecar `sec:` is 0..8 = Sec0, Sec1, Sec2, Sec3, Depth, Sec5, Sec6, Sec7, Plain | CONFIRMED | the reader and the independent line instrument agree (below) |
| 4 | step 5 is NOT on `origin/master` | CONFIRMED at `6bd8ed89` | `git grep 'OJZ_Preset_Night\|Region; 10\|OJZ_NIGHT_X0' 6bd8ed89 -- games/sonic4 tools` exits 1. Positive control: the same `git grep` form counts `OJZ_ACT1_REGION_ROWS` 7 times in the descriptor at `6bd8ed89`. The table is `[Region; 9]` |
| 4 (rest) | step 5's row 9 shape, rows 1 and 2 shrinking, Night unbarred, lab row 37 | NOT CHECKED, by instruction | branch `parcel/regions-p2` was not read and its shape is not modelled |

**No claim is contradicted.** Nothing here changes the fix. There is nothing to tell aeon beyond
"confirmed" and the one difference in 2c.

## The derived section-to-preset map, and the barred set

Read from `OJZ_ACT1_REGION_ROWS` at `6bd8ed89`, by the reader and independently by
`regionRowsByLine` (one physical row line at a time):

| section | row line | preset | binds `patched:`? | arm |
|---|---|---|---|---|
| 0 | `:509` | `OJZ_Preset_Sec0` | yes, `OJZ_TwoChannel` (`ojz_effects.emp:1516`) | **barred** |
| 1 | `:510` | `OJZ_Preset_Sec1` | no | open |
| 2 | `:511` | `OJZ_Preset_Sec2` | no | open |
| 3 | `:512` | `OJZ_Preset_Sec3` | no | open |
| 4 | `:513` | `OJZ_Preset_Depth` | no | open |
| 5 | `:514` | `OJZ_Preset_Sec5` | no | open |
| 6 | `:515` | `OJZ_Preset_Sec6` | no | open |
| 7 | `:516` | `OJZ_Preset_Sec7` | yes, `OJZ_WorldWater` (`ojz_effects.emp:1925`) | **barred** |
| 8 | `:517` | `OJZ_Preset_Plain` | no | open |

**The barred-set derivation.** A section is barred exactly when the preset record ITS OWN ROW binds
passes a non-zero `patched:` in its `preset(...)` declaration. No list and no comment feeds it. In
the product, `libraryPatchedArmBindings` (declaration-to-declaration split, comments stripped)
gives `{OJZ_Preset_Sec0: OJZ_TwoChannel, OJZ_Preset_Sec7: OJZ_WorldWater}`, and
`armBarredSections` gives `[0, 7]`. In the test, `presetsBindingPatched` gets the same pair by a
different method: it balances each `data <Name>: EffectsPreset = preset(` call and looks for
`patched:` inside that span. The currency row asserts the two sets are equal, so `[0, 7]` is what
both methods measured, not a number anyone typed in.

The rest of the load's reading at `6bd8ed89`: `threadedBy` `{OJZ_Preset_Sec5: 5, OJZ_Preset_Sec6:
6}`, wired `[5, 6]`, own preset `[0..8]`, threaded `[5, 6]`; condition 1 is `yes` on all nine;
nothing is unkeyed or contested; the descriptor is `{parsed: true, read: true}`.

## The fix

`src/core/formats/effects/section-wiring.ts`, the READING THE DESCRIPTOR banner at `:183`:

- **`descriptorEffectsRows`** (`:335`) is THE reader. It masks `//` comments and string-literal
  contents, keeping offsets and newlines (`maskCommentsAndStrings`, `:285`). Then, for each
  `effects: <Name>`, it finds the innermost unclosed `(` before it and balances that call to its
  `)`, nested calls included. The row counts only when the callee is `<zone>_region` or `<zone>_sec`
  and the parentheses are not a `fn` declaration. The row's section keys are the distinct numeric
  `sec:` values inside that span.
  - **One key:** keyed.
  - **None, or several:** reported in `unkeyed` (preset, constructor, line, keys). Never assigned.
  - **Two keyed rows naming the same preset:** one binding. This is aeon `31c0ddd8`'s shape, which
    carries the `ojz_sec` rows and the region rows at once.
  - **Two keyed rows naming different presets:** reported in `contested`, bound to neither.
- **`descriptorEffectsBindings`** (`:380`) keeps its name and its return type, so the pinned rows are
  unchanged. It is now the bindings-only door, and it THROWS rather than return a smaller map
  whenever the descriptor has a row the map has no seat for.
- **`descriptorWiringSource`** (`:430`) and **`readDescriptorWiring`** (`:456`) are the load's whole
  descriptor step. `src/core/project/aeon/load.ts:786` now calls it and assigns three fields. The
  outcomes:
  - **A contested section, or a several-key row:** REFUSED. `parsed: false` with a reason naming the
    row, and no bindings published.
  - **No binding at all:** unparsed, with a reason saying whether rows without a key were found or
    no rows at all.
  - **A key-less row:** does NOT refuse, because it names no section and so cannot falsify any
    section's reading. It is carried on the wiring as `unkeyedRows` (`:166`).
- **`WiringSource.read`** (`:123`) marks a file whose bytes were read. When a read descriptor is
  not usable:
  - condition 1 says `read act_descriptor.emp; no usable section binding`;
  - the advisory says `Aurora read <path> but found no section binding it could use in it`;
  - neither says "could not read". An unread file still says `could not read <file>`, which is the
    wording `docs/guides/effects-first-run.md` quotes, and `scripts/check-guide-text.mjs` still
    finds it.
- **`55c2de28`, the rule change.** `sectionArmExclusivity` (`:908`) returns `unknown` when the
  descriptor is unparsed, and the unknown notice (`:976`) names the file that could not be used.

  Before this, an unusable descriptor gave every section a null record, and "no record is no arm"
  answered `open`. The notice spoke only for the library, so it stayed silent. That is how sections
  0 and 7 went live with no notice. It would also recur on this branch's own refusal path, because
  a refused read is an unusable descriptor.

  It is in its own commit because it amends a documented rule (the old sentence is quoted in the
  docblock, not deleted) and is not in the brief's property list. The controller can take or drop
  it. A PARSED descriptor under which a section binds nothing is still `open`.

**What this does NOT do.** It does not model a region-keyed binding. `unkeyedRows` is carried,
not rendered, and its seat is design Q8 (where `effectsRef` lives), owed to empyrean. Where a row
has no section key, no section control shows it.

## Tests

File `src/core/formats/effects/__tests__/section-wiring.test.ts`, 62 rows on master, 76 now.

- **7 synthetic reader rows** (block "the region-row reader"). Every fixture is labelled SYNTHETIC
  and claims nothing about aeon's step-5 file. They cover:
  - the pairing trap (keys out of order, plus one old-style row with its key first, so no
    argument-order rule passes);
  - a key-less row reported, not assigned, not dropped, and carried by the load;
  - a two-key row reported and the read refused;
  - a declaration is not a row;
  - a comment or string is not a row;
  - contested versus agreeing rows;
  - read-and-not-understood wording.
- **6 currency rows at `AEON_REGIONS_PIN`** (`6bd8ed8925d292d5f70f13ea24302161bef405bc`,
  committed, named in every failure message, read through `test/support/peer-repo.ts`). Each
  starts with a loud `ctx.skip('SKIPPED, NOT PASSED: … CANNOT MEASURE …')`, never `it.skip`, when
  the revision is unreachable. The rows:
  1. provenance: `COMMITTED OBJECTS`, the pin named;
  2. the second instrument saw the table: declared length equals row lines, one `effects:` and one
     `sec:` per line, `effects:` before `sec:`, distinct presets;
  3. the reader against the table: equal to the instrument's map, and to the literal reading,
     none unkeyed or contested;
  4. the pairing trap: each section binds the preset on its own row line;
  5. the load's reading is parsed: condition 1 answers on all nine, `ownPresetSections` is all
     nine, and no "could not read";
  6. sections 0 and 7 barred, and the barred set equal to the independent derivation, with every
     other section open WITH a record.
- **The eleven historical rows still read `AEON_PIN` `31c0ddd8`.** None was re-pointed and no
  expected value changed. Row 8 gained one anti-vacuous assertion (`d7c378ff`).
- **1 arm row** (`55c2de28`): "AN UNUSABLE DESCRIPTOR IS `unknown` TOO".
- `src/renderer/components/effects/__tests__/preset-rebind-orphan.test.ts` was NOT touched (a
  separate queue row).

## Red-first, every mutation on disk

Runner: `VITEST_MAX_WORKERS=4 npx vitest run src/core/formats/effects/__tests__/section-wiring.test.ts`.
Each mutation was applied by editing the committed file, and `git diff` naming the file was
printed before the run. The file was then restored with `git restore
--source=<committed sha> -- <file>`, and `git diff --stat` came back empty after every restore.
Baselines:
- `4f04d587` for M0 to M8 and the M9 control;
- `d7c378ff` for M9;
- `55c2de28` for M10, M11 and M11′ and the M12 control;
- `4ee10559` for M12.

| | mutation, as on disk | result | the red that matters, quoted |
|---|---|---|---|
| M0 | master's reader restored over the file (`git restore --source=98989d4b`, 25+ / 310-) | 11 failed / 64 passed | all 33 error lines are `TypeError: descriptorEffectsRows is not a function`. **NOT assertion-level**: it shows the 7 synthetic rows and the 4 currency rows that call the reader need the new code, not what they assert |
| M1 | before the reader's `return`: `const nb …; const parts = code.split(/\bsec\s*:\s*(\d+)/g); … return { bindings: nb, … }` (neighbour pairing) | 20 failed / 55 passed | currency pairing row: "section 0 (…act_descriptor.emp at 6bd8ed89… line 509) must bind OJZ_Preset_Sec0, the preset in its own row, not OJZ_Preset_Sec1 from line 510". Synthetic trap: `{0: 'ZZZ_C', 2: 'ZZZ_B', …}` vs `{0: 'ZZZ_B', 1: 'ZZZ_C', …}`. Currency barred: `[6]` vs `[0, 7]`. Currency load: `[0..7]` vs `[0..8]`. Plus 8 historical rows at `31c0ddd8` |
| M2a | `unkeyed.push({ ...row, sectionKeys: keys })` replaced by a comment (the row is dropped) | 4 failed / 71 | "the key-less row is REPORTED, with what a person needs to find it: expected [] to deeply equal [ { preset: 'ZZZ_Keyless', …(3) } ]"; the two-key row; the declaration control (`[]` vs `['Label']`); the read-and-not-understood reason |
| M2b | `if (keys.length === 1)` to `if (keys.length >= 1)` (the first of several keys) | 1 failed / 74 | the two-key row, `expected [] to deeply equal [ { preset: 'ZZZ_Two', …(3) } ]` |
| M3 | `head[1] !== undefined \|\|` removed (declarations read as rows) | collection failed, "no tests", exit 1 | `Error: descriptorEffectsBindings: 1 row names a preset with no section key (the first: the zzz_sec row at line 2, naming Label)`. The bindings door refused the synthetic fixture's `comptime fn zzz_sec(sec: int, effects: Label = 0)` while the tests were being collected. Red, but no row is attributed, so M3′ |
| M3′ | the declaration check lost for `_region` constructors only | 12 failed / 63 | "the declaration is not reported as a row: expected [ { preset: 'Label', …(3) } ] to deeply equal []"; the currency reader and load rows ("a row the reader could not key"); 9 historical rows refused by the door, "the ojz_region row at line 473, naming Label" (`31c0ddd8`'s declaration line) |
| M4 | `const code = desc` (no masking) | 1 failed / 74 | "a commented-out row binds nothing: expected { '0': 'ZZZ_A', '5': 'ZZZ_Ghost' } to deeply equal { '0': 'ZZZ_A' }" |
| M5 | contested replaced by `bindings[section] = rows[rows.length - 1].preset` (last wins) | 1 failed / 74 | "the rows that agree are one binding: expected { '0': 'ZZZ_A', '1': 'ZZZ_Other' } to deeply equal { '0': 'ZZZ_A' }" |
| M6 | `if (false && refusal !== null)` (the door returns the smaller map) | 2 failed / 73 | the key-less and contested rows, `expected [Function] to throw an error` |
| M7 | both wording sites: `w.descriptor.read === true ?` and `which.read === true` to `false` | 1 failed / 74 | "expected 'could not read act_descriptor.emp' to be 'read act_descriptor.emp; no usable se…'". That first failure hid the advisory assertion in the same row, so M7b |
| M7b | the advisory site alone | 1 failed / 74 | "expected 'Aurora could not read g/data/levels/z…' to contain 'Aurora read g/data/levels/zzz/act1/ac…'" |
| M8 | in `libraryPatchedArmBindings`, `if (hit && hit[1] !== '0') out[…] = hit[1]` to `void hit` (the `patched:` inference removed) | 12 failed / 63 | currency barred row: "the barred set disagrees with the sections whose own row binds a preset that passes patched:, derived independently from …act_descriptor.emp at 6bd8ed89…: expected [] to deeply equal [ +0, 7 ]"; historical 0 / 7 / barred set / comment stripper; the synthetic arm rows |
| M9 control | reader `return { bindings: {}, … }`, on `4f04d587` (row 8 not yet strengthened) | 42 failed / 33 passed | **"✓ SECTIONS 1 TO 4 ARE NOT BARRED"**: the vacuity, measured |
| M9 | the same, on `d7c378ff` | 43 failed / 32 | row 8: "section 1 binds no record in this reading, so "open" below would be the empty map's answer and would measure nothing: expected null not to be null" |
| M10 | `if (!w.descriptor.parsed) return … 'unknown'` removed from `sectionArmExclusivity` | 1 failed / 75 | "the record section 0 binds is unknown, so whether it binds an arm is unknown: expected 'open' to be 'unknown'" |
| M11 | the stamp's `mode: READ_MODES.COMMITTED` to `READ_MODES.WORKTREE` | **exit 0, 58 passed / 18 skipped. NOT RED** | every aeon row skipped loudly: `fixtureProvenance: mode "worktree" was given ref "<rev>"`. The provenance module refuses the contradictory stamp before any row runs. Last session's version of this plant also removed `ref`; mine kept it. So M11 proves the module refuses, not that the row catches, and M11′ replaces it |
| M11′ | the stamp's `ref` to `ref: AEON_PIN` (the stamp names the historical pin, whatever was read) | 1 failed / 75 | "the stamp does not name the pinned revision 6bd8ed8925d292d5f70f13ea24302161bef405bc" |
| M12 control | `AEON_REGIONS_PIN` to `9c45616d7197be3aa0cc549f646ff4f19bf1c216` (no region table there; `git grep -c` exits 1, against the positive control above), on `55c2de28` | 4 failed / 72 | **"✓ THE PAIRING TRAP: no section is given its neighbour's preset"**: zero rows seen, zero assertions. The load and barred rows went red only on incidental checks |
| M12 | the same, on `4ee10559` | 5 failed / 71 | the pairing, reader, load and barred rows each: "the second instrument saw no region rows in …act_descriptor.emp at 9c45616d…, so every loop over them in this row would assert nothing" |

**Every new or changed row goes red under at least one mutation, with its own assertion:**

| row | mutations that turn it red |
|---|---|
| synthetic pairing | M1 |
| key-less row | M1, M2a, M6 |
| two-key row | M1, M2a, M2b |
| declaration | M1, M2a, M3′ |
| comment or string | M1, M4 |
| contested | M1, M5, M6 |
| read-and-not-understood | M2a, M7, M7b |
| currency provenance | M11′ |
| instrument row | M12 |
| currency reader | M1, M3′, M12 |
| currency pairing | M1, M12 |
| currency load | M1, M3′, M12 |
| currency barred | M1, M8, M12 |
| row 8 | M9 |
| arm row | M10 |

**Two proof methods changed partway**, and both earlier claims were re-established:
- **M3 became M3′.** M3 was red but gave no row attribution.
- **M11 became M11′.** M11 was not red.

A third change was prompted by a control. The M12 control showed the pairing row passing
vacuously. So the guard in `4ee10559` was added, and M12 was re-run on top of it.

### If the pairing row went green for a reason other than correct pairing, what would that be?

1. **A positional reader.** "Zip the i-th `effects:` with the i-th `sec:`" would pass it at
   `6bd8ed89`, because the table is written in index order (row i has `sec: i`). This is the real
   answer, and the currency row cannot rule it out on this data. The SYNTHETIC pairing row does:
   its keys run 2, 0, 1 and its last row writes its key first. A positional reader fails it, and
   so does any argument-order rule, in either direction.
2. **The reader and the instrument sharing a defect.** Ruled out:
   - `regionRowsByLine` shares no code with the reader. It reads one physical line at a time.
   - The reader row also asserts the literal nine-preset reading, so both drifting together would
     be red.
3. **Adjacent rows naming the same preset**, so a shift lands on an equal value. Ruled out: the
   instrument row asserts the nine presets are distinct.
4. **The loop running zero times.** Measured, it happened (M12 control). It is now ruled out by
   `table()`.
5. **Reading the wrong bytes.** Ruled out: the provenance row names the pin (M11′), and the reads
   go through git objects at a resolved full SHA.
6. **A skip counted as a pass.** Ruled out: a skip is `ctx.skip` with the reason, and it is
   counted in the totals as skipped.

## The pinned rows do not read aeon's disk

Two controls:

- **Objects, no files.** A `git clone --shared --no-checkout` of aeon in a scratch directory
  (`ls -A` shows `.git` only), passed as `AEON_DIR`, gave **76 passed (76)**, exit 0. The three
  stamps each say `read mode : COMMITTED OBJECTS. git read the object database; the peer working
  tree was never opened`. They were asked for `31c0ddd8`, `6bd8ed89` and `origin/master` (which
  is `6bd8ed89` in that clone). Each says `aeon working tree : DIRTY, 1721 path(s) uncommitted`,
  which is what "no files on disk" looks like to it. Every aeon row passes with no aeon file to
  read.
- **No aeon at all.** `AEON_DIR` set to an empty scratch directory gave **58 passed | 18 skipped
  (76)**, exit 0. Every skip reads `SKIPPED, NOT PASSED: <dir> exists but is not a git checkout, so
  aeon at <rev> …`: 11 at `31c0ddd8`, 6 at `6bd8ed89`, 1 at `origin/master`. None passed.

## Full suite

`VITEST_MAX_WORKERS=4 npm test`, in the foreground, on `90f19730` (this branch's code plus this
packet), with `git status --porcelain` empty at the start. Totals:

- **Test Files:** 621 passed | 3 skipped (624)
- **Tests:** 9668 passed | 9 skipped (9677)
- **0 failed**, exit 0, 21:42:54 to 21:43:46 -0400 (vitest `Duration 34.05s`)

The chain is `&&`-joined, so vitest ran only after every pre-vitest gate and `tsc --noEmit`
exited 0. Each of these printed its own OK or pass line in the output:
- check-test-collection
- check-pseudo-skip
- check-peer-path-literals
- check-cited-paths
- check-doc-citations
- check-object-stringify
- check-tsx-dashes
- check-src-dashes
- check-test-dashes
- check-guide-text
- check-prose-constants
- check-scripts-dashes
- check-ledger-timestamps
- check-python-resolver

`scratchpad/check-harness-guards.mjs` passed by the chain; I did not find its own line in the
output.

Seventeen output lines contain the word "failed". Every one is a test title or a toast string from
a test that exercises a failure path, and no line begins `FAIL`. The 9 skipped tests are not this
file's: in this run it counted 76 tests.

## UI, for the controller (not run here: no CDP, no Electron)

The node suite cannot see React (review bar 1). What to check on screen, against a writable copy
of aeon materialised at `6bd8ed89` (`git archive`):

1. **[UI-1] BandPresetPanel, section 0.** Open the effects tab, RASTER BAND PRESETS, Section 0.
   Check:
   - the raster preset select is DISABLED;
   - the warning hint `[data-effects-arm-refusal]` (`src/renderer/components/effects/BandPresetPanel.tsx:536`)
     reads "Section 0 binds the preset record OJZ_Preset_Sec0, which passes patched:
     OJZ_TwoChannel. aeon's preset() refuses a raster: beside a patched: …";
   - no `[data-effects-arm-unknown]` notice (`:550`) is shown.

   On master against post-regions aeon this select was live, with no hint.
2. **[UI-2] The same for section 7**, naming `OJZ_Preset_Sec7` and `OJZ_WorldWater`.
3. **[UI-3] Sections 1 to 6 and 8.** The select is ENABLED, with no refusal hint and no unknown
   notice.
4. **[UI-4] The SectionPicker strip.** Check:
   - condition 1 reads `✓ own preset OJZ_Preset_SecN` (row at
     `src/renderer/components/effects/SectionPicker.tsx:335`), not `? could not read
     act_descriptor.emp`;
   - the act-sets line `[data-effects-act-sets]` (gated at `:379`) is drawn again, with own
     preset 0 to 8 and threaded 5,6.
5. **[UI-5] A barred section with something already bound stays LIVE** until it is unbound, then
   greys. `scratchpad/section-raster-select-harness.mjs` (`npm run harness:section-raster-select`)
   plants a leftover `rasterRef` in section 0's sidecar, so its section-0 rows now meet a barred
   section that is bound. Read those rows; any change against master is this parcel.
6. **[UI-6] A descriptor made unreadable** (the strip harness's case 4b,
   `scratchpad/effects-section-strip-harness.mjs`, `npm run harness:effects-section-strip`). After
   `55c2de28` the band preset panel ALSO shows `[data-effects-arm-unknown]` for every section:
   "Aurora could not read games/sonic4/data/levels/ojz/act1/act_descriptor.emp (…), so it could not
   check whether section N's preset record binds a patched: program…". Case 4b asserts only the
   select enabled and the strip's own advisory, so it should stay green; the new notice is
   unasserted.

**Existing harness coverage.**
- **Covered:** `scratchpad/band-preset-harness.mjs` (`npm run harness:band-preset`) and
  `scratchpad/section-raster-select-harness.mjs` drive the band preset panel.
- **Covered:** `scratchpad/effects-section-strip-harness.mjs` drives the strip.
- **NOT covered:** no committed harness mentions `data-effects-arm-refusal` or
  `data-effects-arm-unknown`. This was checked by grep over `scratchpad/`, with
  `data-effects-section-advisory` as the positive control, found in 4 harnesses. So the refusal
  sentence and the unknown notice on screen are asserted by nothing today.

## Left open

- **aeon's step 5**, `parcel/regions-p2`, which adds a region row with no `sec:`. It is measured
  against the file when aeon pushes, by re-pinning `AEON_REGIONS_PIN`. Expected, not measured:
  - the reader lists that row in `unkeyedRows` and keeps the descriptor parsed;
  - the currency instrument row goes RED on "exactly one sec:" for the new line, which forces the
    re-measure rather than passing over it.
- **Where a binding that belongs to no section is shown**: design Q8 (where `effectsRef` lives),
  owed to empyrean.
- **The UI checks above**, for the controller.

## Noticed, left alone

1. `src/renderer/components/effects/__tests__/preset-rebind-orphan.test.ts` still reads aeon's
   live tree. That is a separate queue row.
2. **Masking is exercised only by the synthetic fixture.** M4 reddened no row that reads aeon:
   aeon's comments at both pins happen not to contain `effects: <Identifier>`.
3. **Dotted preset paths are misread.** A dotted preset path (`effects: games.sonic4.x.OJZ_Preset_Sec0`)
   would bind its first segment. aeon's `_SEC_EFFECTS` has the same limit. No aeon file at either
   pin writes one.
4. **Last-wins (M5) is invisible to aeon's real files.** At `31c0ddd8` both row forms agree, so
   only the synthetic row sees it.
5. **Stale test comments.** The GUARD-SEAT-RESIDUE comments in the test file describe the OLD
   split anchor ("TWO clauses"). The rows still pass, because the callee filter matches
   `<zone>_sec` exactly, but those comments' account of the mechanism is now out of date.
6. **A latent coupling.** `sectionExtraChannelsCondition` reads `w.bindings` without checking
   `descriptor.parsed`. It is harmless because a refused or unparsed read publishes `{}`.
7. **The provenance row passes whatever the pin is.** It names whatever `AEON_REGIONS_PIN` says,
   so M12 left it green. M11′ is its proof.

## Standing invariants

- No emulator.
- No `cargo`.
- aeon and every sibling repo unmodified. aeon was read only through `git show`, `git log`, `git
  ls-tree`, `git grep` and `git rev-parse`. The one clone was made in a scratch directory, outside
  both repos.
- No Co-Authored-By trailer.
- `git branch --show-current` checked before every commit.
- Exact paths staged.
