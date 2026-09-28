# REFUSED-SHAFT-TAG-AT-WHOLE-ACT: every refusal outline named on hover, and a clip or corridor past the act named, not outlined (review packet, 2026-09-28)

ROADMAP row 236, left open by row 233 (`docs/reviews/2026-09-28-refused-shaft-233.md`, section 7). Branch
`parcel/refusal-hover-236` from master `450d0a04`.

## 1. The defects, re-measured on master

- **(a)** `ZonePane`'s `onPointerMove` built the canvas `title` from outlines that carry a `label` (an id).
  A refused outline carries a `tag` (the rule) and no label. On master, with aeon's real K9 pair on the woven
  act (`refuse_k9_shaft_dup_clip_id`), the names at the refused shaft's centre were `[]`. At whole-act scale
  (0.035) the label layout hides the shaft's K9 tag, and the shaft has no standing outline beneath it, so
  nothing on the pane named it. On screen, with a real CDP mouse move to the shaft's centre, the canvas title
  read `""` (section 5.2, M-a1 and M-a2). The defect holds.
- **(b)** `subjectRect` applied the pane-world overlap test to shafts only. On master, a clip on the woven
  manifest moved to `x = grid_w x SECTION_PIXEL_SIZE` came back PLACED at `(10240, 1920, 2176, 1920)`. That
  is an outline nobody can see, with plain words and no "(not on this pane)". A corridor behaves the same way.
  The defect holds.

## 2. The cases

