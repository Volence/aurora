# Art agent surface — `commit_canvas` and `import_art_sheet`

**Date:** 2026-08-18
**Status:** design, approved
**Phase:** §7 classic collision authoring, stage 5 — *Plan A of two* (Plan B is
`set_block_collision`, specified in `2026-08-16-classic-collision-authoring-design.md` §4.5)

## 1. What this is, and why it is not "MCP parity"

The 2A/2B/2C art line — originate on the canvas, resolve to tiles/blocks/chunks,
commit into an act — shipped UI-only. DIR-A3 named that as the parity breach, and
the collision spec's §4.5 files it under "MCP parity". **That heading is a
misnomer, and correcting it is the first thing this design does.**

`src/main/editor-methods.ts` is a single registry consumed by *both* surfaces:

- `src/main/mcp-server.ts:32` registers each entry as an MCP tool `<name>`
- `src/main/aether/adapter.ts:24` exposes each entry as Aether `editor/<name>`,
  and `capabilities()` advertises it in the `initialize` handshake

Its own docblock states the intent: *"defined once and consumed by BOTH the MCP
server and the Aether adapter so the two never drift (the spec's keystone:
discovery is the protocol)."* This matches how the suite frames the bus
generally — `empyrean/clients/python/aether.py` describes the Oracle MCP as
*"one client of the bus, not the definition of it."*

So the work is **registry work**: a schema entry in `EDITOR_METHODS`, an
`AgentRequest` kind in `src/shared/agent-protocol.ts`, and a case in
`src/renderer/agent/agent-handler.ts`. Both protocols light up together. There is
no MCP-specific work in this design, and no Aether-specific work either.

## 2. Shape: two tools, one commit path

Both tools are the same operation with different pixel sources. Both land on the
existing `planFromSnapshot` (`canvas-commit-model.ts:237`). No commit logic is
duplicated or re-specified.

```
commit_canvas {name}      --+
                            +--> CommitSnapshot --> planFromSnapshot --> classicCommitCanvas
import_art_sheet {path}   --+          ^               (pure, existing)     (existing command)
                                       |
                         commitContextFromStores()
                      doc . reservedTiles . range . animTiles
```

### 2.1 `commit_canvas` addresses a canvas by NAME

Not by path, and not "whatever tab is open".

`src/renderer/state/canvas-file.ts:1-4` states the rule — *"The ONE place that
knows where a canvas lives on disk. Everything above this module addresses a
canvas by NAME."* Canvases live at `<project>/.aurora/canvas/<name>.png` plus
`<name>.canvas.json`, and `canvasNameIsSafe` (`:39`) already guards the name as
part of a path. A `path` parameter would break that rule *and* hand the agent an
arbitrary-file-read primitive.

`loadCanvasFile(dir, name)` (`:119`) is already dialog-free and name-addressed,
so this needs no refactor on the canvas side.

**The "commit the open canvas tab" mode is deliberately excluded.** It reads like
parity with the UI button, but it makes the tool's input invisible volatile
state — the same shape as the lens sweep's R2 (`get_classic_level` destroying
unsaved edits). Committing a named, saved, inspectable artifact is the better
contract.

*Cost, stated rather than hidden:* an unsaved canvas is not reachable from the
agent. The human saves first. If this proves to be real friction in use, the
remedy is a `save_canvas` tool, not a hidden read of live UI state.

### 2.2 `import_art_sheet` takes a path

An external PNG is the entire point of that path — `ImportSheetDialog.tsx:10-17`
describes the build-a-sheet-elsewhere story, and `import-sheet.ts:6-11` records
that this path exists *precisely* to sidestep the canvas document's
`CANVAS_MAX_SIDE` cap, because that cap belongs to the document (40 whole-buffer
undo snapshots) and not to the decoder. A sheet is layout-sized, as SonED2's is.

### 2.3 Parameters

Shared by both tools:

| param | default | rationale |
|---|---|---|
| `targets[]` | all-append | One `chunkFileIndex \| null` per region chunk, row-major. Appending never reclaims — the non-destructive default, cleanly refused at the 127-chunk cap. Well-defined when omitted because the region is derived (§2.4). |
| `paletteResolution` | `'none'` | `use-act-colours` rewrites pixel entries and `adopt-into-zone` rewrites the zone palette. Neither should happen unasked. |
| `collision` | `false` | Matches stage 4's off-by-default commit toggle (`core/art/commit-collision.ts`). |
| `dryRun` | `false` | `true` is the exact parity of the preview panel. |

Per-tool: `commit_canvas` takes `name`; `import_art_sheet` takes `path`.

### 2.4 No `region` parameter

Commit derives its region from `canvasChunkCapacity` — whole chunks from the
top-left, with any remainder reported rather than silently included or dropped
(`canvas-commit-model.ts:229-236`). This design keeps that identical rather than
letting the agent cut somewhere a human could not, which would also make
`gridOrigin` refusals unreproducible in the UI.

## 3. Two targeted refactors

Both remove a UI dependency from a rule. Neither is unrelated cleanup: without
them the agent handler would carry a second copy of a load-bearing rule.

### 3.1 Split the dialog out of `loadSheetForAct`

`import-sheet.ts:59` currently fuses a file dialog with decode-and-map:

```
loadSheetForAct(doc)  ->  pickSheetPath()                      (dialog, renderer-only)
                          sheetFromBytes(doc, bytes, path)     (decode, map, refuse)
```

The agent calls `sheetFromBytes`; the dialog calls both. The two refusal messages
at `:73-89` — already written in the artist's terms — move into
`sheetFromBytes`, so the agent receives the same text the human does.

### 3.2 Extract `commitContextFromStores()`

`CommitPlanView.tsx:39-69` reads `levelDoc`, `reservedTiles` and `range` from the
stores and turns them into the level half of a `CommitSnapshot`. The agent
handler needs the identical four reads.

This must be extracted rather than repeated, because `range === null ->
editableRangeKnown: false` is load-bearing: the planner refuses to RECLAIM under
an unknown editable span while still allowing an additive commit
(`classic-commit-plan.ts:66-73`). A second copy of that rule in the agent handler
is exactly the drift this codebase has been avoiding elsewhere.

## 4. Error handling: refusals are results, not errors

The Aether adapter maps any thrown error to `ERR.INTERNAL` / `-32603`
(`adapter.ts:76-78`). That code means *the server broke*. "This commit needs 12 tiles
and 4 are free" is not a server fault — it is the answer, and the most useful
answer the tool gives.

So both tools **return a structured refusal inside a successful `result`**, and
reserve thrown errors for genuine faults: no act open, canvas name not found,
file unreadable, PNG not indexed.

```json
{ "ok": false,
  "refusal": { "kind": "tiles-exhausted", "needed": 12, "available": 4,
               "reclaimed": 0, "free": 4 },
  "message":    "This commit needs 12 tiles; 4 are available.",
  "resolution": "Replace more chunks - their art is reclaimed - or simplify the drawing.",
  "offers":     [] }
```

`message` / `resolution` / `offers` come from `refusalView()`
(`canvas-commit-model.ts:124`) — the *same* explainer the panel renders. The agent
and the human read the identical sentence. `offers` names which
`paletteResolution` values would unblock the call, so a `palette-drift` refusal is
self-healing rather than a dead end.

Two refusal families, both surfaced whole:

- **`CommitRefusal`** — 12 kinds (`classic-commit-plan.ts:84-96`), from
  `region-misaligned` through the three exhaustion kinds.
- **`PngImportRefusal`** — 2 kinds (`png-import.ts:32-38`), `import_art_sheet`
  only, raised *before* the commit planner runs: `colour-not-in-act`,
  `cell-needs-two-lines`.

### 4.1 The success reply

