# Row 225 (e): the shared-file dependency census for an all-or-nothing multi-act save

2026-09-28, measured on `690d4fc5` (master at the start of this work). This census is step 1 of the hub's ruling (empyrean `docs/OVERSEER-LOG.md`, grep `HUB RULING, aurora row 225`, 2026-09-28T11:36:34Z). The ruling picked option (1): plan every target act first, and write only if every plan succeeds. The census decides whether (1) is allowed at all:

> if any act's plan depends on a shared file another act's plan rewrites, fall back to (3) and write down why; do not grow into (2).

## Verdict

**The rule fires, so (1) is NOT implemented.** Per-act saving (option 3) stays, and `partialSaveReport` still reports honestly on it. Two dependencies decide it, and both were measured (section 4):

- **B, `project.json`, in every configuration.** Each act's plan reads and rewrites the in-memory image of `project.json` (`config.raw`). A later act's plan reads the value an earlier act's plan wrote there. If plans run first and a later act refuses, nothing is written, but the earlier plan's rewrite stays in memory. The next save then believes `project.json` is already current and never writes it. That is a real data-loss path (measured: B4). Today's sequential save does not have this path for a cross-act refusal.
- **A, the section sidecars, when two acts share a `dataPath`.** Here a plan's disk read (an `exists` probe) is of a file another act's plan writes. Planning every act against the pre-save disk gives different bytes on disk than today's sequential save, even when every plan succeeds (measured: A).

## 1. What a per-act plan reads and writes

Entry point: `saveAeonProject` (`src/renderer/state/aeon-save.ts:38`). It loops the target acts (`:76`). For each act it calls `buildAeonSavePlan` (`:81`, defined at `src/core/project/aeon/save.ts:181`) and then writes that plan's files straight away (`:106-121`). It then moves to the next act. Removals and the effects ledgers are applied once, after the loop (`:148-186`).

### 1a. Reads from DISK inside the plan

`buildAeonSavePlan` has exactly two disk reads, both through `fa`:

| Read | Where | Path |
|---|---|---|
| `fa.exists(metaPath)` | `save.ts:330` | `${dataPath}section_${i}.meta.json` (`:254`, `:325`) |
| `fa.exists(linksPath)` | `save.ts:357` | `${dataPath}section_${i}.chunklinks.json` |

`planPlayerPaletteWrite` (`save.ts:542`, `player-palette.ts:195`) reads nothing from disk. It compares each zone's in-memory colours with `zone.playerPaletteFile.loadedWords`, a baseline set at load that is never refreshed (docblock above `player-palette.ts:195`). The `fa.exists`/`fa.read` calls in `player-palette.ts` (`:67`, `:87`) belong to the LOAD path. `saveFileFor(project.bgOverride)` (`save.ts:772`, `bg-override-io.ts:162`) compares with `state.loadedText`, which is also held in memory from the load.

The write-skip read (`window.api.readManyFiles`, `aeon-save.ts:108`) is not part of planning. It runs in the write phase, just before that act's writes, so it would work the same way under (1).

### 1b. Reads and writes of shared IN-MEMORY state inside the plan

The plan mutates `config.raw`, the parsed `project.json`, which lasts for the whole session (`projectStore.config`). This happens at four sites:

