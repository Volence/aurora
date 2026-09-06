# A vertical band scrolls UP on screen — measured, not derived

**2026-09-06 · aurora · foreground overseer pass, no branch**
**Verdict: UP, cleanly.** `rig/verdict.py` exit 0.

Closes the last open link in a sentence Aurora paints for an author. The rig is
`docs/reviews/2026-09-06-vertical-onscreen-rig.md`; this is the run.

## 1. What was open, precisely

Aurora's panel says a vertical tile animation **scrolls UP**. Two hops sit under
that word, and only the first had ever been measured:

1. **The engine rolls the art up in the band's own row order inside VRAM** —
   confirmed by aeon's `bganim_vprobe_witness.py` at aeon `f0aebbd3`.
2. **That row order reaches a viewer as a screen row** — never measured, because
   aeon's probe deliberately aims at a reserved VRAM run **no plane cell
   references**; their file says "there is nothing on screen to look at."

For the *horizontal* word this second hop came free: the band measured in August
was already on screen. **The two axes were asymmetric in their evidence and
nothing in the source said so** until the flag was re-pointed at the rig parcel.

## 2. How it was run

**A private headless instance, spawned by this pass** — never an attach, so the
owner's window was never a candidate. Checked first, per the standing hazard: every
`oracle_mcp.py` on the box has a child `oracle-aether` on its own `mkdtemp` socket,
so no shim was in the attach arrangement. This pass did not use the shim at all; it
spawned `oracle-aether` directly on a private socket and spoke JSON-RPC to it.

- Server identity read from the handshake, not assumed: `implementation: oracle-rs`,
  `serverBuild.id 0d6180c1…+profile=release`, `dirty: false`, **61 methods**.
- `romPath` read back as the rig ROM, so the machine under test is the one intended.
- Driver committed at `scratchpad/vertical-watched-drive.py`, **taking its paths as
  arguments rather than literals** — the rig ROM lives in a throwaway copy that gets
  deleted, so a committed literal would point at nothing, and a sibling path in an
  executable line is refused by `check-peer-path-literals.mjs`. **That gate refused this
  parcel's first push and was right to**; the paths this run used are provenance and
  belong here, which is the comment tier the gate exempts:
  ROM `<suite root>/aeon-vrig-onscreen/s4.debug.bin`, server
  `<suite root>/oracle/target/release/oracle-aether`.
- Raw captures at `docs/captures/2026-09-06-vertical-watched/captures.json`.

⚠ **The 68000 bus is 24 bits and the first run failed on that**, not on anything
about the subject: `0xFFFFA730` was refused with `the 68000 bus is 24 bits wide`.
Recorded because the refusal is a good one — it named the cause instead of reading
a wrapped address and returning plausible bytes.

## 3. The preconditions, all four checked before the question was asked

| check | expected | read |
|---|---|---|
| `Camera_Y` high word | 144 | **144** |
| `Parallax_Current_Vscroll_BG` | 0 | **0** |
| nametable `$E000` / `$E080` / `$E100` | `4400…4407` / `4408…440F` / `4410…4417` | **exact match** |
| `BgAnim_Table_Ptr` after START+C | `$00029402` | **`0x00029402`** |

**The third row is half the answer on its own.** It is the plane actually pointing
at the band's slots in the painted order — i.e. the band is *on screen*, which is
the whole difference between this pass and aeon's.

## 4. The result

Four captures at steps **16, 26, 35, 45**, ~40 frames apart:

| capture | step | UP | DOWN | separating |
|---|---|---|---|---|
| cap1 | 16 | **64/64** | 0/64 | partial (`UDC-`) |
| cap2 | 26 | **64/64** | 0/64 | **full (`UDCB`)** |
| cap3 | 35 | **64/64** | 0/64 | partial (`UD-B`) |
| cap4 | 45 | **64/64** | 0/64 | **full (`UDCB`)** |

**Control slots at `$8800` byte-stable across all four captures**, which is what
separates *the band stepped* from *the picture reloaded*.

## 5. ⚠ Two of the four captures do not separate, and the rig said so

This is the part worth keeping. At a step that is **its own mirror under the coarse
rotation**, UP and DOWN produce the *same bytes* — so a run sampled only there
reports UP correctly and proves nothing. **"UP is not DOWN" was never a sufficient
sampling bar.** The rig flags each step on three byte-derived axes and refuses a run
containing no fully-separating sample. Two of mine were full; the verdict rests on
those, and the report names the other two rather than counting them.

I did not choose the steps — they fell out of a fixed frame cadence. **The run was
green on a bar it could have failed.**

## 6. What this does NOT establish

- **Nothing about a released ROM.** The rig band carries `default_off`, so the plain
  shape animates nothing. This says what the engine does, not what ships.
- **No human has looked at it.** The claim is about bytes at a plane's slots, not
  about whether the motion reads as pleasant or correct to an eye.
- **The ROM's toolchain provenance is weaker than its result.** `SIGIL_BUILD` /
  `SIGIL_EMIT` were absent from the building agent's environment and were resolved
  from aeon's documented paths. The expectation table is cross-checked against
  *generated data* rather than the ROM image, so the predictions stand independently;
  the ROM's standing as a reproducible artifact does not.
- **One act, one geometry** (8×8, `pattern_px` 64, one band). Nothing here claims a
  different band shape rolls the same way.
