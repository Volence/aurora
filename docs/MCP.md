# MCP Integration

Aurora embeds an MCP server (Streamable HTTP) while running. It exposes the
`editor/*` registry (`src/main/editor-methods.ts`) against the live editing
session: aeon art, palette, background and effects tools; the classic (Sonic 1
disassembly) project surface; and the playtest methods. Every mutation is one
undo step (Ctrl+Z), and nothing touches disk until you save.

The same registry is served over the Aether bus at `POST /aether` (JSON-RPC 2.0,
events over SSE at `/aether/events`) for non-AI suite clients — see the README.
Every route is loopback-only.

## Connect (one time)

1. Launch the editor (`npm run dev`).
2. Check the port in `~/.aurora/mcp.json` (default 38473; falls back
   to an ephemeral port if 38473 is in use — always use the file). ⚠ The
   file's *presence* is not evidence the editor is up: check that the `pid`
   it names is alive before trusting the port (see **Discovery file** below).
3. `claude mcp add --transport http aurora http://127.0.0.1:38473/mcp`
   (substitute the port from the file if it differs).

## Tools

Query: `get_project_info`, `get_palette`, `get_tiles`, `get_nametable_region`, `check_budget`, `get_bg`, `list_bgs`, `list_effects_scenes`, `get_effects_scene`, `list_effects_presets`, `get_effects_preset`
Mutate (one undo step each): `set_palette`, `write_tiles`, `paint_region`, `paint_collision`, `save_chunk`*, `stamp_chunk`, `set_bg`*, `assign_section_bg`, `set_effects_scene`, `assign_section_scene`, `set_effects_preset`
View: `goto`, `screenshot`

The tools above operate on an **aeon** project. The classic (Sonic 1 disassembly)
project surface is a separate group — see [Classic project tools](#classic-project-tools).

*`save_chunk` adds to the chunk library outside undo history (additive only),
matching the existing chunk-library behavior. `set_bg` with a `name` argument
likewise ADDS the background to the project BG library (outside undo history)
instead of replacing the act default; the reply includes the generated id.

## Collision

`paint_collision` fills a rectangle of one collision plane (`a` or `b`) with a
single packed cell word. Coordinates are in 16px CELL units (0-127 per axis,
half a section's 256x256 tiles), not tile units — a section is 128x128 cells.
The word is the same packed cell encoding used throughout the editor
(`src/core/collision/collision-cell-word.ts`):

- bits 0-9: shape index (0..1023; 0 = air — the rest of the word is ignored)
- bit 10: X-flip, bit 11: Y-flip
- bits 12-13: solidity for this plane (0=none, 1=top, 2=sides-bottom, 3=all)
- bits 14-15: spare

Painting seeds both of the section's collision planes on first touch (lazily
packing the engine baseline into cell words), same as the human paint tool,
then diffs the rectangle against the plane's current words — cells already
equal to `word` are left alone, and the reply's `painted` count is the number
of 8px sub-tile entries actually changed (up to 4 per cell).

`save_chunk` optionally carries `collisionA`/`collisionB`: packed cell words,
row-major, `(w/2)*(h/2)` entries each (chunk dimensions must be even tiles
per axis so collision cells stay 16px/2-tile aligned). Omit either array to leave that plane
air. `stamp_chunk` places a chunk's art AND collision atomically (one undo
step covering both) and requires even x/y, since collision cells are
16px/2-tile aligned; there is no art-only agent stamp (the UI's Alt-stamp
art-only mode is a human-only shortcut).

`get_bg`/`set_bg` operate on the zone-wide background (Plane B): a **64x64**
tile nametable (4096 row-major VDP words) plus its own tile blob (max **448**
tiles) — a separate tile space from the FG tileset. The legacy **64x32** shape
(2048 words) is still accepted, because the engine's injector zero-pads it to
64 rows rather than refusing; `get_bg` reports the `height` it MEASURES off the
act's own layout (`null` when the act has no background) rather than announcing
a fixed number, so either shape round-trips. 448 is not a policy: the BG tile
region is VRAM `$8000..$B7FF`, and the sprite attribute table sits at `$B800`.
Both numbers are read from the vendored aeon contract
(`src/core/formats/bg-override/bganim-consumer-contract.json`, via
`bg-override.ts`) by the handler AND by the tool schema — neither this doc nor
either of them holds its own copy.

