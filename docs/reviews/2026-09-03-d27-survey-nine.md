# d-27, second wave — the survey's nine other controls act and then drop focus

**Branch** `fix/d27-survey-nine` · **Instruments**
`npm run harness:d27-sprite-focus` (**30 rows, 30/30**) and
`npm run harness:d27-effects-focus` (**19 rows, 19/19**), both registered in
`package.json` in the same commit that created them. `npm test` — **474 files
passed, 2 skipped (476); 6580 tests passed, 8 skipped (6588)**.

**Environment.** `ELECTRON_BIN` = the main checkout's `node_modules/.bin/electron`
(a linked worktree has no `node_modules` at all, so the missing binary is
invisible until the spawn); `AURORA_BUILT_TREE` = this worktree, which is what
makes a run measure THIS build. `VITE_AURORA_DEBUG=1 npm run build` before every
run. xvfb-run `1680x1050x24`. **dpr = 1 on every run below**; every aim rounded
to an integer client pixel and verified with `elementFromPoint` before it was
sent, and every one printed with its rect.

## What was ruled, and by whom

The owner ruled d-27 `blur_after_press` (empyrean `034ab6c`,
`docs/OVERSEER-LOG.md`): *"just being a button that acts and then drops focus is
how it should work right?"* It shipped for the two collision wipe buttons
(`docs/reviews/2026-09-03-d27-blur-after-press.md`, merge `d88b6c01`), whose
"Tagged, not fixed" section then surveyed the rest of `src/renderer/` and found
**nine more controls** carrying the same four properties.

Applying the same mechanism to those nine was ruled by the hub in the owner's
place under his 2026-09-02T20:25:12Z delegation. **It is the same mechanism he
already ruled on, not a fresh look or taste call**, and it is overturnable on
his read-back.

**No dialogs, no confirmations, no toasts** — the options d-27 did not pick.

## The helper moved

`actAndDropFocus` shipped inside `src/renderer/components/CollisionPalette.tsx`
because both of its callers were there. It is now
`src/renderer/components/ui/act-and-drop-focus.ts`, beside `focus-trap.ts` — the
precedent for a focus rule that belongs to the app rather than to one consumer.
**The semantics did not move**: the blur is still unconditional and still runs
BEFORE the action, and the whole reason why is now written once instead of
paraphrased per caller.

`Chip` and `IconButton` now **forward the click event**. React always handed it
to those handlers — `onClick` goes straight onto the `<button>` — but the
declared type was `() => void`, and TypeScript will not accept a one-parameter
callback where a zero-parameter one is declared, so a destructive caller could
not reach `e.currentTarget`. Widening is purely additive; every existing
`() => …` caller still fits. Five of the nine sites are Chip/IconButton callers,
so without this none of them could have been wired at all.

## The nine, and what each one is

Every line number below was **re-grepped** against the tree at the time of the
edit; the survey warned its own were a snapshot, and by then two files had moved.

| # | Site | Writer | Rows |
|---|---|---|---|
| 1-5 | `shell/SpriteToolOptions.tsx` — the size-preset chips | `newSprite` | `[sp1-a..d]` |
| 6 | `shell/SpriteToolOptions.tsx` — `New □` | `newSprite` | `[sp2-a..d]` |
| 7 | `components/sprite/FrameGrid.tsx` — Delete | `deleteFrame` | `[fg-a..d]` |
| 8 | `components/sprite/SpritePaletteHeader.tsx` — Clear palette | `clearPalette` | `[pal-a..d]` |
| 9 | `components/sprite/SpritePaletteHeader.tsx` — Clear canvas | `clearCanvas` | `[can-a..d]` |
| 10 | `components/sprite/Timeline.tsx` — remove step × | `removeStep` | `[tl-a..c]` |
| 11 | `components/effects/EffectsScenePanel.tsx` — Remove layer | `removeLayerCommand` | `[esp-a..e]` |
| 12 | `components/effects/BandPresetPanel.tsx` — Remove raster band | `removeBandCommand` | `[bnd-a..e]` |
| 13 | `components/effects/BandPresetPanel.tsx` — Remove cycle channel | `removeCycleChannelCommand` | `[cyc-a..e]` |

(The survey counts the five size-preset chips as one site because they are one
`.map`; they are one dispatch line and one row family here too. `New □` is a
separate dispatch line twenty lines away and gets its own.)

### The two that are worse than what d-27 was ruled on

