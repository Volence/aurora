# `scene.anchor` — the control and the writer

**Branch** `parcel/scene-anchor-writer` · **2026-09-05**

The editor half of aeon's item 9. `docs/reviews/2026-09-05-sec7-scene.md` §4(b)
found the gap by hitting it: a scene was authored entirely through the panel,
`rowRemap` was set, and the build refused with aeon's precondition 2 — *"add
`anchor: SceneAnchor.At(ch, dsa, dsb)`"* — for a key Aurora had a **live reader
and no writer at all**.

Headline, three parts:

1. **The control and the writer are built, and an anchor authored in the UI
   reaches a ROM.** Measured at the byte, with controls: `s4.bin` carries
   `pcfg_anchor_ch = $00` for the section this parcel bound, beside `$FF`
   (`PARALLAX_ANCHOR_NONE`) for the two aeon scenes that declare none. All four
   build shapes rc=0.
2. **The sentinel cannot be authored by dragging.** `dsa`/`dsb` are 0..15 where
   **15 means NO DEFORM**; the control is a closed `<select>` ladder that does
   not contain the sentinel as a rung, and the writer throws rather than clamps.
   Proven on the live DOM, both directions (§3).
3. **`rowRemap` is NOT yet buildable end to end, and the two blockers are both
   aeon/sigil-side.** Each was found by a build refusing, not by reading, and
   each is named with its exact message (§6). Aurora's half is done.

---

## 1. The live aeon tree was not touched

Required captures of `/home/volence/sonic_hacks/aeon` (path resolved through
`test/support/sibling-root.mjs`, never a literal in a committed file):

```
START 2026-09-05T08:46:30-04:00        END 2026-09-05T09:43:03-04:00
 M docs/lane-status.json                M docs/lane-status.json
                                        M games/sonic4/data/editor_sources.stamp.json
                                        M games/sonic4/data/generated/ojz/act1/DONOR_PROVENANCE.json
                                        M games/sonic4/data/generated/ojz/act1/effects_scenes.emp
                                       ?? games/sonic4/data/editor/effects/ojz_act1_sec7_worldwater.json
                                       ?? games/sonic4/data/editor/ojz/act1/section_7.meta.json
```

**They do not match, and the difference is not mine.** Reporting it rather than
smoothing it over: the added files are `ojz_act1_sec7_worldwater` and
`section_7.meta.json` — the **sec7 parcel's** scene id and section, landed in the
live tree by the concurrent lane while I worked (its `HEAD` also moved, to
`ce0ac25b`). This parcel's scene is `aurora_anchor_waterline` bound to
**section 2**, and neither appears there:

```
$ grep -rl "aurora_anchor_waterline" /home/volence/sonic_hacks/aeon/ ; echo rc=$?
rc=1                                        ← nothing

$ grep -rl "ojz_act1_sec7_worldwater" .../aeon/games/sonic4/data/editor/ ; echo rc=$?
.../section_7.meta.json
.../effects/ojz_act1_sec7_worldwater.json
rc=0                                        ← the CONTROL: the grep really searches this tree
```

The empty result is only worth anything beside that control, and rc is reported
rather than a pipe's.

> A **third** reading at 09:49:52 is back to ` M docs/lane-status.json` alone —
> the other lane committed those files at aeon `c1d0a6be` *"scene(sec7): land
> aurora's authored water scene"*, so the two `??` rows in the END capture became
> tracked rather than disappearing. That is the attribution confirmed from the
> other side: they were that parcel's, mid-flight. Every read of the live tree went through git objects at a
named revision (`show`, `rev-parse`, `status`); the clone was `--no-hardlinks`;
all authoring and building happened in a private clone under the session
scratchpad; and the harness carries a guard (`siblingDefaultPathOrUnresolved`)
that refuses to run against aeon's default location.

---

## 2. The four sentinel answers, in order

### (1) Every number is derived from the contract, never typed

Two new constants in `scene-ui.ts` §2.5's idiom, each read out of
`properties/anchor` and **neither shared with a neighbour**:

| constant | read from | why separate |
|---|---|---|
| `EFFECTS_ANCHOR_CHANNEL_BOUNDS` | `…/at/properties/channel` `minimum`/`maximum` | it is the only ORDINAL of the three. `dsa`/`dsb` have a top-of-range sentinel; this one's top is an ordinary channel |
| `EFFECTS_ANCHOR_NONE` | `properties/anchor`'s `const` arm, **checked against its `default`** at module load | `anchor: "none"` is a different state from an anchor whose shifts are both 15 |
| `EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa` / `.dsb` | already existed; used per field, never pooled | the two live in different schema nodes and agree by coincidence |

