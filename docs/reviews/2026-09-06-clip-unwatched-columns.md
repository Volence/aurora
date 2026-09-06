# CLIP-UNWATCHED-COLUMNS — every scrolling column is watched, and the sweep says which ones it could not look at

**Branch** `parcel/clip-unwatched-columns`. **Date** 2026-09-06.

---

## 0. The row, as it stood

`Panel`'s inline axis was closed twice over on 2026-09-05/06 — `overflowX: 'hidden'`
plus an `onScroll` handler that snaps `scrollLeft` back to 0 — because a
`position: sticky` section strip rode the inline scroll 89px on a wheel gesture
and **511px** on a `Tab` focus jump. That was the right fix for a real defect.

Its residual, stated in the component's own closing paragraph:

> ⚠ CLIPPING IS QUIETER THAN SCROLLING, so the over-wide child must be caught
> somewhere else: `[9a]` fails on any horizontal overflow in the Effects column
> with its cards open, and it is the only instrument that sees one now.

Fifteen `<Panel … scroll>` call sites. One watched. **A check that covers one
column reads, in a report, exactly like a check that covers the shell.**

---

## 1. What I measured that changed the shape of the row

### 1a. The fifteenth call site is dead

`src/renderer/components/effects/EffectsScenePanel.tsx:1914` exports an
`EffectsPanels`. Nothing imports it. The Effects facet declares its **own**
local `EffectsPanels` (`workspace/facets/effects-facet.tsx:126`) and that is the
one wired to `RightPanel`.

So the population that can be on a person's screen is **fourteen**, not fifteen.
I did not delete the dead export — that is a different parcel's call, and an
entry that says so out loud makes the fifteenth row honest instead of
perpetually unexplained. `panel-columns.test.ts` asserts the claim by scanning
every `.tsx` for an import of the symbol, so wiring it up turns the test red and
forces the census to be updated rather than leaving a row that lies.

### 1b. Every one of the fourteen measures clean today

Nothing in the shell currently overflows its column. The row was about the
absence of an instrument, not about a live defect. Full table in §4.

---

## 2. The design, and what I rejected

The brief offered two shapes. I took the second and added the piece both were
missing.

**Rejected — fourteen more `[9a]`-style CDP rows.** Complete and expensive, and
it has a defect the brief does not name: each row is written against the column
it measures, so the census IS the list of rows, and a column nobody wrote a row
for is invisible in exactly the way this parcel exists to end. It also cannot
answer "which columns did this run not reach" without a list maintained
somewhere else anyway.

**Taken — the Panel self-report, with a source-derived census as its spine.**

The load-bearing decision is that **the census does not come from the DOM.**

| piece | where | what it holds |
|---|---|---|
| census | `src/renderer/components/ui/panel-columns.ts` | id → label, owner file, `reach` (what a sweep must open first) |
| the type | same file | `PanelColumnId` is the union of the census keys |
| the requirement | `components/ui/primitives.tsx` | `Panel`'s props are a discriminated union: `column: PanelColumnId` is required **exactly when** `scroll` is set |
| the DOM stamp | same | a scrolling Panel sets `data-panel-column` — one string attribute, no effect, no registry, no debug branch, present in a normal build |
| the runtime read | `src/renderer/debug-hooks.ts` | `__dbg.panels()` → `{census, mounted, strays, duplicates}` |
| the drift guard | `components/__tests__/panel-columns.test.ts` | 13 rows, in `npm test` |
| the sweep | `scratchpad/panel-overflow-harness.mjs` | `npm run harness:panel-overflow` |

A sweep that listed only what it found mounted would report a clean zero for a
run that opened no project. That is "could not look" wearing "looked and found
nothing"'s clothes, and it is the same shape as `boundSocketPaths()` returning
an empty `Set` on an unreadable table. So the harness prints one row per
**census** entry and owes a reason for every one it did not reach.

### 2a. Four states, not three

| state | meaning |
|---|---|
| `CLEAN` | measured, `scrollWidth <= clientWidth`, with every card open |
| `OVERFLOW` | measured, a child is clipped; the offending leaf nodes are named |
| `UNMEASURABLE` | **not reached**, with the reason. Never a pass. Makes the run non-zero. |
| `DEAD` | the census declares that nothing mounts it, and a vitest proves the claim |

`DEAD` is a deliberate departure from the brief's three states, and the argument
is: there is exactly one, its reason is permanent, and no action can clear it.
Calling it `UNMEASURABLE` would make this run non-zero forever for a reason
nobody can act on, and **a gate that is permanently red teaches its readers to
ignore the exit code** — which is a slower version of the defect this parcel is
fixing. Calling it `CLEAN` would be a lie. So it is its own state, printed and
counted separately, and its claim is held by a test rather than by a comment.