**`SpriteToolOptions`'s chips.** `newSprite` replaces the whole sprite document
— every frame, every anim step, the origin — **and calls
`activeSpriteHistory().clear()`** (`state/spriteStore.ts:637`). Unlike the
collision wipes, which are one Ctrl+Z away, **this is not recoverable at all**.
The chips are permanently mounted in the option bar, so before this a click left
one focused and a bare Space threw the document away again with nothing to undo
with. `[sp1-a]` prints `canUndo=true → false` across the click, measured.

⚠ **`newSprite` is UNTOUCHED and that is deliberate.** These chips drop focus and
nothing else. Whether a new-sprite wipe should be undoable is a separate design
question and it is already filed as **d-29** (master `204825c3`), the owner's to
answer.

**`BandPresetPanel`'s Remove cycle channel** is the purest instance of the shape
anywhere in the survey: no `disabled` predicate, no refusal, no confirmation, and
a schema that accepts an empty `cycles` list by design. Nothing at any count
stopped a held Space walking the whole channel list away.

## The retarget property — the `key={i}` list-removal family

Four of the nine (`Timeline` ×, `Remove layer`, `Remove raster band`, `Remove
cycle channel`) live in lists keyed by INDEX. The button does not unmount with
the item it deleted: React re-uses the same DOM node for the item that slid down
into slot `i`. **So a repeat Space did not repeat the action, it RETARGETED it at
the neighbour** — a sharper failure than a repeat-fire, because the second victim
is not the one the author looked at.

It is measured two different ways, and the difference is the point:

- **By CONTENT** at `[tl-c]`. The run clears the S1 document's own steps and
  builds four with **distinct frame indices**, so "removed the neighbour" and
  "removed the same one again" are distinguishable. It then clicks slot 0 twice
  at the same pixel and asserts the second click removed **the frame that was at
  index 1**.
- **By DOM NODE IDENTITY** at `[esp-e]`, `[bnd-e]`, `[cyc-e]`. `Add layer`,
  `Add raster band` and `Add channel` produce **identical** items, so a content
  comparison there is undecidable and would look like it had measured something.
  The element is latched before the click and compared with `===` after it.

## The `[k7]` row — five sites have one, four cannot, and that is a finding

`[k7]` is *a press that changes NOTHING still drops focus*. It is the row the
owner's ruling actually rests on and the only row a cheaper implementation —
blur inside each handler, after its early returns — fails. It needs **a press an
author can actually perform that writes nothing**.

**Five sites have one**, and the rows say which mechanism supplies it, because
"no-op" by two different mechanisms is not one fact:

- **`[fg-d]` is the sharpest row in the parcel.** `deleteFrame` opens
  `if (s.frames.length <= 1) return`. The run reaches that state through `New □`,
  so the document has an **empty history**: `canUndo` and `unsavedEdits` are both
  false before the press and both still false after it. A press that had reached
  `recordEdit` would have flipped **both**, which is what proves the early return
  really ran rather than the handler acting and happening to write the same bytes.
- **`[sp1-d]` / `[sp2-d]`** — `newSprite` has no early return; it is IDEMPOTENT,
  and a second press at the same size rebuilds a byte-identical blank document.
  Said out loud in the row.
- **`[pal-d]` / `[can-d]`** — no early return either; the no-op press is a second
  consecutive one over already-blank state. The row asserts the document
  fingerprint and **deliberately not** `canUndo`/`unsavedEdits`, which a second
  press does still move because `recordEdit` runs.

**Four sites have none, and the runs say so in a NOTE rather than shipping a row
that would be green by construction:**

| Site | Why no reachable no-op press |
|---|---|
| `Timeline` × | the button exists only while a step exists at `i`, and `removeStep` has no early return |
| `Remove layer` | `removeLayerCommand` has three null paths and `editSceneCommand` a fourth — the scene exists, the index is in range because the card renders it, the splice always changes the document, and the floor is EXACTLY the predicate that DISABLES the button |
| `Remove raster band` | same shape: `bands.length <= 1` is both the null return and `lastBandRefusal`'s disable predicate |
| `Remove cycle channel` | `removeCycleChannelCommand` no-ops only for a `cycles` that is not an array, or an index out of range — neither of which can render a card |

