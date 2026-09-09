# Audit briefing for the aurora lane — 2026-09-09 evening

**From:** the owner's audit session in aeon, at the owner's request: *"Fix the cards. Answer any you
can. Send info on any cleanups or things the current running agents should do from your audit."*
Every claim cites where it was read. No installs, builds or tests were run here; the code findings come
from a read-only reviewer sampling 14 code commits since 2026-09-06.

## 1. Owner cards — what changed and what the lane owes

| card | now | note |
|---|---|---|
| d-38-save-surface-vocabulary | answered `name_what_is_true` (by hub, delegated) | wording and placement stay the lane's call. **Drop from `blockedOnOwner`** |
| d-33-frame-09-art-rebuild | **open** | the owner's sprite sheet; genuinely his |
| "Effects captures are built and waiting for you to ratify the shape" (08-26) | **removed from the board** | no id, no question, no options; engineer-decidable — ratify the shape yourselves and log it |
| "Cold read of the Effects tab, whether its headline finding changes the design" (09-02) | **removed** | the finding (C2) was fixed at `4b9b3f6a` on 09-06; stale |
| "Waterline measurement running beside its control" (09-03) | **removed** | a status line, not a question; lane-log 299/302 show it shipped |

`docs/lane-status.json` is untracked in this repo, so the removal is on disk only. **Whatever writes
the board must not re-add the three id-less cards.** Per the Dominion contract, a card needs a
`decisions.jsonl` row with an `id`, a `question`, two or more `options` each carrying `key`, `name`,
`what`, `costs`, and a `recommend` object with `key` and `because`.

## 2. Defects and risks, in priority order

1. **Grid resize is never persisted — same class as the palette bug.** `set-sections`
   (`SectionGridNav.tsx:68`) mutates `level.act.gridWidth/gridHeight` in memory (`history.ts:233-234`);
   the aeon save writes `project.json` from `config.raw` verbatim (`save.ts:502`) and nothing syncs the
   grid back (zero writers found); load rebuilds from `actConfig.gridWidth * gridHeight`
   (`load.ts:498, 726`). Add a column, save, reopen → old dimensions, new `section_N` files orphaned.
   No round-trip test exists (fixtures are all 1x1). Static finding, not executed; a chip is on the
   owner's console. `Zone.palette` (`set-palette-line`) is the other instance.
2. **Palette never reaches the ROM** — aeon's half (`tools/ojz_strip_gen.py:2136-2138`) was unbooked
   until tonight; a chip is on the owner's console. Coordinate the file contract before either side
   builds.
3. **`build-run.ts` pattern: bound one axis, miss the next.** `8a3ab7be` line 310 shipped a hole that
   `e6b3e1d2` closed 20 minutes later; the file's history repeats this shape.
4. **Chunk-undo repair wiring is guarded only by a source-string match.** `ComposerCanvas.tsx:75`
   `useEffect`: 30 rows stay green if the effect is deleted; only `chunk-doc-commit.test.ts:626-638`
   holds it.
5. **`scratchpad/` is production test infrastructure.** `package.json:253` runs
   `scratchpad/check-harness-guards.mjs`; 459 harness files are tracked; harness churn is 21% of code
   commits and none of it runs under `npm test`. Promote or prune.
6. **One silent fallback in new code:** `chunk-doc-commit.ts:135` skips the chunk half without a toast
   when `zone`/`project` are null.

## 3. Quality verdict for the record

Sampled grades: correctness B+, code quality A- (zero `any`, zero `@ts-ignore`), tests A- (nine skips
all `SKIPPED, NOT PASSED` with reasons, enforced), message honesty A. Decisions: discriminating
experiments run for d-37, the build-run hazard plant and the guard census; the palette review's first
vehicle (`paletteRef`) was reasoned by symmetry and corrected by aeon; L409's "all 27 fallbacks right"
is a reading, not a plant. 50% of commits since 09-06 touch code.
