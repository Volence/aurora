<!--
Aurora plan/docs audit, performed 2026-07-03 by Claude Fable 5 at the user's request
("this has fallen behind a bit with its specs and plans"). Grounded in: a full survey of
aurora/src + docs, empyrean/docs (ROADMAP, STUDIO_VISION, SUITE_PLAN_AUDIT_2026-07-01,
contract/, design/), aeon (structs.asm, LEVEL_EDITOR_SPEC.md, ENGINE_ARCHITECTURE.md,
DEFERRED_WORK.md, tools/ojz_strip_gen.py, project.json), and the nine aeon design-week
specs/plans of 2026-07-02. Companion doc: ROADMAP.md (the forward direction).
-->

# Aurora Plan & Docs Audit — 2026-07-03

## Verdict

**The code is healthy; the planning layer is one design-cycle behind.** Aurora's shipped
surface (Map / Art / Sprite modes, cell-word collision authoring, MCP + Aether server,
~83 test files, shared undo) matches its specs through 2026-06-21. What the docs do NOT
know about is everything that happened around Aurora since:

1. **aeon's design week (2026-07-02) banked nine approved specs+plans, four of which
   assign Aurora major new work** — collision-carrying chunks (#6), a Screens/HUD
   authoring mode (#7), a Raster/Parallax mode with live Aether preview (#8), and an
   object-behavior properties panel (#9). These live in
   `aeon/docs/superpowers/{specs,plans}/2026-07-02-*` and are *execution-ready*; no
   Aurora doc references them.
2. **The engine's tile pipeline was rebuilt (2026-06-22/23)** — per-section streamed
   art + DSATUR graph coloring is GONE, replaced by a globally-deduped, ZX0-paged
   act-wide art pool; the `Sec` struct is now **66 bytes ($42)** with
   `sec_tile_art_*` fields deleted and `sec_block_dict`/`sec_block_dict_len` added
   (`aeon/structs.asm:121-150`). Aurora's export layer still targets the old model.
3. **The suite (Empyrean) formalized what it expects of Aurora** — first outbound
   Aether client (palette→CRAM, build→reload, warp), shared design tokens
   (`empyrean/design/tokens.json`), trust model, compression ownership moving to
   Crucible/Sigil. See `empyrean/docs/SUITE_PLAN_AUDIT_2026-07-01.md` §3.1.

Nothing shipped is wrong; the *plans* just point at a world that moved. The forward
direction (what to build, in what order) is in [`ROADMAP.md`](ROADMAP.md). This doc is
the ledger of what's stale.

---

## 1. Doc-by-doc status

### Root docs

| Doc | Status | Notes |
|---|---|---|
| `README.md` | **Minor drift** | Says "editor for the `s4_engine` Sonic hack" — engine repo is `aeon/` since ~2026-06-28. One-line fix. |
| `ART_SUITE.md` | **Current** (naming drift) | Accurate usage guide for Art mode. References `s4_engine` in the terminology caveat. |
| `MCP.md` | **Current** | Refreshed 2026-07-01 (discovery `~/.aurora`, Aether endpoints). The tool list will grow ~17 tools across designs #6–#9 — extend as they land. |
| `ideas/2026-06-16-art-suite-vision.md` | **Current as an idea ledger** | Still the best long-range vision doc. Several backlog items (menu mode, parallax editor, animation event tags) are now *superseded by better, approved engine-side specs* — annotate those entries to point at the 2026-07-02 designs rather than re-deriving them. |

### Specs (`docs/specs/`)

| Spec | Status |
|---|---|
| `2026-05-02-s4-engine-editor-redesign.md` | Completed / historical. |
| `2026-06-11-art-suite-design.md` | Completed (Art mode shipped). |
| `2026-06-11-mcp-art-generation-design.md` | Completed (MCP server shipped). |
| `2026-06-16-sprite-mode-design.md` | Completed for v1 scope; animation *authoring* remains open (see ROADMAP §4.4). |
| `2026-06-17-multi-game-sprite-roundtrip-design.md` | Partially executed — adapters exist; export plans 1–6 not all shipped. Still the live spec for that work. |
| `2026-06-17-multi-game-sprite-ui-phase6-design.md` | Live (pending). |
| `2026-06-18-unified-drawing-core.md` | Completed (core merged); UI consolidation remainder tracked in polish Plan B. |
| `2026-06-19-polish-feel-foundation-design.md` | Plan A done; Plan B partially done (camera/HUD on pixel canvases done; toolStore migration deferred). |
| `2026-06-19-sprite-palette-modes-design.md` | Completed (Phases 1–3 all shipped). |
| `2026-06-19-collision-tooling-design.md` | Completed (view). |
| `2026-06-20-collision-authoring-design.md` | Completed (2a paint). **Contains the stale claim "the generator ignores editor collision"** — refuted: `aeon/tools/ojz_strip_gen.py:1065` `apply_editor_collision_overlay()` consumes `.collattr.bin`/`.collattrb.bin` authoritatively (confirmed in-game 2026-06-20). Add a status banner. |
| `2026-06-20-collision-authoring-v2-block-keyed-design.md` | Completed (block-keyed paint shipped). Same stale-claim banner needed. |
| `2026-06-21-sk-collision-import-design.md` | **Completed** — the S&K 252-shape set IS the engine's collision vocabulary now (`aeon/tools/import_sk_collision.py` runs in the build; Aurora auto-shows the set). Mark done. |

### Plans (`docs/plans/`)

Completed and correctly reflected in code: `2026-05-02-s4-editor-redesign`,
`2026-06-11-art-suite`, `2026-06-11-mcp-art-generation`, all three
`sprite-palette-modes` plans, `collision-tooling-plan-1-view`,
`collision-authoring-plan-2a`, `collision-block-keyed-plan-1`,
`collision-paint-plane-plan`, `collision-palette-redesign-plan`.

Needing status corrections:

| Plan | Recorded as | Actually |
|---|---|---|
| `2026-06-21-collision-flags-authoring-plan.md` | open | **Shipped** — the 16-bit cell-word model (shape+flip+solidity) landed (`b46ddfb`, `2a0f835`) and is in `core/formats/s4-collattr.ts`. Mark done. Its *chunk-level* successor is aeon design #6. |
| `2026-06-21-sk-collision-import-plan.md` | open | **Shipped** (see spec row above). Mark done. |
| `2026-06-17-nemesis-decode.md` | in progress | Verify against `core/compress/nemesis.ts` tests; close if green. |
| `2026-06-17-sprite-{decomposition,mappings-export,animation-export}.md` | open | Genuinely open — this is the live sprite-export queue (ROADMAP §4.4). |
| `2026-06-19-polish-feel-foundation-plan-b-feel.md` | open | Partially done; the remaining item (toolStore migration) is small and deferred by choice. |

### Aurora code that targets the retired engine pipeline ⚠️

These are *code* drift, bigger than doc drift:

- **`src/core/export/vram-coloring.ts`** — implements per-section VRAM graph coloring.
  The engine **deleted** that model (act-wide paged pool; `sec_tile_art_s4lz`/
  `sec_tile_art_vram` removed from `Sec`). This module and the `vram_bases.asm` output
  of `exportAct()` are dead-on-arrival against current aeon. Do not extend; retire or
  rewrite per ROADMAP §4.2.
- **`src/core/export/entity-data.ts`** — aeon design #9 explicitly retires the TS
  entity asm exporter ("Python generator is sole authority"). Scheduled retirement, not
  a bug.
- **`src/core/export/act-descriptor.ts`** — emits the pre-2026-06 descriptor layout
  (camera-bounds fields the engine now derives from the grid; 72-byte Sec assumptions).
  Same treatment as vram-coloring.
- **Compression codecs in TS** (`core/compress/nemesis.ts`, Kosinski in
  `core/formats/`) — fine as *import* codecs for donor-game sprites (S1/S2/S3K);
  must not become export/engine-target codecs. Engine-side compression is ZX0 + S4LZ,
  owned by Crucible (and eventually Sigil comptime). State this boundary once in
  README.

### Engine-side doc Aurora depends on (flag upstream, don't fix here)

- **`aeon/docs/LEVEL_EDITOR_SPEC.md` is stale** — still documents the 72-byte Sec,
  per-section `sec_tile_art_s4lz`, DSATUR graph coloring, and "editor generates
  `sec{N}_tiles.s4lz` / `sec_vram_bases.asm`". Ground truth is `aeon/structs.asm`
  (66-byte Sec, act pool) + `ENGINE_ARCHITECTURE.md` (reconciled 2026-06-23) +
  `aeon/tools/ojz_strip_gen.py` (editor-data overlay model). Until it's refreshed,
  treat structs.asm + the design-week specs as the contract, not LEVEL_EDITOR_SPEC.

---

## 2. Naming punch list (trivial, batchable)

`s4_engine` → `aeon` (and "Sonic 4 Engine" → "Aeon (Sonic 4 is the first game)") in:
README.md + 16 docs files (66 occurrences total — `grep -rn s4_engine docs/ README.md`).
Historical specs/plans can instead get a one-line header note ("engine repo renamed
aeon 2026-06-28") rather than rewriting history. Code identifiers (`s4-config.ts`,
`engine: "s4"`, `s4-*.ts` formats) are FINE — `s4` is the *game/format* id, and
Empyrean's rule is that wire/format names never carry brand names anyway.

---

## 3. Corrections ledger (claims in existing docs that are now false)

1. "The generator ignores editor collision / collision has no route into the ROM" —
   **false since 2026-06-20**; the overlay is authoritative (`ojz_strip_gen.py:1065`).
2. "Per-section tile art is streamed; adjacent sections need graph-colored VRAM bases" —
   **false since 2026-06-22/23**; act-wide deduped ZX0-paged pool, explicit page list.
3. "Sec struct is 72 bytes ($48)" — **false**; 66 bytes ($42), enforced by an assembler
   error guard in structs.asm.
4. "Collision shapes are throwaway concepts / need a freehand editor" — **superseded**;
   the S&K 252-shape set is the fixed vocabulary, shared globally.
5. "Menus/parallax/behaviors are far-future ideas" — **superseded**; each now has an
   approved, execution-ready engine spec + plan (2026-07-02) with a named Aurora half.
6. Camera bounds are authored per-act — **superseded**; the engine derives bounds from
   grid dimensions (see structs.asm comment at the Act struct), so the editor should
   not surface cam_min/max as authorable fields.

---

## 4. Bottom line

Trust the code and the 2026-07-02 aeon specs; treat every Aurora doc dated ≤2026-06-21
as historical unless ROADMAP.md says otherwise. The immediate doc work is: (a) this
audit's status banners + naming pass (an hour of mechanical edits), (b) adopt
[`ROADMAP.md`](ROADMAP.md) as the single forward-looking source, and (c) upstream:
refresh `aeon/docs/LEVEL_EDITOR_SPEC.md`.
