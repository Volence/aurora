# A layer's `dsa` / `dsb` - the two ladders and what OFF writes

**Branch** `parcel/layer-dsa-dsb` - **2026-09-05**

`docs/reviews/2026-09-05-scene-anchor-writer.md` §10 row 3 booked this: that
parcel gave the **anchor's** `dsa`/`dsb` a control and recorded that the
**layer's** pair still had none, hand-edit-only. Closed here.

Headline, three parts:

1. **Two closed ladders per strip, and the sentinel cannot be authored by
   dragging.** Proven on the live DOM in both directions (§3), 26/26 rows.
2. **OFF writes neither "always 15" nor "always nothing".** It clears the key
   unless the file spells it, which is the rule five other layer keys already
   use - and the contract, not taste, is what decides that the layer's pair may
   do this where the anchor's may not (§2).
3. **The parcel found a vacuity in its own first test, and a green harness run
   that was measuring the wrong scene.** Both are written up rather than
   quietly fixed (§4, §5), because each was the kind of pass that looks exactly
   like success.

---

## 1. Which constants, and why they are new

The dispatch asked whether `EFFECTS_ANCHOR_SHIFT_BOUNDS` is the right constant
to reuse. **It is not, and neither is `EFFECTS_LAYER_DEFORM_BOUNDS`.** Two new
ones, both in `scene-ui.ts`:

| constant | read from | why not shared |
|---|---|---|
| `EFFECTS_LAYER_SHIFT_BOUNDS.dsa` / `.dsb` | `$defs/layer/properties/dsa`, `…/dsb` | a THIRD shift space. The anchor's live in `properties/anchor`'s `at`; `layerDeform`'s `own.shift_a/shift_b` live in `$defs/layerDeform`. Three nodes, 0..15 in all three, agreeing by coincidence |
| `EFFECTS_LAYER_SHIFT_NONE` | `maximum`, **cross-checked against `default`** at module load | the control rests on two separate sentences and both must hold (below) |

**This is not hypothetical drift.** `layerCurveDeformAdvisory` was already
reading a LAYER's sentinel out of `EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.max`,
the def next door, because the numbers matched. Harmless while nothing could
author these keys; not harmless once the card can. Fixed in this parcel.

### The analogous distinction the dispatch asked about

The anchor parcel kept `channel` separate from its shifts because a channel is
an ordinal with no sentinel. **The same distinction applies here and its
neighbour is `phase`**: 0..255, `default: 0`, an ordinal into the sample table
where 0 is a legal phase meaning "no offset", not an off switch. Clamping a
shift toward its top authors silence; clamping a phase toward its top authors a
different phase. Two hazards, so two derivations - `phase` is not pooled with
the pair, and it keeps its place on the read-only extras line because it still
has no control.

### One derivation the anchor's pair could not have

The layer's fields declare the sentinel **twice**: `maximum: 15` and
`default: 15`. Both are load-bearing and they mean different things:

- `maximum` makes it the **top of the range**, which is why a clamping control
  lands on it by accident;
- `default` makes it the **absent value**, which is what licenses OFF to clear
  the key rather than write it.

`EFFECTS_LAYER_SHIFT_NONE` derives from the first and throws if the second
disagrees. `anchor.at` declares channel/dsa/dsb all `required` with **no**
default, so its sentinel is derivable only from `maximum` - which is exactly
the asymmetry that decides §2.

Nothing in the parcel types `15`, `0..15`, or `3`. The ladders are built from
`EFFECTS_LAYER_SHIFT_BOUNDS[field]`; the divisor `2 ** shift` is the arithmetic
aeon's `deform_asr` performs (floor division by `2^n`), cited at the call site.

---

## 2. THE DECISION: explicit 15 versus omission

**The control writes neither, unconditionally. OFF clears the key UNLESS the
file already spells the default, in which case the spelling is left alone.**

### Why this is not a coin flip