A disabled button fires no `onClick`, so in every one of those four the
unconditional press is unreachable by design. What carries the unconditional half
there is the **shared helper**, which blurs before `act()` and therefore cannot
be skipped by a return that has not run yet — and **plant P8** below, which kills
the `[k7]`-shaped row at the one site where a no-op press IS reachable.

## Red-first

Eleven plants. Every one applied on disk (`git diff --stat` plus the added line
quoted back), typechecked, **built, and grepped in `dist/` to prove it reached
the bundle the run then executed**, and every one restored with
`git checkout HEAD -- <file>` from a **committed** baseline, with `git status`
printed after the restore. `npx tsc --noEmit` clean on every planted tree.

| Plant | What it does | On disk | In `dist/` | Result |
|---|---|---|---|---|
| **P1** | the size-preset chips lose the blur | `<Chip key={s} onClick={() => st().newSprite(s, s)}>{s}</Chip>` | `onClick: () => st().newSprite(s, s)` | **`[sp1-a..d]` RED**, 26/30 |
| **P2** | `New □` loses the blur | `<Chip onClick={() => st().newSprite(newSize, newSize)}>New □</Chip>` | `onClick: () => st().newSprite(newSize, newSize)` | **`[sp2-a..d]` RED**, 26/30 |
| **P3** | FrameGrid Delete loses the blur | `onClick={() => …deleteFrame()}>Delete</button>` | `onClick: () => useSpriteStore.getState().deleteFrame()` | **`[fg-a..d]` RED**, 26/30 |
| **P4** | Clear palette loses the blur | `onClick={() => st().clearPalette()}` | `onClick: () => st().clearPalette()` | **`[pal-a..d]` RED**, 26/30 |
| **P5** | Clear canvas loses the blur | `onClick={() => st().clearCanvas()}` | `onClick: () => st().clearCanvas()` | **`[can-a..d]` RED**, 26/30 |
| **P6** | Timeline × loses the blur | `onClick={() => …removeStep(i)}>×</button>` | `onClick: () => useSpriteStore.getState().removeStep(i)` | **`[tl-a] [tl-b] [tl-c]` RED**, 27/30 |
| **P7** | **the SHARED HELPER stops blurring** | `if (String('PLANT_P7_NO_BLUR') === '') e.currentTarget.blur();` | `PLANT_P7_NO_BLUR` | **23 rows RED, 7/30** — every measurement row at all six sprite sites |
| **P8** | **the CHEAPER DESIGN** at FrameGrid Delete: blur only on the acting path | `onClick={(e) => { const s = useSpriteStore.getState(); if (s.frames.length > 1) e.currentTarget.blur(); s.deleteFrame(); }}` | `if (s.frames.length > 1) e.currentTarget.blur()` | **`[fg-d]` RED ALONE**, 29/30 |
| **P9** | Remove layer loses the blur | `onClick={() => run(removeLayerCommand(library, selected.id, i))} />` | `onClick: () => run(removeLayerCommand(library, selected.id, i))` | **`[esp-a] [esp-b] [esp-c]` RED**, 5/8 — `[esp-e]` survives |
| **P10** | Remove raster band loses the blur | `onClick={() => run(removeBandCommand(library, presetId, index))} />` | `onClick: () => run(removeBandCommand$1(library, presetId, index))` | **`[bnd-a] [bnd-b] [bnd-c]` RED**, 16/19 — `[bnd-e]` and **every `[cyc]` row** survive |
| **P11** | Remove cycle channel loses the blur | `onClick={() => run(removeCycleChannelCommand(library, presetId, index))} />` | `onClick: () => run(removeCycleChannelCommand(library, presetId, index))` | **`[cyc-a] [cyc-b] [cyc-c]` RED**, 16/19 — `[cyc-e]` and **every `[bnd]` row** survive |

**P1-P6 and P9-P11 are the isolation proof, and it is the whole point.** Nine
near-identical dispatch lines is this repo's dominant shape for a fix wired to
one of two call sites surviving a convincing green. Each plant reddens **only its
own site's rows** — including P4/P5, which are four lines apart in one file, and
P10/P11, which are two `IconButton`s in one file three hundred lines apart. No
row rides on another: every one resolves its own element through an in-page
handle table, aims at it, and refuses if `elementFromPoint` lands elsewhere.

**P7 is the "is this harness measuring anything" control.** With the helper's
blur gone, 23 of the 30 sprite rows die; the 7 survivors are the boot rows, the
four anti-vacuous fixture rows and `[z1]`, none of which assert focus.

