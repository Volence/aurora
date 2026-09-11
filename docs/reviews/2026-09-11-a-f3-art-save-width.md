# A-F3: a GHZ tile save no longer rewrites the art nobody touched, and a save says what its art weighs

**Finding** UX seat A's F3, *"14 pixels in an UNUSED tile rewrote two `.nem` files, +329 bytes of
ROM art, unannounced"* (`docs/reviews/2026-09-07-lens-ux/uxa-walk.md`). Cause determined in
`docs/reviews/2026-09-09-uxpair-findings.md` §4, which recommended **(b) then (c)**. The overseer
ratified that; (a) and (d) were out of scope and were not touched.
**Branch** `parcel/a-f3-art-save-width`, base master `5361cd67`. **Ledger** `A-F3-ART-SAVE-WIDTH`
in `docs/lens-findings.jsonl`.

---

## 0. The short answer

| | what | where it lives |
|---|---|---|
| **(b)** | An art file whose content did not change is no longer written, **as long as something else in the save is**. When nothing else would be written, the art is written exactly as before, so the save contract's `nothing` arm is reached exactly as before. | `src/core/level-classic/s1-io.ts` |
| **(b), the part the packet did not foresee** | The saver counts a skipped art file as landed when it clears dirty domains; otherwise a GHZ tile save would never clear `tiles`. And a file any save has written since the read is never skipped, because the writer's "unchanged" is judged against read-time bytes. | `src/renderer/state/classic-save.ts`, `src/core/project/s1/index.ts` |
| **(c)** | The guarded write reports each landed file's size before and after, read by `stat` in the main process. A classic save's success toast now names each art file's bytes and says `art grew` when one did, raised as a `warning` so it stays up long enough to read. | `src/main/guarded-write.ts`, `src/shared/ipc-types.ts`, `src/renderer/state/classic-save.ts` |

Seat A's case after this parcel: one painted tile in GHZ1 writes **GHZ1 alone**. `8x8 - GHZ2.nem`
keeps its bytes and its mtime, and the author reads, on the toast they already got:

```
Saved 1 level(s) · 1 file: artnem/8x8 - GHZ1.nem · art grew: artnem/8x8 - GHZ1.nem 5727 to 5884 bytes (+157)
```

(Figures from the measurement in §2; on a real save they are whatever `stat` says on that disk.)

---

## 1. What was built

### 1.1 (b): the rule

In `writeS1Level`'s tile branch, each art file's patched copy is compared with what was read. A file
is **deferred** when its copy equals the read AND no save has written it since the read; every other
file is encoded and emitted as before. At the very end of the write, after every other domain:

* if nothing else is being emitted, the deferred art is emitted, exactly as the old writer did;
* otherwise it is left alone and reported in `S1WriteResult.unchanged` (and `WriteResult.unchanged`).

The invariant the save contract rests on, documented on both fields: **`unchanged` is never
non-empty while `files` is empty.** A write with no files still reaches `saveClassicWriteResult` as
`nothing`, so the brief's zero-diff case cannot change.

### 1.2 Two things the tree said that the 2026-09-09 packet did not

**The packet said (b) "touches nothing outside `s1-io.ts`". The tree disagrees.**
`domainsToClear` in `src/renderer/state/classic-save.ts` clears a dirty domain only when EVERY one of
its files landed, and GHZ's `tiles` owns two files. With GHZ2 skipped, `tiles` would never clear: the
dot stays up after every GHZ tile save, and every later save rewrites GHZ1 again and still does not
clear it. So the writer reports what it skipped, and the saver counts `result.unchanged` as landed in
the `saved` and `partial` arms. The `nothing` arm is untouched. A control row pins the other
direction: if the edited file FAILS to land, `tiles` stays dirty even though the other file is
unchanged.

**Naive (b) was also a correctness hazard, not just a size fix.** `pristineTileFiles` is
**read-time** content and no save refreshes it. Paint GHZ1, save, then undo past the save: the
document equals the read again while disk holds the paint, and "unchanged against the read" would
skip GHZ1 and clear the dot with disk and document disagreeing. Today's writer never had this
problem because it rewrote everything. Fixed with `S1ReadState.writtenSinceRead`, filled by the S1
adapter's `updateMtimes` (its keys are exactly the landed paths, which `adapter.ts` now documents).
A file any save has landed is always emitted. A fresh read starts empty.

One consequence stated rather than left to be found: a file Aurora skips is no longer part of the
guarded batch, so an EXTERNAL edit to an untouched GHZ2 between read and save is no longer reported
as a conflict. It is also no longer clobbered. That is the same treatment every non-dirty domain's
files already get.

