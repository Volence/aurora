# O48b — the two wholesale destructive collision buttons, pressed

**Branch** `test/o48b-collision-destructive` · **Instrument**
`npm run harness:collision-destructive` (26 rows, registered)
**Environment** `ELECTRON_BIN` = the main checkout's `node_modules/.bin/electron`;
`AURORA_BUILT_TREE` = this worktree; `VITE_AURORA_DEBUG=1 npm run build`;
xvfb-run `1680x1050x24`; **dpr = 1**. Clear's button rect `33.90625x17` at
`1249.125,217` → integer client `(1266,226)`; Reset's `36.125x17` at
`1209,217` → `(1227,226)`. Every aim rounded to an integer and verified with
`elementFromPoint` before it was sent; the helper REFUSES rather than clicking
whatever is underneath.

**The answer, up front: I pressed both, and both do what they claim.** No
defect in either writer. Three findings below are about the surface around
them, and all three are design calls rather than bugs — which is why none of
them was touched.

## What each button actually does — measured

Section 0, plane A, of the real aeon project (OJZ act 1, 3x3). One plane is
`SECTION_TILES_WIDE * SECTION_TILES_HIGH` = **65536 words**, derived from
`s4-types.ts`, not typed. Owned/unowned come from the app's own
`collisionWordMasks()` → **`owned=0x3fff unowned=0xc000`**, and the fixture
value `0xc000` is the complement itself, authored into four cells (two over
existing content, two over empty ones) with `collisionPoke` and re-read before
any button was touched. `[f0]` measured the thing that makes that authoring
necessary: **1792 of 65536 cells carry a shape and ZERO carry unowned bits**, so
a row that painted over real content would be a coin that always lands heads.

| | **Clear** | **Reset** |
|---|---|---|
| owned bits | every cell of the plane → `0` (1792 → **0** non-zero, `[c1]`) | every cell → the engine baseline (1794 changed, `[r1]`) |
| unowned bits | **destroyed** — the four authored cells read `0x0000` (`[c2]`) | **destroyed** — `0xc000` → `0x0000` (`[r2]`) |
| other plane | untouched (`[c3]`) | untouched (`[r4]`) |
| other section | untouched (`[c4]`) | untouched (`[r5]`) |
| confirmation | **none** — one click, already done (`[c5]`) | none |
| undo | **one** Ctrl+Z, plane exact incl. unowned (`[c8]` `[c9]`) | one Ctrl+Z, exact (`[r8]`) |
| commands pushed | exactly one (`[c10]`) | exactly one across two presses (`[r9]`) |

Both destructions of unowned bits are the **documented, decided** behaviour —
`collision-word.ts` argues Clear is the one gesture whose stated intent is the
whole cell, and Reset's discard is unavoidable because aeon's `bake_plane_cell`
interns on `(heights, angle, solidity)` and there is nothing in baked data to
revert those bits *to*. Both are undoable, and the undo restores the full
sixteen bits because `oldColl` captures them.

**One measurement worth having beyond the question asked:** on this project the
engine baseline for section 0 plane A resolves to **all zeros**, so Reset and
Clear produce the *same* result here (`after Reset: 0 non-zero`). The 1792
authored cells live in the saved `.collattr` sidecar, not in the baked strips.
That is not a defect, but it means an author who reaches for Reset expecting
"back to the engine's collision" gets an empty plane on this act.

## Undo, per button

Both: **one step**, and the step is exact. `[c10]` and `[r9]` pin it from both
sides — `canUndo` goes `false → true` on the click and `true → false` after a
single Ctrl+Z, so neither button pushes two commands or a partial one.

`[c8]` presses that Ctrl+Z **without moving focus off the button**, which is the
sequence a person is actually in (click Clear, see the section go blank, hit
Ctrl+Z). It works: `LevelWorkspace`'s `isTypingTarget` exempts `<button>`
deliberately, and this measures that exemption rather than reading it.

`[r3]`: Reset's discard is **not silent**. The toast fires with the exact count
—"*Reset collision A: the engine baseline cannot carry the reserved bits on 4
cells, so they were discarded. Undo restores them.*" — and `[r8]` proves that
last sentence true.

## Wording against reach

Both tooltips are accurate and neither understates its reach.

- Clear — *"Erase ALL collision in section 0 (this plane) — undoable"*. Names
  the section that changed (`[c6]`), claims ALL, and the measured reach is
  exactly all 65536 words of one plane of one section (`[c7]`).
- Reset — *"Reset section 0 collision (this plane) to the engine baseline —
  undoable"*. Names the section that changed (`[r6]`).

**The one wording gap, and it is small.** Neither says that the LOOP CROSSOVER
field goes with it. Bits 15:14 are the crossover value the palette's own **Loop**
row authors, so an author can set a hand-off with one control and lose it to a
button whose words never mention it. Clear's "ALL collision" arguably covers it
and Reset's toast names "reserved bits" after the fact. Both are undoable in one
step, so this is a wording call, not a data-loss risk. **Not touched.**

## Can either fire without the author meaning it?

- **No stray global key path.** `[k1]` sends Delete, Backspace, Enter, Space,
  Escape, x, Alt+Delete and Ctrl+Delete **one at a time**, with focus proved to
  be on `BODY`, and measures the plane after each. None reaches either writer.
  The positive control for that green is that the same
  `Input.dispatchKeyEvent` channel delivers the Ctrl+Z `[c8]`/`[r8]` measure.
