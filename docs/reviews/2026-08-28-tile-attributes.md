# Tile attributes: the truncation, the rule, and the brush

**Branch** `feat/tile-attribute-authoring` · **base** master `19b76d5` · **ROADMAP §5.1 row 76**
**Instrument** `scratchpad/tile-attribute-harness.mjs` · **runner** `npm run harness:tile-attributes`

---

## 1. The question, and what was under it

The owner, minutes after being handed the priority lens (row 72):

> *"Is there a way to draw the higher priority and such?"*

No. And looking for it found silent data loss.

`packNametableWord` (`src/core/model/s4-types.ts`) carries **five** fields:

    tileIndex 0..10 | hFlip 11 | vFlip 12 | palette 13..14 | priority 15

Every interactive paint site wrote **two**, open-coded:

    (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13)

So painting over a high-priority tile dropped it behind Sonic, and painting over
a flipped tile un-flipped it. It survived because **until row 72 landed there was
no way to see priority in this engine at all** — the defect's only symptom was a
gameplay surprise minutes later.

---

## 2. Full blast radius

### Truncating writers — FOUR, not two

| # | Site | Reachable by |
|---|---|---|
| 1 | `MapViewport.tsx` `paintBgTile` (~1755) | a click on the **background** layer |
| 2 | `MapViewport.tsx` `paint-tile` mousedown (~2503) | a click |
| 3 | `MapViewport.tsx` `paint-block` per cell (~2543) | a click |
| 4 | `MapViewport.tsx` `paint-tile` **drag** (~2855) | **only a real drag gesture** |

The dispatching report named two (the press and paint-block). The **drag** and
the **background** path were the other two. The drag matters disproportionately:
it is the site a node test can never see and the one an author uses most.

All four now go through `brushNametableWord`.

### Writers CONFIRMED SAFE (read, not assumed)

| Writer | Why it is safe |
|---|---|
| `map-clipboard.ts` `copyFromSection` | copies **whole words** out of the nametable |
| `map-clipboard.ts` `copyChunkToClipboard` | whole words |
| `map-stamp.ts` `buildRegionWriteCommand` | `newNt = source.nametable[...]` — whole words |
| `history.ts` execute/undo | whole words, both directions |
| `project/aeon/load.ts` | whole words from `.tiles.bin` / strips |
| `art/composer-buffer.ts` | full five-field `packNametableWord` |
| `art/atlas-migration.ts` | full pack, and XORs flips rather than dropping them |
| `export/tile-dedup.ts` | unpack → repack, all fields |
| `agent-handler.ts` `save-chunk` (~457) | full pack from an explicit spec |

Copy/paste was believed safe and **is** safe — confirmed by reading, not assumed.

### The classic (S1) path does NOT share the defect

`core/level-classic/model.ts` `packBlockCell` / `packChunkCell` take a whole cell
object. `BlockTab.tsx` edits it with a spread merge (`editCell({ xf: !cell.xf })`)
and **already ships `X flip` / `Y flip` / `Priority` chips**; `ChunkTab.tsx`
already ships an **armed brush** (`brushXf` / `brushYf` / `brushSolidity` →
`packChunkCell`). `ClassicLevelViewport` builds no cell words by hand.

This is why the aeon vocabulary below was **copied rather than invented**.

### One adjacent path deliberately left alone

`agent-handler.ts` `paint-region` (~394) calls
`packNametableWord(spec.tile, spec.pal, !!spec.pri, !!spec.vf, !!spec.hf)`, and
`NametableEntrySpec` marks `pri`/`hf`/`vf` optional. An agent that omits them
therefore **clears** them on whatever it paints over.

Judged **not the same defect**: that request is a whole-entry specification, so
an omitted field is an authored `false`, not a truncation of a field the caller
never knew existed. But the *effect* on an author's priority cells is identical,
and an agent doing bulk region paints over authored art will flatten them.
**TAGGED** — worth a decision (default `pri` to the destination's bit, or make
the field required), not silently changed under a different parcel's mandate.

---

## 3. The preservation rule, and why

> **The brush owns the picture. The cell keeps its depth.**

`src/core/editing/brush-word.ts` is the single decider; the four sites call it.

| Field | Source | Reasoning |
|---|---|---|
| tileIndex | brush | unchanged |
| palette | brush | unchanged, and out of scope — it already worked |
| **hFlip / vFlip** | **brush** | A flip is not a property of the cell, it is **which picture** the cell shows: tile 75 flipped is a different image from tile 75. The Art panel shows the tile *unflipped*, so a stroke must put down the thing the picker depicted. Preserving the destination's flip would mean painting what you saw and getting its mirror. A flipped cell therefore un-flips when painted over — that is not loss, it is WYSIWYG. |
| **priority** | **tri-state, default `keep`** | Depth is a property of the **cell**, and *nothing in the picker depicts it*. An author retouching a cliff edge is choosing a picture; they are saying nothing about depth, and an editor that answered for them is what broke. |

### Why `keep` and not `off` — the load-bearing choice

