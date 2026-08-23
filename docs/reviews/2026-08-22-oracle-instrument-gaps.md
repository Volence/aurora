# Oracle instrument gaps — what Aurora wants that the bus does not serve (2026-08-22)

A demand-side survey, sorted so that only the last bucket generates work across the fence.
Written under the owner's standing directive that instrument gaps become **named asks with
conditions**, never silent workarounds.

**Headline: the genuinely-new list has ONE item.** Everything else Aurora might have asked for
is either already served, already committed on oracle's own acceptance list, or composable
today out of methods oracle serves. That is the honest result, and it is a good one — it means
the last four weeks of cross-fence work landed.

---

## 0. Provenance — what was read, and where

| | |
|---|---|
| oracle read at | **`e484ace`** (`e484acef0575b20a4bc2d20d82cd72a3a24e92be`), `docs: the Fable-seat ratification has no granting act` |
| read how | `git -C ../oracle show e484ace:<path>` / `git grep … e484ace` — **never through the working path** |
| oracle tree state | clean but for one untracked doc (`docs/2026-08-22-unadjudicated-decision-ledger.md`); nothing in `crates/` was dirty, so the committed revision is the live one |
| Aurora read at | this worktree, branch `docs/oracle-instrument-gaps`, off `250ff26` |
| contract schema | `crates/oracle-aether/tests/contract/bus-protocol.schema.json` @ `e484ace` — oracle records it as `sha256`-identical to `empyrean` `origin/main`'s copy |

**No emulator was run.** This is a source-reading survey; `mcp__oracle__*` was not touched and
no `cargo` was invoked in `../oracle`. Items that can only be settled at runtime are TAGGED in
§5 for the overseer's foreground follow-up.

### 0.1 How oracle's served-method list was derived — three ways, reconciled

The brief warned that a grep-derived method list is only as good as its character class, and
that one lane made the same lowercase-only error twice. **That trap is real and it is
documented on oracle's own side too** (`docs/2026-08-22-acceptance-21-survey.md` §1.2: their
prior derivation used `[a-z0-9_]` and silently dropped `emulator/romReloaded` for its capital
`R`, which made their unserved count off by one *in the direction that hides a method*).

So three derivations were run, differing in more than scope:

| | source | extraction | alphabet | result |
|---|---|---|---|---|
| **D1** | `crates/oracle-aether/src/engine.rs` only | field-anchored `name: *"emulator/…"` inside the `METHODS` table | `[^"]*` — any non-quote byte, so capitals, digits and punctuation all admitted | **40 served** |
| **D2** | the **whole** `crates/oracle-aether/` tree — `src/` + `tests/` + the vendored schema + fixtures | free-floating, no field anchor: `[a-z0-9_]+/[A-Za-z0-9_]+`, run **case-insensitively** | mixed-case both sides of the slash | **65 names** |
| **D3** | the vendored contract schema | **`json.load` + key enumeration — not a regex at all** | n/a (structured parse) | **58 fragments** |

**Named differing parameters** (the brief's test — an agreement that shares every parameter has
not been tested):

- D1 → D2 differ in **file scope** (one file vs the whole crate), in **anchoring** (a struct
  field vs free text), and in **case-sensitivity of the match itself** (`grep -i`).
- D1/D2 → D3 differ in **tool class**: a structured JSON key parse cannot be fooled by a name
  that appears in prose, a doc comment, or a test fixture, and cannot miss one whose spelling
  falls outside a regex's character class.

**Reconciliation, computed rather than eyeballed:**

```
D1  40   D2  65   D3  58
D1 − D2  = ∅          (every served name is mentioned in the tree — trivially true, and checked)
D1 − D3  = ∅          every served method has a schema fragment; nothing served is unschematized
D3 − D2  = ∅          every fragment is mentioned somewhere in the crate
D3 − D1  = 18         schematized but NOT served  ← the acceptance list, §2
D2 − D1  = 25, split exactly:
      18  the unserved fragments above
       3  EVENTS  — emulator/stopped, emulator/resumed, emulator/romReloaded   ← the capital-R trap
       2  test fakes — emulator/does_not_exist, emulator/no_such_thing
       2  legacy-only, NO fragment — emulator/log_tail, emulator/z80_registers
```

