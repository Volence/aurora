# The classic playtest loop — what each of the four links actually costs

**Date** 2026-08-19 · **Branch** `scout/classic-playtest-links` · **Kind** measurement, not implementation.

ROADMAP §2.7 shipped the playtest loop aeon-first and said classic was deferred because
"classic's had two unverified links (see §4.8's corrections block)". **That block does not
exist in ROADMAP.md** — `grep -n correction docs/ROADMAP.md` returns two hits, neither of
them a corrections block — so the reason was never actually recorded. This report measures
the four links against `/home/volence/sonic_hacks/s1disasm` and Aurora's classic adapter,
and names which two §2.7 must have meant.

Every number below was produced by a command run on this machine or transcribed from a file
opened here. Nothing needing a running emulator was attempted; those rows are tagged
**NEEDS FOREGROUND RUN**.

---

## The verdict table

| # | Link | aeon's shape | S1's equivalent | Verdict | Key citation |
|---|---|---|---|---|---|
| 1 | **Build** | `FAST=1 ./build.sh` → `s4.bin` + `s4.lst`, plan from `project.json` (`buildPlanFor`) | `lua build.lua` → `s1built.bin` + `sonic.lst`, **measured 600–615 ms warm**, native `asl`/`p2bin`, no Wine | **VERIFIED — Aurora-side wiring only** | `s1disasm/build.lua:29`; `s1disasm/build_tools/lua/common.lua:772`; `aurora/src/core/aether/build-plan.ts:110` |
| 2 | **Symbols** | `emulator/load_symbols <rom>.lst`; oracle-next parses sigil's listing | `sonic.lst` is a **real AS V1.42 listing** — a different format. oracle-next **hard-refuses it**: 12,410 declared symbols, 4,059 parse, 4,886 lines skipped | **OPEN — gated on oracle-next (or on s1disasm emitting a second format)** | `oracle-next/crates/oracle-core/src/symbols.rs:823`; `oracle-next/crates/oracle-aether/src/engine.rs:2144` |
| 3 | **Live palette** | write `Pal_Base` (96 B, lines 1–3), then `Pal_Base_Dirty = 1` — payload then flag | `v_palette_line_2` at **`$FFFB20`, 96 bytes** = the same three lines. Copy to CRAM is **unconditional every VBlank** — *no dirty flag exists or is needed* | **VERIFIED (mechanism) — blocked only by link 2** | `s1disasm/_Variables.asm:317-322`; `s1disasm/sonic.asm:740`; `s1disasm/_inc/Palette Index.asm:18-22` |
| 4 | **Play-from-cursor** | `Warp_Req_X/Y/Flag` mailbox, DEBUG-shape ROM, engine reseeds the plane at frame top | **No mailbox exists.** `ScrollHoriz` sets *at most one* redraw-column flag per frame and `MoveScreenHoriz` clamps camera motion to 16 px/frame — a camera poke has the aeon failure mode by construction | **NEEDS ENGINE CHANGE — work in s1disasm, a repo Aurora does not own** | `s1disasm/_inc/ScrollHoriz & ScrollVertical.asm:6-25,52-56`; `s1disasm/_inc/Level Drawing (REV01).asm:872` |

**Links 3 and 4 both run through link 2.** Aurora resolves everything by symbol and never
hardcodes an address (contract D7 — `push-palette.ts:77-90`, `warp.ts:81-88`). Every S1 RAM
label a push or a warp would need is dropped by oracle-next's parser today, so the palette
link is not "shipped except for UI" — it is *unaddressable*. Symbols is the gate, and it is
the only one.

---

## 1. Build

### Can it be built here, and how

Yes, natively, no Wine.

- The build entry point is `lua build.lua` (`s1disasm/build.lua`, a shebanged Lua script;
  `build.bat:5` is a Windows shim that calls `build_tools/Lua/lua.exe build.lua`).
- `build_tools/Linux-x86_64/` contains native `asl` and `p2bin` binaries. `common.lua:365`
  picks `asl` per platform, `common.lua:432` finds it.
- `lua` is on PATH here (`/usr/bin/lua`, also `lua5.4`, `luajit`).
- The artifact is **`s1built.bin`** (`build.lua:29`, `common.build_rom_and_handle_failure("sonic", "s1built", …)`),
  551,288 bytes as built.

