# SECTION-WIRING-OFF-LIVE-AEON: the section-wiring rows read a pinned aeon revision, never aeon's working tree

2026-09-13. Branch `fix/section-wiring-off-live-aeon` off master `09e8675f`. Commits `e9131701`
(the test) and this packet's commit. Governing bar: `docs/OVERSEER-REVIEW-BARS.md` bar 19, "A
TEST MUST NOT READ A PEER REPO'S WORKING TREE". File:
`src/core/formats/effects/__tests__/section-wiring.test.ts`.

## The defect, confirmed

Master `09e8675f`, that file alone, against aeon's checkout at `55c062a4` (its HEAD and its
`origin/master`; the one dirty path in that aeon checkout was `docs/lane-status.json`):
**8 failed | 54 passed (62)**, exit 1. The eight:

1. every section 0-8 binds a preset record (`expected [] to deeply equal [0..8]`)
2. ALL NINE sections now own their preset: nothing is shared any more (`expected [] …`)
3. exactly TWO sections are threaded today (`expected [] to deeply equal [5, 6]`)
4. THE COLD READ REPRODUCED: section 5 is ✓ ✓ ✗ (`section 5 owns its preset: expected 'no' to be 'yes'`)
5. THE RULING APPLIED: section 0 is barred (`expected 'open' to be 'barred'`)
6. SECTION 7 IS BARRED TOO (`expected 'open' to be 'barred'`)
7. the barred set is DERIVED, and it is not "0 to 4" (`expected [] to deeply equal [0, 7]`)
8. SECTION 3 IS FREE (`its preset record is its own: expected 'no' to be 'yes'`)

Master's file built its aeon paths with `join(siblingPathOrUnresolved('aeon'), …)` (master `:43-46`)
and read them with `readFileSync` (`:508-509`, `:1056-1057`, and aeon `tools/effects_gen.py` at
`:682-690`): the aeon lane's live checkout.

**The cause, confirmed.** aeon `1a657990` (2026-09-13 13:27, "regions-p1 step 4: delete the
section identity fields") rewrote aeon's act 1 descriptor: `ojz_sec(sec: int, …, effects: Label)`
became `ojz_sec(blocks: …)` with neither argument, and each section's preset moved to the region
table, `ojz_region(x0: …, effects: OJZ_Preset_Sec0, parallax: ojz_act1_sec_scene(sec: 0))` (aeon
`origin/master` act_descriptor.emp `:508-517`). `descriptorEffectsBindings` splits on
`ojz_sec(sec: N` (`src/core/formats/effects/section-wiring.ts:178`), so it now finds nothing and
returns `{}`. The bisect below shows the eight go red at exactly `1a657990` and are green at its
parent.

## The pin, derived from `git log`

Read-only, `git -C` on aeon:

- `git log -- <act_descriptor.emp> <ojz_effects.emp> <tools/effects_gen.py>`: the newest commit
  touching any of the three is `1a657990`. `git log 1a657990..origin/master` over the same paths is
  empty; `origin/master` is 29 commits past it.
- `git log -1 --format=%P 1a657990`: one parent, `31c0ddd834821c5c89f808a9051957c4cf793b3b`.
  `git merge-base --is-ancestor 1a657990 origin/master`: exit 0.
- `git ls-tree` over the three aeon paths: at `31c0ddd8` and at `b048f571` (the last commit to
  touch them before regions step 4) the blobs are identical, act_descriptor `cf8a860b`,
  ojz_effects `1506943c`, effects_gen `67f5f2db`; at aeon `origin/master` they are `a25f55e7`,
  `86b630e9`, `0ba8a14c`.

So `31c0ddd8` is the newest aeon revision that carries the pre-regions blobs, and every later
revision carries the deletion. Then the real rows were run at each candidate: an uncommitted
copy of the committed test with only `AEON_PIN` swapped, run by vitest with the JSON reporter,
and deleted afterwards (a scratch script, not committed; the copy was confirmed removed).

| aeon revision | date (-0400) | whole file | rows failed in the two aeon blocks (12 rows) |
|---|---|---|---|
| `55c062a4` (`origin/master`) | 09-13 19:18 | 54 passed, 8 failed | 8, the eight above |
| `1a657990` | 09-13 13:27 | 54 passed, 8 failed | 8, the eight above |
| **`31c0ddd8`** | 09-13 13:06 | **62 passed** | **0** |
| `b048f571` | 09-13 13:02 | 62 passed | 0 |
| `1057b29b` | 09-13 12:33 | 62 passed | 0 |
| `d6d9636f` | 09-13 12:21 | 62 passed | 0 |
| `357c0b5e` | 09-13 06:37 | 62 passed | 0 |
| `e307021a` | 09-12 19:33 | 62 passed | 0 |
| `39d5c55c` | 09-12 19:08 | 62 passed | 0 |
| `a4819d15` | 09-12 03:54 | 62 passed | 0 |
| `38c63452` | 09-11 20:49 | 62 passed | 0 |
| `9c45616d` (the `[0, 7]` ruling) | 09-10 06:16 | 62 passed | 0 |
| `4cec8e39` (`9c45616d^`) | 09-10 06:10 | 62 passed | 0 |

The channel TABLE row reads aeon `origin/master` in every run (below), so it does not vary down
this column. **Pinned: `31c0ddd834821c5c89f808a9051957c4cf793b3b`**, stated with this derivation
at `AEON_PIN`'s docblock in the file.

## The fix, `e9131701` (1 file, +222 / -81)

- `openAeonAt(ref)`: `peerRepo`, `resolveRev` and `announceFixture` in COMMITTED mode with no
  allowance, from `test/support/peer-repo.ts` and `scratchpad/lib/fixture-provenance.mjs`, the
  shape `src/core/formats/__tests__/raster-binding-threaded-set.test.ts` already uses. No aeon
  checkout, a directory that is not a git checkout, and a revision that does not resolve are
  three separate reasons, each a loud `ctx.skip("SKIPPED, NOT PASSED: …")`. **Nothing falls back
  to the working tree.**
- `readAeon`: `readAtRev`. An absent path at a resolved revision throws, because that is a
  measurement and not a failure to look.
- The eleven historical rows read `git show 31c0ddd8:<path>` for aeon's act_descriptor.emp and
  ojz_effects.emp. The `path` fields of their wirings now say `aeon:<path>@31c0ddd8`.
- **The channel TABLE row reads aeon `origin/master` through git objects, not the pin.** It asks a
  currency question ("still matches aeon's SECTION_CHANNELS"), and bar 19 says a pinned blob can
  never answer one. Its messages now name the ref and the resolved SHA and begin
  `NOT AN AURORA REGRESSION`.
- **No expected value changed.** The one row whose assertions changed is the provenance row,
  because they were about the read mode itself. It asserted `WORKING TREE` and "does NOT name the
  bytes this run read". It now asserts `COMMITTED OBJECTS`, the pin's SHA, "A full SHA, so it
  cannot move under the caller", "WHICH BYTES this run consumed", and the absence of
  `PROVENANCE INCOMPLETE`. Each string is the module's own (`scratchpad/lib/fixture-provenance.mjs`
  `:306`, `:317`, `:329`, `:384`).
