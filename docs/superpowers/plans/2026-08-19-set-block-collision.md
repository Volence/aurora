# `set_block_collision` Implementation Plan (stage 5, plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the agent surface classic's collision-authoring tool — assign one collision shape index to the BLOCK under every cell of a rectangle expressed in 16px FG cell units, as one undo step, in Link or Isolate mode.

**Architecture:** One pure rectangle planner in `core/level-classic/collision-write.ts` merges every cell into a SINGLE store command (one `classicSetColind` for Link, one `classicPaintSurface` for Isolate). A new rectangle-addressed dispatch function is the tool's only write route, preserving the existing rule that the Link/Isolate decision exists in exactly one place. The existing single-cell panel path is rebuilt on the same per-cell classifier so the refusal wording exists once.

**Tech Stack:** TypeScript, Zod (protocol edge), Vitest (node suite), Electron + CDP (runtime proof), JSON-RPC over `POST /aether`.

---

## TRUST SOURCE OVER THIS PLAN

Five claims in the previous plan of this series were wrong and an implementer caught every one. Line numbers drift — other sessions share this repo. **Cite from source at the time you write, not from this document.** If a code block here disagrees with the file in front of you, the file wins; note the disagreement in your report rather than forcing the plan's version.

Two specific warnings:

- The single-cell planner `planCollisionWrite` is REBUILT in Task 3 on a shared classifier. If you are working Tasks 4+ and the classifier does not look like Task 3's code, read the real file — Task 3 may have landed differently for a good reason.
- `docs/superpowers/specs/2026-08-16-classic-collision-authoring-design.md` §4.5 is the tool's original design and it is **thin and partly wrong** — it describes a rectangle tool while mirroring a contract that only ever writes one cell, and it calls the section "MCP parity", which is a misnomer (see "Registry, not MCP" below). The section below supersedes it. Do not open a second spec.

---

## Decisions §4.5 did not settle

§4.5 is one paragraph. It answers none of the questions a rectangle raises. These five were decided on 2026-08-19 by a stand-in decision-maker after reading the source, and the reasoning is recorded here because the code will look arbitrary without it.

### D1 — The new entry point is RECTANGLE-addressed, not cell-addressed

