# home-path-field: a successful open empties Home's typed path field

Branch `parcel/home-path-field`, from master `105d0064`.
Code tip `d3d41f19` (commits `4fe727d3` reproduction, `d3d41f19` fix). This
packet and the ledger row follow it and change no code or test.

Lens row `HOME-PATH-FIELD-KEEPS-OLD-PATH`. Opened from observation O1 in
`docs/reviews/2026-09-11-cdp-sweep-2.md` (section 6), which the sweep hit for
real as harness defect 1 (section 5).

---

## Verdict: FIXED, on the ruling as given

- After a SUCCESSFUL open the field is emptied.
- After a failed open, a cancelled guard, a throw or a parse refusal, the text
  stays, so a typo is corrected in place.
- How a focus or a click treats the caret is unchanged. No select-on-focus, no
  caret move. That trade is the owner's open card `NUMBERFIELD-TAB-THEN-CLICK`
  (`docs/decisions.jsonl`), and it stays his.

The opener had to change as well as the field. It returned nothing, so the
field could not tell a success from a failure (section 2).

---

## 1. Where the field and its value live (base `105d0064`)

**The field.** `src/renderer/components/home/OpenByPath.tsx`, rendered twice by
`src/renderer/components/home/HomeTab.tsx`:

```
103:          <OpenByPath onOpenPath={onOpenPath} label="…or type a project directory path" />
215:        <OpenByPath onOpenPath={onOpenPath} label="…or type another project directory path" />
```

Line 103 is the no-project page. Line 215 is the project page's switch section,
and it is the field the sweep hit.

**The value.** It lives in component state, not in a store:

```
OpenByPath.tsx:56   const [text, setText] = useState('');
OpenByPath.tsx:74   function submit(): void { submitTypedPath(text, onOpenPath, setRefusal); }
OpenByPath.tsx:83   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
OpenByPath.tsx:91   <button onClick={submit} style={styles.go}>Open</button>
```

No line after `submit` touched `text`. Enter and the Open button are the only
two commit roads, and both call `submit`. There is no form, no `onSubmit` and no
commit on blur.

**What the open did.** `onOpenPath` is App's `openProjectByPath`
(`src/renderer/App.tsx:271-272`), which is `useProject.openPath`
(`src/renderer/hooks/useProject.ts:13-30`, base). It was typed
`(dir: string) => void`, and its body returned nothing on every road:

- **The guard cancelled:** `if (!(await confirmProjectOpen())) return;`
- **A classic project:** `'opened'` then `await recordRecentProject(dir, name);`
- **An aeon project:** `'not-classic'` then `await openAeonProject(dir);`. That call
  resolves `true` or `false` (`src/renderer/state/aeon-open.ts:67`), and the
  answer was dropped.
- **Neither kind:** `'error'`, with the notice set in the classic store
  (`src/renderer/state/classicProjectStore.ts:179`). That notice is the red
  banner (`App.tsx:235-248`).

## 2. Why the old path was still there

It is not a store. **Home is kept alive**:

```
App.tsx:268  {tabs.filter((t) => t.kind !== 'level' && ...).map((tab) => (
App.tsx:269    <div key={tab.id} style={{ ...styles.tabPane, display: tab.id === activeId ? 'flex' : 'none' }}>
App.tsx:271      <HomeTab onOpenProject={openProject} onOpenRecent={openProjectByPath}
App.tsx:272        onOpenPath={openProjectByPath} />
```

HomeTab does not remount when the tab is hidden and shown. **Whether the SAME
OpenByPath instance survives depends on which Home branch renders**, and that
comes down to `HomeTab.tsx:75`, `const noProject = !classicOpen && !config;`:

- **An aeon project is resident.** An aeon open never clears `config` until
  `openLoaded` replaces it. `setLoading` and `setError` leave it in place
  (`src/renderer/state/projectStore.ts:77-78`). So Home stays on its project
  branch throughout, the line-215 instance lives on, and its `useState` value
  with it. **This is the sweep's case:** C1 and C2 were aeon checkouts.
- **A classic project is resident.** The first statement of every open is
  `set({ ...CLOSED, status: 'opening', dir })`
  (`classicProjectStore.ts:103`). `classicOpen` goes false and `config` is null,
  so Home flips to its no-project branch. That branch's field is a different
  element at a different position (line 103), so React mounts a fresh instance.
  The field comes back empty whether the open succeeded or failed. See
  section 7.

## 3. The reproduction, red on base

`src/renderer/components/home/__tests__/typed-path-field-after-open.test.ts`,
committed alone as `4fe727d3` on top of base. The suite is node-only, so the
field is MODELLED:

- `text` starts as the typed path.
- `submitTypedPath` is called the way the component calls it.
- The fourth argument is the field's setter, called with an updater.

