# What the suite says on a machine without the reference game data

2026-08-29 · branch `o25-fixture-absent-honesty` · Aurora

A large part of this suite measures Aurora against real Sonic 1 and aeon data
that lives outside this repository — `../s1disasm`, `../aeon`. That data is not
vendored and is not on every machine. On a machine without it, each of those
tests has exactly one honest thing to report: **SKIPPED, and here is the file I
could not read.**

This machine HAS the data, which is why none of what follows was visible here.
That is the whole difficulty: the defect could not be seen from inside the
environment the tests are written in.

---

## 1. How absence was simulated

⛔ No peer tree was moved, renamed, modified or written to. Every sibling on this
machine is a live working tree belonging to the owner or another lane.

Absence was produced with a **private mount namespace**: `unshare -rm`, then a
fresh tmpfs over `/home/volence/sonic_hacks` with only this worktree's own
checkout bind-mounted back in. Inside that namespace `../s1disasm` and `../aeon`
**do not exist**; outside it nothing changed, and the arrangement disappears when
the process exits. The runner asserts the absence before starting the suite, so a
mount that silently failed cannot be mistaken for a clean run:

```
ABSENCE CONFIRMED (inside namespace):
  s1disasm does not exist
  aeon does not exist
  ...
  worktree visible at .../worktrees/agent-afd45e6cf0c431ac6
```

**A first attempt got this wrong and the error mattered.** Mounting an empty
tmpfs over each *sibling repo* leaves the DIRECTORY existing. Every guard in this
tree is `existsSync(S1DIR)` on the directory, so none of them fired and the run
reported 194 failures — a picture of a broken suite rather than of an absent
fixture. The corrected lever (remove the directories entirely) reports 59. Both
numbers are real; they answer different questions. See §6.

## 2. Enumerating what touches the data

Three independent enumerations, reconciled — because a clean answer from one
alone is a clean answer to half the question.

| Enumeration | Method | Result |
|---|---|---|
| E1 — by definition | `git grep peer-repo` | 6 test files |
| E2 — by direct path | `git grep /home/volence/sonic_hacks/<repo>` | 44 test files; 37 sites hardcode `s1disasm` |
| E3 — by observed access | `fs` wrapper preloaded before vitest, logging every peer-path read per test | 47 test files |

**Reconciliation.** E3 found 4 files E2 missed (they build the path indirectly:
`s1-object-offsets`, `bg-override-art-injector-gate`, `screen`,
`aeon-json-trailing-newline`). E2 flagged 1 file E3 never saw
(`effects-scene-curve-vsplit` — it only *mentions* a peer path in a comment).
Union: **48 test files** touch the reference data. E2 alone would have missed
four, and E1 alone would have missed forty-two.

E3 is the load-bearing one and it took two attempts. Patching `fs` from a vitest
setup file only reaches `import fs from 'fs'; fs.read…`; vite's SSR interop
**snapshots** a module's named exports on first import and the snapshot cannot be
redefined afterwards (measured: `Cannot redefine property: existsSync`), so every
`import { readFileSync } from 'fs'` was invisible. Preloading the patch with
`node --require`, before vitest boots, fixed it: 45 files → 66 → 47 after
filtering the shared `aurora/node_modules` out of "peer".

## 3. The four defect classes, measured

Full suite, reference data genuinely absent, **before** any change:

```
Test Files  4 failed | 404 passed | 10 skipped (418)
     Tests  59 failed | 5330 passed | 183 skipped (5572)      exit 1
```

| Class | Before | After |
|---|---|---|
| **A** — FAILS instead of skipping | **59 tests**, 1 file | 0 |
| **B** — dies at collection, taking the file | **3 files, 29 tests** | 0 |
| **C** — reports PASSED while unable to reach its subject | **6 tests**, 4 files | 0 |
| **—** — never REGISTERED at all (no pass, no fail, no skip) | **58 rows**, 2 files | announced by 2 reasoned skips |
| **D** — already correct | 183 skipped | 269 skipped |

