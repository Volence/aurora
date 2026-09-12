# classic-failed-open: a failed open leaves a resident Sonic 1 project open

Branch `parcel/classic-failed-open`, from master `98db8124`.
Parcel `CLASSIC-FAILED-OPEN-CLOSES-PROJECT`.

Filed: "A failed open from the Home path box closes the Sonic 1 project you had
open, and can show a stale earlier project instead. An aeon project stays open
on the same failure." Re-measured on base: all three sentences reproduce.

---

## Verdict: FIXED, to parity with the aeon loader

- A failed open from Home's path box leaves a resident classic project open:
  same engine, same directory, same session key, same loaded act. The error
  banner still gets its message.
- An aeon project opened earlier no longer resurfaces in its place.
- A classic project also survives a typed path that is an aeon checkout which
  fails to LOAD. The filing did not name this second road.
- Successful opens are unchanged: a classic switch replaces the project and
  drops its loaded act, and an aeon open closes the classic project.
- A cold open (nothing classic resident) is unchanged. It still passes through
  `'opening'` and ends CLOSED on failure.

## 1. The cause

**Road 1.** `src/renderer/state/classicProjectStore.ts`, `openDirectory`.

- The first statement was `set({ ...CLOSED, status: 'opening', dir })`, then
  a classic level-store reset. Both ran whatever was open, before the bridge
  was asked.
- A failure ended in `set({ ...CLOSED, error })`.

So:

- `openEngine()` (`src/renderer/state/open-project.ts`) went null mid-open.
- The session key (`src/renderer/shell/session-lifecycle.ts`) flipped mid-open,
  and every key change runs `resetProjectRuntime`.
- The act was dropped.
- The project stayed closed after the failure.

**Road 2.** The `'not-classic'` branch of the same function did
`set({ ...CLOSED })`. Then `openAeonProject`
(`src/renderer/state/aeon-open.ts`) called `closeResidentClassicProject()`
BEFORE `aeonAdapter.open`. So an aeon directory that failed to load had
already closed the classic project.

**The stale project.** `useProjectStore.reset()` has no production caller. So
an aeon project opened before the classic one stays in its store, underneath.
`openEngine()` gives classic precedence and falls through to that aeon project
once the classic store is closed. Home's `noProject = !classicOpen && !config`
does the same, and Home showed the earlier aeon project's page.

**Why aeon never had it.** `setLoading` / `setError` leave `config` and
`project` in place, and only `openLoaded` replaces them.

## 2. The fix (`04c048f7`)

In `openDirectory`, nothing resident is touched until the bridge answers:

- A resident switch stays `'open'` mid-open, clearing only a stale `error`.
- The classic level-store reset moves to the commit, just before the
  `status: 'open'` set. So no subscriber sees the new project over the old doc.
- A failure sets `error` and nothing else.
- `'not-classic'` closes nothing when a classic project is resident.

In `openAeonProject`, `closeResidentClassicProject()` moves to after the load
and the recents await, just before `openLoaded`. It is synchronous, so it adds
no await inside the window the loader's constraint comment forbids. The F6
mask is still closed on every road: `aeon-open-over-classic.test.ts` §3 is
green.

## 3. Commits

| commit | what |
|---|---|
| `98362ce9` | `src/renderer/state/__tests__/classic-failed-open.test.ts` only. On base: 6 REPRODUCTION rows red by assertion, 4 CONTROL rows green. |
| `04c048f7` | The fix, the premise updates (section 5), and prose that stated the old order as current (`aeon-open.ts`, `project-open-guard.ts`, `HomeTab.tsx`). |
| this commit | this packet |

The rows, by short name:

| row | property |
|---|---|
| R1 | the classic project is still the open project after a failed open |
| R2 | while the failing open is in flight, the classic project stays open (engine and session key) |
| R3 | an aeon project opened earlier does not resurface in its place |
| R4 | Home still names the classic project, not the earlier aeon one |
| R5 | a classic project stays open when the path is an aeon project that fails to load |
| R6 | the act the classic project had loaded survives a failed open |
| C1, C2 | CONTROL: an aeon resident survives both failure roads |
| C3 | CONTROL: a successful classic switch replaces the project and drops its act |
| C4 | CONTROL: a successful aeon open over a classic project closes the classic one |

Base run of the new file: `Tests 6 failed | 4 passed (10)`. The messages
include `the classic project is still the open engine: expected null to be
's1'`, `expected 'aeon' to be 's1'` for R3, and `expected 'idle' to be
'ready'` for R6.

## 4. Plants (mutations of the fix, each restored with `git checkout HEAD --`)