Base's `submitTypedPath` has three parameters, so the fourth is never called.
That is exactly what the component does with `text` on base.

```
× REPRODUCTION: after a SUCCESSFUL open the field is empty, not still holding the path
AssertionError: the field still holds the path it opened: expected '/tmp/cdps2-C2-QFtuP5' to be '' // Object.is equality
```

Red by ASSERTION. The row asserts its own premise first, that the opener ran,
so this is the success road.

## 4. The fix (`d3d41f19`)

- **`src/renderer/hooks/useProject.ts`.** The body moved out of the hook into a
  module-level `export async function openProjectPath(dir): Promise<boolean | undefined>`.
  It now reports what happened:
  - `true`: a classic project opened, or the aeon loader answered `true`.
  - `false`: the directory is neither kind, or the aeon loader answered `false`.
  - `undefined`: the guard stopped it.

  The hook returns the same function as `openProjectByPath`, and
  `openProject` (the dialog road) calls it. There are two reasons for the move:
  1. A node suite can execute it (section 5, §2).
  2. The guard line keeps its exact bare `return;`, which
     `shell/__tests__/project-open-door-census.test.ts` asserts, character for
     character.

  The census still sees the file as the one declared user door. Its walk skips
  `export … function` definition lines and still finds both switch calls after
  the guard.
- **`src/renderer/components/home/typed-path-open.ts`.** `submitTypedPath`
  now awaits the opener. On `true`, and on nothing else, it hands the field's
  setter the updater `fieldAfterSuccessfulOpen(current, submitted)`. That updater
  empties the field unless the person has already typed something different
  while the open was in flight (section 7).
- **`OpenByPath.tsx`.** It passes `setText` as the fourth argument, and its
  prop is typed by the new `TypedPathOpener`. `HomeTab.tsx` carries the same type
  on its prop. The input element itself is untouched.
- **`typed-path-open.test.ts`.** The §1 helper's opener is now async, and the §2
  seam regex expects `setText`.

## 5. Rows and their plants

14 new rows, all in the one new file. The plants were applied by a script
outside the repo. For each plant, the script:

1. applied an exact-anchor replacement, refused unless the anchor occurs exactly once;
2. read the file back from disk;
3. printed `git diff --stat` and the changed lines BEFORE the run;
4. ran the new file, `typed-path-open.test.ts` and the door census;
5. restored the file from the committed tip `d3d41f19` with `git show HEAD:<path>`;
6. checked `git status --porcelain`, which was clean after all 13 plants.

| # | row | reddened by |
|---|---|---|
| §1 | REPRODUCTION: a success empties the field | P1 |
| §1 | CONTROL: a failed open keeps the text | P3, P4 |
| §1 | a cancelled guard (opener resolves undefined) keeps the text | P2, P3, P4 |
| §1 | an opener that throws keeps the text, and the throw propagates | P4 |
| §1 | a parser refusal opens nothing and keeps the text | P12 |
| §1 | text typed while the open was in flight survives the success | P5 |
| §2 | the real opener: a classic project that opens resolves true | P6 |
| §2 | the real opener: neither kind resolves false, the store has the banner | P8 |
| §2 | the real opener: aeon resolves to the loader's answer, both ways | P7 |
| §2 | the real opener: a guard that says no resolves undefined, bridge never asked | P13 |
| §2 | THE SEAM: the field through the real opener empties after a real open | P1, P6 |
| §2 | THE SEAM, CONTROL: the field through the real opener keeps the text after a real failure | P3, P4, P8 |
| §3 | Enter and the Open button are the only roads, through one submit | P9 |
| §3 | focus and click unchanged: the input's exact attribute set, no selection or focus calls | P10, P11 |

