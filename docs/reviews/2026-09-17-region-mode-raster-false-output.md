# Aurora states false facts about a region-mode act — ruling needed (2026-09-17)

**Status: STOPPED for a ruling. Routed to the hub under the owner's 2026-09-11T18:23:49Z standing
delegation (the hub rules non-look calls in his place, listed for his review).** Not a look call.

## How it surfaced

Aurora master `674c8ad4` went red on 5 tests reading aeon `origin/master` (`83ec56d2`, later
`de4de556`). Branch `aeon-region-mode-consumers` (tip `1327f75b`) repairs 3 test files. The
remaining 2 rows, both in `src/core/formats/__tests__/raster-binding-threaded-set.test.ts`, are
**correctly red**: they pin the shipped sentence `RASTER_SECTION_BINDING_LIMIT` against aeon's real
file, and that sentence is now false. Weakening them to land would ship the falsehood.

The booked risk that came true: queue row `PRESET-REBIND-TEST-READS-LIVE-AEON` ("green today, and
it will go red the next time aeon moves those files").

## What changed in aeon (verified by the overseer at aeon `origin/master`)

- `bcd844aa` (regions-emit-bindings 2/3): the preset choosers key on the RECORD.
  `ojz_act1_sec_raster(sec: N)` → `ojz_act1_preset_raster(preset: <Record>_KEY)`. At `origin/master`
  `ojz_effects.emp` has 6 `ojz_act1_preset_raster` and 1 `ojz_act1_sec_raster`, which is a comment.
- `e2af59ea` (3/3): OJZ act 1 is in REGION MODE. `regions.json` owns scene/raster bindings, every
  `section_N.meta.json` ref is nulled. `tools/effects_gen.py:3944 check_mode_conflict` refuses a
  build where a region-mode act's sidecar carries a ref.

## What Aurora shows an author on OJZ act 1 today (agent's probe against aeon bytes at `83ec56d2`)

`grep -rli "region mode\|check_mode_conflict" src` finds nothing (overseer re-ran it: nothing). The
section-keyed derivation (`section-wiring.ts`: `rasterChooserName`, `libraryRasterChooserCalls`, the
descriptor reader; `load.ts:847-895`) therefore reads an act it no longer describes:

1. **A wrong refusal in aeon's name.** The strip's "threaded" condition says NO, "nothing threads
   `ojz_act1_sec_raster(sec: 5)`", while `OJZ_Preset_Sec5` threads the renamed chooser.
2. **Empty sets.** The act line shows threaded and bound as empty while regions sec5/sec6 are bound.
   `rebindOrphanNotice` is silent.
3. **"Own preset" reads unknown** ("no usable section binding"): the descriptor rows are gone.
4. **Advice that leads to a refused build.** The panel says "The binding is still written; aeon's
   build is the authority". Writing a sidecar `rasterRef` (Section select, or agent command
   `assign_section_preset`) makes `check_mode_conflict` refuse the build.
5. **`RASTER_SECTION_BINDING_LIMIT`** (`src/core/formats/raster-binding.ts:748`), published in the
   panel's limit block, the `assign_section_preset` reply (`agent-handler.ts:1167`, `:1200`) and two
   tool descriptions (`editor-methods.ts:464`, `:508`), is false in almost every clause: the sidecar
   read, the sec-keyed rule, the `{5, 6}` reading, and the quoted aeon test names.

The Regions panel already binds `rasterRef` per region (`RegionsPanel.tsx:249-254`), so a correct
place for the author to bind already exists.

## Options

**A — mode-aware load.** When `{dataPath}regions.json` exists, derive homes and bindings from region
rows and the record-keyed chooser. The section panel and `assign_section_preset` bind on regions, and
the sentence is rewritten for region mode.
*Cost:* large, touching the wiring, the section panel, the strip, the agent handler, the tool
descriptions and their tests. It also duplicates a question the Regions panel already answers.

**B — detect region mode and say so.** On a region-mode act: suppress the section-keyed verdicts, show
one notice ("this act binds rasters on regions; use the Regions panel"), make `assign_section_preset`
and the Section select refuse (naming aeon's `check_mode_conflict`), and cut the sentence back to what
is still true, with a region-mode clause.
*Cost:* small to medium, with no new derivation. It gives up per-home disclosure on region-mode acts
until something like A is wanted.

## Overseer recommendation: B

B stops every false statement and the refused-build advice now, and unblocks every aurora landing,
which the red master is currently blocking. A mostly re-answers, in the section panel, what the
Regions panel already answers. If the owner later wants section-panel disclosure on region-mode acts,
A can be booked then as its own row. B is reversible and adds nothing A would have to undo.
