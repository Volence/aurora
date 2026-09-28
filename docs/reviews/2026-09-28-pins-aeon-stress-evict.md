# Aeon pins re-measured after the stress-evict fix (2026-09-28)

Branch `parcel/pins-aeon-stress-evict`. There are two commits: 92a3c5c4 re-pins the clip markers and
1fd7d89d re-vendors the engine constants. This page is the report. **One item is BLOCKED (section 6).
After this branch, 4 tests stay red.**

## 1. Why master was red

Aeon merged fix/stress-evict-pins-at-clamp at b8e0de6a (branch tip 925ee395). Aurora master
2226c4da then had 7 failing tests: the six "each pinned input at aeon origin/master is the blob it
was captured from" rows in `test/formats/clip-tool-outputs.test.ts`, plus the engine_constants row
in `test/formats/aeon-fixture-currency.test.ts`. None of them is an Aurora regression.

## 2. Aeon's claimed path list, re-derived

`git diff --name-status b2b5db52 925ee395` covers the fix's own commits (f38b2766, edf04aa0,
925ee395). It lists 18 paths. They match aeon's list, with four additions it left out:
`tools/keepalive_manifest.toml`, three `tools/test_*.py`, and aeon's DEFERRED_WORK and
ENGINE_ARCHITECTURE docs. Aeon's "fg_working_set.py: a define() on the constant reader" holds: the
diff adds `ConstantSource.define` and nothing else. The constants file is "comments only", and that
also holds (section 7).

