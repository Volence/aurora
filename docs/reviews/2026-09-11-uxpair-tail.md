# The UX seat pair's tail: four small remainders, closed

**Branch** `parcel/uxpair-tail`, base master `5361cd67`. **Date** 2026-09-11.
**Question.** The census of the fifteen UX seat findings (the 2026-09-11 census packet, which is
on branch parcel/uxpair-census and not in this tree, so it is named rather than cited) left four
small remainders, none of them the owner's: B-F3's visibility half, B-F4's and B-F5's wording
halves, and A-F2's README half. This parcel closes them.
**Not done.** No emulator. No app launch, no CDP run, no build. Every pixel claim below is
derived from source and tagged for a foreground run in §6. Nothing in the save feedback, toast
or save-result code was touched (`src/renderer/state/classic-save.ts` and the save toast
belong to parcel/a-f3-art-save-width).

---

## 0. The answer

| Item | Severity | Outcome | Commit |
|---|---|---|---|
| B-F3 visibility half | medium | **DONE**: window title marker, and the dot on the level's Explorer row and group header | `91d24d98`, seam fix `cbcd60f9` |
| B-F4 wording | low | **DONE**: ENOENT and ECONNREFUSED read as sentences naming the path | `cc702b82` |
| B-F5 wording | low | **DONE**: the empty filter says the true state | `ed930e27` |
| A-F2 README | low | **DONE**: Ctrl+S and Ctrl+Shift+S named | `c3e0d52a` |

Nothing BLOCKED. No row in `docs/decisions.jsonl` was needed: d-38 delegated wording and
placement to the lane, and the overseer made the look calls.

---

## 1. B-F3: after a dirty level tab closes, the screen still says unsaved work exists

### 1.1 Reproduced from source first: where the closed tab's edits live

The close is `requestCloseTab` in `src/renderer/shell/tab-activation/dispatch.ts`. It calls
`useSessionStore.getState().close(id)` (line 209; line 190 for a background tab), and the
reducer behind that, `closeTab` in `src/core/shell/session.ts`, is a pure filter (line 44):

```
const tabs = state.tabs.filter((t) => t.id !== id);
```

Nothing subscribes to the tab list to unload an act (the only `useSessionStore.subscribe` in
`src/` is session persistence in `src/renderer/shell/session-lifecycle.ts`). The close's own
comment says so, `dispatch.ts` lines 122 and 123:

```
// one line up). It is FALSE of a level: closing the tab unloads nothing. The
// act stays resident, its unsaved edits stay unsaved, and reopening the tab
```

and line 137 keeps the undo stack while the act is dirty:

```
if (!levelDocDirty(id, snapshot)) documentHistoryHub.dispose(id);
```

So the edits stay where they were made: a classic edit in `useClassicLevelStore` (`doc` beside
`dirty`, set in `applyCommit`, `src/renderer/state/classicLevelStore.ts` line 815
`dirty: { ...s.dirty, ...dirtyPatch }`), an aeon edit in `useEditorStore` (`dirty`,
`dirtyActs`). The save contract is unchanged by this parcel: no prompt (d-38), no discard, no
new plumbing. Every new surface reads the existing `DirtySnapshot` (`src/renderer/shell/dirty-snapshot.ts`).

### 1.2 What was missing, and what changed

`src/renderer/shell/TabStrip.tsx` said, correctly, *"THE DOT IS THE ONLY PLACE THE APP SAYS
UNSAVED"*, and the close takes the dot away. The ruling was two surfaces:

- **(a) Window title.** A leading `● ` while any open document is unsaved:
  `Aurora - OJZ Project` becomes `● Aurora - OJZ Project`. The rule is `windowTitle`
  (`src/renderer/shell/window-title.ts`), fed by `hasUnsavedWork`
  (`src/renderer/shell/dirty-tabs.ts`), which is derived from `unsavedKinds`, the same list the
  "Ctrl+S wrote nothing" toast names, so the title and the toast cannot disagree. The title is
  set by `src/renderer/shell/WindowTitle.tsx`, a component that renders nothing, not by an
  effect in App: the dirty snapshot subscribes to the history clock, so its host re-renders on
  every edit, and in App that host would be the whole window. The marker goes first, not last,
  so a truncating taskbar keeps it; `●` in front of the title is VS Code's convention, and this
  shell already borrows its chords (Ctrl+Shift+P, Ctrl+Shift+B).
