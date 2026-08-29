# Painting a loop: the crossover, and "solid on both paths"

**Branch** `lp2-loop-paint` · **Project** LOOPS-P · item **LP-2**
**Commits** `d1ac8c7` (the implementation) · `00685db` (50 node rows) · `b4f1bf6` + `05feab0` (45 CDP rows)
**Instrument** `scratchpad/loop-paint-harness.mjs` — `npm run harness:loop-paint`
**Seam module** `src/core/collision/layer-transition.ts` — the ONE place a bit number lives
**Anchor** `git -C ../aeon show aa2a9f29:docs/LOOP_CROSSOVER_ENCODING.md`

---

## 1. What shipped, and the split that let half of it ship without waiting

The item is two features, and treating them as one would have blocked both.

**"Solid on both paths" needs no encoding at all.** Aeon's Route P proposed it as a
third cell state riding in spare bits. It is not a state. In the per-plane model each
plane already carries its own 16-bit word, so "solid on both" is exactly "non-zero
solidity in both words" — aeon's `bake_plane_cell` already reads them independently, and
the owner is already authoring **1,056 cells of it** (measured live by the harness's
`[fx1]`, agreeing with aeon's `fde35b2f` figure). What was missing was never
expressiveness, it was **the gesture**: an author had to paint shared ground into two
files by hand, and 780 cells of section 0 are still solid on exactly one plane.

So this half is a **brush mode** — one stroke, two planes, one undo step — and it shipped
complete: model, gesture, undo, lens, MCP, persistence.

**The crossover does need the field, and solidity cannot fake it.** I verified this
myself rather than accepting it. `Sst.layer` has **exactly one writer in the whole aeon
tree**, enumerated not sampled:

```
$ git -C ../aeon grep -n "Sst.layer" origin/master -- games/ engine/
games/sonic4/objects/path_swap.emp:135:        move.b  d0, Sst.layer(a1)
```

plus `player_common.emp:503 clr.b layer(a0)` at init. Every other reference in
`player_sensors` (×3), `player_climb` (×4) and `player_glide` (×1) is
`move.b layer(a0), d3` — a **read into the sensor's plane-select register**.
`Collision_GetType`'s only use of `d3` is `tst.b d3 / beq / addi.w #TILE_CACHE_COLL_SIZE`,
a plane select on the fetch that returns a byte and writes nothing. **There is no
solidity → layer path, and no assignment of solidity bits on either plane can create
one.** The hub's read was right and I found nothing to correct it with.

---

## 2. The encoding seam

`src/core/collision/layer-transition.ts` is the only module in Aurora that knows a bit
number for this field. Everything else — the brush, the two paint roads, the lens, the
audit, the MCP schema, the harness — refers to a crossover **by name**.

| | |
|---|---|
| word | Aurora's **per-plane** cell word (`bake_plane_cell`'s), never the donor chunk-entry word |
| bits | 15:14 · `CROSSOVER_SHIFT = 14`, `CROSSOVER_VALUE_MASK = 3` |
| values | `0` none · `1` to-a · `2` to-b · `3` **RESERVED, illegal** |

Three properties are worth naming because each is a defect this repo has already paid
for once:

**The reserved value is unrepresentable, not range-checked.** `withCrossover` takes a
named `Crossover` and there is no argument to it that produces 3. That is the `v_factor`
sentinel finding applied at the type level: a clamp into range lands on top-of-range, and
top-of-range here is a hard bake error. `readCrossover` **reports** a 3 it finds as
`'reserved'` rather than normalising it to `'none'` — silently rewriting someone's data
to hide a build error is worse than the build error.

**`keep` cost nothing to build, and that is the whole argument for the 2026-08-28 parcel.**
Because the preservation rule was stated as a mask complement — *"the brush owns its
fields, the cell keeps the rest"* — rather than as "preserve bits 15:14", every collision
stroke, stamp, paste and agent call in the editor has been carrying crossovers correctly
since before they meant anything. A literal `0xC000` in that parcel would have had to be
revisited today. The node test asserts the coincidence rather than relying on it:
`expect(COLLISION_CELL_UNOWNED_MASK).toBe(CROSSOVER_BITS)`.

