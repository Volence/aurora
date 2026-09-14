# Palette line 0 saves into the shared player palette, behind a loud warning

**2026-09-13 · branch `parcel/palette-line0-save-warned` off master `09e8675f` · ROADMAP §5.1 row 176**

## The ruling

Owner, verbatim, 2026-09-13T22:06:54Z (card `PALETTE-LINE0-BLAST-RADIUS-answered` in
`docs/decisions.jsonl`, option `write_shared_file`):

> "we should allow the top row with just a warning I think. like "heyy just sayying this changes
> everything", although the top row can't be per level? like I can't change sonic's palette for 1
> level and it ber normal for another?"

His question is answered **no**: line 0 is per CHARACTER in the engine, not per level, and
per-level character colours are the `per_zone_copy` option, which needs engine support first.
Nothing here pretends otherwise, and the warning says so on screen ("There is no per-level copy of
these colours; that needs engine support first").

## What is true now

An aeon zone palette is four CRAM lines. Lines 1 to 3 come from the zone's own file; **line 0 is
Sonic and Tails, read from ONE file the whole game shares** (`art/palettes/SonicAndTails.bin`,
falling back to `art/palettes/sonic.bin`). Until this parcel, line 0 was locked at the gesture
(`refuse_line0`). Now:

1. **Line 0 is editable, only after a loud in-app warning.** Every line 0 edit goes through one
   door, `admitZoneLine` in `src/renderer/providers/palette-aeon.ts`, which asks
   `src/renderer/providers/palette-line0-gate.ts`. The swatch grid reaches it through the new
   optional `PaletteGridPort.admit` (asked BEFORE select or sliders, so a decline changes nothing),
   the copy bridge in `src/renderer/components/art/PaletteEditor.tsx` through
   `whenZoneLineAdmitted`, and `previewZone` keeps a second lock keyed on acknowledgement. The
   dialog is `useConfirmStore().ask`, never `window.confirm`.
2. **The warning's list of what else takes its colours from the file is DERIVED** at warning time:
   `src/core/project/aeon/shared-palette-warning.ts` searches the open project's `.emp` sources for
   `embed("<the resolved path>")`, outside comments. It says how many files it searched. When it
   could not look, it says "Aurora could NOT check" and lists nothing; a partial search says "this
   may not be everything".
3. **Save writes line 0 to the path the load actually read**, only when line 0's displayed colour
   changed, as a byte PATCH of the entries that moved (the tail and untouched words ride through;
   the length never changes). An absent, truncated or unreadable file is never created or grown:
   the gesture refuses in the same dialog, the save refuses in words, and a truncated or unreadable
   file is announced at load as a warning. `src/core/project/aeon/player-palette.ts`,
   `src/core/formats/palette.ts` (`patchPlayerPaletteLine`), `src/core/project/aeon/save.ts`
   ("THE SHARED PLAYER PALETTE").
4. **The save report names the shared write.** `AeonSavePlan.shared` lists it;
   `src/renderer/state/aeon-save.ts` names each shared file whose bytes actually reached disk on the
   success line ("Project saved · rewrote the shared player palette art/palettes/SonicAndTails.bin
   (Sonic and Tails, every zone)"). Refusals go to the error channel.
5. **A line 0 edit never reaches `palBaseOffset`.** The port's live push loop starts at
   `PAL_BASE_FIRST_LINE`, the store drops aeon line 0, and the agent's `push_palette` refuses it in
   words. Live preview of line 0 is out of scope. The UI claims nothing: the warning says "A
   running game will not show a line 0 edit until it is rebuilt: Aurora pushes only lines 1 to 3
   live".
6. **The agent tool keeps refusing line 0** (no person to warn), and now says why and where the
   change can be made: `AGENT_LINE0_REFUSAL` in `src/core/agent/validation.ts`; the `get_palette`
   and `set_palette` descriptions in `src/main/editor-methods.ts` say the same.
7. **No comment claims line 0 is refused** in `palette-aeon.ts`, `save.ts`, `load.ts`, `palette.ts`
   (and `palette-grid-model.ts`, `PaletteEditor.tsx`, `PaletteGrid.tsx`). Each now describes the
   warned write and records the 2026-09-10 lock as history.
8. **Untouched:** `AEON_SPRITE_STANDALONE_PALETTE_POLICY`, per-zone character colours, every aeon
   file. No aeon change was needed.

## Findings

- **The owner's card listed two embedders; there are three.** At aeon `ad51e3f0`:
  `games/sonic4/data/levels/ojz/act1/act_assets.emp:13` (`BGND_Palette`),
  `games/sonic4/objects/test_solid.emp:934` (`_spring_pal_sonic`) and
  `games/sonic4/data/characters/knuckles_data.emp:73` (`_pal_sonic_tails`). The third is the one
  that matters most: its comment says it is "the SAME file act_assets.emp loads", embedded as
  `Pal_SonicTails`, which is what `sonic.emp` and `tails.emp` point `cd_palette` at. The harness's
  red-first run drops exactly that site and row `3d` names it.
- **The old loader fell through to `sonic.bin` on ANY read failure of `SonicAndTails.bin`.** Once
  line 0 saves, that would aim the write at a file the game does not embed whenever the primary is
  present but unreadable. The save record (`Zone.playerPaletteFile`) now names the first candidate
  that is NOT known absent, and an unreadable one carries its failure so the save refuses. The
  DISPLAY fallback is unchanged.
- **`listProjectFiles` swallows an unreadable directory** (`catch { return; }`) and keeps only
  `.asm/.bin/.nem`, so it could not back a warning that must say when it could not look. A new
  sibling, `listProjectSources`, reports unreadable folders and a `capped` flag
  (`SourceListing` in `src/shared/ipc-types.ts`, channel `LIST_PROJECT_SOURCES`). It is base-only
  like its sibling, and the file-io census and channel tables classify it.
- **Every zone holds its own in-memory copy of line 0.** Editing it in one zone does not update the
  other zones' copies (aeon has one zone today). The plan asks each zone whether ITS copy changed.
  If two zones changed it differently, it saves neither and says so rather than silently discarding
  one. The baseline is deliberately never refreshed after a save: a zone that never saw the edit
  would otherwise read its stale copy as a new edit and write the old colours back.

## Calls on open questions

- **How often to warn: once per open project, on the first line 0 edit.** The blast radius does
  not change while the project stays open, and a dialog on every swatch click trains dismissal.
  The acknowledgement is keyed on the open `S4Project` object, so a reopen asks again, and a
  decline acknowledges nothing, so the next attempt asks again. The dialog's last line says "You
  will not be asked again while this project stays open".
- **Derived, not listed:** see the finding above. The population is `.emp` `embed(...)` only.
  Python generators that READ the file (e.g. `gen_characters.py`, `gen_spring.py`) are not
  searched, and the sentence names what was searched, so it never implies they were.
- **Live push:** nothing is pushed and nothing claims to be. The warning states the rebuild
  requirement.
- **A select-only click on line 0 (the index 0 eraser) is not asked:** it changes no colour. So
  binding line 0 as the paint line for tiles is now possible without a dialog. Before, the lock
  refused that too.
- **An ABSENT player palette is not announced at load:** no candidate on disk is the normal state
  of a project without one, and the gesture refuses it in words the moment anyone reaches for line
  0. Truncated and unreadable files ARE announced at load, on the zone palette's precedent.

## Tests

**Old tests rewritten, each now pinning the new contract:**

| was | now asserts |
|---|---|
| `palette-write-target.test.ts` "line 0 belongs to Sonic and Tails, and this save does not touch it" › "never plans a write to the shared player palette" | "a colour picked on line 0 is the colour that comes back after save and reopen" (plus the rows below) |
| same describe › "the serializer emits lines 1 to 3 and has no way to emit line 0" | kept, renamed "the zone file serializer…": the ZONE file still never carries line 0 |
| `palette-aeon.test.ts` "locks line 0 in EVERY zone mount" | "locks no zone line: line 0 is guarded by a warning, not locked" |
| "treats index 0 as the eraser in both mounts" | the same, on every line including 0 (select-only, never asked) |
| "refuses line 0 with a sentence, and refuses nothing else" | "admits the zone's own lines at once, and the shared line only once acknowledged" |
| "refuses line 0 as a COPY TARGET too…" | removed; the copy bridge now asks the same door (wiring scan below, gate rows) |
| "locks exactly the lines the live CRAM push refuses to send" | "the shared lines are exactly the ones the live CRAM push never sends" |
| "refuses line 0 inside previewZone, before anything is written" | "refuses an unadmitted shared-line write inside previewZone, before anything is written" |
| `palette-grid-wiring.test.ts` "gates the aeon copy bridge on the port's refusal…" | "routes every aeon copy-bridge write through the shared-line door, with no rule of its own" |
| `test/agent/validation.test.ts` "rejects line 0 (sprite-reserved)…" | pins `AGENT_LINE0_REFUSAL` exactly; a new row asserts it names the editor, the warning and every zone |

**New:** `palette-write-target.test.ts` +11 rows (resolved path and nothing retargeted, only the
edited entry moves, untouched plans nothing, put-back plans nothing, the plan names the shared
write, fallback, both candidates, two-zone clash, the two constants tile the CRAM, absent,
truncated plus its load warning, unreadable); `shared-palette-warning.test.ts` (16, including one
against aeon's real tree that must equal an independent line search); `palette-line0-gate.test.ts`
(10, the real gate, stores and a loaded project); `aeon-save-shared-palette.test.ts` (4);
`file-io-guards.test.ts` +3; `palette-aeon.test.ts` +3 scans (the second lock, the `admit` hand-off,
the push loop's lower bound); `palette-grid-wiring.test.ts` +1 (the grid asks `admit` before select
or sliders).

**Red-first**, each mutation applied to the committed baseline, shown from disk, run, and restored
with `git show HEAD:<path> > <path>`:

| # | mutation (file) | red |
|---|---|---|
| M1 | `planPlayerPaletteWrite` never sees a change (`player-palette.ts`) | 10 of 22 `palette-write-target` rows |
| M2 | `changedPlayerPaletteEntries` reports every entry (`palette.ts`) | 4: untouched, put back, only-edited-moves, lands-in-file |
| M3 | the write aimed at the first candidate, not the path read | 1: fallback |
| M4 | the refusal ignores a short file | 1: truncated (through the patch backstop's throw) |
| M5 | the patch rewrites every entry | 1: only-edited-moves (byte 18, the planted undisplayed bit) |
| M6 | the save record falls past an unreadable primary | 1: unreadable (`sonic.bin` recorded) |
| M7 | the matcher stops stripping comments | 1: comments/other paths |
| M8 | `listProjectSources` swallows an unreadable folder (`file-io.ts`) | 1: EACCES folder named |
| M9 | the unmeasurable sentence says "Nothing else" | 1: UNMEASURABLE |
| M10 | the grid stops asking `admit` (`PaletteGrid.tsx`) | 1 wiring scan |
| M11 | the swatch copy writes without the door (`PaletteEditor.tsx`) | 1 wiring scan |
| M12 | the gate records acceptance on a decline | 4 gate rows |
| M13 | `previewZone`'s refusal no longer returns | 1 scan |
| M14 / M14b / M14c | the glue: names nothing / names a skipped write / drops refusals | 1 row each |
| M15 | the agent message reverts to "reserved for player/sprite art" | 2 validation rows |
| M16 | the zone policy locks line 0 again | 2 policy rows |
| M18 | the listing hits its depth limit without saying so | 1 cap row |
| H1 | the warning drops its first derived site (rebuilt; harness) | harness `3d` FAIL: missing `knuckles_data.emp:73` (21 PASS, 1 FAIL) |

## Suite and gates

Both full runs were `VITEST_MAX_WORKERS=4 npm test`, each read to its own end marker, not a tail.

- **Run 1, before the confirm-door fix:** Test Files 2 failed | 619 passed | 3 skipped (624); Tests
  8 failed | 9630 passed | 9 skipped (9647); rc=1. One failure was this parcel:
  `src/renderer/shell/__tests__/confirm-dialog-focus.test.ts` failed at collection. Its analyser
  proves no confirm door focuses a destructive button, and it refused the gate's
  `buttons: [...LINE0_WARNING_BUTTONS]` spread. Fixed at the door in `7477e948`: literal buttons,
  and the gate added to that test's known perimeter.
- **Run 2, the final tree:** every gate in the `npm test` chain exited 0 (the chain is `&&`, and
  vitest ran). That includes check-test-collection (624 of 624 collected), check-harness-guards
  (284 of 285 clean, 0 failures, 0 unmeasurable) and `tsc --noEmit`. vitest: **Test Files 1 failed |
  620 passed | 3 skipped (624); Tests 8 failed | 9646 passed | 9 skipped (9663); rc=1.** Every
  skip named its reason. All 8 failures are `section-wiring.test.ts` rows reading aeon's dirty
  working tree (see "Noticed, not fixed"). None is this branch.

## On-screen proof

`npm run harness:palette-line0-warning` (`scratchpad/palette-line0-warning-harness.mjs`), against
a COPY of aeon (`rsync` of the tree without `.git` and `.claude`; `AEON_DIR` has no default and the
live tree is refused), built from this worktree (`root:` and `pinned:` both name it). Every gesture
is a real CDP mouse or key event at an integer client pixel.

- Run 1: 15 PASS, 4 FAIL. The four were one fault in the RIG: an arrow key after `.focus()` never
  moved the slider (`red 3 -> null`), so no edit existed. Fixed by pressing the slider track.
- Run 2: **22 PASS, 0 FAIL, 0 broken negatives, exit 0.** The warning named the resolved file,
  EVERY zone, and all three sites the independent scan of the copy found. A real Cancel left
  sliders, swatch colour, dirty flag and file sha unchanged. It asked again. A real accept, a
  press on the red slider (3 to 4) and a real Ctrl+S changed `art/palettes/SonicAndTails.bin` on the
  copy from sha `b8378b6657af5f67` to `d28dff3bc057d1a4`: same length, only byte 11 moved, `$0E66`
  to the derived `$0E68`. The toast named the file.
- Red-first H1 above: 21 PASS, 1 FAIL on exactly the row it should.

Captures: `docs/captures/2026-09-13-palette-line0-warning/warning.png` (the warning, for the look
call) and `docs/captures/2026-09-13-palette-line0-warning/saved.png` (after the save).

## A second rig this ruling turned red, and what was done about it

`npm run harness:palette-grid` (`scratchpad/palette-grid-harness.mjs`) with `ENGINE=aeon`, run
against this build, went **4 FAIL + 2 broken negatives on exactly the rows that pinned the lock**:
ART.6, PAL.6 ("line 0 is LOCKED"), D1/D1n (line 0's grip not draggable), and D2/D2n (the copy menu
omits line 0). D6 ("line 0 refuses a drop") PASSED, but for the wrong reason: the drop now raises
the warning, so the colour stayed put. The rows were rewritten to the ruling:
- 6 and 6b: line 0 not dimmed, a click raises the warning and opens nothing, a decline leaves it
  closed.
- D1: every grip draggable, line 0's titled as shared.
- D2: line 0 offered as a copy target.
- D6: a drop onto line 0 asks, and a decline lands nothing.

The negatives were re-aimed at conditions that are false under the ruling. On the final build:
**34 PASS, 0 FAIL, 0 broken negatives.** Red-first on the same rig: with the zone policy re-locked
(`lockedLines: ZONE_SHARED_LINES`, rebuilt), ART.6, PAL.6, D1 and D6 FAIL and D1n reports broken.
D2 does NOT discriminate that mutation, because the copy menu no longer reads the policy at all.
What pins the bridge is the M11 wiring scan and the menu's own content, which the pre-ruling build
omitted. `ENGINE=classic` was not run: it opens the live s1disasm checkout, and nothing classic
changed here.

## Noticed, not fixed

- **A line 0 edit can redden an aeon RUNTIME gate the warning does not name.**
  `tools/spring_line0_gate.py` in aeon asserts that the spring's line-0 indices resolve to the SAME
  colours under `art/palettes/SonicAndTails.bin` and `art/palettes/knuckles.bin` (its header names
  the indices, derived from the art histogram). An editor edit to one of those entries in the
  shared file, with no matching edit to `knuckles.bin`, makes the spring change colour when the
  character does, and that gate fails. The warning names the spring's embed
  (`test_solid.emp:934`) but not this cross-character invariant. The dust and the insta-shield
  share line 0 the same way (aeon's `knuckles_data.emp` enumerates them). A follow-up could derive
  "entries another character's palette must match" and name them in the warning or the save
  report. That needs an owner call on whether the editor should also offer to edit
  `knuckles.bin`, and it touches aeon's contract, so it is not built here. The harness edited
  entry 5, which is not one of those indices.
- **The warning's population is `.emp` `embed(...)` only.** aeon's Python generators read the same
  file (`gen_characters.py`, `gen_dust.py`, `gen_spring.py`, and the gate above) and would
  regenerate art against the new colours when re-run. They are not listed; the sentence names what
  was searched, so it does not imply they were.
- **Each zone holds its own in-memory copy of line 0**, and an edit in one zone does not update
  the others' (one zone exists today). The save refuses rather than guesses when copies disagree.
  Keeping the copies in step is a model change this parcel did not make.
- **`src/core/formats/effects/__tests__/section-wiring.test.ts` has 8 red rows in the full suite,
  and they are not this branch.** They read aeon's working tree by path ("the numbers as they stand
  today"). The run's own stamp says WORKING TREE, base `55c062a4`, DIRTY. The two files they open
  were modified 2026-09-13 18:20:34 -0400. The test's whole import closure has an empty diff from
  `09e8675f` to this branch's tip.
- **`window.__dbg.aeon.open()` threw "Promise was collected"** in every harness run while the open
  succeeded; `guard-surface-harness` catches the same. It is a debug-hook wart; the harness asserts
  on `aeon.state()` instead.
- **`scratchpad/check-harness-guards.mjs` prints one G9 warning** calling
  `preset-schema-key-probe.mjs` untracked. That is the known misreport ROADMAP row 175 left open
  (the file is tracked), not something this parcel added.
- **The dialog is 420 px wide**, so long embed paths wrap. The wording and placement are the
  overseer's look call, from `docs/captures/2026-09-13-palette-line0-warning/warning.png`.
