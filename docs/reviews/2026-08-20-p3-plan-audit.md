# P3 Plan Audit — the three 2026-06-17 sprite plans vs today's tree

**Date:** 2026-08-20 · **Branch:** `scout/p3-plan-audit` · **Scope:** measurement only, no redesign.

**Plans audited** (note: they live in `docs/plans/`, NOT `docs/superpowers/plans/` as the
dispatch assumed — that directory holds the Aug UX-overhaul plans only):

1. `docs/plans/2026-06-17-sprite-mappings-export.md` (Plan 1 of 6)
2. `docs/plans/2026-06-17-sprite-decomposition.md` (Plan 2 of 6)
3. `docs/plans/2026-06-17-sprite-animation-export.md` (Plan 3 of 6)

## Headline finding — the plans are not open work

All three plans were **fully executed in June 2026**. Every commit message the plans script
exists verbatim in history:

| Plan | Commits (git log --follow) |
|---|---|
| 1 (mappings) | `29bd2b1`, `63f628e`, `2bd0d23` (hardening follow-up) |
| 2 (decompose) | `5087abb`, `547f057`, `bfbd78d`, `7f376b3` (hardening follow-up) |
| 3 (anim) | `e5b87d9`, `674e61b`, `605282c` (`align 2` fix) |

The chain then continued **past** the three plans: `435a935` (export to engine + per-frame
anim emitter, "chunk 4"), `302e135` (load-sprite roundtrip), `de8213c` (object previews on the
map), `7ec58bf` (DPLC export toggle), `7d5d081`/`7b4748e` (multi-game target-format +
disassembly `.asm` export). All of it survived the UX overhaul: sprite docs are multi-document
tabs in the new shell (`src/renderer/shell/tab-activation/sprite.ts`, `SpriteDocHeader.tsx`,
`SpriteToolDock.tsx`) with per-document undo stacks on the **DocumentHistoryHub**
(`src/renderer/state/spriteStore.ts:103,294`; `test/editing/sprite-history.test.ts`).

Verified live: `npx vitest run test/sprite` → **24 files, 154 passed, 2 skipped** (run
2026-08-20 in this worktree). The plans' own checkboxes were never ticked (17/20/10 `- [ ]`
still unchecked), which is presumably why ROADMAP §5.2 still lists them as the open queue.

**Consequence for §5.2/§4.4:** P3's genuinely open work is NOT these plans. It is
(a) the authoring half specced later in `docs/specs/2026-07-03-animation-authoring-design.md`
(event tags in the timeline, reorder, onion-skinning — see the current-state table below), and
(b) engine-side wiring: nothing in aeon's build consumes the exported sprite artifacts (below).

---

## Plan 1 — `2026-06-17-sprite-mappings-export.md` claim table