Nothing in the parcel writes `15`, `3` or `0..15`. The ladders are built from
`EFFECTS_ANCHOR_SHIFT_BOUNDS[field]`, the channel list from
`EFFECTS_ANCHOR_CHANNEL_BOUNDS`, the toggle's off word from
`EFFECTS_ANCHOR_NONE`. The one number that IS spelled in the source is the
divisor `2 ** shift`, which is the arithmetic aeon's `deform_asr` performs
(`engine/level/parallax_dsl.emp`: floor division by `2^n`), cited at the call
site.

The three test rows walk the raw JSON **by hand**, by a different route than the
module takes, and were proven red-first (§5).

### (2) OFF is a distinct, named choice

The ladder's off entry is the **only** option carrying the sentinel; its label is
`off — no deform` and **does not contain the number**, which lives in the title.
Measured on the live DOM ([4b], both fields):

```
off entry: {"value":"15","label":"off — no deform",
            "title":"anchor.at.dsa = 15 — the NO-DEFORM sentinel. Plane A (foreground)
                     takes no deform from this anchor at all. …"}
```

and it sits **first**, next to the quietest rung and at the opposite end from the
loudest ([4c]):

```
["off — no deform","÷16384","÷8192","÷4096","÷2048","÷1024","÷512","÷256",
 "÷128","÷64","÷32","÷16","÷8","÷4","÷2","÷1 — the whole table"]
```

That order is `BOB_AMPLITUDE_OPTIONS`' — least motion first, which is the shift
order reversed, because a list of magnitudes reads small-to-large and ordering by
the shift would leak the inversion back into the one place it is being hidden.
`BOB_ROW`'s objection to folding an off value into a ladder ("a list whose off
position sits next to its loudest setting") is answered by **position** here
rather than by a second control, because unlike the bob these two offs are
per-plane and a per-plane toggle would be four controls where two will do.

**And the whole-feature off is a different control.** `anchor: "none"` is the
row's toggle; `dsa`/`dsb` at 15 is a value on each ladder. `rowRemap`'s
precondition 2 needs the second and is not satisfied by the first — it wants a
channel to read, not an amplitude — so conflating them would have hidden the
state an author has to reach.

### (3) Nothing clamps — it REFUSES, and the two refusals differ

`setAnchorShiftCommand` and `setAnchorChannelCommand` **throw**. There is no
clamp anywhere on this path.

- On the **shifts**, a clamp toward the top lands on the sentinel: a caller
  asking for "as much deform as this field can carry" would be answered with
  *none*, silently, in a document that validates and builds. A clamp toward the
  bottom is no better — `min` is the loudest possible setting. Neither end is a
  defensible guess, so the function names the range and stops. It is unreachable
  from the form (the `<select>` cannot produce an out-of-range argument) and
  exists for the caller that goes round it — a port, a paste, a future gesture.
  This is `setBobShiftCommand`'s and `setReelRateCommand`'s precedent.
- On the **channel**, the reason is different and the message says so
  deliberately: `channel` has **no sentinel**, so a clamp does not author "off",
  it authors *somebody else's band*, with no visible difference from the value
  asked for. Its refusal never mentions a sentinel — a copied message would
  teach the reader a rule this field does not have (asserted in the tests).

**Writing the sentinel is legal and is not a special case.** It is what the
ladder's off entry does, and it must stay writable while the anchor is declared.
That is an asymmetry with `setBobShiftCommand`, which redirects its sentinel to
its toggle; the difference is that `bob_shift`'s sentinel IS that feature's off
switch and this one is one plane's.

### (4) Proof, both halves

**Node suite** — `src/renderer/providers/__tests__/effects-scene-anchor.test.ts`,
22 rows. The extreme row spells "driven to its extreme" as the two things a
person can do to a `<select>` (take the last option; take the loudest) and
asserts neither is the sentinel, plus the ladder's order, plus that the sentinel
is absent from the rungs entirely. The off row drives the ladder's **own off
entry** — not a literal 15 — **from a live shift**, so it is a real change and
not a no-op, and asserts the value **on disk after `serializeEffectsScene`**,
because "the object in memory has a 15 in it" is not the claim; the claim is that
aeon's generator will read one.

