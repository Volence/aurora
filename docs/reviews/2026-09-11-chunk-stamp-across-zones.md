# chunk-stamp-across-zones: the stamp writes what the library holds, and the library does not know its zone

Branch `parcel/chunk-stamp-across-zones`, from master `84174c5d`.
Code tip `39467c98`: the reproduction rows, pinned as found. This packet and
the ledger row follow it and change no code or test.

Lens row `CHUNK-STAMP-ACROSS-ZONES`. Opened from section 4e of
`docs/reviews/2026-09-11-paste-across-tilesets.md`, which said a chunk stamp
into another zone "has the same shape as this row" and left it out of scope.

---

## Verdict: BLOCKED. Reachable in principle, reproduced, and not closable with the paste's rule.

- **Reachable, on a project with two zones.** Both shipped stamp paths (the
  map's stamp tool and the agent's `stamp_chunk`) offer the whole project-wide
  chunk library in every zone. So a chunk minted in zone A is stamped into zone
  B as zone A's tile numbers, which are other pictures in zone B's tile set.
  Reproduced on both paths, red by ASSERTION on base (section 5).
- **Not reachable on any real project today.** aeon's one project.json has a
  single zone (`ojz`), and Aurora has no way to add a zone (`git grep -n -i
  "addZone\|createZone\|newZone\|add zone"` over `src/` finds nothing).
- **Not the paste's flaw in the respect that made the paste bad.** The paste
  wrote a picture other than the one the author copied. The stamp writes the
  picture the author picked: the chunk picker's thumbnail and the stamp ghost
  are both drawn against the OPEN zone's tiles (section 2), so what lands in
  zone B is what zone B's picker showed. The defect is upstream of the stamp:
  zone B's picker shows zone A's chunk as a zone B picture.
- **BLOCKED on identity.** The paste's rule compares the `Tileset` a clipboard
  captured with the target, by reference. A chunk captures nothing: `ChunkDef`
  has no tile set, and the library saves as one unmarked file that loads with
  every chunk attributed to the first zone. An identity could be carried for a
  chunk minted in this session, but it would not survive a save and reload,
  and the reading available after one is wrong in both directions on a two-zone
  project. Refusing on it would be a guess, which the ruling forbids. Nothing
  was built. The options are in section 4.
- **The landed paste rule already answers the identity question the other
  way.** The paste parcel captures a chunk's clipboard identity as the OPEN
  zone's tile set (section 6a). Under that identity a stamp can never cross a
  tile set, and a stamp refusal would contradict an allowed paste of the same
  words.

---

## 1. Where the chunk library lives, and what a chunk's words index

**One library per project.**

- The model: `chunkLibrary: ChunkDef[]` on `S4Project`
  (`src/core/model/s4-types.ts:567`), beside `zones: Zone[]`. The `Zone`
  interface above it carries `tileset` and no chunks.
- The config: one project-level key, `chunkLibraryPath: json.chunkLibrary || ''`
  (`src/core/config/s4-config.ts:111`).
- The load reads that one file (`src/core/project/aeon/load.ts:957`,
  `const chunkLibRaw = await fa.read(config.chunkLibraryPath);`). The save
  writes it back as one file with no marker
  (`src/core/project/aeon/save.ts:348` to `:360`; each chunk is serialised as
  id, name, widthTiles, heightTiles, nametable, collisionA, collisionB).
- On the real tree, aeon's project.json:32 names
  `games/sonic4/data/editor/ojz/chunks.json`. The file lives under the zone's
  folder, but the key is project-level. Its 71 chunks carry exactly seven keys
  each (`id`, `name`, `widthTiles`, `heightTiles`, `nametable`, `collisionA`,
  `collisionB`), counted with `rg -o` over aeon's copy. No zone, and no
  tile-space marker.

**A chunk's words are tile NUMBERS in the tile set they were minted against,
and nothing records which one that was.**

`ChunkDef` (`src/core/model/s4-types.ts:297`) is id, name, size, `nametable`
and two collision planes. Every path that mints or re-mints those words does
it against the OPEN zone's tile set:

