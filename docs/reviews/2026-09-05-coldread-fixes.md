# Effects cold-read fixes — 2026-09-05

Fixes for the three defects in `docs/reviews/2026-09-05-effects-cold-read.md`,
plus two of its cheap minor items. Branch `parcel/coldread-fixes`.

Witnessed on a running app: `npm run harness:coldread-fixes` — **15 rows, 0
failed, 0 UNMEASURED**, 1400x872, `devicePixelRatio = 1` on every positional
reading. Captures in `docs/captures/2026-09-05-coldread-fixes/`.

| commit | what |
|---|---|
| `600a7c4a` | D-A — the third condition row, derived |
| `92985bb0` | C7 — a colour word the wire cannot hold is refused |
| `b5f64437` | C8 — a refusal that cannot read as "nothing changed" |
| `3a5bd66b` | the duplicate refuse-before-commit gate (fallout, and a latent defect in both copies) |
| `7e9718b8` | C9 + C7's select-on-click, and the harness |

---

## 1. D-A — the strip promised on two conditions and there was a third

### The shape chosen, and why

**A third condition row** (`1 of 3` / `2 of 3` / `3 of 3`), not a "cannot bind
here". Three reasons, in order of weight:

1. **The module's own written ruling.** `section-wiring.ts` already says why the
   first two conditions are kept apart:

   > condition 1 fails → ask for a preset SPLIT (a data change, several lines)
   > condition 2 fails → ask for ONE aeon line

   Which one you fail decides what you do next. Condition 3 has a **third,
   different** remedy — `cycle: ojz_act1_sec_cycle(sec: 5, hand: Pal_Cycle_None)`
   inside that section's `preset()`. A distinct remedy earns a distinct row by
   the precedent already in the file.
2. **"Cannot bind here" is a prohibition**, and `core/formats/raster-binding.ts`
   carries a standing refusal against Aurora deciding which sections may accept a
   binding. Condition 3 is an advisory like the other two: nothing is disabled,
   the binding is still written, aeon's build stays the authority.
3. **Cost.** One ~14px row in a ~100px permanent strip. The owner's "confusing
   and convoluted" is real and this is more surface — but a verdict that is wrong
   is a worse one, and the brief's own framing applies: a lie is worse than a
   control.

### It is not one channel, it is four

The cold read's D-A is about `cycles`. Following it literally would have produced
a condition that was right for that report and **silently wrong** for the
`patch_world_ys` + `patch_motion` document Aurora itself measured on 2026-09-04.

aeon's authority is a **table**, not a special case. From
`tools/effects_gen.py` at `305af22217b4a8fbf055eaa301bd484aba7c133c`:

```python
SECTION_CHANNELS = (
    SectionChannel("raster", None, "raster", "fn_sec_raster", None, …),
    SectionChannel("patched", "boundary", "patched", "fn_sec_patched", None, …),
    SectionChannel("cycle", "cycles", "cycle", "fn_sec_cycle", None,
                   lambda d: "cycles" in d, lambda d: None, "Pal_Cycle_None"),
    SectionChannel("variant", "variants", "variants", "fn_sec_variant", "slot", …),
    SectionChannel("patch world-Y", "patch_world_ys", …, "ch", …),
    SectionChannel("patch motion", "patch_motion", …, "ch", …),
)
ARM_CHANNELS = ("raster", "patched")
```

and its own banner says why it is a table:

> A gate that named the four channels would close this hole and reopen it at the
> fifth key — `boundary` itself was the fourth key added in a fortnight. The
> requirement is a FUNCTION of the document (`effects_gen.document_channels`) …
> A key that starts emitting rows starts being required here on the same commit.

`tools/effects_seam_gate.py::channel_faults` is the consumer; Aurora's condition
3 maps onto it one-to-one, arms skipped for the same stated reason.

### What is derived and what is written down

**Derived, per load, from aeon's own files — nothing about which sections thread
what appears in this repository.** `libraryChannelCalls` parses the four
choosers' call sites out of the **same read** of `<zone>_effects.emp` that
condition 2 already does, with the same `preset()`-record split. One file, one
pass, no new I/O.

**Written down: the channel table only** — the schema-level fact that a preset
document has six chooser channels and which document key owes which. Transcribed
with its provenance, and guarded: a test asserts `EXTRA_SECTION_CHANNELS` against
aeon's own `SECTION_CHANNELS` parsed out of `effects_gen.py`, and **skips with a
reason** when no checkout is reachable.

Chooser names are derived, not typed: aeon's `ActNames` uses
`stem = f"{zone_id}_{act_id}"`, which is exactly Aurora's existing
`rasterChooserName`; a test pins the two against each other.

