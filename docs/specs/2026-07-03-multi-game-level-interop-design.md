<!--
Authored 2026-07-03 (Claude Fable 5). Design for ROADMAP.md Phase P8 — user-requested:
"load in Sonic 1/2/3K levels, convert them to each other and to Aeon levels, and Aeon
levels to them." Research: three format surveys against s1disasm/s2disasm/skdisasm +
DIRECT VERIFICATION of the contested bit layouts against SonLVL's API source
(programs/SonLVL/SonLVLAPI/DataTypes.cs) — treat SonLVL API as the definitive format
reference throughout; where this spec and SonLVL disagree, SonLVL wins.
-->

# Multi-Game Level Interop (S1 / S2 / S3K ↔ Aeon) — Design

## Goal

Open a Sonic 1 / Sonic 2 / Sonic 3&K level in Aurora, edit it with the full toolset,
and convert it to any other supported target — including Aeon acts — and convert Aeon
acts back out to the classic formats. Hub-and-spoke: every game is an adapter against
one neutral model (the same architecture that already works for sprites,
`src/core/formats/games/*`).

Equally first-class: **world assembly** — import several levels (from any mix of
games) into ONE aeon act, placed adjacent in the section grid, so in-game the player
flows between them continuously through section streaming. Aeon's per-section
palette/BG/parallax/music fields are what make this possible; see §4 "World assembly."

## Why this is tractable (the three load-bearing facts)

1. **Aeon's collision vocabulary IS S3K's.** The engine imported the S&K 252-shape
   set from `skdisasm/Levels/Misc/Height Maps.bin` + `angles.bin`
   (`aeon/tools/import_sk_collision.py`). S3K collision indices therefore map ~1:1;
   S1/S2 heightmaps map by best-match into the same set.
2. **Per-placement solidity is semantically identical across all four targets.**
   Verified in SonLVL API (`DataTypes.cs`): classic chunk-block entries carry a 2-bit
   `Solidity` (0 none / 1 top / 2 sides+bottom / 3 all) — S1 one path (bits 13–14),
   S2/S3K two paths (bits 12–13 = A, 14–15 = B). Aurora's collision cell word carries
   the same 2-bit solidity + flips + shape. Nothing is lossy here.
3. **Geometry nests cleanly.** An Aeon section is 2048×2048 px = exactly **16×16 S2/S3K
   chunks** (128px) or **8×8 S1 chunks** (256px). Donor levels slice into whole
   sections; Aeon levels tile back out into whole chunks.

## Non-goals (v1)

ROM-file import (disassembly projects only — we have all three in the workspace;
SonLVL INIs describe them); donor *gameplay* (object code never converts — see object
mapping); Sonic CD / Chaotix (SonLVL supports them; add adapters later if wanted);
byte-perfect *recompression* (Kosinski/Nemesis encodings aren't unique — equivalence
is "decompresses to identical bytes").

## 1. Ground truth & references

- **SonLVL API** (`programs/SonLVL/SonLVLAPI/`) — the definitive parsers for every
  format below (`DataTypes.cs`, `LevelData.cs`). Its `LevelConverter/` project is an
  existing cross-game converter to study. **Implementers: verify every byte/bit
  layout here before coding; do not trust prose tables (including this one) over it.**
- **SonLVL INI files** — machine-readable per-project manifests listing every data
  file per zone/act (paths, compression, palette composition). `s2disasm/SonLVL INI
  Files/` ships them; `programs/SonLVL/INI Files/` has definitions for the other
  games. **The adapters consume these INIs as the project manifest** — never
  hardcode disasm paths.
- The three disassemblies: `s1disasm/`, `s2disasm/`, `skdisasm/` (workspace-local).

### Per-game format summary (researched 2026-07-03; ✔ = directly verified in SonLVL source)

