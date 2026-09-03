# O50 triage — the ten BgAnim / effects instruments

**Branch** `test/o50-triage-bganim`, cut from master `62750403`.
**Started** 2026-09-03T08:13Z, uptime 8 days 20:02 · **verification sweep**
2026-09-03T09:15Z–09:2xZ, uptime 8 days 21:04–21:1x. Every harness's own banner
prints its UTC timestamp, uptime and 1/5/15-minute load; the windows are
tabulated in §H.

⚠ **A CORRECTION AGAINST MYSELF, UP FRONT.** The twelve commit messages on this
branch carry time ranges — "2026-09-03T10:4x–11:0xZ", "up 8d 22:3x" and
similar — that I **typed from expectation rather than read from the clock**.
They are wrong, by up to two hours, and always late. The real windows are in
§H, taken from the run banners. The measurements themselves are unaffected (the
tallies, hashes and rects are all quoted from run output), but a fabricated
timestamp is exactly the class of error this repo's bar 5 exists for, so it is
recorded here rather than quietly left in the log.
**Environment for every figure below**, unless a row says otherwise:

- **the app under test is THIS worktree's own build**, not a borrowed one:
  `VITE_AURORA_DEBUG=1 npx electron-vite build` in the worktree, and every run is
  launched with `AURORA_BUILT_TREE=<this worktree>` so `run-root.mjs` prints
  `pinned:` rather than `BORROWED`. (Without the pin it borrows the main
  checkout's `dist/`, whose revision this session cannot vouch for.)
- `ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron` —
  a worktree has no `node_modules/.bin/electron`.
- **a throwaway copy of aeon, re-materialised per run**, from an `rsync -a
  --exclude=.claude` of `/home/volence/sonic_hacks/aeon` at `73b07a4f`
  (re-synced mid-session — see `handover-band`, §10). `AEON_DIR` points at the
  copy; the live tree is never written to.
  ⚠ **The copy must live on the same filesystem as the repo.** Several of these
  harnesses materialise their fixture with `cp -al`, which cannot cross tmpfs to
  disk; a copy under `/tmp` fails with `Invalid cross-device link` before any row
  runs. Mine is under `/home/volence/.cache/o50bg/`.
- xvfb `1680x1050x24`, `devicePixelRatio` **1** on every run (the harnesses that
  print it, print 1).
- **No emulator. No `mcp__oracle__*` call was made.**

---

## The answer, up front

| # | file | verdict | my tally, before → after | one line |
|---|---|---|---|---|
| 1 | `slot-range-onscreen-harness.mjs` | **STALE HARNESS** | 3/4 → **5/5** | never clicked the Tile anim sub-tab; section renamed |
| 2 | `bganim-motion-harness.mjs` | **STALE HARNESS** (+1 instrument-aim fault) | 3 rows then abort → **27/27** | sub-tab + 3 renamed literals; then `[4c]` was sampling canvas chrome |
| 3 | `bg-dangling-ref-harness.mjs` | **STALE HARNESS** | 25/26 → **26/26** | `[M3]` asserted the ABSENCE of a fix aeon landed on 2026-08-30 |
| 4 | `bganim-strip-range-harness.mjs` | **STALE HARNESS** | 37/40 → **40/40** | one section rename took 3 rows; one refusal-wording rename took the third |
| 5 | `bganim-tile-door-harness.mjs` | **LIVE APP DEFECT** | 7 rows then abort → still red, now diagnosed | the strip moves out from under the double click. **See §A.** |
| 6 | `writer-originated-scene-harness.mjs` | **STALE HARNESS** | 35/37 → **37/37** | `period` became a `<select>`; a number-only scan stopped seeing it |
| 7 | `bganim-insert-roomy-harness.mjs` | **STALE HARNESS** | 4/6 → **38/38** | four renamed literals; it died before its first real row |
| 8 | `bganim-band-lens-harness.mjs` | **STALE HARNESS** | 29/43 → **43/44** (+1 NOT MEASURABLE) | one unclicked sub-tab took thirteen rows down |
| 9 | `bganim-phase-shift-harness.mjs` | **STALE HARNESS** | 6 rows then abort → **20/20** | the creation form is behind a sub-tab *and* a disclosure |
| 10 | `handover/handover-band-harness.mjs` | **PREMISE CONSUMED** + ENVIRONMENT | 9/10 fail → **28/28** at a pre-band pin | its own product shipped into aeon on 2026-08-26 |

**One live app defect, nine instrument problems.** Every one of my ten tallies
reproduced the sweep's exactly, on the first run, before any change.

### The single cause behind six of the ten

Two master-side changes landed on **2026-09-02** and neither reached these
`.mjs` files, because no `package.json` script names them:

1. **The Effects column became three sub-tabs.** `providers/effects-sub-tabs.ts`
   puts `aeon.bganim.bands` and `aeon.bganim.new` on the **`tileAnim`** tab; the
   facet arrives on **`parallax`**. ⚠ **A section on an inactive tab is not
   collapsed — it is NOT MOUNTED**, so every control below it is absent from the
   DOM rather than hidden.
2. **`023e0ed9` — "effects: `band` names ONE feature now — tile animation vs
   raster band".** Every user-visible string moved:

   | was | is | where |
   |---|---|---|
   | `BG animation bands` | `Tile animations (n/4)` | `BgAnimBandPanel.tsx:430` |
   | `New band` | `New tile animation` | `BgAnimBandPanel.tsx:635` |
   | `Band N` (card title) | `Tile animation N` | `BgAnimBandPanel.tsx:500` |
   | `Play bands` (chip) | `Play tile animations` | `BgAnimPreviewStrip.tsx:117` |
   | `Add band` (chip) | `Add` | `BgAnimBandPanel.tsx:859-866` |
   | `…already belong to bands` | `…already belong to tile animations` | `band-strip-range.ts:206` |
   | `…band MOVES with no further authoring` | `…tile animation MOVES…` | `bg-anim-aeon.ts:186` |
   | `adding a band puts its N tile(s)…` | `adding a tile animation puts…` | `bg-anim-aeon.ts:559` |

   The `Add band` → `Add` row is worth reading in the source: the panel's own
   comment says `Add band` is the exact string EFFECTS-W1 defect 2 was booked
   against, because a cold reader's first click built a *tile animation* while
   reading it as a *raster band*.

**The shape of the failure is what makes this worth recording.** In every case
the red row said *the control is missing* — `no-section`, `no-element`,
`no-card`, `null`, `NO BAND CARD ON SCREEN` — which reads exactly like a deleted
feature and is one word out of date. Six files, thirty-odd rows, one afternoon's
rename.

Every repaired file now carries a row that asserts the sub-tab **off the store**
(`window.__dbg.parallaxPreview().subTab === 'tileAnim'`) *before* anything is
looked for, so the next tab move fails by name instead of as N unrelated-looking
rows.

---

## A. LIVE APP DEFECTS

### A1 — Double-clicking a background tile in the Art strip never opens its composer, and leaves the BAND STAMP armed instead

**Instrument** `scratchpad/bganim-tile-door-harness.mjs`, rows `[4b]` (the row
itself), `[4b1]`, `[4b2]`.
**Severity** the feature ROADMAP row 57 shipped is unreachable from a human
gesture. `openBgTileDocument` is fully unit-tested and, again, unreachable — the
exact condition that harness's own header was written about.

**What happens**, all from one run (`devicePixelRatio` 1, xvfb 1680x1050):

```
                       strip canvas top   tool          under the aim (1187,443)
  before the gesture   381                view          CANVAS#art-browser-canvas
  BETWEEN the halves   525.5625           paint-tile    CANVAS in DIV#art-browser-bands
  after  the gesture   381                stamp-band    CANVAS#art-browser-canvas
  window.__dbg.aeon.stripOpen().gestures  0 throughout
  inter-click gap      47ms  (SHORTER than the plain gesture's ~100ms)
```

**The mechanism.** The first press/release of any double click is an ordinary
click. `handleClick` picks the tile and arms `paint-tile` — and
`src/renderer/workspace/facets/layout-facet.tsx:61-65` renders the **"Brush"**
`CollapsibleSection` (`TileBrushOptions`) for exactly that tool, **immediately
above** the `aeon.art` section the strip lives in. The strip is pushed down
**144.56px — its own height**. The second half of the same double click lands on
what slid into its place, the band row, hits a `BandCard`, and arms
`stamp-band`; that un-renders the Brush section and puts the strip back. The
`dblclick` event never reaches the strip's container at all.

**Two things that make it hard to see, and both cost me a cycle:**

- **The displacement is a TRANSIENT.** A before/after reading of the strip box
  says *it did not move* — I measured that twice and wrote it up once before
  catching it. Only a sample taken BETWEEN the two halves shows the 144.56px.
- **A diagnostic click contaminates its own row.** My first `[4b1]`/`[4b2]` ran
  an extra ordinary click to prove the aim was live. Both came back GREEN with
  the click aimed **300px off the strip**, because `[4b]`'s own first half had
  already picked the slot and armed the tool. The rows read the previous
  gesture's leavings. They now read state `[4b]`'s own gesture produced and
  perform no extra click.

**Reproduction, no harness needed.** Open an aeon project → Layout facet → the
**Art** section → BG layer → double-click any static tile in the strip (past the
animated prefix; on OJZ act 1 that is slot 32 or later). Nothing opens, the
strip jumps down as you click, and the tool ends on the band stamp.

**Reproduction with the instrument:**

```
AURORA_BUILT_TREE=<a VITE_AURORA_DEBUG=1 tree> \
ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
AEON_DIR=<a throwaway copy of aeon, on the same filesystem as the repo> \
node scratchpad/bganim-tile-door-harness.mjs
```

Read `[4b2]`'s detail block: it prints the strip box and the panel census at all
three instants plus the inter-click gap.

**NOT FIXED HERE**, per the parcel's rules. The repair is a design call — the
Brush section could be reserved, or placed below the Art section, or the strip's
open gesture could be moved off `dblclick` — and it belongs in its own review.

---

## B. Per file

### 1. `scratchpad/slot-range-onscreen-harness.mjs` — STALE HARNESS

**Sweep** RED, 3/4, `FAIL 2a ANTI-VACUOUS: the effects panel rendered a slot range at all`.
**Mine** identical: 3/4, `2a` red at `0 strings`, and the harness's own
`expanded:` line printed `"NO_HEADER"`.

It clicked `Effects` and then hunted a section titled `BG animation bands`. The
section is `Tile animations (n/4)` and lives on the `tileAnim` sub-tab, so the
panel under measurement was the **Parallax** job. Rows `3a` and `3b` — the two
rows the file exists for — were passing on an empty page; `2a` is the row that
exists to catch exactly that, and it did.

**Changed** the sub-tab click, the section literal, and a new row `[1b]`
asserting the store's `effectsSubTab`.
**After** 5/5, and `3a`/`3b` now judge a real string:
`slots 0..31 · 32 tiles · 64px pattern · 128B/col · 8 banks`.

### 2. `scratchpad/bganim-motion-harness.mjs` — STALE HARNESS, plus one instrument-aim fault

**Sweep** RED, exit 2, `FAIL [0d] the BG animation bands section is open`.
**Mine** identical — 3 rows, then `HARNESS ERROR: no "BG animation bands" section on screen`.

Three literals plus the sub-tab (table in §0). The subtle one is the card title:
row `1c` climbs from a span reading `Band 0` to find the card, so it reported
`NO BAND CARD ON SCREEN` rather than a mismatch.

**Then row `[4c]` was still red** — *"panning a whole pattern period (256px)
returns the SAME phase"*, `h(0)=1212731953 h(256)=2330941074`. It is **not** a
phase failure, and this is a bar-2d(iii) instance: the row was measuring the
wrong quantity. The sample window sat 2 cells clear of the largest pan, so at
pan 256 its leftmost cell landed at canvas x=16 — **under the effects
layer-guide LABEL PLATE**, `ctx.fillRect(4, boxY, w + 8, 13)` at
`canvas/effects-guides.ts:386`, which is pinned in SCREEN space. The sample read
chrome at one pan and background at the other.

Proven rather than argued: new row `[4y]` samples cells **no band owns** —
static art, no driver, no bank, identical at every pan by construction — at the
same two pans. At the 2-cell margin it is RED (`hash=2897176297` vs
`2442838034`, `cellsRead 24/24` both), which no band phase can explain. At an
8-cell margin `4y` and `4c` are both green.

**Changed** sub-tab + 3 literals; margin `+2` → `+8` behind a named constant
with the reason; new rows `[0c2]` (sub-tab), `[4y]` (static control), `[4z]`
(every pan read the same cell population — `sampleCells` SKIPS an off-canvas
cell, so two hashes could otherwise differ over *how many* cells were read).
Every pan row now prints `hash + cellsRead + nonzero`.
**After** 27/27.

### 3. `scratchpad/bg-dangling-ref-harness.mjs` — STALE HARNESS

**Sweep** RED, 25 passed, `FAIL [M3] and NONE of their bodies is tracked`.
**Mine** identical: 25 PASS / 1 FAIL, `tracked ojz_bg_*.bin files: 34`.

`M3` was a **census of the hazard**, taken 2026-08-30: aeon's tracked
`ojz_bglib.json` named 17 backgrounds whose 34 bodies were all swallowed by
`.gitignore`'s blanket `*.bin`, so a clean clone resolved none of them. **Aeon
closed exactly that, the same day**, at `838f3129` ("fix: track the background
the project actually names") and `befbae65` ("protect: 17 authored backgrounds
existed on one disk with no history"). All 34 are tracked today. The row had
been red ever since, for the best possible reason.

The app half never depended on the census — the harness MANUFACTURES the
bodyless state by unlinking from a hardlinked copy — and all 25 of those rows
were green on both runs.

**Changed** `M3` retired (with the old assertion and the two aeon SHAs recorded
above it) and re-pointed at the precondition the run does still need: the bodies
must be PRESENT, so the unlink manufactures a real absence rather than restating
one.
**After** 26/26.

### 4. `scratchpad/bganim-strip-range-harness.mjs` — STALE HARNESS

**Sweep** RED, 37/40, failing `[5a]`, `[6c]`, `[8a]`. **Mine** identical.

This file had **already** been taught the sub-tab (it calls `SUBTAB('tileAnim')`)
and had not been taught the rename that came with it. `SECTION_STATE('/^New
band/')` left the disclosure shut, so the Rows `<select>` was never in the DOM
(`setRows=no-element`) and the candidate kept `rows=1`. `[6c]` and `[8a]` divide
by rows and are **consequences of that one line**, not separate findings: at
rows=1 the app answered `base=34 cols=11` where this file's independent walk at
rows=4 says `base=34 cols=2`.

`[8a]`'s own matcher was the second literal: `/already belong to bands/` against
a provider that says `already belong to tile animations`
(`providers/band-strip-range.ts:206`, pinned in node at
`band-strip-range.test.ts:227` and `:488`).

**Changed** both literals; `[5a]` now prints what `SECTION_STATE` returned, so
"the section would not open" and "the control is not there" stop looking alike.
**After** 40/40.

### 5. `scratchpad/bganim-tile-door-harness.mjs` — LIVE APP DEFECT

See **§A1**. The harness is right; the app is broken.
**Changed** diagnosis only — `[4b]` is untouched and still measured on a cold
panel. Added `[4b1]` (the gesture did reach the strip) and `[4b2]` (the strip
must not move part-way through the double click, read BETWEEN the halves);
removed a row I had added whose premise ("a settled column") is false and which
would have PINNED the defect by passing on `gestures === 0` — it is a printed
characterisation line now, not a gate.

### 6. `scratchpad/writer-originated-scene-harness.mjs` — STALE HARNESS

**Sweep** RED, 35/37, failing `[8b]` and `[8f]`. **Mine** identical.

**ROADMAP row 63 turned `period` from a `NumberField` into a `<Select>`** of the
legal divisors — *"a picker where the engine admits a SET, a spinner where it
admits a RANGE"* (`EffectsScenePanel.tsx:289-315`), because a period must DIVIDE
the table length and the spinner had been advertising 247 values the build
refuses. `driveTable` scanned `input[type=number]` only, so after row 63 the
control was **neither driven nor counted, silently**:

```
number-input titles starting "deform_fg ":
  ["deform_fg amplitude (1..127)", "deform_fg speed — how fast ..."]
params driven: {"amplitude":16,"speed":16}          <- no period
document:      {"generator":"sine","amplitude":16,"period":256}
```

256 is the **seed** (`seedTableRefParam` seeds `period` with its own max, one
whole cycle over the table). The document held the untouched seed while the
harness believed it had authored the value — the exact failure this file's own
`8b` comment says it exists to prevent, arriving through a door it did not have.

Two stale expectations fell out of the same move: `8b` typed `256` for the seed
period and `1` for the seed amplitude (both are now read off the live controls,
and a `null` seed fails the row loudly); `8f` re-read the period bounds AFTER
the save, when the sub-form is unmounted, got `{found:false}` →
`Number(undefined)` → `NaN`, and `NaN > 0` failed the row over a control that
had gone off screen.

**Changed** `driveTable` drives every non-number table control, keeping the
pre-drive value as the seed and picking the LAST ENABLED option that differs
from it; a picker with nothing else to offer prints that it was NOT driven
rather than counting a gesture it did not make. Keys are filtered to snake_case
identifiers so the attachment's own on/off toggle (titled `deform_fg — …`) is
not collected as a parameter named `—` (measured: 78 gestures issued vs 81
prescribed, before that filter). The table length now comes off the picker's own
title, `must divide the 256-byte table`, captured while it is mounted.
**After** 37/37; period seed 256 → driven 128, `seedEscape true`.

### 7. `scratchpad/bganim-insert-roomy-harness.mjs` — STALE HARNESS

**Sweep** RED, 4/6, both states aborting at `.X` with `no "New band" section on screen`.
**Mine** identical. It reached none of the rows it exists for.

Four literals plus the sub-tab (§0), the fourth being `Add band` → `Add`, plus
the refusal matcher `adding a band puts…` → `adding a tile animation puts…`
(`providers/bg-anim-aeon.ts:559`).

Because the new label is a bare `Add`, `CONTROL_BY_TEXT` now returns the **match
count** and `[4c]` requires it to be 1 — bar 2c. Proven by widening the matcher
to `/^(Add|Promote)$/`: the row goes red reading `{"text":"Promote","disabled":false,…,"matches":2}`,
i.e. it would have judged the wrong enabled button.

**After** 38/38 — the insert lands and saves on the roomy document, and is
refused with the provider's own sentence on the saturated one.

### 8. `scratchpad/bganim-band-lens-harness.mjs` — STALE HARNESS

**Sweep** RED, 29/43, thirteen rows.
**Mine** identical — the same thirteen names.

Twelve of thirteen are the unclicked sub-tab: both `SECTION_STATE` calls
answered `no-section`, taking `[3b]`'s collapsed-section claim, `[7z]`'s open,
and everything downstream of the panel's controls with them. The thirteenth is
its own literal — `[7f]` climbs from a text node reading `Band 0` to find the
band card, and the Field label is `Tile animation 0`, so the climb returned
`no-card`. It survived the first repair (42/44, only `[7f]` left) and needed its
own fix.

**After** 43/44, plus `[6a]` **NOT MEASURABLE** on this document — which the
harness already reported as not-a-pass before this parcel and still does: none
of these 4096 layout words is blank or out-of-blob, so there is no
seeds-nothing cell to click. That is not a pass and is not counted as one.

### 9. `scratchpad/bganim-phase-shift-harness.mjs` — STALE HARNESS

**Sweep** RED, exit 2, failing `[3a] [3b] [4a] [5a]`, then `HARNESS ERROR: no band in the model`.
**Mine** identical.

The rows read as *"the phase-fill selector is GONE"* and *"the form does not take
its geometry"*. Neither was true: the file went straight from the Effects pill to
`SELECT_BY_TITLE('/phase fill —/')`, and the creation form is behind **both** the
`tileAnim` sub-tab and the `New tile animation` disclosure, which arrives
collapsed. One more literal underneath: `[3b]` required the note to say `band
MOVES with no further authoring`; the provider writes `tile animation MOVES…`
(`bg-anim-aeon.ts:186-187`).

**After** 20/20 — the promotion lands, Ctrl+S writes, and the saved file's eight
banks are bank 0 rolled k px by this file's own independent roll.

### 10. `scratchpad/handover/handover-band-harness.mjs` — PREMISE CONSUMED (+ ENVIRONMENT)

**Sweep** RED, exit 2, ten rows (`[0a] [2c] [2d] [3a] [3b] [3c] [3d] [4a] [4b] [5a]`).
**Mine** identical ten — but **only after fixing an environment fault the sweep
did not hit**, because its fixture was a fresh clone and mine was a copy taken
three hours earlier.

**(a) ENVIRONMENT / INSTRUMENT FAULT — the pin and the archive disagree.** The
file resolves its revision with `git ls-remote origin refs/heads/master` every
run (deliberately) and then archives it **out of the local object store**.
Nothing checked those agree. The aeon lane pushed during my session, `ls-remote`
answered `3988f479`, my copy had never fetched it, and the run died as

```
HARNESS ERROR: Command failed: git -C <aeon> archive 3988f479c9c5...
```

which names neither the cause nor the fix. There is now a `cat-file -e` gate
that refuses with both remedies. Any operator whose aeon checkout is behind the
remote hits this, not just a copy.

**(b) STALE HARNESS** — the same sub-tab + `New tile animation` + `band MOVES`
literals as §9.

**(c) THE PREMISE IS CONSUMED, and this is the part for the controller.**
`[0a] the live document carries NO bands` and `[2c] ZERO bands before any click`
are false at the pushed master, because **the band this file exists to author has
shipped**: aeon `ba83358f`, 2026-08-26, *"content(ojz): the first authored
animated background band on the real level"* — which is this file's own opening
sentence. It has been red for that reason since 2026-08-26. At master the run now
reaches `[4b]` and the click **succeeds**, authoring a SECOND band at index 1,
`slotBase 32`, beside the shipped one at index 0; the row fails on *"at slot 0"*,
which is the consumed assumption, not the app.

**The decisive measurement**, one run each, same build, same tree:

| pin | result |
|---|---|
| `AEON_SHA=e192062e` (the commit **before** `ba83358f`) | **28/28**, exit 0 |
| resolved from `origin/master` (`3988f479`) | 15 PASS / 3 FAIL, aborts at `[4b]` — was 9 PASS / 10 FAIL before this parcel |

**FOR THE CONTROLLER.** This is a **one-shot authoring instrument** — its own
header says the regression twin is `bganim-phase-shift-harness`, "left untouched
as the regression it is" — and its job is done. Either **retire it**, or pin it
to a pre-band revision as a regression. I have not chosen: deleting a file whose
product shipped is a call for the owner, not for a test parcel.

---

## C. Peer-tree policy (hub ruling 2026-09-03T05:58:23Z, card d-28)

**None of the ten writes into aeon's live tree**, so under d-28 all ten are
read-only sites: recorded here, left alone. Checked file by file rather than
assumed, because three of them press Ctrl+S:

| file | how it reaches aeon | writes? |
|---|---|---|
| `bg-dangling-ref` | `cp -al` of `AEON_DIR`, then **unlinks** (never truncates) the copied bodies | no |
| `bganim-tile-door` | `cp -al` of `AEON_DIR`, and breaks the hardlink on the one file it could touch | no |
| `bganim-band-lens`, `slot-range-onscreen`, `bganim-motion` | open `AEON_DIR` (or an in-repo fixture built from it); no save | no |
| `bganim-strip-range` | opens `AEON_DIR`; row `[11a]` hashes the override back to what it was | no |
| `bganim-insert-roomy`, `bganim-phase-shift`, `handover-band` | **Ctrl+S**, but into a `mkdtemp` + `git archive` checkout | no — hermetic |
| `writer-originated-scene` | already refuses without `AEON_DIR` (`checkoutOverride`, the O53/O54 shape) | into the copy only |

So there is no third instance of the `-o53-`/`-o54-` live-tree write to fix.

---

## D. What each assertion I added or changed was proven with

Every one was applied to disk, quoted back from `git diff`, run, and shown red
before the fix, then restored with `git checkout HEAD -- <path>` from a
**committed** baseline.

| row | file | the mutation | red evidence |
|---|---|---|---|
| `[1b]` | slot-range | `sub-tab="tileAnim"` → `"parallax"` (line 143) | `store says "parallax"`, 3/5 |
| `[0c2]` | motion | `"tileAnim"` → `"colour"` | `store subTab="colour"`, then `[0d] no-section`, exit 2 |
| `[4y]` | motion | `CLEAR_OF_CANVAS_CHROME_CELLS = 8` → `2` | `static at 0: 2897176297; at 256: 2442838034`, 25/27 |
| `[4z]` | motion | `camCells` min column → `0` | `d(256,0) … cellsRead=6/24`, 24/27 |
| `[M3]` | bg-dangling | body glob → a prefix that matches nothing | `0 …_bg_*.bin on disk for 17 entries` |
| `[5a]` | strip-range | `New tile animation` → `New band` | `SECTION_STATE(...)="no-section" setRows=no-element`, 38/40 |
| `[8a]` | strip-range | matcher → `/already belong to bands/` | 39/40 |
| `[4b1]` | tile-door | the whole gesture aimed 300px above the strip | `selectedTile.bg 0 -> 0 (aimed 37)` |
| `[4b2]` | tile-door | *(fires on master as shipped — it is red because the app is)* | see §A1 |
| `[8b]`,`[8f]` | writer | picker key list → `filter(k => false)` (the pre-row-63 blindness) | 35/37, the sweep's own two rows |
| `[4c]` uniqueness | insert-roomy | `ADD_INSERT` → `/^(Add\|Promote)$/` | `{"text":"Promote",…,"matches":2}` |
| `[2a2]` | band-lens | `"tileAnim"` → `"colour"` | `store subTab="colour"`, 29/44 — the sweep's own figure |
| `[1c]`,`[1d]` | phase-shift | `"tileAnim"` → `"colour"` | `subTab="colour"`; `OPEN_NEW_BAND -> "no-section"` |
| `[1c]`,`[1d]` | handover | `"tileAnim"` → `"colour"` | `subTab="colour"`; both sections `"no-section"` |
| the `cat-file -e` gate | handover | `AEON_SHA=` a SHA the tree lacks | refusal at line 92 naming fetch **and** `AEON_SHA`, exit 1 |

**One correction I have to record against myself**, because it is the sharpest
thing in the parcel and it was my own error. My first `[4b1]`/`[4b2]` for
tile-door were committed at `d32fafba` and were **vacuous**. The plant that
found it — aiming the diagnostic click 300px off the strip — came back GREEN on
both, because `[4b]`'s own double click had already picked the slot and armed
the tool, so both rows were reading the previous gesture's leavings. Bar
2d(iii), inside my own repair, in the same file the bar's remedy is quoted in.
`0062a554` re-cuts them to read only what `[4b]`'s gesture produced, and it is
that re-cut version whose evidence appears in §A1.

---

## E. Other things found on the way

- **`cp -al` cannot cross tmpfs to disk.** `bg-dangling-ref` and
  `bganim-tile-door` materialise their fixtures inside the repo with `cp -al
  $AEON_DIR …`. An `AEON_DIR` under `/tmp` (the natural place to put a throwaway
  copy) dies with pages of `Invalid cross-device link` before any row runs. Not a
  regression, but it will bite the next operator; recorded here rather than
  worked around silently.
- **Four pieces of harness OUTPUT were not ignored** and showed up in `git
  status` after my runs. Added to `.gitignore` at `92873f6a`, matching the
  policy block the file already states:
  `scratchpad/fixtures/aeon-bg-dangling/`, `scratchpad/fixtures/aeon-tile-door/`,
  `scratchpad/handover/emit/` (`scratchpad/*-emit/` does not reach a
  subdirectory), `scratchpad/writer-originated-emitted.json`.
- **⚠ NOT FIXED: `scratchpad/handover/shots/*.png` are TRACKED**, and
  `handover-band-harness` rewrites them on every run, so any run of it dirties
  the working tree. `scratchpad/shots*/` does not reach a subdirectory either.
  Untracking files somebody committed on purpose is the controller's call.

---

## F. What is left open

1. **A1, the tile-door defect.** Reported, not fixed, per the parcel's rules. The
   repair is a design call (reserve the Brush section's space, move it below the
   Art section, or take the strip's open gesture off `dblclick`) and wants its
   own review.
2. **`handover-band-harness`'s disposition** — retire, or pin to a pre-band
   revision. §10.
3. **`band-lens` `[6a]`** stays NOT MEASURABLE on this document: no blank or
   out-of-blob cell exists in its 4096 layout words. Pre-existing, disclosed by
   the harness itself, not introduced here.
4. **The other eighteen RED instruments** of the sweep's 28 are other parcels'.
   If the sub-tab/vocabulary cause in §0 is the dominant one there too — and the
   shape of the sweep's failing row names suggests it is — that is worth telling
   whoever holds them before they start.
5. **Nothing here was run under an emulator**, and one thing would benefit from
   it eventually: A1's repair should be re-measured on the owner's display, since
   the 144.56px is a layout number and the panel is resizable.

---

## H. The verification sweep, and the real clock

Every "after" figure in this document comes from **the committed tree**, re-run
once each after the last write, not from the run that happened to be open when
the fix was made. Each row is one run; each banner is the harness's own.

| file | banner (UTC, uptime, load) | result |
|---|---|---|
| `slot-range-onscreen` | 09:15:04Z · up 8d 21:04 · 4.97 | **5/5**, exit 0 |
| `bganim-strip-range` | 09:15:04Z · up 8d 21:04 · 4.97 | **40/40**, exit 0 |
| `bganim-motion` | 09:15:23Z · up 8d 21:04 · 4.76 | **27/27**, exit 0 |
| `bganim-band-lens` | 09:15:34Z · up 8d 21:04 · 5.08 | **43/44** + 1 NOT MEASURABLE, exit 0 |
| `bg-dangling-ref` | 09:16:10Z · up 8d 21:05 · 14.92 | **26/26**, exit 0 |
| `bganim-phase-shift` | 09:16:21Z · up 8d 21:05 · 13.62 | **20/20**, exit 0 |
| `writer-originated-scene` | 09:17:55Z · up 8d 21:07 · 13.76 | **37/37**, exit 0 |
| `bganim-tile-door` | 09:18:43Z · up 8d 21:07 · 9.44 | 8 PASS, **`[4b]` and `[4b2]` RED**, exit 2 — §A1 |
| `handover-band` (`AEON_SHA=e192062e`) | 09:19:00Z · up 8d 21:08 · 8.20 | **28/28**, exit 0 |
| `bganim-insert-roomy` | 09:21:16Z · up 8d 21:10 · 24.30 | **38/38**, exit 0 |

**Two runs of `bganim-insert-roomy` are reported honestly rather than hidden.**
At 09:19:27Z (load 7.15) and once before it, the run scored **25/26** with
`FAIL [live.X] state aborted: CDP target never appeared` — its second state's
Electron never came up. That is not the app and not the harness: the box's swap
was **100% exhausted** (`0 of 24575 MiB`) and `earlyoom` is configured with
`--prefer …electron.*…`, so an Electron under memory pressure is a preferred
kill. The 09:21:16Z run — at a *higher* load, 24.30 — is the 38/38 quoted
above. I am naming both rather than quoting only the green one, because "ran
twice, both times fine" is a claim this environment does not support (bar: a
harness that passes twice has proven nothing about stability when the
environment itself varies).

**The measurement windows for the diagnostic work**, from the run banners, since
the commit messages get them wrong (see the ⚠ at the top):

| file | first run → last | uptime span |
|---|---|---|
| `slot-range-onscreen` | 08:14:45Z → 09:15:04Z | 8d 20:03 → 21:04 |
| `bganim-motion` | 08:21:39Z → 09:15:23Z | 8d 20:10 → 21:04 |
| `bg-dangling-ref` | 08:32:33Z → 09:16:10Z | 8d 20:21 → 21:05 |
| `bganim-strip-range` | 08:32:35Z → 09:15:04Z | 8d 20:21 → 21:04 |
| `bganim-tile-door` | 08:38:33Z → 09:18:43Z | 8d 20:27 → 21:07 |
| `writer-originated-scene` | 08:38:34Z → 09:17:55Z | 8d 20:27 → 21:07 |
| `bganim-band-lens` | 08:57:55Z → 09:15:34Z | 8d 20:46 → 21:04 |
| `bganim-insert-roomy` | 08:57:56Z → 09:21:16Z | 8d 20:47 → 21:10 |
| `bganim-phase-shift` | 09:06:48Z → 09:16:21Z | 8d 20:55 → 21:05 |
| `handover-band` | 09:06:48Z → 09:19:00Z | 8d 20:55 → 21:08 |

`devicePixelRatio` was **1** on every run that printed it — no fractional-rect
condition was exercised, so this parcel says nothing about the dpr-1.35 case.

---

## G. Commits

Branch `test/o50-triage-bganim`, twelve commits, emitted by `git log --oneline
master..HEAD` (oldest last):

```
92873f6a o50 triage: ignore four more pieces of harness OUTPUT that a tracked instrument rebuilds
8889b263 o50 triage: handover-band-harness — its PREMISE was consumed by its own product, plus two instrument faults
9a90ca58 o50 triage: bganim-phase-shift-harness — the creation form is behind a sub-tab and a disclosure
a291e941 o50 triage: bganim-band-lens-harness — one unclicked sub-tab took thirteen rows down
0b2d7f4a o50 triage: bganim-insert-roomy-harness — four stale literals; it died before its first real row
64773123 o50 triage: writer-originated-scene-harness could not see the `period` control any more
0062a554 o50 triage: tile-door — the displacement is a TRANSIENT, and the end state hides it
d32fafba o50 triage: bganim-tile-door-harness is RIGHT — LIVE APP DEFECT: the strip moves out from under a double click
ab0615b5 o50 triage: bganim-strip-range-harness — two stale literals, three red rows, no app defect
7bb4edea o50 triage: bg-dangling-ref-harness — row M3 was asserting the ABSENCE of a fix aeon has since landed
894185f7 o50 triage: bganim-motion-harness — STALE on the sub-tab and vocabulary; row 4c was aimed at chrome
af6cda6a o50 triage: slot-range-onscreen-harness was STALE on both the sub-tab and the name
```

(plus this file.)

`git diff --stat 62750403..HEAD` — the branch's own cut point — is exactly the
ten instruments, `.gitignore`, and this review; nothing else:

```
 .gitignore                                     |  15 +
 docs/reviews/2026-09-03-o50-triage-bganim.md   | 579 +
 scratchpad/bg-dangling-ref-harness.mjs         |  41 +-
 scratchpad/bganim-band-lens-harness.mjs        |  40 +-
 scratchpad/bganim-insert-roomy-harness.mjs     |  70 +-
 scratchpad/bganim-motion-harness.mjs           | 133 +-
 scratchpad/bganim-phase-shift-harness.mjs      |  53 +-
 scratchpad/bganim-strip-range-harness.mjs      |  20 +-
 scratchpad/bganim-tile-door-harness.mjs        | 116 +-
 scratchpad/handover/handover-band-harness.mjs  |  77 +-
 scratchpad/slot-range-onscreen-harness.mjs     |  26 +-
 scratchpad/writer-originated-scene-harness.mjs | 122 +-
 12 files changed, 1235 insertions(+), 57 deletions(-)
```

---

## I. A sibling parcel reached the same shape, independently

While this ran, master moved from `62750403` to `851eb25c`, and part of what
landed is **another slice of the same sweep** — `ce23e3bf` "merge: O50 triage of
the effects/editor cluster — nine stale instruments and one real defect", with
its own review at `docs/reviews/2026-09-03-o50-triage-*` and a lane-log entry
reading *"nine stale rigs, one real wrapping defect"*.

**The file sets are disjoint** — theirs is `effects-column`, `effects-scene`,
`screen-frame-guides`, `effects-deform`, `layer-bound`, `curve-editor`,
`numberfield-empty`, `section-header-action`; none of those is one of my ten —
so this is two independent samples of the same population arriving at the same
ratio: **nine instruments out of date, one real defect, per ten.** Their
`070f7e4e` names the sharpest version of it — *"the row went red because the app
got better"* — which is exactly `bg-dangling`'s `[M3]` here.

That is worth carrying to whoever holds the remaining RED instruments: the prior
for a red row in this population is **an out-of-date instrument, not a bug**,
and the two commonest reasons are a moved control and a landed fix. It is also
the argument for registration: none of these files is nameable by a
`package.json` script, which is why a rename made on 2026-09-02 was still
undiscovered on 2026-09-03.
