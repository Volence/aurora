# Handoff: ruling B1 for region mode, ready to dispatch (2026-09-17)

**For the next aurora overseer session.** Nothing is running. One agent was dispatched with the
brief below and stopped within about a minute, on the hub's advice that a fresh session should run
and review it. It committed nothing, and its worktree and branch are gone.

## State of the repo (all local, NOT pushed)

- **Master is RED on 2 rows** in `src/core/formats/__tests__/raster-binding-threaded-set.test.ts`,
  against aeon `origin/master` (`bb62eb9c` at handoff). Local master is ahead of `origin/master` by the
  review packets and decision entries. Nothing can land until the suite is green: `npm run land` refuses.
- Branch `regions-docid-inverse` @ `8510934c`: row REGIONS-DOCID-TRANSCRIBED-INVERSE. Reviewed and accepted.
- Branch `aeon-region-mode-consumers` @ `1327f75b`: three aeon-reading test files repaired for OJZ act 1's
  region mode. Reviewed and accepted (two tests check less, and each says so in its header).
- Branch `region-mode-integration` @ `d838814d`: the two above merged onto master as of `15c30f84`.
- Branch `region-mode-b` @ `18af515c`: the first build, ruling B, on the integration branch. Built: the
  predicate, strip notice, hidden verdicts, refusals and a SHA golden. It stopped on conditions 2 and 4.
  **Not yet reviewed line by line by an overseer; review it as part of B1's return.**
- Findings: `docs/reviews/2026-09-17-region-mode-raster-false-output.md` (commit `20277156`) and
  `docs/reviews/2026-09-17-region-mode-ruling-b-stops.md` (commit `94a4778f`).
- Rulings: `docs/decisions.jsonl` entries `REGION-MODE-RASTER-FALSE-OUTPUT` (B, commit `15c30f84`) and
  `REGION-MODE-RASTER-FALSE-OUTPUT-b1` (B1, supersedes it, commit `d8d6d58d`). **Read the B1 entry's
  `answered.said`, which holds the five conditions and the three ratifications; do not work from this summary.**

## Landing plan once B1 returns green

Review B1 (and `region-mode-b` under it), then merge `region-mode-b1` into master with `--no-ff`. It
already contains the integration branch. Write ONE lane-log entry covering the id fix, the region-mode
test repairs and B1, then `npm run land`. The landing note names queue row
`PRESET-REBIND-TEST-READS-LIVE-AEON` as the booked risk that came true, and proposes it as next.
Delete the merged branches afterwards. On-screen checks tagged for the foreground run: OJZ act 1's strip
and panel in region mode, and a section-mode act unchanged.

## The dispatch brief, verbatim (use `isolation: worktree`, background)

You are implementing a RULED fix in Aurora, a TypeScript/Electron level editor at
/home/volence/sonic_hacks/aurora. You are in an isolated git worktree of it. The engine repo
/home/volence/sonic_hacks/aeon is ANOTHER LANE'S LIVE TREE: read it only through git objects
(`git -C ../aeon show <rev>:<path>`, `ls-tree`, `log`, `grep <rev>`), and never edit, check out,
build or fetch it. Name every aeon revision you read; aeon `origin/master` was `bb62eb9c` at dispatch.

### First step
`git checkout -b region-mode-b1 region-mode-b`. `region-mode-b` (tip `18af515c`) is the first build of
this fix, sitting on master plus the reviewed id fix and three test repairs. You continue from it. All
your work goes on `region-mode-b1`.

### Read first, in full, in this order
1. `docs/reviews/2026-09-17-region-mode-raster-false-output.md` (the finding).
2. `docs/reviews/2026-09-17-region-mode-ruling-b-stops.md` (what the first build did, and why it stopped).
   Read both review files with `git -C /home/volence/sonic_hacks/aurora show master:docs/reviews/<file>`,
   because they are newer than your branch. Also read this handoff and the `REGION-MODE-RASTER-FALSE-OUTPUT-b1`
   entry in master's `docs/decisions.jsonl`.
3. `git log --format='%h%n%B' master..region-mode-b`: the first build's commit messages.
4. aeon at `bb62eb9c`, `tools/effects_gen.py`: `has_act_regions`, `check_mode_conflict` (it loops over
   BOTH `ACT_SCENE_REF_KEY` and `ACT_RASTER_REF_KEY`), `render_module`, the `fn_preset_raster` naming
   (~:4588) and its emission (~:5545), and how a preset record is bound in section mode versus region
   mode. Also read the `preset(...)` records in `games/sonic4/data/effects/ojz_effects.emp`.
5. The existing test `src/renderer/components/effects/__tests__/preset-rebind-orphan.test.ts`. It already
   parses aeon's `regions.json` plus the record-keyed chooser at a named revision; reuse that parse rather
   than writing a second one.

