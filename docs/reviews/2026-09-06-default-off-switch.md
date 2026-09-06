# `default_off` as a ship-silent switch, and the twin-coupling disclosure

**Branch** `parcel/default-off-switch` · **2026-09-06**

`default_off` is a per-band key in `editor_bg_override.json`. A band carrying it
is not counted into the act's `BgAnim_Table`, so a single-band act emits
`count = 0` and BG animation is **off at boot in every ROM shape, release
included**. Aurora preserved the key on round-trip and offered no way to set it.
It does now, as a per-band picker in the band card; and the coupling that stops
an author adding a second tile animation while one is silenced is disclosed at
the creation controls, in one place, built to be deleted.

---

## 0. What I found before I started, which changes the shape of Half B

**Half B was already shipped as a refusal at master `60e265b9`, and I very nearly
booked it as new work.** Measured on aeon's live document before any edit:

```
PROMOTE 1x1 => "default_off" is set on 1 of 2 tile animations, and the build
               refuses that: the debug view twins are emitted only for an act
               with EXACTLY ONE tile animation, ...
INSERT  1x1 => (the same string, byte for byte)
```

Both come from `promoteUnavailableReason` / `insertUnavailableReason` in
`src/renderer/providers/bg-anim-aeon.ts`, which project a second band and size
the result — so `viewsEmitted`'s refusal reaches both chips, both were already
disabled, and both already carried aeon's reason underneath. The section-ceiling
parcel that landed an hour earlier had put it there as a side effect of modelling
the byte budget.

So the gap the brief describes — "the author meets the engine's refusal instead
of our acceptance" — **did not exist for the shipped document**. What did:

1. **The refusal cannot reach an author who has not yet reached for the chip.**
   It lives in a `title` and in a hint under a control they have to aim at first.
2. **Its own advice named a thing nobody could do.** The refusal says *Clear
   `default_off`* — a JSON key no Aurora author could clear until Half A landed
   in this commit. Half A is what makes the refusal actionable, and Half B is
   what says so in Aurora's words rather than the document's.

**Half B shipped.** It is not descoped, weakened or deferred; it is smaller than
the brief expected because part of it was already standing. Nothing needs
re-sequencing at aeon on this account — but see §7, which is the reverse
finding.

---

## 1. The contract revision I read

Read with `git -C <AEON_DIR> show <rev>:<path>`, `AEON_DIR` resolved through
`test/support/sibling-root.mjs`. **aeon's checkout is another lane's live
working tree; nothing was written to it and nothing was read from its worktree
state.**

