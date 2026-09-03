# d-27's four survivors act and then drop the keyboard — and the strongest of them was never a repeat-fire

**Branch** `fix/d27-four-survivors` · **Instrument** `npm run harness:d27-four-survivors`
(`scratchpad/d27-four-survivors-harness.mjs`, registered in `package.json` in the
same commit as the file) — **20 rows, 20/20** on the restored committed baseline.

**Environment.** `ELECTRON_BIN` = the main checkout's `node_modules/.bin/electron`
(a linked worktree has no `node_modules`); `AURORA_BUILT_TREE` = this worktree, so
every run measures THIS build. `VITE_AURORA_DEBUG=1 npm run build` before every
run, including every planted one. xvfb-run `1680x1050x24`. **dpr = 1 on every run
below**; every aim rounded to an integer client pixel and verified with
`elementFromPoint` before the press, each printed beside its row.

---

## What was ruled, and by whom

The owner ruled d-27 `blur_after_press` (empyrean `034ab6c`, `docs/OVERSEER-LOG.md`):
*"just being a button that acts and then drops focus is how it should work
right?"* It shipped for the two collision buttons
(`docs/reviews/2026-09-03-d27-blur-after-press.md`) and then for nine more
(`docs/reviews/2026-09-03-d27-survey-nine.md`). **Six controls were excluded as
self-unmounting; `docs/reviews/2026-09-03-d27-disputed-six.md` clicked all six
and found FOUR of those exclusions wrong.** This parcel applies the same
mechanism to those four.

Applying it was **ruled by the hub in the owner's place** under his
2026-09-02T20:25:12Z delegation — the same mechanism he already ruled on, not a
fresh look or taste call, and overturnable on his read-back.

**No dialogs, no confirmations, no toasts** — the options d-27 did not pick.

---

## ⚠ THE TWO DELETES ARE NOT A REPEAT-FIRE, AND THAT IS WHY THIS IS NOT COSMETIC

Measured on the unfixed build and re-measured here: the **same DOM node**
(`===`, latched before the click, never re-queried by selector) had its
`aria-label` go

```
"Delete scene d4_probe_scene"  →  "Delete scene ojz_act1_depth"
```

with `document.activeElement` still on it. `resolveSelectedScene` falls back to
`library.scenes[0]` because the store's selected id is still the deleted
document's. **A bare Space on that still-focused button does not re-delete the
document that is gone — it deletes a different file.** `BandPresetPanel` is the
same shape, and sharper: its `disabled={deleteRefusal !== null}` guard is
re-derived for the NEW target, so the guard is live for a document the author
never chose (`[bpd-b]` prints the post-click button as
`{"aria":"Delete preset authored_probe","disabled":false}`).

**The retarget is still there after the fix, deliberately.** It is a SELECTION
question, and d-27 did not rule on it; what is gone is the keyboard sitting on
it. `[esd-b]` and `[bpd-b]` measure the retarget and **say nothing about focus**,
so they survive every blur plant below — a retarget row that reddened under a
blur plant would be measuring the blur.

---

## The four, and the rows that cover each

Line numbers re-grepped on master `a2fb4a0d` immediately before the edit; the
disputed-six packet's own numbers had already moved once, which is why each is
stated with its symbol beside it.

| # | Site | What changed | Rows |
|---|---|---|---|
| 3 | `effects/EffectsScenePanel.tsx:867` — Delete scene | `onClick={(e) => actAndDropFocus(e, () => run(deleteSceneCommand(library, selected.id)))}` | `[esd-0]` `[esd-a]` `[esd-b]` `[esd-z]` |
| 4 | `effects/BandPresetPanel.tsx:407` — Delete preset | `onClick={(e) => actAndDropFocus(e, () => run(deletePresetCommand(library, selected.id)))}` | `[bpd-0]` `[bpd-a]` `[bpd-b]` `[bpd-z]` |
| 5 | `effects/BgAnimBandPanel.tsx:566` — `Demote` | the existing two-statement body wrapped, unchanged | `[dem-fix]` `[dem-0]` `[dem-a]` `[dem-b]` `[dem-z]` `[dem-z2]` |
| 6 | `effects/BgAnimBandPanel.tsx:569` — `Remove` | the whole handler wrapped, **refusal included** | `[rem-0]` `[rem-a]` `[rem-k7]` `[rem-z]` |

