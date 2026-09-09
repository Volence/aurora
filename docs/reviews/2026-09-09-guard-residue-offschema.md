# Two of the guard seat's four named surfaces: the off-schema road, and the budget module's currency claim

**Row:** `GUARD-SEAT-RESIDUE` (tagged, `docs/lens-findings.jsonl`)
**Branch:** `parcel/guard-residue-offschema`, cut from `master` at `e443f98d`
**Date:** 2026-09-09

The guard seat chased about 56 guards, ran out of budget, and named where it
stopped rather than letting the unexamined part look covered. It named four
surfaces. Two are closed here. The main-process close guard was closed the same
night by `parcel/close-guard-witness`; the effects-formats and collision
validator trees were a sibling parcel running in parallel and are untouched by
this one.

---

## 1. What changed

| file | what |
|---|---|
| `src/main/mcp-server.ts` | the off-schema road closed: `inputSchema` registered for every method |
| `src/main/__tests__/agent-road-schema-gate.test.ts` | new; the road census as a property over the registry (175 rows) |
| `src/core/export/vram-coloring.ts` | `FG_TILE_LIMIT` 1024 to 768, with its citation block |
| `test/formats/fg-pool-ceiling-currency.test.ts` | new; the currency gate that reads aeon at a committed revision |
| `src/core/agent/budget.ts` | the expired `fits === !exportThrows` equivalence replaced by what is actually true |
| `src/main/editor-methods.ts` | `check_budget`'s author-facing description corrected |
| `test/agent/budget.test.ts` | a restated `1024` deleted rather than retyped |

Two commits, one per surface, each carrying its finding in the body.

---

## 2. Surface one: the off-schema road to the agent handler

### 2.1 The enumeration, and the instrument

`AgentRequest` is a **type**. It is erased at compile, so nothing about it
survives to runtime and each transport's own parse is the only gate.
`core/agent/validation.ts` already says this out loud, twice:
`validateCollisionWritePlane` and `validateLayoutWritePlane` are both documented
as backstops *"for any road that reaches the handler without passing this
schema"*, resting on the argument that the MCP road and the Aether road both
validate against `EDITOR_METHODS.params`. That argument was true of the Aether
road and true of most of the MCP road. Nobody had the count.

**Method: the compiler, not a grep.** Retyping `requestAgent`'s `payload` and
`handleAgentRequest`'s `req` to a `unique symbol` and running
`npx tsc --noEmit -p tsconfig.json` names every call site that hands either one a
request. Production has exactly three, and they are one chain rather than three
doors:

```
   POST /mcp    -> loopbackOnly -> MCP SDK tool dispatch
                                     |
   POST /aether -> loopbackOnly -> adapter.handleRequest -> z.object(m.params).safeParse
                                     |
                          forward / aetherForward          [mcp-server.ts:26, :135]
                                     |
                          requestAgent -> webContents.send  (structured clone)
                                     |
                          preload onRequest -> registerAgentHandler
                                     |
                          handleAgentRequest(envelope.payload)  [agent-handler.ts:142]
```

**What that instrument is blind to, stated because a census that cannot say what
it missed is not a census.** Ten *test* call sites write
`handleAgentRequest(req as never)`, and `never` is assignable to everything, so
those files never error and never appear in the census. The blindness is confined
to tests: no production call site casts, which is why the production answer above
is complete and the test-caller list from the same run is not.

**And the first run of that instrument lied to me.** I piped `tsc` through
`tee file | head -40`; `head` exited, `tee` took SIGPIPE, and the captured output
stopped at 41 lines with `agent-handler.ts` absent from it. Read as a result,
that says the IPC receiver is not a caller. It was a truncation by my own
pipeline. What caught it was planting a deliberate type error at line 142 and
confirming `tsc` reports it, which is the same rule as the rest of this packet:
**plant a violation before believing any instrument, including your own.**

### 2.2 The plant, and the ratio

| road | methods schema-gated | ungated |
|---|---|---|
| Aether `/aether` | **57 / 57 (100%)** | 0 |
| MCP `/mcp` | 45 / 57 (78.9%) | **12 / 57 (21.1%)** |

