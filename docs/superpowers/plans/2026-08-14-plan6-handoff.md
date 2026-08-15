# Plan 6 handoff — step H done, and the question that reopened

**Written 2026-08-14 at session end.** Branch `feature/ux-stage4-plan6-art`, worktree
`.claude/worktrees/ux-plan6`, HEAD `884b189`. **Nothing merged, nothing pushed.**
`master` is `2f1db2b` and has not moved.

Baseline at HEAD: `npx tsc --noEmit` clean, `npx vitest run` = **2253 passed / 0 failed
/ 3 skipped**, `npx electron-vite build` clean.

## Start here next session

**The owner chose to start with RESEARCH**, not with more code. See §4. The two bug
fixes (§3) and piece C (§5) are queued behind it deliberately.

---

## 1. What step H delivered

Plan: `2026-08-14-ux-overhaul-stage4-plan6-art-convergence.md`. 15 commits.

**H was deliberately re-scoped away from the spec.** Spec §3.5 called for one shared Art
facet ("the substrate is aeon's, classic contributes navigation"). That does not fit:
**only one of classic's three tiers is a pixel surface.** ChunkTab is a block-assignment
grid, BlockTab a tile-assignment composer — cells *reference* a child by id, which is what
`ArtTier.shared` exists to express. Owner approved three independent convergences instead;
`s1ArtFacet` and `artFacet` remain separate modules.

| | What landed |
|---|---|
| **H1** | Classic's Tile tier onto `PixelEditController` + `PixelViewport`: 8 tools, mirror, dither, pixel-perfect, marquee select/move, 7 transforms, anchored zoom, hand pan. Tool rail + options bar gated to the tile tier. |
| **H2** | One `art-shared/PaletteGrid.tsx` (201 lines) behind per-engine ports, mounted at all four sites. `PaletteEditor` 645 → 302; `ClassicPalettePanel` 117 → 31. |
| **H3** | The composer fills its canvas on all three tiers. |

**Explicitly NOT ported (owner decision): copy-on-write staging + explicit Save.** Aeon
stages strokes in `localPixels` and commits on Save because its composer opens whole chunks
and mints tiles at save time. Classic's Tile tier always edits an existing tile at a known
index. **Staged writes are not commands**, so adopting it would break Ctrl+Z on classic's
Art facet, whose `zoneart:<zone>` stack requires every edit to be a command. The rule held
throughout: **one gesture = one `classicEditTiles` = one undo entry**, verified in the
running app by draining the undo stack (a 6-pixel drag takes 1 press, not 6).

### H3 measurements (running app, 1400x872)

| tier | dead space before → after | canvas |
|---|---|---|
| Chunk | 251px (33%) → **0** | 320 → 576px, cell 20→36, 1:1 |
| Block | 273px (36%) → **0** | 128 → 384px, cell 64→192, 1:1 |
| Tile | 325px (45%) → **0** | 240×240 → 549×590 viewport |

---

## 2. Five bugs found that were NOT in the plan

Four pre-existing; three affect **aeon or the sprite editor**, not classic.

1. **Anchored zoom was never anchored** — `useAnchoredZoom` computed the anchor against the
   scroller's content origin, ignoring the canvas's offset inside it. Drift `K/z − K′/z′`.
   **All three hosts** (classic, aeon composer, sprite editor). Fixed, CDP-verified 0 drift
   at default zoom. Note: one measured row is bounded below at 1.0625px and **cannot** reach
   zero — no scroll container can express the required position.
2. **`PixelEditController`'s marquee move had no bounds check** — `sel.x + dx` unclamped, so
   an overhanging marquee read/wrote outside the buffer.
3. **`ArtToolOptions`' transform grid would have leaked across engines** — it writes
   `artStore.pendingAction`, whose only consumer was aeon's `ComposerCanvas`. Clicking a
   transform in classic would have armed one for the next **aeon** document.
