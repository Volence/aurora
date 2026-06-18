# Spec — Multi-game sprite UI (phase 6): singular open / convert / re-save + project import

Status: **design, awaiting approval** · 2026-06-17
Parent: `docs/specs/2026-06-17-multi-game-sprite-roundtrip-design.md` (§8 phase 6).
Depends on: the per-game adapters + compression module, all DONE and verified
(`src/core/formats/games/`, `src/core/compress/`).

## 1. Goal

Make the multi-game round-trip usable from the editor. The headline workflow is
**singular cross-game porting**: with our Sonic 4 project open, open ONE sprite in a
chosen source game format (e.g. the Pitcher Plant badnik as Sonic 2), edit/convert it,
and **re-save it in any target format**. Opening a whole disassembly project and
auto-pairing its sprites is a convenience layer over the same machinery.

Non-goals (unchanged from parent): multi-game level/chunk art; S3K 2P mirrored-art
duplication; animation-script interop across games.

## 2. The porting loop (the core value)

```
 open  ─ pick SOURCE format ─►  decompress art ─►  adapter.readMappings/readDPLC
                                                   (or .asm parser)  ─►  logical frames
 edit  ─ existing sprite editor (format-independent) ──────────────────────────────►
 save  ─ pick TARGET format ─►  adapter.writeMappings/writeDPLC ─►  compress art ─► files
```

Source and target are independent, so "open as S2 → save as S4" (port into our engine)
and "open as S4 → save as S1" both fall out for free. Default target = `sourceFormat`.

## 3. Phasing

### 6a — Singular binary open/convert/save + format dropdowns (build first)

The complete porting loop for **binary** inputs (extracted `mappings.bin` + art +
optional `dplc.bin`), plus our existing engine sprites.

- **Adapter-driven reconstruct.** Generalize `reconstructSpriteFrames` /
  `reconstructDPLCSprite` (`src/core/import/sprite-import.ts`) so the mapping/DPLC
  parse and art decompression are injected, not hardcoded to the S4 parser +
  uncompressed art. New signature takes a `SpriteFormatAdapter` + decompresses art via
  `compressionFor(adapter.artCompression)`. The S4 path keeps identical behavior
  (s4 adapter + `uncompressed`), so existing callers/tests are unaffected.
- **Import UI.** A source-format dropdown (`s1 | s2 | s3k | s4`) on the open control;
  `openSpriteFolder` (rename intent: "open sprite") reads the files, runs the chosen
  adapter, decompresses art, and loads into the editor. Art file may be raw or
  compressed per the format.
- **Export UI.** A target-format dropdown (default = `sourceFormat`) on export. Export
  routes through `getAdapter(target).writeMappings/writeDPLC` and
  `compressionFor(target.artCompression).compress`. (Nemesis encode exists; Kosinski
  encode still throws — sprite art is Nemesis, so unaffected.)
- **Manifest.** `sprite.json` gains `sourceFormat: SpriteFormatId`. Load reads it to
  default the export target; re-open keeps the original game format as the default.
- **Tests (TDD):** adapter-driven reconstruct round-trips per format; an end-to-end
  "open as S2 → save as S4 → re-open" frame-identity test; manifest `sourceFormat`
  persisted and restored.

### 6b — `.asm` disassembly parser (core)

Lets the singular open accept a real disassembly mapping/DPLC `.asm` file directly
(point at `s2disasm/mappings/sprite/obj0B.asm`), not just extracted binaries.

- **Approach: parse macro call-sites, not assemble.** A frame is a list of
  `spritePiece xpos,ypos,w,h,tile,xflip,yflip,pal,pri` calls between a `spriteHeader`
  label and its `_End`; DPLC frames are `dplcEntry tiles,offset` calls. Those macro
  ARGUMENTS are our logical `SpritePiece` model directly, and the argument order is
  **identical across S1/S2/S3K** (only emitted bytes differ) — so the parser is
  version-agnostic and never touches byte layout.
- **Module:** `src/core/import/asm-mappings.ts` —
  `parseAsmMappings(text): SpriteFrame[]`, `parseAsmDPLC(text): number[][]`. Includes a
  tiny operand evaluator (`$hex`, decimal, leading `-`, simple `+`/`-`). Handles
  `spritePiece` and `spritePiece2P` (take the 1P args); skips comments / blank lines /
  `if`-`endif` guards by reading only recognized macro lines within a frame block.
