# Solid on both planes — the capability says its own name before you arm it

**Branch** `feat/loops-say-solid-both`, cut from `master` `30e42383`.
**Subject** the collision palette's discoverability of "solid on both planes", a
capability that shipped **2026-08-29** and that nothing an author could see
mentioned.

**Deliverable** one sentence in the collision palette's OFF state, one clause
added to its ON state, one constant, and a registered CDP harness
(`npm run harness:collision-say-both`, 12/12) that can see rendered text the
node suite cannot.

---

## 1. What was actually missing — and what was not

**Not the code.** `src/core/collision/both-planes-paint.ts` is complete and
correct; `buildBothPlanesEntries` is called by the map brush and by the agent
path, `solidOnBothPlanes` is the derived fact the lens draws, and
`npm run harness:loop-paint` proves the two-plane stroke on the running app.
**No new cell state was added here and none was needed** — the word is sixteen
of sixteen bits (shape 0-9, xflip 10, yflip 11, solidity 12-13, crossover 14-15)
and "both" is a gesture, not a field. That argument is made in full in that
module's header and is not restated in the product.

**Not the words either — their REACHABILITY.** Before this branch the palette
already said what the mode does, twice, and an author could reach neither:

| where | when an author sees it |
|---|---|
| the `A+B` chip's `title` (7 lines of prose) | **on hover only** — and nothing on a three-letter chip invites a hover |
| the hint under the Loop row | **only once `bothPlanes` is already true** — it explains a mode to the reader who already found it |
| `setCollisionPaintBothPlanes`'s toast | **only on arming**, same gate |

So the panel's entire explanation of the feature was gated on already having
used the feature. That is the shape of the reported failure: a design note
proposed "solid on both planes" as a third cell state and two lanes costed out
spare bits for it, five days after it had shipped as a gesture.

**The fix is the OFF branch of that same hint** — the only text in this panel
that reaches a reader who has not armed the mode.

## 2. What an author now sees, and where

The collision facet's side panel (`CollisionPalette`, `variant="map"`), in the
hint column below the Loop row — the panel's own explanation area, where the
armed sentence already lived.

**Mode OFF (the state an author lands in):**

> Ordinary ground — floors and walls the player meets on either path — belongs
> on both planes. **A+B** above paints plane A and plane B with one stroke, so
> shared ground is drawn once instead of twice.

**Mode ON (existing sentence, one clause added):**

> Painting **both paths**: every stroke writes plane A and plane B together, one
> undo step. The teal veil marks what is already solid on both. **Reset and
> Clear still act on plane A alone.**

Both are one conditional — `{variant === 'map' && (bothPlanes ? … : …)}` — so
they inherit the **same gate the `A+B` chip has**. The Art facet's chunk
collision brush is a different writer (`composer-collision.ts`) that does not
honour this mode; it gets neither sentence, and that is one gate, not a second
claim to keep in step.

`BOTH_PLANES_LABEL` is now a constant, used by the chip and by the sentence that
names it. Two copies would let a rename leave a sentence pointing at a control
that no longer exists — this hint's own defect, inverted.

## 3. What the capability actually covers — measured, not assumed

**The claim in the sentence is "one stroke", and that word is the scope, not
prose.** `collisionPaintBothPlanes` is read by exactly two writers in the tree:

| reader | covered? |
|---|---|
| `MapViewport.tsx` `paintCollisionCell` — the map collision brush | **YES**, all brush sizes (1/7/15/25) and Alt-propagate, latched at mousedown so toggling mid-drag cannot split a gesture |
| `agent-handler.ts` `paint_collision` with `plane: "both"` | **YES** (its own wording, not this panel's) |

And the collision writers that **do not** consult it — checked by enumerating
every `type: 'set-collision-edit'` producer in `src/`:

| writer | behaviour, and why the sentence must not imply otherwise |
|---|---|
| `CollisionPalette` **Reset** / **Clear** | act on the **aimed** plane alone, always. With `A+B` armed this is the surprising one, so the armed sentence now names it. Their own titles already said "(this plane)". |
| `map-stamp.ts` (paste / stamp) | writes **each plane from the clipboard's own two planes** — plane-faithful by construction, neither helped nor harmed by the mode. |
| `chunk-links.ts` (linked-chunk propagation) | same shape: a chunk doc's own two planes propagate into placements. |
| Art facet chunk brush (`composer-collision.ts`) | not extended; hence the `variant === 'map'` gate on both sentences and on the chip. |

**So the phrase "solid on both planes" is NARROWER in the editor than it sounds
in the abstract**: it is a paint stroke that writes two planes, not a mode that
makes every collision gesture two-plane. The sentences say "stroke" for that
reason, and the armed one names the two controls an author is most likely to
reach for next and be wrong about.

One claim in the pre-existing chip `title` was checked rather than trusted:
"Turns on the 'Solid on both paths' lens". **It is true** —
`setCollisionPaintBothPlanes` sets the `showSolidBothPlanes` overlay and toasts,
on arming only (not on disarming). Harness row `[c3b]` pins it, so the armed
sentence's "the teal veil" is not describing an overlay that might be off.

## 4. Design calls made without asking

1. **A sentence, not a new control.** The gesture already exists, is already one
   press, and already surfaces its own lens. Adding an affordance would have
   added a second way to do a thing whose problem was that nobody knew about the
   first. *Chosen: prose.*
2. **Where.** The hint column, not inline under the Plane row. It keeps the
   control rows compact, puts the new text where every other explanation in this
   panel already is, and leaves the armed sentence's position unchanged — so no
   peer's rows move.
3. **Which caveat goes where.** The Reset/Clear narrowing rides on the **armed**
   sentence only. In the OFF state the reader has armed nothing and the caveat
   would be noise; in the armed state it is the next mistake they can make. The
   OFF sentence carries its scope in the word "stroke" instead.
4. **`A+B` stays `A+B`.** Renaming the chip to something self-describing was
   considered and dropped: the label is referenced by peers' harnesses and by the
   undo-stack description (`Paint collision A+B (n blocks, both planes)`), and a
   sentence is cheaper than a rename that has to stay in step in five places.

## 5. Proof

**`npm run harness:collision-say-both`** — new, **registered in `package.json`
in the same commit that created it** (`harness:collision-say-both`), 12 rows,
CDP over the built app under xvfb, opening the real `../aeon` **read-only**.

It **writes nothing**: no poke, no stroke, no save, and no project identifier at
all — so there is no probe id here to collide with a peer's. Row `[d1]` asserts
the undo stack is still empty at the end. Discovery files and the process tree go
through `lib/harness-guard.mjs`; `assertFreshBuild(RUN)` refuses a stale or
drifted bundle before anything is measured. The run was **in-tree**, not
borrowed: the worktree was given a `node_modules` symlink and built with
`VITE_AURORA_DEBUG=1 npm run build`, so `run-root` reported
`in-tree: …/agent-af4ea79caba060777`.

**Expectations are derived, not typed.** §TEXT parses `BOTH_PLANES_LABEL` and
both hint branches' literal prose out of `CollisionPalette.tsx` itself, so a
reworded hint re-derives and stays green while a hint that stops rendering goes
red. Row `[lbl]` compares the derived label against what the **running build**
renders — the only row that can catch a stale `dist/`.

```
PASS [lbl] the RUNNING build renders the chip with the label the hint names
PASS [c0]  the both-planes mode starts OFF (asserted via armCollisionBrush, not assumed)
PASS [c1]  with the mode OFF the palette already SAYS solid-on-both is paintable, unhovered
PASS [c1b] the idle sentence names the chip exactly as the chip renders it
PASS [c1c] the idle sentence is not the armed sentence
PASS [c3]  a real mouse press on the chip ARMS the mode (the STORE changed)
PASS [c3b] arming surfaced the both-planes lens
PASS [c4]  armed: the armed sentence renders and the idle one is GONE
PASS [c5]  the OFF and ON readings are different sentences
PASS [c6]  the armed sentence names the AIMED plane in its caveat, and follows the plane chip
PASS [c7]  a second press disarms and the idle sentence returns
PASS [d1]  this run made NO document edit
════ 12/12 ════
```

Two rig rules kept deliberately:

- **`.click()` is not used.** Every press is `Input.dispatchMouseEvent` at
  integer client pixels, and the aim is verified with `elementFromPoint` BEFORE
  the press — a miss throws `AIM REFUSED` rather than reading the previous
  screen as a result.
- **The paint trio is not trusted.** `checkVisibility()` / `getClientRects()` go
  green on an element scrolled out of its scroller, so `[c1]`/`[c4]`/`[c7]` hit-
  test the element's centre; a miss scrolls it into view, retests, and reports
  `scrolled`.

### 5.1 Red-first — four mutations, each on the committed baseline

Each was applied to `a380791c`'s tree, shown with `git diff`, **rebuilt**, and
(for the three rendered ones) **found in `dist/` before the run**; each was then
restored with `git checkout --` from the commit, and the final run below is from
that restored tree.

| # | mutation (line, off disk) | in `dist/` | result |
|---|---|---|---|
| M0 | the idle branch deleted — literally master's shape: `- {variant === 'map' && (bothPlanes ? (` / `+ {variant === 'map' && bothPlanes && (` | n/a (refused before launch) | **REFUSED, exit 2**, naming the file and why: the conditional is the gate that keeps the Art variant clean, so an unrecognised shape is unmeasurable, never a pass |
| M1 | `- <div style={styles.hint}>` / `+ <div style={{ ...styles.hint, display: 'none' }}>` on the idle branch | `…styles$10.hint, display:"none"…` beside `"Ordinary ground —"` | **10/12** — `[c1]` and `[c7]` RED with the reason printed (`zero-area rect` after a scroll attempt). `[c1b]`/`[c1c]` stayed green **correctly**: they assert wording, not paint. |
| M2 | `- onClick={() => setBothPlanes(!bothPlanes)}` / `+ onClick={() => { /* dead chip */ }}` | `onClick: () => {}` immediately before `title:"Solid on BOTH paths…"` | **7/12** — `[c3] [c3b] [c4] [c5] [c6]` RED |
| M3 | the armed caveat deleted: `- already solid on both. Reset and Clear still act on plane {plane.toUpperCase()} alone.` | `grep -c "Reset and Clear still act on plane" dist/…` → **0** | **11/12** — `[c6]` RED, printing the same text for plane A and plane B |

**One honest weakness, found by M2 and reported rather than papered over:**
`[c7]` (disarm restores the idle sentence) **passes vacuously against a dead
chip** — nothing ever armed, so "the idle sentence is present and the armed one
is not" is trivially true. `[c3]` is its guard and is the row that cannot be
satisfied without the store actually changing. `[c7]` is meaningful only in a
run where `[c3]` is green, which is why both are in the same run and neither is
read across runs.

## 6. `npm test`

See §7 for the figure. **Worktree reconciliation (invariant 9):** `npm test`
reads **one fewer pass and one more skip** in a linked worktree than in the main
checkout, because `sibling-root` step 3 is unmeasurable there. Master `30e42383`
is 6844/7 in the main checkout and 6843/8 here — **identical totals, 6851**.
This branch adds **no node rows** (its subject is rendered text, which vitest
cannot see), so the expected reading here is 6843 passed / 8 skipped, unchanged.

## 7. Numbers

- `npm run harness:collision-say-both` — **12/12**, twice on a clean tree
  (first green run and the post-restore run).
- `npm test` — **6843 passed / 8 skipped**, 0 failed, identical to master read
  in this worktree (see §6 for the main-checkout reconciliation).
- `npx tsc --noEmit` — clean.
- No emulator was touched. `../aeon` was opened **read-only** by the harness and
  never written; no sibling checkout was written to.