4. **`select` broke the locked-tile invariant** — it was in `READ_ONLY_TOOLS`, but a
   pointerdown inside an existing marquee takes the controller's *move* branch. Pixels were
   refused but the marquee moved, marking a region it never came from. Fixed with an
   additive `gestureSelection` prop on `PixelViewport` (defaulted, so the other two hosts are
   inert — verified).
5. **Aeon's palette preview wrote the document outside undo** — `previewChange` mutates
   `zone.palette.lines[…].colors[…]` in place; `preDragRef` had no teardown, and Chrome does
   not fire `blur` when a focused element is removed. A facet switch mid-drag left the palette
   changed with **no history entry and `dirty` unset**. Fixed commit-on-teardown (a stranded
   mutation is unrecoverable; an unwanted commit costs one Ctrl+Z), except where the document
   went away underneath, which rolls back. Reproduced in-app before and after.

---

## 3. Two open bugs, diagnosed but NOT fixed

Both **pre-existing** — `git blame` puts them before the branch point.

### 3.1 `LevelArt` sentinel taken as a path
`Open "Collapsing_Cliff" failed: ENOENT … open '/home/volence/sonic_hacks/s1disasm/LevelArt'`

`src/renderer/components/sprite/export-sprite.ts:511` copies `link.artFile` into a
file-read shape. For `artSource: 'levelArt'` links, `artFile` is the **sentinel string
`'LevelArt'`** minted at `src/core/project/profiles/s1-object-art.ts:125` — those objects
draw from the level's own VRAM tile pool, not from disk. The thumbnail path guards correctly
(`classicObjectArtStore.ts:131-133`); the "Edit art" path does not.

**Blast radius: 12 (id, zone) pairs, 10 ids, 4 zones** — ghz `$18` `$1A`; mz `$2F` `$46`;
syz `$12` `$18` `$56`; slz `$18` `$56` `$59` `$5A` `$5B`. Fails gracefully (the empty sprite
doc rolls back).

**Recommended fix:** guard `editObjectArtCheckout` on `link.artSource !== 'file'` with an
explanatory toast, **and** filter the "Edit art" affordance by the same predicate in the four
providers so the button doesn't offer an impossible action. Actually supporting these in the
sprite editor is a *feature* (it needs `doc.tiles` as a byte pool and a save-back that writes
tiles, not a `.nem`).

### 3.2 `tileIndexOffset` dropped — silently wrong pixels
Same three lines. `openDiscoveredSet` has no offset parameter, so `$32` Switch (−4 tiles) and
LZ/SBZ `$61` Block/Cork (+282) open with a **silently mis-shifted tile pool**. No error.
Nastier than 3.1 precisely because it does not announce itself.

---

## 4. THE OPEN DESIGN QUESTION — start here

The owner asked: *do people actually draw a tile, compose it into a block, compose that into
a chunk? Or do they draw a chunk and reuse blocks/tiles from it?*

### What was established (measured, not inferred)

A read-only probe decoded GHZ's real data (enigma map16, kosinski map256, layouts) and ran
the real `buildUsageIndex`:

```
blocks=439 chunks=82  pool=965 tiles
tile.containers:  nonzero=819  min=1 max=77   histogram 1→529  2→213  3→30 …
tile.cells:       nonzero=819  min=1 max=144  histogram 1→519  2→215  3→32 …
block.containers: nonzero=397  min=1 max=55
block.cells:      nonzero=397  min=1 max=8211
chunk.placements: nonzero=43   min=1 max=8
tile 0 → 77 blocks · 144 cells ;  tiles 1..15 → 2/2
```

**Sonic 1's GHZ art is barely deduplicated at the 8×8 level. 63% of used tiles appear in
exactly one block, one cell; 90% are 1 or 2.** The reuse lives one and two tiers up.

