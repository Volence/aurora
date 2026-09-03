# d-27 — the two wholesale collision buttons act and then drop focus

**Branch** `fix/d27-blur-after-press` · **Commits** `29819885` (fix + harness),
`dd37171f` ([k7] + a log trim) · **Instrument**
`npm run harness:collision-destructive` — **30 rows, 30/30**, registered in
`package.json` since O48b.

**Environment.** `ELECTRON_BIN` = the main checkout's `node_modules/.bin/electron`
(this worktree has **no `node_modules` at all** — npm resolves up for everything
else, so the missing binary is invisible until the spawn);
`AURORA_BUILT_TREE` = this worktree, which is what makes the run measure THIS
build and not the main checkout's — `resolveRunRoot`'s walk would otherwise climb
three levels and find the shared checkout runnable. `VITE_AURORA_DEBUG=1 npm run
build` before every run. xvfb-run `1680x1050x24`. **dpr = 1** on every run below;
Clear's button rect `33.90625x17` at `1249.125,217` → integer client
`(1266,226)`, Reset's `36.125x17` at `1209,217` → `(1227,226)`. Every aim rounded
to an integer and verified with `elementFromPoint` before it was sent.

## The ruling, and the half of it I am not touching

The owner ruled d-27 `blur_after_press` (empyrean `034ab6c`,
`docs/OVERSEER-LOG.md`):

> *"5. I think just being a button that acts and then drops focus is how it
> should work right? What do the wipes do exactly that you need a wipe collision
> clear/reset?"*

The first sentence selects the option. **The second sentence is a question about
what the buttons are FOR, and this parcel does not answer it and does not change
what they do** — it is the overseer's to answer. Nothing about either button's
reach, wording, undo behaviour or toast moved here.

## The defect

Measured 2026-09-02 (O48b, row `[k2]`): after a real mouse click on `Reset` or
`Clear`, the button **kept keyboard focus** — `document.activeElement` was that
`<button>` — and a bare **Space** then re-fired the whole wholesale wipe with no
confirmation. **Enter did not**, over the same CDP input channel, which is why it
read as an accident rather than a design. Both wipes are one Ctrl+Z away and the
undo restores the plane exactly, unowned bits included, so this was a surprise
and not a data-loss risk. d-27 chose the smallest fix over a dialog.

## What changed

`src/renderer/components/CollisionPalette.tsx` — one new module-level helper and
the two `onClick`s that use it:

```ts
function actAndDropFocus(e: React.MouseEvent<HTMLButtonElement>, act: () => void) {
  e.currentTarget.blur();
  act();
}
```