**Aeon's list is incomplete for the markers.** Between the previous pin (70027733) and 925ee395
there are 35 changed paths. One of them is `games/sonic4/data/clips/s2_woven/clips.json`, blob
3d53fccd -> 06e546af. It was changed by aeon fd9948b9 ("s2_woven: both Metropolis pieces name
SONG_S2_MTZ"), which merged at 54346234 and is not part of the stress-evict landing. Two markers pin
that file.

**No clip-act output carries `pinned_stress_evict`.** A grep of aeon at 925ee395 finds the field in
three places:
- written by `ojz_strip_gen` into the OJZ page sidecar `ojz_act_pool_manifest.json`;
- read by `elect_pool_pages`, `verify_level_bin` and `clip_rom_bake` (the ROM build's per-clip copy
  of that sidecar);
- used in aeon's tests.

`clip_act_bake` does not write it, and none of the three bake out dirs contains it (grep of the out
dirs is empty). The bake's actual output change is a different field, `budget_name` (section 4).

## 3. The pin

I ran `git log -1 --format=%H origin/master --` over every pinned path that moved since 70027733.
The moved paths are:
- the s2_woven clips.json;
- `tools/fg_page_order.py`, `tools/fg_working_set.py` and `tools/ojz_strip_gen.py`;
- `engine/system/constants.emp`;
- `games/sonic4/data/generated/ojz/act1/DONOR_PROVENANCE.json`.

The command gives **925ee395** (925ee3955773463f8672dc684407b7746a092e3c). That is a non-merge commit
with parent edf04aa0. It is also the only commit since 41697d36 that touches the constants file, so
no earlier pin would do. origin/master was 936439fa, and 925ee395..936439fa changes only aeon's
lane-log and lane-status files. All six markers moved together from 70027733 to 925ee395.

## 4. Per marker

The method follows each marker's `re_measure`:
1. `git archive` of 925ee395, extracted into `$HOME/.cache/aurora-revendor-aeon/tree`.
2. `tools/s2_zone_convert.py convert --all-six`: exit 0, 6 zones, 2219040 cells, 0 differing, 0 FAILED.
3. Every `fixture.command` re-run from that copy, with EMPYREAN_SUITE_ROOT exported.

The bake out dirs are `$HOME/.cache/aurora-revendor-aeon/bake_<name>`, because the clipact's
`tileset_file` records its out dir relative to the tree. My first control used `scratch/bake_*` and
showed that path in the diff, so I re-ran it with the right dirs.

| marker | pins moved | output bytes |
|---|---|---|
| bake-json.cases | revision, fg_page_order, fg_working_set, ojz_strip_gen | byte-identical (3d546d25...) |
| paste-music.cases | revision, fg_working_set, ojz_strip_gen | byte-identical (af3b6164...) |
| s2_ehz_cpz.clipact | revision, fg_page_order, fg_working_set, ojz_strip_gen | RE-VENDORED 9723205b... -> 389b319b... |
| s2_two_clip.clipact | same as s2_ehz_cpz | RE-VENDORED f1da7066... -> 31ca5752... |
| s2_woven.clipact | same, plus the s2_woven clips.json | RE-VENDORED 016323dd... -> 8785cdd1... |
| validate-json.cases | revision, s2_woven clips.json, fg_working_set, ojz_strip_gen | RE-VENDORED 069c7f28... -> 6cad0cec... |

Every changed byte, explained:

- **`budget_name: "PAGE_FRAMES"`** is added to `verdict_at_placement` and `verdict_at_recount` in
  all three clipacts. The source is f38b2766: `fg_page_order.budget_verdict` now returns
  `budget_name`, which is PAGE_FRAMES unless a caller passes the STRESS_EVICT clamp.
  `clip_act_bake` writes `pl["verdict"]` and the recount dict verbatim.
- **s2_woven `clips[2].music` (mtz_west) and `clips[4].music` (mtz_east)** change from null to
  `"SONG_S2_MTZ"`. The source is fd9948b9's two new manifest rows, copied by `Clip.as_json`. Beside
  these, the manifest `note` is rewritten to name the songs, and no other key moves (compared as
  JSON with note and music masked). The clipact does not carry the note.
- **validate-json**: each of the four s2_woven cases' `manifest` gains the two MTZ music rows and
  aeon's rewritten `note`. Each note is equal to the note in aeon's clips.json at 925ee395. Every
  case's exit, stdout and stderr is byte-identical.
- **Wall-clock seconds** differ run to run (see section 5):
  - s2_ehz_cpz: 0.04 -> 0.045
  - s2_two_clip: 0.086 -> 0.081 and 0.058 -> 0.054
  - s2_woven: 0.457 -> 0.433 and 0.214 -> 0.187

Line diffs against the vendored file: s2_ehz_cpz 1 changed + 2 inserted lines, s2_two_clip 2 + 2,
s2_woven 4 + 2. The s2_woven pool is unchanged (2894 tiles, 49 pages). The bake's stdout and stderr
match the control except for seconds.

**Aurora's reader and the new field.** Aurora parses clipact.json in `src/renderer/state/donor-paste.ts`
as `Record<string, unknown>`. It reads the pool lists in `src/core/formats/donors/clipact-pool.ts`,
which names an unknown key only when it is a `pool.per_*` list. It reads
`verdict_at_placement.{worst,frames,over}` in `src/renderer/components/donors/DonorPasteSection.tsx`,
all three optional. None of these is a closed schema over the verdict dicts, so `budget_name` is
ignored rather than refused. Aurora reads no OJZ page sidecar: a grep of `src/` for
`ojz_act_pool`, `pm_flags`, `pool_manifest` and `pinned_stress` is empty. **No reader refuses
aeon's new output**, so this part is not BLOCKED.

## 5. Jitter control

I re-ran all six commands at the OLD pin 70027733, from a fresh archive at the same path with the
same out dirs:
- The three bundles are byte-identical to the vendored bytes.
- The clipacts differ only in seconds: s2_ehz_cpz 0.043; s2_two_clip 0.075 / 0.05; s2_woven
  0.417 / 0.184.
- The control output has no `budget_name` and no SONG_S2_MTZ.

So the seconds are run-to-run jitter, and the budget_name and music fields come from the new
revision.

## 6. Closure audit, and the BLOCKED value pin

**New module.** At 925ee395, `fg_page_order.committed_placement` does `import elect_pool_pages`.
That import is inside the function, but the test's static closure still sees it. Its callers are
`check` and `check --stress-evict`.

I ran an audit hook: a `sitecustomize` on PYTHONPATH that logs every `open` under the copy and
`sys.modules` at exit. It covered the conversion and all six commands at 925ee395, 33 processes.
- It never loaded `elect_pool_pages.py`.
- It never opened `ojz_act_pool.emp`, `ojz_act_pool_manifest.json`, vram.toml, map.toml or any
  sound file.
- Of the 35 aeon-changed paths, it opened or loaded exactly five: the s2_woven clips.json, the
  constants file and the three moved tools.

Positive control: I ran one process under the same hook that calls `fg_page_order.check()` in both
shapes. It is logged loading `tools/elect_pool_pages.py` and opening `ojz_act_pool.emp`. It prints
`pins [0, 1, 7, 8]` against 9 frames (PAGE_FRAMES_CLAMP) for the stress shape, and PAGE_FRAMES_CLAMP
is 12 at define 0 and 9 at define 1. I added `tools/elect_pool_pages.py` to `closure_not_loaded` in
all six markers. Before that, the closure row was red in all six on exactly that module.

**BLOCKED: PAGE_FRAMES_CLAMP cannot be pinned by value.** At 925ee395,
`fg_page_order.load_budget_constants` resolves `PAGE_FRAMES_CLAMP = PAGE_FRAMES - STRESS_EVICT *
(PAGE_FRAMES - STRESS_EVICT_FRAMES)` unconditionally, with STRESS_EVICT set through
`ConstantSource.define`. `clip_act_bake` calls that function, so four markers read the constant:
bake-json, s2_ehz_cpz, s2_two_clip and s2_woven. The row "the constants pinned by value are every
one its loaded modules name" now finds PAGE_FRAMES_CLAMP named as a whole string literal. There are
two ways to satisfy that row, and neither can be done honestly:

- **List it in `names_not_read`.** That would be false, because the runs read it. The format also
  needs a `because_not_opened` data file, and no such file exists here.
- **Pin it by value.** `EmpReader` in `test/support/emp-constants.ts` has no `defines`, and the file
  transcribes no `define()`. A probe of `readerValues` over the constants file at 925ee395 gives
  `PAGE_FRAMES: 12` and `PAGE_FRAMES_CLAMP: 'constant STRESS_EVICT not found in any loaded .emp
  source'`.

Fixing this changes test logic: a `defines` field on the reader, plus a transcription of
`define()` that joins `PARSER_SOURCE_LINES`. That change needs its own red-first parcel and is not
something a re-pin should do. The four rows stay red and say what they found; the markers'
`what_changed_at_this_pin` says the same. The recorded runs only use PAGE_FRAMES_CLAMP as a guard
that it equals PAGE_FRAMES at define 0, so no vendored byte depends on its value beyond "no
refusal".

The other two markers, paste-music and validate-json, do not load fg_page_order. For them
PAGE_FRAMES_CLAMP is named only by `ojz_strip_gen`'s Pass 4 print inside `generate()`, which never
runs, so it joins the `engine/level/camera.emp` names_not_read group beside the other budget names.
The 70027733 precedent grouped those names the same way, and the group's `why` now names
PAGE_FRAMES_CLAMP.

The static closure has no other change. `ConstantSource.define` pulls in no import. The parser
lines the value rows hold (`PARSER_SOURCE_LINES`) are all still present in `fg_working_set.py` at
925ee395: the parse-lines check passed and every value row at origin/master is green.

## 7. engine_constants.emp re-vendor and value equality

`test/fixtures/regions/act-constants/engine_constants.emp` vendors aeon's
`engine/system/constants.emp`. Following the sidecar's `re_vendor` recipe, I ran
`scripts/revendor.mjs` at the commit that last touched the path. `git log 41697d36..origin/master
-- engine/system/constants.emp` lists only 925ee395, so that is the commit. The blob goes from
2915ee35 to 71c9fadf and the size from 97765 to 98389 bytes. revendor.mjs checked
`git hash-object` against `git rev-parse <rev>:<path>`.

The diff is 12 lines added and 5 removed, in two hunks. Both hunks are inside `//` comment blocks:
the STRESS_EVICT fixture note and the page-frame floor note. No declaration line changes.

I ran a proof through Aurora's own reader, `src/core/formats/regions/act-constants.ts`. It compares
the old bytes with the new, using the vendored act descriptor and the 6144 x 6144 OJZ act:
- `resolveRegionRules` gives the same 12 resolved constants (name, value, initializer, source file)
  and the same rules: minSpan 32, centreX 160..5984, centreY 112..6032.
- The leaves are unchanged: SCREEN_WIDTH 320, SCREEN_HEIGHT 224, CAM_SCREEN_HALF_W 160,
  CAM_SCREEN_HALF_H 112, CAM_MAX_Y_STEP 16.
- `empConstDecls` gives the same 359 names with the same initializers and conditions. Only line
  numbers shift.
- Positive control: planting `CAM_MAX_Y_STEP + 1` in the new bytes makes both comparisons differ.

**No value Aurora reads changed. Rule 4 does not move.** The act descriptor is still at its pin
(last touched adb700d1, blob 50c4ae70 at origin/master), so the pair agrees and the descriptor was
not re-vendored. aeon-fixture-currency, regions-act-constants, regions-panel and
bg-display-resolution: 4 files, 119 tests passed.

## 8. Aeon is still moving

Before the final commit I fetched aeon and checked the tip. At 2026-09-28T23:15:50Z, aeon
origin/master is **936439fa** (936439faee52e89aacb0daef141b2e48ff613fc2). That is the same tip the
pin was derived against, so nothing new needed folding in. The last check is in the commit message
of this page.

## 9. Suite

Full `npm test` (VITEST_MAX_WORKERS=4, TMPDIR under $HOME, foreground) on this branch at 1fd7d89d
exited 1:

- Test Files: 1 failed, 694 passed, 3 skipped (698)
- Tests: 4 failed, 11932 passed, 20 skipped (11956)
- `failure-class: 4 failure record(s) in 1 file(s) (4 failed test(s); a hook or collection failure has no failed test of its own).`
- `run-completeness: COMPLETE, 698 of 698 module(s) this run selected finished.`

The four failures are the BLOCKED rows in section 6: "the constants pinned by value are every one
its loaded modules name" for bake-json, s2_ehz_cpz, s2_two_clip and s2_woven. Each one names
`PAGE_FRAMES_CLAMP`. On master 2226c4da there were 7 failures. The six input-currency rows and the
engine_constants row are now green.
