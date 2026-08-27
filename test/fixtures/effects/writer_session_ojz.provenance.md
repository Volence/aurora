# `writer_session_ojz.json` — provenance

**This file was not written by hand. It came off disk after a real authoring
session in the running app, and it has never been edited — when the contract
moved under it, the session was re-run rather than the file patched (see
Identity).** That is the only
property that makes it worth having: `canopy_dusk.json` beside it is writer-
*certified* (hand-written for shape coverage, then proven byte-identical through
`serializeEffectsScene(parseEffectsScene(GOLDEN))`), and a hand-written fixture
shares the schema-read frame with the schema it was typed against. This one was
enumerated over the UI's own affordances — its option lists, and the bounds its
spinners advertise — which is a parameter nobody chose while writing the schema.

If you need to change what this fixture covers, **re-run the session** — do not
edit the JSON. Editing it converts it into a second `canopy_dusk`, silently.

## Identity

| | |
|---|---|
| fixture | `test/fixtures/effects/writer_session_ojz.json` |
| git blob hash | `5ca0552bfc38a8bc2d359ad638b4dd0f089369da` |
| sha256 | `bf395ce60117a37196fc04ba89bd593371a1b463d811dd52077ebabb305b2647` |
| size | 1,626 bytes, exactly one trailing newline |

**RE-ORIGINATED 2026-08-27 (ROADMAP row 60) — CEILING-DRIVEN, and the one-line
corroboration was NOT available.** The previous record was blob
`893cd05586c4524fa919adc6bbbb111e710d1a7e`, sha256
`c28b6db065d2cf88a108d4f91baae3673fad66e67bf980c642f4a6e84ccb0dfd`, 933 bytes.

Gesture R3's rule is *"click Add layer until the control refuses — the count is
the app's own ceiling"*. That ceiling was **8** at origination and row 56 raised
it to **16**; row 59 pinned `LAYERS=8` rather than fix it and printed the debt on
every run. This run pays it: the pin is unset, the harness clicked until the
button disabled itself at 16, and the file is ceiling-driven again.

**AND THAT DESTROYS THE CORROBORATION EVERY PREVIOUS RE-ORIGINATION USED.** The
two entries below both rest on the same sentence — *exactly one line differs
between the two runs* — which is the only evidence separating "the session was
re-run faithfully" from "the session was driven differently". A ceiling-driven
re-run moves 43 lines. So the corroboration was **replaced, not waived**, by two
things done in this order:

1. **THE DELTA WAS PREDICTED IN ADVANCE.** Before the harness ran, R4/R5/R6 were
   evaluated by hand into a complete expected file
   (`scratchpad/predict-commitA.py` → `scratchpad/PREDICTED-commitA.json`,
   committed beside the fixture). The emitted bytes then matched that prediction
   **exactly, with no diff at all** — 16 layer blocks and every scalar. A
   differently-driven session cannot land on a file written down before it ran.
2. **THE FIRST EIGHT LAYERS ARE THE CONTINUITY ANCHOR.** They came back
   byte-identical to the 8-layer file — the only character that moved in that
   region is the `}` → `},` that a ninth layer forces.

Determinism was measured too (three runs, identical bytes) and is recorded under
"The session" — but it is listed separately and deliberately: **identical bytes
across runs prove the session is DETERMINISTIC, not that it was driven
correctly.** A harness driving the wrong gesture drives it identically every
time. The prediction is what carries the faithfulness claim.

### R7's rule collided with the new ceiling, and had to be amended

`v_factor` is a 0..15 shift count. R7 said "= N, the layer count", with an
explicit rider that it is deliberately **not** the field's `max`, because `max`
is also the new-scene default (`newEffectsScene` seeds `EFFECTS_V_FACTOR_LOCK`)
and a fixture carrying it would prove the control moved nothing. At N=16 the
plain rule OVERFLOWS the control and the app's clamp folds it onto **15 — the max,
the lock sentinel, and the default**: the one value the rule forbids. Measured,
not reasoned: the un-amended rule was run as a red-first plant and the document
came back `v_factor: 15`.

R7 now reads **`min + (N % (max - min + 1))`** — N wrapped into the control's own
advertised range by the same `%` R5 already applies when an index runs past the
end of a list. At N=16 on a 0..15 control that is **0**. Harness row **6h** pins
the result away from the control's `max`, so the collision cannot come back
silently.

### A FIFTH rot, found the same way as row 59's four