| Aspect | S1 | S2 | S3K |
|---|---|---|---|
| Chunk size | 256×256 | 128×128 | 128×128 |
| Layout | uncompressed, W/H byte header, byte per chunk, FG/BG separate files | Kosinski, byte per chunk, FG/BG interleaved rows | uncompressed, 8-byte dims header, FG then BG |
| Chunk data | Kosinski (`map256/`) | Kosinski (`mappings/128x128/`) | Kosinski (`Levels/*/Chunks/`) |
| Chunk-block entry ✔ | block 0–9, XF $800, YF $1000, solidity 13–14 (1 path) | block 0–9, XF $400, YF $800, solidA 12–13, solidB 14–15 | same as S2 |
| Blocks (16×16) | Enigma (`map16/`) | Kosinski (`mappings/16x16/`) | Kosinski, per-path primary/secondary files |
| Block entry | 4 nametable-style words (tile 0–10, XF $800, YF $1000, pal, pri) — verify in SonLVL `PatternIndex` | same | same |
| Collision shape refs | per-block byte index, 1 array/zone (`collide/<zone>.bin`) + global arrays Normal/Rotated + `Angle Map.bin` | per-block byte, primary+secondary index files (Kosinski, `collision/`) + `Collision array - Vertical/Horizontal.bin` + `Curve and resistance mapping.bin` | per-zone solid files (A/B interleaved) + shared `Levels/Misc/Height Maps.bin` + `angles.bin` — **the Aeon vocabulary** |
| Level art | Nemesis | Kosinski | Kosinski Moduled (KosM) |
| Objects | 6B: X.w, Y.w(+flip bits), id.b(+respawn bit 7), subtype.b; term $FFFF | 6B, same shape (respawn in Y word bit 15); term $FFFF | 6B; per-zone `Object Pos/`; term $FFFF |
| Rings | **objects** (obj $25; subtype = spacing-table nibble + count−1) | dedicated file (`level/rings/`) | dedicated file (`Ring Pos/`) |
| Start pos / bounds | `startpos/` + `LevelSizeArray.asm` | `startpos/`; bounds from code | `Start Location/` (Sonic+Knux); dims from layout header |

(Object/ring word-level details above are agent-researched — re-verify each against
SonLVL `ObjectEntry`/ring classes when writing the codec; the round-trip goldens in §6
are the enforcement.)

## 2. The neutral model (`core/level-interop/model.ts`)

Keep the *hierarchy* — do NOT flatten to Aurora's tile grid at import time (classic
targets need chunks/blocks back, and flatten-then-rebuild loses sharing):

```ts
LevelDoc {
  game: '
s1'|'s2'|'s3k'|'aeon',
  tiles: Uint8Array[],                    // 8x8 4bpp
  blocks: BlockDef[],                     // 4 tile refs (tile, xf, yf, pal, pri)
  chunks: ChunkDef16[],                   // NxN grid of ChunkCell
  //  ChunkCell { block, xf, yf, solidityA, solidityB }   (S1: B mirrors A)
  chunkSize: 128 | 256,
  fg: LayoutGrid, bg: LayoutGrid,         // chunk-id grids + dimensions
  collision: { shapes: HeightProfile[],   // per-column heights + angle, source-tagged
               blockIndexA: Uint8Array, blockIndexB: Uint8Array },  // per block-id
  palettes: PaletteLine[4] (+ extra lines list, source-tagged),
  objects: {x, y, xf, yf, respawn, id, subtype}[],
  rings: {x, y}[],
  start: {x, y}[], meta: {...bounds, music?, sourceRefs}
}
```

Aurora's existing map model is the *aeon-side* of the hub: `LevelDoc(aeon)` ⇄ the
current Zone/Act/Section/chunk-library structures via a dedicated bridge, so the
interop layer never reaches into stores directly.

## 3. Adapters

`core/level-interop/games/{s1,s2,s3k}.ts`, each `read(iniZoneEntry) → LevelDoc` and
(later phases) `write(LevelDoc) → files`. Compression codecs needed beyond what Aurora
has (Kosinski + Nemesis decode exist):
- **KosM decode** (S3K art): trivial module wrapper over Kosinski — implement.
- **Enigma decode** (S1 blocks): small, well-documented — implement.
- **Encoders** (write-side, Phase D): Kosinski + Enigma + Nemesis in TS with
  "decompress(compress(x)) == x" property tests, plus size-sanity vs the reference
  tools (`programs/` has KosComp etc. to diff against). Keep encoders out of the
  engine path — this is donor-format work only; ZX0/S4LZ stay Crucible's.

