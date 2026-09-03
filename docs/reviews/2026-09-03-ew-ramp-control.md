# EW-RAMP-CONTROL — the `ramp` authoring surface, the two numbers that look fine, and a reason that was false

**Date** 2026-09-03 · **Branch** `feat/ew-ramp-control` · **Base** master `4ee4d116`
**Upstream parcel** `docs/reviews/2026-09-03-ew-revendor-ramp.md` (the codec, merged the same day)
**Contract** empyrean `9233883735deba44b1b547a25e491c690b136f0f`, `docs/AURORA_EFFECTS_SCHEMA.md` §7.4

---

## 0. What is mine, what is relayed, and the one thing that changed under me

| Claim | Source | Status |
|---|---|---|
| `top`/`lines`/`addr` bounds, the span max, the display lag, the fp16 grid | the codec's constants, derived from the schema | USED, never re-derived |
| the per-line-curve MUST NOT | parsed out of the schema's own `ramp` description | derived, throws at module load if it goes |
| `fp16(-1, 128)` is -1.5 | codec's named row; **re-confirmed by the engine lane** mid-parcel | measured upstream |
| "the generator applies the display lag" | the brief, relayed | ⚠ **FALSE — retracted mid-parcel by the engine lane** |
| every row in §3–§6 below | measured here | mine |

**The retraction is the most important line in this packet** and §2 is about it.

---

## 1. What was built

One card, inside the existing `Preset — <id>` section, and a channel row above it.

```
Raster   [ ramp — one dense per-line run     ▾ ]
         A preset holds exactly one raster program, so switching DISCARDS this
         ramp and seeds a fresh one-band list. It is ONE undo step — Ctrl+Z puts
         back exactly what was here.

         [ Add raster band ]                        ← greyed
         preset "ramp_probe" carries a ramp, not bands. A preset holds EXACTLY
         ONE raster program: bands and ramp lower into the same raster: slot …
         Set the Raster program row above back to bands to author bands; that
         discards the ramp, and it is one undo step.

  ┌─ the ramp card ────────────────────────────────────────────────────┐
  │ One rate and one start, over the whole span. There is no per-line   │
  │ curve and there cannot be one: the engine has a single step and a   │
  │ single start and no field that could hold a table.                  │
  │ Not consumed by the engine yet. `ramp` is authored here and saved … │
  │                                                                     │
  │ Top    [  64 ]                                                      │
  │ Lines  [ 159 ]                                                      │
  │         writes on lines 64-222, shows on screen lines 65-223        │
  │ addr   [   0 ]  plane A, whole-plane vertical scroll                │
  │ Start  [   0 ]  px                                                  │
  │ Step   [-1.5 ]  px per scanline                                     │
  │         One rate over 159 lines: the accumulator starts at 0 px and  │
  │         ends at -237 px, a total of -237 px. The engine writes the   │
  │         whole part of it every line.                                │
  │         Writes top, lines, target, start, step — all five, every     │
  │         time. No field here has a default.                          │
  └─────────────────────────────────────────────────────────────────────┘
```

**Five controls for five keys and deliberately nothing else.** No curve editor, no
multi-point widget, no per-line table — and `ramp-control-wording.test.ts` counts
the card's `<NumberField>`s against `RAMP_KEYS` and goes red if a sixth ever
appears. That count is the only automatic signal this repo has for the MUST NOT,
because a document authored by a per-line widget would still be a LEGAL document:
the schema, the vectors and the round trip would all pass it, and it would be
silently wrong on hardware.

The MUST NOT itself is **parsed out of the schema's own `ramp` description**
(`RAMP_MUST_NOT`) and throws at module load if empyrean ever drops the sentence.
It is painted at author length with the contract's wording on the same element's
`title` — `presetLimitsShort()`'s split, for its reason.

The lag disclosure is mounted first in the card and **is currently armed**:
`PRESET_KEYS_AWAITING_AEON` holds `ramp`, and for this key the lag is the sharper
flavour — the generator has no vocabulary for it at all, so **a preset carrying
`ramp` fails aeon's build entirely.** An author reads that above the controls,
derived from the measured premise, and it retires with the premise.

---

## 2. ⚠ THE DISPLAY LAG — the judgement, and the reason that turned out to be false

### 2.1 What I was told, what I wrote, and what arrived

The brief posed this as a genuine A/B: apply the lag to what I show, or don't,
and justify it. Its stated hazard was **double application** — "the codec
deliberately does NOT apply this, because the generator does."

