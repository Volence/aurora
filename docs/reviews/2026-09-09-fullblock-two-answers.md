# FULLBLOCK-ZERO-IS-TWO-ANSWERS — the two answers stop being one number

Branch `parcel/fullblock-two-answers`, based on master `db894e96` (the brief
named `670e3821`; master had moved four commits past it by the time this
started, and `db894e96` is what the baseline below was measured on).

## 1. What was wrong, and why it was not a missing guard

`findFullBlockShapeId(profiles)` returned `0` for two different facts:

* **"I could not look."** No profile set was loaded, so nothing was searched.
* **"I looked, and there is nothing to use."** A real bank was searched and none
  of its shapes is a full block.

`src/renderer/providers/chunk-library-import.ts` spent that `0` without asking
which it was. It passed the value into `importChunks`, wrote the chunks into the
author's project, called `markDirty()`, and raised a **success** toast reading
`Imported N chunks -- Save to keep`. Every cell of every imported chunk came in
as air and the app said it worked.

The producer upstream is **not** the bug and was not changed.
`loadCollisionProfilesFa` in `src/core/project/aeon/load.ts` returns `null` on
any missing or unreadable table *by design* — its own docblock says the overlay
should "degrade gracefully (the view falls back to flat cell fills) rather than
crashing", its catch swallows and tries the next candidate location, and every
miss returns `null`. That is correct for the overlay. The importer was a
**second consumer** reading a deliberate "I am blind" as a value.

`migrateLegacyChunkCollision` and `blockRefToCollisionWord` both *did* check
their `0`. The importer was the outlier — which is exactly the shape that makes
a corrected comment useless as a fix. The value was the defect.

## 2. What changed

`src/core/collision/full-block-shape.ts` — `findFullBlockShapeId` is **gone**,
replaced by:

```ts
export type FullBlockShapeLookup =
  | { readonly status: 'found'; readonly shapeId: number }
  | { readonly status: 'no-full-block' }
  | { readonly status: 'no-profiles' };

export function lookupFullBlockShape(profiles: CollisionProfileSet | null): FullBlockShapeLookup
```

Only `found` carries a shape id, so a blind answer cannot be spent as if it were
one, and the two blind answers are different values.

**The `0` sentinel is gone from the whole chain, not just from the producer.**
`importChunks` (`src/core/formats/chunk-mappings.ts`) and
`migrateLegacyChunkCollision` (`src/core/model/chunk-migrate.ts`) used to take
`fullBlockShape: number` and check `=== 0` themselves. Both checked correctly.
They take the result type now anyway: a signature that accepts a bare number is
a signature that accepts a collapsed one, and this is what makes the conflation
*impossible* rather than merely discouraged. The only route to a shape id is a
`status === 'found'` narrowing the compiler enforces.

`src/core/project/aeon/load.ts:833` — behaviour identical (a legacy chunk library
it cannot migrate is still left alone), plus a `console.warn` naming **which**
blindness skipped the migration, guarded on there actually being legacy
collision to migrate. Console rather than a `notices` entry on purpose: the open
path's user-facing behaviour is d-36's to change.

`src/renderer/providers/chunk-library-import.ts` — the importer opens the lookup
instead of spending it, and a new pure exported `chunkImportOutcomeToast(count,
lookup)` decides what the author is told.

## 3. The design call that was mine, and the one that was not

**Not mine, and untouched: whether Import should refuse.** That is d-36
(`docs/decisions.jsonl`, `d-36-air-collision-import`), unanswered, whose own
recommendation is `refuse`. The import still proceeds here.

**Mine: what the importer does in the meantime.** It keeps importing and makes
the toast tell the truth — a `warning` naming which blindness happened and that
every cell came in as air, with the count still in the sentence. Three grounds:

1. **It is the floor of all three of d-36's options, not one of them.** Under
   `refuse` the same sentence becomes the refusal's text; under
   `refuse_and_declare` likewise. Nothing here has to be undone whichever way
   the card goes, and the refusal arm has a named home: `importChunkFiles`,
   before `addChunks`.
2. **It removes the part that is wrong under every answer.** d-36 is about
   *refuse vs warn*. It is not about *claim success vs tell the truth* — nobody
   is going to rule that a silent false success is correct.
3. **It does not add a gesture.** No dialog, no new door, no behaviour change to
   the click. The refusal is the part that changes what the button does, and
   that is the part left alone.