`mcp-server.ts` registered `inputSchema` only when
`Object.keys(m.params).length > 0`. The MCP SDK picks the callback's **signature**
off exactly that (`executeToolHandler`, `@modelcontextprotocol/sdk` 1.29.0,
`dist/esm/server/mcp.js`): with a schema it calls `handler(args, extra)`, and
without one it calls `handler(extra)`. So for the twelve zero-param methods
Aurora's `args` parameter bound to the SDK's `RequestHandlerExtra`, and
`{ kind: m.kind, ...args }` spread that into the request.

Sent down the real `/mcp` route with `requestAgent` observed, the payload reaching
the bridge for `get_palette` was:

```
kind, signal, sessionId, _meta, sendNotification, sendRequest, authInfo,
requestId, requestInfo, taskId, taskStore, taskRequestedTtl,
closeSSEStream, closeStandaloneSSEStream
```

Thirteen keys no schema has ever seen, two of them functions.

**The consequence is not untidiness.** `webContents.send` serialises with the
structured clone algorithm, which throws on a function, so all twelve zero-param
tools could not cross the IPC hop at all: `get_project_info`, `get_palette`,
`get_bg`, `list_bgs`, `list_effects_scenes`, `list_effects_presets`,
`list_bg_anim_bands`, `get_project_report`, `list_classic_levels`,
`save_project`, `aether_status`, `build_and_run`. The mitigating half is that it
fails **loud**: the throw rejects the request rather than forwarding junk.

**Why it hid.** The Aether road carries the traffic, and the Aether road was
correct throughout, including for these twelve: `adapter.ts` runs
`z.object(m.params).safeParse` for *every* method and spreads the **parsed** data,
and an empty object schema strips rather than passes.

**An off-schema value is refused on both roads.** `plane: "c"` into
`paint_collision` (the exact value `validateCollisionWritePlane`'s docblock
records as having painted plane A and reported `{"painted":4}` on the unguarded
handler) reaches the bridge on neither road, and the test asserts **which gate**
refused it rather than merely that something did: the SDK's
`Input validation error` on one, the adapter's `-32602 invalid params` on the
other.

### 2.3 The fix, and the evidence it is surface-preserving

Three lines removed, one added: register `inputSchema` for every method. An empty
raw shape is not a no-op registration, which is the point: `z.object({})` strips
every key, so the callback receives `{}` and the payload is exactly `{ kind }`.

**Measured, not assumed.** `tools/list` captured before and after differs by
exactly twelve added lines, one `"$schema": draft-07` per zero-param tool; the
count goes 45 to 57, i.e. the twelve now carry what the other 45 always had. The
SDK already substituted `EMPTY_OBJECT_JSON_SCHEMA` for a missing schema, so the
advertised shape was already an empty object.

**Red-first:** 24 failed / 150 passed before the change, 175 passed after. The 24
are exactly the 12 methods times 2 assertions. The test asserts a **property over
`EDITOR_METHODS`**, not a list of tool names, so a method added later is covered
by construction; it carries a **control** row that fails if the harness stops
observing the payload at all.

---

## 3. Surface two: the budget module's two-sided currency claim

**Verdict: the claim is FALSE.**

The seat refused to answer this from Aurora's own copy and was right to. A
currency check's population comes from the producer's writers, because an absent
constant and a passing check are one and the same output. So the answer came from
aeon's committed source, read through git objects at a revision, never through
the sibling working tree.

**Anchors.** Read at aeon `origin/master` =
`544bd749af6eae9a5f47316cc39076ef71926b43`, verified at that same revision in the
same fetch:

* `games/sonic4/vram.toml`, blob `ebbf4afba83beb8d79bd0ae74090041565684813`
* `tools/vram_map.py`, blob `1c8e49f8f88cb73d1cb662c7191b9b75a51023d5`

### 3.1 Two sides, and only one of them was wrong

`FG_TILE_LIMIT = 1024` carried the comment *"BG region starts at tile slot 1024
($400); FG group unions must fit below it."*

**The premise is TRUE.** aeon's BG arena does begin at slot 1024. Aurora already
vendors that number as `BG_TILE_BASE_SLOT` in
`src/core/formats/bg-override/bganim-consumer-contract.json`, where
`test/formats/bg-override-contract-currency.test.ts` keeps it current.

