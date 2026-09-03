# d-27's six excluded controls, clicked — four of the six exclusions are wrong, and one of them has no undo

**Branch** `test/d27-disputed-six` · **Instrument** `npm run harness:d27-disputed-six`
(`scratchpad/d27-disputed-six-harness.mjs`, registered in `package.json` in the
same commit as the file) — **31 rows, 31/31** on the restored committed baseline.
**Nothing was fixed here. This row is the measurement.**

> ## ✅ THE FOUR THIS FILE FOUND WRONG ARE NOW FIXED — 2026-09-03
>
> The four exclusions this packet disputed and measured
> (`EffectsScenePanel`'s Delete scene, `BandPresetPanel`'s Delete preset, and
> both `BgAnimBandPanel` controls) **all go through `actAndDropFocus` now**:
> `docs/reviews/2026-09-03-d27-four-survivors.md`, instrument
> `npm run harness:d27-four-survivors` (20 rows, 20/20, five plants — including
> the pair proof that reddens `Demote` and `Remove` independently of each
> other, and the cheaper blur-only-on-the-acting-path design failing
> `[rem-k7]` alone).
>
> **The two exclusions this file CONFIRMED are still correct and still
> unwired** — `AeonChunkActions.tsx`'s `Clear` and `SectionGridNav.tsx`'s
> `Remove` really do unmount themselves. §"Recommendation" below is updated in
> place.
>
> ⚠ `Clear`'s missing undo — the finding at the top of this file — is **NOT**
> closed by that parcel. It is **d-30**, open with the owner, and neither
> `clearChunks` nor `projectStore.ts` was touched.

**Environment.** `ELECTRON_BIN` = the main checkout's `node_modules/.bin/electron`
(a linked worktree has no `node_modules`); `AURORA_BUILT_TREE` = this worktree, so
the run measures THIS build. `VITE_AURORA_DEBUG=1 npm run build` before every run,
including every planted one. xvfb-run `1680x1050x24`. **dpr = 1 on every run
below**; every aim rounded to an integer client pixel and verified with
`elementFromPoint` before the press — each one is printed beside its row.

---

## ⚠ STOP HERE FIRST — one of the six is destructive and is NOT one Ctrl+Z away

**`components/AeonChunkActions.tsx` `Clear` wipes the whole aeon chunk library and
the undo does not bring it back.** Measured, not read:

```
[chk-a]     chunk library 71 → 0 on one real click
[chk-UNDO]  chunk library 71 → 0 → 0 after one Ctrl+Z
[chk-z]     restored only by RE-OPENING the project from disk — a reload, not an undo
```

`clearChunkLibrary` (`providers/chunk-library-import.ts:78`) calls
`useProjectStore.getState().clearChunks()`, which is a bare zustand `set`
(`state/projectStore.ts:105`) and never reaches `executeCommand`. The store says
so itself three lines above, about the *other* direction: *"Library adds are
additive and live outside undo history, like addChunks … so an un-undoable add is
non-destructive."* That reasoning is sound for an **add**. The **removal** inherits
the same un-undoable path and is not non-destructive.

It is a single unconfirmed click, next to `Import`, on a header that is on screen
whenever the chunk-stamp tool is armed. **This is the d-29 class — recoverability,
the owner's call — and it is reported rather than fixed.** It is *not* a d-27
finding: the button genuinely does unmount itself (`[chk-a]`), so a bare Space
cannot re-fire it. The two questions are independent and this control fails the
second one.

Its blast radius is bounded in one way worth stating: nothing is written to disk.
The wipe is in memory, the app has no autosave (`shell/close-guard.ts`), and a
`Ctrl+S` afterwards is what would make it permanent.

---

## The dispute, and why reading could not settle it

Both `docs/reviews/2026-09-03-d27-blur-after-press.md` ("Tagged, not fixed") and
its successor `docs/reviews/2026-09-03-d27-survey-nine.md` list **six controls
excluded from d-27 because they unmount themselves** — the button disappears when
its own handler runs, so it loses focus to `<body>` on its own and the defect
cannot fire. The second pass then **disputed four of the six**. Neither pass
clicked anything.

