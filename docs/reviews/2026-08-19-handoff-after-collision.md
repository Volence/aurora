# Handoff — after the classic collision phase

**Written:** 2026-08-19 · **master:** `8efda9d` (pushed) · **suite:** 3291 passed / 3 skipped (296 files) · `tsc --noEmit` clean

The classic collision-authoring phase is **complete and closed** — nothing it booked is
outstanding. This packet is what remains around it, grounded against source on the date above.
Verify before acting: the repo moves.

---

## What just shipped (five merges, so you don't re-derive it)

| Merge | What |
|---|---|
| `4df618f` | `set_block_collision` — the agent tool, one `EDITOR_METHODS` entry, so live on **both** MCP and Aether |
| `a814b09` | drag / Shift-drag paint gesture for people |
| `63d9fdd` | Link-equivalence: refusals that guarantee instead of hedging, carrying `linkEquivalent` |
| `92a7a00` | a drag across a loop says so (`warning` toast type, 8s dwell) |
| `8efda9d` | `skippedCells` — which cells were skipped, not just how many |

Design of record: `docs/superpowers/plans/2026-08-19-set-block-collision.md` (its head carries
**six decisions** §4.5 never settled) and `docs/superpowers/plans/2026-08-19-collision-paint-gesture.md`.

Runtime proof, both must stay green: `scratchpad/collision-agent-harness.mjs` (**8/8**) and
`scratchpad/collision-gesture-harness.mjs` (**9/9**). Each has planted-defect notes in its footer.
Known pre-existing and **not** ours: `scratchpad/commit-collision-harness.mjs` reports 5/6, row 4 —
stage 4's expectation is what is wrong.

---

## 1. ~~`docs/ROADMAP.md` is stale~~ — **DONE 2026-08-19 (`f0ff53f`)**

> Closed the same day this packet was written. `ROADMAP.md` gained a **§2.6** recording the
> August line (UX stages 1–4, art authoring 1/2A/2B/2C, classic collision + the agent
> surface, the lens sweep) and a rewritten **§5**, whose **§5.1 is the open list in order**.
> §2/§3/§5's older claims are banner-marked as superseded by §2.6. The rest of this section
> is kept as the record of why.

Its last delivered entry is **§2.5, dated 2026-08-09**. Unrecorded since: the UX stages, the whole
art-authoring line (1–2C), the art agent surface, and all five merges above.

The 2026-08-16 lens sweep already flagged this as §7 direction item 1 — *"ROADMAP.md is a month
behind and sequences the wrong engine … P7 says 'None' while the import pipeline shipped; P0/P1 rows
claim work that isn't done."* That was **before** this phase; it is now worse by eleven days.

**Why first:** it is the input to every "what next" decision, and right now it would send a cold
session at the wrong thing. It is also an hour of work, not a phase.

**What DIR offered:** add a §2.6 recording the August line as delivered, and re-sequence around the
classic spine that is actually being steered.

---

## 2. The next real phase: the playtest loop (ROADMAP §4.8)

The sweep's §7 item 2 recommended classic collision authoring — **done** — and then, verbatim:
*"Second: the playtest loop, classic-first, then the aeon Aether outbound client."*

This is Aurora becoming Aether's first **outbound** client rather than only serving requests.
`ROADMAP.md` §4.8 has the shape already:

- **Client** — `src/main/aether/client.ts`, connecting to Oracle's socket
  (`$XDG_RUNTIME_DIR/oracle.sock`, NDJSON JSON-RPC 2.0, `initialize` per
  `empyrean/contract/protocol.md`), event subscription, and **symbol resolution only** —
  `emulator/lookup_symbol`, never hardcoded addresses, which provably drift +$24 between builds.
  Possibly the seed of `empyrean/clients/typescript/`.
- **A1 — live palette → CRAM** (tiny): slider drag → `emulator/write_cram`, game recolors next
  frame. The suite's designated "one product" demo.
- **A3 — Build & Run** (medium): invoke `aeon/build.sh`, then `emulator/load_symbols` +
  `emulator/reload_rom`; surface build errors.
- **A2 — play-from-cursor** (small, called the crown jewel): warp the running game to the map
  cursor by resolving `Player_1` / `Camera_X` / `Camera_Y` by symbol.

⚠ **This phase is the one that needs the emulator.** Background agents must never touch
`mcp__oracle__*` — they deadlock. Runtime work goes in a CDP//foreground harness the controller
runs, exactly as the two collision harnesses do.

---

## 3. Four small items from the sweep's §7, all still open

### 3a. Retire the dead export path — **but the DIR item as written would break a live tool**

