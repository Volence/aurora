# EW-BASE-SWAP-CONTROL — the `base_swap` authoring surface, an address that looks like a count, and four two-way constructs

**Date** 2026-09-03 · **Branch** `feat/ew-base-swap-control` · **Base** master `b7e95791`
**Upstream parcel** `docs/reviews/2026-09-03-ew-vendor-base-swap.md` (the codec, merged the same day)
**Sibling** `docs/reviews/2026-09-03-ew-ramp-control.md` (the panel this copies the shape of)
**Contract** empyrean `5bd76ba8e6a45a7104d1ffceacdf46794312b9cf`, `docs/AURORA_EFFECTS_SCHEMA.md` §7.5

---

## 0. What is mine, what is relayed, and the one number that did not reproduce

| Claim | Source | Status |
|---|---|---|
| the `line`/`target` bounds, the granule, the key list | the codec's constants, derived from the schema | USED, never re-derived |
| the two asymmetries, the worked address, "what an author sees" | parsed out of the schema's own prose here | derived, throws at module load if any goes |
| "master `b7e95791` is green at **6734**" | the brief, relayed | ⚠ **measured here as 6733** — §7.3 |
| every row in §2–§7 | measured here | mine |

The 6734/6733 gap is one row and changes nothing, but it is recorded because a
before/after pair whose BEFORE was taken from someone else's terminal is how a
laundered delta gets into a packet.

---

## 1. What was built

One card, inside the existing `Preset — <id>` section, on the same Raster row the
`ramp` card hangs off. **The dropdown entry no longer says "(not authorable here
yet)" — that sentence was the seam, and it is gone by construction rather than by
deletion: it is printed by `rasterChannelSeedRefusal`, and the channel now has a
seed.**

```
Raster   [ base swap — one mid-frame plane A base change  ▾ ]
         A preset holds exactly one raster program, so switching DISCARDS this
         base swap and seeds a fresh one of whichever program you pick. It is
         ONE undo step — Ctrl+Z puts back exactly what was here.

         [ Add raster band ]                        ← greyed
         preset "…" carries a base swap, not bands. A preset holds EXACTLY ONE
         raster program: … Set the Raster program row above back to bands …

  ┌─ the base-swap card ───────────────────────────────────────────────────┐
  │ No capability gate, and not DEBUG-gated: unlike a ramp, this runs in    │
  │ every game and reaches the release ROM. Nothing here is disabled for    │
  │ want of an engine capability.                                          │
  │                                                                         │
  │ Line    [ 160 ]  screen line                                            │
  │ Target  [ 57344 ]  $E000 — VRAM_PLANE_B                                 │
  │         At screen line 160, Plane A's base register (VDP reg $02) is    │
  │         re-pointed at $E000 (57344) — VRAM_PLANE_B. One fire, one       │
  │         register write; the 160 lines above it are untouched.           │
  │         from the swap line down, Plane A draws from the target          │
  │         nametable; the top of the frame is untouched, and the swap is   │
  │         self-restoring at the frame top (aeon item 11a on-screen        │
  │         captures, aeon 587873d9)                                        │
  │         Writes line, target — both, every time. No field here has a     │
  │         default.                                                        │
  └─────────────────────────────────────────────────────────────────────────┘
```

**Two controls for two keys and deliberately nothing else.** `$defs.base_swap` is
a CLOSED object of exactly `line` and `target`, so a third widget here would
author a key the schema refuses; `base-swap-control-wording.test.ts` counts the
card's `<NumberField>`s against `EFFECTS_PRESET_BASE_SWAP_KEYS` and goes red if a
third ever appears.

**Neither spinner carries `step`, and that is a decision rather than an
omission.** A `step` of the granule would walk the arrows from one legal base to
the next — a SNAP wearing an affordance's clothes, quietly hiding that a value
between them is refused, which is the one thing this control exists to say out
loud. (The ramp's two rate fields DO set `step`, for the opposite reason: without
it a browser rounds 0.25 to 1 on one arrow press.)