> The previous session's estimate was "~59 failing, one collection death, one
> silent PASS". The 59 matches exactly. The other two were undercounts: **three**
> files die at collection, and **six** tests silently pass, not one.

### Class A — 59 rows saying "Aurora is broken"

All 59 were in `test/sprite/s1-anim-sweep.test.ts`, and they failed **on
purpose**. Its header said:

> ANTI-VACUOUS: this suite FAILS (never skips) if the tree is missing …

That reasoning was sound when written — a silent skip really was
indistinguishable from a pass. The premise was retired by the skip-report gate
(`50bc78f`), which prints every skip by name with its reason and fails the run
if one cannot say why. So the vacuity the loud red defended against is now caught
by the gate, and the red was left saying something untrue: a machine without a
s1disasm checkout is not a broken Aurora.

### Class B — a skipped `describe` still runs its body

Three files did not fail a *test*; they failed as **files**:

```
FAIL  src/core/anim/__tests__/sonic-animate.test.ts [ …test.ts ]
Error: ENOENT: … open '/home/volence/sonic_hacks/s1disasm/_anim/Sonic.asm'
 ❯ realScripts src/core/anim/__tests__/sonic-animate.test.ts:45:37
```

All three already had a correct-looking guard. **The trap:
`describe(name, { skip: true }, fn)` STILL EXECUTES `fn`.** The option marks the
collected tests skipped; it does not stop collection from running the callback.
A read in a describe body therefore throws during collection, and a throw during
collection is not one red test — it is the whole file and all its coverage.

`beforeAll` does *not* run inside a skipped describe, which is the fix where the
body only reads a value or two. Where the body derives a lot from the fixture,
`describeRequiringFixture` skips the body entirely and leaves one announced row.

### Class C — the finding: 6 tests that could never go red

**This is the class the skip gate cannot see, by construction.** Such a test
never skips, so its failure state and its success state emit the same artifact —
a green row. No reporter, no total, no exit code can tell them apart.

The shape, in four files:

```ts
it('section_4.meta.json round-trips byte-identically', () => {
  if (!existsSync(META)) {
    console.warn(`skipped: sibling aeon checkout not found at ${META}`);
    return;                       // ← a `return` from a test body is a PASS
  }
  …
});
```

The word "skipped" goes to a stream nothing reads. The row lands in the green
column having touched none of its subject, and — the part that matters — **there
is then no input that can ever turn it red.**

| File | Rows | Form |
|---|---|---|
| `test/formats/aeon-json-trailing-newline.test.ts` | 2 | `console.warn('skipped: …'); return` |
| `test/collision/layer-transition.test.ts` | 2 | `console.warn('SKIP (UNMEASURABLE): …'); return` |
| `test/editing/collision-word.test.ts` | 1 | same |
| `src/renderer/…/edit-art-handoff.test.ts` | 1 | bare `return`, no message at all |

**And the two `aeon-json-trailing-newline` rows were worse than "would be
dishonest elsewhere" — they were already dishonest, everywhere, always.** They
located aeon with

```ts
const AEON = resolve(__dirname, '../../../../../../aeon');
```

Six levels up from `test/formats/`. Measured:

```
from .../aurora/.claude/worktrees/agent-<id>  ->  /home/volence/sonic_hacks/aeon   ✓
from .../aurora                               ->  /aeon                            ✗ (does not exist)
```

The hop is calibrated to a **linked agent worktree**. From the main checkout —
the one these tests are normally run from — it resolves to `/aeon`, so both rows
took the absent branch and reported PASSED while measuring nothing, for as long
as they had existed. The only reason they measured anything at all during this
review is that this session runs inside a worktree.

The last row was subtler still: a bare `return` whose comment read
`// tree absent — the render suite already skips`. It delegated its own honesty
to a *different file's* skip, which says nothing about this row's contribution to
the total.

### The fourth, quieter thing — coverage that evaporates

