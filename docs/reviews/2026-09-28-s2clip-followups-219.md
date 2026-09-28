# S2CLIP-FOLLOWUPS-FROM-218: the real act on the page, a quiet acceptance, and the rest of the input pin (review packet, 2026-09-28)

ROADMAP row 219. Branch `parcel/s2clip-followups-219`, cut from master `4a207e54` (row 232 landed). The row books
the three items row 218 left open (`docs/reviews/2026-09-25-revendor-s2clip-218.md`, section 7). Each was re-checked
before it was worked; all three still held.

## 1. The aeon revision

aeon `origin/master` after `git fetch -q origin` on 2026-09-28 was `28880431`. Between row 232's pin
**`e47493aa2d443b5090380ce3eba9f6a22b4b3898`** and `28880431`, `git diff --stat` over `tools/`, `games/sonic4/data/clips`
and `games/sonic4/data/donors` names only `tools/bg_vscroll_rate_witness.py` and `tools/demo_specialization_witness.py`.
No clip tool, manifest or input moved, so every run below is at `e47493aa`, the same pin as row 232. aeon was read only
through git objects and through one `git archive` of `e47493aa`, extracted to `$HOME/.cache/aurora-revendor-aeon/tree`
(the path rows 231 and 232 used, so the crash tracebacks' absolute paths match). There, `EMPYREAN_SUITE_ROOT=<suite>
python3 tools/s2_zone_convert.py convert --all-six` exited 0: 6 zones, 2219040 cells round-tripped, 0 differing,
0 FAILED.

## 2. (b) A warning-free acceptance in the validate `--json` set

**Still true.** Both `accept_*` cases in `validate-json.cases.json` at `4a207e54` carry W3.

**What aeon accepts with no warning.** I ran `validate --json` on every `clips.json` in the copy. `s2_ehz_boot`,
`s2_hpz_solo`, `s2_ooz_solo`, `s2_two_clip`, `s2_two_clip_pins` and `s2_wfz_solo` exit 0 with `warnings: []`.
`s2_ehz_cpz` (1 W3), `s2_mtz_cpz` (2), `s2_woven` (10) and `s2_woven_2d` (3) carry W3.

**Built.** `gen_validate_json.py` gains `("accept_s2_two_clip", "s2_two_clip", None)`, which validates the unmutated
two-clip act. It needs no new manifest pin, because `s2_two_clip` was already one of the plan's bases. I re-ran the
generator in the copy with `<scratch>` = `../vj2`, as row 232 did. A first run with an absolute scratch path put
`$HOME` into four messages, so it was discarded. The twelve earlier cases came back identical case by case (exit,
stdout, stderr, manifest), and the file diff is a pure five-line insertion. The marker's `sha256`s, `command` (now
thirteen subprocesses), `why_these` and `what_changed_at_this_pin` are updated.

**Row** (`clip-tool-outputs.test.ts`, validate block): every acceptance whose stdout, as aeon printed it, has no
warning reads `{kind: 'accepted', warnings: []}`. The set must also hold at least one acceptance of each kind, quiet
and warning-bearing. Which case is which is read from aeon's stdout, never from a case name.

**Red/green**, each mutation shown by `git diff` on disk, restored with `git checkout HEAD --` from the committed
baseline `fe54a054`:
1. Reader plant in `clip-validate-json.ts`: `if (warnings.length === 0) return crash('PLANTED: ...')` after the
   ok-with-refusal check. **RED**, 2 failed / 78: `accept_s2_two_clip` in the per-case loop, plus the new row. **The
   same plant on the pre-219 fixtures and test (`4a207e54`) passes 78/78** in this module. Before this row, the
   module could not see a reader that mistakes "nothing to say" for a crash.
2. `accept_s2_two_clip` deleted from the bundle: **RED**, 2 failed / 77 (the new row, and the bundle's sha256 row).
3. Restored: **GREEN**, 80/80.

## 3. (c) The inputs the pin did not cover

**Still true.** Before this row, each marker's `aeon.inputs` held the clip manifests (and `clip_manifest.py` for the
clipacts, plus `collision_pipeline` and `fg_page_order` for bake-json). Its `inputs_are` said the bake's other
imports and the donor conversion were not pinned.

**Measured, not guessed.** I re-ran each recorded command (the three clipact bakes and the three generators) and the
donor conversion in the copy with a `sys.addaudithook` `open` hook in every Python process (a `sitecustomize.py` on
`PYTHONPATH`, logging each distinct opened path). From the log I kept every path inside the copy, bar two kinds:
- the donor trees, which are gitignored in aeon (`.gitignore:205 games/sonic4/data/donors/`) and are the
  conversion's output;
- the scratch outputs.

Every file kept is committed in aeon, and has the same blob at `b85e60d2`, `e47493aa` and `origin/master`
`28880431`. Per marker, 16 to 23 inputs, in four kinds:
- the manifests;
- every aeon module the run loaded, including the lazily imported `layer_lines` and `s2_layer_lines` that the bake
  loads;
- `tools/s2_zone_convert.py` and `tools/import_s2_collision.py` from the conversion;
- the data files the modules opened: `project.json` everywhere, and wherever
  opened `art/palettes/SonicAndTails.bin`, `games/sonic4/player/knuckles.emp` and
  `games/sonic4/data/collision/base_s2/{angles,heightmaps}.bin`.

The currency row ("each pinned input at aeon origin/master is the blob it was captured from") needed no change. It
already walks `aeon.inputs`, so it now checks all of them in the same way.

**New row per marker**: the static import closure of `tool_path` and of the conversion tool that `materialised_by`
names. The row derives it at the marker's revision through git objects (`import x` / `from x import`, anywhere in the
file; a name is an aeon module when `tools/<name>.py` exists at that revision). Every module in the closure must be
pinned or listed in `closure_not_loaded`. `closure_not_loaded` holds the modules the trace saw no process load:
`gen_collision_data`, `ojz_block_gen`, `ojz_entity_gen`, `s4lz`, and, for validate-json and paste-music,
`fg_page_order`, `layer_lines` and `s2_layer_lines` too. All are imported only inside functions these runs never call.

The row cannot re-trace, but it refutes the one listing the source can refute: a not-loaded module that a pinned
module imports at column 0. It also holds each pinned blob to the file at the marker's own revision, so no blob can
have been typed or taken from another tree. The row skips loudly without an aeon checkout.

**Red/green**, mutations on disk, restored from the committed `338950f6`:
1. `tools/vram_map.py` dropped from s2_ehz_cpz clipact's inputs: **RED**, 1 failed / 85, naming `tools/vram_map.py`
   as imported but neither pinned nor measured not-loaded.
2. validate-json's `engine/system/constants.emp` blob set to the one before its last change (`3d369bc7~1`,
   `508ab825`): **RED**, 2 failed / 84. The new row reports the blob is not the file at `e47493aa`. The currency row
   reports `origin/master 28880431 has b86134bf`. That second red is the proof that the existing currency row now
   checks a data input.
3. `tools/s2_donor.py` moved from paste-music's inputs into `closure_not_loaded`: **RED**, 1 failed / 85, naming it as
   imported at top level by `clip_manifest.py`, `s2_zone_convert.py`, `import_s2_collision.py` and
   `donor_provenance.py`.
4. Restored: **GREEN**, 86/86.

**Stated, not pinned** (each marker's `inputs_are` says so):
- the modules in `closure_not_loaded`;
- the donor SOURCES outside aeon. The conversion reads the suite's `s2disasm` (art, collision, level, mappings,
  `s2.asm`, `s2.constants.asm`) and `s2-simonwai-disasm` (HPZ), and the bake reads `s2disasm/level/objects/*_1.bin`
  and `s2.asm` directly. They are other repositories' working trees, read by path, and a currency row that asks aeon
  `origin/master` cannot see them. I recorded their HEADs at capture (both clean);
- anything opened below Python, such as a C extension's `fopen`, which the audit hook cannot see. I checked that the
  traced modules use no `np.fromfile`, `memmap` or `ctypes`.

**The currency red rate, and the overseer's ruling.** `git log --since=2026-08-28 origin/master` over aeon, counting
every pinned path across the six markers (tool paths included):

| pins | paths pinned | commits that moved one | days with such a commit |
|---|---|---|---|
| before row 219 | 8 | 58 | 9 |
| full pin (as first built, `338950f6`) | 27 | 143 | 19 |
| **now: full pin minus `constants.emp`** | 26 | 115 | **16** |
| (for reference) also minus `ojz_strip_gen.py` | 25 | 96 | 14 |

Per path over the same 30 days, the highest are `engine/system/constants.emp` 37, `tools/ojz_strip_gen.py` 27,
`tools/clip_manifest.py` 23, `tools/clip_act_bake.py` 16, the `s2_ehz_cpz` manifest 14 and `tools/vram_map.py` 13.

The overseer ruled to drop `constants.emp` from the pin and declare it. Every marker now carries
`aeon.inputs_excluded: [{path: "engine/system/constants.emp", why}]`. The `why` says the file IS read (by
`clip_manifest.py`, `fg_page_order.py`, `fg_working_set.py` and `layer_lines.py`, and the trace saw every run open
it) and is deliberately NOT pinned. It gives the measurement (37 commits in 30 days; red-days 9 -> 19 under the full
pin, 16 without it) and says the finer pin is tracked as ROADMAP row 234. Each marker's `inputs_are` says the same.
So a change to a constant the tools read can move an output with every currency row green, until row 234 lands.

The ruling said to treat any comparable-churn input the same. The next one is `tools/ojz_strip_gen.py` (27). I named
it and **kept it pinned**: it is executed code, not a file the tools read a few named values from, so row 234's finer
pin does not apply to it. Dropping it too would take red-days to 14. That is the overseer's call if wanted.

**The check still refuses an undeclared omission.** The closure row now also derives the committed DATA files the
loaded modules (tool_path and every pinned `tools/*.py`) name, as an `os.path.join` of string literals, at the
marker's revision. Each must be:
- pinned;
- in `data_not_opened` (named by a loaded module, but the audit trace saw no process open it: for example
  `engine/level/camera.emp` and the OJZ act descriptor); or
- a declared exclusion. An exclusion must be of a file a loaded module names, and it must carry a `why`.

A declared exclusion is a category of its own, separate from "measured not loaded/opened". Red/green, each mutation
on `s2_ehz_cpz.clipact.provenance.json` on disk, restored from the committed `124bac12`:
1. `tools/vram_map.py` dropped from `inputs`: **RED**, 1 failed / 85, naming `tools/vram_map.py`.
2. `project.json` dropped from `inputs`, undeclared: **RED**, 1 failed / 85, naming `project.json`.
3. The `inputs_excluded` declaration of `constants.emp` removed, which leaves it an undeclared omission: **RED**,
   1 failed / 85, naming `engine/system/constants.emp`. At `338950f6` this omission would have passed, because the
   closure row saw modules only and the currency row sees only what is listed.
4. Restored (the declared exclusion in place): **GREEN**, 86/86.

## 4. (a) The real `s2_ehz_cpz` act on the donor page

**Still true, with a correction.** Row 222 (landed after 218) added DP.9s, which clicks `s2_ehz_cpz` in the act
list, but only to read its song line. No row asserted anything about how the page shows the act, and nobody had
looked at it.

**The act at the pin**, read from the copy's `clips.json` and the harness's own bake of it: 8 x 3 sections (grid_w 8,
the "8-section" act, 24 sections in all), clips `ehz_act1` and `cpz_act1`, corridor `ehz_to_cpz`, 1062 pool tiles in
17 pages. Sections 0 to 7 hold painted cells. 13 to 15 hold cells claimed by `cpz_act1` (it is lowered 256 px) but
only aeon's blank tile. The other 13 sections are untouched by any rectangle.

**Rows** (`scratchpad/donor-page-harness.mjs`, still `npm run harness:donor-page`). They run right after DP.9s's
click and before DP.10 paints the EHZ donor. Every expectation is read from the copy's disk or the harness's own
bake (aeon's CLI in the copy):
- **DP.11a**: the act buttons are exactly the clip acts on the copy's disk (11 at the pin, including the harness's
  `hx_donor_act`). The facts line is the `clips.json`'s grid, clip count and corridor count.
- **DP.11b**: the pane holds the whole 16384 x 6144 world, with both corners in the pane rect. Each of the 24
  sections drew iff the bake paints a non-blank cell there: the compose report is taken at full size, and blank means
  tile index 0 in a cell a zone claims (zonekey >= 0). On the canvas, read back per section 3 px in:
  - every painted section shows opaque pixels over at least a quarter of its painted-cell share;
  - every untouched section shows no pixel at all.
- **DP.11c**: aeon's readout is the harness's own bake:
  - the act line: tiles, pages, worst window, collision attr entries;
  - the pool grid, cell for cell over both clips and the corridor;
  - aeon's tile sum holds and no invariant is flagged;
  - one collision line per clip.

**Harness facts.** Every run: `root:` and `pinned:` name this worktree
(`AURORA_BUILT_TREE=.../agent-acdfec4a6071a4f09`, `ELECTRON_BIN` the main checkout's electron), `src on disk:
identical to HEAD`, `VITE_AURORA_DEBUG=1 npm run build` first, `AEON_DIR` = the `e47493aa` archive copy (the harness
copies it without `donors/`), `TMPDIR` under `$HOME`. Baseline before the new rows: 23/23. With them: **26/26 PASS, 0
UNMEASURABLE**.

**A vacuous clause found by its own plant.** The first plant capped the compose at 4 sections. The canvas "share"
over sections 4 to 7 still read 0.506 with no bitmap drawn there. Every clip rectangle is filled at alpha 0.06
(`DONOR_MARK_FAINT_FILL`), so "any non-zero alpha" is true inside a clip whatever is drawn. The clause now counts
opaque pixels (alpha >= 250). Art is opaque. The fill is not.

**Red/green.** Plants in the app source, shown by `git diff` on disk, then a debug rebuild and a harness run:
1. Against `931de770`, three plants together, each touching one row, and each invisible on the harness's own one-section act:
   - a 4-section cap in `composeBaked`;
   - the corridor rows dropped from `PoolRowsView`;
   - the facts line printing `0 corridor(s)`.

   **RED**: 23/26, exactly DP.11a, 11b and 11c. The earlier 23 rows (DP.6d and DP.6e on the small act included)
   stayed green. Each red's detail names its own cause: the facts read `0 corridor(s)`; the per-section report has
   `drawn: null` from section 4 on; the pool ids lack `ehz_to_cpz`.
2. Against `82a4f5ab` (the fix), a canvas-only plant: the compose report intact, and bitmaps past section 3 not pushed. **RED**: 25/26,
   DP.11b only, with the per-section report intact (iff holds) and opaque 0 over sections 4 and 5. Before the fix,
   this plant would have passed.
3. Restored from the committed tree (`git checkout HEAD --`), rebuilt: **GREEN**, 26/26, `src on disk: identical to
   HEAD`.

**What the screenshots show** (`SHOT_DIR`; the new rows also save the pane at 2x and the readout scrolled into
view). This is for the overseer's look call; I changed nothing on the page:
- **The act is small in the pane.** On the 1680 x 1050 window the target pane is 860 x 319 px. The fitted world is
  about 765 x 287 px (scale 0.047), so a 2048-px section is about 96 px and the EHZ strip about 48 px tall. The lower
  two thirds of the pane are empty, because two of the act's three section rows hold no art: that is the act's real
  shape.
- **Labels collide at two corners.** At (0,0) the draft outline carried from the earlier act (`ehz_2x`, "Place at 0
  0") prints its id over `ehz_act1`'s, so the shot reads "ehz_2xct1". The corridor's label `ehz_to_cpz`, drawn at the
  corridor's corner, runs into `cpz_act1`'s frame and art.
- **The draft is not re-placed when the act changes.** On `s2_ehz_cpz` it still points at (0,0), inside `ehz_act1`,
  so a Paste there would be refused (R10). That is carried state, not wrong output. I flag it and have not changed
  it.
- **Pool grid ids truncate.** In the side panel the first column shows "ehz_a...", "cpz_a...", "corrid..." and the
  header "pool c...", so on this act the ids cannot be read on screen.
- **CPZ reads as sparse white and blue line art on black** at this scale, beside a dense EHZ. It is plausibly CPZ's
  plane-A foreground (the pane draws no background plane), but I have not confirmed it against the donor pane at
  equal zoom. It is worth one look.
- The act list (11 buttons) wraps cleanly. The readout's act line and collision lines read in full.

## 5. Suite

Run on the docs commit on top of `82a4f5ab`, from the worktree, `VITEST_MAX_WORKERS=4`, `TMPDIR` under `$HOME`:
- `npm test` (every pre-check, `tsc --noEmit`, then vitest): exit 0. **Test Files 674 passed | 3 skipped (677); Tests
  10525 passed | 20 skipped (10545)**; `run-completeness: COMPLETE, 677 of 677`; `failure-class: no failures`;
  `skip-report: OK` (the skips name their reasons: no s4_engine tree, and sibling-root step 3, which is unmeasurable
  from a linked worktree).
- `npx tsc --noEmit`: exit 0. `npm run check:doc-citations`: OK.
- `npm run harness:donor-page`: 26/26 PASS, 0 UNMEASURABLE (section 4).

## 6. Commits

- `fe54a054` (b) the quiet acceptance;
- `338950f6` (c) the extended pin and the closure row;
- `931de770` (a) DP.11a to DP.11c;
- `82a4f5ab` (a) the opaque-pixel fix;
- the ROADMAP row and this packet, then the closing figures;
- `124bac12` (c) the overseer ruling: `constants.emp` a declared exclusion, and the data-file clause;
- ROADMAP row 234, and this packet and row 219 updated to match.

## 7. Open

- `constants.emp` is a declared exclusion by overseer ruling. The finer pin (the constants the clip tools read, by
  name and value) is ROADMAP row 234. Whether `ojz_strip_gen.py` (27 commits in 30 days, kept pinned) should follow
  is the overseer's call.
- The look items in section 4: the pane size on a big act, label collisions, the carried draft destination, the
  truncated pool ids, and CPZ's appearance.
- The donor sources outside aeon (`s2disasm`, `s2-simonwai-disasm`) are recorded, not pinned. Checking them would
  need a currency rule for repositories aeon reads by path.
