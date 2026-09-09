# The UX seat pair's remaining findings, dispositioned

Branch `parcel/uxpair-findings`, cut from master `be742845`. Inputs:
`docs/reviews/2026-09-09-uxpair-reconciliation.md` and the two seat reports in
`docs/reviews/2026-09-07-lens-ux/`. Ledger row `UXPAIR-AURORA-RESULT` in
`docs/lens-findings.jsonl`.

Out of scope by instruction and untouched here: the save contract (four
receipts), the chunk-document undo misfire, the Build & Run wrong-ROM reload,
and every look call on the owner's card as `d-38`.

---

## The short answer, per finding

| Finding | Verdict | Reachable by | Shipped |
|---|---|---|---|
| **B-F8** unsaved art document destroyed by a project switch | **refuted as a UI defect; holds as a debug-door observation** | debug door only | census rows + a pixel-level survival row |
| **B-F5** a filter eats the panel's only control | **fixed** | ordinary UI, three keystrokes | behaviour fix + rows |
| **B-F4** pressing the emulator badge produces no visible response | **fixed** | ordinary UI | failure reaches the toast channel + rows |
| **A-F3** 14 pixels rewrote two `.nem` files, +329 bytes | **cause determined; fix parked as a design question** | ordinary UI | reproduction rows stating both halves of the cause |

---

## 1 · Seat B's F8 — the one that mattered, and it is smaller than it looked

> *"A brand-new art document the app itself calls 'unsaved' is destroyed by a
> project switch, with no prompt."* Filed by the seat itself as ⚠ door-observed,
> not button-observed.

### Reproduced? Only through the door, and the door is the whole finding

