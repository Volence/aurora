# O77 — the three RED rows in `harness:band-preset`

**Branch** `fix/o77-band-preset-reds`, cut from `master` `e0a90628`.
**Subject** `[3a]`, `[3b]`, `[3e]` in `npm run harness:band-preset` — red before the
EW-COLOUR-PICKER parcel, undiagnosed, tagged in ROADMAP row 118.

**Tally: 43 rows / 3 failed → 44 rows / 0 failed.** No app source changed.

---

## 1. Verdict — ONE cause, not two

**All three rows: STALE INSTRUMENT.** The panel is behaving exactly as its own
lane intended; the harness was a day behind a product change.

> **The brief's read that "at least two distinct causes" are in play is WRONG,
> and so is the inference it was built on.** The controller's table separated
> `[3a]` ("phrases gone from `effects-preset.ts`, they live in
> `raster-binding.ts`") from `[3b]`/`[3e]` ("phrases present — suspect where the
> harness is looking"). Both halves of that table are factually correct and
> both descriptions are of the SAME mechanism. `RASTER_SECTION_BINDING_LIMIT`
> is imported by `effects-preset.ts:58` and is `PRESET_LIMITS[0].body`; that is
> `presetLimitsShort()[0].full`; that is the element's `title`. `[3a]`'s
> phrases living in a different file is where they are DECLARED and has no
> bearing on why the row is red. A grep can see which file holds a sentence.
> It cannot see whether the sentence is painted or hovered, and that is the
> entire difference.

### The commit that moved the prose

`b8d16256` — **2026-09-02 16:05:16 -0400**, "effects: a section picker, and which
sections can carry a band — derived, not listed", EFFECTS-W1 **defect 3**.

It amended the ruling section 3 was written to. `LimitBlock` used to paint
`PRESET_LIMITS`; it now paints `presetLimitsShort()` and carries the
contract-length wording on the **same element's `title`**
(`BandPresetPanel.tsx:132-140`). Its own message states the measurement:
8,059 painted characters before the first control in a 285px column, cut to 875,
"with the 6,474-character contract wording still on the same elements' `title`".

`band-preset-harness.mjs` matches against `innerText`, which excludes attribute
text **by design** — that is the stated reason the harness reads it rather than
`textContent` (a limit buried in a tooltip must read as ABSENT). So from
`b8d16256` onward, rows `[3a]`, `[3b]` and `[3e]` were asserting sentences
against the one string the product had deliberately moved them out of. They were
**incapable of green**, and had been for a day.

The commit message says the amendment is "pinned by the rows that already
existed" — true of the node suite (`band-preset-wording.test.ts` imports
`presetLimitsShort` and `NO_PREVIEW_SHORT` and holds both halves). The CDP
harness was not in that sweep.

### Measured, not inferred

Live DOM of the limit block, this worktree's own build, `xvfb` 1680×1050,
`dpr=1`, `window.__dbg` present, aeon fixture = `git archive` of aeon
`origin/master` `b7f4bdeb`:

| child | lead | painted (`innerText`) | hover (`title`) |
|---|---|---|---|
| 1 | — (headline) | 72 B | *(none)* |
| 2 | `Saving does not install the band.` | 208 B | **6474 B** |
| 3 | `Seeing it is a debug chord.` | 196 B | **384 B** |
| 4 | `Nothing checks that a band is visible.` | 198 B | **230 B** |
| 5 | *(unled — the no-preview line)* | 161 B | **797 B** |
| 6 | `? Read the whole note in the guide` | 33 B | 57 B |

Block `innerText` = **875 B**, reproducing `b8d16256`'s own "875 painted
characters" independently. Under poison P2 below — the prose cut reverted — the
same row reads **8098 B**, reproducing the pre-cut 8,059 just as closely. Two
independent reproductions of the commit's two figures.

### Row by row

| row | verdict | why |
|---|---|---|
| `3a` | stale instrument | five phrases of `RASTER_SECTION_BINDING_LIMIT` asserted against `innerText`; all five are in the 6474 B hover. |
| `3b` | stale instrument | `START`, `hand-typed dc.l list`, `does not add itself` are in the 384 B hover. `fails loudly` was the ONE conjunct that stayed true — see §3. |
| `3e` | stale instrument | all three `NO_PREVIEW` phrases are in the 797 B hover; `NO_PREVIEW_SHORT` is what is painted. |

