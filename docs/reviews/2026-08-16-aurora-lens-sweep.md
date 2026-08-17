# aurora — lens-panel adjudication packet

**Review SHA:** `2b38e0b` (pinned; clean tree, master)
**Corpus:** ~84,000 lines of TypeScript/TSX — Electron + React 19 + zustand editor for the Empyrean
suite; classic (S1 disasm in place) and aeon backends. core 29k / renderer 53k / main ~1k.
**Panel:** 18 seats (4 Fable 5, 14 Opus 5), 29 adversarial verifiers over the critical/high set.
47 agents total; **all 18 seats reported** — no lost seats this sweep.
**Baseline at the pin:** `tsc --noEmit` clean; vitest **2914 passed / 0 failed / 3 skipped** (266 files).
Debug app pre-built once; three seats drove it live under CDP against the real s1disasm
(no tracked disasm file was written — verified via `git status` by both runtime seats).
**Adjudication:** every finding in §2 carries a CONFIRMED verdict from an independent verifier that
was instructed to refute it; several verdicts corrected the seat's severity, and those corrections
are applied below. §3 findings carry seat evidence only. Three high findings were REFUTED and are
recorded in §6 so they are not re-found.

> **COVERAGE NOTE.** Mid-sweep the machine briefly hit EDQUOT (47 parallel agents sharing /tmp);
> the FMT, DEAD, VIS, MAIN and STATE seats lost their shells partway and completed by Read only.
> Each states its exact gap in §9. The other standing gaps: the Import Art Sheet path beyond the
> file chooser is unverifiable under CDP (window.api is frozen; CDP-A-A4), the aeon backend had
> **zero runtime rows** (all three CDP seats ran classic/GHZ only), and `src/core/collision/` turned
> out to be the aeon/s4 system and was not audited by any seat. Raw seat output (full evidence +
> verifier reasoning per finding): `scratchpad/lens-sweep-2026-08-16/` — `digest-index.txt` for the
> map, `seat-<NAME>.json` for everything a seat said.

---

## 1. Headline

**The semantic core the last month was spent on is largely right — and the sweep proved it the hard
way** (executed round-trips of every codec against every real s1disasm file; a 256/256-cell GHZ chunk
round-trip through resolve→commit; 22 green CDP rows). The defects that matter cluster in three
places, none of which is the art math:

1. **One real corruption bug in the new commit planner** (R1): the block tier is missing the
   three-state availability the tile tier has, and a partial-edit-then-replace commit silently
   rewrites kept art and its collision into the user's disasm. Executed repro, confirmed critical.
2. **The dirty-flag/teardown perimeter leaks.** Five confirmed ways work is lost or mis-flagged with
   no prompt (R2, R3, R4, R5, R6) — including two where an **MCP read tool** or a **project open**
   destroys unsaved edits outright. The guards that exist are real; the perimeter has holes where
   document types were added without joining it.
3. **The aeon half is a second-class citizen in exactly the ways the classic half was hardened
   against.** Save toasts success over a failed export (R8), a corrupt objects.json is loaded as `[]`
   and saved back over the data (R7), drags drop or bypass history (R9, R10), and whole-project
   dirty vs current-act save is a loss waiting for the first two-act project (R6).

The GUARD seat's planted-violation scoreboard: **18 plants, 11 caught, 7 missed (39% miss)** — and
the misses concentrate precisely in the commit planner's refusal/reuse guards and the save
self-check gates, i.e. the two places the packet's worst findings live. The suite is far from
vacuous (≈0 true zero-assertion tests across ~2,138 it-blocks), but its coverage ends exactly where
the new code's risk begins.

---

## 2. Confirmed defects, ranked

### R1 — Block tier lacks three-state availability: a commit overwrites block ids its own plan reused · CRITICAL
**Seat:** ART (Fable) · **Verifier: CONFIRMED, severity stands** · `src/core/art/classic-commit-plan.ts:373`

`internBlock`'s pool-reuse scan (:373–383) walks `doc.blocks` with no exclusion of `reclaim.blocks`
or of ids already in `blockWrites`; allocation at :386 hands out `reclaimBlocks[cursor++]`
unconditionally. So in one plan the same block id can be matched ("reuse") for a kept 16×16 and
rewritten with different art **and colind** for a new one. The tile tier has `PoolAvailability`
for exactly this class (`tile-pool-match.ts:33-48`); the spec requires the block-tier exclusion
verbatim (phase-2c spec §4 step 8) and it was never implemented. The existing regression
(`classic-surface-plan.test.ts:421`) pins only the tile site.

