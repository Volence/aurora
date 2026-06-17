# Spec — Multi-game sprite round-trip (+ reusable compression foundation)

Status: **design, awaiting approval** · 2026-06-17
Context: the editor is built around `s4_engine` but is meant to be **usable for other Sonic
games too** (see memory `multi-game-editor-goal`). This spec makes the sprite pipeline
multi-game (Sonic 1 / 2 / 3&K / S4), full round-trip (open AND save back), with a shared
compression layer designed to also serve multi-game *level* art later.

## 1. Goal & non-goals

**Goal:** Open sprite art from S1/S2/S3K/S4 into the existing sprite editor, edit it, and
save it back out in any of those formats — via a clean **format-adapter** architecture over
the shared logical sprite model, on top of a **reusable compression module** (Nemesis +
Kosinski, encode + decode, pure TypeScript).

**In scope:**
- Compression module: Nemesis (decode + encode), Kosinski (existing decode + new encode),
  pure TS, no native deps, fully unit-tested. Sprite-agnostic (level art reuses it).
- A `SpriteFormatAdapter` interface + adapters for **s1, s2, s3k, s4** (read + write of
  mappings and DPLC). The existing S4 import/export is refactored into the s4 adapter.
- Import flow (explicit game-format selection) and export flow (target-format selection),
  with cross-format conversion falling out of the shared hub.
- Minimal UI: a format dropdown on open and on export.

**Out of scope (separate later specs / deferred):**
- Multi-game **level art / chunk / block / layout** formats — its own large effort; the
  compression module + adapter pattern here are designed so that work plugs in later.
- S3K **2-player mirrored-art** duplication nuance — may be simplified in v1 (flagged).
- Loading sprites directly from raw ROM by pointer/offset — this spec works on the
  game-native **binary** mapping/DPLC/art files (extracted or built from a disassembly),
  the same shape the S4 path already uses.
