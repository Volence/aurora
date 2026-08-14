# How a zone actually gets built

**Research, 2026-08-15.** Answers the open design question left by
`docs/superpowers/plans/2026-08-14-plan6-handoff.md` §4: *do people draw a tile, compose it
into a block, compose that into a chunk — or draw a chunk and reuse downward?*

Four independent strands: SonLVL's source, SonED2's manual, community first-hand accounts,
and a fresh measurement of Sonic 1's shipped data. Every claim below is marked **MEASURED**
(our probe), **OBSERVED** (someone describing what they did), **SOURCE** (read from a tool's
code/docs) or **INFERRED**. The handoff asked for this to be grounded rather than inferred
again — one inference in this area was already measured wrong, so the marks matter.

---

## 1. The answer, in one paragraph

**Neither. It is two different activities at two different tiers, and the ladder is only
walked in one direction at each.** Pixel art does not originate in the level editor — it
arrives as a *sheet*, top-down, and the tool cuts it into chunks→blocks→tiles automatically
with flip-aware deduplication. What people then do *by hand*, continuously, is compose and
edit at the **block** tier: placing and copying blocks inside the chunk editor, adjusting
flip/palette/collision. The handoff's "clone the nearest thing and diverge" hypothesis is
**half right and mis-tiered**: it is real, it is the dominant hand-editing loop, but it lives
at the **block** tier, and what usually diverges is **flags — flip, palette, collision — not
pixels**. At the chunk tier it does not happen at all.

## 2. Chunk-tier clone-and-diverge does not happen — MEASURED

Probe: `scratchpad/variant-families.mjs` (read-only; reads real s1disasm data through the
same `s1Adapter` the app uses). For every *placed* chunk in six zones, the distance to its
nearest other placed chunk, counted over the 256 block cells.

| zone | placed chunks | nearest-neighbour ≤8 of 256 cells | identical | min NN distance |
|---|---|---|---|---|
| ghz | 43 | **0** | 0 | 33–64 |
| mz | 43 | **0** | 0 | 33–64 |
| syz | 49 | **0** | 0 | 33–64 |
| lz | 43 | **0** | 0 | 17–32 |
| slz | 36 | **0** | 2 | identical, then 9–16 |
| sbz | 48 | **0** | 0 | 33–64 |

**Across 262 placed chunks there is not one near-duplicate.** Every chunk is a distinct
composition; the closest non-identical pair in the entire game differs in 9 of 256 cells, and
the typical nearest neighbour differs in a third of the chunk. If clone-and-diverge had
produced this data at the chunk tier, this table would be full of 1–4s. It is empty.