- The file's header now says what the pinned rows no longer cover: whether the parser reads aeon's
  CURRENT files. It does not (below), and that currency row belongs to the REGIONS work.

## Each row, now

| # | row | reads | result |
|---|---|---|---|
| 1 | the run SAID which aeon REVISION these numbers are, and that revision NAMES the bytes (was "…and that HEAD does not name them") | the pin's stamp | PASS |
| 2 | every section 0-8 binds a preset record | aeon at the pin | PASS (one of the 8) |
| 3 | ALL NINE sections now own their preset | aeon at the pin | PASS (one of the 8) |
| 4 | exactly TWO sections are threaded today | aeon at the pin | PASS (one of the 8) |
| 5 | THE COLD READ REPRODUCED: section 5 is ✓ ✓ ✗ | aeon at the pin | PASS (one of the 8) |
| 6 | the channel TABLE still matches aeon's SECTION_CHANNELS | aeon `origin/master` (`55c062a4`), committed | PASS |
| 7 | THE RULING APPLIED: section 0 is barred | aeon at the pin | PASS (one of the 8) |
| 8 | SECTIONS 1 TO 4 ARE NOT BARRED | aeon at the pin | PASS |
| 9 | SECTION 7 IS BARRED TOO | aeon at the pin | PASS (one of the 8) |
| 10 | the barred set is DERIVED, and it is not "0 to 4" | aeon at the pin | PASS (one of the 8) |
| 11 | SECTION 3 IS FREE | aeon at the pin | PASS (one of the 8) |
| 12 | the comment stripper is EXERCISED by aeon's real file | aeon at the pin | PASS |

**None STOPPED.** All eight hold at the pin with their expected values unchanged.

## Red-first, each mutation on disk

Each mutation was applied to the committed file and its line quoted from disk, with `git diff
--stat` showing 1 file, +1 / -1. The file was then run. It was restored with `git restore
--source=e913170122fc4831229a23902789634f0beffb8d -- <file>`, and `git diff --stat` came back
empty after every restore. Runner: `VITEST_MAX_WORKERS=4 npx vitest run
src/core/formats/effects/__tests__/section-wiring.test.ts`.