The alphabet trap is **reproduced here, not taken on faith**: `emulator/romReloaded` appears in
D2 and would be absent from any `[a-z0-9_]`-classed pass. The two-name residue
(`log_tail`, `z80_registers`) is a real category and is why D3 alone would not have been enough:
those are surfaces the legacy C++ server exposes through MCP that have **no contract fragment at
all**, so serving them needs a change request *before* a handler. They are not in the 18.

**Why the served set is trustworthy at all:** `Engine::dispatch` (`engine.rs:1211-1233`) is
documented and structured as *"the **only** dispatch path"* — it looks the method up in
`METHODS` and refuses anything absent with `-32601`; `initialize` reports `METHODS`' own names
as `capabilities.methods`. Advertised set and implemented set are the same object. `initialize`
itself is exempt structurally (handled before dispatch, absent from the table).

**Served count moved during this survey's window.** Oracle's own survey (§1.3, base `0fa34f1`)
measured **37**; at `e484ace` it is **40** — `a05e34c` served the step trio (`step`, `step_over`,
`step_out`). Their "21 unserved" is now **18**. Any Aurora doc quoting 32, 35 or 37 methods is
stale; do not re-pin the number, ask `initialize`.

### 0.2 What Aurora actually calls today

A census of `emulator/*` across `src/` and `scratchpad/` — 20 distinct methods, so 20 of 40:

```
run_frames 50 · write_memory 43 · resume 29 · pause 26 · status 18 · read_memory 17
reload_rom 15 · lookup_symbol 12 · run_to 9 · restore 9 · hold 8 · load_symbols 7
write_cram 6 (all in comments/tests — never on the wire) · screenshot 1 · registers 1
read_vram 1 · press 1 · checkpoint 1
```

Aurora has **never** called `reset`, any `watchpoint_*`, `read_cram`, `sprites`, `scanlines`,
`pixel_attribution`, `memory_hash` or `state_hash`. Several of the composable-today entries in
§3 are exactly those unused instruments.

---

## 1. satisfied-by-their-in-flight-work — wait, or re-check

### 1.1 Already closed since Aurora last measured — **re-check, do not ask**

Four things Aurora's own docs still describe as open are **served at `e484ace`**. These need an
Aurora-side edit, not oracle work.

