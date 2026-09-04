# EW-BOUNDARY-PANEL — the fourth arm becomes author-able, and the poison that proved it had to move

**Parcel** EW-BOUNDARY-PANEL (project EFFECTS-W1) · **branch** `feat/ew-boundary-panel`
· **cut from** `e04eed21` · **tip** `2b7ec4b9` · **2026-09-04**

Four commits: `8015b3d6` (the provider, the seed, the widened registries),
`c06721c7` (the card and its rows), `d47c69f8` (the CDP harness, the fifth mount
site, and a gloss that turned out to be a rule), `2b7ec4b9` (the harness's own
instrument fix, with the whole harness re-run under it).

This is the authoring half of the thing `docs/reviews/2026-09-04-ew-boundary-codec.md`
§9 lists as its first OPEN item. That parcel built *refusals* on this surface
deliberately; a person can now create a `boundary` preset, set every field, save
it and reload it byte-stably.

---

## 1. What a person can now do, and what they are told while doing it

| | before (row 149) | now |
|---|---|---|
| Program row offers `boundary` | no — deliberately | **yes**, labelled `boundary — one patchable palette line (patched, not raster)` |
| a seed for a new one | none | **parsed out of the contract's own quoted shipped program** |
| a card | none; `programArmEditorGap` said so | **8 numbers, 2 flags**, every bound the codec's |
| the four advisories | in the codec, unrendered | **painted, each with its `enforced_by`** |
| the no-build warning | armed, mounted in four bodies, none of them this arm's | **on screen in the card**, measured |

The row is now labelled **Program**, not Raster, and its value is
`presetProgramArm`. `presetRasterChannel` returns null on a boundary document —
"this preset carries no raster program", true and the wrong question — so the
select painted a **blank row** for a document carrying a whole patched program.
Its hover text is `programArmRowTitle`, the paragraph for the arm the document
actually carries; it was `RAMP_TITLE` hard-wired, which explained the ramp on
three arms out of four.

---

## 2. The seed: parsed, and cross-checked against a second sentence

`$defs.boundary`'s description quotes aeon's shipped moving water as a complete
call, every field present:

```
patchable(fx_tint_band(line: 100, slot: 0, pal_line: 2, entry: 4, count: 3, sh: 1),
          ch: 0, lo: 3, hi: 220, offscreen_ship: 1)
```

So a fresh boundary is **aeon's**, not a number this editor chose. That matters
more here than on the other three arms for a reason worth stating plainly:
**four of the eight numbers have no schema range at all.**
`$defs.tint_region` declares `slot`, `pal_line`, `entry` and `count` as bare
integers on purpose — §7.1's shape-only posture, *"every range is
`stream_pal_region`'s own ensure … and is NOT restated; the engine message
carries the measurement"*. A seed invented for those four would be
**unfalsifiable**: no schema keyword, no contract vector and no codec row could
contradict it. (§6 poison 2b measures exactly that.)

Four interlocks, all at module load:

* the contract's **LOWERING** sentence is parsed and every required member of
  the boundary *and* of the tint region must appear in the call it describes —
  the map from document field to call argument is read, not assumed (`ch:` is the
  document's `channel`);
* the shipped **line** is cross-checked against the schema's **second,
  independent statement** of it — `properties.line`'s closing *"The shipped water
  uses 100."* — and refuses when they disagree. This is `BASE_SWAP_SEED_LINE`'s
  lesson one key over: there, one sentence grew a second number and the obvious
  repair was green and seeded the superseded value while 32 rows stayed green;
* every bounded field is checked against its own declared range;
* **the seed is asked of `boundaryAdvisories` itself** — the real predicate, not
  a copy — and the ONLY sentence it may earn is `no-motion`.

### ⚠ The seed writes only the `boundary` key, deliberately

A fresh boundary is a **still** boundary. The honest answer to that is the
`no-motion` advisory, not a `patch_world_ys` / `patch_motion` pair the author
never authored — the codec's own rule is that padding a positional key *"turns
'the section keeps its hand-authored channel' into 'the editor authored something
here', which is a different document"*. So a fresh document earns exactly one
warning on creation, `BOUNDARY_SEED_ADVISORY` asserts it is that one and no
other, and the CDP run measures the sentence on screen.

---

## 3. ⚠ The panel refuses nothing cross-field, and that is the design

`lo <= hi` (aeon `raster_dsl.emp:465-467`) and `line` inside `[lo, hi]`
(`:475-476`) are the **generator's**. The schema accepts both violations, the
codec accepts both, and `boundary.ts`'s header says in as many words that nothing
in it may become the only check.

A control greyed out on `lo > hi` **would look like diligence** and would be
refusing a document the contract accepts. So:

* `boundaryFieldRefusal` is single-field only — integer-ness and the schema's own
  declared range — and never compares two fields;
* `boundaryTintRefusal` refuses non-integers *only*, and its sentence **says the
  contract declares no range here on purpose** and names where the real bound
  lives;
* an inverted band is asserted **writable**, through the real command, saving
  through the real codec, with the advisory as the consequence.

The poison that adds the tempting refusal (§6, #4) reddens two node rows and two
CDP rows and nothing else — which is the measure of how invisible that defect
would otherwise be.

---

## 4. `enforced_by` is painted, not just `text`

That field exists rather than a docblock precisely so a surface that renders the
sentence cannot drop the attribution — the difference between "the editor thinks
this is wrong" and "aeon's generator will reject this". `boundaryAdvisoryAttribution`
reads the field; the card paints it beside every sentence; a source row and a CDP
row assert both halves. Removing it (§6, #3) reddens one node row **and two CDP
rows**, and the card still looks completely fine.

The fourth advisory is the one with **no engine enforcer at all**
(`enforced_by: 'nothing — this document is legal and builds'`), and it is
**index-wise**. Measured on the running app:

* seed + sweep channel 0 under *moving anchors*, with the boundary following
  channel 0 → the sentence **retires** on screen;
* point the boundary at channel 1, leaving both keys at index 0 → it **comes
  back, naming index 1**: *"this document does not author `patch_world_ys[1]` or
  `patch_motion[1]`. That is LEGAL and it BUILDS — and the boundary will sit
  still at line 223."*

The second half is what makes the first a measurement of the **index** rather
than of the mere presence of the two keys.

---

## 5. ⚠ The no-build warning, on screen, in the sharper flavour

Routed through the existing `PresetLagDisclosure` — no second sentence was
written, and a source row asserts the card writes no copy of it. Confirmed from
`preset-lag.ts` that the string is **derived** from `PRESET_KEYS_AWAITING_AEON`
rather than a literal: the leaf renders exactly `presetLagDisclosure(PRESET_KEYS_AWAITING_AEON)`,
and re-emptying that list is the whole of what retires it, in all five mount
sites, by construction.

Measured on the running app, this run:

> painted DIV, 258×231, 598 characters, inside its scroller —
> *"Not consumed by the engine yet. `boundary` is authored here and saved to this
> preset file, and that is as far as it goes: aeon's generator
> (tools/effects_gen.py) does not accept it at origin/master and refuses the
> WHOLE DOCUMENT, so a preset carrying the key will not build, nothing set below
> reaches a ROM, and no emulator has shown it. Measured 2026-09-04 by …"*

— naming `boundary` and no other key.

**aeon's generator arm for this key has not landed yet.** The load-bearing fact
is about the artifact, not about anyone's board: `boundary` is absent from
`PRESET_KEYS` at aeon `origin/master`, so their generator meets it as an unknown
property and rejects the whole document. A preset Aurora writes under this key
does not build.

---

## 6. The poison that had to move, and the guard that replaced it

`test/formats/effects-preset-boundary.test.ts` carries the codec parcel's
sharpest poison: remove the schema's `lowers into EffectsPreset.ep_patched`
sentence and `boundary` falls **into** `EFFECTS_PRESET_RASTER_CHANNELS`. Its
second half — *"and the consequence is LOUD"* — was true because the renderer's
per-arm registries were keyed by the **raster** list and had no entry for
`boundary`, so the provider refused to load.

**Keying them by ARM removed that**, and keying them by arm is what makes the
fourth arm authorable at all. The poisoned module now loads perfectly, every
registry finds its entry, and **only the prose is wrong**. The old assertion
would have started failing, and both green-path repairs — deleting it, or
widening the matcher — would have left an empty patched set with **no loud
consequence anywhere**, which is precisely the state the poison exists to rule
out.

What still has an opinion is the dropdown **label**. It is hand-written in the
provider and says `(patched, not raster)`; the classification is derived from the
schema's own sentence; `PROGRAM_ARM_OPTIONS` asserts they agree **in both
directions** at module load. Two independent statements of one fact — a human's
label and a derivation off the contract — so the guard is a comparison and not a
tautology.

### One sentence this parcel made false, and fixed

`bandControlsRefusal` told a boundary author to *"edit the JSON directly, or
remove the key there"*. That was **true** while the Program row had no seed for
the arm, and became an instruction to do by hand a thing one control does the
moment the seed landed. ⚠ **The existing negative assertion stayed green through
it** (`not.toMatch(/Set the Raster program row above back to bands/)`), because
the new sentence spells the row differently. The branch now asks
`programArmSeedRefusal('bands') === null` — *can the row convert* — which is the
only predicate that stays right for every arm there will be, and the row asserts
the positive.

### The seven poisons

Each applied on a clean tree at a committed tip, shown with `git diff -U0`, run
red, restored with `git checkout HEAD -- <path>` and re-run green.

| # | mutation (shown on disk) | result |
|---|---|---|
| 1 | `PROGRAM_ARM_LABELS.boundary` drops `(patched, not raster)` | **RED at module load** — both boundary test files cannot even import the provider |
| 2 | the seed's `line` ← the range's minimum instead of the parsed value | **RED at module load** — the two-sentence interlock fires: *"the patchable() call says 3 and properties.line says 100"* |
| 2b | ⚠ the sharpest: `region[k] = 1` — an **unbounded** seed member set to a plausible literal | **RED, exactly 1 row of 1 894** across the whole effects families. Nothing else can contradict a value with no schema range, which is the finding |
| 3 | the card paints `a.text` and drops `boundaryAdvisoryAttribution(a)` | **RED**: 1 node row, **and 2 CDP rows** (`[ad-a]`, `[xf-b]`) on a re-run under Xvfb. The card looks completely fine |
| 4 | `boundaryFieldRefusal` also refuses `lo > hi` — the "diligence" defect | **RED**: 2 node rows, **and 2 CDP rows** (`[xf-a]`, `[xf-b]`) on a re-run. Everything else stays green |
| 5 | `<PresetLagDisclosure />` removed from the boundary card | **RED**, 4 rows — the count row and all three per-site rows |
| 6 | `PROGRAM_ARM_SEEDS.boundary` writes `base_swap` instead | **RED at module load** — *"does not write the boundary key — it produced a base_swap document"* |
| 7 | `setProgramArmCommand`'s delete loop back to `EFFECTS_PRESET_RASTER_CHANNELS` | **RED**, 2 rows: the two-arm row and the widened conversion cross-product |

Poisons 3 and 4 each cost a `VITE_AURORA_DEBUG=1 npm run build` and a full
harness run; the tree and the build were both restored from the committed tip
afterwards and the restored build re-verified green.

---

## 7. Verification

| | before (measured here) | after (measured here) |
|---|---|---|
| `npm test` | **494 files / 3 skipped (497); 7 046 passed / 9 skipped (7 055), 0 failed** | **496 / 3 skipped (499); 7 087 passed / 9 skipped (7 096), 0 failed** |

Both are full foreground runs on this machine, aggregates and not tail excerpts.
Wall clock: the baseline finished 2026-09-04T10:14:35Z (uptime 9 days 22:03), the
after run 10:38:13Z (uptime 9 days 22:27).

⚠ **The first baseline attempt was discarded and re-run**, and it is worth
recording why: it was launched in the background and a rename landed on disk
while it was still collecting (log mtime 06:13:26, edited files 06:13:17), so it
could not be trusted as a statement about the branch point. The work was stashed,
the suite re-run at `e04eed21` with a clean tree, and the stash popped — the
numbers above are from that clean run.

### The harness

`scratchpad/boundary-control-harness.mjs`, registered as
`npm run harness:boundary-control` **in the same commit** (an unregistered
harness sat red for six days in this repo once, and `check-cited-paths` caught
the missing file before that could happen again).

**25/25 rows passed, exit 0, zero UNMEASURED**, on
`ELECTRON_BIN=<main>/node_modules/.bin/electron AURORA_BUILT_TREE=<this worktree>`,
`dpr=1` on every aim, every rect printed beside its integer client pixel.

Rows: `[b1]` `[f0]` `[f1]` `[f1b]` `[cv-0]` `[cv-a]` `[cv-b]` `[cv-z]` `[cv-y]`
`[lg-a]` `[lg-b]` `[ad-a]` `[ad-b]` `[xf-a]` `[xf-b]` `[xf-c]` `[rf-a]` `[rf-b]`
`[tr-a]` `[tr-b]` `[os-a]` `[mv-a]` `[mv-b]` `[mv-c]` `[z]`.

**Which rows discriminate, and which do not.**

* `[xf-a]`, `[ad-a]`, `[tr-a]` and `[mv-c]` are the four that fail for a
  *different reason than every other row* — respectively: the panel became the
  enforcer; the attribution was dropped; a range was invented for a field the
  contract does not bound; a check asked "is there a sweep?" instead of "at this
  index?". Poisons 3 and 4 confirm two of them under CDP.
* `[cv-z]` and `[cv-y]` discriminate on **full JSON equality**, not shape, so a
  conversion that rebuilt an equivalent document would fail them.
* `[f0]` is the anti-vacuous fixture and discriminates on the id colliding with a
  preset aeon ships — the accident that cost the ramp harness 18 rows.
* `[b1]` and `[z]` do **not** discriminate about this parcel. `[b1]` is a boot
  precondition and `[z]` is hygiene (nothing left in the model, nothing written
  to disk). They are reported as rows because a run where either failed would
  make the others unreadable, not because they measure the feature.
* `[f1b]` is thin: it asserts the row's label reads exactly `Program`. It would
  fail on a rename and on nothing else.

**⚠ Two rows failed on the first run and both were the INSTRUMENT.** `PAINTED`
took `.pop()` — the last matching element — and `PresetLagDisclosure` renders its
lead words in their own `<span>` inside the `Hint` carrying the rest, so a needle
aimed at the lead selected a 31-character element and every other needle read as
absent against a sentence that was fully on screen. It now picks the **shortest**
element containing **every** needle, falling back to the last match when none
carries them all so a real absence still fails honestly. **The whole harness was
re-run under the tightened selector** — the 23 rows that had already passed are
re-established by that run and not carried over.

---

## 8. Left open, deliberately

1. **⚠ TAGGED FOR FOREGROUND FOLLOW-UP — NOTHING HERE HAS SEEN A ROM.** No
   emulator was touched (workspace invariant). Every claim in this packet is
   about *documents*, *node-level behaviour* and *what is painted on a running
   Electron window*. **aeon's generator arm for `boundary` has not landed**, so a
   document carrying this key fails their build outright and there is nothing to
   confirm on a machine yet. When it lands, the loop worth driving is: author a
   boundary here + `patch_world_ys[c]` + `patch_motion[c]` → generator → ROM → a
   tint line that actually moves. The disclosure retires with the drift row on
   the same day, in all five mount sites, with no edit to this card.
2. **The cross-field rules stay advisory**, by the CR's ruling, and the sweep-fit
   verdict remains one-directional. Aurora is not, and must not become, the only
   check for any of them — and the panel is now measured *not* refusing them.
3. **`programArmSeedRefusal` returns null for every arm today.** That is the
   state in which a "not authorable here yet" affordance rots unnoticed. It is
   kept, with its docblock saying so, because the day a fifth arm is vendored the
   dropdown offers it (derived) and this is the only thing between an author and
   a switch that seeds nothing.
4. **`programArmEditorGapFor` is now the FIFTH arm's landing pad.** It fired for
   real on `boundary` — a document that opened, selected correctly, and rendered
   no editor — and this parcel is what retired it. It returns null for every real
   document again, which is the state a landing pad has to survive.
5. **No preview is drawn**, and none should be from here: nothing in this editor
   has ever drawn a raster program. What a boundary looks like is **quoted** from
   the contract (`BOUNDARY_WHAT_YOU_SEE`), asserted to be a substring of the
   vendored schema, rather than claimed by an editor that has measured nothing.