**Executed repro** (planner run against a synthetic doc at the pin): replace a chunk keeping one
16×16 identical to old block 1 — cell binds to block 1 AND `blockWrites` carries id 1 with the new
art's def. Reachable on the main path: `planFromSnapshot` → UI chunk picker → `classicCommitCanvas`
applies `blockWrites` verbatim (`classicLevelStore.ts:1042-1045`) and it saves to the disasm.
The reclaim filter *aggravates* it: reclaim collects blocks exclusive to replaced chunks — exactly
the ones kept cells will match.

**What makes it critical (verifier's correction):** the art half is loud (the chunk renders wrong
immediately; undo exists). The **collision half is silent** — the overwritten id's colind comes from
whichever displaced cell allocated it, so a kept cell's collision shape changes under
unchanged-looking art and is saved with no warning. Blast radius is confined to the chunks being
replaced in that gesture.

**Fix:** mirror `PoolAvailability` at the block tier — skip pending-reclaim ids and ids already in
`blockWrites` in the match scan; remove pool-matched ids from the reclaim queue. Regression: planted
match+allocate collision that fails against today's code. Pair with GUARD-A1 (§4): the colind-match
guard one line up (:374) is itself untested — plant both.

### R2 — MCP `get_classic_level` (a read) silently destroys unsaved classic edits and both undo stacks · CRITICAL
**Seats:** CLASSIC + UNDO (found independently) · **Both verifiers: CONFIRMED, empirical repro** · `src/renderer/agent/agent-handler.ts:625`

`classic-get-level` calls `openAct(ref)` unconditionally. `openAct` runs
`disposeStacksFor(get().ref); disposeStacksFor(ref)` (drops `level:` **and** `zoneart:` stacks),
sets `dirty: {}`, and re-reads from disk — **with no same-ref early return**, so it fires even when
the requested act IS the loaded act. The natural agent sequence — edit, then read back to verify —
destroys the agent's own edits and reports pristine disk state as success. The UI door for the same
transition has a three-button confirm (`tab-activation/level.ts:175-197`) and a same-act no-op; the
sibling tool `classic-open-project` fails closed at :579 — so this is a gap, not a policy.
Verifier repro: place-object → dirty set, canUndo true → `get_classic_level` same act → objects
reverted, dirty `{}`, canUndo false, tool returns "success".

**Fix:** same-ref → return the live doc without re-reading; different-ref while dirty → throw, same
shape as :579. Consider `openAct({allowDiscard})` defaulting to refuse.

### R3 — Unsaved aeon composer art is outside every dirty guard and every teardown · CRITICAL
**Seat:** STATE · **Verifier: CONFIRMED** · `src/renderer/shell/project-open-guard.ts:55`

A New Tile/Block/Chunk composer doc's strokes live solely in `artStore.open` (doc-local branch,
`ComposerCanvas.tsx:258-261` — `markOpenDirty()` only, no command, so `editorStore.dirty` stays
false). `currentOpenDirtySnapshot()` reads classic/editor/sprite/canvas dirt and **never imports
artStore**; `endDocumentSession()` and `resetProjectRuntime()` close sprite+canvas docs and not this
one — despite `endDocumentSession`'s own docblock ("the next document type is added here once").
Opening another project shows no confirm, then `aeon-open.ts:86` replaces the document outright.
The guard's test file has a four-field clean snapshot and zero art cases. Verifier also widened it:
the chunk branch (:246-251) marks artStore-only dirt for strokes on empty/local cells too.

**Fix:** add `artDirty` to `OpenDirtySnapshot`/`planProjectOpen`; add
`useArtStore.getState().closeDocument()` to `endDocumentSession`, `resetProjectRuntime`, and the
discard branch.

### R4 — Dirty flags cleared unconditionally after async save: 3 of 4 save paths lose mid-save edits silently · HIGH (verifier: "arguably conservative")
**Seat:** SAVE (Fable) · **Verifier: CONFIRMED** · `src/renderer/state/classic-save.ts:205`

Classic, canvas, and aeon saves snapshot dirty state, await real IPC, then clear unconditionally —
`markDomainsClean` (`classicLevelStore.ts:487-494`) has no doc-identity or generation check;
canvas `markSaved` and aeon `markClean()` are the same. An edit committed while the write is in
flight ends up: not on disk, not flagged, no tab dot, next Ctrl+S returns `nothing`, close prompts
silent. **The sprite path already implements the fix** (`export-sprite.ts:271-290`: re-read after
the await, `framesEqual` gate, "edits made during the save are still unsaved" toast) — proving the
class was known and three paths never got it. Narrowing (verifier): the mid-save edit must touch a
domain already in the pre-write snapshot — which is the common painting-while-saving case.