**The blur is unconditional, and it runs BEFORE the action.** Both handlers carry
silent early returns (`clearSection`'s `if (!entries.length) return`,
`resetToEngine`'s `if (!engine) return` and its own `!entries.length`), and the
no-op press is exactly the case where a repeat Space is most pointless and least
noticed: the author cannot tell "already at the baseline" from "the click did not
register" (that is `[r7]`'s finding, still booked and still not fixed here).
Blurring only on the path that wrote something would leave the defect alive in
the half an author cannot see. Doing it FIRST rather than after `act()` is what
makes "unconditional" true by construction instead of by every future edit
remembering it, and neither handler reads focus. **`[k7]` is the row that gates
this**, and it is the only row the cheaper implementation fails — see the plants.

**No dialog, no confirmation, no toast** — the options d-27 did not pick.
Clicking again still works normally (`[k6]`); a keyboard-only author reaches the
button again with Tab, which is the cost the decision card already priced.
`Ctrl+Z` is unaffected: `LevelWorkspace`'s `isTypingTarget` lets the undo through
from `<body>` for the same reason it exempts `<button>`, and `[c8]` measures that
rather than reading it.

**Scope: these two buttons only.** See "Tagged, not fixed" below.

## The rows

Five new, one retired, one reworded — 26 → 30.

| Row | What it asserts |
|---|---|
| `[k3]` | after a REAL click, **Clear** does not keep focus — **and the same click still wiped**. The second half is IN THE CONDITION: a `disabled` or unwired button does not take focus either, so a focus row alone is satisfied by a broken control. |
| `[k4]` | the same for **Reset**. Its own row because the two `onClick`s are two separate dispatch lines, and a fix wired to one of two near-identical call sites is this repo's dominant way for a defect to survive a convincing green. |
| `[k5]` | a bare **Space** straight after the click changes **nothing** on the plane (Enter sent too). |
| `[k6]` | a **second real click** still fires the wipe and drops focus again — the anti-cheat row. |
| `[k7]` | **d-27 is UNCONDITIONAL**: a press that changes nothing (second consecutive Reset, the `!entries.length` early return) still drops focus. |

`[k5]` carries **its vacuity guard in the condition**, not in prose. Immediately
after the Clear click the plane is all zeros, and `clearCollisionEntries` on an
empty plane returns no entries — so a Space that DID re-fire Clear would change
nothing and the row would pass having proved the opposite of what it claims. The
Ctrl+Z before it is therefore not tidying: it is what gives the key something to
destroy, and `preSpace.nonzero > 0` is asserted so the guard cannot silently stop
holding. That same Ctrl+Z is the **positive control** for the green — it travels
the identical `Input.dispatchKeyEvent` channel as the Space, and it put 1794
cells back, so keystrokes are demonstrably arriving.

`[k7]` asserts `noopDiff.changed === 0` alongside the focus fact, so a press that
quietly started acting again would stop being the no-op path rather than pass as
one.

### `[k2]` — PREMISE RETIRED (not tuned green)

**What it measured.** The buttons were ordinary `<button>`s, so once clicked one
kept keyboard focus and the platform's own activate-on-Space applied to a
wholesale destructive writer that asks for no confirmation. `[k2]` clicked Clear,
took it back with Ctrl+Z, sent bare Enter and bare Space at the still-focused
button, and asserted the thing that decided how bad it was: **the keyboard-fired
wipe is exactly as recoverable as the clicked one** — one Ctrl+Z, plane whole,
`canUndo` back where it started. Space re-fired it; Enter did not.

**Why the premise is gone.** `actAndDropFocus` blurs unconditionally as the
button fires, so **there is no longer a keyboard-fired wipe** whose
recoverability `[k2]` could measure.

**Why RETIRED and not re-authored into the positive form.** Re-pointing it at
"the keyboard-fired wipe is undoable" would assert a property of an event that
cannot occur — green by construction, measuring nothing. That is precisely the
vacuity this file already paid for once at `[c4]`, where a plant that wiped the
WRONG SECTION stayed green because the destination held nothing to destroy. Its
subject is consumed, not merely inverted, so it is retired with the full
accounting written where it lived, and deliberately not deleted in silence.

**What is not lost with it.** The undo property `[k2]` asserted still has an
owner: `[c8]`/`[c9]` prove one Ctrl+Z restores a CLICKED wipe exactly, unowned
bits included, and `[c10]`/`[r9]` pin the one-command-per-press half. Nothing
that only `[k2]` covered has gone unmeasured.

### `[c8]` — reworded, because d-27 changed what it measures

`[c8]` used to say the Ctrl+Z was *"pressed with focus still on the button, as a
person would"*, and it proved `isTypingTarget`'s `<button>` exemption in passing.
The Ctrl+Z now arrives from `<body>`. **What the row asserts is unchanged** (one
undo, plane exact) and it now PRINTS the measured `activeElement` beside the
result, so the day either half moves again it is visible in the output rather
than inferred from a comment. The `<button>` exemption is still live and still
matters for every other button in the app; these two simply do not hand it
anything any more. Said out loud rather than quietly left true-sounding.

### `[k1]` — checked, unchanged, and its scope now stated in the row

`[k1]` sends Delete/Backspace/Enter/Space/Escape/x and two modified Deletes one
at a time **with focus proved off the buttons first**, and asserts none reaches
either writer. That claim still means what it says: it is about a **global** key
path (a window listener), which is a different mechanism from the focused
button's own activation. Since d-27, Space cannot reach a writer by either road,
so `[k1]`'s Space is now **over-determined** — and neither row subsumes the
other: a stray window listener would redden `[k1]` alone, a lost blur `[k5]`
alone. The row's detail now says this, because a green that is true for two
reasons is one regression away from being read as covering both.

## Red-first

Every plant applied on disk, **the built bundle grepped to prove it arrived**,
the harness re-run, then the file restored with `git checkout dd37171f --` from
the **committed** baseline. `npx tsc --noEmit` clean on every planted tree.

| Plant | On disk | In `dist/` | Result |
|---|---|---|---|
| **P6** Clear's onClick loses the blur | `<button onClick={clearSection} title={…}` | `onClick: clearSection` | **`[k3]` `[k5]` `[k6]` RED**, 27/30 — `[k4]` `[k7]` stayed green |
| **P7** Reset's onClick loses the blur | `<button onClick={resetToEngine} title={…}` | `onClick: resetToEngine` | **`[k4]` `[k7]` RED**, 28/30 — the Clear rows stayed green |
| **P8** Clear still blurs but does NOTHING | `if (1) return; // PLANT P8` at the top of `clearSection` | the bundler folded the body away entirely: `function clearSection() {}` | **`[k3]` `[k6]` RED** (plus `[c1]` `[c2]` `[c5]` `[c7]` `[c10]`), 23/30 |
| **P9** blur only on the ACTING path | `if (plantP9Acted) e.currentTarget.blur();` after `act()`, with `plantP9Acted = true` set past each early return | `function actAndDropFocus(e, act) { plantP9Acted = false; act(); if (plantP9Acted) e.currentTarget.blur(); }` | **`[k7]` RED ALONE**, 29/30 |

**P6 and P7 are the pair that matters most**, and they are deliberately separate:
each reddens only its own button's rows, which is what proves `[k4]` is not
riding on `[k3]`. Two near-identical dispatch lines with a fix on one of them is
the shape this repo loses defects in.

**P8 is why `[k3]` and `[k6]` are not focus-only rows.** A button that is wired,
takes the click, blurs, and does nothing would satisfy a naive "activeElement is
not the button" assertion perfectly. It does not satisfy these two.

**P9 is the design argument, made measurable.** The cheaper implementation —
blur inside each handler after its early returns — passes `[k3]`, `[k4]`, `[k5]`
and `[k6]` and fails `[k7]` only. That is the whole case for blurring
unconditionally, and it is now a row rather than a paragraph.

Restored tree, final run: **30/30**, dpr = 1, the same two integer aims.

## The node row that went red, and why that was the row working

`src/renderer/components/__tests__/collision-destructive-wording.test.ts` carries
an **anti-vacuity probe** that pins the literal `onClick={resetToEngine}` /
`onClick={clearSection}`, so the wording assertions below it cannot pass over a
file that no longer contains the buttons. Routing both onClicks through
`actAndDropFocus` made those exact strings stop existing and **the row failed by
name** — which is the probe doing its job, not collateral. It is **re-pointed at
the new spelling**, not loosened to a regex that could never notice again.

One row added beside it, with its limits stated in the file: both buttons go
through the helper, the helper blurs, and **the blur is before the action**. It
is a **spelling pin, not a behaviour gate** — the node suite cannot see React, a
DOM, or a click. Red-first, on that file alone:

| Plant | Result |
|---|---|
| **R1** the helper stops blurring (`act();` only) | RED — *expected `function actAndDropFocus(…` to contain `.blur()`* |
| **R2** the blur moves AFTER `act()` | RED — *expected 110 to be less than 86* |
| **R3** Clear's onClick loses the helper (P6's spelling) | RED — the anti-vacuity probe, by name |