### Wall clock

Three consecutive **warm** runs, timed with `date +%s%N` around `lua build.lua`
(script: `scratchpad/time-s1build.sh`):

```
run 1: rc=0  615 ms
run 2: rc=0  600 ms
run 3: rc=0  615 ms
```

The **first** run of the session additionally converted the PCM/DPCM WAV sources
(`Converting WAV file 'sound/dac/pcm/sega.wav'…`), which is a one-time step cached by
`hashes.lua` (`common.lua:304-306`). That run was not cleanly timed — `bc` is absent on this
machine and the arithmetic failed — so **the cold figure is unmeasured**; it is not
estimated here. The warm figure is the one that matters for an edit→look loop, and 600 ms is
**less than half** aeon's `FAST=1` 1.3 s.

The build is **non-destructive to the tree**: `s1built.bin`, `sonic.lst`, `sonic.log`,
`sonic.p` and `sound/dac/*/generated/*` are all in `s1disasm/.gitignore`. `git status
--short` in s1disasm is byte-identical before and after the three builds (two modified
`.nem` files and two untracked paths, all pre-existing).

### Does Aurora's classic adapter know anything about building?

No. `src/core/project/s1/index.ts:473` declares:

```ts
build: false,
```

and that field is read **nowhere in the product** — `grep -rn "capabilities.build" src/`
returns exactly one hit, in `src/core/project/__tests__/adapter.test.ts:125`. So it is a
label, not a gate.

The actual gate is in the UI and the agent surface, and it is an explicit refusal:

- `src/renderer/App.tsx:120-124` — `Build & Run needs an aeon project — a classic
  disassembly builds with its own toolchain`
- `src/renderer/agent/agent-handler.ts:976` — `throw new Error('build_and_run needs an aeon
  project open')`

Both read `useProjectStore.getState().config`, the **aeon** store. Classic lives in
`useClassicProjectStore` (`src/renderer/state/classicProjectStore.ts:46`), a separate store.
`grep -rn "aether\|Aether" src/renderer/components/classic/ src/renderer/state/classicLevelStore.ts
src/renderer/state/classic-save.ts` returns **nothing** — there is zero Aether wiring on the
classic side, including no F7 in `ClassicLevelViewport.tsx`.

### How the aeon adapter carries a build command — and the surprise

`buildPlanFor` (`src/core/aether/build-plan.ts:110-161`) is already **engine-agnostic**. It
reads `buildCommand`, `buildEnv`, `buildFast`, `prebuildCommand`, `romPath`, `symbolsPath`
off a raw `project.json` record and falls back to defaults.

The surprise: **aeon's `project.json` carries none of them.** `/home/volence/sonic_hacks/aeon/project.json`
has `name`, `engine`, `zones`, `objectLibrary`, `chunkLibrary` — and nothing else. The aeon
path works entirely on the hardcoded defaults `./build.sh` / `s4.bin` / `s4.lst`
(`build-plan.ts:57,97,98`). So the config channel exists but has never been exercised;
classic would be its first user.

Classic already has the file to put them in. `.aurora/project.json` is parsed by
`readProjectConfig` with `z.looseObject` and *"Unknown top-level fields are preserved so
configs written by newer Auroras survive a round-trip"* (`src/core/project/mapping.ts:11,21`),
and the parsed result reaches the renderer as `ClassicProjectState.sidecar`
(`classicProjectStore.ts:64`), alongside `dir` — the disasm root. `basePath = dir`,
`raw = sidecar.config` is the whole wiring.

Three real defects would surface the moment it was wired, none of them large:

1. `AEON_REQUIRED_ENV = ['SIGIL_BUILD', 'SIGIL_EMIT']` (`build-plan.ts:106`) is
   unconditional, so a classic build would report two missing variables it does not need.
2. `plan.envOverrides.DEBUG` is forced to `'1'`/`'0'` (`build-run.ts:142`) and `FAST=1` is
   default (`build-plan.ts:134`). Both are inert for `build.lua`, but `plan.fast` drives a
   *"not a ship artifact"* claim in the result that would be false for classic.
