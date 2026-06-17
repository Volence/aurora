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
  ported from `programs/clownnemesis/{decompress,compress}.c` (format verified — see below).
- `kosinski.ts` — keep the existing `kosinskiDecompress`; add `kosinskiCompress` ported from
  `programs/clownlzss` / `accurate-kosinski`.
- `index.ts` — `compressionFor(kind)` returns `{ decompress, compress }`; `'uncompressed'`
  is identity. Adapters reference art compression by `kind`, never by concrete impl.

**Nemesis format (verified vs `clownnemesis`):** 2-byte big-endian header = `bit15` XOR-mode
flag, `bits14-0` tile count. Code table: bytes with `0x80` set are `0x80|nibble` value
markers; other bytes are `(runLen-1)<<4 | codeBits` followed by a code byte stored at index
`code << (8-codeBits)`; `0xFF` ends the table. Bitstream is **MSB-first**; a 6-bit `0x3F` is
the inline escape → next `3` bits = runLen-1, next `4` bits = nibble. Nibbles accumulate into
32-bit rows; in XOR mode each row is XORed against the previous output row. Encoder builds
codes for runs occurring ≥3 times; **port the Fano ("accurate") path** to match Sega's output
byte-for-byte (stable sort required), with the `0x3F`-prefix-avoidance and accurate-mode
trailing-byte quirk. Nibbles are high-then-low per byte. Input must be a multiple of 0x20 bytes.

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
`firstOffset/2`) + per-frame piece-count + pieces. The Sonic-disassembly formats are
parameterized by a **version** (`SonicMappingsVer`/`SonicDplcVer`); each game targets a
specific version. Verified against `s2disasm/mappings/MapMacros.asm` (and cross-checked with
our `sprite-mappings.ts`):

Verified against the OrionNavattan/Hivebrain MapMacros gist + `s2disasm` macros (verbatim
`dc.w`/`dc.b` definitions):

| Format | piece-count hdr | piece | piece fields | DPLC count hdr | DPLC entry (2 B) | art |
|---|---|---|---|---|---|---|
| **S1** (fmt 1) | **byte** | **5 B** | `ypos+dims.w, tile.w, xpos.b` | byte | `(count-1)<<12 \| offset` | Nemesis |
| **S2** (fmt 2) | word | **8 B** | `ypos+dims.w, tile.w, 2P-tile.w, xpos.w` | word | `(count-1)<<12 \| offset` | Nemesis |
| **S3K** (fmt 3) | word | **6 B** | `ypos+dims.w, tile.w, xpos.w` (S2 minus 2P word) | word | `offset<<4 \| (count-1)` ⚠ **reversed** | Nemesis |
| **S4** (ours) | word + 6-B bbox hdr | 8 B | VDP-order (existing) | word | existing | uncompressed |

Common to S1/S2/S3K: `ypos+dims.w` = `(ypos<<8) \| (w-1)<<2 \| (h-1)`; **tile word** =
`pri<<15 \| pal<<13 \| yflip<<12 \| xflip<<11 \| tile` (identical across all three).
- **S2 2P-tile word** = `(tile>>1)+attrs` — a 2-player-mode duplicate; the s2 adapter
  **ignores it on read** and **emits it on write** (derive from the 1P tile).
- **S3K DPLC quirk** — entry packing is **reversed** vs S1/S2: `count=(entry&0xF)+1`,
  `offset=entry>>4`. This is the one S3K detail to confirm against real `skdisasm` DPLC data
  in the adapter's tests (low residual risk — well-documented, just bit-order-sensitive).
- Our existing `sprite-mappings.ts` documents an **older 6-byte S2 (fmt 0/1-style)** piece —
  NOT the fmt-2 (8-byte) layout; the s2 adapter targets **fmt 2**.
- **S3K 2P art** is stored as entirely separate mapping/DPLC tables (not a mirror flag) — v1
  loads the primary tables and ignores/notes the 2P duplicate.

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
4. **`s1` adapter** — read+write S1 (fmt 1: 5-byte pieces, byte counts). Layout verified.
5. **`s3k` adapter** — read+write S3K (fmt 3: 6-byte pieces; **reversed DPLC nibble order**).
   Layout verified from the MapMacros gist; tests confirm the DPLC bit order against real
   `skdisasm` data. 2P duplicate tables noted, not loaded in v1.
6. **UI wiring** — format dropdowns + manifest `sourceFormat`.

All five phases are grounded in verified formats. The only residual detail (S3K DPLC bit
order) is pinned by a round-trip test against real S3K data, so nothing blocks the others.

Each phase is independently testable; phases 1–2 land with zero user-visible change (pure
refactor + new module), de-risking the rest.

## 9. Testing

- **Compression**: round-trip identity over synthetic + real decompressed art; decode
  validated against actual `s2disasm/art/nemesis/*`; encode structurally diffed vs `clownnemesis`.
- **Adapters**: per-game `readMappings∘writeMappings == identity` on real disassembly mapping
  data; field-level assertions on a worked example per game.
- **End-to-end**: import a real S2 sprite → export → re-import → identical frames; one
  cross-format case (S2 → S4) round-trips through the editor.

## 10. Open questions / resolved

**Resolved by source research (2026-06-17):**
- Nemesis format + encoder algorithm — fully spec'd from `clownnemesis` (§3).
- S1 (Ver 1, 5-byte) and S2 (Ver 2, 8-byte incl. 2P-dup word) mapping + DPLC layouts —
  verified vs `s2disasm/mappings/MapMacros.asm` (§4). The s2 adapter targets **Ver 2**, not
  the 6-byte layout in our current `sprite-mappings.ts`.
- S3K 2P art = separate tables (not a mirror flag); v1 loads primary, notes the duplicate.

**Resolved by web research (OrionNavattan/Hivebrain MapMacros gist):** S3K mapping (fmt 3,
6-byte pieces) AND DPLC (reversed nibble: `offset<<4 | (count-1)`) are now documented in §4 —
no binary RE needed. Only the S3K DPLC bit-order is confirmed by a round-trip test vs real
`skdisasm` data during implementation.

**Still open (resolve in planning):**
- Kosinski **encoder** parity — verify our port matches `clownlzss`/`accurate-kosinski`
  output (decode∘encode identity + structural diff) before relying on it for art saving.
- Where multi-game art files live in a project vs ad-hoc open (lean: ad-hoc folder/file
  open like `openSpriteFolder`, format chosen at open time).
