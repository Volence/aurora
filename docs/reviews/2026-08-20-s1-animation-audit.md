# S1 animation audit — measurement report (2026-08-20)

> **Parcel 1 delivered 2026-08-20** (branch `feat/s1-anim-loader`): `parseS1DisasmAnimScript`
> (dialect of §1.2, nothing silently dropped — a named `problems[]` instead), the per-frame
> flip channel (`AnimFrame {index,xFlip,yFlip}` through `AnimStepUI` to the timeline blit),
> the transcribed `S1_OBJECT_ANIMS` table (54 ids; named exclusions: Sonic $01 per §1.4,
> Caterkiller $78 — `Ani_Cat` is inline in `_incObj/78`, not an `_anim` file), and auto-load
> via `editObjectArtCheckout` into the shipped timeline. Sweep-tested against all 48
> non-Sonic `_anim` files with offset-table-derived expectations (48/48, zero problems);
> CDP harness `scratchpad/s1-anim-harness.mjs` 4/4 (Crabmeat plays with flips; Bridge is
> empty-but-honest). §1.4's Sonic rotation TAG and the §5 UNVERIFIED items stand.

**Question:** Aurora opens `s1disasm` as a project but does not recognize animations. What exists on both sides, and what is the smallest parcel that ships S1 animation support?

**Method:** read-only transcription from `/home/volence/sonic_hacks/s1disasm` (format + interpreter), grep/read inventory of Aurora `src/core` + `src/renderer`, and one empirical probe: Aurora's existing animation parsers run under vitest against five real `_anim/*.asm` files (probe deleted after the run, output transcribed in §2.3).

---

## 1. Side A — what s1disasm has

### 1.1 Inventory

- **49 animation script files** in `_anim/` (one top-level `Ani_*` table per file; verified `grep -c '^Ani_\w*:'` = 49 across 49 files).
- Every file is included exactly **once**: 8 from `sonic.asm` (lines 4107, 4120, 4205, 4206, 4250, 4252, 4254, 4291) and 41 from inside the owning object's `_incObj/*.asm` (e.g. `_incObj/1F Badnik - Crabmeat.asm:247`, `_incObj/26, 2E Monitors and Power-Ups.asm:504`, `_incObj/01 Sonic.asm:2384`). No duplicates (checked with `sort | uniq -d`).
- **Binding is code, not data:** an object points at its script with `lea (Ani_X).l,a1` then calls the interpreter — 90 such `lea (Ani_*)` sites across `_incObj/`. Examples: `_incObj/22, 23 Badnik - Buzz Bomber and Missile.asm:36`, `_incObj/26, 2E Monitors and Power-Ups.asm:167`, `_incObj/1F Badnik - Crabmeat.asm:57,221`. There is **no object-id → script table anywhere in the disasm**; Aurora cannot discover the linkage mechanically without reading 68k code.

### 1.2 Script format (general objects)

Transcribed from `_anim/Ball Hog.asm`, `_anim/Buzz Bomber.asm`, `_anim/Monitor.asm`, `_anim/Crabmeat.asm` (all lines cited below are those files) and the interpreter `_incObj/sub AnimateSprite.asm`.

```
Ani_Hog:    dc.w .hog-Ani_Hog          ; word offset table, offsets relative to table base
                                        ; (one dc.w per animation; anim id = table index)
.hog:       dc.b 9                      ; first byte: frame duration (hold time)
            dc.b 0, 0, 2, 2, 3, 2      ; mapping-frame indices (may carry flip flags)
            dc.b afEnd                  ; control byte terminates
            even
```

- **Offset table**: `dc.w .script-Ani_Table` per animation. Local labels are **dot-prefixed** (`.hog`, `.fly1`, `.breaking`), the subtraction has **no spaces** (`.hog-Ani_Hog`), and the table label usually shares its line with the first `dc.w` (`Ani_Hog:	dc.w .hog-Ani_Hog`, Ball Hog.asm:5). Interpreter indexes it as `add.w d0,d0 / adda.w (a1,d0.w),a1` (sub AnimateSprite.asm, `Anim_LoadNextFrame`) — anim id doubles into a word index.
- **Duration byte** (first byte of each script): reloaded into `obTimeFrame` on every frame advance; the counter is decremented each tick and the frame advances when it goes negative (`subq.b #1,obTimeFrame / bpl.s Anim_Wait`). So a duration byte of N holds each frame ~N+1 ticks. (Tick = one call, normally one 60fps frame. Exact off-by-one on the first frame after an anim change: UNVERIFIED live — TAG for a foreground emulator check if timeline fidelity to the frame matters.)
- **Frame bytes**: values `< $80` (bmi-tested). Layout per `_Constants.asm:312-313` and `Anim_SetFrameAndFlipFlags`:
  - bits 0–4 (`andi.b #$1F`): mapping-frame index (general objects are limited to **32 frames**);
  - bit 5 = `aniXFlip` ($20), bit 6 = `aniYFlip` ($40) — rotated into `obRender` and **XOR'd** with the object's current flip status. Real use: `dc.b 2|aniXFlip` (Crabmeat.asm, `.standsloperev`/`.walk`).
