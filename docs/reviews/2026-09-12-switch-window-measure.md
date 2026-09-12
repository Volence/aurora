# switch-window-measure: an edit made while a project switch loads

Branch `parcel/switch-window-measure`, from master `d73ae428`.
Parcel `SWITCH-WINDOW-EDIT-DROPPED`, MEASUREMENT ONLY. No `src/` code changed.

Filed (`docs/reviews/2026-09-12-classic-failed-open.md`, section 6, Q2): while a
project switch is loading, the open act stays editable, and an edit made in that
window is dropped without a dialog when the switch commits. Aeon has the same
window during its load; classic gained it with CLASSIC-FAILED-OPEN-CLOSES-PROJECT.

---

## Verdict

The window is real on every road the code allows, and on every road an edit
made inside it lands on the resident project first. What happens to it at the
commit depends on the direction. "Dropped without a dialog" is exact for the
three classic roads and wrong, in two different ways, for the two aeon ones.

| direction | the edit at the commit | its dirty flag | its undo | told? |
|---|---|---|---|---|
| classic to classic (another dir) | gone, act unloaded | cleared `{}` | gone | nothing; the guard afterwards says `proceed` |
| classic to aeon | gone, classic project closed | cleared `{}` | gone | nothing but `Opened Sonic 4` |
| classic re-validate, same dir (Project Setup) | gone, act unloaded | cleared `{}` | gone | nothing |
| aeon to aeon | gone with the old project object | **stays `true`, `{"ojz/act1":1}`, now on the NEW project** | gone | nothing then; the next open asks "Unsaved changes" and offers Save & open over work the new project does not hold |
| aeon to classic | **not dropped**: held in the masked aeon project | stays `true` | derived: gone at the key change | nothing then; the next open or window close asks with **no Save button**: "Unsaved aeon project edits are resident while a CLASSIC project is open, so the aeon saver skips them and Save cannot write them." |

Every row: no dialog during or after the window (`dialogsDuringOrAfterWindow: 0`),
and nothing written to disk (`writes: []`). The window is short: in node, under
1 ms for a classic target and 17 to 23 ms for an aeon target, plus IPC that node
cannot measure (section 3).

## 1. The probe, and the reproduction

`scratchpad/switch-window-probe.vitest-script.ts`, run with its own config:

```
SWITCH_WINDOW_WORK=<an empty directory you own> \
  npx vitest run --config scratchpad/switch-window-probe.vitest.config.ts
```

It drives the REAL user road: `openProjectPath` (`src/renderer/hooks/useProject.ts`),
the REAL `confirmProjectOpen` answered through the real `confirmStore`, the REAL
`ipcClassicBridge` and the REAL `openAeonProject`, over the real reference trees.
Two things are substituted:

- `createIpcFileAccess` becomes a node-fs FileAccess with the same five methods
  (exists, read, list, mtime, readMany). Each call is counted, and each can be
  held by a per-directory gate. The gate is what makes "mid-switch" a state a row
  can stand in: the row starts the open, waits until the bridge has asked for the
  target, makes the edit, then releases.
- `recordRecentProject` / `loadRecents` answer `[]` at once. They are IPC.

Trees: the pinned s1disasm the suite uses (`referencePath(S1_PINNED)`, copied
fresh into the work dir, because it has no `.aurora/` and an open seeds one),
the sibling s1disasm and the sibling aeon checkout (`siblingPath`, read only),
and a fresh copy of aeon's `project.json` plus `games/sonic4/data` as the second
aeon directory. The FileAccess interface has no write method. The one write on
these roads, the classic sidecar seed, goes to `window.api.writeBinaryFile`,
which the probe stubs to write only under the work dir. No row recorded a write.

**Why it is not a suite row.** The intended behaviour is unruled, so a row would
pin either the defect or a ruling nobody made. I considered a characterization
row for the aeon-to-aeon stale flag (section 5, c3), which reads as a defect
under any ruling. It still waits for a routing decision, so it is not added.

### Controls (the probe can see a surviving edit)

- **Classic:** the pinned copy open, first available act loaded, spawn point
  moved 80 to 88 (`classicSetStart`, an undoable `commitLayout`). After 500 ms,
  with no switch: `start {x:88,y:944}`, `dirty {start:true}`, `canUndo true`.
