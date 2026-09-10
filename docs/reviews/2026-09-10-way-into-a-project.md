# WAY-INTO-A-PROJECT — seat A's F1 and F6, which are one surface

**Branch:** `parcel/way-into-a-project`, base master `014d5836`.
**Source findings:** `docs/reviews/2026-09-07-lens-ux/uxa-walk.md`, F1 and F6.
**Machine constraint honoured:** no ROM build, no CDP/Electron run, no emulator tool called or
attempted. Everything below is proven at the store, routing or pure-rule layer under `vitest`.

> **NOTHING IN THIS PARCEL HAS OBSERVED A RENDERED PIXEL.** The one row that needs a screen is
> split out in §6 and is tagged for the overseer's foreground. Where a claim is read from source
> rather than executed, §5 says which.

---

## 1 · What the two findings turn out to be

They looked like two. They are one surface with two different answers.

**F1 is a real gap and is not the defect it looks like.** The seat could not tell "the app failed to
show a dialog" from "a headless Xvfb with no window manager cannot show a native modal", said so in
bold, and asked nobody to upgrade it. This parcel does not upgrade it and did not spend a minute
trying. What survives either attribution is the shape: **one advertised entry point, native, with
nothing behind it.** That is now fixed.

**F6 is REFUTED for the user interface, and the reason the seat saw what they saw is more specific
than "it did nothing".** Two separate things were true at once:

1. **The `undefined` was a constant, not a signal.** The hook read
   `open: (dir) => openAeonProject(dir).then(() => undefined)` — it *discarded the loader's own
   boolean*. A successful open and a failed one returned the same value. The seat retried inside a
   `try/catch`, correctly concluded nothing threw, and then read a constant as failure.
2. **The open succeeded and was masked.** `openEngine()` (`src/renderer/state/open-project.ts`)
   gives **classic precedence** by design: `classicProjectStore.status === 'open'` is answered
   *before* `projectStore.project !== null` is read at all. `openAeonProject` wrote the second and
   never touched the first. So the aeon project was fully loaded, in the store, and completely
   invisible behind the classic facet pills — exactly the report, including the correct label
   `Sonic 1 Disassembly (GitHub)` still on screen.

---

## 2 · The census for F6 — every road, with a verdict

The question the brief asked first was not "how do we fix it" but "is this reachable from the
interface at all". A reachability claim is a claim about every caller, so here is every caller.

Population: every call site of the two switch primitives (`.openDirectory(` and `openAeonProject(`)
in `src/renderer`, walked with `readdirSync` rather than `grep` — `grep` in this shell wraps
`ugrep --ignore-files` and returns a clean zero for an ignored path. The walk is the one already
executed by `src/renderer/shell/__tests__/project-open-door-census.test.ts` §2, which fails on any
undeclared caller; this table is the *user-facing* roads that funnel into those call sites.

| # | Road | Reaches | Can it produce F6's mask? |
|---|---|---|---|
| 1 | Home, no project: `Open Project…` hero button | `App.openProject` → `useProject.openProject` → `selectDirectory()` → `openPath` | **No** |
| 2 | Home, project open: `Open project…` switch card | same | **No** |
| 3 | Home recents rows, **both** states | `onOpenRecent` → `openProjectByPath` → `openPath` | **No** |
| 4 | Explorer empty state: `Open Project…` | `App.openProject` → same | **No** |
| 5 | Command palette: `Open Project…` | `openProjectDialog` → same | **No** |
| 6 | Command palette: `Open recent: …` | `openRecent` → `openProjectByPath` → `openPath` | **No** — and these commands are emitted only while `engine === null` (`shell/commands.ts`), so they cannot even *be* the switch case |
| 7 | **NEW, this parcel:** Home typed-path field, both states | `onOpenPath` → `openProjectByPath` → `openPath` | **No** — it is road 3's road with a different source |
| 8 | Project Setup tab: re-validate | `openDirectory` on the **already-open** dir | **n/a** — classic → classic, key unchanged, no engine flip |
| 9 | Agent tool `classic-open-project` | `openDirectory` after `unsavedAgentRefusal` | **n/a** — classic only; it cannot open an aeon project at all |
| 10 | Session restore at boot | opens **no project** — it restores tabs *within* one (`shell/session-lifecycle.ts`) | **n/a** |
| 11 | `window.__dbg.openDir` | `openDirectory`, raw, no guard, `VITE_AURORA_DEBUG` only | **n/a** — classic only |
| 12 | `window.__dbg.aeon.open` | `openAeonProject`, raw, no guard, debug only | **YES — the only road that could, and it is the one the seat drove** |

**Why roads 1–7 cannot produce it, in one sentence:** they all funnel through
`useProject.openPath`, which calls `classicProjectStore.openDirectory(dir)` **first**, and that
primitive's `'not-classic'` branch does `set({ ...CLOSED })` **before it returns the answer that
routes to the aeon loader**. By the time `openAeonProject` runs, classic precedence has nothing left
to win with.

