# Ruling — `editor_bg_override.json` ownership, and the loss that already happened

*Ruled 2026-08-22. Closes the per-key ownership fork parked when the parallax/raster arc
was greenlit — the one where last-writer-wins was explicitly rejected and two overseers
each refused to settle it unilaterally. Decided by a dispatched decision agent; **every
load-bearing fact below re-verified firsthand by the Aurora overseer before banking**
(§6). The agent was told not to defer to the dispatching overseer's view, and it
disagreed with it on the central point — see §4.*

## 1. The collision already fired, a month ago, and destroyed real work

Not a hypothetical to be weighed. `aeon/games/sonic4/data/editor_bg_override.json`:

| rev | date | keys |
|---|---|---|
| `b76576ea` | 2026-06-28 | `layout`, `tiles`, **`anims`** |
| `b0e5a661` | 2026-07-09 | `layout`, `tiles`, **`anims`** |
| `dd93a840` | 2026-07-21 | `layout`, `tiles` |

`b0e5a661` carried **two bands** — `(32×4, camera_x, slot_base 0, n=128)` and
`(16×4, timer, slot_base 128, n=64)`, 8 phases each, **192 animated slots of 340 tiles**.
`dd93a840` is the commit that **introduced `tools/png_to_bg_override.py`** and ran it.
Both bands vanish there, and `games/sonic4/data/generated/ojz/act1/bg_anim.emp` has read
`BgAnim_Table: u16 = 0 // band_count = 0 (disabled)` ever since.

**OJZ background animation has been dead in the ROM since 2026-07-21 and nobody noticed.**
In `--stat` the loss reads `editor_bg_override.json | 2 +-` — one line, because the JSON
is minified.

So the premise every prior pass carried — *"no act authors bands yet, which is why the
collision has never fired"* — **inverts cause and effect. No act authors bands BECAUSE
the collision fired.**

> ⚠ **Correction to the ruling as delivered:** it says "thirteen months" twice. It is
> **one month and one day** (2026-07-21 → 2026-08-22). The finding is unaffected; the
> number was wrong and is not repeated. Recorded because a wrong figure travels further
> than the reasoning around it.

## 2. There are THREE writers, not two — bar 12, again

`aeon/tools/forest_bg_gen.py:420-431` is tracked on master, writes the same path
(`BG_OUT` env override, default = the file), and does
`json.dump({"layout":…,"tiles":…,"anims":[…two bands…]}, open(OUT,'w'))` — fresh dict, no
read, destroying `palette`/`palette_line` in the **other** direction. It is the tool that
authored the bands `dd93a840` deleted. Not called by `build.sh` or
`regenerate-level.sh`; committed user WIP.

This is **bar 12 verbatim**: the enumeration counted the tools that *define* the format
(the PNG converter, the injector) and missed the one that merely *touches* the data. Any
fix landing on `png_to_bg_override.py` alone leaves a loaded gun in the same directory.

## 3. The decisive mechanical fact: `anims`, `tiles` and `layout` are not separable

Measured on `b0e5a661` and re-verified here:

```
len(tiles) = 340
band0 slot_base=0   n=128  tiles[0:128]   == phases[0]  ->  True
band1 slot_base=128 n=64   tiles[128:192] == phases[0]  ->  True
animated slots = 192
```

`inject_editor_bg.py:92-93` asserts `slot_base == slot_cursor` from a cursor starting at
0 — *"bands must pack contiguously from slot 0"* — so a band **cannot** be placed anywhere
but the front of the tile blob. `:126` and `:169-171` land bands and layout in the same
VRAM region. Bands DMA over the first Σn slots at runtime; `phases[0]` is those slots'
rest state.

**Consequence: adding or removing a band renumbers the entire static tile blob and
rewrites the layout.** It must be ONE automatic, single-undo command — already named in
Aurora's piece-D design as the main correctness risk there.