- **Aeon:** the aeon copy open, palette line 1 colour 1 red 0 to 36 through
  `executeAmbientCommand` (`set-palette-line`). After 500 ms: `colorR 36`,
  `editorDirty true`, `dirtyActs {"ojz/act1":1}`, `canUndo true`.

### The reproduction rows (run `d3992e72` tree, 13 of 13 green)

In every row the mid-window edit really landed before the release: the resident
project was still the open engine, and the probe read the edited value, the dirty
flag and `canUndo true` at that moment.

| row | mid-window (resident) | after the commit |
|---|---|---|
| classic to classic, clean | s1 copy, `start.x 88`, `dirty {start}`, undo yes | sibling s1 open, act `idle`, `start null`, `dirty {}`, undo no, guard `proceed`, toasts `[]` |
| classic to classic, dirty before, Discard & open | the dialog ran BEFORE the window (body "Opening a project discards unsaved edits and undo history in the current one."); then `start.x 96` | same as clean: act `idle`, `dirty {}`, undo no, no second dialog |
| classic to aeon, clean | s1 copy, `start.x 88` | classic `closed`, act `idle`, `dirty {}`, engine `aeon`, toast `Opened Sonic 4` only |
| classic same-dir re-validate | s1 copy, `start.x 88` | the same dir reopened, act `idle`, `start null`, `dirty {}`, undo no |
| aeon to aeon, clean | aeon copy, `colorR 36`, dirty, undo yes | sibling aeon open, `colorR 0`, **`editorDirty true`, `dirtyActs {"ojz/act1":1}`**, undo no; the old project object (which still holds 36) is referenced by no store; guard `confirm, offerSave true` |
| aeon to aeon, dirty before, Discard & open | the dialog ran BEFORE the window; `colorR 72` | as clean: `colorR 0`, `editorDirty true`, guard `confirm, offerSave true` |
| aeon to classic, clean | engine still `aeon` mid-window (the cold classic open is `'opening'`, and `openEngine()` answers `'aeon'`); `colorR 36` | classic `open`, engine `s1`; the aeon project **still resident with `colorR 36`**, `editorDirty true`; guard `confirm, offerSave false`, with the unsavable-aeon sentence |

The probe does not run React, so `session-lifecycle`'s key-change effect
(`resetProjectRuntime`, `src/renderer/shell/session-lifecycle.ts:163`) never
fires in it. What that adds in the app is derived in section 2.

## 2. Is it the only copy, and the dirty check

**The guard runs before the window, never after.** `openProjectPath` awaits
`confirmProjectOpen()` first (`src/renderer/hooks/useProject.ts:28`), and the
window opens when that resolves. Measured: one dialog before the window on a
dirty project, none on a clean one, and none during or after in any row.

- **Clean before the switch.** No dialog at all. The mid-window edit is the only
  copy: no saver ran and nothing was written. At the commit the classic roads
  lose the edited doc, its dirty flag and its undo history together
  (`useClassicLevelStore.getState().reset()` at
  `src/renderer/state/classicProjectStore.ts:172`, and `closeResidentClassicProject`
  at `src/renderer/state/aeon-open.ts:66`). Aeon to aeon loses the doc and the undo
  (`documentHistoryHub.clearAll()` at `src/renderer/state/aeon-open.ts:95`) but not the
  flag. Aeon to classic loses nothing at the commit.
- **Dirty before, Discard & open.** The consent covered the edits made before the
  dialog. The mid-window edit is lost with them, and nothing asks again. For
  classic, Discard deliberately leaves `classicDirty` set
  (`src/renderer/shell/project-open-guard.ts:495`), so a mid-window edit lands on an
  act that already reads dirty. No flag can tell a consented edit from one made
  after the consent, and remedies (b) and (c) depend on that.
- **Dirty before, Save & open.** Derived, not probed (the savers would write the
  reference trees): the guard proceeds only when its re-snapshot is clean
  (`src/renderer/shell/project-open-guard.ts:479`), so the window opens on a clean
  project and this case is the clean case.
