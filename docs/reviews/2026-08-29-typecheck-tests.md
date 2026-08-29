# O18 — `tsc` now type-checks `test/`, and there is a script that says so

Branch `o18-typecheck-tests`, off master `c498506`.

**The defect.** `tsconfig.json`'s `include` was `["src/**/*"]`. Every "tsc clean" this
repo has ever reported covered the ~290 colocated `src/**/__tests__` files and skipped
all **127 files under `test/`**. It was not theoretical: two days ago a parcel widened
`StampSpec.pri` from `boolean` to the union `BrushPriority`, `npx tsc --noEmit` came
back clean, and three call sites in `test/art/composer-buffer.test.ts` were still
passing booleans. A human found them by reading the file.

Compounding it: there was **no `typecheck` script**, so every caller hand-typed
`npx tsc --noEmit` and inherited the narrow `include` without ever seeing it.

---

## 1. Blast radius (measured before any fix)

Measured with a throwaway `tsconfig.measure.json` extending the base config verbatim —
identical `compilerOptions`, only `include` widened to `["src/**/*", "test/**/*"]`:

| | |
|---|---|
| Test files newly entering the program | **132** (127 `*.test.ts` + 5 helpers/fixtures) |
| Total non-`node_modules` files in the program | 914 |
| **Errors** | **15** |
| **Files with errors** | **10** |
| Distinct error codes | **5** — TS2739 (3), TS2741 (3), TS2322 (3+2), TS2345 (2), TS2352 (2) |

Small enough to fix in one parcel; no staging needed. The number is small because the
289 colocated `src/**/__tests__` files *were* already checked — the gap was one
directory, not the whole test corpus, and that is precisely what made it invisible.

---

## 2. The config decision: **one config**, `test/**/*` added to the existing `include`

`tsconfig.json` `include` is now `["src/**/*", "test/**/*", "*.ts"]`.

**The other option lost on the facts, not on taste.** A separate `tsconfig.test.json`
earns its keep when test files legitimately need different `lib`/`types`/strictness.
These do not:

- **No vitest globals needed.** `vitest.config.ts` sets `globals: true`, but all 127
  files under `test/` import `describe`/`it`/`expect` from `'vitest'` explicitly
  (verified: `grep -rl "from 'vitest'" test | wc -l` → 127). So no `types:
  ["vitest/globals"]` entry, and therefore no reason for a second `types` array.
- **No path aliases.** `vitest.config.ts` defines `@core`/`@shared`, and the base
  tsconfig has no `paths` to match — but **zero** files under `test/` or `src/` use
  either alias (verified by grep). Nothing to reconcile.
- **No `lib` divergence.** Base config omits `lib`, so TypeScript's default for
  `target: ES2022` already includes DOM — which is why the renderer tests resolve
  canvas types today.
- **Nothing runs `tsc` for emit.** `npm run build` is electron-vite; no script, config,
  or CI step invokes `tsc` to produce output. So pulling `test/` into the program that
  carries `outDir` costs nothing.

**The src build did not get looser.** `strict`, `isolatedModules`,
`forceConsistentCasingInFileNames`, `noEmit`-at-call-site — every option is byte-identical
to `c498506`. The whole diff to `tsconfig.json` is the `include` array plus a comment
block explaining why. Not one compiler option was relaxed to reach green, and the 15
errors were fixed on the test side.

Bonus, disclosed: the `*.ts` entry also pulls in root `vitest.config.ts` and
`electron.vite.config.ts`, which nothing checked either. Both were already clean.

**If a test subtree ever does need a weaker option, split it out then.** That is the
condition under which this decision reverses, and it is written in the tsconfig comment
so the next reader inherits it.

---

## 3. What broke, by category

### 3a. Struct literals stale against a field added later (8 errors, 5 files)

The dominant category by a distance. A `src/` type grew a field, `src/` call sites were
updated, and hand-built literals under `test/` were not — because nothing checked them.

| Site | Missing |
|---|---|
| `test/art/usage.test.ts:7` | `Act.sceneRef`, `Act.stripPath` |
| `test/editing/set-sections-command.test.ts:9` | `Act.sceneRef`, `Act.stripPath` |
| `test/editing/zone-commands.test.ts:146` | `Act.stripPath` |
| `test/art/composer-collision-paint.test.ts:48,74` | `MapClipboard.artOnly` |
| `test/collision/collision-cell-resolve.test.ts:113` | `OverlayOptions.showSolidBothPlanes`, `showCrossover`, `showScreenFrame`, `showCameraPreview` |

Fixed by adding the fields with their inert values (`null` / `false`), matching what each
test already asserts. The `OverlayOptions` literal is documented as "both collision
overlays on, everything else off", so the four new lenses are `false` by that rule, not by
guess. `MapClipboard.artOnly: false` is correct for both clipboards: they carry populated
`collisionA`/`collisionB`, which by that type's own contract means the capture was
block-aligned.

### 3b. A read type deliberately wider than the rule it feeds (2 errors, 1 file)

`test/agent/paint-collision-reconcile.test.ts:256-257` passed `readCrossover(...)`'s
`CrossoverRead` (= `Crossover | 'reserved'`) into `isSelfMark(plane, c: Crossover)`.

This is **not** a `src/` bug and the narrower parameter is load-bearing: `layer-transition.ts`
reserves crossover value 3 so that its presence is *a defect somebody must see*, and
`crossover-audit.ts` filters `'reserved'` out before treating a value as a mark
(`const markedA = ca !== 'none' && ca !== 'reserved'`). Widening `isSelfMark` to swallow
`'reserved'` would have answered `false` for it silently — erasing exactly the property
the reserved value exists to preserve.

