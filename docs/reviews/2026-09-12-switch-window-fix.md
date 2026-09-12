# switch-window-fix: a project switch refuses to commit over an edit made after consent

Branch `parcel/switch-window-fix`, from master `b2116bc4`.
Parcel `SWITCH-WINDOW-EDIT-DROPPED`, remedies (c1) and (c3), as ruled by the hub under the
owner's standing delegation (`docs/reviews/2026-09-12-rulings-asked.md`, section "Rulings
received"). Measurement: `docs/reviews/2026-09-12-switch-window-measure.md`.

---

## Verdict

While a project switch loaded, the project being left stayed editable, and an edit made in
that window was thrown away by the commit with no dialog. Now each commit point compares the
edit counters with a **consent token** taken when the switch was agreed to. If anything that
commit would discard was edited since, the open does not commit. It fails the way a failed
open already fails: the resident project stays open with the edit, its dirty flag and its
undo, and the reason goes to the error channel that already exists. No new dialog and no new
on-screen state.

(c3) landed after (c1), in its own commit: an aeon commit now clears `editorStore`'s dirty
state beside `documentHistoryHub.clearAll()`, after (c1)'s check.

| direction (the measure packet's rows) | before | now |
|---|---|---|
| classic to classic, clean before | edit gone, `dirty {}`, no undo, no word | open cancelled; edit, `dirty.start`, undo all still there |
| classic to classic, Discard & open | same | same as above |
| classic to aeon | edit gone, classic closed | open cancelled (aeon error channel); classic project still open with the edit |
| classic same-dir re-validate (Setup door) | edit gone, act unloaded | open cancelled; act still loaded with the edit |
| aeon to aeon, clean / Discard & open | edit gone, old dirty flag left on the NEW project | open cancelled; aeon project still open with the edit, dirty, undo |
| aeon to classic | aeon edit stranded behind classic precedence, unsavable | open cancelled (classic error channel); aeon still the open engine, edit savable |
| any direction, nothing edited in the window | commits | commits (controls, every direction) |

## 1. What changed

| commit | what |
|---|---|
| `180142a6` | (c1): the token, the two serials, the two commit-point checks, the doors' capture points, the guard comment and census corrections, 95 suite rows |
| `67f5cb9e` | tests: two rows could not tell a same-directory commit from a refusal; now they can (section 5, M1 and M5) |
| `d811f540` | (c3): `markClean` at the aeon commit, after (c1)'s check; 6 rows |
| `4f4a022e` | tests: the (c3) hard-dirty row could not fail; now it can (section 5, M8) |
| this commit | this packet |

Files, by commit:

- `src/renderer/state/edit-consent.ts` (new): `EditConsent`, `captureEditConsent`,
  `CommitLoses`, `editedSinceConsent`, `openCancelledMessage`, `editedSinceConsentMessage`.
- `src/renderer/state/classicLevelStore.ts`: `classicEditSerial()`, a module-level counter.
- `src/renderer/state/editorStore.ts`: `aeonEditSerial()`, a module-level counter.
- `src/renderer/state/classicProjectStore.ts`: `openDirectory(dir, consent?)` and its check.
- `src/renderer/state/aeon-open.ts`: `openAeonProject(dir, consent?)`, its check, and (c3).
- `src/renderer/hooks/useProject.ts`: the user road takes the token and passes it to both primitives.
- `src/renderer/components/setup/ProjectSetupTab.tsx`: the Setup door takes it and passes it.
- `src/renderer/shell/project-open-guard.ts`: comments only (section 7, point 1).
- `src/renderer/shell/__tests__/project-open-door-census.test.ts`: `DOORS` text, two new source rows.
- `src/renderer/components/home/__tests__/typed-path-field-after-open.test.ts`: one assertion
  now reads `openAeonProject`'s directory argument only (the second argument is the token).
- `src/renderer/state/__tests__/switch-window-edit.test.ts` (new): 101 rows.

`docs/ROADMAP.md` section 5.1 carries no row for this item (searched for SWITCH-WINDOW,
switch-window and EDIT-DROPPED), so it is not edited.

## 2. The token

Taken by `captureEditConsent()`. Every field moves for an edit and for nothing else, because a
field that moved for a non-edit reason would refuse a legitimate open.

| field | what it is | why not the obvious alternative |
|---|---|---|
| `classic` | `classicEditSerial()` | `domainGen`, which the brief named: `openAct` and `reset` put it back to `{}`, and neither is an edit. After Discard & open `domainGen` is non-empty, so an act switch inside the window would read as an edit. Measured by the control row "a classic act switch (openAct)". |
| `aeon` | `aeonEditSerial()` | `dirtyActs`: it goes down on an undo and to `{}` on a save or a discard. |
| `sprites`, `canvases` | `dirtySpriteDocIds()`, `dirtyCanvasDocIds()` as sets | see below |
| `composer` | `useArtStore.getState().open`, compared by identity | see below |

**Sprite, canvas and composer documents are IN, and why.** The brief asked me to decide from
source.
- They are lost at a switch just as a level is. `resetProjectRuntime`
  (`src/renderer/state/project-runtime.ts`) closes all three when the session key changes, and
  every aeon commit replaces the composer document (`openDocument` / `closeDocument` in
  `aeon-open.ts`).
- The guard closes all of them at consent (`endDocumentSession` in `project-open-guard.ts`), so
  on a guarded door a dirty one at the commit was opened and edited inside the window.
- The measure packet lists them as reachable (its section 4, the last row).

**Why sets and not counters.** The stores have no monotonic edit counter to read. On every door
where a document can be lost, the set is empty at consent: the guard closed them, and the
agent door refuses on any dirt. So "newly dirty" means "edited since consent" there.

**The limit of that, stated.** A document already dirty at consent and edited again inside the
window is not seen. That can happen only on the Setup door, where the session key does not
change and the document survives anyway, and on the debug doors, which discard pre-existing
dirt by design.

**What a commit discards is the commit point's to say** (`CommitLoses`):

| | classic commit (`openDirectory`) | aeon commit (`openAeonProject`) |
|---|---|---|
| `classicLevel` | always (the level-store reset) | always (`closeResidentClassicProject`) |
| `aeonProject` | only when no classic project is resident: then aeon is the open engine and the commit masks it. Under a resident classic project it is masked already. | always (`openLoaded` replaces it) |
| `documents` | when the session key changes (`openProjectDir() !== dir`) | same |
| `composer` | same | always |

So a same-directory re-validate does not refuse over a document it would not lose. That is
measured by a control row.

## 3. Every writer of every generation in the token, with its verdict

Found by what moves the value, not by the field name. Both serials are module-level
`let`s, so no `setState` can write them. Their writers are exactly the bump statements, and
the callers of those.

**`classicEditSerial`**, bumped at `classicLevelStore.ts:832` (`applyCommit`), `:667`
(`writeLayoutSnapshot`) and `:689` (`writeArtSnapshot`).

| writer | reached from | edit? |
|---|---|---|
| `applyCommit`, through `commitLayout` / `commitArt` | the 12 classic commands: `classicSetLayoutCells`, `classicEditChunkCells`, `classicEditBlock`, `classicEditTiles`, `classicPaintSurface`, `classicCommitCanvas`, `classicSetPalette`, `classicSetColind`, `classicSetObjects`, `classicAddChunk`, `classicAddBlock`, `classicSetStart`. Their callers are the classic surfaces (`ClassicLevelViewport`, `TileTab`, `BlockTab`, `ChunkTab`, `CommitPlanView`, `collision-dispatch`, `palette-classic`), the agent's classic tools and `debug-level-edit.ts`. None is an effect, a timer or a subscription. | yes |
| `writeLayoutSnapshot`, `writeArtSnapshot` | `ClassicLayoutHistory` / `ClassicArtHistory` undo and redo (the only production caller, via `history-factories.ts`) | yes: an undo or redo changes the doc |
| `openAct`, `reset`, `markDomainsClean`, the cold-open level reset | none of them bumps it | not writers (controls: "a classic act switch", "a classic save clearing the level") |

**`aeonEditSerial`**, bumped at the entry of `markDirty` (`editorStore.ts:905`) and `markUndone`
(`:935`), whatever branch either takes.

| caller | site | edit? |
|---|---|---|
| `executeCommand`, `executeAmbientCommand` | `editorStore.ts:1102`, `:1183`. Their callers are every aeon surface's gestures and panel actions (`MapViewport` keyboard, mouse and stroke ends, `CollisionPalette`, `SectionGridNav`, `ChunkLinkOptions`, `map-flip`, the effects panels, `PaletteEditor`, `ComposerCanvas`, `TilesetPanel`, `chunk-doc-commit`, `art-composer-save`, the `palette-aeon`, `properties-aeon` and `band-follow` ports) and the agent's aeon tools. None is an effect, a timer or a subscription. | yes |
| bare `markDirty()` | `MapViewport.tsx:2433`, `:2498`, `:2595` (gesture-time writes), `MarqueePasteOptions.tsx:202`, `chunk-library-import.ts:211`, `:287`, `art-composer-save.ts:268` | yes |
| redo, undo | `history-factories.ts:55` (`markDirty({ undoable: true })`), `:54` (`markUndone`) | yes |
| `markClean`, `markActsClean` | the guard's Discard, (c3), the aeon saver | not writers (controls: "an aeon discard", "an aeon save clearing the act") |

**The document sets.** A document ID enters the set when a writer marks it dirty.
- sprite: `recordEdit` (every mutating sprite action) and `setSteps`. `setUnsavedEdits` is
  only ever called with `false` (`export-sprite.ts`). Edits.
- canvas: `setPixels`, `setPalette`, `setProfile`, `setGridOrigin`. Edits. Opening, loading,
  saving and closing never add an ID (control: "a canvas document opened and left
  unedited").
- composer: `markOpenDirty` (the four `ComposerCanvas` strokes, edits); `setOpenDirty` from
  `composer-history.ts:66` (an undo or redo restoring a dirty snapshot, an edit); and
  `confirmArtDocumentOpen` with `dirty: true` from `MapViewport.tsx:2022` and `:4449` (a
  region copied off the map into a new unsaved document). That last one is a user gesture
  creating unsaved work the switch would destroy, so it counts. `openDocument` with
  `dirty: false` never counts.

**One conservative consequence.** An edit and its own undo, both inside the window, move a
serial twice and leave the content where it was, and that open is refused. Nothing is lost
by the refusal, and the brief specified exactly this counter.

## 4. The doors, and how each takes its token

From the callers of the two primitives at the tip, not from the brief's list. They match it:
six call sites in four files, and the census row "no production module reaches a project
switch except through a declared door" holds.

| door | site | token |
|---|---|---|
| the user road (Explorer and hero "Open Project...", Home, recents, palette) | `useProject.ts:40` `openDirectory(dir, consent)`, `:49` `openAeonProject(dir, consent)` | taken right after `await confirmProjectOpen()` resolves, passed to both |
| Project Setup re-validate | `ProjectSetupTab.tsx:221` `openDirectory(dir, consent)` | taken at `apply`'s start, and taken again at its dialog's answer, before its save |
| the agent's `classic-open-project` | `agent-handler.ts:1370` `openDirectory(req.dir)` | the primitive's default argument, at its start. The door's refusal check is synchronous, so that is the door's start. No change to this file. |
| `__dbg.openDir`, `__dbg.aeon.open` | `debug-hooks.ts:2143`, `:1197` | the primitive's default, at its start |

**Deviation from the brief, stated.** The brief puts the token "when the guard answered". It is
taken in the door one await-resumption after the guard's `return true`, not inside the guard.
`confirmProjectOpen` keeps its boolean API. Three test files mock it
(`classic-failed-open.test.ts`, `typed-path-field-after-open.test.ts`,
`typed-path-field-classic-resident.test.ts`, one with `mockResolvedValueOnce(false)`). A new
guard API would have silently stopped those mocks biting. The gap is only the await's own
microtask resumption, and the microtasks that drain there are the ones the guard's answer
itself triggered: a dialog click, or its save's last IPC reply. No edit hangs off either. If the
owner wants it inside the guard, it is a new function plus those three mocks.

## 5. Red first, per row

Every mutation was shown on disk against HEAD before its red run. Every restore was
`git checkout <own commit> -- <path>`, and each run's totals are quoted from the whole run.
File under test: `src/renderer/state/__tests__/switch-window-edit.test.ts` (swe), plus the
door census where it applies.

| # | mutation (on disk) | red run | what went red | notes |
|---|---|---|---|---|
| M1 | both commit-point checks reverted: `git checkout b2116bc4 -- classicProjectStore.ts aeon-open.ts`, 2 files, 69 deletions, including `if (cancelled) return fail(cancelled);` and `store.setError(cancelled);` | 05:12:49, `44 failed \| 51 passed (95)`, all assertion | the cancellation and still-open rows of every refusal scenario (7 directions, 2 agent, 2 document); every control green | rows green without the fix, as the measure packet predicts: aeon to classic's edit, dirty and undo (the edit is stranded, not dropped); aeon to aeon's "still dirty" (the stale flag); the canvas "still open" row (node runs no key-change reset); and the same-dir "still open" row, which could not discriminate. That last one was fixed in `67f5cb9e`, see M1c. |
| M2 | token taken BEFORE the guard in `useProject.ts` | batch A, 05:14:20 | control "an edit made while the dialog is up, then Discard & open" (2 rows); census "the user road takes its consent token after the guard" | |
| M3 | `editSerial += 1` added to `openAct`, `markDomainsClean`, `markActsClean`, `markClean` | batch A | controls "a classic act switch", "a classic save clearing the level", "an aeon save clearing the act", "an aeon discard" (8 rows) | |
| M2 x M3 | the two together | batch A | control "aeon to aeon, Discard & open" (2 rows) | **an interaction, not a single mutation's red**: M2 moves the capture before Discard's `markClean`, and M3 makes that `markClean` bump. I had predicted batch A's red sets were disjoint. For this row they were not, so every later mutation ran alone. |
| M4 | documents dropped, written `false && (sprite/canvas) \|\| (composer)` | batch A | only the canvas document row (2 rows) | **applied and still green for the composer rows**: operator precedence left the composer half live. Redone as M4b. |
| M6 | Setup passes no token: `openDirectory(dir)` | batch A | census "the Setup door retakes its token at its dialog answer" | |
| | batch A totals | 05:14:20, `16 failed \| 87 passed (103)` over swe plus census, all assertion | | |
| M4b | both document halves dropped: `false && ((...) \|\| (...))` | 05:15:45, `5 failed \| 90 passed (95)` | both document refusal scenarios (canvas 2, composer 3) | the same-dir canvas control correctly stays green |
| M5 | key-change precision dropped at the classic commit: `documents: true, composer: true` | 05:16:12, `1 failed \| 94 passed (95)` | control "a canvas edited inside a same-directory re-validate", "reports success" only | "the switch commits" could not discriminate (same directory either way). Fixed in `67f5cb9e`, re-run: 05:17:49, `2 failed \| 93 passed (95)`, both commit rows red. |
| M1c | classic commit point only: `git checkout b2116bc4 -- classicProjectStore.ts` | 05:18:18, `29 failed \| 66 passed (95)` | every refusal row committed at the classic point (classic to classic x2, same-dir now including "still the open project", aeon to classic, both agent rows, canvas document); every aeon-commit row green | re-proves `67f5cb9e`'s same-dir row |
| M7 | the user road stops passing its token to `openAeonProject(dir)` | 05:18:41, `17 failed \| 86 passed (103)` over swe plus census | classic to aeon, aeon to aeon x2, the composer document row, census user-road row | the edit lands during the classic bridge's detect, before the loader's own default token |
| M8 | (c3) reverted: the `markClean` line removed from `aeon-open.ts` | 05:20:55, `2 failed \| 99 passed (101)` | "not marked dirty", "no edit count" | **the hard-dirty row stayed green**: the fixture's edit is a command (`undoable: true`), which never sets `hardDirtyActs`. The scenario now also takes a bare `markDirty()`, fixed in `4f4a022e`. Re-run: 05:22:18, `3 failed \| 98 passed (101)`, all three property rows red; the user-road (c3) control green, as stated. |

Green after the restores:
- 05:13:06, `95 passed (95)`, after M1.
- 05:19:03, `103 passed (103)` over swe plus census, with `git diff HEAD` empty after the last
  c1 restore.
- 05:22:46, the full suite below, with `git diff HEAD` empty after the M8 restore.

`uptime` load averages at those runs: 6.00, 16.61, 10.40, 7.81, 17.59, 12.91, 10.20, 7.19,
4.65 (1-minute, in the order above).

**The (c3) row, and a contradiction of the brief.** The brief's row, "a clean aeon to aeon open
ends with `dirty false`, `dirtyActs {}`", is green with or without (c3) under (c1). The user
road cannot reach an aeon commit with dirt resident: the guard cleans or refuses before
consent, and (c1) refuses anything edited after. So it is kept as a CONTROL, and the row that
measures (c3) drives `__aurora.aeon.open`'s body (`openAeonProject(dir)`, no guard) over a
project dirtied before the call.

## 6. Suite

Run in the foreground at `4f4a022e`, with `git diff HEAD` empty.

- `npm test` exited 0.
- Test Files: `613 passed | 3 skipped (616)`.
- Tests: `9347 passed | 9 skipped (9356)`. 0 failed.
- failure-class: "no failures in this run (616 module(s) reported)".
- skip-report: "OK. Every skip named its reason". The 9 skips are the pre-existing env-gated
  rows (the band-art foreground gate, the opt-in bench and their siblings), none of them in
  this parcel's files.
- In that run: `switch-window-edit.test.ts (101 tests)`, `project-open-door-census.test.ts (8 tests)`.
- Every gate in the chain printed OK.
- `uptime` before: `05:22:46 up 1 day, 18:44, load average: 4.31, 6.90, 6.55`; after:
  `05:23:22 up 1 day, 18:45, load average: 8.19, 7.50, 6.76`.
- `npx tsc --noEmit`: exit 0, no output.

After that run only this packet was added. The doc gates were run over it before its commit.

## 7. Where the tree contradicted the packet or the brief

1. **`project-open-guard.ts`'s "no production road" comment** (measure packet section 7,
   point 3): corrected as ruled. The two paragraphs now say "with the dirt ALREADY there" and
   "the only DOORS, not the only road". A dated section says what the window did and that
   (c1) now ends that road at the commit.
2. **The census's `ProjectSetupTab` entry "nothing is destroyed"** (section 7, point 4):
   rewritten. The re-open unloads the level. Every `DOORS` entry now says how its door takes
   the token.
3. **The token's classic half is not `domainGen`** (section 2). **The token is taken in the
   door, not in the guard** (section 4). **The (c3) row the brief names is vacuous under (c1)**
   (section 5).
4. **A cancelled aeon open still records its directory in recents.** The ruled check sits
   after `recordRecentProject`, the last await, which is the only place it can see an edit made
   during that IPC. The directory did load, and it is one the user asked to open.
5. **Three of my own rows could not fail when first written**: the same-dir "still open" and
   "commits" rows, and the (c3) hard-dirty row. My first document mutation (M4) was also
   incomplete. All four were caught by red-first and are fixed or redone as section 5 records.
6. **Not tested, stated:** an aeon edit made on a masked aeon project (only an agent's aeon
   tools can reach one under a resident classic project) during a classic to classic switch does
   not refuse. By design: that commit changes nothing for the masked project (`aeonProject` is
   `!resident`). No row constructs it.

## 8. Wording (PROVISIONAL, look-adjacent, for the owner)

One sentence, on the existing error banner (`App.tsx` renders `projectStore.error` or
`classicProjectStore.error`), and as the agent door's thrown error.

- Classic edit: **"Open cancelled: the level was edited while the new project was loading.
  Save or discard, then open again."** This is the measure packet's example, verbatim.
- Aeon edit: "Open cancelled: the aeon project was edited while the new project was loading.
  Save or discard, then open again."
- Document edit: "Open cancelled: an open sprite, canvas or art document was edited while the
  new project was loading. Save or discard, then open again."
- More than one cause is joined: "the level and an open sprite, canvas or art document were
  edited ...".

Built by `openCancelledMessage` in `src/renderer/state/edit-consent.ts`. The rows derive their
expectations from it rather than retyping it.

## 9. TAGGED for the controller (no app window was driven, no emulator)

- **T-1. The cancellation in the real window, both error channels.** A person cannot land an
  edit inside the window by hand, but the debug hooks make it deterministic, because each open's
  first await is an IPC round trip. So an edit issued synchronously in the same DevTools
  statement lands inside the window. In a `VITE_AURORA_DEBUG=1` build:
  1. Classic channel. Open an s1disasm checkout and load an act. Then:
     `const p = __dbg.openDir('<a second s1disasm directory>'); __dbg.classic.stampLayoutCell('fg'); await p`.
     Expect `'error'`, the classic banner with the level sentence, the first project still
     open, the stamped cell still there, and Ctrl+Z still undoing it.
  2. Aeon channel. Same resident classic project, then:
     `const p = __dbg.aeon.open('<the aeon checkout>'); __dbg.classic.stampLayoutCell('fg'); await p`.
     Expect `false` and the banner with the level sentence, from `projectStore.error`.
  3. Read the sentences on screen; they are provisional (section 8).

  The aeon-edit sentence has no verified synchronous aeon edit hook on `__dbg`
  (`collisionPoke` deliberately skips `markDirty`), so it is exercised by the node rows only.
- **T-2.** Not tagged: seeing the window by hand, for the reason the measure packet gives.

## 10. Commits

`180142a6`, `67f5cb9e`, `d811f540`, `4f4a022e`, and this packet's commit.

---

## 11. Rework after review (2026-09-12)

The coordinator reviewed tip `4bde0183` in a separate detached worktree. The code was
ACCEPTED, and on the deviations its words were: "All six are RATIFIED, and the reasons in
your packet are right." Two items came back on the same branch. Sections 1 to 10 above are
left as they were written.

### 11.1 Item 1: the aeon fixture read a peer's working tree (bar 19)

**The finding, and it was right.** `switch-window-edit.test.ts` copied the resident aeon
project out of `siblingPath('aeon')`, which is the aeon lane's live checkout, and opened that
checkout directly as the target. A half-written `project.json` there would have turned these
rows red with an error that names no peer.

**Fixed in `84b7533e`.** Both aeon directories are now materialised from a committed revision:
the resident one that gets edited (`aeon-resident`) and a separate target (`aeon-target`).
- `git -C <aeon> rev-parse origin/master` is resolved to a SHA once, at collection.
- `git -C <aeon> archive <sha> project.json games/sonic4/data` is read once and extracted into
  each directory.
- `GIT_*` variables are stripped, so a caller's `GIT_DIR` cannot redirect `-C`.
- The SHA is named in every aeon row's describe name, in the skip reason, and in the failure
  text. Archive and extract errors are prefixed "NOT AN AURORA REGRESSION".

**The aeon path appears only as a `git -C` argument.** Every occurrence of `AEON_GIT` in the
file (`grep -n AEON_GIT`):
- line 84: comment;
- line 85: comment;
- line 88: `const AEON_GIT = siblingPath('aeon');`
- line 95: the null check;
- line 96: `spawnSync('git', ['-C', AEON_GIT, 'rev-parse', ...])`
- line 102: skip-reason text;
- line 124: `spawnSync('git', ['-C', AEON_GIT!, 'archive', ...])`

No fs call names it. The only `siblingPath` call is line 88.

**Cost, measured.** 9,973,760 archive bytes, archived once and extracted twice in 18 ms (load
6.14 8.01 7.85, uptime 154708 s). Later runs took 28 ms, 18 ms and 19 ms. It is cheap, and no
data was vendored.

**`origin/master` moved inside this session.** It was `21cc137b` at my first read and
`8061d1dd` by the first test run. That is the point of naming the SHA: each run says which
committed tree it measured.

**Proof that no working tree is read: an unreachable peer.** The run below used
`EMPYREAN_SUITE_ROOT=/tmp/tmp.7VNGwU1IEZ` (an empty `mktemp -d`), at 05:37:17, load 8.87,
and vitest exited 0:

```
 Test Files  1 passed (1)
      Tests  54 passed | 47 skipped (101)
skip-report: 47 SKIPPED test(s) in 1 file(s). A SKIP IS NOT A PASS:
skip-report: OK. Every skip named its reason.
    [meta] SKIPPED, NOT PASSED: cannot measure an aeon project switch. Its fixture is materialised
    from a COMMITTED aeon revision (origin/master) by git archive, never from a working tree, and
    `git -C /tmp/tmp.7VNGwU1IEZ/aeon rev-parse origin/master` gave no commit (exit 128: fatal:
    cannot change to '/tmp/tmp.7VNGwU1IEZ/aeon': No such file or directory). This row measures
    nothing
```

All 47 skips are the aeon scenario rows, each named `[aeon (no committed revision)]`: 24
refusal rows, 3 document rows, 8 commit controls, 6 non-edit controls and the 6 (c3) rows. All
54 classic rows ran green.

**Red-first, re-run against the new fixture** (aeon `origin/master @ 8061d1dd6e92`). Each plant
was shown against HEAD before its run and restored with `git checkout 84b7533e -- aeon-open.ts`.
- **P1**, the aeon commit check disabled (`if (cancelled && false) {`). At 05:40:46, load 3.63:
  `18 failed | 83 passed (101)`, all assertion failures. The reds were every aeon-commit refusal
  row: classic to aeon (5), aeon to aeon clean (5), aeon to aeon after Discard & open (5), and
  the composer document row (3). The coordinator measured 18 too.
- **P2**, (c3)'s `markClean` removed. At 05:41:28, load 2.74: `3 failed | 98 passed (101)`. The
  reds were the three (c3) property rows: not marked dirty, no edit count, no hard-dirty mark.
- **Green after the restore**, at 05:42:00: `101 passed (101)`, with `git diff HEAD -- src/`
  empty.

### 11.2 Item 2: the on-screen check (bar 1)

**What was added.**
- `scratchpad/switch-window-onscreen-harness.mjs`, registered as
  `harness:switch-window-onscreen`. `check-harness-guards` reports 276 of 276 clean.
- Commits `51bf4063` (the harness), `f005d275` and `bb42d075` (fixes from runs 1 and 2),
  `ca3cfa26` (captures, plus an unbroken comment path).

**How it is set up.**
- A `VITE_AURORA_DEBUG=1` build in this worktree, run with `ELECTRON_BIN` = the main tree's
  electron and `AURORA_BUILT_TREE` = this worktree. Its first line is
  `root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-aa071fe0726cde6e3`.
- Copies from `git archive` of committed revisions only:
  - s1disasm at its checkout's HEAD commit `f6ece657`, 25,804,800 archive bytes, extracted as
    S1a and S1b;
  - aeon at `origin/master` `8061d1dd`, 9,973,760 bytes.
- `spawnGuarded` and `await killTree(child)`.
- A private `ORACLE_SOCKET`, `xvfb-run -a`. No emulator.

**The expected text comes from source.** `src/renderer/state/edit-consent.ts` is bundled with
esbuild and `openCancelledMessage(['level'])` is called. The unsaved dot's accessible name is
read out of `DirtyDot.tsx` with a regex that must match exactly once. No typed literal.

**The way in.** The edit is issued in the same synchronous `Runtime.evaluate` as the open,
before the open's first IPC await resolves:
`const p = __dbg.openDir(S1b); __dbg.classic.stampLayoutCell('fg')`. The aeon row does the same
with `__dbg.aeon.open`. That evaluate also reads the classic status right after the stamp, so
every run proves the edit landed inside the window. The open's outcome is recorded on the page
and polled, not awaited (see run 1).

**The rows.**

| row | what it requires |
|---|---|
| SW.0 | setup: S1a is open, Green Hill act 1 was opened by a real click on Home's card, and it is clean |
| SW.a | classic to classic with the edit |
| SW.a.0 | premise: the stamp landed inside the window |
| SW.a.1 | no banner before the open; the open returns `'error'`; the banner is painted with the exact sentence |
| SW.a.2 | Home still names S1a, with its act loaded |
| SW.a.3 | the stamped cell is still in the document |
| SW.a.4 | the level tab's unsaved dot is still painted |
| SW.b | classic to aeon, the same five checks (SW.b.0 to SW.b.4) |
| SW.c1 | CONTROL: classic to classic with no edit commits, and no banner appears |
| SW.c2 | CONTROL: classic to aeon with no edit commits, and no banner appears |

The banner is read absent before every open. "On screen" means the paint test: rects, a
strict hit at the integer centre, the scroller box and the viewport.

**Every run, reported.**

| run | when (uptime, 1-minute load) | summary line | what it was |
|---|---|---|---|
| run 1 | 05:42:29, 2.18 | `6/13 rows PASS · 6 FAIL · 1 UNMEASURABLE · 15.2s` | **harness defects.** `openWithEdit` handed `c.json` an async IIFE, so CDP stringified the pending promise (`result {}`). SW.c2 then aborted with `Runtime.evaluate: {"code":-32000,"message":"Promise was collected"}`. The app side was already right on screen: SW.a.1's banner was painted with the exact sentence, and SW.b.2 passed. Fixed in `f005d275`: opens are polled, never awaited. |
| (refused) | 05:42:10 | none | not a run: `assertFreshBuild` refused because `aeon-open.ts` was 362 s newer than `dist/main/index.mjs`. My plant restores rewrote the file; I rebuilt. |
| run 2 | 05:44:50, 0.90 | `8/13 rows PASS · 5 FAIL · 0 UNMEASURABLE · 18.5s` | **instrument defects**, see the two points below |
| final 1 | 05:48:01, 5.31 | `13/13 rows PASS · 0 FAIL · 0 UNMEASURABLE · 18.5s · s1disasm f6ece657c1cf · aeon 8061d1dd6e92` | exit 0 |
| final 2 | 05:48:38, 4.30 | `13/13 rows PASS · 0 FAIL · 0 UNMEASURABLE · 18.5s · s1disasm f6ece657c1cf · aeon 8061d1dd6e92` | exit 0 |
| final 3 | 05:49:06, 3.68 | `13/13 rows PASS · 0 FAIL · 0 UNMEASURABLE · 18.5s · s1disasm f6ece657c1cf · aeon 8061d1dd6e92` | exit 0 |
| red H1 | 05:50:03, 4.99 | `5/13 rows PASS · 8 FAIL · 0 UNMEASURABLE · 17.6s` | red-first, below |
| restored | 05:51:01, 3.60 | `13/13 rows PASS · 0 FAIL · 0 UNMEASURABLE · 18.5s · s1disasm f6ece657c1cf · aeon 8061d1dd6e92` | exit 0 |

**Run 2's two instrument defects, both fixed in `bb42d075`.**
- `__dbg.classic.docHash()` hashes tiles, objects and palettes, not the layout planes
  (`debug-hooks.ts`), so it stayed at `1538244046` while the stamp changed fg cell (0,0) from 0
  to 1. The stamp's own report meanwhile read `cellAfter 1, docChanged true`. No hook reads a
  layout cell. The cell is now read back by the next stamp's `from` (`stampLayoutCell` reads the
  cell before it writes), required to be the same plane and coordinates and equal to the value
  the in-window stamp wrote. That read writes, so it is taken only after the row's other
  evidence, and the harness says so.
