# THE DOOR TO A DIRTY LEVEL DOCUMENT

**Branch** `parcel/dirty-doc-door`, base master `b7565c05`.
**Source** `docs/reviews/2026-09-10-cdp-sweep.md` §5 (`S2`, `S3`) and its recommendation 2:
*"S2 and S3 need a route to a dirty level document that this harness does not have."*

**No emulator was touched.** No `mcp__oracle__*` tool was called at any point.
**No CDP harness was run** — that is the overseer's, in the foreground, and §7 says exactly
what state the rows are left in.

---

## 0. The one thing to read if you read nothing else

> **The door does not set a dirty flag, and the row that would have caught it if it did is
> the UNDO row.**
>
> A door that flipped `dirty` would dirty the document too. It would pass the byte rows if it
> also poked the doc. What it could not do is record a history entry, because history is
> recorded by `commitLayout` — so *"exactly ONE undo step, and undoing restores the byte AND
> clears the domain"* is the row that separates "the app's own path ran" from "something set a
> boolean".
>
> This is not theory. **Mutation M1 is that exact degradation, applied on disk**, and under it
> the byte rows and the dirty rows stayed **GREEN** while the undo row and three source guards
> went red. The rows that look like they are about dirtiness are the ones that cannot see the
> difference; that is why they are not the guard.

---

## 1. What changed

| file | what |
|---|---|
| `src/renderer/debug-level-edit.ts` | **NEW.** `chooseLayoutStamp` (pure) + `stampLayoutCell` (the door). |
| `src/renderer/debug-hooks.ts` | `ClassicProbeApi.stampLayoutCell`, a one-line delegation. |
| `src/renderer/__tests__/debug-level-edit.test.ts` | **NEW.** 20 rows: behaviour, refusals, six source guards. |
| `scratchpad/cdp-sweep-panels-harness.mjs` | `S2a` becomes `S2a1`/`S2a2`/`S2a3`; the dirty gesture is the door. |
| `docs/lens-findings.jsonl` | 2 appended lines (`LEVEL-DIRTY-DOOR-BUILT`, `SWEEP-S2A-READ-THE-AEON-DIRTY-FLAG`). |

| SHA | subject |
|---|---|
| `dd071ba9` | the door + 15 rows |
| `920c884e` | split the door's source guard into four rows (see §4.1) |
| `1e84ab91` | split the probe's delegation guard for the same reason |
| `8c7b06eb` | the harness rewire, and one corrected claim |

---

## 2. Which public action, and why that one

**`classicSetLayoutCells(plane, cells)`** — `src/renderer/state/classicLevelStore.ts:889`.

It is the function **a person's stamp gesture ends in**. `ClassicLevelViewport.tsx:1443`, inside
`endStroke` ("Commit the stamp gesture as ONE undoable command"), flattens a whole
press-move-release into exactly one call of it. The door passes the same argument shape to the
same function, so everything downstream of the mouse is the app's own path:

* one `commitLayout` → **one undo entry** on the act-scoped layout stack,
* the **real dirty domain** (`fg`), which `core/level-classic/s1-io.ts:549` routes to
  `read.paths.fg` on the next save — so the save writes a real file and the toast has a real
  name to print,
* the same `structuralError` validation, the same bounds and pool checks.

**Why a layout cell and not something smaller.** One stamped chunk-id byte is the smallest edit a
person can make on a classic act. It needs no art pool, no editable-tile range, no palette source,
no placed object. It is one byte in an uncompressed file whose codec round-trips byte-identically
(`core/formats/classic/s1-layout.ts` — `cells` is the literal payload precisely so
`encode(decode(b))` is exact), so a save actually persists it. Every alternative costs a
precondition: an object move needs a placed object, a tile write needs an editable tile outside
the reserved set, a palette write needs a palette source on disk.

**Why not reach past it.** `debug-hooks.ts:87` already states the rule for this class —
*"classicPaintSurface stays the ONLY way pixels get committed"*. This follows its spirit rather
than inventing a second policy.