58 rows are generated by `it.each` over lists read off the fixture tree (48 in
`s1-anim-sweep`, 10 in `model.test.ts`). **Over an empty list `it.each`
registers nothing** — not a pass, not a fail, not a skip. The suite total simply
gets smaller, and a total that got smaller looks exactly like a total that was
always that size. `declareUnenumerated` now registers one reasoned skip in their
place.

## 4. The instrument that found Class C

The skip gate cannot find this class, so the instrument watches the **subject
access** instead of the outcome:

> For each test: how many times did it *successfully* read a peer fixture when
> the fixture was present, and what did it report when the fixture was gone? A
> test that read the fixture N>0 times and still reports `passed` with the
> fixture absent did not measure the fixture.

This is `fs`-level tracing (§2, E3) crossed with the per-test statuses of two
full runs.

**It returned an empty set twice before it returned the finding, and neither
empty set meant "no such tests".** First: per-test attribution missed reads made
in `beforeAll` or at module scope, where there is no current test. Second: the
JSON reporter joins describe/test names with a **space**, while
`expect.getState().currentTestName` joins with **` > `** — every key lookup
missed, and the instrument reported a confident clean bill of health. Both were
diagnosed rather than accepted; the instrument now prints its key-overlap count
so a zero-overlap run announces itself instead of looking clean.

**Two candidates it raised are NOT defects, and were ruled out rather than
reported.** `object-sprite.test.ts` and `object-sprite-pri.test.ts` each show a
*pure* test credited with fixture reads, because `currentTestName` persists after
a test ends and the next block's `beforeAll` runs under the finished test's name.
Checked against the absent-run trace: neither test attempts any peer access under
its own name, and both files skip correctly. Stale attribution, not a silent pass.

**Do other tests share the shape, and how was that checked?** Two ways. (a) The
trace differential above, over the whole suite — it found exactly the six, plus
the two ruled-out artefacts. (b) A syntactic sweep for the idiom, which also
found the six and additionally two `if (!existsSync(abs)) return;` sites in
`classic-surface.test.ts` and `classic-placement.test.ts` — both inside directory-
walking *helpers*, not test bodies, so an early return there is not a fake skip.
Neither method alone found everything: (a) misses a test that would be silent but
whose fixture happens to be unreachable in both runs; (b) misses any form not
matching the regex. They agree, which is why the count is reported as six.

## 5. What changed