**This kills candidate (b)** (move `anims` to its own Aurora-owned file): it would split a
*body* across two files joined by a slot-numbering invariant no gate checks. The sidecar
precedent does not extend, and the reason is exact — that precedent works because a
`sceneRef` is a **pointer**; `phases` is a **body**, entangled with the other file's
contents.

## 4. Where the ruling overturned the dispatching overseer

I had told aeon that refusal was *"the floor, and becomes merge in one edit if the owner
rules shared ownership."* **That is wrong, and the ruling is right to reject it.**

A read-modify-write `png_to_bg_override.py` that preserved `anims` while regenerating
`layout`/`tiles` from a new PNG would pass **every assert in `inject_editor_bg.py`** —
bands still pack from slot 0, `len(tiles) ≤ 448`, 8 phases, `pattern_px == cols*8` — bake
cleanly, and ship a ROM in which retained bands DMA old phase art over whatever the new
PNG's dedup happened to place in slots 0..191. **Silent visual corruption that clears
every gate**, which is *strictly worse* than the deletion it replaces: deletion loses work
recoverable from git; a passing-but-corrupt bake teaches you to distrust the engine.

A correct merge is not one edit. It requires the converter to reserve slots `[0, Σn)`,
exclude them from dedup, and re-derive the layout around a band rectangle it has no model
of — i.e. to become the editor.

**So refusal is the TERMINAL answer for this tool, not neutrality-preserving fence-sitting.**
aeon reached the right line; the justification is stronger than either overseer gave it.

## 5. The ruling

**The question is malformed as a per-key question.** Given §3 there is no key-level cut
that survives contact with the slot allocation. Ownership is **per-document**.

1. **`editor_bg_override.json` has one writer of record: Aurora.** It writes `layout`,
   `tiles` and `anims` as one co-authored unit and round-trips `palette`/`palette_line`
   unmodified.
2. **`png_to_bg_override.py` is reclassified from *writer* to *importer/seeder*.** It may
   write when the file is absent, or contains **only** keys it produces. On `anims`,
   legacy `anim`, or any key it does not produce it **stops**, naming the key, the fact
   that bands own slots `[0, Σn)` which the import would renumber, and the two ways
   forward.
3. **Add `--out`** so refusal is not a dead end — otherwise someone deletes the bands to
   get past it. (`forest_bg_gen.py` already has the equivalent via `BG_OUT`.)
4. **`forest_bg_gen.py` gets the same refusal, or is deleted.** The ruling leans delete
   (art superseded, recoverable from `b0e5a661`) but flags that as an **art judgement
   belonging to the owner**. Not "left alone."

This is candidate (c) — sole writer, other tool feeds it — with a manual feed, which is
right for something run a handful of times a year.

**Amendment to the half aeon called uncontroversial:** preserving `palette` is *not*
unconditionally safe. Lock mode quantises against `GEN_PALETTE` (`:75`), which
`ojz_strip_gen.py:2032` re-copies every build. A retained `palette` restamps colours the
new art was never quantised against — same silent-wrongness class, opposite direction.
Preservation must **assert the retained words equal `GEN_PALETTE`'s slice for
`palette_line`, and refuse on mismatch**. `palette_line` alone is safe unconditionally.

**The fork was already answered in the contract and three sessions failed to cite it.**
`empyrean/docs/AURORA_EFFECTS_SCHEMA.md` §6 hazard 1: *"The general rule for **every
wave-1 writer**: round-trip what you do not understand, or refuse the file — never
silently drop keys from documents this contract owns."* `editor_bg_override.json` is
surface 4 of the four documents that contract owns. `png_to_bg_override.py` is a writer of
it and does neither permitted thing. §3 selects "refuse" from that pair. **Ruling 2 is not
new policy; it is the existing contract applied to a writer nobody noticed was in scope.**

## 6. Verified firsthand before banking

- File history and per-revision key sets — **reproduced exactly** as tabulated in §1.
- Band geometry, drivers, slot bases, phase counts at `b0e5a661` — **reproduced**.
- `tiles[0:128] == phases[0]` and `tiles[128:192] == phases[0]` — **both True**, computed
  here, not quoted.