It is `setLayerFieldCommand`'s existing rule, which `curve`, `vsplit`,
`deform`, `drift` and `rowRemap` have all used since parcel H.
`setLayerShiftCommand` **routes through that function** rather than restating
it, so a sixth key cannot grow a sixth answer to the same question. That is
the codebase's own guard against this hazard, one axis over; shipping what was
already ruled beats introducing a rule.

### Why the contract, not taste, settles which pair may do it

```
anchor.at   required: [channel, dsa, dsb]   no default   -> sentinel MUST be spelled
$defs/layer dsa/dsb optional                default: 15  -> absent and 15 are one document
```

aeon's side agrees: `layer(world_y: int, fa: int, fb: int, dsa: int = 15,
dsb: int = 15, …)` (`engine/level/scene_dsl.emp` at aeon `b08e2c1b`, line 881,
under the banner *"dsa/dsb: per-plane deform-amplitude shifts (15 = no deform
on that plane)"*), and the generator emits a key only when the document carries
one. So the anchor's writer **had** to write 15. This one does not have to, and
therefore gets to choose.

### Why the conditional beats either fixed answer

**Both conventions are live in aeon's tree right now**, measured rather than
assumed:

| file | author | layers | `dsa`/`dsb` |
|---|---|---|---|
| `ojz_act1_start.json` | aeon | 5 | every layer spells `15, 15` |
| `ojz_act1_depth.json` | aeon | 5 | every layer spells `15, 15` |
| `ojz_act1_floor.json` | aeon | 3 | every layer spells `15, 15` |
| `ojz_act1_sec7_worldwater.json` | **Aurora** (the sec7 parcel) | 3 | every layer **omits** them |

13 layers spell it, 3 omit it, all four build, and the two spellings mean the
same thing. A control that **always wrote 15** would add two lines to every
layer of every Aurora-authored scene the first time anyone opened one. A
control that **always deleted** would strip a line from every layer of every
aeon-authored scene. Each is a diff nobody asked for in a file an author
reviews by eye, and each quietly imposes one team's house style on the other's
files.

The conditional rule has no house style of its own. **It preserves the
document's.** That is the property §3's [7a]/[7b] and [8d]/[8e] measure on
those exact four files.

### The one lossy edge, said out loud

A file that **spells** the sentinel, is driven to a live shift, and is then
taken back to off ends with the key **absent**, not respelled. The invariant
kept is *"a field nobody touched keeps its spelling"*, not *"every byte
survives every round trip"*. It has its own test row saying so
(`effects-layer-shift.test.ts`, "spelled -> live -> off lands ABSENT, which is
the ruled behaviour and not a bug") so a later reader meets the rule instead of
discovering it as a surprise diff.

---

## 3. The sentinel proof, both directions, on the live DOM

`npm run harness:layer-dsa-dsb` - **26/26 rows, 0 failed, 0 unmeasured**. Run
against the app built from **this worktree**: `AURORA_BUILT_TREE` +
`ELECTRON_BIN`, `RUN.borrowed=false` printed and refused on, build reported
FRESH. `dpr` was **1** and is printed beside every positional claim, with rects
compared to their **scroller's** box.

The two rows the parcel exists for, verbatim:

```
PASS [5a.dsb] driving the dsb ladder to its EXTREME authors the LOUDEST shift, not the sentinel
      last option = {"value":"0","label":"÷1 (the whole table)", …}
      document now layer 0 dsb = 0. 15 is the no-deform sentinel; a control that
      clamped toward its maximum would have written it here.

PASS [5b.dsb] choosing OFF on dsb turns the plane off, and the STRIP is still there
      before=0 after=undefined (effective 15). One plane's off is not the strip's
      off - the layer is still in the scene and still scrolling.
