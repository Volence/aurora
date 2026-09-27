# LINES-EVERYWHERE: re-vendor at one pin, and the painted crossover retired (review packet, 2026-09-26)

ROADMAP rows 223 (REVENDOR-AEON-RESIDENT-PLAIN-COPY) and 224 (LINES-EVERYWHERE-CONSUMER), taken as ONE parcel at
ONE aeon pin. Branch `parcel/lines-everywhere-223-224`, cut from aurora master `aebaaf59`. The dispatched worktree
sat at `bbb69f93`, eight commits behind master (ROADMAP bookings only, `merge-base --is-ancestor` exit 0), so the
branch was cut from `aebaaf59` itself; rows 223/224 exist only there.

Owner ruling, quoted from aeon `docs/decisions.jsonl` S2CLIP-PLANE-SWITCH (answered 2026-09-26T16:27:40Z,
`chose: line-table`): "Lines honestly probably sounds easier to handle right?", and `did`: "Lines become the one
layer-switch mechanism. Land the baked line table for the Sonic 2 level now; then move our own act's loop from
painted marks to lines, retire the painted marks, and ask aurora for a line tool in the editor." The line TOOL is
not in this parcel (row 224 says so); see Open.

## 1. The pin

aeon **`d3b98868a9bca7573957b84092b4acd3c72c4ee6`**, `origin/master` after `git fetch -q origin` at
2026-09-26T22:06:53Z. The overseer measured at `8ee310f9`; `git diff --stat 8ee310f9 d3b98868` is
`docs/lane-status.json` only. During the parcel aeon `origin/master` moved to `d2f53150`; `git diff --name-only
d3b98868 d2f53150` names `docs/` files only (the OJZ-feel research), so every currency row, which reads
`origin/master`, sees the pin's blobs. It was not chased.

Method, as rows 218/221: aeon read only through git objects; every aeon tool run in a `git archive d3b98868` copy
under `$HOME/.cache/aurora-tmp/p224/` (outside `/tmp`, no `.git`), `EMPYREAN_SUITE_ROOT` exported. In the copy:
`tools/s2_zone_convert.py convert --all-six` exit 0, 6 zones, 2219040 cells round-tripped, 0 differing, 0 FAILED.

## 2. Row 223: what was re-vendored

| Fixture | Old blob -> new blob (revision = last commit on the path) | What moved |
|---|---|---|
| `test/fixtures/effects/ojz_effects.emp` | `b89a77ff` (c7ebe7a1) -> `5cfd98c0` (5b408bbb) | one citation comment line only |
| `test/fixtures/regions/act-constants/act_descriptor.emp` | `cb954af3` (5c4633c9) -> `6c6aaa89` (6b444e45) | `act_nt_physical` (was `pad_21`), `act_layer_lines`, `LayerLine` import, layer-line table check + `OJZ_Act1_LayerLines`. No rule-4 constant or derivation moved |
| `test/fixtures/regions/act-constants/engine_constants.emp` | `faa16c4e` (787a9980) -> `d37c00bb` (fe4a94ab) | nine commits: `PAGE_AUDIT_*`, `PAGECACHE_DIRECT_PLAIN`, `PF_DEMAND_HELD*`, `LL_*`, `BLOCK_DECOMP_SOFT`, `BLOCK_FILL_LEAD_*`; the LAYER_PATH comment. No rule-4 leaf moved |
| `test/fixtures/clips/s2_ehz_cpz.clips.json` (the 4th currency row) | `a9ca3ecf` (67f7787d) -> `64ab630c` (afc23f5b) | `floorless_columns.planes.B` (64 columns) and its `why` prose |

Each via `scripts/revendor.mjs` (bytes from `git show`, re-hashed and compared) plus prose fields, old pins moved
into `pin_history_current_last`.