`applyCollisionShape(shape)` (`src/renderer/state/collision-dispatch.ts`) is the only sanctioned write route: two source guards fail if the panel or the viewport assembles a plan or calls a store command itself (`src/renderer/components/classic/__tests__/collision-panel.test.ts` "routes every write through the dispatch helper", and `collision-probe-click.test.ts`'s equivalent). It takes only a shape and reads its target from `s.collisionProbe` — the cell the user last CLICKED.

**Rejected:** `applyCollisionShapeAt(x, y, shape, mode)` with the agent looping. Whoever loops is assembling a multi-cell plan, which puts plan assembly back outside the one sanctioned place the guards exist to protect, and N dispatch calls are N `commitArt` calls — N undo steps. That is D2 lost by construction.

**Decided:** `applyCollisionShapeRect(rect, shape, mode)` in `collision-dispatch.ts`, backed by a pure `planCollisionRect(doc, rect, shape, mode)` in `collision-write.ts` that returns ONE merged plan.

**And a correction worth stating, because the obvious refactor is wrong:** do NOT rebuild `applyCollisionShape(shape)` as "the degenerate 1×1 rectangle". Its contract is *refusal-as-answer-to-a-click* (`{ok:false, why}` on air, on block 0) and the rectangle's contract is *skip-as-ledger* (D3). Routing the shipped panel through skip machinery and then re-deriving a refusal from "everything was skipped" is churn on a working surface for no gain. Instead, both paths share a per-cell **classifier** inside `collision-write.ts`. The invariant that matters — Link/Isolate semantics and refusal wording exist exactly once — is preserved by a shared classifier in a shared file, not by forcing one signature onto two different contracts.

**`mode` never comes from `s.collisionDiverge` on the agent path.** That field (`classicLevelStore.ts:237`, defaults `'link'`) is the human's UI toggle. An agent's call must not be steered by whatever a person last clicked in the panel. The tool parameter supplies it, defaulting to `'link'`; only the probe-based panel path reads the store field. Note also that `collisionDiverge` is collision's OWN mode and is NOT the art tiers' `paintDivergeMode` — do not simplify them together.

### D2 — A rectangle is ONE undo step, and the mechanics are these

- **Link** — one `classicSetColind(entries)` call, which is one `commitArt`, which is one undo step. Cells sharing a block collapse to one entry. (Duplicate entries would be harmless — same value, last wins — but they are deduped so the reported counts are honest.)
- **Isolate** — one combined `SurfaceEditPlan` through one `classicPaintSurface`, which is one `commitArt`. That composite command exists precisely for this: its own header says splitting it "would let an undo strand a cloned block".
- **One clone per DISTINCT source block, not per cell** — and this is load-bearing, not an optimisation. `planSurfaceEdit` keys its clones by CHUNK CELL for the opposite reason (`classic-surface-plan.ts:165-168`: "two painted chunk cells that share a block each need their OWN clone", because each cell's pixels differ). Here every cell of the rectangle receives the SAME shape, so one clone serves them all. **Write that dependency down in a comment**: a future "paint varying shapes across a rectangle" feature silently breaks the per-block dedupe.
- **`chunkCellEdits` are deduped by `(chunkIndex, cellIndex)`.** A rectangle spanning two placements of the same chunk resolves to the same chunk-definition cell twice.
- **The merged planner owns the aggregate capacity checks, because `classicPaintSurface` has none.** It grows colind silently via `Math.max(nextBlocks.length, src.length)` and has no 1024-block ceiling check — `collision-write.test.ts`'s "refuses an isolate at the block ceiling" documents exactly that. With K distinct clones the conditions are `doc.blocks.length + K <= colind.length` and `doc.blocks.length + K <= 1024`.
- **Clone templates re-derive `xf`/`yf`/`solidity` from the CURRENT doc cell**, never from a cached probe — the same reason `planCollisionWrite` re-derives the block instead of trusting `probe.blockId`.
- **Inherent, and reported rather than hidden:** an Isolate repoints a chunk-definition cell, and chunks are shared zone-wide, so the change is visible at every placement of that chunk — not only inside the rectangle. This is already true of the shipped single-cell Isolate (§2.2 of the design). The reply surfaces it.

**Known and deliberately NOT optimised:** rectangle Isolate always clones, even for a block whose every use lies inside the rectangle, where Link would be outcome-identical and free. Keeping the shipped semantics is more predictable and mirrors the single-cell case. Booked as a possible follow-up, not this plan.

### D3 — Partial application, in two classes (this is the decision most worth re-challenging)

A rectangle drawn over a slope legitimately contains air, and block 0 is legitimately unwritable, so refusing an entire rectangle because it contains air makes the tool unusable. But "always partial" is also wrong. The split:

**Per-cell skips — the rest applies, and the reply reports counts per reason:**
`air`, `block0`, `already-this-shape` (counted as `noop`, not a skip), `outside-layout` (D5), and Link-mode `overhang` (block past the end of the colind table). All are cell-local, deterministic, and stable across re-invocation.

**Isolate resource exhaustion refuses the WHOLE call** (`isolate-grows-table`, `block-ceiling`), carrying "needs K new entries, N spare". Two reasons: half a slope is a state the agent must undo anyway; and *which* cells would land under a partial exhaustion is a function of row-major scan order — an implementation detail — so the resulting document state is not describable in the tool's contract and the caller cannot reason about it. Note this is already the shipped single-cell behaviour in GHZ and SBZ, where the refusal fires before clone #1.

**Rejected: all-or-nothing except air.** Block 0 is common inside terrain rectangles (blank interiors), and refusing on `already-this-shape` destroys idempotence — an agent retrying after a timeout must get `ok:true, applied:0, noop:N`, not a refusal.

**The success predicate, stated exactly:**

> `ok:false` if and only if `applied == 0 && noop == 0`.

A rectangle that is entirely already-correct is a SUCCESS — the world matches the request. A rectangle that is entirely air / block 0 / outside the layout is a REFUSAL, because it is almost certainly a coordinate mistake, and the message names which reason dominated.

### D4 — "Use Isolate" is a dead end, and this plan fixes the message

The brief this plan was written from claimed: *"Isolate is the ESCAPE from [the overhang], not blocked by it — the refusal message literally says 'Use Isolate, or edit a block within the table.'"* **That is false**, and the message is the defect.

From source: Link's overhang refusal fires only when `blockId >= colind.length`. Isolate's growth refusal fires when `doc.blocks.length + 1 > colind.length`. On any document whose chunk cells all reference blocks that exist — every real S1 zone, and anything Aurora itself writes — the first condition implies `doc.blocks.length > colind.length`, which implies the second. **The two conditions are the same condition**, so on such a document Isolate is refused for every cell whenever Link's overhang refusal can fire at all. GHZ (439 blocks / 410 entries) and SBZ (602/600) are the two zones where it exists at all; `collision-write.test.ts`'s isolate-growth test says so in as many words.

**One correction to that proof, found by checking source rather than trusting it.** The implication rests on "a valid doc has `blockId < doc.blocks.length`", and `validateLevelDoc` does **not** guarantee that: it bounds a chunk cell's block ref by the 10-bit field (`model.ts:276`, `inRange(..., c.block, 0, MAX_BLOCK_REF)`), not by `doc.blocks.length`. So a dangling ref is representable, and on such a document Isolate could survive where Link refuses. **Therefore the fix COMPUTES the escape instead of asserting it** — the planner has `doc` in hand, so it can simply ask whether an Isolate would fit and say what is true. That is robust either way and costs one boolean.

The mirrored defect is in Isolate's own refusal: *"Use Link, accepting it changes every use of block N"* — valid when `blockId < colind.length`, false for an overhang block, where both modes refuse and the block's collision is simply not editable in Aurora.

**Fixed in this plan, not booked**, for three reasons: the messages are provably wrong rather than merely stale (they were never true); the single-refusal-path architecture means the fix is one string per branch and repairs the human Collision panel and the agent tool at the same time — that is the "one place" design doing its job, not collateral damage; and this tool ships those messages to an agent that will *act* on them. A message instructing a guaranteed-refused retry is worse for an autonomous caller than for a human, who at least sees the second refusal and stops.

### D6 — A dangling block ref is refused, and that makes D4's escape a constant

**Found during Task 5, decided 2026-08-19.** `validateLevelDoc` bounds a chunk cell's `block` by the 10-bit field (`model.ts`, `inRange(..., c.block, 0, MAX_BLOCK_REF)`), **not** by `doc.blocks.length` — so a cell naming a block the document does not have is representable in a "valid" doc. On such a cell the Isolate path emits `def: doc.blocks[blockId]` = `undefined` into `newBlocks`, and `classicPaintSurface` does `b.def.cells.map(...)` (`classicLevelStore.ts:1025`) → **TypeError** → `-32603 INTERNAL` at the agent surface. Not a regression — the single-cell path has carried the same line since it shipped — but the rectangle path is what wires it to an agent.

**Decided: refuse it in `classifyCollisionCell`, as a new `no-such-block` skip reason.** Both paths inherit it, because `planCollisionWrite` was rebuilt on the classifier: the panel gets a refusal sentence, the rectangle gets a counted skip.

**The ordering is load-bearing: air → block0 → `no-such-block` → noop → overhang.** It must precede the NO-OP test, not merely follow block-0. The no-op test reads `(colind[blockId] ?? 0) === shapeIndex`, so a dangling ref past the table asked for shape 0 currently returns `noop` — reporting SUCCESS on garbage, which for an autonomous caller is worse than the crash it replaces.

**Rejected: guarding only the Isolate path.** It needs two guards, and it leaves Link writing a colind entry for a phantom block whenever `blocks.length <= blockId < colind.length` — a shape change for a block the document does not have, invisible in the editor. That is the same "writing bytes whose meaning you cannot see" this file's overhang refusals exist to prevent.

**Consequence, and it is the point.** A dangling ref was the ONLY thing that made `isolateFits` non-constant inside `escapeFromLinkOverhang` — which is exactly what D4's comment says. Refuse it first and an `overhang` skip implies `blockId < doc.blocks.length` and `blockId >= colind.length`, hence `doc.blocks.length > colind.length`, hence `isolateFits(doc, 1)` is **false**. So:

- `escapeFromLinkOverhang` collapses to the unconditional dead-end sentence, carrying the proof as a comment ("overhang implies blocks > colind, because no-such-block is refused first — if the classifier's order changes, revisit"). Keeping the dead branch would leave a false comment guarding code no document can reach, and therefore no test can pin.
- `isolateFits` then has no caller (Task 5's `planIsolateRect` uses the split form for its numbers) and is deleted; `planIsolateRect`'s comment tying its two checks back to it is rewritten to stand on its own.
- The test `still offers Isolate as the escape when Isolate would actually fit` does not merely become redundant — **its document now takes the `no-such-block` refusal before it ever reaches overhang**, so it must change either way. It is rewritten to pin the new refusal, and that rewritten test is what protects the simplification from a future reordering.

**In this change, not a follow-up**, because the tool being added is what exposes the crash to an agent, and because the escape computation and its test are this same series' work — deferring would churn the same lines twice.

### D5 — Cells outside the layout are skipped; the schema bounds come from the format, not from aeon

- **Out-of-layout cells skip** with reason `outside-layout`; the whole call refuses only when nothing at all was inside, which D3's predicate already covers. A rectangle hugging a level's right edge is a legitimate gesture, exactly like one containing air. **Do not silently clamp** — clamping hides the coordinate mistake the skip count exposes.
- **No 128-cell cap.** Aeon's unrelated `paint_collision` bounds x/y at 127 and w/h at 128 (`src/main/editor-methods.ts`); those encode aeon's fixed 128×128-cell sections — a format fact of a different engine, not a policy worth copying. Classic's format facts are `MAX_LAYOUT_W = 64` and `MAX_LAYOUT_H = 8` CHUNKS (`model.ts`), i.e. 1024 × 128 CELLS. The schema is bounded by those, derived from the constants rather than typed as literals, so a full-width row sweep is one call. Cells inside the schema box but outside the open act's actual `fg.width`/`fg.height` are the runtime `outside-layout` skips.
- Cost is a non-issue once cell addressing is O(1) (Task 1): the worst case is 131,072 cells of constant work.

### Registry, not MCP

`EDITOR_METHODS` (`src/main/editor-methods.ts`) is ONE registry feeding BOTH `mcp-server.ts` (as MCP tool `<name>`) and `aether/adapter.ts` (as Aether method `editor/<name>`). Adding one entry lights up both. §4.5's "MCP parity" heading is a misnomer; this is registry work.

**The tool is named `set_block_collision`, NOT `paint_collision`.** Aeon already owns `paint_collision` in this flat registry with different semantics (a collision-plane cell word including solidity, versus a shape index on the zone-wide BLOCK tier), and registry names must be globally unique. `set_level_palette` is the existing precedent for exactly this collision and carries a comment saying so.

### Refusals are results; faults throw

A REFUSAL is an ANSWER: `{ok:false, refusal, message, resolution, offers}` returned inside a SUCCESSFUL result. A FAULT throws. The Aether adapter maps a throw to `-32603 INTERNAL`, which claims *the server broke* — so throwing for a caller-fixable mistake lies to the client. `src/renderer/agent/art-commit.ts` is the worked example and `docs/superpowers/specs/2026-08-18-art-agent-surface-design.md` §4 is the rule.

For this tool: **faults** are "no classic level is open" and nothing else. Everything a caller could fix by changing an argument is a refusal.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/core/level-classic/collision-probe.ts` | Modify | Gains `locateCell(doc, cx, cy)` — cheap O(1) cell addressing. `probeCollision` is rebuilt on it so the addressing math exists once. |
| `src/core/level-classic/collision-write.ts` | Modify | Gains the per-cell classifier, the shared refusal wording (D4 fix), and `planCollisionRect`. Stays ONE file: its header's claim is "Link vs Isolate, decided once, with every refusal in one place", and splitting it would make that false. |
| `src/renderer/state/collision-dispatch.ts` | Modify | Gains `applyCollisionShapeRect`. Still the only sanctioned write route. |
| `src/core/level-classic/model.ts` | Modify | Exports `MAX_LAYOUT_W` / `MAX_LAYOUT_H` so the schema bounds are derived, not copied. |
| `src/shared/agent-protocol.ts` | Modify | New `classic-set-block-collision` request kind. |
| `src/main/editor-methods.ts` | Modify | New `set_block_collision` registry entry. |
| `src/renderer/agent/agent-handler.ts` | Modify | New case: validate, dispatch, shape the reply. |
| `src/core/level-classic/__tests__/collision-write.test.ts` | Modify | Rectangle planner + D4 message tests. |
| `src/core/level-classic/__tests__/collision-probe.test.ts` | Modify | `locateCell` tests + the delegation guard. |
| `src/renderer/state/__tests__/collision-dispatch.test.ts` | Modify | Rectangle dispatch tests. |
| `src/renderer/agent/__tests__/agent-handler.classic.test.ts` | Modify | Handler case tests + the agent-handler source guard. |
| `scratchpad/collision-agent-harness.mjs` | Create | Runtime proof over `POST /aether` against the real disassembly. |

---

## Baseline

Measured in this worktree before any change:

```
Test Files  292 passed | 1 skipped (293)
Tests  3201 passed | 3 skipped (3204)
```

`npm test` does **NOT** typecheck — `package.json` has no `typecheck` script and vitest does not typecheck. Run `npx tsc --noEmit` separately at every verification point.

**Known pre-existing failure, NOT this plan's:** `scratchpad/commit-collision-harness.mjs` reports 5/6. Proven not ours by A/B at commit `bd7700b`. Row 4's expectation is what is wrong — it asserts every new block gets `$FF` without accounting for the overhang. It belongs to stage 4. Do not "fix" it here.

---

## Task 1: `locateCell` — O(1) cell addressing

`probeCollision` costs a FULL layout scan (`chunkPlacements`) plus a FULL chunk-cell scan (`blockCells`) **per call**. Calling it once per cell of a rectangle is quadratic: a 1024×128 rectangle against GHZ's ~82 chunks would be ~131,072 × (82×256 + layout) operations. The rectangle planner needs only the addressing half.

**Files:**
- Modify: `src/core/level-classic/collision-probe.ts`
- Test: `src/core/level-classic/__tests__/collision-probe.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/core/level-classic/__tests__/collision-probe.test.ts`. Reuse whatever `doc()` fixture builder that file already defines — read it first; do not invent a second one.

```ts
describe('locateCell', () => {
  it('addresses a cell in 16px units and masks the loop bit', () => {
    const d = doc();
    // Whatever the fixture stamps at layout cell (0,0), cell (1,2) of that chunk
    // is chunk-definition cell index 2*16 + 1 = 33.
    const at = locateCell(d, 1, 2);
    expect(at).not.toBeNull();
    expect(at!.cellIndex).toBe(33);
  });

  it('returns null outside the layout, and for negative coordinates', () => {
    const d = doc();
    expect(locateCell(d, -1, 0)).toBeNull();
    expect(locateCell(d, 0, -1)).toBeNull();
    expect(locateCell(d, d.fg.width * 16, 0)).toBeNull();
    expect(locateCell(d, 0, d.fg.height * 16)).toBeNull();
  });

  it('reports air as chunkIndex null rather than throwing', () => {
    const d = doc();
    d.fg.cells[0] = 0; // layout byte 0 = air
    const at = locateCell(d, 0, 0);
    expect(at!.chunkId).toBe(0);
    expect(at!.chunkIndex).toBeNull();
  });

  it('is what probeCollision addresses through — same cellIndex for the same point', () => {
    // The guard against a SECOND copy of the addressing math. If probeCollision
    // stops delegating, these two drift silently and the rectangle tool writes
    // to different cells than the panel does.
    const d = doc();
    for (const [px, py] of [[0, 0], [17, 33], [255, 255], [256, 16]] as const) {
      const p = probeCollision(d, px, py);
      const at = locateCell(d, Math.floor(px / 16), Math.floor(py / 16));
      expect(at!.cellIndex, `cellIndex at ${px},${py}`).toBe(p!.cellIndex);
      expect(at!.chunkId, `chunkId at ${px},${py}`).toBe(p!.chunkId);
      expect(at!.chunkIndex, `chunkIndex at ${px},${py}`).toBe(p!.chunkIndex);
      expect(at!.loopAmbiguous, `loopAmbiguous at ${px},${py}`).toBe(p!.loopAmbiguous);
    }
  });
});
```

Add `locateCell` to that file's existing import from `../collision-probe`.

- [ ] **Step 2: Run to verify it fails**

```bash
cd .claude/worktrees/set-block-collision
npx vitest run src/core/level-classic/__tests__/collision-probe.test.ts
```

Expected: FAIL — `locateCell is not a function` / no exported member `locateCell`.

- [ ] **Step 3: Implement**

In `src/core/level-classic/collision-probe.ts`, add above `probeCollision`:

```ts
/**
 * Where a point lands in the FG plane, and nothing more.
 *
 * The cheap half of `probeCollision`: O(1), because it computes NO sharing
 * counts. Those two scans (`chunkPlacements` over the layout, `blockCells` over
 * every chunk cell) are what make a probe expensive, and a rectangle write does
 * not need them per cell.
 *
 * Takes CELL coordinates (16px units) because that is the unit the collision
 * facet and `set_block_collision` speak. `probeCollision` converts pixels and
 * delegates, so the addressing — the loop-bit mask, the chunk lookup, the
 * row-major cell index — exists exactly once.
 */
export interface CellAddress {
  /** 1-based engine chunk id, loop bit already masked off; 0 = air. */
  chunkId: number;
  /** Index into doc.chunks, or null for air. */
  chunkIndex: number | null;
  /** 0..255 within the chunk, row-major. */
  cellIndex: number;
  looping: boolean;
  loopAmbiguous: boolean;
}

/** Address one FG cell (16px units). Null outside the layout. */
export function locateCell(doc: LevelDoc, cx: number, cy: number): CellAddress | null {
  if (cx < 0 || cy < 0) return null;
  const col = Math.floor(cx / 16);
  const row = Math.floor(cy / 16);
  if (col >= doc.fg.width || row >= doc.fg.height) return null;

  const raw = doc.fg.cells[row * doc.fg.width + col] ?? 0;
  // Bit 7 marks a looping region. Masking it off is what `.specialtile` itself
  // does first; the one substitution it does not cover is `loopAmbiguous`.
  const chunkId = raw & 0x7f;
  const looping = (raw & 0x80) !== 0;
  return {
    chunkId,
    chunkIndex: chunkIndexForId(doc, chunkId),
    cellIndex: (cy % 16) * 16 + (cx % 16),
    looping,
    loopAmbiguous: looping && chunkId === LOOP_ALIAS.from,
  };
}
```

Then rewrite `probeCollision`'s head to delegate. Replace everything from `if (x < 0 || y < 0) return null;` down to and including the `const cellIndex = ...` line with:

```ts
  const at = locateCell(doc, Math.floor(x / 16), Math.floor(y / 16));
  if (!at) return null;
  const { chunkId, chunkIndex, cellIndex, looping, loopAmbiguous } = at;
```

Delete the now-dead `col`/`row`/`raw` locals and the second `chunkIndexForId` call. Keep everything below unchanged — `chunkPlacements`, the air early-return, `blockCells`, and the `reason` derivation are all still `probeCollision`'s own.

> The air early-return still reads `if (chunkIndex === null)`. Leave its returned object exactly as it is.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/core/level-classic/__tests__/collision-probe.test.ts
```
Expected: PASS, including the pre-existing probe tests — they are the real regression net for the delegation.

- [ ] **Step 5: Prove the delegation guard is not vacuous**

**Plant it in `probeCollision`, NOT in `locateCell`.** Breaking `locateCell` breaks BOTH sides identically, so the two still agree and the guard stays green — it is the pre-existing probe tests that fail. The defect this guard names is *`probeCollision` keeping its own second copy*, so that is what must be planted:

```ts
  // in probeCollision, instead of destructuring `at`:
  const { chunkId, chunkIndex, cellIndex, loopAmbiguous } = at;
  const looping = false;   // PLANTED
```

```bash
npx vitest run src/core/level-classic/__tests__/collision-probe.test.ts
```
Expected: FAIL with the guard's own labelled message (`looping, byte $81 at 0,0: expected true to be false`). **Restore**, re-run, expect PASS.

This step is not optional. Three guards in the previous plan of this series asserted nothing and were caught only by planting the defect they name.

- [ ] **Step 6: Full suite + typecheck**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
```
Expected: 3201+ passed, 3 skipped; tsc silent.

- [ ] **Step 7: Commit**

```bash
git add src/core/level-classic/collision-probe.ts src/core/level-classic/__tests__/collision-probe.test.ts
git commit -m "refactor(collision): one cell-addressing function, because the rectangle needs the cheap half"
git show --stat
```

---

## Task 2: The D4 message fix — stop recommending a mode that will also refuse

**Files:**
- Modify: `src/core/level-classic/collision-write.ts`
- Test: `src/core/level-classic/__tests__/collision-write.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `collision-write.test.ts`, inside the existing `describe('planCollisionWrite', ...)` block. Read the file's `doc()` and `probe()` helpers first and use them.

```ts
  it('does not send a LINK overhang refusal to Isolate when Isolate would also refuse', () => {
    // The GHZ/SBZ shape: more blocks than the table has entries. Link refuses
    // the overhang block; Isolate would have to grow the table over the same
    // overhang, so it refuses too. Telling the caller to "Use Isolate" is a
    // dead end presented as an escape — and an AGENT will act on it.
    const d = doc();
    d.collision.colind = new Uint8Array(2);          // 4 blocks, 2 entries
    const r = planCollisionWrite(d, probe(), 7, 'link');
    expect(r.kind).toBe('refused');
    const why = (r as { why: string }).why;
    expect(why).toMatch(/past the end/i);
    expect(why, 'recommends a mode that this same document refuses').not.toMatch(/Use Isolate/i);
    expect(why).toMatch(/restamp|within the table/i);
  });

  it('still offers Isolate as the escape when Isolate would actually fit', () => {
    // The other side of the same branch, so the fix is a COMPUTATION and not a
    // blanket deletion.
    //
    // Reaching this state needs a block ref PAST the table but with the table
    // still longer than the block list — i.e. a DANGLING ref, which is exactly
    // the hole in the "both refusals are the same condition" proof:
    // validateLevelDoc bounds a chunk cell's block by the 10-bit field, not by
    // doc.blocks.length. Unreachable on stock data, representable in the model,
    // and the reason the escape is computed instead of asserted.
    const d = doc();                                 // 4 blocks
    d.collision.colind = new Uint8Array(8);          // 8 entries — a clone fits
    d.chunks[0].cells[5] = { ...d.chunks[0].cells[5], block: 9 };  // 9 >= 8
    const r = planCollisionWrite(d, probe(), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/Use Isolate/i);
  });

  it('does not send an ISOLATE growth refusal to Link for a block Link cannot set', () => {
    // The mirrored defect. For an OVERHANG block both modes refuse, so "Use
    // Link, accepting it changes every use of block N" is false.
    // doc()'s probed cell already holds block 3; a 2-entry table puts it past
    // the end, and the clone at id 4 would grow that table by 3.
    const d = doc();
    d.collision.colind = new Uint8Array(2);
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    const why = (r as { why: string }).why;
    expect(why).toMatch(/adjacent|next zone/i);
    expect(why, 'recommends Link for a block Link refuses').not.toMatch(/Use Link/i);
  });

  it('still offers Link when the block IS within the table', () => {
    // Table exactly as long as the block list: the clone at id 4 still grows it
    // (by 1), so isolate refuses — but block 3 is inside it, so Link genuinely
    // is the escape here.
    const d = doc();
    d.collision.colind = new Uint8Array(4);
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/Use Link/i);
  });
```

> **Read `doc()` and `probe()` before writing, and re-derive every number above.** These tests depend on the fixture shipping 4 blocks and on `probe()` naming `chunkIndex 0 / cellIndex 5`, whose block is 3. If the fixture differs, recompute the table lengths so each test still lands on the branch its name describes — and say in your report which numbers you changed and why. Do NOT reshape the fixture; other tests depend on it.

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts
```
Expected: FAIL on the two "does not send…" tests (`Use Isolate` / `Use Link` present). The two "still offers…" tests should already PASS — they assert the behaviour that is currently unconditional, which is what makes them the regression net for the fix.

- [ ] **Step 3: Implement**

In `src/core/level-classic/collision-write.ts`, add above `planCollisionWrite`:

```ts
/**
 * Would an Isolate clone fit in this document at all?
 *
 * Isolate appends ONE block at `doc.blocks.length` and `classicPaintSurface`
 * then grows colind to cover it — which necessarily defines every entry in
 * between, and any of those past the table's current end resolve into the
 * ADJACENT ZONE's table in ROM. So a clone "fits" only when the table already
 * covers the id, and when the 10-bit block field still has room.
 */
function isolateFits(doc: LevelDoc, clones: number): boolean {
  const next = doc.blocks.length + clones;
  return next <= doc.collision.colind.length && next <= MAX_BLOCKS_TOTAL;
}

/**
 * THE ESCAPE SENTENCE, COMPUTED RATHER THAN ASSERTED.
 *
 * Both refusals used to end by recommending the OTHER mode unconditionally, and
 * on the documents where they fire that advice is usually a dead end: Link's
 * overhang refusal needs `blockId >= colind.length`, which on any document whose
 * chunk cells reference blocks that exist means `doc.blocks.length >
 * colind.length`, which is exactly what makes Isolate refuse too. GHZ (439
 * blocks / 410 entries) and SBZ (602/600) are the two stock zones where this is
 * real.
 *
 * It is COMPUTED and not asserted because the implication has a hole:
 * `validateLevelDoc` bounds a chunk cell's block ref by the 10-bit field
 * (model.ts, `inRange(..., c.block, 0, MAX_BLOCK_REF)`), NOT by
 * `doc.blocks.length` — so a dangling ref is representable and would break the
 * proof. Asking the document is robust either way and costs one boolean.
 *
 * This matters more for an agent than for a person: a human sees the second
 * refusal and stops, while an autonomous caller acts on the sentence.
 */
function escapeFromLinkOverhang(doc: LevelDoc): string {
  if (isolateFits(doc, 1)) return 'Use Isolate, or edit a block within the table.';
  return `Isolate cannot escape it either — this zone ships ${doc.blocks.length} blocks against ${doc.collision.colind.length} entries, so a clone would grow the table over the same overhang. Edit a block within the table, or restamp this cell to a block that is.`;
}

function escapeFromIsolateGrowth(doc: LevelDoc, blockId: number): string {
  if (blockId < doc.collision.colind.length) {
    return `Use Link, accepting it changes every use of block ${blockId}.`;
  }
  return `Link cannot set block ${blockId} either — it is past the end of the table. Edit a block within the table, or restamp this cell to a block that is.`;
}
```

Then in `planCollisionWrite`'s link-overhang branch, replace the trailing `Use Isolate, or edit a block within the table.` with `${escapeFromLinkOverhang(doc)}`, and in the isolate-growth branch replace the trailing `Use Link, accepting it changes every use of block ${blockId}.` with `${escapeFromIsolateGrowth(doc, blockId)}`.

Leave every other word of both messages alone — the existing tests match `/adjacent|next zone|past the end/i` and `/3 entr/`, and those must keep passing.

- [ ] **Step 4: Run to verify**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts
```
Expected: PASS, all four new tests plus the pre-existing overhang tests.

- [ ] **Step 5: Full suite + typecheck**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
```

The Collision panel renders these same strings; no test pins their full text, but confirm with:

```bash
grep -rn "Use Isolate\|Use Link" src | grep -v __tests__
```
Expected: only the two `collision-write.ts` helper functions.

- [ ] **Step 6: Commit**

```bash
git add src/core/level-classic/collision-write.ts src/core/level-classic/__tests__/collision-write.test.ts
git commit -m "fix(collision): stop sending a refusal to the mode that also refuses"
git show --stat
```

---

## Task 3: The shared per-cell classifier

`planCollisionWrite` currently decides air / block 0 / no-op / overhang inline. The rectangle planner needs the identical decision for every cell. Extract it so the two share one copy, and rebuild `planCollisionWrite` on it — its existing tests are the proof that nothing changed.

**Files:**
- Modify: `src/core/level-classic/collision-write.ts`
- Test: `src/core/level-classic/__tests__/collision-write.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('classifyCollisionCell', () => {
  it('names each per-cell outcome without deciding the write', () => {
    const d = doc();
    const at = (chunkIndex: number | null, cellIndex: number) =>
      ({ chunkId: 1, chunkIndex, cellIndex, looping: false, loopAmbiguous: false });

    expect(classifyCollisionCell(d, at(null, 0), 7, 'link').kind).toBe('skip');
    expect((classifyCollisionCell(d, at(null, 0), 7, 'link') as { reason: string }).reason).toBe('air');

    d.chunks[0].cells[1] = { ...d.chunks[0].cells[1], block: 0 };
    expect((classifyCollisionCell(d, at(0, 1), 7, 'link') as { reason: string }).reason).toBe('block0');

    // A block that already carries the shape is a no-op, in EITHER mode.
    d.chunks[0].cells[2] = { ...d.chunks[0].cells[2], block: 1 };
    d.collision.colind = new Uint8Array([0, 7, 0, 0]);
    expect(classifyCollisionCell(d, at(0, 2), 7, 'link').kind).toBe('noop');
    expect(classifyCollisionCell(d, at(0, 2), 7, 'isolate').kind).toBe('noop');

    // Link mode only: past the end of the table.
    d.collision.colind = new Uint8Array(1);
    expect((classifyCollisionCell(d, at(0, 2), 7, 'link') as { reason: string }).reason).toBe('overhang');
    // Isolate does not have a per-cell overhang skip — its limit is aggregate.
    expect(classifyCollisionCell(d, at(0, 2), 7, 'isolate').kind).toBe('write');

    // The ordinary case carries the block and the cell back out.
    d.collision.colind = new Uint8Array([0, 3, 0, 0]);
    const w = classifyCollisionCell(d, at(0, 2), 7, 'link');
    expect(w).toMatchObject({ kind: 'write', blockId: 1, chunkIndex: 0, cellIndex: 2 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts
```
Expected: FAIL — `classifyCollisionCell is not a function`.

- [ ] **Step 3: Implement**

In `collision-write.ts`:

```ts
import type { CellAddress } from './collision-probe';
import type { ChunkCell } from './model';

/**
 * Why one cell of a write is not written. Every one of these is CELL-LOCAL,
 * deterministic and stable across re-invocation, which is what makes them safe
 * to skip past rather than refuse on (see the plan's D3). The aggregate limits
 * — colind growth and the 1024-block ceiling — are deliberately NOT here: they
 * are properties of the whole call, and a partial application of them would
 * depend on scan order.
 */
export type CollisionSkipReason = 'outside-layout' | 'air' | 'block0' | 'overhang';

export type CollisionCellOutcome =
  | { kind: 'write'; blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }
  /** The block already carries this shape. Success, not a skip. */
  | { kind: 'noop' }
  | { kind: 'skip'; reason: CollisionSkipReason };

/**
 * THE PER-CELL DECISION, in one place, for both the single-cell panel path and
 * the rectangle tool. Everything except the aggregate capacity limits.
 *
 * Re-derives the block from `doc` rather than trusting any cached address — a
 * probe survives undo, so it can name a block the cell no longer references.
 */
export function classifyCollisionCell(
  doc: LevelDoc,
  at: CellAddress,
  shapeIndex: number,
  mode: CollisionWriteMode,
): CollisionCellOutcome {
  if (at.chunkIndex === null) return { kind: 'skip', reason: 'air' };

  const cell = doc.chunks[at.chunkIndex]?.cells[at.cellIndex];
  const blockId = cell?.block ?? 0;

  // Block 0 is the blank block. FindFloor short-circuits before it ever reads
  // solidity or colind, so a shape stored here can never apply in game.
  if (blockId === 0) return { kind: 'skip', reason: 'block0' };

  // ALREADY THIS SHAPE → nothing to do, in EITHER mode. Isolate's cost for a
  // no-op is far higher than a wasted undo entry: it would clone a block and
  // spend a colind entry to arrive at collision identical to the block it
  // copied — exactly the capacity this file's refusals exist to protect.
  if ((doc.collision.colind[blockId] ?? 0) === shapeIndex) return { kind: 'noop' };

  // THE OVERHANG, link mode only. A block id past the end of the colind table
  // resolves into the ADJACENT ZONE's table in ROM, so writing it would
  // silently redefine another zone's collision. Isolate has no per-cell
  // equivalent: it never writes the existing id, and its own limit is aggregate.
  if (mode === 'link' && blockId >= doc.collision.colind.length) {
    return { kind: 'skip', reason: 'overhang' };
  }

  return { kind: 'write', blockId, chunkIndex: at.chunkIndex, cellIndex: at.cellIndex, cell: cell! };
}
```

Now rebuild `planCollisionWrite` on it. Replace its body from the `if (probe.chunkIndex === null)` guard down to (but NOT including) the `if (mode === 'link')` block with:

```ts
  const at: CellAddress = {
    chunkId: probe.chunkId,
    chunkIndex: probe.chunkIndex,
    cellIndex: probe.cellIndex,
    looping: probe.looping,
    loopAmbiguous: probe.loopAmbiguous,
  };
  const outcome = classifyCollisionCell(doc, at, shapeIndex, mode);

  // A SKIP IS A REFUSAL ON THIS PATH, and that asymmetry is deliberate. This is
  // the answer to a CLICK: the person aimed at one cell, and "nothing happened"
  // with no sentence is the worst possible reply. The rectangle path turns the
  // same outcomes into counts instead, because a rectangle over a slope
  // legitimately contains air. Same classifier, two contracts.
  if (outcome.kind === 'skip') return { kind: 'refused', why: skipRefusal(doc, outcome.reason, blockIdAt(doc, at)) };
  if (outcome.kind === 'noop') return { kind: 'noop' };

  const { blockId, cell } = outcome;
  const colind = doc.collision.colind;

  const warnings: string[] = [];
  // $28 behind a loop may be read as $51 while the player's sprite_looping_bit
  // is set — runtime state no editor can see. Valid for one of the two answers,
  // so it proceeds rather than being refused, and says so.
  if (probe.loopAmbiguous) {
    warnings.push(
      'this cell is behind a loop: the engine may read chunk $51 instead of $28 while the player is looping, so this write may not be the one that applies',
    );
  }

  if (mode === 'link') return { kind: 'link', entries: [{ blockId, value: shapeIndex }], warnings };
```

…and delete the link branch's now-duplicated overhang refusal (it is `skipRefusal`'s job). Keep the isolate branch below exactly as it is except that `newBlockId`, the ceiling refusal and the growth refusal stay, and `cell!` becomes `cell`.

Add the two helpers:

```ts
/** The block a cell references right now, or 0. Used only for refusal wording. */
function blockIdAt(doc: LevelDoc, at: CellAddress): number {
  return (at.chunkIndex === null ? 0 : doc.chunks[at.chunkIndex]?.cells[at.cellIndex]?.block) ?? 0;
}

/**
 * The one sentence for each skip reason, shared by the panel (which shows it as
 * a refusal) and the agent tool (which shows it as the dominant reason when a
 * whole rectangle skipped). Written once so the two cannot drift.
 */
export function skipRefusal(doc: LevelDoc, reason: CollisionSkipReason, blockId: number): string {
  switch (reason) {
    case 'outside-layout':
      return `this cell is outside the act's layout (${doc.fg.width * 16} x ${doc.fg.height * 16} cells)`;
    case 'air':
      return 'no chunk is stamped here — this cell is air';
    case 'block0':
      return 'block 0 is the blank block — the engine short-circuits before reading its collision, so a shape here can never apply';
    case 'overhang':
      return `block ${blockId} is past the end of this zone's collision table (${doc.collision.colind.length} entries) — the overhang resolves into the adjacent zone's table in ROM, so Aurora cannot set it without silently changing other blocks. ${escapeFromLinkOverhang(doc)}`;
  }
}
```

- [ ] **Step 4: Run the whole collision suite**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts src/renderer/state/__tests__/collision-dispatch.test.ts
```
Expected: PASS — every pre-existing `planCollisionWrite` test included. **They are the acceptance criterion for this task**: the refactor is correct exactly when they pass untouched. If you find yourself editing an old test to make it pass, stop — the refactor changed behaviour, which it must not.

- [ ] **Step 5: Full suite + typecheck, then commit**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
git add src/core/level-classic/collision-write.ts src/core/level-classic/__tests__/collision-write.test.ts
git commit -m "refactor(collision): one per-cell classifier, two contracts on top of it"
git show --stat
```

---

## Task 4: `planCollisionRect` — Link mode

**Files:**
- Modify: `src/core/level-classic/collision-write.ts`
- Test: `src/core/level-classic/__tests__/collision-write.test.ts`

- [ ] **Step 1: FIRST give the test fixture an `fg` plane — it has none**

`collision-write.test.ts`'s `doc()` builds a PARTIAL document and casts it: `{ chunks, blocks, collision } as unknown as LevelDoc`. It has **no `fg` field**, because `planCollisionWrite` never needed one — it takes a pre-resolved `CollisionProbe`. `planCollisionRect` addresses cells itself, so it reads `doc.fg` and would throw on this fixture.

Add the plane to `doc()` (purely additive; no existing test reads it):

```ts
    fg: { width: 2, height: 1, cells: new Uint8Array([1, 1]) },
```

**The cell grid this creates, which every test below is written against:** two layout columns, both stamping engine chunk id 1 → `chunkIndexForId` → `doc.chunks[0]`. So the act is **32 cells wide × 16 cells tall**, and

```
cellIndex = (cy % 16) * 16 + (cx % 16)
```

Two consequences the tests use deliberately: cell `(0,0)` and cell `(16,0)` are **the same chunk-definition cell** (index 0) reached through two placements, and any `cx >= 32` or `cy >= 16` is outside the layout.

- [ ] **Step 2: Write the failing tests**

```ts
describe('planCollisionRect — link', () => {
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  /** doc() with the four cells of the top-left 2x2 pointed at real blocks. */
  const withCells = (assign: [number, number][]) => {
    const d = doc();
    for (const [cellIndex, block] of assign) {
      d.chunks[0].cells[cellIndex] = { block, xf: false, yf: false, solidity: 3 };
    }
    return d;
  };

  it('collapses cells sharing a block into ONE colind entry', () => {
    const d = withCells([[0, 1], [1, 1], [16, 1], [17, 1]]);
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'link');
    expect(r.kind).toBe('link');
    expect((r as { entries: unknown[] }).entries).toEqual([{ blockId: 1, value: 7 }]);
    expect(r.report.applied).toBe(4);   // four CELLS
    expect(r.report.blocks).toBe(1);    // one BLOCK
  });

  it('applies the writable cells and reports the skipped ones by reason', () => {
    // cell 0 → block 1 (writes), cell 1 → block 0 (skip), cell 16 → block 2
    // (writes), cell 17 → block 3 which ALREADY holds 7 (noop).
    const d = withCells([[0, 1], [1, 0], [16, 2], [17, 3]]);
    d.collision.colind[3] = 7;
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(2);
    expect(r.report.noop).toBe(1);
    expect(r.report.skipped).toEqual([{ reason: 'block0', count: 1 }]);
  });

  it('skips cells outside the layout instead of clamping or refusing', () => {
    // The act is 32 cells wide; ask for 36.
    const d = withCells([[0, 1]]);
    const r = planCollisionRect(d, rect(0, 0, 36, 1), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.skipped.find((s) => s.reason === 'outside-layout')!.count).toBe(4);
  });

  it('is SUCCESS with no command when every cell already carries the shape', () => {
    // Idempotence. An agent retrying after a timeout must not get a refusal.
    const d = withCells([[0, 1]]);
    d.collision.colind[1] = 7;
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'link');
    expect(r.kind).toBe('nothing');
    expect(r.report.applied).toBe(0);
    expect(r.report.noop).toBe(1);
  });

  it('REFUSES when nothing was applied and nothing already matched', () => {
    // doc()'s cells are all block 0 except cell 5; the 2x2 at the origin misses it.
    const d = doc();
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { refusal: { kind: string } }).refusal.kind).toBe('nothing-applicable');
    expect((r as { why: string }).why).toMatch(/blank block 0/i);
  });

  it('skips a LINK overhang block and still applies the rest', () => {
    // Block 3 is past a 2-entry table; block 1 is not.
    const d = withCells([[0, 1], [1, 3]]);
    d.collision.colind = new Uint8Array(2);
    const r = planCollisionRect(d, rect(0, 0, 2, 1), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(1);
    expect(r.report.skipped).toEqual([{ reason: 'overhang', count: 1 }]);
  });

  it('counts loop-ambiguous cells in ONE warning rather than one per cell', () => {
    // Needs the act to actually own engine chunk id $28, so build the pool out
    // to it. LOOP_ALIAS.from is $28 and chunkIndexForId is id - 1.
    const d = doc();
    const blank = () => ({ cells: Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 })) });
    d.chunks = Array.from({ length: LOOP_ALIAS.from }, blank);
    d.chunks[LOOP_ALIAS.from - 1].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
    d.chunks[LOOP_ALIAS.from - 1].cells[1] = { block: 1, xf: false, yf: false, solidity: 3 };
    d.fg = { width: 1, height: 1, cells: new Uint8Array([0x80 | LOOP_ALIAS.from]) };
    const r = planCollisionRect(d, rect(0, 0, 2, 1), 7, 'link');
    expect(r.report.warnings.length).toBe(1);
    expect(r.report.warnings[0]).toMatch(/\$51/);
    expect(r.report.warnings[0]).toMatch(/^2 cells/);
  });

  it('reports the LINK blast radius in chunk-definition cells', () => {
    // Link changes the block ZONE-wide. The rectangle is not the blast radius,
    // and an agent reading only `applied` would think it was.
    const d = withCells([[0, 1], [200, 1]]);   // cell 200 is outside the rect
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'link');
    expect(r.report.applied).toBe(1);
    expect(r.report.blockCellsAffected).toBe(2);
  });
});
```

Add `LOOP_ALIAS` to the file's import from `../collision-probe`.

> **On `skipRefusal`'s `outside-layout` arm.** Task 3 added it for switch exhaustiveness over `CollisionSkipReason`, and NO caller renders it — the rectangle's summary sentence uses `skipPhrase` (below) instead, because a rectangle has no single block to name and `skipRefusal`'s overhang arm needs one. Leave the arm in place; removing it breaks the exhaustive switch. Note that it reads `doc.fg.width/height`, which is the other reason Step 1's fixture change is required.

> **The scanner MANUFACTURES `outside-layout`.** `classifyCollisionCell` never returns it — a `CellAddress` already implies the cell is inside the layout, because `locateCell` returns `null` outside. So the rectangle loop produces that reason itself when `locateCell` comes back null, before the classifier is consulted.

- [ ] **Step 3: Run to verify it fails**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts
```
Expected: FAIL — `planCollisionRect is not a function`.

- [ ] **Step 4: Implement (link path only; isolate returns a stub that Task 5 replaces)**

```ts
export interface CollisionRect { x: number; y: number; w: number; h: number }

export interface CollisionRectReport {
  mode: CollisionWriteMode;
  /** CELLS whose block did not carry the shape and now will. */
  applied: number;
  /** CELLS whose block already carried it. Success, not a skip. */
  noop: number;
  skipped: { reason: CollisionSkipReason; count: number }[];
  /** DISTINCT blocks written. */
  blocks: number;
  /**
   * LINK only. Chunk-DEFINITION cells naming a written block — NOT map
   * positions, and not the rectangle. A link changes the block everywhere it is
   * used, zone-wide, and this is the closest honest number the editor can give
   * cheaply. It still UNDERSTATES the real reach, which is each of these
   * multiplied by its chunk's placements across all three acts.
   */
  blockCellsAffected?: number;
  /** ISOLATE only. */
  isolate?: { blocksCloned: number; chunkCellsRepointed: number; chunksTouched: number };
  warnings: string[];
}

export type CollisionRectRefusal =
  | { kind: 'nothing-applicable'; skipped: { reason: CollisionSkipReason; count: number }[] }
  | { kind: 'isolate-grows-table'; needed: number; spare: number; colindLength: number; blocks: number }
  | { kind: 'block-ceiling'; needed: number; spare: number };

export type CollisionRectPlan =
  | { kind: 'link'; entries: { blockId: number; value: number }[]; report: CollisionRectReport }
  | { kind: 'isolate'; plan: SurfaceEditPlan; report: CollisionRectReport }
  /** Everything already carried the shape. Success, and NO command to dispatch. */
  | { kind: 'nothing'; report: CollisionRectReport }
  | { kind: 'refused'; refusal: CollisionRectRefusal; why: string; resolution: string; report: CollisionRectReport };

/**
 * Plan ONE write of `shapeIndex` across every cell of `rect`, in `mode`.
 *
 * WHY THIS IS A RECTANGLE AND NOT A LOOP OVER `planCollisionWrite`: a rectangle
 * must be one undo step, and one undo step means one store command. Isolate in
 * particular cannot be looped — every call would compute the same
 * `doc.blocks.length` for its clone id and they would collide.
 *
 * PARTIAL BY DESIGN, in one direction only. Per-cell skips (air, block 0, a
 * link-mode overhang block, cells past the layout edge) are expected inside any
 * real rectangle — a slope's bounding box contains air — so they are counted and
 * stepped over. The AGGREGATE limits are not: which cells would land under a
 * half-satisfied clone budget is a function of scan order, so those refuse the
 * whole call. See the plan's D3.
 */
export function planCollisionRect(
  doc: LevelDoc,
  rect: CollisionRect,
  shapeIndex: number,
  mode: CollisionWriteMode,
): CollisionRectPlan {
  const skips = new Map<CollisionSkipReason, number>();
  const bump = (r: CollisionSkipReason) => skips.set(r, (skips.get(r) ?? 0) + 1);
  const writes: { blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }[] = [];
  let noop = 0;
  let ambiguous = 0;

  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const at = locateCell(doc, rect.x + dx, rect.y + dy);
      if (!at) { bump('outside-layout'); continue; }
      const outcome = classifyCollisionCell(doc, at, shapeIndex, mode);
      if (outcome.kind === 'skip') { bump(outcome.reason); continue; }
      if (outcome.kind === 'noop') { noop++; continue; }
      if (at.loopAmbiguous) ambiguous++;
      writes.push(outcome);
    }
  }

  const skipped = [...skips].map(([reason, count]) => ({ reason, count }));
  const warnings: string[] = [];
  // ONE warning carrying a count, not one per cell: a rectangle across a loop
  // would otherwise return hundreds of identical sentences.
  if (ambiguous > 0) {
    warnings.push(
      `${ambiguous} cell${ambiguous === 1 ? ' is' : 's are'} behind a loop: the engine may read chunk $51 instead of $28 while the player is looping, so those writes may not be the ones that apply`,
    );
  }

  const distinct = [...new Set(writes.map((w) => w.blockId))];
  const base: CollisionRectReport = {
    mode, applied: writes.length, noop, skipped, blocks: distinct.length, warnings,
  };

  // THE SUCCESS PREDICATE, stated once. Nothing written AND nothing already
  // right is a refusal — almost always a coordinate mistake. Nothing written
  // but something already right is SUCCESS: the world matches the request, and
  // an agent retrying after a timeout must not be told it failed.
  if (writes.length === 0 && noop === 0) {
    return {
      kind: 'refused',
      refusal: { kind: 'nothing-applicable', skipped },
      why: dominantSkipWhy(skipped),
      resolution: 'Check the rectangle\'s coordinates: they are in 16px FG CELL units, not pixels and not chunks.',
      report: base,
    };
  }
  if (writes.length === 0) return { kind: 'nothing', report: base };

  if (mode === 'link') {
    let blockCellsAffected = 0;
    const written = new Set(distinct);
    for (const c of doc.chunks) for (const cc of c.cells) if (written.has(cc.block)) blockCellsAffected++;
    return {
      kind: 'link',
      entries: distinct.map((blockId) => ({ blockId, value: shapeIndex })),
      report: { ...base, blockCellsAffected },
    };
  }

  return planIsolateRect(doc, writes, distinct, shapeIndex, base); // Task 5
}

/**
 * A short phrase per skip reason, for counting rather than for explaining.
 *
 * DELIBERATELY NOT `skipRefusal`. That function writes the single-cell
 * refusal, and two of its sentences are about a SPECIFIC block ("block 412 is
 * past the end of..."). A rectangle's summary has no single block to name, and
 * passing a placeholder id would print a confident sentence about block 0 —
 * which is a different refusal entirely.
 */
function skipPhrase(reason: CollisionSkipReason): string {
  switch (reason) {
    case 'outside-layout': return 'outside the layout';
    case 'air': return 'air — no chunk is stamped there';
    case 'block0': return 'the blank block 0, whose collision the engine never reads';
    case 'overhang': return 'blocks past the end of this zone\'s collision table';
  }
}

/**
 * The sentence for a rectangle that wrote nothing: the reason that accounted for
 * the most cells, so "you aimed at air" and "you aimed at blank blocks" are
 * distinguishable. Ties break by the array's own order, which is first-seen in
 * row-major scan — deterministic, and the tie is cosmetic.
 */
function dominantSkipWhy(skipped: { reason: CollisionSkipReason; count: number }[]): string {
  const total = skipped.reduce((n, s) => n + s.count, 0);
  const top = skipped.reduce((a, b) => (b.count > a.count ? b : a));
  return `no cell in this rectangle could take a shape — ${top.count} of ${total} ${top.count === 1 ? 'is' : 'are'} ${skipPhrase(top.reason)}`;
}
```

Add `locateCell` and `CellAddress` to the import from `./collision-probe`.

For this task only, stub the isolate path so the file compiles:

```ts
function planIsolateRect(
  doc: LevelDoc,
  writes: { blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }[],
  distinct: number[],
  shapeIndex: number,
  base: CollisionRectReport,
): CollisionRectPlan {
  throw new Error('planIsolateRect: implemented in task 5');
}
```

- [ ] **Step 5: Run to verify the link tests pass**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts
```
Expected: PASS on every `planCollisionRect — link` test and every pre-existing test.

- [ ] **Step 6: Full suite + typecheck, then commit**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
git add src/core/level-classic/collision-write.ts src/core/level-classic/__tests__/collision-write.test.ts
git commit -m "feat(collision): plan a rectangle as one link write"
git show --stat
```

---

## Task 5: `planCollisionRect` — Isolate mode and the aggregate limits

**Files:**
- Modify: `src/core/level-classic/collision-write.ts`
- Test: `src/core/level-classic/__tests__/collision-write.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('planCollisionRect — isolate', () => {
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

  /** A doc with room to clone: table longer than the block list. */
  const roomy = () => {
    const d = doc();
    d.collision.colind = new Uint8Array(64);
    return d;
  };

  it('mints ONE clone per distinct block, not one per cell', () => {
    // The dedupe that `planSurfaceEdit` deliberately does NOT do (it keys clones
    // by chunk cell, because each cell's PIXELS differ). Here every cell gets
    // the same SHAPE, so one clone serves them all.
    const d = roomy();
    for (const i of [0, 1, 16, 17]) d.chunks[0].cells[i] = { ...d.chunks[0].cells[i], block: 1 };
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'isolate');
    expect(r.kind).toBe('isolate');
    const plan = (r as { plan: SurfaceEditPlan }).plan;
    expect(plan.newBlocks.length).toBe(1);
    expect(plan.newBlocks[0].colind).toBe(7);
    expect(plan.newBlocks[0].sourceBlockId).toBe(1);
    expect(plan.chunkCellEdits.length).toBe(4);
    // Every repointed cell names the ONE clone.
    const cloneId = d.blocks.length;
    expect(new Set(plan.chunkCellEdits.map((e) => e.cell.block))).toEqual(new Set([cloneId]));
    expect(r.report.isolate).toEqual({ blocksCloned: 1, chunkCellsRepointed: 4, chunksTouched: 1 });
  });

  it('gives each distinct block its own clone id, in order', () => {
    const d = roomy();
    d.chunks[0].cells[0] = { ...d.chunks[0].cells[0], block: 1 };
    d.chunks[0].cells[1] = { ...d.chunks[0].cells[1], block: 2 };
    const r = planCollisionRect(d, rect(0, 0, 2, 1), 7, 'isolate');
    const plan = (r as { plan: SurfaceEditPlan }).plan;
    expect(plan.newBlocks.map((b) => b.sourceBlockId)).toEqual([1, 2]);
    expect(plan.chunkCellEdits.map((e) => e.cell.block)).toEqual([d.blocks.length, d.blocks.length + 1]);
  });

  it('carries each cell\'s OWN flips and solidity onto the repoint', () => {
    // Re-derived from the doc, never from a cached probe, and never shared
    // between cells: two cells can use one block with different solidity.
    const d = roomy();
    d.chunks[0].cells[0] = { block: 1, xf: true, yf: false, solidity: 1 };
    d.chunks[0].cells[1] = { block: 1, xf: false, yf: true, solidity: 3 };
    const r = planCollisionRect(d, rect(0, 0, 2, 1), 7, 'isolate');
    const edits = (r as { plan: SurfaceEditPlan }).plan.chunkCellEdits;
    expect(edits[0].cell).toMatchObject({ xf: true, yf: false, solidity: 1 });
    expect(edits[1].cell).toMatchObject({ xf: false, yf: true, solidity: 3 });
  });

  it('de-duplicates chunk-cell edits when the rectangle spans two placements of one chunk', () => {
    const d = roomy();
    d.fg.cells[0] = 1;
    d.fg.cells[1] = 1;                      // the SAME chunk, stamped twice
    d.chunks[0].cells[0] = { ...d.chunks[0].cells[0], block: 1 };
    // Cell (0,0) and cell (16,0) are both chunk-definition cell 0 of chunk 1.
    const r = planCollisionRect(d, { x: 0, y: 0, w: 17, h: 1 }, 7, 'isolate');
    const edits = (r as { plan: SurfaceEditPlan }).plan.chunkCellEdits;
    const keys = edits.map((e) => `${e.chunkIndex}:${e.cellIndex}`);
    expect(new Set(keys).size, 'duplicate chunk-cell edits').toBe(keys.length);
    expect(keys).toContain('0:0');
  });

  it('REFUSES the whole call when the clones would grow the colind table', () => {
    // GHZ/SBZ's shape, and the reason a partial application is not offered: which
    // cells landed would depend on scan order.
    const d = doc();
    d.collision.colind = new Uint8Array(d.blocks.length);   // zero spare
    d.chunks[0].cells[0] = { ...d.chunks[0].cells[0], block: 1 };
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'isolate');
    expect(r.kind).toBe('refused');
    const ref = (r as { refusal: { kind: string; needed: number; spare: number } }).refusal;
    expect(ref.kind).toBe('isolate-grows-table');
    expect(ref.needed).toBe(1);
    expect(ref.spare).toBe(0);
    expect((r as { why: string }).why).toMatch(/adjacent|next zone/i);
  });

  it('names how many clones the rectangle needs against how many fit', () => {
    const d = doc();
    d.collision.colind = new Uint8Array(d.blocks.length + 1);   // exactly one spare
    d.chunks[0].cells[0] = { ...d.chunks[0].cells[0], block: 1 };
    d.chunks[0].cells[1] = { ...d.chunks[0].cells[1], block: 2 };
    d.chunks[0].cells[16] = { ...d.chunks[0].cells[16], block: 3 };
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'isolate');
    expect(r.kind).toBe('refused');
    const ref = (r as { refusal: { needed: number; spare: number } }).refusal;
    expect(ref.needed).toBe(3);
    expect(ref.spare).toBe(1);
    expect((r as { resolution: string }).resolution).toMatch(/link|smaller/i);
  });

  it('REFUSES at the 1024-block ceiling, which classicPaintSurface does not check', () => {
    const d = doc();
    d.blocks = Array.from({ length: 1024 }, () => d.blocks[0]);
    d.collision.colind = new Uint8Array(2048);
    d.chunks[0].cells[0] = { ...d.chunks[0].cells[0], block: 1 };
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { refusal: { kind: string } }).refusal.kind).toBe('block-ceiling');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts
```
Expected: FAIL — `planIsolateRect: implemented in task 5`.

- [ ] **Step 3: Implement — replace the Task 4 stub**

```ts
/**
 * ONE CLONE PER DISTINCT BLOCK, and that is only correct because every cell of
 * the rectangle receives the SAME shape.
 *
 * `planSurfaceEdit` keys its clones by CHUNK CELL for the opposite reason
 * (classic-surface-plan.ts: "two painted chunk cells that share a block each
 * need their OWN clone") — there the per-cell pixels differ, so sharing a clone
 * would lose paint. Here they cannot differ. IF THIS TOOL EVER TAKES A SHAPE PER
 * CELL, this dedupe becomes wrong and must move to a per-cell key.
 *
 * The aggregate limits live here rather than in the store because
 * `classicPaintSurface` checks NEITHER: it grows colind silently with
 * `Math.max(nextBlocks.length, src.length)` and has no ceiling check at all
 * (collision-write.test.ts's "refuses an isolate at the block ceiling" is the
 * standing note of that).
 *
 * The two checks below are `isolateFits(doc, needed)` SPLIT IN TWO, because
 * each half needs its own refusal kind and its own numbers. Keep them in step
 * with it: `isolateFits` is what the single-cell escape sentence asks, and if
 * these ever disagree with it the panel would recommend a mode this planner
 * refuses — the exact defect Task 2 removed.
 */
function planIsolateRect(
  doc: LevelDoc,
  writes: { blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }[],
  distinct: number[],
  shapeIndex: number,
  base: CollisionRectReport,
): CollisionRectPlan {
  const colind = doc.collision.colind;
  const needed = distinct.length;

  const ceilingSpare = MAX_BLOCKS_TOTAL - doc.blocks.length;
  if (needed > ceilingSpare) {
    return {
      kind: 'refused',
      refusal: { kind: 'block-ceiling', needed, spare: Math.max(0, ceilingSpare) },
      why: `this rectangle needs ${needed} new block${needed === 1 ? '' : 's'} and only ${Math.max(0, ceilingSpare)} fit: ${MAX_BLOCKS_TOTAL} blocks max (chunk cells reference blocks with a 10-bit field)`,
      resolution: 'Use Link, accepting it changes every use of these blocks, or paint a smaller rectangle.',
      report: base,
    };
  }

  // Isolate appends blocks at doc.blocks.length.. and classicPaintSurface then
  // grows colind to cover them, which — per its own comment — "necessarily
  // defines the entries in between" as zeros. Any of those past the table's
  // current end resolve into the ADJACENT ZONE's table in ROM, so growing over
  // them is refused rather than guessed.
  const tableSpare = colind.length - doc.blocks.length;
  if (needed > tableSpare) {
    const grow = doc.blocks.length + needed - colind.length;
    return {
      kind: 'refused',
      refusal: {
        kind: 'isolate-grows-table', needed, spare: Math.max(0, tableSpare),
        colindLength: colind.length, blocks: doc.blocks.length,
      },
      why: `isolating this rectangle needs ${needed} new block${needed === 1 ? '' : 's'} and this zone's collision table has room for ${Math.max(0, tableSpare)} — it would grow by ${grow} entr${grow === 1 ? 'y' : 'ies'} (${colind.length} → ${doc.blocks.length + needed}), and those entries resolve into the adjacent zone's table in ROM, so Aurora cannot define them.`,
      resolution: distinct.every((b) => b < colind.length)
        ? 'Use Link, accepting it changes every use of these blocks zone-wide, or paint a smaller rectangle.'
        : 'Link cannot set every block in this rectangle either — some are past the end of the table. Paint over blocks that are within it.',
      report: base,
    };
  }

  const cloneFor = new Map<number, number>();
  distinct.forEach((blockId, i) => cloneFor.set(blockId, doc.blocks.length + i));

  // De-duped by (chunkIndex, cellIndex): a rectangle spanning two placements of
  // the same chunk resolves to the same DEFINITION cell twice. Harmless in the
  // store (same value, last wins) but it would inflate every reported count.
  const seen = new Set<string>();
  const chunkCellEdits: SurfaceEditPlan['chunkCellEdits'] = [];
  const chunks = new Set<number>();
  for (const w of writes) {
    const key = `${w.chunkIndex}:${w.cellIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.add(w.chunkIndex);
    chunkCellEdits.push({
      chunkIndex: w.chunkIndex,
      cellIndex: w.cellIndex,
      // Flips and solidity come from THIS cell, re-read from the doc — two cells
      // can share a block and differ in both.
      cell: { block: cloneFor.get(w.blockId)!, xf: w.cell.xf, yf: w.cell.yf, solidity: w.cell.solidity },
    });
  }

  const plan: SurfaceEditPlan = {
    tileWrites: [],
    newBlocks: distinct.map((blockId) => ({
      def: doc.blocks[blockId], sourceBlockId: blockId, colind: shapeIndex,
    })),
    blockCellEdits: [],
    chunkCellEdits,
    stats: { tilesClaimed: 0, blocksCloned: needed, placesAffected: chunkCellEdits.length },
  };

  return {
    kind: 'isolate',
    plan,
    report: {
      ...base,
      isolate: { blocksCloned: needed, chunkCellsRepointed: chunkCellEdits.length, chunksTouched: chunks.size },
    },
  };
}
```

- [ ] **Step 4: Run to verify**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts
```
Expected: PASS on every isolate test.

- [ ] **Step 5: Full suite + typecheck, then commit**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
git add src/core/level-classic/collision-write.ts src/core/level-classic/__tests__/collision-write.test.ts
git commit -m "feat(collision): isolate a rectangle as one plan, one clone per block"
git show --stat
```

---

## Task 6: `applyCollisionShapeRect` — the dispatch

**Files:**
- Modify: `src/renderer/state/collision-dispatch.ts`
- Test: `src/renderer/state/__tests__/collision-dispatch.test.ts`

- [ ] **Step 1: Write the failing tests**

**There is no undo-DEPTH accessor anywhere in this repo** — `UndoStack` (`src/core/editing/undo-stack.ts`) exposes only `canUndo` / `canRedo` / `undo()` / `redo()` / `clear()`. So "one undo step" is asserted the way the repo already asserts it (`agent-handler.classic.test.ts`): make a change that touches **two** things, call `undo()` **once**, and require **both** to be restored. Two commands would leave the first one's change behind.

The colind write lands on the ZONE-ART document, so the stack is `zoneArtDocIdForCurrentZone()`.

Append to `src/renderer/state/__tests__/collision-dispatch.test.ts`:

```ts
// makeDoc's fg is 2x2 CHUNKS with cells [0, 1, 0, 1], so layout column 1 holds
// engine chunk id 1 → doc.chunks[0]. In 16px CELL units that chunk occupies
// cx 16..31, and cellIndex = (cy % 16) * 16 + (cx % 16). So cell (16,0) is
// chunk-definition cell 0 and cell (17,0) is cell 1.
const RECT_ORIGIN = { x: 16, y: 0 };

/** makeDoc() with TWO distinct in-table blocks under the first two cells. */
function rectDoc(colindLength = 8): LevelDoc {
  const base = makeDoc();
  const chunks = base.chunks.map((c) => ({ cells: c.cells.map((cc) => ({ ...cc })) }));
  chunks[0].cells[0] = { block: 1, xf: true, yf: false, solidity: 3 };
  chunks[0].cells[1] = { block: 2, xf: false, yf: true, solidity: 1 };
  return {
    ...base,
    // makeDoc ships 2 blocks; block 2 has to exist for the second cell.
    blocks: [...base.blocks, { cells: base.blocks[1].cells.map((c) => ({ ...c })) }],
    chunks,
    collision: { ...base.collision, colind: new Uint8Array(colindLength) },
  };
}

const artStack = () => documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);

