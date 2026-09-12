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