`BgAnimBandPanel` gains the import; `EffectsScenePanel` and `BandPresetPanel`
already had it. `IconButton` already forwards the click event (the nine-parcel's
widening), so no primitive changed here.

**Semantics untouched.** `actAndDropFocus` still blurs **unconditionally** and
still blurs **BEFORE** the action. Nothing in `components/ui/act-and-drop-focus.ts`
was edited.

### ⚠ #5 and #6 are a near-identical pair in one `Row`

Two `IconButton`s two lines apart, both reading like the other. A fix — or a
plant — landing on the wrong one survives a full build-and-run cycle looking
convincing. Three things stop that here: each is addressed by its **own full
`aria-label`** in the harness's handle table, never by position; **P3 and P4
below redden only their own control's row** in both directions; and the node
pin's Remove row is a **slice** from that button's label to its writer, with an
explicit assertion that the slice does not contain `demoteBandCommand`.

### ⚠ #5's fixture is half the row

The open aeon document carries **one** band. Demoting the only band empties the
list, card 0 has nothing to shift into it, and the button unmounts — which is
the arm both prior code reads already agreed on and proves nothing about the
dispute. `[dem-fix]` promotes a second band through the panel's own `Promote`
chip and **asserts `bands >= 2` before anything below is believed**; `[dem-z2]`
takes that Promote back so the override document ends on the bytes the run
opened it with.

---

## The `[k7]` row — one of the four has one, three cannot, and that is stated rather than papered over

`[k7]` is *a press that changes NOTHING still drops focus*. It is the row the
owner's ruling actually rests on and the only one a cheaper implementation —
blur inside the handler, after its early returns — fails. It needs a press an
author can really perform that writes nothing.

**`Remove`'s refusing press is one, and it is the best instance in the whole
d-27 arc.** `[rem-k7]` asserts, in one condition: bands `1 → 1`, `bgOverrideHash`
**1422319328 → 1422319328** byte-identical, the confirmation control on screen
(so the handler ran rather than the click missing), the button **still mounted
and the same node**, and `document.activeElement` **not that button**.

**The other three have no reachable no-op press, and the run says so in a NOTE
rather than shipping a row that would be green by construction:**

| Control | Why no honest `[k7]` exists |
|---|---|
| Delete scene | `deleteSceneCommand`'s only null path is "no scene with this id", and the button renders only inside `{selected && …}` — i.e. only for a scene that IS in the library |
| Delete preset | same null path, plus `disabled={deleteRefusal !== null}` — and **a disabled button fires no `onClick`**, so a row built on that floor passes however the code behaves. Exactly the shape the nine-parcel refused for `Remove layer` and `Remove raster band` |
| `Demote` | `demoteBandCommand` refuses only with no document loaded (the panel does not render then) or when `planBandDemotion` throws for a static-blob capacity reason — constructing which means **writing to the sibling aeon checkout**, which decision d-28 forbids this run |

The unconditional half at those three sites is carried by the shared helper
(blur before `act()`, so a return that has not run yet cannot skip it) and by
**plant P5**, which kills the `[k7]`-shaped row at the one site where a no-op
press IS reachable.

---

## ⚠ Every row asserts the button was ENABLED, and every focus row asserts the click really acted

Both are lessons from prior parcels, and both are in the conditions rather than
in prose beside them.

- **`[esp-c]` passed in the nine-parcel because the button had greyed itself out
  at a list floor** — and a disabled button never takes focus either, so the row
  proved nothing about d-27. Every `-0` row here asserts `disabled === false`,
  `visible === true` and PRESENT at the instant of the click, and prints the full
  reading; `[bpd-0]` is the one that matters most, because that control really
  does have a `disabled` predicate. `clickHandle` refuses outright if the integer
  aim does not land inside the button it means.