**Mid-parcel the engine lane retracted that.** There is **no lag compensation
anywhere on the engine path**: not the codec, not `tools/effects_gen.py`, not the
constructor, not the interpreter. The compensation is **preview-only and entirely
ours**. So the A/B collapsed into a fact.

### 2.2 The judgement, stated as it now stands

**`rampDisplaySpan` applies the lag. It is the one place on this surface that
does, and nothing writes it into a document.** The line is drawn by what the two
numbers mean:

- **`ramp.top` is the ENGINE's `top`.** The field, its refusal and the file are
  all in engine coordinates. Baking a display correction into the FILE would
  change what the engine runs in order to fix what an editor draws.
- **The readout is a claim about SCREEN lines** — what the author will see — and a
  screen-line claim that omitted the lag would be one line high everywhere **and
  would look correct**. That is exactly why the codec made it a named constant
  instead of a `+ 1` in whichever renderer needed it first.

So the readout paints **both** spans and labels them: `writes on lines 64-222,
shows on screen lines 65-223`. Printing only the second would let it be read back
as `top`; printing only the first would be a screen claim that is quietly wrong.

**The corroboration that makes this a reading of the contract rather than my
opinion:** with the lag applied, a maximal run's last displayed line is
`top + lines - 1 + 1` = `top + lines`, and the span interlock caps that at 223 —
the last line of a 224-line screen. **The two constants meet exactly at the bottom
of the display.** A lag of 0 leaves a line spare; a lag of 2 runs off the screen.
`ramp-control.test.ts` asserts that, derived from both constants.

### 2.3 The correction I made to the codec, and why it mattered

`EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG`'s docblock ended:

> …applying it here would put the compensation in the file, where the generator
> would apply it a second time.

**That clause was false**, and it is the dangerous kind of false: the conclusion
it supports is correct, so nothing goes red, and a maintainer who believed it
would conclude there is a double-application to avoid — and therefore that a
consumer adding the lag is a bug to fix. The next person to build a ramp preview
would have removed the very compensation this parcel added.

Corrected in place, with the old reason recorded beside the new one so a reader
knows what moved and why. **The constant, its guard and its value are untouched.**

### 2.4 What is NOT built

**No drawn preview.** Nothing in this editor has ever drawn a raster program,
`NO_PREVIEW` says so at the top of the panel, and a drawn ramp is precisely where
this constant is most dangerous. A text readout is what this parcel ships; a
canvas preview is its own parcel and would inherit `rampDisplaySpan` rather than
re-deriving the lag.

---

## 3. The span pair — refused at author time, with the schema's own number

`top <= 222` and `lines <= 220` are both satisfied by `{top: 222, lines: 220}`,
and that document is refused — by aeon's generator and by the engine, **not by the
schema**, because no JSON Schema keyword constrains two fields.

`rampSpanRefusal` refuses it at the control, at typing time, with
`EFFECTS_PRESET_RAMP_SPAN_MAX` (the codec's constant, read out of the contract's
prose) and with **the largest value the other field then admits**, so the sentence
is a way out and not a wall:

> preset "ramp_probe" ramp lines: 200 with top 64 spans to 264, and top + lines
> must be at most 223 — the frame-rewind interlock. ⚠ THE PER-FIELD MAXIMA ARE
> NOT THE PAIR'S CONTRACT: top 222 and lines 220 each satisfy the schema and the
> pair is still refused … which is why you meet it here and not at somebody
> else's build. With lines 200 the largest top is 23. Refused; lines is still 128.

**Not a clamp** (aeon §E.4): nothing substitutes a number the author did not type,
and `setRampSpanCommand` withholds the write rather than adjusting it. The harness
row `[sp-a]` asserts both halves in one condition — the sentence is painted AND
the document did not move — because a refusal that only paints is decoration and a
silent withhold is the defect this parcel exists to remove.

---

## 4. The rate that cannot be typed

`start` and `step` take **decimal pixels** and go through the codec's
`presetFp16FromNumber` / `presetFp16ToNumber`. The panel does not convert; a
second opinion about the sign rule here would be a whole pixel of error with both
numbers still inside their declared ranges, which no schema and no round trip can
catch.

**`presetFp16FromNumber` returns null off-grid and has NOT been made to snap.**
Four reasons a rate has no spelling get four different sentences, because "that
number is not available" is useless without "here is what is". The one that
surprises:

> preset "ramp_probe" ramp step: -0.5 px per scanline HAS NO SPELLING in this
> encoding. frac256 is a MAGNITUDE and the sign lives on whole alone, so a
> negative value needs a negative whole and there is none between -1 and 0 —
> {whole: 0, frac256: 128} is +0.5, not -0.5. The whole interval between -1 and 0
> is unreachable. **The nearest rates you CAN have are -1 and 0.** Refused, and
> not rounded to either — step is still 0.25 px per scanline.