| Claim | Verdict | Citation | Notes / replacement |
|---|---|---|---|
| Create `src/core/model/sprite-types.ts` w/ `SpritePiece`/`SpriteFrame`/`sizeCode` | TRUE (delivered) | file exists; `sizeCode` at `src/core/model/sprite-types.ts:28` | current version adds range fail-fast (`2bd0d23`) |
| Create `src/core/export/sprite-mappings-export.ts` w/ `computeFrameBbox` + `serializeSpriteMappings` | TRUE (delivered) | file exists; exports verified in test run | |
| Tests `test/sprite/sprite-types.test.ts`, `test/sprite/sprite-mappings-export.test.ts` | TRUE | both exist, pass | |
| "Verified against `s4_engine/data/mappings/test_mappings.asm`" | STALE path, TRUE semantics | `/home/volence/sonic_hacks/s4_engine` does not exist; now `aeon/games/sonic4/data/mappings/test_mappings.emp:18-22` | s4_engine → **aeon**; the worked example migrated to the `.emp` mapping DSL (`offsets Map_TestObj { F0: MapFrame1 = centered(half: 8, w: 2, h: 2, tile: 0), F1: … tile: 4, F2: centered(half: 4, w: 1, h: 1, tile: 0) }`) — same F0/F1/F2 values, so the plan's expected bytes remain correct |
| `sizeCode` matches "`s4_engine` macros.asm `sprSize`" (w−1 in bits 3-2, h−1 in bits 1-0) | STALE location, TRUE encoding | `aeon/engine/objects/mapping_dsl.emp:46` (`size: ((w-1)<<2)\|(h-1)`) with a build-time witness at `:57-58` (`ensure(… .piece.size == 0b0100 …)`) | macros.asm is gone; the DSL carries the guard |
| Mappings format: word offset table + 6-byte header (4 signed bbox bytes + `dc.w piece_count`) + 8-byte VDP-order pieces {Y, size\|link, tile+attr, X}, big-endian | TRUE | `aeon/docs/ENGINE_ARCHITECTURE.md:3893` (§7.8 format block); `aeon/engine/system/constants.emp:76` (`FRAME_PIECE_COUNT = 4` — count word after the 4 bbox bytes); `aeon/tools/convert_s2_mappings.py:96-148` (offset table read/write) | unchanged by the ZX0 art-pool move (level FG art only — ENGINE_ARCHITECTURE.md:17) |
| `computeFrameBbox` "mirrors s4_engine tools/convert_s2_mappings.py `_compute_bbox`" | STALE path, TRUE | `aeon/tools/convert_s2_mappings.py:44` | tool moved with the rename |
| tile_attrs bits: pri<<15, pal<<13, yflip<<12, xflip<<11, tile 0..$7FF | TRUE | matches VDP layout; ENGINE_ARCHITECTURE.md §7.8 "tile_offset: relative tile index + palette/priority/flip bits" | |
| Spec cites `docs/specs/2026-06-16-sprite-mode-design.md` §2.1, §4, §6, §8 | TRUE | sections exist (headers at spec lines 40, 162, 211, 234) | |
| Roadmap block: "Plan 4 = shared art-core, Plan 5 = Sprite-mode UI, Plan 6 = object previews" | STALE (all happened, differently named) | sprite UI = doc tabs in `EditorShell` (no "modes" — AppMode deleted in the UX overhaul); previews = `src/renderer/object-previews.ts` (`de8213c`), still wired (`src/renderer/App.tsx:44`, `OverlayRenderer.ts:266`, binding UI now `src/renderer/components/shared/SpriteBindingRow.tsx` — the old `ObjectPalette.tsx` is GONE) | "Plan 4"'s named artifacts `PixelCanvas`/`PixelGridDoc`/`usePixelEditingState` were never built under those names — zero hits in `src/renderer`; the shared canvas became `ComposerCanvas.tsx`/`SpriteCanvasHost.tsx` |
| `npm test` runs the suite | TRUE | `package.json:10` (`"test": "vitest run"`) | |

**Verdict: ALREADY EXECUTED (June 2026) — do not re-run.** As a reference document it needs a
corrections block only for the `s4_engine` → aeon/`.emp` renames; every byte-level format
claim still holds.

---

## Plan 2 — `2026-06-17-sprite-decomposition.md` claim table

| Claim | Verdict | Citation | Notes |
|---|---|---|---|
| Create `src/core/art/sprite-decompose.ts` (`RawFrame`, `decomposeFrame`, `assembleSprite`) | TRUE (delivered) | file exists; matches the plan's code plus input validation (`7f376b3`) | |
| Test `test/sprite/sprite-decompose.test.ts` | TRUE | exists, passes | |
| Reuses `Tile` from `src/core/model/s4-types.ts` | TRUE | `src/core/model/s4-types.ts:196` (`export interface Tile`) | |
| Reuses `SpritePiece`/`SpriteFrame` from `src/core/model/sprite-types.ts` | TRUE | imports at `src/core/art/sprite-decompose.ts:1-2` | |
| Reuses `serializeTiles` from `src/core/export/tile-dedup.ts` | TRUE | `src/core/export/tile-dedup.ts:126` | beware: a second, different `tile-dedup.ts` now exists at `src/core/import/tile-dedup.ts` (flip-variant matching) — the plan's path is the right one |
| `canonicalizeTile` exists in tile-dedup | TRUE | `src/core/export/tile-dedup.ts:29` | |
| Spec §6 (auto-decomposition), §12 (greedy-first deferral) | TRUE | spec headers lines 211, 282 | |
| Consumers: `serializeSpriteMappings` (Plan 1) + `serializeTiles` | TRUE | integration test in `test/sprite/sprite-decompose.test.ts` passes | downstream `assembleSprite` is consumed by `src/core/export/sprite-export.ts:1` |