### 1.3 (c): the save says what the art weighs

* **Main.** `performGuardedWrite` already stats every target twice: the conflict probe, and the
  post-rename stat that reads the new mtime. Each now also yields the size: `before` from the probe
  (null when there was no file), `after` from the post-rename stat, never `bytes.length`. New
  `GuardedWriteResult.sizes`, filled under exactly the condition `newMtimes` is, on full and partial
  batches. Optional only because test fakes predate it. `canvas-file.ts` and `export-sprite.ts`
  ignore it.
* **Renderer.** Built onto the d-38 save feedback (`7475377e`: the classic toast names the files it
  wrote), not a new surface. `savedFilesSentence` gains an optional art clause: every landed ART file
  (the doc's own `tiles` domain, never an extension guess) with its size before and after and a
  signed delta (`+157`, `-20`, `same size`, `N bytes (new file)`), headed `art grew` when any grew,
  `art size` otherwise. The file list is bounded and can fold an art file into "+N more"; the art
  clause is never folded (an act has at most two art files). A landed art file with no measured
  size is left out, never estimated, and a channel that reports none produces the old sentence
  exactly.
* **The look calls, mine to make and made.** Growth raises the toast as `warning` (8 s, a click ends
  it), which is `src/renderer/state/toastStore.ts`'s own tier for a successful gesture's aside that
  has to be read; seat A's complaint was precisely growth that went by unread. A save whose art did
  not grow stays the 2.2 s success. `to` rather than an arrow, `;` between files, and no dash of any
  kind but the minus of a negative delta.

---

## 2. The GHZ reproduction, before and after, measured

Measured on the vendored pin (`test/fixtures/s1disasm`) with a scratch script run against this
tree, not committed. Edit: tile `$30` (the tile seat A painted), first byte, low nibble flipped,
i.e. one byte and two pixels. That is not seat A's 14-pixel X, so the GHZ1 figure differs from the
5894 they measured; the GHZ2 figure does not depend on the edit at all.

| file | on disk | written BEFORE (b) | written AFTER (b) |
|---|---|---|---|
| `artnem/8x8 - GHZ1.nem` | 5727 | 5884 (+157) | 5884 (+157) |
| `artnem/8x8 - GHZ2.nem` | 5031 | 5193 (+162), **no edit in it** | **not written** (5031, same mtime) |
| **art growth for the save** | | **+319 across 2 files** | **+157 in 1 file** |

The "before" column is the old writer's behaviour reproduced by the same encoder call it made: the
edited file's content is identical in both columns, and the untouched file was re-encoded from its
pristine decode. The 5193 matches the zero-edit figure `s1-art-save-width.test.ts` §2 pins and
seat A's own after-size.

What (b) does NOT remove: the +157 on the file that WAS edited. About 154 bytes of that is encoder
overhead a zero-edit re-encode of GHZ1 already carries (5881 against 5727, pinned in the same §2),
so this parcel halves the growth and (c) announces what remains.

---

## 3. The zero-diff save is unchanged, and the evidence is the old code

The brief required the zero-diff save (paint, undo, Ctrl+S) to behave **exactly** as before. The
only honest evidence for "as before" is the same row passing against the old code, so the four
renderer rows of `src/renderer/state/__tests__/classic-save-art-width.test.ts` §1-§2 were run with
the four product files (`s1-io.ts`, `adapter.ts`, `s1/index.ts`, `classic-save.ts`) checked out at
`5361cd67`, then restored from HEAD.

**The first attempt proved nothing.** Two rows went red with
`TypeError: Cannot read properties of undefined (reading 'add')`: my test handle called
`writtenSinceRead.add`, a Set the old reader never creates, so the save crashed after the write
landed and before any assertion. A crashed harness is not a behavioural difference. Fixed in
`0c669706` (`?.add`, and `unchanged ?? []` since the field is documented "absent means none"; both
are no-ops at this tree), then re-run:

| row | at `5361cd67` | at tip |
|---|---|---|
| a tile painted in A sends A alone to disk, and the save clears `tiles` | **red**: `expected [ 'artnem/split-a.nem', …(1) ] to deeply equal [ 'artnem/split-a.nem' ]`, which IS F3 | green |
| CONTROL: when A FAILS to land, `tiles` stays dirty | green | green |
| paint, undo, save: the writer is never called, nothing is written | green | green |
| paint, paint back, save: `tiles` dirty with no diff, both art files written as before | green | green |

Why the literal gesture never reached the writer in the first place: the classic art undo restores
the dirty flags it snapshotted (`writeArtSnapshot` in `src/renderer/state/classicLevelStore.ts`), so
paint then undo leaves `tiles` clean and the save answers `nothing` before any write. The reachable
zero-diff save that DOES reach the writer is paint then paint back by hand (two recorded edits,
`tiles` dirty, no byte different), and that is the row the writer's fallback is proven on.

---

## 4. Rows restated, retired, added

**`src/core/level-classic/__tests__/s1-io.test.ts`, "`<zone> actN` re-encodes every domain
identically".** ⚠ **The tree has 18 of these, not 20** (6 zones times 3 acts, plus one coverage
row). The packet's "20" was these 18 plus the two other rows its naive plant also killed: the (d)
self-check row and the anim-rejection row. Their gate was "the emitted set equals every file of
every dirty domain". Restated, not loosened: emitted and `unchanged` are **disjoint**, their union
equals that same derived set, and `unchanged` equals the act's art paths (derived from the resolved
paths). The art is still round-tripped decode-identical for every act, through a tiles-only write
where the fallback emits it. (b) as stated could keep them honest, so nothing here is BLOCKED.