| minter | the line | tile set |
|---|---|---|
| Art composer, Save | `const atlas = zone.tileset.tiles;` then `sliceForSave(o.doc, atlas)` (`src/renderer/state/art-composer-save.ts:139`, `:143`) | the open zone's |
| Art composer, each stroke on a chunk doc | `sliceForSave(o!.doc, atlasAfter(atlas, leading))` (`src/renderer/state/chunk-doc-commit.ts:173`) | the open zone's |
| Map, Save as chunk | `selectionToChunk(section, ...)` over `act?.sections[m.sectionIndex]` of the open act, then `addChunks` (`src/renderer/components/MarqueePasteOptions.tsx:167`, `:170`, `:180`) | the open act's words, so its zone's |
| Agent `save_chunk` | "Chunk nametables index into the unified zone tileset", `validateEntries(req.entries, ctx.zone.tileset.tiles.length)` (`src/renderer/agent/agent-handler.ts:634`, `:635`) | the open zone's (`requireProject`, `:159`) |
| Chunk import | `migrateChunkTilesIntoTileset(zone.tileset.tiles, artTiles, imported, [])` with `zone = getCurrentZone(...)` (`src/renderer/providers/chunk-library-import.ts:208`) | the open zone's |
| Load from disk | "Single-zone assumption: the data model has ONE chunk library per project, so we migrate into zones[0]'s tileset" (`src/core/project/aeon/load.ts:1020`) | `zones[0]`, by assumption |

The load row needs one more fact. The migration that would make the
assumption TRUE, by remapping the words into `zones[0]`'s tile set
(`load.ts:1034`), runs only when the legacy atlas is non-empty
(`if (chunkTiles.length > 0 && chunkLibrary.length > 0 && zones.length > 0)`,
`load.ts:1030`). On the real tree, aeon's `chunks_tiles.bin` is 0 bytes
(`stat`), so nothing is remapped. The words are read as they are, and
attributed to the first zone.

An edit re-mints a chunk in whichever zone is open, and an undo of `set-chunk`
puts the old words back (`src/core/editing/history.ts:369`), with the old tile
set. So within one load, a chunk's tile set changes on every edit and undo,
and nothing tracks it.

---

## 2. The census: everything that reads a chunk's words

Enumerated by what READS the words, not by feature: every `chunkLibrary`
reader in `src/` (`git grep -n chunkLibrary -- src ':!**/__tests__/**'`, 69
lines), every `buildStampCommand` and `buildRegionWriteCommand` caller, a
drag-and-drop sweep (`git grep -n -i "dataTransfer\|onDrop"`), and the MCP
method table.