**The conclusion is FALSE.** The FG pool does not run up to the BG arena. aeon
declares it as one region, `fg_art_pool`, based at slot 0, `tiles = 768`,
`authority = "engine-endtiles:POOL_TILE_CEILING"`. **Eleven** regions occupy the
gap between that region's end and the BG arena: `spare_nametable`, `dust_puff`,
`dust_spindash`, `ring_sparkle`, `insta_shield`, `debug_preset_readout`,
`character_window`, `test_obj`, `ring_placeholder`, `test_marker`,
`debug_lab_name`. aeon's generated map agrees (`POOL_TILE_CEILING = 768`, and the
`0-767 | fg_art_pool` row of aeon `docs/generated/vram-map-sonic4.md`), and aeon
`docs/ENGINE_ARCHITECTURE.md` names `POOL_TILE_CEILING` as the pool's ceiling.

Aurora restated the BG **base slot** as the FG **pool ceiling**, and handed an
author 256 tiles belonging to eleven other regions: a **33% overstatement**, on
the generous side, of the budget `check_budget` reports and of the number
`editor-methods.ts` puts in the tool's description, which is the only place an
agent learns its budget before spending it.

### 3.2 Why no drift gate could have caught it

**It was not a stale copy of a past value.** aeon's own `tiles` comment records
the ceiling moving `960 -> 896` (the dust carve) `-> 768` (EFFECTS-W1 item 0's
`spare_nametable`). 1024 was never any of those. It was a different quantity
wearing the right shape, and a gate comparing Aurora's copy against aeon's
history would have found no version that matched.

More simply: there was nothing to gate. `FG_TILE_LIMIT` was a bare literal with
no provenance marker, no contract entry and no currency test, in a repo that has
all three for the BG twin next door.

### 3.3 What is closed, and what is left open

`test/formats/fg-pool-ceiling-currency.test.ts` inherits the three rules the
neighbouring currency files established: aeon is read at a committed revision
through git objects; every message names the revision; and an absent checkout or
unresolvable revision is a **loud skip**, never a pass. Planted before believed:
restoring 1024 reddens both authority rows with *"Aurora's FG_TILE_LIMIT is 1024;
aeon declares 768 at 544bd749..."*. Restored to 768 it is 3 passed with **no
skips**, so it measured rather than declined.

**OPEN, and named rather than quietly closed.** This gates the **ceiling**, not
the **counting**. `computeActBudget` still splits the act into the two
checkerboard VRAM groups the retired per-section VRAM-base scheme needed and sums
their unions; aeon holds act FG art in one globally-deduped paged pool. A tile
used by both groups is therefore counted twice here and once there, which makes
the reading **conservative on the tile axis** (`fits=true` has margin,
`fits=false` can be pessimistic) and is now described that way rather than as the
equivalence it claimed. `budget.ts` said *"Counts match export exactly, so
`fits === !exportThrows`"*; both halves had expired, because the export path it
names was retired 2026-08-19 and `computeActBudget` is the last consumer of the
symbols that survived it. So the equivalence named a comparand that no longer
exists, which is how it went on reading as a guarantee.

Two questions are measured by nothing in this repo and are **not** closed here:

1. whether the two-group checkerboard split is the right model at all, now that
   the scheme it served is gone;
2. whether page-frame fragmentation (the pool's quantum is 64) can refuse an act
   whose raw tile count fits.

Both want aeon's pager, not Aurora's copy, and both are outside the bounded read
this parcel was scoped to.

---

## 4. Where the budget ran out, named

* **The twelve broken MCP tools are proven broken by the structured clone
  algorithm, not by a running Electron.** `structuredClone` is that same
  algorithm and the payload throws under it; `webContents.send` uses it. That is
  a derivation from a measurement, not a live observation of Electron refusing
  the send. **TAGGED for a foreground Electron run** if anyone wants the last
  step witnessed. Nothing in this parcel touched an emulator.
* **Whether any caller ever exercised those twelve over MCP** is unknown. Their
  being broken is consistent with the Aether road carrying all real traffic, but
  I did not look for a client.
* **The `as never` test call sites (10 of them) were not repaired.** They defeat
  the compiler census for anyone who runs it next. Worth a row; not this parcel's.
* **The counting model** above. This is the larger half of surface two and it is
  deliberately left open with its two questions written down.
* **The other two of the seat's four surfaces** are untouched here by design: the
  close guard was closed elsewhere the same night, and the effects/collision
  validator trees belonged to a sibling parcel running concurrently.

## 5. Suite

`npm test` aggregate before and after are recorded in the final commit's body.
Baseline on `master` at `e443f98d`: **563 files passed / 3 skipped; 8248 tests
passed / 9 skipped**, exit 0.
