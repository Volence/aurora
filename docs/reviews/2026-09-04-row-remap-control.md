# The row-remap control — a shift that must never leave as a line count

*EW-9-ROWREMAP-CONTROL, 2026-09-04. Branch `parcel/ew9-row-remap-control`.
Commits `884448e7` (preset re-vendor, description-only, landed FIRST and alone),
`8fa90133` (scene re-vendor + codec + golden), `7994155d` (the control), plus the
harness/ROADMAP follow-up recorded at the foot of this page.*

---

## 0. What this parcel is, in one paragraph

Aeon shipped item 9's engine half (the Hydrocity waterline's SCROLL half, parcel
9a, merge `3d00e2c6`) with **one hand-authored call site and no document key**.
`$defs/layer` is closed, so no scene file could carry a remap and Aurora had
nothing to author. The unblock was a schema CR: empyrean `3992d16` adds
`rowRemap` to the layer object, filed from aeon's key-shape artifact `3d917657`
**against the landed constructor `SceneRemap.Ladder(t, y, h)`** rather than
against aeon's own design doc, *none of whose three proposed field names
survives*. This parcel re-vendors that schema (and one other, unrelated and
urgent, first), and builds the control.

---

## 1. The two re-vendors, verified rather than relayed

Both revisions were checked here before anything was believed about them:
reachable from empyrean `origin/main` (`baf295f2`, after a fetch), blob at the
named revision **equal to the blob at `origin/main`** (so current at tip, not
merely correctly cited), `git log --follow` naming each as its path's last
touching commit, extraction through **git objects** into this directory, and the
extracted bytes **re-hashed with `git hash-object`** on disk.

| file | revision | blob | re-hash |
|---|---|---|---|
| `aurora-effects-preset.schema.json` | `dfd11bb` | `13473a43` | `13473a43` ✔ |
| `aurora-effects-scene.schema.json` | `3992d16` | `b3e0ab31` | `b3e0ab31` ✔ |

### 1a — the PRESET re-vendor is one leaf, and it was WRONG ON SCREEN

`scratchpad/schema-revendor-proof.mjs` exits 0 with both readings agreeing:
**1 changed leaf**, `/properties/patch_motion/description`, 0 added, 0 removed,
209 leaves each side; descriptions stripped at every depth ⇒ byte-identical at
3935 characters (the same count as at `e9409dc` and `bfc000e`, so no structure
has moved on this file since `5bd76ba`).

**Why it had to land alone.** That description is not parsed by anything in
Aurora — it is **handed to the screen**. `ANCHOR_MOTION_TITLE` is the `title` on
the Movement field *and* on its select
(`src/renderer/components/effects/BandPresetPanel.tsx:764-765`). The old sentence
said a sweep leaving `patchable(lo, hi)` is "NOT clamped", the record is dropped,
and "the band VANISHES until the next zero crossing". Aeon measured that as true
**only past `hi`** (`raster.emp:1979-1980`); **below `lo` the value is CLAMPED UP
and still emitted** (`:1981-1983`), returning on the first frame the latched line
re-enters `[lo, hi]`, not at a zero crossing. Aurora was showing an author a rule
false in one of its two directions, and the repair is **zero lines of Aurora
code**.

**No guard pinned the reworded phrase, and that is correct.** Every prose
derivation in the repo was enumerated rather than assumed — `schemaNumberFromProse`'s
call sites and the other regex reads in `src/core/formats/effects/preset.ts`,
plus the ten in `src/renderer/providers/effects-preset.ts`. **None** reads
`properties/patch_motion`; the two anchor derivations read `patch_world_ys`
(`ANCHOR_MOTION_WITHOUT_SEED`) and `$defs/anchor_sweep` (`newAnchorSweep`), both
untouched. The only assertion over the string watches its `CAP_ANCHOR_MOTION`
clause, which the amendment did not touch. So nothing was weakened.

⚠ **The failure mode here is one no assertion over content could have caught:**
the sentence was TRUE WHEN WRITTEN and later became false. The only defence is
the currency gate — which is exactly what went red and started this.

The contract VECTORS did not move: `git log --follow` still names `5bd76ba` as
the last commit to touch `contract/schema/tests/effects-preset-vectors.json`
(none of `d5e0e7a`, `bfc000e`, `dfd11bb` appears), and `origin/main`'s blob
`af5b5cee` is the id `git hash-object` returns for the copy already vendored
here. Their sidecar's revision advances alone, as the test pinning both to one
revision requires.