| site | what it does with the words | writes a level? | tile set it meets | cross-zone? |
|---|---|---|---|---|
| `src/renderer/components/MapViewport.tsx:3570` stamp tool click | `liveProject?.chunkLibrary.find(c => c.id === selectedChunkId)` (`:3573`): the WHOLE library. `buildStampCommand`, then `executeCommand` (`:3603`) | YES, the open act | the open zone's | **reachable** with two zones |
| `src/renderer/agent/agent-handler.ts:670` `stamp-chunk` (MCP `stamp_chunk`, `src/main/editor-methods.ts:302`) | `state.project!.chunkLibrary.find(...)` (`:673`), `buildStampCommand`, `executeAmbientCommand` (`:705`) | YES, the open act | the open zone's | **reachable** with two zones |
| `src/renderer/state/art-composer-save.ts:237` propagation after a chunk edit | `buildActPropagationCommand` rewrites the linked tiles of the OPEN act | YES | the open zone's, and the words were re-minted against that same tile set moments before (`:139`, `:143`) | no: same tile set by construction |
| `src/renderer/components/art/ComposerCanvas.tsx:812` chunk Ctrl+C | copies the words to the map clipboard with the open zone's tile set | no | captured as the open zone's | guarded by the paste parcel |
| `src/renderer/providers/chunk-grid-aeon.ts:183` picker thumbnail | `rasterizeAeonChunk(..., zone?.tileset.tiles ...)` with `zone = getCurrentZone(...)` | no | the open zone's | display |
| `src/renderer/components/MapViewport.tsx:796` stamp ghost | `regionPreviewCanvas(chunk, zone.tileset.tiles, zone.palette)` | no | the open zone's | display |
| `src/renderer/components/art/ComposerCanvas.tsx:159` composer `getAtlas` | `return zone?.tileset.tiles ?? [];` | no | the open zone's | display |
| `src/renderer/debug-hooks.ts:1488` `chunkIds`, `chunkInfo` | ids, size, a count of nonzero words | no | none | read-only |
| save-as-chunk, agent `save_chunk`, import, composer save | mint words (section 1) | no | the open zone's | the SOURCE of a crossing |
| drag and drop | none exists: the sweep finds `SectionGridNav` and `PaletteEditor` drops only | | | |
| a context-menu stamp | none exists: `buildStampCommand` has two callers (`MapViewport.tsx:3592`, `agent-handler.ts:697`) | | | section 6c |
| classic, `src/renderer/components/classic/ClassicLevelViewport.tsx:1198` | stamps chunk IDS into a `LevelDoc` whose chunk table (`src/core/level-classic/model.ts:96`) belongs to that level | yes, ids | no nametable word | not served |

**Across projects: unreachable.** The library is part of the loaded project
and is replaced by an open. The stamp reads it at the click, and nothing
carries chunk words out of a project the way the clipboard carries its words.
`selectedChunkId` survives an open, but it then names an id in the NEW
project's library, whose words index the new project's tiles.

---

## 3. Why there is no honest identity to refuse on

The paste's rule needs the thing being written to carry the `Tileset` it was
taken from. For each source of chunk words, here is what could supply one:

1. **Minted in this session.** Knowable: the open zone at the mint.
2. **Edited in this session.** Knowable only if the identity rides `set-chunk`
   AND its undo, because both change which tile set the words index.
3. **Loaded from disk.** Not knowable. The file carries no marker (section 1),
   and the loader's attribution is a stated assumption that the migration
   would make true, except that it does not run on the real tree (section 1).
4. **Saved, then reloaded.** Lost. The save writes one unmarked file, so a
   chunk minted in zone B is read back as the first zone's.

So on a two-zone project, the identity available after a reload is wrong for
every chunk made outside the first zone, in both directions. It would REFUSE
that chunk in the zone it was made in, and ALLOW it in the first zone, where
its numbers are other pictures. That is a guess dressed as a rule.

A session-only identity (items 1 and 2 recorded, disk chunks attributed only
when the project has one zone) is buildable, and it would never refuse wrongly
within a load. But on every real project (one zone) it would never fire. On a
two-zone project it would protect a chunk until the next reload, then stop
without a sound. Coverage that switches off silently is the shape of this
repo's guard defects, so it was not built (option 3).

And it would contradict the landed paste rule (section 6a). Stamping chunk X
in zone B writes the same words as copying X in zone B's composer and pasting
in zone B, and the paste parcel ALLOWS that. A stamp refused on "the zone it
was made in", beside a paste allowed on "the zone it is shown in", would be two
answers to one question.

---

## 4. Options, for the overseer

1. **A per-zone chunk library.** The zone owns its chunks. project.json names
   a library per zone; the picker and both stamp doors offer only the open
   zone's. The identity is structural (the zone whose library holds the
   chunk), survives save and reload, and needs no refusal, because a crossing
   cannot be asked for. The real tree already keeps the file under the zone's
   folder (aeon project.json:32), so the data is per zone by convention and
   the model is the odd one out. Costs: a project.json schema change, which is
   aeon's contract (aeon's tools read the file: tools/level_staleness.py:23
   in aeon names `ojz/chunks.json`); the loader and saver; a rule for a
   project-level key on an existing project; and the composer clipboard's
   identity becomes the chunk's zone.