3. **The listing path derivation is wrong for classic.** `build-run.ts:231-233` derives the
   symbols path from the ROM path by swapping `.bin`→`.lst`, giving `s1built.lst`. AS names
   the listing after the **source file**, not the ROM: it is `sonic.lst`. `symbolsPath` in
   the sidecar covers this, but only if the derivation stops overriding it.

### Does a classic save write in place, so a build picks edits up?

Yes, and it is observable rather than argued. `s1disasm`'s working tree currently shows

```
 M "artnem/GHZ Bridge.nem"
 M artnem/Signpost.nem
?? .aurora/
```

`.aurora/canvas/` holds `commit-a.canvas.json` / `test.canvas.json` from earlier Aurora
sessions. The save path (`src/renderer/state/classic-save.ts:52`) takes `dir` — the disasm
root — and writes `WriteResult.files` through the guarded channel; there is no staging area
and no export step. The `s1built.bin` timed above was assembled **from a tree Aurora had
already edited**. Link 1 is a save→build loop that already closes; the missing piece is
purely Aurora pressing the button.

---

## 2. Symbols — the gate

> **CORRECTION (2026-08-19, same day, after oracle's review — authoritative over the
> binding claim below):** "`EndOfRom` … so the binding then works for free" is **wrong**.
> Verified against the artifacts: `sonic.asm:184` is `RomEndLoc: dc.l EndOfRom-1`, so
> `EndOfRom` lands at **exactly** ROM length — `sonic.lst` says `86978` and `s1built.bin`
> is exactly 551,288 = $86978 bytes. One-past-the-end means the $DEB2 appendix probe
> either reads out-of-range (unpadded, the case here) or reads padding; both refuse, and
> the accepted-unverified fallback did not apply because the symbol IS present. Oracle
> ruled the same day: **EndOfRom == ROM length exactly is treated as a no-appendix
> marker → accepted UNVERIFIED** (one-past-the-end cannot be a mismatched in-range
> listing, so the wrong-listing guard stays intact). The parser fix itself is booked and
> implementing on oracle's side, bundled with the CRAM handlers; the |-split finding
> corroborated their independent recon, and the 48-bit sign-extended RAM finding was new
> to them. Nothing else in this section changes.

### The build does emit a listing

`common.lua:772` passes `-L` to AS:

```lua
os.execute(tools.as .. " -xx -n -q -A -L -U -E -i . " .. …)
```

producing `sonic.lst` (10,265,043 bytes here), a genuine **AS V1.42 Beta [Bld 212]**
listing with a `Symbol Table (* = unused):` section at line 126,702 and a footer declaring
**12,410 symbols / 1,573 unused**. Note `-U` is present, so case-sensitivity is on (unlike
the legacy `sonic_hack/` toolchain).

### oracle-next cannot consume it

`oracle-core/src/symbols.rs` was written for **sigil's** emitter and says so — its module doc
names the producer as `sigil/crates/sigil-link/src/listing.rs::emit_listing` (line 18) and
`parse_table_row`'s doc (line 822) states the five-token shape is *"what keeps a real AS
listing's source text from being mistaken for symbols."* That is a deliberate exclusion, and
it does its job on this file.

Measured by reimplementing `parse_table_row` exactly (`scratchpad/lstcheck.py`; predicate
transcribed from `symbols.rs:830-838`) and running it over the real `sonic.lst`:

```
declared 'N symbols' footer : 12410
rows ACCEPTED by parse_table_row: 4059
rows REJECTED (skipped_lines) : 4886
token-count histogram: [(10, 4174), (5, 4061), (2, 612), (3, 88), (16, 4), (4, 3), (1, 2), (11, 1)]
```

Two independent reasons, both structural:

1. **AS packs two symbols per line.** The 4,174 ten-token rows look like
   `ADoor_Animate : 9026 C |  ADoor_Animate.display : 904A C |`. Sigil emits one row per
   line, so the parser requires `tok.len() == 5`.
2. **AS spells RAM addresses 48-bit sign-extended** — `f_debugmode : FFFFFFFFFFFFFFFA C |`.
   `symbols.rs:838` does `u32::from_str_radix(tok[2], 16)`, which overflows on 16 hex
   digits. Of the 4,061 single-column rows, **669 carry >8 hex digits and are dropped for
   this reason alone**; only 3,391 survive. The module's own "trap 1" (line 58) names this
   exact form and says the parser expects the *modern* `FFFFxxxx` spelling instead.

