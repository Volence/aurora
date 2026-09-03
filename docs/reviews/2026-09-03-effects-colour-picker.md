# EW-COLOUR-PICKER — defect 13's colour half

**Branch** `feat/effects-colour-picker`, cut from master `98b83106`.
**Commits** `2e84bc7e` (the feature and its node gates), `a4ce2b54` (the CDP
instrument and a third rot of one selector), plus this packet.
Measured 2026-09-03 on this machine (`up 8 days, 22:31`, load 4.45/6.25/6.99 at
the first harness launch).

---

## 1. What the defect was, in the reader's own words

`docs/reviews/2026-09-02-effects-cold-walkthrough.md`, observations a12 and a13,
rolled up as defect 13. Its band-preview half is `NO_PREVIEW`, a standing ruling,
and **nothing here builds one**. Its colour half was NOT REACHED by wave 1:

> **a12** — `colours` wants a decimal integer and there is no colour picker. […]
> To find out what a colour looks like I opened the shipped `Authored probe (red
> / blue)` preset and read its numbers: `14` and `3584`. Those are Genesis CRAM
> words in decimal. An author must know the BBB GGG RRR packing **and** convert
> it to base 10, by hand, in an application that has a full palette editor one tab
> away. Nothing offers a swatch.
>
> **a13** — `addr = 74` and no idea what that is. […] There is no "palette line 2,
> entry 5" rendering of it anywhere, though the panel elsewhere is happy to render
> a line mask as `L0 L1 L2 L3` chips.

Both are answered. **The wire format does not move**: `colours` is still an array
of decimal integers, `addr` is still a byte address, and both raw controls are
still there and still typeable. That is ROADMAP row 97's precedent applied a
second time — *one toggle flips one bit, the readout prints the integer*.

The band card as it now draws, from this run's own capture
(`scratchpad/shots-band-preset/3-band-card.png`):

```
    addr    [ 74 ]   line 2 · entry 5
    colours [ 14                    ]
            ▪                              <- 16px swatch, selected
            ┌───────────────────────┐
            │ Colour 0       $000E  │      <- the app's own GenesisColorSliders
            │ R ━━━━━━━━━━━━●    7  │
            │ G ●━━━━━━━━━━━━    0  │
            │ B ●━━━━━━━━━━━━    0  │
            └───────────────────────┘
            1 colour — also the derived restore's word count.
```

---

## 2. The `addr` derivation, and where it comes from

**Not typed in from a neighbouring pin.** Three constants and one function now
live in `src/core/formats/palette.ts`, beside the rest of the Genesis word
arithmetic:

```
CRAM_LINE_ENTRIES = 16     colours in one CRAM line (VDP)
CRAM_WORD_BYTES   = 2      one entry is one 16-bit word
CRAM_LINE_COUNT   = 4      lines the CRAM holds
cramLocation(addr) -> { line, entry, aligned, inCram } | null
```

