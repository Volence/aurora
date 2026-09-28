# Row 241: SAVE-CONFIG-STRANDING

2026-09-28, on a branch cut from master `183aa9ec`. Found by row 225 (e)'s census (`docs/reviews/2026-09-28-atomic-save-225e-census.md` section 6). The census read the collision path from code order and did not run it. This row runs it.

## The defect

`buildAeonSavePlan` (`src/core/project/aeon/save.ts`) retargeted pointers in the session's in-memory `config.raw`: the act grid, the zone tileset, the act BG layout and BG tiles. It did this in place. A plan put `project.json` in its write list only when its own comparison against `config.raw` saw a difference. The rewrite happened before the plan could still throw (the scene and preset id-collision refusals come after it) and before the glue (`src/renderer/state/aeon-save.ts`) had written anything.

So a save refused after the rewrite left it in memory. The next save compared against that value, saw nothing to change and left `project.json` out. It then wrote the tileset to `data/editor/<zone>_tiles.bin` while `project.json` on disk still named the old file. On reopen, the tile edits were gone.

## Reproduced first (commit `ff7fef11`, on unmodified code)

`src/renderer/state/__tests__/aeon-save-config-stranding.test.ts` drives the real `saveAeonProject` over an in-memory disk. It judges each row by what a reopen of that disk shows. Run on master's code: exit 1, `Tests 2 failed | 2 passed (4)`:

- Refused by a scene-id collision, then a clean save: the reopened pixel was 1, not the edited 7. The row checks its own refusal first (`refusing to save scene "broken"`, nothing written), and that check passed.
- The tileset write was refused by the real main-side guard (`writeProjectFile` on an escaping path, converted by `unwrapWriteOutcome`), before `project.json`. After a clean save the pixel was 1, not 7. The refusal check (`write refused by the main process`) passed.

Both paths reproduce. The collision path is no longer only read from code order.

## The fix (commit `8d6d2ef9`)

- `save.ts`: every retarget writes into `raw = structuredClone(config.raw)`. `project.json` is serialized from that copy, and the legacy-atlas live-tileset guard reads it too. The plan returns the copy as `plannedConfig`, or null when `configChanged` is false. New exports: `PROJECT_JSON_PATH` and `adoptPlannedConfig(config, plan)`. The adopt function sets `config.raw` and `config.zones` together, which keeps the aliasing that `LoadedS4Config` documents (`zones` is `raw.zones`).
- `aeon-save.ts`: adopts per act, at the moment `project.json` is written, or when the write is skipped because the file on disk already says it. A plan that throws never reaches that point, and neither does a write refused earlier in the file order. The session copy therefore keeps saying what the file says, and the next plan retargets again. Because adoption happens per act, a later act's plan in the same save compares against what the earlier act wrote.
- `s4-config.ts`: the doc on `raw` now says it tracks disk, and names who swaps it.

## Who is affected

**Callers of `buildAeonSavePlan`.** The only production caller is `saveAeonProject`, which is changed as above. Every other caller is a test. Those tests apply `plan.files` to a map and reload, so they do not depend on the in-place mutation. The related directories (`src/core/project/aeon`, `src/renderer/state`, `test/config`, `test/formats`, `test/handover`: 182 files, 2836 tests) stayed green. One test did depend on it, and it would have gone vacuous rather than red: `palette-write-target.test.ts` checked "retargets nothing" on `before.config.raw`, which the plan no longer touches. It now reads the reopened `project.json` (`after.config.raw`). This was proven with a plant that moves the palette pointer in the plan's copy: the new assertion goes red, and the old assertion stays green under the same plant.

**Readers of `config.raw` / `config.zones`.**

- `projectDataRoot` and `collisionDataPathCandidates` read only `dataPath` / `collisionDataPath`, which no plan retargets. Their callers are `object-previews.ts`, `chunk-library-import.ts`, `export-sprite.ts`, `RegionsPanel.tsx`, `effects-delete-guard.ts`, `regions-aeon.ts` and `load.ts`.
- `build-and-run.ts` reads `buildCommand` / `buildEnv` after the save.
- The `config.zones` readers are `App.tsx`, `session-lifecycle.ts`, `Explorer.tsx`, `HomeTab.tsx`, `tab-activation/level.ts` and `aeon-open.ts`. They read ids, names and the acts list, look zones up by id every time, and hold no zone object across a save.

None of these observes the difference, except to see the adopted value one write later than before.

## Tests and their plants

The fix was committed first. Each plant was applied on top of it and the test file was run. Each plant was then restored with `git restore --source=HEAD`, and a final run on the restored tree was green (`Tests 26 passed (26)` across this file and `palette-write-target`).

| Plant (the mutated line) | collision row | main-refusal row | exactly once | no churn |
|---|---|---|---|---|
| P1 glue never adopts (`// PLANT-P1 no adopt` at both sites) | green | green | green | **red** (`act1: expected true to be false`) |
| P2 plan mutates the session again (`const raw = config.raw;`) | **red** (1, not 7) | **red** (1, not 7) | green | green |
| P3 adopt right after planning, before any write | green | **red** (1, not 7) | green | green |
| P4 `project.json` never pushed (`if (configChanged && false)`) | **red** | **red** | **red** (length 0, not 1) | **red** |

Every row is red under at least one plant. P2 is the defect itself. P3 is the "adopt only once written" rule, and only the main-refusal row can see it: the collision refusal throws inside the plan, before adoption could happen.

The no-churn row asserts on the next plan rather than on disk. The glue's skip compares `project.json` by meaning, so a re-planned identical `project.json` never appears in the write log, and an assertion on disk could not go red (the brief's disk preference yields here).

## Left open

- **Row 225 (e) option (1) would still need more.** This row is the first half of census section 5. It is not enough for all-or-nothing multi-act saving. Under (1), every plan would copy the session config before any `project.json` is written. Act 2's `plannedConfig` would then carry the zone-tileset retarget (every plan loops every zone), but not act 1's grid or BG retargets. Adopting act 2's copy would drop act 1's, and so would writing `project.json` from it. (1) would have to chain the copies: plan act N against act N-1's `plannedConfig`. This is read from the code and was not run. The shared-`dataPath` refusal is still a hub call. Neither is done here.
- A crash (not a refusal) between the `project.json` write and adoption is harmless. The next session loads from disk.