### The failure is a refusal, not degradation

`load_symbols` (`oracle-aether/src/engine.rs:2111`) validates before accepting:

- `validate_against_rom` needs `EndOfRom`. `sonic.lst` **has** it —
  `EndOfHeader : 200 C |  EndOfRom : 86978 C |` — but on a ten-token line, so it never
  parses. Result: `RomBinding::Indeterminate(NoEndOfRomSymbol)`.
- Then `engine.rs:2144`: `RomBinding::Indeterminate(_) if !table.is_intact()` → **return
  `RpcError`**: *"cannot be bound to the loaded ROM and is not internally intact, so it
  cannot be trusted"*.
- `is_intact()` (`symbols.rs:614-618`) requires `matches_declared_count() == Some(true)` **and**
  `skipped_lines == 0`. We measured 4,059 vs 12,410 and 4,886 skipped. Both fail.

The frontend applies the same policy table (`oracle-frontend/src/symbol_file.rs:14-19`). And
even if it were accepted, s1disasm's ROM has no `deb2` appendix — `p2bin` is run with
`-p=FF -z=0,kosinski,…` and no `convsym` step — so the binding probe has nothing to read.

**Consequence, stated plainly:** `client.resolve('v_palette_line_2')` and
`client.resolve('v_player')` both fail today, so links 3 and 4 have no addresses to write to
even after their engine-side questions are answered.

*(Footnote, harmless but worth knowing: `v_player` is `equ`, not `ds`, so its row reads
`v_player : FFFFFFFFFFFFD000 - |` — type `-`, which `symbols.rs:112` classifies as
`SymbolKind::Equate`. The address is right; the kind is not what a caller would expect.)*

### What would have to change

Either side can close it, and they are genuinely different-sized:

- **oracle-next side (smaller):** teach `parse_table_row` the AS dialect — split a row line
  on `|` before tokenising, and parse the address as `u64` masked with `BUS_ADDR_MASK`
  (which `symbols.rs:100` already defines) instead of `u32`. Both are local to one function.
  The `EndOfRom` binding then works for free, because AS emits it. `is_intact` needs no
  change; it would simply start passing.
- **s1disasm side (larger, and across the fence):** add a `convsym`/`sym2lst` step to
  `build.lua` emitting a sigil-shaped `.lst` beside `s1built.bin`. This means editing a repo
  Aurora does not own, for the benefit of one consumer.

The oracle-next route is the right one and it is **not Aurora's to write** — `cargo` in
oracle-next is serialized and that session owns it. This is a cross-repo ask, not a
next-phase task item.

---

## 3. Live palette — verified, and simpler than aeon's

Found independently of the aeon doc, then cross-checked against Aurora's own S1 profile,
which was written from the SonLVL INI and knows nothing about `Pal_Base`.

**The RAM source.** `_Variables.asm:316-322`:

```
; Main palette
v_palette:
v_palette_line_1:	ds.b $20
v_palette_line_2:	ds.b $20
v_palette_line_3:	ds.b $20
v_palette_line_4:	ds.b $20
v_palette_end:
```

Addresses transcribed from the built `sonic.lst` (lines 2000–2008):
`v_palette_line_1 = $FFFB00`, `_2 = $FFFB20`, `_3 = $FFFB40`, `_4 = $FFFB60`, end `$FFFB80`.
(S1 numbers its lines 1–4; CRAM lines 0–3.)

**The copy to CRAM.** `sonic.asm:740`, inside the VBlank routine:

```
		writeCRAM	v_palette,0			; write regular palette buffer to CRAM
```

`writeCRAM` (`Macros.asm:35-43`) is a full DMA of `source_end - source` = `$80` bytes to
CRAM offset 0 — **all four lines, every frame, unconditionally**. Six call sites
(`sonic.asm:740, 822, 886, 920, 983, 1013`), one per game-mode VBlank flavour, differing
only in whether the water buffer is used instead (`f_wtr_state`, `sonic.asm:738`).