The neighbours are computed, not typed: `rampRateNeighbours` walks the 1/256 grid
and falls back to the hole's own edges, and its docblock's claim — that inside the
authored range the ONLY unspellable grid values are the hole's — is **swept and
asserted** (exactly 255 of them, `EFFECTS_PRESET_FP16_FRAC_RANGE.max`).

`rampRateProblem` (the sentence-picker) and `presetFp16FromNumber` (the answer)
are two functions, and a control is only honest while they agree — so a row sweeps
1,200-odd values and asserts one returns null exactly when the other does, with an
anti-vacuous floor on how many of them are genuinely unspellable.

**The authored range is asymmetric and the code says so.** `whole` is -512..511,
so the smallest rate is a whole pixel further from zero than the largest. My first
test assumed a symmetry that is not there and went red; the row now states the
asymmetry rather than assuming it, because a control that mirrored the maximum
would refuse a legal rate at the bottom end.

---

## 5. The dead band controls, and the sentence they now carry

`bands` XOR `ramp` made `addBandCommand` / `removeBandCommand` / `splitBandCommand`
**silent no-ops** on a ramp document — correct (growing a `bands` key onto a ramp
preset would author the both-keys document the schema refuses, on every click),
and a dead control with no explanation.

`bandControlsRefusal` is **one predicate read three times**: the chip's `disabled`,
the chip's `title`, and the Hint painted under it. The harness asserts the
sentence, not the flag — `[dc-b]` requires the refusal to be in a real element
whose rect lands inside its own scroller AND to contain four specific phrases
(which document, the exactly-one rule, the no-combinator reason, the way out).

**`lastBandRefusal` now asks the channel first**, and that is not cosmetic: on a
ramp document its floor arm reads an absent band list as a list of length 0 and
answers *"this is its only raster band"* — false, about a document with no bands.
The band cards do not render on a ramp document, so nothing paints it today; a
refusal that is only correct because nobody looks at it is not correct.

⚠ **No "I clicked the disabled chip" row is shipped, deliberately.** A disabled
`<button>` fires no `onClick`, so "I pressed it and nothing happened" is green
however the code behaves — the green-by-construction shape the nine-parcel refused
for `Remove layer`. The harness records that as a NOTE with the reasoning.

---

## 6. The conversion — BUILT, because it is one Ctrl+Z

The brief set the bar: one `executeCommand`, one undo step restoring exactly what
was there, **or it must not exist**. It clears the bar, and the reason is
structural rather than lucky: `editPresetCommand` builds a `set-effects-preset`
carrying the **whole** old document and the whole new one, and
`undoCommand` re-places `cmd.oldPreset` verbatim.

**Measured in the running app** (`[cv-z]`), not reasoned about: convert
bands → ramp, press Ctrl+Z once, and the document is compared by full JSON
equality against the snapshot taken before the switch. It comes back identical —
every band, in order, with its colours.

The affordance is a `<select>` rather than a confirm dialog, and the precedent is
this panel's own ON-arm select, which replaces an arm body on a change and says
"the author's old arm body is NOT lost to them — the swap is one undo step". The
advisory is **unconditional and sits under the control**, naming what would be
discarded (`3 raster bands`, or `this ramp`) *before* the switch —
`deletePresetRefusal`'s ruling that a confirm asks "are you sure?" about a
consequence the author cannot see, while a sentence names it.

**Without this the parcel would have shipped an unreachable feature**: `newPreset`
seeds `bands`, so with no conversion no author could ever get a ramp document to
edit, and the harness could not have built a fixture either.

---

## 7. Proof

### 7.1 The instruments

| | rows | runner |
|---|---|---|
| `src/renderer/providers/__tests__/effects-preset-ramp-control.test.ts` | **32** | `npm test` (vitest include) |
| `src/renderer/components/effects/__tests__/ramp-control-wording.test.ts` | **14** | `npm test` (vitest include) |
| `scratchpad/ramp-control-harness.mjs` | **18** | `npm run harness:ramp-control` — **registered in `package.json`**, and `npm run check:harness-guards` classifies it LAUNCHER (guarded): 195 clean / 195, 0 failures |