Shared mechanism: **`test/support/fixture-tree.ts`**. It derives the sibling root
(reusing `peer-repo.ts`'s `siblingRoot`, so there remains exactly one derivation)
and builds skip reasons that **name the exact file** — the point of routing these
through one helper is consistency of form, never anonymity:

```
SKIPPED, NOT PASSED: cannot measure aeon's on-disk section_4.meta.json —
/home/volence/sonic_hacks/aeon/games/sonic4/data/editor/ojz/act1/section_4.meta.json
is absent on this machine, so this row measures nothing
```

| Commit | What |
|---|---|
| `2162641` | Class C — six tests now `ctx.skip()`; the six-level relative hop replaced with a derived path |
| `f24d482` | Class B — three collection deaths; `beforeAll` / `describeRequiringFixture` |
| `de97aba` | Class A — 59 rows now skip; 58 unenumerated rows announced |
| `77ad16c` | New gate `scripts/check-pseudo-skip.mjs` + wiring test |

**The gate.** Because Class C is invisible in a run's output, the only place the
difference survives is the source — so it is a static pass, wired into
`npm test` **before** vitest. Since vitest running does not run it,
`test/config/pseudo-skip-wiring.test.ts` guards the one line that invokes it.

*Red-first, on the real defect rather than a plant.* Run against the four files
at their pre-fix revision `1e7c288`:

```
check-pseudo-skip: FAIL — 9 test body/bodies RETURN instead of skipping.
  src/renderer/…/edit-art-handoff.test.ts:422  [SILENT]
      if (!existsSync(join(S1DIR, 'palette/Title Screen.bin'))) return;
  test/collision/layer-transition.test.ts:198  [ANNOUNCED]
      console.warn(`SKIP (UNMEASURABLE): peer repo 'aeon' not present …`); return;
  … 7 more                                                          exit 1
```

*The alternative green path, ruled out rather than assumed away.* The gate only
examines text inside an `it(...)`/`test(...)` call. If that matcher stopped
matching, it would examine nothing, find nothing, and print a clean bill of
health with "419 files scanned" still on screen. So the number that must be
non-zero is **bodies**, and it is checked, not merely printed. Proved by breaking
the matcher on purpose:

```
check-pseudo-skip: scanned 0 test bod(y|ies) in 418 file(s).
check-pseudo-skip: COULD NOT MEASURE — … Nothing was examined, so this run is
  NOT evidence that no test fakes a skip.                            exit 2
```

An unreadable root is exit 2 too, proved the same way. The wiring test was
proved red-first by unwiring the gate: 2 of its 4 rows fail, and the two
anti-vacuous rows stay green, which is the correct signature.

## 6. Result — the property, both ways

| | Test files | Tests | Exit |
|---|---|---|---|
| Data present, before | 416 passed, 2 skipped (418) | 5652 passed, 7 skipped | 0 |
| **Data present, after** | **417 passed, 2 skipped (419)** | **5656 passed, 7 skipped** | **0** |
| Data absent, before | 4 failed, 404 passed, 10 skipped | **59 failed**, 5330 passed, 183 skipped | 1 |
| **Data absent, after** | **407 passed, 12 skipped (419)** | **0 failed**, 5332 passed, **269 skipped** | **0** |

Absent-run report: `0` FAIL lines, `0` "NO REASON GIVEN",
`skip-report: OK — every skip named its reason`, and
`check-pseudo-skip: OK`. The present-run totals are unchanged apart from the new
wiring test (+1 file, +4 tests) — no coverage was traded for the green.

Every test still missing from the absent run relative to the present one is
accounted for: 58 unenumerated `it.each` rows (now announced by 2 reasoned
skips) and 6 rows inside the one block that is skipped whole.

## 7. Left open

1. **A PARTIAL checkout is still not honest — 27 files, 135 failures.** Every
   guard in this tree tests `existsSync(<dir>)`, i.e. directory existence. A
   directory that exists but is empty or incomplete defeats all of them. Measured
   after these fixes: 27 files fail, 135 tests fail, 1 file still dies at
   collection (`priority-mask.test.ts`). This is better than before the work
   (30 files / 194 failures / 4 collection deaths) but it is *not closed*, and it
   improved only as a side effect. Closing it means ~24 files checking a
   representative FILE rather than the directory. Distinct scenario, distinct
   parcel — a broken clone, not a machine without the data.
2. **37 hardcoded `/home/volence/sonic_hacks/…` literals remain.** They are
   *honest* under absence (they skip), but they can only ever skip on any machine
   but this one, so those rows are unrunnable elsewhere by construction. Not
   churned here: converting them is a large mechanical diff with no bearing on
   the property this branch establishes.
3. **These rows read a peer's LIVE working tree.** Booked separately in
   `docs/reviews/2026-08-28-golden-live-tree.md`; untouched here. Making absence
   honest is not the same as making presence well-defined.
4. **A latent vacuity next door, found in passing and not fixed.**
   `s1-open-refusal.test.ts`'s row *"animations stay ABSENT — the sonani dialect
   is not parsed (honest empty timeline)"* asserts an ABSENCE
   (`characterAnims` equals `[]`) and, unlike its sibling row, never checks
   `openDiscoveredSet`'s return value. It skips correctly when the fixture is
   gone, so it is in scope for nothing here — but it would pass just as happily
   if the open failed for any other reason.
5. **Nothing was confirmed at runtime in the app or an emulator**; no emulator
   tool was called. Nothing in this branch touches shipped code — the diff is
   tests, one test-support module, one gate script, and `package.json`.