Both defaults have a genuine failure mode:

- **`keep`** can carry priority onto art that should not have it — paint sky over
  a high-priority cliff cell and the sky draws in front of Sonic.
- **`off`** drops priority from art that should keep it — the bug actually reported.

They are **not symmetric, and detectability is what breaks the tie**. Under
`keep`, the mistake is *visible*: row 72's lens veils that sky cell violet the
moment it happens, and a `Priority: off` stroke clears it. Under `off`, the
mistake is the **absence** of a veil where one used to be — which nobody notices,
and which surfaces minutes later as a player walking behind a bush.

**A default whose failure mode you can see beats a default whose failure mode
ambushes you.** `keep` is the default; the lens is what makes it safe.

The rejected third option — *carry the source tile's bits* — has no source bits to
carry: the picker arms a bare tile index, not a decorated word.

---

## 4. The authoring design

**Built: chips beside the tile picker, in the `aeon.layoutOptions` slot**
(`src/renderer/components/TileBrushOptions.tsx`), shown for `paint-tile` and
`paint-block`.

    Flip      [X flip] [Y flip]
    Priority  [Keep]   [On]   [Off]

**Why chips.** This app already teaches exactly this control on the classic side
(§2), so the words are deliberately **the same words** — `X flip`, `Y flip`,
`Priority` — rather than the model's `hFlip`/`vFlip` spelling. Two surfaces in one
app that mean the same thing must not say it differently; that is the rule the
priority lens itself was built on.

**Why priority gets three chips and the flips get one each.** Not an
inconsistency — it is the rule made visible. A flip is a mode (on/off). "Don't
touch the depth" is a real third intent a checkbox cannot express.

### Rejected

**Modifier keys while painting.** The map already spends `Alt` on two different
things (paint-collision's propagate latch, stamp-chunk's art-only), so the free
modifiers are scarce and unmnemonic. Worse: a modifier is **invisible**. There is
no way to look at the editor and see what the next click will do to a field that
is *itself* invisible — which is the exact property that let this bug live. Using
it in the fix would be perverse.

**A dedicated attribute-brush tool.** The closest call. It composes beautifully
with the lens, but it adds an **eighth** tool to a facet already carrying seven,
and it cannot do the thing an author most often wants: lay a tile *and* say what
depth it sits at, in one stroke. It is also near-redundant — with the brush at
`Priority: on` and the destination's own tile re-picked, a stroke changes only the
attribute. The attribute-only edit exists; it just does not need its own tool.

### The lens, and why arming surfaces it

Arming a **non-default** priority brush turns `showPriority` on and toasts that it
did. The condition is `brushAuthorsPriority` — the same predicate `brush-word.ts`
states the rule in, so the side effect and the rule cannot drift.

- It fires only when leaving `keep`. Forcing a violet veil onto every ordinary
  paint stroke would be obnoxious, and row `[b2]` asserts it does not.
- It only ever turns the lens **on**. Returning to `keep` leaves it on, because
  silently undoing a view the author may now be relying on is its own surprise.
- Authoring priority while unable to see it is the state the owner was rescued
  from this morning. A second surface arming the brush without the lens would put
  him back in it, so the side effect lives in the store setter every surface must
  go through — not in the chip's `onClick`.

### Nothing touches many cells at once

There is deliberately **no** "apply to selection" button. A control that rewrote
attributes across a marquee would be a bulk mutation of an invisible field — the
very shape of the defect this repairs. The widest thing a stroke touches is
paint-block's 2×2, which was already one command (`[p2d]`/`[p2e]` assert it), and
a drag, which was already one command on release (`[p3c]`).

### One consequential side edit

The BG stroke's out-of-blob refusal tested `newNt !== 0`. That was equivalent to
"is the picked slot 0" **only while every attribute bit was hard-cleared**. With
priority preserved, painting the blank tile over a high-priority cell yields a
non-zero word that still names tile 0. It now tests the picked **slot**, so the
format's blank escape keeps meaning what its own comment says it means.

---

## 5. How it was verified

### Node — 5,296 pass / 1 fail

The single failure is `test/formats/effects-scene-curve-vsplit.test.ts`, the
pre-existing aeon fixture drift confirmed on a clean tree before this work began.

16 new tests in `src/core/editing/__tests__/brush-word.test.ts`. Every expectation
goes through `packNametableWord`/`unpackNametableWord`; **no literal word appears
in the file**. Fixtures are a `LOADED` destination (all attribute bits set) and a
`BARE` one, with a guard row asserting they really are what they claim — a
preservation test against a zero cell proves nothing.

**Proven assertive by planting both rejected rules:**

| Planted | Reddens |
|---|---|
| `keep` behaves as `off` (the original defect) | 3 rows, incl. the exhaustive no-op property |
| flips preserved from the destination (rejected rule B) | 3 different rows |

`section-ids.test.ts`'s shared-id guard **caught the new slot arm** and its
enumeration is updated with the reason — a guard in this repo that actually fires.

### The running app — master **21/37**, fixed **37/37**, three green runs

