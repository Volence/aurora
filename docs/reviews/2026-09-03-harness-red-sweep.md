# O50 — the unregistered-harness red sweep

**Branch** `test/o50-harness-red-sweep`
**Stage 1 (static) started** 2026-09-03T04:02:29Z, uptime 8 days 15:51 · **run stage finished** 2026-09-03T04:54:31Z, uptime 8 days 16:43
**Companion machine-readable file** `docs/reviews/2026-09-03-harness-red-sweep.json`, one row per file, all 101.

This is a **triage report, not a fix**. Nothing swept was repaired, and `package.json` was not
touched (a sibling lane owns registration on `fix/o49-harness-registration`).

---

## The answer, up front

Of the 101 instruments no `package.json` script can name:

| verdict | count | |
|---|---|---|
| **GREEN** — ran, every row passed | **47** | *but 12 of those assert nothing at all — see below* |
| **RED** — ran, rows failed | **28** | 3 of them also hung and were killed, so their failure counts are lower bounds |
| **UNRUNNABLE** — ran, could not complete | **14** | crashes, hangs, and one that measures zero rows by its own tally |
| **NOT RUN** — not attempted | **12** | all of them: needs a live emulator |
| **total** | **101** | |

**Every one of the 89 non-emulator instruments was launched.** The sweep is complete over the
runnable set; nothing is left un-attempted for want of time.

The blunt version: **42 of 101 (28 RED + 14 UNRUNNABLE) are not in a working state**, and a
further 12 pass only in the sense that they never assert anything. Fewer than a third of this
population — 35 files — both ran and actually checked something.

---

## Why this sweep exists

Twice on the night of 2026-09-02/03 an instrument was found silently non-functional for days,
and both times the reason it was invisible was the same: no `package.json` script could name it.

- `docs/lane-log.jsonl` @ `2026-09-03T01:38:37Z` — a harness **RED for six days at 30/31**,
  holding a rule overturned on 2026-08-27 at `7ba5a638`. The repair had dropped a parameter so
  stale call sites would fail to compile — which works for TypeScript and **does not reach a
  `.mjs` harness**. It hid because the two rules agree at `vp.y === 0`, only one row of 31 pans,
  and the harness was not in `package.json`.
- @ `2026-09-03T02:31:42Z` — O48 found `crossover-paint` at 12/13 and read it as the known
  reused-copy shape.
- @ `2026-09-03T03:03:07Z` — O48c ran it on a fresh tree and found something sharper: it fails
  `[2c]`, **its own anti-vacuous row**, on a clean checkout. It has *never* been runnable on a
  clean tree; it only ever passed against a tree a previous session had painted into, and its
  own guard is the thing that says so.

---

## Population, as derived

```
git ls-files 'scratchpad/*-harness.mjs' 'scratchpad/*-probe.mjs' 'scratchpad/*-proof.mjs'
```

`git ls-files`, not `ls` — the filesystem also carries `.gitignore`d instruments outside this
repo's contract, and an agent worktree carries none of them, so the two commands answer
differently (the same count discipline as `scratchpad/lib/run-root.mjs`).

| | count |
|---|---|
| tracked instruments matching the three suffixes | **145** |
| reachable by a `package.json` script (basename appears in `scripts`) | 44 |
| **unregistered — the population of this sweep** | **101** |

The glob is a git pathspec, whose `*` crosses `/`; that is why
`scratchpad/handover/handover-band-harness.mjs` is in the population. It is counted.

---

## Stage 1 — static classification (committed before anything was run)

All 101 were read for **what they need** before any launch. Buckets sum to the population.

| bucket | count |
|---|---|
| needs a live emulator / Aether socket → **NOT RUN (needs emulator)** | **12** |
| needs the owner's display / foreground-only | **0** |
| headless-safe, needs a copy of the **aeon** project tree | 40 |
| headless-safe, needs a copy of the **s1disasm** project tree | 36 |
| headless-safe, needs **both** trees | 8 |
| headless-safe, needs **no** project tree | 5 |
| **total** | **101** |

Two files in the last bucket were reclassified to `aeon` after the first run stage exposed a
**transitive** dependency the static predicate missed — `bganim-motion-harness.mjs` gets its
tree through `./bganim-preview-fixture.mjs`, and `build-console-overlap-harness.mjs` through
`checkoutOverride('aeon')`. The corrected classification is what the final run used, and it is
what the JSON records. That miss is worth stating rather than quietly fixing: a
"needs no project tree" verdict derived from one file's own text is wrong exactly when the
dependency is one import away.

### Foreground-only: none

No file in the 101 sets `headless: false`, pins `DISPLAY=:0`, or shells out to `xdotool`. The
predicate was run over all 101 and returned zero, and the zero is corroborated by every header
in the set describing an `xvfb` launch — it is not an absence of looking.

---

## How the runs were done, and what that means for the results

