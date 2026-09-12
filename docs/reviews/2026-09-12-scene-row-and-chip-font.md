# A scene row that could not fail, and a chip that paints two pixels too big

Two independent parcels, two commits. Branch base `a33ef10d`.

| commit | what |
|---|---|
| `486db3be367bab567d7b7fa3b258f0dab464219e` | Parcel A — the repaired read row and the new write row |
| `b99bfb77d17af8e5a28cda3ee6b16b0b237cd784` | Parcel B — the harness row and the runner fix it needed |

**Parcel B's FIX is not in either commit.** It is written out below, measured on both sides,
and STOPPED on: the cause is a shared primitive and fixing it moves six other controls in the
one facet that was measured. See §B.4.

---

# Parcel A — `refuses a missing schema key`

## A.1 The vacuity, reproduced here rather than inherited

The brief supplied the measurement; it was re-run in this worktree before anything was written,
because a claim about a tree is itself a measurement.

Mutation applied to `src/core/formats/effects/scene.ts:560`, quoted back off disk:

```
$ git diff --stat
 src/core/formats/effects/scene.ts | 2 +-
$ grep -n "MUTATION: absent key walks past" src/core/formats/effects/scene.ts
560:  if (obj.schema !== undefined && obj.schema !== 1) { // MUTATION: absent key walks past
```

