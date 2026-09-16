# Regions step 8B: the region tool wired to the map, and 8A's two tagged defects

Editor spec (empyrean `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`
at `origin/main`, read through `git show` and never through the sibling working tree)
§3.1, §3.2, §3.3, §3.4, build-plan row 8, **second half**. **Say which spec**: the ENGINE
half, `2026-09-14-regions-part-2-design.md`, numbers its steps independently and collides
with this one.

Branch `parcel/regions-step8b-wiring` in `/home/volence/sonic_hacks/aurora-wt-regions8b`,
cut from master `16b42a63`. Last code commit `dcbd9ada`; this packet is the branch tip
(a document cannot cite its own SHA, so the controller records the tip at the merge).

| SHA | what |
|---|---|
| `3993a6ad` | **A.** `setRegionBinding` edits every entry sharing the id; the no-op short-circuit audited and changed |
| `27ea42df` | **B.** one list row per region ID, `rects` + `entryIndices` alongside, panel consumers fixed |
| `ea54434e` | **C1.** `region` enters `TOOL_IDS` / `TOOL_KEYS` / `FACET_TOOLS.regions` / the dock, with a glyph |
| `b1fa2c91` | **C2/D.** `map-region-gesture.ts`: the drag as a machine the node suite can drive |
| `f1bd2f62` | **C2.** `MapViewport` answers the tool: press, move, release, overlay |
| `dcbd9ada` | the no-document toast names a control the panel actually builds |

## How verified

`npm test` in the worktree, **foreground**, the whole chain (15 `check:*`/guard scripts,
then `tsc --noEmit`, then `vitest run` — vitest v4.1.4). Aggregate totals from the runner,
not a tail excerpt.

| run | Test Files | Tests | exit |
|---|---|---|---|
| **baseline at `16b42a63`** | 1 failed, 639 passed, 3 skipped (643) | 1 failed, 10033 passed, 9 skipped (10043) | **1** |
| **final, this branch** | 1 failed, 641 passed, 3 skipped (645) | 1 failed, 10069 passed, 9 skipped (10079) | **1** |

`+2` files and `+36` tests: 16 in `src/renderer/components/__tests__/map-region-gesture.test.ts`,
6 in `src/renderer/components/__tests__/map-region-wiring.test.ts`, 10 in
`test/renderer/regions-panel.test.ts`, 4 in `src/renderer/workspace/__tests__/facet-tools.test.ts`.

### ⚠ THE BASELINE WAS ALREADY RED, AND IT IS THE SAME ONE ROW AT THE END

`test/formats/regions-schema-drift.test.ts` — *"NOT AN AURORA REGRESSION: the vendored
regions schema is stale"* — failed at `16b42a63` **before I touched anything** and fails
now. **Exactly one row, the same row, in both runs**; every other row in the suite is
green in both. It is a **peer-currency** gate, not a test of this repo's behaviour.

**What drifted, read firsthand rather than inferred from the message.** The vendored pin is
empyrean `b1ba5204`; `origin/main` now carries **`dc58782`**, *"aurora's click landed;
region ids are deliberately non-unique, answered from the spec rather than by asking either
lane"*. I read the whole diff: it is **pretty-printing plus one paragraph of `description`
prose**. **No keyword was added, no constraint changed, nothing widened or narrowed.** The
paragraph is the hub banking duplicate ids as an explicit **non-constraint** — *"Every
emitted symbol is keyed by ROW INDEX … An L-shaped region is SEVERAL rows sharing one id by
design"* — which is the ruling **this parcel's whole model rests on**.

**I did NOT re-vendor, deliberately, and that is invariant 4's escape hatch rather than a
shortcut.** `aurora-regions.schema.provenance.json` defines a re-pin as its own procedure
with ten sidecar fields to rewrite, a paired re-vendor of `test/fixtures/regions/
regions-vectors.json` at the same revision, and a named zsh trap that truncates the vendored
file to zero bytes while the re-hash answers the empty blob for everything at once. That is a
currency parcel with its own protocol and its own failure modes, it is not step 8B, and doing
it badly would be worse than leaving a row that already says in its own assertion message
that it is not an Aurora regression. **TAGGED below.**