On success the reply carries the full `CommitReport` — both pool snapshots, the
reuse/reclaim/mint counts, the collision-inheritance counts, and `warnings` —
**plus the appended chunks' 1-based engine ids.**

Those ids are not in the report today: `classicCommitCanvas` returns bare
`{ ok: true }` (`classicLevelStore.ts:57,1131`). The handler derives them rather
than widening the store's return type.

**The derivation, stated exactly, because an off-by-one here is silent.** An
engine chunk id is its file index plus one — `classicAddChunk` computes
`newEngineId = nextChunks.length`, annotated at `classicLevelStore.ts:1354` as
*"file index (length-1) + 1 = length"*. So for a commit that appends `k` chunks
against `N = report.poolBefore.chunks`:

- file indices `N .. N+k-1`
- **engine ids `N+1 .. N+k`** — what the reply returns, and what
  `set_layout_region` consumes

`k` is `plan.chunkAppends.length`. Chunks that were *replaced* rather than
appended keep their existing ids and are not in this list.

They are required, not a nicety: without them the agent has just minted chunks it
cannot name in a follow-up `set_layout_region`. `add_chunk` already sets the
precedent — its description promises *"the new 1-based ENGINE id"*.

### 4.2 `dryRun`

`dryRun: true` returns a reply identical to a real commit minus the mutation:
same refusals, same report, same ids it *would* assign.

## 5. Testing

### 5.1 Pure core, node suite

§3.1's refactor is what makes this reachable: `sheetFromBytes` is dialog-free, so
PNG decode -> palette map -> both refusals are testable against real bytes with no
Electron. These assert the *seam*; `planCanvasCommit` itself is already covered
and is not re-litigated.

### 5.2 Registry conformance

The keystone claim — that MCP and Aether cannot drift because they share
`EDITOR_METHODS` — is true by construction today but **unasserted**. Two tests in
`src/main/__tests__/`:

1. Every registry entry appears as both an MCP tool and an `editor/<name>` in
   `capabilities().methods`.
2. Every entry's `kind` has a matching case in the agent handler.

The second is the one that would actually rot: a registry line with no handler
case fails only at call time.

### 5.3 Plant-guarded refusals

Per the discipline that caught three would-be regressions in stages 1-4, every
refusal path gets a test that **plants the violation** and proves the refusal
fires: a canvas whose palette drifted, a sheet with a colour the act lacks, a cell
mixing two lines, a target naming a chunk that does not exist, an append past 127.

A refusal that no test provokes is a refusal we do not believe exists.

### 5.4 Runtime under CDP

The node suite cannot see React or the real IPC, and this surface crosses that
line throughout — file reads, store reads, the guarded write channel. So
`scratchpad/art-agent-harness.mjs`, in the shape of
`scratchpad/commit-collision-harness.mjs`:

- drive the real app against the real Sonic 4 project
- call both tools over the actual HTTP endpoint, **not** by importing the handler
- commit a real canvas into a real act
- read the pools back through `__dbg.classic` and assert the chunk ids the reply
  promised are the chunk ids that exist
- the round trip that matters most: commit, then `set_layout_region` with the
  returned ids — the workflow those ids exist for, and one no node test can reach

## 6. Explicitly not in this design

- **`set_block_collision`** — Plan B, the other half of stage 5. Named that
  because aeon already owns `paint_collision` (`editor-methods.ts:70`) with
  different semantics (a collision-plane cell word including solidity, versus a
  shape index on the zone-wide *block* tier). The flat registry requires globally
  unique names; `set_level_palette` (`:145-149`) is the existing precedent for
  exactly this collision.
- **Canvas drawing tools.** Nothing here lets an agent originate pixels. Both
  tools consume art that already exists as a file. Whether the agent should be
  able to draw is a separate design question.
- **`save_canvas`.** See §2.1 — the remedy if the saved-file requirement proves
  to be friction.
- **Widening `CommandResult`** to carry appended ids. §4.1 derives them instead.