Both directions use the LOCAL index convention (nametable tile
indices index directly into the BG blob): engine-emitted files with
VRAM-absolute indices (1024+) are normalized once at load, so a `get_bg`
result round-trips straight back into `set_bg`. `set_bg` (without `name`)
replaces the whole plane in one undo step. `screenshot` accepts `showBg: true`
to render the background plane during capture (restores the overlay state
afterwards). Note that the editor renders Plane B once at world origin
(512 px wide by 8 px per layout row — 512x512 at full height, 512x256 for a
legacy 32-row layout) — screenshots of regions away from the origin won't show
it.

Per-section backgrounds: every section displays the act default unless
`assign_section_bg` points it at a BG library entry (`bgId` from `set_bg` with
`name`, or `list_bgs`; `bgId: null` reverts to the act default). The viewport
composites the background of the ACTIVE section, so `goto` a section to see
its assigned BG. Assignments are one undo step each and persist in per-section
`.meta.json` sidecars; library entries persist under `data/editor/` on save.

**A per-section BG assignment stops at the editor's own files.** There is no
export step and no `{zone}_BG_{id}` labels: `exportAct` and its
`{dataPath}export/` dump (`act_descriptor.asm`, …) were deleted from the aeon
save on 2026-08-19 and nothing in aeon ever read that directory
(`src/core/project/aeon/save.ts:11-23`). No aeon generator reads
`{zone}_bglib.json` or a sidecar's `bgLayoutRef` — the effects generator
explicitly does not (aeon `tools/EFFECTS_CONSUMER_CONTRACT.md:178`) — and every
section of the shipped act still carries `sec_bg_layout: default`, i.e. "use the
act-wide BG" (aeon `games/sonic4/data/levels/ojz/act1/act_descriptor.emp:207`;
the engine field itself is real, `engine/structs.emp:119`). The background that
DOES reach a ROM is the ACT-WIDE one, through `{dataRoot}editor_bg_override.json`
and aeon's `tools/inject_editor_bg.py` (run by `tools/regenerate-level.sh:94`).
So `assign_section_bg` is an editor/preview binding until a per-section consumer
is built — unlike `assign_section_scene` below, which is baked. **Both tools say
so in their own replies** (`assign_section_bg` → `binding`, `list_bgs` →
`sectionBinding`) and in their published descriptions, from one constant
(`src/core/formats/bg-binding.ts`). The reply used to be a bare `changed: true`,
from which an agent reasonably concluded the background was in the game — the
same shape `list_effects_presets` answers with `sectionBinding` rather than an
all-nulls column. The difference here is that the assignment IS real and IS
stored, so the sentence says where it stops and `list_bgs` keeps its per-section
column; the sentence travels beside it, never instead of it.

**A LIBRARY ENTRY CAN BE NAMED AND ABSENT, AND ON A CLEAN CLONE ALL OF THEM
ARE.** The library is one manifest (`{dataRoot}editor/{zone}_bglib.json`, id and
name only) plus TWO binaries per entry beside it. Measured in aeon on
2026-08-30: the manifest is TRACKED and names **17** entries, and **none** of
the 34 bodies is tracked — `.gitignore`'s blanket `*.bin` catches them and no
un-ignore rule brings them back, under a comment aimed at "dead timestamped bg
experiments". The tracked sidecar `ojz/act1/section_0.meta.json` carries
`bgLayoutRef: "ingame-forest-v15-1786630615596"`, one of the seventeen. So the
same sidecar holds two refs with opposite fates: `sceneRef` resolves (effects
scenes are tracked JSON and genuinely bake), `bgLayoutRef` does not, and nothing
in the file says which is which.

What that costs is the EDITOR, not the ROM — the paragraph above is why: no
per-section BG reaches a ROM either way, so a clean clone is not building the
wrong game, it is authoring against a picture that is not the one it names.
`list_bgs` therefore reports **`unresolved`** — the manifest entries this
checkout cannot open, without which an empty `entries` reads as "this zone has
no backgrounds" — and a per-section **`dangling`** flag. `assign_section_bg`
refuses such an id with a message naming the missing BINARIES rather than the
generic "not found in the library", which would be false about an id `list_bgs`
just printed. Saving never narrows the manifest to what it could read. On the
human side the missing entry is named in the Properties select, the section
grid's tooltip and dot, the map status line, and a warning toast at open.
Nothing blocks: a missing body stays fully editable.

## Effects scenes (parallax/raster)

A **scene** is one JSON document under `data/editor/effects/<scene_id>.json`
describing how the two planes scroll: a list of 1–16 layers (`world_y` plus a
Plane A and Plane B scroll factor each) and scene-level vertical parameters.
The wire shape is the suite contract, `empyrean/docs/AURORA_EFFECTS_SCHEMA.md`
§2; Aurora vendors the machine-readable schema and validates against it.