| Aurora doc says | Reality at `e484ace` |
|---|---|
| `emulator/write_cram` "is **not served** … `-32601`" (`specs/2026-07-03-aether-client-playtest-design.md` §C2) | **Served.** `METHODS` `engine.rs:353`, `params: [b, g, index, line, r, raw]`, `require_paused` (`:2149`). |
| `emulator/read_cram` unserved (oracle's `2026-08-19-aurora-client-demand.md` item 2) | **Served.** `engine.rs:347`, `params: [line]` — one line's 16 entries or all 64, with a `cramAddr` join key. |
| "`write_memory` … **unknown params are silently ignored**: `{symbol:'Player_1', offset:2}` … reports success and writes to the BASE" (spec §C5; `client.ts:resolveOffset` doc comment) | **Both halves fixed.** Params are closed bus-wide (§2.5/§11.17): `dispatch` calls `unknown_params(spec, params)` and refuses `-32602` **before the handler runs**, so a write refused for a guessed key has written nothing. And `disp` is now a real param — `write_memory` `params: [addr, bytes, disp, symbol, value, width]`, handled by `resolve_displaced_target` (`engine.rs:1474`): `{symbol, disp}` valid, `{addr, disp}` refused as "arithmetic the caller has already done", negative `disp` refused. |
| "a ruling on reject-unknown-params vs an explicit `disp` is **pending**" (spec §C5) | Ruled and shipped — **both**, not either. |

**Action:** `client.ts`'s `resolveOffset` comment and spec §C2/§C5 are now wrong in a way that
would mislead the next reader into believing a live footgun exists. `resolveOffset`'s
*behaviour* stays correct (client-side arithmetic still works, and `read_memory` still has no
`disp` — see §3.5), but the stated reason for it is obsolete. Not filed as an oracle ask.

### 1.2 On oracle's acceptance list — committed, not yet built

The 18 schematized-but-unserved methods are oracle's **acceptance contract**: the definite list
of what the Rust server must serve before it can replace the legacy C++ one. Aurora should not
re-ask for any of them; the useful contribution is naming which ones have an Aurora consumer,
because their own survey found **14 of the 21 had no consumer at all** — a consumer changes
their build order, and that is the whole point of this document.

| Method | Aurora consumer? | Note |
|---|---|---|
| `write_vram` | **Conditionally — see the warning below** | The only route to a live tile/art push; `write_memory` is work-RAM-only and VRAM is not in the 68000 address space at all. |
| `run_to_scanline` | **Plausibly — P5 raster/parallax preview** | Would let Aurora stop the machine mid-frame at the exact line a raster band is supposed to change and compare against its own preview. Not needed for anything shipping. |
| `get_layer_states` / `set_layer_enabled` | **No** — `pixel_attribution` is strictly better for Aurora's purpose (§3.7) | Both fragments were transcribed 2026-08-22; `set_layer_enabled`'s `layer` is deliberately a bare string, not an enum. |
| `breakpoint_add` / `_clear` / `_list`, `wait_for_break` | **No** | CR-A is in flight for the breakpoint surface. `wait_for_break` is contract-deprecated by the `stopped` event, which Aurora already subscribes to. |
| `z80_read` / `z80_write`, `vgm_*`, `audio_spectrum`, `get_channel_states` / `set_channel_enabled` | **No — and Aurora explicitly does not co-sign these** | Seraph's demand, not the editor's. CR-B is in flight. Recorded so their consumer count is not inflated by an editor that has no use for them. |
| `log_clear`, `ping` | No | |

> ### ⚠ `write_vram` — do not ask for this yet. Aurora has not earned the ask.
>
> This is the exact shape of the mistake Aurora already made once and corrected in public.
> On 2026-08-19 Aurora filed `emulator/write_cram` as **BLOCKING**, then withdrew the blocking
> claim the same day after checking what a CRAM write survives on a *running* machine: aeon
> composes `Palette_Buffer` once per frame from a RAM source, so a direct CRAM write is
> overwritten inside the frame it lands in. The live-palette feature turned out to be a
> `write_memory`-to-the-RAM-source story and shipped on a method that already existed. Oracle
> recorded the whole reversal (`docs/2026-08-19-aurora-client-demand.md` §1).
>
> **The identical question is open for VRAM and nobody has answered it.** Oracle's own
> `write_vram` fragment ($comment, transcribed 2026-08-22) registers the same doubt as audit
> D-16: the §6 row is *not* named in the run-control state rule *"though `write_memory` and
> `write_cram` both are, and §11.17's stated reason for naming `write_cram` — a game that
> composes its own state every frame overwrites a direct write inside the frame it lands in —
> is if anything stronger for VRAM."*
>
> aeon streams tile art into VRAM from an act-wide ZX0-paged pool through a camera-driven tile
> cache. Whether a poked tile survives, and for how long, is an **aeon** question, not a bus
> question — precisely as it was for CRAM.
>
> **Condition for this becoming an Aurora demand:** measure, on a running aeon ROM, whether a
> byte written into a plane-A tile's VRAM cells is still there N frames later under (a) a
> stationary camera and (b) a scrolling one. If it survives, this is a demand with a named
> feature behind it (live tile push — edit a tile, see it in the game without a rebuild) and
> Aurora should say so loudly, because it would move `write_vram` up their order. If it does
> not survive, the ask is a RAM-source or engine-mailbox story on aeon's side and the bus owes
> nothing — same as CRAM. **TAGGED for foreground runtime follow-up (§5).**

---

## 2. composable-today — not asks

Aurora can do all of these now with methods oracle already serves. Several would be real
improvements; none of them is work for another lane.

### 2.1 Framebuffer pixels in the reply, no file, no path — use `emulator/scanlines`

`emulator/scanlines` (served, `engine.rs:443`, `params: [count, startLine]`) returns
`rows[]` where each row is `{line, width, rgb}` and `rgb` is `0x` + `RRGGBB` per pixel, left to
right, **shading/highlight already applied**, taken from the retained raster frame when one
exists. It is a **pure read** — no `require_paused`. `{}` defaults to the whole active display
(`startLine` 0, `count` = 224).

Size check: 224 × 320 × 3 = 215,040 bytes → 430,080 hex chars plus per-row JSON, comfortably
under `rpc::MAX_LINE_BYTES` = 1 MiB (`rpc.rs:315`). One call, whole frame, in band.

**And it fixes a live bug in Aurora.** `scratchpad/warp-tearing-harness.mjs:161` does:

```js
const r = await call('emulator/screenshot', {});
const b64 = typeof r === 'string' ? r : (r.png ?? r.data ?? r.image);
if (typeof b64 === 'string') { /* write the PNG */ }
```

Three guesses at a field that does not exist. `screenshot` (`engine.rs:3061`) **writes a file
and returns metadata**: `{path, format, width, height, bytes, source}`, where `path` defaults to
`$TMPDIR/oracle-frame-<frame>.png` when omitted and **`bytes` is the byte COUNT, not the image**.
So the call succeeds, a PNG lands in the temp dir, and the harness silently writes nothing —
a screenshot step that has never captured anything. Either read `r.path` off disk, or switch to
`scanlines` and skip the filesystem entirely.

The `source` field on both methods is load-bearing: `"raster"` = the frame the machine actually
drew (mid-frame palette/scroll effects included); `"stateRender"` = a post-hoc re-render of
current VDP state, which is **structurally blind** to exactly those effects and carries a
`caveat`. A liveness-dependent check must assert `source === "raster"`.

### 2.2 Mailbox acks without a poll loop — use a watchpoint

`warpTo` polls `read_memory` up to **120** times waiting for `Warp_Req_Flag` to clear;
`bootRestoreTo` polls up to 60. Watchpoints are served and Aurora has never used them:
`watchpoint_add` (`engine.rs:305`) takes
`[addr, censusKey, label, len, mode, read, space, stopAfter, symbol, write]` — including a
**`symbol` target** (so no hardcoded address) and **`stopAfter`**, which ends a bounded run and
emits `stopped` with `reason: "watchpoint"` and `watch` naming which one fired
(`emit_run_stop`, `engine.rs` §11.7). `capabilities.watchpoints` advertises
`spaces: [bus, vram, cram, vsram]`, `maxWatches` and `ringCap`. It is not `require_paused`.

So: arm a write-watch on `Warp_Req_Flag` with `stopAfter: 1`, call `run_frames` once with a
generous bound, read the clamped landing, clear the watch. Four round-trips instead of up to
~124, and the stop reason distinguishes "the engine consumed it" from "the deadline expired"
without inferring it from a value.

Caveat to design around, not a blocker: a `stopAfter` watch **stops the machine**, so the
`wasRunning` courtesy still applies and the run must be resumed afterwards on the branch where
Aurora found it running. **TAGGED for foreground follow-up (§5)** — the round-trip saving is
arithmetic, but that the watch fires on the *engine's* clear (rather than on Aurora's own
flag-raising write) should be confirmed against a live server before rewriting `warpTo`.

