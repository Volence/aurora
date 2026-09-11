# collision-paste-across-tilesets: a collision word indexes the project's bank, not the tile set

Branch `parcel/collision-paste-across-tilesets`, from master `165dde4f`.
Commits: `31cfba9f` reproduction rows (red on base); `2f75042e` the rule and its
rows; `c83c76e8` an art-only clipboard no longer erases a composer document's
collision (found on the way, same wrong-write class). Code tip `c83c76e8`. This
packet and the ledger row follow it and change no code or test.

Lens row `COLLISION-PASTE-ACROSS-TILESETS`. Opened from sections 4b and 4c of
`docs/reviews/2026-09-11-paste-across-tilesets.md`.

---

## Verdict: MIXED by scope, and FIXED. Zone-independent, project-dependent.

A collision word's shape number indexes the project's ONE collision base bank.
Every zone of a project is baked against the same bank into one shared attr set,
so the word means the same shape in every zone. It does not necessarily mean the
same shape in another project, whose bank can differ. The flip, solidity and
crossover bits index nothing.

So the rule that never writes a wrong value is: **tile words fit only the tile
set they were copied from; collision words fit anywhere in the project they were
copied in.** A collision-only paste into another zone now lands (map: Shift click,
or the Paste setting on Collision; composer: Ctrl+V). A paste that would write
tile words into another tile set is still refused. Anything from another project
is refused, in terms of the words it would write. Nothing is BLOCKED.

---

## 1. What a collision word indexes, quoted

**The word** (`src/core/collision/collision-cell-word.ts`):

- `:6` "bits 0-9  shape index (0..1023; 0 = air)"
- `:7` "bit  10   X-flip", `:8` bit 11 Y-flip
- `:9` "bits 12-13 solidity (this plane's path): none/top/sides-bottom/all"
- `:10` "bits 14-15 LOOP CROSSOVER"

Only bits 0-9 index anything. Flips and solidity are applied to the indexed
shape; the crossover mark is a plane number (to A, to B). None of those three
point into a table.

**What bits 0-9 index, and where it is loaded from (Aurora)**:

- `src/core/project/aeon/load.ts:208-210` loads ONE `CollisionProfileSet` per
  project open: `for (const collPath of collisionDataPathCandidates(config.raw))`,
  `collisionProfiles = await loadCollisionProfilesFa(fa, collPath)`,
  `if (collisionProfiles) break;`. The first candidate directory with the tables
  wins, for the whole project. There is no per-zone or per-act table.
- `src/core/collision/adapters/s4-collision-adapter.ts:21` "s4_engine collision:
  the four global tables baked by collision_pipeline.py", 256 profiles (`:26`).
- It is written only by `openLoaded` (`src/renderer/state/projectStore.ts:82`),
  together with `config` and `project`. `setCollisionProfiles` has no caller.

**What bits 0-9 index, and where it is loaded from (aeon, read at `b3db547e`)**:

- `tools/collision_pipeline.py:279` in `bake_plane_cell`: "cell_word bits: 9:0
  base-bank shape index, bit10 xflip, bit11 yflip, 13:12 THIS plane's solidity
  ... 15:14 XOVER". `:328` `heights = profiles[shape * PROFILE_LEN:(shape + 1) * PROFILE_LEN]`.
- `tools/ojz_strip_gen.py:1630` `def load_base_bank():` reads the bank from ONE
  path, `:1634` `"games", "sonic4", "data", "collision", "base"`.
- `tools/ojz_strip_gen.py:1898` `attrset = collision_pipeline.AttrSet()      # ONE shared set across all sections`.
- `games/sonic4/data/collision/collision_data.emp:1` "OJZ / global collision +
  Sonic character data (§4.7 ... shared across all zones)". The runtime tables are
  embedded once (`:18-22`) and published as `HeightMaps` and `SolidityTable`
  (`:221`, `:224`).