- **What the app adds at the key change (derived).** Every road that changes the
  session key (all but the same-dir re-validate) then runs `resetProjectRuntime`
  (`src/renderer/state/project-runtime.ts:322`): histories cleared, and every sprite,
  canvas and composer document closed. The guard closed those documents before the
  window (`endDocumentSession`, `src/renderer/shell/project-open-guard.ts:316`), so they
  matter only if one is reopened during the window. One reopened from its tab and
  edited there is then closed with no dialog. For aeon to classic this also clears
  the masked edit's undo stack.
- **Aeon to classic is present but unreachable.** The edit survives in
  `projectStore.project`. The aeon saver fires only on `openEngine() === 'aeon'`
  (`src/renderer/state/project-runtime.ts:227`), and classic precedence makes that false.
  So the next dialog has no Save (`anySavable` false), and its only exits are Discard
  and Cancel. Reopening the aeon project reloads it from disk. Before this measurement,
  `src/renderer/shell/project-open-guard.ts` (its comment around lines 152 and 197)
  held this state reachable only through the debug doors.

## 3. The window

### Every await between "switch requested" and "switch commits"

By what the code does, door by door.

**The user road**, `openProjectPath` (`src/renderer/hooks/useProject.ts:23`).
Behind it are the Explorer and hero "Open Project..." buttons, Home's "Switch
project", recents rows and typed path, and the command palette's recent: and
open-project commands (`src/renderer/shell/__tests__/project-open-door-census.test.ts`, `DOORS`).

1. `await confirmProjectOpen()`: **before** the window. Inside it, `await ask()`
   (the dialog) and, on Save, `await saveImpl()`. The window opens when it
   resolves `true`.
2. `await classic.openDirectory(dir)` (`src/renderer/state/classicProjectStore.ts:102`). A
   resident classic project only clears `error`. A cold open sets `'opening'`.
   1. `await bridge.open(dir)` (`src/renderer/state/classic-bridge.ts:72`):
      - `await detectProject(fa)` (`src/core/project/adapter.ts:503`) runs adapters in
        order, sequentially. s1 checks `await fa.exists('sonic.asm')`, then
        `await dirHasEntries` once per fingerprint dir (a `list` each). An aeon
        directory falls through to aeon's `await readEngine(fa)`.
      - on an s1 match, `await openProject(fa)`, which **detects again**
        (same calls), then `s1Adapter.open`: `await readSidecarState(fa)`, then ONE
        `await Promise.all` over the profile entries' existence checks
        (`src/core/project/s1/index.ts:383`).
      - on an aeon match, nothing more; on neither, `await explainAeonReject(fa)`.
   2. On a classic open whose sidecar seed changed: `await bridge.writeSidecar`
      (one IPC write). This happens only on the first open of an unseeded project.
   3. **COMMIT (classic)**, synchronous: the level-store reset, then
      `set({ status: 'open', ... })`.
3. On a classic target, `await recordRecentProject`: **after** the commit.
4. On `'not-classic'`, `openAeonProject(dir)` (`src/renderer/state/aeon-open.ts:72`):
   `setLoading(true)`, then
   1. `await aeonAdapter.open(fa)`, which calls `loadAeonProject`: `await fa.read('project.json')`,
      `await loadCollisionProfilesFa` (one `Promise.all` of three reads,
      `src/core/project/aeon/load.ts:144`), `await loadFullProject(...)` (its reads,
      sequential).
   2. `await recordRecentProject(dir, name)`: IPC, and **inside** the window
      (the loader puts it before the commit on purpose, `src/renderer/state/aeon-open.ts:78`).
   3. **COMMIT (aeon)**, synchronous: `closeResidentClassicProject`, `clearAll`,
      `openLoaded`, `setCurrentAct`, the composer document.

**The agent door** (`classic-open-project`, `src/renderer/agent/agent-handler.ts:1356`): a
synchronous refusal on any dirt, then step 2 only. On `'not-classic'` it does not
call the aeon loader.

**The Project Setup door** (`src/renderer/components/setup/ProjectSetupTab.tsx`, `apply`):
its own ask and save first, then `await window.api.writeBinaryFile` (the setup
sidecar), then step 2 for the directory already open.