None of the three is "premise retired": every sentence the rows named is still
owed and still shipped. None is an app defect: the panel does what `b8d16256`
ruled it should.

---

## 2. What the repair is, and what it deliberately is not

**A matcher re-pointed at whatever the panel says now asserts nothing.** Pointing
these three rows at the short bodies would have been exactly that: the resulting
harness would go green on a build that dropped every `title`, i.e. on a panel
that had thrown the contract wording away.

The amended ruling has **two halves** — *every limit renders visibly and
unconditionally at author length* **and** *the contract wording is one hover away
on the same element* — so each row now asserts **both, scoped to one element**.
The element is found by the lead-in `<span>` the panel already draws, so a
reorder is caught rather than silently re-attributing one limit's wording to
another.

New floor **`2c`**, asserted before any row reads a substring: four titled prose
parts, the three leads present and distinct, exactly one unled part, and every
part carrying **both** a painted body (>80 B) and a hover (>100 B). A build that
dropped every `title` stops here rather than at three rows naming three
sentences. A missing part yields a `MISSING` sentinel that cannot match and that
prints `NO ELEMENT LED "…" — the limit is gone`; it is never `?? {}`.

Two rows outside the parcel were repaired for the same drift and are reported,
not smuggled:

- **`3c` was green through the whole outage, and that is a finding rather than a
  reprieve.** `SHORT_BODIES.unchecked_visibility` happens to keep both phrases
  `3c` names, so it went on passing while its two neighbours could not go green
  — one accident of wording apart, it was as blind as they were, reading the
  painted half while its comment claimed the contract wording. It now says which
  half it reads, like the other three. (This is the *partial coverage beats none
  at hiding* shape: the row covered its subject in the one limit whose short and
  long wording overlap.)
- **`3d`'s negative had stopped searching 88% of the words.** "The sentence aeon's
  page exists to prevent must not appear anywhere" was asserted over `panelText`
  — 875 B of a block that can put 8,764 B in front of an author. It is now taken
  over painted + all four hovers, and the row prints how much it searched.

---

## 3. Matcher uniqueness

Every re-pointed phrase is now asserted against **one element's own `text` or
`title`**, not against the whole block, so uniqueness-within-the-file stops being
the load-bearing property. Where it still matters:

- **`fails loudly` was NOT unique to its rule and this is measured, not
  theorised.** It occurs **3×** in `effects-preset.ts`, and one of them is
  `SHORT_BODIES.debug_chord`. In the baseline run the pre-O77 `[3b]` printed
  `loud=true` beside `chord=false handTyped=false notSelfAdding=false` — the
  matcher was matching the painted short body while the row believed it was
  reading the long one. It is replaced by `fails loudly when it has neither`
  (painted, scoped to that element) and `aeon 4aa2abc0` (hover).
- Each painted phrase chosen occurs **exactly once** in the block's 875 B:
  `a section has to BIND it`, `at the dropdown below`,
  `a row in aeon's band-demo table or a section binding`,
  `fails loudly when it has neither`, `No preview. Aurora draws no raster band`,
  `You see it when the ROM runs`.

### The distinguishing cases the old rows could not catch

| poison | what it is | old rows | new rows |
|---|---|---|---|
| **P2** | the prose cut reverted — the panel paints the contract wording again (8098 B in front of an author) | would have gone **GREEN**; this is the exact product they were written for | `3a` `3b` `3c` `3e` **RED** on the painted half, hover half green |
| **P3a** | `never been looked at on screen` creeps back into `NO_PREVIEW` — i.e. into a hover only | **GREEN** (searched only the 875 B painted) | `3e` **RED**, `retiredPhraseGoneFromBOTH=false` |
| **P3b** | `Authoring effects no longer needs a programmer.` added to a limit's contract wording — hover only | **GREEN** (same reason) | `3d` **RED**, `forbiddenSentenceAbsent=false (searched 8855B: 875B painted + 7976B hovered)` |
| **P1** | every `title` dropped from the block | `3c` would have stayed **GREEN** (painted half untouched) | `2c` `3a` `3b` `3c` `3e` **RED**, each naming what was missing |

---

## 4. Poisons — red-first, applied on disk, restored from a committed baseline