### It was readable — the brief's STOP condition did not fire

The brief said to stop if the cycle threading were not readable from what Aurora
already parses. It is: same file, same records, one channel key over.

### Proven

`src/core/formats/effects/__tests__/section-wiring.test.ts`, 36 passed / 0
skipped. The load-bearing row reproduces the cold read against aeon's real tree:
section 5 is ✓ own preset, ✓ threaded, ✗ its channels for a `cycles`-carrying
document. Derived rather than taken from the report — `OJZ_Preset_Sec5` spells
`cycle: Pal_Cycle_None`, a literal, at `ojz_effects.emp:1603`.

Anti-vacuous both ways: the same section **passes** for a keyless document and
for the four patch indices it really does thread, and fails for a fifth index.

**Red-first, mutations shown applied:**

| mutation | on disk | result |
|---|---|---|
| drop the `cycle` row from `EXTRA_SECTION_CHANNELS` | `git diff --stat` 7 deletions; `grep -c "chooserSuffix: 'cycle'"` → 0 | **8 failed / 28 passed**, incl. the aeon-table row |
| ignore which record owns the threading | diff shows the `owner` lookup replaced by an any-record scan | **1 failed / 35 passed** |

Restored from the committed baseline each time; 36/36 green after.

### Live

Harness rows 1a–1e. The strip publishes three rows, every title reads "of 3", and
section 5's third row reports real derived facts
(`patch world-Y, patch motion threaded`). Section 0's reads `nothing bound; no
extra chooser threaded here`. Capture `02-section-5-three-conditions.png`.

### NOT fixed, recorded

**Condition 2 asks only about the `raster:` arm**, so it is still the wrong
question for a document carrying `boundary` — that lowers into `patched:` and is
chosen by `<act>_sec_patched`, a different generated function. An author can
create and bind a boundary document from this UI today. That changes what
condition 2 *means*, which is a different change from adding a condition that was
missing, so it is a separate parcel. Noted in `section-wiring.ts` at the code.

---

## 2. C7 — `parseColours` accepted words no Genesis colour can be

### The range, and the source I took it from

**`0 .. 65535` — one 16-bit word.** The constant is `CRAM_WORD_MAX` in
`core/formats/palette.ts`, **derived** as `(1 << (CRAM_WORD_BYTES * 8)) - 1`. No
literal `65535` appears in the code or in the assertions.

Three sources, each read by me at the location given:

**aeon `games/sonic4/data/effects/ojz_effects.emp`:265, at `305af2221`** — the
shipping declaration of a raster program:

> ```
> pub data OJZ_TestRaster: [u16; raster_words(OJZ_TEST_PROG)] = raster_program(OJZ_TEST_PROG)
> ```

**aeon `engine/effects/raster_dsl.emp`:3646, at `305af2221`** — where a colour
lands inside that array:

> ```
> ON body      op_words(Cram) = [OP_CRAM, comm>>16, comm&$FFFF, SPIN, len-1] ++ colours,
> ```

**Aurora `src/core/agent/validation.ts`:8** — this repo's own sentence for the
same fact:

> ```ts
> if (!Number.isInteger(word) || word < 0 || word > 0xFFFF) {
>   return `color $${String(word)} is not a 16-bit word`;
> }
> ```

So a colour **is** one `u16` of the emitted program. `143584` names no CRAM word
at all — the same class of fault as `"x"` naming no integer, which is why it may
be asserted here despite aeon §E.4 ("Do not validate ranges, and do not clamp.
Forward what the author typed", quoted at `effects-preset.ts`:495). §E.4 forbids
*inventing* a bound; it does not require accepting a number the wire cannot hold.

### ⚠ THE DISAGREEMENT — and it is on a different question

There **is** a live disagreement in this repo, but it is about the **0BGR0 grid**
(may the dead bits be set?), not about the width. Four positions:

| source | says |
|---|---|
| `core/agent/validation.ts`:11 | refuses `(word & $F111) !== 0` — "channels must be even values 0-$E" |
| `core/formats/palette.ts`, `sameGenesisColor` docblock | the opposite: "Two words that differ only outside the mask are **THE SAME COLOUR** … a palette read out of a disasm can carry junk in the dead bits" |
| `providers/palette-classic.ts`:104, `palette-canvas.ts`:139 | neither refuse nor grid-check — they MASK to `& 0xffff` and commit |
| aeon `stream_cram` | bounds `addr` and `colours.len` and **nothing** about a colour's value |

**I applied only the half every source agrees on.** A grid check here would
refuse documents aeon's build accepts — a bound Aurora made up, which is exactly
what §E.4 names. The choice is **pinned by a test** so a later reader meets the
disagreement rather than a silent gap: `parseColours('1')` is accepted while
`validateGenesisColor(1)` refuses it, asserted side by side.

**This is the finding to rule on.** Aurora holds three incompatible answers to
"is this a legal colour word" across four files. Not resolved here.

### The swatch is the second consumer of the same rule

`decodeGenesisColor` reads bits 1-3 / 5-7 / 9-11 and **masks** the rest, so it
paints a plausible colour for any number at all — the cold reader's cheerful
green for `143584`. `parseColours` blocks the UI path, but a document can still
arrive carrying an illegal word (off disk, or the agent path, whose schema states
no bound). So `cramWordIsPaintable` is the one predicate both read: an
unpaintable word gets diagonal warning bars instead of an invented colour, and
`colourSwatchTitle` names it. That is `addrGloss`'s own rule one field over —
name the abnormal case rather than rendering a confident answer for it.

### Proven

5 new rows in `effects-preset-colours.test.ts` (31 passed): the cold reader's own
value; both edges with no off-by-one; hex spelling; one bad word refuses the
whole list; the grid disagreement pinned as a choice; and a row proving the two
consumers cannot drift (every value one accepts, the other paints).

**Red-first:** `if (n < 0 || n > CRAM_WORD_MAX)` → `if (false)` (diff shown) →
**4 failed / 27 passed**. Then `cramWordIsPaintable`'s body → `return true` (diff
shown) → **1 failed / 30 passed**. Restored, 31/31.

**Live:** harness rows 7a/7b/7z, capture `04-colour-refused.png`.

---

## 3. C8 — `NumberField` commits per keystroke

### The measurement, and the shape chosen

**Shape (B): keep per-keystroke commits, fix the wording.** Commit-on-blur was
measured and rejected.

**Blast radius — 45 usages across 5 files** (`grep -rn '<NumberField'
--include='*.tsx' src/`, production files only; the counts sum):

| file | usages |
|---|---|
| `components/effects/BandPresetPanel.tsx` | 21 |
| `components/effects/EffectsScenePanel.tsx` | 18 |
| `components/effects/BgAnimBandPanel.tsx` | 4 |
| `components/shared/ObjectInspector.tsx` | 1 |
| `shell/SpriteToolOptions.tsx` | 1 |

21 pass `refuse`; 24 do not.

**Two consumers depend on the commit landing as you type:**

- `BgAnimBandPanel.tsx` (`cols`, `rows`, `rateShift`, `staticBase`) writes
  `editorStore.bandCandidate`, which **`MapViewport` — a sibling, not a child —**
  reads to tint the map live. The file says so itself.
- `ObjectInspector.tsx` X/Y commit straight through `port.commit`, moving the
  marker on the map per keystroke.

**What would land red under commit-on-blur:**

- `scratchpad/numberfield-empty-harness.mjs` — a **registered** harness that
  drives the real app. Its check `4a` asserts the exact property commit-on-blur
  would remove, and names it in its own words:

  > the spinner arrow still moves the value immediately, without blurring …
  > This is the behaviour commit-on-blur would have cost, and the stated reason
  > the parcel did not choose it

  Checks `1a` and `3a` also type-then-read the document with no blur.
- `number-field-empty.test.ts` — four `type()`-then-assert-`commits` blocks that
  never blur (lines 111, 129, 140, 195).

A correct narrow fix beats a broad one that lands red. Timing unchanged.

### The fix, and why it is in the field and not the provider

**Only `NumberField` knows the fact.** `refuse` is handed one number and the
document; it cannot tell a refusal that follows a partial commit from one that
follows no commit. A provider-side sentence would be always-on and often false —
a single illegal keystroke over a legal value really does change nothing. The
field holds both halves in a ref (what the document held at focus, how many
values *it* has landed since), so the clause is added exactly when true:

> Top: 250 is not a screen line — … Refused; Top is still 25. **⚠ AND IT HAS
> ALREADY MOVED: this box held 112 when you clicked into it, and now holds 25. It
> commits on every keystroke, so a shorter number that is legal on its own lands
> on the way to a longer one. Retype the whole value, or undo.**

That is the sentence read off the running app, not a mock-up.

It lands **only** on `NumberField` refusals. The same `Refused; X is still N`
shape is produced for `Select`-backed controls in `effects-preset.ts`, where
there is no per-keystroke commit and the clause would be a lie of its own. **Not
one provider string was touched.**

### Proven

6 new rows driving the real component (27 passed), incl. the cold reader's exact
gesture. Four gates each tested alone: silent when nothing committed, when never
focused, when the commits land back on the focus value, and with no baseline. The
counter resets on **focus**, not blur — the refusal stays painted after the box
snaps back, which is when it is read.

**Red-first:** an early `if (true) return why;` in `refusalWithCommittedDrift`
(diff shown) → **3 failed / 24 passed**. Then the focus reset made to inherit the
previous gesture (diff shown) → **1 failed / 26 passed**. Restored, 27/27.

**Live:** harness rows 8a/8b/8c/8z, capture `05-numberfield-drift-refusal.png`.

### One note the packet got slightly wrong, and it does not soften anything

The packet reconstructs the gesture as "`2` → 2, `25` → 25 (legal, committed),
`250` → refused". The rule is 3..223, so `2` was **also** refused and only `25`
landed. One committed prefix is all it takes to destroy the 40, and the message
still said "still 25".

---

## 4. Fallout: the refuse-before-commit gate had a second copy

Found by the full suite. `authoring-refusals.test.ts` carries the same
source-text gate over `NumberField`'s `onChange` as
`ui/__tests__/number-field-empty.test.ts`. Moving the commit inside a block broke
both; only one was updated with the change.

⚠ **Both had the same latent defect**, which is the more useful half:

```ts
const commitAt = body.indexOf('if (why === null) onChange(n)');
expect(commitAt).toBeGreaterThan(askAt);
```

`indexOf` returns `-1` for a literal that no longer exists, and `-1` fails
`toBeGreaterThan` — so a **refactor is reported as "the commit runs before the
refusal"**, a contract violation that did not happen. A gate whose failure mode
misnames the fault sends its reader to the wrong file. Both now assert three
positions in order (ask → guard → commit), which pins the same rule harder and
cannot mistake a moved line for a reordered one. Each names the other.

---

## 5. Minor items — taken

### C9 — the "pinned" strip scrolls sideways and clips its ✓/✗ · TAKEN

Reproduced at the cold read's own numbers: with the CYCLES card open, the panel
measured **scrollWidth 294 / clientWidth 284**. Ten pixels of horizontal scroll in
the scroller the sticky strip lives inside — enough to carry the ✓/✗ off the left
edge, on a strip the guide calls "always there, never scrolls", and the glyphs
condition 3 now depends on.

⚠ **Not the element the cold read blamed.** The report attributed it to the
`cycles` `<select>` ("294px wide because its widest option is …"). Measured: the
select is **200px**, and the overflowing node is a `<code>` holding
`data/editor/effects/presets/aurora_ramp_witness.json` at 286px, 11px past the
scrollport. Fixed with `overflowWrap: 'anywhere'` on `Hint`.

⚠⚠ **Two false proofs before the real one**, recorded because the shape recurs:

1. The first row measured the Colour tab with every card **shut**, found no
   overflow, printed PASS. A green on a state that is not the defect's state.
2. The second reproduced the overflow, then "fixed" it — and the fix stayed
   **green with the line reverted**, because the harness was by then selecting a
   shorter-id preset and there was no overflow left to remove. Applied-and-green
   is a runner defect, not a pass. The width scales with the preset id, so the
   defect appears and disappears as you click around. Row 9a now selects the
   **longest id** deliberately.

Red-first on that fixture: reverted → overflow 10px, FAIL; restored → 0, PASS.

`column-layout.tsx` has a deliberate "no `overflowWrap`" rule — for the **label**
column, pinned by `label-column-align.test.ts`. A `Hint` is prose and in neither.
Noted at the change so it does not read as a violation.

### C7's other half — the colours box appends where its siblings replace · TAKEN

The guide promises "Clicking a number box also selects what is in it". True of
Top, Bot and addr; false of `colours`, the one TEXT input among them.

⚠ `onFocus={select()}` **alone is not enough on a text input** — measured: with
only that line, a real press/release left `selectionStart/End` at `2/2` on a value
of `"14"`, because the browser sets the caret on mouse-up, after focus.
`NumberField` gets away with the one line because a `type=number` box is
browser-selected anyway. The mouse-up is now prevented once, for the click that
*brought* focus, so a second click still places a caret. The box also carried no
`type` and no `title` while all three siblings had both; supplied.

---

## 6. Minor items — LEFT, with why

| id | why left |
|---|---|
| **C1** red ✗ greets you on an untouched project | **Taste.** It is the glyph-vs-paragraph question the packet's own **T3** raises ("the ✓/✗ duplicate work the sentences beside them do better"). Removing or re-toning the glyphs is a design call, and I have just added a third one. **For the owner.** |
| **C2** "Editing Section 0" above a form for a scene it is not bound to | **Not cheap, and a genuine design question.** The packet calls it "the single most disorienting thing on the screen" and also says it *is* a coherent design. Fixing it means deciding whether the SCENES form follows the section — which is the two-sources-of-truth hazard `SectionPicker.tsx` already documents. **For the owner.** |
| **C3** the good factor sentence is a hover tooltip | **Not cheap.** Making it permanent costs vertical space in a column the same packet (T1) says is already a wall of prose. A real layout trade, not a bug. |
| **C5** one `B curve to` entry is "(engine refuses)" with no reason | **Cheap-looking, but I did not verify the reason.** The packet's "you cannot curve to the value you started at" is the reader's *deduction*, and shipping a sentence stating a rule I have not read in aeon's source is exactly how a confident-and-wrong label gets into the UI. Needs one derivation, then it is a one-line fix. |
| **C6** the guide over-warns that Ctrl+S produces "a large git status" | **Left, and it should be taken.** It is a factually wrong sentence in the guide (the cold reader's save produced **two** files) and it teaches distrust of the next warning. Cheap, but it is guide prose and I would want to confirm the save-scope claim against `save-writes-only-what-changed` before rewriting it rather than swapping one unverified number for another. |
| **C10** the guide's happy path always fails; `tools/regenerate-level.sh` is only under a different symptom | **Left, and it should be taken.** Same class as C6 and higher value — the documented path stops at a red build every time. It is guide prose plus a decision about whether Aurora should say anything about aeon's re-bake at all. |
| **D1** Build & Run exists only in Ctrl+K | **Out of scope and partly forbidden.** Adding a visible control is a design call, and this parcel is barred from pressing it to check anything. |
| **R1** three spellings of the layer's vertical position | **Taste/naming**, and one of the three is the wire format. **For the owner.** |
| **R2** the preset list's right column mixes counts and program names | **Taste.** The column is the provider's own summary and the mixing is deliberate (a ramp document has no band count). A header would help; that is a design call. |
| **T1–T4** | Explicitly recorded as taste by the packet. Untouched. |

---

## 7. Suite

**Final, after merging master in (`5eacf414`):**

```
Test Files  502 passed | 3 skipped (505)
     Tests  7256 passed | 9 skipped (7265)   0 failed
