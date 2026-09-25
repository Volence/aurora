# S2-DONOR-PAGE: the donor-level page (plan, 2026-09-25)

Queue row S2-DONOR-PAGE, project REGIONS. Branch `parcel/s2-donor-page`, cut from aurora master
`c276f527`. Aeon read at `origin/master` **`f4f1a32e40b6377d557f4f67fd8cec9278d5df5a`**, through
git objects only (`git -C <aeon> show origin/master:<path>`), after a fetch.

The owner's words (aeon session 2026-09-17T16:00:34Z, transcribed in
aeon `docs/DEFERRED_WORK.md` under `S2-COMPRESSED-ACT`): *"we convert the levels to our format, but
then I load them on a page and can marquee parts of it, copy it over to our layout, and paste it
in as a region or something."* First cut: level art and collision only.

## TRUST SOURCE OVER THIS PLAN

Every aeon fact below was read at `f4f1a32e`. Aeon is another lane's live tree. If a file in
front of you disagrees with this document, the file wins; say so in the packet.

---

## 1. What the tree says, and where it disagrees with the brief

Read in full: the settled packet `docs/reviews/2026-09-17-s2-donor-page-read-half-settled.md`;
aeon design §8; aeon `clip-manifest.md`, `whole-zone-converter.md` (via §8), `clip-collision.md`
(via §8 and `tools/clip_act_bake.py`'s header), `2026-09-25-two-zone-act.md`;
`tools/clip_manifest.py` whole; the four clip fixtures.

### 1.1 Things that moved since the settled packet (aeon's current text wins)

- **R12 exists.** The paste SHIFT (dst origin minus src origin) must be a multiple of **16 px**
  in both axes (collision quantum, `collision_pipeline.PROFILE_LEN`). "Every coordinate a
  multiple of 8" is necessary and no longer sufficient. W1 is retired.
- **Corridors exist** (`corridors: [{id, dst_rect, floor_y}]`, rules K1 to K3). A clip act the
  page reads may carry them; the page must read and preserve them, never drop them on write.
- **`severed_xover_reason`** is a per-clip field the loader reads (C1's opt-out). Preserve it.
- **Clip and act ids are held to the region-id pattern** `^[a-z][a-z0-9_]{0,31}$` (R3). Donor
  and zone names stay upper case in their own fields.
- **A manifest carrying `palette` is refused** (R3), as the settled packet says.

### 1.2 The contradiction that decides S3 (stated, not picked around)

§8 of aeon's design says a paste writes three things: (1) the clip's words and both collision
planes into "the target act's section files", (2) a `regions.json` row, (3) a `clips.json`
entry. **Rows 6 and 7 of aeon's own staged plan, as landed, consume only (3):**

- `tools/clip_act_bake.py` composes the act's section files FROM the manifest and the donor
  trees (`clip_manifest.cell_grids` and `collision_grids`: same rectangles, both planes). It
  never reads an editor act's section files.
- `tools/clip_rom_bake.py` builds the ROM's region rows and per-zone presets itself
  (`region_plan`, the generated `clip_act.emp`). It reads no `regions.json` and no
  `region_id` (grep over `clip_rom_bake.py`, `clip_act_bake.py`, `clip_reachability.py` at
  `f4f1a32e`: zero hits for `region_id` or `regions.json`).
- A clip act is a throwaway re-bake of the ONE act slot (`S2CLIP=<id> ./build.sh`), not a second
  editor act. The only editor act in aeon's `project.json` is OJZ act 1.

So "write the words into the act's section files" has no consistent target. Writing them into
OJZ act 1's editor tree would put Sonic 2 tile indices into the shipped act, where they index
OJZ's tileset: the canonical ROM would change and draw garbage. That is refused outright.

**What this parcel does instead, and why it is not a degradation:**

- The paste writes the manifest (item 3), which is the file aeon's pipeline builds from.
- The "section files" requirement is met through aeon's OWN composer: after validation the page
  runs `clip_act_bake.py bake <candidate> --out <temp dir>` and reads the composed section
  files (`section_N.tiles.bin`, `.collattr.bin`, `.collattrb.bin`, `.zonekey.bin`) back from
  disk. The target view is drawn from those bytes. So what the author sees IS what the ROM
  bake composes, both collision planes included, and nothing is written into aeon but
  `clips.json`.
- Items 1 and 2 as §8 words them are **BLOCKED on an aeon ruling**, written as a request in the
  packet: either retire them in §8 (the manifest is the whole paste), or name the act tree whose
  section files and `regions.json` a clip bake would read.
- **`region_id` is NOT written.** It is a cross-reference into a `regions.json` row, and this
  parcel writes no row. Writing it would name a rectangle in a document that does not exist.
  The reader treats it as absent-capable (the `s2_two_clip_pins` fixture has none).

### 1.3 Things the page must not assume (the settled packet's four, plus the new ones)

1. `region_id` optional; read absent-capable. Row on `s2_two_clip_pins` (0 of 2 carry it).
2. No palette or preset field; a manifest with `palette` is refused by aeon's loader.
3. Clip ids follow the region-id pattern.
4. **Collision is not in the manifest.** The page says, next to every paste, exactly what the
   bake copies from the rectangle: the nametable words and BOTH collision planes (the bake's
   `collision_grids` shares `cell_grids`' loop), and that objects and rings are not carried.
   It never claims collision the composed bytes do not show; the per-clip solid-cell count
   comes from the bake's `clipact.json`.
5. **`donors/` absent, empty and present are three states.** Measured 2026-09-25: the LIVE aeon
   tree on this machine has `donors/s2disasm/EHZ` (someone ran the converter). The packet said
   absent. It is per-machine, so the page and the tests handle all three and assume none.
6. A donor tree is not an act tree: no `project.json`, no `regions.json`, no meta. The claim
   "aurora needs no new loader" is **false for Aurora's code**: `loadAeonProject` requires
   `project.json`, and `MapViewport` renders only the store's one project. What IS true is that
   every FILE format is one Aurora already parses (`parseNametable`, `parseCollAttr`,
   `parseTiles`, `decodeGenesisColor`), so the new reader is a thin one over existing parsers.

## 2. Where the page lives (look choices, defensible and recorded)

- **A new facet, `Donors`**, aeon-only, granted beside `regions`. It swaps the canvas, so by
  `core/shell/facets.ts`'s ordering rule it goes AFTER `art` (order 60), not in the map group.
  A panel of the Map facet was rejected: the Map canvas is the open act's `MapViewport`, and a
  donor zone is not that act.
- **Canvas: two panes stacked.** Top, the donor zone (larger). Bottom, the target clip act as
  aeon's bake composes it. Left-drag on the donor pane is the marquee; wheel zooms about the
  cursor; right-drag pans. A click in the target pane places the paste.
- **Right panel: three blocks, top to bottom:** Donor (the list, or the empty state naming the
  command), Selection (the rect readout), Paste (target clip act, clip id, destination, the
  Paste button, refusals in words, undo/redo, and what was copied plus aeon's per-clip readout).
- Crop shading: outside `crop_tiles` is dimmed on the donor pane, because R9 refuses it.
- Line 0 cells draw from `art/palettes/SonicAndTails.bin` (the file the engine loads there);
  lines 1 to 3 from the tree's `palette.bin`.

TAGGED for the overseer (look questions, not stopped on): the pane split ratio; whether the
target pane should be a second facet; the crop shade colour; whether Ctrl+Z should reach the
paste (see S3).

## 3. Slices, each with its proof

### S1: open and render a donor tree (read-only)

- `src/core/formats/donors/donor-tree.ts`: `listDonors(fa)` returning
  `{state:'absent'} | {state:'empty'} | {state:'present', donors:[{donor, zones:[...]}]}`
  (absence asked of `exists`, never inferred from an empty `list`); `readZoneManifest(text)`
  for the zone.json subset the page reads, refusing a missing key by name; `loadDonorZone(fa,
  donor, zone)` reading tileset, palette and every section's three files (wrong length is a
  refusal, per `clip_manifest.section_word_grid`), stitched row-major `N = sy*grid_w + sx`.
- The converter command is a constant: `python3 tools/s2_zone_convert.py convert --all-six`,
  run in aeon.
- Facet registered; `DonorsPage` canvas composes each section once into a bitmap with the
  existing `composeNametable`.
- Owned fixture `test/fixtures/donors/`: a 2x2-section donor (so a column-major stitch is
  distinguishable from row-major), synthetic tiles and patterns, crop smaller than the grid,
  zone.json shaped from a real converter output at `f4f1a32e`, generated by a committed script.
- Rows: three states; zone.json refusal by key; stitch order; wrong-length refusal; the
  composed pixels of a painted cell are not blank (anti-vacuous).
- Currency: aeon's clip fixtures `s2_two_clip` and `s2_two_clip_pins` vendored into the
  existing `aeon-fixture-currency.test.ts` population; the owned zone.json pinned to the
  converter's blob (`tools/s2_zone_convert.py` at `f4f1a32e`) and to the key set a real run of
  that converter wrote, with a currency row that reads the converter at `origin/master` and
  prints the revision it compared.

### S2: marquee

- `src/core/formats/donors/donor-marquee.ts`, pure: two world points to a rect snapped OUTWARD
  to 8 px, clamped to the crop; the readout text.
- Rows: every coordinate a multiple of 8 (a census over a grid of drags, not two cases); never
  outside the crop; a drag entirely outside the crop gives null.

### S3: paste

- `clip-manifest-doc.ts` (beside the donor reader), pure: parse (region_id absent or present,
  corridors and unknown optional keys preserved), serialise (two-space JSON, one trailing
  newline), `withClip` (append), default clip id and default destination, the R12-preserving
  destination snap.
- Main: one narrow IPC, `CLIP_TOOL`, with exactly two verbs: `validate` runs
  `python3 tools/clip_manifest.py validate <temp candidate> --donor-root <project>/games/sonic4/data/donors`,
  `bake` runs `python3 tools/clip_act_bake.py bake <temp candidate> --out <temp dir>` and returns
  `clipact.json` plus the composed section files. cwd is the open project; the candidate text
  goes to a temp file main creates and deletes; nothing is written into the project. No other
  argv is reachable.
- Renderer flow: validate (aeon's words shown verbatim on refusal) then bake (refusal shown
  verbatim) then a guarded write of `clips.json`. Undo and redo restore the previous file
  exactly, deleting the file when the paste created it. Buttons on the page; Ctrl+Z routing
  is TAGGED (the level doc owns Ctrl+Z today).
- Rows: manifest round trip on all four vendored fixtures, the absent-region_id case, corridors
  preserved; argv construction and containment for the IPC (injected spawn); the flow's
  refusal path writes nothing.

### S4: per-clip readout

The bake is already run at paste time, so `clipact.json`'s `collision.per_clip`
(`attr_entries_alone`, `attr_entries_added`, `solid_cells`, `marks_inside_src`,
`marks_outside_src`) and the act-wide pool and worst window are shown. Per-clip tiles and pages
are NOT in `clipact.json` (the pool is act-wide); said on the page, booked for aeon.

## 4. Proof beyond the node suite

- **Fidelity rig** `donor-fidelity.test.ts` (under test/live), opt-in (`AURORA_DONOR_FIDELITY=1`,
  otherwise `ctx.skip` naming the command and the path): materialise aeon at `origin/master`
  with `git archive` into a run-unique scratch dir (never the live tree; a revision rather than
  a working tree, so the result names what it measured), run the converter there, load the real
  trees with Aurora's reader and check them against their own `zone.json` (painted cells,
  distinct tiles, sha256 of every file); build a manifest with Aurora's writer, validate it with
  aeon's loader, bake it, and compare the baked dst words and both planes to the donor's src
  cells byte for byte. Delete the dir after.
- **CDP harness** `donor-page-harness.mjs` (scratchpad), `npm run harness:donor-page`: open,
  marquee and paste with real `Input.dispatch*` events on a run-unique copy with a converted
  tree; rows read the donor pane's pixels (not blank), the marquee readout, `clips.json` bytes
  from disk after the paste, and the composed dst cells from the bake's files.
- Every row red-first, mutation shown on disk, restored from a commit.

## 5. Not in this parcel

Objects and rings; a `regions.json` row and editor section-file writes (BLOCKED, 1.2); a
background per zone; running `S2CLIP=... ./build.sh` (a ROM build is aeon's, and nothing here
runs an emulator).