---

## 2. `target` is an address, and the panel says so three times

The shipped section-6 document targets `57344`. **A reader meeting that in a
number box has no way to know it is a VRAM base address at all**, let alone that
it is `$E000`, `VRAM_PLANE_B`, and therefore "Plane A draws Plane B's picture
from here down".

So the address is shown as an address in three places, all from one derivation:

- **beside the box** — `baseSwapTargetGloss` → `$E000 — VRAM_PLANE_B`
- **in the summary** — both bases, `$E000 (57344)`, plus what the swap does
- **in every refusal** — `$DEA8 (57000)`, `$C000 (49152) and $E000 (57344)`

**THE NAME IS PARSED OUT OF THE SCHEMA, AND IT IS THE ONLY ONE.**
`BASE_SWAP_NAMED_TARGETS` reads the contract's own worked example
(`targets 57344 ($E000, VRAM_PLANE_B, …)`) and is guarded three ways at module
load: the decimal and the hex must agree, the address must be inside the declared
range, and it must be ON the granule. Every OTHER legal base reads

> `$C000 — on the granule; the contract names only $E000 (VRAM_PLANE_B)`

which is `rampAddrGloss`'s rule unchanged and the reason is sharper here: **a
made-up plane name would tell an author they are pointing Plane A at a plane they
are not.** Aurora knows one address. It says one.

### What an author SEES is quoted, not claimed

Aurora draws no raster program (`NO_PREVIEW`), so a sentence about what the swap
looks like is a claim this editor has no evidence for. `BASE_SWAP_WHAT_YOU_SEE`
is parsed out of the schema's `WHAT AN AUTHOR SEES:` clause — aeon's own on-screen
capture — with the contract paragraph on the same element's `title`.

---

## 3. The granule — the bound that fails loudly nowhere

`multipleOf: 8192`. **An unaligned target is not a range error and nothing
downstream complains**: VDP reg $02 encodes only the address bits above the
granule and DROPS the rest silently, so the VDP fetches from a different address
than every `VRAM_*` consumer reads and writes, with nothing else visibly wrong.

> preset "…" base_swap target: **$DEA8 (57000) is not on the $2000 granule.**
> ⚠ THIS IS NOT A RANGE ERROR AND IT FAILS LOUDLY NOWHERE: Plane A's base
> register (VDP reg $02) encodes only the address bits ABOVE the granule and
> DROPS the rest SILENTLY, so an unaligned base is a DIFFERENT ADDRESS than every
> VRAM_* consumer reads and writes, with nothing else visibly wrong. **The
> nearest legal bases are $C000 (49152) and $E000 (57344). Refused, and NOT
> snapped to either** — snapping would point Plane A at another picture without
> telling you. target is still $E000 (57344).

**The neighbours are COMPUTED, never typed** — `baseSwapTargetNeighbours` walks
the granule from the range's own ends, which is `rampRateNeighbours`' idiom. The
sweep row asserts they bracket the value and that the gap is exactly one granule;
the harness re-derives the same thing **from the sentence on screen**, so a rig
carrying `8192` would not keep the row green through a re-vendor.

**No snap exists and none was added** — the codec parcel's instruction, and the
one refusal on this surface whose no-clamp rule has hardware behind it rather
than taste. `setBaseSwapTargetCommand` withholds the write; the document is
byte-identical after a refused keystroke, measured in the running app.

**`line` 3..223 is NOT the ramp's `top` 3..222**, and the refusal says so with
both constants rather than leaving the next reader to assume symmetry — a run
needs a line after it, a single fire does not. The row asserts the two constants
DIFFER first, so it cannot pass by their having converged.

---

## 4. ⚠ THE FOURTH ARM — what I found, what I changed, and what would break