---

## 3. Red first — and the two ways this instrument was vacuous before it worked

**Both were found by planting a violation and watching it NOT be caught.** Neither
would have shown up in any green run. This is the section worth reading.

### 3a. A collapsed card renders no children

`CollapsibleSection` is `{!collapsed && children}`. Several sections in this
shell are `defaultCollapsed`, and this sweep takes a fresh session on purpose,
so it gets every one of those defaults. **A column with its cards shut measures
0px however wide its content is.**

The first plant went into the aeon Objects column, the app was rebuilt, and the
sweep said `CLEAN`. That is `[9a]`'s own first cut, which "reported PASS with
every card shut", reproduced in a new instrument a day later.

Fixed by *creating* the condition rather than waiting for it, the way `[9a]`
opens the CYCLES card: `CollapsibleSection` now carries `data-section` and
`data-section-collapsed`; `__dbg.revealSections()` opens every shut card through
the app's own `revealPanel` (the same write the header click performs); and a
column with a card that would **not** open is `UNMEASURABLE`, never clean. Each
row prints `N card(s), M opened by this sweep`.

A scan for the chevron's rotation was rejected — it breaks on the next icon
change, and a fragile locator is how a guard goes quietly green.

### 3b. My plant wrapped instead of overflowing

The first plant was `data/editor/ojz_bg_ingame-forest-v15-1786630615596.bin`.
The sweep stayed green through a full rebuild **even after 3a was fixed**.

**Hyphens are soft wrap opportunities. So are slashes.** The token broke across
lines and never went off the edge. That is precisely `[9d]`'s failure — it
passed on both sides of its own fix because its planted button wrapped onto the
next line. What matters is the longest unbroken run; `_` is not a break
opportunity.

The working plant is
`data/editor/effects/presets/a_preset_id_nobody_has_authored_yet.json`, which is
the token `[9c]`'s own plant uses.

**So the anti-vacuity check is now inside the harness, not something I did by
hand once.** Every run plants that token into the first column that measures
clean, asserts the sweep reports `OVERFLOW` (`[r4]`), then removes it and
asserts the column returns to clean (`[r5]` — a row that only ever sees the
number go up cannot tell a live measurement from a stuck one). A run where **no**
column measured clean books `[r4]` as FAILED rather than skipping it.

### 3c. And the offender scan named nobody

With the plant in, the sweep said `aeon-objects overflow 203px` and could not say
which node did it — a report that a column is broken and a refusal to say where.

Cause: every section is `display: flex; flexDirection: column`, so a child of one
is a flex item **stretched to the column's width**. Its rect ends exactly at the
content edge and its *text* runs past. There are two ways to be the culprit and
the scan had one. It now also compares each leaf's own `scrollWidth` to its
`clientWidth`.

### 3d. The red runs, with the mutation shown

**The sweep.** Mutation applied to `src/renderer/workspace/facets/objects-facet.tsx`
(`git diff --stat` named that file and no other; the line read back from disk was
`<code>data/editor/effects/presets/a_preset_id_nobody_has_authored_yet.json</code>`
inside the `aeon.selectedObject` card), then `VITE_AURORA_DEBUG=1 npm run build`,
then the sweep:

```
15 columns: 13 clean, 1 OVERFLOWING, 0 UNMEASURABLE, 1 dead     rc=1
OVERFLOWING:
  aeon-objects: scrollWidth 442 clientWidth 239 overflow 203px scrollLeft 0
    · 3 card(s), 0 opened by this sweep
    clipped past the right edge: [{"tag":"CODE","over":203,"width":442,
      "text":"data/editor/effects/presets/a_preset_id_nobody_has_authored_"}]
```

No other column moved. Restored with `git checkout --` from commit `72a2d899`,
which is the committed baseline it was restored *from* (the instrument changes
were committed first, so the checkout could not delete uncommitted work).

**The `npm test` gate**, four mutations, each applied from a clean tree and shown
on disk with `git diff --stat` before the run:

| mutation | what went red |
|---|---|
| drop `column="aeon-rings"` from `rings-facet.tsx:18` | `tsc` rc=2, `TS2322: Property 'column' is missing … but required`; and 3 vitest rows (`no scrolling call site is anonymous`, `carries no id that no call site uses` → `['aeon-rings']`, `the two counts agree` ) |
| `s1-objects` → `s1-layout` at `s1-facets.tsx:346` (a duplicate id) | 3 rows: `no two columns share an id`, orphan `['s1-objects']`, `expected 14 to be 15` |
| add `import { EffectsPanels } from '…/EffectsScenePanel'` to `rings-facet.tsx` | `effects-scene-standalone says nothing mounts it, but these files import EffectsPanels: ['workspace/facets/rings-facet.tsx']` |
| delete the `data-panel-column` stamp from `Panel` | `Panel no longer stamps its column id, so __dbg.panels() finds nothing` |

The last one matters most: without it the whole sweep would find zero columns
and print fifteen `UNMEASURABLE` rows, which is loud — but the *test* is what
says the cause is the app and not the harness.

---

## 4. The full table, green run

`VITE_AURORA_DEBUG=1 npm run build`, then

```
ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
AURORA_BUILT_TREE=$PWD \
PANEL_SWEEP_CANVAS_DIR=<a throwaway copy of s1disasm> \
npm run harness:panel-overflow
```

| state | id | column | reached by |
|---|---|---|---|
| CLEAN | `aeon-layout` | Layout (aeon) | aeon project open, facet `layout` |
| CLEAN | `aeon-art` | Art (aeon) | facet `art` |
| CLEAN | `aeon-objects` | Objects (aeon) | facet `objects` |
| CLEAN | `aeon-rings` | Rings (aeon) | facet `rings` |
| CLEAN | `aeon-collision` | Collision (aeon) | facet `collision` |
| CLEAN | `aeon-palette` | Palette (aeon) | facet `palette` |
| CLEAN | `aeon-effects` | Effects (aeon) | facet `parallax` |
| CLEAN | `s1-layout` | Layout (classic) | s1disasm open, GHZ 1 activated |
| CLEAN | `s1-objects` | Objects (classic) | facet `objects` |
| CLEAN | `s1-palette` | Palette (classic) | facet `palette` |
| CLEAN | `s1-collision` | Collision (classic) | facet `collision` |
| CLEAN | `s1-art` | Art (classic) | facet `art` |
| CLEAN | `sprite-mode` | Sprite mode | `editObjectArt(0x41)` |
| CLEAN | `canvas-mode` | Canvas mode | New Canvas through Ctrl+K, into the throwaway copy |
| DEAD | `effects-scene-standalone` | Effects scene (standalone wrapper) | nothing mounts it (§1a) |

`15 columns: 14 clean, 0 OVERFLOWING, 0 UNMEASURABLE, 1 dead` — rc=0.

**Without** `PANEL_SWEEP_CANVAS_DIR` the same run is `13 clean, 1 UNMEASURABLE,
1 dead` at **rc=1**, and the reason printed is the real one:

> CanvasMode returns null without a loaded document (`CanvasMode.tsx: if (!doc)
> return null`), and the only gesture that makes one WRITES the document into
> the open project. This sweep refuses to write into a checkout somebody works
> in. Set `PANEL_SWEEP_CANVAS_DIR` to a throwaway copy of a project and re run
> to measure it.

That is the state the sweep is *supposed* to have on a box that cannot reach a
column, and it is why unmeasurable counts as non-zero.

### 4a. What the sweep writes, and what it does not

It never saves, never builds, and presses no Ctrl+S. It opens the aeon and
s1disasm checkouts **read only**. The one gesture that writes is creating a
canvas document, which is why that phase has its own variable with **no default**
and refuses a path equal to the resolver's own default location.

---

## 5. Aggregate

`npm test` on the merged tree: **rc=0**, `Test Files 511 passed | 3 skipped (514)`,
`Tests 7433 passed | 9 skipped (7442)`. That is the runner's own totals line, not
a tail.

---

## 6. Left open

1. **`EffectsScenePanel.tsx`'s dead `EffectsPanels` export.** Measured, declared,
   guarded, not deleted. Deleting it is a one-line change and a different
   parcel's call; the census row and its test make the situation legible either
   way.
2. **The canvas column needs a writable copy.** It is measured when
   `PANEL_SWEEP_CANVAS_DIR` names one and honestly refused when it does not.
   Making it free would mean an in-memory canvas document, which is a change to
   the app for a harness's convenience.
3. **The sweep is not in `npm test`.** It launches Electron under `xvfb-run` and
   takes about two minutes; `npm test` is a 20-second node-only chain. The
   source-side half (the census, the type requirement, the DOM stamp) IS in
   `npm test`, so the thing that rots fastest — a new column nobody named — is
   caught there. Whether the sweep belongs in a nightly is an owner call.
4. **Nothing here needs the emulator.** No `mcp__oracle__*` tool was touched.