- Animation-script interop across games (each game's anim format differs) — v1 imports
  frames; cross-game animation translation is a follow-up.

## 2. Architecture — three layers

```
┌ Compression module  (src/core/compress/)  — pure TS, sprite-agnostic ─────────┐
│  nemesis.ts   { decompress, compress }                                        │
│  kosinski.ts  { decompress (exists), compress (new) }                         │
│  index.ts     compressionFor('nemesis'|'kosinski'|'uncompressed')             │
└───────────────────────────────────────────────────────────────────────────────┘
            ▲ used by
┌ Logical hub  (src/core/model + existing import/render) ───────────────────────┐
│  SpriteFrame / SpritePiece  (existing)                                         │
│  SpriteAsset { frames, tiles, dplc?, sourceFormat }  (small new wrapper)       │
│  reconstruct / renderFrameToIndices  (existing — reused for all games)         │
└───────────────────────────────────────────────────────────────────────────────┘
            ▲ read/write through
┌ Format adapters  (src/core/formats/games/{s1,s2,s3k,s4}.ts) ──────────────────┐
│  each implements SpriteFormatAdapter over the hub                             │
└───────────────────────────────────────────────────────────────────────────────┘
```

The S4 import/export we already built (`sprite-mappings-export.ts`,
`sprite-mappings-import.ts`, `sprite-import.ts` DPLC bits) is **refactored into the `s4`
adapter** — this generalizes existing code rather than duplicating it.

## 3. Compression module

`src/core/compress/`:
- `nemesis.ts` — `decompress(Uint8Array): Uint8Array` and `compress(Uint8Array): Uint8Array`,
  ported from `programs/clownnemesis/{decompress,compress}.c`. Nemesis is a per-row
  Huffman-style nibble code with an XOR/inline mode bit; the C reference is the authority.
- `kosinski.ts` — keep the existing `kosinskiDecompress`; add `kosinskiCompress` ported from
  `programs/clownlzss` / `accurate-kosinski`.
- `index.ts` — `compressionFor(kind)` returns `{ decompress, compress }`; `'uncompressed'`
  is identity. Adapters reference art compression by `kind`, never by concrete impl.

**Validation strategy (no guessing):** decode is checked against **real workspace data**
(decompress an actual `s2disasm/art/nemesis/*` blob; assert size/known bytes). Encode is
checked by `decompress(compress(x)) === x` over many inputs INCLUDING real decompressed art,
and by structurally diffing our `compress` output against `clownnemesis` for representative
inputs. Same for Kosinski.

## 4. Adapter interface & per-game formats

```ts
interface SpriteFormatAdapter {
  id: 's1' | 's2' | 's3k' | 's4';
  artCompression: 'nemesis' | 'kosinski' | 'uncompressed';
  readMappings(bytes: Uint8Array): SpriteFrame[];
  writeMappings(frames: SpriteFrame[]): Uint8Array;
  readDPLC?(bytes: Uint8Array): number[][];      // per-frame source-tile lists
  writeDPLC?(perFrameTiles: number[][]): Uint8Array;
}
```

Shared traits: all mapping formats are a **word offset table** (frameCount recovered from
`firstOffset/2`) + per-frame `pieceCount` + pieces. Per-game differences each adapter owns
(byte layouts verified during implementation against the disassembly macros +
`sprite-mappings.ts` + round-trip tests — exactly how S4 was nailed):

| Game | piece count | piece bytes | X offset | DPLC | art |
|---|---|---|---|---|---|
| **S1** | byte | 5 | byte | S1 DPLC | Nemesis |
| **S2** | word | 6 | word | S2 DPLC | Nemesis |
| **S3K** | word | 6 (S2-like) | word | S3K DPLC (+2P) | Nemesis |
| **S4** | word | 8 (VDP-order, bbox header) | word | S4 DPLC | uncompressed |

The existing `src/core/formats/sprite-mappings.ts` (S2, 6-byte pieces) is the starting point
for the s2 adapter's read side. **S3K 2P-mirror** art is the one wrinkle flagged for possible
v1 simplification (load primary art; note the 2P duplicate).

## 5. Import flow

1. User chooses the **game format** (explicit dropdown — byte auto-detection across S1/S2/S3K
   is unreliable) and the files: mappings, art (+ optional DPLC, palette).
2. `compressionFor(adapter.artCompression).decompress(artBytes)` → tile bytes → `parseTiles`.
3. `adapter.readMappings(mappingBytes)` → `SpriteFrame[]`; `adapter.readDPLC?` if present.
4. Reconstruct editable frames via the **existing** reconstruct pipeline
   (`renderFrameToIndices`, DPLC resolution) — unchanged, format-independent.
5. Load into the sprite editor (existing `loadSprite`), tagging `sourceFormat`.

## 6. Export flow (round-trip)

1. Edit in the editor → logical frames + tile pool (existing).
2. User chooses **target** format (defaults to `sourceFormat`).
3. `adapter.writeMappings(frames)` (+ `writeDPLC` when the target streams art); the editor's
   decomposition produces the tile pool.
4. `compressionFor(adapter.artCompression).compress(artBytes)` → write art file.
5. Cross-format conversion is free: e.g. open as S2 → export as S4, or S4 → S1.

## 7. Integration with the existing editor

- Refactor the current S4 sprite import/export into the `s4` adapter behind the interface;
  `openSpriteFolder`/`loadEngineCharacter`/export call adapters via a registry
  `adapters[formatId]`.
- UI: a **format dropdown** on the open/import controls and on the export controls
  (defaults: import = user pick; export = `sourceFormat`). No other UI changes.
- `data/sprites/<name>/sprite.json` manifest gains `sourceFormat` so reopen/round-trip keeps
  the original game format as the export default.

## 8. Implementation phasing (for the plan)

1. **Compression module** — Nemesis decode+encode, Kosinski encode; tests vs real data. (no game coupling)
2. **Adapter interface + `s4` adapter** — refactor existing S4 code behind the interface (no behavior change; tests stay green).
3. **`s2` adapter** — read+write S2 mappings/DPLC (most-ready; parser scaffold exists). End-to-end test on a real `s2disasm` sprite.
4. **`s1` adapter**, then **`s3k` adapter** (+ the 2P-mirror decision).
5. **UI wiring** — format dropdowns + manifest `sourceFormat`.

Each phase is independently testable; phases 1–2 land with zero user-visible change (pure
refactor + new module), de-risking the rest.

## 9. Testing

- **Compression**: round-trip identity over synthetic + real decompressed art; decode
  validated against actual `s2disasm/art/nemesis/*`; encode structurally diffed vs `clownnemesis`.
- **Adapters**: per-game `readMappings∘writeMappings == identity` on real disassembly mapping
  data; field-level assertions on a worked example per game.
- **End-to-end**: import a real S2 sprite → export → re-import → identical frames; one
  cross-format case (S2 → S4) round-trips through the editor.

## 10. Open questions (resolve in planning)

- Exact S1 and S3K binary piece/DPLC layouts — confirm against `skdisasm` macros before
  writing those adapters (S2 is already documented in `sprite-mappings.ts`).
- Whether S3K 2P-mirror art is loaded, ignored, or auto-derived on export (lean: load
  primary, note duplicate; revisit if a real S3K sprite needs it).
- Where multi-game art files live in a project vs ad-hoc open (lean: ad-hoc folder/file
  open like `openSpriteFolder`, format chosen at open time).