**Is there a dirty flag?** No, and none is needed. This is the one place classic is
*simpler* than aeon: aeon's per-frame compose only copies when `Pal_Base_Dirty` says so, so
Aurora must write payload-then-flag. S1 re-DMAs unconditionally, so a bare write to
`$FFFB20` shows up on the next frame with no second write and no ordering hazard. The
`payload-then-flag` discipline in `push-palette.ts` is aeon-specific and would be dropped,
not ported.

**Which lines are safe.** `_inc/Palette Index.asm:18-27`:

```
palid_Sonic:		makePalEntry	Pal_Sonic,		v_palette_line_1
	Pal_Levels:
palid_GHZ:		makePalEntry	Pal_GHZ, 		v_palette_line_2
palid_LZ:		makePalEntry	Pal_LZ, 		v_palette_line_2
…
```

Line 1 (`$FFFB00`) is the **character** palette; every zone palette loads at
`v_palette_line_2` = `$FFFB20`. `palette/Green Hill Zone.bin` is exactly **96 bytes** =
three lines. So the S1 `Pal_Base` equivalent is `$FFFB20`, 96 bytes, lines 1–3 in CRAM
terms — **identical geometry to aeon's**, including the line-0 exclusion.

Independent confirmation from Aurora's own side: `src/core/project/profiles/s1.ts:141-143`
composes every zone palette as `Sonic.bin[0..16) → [0..16)` then
`<zone>.bin[0..48) → [16..64)`. Two sources that never consulted each other agree, which is
what makes this a measurement rather than the aeon doc read back.

**Two caveats aeon does not have:**

- **`PaletteCycle` stomps four entries.** `_inc/PaletteCycle.asm:61-63` writes four colours
  into `v_palette_line_3 + $10` (line 3, colours 8–B) every 6 frames in GHZ, and the other
  zones have their own cyclers (`PalCycle_Load`, `sonic.asm:2369, 3031, 3677`). A live push
  to those specific entries will be visibly overwritten. This is a per-zone fact, not a
  global one — the honest UI answer is to push anyway and let the artist see it, not to
  silently mask entries.
- **Persistence differs.** aeon restores ROM colours on a section crossing; S1's `PalLoad`
  only runs at level load (`sonic.asm:1715`), so a pushed palette survives until the next
  level transition or fade. That is *better* for the artist, and the toast copy in
  `editor-methods.ts:250` (*"a rebuild or a section crossing restores ROM colours"*) would
  be wrong for classic.

**Status: mechanism verified from source; end-to-end behaviour NEEDS FOREGROUND RUN**, and
is blocked before that by link 2 (`v_palette_line_2` does not resolve).

---

## 4. Play-from-cursor — the one that needs work across the fence

### The RAM labels

Transcribed from the built `sonic.lst`. `_Variables.asm` itself contains **no literal
addresses** — it is a `ds.b/ds.w/ds.l` chain inside `phase ramaddr($FFFF0000)`
(`_Variables.asm:22`) — so these were read out of the listing rather than counted. A second
pass walked the `ds` chain independently and produced the same values, with the in-file
assert at `_Variables.asm:426` (`v_chunk0collision` must land at `$FFFFFF00`) as the anchor.

| Label | Address | Source |
|---|---|---|
| `v_player` | `$FFD000` | `_Variables.asm:53` (`v_objspace + object_size*0`) |
| `obX` / `obY` | `+8` / `+$C` | `_Constants.asm:219,222` |
| `v_screenposx` / `v_screenposy` | `$FFF700` / `$FFF704` | `_Variables.asm:180-181` (both `ds.l`) |
| `v_screenposx_dup` / `_y_dup` | `$FFFF10` / `$FFFF14` | `_Variables.asm:434-435` — previous-frame copies, and the ones the drawer actually reads |
| `v_fg_scroll_flags_dup` | `$FFFF30` | `_Variables.asm:442` |
| `v_scrshiftx` / `v_scrshifty` | `$FFF73A` / `$FFF73C` | `_Variables.asm:199-200` — *"x-screen shift (new - last) * $100"* |
| `v_fg_xblock` / `v_fg_yblock` | `$FFF74A` / `$FFF74B` | `_Variables.asm:212-213` — redraw parity |
| `v_fg_scroll_flags` | `$FFF754` | `_Variables.asm:221` |
| `f_debugmode` / `v_debuguse` | `$FFFFFA` / `$FFFE08` | `_Variables.asm:477,347` |

