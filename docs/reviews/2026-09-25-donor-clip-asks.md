# DONOR-PAGE-CONSUMES-CLIP-ASKS: the donor page reads aeon's per-clip pool rows and `validate --json` (review packet, 2026-09-25)

ROADMAP row 213. Branch `parcel/donor-clip-asks`, cut from aurora master `8375e095`. Background: row 211,
`docs/reviews/2026-09-25-s2-donor-page.md`, `docs/superpowers/plans/2026-09-25-s2-donor-page.md`.

## 1. Aeon revision read

aeon `origin/master` **`a0c63764eac113f5da35b01f40d0d6b5933a2cb1`** after a fetch, read through git objects
only (`git show a0c63764:...`). a0c63764 is a docs-only handoff on top of the landing `1d9afb25`; both tools
were last changed at `e6daa4db` inside that landing, and their blobs are identical at `1d9afb25` and `a0c63764`
(`tools/clip_act_bake.py` `30829555`, `tools/clip_manifest.py` `1ca2675a`). Sources read, all in aeon:
aeon `docs/research/2026-09-25-clip-tooling-aurora-asks.md`, aeon `tools/clip_act_bake.py` (header, `PER_CLIP_POOL_FIELDS`,
`pool_contributions`, `emit`), `tools/clip_manifest.py` (header `--json` block, `validate_json`, `_mode_validate`),
`tools/test_clip_manifest_json.py` (the mutations reused below).

The brief's summary matched the source on every point. Two details the brief did not carry: the `per_clip` rows
are index-aligned with the clipact's OWN top-level `clips` / `corridors` lists (so Aurora checks alignment against
the same file, not the manifest it sent), and a usage error under `--json` (which an aeon older than `1d9afb25`
produces for the unknown `--json` flag) prints human usage text and exits 1, which this page therefore reads as a
crash, correctly.

## 2. What the page shows now

