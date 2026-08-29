# The agent's paint, the composer's stamp, and one rule for three roads

**Branch** `o12-agent-paint-priority` · **base** master `93f7870` · **ROADMAP O12**
**Instrument** `scratchpad/tile-attribute-harness.mjs` · **runner** `npm run harness:tile-attributes`
**Commits** `a16a8dc` (the agent road) · `18b2119` (the third decider) · `e732e61` (the harness)

---

## 1. What the defect was

`docs/reviews/2026-08-28-tile-attributes.md` fixed the four interactive paint
sites and created a single decider, `src/core/editing/brush-word.ts`, whose rule
is:

> **The brush owns the picture. The cell keeps its depth.**

That parcel deliberately left one adjacent path alone and TAGGED it (§2, §6).
This is that item.

`agent-handler.ts` `paint-region` read the destination word into `oldNt` and then
threw it away:

```ts
const oldNt = section.tileGrid.nametable[idx];
entries.push({ index: idx, oldNt,
  newNt: packNametableWord(spec.tile, spec.pal, !!spec.pri, !!spec.vf, !!spec.hf) });
```

`NametableEntrySpec.pri` is **optional** (`src/shared/agent-protocol.ts:12`), and
`!!undefined` is `false`. So an agent bulk-painting a region over authored art
**cleared every priority bit it covered** — the information needed to preserve it
sitting in a local variable one line above.

---

## 2. ⚠ The complete writer sweep

The dispatch named `paint-region` and `save-chunk`, said `stamp-chunk` and the
clipboard were audited as whole-word transfers, and asked for that enumeration to
be **confirmed or refuted**.

**It is refuted. There is a third decider, and it is not in the earlier packet's
"confirmed safe" list either — it is listed there as safe, under a module name
that is safe in the function the packet actually read.**

Kinds are the collision packet's taxonomy
(`docs/reviews/2026-08-28-collision-word-preservation.md` §3):

- **DECIDERS** choose what a gesture or request writes. They mean something
  *narrower* than the cell, so they must merge. The rule goes here.
- **TRANSFERS** move a whole cell from a source. The source owns all sixteen bits.
- **APPLIERS** replay or retarget a word some decider already chose.
- **CREATORS** fill a destination that provably has nothing to preserve.

### DECIDERS — 6 sites, 2 were broken (1 of them newly found)

| # | Site | Verdict |
|---|---|---|
| 1 | `MapViewport.tsx` × 4 (paint-tile press ~:2713, paint-block ~:2753, drag ~:3095, BG stroke ~:1953) | **FIXED 2026-08-28.** All four go through `brushNametableWord`. Re-confirmed by reading, and by harness rows `[p1]`–`[p3]`/`[bg]`. |
| 2 | `agent-handler.ts` `paint-region` (~:390) | **WAS BROKEN — FIXED.** `!!spec.pri` collapsed OMITTED into OFF. Now `brushNametableWord(spec.tile, oldNt, {…, priority: brushPriorityFromOptional(spec.pri)})`. |
| 3 | **`ComposerCanvas.tsx` `applyTileCell` → `composer-buffer.ts` `stampTile` (~:347 / :262)** | **WAS BROKEN — FIXED. THE SITE THE ENUMERATION MISSED.** It passed a hard-coded `pri: false`, and the composer's documents are seeded from **real** data (`docFromChunk` :62 and `docFromSectionRegion` :91 both carry `pri: e.priority`). So an Art-facet stamp over a cell captured from a priority section destroyed the bit, `sliceForSave` wrote the flattened word back, and every **untouched** cell in the same document kept its own — an inconsistency inside one surface. |
| 4 | `agent-handler.ts` `save-chunk` (~:470) | **CORRECT — CREATOR, and now stated as one.** See §4. |

**Why #3 is invisible to the obvious search.** `stampTile` builds a
**`ComposerCell`**, not a word — no `packNametableWord`, no `0x8000`, no `<< 13`.
A grep for the encoder finds `composer-buffer.ts`'s `sliceForSave`, which is
genuinely correct (it emits all five fields), and stops there. That is exactly
what the 2026-08-28 packet's safe-writers table records. The decider is one
function upstream of the one that was read. This is the same shape as
`composer-collision.ts` `paintDocCollision`, which the collision packet called
"the site an enumeration by TOOL misses".