Fixed test-side with a local `legalCrossover(c: CrossoverRead): Crossover` that **throws**
on `'reserved'`. Not a suppression: it is a real narrowing that makes the test *stronger*
— an illegal 3 now fails loudly instead of passing through a self-mark check that could
never fire on it.

### 3c. Deliberate escape-hatch casts TypeScript wants spelled `as unknown as` (2 errors, 2 files)

- `test/config/s4-config.test.ts:88` — attaches a hypothetical unknown key to
  `config.raw` to prove unmodelled fields round-trip. `S4ProjectConfig` has no index
  signature *because* unknown keys are outside the modelled contract, so the double cast
  is the point of the test, not a workaround. Comment added saying so.
- `test/formats/bg-override.test.ts:281` — builds a `BgOverrideDocument` key-by-key in a
  scrambled insertion order (that is the determinism property under test), so `layout`
  and `tiles` are assigned on later lines. Same treatment, same reasoning, comment added.

### 3d. A test exercising the wrong array width (2 errors, 1 file) — **a real find**

`test/editing/set-collision-edit.test.ts` built `Section.collisionEdit` and
`collisionEditB` as `new Uint8Array(256 * 256)`. Those fields are `Uint16Array | null`:
planes of **16-bit engine attribute words**.

The suite was green because the values the test writes (`40`, `12`) happen to fit in a
byte. So `set-collision-edit` was being exercised against an array width production never
hands it — a false green *inside* a green test, produced by the same missing check. Fixed
to `Uint16Array`; still passes.

### 3e. Placeholder `null`s where a path string belongs (2 errors, 1 file)

`test/config/s4-config.test.ts:76-77` passed `bgLayout: null, bgTiles: null` where
`S4ActConfig` declares both as required `string`. The three sibling literals in the same
file pass real paths; this one was a slip. Fixed to match the siblings.

---

## 4. `src/` findings

**No `src/` change was needed and none was made.** The nearest thing to a real `src/`
defect, flagged here rather than fixed because it is a contract decision and not mine:

> **`S4ActConfig.bgLayout` / `.bgTiles` are typed as required, non-nullable `string`,
> but `src/core/project/aeon/load.ts:379` guards them with `if (actConfig.bgLayout)`.**
> Under `strict` that guard is only reachable for the empty string, so either the guard
> is near-dead or the type should be `string | null` / optional. Real `project.json`
> files should settle it. **Not touched** — it is a `src/` contract change, and §3e's
> test-side fix (use a real path, like the file's three sibling literals do) is correct
> either way.

§3b is the other candidate that turned out **not** to be a bug: the narrow `Crossover`
parameter is deliberate and the test was wrong to lean on it. Worth recording, because
"widen the src signature" was the tempting fix and it would have destroyed a property.

---

## 5. Suppressions added

**None.** No `@ts-expect-error`, no `@ts-ignore`, no `any`, no `skipLibCheck` change, no
excluded subtree. Every one of the 15 errors had a correct fix on the test side.

The two `as unknown as` double casts (§3c) are widening casts in tests that
*deliberately* construct off-contract values, both newly commented with what they assert.
They are not suppressions — they do not hide a class of error, and each still type-checks
everything around it.

---

## 6. The script

```json
"typecheck": "tsc --noEmit"
```

**`npm run typecheck` is the thing to run and the thing to cite.** Future dispatches and
review packets should name the script, not a hand-typed `npx tsc --noEmit` — the whole
defect this parcel closes was a hand-typed command silently inheriting a narrow
`include`.

---

## 7. Red-first evidence — the plant is in `test/`

Reproduced the *original* defect class exactly: put `pri: false` (a `boolean`) back into
`test/art/composer-buffer.test.ts:117`, where `StampSpec.pri` is now the union
`BrushPriority`. That is the literal line a human had to catch by eye two days ago.

**A) the OLD `include` (`src/**/*` only), same planted file — the false green:**

```
$ npx tsc -p tsconfig.oldinclude.json --noEmit
old-include exit=0
```

Silent. This is the bug, demonstrated on the actual defect that motivated the parcel.

**B) the NEW script, same plant:**

```
$ npm run typecheck
> tsc --noEmit
test/art/composer-buffer.test.ts(117,67): error TS2322: Type 'false' is not assignable to type 'BrushPriority'.
typecheck exit=2
```

File, line, column, and the type it violated. Plant reverted; `npm run typecheck` back to
exit 0.

---

## 8. Suite

```
Test Files  414 passed | 2 skipped (416)
     Tests  5637 passed | 7 skipped (5644)
```

The required aggregate exactly — 5,637 passed / 0 failed / 7 skipped. No type fix changed
runtime behaviour; §3d (`Uint8Array` → `Uint16Array`) was the only one that touched a
value's representation and its assertions are unchanged and still pass.

---

## 9. Disclosed gaps

- **`scripts/*.mjs` and `scratchpad/*.mjs` are not type-checked.** They are plain
  ESM JavaScript; checking them needs `allowJs` (plus `checkJs` to mean anything), which
  changes what the program is and is a separate decision with its own blast radius. Named
  here so the gap is disclosed rather than silent.
- **`src/renderer/index.html` and non-TS assets** are outside any of this, as before.
- Nothing is `exclude`d to reach green. The `exclude` array is unchanged from `c498506`
  (`["node_modules", "dist"]`).