**Verdict: ALREADY EXECUTED — delivered as written.** No stale claims beyond the shared
`s4_engine` framing; the purest of the three.

---

## Plan 3 — `2026-06-17-sprite-animation-export.md` claim table

| Claim | Verdict | Citation | Notes / replacement |
|---|---|---|---|
| Create `src/core/export/sprite-anim-export.ts` (`generateAnimationAsm`, model types) | TRUE (delivered) | file exists; also gained `generatePerFrameAnimationAsm` (`435a935`) which is what `sprite-export.ts:4` actually uses | |
| AF_* codes: END $FF, BACK $FE, CHANGE $FD, ROUTINE $FC, DELETE $FB, CALLBACK $FA, SOUND $F9, COLLISION $F8, SET_FIELD $F7, DUR_DYNAMIC $FF | TRUE (values) | `aeon/engine/system/constants.emp:64-73` — every value identical | but they are `pub const` in **constants.emp**, not "constants.asm" |
| "so it assembles against s4_engine's `constants.asm`" | **COLLAPSED** | `aeon/build.sh:5` ("The AS Macro Assembler (asl) + p2bin + fixheader **have left the pipeline**; one sigil"), `:218-223` ("sigil build IS the build now. No asl fallback"); no `constants.asm` exists | aeon's animation scripts are `.emp` `offsets` constructs now (`aeon/games/sonic4/data/animations/sonic_anims.emp:33+`: `offsets Ani_Sonic { Walk: [u8; 10] = [DUR_DYNAMIC, 7, 8, …, AF_END], … }`). Whether sigil would accept a generated `.asm` module referencing `.emp` `pub const`s is **UNVERIFIED** (not test-assembled here); the engine's own anims are not authored that way |
| Emitted `even` after each block (plan's expected test strings) | STALE vs shipped code | `src/core/export/sprite-anim-export.ts:113,151` emit `align 2` (commit `605282c`) | AND the engine now deliberately packs bodies with **no** inter-body alignment — `sonic_anims.emp:34-36`: "each body rides INLINE with no inter-body `align 2` pads (AnimateSprite reads scripts BYTE-wise; only the table needs evenness)". The generator's per-body `align 2` diverges from current engine convention |
| Byte forms: `dc.b duration, frames…, control`; events inline BEFORE their frame; AF_SET_FIELD = `$F7, sst_offset, value, 0`; AF_CALLBACK = `$FA, target_hi, target_lo, 0` (objroutine offset) | TRUE | `aeon/engine/objects/animate.emp:26` (SET_FIELD format), `:209` (CALLBACK format), `:20` (offset stored big-endian as two bytes) | interpreter unchanged |
| Frame bytes $00-$F6; $F7+ = control/event dispatch threshold | TRUE | `aeon/engine/system/constants.emp:72` ("lowest control code — the $F7+ dispatch threshold"); `animate.emp:106` (`cmpi.b #AF_SET_FIELD`) | |
| `objroutine()` macro exists for callbacks | TRUE (concept) | `aeon/engine/objects/load_object.emp:4`, `constants.emp:74` (`OBJ_CODE_BANK`) | caveat: `animate.emp:43` — the AF_CALLBACK "installable-target set is EMPTY today (no animation script bakes a callback; the $FA opcode … are forward machinery)". Emitting callbacks is ahead of any engine consumer |
| Spec §2.2 | TRUE | spec header line 93 | |
| "Next: Plan 4 (`PixelCanvas`/`PixelGridDoc`/`usePixelEditingState` from Art-mode code)" | GONE | zero hits in `src/renderer`; Art *mode* itself deleted in the UX overhaul | shared canvas landed as `ComposerCanvas.tsx` / `SpriteCanvasHost.tsx` instead |

**Verdict: code ALREADY EXECUTED, but the plan's engine-integration premise NEEDS RE-DESIGN.**
The collapsed assumption: aeon consumes hand-included `.asm` animation text assembled by asl
against `constants.asm`. Today aeon is sigil-built from `.emp` sources, its animation format
is the `offsets` construct with packed bodies, and the `.asm` the exporter writes
(`<name>_anims.asm` into `data/sprites/<name>/`) has **no consumer in aeon's build** (see
engine section). Any resumed P3 work must either emit `.emp` or prove sigil's mixed-`.asm`
path accepts the generated text — that decision belongs to the 2026-07-03 authoring design,
not to this audit.