### TRANSFERS — correct as they stand

| # | Site | Why it is right |
|---|---|---|
| 5 | `map-stamp.ts` `buildRegionWriteCommand` (:48) | `newNt = source.nametable[…]` — whole words. Serves **both** `stamp-chunk` (UI and agent) and clipboard paste. Confirmed by reading, not inherited. |
| 6 | `map-clipboard.ts` `copyFromSection` (:173) / `copyChunkToClipboard` | Whole words out of the nametable. |
| 7 | `composer-buffer.ts` `docFromChunk` (:54) / `docFromSectionRegion` (:79) | Word → cell capture, **carrying `pri`**. This is what makes #3 a real loss rather than a theoretical one. |
| 8 | `project/aeon/load.ts`, `formats/s4-strips.ts` (:50), `formats/s4-nametable.ts` | File I/O, full 16-bit round trip. |

### APPLIERS — correct as they stand

| # | Site | Why it is right |
|---|---|---|
| 9 | `history.ts` :201 redo / :364 undo (sections), :136 / :313 (BG layout) | Replay a word a decider already chose. `oldNt` is captured **whole** by every decider above, so undo restores all sixteen bits — harness `[w6]` proves it across the wire. |
| 10 | `MapViewport.tsx` :2718 / :3099 / :2023 live apply | The same word the command carries; correct once the deciders are. |
| 11 | `composer-buffer.ts` `applyPaletteLineToWord` (:173) / `applyPaletteLineToDocCell` (:185) | Rewrite **only** bits 13–14. Priority, flips and tile index survive. (It open-codes `~0x6000` and `<< 13`; correct today, and noted in §7.) |
| 12 | `composer-buffer.ts` `setPixels` (:126) | Mutates pixels in place; never touches `pri`. Clears `hf`/`vf` because the flips are *baked into the pixels it just wrote* — the picture is preserved, re-expressed. |
| 13 | `editing/band-stamp.ts` `bandStampWords` (:90) | `attrs \| (slot & LAYOUT_TILE_INDEX_MASK)` — rewrites the tile index and preserves every attribute bit from `existing`. |
| 14 | `bg-anim-band.ts` `planLayoutRemap` (:516) | `(word & ~LAYOUT_TILE_INDEX_MASK) \| to` — renumbering, attributes preserved. Its one word-zeroing branch is a band *removal* whose art is gone, gated behind an explicit `blankReferencingCells` opt-in with a loud refusal otherwise. |
| 15 | `export/tile-dedup.ts` (:118), `art/atlas-migration.ts` (:104) | unpack → repack, all five fields; atlas-migration **XORs** flips rather than dropping them. |
| 16 | `editing/region-flip.ts` (:125/:127) | Builds flip masks *through* `packNametableWord` and XORs them onto whole words. |

### CREATORS — correct as they stand

| # | Site | Why it is right |
|---|---|---|
| 17 | `agent-handler.ts` `save-chunk` (~:470) | `createChunkDef` returns `new Uint16Array(w*h)` — verified by reading, and by a test row. Nothing to preserve. Now routes through the decider with `undefined` as the destination; see §4. |
| 18 | `composer-buffer.ts` `sliceForSave` (:325) | Packs a **freshly allocated** `Uint16Array` from cells that already carry `pri`. Correct — and it is what carries #3's loss out to disk. |
| 19 | `formats/chunk-mappings.ts` (:139–142) | ROM import; `resolveBlock` yields whole words from donor block data. No destination. |
| 20 | `agent-handler.ts` `set-bg` (~:604) | The caller supplies whole 16-bit layout words, validated and copied verbatim. |
| 21 | `composer-buffer.ts` `emptyCell` (:34) / `docFromTile` | An empty cell has no depth. |

### The classic (S1) side does **not** share the hole

`blockCellSchema` (`editor-methods.ts:57`) marks `pri` **required**, and
`classic-edit-chunk` takes caller-supplied whole cell words. There is no
optional-priority field to collapse. `classic-commit-plan.ts:536`'s `pri: false`
is an explicit, commented decision about a canvas that has no priority plane.

