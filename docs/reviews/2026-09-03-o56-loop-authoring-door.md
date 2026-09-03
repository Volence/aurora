# O56 — can a PERSON reach the loop / crossover authoring controls?

**Branch** `parcel/o56-loop-authoring-door` · **Commits** `33b81134`, `fc09e675` · 2026-09-03
**Instrument** `scratchpad/o56-loop-authoring-door-probe.mjs` (`npm run harness:o56-loop-authoring-door`), 15/15
**Fixture** an `rsync` copy of aeon at `$SCRATCH/aeon-copy` (`.claude` and `.git` excluded)
**Measured against** a `VITE_AURORA_DEBUG=1` build of *this branch's* source, under xvfb, `devicePixelRatio = 1`

---

## The three answers, before anything was changed

**All three are good. Nothing was broken and nothing needed fixing in the app.**
This is the outcome the parcel said was a legitimate result, and it is the one that
happened. Aurora's loop tooling does **not** have O55's disease.

| | question | answer |
|---|---|---|
| **1** | is there a human-facing control for "solid on both planes"? | **YES** — the `A+B` chip in the palette's `Plane` row. A real button, visible, enabled, and a click on it moves the real store field. |
| **2** | is there a human-facing way to paint a layer transition? | **YES** — the `Loop` row: `Keep` / `Hand → B` / `None`. Same: real, visible, enabled, and a click arms the crossover brush. |
| **3** | discoverable on arrival, or behind disclosures? | **ONE click from a project with a level open, and ZERO disclosures.** Both controls are on screen the instant the Collision facet is shown. |

`CollisionPalette.tsx`'s `bothPlanes` is **a control, not plumbing.**

### What the probe measured

Both controls live in `components/CollisionPalette.tsx` (the `variant === 'map'`
branches), mounted by `workspace/facets/collision-facet.tsx:34` inside
`<CollapsibleSection id="aeon.collision" title="Collision">` — **which carries no
`defaultCollapsed`**, so it is open when the facet appears.

```
FACET PILLS ON ARRIVAL (7): ["Layout","Objects","Effects","Rings","Collision","Palette","Art"]
PASS [3a] CLICK 1: the Collision facet pill takes a plain .click()

    SECTIONS ON THE COLLISION FACET (6):
      closed "Levels" · closed "Object Library" · closed "Canvases" · closed "Tools" ·
      open "Collision" · open "Properties"
PASS [3b] the "Collision" section is OPEN on arrival at the facet (no disclosure to click)

    LABELLED CONTROL ROWS IN THE COLLISION PANEL (6):
      VISIBLE "Plane"   [A] [B] [A+B]                      rect=224x22 inScroller=224x22
      VISIBLE "Brush"   [1] [7] [15] [25]
      VISIBLE "Flip"    [H ⇄] [V ⇅]
      VISIBLE "Floor"   [Solid] [Jump-thru] [L/R/B] [None]
      VISIBLE "Sec 0"   [Reset] [Clear]
      VISIBLE "Loop"    [Keep] [Hand → B] [None]           rect=224x22 inScroller=224x22

PASS [4b] Q1 — a HUMAN-FACING control for "solid on both planes" is on screen
PASS [4c] Q2 — a HUMAN-FACING control row for painting a layer transition is on screen
PASS [4d] Q3 — on arrival at the facet the loop control is on screen with NO disclosure opened
```

Every row's rect is fully inside its scroller (`inScroller` equals `rect`), so no
control is scrolled out of the 240px panel. `checkVisibility()` is not used
anywhere in this probe: it goes green on an element scrolled clean out of a
scrolling parent.

### And they are not dead chrome

A control a person can see that writes nothing is this repo's recurring defect.
Rows 5a–5c drive the real buttons with `HTMLElement.click()` and read the live
`editorStore` back through `__dbg.aeon.armCollisionBrush({})` — which, given an
empty selection, sets nothing and only reports:

```
[5a] baseline                        {"plane":"a","bothPlanes":false,"crossover":"keep"}
[5b] CLICK 2: click [A+B]        →   {"plane":"a","bothPlanes":true, "crossover":"keep"}
[5c] CLICK 3: click [Hand → B]   →   {"plane":"a","bothPlanes":true, "crossover":"hand-off"}

[5d] LENS REPORTS AFTER ARMING:
       bothPlanesLens: {"active":true,"reason":null,"sections":9,"sectionsWithPlaneB":9,…}
       crossoverLens:  {"active":true,"reason":null,"plane":"a","sections":9,…}
```