2. **A tile-space marker per chunk in `chunks.json`,** which is the loader's
   own TODO (`src/core/project/aeon/load.ts:1029`). The identity survives a
   reload, and the stamp can then refuse on the paste's rule. But this changes
   a file aeon's tools read, so it is a cross-repo contract. And chunks
   written before the marker still need a rule, which is honest only on a
   one-zone project.
3. **A session-only identity** (section 3). Honest when it fires, silent after
   a reload, and it never fires on a real project today. Not recommended.
4. **Hold.** No real project has two zones, and Aurora cannot make one. The
   pins (section 5) keep the behaviour visible, and a fix has to flip them on
   purpose. The first two-zone project is the event that makes this bite, and
   options 1 or 2 are the ones to take then.

---

## 5. The reproduction, and the rows

Four rows, all in `npm test`. The chunk is minted through a shipped path and
stamped through a shipped door in each.

| row | file | what it drives |
|---|---|---|
| PINNED AS FOUND: a chunk saved in zone A is stamped into zone B as zone A's tile numbers, and nothing says so | `src/renderer/components/__tests__/map-viewport-mounted.test.ts` | the save-as-chunk button's own two calls in ojz, then the real mounted click in mgz |
| CONTROL: in the zone the chunk was saved in, another act takes the stamp | same | the same, clicking in ojz act2 |
| PINNED AS FOUND: the agent stamps zone A's tile numbers into zone B, and the reply calls it a success | `src/renderer/agent/__tests__/agent-handler.chunk-stamp-zones.test.ts` | `handleAgentRequest` `save-chunk` in ojz, then `stamp-chunk` in mgz |
| CONTROL: in the zone the chunk was saved in, another act takes the stamp | same | the same, stamping in ojz act2 |

**Why pins and not refusal rows.** There is no fix, and a refusal row cannot
be committed red. Each PIN asserts today's write exactly, and its failure
message tells whoever fixes this to turn it into a refusal row, not delete it.
The CONTROLS are what any fix must keep.

**The reproduction, red on base by ASSERTION.** The two pins were rewritten
into the refusal form the brief asks for (nothing written into mgz) and run on
the committed code:

- map: `expected [ 1, 2, 3, 4 ] to deeply equal [ 771, 771, 771, 771 ]`.
  771 is `0x0303`, mgz's fill.
- agent: `expected [ 1, 2, 3, 4 ] to deeply equal [ +0, +0, +0, +0 ]`.

The words 1 to 4 are ojz tile numbers. Before anything else, each row asserts
that every one of them names a different picture in mgz than in ojz: mgz's
tile `i` is colour `15 - i` where ojz's is `i`, which differ at every index
because 15 is odd. Totals for that run: 2 failed, 107 passed (109). Both
failures are ASSERTION.

**The plants.** Every plant was applied by a throwaway script kept outside the
repository (rule 8). It does an exact-anchor replacement, refuses unless the
anchor occurs exactly once, reads the file back from disk, and prints the
mutated line. Each plant was run against both files, then restored from the
committed `39467c98` with `git show HEAD:<path> > <path>`, and
`git status --short` printed nothing after every restore.