1. **The app under test is this branch's own build, in-tree.** `npm ci` + `VITE_AURORA_DEBUG=1
   npm run build` were run *in this worktree*, so `scratchpad/lib/run-root.mjs` reported
   `in-tree`, **not `BORROWED`**. This matters: a first attempt borrowed the main checkout's
   build and 18 harnesses refused to run at all (see finding 2).
2. **Fresh project trees per run.** Every run got its own copy, made before the run and deleted
   after it, so no harness saw another's leftovers and none saw its own:
   - **aeon** — a real `git clone` of `../aeon` at its live HEAD `73b07a4f`, *with history*,
     because several harnesses run `git archive <sha>` inside the tree they are given. A
     `git archive` tarball has no `.git` and made two harnesses fail for that reason alone in
     an earlier pass; that pass was discarded, not reported.
   - **s1disasm** — `cp -a` of `../s1disasm`.
   - Neither live sibling working tree was opened by any run: `AEON_DIR` and `S1DISASM_DIR`
     pointed at the copies. `git status` on the live aeon tree after the sweep shows two
     modified files, `docs/lane-status.json` and `tools/freeze_preflight.sh`, **neither under
     any path any swept harness names**, and the second predates the sweep by eleven hours.
3. **The fixture is faithful.** `games/sonic4/data/editor/` in the clone matches the live tree
   file-for-file, and neither tree carries a `.aurora/` state directory. The aeon REDs below are
   therefore against aeon's real committed state, not against an impoverished copy.
4. **One run, one claim.** No row's evidence is stitched from two runs. Where an earlier pass
   was invalidated (borrowed build, tarball fixture), it was discarded whole.
5. **Load.** 1-minute load average was 14.28 at sweep start and 6.52 at the end, with other
   lanes active throughout. No timing figure here is a clean-machine measurement.
6. **`devicePixelRatio` varies between runs on this machine.** No RED below rests on a
   fractional-rect off-by-one, so this caveat did not have to be invoked — but it was not
   resolved by re-running until a result agreed, and nothing here was re-run to get a nicer
   number.

---

## Findings

### 1. ⚠ A hypothesis I formed, tested, and had to throw away

Nineteen of the failures cluster on one surface — the Effects facet's band and scene panels —
and commit `72cebd1c` ("effects: three sub-tabs, so one job shows one panel", 2026-09-02 19:31,
about nine hours before this sweep) had just put that column behind three sub-tabs. The
mechanism is exactly right: a section behind an unselected sub-tab is not in the DOM, so a
harness that clicks the Effects pill and looks for "New band" finds nothing. And the
correlation looked strong: the five sub-tab-*aware* harnesses that failed scored 28/29, 37/38,
37/40 and 35/37 — one or two rows each — while the unaware ones failed wholesale.

**I built a control and it refuted the hypothesis.** `src/` was checked out at `adefc7aa`
(the commit *before* the sub-tab change; verified by `EffectsSubTabBar.tsx` being absent),
rebuilt, and three representative failures re-run:

| harness | control @ `adefc7aa` (pre-sub-tab) | HEAD (post-sub-tab) |
|---|---|---|
| `bganim-band-harness` | throws `no "New band" section on screen` | **identical** |
| `effects-column-harness` | 17 PASS / 9 FAIL | **19 PASS / 7 FAIL** — HEAD is *better* |
| `section-header-action-harness` | 4 PASS / 1 FAIL | **identical** |

HEAD is equal or better on all three. **The sub-tab commit is exonerated**; these failures
predate it. I am recording the refuted hypothesis rather than deleting it because the
correlation was strong enough that a reader who re-derives it deserves to know it was tested.
The actual cause of the Effects-panel cluster is **not determined by this sweep** — finding
them was the job; diagnosing them is not, and guessing would have shipped a wrong attribution
onto a commit that is nine hours old and innocent.

### 2. The staleness gate compares two different trees — 18 instruments, unrunnable from any worktree

Eighteen instruments carry this refusal:

```js
const distM = statSync(MAIN).mtimeMs;               // the tree the run is AGAINST  (question 2)
const newest = execSync(`find ${join(ROOT, 'src')} …`);  // the tree the file LIVES IN (question 1)
if (Number(newest) * 1000 > distM) throw new Error('dist/ is STALER than src/ — …');
```

`MAIN` comes from `runTarget()`; `ROOT` is the caller's own location. In the main checkout
those are one directory and the gate is correct. **In a linked worktree they are two**, and a
fresh worktree's `src/` mtimes are its checkout time, so the gate fires unconditionally no
matter how fresh the build is. Measured here: main `dist/main/index.mjs` at `1788405477`, this
worktree's newest `src` file at `1788407973` — 2,496 s newer, from checkout alone.

This is the same question-1/question-2 confusion `scratchpad/lib/run-root.mjs` exists to end,
surviving inside the one expression that mixes the two. `mapviewport-baseline-harness.mjs` is
worse: it `statSync`s `join(ROOT, 'dist/main/index.mjs')`, a path that does not exist in a
worktree at all, so it throws ENOENT rather than refusing cleanly.

The 18: `animated-art`, `chunk-links`, `classic-playtest`, `composer-collision-gesture`,
`composer-priority`, `mapviewport-baseline`, `marquee-stamp`, `priority-lens`,
`s1-anim`, `s1-boss-sprites`, `s1-layout-anim`, `s1-library-presentation`,
`s1-nonlevel-families`, `s1-priority-occlusion`, `s1-saveback-cdp`, `s1-sonic-preview`,
`s1-sonic-sprite`, `sprite-restore`. This sweep worked around it by building in-tree; that
workaround is not available to anyone who assumes a worktree can borrow a build, which is what
`run-root.mjs` was written to make possible.

### 3. A second instance of the O48d "never runnable on a clean checkout" shape

`build-console-overlap-harness.mjs` defaults its project to
`scratchpad/fixtures/aeon-console-fix` — a **gitignored 56 MB directory it does not create**.
Its header documents an `rsync` a human must run first. On a clean checkout with no `AEON_DIR`
override it opens a path that is not there, and its own anti-vacuous row `[1a] the aeon project
is open, with sections` is what says so — precisely `crossover-paint`'s shape from O48d.

It is GREEN in this report at 21/21 **only because this sweep handed it an `AEON_DIR`**. Nine
fixture directories are referenced across the family and exactly one path under
`scratchpad/fixtures/` is tracked (`ojz_forest_flowers.roomy.png`); the rest are absent on a
clean checkout. Most harnesses build theirs (`hardlinkCopy(dest, force)`); this one does not.

### 4. The whole CDP family shares one 10-entry global list, outside any repo

Every harness that opens a project appends to `~/.config/Electron/recent-projects.json` — one
file, shared by every run on this machine, capped at 10 entries, in no repo and under no
harness's cleanup. Two instruments *navigate by it*: `palette-drag-harness` and
`palette-grid-harness` both died with `aeon recent row unreachable`, and their diagnostic
prints a recent list made entirely of **other harnesses' temp directories**. Their result is
therefore a function of what ran before them, which is the one thing a test must not be.

**My own error, recorded.** This sweep's 89 runs evicted every entry the owner had in that
file: all 10 rows afterwards were mine, so his were pushed out. I deleted the sweep's temp
directories, which left those 10 rows pointing at nothing, and reset the file to `[]`. **I
destroyed something I did not make and cannot restore.** The owner's recent-projects list is
empty and he will have to re-open his projects once. Same class as O48c's deletion of
`.aurora-crossover-paint`, and the mitigation nobody has built is the same one: the harness
guard already snapshots and restores `~/.aurora/mcp.json` and
`~/.sonic-level-editor/mcp.json` around every run — it does not know about this third file.

### 5. Residue: one sweep left 3.8 GB, and overwrote two tracked files

After 89 runs, `scratchpad/` held **3.8 GB**, none of it cleaned up by the harnesses that made
it:

| path | size | made by |
|---|---|---|
| `scratchpad/fixtures/aeon-bganim-coherent` | **3.3 GB** | `bganim-preview-fixture.mjs` (`cp -al` of the whole aeon tree) |
| `scratchpad/fixtures/aeon-band-art-fg` | 93 MB | `band-art-foreground-harness` |
| `scratchpad/fixtures/aeon-bg-dangling` | 93 MB | `bg-dangling-ref-harness` |
| `scratchpad/fixtures/aeon-bg-picker-writable` | 93 MB | `bg-tile-picker-harness` |
| `scratchpad/fixtures/aeon-bg-unbound` | 93 MB | `bg-override-paints-harness` |
| `scratchpad/fixtures/aeon-tile-door` | 93 MB | `bganim-tile-door-harness` |
| `scratchpad/shots-*` | 29 MB | most of the CDP family |

These are hardlink copies, so the *bytes* consumed are far less than `du` reports — but the
3.3 GB entry is the one to look at: when `bganim-preview-fixture.mjs` runs with no `AEON_DIR`
set, it `cp -al`s **the owner's live 3.3 GB aeon tree**, creating 1,356-plus hardlinks into it.
Nothing was written through them here and the live tree is clean, but a harness that ever wrote
in place rather than replacing would edit the live tree through its own fixture. This is the
same family as the 52 MB-per-run leak fixed at `c089da09`, one directory over and 60× larger.

**Two tracked files were overwritten by a run:** `scratchpad/handover/shots/1-before-promote.png`
and `2-after-promote.png`, by `handover/handover-band-harness.mjs`. A run of that harness
dirties the repo, and a `git add -A` anywhere near it would commit the new screenshots. All
residue was removed and both tracked PNGs restored from `HEAD`; `git status` is clean.

### 6. Twelve "GREEN" files assert nothing whatsoever

These ran clean and are recorded GREEN, but they contain **zero PASS rows and zero FAIL rows** —
they are measurements and diagnostics, not gates, and several say so in their own headers
(`label-measure-probe`: *"no assertions, just numbers"*). They are flagged
`"asserts_nothing": true` in the JSON so a future suite total cannot count them as coverage:

`artmode-repro-harness`, `assign-black-harness`, `bganim-marquee-resolution-probe`,
`block-fanout-probe`, `fromtile-typing-probe`, `guide-aim-probe`, `label-measure-probe`,
`loop-cell-probe`, `marquee-paste-probe`, `row8-probe`, `storage-flush-probe`,
`zone-blocks-probe`.

This is the report's own version of the defect it was sent to find: in a suite total, a file
that asserts nothing and a file that passes are indistinguishable.

### 7. A file whose header says it is not committed, and is

`scratchpad/_select-key-probe.mjs` opens *"THROWAWAY probe (not committed)"*. It is tracked.
It is also UNRUNNABLE — it throws `Error: Uncaught` from its own evaluated expression.

### 8. Exit codes cannot be used as verdicts here

`xvfb-run` returns non-zero when its X server has already gone (`kill: (…) - No such process`)
*after* a harness has printed `20/20 rows passed`. Any sweep that reads exit codes will report
green harnesses as failures. Every verdict in this report comes from the harness's own printed
rows and tally; exit code is recorded in the JSON but never decides.

---

## RED — 28 instruments, with the failing rows

Assertion text is quoted from the run, trimmed to 300 characters. **None of these was fixed.**

#### `layer-bound-harness.mjs` — 28/46

- [3a4] ANTI-VACUOUS: the scene's v_offset field exists and took the owner's value
- [3b] ANTI-VACUOUS: the scene exists, is LOCKED, and holds v_offset
- [5a] THE OWNER'S CASE: the fire layer is HELD at EFFECTS_FIRE_LINE_MIN + v_offset
- [5b] ⚠ THE RED ROW: something on screen EXPLAINS the stop, mid-gesture
- [5c] it names the REASON, not just the number: the fire rule, v_offset, and the view box
- [5e] the held guide is PAINTED in the refusal colour — and only there
- [5f] the SENTENCE is painted too, not merely published — its plate is on the canvas
- [5g] the commit agrees with the preview: the document got the floor, not the cursor
- [7a] a fire layer dragged well inside its bound says nothing
- [8a0] the v_offset field took the owner's SECOND value
- [8a] ANTI-VACUOUS: v_offset really moved to the owner's second value
- [8b] ⚠ THE FLOOR MOVED WITH v_offset — a fire bound, not a fixed wall
- [8c] and the sentence moved with it: it quotes the NEW v_offset, not the old
- [9a0] the v_offset field took a value that strands the placed layer
- [9b] THE FIX FOR IT: the canvas now marks the stranded layer, with no gesture asking
- [9c] and it says the BOX moved the floor — the causal link the author needs
- [9e] the stranded guide is PAINTED refused, with no cursor anywhere near it
- [10a0] v_offset restored for the viewport question

#### `effects-scene-harness.mjs` — 22/39

- [1b] an absent editor/effects/ loads as ZERO scenes with no error toast
- [3c] clicking New created the scene in the MODEL, not just on screen
- [4a] both of a layer's factor pickers are on screen
- [4b] the factor picker offers all 16 schema factors plus the custom form
- [4c] the precision picker offers "cell" and NOT the reserved "line" tier
- [5b] the picked factor is in the DOCUMENT
- [5c] choosing the custom form writes a schema-legal packed triple
- [6b] adding a layer grew the document to two layers
- [7c] ONE Ctrl+Z clears the assignment — the two re-picks issued nothing
- [9a] undoing the session returns the library to empty
- [10a] the four flagged controls are on screen under a header with a real inset
- [10b] no dock control runs flush to the panel edge — every one is inset like its header
- [11a] the Layers section is genuinely EXPANDED (a body, not just a header)
- [11b] every packed-factor form is genuinely OPEN (8 spinners for 2 layers)
- [11c] the layer stack is clipped by its own section rather than let out over the next one
- [11d] the maximum stack really is at the maximum, expanded, with every form open
- [11e] the maximum stack scrolls inside its section instead of painting over the one below

#### `shell-flip-harness.mjs` — 21/38  ⚠ RUN INCOMPLETE (killed at the 600s cap — the failure count is a lower bound)

- four pills — Layout, Art, Objects, Palette — ["Layout","Objects","Collision","Palette","Art"]
- NO Collision pill (the s1 profile dropped that grant) — ["Layout","Objects","Collision","Palette","Art"]
- the Layout canvas exists and has real area — 95x321
- tool dock = view / stamp-chunk / select / place-object, EACH EXACTLY ONCE — {"View":1,"Stamp Chunk":1,"Select":1,"Place Object":0,"Marquee":0,"Paint Tile":0,"Place Ring":0,"Eraser":0}
- FG/BG plane control appears EXACTLY ONCE each in the header (OptionBar dedup) — header FG:0 BG:0 (whole screen FG:1 — the extra is the status bar's plane READOUT, not a control)
- the View menu offers exactly s1's four overlays — ["Objects","Player start","Collision (path A)","Collision angles","Priority (above sprites)","Sprite occlusion (game order)","Play animations"]
- L2: the Objects facet still offers the FG/BG plane control — FG chips: 0
- precondition: the undo stack starts empty — undo enabled: null
- 3 stamps leave Undo enabled — null
- UNDO BINDING COUNT: one Ctrl+Z steps exactly ONE (Layout facet) — 3 edits took 0 presses to undo (a double binding would take 2)
- and the redo stack is correspondingly full — null
- switching to Art re-points undo at the art document (map stack not offered) — undo enabled on art: null
- and coming back to Layout restores the map's own history — redo enabled: null
- the composer is mounted in the Art canvas slot — collapse buttons: 0
- NOTE (not a regression): the composer defaults to COLLAPSED in the canvas slot — expanded by default: null
- gap 4: the art canvas shows an EMPTY STATE rather than a blank window — never rendered any empty-state text
- an aeon recent project row is reachable from Home — ["Collapse explorer (Ctrl+B)","Open Green Hill Zone Act 1","Open Green Hill Zone Act 2","Open Green Hill Zone Act 3","Open Marble Zone Act 1","Open Marble Zone Act 2","Open Marble Zone Act 3","Open Spring Yard Zone Act 1","Open Spring Yard Zone Act

#### `tile-editor-harness.mjs` — 16 failing rows, no tally printed

- [7-pre] precondition for the undo counting: the art undo stack starts EMPTY
- [7a] ONE fill = exactly ONE Ctrl+Z (stack drains in 1, tile restored)
- [6a] Pencil draws (a drag writes a run of pixels)
- [7b] ONE pencil DRAG = exactly ONE Ctrl+Z (not one per pixel)
- [6b] Line PREVIEWS while dragging and COMMITS on release
- [7b2] one line gesture = one undo step
- [6c] Rect PREVIEWS while dragging and COMMITS on release
- [7b3] one rect gesture = one undo step
- [9] right-click on the tile canvas is NOT intercepted (no eyedrop, no draw, contextmenu default left intact)
- [7c] ONE transform = exactly ONE Ctrl+Z
- [11b] SPACE-drag pans the tile view without drawing
- [14] locked tile: pencil+fill inert with NO ghost preview; red banner + not-allowed cursor + 0.6 opacity; eyedropper still works; Paste disabled
- [14b] a locked tile still TAKES marquees, and a drag inside one redraws it instead of moving it
- [15a] Escape mid-stroke clears the preview and commits NOTHING
- [15b] the NEXT stroke after an Escape commits normally (one gesture, one undo)
- [18] clicking a classic transform leaks nothing into a subsequently-opened aeon project

#### `bganim-band-lens-harness.mjs` — 29/43

- [2b] ANTI-VACUOUS: the Effects panel is mounted with the band sections
- [3b] ANTI-VACUOUS for the collapsed-section call: BOTH band sections are SHUT, and their controls are ABSENT FROM THE DOM — so everything in 4-6 runs with the panel closed
- [7z] [instrument] both band sections opened the way a human opens them
- [7a] ANTI-VACUOUS: the panel controls were found and driven
- [7b] THE LIFT: a keystroke in the PANEL changes what the MAP lights — 4x2 = 8 slots
- [7d] the panel prints the footprint, with the SAME cell count the canvas drew
- [7h] the footprint line leads with a SWATCH painted in the lens's own fill and edge colours (size not pinned — the used value moves with dpr)
- [7e] THE RULING: that sentence carries no warning vocabulary
- [7f] clicking the band CARD lights the same range clicking an animated CELL did
- [7g] THE RULING on the band card too: its footprint line names 1,244 cells and carries no warning vocabulary
- [10a] ANTI-VACUOUS: the mid-press Demote really did change the band list AND the document hash — so [10c] and [12a] are not comparing a constant to itself
- [10b] the release DROPS the mark rather than seeding through a stale layout word
- [13c] the HIDE chip on a lit lens: bandLensTarget === null and the covered pixel is byte-identical to its lens-off value

#### `capture-harness.mjs` — 13 failing rows, no tally printed  ⚠ RUN INCOMPLETE (killed at the 600s cap — the failure count is a lower bound)

- four pills — Layout, Art, Objects, Palette — ["Layout","Objects","Collision","Palette","Art"]
- NO Collision pill — ["Layout","Objects","Collision","Palette","Art"]
- Layout dock is terrain-only: view / stamp-chunk / select, NO place-object — ["View","Select","Stamp Chunk"]
- Layout FG/BG appears exactly once each — {"FG":0,"BG":0}
- Layout canvas has real area — {"x":284,"y":106,"w":95,"h":321}
- Objects keeps the FG/BG plane control (L2) — {"FG":0,"BG":0}
- Palette has no empty rail either — {"w":44,"kids":1}
- precondition: undo stack empty
- 3 stamps leave Undo enabled
- UNDO: one Ctrl+Z steps exactly ONE (Layout) — 3 edits took 0 presses (a double binding would take 2)
- UNDO: Art re-points at the art document, not the map stack
- UNDO: returning to Layout restores the map history
- an aeon recent row is reachable from Home — ["Collapse explorer (Ctrl+B)","Parallax, raster bands, palette cycles and tile animations — your first ten minutes.","/home/volence/.cache/o50-sweep/work/capture-harness.aeon","/home/volence/.cache/o50-sweep/work/chunk-links-harness.aeon","/home/volence/.c

#### `guard-surface-harness.mjs` — 9/22

- [1c] ANTI-VACUOUS: every file-borne fixture was READ by the codec — no gesture authored any of these
- [2b] ROW 62: a document CARRYING sprite_mask renders the advisory — this returned (none) before this parcel
- [2c] ROW 62: the advisory names both values that ARE answers
- [2d] ROW 62: the DISABLED OPTION IS STILL THERE — the two cover different paths and this parcel removed neither
- [4b] ROW 64: the fourth guard-5 ensure now renders — the build refuses this exact document rc=1 and Aurora was silent
- [4c] ROW 64: it quotes the engine's own interpolated shifts and its sentinel
- [3b] ROW 63: `period` renders as a SELECT, not a number input — min/max on a number input are not a bound and a typed value ignores them
- [3c] ROW 63: it offers exactly the divisors of the schema's own table length (256), computed
- [3e] ROW 63: a NON-DIVISOR the file carries is still SHOWN as the select's value — a select missing its own value shows a different one, and the author would read a legal period while the build reads 100
- [3f] ROW 63: …and it is rendered DISABLED, so the author cannot pick it back
- [3g] ROW 63: the ADVISORY still fires on it — the picker governs what an author lands on, the advisory what a document carries
- [5a] POSTURE: the warned scene is still EDITABLE — no control was disabled by this parcel; the advisory advises and sigil stays the rulebook
- [5b] POSTURE: the model still HOLDS sprite_mask — the reader did not "fix up" the value it warns about

#### `handover/handover-band-harness.mjs` — 10 failing rows, no tally printed

- [0a] the live document carries NO bands — any band found later is THIS run's
- [2c] ZERO bands before any click
- [2d] the panel PRINTS Aurora's own blob arithmetic (the number aeon's injector is set against below)
- [3a] the form takes 8x4 from tile 2
- [3b] the Banks 1–7 selector offers copy/blank/shift and DEFAULTS to 'copy' [the default is the INERT one — this is why the run must change it]
- [3c] selecting 'shift' takes, and the panel's note promises motion
- [3d] the Driver select takes 'timer' — a timer band animates with the camera still
- [4a] PROMOTE is enabled
- [4b] the click created the band IN THE MODEL, at slot 0, with the form's geometry and driver
- [5a] Ctrl+S changed the bytes on disk [precondition for every row below]

#### `canvas-cdp-harness.mjs` — 9 failing rows, no tally printed

- [11c] it opens on the documented defaults (128x128, genesis-level-art)
- [11m] Escape then reopening gives a fresh form
- [13a-tab] the canvas TAB survives a restart
- [13a-focus] the tab that was focused at exit is focused again after the restart
- [13a-pixels] focusing the restored tab brings the pixels back exactly
- [13b-pane] clicking the tab of a canvas whose PNG is gone shows the "could not be loaded" pane
- [13c] Retry re-runs the real load — it reports the failure and stays on the pane
- [13d] restoring the file and pressing Retry recovers the document
- [14a] a canvas with an unreadable sidecar still OPENS, with the rejection recorded on its source

#### `effects-column-harness.mjs` — 6 failing rows, no tally printed

- [L2] no label is truncated or wrapped by its own column
- [A1] exactly the intended sections are open on arrival (clean panel state)
- [D1] the band list is present in the column and arrives CLOSED, enumerating nothing
- [L2b] no label anywhere in the column is truncated or wrapped
- [D1b] no band is enumerated twice with EVERY section open
- [D2] the four named approximations are one click away, in full, and not before

#### `screen-frame-guides-harness.mjs` — 27/33

- [3g] the frame's EDGE is grabbable while it is forced on, and dragging it moves the guides by exactly the same world delta
- [7c] [anti-vacuous] the tool bar offers the Add blank band chip and it was clicked
- [7d] ★ CATCHER ★ the new band's card is now IN THE DOM (the shut section opened) and the band is SELECTED
- [7e] the card is scrolled INTO its scroller's visible box
- [7f] exactly one toast names the band that was added
- [7h] the PANEL's chip follows the band too — both doors, one derivation

#### `tool-split-harness.mjs` — 5 failing rows, no tally printed  ⚠ RUN INCOMPLETE (killed at the 600s cap — the failure count is a lower bound)

- the chip row is the four tools the s1 manifest declares — ["View"]
- Stamp Chunk selects the stamp branch — drag to pan · right-click eyedrops · scroll to zoom
- Select selects the pick/move branch (was `object` unarmed) — drag to pan · right-click eyedrops · scroll to zoom
- arming an object from the library switches to place-object — drag to pan · right-click eyedrops · scroll to zoom
- Esc disarms to Select rather than leaving place-object empty — drag to pan · right-click eyedrops · scroll to zoom

#### `bganim-phase-shift-harness.mjs` — 4 failing rows, no tally printed

- [3a] the Banks 1–7 selector exists, offers copy/blank/shift, and DEFAULTS to 'copy'
- [3b] selecting 'shift' takes, and the panel's note now promises motion
- [4a] the form takes 2x1 from tile 0
- [5a] the click created the band IN THE MODEL, at slot 0, with the form's geometry

#### `bganim-strip-range-harness.mjs` — 37/40

- [5a] ANTI-VACUOUS: the panel's own Rows control really set rows=4 — the strip's column arithmetic divides by it
- [6c] the app's range equals this file's INDEPENDENT walk of the ruled arithmetic (clamp first, inclusive run, floor to whole columns, bounded by the blob)
- [8a] a drag entirely inside the animated prefix is REFUSED, the candidate is byte-identical, and the picker's line says why (with the full reasoning on the title)

#### `bganim-insert-roomy-harness.mjs` — 4/6

- [roomy.X] state aborted: no "New band" section on screen
- [live.X] state aborted: no "New band" section on screen

#### `paint-through-harness.mjs` — 2 failing rows, no tally printed

- [1] a ~6px drag on a chunk surface = exactly ONE undo entry
- [4] Link: the same setup, but the sibling chunk DOES change

#### `writer-originated-scene-harness.mjs` — 35/37

- [8b] the three scene deform attachments reached the DOCUMENT at the rule's values, and not one of them is the seed its toggle would have left
- [8f] every deform key reached the emitted FILE, and its generator periods divide the table length the control itself advertises

#### `bg-dangling-ref-harness.mjs` — 1 failing rows, no tally printed

- [M3] and NONE of their bodies is tracked

#### `bganim-motion-harness.mjs` — 1 failing rows, no tally printed

- [0d] the BG animation bands section is open (it arrives collapsed) [instrument]

#### `bganim-tile-door-harness.mjs` — 1 failing rows, no tally printed

- [4b] THE ROW — double-clicking strip slot 37 (a STATIC slot, past the animated prefix at 32) opens THAT SLOT in the Art facet's composer. Asserts WHICH target, not that something opened: kind "tile" and the index — the bank door that already worked produces kind "bank", and its document is the band'

#### `camera-preview-harness.mjs` — 25/26

- [6b] the composite SAYS it does not draw the curve ramps this scene carries — the boundary of the claim, on the canvas

#### `chunkgrid-hint-harness.mjs` — 19/20

- [7t] t: the selected-state hint is the two-clause sentence

#### `curve-editor-harness.mjs` — 28/29

- [7d] BLANKET: no selector or pixel probe came back empty all run

#### `effects-deform-harness.mjs` — 37/38

- [4b] the table sub-form RENDERS one spinner per schema parameter of the seeded form, plus a speed spinner

#### `numberfield-empty-harness.mjs` — 1 failing rows, no tally printed

- 0b ANTI-VACUOUS: found the v_center and v_offset boxes on screen

#### `s1-sonic-sprite-harness.mjs` — 5/6

- [3] frame 1 (MS_Stand) renders substantially; frame 0 (MS_Null) blank; NO anim entries (sonani stays unparsed)

#### `section-header-action-harness.mjs` — 1 failing rows, no tally printed

- [1a] the Layers section is on screen

#### `slot-range-onscreen-harness.mjs` — 3/4

- 2a ANTI-VACUOUS: the effects panel rendered a slot range at all

---

## UNRUNNABLE — 14 instruments, with the specific reason each

| file | category | reason |
|---|---|---|
| `_select-key-probe.mjs` | threw | `HARNESS ERROR: Error: Uncaught` from its own evaluated expression |
| `art-agent-harness.mjs` | no measurement | exit 1 with no tally, no PASS row and no FAIL row |
| `band-art-foreground-harness.mjs` | nothing measurable | completed, and its own tally is `0/0 PASSED, 2 NOT MEASURABLE` — it measured nothing |
| `bganim-band-harness.mjs` | threw | `Error: no "New band" section on screen` (also throws at `adefc7aa` — see finding 1) |
| `bganim-rate-shift-harness.mjs` | threw | `Error: no "New band" section on screen` |
| `bganim-ui-authored-composition-harness.mjs` | threw | `no "New band" section on screen` |
| `camera-harness.mjs` | hang | killed at the 600 s cap; no FAIL row and no tally before dying |
| `crash-harness.mjs` | hang | killed at the 600 s cap; no FAIL row and no tally before dying |
| `effects-strip-delta-probe.mjs` | no measurement | exit 1 with no tally, no PASS row and no FAIL row |
| `effects-subtabs-geometry-probe.mjs` | no measurement | exit 1 with no tally, no PASS row and no FAIL row |
| `palette-drag-harness.mjs` | threw | `aeon recent row unreachable` — navigates by the shared recent-projects list (finding 4) |
| `palette-grid-harness.mjs` | threw | `aeon recent row unreachable` — same cause |
| `restore-harness.mjs` | hang | killed at the 600 s cap; no FAIL row and no tally before dying |
| `skipped-cells-probe.mjs` | no measurement | exit 2 with no tally, no PASS row and no FAIL row |

Three further instruments hung **after** printing failures and are counted RED, not UNRUNNABLE,
with their runs marked incomplete and their failure counts flagged as lower bounds:
`capture-harness`, `shell-flip-harness`, `tool-split-harness`.

---

## NOT RUN — 12 instruments, one category

**needs emulator; tagged for the overseer's foreground pass.** Not attempted. Several spawn a
*private* `oracle-aether` on a `mkdtemp` socket and state they never touch the default socket
chain; that claim reads as plausible from the source and is **not** the reason they were
skipped. They were skipped because the invariant is absolute.

```
band-lens-harness      band-rate-shift-probe   band-step-proof        bo-probe
boot-override-harness  bus-probe               classic-playtest-harness
init-probe             live-palette-e2e-harness  palette-push-harness
s1-vplayer-spike-probe warp-tearing-harness
```

---

## GREEN — 47 instruments

The 35 that both ran and asserted something, with their own tallies:

`aeon-priority-lens` 24/24 · `animated-art` 20/20 · `assign-toggle` 4/4 ·
`bg-override-paints` 20/20 · `bg-tile-picker` 28/28 · `build-console-overlap` 21/21 *(see
finding 3)* · `chunk-links` 11/11 · `commit-cdp` 7/7 · `composer-fill` 7 rows ·
`constraints-cdp` 30 rows · `curve-vsplit-reachable` 30/30 · `explorer-canvases` 2/2 ·
`import-cdp` 4/4 · `mapviewport-baseline` 36/36 · `marquee-flip-button` 25/25 · `marquee` 34/34 ·
`marquee-stamp` 7/7 · `micro-type` 5/5 · `object-label` 23/23 · `paint-regression` 1/1 ·
`priority-lens` 9/9 · `s1-anim` 6/6 · `s1-boss-sprites` 6/6 · `s1-layout-anim` 22/22 ·
`s1-library-presentation` 6/6 · `s1-nonlevel-families` 9/9 · `s1-priority-occlusion` 30/30 ·
`s1-saveback-cdp` 6 rows · `s1-sonic-preview` 8/8 · `screen-frame` 12/12 · `section-column` 65/65 ·
`sprite-restore` 10/10 · `sweep-fix` 20 rows · `tier-zoom` 3/3 · `tool-keys` 8/8.

Plus the 12 in finding 6 that assert nothing.

---

## Disk

| | bytes available on `/` |
|---|---|
| before the sweep, 04:02:29Z | 577,031,475,200 |
| after cleanup, 04:54:31Z | 570,445,180,928 |
| delta | **−6,586,294,272** (−6.13 GiB) |

Of that delta I can account for **467,746,751 bytes** — this worktree's `node_modules/` (465 MB)
and `dist/` (5 MB), created deliberately so the harnesses could run in-tree and left in place so
the branch stays verifiable. **The remaining ~5.7 GB is not attributable to this sweep**: load
average sat between 6 and 14 throughout with other lanes active on this machine, and everything
this sweep created outside the worktree (the two ~50 MB fixture trees, all per-run copies, and
3.8 GB of harness-made `scratchpad/fixtures/`) was deleted. `git status` on this branch is clean
apart from the two report files.

---

## What was and was not established

- **Established.** Every one of the 89 non-emulator instruments was launched, once, against a
  build and fixtures made for it; 28 fail, 14 cannot complete, 47 pass and 12 of those check
  nothing.
- **Not established.** *Why* the Effects-panel cluster fails. The obvious culprit was tested and
  cleared (finding 1); the real cause is open, and this report deliberately does not guess.
- **Not established.** Whether any RED is a product defect or a stale harness expectation. That
  is a per-file question and this sweep is a census. Finding 2 is an infrastructure defect with
  the evidence attached, and findings 3, 4 and 5 are harness defects with the evidence attached;
  the 28 REDs are, for now, exactly what the label says — they ran and rows failed.