> **Correction, re-measured the same day (now written into ROADMAP §4.2, which is the
> authoritative version): the "ZERO importers" line below is WRONG.**
> `src/core/project/aeon/save.ts:27` imports `exportAct` from the barrel and calls it at
> `:271` — the aeon save's export step. What that step emits
> (`data/export/{act_descriptor,entity_data,vram_bases}.asm`, `section_N.{tiles,art}.bin`)
> is consumed by nothing: aeon has no `data/export/` directory and no reference to one.
> So it is dead *output* behind a *live* call, and the order is (1) delete the export step
> from `buildAeonSavePlan`, (2) then the barrel + `act-descriptor.ts` + `entity-data.ts`
> are genuinely dead, (3) keep `vram-coloring.ts`. The conclusion below survives; the
> reasoning under it does not.

DIR item 6 ordered `vram-coloring.ts`, `act-descriptor.ts`, `entity-data.ts` retired (originally
ordered 2026-07-03). **Measured 2026-08-19, and the instruction is partly wrong:**

```
src/core/export/index.ts        → imported by core/project/aeon/save.ts (exportAct).
  ├ act-descriptor.ts           → imported only by that barrel.          DEAD once the step goes.
  ├ entity-data.ts              → that barrel + its own test.            DEAD once the step goes.
  └ vram-coloring.ts            → that barrel, AND src/core/agent/budget.ts
                                   (computeVramColoring, FG_TILE_LIMIT)   → KEEP
```

`core/agent/budget.ts` is **live** — `agent-handler.ts` imports `computeActBudget` from it for the
`check_budget` agent tool. So retiring `vram-coloring.ts` wholesale **breaks `check_budget`**.

**Correct scope:** retire `export/index.ts`, `act-descriptor.ts`, `entity-data.ts`; keep
`vram-coloring.ts` (or move the two symbols `budget.ts` needs somewhere honest and retire the ASM
generators only). Retiring the barrel is also what removes **R8**'s misleading "Project saved" after
a failed export step.

### 3b. `docs/ART_SUITE.md` teaches a deleted UI

`ART_SUITE.md:73` still instructs *"Click the **Art** button in the Toolbar (next to **Map**)"* — that
Toolbar is gone; the app uses facets. Rewrite against facets/paint-through, or delete the file.

### 3c. The 2C spec header overstates

D2b's cross-act reach reporting (SBZ palette sources, LZ/SBZ3 shared-file reach, underwater-palette
warning) is **not built**. Annotate the header rather than letting BUILT mean "except §D2b".

### 3d. Write three settled decisions into the spec

The code already settled them; the spec does not say so, so a cold session may redesign shipped
behaviour: paint lives as a tool-mode per tier; canvas docs are named sidecar files under
`.aurora/canvas`; the budget readout shows unique/free/pool without comparing (deliberate).

---

## 4. Two known odds and ends

- **`ChunkGrid`'s status hint needs 213px in a 157px slot** — it was already ellipsizing 35px of its
  own sentence before the type fold, 56px after. **The copy is too long for the slot, not the font
  size.** `scratchpad/micro-type-harness.mjs` measures it. Pre-existing, found while measuring VIS7.
- **Sweep finding U6** — deliberately unchanged, argued at the site. Don't re-find it.

---

## 5. Not left — verified, so it is not re-litigated

The sweep's R1–R14 defect campaign **landed** (§10 order, merged at `780d311`). Two spot-checked
directly on 2026-08-19 rather than trusted:

- **R13** — `/mcp` Host/Origin guard exists (`src/main/mcp-server.ts`, `allowedHosts` /
  `allowedOrigins`).
- **R1** — three-state block availability exists (`src/core/art/tile-pool-match.ts`, `matched` /
  `allocated`, `unavailableForAllocation`).

Also closed and recorded so they are not re-found: the sweep's three REFUTED findings (§6), the
`GlyphButton` rename (the packet was wrong — different components, the column Divider had no
importers), and VIS7 (the contract gained `2xs: 10px/14px`).

---

## 6. How this phase worked, if you are continuing the same way

Two corrections were made to the working method on 2026-08-19 and written to memory —
`plans-must-not-invent-fixtures` and `route-decisions-to-fable`:

- **Never put unverified fixture numbers or unrun test code in a plan.** State the PROPERTY the
  fixture must satisfy and let the implementer derive it against the real file. Nine defects came
  from ignoring this; the three dispatches that followed it produced zero.
- **Route design forks to a fable agent**, with the measurement attached, and tell it to challenge
  the framing. It corrected a false premise more than once — including one "proof" that rested on a
  validator guarantee that does not exist.
- **Plant every guard, and `grep` the call site first.** A defect planted in the wrong function
  (there are usually two near-identical dispatch lines) looks convincing through a full
  build-and-run cycle. This happened twice.
- **Measure before building.** A block fan-out census decided one design question outright, and a
  layout census showed a shipped warning was unreachable in stock data — which is why a harness row
  now authors the condition itself.