| plant | the mutated line, as printed from disk | reds |
|---|---|---|
| R1a, R1b | `map-viewport-mounted.test.ts:2817` and `:2818`, `agent-handler.chunk-stamp-zones.test.ts:137` and `:138`: the refusal form above | 2: both pins |
| P1 | `src/renderer/components/MapViewport.tsx:3603` `if (cmd && false) executeCommand(cmd, level); // PLANT P1` | 2: map PIN (`[ 771, 771, 771, 771 ]`, nothing written) and map CONTROL (`[ 514, 514, 514, 514 ]`, act2's fill). Agent rows green |
| P2 | `src/renderer/agent/agent-handler.ts:705` `// PLANT P2 executeAmbientCommand(cmd, ctx.level);` | 2: agent PIN and agent CONTROL (`[ +0, +0, +0, +0 ]`). Map rows green |

All reds are ASSERTION, and there were no TIMEOUTs. Each new row is reddened
by at least one plant, and each plant reddens only the path it cuts.

**Fixture traps honoured**, from the mounted file's header. Section arrays are
sized from the engine constants (its `section()`), and acts carry
`gridWidth`/`gridHeight`. The fills are per zone and per act (`0x0303` in mgz,
`0x0202` in ojz act2), so a missed write reads as a wrong VALUE. Nothing
hovers, so the stamp ghost's `document` call is never reached.

**What the rows cannot see: pixels.** The thumbnail and the ghost are drawing
claims (F-1).

---

## 6. Where the tree contradicted the brief or the ruling

**6a. The brief's premise names a fact the model does not hold.** "A chunk
whose words index zone A's tile set" assumes a chunk knows its zone. It does
not (section 1). The paste parcel had already ruled the question the other
way. The comment at `src/renderer/components/art/ComposerCanvas.tsx:806` says
the chunk copy captures "THE TILE SET THIS CHUNK WAS DRAWN AGAINST ... For a
chunk document that is the open zone's ... the chunk library is project-wide
and carries no tile set of its own". Section 2 of
`docs/reviews/2026-09-11-paste-across-tilesets.md` says the same. Under that
identity the stamp never crosses a tile set.

**6b. The paste packet's section 2 says the library "was migrated into the
FIRST zone's tile set at load".** That is true only when the legacy atlas is
non-empty (`load.ts:1030`). aeon's is 0 bytes, so on the real tree nothing is
migrated. The words are attributed to the first zone, not remapped into it.

**6c. `src/core/editing/map-stamp.ts:47` lists a "context-menu block origin"
among the stamp's call sites.** No such caller exists (section 2). The comment
is stale; this parcel changes no code, so it is recorded here.

**6d. "The same flaw" is wrong in the respect that made the paste bad.** Both
ghosts draw against the open zone's tiles (the paste ghost at
`src/renderer/components/MapViewport.tsx:857`, the stamp ghost at `:796`). So
the difference is not whether there is a preview. It is where the author's
intent comes from. A copy means "put down what I copied", and the paste put
down something else. A pick means "put down this thumbnail", and the thumbnail
is drawn in the destination zone.

**6e. aeon's reading of what these words index disagrees with Aurora's.**
aeon's tools/ojz_strip_gen.py:445 says section tile indices "reference entries
in chunks_tiles.bin", and its :105 docstring says project.json's
`zones[0].tileset` points at that file. aeon's project.json:8 points it at
`ojz_tiles.bin`, and aeon's `chunks_tiles.bin` is 0 bytes. This is recorded
for aeon; it is not this repository's to change.

---

## 7. Suite

| | Test Files | Tests |
|---|---|---|
| base `84174c5d` | 602 passed \| 3 skipped (605) | 9066 passed \| 9 skipped (9075) |
| code tip `39467c98` | 603 passed \| 3 skipped (606) | 9070 passed \| 9 skipped (9079) |

Both runs exit 0, and the failure-class reporter says "no failures in this
run" on both. `9079 - 9075 = 4`, the rows added. The one extra file is the new
agent file. `npx tsc --noEmit` exits 0 with the rows in place, and the
typecheck also runs inside the `npm test` chain on both.

---

## 8. Foreground-only, tagged, and not attempted

No emulator was touched.

- **F-1.** In a project with TWO zones (a scratch copy of a project whose
  project.json gains a second zone; Aurora cannot add one): Layout facet, zone
  A, marquee one block, Save as chunk. Open a level of zone B and arm the stamp
  tool. Expect the new chunk's thumbnail to be drawn with zone B's tiles, not
  the ones saved; the ghost to show the same picture; a click to put that
  picture down; and no toast. That is the pinned behaviour on screen. The node
  rows compare words and cannot see a canvas.
- **F-2.** Same project: an agent `save_chunk` in zone A, then `stamp_chunk` in
  zone B. Expect the reply `stamped: true` and zone B showing zone B's reading
  of those numbers.