- `games/sonic4/player/player_sensors.emp:250-259` probes `HeightMaps` and
  `HeightMapsRot` directly. No zone pointer is involved.

So bits 0-9 index a bank that is per PROJECT (per game data root), fixed for the
life of a load, and shared by every zone and act. The runtime attr byte the bake
writes is also one table set per build.

---

## 2. The rule chosen, and where it lives

`src/core/editing/map-clipboard.ts` (line numbers at the tip):

- `clipboardFromProject` (`:106`): the copy came from the OPEN project exactly
  when the clipboard's tile set is one of the open project's zones' tile sets.
  By reference. A `Tileset` is built once per zone per load (`load.ts`, the only
  constructor), so this is the load identity the editor store already keys a
  project change on (the `config` reference, `src/renderer/state/editorStore.ts:979`),
  reached through the field the clipboard already carries. No new field, no
  producer change, and a reopen is another project, as it is another tile set.
- `pasteFit` (`:139`): `{ art: clipboardFitsTileset, collision: clipboardFromProject }`.
- `pasteRefusal` (`:159`): the one decision for the map's click, the map's Ctrl+V
  and the composer's Ctrl+V. It picks its sentence by which written words would
  be wrong, so no message names a kind of word the paste does not write:
  - tile words only: `OTHER_TILESET_REFUSAL` (`:73`, the landed sentence, unchanged)
  - collision words only: `OTHER_PROJECT_COLLISION_REFUSAL` (`:115`), "Not pasted:
    the copied collision belongs to another project, whose collision shapes can
    differ from this one's, so pasting it here could put different shapes down.
    Copy again from this project."
  - both: `OTHER_PROJECT_REFUSAL` (`:121`), "Not pasted: this was copied in
    another project, whose tiles and collision shapes can differ from this one's,
    so pasting here could put different ones down. Copy again from this project."
- `armRefusal` (`:178`): Ctrl+V is refused only where NO click could land
  anything. Layers are decided at the click (Shift is collision only), so a
  clipboard whose collision fits arms even over another tile set.
- `COLLISION_ONLY_HERE` (`:127`), the info notice when Ctrl+V arms over another
  tile set: "Only the collision can be pasted here: the copied tiles belong to
  another tile set. Shift+click pastes collision only."

| where | same tile set | another zone, same project | another project |
|---|---|---|---|
| map Ctrl+V (`MapViewport.tsx:1973`) | arms | arms, with the notice (`:1979`) | refused (both-kinds sentence, or the one the sticky setting names) |
| map click, both or Alt (`:3307`) | writes | refused, tiles sentence, paste mode left | refused |
| map click, Shift or sticky Collision | writes | **writes the collision, no tile word** | refused, collision sentence |
| map ghost (`:862`) | draws the art | draws NO art: footprint, collision shading, outline only | not armed |
| composer Ctrl+V (`ComposerCanvas.tsx:860`) | pastes | pastes | refused, collision sentence |

The click checks before `ensureCollisionPlanes`, so a refusal allocates nothing.
A refused click still leaves paste mode, as it did.

---

## 3. The rows

Every refusal row measures "nothing written" against every word plane of every
section of every act of every zone (map), or both planes of the open document
(composer), plus the undo stack.