Position is **32-bit at obX** (`_Constants.asm:219` says "2-4 bytes"): high word = whole
pixel, low word = subpixel — the same 16.16 layout `build-run.ts:255` already shifts for
aeon. The camera is 16.16 too, stated in the scroll code itself
(`_inc/ScrollHoriz & ScrollVertical.asm:225`, *"shift up a byte (camera position is 16.16
fixed)"*).

### Why a camera poke fails here too — and it fails differently

S1 has the same *class* of mechanism as aeon's tile cache, built out of different parts.

`_inc/ScrollHoriz & ScrollVertical.asm:6-25` — `ScrollHoriz` sets **at most one** redraw flag
per frame, and only on a 16-px boundary crossing:

```
		move.w	(v_screenposx).w,d0			; get updated camera X-position
		andi.w	#$10,d0					; redraw a column of blocks every $10px
		move.b	(v_fg_xblock).w,d1			; get expected state of screen position
		eor.b	d1,d0
		bne.s	.return					; if not, no block boundary was crossed
		…
		bset	#2,(v_fg_scroll_flags).w		; draw a new column at left of screen
```

`_inc/Level Drawing (REV01).asm:53-64` then redraws only the flagged strip. And the camera
cannot move fast on its own: `MoveScreenHoriz` clamps to 16 px/frame
(`SH_MoveCameraRight`, same file line 60: `move.w #16,d0`), while `v_scrshiftx` — literally
*"camera x pos change since last frame"* — feeds every parallax deformation
(`_inc/DeformLayers (REV01).asm:55,65,174,255,…`, 14 read sites).

Worse, the flag test is **parity**, not distance: if the poked camera's bit 4 does not happen
to match `v_fg_xblock`, `bne.s .return` fires and **not even one column is flagged**. And the
drawer does not read the live camera at all — VBlank snapshots it first
(`sonic.asm:840-843`, `movem.l (v_screenposx).w,d0-d7` → `v_screenposx_dup`), and
`LoadTilesAsYouMove` reads the `_dup` copies (`_inc/Level Drawing (REV01).asm:53-54`). So a
poke has to land in two places to be even self-consistent.

So the two naive options both break, in opposite ways:

- **Poke `v_screenposx` too:** the intervening columns never get a flag, so the plane keeps
  the *old* location's blocks. This is the aeon tearing failure, arrived at from a different
  mechanism. **Extent is unmeasured here** — quantifying it would need a running machine.
  **NEEDS FOREGROUND RUN.**
- **Poke only the player and let the camera chase:** the plane stays *correct* (every
  column gets its flag on the way) but the camera crawls at 16 px/frame — a 2,048 px warp is
  ~128 frames ≈ 2.1 s of scrolling with Sonic off-screen. The frame count is arithmetic from
  the 16 px clamp; the *visual* result is **NEEDS FOREGROUND RUN**.

The second option is not a hack — it is **what S1's own debug mode does**.
`_incObj/DebugMode.asm:180-181,254-255` writes `obX(a0)`/`obY(a0)` on the player slot
directly and lets the ordinary scroll routines follow. So there is a zero-engine-change warp
available today, at the cost of a visible scroll-chase. Whether that is acceptable to look at
is a judgement call that needs the machine, not an argument.

### Is there an existing facility that could serve as a mailbox?

Not for warping. What exists:

- `f_debugmode` (`$FFFFFA`) is polled every frame — `_incObj/01 Sonic.asm:15` does
  `jmp (DebugMode).l` when set — so it *is* a live externally-writable switch. But entering
  it only replaces Sonic with a D-pad free-fly (`_incObj/DebugMode.asm:9`), the same shape as
  aeon's debug-fly. It does not move you anywhere.
- `f_levselcheat` / `f_debugcheat` / `f_slomocheat` are build-time-enablable
  (`sonic.asm:420-426`, gated on `CheatsEnabled`, which is `0` in the current tree —
  `sonic.asm:24`). Level select restarts an act; it cannot place you mid-act.
- There is exactly one true self-clearing mailbox in S1 — `v_soundqueue0` at `$FFF00A`
  (`s1.sounddriver.ram.asm:46`, polled at `s1.sounddriver.asm:195`) — and it belongs to the
  sound driver. Co-opting it would mean overloading the one channel that already works.
