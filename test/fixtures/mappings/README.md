# Real sprite mapping / DPLC fixtures (ground truth)

These `.bin` files are **independently assembled** from the real Sonic 2 disassembly
mapping macros — they are NOT produced by this editor's code. They exist so adapter
read/write tests have an external ground truth (a matching read/write off-by-one would
pass a round-trip test but fail against these).

## Source

- `src/MapMacros.asm` — verbatim from `s2disasm/mappings/MapMacros.asm`. This is the
  authoritative definition of every per-version byte layout (`spriteHeader`,
  `spritePiece`, `dplcHeader`, `dplcEntry`).
- `src/obj0B.asm` — a real S2 sprite mapping table (`s2disasm/mappings/sprite/obj0B.asm`),
  5 frames, used to generate the `*_obj0B_map.bin` fixtures.
- `src/obj08_dplc.asm` — a real S2 DPLC table (`s2disasm/mappings/spriteDPLC/obj08.asm`),
  22 frames incl. empty + multi-entry frames, for the `*_obj08_dplc.bin` fixtures.

The same source is assembled at each `SonicMappingsVer` / `SonicDplcVer` to produce the
per-game byte layout. (S1 has no disassembly in this workspace; assembling the real S2
piece set as Ver 1 still produces authoritative Ver-1 macro output for the format.)

| Fixture | Ver | Layout under test |
|---|---|---|
| `s1_obj0B_map.bin` | mappings Ver 1 | 5-byte pieces, **byte** count |
| `s2_obj0B_map.bin` | mappings Ver 2 | 8-byte pieces (2P-tile word), **word** count |
| `s3k_obj0B_map.bin` | mappings Ver 3 | 6-byte pieces (no 2P word), **word** count |
| `s1_obj08_dplc.bin` | dplc Ver 1 | **byte** count, entry `(tiles-1)<<12 \| offset` |
| `s2_obj08_dplc.bin` | dplc Ver 2 | **word** count, entry `(tiles-1)<<12 \| offset` |
| `s3k_obj08_dplc.bin` | dplc Ver 3 | **word count-1** (empty = `0xffff`), entry **reversed** `(offset<<4) \| (tiles-1)` |

## Verified facts (from the macros + assembled output)

- Mapping piece-count header is the **plain** count (`bytes/pieceSize`) in ALL versions —
  no `-1`. (Corrects an earlier secondhand note that feared S2/S3K stored count-1.)
- S2 piece `word2` (2P-tile) = same attrs + `((tile>>1) | (tile & $8000))`. Ignored on
  read; emitted on write.
- S3K DPLC has **two** quirks vs S1/S2: header stores `count-1` (so an empty frame is
  `0xffff`), and each entry packs `(offset<<4) | (tiles-1)` (nibble order reversed).

## Regenerating

```sh
AS=s2disasm/build_tools/Linux-x86_64/asl
P2BIN=s2disasm/build_tools/Linux-x86_64/p2bin
# wrapper .asm sets `SonicMappingsVer`/`SonicDplcVer`, defines an `even` macro,
# includes MapMacros.asm then the source table, org 0. Assemble then p2bin:
AS_MSGPATH=$(dirname $AS) $AS -xx -A wrapper.asm && $P2BIN wrapper.p out.bin
```