```

The ladder as the DOM holds it, read off the page rather than off the source:

```
["off (no deform)","÷16384","÷8192","÷4096","÷2048","÷1024","÷512","÷256",
 "÷128","÷64","÷32","÷16","÷8","÷4","÷2","÷1 (the whole table)"]
rungs = [14,13,12,11,10,9,8,7,6,5,4,3,2,1,0]     <- 15 is NOT among them
```

Least motion first, off at the top adjacent to the quietest rung and at the
opposite end from the loudest, so no drag crosses from one to the other. The
off label carries **no number**; the number is in the title.

### The write decision, measured on the four real files

```
PASS [7a] ojz_act1_sec7_worldwater: the ladder shows OFF and the OMISSION SURVIVES
PASS [7b] ojz_act1_start:           the ladder shows OFF and the SPELLED 15 SURVIVES

PASS [8d] ojz_act1_start: REWRITTEN by a real edit, and every untouched plane keeps its SPELLED 15
      rewritten=true - layer 0 dsb now 2 (edited) - layer 0 dsa 15 - 4 untouched layers kept
      on disk: [{"dsa":15,"dsb":2},{"dsa":15,"dsb":15},{"dsa":15,"dsb":15},
                {"dsa":15,"dsb":15},{"dsa":15,"dsb":15}]

PASS [8e] ojz_act1_sec7_worldwater: REWRITTEN by a real edit, and every untouched plane keeps its OMISSION
      rewritten=true - layer 0 dsb now 2 (edited) - layer 0 dsa undefined - 2 untouched layers kept
      on disk: [{"dsb":2},{},{}]
```

### What is on screen

`docs/captures/2026-09-05-layer-dsa-dsb/`.
`02-both-planes-loudest.png` is the sentinel proof: both planes at
`÷1 (the whole table)` after taking the last option on each ladder.
`03-live-shift-advisory.png` shows the warning-toned sentence for a live shift
with no table. Screenshots are taken after scrolling the row into view;
scrolling is used **only for the picture** and never to reach a control, since
every drive finds its element by title.

---

## 4. A vacuity this parcel found in its own test

The obvious row - *assert `EFFECTS_LAYER_SHIFT_BOUNDS.dsa` equals
`$defs.layer.properties.dsa`'s minimum and maximum* - **passes when the
constant has been pooled with either neighbour**, because all three shift
spaces read 0..15. The anchor parcel's equivalent row was sound only because
`channel` is 0..3 and its shifts are 0..15; the numbers differed, so pooling
showed up as a failure. Here they do not.

That is a check covering most of the field and silently wrong in the one corner
it exists for. **Demonstrated rather than argued** - with
`EFFECTS_LAYER_SHIFT_BOUNDS` pooled with `EFFECTS_LAYER_DEFORM_BOUNDS`:

```
$ grep -n -A 4 "^export const EFFECTS_LAYER_SHIFT_BOUNDS"
416:export const EFFECTS_LAYER_SHIFT_BOUNDS = Object.freeze({
417-  dsa: EFFECTS_LAYER_DEFORM_BOUNDS.shift_a,
418-  dsb: EFFECTS_LAYER_DEFORM_BOUNDS.shift_b,
419-});