| plant | on disk | reds |
|---|---|---|
| P1 | `// PLANT P1: no settle at all (the base behaviour)` replaces the settle line | 2 |
| P2 | `if (opened !== false) settle(` | 1 |
| P3 | `if (true) settle(` | 3 |
| P4 | `settle(() => ''); // PLANT P4: cleared on submit`, before the open | 4 |
| P5 | `return ''; // PLANT P5` in `fieldAfterSuccessfulOpen` | 1 |
| P6 | the classic success `return true;` becomes `return;` | 2 |
| P7 | `await openAeonProject(dir); return true;` (the aeon answer dropped) | 1 |
| P8 | the final `return false;` becomes `return true;` | 2 |
| P9 | the Open button calls `submitTypedPath` itself with a no-op setter | 1 |
| P10 | `onFocus={(e) => e.currentTarget.select()}` on the input | 1 |
| P11 | `autoFocus` on the input | 1 |
| P12 | a parser refusal also calls `settle(() => '')` | 1 |
| P13 | `await confirmProjectOpen();` (the guard's answer dropped) | 2: the §2 guard row AND the census's guard-shape row |

**Every red is an expectation mismatch, and none is a TIMEOUT or a runtime
fault.** Most print as `AssertionError`. The four §2 rows written as
`expect(promise).resolves` print as `Error: expected true to be false` (P7, P8)
and similar (P6, P13), because vitest's `.resolves` rethrows the mismatch as a
plain `Error`. The message is still the expectation's.

**What the §3 rows are.** They are the weaker evidence, read from source
because there is no DOM here:

- Row 13 pins the two commit roads and their one call site.
- Row 14 pins what the input carries TODAY: `aria-label`, `autoCapitalize`,
  `autoCorrect`, `onChange`, `onKeyDown`, `placeholder`, `spellCheck`, `style`,
  `value`. A focus, click, pointer or selection handler, a ref, or an
  `autoFocus` goes red.

Its scanner counted two `<input` at first. One was the element, and the other
was the header's prose "`` `<input>` ``", which the row's own exactly-one check
caught. It now matches `<input` followed by whitespace.

## 6. Suite

| | Test Files | Tests |
|---|---|---|
| base `105d0064` | 604 passed \| 3 skipped (607) | 9083 passed \| 9 skipped (9092) |
| tip `d3d41f19` | 605 passed \| 3 skipped (608) | 9097 passed \| 9 skipped (9106) |

- Both runs exit 0. The tip run's failure-class reporter says "no failures in
  this run (608 module(s) reported)".
- `9106 - 9092 = 14`, the rows added, and one new file.
- `npx tsc --noEmit` exits 0 with no output at both.

## 7. Where the tree contradicted or extended the brief

1. **"After a failed open, keep the text" does not hold with a CLASSIC project
   resident, before or after this fix.** As section 2 shows, the classic
   store's first write flips Home to its no-project branch. That mounts a
   different OpenByPath, so the typed text is gone after a failure too. The fix
   keeps the text only while the instance survives, which is:
   - an aeon project resident;
   - no project open (both branches stay on the no-project page through a
     failure).

   Closing the classic case means lifting the value out of OpenByPath, for
   example into HomeTab, which is itself kept alive. That makes the two render
   sites share one value, which is a design change beyond "fix it minimally".
   So it is filed here, not made. Foreground step F-4 below checks the source
   reading.
2. **The field could not see success.** The brief frames the fix as the field's.
   On base the opener returned nothing on every road, so the opener had to start
   reporting. That also meant restructuring `useProject.ts` so it could be
   executed, since no test ran the hook.
3. **One addition beyond the ruling.** A success empties the field only if it
   still holds the text that was submitted. A project load takes seconds, and
   the field stays live through it. Anything typed in that window belongs to the
   person, and clearing it would be this fix's own version of the defect. The
   row is reddened by P5.
4. **Pre-existing, unchanged.** An opener that throws (for example, the
   recents write after a classic open) still surfaces as an unhandled
   rejection. The component dropped the promise on base, and it drops it now
   with `void`. The field keeps its text in that case (P4 row).

## 8. Foreground steps, tagged for the overseer

No emulator was touched, and no app window was driven. Each step needs a real
screen.

- **F-1.** Open aeon checkout A. On Home, type checkout B's path into "…or type
  another project directory path" and press Enter. B opens. Go back to Home:
  the field is EMPTY. (Before: it held B's path.)
- **F-2.** Same field, same state. Type a path with a typo and press the Open
  button. The red banner shows "… is not a recognized project". The field
  still holds the typo, and a click puts the caret where you click. Fix the typo
  and press Enter: it opens.
- **F-3.** Tab into the field, then click inside the text. The caret behaves
  exactly as before this branch (browser default; no select-all added).
- **F-4.** Open a Sonic 1 disassembly, then type a bad path into the switch
  field and press Enter. The field comes back EMPTY with the banner. This is
  section 7 item 1, confirming the source reading; it is not a regression.

## 9. Files

| file | what |
|---|---|
| `src/renderer/hooks/useProject.ts` | `openProjectPath`, reporting its outcome |
| `src/renderer/components/home/typed-path-open.ts` | `TypedPathOpener`, the settle on success, `fieldAfterSuccessfulOpen` |
| `src/renderer/components/home/OpenByPath.tsx` | passes `setText`; prop type |
| `src/renderer/components/home/HomeTab.tsx` | prop type |
| `src/renderer/components/home/__tests__/typed-path-field-after-open.test.ts` | the 14 rows |
| `src/renderer/components/home/__tests__/typed-path-open.test.ts` | helper opener type; seam regex |
| `docs/lens-findings.jsonl` | one appended row, `HOME-PATH-FIELD-KEEPS-OLD-PATH` |