- `dd93a840` introduces `tools/png_to_bg_override.py` (+182 lines) and touches
  `editor_bg_override.json` by one line — **confirmed in `--stat`**.
- `bg_anim.emp` today: `BgAnim_Table: u16 = 0 // band_count = 0 (disabled)` — **confirmed**.
- `forest_bg_gen.py` exists, writes the path via `BG_OUT`, dumps `anims`, and is **not**
  referenced by `build.sh` or `regenerate-level.sh` — **confirmed**.
- The "thirteen months" figure — **refuted**, see §1's correction.

## 7. Sequencing — this REVERSES the Aurora overseer's own call

ROADMAP item 14 booked *"BgAnim is NOT the next cut"* because the road crossed a parked
call. **The call is now made, so that reasoning lapses.** Ratified against myself:

**Aurora's BgAnim band-authoring parcel can be cut now.** Under sole-writer-Aurora,
nothing Aurora writes is wrong in the absence of the aeon fix; the exposure is entirely to
**a third party running an aeon tool afterward**.

**One hard gate, precise and checkable:** the refusal (rulings 2 and 4) must be on aeon
master **before the first commit carrying a non-empty `anims` lands there** — not before
the parcel is cut, not before Aurora's code is written. A precondition, not a blocking
dependency.

**Interim constraint to state in the parcel** (and worth keeping after the fix, as the
reason the refusal exists): until the refusal lands, `png_to_bg_override.py` and
`forest_bg_gen.py` must not be run against an act whose override file carries `anims`.

Whether BgAnim or the scene road goes next is now an ordinary sequencing call on other
grounds, not a blocked one.

## 8. Actions by repo

| Action | Owner |
|---|---|
| `png_to_bg_override.py`: read the file; refuse loudly on `anims`/`anim`/unknown keys; preserve `palette`/`palette_line` **with the `GEN_PALETTE` assert**; add `--out` | **aeon** |
| `forest_bg_gen.py`: same refusal, or delete (art judgement → owner) | **aeon** |
| A test that **plants** an `anims` key and asserts **refusal** — not that it "handles" it | **aeon** |
| Coherence gate in `test_bg_emit.py`: `Σ(band tiles) ≤ len(tiles)`, and `phases[0] == tiles[slot_base:slot_base+n]` per band, against the real data file (it currently has **no** assertion touching `anims`, `slot_base`, or band/tile coherence) | **aeon** |
| Fix §5's `tiles + animated slots ≤ 448` to the **prefix** rule; record the writer-of-record ruling for surface 4; state that §6's refuse-or-round-trip binds aeon-side writers too | **empyrean** |
| Piece D as whole-file writer of all four keys; band add/remove as ONE undoable command that renumbers the blob and rewrites the layout | **aurora** |

## 9. Tagged for a foreground pass (agents cannot; not attempted)

1. **The corruption claim in §4** is ruled from the emitter's code path — that a naive
   merge bakes and boots into visible garbage rather than failing. Confirming it needs a
   build and a run. **The ruling does not depend on it** (refusal is correct either way,
   and a loud build failure would only strengthen the case against merge), but the
   corruption framing is the ruling's strongest argument and should be checked before
   being quoted onward.
2. **Restoring the lost bands.** `b0e5a661`'s two are recoverable from git, and restoring
   them would incidentally discharge aeon's byte-unproven animated arm before Aurora
   writes a line. **Not an obvious win:** they were built for the colonnade art
   `dd93a840` deliberately replaced, so they need re-fitting to the Deep Forest blob — and
   whether that art loss was intended is **the owner's call**, not one to assume.
3. **Reproducibility spot-check:** re-run `png_to_bg_override.py` on
   `bg_src/ojz_forest_flowers.png` and confirm it reproduces the checked-in file
   byte-for-byte. If not, the importer path has a second drift problem and rulings 2–3
   need re-pricing.