Baseline committed first (`3a5a92be`, harness only), so every restore is
`git checkout --` onto a tree that is otherwise clean, and each run is a full
`VITE_AURORA_DEBUG=1 npx electron-vite build` + harness run.

**P1 — the hovers are dropped.** `BandPresetPanel.tsx`, quoted from `git diff -U0`:

```
@@ -133 +133 @@   -        <div key={l.key} title={l.full}
                  +        <div key={l.key}
@@ -138 +138 @@   -      <div title={NO_PREVIEW} style={{ ... }}>
                  +      <div style={{ ... }}>
```
→ **44 rows, 5 failed**: `2c` (`0 titled prose parts: []`), `3a`/`3b`/`3c`
(`NO ELEMENT LED "…" — the limit is gone`), `3e`
(`NO UNLED TITLED DIV IN THE BLOCK`).

**P2 — the prose cut reverted.** `BandPresetPanel.tsx`:

```
@@ -135 +135 @@   -  <span …>{l.title}.</span>{' '}{l.body}
                  +  <span …>{l.title}.</span>{' '}{l.full}
@@ -139 +139 @@   -  {NO_PREVIEW_SHORT}
                  +  {NO_PREVIEW}
```
→ **44 rows, 4 failed**: `3a` `3b` `3c` `3e`, each red on the painted half with
its hover half green — `3a` `painted(6508B): mustBind=false aeonWired=false
namesTheControl=false; hover(6474B): rasterRef=true …`. `2b` printed
**8098 chars of innerText**.

**P3 — two prose regressions that hide inside a hover.**
`providers/effects-preset.ts`:

```
@@ -211,0 +212 @@   + 'Authoring effects no longer needs a programmer. ' +
@@ -331 +332,2 @@   - '$0000 outside it and on the control. A preview here could at most …'
                    + '$0000 outside it and on the control. A band has never been looked at on screen. ' +
                    + 'A preview here could at most be checked against ' +
```
→ **44 rows, 2 failed**: exactly `3d` and `3e`, nothing else. Neither planted
sentence is ever painted; both are what the old rows searched for and could not
reach.

**Restored** from the committed baseline, rebuilt, re-run: **44 rows, 0 failed.**

---

## 5. BUG-TIER ROW for the controller — three stale prose sites in app source

**Not a rendering defect and not fixed here** (this parcel touches no app
source). Three comment blocks in the app still assert the ruling `b8d16256`
amended, and each contradicts code within a few lines of itself:

- `src/renderer/components/effects/BandPresetPanel.tsx:16-23` — *"THE LIMIT BLOCK
  IS NOT DECORATION AND IS NOT A TOOLTIP … `PRESET_LIMITS` renders in full, at the
  top of the section, always visible … a panel that buries the correction in a
  hover is a panel that repeats it"* — nine lines above `LimitBlock`, which
  renders `presetLimitsShort()` with the full text on a `title`.
- `src/renderer/providers/effects-preset.ts:24-27` — *"the limits below are NOT
  tooltips … A limit an author has to hover to find is a limit the panel does not
  really carry."*
- `src/renderer/providers/effects-preset.ts:96` — `/** The limit itself. Shown in
  full — never truncated, never a tooltip. */` on `PresetLimit.body`, which is
  now exactly the field that goes into the `title`.

Both file headers also cite **`effects-preset-wording.test.ts`** as the gate. **No
such file exists** — `git ls-files` returns one match,
`src/renderer/components/effects/__tests__/band-preset-wording.test.ts`, and
`effects-preset-wording` has zero hits under `src/` or `docs/` other than those
two comments. A reader checking the claim finds nothing and cannot tell a wrong
filename from an absent gate.

**What a person would see:** a maintainer reading `BandPresetPanel.tsx` top-down
concludes the hover placement is a regression against a stated ruling and
"fixes" it by putting 8k characters back in front of the author — undoing
EFFECTS-W1 defect 3. That is poison P2, arrived at by reading the file.

**Why it is not the instrument:** the harness now holds both halves and would go
red (P2 above) — but only after the change is written, built and run. The prose
is what would prompt it.

---

## 5b. SECOND BUG-TIER ROW — `check-harness-guards.mjs` mis-parses a regex literal

Found by the gate firing on this parcel's own edit, and worth filing because the
next person hits it the same way and will not guess.