**The debug doors** (`__dbg.openDir`, `__dbg.aeon.open`): steps 2 and 4 with no guard.

After either commit, React re-renders, and the key-change effect runs
`resetProjectRuntime`. That is after the window.

### FileAccess calls per window (measured, the same in every sample)

In the app, every one of these is one IPC round trip
(`src/renderer/state/classic-file-access.ts`: `probePath`, `readBinaryFile`, `probeDir`,
`fileMtime`, `readManyFiles`).

- **Classic target: 241 calls**, 234 exists, 6 list and 1 read. The two detects
  account for 2 exists and 6 lists. The rest comes from `s1Adapter.open`, whose
  profile resolution is one parallel batch.
- **Aeon target: 118 calls** (sibling) and **119** (copy): 16 exists, 99 or 100
  reads, 1 readMany and 2 lists. `src/core/project/aeon/load.ts` has one
  `Promise.all` (three collision reads, line 144); every other call is awaited
  in turn.

### Wall clock (node, no IPC, so a FLOOR for the app)

Run of the probe as committed. `uptime` before:
`02:49:45 up 1 day, 16:11, 1 user, load average: 5.19, 6.81, 7.23`; after:
`02:49:47 up 1 day, 16:11, 1 user, load average: 5.25, 6.80, 7.23`. Per-sample
`os.loadavg()` read 5.25 / 6.80 / 7.23 throughout, and `os.uptime()` read 144704 to 144705 s.
The window is timed from the call of `openProjectPath` (a clean project, so the
guard answers at once) to the commit a store subscriber sees.

| case | n | min ms | median ms | max ms | all samples (ms) |
|---|---|---|---|---|---|
| classic to classic (6 to the sibling, 6 to the pinned copy) | 12 | 0.7 | 0.8 | 1.0 | 1.0, 0.9, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.7, 0.8, 0.7, 0.8 |
| aeon to classic (to the sibling) | 6 | 0.5 | 0.65 | 0.8 | 0.8, 0.7, 0.7, 0.5, 0.6, 0.6 |
| classic to aeon (to the sibling) | 6 | 17.4 | 19.2 | 21.5 | 21.5, 18.2, 17.7, 20.7, 20.2, 17.4 |
| aeon to aeon (6 to the sibling, 6 to the copy) | 12 | 17.6 | 18.3 | 23.2 | 19.5, 17.7, 18.6, 23.2, 17.8, 17.6, 17.6, 19.7, 17.6, 18.0, 20.0, 18.6 |

- The sidecar seed write (step 2.2) is in **no** sample (`sidecarWrites 0`
  throughout). The pinned copy had been seeded by the first row of the same run,
  and the sibling is already seeded. So that step is **UNMEASURED**.
- The timing rows ran after nine reproduction rows in the same process, so these
  are warm figures. A cold first open is **UNMEASURED**.
- **The IPC is UNMEASURED**, because Electron's IPC and the main process are not in
  a node process. The app's classic window is 241 round trips (8 sequential in the
  two detects, the rest in one parallel batch). The aeon window is about 118 mostly
  sequential ones, plus the recents IPC (step 4.2), which the probe answered at
  once. Tagged F-1.

What the numbers say about reach: a person with a mouse has to act within
milliseconds, plus the IPC. The realistic sources are listed in section 4: the
agent surface, input queued right behind the open gesture, and a slow disk.

## 4. Which input surfaces can edit during the window

**The reachability argument.** No production code reads any "switch in flight"
signal, so every surface reachable at rest is reachable in the window.

- A resident classic switch changes nothing an edit surface reads until the
  commit: `openDirectory` only clears `error`
  (`src/renderer/state/classicProjectStore.ts:114`).
- An aeon load sets `projectStore.loading` (`src/renderer/state/aeon-open.ts:75`). Its
  only occurrences in `src/renderer` outside tests are `projectStore.ts`'s own
  field, setters and reset. No component, provider or command reads it.
- Aeon under a cold classic open: the classic store goes `'opening'`, but
  `openEngine()` and `useOpenEngine()` still answer `'aeon'`
  (`src/renderer/state/open-project.ts:21`), and the history factory's
  `classicIsOpen()` is false, so aeon surfaces keep their aeon histories.
