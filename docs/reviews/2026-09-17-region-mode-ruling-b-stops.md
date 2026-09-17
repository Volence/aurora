# Ruling B, built with two stops: conditions 2 and 4 collide with aeon's rename (2026-09-17)

Follows `docs/reviews/2026-09-17-region-mode-raster-false-output.md` and the hub's ruling B
(decision `REGION-MODE-RASTER-FALSE-OUTPUT` in `docs/decisions.jsonl`). Agent branch `region-mode-b`,
tip `18af515c`, off `region-mode-integration` `d838814d`. UNPUBLISHED: local branch only.

## What is built and green (reviewed next by the overseer)

- The predicate `actHasRegionsFile` (`src/core/formats/regions/act-regions.ts`), reached only through
  `regionModeRasterNotice` / `sectionRasterWriteRefusal`, with a source test that fails on any other
  reader of `.regions`.
- On a region-mode act: one strip notice pointing at the Regions panel; the section-keyed raster
  verdicts hidden; the Section select and `assign_section_preset` refuse a raster write, naming
  `check_mode_conflict` and the Regions panel's Bindings.
- Section-mode acts: a SHA-256 golden over every strip and panel verdict (`region-mode-section-golden.test.ts`),
  green on both the base and the tip.
- A region-mode clause added at the FRONT of `RASTER_SECTION_BINDING_LIMIT`. The rest of the sentence
  is left unchanged, and the clause itself says the rest is stale.
- Suite at the tip: Test Files 1 failed, 646 passed, 3 skipped (650). Tests 2 failed, 10117 passed,
  9 skipped. The only failures are the same 2 rows as on the base.

## Stop 1: condition 4 cannot be met, because the red rows encode the old rule

Both rows in `src/core/formats/__tests__/raster-binding-threaded-set.test.ts` fail BEFORE comparing
anything with the sentence. One derives the wired set with `rasterChooserName`, which returns
`<zone>_<act>_sec_raster`. The other reads sidecar `rasterRef`s. Each requires a non-empty result, and
at aeon `origin/master` both are empty by construction. **No true sentence can turn them green.**

## Stop 1b: the rename is not region-mode-only. Overseer-verified at aeon `bb62eb9c`

`tools/effects_gen.py` emits only `{stem}_preset_raster(preset: int, ...)`
(`fn_preset_raster`, lines 4588 and 5545). No `_sec_raster` chooser is generated in either mode.
`regions.json` exists for exactly one act in aeon's tree (`games/sonic4/data/editor/ojz/act1/`). So:

- **Aurora's section-keyed raster derivation (`section-wiring.ts` `rasterChooserName` /
  `libraryRasterChooserCalls`) is false against aeon for EVERY act**, not only region-mode ones.
- **Condition 2 ("section-mode acts keep every verdict byte-for-byte") preserves verdicts that are
  themselves stale since aeon `bcd844aa`.** The golden proves they did not move. It cannot prove they
  are true.
- Today no section-mode act threads rasters, so no author currently sees a wrong section-mode
  verdict. The stale derivation is latent there and live only in the sentence and the gate.

## Stop 2: the "Migrate sections" pointer (condition 3) has no case where it applies

Every region-mode act already has a document. `planActMigration` refuses when a document or a refused
file exists, and the panel shows the button only when neither does. The refusal therefore points at
the Regions panel's Bindings. **Overseer: agree. Ratification asked.**

## Choices the agent made that need an explicit yes or no

- **P. Predicate mapping.** Aurora does not stat the disk: `regions.document !== null ||
  regions.unreadable !== null`. This equals aeon's `os.path.isfile` for every loaded act. It differs
  after "Migrate sections" and before a save: Aurora already says region mode, while the disk and an
  unsaved build still say section mode. **Overseer: accept.** Migration already clears the sidecar
  refs in the model, so refusing a new sidecar write in that window forbids nothing the save would keep.
- **C. Clearing stays allowed** on a region-mode act (null to `assign_section_preset`, or Hand-authored).
  **Overseer: accept.** A leftover sidecar ref is exactly what `check_mode_conflict` refuses, and this
  is the only way to remove it.

## Found outside B's scope

1. **Scene bindings have the same defect.** `check_mode_conflict` refuses a sidecar `sceneRef` too,
   but the scene panel's section assignment and `assign_section_scene` still write one, and the strip's
   "scene act default" is false on OJZ act 1.
2. `deletePresetRefusal` checks only sidecars, so deleting a preset that a region binds is not guarded.
3. The painted short text `SHORT_BODIES.unbound` still describes section binding.
4. "NOTHING HERE PREVENTS THE WRITE", inside the sentence, is false on region-mode acts, and ~20
   wording rows (`band-preset-wording.test.ts`, `agent-handler.assign-section-preset.test.ts`) pin the
   no-gate wording.

## Options for the revised ruling

**B1: re-derive from aeon's current rule (overseer recommends).**
- `rasterChooserName` becomes the record-keyed `{stem}_preset_raster`. The wired homes are read from
  region rows when the act's regions file exists, otherwise from sidecars.
- The sentence is rewritten to that rule, and the ~20 wording rows follow it.
- The two gate rows re-derive with the same rule and compare against the sentence, so they are still
  red-first against a restored old sentence.
- Condition 2 is amended to *"section-mode verdicts change only where aeon's rename made them false,
  shown against an aeon-current fixture"*. Found item 1 (scene refusal) is added, since it is the
  same refused-build advice.
- Cost: medium to large, and one more agent parcel. It is the only option whose green means the
  sentence is true. The parse half already exists in a test (`preset-rebind-orphan.test.ts` reads
  `regions.json` plus the record-keyed chooser at a named aeon revision).

**B2: land B as built, and retire the two rows.**
- The two rows are replaced by a row asserting that the sentence DECLARES its section-keyed clauses
  stale.
- The sentence keeps its self-described stale body until a later parcel.
- Cost: small, and it unblocks landing today. But it ships a published tool description that says
  most of itself is out of date, and it trades a gate that checked the sentence for one that checks
  only a disclaimer.

**Overseer: B1.** B2 is condition 4's own forbidden move with a disclaimer in front of it.
Items 2 and 3 get booked as rows either way.