The helper is located by **slice, not regex**: `[^)]*` for the parameter list
stops inside the `act: () => void` parameter's own parens and reports the helper
ABSENT while it is sitting right there — a false negative that reads exactly like
the defect the row watches for. Found by writing the regex first and reading the
red, and the reason is written into the test.

## Suite

`npm test` — **473 files passed, 2 skipped (475); 6571 tests passed, 8 skipped
(6579)**. Aggregate, not a tail excerpt. Every skip names its reason; the eight
are the pre-existing opt-in rows (`AURORA_FG_GATE_FILE`, `AURORA_BENCH`,
`AURORA_LIVE_S1_WARP`, and two `s4_engine` fixtures that are gone from this
machine). The node/vitest suite **cannot see React, canvas, or a running app**,
which is why the CDP harness above is the proof and this is only the floor.

## Tagged, not fixed

> ## ⚠ THIS SECTION IS CLOSED — DO NOT ACT ON IT
>
> **All nine were fixed on 2026-09-03**, branch `fix/d27-survey-nine`, under the
> hub's ruling in the owner's place: the same mechanism he had already ruled on,
> applied to the same shape. The successor packet is
> **`docs/reviews/2026-09-03-d27-survey-nine.md`** and it supersedes everything
> below — read it before booking anything from this list.
>
> What it carries that this section does not:
>
> - `actAndDropFocus` **moved** to `components/ui/act-and-drop-focus.ts`; `Chip`
>   and `IconButton` now forward the click event, without which five of the nine
>   could not have been wired at all.
> - Two harnesses, `harness:d27-sprite-focus` (30/30) and
>   `harness:d27-effects-focus` (19/19), plus **eleven plants** — one per site,
>   each reddening only its own site's rows, and a P8 that kills the `[k7]` row
>   alone under the cheaper blur-on-the-acting-path design.
> - **`[k7]` exists at five of the nine and cannot exist at the other four**, and
>   the four are named with the reason. That was not visible from the survey.
> - **Four of the six "unmount themselves" exclusions below are DISPUTED** — the
>   two effects Delete buttons unmount only when deleting the LAST document
>   (`resolveSelected*` falls back to element 0), and BOTH `BgAnimBandPanel`
>   controls stay mounted, including `:567` on its refusing press. Disputed with
>   evidence and **not acted on**; the successor packet says why.
> - `newSprite`'s recoverability is **d-29** (master `204825c3`), the owner's,
>   and this parcel did not touch `newSprite`.