**Verdict: REFUTED for the UI. It is the debug door, and the debug door alone.**

### 2.1 · And the fix went into the primitive anyway, on purpose

The mask was being closed **by an accident of call order, in a store the aeon loader cannot see**.
That is a safety property with no artifact — the precise shape `src/renderer/shell/project-open-guard.ts`
records losing four times in its own header. `openAeonProject` now closes a resident classic project
itself, first thing:

- On roads 1–7 it is a **no-op**: `openDirectory` closed classic one statement earlier.
- On road 12, and on any future caller, it is the difference between a loaded project and an
  invisible one.
- **No new discard road.** The close resets `classicLevelStore` and so zeroes `classicDirty`; it is
  reachable only from the user road (where `openDirectory` had already reset the same store) and
  from the unguarded debug door (which discarded that work regardless). Written into the guard's
  census comment, because that comment reasons from the mechanism that moved.

The hook now returns the boolean rather than `undefined`, so the next reader is not handed a
constant. `AeonProbeApi.open` is retyped `Promise<boolean>`.

---

## 3 · The door chosen for F1, and why not the other one

The seat offered two: **a path text field beside the button**, or **accepting a directory as
`argv`**. I chose **the path field**, and declined argv rather than doing both.

1. **The finding is a person stuck *inside* the app.** argv does not remove that dead end; it
   replaces it with "quit, learn a flag, relaunch", and it is unavailable to the reader already
   looking at the Home tab — which is where the seat was.
2. **It costs the perimeter nothing.** The field calls `onOpenPath`, which `App` wires to
   `openProjectByPath` — *literally* the road the recents rows already take, `useProject.openPath`,
   the one declared user door in the census file, which awaits `confirmProjectOpen()` before
   touching either store. A boot-time argv open would be a **new caller on that perimeter** whose
   safety would rest on "nothing can be dirty at boot" — the census bet the open-guard's own header
   records losing four times. The typed path is not a new road; it is a new *source* for an existing
   one.
3. **It buys argv's other advantage anyway.** The seat's second reason for wanting argv was that it
   makes the app drivable in a walk without a debug build. A CDP harness can type into an `<input>`
   and press a button with real key and pointer events — which is the evidence the lens seats
   prefer over a hook call in the first place.

**And it is deliberately not a debug hook.** `window.__dbg` already exposes `aeon.open` and
`openDir`; the brief was explicit that surfacing a debug door is not a second door, and it is right —
those ship only under `VITE_AURORA_DEBUG` and call the primitives raw with no guard at all.

### 3.1 · What the field does

`parseTypedProjectPath` (`src/shared/project-path.ts`) is pure and cannot stat anything, so it does
not pretend to: whether the directory exists and whether it is a project stay `openDirectory`'s
questions, which it already answers with a good notice. What the parser settles is the narrower one
a text field owns.

Accepts, each because it is a spelling people actually arrive with:
surrounding whitespace · shell quotes in both spellings (a path with spaces is copied quoted) ·
a percent-encoded `file://` URI (what a file manager or browser hands over) · trailing separators,
`.` and `..`, normalized through **`normalizeProjectPath`** so a typed path and a browsed one mint
**one** project identity rather than two.

Refuses six ways, each naming its own rule *and* the fix — the refusal style the seat singled out
approvingly in F4:

| Input | Refusal names |
|---|---|
| empty | what to type, and the browse button beside it |
| `~/proj` | that **the shell** expands `~`, so a pasted one is a directory named `~` |
| `proj` | that there is no working directory to resolve a relative path against |
| `file://host/p` | local directories only — rather than silently dropping the host and opening `/p` |
| `file:///%zz` | an unreadable escape, rather than throwing |
| `/` | the filesystem root is not a project directory |

**F4 avoided rather than repeated.** F4 was a validation message inserted *between two fields*,
moving the next one 120 px under the reader's hand so their typing appended to a value they thought
they had replaced. This message renders **below** the only control in the group: the input keeps
focus and keeps its position, and everything that shifts is downstream content nobody is mid-gesture
on.

---

## 4 · Tests, aggregates, and every red-first leg

Runner: `npx vitest run` for the individual files; `npm test` (which chains 15 `check:*` scripts and
`npm run typecheck` **before** vitest) for the totals.

**Full suite at the tip: `590 test files passed | 3 skipped (593)`, `8804 tests passed | 9 skipped
(8813)`, 0 failed, exit 0.** Every skip named its reason; all 9 are pre-existing opt-in or
absent-fixture rows unrelated to this parcel.

New files and their counts:

| File | Rows |
|---|---|
| `src/shared/__tests__/typed-project-path.test.ts` | 15 |
| `src/renderer/components/home/__tests__/typed-path-open.test.ts` | 8 |
| `src/renderer/state/__tests__/aeon-open-over-classic.test.ts` | 7 |

### 4.1 · Red-first legs, each with the mutation written to disk and quoted

Every mutation below was applied with a script, **read back from disk or from `git diff --stat`
naming the file**, run, and then restored with `git checkout HEAD --` from a **committed** baseline.