describe('applyCollisionShapeRect', () => {
  it('refuses rather than throwing when no level is open', () => {
    const r = applyCollisionShapeRect({ x: 0, y: 0, w: 1, h: 1 }, 7, 'link');
    expect(r.ok).toBe(false);
    expect((r as { why: string }).why).toMatch(/no classic level is open/);
  });

  it('writes a whole rectangle as ONE undo step', () => {
    openReady(rectDoc());
    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 2, h: 1 }, 7, 'link');

    expect(r.ok).toBe(true);
    expect((r as { report: { applied: number; blocks: number } }).report)
      .toMatchObject({ applied: 2, blocks: 2 });
    expect(st().doc!.collision.colind[1]).toBe(7);
    expect(st().doc!.collision.colind[2]).toBe(7);

    // THE ASSERTION THIS TASK EXISTS FOR. One undo must take BOTH back. If the
    // dispatch looped per entry, this would restore only the last one.
    artStack().undo();
    expect(st().doc!.collision.colind[1]).toBe(0);
    expect(st().doc!.collision.colind[2]).toBe(0);
  });

  it('records NO undo step when every cell already carries the shape', () => {
    const d = rectDoc();
    d.collision.colind[1] = 7;
    d.collision.colind[2] = 7;
    openReady(d);

    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 2, h: 1 }, 7, 'link');
    expect(r.ok).toBe(true);
    expect((r as { report: { applied: number; noop: number } }).report)
      .toMatchObject({ applied: 0, noop: 2 });
    expect(artStack().canUndo, 'a no-op spent an undo entry').toBe(false);
  });

  it('takes its mode from the ARGUMENT, never from collisionDiverge', () => {
    // The store field is the human's panel toggle. An agent's call must not be
    // steered by whatever a person last clicked.
    openReady(rectDoc());
    st().setCollisionDiverge('isolate');

    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 1, h: 1 }, 7, 'link');
    expect((r as { report: { mode: string } }).report.mode).toBe('link');
    // A link changed the colind entry and appended NO block; an isolate would
    // have done the opposite.
    expect(st().doc!.collision.colind[1]).toBe(7);
    expect(st().doc!.blocks.length).toBe(3);
  });

  it('isolate clones once per distinct block and repoints both cells, in one step', () => {
    openReady(rectDoc());
    const before = st().doc!.blocks.length; // 3

    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 2, h: 1 }, 7, 'isolate');

    expect(r.ok).toBe(true);
    expect(st().doc!.blocks.length).toBe(before + 2);
    expect(st().doc!.chunks[0].cells[0].block).toBe(before);
    expect(st().doc!.chunks[0].cells[1].block).toBe(before + 1);
    // Each cell kept its OWN flips and solidity.
    expect(st().doc!.chunks[0].cells[0]).toMatchObject({ xf: true, yf: false, solidity: 3 });
    expect(st().doc!.chunks[0].cells[1]).toMatchObject({ xf: false, yf: true, solidity: 1 });

    artStack().undo();
    expect(st().doc!.blocks.length).toBe(before);
    expect(st().doc!.chunks[0].cells[0].block).toBe(1);
    expect(st().doc!.chunks[0].cells[1].block).toBe(2);
  });

  it('dryRun reports the same numbers and writes nothing', () => {
    openReady(rectDoc());
    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 2, h: 1 }, 7, 'link', { dryRun: true });

    expect(r.ok).toBe(true);
    expect((r as { report: { applied: number } }).report.applied).toBe(2);
    expect(st().doc!.collision.colind[1]).toBe(0);
    expect(artStack().canUndo).toBe(false);
  });
});
```

Add to the file's imports: `applyCollisionShapeRect` from `../collision-dispatch`, `zoneArtDocIdForCurrentZone` from `../classicLevelStore`.

> If `openReady(rectDoc())` trips `structuralError`, read `makeDoc` and match its block-cell tile indices — the third block is cloned from `base.blocks[1]` precisely so it stays inside the fixture's tile pool.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/renderer/state/__tests__/collision-dispatch.test.ts
```
Expected: FAIL — `applyCollisionShapeRect is not a function`.