**All six were clicked.** Each was first put into the state where the button would
**survive** its own press — which for four of them is the *whole* question, because
the arm both passes agree on (delete the last document, demote the only band) is a
different arm and was never the disputed one.

---

## What was measured

| # | control (re-grepped on `1ea99dfa`) | prior claim | **MEASURED** |
|---|---|---|---|
| 1 | `AeonChunkActions.tsx:34` `Clear` | unmounts | **unmounts — confirmed.** Focus → `<body>`. ⚠ **and it has no undo** |
| 2 | `SectionGridNav.tsx:238` `Remove` | unmounts | **unmounts — confirmed.** Focus → `<body>`. One Ctrl+Z restores |
| 3 | `EffectsScenePanel.tsx:867` Delete scene | unmounts | **WRONG — survives, retargeted at another file, AND KEEPS FOCUS** |
| 4 | `BandPresetPanel.tsx:407` Delete preset | unmounts | **WRONG — survives, retargeted at another file, AND KEEPS FOCUS** |
| 5 | `BgAnimBandPanel.tsx:564` `Demote` | unmounts | **WRONG — survives AND KEEPS FOCUS** (with a successor band present) |
| 6 | `BgAnimBandPanel.tsx:567` `Remove`, refusing press | unmounts | **WRONG — survives AND KEEPS FOCUS.** The press after the refusal refuses again |

**Six of six were clicked. None is reported unmeasured.** The line numbers above
were re-grepped on master `1ea99dfa`; both packets' numbers were stale (the
tree moved five times on 2026-09-03), which is why every one is stated with the
symbol beside it rather than the number alone.

---

## Control by control

### 1 · `components/AeonChunkActions.tsx` — `Clear` — **exclusion CONFIRMED**

*State constructed.* Layout facet, the chunk-stamp tool armed, the `Chunks`
section open, chunk library at **71 entries**.

⚠ **The section is TOOL-GATED, not merely collapsed** (`layout-facet.tsx:94`,
`!pasting && tool === 'stamp-chunk'`). The first run of this harness reported
`no-header` and the button "missing" — which reads exactly like the defect, and is
not it. `[chk-tool]` now arms the tool through the facet dock's own button and
asserts it took, so "the control is gone" and "the control was never on screen"
cannot be confused again.

*Clicked for real* at integer `(1356,435)`, `elementFromPoint` = the button itself.

*Result.* The clicked node **left the document**; the handle resolves to nothing;
`document.activeElement` = `<BODY>`. The exclusion is right. **See the warning at
the top of this file for the separate finding.**

### 2 · `components/SectionGridNav.tsx` — `Remove` — **exclusion CONFIRMED**

*State constructed.* Layout facet, `Sections` open, 9 section-holding cells, the
context menu opened on cell 0.