**The currency rows parse the peer, they do not trust this file.**
`test/collision/layer-transition.test.ts` reads the anchor at `aa2a9f29` through
`test/support/peer-repo.ts`, pulls `XOVER_SHIFT` / `XOVER_MASK` and the four value-table
rows out of the markdown, and asserts the self-mark rule is still stated in it. A second
row reads `tools/collision_pipeline.py` and asserts `PATH_B_SOL_SHIFT === CROSSOVER_SHIFT`
— so the collision between the two word spaces is a **measured fact in this repo** rather
than a sentence in a document. Both rows go red under the shift plant, so they measure
the blob rather than passing on a regex that matched nothing.

---

## 3. ⚠ The self-mark constraint, and a contradiction in the anchor

The anchor's §3.3 carries a constraint the relay to this lane did not include, and it is
the single most shape-determining fact in the parcel:

> **Self-marks are illegal.** A plane-A cell carrying `XOVER_TO_A` (or plane-B carrying
> `XOVER_TO_B`) is provably a no-op ... the bake refuses it (rule R2).

**Per plane the field therefore has only TWO legal values**: none, and "hand off to the
other plane". So Aurora's brush is `keep` / `clear` / `hand-off`, and **the illegal state
is unreachable rather than guarded** — `crossoverFor` is the one place a plane becomes a
value, and there is no brush setting on any plane that yields a self-mark
(asserted by a sweep over the whole vocabulary × both planes). It also means **one armed
brush paints both halves of a two-way loop**: `hand-off` is TO_B on plane A and TO_A on
plane B, and that per-plane pair *is* the toggle the encoding deliberately has no value
for.

### The contradiction, reported rather than papered over

§3.3 justifies per-plane values over a toggle like this:

> a per-plane pair `{TO_B on A, TO_A on B}` *is* a toggle, and the pair `{TO_B, TO_B}` is
> an absolute one-way force that a toggle cannot express.

`{TO_B, TO_B}` means plane B's word carries TO_B — **which is exactly the self-mark the
same section declares illegal and rule R2 refuses with a hard build error.** The
*conclusion* survives; the *example* does not. A one-way force is `{TO_B on A, NONE on B}`,
because a player already on B needs no mark to stay there. **An author who followed
§3.3's literal example would red the build.** Aurora encodes the force the second way and
`layer-transition.ts` records why. This wants an amendment on aeon's side.

---

## 4. ⚠ The writer classification

The taxonomy from `2026-08-28-collision-word-preservation.md` §3, applied to everything
this parcel adds or moves. The **kind decides the verdict**.

### DECIDERS — what sixteen bits a gesture writes

| # | Site | Verdict |
|---|---|---|
| 1 | `collision-word.ts` `collisionPaintWord` | **EXTENDED, still the only decider.** Gains the crossover tri-state and the plane it is written on. `keep` returns the merge untouched — the crossover bits are outside the owned mask, so preservation is the existing rule, not new code. **THROWS if asked to author without a plane**: defaulting would author a self-mark half the time, and a self-mark is a build failure in another repo rather than a visible editor defect. |
| 2 | `both-planes-paint.ts` `buildBothPlanesEntries` | **NEW, and it is the one place the two-plane rule lives.** Calls the decider ONCE PER PLANE, against that plane's own cell and with that plane's own id. |
| 3 | `MapViewport.paintCollisionCell` | **REDUCED TO A CALL.** Builds an index list and hands it to #2. Reached by BOTH the press (`handleMouseDown`) and the drag (`handleMouseMove`) — one function, so one edit covers both. **MEASURED, not read**: `[b2]`/`[b3]`/`[b4]` drive a real press and `[d1]`–`[d4]` drive a real multi-step drag, and the drag has its own rows because the A+B mode and the crossover brush reach it through *latched refs* (`paintBothPlanes`, `paintCrossover`) rather than through the shared function — a different claim from the shape brush's. |
| 4 | `collision-paint.ts` `paintCollisionRectBothPlanes` | **NEW, agent road, same builder.** Deliberately NOT "call the single-plane builder twice": two calls would be correct only by accident of both being written the same way, and the agent road is exactly where a second copy of a paint rule drifted before (`2026-08-29-agent-paint-priority.md`). |
| 5 | `agent-handler` `paint-collision` | **EXTENDED.** `crossover` is OPTIONAL and **absent means `keep`, never `clear`** — the `!!spec.pri` collapse that cleared every priority bit on the nametable road, refused here in advance. Row `[w5]` measures it. |

### APPLIERS — replay a word a decider already chose