Each run covered the new file, `typed-path-field-classic-resident.test.ts`,
`aeon-open-over-classic.test.ts` and `classicProjectStore.test.ts` (39 rows).
P5 instead ran with `typed-path-field-after-open.test.ts` in place of the last
two (31 rows).

| plant | mutated line, quoted from disk | red |
|---|---|---|
| P1 | `113: const resident = false; // PLANT P1: every open treated as cold` | 10: R1 to R6, aeon-open §2, and the three updated typed-path rows |
| P2 | `75: store.setLoading(true); closeResidentClassicProject(); // PLANT P2` | 1: R5 |
| P3 | `172: // PLANT P3: commit-time level reset dropped` | 1: C3 (`expected 'ready' to be 'idle'`) |
| P4 | `123: set({ ...CLOSED, error }); // PLANT P4` | 3: R1, R3, R4 |
| P5 | the old parcel's pre-fix `HomeTab.tsx` and `OpenByPath.tsx` from `9d8c581d` (`2 files changed, 5 insertions(+), 34 deletions(-)`) | 1: the new cold-open flip row (`expected '' to be '/p/typed-while-loading'`) |

- Every REPRODUCTION row has a plant that turns it red.
- C1, C2 and C4 are controls against over-correction, and no plant targets
  them.
- After each restore, a scoped `git diff --stat HEAD` or a `grep -c PLANT` on
  the file was empty or 0.

## 5. What the tree said that the brief did not

1. **The stale project is real**, and its mechanism is the never-reset aeon
   store under classic precedence (section 1). Both a store row (R3) and a
   Home row (R4) pin it.
2. **A second road**, an aeon checkout that fails to load (R5). It needed the
   `aeon-open.ts` half of the fix.
3. **The failure also dropped the open act** (R6). It also flipped the session
   key mid-open on EVERY resident switch, successful ones included, so
   `resetProjectRuntime` ran twice per switch. That is derived from the code:
   R2 measures the mid-open state, which does not yet know the outcome. A
   resident switch now changes the key once.
4. **Four existing rows encoded this defect's mechanism as a premise**, and
   went red at the fix by premise, never by the property they protect:
   - `aeon-open-over-classic.test.ts` §2 asserted `'closed'` right after
     `'not-classic'`;
   - three rows of `typed-path-field-classic-resident.test.ts` asserted the
     mid-open flip (`'opening'`, a second field).

   Their premises now pin the absence of the flip, and their final assertions
   are unchanged.
5. **After this fix, those three typed-path rows no longer discriminate
   HomeTab's lifted typed path.** P5 leaves them green. A row was added for the
   flip that remains (a cold open that succeeds), and P5 turns it red.
6. **`classicProjectStore.test.ts`'s level-reset row starts cold**, so P3
   leaves it green. C3 is the only row that pins the reset at the commit.

## 6. Held, not decided (questions for the controller)

- **Q1. "Discard & open", then a failed open.** Before this fix the classic
  edits were thrown away (the level reset ran first) and the project closed.
  Now the project stays open with those edits, still marked dirty. Aeon's
  version of the same sequence marks `editorStore` clean and keeps the edits
  in memory. Should a discard be honoured when the open it was for fails? No
  intended behaviour was given, so there is no `it.fails` row; the question is
  tagged instead.
- **Q2. The edit window during a resident switch.** The resident act stays
  editable while the bridge reads the new project. An edit made in that window
  is dropped without a dialog when the switch commits. Aeon has the same
  window during its load. Classic did not before, because the doc was gone
  from the start.

## 7. Foreground, tagged for the controller (no app window driven, no emulator)

- **F-1.** Cold start, open a Sonic 1 disassembly, and open a level tab. On
  Home, type a bad path and press Enter.
  - The red banner shows "... is not a recognized project".
  - Home stays on the S1 project page and the field keeps the typo.
  - The level tab is still there, and its act is still loaded.
- **F-2.** Open an aeon checkout, then the Sonic 1 disassembly, then repeat
  F-1. Home still names the Sonic 1 project, not the aeon one.
- **F-3.** With Sonic 1 open, type the path of an aeon checkout whose
  `project.json` fails to load. The banner shows the aeon error, and Sonic 1
  stays open.
- **F-4.** The successes still switch: Sonic 1 to another Sonic 1, and Sonic 1
  to aeon.

## 8. Suite

At `04c048f7`, run in the foreground: `npm test` EXIT=0.

| | Test Files | Tests |
|---|---|---|
| `04c048f7` | 610 passed \| 3 skipped (613) | 9217 passed \| 9 skipped (9226) |

- failure-class: "no failures in this run (613 module(s) reported)".
- skip-report: "OK. Every skip named its reason".
- Every gate in the chain printed OK.
- `npx tsc --noEmit` exit 0.