- [ ] **Step 3: Implement**

Append to `src/renderer/state/collision-dispatch.ts`:

```ts
export type ApplyCollisionRectResult =
  | { ok: true; report: CollisionRectReport }
  | { ok: false; refusal: CollisionRectRefusal; why: string; resolution: string; report: CollisionRectReport };

/**
 * Apply `shape` across a rectangle of FG cells as ONE undo step.
 *
 * The rectangle sibling of `applyCollisionShape`, and the tool's only write
 * route — the same reason that function exists: the panel must not assemble a
 * plan or call a store command, or the Link/Isolate decision would live in two
 * places and drift.
 *
 * `mode` is an ARGUMENT and is never read from `collisionDiverge`. That field is
 * the human's panel toggle; an agent's call must not be steered by whatever a
 * person last clicked. Only `applyCollisionShape` reads it.
 *
 * Refusals are handed back unchanged — no store write happens on a refused
 * plan, so there is nothing to undo.
 *
 * `dryRun` lives HERE rather than in the agent handler so the handler has
 * exactly one call to make. If the handler planned for itself it would have to
 * import the planner, which is precisely what its source guard forbids — and
 * the guard is right: a second planning call site is a second place for the
 * Link/Isolate decision to drift. It also means a dry run's numbers ARE the
 * real ones, not a second estimate.
 */
export function applyCollisionShapeRect(
  rect: CollisionRect,
  shape: number,
  mode: CollisionWriteMode,
  opts: { dryRun?: boolean } = {},
): ApplyCollisionRectResult {
  const s = useClassicLevelStore.getState();
  if (s.status !== 'ready' || !s.doc) {
    const report: CollisionRectReport = {
      mode, applied: 0, noop: 0, skipped: [], blocks: 0, warnings: [],
    };
    return {
      ok: false,
      refusal: { kind: 'nothing-applicable', skipped: [] },
      why: 'no classic level is open',
      resolution: 'Open an act first (get_classic_level).',
      report,
    };
  }

  const plan = planCollisionRect(s.doc, rect, shape, mode);
  if (plan.kind === 'refused') {
    return { ok: false, refusal: plan.refusal, why: plan.why, resolution: plan.resolution, report: plan.report };
  }
  // Every cell already carried the shape: success, and deliberately NO command,
  // so no undo entry is spent arriving at the state we were already in.
  if (plan.kind === 'nothing') return { ok: true, report: plan.report };
  if (opts.dryRun) return { ok: true, report: plan.report };

  const result = plan.kind === 'link'
    ? classicSetColind(plan.entries)
    : classicPaintSurface(plan.plan);

  // A rejection HERE is a genuine fault: the planner is the authority on what is
  // legal, so the command re-validating and disagreeing means the two drifted.
  if (!result.ok) {
    return {
      ok: false,
      refusal: { kind: 'nothing-applicable', skipped: plan.report.skipped },
      why: result.error,
      resolution: 'This is an Aurora bug — the planner and the store command disagree.',
      report: plan.report,
    };
  }
  return { ok: true, report: plan.report };
}
```

