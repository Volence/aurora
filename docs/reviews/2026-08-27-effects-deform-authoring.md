# Deform authoring in the Effects facet — the panel's own "wave 2"

*2026-08-27 · branch `feat/effects-deform-authoring` · Aurora*

The layer card carried the gap as a comment on itself:

```
{/* WHAT THE FILE SETS THAT THE CARD STILL CANNOT: deform, disabled, ... */}
... title="Set in the scene file; read-only here (deform is wave 2)"
```

The contract has carried deform since wave 1. The codec round-trips it. `layerExtras`
could already **print** it. No author could **set** it. This parcel closes that, and
in doing so found one thing that matters more than the controls — see
[§5 left_column_mask](#5-the-three-fields-i-was-told-to-measure-not-build).

---

## 1. What shipped

| SHA | What |
|---|---|
| `e1f8cf1` | `scene-ui.ts` — the deform surface's constraints, derived from the committed schema |
| `40a0de0` | the four attachments: provider, panel, and the tests |
| `3ec5a2f` | `scratchpad/effects-deform-harness.mjs` — 29 CDP rows on the real app |
| `4015c2f` | this report, first pass |
| `bd6c632` | **the follow-up: `left_column_mask`** — see [§7](#7-the-follow-up-left_column_mask) |

> **§7 is the follow-up the coordinator funded onto this branch after reading
> §5.** It is not a separate parcel: shipping the `v_deform` row without it
> means shipping a control that can author a build-refused scene, knowingly.
> Everything above §7 describes the parcel as it stood at `3ec5a2f`; §7 says
> what changed and where the numbers moved.

**Files changed** (all paths from the aurora repo root):

- `src/core/formats/effects/scene-ui.ts` (+195)
- `src/renderer/providers/effects-aeon.ts` (+~490)
- `src/renderer/components/effects/EffectsScenePanel.tsx` (+267)
- `src/renderer/providers/__tests__/effects-aeon.test.ts` (+445)
- `src/renderer/components/effects/__tests__/label-column-align.test.ts` (+17)
- `src/renderer/components/effects/__tests__/effects-wording.test.ts` (+22)
- `test/formats/effects-scene-writer-originated.test.ts` (+46/-9)
- `scratchpad/effects-deform-harness.mjs` (new, 668 lines)

### The four attachments

| Row | Contract | Engine |
|---|---|---|
| `Deform fg` / `Deform bg` | `$defs/sceneDeform` — `"none"` \| `{shared:{table, speed}}` | `SceneDeform.Shared`, one table each plane samples |
| `V deform` | `"none"` \| `{columns:{table, speed, amp_shift}}` | `SceneVDeform.Columns`, per-**column** vertical scroll (VDP reg `$0B` bit 2) |
| layer `Deform` | `$defs/layerDeform` — `"none"` \| `{own:{table, shift_a, shift_b, phase, speed}}` | `SceneDeform.Own`, overrides the plane-shared table for one strip |

Each points at one `$defs/tableRef`, which has **six** spellings and not the two
"a generator or a file" suggests: `sine`, `triangle`, `zero`,
`v_column_perspective`, `v_column_floor`, and a raw `.bin`. One `TableRefField`
serves all four attachments; its form list, its parameter rows and their ranges
are read out of the schema's own `oneOf`, so a seventh branch arrives in the
dropdown by re-vendoring the schema and nothing else.

### The structural half

`setSceneFieldCommand` now carries an **object** value — every wave-1 caller
passed a scalar or a string enum. **It needed no new write path**, and that is
the codec's design paying off one level up: `editSceneCommand` takes a *mutator
over a whole clone* and diffs the whole document, so the value's shape was never
part of the write path. A `{field, value}` delta API — the shape this could
easily have been — would have needed a per-field kind, which is a field
enumeration, which is the one thing this format is handled without. Everything
still goes through `executeCommand` and the undo stack; no parallel path exists.

Both command paths gained one arm they did not have: a key whose schema default
is the string `"none"` and whose file spells it that way explicitly is **left as
spelled** on clear. The layer path already had this for `curve`/`vsplit`; the
scene path had no none-defaulted key until now, and without it a scene that hand
authored `"deform_fg": "none"` would silently lose the line the first time an
author toggled the row off. **Which keys the rule covers is derived** (schema
`default === "none"`) rather than the hand-written pair it was — that list was
one revision short of being wrong in three places.

### Advisories, and the pure function nothing called

`advisoryLayerDeformConflicts` (`src/core/formats/effects/scene.ts:450`) had
been a pure function in the codec since wave 1 with **no caller anywhere**. The
layer card is its reader now.

aeon's `scene()` carries five comptime `ensure`s an author can trip from these
controls alone. Four are cross-field, so no single control can carry them and
the shape validator cannot see them either. All four are transcribed as
sentences in `sceneDeformAdvisories` (`effects-aeon.ts`) and rendered under the
scene form; the fifth is the two-sources guard above. The posture is the one
`scene.ts` argues for at length: **Aurora advises, sigil is the rulebook.** Test
`every advisory is ADVICE — the writer still emits each of these documents`
pins that: a scene Aurora warns about still saves.

`deform` also **leaves** the read-only extras line, on parcel H's precedent
(a value the card edits two rows up is not said twice). `tableRefLabel` is
exported instead and carries the whole attachment as a call — `sine(1, 256)` —
on the table picker's title, which is the one place a `<select>` plus two
spinners cannot say it.

---

## 2. Verification

| | before | after |
|---|---|---|
| `npx tsc --noEmit` | clean | clean |
| `npx vitest run` | **5026 passed, 7 skipped (5033)** · 387 files | **5056 passed, 7 skipped (5063)** · 387 files |

No test was deleted. Three existing assertions were **flipped by the parcel and
say so**: `layerKeys.has('deform')` `false → true`, and the two `layerExtras`
rows that expected a `deform:` descriptor on the read-only line.

### The CDP harness

`scratchpad/effects-deform-harness.mjs` — 29 rows, Electron under
`xvfb-run -s '-screen 0 1680x1050x24'`, `AURORA_DEBUG_PORT`, driving the real
Effects panel and reading the model back through `window.__dbg.aeon.scenesJson()`
and the DOM back through `querySelectorAll`.

**Four clean runs, `29/29` every time. `devicePixelRatio = 1` on all four**; the
`deform_fg` select's rect was `{left: 1177, top: 459.5, width: 88, height: 26}`
each run and the one dispatched mouse click aimed at the integer centre
`(1360, 676)` each run. Bar E's failure mode (a fractional canvas rect
delivering the neighbouring device row) **does not apply here and the harness
says so at row 0c**: every gesture is on a DOM element found by `title`, and no
expectation is derived from a device pixel. dpr is printed anyway, so a run that
ever grows a pixel expectation has the number beside it.

Reading the schema off disk (`SCHEMA`, `FORM_IDS`, `paramsOf`, `LAYER_DEFAULTS`,
`SEED_PERIOD`) rather than pinning numbers is Bar F: a harness that agreed with a
hand-written picker because both were written from the same memory of the schema
would prove nothing.

---

## 3. Red-first — every plant, and its quoted failure

### Node suite (two rounds of disjoint plants, `src/renderer/providers/effects-aeon.ts`)

| Plant | Row that went red | Quoted failure |
|---|---|---|
| `tableRefFormOptions` truncated to the first 2 forms | `the dropdown offers exactly the schema branches, in schema order` | `expected [ 'sine', 'triangle' ] to deeply equal [ 'sine', 'triangle', 'zero', …(3) ]` |
| `clampTableRefParam` invents `max = 255` for an unbounded parameter | `clampTableRefParam is the bound, and an unbounded parameter has none invented for it` | `expected 255 to be 1000000` |
| `binPathRefusal` uses `/\.bin$/` instead of the schema pattern | `a .bin path is refused by the SCHEMA pattern, not a second rule` | `.toMatch() expects to receive a string, but got object` (the refusal returned `null` for `../escape.bin`) |
| `layerDeformFromToggle` seeds `shift_a: 0` | `a layer's own attachment seeds at the DEFAULTS of the fields it lowers into` | `expected +0 to be 15` |
| `setSceneFieldCommand` loses the explicit-`"none"` arm | `an attachment SPELLED "none" on disk is left as spelled` | `deform_fg: expected { type: 'set-effects-scene', …(5) } to be null` |
| `seedTableRefParam` seeds `period` at min | `a new table is the schema FIRST form at its seeds` | `expected 1 to be 256` |
| `sceneDeformAdvisories` checks only `deform_fg` for a scene table | `a layer's own table with no scene table on either plane` | `deform_bg: expected [ Array(1) ] to deeply equal []` |
| `tableRefFromForm` drops the parameter carry | `switching sine <-> triangle keeps the numbers the author just tuned` | `expected { generator: 'triangle', …(2) } to deeply equal { … }` |
| `layerExtras` puts `deform` back on the read-only line | `names dsa/dsb/phase and disabled in schema key order` | `expected [ 'dsa', 'dsb', 'phase', …(2) ] to deeply equal [ 'dsa', 'dsb', 'phase', 'enabled' ]` |
| the panel stops looping `SCENE_DEFORM_ROWS` (the bg row never wired) | `uses only keys the wave-1 Effects panel can actually author` | `the panel drives SCENE_DEFORM_ROWS into setSceneFieldCommand as a loop variable: expected '// The wave-1 effects scene editor: p…' to match /Object\.keys\(SCENE_DEFORM_ROWS\)…/` |

**Runners.** The first nine run in `npx vitest run` via
`src/renderer/providers/__tests__/effects-aeon.test.ts`; the tenth via
`test/formats/effects-scene-writer-originated.test.ts`. Both are in the default
project glob — no opt-in flag, no separate script.

### CDP harness (five defects, one build each)

| Poison | Rows that went red |
|---|---|
| form list truncated to 2 | **4c**, plus 4e/4f as collateral (`bin` and `v_column_perspective` became unselectable) |
| `TableRefField` draws a fixed `sine` parameter pair | **4e alone**, on its own isolated build — `28/29` |
| the `left_column_mask` advisory arm disabled | **6e, 6f** |
| layer seed at `shift 0/0` | **6a, 6b** |
| clearing writes `"none"` instead of deleting the key | **5a** |

---

## 4. Which rows discriminate, and which do not

**Bar C — the alternative green-path I ruled out, by name.** Row 4e went red
under *two* poisons, so on the combined build it could not tell "the picker
offers less than the contract" from "the sub-form ignores the form". I ran the
second poison **alone, on its own build**: `28/29`, only 4e red. That rules out
the truncated form list as the cause and leaves 4e discriminating for the
sub-form defect specifically.

**Rows that do NOT discriminate, stated explicitly:**

- **4b** (`the table sub-form RENDERS one spinner per schema parameter`) **passed
  under the fixed-`sine` poison** — because the seeded form *is* `sine`, so a
  hard-coded pair is indistinguishable from a derived one at that moment. 4e is
  the row that catches it. 4b's value is narrower: it catches a sub-form that
  renders nothing.
- **4g, 6c, 6d, 7a** are absence rows (`!/warning/`). Each now carries
  `panelIsDrawn(text)`, which is Bar D's answer: without it, "the warning
  cleared" and "the panel never rendered" emit the same artifact. With it they
  catch a blank panel — but none of them can fail for the defect its neighbour
  catches, and 4g in particular passed under every poison above.
- **1a, 2a, 2b, 3a, 3b, 3c, 0a, 0c** are setup and anti-vacuous rows. 0a is the
  provenance row: the deform controls exist nowhere on master, so finding one is
  what says the bundle under test contains the parcel.
- **5b, 8a, 8b, 8c, 9a** are the pointer sanity check, the idle-clock re-check
  (MapViewport's 37/37 property, `0 repaints over 3.0s against 962 rAF ticks`)
  and teardown. None of them is about deform.

**Not reachable from this panel at all — row 7a is honest about it.** The
two-sources advisory fires when a layer has `deform.own` alongside a non-default
`dsa`/`dsb`/`phase`, and **the card has no control for those three**, so no
gesture on this panel can create the state. Row 7a checks only that the call
site exists and renders nothing on a scene that does not trip it. The *condition*
is covered red-first in the node suite and nowhere on a running app.

---

## 5. The three fields I was told to measure, not build

The rule I applied before every control: **read the field's schema description
and confirm the runtime actually consumes it.** `v_factor_fg` fails that rule by
its own description ("RESERVED in the v1 runtime… authored for identity only")
and got no control, as instructed. Here is what the same test says about the
other three.

### `left_column_mask` — AUTHOR-FACING, and this parcel makes it URGENT

| | |
|---|---|
| Schema | `enum ["undeclared","sprite_mask","factor0_lock","accept"]`, default `"undeclared"` |
| Generator | `aeon/tools/effects_gen.py:690` renders it to `SceneLeftColMask.*` |
| Engine | `aeon/engine/level/scene_dsl.emp:1061` takes it as a `scene()` argument; it lands in `sc_left_col_mask` and is read by the budget model at `:2189-2195` |
| Aurora | `EFFECTS_LEFT_COLUMN_MASK_VALUES` already derives its enum (`scene-ui.ts:166`) — **and nothing uses it** |

It is not merely author-facing. It is **conditionally mandatory**, and the
condition is exactly the control this parcel just shipped
(`scene_dsl.emp` P3 Task 12):

1. `v_deform` on + policy undeclared → **the build refuses the scene.** *"With
   per-column V-scroll on, non-zero Plane-B HScroll makes the leftmost partial
   column render at a V-scroll the program never wrote — silicon, no register
   fix."*
2. policy declared + no `v_deform` → **also refused** ("the policy adjudicates
   an artifact that cannot occur").
3. `factor0_lock` is a *verified claim* about every layer's `fb` **and** about
   live Plane-B deform; the engine refuses it when either half is false.
4. `sprite_mask` is **refused outright today** — the engine's left-column strip
   emission has not landed (aeon `docs/DEFERRED_WORK.md`).

**So: shipping `v_deform` authoring without a `left_column_mask` control lets an
author build a scene the build refuses, with no way to fix it in the app.** I
did not build the control — it is out of this parcel's scope by the brief — but I
would not ship the `v_deform` row without saying so, so the advisory says it in
as many words and names the file:

> *V deform is on and this scene declares no left_column_mask policy, which the
> build requires… Set left_column_mask in the scene file by hand — this panel has
> no control for it yet.*

Harness rows **6e/6f** prove that is on screen. **This is the immediate follow-up
parcel.** Two things whoever takes it must not miss: the control has to be
**gated on `v_deform` being on** (guard 2 refuses a policy without a subject),
and it must **not offer `sprite_mask`** while guard 4 stands.

### `anchor` — AUTHOR-FACING, no control, a fair future parcel

| | |
|---|---|
| Schema | `"none"` \| `{at:{channel 0..3, dsa 0..15, dsb 0..15}}`, default `"none"` |
| Generator | `effects_gen.py:694` renders it via `render_anchor` |
| Engine | `scene_dsl.emp:1060` `anchor: SceneAnchor`; guards at `:1074`, `:1077`, `:1251` |

Genuinely consumed and genuinely author-facing. It carries cross-field
constraints of its own (an anchored scene splits a layer at runtime, so it needs
`count + 1` shadow entries; and an anchor with live deform shifts cannot coexist
with a curve layer), which is why it is a parcel and not a row.

> ⚠ **Contract drift to relay.** `empyrean/docs/AURORA_EFFECTS_SCHEMA.md:105`
> says an anchored scene needs `layers.length + 1 <= 8`. The engine's own guard
> is `count + 1 <= 16` (`scene_dsl.emp:1074`) — the ceiling empyrean `277bc15`
> raised. **The doc line is stale.** Nothing in Aurora is wrong (the schema JSON
> carries no cross-field constraint either way), but a future anchor parcel
> written from that doc would ship a bound half the real one. **Tagged for the
> hub.**

### `budget_class` — NOT consumed by anything today. Do not build a control.

| | |
|---|---|
| Schema | plain `string`, no default, no enum |
| Doc | *"passthrough to the game's declared class table; the generator does not validate it (sigil is the validator)"* |
| Generator | listed in `SCENE_KEYS` (accepted) at `effects_gen.py:69` — **and never emitted** |

Measured rather than assumed: `grep 'scene\.get('` over `effects_gen.py` returns
five sites — `SCENE_SCALARS` (`v_factor, v_center, v_offset, v_factor_fg`),
`transition`, `left_column_mask`, `anchor`, and the table-attachment loop. There
is no `budget_class` site. The engine's `scene_budget_enforce`
(`scene_dsl.emp:2207`) derives cost from a scene's own **contents**, not from
this string.

**Verdict: accepted and dropped.** It is the `v_factor_fg` category — a control
would offer a value nothing reads — and it is worse in one way: Aurora cannot
offer a *legal* value set either, because "the game's declared class table" is
not visible to it, so the control would be a free-text box with no rule. The
open question (reserved for sigil, or dead?) belongs to the hub.

### One more finding, not on my list: `precision` has a control and is RETIRED

The panel offers a `Precision` select today. aeon's consumer contract §2.1:

> **`precision` — ACCEPTED AND IGNORED (engine-side RETIRED 2026-08-26, owner
> ruling `d-29-corrected`).** The per-cell HScroll path the field chose between
> was deleted; the fill is per-line for every scene and `scene()` no longer takes
> the argument.

That is **exactly the defect ROADMAP item 35 exists for** — a control offering a
value no engine consumes — already shipped, in this panel, and not introduced
here. Removing it needs a schema amendment and is booked on the aeon side as
"Aurora's + empyrean's" (`aeon/docs/DEFERRED_WORK.md`, *Per-cell HScroll fill —
DELETED*). **Out of scope for this parcel; flagged for the hub.** I mention it
because I was told to apply the runtime-consumption rule *before adding any
control*, and applying it honestly means noticing where it was already broken.

---

## 6. What is open

1. ~~**`left_column_mask` needs a control.**~~ **BUILT — see §7.**
2. **`anchor` has no control.** A fair parcel; read the engine's guards, not the
   stale doc line.
3. **`precision` should lose its control** once empyrean amends the schema.
   *(Routed to the hub by the coordinator; not touched here.)*
4. **The two-sources advisory is not reachable from the UI** (§4). Still true
   after §7: the card still has no `dsa`/`dsb`/`phase` control, so the follow-up
   did not make it reachable. It becomes reachable the day those land, and the
   harness gets a real row for it then.
5. **Nothing here was seen on hardware.** What a deform *looks* like is an
   emulator question, and this session is barred from the emulator. **Tagged for
   the controller's foreground follow-up:** author a `deform_fg` sine on a real
   scene, build, and confirm the plane wobbles.
6. **`budget_class`:** the hub should rule whether it is reserved or dead.
7. **Aurora's `factor0_lock` test is stricter than the engine's**, by one case,
   on purpose — §7's *"Two forks"*. Closing the gap means a packer in Aurora,
   which is a second copy of the engine's 9-bit encoding; nobody should do that
   for this. Listed so it is a decision on record rather than a surprise.

---

## 7. The follow-up: `left_column_mask`

*Commit `bd6c632`, same branch. Funded by the coordinator after §5, and it does
not belong in a later parcel: without it the `v_deform` row above is a shipped
control that can author a scene aeon's build refuses, with no in-app remedy.*

Everything below was derived by reading `aeon/engine/level/scene_dsl.emp`
lines 1280–1360 and `layer()` at 510–600 directly.

### The gate is mutual — that is the part §5 understated

| Guard | Condition | Result |
|---|---|---|
| `:1288` | `v_deform` on **+** policy `undeclared` | **refused** |
| `:1293` | `v_deform` off **+** policy declared | **refused** |

Aeon pins the first as a build-failure poison in its own suite
(`tools/emp_expect_fail.py` → `poison_scene_lcm_undeclared.emp`, expected
count 1), so it is load-bearing rather than advisory.

So the control cannot merely *appear* when `v_deform` is set. Turning `v_deform`
**off** takes the policy with it, in **one command** — `vDeformToggleCommand`,
which mutates two keys inside a single `editSceneCommand`. A toggle that cleared
one key would leave the document build-refused for the author having done
nothing but turn a feature off, and — worse — pressing undo would restore
`v_deform` while the policy stayed cleared, reaching the same refused state a
second way. Turning it **on** seeds no policy: which one is an engine-visible
claim about the scene, and Aurora does not sign that for the author.

**The row is visible when `v_deform` is on — *or* whenever the document declares
a policy without one.** That second arm is the whole lesson of §5 applied one
field over: the policy-without-a-subject state is refused by guard 2 and is one
hand-edited file away, and hiding the row there would leave an author reading an
advisory with no control to act on.

### The four values, and their preconditions

| Value | Precondition, from the guard that enforces it | In the picker |
|---|---|---|
| `accept` | none — always legal. The engine's own message calls it *"a real answer, it is what this game's Rocking and Perspective families do"* | selectable, and titled as an answer rather than a fallback |
| `factor0_lock` | **both halves.** `:1310` every real layer's `fb` is `FACTOR_0`; the scan covers **dormant** layers too, because a disabled band inherits the previous band's scroll words — so `enabled` is deliberately not consulted. `:1347` no live plane-B amplitude **AND** a table that can reach the plane: `dsb ≠ 15` on any layer or on the anchor, **and** either `deform_bg` or any layer's `own()` table (an own table serves both planes) | **selectable even when the precondition fails**, with the reason on the row |
| `sprite_mask` | `:1354` **refused outright** — the left-column strip emission has not landed | **rendered, `disabled`,** with the engine's reason |
| `undeclared` | required when there is no `v_deform` | selectable |

**One subtlety worth spelling out, because a check that missed it would look
right:** an `own()` layer's `shift_b` **is** that layer's `dsb` — `layer()`
folds it (`eff_dsb = is_own ? own_sb : dsb`, `scene_dsl.emp:558`) and stores
*that* in `ly_dsb`, which is the field the left-column guard scans. A check
reading `layer.dsb` alone would miss every `own()` layer, which is most of what
this parcel just made authorable. A node row and harness row 6j both discriminate
it.

### Two forks, going different ways on purpose

`sprite_mask` is disabled. `factor0_lock` is **not**, even on a failed
precondition. The principle is `scene.ts`'s: *"the editor let me save a file the
build rejects"* is bad; *"the editor refused a file the build accepts"* is **far
worse**.

- No scene content can make `sprite_mask` legal, so disabling it cannot produce
  the worse failure.
- `factor0_lock`'s precondition is about the scene's own contents, and **Aurora's
  test of it is deliberately stricter than the engine's**: the engine compares
  the packed byte `$0FF`, Aurora holds a factor as a `FACTOR_*` name or a
  `{s1,s2,op}` triple and **has no packer**. A packed triple therefore answers
  "cannot prove it is `FACTOR_0`" — which makes Aurora stricter in exactly one
  case (`{15,15,0}`, which really does pack to `$0FF`). Stricter is the harmless
  direction; disabling the option on top of it would not be. Growing a packer
  here would put a second copy of the engine's 9-bit encoding in this repo, free
  to drift from the one that counts — see §6 item 7.

The option is rendered either way, so a value already in the file is always
**displayed**: a `<select>` whose current value has no option shows the first one
instead, which is a quiet lie about what the build will read — the failure
`unassignableSceneRef` already exists to stop for `sceneRef`.

### One more guard found while reading: curve ∧ deform

`layer()` refuses `curve` beside a live deform amplitude (`:580`) and beside an
`own()` table at all (`:586`). **Both controls are on the same card, four rows
apart** — the curve picker from parcel H, the deform toggle from wave 2 — so the
pair is authorable entirely through the UI. `layerCurveDeformAdvisory` says so.

### Numbers

| | after §1–6 | after §7 |
|---|---|---|
| `npx tsc --noEmit` | clean | clean |
| `npx vitest run` | 5056 passed, 7 skipped (5063) | **5069 passed, 7 skipped (5076)** · 387 files |
| harness rows | 29 | **37** |

**Three clean harness runs at 37/37, `dpr = 1` on all three**, same rect and same
integer aim as the earlier four.

### Red-first, the follow-up's own

**Node** (`src/renderer/providers/__tests__/effects-aeon.test.ts`, and
`effects-wording.test.ts`; both in the default `npx vitest run` glob):

| Plant | Row that went red | Quoted failure |
|---|---|---|
| `layerFbIsZero` accepts any packed triple | `factor0_lock: a CUSTOM PACKED fb is refused because Aurora cannot prove it` | `.toMatch() expects to receive a string, but got object` (the refusal returned `null`) |
| `effectiveDsb` drops the `own()` fold | `factor0_lock: a live plane-B amplitude WITH a table` | `.toMatch() expects to receive a string, but got object` — **isolated on its own build** |
| half two's `amp && table` → `amp \|\| table` | same row, **different assertion** | `expected 'layer 0 has a live Plane B deform amp…' to be null` |
| `sprite_mask` not disabled | `sprite_mask is rendered but NOT selectable` | `expected false to be true` |
| `vDeformToggleCommand` stops clearing the policy | `turning V deform OFF clears the policy WITH it, in one command` | `expected true to be false` |
| the panel drops `disabled={o.disabled}` | `renders the left_column_mask row and toggles v_deform ATOMICALLY` | `expected '// The wave-1 effects scene editor: p…' to match /disabled=\{o\.disabled\}/` |
| the panel uses `setSceneFieldCommand` for the `v_deform` toggle | same row | `…to match /vDeformToggleCommand\(library,\s*sele…/` |

**CDP** (five defects, one build):

| Poison | Rows red |
|---|---|
| `sprite_mask` not disabled | **6g** |
| `factor0_lock` disabled on a failed precondition | **6h** |
| half two removed from `factor0LockRefusal` | **6j** |
| the toggle stops clearing the policy | **6l** |
| `layerCurveDeformAdvisory` inverted | **7b** |

`32/37` — **exactly those five, no more and no fewer.**

### Which follow-up rows discriminate, and which do not

**Bar C, per row — the alternative green I checked:**

- **6g** could not pass with the option simply *missing*: **6f** asserts the
  option list equals the schema enum, so an absent `sprite_mask` fails there
  first. Two rows, two independent facts.
- **6h** could not pass with `factor0_lock` missing either — `.find(…)?.disabled
  === false` is `undefined === false`, red.
- **6j** could have gone green because half one never fired at all. **6i** is the
  companion that rules it out: it proves half one *does* fire on this same scene
  before the fbs are locked, quoting `Plane B factor is FACTOR_1`. The pair
  6i → 6j is the discriminator, and 6j asserts the reason **changed** rather than
  merely persisted.
- **6l** could have gone green against a policy that was never set. The row
  asserts its own **pre-state** (`beforeOff.m === 'factor0_lock'`) — the trap the
  guides harness's row 7c fell into once, where an undo-to-null proves nothing if
  the value was never non-null.
- **7b** could have gone green because the advisory fires for the *curve alone*.
  The row captures the panel text **before** turning deform on and asserts the
  warning was absent then. Two observations of one run — and, per Bar E's
  corollary, both from the *same* run.

**Rows that do NOT discriminate these defects, stated:**

- **6k** stayed green under the half-two removal. With half two gone the
  advisory was already clear, so "the advisory clears" is exactly what the
  broken build also shows. **6j** is the row that catches it; 6k's job is the
  *supported* side — it is what stops the pair being an assertion that a refusal
  merely exists.
- **6m** stayed green under the non-atomic toggle: undo restored `v_deform`
  either way. **6l** is the row that catches that one; 6m catches a *different*
  defect (a toggle that wrote two commands).
- **6i** stayed green under all five: it tests half one, which none of these
  poisons touched.
- **6f** stayed green under all five except by construction — it is the
  enum/order row and only 6g's neighbour.

### Carried forward, not dropped

- **Row 7a still cannot reach the two-sources condition.** The follow-up did
  **not** make it reachable — the card still has no `dsa`/`dsb`/`phase` control —
  so 7a remains a wiring check and still says so in its own detail line.
- **Every new absence row carries `panelIsDrawn`**: 6j, 6k, 6l. Without it,
  "the warning cleared" and "the panel never rendered" emit the same artifact.