| row | file | on base `165dde4f` | reddened by |
|---|---|---|---|
| N1 a COLLISION-ONLY (Shift) paste into another zone of the same project lands the copied collision and no tile word | map-viewport-mounted | **RED**, ASSERTION: Ctrl+V refused (pasting false) | P1, P2 |
| N2 the same through the sticky Paste setting (Collision), with no modifier | map-viewport-mounted | **RED**, ASSERTION: Ctrl+V refused | P2 |
| N3 a collision-only paste into ANOTHER PROJECT is refused at the click, in terms of COLLISION, and nothing is written | map-viewport-mounted | **RED**, ASSERTION: the refusal was the TILES sentence | P2, P7, P8, P10 |
| N4 armed over another tile set for collision only, the ghost rasterises NO art | map-viewport-mounted | added with the rule | P1, P6 |
| R1 (rewritten) Ctrl+V in another tile set arms for COLLISION ONLY and says so, and a click that would write TILES is refused, nothing written | map-viewport-mounted | was "Ctrl+V ... is REFUSED" | P1, P2, P3, P9 |
| R2 (premise rewritten) a refusal keeps the clipboard: back in its zone it pastes again | map-viewport-mounted | premise was a toast match | P3 |
| R3 (rewritten) a project opened over the source, same ids, is another project: Ctrl+V refused for tiles AND collision | map-viewport-mounted | was the tiles sentence | P3, P7 |
| R4 (second half rewritten) copied in the other zone, it pastes there and is refused in the first | map-viewport-mounted | second half expected Ctrl+V refused | P2, P3 |
| C1 CONTROL: in the zone it was copied in, the composer's Ctrl+V pastes | composer-collision-paste-mounted (new) | green | a control |
| C2 in ANOTHER ZONE of the same project it pastes too | composer-collision-paste-mounted | green (behaviour kept, now pinned) | P5 |
| C3 in ANOTHER PROJECT it is REFUSED, with a message about COLLISION, nothing written | composer-collision-paste-mounted | **RED**, ASSERTION: the document's planes were overwritten | P4, P5, P7, P8, P10 |
| C4 an ART-ONLY clipboard writes no collision (section 5) | composer-collision-paste-mounted | **RED** on `2f75042e`, ASSERTION | P13 |
| 7d-1 the copy came from THIS project exactly when its tile set is one of the project's zones' | map-clipboard.test.ts | added with the rule | P7 |
| 7d-2 every layer choice in each of the three places: refused exactly where a written word would not fit | map-clipboard.test.ts | added with the rule | P3, P7, P8 |
| 7d-3 arming is refused only where NO click could land anything | map-clipboard.test.ts | added with the rule | P1, P3, P7, P8 |
| 7d-4 each sentence names only the kind of word it refuses (exact texts, no dash) | map-clipboard.test.ts | added with the rule | P10, P11 |
| W1 an ART-ONLY region leaves the document's collision exactly as it was | test/art/composer-collision-paint.test.ts | added with the fix | P12 |

The landed "a paste armed any other way is refused at the CLICK too" row is
unchanged and still green; P2 and P3 redden it.

**Why four landed rows changed.** They pinned the old verdict. R1 asserted that
Ctrl+V is refused in another zone; it now arms and the click refuses the tiles.
R2's premise matched `'another tile set'`, which the new arming notice also
contains, so a notice could stand in for a refusal that never happened; it now
waits for a real `Not pasted` from a refused click. R3 now expects the
both-kinds sentence. R4's second half now expects the click refused. The copy
of the rule each row protects is unchanged, and every one still reddens under a
plant.