Add the needed imports (`planCollisionRect`, and the `CollisionRect` / `CollisionRectReport` / `CollisionRectRefusal` / `CollisionWriteMode` types) to the existing import from `../../core/level-classic/collision-write`.

> **Note on the store-disagreement branch.** In `art-commit.ts` the equivalent case THROWS, because there it is unreachable-by-construction and a throw makes the drift loud. Here it is returned as a refusal so that a rectangle cannot take down the caller's session, and the resolution string says plainly that it is an Aurora bug. If you disagree, say so in your report rather than changing it silently.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/renderer/state/__tests__/collision-dispatch.test.ts
```
Expected: PASS.

- [ ] **Step 5: Prove the "one undo step" assertion is not vacuous**

Temporarily change the link branch to dispatch per entry:

```ts
? plan.entries.map((e) => classicSetColind([e])).at(-1)!
```

```bash
npx vitest run src/renderer/state/__tests__/collision-dispatch.test.ts
```
Expected: FAIL on "dispatches ONE command for the whole rectangle" — with two distinct blocks it should record 2 undo steps, not 1. **If it still passes, the test is measuring nothing — fix the test before restoring the code.** Then restore and re-run.

- [ ] **Step 6: Full suite + typecheck, then commit**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
git add src/renderer/state/collision-dispatch.ts src/renderer/state/__tests__/collision-dispatch.test.ts
git commit -m "feat(collision): one dispatch for a whole rectangle, one undo step"
git show --stat
```