### 1b — the SCENE re-vendor: nineteen leaves, two of them invisible

The proof exits 1 ("structure moved"), both readings agreeing. Leaf diff: **19
added, 0 removed, 0 changed**, 263 → 282 leaves, every added pointer under
`/$defs/layer/properties/rowRemap`. Stripped comparison: 5594 → 5904 chars, not
identical — the correct verdict for an addition, and the reading a
description-only check could not make.

> ⚠ **NINETEEN, NOT THE SEVENTEEN RELAYED TO THIS LANE.** A diff that flattens a
> document to its **scalar** leaves is blind to `{"not": {}}`: an empty container
> has no leaf under it, so a pointer-to-scalar walk emits nothing for
> `.../properties/ladder/not` or `.../properties/table/not`. **Those two
> invisible nodes ARE the reserved-name refusal the amendment adds** — an
> instrument blind to them reports the rulings as absent. `schema-revendor-proof.mjs`
> prints such a node as `<empty object>`; its own header names this blindness as
> the reason it takes two readings. Counted here, not relayed.

**Gates that went red, and what each forced.**

| gate | forced |
|---|---|
| `effects-schema-drift` (3 rows) | the sidecar pin — revision, subject, blob, bytes, git_blob, `resolved_by`, `revision_published`, the whole `what_changed_at_this_pin` block and the pin history |
| `effects-scene-golden` → *exercises every layer key the schema declares* | the shape-coverage golden had to gain the key, **named by the gate**. It carries aeon's OWN shipped pair `{plane_y 101, height_shift 4}` (`games/sonic4/data/effects/ojz_scenes.emp:252` at `d8baf84f`), so the fixture is the corpus, not numbers this repo invented |
| `json-schema-subset` keyword census / whole-schema walk / per-node check | **nothing** — and that is MEASURED, not predicted. `const`, `oneOf` and `not` were already implemented, and `not: {}` needs no new code because the evaluator validates the subschema and inverts (an empty subschema matches everything, so its negation matches nothing). **Exercised on a real document**, not argued: a layer carrying `ladder` or `table` inside `rowRemap` is refused, and an ordinary undeclared key is refused for the *closed-object* reason instead — a discriminating pair |

Codec: `EffectsLayer` gains `rowRemap?: EffectsRowRemap`. Nothing else, because
parse and serialize are schema-driven and `EFFECTS_LAYER_KEY_DEFAULTS` reads the
`"none"` default straight out of the new node, so clearing already DELETES the
key.

---

## 2. The control

### 2.1 The unit is the parcel

`height_shift` is a **SHIFT** — `H = 1 << shift` — and **every value 3..7 is
legal**. An editor that exported a line count therefore lands a band four times
too tall **with a green build and no refusal anywhere in the pipeline**. Aeon's
own ensure names the trap ("If you meant 64 LINES, you want 6"), and the contract
asks an editor to DISPLAY `1 << height_shift` and EXPORT the shift.

So: the picker reads `16 lines (shift 4)`, `64 lines (shift 6)`, and the `<<`
exists in exactly one place in this repo (`rowRemapHeightLines`), which the write
path never calls. `rowRemapWithHeightShift` writes `o.shift`.

The node test asserts, for **every** option, that the written value equals the
shift and **not** the line count — after first asserting the two differ, so the
row cannot be vacuous. The harness closes the same property **across the seam**,
which is where it actually lives: that the *picker* passes `o.shift` and not the
number in its own label is a fact about the wiring, and only the running app has
it.

### 2.2 `plane_y`, and the bound nothing else holds

`plane_y` is a **Plane-B line 0..511** — the `vsplit.at` coordinate space, a
*third* space on a surface that already reconciles world pixels and screen lines.
The runtime's only use of it is `plane_y - Vscroll_BG`, whose second term is a
per-frame quantity, so there is no editor arithmetic that could improve it: the
right conversion is none.

⚠ **This schema is the only enforcement of the ceiling anywhere.** Aeon's ensure
(`scene_dsl.emp:1008`) tests `>= 0` alone and `brm_plane_y` is `u16`, so
512..65535 emits a silently-wrong window; aeon booked it themselves as
`ROWREMAP-PLANEY-CEILING`. The box refuses past the ceiling **and says why**. The
writer does **not** clamp (a clamp substitutes a number the author did not type);
the **seed** does, because a seed has no author to disagree with — and it clamps
with `rowRemap`'s own bounds, not `vsplit`'s, on `EFFECTS_ANCHOR_SHIFT_BOUNDS`'s
precedent about two spaces sharing one reader.

