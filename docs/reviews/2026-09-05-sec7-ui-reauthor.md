# Section 7, re-authored through the UI — the leaf diff

**Branch** `parcel/sec7-ui-reauthor` · **harness** `npm run harness:sec7-ui-reauthor`
(`scratchpad/sec7-ui-reauthor-harness.mjs`, registered in `package.json`) · **25/25 rows, 0 failed, 0 unmeasured**

## Why this exists

`ojz_act1_sec7_worldwater`'s final shape was bisected on a live machine over eight
builds, agreed with the aeon lane, and then **assembled by hand** — the bytes were
typed, not authored in Aurora — because the owner was waiting. That is a departure
from this project's whole claim, which is that *an effect a person builds in Aurora
reaches a ROM*. This parcel discharges it. The deliverable is not the document; it
is the comparison.

## THE RESULT: BYTE-IDENTICAL, ON BOTH PATHS

The committed hand-made document is pinned by hash, not by path — the harness
recomputes git's own blob id from the bytes it reads and asserts it equals the
`3ff07f9bfb51393ba7003699eeb11d799879b682` the dispatch names (row `[0a]`).

| | app-written blob | leaf diff vs. committed |
|---|---|---|
| **[B]** from the landed broken scene | `3ff07f9b…9879b682` | **0 differing leaves of 14** |
| **[A]** from scratch | `3ff07f9b…9879b682` | **0 differing leaves of 14** |

Both delivered files under `docs/captures/2026-09-05-sec7-ui-reauthor/` are
byte-for-byte the committed file — `cmp` is silent and all three blob ids agree.

**So: Aurora can author this document, and the hand-made shortcut cost nothing but
time.** Nothing the target needs was unreachable and nothing had to be worked
around. 40 gestures were driven; 40 landed (`[6a]`).

## The two paths, and why both

**[B] from the existing scene.** The clone carries aeon's landed, *broken* document —
`fa` below `FACTOR_1` on two layers, a **curve on two layers**, `world_y 3`, and no
`v_offset` at all. Six leaves differ from the target before anything is driven
(`[0b]`), and driving them to the target is the exact transformation the hand-assembly
performed. This is the only path that exercises **removing a curve**, which the
dispatch flagged as possibly unreachable. It is reachable: the `B curve to` picker
carries an explicit `none` option, and choosing it *deletes the key* rather than
writing a `"none"` string. The file went 492 → 402 bytes, inode moved.

**[A] from scratch.** A second clone that has never held the file. The scene was
created at the target id through the panel's own `Scene id` field + `New` chip
(factory default: one layer, `v_factor 15`, no `v_offset`), grown to three layers with
the `Add layer` button, and every field driven from those defaults. The file went
**ABSENT → created by the app**. This is the stronger claim — origination, not repair.

## Which control drove each field

Every one of these is a real control on the Parallax panel, found by its own `title`
and driven with input events the app actually listens for. `element.click()` is not
used anywhere for a gesture; pointer targets get press/release at integer client px.

| Field | Control | Where |
|---|---|---|
| `v_factor` = 15 | `V factor` spinner (`NumberField`) | scene section, `EffectsScenePanel.tsx:1081` |
| `v_offset` = 288 | `V offset` spinner | scene section, `:1160` |
| `layers[i].world_y` | `Screen line` spinner, per layer | layer card, `:608` |
| `layers[i].fa` | `Plane A (fg)` factor picker | `:629` |
| `layers[i].fb` | `Plane B (bg)` factor picker | `:656` |
| `layers[i].curve` → **none** | `B curve to` picker, `none` option | `:683` |
| `layers[2].vsplit` on | `B split at` select (`none`/`row`) | `:701` |
| `layers[2].vsplit.at` = 67 | the `row` spinner beside it | `:709` |
| — scene creation | `Scene id` input + `New` chip | `:513` |
| — layer creation | `Add layer` header button | `:527` |

The scene-level section is `defaultCollapsed`, so `V factor` / `V offset` are not in
the DOM until its header is clicked; the harness clicks it and asserts the box appeared
(`[2b]`). **The one step that is not a UI gesture is opening the project** — aeon's only
real open route is a native folder picker CDP cannot drive, so `window.__dbg.aeon.open`
is used and is declared as non-UI evidence. Nothing that touches the *document* uses it.

