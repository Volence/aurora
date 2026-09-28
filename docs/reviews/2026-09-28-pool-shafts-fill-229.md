# DONOR-POOL-READOUT-SHAFTS-FILL: the pool readout on a woven act (review packet, 2026-09-28)

ROADMAP row 229. Branch `parcel/pool-shafts-fill-229`, cut from master `b10c55d2`. The defect was found at row 228
(`docs/reviews/2026-09-28-revendor-228.md` section 5(b)). The look call was made by the overseer under the owner's
2026-09-18 permission for this lane, and this parcel implements it as ruled.

## 1. The premise, re-measured

aeon was read only through git objects. `origin/master` is `cffdf7168fca5030c45b22b27c5e8c2916e1112c` (no fetch by
this parcel). `git log -1 --format=%h origin/master -- tools/clip_act_bake.py` gives `d796ad94` (blob `958958b5`).
At that revision `pool_contributions` returns `clip`, `corridor`, `shaft` and `fill` rows. `emit` writes
`pool.per_shaft` only when the act has `shafts` and `pool.per_fill` only when it has a `fill`. In that case it rewrites
`per_clip_fields.tiles_added` to state the sum "over per_clip, per_corridor, per_shaft and per_fill) + 1 (the blank)
== pool.tiles". The fill row is ONE row (id `fill`, index 0), sliced by the fill's cell MASK (`clip_manifest.fill_mask`),
not by a rectangle. It carries the same four counts as every other row.

Measured on aeon's real output. I materialised `git archive cffdf716` into `$HOME/.cache/aurora-229-aeon/tree` and ran
`tools/s2_zone_convert.py convert --all-six` there (exit 0, 6 zones, 2219040 cells round-tripped, 0 differing, 0
FAILED). Then I ran `python3 tools/clip_act_bake.py bake games/sonic4/data/clips/s2_woven/clips.json --out <scratch>
--json` (exit 0, `ok: true`):

| list | rows | tiles_added | pages_exclusive |
|---|---|---|---|
| per_clip | 8 | 2858 | 36 |
| per_corridor | 4 | 26 | 0 |
| per_shaft | 7 | 9 | 0 |
| per_fill | 1 | 0 | 0 |

2858 + 26 + 9 + 0 + 1 = **2894 = pool.tiles**. pool.pages is 49. The premise held exactly as row 228 recorded it. The
pre-fix reader summed two lists to 2885, called it broken, and hid the 7 shaft rows and the 1 fill row.

## 2. What changed

| Commit | What |
|---|---|
| `7ac1b52a` | red-first: vendored `test/fixtures/clips/aeon-outputs/s2_woven.clipact.json` (aeon's bake, verbatim) + `s2_woven.clipact.provenance.json`; 6 unit rows in `test/formats/clip-tool-outputs.test.ts`; the fixture joins `MARKERS` (sha256, tool-blob and input-blob currency rows) |
| `c8bb0501` | `src/core/formats/donors/clipact-pool.ts` reads `per_shaft` / `per_fill`, checks the four-list sum, names unshown lists; `src/renderer/components/donors/DonorPasteSection.tsx` shows the two new sections |
| `e97a6ec2` | `test/formats/donor-pool-readout-render.test.ts`: 6 node render rows of the real `PoolRowsView` over the woven fixture |
| `958e79d7` | `test/live/donor-fidelity.test.ts` F5 also bakes `s2_woven` live, over all four lists |

**The reader** (`readPoolRows`):
- `per_shaft` is index-aligned with the file's own `shafts`, by the same rule as clips and corridors (id and index
  must match entry i, or the rows are `unavailable` with the reason).
- `per_fill` must be exactly one row with index 0, and the file must carry a `fill` object. Its id is shown as the
  file writes it (`fill`).
- A missing `per_shaft` or `per_fill` reads as an empty list. The two old fixtures read exactly as before, and their
  rows are unchanged and green.
- `tilesSum` is `holds` or `mismatch` (with the total), or `cannot-check` with the reason. The mismatch sentence in
  `broken` is unchanged in wording, and it is now computed over all four lists.
- `unshown` lists every `pool.per_*` ARRAY that the page does not read (`per_clip_fields` is an object and is not a
  row list). If any is present, the tile equality is `cannot-check` and nothing about it goes into `broken`. The pages
  bound (sum of own pages <= pool.pages) and the per-row bounds are still checked, since a subset of the rows can only
  make those sums smaller.

## 3. The look call, as implemented

1. **Sections.** Shafts and the fill each get a full-width heading row (`shafts`, `fill`) in the same grid, below the
   corridors. The heading carries `data-donors-pool-section`, and a section appears only when it has rows. Each
   section uses the same four columns (tiles / added / pages touched / own pages), under the same header tooltips
   taken from the file's own `per_clip_fields`. Rows are labelled by the file's own ids (shaft ids such as
   `wfz_to_ehz`, and the fill's `fill`). Cell keys are `shaft:<index>:<field>` and `fill:0:<field>`.
   **The em-dash placeholder clause is vacuous today.** The ruling says a fill column that depends on geometry reads an em dash (U+2014) with a
   tooltip, never 0. No column here depends on geometry: aeon writes all four counts for the fill, from its mask. So
   every fill cell shows aeon's number, and no placeholder is rendered. A code comment on `PoolRowsView` records the
   rule for any future geometric column. **Note the conflict:** the owner's 2026-09-05 ruling (held by
   `scripts/check-tsx-dashes.mjs`) forbids U+2014 in user-facing text, so a future placeholder would have to be spelled
   some other way (for example "n/a").