### 2.1 What the door does NOT prove

**It does not prove a pointer gesture on the classic canvas reaches
`classicSetLayoutCells`.** The arming and the drag are unexercised. A defect between the mouse and
that call is still invisible to `S2b`/`S3c`, and the harness says so in the block itself. Arming
`ClassicLevelViewport`'s paint tool from outside remains a door no instrument in this repo has —
that part of the sweep's §5 is **unchanged**, not solved.

---

## 3. Verification

**Runner:** vitest, through `npm test` (which is `check:*` chain → `npm run typecheck` → `vitest run`).

### 3.1 The full aggregate, not a tail

```
Test Files  1 failed | 596 passed | 3 skipped (600)
     Tests  1 failed | 8927 passed | 9 skipped (8937)
  Duration  23.16s
```

**Load beside it, both ends, because this box is shared:** `4.38 / 6.86 / 10.06` at start,
`20.42 / 10.57 / 11.14` at end, on 16 cores. Wall time for the whole `npm test` chain: **50s**.

⚠ **THE ONE FAILURE IS NOT MINE, AND I CHECKED BOTH SIDES MYSELF RATHER THAN ASSERTING IT.**
`test/formats/aeon-vsram-mode-drift.test.ts` → *"games/demo/config/game.emp at aeon
1e6946fbfa3ab0f314a8946a018b9230f500cbe6 declares no SCANLINE_CAPS"*. I ran that file **on this
branch** and **on the parcel's base `b7565c05`**: `1 failed | 4 passed` both times, byte-identical
message. It is a cross-repo drift row about the aeon sibling's `games/demo` config and it was
already red when this parcel started.

### 3.2 The 20 rows

`src/renderer/__tests__/debug-level-edit.test.ts`, `20 passed (20)`.

`chooseLayoutStamp` (pure) — 4 rows: picks a byte that DIFFERS on both planes; picks air when the
cell holds a real id; picks a cell inside the writable region the store enforces; refuses rather
than guessing when no legal different byte exists.

`stampLayoutCell` (the door) — 8 rows: changes a real byte and reports the byte it read back;
dirties the level document naming only the domain it edited; **records exactly ONE undo step, and
undoing restores the byte AND clears the domain**; targets `bg` independently; defaults to `fg`;
refuses with no level open and dirties nothing; refuses with no legal byte and dirties nothing; a
second call is still a real change.

Source guards — 8 rows, six of which read files the door does not own or does not consist of.

---

## 4. Red-first, with every mutation shown on disk

Baseline **committed first** (`dd071ba9`, then `1e84ab91`), every mutation applied to a clean
tree, every restore `git checkout HEAD -- <path>` from that committed baseline, and
`git status --short` printed empty after each.

| # | mutation, as it sat on disk | rows red |
|---|---|---|
| **M1** | **the degradation this parcel exists to refuse.** The commit replaced by `useClassicLevelStore.setState({ doc: …nextGrid…, dirty: { …, [plane]: true } })` — flag flipped AND bytes poked, so it dirties the document for real | **4**: the undo row, `commits with classicSetLayoutCells`, `never calls setState`, `never assigns a dirty flag` |
| **M2** | `ClassicLevelViewport.tsx:1443` `classicSetLayoutCells(plane, cells)` → `commitStampCells(plane, cells)` | **1**: `the viewport's own stamp gesture still ends in the same call` |
| **M3** | `const to = from !== 0 ? 0 : 1;` → `const to = from;` (stamp the byte already there) | **8** |
| **M4** | `if (bound < 1)` → `if (bound < 0)` (drop the empty-grid refusal) | **1**: `refuses, rather than guessing, when no legal different byte exists` |
| **M5** | the probe member rewritten as a block body, so it is no longer the delegation shape | **1**: `the probe member is a delegation, not a second copy of the commit` |
| **M6+M7** | the import aliased to `doorStamp`, plus a live `classicSetLayoutCells('fg', [])` planted in `debug-hooks.ts` | **3**: all three debug-hooks guards |