`scripts`-chain `check:harness-guards` (in `npm test`) strips comments and then
hunts `\bpkill\b` in what is left. Its `stripInert`
(`scratchpad/check-harness-guards.mjs:153`) has **no regex-literal case**: on
`/a row in aeon's band-demo table/` it reads the apostrophe as a single-quote
string open, scans forward to the next `'`, and comes out of sync. Everything
swallowed in between — including `//` comments — is then emitted verbatim under
`keepStrings: true`, and this file's own comment *"there is no `pkill` on a
pattern anywhere in this file"* survives stripping and trips **G2**.

Measured, both directions, on one tree:

- this harness with `aeon's` in two regexes → `1 failure(s)`,
  `G2 band-preset-harness.mjs: calls pkill`;
- `master`'s copy of the same file swapped in → `0 failure(s)`;
- this harness with `\x27` in those two regexes → `0 failure(s)`.

**The report is exactly backwards**: the file contains no `pkill` call, has never
contained one, and the token the checker found is in a comment saying so. The
local fix is in this harness (`\x27`, same character matched, with the reason
written beside it). The general fix — teaching `stripInert` the regex-literal
case, which is genuinely fiddly to disambiguate from division — is **not** made
here: `check-harness-guards.mjs` is shared surface, and a wrong guess about
`/` disambiguation would make a checker in the `npm test` chain skip real
`pkill` calls, which is far worse than a false positive. Filed for the
controller.

## 6. Environment

Identical for every run below; nothing is stitched across runs.

- Tree: `fix/o77-band-preset-reds` in
  `/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a77fd7251b2167e30`,
  cut from `master` `e0a90628`.
- Build: `VITE_AURORA_DEBUG=1 npx electron-vite build` **in this worktree**,
  pinned with `AURORA_BUILT_TREE=<this worktree>` — the harness announced
  `pinned: AURORA_BUILT_TREE=…`, never `BORROWED`, so no run measured master's
  build. Rebuilt before every plant run and after the restore.
- `ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`
  (a linked worktree has no `node_modules/.bin/electron`).
- `xvfb-run -s '-screen 0 1680x1050x24'`, `AURORA_NO_GPU=1`, CDP on 9431.
- `AEON_DIR` = fresh `git archive` extract of aeon `origin/master`
  **`b7f4bdeb6dee9449f2a6f46ec5883df61c1c790f`** into the session scratchpad.
  aeon's own tree was read only through `git -C … archive`; nothing wrote to it.
- `node v24.15.0`.

| run | build | rows | failed | dpr | capture inner |
|---|---|---|---|---|---|
| baseline | master's harness, this build | 43 | **3** — `[3a]` `[3b]` `[3e]` | 1 | 1400×1600 |
| repaired | `3a5a92be` | 44 | 0 | 1 | 1400×1600 |
| P1 hovers dropped | + app mutation | 44 | **5** — `[2c]` `[3a]` `[3b]` `[3c]` `[3e]` | 1 | 1400×1600 |
| P2 cut reverted | + app mutation | 44 | **4** — `[3a]` `[3b]` `[3c]` `[3e]` | 1 | 1400×1600 |
| P3 prose in hovers | + app mutation | 44 | **2** — `[3d]` `[3e]` | 1 | 1400×1600 |
| restored | committed baseline | 44 | 0 | 1 | 1400×1600 |

A seventh run (after the `\x27` fix of §5b, i.e. after the last write to the
harness) confirms **44 rows / 0 failed** with `[3b] rowOrBinding=true`.

`npm test` in this worktree: **exit 0**, `473 test files passed | 2 skipped`,
`6570 tests passed | 8 skipped`, `check:harness-guards` `190 clean / 190
classified · 0 failure(s) · 0 unmeasurable`.

`dpr` was 1 in every run and is printed by the harness itself
(`CAPTURE ENV dpr=1 inner=[1400,1600]`); the clip is integer client pixels
derived from the rects of the same run.

**No emulator, no ROM, no aeon build** — none was needed and none was attempted.

## 7. Out of scope, untouched

The eight harnesses on `test/o50-triage-c` (`canvas-cdp`, `capture`,
`guard-surface`, `paint-through`, `s1-sonic-sprite`, `shell-flip`,
`tile-editor`, `tool-split`) were not read or modified. The root cause found
here is **specific to this harness** — it is a product change this one
instrument did not follow — and is not a shared cause across harnesses.