`list_effects_scenes` gives you the inventory plus every section's current
assignment. `get_effects_scene` returns ONE WHOLE DOCUMENT and
`set_effects_scene` takes one back — deliberately not a field patch. Read,
change, send: fields this editor does not itself expose survive the round trip
because nothing on the path enumerates them.

A **factor** is either a published name (`FACTOR_1`, `FACTOR_1_2`,
`FACTOR_3_16`, … 16 of them) or a custom packed triple `{"s1":…, "s2":…,
"op":…}` — the engine's shift-add encoding, where `s1: 15` means the term is
zero/locked, `s2: 15` means a single term, and `op` is 0 add / 1 subtract.
Arbitrary fractions are not representable and are refused.

`set_effects_scene` validates the whole document before anything is written: an
invalid one is refused with the specific issues and consumes no undo step. Two
rules beyond the JSON schema also apply — the document's `id` must equal the
`id` argument (it becomes part of generated symbol names), and the excluded raw
bridge fields `layer_mask_raw` / `v_deform_shift_raw` are rejected outright.
Pass `scene: null` to delete.

`assign_section_scene` writes `sceneRef` into a section's `.meta.json` sidecar
(`sceneId: null` = the act default). It refuses an id that is not a READABLE
scene, including one whose file exists but did not parse: a ref the build cannot
resolve is worse than no ref. Scene files Aurora could not read are reported by
`list_effects_scenes` and are never overwritten.

**An authored scene DOES reach a ROM.** aeon's `tools/effects_gen.py` — the
generator that bakes these documents into the engine — shipped and was wired on
2026-08-22 (aeon `tools/EFFECTS_CONSUMER_CONTRACT.md:24`, beside
`tools/test_effects_gen.py`). It reads each scene JSON plus each section
sidecar's `sceneRef`, lowers them through the engine's real `scene()`/`layer()`
constructors — so an authored value that violates an engine `ensure` fails the
BUILD, not this tool — and emits
`games/sonic4/data/generated/ojz/act1/effects_scenes.emp`, whose two binding
functions `act_descriptor.emp` calls. That module's own header reports the live
bake ("2 editor scene(s) reached by an assignment, 2 binding(s), 9 act
sections").

Which build you run decides what happens, and neither outcome is silent:

- **`build_and_run` bakes.** It sends `FAST=1` by default
  (`src/core/aether/build-plan.ts:174-179`); aeon's `build.sh` sees the editor
  tree is newer than the generated one (`build.sh:394-407` via
  `tools/level_staleness.py`, whose "newer" side is all of `data/editor/**`) and
  re-runs `tools/regenerate-level.sh`, which calls `effects_gen.py emit`
  (`regenerate-level.sh:206`). Save → build → reload carries a scene edit into
  the ROM.
- **A canonical (non-FAST) `./build.sh` refuses.** The generated module is a
  COMMITTED artifact, so `build.sh:534` runs `effects_gen.py check` and exits
  naming `tools/regenerate-level.sh`. A stale bake fails the build rather than
  building green and dropping the edit.

Two manual steps remain, and they are aeon-side: the regenerated tree is
committed by hand, and an act is only wired at all once its `act_descriptor.emp`
calls the generator's binding functions (OJZ act 1 does; a new act is a
one-time programmer edit).

## Effects presets (raster bands)

A **preset** is a different document from a scene, in a different directory:
`data/editor/effects/presets/<preset_id>.json`. A scene is a `parallax_config`
— how the two planes scroll. A preset is a **raster band program**: a list of
bands, each one turning a CRAM write on at a screen line and off at another.
The scene loader refuses a `bands` key outright, so bands authored into a scene
file would produce a document nothing loads.

Each band is `{top, bot, sh, on}`. `top`/`bot` are screen lines (the band covers
`top..bot-1`), `sh` is Shadow/Highlight for the band (`false`/`0` = a two-fire
band, `true`/`1` = the three-fire S/H shape — required, no default), and `on` is
the write, carrying **exactly one arm**:

- `cram` — `{addr, colours}`, raw CRAM words written from a CRAM *byte* address.
  The length of `colours` is also the derived restore's word count, so adding a
  colour changes what the band costs.
- `pal_region` — `{addr, slot, pal_line, entry, count}`, colours streamed from a
  `Pal_Variant_Stage` slot. `slot` is the SOURCE, not the CRAM destination.