### Red-first: every mutation applied on disk from a COMMITTED baseline

Procedure for each row: `git status --porcelain` verified **empty**, the mutation written
into the file, `git diff -U0` printed to show it applied, the test file run, then
`git checkout --` from the commit and `git status --porcelain` verified empty again. No
mutation was measured on a dirty tree (8A's own contamination, invariant 8(b)).

| # | file | mutation, as applied | reds |
|---|---|---|---|
| A1 | `regions-aeon.ts` | `for (const i of indices) write…` → `write…(next.regions[indices[0]], …)` (the original `findIndex` defect) | 2: every entry agrees on every key; drifted entries repaired |
| A2 | `regions-aeon.ts` | `indices.every((i) => …value)` → `regionBindingValue(doc.regions[indices[0]], key) === value` | 1: drifted entries repaired |
| A3 | `regions-aeon.ts` | `if (doc.regions[i].id === regionId) indices.push(i)` → `indices.push(i)` | 2: no other region's entries change; the existing no-op/unknown row |
| A4 | `regions-panel.test.ts` | the second `forest` entry deleted from `carvedDoc()` (single-piece fixture) | **3** — the anti-vacuous floor fires on every row |
| B1 | `regions-aeon.ts` | `regionEntryGroups(doc).map(…)` → `doc.regions.map(…)` (one row per entry again) | 5 of the 6 new list rows |
| B2 | `regions-aeon.ts` | `rect: unionBounds(rects) ?? first.rect` → `rect: first.rect` | 1: the bounds are not the shape |
| B3 | `regions-aeon.ts` | `if (o.idA === o.idB) continue;` deleted | 1: a region does not name itself |
| B4 | `regions-panel.test.ts` | `lShapedDoc()`'s second `forest` renamed to `foot` (no shared id) | **3** — the floor fires |
| C1-M1 | `facet-tools.ts` | `regions: ['view', 'region']` → `['region', 'view']` | 2: `view` still leads; a switch arms `view` |
| C1-M2 | `tool-meta.ts` | `region: 'g'` → `'x'` (the flip key) | 1: no tool letter collides with the map's other bare letters |
| C1-M3 | `tool-meta.ts` | `region: 'g'` → `'r'` (place-ring's) | 2: a letter no other tool answers to; no two tools share a letter |
| D1 | `map-region-gesture.ts` | `oldDocument: cloneRegionsDocument(doc)` → `(out.document)` | 2: one undo restores everything; the halves share no object |
| D2 | `map-region-gesture.ts` | the `refused` return → `{ kind: 'none' }` | 1: a draw with no selection is refused |
| D3 | `map-region-gesture.ts` | `regionPressAt(…, zoom)` → `(…, 1)` | 1: the grab band is screen px |
| D4 | `map-region-gesture.ts` | `effectiveRegionSnap(invert)` → `(false)` | 1: Ctrl inverts the snap |
| D5 | `map-region-gesture.ts` | `sameRegions`' `.sort()` deleted (order-sensitive again) | 2: a press that did not move; a permutation is not a change |
| D6 | `map-region-gesture.ts` | `NO_REGIONS_HERE` reworded off "Migrate sections" | 1: the sentence names a control the panel builds |
| W1 | `MapViewport.tsx` | `useViewStore.getState().zoom` → `1` in the press | 1: the press hands over the real zoom |
| W2 | `MapViewport.tsx` | `&& inRegionsFacet()` deleted from the press gate | 1: gated on both the tool and the facet |
| W3 | `MapViewport.tsx` | `endRegionDrag();` deleted from `finishGesture` | 1: a release ends the drag, one write |
| W4 | `MapViewport.tsx` | `addToast(outcome.reason, 'warning')` → a comment | 1: a refused gesture reaches a toast |
| W5 | `MapViewport.tsx` | the drag arm of the overlay's `pieces` deleted | 1: the overlay draws from the gesture |
| W6 | `__tests__/helpers/section-panels.ts` | `code()` returns the raw file (stripper disabled) | 1: the file-wide comment-stripping control |

**Three of my own assertions were wrong before any mutation was applied, and all three were
my error rather than the code's.** They are listed because a row that had to be corrected is
the one a reader should be most suspicious of:

* **`trimmedIds` on a draw includes the region drawn INTO.** I expected `['a','b','c']` over
  four stripes and got all four. Correct: a DRAW hands its own existing pieces to
  `applyDraw` along with everyone else's — only move and resize take the pressed piece out
  first, so the region gains the band and its old stripe is split by it. The floor is now
  derived from the fixture's own id list rather than typed.
* **The file-wide comment-stripping control was vacuous, twice.** V1 probed for a sentence
  that lives in `map-region-gesture.ts` and was never in `MapViewport.tsx` at all — true of
  any file, so the control asserted nothing while every row beneath it could have been
  passing on a comment. V2 probed a phrase the subject's comment **wraps across two lines**,
  so it never carries contiguously. It is two-sided now: **present in the raw bytes, gone
  from what the rows read**, and W6 proves it goes red when the stripper stops stripping.
* **A zero-delta move is not a no-op under an order-sensitive comparison** — see the finding
  below. That one changed the code, not the test.

## Item A: `setRegionBinding`

Every entry sharing the id is edited. The four key arms moved into `writeRegionBinding` so
the loop writes them once.

**The no-op short-circuit, audited and changed.** The representative for **display** is the
first entry — that is what `regionsPanelState` resolves with `.find()` and hands to
`regionBindingRows`, and what `applyRegionGestureToDocument` templates from. **For the
short-circuit there is deliberately no representative**: the refusal is now *"every entry
already carries this value"*, never *"the first one does"*. A document whose entries have
drifted apart must not be read as already-that-value and skipped — asking the first entry
alone would refuse the one edit that **converges** them, and the disagreement would be
unfixable from the panel. A drifted id always writes; writing always converges. A2 and A3
are that pair.

**The property, stated:** after a binding edit on a region holding ≥2 entries, **every**
entry of that id agrees on **every** binding key, and no other region's entries changed. It
is a **census over `BINDING_ORDER`**, not over the edited key alone — a fix that wrote `key`
to every entry but left the other three as they were on entry 0 would still leave the pieces
disagreeing. The fixture's two `forest` entries are **not adjacent** (`night` sits between
them), so a fix that walked a contiguous run from the first match fails instead of passing by
luck of the ordering. Every row asserts ≥2 entries **before** the edit; A4 proves that floor
fires.

## Item B: the controller's ruling, adopted as written

**Adopted unchanged.** One row per **id**, first-appearance document order, `rect` = the
union bounds of the pieces, `unionBounds` **imported** from `canvas/region-overlay.ts` (both
modules under `src/renderer`) and not copied. Nothing about it forced a worse design, and
the module header's *"list order carries no meaning / no sort"* rule still holds: grouping
only removes repeats, each id keeps its first entry's position.

**Blast radius, measured before the change.** Every consumer of `regionListRows` /
`RegionListRow` / `regionsPanelState` in the tree: `RegionsPanel.tsx`,
`test/renderer/regions-panel.test.ts`,
`src/renderer/components/regions/__tests__/act-row-visible-reason.test.ts`. **There is no
`debug-hooks.ts` consumer** — the brief named one; `regionListRows` appears nowhere in
`src/renderer/debug-hooks.ts`. **Nothing in production read `.index` at all**: selection is
by `selectedRegionId` and `RegionRow`'s key is `row.id`; only one test read it.

**The per-entry view is added alongside, not overloaded onto one field**, which is what the
brief asked for if a consumer genuinely needed it:

* `index` stays, **redefined** as the id's FIRST entry, with the change of meaning written on
  the field. It is the same representative `setRegionBinding` converges onto.
* **`entryIndices: number[]`** — every `doc.regions` index the row covers.
* **`rects: RegionRect[]`** — the pieces themselves, so the panel can say the region is
  several rectangles. `rect` is their bounds and **for an L-shape those bounds include the
  notch**. The panel now prints §3.4's own words (*"1 rect"*, *"2 rects"*) on **every** row,
  not only carved ones: a mark that appears only in the bad case is a state represented by
  absence, which is the house rule the act row is already about.

**`overlaps` folds entry pairs onto ID pairs and drops same-id pairs.** The hazard the mark
exists for is the one the Q1 ruling created — *"where two regions share a pixel the engine's
answer depends on its own scan order"* — and two entries of ONE id are not that: every scan
order answers with the same region, so `overlaps: ['forest']` on forest's own row would be a
warning about nothing in the field an author reads to find which OTHER region to move. **It
is not swallowed**: the `overlap` STATUS row still counts and names the pair, and a row
asserts exactly that, so the drop is visible rather than a hole.

**One thing named on screen rather than left to be discovered.** The detail pane's four rect
fields resolve the FIRST entry (`state.selected` and `RectFields`' own `.find()`), so on a
carved region they edit rectangle 1 and the others are not on screen at all. §3.4's mock
answers this properly with a per-rect list (*"rects #1 …"*, Carve, Fit to 16) which is not
built; until it is, the pane says so in the warning tone.

## Items C and D: the tool, the wiring, one gesture one undo

**The letter is `g`, and the table it was checked against is named in the comment:**
`TOOL_KEYS` in full (v/s/m/t/b/k/c/o/r/n/d at this edit — letters are unique across the
WHOLE vocabulary, not per facet) **and the map's other bare letters, which `TOOL_KEYS` does
not contain and which no test covered until now.** `flipAxisForKey`
(`src/renderer/components/map-flip.ts`) answers `x` and `y` in the same window keydown and
runs **ahead of** `toolForKey`, so a tool bound to either would silently never arm whenever a
flip target was live. That gap is a row now, derived by probing `flipAxisForKey` over the
alphabet rather than transcribing x/y, with a control that fails if the flip module stops
answering. The obvious `r` is place-ring's.

**`view` stays first and the row asserts the ORDER, not the membership** — and does it
through the real `switchFacet` from a foreign tool, with a control showing the facet does
accept `region`, so the row is about `view` leading and not about `region` being rejected.

**The gesture is a pure machine** (`src/renderer/components/map-region-gesture.ts`), on the
`map-band-stamp.ts` / `map-flip.ts` split this directory already makes and the reason either
of them is testable at all. `MapViewport` owns the pointer events, the zoom and the toast.

**Three outcomes, not two, and "nothing happened" is not "I refused".** `regionDragCommand`
answers `command`, `none` or `refused`, never a nullable command: a press that did not move
wants silence, a press the layer would not honour wants a sentence, and collapsing them into
`null` is how a refusal becomes invisible.

**The reachable refusal, proven.** §3.2's table says a plain drag with no selection makes *"a
new region with that rect"*. **The landed contract cannot express one**: `preset` is required
per region with no act-level preset to inherit, and copying a neighbour's would give the new
region somebody else's identity silently. So the draw goes to the layer with a **minted id
and no template**, the layer refuses with **its own words** (one author, in 8A), and the
machine appends one sentence from a constant so a retyped expectation cannot go green against
a toast that says something else. D2 reddens it.

**One gesture, one undo, asserted as a property and not as a count.** The undo row builds
four stripes, drags a band across all four, asks the **real `EditHistory`** for exactly
**one** undo, asserts the whole pre-gesture document returns, and asserts **there is nothing
left to undo**. The floor — that the gesture really split several regions — is derived from
the fixture's own id list.

### A finding met while writing the no-op guard, which changed the code

**A zero-delta move — a plain CLICK inside the selected region — comes back from the layer
REORDERED.** The pressed piece leaves the set so it cannot carve itself and `applyDraw` puts
it back at the **end**, so the same rectangles return in a different order. My first
`sameRegions` was order-sensitive and read that as a change: **an undo entry, and a rewritten
file on the next save, for a click.** It is order-**insensitive** now, and that is not a
convenience — `region-geometry.ts`'s header rules that there is no painter's order and *"list
order carries no meaning"*, so a permutation is the same document to the engine, the
generator and the panel. A dedicated row asserts the layer really does permute, so the no-op
row is not vacuous; D5 reddens both.

### The viewport

Press gated on the tool **and** the facet on one line (§3.1: the facet is the only
disambiguator), after the guides and the screen frame, before the pan fall-through, with the
**real zoom** passed. Move reads `e.ctrlKey` on **every** move and never latches it at the
press — `applyMarqueeSnap` next door is written the same way for its stated reason. Release
through `finishGesture`, so mouseleave and unmount tear a drag down identically; **one
`executeCommand` on the whole path**, and the document **re-read at commit time** so an act
switch mid-drag cannot commit against a stranger.

**A press with no regions document is not a silent pan.** It says so and names the door.
Falling through to the pan was the quieter answer and the wrong one: the tool is armed, so
the author is asking for a rectangle.

**The overlay** draws last with the guides, facet-gated, and **during a drag its pieces come
from `regionDragPreview`** — the same `applyRegionGesture` the release will run, so the carve
is on screen **before** the button comes up rather than after the undo entry is written. Its
regions come from `regionListRows`, so the map's hue order, labels and background line are
the panel's derivation and not a second composition of the 2026-09-16 background ruling.

## What I did NOT verify

**Nothing in this parcel has been on a screen.** Not one pixel, not one pointer event.

`map-region-wiring.test.ts` is a **source scan** on the `map-surface-listeners.test.ts`
precedent, and its own header says what it asserts: that `MapViewport.tsx` **names** these
entry points and passes the real zoom. **It cannot see that any of it runs.** A listener that
is never attached, a branch an earlier `return` makes unreachable, a repaint that never
fires, and a canvas that throws all read as PASS. Specifically untested by anything here:

* that a mouse press on the real canvas reaches the region branch at all, rather than being
  swallowed by one of the dozen earlier exits in a 4,700-line handler;
* that `drawRegionOverlay` paints anything, that it paints in the right place, or that the
  live carve preview is legible at an authoring zoom;
* that the toast appears, is readable, and dwells long enough;
* that the new `IconRegion` glyph is distinguishable from `IconRect` and `IconSelect` in the
  dock at 18px — that is an eye, not a test;
* that the `g` key arms the tool in the running app (the table is asserted; the keydown path
  is not);
* that a resize handle is grabbable with a real mouse at a real zoom on a real display —
  the arithmetic is tested, the fingertip is not.

**No emulator was called and none may be from a background agent.**

## TAGGED for the controller's foreground follow-up

1. **Drive the whole gesture under CDP.** Open an act with regions, arm `g` in the Regions
   facet, and check each arm on screen: draw over another region (carves), drag inside the
   selection (moves), drag its edge (resizes) **at a zoom other than 1**, Ctrl for the fine
   snap, and one Ctrl+Z restoring the lot. The refusal arm (no selection) and the
   no-document arm both want to be seen, not just returned.
2. **The overlay over real level art** — 8A's own tag 4, still open and now reachable.
   Legibility, hatch density at an authoring zoom, and whether the orange/screen-frame pair
   reads as two things. The owner's eye.
3. **The vendored regions schema is stale and the suite is red for it.** Re-pin from empyrean
   `dc58782` per `aurora-regions.schema.provenance.json`'s `re_vendor` field, **including the
   paired vectors and the zsh brace trap it names**. The upstream change is pretty-printing
   plus one paragraph of description prose banking duplicate ids as a **non-constraint**; no
   keyword changed, so I expect no Aurora assertion to need widening — **but that is a
   prediction from reading the diff, not a measurement**, and the sidecar says the
   keyword-coverage gate is what tells you which `json-schema-subset.ts` edits a re-vendor
   forces. Not attempted here: invariant 4, unclear ownership plus a procedure with its own
   named failure modes.
4. **The per-rect list in the detail pane** (§3.4's *"rects #1 …"* plus Carve and Fit to 16)
   is not built, so the four rect fields edit rectangle 1 of a carved region and say so in
   a warning line. That line is a stopgap; the list is the answer.
5. **`regionStatusRows`' disjointness `else` arm counts PIECES and says "regions"** —
   *"No two regions overlap (N regions checked)"* where N is `pieces.length`. Harmless until
   now and wrong the moment a region is several entries. Left alone deliberately: it is not a
   `regionListRows` consumer and changing status text was outside this parcel's four items.
6. **No lane-log entry and no ROADMAP row were written.** The landing procedure is the
   controller's, and a same-second ledger entry refuses a landing.
