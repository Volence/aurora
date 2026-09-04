# VDEFORM-CROSS-FEATURE — the key is typed in one panel and the damage lands in three others

**Date** 2026-09-04 · **Branch** `parcel/vdeform-cross-feature` · **Base** master `fd41a0ce`
**Upstream** `docs/reviews/2026-09-03-ew-ramp-scroll-mode.md` (the reading end; this is the sweep it asked for)
**Peer measured at** aeon `origin/master` `e81fd349`, through git objects (`test/support/peer-repo.ts`'s rule — never a sibling working tree)

---

## 0. What is mine, what is relayed, and where the brief's numbers landed

| Claim | Source | Status |
|---|---|---|
| the `v_deform` → `$0B` bit 2 chain | the 09-03 packet, at aeon `ddaab282` | **inherited, not re-measured** — nothing here depends on re-reading it |
| aeon's `scene()` carries **TWO** vsplit ensures, the second on `v_deform` | aeon `scene_dsl.emp` @ `e81fd349` | **MEASURED HERE**, quoted below |
| per-column mode writes `BG word = base + offset` per column | aeon `parallax.emp` @ `e81fd349` | **MEASURED HERE** — this is what clears `v_factor`/`v_offset`/bob |
| whole-plane `Vscroll_Write` emits ONE longword; per-column emits TWENTY | aeon `parallax.emp` @ `e81fd349` | **MEASURED HERE** |
| ~131 `v_deform` refs across ~15 files | the brief | ⚠ **121 across 15**, at `fd41a0ce`. Counted, not disputed for its own sake — the file list is identical, so the brief's shape was right and only its total was off. |
| `v_deform` "is the wrong surface for reels" | the brief | **TRUE AND ALREADY VACUOUS HERE** — §4 |

**Nothing in this parcel touched an emulator.** Nothing here has seen a ROM do
any of it; every engine fact is source, read at a revision, and labelled.

---

## 1. The census, and how it was built

Grepping `v_deform` finds the sites that NAME it. The sites that matter are the
ones it moves without naming — so the enumeration went the other way: **what does
per-column VSRAM mode actually change**, out of aeon's own source, and then which
Aurora surface touches each of those things.

Per-column mode changes exactly **three** things, and that list is closed by the
hardware's own structure rather than by a search:

| # | What changes | Aurora surfaces that touch it | Verdict |
|---|---|---|---|
| 1 | **VSRAM entry 1 stops being the plane** and becomes column 0's Plane B | a layer `vsplit`; a preset `ramp` | **2 — silently affected**, four surfaces, §2 and §3 |
| 2 | The **leading partial column** renders at `VSRAM[$4C] & VSRAM[$4E]` | `left_column_mask` | **1 — already discloses**, §5 |
| 3 | The **whole-plane base scroll** it is added to | `v_factor`, `v_offset`, `v_center`, `bob_*`, `bg-wrap`'s vertical reach | **3 — not affected**, and measured, §5 |

Everything the sweep returned falls into one of those three rows. The
enumeration was cross-checked by a second, independent search over the whole of
`src/` for *behaviour* words — vertical / vscroll / whole-plane / plane B / full
width / column / VSRAM / scroll offset — rather than key names; it returned no
site outside these three, and it is what established §4's negative result.

### What #1 reaches, and why the two halves behave completely differently

Both a `vsplit` and a `ramp` write VSRAM entry 1 mid-frame. **aeon can refuse one
and cannot see the other**, and that single asymmetry is the whole parcel:

- a **`vsplit`** is a key on the same `Scene` the `v_deform` is on, so `scene()`
  refuses the pair at comptime. The document **does not build**.
- a **`ramp`** is a key in `presets/<id>.json`, joined to the scene only through
  a section's sidecar. **No comptime check can reach it.** The document builds
  green, runs, and is silently a 16-pixel sliver.

So the two halves need opposite treatments: the vsplit half needs the refusal
said where the author can act on it, and the ramp half needs a sentence *because
no build will ever produce one*.

---

## 2. The refusal Aurora had one surface for, and its twin had three

Measured at aeon `e81fd349`, `engine/level/scene_dsl.emp`, `scene()` — two
`ensure`s, on adjacent lines:

```
ensure(any_vsplit == 0 || v_factor == 15,                        …)   ← the lock
ensure(any_vsplit == 0 || scene_vdeform_is_none(v_deform) == 1,   …)   ← THIS ONE
```

and the second one's own words:

> "in per-column mode (VDP reg $0B bit 2) VSRAM entry 1 is **PLANE B OF COLUMN
> 0**, not the plane, and `Vscroll_Write` ships the whole 80-byte column buffer
> by DMA each frame — so a whole-plane mid-frame write below the line would shift
> **ONE 16-px column of forty** and leave the rest where the column buffer put
> them."

**Aurora transcribed the first everywhere and the second in one place.**
`sceneDeformAdvisories` carried it, in the Deform section — which is *exactly*
the position ROADMAP **row 80** judged insufficient for the twin. Row 80's own
words, still in `raster-timeline.ts`:

> "it was, until row 80, the ONLY thing in Aurora that said anything about this
> combination, **in a collapsible section away from the controls that create
> it**."

⚠ **Row 80's ruling was never about `v_factor`.** It is about where a cross-field
refusal has to appear. The second refusal simply never had it applied — so this
parcel applies it, in row 80's own shape: **one declaration
(`VSPLIT_VDEFORM_CLAUSES`), three surfaces composing it, no surface retyping it.**

### 2.1 Two renderers were drawing a document that cannot build

Both are the failure mode `curveAnchorDeformAdvisory`'s docblock already names —
*a guard whose two halves sit on different objects is exactly the one a
transcription drops*. This is its second and third instance.

- **`camera-preview.ts`** gated the split on `vLocked` alone. A scene with
  `v_factor: 15` **and** a `v_deform` therefore drew a full-width split across
  the whole preview — for a document the build refuses. Its own comment, two
  lines above the bug, forbids exactly that: *"there is no in-game appearance for
  the preview to imitate, and applying it anyway would invent one."*
- **`raster-timeline.ts`'s `splitRefusal`** transcribed the lock ensure and not
  the v_deform one, so the strip drew those splits as good marks with **no
  refusal at all**.

⚠ **THE PREVIEW IS NOT REDRAWN AS ONE COLUMN, AND THAT IS THE POINT.** There is
no in-game appearance to imitate — the build refuses the scene, so the sliver
never renders. Painting one would be a picture of a ROM that cannot exist, which
is a worse lie than the full-width one it replaces. `[p2]` asserts every band
keeps the whole-plane base; `[p3]` asserts the preview still SAYS the columns are
unreproduced, because dropping the split must not quietly drop the honesty line
with it.

`splitRefusal`'s `Pick` now names `v_deform`, so a stale caller fails to compile
rather than silently passing a scene the function can no longer judge without.

### 2.2 One order decision, made rather than defaulted

When a scene breaks **both** ensures, `splitRefusal` speaks the **lock** arm. That
is not arbitrary: an unlocked layer top is not a screen line at all
(`layerTopSpace` decides whether the quantity exists), so the v_deform sentence
would be arithmetic on a number that does not exist. `[s4]` pins it.

On the **layer card** both advisories render, and neither suppresses the other —
the remedies genuinely differ (one moves `v_factor`, the other moves `v_deform`),
and choosing which of two real refusals an author may see is the mistake
`sceneDeformAdvisories`' own guard-3 docblock records. `[l3]` and a wording row
pin it as two independent conditionals rather than an if/else.

---

## 3. The authoring site — the half the row is actually for

The 09-03 parcel closed the **reading** end: a ramp card says whether its five
numbers are a full-screen scroll or a sliver. The **writing** end stayed open, and
the writing end is the one with the author's hand on it.

An author opens the Parallax panel, flips **V deform** to `columns`, gets exactly
the wobble they asked for — and narrows a VSRAM ramp in a document they were not
looking at, in a panel they had not opened, on a build that goes green.

`vDeformRampAdvisory` walks the same join `rampScrollBindings` walks, backwards,
and the V-deform row now paints the consequence:

```
  ┌─ the Deform section ───────────────────────────────────────────────┐
  │ V deform   [ columns ]                                             │
  │ Table … Speed … Amp shift …                                        │
  │ per-column vertical scroll — a different VSRAM mode, …             │
  │                                                                     │
  │ THIS NARROWS A RAMP ELSEWHERE: V deform puts VSRAM in per-column   │  ← new
  │ mode, and Section 0 binds this scene and preset "ojz_ramp" —       │
  │ whose VSRAM ramp therefore scrolls a single 16-pixel column        │
  │ instead of the full width. That ramp is edited in the Colour       │
  │ panel, and its own card says the same thing from the other side.   │
  │ Assumes this game declares CAP_PER_COL_VSRAM — sonic4 does.        │
```

### 3.1 It declines, and the decline is the part worth reading

```
  THIS MAY NARROW A RAMP ELSEWHERE — AURORA CANNOT READ THE PRESET: section 2
  binds preset "ojz_old", which is not a preset in this project, so whether it
  carries a VSRAM ramp this would narrow to one 16-pixel column is not
  decidable from here.
```

A `rasterRef` can name a preset that was deleted, renamed, or sits in
`unreadable` — the sidecar is hand-editable and aeon's generator writes it too.
Folding that into "nothing was narrowed" is the **mirror image** of the guess the
09-03 row's fifth case refuses. `[b4]` asserts the arm names which failure it was
AND that it does not assert the narrowed lead.

### 3.2 The silences, and which of them are derivations

| Silent when | Why it is not the same defect |
|---|---|
| the scene has **no** `v_deform` | no consequence yet. The ramp card's "nothing bound" case *had* to speak because its five numbers are meaningless without it; a V-deform row means what it says on its own, and a line on every scene without one is a warning about nothing on the majority of scenes. |
| the bound preset carries `bands` or `base_swap` | ⚠ **DERIVED, NOT A HEDGE.** `$defs.band.properties.on` has no `vsram` arm at all (`EFFECTS_PRESET_BAND_ON_ARMS`, and the schema's own sentence: a band's restore comes from the ON op's CRAM span and a VSRAM op has none); `base_swap` writes a nametable base register. **`ramp` is the only preset shape that writes VSRAM**, so it is the only one per-column mode can reach. `[a3]` proves the check happened by moving *only* the preset's shape. |
| no act is open | there are no sections, so there is no binding to resolve. `BandPresetPanel` is silent in that state for the same reason, and one surface answering where its mirror stays silent is the disagreement §3.3 exists to prevent. |

### 3.3 One chain, read from both ends

`sectionSceneRef` is extracted and **both** directions call it. Two panels that
resolved `sceneRef: null` differently would each be individually plausible and
jointly useless — a rule each side spells for itself passes whenever both are
wrong together.

`[c2]` is the row **neither function owns**: one fixture (section 0 by its own
ref, section 1 on a different scene, section 2 by the act default) goes through
both readers, and they must agree about which sections are joined and how each
got there. A test per function would have let them drift while both stayed green.

### 3.4 Placement, and why it is the opposite of the ramp card's

The ramp card puts its sentence **above** the controls, because it changes what
every number below it *means*. This one goes **below** the row, because it changes
nothing about the table, the speed or the amplitude — those do exactly what their
labels say. It is a consequence of the row, and a consequence reads after its
cause.

**Neutral tone, no warning colour, no gate**, and a wording row pins that it is
not in the warning list. This is the one sentence on the surface that is **not** a
build refusal: aeon cannot see a preset document, so the pairing builds and runs.
That is precisely why it must be said here, and precisely why dressing it as an
error would make the two real refusals beside it cheaper.

---

## 4. Reels — the negative result, stated plainly

The brief named reels as the class's second instance. **Measured: there is
nothing to fix, and that is the whole finding.**

`grep -rin "reel" src/` returns **four** hits and all four are the substring
inside the word *"freely"* (two test titles, two comments). `reel_rates` appears
nowhere. Aurora has no reel surface at all.

The hub's ruling — *reels are NEVER an arm of `v_deform`; that mechanism is one
shared phase and cannot express independent per-band rates* — is a **constraint on
a control that does not exist**, against a key that is explicitly pre-declared and
**not** contract (`docs/OVERSEER-LOG.md`, EW-7-11: no CR, no schema key, and aeon's
own item-10a artifact finds 10a is one fixed DEBUG demo with no per-scene
mechanism). Building anything against that spelling today is what the log forbids
in as many words.

So: **bucket 3, with the census that establishes it.** Booked in §7 so the
constraint is not rediscovered as a bug when the CR lands.

---

## 5. Bucket 1 and bucket 3 — the sites that needed nothing, and how that was established

**Already discloses (bucket 1), no change:**

- **`left_column_mask`**, both directions. `vDeformToggleCommand` clears the
  policy in the SAME gesture that turns `v_deform` off (two keys, one command,
  one undo step) because the engine refuses a declared policy without a subject;
  `sceneDeformAdvisories` guards 1, 2 and 3 cover mandatory-without-one,
  declared-without-one, and `sprite_mask` arriving by hand-edit. This is the
  cross-feature coupling done right, and it is the model the rest was measured
  against.
- **`camera-preview`'s `v_deform` absence.** `cameraPreviewAbsences` pushes
  `'v_deform columns (no clock)'` and the canvas prints it. The preview does not
  model per-column scroll and says so where the picture is.
- **The ramp card's scroll-mode sentence** (the 09-03 work). Cited, unchanged.

**Not affected (bucket 3), and here is how that was established — not reasoned
from an entry point:**

- **`v_factor` / `v_offset` / `v_center` / `bob_*`, and `bg-wrap`'s vertical
  reach.** The plausible worry is that per-column mode replaces the whole-plane
  scroll. **It does not.** `parallax.emp`'s per-column fill, read at `e81fd349`:

  ```
  // d2 = current_vscroll_bg (BG base)
  .col:
      move.b  (a1, d4.w), d5        // sample
      asr.w   d3, d5                // offset = sample >> v_deform_shift_bg
      move.w  d1, (a2)+             // FG word = camY
      move.w  d2, d0
      add.w   d5, d0
      move.w  d0, (a2)+             // BG word = base + offset
  ```

  Every column is `base + offset`, and the base is the same
  `((camY - v_center) >> v_factor) + v_offset` the whole-plane path ships. The
  scene's own vertical scroll survives per-column mode intact, so every surface
  that computes or describes it is correct as written.
- **The preset's other two shapes.** §3.2's derivation, from the schema's arms
  rather than from a reading of which presets happen to exist.
- **`agent-handler.ts`.** Its only `v_deform` token is a comment about
  `v_deform_shift_raw`, which is `EXCLUDED_RAW_FIELDS` — a *different key*. It
  carries no scene-vertical logic and no sentence about one.

---

## 6. Proof

### 6.1 The instruments — runner named

| | rows | runner |
|---|---|---|
| `src/renderer/providers/__tests__/effects-preset-vdeform-ramp.test.ts` | **19** | **`npm test`** (vitest include) |
| `src/renderer/canvas/__tests__/vsplit-vdeform-surfaces.test.ts` | **18** | **`npm test`** |
| `src/renderer/components/effects/__tests__/effects-wording.test.ts` | **+6** (24) | **`npm test`** |
| `src/renderer/providers/__tests__/effects-aeon.test.ts` | 147 (1 row **repaired**, §6.4) | **`npm test`** |

`npm test` is the whole chain: 8 `check:*` scripts, `npm run typecheck`, then
`vitest run`.

⚠ **`[z]` EXISTS SO THE CANVAS FILE CANNOT GO VACUOUS.** Every row there uses
`v_factor: 15`. A fixture that also broke ensure 1 would be refused by the arm
that already shipped, and every row would pass **without the new code** — the
extremes-hide-what-they-clip failure. `[z]` asserts both fixtures satisfy ensure 1
and that `vsplitLockAdvisoryParts` is null on both, so ensure 2 is the only thing
under test. Every surface row also carries its **control**: the same scene with
the `v_deform` removed must behave the old way, or "the split is gone" cannot be
told from "splits never worked here".

### 6.2 Red-first — four plants, each on the **committed** baseline `d62e7b74`

Each was applied to a clean tree, shown on disk with `git diff --stat` plus the
mutated line quoted back, run, and restored with `git checkout --` (`git status`
verified empty each time).

| plant | mutation, shown on disk | went red |
|---|---|---|
| **A** the mirror sentence hard-wired to the narrowed arm | `ramp-scroll-mode.ts` `if (true) return { short: '…THIS NARROWS A RAMP ELSEWHERE…', full: V_DEFORM_RAMP_NOTE };` (1 file, 1 insertion) | **5** rows: `[b1] [b3] [b4] [b5] [b7]` — **19/19 → 14/19** |
| **B** the preview's v_deform gate removed | `camera-preview.ts` `const split = vLocked && layer.vsplit !== undefined …` (1 file, 1 ins / 1 del) | **1** row: `[p2]` — **18/18 → 17/18** |
| **C** `splitRefusal`'s new arm killed | `raster-timeline.ts` `if (false) {` (1 file, 1 ins / 1 del) | **2** rows: `[s2]` and `[p4]` |
| **D** the shared chain broken — `sceneRef: null` read as absent | `effects-preset.ts` `return { ref: section.sceneRef, via: 'section' };` (1 file, 1 ins / 3 del) | **6** rows across **two** files |

**Plant A is the anti-vacuous demonstration.** `[b7]` holds the scene, the section
index and the binding fixed and moves **only which preset the section binds**,
requiring three distinct outcomes (narrowed / silent / declined) asserted as a
`Set` of size 3. A hard-wired sentence cannot produce three answers.
⚠ **Honestly reported: `[b2]` and `[c3]` stayed GREEN under plant A**, because the
planted string was deliberately the exact text those rows expect for their case.
That is the correct split — they are rows about the *wording* of one arm, and only
the rows about the *derivation* should move.

**Plant B and plant C prove the two renderers were fixed independently.** Under B
the strip's `[p4]` stayed green; under C the preview's `[p2]` stayed green. Two
separate bugs, two separate fixes, and neither row is passing because of the
other's code.
⚠ **`[s5]` did not discriminate under plant C** and is disclosed rather than
counted: with the v_deform arm dead, layer 0's fire line falls out of range and
the function returns a refusal for a different reason. `[s5]` documents a
precondition; `[s2]` is the row that discriminates.

**Plant D is the seam's evidence and the strongest of the four.** One edit, in one
function, took down `[c1]`, `[c2]` and `[a2]` in the new file **and three rows in
the shipped 09-03 file** — which is what "both directions read one chain" means
when it is true, and what it would fail to show if the extraction were cosmetic.

### 6.3 Aggregates

Run in the **linked worktree** `.claude/worktrees/agent-a01de507bccfbe55c`, so
`sibling-root` step 3 is unmeasurable here and this total legitimately differs
from a main checkout by one pass / one skip (the suite says so itself, loudly, in
its skip report).

| | Test Files | Tests |
|---|---|---|
| **This branch**, `npm test` (whole chain incl. typecheck + 8 `check:*`) | **489 passed / 3 skipped (492)** | **6914 passed / 9 skipped (6923)** |

⚠ **THE FIRST DRAFT OF THIS TABLE SAID 6932/6941 AND I HAD NOT RUN IT.** The
figure was written from memory between two real runs and is recorded here rather
than silently swapped, because a fabricated "after" is exactly the shape that
survives review: it is plausible, it is in the right direction, and nobody
re-runs a green number. The run that caught it is the one quoted above. The two
runs of this branch that were actually taken agree: the first ended
`1 failed | 6913 passed | 9 skipped (6923)` (§6.4's row), and after that one row
was repaired, `6914 passed | 9 skipped (6923)` — same total, one failure
converted to a pass, which is the arithmetic a made-up number would not have
satisfied.

`npx tsc --noEmit` — **clean, no output.**
`skip-report: OK — every skip named its reason.` No row was deleted or skipped.

### 6.4 ⚠ One existing row went red, and it was MINE

`effects-aeon.test.ts`'s v_deform/vsplit row pinned the **phrase**
`/same VSRAM word/`. My pre-change grep for the arm's text searched for
`both write the same` and missed it — a false zero in my own query, on the exact
file I was editing.

The row is **repaired, not deleted**: it now asserts the clauses the surface
*composes* (`VSPLIT_VDEFORM_CLAUSES.sceneIs` / `.remedies`) plus the surviving
`/same VSRAM/`, with the reason written into the file. A row that pins a phrase
goes red on every improvement and green on any replacement that happens to
contain it; asserting the shared declaration is the same claim without either
failure mode — and it is the whole reason the declaration exists.

**The old sentence was not merely reworded.** It said *"both write the same VSRAM
word"* — a fact about addressing that tells an author nothing about what they will
see. The new one says **one 16-pixel column of forty**, which is the picture.
`[s3]` pins that the mechanism clause names the consequence and not just the
address.

### 6.5 A gate whose aim was wrong, corrected rather than quietly dropped

`[s5]`'s first draft asserted that `splitRefusal` returns null for a layer with no
split. **It went red, and the code was right — the row was wrong.** Both arms of
that function test the SCENE and neither tests the layer; the shipped lock arm has
always behaved that way, and the new arm was written to match rather than diverge.

What makes that safe is the **caller's** `layerEmitsFire` filter, not the
function's own guard — so the guard is now asserted where it actually lives:
`[s5]` writes the precondition down and proves it holds for **both** arms, and
`[s6]` asserts `rasterTimelineView` never asks the question about a splitless
layer. Tightening the function would have changed shipped lock-arm behaviour on a
question this parcel was not sent to settle.

---

## 7. Booked and left — with the evidence, so nobody re-derives it

### 7.1 ⚠ THE RAMP CARD'S TWO ARMS ARE UNCONDITIONAL ON `addr`, AND THE CARD CONTRADICTS ITSELF

**This is a real defect, found by this sweep, and deliberately NOT fixed here.**

`rampScrollBindings` never reads `ramp.target.vsram.addr`; `mode` is decided
solely by `vDeformValue(scene)`. So for **any** address the card paints:

> **FULL-SCREEN:** this ramp scrolls the FULL WIDTH of the plane.

Meanwhile, three lines lower on the same card, `rampAddrGloss` paints:

> `admitted (0..78); only 0 and 2 are established`

**For `addr` outside {0, 2} those two sentences disagree**, and the confident one
is the wrong one: the schema establishes a meaning for 0 (plane A whole-plane) and
2 (plane B whole-plane) and for nothing else, and `Vscroll_Write`'s whole-plane
path emits **one longword** — bytes 0..3 — where its per-column path emits twenty.
An author can type `40` into the Addr spinner today; `rampAddrRefusal` accepts it
(0..78) and the card then asserts a full-width plane scroll for an address whose
effect no document Aurora can read establishes.

**Why it is left:** it is a defect in the **`addr`** dimension, not the `v_deform`
one — `v_deform` only selects the mode, and both arms overclaim equally. Fixing it
means changing a shipped function's signature and its 21-row test file, which is
growing this parcel into the neighbouring one rather than closing the class it was
sent for.

**The fix, when it is taken:** for `addr ∉ {0, 2}` keep the MODE claim (which is
derived and correct) and decline the EXTENT claim — a sixth case, in the same
voice as the existing five. Roughly: *"per-column mode is on (section N's scene
has a `v_deform`), but this address has no established meaning, so what it moves
is not decided by any document Aurora can read."*

### 7.2 Reels

§4. Nothing to build; the constraint is recorded so it is not rediscovered as a
bug. **Do not build a control against the pre-declared `reel_rates` spelling** —
there is no CR and no schema key, and `docs/OVERSEER-LOG.md` says so.

### 7.3 Neither refused-vsplit case adds a `cameraPreviewAbsences` line

The preview now drops a split for two reasons (unlocked plane, per-column scene)
and mentions neither in its absence list. That is **symmetric with the shipped
precedent** — the unlocked case never added one either — and the three advisories
that explain *why* the split is gone are all on the panel. Adding a line to only
the new case would be the inconsistency; adding it to both reaches into the
v_factor case this parcel was not sent to. Booked as an observation, not a defect.

### 7.4 TAGGED for foreground — CLOSED 2026-09-04 by VDEFORM-WITNESS

**What this section said when the parcel landed, kept verbatim because it is the
statement the follow-up answers:** *"No CDP harness row changed, and none was run.
The new sentence is painted by a `Hint` mounted exactly as the ramp card's is, and
the wording rows hold the mount structurally — but no instrument in this parcel
has seen it on screen, and a source test cannot. If the ramp-scroll-mode harness
is extended, the natural row is: author a scene with a `v_deform`, bind it and a
ramp preset to one section, and read the painted sentence off the V-deform row."*

**IT HAS NOW BEEN SEEN.** Branch `parcel/vdeform-witness`, five rows added as
section 10 of `scratchpad/effects-deform-harness.mjs` — the harness whose stated
purpose #3 is already *"a warning that is a string and not a pixel"*, and which is
registered as `harness:effects-deform` (no second `package.json` entry was added).

**THE TWO SENTENCES, AS READ OFF THE DOM** — quoted from the run, not paraphrased:

- `[10c]` **the narrowing arm.** The element is **absent** before the toggle and,
  after one change event on the real `v_deform` select, carries:

  > THIS NARROWS A RAMP ELSEWHERE: V deform puts VSRAM in per-column mode, and
  > Section 2 binds this scene and preset "aurora_ramp_witness" — whose VSRAM ramp
  > therefore scrolls a single 16-pixel column instead of the full width. That ramp
  > is edited in the Colour panel, and its own card says the same thing from the
  > other side. Assumes this game declares CAP_PER_COL_VSRAM — sonic4 does.

- `[10d]` **the decline arm — the row this follow-up is for.**

  > THIS MAY NARROW A RAMP ELSEWHERE — AURORA CANNOT READ THE PRESET: section 5
  > binds preset "vdeform_witness_absent", which is not a preset in this project;
  > and section 6 binds preset "vdeform_witness_unreadable", whose file could not
  > be read, so whether they carry a VSRAM ramp this would narrow to one 16-pixel
  > column is not decidable from here.

  Both spellings of the refusal in one sentence, each naming **which** failure its
  section hit, and no narrowing claim anywhere in it.

**NOTHING IS TYPED INTO AN ASSERTION.** Every expected fragment is lifted out of
`src/core/formats/effects/ramp-scroll-mode.ts` at run time — `RAMP_SCROLL_COLUMN_WIDTH_PX`,
both `V_DEFORM_RAMP_LEAD` arms, the head of `V_DEFORM_RAMP_NOTE`, and `unknownWhy`'s
**two clause templates**, which are then filled with the section index read from
`activeSection()` and the preset ids read from `rasterRef(N)`. Read from `RUN.root`,
not `ROOT`, so the expectations come from the sources that built the bundle under
test. The extractor **refuses** rather than defaulting: a renamed constant stops the
run naming what it could not find.

⚠ **ONE TRAP THE EXTRACTOR WALKED INTO FIRST.** `RAMP_SCROLL_LEAD` — the other end
of this same defect, forty lines up in the same module — also has a key spelled
`unknown`, and it is declared **first**. A file-wide regex lifts the ramp card's
words and `[10d]` would have asserted a string the scene panel never paints. The
lead block is extracted and searched on its own.

⚠ **THE ELEMENT IS FOUND BY ITS HOVER, NOT BY THE PAINTED WORDS.**
`V_DEFORM_RAMP_NOTE` is the same string on both arms, so the locator does not
assume which sentence is there. A locator keyed on *"starts with THIS NARROWS…"*
would report `no-element` for a decline branch mutated into a confident claim, and
a row reading that as "absent" goes **green on the exact defect this closes**.

⚠ **THE RECT IS COMPARED TO THE SCROLLER'S BOX** — not `checkVisibility()`, not
`getClientRects()`, both of which are green for an element scrolled out of its own
container. This panel is `<Panel width={300} scroll>` with the V-deform row well
down it, so that is the live failure mode here. `[10e]` also asserts the two arms
were **different strings** on the same box with the same hover, so a panel that
mounted and stood still cannot report `[10c]`/`[10d]` as passing.

⚠ **THE DECLINE STATE CANNOT BE AUTHORED BY ANY GESTURE, AND THAT IS MEASURED.**
`presetRefOptions` offers `''` plus **loaded** presets only, so the picker cannot
write an unresolvable id; and `deletePresetRefusal` **disables** Delete while any
section binds the preset, so the other order is refused too. Both refusals are
correct and neither should change. The state is nonetheless ordinary on disk — the
sidecar is hand-editable and aeon's generator writes it, which is
`unassignablePresetRef`'s own stated reason for existing — so it is constructed on
disk in a **copy** of the aeon project under `os.tmpdir()`, never that working tree
(the `//harness-canvas-writers` ruling, d-28 COPY ONLY WHERE IT CAN WRITE). Three
files: `section_5.meta.json` → an id with no document, `section_6.meta.json` → a
document that is not JSON, and that document. The copy and the three files are
printed by the run before any row executes, and the copy is removed in the
`finally`.

**RED-FIRST, shown applied on disk and restored from committed `54fb6aa9`.**
`vDeformRampBindings`'s unresolvable-preset arm changed to
`carries: 'ramp', reason: null` — folding the decline into the confident arm, which
is the defect itself rather than a proxy for it. `[10d]` went red and **printed the
fabricated sentence it caught** ("THIS NARROWS A RAMP ELSEWHERE: … Sections 5 and 6
bind this scene and presets "vdeform_witness_absent" and "vdeform_witness_unreadable"
— whose VSRAM ramp therefore scrolls a single 16-pixel column…"), while `[10c]` and
`[10e]` stayed green — so the plant is aimed at the decline branch and not at the
section. Baseline restored, rebuilt, **43/43** again.

**43/43 rows, run IN-TREE.** The run was executed in a linked worktree that was
itself built (`VITE_AURORA_DEBUG=1 npm run build` against a borrowed
`node_modules`), so `run-root` reports `in-tree` rather than **BORROWED** and the
bundle under test is this branch's own sources — which is what makes the red-first
mutation measurable at all. Borrowing the main checkout's `dist/` would have run
**master's** bundle, in which the plant does not exist and `[10d]` cannot go red.

⚠ **AND ONE ENVIRONMENTAL FINDING WORTH THE NEXT LANE'S TIME, because it makes a
gate REFUSE rather than fail.** The obvious way to build in a worktree is
`ln -s <main>/node_modules node_modules`. Do not: `git check-ignore` answers
`fatal: pathspec 'node_modules/…' is beyond a symbolic link` (exit 128), and
`check-cited-paths`' ignore-query self-proof reads that as *"the exit-0 arm is not
behaving"* and **stops the whole `npm test` chain before vitest runs**. The gate is
right — it cannot prove its own exclusion arm, so it refuses instead of measuring —
and the diagnosis is invisible from the message, which talks about `.gitignore`.
The working shape is a **real directory whose entries are symlinks**
(`mkdir node_modules; ln -s <main>/node_modules/* node_modules/`, plus the dot
entries): `node_modules` is then a real path git can answer for, `node_modules/.bin/electron`
still resolves, and both the build and `npm test` run. Suite in that configuration:
**6914 passed / 9 skipped (6923); 489 files passed / 3 skipped (492)** — a linked
worktree, so `sibling-root` step 3 is unmeasurable and this differs from a main
checkout by one pass / one skip.

- **No emulator, ever.** Nothing here has watched a ROM narrow a ramp or refuse a
  scene. Every engine fact is `git show`n source at `e81fd349`.

---

## 8. Design calls I made, and why

- **A separate function, not a new arm on `sceneDeformAdvisories`.** That
  function's contract is "what aeon's `scene()` would refuse" and its output is
  rendered `tone="warning"`. The ramp consequence is **not** a refusal; folding it
  in would have made it look like one and diluted the four that are.
- **Below the row, not above it.** §3.4 — the opposite of the ramp card's
  placement, for the opposite reason.
- **Painted short / contract long on one element**, `presetLimitsShort()`'s idiom,
  and the hover **quotes** `RAMP_SCROLL_MODE_NOTE` rather than restating the
  chain: a second transcription is a second thing to drift out of agreement with
  aeon's source.
- **Silent when `v_deform` is off**, rather than a pre-emptive "turning this on
  would…". The panel's precedent is to speak in the state that has the
  consequence, and the toggle is one undo away.
- **The gate lives at the mount, not in the provider.** `vDeformRampBindings`
  answers "who binds this scene and carries a ramp" whether or not the deform is
  on, which lets a test exercise the join without authoring a deform to see it.
- **Mechanism clause on the layer card, not in the scene list.** The scene-level
  arms render as plain hints with **no hover**, and `column-layout.tsx` records
  what an unsplit advisory costs this column (the v_factor row's ran to 21 wrapped
  lines / ~460px). `[d2]` pins the split.

**Nothing is blocked.** One item is booked-and-left with its evidence (§7.1), one
is a measured negative (§4), and one row of an existing test was repaired with the
repair explained in the file (§6.4).