Two arms would be two writes and therefore two restores, which is two bands —
author the second one as a second band. `vsram` is deliberately not an arm: a
band's restore is derived from the ON op's CRAM span, and a VSRAM op has none.

`list_effects_presets` gives you the inventory (id, name, band count) plus any
preset file that exists and could NOT be read — those ids are unusable and
Aurora will never overwrite them. `get_effects_preset` returns ONE WHOLE
DOCUMENT and `set_effects_preset` takes one back, deliberately not a field
patch: read, change, send. Pass `preset: null` to delete. Every write is one
undo step; a re-send of an identical document is not.

**No numeric value is range-checked or clamped on this side, on purpose.** The
schema is silent on screen-line ranges, CRAM address ranges, burst ceilings,
band counts and height minimums, and Aurora forwards what you wrote verbatim, so
the engine's own `ensure` fires at build time with the measurement behind the
rule (`the ON fire costs 624 cyc against 488 available`). A bound invented on
this side would replace that sentence with silence. What IS validated is shape
and identity: the document's `id` must equal the `id` argument, the reserved
wave-2 name (`fires`, the one the vendored schema still reserves; `cycles` and
`variants` became declared channels of the same document at empyrean `12aecd5`,
schema §7.2, and parse here — with no control authoring them yet, ROADMAP row
97) is refused BY NAME rather than as a typo, and an invalid document is refused
with the specific issues and consumes no undo step. The pin of record for that
schema is `src/core/formats/effects/aurora-effects-preset.schema.provenance.json`,
never a list in prose.

`cycles` has three states with one spelling each — absent keeps the section's
hand-authored cycle, `null` is cycling OFF, an array is the script — and
`variants` is positional (index = slot: an index the array does not reach keeps
the hand-authored slot, `null` clears it, an object authors it). Send a document
with `cycles: null` and it comes back with `cycles: null`; this side never
normalises absent to null or drops a null slot, because each of those is a
different instruction to the engine.

**`assign_section_preset`** assigns which raster preset a section uses — `rasterRef` in that section's
`.meta.json` sidecar. A preset id, or `null` to unbind; absent and explicit-null
are the same state for this key, exactly as for `sceneRef`. One undo step, and a
re-send of the ref already there is not one. An id that is not a **readable**
preset is refused, an unreadable file's id included: a ref the build cannot
resolve is worse than no ref.

`SectionMeta` carries `bgLayoutRef`, `paletteRef`, `rasterRef` and `sceneRef`,
and `rasterRef` **is** the per-section preset binding (empyrean
`docs/AURORA_EFFECTS_SCHEMA.md` §3.1, adjudicated 2026-08-30 — **not**
`effectsRef`, which stays reserved and unspent for a *total* binding, since a
preset document supplies only the raster channel of aeon's eight-channel
`EffectsPreset`).

**Saving a preset does not install it, and binding one no longer stops at the
sidecar — but it still does not finish.** aeon's build **reads** `rasterRef` as
of aeon **`4aa2abc0`** (2026-08-30): `tools/effects_gen.py` resolves the key
against the preset documents, refuses an id naming no document *by name with the
known ids listed*, refuses a numeric `rasterRef` (Aurora's own parser nulls a
non-string silently, so the build is the last reader that can see that mistake),
and emits the section's raster program plus an always-present chooser.
`tools/EFFECTS_CONSUMER_CONTRACT.md` §2.2 carries the key's normative shape.

*(This paragraph previously said no aeon consumer read the key. That claim
carried a dated expiry naming the two files above; they moved, and it was
retired here rather than found stale later.)*

**The call site now exists — for one section.** At aeon **`9cdf32d8`**
(2026-08-30; still the only one at **`6e2495a5`**) exactly one `preset()` in
`games/sonic4/data/effects/ojz_effects.emp` passes the emitted chooser to its
`raster:` channel: `OJZ_Preset_Sec5`, as `raster: ojz_act1_sec_raster(sec: 5,
hand: Raster_Program_None)`. So there are **three cases, not one**:

| you bind | what happens |
|---|---|
| **section 5** | the chooser resolves the ref — the first choice made in this editor that aeon's build carries to a raster channel, and it is bound in aeon's tree since **`c9a462be`** |
| **section 5, unbound** | the chooser returns `hand:` (`Raster_Program_None`); nothing changes |
| **any other section** | the key is written, aeon's witness counts it, **and nothing consumes it** |

