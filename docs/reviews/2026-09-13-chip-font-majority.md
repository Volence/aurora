# Chip font: 11px or 13px, counted, and the majority applied

**Owner ruling, verbatim, 2026-09-13T22:06:54Z** (`d-36-chip-font-size-answered`):

> "what's there more of, things at 13 font orr 11? go with whatever there's more of."

A rule, not a size. This packet is the count, how it was taken, and what the rule then decided.

**Instrument:** `scratchpad/chip-font-census-harness.mjs`, registered as `npm run harness:chip-font-census`.
Raw record of the deciding run: `docs/captures/2026-09-13-chip-font-majority/census-before.json`.

---

## 1. The population

**A chip is an element the `Chip` primitive renders** (`src/renderer/components/ui/primitives.tsx`,
`function Chip`), and nothing else. In the live DOM it is identified by React's own fiber: a `<button>` or
`<span>` whose parent fiber's component is the function named `Chip`. The production bundle keeps function
names (`function Chip` is in `dist/renderer/assets/index-*.js`), so the check is exact and a reader can repeat
it. A missing name would show up as zero chips on the level header, which carries five; the per-part
anti-vacuous rows would fail on that.

**Hand-rolled lookalikes are counted but do not vote.** An element whose inline style is `display:
inline-flex` plus `white-space: nowrap` (the fingerprint the 2026-09-12 row 4b used) and that `Chip` did NOT
render is listed separately. They do not vote because the ruling decides what the PRIMITIVE declares, and no
size the primitive picks reaches them. **The run found none**: 0 lookalikes on all 95 screens.

## 2. The mechanism the count had to be built around

The brief's working assumption was that interactive chips paint 13px and static chips paint 11px. **Not
quite, and the difference decides how to count.** The button branch's `font: 'inherit'` shorthand, written
after the spread, resets the font size, so the button paints **its container's size**:

- in the level header, a panel or a dialog, the container is the body's 13px, so the chip is 13px;
- inside `OptionBar` (which declares `fontSize: T.tXs` on its root) and inside a
  `T.tXs` `div` in `SpritePaletteHeader`, it is 11px;