- **A plant that made a control do nothing left a pure focus row green in both
  prior parcels** (the disputed-six packet's P4). So `[esd-a]` carries "and the
  scene really left the library", `[bpd-a]` "and the preset really left it",
  `[dem-a]` "one band fewer AND `bgOverrideHash` changed", and `[rem-k7]` "and
  the confirmation the refusal reveals is on screen".

---

## Red-first

Five plants. Every one applied on disk (`git diff --stat` naming exactly one
file, plus the mutated line quoted back), `npx tsc --noEmit` clean, **built and
grepped in `dist/` to prove the mutation reached the bundle the run then
executed**, run, and restored with `git checkout HEAD -- <file>` from the
**committed** baseline (`0038cf86`). **The FIRST run of each plant is the one
reported.**

| Plant | What it does | On disk | In `dist/` | Result |
|---|---|---|---|---|
| **P1** | Delete scene loses the blur | `onClick={() => run(deleteSceneCommand(library, selected.id))} />}>` (`EffectsScenePanel.tsx:875`) | `onClick: () => run(deleteSceneCommand(library, selected.id))` present ×1; `actAndDropFocus(e, () => run(deleteSceneCommand` ×**0** | **`[esd-a]` RED ALONE**, 19/20 |
| **P2** | Delete preset loses the blur | `onClick={() => run(deletePresetCommand(library, selected.id))} />` (`BandPresetPanel.tsx:415`) | `onClick: () => run(deletePresetCommand(library, selected.id))` ×1; helper form ×**0** | **`[bpd-a]` RED ALONE**, 19/20 |
| **P3** | `Demote` loses the blur | `onClick={() => { setPendingRemoval(null); apply(demoteBandCommand(doc, b.index)); }}` | `onClick: () => {\n setPendingRemoval(null);\n apply(demoteBandCommand(doc, b.index));` — helper+demote ×**0**, helper+remove still ×1 | **`[dem-a]` RED ALONE**, 19/20 — **`[rem-k7]` stayed GREEN** |
| **P4** | `Remove` loses the blur | `onClick={() => {` … `const r = removeBandCommand(doc, b.index, false);` | bare `onClick: () => { const r = removeBandCommand(doc, b.index, false)` ×1; helper+remove ×**0**, helper+demote still ×1 | **`[rem-k7]` RED ALONE**, 19/20 — **`[dem-a]` stayed GREEN** |
| **P5** | **THE CHEAPER DESIGN** at `Remove`: blur only on the path that WROTE something | `if (r.ok) { e.currentTarget.blur(); setPendingRemoval(null); apply(r); return; }` | `if (r.ok) {\n e.currentTarget.blur();` ×1 | **`[rem-k7]` RED ALONE**, 19/20 |

**P3 and P4 are the pair proof, and they are the reason this parcel is not one
plant short.** Two `IconButton`s two lines apart in one `Row`: P3 reddens
`[dem-a]` and leaves `[rem-k7]` green, P4 reddens `[rem-k7]` and leaves
`[dem-a]` green. Neither row is riding on the other's wiring.

**P5 is the design argument, made measurable rather than argued.** A perfectly
reasonable-looking implementation — blur inside the handler, on the branch that
actually removed something — passes `[rem-0]`, `[rem-a]` and `[rem-z]` and fails
`[rem-k7]` alone. That is the whole case for blurring unconditionally and
BEFORE the action, and it is the direct descendant of the nine-parcel's P8.

**`[esd-b]`, `[bpd-b]` and `[dem-b]` correctly SURVIVE their own site's plant.**
They measure survival and retarget by DOM-node identity, which a lost blur does
not touch.

**The node pin was also shown red.** Under P1, `d27-act-and-drop-focus.test.ts`'s
`EffectsScenePanel` row failed with *"lost the wiring at:
actAndDropFocus(e, () => run(deleteSceneCommand(library, selected.id)))"* while
the other eight rows stayed green.

---

## ⚠ The residual at #6 — recorded, not fixed, and not a card

The measurement established three things about `Remove`'s refusing press, and
they are all still true after this change: it **applies nothing**, the
confirmation chip that appears **does not take focus**, and the press after the
refusal **refuses again and destroys nothing** — the destructive path is a
second, different control (`Remove and blank those cells`).

What remains true, and is not addressed by dropping focus:

> **A destructive control the author did not ask for is now one Tab away, and
> the focused button gives no signal that it is there.**

Dropping focus stops a stray Space re-asking a question that has already been
answered. It does not announce the new control. That is a legibility
observation, not a data-loss one; it is booked here and in the harness's own
`[rem-k7]` detail line, and **no fix was built for it and no card was opened.**

---

## The node row

`src/renderer/components/__tests__/d27-act-and-drop-focus.test.ts` — **11 rows**,
and read what it is: a **SPELLING PIN, not a behaviour gate**. The node suite
cannot see React, a DOM or a click, so nothing in it can prove a blur runs. It
exists for the failure a CDP harness cannot catch — a refactor that drops the
wiring and never runs a harness.

Three things changed in it:

- The three sites gain their new calls, and `BgAnimBandPanel.tsx` is a new entry.
- **Fragments are matched against a whitespace-NORMALISED source.** Two of the
  four new handlers are blocks that prettier wraps; a raw `toContain` on a
  multi-line fragment pins the FORMATTER, and a reflow would redden this file
  while the blur is still there.
- **`Remove` is pinned by SLICE, not by a fragment.** Two comment blocks sit
  between its `actAndDropFocus(e, () => {` and the `removeBandCommand` it wraps,
  so no contiguous fragment holds both halves — and a fragment covering only the
  first half would pass on a handler wired to the WRONG writer, which is exactly
  how a near-identical pair loses a fix. The slice runs from that button's own
  `aria-label` to its writer and additionally asserts it does **not** contain
  `demoteBandCommand`.

The header's stale exclusion paragraph is rewritten: two of the survey's six are
still correctly absent (they really do unmount), and the other four are now
listed.

---

## Suite

`npm test` — see the RED-MASTER note below.

The node suite **cannot see React, a DOM or a click**, so it is the floor and not
the proof: `npm run harness:d27-four-survivors` is what measured every claim in
this file.

### ⚠ MASTER WAS ALREADY RED WHEN THIS BRANCH STARTED

Two files fail on master `a2fb4a0d` — `effects-preset-schema-drift` and
`effects-preset-vectors` — because empyrean published a new contract; the gate's
own text says **NOT AN AURORA REGRESSION**, and a separate parcel is
re-vendoring it. **This branch touches nothing in `src/core/formats/`,
`src/renderer/providers/effects-preset.ts` or any vendored schema/vector file**,
and the two failures reproduce identically here. They are reported separated out
so the number is readable against the red baseline.

## What is NOT here

- **`AeonChunkActions.tsx`'s `Clear` — untouched, and deliberately.** It really
  does unmount itself, so d-27 does not apply; its problem is that Ctrl+Z does
  not undo it, which is **d-30**, open with the owner. Neither `clearChunks` nor
  `projectStore.ts` was opened.
- **`SectionGridNav.tsx`'s `Remove` — untouched.** The other confirmed
  self-unmounting exclusion.
- **The retarget itself.** Both Deletes still rename under the author's cursor.
  That is a selection question, d-27 did not rule on it, and inventing an answer
  here would be exactly the "second question" the disputed-six packet declined to
  answer.
- **No dialogs, confirmations or toasts.** Not chosen by d-27.
- **No emulator.** Nothing here touched `mcp__oracle__*`.
- **Nothing saved, and no sibling checkout written to.** The harness opens `aeon`
  read-only and issues no save; the app has no autosave (`shell/close-guard.ts`).
  The probe scene and preset are created through the panels' own `New` buttons
  and unwound through the app's own history — `[z1]` asserts both libraries end
  holding exactly the documents the run opened on.