2. **Invariant.** It is checked over per_clip + per_corridor + per_shaft + per_fill + 1.
3. **Loud on unknown.** Each unshown list gets its own warning line, "pool.per_X is in this file and not shown.". The
   note then reads "the added column cannot be checked against the act's N (cannot check: unshown rows, ...)". There
   is no "aeon's own sums disagree" line unless a check that can still run breaks.
4. **Kept.** Misaligned or undefined fields still read "unavailable" with a reason, never 0. `pages touched` is never
   totalled. The note's "EACH rectangle" became "EACH row", since the fill is not a rectangle. It still names
   `pool.tiles` and "N pages", which harness DP.6e reads.

## 4. Verification

**Red-first (unit, `test/formats/clip-tool-outputs.test.ts`).** At `7ac1b52a`, against the pre-fix reader, 5 of the 6
new rows were red:
- the four sections;
- shaft alignment;
- the sum holding (`tilesSum: undefined`);
- the unshown state;
- the shaft-mismatch message (the old reader said 2885).

The non-vacuity row (the fixture has shaft and fill rows, the shafts add tiles, and aeon's four-list sum equals
pool.tiles) was green by design. At `c8bb0501` the file ran 68/68.

**Mutations.** Each mutation was applied on disk over a committed baseline, run red, then restored with `git checkout`
from that commit and re-run green:

| # | Mutation (on disk) | Red rows |
|---|---|---|
| M1 | `const all = [...perClip, ...perCorridor, ...perFill];` (shafts dropped from the sums) | unit: sum holds; shaft mismatch message (2 of 68) |
| M2 | `const unshown: string[] = [];` | unit: planted per_zzz (1 of 68) |
| M3 | `const perFill: PoolRow[] \| string = [];` | unit: all four sections (1 of 68; the fill adds 0 tiles, so the sum rows cannot see it, which is aeon's data) |
| U1 | section filter `(sec) => false && ...` | render: order, shaft/fill cells, ids (3 of 6) |
| U2 | heading row deleted | render: order (1 of 6) |
| U3 | `pr.unshown.filter(() => false)` | render: unshown named (1 of 6) |
| U4 | `pr.broken.length >= 0 &&` | render: sum holds / no accusation; unshown no accusation (2 of 6) |
| U5 | section filter `length >= 0` | render: s2_ehz_cpz renders no section (1 of 6) |
| F1 | M1 again, under `AURORA_DONOR_FIDELITY=1 -t F5` | F5 s2_woven (1 of 7 run) |

**Fidelity** (`AURORA_DONOR_FIDELITY=1 npx vitest run test/live/donor-fidelity.test.ts`, aeon `cffdf716`): 11 passed,
0 skipped. The F5 s2_woven live bake gave pool 2894 tiles / 49 pages. No emulator was involved: this is aeon's Python
bake only.

**Full suite** at `958e79d7` (`TMPDIR=$HOME/.cache/aurora-tmp VITEST_MAX_WORKERS=4 npm test`, foreground, exit 0):
- every `check:*` step OK;
- Test Files **0 failed / 670 passed / 3 skipped (673)**;
- Tests **0 failed / 10471 passed / 20 skipped (10491)**;
- run-completeness COMPLETE, 673 of 673;
- skip-report OK, every skip named its reason.

Against row 228's 669/3 and 10455/19: +1 file (the render test). The tests are +16 passed (6 unit, 6 render, 4
currency rows for the new marker) and +1 skipped (F5 s2_woven, opt-in).

## 5. Open

- **TAGGED: on-screen harness row.** `scratchpad/donor-page-harness.mjs` (DP.6e) pastes one clip into a fresh act
  through the UI, so it can never reach shafts or a fill. Putting the woven sections on screen would need a new harness
  path that loads a woven clipact into the paste store (or bakes `s2_woven` and opens it). That is not cheap, and it
  was not built. The node render rows hold the component's markup, not layout, styling or the running app. I did not
  re-run the harness itself either. DP.6e's two note substrings (`pool.tiles`, "N pages") are still in the note text,
  checked by reading the JSX, not by a run.
- **Not guarded (a judgement call):** a file whose top-level `shafts` is non-empty but has no `pool.per_shaft` (or a
  `fill` without `per_fill`). aeon writes both at the same site, so that shape does not occur. If it did, the four-list
  sum would state a mismatch rather than "cannot check".
- The fidelity rig's per_clip_fields comparison now uses the act's OWN vendored capture when one exists (`s2_woven`),
  because aeon rewords `tiles_added` for acts with shafts or a fill.
- No runtime or emulator confirmation is needed: nothing here changes what Aurora writes.