The instruction was: write nothing that assumes three. Applying that to the code
already there found **four two-way constructs, three of them live defects the
third arm had already opened**, which nobody had gone looking for because the
vendor parcel's brief only named the three it fixed.

| # | Was | Consequence, today | Now |
|---|---|---|---|
| 1 | `setRasterChannelCommand`: `if (channel === 'ramp') p.ramp = newRamp(); else p.bands = [newBand()];` | **the `else` meant "the only other one"** — the FIRST switch into `base_swap` would have seeded BANDS while the dropdown said base swap | `RASTER_CHANNEL_SEEDS`, a map, looked up |
| 2 | `rasterChannelSwapAdvisory`: `becomes = channel === 'bands' ? 'a fresh ramp' : 'a fresh one-band list'` | on a bands document it promised **"seeds a fresh ramp"** — false for anyone picking base swap, painted before the gesture | names only what is DISCARDED, which is the half that is decided |
| 3 | `presetListSummary`: an `if` per channel with the band count as the fallthrough | a fourth arm goes straight back to reading **"0 bands"**, i.e. a broken document | one positive test on `bands`, the channel's own noun otherwise |
| 4 | `rasterChannelSeedRefusal`'s sentence named base_swap's own fields ("it needs a screen line and a VRAM base address") | true for exactly one channel; the next unseedable one gets a wrong reason | generic |

(2) is the one worth reading twice: it is the same shape as the label ternary the
vendor parcel caught, in the same file, one function away, and it survived that
sweep. **A defect class is not closed by fixing its instances.**

### How a fourth arm would land, and what it would break

Nothing silently. In order:

1. **`RASTER_CHANNEL_NOUNS` throws at module load** with a sentence naming the
   channel and both other registries. The panel does not render; the failure is
   immediate and named. (Pre-existing behaviour, kept.)
2. **`RASTER_CHANNEL_LABELS` throws** the same way if the noun is added and the
   label is not.
3. **No seed** → `rasterChannelSeedRefusal` is non-null → the dropdown entry says
   *"(not authorable here yet)"* **and `setRasterChannelCommand` refuses it**, one
   predicate read by both. Honest, not dead.
4. **No card** → `rasterEditorGap` paints *"preset X carries a Y, and this panel
   has no editor for it yet. The document opens, reads and saves correctly and
   nothing here has changed it — but its fields cannot be edited from this panel
   … Switching the Raster program row above would DISCARD it."*

**Step 4 is new and is the only one that was missing.** Before it, a fourth arm
would have opened, selected correctly in the Raster row (that list is derived
from the schema), and rendered an empty section with nothing on screen saying
why. It is measured against a channel that does not exist (`rasterEditorGapFor`
takes the channel, not a document) — a row that could only pass a real document
through it would assert nothing until the defect had already shipped.

What a fourth arm still requires a human for: **a card**, and the noun/label/seed
data. That is content, not a branch. What it does NOT require: touching
`setRasterChannelCommand`, the advisory, the list summary, the band-control
refusal, the dropdown, or any test in this parcel — every one of those is driven
by `EFFECTS_PRESET_RASTER_CHANNELS` or keyed by channel, and the conversion rows
enumerate **every ordered pair** (`n * (n - 1)`, asserted) rather than naming
directions.

**And a seed cannot lie about which key it writes**: a module-load guard RUNS
each seed on an empty document and asserts `presetRasterChannel` answers with the
channel it is filed under. Plant C below reintroduces the old `else` as data and
the module refuses to load.

---

## 5. The conversion — destructive, one Ctrl+Z, **measured in both directions**

The bar the `ramp` parcel set: one `executeCommand`, one undo step restoring
exactly what was there, or it must not exist. It clears the bar for the same
structural reason — `editPresetCommand` carries the WHOLE old document, and
`undoCommand` re-places it verbatim.

**Measured in the running app, twice over:**