### The ruling (hub, revised: B1, under the owner's 2026-09-11T18:23:49Z standing delegation)
Aurora's raster-binding derivation follows aeon's CURRENT generator for every act: the chooser is the
preset-keyed `{stem}_preset_raster(preset: <Record>_KEY, ...)`. A record's homes come from region rows
when the act's `regions.json` exists, otherwise from section sidecars. The shipped sentence
`RASTER_SECTION_BINDING_LIMIT` is rewritten to that rule, WITHOUT the first build's "the clauses below are
stale" preface, which is removed. The wording rows pinning the sentence follow
(`band-preset-wording.test.ts`, `agent-handler.assign-section-preset.test.ts`, and any others you find),
and each one still pins a true statement.

### CONDITIONS. They are part of the ruling and may not be relaxed.
1. Region mode is detected by the act's `regions.json`, never by inference. The first build's
   `actHasRegionsFile` stands. RATIFIED: it reads the loaded document, which differs from aeon's on-disk
   check only between "Migrate sections" and the save. **Name that window in the predicate's doc comment**,
   so nobody later reads it as drift.
2. Section-mode verdicts may change ONLY where aeon's rename made them false, and **each change is shown
   against an aeon-current fixture**. Vendor what you need at a named aeon revision, with a provenance file
   like the neighbouring fixtures. The first build's SHA golden proved the verdicts did not move, which is
   the wrong property. Replace it with tests proving they are TRUE against aeon today, on a section-mode act
   (no `regions.json`) AND a region-mode act. If aeon's tree contains no section-mode act that threads
   rasters, build the section-mode case from aeon-current bytes plus a minimal, clearly-labelled
   construction, and say so.
3. Refusals name `check_mode_conflict` and point at the Regions panel's **Bindings**, never "Migrate
   sections" (RATIFIED: no region-mode act can reach Migrate).
4. The two rows in `src/core/formats/__tests__/raster-binding-threaded-set.test.ts` **re-derive from
   aeon's current generator and compare against the sentence**. They go green because the derivation and
   the sentence are both true. They are never removed, relaxed, skipped, or given a staleness disclaimer.
   Each must be proven red against (a) the old sentence restored and (b) a derivation mutated back to
   `_sec_raster`.
5. **NEW, scene side:** on a region-mode act, the scene panel's section assignment and the agent command
   `assign_section_scene` must not write a sidecar `sceneRef`. The refusal follows condition 3. RATIFIED:
   clearing a sidecar raster ref OR scene ref stays allowed in region mode, because it is the only remedy
   for what `check_mode_conflict` refuses. Also fix the strip's scene half ("scene act default") on
   region-mode acts if it states something false. Otherwise leave it and say why.

### Also, in scope
- Remove or correct any sentence the first build added that becomes false under B1.
- `SHORT_BODIES.unbound` (painted short text): correct it if it is false under B1.
- NOT in scope, book in the report only: `deletePresetRefusal` not guarding presets bound by regions. Do
  not build option A (the section panel editing region bindings).
- If an instruction here cannot be carried out as written, or contradicts another, STOP on that item, write
  down exactly why, and continue with the rest. Never decide a condition away yourself.

### Standing rules (not optional)
1. **No emulator, ever.** Never call `mcp__oracle__*` tools. Tag on-screen checks for the overseer.
2. **Branch discipline:** `region-mode-b1` only. Check `git branch --show-current` before each commit.
3. **Exact-path commits:** `git add <enumerated paths>` only; check each commit with `git show --stat`.
   Commit each step as it lands, with what you learned in the message (never `wip`). You may run long;
   commit before every full-suite run.
4. **Faithful reporting:** full `npm test` aggregate totals (files and tests: passed/failed/skipped) plus exit
   code, on your final commit, never a tail excerpt. The goal is **exit 0**. Paste any failure output.
5. **Setup:** the worktree has NO `node_modules`. Run `cp -al /home/volence/sonic_hacks/aurora/node_modules
   ./node_modules` at the worktree root, and never commit it.
6. **Every new or rewritten assertion is proven red first:** commit it, apply a mutation, SHOW it on disk with
   `git diff` before the red run, confirm it actually goes RED, and restore with `git checkout -- <file>` from
   the committed state. A mutation that stays green is a finding, not a pass. If you change your proof method
   partway, re-establish the earlier claims and say which. Name the runner that collects each new test file.
7. **Waiting:** run `npm test` in the FOREGROUND with `VITEST_MAX_WORKERS=4`. If it exceeds the tool timeout,
   detach it to a log file in your worktree with an end marker you write, and poll that file. Never wait on a
   background-task notification. A killed or truncated run is not a pass: confirm the file count.
8. Do not touch the lane status file, the lane log or the decisions ledger (all under docs/). Do not edit the review
   files on master. Write your own short packet under docs/reviews/, named 2026-09-17-region-mode-b1.md, committed on your
   branch.
9. After landing, the overseer merges your branch and deletes the branch and worktree. Record your tip SHA.

### Report shape
- Branch, tip SHA, commits.
- Derivation: the rule as coded, the aeon revision, and the fixtures vendored.
- Every user-visible sentence changed, old and new, quoted in full.
- Every section-mode verdict that changed, with the aeon-current evidence that the old one was false.
- Red-first evidence per mutation.
- Full `npm test` totals plus exit code.
- Stops, booked items, anything in this brief you found wrong, and on-screen checks tagged for the overseer.
