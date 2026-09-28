# CLIP-REFUSAL-SHAFT-FILL-SUBJECTS: a shaft or fill refusal is a refusal, not "aeon crashed" (review packet, 2026-09-28)

ROADMAP row 232. Branch `parcel/clip-refusal-subjects-232`, cut from master `69c4de2c`. Found by row 231 (packet
`docs/reviews/2026-09-28-revendor-77fc6fb6.md`, section 5 side finding and Open).

## 1. The defect, re-measured

At master `69c4de2c`, `readSubject` in `src/core/formats/donors/clip-validate-json.ts` (line 85) returned an error
string for any subject whose `kind` was not `clip` or `corridor`. `readNote` turns that string into a malformed
answer, and `readClipToolJson` reports a malformed answer as `crashed`. So a real aeon K8 or K9 refusal on the woven
act reached the donor page as "aeon's loader's answer is malformed", that is, as a crash. The row's claim held.

The first commit on this branch proves it on real output: with the three new vendored cases (section 3) and the old
reader, `test/formats/clip-tool-outputs.test.ts` had exactly three reds, the per-case refusal rows for
`refuse_k8_fill_no_why`, `refuse_k9_shaft_dup_clip_id` and `refuse_k9_shaft_ledge_pitch`.

## 2. The aeon revision, and the subject-kind census

aeon **`e47493aa2d443b5090380ce3eba9f6a22b4b3898`**, `origin/master` after `git fetch -q origin` at 2026-09-28T04:48:10Z.
aeon was read only through git objects (`git show <rev>:<path>`). `tools/clip_manifest.py` there is blob `d1cd32ad`, the
same blob row 231 pinned at `b85e60d2`. `git log b85e60d2..e47493aa -- tools/clip_manifest.py games/sonic4/data/clips`
is empty. The row says shaft and fill subjects exist "since aeon `cffdf716`". I did not re-derive that date, only that
both kinds exist at the pin.

Every subject in `tools/clip_manifest.py` is built by one function, `subject(kind, index, ident)` (line 432), which
returns exactly `{"kind", "index", "id"}`. Line numbers below are at `e47493aa`:

| kind | index means | id | built at |
|---|---|---|---|
| `clip` | position in `clips` | the clip's id; null for a non-object or a missing/non-string id | 1098, 1100, 1105 (literals); `_subject_of` (438-441) at 913, 1158-1264, 1334, 1355, 1527 |
| `corridor` | position in `corridors` | as clip | 1274, 1276, 1281; `_subject_of` |
| `shaft` | position in `shafts` | as clip | 1415, 1417, 1422 (K9); `_subject_of` for K7 (1368), an R10 overlap (1334) and K8's "meets the fill" pair (1527) |
| `fill` | always 0 | always null | 1497 (K8); the header states the exact dict `{"kind": "fill", "index": 0, "id": null}` at line 280 |

`_subject_of` picks `clip`, `shaft` or `corridor` by the object's class. No other code in the file writes a `kind`.
`tools/clip_act_bake.py` (blob `958958b5`) builds one subject of its own, `clip` for C4 (line 783), through
`clip_manifest.subject`. Its page-budget refusal has `subjects: []`. K10 (`clip_manifest.py` 1896) raises with no
subjects, so it is act-level. `git grep 'subject('` over aeon's `tools/` finds no other builder. So there are
**four kinds, one shape**.

## 3. The real cases, and how they were produced

The existing mechanism was extended, not bypassed. `test/fixtures/clips/aeon-outputs/gen_validate_json.py` now has
three more plan entries. Each one is the least edit of the real `s2_woven` act that trips one rule:

| case | mutation (generator function) | aeon's answer |
|---|---|---|
| `refuse_k8_fill_no_why` | `del fill.why` (`mut_k8_fill_no_why`) | K8, subjects `[fill 0 null]`, plus the woven act's 10 W3 warnings, which are raised before the fill loads and kept |
| `refuse_k9_shaft_ledge_pitch` | `shafts[3]` (`ehz_to_hpz`) `ledges.pitch` 64 -> 96 (`mut_k9_shaft_pitch`) | K9, subjects `[shaft 3 ehz_to_hpz]`. aeon's message gives the reach as 85 px |
| `refuse_k9_shaft_dup_clip_id` | `shafts[0].id` = `clips[0].id` (`mut_k9_shaft_dup_clip_id`) | K9 pair, subjects `[clip 0 wfz_deck, shaft 0 wfz_deck]` |

The three woven cases also record `manifest`, the mutated act that aeon judged (as `paste-music.cases.json` does). The
pane rows place subjects on that manifest, so no test has to re-type a mutation.

Run: `git archive e47493aa` extracted into `$HOME/.cache/aurora-revendor-aeon/tree`, the same path row 231 used, so the
two crash tracebacks' absolute paths do not change. In that copy, `tools/s2_zone_convert.py convert --all-six` gave
exit 0, 6 zones, 2219040 cells round-tripped, 0 differing, 0 FAILED. Then
`EMPYREAN_SUITE_ROOT=<suite> python3 <aurora>/test/fixtures/clips/aeon-outputs/gen_validate_json.py ../vj2 <out>` ran
from the copy: twelve real subprocesses, exit 0. I compared the result case by case with the committed bundle: all
nine earlier cases are identical in exit, stdout and stderr. The provenance marker
(`validate-json.cases.provenance.json`) now pins revision `e47493aa`, adds `s2_woven/clips.json` (`30e2fc14`) to
`inputs` (the currency row derives the inputs from the generator's plan), and has new fixture and generator hashes.

## 4. The fix

- `clip-validate-json.ts`: `CLIP_SUBJECT_KINDS = ['clip', 'corridor', 'shaft', 'fill']`, and `ClipSubject.kind` is that
  union. Any other kind is still malformed, so it is still a crash, and the crash names the kind:
  `a subject's kind is "tunnel", not one of clip, corridor, shaft, fill`. A `fill` subject that is not index 0 / id null
  is malformed too, because aeon says there is one fill and it has no id. The header carries the census.
- `subjectLabel`: `shaft 3 ehz_to_hpz` (the clip/corridor form). A fill reads as `the act's fill`
  (`FILL_SUBJECT_LABEL`), because its index 0 and null id tell a person nothing.
- Row 213(b), `refused-subjects.ts` `subjectRect`: now an exhaustive `switch` over the four kinds. `shaft` and `fill`
  are never placed. Each is named `(not on this pane)` and is never looked up in another kind's list. The reasons, as
  the code comment states them:
  - A shaft HAS a rectangle (`dst_rect`), but the target pane draws no shafts (`target-outlines.ts` draws clips and
    corridors only), and `ClipManifestDoc` has no shaft view. Outlining a shaft would put the first shaft ever on that
    pane, and nobody has ruled that look. See Open.
  - The fill is the act's background rectangle around everything else. aeon's woven fill is the whole act
    (10240x8192), so an outline would only frame the pane.

  So a K9 clip+shaft pair outlines the clip and names the shaft. `target-outlines.ts` needed no change, because it only
  draws what `resolveRefusedSubjects` places. The other consumers are `DonorPasteSection.tsx` (through
  `subjectsLabel`/`subjectsLabelOnPane`) and `donor-paste.ts` `noteLine` (through `subjectsLabelOnPane`). Both go
  through the labels, so both show the new kinds without edits. `src/main/clip-tool.ts` only imports types.

## 5. Tests, and the red-first proof

New rows. Every expectation is read from the vendored aeon stdout or the judged manifest:
- `test/formats/clip-tool-outputs.test.ts`, describe "validate --json on a woven act":
  - an anti-vacuous row (aeon tagged the cases K8/K9 and named fill/shaft);
  - K8, K9 and the K9 pair are REFUSED with aeon's rule and subjects (a crash prints its `why`);
  - labels;
  - a planted `tunnel` kind is still a crash naming the kind;
  - a planted fill at index 1, and one with id `fill_b`, are crashes.
  The per-case refusal loop also picks up the three cases automatically.
- `test/formats/refused-subjects.test.ts`:
  - the real K9 pair outlines the clip at its `dst_rect` and puts the shaft in `offPane`. The row is anti-vacuous:
    `clips[0]` carries the shaft's id, so a kind-blind lookup would place the shaft there;
  - the real K9 single and the real K8 are both off the pane, and the fill's label is `the act's fill (not on this pane)`.
  The existing planted-shaft-vs-corridor row lost its type casts and is otherwise kept.
- `src/renderer/state/__tests__/donor-paste.test.ts`: the whole store path. The act on disk is the judged woven
  manifest, a paste gets aeon's real K9 pair answer, the outcome is `refused` (not `crashed`), `refusedOutlines` is the
  one dashed warning outline at clip 0's rectangle tagged K9, the page's subject words name the shaft "(not on this
  pane)", and nothing is written.

Red-first. Each mutation was shown with `git diff`, run over the three files above, then restored with
`git checkout HEAD --` from the committed fix `59415ac4`:

| mutation | result |
|---|---|
| kind check back to `kind !== 'clip' && kind !== 'corridor'` (the pre-fix reader) | **11 failed / 109 passed (120)**: the 3 per-case refusal rows, the 3 new REFUSED rows, the label row, the fill-shape row, both new refused-subjects rows and the store row |
| kind check and fill check both `if (false)` (accept anything) | **2 failed / 118 passed (120)**: the `tunnel` row and the fill-shape row |
| `case 'shaft': hit = doc.clips[s.index]` in `subjectRect` | **2 failed / 118 passed (120)**: the refused-subjects K9 pair row and the store row |
| restored (`git status` clean) | green in the full suite, section 6 |

## 6. Suite

`TMPDIR=$HOME/.cache/aurora-tmp-232 VITEST_MAX_WORKERS=4 npm test`, foreground-equivalent (detached to a log with an
end marker, polled to the marker), with the code at `59415ac4`. Exit 0, and every `check:*` step and `typecheck` passed:
- Files: **674 passed | 3 skipped (677)**.
- Tests: **10517 passed | 20 skipped (10537)**.
- run-completeness: COMPLETE, 677 of 677 module(s) this run selected finished.
- skip-report: OK. Every skip named its reason.
- failure-class: no failures in this run (677 module(s) reported).

I did not run master `69c4de2c`'s suite, so this packet gives no before/after delta. `npx tsc --noEmit`: exit 0. The final run on the committed docs is in the report,
not here, so this packet does not quote a run that postdates it.

## 7. Open

- **A look call, for the overseer:** should the target pane outline a refused SHAFT at its `dst_rect`? The rectangle
  exists and the ruled refusal look (dashed, warning, rule tag) would apply as it is. But the pane draws no shafts
  today, so the refusal outline would be the only shaft it ever shows. Until that is ruled, a shaft subject is named
  "not on this pane". A fill should stay unoutlined whatever is decided (it is the act's background).
- **Aeon side finding, not filed there:** the K9 duplicate-id message reads "shaft id 'wfz_deck' is already used by 0".
  At `e47493aa`, clip ids record their owner in `seen_ids` as the bare index (`clip_manifest.py` 1119), corridors
  record `corridors[i]` (1291), and the corridor message wraps a clip owner as `clips[...]` (1289), but the shaft
  message prints the owner raw (1429), so a clip owner shows as `0`. It is cosmetic, aeon's to fix, and Aurora shows it verbatim. `refuse_k9_shaft_dup_clip_id` carries it.
- The header comment's rule-tag list at the top of `clip-validate-json.ts` ("R1..R12, K1..K3, W2, W3") is aeon's
  1d9afb25 wording and predates K4..K11. The reader accepts any string tag, so nothing breaks. I left it as a cited
  quotation.
- No runtime (Electron/CDP) check was run. The rows here are node tests over the store and the outline data.
  **TAG for foreground:** on a woven act, a real K9 paste refusal on screen, to see the words and the single outline.