*(This paragraph previously said no `preset()` anywhere passed the chooser, and
that the hand-work left was "one line per section". aeon's step 5 did not reveal
a non-uniformity — it **manufactured** one, so the universal sentence became the
lie the day it landed. It is a case split now, and it names the number 5 on
aeon's drafting rule: a sentence naming the number expires visibly when the
number moves, while "a bound section plays" would go wrong silently the first
time someone binds section 6.)*

**The third case is no longer silent, and it is not silent in aeon.**
`tools/effects_seam_gate.py` fails a full build when a section's sidecar names a
`rasterRef` that no `preset()` threads, naming the section and the id. Two
qualifiers ride with that: nothing in Aurora refuses or warns (the panel offers
every section and this tool accepts every section), and `FAST=1 ./build.sh`
skips the gate. At `9cdf32d8` no sidecar in aeon's tree carried the key, so
that arm was vacuous and printed that it was; since aeon **`c9a462be`**
(2026-08-30) `games/sonic4/data/editor/ojz/act1/section_5.meta.json` carries
`"rasterRef": "ojz_sec5_showcase"` — the two files Aurora's own writer authored
and handed over — so at `6e2495a5` the arm has **one live subject** (`1 sidecar
rasterRef(s)`, checked against the threaded set) and the generated module says
`EditorRaster_OJZ_Act1_Bindings = 1`. Section 5 has therefore been exercised
from this editor to aeon's build, **and once past it, in aeon's tree**: aeon
**`4a4d3474`** (2026-08-30, "step 6 measured: the section-5 authored band IS
SEEN on screen", an ancestor of their `origin/master` `e6405428`) commits
`docs/research/reference_captures/2026-08-30-sec5-band/`, whose README records
CRAM line 2 entry 8 reading `$0EA4` at screen lines 40, 56 and 72 and `$0000`
at 8, 20, 96 and 150, all in one frame, on two bound runs that are
byte-identical — and `$0000` on every one of those lines on a control ROM
built with the sidecar's `rasterRef` null, `Raster_Program` 0. That was taken
on aeon's headless `oracle-aether` instance, not hardware, and the README lists
what it does not establish (exact transition lines, other CRAM entries, other
camera positions, a walked crossing, motion). **It is aeon's measurement of
aeon's build.** No CRAM was sampled in Aurora, and nothing of that frame is
visible in this editor — the viewport still composites no `rasterRef`.

*(This paragraph previously said the arm was vacuous today. That was the
expiry's first clause; it fired the same day and was retired here rather than
found stale later. It then said section 5 had been exercised "and no further",
citing `c9a462be`'s "nothing has been seen on screen". That was the fifth
clause; it fired at `4a4d3474` the same afternoon and was retired here the
same way — against the committed artifact, never a description of it.)*

**And the bound set itself is under test in aeon — so `null` has a build
consequence, and so does binding any section but 5.** At aeon `origin/master`
**`027ec162`** (2026-08-30) three content tests in `build.sh`'s pytest lane
accept exactly one bound set, section 5 → `ojz_sec5_showcase`, and refuse every
other tree by name: unbinding section 5 empties the set and orphans the preset
document, which all three refuse (`tools/test_effects_seam_gate.py` `:331` and
`:358`, `tools/test_raster_cycle_table_lint.py` `:228`); binding any other
section, beside 5 or instead of it, fails the exact-`[5]` assertion. That lane
runs only in the canonical build — `FAST=1` sets `NO_LINT=1` and the lane sits
under `NO_LINT` — so `FAST=1` builds the tree, which is how aeon built its own
control ROM. **Nothing in Aurora prevents the write**, on purpose (the standing
refusal in `src/core/formats/raster-binding.ts`: a gate built from one act's
content snapshot would be wrong for the next act and read as authority). The
reply carries this as a clause of the same constant, on the unbind reply and on
every bind reply alike; the tool description below refers to that constant
rather than copying it, and the band-preset panel renders it above the select
whether or not the active section is bound. The clause carries its own expiry
(the `[5]` literal, the tests renamed or the lane leaving the `NO_LINT` block,
the lint dropping its sidecar arm, a second binding shipping — owner aeon's
lane) and names the three files to re-read before quoting it.

Wiring a second section is a preset **split** plus one call-site line — sections
6-8 share one `EffectsPreset` record, and threading a section-keyed chooser into
a shared record is itself a seam-gate refusal.

This tool therefore reports that limit **on its success reply**, not only
on a refusal, for the reason
`assign_section_bg` states: a tool that reports success for a binding nothing
bakes misleads its caller. It is one sentence
(`src/core/formats/raster-binding.ts`) shared by the reply, the published tool
descriptions and the band-preset panel's own author-facing limit, so the three
cannot describe it differently. `list_effects_presets` reports it too, beside a
per-section `sections` column that reads the same key back.

The **per-section raster select** in the band-preset panel writes the same key
through the same `sectionPresetCommand` (ROADMAP row 93's remaining half,
landed), so an agent and an author cannot disagree about what a binding or an
unbind is — its empty option and this tool's explicit `null` are one state. What
the select does not add is a picture: this editor draws no band, and the one
frame of one anybody has looked at — aeon **`4a4d3474`** (2026-08-30),
`docs/research/reference_captures/2026-08-30-sec5-band/`, section 5 at one
camera position in aeon's emulator, in aeon's tree — is the only thing a preview
here could be checked against, and none is built (the panel's `NO_PREVIEW` says
so, with its own dated expiry). Nothing anywhere checks that a band is VISIBLE —
a legal band over an unused palette entry builds green and shows nothing.

*(This paragraph previously said nobody in the suite had ever looked at one of
these bands on screen. That was true until `4a4d3474` landed the same day and
was retired here against the committed README, not a description of it.)*

## Classic project tools

A **classic** project is an on-disk Sonic 1 disassembly (the `tiles → blocks →
chunks → chunk-id layout` hierarchy). These tools open one, read acts, and edit
them in memory; nothing touches disk until `save_project`. Every mutation is one
classic undo step (Ctrl+Z), sharing the classic undo timeline with human edits —
exactly like the aeon tools above share the aeon undo stack. A classic and an
aeon project are never open at once.

Batched shapes: the mutation tools take arrays where the underlying editing
commands do, so an agent never loops single-cell calls.

| Tool | Params | Result |
|---|---|---|
| `open_project` | `{ dir }` | Opens a directory, classic-first (the same flow as File→Open). A Sonic 1 disasm opens the classic surface and returns `{ type, label, report: {resolved,total}, zoneTree }`; a real aeon project is left unchanged (`{ type: "aeon", opened: false }`); an unrecognized directory errors. |
| `get_project_report` | `{}` | The full `ResolutionReport` of the open classic project (per-file resolved/missing/ambiguous + counts). |
| `list_classic_levels` | `{}` | `{ levels }` — the project's zone/act refs (`zone, act, label, available`). |
| `get_classic_level` | `{ zone, act }` | Opens + reads one act. Summary only: `dims` (fg/bg w×h), `counts` (tiles/blocks/chunks/objects), `palettes` (4×16 CRAM words), `objects`, `start`, and `layout` (fg/bg chunk-id grids as nested row arrays; S1 ids are 1-based — `0` = air, `1..N` = the N chunks). Not the raw tile/block/chunk buffers. |
| `set_layout_region`\* | `{ plane, x, y, chunkIds }` | Stamps a 2D grid of chunk ids into a layout plane (`fg`/`bg`), top-left at `(x,y)`. Chunk ids are 1-based: `0` = air/blank (erases the cell), `1..N` reference the N map256 chunks. |
| `edit_chunk`\* | `{ chunkId, cells: [{index, word}] }` | Sets individual 16×16 block cells of one chunk (packed S1 chunk-block words). `chunkId` is a 1-based engine id (min `1`; `0` is air/blank and not editable). |
| `edit_block`\* | `{ blockId, def: {cells: [4]} }` | Replaces one 16×16 block's 4-tile-cell definition. |
| `add_chunk`\* | `{ cells?: [{index, word}] }` | Appends a NEW 256-cell chunk (grows the pool). Optional sparse `cells` seed it over a blank base; reply gives the new 1-based engine `chunkId`. Refuses at the 127-chunk cap ($80+ is unaddressable — the layout loop bit). |
| `add_block`\* | `{ def?: {cells: [4]} }` | Appends a NEW 16×16 block (grows the pool). Optional `def` seeds it (else four blank tile-0 cells); reply gives the new 0-based `blockId`. Refuses at the 1024-block cap (10-bit block refs). |
| `place_object`\* | `{ entry }` | Appends one object placement; reply includes the new `index`. |
| `move_object`\* | `{ index, x, y }` | Moves the object at `index`. |
| `delete_object`\* | `{ index }` | Deletes the object at `index`. |
| `set_colind`\* | `{ entries: [{blockId, value}] }` | Sets block→collision-shape indices. |
| `set_block_collision`\* | `{ x, y, w, h, shape, mode?, dryRun? }` | Sets the collision SHAPE on the block under every cell of a rectangle, in 16px FG cell units. Does NOT set solidity — that rides the chunk cell (`edit_chunk`). `mode` is `link` (default; changes the block everywhere it is used, ZONE-wide) or `isolate` (clones the block first, at the cost of one collision-table entry per distinct block — GHZ and SBZ have none spare). Partial by design: cells that are air, blank block 0, a dangling block reference, outside the layout, or (link) past the end of the zone's collision table are skipped and counted. Refuses only when nothing applied and nothing already matched, or when isolate needs more table entries than the zone has. |
| `set_level_palette`\* | `{ line, colors: [16] }` | Writes one classic-level palette line (0-3) as 16 Genesis CRAM words (`0000BBB0GGG0RRR0`; index 0 transparent). Bumps the palette epoch so chunk art + object sprites refresh. Named `set_level_palette` (not `set_palette`) because the aeon `set_palette` already owns that name in the shared tool registry and the classic surface allows line 0. |
| `set_start`\* | `{ x, y }` | Moves the player spawn point to `(x,y)` (both 16-bit; the startpos file has no terminator sentinel). |
| `save_project` | `{}` | Saves every dirty act through the guarded (mtime-checked) write channel. Structured outcome: `saved` / `conflict` / `partial` / `error` / `nothing`. |
| `commit_canvas`\* | `{ name, targets?, paletteResolution?, collision?, dryRun? }` | Commits a saved canvas (under `.aurora/canvas`) into the open act: cut to tiles/blocks/chunks, dedupe, reclaim, write. Reply carries the full commit report plus the 1-based ENGINE ids of any appended chunks (pass those to `set_layout_region`). `paletteResolution` says what to do when the canvas draws with colours the act does not have — default `none` refuses and reports them, `use-act-colours` re-indexes onto the nearest act colours, `adopt-into-zone` writes them into the ZONE palette (every act sharing that palette file displays them); line 0 is never written by either. A refusal returns `ok:false` with a message, a resolution, and which `paletteResolution` values would unblock it. Also returns `warnings` from loading the canvas — an unreadable sidecar means the canvas was treated as unconstrained. |
| `import_art_sheet`\* | `{ path, targets?, collision?, dryRun? }` | Same commit from an INDEXED (paletted) PNG made elsewhere, mapped onto the open act's palette first. No size cap (unlike a canvas). Reply is `commit_canvas`'s; the refusals are a NARROWER set (no palette-drift, palette-unmappable or cell-clash, and so no `paletteResolution` to pass) plus two import-only ones: a colour the act does not have, and an 8×8 cell mixing colours from two palette lines — for that one, adding the missing colour to the zone palette only helps if it goes on the LINE the cell already uses. |

## The playtest loop (aeon)

These drive a RUNNING emulator over the Aether bus, through the same store
actions the UI drives — an agent and a person pressing the key cannot diverge.
All five no-op gracefully when nothing is connected; none of them connects on
its own.

| Tool | Params | Notes |
|---|---|---|
| `aether_status` | `{}` | Connection state, the server, whether live palette can land (both `Pal_Base` symbols resolved), build state, last errors. **Read this before assuming a push or warp will do anything.** |
| `aether_connect` | `{ connect? }` | Connect (default) or disconnect. Connecting is always explicit — Aurora never opens the socket by itself. |
| `push_palette` | `{ line }` | Pushes the editor's current colours for zone palette **line 1–3** to the running game, which recolours without a rebuild. Line 0 is the character palette and the engine owns it, so the schema excludes it. Reports `pushed: true` when the push is ACCEPTED — the store coalesces at ~10Hz, so bytes may still be queued. Not persisted: a rebuild or a section crossing restores ROM colours. |
| `warp` | `{ x, y }` | Play-from-cursor, in act-world PIXELS. Reports where the player **landed** — the engine clamps to act bounds, so the answer can differ from the request. Needs a DEBUG build; a release ROM has no warp mailbox and the tool says so. |
| `build_and_run` | `{}` | Save → re-bake level data → build → reload the emulator → put the player back where they were. The one call that makes an edit real. A FAILED build does not reload (the ROM on disk is the previous one) and returns its error output, because an agent that only learns "it failed" cannot fix the document that caused it. |

`commit_canvas`, `import_art_sheet` and `set_block_collision` return a refusal
in the RESULT as `ok:false` with a human-facing sentence and a `resolution`, not
as a protocol error — a refusal is a decision the caller can act on, not a
malformed call. Thrown faults stay for genuine breakage (no act open, canvas not
found, unreadable file), because the transport maps a throw to `-32603 INTERNAL`,
which claims the server broke.

\* One classic undo step each. Editing tools require a classic project AND an
open act (`get_classic_level` first); they error cleanly otherwise. A command's
validation rejection (out-of-range chunk id, nonexistent block, invalid object,
…) surfaces as a structured MCP error carrying the command's human message —
nothing is mutated and no undo step is recorded.

`save_project` never overwrites blindly: it uses the same read-time mtime guard
as Ctrl+S. On a `conflict` (a file changed on disk since open) nothing is
written; on a `partial` some files landed and the rest stay dirty for a retry.

## Constraints enforced at the tool boundary

- Colors: Genesis 9-bit BGR, even channel values; palette line 0 rejected (sprite-reserved).
- Tiles: 8x8, pixel values 0-15, index 0 transparent; tileset capped at 2048.
- Budget: flip-aware unique tiles per VRAM color group must fit the 1024-tile FG pool
  (BG region starts at slot 1024). `check_budget` and every mutation reply report it.
- Over-budget paints are allowed and reported (`fits: false` in the reply); export is
  where overflow hard-fails. Optimize tile reuse before exporting.

## Aether bus

Alongside the MCP server, Aurora serves the **Aether** suite bus on the same port:
JSON-RPC 2.0 over `/aether` (POST) plus a push event channel at `/aether/events`
(SSE), behind an `initialize`/capabilities handshake (`protocolVersion: 1`). It
exposes the same method surface as the MCP tools above, namespaced `editor/*`.
This lets other suite tools drive Aurora directly, without MCP. (The outbound
side — Aurora acting as a *client* of another tool's Aether, e.g. the emulator —
is a later workstream; today Aurora only serves the bus.)

## Discovery file

`~/.aurora/mcp.json` is written on startup and removed on exit (the legacy
`~/.sonic-level-editor/mcp.json` is also written during the rename transition).
It contains `{ "url": "...", "port": <n>, "pid": <n>, "aether": "...",
"aetherEvents": "...", "protocolVersion": 1 }`.

**Removal covers the graceful quit AND the abrupt one.** Until 2026-08-31 it hung
off Electron's `will-quit` alone, so a `SIGTERM` — how every CDP harness ends a
run, and how a session manager ends an app — terminated the process with the file
still on disk naming a pid that no longer existed, on every run. `startMcpServer`
now installs an exit net (`src/main/discovery-file.ts`) covering `exit`, `SIGINT`,
`SIGTERM` and `SIGHUP`, each signal re-raised after cleanup so the app stays as
killable as it was.

**⚠ PRESENCE IS STILL NOT LIVENESS, AND NEVER CAN BE.** `SIGKILL`, a segfault and
a power cut are not coverable by any writer. So a reader must check the `pid`
field before trusting the port: if that process is not running, the file is stale
and the editor is not active. This is the same defect as `[ -S socket ]` reporting
a corpse as a server — the failure state and the success state leave the same
artifact on disk. In-repo readers go through `scratchpad/lib/harness-guard.mjs`,
where `resolveOwnedDiscovery()` additionally requires the pid to be a descendant
of a process the harness itself launched, and `livenessOf()` annotates every
printed line `ALIVE` / `DEAD — STALE FILE`. Proof:
`npm run harness:discovery-exit-net`.

## Troubleshooting

- **Tools error with 'editor not ready'**: the app window has not finished loading.
  Wait a moment after the window appears and retry.
- **Discovery file present but tools fail**: the file may be stale from a previous
  crash. Check the `pid` in the file against running processes. If the process is
  gone, restart the editor; it will overwrite the file.
- **Screenshots return blank or partial content**: screenshots work even when the
  editor window is occluded or behind other windows (`backgroundThrottling` is
  disabled). If content is blank, ensure a project is loaded and the section is
  rendered (use `goto` first).

## Shared atlas, palette, and undo stack with human editing

Agent and human art editing share the same atlas, palette, and undo stack. A `write_tiles`
call and a brush stroke in Art mode are the same kind of operation: both produce
`set-tileset-tiles` commands on the project's EditHistory, and both are undone with Ctrl+Z.
The `goto` and `screenshot` tools auto-switch the editor to Map mode so the viewport is
visible for screenshots. See `docs/ART_SUITE.md` for the full human-facing art workflow.

## Known limitations

- Tile atlases were unified (2026-06): rendering, export, budget, and MCP all use
  the zone tileset.
