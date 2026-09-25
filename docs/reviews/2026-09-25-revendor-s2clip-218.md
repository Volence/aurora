# REVENDOR-AEON-S2CLIP-TUNNEL: the 8-section, 384-px-tunnel s2_ehz_cpz re-vendored (review packet, 2026-09-25)

ROADMAP row 218. Branch `revendor-aeon-s2clip-0925b`, cut from aurora master `a7be9741` (row 218's own
bookings; the dispatched worktree sat at `da936133`, which differs from `a7be9741` in docs/ROADMAP.md only).
Method copied from row 216: ONE pinned aeon revision, read only through git objects; every aeon tool run only
in a `git archive` copy of that revision in a scratch directory, never in the sibling aeon checkout (a peer's
live tree); `EMPYREAN_SUITE_ROOT` exported for every tool run in the copy.

## 1. The pin

aeon **`64ab0221c67d302529818a6aeac58ad4e0a65574`** (the S2CLIP-ADOPT-SHORT-TUNNEL landing merge), named by the
overseer and verified an ancestor of aeon `origin/master`. When this row started, `origin/master` had moved to
`c29b0ac4`; it was NOT chased. `git diff --name-only 64ab0221 c29b0ac4` names three files, all lane logs and a
handoff under aeon `docs/`, so every currency row (which reads `origin/master`) sees the same blobs as the pin.

Blobs at the pin: `games/sonic4/data/clips/s2_ehz_cpz/clips.json` `c3c9beb8` (last touched by `479b6637`, the
non-merge commit inside the landing), `tools/clip_manifest.py` `8c658fa1` (also last touched by `479b6637`),
`tools/clip_act_bake.py` `232798dc` (unchanged since row 216), `games/sonic4/data/clips/s2_two_clip/clips.json`
`2ff33b48` (unchanged).

The copy: `git archive 64ab0221`, extracted to the scratchpad; `tools/s2_zone_convert.py convert --all-six` there,
exit 0, 6 zones, 2219040 cells round-tripped, 0 differing, 0 FAILED.

## 2. The peer's landing notice, checked

Re-derived from `git diff 8a6f92c4 64ab0221`. Held: corridor 832 -> 384 px (x 10976..11359), CPZ dst x
11808 -> 11360, unpainted remainder x 15936..16383, new top-level `crossing_overrides`, `anchors.toml` re-derived,
`s2_ehz_cpz_short/` deleted (absent from `git ls-tree 64ab0221 games/sonic4/data/clips/`), `clip_manifest.py`
docstring only (the hunk is one docstring paragraph), `clip_act_bake.py` untouched.

Not as stated, for Aurora: "`validate --json` byte-identical (695 bytes)" is a claim about aeon's previous tip
`8a6f92c4` (not measured here). Against the capture Aurora vendored at row 216 (`c838a30f`, a 7-section act) the
`accept_s2_ehz_cpz` stdout is NOT identical: it is 695 bytes and now carries one W3 warning (section 5 holds
`ehz_act1` and `cpz_act1`), where Aurora's copy had `warnings: []`. That is the input manifest moving, not the tool.

## 3. What changed in Aurora

| File | Old -> new | Finding |
|---|---|---|
| `test/fixtures/clips/s2_ehz_cpz.clips.json` | blob `d891f2d1` -> `c3c9beb8`, 6607 -> 12788 bytes, revision `1a020976` -> `479b6637` | grid_w 7 -> 8; corridor {y 0, w 1312, h 1024} -> {y 512, w 384, h 512} plus a `tunnel` object; cpz_act1 dst {x 12288, w 2048} -> {x 11360, w 4576}; unpainted_remainder.x_from 14336 -> 15936; NEW `crossing_overrides`; no final newline |
| `test/fixtures/clips/aeon-outputs/validate-json.cases.json` | tool `82e1bea3` -> `8c658fa1`, capture `c838a30f` -> `64ab0221` | 9/9 cases, exit codes unchanged. `accept_s2_ehz_cpz` gains W3; `refuse_r10_clip_corridor`'s message names the new corridor rect; the two crash tracebacks differ in scratch path and line numbers; 5 cases byte-identical |
| `test/fixtures/clips/aeon-outputs/s2_ehz_cpz.clipact.json` | capture `c838a30f` -> `64ab0221`, tool `232798dc` unchanged | was SEMANTICALLY STALE (section 4) |
| `test/fixtures/clips/aeon-outputs/s2_two_clip.clipact.json` | capture `c838a30f` -> `64ab0221` | not stale: only two wall-clock `seconds` fields differ; re-captured so all three markers name one revision |
| `test/formats/clip-tool-outputs.test.ts` + the three aeon-outputs markers | new `aeon.inputs` and 6 rows | section 5 |

No Aurora source changed.

## 4. The `crossing_overrides` risk: no consumer break

Aurora has exactly one reader of a clips.json: `src/core/formats/donors/clip-manifest-doc.ts` (used by
`src/renderer/state/donor-paste.ts`). It is NOT a closed schema: it keeps the RAW object, reads the fields it
needs, and a paste appends to `raw.clips` and serialises the raw object, so every other key survives. No JSON
schema for clips.json exists in Aurora. The new key is therefore neither refused nor dropped, and nothing was
loosened. Modelling it was not done: no Aurora code has a use for it, and at the pin aeon's only reader is
`tools/clip_rom_bake.py` (`crossing_overrides()`, the ROM bake Aurora never runs); `clip_manifest.py` and
`clip_act_bake.py` do not read it.

Proof that the existing round-trip row holds this key (not a new gate): `withClip` mutated on disk to
`delete raw.crossing_overrides`; `test/formats/clip-manifest-doc.test.ts` went RED, 1 failed / 14 passed, the
failing row "s2_ehz_cpz: parse -> append -> serialise keeps every key the file had" printing the missing
`crossing_overrides`; restored from HEAD, 15/15 green.