| | mutated line, as quoted from disk | run | red rows (numbering above) |
|---|---|---|---|
| M1 | `:150 peer: 'aeon', mode: READ_MODES.WORKTREE, dir,` | 1 failed / 61 passed | 1, `…to contain 'COMMITTED OBJECTS'` |
| M2 | `:99 const AEON_PIN = '1a6579903e20aecd9b51ef295d5a975b2af96959';` | 8 failed / 54 passed | 2, 3, 4, 5, 7, 9, 10, 11 |
| M3a | `:193 … readAeon(pinned, LIB_REL).replace('UNBINDING \`patched: OJZ_TwoChannel\`', 'UNBINDING it')` | 1 failed / 61 passed | 12 |
| M3b | `:193 … readAeon(pinned, LIB_REL).replace('OJZ_Preset_Sec1:  EffectsPreset = preset(', '…preset(patched: OJZ_TwoChannel, ')` | 3 failed / 59 passed | 8 (`section 1 is not structural: expected 'barred' to be 'open'`), 10 (`[0, 1, 7]` vs `[0, 7]`), 12 (three records bind an arm) |
| M4 | `:105 const AEON_TIP = '1aba091a^';` | 1 failed / 61 passed | 6, `NOT AN AURORA REGRESSION: aeon's SECTION_CHANNELS table could not be located in aeon:tools/effects_gen.py at 1aba091a^ (753a7c93…)` |

Every one of the 12 rows goes red under at least one mutation. The expectations were derived,
not predicted after the fact. M2's reds are exactly the eight measured on master against the live
tree. M3b plants `patched:` into the record section 1 binds at the pin (`OJZ_Preset_Sec1`, aeon
`31c0ddd8` ojz_effects.emp `:1554`), so arm exclusivity has to bar section 1, grow the barred
set, and add a third arm record. M4 points the currency row at the last aeon revision before
SECTION_CHANNELS existed in its current form (`1aba091a`, per `git log -G'SectionChannel\('`), so
the table cannot be found.

## The repaired file does not read aeon's working tree

Every run prints the resolved checkout and `read mode : COMMITTED OBJECTS. git read the object
database; the peer working tree was never opened`, `ref asked for : 31c0ddd8…`, `revision :
31c0ddd8…`, and a second stamp for the currency row with `ref asked for : origin/master`,
`revision : 55c062a4…`. Three runs, with master's file as the control:

| aeon checkout the run resolved | master's file (`09e8675f`) | this branch (`e9131701`) |
|---|---|---|
| aeon's live checkout, post-regions files on disk | 8 failed / 54 passed | **62 passed** |
| a `git clone --shared --no-checkout` of aeon in a scratch directory, passed as `AEON_DIR`: aeon's object database and **no working files at all** (`ls -A` shows `.git` only; the stamp reads `aeon working tree : DIRTY, 1703 path(s) uncommitted`) | 50 passed / 12 skipped | **62 passed** |
| no aeon: `EMPYREAN_SUITE_ROOT` = an empty directory | not run | 50 passed / 12 skipped, each `SKIPPED, NOT PASSED: no aeon checkout at …/aeon (resolved by …` |

Row two is the proof. A checkout with no aeon file on disk turns every row green, so the rows
cannot be reading aeon's disk. The same checkout makes master's file skip all 12, because it
needed those files. Row three keeps the old behaviour for a missing peer: a loud skip, never a
pass.

## Measured, not fixed: Aurora against aeon `origin/master` after regions

The instrument is node over `section-wiring.ts` bundled with esbuild. It builds the wiring call for
call as `src/core/project/aeon/load.ts:766-815` does, and reads aeon through `git show
<rev>:<path>`. **Control:** at aeon `31c0ddd8` the same script returns the nine bindings, wired
`[5, 6]` and barred `[0, 7]`, so the empty answer below is a reading, not a blind instrument.

**What the reader returns at aeon `origin/master` `55c062a4`:**

- `descriptorEffectsBindings` returns `{}` (`src/core/formats/effects/section-wiring.ts:178`).
- `src/core/project/aeon/load.ts:772-777` therefore sets `descriptor: {parsed: false, reason: "no
  ojz_sec(sec: N, … effects: …) records were found in it"}`.
- The library still parses: `threadedBy` `{OJZ_Preset_Sec5: 5, OJZ_Preset_Sec6: 6}` and
  `patchedArm` `{OJZ_Preset_Sec0: OJZ_TwoChannel, OJZ_Preset_Sec7: OJZ_WorldWater}`, the same as
  at the pin.
- **Nothing throws.** The load-equivalent and all nine per-section calls returned normally.

| section | state | condition 1 | condition 2 | arm | control disabled (nothing bound) |
|---|---|---|---|---|---|
| 0 | unknown | unknown | no | **open** (pin: barred) | **false** (pin: true) |
| 1-4 | unknown | unknown | no | open | false |
| 5, 6 | unknown (pin: wired) | unknown | yes | open | false |
| 7 | unknown | unknown | no | **open** (pin: barred) | **false** (pin: true) |
| 8 | unknown | unknown | no | open | false |

