# Dash sweep: the components bucket

Branch `parcel/dash-sweep-components`. Owner ruling, 2026-09-05, all tools: no
U+2014 and no U+2013 in any user facing text, labels, panel prose, tooltips,
refusals or generated help. This parcel is `src/**/*.tsx` and only that.

## Counts, by two instruments, before and after

Both instruments were run on the same tree at the same two points. The scripts
live in the session scratchpad, not in the repo; the gate that replaces them is
`scripts/check-tsx-dashes.mjs`.

| instrument | how it decides what is user facing | before | after |
|---|---|---|---|
| A: TypeScript AST | classifies every dash by the syntactic node containing it; counts StringLiteral, JsxText and template parts; excludes comments by walking to leaf tokens and taking their trivia | **210** in 49 files | **0** in 0 files |
| B: esbuild | transforms each file with the `tsx` loader and `minifyWhitespace`, which drops comments and lowers JSX children into string arguments; counts what survives | **210** in 49 files | **0** in 0 files |

The two agreed file by file at both ends. Raw dashes in the bucket including
comments: 1,787 before, 1,576 after; the 1,576 are comments and are not in
scope, for the reason written into the gate.

### Why the population, not the instrument, was the hard part

The brief warned that a first count found 145 by scanning string literals and
was wrong. That is exactly right and worth restating: in a `.tsx` file much of
the prose a user reads is **JSX children**, which are not string literals. A
stable instrument can measure the wrong population and rerunning it cannot tell
you. The AST breakdown of the 210:

| node kind | count |
|---|---|
| StringLiteral | 97 |
| JsxText | 54 |
| template literal parts (head/middle/tail/no-substitution) | 58 |
| escape spelling (a backslash-u sequence) | 1 |

### 210 and not 209

`CollisionPalette.tsx:405` spelled its em dash as a backslash-u **escape**, not
as the character. It renders identically to the reader and is invisible to a grep
for the character. Instrument A was extended to match both spellings once B
found the discrepancy; that is the whole of the 209/210 difference, and it is
why the gate matches both spellings too.

## The placeholder glyph

`PixelHud.tsx` rendered a bare em dash as a **character**, not punctuation: it
is what the cursor-position field shows when the cursor leaves the surface.

**Chosen: two ASCII hyphens, `--`,** named `NO_READING` with the argument
written at the definition.

- the populated form of that field is `x, y`, and those can be negative, so a
  single `-` is a number the reader has to rule out. `--` cannot begin one.
- the HUD is monospaced; an ASCII pair holds a fixed width and needs no font
  carrying U+2014.