**Consequent re-runs, found by the suite, not by the rows:**
- The raster-owners truth records (`test/fixtures/effects/raster-owners/*.aeon-truth.json`) hash the library, so
  `aeon_truth_probe.py` was re-run: region mode over the pin tree, section mode over the pin tree with the
  documented construction (bcd844aa's act files, `regions.json` deleted). CONTROL: the same two runs over a
  `c7ebe7a1` archive reproduce the vendored records byte-for-byte (`cmp` exit 0). Pin vs control: ONLY
  `sha256_of_inputs` moved (library; region mode also the descriptor, which that row does not compare).
- `paste-music.cases.json` records the manifest it validated, which is this vendored clips.json plus a clip, so
  it went red and was re-captured with the other tool outputs (section 3).

**The donor fixture (the 16th red).** `tools/s2_zone_convert.py` `ed263a94` -> `94a6580f` (a974bc2e, the only
converter commit since 413071f9). A real `convert --all-six` in the copy: all six `zone.json` carry ONE key-path
set, the old set minus `collision.crossover_marks`, nothing added; `collision.format` now says "15:14 reserved,
always 0". `scripts/gen-donor-fixture.mjs` updated to match and re-run; sidecar re-pinned.

### Consumer check (the greps, run in this worktree's `src`)

```
grep -rnE "strips_a\.bin|_blocks\.bin|local_map|sec_local_maps|OJZ_ACT_NT|pad_21|act_nt_physical" src
grep -rnE "act_layer_lines|LayerLine|layer_lines|PAGECACHE_DIRECT_PLAIN|PAGECACHE_DIRECT|PF_DEMAND_HELD|PAGE_AUDIT_|BLOCK_DECOMP_SOFT|BLOCK_FILL_LEAD|BLOCK_DECOMP_BUDGET|\bLL_[A-Z_]+" src
grep -rn "local_map\|localMap\|LocalMap" src test scripts   (fixtures excluded)
```

- First grep: 6 hits, all `OJZ_blocks.bin` in two provider tests (`chunk-import-collision-answer.test.ts`,
  `chunk-import-refuses-when-blind.test.ts`), a legacy donor fixture under `test/fixtures`, not aeon's generated
  `sec*_blocks.bin`. **No reader** of the strips, blocks, local maps, `OJZ_ACT_NT_*`, `pad_21` or
  `act_nt_physical`. Correction to the row text: those two tests match `_blocks.bin`, not `local_map`; the third
  grep finds no `local_map` anywhere outside fixtures.
- Second grep: 4 hits, all THIS parcel's own prose naming `layer_lines.json` (the refusal and audit messages). No
  reader of `LayerLine`, `act_layer_lines`, `LL_*`, `PAGECACHE_*`, `PF_DEMAND_HELD`, `PAGE_AUDIT_*` or the
  budget constants.
- Global tile indices / blank `$0000` words: the resident-plain-copy change is to aeon's GENERATED tree.
  `git diff --stat 91d4119c d3b98868 -- games/sonic4/data/editor/` (the files Aurora reads and writes) names three
  files: `layer_lines.json` (new) and `section_0.collattr{,b}.bin` (bits 15:14 cleared). The editor nametables did
  not move, and Aurora's save writes the editor tree only (`save.ts` header: "The editor files ARE the
  interface"). Census of the pin's 18 plane files: 1,179,648 words, **0** with bits 15:14.

## 3. The clip tool outputs, re-captured

All five `test/fixtures/clips/aeon-outputs/` markers re-captured in the copy. Tool/input re-pins:
`clip_act_bake.py 920a855a`, `clip_manifest.py 9a07d19a`, `collision_pipeline.py cbbae9d7`, `fg_page_order.py
68e303fc` (62140cd7, stress-bake pins; the `--expect-worst` argv is byte-identical, so `PAGE_FRAMES` did not move),
`s2_ehz_cpz clips.json 64ab630c`.

| Output | Finding |
|---|---|
| `s2_ehz_cpz.clipact.json`, `s2_two_clip.clipact.json` | ONLY `clips[].severed_xover_reason` and `collision.per_clip[].marks_inside_src / marks_outside_src / severed_xover_reason` removed, plus wall-clock `seconds`. Pool rows unchanged (fidelity F5 below) |
| `validate-json.cases.json` | 9/9, exit codes unchanged; 7 byte-identical; 2 crash tracebacks differ in copy path and line numbers |
| `paste-music.cases.json` | verdicts unchanged; the recorded manifests carry the new plane-B block |
| `bake-json.cases.json` | `gen_bake_json.py`'s C1 case and `CP.XOVER_*` replaced by **C4** (`refuse_c4_bake_own`): cell (40, 100) painted `2 << PLANE_RESERVED_SHIFT` on A, `1 <<` on B, exactly aeon's own `test_a_bake_refusal_names_its_rule_and_the_clip` at the pin. aeon answers `rule: "C4"` naming clip 0 `ehz_cut`. The rows that named `refuse_c1_bake_own` (clip-tool-outputs, donor-paste) now name C4 and assert the rule |

## 4. Row 224: what was removed, and what replaced it

Removed: the encoding module `layer-transition.ts`, `crossover-audit.ts`, `canvas/crossover-lens.ts`,
`canvas/crossover-preview.ts`; the palette's Loop row (Keep / Hand -> A|B / None) and Mark row (Cell / Half);
`collisionCrossoverBrush`, `collisionCrossoverSpanMode` and setters; `showCrossover` and its View-menu row;
`CROSSOVER_*` colours; MapViewport's mark preview, span latch and span-keyed drag cache; OverlayRenderer's
crossover pass; `crossover` / `crossoverSpan` from the agent protocol, the MCP schema and the handler; the debug
hooks `crossoverLens/Encoding/At/Audit/Refusal`; DonorPasteSection's `marks_inside_src / marks_outside_src` line;
zone.json `crossover_marks` from the donor generator.

Added:
- `src/core/collision/reserved-bits.ts`: `PLANE_RESERVED_SHIFT/MASK/BITS` (aeon's names), `planeReservedBits`,
  `withoutReservedBits`. The only module that knows the bit numbers.
- `src/core/collision/reserved-bits-audit.ts`: ANY non-zero 15:14 on either plane is an **ERROR**; exact counts;
  each hit named as aeon's "editor cell (col, row)" and Aurora's 16px cell; no stride means no coordinate, in
  words. `RESERVED_BITS_BAKE_CLAUSE` replaces `CROSSOVER_RESERVED_BAKE_CLAUSE` in `get_collision_region`.
- **Refuses, not erases.** Nothing clears 15:14 on load, stroke, undo or redo (the unowned-bit preservation rule,
  unchanged). `buildAeonSavePlan` **throws before planning anything** when any readable plane carries them,
  naming the cells ("refusing to save ojz/act1: ... Nothing was written."). Whole-save, not per-plane: a plane
  left unwritten after a grid resize would leave ANOTHER section's file at its path.
- **Cannot write them.** `collisionPaintWord` masks the brush word to the owned fields (it always did; now
  gated); `paint_collision` REFUSES `crossover` / `crossoverSpan` by name on any road that reaches the handler
  with them; `save_chunk` refuses collision words carrying 15:14 (a stamp is a whole-word transfer, so it was a
  road to write them).
- **The remedy.** The palette's error note carries "Clear retired marks": zeroes 15:14 of both planes of the
  active section, keeps shape/flips/solidity, one undo step. aeon's own refusal text (`collision_pipeline.py`
  `retired_mark_message`, the C4 message) tells the author to clear the marks with "aurora's crossover 'None'
  brush", which this parcel removes; this button is what that sentence now has to point at (tagged, section 9).
- `layer_lines.json` is safe: Aurora's loader enumerates known suffixes and the save removes only paths in its
  load ledgers (`removalsFor`). Measured on the running app (harness row C4, byte-identical after a save).

**A defect the harness found in my own palette code, fixed.** The audit memo keyed on `liveEditVersion` only;
commands (Clear, Reset, undo, "Clear retired marks") never advance it, so the error note outlived the command that
removed its cause (harness row C2 RED on dev run 2). The memo also keys on `useHistoryVersion()` now; C2 green.
The same stale-note shape existed for the old crossover audit after Clear/Reset.

### Crossover triage (`grep -rlic crossover src scripts scratchpad/*.mjs`, 42 files before)

| File(s) | Verdict |
|---|---|
| encoding, audit, lens, preview modules; 6 test files; 6 harnesses | **deleted** (section 5) |
| `CollisionPalette.tsx`, `MapViewport.tsx`, `OverlayRenderer.ts`, `canvas-colors.ts`, `editorStore.ts`, `viewStore.ts`, `ViewMenu.tsx`, `debug-hooks.ts`, `agent-handler.ts`, `agent-protocol.ts`, `editor-methods.ts`, `collision-paint.ts`, `both-planes-paint.ts`, `collision-cell.ts`, `collision-word.ts`, `collision-region-read.ts` | **rewritten**: crossover code removed; remaining mentions say the mark is retired, refuse it, or explain the reserved bits |
| `collision-cell-word.ts`, `validation.ts`, `save.ts`, `clip-validate-json.ts`, `clip-manifest-doc.ts`, `DonorPasteSection.tsx` | **rewritten** comments / reader, as above |
| `aeon-save`, `map-viewport-mounted`, `both-planes-paint`, `paint-collision-reconcile`, `agent-handler.collision-reconcile`, `collision-cell-resolve`, `collision-word`, `collision-destructive-wording`, `crossover-reserved-bake-claim` tests | **rewritten** onto reserved bits (the last keeps its file name so its history is one `git log` away) |
| `cdp-sweep-4-0912`, `map-behaviour-fixes` harnesses | **updated**: PART collision retired to a note; a Loop click removed |
| `check-harness-guards.mjs`, `build-console-overlap-harness.mjs`, `warp-tearing-harness.mjs`, `check-cited-paths.mjs` | **kept**: history in comments (an incident named after an old harness; an aeon doc path) |
| `check-doc-citations.mjs`, `check-prose-constants.mjs` | **kept + edited**: 16 EXEMPT rows (reason `RETIRED_WITH_ITS_FEATURE`) for landed packets citing deleted files; the UNFOLDABLE row follows the renamed overlap constant |

## 5. Deletions (tests and harnesses), each with its reason

All deleted because the feature they drove was removed by the owner's ruling; **none of the 16 red went green by
deletion.** Counts are `it(`/`it.each(` declarations in the deleted file.

| Deleted | Rows | What it held that survives, and where |
|---|---|---|
| `layer-transition.test.ts` | 22 | bit numbers vs aeon, no-overlap, PATH_B_SOL collision: `test/collision/reserved-bits.test.ts` |
| `crossover-audit.test.ts` | 15 | error on a bad value: `reserved-bits-audit.test.ts` |
| `crossover-audit-bounds.test.ts` | 16 | short-plane / hole handling: `reserved-bits-audit.test.ts` (whole-plane scan row) |
| `crossover-locus.test.ts` | 21 | cell coordinates, no-stride refusal: `reserved-bits-audit.test.ts` |
| `crossover-span.test.ts` | 13 | none (mark width is gone) |
| `crossover-preview.test.ts` | 6 | none |
| crossover-lens describe of the lens-wiring test (renamed `both-planes-lens-wiring.test.ts`) | 7 | none; the both-planes rows are unchanged |
| 4 crossover rows of `map-viewport-mounted.test.ts` | 4 | replaced by one real-press row: keeps planted bits, writes none |
| `[m2]`, `[m3]` hand-off rows of `paint-collision-reconcile.test.ts` | 5 | replaced by write/erase rows on reserved bits |
| `[h2]`, `[h3]` of `agent-handler.collision-reconcile.test.ts` | 6 | replaced by the retired-param refusal rows and the audit reply rows |
| harnesses `audit-coords`, `crossover-paint`, `loop-paint`, `loop-witness`, `loops-hover-half`, `two-way-mark` (files + `package.json` scripts) | n/a | `harness:lines-everywhere` |

## 6. Red-first proofs (each mutation on disk, red, restored from the committed HEAD by `git show HEAD:<path> > <path>`, `git status` clean, green)

| # | Mutation (the diff line) | Red | Restored |
|---|---|---|---|
| M1 | `reserved-bits-audit.ts`: `? 'error' : 'ok'` -> `? 'ok' : 'ok'` | 9 failed of 29 (audit error rows x6, no-stride, whole-plane, handler audit reply) | 29/29 |
| M2 | `collision-word.ts`: `(brushWord & COLLISION_CELL_OWNED_MASK)` -> `(brushWord & 0xFFFF)` (brush 15:14 reach the cell) | 4 failed of 51 (cannot-write rows in 3 files) | 51/51 |
| M3 | `save.ts`: `if (reservedAudits.length > 0)` -> `if (false && ...)` | 1 failed of 34 (the REFUSES row) | 34/34 |
| M4 | `validation.ts`: `if (bad >= 0)` -> `if (false && ...)` | 1 failed of 8 (save_chunk refusal) | 8/8 |
| M5 | `agent-handler.ts`: `if (retired.length)` -> `if (false && ...)` | 3 failed of 16 (three retired-param rows) | 16/16 |
| M6 | `collision-word.ts`: old cell's unowned bits -> `0` (silent erase) | 11 failed of 210 (incl. the real-press row and the handler round trip) | 210/210 |
| M7 | clause spelling `enforces it` -> `does not enforce it` | 1 failed of 4 (the bake-claim row) | 4/4 |
| M8 | `PLANE_RESERVED_SHIFT = 14` -> `13` | 7 failed of 9, incl. the row parsing aeon's `PLANE_RESERVED_SHIFT/MASK` at origin/master | 9/9 |
| H | harness C2 on dev run 2 (before the palette memo fix) | FAIL | PASS after the fix (run 4) |

Runner: every row above runs in `npm test` (vitest, default collection). The bake-claim detector has a control:
at `a974bc2e^` (raised on value 3 only) it must say "not enforced", and does.

### Addendum (overseer review): the one-plane shape

The overseer planted `return a.reservedA + a.reservedB > 0 ? [a] : [];` -> `return a.reservedA > 0 ? [a] : [];`
in `save.ts` (a save that ignores plane B) and `src/core/project/aeon` + `test/collision` stayed 402/402 green.
Correction to the finding's cause: the REFUSES row planted on BOTH planes (A value 2, B value 3), not on A only. It
stayed green because the A plant alone triggers the refusal, and the audit message names both planes either
way. Every guard was re-checked one plane at a time:

| Guard | Plane B covered before? | Now | Red-first (mutation shown from disk, restored by `git show HEAD:<path> >`) |
|---|---|---|---|
| save refusal | no | `it.each` A-only / B-only in `aeon-save.test.ts`, other plane clean, cell named, files unchanged (6899e542) | the overseer's exact line (`- ... a.reservedA + a.reservedB > 0 ...`, `+ return a.reservedA > 0 ? [a] : [];`): `src/core/project/aeon` + `test/collision` **1 failed of 404** (the B-only row); restored 404/404. Mirror `reservedB > 0`: the A-only row red, 1 of 36 |
| audit ERROR | yes: value 1..3 x plane A/B rows, the other plane clean | no change | `- ... > 0 ? 'error' : 'ok'`, `+ return a.reservedA > 0 ? 'error' : 'ok';`: **3 failed of 13** (the three plane-B rows); restored 13/13 |
| `save_chunk` refusal | no: the validator's unit rows name `collisionA` only, and the handler calls it once per plane | `it.each` over `collisionA`/`collisionB` through the handler, other plane clean, no chunk added, + a clean control (`agent-handler.chunk-stamp-zones.test.ts`) | `- if (collBErr) throw ...`, `+ if (false && collBErr) throw ...`: **1 failed of 13** (the collisionB row); restored 13/13 |
| harness planted mark | no: plane A only | plane-B word (section 0, editor cell (100, 7), value 1): rows B1b, B2b, C1b, C3b, and B3 also requires the B file unchanged. 22/22 (a86d3ba5) | palette `const b = ... clearReservedBitsEntries(section.collisionEditB) ...` -> `const b = [] // MUTATION` in a rebuilt app: **6 FAIL of 22** (C1b, and C1/C2/C3/C3b/D1 downstream); restored, rebuilt, 22/22 |

Targeted totals after the addendum: `src/core/project/aeon`, `test/collision`, `agent-handler.chunk-stamp-zones`,
and the three paint-collision test files (`test/agent/paint-collision.test.ts`, `test/agent/paint-collision-cells.test.ts`, `test/agent/paint-collision-reconcile.test.ts`) as vitest filter arguments: 40 files, 417 passed, 0 failed, 0 skipped. Harness `root:` / `pinned:` unchanged
(this worktree).

## 7. Suite, fidelity, harness

**Suite**, `TMPDIR=$HOME/.cache/aurora-tmp VITEST_MAX_WORKERS=4 npm test` (all check scripts + typecheck + vitest),
foreground, at the tip: **exit 0**, Test Files **669 passed | 3 skipped (672)**, Tests **10450 passed | 19 skipped
(10469)**; skip-report OK (19 opt-in skips: fidelity, live warp, bench, FG gate). Master as measured by the
overseer: 16 failed | 10521 passed. The total moved by the deleted rows (section 5) and the new ones.

Which of the 16 went green, and how:
- `aeon-fixture-currency` x4: re-vendor (section 2).
- `clip-tool-outputs` x10 (5 tool-blob rows, 5 input rows): re-capture (section 3).
- `donor-fixture-currency` x1: real convert re-measure + fixture regeneration.
- `crossover-reserved-bake-claim` x1: detector and clause re-pointed at aeon's new any-value refusal.

**Fidelity**, `AURORA_DONOR_FIDELITY=1` over donor-fidelity, clip-tool-outputs, clip-manifest-doc and donor-paste:
exit 0, 4 files, 109/109, none skipped. It materialised aeon origin/master `d2f53150` (docs-only past the pin). F5:
s2_ehz_cpz pool 1062 tiles / 17 pages (ehz_act1 479t 8/7p, cpz_act1 554t 10/9p, ehz_to_cpz 28t 1/0p), equal to the
re-captured fixture.

**Harness** `npm run harness:lines-everywhere` (registered), after `VITE_AURORA_DEBUG=1 npx electron-vite build`,
`ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`, `AURORA_BUILT_TREE=` this worktree,
`AEON_DIR=` a git-archive copy of the pin:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ad805674008ec8ff9
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ad805674008ec8ff9
=== lines-everywhere: 18 PASS, 0 FAIL ===
```

Rows: the OJZ project opens; a planted 15:14 survives the load; a real click opens the Collision facet (Plane and
Brush rows present) with NO Loop and NO Mark row and no crossover button; a real click opens the View menu ("Solid
on both paths (A + B)" present) with NO crossover row; the palette names editor cell (41, 3); a real Ctrl+S on a
dirty act REFUSES (file byte-identical, "Save failed"); a real click on "Clear retired marks" clears only those
bits; Ctrl+S then saves the original bytes; `layer_lines.json` byte-identical; no console error outside the
deliberate refusal, which logs only its own "[toast] Save failed". Every click is hit-tested
(`elementFromPoint`) before a CDP mouse event; no `.click()`. The harness refuses the sibling aeon checkout or any
directory carrying `.git`, and restores the planted file.

## 8. Where the brief and the tree disagreed

- The worktree base was `bbb69f93`, not master; rows 223/224 exist only on master. Branched from `aebaaf59`.
- The brief's "whatever the 4th is": `clips/s2_ehz_cpz.clips.json`.
- Row 223's "two provider tests mention `local_map`": they match `_blocks.bin`; nothing mentions `local_map`.
- Two further red rows appeared only after re-vendoring (the raster-owners truth records, paste-music); both
  re-measured, not loosened.
- aeon's C4 and preflight messages point the author at a brush Aurora no longer has (section 9).

## 9. Open

- **TAG for aeon**: `tools/collision_pipeline.py` `retired_mark_message` and `tools/clip_act_bake.py`'s C4 message
  say "Clear the marks with aurora's crossover 'None' brush (or 'Clear section')". That brush is gone; the remedy
  is now the collision palette's **"Clear retired marks"** (both planes of the active section, 15:14 only).
- **The zod roads strip, the handler refuses.** MCP and Aether validate `paint_collision` with `z.object`, which
  strips unknown keys, so a stale agent sending `crossover` there gets its shape painted and no refusal (the reply
  no longer carries a `crossover` field and does carry `reservedBitsAudit`). Only a road reaching the handler with
  the key refuses. A strict schema per method would close it; not done here (the registry takes raw shapes).
- **Whole-word transfers can copy existing marks inside Aurora.** A clipboard paste or a chunk stamp carries whole
  words, so a mark already in the document can be copied to another cell; the audit and the save refusal catch
  it, and `save_chunk` refuses new ones from agents. Not blocked at paste time.
- **"Clear retired marks" is per section** (the active one); the save refusal lists every section. An act-wide
  clear would be a small follow-up if an act ever carries many.
- **A multi-act save**: `saveAeonProject` saves dirty acts in order; if act 1 saves and act 2 is refused, act 1 is
  already written. Same shape as every other thrown save refusal.
- **The line tool** (authoring `layer_lines.json`) is NOT built: aeon nominated LAYER-LINES to the hub; not
  declared. Aurora leaves the file alone (measured, harness C4).
- **`path_swap.emp` / `ObjDef_PathSwap`** stay in aeon (blocked on sigil, aeon's open item 1); Aurora reads
  `objects.json` and does not write it. Nothing to do here.
- No emulator was used; nothing here needs a runtime ROM confirmation from Aurora's side.