**Count: 21 writers. Two were broken; one of the two was not on any prior list.**

---

## 3. The rule as implemented

Unchanged in substance — this parcel **applies** the shipped rule to two more
roads rather than making a new decision:

| Field | Source | On the agent road | On the composer road |
|---|---|---|---|
| tileIndex | request / brush | `spec.tile` | `spec.tile` |
| palette | request / brush | `spec.pal` | `spec.pal` |
| hFlip / vFlip | **request / brush** | `!!spec.hf` / `!!spec.vf` — omitted means **unflipped** | `flipRef` — the composer already arms them |
| **priority** | **tri-state, default `keep`** | `brushPriorityFromOptional(spec.pri)`: absent → `keep`, `true` → `on`, `false` → `off` | `'keep'` (the facet has no control yet — §7) |

Three functions, one rule:

- `brushNametableWord(tile, oldWord, brush)` — the word road (map + agent).
- `resolveBrushPriority(brush, destinationPriority)` — split out of it, because
  the composer decides on a **cell**, not a word, and cannot call the packer.
- `brushPriorityFromOptional(pri)` — the wire's three states (`true`, `false`,
  **absent**) named honestly instead of collapsed. It lives in `brush-word.ts`,
  not in the handler: a copy of the rule beside the call site is how four
  open-coded paint words happened in the first place.