**Live DOM** — `npm run harness:scene-anchor-writer`, **32/32 rows, 0 failed, 0
unmeasured** (2026-09-05T09:32:10→09:32:35-04:00). §3.

---

## 3. The harness — what it measured and what it nearly got wrong

Run against the app built from **this worktree**, pinned:
`AURORA_BUILT_TREE` + `ELECTRON_BIN`, `RUN.borrowed=false`, and the harness
refuses on `borrowed` and on a missing `dist/main/index.mjs` before it spawns
anything. Gestures are real `Input.dispatchMouseEvent` press/release at integer
client pixels; `dpr` was **1** and is printed beside every positional claim, with
rects compared to their **scroller's** box. `<select>`s are driven through the
native value setter plus `input`/`change`, which is React's own path — an OS
dropdown is not drivable from CDP — and the ledger row [9a] asserts all **27
gestures** returned `ok`.

The two rows the parcel exists for, verbatim:

```
PASS [5a.dsb] driving the dsb ladder to its EXTREME authors the LOUDEST shift, not the sentinel
      last option = {"value":"0","label":"÷1 — the whole table", …}
      document now anchor.at.dsb = 0. 15 is the no-deform sentinel; a control that
      clamped toward its maximum would have written it here.

PASS [5b.dsb] choosing OFF on dsb writes the sentinel, and the anchor STAYS declared
      before=0 after=15. One plane's off is not the feature's off — the anchor is
      still there, still splitting.
```

### Two rig faults that would have faked a finding

**The Scene section arrives COLLAPSED.** `aeon.effects.scene` carries
`defaultCollapsed`, so `v_factor`, bob, reels, both deform rows **and the anchor
rows** are not in the DOM until an author opens it. The first run therefore
reported *"no select whose title starts `anchor —` is on screen"* — on a build
that has one — which reads exactly like "the control was never added". A
`no-element` on a collapsed section is **navigation missing, not a control
missing**, the same reading the sec7 packet's §7 records for the sub-tab bar.
`openSection` now opens it with a real pointer gesture on its title span and is
idempotent **by measurement**: it probes for a control that only exists inside
the section and clicks again if it is still absent.

**`element.click()` is not the only way to miss.** The `curve.to` row's "none"
option has the value `__none__`; the harness drove `none`. The **gesture ledger**
caught it (`no-such-option`, with the option list printed) — and the consequence
was worse than a dead gesture: the curve stayed on through the whole route-(b)
probe, so the document that probe reported was one aeon refuses **for a different
reason**. That is a misattribution the ledger exists to stop, and it stopped it.
The fixed run turns the clash into a deliberate measurement instead: [6b0] drives
curve + live anchor shifts and reads aeon's refusal off the screen, [6b1] shows
it clearing when the curve comes off.

### What is on screen

`docs/captures/2026-09-05-scene-anchor-writer/`. `05-waterline-authored.png`
shows the four rows (Anchor / Channel `0 — lines 3–220` / Plane A `off — no
deform` / Plane B `off — no deform`) and the binding hint;
`05a-curve-anchor-refusal.png` shows **both** new advisories painted at once —
the flat-path warning and the curve/anchor build refusal. Screenshots are taken
after scrolling the anchor row into view; scrolling is used **only for the
picture** and never to reach a control, since every drive finds its element by
title.

---

## 4. An anchor authored in the UI REACHES A ROM — measured at the byte

The saved document, written by the app (`aurora_anchor_waterline.json`, created
by the save — it did not exist before, asserted rather than assumed):

```json
{ "anchor": { "at": { "channel": 0, "dsa": 15, "dsb": 15 } },
  "id": "aurora_anchor_waterline",
  "layers": [ {"fa":"FACTOR_1_8","fb":"FACTOR_1_8","world_y":0},
              {"fa":"FACTOR_1","fb":"FACTOR_1_2","world_y":3},
              {"curve":{"to":"FACTOR_1_8"},"fa":"FACTOR_3_4","fb":"FACTOR_1_4","world_y":162} ],
  "schema": 1, "v_factor": 15 }
```

and through aeon's own constructors:

```
pub const Scene_Editor_aurora_anchor_waterline: Scene = scene(
    layers: [ … ], count: 3, v_factor: 15,
    anchor: SceneAnchor.At(0, 15, 15))
```