### 2.3 Schema-legal is not buildable, and the row says so

Only `height_shift: 4` has a ladder (`row_remap_ladder16()`); aeon refuses the
other four **by name** until 9b's generator lands. The owner's recorded complaint
about this tooling is precisely this failure — *"It kept giving errors during
build time that I would have to stop and revert the changes."*

The design: the buildable option is **marked** in the list, a warning paints under
the row for any other, and **nothing is filtered**. A list offering only the
buildable value would disagree with the format, and an author opening a
hand-authored `height_shift: 6` would be looking at a picker that cannot
represent their own file.

**Nothing hardcodes "only 4 works."** `EFFECTS_ROW_REMAP_BUILDABLE_SHIFT` parses
the contract's `TODAY ONLY n BUILDS` clause and **cross-checks it against the
ladder function name in the same sentence** (`1 << n` must equal
`row_remap_ladder<N>`'s line count) — two statements of one quantity, and a
disagreement throws at module load rather than blessing an unbuildable value.
When 9b lands and the clause goes, the constant reads `null`, every warning here
goes quiet, and the seed falls back to the schema's own narrowest band. **The
caution carries its own expiry.**

### 2.4 The three `scene()` preconditions — the real prize

§2.6 ruling (3) keeps them **out of the schema** deliberately: *"JSON Schema
cannot express a cross-key conditional over an array element's siblings legibly,
and the message is worth more than the encoding."* They belong to aeon's
**generator**, with the engine `ensure`s kept for hand-authored `.emp`. So
nothing the author is talking to refuses them until a build runs — and all three
are functions of keys Aurora already holds open.

| condition | Aurora's predicate | derived from |
|---|---|---|
| nothing to vary → the remap is the **identity** and the effect is **absent, not subtle** | its own live `curve`, OR a live effective `dsb` with a `deform_bg` table, OR the scene anchor's live `dsb` with a `deform_bg` table | the contract's own clause, verbatim: *"its own curve, or a live dsb with a deform_bg table, or the scene anchor's live dsb with a deform_bg table"* |
| the scene declares no `anchor` | `scene.anchor` absent or `"none"` | the channel comes from the SCENE's anchor, never a per-layer field (`scene_dsl.emp:822-824`) |
| a SECOND remapped strip | a count over `layers[]`, **naming the others** | *"at most ONE layer per scene may carry rowRemap"* |

Two details worth not re-litigating:

* **`effectiveDsb`, not `layer.dsb`.** `layer()` folds `own.shift_b` over `dsb`
  into `ly_dsb` (`scene_dsl.emp:558`), so a strip with its own deform table has a
  live amplitude its `dsb` field does not show. A raw read would report "nothing
  to vary" for exactly the strips this parcel makes most interesting. There is a
  row for it.
* **The no-deform sentinels are two separate reads** — `EFFECTS_LAYER_DEFORM_BOUNDS`
  and `EFFECTS_ANCHOR_SHIFT_BOUNDS` — because the two shift spaces live in
  different `$defs` and agree only by coincidence today.

**The sentence the author reads is aeon's.** `EFFECTS_ROW_REMAP_GENERATOR_REFUSALS`
extracts the four clauses from the schema's own *"REFUSALS THIS SCHEMA DOES NOT
ENCODE"* paragraph and throws naming the missing clause if the contract stops
carrying one. Aurora contributes only the diagnosis. The test asserts the shown
string is a **substring of the vendored description**, so a paraphrase fails
there even though it would read fine.

**Warnings, not refusals** — following §2.6 rather than softening it: the
refusals are the generator's, the document stays schema-legal, and Aurora
refusing to write one would be a fourth party inventing a rule. What Aurora owes
is that the author never learns them from a build log.

**The fourth condition is NAMED, not omitted.** `CAP_ROW_REMAP` is not a function
of the document, so it can never appear in the per-strip list — and a silence
there would read as coverage. It is stated once as a note, and a row asserts it
**never** appears as a per-strip verdict.

`ladder`/`table`: no control, nothing written, and the names are read out of the
`{"not": {}}` nodes **by the idiom** rather than listed, so a third reserved name
would surface with no edit here. A harness row checks neither is offered anywhere
on the card.

---

## 3. What was measured

**Node suite, both runs by this lane on this tree.**

| | Test Files | Tests |
|---|---|---|
| BEFORE (branch point, `master` content) | 3 failed / 486 passed / 3 skipped (492) | **4 failed / 6910 passed / 9 skipped (6923)** |
| AFTER | 1 failed / 489 passed / 3 skipped (493) | **2 failed / 6944 passed / 9 skipped (6955)** |

The two schema-currency gates this parcel closed are gone from the failure list.
**The two remaining failures are PRE-EXISTING and not this parcel's:**
`test/formats/effects-preset-base-swap.test.ts`'s two *"the shipped section-6
document opens"* rows read aeon's **live working tree**, where
`ojz_sec6_baseswap.json` now says `line: 3` where the vendored contract vector,
Aurora's pin and empyrean's own published vectors all say `160`. Both were red at
the branch point, before this branch existed.

**Harness — `npm run harness:row-remap-control`, 26 rows** (box uptime at the
run: 9 days 16 h). Driven under `xvfb-run` at 1680x1050 against a **writable copy**
of aeon (`AEON_DIR`, never the live checkout — hub ruling d-28), reading the
model back through `window.__dbg.aeon.scenesJson()` rather than the widget, with
every bound, the shift/line relation and the reserved names **re-derived in the
harness process from the vendored schema JSON** so no row can agree with the app
by construction.

Highlights, quoted from the run:

```
PASS [3b] the picker offers EVERY legal shift, labelled in LINES, valued by SHIFT
       3  8 lines (shift 3)
       4  16 lines (shift 4) — builds today
       5  32 lines (shift 5)
       6  64 lines (shift 6)
       7  128 lines (shift 7)
PASS [4a] picking the "8 lines" option writes the SHIFT 3, not 8
       document holds {"plane_y":112,"height_shift":3}
PASS [4b] "3 (8 lines) is a legal shift that does NOT BUILD yet: the engine can generate
          only the 16-line ladder … 4 (16 lines) is the one that builds today."
PASS [5b] "512 is outside the Plane-B line range 0..511. This bound is the CONTRACT'S ONLY
          ENFORCEMENT: aeon checks the floor and not the ceiling …"
PASS [6b] a SECOND remapped strip is reported on BOTH cards, each naming the other
PASS [6c] NOTHING-TO-VARY appears on the strip with no curve and NOT on the one with a curve
```

Every paint row compares the leaf's rect **against its scroller's own box** and
requires a strict `elementFromPoint`; `checkVisibility()` and
`getClientRects().length` are printed as evidence and are never the gate, because
both go green on an element scrolled thousands of pixels out of its scroller.

---

## 3b. Red-first — every plant quoted from disk, restored from a COMMITTED baseline

Each mutation was applied on disk, **read back with `grep` and shown as a
`git diff --stat` naming the file**, then the gate was run, then the file was
restored with `git checkout --` **on a path that was clean at HEAD** (never on a
dirty tree — the working copy carried only this packet).

| # | mutation | gate | result |
|---|---|---|---|
| 1 | `rowRemapWithHeightShift` writes `rowRemapHeightLines(shift)` — *the parcel's central defect* | `effects-row-remap` | **RED**, 2 failed / 30 passed: *writes the SHIFT for every option…* and *keeps the other field when one is edited* |
| 2 | `rowRemapPlaneYRefusal` drops the CEILING test (aeon's own `>= 0`-only shape) | `effects-row-remap` | **RED**, 1 failed: *refuses past the ceiling and says the engine will not catch it* |
| 3 | the vary check reads raw `layer.dsb` instead of `effectiveDsb` | `effects-row-remap` | **RED**, 1 failed: *reads the layer's EFFECTIVE dsb, not the raw field* |
| 4b | the EVALUATOR's `not` becomes a no-op (`if (false && …)`) in `json-schema-subset.ts` | `effects-row-remap` + `effects-schema-drift` | **RED**, 2 failed: *refuses every reserved name by name, through the `not: {}` idiom* **and** the drift file's own *implements `not` as a refusal* |
| 4c | BOTH reserved names lose their `not` in the vendored schema | both | **RED** — `effects-row-remap` fails at **module load**, `no tests`, with `EFFECTS_ROW_REMAP_REFUSED_KEYS`'s own message: *"…declares no `{"not": {}}` property — the reserved names Aurora refuses to offer were derived from that idiom, and the mechanism is gone."* Plus the drift gate's two hash rows |

Harness plants, each reddening exactly its named judge and nothing else
(25/26 both times):

* `PLANT=lines-not-shift` → `[4a]` RED — *"document holds `{"height_shift":8}`"*.
* `PLANT=widget` → `[5a]` RED — reading the box instead of the model.

### ⚠ A POISON THAT CAME BACK GREEN, AND WHAT IT ACTUALLY MEANT

The first attempt at plant 4 removed `"not": {}` from **`ladder` alone**, leaving
`table`'s intact. **The gate stayed GREEN, 32/32.** Of the three reasons a poison
goes green — a loose matcher, a second code path holding it green, or *the row
never reaching its subject* — this was the third, and it is not a defect:

`EFFECTS_ROW_REMAP_REFUSED_KEYS` derives the names **from the mechanism**
(a declared property whose schema is `{"not": {}}`), and the row iterates that
derived set. Removing one name shrinks the set, so the loop simply no longer asks
about `ladder` — while `table` keeps the anti-vacuous floor satisfied. That is the
**designed** behaviour: a contract that PROMOTES `ladder` to a real field should
see Aurora follow, not refuse, and one that reserves a THIRD name gets it for
free. Nothing was being missed.

What the row is really about is the **evaluator**, and plants 4b and 4c prove it
reaches that: neuter `not` and the row goes red; empty the derived set entirely
and the module-load guard takes the whole file down with a message naming the
missing idiom. **The loose matcher and the second-code-path explanations are
ruled out by 4b specifically** — a loose matcher would have survived the
evaluator being switched off, and a second path holding the refusal green would
have kept the drift file's own `not` row green too, and it did not.

---

## 4. Three things the harness found that no test could

### 4.1 A `data-testid` that reached nothing

The precondition hints were rendered as `<Hint data-testid=…>`. `Hint` takes
`{children, under, tone, style}` and **drops everything else**, and TypeScript
does not check a hyphenated JSX attribute on a component — so the attribute
silently never reached the DOM. The suite was green; the harness's two
precondition rows read **zero nodes while the sentences were plainly on screen**.
Fixed by wrapping in a `<span>` (the extras line already does this, for the same
reason). *A testid that asserts nothing, found only by driving the app.*

### 4.2 A paint query that could not see its own subject

Adding that `<span>` then broke row `[6a]`: `PAINTED_LEAF` searched `div`s and
excluded any whose child carried the needle — which is now every wrapped hint.
The row went red **for a reason that was not about paint**. Widened to
`div,span`, with the finding written into the query.

### 4.3 ⚠ PREFIX COMMIT — a real wart, pre-existing and shared

`NumberField` commits **on every keystroke**, so typing `512` walks the document
through its prefixes: `5` and `51` are both legal plane lines and both commit;
only `512` is withheld. Measured on the first run — the document held `51` while
the box showed `512`. **The box and the document disagree until the next commit.**

This is not this row's subject and it is **not new**: the drift box has it too,
and that harness's equivalent row is written loosely enough to tolerate it
(`Math.abs(rate) <= max`), which is why nobody had reported it. The property that
reaches a ROM — *the out-of-range value never lands* — holds, and that is what
row `[5a]` now gates, with the prefix commit **printed** on every run rather than
swept up. **Not fixed here:** `NumberField` is shared by the drift, ramp,
base-swap and deform boxes, and changing its commit timing is a cross-surface
change that needs its own parcel and its own harness rows.

---

## 5. Open, and TAGGED for the foreground lane

1. ⚠ **NO ROM HAS EVER BEEN BUILT THROUGH THE DOCUMENT PATH.** Aeon verified the
   binding **in source only**, at `d8baf84f` (`preset.emp:153-154`, `:283-290`,
   `effects_gen.py:1280-1281`) and said so: *"verified in source at `d8baf84f`;
   no ROM has been built through this path."* And 9b's **generator does not
   exist**, so a document carrying `rowRemap` cannot lower at all yet. Nothing
   this parcel ships can be confirmed on a ROM, by anyone, today. **TAGGED** —
   this lane runs no emulator.
2. **The `NumberField` prefix commit** (§4.3) — booked, not fixed.
3. **`docs/reviews` note:** the two pre-existing base-swap failures are an
   aeon-side content drift (`line: 160` → `3` in aeon's working tree). Not this
   lane's, and not fixable from here — Aurora's pin is the published contract
   vector.
4. Row 99's remaining splits: DoD items 8, 10 and 11's controls.
