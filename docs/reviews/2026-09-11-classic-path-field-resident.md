# classic-path-field-resident: Home's typed path survives a classic resident's failed open

Branch `parcel/classic-path-field-resident`, from master `ba727d1e`.
Commits: `9d8c581d` reproduction (rows only), `ca909185` fix, then this packet.

The remainder booked by `docs/reviews/2026-09-11-home-path-field.md`, section 7
item 1: with a Sonic 1 (classic) project open, a FAILED open from Home's path
box came back with the box EMPTY, so a typo had to be retyped.

---

## Verdict: FIXED. The booked cause is right, with one condition it did not state

- A failed open keeps the typed text with a classic project resident, as it
  already did with an aeon project resident or with no project.
- A successful open still empties the field.
- Text typed while an open is in flight is still never clobbered. Across a
  classic switch it used to be lost too, because the flip remounted the field
  twice. Now it is kept.
- Nothing about either page's layout changed. The input element, its
  attributes, its submit line and the settle rule are byte-identical.

---

## 1. The cause, measured (base `ba727d1e`)

**Two instances.** `src/renderer/components/home/HomeTab.tsx` renders
`OpenByPath` at two positions:

- line 106, the no-project page, label "…or type a project directory path";
- line 218, the project page's "Switch project" section, label "…or type
  another project directory path".

`HomeTab` picks the page on `const noProject = !classicOpen && !config;`
(line 78). The two sites are different children of the column `div`: index 2
on the no-project page and index 8 on the project page. React therefore keeps
a field's state only while `noProject` does not change. When it changes, the
field at the other position mounts fresh.

**Where each gets its value.** Each instance owned its own
`const [text, setText] = useState('');`
(`src/renderer/components/home/OpenByPath.tsx`, line 61 at base). Nothing
passed a value in.

**The classic open passes through CLOSED.**
`src/renderer/state/classicProjectStore.ts`, `openDirectory`, line 103:
`set({ ...CLOSED, status: 'opening', dir })`. That is the first statement, and
it runs before the bridge is asked. So `classicOpen` goes false for the length
of every open. A failure ends in `set({ ...CLOSED, error: msg })` (line 179), so
it stays false afterwards.

**The aeon open does not.** `setLoading` and `setError`
(`src/renderer/state/projectStore.ts`, lines 77-78) leave `config` in place,
and only `openLoaded` replaces it. So an aeon resident keeps `noProject` false
through the whole open, successful or not, and the one field instance lives
on. That is why aeon kept the text.

**The condition the booking did not state.** The flip needs `config` to be
null as well as the classic store to be closed. `useProjectStore.reset()` has
no production caller (`src/renderer/shell/project-open-guard.ts` records this
in its census comment, and a grep of `src/renderer` agrees). So a classic
project opened AFTER an aeon project sits over a live aeon `config`.

I measured that case with a throwaway copy of the new test file, deleted and
never committed, on the fixed tree:

```
SCRATCH {"mid":{"mounts":1,"label":"…or type another project directory path",
  "before":"…or type another project directory path","status":"opening"},
  "end":{"mounts":1,"label":"…or type another project directory path",
  "value":"/p/s1-tpyo","status":"closed","aeonConfig":"Aeon Checkout"}}
```

There was one instance throughout and no flip. The field's position does not
change, so the fix does not matter here, and base kept the text in this case
too. **So the defect was "classic resident with no aeon config under it",**
which is what a cold start followed by opening a Sonic 1 project produces.

**Did the cause match the booking?** Yes: two instances, and the classic store
going CLOSED first. The remedy it named, "the two copies of the box share one
value", is what landed.

## 2. What changed (`ca909185`)

| file | change |
|---|---|
| `src/renderer/components/home/HomeTab.tsx` | `const [typedPath, setTypedPath] = useState('');`, declared above the `noProject` branch so the hook order is fixed. Both render sites get `text={typedPath} setText={setTypedPath}`. |
| `src/renderer/components/home/OpenByPath.tsx` | `text` and `setText` are now required props, typed `string` and `React.Dispatch<React.SetStateAction<string>>`. Its own `useState('')` for the value is gone. `refusal` stays per-instance. |

Why HomeTab, and not a module store:

- HomeTab is the nearest common owner of the two sites.
- App keeps it mounted under `display:none` (`src/renderer/App.tsx`, the
  keep-alive map), so the value survives both the flip and tab switches.
- HomeTab is the only caller of `OpenByPath`.

What did not change:

- The submit line: `function submit(): void { void submitTypedPath(text, onOpenPath, setRefusal, setText); }`.
- The `<input>` attribute set.
- `src/renderer/components/home/typed-path-open.ts`.

The landed rule therefore works unchanged, now against HomeTab's value. On
`true` the updater `fieldAfterSuccessfulOpen(current, submitted)` empties the
field only if it still holds what was submitted.