R4's selector, `/^Layer i world_y/`, **matched nothing and had been driving
nothing**. The layer card's top spinner is titled with the app's OWN label for
the scene's vertical space (`layerTopBounds().label`) — `world_y` unlocked,
**`Screen line`** locked — and a new scene starts locked, so at R4 time the title
reads `Layer 0 Screen line (0..511) — a plane line; the scene is locked`.

It stayed invisible for the worst possible reason: `addLayerCommand` pushes
`last.world_y + 32`, so the app's own default for a stack of added layers **is**
`i * 32`, exactly what R4 prescribes. Row 5b ("every layer took its enumerated
world_y") is therefore **NON-DISCRIMINATING and always was**, and the planted
re-rot emitted **byte-identical output** — which is both why nobody saw it and
why fixing it changed no bytes. The catcher is the new blanket row **8a**, which
watches the GESTURE rather than the value: every `SET_INPUT` now goes through a
ledger and 8a asserts not one of them returned `'no-element'`. Under the plant it
reported 16 misses and went red while 5b stayed green.

**RE-ORIGINATED 2026-08-27 (ROADMAP row 59), not edited.** The contract RETIRED
`precision` (empyrean `0bd4753`): aeon deleted the storage on 2026-08-26 —
`engine/level/scene_dsl.emp:422-423` records `PRECISION_CELL`/`PRECISION_LINE`
and the `Scene.sc_precision` field as having "LIVED HERE until", and `:1009`
records the struct pad shrinking `u16 -> u8` to fill the byte — so the schema key
went, and with it the panel's `Precision` dropdown. The schema is CLOSED
(`unevaluatedProperties: false`), so the value this fixture carried stopped being
legal, exactly as `FACTOR_3_4` did in item 35. Deleting the line would have
converted the file into a second `canopy_dusk` precisely as the warning at the
top says, so the **session was re-run** and the bytes taken off disk again. The
previous record was blob `2c4104e465bff9d5f70399ab7e37a03ce6d49e4e`, sha256
`4564a270046a7f613e68b868cdcf8abcb332f075833e164e6cb53ec5b6de20bd`, 956 bytes.
**Exactly one line differs between the two runs** (`"precision": "cell"`,
removed) — every layer, every factor spelling and every scene scalar came back
byte-identical, which is the corroboration that the re-run was faithful rather
than differently driven. Three independent runs of the harness produced the same
933 bytes (sha256 `c28b6db065d2cf88a1…`), so the result is not a single
measurement in an environment that varies.

**AND THE RE-RUN FOUND FOUR THINGS THAT HAD ROTTED SINCE 2026-08-23**, none of
them row 59's doing and all of them invisible until someone actually re-ran the
session. They are recorded here because the next re-originator will hit them
otherwise:

1. **`doc[0]` was the wrong scene.** When this fixture was first originated the
   aeon project had *no* `games/sonic4/data/editor/effects/` directory, so the
   scene the session created was the only one and index 0 was safe. The project
   has since gained `ojz_act1_start` and `ojz_act1_depth`, so index 0 became
   somebody else's scene: the harness read *their* layer count as `N` and typed
   it into `v_factor`/`v_center`/`v_offset`. The harness now addresses the
   authored scene **by id** (`sceneOf`), which is what every one of those rows
   meant all along.
2. **Three selectors were end-anchored against titles that had grown a suffix.**
   `/^Layer i fa$/`, `/^Layer i fb$/` and `/^v_offset$/` matched nothing once
   those controls gained explanatory tooltips (`fa — how far Plane A, the
   foreground level plane, scrolls…`). `SET_INPUT` returned `'no-element'` and
   the gestures silently drove nothing — every layer kept the app's default
   `FACTOR_1`, and `v_offset` never reached the document at all. Now `\b`.
3. **Rows 5c and 6b are what caught it**, and that is worth naming: `FACTOR_1` is
   both a legal enumerated answer *and* the app's default, so a row asserting
   "fa is one of the schema's factors" would have stayed green through a run that
   drove nothing. Row 5c pins layer 0's `fb` to the **packed sentinel** — the one
   cell the enumeration lands on a value no default produces — and row 6b reads
   the **document** rather than trusting a gesture landed. Neither is decoration.
4. **The layer count was already stale**, see the next entry.

**⚠ THE PIN DESCRIBED BELOW WAS PAID OFF BY ROW 60 (2026-08-27) — see the entry
at the top of this section. The paragraph is kept as written because it is the
record of why the debt existed, and because its reasoning is the reason row 60
had to replace the one-line corroboration rather than simply do without it.**

**THE LAYER COUNT IS PINNED FOR THIS RUN, AND THAT IS A DEBT, NOT A FIX.** Gesture
R3 says the layer count is the app's own ceiling. That ceiling was **8** when this
fixture was originated and ROADMAP row 56 raised it to **16** (empyrean `277bc15`,
`layers` maxItems 8 -> 16) on 2026-08-27 without anyone re-running this fixture —
so the file was *already* stale against its own gesture rule before row 59 touched
it. A literal ceiling-driven re-run would therefore have moved about nine lines at
once: eight new layer blocks plus the three `N`-derived scalars. That would have
**confounded the one-line corroboration above**, which is the only evidence that
distinguishes a faithful re-run from a differently-driven one — the same reason
row 59 deliberately did not widen the gestures to the new row-58 deform controls.
So `LAYERS=8` was pinned for this run, the harness prints the pin beside the app's
real ceiling on every run (rows 4a and 4c: *"app ceiling 16, this run authored 8 —
STALE by 8"*), and **the ceiling re-origination is booked as its own ROADMAP row**.
It is visible rather than hidden, which is the most this parcel can honestly do
with it.

**ONE BYTE APPENDED 2026-08-26 — the ruled terminator, not a content edit.** The hub
ruled the canonical scene-file form (empyrean `e1ebd20`, `AURORA_EFFECTS_SCHEMA.md`
§8): exactly one `\n` after the closing brace. The writer gained that byte, and so
did this file — by `printf '\n' >>`, nothing else — because the fixture's fixed-point
test (`is a byte-exact fixed point of the writer`) pins it to what the CURRENT writer
emits. No key, value, ordering or indentation changed; every byte of the session's
output is still here in front of the terminator, and appending a byte the ruling
prescribes for every scene file involves no authoring choice, so the origination
claim above stands. The record before the byte: blob
`2ee83f89eaa15a549b2445e61f4858d18765c227`, sha256
`7dfaceaed0dc0c7a3bb0f1c2d424e40af7828691a85a4d7945459707bd76c75f`, 955 bytes.

**RE-ORIGINATED 2026-08-23 (ROADMAP item 35), not edited.** The contract retyped
`v_factor` from a `$defs/factor` to a plain 0..15 shift count (empyrean
`a32bcb03`), so the value this fixture carried — `"FACTOR_3_4"` — stopped being
schema-legal. Hand-fixing it would have converted the file into a second
`canopy_dusk` exactly as the warning above says, so the **session was re-run**
against the rebuilt app and the bytes taken off disk again. The previous record
was blob `07547231a860555ac79a681898b38713bbe7ef78`, sha256
`ed535fe3a15eeecbc65b2baadef7853168c068054b82d4b8921ad6ae92e9cf37`, 966 bytes.
**Exactly one line differs between the two runs** (`"v_factor": "FACTOR_3_4"` →
`"v_factor": 8`) — every layer, every factor spelling and every scene scalar came
back byte-identical, which is the corroboration that the re-run was faithful
rather than a differently-driven session.

The blob hash is load-bearing: `effects-scene-writer-originated.test.ts` recomputes
it from the file on disk and compares it against the value in this table, so the
fixture cannot drift away from this record without a test going red. See "What the
tests do NOT prove" for the limit of that.

## The session

| | |
|---|---|
| harness | `scratchpad/writer-originated-scene-harness.mjs` |
| run | 2026-08-27 (ROADMAP row 60), **32/32** checks passed, ceiling-driven. Earlier: row 59's pinned run 29/29; 2026-08-23 re-origination 25/25; first run 2026-08-22, 22/22. The count moved 29 -> 32 with three ADDED rows, all of them about gestures landing rather than values being legal: **8a** the blanket ledger — every `SET_INPUT` returned `'ok'` and the session issued exactly the prescribed number of gestures; **6h** the document's `v_factor` is not the control's `max` (= lock sentinel = new-scene default); **5d** every layer card really has a top spinner, and the title the app gave it is printed |
| app build | `VITE_AURORA_DEBUG=1 npm run build` (electron-vite 5 / vite 8) |
| built from | aurora `71f8925`, branch `feat/writer-session-ceiling`. Earlier runs: `0d533e5` on `feat/retire-precision`; `427cbd1` on `fix/v-factor-retype`; the first from `76ff28f` on `feat/writer-originated-scene-fixture` |
| driven by | CDP against Electron under `xvfb-run -a -s '-screen 0 1680x1050x24'`, one port per run. Environment printed beside every run, because it varies here: row 60's runs at load average 0.9–2.5, uptime 1 day 22:19–22:22 |
| project opened | a **writable copy** of the aeon tree (`project.json` + `games/` + `art/`) in the session scratchpad. aeon's own tree was never opened and never written to — verified by the overseer's independent re-run, `md5sum` over aeon's live `editor/effects/*.json` **unchanged across it**. ⚠ **The clause that used to follow — *"it has no `games/sonic4/data/editor/effects/` directory before or after this run"* — is DELETED as false, 2026-08-27.** aeon has carried that directory since at least 2026-08-25 (`ojz_act1_start.json`, `ojz_act1_depth.json`), and that is not incidental: **it is rot 1's own cause**, recorded 100 lines above in this same file. The safety claim and the emptiness claim had been welded into one sentence, so a reader checking the half that matters would have read the half that had quietly gone false beside it — and the two are independent (a copy is safe whether or not the original is empty). Measure the mtimes; do not infer safety from absence |
| saved by | a real `Ctrl+S` key event to the real window → `saveActive()` → `saveAeonProject()` → `buildAeonSavePlan()`. Toast read back: `success:Project saved` |
| taken from | `<copy>/games/sonic4/data/editor/effects/writer_session_ojz.json`, byte-for-byte |

## The exact gesture sequence

Every value below is either the app's own default (never touched), the option at a
computed **index** into a `<select>`'s own option list, or a number derived from the
layer index by the one rule stated. No JSON key was typed anywhere.

| # | gesture |
|---|---|
| R0 | open the project copy (setup, via `window.__dbg.aeon.open`), then click the **Effects** facet pill |
| R1 | type `writer_session_ojz` into the real `new_scene_id` field; click **New** |
| R2 | type `Oracle Jungle Zone — writer session` into the **Name** field |
| R3 | click **Add layer** until the control refuses — it disables itself at the ceiling — so the count is the app's own and not a number chosen here. Row 60's run: **15 clicks, landing 16 layers, `refused=true`, the panel's own header reading `Layers (16/16)`**. The pin row 59 used (`LAYERS=8`) is unset, and a pinned run still prints the pin beside the measured ceiling so it can never be mistaken for a ceiling-driven one |
| R4 | layer *i*: `world_y` = `i * 32`, typed into the card's top spinner **under whatever label the app gives the scene's vertical space** — `world_y` on an unlocked scene, `Screen line` on a locked one. Naming only one of the two is what rotted this gesture; see "A FIFTH rot" above |
| R5 | layer *i*: `fa` = the option at index *i* of that select's own option list |
| R6 | layer *i*: `fb` = the option at index `len - 1 - i` of the same list. For *i* = 0 that is the **last** option, the custom-packed sentinel — so the packed triple `{op: 0, s1: 0, s2: 15}` in the file is what the app seeds, never something typed here |
| R7 | scene `v_factor` = the layer count **wrapped into the control's own advertised range**, `min + (N % (max − min + 1))`, typed into the real spinner. At N=16 on a 0..15 control that is **0**. Until item 35 this read "the option at index 8 of the `v_factor` select → `FACTOR_3_4`"; that select is gone, because `v_factor` is a 0..15 shift count and never was a `$defs/factor`. N is the same number R8 uses and for the same reason — the app's own ceiling, not a number chosen here — and the value is deliberately **not** the field's own `max`, because `max` is also the new-scene default and a fixture carrying it would prove the control moved nothing. **The `%` is row 60's, and it is forced**: the ceiling outgrew this control's range, so the plain rule overflowed and the clamp folded it onto exactly the value the rider forbids (measured — see "R7's rule collided" above). The wrap is the same one R5 applies to an over-long index. The affordance itself is checked separately (harness rows 6d/6e: the control is an `input[type=number]` with min 0, and no control at `v_factor` offers a `FACTOR_*` option), and row 6h pins the result away from `max` |
| R8 | `v_center` = 16, `v_offset` = -16 (the layer count, and its negation) |
| R9 | `transition` = the **last** option that select offers → `instant`. Until row 59 this read "`precision` and `transition` … → `cell`, `instant`"; the `Precision` control is gone, because aeon deleted the field's storage and empyrean `0bd4753` cut the key from the schema. Its **absence** is now measured instead of its value being set — harness rows 6f (no such control in the running app, with its row-mates checked present so an unmounted panel cannot pass it), 6g (no such key in the document) and 7f (no such key in the emitted file) |
| R10 | the section-assignment select is set to the scene's id (section 0's `sceneRef`) |
| R11 | `Ctrl+S`, dispatched as a real key event |

Two choices in that list are a writer's, not an enumeration's, and are called out
so nobody mistakes them for derived values: the scene **id** and the **Name**
string. Both are opaque prose in the format — an id is an identity, a name is a
label — so neither can corroborate or contradict a schema reading. Everything that
the codec actually encodes came from an index.

## What the session could NOT author

**This list was STALE and is corrected here (2026-08-27).** It still described the
panel as of parcel H; ROADMAP row 58 (deform authoring, merged 2026-08-27) shipped
controls for `deform_fg`, `deform_bg`, a layer's `deform`, `v_deform` and
`left_column_mask`, and `curve`/`vsplit` became authorable earlier still. As of
today:

The Effects panel exposes `name`, `v_factor` (a bounded integer spinner),
`v_center`, `v_offset`, `transition`, `deform_fg`, `deform_bg`, `v_deform` and
`left_column_mask`, and per layer `world_y` / `fa` / `fb` / `curve` / `vsplit` /
`deform`, plus add/remove layer and the section `sceneRef`. **It has no control
for** `anchor`, `budget_class`, `dsa`, `dsb`, `phase`, `enabled` or `v_factor_fg`.
`precision` is not on either list any more: it is RETIRED from the format, not
merely un-authored.

**THE GESTURE SEQUENCE WAS DELIBERATELY NOT WIDENED to exercise the row-58
controls**, and this fixture therefore still carries none of them. Driving new
controls in the same run that removed `precision` would have put many lines in
the delta, and a delta of one line is the only thing separating "the re-run was
faithful" from "the session was driven differently" — the same reasoning that
pinned the layer count above. Widening the sequence to cover the deform controls
is booked as its own ROADMAP row.

So this fixture is *sparser* than `canopy_dusk.json` and always will be until the
UI grows. That is data about the authoring surface, not a defect in the fixture,
and it is exactly why both files exist: `canopy_dusk` covers the schema's shape,
this one covers what an author can actually produce today.

## A defect the run found, and did not fix

`CollapsibleSection` wraps its whole `PanelHeader` — including the `right` action
slot — in `<div onClick={toggle}>`, and `IconButton` does not stop propagation. So
clicking **Add layer** in the Layers header *also toggles the Layers section*. The
first run of the harness found "Layers (8/8)" on screen with not one layer card
under it: the model had eight layers and the section had been shut by the seventh
(odd) click. The same shape applies to the Scene section's **Delete** button.

The harness re-opens the section with a real click on its header and carries on.
The bug is real, is out of this parcel's scope, and is reported rather than
patched here.

## What the tests do NOT prove

`test/formats/effects-scene-writer-originated.test.ts` asserts four things: the
fixture validates against the committed schema; it is a byte-exact fixed point of
the writer; its blob hash matches the table above; and it uses only keys the wave-1
UI can author.

That last row's `precision` assertion was **flipped, not deleted**, by row 59: it
read `expect(sceneKeys.has('precision')).toBe(true)` and now asserts `false`.
Deleting it would have left the row merely *ceasing to be wrong*; flipping it
keeps the row discriminating — re-add a `Precision` field to the panel and the
key-set derivation finds its `setSceneFieldCommand` literal again and the row goes
red. That is the only automatic guard against the dead control growing back.

**And note which of those the retype actually caught.** When the schema moved, the
first two went red and the hash guard stayed green — because the file had not been
touched. That is the division of labour working: the schema rows watch the
contract, the hash row watches the file. Neither can do the other's job.

**None of those proves the file was writer-originated.** A round-trip assertion
proves the *writer is self-consistent* on this document — a different claim.
Someone could hand-write a canonically-ordered, UI-key-only document, drop it in
here, update the hash in this table, and every test would stay green. The
key-set assertion is a **necessary** condition for "came out of the wave-1 UI",
not a sufficient one.

What the hash guard *does* catch is the realistic failure: the fixture being
edited — to tidy it, to add coverage, to make a test pass — without this record
changing with it. The unforgeable evidence of origination is the harness run
above, not an assertion in the suite.