**The same file's (d) self-check row** now edits one tile per art file (derived from the read's
spans). Without that, a skipped file is never encoded, the broken encoder never runs, and the row
tests nothing: M23 below is the proof.

**`src/core/level-classic/__tests__/s1-art-save-width.test.ts`**, whose header said a fix turning
its rows red is the row retiring:

| old row (reproduction) | now |
|---|---|
| an edit inside file A emits BOTH files | **retired and restated:** emits A alone, reports B unchanged |
| the untouched file is emitted with its content unchanged: a pure re-encode | **retired and restated:** A's emitted bytes are exactly the document's span, edit included |
| a tiles-dirty save with NO tile differing still emits both files | **survived unchanged, now a RULE:** it is the save contract's case |
| §2's four encoder rows | **kept as reproduction rows**: they retire under (d), not (b) |
| new | the other direction (zero-diff tiles plus a written domain emits no art), and a file written since the read is emitted even when it matches the read |

**Added:** `src/renderer/state/__tests__/classic-save-art-width.test.ts` (13 rows: §1-§2 above,
§3 the clause, §4 the save door), 2 rows in `test/main/guarded-write.test.ts`, 2 rows in
`test/main/classic-save-integration.test.ts` (seat A's case on the real files through the real
adapter, with real sizes; and the `writtenSinceRead` wiring through `updateMtimes`).

---

## 5. Red-first, every mutation on disk, every restore from a committed baseline

Each mutation was applied with `sed`, quoted back with `git diff -U0`, run, and restored with
`git checkout --` from the commit named. Every red below was classified `ASSERTION` by the
failure-class reporter; there were no timeouts.