**The bytes in `s4.bin`**, read at `EditorSceneBinding_OJZ_Act1_Sec2` ($139A8
from `s4.lst`), with the struct offsets from `engine/structs.emp`
(`pcfg_anchor_ch` $0B, `pcfg_anchor_dsa` $1A, `pcfg_anchor_dsb` $1B) — **and with
controls, because `$0F/$0F` alone would not distinguish an authored
pure-boundary anchor from no anchor at all**:

| binding | ch | dsa | dsb | source |
|---|---|---|---|---|
| Sec0 — `ojz_act1_start` | `$00` | `$0F` | **`$02`** | aeon, hand-authored |
| **Sec2 — `aurora_anchor_waterline`** | **`$00`** | `$0F` | `$0F` | **THIS PARCEL, from the UI** |
| Sec4 — `ojz_act1_depth` | **`$FF`** | `$0F` | `$0F` | aeon, no anchor |
| Sec8 — `ojz_act1_floor` | **`$FF`** | `$0F` | `$0F` | aeon, no anchor |

`$FF` is `PARALLAX_ANCHOR_NONE`. The discriminating byte is the channel, and it
is `$00` for the scene this parcel authored and `$FF` for the two that declare
nothing — so the `$00` is an authored value and not a default. Sec0's `$02`
shows the shift byte varies with authored content.

---

## 5. Gates: red-first, with the mutation shown applied

Every mutation was applied from a **committed** baseline and restored from
`git show HEAD:<path>`, never `git checkout --` on a dirty tree.

**A. sharing a bound between `channel` and `dsa`** — the exact defect the
separate derivation exists to prevent:

```
$ git diff --stat
 src/core/formats/effects/scene-ui.ts | 3 +--
$ grep -n "EFFECTS_ANCHOR_CHANNEL_BOUNDS = " src/core/formats/effects/scene-ui.ts
412:export const EFFECTS_ANCHOR_CHANNEL_BOUNDS = EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa;
```

→ **2 rows red**: *"reads anchor.at's channel and both shift bounds as THREE
separate derivations"* and *"offers anchor.at ranges the codec really enforces at
both ends"*. Every other row stayed green, so the failure is attributable.

**B. hard-coding the "no anchor" spelling**:

```
$ git diff --stat
 src/core/formats/effects/scene-ui.ts | 26 +-------------------------
$ grep -n "EFFECTS_ANCHOR_NONE" src/core/formats/effects/scene-ui.ts
434:export const EFFECTS_ANCHOR_NONE: string = 'off';
```

→ **1 row red**: *"derives anchor's 'no anchor' spelling, and it is NOT the shift
sentinel"*. The other two anchor rows stayed green — the mutations are
independently attributable.

Restored, and 26/26 green again.

> ⚠ A mutation of the **schema** would NOT have made these rows red, and that is
> by design: both sides derive from that file, so a contract amendment moves them
> together and the row stays honest. What the rows guard is the **module drifting
> from the contract**, so the mutations are on the module. Said out loud because
> "I mutated something and it stayed green" is otherwise indistinguishable from a
> vacuous row.

Anti-vacuity is carried inside the rows too: every legal value in all three
ranges is asserted to serialize and one past each end to be refused **in the
bounds rule's own wording**, so a range nothing enforces cannot pass; the
sentinel-naming row also asserts the rungs are NOT labelled "off", so it is
distinguishing two things that really differ on screen.

---

## 6. BLOCKED — `rowRemap` is not yet buildable end to end, and neither blocker is Aurora's

The dispatch asks whether `rowRemap` becomes authorable end to end. **It does
not, and here is exactly what stops it.** Both were found by a build refusing.

### (a) Route (b) — the table route — is authorable and does not LINK

aeon's precondition 1 names three routes; (b) is the one it calls *"how the
shipped waterline gets its variation"*: an anchor with a live `dsb` **and** a
`deform_bg` table. Every part is now a control, and harness row [6b] drives it
and reads it back:

```
deform_bg={"shared":{"table":{"generator":"sine","amplitude":1,"period":256},"speed":0}}
anchor={"at":{"channel":0,"dsa":15,"dsb":2}}
```

aeon's **comptime** `scene()` accepted that document — the build compiled every
`ensure`, ran `emp_expect_fail` 52/52, `effects_gen: OK` — and then:

```
error: native build (sonic4 plain): [layout.undeclared-alignment] 1 section(s):
  - section `ojz_effects_editor_act1` (head label `EditorDeform_sine_1_256`) has NO
    declared alignment in `sigil_harness::section_align::DECLARED`.
```