⚠ The menu is opened with a **synthetic `contextmenu` MouseEvent** — the one
synthetic event in the whole run, and it is SETUP, in the same class as the
native-setter `SET_INPUT` every harness here uses: the app really does listen for
it (`SectionGridNav`'s `onContextMenu`), and the row prints which mechanism opened
the menu. **The `Remove` press itself is `Input.dispatchMouseEvent`** at integer
`(1256,193)`.

*Result.* The clicked node **left the document**, `activeElement` = `<BODY>`,
sections **9 → 8**, and one Ctrl+Z put it back (**8 → 9**). `doRemove` calls
`setMenu(null)` unconditionally and the menu is behind `{menu && …}`. Exclusion
right, and the writer is undoable.

### 3 · `effects/EffectsScenePanel.tsx` — Delete scene — **exclusion WRONG**

*State constructed.* Effects facet, Parallax tab. The library opened with two
scenes (`ojz_act1_depth`, `ojz_act1_start`); the run created a third,
`d6_probe_scene`, through the panel's own `New` button and selected it. **Two or
more is the point** — deleting the *last* scene is the arm both passes agree on
and is not what this measures.

*Clicked for real* at integer `(1369,709)`; the button was **present, visible and
`disabled=false`** at that instant (printed in `[esd-0]`).

*Result — three separate facts:*

- **It survives.** The node latched before the click is still in the document and
  the handle still resolves to **the same node** (`===`, not a re-query).
- **It is retargeted at a different file.** The same DOM button's `aria-label`
  went **`"Delete scene d6_probe_scene"` → `"Delete scene ojz_act1_depth"`**. The
  store's selected id is still the deleted document's, which is exactly what makes
  `resolveSelectedScene` (`providers/effects-aeon.ts:2524`) fall back to
  `library.scenes[0]`.
- **It keeps keyboard focus.** `document.activeElement` = that same `<BUTTON>`,
  now labelled `Delete scene ojz_act1_depth`.

**Those three together are worse than a repeat-fire.** A bare Space on the
still-focused button does not re-delete the document that is gone — **it deletes
somebody else's**. One Ctrl+Z restores the scene (`[esd-z]`), so this is not the
d-29 class.

### 4 · `effects/BandPresetPanel.tsx` — Delete preset — **exclusion WRONG**

*State constructed.* Effects facet, Colour tab. Library opened with three presets;
the run created `d6_probe_preset` through the panel's own `New` and selected it.

⚠ **This control carries `disabled={deleteRefusal !== null}`** — the exact vacuity
trap the nine-parcel met at `[esp-c]`, where a button greyed out for an unrelated
reason made a focus row green. `[bpd-0]` asserts **`disabled === false`** at the
instant of the click and prints the reading; the fixture uses a preset this run
created, which no section binds.

*Clicked for real* at integer `(1354,733)`.

*Result.* Identical shape to #3. Same node afterwards; `aria-label` **`"Delete
preset d6_probe_preset"` → `"Delete preset authored_probe"`**; **focus stays on
it**. One Ctrl+Z restores it.

**And the retarget is sharper here than at #3**, because this button has a guard:
`deleteRefusal` is derived for the *selected* preset. After the delete it is
re-derived for `authored_probe` — the row prints the post-click button as
`{"aria":"Delete preset authored_probe","disabled":false}` — so the guard *is*
live for the new target. What the author does not get is any signal that the
target changed under a button they are still focused on.

### 5 · `effects/BgAnimBandPanel.tsx` — `Demote` — **exclusion WRONG**

⚠ **The fixture is the whole row.** The open document carries **one** band.
Demoting the only band empties the list, so card 0 has nothing to shift into it and
the button unmounts — that is the arm both passes agree on, and **the first run of
this harness measured exactly that and it means nothing about the dispute**
(recorded here because it is the same trap as "delete the last scene", and because
that run is a different run and is labelled as one). `[dem-fix]` therefore promotes
a second band through the panel's own `Promote` chip and **asserts `bands >= 2`
before anything below is believed**.

*Clicked for real* at integer `(1208,477)`, with **two** bands present.

*Result.* Bands **2 → 1**, `bgOverrideHash` changed (so the click really acted),
the latched node is **still in the document and still the same node**, and
`document.activeElement` is **that button**. The band cards are `key={b.index}`
(`BgAnimBandPanel.tsx:494`) — the index-keyed list shape the original survey named
as the retarget family. One Ctrl+Z lands back on the **exact bytes**
(`[dem-z]`), and the fixture's own Promote is undone too (`[dem-z2]`).

### 6 · `effects/BgAnimBandPanel.tsx` — `Remove`, the refusing press — **exclusion WRONG**

This is the one the parent packet held up as *"already does the right thing…
worth copying rather than fixing"*, which is precisely why changing it on a code
read would have been the wrong move.

*State constructed.* The document's live band 0 (8x4, 32 tiles) — a band **map
cells actually draw**, which is what makes the refusal fire. Clicked for real at
integer `(1266,632)`.

*Result — the refusing press:*

- **It applies nothing.** Bands `1 → 1`, and `bgOverrideHash` **1422319328 →
  1422319328**, byte-identical. This is the `[k7]` no-op shape.
- **The button does not unmount.** Same node, still in the document.
- **It keeps focus.** `activeElement` = that `<BUTTON>`. **The confirmation chip
  that appears does NOT take focus** — the row prints `isConfirm=false`.

*The press after the refusal, on the same button, same pixel:* it **refuses again
and destroys nothing** (bands `1 → 1`, hash unchanged, chip still on screen). The
confirmation lives on a **second, different control** (`Remove and blank those
cells`), and the destructive path is only reachable by moving to it.

**So the sentence to say precisely is this.** A bare Space on the still-focused
`Remove` re-asks a question that has already been answered and applies nothing —
the button's *meaning* does not change between press one and press two, and the
harness measured that rather than assuming it. **What did change is the screen**:
a destructive control the author did not ask for is now on it, one Tab away, and
the focused button gives no indication that the next confirming press belongs to a
different widget. That is a legibility observation, not a data-loss one, and it is
booked as such.

Both presses left the override document byte-identical to the one the run opened
(`[rem-z]`).

---

## Red-first

Every plant applied on disk, `npx tsc --noEmit` clean, **the built bundle grepped
to prove the mutation arrived**, the harness re-run, then the file restored with
`git checkout HEAD --` from the **committed** baseline. **The first run of each
plant is the one reported.**

| Plant | On disk | In `dist/` | Result |
|---|---|---|---|
| **P1** `resolveSelectedScene` loses its `?? library.scenes[0]` fallback | `effects-aeon.ts`: `… === selectedId) ?? null;` | `scenes.find((s) => s.id === selectedId) ?? null;` | **`[esd-a]` `[esd-b]` `[esd-c]` RED**, 28/31 — every other site green |
| **P2** `resolveSelectedPreset` loses the same fallback | `effects-preset.ts`: `… === selectedId) ?? null;` | `presets.find((p) => p.id === selectedId) ?? null;` | **`[bpd-a]` `[bpd-b]` `[bpd-c]` RED**, 28/31 |
| **P3** the band Remove's first press stops refusing | `BgAnimBandPanel.tsx`: `removeBandCommand(doc, b.index, true)` | `removeBandCommand(doc, b.index, true);` | **`[rem-a]` `[rem-b]` `[rem-c]` `[rem-d]` `[rem-z]` RED**, 26/31 |
| **P4** `Demote`'s onClick stops demoting | `onClick={() => { setPendingRemoval(null); /* no demote */ }}` | zero occurrences of `apply(demoteBandCommand` (only the provider and the agent handler are left) | **`[dem-a]` `[dem-z]` RED**, 29/31 — **`[dem-b]` STAYED GREEN** |
| **P5** the chunk `Clear` loses its `hasChunks &&` gate | `{/* PLANT P5 */ true && <button …>Clear</button>}` | `hasChunks` count **0** in `dist/` (baseline: 2) | **`[chk-a]` RED**, 30/31 |
| **P6** `doRemove` stops closing the menu | `SectionGridNav.tsx`: `setMenu(null)` deleted | `doRemove = () => { if (menu?.sec) removeSectionAt(menu.index); };` | **`[sgn-a]` RED**, 30/31 |
| **P7** `clearChunks` stops clearing | `projectStore.ts`: `return {};` | `clearChunks: () => set((state) => { if (!state.project) return {}; return {}; })` | **`[chk-a]` `[chk-UNDO]` RED**, 29/31 |

**P1, P2, P5 and P6 are the ones that matter most**, and they are deliberately one
per site: each reddens only its own control's rows, so no row is riding on another
site's wiring. That is the shape this repo loses defects in.

**P4 is the `[esp-c]` lesson, reproduced.** A `Demote` that takes the click, stays
mounted and does **nothing** left `[dem-b]` — the pure focus row — **green**. That
is why `[dem-a]` carries "and the same click really demoted the band" IN ITS
CONDITION rather than in prose beside it, and why no `-a` row in this file is
focus-only.

**P7 is what keeps `[chk-UNDO]` from being a constant.** With the wipe made a
no-op, the library is non-empty after the Ctrl+Z — the same observation a
*recoverable* Clear would produce at that point in the sequence — and the row goes
red. `[chk-a]` reddening beside it is what tells the two apart: a genuinely
recoverable Clear would keep `[chk-a]` green.

**One row this file could not gate, said out loud.** No plant here proves
`[rem-d]`'s *green* is the only shape it can take; a build whose second press
completed the removal would redden it, and P3 shows the row's subject can vanish
(it reports NOT MEASURABLE, loudly, rather than crashing the run or passing). What
is not measured is a keyboard Space sent to the still-focused Remove — this file
measures clicks, and the key half belongs with whatever fix, if any, follows.

---

## Recommendation — a recommendation, not a change **[ACTED ON 2026-09-03]**

**Four controls now carry the d-27 shape and are not on the fixed list** — they
are ON it as of `docs/reviews/2026-09-03-d27-four-survivors.md`, and the
outcome of each is in the last column:

| control | why it qualifies | recoverable? | outcome |
|---|---|---|---|
| `EffectsScenePanel.tsx:867` Delete scene | survives, **retargets at another document**, keeps focus | one Ctrl+Z | **WIRED**, rows `[esd-a]` `[esd-b]`, plant P1 |
| `BandPresetPanel.tsx:407` Delete preset | same, and the guard silently re-derives for the new target | one Ctrl+Z | **WIRED**, rows `[bpd-a]` `[bpd-b]`, plant P2 |
| `BgAnimBandPanel.tsx:564` `Demote` | survives, keeps focus, `key={i}` list | one Ctrl+Z | **WIRED**, rows `[dem-a]` `[dem-b]`, plant P3 |
| `BgAnimBandPanel.tsx:567` `Remove` | survives the refusing press, keeps focus | nothing applied | **WIRED**, row `[rem-k7]` — the arc's only honest `[k7]`, plants P4 and P5 |

⚠ **The paragraphs below are the recommendation AS WRITTEN, kept unedited.**
Two of its reservations were answered rather than overridden: the retarget is
deliberately left alone (a selection question d-27 did not rule on, and both
`-b` rows measure it without mentioning focus), and `Remove` was NOT patched on
a reading — `[rem-k7]` measures that its refusing press still writes nothing and
now drops the keyboard, and the confirmation-chip observation is booked as a
NOTE with no fix built for it.

The first two are the strongest case: `actAndDropFocus` is already imported in both
files, both are `IconButton`s that already forward the click event, and the retarget
is on a **delete-a-whole-document** button — strictly worse than the layer/band
removals the nine-parcel fixed in the same two files. **They are also the ones where
the smallest fix may not be the right one**: dropping focus stops the stray Space,
but it does not tell an author that the button under their cursor now names a
different file. That is a second question and it is not mine to answer.

`Demote` is the same cheap fix as its neighbours. `Remove` is the one to think
about rather than patch: it applies nothing on the press that keeps focus, so
`actAndDropFocus` would buy less there than at the other three, and the real
observation is about the confirmation chip not taking focus.

**And separately, and first: `AeonChunkActions.tsx`'s `Clear` is the d-29 class.**
That is the owner's call, not a fix to slip in, and it is why this section does not
propose one.

---

## Suite

`npm test` — **474 files passed, 2 skipped (476); 6580 tests passed, 8 skipped
(6588)**. Aggregate, not a tail excerpt, and measured on this branch rather than
copied from the parent packet's totals. Every skip named its reason
(`skip-report: OK`); the eight are the pre-existing opt-in rows
(`AURORA_FG_GATE_FILE`, `AURORA_BENCH`, `AURORA_LIVE_S1_WARP`, two `s4_engine`
fixtures gone from this machine) plus `sibling-root`'s step-3 row, which skips
because this run stands in a linked worktree rather than the main checkout.

The node suite **cannot see React, a DOM or a click**, so it is the floor and not
the proof: the CDP harness above is what measured every claim in this file.

## What is NOT here

- **No fix.** Not one line of `src/renderer/` behaviour changed. The only source
  edit in this branch is a stale comment in
  `components/__tests__/d27-act-and-drop-focus.test.ts` that told the next reader
  the six exclusions were settled; it now points here.
- **No emulator.** Nothing touched `mcp__oracle__*`.
- **Nothing saved.** No `Ctrl+S`, no save call; the app has no autosave. Every
  undoable edit was taken back through the app's own history and re-read; the one
  un-undoable edit (`[chk]`) was restored by re-opening the project from disk, and
  the run's last reading shows both effects libraries back where it found them.
- **No sibling checkout was written to.** The harness opens `aeon` read-only and
  issues no save (decision d-28's writable-copy rule binds harnesses that write;
  this one does not).