### 2.3 "Did the reload actually get the ROM I just built?" — use `emulator/memory_hash`

`memory_hash` (served, `engine.rs:437`, `params: [addr, len, symbol]`, a pure read, no pause
gate) fingerprints a byte range with FNV-1a-64 **and** CRC-32. The CRC is IEEE/zlib
(`crc32.rs`), deliberately, *so that a cartridge-window hash equals CRC32 over the same slice of
the ROM file* — oracle verified this against Python's `zlib` (`0xE9FFC9D0`).

This closes a defect class the OVERSEER doc records as having actually bitten:
*"Build the flavour matching the RUNNING ROM (`emulator/status.romPath`), or the reload targets a
file the build never touched"* — the failure where the game comes back byte-identical and the
edit appears to have done nothing under a cheerful "Build succeeded" toast. `build-run.ts`
currently defends against it by *reasoning* about `romPath` and the `.debug.bin` suffix. It
could instead **prove** it: after `reload_rom`, hash the cartridge window and compare against a
CRC32 of the artifact on disk. A mismatch is then a stated fact, not an inference.

### 2.4 Palette read-back and push verification — `emulator/read_cram` (§1.1)

Served now. Aurora's live-palette path writes the RAM source and never confirms what reached
CRAM outside a dedicated harness; `read_cram {line}` gives the palette **as stored**, with a
`cramAddr` join key. The `live-palette-e2e-harness` currently proves the push by reading
`Palette_Buffer` over a second client connection — which is the right discipline (a harness must
not ask the component under test whether it worked) and should stay; `read_cram` is the cheaper
in-app confirmation, not a replacement for the harness.