- The guard's dialog is closed before the window: `answer` clears the request
  before it resolves (`src/renderer/state/confirmStore.ts:35`). No modal covers the window.

**The census.** It is anchored on the stores' chokepoints, because a call-shaped
grep misses injected references (it missed `classicSetPalette`, which
`src/renderer/providers/palette-classic.ts` passes by reference):

- Classic: every level-doc edit reaches the store through `applyCommit`
  (`src/renderer/state/classicLevelStore.ts:780`), which only `commitLayout` and `commitArt`
  call. Undo and redo go through `writeLayoutSnapshot` and `writeArtSnapshot`.
- Aeon: `executeCommand` and `executeAmbientCommand`, plus the non-command
  `markDirty` sites the guard's own comment counts
  (`src/renderer/shell/project-open-guard.ts:179`), and redo's `markDirty` in
  `src/renderer/state/history-factories.ts:55`.

| surface | classic entry | aeon entry | its only gates | in the window |
|---|---|---|---|---|
| map painting (FG/BG, stamps) | `ClassicLevelViewport.tsx` to `classicSetLayoutCells` | `MapViewport.tsx` gestures (writes the model mid-stroke, then `markDirty`), `executeCommand` | facet mounted, pointer | reachable |
| collision | `state/collision-dispatch.ts` to `classicSetColind` | `CollisionPalette.tsx`, `MapViewport.tsx` collision strokes | same | reachable |
| object placement, spawn | `ClassicLevelViewport.tsx` to `classicSetObjects`, `classicSetStart` | `MapViewport.tsx`, `providers/properties-aeon.ts` | same | reachable |
| palette | `providers/palette-classic.ts` (injected `classicSetPalette`) | `PaletteEditor.tsx`, `providers/palette-aeon.ts` | same | reachable |
| art tiers, composer | `TileTab`, `BlockTab`, `ChunkTab` (`classicEditTiles`, `classicEditBlock`, `classicEditChunkCells`, `classicPaintSurface`, `classicAddChunk`, `classicAddBlock`) | `ComposerCanvas.tsx`, `TilesetPanel.tsx`, `state/chunk-doc-commit.ts`, `state/art-composer-save.ts` | same | reachable |
| canvas to level commit | `components/canvas/CommitPlanView.tsx` to `classicCommitCanvas` | none | same | reachable |
| effects panel fields | none | `EffectsScenePanel`, `BandPresetPanel`, `BgAnimBandPanel`, `RasterTimelineStrip`, `providers/band-follow.ts` | same | reachable |
| other aeon edits | none | `SectionGridNav`, `ChunkLinkOptions`, `map-flip.ts`, `MarqueePasteOptions` (`markDirty`), `providers/chunk-library-import.ts` (`markDirty` after its awaits) | same | reachable |
| keyboard undo/redo | `LevelWorkspace.tsx:97` | same handler | `levelKeysEnabled()` (active tab is not a sprite or canvas tab, `workspace/level-keys.ts:28`), `isTypingTarget` | reachable when a level tab is active; see below |
| undo/redo buttons | `LevelWorkspace.tsx:156` chips | same | none | reachable |
| agent / tool surface | `agent-handler.ts` classic tools (`requireClassicProject` needs `status 'open'`, true all through a resident window) | aeon tools (`requireProject`) | none | reachable, and **the likeliest hitter**: requests are not serialized (`registerAgentHandler`, `agent-handler.ts:139`), so an agent edit can land inside a user's switch or inside its own `classic-open-project` |
| sprite / canvas documents | closed before the window; a tab reopened during it loads from the OLD project | same | none | reachable; dropped at the key change (section 2) |

**Which doors leave an edit surface in front of the user.** Home's doors leave
Home active, and `focusedDocId()` is null for a non-level tab
(`src/renderer/state/editorStore.ts:667`), so Ctrl+Z from Home does nothing; editing
needs a tab click first. The Explorer's "Open Project..." (after its native
dialog closes) and the command palette leave the active tab where it was, often
a level tab, so its canvas and keys stay live through the window.

## 5. Remedies, priced

