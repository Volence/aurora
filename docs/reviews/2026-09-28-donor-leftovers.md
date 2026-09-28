# Donor leftovers: row 213 (b), row 222's open half, and a real bake refusal on screen (review packet, 2026-09-28)

ROADMAP rows 213 and 222. Branch `parcel/donor-leftovers-213-222`, cut from aurora master `a187ed83`, master
`f8113f7d` merged in at `786da86a` (the row-231 re-capture; clean merge). Background packets:
`docs/reviews/2026-09-25-donor-clip-asks.md`, `docs/reviews/2026-09-26-bake-json-213.md`,
`docs/reviews/2026-09-26-paste-music-222.md`.

## 1. Premises, re-derived from the tree before building

| Premise (from the brief) | What the tree said | Result |
|---|---|---|
| 213 (b): a refusal's `subjects` reach the page structured, but the target pane outlines nothing | `PasteOutcome.refused.refusals` carried `ClipNote.subjects`; `DonorTargetPane` outlined only clips, corridors and the pending paste; the re-bake note was a string only | held, built |
| 222: the paste summary does not name the inherited song, the form shows none | `outcomeView('pasted')` said "Pasted X: created/rewrote P. aeon validated it and baked it." and nothing else; `zoneMusic` existed | held, built |
| The harness row "putting a real **C1** bake refusal on screen" | C1 was RETIRED by aeon's LINES-EVERYWHERE (aeon `19978b00`, said in `clip-validate-json.ts` and `gen_bake_json.py`); the bake's clip-naming rule is now **C4** (reserved bits 15:14 in a source rectangle) | premise stale in its rule name only; built for C4, the rule that replaced it |
| The booking said the harness row was "not cheap" (painting the harness copy's donor, backed up and restored) | the harness makes a FRESH copy per run and deletes it, so painting needs no backup; the scaffolding (real clicks, new act, paste, pane geometry) already existed | cheap here; built (DP.10) |

Two findings on the way, both inside this parcel's code:

- **A pair rule on one rectangle.** The harness's DP.7 places its second paste exactly over the first clip, so aeon's
  R10 names clip 0 and clip 1 at the SAME rectangle. A rect-only dedupe key reported one outline for a two-subject
  refusal; the key now carries the subject index (`311f907c`).
- **Shaft and fill subjects.** The overseer flagged (mid-parcel) that aeon names `shaft` (K9) and `fill` (K8) subjects,
  which the reader still refuses as a crash (booked separately as ROADMAP row 232, reader NOT changed here).
  `subjectRect` sent every non-clip kind to the corridors list, so such a subject would have been outlined on a
  corridor at that index; it is now named "not on this pane" (`7b06e8ea`).

## 2. The look calls, as implemented (overseer rulings, 2026-09-28, under the owner's 2026-09-18 permission)

**Refused subject outline (213 (b)).**
- Each rectangle a refusal names gets a **2px dashed outline** (`OUTLINE_DASH` = 6 on, 4 off, screen px) in
  **`DONOR_MARK_WARN`**, the canvas mirror of `--warning` that `canvas-colors.ts` already documents as "a rectangle
  that will be refused" and the colour the page's refusal text and rule tag already use. No new colour. No fill
  (the rectangle's own outline keeps its fill).
- A **rule tag** (`C4`, `R10`; `untagged` for aeon's `rule: null`) in bold 10px, **always on the second line**, under
  the id label of the outline that shares the rectangle. First implemented as "second line only when the dashed
  outline has its own label", which printed `C4` over the draft's `ehz_2x` in the first harness screenshot
  (`C4z_2x`); a refused rectangle is always also drawn by a labelled outline (the clip's faint one or the pending
  paste's accent one), so the second line is unconditional. DP.10t holds it.
- **Pair rules outline both subjects**, also when both sit on one rectangle (two outlines reported, drawn on top of
  each other).
- **Where a subject is placed.** By `(kind, index)` in the manifest aeon judged, checked by `id`: a paste refusal is
  placed on the act plus the pasted clip (`PasteOutcome.refused.judged`), so R3 on the pasted clip is outlined at the
  pending paste; a re-bake refusal on the act on disk (`PasteState.bakeRefused`). The id is not unique in a refused
  manifest (K1), so it cannot be the key; an id that differs from the rectangle at that index means the pane is not
  showing what aeon judged, and the subject is not outlined.
- **"not on this pane".** A subject that places on nothing (index past the list, id mismatch, a kind the pane does not
  draw) is named in the refusal text as `clip 2 ehz_1 (not on this pane)`, in the form's refusal head and in the
  target pane's re-bake note. Never dropped.
- **Cleared with the refusal.** A PASTE refusal: by the next paste (a new validate run), by an edit of the draft (id,
  destination, snap, reason) or of the marquee or donor zone (store subscriptions in `donor-paste.ts`), and by leaving
  the page (`DonorsCanvas` unmount calls `clearRefusal`). A RE-BAKE refusal: by the next bake run only.

**Song line (222).** Before a paste the form shows one line; the success summary repeats the same sentence:
- `Song: <name> (from <donor> <zone>)` when every clip of that pair names the same song;
- `Song: none inherited (this act has no <donor> <zone> clip yet)`;
- `Song: none inherited (the act's <donor> <zone> clips name no song)`;
- `Song: none inherited (the act's <donor> <zone> clips disagree: SONG_A, no song)`.
No picker. No U+2014 (the dash gates pass; a row holds it over a census of every pair in every manifest used).

## 3. What changed

| File | Change |
|---|---|
| `src/core/formats/donors/clip-manifest-doc.ts` | `zoneSong` (inherited, or none with `new-zone` / `none-named` / `disagree`) and `zoneSongLine`; `zoneMusic` now derives from `zoneSong`, so the line and the written `music` cannot disagree |
| `src/core/formats/donors/refused-subjects.ts` (new) | `subjectRect`, `resolveRefusedSubjects` (placed / offPane), `subjectsLabelOnPane`, `ruleTag` |
| `src/renderer/state/donor-paste.ts` | pasted outcome carries `song` (from the act BEFORE the clip); refused outcome carries `judged`; `bakeRefused` beside `bakeNote`; `bakeNoteText(v, doc)` names off-pane subjects; `clearRefusal()`; draft and marquee subscriptions |
| `src/renderer/components/donors/target-outlines.ts` (new) | the target pane's outlines as data: `targetPaneOutlines`, `refusedOutlines` |
| `src/renderer/components/donors/ZonePane.tsx` | `PaneOutline` (`dashed`, `tag`), `OUTLINE_DASH`; the paint report carries the outlines it drew |
| `src/renderer/components/donors/DonorTargetPane.tsx` | outlines from `targetPaneOutlines` (paste outcome and re-bake refusal) |
| `src/renderer/components/donors/DonorsCanvas.tsx` | unmount clears a paste refusal |
| `src/renderer/components/donors/DonorPasteSection.tsx` | `SongLine` on the form; the summary's `data-donors-outcome-song`; the refusal head names off-pane subjects; `outcomeView` exported for render rows |
| `scratchpad/donor-page-harness.mjs` | rows DP.5s, DP.6s, DP.7o, DP.7l, DP.7e, DP.9s, DP.10, DP.10t (section 5) |

Commits (first parent, oldest first): `b12d7579` (222), `99adf914` (213 (b)), `311f907c` (pair on one rectangle),
`082fc922` (harness rows and the tag placement), `68b4767d` (DP.10t honesty fix), `7b06e8ea` (shaft/fill kinds),
`786da86a` (merge of master `f8113f7d`), then this packet and the ROADMAP rows.

**No aeon-output fixture was added or edited.** Every row reads the existing `validate-json.cases.json`,
`bake-json.cases.json` and `paste-music.cases.json` (re-captured at aeon `b85e60d2` by row 231 on master; my rows ran
green on both captures) and the vendored manifests.

## 4. Unit, store and render rows (one property each), red-first

New: `test/formats/paste-song-line.test.ts` (6), `test/formats/donor-paste-song-render.test.ts` (3),
`test/formats/refused-subjects.test.ts` (8), `test/formats/donor-refusal-render.test.ts` (2), and in
`src/renderer/state/__tests__/donor-paste.test.ts` 3 song rows and 11 outline rows. Changed: that file's re-bake
refused-note row, which pairs aeon's C4 answer (clip 0 `ehz_cut`) with `s2_two_clip_pins` (clip 0 `ehz_s1`): it now
asserts `(not on this pane)`, which is exactly the property.

Each mutation was put on disk (the `// MUTATION` line and `git diff --stat` printed), run red, then restored with
`git restore --source=HEAD` from the committed baseline, `git status` clean, and the files re-run green.

| # | Mutation (as on disk) | Red rows |
|---|---|---|
| S1 | `if (s.kind === 'inherited') return \`Song: ${s.song}\`; // MUTATION S1` | 4: core inherited, render form line, store summary, store wrote-song |
| S2 | `zoneSong(next, ...) // MUTATION S2` (song read after the clip is added) | 1: store new-zone summary |
| S3 | `songs.length >= 1 && songs[0] !== null /* MUTATION S3 */` (first song wins) | 2: core disagree (aeon's R3-refused manifest), clip-manifest-doc disagree |
| S4 | summary span renders `{''}` | 1: render summary repeats |
| M1 | id not checked in `subjectRect` | 3: core C4 id mismatch, store re-bake note, render C4 |
| M2 | corridors read from the clips list | 1: core clip+corridor |
| M3 | first subject only | 3: core pair, core clip+corridor, store pair |
| M4 | paste refusal placed on `target.doc`, not the judged manifest | 4: store R3 outline, and the three clear rows through their own preconditions |
| M5 | `clearRefusal` does nothing | 2: store edit clears, store marquee clears |
| M6 | `clearRefusal` clears any outcome | 1: store "a pasted summary survives it" |
| M7 | re-bake refusals not kept (`bakeRefused: null`) | 3: store re-bake outline, edit-does-not-clear, next-bake-clears |
| M8 | a draft edit also clears `bakeRefused` | 1: store edit-does-not-clear |
| M9 | `dashed: false` | 1: store R3 outline |
| M10 | an accepted re-bake keeps `bakeRefused` | 1: store next-bake-clears |
| M11 | label drops the off-pane words | 3: core label, render C4, store re-bake note |
| M12 | dedupe key without the subject index | 1: store pair on one rectangle |
| M13 | every non-clip kind read as a corridor | 1: core shaft kind |

The shaft row and the pair-on-one-rectangle row start from aeon's real answers with one field rewritten (the subject's
kind to aeon's `shaft`; clip 1's rectangle moved onto clip 0's), because no captured answer has those shapes: the
reader refuses shaft subjects today (row 232), and aeon's R10 capture judged a partial overlap.

## 5. Harness (`npm run harness:donor-page`, `scratchpad/donor-page-harness.mjs`)

Run under xvfb after `VITE_AURORA_DEBUG=1 npm run build`, with `AURORA_BUILT_TREE=<this worktree>`,
`ELECTRON_BIN=<main checkout>/node_modules/.bin/electron`, `AEON_DIR=<git archive copy>`, `TMPDIR` under `$HOME`.
Every run printed `in-tree: yes`, `dpr 1`.

- baseline (unmodified harness, new code): 15/15 PASS at aeon copy `cffdf716`;
- final before the merge, HEAD `68b4767d`: **23/23 PASS, 0 FAIL, 0 UNMEASURABLE** at `cffdf716`, `src on disk: identical to HEAD`;
- after the master merge, HEAD `786da86a`: **23/23 PASS, 0 FAIL, 0 UNMEASURABLE** at aeon copy `b85e60d2`.

New rows. All clicks and keys are CDP `Input.dispatch*` events.

| Row | What it holds |
|---|---|
| DP.5s | before the first paste the form reads the tree's `zoneSongLine` for the new act, a "none inherited" sentence, and the act has no file on disk |
| DP.6s | the success summary repeats DP.5s's DOM sentence word for word |
| DP.7o | on the R10 refusal the pane's paint report carries exactly two dashed warning outlines tagged R10 (clip 0 as on disk, clip 1 the draft); the canvas read back along the rectangle's top edge shows warning pixels in runs (95 of 193 px, 19 runs), where the same edge read just before the refusal showed 0 (the control) |
| DP.7l | a real click on the Layout pill unmounts the page, a real click on Donors brings it back: the refusal is gone, the report has no dashed outline, the edge reads 0 |
| DP.7e | the same paste refused again with both outlines (edge warn > 0), then a real keystroke in the clip id clears the refusal, its text and its outlines (edge 0) |
| DP.9s | a real click on the copy's `s2_ehz_cpz`: the form reads `Song: <music> (from s2disasm EHZ)` with the song the harness reads from that clips.json on disk (every EHZ clip agreeing) |
| DP.10 | **a real bake refusal on screen.** The harness paints the copy's EHZ collision exactly as aeon's own test does (`2 << PLANE_RESERVED_SHIFT` on plane A, `1 <<` it on plane B, one cell inside the marquee; the shift read from the copy's `collision_pipeline.py`), starts a fresh act by real clicks and pastes. Its OWN `validate --json` of the same manifest exits 0 and its own `bake --json` exits 1 naming C4 and the clip; the page shows stage bake, rule C4 and `clip 0 <id>` exactly as that answer names them, one dashed warning outline tagged C4 at the pasted rectangle (edge 0 before, dashed after), and no clips.json on disk |
| DP.10t | the tag is under the id label: warning pixels 0 in the id band (rows 3 to 14 from the top edge) and more than 5 in the band below (56 measured) |

Harness mutations (each built with `VITE_AURORA_DEBUG=1 npm run build` and run; restored from HEAD, rebuilt, re-run):

| # | Mutation | Result |
|---|---|---|
| H1 | the pre-fix tag placement `y + (o.label ? 26 : 13)` | 22/23: DP.10t only (id band warn 48, tag band 0) |
| H2 | `DonorsCanvas` no longer clears on unmount | 22/23: DP.7l only (outcome still `refused`, two dashed, edge warn 95) |
| H3 | no refused outlines reach the pane | 19/23: DP.7o, DP.7e, DP.10, DP.10t. DP.7l stays green, as it must: with nothing drawn there is nothing to clear, and its precondition is DP.7o in the same run |
| H4 | no song line on the form | 20/23: DP.5s, DP.9s, and DP.6s (which compares against DP.5s's line, so it is not independent of DP.5s; its own property is held by the render row and mutation S4) |
| H5 | a draft edit clears nothing | 22/23: DP.7e only |

Honesty correction made during the proofs: DP.10t first also required a `lit` count in the id band; H1's red run
showed `lit` 480 of 480 in BOTH bands (the art under the rectangle is bright), so it discriminated nothing and was
removed (`68b4767d`); the row rests on the two warning counts.

## 6. Suite

PENDING: filled after the final run on the committed tree.

## 7. Open

- **213 (c)**, unchanged: no UI path reaches the crash view (the page always sends valid JSON), so a crash is held by
  unit rows and fidelity F6/F7, not the harness.
- **Row 232** (booked by the overseer): the reader refuses `shaft` / `fill` subjects as a crash. Once it passes them,
  the target pane will name them "not on this pane" (it draws no shafts or fill): drawing a shaft's rectangle would
  need `ClipManifestDoc` to read `shafts`, which it does not.
- The canvas pixel reads in the harness were taken at dpr 1 only (every run here came up at 1); the edge and band
  reads go through the canvas's own backing-store ratio, but a dpr 1.35 run has not been observed.
- `window.__dbg.donors.state().paste.outcome` now includes the refused outcome's `judged` manifest (a whole
  `ClipManifestDoc`), so harness detail lines that print the outcome are longer; nothing reads it.

## 8. Judgement calls

1. **What an "edit" is.** Any change to the drafted clip (id, destination, snap mode, reason) or to the marquee or
   donor zone clears a paste refusal. The refusal TEXT goes with the outlines (the ruling ties the outline's life to
   the refusal's). A new target act, undo and redo already replaced the outcome.
2. **Leaving the page clears only a paste refusal.** A re-bake refusal describes the act on disk, which leaving does
   not change; its outline lives exactly as long as its note (the next bake run). Coming back shows the note and its
   outline again, because both are still true.
3. **The song sentence is taken from the act BEFORE the clip is added** (the same doc `zoneMusic` reads), so a
   zone new to the act reads "no ... clip yet", not "its clips name no song" (which the post-paste doc would say).
   Mutation S2 holds this.
4. **A third "none" reason.** The ruling named two reasons (clips disagree / none named); a zone new to the act is a
   third case with its own reason, `this act has no <donor> <zone> clip yet`.
5. **The C1 harness row became C4**, the rule aeon now uses for the same kind of refusal (the bake's own, naming the
   clip, on a manifest the loader accepts).