One formatting difference, not a loss: aeon's file now has no final newline, and Aurora's writer always writes
exactly one (`jsonFileText`), so a paste into this act adds one byte at the end.

`s2_ehz_cpz_short`: `git grep` finds it only in ROADMAP row 218's own text. Nothing in Aurora references the
deleted clip.

## 5. The bake outputs, and pinning the input

Measured from the gate's code: `clip-tool-outputs.test.ts`'s CURRENCY block read ONE path per marker,
`aeon.tool_path`, and compared its blob at aeon `origin/master`. The clips.json the recorded command bakes was
never read, and `clip_act_bake.py` did not move, so the two clipact rows stayed green by construction.

Re-running the recorded bake in the archive copy (exit 0) answers staleness directly. The vendored
`s2_ehz_cpz.clipact.json` was the 7-section act; at the pin: grid_w 8; pool 872 tiles / 14 pages -> 1062 / 17;
cpz_act1 tiles 390 -> 554; corridor tiles 2 -> 28; sections 21 -> 24; one bake warning (was none);
zone_separation min column gap 164 -> 48 cells; `zone_table[2].synthesised` `corridor_sheet()` -> `corridor_art()`.
That last one comes from `clip_manifest.py`, which the bake imports, so the tool blob alone is not even the whole
tool. Re-captured.

The gate now pins inputs too (small, so built). Each aeon-outputs marker carries `aeon.inputs` [{path, blob}]:
the clipacts pin their clips.json and `tools/clip_manifest.py`; validate-json pins the s2_ehz_cpz and s2_two_clip
manifests. Two rows per marker:
- completeness: every clip manifest the recorded run reads is pinned, DERIVED from `fixture.command` and, for
  validate-json, from the generator's own `plan` and `fx()` template (not typed in the test);
- currency: each pinned input at aeon `origin/master` is still that blob (loud skip without an aeon checkout).

Stated limit (in each marker's `inputs_are`): the bake's other imports (`collision_pipeline`, `fg_page_order`,
`ojz_strip_gen`, `tile_dedupe` and theirs) and the donor conversion are not pinned.

Red-first, each mutation on disk, then restored from the committed `b70b7dc4` and green again (36/36):
1. s2_ehz_cpz clipact marker's clips.json input blob set back to the old `d891f2d1` (the pre-218 state): RED, 1
   failed / 35 passed, the currency row printing `pinned d891f2d1..., origin/master c29b0ac4 has c3c9beb8...`.
2. s2_two_clip dropped from validate-json's inputs: RED, 1 failed / 35, the completeness row naming
   `games/sonic4/data/clips/s2_two_clip/clips.json` (proves the generator derivation finds it).
3. clips.json dropped from s2_two_clip clipact's inputs: RED, 1 failed / 35, the completeness row naming the same
   path (proves the command derivation).

## 6. Suite, fidelity and harness

**Suite** (`VITEST_MAX_WORKERS=4 npm test`, foreground):
- base `a7be9741`: exit 1, Test Files 2 failed | 670 passed | 3 skipped (675), Tests 2 failed | 10484 passed |
  18 skipped (10504). The two: `aeon-fixture-currency` (`clips/s2_ehz_cpz.clips.json`) and `clip-tool-outputs`
  (`validate-json.cases.json` tool blob). Nothing else red.
- after the gate, `b70b7dc4`: EXIT 0, Test Files 672 passed | 3 skipped (675), Tests 10492 passed | 18 skipped
  (10510); skip-report OK. Tests +6 (the new input rows); passed +8 (those 6 and the 2 formerly red).

**Fidelity** (`AURORA_DONOR_FIDELITY=1`, the rig plus the eight donor/clip test files): 9 files, 101/101 passed,
nothing skipped. The rig materialises aeon `origin/master` `c29b0ac4` (tree-identical to the pin outside aeon
`docs/`). F5 on the 8-section act: s2_ehz_cpz pool 1062 tiles / 17 pages, rows ehz_act1 479t 8/7p, cpz_act1 554t
10/9p, ehz_to_cpz 28t 1/0p, pages_touched sums to 19, equal to the re-captured fixture.

**Harness** `scratchpad/donor-page-harness.mjs` under `xvfb-run`, after `VITE_AURORA_DEBUG=1 npx electron-vite
build`, `AEON_DIR` = a fresh archive copy of `64ab0221`, `AURORA_BUILT_TREE` = this worktree, `ELECTRON_BIN` =
the main checkout's electron: `root:` and `pinned:` both name this worktree, `in-tree: yes`, `src on disk:
identical to HEAD`; **15/15 PASS, 0 FAIL, 0 UNMEASURABLE**.

Section count and width: the donor page reads the act's grid from the manifest (`doc.gridW`/`gridH` in
`DonorTargetPane.tsx`, `suggestDestination`, `gridToHold`); a census of the donor sources for the old and new
widths and section counts finds no hard-coded one.

## 7. Open

- **No harness row opens s2_ehz_cpz itself.** DP.* builds its own act (`hx_donor_act`); the 8-section act is
  held by fidelity F5 and the unit rows, not by a look at the page. A visual pass on s2_ehz_cpz in the target
  pane is UNMEASURED here.
- **The vendored validate-json set no longer holds a warning-free acceptance.** Both `accept_*` cases now carry
  W3. Adding one (for example, an unmutated `s2_two_clip`) would change the generator; proposed, not built.
- **The bake's other inputs are unpinned** (section 5's stated limit).
- The donor page may want to list new aeon clip acts; `s2_ehz_cpz_short` was deleted at the pin, so there is
  nothing to list from row 218's notice 6.