> **The unit is BYTES and that is the whole trap.** `addr` is a CRAM *byte*
> address (`$defs.cram.properties.addr`: "CRAM BYTE address the colours are
> written to"); an entry is a *word*. So the divisor between an address and a line
> is `CRAM_LINE_ENTRIES * CRAM_WORD_BYTES` = **32, not 16** — an implementation
> reading "16 colours per line" off the palette editor and dividing by 16 lands
> two lines out.

so, from the constants alone:

```
    entryIndex = floor(addr / CRAM_WORD_BYTES)  = floor(74 / 2)  = 37
    line       = floor(entryIndex / 16)         = floor(37 / 16) = 2
    entry      = entryIndex % 16                = 37 % 16        = 5
```

→ `addr = 74` renders as **`line 2 · entry 5`**, which is the sentence a13 asked
for.

**And it is cross-checked against a second, independent statement of the same
geometry.** The vendored contract schema states it as two shift formulas, written
for a different purpose (the engine's agreement check between `addr` and
`pal_region`'s own `pal_line`/`entry` keys) by a different author in a different
repo:

```
  $defs.pal_region.properties.pal_line.description:
      "must agree with addr's line (addr >> 5 == pal_line)"
  $defs.pal_region.properties.entry.description:
      "must agree with addr's entry ((addr >> 1) & 15 == entry)"
```

`src/core/formats/__tests__/cram-geometry.test.ts` **parses those two formulas out
of the vendored bytes** and evaluates them against `cramLocation` over every even
address in CRAM. `1 << 5 == 32` is the same 32 the constants produce. Two
independent statements, cross-checked; neither is this parcel's opinion.

⚠ **The parse is itself asserted** (row 1 of that file), because a regex that
stopped matching would make every row after it agree about an empty set.

**The gloss reads the ADDRESS, never a sibling key.** On `pal_region` the obvious
shortcut is to print the file's own `pal_line`/`entry` — that would print what the
document *claims* rather than what the address *says*, and the schema's word for
those keys is that they "must AGREE with addr", which means a document can be open
while they do not. `addrGloss` takes one number and there is no key to read.

**The three abnormal addresses are named, never rendered as a plausible
location** (a confident "line 6 · entry 5" for an address the engine will refuse
is worse than the silence it replaces):

| address | gloss |
|---|---|
| negative | `not a CRAM address` |
| odd (e.g. 75) | `line 2 · entry 5 — odd byte, not a word boundary` |
| past line 3 (e.g. 128) | `line 4 · entry 0 — past CRAM's 4 lines` |

`LINE_LENGTH` (palette-grid-model) and `CRAM_LINES` (effects-preset) now READ
these constants instead of restating `16` and `[0, 1, 2, 3]`.

---

## 3. The four section-height numbers, and the panel width

Measured by `scratchpad/band-preset-harness.mjs` rows `[4b0]` and `[4c2]`, which
are **new in this parcel and were run against BOTH builds** — the same instrument,
two builds of `src/`, not a number quoted from a packet. `[4b0]` is taken before
anything opens the section, which is the only moment in the run when it is shut.

| | before (master `98b83106` src) | after (this branch) |
|---|---|---|
| **`Preset — <id>` section, SHUT** | **31 px** | **31 px** — did not move |
| `Preset — <id>` section, OPEN | 545 px | 565 px (+20) |

The shut number is the one the constraint is about, and it did not move — for a
structural reason, not a lucky one: `CollapsibleSection` renders
`<div>{header}{!collapsed && children}</div>`, so a shut section has **no body in
the DOM at all**. The rows assert `childElementCount === 1` alongside the height,
because a height alone cannot tell *shut* from *open-and-empty* and would report a
flattering figure for the second.

The open section grows by **20 px** for a one-colour band: a 16 px swatch plus the
row's own 4 px margin. Growth is per band card, not per section, and only for a
`cram` arm.

**Panel width — nothing moved, and nothing needed to.** `LABEL_W` is still 64 and
this parcel did not touch `column-layout.tsx`. Both additions live in the
**control** column:

| row `[7d2]` | measured, live | |
|---|---|---|
| `addr` label width | **64.00 px** | exactly `LABEL_W`; asserted, not eyeballed |
| `addr` spinner `min` / `max` | `null` / `null` | still unclamped (aeon §E.4) |
| row `[7d3]` addr row right edge | 1372 px | vs card right edge 1377 px — inside |

The swatch strip takes **zero** label-column width: it is a block at
`CONTROL_INSET` (`calc(64px + s2)`), which is the gutter every hint in this column
already hangs off. The gloss is the third item in a row that already had two.

**No new section**, so `src/renderer/providers/effects-sub-tabs.ts` needed no
entry — everything added is inside `aeon.effects.preset.bands`, already declared
there on the `colour` job. The harness clicks that sub-tab (`SUBTAB('colour')`)
before any DOM query, as it already did.

---

## 4. Every check, with its poison

Four poisons. Each is shown **applied on disk** (the mutated line quoted back from
the file, or `git diff` naming it), run **red**, and restored with `git checkout
HEAD --` from the **committed** baseline `2e84bc7e` — never from a dirty tree.

### P1 — `CRAM_LINE_ENTRIES` 16 → 8

```
$ git diff --stat src/core/formats/palette.ts
 src/core/formats/palette.ts | 2 +-
$ grep -n "export const CRAM_LINE_ENTRIES" src/core/formats/palette.ts
102:export const CRAM_LINE_ENTRIES = 8;
```

**RED — 6 rows across both new files:**

```
 × every even address in CRAM lands where the schema formulas say
   AssertionError: addr 16: expected { addr: 16, line: 1, entry: +0 } to match { addr: 16, line: +0, entry: 8 }
 × the walkthrough's own address reads as the walkthrough's own sentence
   AssertionError: expected { line: 4, entry: 5 } to match object { line: 2, entry: 5 }
 × the divisor between an address and a line is entries x word bytes
   AssertionError: expected 16 to be 32
 × renders the walkthrough's `addr = 74` as a line and an entry
 × names the three abnormal cases instead of printing a plausible location
 × walks the address forward one WORD per colour, not one byte
 Test Files  2 failed (2)
```

**⚠ One row stayed green under P1 and that is correct, but it is worth saying
out loud**: *"every in-CRAM even address glosses as its own location and nothing
more"* derives BOTH sides from `cramLocation`, so it is a self-consistency row
about the gloss's *shape*, not about the geometry. It is the geometry rows that
carry the contract, and they went red. A packet that reported "P1 turned the file
red" without this distinction would be claiming coverage that row does not have.

Restored; `grep` shows `= 16`; **33 passed**.

### P2 — `setColourCommand` writes index 0 whatever it was asked for

```
$ git diff -U0 src/renderer/providers/effects-preset.ts
@@ -1079 +1079 @@ export function setColourCommand(
-    colours[at] = word;
+    colours[0] = word;
$ grep -n "colours\[0\] = word" src/renderer/providers/effects-preset.ts
1079:    colours[0] = word;
```

**RED — 3 rows:**

```
 × changes the entry it was given and no other
   AssertionError: expected [ 224, 3584, +0, 7 ] to deeply equal [ 14, 3584, 224, 7 ]
 × the same word again is a NO-OP — the double commit burns no undo slot
 × an untouched preset round-trips byte-identically through the picker path
 Tests  3 failed | 23 passed (26)
```

Restored; `grep` shows `colours[at] = word`.

### P3 — the span advisory's boundary, `<=` → `<`

```
$ git diff -U0 src/renderer/providers/effects-preset.ts
@@ -1109 +1109 @@ export function cramSpanAdvisory(
-  if (end <= CRAM_LINE_ENTRIES) return null;
+  if (end < CRAM_LINE_ENTRIES) return null;
```

**RED — exactly the boundary row, and only it:**

```
 × is silent while the span fits, and speaks on the first entry past the end
   AssertionError: expected 'preset "colour_probe" · Raster band 0…' to be null
 Tests  1 failed | 25 passed (26)
```

Restored.

### P4 — the `<ColourSwatches …/>` mount deleted from the panel

```
$ git diff -U0 src/renderer/components/effects/BandPresetPanel.tsx
@@ -1137,3 +1136,0 @@ function BandCard({
-          <ColourSwatches library={library} presetId={presetId} index={index}
-            addr={band.on.cram.addr} colours={band.on.cram.colours} run={run}
-            onEdited={() => setColoursText(undefined)} />
```

**RED:**

```
 × mounts the swatch strip with no guard other than the cram arm itself
   AssertionError: the swatch strip is not mounted at all: expected undefined to be defined
 Tests  1 failed | 25 passed (26)
```

⚠ **`tsc --noEmit` was CLEAN under P4** — the component became unreferenced and
nothing complained. That is exactly why a source-grep row exists beside the CDP
one: deleting the mount is a change the type-checker cannot see.

Restored; the mount is back at line 1137.

### P5 — `PLANT=rot-swatch`, in the CDP harness

The harness's own plant, pointing the swatch finder at
`[data-band-colours]` (an attribute the panel never writes) so it matches
nothing. Every row of section 7 reads that list, so a rot there is the worst thing
that can happen to the section:

```
$ PLANT=rot-swatch node scratchpad/band-preset-harness.mjs
PASS  [7a] ANTI-VACUOUS FLOOR: the band under test really carries a cram arm
FAIL  [7b] one swatch per colour — the count comes from the DOCUMENT, not from the DOM
HARNESS ERROR: Error: no swatches — the rest of section 7 cannot be measured
```

The floor caught it and the run **aborted** rather than passing eleven rows over
an empty list.

### P6 — the strongest one: the whole instrument, run against master's build

Not a mutation but a **paired build**. `src/` was checked out at master
`98b83106`, `electron-vite build` re-run, and the *same* harness file executed.
Section 7 went red at its floor and stopped:

```
### BEFORE RUN — src at master (98b83106), harness at HEAD
PASS  [7a] ANTI-VACUOUS FLOOR: the band under test really carries a cram arm
FAIL  [7b] one swatch per colour
        NO SWATCH MATCHED — selector rot, or the strip is not rendered
HARNESS ERROR: no swatches — the rest of section 7 cannot be measured
```

Then `src/` restored from the committed branch head, rebuilt, re-run: **43 rows,
3 failed** — and those three fail identically on master (see §6). Every row of
section 7 green. Both builds were made and run in **one session**; neither number
in §3 is quoted from anywhere.

### The runners these are wired into

| check | runner |
|---|---|
| `src/core/formats/__tests__/cram-geometry.test.ts` (7 rows) | `npm test` → `vitest run` |
| `src/renderer/providers/__tests__/effects-preset-colours.test.ts` (26 rows) | `npm test` → `vitest run` |
| `scratchpad/band-preset-harness.mjs` section 7 + rows 4b0/4c2 (13 new rows) | `npm run harness:band-preset` (already registered) |

---

## 5. Suite totals and `tsc`

Both sides run in this session, from this worktree, against a `node_modules`
symlinked from the main checkout.

| | before (master src) | after |
|---|---|---|
| `tsc --noEmit` | clean, RC 0 | clean, RC 0 |
| Test files | 471 passed, 2 skipped (473) | 473 passed, 2 skipped (475) |
| Tests | **6537 passed, 0 failed, 8 skipped** (6545) | **6570 passed, 0 failed, 8 skipped** (6578) |

`npm test` in full — the six static gates, `check-harness-guards`, `typecheck`,
`vitest` — is green:

```
check-test-collection: OK — 475 test-shaped file(s) on disk, all 475 collected by vitest.
check-pseudo-skip: OK
check-peer-path-literals: OK
check-object-stringify: OK
check-ledger-timestamps: OK
════ 190 clean / 190 classified (182 .mjs + 8 .sh) · 0 failure(s) · 0 unmeasurable ════
 Test Files  473 passed | 2 skipped (475)
      Tests  6570 passed | 8 skipped (6578)
skip-report: OK — every skip named its reason.
```

+33 rows: 7 geometry, 26 colours.

### The live run, in full

`npm run harness:band-preset`, `AEON_DIR` pointing at a committed-only copy of
aeon (see §8): **43 rows, 3 failed, 26.0 s.** The three failures are pre-existing
(§6). Section 7, verbatim:

```
PASS  [4b0] the band section is SHUT and is a header only — no body in the DOM
        SHUT HEIGHT = 31px, children=1
PASS  [4c2] the band section is OPEN and its body is in the DOM
        OPEN HEIGHT = 565px (shut was 31px), children=2
PASS  [7a] ANTI-VACUOUS FLOOR: the band under test really carries a cram arm
        on = {"cram":{"addr":74,"colours":[0]}}
PASS  [7b] one swatch per colour — the count comes from the DOCUMENT, not from the DOM
        1 swatches for 1 colours: [{"i":0,"bg":"rgb(0, 0, 0)","size":"16x16"}]
PASS  [7c] each swatch is PAINTED the colour its CRAM word decodes to (0BGR, re-derived here)
        [{"i":0,"want":"rgb(0, 0, 0)","got":"rgb(0, 0, 0)"}]
PASS  [7d] `addr` carries a derived `line N · entry M` gloss BESIDE the raw number (a13)
        addr=74 gloss="line 2 · entry 5" want="line 2 · entry 5"
PASS  [7d2] the addr spinner still carries NO min/max, and the label column did not move
        min=null max=null label "addr" = 64px
PASS  [7d3] the addr row does not overflow the band card it sits in
        row right 1372 vs card right 1377
PASS  [7e] the swatch is inside the PAINTED box of its scroller, at a real size
        {"rect":{"top":590,"left":1182,"w":16,"h":16},
         "scroller":{"top":106,"bottom":848,"left":1100,"right":1400},
         "inside":true,"trio":{"vis":true,"rects":true}}
PASS  [7f] clicking a swatch opens the app's own R/G/B sliders under the strip
        range inputs 0 -> 3
PASS  [7g] driving R to 7 writes the DOCUMENT — entry 0 only, every other entry untouched
        colours [0] -> [14]; R level of entry 0 = 7; drove=ok
PASS  [7g2] what it wrote is a plain decimal integer — the wire format did not move
        typeof entries: ["number"]
PASS  [7h] ONE Ctrl+Z restores the colour list exactly — one gesture, one step
        after undo [0], want [0]
PASS  [7i] the raw decimal list field is still there and shows the document, not a stale draft
        field = "14", document = "14"
PASS  [5b] aeon's shipped authored_probe.json is BYTE-IDENTICAL after a save
        484B before, 484B after
```

Two things in that block are worth naming:

- **`trio` is printed as EVIDENCE, never as the gate.** `checkVisibility()` and
  `getClientRects()` both return green for an element scrolled 2,635 px out of its
  scroller — measured in this repo. Row `[7e]` gates on the swatch's rect being
  contained in the **scroller's** box and prints the trio beside it.
- **`[7c]` re-derives the 0BGR decode inside the harness**, rather than importing
  the app's `swatchCss`. Checking the app's rendering against the app's own
  conversion would only prove it called its own function.

---

## 6. What was already broken — three rows, and one selector

**Rows `[3a]`, `[3b]`, `[3e]` fail identically on master's build and on this
branch.** They assert phrases in `PRESET_LIMITS` / `NO_PREVIEW`; the limit block
paints 875 characters of `innerText` in both runs, and rows `[3c]`, `[3d]`, `[3f]`,
`[3g]` pass in both. **Not this parcel's, not diagnosed here** — the paired
before/after run is the evidence that they are not mine. **TAGGED for the
controller.**

**And a third rot of one selector, found and fixed here.** The harness's
`BANDS_RE` was `/^Preset — <id>(?![a-z0-9_])/`, correct when one section carried
that prefix. There are now **three**:

```
    Preset — harness_bandDelete                     <- the bands editor
    Preset — harness_band — cycles, variants        <- ROADMAP row 97
    Preset — harness_band — moving anchors          <- ROADMAP row 95
```

`OPEN_SECTION` takes `.pop()` — the **last** match. So the harness had been
clicking the **moving anchors** header open and then looking for the band editor's
controls inside it. Rows `[4c]`, `[4d]`, `[4e]` and `[4f]` all failed, **naming the
controls** rather than the selector, on a panel where every one of them works:

```
FAIL  [4c] the band editor section opens          → open after settle = false
FAIL  [4d] editing `top` reaches the DOCUMENT     → set → no-element
FAIL  [4e] the band-line spinner carries NO min/max → null
FAIL  [4f] the ON-arm picker offers both arms     → null
```

Excluding a following **space** (`(?![a-z0-9_ ])`) keeps the two suffixed sections
out while still admitting any action label, which cannot begin with one. All four
rows pass on master's build with the fixed selector — which is how they are known
to have been a selector defect and not a product one. The harness's own comment
block now records all three rots.

⚠ **The shut/open heights from the first, unfixed run were 37 px and 269.5 px.**
They are the *moving anchors* section's, not the band editor's, and they are
recorded here only so nobody reconciles them with §3. §3's numbers are from the
fixed instrument, both builds.

---

## 7. The design calls, and why

The owner has ruled granular visual A/B calls the implementer's. Four were made.

**1 — The swatch is the app's existing swatch, at 16×16.** Border 1 px at
`T.border`, `borderRadius: 2`, colour through `swatchCss` — the exact values
`art-shared/PaletteGrid` draws, read off it rather than re-picked, so a colour
looks the same in the panel that authors it and the editor that owns the palette.
What is deliberately **not** copied is `flex: 1 1 0`: the grid divides a fixed 16
columns across its width, and this list has a length the *author* chose, so a
fixed 16 px that wraps keeps one colour one size whether the band writes one word
or twelve.

**2 — Inline, not a popover.** The picker is `GenesisColorSliders`, mounted under
the strip, which is what `PaletteGrid` does with the same component. This column
is a 300 px scroller: a popover in it has to be portalled, positioned against a
moving scroll offset, and dismissed — and each of those is a way for a control to
end up painted outside its scroller, which is the failure row `[7e]` exists to
catch. An inline panel cannot be anywhere but where its row is.

**3 — The `addr` gloss sits in the row, after the spinner.** `World Y` already
puts "px, level space" there and `Start at` puts "/256 of a cycle" there; the
label stays the schema's key at `LABEL_W`. Under it was rejected: it would be a
`Hint under` row, which in this panel is the *refusal* tier, and a permanent
warning-shaped line under a correct address would read as a problem.

**4 — It is a second way in, never a replacement.** The text field is untouched.
Beyond the row-97 precedent there is a mechanical reason: the list's **length** is
a second authored quantity — it is the derived restore's word count — the text
field is where it is authored, and a swatch strip that had to grow and shrink
would have quietly become the length control too. `setColourCommand` **refuses an
index the list does not reach** rather than extending it, and there is a test row
for that.

One consequence, handled: the text field keeps a local draft while typing, so a
swatch edit clears it (`onEdited`) and the box re-reads the document. Without it an
author who typed in the list and then picked a colour would watch the swatch change
under a box still showing what they typed — two sources of truth in one card. Row
`[7i]` is that check, live.

**No checker on index 0.** `PaletteGrid` draws entry 0 as a checker because the
VDP treats it as the backdrop; here the list index is a *position in the band's
write*, not a palette entry, so `colours[0]` is an ordinary colour. Which entry it
lands on is in the swatch's title, from the address.

### One addition beyond the letter of the defect, named

`cramSpanAdvisory` — a warning when `colours` runs past the end of its line. It is
here because the gloss makes the situation **visible** and staying silent about it
would be worse than before: the length is authored in one control and the address
in another, so the two can be individually reasonable and jointly refused, and
`stream_cram`'s value rules include "span within the line" (the schema's own
words). It is an **advisory, not a refusal** — the same line `parseColours` draws:
shape is refused, value is forwarded verbatim, because aeon §E.4 says a writer must
not range-check or clamp and the author is owed the engine's own refusal with the
measurement behind it. A test row asserts the command is **not** withheld.

---

## 8. Environment, and what was refused

- **No emulator, ever.** Nothing here ran a ROM, called an `mcp__oracle__*` tool,
  or built aeon. What a band looks like on a screen remains the one measured frame
  aeon parked at `4a4d3474`, and `NO_PREVIEW` still says so. **No preview was
  built** — the ruling stands.
- **No peer repo was written, and none was read by path.** The harness requires
  `AEON_DIR` to be a writable copy. It was materialised with
  `git -C <aeon> archive HEAD | tar -x -C <scratchpad>` — committed content only,
  at aeon `73b07a4f3ae375b994de3822a13fbcab647c830a`, into this session's
  scratchpad. The peer's working tree was never opened and never written.
- **The worktree was built, not borrowed.** A linked worktree has no
  `node_modules` and no `dist/`, so `runTarget` would otherwise have borrowed the
  main checkout's build and measured **the wrong tree**. `node_modules` was
  symlinked and `electron-vite build` run **here**; the harness's own banner
  confirms it each run:

  ```
  root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a9ce223ebaeed4b4f
        in-tree: … has node_modules/.bin/electron and dist/main/index.mjs
  ```

  Every build in §4/§5 was made in this worktree from the `src/` state named
  beside it.

### Open / TAGGED

1. **`[3a]` `[3b]` `[3e]` of `harness:band-preset` are RED on master.** Pre-existing,
   reproduced on both builds, not diagnosed here. They assert wording in
   `PRESET_LIMITS` / `NO_PREVIEW` that the constants appear no longer to carry.
   **TAGGED.**
2. **`colours` still cannot be lengthened from the swatch strip** — by design (call
   4). If the length is later wanted as a gesture, it belongs beside the field that
   owns it, with the restore-word-count consequence said out loud.
3. **Nothing was measured about `pal_region`'s `addr`/`pal_line`/`entry`
   disagreement beyond making it visible.** The gloss now shows the address's own
   answer next to the file's claim; no refusal was added, and none is proposed
   without a measurement of how often real documents carry one.