No vendored aeon case puts a CLIP or CORRIDOR past the act. Aeon refuses one with R8 (clip) or K2 (corridor),
"dst_rect (...) runs past the declared ... act" (`tools/clip_manifest.py`, read at aeon `19b960d4`, not
vendored). As the brief allows, the (b) rows are **plants** on the real woven manifest aeon judged
(`validate-json.cases.json`, `refuse_k9_shaft_past_act`'s `manifest`). Each plant makes the minimum edit:
one rectangle's `x` moves to `grid_w x SECTION_PIXEL_SIZE`, the same move `gen_validate_json.py` makes for
`shafts[2]` in `mut_k9_shaft_past_act`. The subject is the one aeon's `_subject_of` would name, `{kind, index,
id}`, read from that manifest. The refusal around it carries rule R8 or K2 and an empty message. It is
labelled a plant in the test and is **not** claimed to be aeon output. Every (a) row uses aeon's real refusals.

## 3. The fix

**(b)** `src/core/formats/donors/refused-subjects.ts`, `subjectRect`: the overlap test against `actWorldRect(doc)`
now applies to every placed kind, not only `shaft`. The header comments in `refused-subjects.ts` and
`target-outlines.ts` and the note in `DonorTargetPane.tsx` now say "subject" instead of "shaft".

**(a)**, as ruled (the overseer, 2026-09-28, under the owner's 2026-09-18T19:27:49Z permission):
- `refused-subjects.ts`: `refusalHoverName(rule, subject)` returns `` `${rule}: ${subjectLabel(subject)}` ``,
  where `rule` is already `ruleTag`'s output. It adds no new wording, and the shape is the ruled example
  "K9: shaft 0 wfz_to_ehz".
- `ZonePane.tsx`: `PaneOutline` gains `hover?: string`, the name the pane's hover uses. The canvas never
  draws it.
- `target-outlines.ts` `refusedOutlines`: every refused outline, of every kind, carries
  `hover: refusalHoverName(p.rule, p.subject)`. The dedup key is unchanged.
- `pane-hover.ts` (new; its first commit `af97a6e8` is a verbatim extraction of ZonePane's hover code with
  no behaviour change): `outlineNamesAt` names each outline under the point by `hover`, else by `label`, in
  paint order, each name once. `ZonePane` sets the canvas `title` to these names joined by newlines, as
  before.
- The on-canvas tag is unchanged: it is still laid out by `pane-labels.ts` and hidden when there is no room.

## 4. Tests, and the red-first proof (`npm test`)

**(b)** `test/formats/refused-subjects.test.ts`, four rows (clip and corridor, each "wholly past" and "partly
past"):
- **Wholly past** (plant): nothing is placed, the subject is in `offPane`, and the words read `<kind> <index>
  <id> (not on this pane)`. The row stays anti-vacuous: the manifest still opens, the rectangle is at that
  index with that id, and `x >= grid_w x SECTION_PIXEL_SIZE`.
- **Partly past** (plant, x = world width minus half of min(w, a section)): the subject is still placed at its
  rectangle. The test is overlap, not containment.

| state of the source | result (refused-subjects.test.ts) |
|---|---|
| master's `subjectRect` (the tests only added) | **2 failed / 16 passed (18)**: both "wholly past" rows, each with the subject in `placed` (clip: `x: 10240`) |
| committed fix `048ebf72` | **18 passed (18)** |
| M-b1 on `048ebf72`: containment instead of overlap (`{ const W = actWorldRect(doc); if (!(hit.dst.x >= W.x && hit.dst.y >= W.y && hit.dst.x + hit.dst.w <= W.w && hit.dst.y + hit.dst.h <= W.h)) return null; }`, diff printed before the run) | **2 failed / 16 passed**: both "partly past" rows |
| restored with `git checkout HEAD --` from committed `048ebf72` (tree clean before the mutation, checked) | **18 passed (18)** |

**(a)** `src/renderer/components/donors/__tests__/pane-hover.test.ts` (new) and
`src/renderer/state/__tests__/donor-paste.test.ts`:
- **Census**: every refused outline of every real placing refusal (R3 paste-music; R10 clip pair on
  `s2_two_clip`; R10 clip+corridor on `s2_ehz_cpz`; the K9 clip+shaft pair; the K9 ledge-pitch shaft) is named
  at its centre as `` `${ruleTag(rule)}: ${subjectLabel(s)}` ``. Each case places every subject, and the
  kinds covered are asserted to be exactly clip, corridor and shaft.
- **The ruled shape, spelled out once**: on the K9 ledge case with the full `targetPaneOutlines`, the shaft's
  centre names exactly `["K9: shaft 3 ehz_to_hpz"]`, built from aeon's stdout as `<rule>: shaft <index> <id>`.
- **One-rectangle pair** (plant: aeon's R10 pair with clip 1 moved onto clip 0): the hover names both
  subjects, one line each.
- **Standing clip** (guard): a faint outline is still named by its id alone.
- **Store path** (`donor-paste.test.ts`): after aeon's real K9 pair on the woven act, the refused shaft's
  centre names exactly `K9: shaft 0 wfz_deck`, and the refused clip's centre names `[wfz_deck, "K9: clip 0
  wfz_deck"]`.
- Two existing exact-outline rows in `donor-paste.test.ts` (R3, K9 pair) now include the ruled `hover`.

| state of the source | result (pane-hover + donor-paste) |
|---|---|
| `af97a6e8` (the extraction; master's behaviour) with the new rows | **4 failed / 34 passed (38)**: census (`expected [] to include 'R3: clip 2 ehz_1'`), ruled shape (`expected [] to deeply equal [ 'K9: shaft 3 ehz_to_hpz' ]`), one-rectangle pair, store path (`expected [] to deeply equal [ 'K9: shaft 0 wfz_deck' ]`) |
| committed fix `8199b8a4` | **38 passed**, and 56/56 with refused-subjects |
| M-a0 on `8199b8a4`: `const name = o.hover;` (label dropped; diff printed before the run) | **2 failed / 36 passed**: the standing-clip guard and the store-path row (its clip centre loses `wfz_deck`) |
| restored with `git checkout HEAD --` from committed `8199b8a4` (tree clean after) | not re-run on its own; the full suite at `848e156c`, whose `src/` equals `8199b8a4`'s, is green (section 6) |

## 5. On screen: `scratchpad/donor-page-harness.mjs` (`npm run harness:donor-page`)

### 5.1 The rows

- **DP.12h (new)**: after DP.12o's real K9 paste on `s2_woven` (clip id `wfz_to_ehz`, shaft 0's), at
  whole-act scale (the row also checks, from the paint report read after the move, that the shaft's K9 tag is
  hidden, so it holds the case the ruling is about), the row sends a REAL mouse move (`Input.dispatchMouseEvent` `mouseMoved`) to an integer client pixel at shaft 0's centre and
  derives the world point back through the pane's own view. The row asserts that the point is inside the
  shaft and that no clip or corridor on disk covers it. It reads the target canvas's `title` off the app, and
  that title must equal exactly `[<rule>: <kind> <index> <id>]` for the shaft subject of the harness's OWN
  `validate --json` of the same candidate.
- **DP.7o, DP.10 and DP.12o** now expect the ruled `hover` on each dashed outline, built from the ids the
  harness reads on disk, the draft, and its own validate or bake subjects. DP.12t compares against DP.12o's
  expectation, so it now includes `hover` too.

### 5.2 Runs

All runs used the worktree after `VITE_AURORA_DEBUG=1 npm run build`, with `ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`,
`AURORA_BUILT_TREE=<worktree>` and `AEON_DIR=$HOME/.cache/aurora-revendor-aeon/tree` (the git-archive copy at
aeon `8dbd134b` that row 233 used), under the harness's own `xvfb-run`. Every run printed `root:` = the worktree,
`pinned: AURORA_BUILT_TREE=<worktree>` and `in-tree: yes`, at dpr 1.

| app | harness |
|---|---|
| committed `848e156c` (`src on disk: identical to HEAD`) | **38/38 PASS, 0 FAIL, 0 UNMEASURABLE**. DP.12h: view scale 0.0350341796875, aim (567,628) -> world (2180.01, 1678.27) inside shaft (2048,1408,256,512), nothing on disk under it, tag hidden `true`, title before `""`, after `"K9: shaft 0 wfz_to_ehz"` |
| M-a1: `pane-hover.ts` names by `o.label` only, i.e. master's hover (`src on disk: DIFFERS FROM HEAD`) | **37/38, 1 FAIL**: DP.12h only, title after `""`. The outlines still carry `hover`, so DP.12o passes. This shows DP.12h reads the app's hover, not the paint report. |
| M-a2: `refusedOutlines` without `hover`, i.e. master's outlines (`DIFFERS FROM HEAD`) | **33/38, 5 FAIL**: DP.7o, DP.12o, DP.12t (the exact dashed-outline lists lack `hover`), DP.12h (title `""`), DP.10 |
| restored with `git checkout HEAD --` from committed `848e156c` after each mutation (M-a1, then M-a2); after the last, rebuilt and re-run | **38/38 PASS** (the final run, `src on disk: identical to HEAD`; its figures are the first line of this table) |

### 5.3 Screenshots (SHOT_DIR, from the final 38/38 run; for a person, never read by a row)

- `docs/reviews/236-refusal-hover/k9-shaft-hover.png`: the whole window at the moment of the hover. The panel
  shows aeon's K9 words and both subjects.
- `docs/reviews/236-refusal-hover/k9-shaft-hover-pane.png`: the pane at 2x, whole-act. The shaft's dashed
  warning outline sits under `wfz_deck` with no tag.

**Neither picture shows the tooltip itself.** The row reads the `title` attribute, which is the text Chromium
shows as a native tooltip. I tried a capture of the whole Xvfb root window (ImageMagick `import`) at the
hover: Chromium drew no tooltip there either. A tooltip evidently needs a real X pointer, not CDP-injected
input. The experiment was discarded and is not in the harness. So what the pane names is measured by DP.12h,
and whether a person sees it rendered as a tooltip box is **not verified** here.

## 6. Suite

`TMPDIR=$HOME/.cache/aurora-tmp-236 VITEST_MAX_WORKERS=4 npm test` at `848e156c` (clean tree), exit 0:

```
 Test Files  678 passed | 3 skipped (681)
      Tests  10594 passed | 20 skipped (10614)
skip-report: 20 SKIPPED test(s) in 8 file(s). A SKIP IS NOT A PASS:
skip-report: OK. Every skip named its reason.
failure-class: no failures in this run (681 module(s) reported).
run-completeness: COMPLETE, 681 of 681 module(s) this run selected finished.
```

The report gives the run on the final tip, after this packet and the screenshots.

## 7. Open

- **Tooltip rendering is not verified on glass** (section 5.3). An owner's hover with a real mouse is the only
  check left. The `title` it would show is measured.
- **The hover name joins lines with `\n` in a `title`.** When a refused outline sits on a clip, the hover
  shows the id and then the refusal line (e.g. `wfz_deck` / `K9: clip 0 wfz_deck`), as the store-path row
  holds. That follows from the ruling ("every refusal outline names itself"), so I did not dedupe the id
  against the refusal line.
- **An untagged refusal with subjects** (`rule: null`) would read `untagged: clip ...` via `ruleTag`. No real
  aeon case has one (the only untagged cases are act-level with no subjects), so no row holds that spelling.
- (b) rests on plants, because aeon has no vendored R8 or K2 past-the-act case. If one is vendored later, the
  plant rows can be pointed at it.