- inside a `Hint` (the band card's `Hide` chip) it is 11px.

The span branch has no shorthand and paints the declared 11px. So today one primitive paints two sizes, and
**which one is decided by where the chip is mounted, not by which branch it takes.** A branch count alone
is not a size count.

## 3. Count (b): call sites, from source

`<Chip` JSX elements under `src/` (tests excluded), parsed with the TypeScript compiler.
**Unit: JSX elements in source.**

| | |
|---|---|
| call sites | **73** in 22 files (119 `.tsx` scanned) |
| interactive (`onClick` always given: the `<button>`) | **70** |
| static (no `onClick`: the `<span>`) | **1** (`BgAnimPreviewStrip.tsx:119`, "pan to move") |
| conditional (`onClick={x ? fn : undefined}`) | **2** (`ChunkLinkOptions.tsx:149` Detach, `:163` Detach all in section) |
| inside a `.map()` (one site, many chips) | 12 |

**Size predicted from source alone** (the span paints the declared token; a button paints the nearest JSX
ancestor's size where its own file shows one: a sizing ui primitive, derived from the ui sources as
`OptionBar`, `StatusBar`, `IconButton` at `T.tXs` and `PanelHeader` at `T.t2xs`, or an inline `fontSize`
token): **18 sites at 11px, 2 conditional, and 53 decided at the MOUNT SITE**, which a single file cannot
show. The source can only name a size a container sets explicitly, and the 13px default comes from the
body, so this reading is biased toward 11 by construction. It is printed, not voted.

**(b) joined to (a), each call site by the size MEASURED for it.** A site matches a rendered chip when the
site's enclosing component is the nearest enclosing-site component in the chip's render chain and, where the
label is a literal, the text is equal:

| measured | call sites |
|---|---|
| **13px** | **40** |
| **11px** | **22** |
| mixed | 1 (`PriorityChips.tsx:56`: 13px under `TileBrushOptions`, 11px under `ArtToolOptions`' `OptionBar`) |
| not rendered on any screen reached | 10 |

The 22 at 11px: every chip in the sprite, canvas, art and Effects option bars (`SpriteToolOptions` 6,
`CanvasToolOptions` 4, `ArtToolOptions` 3, `EffectsToolOptions` 2 plus its `VerbChip`), `SpritePaletteHeader`
2, the band card's `Hide`, and the three spans (`pan to move` and the two Detach chips before anything is
hovered).

## 4. Count (a): rendered chips, in the running app

`getComputedStyle().fontSize` of every VISIBLE chip, over CDP, on every screen the run reaches: each facet
pill, each Effects sub-tab, each classic Art tier and its Paint mode, **every tool in every facet's dock**,
and the deep states below. **Two units, both printed:** *distinct chips* (deduplicated by the first four
component names of the render chain, the text, and the element; the header's Undo seen on 73 screens is ONE)
and *chip-screens* (every screen and chip pair).

| part | screens | distinct at 13px | distinct at 11px | chip-screens 13px / 11px |
|---|---|---|---|---|
| aeon (copy of `origin/master` `1b414115`) | 46 | 19 | 17 | 240 / 96 |
| classic (copy of s1disasm, GHZ act 1) | 30 | 35 | 0 | 207 / 0 |
| sprite (the GHZ spring, object $41) | 9 | 3 | 12 | 27 / 108 |
| canvas (a new 256x256 canvas) | 10 | 5 | 6 | 50 / 60 |
| **total** (the header's five are shared by aeon and classic) | **95** | **57** | **35** | **524 / 264** |

**Deep states**, made through the app's own controls in the throwaway copies, nothing saved: a new preset
(`chip_census`) on the Colour tab; the collapsed "New tile animation" section opened; a blank tile animation
added; playback on; a band promoted from existing tiles and Remove pressed until it refused and showed its
confirm row; a collision cell probed (with View armed) until the shape picker was up; the Import Art Sheet
dialog, measured and never pressed (its chip opens a native file picker); art drawn on the canvas so the
Commit to level section has a plan.

## 5. What was not measured, and whether it could flip the count

**Facets: none unmeasured.** aeon's 7, classic's 5, the sprite document and the canvas all ran. Because every
chip comes from one of the 73 call sites, the static census bounds the population, and 63 of the 73 were
rendered.

**Ten call sites were rendered on no screen:** `CommitPlanView.tsx:155` and `:162` (the palette offers, shown
only when the art's colours differ from the act's), `AnchorSweepPreview.tsx:235` (needs a channel whose
motion is an anchor sweep), and seven in `BandPresetPanel.tsx` (`:741`, `:1046`, `:1096`, `:1156`, `:1233`,
`:1266`, `:2064`). The preset WAS created (the id field cleared, which is the create path's `setNewId('')`),
but none of its editor chips mounted in that state. That was not diagnosed.

- **By call sites they cannot flip it.** Even if all ten painted 11px it would be 40 against 32.
- **By distinct chips the worst case has no bound**, because three of the ten are `.map()` sites whose
  count is set by the document. What is known: the source predicts every one of them "from the mount site"
  (no 11px container in its file), and in the same panels every chip that was measured painted 13px
  (`BandPresetPanel`'s New, `CommitPlanView`'s Give new art collision and Commit).
- The two conditional Detach chips were measured as spans, at 11px. As buttons (a placement hovered) they
  paint 13px today (chunk-links row 4b measured it), so they are counted at 11 here, not 13.

## 6. The majority

**13px, by every count taken:** 57 to 35 distinct chips, 40 to 22 call sites by measured size, 524 to 264
chip-screens. (a) and (b) agree, and the ten unrendered call sites cannot flip the call-site count, so the
brief's STOP condition does not hold.

Taken as the brief framed it, (b) reads 70 interactive against 1 static, which also points to 13, but §2 is
why that reading is not a size count: 17 of the 70 interactive sites paint 11px today because of where they
are mounted.

**What the rule changes on screen:** the primitive declares 13px for both branches, so the **35 distinct
chips at 11px today grow to 13px**: every option-bar chip (sprite, canvas, art, Effects), the sprite palette
header's Zone and Standalone, the band card's Hide, and the three spans. The 57 at 13px do not change size.

This is the OPPOSITE direction from the fix the 2026-09-12 packet held back (§B.3 there shrank every button
chip to 11px). The card offered that as option 1; the owner answered with a rule instead, and the rule
picked the other size.

---

## 7. What was applied

At the cause, `function Chip` in `src/renderer/components/ui/primitives.tsx` (commit `6097db89`):

- **`:274` `fontSize: T.tBase`** in the shared `style`, declared ONCE and read by both elements: the
  `<span>` at `:277` and the `<button>`.
- **`:295-298` the button's style** is now `{ ...style, fontFamily: 'inherit', fontWeight: 'inherit',
  fontStyle: 'inherit', lineHeight: 1, margin: 0, textAlign: 'left' }`: longhands instead of the `font:
  'inherit'` shorthand, and the duplicate `fontSize` key gone. The shorthand was only ever wanted for the
  family a UA `<button>` overrides. This is the longhand form §B.3 of the 2026-09-12 packet wrote, carried
  to the other size, so no later key can erase an earlier one.
- **`:263-268`**: a comment above the style naming the size, the rule and this packet. **`:285-294`**: the
  comment above the button's style said "a chip in a 13px bar is still 11px", the opposite of what the code
  did. It now says what the code does and why the shorthand must not come back.
- **`:329-331`**: OptionBar's docblock claimed chips are 11px text; it now gives the 13px arithmetic (13 +
  a 2px pad each side + a 2px border = 19px, inside the 30px content box), so its "exactly 32px" still holds.
- **`src/renderer/components/ui/theme.ts:37`, `:39`**: `tXs` no longer lists chips; `tBase` does.

## 8. Proof: declared and painted agree, for both elements

Every run below is this worktree's own debug build, and says so on its own lines:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ad8549f666a0ee83b
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ad8549f666a0ee83b
build flavour: DEBUG (VITE_AURORA_DEBUG=1 at <the build stamp in the table>), so window.__dbg is in this bundle
```

| state of `Chip` | build (UTC) | chip census | chunk-links |
|---|---|---|---|
| master's (the defect) | 22:57:18 | 5/10: S1, aeon.1, classic.1, sprite.1, canvas.1 red | 11/12: 4b red |
| **the fix** | 23:41:10 | **10/10** | **12/12** |
| M1: `font: 'inherit'` put back after the button's spread | 23:46:08 | 5/10: the same five red | 11/12: 4b red |
| M2: `font: 'inherit'` on the span | 23:49:39 | 2/4 (`PART=static,aeon`): S1, aeon.1 red | not run |
| restored from HEAD, rebuilt (final) | 23:50:57 | **10/10** | **12/12** |

**Row `[4b]`, before and after.** Before, on master's `Chip`, under the new derivation (commit `91b93a81`),
the same reading the 2026-09-12 run took:

```
FAIL  [4b] ... declared T.tXs var(--text-xs-size)="11px" computed="13px" inherited="13px" inline font-size="inherit"
```

After the fix, and again on the final rebuild:

```
PASS  [4b] ... declared T.tBase var(--text-base-size)="13px" computed="13px" inherited="13px" inline font-size="var(--text-base-size)"
```

**Its derivation changed, and the red was re-established before the fix, not assumed** (bar 7e). It used
to read `--text-xs-size` by name, which would have gone on measuring the old token after the primitive
moved. It now reads the token `Chip` declares out of `primitives.tsx` (`scratchpad/lib/chip-declared-size.mjs`,
the parser the census uses, in the tree the run BUILT), reads that token's px from the live document, and
adds a second clause: the button's inline font-size must read back as that token's `var()`. **Under M1 it
went red on that clause alone**, `declared "13px" computed "13px" inline font-size="inherit"`. The declared
and inherited sizes are both 13 in that panel now, so a returning shorthand paints the same px, and only
the inline value shows it.

**The census rows, under each mutation, shown on disk before the red run:**

```
M1  primitives.tsx:296:        ...style, font: 'inherit', fontFamily: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit',
M2  primitives.tsx:277:  if (!onClick) return <span title={title} style={{ ...style, font: 'inherit' }}>{children}</span>;
```

(each `git diff --stat`: 1 file changed, 1 insertion, 1 deletion). Under M1, every button reads `inline
font-size=inherit` and the option-bar chips fall back to 11px: 331 of 336, 207 of 207, 135 of 135 and 110
of 110 chip-screens disagree. Under M2 exactly the 5 SPAN chip-screens disagree (the two Detach spans, and
"pan to move" on three screens), computed 13px but inline `inherit`, **which is what shows the rows reach
the span branch.** Each mutation was undone by writing `git show HEAD:<path>` over the file (never `git
checkout --`), `git diff` then read empty, and the tree was rebuilt before the next run.

**After, in numbers:** 92 distinct chips, all 13px; 788 chip-screens, all 13px; the same 95 screens and the
same 92 chips as before, so only the sizes moved. The call-site join reads 63 at 13px and the same 10 not
rendered, and the source prediction now reads 13px for all 73 sites.

**The other instruments moved onto the same derivation, and run:** `chunk-row9-probe.mjs` (a copy of 4b)
went 11/12 with 4b red under M1 and 12/12 on the final build. `cdp-sweep-4-0912-harness.mjs` `PART=stamp`
on the final build: 7/7 rows, `CL.FONT` FINDING-HOLDS at T.tBase. Its old regex spelled out the `font:
'inherit'` shorthand, so it would have thrown the day the defect was fixed. CL.FONT is report-only and
compares px only, so it cannot see M1 (13 equals 13), and it was not run under a mutation.

## 9. Suite and gates

`VITEST_MAX_WORKERS=4 npm test` on the final tree: every gate script and `typecheck` pass (the chain
reaches vitest only if they do). Vitest: **Test Files 1 failed | 617 passed | 3 skipped (621); Tests 8
failed | 9595 passed | 9 skipped (9612).**

**The 8 are all in `src/core/formats/effects/__tests__/section-wiring.test.ts`, "against aeon's real
ojz/act1"** (for example `section 5 owns its preset: expected 'no' to be 'yes'`), and **they are not this
parcel's.** The control: the base commit's (`09e8675f`) versions of the only two `src` files this branch
changes, written into the tree, give the same 8 failures against the live aeon. Against archive copies of
aeon `1b414115` and `55c062a4` the file fails 9. The ninth was not diagnosed; the likely cause is a file
the live tree has and an archive lacks. The file imports no renderer code. Reported, not fixed.

## 10. Captures

`docs/captures/2026-09-13-chip-font-majority/`: `before__*.png` and `after__*.png`, 19 each, the same screens
in the same run order. Each is clipped to the union of the chips' rects on that screen, so a pair can
differ in extent where a chip grew. Worth looking at first:

- `*__sprite__document.png`: the option bar (16 24 32 48 64, New, Fit, Copy, Cut, Paste) grows; the header's
  Undo, Redo, Save do not.
- `*__canvas__new_256x256.png`: the canvas option bar (Fit, 8, 16, 256, Constraints, Clashes).
- `*__aeon__Layout_tool_Stamp_Chunk.png`: the two Detach spans, 11px to 13px.
- `*__aeon__Effects_Tile_anim_band.png`: the Effects option bar, and the band card's Hide.
- `*__aeon__Layout_layout_.png`: the level header, which does NOT change: a control pair.

`census-before.json` and `census-after.json` are the two runs' raw records.

## 11. Noticed, not fixed

- **The span branch has no `lineHeight: 1`; the button has.** At 13px a span chip is taller than a button
  chip, so the Detach chips change height when hovering turns them from span to button. That was true at
  11px too.
- **`BandPresetPanel`:** after New created `chip_census` (the id field cleared), none of the preset editor's
  chips mounted. Not diagnosed. `AnchorSweepPreview` and `CommitPlanView`'s palette offers were never rendered.
- **Running `cdp-sweep-4` writes timestamped PNGs into the committed `docs/captures/2026-09-12-cdp-sweep-4/`.**
  This run's four were deleted, not committed.
- `check-harness-guards` prints a G9 note that `scratchpad/preset-schema-key-probe.mjs` is registered and
  never prints PASS. It is untracked in this worktree, and not this parcel's.
- **aeon's `origin/master` moved during the session** (`1b414115` to `55c062a4`). The copies differ only in
  two aeon docs files, so every run here saw the same project data.
- **The owner has not seen these captures.** The visible change is the 35 chips at 11px growing to 13px.