---

## Engine-side format status (aeon, read-only)

| Item | Status | Citation |
|---|---|---|
| `aeon/games/sonic4/data/mappings/` | EXISTS — `sonic.bin`, `tails.bin`, `tails_tail.bin`, `knuckles.bin`, `test_mappings.emp` | directory listing 2026-08-20 |
| `aeon/games/sonic4/data/dplc/` | EXISTS — character `.bin`s + shield `.bin`s + `optimized/` | directory listing |
| VDP-order mappings format (6-byte header + 8-byte pieces) | UNCHANGED | `ENGINE_ARCHITECTURE.md:3893` (§7.8); `constants.emp:76` |
| Sprite art compression | still **uncompressed** ("zero CPU, proven by every commercial Genesis game"); the ZX0 paged pool applies to the FG **act art pool** (level art), and character DPLC art rides in the pool at $3C0 — sprite *formats* did not move | `ENGINE_ARCHITECTURE.md:17` |
| Animation scripts | values unchanged ($F7-$FF, DUR_DYNAMIC), **source form migrated to `.emp`** (`data/animations/*.emp` only — no `.asm` anim files remain) | `sonic_anims.emp`, dir listing |
| Toolchain | asl/p2bin/fixheader **gone**; sigil is the sole assembler (`SIGIL_BUILD` required) | `aeon/build.sh:5,218-223` |
| `aurora → aeon` sprite exports | land in `games/sonic4/data/sprites/<name>/` (`mappings.bin`, `art.bin`, `<name>_anims.asm`, `sprite.json`); one real export exists (`pitcher_plant/`) plus `index.json`, `object-bindings.json` (currently `{}`) | `export-sprite.ts:44-45,98`; aeon dir listing |
| ROM consumption of those exports | **NONE FOUND** — no reference to `data/sprites` anywhere in aeon's build.sh, tools/*.py, or *.emp/*.asm sources. The spine currently ends at the editor's doorstep: artifacts are written, nothing bakes them into the ROM | grep 2026-08-20 (excluding worktrees) |
| Aurora's engine-character load path | STALE vs post-split aeon: `loadEngineCharacter` hardcodes legacy `data/mappings/…`, `data/dplc/…`, `art/uncompressed/characters/…`, `data/animations/<name>_anims.asm` relative to project base — post-split these live under `games/sonic4/…` (and the anims are `.emp`, so the anim parse can never fire). `spritesDir()` was fixed for the split; this loader was not. Marked EXPERIMENTAL in-source | `export-sprite.ts:610-612,633`; contrast `:44-45` |
| Aurora's anim importer | parses the `.asm` per-anim form only (`dc.w`/`dc.b` text) — cannot read today's `.emp` anims | `src/core/import/anim-import.ts:1-9` |

### Object-art previews (§4.4 item 4 / §5.2 note)

The §5.2 note ("previews already exist for **classic**, §2.5 v1.1 B1") **understates**:
previews exist on BOTH sides and both survived the re-home.

- **Aeon side** (shipped `de8213c`, June): `src/renderer/object-previews.ts` renders each
  bound sprite's frame 0 from `data/sprites/` + `object-bindings.json` into
  `projectStore.objectSprites`; `OverlayRenderer.ts:266` draws it origin-aligned; rebuilt on
  project load (`App.tsx:44`); binding UI is now `SpriteBindingRow.tsx` (the old
  `ObjectPalette.tsx` dropdown is gone). So §4.4 item 4's "replaces markers" already has its
  mechanism — what it lacks is content (`object-bindings.json` is `{}`) and per-frame choice.