Every set comes back empty, where the pin gives the values after the arrows: eligible (`[0..8]`),
wired (`[5, 6]`), own-preset (`[0..8]`) and barred (`[0, 7]`). The threaded set is still `[5, 6]`.

**What a person sees in the effects facet: mixed. The effects half is an honest "unknown", but it
names the wrong cause. The structural half is a silently wrong "open".**

- **Condition 1 and the state word say `unknown`, never `no`,** so nothing is falsely refused.
  The condition row (`src/renderer/components/effects/SectionPicker.tsx:335`) says "could not read
  act_descriptor.emp" (`section-wiring.ts:453-454`). The advisory (`section-wiring.ts:372-376`) says
  "Aurora could not read games/sonic4/…/act_descriptor.emp … (no ojz_sec(sec: N, … effects: …)
  records were found in it)". The file WAS read; only the parenthetical is true.
- **Condition 2 is still correct**, because it reads the library: sections 5 and 6 are threaded.
- **The act-sets line disappears.** It is gated on `descriptor.parsed`
  (`SectionPicker.tsx:379`), so the `own preset · threaded · bound` line is not drawn at all.
- **Arm exclusivity is silently wrong.** `sectionArmExclusivity` (`section-wiring.ts:608-615`)
  answers `unknown` only when the LIBRARY is unread. With the library read and no bindings, every
  section's record is null, so every section is `open`. Sections 0 and 7 therefore turn from
  barred to open. `sectionBindingControlDisabled` (`:708-711`) returns false, and
  `src/renderer/components/effects/BandPresetPanel.tsx:332-338` shows no refusal. The unknown
  notice returns null for all nine sections (measured). At aeon `origin/master`, aeon's region rows 0 and 7 still
  bind `OJZ_Preset_Sec0` and `OJZ_Preset_Sec7` (aeon act_descriptor.emp `:509`, `:516`), and both
  still bind `patched:`. So the one control this surface disables goes live on the two sections
  aeon's `preset()` still refuses, and nothing on screen says the check could not be made.

This belongs to the REGIONS work, which is sequenced separately. No product file was changed.

## Suite and gates

- `tsc --noEmit` exit 0. All 15 pre-vitest gates `npm test` chains exit 0 on `e9131701`:
  check-test-collection, check-pseudo-skip, check-peer-path-literals, check-cited-paths,
  check-doc-citations, check-object-stringify, check-tsx-dashes, check-src-dashes,
  check-test-dashes, check-guide-text, check-prose-constants, check-scripts-dashes,
  check-ledger-timestamps, check-python-resolver, and scratchpad/check-harness-guards.
- Full `VITEST_MAX_WORKERS=4 npm test`: SUITE-TOTALS-PENDING

## Noticed, not fixed

1. **Row 8, "SECTIONS 1 TO 4 ARE NOT BARRED", passes vacuously on an empty binding map.** On master
   against aeon after regions it was GREEN among the eight reds, because `open` is what
   `sectionArmExclusivity` answers for a section with no record. It has no assertion that
   sections 1 to 4 bind anything. At the pin it is live (M3b turns it red). I did not strengthen
   it, because adding an assertion is outside this parcel.
2. **The same bar-19 shape, still green:** `src/renderer/components/effects/__tests__/preset-rebind-orphan.test.ts`
   builds aeon paths with `join(siblingPathOrUnresolved('aeon'), …)` at `:42-47` and reads them with
   `readFileSync` at `:140`, `:182`, `:191` and `:207`. Not touched. Two other files matched the
   search (tests naming `siblingPathOrUnresolved('aeon')` that use `readFileSync` and never
   `readAtRev` or COMMITTED mode). `test/formats/effects-preset-base-swap.test.ts` says at `:428`
   that it moved off aeon's live tree on 2026-09-04. I did not trace
   `src/renderer/state/__tests__/switch-window-edit.test.ts`.
3. **The `unknown` wording says "could not read" for a file that was read and did not parse**
   (`section-wiring.ts:374`, `:454`, fed by `load.ts:774-777`). The REGIONS work may want to tell
   "unread" apart from "unparsed".
4. In aeon, region row 4 binds `OJZ_Preset_Depth`, not `OJZ_Preset_Sec4`. It already did at the
   pin (`bindings[4]`), so this is not a regions change, and no row here asserts `b[4]`.

## Left open

- **Does Aurora's reader handle aeon's CURRENT act 1?** No (above). This file deliberately does not
  check it, and its header says so. The REGIONS parcel owes that currency row, reading aeon
  `origin/master`, when it re-points the reader at `OJZ_ACT1_REGION_ROWS`.