**(a) Refuse edits during the switch.**
- Needs one switch-in-flight flag. It is set after the guard and cleared on commit,
  failure and throw, at the user road (`src/renderer/hooks/useProject.ts`), the agent door
  and the Setup door.
- Needs gates wherever it must bite:
  - classic: the tops of `commitLayout` and `commitArt` (before the undo step is
    recorded) and the two snapshot writers. One file covers every classic surface.
  - aeon: `executeCommand` and `executeAmbientCommand` are NOT enough.
    `MapViewport.tsx`'s gesture sites write the model mid-stroke, before any command
    (around lines 2415 and 2585), so they need gating at gesture start. So do the
    marquee paste, the chunk import, the composer save and its strokes, the sprite
    and canvas stores, and the agent handler (one check at the top for edit kinds).
- Needs a visible busy state, or an inert stroke reads as a bug.
- Size about 12 to 18 files, about 150 to 250 lines plus rows. Risk HIGH: every
  missed gate is a silent hole, the gesture gates sit in the hottest code, and a
  stroke begun before the flag rises must either finish or roll back.
- **LOOK**: new on-screen state and wording.

**(b) Re-run the dirty check at the commit and offer the dialog then.**
- Sites: `openDirectory` before its level reset
  (`src/renderer/state/classicProjectStore.ts:167`), and `openAeonProject` after its recents
  await and before `closeResidentClassicProject`. That is outside the no-await
  stretch its constraint forbids (`openLoaded` to `setCurrentAct`).
- The plain snapshot is the wrong question: after a Discard, `classicDirty` stays
  set on purpose, so it would ask twice on every discarded open. It needs a
  consent token, the edit generations as they stood when the guard answered.
  - classic has one: `domainGen`, bumped by `applyCommit` and both snapshot
    writers (`src/renderer/state/classicLevelStore.ts:81`).
  - aeon has none: `dirtyActs` goes up and down, so it needs a monotonic counter,
    one field bumped in `markDirty` and `markUndone`.
  - sprite, canvas and composer need their dirty-id sets.
- A dialog awaited inside the open is itself a window. An agent is not stopped by
  a modal, so the answer must be re-checked against the token.
- Save at the commit works on the resident roads, because the old project is still
  the open engine, so `saveAllDirty` writes it.
- Size 3 to 4 files (`project-open-guard.ts`, `classicProjectStore.ts`, `aeon-open.ts`,
  the agent door refusing instead of asking), about 80 to 150 lines plus rows.
  Risk MEDIUM.
- **LOOK**: a second dialog a moment after the first gesture, which needs wording
  that says the changes were made while the project was opening.

**(c) What the code already offers.**
- **(c1) Abort the commit on an edit made after the consent.** Use the same consent
  token as (b). At each commit point, if a generation moved since the guard
  answered, do not commit: fail the open the way a failed open now fails, where
  the resident project stays open with its edits (`fail()`,
  `src/renderer/state/classicProjectStore.ts:122`; `setError` on the aeon side). That
  reuses the behaviour merged at `d2deb699`, needs no new dialog and loses nothing.
  Size 3 to 4 files, about 60 to 100 lines plus rows. Risk LOW to MEDIUM: a
  generation moved for a non-edit reason would refuse an open, and `markDomainsClean`
  after a save does not bump one. The Q1 state ("Discard & open", then a failed open)
  is reached the same way Q1 describes. **LOOK**: wording only, in the error channels
  that already exist, for example "Open cancelled: the level was edited while the new
  project was loading. Save or discard, then open again."
- **(c2) An existing busy state?** None that any edit surface honours.
  `projectStore.loading` has no reader. The classic store's `'opening'` exists only
  for a cold open. `SpriteMode`, `ProjectSetupTab` and `NewCanvasDialog` each hold a
  local `busy`/`applying` flag scoped to their own buttons. So (a) would have to
  create one.
- **(c3) The aeon-to-aeon stale flag, whatever is ruled.** `openAeonProject` never
  clears `editorStore.dirty` or `dirtyActs` at its commit. `markClean` has one
  production caller, the guard's Discard (`src/renderer/shell/project-open-guard.ts:501`).
  So dirt from the project being left survives onto a fresh-from-disk one. Its act
  tab dots, the next open offers Save & open, and Save writes the new project's
  unedited data. The commit already clears the histories for exactly this reason
  (`src/renderer/state/aeon-open.ts:90`). About 1 line plus a row. Behavioural, not LOOK.