| # | Site | Why it is right |
|---|---|---|
| 6 | `history.ts:210` redo / `:375` undo, `otherPlaneEntries` | The other plane's words were already merged against their own cells. Re-merging here would put the rule in two places, free to disagree. `oldColl` is captured WHOLE, so undo restores all sixteen bits of both cells — `[u1]` proves it end to end on the running app, and a plant that drops this arm reds exactly that row. |
| 7 | `MapViewport` live apply (`otherCe[e.index] = e.newColl`) | Same words the command carries. |

### TRANSFERS / CREATORS — unchanged, and correct as they stand

`map-stamp.ts`, the clipboard paths, `composer-collision.ts`'s seed, `chunk-migrate.ts`,
`chunk-mappings.ts`, `collision-cell-resolve.ts`. A stamp means "this source cell, entire",
so it carries whatever crossover the source had — which is the behaviour aeon's Route P
argument wants (*"cannot drift when the loop is moved or copy-pasted"*) and it needed no
change to get it.

### The two whole-plane escape hatches, re-examined

`clearSection` still wipes the crossover — it is the one gesture whose stated intent is
the whole cell, and the argument in `collision-word.ts` holds unchanged now that the bits
mean something: an editor with no gesture that can remove a crossover would leave
undeletable state. `resetToEngine` still discards and still says so in the command
description; the count it reports is now a count of **crossovers**, which makes that
notice more useful than it was, not less.

---

## 5. Seeing it — two lenses, and why the second one shouts

`priority-lens.ts`'s argument is the precedent: *a default whose failure mode you can see
beats one that ambushes you.* Both new brush modes arm their own lens through the
**setter**, wired to the rule (`crossoverBrushAuthors`) rather than to the chip, so the
condition and the rule cannot drift.

- **Both-planes (teal).** Draws a **derived** fact — this cell is solid on A and on B —
  never a stored flag, so it cannot disagree with the data it describes. It matters
  because the collision overlay shows ONE plane at a time by design (`pickPlane` turns the
  other off), so the second half of every A+B stroke is otherwise invisible.
- **Crossover (amber, and RED where marked on one plane only).** This is the lens that
  most has to exist. A crossover changes no shape, no colour, no solidity and no overlay;
  its only observable consequence is which plane the player is on seconds later.

The **red** mark is the deliverable aeon explicitly assigned here. Anchor §8.2: *"Our
build checks the encoding ... **Aurora checks the loop** — at paint time, where the intent
is present."* And it says why the obvious build gate is wrong: 736 cells of shipped,
correct, loop-free content are solid on plane A only, so "every divergent cell is
reachable from a crossover" would red the build on all of it. A **one-way crossover** —
marked on one plane, not the other — is legal, is what an entry anchor looks like, and is
also the single most likely mistake this feature has: it plays perfectly in one direction
and drops the player in the other. On the map it is **indistinguishable** from a finished
loop. This lens and `crossover-audit.ts` are the only places it is visible, and the audit
rides back on the agent's reply too, because an agent painting a loop has no lens at all.

The audit reports three tiers kept apart: **error** (self-mark, reserved 3 — things aeon's
bake hard-errors on, which Aurora's brush cannot author but a paste, import or hand-poke
can), **warn** (one-way), **context** (divergent / solid-both, reported, never judged).

---

## 6. Proof

### Node — 5,537 passed / 0 failed / 7 skipped, `tsc` clean

Baseline on `master` `fe225dd` was 5,468. This parcel adds **69 rows** across four files.
Aggregate read whole from one run.

Red-first, each plant restored and the tree verified clean:

| Plant | Effect |
|---|---|
| `CROSSOVER_SHIFT` 14 → 12 | **7 red**, including BOTH currency rows — so they genuinely parse the peer blob |
| `crossoverFor` returns the other plane's value | **6 red** — the self-mark reachability sweep and its CONTROL |
| one merge broadcast to both planes | **4 red** — the unowned-bit row AND the two-way pair |
| the one-way predicate ignores plane B | **1 red** — the half-painted loop |
| the lens reads planes at TILE resolution | **2 red** — position and per-section count |

### Running app — `scratchpad/loop-paint-harness.mjs`, **45/45, three consecutive runs**

`dpr` was **1.35 on all three runs** (`rect` 876.0068 x 774.6064, `canvas.width` 876,
`canvas.height` 774). Every
aim is computed from `view()` read back off the store through the app's own transform,
rounded to an integer, then **verified by inverting that transform** — an off-by-one is a
thrown refusal, never a red feature row. Row `[aim]` prints dpr, the rect and
`canvas.width` and asserts the app's own contract. Node v24.15.0, uptime 3d 20h 16m, load average 10.13.