---

## Task 7: Protocol kind and registry entry

**Files:**
- Modify: `src/core/level-classic/model.ts` (export the layout maxima)
- Modify: `src/shared/agent-protocol.ts`
- Modify: `src/main/editor-methods.ts`
- Test: `src/main/__tests__/registry-conformance.test.ts` (already generic — it will pick the entry up automatically)

- [ ] **Step 1: Export the layout maxima**

In `src/core/level-classic/model.ts`, change:

```ts
const MAX_LAYOUT_W = 64; // INI levelwidthmax; applies to fg and bg (all real bg fit)
const MAX_LAYOUT_H = 8; // INI levelheightmax
```

to:

```ts
export const MAX_LAYOUT_W = 64; // INI levelwidthmax; applies to fg and bg (all real bg fit)
export const MAX_LAYOUT_H = 8; // INI levelheightmax
/**
 * The layout maxima in 16px CELLS rather than chunks — the unit the collision
 * facet and `set_block_collision` speak. Exported so the tool's schema bounds
 * are DERIVED from the format fact instead of being two more magic numbers that
 * drift from it.
 */
export const MAX_FG_CELLS_W = MAX_LAYOUT_W * 16;   // 1024
export const MAX_FG_CELLS_H = MAX_LAYOUT_H * 16;   // 128
```