- **Control bytes** (`_Constants.asm:305-310`, dispatch chain `Anim_End_FF` … `Anim_End_FA` in sub AnimateSprite.asm):

  | Name | Value | Args | Effect |
  |---|---|---|---|
  | `afEnd` | $FF | — | restart script from frame 0 (loop) |
  | `afBack` | $FE | 1 (count) | step back N entries in the script, continue |
  | `afChange` | $FD | 1 (anim id) | set `obAnim` to the given id |
  | `afRoutine` | $FC | — | `obRoutine += 2` (advance object routine) |
  | `afReset` | $FB | — | restart script and clear `ob2ndRout` |
  | `af2ndRoutine` | $FA | — | `ob2ndRout += 2` |

  Byte values **$80–$F9 in frame position are a silent no-op** (they fall through every check to the `Anim_End` rts, leaving `obFrame` unchanged) — read from source, not observed live (UNVERIFIED live). Scripts end with `even` (not `align`).
- Scripts in the wild use afEnd overwhelmingly; `afBack` appears with an argument (`Monitor.asm` `.breaking`: `dc.b $B / dc.b afBack, 1`). Control names are always written **symbolically**, never as `$FF` literals — except the Sonic file's special duration bytes (§1.4).

### 1.3 The render chain (anim frame → pixels)

- Object fields (`_Constants.asm:231-235`): `obFrame` $1A (current mapping frame), `obAniFrame` $1B (index within script), `obAnim` $1C (selected animation), `obPrevAni` $1D, `obTimeFrame` $1E.
- Interpreter writes `obFrame`; the sprite renderer `_inc/BuildSprites.asm:98-106` reads `obMap` (mappings base), doubles `obFrame`, indexes the mappings' own word-offset table, and draws that frame's pieces.
- So: **anim script frame byte = index into the object's `_maps/*.asm` frame table** — the same index Aurora's ASM mappings parser already produces frame lists for. `_maps/` has 132 files, built from `mappingsTable` / `mappingsTableEntry` / `spriteHeader` / `spritePiece` macros (`_maps/Buzz Bomber.asm:4-20`; `_maps/_MapMacros.asm` exists).

### 1.4 Sonic's animations — a distinct dialect

`_anim/Sonic.asm` differs from all 48 other files:

1. **Frame-name equates**: `fr_Null: equ 0` … `fr_Slide: equ $57` (lines 5–93). Scripts reference frames symbolically (`dc.b fr_Walk13, fr_Walk14, …`). Sonic has up to $57 mapping frames — the $1F mask does **not** apply (his handler writes the byte unmasked).
2. **The table is built by a macro**: `sonani` (defined in the file, ~line 99) emits both the `dc.w anim-Ani_Sonic` entry **and** an `id_*` equ label per row (`id_Walk: sonani SonAni_Walk ; $00` …, 31 entries $00–$1E). A parser that only understands literal `dc.w` rows sees no table.
3. **Special animations use a NEGATIVE duration byte as a mode marker**, not a hold time: `SonAni_Walk: dc.b $FF`, `SonAni_Run: dc.b $FF`, `SonAni_Roll: dc.b $FE`, `SonAni_Roll2: dc.b $FE`, `SonAni_Push: dc.b $FD`. These are handled by Sonic's own interpreter `Sonic_Animate` (`_incObj/01 Sonic.asm:2176`, `.walkrunroll` branch): duration is computed from `obInertia` (speed), walk vs run selected at inertia ≥ $600, and for walk/run a **rotation offset is added to `obFrame` after the script lookup** (`add.b d3,obFrame(a0)` — d3 = angle-octant × 6 for walk, × 4 for run), which is how the six-frame `SonAni_Walk` script fans out over the `fr_Walk11..fr_Walk46` rotation sets. Every special script is padded to exactly 6 frames + `afEnd` (comment at `_anim/Sonic.asm` "Special animations" block).
4. Sonic's normal scripts use the same `afEnd`/`afBack`/`afChange` tail codes, but his handler implements **only $FF/$FE/$FD** (no $FC/$FB/$FA).