Every total is read **whole from its own run**; no row from one run is paired with a row
from another.

Red-first on the running app — the defect planted in the **app**, `dist/` rebuilt, harness
re-run, then restored and re-verified at 40/40:

| Plant | Result |
|---|---|
| the aimed plane's id broadcast to the other plane | **37/40** — `[x3]` `[x5]` `[w1]` |
| the gesture ignores the A+B mode | **36/40** — `[b3]` `[x3]` `[x5]` `[x6]` |
| undo forgets the second plane | **39/40** — `[u1]` |
| **the DRAG forgets the A+B mode** (the press keeps it) | **43/45** — `[d2]` `[d3]`, and nothing else |

That last plant is the one that shows the drag rows are not decoration: it leaves every
press row green and reds only the drag, which is exactly the asymmetry a "press and drag
share one function" reading cannot see. (The first three were run before the drag phase
existed, hence /40; the fourth and the three green runs are /45.)

**⚠ `[b4]` did NOT go red under the first plant, and that is stated rather than glossed.**
`[b4]` is about the *word* broadcast (plane A's reserved bits landing on plane B); the
plant broadcast the *plane id*, and under a `keep` brush those are different defects.
`[b4]` is proven discriminating in the node suite instead (plant 3 above). Reporting it as
covered by the app plant would have been the "two different errors sharing a phrase"
mistake this repo has paid for.

### The anti-vacuity problem, and how each row escapes it

Bits 15:14 are **zero in all 18 shipped plane files, all 65,536 cells each** (aeon,
`fde35b2f`). Unlike the nametable sweep, which could *find* real priority cells, there is
nothing here to find — so `[fx0]` **measures that zero live** and every crossover row then
AUTHORS its destination through `collisionPoke`, re-reads it, and **throws** if it did not
land. The both-planes rows author **different** crossover values into A and B, deliberately:
two zeros could not tell "each plane kept its own" from "one value was broadcast".

### Rows that do NOT discriminate — named in the harness's own output

`[w6]` (*the shape-only repaint really did change the shape*) is green on master too. It
rules out the cheap green-path "the second call did nothing" for `[w5]`, and it is not
evidence of anything this parcel added. The harness prints
`NON-DISCRIMINATING rows (green on master too): w6` at the end of every run.

The CONTROL rows `[b2]` `[l2]` `[o1]` `[s2]` `[w2]` are converse controls by design: they
exist so a "wrote nothing" or "refuses everything" bug cannot pass the row beside them.

### ⚠ Three harness bugs found in-run, all of a documented kind

1. **`undoAll` rewound COMMANDS but not POKES.** `collisionPoke` bypasses the command
   stack on purpose, so no amount of Ctrl+Z removes a seed. The one-way phase inherited
   the crossover phase's two-way pair and measured `pairs=4, oneWay=4` on a section it
   believed held one mark. **Both its rows failed describing the harness, not the app.**
   `rewind` now un-pokes as well, and `[o0]` asserts the pre-state so it can never recur
   silently.
2. **The lens phase parked the viewport at the origin.** The lens is windowed to the
   viewport by design, and section 0's 1,056 solid-on-both cells are not at (0,0), so it
   reported `active, sectionsWithPlaneB=9, veils=0` — **a true statement about an empty
   window** that the row read as a feature failure. `[l0]` now finds a real solid-on-both
   cell through the app's own accessor, names it, and dies if the search comes up empty.
3. **`aimAtTile` verified the CELL but not that the point was ON THE CANVAS.** The
   transform is affine and does not know where the canvas stops, so a cell scrolled 49 px
   past the right edge still inverted to the cell it meant. CDP dispatched the event
   outside the element, nothing handled it, and **all three drag rows went red about a
   parking mistake** — with `[d1]`, the CONTROL, red first, which is what said it was the
   harness. `aimAtTile` now refuses off-canvas aims loudly, so this class cannot present
   as a feature failure again.

### The alternative green-paths, ruled out

| Row | Alternative green-path | How it was ruled out |
|---|---|---|
| every gesture row | **The stroke never happened** — the facet-scoped hotkey armed nothing, which is how the collision-preservation harness once went green on a broken build | `[arm]` is **fatal**; `[b2]` and `[o1]` are paired CONTROLs asserting the shape actually changed |
| `[x0b]` lens arming | the harness turned the lens on itself | the lens is read after clicking the REAL chip by its `title`; `setOverlay` is used only in `[l1]`/`[l2]`, which are about the toggle, not the arming |
| `[b4]` `[x3]` `[w1]` | **the destination was already the right value** | `[b1]` and `[x1]` assert the pre-state as visible rows, and the seed throws if it did not land |
| `[l1]` | the lens never ran | the report distinguishes `off` / `bg-layer` / `no-plane-b` from `null`, `paints` advances per repaint, and `[l2]` is the toggle-off control with a HIGHER `paints` |
| `[w*]` | **painting into the owner's live document** — his Aurora publishes to the same discovery file | the port is used only once the pid it names is proven a descendant of the spawned process; otherwise the phase reports UNMEASURABLE. `[w0]` prints the pid chain |
| `[r1]` | nothing was ever poked | prints `40/40 cells restored` against a list the pokes themselves built, and `[r2]` re-audits the section |

---

## 7. ⚠ What must NOT happen yet, and what aeon still owes

### The data-erasure hazard bounds where this may be written

`tools/repaint_ojz_collision.py::repaint_word` rebuilds a cell word from solidity and
shape alone and **discards bits 15:14 unconditionally** — the same defect class this repo
fixed on its own side on 2026-08-28, in a committed tool that has been run against
section 0. **No crossover may be written into the owner's real OJZ files** until aeon's
preservation fix (their §6 change 6, rule R4) lands.

The harness therefore paints **in memory only**: no save is issued, the app has no
autosave, `[r1]` restores 40/40 touched cells and `[r2]` asserts the section carries no
crossover at exit. That is a discipline, not a coincidence — a later session extending
this harness must keep it until the hold lifts.

### For aeon, verbatim

1. **§3.3's `{TO_B, TO_B}` example contradicts §3.3's own self-mark rule.** Its B half is
   the self-mark R2 refuses. The argument survives, the example does not; a one-way force
   is `{TO_B on A, NONE on B}`. Please amend — an author following it literally reds the
   build.
2. **`repaint_word` preservation (their change 6 / R4) is the gate on real level data.**
   Tell us when it lands; until then Aurora will not write a crossover to his files.
3. **The engine read site does not exist** (their §6 changes 2–5). Aurora can paint the
   field today; nothing reads it. A painted loop is inert until `Player_Main`'s per-frame
   tail edge-triggers on the resolved cell.
4. **Rule R2's enforcement point matters to us.** It lives in
   `apply_editor_collision_overlay`, the only site that knows which plane a word came
   from. Aurora refuses self-marks at the brush AND audits for ones that arrive from a
   paste or an import — if R2 ever moves or softens, our audit's `error` tier is
   describing a rule that no longer exists.
5. **Priority is not decoupled from layer in this design and we did not assume it is.**
   Their §9 leaves it open. If it ever needs its own bits, value 3 being reserved makes
   that a deliberate ruling; Aurora's vocabulary is `keep` / `clear` / `hand-off` and
   would need a fourth state.

---

## 8. Open, and tagged

- **TAGGED for foreground follow-up — no runtime/emulator work was done or attempted.**
  Nothing here touched `mcp__oracle__*`. Whether a painted crossover reaches a built ROM,
  and whether the player's layer actually flips, is unanswerable until aeon's read site
  exists. **Aurora's editor→ROM claim is HALF proven**: the editor→document→agent path is
  measured end to end on the running app; document→file→bake→ROM is not, and cannot be
  while the hold in §7 stands.
- **The chunk clipboard and the Art facet's composer do not carry the A+B mode.** The
  `A+B` and crossover chips are gated to `variant === 'map'` **as a refusal, not an
  oversight** — a chip in the Art variant would be a control that silently did nothing.
  `paintDocCollision` is a different writer this parcel does not extend. The chunk STAMP
  does carry a crossover (it is a TRANSFER of whole words), so a copy-pasted loop keeps
  its marks; what is missing is authoring one inside the composer.
- **The audit does not decide whether a region IS a loop**, and deliberately. That needs a
  traversal model or a declaration the encoding does not carry — aeon says the same about
  its own side. What is implemented is what two planes alone can decide.
- **No fixture was vendored from aeon.** Both currency rows read blobs at a pinned
  revision through `test/support/peer-repo.ts`; no test in this parcel opens a path inside
  a sibling checkout.