**Fix:** port the sprite pattern (or a per-domain edit-generation counter) to all three.

### R5 — No unsaved-work guard on window close / app quit · HIGH (verifier: Ctrl+W path argues critical)
**Seat:** SAVE (Fable) · **Verifier: CONFIRMED — "every candidate escape hatch is absent"** · `src/main/index.ts:56`

No `win.on('close')` interception, no `before-quit` dirty check, zero `beforeunload` handlers in the
renderer, no autosave anywhere (session-lifecycle persists tab identity, never content). Every
*other* exit door prompts (tab close, act switch, project open, Setup Apply) — training users to
expect the prompt exactly where it's missing. Sharpened by the verifier: no application menu is set,
so Electron's default menu supplies the `close` role on **Ctrl+W** — the reflexive tab-close chord
destroys the window and every dirty document.

**Fix:** intercept `close`, IPC round-trip to the same dirty snapshot the tab-close path uses,
save/discard/cancel.

### R6 — Aeon Ctrl+S marks the whole project clean while writing only the current act · HIGH (downgraded from critical: latent — the only aeon project today is single-act)
**Seat:** STATE · **Verifier: CONFIRMED, every link** · `src/renderer/state/aeon-save.ts:33`

One project-wide `dirty` flag; every command in every act sets it; `buildAeonSavePlan` resolves
exactly ONE act and loops its sections; `markClean()` then clears everything. Two-act scenario:
edit act1, switch to act2, Ctrl+S → act2's files written, dirty false, no dot on any tab, project
switch proceeds without a confirm, act1's edits gone. Multi-act is a designed configuration
(`shell/tabs.ts:100`, session-lifecycle emits a tab per act), so **this flips to critical the moment
a second act is authored**. Fix before then, not after: either whole-project save before
`markClean`, or per-document dirty keyed by the ids the DocumentHistoryHub already uses.

### R7 — A present-but-unparseable objects.json/rings.json loads as `[]` and the next save writes `[]` over it · HIGH
**Seat:** ERR · **Verifier: CONFIRMED, executed with the real loader/planner** · `src/core/project/aeon/load.ts:262`

Bare catch conflates ENOENT / EACCES / SyntaxError; all three yield `section.objects = []` with no
notice, and `buildAeonSavePlan` pushes both files unconditionally for every non-null section.
A truncated hand-edit or merge-conflict marker → project opens with zero objects in that section,
no warning anywhere, next Ctrl+S permanently destroys every placement. The canvas layer solves
exactly this (`canvas-file.ts:136-141` tests /ENOENT/), and the same save function already guards a
sibling case (`save.ts:212` — "a load-time parse failure must not lead to destroying data").
Sibling (read-verified, not executed): the `.tiles.bin` branch at load.ts:196-202 silently reseeds
the nametable from baked strips on read failure and saves that over the user's layout.

**Fix:** discriminate ENOENT; on any other failure record a notice and mark the section
not-understood so the save plan omits the file. Same for `.tiles.bin`.

### R8 — Aeon save toasts "Project saved" after the export step failed; console.warn is the only trace · HIGH
**Seat:** ERR · **Verifier: CONFIRMED; the repo's own test machine-checks the half-written state** · `src/renderer/state/aeon-save.ts:31`

`exportError` has exactly one consumer: a `console.warn`. Then `markClean()` + success toast, while
`export/act_descriptor.asm`, `entity_data.asm`, `vram_bases.asm`, `section_N.{tiles,art}.bin` stay
at the previous save's contents and the engine build consumes them. Ordinary authoring mistakes
trigger it (33rd unique object type, x > $7FF, tile union past the pool). The diagnostic that would
let the artist fix it exists only in devtools. `aeon-save.test.ts:118-158` already reproduces the
half-written state and passes. **Note before fixing:** §5's evidence says the three export modules
are dead output aeon never reads — decide R-DIR-6 (retire) first; if they're retired, the fix is
deleting the export step, not surfacing its error.

### R9 — Leaving the aeon viewport mid-drag drops an object/ring move: doc mutated, no command, dirty stays false · HIGH (downgraded from critical: one placement per occurrence)
**Seat:** UNDO · **Verifier: CONFIRMED end-to-end** · `src/renderer/components/MapViewport.tsx:1535`