- **One path, and it is the platform's.** After a real click the button keeps
  keyboard focus (`activeElement` = the Clear `<button>`, measured), and a bare
  **Space** re-fires the wholesale wipe with no confirmation. **Enter did not**,
  over this input channel — the two were measured separately, because "a
  keystroke re-fires it" without naming which is how a finding gets waved away.
  `[k2]` asserts the thing that decides how bad it is: the keyboard-fired wipe
  is exactly as recoverable as the clicked one, one Ctrl+Z, plane whole.
- **A second consecutive press is completely silent** (`[r7]`). The plane is
  already at the baseline, `resetToEngine` takes `if (!entries.length) return`,
  and nothing changes, nothing toasts, no phantom undo step is pushed (which is
  the correctness half, and it is green). The author cannot tell "already at the
  baseline" from "the click did not register". The same early return fires on
  `!engine` — a plane with no baseline at all — which is why this parcel added
  the read-only `collisionBaseline` hook: from outside the app those two are the
  same event.

**None of this was fixed.** A confirmation on wholesale writers, blurring after
a destructive click, and a signal on the no-op press are all design calls.

## Red-first

Every plant applied on disk, the **built bundle grepped to prove it arrived**,
the harness re-run, the file restored with `git checkout` from `b7a5b388`.

| Plant | In `dist/` | Result |
|---|---|---|
| P1 `clearCollisionEntries` preserves unowned bits instead of writing 0 | `newColl: oldColl & COLLISION_CELL_UNOWNED_MASK` | **[c1] [c2] [c5] [c7] RED**, 22/26 |
| P2 `resetToEngineEntries` stops counting discards (`+= 0`) | `… === 0) discardedUnownedCells += 0;` | **[r3] RED alone**, 25/26 |
| P3 Clear's tooltip drops "ALL" and the plane clause | `Erase collision in section ${activeSection} — undoable` | **[c7] RED alone**, 25/26 |
| P4 Clear's command records the OTHER plane | `plane: p === "a" ? "b" : "a"` | **[c1] [c3] RED**, 21/26 |
| P5 Clear's command targets `activeSectionIndex + 1` | `sectionIndex: ed.activeSectionIndex + 1` | **[c4] RED** (after the fix below), 21/26 |

`[c8]`/`[c9]` stay green under P1 by design — they measure the undo round trip,
which a wrong `newColl` does not damage. That is what makes them controls
rather than duplicates of `[c2]`.

### The vacuous row, found by its own plant and FIXED

**P5 went GREEN the first time.** A plant that pointed Clear's command at the
**wrong section** — the worst thing either button could do — did not move
`[c4]`. The command carries the entry list built from section 0, so it only
touches indices section 0 has content at, and section 1 held ZERO at every one
of them: a write that landed in entirely the wrong section destroyed nothing
measurable and the row was satisfied by an absence.

The fix is the rule the preservation rows already obey — the **control
destination is authored too**. Section 0 plane B and section 1 plane A now carry
`0xc000` at the same fixture indices, so a mis-targeted apply has something to
destroy. P5 re-run is **RED**. This is stated in the harness header, not a
footnote.

### And one row that was wrong in the other direction

The first `[k1]` focused `#map-canvas` and called that "focus is off the
buttons". A `<canvas>` has no tabindex, so `.focus()` is a no-op: focus stayed
on the **Reset** button the previous phase had clicked, and the Space in the key
set re-fired *it* — 1794 cells, exactly `[r1]`'s own count. The row went red on
a feature that was fine. It now proves where the focus is before it sends
anything and sends the keys one at a time, so a red names the key.

## Runnability

**Registered in `package.json` in the same commit as the file**
(`harness:collision-destructive`). Three consecutive clean runs on the restored
tree: **26/26, 26/26, 26/26**.

One row is **conditional and did not execute here**: `[n1]`, Reset on a plane
with no engine baseline. Section 0 plane B *has* a baseline (65536 bytes), so
the phase prints "not applicable" and adds no row. It cannot go falsely green —
it emits nothing — but it is unexercised, and that is said here rather than
discovered later.

`npm test` — **465 files passed, 2 skipped; 6432 tests passed, 8 skipped**,
every skip naming its reason. Identical to O48's totals.

## Scope

**Only Reset and Clear.** O48 also named brush size, Flip H/V, the Floor
solidity chips, the kind filter tabs and Alt-propagate; those stay booked and
untouched.

## Not done

- **No emulator.** Nothing here touched `mcp__oracle__*`.
- **Nothing was fixed.** The three findings above are design calls and are the
  overseer's or the owner's, not a thing to patch inside a test parcel.
- **The peer trees are untouched.** `aeon` at `73b07a4f` with the same two dirty
  files (`docs/lane-status.json`, `tools/freeze_preflight.sh`); `s1disasm` at
  `f6ece65` with the same four (`artnem/GHZ Bridge.nem`, `artnem/Signpost.nem`,
  `.aurora/`, `Test.hsproject`). Both pre-existing, identical to what O48
  recorded hours earlier, and not attributable to this run.
- **Nothing was saved.** No Ctrl+S, no save call; the app has no autosave. The
  twelve poked fixture cells are restored and the restoration is asserted
  (`[z1]`), and `[z2]` re-reads the whole plane against the words the run opened
  on — 0 differing.