- Home shows no directory for an aeon project (see the observation below), so SW.c2's
  `dir === copy` read null over a committed open. SW.c2 now checks the AEON chip and the project
  name read from the copy's own `project.json`.

**Red-first for the harness rows (H1).**
- The plant: both commit-point checks disabled (`if (cancelled && false)` in
  `classicProjectStore.ts` and `aeon-open.ts`), shown against HEAD, then rebuilt.
- The renderer bundle changed from `index-BufjRyjr.js` to `index-BpViN1ty.js`, so the app ran
  the plant.
- The result: all 8 SW.a and SW.b property rows red; SW.0, both premises and both controls
  green. Quoted:
  - SW.a.1: `open returned "opened"; paint {"found":false,"dpr":1}`
  - SW.a.2: `home {"chip":"S1",...,"dir":"/tmp/swos-s1b-YIP6DT"}`
  - SW.b.2: `paint {"found":false,"dpr":1}`
  - SW.b.3: `home {"chip":"AEON","name":"Sonic 4","dir":null}; levelState {"status":"idle",...}`
- The restore: `git checkout bb42d075 -- <both files>`, then a rebuild. The bundle came back as
  `index-BufjRyjr.js`, byte-for-byte the unplanted name, and the "restored" run is 13/13.

**The dpr and rects, from final run 1.** dpr 1 throughout.
- The banner text: `rect {"x":12,"y":6,"w":641.3,"h":18}`, 1 rect, centre (333, 15),
  `hitInside true`, `inViewport true`, text exactly the bundled sentence.