What was left alone on purpose:

- **`refusal` stays per-instance.** A parser refusal never opens anything, so
  it cannot cause a flip.
- **A Home tab that is closed and reopened** remounts HomeTab and starts
  empty. That is not this defect.

## 3. The rows, and red on base

`src/renderer/components/home/__tests__/typed-path-field-classic-resident.test.ts`
has 6 rows and was committed alone as `9d8c581d` on top of base.

**How it sees React without a DOM.**

1. `src/test/render-hooked.ts` renders the real `HomeTab`: its real hooks, the
   real classic and aeon stores, and the real `useProject.openProjectPath`.
   The classic store is reached through its bridge seam.
2. The bridge is GATED, so a row can look at Home while the open is in flight.
3. `render-hooked` returns children as data. So the file finds the one
   `OpenByPath` element in HomeTab's tree and applies React's reconciliation
   rule itself. The field is identified by its trail: the type and slot
   (key, else index) of every ancestor.
4. The same trail keeps the instance and gets new props. A new trail unmounts
   the old instance and mounts a fresh `OpenByPath` through `render-hooked`.
5. Typing calls the input's real `onChange`. Enter calls its real `onKeyDown`.

**The weaker evidence.** The trail rule is modelled, not React's own code. The
row premises measure its output: `mounts` is 2 exactly when the label changes.
A real screen is the confirmation (section 7).

Red on base, by ASSERTION, with every premise passing first. The premises are
the store in 'opening', the bridge asked for the typed path, the label
changed, and a second field mounted:

```
× REPRODUCTION: a classic project resident, a FAILED open keeps the typo in the field
  AssertionError: the typo survives the failed open: expected '' to be '/p/s1-tpyo'
× REPRODUCTION: while the open is in flight, the field on the page Home flipped to still shows what was submitted
  AssertionError: the submitted text is still in the field mid-open: expected '' to be '/p/s1-other'
× REPRODUCTION: text typed WHILE a classic switch is in flight survives its success
  AssertionError: what was typed during the open is kept: expected '' to be '/p/typed-while-loading'
✓ a SUCCESSFUL switch between classic projects still empties the field
✓ CONTROL: no project open, a failed open keeps the typo (Home never flips)
✓ CONTROL: an aeon project resident, a failed open keeps the typo (Home never flips)
Tests  3 failed | 3 passed (6)
```

**One harness mistake, found on the first base run and fixed before the commit.**
Two rows went red on a PREMISE (`mounts` 1, not 2), not on their assertion.
`mounts` only moved when the model reconciled, and those rows read it before
anything had re-rendered Home after the tick. It is now read through
`mounted(s)`, which reconciles first. The run above is the corrected one.

Why the third row was red on base: the in-flight field on the no-project page
was a fresh instance, and the success flipped Home back to the project page
and mounted a third fresh one. So the landed "do not clobber text typed while
the open was in flight" rule never held across a classic switch.

## 4. Plants (mutations on disk, restored from committed `ca909185`)

**P1: the whole fix reverted.** Applied with
`git checkout 9d8c581d -- HomeTab.tsx OpenByPath.tsx`, which puts the base
versions of both files on disk. `git diff HEAD --stat` before the run:

```
 src/renderer/components/home/HomeTab.tsx    | 19 ++-----------------
 src/renderer/components/home/OpenByPath.tsx | 16 +++-------------
 2 files changed, 5 insertions(+), 30 deletions(-)
```

The changed lines include `+  const [text, setText] = useState('');` and both
sites losing `text={typedPath} setText={setTypedPath}`.

Run of the new file and the landed 14-row file:

```
✓ typed-path-field-after-open.test.ts (14 tests)
× REPRODUCTION: a classic project resident, a FAILED open keeps the typo in the field
× REPRODUCTION: while the open is in flight, the field on the page Home flipped to still shows what was submitted
× REPRODUCTION: text typed WHILE a classic switch is in flight survives its success
✓ the other 3 rows of the new file
Tests  3 failed | 17 passed (20)
```

These are exactly the three reproduction rows, by assertion, with the same
messages as on base. Restored with `git checkout ca909185 -- <both files>`;
`git status --porcelain` and `git diff HEAD --stat` were both empty.

**P2: the settle dropped.** This is one line of `OpenByPath.tsx`, edited on
disk. `git diff HEAD --stat` before the run:

```
 src/renderer/components/home/OpenByPath.tsx | 2 +-
-  function submit(): void { void submitTypedPath(text, onOpenPath, setRefusal, setText); }
+  function submit(): void { void submitTypedPath(text, onOpenPath, setRefusal, () => {}); } // PLANT P2: the settle dropped
```

Run of the new file, the landed 14-row file and `typed-path-open.test.ts`:

```
× a SUCCESSFUL switch between classic projects still empties the field
  AssertionError: the spent path is gone: expected '/p/s1-other' to be ''
× (landed, typed-path-field-after-open.test.ts §3) Enter and the Open button are the only commit roads, and both go through the one submit
  AssertionError: expected '// src/renderer/components/home/OpenB…' to match /function submit\(\): void \{ void sub…/
× (typed-path-open.test.ts §2) the component delegates to the rule tested above, and holds no copy of it
  AssertionError: expected '// src/renderer/components/home/OpenB…' to match /submitTypedPath\(text,\s*onOpenPath,\…/
Tests  3 failed | 25 passed (28)
```

What P2 shows:

- **The success row is not vacuous under the fix.** On base it passed only
  because the remount was empty. Now its only road to `''` is the settle,
  through HomeTab's setter.
- **It is the only BEHAVIOURAL row that sees a dropped settle through the real
  component.** The landed §1 and §2 rows model the field and call
  `submitTypedPath` directly, so of the older rows only the two source
  regexes caught P2.

Restored with `git checkout ca909185 -- src/renderer/components/home/OpenByPath.tsx`.

## 5. Suite

Full `npm test` at `fc24e0a6` (fix plus this packet), run in the foreground,
exit 0:

| | Test Files | Tests |
|---|---|---|
| tip `fc24e0a6` | 607 passed \| 3 skipped (610) | 9149 passed \| 9 skipped (9158) |

- The failure-class reporter says "no failures in this run (610 module(s)
  reported)".
- The skip reporter says "9 SKIPPED test(s) in 7 file(s)" and "OK. Every skip
  named its reason".
- The new file is collected by `npm test`:
  `✓ src/renderer/components/home/__tests__/typed-path-field-classic-resident.test.ts (6 tests)`.
- In the same run: `typed-path-field-after-open.test.ts` 14/14,
  `typed-path-open.test.ts` 8/8 and `project-open-door-census.test.ts` 6/6.
- Every gate in the `npm test` chain printed OK. That includes
  `check-doc-citations`, `check-tsx-dashes`, `check-src-dashes` and
  `check-test-dashes`.
- `npx tsc --noEmit` exits 0 with no output, at `ca909185` and at `fc24e0a6`.

**Base was not run as a full suite.** Nothing failed at the tip, so no failure
needed a base comparison. The only rows this branch adds are the 6 in the one
new file.

## 6. Where the tree contradicted or extended the brief

1. **The flip is conditional** (section 1). There is no flip when an aeon
   `config` is left under the classic project. Base kept the text there. The
   booking read as if every classic resident flipped.
2. **The in-flight rule was broken across a classic switch as well**, not only
   the failure case (row 3). The same fix closes it.
3. **Pre-existing, not changed, filed for the overseer: a failed typed open
   CLOSES a resident classic project.**
   - `openDirectory` clears the store before it knows the outcome, and ends
     CLOSED with the error. So typing a bad path with a Sonic 1 project open
     puts the author on the no-project page.
   - Home stays there even if the project was fine a moment ago. The field now
     keeps the typo, but the project is gone from view.
   - Where an aeon project was opened earlier, the stale aeon `config`
     resurfaces instead. The scratch run above ended on the aeon project's
     page, with `classic status: closed` and `aeonConfig: "Aeon Checkout"`.
   - An aeon resident is not closed by a failed open.
   - Fixing that changes what the author sees (which project is open after a
     failure), so it is outside this parcel's "only the text survives" bound.
     No row here pins the page. The rows assert the text and, as premises,
     only the flip that happens today.

## 7. Foreground steps, tagged for the overseer

FOREGROUND OUTSTANDING. No app window was driven and no emulator was touched.

- **F-1.** Cold start, open a Sonic 1 disassembly. On Home, type a bad path
  into "…or type another project directory path" and press Enter. The red
  banner shows "… is not a recognized project". Home is now on its no-project
  page (section 6 item 3). The field there HOLDS the typo. Fix it and press
  Enter: it opens. (Before: the field was empty. This was F-4 of the
  home-path-field packet.)
- **F-2.** With the Sonic 1 project open, type another valid Sonic 1 path and
  press Enter. After the switch the field is EMPTY.
- **F-3.** With an aeon checkout open, repeat F-1. The field holds the typo,
  as before this branch.

## 8. Files

| file | what |
|---|---|
| `src/renderer/components/home/HomeTab.tsx` | owns the typed path; passes it to both sites |
| `src/renderer/components/home/OpenByPath.tsx` | `text` and `setText` props; no value state of its own |
| `src/renderer/components/home/__tests__/typed-path-field-classic-resident.test.ts` | the 6 rows |
| `docs/reviews/2026-09-11-classic-path-field-resident.md` | this packet |