`agent-handler.ts` **no longer imports `packNametableWord` at all**, which is the
invariant `brush-word.ts` states ("nothing in the renderer may build a paint word
by hand again") now actually enforced on this file.

### No wire or protocol change was needed — verified, not assumed

`z.boolean().optional()` passes an absent field through untouched (zod 4.4.3,
measured directly):

```
parse({tile:1,pal:0})            → {"tile":1,"pal":0}   'pri' in r: false   r.pri === undefined: true
parse({tile:1,pal:0,pri:undefined}) → key present, value undefined
parse({tile:1,pal:0,pri:false})  → r.pri === false
```

Both spellings of "omitted" reach the handler as `spec.pri === undefined`. The
collapse happened **only** at `!!spec.pri`. `NametableEntrySpec` is unchanged.
Harness row `[w1]` proves it end-to-end across express + zod + IPC.

---

## 4. The shared-schema trap, handled by making the two consumers agree

`entrySchema` (`editor-methods.ts:45`) is shared by `paint_region` **and**
`save_chunk`, which are different kinds of writer. Its `pri` description said
only `'VDP priority bit'` — after this change that is silent about the only thing
omitting the field decides, and an agent cannot read the source to find out.

Three options were available: split the schema, per-tool `.describe()` overrides,
or one sentence true for both. **The third**, because the two consumers can be
made to genuinely agree rather than merely be documented apart:

- `paint_region` is a DECIDER — omitted `pri` keeps the destination's bit.
- `save_chunk` is a CREATOR — its cells come from `createChunkDef`'s freshly
  allocated `Uint16Array`, so there is no destination and `keep` **collapses to
  "no priority"**: byte for byte what it always wrote.

So "omit to keep what the destination has" is true of both, and `save_chunk` now
routes through the same decider with `undefined` as the destination. It passes
`undefined` rather than reading the fresh array back, deliberately: reading it
would give the same answer today and would silently turn a creator into a merge
the day `createChunkDef` starts seeding anything.

`hf`/`vf` now say out loud that they are **not** tri-state, so an agent does not
assume the fields are symmetric. `paint_region`'s and `save_chunk`'s own
descriptions carry the one-line consequence too.

---

## 5. How it was verified

### The node suite — 5,468 pass / 0 fail / 7 skipped (405 files)

`npm run test`, aggregate. `npx tsc --noEmit` clean.

New rows: 12 in `src/renderer/agent/__tests__/agent-handler.paint-priority.test.ts`,
12 added to `src/core/editing/__tests__/brush-word.test.ts` (27 total), 4 added to
`test/art/composer-buffer.test.ts` (23 total). Every expectation goes through
`packNametableWord`/`unpackNametableWord`; no literal word appears.

**Proven assertive by planting each defect and showing the failure:**

| Planted | Reddens | The assertion |
|---|---|---|
| `priority: spec.pri ? 'on' : 'off'` (the original `!!spec.pri`) | 2 rows | `expected false to be true` at `agent-handler.paint-priority.test.ts:96` — "an OMITTED pri PRESERVES a set priority bit"; and the per-cell bulk row at `:146` |
| flips preserved from the destination (rejected rule B) | 1 **different** row | `expected true to be false` — "the FLIPS still follow the request" |
| `pri: spec.pri === 'on'` in `stampTile` (the composer's hard `false`) | 2 rows | `expected false to be true` — the direct preservation row and the capture→stamp→save round trip |

All three restored; the suite is green on the restored tree.

### The running app — **49/49**, four consecutive runs

`npm run harness:tile-attributes`, extended 37 → 49 rows. The 12 new `[w*]` rows
POST `editor/paint_region` to the **real Aether binding** — no mouse — crossing
the express route, the zod layer and the IPC bridge, none of which any node test
reaches. Each reads its answer back out of the **document** through
`__dbg.aeon.ntAt`, never off the tool's own reply.

Build: `VITE_AURORA_DEBUG=1 npm run build` immediately before every run reported
here; no number below came from a stale `dist/`.

**Red-first, same 49 rows, `!!spec.pri` planted back — ONE run, 47/49:**

```
[w1] an OMITTED pri PRESERVES the destination's priority bit (THE DEFECT)   FAIL
     before 0xc84b [tile=75 pal=2 PRI HF]   after 0x204c [tile=76 pal=1]
     before PRI=true  after PRI=false
[w4] a BULK region keeps EACH cell's own priority — per cell, not per request  FAIL
     before 001001   after 000000
```

**Green, restored — four runs at 01:45–01:47 (host uptime 3d 17h 34m):**

```
════ 49/49 ════   ×4
dpr=1  rect=(284,74,876x721)  canvas.width=876  in all four
```

**Fixtures are REAL cells, found live.** `0xc84b` (tile 75, palette 2, priority +
hFlip) is an authored cell of OJZ act 1 section 0, located by the app's own
`ntRect`; the harness dies if the search comes up empty. `[w4]`'s subject is a
live 3×2 rectangle at (142,39) whose priority pattern is `--- --- PRI / --- ---
PRI` — mixed on purpose, because a rule applied once per request instead of once
per cell passes a 1×1 row and fails this one.

### ⚠ Rows that do NOT discriminate — named here and printed at runtime

| Row | Green on the broken build because | What it is for | Its discriminator |
|---|---|---|---|
| `[w2]` `pri:false` clears a set bit | the old handler cleared bit 15 unconditionally | rules out "the app always sets priority" | `[w1]` |
| `[w3]` `pri:true` sets a clear bit | `!!true` is `true` | rules out "the app never sets priority" | `[w1]` |
| `[w5]` omitted `hf`/`vf` land unflipped | the old handler also cleared the flip bits | **pins the ruling that the flips are not a defect** | none — it is a pin, by design |
| `[w6]` one undo restores the whole request | `oldNt` was always captured whole | anti-vacuous guard for `[w4]` — proves the words were really written and are really undoable | none |

**`[w1]` and `[w4]` are the only two `[w*]` rows that are evidence of the fix.**
The harness header says this, and each row prints its own NON-DISCRIMINATING note
in the run log so a reader of the output cannot miss it.

Anti-vacuous pairing, as in the earlier packet: every preservation row is paired
with a row asserting the armed/sent tile index actually landed (`[w1a]`, `[w4a]`)
and with a precondition row asserting the destination really carried the bit
(`[w1-pre]`, `[w2-pre]`, `[w3-pre]`).

**dpr is irrelevant to the `[w*]` rows** — they send no coordinate. `[aim]` still
governs the mouse rows, and dpr was 1 in all four green runs and in the red run.

---

## 6. ⚠ Two hazards found by running this, both PRE-EXISTING

Neither is caused by this parcel. Both hit **every harness in this repo that
launches the app**, and both were live on this machine.

### 1. The shared discovery file

`startMcpServer` publishes the app's port to `~/.aurora/mcp.json` **and**
`~/.sonic-level-editor/mcp.json`. Those are the same paths the **owner's own
Aurora** writes. Measured 2026-08-29: the owner's Aurora held the default port
38473 with a live OJZ project (`get_project_info` answered from it), and the
harness's first run left both files pointing at its throwaway instance — on an
ephemeral port that then died.

A `[w*]` phase that took a port out of that file would have painted into the
**owner's open document** and read its own back. Every row green, describing
nothing. The first version of the guard caught it and refused, which is how it
was found.

Fixed in the harness: the port is accepted only once the `pid` in the file is
proven a **descendant of the process this harness spawned**, and both files are
snapshotted before launch and restored byte-for-byte in the `finally`. The two
clobbered files were repaired by hand to the owner's live app (port 38473,
pid 1528724) and verified by round-tripping `editor/get_project_info` against it.

### 2. The orphan

`child.kill()` kills the `xvfb-run` **wrapper**; the Electron beneath it survived
every run, keeping its port and the discovery file it wrote. Two such orphans
were found and killed by hand. Teardown now snapshots the process tree **before**
the SIGTERM — read after it, the orphans have already reparented to init and are
unfindable — and SIGKILLs the captured list. Verified across every subsequent
run: `SIGKILLed 8 process(es)`, none left behind, discovery files restored.

---

## 7. What is open

- **TAGGED — the Art facet has no priority control.** `ComposerCanvas` arms
  `hf`/`vf` but has nothing for priority, so its stamp can only honestly say
  `keep`. Under the shipped rule `keep` is safe because the priority lens makes
  its failure mode visible — **and the lens is a map-viewport feature; the
  composer canvas does not show it.** Nothing is lost (that is the point of
  `keep`), but an author cannot see or author depth in that facet. Porting
  `TileBrushOptions`' chips + the lens to the composer is the close, and it is
  authoring UI rather than data preservation, so it was not smuggled in here.
- **TAGGED — `test/` is outside `tsconfig`'s `include`.** `npx tsc --noEmit`
  covers `src/**/*` only, so changing `StampSpec.pri`'s type did **not** flag the
  three now-mistyped call sites in `test/art/composer-buffer.test.ts`; they were
  found by reading. There is no `typecheck` npm script at all. A whole tree of
  type-invisible test code is a standing hole, and closing it is its own parcel
  (it will surface unrelated errors).
- **TAGGED — the discovery-file and orphan hazards are fixed in ONE harness.**
  `scratchpad/collision-agent-harness.mjs`, `art-agent-harness.mjs` and every
  other launcher in `scratchpad/` still clobber `~/.aurora/mcp.json` and still
  leak an Electron. `collision-agent-harness.mjs` additionally *reads* the shared
  file with only a method-existence provenance check, which would not distinguish
  the owner's app from its own on a branch where the method exists in both.
- **`applyPaletteLineToWord` open-codes `~0x6000` and `<< 13`.** Correct today
  and it preserves priority, but it is the last place in this file family that
  spells a field position by hand. Not changed under this mandate.
- **No runtime/emulator confirmation was attempted** (standing invariant). Every
  claim here is about bit 15 of a word in the document, read back through the
  app's own accessor — never VRAM, never a screenshot.

---

## 8. Where the ruling met contact

The dispatch's point 2 — *"the flips are NOT a defect, and you must not fix
them"* — **survives, and I would have reached it independently.** A request that
names a tile and no flip has named an unflipped picture; `hf`/`vf` defaulting to
false is the shipped rule, not a violation of it. The queue row saying the agent
path "flattens priority **and flips**" is half wrong, and row `[w5]` plus a node
row now redden if anyone "fixes" it.

Point 1 (tri-state `pri`, omitted = `keep`) and point 3 (route through
`brush-word.ts`, extend it rather than fork it) survive unchanged; point 3 is what
made the third decider cheap to fix once found — `resolveBrushPriority` is the
extension, not a second copy.

The one place the parcel came out **bigger** than scoped is §2 #3. The mandate
said a third decider would be in scope, and there is one.