- The Green Hill tab's unsaved dot: `rect {"x":452.14,"y":43.5,"w":6,"h":6}`, centre (455, 47),
  `hitInside true`, `inScrollerBox true`.
- The Dismiss aim: `{"x":690,"y":15,"hitOk":true}`.
- The stamp: fg (0,0) from 0 to 1 inside the window, read back after the cancelled open as
  `from 1` at fg (0,0), on both roads.

**The pictures.**
- `docs/captures/2026-09-12-switch-window-onscreen/sw-a-cancelled-final1.png`: the red banner
  with the sentence, Home on S1a's path, the Green Hill Zone Act 1 tab with its dot. The
  `sw-b-cancelled-final1.png` frame is byte-identical, because both rows end in the same visible
  state.
- `docs/captures/2026-09-12-switch-window-onscreen/sw-b-cancelled-redH1.png`: under H1 the aeon
  project committed over the edit, Home is the AEON "Sonic 4" page, an "Opened Sonic 4" toast,
  and no banner.
- Also committed: `sw-c2-committed-final1.png`, `sw-a-cancelled-redH1.png` and
  `sw-c2-committed-redH1.png`.

### 11.3 The key question for (b), answered

**The aeon loader's cancellation IS visible while a classic project is resident.** SW.b.2
passed in final runs 1 to 3, in the restored run, and already in runs 1 and 2. It went red
under H1. `App.tsx` renders `error || classicError` whatever the engine, so `projectStore.error`
paints on the same banner. It is not silent on that road.