This **corrected an assistant claim made earlier the same session** ("edit a tile and every
block using it changes") — true in principle, empirically almost never. Consequence:

- **Tile-tier editing is mostly safe.** The shared-edit hazard is a **BLOCK-tier** concern
  (up to 55 chunks / 8211 cells), and secondarily chunk-tier.
- If guided clone-before-edit flows get built, **they belong at the block tier**, not the tile
  tier where the affordance is currently most visible.

Also explains the owner's "every tile says 1 block · 1 cell": **not a bug.** The 1/1 tiles come
in long contiguous runs — 21 runs of ≥8, longest **41 consecutive from index 390**. Tile 0
(the default selection) shows 77/144, so it only looks flat once you browse.

### The hypothesis to test with research (NOT yet grounded)

Reasoned from the format and the codebase, **not from watching anyone hack**:

- Art rarely originates tile-by-tile in an editor — it arrives as a *sheet* (Aseprite, ripped)
  and gets imported. The 8×8 editor is a touch-up tool.
- Composition genuinely is bottom-up (blocks from tiles, chunks from blocks) — SonLVL's model.
- But the dominant activity is **editing existing data**, which is top-down descent.
- So the real loop may be neither: **clone the nearest thing and diverge** — find a close
  chunk, duplicate it, duplicate the blocks you need, edit, paint it in. A *diagonal* through
  the ladder that the editor does not currently guide.

**Research task:** how do SonLVL / Sonic Retro / SSRG hackers actually build and edit a zone?
Ground this rather than inferring it again — the first inference was already wrong once.

### Loose thread it connects to
`artTiers` (`core/project/adapter.ts:110`) is **tested scaffolding with zero production
consumers**. Built for a shared art breadcrumb that H's rescoping rejected. Either the
workflow answer gives it a real job, or it should be deleted rather than left looking like
pending work. **Do not delete it as cleanup — that is a decision.**

---

## 5. Not started

- **Piece C** — the four dirty-guard flows collapse to `confirmDirtyThenProceed` (the spec
  lists three; `confirmCloseSpriteDoc` is a fourth), `supersede: false` explicit,
  ProjectSetupTab dirty widening, agent-handler `force` flag, `Explorer.tsx` table-driven
  router (moved to `shell/`, grew 5→6 branches), `viewStore.reset()`, TabStrip a11y +
  `ConfirmDialog` focus trap **with guard tests, rest of app left alone** (owner-scoped; the
  renderer has 8 `role=` attributes and zero a11y tests, and the full sweep was declined as
  its own future piece).
- **Piece D** — greenfield. Only step 1 of the load chain exists; nothing writes
  `editor_bg_override.json`; no `BgBand` model at all. Key findings that correct the spec are
  in the `aurora-ux-overhaul` memory: **every band driver shifts HORIZONTALLY** (`driver`
  picks the scalar source, never the axis); **§7.5's "import 448 from `vram_map.py`" describes
  machinery that does not exist** (separate repos, no codegen either way) so Aurora must grow
  a generator or restate with a guard; and **`paintBgTile` already mutates outside undo**.

---

## 6. Process notes that paid for themselves

- **The dominant defect class here is guards that pass while asserting nothing** — see the
  `aurora-guards-assert-nothing` memory. Every guard this session was verified against a
  planted violation; several passed until the assertion was tightened.
- **Restore plants from a byte copy. Never `git checkout --`/`git stash`/`git restore`** — it
  aborts on an untracked pathspec, silently stacking plants and reverting real edits. Bit
  agents twice.
- **Falsify CDP harnesses too.** One round reported three defects that did not exist (a
  selector matching extra buttons; a leftover marquee turning a later drag into a *move*).
- **Plan-authored code was wrong three times** in ways only implementing revealed — most
  notably an `onCommit` sketch that would have minted an empty undo entry on every marquee
  drag. Contracts + ILLUSTRATIVE-marked code, with implementers deriving from source, is the
  discipline that works.
- Known flake, unrelated: `src/renderer/providers/__tests__/map-status-classic.test.ts:109`
  times out under load (5s default, three dynamic `import()`s).
