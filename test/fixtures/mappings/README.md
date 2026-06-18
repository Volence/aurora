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

The shared obj0B/obj08 source is assembled at each `SonicMappingsVer` / `SonicDplcVer`
for cross-format consistency tests (all three decode to identical logical frames). The
per-game adapter tests additionally use REAL sprite data from each disassembly.

| Fixture | Ver | Real source | Layout under test |
|---|---|---|---|
| `s2_obj0B_map.bin` | map Ver 2 | s2disasm obj0B | 8-byte pieces (2P-tile word), **word** count |
| `s3k_obj0B_map.bin` | map Ver 3 | (obj0B as Ver 3) | 6-byte pieces (no 2P word), **word** count |
| `s1_obj0B_map.bin` | map Ver 1 | (obj0B as Ver 1) | 5-byte pieces, **byte** count |
| `s2_obj08_dplc.bin` | dplc Ver 2 | s2disasm obj08 | **word** count, entry `(tiles-1)<<12 \| offset` |
| `s3k_obj08_dplc.bin` | dplc Ver 3 | (obj08 as Ver 3) | **word count-1** (empty=`0xffff`), entry reversed `(offset<<4)\|(tiles-1)` |
| `s1_obj08_dplc.bin` | dplc Ver 1 | (obj08 as Ver 1) | **byte** count, entry `(tiles-1)<<12 \| offset` |
| **`s1_ballhog_map.bin`** | map Ver 1 | **s1disasm Ball Hog** | real Sonic 1 mapping |
| **`s1_sonicdplc.bin`** | dplc Ver 1 | **s1disasm Sonic DynPLC** | real Sonic 1 DPLC (88 frames) |
| **`s3k_real_dplc_minibosssplash.bin`** | dplc Ver 3 | **skdisasm Miniboss Splash** | real S3K reversed packing |
| **`sce_instashield_map.bin`** | map Ver 3 | **S.C.E. Insta-Shield** | real Sonic Clean Engine mapping (== S3K) |

Disassembly sources (Sonic Retro): `s1disasm`, `s2disasm`, `skdisasm`; engine: S.C.E.
S.C.E. uses the S3K (Ver 3) sprite layout, so the `s3k` adapter covers it.

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