- [ ] **Step 2: Add the protocol kind**

In `src/shared/agent-protocol.ts`, add to the classic block (after `classic-set-colind`):

```ts
  // Classic's collision-authoring tool, in the FACET's coordinates — a rectangle
  // of 16px FG CELLS. It sets the SHAPE on the BLOCK under each cell and never
  // touches solidity, which rides the chunk cell and stays `classic-edit-chunk`.
  //
  // NOT `paint-collision`: that kind is aeon's and means something else (a
  // collision-plane cell word including solidity, on a per-section plane).
  | { kind: 'classic-set-block-collision'; x: number; y: number; w: number; h: number;
      shape: number; mode?: 'link' | 'isolate'; dryRun?: boolean }
```

- [ ] **Step 3: Add the registry entry**

In `src/main/editor-methods.ts`, add the import:

```ts
import { MAX_FG_CELLS_W, MAX_FG_CELLS_H } from '../core/level-classic/model';
```

and the entry, after `set_colind`:

```ts
  // NAMED `set_block_collision`, NOT `paint_collision` — aeon already owns that
  // name in this flat registry with different semantics (a collision-plane cell
  // word including solidity, versus a shape index on the zone-wide BLOCK tier),
  // and registry names must be globally unique. Same collision, same resolution
  // as `set_level_palette` above.
  //
  // The bounds are DERIVED from the format (model.ts's MAX_LAYOUT_W/H, in cells)
  // rather than copied from aeon's `paint_collision`, whose 127/128 encode
  // aeon's fixed section size. A classic act is up to 1024 cells wide, and a
  // full-width sweep has to be ONE call to be one undo step.
  { name: 'set_block_collision', kind: 'classic-set-block-collision', result: 'json',
    params: {
      x: z.number().int().min(0).max(MAX_FG_CELLS_W - 1).describe('left FG cell column (16px units)'),
      y: z.number().int().min(0).max(MAX_FG_CELLS_H - 1).describe('top FG cell row (16px units)'),
      w: z.number().int().min(1).max(MAX_FG_CELLS_W),
      h: z.number().int().min(1).max(MAX_FG_CELLS_H),
      shape: z.number().int().min(0).max(255).describe('collision-shape index (a colind value); 0 = no collision'),
      mode: z.enum(['link', 'isolate']).optional()
        .describe('"link" (default) writes the shape onto the block itself, changing every use of it ZONE-wide; "isolate" clones the block first so only these cells change — at the cost of one collision-table entry per distinct block, which some zones have none of'),
      dryRun: z.boolean().optional().describe('plan and report without applying'),
    },
    description: 'Set the collision SHAPE on the block under every cell of a rectangle, in 16px FG cell units. One undo step. Does NOT set solidity — that rides the chunk cell (edit_chunk). Partial by design: cells that are air, blank block 0, outside the layout, or (link) past the end of the zone\'s collision table are skipped and counted in the reply, and the rest still applies. A refusal returns ok:false with a message and a resolution — the whole call is refused only when nothing applied and nothing already matched, or when isolate would need more collision-table entries than the zone has spare.' },
```

- [ ] **Step 4: Run the conformance suite**

```bash
npx vitest run src/main/__tests__/registry-conformance.test.ts
```
Expected: FAIL on "has a handler case for every method kind" — the handler case is Task 8. Every other conformance assertion (unique name, unique kind, snake_case, no param named `kind`, advertised, described, zod params) should PASS.

That failure is the guard working. Do not silence it; Task 8 closes it.

- [ ] **Step 5: Document the tool in `docs/MCP.md`**

`docs/MCP.md` documents the whole agent tool surface, and its classic table already lists `set_colind`, `set_level_palette`, `add_block` and the rest. A tool that is in the registry but not in that table is discoverable only by reading source.

Add a row to the classic table, immediately after `set_colind`:

```markdown
| `set_block_collision`\* | `{ x, y, w, h, shape, mode?, dryRun? }` | Sets the collision SHAPE on the block under every cell of a rectangle, in 16px FG cell units. Does NOT set solidity — that rides the chunk cell (`edit_chunk`). `mode` is `link` (default; changes the block everywhere it is used, ZONE-wide) or `isolate` (clones the block first, at the cost of one collision-table entry per distinct block — GHZ and SBZ have none spare). Partial by design: cells that are air, blank block 0, outside the layout, or (link) past the end of the zone's collision table are skipped and counted. Refuses only when nothing applied and nothing already matched, or when isolate needs more table entries than the zone has. |
```

**Also backfill the two tools Plan A left out of this file.** `commit_canvas` and `import_art_sheet` shipped in the registry on 2026-08-18 and were never added here — verify with `grep -n "commit_canvas\|import_art_sheet" docs/MCP.md` returning nothing before you write them. That is a pre-existing gap, not this plan's, but leaving the table wrong while editing it is worse than fixing it; call it out in the commit message so the backfill is not mistaken for this plan's own work. Take the descriptions from their `EDITOR_METHODS` entries.

Re-check after editing:

```bash
grep -c "^| \`" docs/MCP.md
grep -n "set_block_collision\|commit_canvas\|import_art_sheet" docs/MCP.md
```
Expected: all three named, each exactly once.

- [ ] **Step 6: Commit**

```bash
git add src/core/level-classic/model.ts src/shared/agent-protocol.ts src/main/editor-methods.ts docs/MCP.md
git commit -m "feat(agent): the set_block_collision kind and registry entry

Also backfills commit_canvas and import_art_sheet into docs/MCP.md, which
the 2026-08-18 art surface added to the registry but not to the doc."
git show --stat
```

---

## Task 8: The handler case, the reply, and its source guard

**Files:**
- Modify: `src/renderer/agent/agent-handler.ts`
- Test: `src/renderer/agent/__tests__/agent-handler.classic.test.ts`

- [ ] **Step 1: Write the failing tests**

This suite already has `openReady(doc?)` and `lvl()` helpers — read them and reuse. The doc below is the same one Task 6 used, restated here because you may be reading this task on its own.

```ts
// makeDoc's fg is 2x2 CHUNKS, cells [0, 1, 0, 1] — layout column 1 holds engine
// chunk id 1 → doc.chunks[0]. In 16px CELL units that is cx 16..31, with
// cellIndex = (cy % 16) * 16 + (cx % 16). So cell (16,0) is definition cell 0.
function collisionDoc(): LevelDoc {
  const base = makeDoc();
  const chunks = base.chunks.map((c) => ({ cells: c.cells.map((cc) => ({ ...cc })) }));
  chunks[0].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
  chunks[0].cells[1] = { block: 2, xf: false, yf: false, solidity: 3 };
  return {
    ...base,
    blocks: [...base.blocks, { cells: base.blocks[1].cells.map((c) => ({ ...c })) }],
    chunks,
    collision: { ...base.collision, colind: new Uint8Array(8) },
  };
}
/** The shape the block under FG cell (cx, cy) currently carries. */
const shapeAt = (cx: number, cy: number) => {
  const d = lvl().doc!;
  const at = locateCell(d, cx, cy)!;
  return d.collision.colind[d.chunks[at.chunkIndex!].cells[at.cellIndex].block];
};

describe('classic-set-block-collision', () => {
  it('THROWS when no level is open — that is a fault, not a refusal', async () => {
    await expect(handleAgentRequest({
      kind: 'classic-set-block-collision', x: 16, y: 0, w: 1, h: 1, shape: 7,
    })).rejects.toThrow(/no classic level is open/);
  });

  it('applies a rectangle and reports cells, blocks and mode', async () => {
    openReady(collisionDoc());
    const res = await handleAgentRequest({
      kind: 'classic-set-block-collision', x: 16, y: 0, w: 2, h: 1, shape: 7,
    }) as { ok: boolean; applied: number; blocks: number; mode: string; dryRun: boolean };
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('link');          // the default
    expect(res.applied).toBe(2);
    expect(res.blocks).toBe(2);
    expect(res.dryRun).toBe(false);
    expect(shapeAt(16, 0)).toBe(7);
  });

  it('counts the blank-block cells it stepped over instead of refusing', async () => {
    // Cells (18,0) and (19,0) are still block 0. A rectangle over a slope
    // legitimately contains air and blank blocks; refusing would make the tool
    // unusable.
    openReady(collisionDoc());
    const res = await handleAgentRequest({
      kind: 'classic-set-block-collision', x: 16, y: 0, w: 4, h: 1, shape: 7,
    }) as { ok: boolean; applied: number; skipped: { reason: string; count: number }[] };
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(2);
    expect(res.skipped).toEqual([{ reason: 'block0', count: 2 }]);
  });

  it('returns a REFUSAL as ok:false inside a successful result, never a throw', async () => {
    // Layout column 0 is chunk id 0 — air. The caller can fix this by changing
    // an argument, so it is an ANSWER; a throw would reach the client as -32603
    // INTERNAL, claiming Aurora broke.
    openReady(collisionDoc());
    const res = await handleAgentRequest({
      kind: 'classic-set-block-collision', x: 0, y: 0, w: 2, h: 2, shape: 7,
    }) as { ok: boolean; refusal: { kind: string }; message: string; resolution: string; offers: unknown[] };
    expect(res.ok).toBe(false);
    expect(res.refusal.kind).toBe('nothing-applicable');
    expect(res.message).toMatch(/air/i);
    expect(res.resolution).toMatch(/cell units/i);
    expect(res.offers).toEqual([]);
  });

  it('dryRun plans without mutating the document', async () => {
    openReady(collisionDoc());
    const res = await handleAgentRequest({
      kind: 'classic-set-block-collision', x: 16, y: 0, w: 2, h: 1, shape: 7, dryRun: true,
    }) as { ok: boolean; applied: number; dryRun: boolean };
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(2);
    expect(res.dryRun).toBe(true);
    expect(shapeAt(16, 0)).toBe(0);
  });

  it('is idempotent — a repeat is ok:true with noop, not a refusal', async () => {
    openReady(collisionDoc());
    const req = { kind: 'classic-set-block-collision' as const, x: 16, y: 0, w: 2, h: 1, shape: 7 };
    await handleAgentRequest(req);
    const res = await handleAgentRequest(req) as { ok: boolean; applied: number; noop: number };
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(0);
    expect(res.noop).toBe(2);
  });

  it('honours an explicit isolate mode', async () => {
    openReady(collisionDoc());
    const before = lvl().doc!.blocks.length;
    const res = await handleAgentRequest({
      kind: 'classic-set-block-collision', x: 16, y: 0, w: 2, h: 1, shape: 7, mode: 'isolate',
    }) as { ok: boolean; mode: string; isolate: { blocksCloned: number } };
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('isolate');
    expect(res.isolate.blocksCloned).toBe(2);
    expect(lvl().doc!.blocks.length).toBe(before + 2);
  });
});

describe('agent-handler collision write route', () => {
  it('routes through the dispatch helper, never a store command or the planner', () => {
    // The SAME guard the panel and the viewport wear
    // (collision-panel.test.ts, collision-probe-click.test.ts). The agent is a
    // third caller and would drift the Link/Isolate decision the same way.
    const src = readFileSync(join(__dirname, '..', 'agent-handler.ts'), 'utf8');
    const start = src.indexOf("case 'classic-set-block-collision'");
    expect(start, 'no such case in agent-handler.ts — this guard is blind').toBeGreaterThan(-1);
    const rest = src.slice(start);
    const end = rest.indexOf('\n    case ');
    const body = end === -1 ? rest : rest.slice(0, end);
    expect(body).toMatch(/applyCollisionShapeRect/);
    expect(body, 'the handler must not build a plan or call a store command itself')
      .not.toMatch(/newBlocks:|classicSetColind\(|classicPaintSurface\(|planCollisionRect\(/);
  });
});
```