- **Validation** runs `validate <candidate> --donor-root <root> --json`. Three answers, read by
  `src/core/formats/donors/clip-validate-json.ts`:
  - **accepted**: the paste proceeds; each warning shows its rule tag and who it is about
    (`W3  clip 0 ehz_s2 and clip 1 cpz_s2`) above aeon's sentence;
  - **refused**: "aeon's manifest loader refused this paste, so nothing was written:", then per refusal a
    rule tag (`R10`, or `untagged` for aeon's `rule: null`), the subjects (`clip 0 ehz_1 and clip 1 ehz_2`, a
    corridor as `corridor 0 ehz_to_cpz`, a missing id as `(no id)`, no subjects as `the act as a whole`), and
    aeon's message verbatim; warnings kept under a refusal are shown too;
  - **crashed**: exit 1 with no JSON (aeon's documented traceback case), any exit code other than 0/1, a schema
    other than 1, `ok` disagreeing with the exit code, or a malformed entry. Shown as "aeon's manifest loader
    CRASHED (exit N), so this paste was not judged and nothing was written. This is not a refusal: <why>",
    then stderr, then stdout if any, then the command. Nothing is baked or written. Distinct from the existing
    `could-not-run` (no python3, a timeout, a project without the tool).
- **Pool cost per rectangle**, in "aeon's readout", directly under the act-level line (pool tiles and pages,
  worst camera window, collision entries), read by `src/core/formats/donors/clipact-pool.ts`.

### The look call (for the overseer to ratify or overturn)

A **compact 5-column grid** in the readout's existing type (NOTE size, tabular numerals, one hairline border),
one row per clip then per corridor (`corridor <id>`), columns **tiles / added / pages touched / own pages**. Each
column header carries a dotted underline and a tooltip that is the **file's own `per_clip_fields` text**, so the
meaning shown is aeon's, from the file being shown. Under it one note: tiles leave out the blank tile, added + 1
makes the act's N (N read from the file); pages touched counts a shared page once for EACH rectangle, so that
column is not a share of the act's M pages and **is not totalled**; the worst camera window is the act's only.
**No totals row, no per-clip camera window.** If aeon's own sums disagree in the file, a warning line names the
broken invariant (numbers still shown: they are aeon's). If the file has no `per_clip` (an older aeon), or its
rows do not line up with its own clips, or `per_clip_fields` no longer defines a field the page reads, or a count
is missing: one line, **"Per-clip tiles and pages: unavailable. <reason>."**, never a 0.
Why a grid and not the prose rows the collision readout uses: four numbers per row across two to four rows are
compared down the columns, which prose makes hard; the collision prose stays as it was. The old closing line
"Tiles and pages are the act's, not per clip" is removed because it stopped being true.
Screenshot inspected once (harness `SHOT_DIR`); the only change it caused was keeping the first header on one
line (`7f4d3075`).

## 3. Commits

| Commit | What |
|---|---|
| `4fac3a23` | readers (`clip-validate-json.ts`, `clipact-pool.ts`), aeon's real outputs vendored, 26 unit rows |
| `e06c5499` | argv gains `--json`; store outcomes `refused` (structured) / `crashed`; the grid and structured notes |
| `d7e6e02e` | fidelity F5 (four real bakes) and F6 (real refusal and real crash through Aurora's argv) |
| `ac117789` | harness DP.6e (grid against the harness's own bake) and DP.7s (R10 shown structurally) |
| `7f4d3075` | first grid header on one line |
| `abd2f477` | one provenance marker per vendored output (check-test-dashes refused a shared marker), byte rows |
| `52659809` | escaped an apostrophe in F5's message (tsc found it; vitest and opt-in skips could not) |

## 4. Fixtures: aeon's outputs, not typed numbers

`test/fixtures/clips/aeon-outputs/`, each file with its own `.provenance.json` (revision, command, sha256,
producing tool's blob). Produced from a `git archive` of aeon `a0c63764` in a scratch directory with the donors
converted there (`convert --all-six`, exit 0, 6 zones, 0 differing):
- `s2_ehz_cpz.clipact.json`, `s2_two_clip.clipact.json`: verbatim bake output. Rows match aeon's report
  (872 tiles / 14 pages, touched 8+7+1 = 16; 1035 / 17, all exclusive).
- `validate-json.cases.json`: nine real subprocess runs of `validate ... --json`, generated by
  `gen_validate_json.py` with aeon's own mutations: accept, accept+W3, R7, R10 clip/clip, R10 clip/corridor,
  R12 after W2, untagged top-level refusal, and the two crashes (not JSON; missing path).

## 5. Tests and red-first proofs

Every mutation below was put on disk (diff printed), run red, then restored with `git restore --source=HEAD`
from the committed baseline and re-run green.

| # | Mutation | Red rows |
|---|---|---|
| M1 | reader turns exit-1-no-JSON into a `refused` with `rule: null` | 3 unit (both crash cases, contract row); fidelity F6 |
| M2 | reader returns an empty `present` for a file with no `per_clip` | 1 unit (absent is unavailable) |
| M3 | invariant check forgets the blank (`added !== pool.tiles`) | 2 unit (both real files); fidelity F5 x4 |
| M4 | alignment check disabled | 1 unit (misaligned rows) |
| M5 | store maps a crash to `refused` | 1 store row |
| M6 | store drops accepted warnings | 1 store row |
| M7 | validate argv without `--json` | 1 clip-tool row |
| M8 | one byte appended to `validate-json.cases.json` | 1 currency byte row |
| H1 | grid cell shows `tiles` in every column (rebuilt, harness) | DP.6e FAIL, DP.7s PASS |
| H2 | subjects rendered reversed (rebuilt, harness) | DP.7s FAIL, DP.6e PASS |

H1 and H2 are a cross-plant: each new harness row is red under its own plant and green under the other's.

**Suite** (`VITEST_MAX_WORKERS=4 npm test`, foreground, EXIT and failure-class read):
- before, at `8375e095`: EXIT 0, Test Files 670 passed | 3 skipped (673), Tests 10436 passed | 13 skipped (10449),
  failure-class: no failures.
- after, at `52659809`: EXIT 0, Test Files 671 passed | 3 skipped (674), Tests 10468 passed | 18 skipped (10486),
  failure-class: no failures, skip-report OK. The +5 skips are F5 x4 and F6, opt-in, each skipping with its named
  reason.

**Fidelity** (`AURORA_DONOR_FIDELITY=1`, the rig plus the seven donor/clip test files), at `52659809`, printing
**aeon origin/master `a0c63764eac113f5da35b01f40d0d6b5933a2cb1`**: 8 files, **92/92 passed, nothing skipped**
(fidelity file 9/9). F5 measured: s2_ehz_cpz 872/14 (touched sums to 16), s2_two_clip 1035/17 (17),
s2_two_clip_pins 797/13 (14), s2_ehz_boot 480/8 (8); every invariant held, `per_clip_fields` equal to the
vendored file's.

**Harness** `scratchpad/donor-page-harness.mjs` under xvfb-run, `AURORA_BUILT_TREE=<worktree>`,
`ELECTRON_BIN=<main checkout electron>`, `AEON_DIR=<scratch copy of aeon a0c63764>`, after `VITE_AURORA_DEBUG=1 npm
run build`: `in-tree: yes`, `src on disk: identical to HEAD`, at `52659809`: **15/15 PASS, 0 FAIL, 0
UNMEASURABLE**. DP.6e read 253 tiles / 253 added / 4 touched / 4 own against the harness's bake (254 tiles,
4 pages); DP.7s read `R10` and `clip 0 ehz_1 and clip 1 ehz_2`.

## 6. Open

- **The bake stage still has no machine answer.** A bake that exits non-zero is shown as "aeon's bake refused
  this paste" with its raw text, so a bake TRACEBACK would read as a refusal: the same confusion this row fixed
  for the loader. Not in this row's scope and not Aurora's to fix alone: it needs a `--json` (or an equivalent
  crash/refusal split) on `clip_act_bake.py bake`. Candidate ask to aeon.
- **No crash path is reachable from the page's own UI** (it always sends valid JSON text), so the crash view is
  held by unit rows and fidelity F6, not by a harness row. In practice it appears when the checkout's aeon
  predates `1d9afb25` (the unknown `--json` flag, exit 1, usage text).
- **The target pane does not outline the refused clip or corridor.** The subjects are named in text; drawing
  them on the pane would be a small follow-up if the owner wants it.
- **Per-clip camera window**: not shown, by aeon's ruling (no definition of a clip's neighbourhood yet).
- The vendored outputs pin their producing tools' blobs; when aeon changes either tool, the currency rows red
  with the re-vendor recipe (`gen_validate_json.py` plus the bake command in each marker).