Each mutation was verified on disk before its run — `git diff --stat` plus the mutated line
quoted with `grep`/`sed` — because an unapplied mutation and a correctly restored baseline are
the same artifact: both print `ok`.

### 4.1 A green under M1 that was a defect in my own rows, not a pass

The first M1 run reddened **2** rows, not 4. Both missing guards were real and both were
correct — they were in the **same `it` as an assertion that failed first**, and vitest aborts a
row at the first failure. Two guards that would have caught the mutation were never evaluated,
which on the report is indistinguishable from two guards that do not exist.

Fixed by splitting one row into four (`920c884e`), then finding the identical shape in the
probe's guard and splitting that too (`1e84ab91`). **M1 then reddened 4**, and M6+M7 reddened all
three of the probe's guards independently. This is the "a green mutation can mean the row that
should have caught it does not exist" hazard, and it was mine.

### 4.2 What stayed GREEN under M1, and why that is the finding

Under the degradation, these passed: *changes a real byte*, *dirties the level document naming
only the domain it edited*, *targets bg independently*, *a second call is still a real change*.
All four are true statements about a door that reached past the boundary. **A parcel that shipped
only those rows would have had a green suite over a door that proved nothing about `S2`.**

---

## 5. A finding, found by grounding rather than by running

**The sweep's `S2a` watched the wrong store.** It read
`window.__dbg.aeon.state().dirty` on a **classic** act, and its comment called that *"the editor
store's LEVEL flag"*.

* `useEditorStore.dirty` is written by `markDirty`, which keys on `useProjectStore`'s
  `currentZoneId`/`currentActId` — **the aeon project's act** (`editorStore.ts:889`).
* A classic act's dirtiness is `useClassicLevelStore.dirty`.
* `shell/dirty-snapshot.ts` reads the two as **separate fields**, `aeonDirty` and `classicDirty`,
  and `SaveChip`'s `tabHasDirtyDot` consumes both.

So `S2a` had **two independent reasons** to stay false on its classic subject: the stroke painted
nothing, *and* the flag it watched belongs to the other engine.