### 2.5 Symbol + displacement on reads — client arithmetic, deliberately

`write_memory` takes `{symbol, disp}`; `read_memory` and `read` **do not**, and that asymmetry is
deliberate rather than an oversight. `resolve_displaced_target`'s doc comment
(`engine.rs:1471-1473`): *"Kept on this method rather than folded into `resolve_target`,
deliberately: `read`/`read_memory` share that helper and do not declare `disp`, and a helper that
quietly honoured a key those fragments do not carry would put the server back on the wrong side
of the rule above it."*

Aurora reads `Player_1+$02`/`+$06` and the mailbox flags by computed address today, which is
correct, symbol-derived, and contains no literal. **Filing "add `disp` to `read_memory`" would be
padding**: it is pure ergonomics, the workaround is one addition, and it would cost oracle a
contract amendment (fragment first, per §8 item 20) for zero capability.

### 2.6 Live object/entity inspection — `read_memory` + Aurora's own decoder

`capabilities.objectDecoders` is `false`, and `object_list` / `object_slot` / `player_state` /
`call_stack` have **no contract fragment at all** (they are among the eight §6 rows left
unschematized because their results are too loosely stated to transcribe without inventing).

Aurora should not ask for them. It already decodes the SST itself — `build-run.ts` reads
`Player_1 + $02` / `+ $06` and knows they are 16.16 fixed point. The object format is **Aurora's
domain knowledge**; a server-side decoder would be a second copy of it that can drift while both
halves look right, and Aurora would still have to keep its own for the editor. Read the bytes,
decode locally.

### 2.7 "Which layer drew this pixel?" — `emulator/pixel_attribution`, not layer toggles

Served (`engine.rs:359`, `params: [x, y]`): *"why the dot at (x,y) is the colour it is: winner,
cell/sprite, and the losing candidates."* For validating Aurora's priority/occlusion lens against
the running game this is **strictly more** than `get_layer_states`/`set_layer_enabled` would give
— it names the losers, not just which planes were enabled — and it does not mutate the display
mask underneath other clients on a shared bus.

### 2.8 Hosted vs headless — inferable, and currently unexercised

`docs/OVERSEER.md` records that *"`emulator/reset` is off-limits on the hosted build until aeon's
F-HOSTED-RESET-SRM closes — it bypasses the player's `.srm` flush."* Nothing in `initialize`
declares hosted-ness: `serverName` is `"oracle-next"` for both (`engine.rs:177`, the only
assignment in the crate) and the capability flags are identical. The one discriminator is
`limits.maxRunFrames` — `3600` standalone vs `HOSTED_MAX_RUN_FRAMES = 120` (`host.rs:79`).

That is a heuristic on a tunable, and it would lie silently if either number ever changed. It is
recorded here rather than filed **because Aurora never calls `emulator/reset` — 0 occurrences
across `src/` and `scratchpad/`** — so the constraint is presently vacuous and an ask would be
speculative. If Aurora ever puts a reset control on the emulator panel, the ask (advertise the
presentation mode as a capability, not as a number to sniff) becomes real on that day.

---

## 3. genuinely-new — the list is ONE item

### GN-1 — VDP plane geometry readback: plane bases, plane size, and the scroll registers

**What Aurora wants.** A way to ask the running machine where plane A and plane B actually live
in VRAM, how big the planes are, and what the current scroll configuration is. Not the whole
`emulator/read_vdp_registers` row — see the shape note below.

**Why nothing serves it.** `emulator/read_vdp_registers` is a §6 catalog row with:

- **no schema fragment** — it is one of the eight §6 rows deliberately left unschematized,
  because its `decoded{…}` result carries a literal ellipsis and *"a PARTIAL fragment would be
  worse than none"* (schema `description`, `bus-protocol.schema.json:5`);