**⚠ The honest caveat, stated because it is the obvious objection.** d-36's
`warn` option is worded as "the success message becomes a warning naming what
happened", and that is behaviourally what now ships. I am not claiming this is
distinguishable from `warn` *in today's behaviour*; I am claiming it does not
**close** d-36, because `refuse` remains a one-site change on top of it and the
sentences are already written for it. If the owner reads this as pre-empting the
card, the revert is `chunkImportOutcomeToast`'s three arms — nothing else in the
parcel depends on which one is chosen.

### What this parcel learned that d-36's card does not yet say

The card asks one question about one situation ("the collision shape data is
missing"). There are **two** situations, and they now have different names:

* `no-profiles` — the project's tables did not load. The author's fix is to the
  project (or to aeon's undeclared well-known path). Refusing here costs nothing,
  which is the case the card's `refuse` recommendation is really about.
* `no-full-block` — a bank loaded and contains no full-block shape. The project's
  collision data is present and *wrong*, or the bank is a legitimate one this
  import has no way to use. Refusing here refuses an author who has collision
  data, on the strength of one missing shape.

They may deserve different answers. **I am not proposing one** — flagging it so
the card can be sharpened before it is ruled, per the brief. I have not edited
`docs/decisions.jsonl`.

## 4. Every other caller of the ambiguous value, and how I enumerated

Two instruments, deliberately of different kinds, because in this repo two
enumerations have agreed and been blind the same way.

**(a) Text search.** `grep -rn 'findFullBlockShapeId'` and
`grep -rn 'fullBlockShape\|full-block-shape'` over all `.ts/.tsx/.mjs/.js/.md`
outside `node_modules`.

**(b) The compiler.** After deleting `findFullBlockShapeId` and retyping the two
writers' parameters, `npx tsc --noEmit` reports *every* remaining caller as an
error. This is a census a grep pattern cannot miss, because it does not depend on
what the call looks like in text.

Both name the same population.

| Site | Reads the value as | Action |
|---|---|---|
| `src/renderer/providers/chunk-library-import.ts:64` | a shape id, unchecked — **the defect** | fixed: opens the lookup, and the toast names which answer |
| `src/core/project/aeon/load.ts:833` | a shape id, checked downstream by `migrateLegacyChunkCollision` | retyped; behaviour unchanged; gains a line naming which blindness |
| `src/core/formats/chunk-mappings.ts` `blockRefToCollisionWord` | checked `=== 0` correctly | takes the result type; the sentinel is gone |
| `src/core/model/chunk-migrate.ts` `migrateLegacyChunkCollision` | checked `=== 0` correctly | same |
| `test/collision/full-block-shape.test.ts`, `test/formats/chunk-mappings-collision.test.ts`, `test/model/chunk-collision-planes.test.ts` | test callers | updated, and split per status (§5) |

**And the wider `collisionProfiles: null` readers**, enumerated with
`grep -rn 'collisionProfiles' src/ --include='*.ts' --include='*.tsx'` — checked
because the ambiguity starts one level above `findFullBlockShapeId`. None of
them is a second instance of the defect: `agent-handler.ts:616`
(`readCollisionRegion`), `MapViewport.tsx:913` (the paint ghost),
`MapViewport.tsx:1457/3976` and `CollisionPalette.tsx:141` and
`canvas/OverlayRenderer.ts` are all **readers** — they render or report, they do
not stamp a shape id into authored data, and `MapViewport.tsx:3976` already
prints `(tables not loaded)` distinctly. *(Read only. `MapViewport.tsx` belongs
to another live parcel and was not touched.)*

## 5. How it is verified

Runner: `npm test` (the whole chain — the `check:*` scripts, `check-*.mjs`,
`npm run typecheck`, then `vitest run`). Every row below is in that chain.

### Aggregates

| | Test Files | Tests |
|---|---|---|
| Before, at master `db894e96` | 560 passed, 3 skipped (563) | 8198 passed, 9 skipped (8207) |
| After, at `41b85a15` | 562 passed, 3 skipped (565) | 8208 passed, 9 skipped (8217) |

Both `rc=0`. The delta is +2 files and +10 tests, which reconciles exactly: 4 new
rows in `chunk-import-collision-answer.test.ts`, 2 in
`aeon-load.fullblock-blindness.test.ts`, and +1 / +1 / +2 in the three existing
files.

### Red-first, one mutation per guard

Every mutation was applied **on disk**, the diff quoted, the run made, and the
baseline restored with `git checkout --` from a **committed** tree (the working
tree was clean before and after each). A guard resting on its neighbour is
discovered the day the neighbour moves, so each two-armed guard was broken **in
both directions separately**.

| # | Mutation (applied, diff quoted in the transcript) | Rows that went red |
|---|---|---|
| 1 | `full-block-shape.ts`: `if (!profiles) return { status: 'no-full-block' }` — collapse the two blind answers back into one | `says NO-PROFILES…`; `the two blind answers are NOT the same value…`; `NO PROFILES LOADED: the chunks still arrive…` (3) |
| 2a | `chunk-mappings.ts`: guard narrowed to `status === 'no-profiles'` | `a NO-FULL-BLOCK lookup…`; `BANK WITH NO FULL BLOCK…` (2) |
| 2b | same guard narrowed to `status === 'no-full-block'` | `a NO-PROFILES lookup…`; `NO PROFILES LOADED…` (2) |
| 3a | `chunk-migrate.ts`: guard narrowed to `status === 'no-profiles'` | `no-ops when a REAL BANK was searched and holds no full block` (1) |
| 3b | same guard narrowed to `status === 'no-full-block'` | `no-ops when NO PROFILES were loaded…` (1) |
| 4a | `chunk-library-import.ts`: `no-profiles` returns the *same sentence* as `no-full-block` | `NO PROFILES LOADED…`; `the two blind sentences are DIFFERENT…` (2) |
| 4b | `chunk-library-import.ts`: **the original defect restored** — plain success toast on every answer | `NO PROFILES LOADED…`; `BANK WITH NO FULL BLOCK…` (2) |
| 5a | `load.ts`: drop the `parsed.some(c => c.collision …)` guard | `NO legacy collision and no profiles: silent…` (1) |
| 5b | `load.ts`: message stops naming which blindness | `legacy collision present and NO profiles loaded…` (1) |

In 2a/2b and 3a/3b the *other* status's row stayed green under each mutation,
which is the evidence that the two rows are proving two things and not one thing
twice.

### The traps this was written against

* **A test that only proves "it refused" cannot say which check refused it.**
  Every blind row asserts the *reason* — `tables did not load` vs `no full-block
  shape` — and one row holds the two sentences against each other. A pair of
  blind answers both producing "a warning" would satisfy a tone-only test and
  would be the same conflation one level up.
* **A single assertion over two operands sharing an upstream agrees with
  itself.** Every "no solid cell" assertion has a control on the *same fixture*
  under a `found` lookup showing it *does* seed solid cells; every "the two
  values differ" assertion asserts each operand is real first. Without that, an
  empty fixture or two `undefined`s pass and prove nothing.
* **Targeted vitest runs do not run the repo's gates.** Three em-dashes (one
  string literal, two test titles) sat green under
  `npx vitest run <files>` and were caught by `check-src-dashes` /
  `check-test-dashes` only under `npm test`. Recorded in commit `b2d776aa`.

### Declared gaps

* **No DOM, so no click.** The tests drive `importChunkFiles` directly. That the
  button reaches it, that `ToastContainer` paints the sentence, and that the
  sentence is legible are not proved here; the wiring lives in
  `src/renderer/components/AeonChunkActions.tsx`. **TAGGED for foreground
  follow-up** (no emulator or CDP was run from this agent).
* **The `no-full-block` arm of `load.ts`'s new console line** has no load-level
  row: it needs a decodable bank on disk containing no full block, which the
  fixture does not build. The guard it rests on is the shared `status`
  narrowing, proved at the unit level and at both writers. Stated in that test
  file's header too.

## 6. Left open

* **d-36 is unanswered and untouched.** What waits on it: whether Import refuses.
  Everything else in this parcel stands whichever way it goes. §3 offers a
  sharpening (the two situations may want different answers); I have not edited
  the card.
* **Aeon's half.** `project.json` declaring no collision bank — so the bank is an
  undeclared well-known path with a second copy one directory up, and nothing
  validates the convention — is aeon's finding and aeon's to fix. It is d-36's
  `refuse_and_declare` option. Nothing here was read from their working tree.
* **Tip SHA** `41b85a15` (plus this packet and the ledger row).