Corroborating, independently: no community source describes duplicating a whole chunk and
tweaking it — searched across the SonLVL thread, SFGHQ, Sonic Retro and the SCHG how-tos
(**ABSENT**, with one caveat: romhacking.net thread 24253 stayed CAPTCHA-blocked). And
SonLVL's importer checks new art against *all* existing tiles/blocks/chunks, so near-identical
chunks would be collapsed on the way in anyway — MainMemory, SonLVL's author, on the change
that made it so: *"All existing tiles/blocks/chunks are checked for duplicates, instead of
only the ones that have been imported so far"* (**OBSERVED**,
[sonicresearch.org SonLVL thread p6](https://sonicresearch.org/community/index.php?threads/sonlvl.2217/page-6)).

## 3. The block tier is where variants live — MEASURED

The same probe, one tier down. (An earlier revision of this probe compared `xflip`/`palette`
against a model that names those fields `xf`/`pal`; the comparison was silently inert and
inflated "identical" by ~6×. The table below is the corrected run, and the probe now prints a
sanity line proving the flag fields are actually non-zero.)

| zone | used blocks | differ ONLY in flip/pal/priority | differ in exactly 1 of 4 cells | art-identical |
|---|---|---|---|---|
| ghz | 397 | 86 | 45 | 16 (4%) |
| mz | 297 | 4 | 63 | 10 (3%) |
| syz | 404 | 34 | 94 | 4 (1%) |
| lz | 193 | 0 | 20 | 0 |
| slz | 338 | 65 | 64 | 6 (2%) |
| sbz | 562 | **133** | **138** | 6 (1%) |

Two things at once. **Variant families are everywhere at this tier** — in SBZ, 133 used
blocks are the same four tiles as another block with different flip/palette/priority bits,
and 138 more differ in a single one of their four cells. **And yet exact-art duplicates are
rare (0–4%)** — the block pool is close to deduplicated. That combination is the signature of
*reuse-by-reference with divergence in the flags*, not of copy-paste-and-forget.

**Collision is a real divergence axis, not an afterthought.** Of GHZ's 16 art-identical
blocks, **8 differ only in their collision index** — same pixels, different solidity. (MZ: 2.
Elsewhere: 0.) So "I need this block but it should collide differently" is a thing the
shipped data does.

## 4. What the community actually says — OBSERVED

The single most on-point account found, and it lands exactly on the tier the measurement
points at. **Pacca**, on SonLVL's chunk editor:

> "When placing blocks in the chunk editor, the settings for x/y flip and collision rarely
> carry over to newly placed blocks, which is painful to say the least. The copied blocks
> often have completely blank settings, or seemingly random settings, and rarely copy over
> exactly as they should."
> — [sonicresearch.org SonLVL thread p6](https://sonicresearch.org/community/index.php?threads/sonlvl.2217/page-6)

That is a named user describing **block copy/paste inside the chunk editor as routine work**,
and naming **flip + collision** — precisely the two axes the measurement says variants diverge
along — as the thing that breaks. Independent method, same conclusion.

## 5. Art arrives as a sheet — OBSERVED + SOURCE

- The "Empty Sonic 1 + Art Importing Guide" workflow: build a spritesheet in an external paint
  program sized to multiples of 128px (chunk) or 16px (block), reduce to 4bpp, **"delete all of
  the chunks/blocks/tiles"** for the target level, then import the sheet into SonLVL's
  Art→Chunks, which cuts it into the three tiers automatically
  ([SFGHQ thread 254](https://sonicfangameshq.com/forums/threads/empty-sonic-1-disassembly-art-importing-guide.254/)).
  A whole disassembly exists whose premise is "strip the art so you can drop in a mockup".
- SonED2's importer takes a layout-sized image and auto-creates chunks, blocks *and* tiles,
  detecting mirrored/flipped matches and storing a flipped reference instead of a duplicate
  ([SonED2 Art Importing](http://www.headcannon.com/hchc/SonED/Docs/Art%20Importing.html)).
- SonLVL's *only* built-in pixel editor is `DrawTileDialog` — **Pencil and Fill, on one 8×8
  tile**. Import exists at every tier, for PNG/BMP/JPG/GIF. The "YY-CHR" menu item is not a
  launcher; it exports a YY-CHR palette file.

**In-editor pixel editing is touch-up, not origination.** That is a vote of confidence in step
H1's scope (classic's Tile tier onto the shared pixel substrate) as the *right size* of
investment — and a warning against growing it further at the expense of the import path.

## 6. What every other editor does — SOURCE

| | shared-edit default | make-unique gesture | usage count shown | pre-edit warning |
|---|---|---|---|---|
| Aseprite tilemaps | mode-dependent | (automatic, by mode) | no | no |
| Tiled templates | propagates live | right-click → **Detach** | no | no |
| Godot resources | propagates live | **Make Unique** / `local_to_scene` | no | no |
| Unity prefabs | propagates live | **Unpack** / Prefab Variant | no | no |
| Lunar Magic Map16 | propagates live (ROM-wide) | none built in (UNVERIFIED) | no | no |
| SonLVL | propagates live | `Duplicate` is **index-shallow**; `Deep Copy` bundles children | **yes** (Usage Counts dialog) | no |

Recurring conventions worth inheriting: divergence is **always an explicit, one-way gesture**,
named in ownership language (*Detach*, *Unpack*, *Make Unique* — never "fork"), and it lives on
the **instance**, in a context menu, not on the shared source.

And the conspicuous absence: **nobody shows a live reference count at the point of edit, and
nobody scales friction to fan-out.** Aurora already does the first — the composer dock surfaces
usage counts and a shared-edit warning today. That is not table stakes; it is ahead of the
field, and it is exactly the signal a fork decision needs.

### Aseprite's contract, which is the one worth stealing — SOURCE

Aseprite solved this with a sticky three-way mode rather than a per-edit prompt
(`src/app/tileset_mode.h`, `src/app/util/cel_ops.cpp:575-896`):

- **Manual** — always mutate in place, propagate to every user.
- **Auto** (the default) — recompute a sprite-wide reference histogram per stroke; if the
  content already matches an existing tile, reuse it; **else if this cell is the only user,
  mutate in place; else mint a new tile and repoint just this cell**; then garbage-collect any
  tile whose count fell to zero, via an atomic index remap.
- **Stack** — always mint.

The whole stroke — mint, repoint, GC — is **one undo transaction**
(`tool_loop_impl.cpp:464,477,707,837`). Note how well that sits with the locked decision in
[[aeon-approach-over-classic]] that classic keeps *one gesture = one command*: Auto mode is
compatible with it, staged copy-on-write is not.

## 7. What this means for Aurora

Ranked, with the evidence each rests on.

1. **Build the guided divergence flow at the BLOCK tier, and nowhere else.** Both the
   measurement (§3) and the only first-hand account (§4) put the whole variant story there.
   The tile tier does not need it (65% of tiles are used by exactly one block — already
   measured, see [[s1-art-sharing-is-block-tier]]) and the chunk tier has no variants at all
   (§2). This also settles where *not* to spend: the affordance is currently most visible at
   the tile tier, which is the tier that needs it least.
2. **Adopt Aseprite's Auto rule at the block tier: mutate iff this block is referenced by
   exactly one chunk cell, else clone-and-repoint, in one undo entry.** It is affordable but
   not free — measured, blocks referenced by exactly one cell are only 7–33% of used blocks
   (ghz 10%, sbz 33%, lz 7%), so **67–93% of block edits would fork**. Block headroom is
   422–828 free slots of 1024 (sbz tightest at 602 used). So: auto-fork, but ship a **pool
   budget readout** next to it. Do the content-match dedup check *before* minting, and make it
   flip/palette-aware — the format has the bits and the shipped data leans on them hard (§3).
3. **Make flip, palette and collision carry when a block is placed or copied.** This is
   Pacca's exact complaint (§4) and it is the highest-value small fix in the whole report.
   Worth auditing Aurora's own chunk editor for the same defect before assuming we are clean.
4. **Collision deserves to be a first-class divergence axis** — "same art, different
   collision" is a real pattern in the shipped data (§3), and it is the friction Pacca names.
   This is *evidence for* restoring the `collision` facet to `S1_FACETS` (currently a one-line
   reversal, dropped pending the classic collision editor), and it gives that deferred feature
   a concrete first job: duplicate-block-with-new-collision.
5. **The sheet importer is the real gap.** §5 says the dominant art-entry path is import-a-
   sheet-and-cut-it, with flip-aware dedup. Aurora has no such path for level art:
   `src/renderer/components/ChunkSheetImporter.tsx` is a gutted stub that renders "this feature
   will be available in a future update", is **mounted nowhere**, and carries a stale TODO
   claiming the tile→block→chunk hierarchy "no longer exists" (true for aeon, false for
   classic). Either build it or delete the stub; leaving it is worse than both.
6. **Keep the usage counts. They are a differentiator.** No surveyed editor shows them (§6).

### The `artTiers` decision

The handoff flagged `artTiers` (`core/project/adapter.ts:110`) as tested scaffolding with zero
production consumers, built for a breadcrumb H's rescoping rejected, and said the workflow
answer should either give it a job or retire it — a decision, not a cleanup.

**Recommendation: keep it, and give it recommendation 2 as its job.** A refcount-driven
fork-vs-mutate policy has to ask, per tier, *does editing here propagate to placements?* —
which is exactly what `ArtTier.shared` already expresses, and exactly the axis along which the
three tiers differ (tile: mostly safe; block: dangerous; chunk: positional). That is a real
consumer, in the one piece of work this research says to do next. If recommendation 2 is not
taken, `artTiers` has no job and should go.

## 8. Limits of this evidence

- §2/§3 measure **Sega's shipped data**, made in 1991 with Sega's internal tools. They are
  strong evidence about *the artifact our users edit* and about whether a "find the nearest
  thing" affordance would have anything to bite on. They are **not** direct evidence of how
  hackers work today; §4/§5 carry that load, and §4 rests on a single first-hand account.
- The chunk-tier "no clone-and-diverge" finding is about *authoring new content resembling old
  content*. It does not rule out a hacker cloning a chunk for other reasons.
- romhacking.net thread 24253 was never readable (CAPTCHA), and SFGHQ thread 363's replies
  could not be rendered. Plausible homes for a contrary account.
- Incidental, unverified, worth a look: `model.ts` declares `MAX_CHUNKS = 256` ("chunk ids are
  one byte"), but the layout masks bit 7 as S1's loop flag in both `usage-index.ts` and the
  viewport, which would make **127** the addressable ceiling. All six zones ship exactly 82
  chunks, so nothing is near either bound — but the two numbers disagree.

## 9. Reproducing

Both probes are read-only and live in `scratchpad/` (untracked, as the other harnesses are):

- `variant-families.mjs` — nearest-neighbour distances at all three tiers, art-identical block
  families split by collision, plus the sanity line that proves the flag comparisons are live.
- `pool-headroom.mjs` — pool sizes vs format caps, and the used-exactly-once fractions that
  recommendation 2's cost estimate rests on.
