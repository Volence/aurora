# A malformed `.aurora/project.json` was destroyed at project open

**Branch** `fix/sidecar-unreadable-overwrite` · **2026-09-06** · CRITICAL, live data loss

---

## The defect

Opening a classic (s1) project **silently overwrote a hand-written
`.aurora/project.json` that Aurora could not parse**, replacing every override in it
with a fresh three-key document — before any UI rendered, with no gesture and no
dialog behind it.

Reproducible by hand, no harness: put a trailing comma in an s1 checkout's
`.aurora/project.json`, open the project in Aurora, `cat` the file.

The chain, as it stood:

| # | Site | What it did |
|---|---|---|
| 1 | `mapping.ts:53` | no sidecar file → `{ config: {}, issues: [] }` |
| 2 | `mapping.ts:59` | invalid JSON → `{ config: {}, issues: [...] }` |
| 3 | `mapping.ts:62` | non-object JSON root → `{ config: {}, issues: [...] }` |
| 4 | `s1/index.ts:295` | read failure → `{ config: {}, issues: [...] }` |
| 5 | `classicProjectStore.ts:115` | `if (sidecar && bridge.writeSidecar)` — truthy, because the object carries `issues` |
| 6 | `mapping.ts:134` | `seedClassicBuildConfig({})` fills all three keys, returns `changed: true` |
| 7 | `classic-bridge.ts:61` | unguarded `writeBinaryFile` — no mtime check, and the return value ignored |

**Rows 2, 3 and 4 are byte-identical to row 1.** `config: {}` was Aurora's spelling
both for *"there is no sidecar"* and for *"there is a sidecar and I could not read
it"*, and `SidecarState` had no third channel to tell them apart. An absence
rendered as a value — this repo's own recurring defect class.

`writeSidecar` had **zero test coverage**: a grep across every test file in the repo
returned nothing.

A second writer had the same flaw by a different door: `ProjectSetupTab.tsx:188-191`
ran `applyPathEdits(sidecar.config, editMap)` over the same `{}` and wrote a document
containing **only the user's newest edit**. Worse than the seed's, in one respect —
the seed at least writes three known-good defaults.

---

## The fix: three answers, not one

`SidecarState` gains a required `read` field (`core/project/mapping.ts`):

```ts
export type SidecarRead = 'absent' | 'read' | 'unreadable';
```

- **`absent`** — no file on disk. An empty config is the *truth*, and writing the
  seed creates the file, which is the whole point of it.
- **`read`** — the file parsed. `issues` may still name entries dropped from
  *within* it; a readable file with one bad entry is **still safe to write**.
- **`unreadable`** — the file is there and Aurora could not turn it into a config.
  The user's overrides are still on disk; Aurora just cannot see them.

`read` is **required, not optional**: a producer that forgets to say which of the
three this is must fail to compile, because the default a reader would otherwise
assume (`'read'`) is the dangerous one.

Two helpers keep the two writers from drifting:

- `sidecarMayBeOverwritten(state)` — **the write gate**, keyed on `read`.
- `sidecarRefusalMessage(what)` — one sentence, one place.

### Why the gate is keyed on `read` and not on `issues.length`

`issues.length > 0` looks like the same gate and is not. A file that parsed with one
dropped `paths` entry is **readable**, and refusing it would strand the seed *and*
Apply for any project carrying a single typo'd override — the file could never be
seeded and Apply could never write, permanently, with no way out but hand-editing.
The question is never *"was anything wrong"*; it is *"did Aurora see what is in this
file"*. Mutation **M7** below is exactly this substitution, and a test catches it.

---

## Following the canvas model — and where I departed

The canvas save path already solves this, and I followed it rather than inventing a
shape:

| Canvas | This fix |
|---|---|
| `sidecarRejected` (`canvas-file-format.ts:278`) | `read: 'unreadable'` |
| *"a sidecar Aurora could not READ is one it must not overwrite"* (`canvas-save.ts:72`) | `sidecarMayBeOverwritten` |
| Told every time, with what to DO (`canvas-save.ts:132`) | `sidecarRefusalMessage` |
| Deliberately **not cleared** by a successful save (`canvas-save.ts:148`) | see below |

aeon's `markUnreadable` + `understood(suffix)` gate (`aeon/save.ts:181`) is the same
rule again, per-file.

**Departure 1 — three-way, where canvas has a boolean.** Canvas needs only *"was this
rejected"*, because a canvas save always has pixels to write regardless. This writer
needs `'absent'` as a **positive reason to write** — the seed exists to create a
missing file — not merely as the absence of a rejection. A boolean would collapse
`absent` and `read` together, which happens to be safe today, but the field's job is
to answer *why the config is what it is*, and two of the three answers being spelled
the same is how this defect started. `readMapText` in `s1/index.ts:337` already
models exactly this three-way in this same file, for the same reason.