**Why.** An editor-authored deform table is emitted as the **first label of the
generated act module** (the dedup block at its top:
`pub data EditorDeform_sine_1_256: [i8; 256]`), which *changes that section's
head label*. `sigil-harness`'s alignment table is keyed by head label and carries
one row for this section: `d("EditorSceneBinding_OJZ_Act1_Sec0", 2, WORD)`. The
new label encodes the generator and its parameters, so **no single extra row
would cover it** — a rule is needed, not a row. That is a sigil/aeon
declaration; there is no Aurora field involved, and I did not edit either tree.

### (b) Route (c) — the curve route — links, writes a ROM, and is refused by a POST-BUILD gate

With the table dropped and a `curve:` on the remapped strip instead, the build
compiles, links and **writes `s4.bin`** (`built: sonic4 plain native ROM —
crc=d9f1da82 len=819833`), and then:

```
row_remap_gate: FAIL
  - EditorSceneBinding_OJZ_Act1_Sec2 band 2: pcfg_deform_table_bg is NULL, so the
    per-line sample loop is flat-pathed and every line of this band gets the same
    plane-B scroll word. Remapping that is the identity. `scene()`'s comptime guard
    requires a table alongside a live shift; a NULL here means the lowering dropped it
```

**The gate is stricter than the guard it cites.** `scene()`'s precondition 1
accepts *(a) a live layer dsb + table, **or** (b) a live anchor dsb + table,
**or** (c) a `curve:` on that layer*; route (c) needs no table at all.
`tools/row_remap_gate.py` demands a non-NULL `pcfg_deform_table_bg`
unconditionally. Aurora's `rowRemapPreconditions` transcribes the comptime guard
faithfully — it is the reader that has been shipping since the remap row landed —
so an author following the panel to green still meets this gate.

**The loop is closed:** the gate wants a table, and a table cannot link. So
`rowRemap` from the editor alone is blocked on two aeon/sigil declarations, and
the honest statement of what this parcel delivered is: **precondition 2 is closed
(measured on screen, §7), precondition 1 is satisfiable, and the remap still
cannot ship.** That is the next row, and it is not Aurora's.

### (c) Not attempted, and why

- **Runtime confirmation is TAGGED, not attempted.** Nothing here ran under the
  emulator; whether the split lands where a player sees it needs a foreground
  session. `row_remap_gate`'s own note says the same about the camera path.
- **A live `dsb` with no table does nothing** and no build says so. That state is
  newly reachable because of this control, so the panel says it —
  `anchorDeformAdvisories`, painted warning-toned under the ladders
  (`05a-curve-anchor-refusal.png`). It fires on aeon's own shipped
  `ojz_act1_start`, whose anchor carries `dsb: 2` with no `deform_bg` anywhere in
  the scene; that is a true statement about that file, not a defect this parcel
  introduced.
- **The `deform_bg` seed is `sine(amplitude 1, period 256)`**, which at any live
  shift is about a pixel. Not this parcel's control and not changed here, but
  worth a row: an author reaching route (b) through the seed alone would get a
  table that technically satisfies the gate and visibly does nothing.

---

## 7. Was `rowRemap`'s own complaint cleared? Yes — measured on screen

Read off `document.body.innerText`, not off a helper, because the claim is about
what an author is told:

```
PASS [7a] the panel no longer says "this scene declares no anchor"
PASS [7b] and it no longer says the remap has nothing to vary
PASS [7c] the rowRemap row is on screen  ← anti-vacuous: [7a]/[7b] are the absence
                                            of a WARNING, not of the whole card
```

The node suite drives the same two transitions through the toggle and asserts
precondition 2 closing **while precondition 1 stays open** on a pure-boundary
anchor — because *"the anchor row went green"* is exactly the misreading that
would leave an author with a build that still refuses.

---

## 8. Builds — all four shapes

Authored into a private clone at aeon `origin/master`
**`1f2aab07cdf769c8b403eced4b020a9d11c5323c`**, never the live tree. The clone
sits in a miniature suite root (the clone as `aeon/` plus symlinks to `sigil`,
`empyrean`, `oracle`, `oracle-old`, `aurora`, `sonic_hack`, `skdisasm`,
`s2disasm`, `s1disasm`) — `tools/suite_paths.py` and the tool suite assert a
recognised layout and say so loudly otherwise, by design.