| # | Mutation | Applied to | Result |
|---|---|---|---|
| M1 | the `~` rule deleted, so `~/p` falls through to the relative-path branch | `src/shared/project-path.ts` | **2 red** of 15 |
| M2 | `submitTypedPath` refuses **and then opens anyway** with the unparsed text | `src/renderer/components/home/typed-path-open.ts` | **2 red** of 8 |
| M3 | the second `<OpenByPath>` render site removed from the switch state | `src/renderer/components/home/HomeTab.tsx` | **1 red** (same run as M2, 3 red total) |
| M4 | a raw `openDirectory` call planted in the new door | `src/renderer/components/home/OpenByPath.tsx` | **1 red** in the *existing* census file, **naming the file** |
| M5 | `closeResidentClassicProject()` removed — the pre-fix masking behaviour | `src/renderer/state/aeon-open.ts` | **1 red** of 7 |
| M6 | `.then(() => undefined)` restored on the debug hook | `src/renderer/debug-hooks.ts` | **1 red** of 7 |

**M5 is the one worth reading twice.** It reddened §3 and left **§2 green** — and that is the
correct result, not a gap. §2 measures the *user road*, which was never broken. A mutation that
restores the defect and leaves the refutation's own rows green is what a refutation looks like when
it is true.

### 4.2 · The matcher hazard, caught in this parcel

The first version of the "six distinct refusals" row compared the six **messages**, and **M1 left it
green**. Both messages quote the input back, so `"~/p" is not an absolute path` and
`"rel" is not an absolute path` are distinct strings produced by *one* rule. The row had been
passing on the echo, not on the rules. Repaired two ways, both needed: it now compares a refusal
`kind` the echo cannot forge, **and** the prose with every quoted span blanked. Under M1 it goes red.

### 4.3 · One process error, recorded because it nearly cost the parcel

I ran M1's first attempt **before committing the parser**, and `git checkout` restored from the
index — deleting the whole uncommitted addition. Invariant 6(b) says *committed* baseline and it says
so for exactly this reason. Re-added and committed first; every mutation after that was against a
commit.

---

## 5 · Which rows never observed a rendered pixel

**All of them.** Stated per claim, because a blanket sentence hides which half is weak:

- **Executed** (`vitest`, real store transitions): the parser's 15 rows; the submit rule's 5
  executed rows, including *every refusal opens nothing*; all 7 F6 rows — the mask mechanism, the
  control that closes classic and changes nothing else, the user road's `openEngine()` verdict, the
  cold start, and the loader's new close.
- **Read from source, and labelled as such in the test file** (`§2` of `typed-path-open.test.ts`,
  3 rows): that `OpenByPath` delegates to the tested rule and holds no second copy of the parse;
  that the field renders in **both** Home states; that `App` hands it `openProjectByPath`. This
  suite has **no jsdom**, so there is no stronger evidence available here.
- **Never observed:** that the field paints, that it is typeable, that Enter and the button submit,
  that the refusal sentence appears under it, that the layout holds, and that a typed path opens a
  real project end to end.

---

## 6 · SPLIT — tagged for the overseer's foreground

**One CDP pass, on a build with `VITE_AURORA_DEBUG` unset**, which is itself part of the point: this
door is supposed to work without one.

1. Launch cold with no recents. **The path field is on the Home hero page, under `Open Project…`.**
2. Type a real project directory. **Enter opens it**; so does the `Open` button. A level reaches the
   screen.
3. Type `~/whatever` and submit. **The refusal appears under the field**, and — the F4 check —
   **the input does not move under the reader's hand** while it appears.
4. With that project open, scroll to `Switch project`. **The second field is there**, and a typed
   path to the *other* engine's project switches to it, arriving on the **new engine's facet set**
   (this is F6's UI verdict, confirmed on a screen instead of in a store).

**Why it is split rather than attempted:** the box is under load with the owner's emulator on it, and
the standing invariants bar a CDP/Electron run outright. **No decision in this packet rests on it.**
The F6 verdict is a store-level claim end to end; the door's one property that matters — a refused
path never reaches the opener — is executed, not drawn.

---

## 7 · Not reached, said plainly so it is not read as covered

- Seat A's **F2, F3, F4, F5, P2, P3** — untouched by this parcel (F2/F3 were dispositioned by the
  d-38 parcel; F4 is *avoided* in the new control, not fixed where the seat met it).
- The **Explorer's** empty-state `Open Project…` did **not** gain a path field. It is road 4 in the
  census and is not a dead end in the same way — the Home tab is the advertised landing and where
  the seat was — but a reader who has collapsed Home still meets one door there. Named, not fixed.
- **`argv` is declined, not deferred.** §3 gives the reasoning. If the owner wants it anyway it is a
  new door on the perimeter and needs its own `DOORS` entry and its own guard argument.
- Whether the native dialog is in fact broken on this box: **not investigated, by instruction, and
  no evidence either way was produced.**