## 4. Conversion semantics (the design core)

**Collision shapes.** Build once: `skShapeTable` = the 252 S&K shapes (already the
Aeon vocabulary). Mapping any donor shape: exact-match by 16-column height array +
angle → else best-match (minimize sum |Δheight| per column, angle within tolerance,
respecting the flip search space — a shape + flip often matches exactly) → else
report as "no good match" with a rendered side-by-side in the import report.
S3K→Aeon is identity by construction. Per-cell result: Aurora cell word =
mapped shape | chunk-entry flips | chunk-entry solidity (path A and B). This lands
directly in `Section.collisionEdit`/`collisionEditB` → the existing `.collattr.bin`
route into the ROM. Nothing new engine-side.

**Geometry.** Donor→Aeon: pad FG to whole sections (16×16 or 8×8 chunks), each
section's cells resolve chunk→block→tile into Aurora's flat grid; donor chunks ALSO
import as chunk-library stamps (keeps authoring vocabulary). BG: donor BG layout →
Aurora BG library entry (64×32 window minimum; bigger donor BGs become per-section
overrides or get cropped with a report — decide per-zone at import via wizard option).

**World assembly — multiple levels in ONE act (first-class requirement).** Import
destination is a choice: *new act* OR **into the current act at a section offset
(sx, sy)** — so you can load EHZ whole, then load AIZ next to it, and in-game the
player flows from one into the other through normal section streaming. The engine is
built for exactly this; the mechanism is aeon's per-section fields, which the import
sets on every section of the placed rectangle:
- `sec_pal` — each imported region keeps its own 4-line palette (no global clash);
- `sec_bg_layout` (per-section BG override) — each region keeps its own background;
- `sec_parallax_config` — per-region scroll behavior;
- `sec_music` — set on the region's *entry-edge* sections only (0 = keep current
  elsewhere), so the soundtrack switches once as you cross between levels.
Placement rules: the act grid auto-grows to fit (grid resize exists); overlapping an
occupied section is an error (choose a different offset), no silent merge. An
optional whole-import **chunk-granular nudge** (shift the imported layout by N chunks
vertically/horizontally before slicing) helps line up ground height with the
neighbor; finer seam work is ordinary map editing on the boundary sections — the
report lists each seam edge with a terrain-height diff so you know where to smooth.
Only the act's own `startPosition` survives; imported start positions become editor
markers. Budget note: all imported regions share the ONE act-wide art pool — the
report shows combined page count vs capacity; aeon design #1 (art-streaming Phase 2,
residency cache / streams-past-VRAM) is the engine-side headroom for big multi-level
acts, so a capacity warning today may become a non-issue once that plan executes.
Aeon→donor: dedup Aurora's flat tiles into blocks (flip-aware, existing machinery),
blocks into chunks, chunks into layout; **capacity gates** with hard errors in the
report: blocks ≤1024 (10-bit), chunks ≤256 (byte layout), plus per-game RAM caps
(verify: S3K block table 768, S1/S2 chunk RAM limits) — exceeding = actionable error
("merge N near-duplicate blocks"), never silent truncation.

**Cross-classic (S1↔S2↔S3K).** Falls out of the hub: 256px chunks split into four
128px chunks (S1→S2/S3K); 128px chunks pack 2×2 into 256px (→S1, dedup after
packing). Solidity: S1's single path fans out to A=B; A/B collapse to A when
targeting S1 (report if B differed). Collision indices re-point at the target game's
arrays — for stock-array compatibility map shapes into the target's existing arrays
(best-match), or emit replacement collision-array bins (option in the export dialog;
replacement is lossless, stock-compat is portable).

**Objects.** Code never converts, so placements map by table:
`core/level-interop/object-maps/{s1,s2,s3k}-to-aeon.json` (and inverses later) —
entries `{srcId, srcSubtype?, dst: {typeId, subtype} | null}`. Unmapped placements
import as **marker entities** (editor-only object type `imported:<game>:<id>`,
rendered as a labeled badge) that persist in `objects.json` but fail aeon export
validation with a friendly count — so nothing silently disappears and mapping can be
done incrementally in the entity inspector (dropdown: "map all 14 Buzzers to…").
Seed the table with the obvious pairs (rings handled natively, springs, monitors,
spikes as they gain aeon archetypes — aeon design #9's example badniks are the first
real targets). Rings: S2/S3K files → `rings.json` directly; S1 expands obj $25
groups via its spacing table into individual rings (report count).