**A pristine baseline was green in all four shapes before any edit of mine**, so
every later result is attributable:

| # | shape | baseline rc | baseline md5 | with the anchor rc | md5 |
|---|---|---|---|---|---|
| 1 | `./build.sh` | **0** | `4b4e5d62daa49baa1a464facb829a6b1` | **0** | `11e04f17632fa3554e5e84245d93cd5b` |
| 2 | `DEBUG=1 ./build.sh` | **0** | `3743ccfa05167c848c3d208508dd0fa4` | **0** | `6df88671f7c77db4d311b878820902ed` |
| 3 | `./build.sh demo` | **0** | `2f1d8e40a04de545613155784c0a917b` | **0** | `2f1d8e40a04de545613155784c0a917b` |
| 4 | `DEBUG=1 ./build.sh demo` | **0** | `b579a96a58bf62885e3a147966da9f7e` | **0** | `b579a96a58bf62885e3a147966da9f7e` |

`tools/regenerate-level.sh` rc=0 before each. Wall clock
2026-09-05T09:32:41 → 09:42:19-04:00. `SIGIL_BUILD` / `SIGIL_EMIT` from aeon's
own `project.json` `buildEnv`; both binaries present.

**demo is byte-identical to its baseline in both shapes**, which is the control
this table needed: `demo` binds no OJZ editor scene, so a change there would have
meant the delta was not the scene. The two `s4` hashes moved.

### The staleness gate fired, and it is not a verdict on the bytes

The first attempt refused before compiling anything:

```
level staleness: STALE (stamp) — the editor sources are not the ones the last re-bake read
    added since the bake (2): …/aurora_anchor_waterline.json, …/section_2.meta.json
```

Attributed to the stage it came from: the app had written two editor documents
after the bake, and the build consumes `data/generated/` directly. The remedy is
the gate's own — re-run `tools/regenerate-level.sh` — and **not** `touch`, which
the message explains at length. Every build in the table above ran after a
re-bake.

---

## 9. Aurora suite

`npm test`, whole chain, **rc=0**:

```
Test Files  503 passed | 3 skipped (506)
Tests       7281 passed | 9 skipped (7290)     0 failed
tsc --noEmit: clean
check:harness-guards:      221 clean / 221 classified · 0 failures · 0 unmeasurable
check:peer-path-literals:  OK — 1308 files, 5 rules, all 5 fired on the canaries
check:test-collection:     506 test-shaped files on disk, all 506 collected
skip-report:               OK — every skip named its reason
```

**The delta, attributed rather than waved at.** The dispatch quotes master as
`7257 passed / 8 skipped` in a main checkout, i.e. **`7256 / 9` in a linked
worktree** — the step-3 row of `test/support/sibling-root.test.ts` skips by
design there (`--git-common-dir` answers an absolute path, so the relative shape
production consumes does not exist to be measured) and is self-diagnosing in the
skip report. This run stands in a linked worktree, so the comparison is against
`7256 / 9`, total 7265.

```
7281 passed − 7256 = +25       9 skipped − 9 = 0       7290 total − 7265 = +25
  +22   src/renderer/providers/__tests__/effects-scene-anchor.test.ts  (new file)
  + 3   the three new rows in scene-ui.test.ts (23 → 26)
  ────
   25   accounted for, with nothing left over
```

File count `503 + 3 = 506` against master's `502 + 3 = 505`: the one new file.

---

## 10. Still owed

1. **`sigil_harness::section_align::DECLARED` has no rule for an editor-authored
   deform-table section.** §6(a). Until then no Aurora scene may attach
   `deform_fg`/`deform_bg` for sonic4 — and Aurora offers those controls today,
   so this is a live "the editor lets me save a file the build rejects" for
   **two** rows that existed before this parcel.
2. **`tools/row_remap_gate.py` demands a table where `scene()`'s precondition 1
   accepts a curve.** §6(b). Either the gate widens to the guard it cites, or
   the guard narrows and Aurora's `rowRemapPreconditions` follows.
3. **`dsa`/`dsb` on a LAYER still have no control** — unchanged from the sec7
   packet's §4(a). This parcel added the ANCHOR's pair, which is a different
   object with different bounds; the layer's are still hand-edit-only.
4. **Runtime confirmation is TAGGED, not attempted.**
5. **The `deform_bg` table seed is `sine(1, 256)`** — about a pixel at any live
   shift. Worth a louder seed or a readout, once (1) unblocks the route.