- **(b) Explorer.** The level's row carries the same dot the tab used, via `explorerRowDirty`,
  which delegates to `tabHasDirtyDot` rather than restating it, so the row and the tab give one
  answer about one level. The Levels group header repeats the dot (`explorerGroupDirty`),
  because groups start collapsed and a dot inside a folded group is a dot nobody sees. Both
  draw `DirtyDot` (`src/renderer/shell/DirtyDot.tsx`), now the one definition the tab strip uses
  too. The Explorer dot's hover text differs from the tab's on purpose. The tab's says
  *"Ctrl+S to save"*, which is false in the Explorer in exactly this case: the level's tab is
  closed, so Ctrl+S acts on some other tab. It says *"Ctrl+Shift+S saves everything that has
  somewhere to go"*, in the existing toast's own words.

The TabStrip comment now says three places carry the state, and names them.

**Only level rows dot.** A sprite or canvas document's close is confirmed and discards, so a
dirty one always keeps its tab and its dot. **Aeon dots every act row** while the project is
dirty, because that is what the tab rule does (spec §10, honest aggregate; an aeon Ctrl+S saves
the project). A per-act Explorer dot is possible off `dirtyActs`, but it would disagree with the
tabs, so it is not done here. If it is wanted, the tab rule should move with it.

**One instrument adjusted.** `scratchpad/canvas-cdp-harness.mjs`'s `dirtyDots` and
`dirtyTabLabels` scanned the whole document for `span[title^="Unsaved changes"]`. They are now
scoped to `[role="tablist"]`, which is what their names say they count. The save-contract
harness's `DOT_ON_SCREEN` was already scoped. Neither harness was run (no app launch).

### 1.3 Rows

`src/renderer/shell/__tests__/unsaved-after-close.test.ts`, 15 rows. The receipt row drives the
real `requestCloseTab` on a dirty classic tab, asserts the tab is gone and the store still dirty,
then asserts that the title rule, the Explorer row rule and the group rule all say unsaved, and
that act 2's row does not. Its CONTROL drives a clean close and expects the old title exactly.
The rest cover the rules (agreement with `tabHasDirtyDot` over four snapshots, the aeon
aggregate, no non-level row ever dotting, `hasUnsavedWork` against the toast's list for every
kind, the title format both ways) and the seams (read as text: WindowTitle sets `document.title`
from the rule, App mounts it on a line of its own and no longer sets the title, the Explorer
passes `explorerRowDirty` and `explorerGroupDirty` into the dot, the tab strip draws `DirtyDot`
and no longer claims to be the only place).

## 2. B-F4: the dead-socket sentence

`AetherClient.onClose` (`src/main/aether/client.ts`) relayed `Aether socket error:
connect ENOENT <path>` into the renderer's refusal toast verbatim. Consumers checked before
changing it: the toast (`src/renderer/state/aetherStore.ts` `connect`, prefix
`Aether: could not connect. `) and `src/main/aether/__tests__/socket-dead-link.test.ts`. No
code matches the text (`git grep` for `socket error`, `ENOENT` and `ECONNREFUSED` over
`src/main`, `src/renderer`, `src/shared` and `test/` finds only those two and one renderer test
fixture that relays a stub string verbatim).

`describeSocketError` now words the two refusals the client already tells apart:

- ENOENT: `No emulator is listening at <path>. There is no socket file at that path (connect ENOENT).`
- ECONNREFUSED: `No emulator is listening at <path>. A socket file is there, but nothing answers on it; an emulator that has exited can leave one behind (connect ECONNREFUSED).`

Both name the path and keep the errno in brackets, so the two existing socket-dead-link rows
(which assert the errno and the path) still hold. Any other errno keeps the raw relay. The
aetherStore comment that called this "the main process's call" is updated.

Rows: three on the same two real unix-socket fixtures (the ENOENT sentence, the ECONNREFUSED
sentence, the two distinguishable with the paths taken out) and two CONTROLs (an unmeasured
errno and an error with no code keep the raw relay).

## 3. B-F5: the empty-filter sentence

With no project open the tree lists only Recent Projects, so `No matches` on a cold Home was
false: there was nothing to match. `explorerEmptyState` (`src/core/shell/explorer.ts`) now takes
the unfiltered group count and picks the sentence:

| state | text |
|---|---|
| project open, filter matched nothing | `No matches` (unchanged) |
| no project, recents listed, none match | `No recent project matches` |
| no project, nothing listed | `No project is open, so there is nothing to filter` |

`Explorer.tsx` renders the rule's `message` instead of a literal. The Open Project behaviour is
untouched (`openProject` still never consults the query) and its rows all still hold. Rows in
`src/core/shell/__tests__/explorer-empty-state.test.ts`: the three sentences, the message
present exactly when `noMatches` is over a 30-case grid, the three sentences distinct, and a seam
row that the component renders the rule's sentence and has no `No matches` JSX text of its own.

## 4. A-F2: the README names the save gesture