**Recommendation: (c1) for both adapters, plus (c3) routed separately.**
- (c1) closes every surface at once, the agent included, from two commit points
  and one token, and touches no gesture code.
- It is lossless, and it adds no dialog.
- Its user-facing half is last night's failed-open behaviour, which the owner has
  already seen hold.
- Given how short the window is, it will rarely fire for a person, and when it does
  an edit really did happen.
- (a) is the most invasive, and the only one that needs new on-screen state. (b)
  reopens the same window during its own dialog.

This is advice; the ruling is the controller's to route.

## 6. Foreground, tagged for the controller (no app window driven, no emulator)

- **F-1. The app's real window, with IPC.** Probe section 3's figures are a floor.
  1. Launch Aurora. Open the s1disasm checkout and load a level tab.
  2. Run `uptime`. In DevTools, start a Performance recording.
  3. Open the aeon checkout from Home's recents.
  4. Stop. Measure from the click event to the first frame that shows the aeon
     project.
  5. Repeat five times per direction: classic to aeon, aeon to aeon, aeon to
     classic, and classic to classic (between two s1disasm directories). Record
     `uptime` beside the figures.
- **Not tagged: seeing the drop by hand.** A person cannot reliably land an edit
  inside a window of milliseconds. The reproduction is the probe's job. The only
  practical live road is two concurrent agent requests, which needs a harness and
  was not asked for.

## 7. What the brief and the packet said that the tree does not

1. **"Dropped without a dialog" holds for classic only.**
   - Aeon to aeon drops the edit but keeps its dirty flag, on the wrong project.
   - Aeon to classic does not drop the edit. It strands it unsavable, and the next
     open or close asks without a Save button.
2. **"Aeon has the same window during its load"** is right for aeon to aeon. The
   aeon-to-classic window is the classic bridge's read, not aeon's load. That window
   predates last night's fix, because a cold classic open always went through
   `'opening'`.
3. **`src/renderer/shell/project-open-guard.ts` says no production road reaches a classic
   open over a resident dirty aeon project** (its comment near lines 152 and 197, which
   names only the debug doors). The window is such a road on the user's own door (row
   aeon to classic). The comment is right about the mechanism and wrong about its extent.
4. **The census's `DOORS` entry for `ProjectSetupTab.tsx` says "nothing is destroyed"**
   (`src/renderer/shell/__tests__/project-open-door-census.test.ts`). Its pre-dialog
   covers the edits made before Apply. An edit made during its re-open is dropped (row
   same-dir re-validate).
5. **`typed-path-open.ts` is named in the brief, but the window is not in it.** It calls
   the opener it is handed and holds no switch primitive. The window lives in
   `openDirectory`, `openAeonProject` and their callers.
6. **My own first caller census missed `palette-classic.ts`'s injected command.**
   Section 4 therefore rests on the chokepoints.

## 8. Commits

| commit | what |
|---|---|
| `d3992e72` | the probe and its config (`scratchpad/`), with the measured findings in the message |
| this commit | this packet |

## 9. Suite

Run in the foreground on the tree at `d3992e72` plus this packet, with this
section still a placeholder. `npm test` exited 0:

| | Test Files | Tests |
|---|---|---|
| this branch | 611 passed \| 3 skipped (614) | 9237 passed \| 9 skipped (9246) |

- 0 failed. failure-class: "no failures in this run (614 module(s) reported)".
- skip-report: "OK. Every skip named its reason".
- Every gate in the chain printed OK, `check-doc-citations` over this packet among them.
- `uptime` before: `02:58:03 up 1 day, 16:20, load average: 3.33, 6.23, 7.31`;
  after: `02:58:40 up 1 day, 16:20, load average: 8.84, 7.18, 7.58`.
- `npx tsc --noEmit`: exit 0, no output.

After that run, only this packet's prose changed: one sentence in section 3 and
this section. The doc gates were re-run over the final text before the commit.