## Finding 1 — the document is authorable ONLY vsplit-last

`clampLayerTop` narrows a locked scene's layer top for a layer that emits a raster
fire (i.e. carries a vsplit) to `3 + v_offset .. 223 + v_offset`. With `v_offset 288`
that is **291..511** — and the target's layer 2 holds `world_y 162` *with* a vsplit.
Read back off the live control after authoring (row `[5d]`, a measurement, not a
reading of the source):

> `Layer 2 Screen line (291..511) — a plane line; the scene is locked — narrowed from
> 0..511 because this layer authors a split, so it becomes a raster fire, and a fire's
> screen line is its top less v_offset (288). Move the view box to move this range.`

The box advertises a bound its own document's value is outside. The clamp binds the
**gesture**, not the document, so a value that arrives from a file keeps 162 and saves
fine — but an author who turns the split on *before* typing the top can never enter
162: it clamps up to 291. The harness therefore drives every `vsplit` **last**, after
all three tops have landed, and says so in its gesture plan.

This is not a defect and the harness does not assert it green. It is the sentence the
next person authoring a split scene needs, because the order that works and the order
that silently gives you a different document are both perfectly natural.

## Finding 2 — DEFECT: a scene deleted in the panel comes back

Found by tripping over it, and kept. The panel's `Delete scene` button removes the
scene from the session; **the save leaves its file on disk**, so the scene is back on
the next open. Measured end to end in row `[4b]`: delete → the scene is gone from the
panel (`true`) → Ctrl+S → the file's inode/mtime/size are *unchanged* → re-open the
same project → the scene is present again.

The cause is in `src/core/project/aeon/save.ts`: `buildSavePlan` pushes a write for
every scene **in** the library and has no removal step at all. The only `unlink` in
the writer is `guarded-write.ts`'s best-effort orphan `.tmp` cleanup. The same shape
applies to raster presets, which are written by the identical loop.

Not fixed here — out of this parcel's scope, and it wants its own red-first gate.

## How a clean result was distrusted, and what that caught

A byte-identical file is exactly what a harness measuring the *wrong subject* also
produces. **The first version of this harness ran both paths against one clone** and
its path-A rows went green while measuring path B's file. Two facts conspired: the UI
delete left the file on disk (finding 2), and the save layer compares before writing —
so path A's identical document produced **no write at all** and the inode never moved.
The "from-scratch" bytes were path B's bytes, unread and unwritten.

What the rig now does about it, all of which is load-bearing:

- `[0b]` asserts path B's starting document **differs** from the target, printing the
  differing leaves. On the very next run this fired: the source clone had been mutated
  by the earlier run, so path B would have started from the answer. Restored, re-run.
- `[0c]`/`[5z]` assert path A's clone holds **no such file**, the second reading taken
  the moment before the app is pointed at that tree — after two intervening saves.
- `[3a]`/`[5e]` make **a save that did not move the inode a FAILED row**, never a quiet
  pass. Path B: `size 492 → 402`, inode moved. Path A: `ABSENT → created`.
- Each path gets its own working copy, so neither can read the other's bytes and the
  caller's clone is never mutated.

## Boundaries honoured

No emulator tool was touched; no Build & Run; the aeon checkout was read only (the
harness refuses if `AEON_DIR` resolves to aeon's default location) and all authoring
happened in throwaway copies under `mktemp -d`. Peer paths go through
`test/support/sibling-root.mjs` — `checkoutOverride('aeon')` for the required override
and `siblingDefaultPathOrUnresolved('aeon')` for the guard defending the default
location, never `process.env` directly.

## Suite

`npm test` — **7290 passed / 9 skipped / 0 failed** (504 test files passed, 3 skipped).
That is master's result in a linked worktree, which the dispatch names as equivalent to
`7291 / 8` in a main checkout; the ninth skip is `sibling-root`'s step-3 row, which
declines to measure in a worktree and says so. No delta to attribute.