**An observation, not this parcel's defect, and not filed.** Home shows no directory for an aeon
project. `HomeTab.tsx` renders `{dir && ...}` from the classic store only, so an aeon project's
page names the project ("Sonic 4") and not its path. Two checkouts of one aeon tree are
therefore indistinguishable on Home. Recorded here so it is not rediscovered.

### 11.4 Where the tree disagreed with the review message

1. **"The stamped cell is still there" has no read-only instrument in the tree.** `docHash`
   does not cover the layout planes, and no hook reads a layout cell. The read used writes (the
   next stamp's `from`), taken after the row's evidence, as section 11.2 says. The alternative
   was adding a hook to `debug-hooks.ts`, a `src` change for an instrument, which I did not
   make.
2. **The aeon-check plant turned 18 rows red, as the message says.** Mine went through the
   new committed fixture.
3. **"S1a is still the open project"** is read where the user reads it: Home's header, which
   shows the classic directory. For the aeon control the header shows no directory, so SW.c2
   reads the project name instead (section 11.3).

### 11.5 Suite

Run in the foreground at `ca3cfa26`, with `git status` clean.

- `npm test` exited 0.
- Test Files: `613 passed | 3 skipped (616)`.
- Tests: `9347 passed | 9 skipped (9356)`. 0 failed.
- failure-class: "no failures in this run (616 module(s) reported)".
- skip-report: "OK. Every skip named its reason". The 9 skips are the pre-existing env-gated
  rows.
- In that run: `switch-window-edit.test.ts (101 tests)`, `project-open-door-census.test.ts (8 tests)`.
- `check-harness-guards`: "276 clean / 276 classified". Every gate printed OK.
- `uptime` before: `05:52:34 up 1 day, 19:14, load average: 1.88, 3.82, 5.37`; after:
  `05:53:12 up 1 day, 19:15, load average: 8.12, 5.03, 5.70`.
- `npx tsc --noEmit`: exit 0, no output.

A first attempt at 05:51:36 exited 1 before vitest ran: `check-cited-paths` flagged the
harness header, which wrapped its citation of the suite file across two comment lines. That
was fixed in `ca3cfa26`.

After the run, only this section was added. The doc gates were run over it before its commit.

### 11.6 Rework commits

| commit | what |
|---|---|
| `84b7533e` | the aeon fixture from a committed revision, never a working tree (bar 19) |
| `51bf4063` | the on-screen harness and its registration |
| `f005d275` | harness: run 1's two read defects |
| `bb42d075` | harness: run 2's cell read-back and aeon Home read |
| `ca3cfa26` | captures (final run 1 and H1), and the harness comment path |
| this commit | this section |
