# Ruling B1 for region mode, built (2026-09-17)

Branch `region-mode-b1`, off `region-mode-b` (`18af515c`). Ruling: `REGION-MODE-RASTER-FALSE-OUTPUT-b1`
in master's `docs/decisions.jsonl`. Its `answered.said` and the handoff's five conditions agree; no
stop was needed on that point.

## aeon revision

Pinned to aeon `c7ebe7a1` (origin/master at dispatch).

- `git diff --stat bb62eb9c c7ebe7a1 -- tools/effects_gen.py games/sonic4/data/effects/ games/sonic4/data/`
  printed nothing. Control: `git diff --stat bb62eb9c c7ebe7a1 -- tools/sprite_tilt_gate.py` printed
  `1 file changed, 48 insertions(+), 2 deletions(-)`, and the whole-tree diff listed 15 paths.
  `tools/effects_gen.py` is blob `1eee5093` at both revisions.
- aeon moved again during the build, to `2c7e6631` and then `cc314a18`.
  `git diff --stat c7ebe7a1 cc314a18 -- tools/effects_gen.py tools/effects_seam_gate.py games/sonic4/data/`
  printed nothing; the control over the whole tree listed 5 paths (DEFERRED_WORK, lane log, lane
  status, `engine/effects/preset.emp`, `engine/structs.emp`). The `preset.emp` change adds comments
  only; the ensure text the arm refusal quotes ("ep_raster and ep_patched are mutually exclusive")
  is still there at `cc314a18`.

## The rule as coded

`src/core/formats/effects/section-wiring.ts`:

- The chooser is `<zone>_<act>_preset_raster` (and `_preset_<channel>`), called as
  `(preset: <Record>_KEY, ...)`. A record is threaded exactly when it passes its OWN key.
- An owner is a region row when the act's `regions.json` exists, otherwise a section. The
  record comes from the region row's `preset`, or from the descriptor row beside `sec: N`. The
  binding comes from the region row's `rasterRef`, or from the sidecar (`rasterOwners`, aeon's
  `owner_maps`). A home is an owner whose record threads itself; it is bound when its ref is set
  (`rasterHomes`).
- Sharing a record is no longer a failure. Condition 1 is yes for any bound record and names
  who shares it. Condition 2 asks the section's record. Condition 3 reads
  `[channel][record][record]`, as aeon's `channel_faults` does.

## Fixtures

- `test/fixtures/effects/ojz_effects.emp`: aeon `c7ebe7a1`, verbatim, blob `b89a77ff`. It is
  currency-tracked in `aeon-fixture-currency.test.ts`.
- `test/fixtures/effects/raster-owners/section-mode/`: a CONSTRUCTION. It is aeon `c7ebe7a1` with
  `e2af59ea`'s act-1 flip reverted: the descriptor, `act_assets.emp` and six sidecars come from
  `bcd844aa`, and `regions.json` is deleted. It was built in scratch from `git archive`. aeon's own
  `effects_seam_gate.py --source-only` exits 0 on it and on the unmodified control.
- `*.aeon-truth.json`: aeon's own `owner_maps`, `raster_call_sites`, `channel_call_sites` and
  `_rekey_bound_to_record`, run by `aeon_truth_probe.py` over both trees. The records name the
  sha256 of each input.
- The region-mode act is the existing `ojz_act1.regions.json`, the same blob `d7f45399` at
  `c7ebe7a1`.

## Red-first record

Each mutation was shown with `git diff` before the run and restored from a committed baseline.

| # | mutation | went red |
|---|---|---|
| a | the pre-b1 sentence restored (`git show region-mode-b:...raster-binding.ts`) | gate rows 2, 3, 4, 5. **Row 4 stayed GREEN on the first try** because it never read the sentence's homes. Fixed in `282c6e4d`, then proof (a) was re-run: 4 of 5 red |
| a' | reading changed to `{5, 6}` in the new spelling | gate rows 3 and 4, on the comparison itself |
| b | `rasterChooserName` returns `_sec_raster` | gate rows 3, 4, 5 |
| M1 | old sentence body under the wording rows | all 12 rewritten wording rows |
| M2 | "On a section-mode act" dropped from NOTHING HERE PREVENTS | 3 disclosure rows |
| M3 | "grep -n sec_raster" re-added | 3 absence rows |
| M4 | chooser name back to `_sec_raster` | 20 rows across the truth, wiring and orphan tests |
| M5 | existence in place of self-keying (two edits, one run) | 2 rows |
| M6 | shared record back to condition 1 `no` | 2 rows |
| S1-S10 | scene refusal disabled, clearing refused, mode ignored, the leftover-ref clause dropped, select never disabled, description trimmed, agent refusal removed, panel reads regions, strip prints a sidecar ref, short body reverted | each row it names |
| S11, S16 | a vendored sidecar and the regions fixture edited | the hash rows and the owner rows |
| S12-S15 | channel chooser name, condition 1, section record map, region record | their rows |
| S17-S19, S21-S28 | the sharing sentence, the no-record branch, the unknown branch, the prescription, the sort, the old-spelling parse, the existence sets, state ignoring the record, the loose index parameter, the unthreaded yes, the sharers from the wrong section | their rows |
| S20 | condition 3 lookup allowed any key | **stayed GREEN**; the plant was in the wrong record. Fixed in `0c69ac12`, then re-run: red |
| S29 | descriptor constructor matched by zone prefix | the split-anchor row went red. The rewritten "zone key" row stayed green. Its vacuity predates B1 and is already recorded in that file's GUARD-SEAT-RESIDUE banner; only its fixture's chooser name changed |
| S30 | one byte added to the vendored library | pin integrity, currency, both truth hash rows |

## Booked, not built

1. `deletePresetRefusal` checks only sidecars, so deleting a preset that a region row binds is not
   guarded (out of scope by the brief).
2. The in-app guide `docs/guides/effects-first-run.md` §6 still teaches the section-keyed rule
   ("no other section binds this section's preset record", "a programmer splits a preset
   record", `ojz_act1_sec_raster(sec: N)`). It is under docs/ and not this parcel's to edit. The
   strip keeps the labels `own preset` and `threaded` because `check-guide-text` pins them to
   that guide. Condition 1's label now says less than the guide claims.
3. aeon's `comptime fn ojz_sec3_preset` carries `OJZ_Preset_Sec3`'s cycle and variant chooser
   calls. aeon's `channel_call_sites` sees none of them, and Aurora's declaration split
   attributes them to `OJZ_Preset_Sec2`. Both say section 3 threads no cycle chooser. This
   predates the rename.
4. A section-mode act where sharers of one record bind different documents is refused by aeon
   (`_rekey_bound_to_record`). Aurora says so in prose and does not compute it as a verdict.

## On-screen checks for the overseer (no emulator was used)

- OJZ act 1, Effects tab: the strip shows the region-mode notice and the bindings line "scene and
  raster are bound on this act's region rows, in the Regions panel". No condition rows.
- Same act, the band-preset Section select and the scene panel's Section assignment: each shows
  the refusal and is disabled while its sidecar ref is null.
- A section-mode act: three condition rows. `threaded` shows the record-keyed call.
