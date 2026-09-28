# REFUSED-SHAFT-FOLLOWUPS-FROM-232: aeon's owner label re-vendored, a refused shaft outlined, a real K9 on screen (review packet, 2026-09-28)

ROADMAP row 233. Branch `parcel/refused-shaft-233`, cut from master `b4f2c501` (the commit that ruled part (a)). It
follows up row 232 (packet `docs/reviews/2026-09-28-clip-refusal-subjects-232.md`, sections 3, 4 and 7). The parts are
reported in the order they were done: (c), then (a), then (b).

## 1. The defects, re-measured

- **(c)** At `b4f2c501`, `test/fixtures/clips/aeon-outputs/validate-json.cases.json` quotes K9's "shaft id 'wfz_deck' is
  already used by 0" and pins `tools/clip_manifest.py` blob `d1cd32ad`. Aeon changed that file, so the currency rows go
  red. The row predicted one red marker. There are **six**: every marker in `aeon-outputs/` pins `clip_manifest.py`,
  either as its tool or as an input. With the pre-233 fixtures and aeon `origin/master` `751eaa1b`,
  `test/formats/clip-tool-outputs.test.ts` gave **6 failed / 98 passed (104)**: two "tool ... is the blob it was captured
  from" rows (validate-json, paste-music) and four "each pinned input ... is the blob" rows (the three clipacts,
  bake-json).
- **(a)** At `b4f2c501`, `subjectRect` returns null for every `shaft` subject, so a refused shaft is never outlined.
  Row 232 left that as an unruled look. The overseer ruled it at `b4f2c501`: outline a refused shaft at its `dst_rect` in
  the ruled refusal look, keep "(not on this pane)" for a shaft off the pane, and leave the fill unoutlined.
- **(b)** Nothing had driven a K9 refusal on screen yet.

## 2. The aeon revision

aeon **`8dbd134bbeeabc6700defcd15f4d51db71f64042`**. I derived it after `git fetch -q origin` (2026-09-28T07:25:40Z) as
`git log -1 --format=%H origin/master -- tools/clip_manifest.py`. It is the CLIP-MANIFEST-OWNER-LABEL code commit, merged
to `origin/master` at `e6b4c555`; `origin/master` itself was `751eaa1b`. I read aeon only through git objects.
`tools/clip_manifest.py` moved from `d1cd32ad` to `4392dc52`. R3, K1 and K9 now print the stored owner label
(`clips[i]` / `corridors[i]` / `shafts[i]`), and K1 no longer says "or an earlier corridor". I checked every other
pinned input of all six markers: each has the same blob at `8dbd134b`, `e6b4c555` and `751eaa1b` as at its previous pin
(`e47493aa` for validate-json, `b85e60d2` for the other five).

I made the copy exactly as `materialised_by` says. `git archive 8dbd134b` was extracted into
`$HOME/.cache/aurora-revendor-aeon/tree`; the previous copy was moved aside to `tree.prev-e47493aa`, not deleted. In the
copy, `tools/s2_zone_convert.py convert --all-six` gave exit 0, 6 zones, 2219040 cells round-tripped, 0 differing and
0 FAILED. The donor sources were s2disasm `e45ebf33` and s2-simonwai-disasm `0113ca47`, the HEADs the markers name.

## 3. The cases

### 3.1 Re-vendor (c): every marker, every case

Each `fixture.command` was re-run from the copy with the markers' own scratch paths (`../vj2`, `../pm`, `<scratch>/bj`,
`<scratch>/bake_*`), and each output was compared with the committed one case by case:

| fixture | outcome |
|---|---|
| `validate-json.cases.json` (13 cases) | **1 changed text:** `refuse_k9_shaft_dup_clip_id`'s K9 message went from "... is already used by 0; ..." to "**... is already used by clips[0]; one name is one rectangle**". Its rule, subjects, exit and manifest did not change. **2 moved only line numbers:** in `crash_not_json` and `crash_missing_path`, the `clip_manifest.py` traceback lines went up by 3 (`<module>` 2323 -> 2326, `main` 2319 -> 2322, `_mode_validate` 2279 -> 2282, `validate_json` 2253 -> 2256), from aeon's three new comment lines above `seen_ids`. **The other 10 are byte-identical.** No vendored case trips R3's duplicate id or K1, so neither of those new wordings is quoted. |
| `paste-music.cases.json` (3) | byte-identical, with the same sha256. Its one refusal is R3's MUSIC rule. |
| `bake-json.cases.json` (9) | 9/9 byte-identical, with the same sha256. The crash tracebacks name `load()` lines 1051/1052, which are above aeon's edit. |
| `s2_ehz_cpz` / `s2_two_clip` / `s2_woven` `.clipact.json` | Only wall-clock `seconds` changed: `placement.seconds` 0.046 -> 0.04; 0.076 -> 0.086 with `refine_rounds[0]` 0.051 -> 0.058; 0.452 -> 0.508 with `refine_rounds[0]` 0.197 -> 0.223. They were re-vendored as captured, following the re_measure procedure and row 231's precedent. |