- **Scope guard:** targets the modern s2disasm/skdisasm macro vocabulary. Unrecognized
  macro names → the file is reported unparseable (caller falls back to manual/binary),
  never silently mis-parsed.
- **Tests (TDD):** parse the real workspace `.asm` (`obj0B.asm`, `obj08` DPLC,
  skdisasm sprite/DPLC) and assert the logical frames equal those our binary adapters
  read from the assembled fixtures — i.e. `.asm` parse == binary read, cross-checked.

### 6c — Project-open UI (scan + manual fallback)

- **Discovery:** scan a chosen disassembly folder for sprite sets — pair art (`.nem`/
  `.bin`) with mappings `.asm` and DPLC `.asm` by the disasm's naming conventions
  (e.g. `Map_objXX` / `DPLC_objXX` / `ArtNem_*`). Conventions are imperfect, so:
- **Manual fallback:** present a list of detected sets; let the user manually pair art +
  mappings (+ DPLC) for anything unmatched. Selecting a set opens it through the 6b/6a
  pipeline with the project's game format.
- Lands after 6a/6b; details refined once those are in.

## 3.5 Target codebases & validation matrix

Saves must work against the real Sonic Retro disassemblies (S1/S2/S3K) and the Sonic
Clean Engine (S.C.E.). Format ↔ codebase mapping and the ground-truth status of each:

| Format id | Real codebase(s) | Mapping/DPLC layout | Real-data validation |
|---|---|---|---|
| `s2` | s2disasm (local) | Ver 2 (8-B pieces, 2P word) | ✅ assembled fixtures (read field-level + byte-exact write) |
| `s3k` | skdisasm (local) | Ver 3 (6-B pieces; reversed DPLC) | ✅ assembled fixtures + **real skdisasm DPLC** |
| `s3k` | **S.C.E.** (local) | Ver 3 — same as skdisasm | ✅ **real S.C.E. mapping** round-trips byte-exact |
| `s1` | s1disasm (local) | Ver 1 (5-B pieces, byte count) | ✅ **real s1disasm Ball Hog mapping + Sonic DynPLC** (read field-level + byte-exact write) |
| `s4` | s4_engine (our project) | native VDP-order | ✅ existing sprite-mode tests |

All four Sonic Retro sources are present locally (`s1disasm`, `s2disasm`, `skdisasm`)
plus S.C.E., and every format is now validated against real sprite data from them.

**S.C.E. = `s3k` format.** Its sprite mappings are the Ver-3 6-byte layout; its
`DPLCEntry` macro is a *static art-DMA* declaration (`dc.l dmaSource,mappings`), not
per-frame DPLC, so character DPLC (if used) is plain S3K. No separate adapter — S.C.E.
is selected as `s3k` (the UI may surface it under an "S.C.E." label that maps to s3k).

**Only real gap: Sonic 1.** No s1disasm in the workspace, so the S1 fixture is
synthesized from real S2 pieces assembled with the Ver-1 macros (authoritative for the
byte layout, but not real S1 sprite data). Closing it = download s1disasm (Sonic Retro)
and add a real S1 mapping/DPLC fixture, same asl+p2bin recipe. Tracked as a follow-up;
does not block 6a/6b.

## 4. Integration points / files

- `src/core/import/sprite-import.ts` — adapter-driven reconstruct (6a).
- `src/core/import/asm-mappings.ts` — new `.asm` parser (6b).
- `src/renderer/components/sprite/export-sprite.ts` — import/export flows gain a format
  arg; `exportSprite` routes through the target adapter; manifest `sourceFormat`.
- `src/core/export/sprite-export.ts` — `SpriteManifest` gains `sourceFormat`; export
  builder parameterized by target adapter (art compression + mapping/DPLC writer).
- Sprite-mode UI controls — two dropdowns (open: source; export: target).

## 5. Open questions

- Exact disassembly naming conventions to auto-pair in 6c (resolve when 6c starts; 6a/6b
  don't depend on it).
- Whether export should also emit `.asm` (macro-call text) for disassembly targets, or
  only binary. Lean: binary first; `.asm` emit is a small follow-on using the same
  logical model in reverse.