- `f_restart` (`$FFFE02`, polled at `sonic.asm:3016`) restarts the act. `f_pause` (`$FFF63A`)
  pauses it. Neither places you anywhere.
- There is no RAM location the level loop polls for "go here". The `v_unused*` slots exist
  (`_Variables.asm:196,466-469`) but by definition nothing reads them.

So closing this link means **adding a consumer to s1disasm**. The good news is that the
reseed primitive already exists: `LoadTilesFromStart` (`_inc/Level Drawing (REV01).asm:872`)
reads `v_screenposx` / `v_bgscreenposx` and calls `DrawChunks` to redraw both whole planes —
it is what `sonic.asm:2866` calls to *"fully draw the foreground and background once before
fade-in"*. The parity-reset idiom exists too:
`_inc/LevelSizeLoad & BgScrollSpeed.asm:41` writes `#$1010` into `v_fg_xblock` to *"trigger
v_fg_xblock/v_fg_yblock to immediately draw a new column on start"*. So a mailbox consumer is
roughly: read the request, write `v_player+obX/obY`, rebase `v_screenposx/y` and their `_dup`
copies, clear `v_scrshiftx`/`v_scrshifty`, reset the parity, call `LoadTilesFromStart`, clear
the flag.

One design question belongs to whoever owns s1disasm and should not be answered here.
`DrawChunks` (`_inc/Level Drawing (REV01).asm:908-925`) draws the entire 512-px-wide plane
plus two extra rows, and `LoadTilesFromStart` writes the VDP data port directly — it is only
ever called with the display fading, and it does not fit one VBlank's DMA budget with the
display on. aeon solved the equivalent by consuming at frame top; S1's answer is probably a
display-off window or a multi-frame staged reseed, and that is an engine decision, not an
editor one.

### The build-flavour question

s1disasm does have conditional-assembly switches — `Revision`, `FixBugs`, `CheatsEnabled`
(`sonic.asm:14,20,24`, visible as `=$1` / `=$0` in the listing head) — so a `Debug`-shape
switch is idiomatic there. But there is **no existing DEBUG shape**, no `s1built.debug.bin`,
and `build.lua` takes no flavour argument. aeon's "build the flavour matching the running
ROM" logic (`build-run.ts:136-142`) has nothing to match against on the classic side.

---

## 5. Which two links §2.7 meant

From the measurements: **symbols (2) and play-from-cursor (4)**.

- **Symbols — still open, and the worry was correct but understated.** §2.7 called it
  "unverified"; measured, it is not merely unverified, it is a hard `RpcError` refusal with
  three independent causes, and it *gates the other two links* because Aurora resolves
  everything by symbol.
- **Play-from-cursor — still open, and the worry was correct.** aeon needed an engine-side
  mailbox; S1 needs one too, for a mechanically different but equally real reason, and there
  is no facility to co-opt.
- **Build — a false worry, if it was one.** 600 ms native, no Wine, non-destructive,
  save-in-place already working. Nothing about classic's build was uncertain; only Aurora's
  wiring to it is absent.
- **Live palette — a false worry.** Not only does S1 have the equivalent, it is *strictly
  simpler* (no dirty flag, no ordering hazard) and the geometry is identical, confirmed by
  two independent sources.

---

## 6. What changes where

**Inside Aurora** (all small, all mechanical):

1. Route `build_and_run` and `Build & Run` through `useClassicProjectStore` when a classic
   project is open — `basePath = dir`, `raw = sidecar.config`. (`App.tsx:120`,
   `agent-handler.ts:975`)
2. Make `AEON_REQUIRED_ENV`, the `DEBUG` override and the `FAST` default conditional on the
   project type instead of unconditional. (`build-plan.ts:106,134`, `build-run.ts:142`)
3. Stop deriving `symbolsPath` from the ROM stem when the project declares one.
   (`build-run.ts:231-233`)
4. Write `buildCommand: "lua build.lua"`, `romPath: "s1built.bin"`,
   `symbolsPath: "sonic.lst"` into `.aurora/project.json` — it already round-trips unknown
   keys. (`mapping.ts:11,21`)