`README.md`'s editing paragraph now says Ctrl+S saves the document in the active tab (a level's
Save button, beside Undo and Redo, does the same) and Ctrl+Shift+S saves every unsaved
document that has a file to go to. Checked against source: the level Save chip calls
`saveActive` (`src/renderer/shell/SaveChip.tsx`), as Ctrl+S does (`src/renderer/App.tsx`), and
Ctrl+Shift+S calls `saveAllDirty`. The sprite header's Save was not traced, so it is not claimed.
The two em dashes in that paragraph are now brackets. **No gate reads `README.md`:** the dash
gates cover source, tests, scripts and the imported guides, so this was by hand. 25 other README
lines still carry an em or en dash; sweeping them is not in this brief.

## 5. Red-first, every added row

Each mutation was applied on disk after the commit it tests, shown with `git diff -U0`, run, and
restored with `git checkout --` from that commit.

| Commit | Mutation | Rows red |
|---|---|---|
| `cc702b82` | `onClose` back to the raw relay | the ENOENT and ECONNREFUSED sentence rows (2) |
| `cc702b82` | ECONNREFUSED returns the ENOENT sentence | the distinguishable row, plus the two it now contradicts (3) |
| `ed930e27` | A: no-project branch returns `No matches`; B: Explorer renders the literal | the F5 screen, the B-F5 row, the recents row (A); the seam row (B) (4) |
| `ed930e27` | C: message defaults non-null, recents constant equals `No matches`; D: project-open branch says nothing-to-filter | the whitespace row, the CONTROL, the grid row, the distinct row (4) |
| `91d24d98` | `hasUnsavedWork` and `explorerRowDirty` return false | the receipt row, the agreement row, the aeon aggregate row, both `hasUnsavedWork` rows (5) |
| `91d24d98` | title always prefixed; `explorerRowDirty` routes sprite and canvas ids to their own kinds; the classic and aeon Explorer ids respelled | the row-id row, the receipt row, the clean CONTROL, the aeon loud row, the non-level row, the clean-title row (6) |
| `91d24d98` | marker as a suffix; row `dirty={false}`; the old TabStrip line put back | the receipt row, the marker-first row, the Explorer seam, the tab strip seam (4) |
| `cbcd60f9` | `<WindowTitle />` unmounted; `App` renamed `Main` | the App seam row, the loud file row (2) |

**What red-first found.** At `91d24d98` the App seam row stayed **green** with the
`<WindowTitle />` mount deleted: it was `toContain('<WindowTitle />')`, and App.tsx's own comment
names that element. `cbcd60f9` anchors it to a JSX line of its own, and it went red. In the same
run my first loud-row mutation (`App` renamed `AppRoot`) left the row green because the substring
survived. That was a flawed mutation, not a flawed row, and `Main` reddened it.

## 6. FOREGROUND, one run per item

| # | Item | The run |
|---|---|---|
| F-1 | B-F3 | Open a project, open a level tab, place one object, press the tab's close. Expect `document.title` to start with `● Aurora - `, the Explorer's Levels header to show the emerald dot while collapsed, and the level's row to show it once expanded (aeon: every act row). With the tab gone, a full-DOM scan for `aria-label="Unsaved changes"` must be non-empty; seat B's own instrument (any element whose `title` matches `/unsaved/i`) must be too. Then Ctrl+Shift+S: dots and marker clear |
| F-2 | B-F4 | `ORACLE_SOCKET` at a short path with no file, press `Aether ◇ offline` once: the error toast reads `Aether: could not connect. No emulator is listening at <path>. There is no socket file at that path (connect ENOENT).` Then leave a dead socket file at that path (bind, then SIGKILL, the recipe in `src/main/aether/__tests__/socket-dead-link.test.ts`) and press again: the toast says a socket file is there but nothing answers on it |
| F-3 | B-F5 | Cold Home with no recent projects, type `zon` into `Filter…`: `No project is open, so there is nothing to filter` with `Open Project…` still painted. With a recent project listed: `No recent project matches` |

A-F2 needs no run.

## 7. Where the brief and the tree disagree

1. *"The repo's prose gates in `npm test` enforce it"* (no em or en dashes, README included).
   They do not reach `README.md`; §4.
2. *"the level's entry in the Explorer tree carries the same marker the tab dot used, while it
   is dirty"*. It does, but the Explorer's Levels group starts **collapsed**, so a row marker
   alone would be unpainted until a person expands the group. The group header carries it too.
   That is the same surface, not a third one. The collapsed 44px rail carries no dot.
3. The census packet the brief names is not in this tree (it is on parcel/uxpair-census), so
   this packet names it in plain text rather than as a checked citation.

## 8. Verification

`npm test` at base `5361cd67`: `Test Files 600 passed | 3 skipped (603)`, `Tests 8962 passed |
9 skipped (8971)`, exit 0. The tip run is taken after the ledger row is committed, and its totals
are in the landing report: a packet committed before that run cannot honestly carry them.