**P8 is the design argument, made measurable.** The cheaper implementation —
blur inside the handler, after the early return — passes `[fg-a]`, `[fg-b]` and
`[fg-c]` and fails `[fg-d]` alone. That is the whole case for blurring
unconditionally, and it is a row rather than a paragraph. It is the direct
descendant of P9 in the first d-27 packet.

**`[esp-e]`, `[bnd-e]` and `[cyc-e]` correctly SURVIVE their own site's plant.**
They measure the retarget by DOM node identity, which a lost blur does not touch.
A retarget row that went red under a blur plant would be measuring the blur.

### ⚠ Two things the red-first found that review would not have

**`[esp-c]` was green for the FLOOR's reason, not d-27's.** Under P9 on a
three-layer fixture, `[esp-a]` and `[esp-b]` went red and `[esp-c]` stayed
**green**. The reason has nothing to do with the ruling: the second consecutive
removal lands ON the schema floor (`EFFECTS_LAYER_COUNT.min` = 1), the button
greys out, and **a disabled button never takes focus**. "activeElement is not the
button" was true because the control had been switched off. Fixed twice over —
the fixture is now four layers, and `[esp-c]` now **asserts the button is still
enabled after the click**, because the fixture size alone would drift silently
the day the floor moves. `[bnd-c]` carries the same clause for the same reason.
Re-measured with the plant re-applied: all three red.

**A colliding export renamed a plant out of the `dist/` grep.**
`providers/bg-anim-aeon.ts` also exports a `removeBandCommand`, so the bundle
spells the preset one `removeBandCommand$1`. P10's first `dist/` check reported
NOT FOUND and **the driver refused to run** rather than executing a bundle it
could not prove carried the plant — which is the guard working. A driver that had
only checked the source would have run, produced a red, and attributed it to a
plant that may or may not have been in the bundle. The corrected grep found it
and P10 ran.

## The node row

`src/renderer/components/__tests__/d27-act-and-drop-focus.test.ts` — nine rows,
and **read what it is**: a SPELLING PIN, not a behaviour gate. The node suite
cannot see React, a DOM or a click, so nothing in it can prove the blur runs, that
it runs unconditionally, or that any button still works. It exists for the failure
the CDP harnesses cannot catch — a refactor that drops the wiring and never runs a
harness. `npm test` runs; a CDP harness does not run itself.

The site list is **written down** rather than discovered by grepping for
`actAndDropFocus`: a grep for the helper can only find files that still use it,
which is green by construction on exactly the regression it watches for. It also
pins `Chip`/`IconButton`'s widened `onClick`, because tidying those back to
`() => void` silently unwires five of the nine at compile time.

`collision-destructive-wording.test.ts`'s helper probe is re-pointed at the new
module **and now also pins the import in `CollisionPalette.tsx`** — without that
second pin, a helper that exists but is no longer reached from the palette would
pass. The helper is still located by **slice, not regex**: `[^)]*` for the
parameter list stops inside the `act: () => void` parameter's own parens and
reports the helper ABSENT while it is sitting right there.

## The six the survey excluded — two confirmed, four DISPUTED, and the four are now FIXED

> ## ✅ AND THE FOUR ARE NOW WIRED — 2026-09-03
>
> `docs/reviews/2026-09-03-d27-four-survivors.md`, instrument
> `npm run harness:d27-four-survivors` (20 rows, 20/20, five plants), applies
> `actAndDropFocus` to all four of the disputed controls. **The exclusion list
> in this section is therefore down to TWO** — `AeonChunkActions.tsx`'s `Clear`
> and `SectionGridNav.tsx`'s `Remove`, the two whose self-unmounting this
> section's successor confirmed by clicking.
>
> One thing that parcel found which neither reading did: **`Remove`'s refusing
> press is the only honest `[k7]` in the whole d-27 arc** — a press an author
> can really perform that writes nothing at all — and the cheaper
> blur-only-on-the-acting-path design fails exactly that row and no other
> (its plant P5). The four rows this file marked as having no reachable no-op
> press keep that status; three of the four new sites have none either, and
> those are NOTEs rather than rows.
>
> ⚠ `Clear`'s missing undo is **d-30**, still the owner's, and untouched.