* **`fe4fabf88c98e9741990df02bb88574d2abd5441`** (aeon tip at 2026-09-06T12:55Z,
  the commit that also last touched the contract:
  *"contract(section budget): six constants whose only authority was our own
  tool's source"*)
* `tools/EFFECTS_CONSUMER_CONTRACT.md` §1.2 — the `default_off` row and its
  subsection *"`default_off` — a SHIPPED-BEHAVIOUR switch that reads like a
  preview setting"*
* `tools/inject_editor_bg.py` — `views_emitted()`, both `AssertionError`s, and
  the `default_off` tail assert inline in `main()`

**No constant was re-vendored.** Every value this parcel needs
(`BGANIM_VIEW_DERIVED_PERIOD_PX`, `BGANIM_VIEW_COUNT` and the section operands)
was vendored by the section-ceiling amendment at `78c99423` and is watched
between amendments by `test/formats/bg-override-contract-currency.test.ts`. I
read the contract to check the RULES and the ORDER, not the numbers, and both
are unchanged in substance at `fe4fabf8`.

### Where the brief and the contract disagreed

They did not, on the two refusals. One correction to my own reading of the
brief:

> *"It fires whether or not the new band carries `default_off` — so Half A does
> not fix it."*

The first clause is right and the second overstates. The refusal fires because
**the EXISTING band carries the key**, so Half A does not make the refusal go
away — but it does supply the way through, which is to clear the key on the
existing band first. The disclosure names that remedy, and harness row 6d
measures the door opening once it is cleared.

---

## 2. Every check, and its quantifier

The trap aeon's contract names by name is that the two obligations are not the
same shape. Stated per site:

| Site | Check | Quantifier |
|---|---|---|
| `bandIsDefaultOff` (`bg-override.ts`) | does this band carry the key | **PER BAND** |
| `viewsEmitted` refusal 1 | `bands.length !== 1` when any band carries it | **PER ACT** — on the band COUNT, *not* on agreement |
| `viewsEmitted` refusal 2 | `pattern_px === BGANIM_VIEW_DERIVED_PERIOD_PX` | **PER BAND** (the one band the act is then allowed) |
| `validateBgOverride` | `default_off` is a boolean | **PER BAND** — shape only |
| `sectionHarm` (`bg-override-band.ts`) | the edit must not grow an over-ceiling act, or make one unsizeable | **PER ACT** |
| `makeSetBandDefaultOffCommand` | all of the above, via the projection | **PER ACT + PER BAND**, inherited |
| `shipSilentSwitch(...).silent` | this band's state | **PER BAND** |
| `shipSilentSwitch(...).actBootsSilent` | does any band carry it | **PER ACT** |
| `shipSilentSwitch(...).reason` | the command's own refusal | **PER ACT + PER BAND**, inherited |
| `twinCouplingApplies` | does **any** band carry it | **PER ACT** |

**Nothing in this parcel restates either rule.** The command builds a shallow
projection of the edited document and hands it to `refuseIfResultInvalid`, which
sizes it, which runs `viewsEmitted`. The provider builds the command to answer
"why is this off". So there is exactly one copy of each rule, it is the one the
section-ceiling parcel vendored, and a greyed control and a failed click cannot
give an author two different sentences (pinned in
`bg-anim-aeon.ship-silent.test.ts`).

### A third refusal nobody asked for, and it is arithmetic

Silencing a band **adds** the three DEBUG view twins to the emitted section:
`BGANIM_VIEW_COUNT * (BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES * bands)`. On an
act near the ceiling that is a step backwards and `sectionHarm` refuses it. It
is not in aeon's writer-obligation list because it is not a rule — it falls out
of the size arithmetic — and a switch that ignored it would offer an author a
flip the build rejects. Rows in
`test/formats/bg-override-default-off-switch.test.ts` §"the twins are bytes".

### A fourth, which is unreachable and recorded anyway

aeon's `main()` asserts that `default_off` bands are the **TAIL** of the band
list. Refusal 1 already forces a single-band act on every path that emits, so it
can only fire if aeon relaxes the first. Recorded in the vendored contract's
`writerObligations[3]`; not modelled, because modelling an unreachable rule is a
second thing to keep true.

---

## 3. Where the switch is, and why it cannot read as a view control

**In the band card, in the block that ends with `Demote` and `Remove`.**

The argument is position, not wording:

* Everything an author can flip that changes only what they **see** lives in
  `BgAnimPreviewStrip`, above the list: the playback chip, the honesty label,
  the two column-wide warnings. The switch is not in it — measured, not asserted
  (harness row 3c: the band card does not contain the playback chip, and the
  chip precedes the card in document order).
* Everything in the band card changes the **document**: `Demote` rewrites the
  file, `Remove` destroys art, `Shift` regenerates banks. A reader who has
  understood `Demote` has already been told what kind of control this is
  (harness row 3b lists the card's controls).
* It is a labelled `Select`, the shape this panel uses for `driver`, `axis` and
  `rate_shift` — the document's own keys — and never a `Chip` that lights up,
  which is the shape it uses for the lens and for playback.
* The label is **`In the ROM`**. "Preview", "Show" and "Enabled" can all be read
  as statements about the canvas; this one cannot. The owner's own phrasing for
  the ask behind this key — *"maybe have one view for horizontal and one for
  vertical"* — is exactly the sentence that would have produced one of those
  labels.

The option text is `ships animating (default: the key is absent)` /
`ships silent (the act boots with BG animation off)`.

### The copy, in aeon's order

The contract does not only say what the key does; it says what order to say it
in: *"READ THIS FIRST, ahead of either obligation, and put it in author-facing
copy before either: `default_off` changes what SHIPS."* Three constants in
`providers/bg-anim-aeon.ts`, rendered in this order:

1. `SHIP_SILENT_LEAD` — *"Changes what SHIPS, not what you see here. A silenced
   tile animation is not counted into the act's table, so the act boots with BG
   animation OFF in every ROM, RELEASE INCLUDED. Nothing in this editor looks
   different either way."*
2. `SHIP_SILENT_OBLIGATIONS` — both rules with both quantifiers spelled out, and
   the period derived from `BGANIM_VIEW_DERIVED_PERIOD_PX`, never typed.
3. `SHIP_SILENT_EXCHANGE` — the twins, and that they are debug-only, so this is
   not a way to see the animation in the game as played.

The ordering is held as a position check rather than a matter of taste: the
release fact is in the LEAD constant and the obligations are in a different one
the panel renders after it, and the lead is asserted **not** to contain the
obligations.

### Absent, not `false`

Clearing the switch **deletes** the key. Absent is the contract's own default,
and it is the state every other optional band key uses for "the document tracks
aeon's default"; a written `false` would be Aurora freezing today's default into
a file that never spelled it. That is why the command records
`boolean | undefined` on both sides — undo of a silencing has to restore
ABSENCE, and undo of a clearing has to restore an explicit `false` a foreign
document held.

---

## 4. The disclosure: exact text, one site, and what retires it

Rendered at the top of the `New tile animation` section, above **both** creation
doors, only when `twinCouplingApplies(doc)`:

> This act has a tile animation SILENCED IN THE ROM, and while it does, the
> build refuses a SECOND one: the debug view twins are emitted only for an act
> with exactly one. Both doors below are off for that reason, not because of a
> budget. To add another, set the existing one back to "ships animating" first,
> and read what that changes before you do.

**One sentence for both doors because it is one fact, measured**: on aeon's live
document `promoteUnavailableReason` and `insertUnavailableReason` return the
identical string (§0, and pinned as `expect(insert).toBe(promote)`).

**It refuses the wrong diagnosis out loud.** Two budget lines sit immediately
above this control, so "both doors are off" reads as a budget problem unless the
sentence says otherwise. `not because of a budget` is in the assertion set.

### What retires it, and how

`TWIN_COUPLING_DISCLOSURE`'s own docblock in `providers/bg-anim-aeon.ts` carries
the procedure; the vendored contract's `amendments[].retires` field carries it
again for a reader who never opens the source. In short:

1. aeon lands the **decoupling fix** ruled 2026-09-06, separating the DEBUG view
   twins from the act's band count. `views_emitted`'s band-count `AssertionError`
   goes; the codec's `viewsEmitted` per-act refusal goes with it.
2. **Delete** `TWIN_COUPLING_DISCLOSURE` and `twinCouplingApplies`, and the one
   `Hint` in `BgAnimBandPanel.tsx` that renders them.
   `grep -rn TWIN_COUPLING_DISCLOSURE src/` finds every site: there are three,
   in those two files.
3. Amend `bandKeys.default_off.writerObligations[0]` in
   `src/core/formats/bg-override/bganim-consumer-contract.json` and add an
   `amendments` entry naming aeon's revision.

---

## 5. Plant proofs

Every plant was applied to the working tree, quoted from `git diff`, run red,
**restored with `git checkout --` from the committed baseline**, and run green.
Node rows ran the four affected files
(`bg-override-default-off-switch`, `bg-anim-aeon.ship-silent`,
`bg-override-section-ceiling`, `bg-override`): **133 rows green**.

| # | Plant | Result |
|---|---|---|
| 1 | `viewsEmitted`: `bands.length !== 1` → `off.length !== bands.length` (the natural per-key consistency validator) | **6 red** of 65 |
| 2 | `viewsEmitted`: period refusal disabled | **4 red** of 132 |
| 3 | `writeBandDefaultOff`: clearing writes `false` instead of deleting | **2 red** |
| 4 | `twinCouplingApplies`: `some` → `every` | **1 red** (see below) |
| 5 | `shipSilentSwitch`: `reason` forced to `null` (the permissive direction) | **2 red** |
| 6 | `SHIP_SILENT_LEAD` rewritten to lead with the obligation | **2 red** |
| 7 | `TWIN_COUPLING_DISCLOSURE` weakened to "check the two budget lines above" | **1 red** |
| 8 | `history.ts`: undo applies `newValue` instead of `oldValue` | **2 red** |
| 9 | panel: the disclosure `Hint` removed (CDP) | **3 red**, 23/26 |
| 10 | panel: the `In the ROM` `Field` removed (CDP) | **13 red**, 13/26 |

### ⚠ Two plants went GREEN first, and the gap was in my tests

**Plant 1 left both rows I had titled DISCRIMINATING sitting green.** Every state
the *command* visits on the way to a consistent two-band silenced act is
INCONSISTENT, so the wrong validator refuses those too. Reachability and
discrimination are different properties and I had one row claiming both. Fixed
by retitling the reachability rows to what they prove and adding two rows that
build the consistent act **directly**:

* `test/formats/bg-override-default-off-switch.test.ts` —
  *"DISCRIMINATING: a CONSISTENT two-band silenced act has no computable size"*
* `src/renderer/providers/__tests__/bg-anim-aeon.ship-silent.test.ts` —
  *"DISCRIMINATING: a CONSISTENT two-band silenced act is unmeasurable, not
  priced"* — `bandBudget` must return `sectionBytes: null`,
  `binding: 'unmeasurable'` and `slotsRemaining: 0`, never the looser tile
  figure, which is plainly non-zero on that fixture.

Both go red under plant 1; every reachability row stays green.

**Plant 4 went green outright.** My fixtures were a one-band silenced act
(satisfies `some` and `every`) and an act with none (satisfies neither). The
**MIXED** act — one silenced, one not — is the only shape that tells them apart,
and it is exactly the shape the disclosure exists for. Added as
*"QUANTIFIER: is true for a MIXED act"*. `every` is not a strawman: "the act
boots silent" reads like a property of all its bands, and it is armed by any one
of them.

### The discriminating quantifier row, stated plainly

The row the brief asked for is **a two-band act where the key is *consistent*
across bands must still be refused**. Where it lives and what it does:

* the act is built **directly**, because the command cannot produce it — the
  command refuses both first steps (also held, as a separate reachability row);
* it is a document a **hand edit, a file from disk, or a future aeon** can hold,
  and the consequence of getting it wrong is that Aurora would *price and offer*
  work on an act that will not bake;
* it goes red under the per-key validator and nothing else in the file does.

---

## 6. The panel half, on screen

The node suite cannot see React, so the `.tsx` half had no instrument.
`scratchpad/bganim-ship-silent-harness.mjs`
(`npm run harness:bganim-ship-silent`), 26 rows, **26/26 on aeon's live
document**, run against this worktree's own build with `AURORA_BUILT_TREE`
pinned. Shots kept at `docs/captures/2026-09-06-default-off-switch/`.

Two of my own rows were wrong and the run said so:

* **3c** walked four parents up from the playback chip and called that "the
  preview strip". Four parents up from anything in this column is the whole
  section body, so it contained the band card and reported the switch as a
  preview control. **The code was right; the measurement had guessed a
  boundary.** It now asks the same question with no guessed boundary.
* **1b** claimed "one tile animation at the derived period" and
  `__dbg.aeon.bands()` reports no period at all. Retitled to what it measures,
  with the period half moved to a row that reads it off the card.

**And the first two screenshots proved nothing.** The creation section is below
the fold in a scrolling column, so a `textContent` match is as green at 2,000px
out of view as in it. Row 5e scrolls to the disclosure and compares its rect to
the **scroller's** box — not `checkVisibility()` or `getClientRects()`, both of
which go green on an element scrolled clean out of view.

Plant 10 also found a **crash-instead-of-report**: the missing-switch shape
returned only a flag, so a later row read `.includes` on `undefined` and the run
threw, taking four sections with it. It returns the full shape now.

---

## 7. What I did NOT establish

* **No ROM was built and no emulator was run.** Every claim about what ships is
  a claim about what aeon's emitter would do, read out of its source and its
  contract at `fe4fabf8`. Nobody in this parcel watched an act boot silent.
* **The aeon-side decoupling fix is not verified.** I read that it was ruled;
  I did not read its design, and the retirement procedure in §4 is written
  against `views_emitted` as it stands today.
* **A document that arrives ALREADY refused can be edited further into the same
  refusal, and that is deliberate.** `sectionHarm`'s repair path allows any edit
  to a document that was already unsizeable, so on a two-band act whose first
  band is silenced, Aurora will let you silence the second. Both states are
  refused by the build; blocking the edit would refuse the *repair* as well, and
  the panel already prints `ROM section: cannot say` for such a document. Aurora
  never CREATES that state from a good one — that is the reachability row.
* **`bganim-band-harness.mjs` is still blind and this parcel did not repair
  it.** It opens sections by titles the vocabulary sweep moved:
  `BG animation bands` is now `Tile animations (n/m)` and `New band` is
  `New tile animation`, so `OPEN_BAND_LIST` returns `'no-section'` into a caller
  that does not check and `OPEN_NEW_BAND` throws at its own guard. Repairing it
  makes dozens of rows execute for the first time in weeks against strings that
  also moved — a parcel, not a side effect.
* **A pre-existing overflow, seen but not chased.** With the twin refusal live,
  the Effects tool-options bar renders the full refusal string across the top of
  the window, clipped and overlapping the facet row (visible in
  `docs/captures/2026-09-06-default-off-switch/1-switch-on-the-band-card.png`).
  The refusal string is byte-identical to the one master `60e265b9` already
  produced and `EffectsToolOptions.tsx` is untouched by this parcel, so it is
  pre-existing — **but I did not screenshot master to prove that**, so read it
  as "not caused here" rather than "measured there".
* **`__dbg.aeon.bands()` still reports no `patternPx` and no `default_off`.**
  Left alone; the harness reads both off the card instead, which is a stronger
  claim anyway.
* **No CDP measurement of the refused directions.** The harness drives aeon's
  live document, which is the accepting shape. Every refusal is measured in the
  node suite against constructed documents; none of them was watched greying a
  real control on screen.