Both chips also **surface their own lens**, so neither is a silent mode.

The stroke that follows is already covered and green: `npm run harness:loop-paint`
(pre-existing, not touched by this parcel) is **45/45** on this build, including the
rule that a both-planes stroke writes `TO_B` on plane A and `TO_A` on plane B rather
than broadcasting one value.

### Why this is not O55's shape

O55 found the app leading with its worse door: the panel's creation surface behind
two stacked disclosures while a toolbar chip did the same job in one click, with
nothing pointing at either. Here there is **one door and it is the good one** — the
probe found all six control rows at `x=1161`, i.e. all in the right panel, with no
competing toolbar duplicate to lead with.

---

## The discoverability finding, which is not a diff

The controls are reachable. What they are is **quiet**. Row 4d is the measurement,
and it is deliberately taken *before* either chip is armed:

```
TEXT NAMING THE LOOP FEATURE ON ARRIVAL AT THE COLLISION FACET,
BEFORE ANY CHIP IS ARMED (1):
  <SPAN> "Loop"
```

**One word, four characters.** That is the entire on-screen vocabulary for the
feature until you interact with it. Everything that explains it is in one of two
places a person may never reach:

1. **`title=` tooltips** — excellent ones, genuinely. `A+B`'s is three sentences and
   names the failure mode ("painting it twice by hand is what leaves a half-finished
   second plane"). `Hand → B`'s explains two-way crossovers. All of it is hover-only.
2. **Hint text that appears only *after* you arm a chip** — "Both-planes lens on — the
   teal veil marks the cells that are solid on path A AND path B…", "Crossover lens
   on — the amber veil marks the cells that hand the player to the other collision
   path…". These are the sentences that would tell an author what the row is for, and
   they are gated behind having already understood it enough to click.

That ordering matters enough that it is the reason the probe takes its census where
it does. A census run after the clicks reads back the probe's own doing and would
have reported "the feature explains itself" about a screen no arriving author sees.

### The one place the shape contradicts the model

`A+B` sits inside the `Plane` row, in the same segmented group as `A` and `B`,
styled identically. The source is explicit that this is exactly what it is not
(`CollisionPalette.tsx:303-311`):

> A MODE ON TOP OF THE PLANE PICK, not a third plane. […] Modelling it as a third
> value of `collisionPaintPlane` would have made every reader of that field […]
> answer a question they have no answer to.

The *code* correctly refuses to model it as a third plane. The *presentation* puts it
where a third plane would go and dresses it the same. A person reading the row left
to right sees three options where the model has two options and a modifier. That is a
small, real mismatch, and it is the kind of thing the owner's "confusing and
convoluted" is made of.

### Recommendation (the layout call is the owner's, as in O55)

Cheapest first, and none of these is a redesign:

1. **Give the `Loop` row a one-line hint that is present before it is armed**, in the
   same `styles.hint` the panel already uses under the shape list. One sentence
   naming what a crossover is for — "mark the cells where the player is handed from
   one collision path to the other, for loops and overpasses" — turns a four-letter
   label into a feature. This is the highest value per line of diff on the surface.
2. **Separate `A+B` from the `A`/`B` pair visually** — a gap, a divider, or its own
   short row labelled as a mode. It costs one style change and removes the
   third-plane reading the source already argued against.
3. Leave the tooltips exactly as they are. They are the best-written thing on this
   panel; the problem is only that nothing invites the hover.

I have deliberately built none of these. The parcel scopes a discoverability problem
to a finding plus a recommendation, and O55 parked its equivalent for the owner.

---

## What changed

Nothing in `src/`. Two commits, both instrument-only:

| commit | files |
|---|---|
| `33b81134` | `scratchpad/o56-loop-authoring-door-probe.mjs` (new), `package.json` (registers `harness:o56-loop-authoring-door`) |
| `fc09e675` | `scratchpad/o56-loop-authoring-door-probe.mjs` — row 5d made discriminating (below) |

The probe is registered in `package.json` because an unregistered harness is
invisible to `check:harness-guards`, which is how a harness sits red for days
without anyone learning.

### Red-first, with the mutation shown on disk

Two mutations, each a *realistic* regression rather than a deletion — the
`variant === 'map'` gate flipped to `'art'`, which is the mistake that would
actually be made, and which leaves the component compiling. **`dist/` was rebuilt
after each**, because the probe runs against the build and an unrebuilt mutation and
a correct baseline both print `ok`.

| mutation (`git diff --stat` named `src/renderer/components/CollisionPalette.tsx`) | line on disk | result |
|---|---|---|
| A+B chip mis-gated, line 321 | `{variant === 'art' && (` | **13/15** — red on **4b, 5b** only |
| Loop row mis-gated, line 376 | `{variant === 'art' && (` | **11/15** — red on **4c, 4d, 5c, 5d** only |
| restored (`git checkout --` from the committed baseline, clean tree) | `{variant === 'map' && (` | **15/15** |

Attribution is per row, not a blanket throw: each mutation reddens its own control's
rows and leaves the other control's green.

### The mutation found a vacuous row, and that is why it was run

Under mutation 1, **row 5d passed** while the lens it claimed to be checking reported

```
bothPlanesLens: {"active":false,"reason":"off","sectionsWithPlaneB":0,…}
```

The row tested `!!lensB && !!lensX`. But a lens that never armed **still publishes a
report saying so** — that is what `reason` is for — so a non-null test can never
distinguish "surfaced the lens" from "surfaced nothing". Fixed in `fc09e675` to
assert `.active === true` on both and print each `reason` beside the verdict, then
**re-established with the mutation still applied**: 5d goes red under both mutations
and green on the restored tree.

---

## Verification

| what | result |
|---|---|
| `npm run harness:o56-loop-authoring-door` | **15/15** on a fresh `VITE_AURORA_DEBUG=1` build |
| `npm run harness:loop-paint` (pre-existing; the write path) | **45/45** |
| `npx vitest run` | **6477 passed · 8 skipped · 0 failed** (469 files passed, 2 skipped) — every skip named its reason |
| `npx tsc --noEmit` | clean, exit 0 |
| `npm run check:harness-guards` | **188 clean / 188 classified · 0 failures · 0 unmeasurable** (187 before this branch; the new one is the 188th) |
| `git -C ../aeon status --porcelain` | ` M docs/lane-status.json` / ` M tools/freeze_preflight.sh` — the aeon lane's own two edits, nothing of mine |

The 8 skips are pre-existing and unrelated (3 foreground-gate rows, 1 opt-in bench,
1 live-S1 row, 2 rows whose `s4_engine` fixture tree is gone from this machine, and
1 `sibling-root` row that cannot run from a linked worktree).

### ⚠ `npm test` does not reach vitest on this branch — and not because of this branch

`npm test` chains seven gates before `vitest run`, and
`scripts/check-ledger-timestamps.mjs` **fails on master**, so the suite was run as
`npx vitest run` and the aggregate above is vitest's own.

The offending entry is not mine. `git diff master...HEAD -- docs/lane-log.jsonl` is
**empty** — this branch does not touch either ledger:

```
TWO IN-SCOPE ENTRIES SHARE ONE STAMP (1)
  2026-09-03T06:28:00Z  70500938 then 70500938
  "Why the band tooling loses you on arrival: the good door is hidden and t…"
```

That is the **O55 lane's** lane-log entry, in commit `70500938`, which is master's
tip and this branch's parent. Its own gate says the remedy is a follow-up commit by
whoever wrote it, so it is reported here rather than rewritten by me. **Anyone
running `npm test` in aurora right now is blocked by it.**

## Environment caveat

A linked agent worktree has no `node_modules` and no `dist/`. `node_modules` was
symlinked to the main checkout's and `dist/` was **built in place from this branch's
source**, so `runTarget()` announced `in-tree` rather than `BORROWED`:

```
root: …/.claude/worktrees/agent-a4fcd43115014e9e3
      in-tree: …/agent-a4fcd43115014e9e3 has node_modules/.bin/electron and dist/main/index.mjs
```

The probe therefore measured this branch's source, not the main checkout's.

## Blocked on an owner decision

**Nothing.** None of the parcel's five out-of-scope owner decisions (tilt snapping,
how many moves get tilted art, automatic loop layering in the build tool, two-player
support, sprite-DMA debt) was reached — the measurement did not need any of them, and
the three recommendations above are presentation changes inside the existing panel.

## Screenshots

- `scratchpad/shots-o56-loop-authoring-door/collision-facet-arrival.png` — one click
  from arrival, nothing armed. This is the screen the finding above is about.
- `scratchpad/shots-o56-loop-authoring-door/collision-facet-armed.png` — after
  `A+B` and `Hand → B`, with both lens hints on screen.