**Departure 2 — nothing to "not clear".** Canvas's rule that `sidecarRejected`
survives a successful save exists because a canvas document is long-lived and
save-happy: a save proves nothing about readability, and only a fresh read can
disprove rejection. The classic sidecar's `SidecarState` is **rebuilt from disk on
every `openDirectory`** and is never mutated in place, so there is no flag that could
be wrongly cleared — the invariant holds by construction rather than by a comment. I
did not add a clearing path, and reopening the project is the documented recovery,
exactly as in the canvas toast.

---

## What the user now sees

`sidecar.issues` renders **only on the Project Setup tab**, which a person opening a
project need never open — so *"the issues array already carries it"* was never
sufficient. Three surfaces now:

1. **An error toast at open** (the seed's refusal), naming the file, saying Aurora
   left it alone, and saying what to do: *fix it by hand, it must be a valid JSON
   object, and reopen the project.*
2. **The Setup tab**: a card headed *"Aurora could not read .aurora/project.json"*
   stating the file is intact, **Apply disabled**, and a footer line saying why.
3. The per-entry issue list that was already there.

**No modal — argued, not defaulted.** A modal is right when something is lost or a
decision is pending. Here nothing is lost (that is the fix), nothing is pending, and
the user cannot act on it from inside a dialog — the remedy is a text editor. A modal
at project-open for a condition you can only dismiss trains people to dismiss modals.
The toast is loud enough to be noticed and the Setup tab holds the detail and the
block.

**Belt and braces, deliberately.** The Setup tab disables Apply *and*
`planSetupSidecarWrite` refuses. The disabled button is so the user learns before the
click; the planner holds the real gate, because **a guard a surface writes for itself
passes whenever the surface and the writer are wrong together**, and a future caller
of the planner would not inherit the button's caution.

---

## Red-first proof, with the mutation shown

### Phase 1 — red against the genuinely unfixed code

The store writer's tests were written and run **before any production change**
(committed red at `2d883205`, so the red is on the record rather than asserted):

```
× unreadable ⇒ writeSidecar is never called
× invalid JSON ⇒ writeSidecar is never called
× a non-object JSON root ⇒ writeSidecar is never called
× unreadable ⇒ the user is told, in the session
✓ genuinely absent ⇒ the seed writes the three build fields
✓ read-and-empty (a valid `{}` on disk) ⇒ the seed writes too
✓ a readable file with authored overrides ⇒ the seed ADDS, never replaces
✓ an already-seeded readable file ⇒ nothing is written at all
✓ readable WITH per-entry issues ⇒ still writes
                                          → 4 failed | 5 passed (9)
```

The five green rows are the behaviour that must **not** regress. They are in the same
file on purpose: *"refuse everything"* satisfies every red row above them.

Writer 2 could not be red-tested the same way — `planSetupSidecarWrite` did not
exist, and this repo has **no `@testing-library/react`**, so the component's `apply()`
is unreachable from a test. So it landed in two commits: `f90d5817` extracted the
decision **faithfully, gate and all (which is to say, no gate)**, and committed it
**red** — proving the extraction reproduces the destructive behaviour before the gate
was added:

```
× unreadable => refused, and NO bytes are produced   (expected 'refused', got 'write')
× invalid JSON => refused                            (expected 'refused', got 'write')
× a non-object JSON root => refused                  (expected 'refused', got 'write')
× the refusal says what happened and what to do
✓ readable => writes, merging onto everything already there
✓ absent => writes (Apply with no sidecar yet creates one)
✓ readable WITH per-entry issues => still writes
✓ clearing an override still works
                                          → 4 failed | 14 passed (18)
```

### Phase 2 — mutation matrix against the fixed code

Each mutation applied on disk, shown as a diff, run, then restored with
`git checkout HEAD -- <file>` from a **committed** baseline (tree verified clean
first, and verified clean again after each restore).

| # | Mutation on disk | Caught by |
|---|---|---|
| **M1** | `return state.read !== 'unreadable';` → `return true;` — *the original defect, reinstated* | **9 failed** / 64: every refusal row in all three writers, plus the gate unit |
| **M2** | → `return false;` — *"refuse everything"* | **10 failed** / 63: every non-regression row — absent seeds, merges, Apply, clearing |
| **M3** | invalid JSON returns `read: 'read'` | **3 failed**: the trailing-comma row, the gate row, Apply's invalid-JSON row |
| **M4** | non-object root returns `read: 'read'` | **3 failed** |
| **M5** | `s1/index.ts` read-failure returns `read: 'read'` | **1 failed**: the adapter row |
| **M6** | bridge drops `if (wrote === false) throw` | **1 failed**: the refused-write row |
| **M7** | store gates on `sidecar.issues.length > 0` instead of the read kind | **1 failed**: *readable WITH per-entry issues ⇒ still writes* |

M1 and M2 are the pair that matters: **no single-sided fix passes both.**

### A false zero in this harness, and what it was

The first run of the matrix reported *"no failing rows"* for **all seven** mutations —
the exact "applied-and-still-green" signature the brief names as a runner defect
rather than a pass. It was: the harness had `TESTS="a b c d"` and ran
`npx vitest run $TESTS`, and **zsh does not word-split an unquoted variable**, so
vitest received one bogus path, ran zero files, and printed nothing my greps could
match. Fixed to an array with `${TESTS[@]}`; the table above is the corrected run.
Recording it because a clean sweep of seven green mutants should have been
unbelievable on its face, and the thing that made it believable was that it agreed
with what I wanted.

---

## A finding worth stating on its own

**A test whose name claims a property the type makes unexpressible is a guard that
cannot fail.**

`s1-adapter.test.ts` already carried a row named *"a sidecar that exists but fails to
read is **treated as unreadable**, not a parse failure"*. It could only assert the
issue **message** — because `SidecarState` had no field in which "unreadable" could
be said, and no writer consults a message. The row passed, continuously, while the
behaviour it names was absent from the product. The name described an intention the
type could not hold, and the assertion quietly fell back to the nearest expressible
thing.

It now asserts `read: 'unreadable'` and means it (M5 proves it fails without the fix).
The general form: when a test's title names a *property* and its body asserts a
*string*, check whether the property is representable at all.

---

## Also fixed on this path only: a refused write reported as a save

`window.api.writeBinaryFile` returns `Promise<boolean>` and answers `false` when the
main process refuses an unsafe path; its own contract is that the renderer treats
`false` as a failed write and reports it. **Neither sidecar writer assigned that
answer anywhere**, so a refused write was indistinguishable from a landed one — the
seed's `try/catch` never fired, and Apply went on to re-open the project and toast
success over a write that never happened.

Both sidecar writers now throw on `false`, with two rows covering it against the
**real** `ipcClassicBridge` rather than a fake.

> ⚠ **This is one of TEN call sites with the same gap.** The other nine are **not
> touched here** and remain booked as **`REFUSED-WRITE-REPORTED-SAVED`**. Fixing them
> is its own parcel.

A related caution that shaped the tests: `state/__tests__/aeon-save.test.ts:78-82`
mocks `writeBinaryFile` with a hardcoded `return true;` — **a mock that cannot express
a refusal**. Every "no write happened" assertion in this parcel therefore asserts that
the **call did not occur**, or that **no bytes were produced**, never that a returned
value was falsy.

---

## Remaining hazards — TAGGED, not fixed

1. **`REFUSED-WRITE-REPORTED-SAVED`** — the other nine `writeBinaryFile` callers.
   Separate parcel, per the controller.

2. **The classic sidecar write is still unguarded by mtime.** The canvas path has a
   `GuardedWriteApi` with a conflict check; `.aurora/project.json` has none. So a
   sidecar that *reads fine at open* and is then edited **externally** before
   Setup → Apply is still clobbered by the store's stale copy. This is a **different
   defect from the one fixed here** — it needs the file to be readable, and it needs
   an external edit — and it is genuinely out of this parcel's scope, but it is the
   honest remaining answer to "can this file still be lost". **Worth its own row.**

3. **No runtime confirmation.** Per standing constraint, no emulator and no Electron
   run was performed. The repro is stated above and is a two-minute manual check;
   the UI changes (the card, the disabled Apply, the footer line, the open toast)
   are **not** visually confirmed and are TAGGED for the controller's foreground
   follow-up.

---

## Can a malformed sidecar still be destroyed by any path in this repo?

**No.** `.aurora/project.json` has exactly two writers —
`classic-bridge.ts:73` (the open-time seed) and `ProjectSetupTab.tsx:206` (Apply, via
`planSetupSidecarWrite`) — and both now pass `sidecarMayBeOverwritten` before
producing any bytes; there is no third writer in the tree. The stated caveat is
hazard 2 above: a sidecar Aurora **read successfully** can still be overwritten by a
stale in-memory copy if the file changes on disk between open and Apply, which is an
mtime-guard gap, not the unreadable-overwrite defect.