```

### The one red I carried for most of this parcel, and what it turned out to be

Against my merge-base (`46f211a6`) the suite ran **1 failed / 7255 passed**:
`test/formats/effects-channel-bands-drift.test.ts`'s aeon-currency row, which
says of itself "NOT AN AURORA REGRESSION — the vendored aeon channel-bands
sidecar is stale".

I proved it pre-existing rather than arguing it: checked out `46f211a6` into a
detached worktree and ran that file there — **1 failed / 6 passed**, identically,
and `git diff master..HEAD` over the test, the vendored JSON, its provenance and
`channel-bands.ts` was empty.

⚠ **And that proof went stale while I held it.** `master` advanced from
`46f211a6` to `5eacf414` during this parcel — six commits landing
CHBAND-PROSE-REPIN step 3, including `afa3d144 vendor: aeon's fit sentence,
restated in the refusal direction only`, which re-vendors exactly that sidecar.
Master's new tip passes the row (7/7, verified in a detached worktree at
`5eacf414`). So the honest statement is **not** "there is a standing red": it is
that the red belonged to a window in master's history that another lane has since
closed, and my branch never touched it either way.

I found this only because `git diff master..HEAD` listed seven files none of my
commits touched — the tell that the ref I had been comparing against had moved
under me. Master is merged into this branch and the suite is green on the merged
tree, so the controller is merging a state that has actually been run.

The 9th skip (vs 8) is `sibling-root`'s step-3 row, which skips **with a reason**
because this run stands in a linked worktree rather than the main checkout.
Environmental, not mine.

---

## 8. Tagged for foreground follow-up

Nothing in this parcel touched an emulator MCP tool or pressed Build & Run.

- **Whether the third condition's ✗ path renders correctly for a real
  `cycles`-carrying binding.** The unit rows cover the derivation and the live
  harness covers the ✓ path (section 5's patch channels). Producing a live ✗ means
  binding a cycles preset to section 5 in a project, which is a **save** — and
  this harness deliberately never saves. Not measured live; not green.
- **Nothing here has been through a ROM.** No fix in this parcel changes what
  Aurora writes to disk; all five change what it *refuses* or what it *says*.