**The same `<button>`-keeps-focus shape elsewhere.** d-27 surveyed these two
controls and ruled on these two, and the owner is mid-project on something else,
so nothing outside `CollisionPalette.tsx` was touched. A read-only survey of
`src/renderer/` looked for the same four properties (destructive, no confirm,
natively focusable, no blur). It is recorded here for the overseer to book or
decline, not acted on.

**The count needs its axis, or it is not a count.** The survey tracked one thing
I did not expect to matter: **does the button survive its own click?** A control
whose handler unmounts it — the list empties, the selection clears — loses focus
to `<body>` on its own, and **the d-27 defect does not reproduce there at all**.
So of the controls carrying the shape:

- **9 stay mounted and DO reproduce it** — `shell/SpriteToolOptions.tsx:56` and
  `:67`, `sprite/FrameGrid.tsx:53`, `sprite/SpritePaletteHeader.tsx:81` and
  `:88`, `effects/EffectsScenePanel.tsx:506`, `effects/BandPresetPanel.tsx:1016`
  and `:719`, `sprite/Timeline.tsx:182`.
- **6 unmount themselves and do NOT** — `AeonChunkActions.tsx:34`,
  `SectionGridNav.tsx:238`, `effects/EffectsScenePanel.tsx:855`,
  `effects/BandPresetPanel.tsx:382`, `effects/BgAnimBandPanel.tsx:564` and `:567`.
  Listed so nobody re-finds them and books work that has nothing to fix.

**List-item buttons keyed by index are the worst case** — the button stays
mounted *and now points at the next item*, so a repeat Space does not repeat the
action, it **retargets** it at the neighbour.

The two families worth looking at first:

- **`src/renderer/shell/SpriteToolOptions.tsx:56` and `:67`** — the size-preset
  chips and `New □` call `newSprite()`, which replaces the whole sprite document
  (every frame, every anim step, the origin) **and calls
  `activeSpriteHistory().clear()`** (`state/spriteStore.ts:634`), so unlike the
  collision buttons it is **not one Ctrl+Z away**. The chips are permanently
  mounted in the option bar. This is strictly worse than what d-27 fixed.
- **the `key={i}` list-removal family** — `EffectsScenePanel.tsx:506` (remove
  layer), `BandPresetPanel.tsx:1016` (remove raster band) and `:719` (remove
  cycle channel), `sprite/Timeline.tsx:182` (remove step). All undoable, all
  cheap to fix the same way, and all with the retarget-on-repeat property above.

⚠ **These line numbers are a snapshot of a tree that is moving.** Re-grep before
acting on any of them; the survey is a map, not a work order.

Also found, and worth copying rather than fixing: **`BgAnimBandPanel.tsx:567`**
already does the right thing without a dialog — the first press *refuses* if map
cells reference the band and returns the count, and only removes outright when
nothing does.

Excluded, with reasons, so they are not re-found: `ProjectSetupTab`'s `Apply`,
tab close, project open and document activation all route through
`state/confirmStore.ts`; `SpriteMode`'s open/load buttons overwrite wholesale but
raise a native file picker first, so a stray Space opens a dialog rather than
losing work. There is **no `window.confirm` anywhere in `src/renderer/`**, and no
`role="button"`/`tabIndex={0}` fake buttons carrying destructive handlers — the
`Chip` and `IconButton` primitives both render real `<button>`s.
- **`[r7]`'s silent no-op press** (an author cannot distinguish "already at the
  baseline" from "there is nothing to reset to") is unchanged and still booked.
  d-27 is about focus, not about signalling.
- **The owner's second sentence** — what the wipes are for — is unanswered here
  on purpose.
- **No emulator.** Nothing here touched `mcp__oracle__*`.
- **Nothing was saved.** No Ctrl+S, no save call; the app has no autosave. The
  twelve poked fixture cells are restored and the restoration is asserted
  (`[z1]`), and `[z2]` re-reads the whole plane against the words each run opened
  on — 0 differing, on every run above.
