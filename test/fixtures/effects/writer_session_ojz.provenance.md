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
| git blob hash | `2c4104e465bff9d5f70399ab7e37a03ce6d49e4e` |
| sha256 | `4564a270046a7f613e68b868cdcf8abcb332f075833e164e6cb53ec5b6de20bd` |
| size | 956 bytes, exactly one trailing newline |

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
| run | 2026-08-23, 25/25 checks passed (re-origination; the first run was 2026-08-22, 22/22) |
| app build | `VITE_AURORA_DEBUG=1 npm run build` (electron-vite 5 / vite 8) |
| built from | aurora `427cbd1` (`feat(effects): the v_factor control is an integer spinner …`), branch `fix/v-factor-retype`, working tree clean under `src/`. The first run built from `76ff28f` on `feat/writer-originated-scene-fixture` |
| driven by | CDP against Electron under `xvfb-run -a -s '-screen 0 1680x1050x24'`, `AURORA_DEBUG_PORT=9394` |
| project opened | a **writable copy** of the aeon tree (`project.json` + `games/` + `art/`) in the session scratchpad. aeon's own tree was never opened and never written to; it has no `games/sonic4/data/editor/effects/` directory before or after this run |
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
| R3 | click **Add layer** until the control refuses — the layer count is the app's own ceiling (8), not a number chosen here. Seven clicks landed |
| R4 | layer *i*: `world_y` = `i * 32` |
| R5 | layer *i*: `fa` = the option at index *i* of that select's own option list |
| R6 | layer *i*: `fb` = the option at index `len - 1 - i` of the same list. For *i* = 0 that is the **last** option, the custom-packed sentinel — so the packed triple `{op: 0, s1: 0, s2: 15}` in the file is what the app seeds, never something typed here |
| R7 | scene `v_factor` = **8**, the layer count, typed into the real spinner. Until item 35 this read "the option at index 8 of the `v_factor` select → `FACTOR_3_4`"; that select is gone, because `v_factor` is a 0..15 shift count and never was a `$defs/factor`. The layer count is the same rule R8 uses and for the same reason — it is the app's own ceiling, not a number chosen here. Deliberately **not** the field's own `max`: `max` is also the new-scene default, so a fixture carrying it would prove the control moved nothing. The affordance itself is checked instead (harness rows 6d/6e: the control is an `input[type=number]` with min 0, and no control at `v_factor` offers a `FACTOR_*` option) |
| R8 | `v_center` = 8, `v_offset` = -8 (the layer count, and its negation) |
| R9 | `precision` and `transition` = the **last** option each select offers → `cell`, `instant` |
| R10 | the section-assignment select is set to the scene's id (section 0's `sceneRef`) |
| R11 | `Ctrl+S`, dispatched as a real key event |

Two choices in that list are a writer's, not an enumeration's, and are called out
so nobody mistakes them for derived values: the scene **id** and the **Name**
string. Both are opaque prose in the format — an id is an identity, a name is a
label — so neither can corroborate or contradict a schema reading. Everything that
the codec actually encodes came from an index.

## What the session could NOT author

The wave-1 Effects panel exposes `name`, `v_factor` (a bounded integer spinner),
`v_center`, `v_offset`, `precision`, `transition`, and per layer
`world_y` / `fa` / `fb`, plus
add/remove layer and the section `sceneRef`. **It has no control for** `anchor`,
`budget_class`, `deform_bg`, `deform_fg`, `deform`, `curve`, `vsplit`, `dsa`, `dsb`,
`phase`, `enabled`, `left_column_mask`, `v_deform` or `v_factor_fg`.

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