- `[cv-z]` bands → base_swap, one Ctrl+Z, **full JSON equality** against the
  snapshot taken before the switch. Every band back, in order, with its colours.
- `[cv-y]` **base_swap → bands, one Ctrl+Z, the same full JSON equality.** The
  ramp parcel measured only the way IN; a destructive control whose other
  direction nobody has pressed is half a proof, and the way out is the direction
  an author reaches for when they change their mind.

The advisory is unconditional, sits under the control, and names what would be
discarded BEFORE the gesture (`deletePresetRefusal`'s ruling: a confirm asks "are
you sure?" about a consequence the author cannot see). **No third decision card
is opened** — d-29 and d-30 are about destructive controls that are NOT one
Ctrl+Z away, and this one is, measured rather than reasoned.

---

## 6. The two asymmetries with `ramp`, and where they are stated

A reader arriving from `EffectsPresetRamp` carries two of its properties across
and **both are wrong here**. An assumed capability gate is exactly what a control
parcel silently builds a disabled button around, so this is not left to a
docblock:

1. **NO CAPABILITY GATE.** `ramp` renders only where `Game.SCANLINE_CAPS` declares
   `CAP_DENSE_TIER`; `OP_SET_REG` dispatches unconditionally in every game and no
   ensure is re-emitted at the generated call site.
2. **NOT DEBUG-GATED.** The generated section-6 emission is unconditional `pub`
   data reaching `s4.bin` (aeon measured it at `$013446` in the RELEASE listing).

**Where they are stated, all four from one parsed source:**

| Where | What |
|---|---|
| `BASE_SWAP_ASYMMETRIES` (provider) | the contract's own two sentences, PARSED out of the schema; throws at module load if empyrean drops either |
| the card, PAINTED | `BASE_SWAP_ASYMMETRIES_SHORT` at author length, in a warning Hint above the fields |
| the same element's `title` | the contract half — `presetLimitsShort()`'s split |
| this packet + the panel's import block | for the next reader of the source |

`[as-a]`/`[as-b]` measure the painted half in its scroller AND the contract half
on the same element, in the running app. **Nothing on this surface is disabled
for want of a capability, and nothing pretends to be.**

Two more places a reader could assume symmetry and would be wrong, both stated
where the assumption would be made: the line range (§3), and the **lag
disclosure's silence** — `ramp` was in `PRESET_KEYS_AWAITING_AEON` and RETIRED out
of it; `base_swap` was **never in it**, because aeon shipped the key AHEAD of the
contract declaring it. The fourth mount site's own test block says so, so the
mount is not read as a leftover from a retirement that never happened.

---

## 7. Proof

### 7.1 The instruments

| | rows | runner |
|---|---|---|
| `src/renderer/providers/__tests__/effects-preset-base-swap-control.test.ts` | **32** | `npm test` (vitest include) |
| `src/renderer/components/effects/__tests__/base-swap-control-wording.test.ts` | **13** | `npm test` (vitest include) |
| `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts` | **+3** (the fourth mount site) | `npm test` |
| `scratchpad/base-swap-control-harness.mjs` | **25** | **`npm run harness:base-swap-control`** — **registered in `package.json` in the same commit that created it**, and `npm run check:harness-guards` classifies it LAUNCHER (guarded): **197 clean / 197, 0 failures** |

The harness drives the built app under CDP: real mouse presses at integer client
pixels verified with `elementFromPoint` (dpr and rect printed on every aim), and
`Input.insertText` for every number. **Never `.click()` for a subject.** The one
exception is stated rather than hidden: a native `<select>`'s popup cannot be
driven under Xvfb, so `convertChannel` tries a real `ArrowDown` first and
**reports which gesture actually moved the document** — on both runs here it was
the native value setter plus a real `change`, and `[f0]` covers the select's
reachability separately.

⚠ **The probe id is `aurora_local_baseswapctl_probe` and must not be shortened.**
This harness opens aeon's live checkout READ-ONLY and creates its fixture through
the panel, so it shares an id namespace with everything aeon commits — the
sibling harness's `ramp_probe` collided with a real preset aeon landed hours
later, and **aeon already ships `ojz_sec6_baseswap`**.

⚠ **Every disabled-control row asserts WHY.** `[dc-a]` is the flag, `[dc-b]` is
the PAINTED sentence (a real element whose rect lands inside its own scroller,
with four required phrases), `[dc-c]` is the title. No "I clicked the disabled
chip" row is shipped, and the reason is recorded as a NOTE in the run: a disabled
`<button>` fires no `onClick`, so that row is green however the code behaves.

⚠ **Every "it acted" row asserts the DOCUMENT changed**, read back through
`window.__dbg.aeon.presetsJson()` — never that a handler ran or a class toggled.

### 7.2 Red-first — seven plants, each on the COMMITTED baseline

Every plant applied to disk against committed baseline `2ec0d687`, `git diff
--stat` shown, the mutated line read back from disk, **the FIRST run reported**,
and each restored with `git checkout --` (`git status` verified clean).

| plant | mutation, on disk | in `dist/` | went red |
|---|---|---|---|
| **A** the granule assertion | `effects-preset.ts:3448` `if (false && !isBaseSwapTargetAligned(value)) {` (1 file, 1+/1-) | bundle chunk re-hashed; `grep -c "NOT A RANGE ERROR"` → **0** | **3** node rows + harness **`[gr-a] [gr-b] [gr-c] [gr-d]`** — and the app **wrote 57343 into the document**, an unaligned VRAM base |
| **B** the neighbour pair | `const above = Math.max(Math.floor(target / g) * g, first);` | — (node gate) | **1** red, then **2** after §7.4 |
| **C** a seed that writes the wrong key | `base_swap: (p) => { p.bands = [newBand()]; }` — the old `else`, as data | — | **the module refuses to load**: *"RASTER_CHANNEL_SEEDS["base_swap"] does not write the "base_swap" key — it produced a bands document"* (`Tests no tests`) |
| **D** the advisory's destination | the `becomes` ternary, restored verbatim | `grep -o "a fresh ramp"` → present, `"fresh one of whichever program"` → **0** | **1** node row + harness **`[cv-0]`**, which printed the false promise: *"switching DISCARDS 1 raster band and seeds a fresh ramp"* |
| **E** the ramp-asymmetry clause | the `⚠ THIS IS NOT THE RAMP'S RANGE …` half deleted from `baseSwapLineRefusal` | — | **1** node row |
| **F** the painted asymmetries | the `<Hint>` deleted from `BaseSwapCard` (1 file, 3-) | `grep -c "No capability gate"` → **0** — the constant was **tree-shaken out of the shipped bundle** | **1** wording row + harness **`[as-a] [as-b]`** |
| **G** the fourth arm's landing pad | `if (true) return null;` in `rasterEditorGapFor` | — | **1** node row |

**Plant A is the one to read twice.** It is not "a sentence went missing": with
the alignment branch dead, the harness watched the app **write an off-granule
address into the document** — the exact silent failure the granule exists to
prevent, since nothing downstream would have complained.

**Plant C is the fourth-arm guard proving itself.** The mutation is precisely the
`else` this parcel deleted, re-entered as data, and the module load refuses it by
running the seed and asking the codec what it made.

### 7.3 Aggregates

| | Test Files | Tests |
|---|---|---|
| **Master `b7e95791`** (`npm test`, **measured here in this worktree**, not relayed) | 480 passed / 2 skipped (482) | **6733 passed** / 8 skipped (6741) |
| **This branch** (`npm test`, whole chain incl. typecheck + 7 `check:*`) | 482 passed / 2 skipped (484) | **6781 passed** / 8 skipped (6789) |

**+2 files, +48 tests, 0 failures** — 32 + 13 + 3, exactly. Nothing was deleted or
skipped to get there; the 8 skips are unchanged and each names its reason (one is
the linked-worktree `sibling-root` row that always skips here).

**Harness: 25/25** on a clean tree, run twice — once before the plants and once
after every restore and a fresh `VITE_AURORA_DEBUG=1 npm run build` — and each
plant's run read as its own first run. **The first run of the clean harness was
24/25, and the red row was the RIG's:** `[hx-c]` took the first `$` in the summary
as the address, which is `$02` — the VDP **register number**, not a VRAM base. The
sentence was correct and the row was wrong; it now matches the `$HEX (decimal)`
pair form and requires both halves to agree with each other and with the
document. Recorded rather than quietly fixed, because "the rig was wrong" is the
finding that a second reader cannot reconstruct from a green log.

### 7.4 Re-pins, each for a landing that moved under it

Four existing gates changed, none relaxed:

1. **`ramp-control-wording.test.ts` sliced `RampCard` to END OF FILE.** That was
   "the ramp card" only while `RampCard` was last in the panel; `BaseSwapCard` is
   written after it and the five-key field-count row — **the only automatic
   signal in this repo for the per-line-curve MUST NOT** — immediately counted
   seven `<NumberField>`s. Both wording files now bound the slice at the
   function's own closing brace in column 0.
2. **`preset-lag-disclosure.test.ts`: three mount sites → four**, and the ramp
   row's `expect(nearest).toBe(Math.max(...mounts))` re-aimed to "the third of
   four, with exactly one after it" — it, too, was only true while the ramp card
   was last. A new describe pins the fourth site (§6).
3. **`effects-preset-ramp-control.test.ts`** required an UNSEEDABLE channel to
   exist as its anti-vacuous half — which was `base_swap`, i.e. this parcel's
   job, so the row would have gone red **for the success**. Re-aimed at what it
   meant: an undeclared channel is refused with a sentence and produces no
   command, and every channel the contract declares can now be authored.
4. **The neighbour-pair row strengthened** after plant B: collapsing the pair left
   the SENTENCE row green, because both `toContain`s were satisfied by the same
   address printed twice — a refusal reading *"the nearest legal bases are $C000
   (49152) and $C000 (49152)"*, one way out looking like two. The row now asserts
   the pair differs and that the sentence carries them in order; re-planted, 2 red.

---

## 8. Design calls I made, and what I would take to the owner

- **A number box for `target`, not a picker of the eight granules.** A picker
  would be aligned by construction and would delete the granule refusal's
  subject — an author would never meet the one bound on this surface that fails
  loudly nowhere else. The refusal is the feature.
- **No hex INPUT.** The box takes the decimal the file holds and the hex is shown
  beside it. Accepting `$E000` in the box is a real convenience and a real
  parsing surface; it is a follow-up, not a silent addition here.
- **The seed is the contract's worked example** (`line 160`, `target $E000`),
  parsed rather than chosen, guarded against the line range and the granule at
  module load. `newRamp`'s rule plus one: a seed whose address this editor could
  not NAME would be a first state the panel cannot explain.
- **`rasterEditorGap` is a registry with a fallback sentence, not a throw.** The
  noun and label registries already throw at module load, which is right for data
  a sentence needs; an editor is a component, and refusing to render the whole
  panel because one channel lacks a card would take a working editor away from
  three channels to protest about a fourth.

**Nothing is blocked.**

⚠ **MERGED, NOT CERTIFIED, and the two halves differ from `ramp`'s.** aeon's page
ACCEPTS `base_swap` (it shipped the key ahead of the contract), so no lag
disclosure is armed and none retired. **What no one has seen is a ROM obeying a
GENERATED base swap authored in this panel** — aeon measured its own generated
section-6 program in the release listing, byte-identical to the hand-authored
`OJZ_BaseSwap`; nothing in Aurora has seen a ROM at all. No emulator was touched
by this lane.