**Consequence:** Sonic's file cannot be fed to a general S1 script parser without (a) equate resolution, (b) `sonani` macro awareness, (c) a policy for negative-duration scripts. His walk/run rotation display is code, not data — a faithful preview of it is an interpreter feature, not a parse feature.

---

## 2. Side B — what Aurora reads today

### 2.1 Sprite reading — the ROADMAP §4.4 claim checks out

- **Four game adapters exist**: `s1`, `s2`, `s3k`, `s4` — registry at `src/core/formats/games/index.ts`, S1 at `src/core/formats/games/s1.ts` (Ver-1 binary mappings + Ver-1 DPLC + Nemesis art), shared codecs `sonic-mappings.ts` / `sonic-dplc.ts`.
- A **second, ASM-text mappings parser** exists and is the one classic actually uses: `src/core/import/asm-mappings.ts` reads `mappingsTable`/`spriteHeader`/`spritePiece` **call-sites** (version-agnostic; parses s1disasm `_maps/*.asm` directly). Consumers: classic object previews (`src/core/level-classic/object-sprite.ts`), level-art reservations, and the sprite workspace.
- `src/core/import/sprite-discovery.ts` already recognizes the s1disasm layout: any `_maps/*.asm` (except `_MapMacros.asm`) becomes a `game:'s1'` sprite set.

### 2.2 Animation reading — parsers exist, and both fail on s1disasm

`src/core/import/anim-import.ts` has **two** dialect parsers plus an auto-detect:

- `parseCharacterAnims` — the **S4/aeon** dialect (`AF_END`/`AF_BACK`/`AF_CHANGE`/`AF_ROUTINE`/`AF_DELETE` macro names, `DUR_DYNAMIC`). This is where §4.4's animation playback gets its data: the aeon character flow reads `data/animations/<name>_anims.asm` (`src/renderer/components/sprite/export-sprite.ts:633`), and editor-authored sprites round-trip their timeline through `sprite.json` manifests + `src/core/export/sprite-anim-export.ts` (writes the S4 dialect only).
- `parseSonicAnimScript` — a **classic** raw-byte dialect parser ($FF/$FE/$FD/$FC/$FB handling is already correct at the byte level).
- `parseAnyAnimScript` — classic first, S4 fallback; wired to a **manual file-pick** command `loadSpriteAnimations()` (`export-sprite.ts:381-397`) that feeds the sprite workspace's existing animation picker + playing timeline.

**Measured result (probe, vitest, real files):** on `Ball Hog.asm`, `Buzz Bomber.asm`, `Monitor.asm`, `Crabmeat.asm`, `Sonic.asm`, all three entry points return **zero animations for every file**:

```
{"file":"Ball Hog.asm","classic":[],"characterCount":0,"anyCount":0}
… (identical for all five)
```

Root causes, each verified against the regexes in `anim-import.ts`:

1. **Dot-local labels**: the offset-table matcher `^dc\.w\s+(\w+)\s*-\s*\w+` and the label matcher `^(\w+):\s*(.*)$` both use `\w`, which cannot match `.hog` / `.fly1`. Every general-object script in s1disasm uses dot-locals ⇒ empty table ⇒ empty result.
2. **Symbolic bytes**: `parseNum` accepts only decimal and `$hex`. `afEnd`, `afBack`, `2|aniXFlip`, `fr_Walk13` all parse to `null` and are **silently dropped** — so even with labels fixed, every script would lose its terminator and Crabmeat/Sonic would lose frames.
3. **Sonic's `sonani` macro table** matches neither parser's table detection.
4. `parseCharacterAnims`' table detection additionally requires the table label alone on its own line; s1disasm puts the first `dc.w` on the label's line.

Also: `ParsedAnim.frames` is `number[]` and timeline steps are `{frameIndex, duration}` — **no per-frame flip channel exists in the model**, so `aniXFlip`/`aniYFlip` cannot currently survive into playback (today a `2|aniXFlip` byte would parse as frame $22 and then be dropped by the `f < frameCount` filter in `toTimelineAnims`, `export-sprite.ts:366-373`).