**The composer harness is new.** No mounted `ComposerCanvas` harness existed (the
landed packet's F-5 says so). This one mounts it with the same no-DOM harness the
map rows use and presses keys through the handler it registers on `window`. The
clipboard is made by the composer's own Ctrl+C on a chunk document. The fixture
adds a second zone; `CHUNK-STAMP-ACROSS-ZONES` asks any parcel doing that to read
its row first, and it was read. It concerns chunk stamps, not this paste.

**The ghost row's instrument.** The paste block's `document` stub now counts the
canvases it hands out. Only `regionPreviewCanvas` asks for one there, so the count
is the number of ghosts rasterised. The row's control (same tile set, same hover)
must build one, or the row says the instrument cannot see. The other-zone half is
shown to see a real draw pass by P6, which makes it build one.

---

## 4. Plants

Applied by a scratch script outside the repo (`/tmp`), not committed: exact-anchor
replacement, refused unless the anchor occurs once, read back from disk and the
mutated line printed before the run, then restored from the committed tip with
`git show HEAD:<path>` and checked clean against HEAD. P1 to P11 ran against
`2f75042e`, P12 and P13 against `c83c76e8`. Every red was ASSERTION; TIMEOUT 0.
`git status` was clean after each batch.

| plant | the mutation on disk | reds |
|---|---|---|
| P1 | `map-clipboard.ts:179` `if (fit.art) return null;` (arming ignores the collision fit) | 4: 7d-3, R1, N1, N4 |
| P2 | `MapViewport.tsx:3308` the click's fit is `clipboardFitsTileset` for both kinds, layers `'both'` (the old rule) | 6: R1, the landed click row, R4, N1, N2, N3 |
| P3 | `map-clipboard.ts:161` `const artBad = false;` | 7: 7d-2, 7d-3, R1, the landed click row, R2, R3, R4 |
| P4 | `ComposerCanvas.tsx:862` `if (false && refusal) {` | 1: C3 |
| P5 | `ComposerCanvas.tsx:861` the composer asks as if it wrote tiles (`'both'`) | 2: C2, C3 |
| P6 | `MapViewport.tsx:862` `const showArt = pasteZone !== null;` | 1: N4 |
| P7 | `map-clipboard.ts:110` `return project != null;` | 6: 7d-1, 7d-2, 7d-3, R3, N3, C3 |
| P8 | `map-clipboard.ts:165` `if (collisionBad) return OTHER_TILESET_REFUSAL;` | 4: N3, 7d-2, 7d-3, C3 |
| P9 | `MapViewport.tsx:1979` `if (false) ...COLLISION_ONLY_HERE...` | 1: R1 |
| P10 | `map-clipboard.ts:116` the collision sentence says "the copied tiles belong" | 3: N3, 7d-4, C3 |
| P11 | `map-clipboard.ts:128` an em dash in the arming notice | 1: 7d-4 |
| P12 | `composer-collision.ts:49` `if (false) return false;` | 1: W1 |
| P13 | `ComposerCanvas.tsx:871` `if (false && mapClip.artOnly) {` | 1: C4 |

---

## 5. Also found and fixed: an art-only clipboard erased a composer document's collision

Not in the brief. It is in the eight lines this parcel was guarding, and it is the
same class: a silent wrong write.

An art-only clipboard (an unaligned marquee, or an odd-sized chunk) carries
collision planes of length 0, on purpose: `MapRegion`'s docblock says "A length-0
plane cannot be mistaken for data by anything". `applyClipboardCollisionToDoc`
indexed them anyway. An out-of-range read is `undefined`, a `Uint16Array` stores
it as 0, and the composer toasted "Pasted collision from map clipboard". C4 on
`2f75042e`: plane A cell 0 went `12293` (`0x3005`) to `0`, plane B `12294`
(`0x3006`) to `0`, which is air over the author's collision.

Fixed in two places, because each has a job. The writer returns false for an
art-only region (`composer-collision.ts:49`), so no caller can erase with it. The
handler refuses out loud (`ComposerCanvas.tsx:871`): "Not pasted: this clipboard
carries no collision, because it was copied from a selection that is not
block-aligned, and the composer pastes collision only." The key is claimed and
nothing is recorded. A separate commit (`c83c76e8`), so it can be taken or left.

---

## 6. Trades, and where the tree contradicted the brief

**6a. The composer's cross-project paste is now refused, and that can refuse a
correct paste.** Two checkouts of one tree share a bank byte for byte, and before
this parcel the composer pasted collision between them. It now refuses. Not
BLOCKED, for three reasons. The rule is the one that never writes a wrong value.
The map has refused every cross-project paste since PASTE-ACROSS-TILESETS, so the
composer now agrees with the map. And this is the same trade that packet's 4a put
to the overseer for tiles, with the same options:

1. **Keep it** (built). Loud, and the cure is a copy in this project.
2. **A content check of the bank**: accept another load whose decoded profiles
   are identical. Exact, but `collisionProfiles` can be null (tables missing), and
   then nothing can vouch for it.
3. **Path identity** (the collision directory): survives a reopen, but trusts a
   bank that aeon's `import_sk_collision.py` may have rewritten in between.

**6b. A refused click still leaves paste mode.** Kept from PASTE-ACROSS-TILESETS.
Its reason (no ghost of the wrong tiles under the cursor) no longer holds, because
the ghost now draws no foreign art. So in another zone, a plain click after Ctrl+V
is refused, and the author presses Ctrl+V again before a Shift click. The
alternative is to stay armed after a refusal while collision can still land. Not
built; one line, and R1 plus the landed click row would change with it.

**6c. The Paste layers panel does not grey out Both and Art in another zone.** The
arming notice says which gesture lands, and the click refuses the rest. Not built.

**6d. What the brief got right, and one frame it did not fit.** Both contradictions
reproduced as the brief described. The brief framed the question as "per zone"
against "zone-independent". The answer is a third scope, per project, which is why
the refusal says "another project" and not "another zone".

**6e. Reach.** Cross-zone needs a project with two zones. aeon's one
`project.json` has one zone, and Aurora cannot add one (`CHUNK-STAMP-ACROSS-ZONES`).
Cross-project is reachable today: a second checkout, or a reopen.

**6f. The worktree had no `node_modules`.** Installed with `npm ci`, not symlinked.

---

## 7. Classic (Sonic 1)

Not served, confirmed at the tip: `ComposerCanvas` is imported only by the aeon
art facet (`src/renderer/workspace/facets/art-facet.tsx:26`), which is registered
for `['aeon']` only (`src/renderer/workspace/register-facets.ts:17-19`; classic's
modules at `:41`), and classic's one clipboard is `tileClipboard`, 64 palette
indices (`src/renderer/state/classicLevelStore.ts:276`, `:593`).

---

## 8. Suite

| | Test Files | Tests |
|---|---|---|
| base `165dde4f` | 603 passed \| 3 skipped (606) | 9070 passed \| 9 skipped (9079) |
| code tip `c83c76e8` | 604 passed \| 3 skipped (607) | 9083 passed \| 9 skipped (9092) |

Both `npm test` runs exit 0, and the failure-class reporter says "no failures in
this run" on both. `9092 - 9079 = 13`, the rows added: N1 to N4, C1 to C4, 7d-1 to
7d-4, W1. The one new file is the composer harness. `npx tsc --noEmit` exits 0,
with no output, at base and at the tip.

---

## 9. Foreground only, tagged, not attempted

No emulator was touched. F-1 to F-3 need an aeon project with two zones.

- **F-1.** Layout facet, marquee, drag a block-aligned region in zone A, Ctrl+C.
  Open a level of zone B, Ctrl+V. Expect the info notice "Only the collision can
  be pasted here: ...", paste mode armed. Shift+click: the collision overlay shows
  the copied collision at the click, the tiles are unchanged, and one Ctrl+Z
  undoes it. A plain click instead: the warning "Not pasted: the copied tiles
  belong to another tile set...", paste mode leaves, nothing changes.
- **F-2.** As F-1 with the Paste setting on Collision: a plain click lands the
  collision.
- **F-3.** In F-1's armed state, the ghost under the cursor shows the footprint
  outline (and collision shading with the overlay on), and NO art. The node row
  counts rasterisations; the pixels need a screen.
- **F-4.** Copy in one checkout, open a second checkout of the same tree, Ctrl+V:
  "Not pasted: this was copied in another project...". With the Paste setting on
  Collision: "Not pasted: the copied collision belongs to another project...".
- **F-5.** Art facet: open a chunk, Ctrl+C with no selection. In another project,
  open a document and Ctrl+V: the collision refusal, the document unchanged. In
  the same project, in another zone: it pastes, "Pasted collision from map
  clipboard...".
- **F-6.** Map, marquee with Tile snap, copy an odd-sized selection. Art facet,
  open a document with collision, Ctrl+V: "Not pasted: this clipboard carries no
  collision...", and the document's collision unchanged.