Drags mutate the live doc per mousemove (`bumpLiveEdit` only — never `markDirty`); the only commit
is the container's `handleMouseUp`; `onMouseLeave` nulls `dragTarget`; there is no window mouseup
listener and no pointer capture. Release outside the viewport → object rendered at the new spot,
dirty false, undo empty, Ctrl+S a no-op, close prompts nothing. (Save All *would* persist it —
project-runtime's aeon isDirty is engine-open, not the flag.) The identical bug was fixed for the
classic composer with a window mouseup (`composer-shared.tsx:130-145` documents it).

**Fix:** pointer capture or window mouseup; make mouseleave commit, not discard.

### R10 — BG-layer painting is outside history: Ctrl+Z reverts an unrelated FG edit instead · HIGH
**Seat:** UNDO · **Verifier: CONFIRMED** · `src/renderer/components/MapViewport.tsx:764`

`paintBgTile` writes the resolved BG nametable directly (`markDirty` + `bumpLiveEdit`, no command);
it's a first-class drag path and the data saves to `<zone>_<act>_bg.bin`, so the mutation is
durable — but the next Ctrl+Z pops whatever act-scoped command preceded the BG strokes and silently
reverts *that*. `editorStore.ts:90-96` names this exact gap. A `set-bg` command exists but is a
whole-plane swap nothing on this path builds.

**Fix:** per-tile `set-bg-tiles` command, coalesced per gesture on a window mouseup — which is also
the fix shape for A5 (§3) one path over.

### R11 — `kosinskiDecompress` loops unbounded on malformed input and kills the process — a git-lfs pointer file triggers it · HIGH
**Seat:** FMT · **Verifier: CONFIRMED, executed; trigger class WIDENED** · `src/core/formats/kosinski.ts:20`

`readByte()` returns 0 past EOF (nemesis throws); the `for(;;)`'s only exit is the full-match
terminator, unreachable when descriptor bits never route there — so the output array grows until V8
aborts the process, which no try/catch can intercept. Executed at the pin: empty input, `[0,0]`,
4KB of zeros, **and a git-lfs pointer file (plain ASCII)** all OOM-abort. Reachable from S1 project
open (`s1-io.ts:285`) and chunk import (`chunk-mappings.ts:116-117`) — the import path aborts
mid-session and takes unsaved editor state with it. Availability checks are existence-only, so a
placeholder/LFS-clone disasm walks straight in. Sibling wart: negative window index reads
`undefined & 0xFF` = silent zero.

**Fix:** throw at EOF like nemesis; output ceiling (caller max or hard 4 MB); error on negative
window reads.

### R12 — The transform grid is live on Chunk/Block Paint tiers with no consumer; the stale action fires on the next TileTab mount · HIGH
**Seat:** STATE · **Verifier: CONFIRMED at every link** · `src/renderer/workspace/facets/s1-facets.tsx:438`

`ClassicArtOptions` passes `CLASSIC_TILE_CAPS` (transforms live) to all three classic pixel tiers;
only TileTab consumes `pendingAction`. Click Rotate-90 on Chunk-Paint → nothing happens → switch to
Tile → TileTab mounts, its effect fires with the leftover action and commits a real transform
against a tile the user never chose (`commitTileBytes(..., 'Transform')` — dirty-marking, though one
Ctrl+Z away). TileTab's own comment (:274-281) documents the hazard its `finally { clearAction() }`
exists for; two of the three hosts drawing the buttons never clear.

**Fix:** compute caps per tier (transforms off for chunk/block paint), and have
`ClassicComposerDock`'s tab-change effect call `clearAction()` as belt-and-braces.

### R13 — `/mcp` has no Host/Origin guard while `/aether` does; DNS rebinding can silently rewrite the disasm · HIGH
**Seats:** MAIN + SEAM (found independently) · **Verifier: CONFIRMED; SDK defaults verified in the installed package** · `src/main/mcp-server.ts:65`

`POST /mcp` is registered with no middleware while both `/aether` routes wear `loopbackOnly` — and
both dispatch the identical `EDITOR_METHODS` registry (open_project → edit_chunk → save_project,
no confirmation on save). SDK v1.29.0 defaults `enableDnsRebindingProtection` to false (verified in
`node_modules/.../webStandardStreamableHttp.js:70`). A rebound page is same-origin (no CORS
preflight) and `/mcp` accepts what `/aether` 403s — under a comment claiming the surface is "never
remotely exposed (protocol D8)". Honestly-stated unknown: whether 2026 Chrome's Local Network
Access still permits the rebound fetch; that mitigation is external and applies equally to the
guarded route. Related (§4): the server has no auth token at all and publishes its port in a
world-readable discovery file (MAIN-A3); `file:write-binary` has no rel-path guard (MAIN-A2).

**Fix:** `loopbackOnly` on `/mcp` **and** construct the transport with
`enableDnsRebindingProtection: true, allowedHosts, allowedOrigins`. Both, not either.

### R14 — Ctrl+B / Ctrl+K silently arm a destructive map tool alongside their real action · HIGH
**Seat:** VIS · **Verifier: CONFIRMED; scope widened to Ctrl+±/0** · `src/renderer/components/MapViewport.tsx:677`

Two window keydown listeners fire for one event; MapViewport's tool-letter switch has no modifier
guard on `b`/`k` (while `:672/:673/:678` explicitly carry `if (!e.ctrlKey)` — the class was known).
Ctrl+B toggles the Explorer AND arms paint-block; the next map click writes nametable entries.
Verifier corrections: the Ctrl+K first click is absorbed by the palette backdrop (the *following*
click stamps), the edit is undoable and the tool readout does change — and `=`/`+`/`-`/`0` are also
unguarded, so browser-zoom chords change map zoom too.

**Fix:** one `if (e.ctrlKey || e.metaKey || e.altKey) return;` hoisted above the switch; delete the
per-case guards.

---

## 3. Strong findings the verify pass did not reach (seat evidence only — verify before or while fixing)

- **U1 (UNDO-A5) · aeon paint-tile/paint-collision drags record one undo entry per cell** —
  `MapViewport.tsx:1213`. 60-cell drag = 60 entries; at `MAX_HISTORY = 200`, a few drags evict the
  session. Classic coalesces correctly (cited lines). Same window-mouseup fix shape as R9/R10 —
  do the three together.
- **U2 (UNDO-A6) · undoing a sprite frame delete restores frames but not the re-indexed animation
  steps** — `spriteStore.ts:541`. `steps` is not a snapshot field; delete+undo leaves every later
  step off by one, silently wrong on export. Fix: put `steps` in the snapshot (it's small; the
  frames-cost argument doesn't apply).
- **U3 (SAVE-A4 = MAIN-A2) · `WRITE_BINARY_FILE` has no rel-path guard** — `ipc-handlers.ts:81` —
  and exportSprite feeds it a free-typed sprite name as a path segment. One `isRelPathSafe` call.
- **U4 (ERR-A6) · a FAILED classic save returns as a successful MCP tool result** —
  `agent-handler.ts:731`. Agents proceed as if written. Map outcome variants to isError.
- **U5 (CLASSIC-A5) · object save re-sorts by X on any edit; five acts are non-ascending and GHZ3's
  sort swaps two remember-flagged respawn slots** — `s1-io.ts:531`. The justifying comment names one
  act; the profile says five.
- **U6 (CLASSIC-A4) · colind files legitimately shorter than the block list are modeled as shape-0
  and zero-filled on save** — the ROM resolves the overhang from the adjacent zone's table; Aurora
  renders it as air and writes zeros over it.
- **U7 (ERR-A3) · an unreadable mappings .asm silently empties the reservation set** — non-null-but-
  empty defeats the `reservedTiles === null` refusal; the allocator hands out object-sprite tiles.

## 4. The commit-planner cluster (medium; fix as one campaign with R1)

All in `classic-commit-plan.ts`, all seat-certain, none verified independently:

| id | what | line |
|---|---|---|
| ART-A2 | pool-block reuse matches def **spelling**, not identity — measured **100% miss** on rendered-identical real GHZ blocks (flip spellings defeat it), so re-committing untouched art mints duplicates | :377 |
| ART-A3 | duplicate chunk targets: last-write-wins, report counts both | :269 |
| ART-A4 | "Use the act's colours" remaps non-drifted entries to the lowest duplicate slot, silently diverging tile bytes from the pool's spelling | :153 |
| ART-A5 | spec step 9 (zero reclaimed-but-unwritten ids + report count) unimplemented — orphaned blocks strand their tiles forever | :189 |
| ART-A6 | commit ignores `doc.gridOrigin` that the 2B readout honours — overlay shows clean while commit refuses | canvas-commit-model.ts:214 |
| ART-A10 | palette adoption writes whole lines 1–3 while drift names only USED entries — unnamed entries recolour existing zone art in every act | :256 |
| ART-A7/A8/A9 | anim-slot first-hit discard; raw CRAM `===` (no $0EEE mask helper); tiles-exhausted refusal reports hardcoded `free: 0` | :311/:237/:326 |

And the matching test debt (GUARD, all planted-and-missed): colind-match reuse guard (A1,
verifier-confirmed, downgraded to medium because HEAD's outputs are currently right), locked-tile
refusals in both paint modes (A2), freeSlot's reserved/anim/locked filter (A3), both exhaustion
ceilings (A4), both save self-check byte-mismatch arms (A5), `performGuardedWrite` entirely (A6).
DIR-A4 adds the three spec-§7 disciplines never built: real-GHZ reclaim plants, an
engine-id-vs-file-index plant, stale-block zeroing.

## 5. Other confirmed/notable, by area

**Classic model fidelity (CLASSIC, unverified, all "certain"):** layout byte `$80` (loop-over-air)
passes validation → engine reads an odd address (:772); collision-angle needle drawn mirrored
(missing sign negation, `classic-overlays.ts:85`); `colind[0]` writable though the engine can never
consult it; **the colind save self-check is a tautology** (`bytesEqual(x.slice().slice(), x)` —
s1-io.ts:561) while the docblock advertises a real gate.

**Runtime (CDP, all app-verified):** a canvas→level commit is undoable **only** from the level
tab's Art facet — the reflexive Ctrl+Z on the canvas tab eats the drawing instead (CDP-A-A1);
stamping the byte already present still dirties the act and pushes an undo step, arming the
destructive discard prompt for a no-op (CDP-B-B1); the active tab's camera is only snapshotted when
you switch *away*, so relaunch restores a stale viewport (CDP-B-B2).

**UX (verifier-adjusted):** New Canvas defaults to 128×128 — a size that can never be committed
(needs whole 256px chunks) and the dialog never says so (UX-A1, medium); the canvas has **no
keyboard tool loop at all** vs the Aseprite bar (UX-A3, low-as-defect but the owner's stated bar);
ImportSheetDialog is the one modal with no Escape/role/focus-trap and a plan-discarding backdrop
(UX-A2 = VIS4); zoom controls run in opposite directions on level vs pixel surfaces (UX-A5); three
words for the same divergence concept — Duplicate/Diverge/Isolate — on one screen (UX-A6); solidity
tooltips print SonLVL enum names (UX-A8); Explorer group counts include action rows ("CANVASES 3"
= one canvas, UX-A4).

**State/perf (mediums):** `openAeonProject` writes its fitted composer zoom into whatever tier is
active (STATE-A4); aeon act switch never clears selection → inspector edits a phantom object in the
new act (STATE-A5); BlockTab/ChunkTab thumbnails still key on the coarse `chunkEpoch` — one
block-cell click repaints ~1,400 thumbnails (PERF-A4, verifier-confirmed); MapViewport recomposes
per mousemove with no rAF coalescing and reassigns the backing store each time (PERF-A3,
verifier-confirmed; the fix is the driver, not the renderer — SectionRenderer itself is clean);
`PixelViewport` recomposes the whole buffer per pointermove (PERF-A6); sprite editor is the one
PixelViewport host without `cappedZoom` (PERF-A8); every sprite undo entry deep-clones the entire
frame set (UNDO-A9); the aeon command engine — 20 hand-rolled inverses — has **no unit test**
(UNDO-A11).

**Aether/MCP contract drift (SEAM):** initialize result omits schema-required keys; SSE pushes
`editor/ready` pre-handshake and `broadcast` is dead code; `get_bg` hardcodes height 32 while
`list_bgs` derives it; `set_bg` accepts 512 tiles where aeon's region is 448 (the last unreconciled
copy of a number aeon fixed in June); discovery file hand-types `protocolVersion`.

**Dead code (DEAD + ARCH, cross-confirmed):** `toolStore.ts` (complete store, zero importers);
`core/formats/sprite-mappings.ts` (stale duplicate parser that is also core's only DOM `ImageData`
constructor — the single core-layering wart); `camera.ts` 8/10 exports; `object-names.ts`,
`object-defs.ts`, `s4-objects.ts`, `s4-rings.ts`, `color-quantize.ts`, `SectionList.tsx`; seven
dead exports in live files; **all 12 type-scale tokens + 3 weight tokens generated and never
consumed** while 227 inline fontSize sites hardcode 13 values (= VIS7). DEAD's negative list
matters too: `properties-classic.ts` is dead-by-design, `ToolColumnParts` is live despite knip,
`flipTile` has three importers — do not delete those.

**VIS calls (owner delegates these; they are decisions, not options):** kill the second green —
selection and hover in the tile browser should share the selection green with hover at reduced
alpha; float all HUD chrome on `--void` (drop the two `#11111B` holdouts); merge the duplicate
`ToolButton`/`Divider` pairs into the `art-shared` versions; replace raw `'monospace'` with
`T.fontMono` at the four readouts; `borderRadius: 3` → the token scale's 4. Plus the real ones:
`Chip` is a `<span onClick>` — every chip in the app is mouse-only (VIS3); focus outlines are
suppressed with **no** `:focus-visible` replacement anywhere (VIS6); six divergent "is the user
typing" predicates (VIS2); Ctrl+K opens the palette *behind* modals at z-1000 vs 1100 (VIS5);
hand-pan's Space preventDefault kills Space-activation of every focused button app-wide (VIS15).

## 6. Refuted — recorded so they are not re-found

- **PERF-A1 (collision overlay stroke storm): REFUTED.** Real decoded GHZ1 data: 38,499 strokes for
  the whole plane (claim: 92k–440k/frame); measured 2.5–6.5 ms unbatched in the actual Electron
  runtime, rAF-coalesced. The batching is a legitimate ~1–5 ms cleanup (LZ1 at extreme zoom-out
  reaches ~44 ms — medium at best there). The seat filed a fabricated failure mode at "certain".
- **PERF-A2 (zoom cap area bound): REFUTED as filed.** The arithmetic is right but inverts the
  change's direction — aebfa67 strictly *raised* the notch count to reach the big canvas, and
  15,872² is below every Chromium limit the cited failure mode names. Residual: an area bound in
  `cappedZoom` is legitimate hardening (low).
- **SEAM-A2 (FG_TILE_LIMIT 1024 vs 896): REFUTED.** The numbers differ, but nothing consumes the
  output: `sec_tile_art_vram` no longer exists in aeon, nothing reads Aurora's `export/` dir, the
  engine retired the per-act VRAM fit (pages land in allocated frames). What this refutation
  actually proves: **the three export modules are dead outbound artifacts** — see R-DIR-6.

## 7. Direction — for the owner, not the implementing agent (DIR seat, Fable)

All five BUILT spot-checks **held** against code (2C floors, D4 three-state at the tile tier, D3
collision inheritance, the §3.6 seam preview, D6/PNG bypass). The steering findings:

1. **ROADMAP.md is a month behind and sequences the wrong engine.** Nothing recorded after §2.5
   (Aug 9) while ~190 commits landed; P7 says "None" while the import pipeline shipped; P0/P1
   rows claim work that isn't done (ART_SUITE.md still documents the deleted Toolbar UI; the three
   dead export modules P1 ordered retired are still in-tree). **Decision offered:** add a §2.6
   recording the August line (UX stages 1–4, art authoring 1–2C) as delivered, and re-sequence
   around the classic spine actually being steered.
2. **Recommended next phase: classic collision authoring.** 2C's own out-of-scope note concedes a
   committed drawing gets colind 0 + solidity 0 — the player falls through committed art, and
   `classicSetColind` is reachable only from the agent handler. Every rung of
   originate→constrain→import→commit→refine now exists in-app **except** collision, which is the
   one rung that still sends the artist out of Aurora — the exact failure the "artists don't leave"
   bar forbids, at the last step. It's also the natural home for the R1/§4 planner campaign, and
   per DIR-A3 it should ship `paint_collision` AND retrofit `commit_canvas`/`import_art_sheet` MCP
   tools in the same phase, restoring the agent-parity invariant the whole art line breached.
   Second: the playtest loop, classic-first, then the aeon Aether outbound client.
3. **The 2C spec header overstates.** D2b's cross-act reach reporting (SBZ palette sources, LZ/SBZ3
   shared-file reach, underwater-palette warning) is not built; annotate the header rather than
   letting BUILT mean "except §D2b".
4. **Ratify the three §7 open decisions the code already settled:** paint lives as a tool-mode per
   tier (shipped); canvas docs are named sidecar files under `.aurora/canvas` (shipped); the budget
   readout shows unique/free/pool without comparing (shipped, deliberately). Write them into the
   spec so a cold session doesn't redesign shipped behaviour.
5. **ART_SUITE.md teaches a deleted UI** — rewrite against facets/paint-through or delete it.
6. **Retire `vram-coloring.ts`, `act-descriptor.ts`, `entity-data.ts`** (ordered 2026-07-03,
   §6-evidence says they're dead output, and they generate R8's misleading failure). Note the aeon
   save's export *step* goes with them.
7. **26 commits on master are unpushed** — the entire 2C line exists on one machine. *(Overseer
   note: 24 at the review pin by my count; either way, push.)*

## 8. Verified-clean — recorded so it is not re-litigated

The FMT seat's oracle work is the packet's bedrock: **Nemesis decoder byte-identical to
clownnemesis on all 156 real artnem files; the 9579a3b XOR+package-merge encoder round-trips
through the game-accurate oracle on all of them plus 301 stress cases (re-encode 1.027× total);
Kosinski decoder byte-identical to accurate-kosinski on all 9 .kos files and encoder output
*smaller* than Sega's on every one; KosinskiM all 95 real assets; Enigma decoder all 12 .eni files;
layout/startpos/colind/objpos byte-identical round-trips across every real file in the disasm.**
The one codec exception: the Enigma *encoder* emits every word as a full inline copy — files grow
1.33–2× on re-save with no size-regression test (FMT-A3, medium).

Also standing, with evidence in the seat files: tile-canon + flip composition mathematically sound
and empirically exact on real GHZ chunks (256/256 cells incl. solidity); D3/D5/D6 enforced at both
planner and store doors; line-0 palette protection double-doored; guarded classic write genuinely
guarded (mtime armed in production, tmp+rename atomic, orphan cleanup) with plants CAUGHT; every
classic domain writer self-check-gated against its real decoder *except* the colind tautology
above; core imports nothing from react/zustand/electron/renderer (0 violations, though nothing
enforces it — ARCH-A2); exactly 3 import cycles in 84k LOC; one palette colour model; no sync IPC
anywhere; zustand selector discipline clean renderer-wide; TileTab's repaint claim TRUE end-to-end;
buildUsageIndex and canvas-resolve linear; contextIsolation on, sandbox on, loopback bind, real
CSP, no child_process, no openExternal; both CDP fixes at the pin hold in the running app (per-tier
zoom, Assign-after-Paint) with drag-undo counts exact; session restore across a real SIGKILL
relaunch works; the late-mount listener class is closed for the two shared hooks; the aeon palette
live-preview — the original mutate-without-history member — is now correctly commit-on-teardown.

## 9. Known gaps in this packet

- **Verify coverage:** 29 of 31 crit/high verified (4-per-seat cap); UNDO-A5/A6 carry seat evidence
  only (§3). The 128 medium/low findings are seat-reported, unverified.
- **EDQUOT shell deaths** (FMT, DEAD, VIS, MAIN, STATE — partial): FMT's malformed-input
  reachability sweep for other codecs never ran (the Enigma/Nemesis decoders' EOF behaviour on
  truncated real files is unswept); VIS's aria/tabIndex/focus counts are lower bounds from reads,
  not greps; MAIN finished its channel-by-channel trace before dying.
- **Aeon runtime: zero CDP rows.** Every runtime finding against aeon (R6, R8, R9, R10, U1) is
  static-trace or verifier-executed-in-node, not app-driven.
- **`src/core/collision/` (the aeon/s4 system) unaudited**; the S&K profile bank unaudited.
- Sprite modules beyond the named findings; `indexed-png.ts` decode internals; atlas-migration.
- Previously diagnosed, still open, deliberately not re-reported: `export-sprite.ts:511` LevelArt
  sentinel (ENOENT on 12 id/zone pairs); `openDiscoveredSet` drops `tileIndexOffset` (silently
  mis-shifted pools for `$32`/`$61`). Both belong in the R-campaign backlog.

## 10. Recommended order for the implementing agent

1. **R1 + §4 planner campaign** (one branch: availability fix, colind-guard test, spelling-vs-
   identity match via the canonicaliser, reclaim zeroing, the GUARD-missed plants). This is the
   corruption class; everything else is loss-of-work, not wrong-bytes-on-disk.
2. **The perimeter batch:** R2 (agent gate), R3 (artStore in snapshot+teardown), R4 (port the
   sprite pattern), R5 (close guard). Four small diffs, all confirmed, all silent-loss.
3. **Aeon honesty batch:** R7, R8 (after the R-DIR-6 retirement decision), R6 (before anyone
   authors a second act), R9 + R10 + U1 as one window-mouseup/coalescing pass.
4. **R11** (kosinski bound) and **R13** (both flags on /mcp) — each is a fifteen-minute fix.
5. **R12, R14, U2–U7**, then the UX/VIS decision list (§5) as a polish pass.
6. Direction items (§7) are the owner's; the packet only executes what's ratified.

Every fix lands with the plant that proves its guard fires — 7 of 18 planted violations sailed
through this suite, and all 7 were in exactly the code this packet says to touch.