The node suite cannot see React, a canvas, or a mouse. `[p3]` (the drag) is
reachable *only* by a real gesture.

Red-first, on the same 37-row harness against a master `src/`:

```
[p1b] painting PRESERVES the destination's priority bit          FAIL
      before 0xc84b [tile=75 pal=2 PRI HF VF]  after 0x004b
[p2c] paint-block PRESERVES priority on all four cells           FAIL
      before PRI true,true,true,true  after false,false,false,false
[p3b] the DRAG branch preserves each cell's own priority bit     FAIL
      A true→false  B true→false
```

Fixed:

```
[p3b] A 0xc04a → 0x804b   priority kept, tile changed            PASS
[b5c] 0xc84b → 0x004c     brush "off" clears it                  PASS
[b6c] 0x8a55 → 0x8256     hFlip follows the brush, PRI kept      PASS
```

**Fixtures are REAL cells, found live.** Section 0 of OJZ act 1 holds 1,865
priority cells, 954 hFlipped, 2,800 vFlipped. The harness locates them through the
app's own `ntRect` and **dies** if the search comes up empty. `0xc84b` (tile 75,
palette 2, priority + hFlip + vFlip) is the primary destination — an authored cell,
not a constructed one.

**Bit positions are derived.** `nametableFields()` parses the five field
expressions out of `packNametableWord`'s own body and self-checks that they are
pairwise disjoint and cover exactly `0xFFFF`. If the function's shape changes it
**throws** rather than guessing. A typed `0x8000` here would be the copied-pin
defect this repo keeps paying for.

**dpr.** `dpr=1`, `rect=(284,74,876x721)`, `canvas.width=876` in all four runs.
Row `[aim]` asserts `canvas.width === Math.floor(rect.width)` — MapViewport's own
contract. Every aim is computed from `view()` read back off the store through the
app's transform, **rounded to an integer before sending**, and then *verified* by
inverting the transform on that integer and refusing to proceed unless it lands in
the intended cell. An off-by-one is a loud refusal, never a red feature row. No
row is read across runs.

### Rows that would have gone green for the wrong reason — found and fixed

The first draft had three, and they are worth recording because they are the
exact failure mode the mandate warned about:

1. **`[b5b]`/`[b5c]`** read the priority+flip cell *after* `[p1]` had already
   truncated it, so they asserted on the **absence** of bits `[p1]` destroyed.
   Phases now rewind (`undoAll()`) and each starts from the real document.
2. **`[b6c]`** claimed a flip was cleared without establishing it was ever set.
   `[b6c-pre]` now states that destination explicitly.
3. **`[bg1]`** asserted priority preservation on a background that has **none**.
   Measured in-run by `[bg0]`: the BG plane carries 4,088 drawn words and **zero**
   priority ones. The flips cannot stand in, because under this rule a flip
   correctly *follows* the brush. The phase now **authors** its destination with
   the app's own brush (`[bg1]`, impossible on master) and tests preservation
   against that (`[bg2]`) — the one place a fixture is app-authored rather than
   real, and it says so.

### Alternative green-paths ruled out

- **"the app always sets bit 15"** would make every preservation row green.
  Ruled out by **`[b5c]`**: `Priority: off` must *clear* the bit on a cell that
  had it (`0xc84b → 0x004c`).
- **"the app never sets bit 15"** (i.e. master's behaviour) would make `[b5c]`
  green. Ruled out by **`[b4b]`**: `Priority: on` sets it on a cell that had none
  (`0x4253 → 0x8254`), and `[b4b]` **fails on master**.
- **"nothing was painted at all"** would make every preservation row green
  trivially. Every phase pairs its preservation claim with an assertion that the
  **armed tile index** actually landed (`[p1a]`, `[p2b]`, `[p3a]`, and the tile
  check inside `[b4b]`/`[b5c]`/`[b6b]`/`[bg1]`/`[bg2]`).

### Named non-discriminating rows

- **`[p1c]`** ("painting puts down the brush's flips, both off") is green on the
  **broken** build too — master hard-clears the flip bits, which coincidentally is
  what this rule asks for with an unflipped brush. It pins the rule going forward;
  it is not evidence of the fix. Its discriminators are `[b6b]`/`[b6c]`, where the
  brush is armed and the bits must follow it in **both** directions. The harness
  prints this warning itself.
- **`[b5c]`** is likewise green on master for the same coincidence (master always
  clears priority). Its discriminator is `[b4b]`, which fails on master. The two
  are only meaningful as a pair.

---

## 6. What is open

- **TAGGED — `agent-handler.ts` `paint-region`** (§2): an agent omitting `pri`
  still clears authored priority. A decision, not a bug fix; left for the owner.
- **TAGGED — background priority is unexercised by real data.** OJZ act 1's
  background contains zero priority words, so `[bg1]`/`[bg2]` run against an
  app-authored destination. A foreground re-check on a background that actually
  uses priority would close it.
- **No runtime/emulator confirmation was attempted** (standing invariant). The
  words are asserted in the document, not in VRAM.