All six markers moved to the same pin. Each one's `revision`, `revision_is`, `materialised_by` SHA, the
`clip_manifest.py` blob (in `tool_blob` or `inputs`), `fixture.sha256` and `what_changed_at_this_pin` were updated.
These fields were edited through a JSON round trip (the files round-trip byte for byte). No fixture text was edited by
hand.

### 3.2 A real off-pane shaft (for (a) and (b))

Before this row, no vendored case put a refused shaft off the pane. Aeon has such a case: K9 "dst_rect ... runs past
the act". I extended the existing mechanism, as row 232 did. `gen_validate_json.py` gains
`mut_k9_shaft_past_act`, which moves `shafts[2]` (`wfz_to_cpz`) wholly past the act's east edge. The new `x` is
`grid_w x SECTION_SIZE`, where SECTION_SIZE comes from aeon's own `clip_manifest.geometry_constants()` rather than
being typed. The generator was re-run at the same pin in the same copy. Aeon's answer: exit 1; `K9 shaft 'wfz_to_cpz': dst_rect
(x=10240 y=1408 w=256 h=512) runs past the act (10240x8192 px)`; subjects `[shaft 2 wfz_to_cpz]`; warnings `[]`. The
case records the manifest aeon judged. The other 13 cases came out byte-identical, and the file diff is a pure
468-line insertion.

## 4. The fix (a), as ruled

- `clip-manifest-doc.ts`:
  - `shaftEntries(doc)` gives one entry per position in `raw.shafts`, so aeon's index holds even when an earlier entry
    is malformed. A non-object entry is null. `id` is null when it is not a string, and `dst` is null when the
    rectangle cannot be read. The read is lenient, so a manifest aeon would refuse K9 still opens, as it did before
    shafts were read.
  - `actWorldRect(doc)` is the pane's world: grid x `SECTION_PIXEL_SIZE`. `DonorTargetPane` now takes its
    `worldW` x `worldH` from it, so "on the pane" has one definition.
  - `overlaps` is exported.
  - `placedRects` reads shafts through `shaftEntries`. Its behaviour is unchanged.
- `refused-subjects.ts` `subjectRect`: a `shaft` subject is looked up among the SHAFTS, id-checked as clips and
  corridors are, and placed only when its `dst_rect` overlaps the pane's world. `fill` is still never placed. The
  comment that called the look "a look nobody has ruled" now states the ruling. The header now names the `shafts` list.
- `target-outlines.ts` needed no code change. `refusedOutlines` draws whatever is placed, and its header now says so for
  shafts.

**The K9 clip+shaft pair (`refuse_k9_shaft_dup_clip_id`) now gives TWO outlines**, clip 0's and shaft 0's, both dashed,
in the warning colour and tagged K9. The words drop "(not on this pane)". This does **not** match the row text as
written: its (b) says "confirm the wording and a single outline". That sentence was written before (a) was ruled. Under
the ruling, a pair naming a clip and an on-pane shaft outlines both, so two is the ruled answer.

## 5. Tests, and the red-first proof

### 5.1 Unit and store rows (`npm test`)

Every expectation below is read from aeon's vendored stdout or from the case's recorded `manifest`, and no mutation is
re-typed. Two rows plant a change to a recorded manifest, and each is labelled as a plant.

`test/formats/refused-subjects.test.ts`:
- **K9 pair**: both subjects are placed, the clip at `clips[0].dst_rect` and the shaft at `shafts[0].dst_rect`, with
  offPane `[]` and the label written plainly. It stays anti-vacuous: `clips[0]` carries the shaft's id, and the two
  rectangles differ.
- **K9 ledge pitch**: the shaft is placed at `shafts[3].dst_rect`, tagged K9 and named plainly.
- **A malformed earlier shaft does not shift the index** (plant: `shafts[0]` made a string).
- **A shaft whose dst_rect cannot be read is off the pane, and the manifest still opens** (plant: the refused shaft's
  `dst_rect` deleted).
- **K9 past the act** (`refuse_k9_shaft_past_act`): nothing is placed and the shaft is named "(not on this pane)". It
  stays anti-vacuous: the shaft is in the judged manifest at that index with that id, and its rectangle lies wholly
  outside grid x `SECTION_PIXEL_SIZE`.
- **K8**: the fill is still named off the pane (split out of the old K9+K8 row).
- The planted shaft-on-`s2_ehz_cpz` row now has a title that says what it checks: the lookup goes to the shafts and
  never to a corridor at that index.

`src/renderer/state/__tests__/donor-paste.test.ts` runs the whole store path with the act on disk set to the judged
woven manifest:
- the K9 pair gives two dashed warning outlines (clip, then shaft) and plain words;
- K9 past the act gives no outline and the words "(not on this pane)";
- nothing is written in either case.

Red-first:

| state of the source | result over refused-subjects + donor-paste |
|---|---|
| `9951640d`'s tests on `523cff7d`'s source (i.e. master's `subjectRect`, tests changed only) | **4 failed / 43 passed (47)**: the K9 pair row, the K9 ledge row, the malformed-earlier-shaft row, and the store K9 pair row. Each got the shaft in `offPane` instead of placed. |
| M1: the area check deleted (`- if (s.kind === 'shaft' && !overlaps(hit.dst, actWorldRect(doc))) return null;`) | **2 failed / 45 passed**: both past-the-act rows. |
| M2: the lenient rect read made strict (`dst = rectOf(s.dst_rect, 'shaft');`) | **1 failed / 46 passed**: the "manifest still opens" row. |
| M3: `case 'shaft': hit = doc.corridors[s.index]` | **5 failed / 42 passed**: the planted-shaft-in-corridors row plus the four placing rows. |
| each restored with `git checkout HEAD --` from committed `9951640d` (tree clean before each mutation, checked), baseline re-run | **47 passed (47)** |

The past-the-act rows, the unreadable-rect row and the K8 row are **green on master by construction**, because master
places no shaft at all. Their red-first proof is M1 and M2, not master. The diff of each mutation was printed before
its run (`scratchpad` driver, output quoted in the report).

### 5.2 On screen (b): `scratchpad/donor-page-harness.mjs` (`npm run harness:donor-page`)

The run: `VITE_AURORA_DEBUG=1 npm run build` in the worktree, then `ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron
AURORA_BUILT_TREE=<worktree> AEON_DIR=$HOME/.cache/aurora-revendor-aeon/tree` (the git-archive copy at `8dbd134b`,
not the live aeon), under the harness's own `xvfb-run`. The run printed `root:` = the worktree, `pinned:
AURORA_BUILT_TREE=<worktree>`, `in-tree: yes`, `src on disk: identical to HEAD` (HEAD `9951640d` for the green run),
dpr 1. **37/37 PASS, 0 FAIL, 0 UNMEASURABLE.** The new rows:

- **DP.12a** A REAL paste on `s2_woven` whose clip id is shaft 0's (`wfz_to_ehz`). The page checks ids against clips
  and corridors only, so it sends the paste. Aeon's loader refuses K9: "shaft id 'wfz_to_ehz' is already used by
  **clips[8]**; one name is one rectangle". The subjects are clip 8 and shaft 0, the same answer as the harness's own
  `validate --json` of the same manifest. The panel shows aeon's words and "clip 8 wfz_to_ehz and shaft 0 wfz_to_ehz",
  and `clips.json` is byte-identical. This is the new label wording on screen. The vendored case says `clips[0]`,
  because there the clip is index 0; here the pasted clip is index 8.
- **DP.12o** The pane report shows TWO dashed warning outlines tagged K9, the draft's `(0,0,1496,672)` and shaft 0's
  `(2048,1408,256,512)`. The canvas, read back on a ring inside the shaft's rectangle, had **0 of 50** warning pixels
  before the paste and **28 of 50** after. The outline is on the glass.
- **DP.12t** At whole-act scale (0.035) the label layout HIDES the shaft's K9 tag, because there is no room. The
  draft's K9 tag is hidden too. One REAL wheel step at the shaft's centre (to scale 0.044) prints it, and the chip,
  read back, holds **27 warning / 49 text / 0 foreign** pixels. That is the glyph on the glass.
- **DP.12n** Aeon's recorded `refuse_k9_shaft_past_act` manifest, written to the copy's `s2_woven`, then a real click on
  another act and back. The bake note reads "K9 (shaft 2 wfz_to_cpz (not on this pane)): K9 shaft 'wfz_to_cpz':
  dst_rect (x=10240 y=1408 w=256 h=512) runs past the act (10240x8192 px)", exactly the line built from the harness's
  own validate of the file on disk. There is no dashed outline, and there are **0** warning pixels over the whole
  target canvas (274340 px).

Harness red-first, each run on a rebuilt app with `src on disk: DIFFERS FROM HEAD` printed, and each followed by a
restore from committed `87733aff` and a rebuild:

| app | harness |
|---|---|
| master's shaft case (`case 'shaft': case 'fill': return null;`) | **34/37, 3 FAIL**: DP.12a (the words read "... shaft 0 wfz_to_ehz (not on this pane)"), DP.12o (one outline; ring 0/50 after the paste), DP.12t (no tag after 16 wheel steps). DP.12n PASS. |
| M1, the area check deleted | **36/37, 1 FAIL**: DP.12n (the words lack "(not on this pane)", an outline sits at x=10240, and the canvas has 89 warning pixels). |

Screenshots (SHOT_DIR, from the 37/37 run; for a person, never read by a row):
- `docs/reviews/233-refused-shaft/k9-shaft-pair.png`: the whole window, with the refusal panel's words and the
  two outlines.
- `docs/reviews/233-refused-shaft/k9-shaft-pair-pane.png`: the pane at 2x, whole-act. The shaft's dashed outline sits
  on its blue shaft art under `wfz_deck`, with no tag.
- `docs/reviews/233-refused-shaft/k9-shaft-pair-zoomed.png`: after one wheel step. K9 prints beside the shaft, and
  `wfz_to_ehz` + K9 print at the draft.
- `docs/reviews/233-refused-shaft/k9-shaft-off-pane.png`: the off-pane shaft, named in the bake note and not drawn.

## 6. Suite

See the report for the final full-suite run on the committed branch tip. It is not quoted here, so this packet does not
quote a run that postdates it. Partial runs while working: 186/186 over the ten clip/donor files after (c);
84/84 over refused-subjects, donor-paste, clip-manifest-doc and donor-draft-placement after (a); `npx tsc --noEmit`
exit 0.

## 7. Open

- **A look question for the overseer, from DP.12t:** at whole-act scale a refused shaft's K9 tag has no room and the
  layout hides it. The pane's hover (`ZonePane` `onPointerMove`) names only outline `label`s (ids). A refused outline
  carries no label: a clip's id comes from the faint standing outline beneath it, and a shaft has no standing outline.
  So at whole-act scale nothing on the pane names a refused shaft; only the panel's words do. Row 235 (b)'s claim that "a
  label with no free line ... the pane's hover tooltip still names it" does not hold for a tag-only outline. (It never
  held for rule tags. This row adds the first outline that is tag-only with no id beneath it.) Options include giving a
  refused shaft's outline the shaft id as its `label`, or making the hover name tags. Either is a look change beyond
  the ruling, so I did not make one.
- **Scope of the off-pane rule:** as ruled, only a SHAFT is checked against the pane's world. A clip or corridor subject
  whose `dst_rect` lies outside the act (for example an R8 clip past the edge, or K2 for a corridor) is still "placed",
  so it gets an invisible outline and plain words. Before this row that was already true for clips and corridors. I
  left it alone and flag it.
- `validate-json.cases.provenance.json`'s `inputs_are` prose still describes row 219's audit trace ("re-run ... at
  e47493aa ... same blob at b85e60d2, e47493aa and origin/master 28880431"). That is history, and still true of those
  revisions. The fresh blob comparison for this pin is in `revision_is`.
- Not verified: the (c) re-vendor reads aeon at `8dbd134b`. If aeon moves any pinned input after `751eaa1b`, the currency
  rows will red again, as designed.