The harness drives the built app under CDP: real mouse presses at integer client
pixels verified with `elementFromPoint`, and `Input.insertText` for every number.
**Never `.click()` for a subject.** The one exception is stated in the file's
header rather than hidden: a native `<select>`'s popup cannot be driven under
Xvfb, so `convertChannel` tries a real `ArrowDown` first, reports which gesture
actually moved the document, and falls back to the native value setter plus a real
`change` — the idiom every other select-driving harness here uses. Reachability of
that select is covered separately, in `[f0]`.

### 7.2 Red-first — five plants, each shown on disk AND in the shipped `dist/`

Every plant was applied to a **committed** baseline (`fea131c3`), rebuilt with
`VITE_AURORA_DEBUG=1 npm run build`, grepped out of the bundle that the app
actually serves, run, and restored with `git checkout --` (verified `git status`
clean).

| plant | mutation, on disk | in `dist/` | went red |
|---|---|---|---|
| **A** the display lag | `effects-preset.ts:2973` `const lag = 0;` (`git diff --stat`: 1 file, 1 ins/1 del) | `function rampDisplaySpan(ramp) { const lag = 0;` | **4** node rows + harness **`[ds-b]`** |
| **B** the hole's sentence | `if (false) return 'sign-hole';` | `rampRateProblem` ships with the hole branch **gone** | **2** node rows + harness **`[rt-b]`** |
| **C** the span pair | `if (false && sum > …SPAN_MAX) {` | `rampSpanRefusal` ships as `value + ramp[…]; return null;` | **4** node rows + harness **`[sp-a] [sp-b] [sp-c]`** |
| **D** the dead-control sentence | `if (true) return null;` in `bandControlsRefusal` | `function bandControlsRefusal(preset) { return null; }`, and `grep -c 'carries a ramp, not bands'` → **0** | **2** node rows + harness **`[dc-a] [dc-b] [dc-c]`** |
| **E** a sixth control | a `Curve` `<Field>` + `<NumberField>` in `RampCard` | `label: "Curve"` in `dist/renderer/assets/index-*.js` | **2** wording rows |

**Two of these are worth reading twice.**

**Plant B is the silent-no-op shape, isolated.** Removing the hole's sentence left
`[rt-a]` GREEN — the write is still withheld by the codec, so the document does
not move — and only `[rt-b]`, the row about the sentence, went red. That is
exactly the defect class this parcel exists to remove, and it demonstrates that
the "it refused" rows and the "it said why" rows are measuring different things.

**Plant A left `[ds-a]` green and reddened only `[ds-b]`.** `[ds-a]` measures the
WRITE span, which does not move when the lag is dropped; `[ds-b]` measures the
delta between the two spans. The split is deliberate and the plant confirms it.

### 7.3 Aggregates

| | Test Files | Tests |
|---|---|---|
| **Master `4ee4d116`** (`vitest run`, measured here, not relayed) | 476 passed / 2 skipped (478) | **6620 passed** / 8 skipped (6628) |
| **This branch** (`npm test`, whole chain incl. typecheck + 7 `check:*`) | 478 passed / 2 skipped (480) | **6666 passed** / 8 skipped (6674) |

**+2 files, +46 tests, 0 failures** — 32 + 14, exactly the two new files. Nothing
was deleted or skipped; the 8 skips are unchanged and each names its reason.

Harness: **18/18** on a clean tree, run twice (before the plants and after the
restore), and each plant's run read as its own first run.

---

## 8. Design calls I made, and what I would take to the owner

- **One card in the existing section, not a new section.** The channel is
  `bands` XOR `ramp`, so the two author into the same slot; a separate always-
  visible ramp section would imply both are live at once. The `Preset — <id>`
  section title is **unchanged** on purpose — `harness:d27-four-survivors` opens
  it by a regex that a suffix would break.
- **A `<select>` for the conversion, not two buttons.** The panel's own ON-arm
  precedent, which is the same destructive-swap shape one level down. The residual
  is real and stated: a stray arrow key on a focused select converts the document.
  It is one Ctrl+Z, and the advisory is on screen before the gesture — but if the
  owner wants a heavier affordance for it, that is a decision card, not a defect.
- **`presetListEntries` gained a `channel`**, so a ramp preset's row reads `ramp`
  instead of `0 bands`, which read as a broken document.
- **The seeded ramp is `top 64 / lines 128 / addr 0 / start 0 / step 0.25`.** It
  BUILDS (192 is inside the interlock) — `newBand`'s rule that a seed must not be
  born tripping a rule the author had no hand in — and `step` is non-zero because
  a control whose first state does nothing teaches the author it does nothing.

**Nothing is blocked.** **Nothing here has seen a ROM obey a ramp, and nothing
claims one has** — aeon's generator refuses the key today, which is what the
disclosure above the controls says in as many words.