```
 ✓ test/formats/effects-scene.test.ts (36 tests) 15ms
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

**36 passed, 0 failed with the rule the row names deleted.** The row was
`.toThrow(EffectsSceneError)` and nothing more, and the key-less document is still refused one
layer down by the vendored schema's `required` clause (`json-schema-subset.ts:437`), so
"something threw" was satisfied by a different rule entirely. Restored with `git checkout --`
from the committed baseline.

## A.2 The needle, and why it is that one

`scene.ts:560` is `obj.schema !== 1` — the SAME property the preset codec has (`preset.ts:2070`,
merge `a33ef10d`). The ABSENT key and a WRONG VALUE both reach that line and both are handed
"wave 1 refuses anything but 1". A needle of `/refuses anything but 1/` would therefore be the
NEIGHBOURING row's needle (`refuses schema != 1 in its own words, not as a failed const`) and
would pin nothing new. The one thing separating the two sentences is the value quoted back by
`JSON.stringify(obj.schema)` at `:562`, which renders `undefined` for a key that is not there.

**Read row needle: `/declares "schema": undefined/`.**

Uniqueness, as a grep run in this worktree:

```
$ grep -rn 'declares "schema"' src/ test/ scratchpad/
src/core/formats/effects/scene.ts:562: ... wave 1 ...
src/core/formats/effects/preset.ts:2072: ... wave 2 ...
test/formats/effects-preset.test.ts:222,229,230   (the preset rows' own needles)
```

Two composition sites, one per codec; a row calling `parseEffectsScene` can only ever reach the
scene one. And a present key cannot render `undefined` — JSON carries no such value — so within
the scene codec the needle is specific to the ABSENCE.

**Write row needle: `/missing required property "schema"/`.** The bare phrase is NOT unique; the
composition site builds it for every required key, and the scene schema's `required` is
`["schema", "id", "layers", "v_factor"]`, so the `"schema"` half is load-bearing exactly as it
was in the preset parcel (where the band-keys row composed it for `bot`/`on`/`sh`/`top`):

```
$ grep -rn 'missing required property' src/ test/
src/core/formats/effects/json-schema-subset.ts:437:  ... `missing required property "${key}"` ...
   (+ six test-side references, all preset/reels rows)
```

## A.3 The controls, and the proof they are not decoration

Each row feeds the OTHER rule's document (`schema = 2`) to the same function, asserts the other
rule's sentence comes back, and asserts this row's needle does NOT. Both `.not.toMatch`
expectations were flipped to `.toMatch` **on disk** and run:

```
$ grep -n "CONTROL FLIPPED" test/formats/effects-scene.test.ts
184:    expect(wrongVersion).toMatch(/declares "schema": undefined/); // CONTROL FLIPPED
528:    expect(versionMessage).toMatch(/missing required property "schema"/); // CONTROL FLIPPED
```

```
FAIL  refuses a document with NO schema key, quoting the absence back
AssertionError: expected 'plain.json declares "schema": 2; wave…' to match /declares "schema": undefined/
+ Received:
"plain.json declares \"schema\": 2; wave 1 refuses anything but 1. There is no migration
 machinery in v1 (AURORA_EFFECTS_SCHEMA.md §2, Versioning). A new schema version is a contract
 change, not a file the reader upgrades."

FAIL  REFUSES to write a scene with NO schema key, naming the MISSING key
AssertionError: expected 'refusing to write scene "plain": it d…' to match /missing required property "schema"/
+ Received:
"refusing to write scene \"plain\": it does not match the effects scene schema
  - /schema: expected the constant 1, got 2"

 Tests  2 failed | 35 passed (37)
 failure-class: ASSERTION 2 · TIMEOUT 0 · UNCLASSIFIED 0
```

Discrimination in both directions, in the artifact's own words. Restored with `git checkout --`
from `486db3be`, a committed baseline (the rows were committed GREEN first, so no restore ever
ran over a dirty tree).

## A.4 Red-first, each mutation reddening exactly one row

**Read row** — `scene.ts:560`, the same mutation as §A.1, re-applied against the committed rows:

```
FAIL  refuses a document with NO schema key, quoting the absence back
AssertionError: expected [Function] to throw error matching /declares "schema": undefined/
+ Received:
"plain.json does not match the effects scene schema
  - <document>: missing required property \"schema\""
 Tests  1 failed | 36 passed (37)
```

The received message is the whole point: with the rule removed the document is STILL refused,
which is why the old row stayed green. The write row stayed green under this mutation.

**Write row** — `json-schema-subset.ts:437`, so `required` stops refusing an absent `schema`:

```
$ git diff --stat
 src/core/formats/effects/json-schema-subset.ts | 2 +-
$ grep -n "MUTATION: absent schema not required" src/core/formats/effects/json-schema-subset.ts
437:        if (!(key in obj) && key !== 'schema') issues.push({ path, message: `missing required property "${key}"` }); // MUTATION: absent schema not required
```

```
FAIL  REFUSES to write a scene with NO schema key, naming the MISSING key
AssertionError: expected '' to match /refusing to write scene "plain"/
+ Received: ""
 Tests  1 failed | 36 passed (37)
```

The EMPTY message is the finding: with the clause gone `serializeEffectsScene` does not throw at
all — it returns text, and `save.ts:576` encodes whatever it returns without catching
(`save.ts:544-547` says so in as many words), so a schema-less scene would reach disk. The read
row stayed green under this mutation. The two rows are independent and neither stands in for the
other.

**Runner: `vitest run`, the last stage of `npm test`** (`package.json` `"test"`). No new rig.

## A.5 The WRITE side: it does have the same exposure, and here is the evidence

`serializeEffectsScene` (`scene.ts:641-649`) runs `validateAgainstSchema` and **nothing else** —
no version check of its own, exactly like `serializeEffectsPreset`. The vendored schema
(`aurora-effects-scene.schema.json`) states the version rule twice:

```
$ python3 -c "...; print(s.get('required')); print(s['properties']['schema'])"
top required: ['schema', 'id', 'layers', 'v_factor']
schema prop:  {"const": 1}
```

so on write the absence and the wrong value are two clauses, two code paths, two sentences —
`required` at `json-schema-subset.ts:437` vs `const` at `:352-353` — and `const` can never fire
for an absent key, because `:441` only descends into a property that is `in obj`. That is the
verdict: **the write side is exposed and is now pinned, one property per row**, not folded into
the read row.

## A.6 The neighbour enumeration — every row in the file, with a verdict

Two instruments, both run here:

1. **Throw-site census.** `scene.ts` has six `new EffectsSceneError` sites, each with its own
   sentence: `:547` *is not valid JSON* · `:553` *must contain a JSON object* · `:561` *declares
   "schema": X; wave 1 refuses…* · `:590` *does not match the effects scene schema* (+issues) ·
   `:596` *declares "id": X; the filename stem and the id must match* · `:645` *refusing to write
   scene "X"* (+issues). A needle naming one of those six cannot be satisfied by another site.
2. **Issue census.** A throwaway probe (not committed; a `validateAgainstSchema` call over each
   row's own document, run under a scratch vitest config) printed the FULL issue list every row
   document produces. A document producing exactly ONE issue cannot have a generically-worded
   needle satisfied by a neighbouring rule, because there is no other failing rule to satisfy it.

| row (by name) | needle | issues its doc produces | verdict |
|---|---|---|---|
| `refuses a missing schema key` (old) | `.toThrow(EffectsSceneError)` — **the only bare class in the file** | 1, but reached by a DIFFERENT site (`:590`, not `:561`) | **VACUOUS — FIXED.** §A.1-A.4 |
| `accepts a minimal scene…` | not a refusal row | 0 (positive control) | fine |
| `REFUSES a legacy scene still carrying the retired precision` | `/does not match the effects scene schema/` | 1 (`unknown property "precision"`); the alien-key doc also 1 | **weak wording, NOT vacuous — LEFT.** Delete the rule and the doc produces 0 issues and nothing throws. It also carries its own anti-vacuous control (the same doc without the key parses clean) and asserts `unevaluatedProperties === false`. |
| `refuses a filename stem that does not match the id` | `/the filename stem and the id must match/` | 0 schema issues; only `:596` can fire | **NOT vacuous — LEFT.** Unique sentence, and `:590` provably cannot pre-empt it. |
| `refuses schema != 1 in its own words…` | `/refuses anything but 1/` + `/no migration machinery/` | 1, and `:561` fires FIRST | **NOT vacuous — LEFT.** Sentence unique to `:561`. It does not discriminate the absent key from the wrong value — that is precisely what the repaired row now adds. |
| `refuses malformed JSON loudly…` | `/is not valid JSON/`, `/must contain a JSON object/` ×2 | n/a (pre-schema sites) | **NOT vacuous — LEFT.** |
| `rejects the shape of a real Aurora BG-library id` | `/does not match the effects scene schema/` | 1 (`/id: … does not match ^[a-z]…`) | **weak wording, NOT vacuous — LEFT.** Same argument as `precision`; also derives the id from `makeBgId` and asserts the pattern directly. |
| `rejects hyphens, unicode, uppercase…` / `accepts a 32-character lower_snake id` | no `toThrow` | n/a | fine |
| `refuses an unknown top-level key` | `/unknown property "presets" \(the schema is closed\)/` | 1 | **NOT vacuous — LEFT.** Names the key. |
| `refuses an unknown layer key` | `/layers\/0: unknown property "tint"/` | 1 | **NOT vacuous — LEFT.** Path-qualified. |
| `names the excluded raw fields and their reason` | the dedicated sentence | 2 (both `unknown property`), but the needle matches the `scene.ts:581` sentence neither of them builds | **NOT vacuous — LEFT.** |
| `enforces the schema ranges and the layer count…` | `minimum ${min}` / `maximum ${max}` / `/above the maximum 32767/` / `/above the maximum 15/` / `/anchor\/at\/channel/` | 1 each; the `max`-layer control doc produces 0 | **NOT vacuous — LEFT.** Bounds derived from `EFFECTS_LAYER_COUNT`, and it carries a positive control. |
| `enforces integer-ness…` | `/expected integer, got number|boolean/` | 1 each | **NOT vacuous — LEFT.** One failing rule per document. |
| `refuses an unpublished factor name and a malformed packed triple` | `/matches none of the 2 allowed forms/` ×3 | 1 each | **NOT vacuous — LEFT.** ⚠ **weakest wording in the file**: the needle names neither the path nor the value, and a `oneOf` elsewhere in the document would produce the same sentence. It survives only because each document has exactly one defect. A path-qualified `/layers\/0\/fa: matches none/` would cost nothing and is the one improvement worth offering; not taken unasked, since it is a change to a row this parcel was not sent for. |
| `refuses a FACTOR_* name and an out-of-range shift at v_factor` | `/v_factor: …/` ×3, bounds read out of `EFFECTS_SCENE_SCHEMA` | 1 each | **NOT vacuous — LEFT.** Path-qualified and derived. |
| `refuses a tableRef .bin path that escapes the effects directory` | `/matches none of the 6 allowed forms/` ×2 | 1 each, plus a clean positive control | **NOT vacuous — LEFT.** Same weak-wording note as the factor row. |
| writer rows (round trip, key order, determinism, one LF, indent 2) | value assertions | n/a | fine |
| `refuses to write a scene that does not match the schema` | `/refusing to write scene "bad"/` + `/unknown property "presets"/` | 1 each | **NOT vacuous — LEFT.** |
| library + advisory rows | value assertions, no `toThrow` | n/a | fine |

**Summary: exactly one vacuous row in the file, and it is the one the brief named.** Two rows
have needles that would be satisfied by a neighbouring rule if their document ever grew a second
defect (`matches none of the N allowed forms`); both are flagged above and neither was quietly
rewritten.

---

# Parcel B — CHIP-FONT-13PX

## B.1 The mechanism — it is a duplicate key, not a cascade

`Chip`'s interactive branch, `src/renderer/components/ui/primitives.tsx:282`:

```jsx
style={{ ...style, font: 'inherit', fontSize: T.tXs, lineHeight: 1, margin: 0, textAlign: 'left' }}
```

and the `style` object it spreads (`:262-270`) **already contains `fontSize: T.tXs`**. In a JS
object literal a duplicate key keeps its FIRST insertion slot and takes its LAST value, so the
enumeration order is:

```
$ node -e "const s={a:1,fontSize:'11px',b:2}; const o={...s, font:'inherit', fontSize:'11px', lineHeight:1}; console.log(Object.keys(o).join(','))"
a,fontSize,b,font,lineHeight
```

`fontSize` comes **before** `font`. React writes inline styles in enumeration order, so it sets
`font-size: 11px` and then `font: inherit`, and the shorthand resets font-size to the inherited
value. The button is inside `body { font-size: var(--text-base-size) }` = 13px
(`src/renderer/index.html:11`, `styles/theme.css:39`), and there is no intervening rule, so it
paints at 13.

It is not an overriding stylesheet rule, not cascade order between sheets, and not a missing
rule — the rule is written and then erased by the shorthand two keys later. The comment sitting
directly above that line asserts the opposite outcome — *"font and line-height are inherited so a
chip in a 13px bar is still 11px"* — which is the intent; the code does the reverse of it.
`lineHeight: 1` survives only because it is written AFTER the shorthand.

## B.2 Proved on screen, not in the stylesheet

**Instrument: the existing `scratchpad/chunk-links-harness.mjs`, new row `4b`** — chosen over a
new rig because that harness already opens the real aeon project, mounts the Layout facet, and
drives this exact panel to an enabled Detach button in rows 1..4. `npm run harness:chunk-links`.

Both runs pinned to this worktree, and the harness said so on its own lines:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ae600c8c4b3ac0529
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ae600c8c4b3ac0529
build flavour: DEBUG (VITE_AURORA_DEBUG=1 …), so window.__dbg is in this bundle
```

Run with `ELECTRON_BIN=…/aurora/node_modules/.bin/electron`,
`AURORA_BUILT_TREE=<this worktree>`, and `AEON_DIR=` a `git archive`-extracted copy of aeon at
**`a38ce7c9`** (never the live tree).

**RED (as committed, master's `Chip`):**

```
FAIL  [4b] the panel's Detach button is painted at the size its own style declares …
        declared --text-xs-size="11px" computed="13px" inherited="13px"
        inline font-size="inherit" inline font shorthand="(does not serialize)"
        [env] dpr=1 buttonRect={"x":1309.59,"y":328.34,"width":57.09,"height":19,…}
```

**GREEN (fix from §B.3 applied on disk and REBUILT):**

```
PASS  [4b] the panel's Detach button is painted at the size its own style declares …
        declared --text-xs-size="11px" computed="11px" inherited="13px"
        inline font-size="var(--text-xs-size)" inline font shorthand="(does not serialize)"
        [env] dpr=1 buttonRect={"x":1309.59,"y":332.34,"width":50.47,"height":17,…}
```

`inline font-size` is the mechanism read back out of the DOM: `"inherit"` before, the token
after. Nothing here is a stylesheet claim.

**The expectation is DERIVED, never typed.** `--text-xs-size` is read out of the live document's
own custom properties in the same evaluation as the button's computed size; the number 11 appears
nowhere in the row. The row is LOUD on unmeasurable — an empty token or a missing button fails,
never passes by absence.

**dpr:** printed in both runs and **1 in both**. It cannot confound this measurement in any case:
`getComputedStyle().fontSize` is resolved CSS px, not device px, and both sides of the comparison
come from one `Runtime.evaluate` on one document — no claim here is assembled from two runs. The
rect is printed beside it because that one IS in CSS px affected by layout, and it is reported as
context, not as the assertion.

**Runner defect fixed first (it had to be).** In this worktree the harness died BEFORE row 1 with
`Runtime.evaluate: {"code":-32000,"message":"Promise was collected"}` — `awaitPromise: true`
holds no strong reference to the promise, so V8 collected the open's. That reads exactly like
"the project failed to open" and is not that; the open resolves in 0.5s. The harness now parks
the outcome on `window`, polls a string, and THROWS if it never leaves `pending` rather than
walking into rows that would all be vacuous. Committed in `b99bfb77`.

## B.3 The fix — written, measured, NOT committed

```diff
-      style={{ ...style, font: 'inherit', fontSize: T.tXs, lineHeight: 1, margin: 0, textAlign: 'left' }}
+      style={{
+        ...style,
+        fontFamily: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit',
+        fontSize: T.tXs, lineHeight: 1, margin: 0, textAlign: 'left',
+      }}
```

Longhands instead of the shorthand: the shorthand was only ever wanted for the FAMILY the UA
overrides on a `<button>`, and naming the longhands means no later key can erase an earlier one.
It is the smallest change that fixes the cause rather than the symptom; a per-call-site override
on this one button would leave the primitive still doing the opposite of its own comment.

## B.4 ⚠ STOPPED — and the list

The cause is the shared `Chip` primitive, and **every interactive chip in the app carries it**.
The non-interactive branch (`<span>`, chips with no `onClick`) never had `font: inherit` and is
already at 11px, so the two branches of one primitive disagree today.

Measured, in the Layout facet, with the fix applied — every chip-shaped element mounted at that
moment, all seven of them:

| control | before | after |
|---|---|---|
| `FG` | 13px | 11px |
| `BG` | 13px | 11px |
| `Undo` | 13px | 11px |
| `Redo` | 13px | 11px |
| `Save` | 13px | 11px |
| `Detach` *(the reported one)* | 13px | 11px |
| `Detach all in section` | 13px | 11px |

and the Detach button's own box shrinks `57.09 × 19` → `50.47 × 17`, so the option rows reflow
slightly too.

That is six controls beyond the one reported **in the single facet that was measured**, and the
mechanism is context-free, so the other ~24 `<Chip` call sites — canvas, effects, sprite, art,
classic, the shell headers — move identically. A visible change of that size is the owner's call,
so the fix is **not** in either commit. Row `4b` stays RED as the durable record; it goes green
the moment the four lines above land.

**What is NOT claimed:** only the Layout facet's chips were measured. The claim about the other
facets is a mechanism argument from the shared primitive, not a reading.

## B.5 Unrelated red observed in the same runs — TAGGED, not touched

Row `9` (*a chunk edited and SAVED in the real Art facet rewrites the section tiles that still
remember it*) **failed in all three runs**, identically, before and after the Chip fix:

```
FAIL  [9] … save=clicked composerCell=(3,0) armedTile=1 previousTile=0
        section word before=0 after=0 (tileIndex 0)
        that tile's link={"id":1,"chunkId":"OJZ_00","baseCol":0,"baseRow":48,"collision":true}
```

`docs/reviews/2026-09-03-harness-red-sweep.md` records this harness at **11/11** on 2026-09-03,
against a purpose-built fixture (`~/.cache/o50-sweep/work/chunk-links-harness.aeon`), not against
an archive of the live aeon. So this is either a propagation regression since then or a fixture
difference, and **this parcel cannot tell which**: the unpatched harness cannot boot in this
worktree (§B.2), so there is no clean baseline here to compare against. Reported, not diagnosed,
and unrelated to both parcels. Final tally in every run: **11/12 with the fix, 10/12 without.**

---

## Anything else

- **No emulator, no runtime beyond the CDP harness.** Nothing in either parcel needed one.
- The scratch probe used for §A.6 (a `validateAgainstSchema` census plus a throwaway vitest
  config) was **deleted, not committed** — it cannot run under the suite's own `include` globs,
  and an unregistered harness in the tree is invisible. Its output is quoted above instead; it is
  reproduced by calling `validateAgainstSchema(doc, EFFECTS_SCENE_SCHEMA)` on each row's document.