| id | mutation, as written to disk | killed |
|---|---|---|
| M1 | `const untouched = false && bytesEqual(...)` (never defer: the old behaviour) | **24**: all 18 per-act rows, 4 new F3 rows, both GHZ integration rows |
| M2 | `if (false && files.length === 0) {` (no fallback: the packet's naive plant) | **21**: all 18 per-act rows, the RULE row, paint-back-save, and the pre-existing anim-rejection row |
| M3 | ` && !read.writtenSinceRead.has(c.file.path)` deleted | 2: the writer row, integration row 2 |
| M4 | `read.writtenSinceRead.add(p);` removed from the adapter | 1: integration row 2 (the adapter's half, and only it) |
| M5 | saved arm clears on `outcome.written` only | 1: "A alone ... clears `tiles`" |
| M6 | partial arm adds `outcome.failed.path` to the landed set | 1: the CONTROL |
| M8 | art undo keeps `dirty: s.dirty` | 1: paint, undo, save |
| M9 | `before: f.bytes.length` (an estimate) | 3: both main size rows, the GHZ integration row |
| M10 | `after: sizeBefore[f.relPath] ?? 0` (after from the probe) | 3: same three |
| M11 | success return drops `sizes` | 2 |
| M12 | partial return drops `sizes` | 1: the partial size row |
| M13 | `const sizes = {};` (not carried to the orchestrator) | 3: the three save-door rows that expect figures |
| M14 | `landedArtSizes` drops the art filter | 2: the pure filter row, "only art is weighed" |
| M15 | toast type always `'success'` | 1: the growth warning row |
| M16 | `sizes` falls back to `bytes.length` when unreported | 1: the no-sizes CONTROL |
| M17 | growth delta loses its `+` | 2 |
| M18 | head always `art size` | 4 |
| M19 | art clause not appended to the sentence | 4 |
| **M20** | entries joined with an em dash (the backslash-u 2014 escape) | **first run: GREEN, the row's defect.** Every case held ONE art file and the separator only exists between two, so the no-dash row could not see it. Two-entry case added in `635bd69c`; re-run: 1 killed, the no-dash row |
| M21 | the tile patch `span.buf.set(...)` skipped | 2: "A alone", "A's emitted bytes are the document's span" |
| M23 | (test side) the (d) row's new edit loop removed | 1: the (d) row, which is why the edit loop exists |

**Proof method changed twice, and both times the earlier claims were re-established.** The fixture
fix in §3 (`0c669706`) changed the harness under M1, M2, M5, M6 and M8; all five were re-run on that
file at the tip after it, each killing its row again. The M20 fix changed one row only, and M20 was
re-run against the commit that carries it. M3 and M4's rows live in files whose harness did not
change.

---

## 6. Verification

`npm test`, the whole chain (fifteen gate scripts, `npm run typecheck`, `vitest run`), foreground,
vitest's own lines:

| | Test Files | Tests | exit |
|---|---|---|---|
| base `5361cd67` | 600 passed \| 3 skipped (603) | 8962 passed \| 9 skipped (8971) | 0 |
| code-final `635bd69c` | 601 passed \| 3 skipped (604) | 8981 passed \| 9 skipped (8990) | 0 |

`+1` file and `+19` tests, all this parcel's: 13 in the new renderer file, 2 in
`test/main/guarded-write.test.ts`, 2 in `test/main/classic-save-integration.test.ts`, and a net 2 in
`s1-art-save-width.test.ts`. No failures at either end, so no failure class to report.
`npx tsc --noEmit` exit 0 at both ends. The run at the true tip (after this packet and the ledger
row) is in the landing report.

No emulator was touched and no aeon build was needed.

---

## 7. What (a) and (d) would still buy

* **(a)** (skip unchanged art unconditionally, and make the empty write clear its domains). Over
  what shipped it removes only the pathological case: a tiles-dirty save with no byte different and
  nothing else dirty still rewrites every art file (and grows them) exactly as before. With (a) that
  save would write nothing and clear the dot. It costs a change to the save contract's `nothing`
  arm, which belongs to whoever owns that contract.
* **(d)** (a `nemesisCompress` that reproduces the original streams). The real ROM-size fix. It
  removes the +154 or so on the file that WAS edited (§2), which neither (b) nor (c) touches, and
  would retire §2 of `s1-art-save-width.test.ts`. The growth is bounded meanwhile: the goldens pin
  it under 1.10x.

---

## 8. What is open, and what is tagged

* **TAGGED FOR FOREGROUND** (one CDP pass, no emulator): does a classic GHZ tile save's toast render
  as a `warning` carrying the art clause, for its 8 s; and does `8x8 - GHZ2.nem`'s mtime stay put on
  a real disk through the real app. Everything above is held at the store, IPC-core and file layers;
  nothing here observed a rendered pixel.
* **The partial arm's error toast does not carry the art clause**, deliberately: it is about the
  failure, and the files that did land are named there already.
* **Aeon saves are untouched.** This is a classic-writer finding; the aeon toast still names no files
  (open since d-38).
* A note on a gate, not a finding: my comments cited this packet before it existed and
  `check-cited-paths` stayed green. That is declared behaviour (it never judges bare `docs/` paths),
  not a hole.
* **ROADMAP:** no row changes from this parcel that I can name; if the overseer carries A-F3 on a
  row, it closes with this ledger entry.

## 9. Files

| file | what |
|---|---|
| `src/core/level-classic/s1-io.ts` | the deferral, the fallback, `unchanged`, `writtenSinceRead`, the header's tile write contract |
| `src/core/project/adapter.ts` | `WriteResult.unchanged`; `updateMtimes`'s keys documented as the landed paths |
| `src/core/project/s1/index.ts` | passes `unchanged` through; `updateMtimes` records landed paths |
| `src/renderer/state/classic-save.ts` | `unchanged` counts toward clearing; `sizes` carried; the art clause and the warning |
| `src/main/guarded-write.ts` | `before` from the conflict probe's stat, `after` from the post-rename stat |
| `src/shared/ipc-types.ts` | `WrittenSize`, `GuardedWriteResult.sizes` |
| `src/core/level-classic/__tests__/s1-io.test.ts` | the 18 rows' gate restated; the (d) row's edit loop |
| `src/core/level-classic/__tests__/s1-art-save-width.test.ts` | header and §1 restated for the new rule |
| `src/renderer/state/__tests__/classic-save-art-width.test.ts` | new, 13 rows |
| `test/main/guarded-write.test.ts` | +2 rows |
| `test/main/classic-save-integration.test.ts` | +2 rows |