**Palettes.** CRAM words copy verbatim. Line conventions differ — donor line 0 is
the character palette (aeon reserves line 0 for sprites too, so usually clean); the
import report flags FG tiles referencing line 0 and offers auto-remap to a chosen
line where colors fit.

**Start/camera.** Donor start → act `startPosition`. Donor bounds → informational
only (aeon derives bounds from the grid).

## 5. UI

- **Import wizard** (File → Import level…): pick disasm root → parse SonLVL INI →
  zone/act list with thumbnails (render from parsed data — cheap and a great smoke
  test) → **destination: new act OR into current act at section (sx, sy)** (grid
  preview showing occupied sections + the incoming footprint; chunk-nudge option) →
  options (BG handling, palette remap, music-on-entry) → import → **report panel**
  (unmapped objects, collision best-match distances, capacity/palette warnings, seam
  edges with terrain-height diffs; every warning names concrete items, links jump to
  them on the map).
- **Export dialog** (File → Convert/Export level…): target game, stock-vs-replacement
  collision arrays, output directory (writes a SonLVL-INI-compatible file set so the
  result opens in SonLVL/stock builds).
- **Chunk-borrow mode** (cheap, high-value early slice): import ONLY selected donor
  chunks (+their tiles/blocks/collision) into the current aeon act's chunk library —
  "grab those EHZ platforms" without whole-level import.
- MCP tools: `import_level {root, zone, act, options}`, `get_import_report`,
  `map_object {marker, typeId, subtype, all?}`, `export_level {target, options}`.

## 6. Acceptance

- **Round-trip goldens per game** (the format-correctness enforcement): read zone →
  write back with zero edits → for uncompressed data byte-identical; for compressed
  data decompressed-identical. Run over EHZ 1 (S2), AIZ 1 (S3K), GHZ 1 (S1) minimum.
- EHZ Act 1 imported → converted to an aeon act → builds (`./build.sh`) and is
  playable: correct visuals, correct collision feel through the loops (path A/B),
  rings collectable, unmapped badniks visible as markers in-editor and absent
  in-game — verified via Build & Run (P2 spec).
- **World-assembly gate (Phase B)**: two donor levels placed in one act; in-game,
  running across the seam streams seamlessly, palette/BG switch at the section
  boundary, music changes once on entry; the seam report matched what needed
  hand-smoothing.
- Same EHZ → exported back to S2 format → opens in SonLVL and builds in s2disasm.
- Collision mapper unit-tested against crafted shapes (exact, flipped-exact,
  best-match, no-match) + the full S2 array mapped with a distance histogram snapshot.
- Capacity gates produce errors, never truncation.

## 7. Phasing

- **A. Hub + S2 read + aeon convert** (EHZ end-to-end, objects as markers) — proves
  the whole spine on the friendliest format. Includes chunk-borrow mode AND both
  destinations (new act / into-act placement — the placement path is cheap: same
  import, different target rectangle + per-section field writes).
- **B. S3K + S1 readers** (KosM, Enigma, S1 ring expansion, layout variants).
  First two-game world: EHZ + AIZ in one act, run between them in-game.
- **C. Object mapping UX** + table seeding + report polish + seam-diff report.
- **D. Writers**: aeon→S2 first (encoders + capacity gates + SonLVL-openable
  output), then S1/S3K targets, then cross-classic passes through the same code.
  (Note: a stitched multi-level act usually can't round-trip OUT to a classic
  format — per-section palettes/BGs don't exist there; the export dialog says so and
  offers exporting one region.)
- **E. Seam & assembly polish**: copy sections between acts of different origins,
  resize-with-content, terrain-alignment helpers — scope when reached.

Each phase = its own implementation plan; A is unblocked today and needs nothing
from the engine.