⚠ **This does not overturn the sweep's verdict, and I am not claiming it does.** `UNMEASURABLE`
was correct, and its stated reason (*"saying FAIL would put a defect on the app that this run has
no evidence for"*) was correct. What changes is what a reader should conclude from the four-route
table: the fourth route's named symptom (`tool` stuck at `view`) was **not the only thing** between
it and a green, so "fix the tool arming and S2 measures" would have been a wrong prediction.

The claim is **corrected in place** in the harness rather than deleted, the aeon flag is **still
read and printed** so a reader watches it stay false instead of taking the sentence on trust, and
the row now predicates on the classic store's own bytes and on the app's own chip tooltip.

---

## 6. The harness rows, as rewritten

`S2a` becomes **three rows, not one with three clauses**, for the reason §4.1 measured:

| row | what it asks | witness |
|---|---|---|
| `S2a1` | the door made a real level edit through the app's own commit path | the door's own report |
| `S2a2` | **ANTI-VACUOUS** — a real byte changed, **read back out of the document** (`from → cellAfter`, `dirtyBefore → dirtyAfter`) | the classic store |
| `S2a3` | **and the APP agrees on screen**: the chip's tooltip goes `Nothing to save in this document` → `Save this document (Ctrl+S). Save All is Ctrl+Shift+S` | `SaveChip`, reading `canSaveActive` — the same predicate its click uses |

`S2a3` exists because believing `S2a1` alone would make the door the only evidence for the door.
Its **before-read is taken on the classic subject**, not borrowed from `S1`'s aeon tab — a
transition asserted across two documents is not a transition. And it reports **UNMEASURABLE, not
FAIL**, when the before-state is not `Nothing to save`: an act that arrives already savable is not
a defect in the chip, and a red would say it was.

A **census of every `Save`/`Saved!`-shaped button on screen** (text, title, rects, disabled) is
printed beside it. It is deliberately **not predicated on**: if the classic side turns out to
carry a second Save-shaped control, that has to be visible to a reader rather than silently
deciding which button these rows were about. See §8.

`S2b` and `S3c` are **unchanged in wording and predicate**. Only their precondition changed.

---

## 7. What state to expect the rows in when you run them

`AEON_DIR=<copy> CLASSIC_DIR=<copy> npm run harness:cdp-sweep-panels`, on a
`VITE_AURORA_DEBUG=1` build.

* `S1`, `P4`–`P7` — untouched by this parcel; expect the sweep's verdicts.
* `S3a`, `S3b` — untouched; they gate on the classic project opening and an act reaching `ready`.
* `S2a1`, `S2a2` — **should PASS.** These are the door, and the door is unit-proven. If `S2a1`
  fails with `threw:`, `window.__dbg.classic.stampLayoutCell` is absent, which means the tree
  under test is not this branch's build — check `announceRunRoot`'s line before reading anything
  else into it.
* `S2a3` — **should PASS**, and is the one row here I could not fully pin from source. It depends
  on which Save-shaped control the `CHIP` selector lands on with a classic act open, and this
  parcel ran nothing. If it comes back `UNMEASURABLE`, the before-tooltip was not
  `Nothing to save in this document` and the printed census says what was on screen.
* `S2b`, `S3c` — **genuinely open questions, and the point of the parcel.** Either verdict is
  information now, which is what `UNMEASURABLE` was denying. `S3c` asks for a file path in the
  sentence, i.e. `Saved N level(s) · … file(s): …` matching `/\.(nem|bin|json)\b/`; the `fg`
  domain writes the layout `.bin`, so a green is due if `savedFilesSentence` is wired.

⚠ **A red on `S2b` or `S3c` is now an app verdict, where before it would have been a harness
limit.** That is the whole trade this parcel makes, and it only holds because the edit goes
through `classicSetLayoutCells`.

---

## 8. Open, with reasons

1. **The gesture is still not exercised** (§2.1). `S2b`/`S3c` are about everything downstream of
   the mouse. Arming `ClassicLevelViewport`'s paint tool from outside is unsolved and this parcel
   did not attempt it.
2. **The chip census on the classic side is unknown to me.** I could not enumerate what
   `Save`/`Saved!`-shaped buttons are on screen with a classic act open without running the app,
   so `S2a3` predicates on the `CHIP` selector the sweep already used and *prints* the census
   rather than asserting a count. Marked here rather than guessed at.
3. **`test/formats/aeon-vsram-mode-drift.test.ts` is red on this branch and on its base**
   (§3.1). Not this parcel's, not fixed here, and named so it is not read as mine.
4. **Nothing in `src/` outside the two debug files was changed.** No product behaviour moved.

---

## 9. Gates

Run individually, each exit code read directly rather than after a pipe.

| gate | exit |
|---|---|
| `check:src-dashes` · `check:test-dashes` · `check:scripts-dashes` | **0** |
| `check:test-collection` · `check:pseudo-skip` · `check:object-stringify` | **0** |
| `check:doc-citations` · `check:cited-paths` | **0** |
| `check:prose-constants` · `check:peer-path-literals` · `check:harness-guards` | **0** |
| the whole `npm test` chain | **1**, on §3.1's pre-existing cross-repo row alone |

⚠ **`check:cited-paths` came back 0 in a linked worktree, where the previous parcel recorded
COULD NOT MEASURE.** That parcel symlinked `node_modules` itself, and `git check-ignore` then
refuses every path under it (*"beyond a symbolic link"*, exit 128). Here `node_modules` is a
**real directory whose entries are symlinks** into the main checkout, so no queried path crosses
a symlink and the gate's own exit-0 self-test probe answers normally. Recorded because it is a
cheap fix for a recurring worktree artifact, not because it says anything about this parcel's
files.