5. Generalise the palette push: symbol name and geometry per project type, and **no dirty
   flag on the classic path**. (`core/aether/palette-push.ts:41-42`)
6. Add F7 and the Aether store wiring to `ClassicLevelViewport.tsx` (currently zero Aether
   references anywhere under `components/classic/`).

**Outside Aurora — oracle-next** (required, and it is the gate):

7. Teach `parse_table_row` the AS dialect: split on `|` before tokenising, and parse
   addresses as `u64` masked with the existing `BUS_ADDR_MASK` rather than `u32`.
   (`oracle-core/src/symbols.rs:823`)

**Outside Aurora — s1disasm** (required for link 4 only):

8. Add a warp mailbox consumed by the level loop, rebasing camera + player and calling the
   existing `LoadTilesFromStart`, with the display-timing question answered by that repo.
9. Optionally a `Debug` assembly switch so the mailbox is not in a shipping ROM, matching
   `CheatsEnabled`'s existing pattern.

---

## 7. Recommendation

**Split it. Ship links 1 and 3 as a next-phase parcel now; do not put link 4 in that phase;
and open item 7 with oracle-next before either.**

The argument from the measurements:

Classic's build is the *best* build in the suite for an iteration loop — 600 ms warm against
aeon's 1.3 s, native toolchain, no re-bake step, and a save path that already writes into the
tree the assembler reads. Links 1 and 3 together are the edit→look loop for the one engine
where a whole level can be authored end-to-end in Aurora, and both are Aurora-side wiring on
top of mechanisms that already exist on both ends. That is a real, self-contained parcel.

But it does not run until item 7 lands. Every address links 1 (position restore), 3 and 4
need is a RAM symbol, and every RAM symbol in `sonic.lst` is dropped twice over. The fix is
two expression changes in one function of a repo Aurora must not build, so it is a
*dependency to raise*, not work to schedule. It is small enough to be a conversation rather
than a project, and the payoff is disproportionate — it unblocks three of the four links at
once. Raise it first; the Aurora-side work is worth starting in parallel only because item 7
is small, and it should be gated behind a real `load_symbols` success before anyone calls
the parcel done.

Link 4 does not belong in the same phase. It is the only item requiring new 68000 code in a
repo Aurora does not own, its central question (when it is safe to call
`LoadTilesFromStart`, given `DrawChunks` does not fit a VBlank) is an engine-timing decision
Aurora is not the right party to make, and it is the only link whose failure mode remains
unmeasured because measuring it needs a running machine. Bundling it would make the parcel
depend on someone else's design call.

There *is* a cheap version — write `v_player+obX/obY` the way debug mode already does and
accept the 16 px/frame scroll-chase, no engine change at all — and it is worth trying once
link 2 lands, precisely because it costs an afternoon and might simply be good enough. But
"might be good enough" is not something to plan a phase around before anyone has looked at
it. Ship the loop without play-from-cursor — a 600 ms Build & Run plus live palette is
already the loop the classic spine has never had — try the chase as a spike, and take the
real mailbox as a separate, later ask once s1disasm's owner has ruled on the timing.

---

## 8. What was not measured, and why

- **Cold build time.** The first run of the session also converted the DAC WAV sources; the
  timing wrapper failed on that run (`bc` absent). Warm is reported; cold is **unmeasured**
  and deliberately not estimated.
- **Anything requiring a running emulator.** Per constraint, no `mcp__oracle__*` call was
  made. Specifically **NEEDS FOREGROUND RUN**: (a) `load_symbols` against `sonic.lst` —
  predicted to return `RpcError` from source reading, not observed; (b) the visible extent of
  a bare S1 camera poke, the classic analogue of aeon's 19/1120 nametable words; (c) whether
  a write to `$FFFB20` recolours the running game on the next frame; (d) whether the
  camera-chase warp is acceptable to look at.
- **oracle-next was not built or tested.** Read-only, no `cargo`, per the serialized-pipeline
  rule. The parser behaviour above is a faithful transcription of `parse_table_row`'s
  predicate run over the real file in Python, not a `cargo test` result — a strong
  prediction, and it should be confirmed by that session rather than assumed.
- **s1disasm was not modified.** The only writes were the build's own gitignored artifacts;
  `git status --short` there is unchanged.