The seat switched project with `window.__dbg.openDir(…)`. That hook is
`src/renderer/debug-hooks.ts`, and its whole body is
`useClassicProjectStore.getState().openDirectory(dir)` — the switch primitive,
called raw. Its aeon twin `__dbg.aeon.open` calls `openAeonProject(dir)` the same
way. **Neither passes a guard, so what the seat watched is exactly what those
doors do.** The seat could not do otherwise: the `Open Project…` buttons open a
native `dialog.showOpenDialog` its rig could not dismiss (and per the
controller's own attribution note, could not even display).

**The user's road has been guarded since `f0e15731`, 2026-08-16 — three weeks
before the walk.** `src/renderer/hooks/useProject.ts` awaits
`confirmProjectOpen()` before it touches either store, and that guard's snapshot
(`src/renderer/shell/project-open-guard.ts`, `currentOpenDirtySnapshot`) has
carried `artDirty = useArtStore.getState().open?.dirty` since the same commit.
Twelve rows in `src/renderer/shell/__tests__/project-open-guard.test.ts` already
pin the ask, the discard, the save and the three unsavable-work sentences.

So: **F8 is not user-reachable data loss.** It is the debug door being
unguarded, which is a real and much smaller finding, and one that costs a CDP
harness nothing because those harnesses are the door's only users.

### The census — every production road onto a project switch

Derived by reading `src/renderer` for calls to the two primitives, not from the
comment that claimed it:

| Caller | Guarded? |
|---|---|
| `src/renderer/hooks/useProject.ts` (`openPath` / `openProject`) | **yes** — `await confirmProjectOpen()` first, and its `false` aborts |
| `src/renderer/debug-hooks.ts` (`__dbg.openDir`, `__dbg.aeon.open`) | **no** — debug builds only, not a user gesture |
| `src/renderer/agent/agent-handler.ts` (`classic-open-project`) | **yes, by refusal** — no UI to confirm through, so it refuses outright on any dirt |
| `src/renderer/components/setup/ProjectSetupTab.tsx` (re-validate) | **n/a** — re-opens the directory already open, so the session key never changes and `resetProjectRuntime` never fires |

Every UI entry point the seats named funnels into the first row: both
`Open Project…` buttons and the Home switch (`openProject`), the recents rows and
the palette's `recent:` commands (`openProjectByPath`), and the palette's
`open-project` command (`openProjectDialog`).

### What was actually missing, and what shipped

**Nothing re-derived that census.** It lived in a comment inside the guard, where
a new caller added anywhere in the renderer would reproduce F8 *for real, in the
UI*, and no existing row would notice — every one of them calls
`confirmProjectOpen` directly, so they measure the guard and never the roads onto
it.

`src/renderer/shell/__tests__/project-open-door-census.test.ts` (6 rows):

- **§1** asserts the document's **contents** survive a cancelled open — the
  painted pixels byte-identical, not merely `open.dirty === true`, which is a
  flag and stays true under a mutation that empties the buffer. Its control is
  the other direction: the same pixels do **not** survive `resetProjectRuntime`,
  the reset a real key change fires, with nothing ever reaching the confirm
  store.
- **§2** executes the census: an undeclared caller fails, a declared caller that
  has stopped calling fails, and the user road's guard must sit **before** the
  write, not after.

### The second half of F8, and it is not a defect

The same round trip also removed an `Untitled Sprite` that had never existed on
disk. That document had no edits, so `anySpriteDocDirty()` was false and the
guard proceeded to `endDocumentSession()`, which is documented behaviour with a
stated reason: a surviving document points into the OLD project by absolute path,
so a later Ctrl+S in the new project would write into the old one. An unedited
scratch tab closing on a project switch is the design, not the bug.

---

## 2 · Seat B's F5 — a filter eats the only control · **FIXED**

**The panel, verbatim:** the **Explorer** sidebar (`src/renderer/shell/Explorer.tsx`).
**The control, verbatim:** the button labelled **`Open Project…`**, rendered in
the Explorer's empty state, which on the cold Home screen is the only control the
panel has.

**Cause.** The render condition was
`filtered.length === 0 && query.trim() === '' && noProject`, written inline in the
component. The middle term is the whole defect: three characters in the
`Filter…` box made it false and the button disappeared, with `No matches` in its
place and no clear affordance on the box, so the way back was three Backspaces.

**Fix.** The decision moved to `explorerEmptyState` in
`src/core/shell/explorer.ts`, and the query term is gone from the `openProject`
half: *a filter narrows the tree, and the way out of the empty state is not part
of the tree.* `noMatches` is unchanged — when a filter is active and matched
nothing, saying so is still the honest report — so on the F5 screen both are now
true at once.

**Why the rule moved out of the component.** This suite has no jsdom and no
testing-library, and `vitest.config.ts` collects `.test.ts` only, so a `.tsx`
row would not be collected, let alone run. Rows in
`src/core/shell/__tests__/explorer-empty-state.test.ts` (11), including three
that read `Explorer.tsx` as text so a component quietly re-deriving the condition
cannot leave the pure rows green.

**Not decided, and deliberately.** Seat B also reads `No matches` as
misdescribing the no-project state — *"with no project open there is nothing to
match"*. That is a wording call. Not one word of copy changed.

---

## 3 · Seat B's F4 — the badge produces no visible response · **FIXED**

⚠ **The badge was never pressed against a live server, and nothing here opens a
socket.** `window.api.aetherConnect` is stubbed in the rows; what runs is the
store's own decision. That also makes both of seat B's refusal texts reproducible
without the two app sessions and the 111-byte-path accident it took to provoke
them.

**Cause, and it is mechanical.** `AetherStatus.tsx` renders the bus `status`
verbatim whenever it is not connected. A refused connect walks
`disconnected → connecting → disconnected`, so the label it ends on is
character-for-character the one it started from, which is why the seat's two
screenshots were the same screen down to the computed colour. The `error` lands
in `aetherStore` and reaches **only** the button's `title`. Success never had
this problem — the label becomes `connected · …` — which is why the gap survived:
the visible half works on the path people test.

**Fix.** `connect()` in `src/renderer/state/aetherStore.ts` now raises an error
toast when the attempt did not end connected, relaying the main process's
sentence **verbatim** and saying so when there is none. Rows in
`src/renderer/state/__tests__/aether-connect-refusal-visible.test.ts` (6),
including both directions: a successful connect raises nothing, and a second
refused press speaks again rather than going quiet.

**Parked, and it is the producer's call.** Seat B's two texts are wildly
different in quality — one names the 104-byte unix-socket limit, the remedy and
the offending path; the other is `connect ENOENT /tmp/…`, a raw Node errno that
says nothing about what Aether is or that an emulator must be running. Improving
the second is a change to the main process's message. **The half that outranks
the wording is that neither was shown**, and that half is closed.

---

## 4 · Seat A's F3 — the cause, determined

> *"Fourteen pixels in an UNUSED tile rewrote two `.nem` files, +329 bytes of ROM
> art, unannounced."* The seat said plainly it had not determined the cause.

### Why two files

A Sonic 1 act's tile pool is the **concatenation** of one or more `.nem` files.
`src/core/project/profiles/s1.ts` gives GHZ two (`8x8 - GHZ1.nem` and
`8x8 - GHZ2.nem`) and every other zone one — GHZ's three acts are the only
multi-file acts in the profile, checked rather than remembered.

`writeS1Level`'s tile branch (`src/core/level-classic/s1-io.ts`) patches only the
file whose span contains an edited tile, and then **re-encodes and emits every
pristine file, "patched or not"**, to preserve the split. So one tile edited
anywhere in GHZ writes both GHZ files, by construction.

### Why they grew — and the arithmetic closes exactly

Aurora's `nemesisCompress` is not the encoder that produced the disassembly, so
re-encoding bytes that did **not** change does not reproduce them. Both sides
measured here, live, on the vendored fixture — neither copied from the walk:

| File | on disk | re-encoded, **zero edits** | seat A measured after its save |
|---|---|---|---|
| `8x8 - GHZ2.nem` | 5031 | **5193** | 5193 |
| `8x8 - GHZ1.nem` | 5727 | 5881 | 5894 |

`8x8 - GHZ2.nem` holds tiles 461–829; tile `$30` is 48, inside GHZ1. **It was
never patched, and a zero-edit re-encode of it lands on precisely the after-size
the seat measured — so every one of its +162 bytes is encoder overhead on art
nobody touched.** GHZ1's zero-edit re-encode is 5881, so ~154 of its +167
predates the first pixel.

**Of the +329, about 316 bytes (96%) is re-encode overhead on unchanged bytes,
and roughly 13 bytes is the drawing.**

The repo already knew half of this and had not connected it:
`src/core/formats/classic/__tests__/s1-compression-goldens.test.ts` pins the
seven stock artnem files at a measured 1.02x–1.05x under a 1.10x ceiling (they
were 2.1x–3.0x before that work). Nothing tied that known cost to what a **save**
writes.

### The fix is a design question, so it is parked with options

The obvious mechanical fix is one line: in the emit loop, skip a file whose
decoded bytes did not change. **It is not mechanical, and I planted it to find
out.**

- It kills **23 rows across 2 files** — the 3 reproduction rows here plus **20
  pre-existing rows** in `src/core/level-classic/__tests__/s1-io.test.ts`, one
  per act, of the form *"`ghz act1` re-encodes every domain identically"*. Those
  rows use the full emitted set as their non-vacuity gate, so "emit every art
  file" is a contract they pin, not an accident.
- Worse, it collides with the save contract, which is not this parcel's. With
  nothing emitted, `saveClassicWriteResult` answers `nothing`
  (`src/renderer/state/classic-save.ts`), and its caller's `case 'nothing':
  break` does **not** clear the dirty domains. So a Ctrl+S after a paint-and-undo
  — seat B's F9 state, and reachable — would write nothing, say nothing, and
  leave the dot up. That is the defect class this queue is closing, not one to
  open.

**Options:**

- **(a) Skip unchanged art files, and make the empty write clear its domains.**
  Removes half the reported growth (all of GHZ2's 162 bytes) and stops an
  untouched file's mtime moving. Costs a change to the save contract's `nothing`
  arm and a re-statement of the 20 s1-io rows' gate.
- **(b) Skip unchanged art files only when at least one other file in the act is
  being emitted.** No save-contract change, keeps every existing row honest,
  fixes the reported case exactly. Leaves the pathological zero-diff save writing
  bloated files, i.e. no worse than today.
- **(c) Report it instead of preventing it** — seat A's own remedy: name the
  bytes written per file after a save and flag growth. Orthogonal to (a)/(b) and
  arguably wanted regardless, since the encoder overhead on the *edited* file
  remains whatever is done here.
- **(d) Make `nemesisCompress` reproduce the original streams.** The real ROM-size
  fix and a compression project, not a parcel.

**Recommendation: (b) then (c).** (b) is the smallest change that fixes what seat
A measured and touches nothing outside `s1-io.ts`; (c) is what turns "unannounced"
into announced, which is the half of F3 the seat actually asked for. (a) should
wait for whoever owns the save contract. (d) is worth its own row and is not
urgent — the ceiling is pinned and the growth is bounded at 1.10x.

`src/core/level-classic/__tests__/s1-art-save-width.test.ts` (8 rows) states both
halves of the cause so nobody re-derives them. They are **reproduction** rows:
they say what the writer does today, and their header says that a fix turning
them red is the row retiring, not breaking.

---

## 5 · Rows, plants, and what the plants say

Every row is red-first from a **committed** baseline, restored with
`git checkout --`, wired into `npm test` (`vitest run`, the last link of the
`npm test` chain), and scored on vitest's own `Test Files` line. No failure in any
plant run was a timeout; the `failure-class` reporter classified every one as
`ASSERTION`.

| Plant | What was put on disk | Predicted | Measured |
|---|---|---|---|
| P1 | an unguarded `openDirectory` caller in a production renderer file | kill | **kill**, 1 row (and `project-open-guard.test.ts` stayed fully green) |
| P2 | `useProject.openPath`'s guard moved to **after** the write | kill | **kill**, 1 row (guard file again fully green) |
| P3 | `endDocumentSession()` moved **before** the ask | kill | **kill**, 12 rows across both files |
| P4 | the open dialog's body copy rewritten | **cannot discriminate** | **survived** |
| P5 | `artDirty` dropped from `planProjectOpen` | kill | **kill**, 9 rows |
| F5-A | the pre-fix `query.trim() === ''` term restored | kill | **kill**, 2 rows |
| F5-B | the pre-fix inline render restored in `Explorer.tsx` | kill | **kill**, 2 rows (the seam rows, which is what they are for) |
| F5-C | the `No matches` div's style swapped | **cannot discriminate** | **survived** |
| F4-A | the toast branch disabled (the pre-fix silence) | kill | **kill**, 4 rows |
| F4-B | the toast raised unconditionally, success included | kill | **kill**, 1 row — the other-direction row |
| F4-C | `.trimEnd()` on the message | **cannot discriminate** | **survived** |
| F3-A | the candidate fix: skip art files whose bytes did not change | kill | **kill**, 23 rows across 2 files — see §4 |
| F3-C | the emit **order** of the art files reversed | **cannot discriminate** | **survived** |

**Four predicted non-discriminators, four survivors, no surprises in either
direction.** P4 is the one worth naming: rewriting the unsaved-changes dialog's
body left all 36 rows of those two files green, so **the open dialog's body copy
is unpinned by them.** That is not a claim about the whole suite — it is the
scope I scored — and it is exactly the shape this repo has been bitten by: a
message row and a state row are different rows, and I have only the state ones.

### `npm test`, both ends

| | Test Files | Tests | rc |
|---|---|---|---|
| base `be742845` | 581 passed \| 3 skipped (584) | 8714 passed \| 9 skipped (8723) | 0 |
| tip | 585 passed \| 3 skipped (588) | 8745 passed \| 9 skipped (8754) | 0 |

**+4 files, +31 tests, all mine, and no phantom failures at either end in this
worktree** — worth stating, because the save-contract parcel earlier today saw 77
of them from a second React instance in its own worktree and this one sees none.

### The grep canary — it FIRED

`grep` in this shell is a function wrapping `ugrep --ignore-files`, which honours
`.gitignore`. A token written into a gitignored directory returned a clean zero,
while the same token in a merely-untracked file was found. **Every absence in
this document was measured under `src/`, `test/` or `docs/`, all tracked, so they
hold** — and the census test walks with `readdirSync`, not grep, so it is not
exposed at all.

---

## 6 · What I did not reach

- **No live application.** No CDP harness was launched and no ROM was built: the
  owner is screen-recording this machine, and a harness storm is CPU on the box
  he is capturing. Everything here is vitest, and where a finding could only be
  held by driving the app I said so rather than substituting.
- **F5 and F4 are held at the store/pure-rule layer, not at the pixel.** The
  Explorer rows read `Explorer.tsx` as text and the badge rows stub the IPC.
  Neither observes a rendered screen. A future CDP pass on a quiet machine could
  close that seam; I did not.
- **Seat B's F1, F2, F6, F9 and seat A's F1, F2, F4, F5, F6 are untouched** —
  outside this parcel's four, and the reconciliation already re-frames B-F1
  before it can become a fix row.
- **F3 ships no fix**, by the brief's own rule; §4 is the write-up and the
  recommendation.
- **The `No matches` wording, the raw-errno refusal text, and everything on
  `d-38`** are look calls. Written up, not picked.