- `·` was rejected: this codebase already spends the middle dot as a **field
  separator** (the collision picker's status line, the section grid tooltips),
  so reusing it for "empty" would make one glyph mean two things in one window.

The same `--` now means "no value" in `CanvasMode`'s size readout and its
suspended-constraints chip, `SonicDynamicPreview`'s status line, the map's
collision angle readout, and the collision picker's 8px angle label.

Three related glyph decisions that deliberately went a different way:

- **`M:off` and `flip[X]:off`** (`ToolColumnParts`, `ComposerCanvas`). The dash
  there never meant "no reading", it meant "not H, not V", and the axes beside
  it are already words.
- **`-- pick saved (3) --` and `-- none (box) --`** (`SpriteMode`,
  `SpriteBindingRow`). The bracketed-placeholder shape is the ASCII idiom that
  has meant "this row is not a choice" in a `<select>` since long before the em
  dash was available; it keeps the shape the author already recognises.
- **`no angle`, in words, in the collision status line.** `angleDegrees()`
  returns null when `hasAngle` is false, which is a fact about the profile, not
  a missing reading. The 8px label under each shape swatch cannot hold two
  words, so it takes `--`. Same fact, two renderings; the reason is the field
  width and it is written at both sites.

## Sentences left as they were

None. Every one of the 210 took a repair that reads at least as well as the
original, and the after count is zero by both instruments. The repairs that
were closest to not being worth it, named so they can be argued with:

- `EffectsScenePanel.tsx:617` builds a tooltip by appending two optional
  clauses to `Layer 0 top (67..287)`. A colon would have collided with a colon
  inside the appended clause, so both joins became semicolons:
  "Layer 0 top (67..287); a plane line, so the scene is locked; narrowed from
  ...". It is a list of qualifiers and now reads as one, but it is long.
- `MarqueePasteOptions.tsx:208` took a semicolon rather than a full stop
  because both halves are about the same held key.
- `CollisionPalette.tsx:228` appends a warning to an undo description. It reads
  "Reset collision A to engine (section 3); discards reserved bits on 2 cells".
  A second bracket group after `(section 3)` would have been worse; the
  semicolon is the least bad of three options.

## Which edited strings had test coverage, and which did not

Measured, not inferred. An instrument takes the string CONTENT of each
pre-sweep site from the AST, cuts prose runs of four or more words from either
side of the dash, and greps `src/**/__tests__`, `test/` and the harness corpus
for an exact substring match.

- **204 distinct strings** carried a dash before the sweep.
- **18** are named by some test or harness.
- **186 are asserted nowhere at all.**

Of the 18, only **4 assertions actually pinned the punctuation** and went red:
three rows in `composer-linkage-banner.test.ts` asserting the banners open
with `Linked` and an em dash, and one in `composer-priority-wiring.test.ts`
asserting `Priority:`, a state word, and an em dash. The other 14 name a part
of the sentence that did not move.

**So the suite staying green is evidence the strings are untested, not proof
nothing broke.** 186 of 204 user-facing strings in this bucket have no
assertion of any kind. The silent-mangling risk lives there, and the only thing
standing behind those 186 is that each was read and repaired by hand.

The two assertions that broke were updated, which is the same change and not
scope creep. One of them deserves its own paragraph.

## The thing that nearly shipped: selectors are not assertions

`PriorityChips.tsx` carries a comment saying **KEEP THESE STRINGS STABLE**: the
three `title` strings are how `scratchpad/tile-attribute-harness.mjs` and O17's
composer harness ADDRESS those chips, by `/^Priority: keep/` and friends. My
first repair rewrote them to `Priority keep: ...` and would have broken every
harness that clicks them. They now read `Priority: on. Painted tiles draw IN
FRONT of the player`: the selector prefix is byte-identical and only the prose
after it moved. The test was rewritten to pin the PREFIX, with the reason
beside it.

That was the visible instance. The measured extent is much larger.

### 80 CDP selectors, broken in silence

The effects and tile-animation harnesses address controls by `title`, and
dozens of those titles were a contract key, an em dash, and a gloss, which this
sweep rewrote. The section cards are worse: several match a regex spelling
`^Preset`, an em dash, the id, and then a negative lookahead for a SECOND em
dash, where both dashes are load bearing and the lookahead exists only to
separate the bands card from its cycles-and-variants sibling. **These files are
`.mjs`; `npm test` never runs them.** A selector this sweep broke goes red nowhere. It stops
matching, and the next person to drive the real app gets "not found" and starts
debugging the app.

Measured, not guessed. An instrument reads every user-facing string from the
components at the branch base and at HEAD, pulls every dash-bearing regex out
of the harness corpus, and asks each whether it matched a pre-sweep string and
still matches a post-sweep one:

|  | before | after |
|---|---|---|
| matched pre-sweep and post-sweep (harmless) | 5 | 5 |
| matched pre-sweep, **matches nothing now** | 33 | **0** |
| matched neither (about some other surface) | 20 | 20 |

The 33 are regex literals the reader can see whole; the concatenated
section-title selectors (`String.raw` + an interpolated id) are invisible to
it and were enumerated by grep. **80 lines across 38 files** in total,
migrated in commit `089e90b6`.

**The first attempt at that migration was wrong and is recorded because it is
the more useful half.** Applying the rules file-wide made **141 replacements
for 33 broken selectors**: right about the mechanism, wrong about the extent,
rewriting prose in comments about other surfaces entirely. It was reverted, and
what landed is line-precise, driven by a target list the instrument produced,
with every changed line printed and read.

Also caused by this sweep rather than found by it, and fixed here:

- `effects-column-harness`'s section-title normaliser cut a title at the em
  dash to get its subject; it now cuts at the colon or the middle dot.
- `section-column-harness` asserts a literal list of sprite section titles, one
  of which this sweep rewrote.
- `docs/guides/effects-first-run.md` is rendered verbatim into the Guide tab
  and quoted a select option by its old text. **Only that one quote** is
  corrected. The rest of that file still carries 66 U+2014 and 4 U+2013 of its
  own, which are somebody's bucket but not this parcel's.
- three harness comments quoting a title this sweep changed.

## Text derived from a vendored contract: nothing to refuse

Checked rather than assumed, and the brief's suspicion that it was moot is
correct.

Prose IS derived at module load, in two places:
`src/renderer/providers/effects-preset.ts` (`presetFieldTitle` returns the
contract's own `description` verbatim, feeding `BAND_FIELD_TITLES`,
`armFieldTitle`, `programArmRowTitle` and others) and
`src/core/formats/effects/scene-ui.ts` (`EFFECTS_ROW_REMAP_GENERATOR_REFUSALS`,
`EFFECTS_REELS_DEBUG_NOTE`, `EFFECTS_REELS_BINDING_NOTE` and more, cut out of
`description` fields by regex). Those reach the screen in
`EffectsScenePanel.tsx` and `BandPresetPanel.tsx`.

**But the two documents that feed them carry no dashes at all.**
`aurora-effects-scene.schema.json` and `aurora-effects-preset.schema.json` are
pure ASCII: 0 U+2014 and 0 U+2013 each. So no component in this bucket renders
a dash that traces back to a vendored document, and nothing had to be refused.

For completeness, the dashes that DO live in vendored files are in
`aurora-effects-preset.schema.provenance.json` (70) and
`bganim-consumer-contract.json` (80). Neither file's prose is rendered: the
bg-anim contract is read for numbers and enums only, and the provenance
sidecars are read only by a currency test. Both were left alone.

The dashes an author sees on the effects surfaces came from hand-written
strings, and the ones in `.tsx` are now gone. Note for the next bucket:
`providers/effects-aeon.ts` still glosses `reels` and `bands` with an em dash,
and `providers/bg-anim-aeon.ts` still writes its bank range as `Banks 1` to `7`
with an EN dash, in five places. Those are `.ts` and are the other parcel's.

## The ratchet: built, and my argument

Built: `scripts/check-tsx-dashes.mjs`, wired into `npm test` and available as
`npm run check:tsx-dashes`.

The case for it is that the population it watches is at **zero**, so it is not
ceremony and it is not red on any uncleaned bucket. A bucket that took a day to
clear is worth one line of the test chain. It walks the AST for the reason
above, counts both spellings, and states in the script itself what it does not
count and why: comments (the design record, 1,576 of them here) and the other
two buckets.

Red first, from a committed baseline, restored between each:

| mutation | result |
|---|---|
| A: literal em dash in a string literal | rc=1, named file, line, column and printed the sentence |
| B: literal em dash in **JSX text** (the population the first count missed) | rc=1 |
| C: the backslash-u **escape** spelling | rc=1, labelled `(escape)` |
| D: **negative canary**, an em dash added to a **comment** | rc=0, still green |

**What I did not build, and think is worth more.** The defect this parcel
actually found is the 80 silent selectors. A gate that took every title
selector in the harness corpus and asserted it still matches some component
string would have caught that the moment it happened, and would have caught it
for the two buckets still to be swept. It needs design, because it must not go
red on their pending work. It is a proposal here, not a landing.

## The screenshot: BLOCKED, and why

**There is no picture of the effects panel, and the reason is not this parcel.**

`docs/captures/2026-09-05-dash-sweep/BLOCKED-app-does-not-mount.png` is a blank
frame, named so it cannot be mistaken for a result.

What happened, in order:

1. `harness:effects-column` reaches `[i1] the Effects facet pill was clicked`
   and returns `click=false`.
2. A driver using the app's own documented route, `window.__dbg.setFacet`,
   throws instead.
3. Probing the page: `document.querySelectorAll('*').length` is **18** and
   `button` count is **0**, with `document.body` measuring 1680x1050. So the
   React tree never mounts; it is not a layout or window-size artefact.
   (`innerText` alone would not have distinguished those two, since it is
   layout dependent.)
4. The renderer's own exception says why:
   `Uncaught TypeError: Cannot read properties of null (reading 'useCallback')`
   thrown from the `project-runtime` chunk inside `useProject`, during `App`'s
   first render. That is the shape of a second React instance reaching a split
   chunk.

**Attributed, not assumed.** The branch base `98728471` was checked out, built
with the same command, and driven with the same probe: identical result,
`elements: 18`, no mount. So a fresh `VITE_AURORA_DEBUG=1 npm run build` of
master tip does not boot the UI, and this sweep did not cause it.

One false lead is worth recording because it nearly became a wrong report. The
first control was the main checkout's prebuilt tree, which DOES mount and DOES
pass `[i1]`. That looked like proof the regression was mine. It was not a
control at all: its `dist/main/index.mjs` is 1,872,935 bytes against 2,008,760
for a fresh build of my branch's own parent, so it is an older source. The
control that settles the question is the branch base built here.

## Suite

Measured in this worktree.

- Before the vendored-sidecar drift below: **7360 passed, 9 skipped, 0 failed**
  (509 files passed, 3 skipped). Master's stated baseline is 7361 passed, 8
  skipped in a main checkout; the delta is the one row that skips by design in
  a linked worktree (`test/support/sibling-root.test.ts` step 3, which needs a
  main checkout to measure `--git-common-dir`'s relative output shape).
- Final run: **7359 passed, 1 failed, 9 skipped.** The failure is
  `test/formats/effects-channel-bands-drift.test.ts`, which announces itself as
  `NOT AN AURORA REGRESSION`: aeon's `origin/master` moved during this session,
  so the vendored channel-bands sidecar is now stale. This branch touches no
  file under `src/core/formats`, and the same test fails on the branch base,
  checked. Re-vendoring is another parcel's call and would mean editing a
  vendored contract document, which this parcel was told not to do.
- All `check:*` gates green, including the new `check-tsx-dashes`.

## Commits

| sha | what |
|---|---|
| `1c2d6be6` | shell and misc, 10 repairs |
| `5363f2f2` | art, sprite, canvas, 41 repairs, and the placeholder glyph |
| `d7196f54` | collision, 24 repairs, including the escaped spelling |
| `d45e169e` | map, classic tabs, shared, workspace, 50 repairs |
| `24541886` | effects panels, the last 85, and two assertions |
| `089e90b6` | the 80 silently broken CDP selectors, migrated |
| `4172eddb` | the ratchet, red first three ways plus a negative canary |