scene-ui.test.ts                29/29 GREEN   <- including the new value-comparison row
layer-shift-derivation.test.ts   4/7  RED
```

`__tests__/layer-shift-derivation.test.ts` is what actually holds the
separation: it deep-clones the committed schema, moves **one node**, re-imports
the module against it (`vi.resetModules` + `vi.doMock`), and asserts which
constants followed and which did not. A pooled constant fails the "did not
follow" half.

> The perturbation is of the **schema**, which the anchor packet's §5 explicitly
> warns against for its own gates - and correctly, since both sides of those
> rows derive from the schema and an amendment moves them together. That
> reasoning does not apply here because these rows do not compare the module
> against the contract. They compare the module **against itself** under a
> change the current contract cannot express: three constants that agree today,
> do they agree by construction or by coincidence? No reading of the committed
> schema can answer that.

The file also caught its own author: the first draft moved `dsa` alone and
`EFFECTS_LAYER_SHIFT_NONE`'s per-field cross-check refused the schema outright.
Recorded in the row, because a guard firing on the person writing it is the
only evidence it is not decorative.

### The other gates, red first from a committed baseline

Every mutation was applied from a committed baseline and restored with
`git show HEAD:<path>`.

| # | mutation | result |
|---|---|---|
| A | `EFFECTS_LAYER_SHIFT_BOUNDS` pooled with `EFFECTS_LAYER_DEFORM_BOUNDS` | **4 rows red** in the derivation file, 29/29 green in scene-ui.test.ts (§4's point) |
| B | OFF always writes the explicit 15 (`setLayerFieldCommand(…, shift)`) | **2 rows red**: "a document that OMITS the key does not GAIN it", "spelled -> live -> off lands ABSENT". The preservation row stayed green |
| C | OFF always deletes, even a spelled default | **1 row red**: "a document that SPELLS the sentinel does not LOSE it". The omission rows stayed green |

B and C are the two halves of the §2 decision, each failing only its own half -
independently attributable, and together they are why the rule has to be
conditional rather than either fixed answer.

> ⚠ I hit the `git checkout --` trap the anchor packet warns about while setting
> gate A up, and lost the uncommitted constants. Recorded because the packet
> names it and I did it anyway: gates come after the commit, not before.

---

## 5. Three rig faults, each of which faked a result first

**All three produced a GREEN or clean-looking run before they were caught.**

### (a) `[8a]`/`[8b]` read as stronger than they were

The first run was 24/24. Checking mtimes afterwards showed only
`aurora_layer_amplitude.json` had been written: the two round-trip files were
never **rewritten**, so "the spelling survived" was really "the file was never
touched". True about a no-op gesture, and not the claim the write rule needs.
`[8d]`/`[8e]` force a real rewrite and then ask what happened to the untouched
planes.

### (b) The scene picker is a list of BUTTONS, and I drove a `<select>`

My first `PICK_SCENE` found *"the first `<select>` carrying an option whose
value is this scene id"* - which is the **section's `sceneRef` dropdown**, not
the picker. Every gesture returned `ok`, the ledger was clean, and the panel
never changed scene. So `[7a]`/`[7b]` read the ladder of the **already-selected
scene** and passed, because by that point every plane on it was off and "shows
off" was true of the wrong card. It was also silently rebinding a section as a
side effect.

Caught only because `[8d]`/`[8e]` compared against the **file** and found it
unwritten, and then because the value meant for the shipped scenes turned up in
`aurora_layer_amplitude.json` instead. The fix is three things, not one: a real
pointer gesture on the button, an assertion that the panel **really moved**
(`SELECTED_SCENE`, read off the accent colour), and a **discriminating control**
- my own scene's Plane A is parked on a live rung, so any row still reading its
card cannot report `off`.

### (c) `Layer 1 dsb` was `no-element`

The card list renders only the **selected** strip, so `Layer 1`'s controls are
legitimately not in the DOM - navigation missing, not a control missing, the
same reading the anchor packet records for a collapsed section. The edit moved
to layer 0, which makes the claim stronger: layers 1..n are strips the author
never selected, let alone touched.

---

## 6. Suite

`npm test`, whole chain. **Measured in this worktree, both sides, not quoted.**

```
                    baseline (clean tree, this worktree)   after
Test Files          510 (506 passed, 3 skipped, 1 failed)  512 (508 passed, 3 skipped, 1 failed)
Tests               7337 (7327 passed, 9 skipped, 1 FAIL)  7369 (7359 passed, 9 skipped, 1 FAIL)
```

**+32 passed, +32 total, skips unchanged, failures unchanged.** Accounted for
with nothing left over:

```
  +22  src/renderer/providers/__tests__/effects-layer-shift.test.ts   (new file)
  + 7  src/core/formats/effects/__tests__/layer-shift-derivation.test.ts (new file)
  + 3  the three new rows in scene-ui.test.ts (26 -> 29)
  ────
   32