| Mutation | Where | Guard that reads it back |
|---|---|---|
| `rawActGrid.gridWidth/gridHeight = act.grid*` | `save.ts:477-479` | `rawActGrid.gridWidth !== act.gridWidth` (`:476`) |
| `rawZone.tileset = tilesetDest` (every zone, in every act's plan) | `save.ts:489-490` | `rawZone.tileset !== tilesetDest` (`:488`) |
| `rawAct.bgLayout = editorBgLayoutPath` | `save.ts:634-635` | `rawAct.bgLayout !== editorBgLayoutPath` (`:633`) |
| `rawAct.bgTiles = editorBgTilesPath` | `save.ts:638-639` | `rawAct.bgTiles !== editorBgTilesPath` (`:637`) |

Each one sets `configChanged`, and only `configChanged` puts `project.json` into the plan (`save.ts:776-786`, the push at `:785`). So `config.raw` is the plan's working copy of a shared FILE. Every plan reads it, and any plan can rewrite it.

Nothing else is mutated. The effects libraries' `loadedPaths` ledgers are updated only by the glue, after every write (`aeon-save.ts:181-186`).

### 1c. Writes, and which of them more than one act's plan touches

| File | Pushed at | Per act or shared | Bytes depend on another act's plan? |
|---|---|---|---|
| `section_N.{tiles,collattr,collattrb}.bin`, `.objects.json`, `.rings.json`, `.meta.json`, `.chunklinks.json` | `save.ts:245` via `writeSection` | per act (`${dataPath}`) | no, UNLESS two acts share a `dataPath` (see A) |
| `{dataPath}regions.json` (write or removal) | `save.ts:593` / removal after | per act | same caveat as above |
| chunk library `config.chunkLibraryPath` | `save.ts:428` | shared, every plan | no: serialized from `project.chunkLibrary` in memory, same bytes in every plan |
| each zone's tileset | `save.ts:486` | shared, every plan, every zone | no (from memory); its POINTER is B |
| each zone's palette (lines 1-3) | `save.ts:524` | shared, every plan, every zone | no (from memory) |
| **player palette, CRAM line 0** (hub-named) | `save.ts:545` | shared, every plan | **no**: `planPlayerPaletteWrite(project.zones)` reads only in-memory colours and the load-time `loadedWords`; it does not read the file, and no plan changes its inputs |
| act BG layout/tiles | `save.ts:628-630` | per act | no (from memory); its POINTERS are B |
| BG library index and bodies | `save.ts:666-671` | shared by acts of one zone | no (from memory) |
| **effects scene library** (hub-named) | `save.ts:720`; removals via `removalsFor` | shared, every plan | **no**: from `project.effectsScenes` in memory; removals are deduped by path and applied after all writes in both designs (`aeon-save.ts:73`, `:123`, `:150`) |
| **effects preset library** (hub-named) | `save.ts:751`; removals likewise | shared, every plan | **no**, same argument |
| BG override document | `save.ts:773` | shared, every plan | no (`loadedText` from load, in memory) |
| legacy atlas truncation | `save.ts:821` | shared, every plan | no |
| **`project.json`** | `save.ts:785` | shared: any plan with `configChanged` | **YES, through `config.raw`: see B** |

**The hub's three examples come out clean.** In every act's plan the player palette, the scene library and the preset library are serialized from memory, and no plan reads what another plan changes. `project.json` is the file the hub did not name, and it is the one that fires.

## 2. B, `project.json` through `config.raw`: fires in every configuration

**Is it read by act N's plan and rewritten by act M's plan?** Yes. `rawZone.tileset` is retargeted by the first plan that runs (`save.ts:489`), since every act's plan loops every zone (`:482`). Every later plan's guard at `:488` then reads the retargeted value. It sees no change, so it leaves `project.json` out. Measured (B1/B2 below): act 1's plan has `configChanged: true` and carries `project.json`; act 2's plan, built afterwards, has `configChanged: false` and does not. The same holds for the grid and BG pointers of one act planned twice.

**Would planning all acts first give different bytes on disk?** If every plan succeeds, no: plans never read `project.json` from disk, so the chain through memory is the same in both orders. **If a plan refuses, yes, and that is exactly the case (1) exists for.** Under (1):

1. Act 1's plan retargets `config.raw` (the tileset pointer, a grid resize, a BG pointer) and schedules `project.json`.
2. Act 2's plan refuses (the reserved-bits refusal, `save.ts:232`). Nothing is written, as (1) promises, but `config.raw` keeps act 1's rewrite in memory.
3. The author fixes act 2 and saves again. Every plan now finds `config.raw` already "current", so no plan contains `project.json`. Act 1's data is written to the new destination and the pointer on disk still names the old one. Measured (B4): the tileset is written to `data/editor/ojz_tiles.bin` while `project.json` on disk still says `data/ojz_tiles.bin`. On reopen the tile edits are gone. With a grid resize instead, this is the grid-resize round-trip defect (`docs/reviews/2026-09-10-grid-resize-roundtrip.md`) coming back: sections written at their new indices under the old dimensions.

Today's sequential save does not hit this for a cross-act refusal. Act 1's `project.json` reaches disk before act 2's plan runs, and the reserved-bits refusal (`save.ts:232`) comes before the mutations in the same act (`:477` onward).

## 3. A, the section sidecars under a shared `dataPath`: fires in a configuration the parser accepts

The config parser checks only that `dataPath` is present (`src/core/config/s4-config.ts:101`), not that it is unique. When two acts share one, both plans' `section_N.*` paths are the same file, and the `exists` probes at `save.ts:330`/`:357` read a file the other act's plan writes. Measured (A): act 1's section 0 has `paletteRef: "pal_a"`, act 2's section 0 has none, and there was no meta file before the save.

- Sequential (today): act 1 writes the ref. Act 2's probe finds the file and writes the cleared document. Final `"paletteRef": null`.
- All plans first: act 2's probe sees the pre-save disk, finds no file and plans nothing. Final `"paletteRef": "pal_a"`.

That is different bytes on the success path. This configuration is already degenerate (the two acts overwrite each other's `tiles.bin` in either design), and aeon's shipped `project.json` does not use it: it has one act, `"dataPath": "games/sonic4/data/editor/ojz/act1/"` (`/home/volence/sonic_hacks/aeon/project.json:15`, working tree, read 2026-09-28). It is recorded because the rule asks about ANY act, and this one also fails the stricter "different bytes" reading.

## 4. The measurement

A scratch vitest file (not committed; full source in the appendix) loaded the two-act fixture that `src/renderer/state/__tests__/aeon-save.test.ts` uses and called `buildAeonSavePlan` directly. Run: `TMPDIR=$HOME/.cache/aurora-tmp npx vitest run <file>`, exit 0, `Test Files 1 passed (1)`, `Tests 2 passed (2)`. Output:

```
B0 tileset before any plan: data/ojz_tiles.bin
B1 act1 plan: configChanged true has project.json true | raw tileset now data/editor/ojz_tiles.bin
B2 act2 plan (after act1 plan): configChanged false has project.json false
B3 act2 refused: refusing to save ojz/act2: 1 collision w
B4 re-save after fix: act1 has project.json false | act2 has project.json false | tileset written to data/editor/ojz_tiles.bin | project.json on disk still says data/ojz_tiles.bin
A seq meta: { "bgLayoutRef": null, "paletteRef": null, "rasterRef": null, "sceneRef": null }
A all meta: { "bgLayoutRef": null, "paletteRef": "pal_a", "rasterRef": null, "sceneRef": null }
```

## 5. What would have to change for (1) to become allowable (a hub decision, not done here)

Both of these are outside the ruling's "(1), census-gated" scope, so they are left for a new ruling rather than folded in:

- Plans stop mutating the session's `config.raw`. For example, plan against a copy, and adopt the copy only after `project.json` is actually written. This is in-memory only, with no new IPC, so it is not option (2), but it does change the planner's contract.
- The loader refuses (or names) two acts sharing a `dataPath`.

## 6. A pre-existing defect the census found (open, not fixed here)

The stranding in B already happens TODAY under (3) in two ways that do not involve a second act. The planner mutates `config.raw` at `save.ts:477`/`:489`/`:634`/`:638` before it can still throw:

- **Throws later in the same plan.** The scene-id collision refusal (`save.ts:714`) and the preset one (`:745`) come after the mutations, and those refusals throw.
- **Main refuses a write partway.** `project.json` is pushed near the end of the files (`:785`). If a write before it fails (the path `partialSaveReport` names), `config.raw` has already been rewritten.

In both cases the next save leaves `project.json` out, as in B4. For the first case this finding comes from reading the code order; it was not run. The UI refuses a colliding scene/preset id when it is created, so the first way is a backstop path, while the second is reachable wherever a write can fail. The fix is the first item of section 5; it deserves its own row.

## Appendix: the scratch reproducer

```ts
// SCRATCH, NOT COMMITTED: census evidence for ROADMAP row 225 (e).
// (placed at src/renderer/state/__tests__/zz-census-scratch.test.ts for the run, then removed)
FIXTURE: the two-act project of aeon-save.test.ts (zone ojz, tileset data/ojz_tiles.bin,
         no editorTilesetPath, acts act1/act2, 1x1 grids, dataPath data/ojz/<act>/ or,
         for A, both data/ojz/act1/).
B: load; plan act1; plan act2; set bit 14 in act2 section 0 collisionEdit[0]; plan act2
   (throws); clear the bit; plan act1 and act2 again; look for project.json in each plan.
A: aliased fixture; act1 section 0 paletteRef = 'pal_a'; 'seq' = plan1, apply, plan2, apply;
   'all' = plan1, plan2, apply both; compare section_0.meta.json.
```