### 2.3 Project-level recognition — nothing to hang animations on, by design so far

- **Facet vocabulary** (`src/core/project/adapter.ts:76-79`): `layout, art, objects, rings, collision, palette, parallax, events, preview`. **No sprite/animation facet exists for any engine.** The sprite editor is a *tab* (`sprite-doc`), not a facet; aeon's grant is `['layout','art','objects','rings','collision','palette']` (`src/core/project/aeon/index.ts:123`), classic's is `S1_FACETS = ['layout','objects','collision','palette','art']` (`src/core/project/s1/index.ts`).
- **The S1 profile** (`src/core/project/profiles/s1.ts`) enumerates layout/objects/collision/palette/art paths only. Its only "anim" is `animatedArt` — level **tile** animation overlays transcribed from SonLVL INI `animtiles` (blitted as static tiles; "frame animation is out of scope for v1", s1.ts:45-47). Unrelated to object animation. Neither `_anim/` nor `_maps/` appears in the profile; `_maps` paths enter through the hand-transcribed object-art table.
- **Object previews** (§2.5 v1.1 B1/B5/B6): `src/core/project/profiles/s1-object-art.ts` maps object id (+ zone) → `{artFile, mapAsm, frame, pal, compression, artSource, tileIndexOffset}` — **one hardcoded default frame per object**, transcribed at authoring time from SonLVL objdefs; `object-subtype-rules.ts` composes subtype variants (still static). Rendering: `src/core/level-classic/object-sprite.ts`; cache invalidation: `src/core/level-classic/object-sprite-clock.ts` (palette epoch + tile epoch only — an animation clock would be a **new, third** invalidation input). "Edit art" on a classic object opens a sprite-doc via `editObjectArtCheckout` (`export-sprite.ts:502`) — parses `mapAsm` call-sites, decodes the `.nem`, preselects `link.frame`, seeds the palette — but the timeline opens **empty**: nothing feeds it S1 animations.