> ## ⚠ THIS SECTION IS SUPERSEDED BY A MEASUREMENT — 2026-09-03
>
> Everything below is a **second code read**, and it says so itself at the end
> ("the honest next step is a harness row on each, not an edit made on a code
> read"). That harness now exists:
> **`docs/reviews/2026-09-03-d27-disputed-six.md`**, instrument
> `npm run harness:d27-disputed-six` — all six clicked with real mouse input,
> 31 rows 31/31, seven plants each reddening only its own site.
>
> **The dispute below is UPHELD on all four**, and with two facts the read could
> not reach: all four **keep keyboard focus**, and the two Delete buttons keep it
> **retargeted at a different document**. `Demote` needs a successor band before
> the question is even meaningful (with one band it unmounts, which is the
> agreed arm); `Remove`'s press *after* the refusal refuses again and destroys
> nothing, and the confirmation chip does not take focus.
>
> ⚠ **A finding neither pass looked for: `AeonChunkActions.tsx`'s `Clear` wipes
> 71 chunks and ONE Ctrl+Z DOES NOT BRING THEM BACK** (`clearChunks` is a bare
> zustand `set`, not `executeCommand`). Its exclusion from d-27 is correct; it is
> the d-29 class, and it is the owner's call.


The survey excluded six controls because their handler unmounts them, so the
defect cannot fire. **None of them was changed here.** Reading the code for this
parcel, two of those exclusions hold and **four do not**, and they are written
down rather than quietly acted on.

**Confirmed — these really do unmount themselves:**

- `components/AeonChunkActions.tsx:34` — `{hasChunks && <button onClick={clearChunkLibrary}>Clear</button>}`.
  Clearing sets `hasChunks` false and the button goes with it.
- `components/SectionGridNav.tsx:238` — `doRemove` calls `setMenu(null)`
  unconditionally, and the whole context menu is behind `{menu && …}`.

**Disputed — the survey's classification is right only in one arm:**

- **`effects/EffectsScenePanel.tsx:855` (Delete scene)** and
  **`effects/BandPresetPanel.tsx:382` (Delete preset)** unmount only when the
  deleted document was the LAST one. Both sections are gated on `selected`, and
  `resolveSelectedScene` / `resolveSelectedPreset` **fall back to element 0**
  (`providers/effects-aeon.ts:2521`, `providers/effects-preset.ts:492`). With
  another document present, `selected` becomes `library[0]`, the
  `CollapsibleSection` keeps its stable `id`, React re-uses the same DOM button,
  and it keeps focus **with its label silently retargeted at a different
  document**. That is the retarget shape, on a delete.
- **`effects/BgAnimBandPanel.tsx:567` (Remove tile animation)** does not unmount
  on the press that matters. Its first press asks the command, which REFUSES when
  map cells draw the band; on that path it applies nothing, sets `refusalText` and
  `pendingRemoval`, and **the button stays mounted with focus on it**. That press
  changes nothing in the document — the `[k7]` case exactly — and the confirmation
  chip it reveals is a second, different control.
- **`effects/BgAnimBandPanel.tsx:564` (Demote)** never unmounts either;
  `demoteBandCommand` hands the slots back to the static blob and the key-indexed
  card list shifts, same shape.

**These are reported, not fixed.** The parcel's remit was the nine, and four
of these six are a different reading of someone else's survey rather than
something measured under a click — the honest next step is a harness row on each,
not an edit made on a code read. `BgAnimBandPanel:567` is also the file the
first packet held up as the pattern worth copying, which makes changing it on a
reading rather than a measurement exactly the wrong move.

## What is NOT here

- **`newSprite`'s recoverability** — d-29, master `204825c3`, the owner's.
- **No dialogs, confirmations or toasts.** Not chosen by d-27.
- **The six excluded controls** — unchanged *by this parcel*, including the four
  disputed above. ⚠ **Four of them were wired on 2026-09-03**
  (`docs/reviews/2026-09-03-d27-four-survivors.md`); the two that really do
  unmount themselves are still unwired and correctly so.
- **No emulator.** Nothing here touched `mcp__oracle__*`.
- **Nothing saved.** Neither harness issues a save and the app has no autosave
  (`shell/close-guard.ts`). The sprite run edits an S1 document in memory and —
  via `[sp2]` — throws it away, which IS the writer under test; `[z1]` prints
  `spriteSaveInfo`. The effects run creates its probe scene and preset through the
  panels' own New buttons and takes both back through the app's history; `[z1]`
  and `[z2]` re-read the libraries and assert they hold exactly the documents the
  run opened on.