Add to this file's imports: `readFileSync` from `node:fs`, `join` from `node:path`, and `locateCell` from `../../../core/level-classic/collision-probe`. Check whether the suite already imports the first two before adding them.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/renderer/agent/__tests__/agent-handler.classic.test.ts
```
Expected: FAIL — no handler case; requests fall through to the switch default.

- [ ] **Step 3: Implement**

In `src/renderer/agent/agent-handler.ts`, import `applyCollisionShapeRect` from `../state/collision-dispatch` and add the case after `classic-set-colind`:

```ts
    case 'classic-set-block-collision': {
      // THE ONE FAULT ON THIS TOOL. Everything else a caller could fix by
      // changing an argument comes back as a refusal inside a SUCCESSFUL
      // result — a throw is -32603 INTERNAL at the Aether adapter, which tells
      // the client Aurora broke. See art-commit.ts for the worked example.
      requireClassicDoc();

      // ONE call, deliberately. `dryRun` is the dispatch function's option
      // (collision-dispatch.ts) rather than a planner call made here: planning
      // in the handler would need `planCollisionRect`, which this case's own
      // source guard forbids, and the guard is right — a second planning site
      // is a second place for the Link/Isolate decision to drift.
      const res = applyCollisionShapeRect(
        { x: req.x, y: req.y, w: req.w, h: req.h },
        req.shape,
        req.mode ?? 'link',
        { dryRun: req.dryRun },
      );

      const dryRun = req.dryRun === true;
      return res.ok
        ? { ok: true, ...res.report, dryRun }
        // `offers` is [] and stays [] — unlike the art line's palette
        // resolutions, no parameter VALUE can unblock these refusals. The
        // actionable half is `resolution`, which is computed against THIS
        // document, so it never recommends a mode this document also refuses.
        // Shaped like `import_art_sheet`'s refusal reply so a caller handles
        // every Aurora refusal with one branch.
        : { ok: false, refusal: res.refusal, message: res.why, resolution: res.resolution, offers: [], dryRun };
    }
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/renderer/agent/__tests__/agent-handler.classic.test.ts src/main/__tests__/registry-conformance.test.ts
```
Expected: PASS on both, including "has a handler case for every method kind" which Task 7 left red.

- [ ] **Step 5: Prove the new source guard is not vacuous**

Temporarily add `classicSetColind([]);` inside the case body.

```bash
npx vitest run src/renderer/agent/__tests__/agent-handler.classic.test.ts
```
Expected: FAIL on "routes through the dispatch helper". **Restore**, re-run, expect PASS.

Then plant the opposite: temporarily rename the `applyCollisionShapeRect` call to something else and confirm the guard's positive assertion fails too. Restore.

- [ ] **Step 6: Full suite + typecheck, then commit**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
git add src/renderer/agent/agent-handler.ts src/renderer/state/collision-dispatch.ts src/renderer/agent/__tests__/agent-handler.classic.test.ts src/renderer/state/__tests__/collision-dispatch.test.ts
git commit -m "feat(agent): set_block_collision reaches the editor"
git show --stat
```

---

## Task 9: Runtime proof under CDP

The node suite never crosses the transport, the zod layer, or the IPC bridge. Three things live only there, and each fails SILENTLY if it regresses.

**Files:**
- Create: `scratchpad/collision-agent-harness.mjs`

**Read `scratchpad/art-agent-harness.mjs` first and copy its shape.** In particular:
- It imports `session()`, `openProjectAndAct`, `S1DIR`, `ROOT` from `scratchpad/canvas-cdp-harness.mjs`. `ROOT` is now **self-locating**, so importing from this worktree drives THIS worktree's build. Build first: `VITE_AURORA_DEBUG=1 npm run build`.
- Its **row 1 aborts the whole run** if `editor/set_block_collision` is not advertised by `initialize`. The port comes from a discovery file in `$HOME` that a DIFFERENT Aurora (another worktree, another session) may own — without row 1 every later PASS could be describing someone else's app.
- **It must never call `save_project`.** This drives the real `/home/volence/sonic_hacks/s1disasm`; mutations stay in memory.

- [ ] **Step 1: Write the harness**

Rows, each justified by "nothing else can cover this":

| Row | What | Why only here |
|---|---|---|
| 1 | `initialize` advertises `editor/set_block_collision` | Aborts the run if we are talking to another Aurora. |
| 2 | A real rectangle applies over GHZ 1 and the reply's `applied`/`blocks` match the document read back through `__dbg.classic` | The whole tool, end to end. |
| 3 | The same rectangle again returns `ok:true, applied:0, noop:N` | Idempotence over the wire. |
| 4 | One rectangle = ONE undo step (undo restores every changed block) | The single most important property, and the transport is where a batching bug would hide. |
| 5 | A rectangle over air returns a JSON-RPC **result** carrying `ok:false`, NOT a JSON-RPC **error** | The refusal/fault distinction is made by the ADAPTER, which no node test reaches. If it regresses, the tool still "works" and every caller is told Aurora broke. |
| 6 | `x: -1` (or `shape: 300`) returns **-32602 INVALID_PARAMS** from the schema, not -32603 | Same reason: only the zod edge produces it. |
| 7 | `mode: 'isolate'` on GHZ returns `ok:false` with `refusal.kind === 'isolate-grows-table'`, and the `resolution` does **NOT** recommend Link for a block Link refuses | Proves D4 against REAL zone data (GHZ: 439 blocks / 410 entries) rather than a fixture. |
| 8 | `dryRun: true` reports the same `applied` and leaves the document unchanged | Nothing in the node suite reads the doc back across the bridge. |

- [ ] **Step 2: Build and run**

```bash
cd .claude/worktrees/set-block-collision
VITE_AURORA_DEBUG=1 npm run build
node scratchpad/collision-agent-harness.mjs
```
Expected: 8/8 PASS.

> **Run this in the FOREGROUND, from the controlling session.** Background agents must not touch `mcp__oracle__*` / emulator tooling — it deadlocks. This harness uses CDP, not the emulator, but the same foreground rule applies to anything that launches the app.

- [ ] **Step 3: Prove the harness can fail**

Plant a defect for at least rows 4, 5 and 7 — one at a time — and confirm the harness reports FAIL rather than PASS:
- Row 4: make the link branch dispatch per entry again.
- Row 5: change the handler to `throw new Error(res.why)` on refusal.
- Row 7: hardcode `resolution` to `'Use Link.'`.

Restore each and re-run. A harness that cannot fail proves nothing.

- [ ] **Step 4: Commit**

```bash
git add scratchpad/collision-agent-harness.mjs
git commit -m "test(agent): set_block_collision over the real wire, 8 rows"
git show --stat
```

---

## Task 10: Full verification and the plan's own bookkeeping

- [ ] **Step 1: The three gates**

```bash
cd .claude/worktrees/set-block-collision
npm test 2>&1 | tail -8
npx tsc --noEmit && echo "tsc clean"
npm run build 2>&1 | tail -5
```

Expected: tests ≥ 3201 passed + the new ones, 3 skipped; tsc silent; build succeeds.

**Report AGGREGATE totals, never a tail excerpt.** A `tail -45` once hid 16 failures behind a merged "green".

- [ ] **Step 2: Confirm the known pre-existing failure is still exactly that**

```bash
node scratchpad/commit-collision-harness.mjs 2>&1 | tail -12
```
Expected: still 5/6, still row 4. If it is now 4/6 or a different row, that IS this plan's regression — stop and investigate.

- [ ] **Step 3: Book the follow-ups**

Append to this plan under "Notes for the implementer" (below), and to `docs/DEFERRED_WORK.md` if this repo keeps one:
- Isolate-over-a-fully-contained-block could fall back to Link for free (D2).
- `set_block_collision` has no human-facing rectangle gesture; the panel is still one cell per click. The facet-side rectangle is §4.5's other half and is not in this plan.

- [ ] **Step 4: Merge**

```bash
git log --oneline master..HEAD
git checkout master && git pull --ff-only && git merge --no-ff feat/set-block-collision
npm test 2>&1 | tail -6
```

Verify the branch at commit time — parallel sessions share this tree and HEAD has moved under this series before.

**Never add a `Co-Authored-By: Claude` trailer.**

---

## Decided NOT to fix: `shapeIndex` is unvalidated in core

Found during Task 5b. `planCollisionRect` never bounds `shapeIndex`, while `classicSetColind` bounds a colind value to 0..255. So a core-level caller passing `shape: 300` plans cleanly and is then rejected by the store, arriving as the `store-disagreement` refusal whose resolution says "This is an Aurora bug" — wrong words for a caller-fixable mistake.

**Left as is, on purpose**, for two reasons:

1. **The agent surface is already bounded at the right layer.** `set_block_collision`'s zod schema declares `shape: z.number().int().min(0).max(255)`, so an out-of-range shape is `-32602 INVALID_PARAMS` at the protocol edge and never reaches core. That is the same layering the art line chose for canvas names, and `editor-methods.ts` says so: a bad argument is INVALID_PARAMS at the edge "rather than the renderer's throw, which reaches a client as INTERNAL". The panel's other caller picks shapes from a swatch list and cannot produce 300 either.
2. **It is currently the only honest reach to the `store-disagreement` branch.** Task 5b's test for that branch drives a real store with `shape: 300` and asserts the document comes back reference-identical. Adding a core-level bound would delete the one test that proves the planner/store disagreement path behaves — trading a real guard for a refusal nobody can trigger.

If a future caller reaches core directly with unbounded input, add the bound AND find that branch another honest reach (a doc whose colind the planner accepts and the store does not) before deleting the existing test.

## Notes for the implementer

- **Trust source over this plan.** Line numbers drift; five claims in the previous plan of this series were wrong.
- **`npm test` does not typecheck.** Run `npx tsc --noEmit` at every gate. Every compile-time guarantee here — the `AgentRequest` union, `agent-handler.ts`'s `const exhaustive: never` sentinel, the `EditorMethod.kind` type — is enforced only when somebody runs it by hand.
- **A refusal is never a throw.** If you write `throw` for something a caller could fix by changing an argument, it belongs in the refusal shape.
- **Plant every guard.** Three guards in the previous plan asserted nothing and were caught only by planting the defect they name. Tasks 1, 6, 8 and 9 have explicit planting steps; do not skip them.
- **Do not touch `paint_collision`.** It is aeon's, with different semantics.
- **Do not "fix" `scratchpad/commit-collision-harness.mjs`'s 5/6.** It is stage 4's, proven by A/B at `bd7700b`.
- **Work in the worktree** at `.claude/worktrees/set-block-collision`, branch `feat/set-block-collision`. `npm install` there needs `--legacy-peer-deps` (package.json declares vite ^8; electron-vite@5 peers on ^5||^6||^7).
- **`git add` enumerated paths only** — never `-A` or globs. Verify every commit with `git show --stat`.
- **BLOCKED beats a silent downgrade.** If a constraint here seems to force a worse design, stop on that item, record why, and continue with the rest.