So "doesn't recognize animations" decomposes into three concrete absences:
(a) no parser handles the s1disasm dialect (measured: 0 anims from real files);
(b) no data links an S1 object to its `_anim` script (the disasm itself has no such table — it's `lea` sites in 68k code);
(c) no per-frame flip channel in the parsed-anim/timeline model.
Everything downstream of those — playing timeline UI, anim picker, mappings parse, Nemesis decode, palette seeding, frame rendering — already ships.

---

## 3. Gap table

| Needed for S1 animations | Exists today | Missing |
|---|---|---|
| Parse `_maps/*.asm` frames | ✔ `asm-mappings.ts` (used by previews + sprite-doc) | — |
| Decode object art (.nem/.unc) | ✔ preview + sprite-doc pipeline | — |
| Parse `_anim/*.asm` scripts | parser skeleton (`parseSonicAnimScript` — control bytes right) | **s1disasm dialect**: dot-locals, symbolic control names, `n\|aniXFlip` expressions, table-label-on-same-line; measured 0/5 files today |
| Per-frame flip in anim model | ✘ | `ParsedAnim`/timeline step flip channel |
| Object id → anim script link | ✘ (disasm has none either — 90 `lea` sites in code) | transcribed table à la `s1-object-art.ts` (`animAsm` + anim-name list per object) |
| Playback UI | ✔ sprite-doc timeline + anim picker (`loadSpriteAnimations`, aeon char flow) | auto-load hook for classic objects |
| Sonic's animations | ✘ | equates + `sonani` macro + negative-duration policy; rotation fan-out is interpreter code |
| Animated previews in layout | static renderer + 2-clock invalidation | anim clock + frame stepping |
| Authoring / writeback | S4-dialect writer only (`sprite-anim-export.ts`) | S1-dialect writer + save-coordinator wiring |
| Project facet | facet vocabulary has no sprite/anim facet for ANY engine | not required for the first cut (sprite-doc tab is the venue) |

---

## 4. Recommended parcel cut

**Parcel 1 (the first shippable unit): S1 anim-dialect parser + object anim links + read-only playback in the object's sprite-doc.**

Concretely:

1. **`parseS1DisasmAnimScript`** in `src/core/import/anim-import.ts`: accept dot-local labels, table label sharing the first `dc.w` line, symbolic control names (`afEnd…af2ndRoutine` are fixed values — hardcode them, they come from `_Constants.asm:305-310`), and frame expressions of the form `N`, `$N`, `N|aniXFlip`, `N|aniYFlip`, `N|aniXFlip|aniYFlip`. Do **not** general-case the expression evaluator. Acceptance: a sweep test over **all 48 non-Sonic `_anim` files** (not fixtures — the real tree is read-only and on disk) asserting every file yields ≥1 animation, every frame byte < $80, and flips are preserved; Monitor `.breaking` round-trips `afBack,1`.
2. **Flip channel**: extend `ParsedAnim` frames to `{index, xFlip, yFlip}` and thread flips through `toTimelineAnims` → timeline step → the sprite-doc's frame blit. This is the one model change; without it Crabmeat-class scripts (flip-encoded walk cycles) render wrong or drop frames, silently.
3. **`S1_OBJECT_ANIMS`** next to `s1-object-art.ts`: transcribed object-id/zone → `_anim` file (+ optional anim-name labels), sourced by sweeping the 49 `include` sites and 90 `lea (Ani_*)` sites. ~40 placeable ids get links; document unlinked ids with reasons, exactly as `s1-object-art.ts` does.
4. **Auto-load**: `editObjectArtCheckout` reads the link, parses the script, populates the existing anim picker/timeline. No new UI.

**Explicitly out of Parcel 1:** `_anim/Sonic.asm` (macro table + negative-duration dynamic anims + rotation fan-out in `Sonic_Animate` — code, not data; TAG: if a faithful Sonic walk preview is ever wanted, confirm the rotation-offset behavior in a foreground emulator run first), animated layout previews, any writing.

**Why this cut and not a smaller or different one:** a parser alone ships nothing visible (the only entry point is a manual file-pick that a user would have to aim at `_anim/` by hand — and it currently *silently* returns "No animations found"); a facet is the largest possible first bite and the facet vocabulary shows no engine has needed one for sprites. The sprite-doc route reuses every shipped piece (mappings parse, art decode, palette seeding, timeline playback) and the parcel's only genuinely new core is the dialect grammar + one transcribed table — the same shape as B1/B5/B6, which this codebase has landed three times already.

**Parcel 2** (next): animated object previews in the layout facet — a shared anim clock as a third epoch in `object-sprite-clock.ts`, stepping the default animation's frames. Unlocks "the level looks alive" without any authoring risk.
**Parcel 3**: authoring — edit timeline → write the S1 dialect back to `_anim/*.asm` (writer mirroring `sprite-anim-export.ts`, byte-preserving for untouched scripts) under the save-coordinator.

---

## 5. UNVERIFIED / not measured

- **Live timing**: duration byte ⇒ N+1 ticks per frame, and the first-tick behavior after an anim change, are read from `sub AnimateSprite.asm` but not observed on hardware/emulator. TAG for a foreground oracle-next run if timeline durations must match the game to the frame.
- **$80–$F9 no-op**: from the `Anim_End` fallthrough; not observed live. (No script in `_anim/` appears to use such a value, but I did not byte-audit all 49 files — the Parcel 1 sweep test will.)
- **Parser coverage**: only 5 of 49 files were probed against the current parser (all failed identically); the proposed grammar was checked by eye against 4 transcribed files + the constants, not yet against all 49.
- **The `lea` sweep**: 3 of 90 binding sites verified by reading; the `S1_OBJECT_ANIMS` transcription task must sweep all of them (some `lea` sites bind zone-shared scripts, some objects select among several tables by routine).
- **REV00/REV01 divergence** in `_anim/` files: not checked (the profile's `VariantPath` machinery exists if any file turns out to be revision-split).


## Runtime verification of the sync channels — 2026-08-20, overseer foreground run

Sampled `v_ani0_time..v_ani3_frame` (8 bytes at `$FFFEC0`) in the live GHZ demo
(gamemode $08) at frames 4300/4308/4316/4324 on headless oracle-aether (37 methods):

- **ch1: steps exactly every 8 frames, ascending** — f 0→1→2→3 at 8-frame intervals,
  time resetting to 7 (#8−1). CONFIRMED.
- **ch0: steps exactly every 12 frames, descending mod 8** — f 0→7→6, time resetting
  to $0B (#12−1). CONFIRMED.
- **ch2**: same 8-frame period as ch1. CONFIRMED. **ch3**: 0000 throughout (no ring
  loss active), consistent with the accumulator model. Its in-loss sequence (TAG 2)
  and the level-start phase (TAG 3) remain unverified — TAG 2 needs an induced hit.