- **Classic side** (v1.1 B1): `src/core/level-classic/object-sprite.ts` decodes S1 art
  (nemesis + `parseAsmMappings`) and renders via the **shared** `renderFrameToIndices`
  (`src/core/art/sprite-render.ts`); caching via `src/renderer/state/object-sprite-cache.ts`,
  a deliberately generic injected-builder cache ("the reference caching pattern … B2/B3 reuse
  it"). Reusability verdict: the render core and cache pattern are already shared/generic;
  only the decode front-end (nemesis/asm-mappings vs sprite.json+bin) is per-side — and the
  aeon side already has its own, so nothing needs porting for P3.

### Current authoring-surface state (for scoping what P3 still owes)

- Timeline: add/remove steps + per-step 1/60s durations + playback modes — but **no event
  tags** (`Timeline.tsx:39`: "event-tag markers come next"), **no step reorder** (no such
  action in `spriteStore.ts`), **no onion-skinning**. ROADMAP row 336's "Playback only" is
  itself stale — the timeline already edits steps/durations; what's missing is the rest.
- Agent surface: **zero sprite tools** among the 40 `EDITOR_METHODS`
  (`src/main/editor-methods.ts` — full name list checked; only classic-palette descriptions
  mention the word "sprite"). The plans predate the registry; any resumed P3 work inherits an
  MCP/Aether parity obligation the plans never mention.
- The later spec `docs/specs/2026-07-03-animation-authoring-design.md` (which declares itself
  the P3 authoring half and calls the export spine "already specced") itself cites
  `engine/objects/animate.asm + constants.asm` — those are now `.emp`; that spec needs the
  same rename/pipeline corrections before execution.

### UNVERIFIED (checked but not provable from the tree)

- Whether sigil's mixed-source build would accept a generated `.asm` animation module that
  references `.emp` `pub const`s (some `.asm` survives in aeon — `games/sonic4/game_root.asm`,
  Aurora's own `data/editor/**/export/entity_data.asm` — so mixed assembly exists, but no
  animation `.asm` does; I did not run a test assembly).
- End-to-end `exportSprite` behavior in the live Electron app (node suite is green; per the
  repo's own runtime-only-bugs history, renderer/IPC paths are not proven by it).

---

## Closing verdicts

| Plan | Verdict |
|---|---|
| 1 — sprite-mappings-export | **ALREADY EXECUTED (June 2026); do not re-run.** As reference: needs a small corrections block (s4_engine→aeon, `test_mappings.asm`→`.emp`, `macros.asm sprSize`→`mapping_dsl.emp`). All byte-format claims verified TRUE against today's engine. |
| 2 — sprite-decomposition | **ALREADY EXECUTED; delivered as written.** Every dependency claim (Tile, sprite-types, serializeTiles, canonicalizeTile, spec sections) verified TRUE. No corrections needed beyond the shared rename. |
| 3 — sprite-animation-export | **ALREADY EXECUTED as code, but its engine-integration premise NEEDS RE-DESIGN.** Collapsed assumptions: (a) asl/`.asm`/`constants.asm` pipeline — gone, sigil-only, anims authored as `.emp` `offsets` constructs; (b) per-body `even`/`align 2` padding — engine now packs bodies unpadded; (c) generated `.asm` has no build consumer. AF_* values, event byte forms, and the $F7 threshold all remain TRUE. The re-design home is the 2026-07-03 authoring spec (which itself needs the same pipeline corrections). |

**Corrections block draft (Plans 1 & 2, if kept as reference):**
- `s4_engine/` → `aeon/` throughout; the engine builds sigil-only from `.emp` (no asl, no `constants.asm`/`macros.asm`).
- `s4_engine/data/mappings/test_mappings.asm` → `aeon/games/sonic4/data/mappings/test_mappings.emp` (same F0/F1/F2 values via `mapping_dsl.emp`'s `centered`; expected bytes unchanged).
- `macros.asm sprSize` → `aeon/engine/objects/mapping_dsl.emp:46` (+ `ensure` witness at `:57`).
- `tools/convert_s2_mappings.py` → `aeon/tools/convert_s2_mappings.py` (`_compute_bbox` at `:44`).
- "Plan 5 = Sprite-mode UI" → sprite documents are tabs in `EditorShell` (AppMode/Toolbar deleted); "Plan 6 = object previews" → shipped (`object-previews.ts` + `SpriteBindingRow.tsx`).
- Plan 3's expected `even` lines → shipped code emits `align 2` (`605282c`); engine convention is now **no** inter-body padding.

**What P3 actually still owes** (measured, not designed): timeline event tags + reorder +
onion-skinning (2026-07-03 spec), an anim export form aeon's sigil/.emp build can consume,
ROM-side consumption of `data/sprites/` exports, post-split path fixes in
`loadEngineCharacter`/`anim-import`, sprite bindings content, and agent-surface parity in
`EDITOR_METHODS`.