- **no handler** in the Rust server (absent from `METHODS`, absent from D3's 58);
- **no implementation in the legacy C++ server either** — oracle's own peer-schema answers,
  `docs/2026-08-22-peer-schema-defect-answers.md:791`: *"`emulator/read_vdp_registers` and
  `emulator/read_vsram` are **absent from the legacy server too**."*

So this is not on the acceptance 18 and never has been served anywhere. It is the only Aurora
want in this survey that is genuinely new work.

**The concrete thing it unblocks — a named harness, and a named weakness in it.**
`scratchpad/warp-tearing-harness.mjs` is the measurement that killed the camera-poke design and
justified aeon growing a warp mailbox (699/2048 plane-A words wrong at a 2048px jump; the
mailbox leaves 0). It has two admitted defects, both caused by this gap:

1. **It hardcodes a VDP-derived address.** `:110-113`: `const PLANE_A = 0xC000` with the comment
   *"VRAM $C000 is aeon's plane A base for this build"* — a literal that silently becomes a
   different plane the day aeon moves its VRAM layout. This is precisely what contract D7 exists
   to prevent, and Aurora observes D7 everywhere else. It cannot here: the plane base is VDP
   register `$02`, not a symbol, and while sigil now emits the layout constants into the `.lst`'s
   third `EQU` section, equates are ruled to **never** answer address lookups in either direction
   — so that route is deliberately closed too.
2. **Its cleanliness verdict is weak, and says so.** `:146-150`: the 40×28 window sample
   *"is the view ONLY when plane A's scroll is at the origin. Under scroll the true window is
   elsewhere in the ring, so the window number is a fixed SAMPLE of the plane, not the view. That
   makes it a fine tearing detector (tearing is broad) and weak evidence of cleanliness"* — which
   is exactly what the mailbox result needs it to be. Give the harness the plane base, the plane
   size and the frame's H/V scroll and the sampled window becomes the **actual visible window**:
   the 0-of-1120 result stops being "0 in a fixed sample" and becomes "0 in what the player sees".

Downstream of that harness, the same three facts are what P5 (raster/parallax preview, design #8)
would need to check its preview against ground truth rather than against its own model.

**What is already composable, so the ask stays narrow.** Vertical scroll is available —
`emulator/read {space: "vsram"}` is served (`params: [addr, len, space, symbol]`, spaces
`bus|vram|cram|vsram`). Horizontal per-line scroll lives in a VRAM table Aurora can read with
`read_vram` — *once it knows the table's base*, which is register `$0D`. So three of the four
facts (plane A base `$02`, plane B base `$04`, plane size `$10`, hscroll base `$0D`) are
register reads with no route at all.

**Shape of the ask — narrow, and following their own precedent.** Do **not** ask for
`read_vdp_registers` as catalogued; its `decoded{…}` is why the row is unschematizable and the ask
would stall on that. Ask instead for the geometry, following `emulator/sprites`' precedent, which
already surfaces exactly one decoded VDP register (`satBase`) as a named scalar beside its result
rather than as part of a register dump. Either shape works:

- add the plane fields to an existing served result (a `planeA`/`planeB`/`planeSize`/`hscrollBase`
  block, wherever it belongs), or
- a new narrow row whose result keys are **fully enumerated** — the property that made
  `get_layer_states` schematizable where its neighbours were not.

**Conditions and constraints:**

- **Must work headless.** The harnesses run `oracle-aether <rom>` under `xvfb-run`; nothing here
  may depend on the windowed player.
- **Must not require pausing.** It is a pure read of VDP state, and it belongs with `read`,
  `sprites`, `scanlines` and `pixel_attribution` on the no-`require_paused` side. A pause gate
  would make it unusable for the live-scroll case, which is the case that matters.
- **Must survive `reload_rom`** in the sense that it re-reads the machine — no caching of a
  register value across a reload, since a new ROM reconfigures the VDP. (`romReloaded` already
  drops Aurora's symbol table for the same reason.)
- **Say whether the answer is the retained frame's or right-now's.** Same hazard `scanlines` and
  `screenshot` already solved with `source: "raster" | "stateRender"`: a scroll register read in
  V-Blank has already been rewritten for the next frame, which is the bug that made 6 of 17
  conformance ROMs come back wrong before the framebuffer latch was added. Whatever this returns
  should carry the same discriminant, and Aurora will branch on it.
- **Not urgent.** Nothing Aurora has shipped is blocked. It makes an existing measurement
  trustworthy and removes a hardcoded address; it does not gate a feature.

---

## 4. Pre-registered, deliberately NOT asked

Recorded so the condition is written down rather than rediscovered, per the owner's directive
that gaps become named asks *with conditions*.

**The `require_paused` pause-storm on live palette.** `write_memory` is `require_paused`, so
every palette push is pause → write(s) → resume, and every transition broadcasts
`emulator/stopped` + `emulator/resumed` to **every** subscriber on the bus. Aurora's answer is a
throttle: `MIN_PUSH_INTERVAL_MS = 100` (~10 Hz), at most one push in flight and one queued, the
queued one always carrying the latest colour (`src/renderer/state/aetherStore.ts:22`).

Oracle registered this on 2026-08-19 as *"one new item, recorded but NOT requested"* with two
candidate shapes — relax the pause gate for small bounded writes, or an apply-at-next-frame-
boundary write — and an explicit revival condition. Aurora's own source states the same rule:
*"If it ever looks laggy the fix is a measurement, not a smaller number."*

**It has not looked laggy and no measurement has been taken.** So this is not an ask today.
**Revival condition, unchanged:** an artist reports drag lag, or a measurement shows the 100 ms
coalesce visibly trailing the slider; bring the number, then ask. Filing it now would cost
another lane real work on a hypothesis.

---

## 5. TAGGED for the overseer's foreground runtime follow-up

Nothing in §1–§4 was settled by running the emulator; per the standing invariant, subagents do
not touch `mcp__oracle__*`. Three items would benefit from a foreground check:

1. **Does a poked VRAM tile survive on a running aeon machine?** (§1.2 warning.) This is the
   single question that decides whether `write_vram` is an Aurora demand or a repeat of the
   `write_cram` mistake. Stationary camera and scrolling camera, N frames later.
2. **Does a `stopAfter` write-watch on `Warp_Req_Flag` fire on the engine's clear?** (§2.2.)
   Arithmetic says it replaces ~124 round-trips with 4; confirm the semantics before rewriting
   `warpTo`.
3. **Does `emulator/scanlines {}` return a whole frame in one reply?** (§2.1.) 224 × 320 × 3
   hex-encodes to ~430 KB against a 1 MiB `MAX_LINE_BYTES`, so it should — but the margin is
   under 2.5×, and per-row JSON overhead was estimated, not measured.

---

## 6. Defects observed in passing — reported, not asks

Two small things found while reading, neither of which is a capability gap.

- **`emulator/screenshot`'s advertised summary is stale.** `METHODS` (`engine.rs:377-381`) says
  *"render the active display to a binary **PPM** file"*, but the handler encodes **PNG** and
  returns `format: "png"` (`engine.rs:3061-3100`), with its own comment explaining the switch:
  *"PNG, not the PPM this wrote before."* The summary string is not dead prose — it ships over
  the wire in `initialize`'s `methodSummaries`, so a client reading the advertised surface is
  told the wrong format. Worth a one-word fix on oracle's side. **Aurora side:** the
  `warp-tearing-harness` screenshot step is broken independently (§2.1) and should be fixed here.
- **`docs/OVERSEER.md`'s `require_paused` list is incomplete.** It names
  `write_memory, reload_rom, run_frames, run_to, press, play_input`. At `e484ace` the full set is
  those six **plus `step`, `step_over`, `step_out` and `write_cram`** (`engine.rs:1671, 1698,
  1787, 1822, 1842, 1935, 2149, 3103, 3161, 3526`). The "NOT paused" half is confirmed correct:
  `read_memory`, `read`, `sprites`, `scanlines`, `pixel_attribution`, `memory_hash` and
  `state_hash` are all pure reads, and `reset` is deliberately not gated. Not edited here —
  `OVERSEER.md` is being edited concurrently by other lanes; flagged for the overseer to apply.

---

## 7. Bucket counts

| bucket | count |
|---|---|
| satisfied-by-their-in-flight-work | **10** — 4 already-closed re-checks (§1.1) + 6 acceptance-list rows with an Aurora-relevant verdict (§1.2) |
| composable-today | **8** (§2.1–§2.8) |
| **genuinely-new** | **1** (GN-1) |
| pre-registered, not asked | 1 (§4) |
| defects reported | 2 (§6) |