```

All pre-suite gates OK, including `check:peer-path-literals`
(1321 files, 5 rules, all 5 fired on the canaries) and `check:test-collection`
(512 on disk, all 512 collected). `tsc --noEmit` clean.

### The one failing row is NOT this parcel's, and it was red before I began

```
FAIL test/formats/effects-channel-bands-drift.test.ts
  > CURRENCY: is the vendored channel-bands sidecar still what aeon publishes?
  AssertionError: NOT AN AURORA REGRESSION - the vendored aeon channel-bands
  sidecar is stale.
    pinned at aeon b8913cda  /  aeon origin/master is now b08e2c1b
```

It is a currency row that tracks aeon's HEAD, and aeon moved. The band values
are **identical**; only the `source:` line numbers shifted
(`ojz_effects.emp:1809` -> `:1846`). **I measured it red on the clean tree
before writing a line**, and the arithmetic against the dispatch's figure closes
exactly:

```
dispatch, main checkout:   7329 passed,  8 skipped, 0 failed   = 7337
this worktree, baseline:   7327 passed,  9 skipped, 1 failed   = 7337
  -1 pass / +1 skip   the sibling-root step-3 row, which skips by design in a linked worktree
  -1 pass / +1 fail   the channel-bands currency row, red since aeon moved to b08e2c1b
```

Not fixed here: re-vendoring a blob-pinned contract sidecar plus its provenance
is a different parcel's call, and doing it inside a control parcel would mask
the very drift the row exists to report.

---

## 7. The live aeon tree was not touched

All authoring went to a private copy under the session scratchpad. Reads of the
live tree were `git show` at a named revision (`origin/master`
**`b08e2c1b85d54fd78d986bbe822a2aecc6e1bd01`**) or plain file reads.

```
$ find <aeon>/games/sonic4/data/editor -newermt "2026-09-05 12:40" -type f
                                                  <- nothing, and rc=0

$ find <aeon>/games/sonic4/data/editor -name "*.json" -type f | wc -l
37                                                <- the CONTROL: the query really
                                                     searches this tree
```

The empty result is only worth anything beside that control. The harness also
carries `siblingDefaultPathOrUnresolved('aeon')` and refuses to run against
aeon's default location, because it SAVES. Section bindings in the copy were
compared against the live tree after the final run and are identical, so the
`sceneRef` drive from rig fault (b) left nothing behind.

> ⚠ The session scratchpad is shared across today's lanes, and it already held
> an `aeon-clone/` from another parcel at 10:05. I did not measure against it -
> a leftover tree is exactly the "two artifacts, one decoder" hazard, since my
> round-trip rows read the spelling of files another lane may have edited. This
> parcel used its own copy, refreshed from the live tree before every run.

---

## 8. Still owed

1. **Runtime confirmation is TAGGED, not attempted.** Nothing here ran under the
   emulator; whether a live layer shift moves the plane a player sees needs a
   foreground session. Per the dispatch, no emulator tool was touched.
2. **The anchor's ladder labels still join their two halves with a U+2014**,
   where this parcel's now read `off (no deform)` and
   `÷1 (the whole table)`. Two ladders one screen apart in slightly different
   styles. Unifying them means editing the anchor parcel's strings, which is
   not this parcel's call - flagged for whoever owns the ruling's rollout.
   `anchorShiftOptions` in `effects-aeon.ts` is where they live.
3. **`phase` still has no control** and stays on the read-only extras line. It
   is the last member of the two-sources trio without one, and it is an ordinal
   rather than a sentinel field, so it wants a different control shape.
4. **The channel-bands currency row is red** (§6) until someone re-vendors.
