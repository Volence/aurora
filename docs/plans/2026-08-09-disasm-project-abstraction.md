# Disassembly-as-Project (S1 in-place editing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open `/home/volence/sonic_hacks/s1disasm/` as a recognized project and edit levels, object art, and object placement in place, writing S1's native formats back so `build.lua` produces the modified ROM; prove the engine-agnostic `ProjectAdapter` abstraction by migrating aeon behind it.

**Architecture:** New `core/project/` adapter layer (fingerprint detect → bundled profile → loud resolution report → domain accessors); classic levels edit as a hierarchical `LevelDoc` (tiles→blocks→chunks→layout, never flattened) in a new store on the shared undo history; pure codecs in `core/formats/classic/`. Spec: `docs/specs/2026-08-09-disasm-project-abstraction-design.md` — read it first, every task.

**Tech Stack:** TypeScript, Electron (electron-vite), zustand-style stores in `src/renderer/state/`, vitest (`npm test -- <path>` runs `vitest run`), existing codecs `src/core/compress/nemesis.ts` (decompress+compress), `src/core/formats/kosinski.ts` (decompress+compress). Format reference of record: `programs/SonLVL/SonLVLAPI/` (C#) — port semantics, never guess.

**Ground rules for every task:**
- TDD: failing test → minimal code → green → commit. Run `npx tsc --noEmit` before every commit.
- Core code (`src/core/**`) is pure — no `fs`, no Electron imports; IO stays in main-process modules / stores.
- Real-file goldens read from `/home/volence/sonic_hacks/s1disasm/` and must `describe.skipIf(!fs.existsSync(S1DIR))` so CI without the disasm still passes. Put the shared constant in the test file: `const S1DIR = '/home/volence/sonic_hacks/s1disasm'`.
- Commits: conventional prefixes, no Co-Authored-By trailer.
- Match neighboring code style; follow `EDITOR_METHODS` / command patterns in `src/renderer/state/editorStore.ts` and `src/renderer/agent/agent-handler.ts` for undo + MCP parity.

---

## Milestone 1 — Codecs

### Task 1: Enigma codec (decode + encode)

**Files:**
- Create: `src/core/formats/classic/enigma.ts`
- Test: `src/core/formats/classic/__tests__/enigma.test.ts`

The only missing compression format. Port from SonLVLAPI's Enigma implementation (find it: `grep -rn "class Enigma" /home/volence/sonic_hacks/programs/SonLVL/` — it decodes header {inline bit width, flag bits present, incremental word, literal word} then a bitstream of five packet types). Exports:

```ts
export function enigmaDecompress(input: Uint8Array): Uint8Array; // big-endian words out
export function enigmaCompress(input: Uint8Array): Uint8Array;   // input.length must be even
```

Encoder may be simple/suboptimal (e.g. mostly inline-copy packets) — correctness gate is decode(encode(x)) == x, not matching original compressor bytes.

- [ ] **Step 1: Write failing tests** — (a) round-trip property on random even-length buffers (seeded PRNG, no Math.random in prod code paths); (b) golden: `enigmaDecompress(fs.readFileSync(S1DIR + '/map16/GHZ.eni'))` returns length divisible by 8 (4 words/block × 2 bytes) and > 0; (c) re-encode golden: `enigmaDecompress(enigmaCompress(decoded))` equals decoded byte-for-byte, for every `map16/*.eni`.
- [ ] **Step 2: Run tests, verify FAIL** — `npm test -- src/core/formats/classic/__tests__/enigma.test.ts` (module not found).
- [ ] **Step 3: Implement decode (port SonLVLAPI), run — golden decode passes.**
- [ ] **Step 4: Implement encode, run — all pass.**
- [ ] **Step 5: `npx tsc --noEmit`; commit** `feat(classic): enigma codec with round-trip + s1disasm goldens`.

### Task 2: Existing compressor goldens vs s1disasm

**Files:**
- Test: `src/core/formats/classic/__tests__/s1-compression-goldens.test.ts`

Prove the compressors we already own survive real S1 data before anything is built on them.

- [ ] **Step 1: Write tests:** for every `map256/*.kos`: `kosinskiDecompress` succeeds, length divisible by 512 (16×16 block words × 2), and `kosinskiDecompress(kosinskiCompress(d))` equals `d`. For every `artnem/8x8 - *.nem`: `nemesisDecompress` succeeds, length divisible by 32, and round-trips through `nemesisCompress`.
- [ ] **Step 2: Run; fix any codec bug uncovered (report it in the commit message).**
- [ ] **Step 3: Commit** `test(classic): kosinski/nemesis goldens over real s1disasm data`.

### Task 3: S1 plain-binary codecs

**Files:**
- Create: `src/core/formats/classic/s1-layout.ts`, `s1-objpos.ts`, `s1-startpos.ts`, `s1-colind.ts`, `s1-collision-shapes.ts`
- Test: `src/core/formats/classic/__tests__/s1-binary.test.ts`

Formats (verify each against SonLVLAPI's S1 engine reader before implementing; if it disagrees with this table, SonLVLAPI wins — note the correction in the commit):

```ts
// s1-layout.ts — byte0 = width-1, byte1 = height-1, then height rows of width chunk-id bytes
export interface S1Layout { width: number; height: number; cells: Uint8Array }
export function decodeS1Layout(b: Uint8Array): S1Layout;
export function encodeS1Layout(l: S1Layout): Uint8Array;

// s1-objpos.ts — 6 bytes/entry: xWord, yWord (flag bits in high nibble; port exact masks
// from SonLVLAPI S1ObjectEntry), idByte (bit7 = respawn-tracked), subtypeByte; $FFFF terminator.
export interface S1ObjectEntry { x: number; y: number; xflip: boolean; yflip: boolean; respawn: boolean; id: number; subtype: number }
export function decodeS1Objpos(b: Uint8Array): S1ObjectEntry[];
export function encodeS1Objpos(e: S1ObjectEntry[], originalLength?: number): Uint8Array; // pad to originalLength with $FF for byte-identical zero-edit round-trip

// s1-startpos.ts — { x: number; y: number } single entry, two big-endian words
// s1-colind.ts — thin typed wrapper: Uint8Array in/out (block id → shape index)
// s1-collision-shapes.ts — READ ONLY: parse Collision Array (Normal).bin (256 shapes × 16
// column-height bytes) + Angle Map.bin (256 bytes) into { heights: Int8Array[256][16]... }
// exact layout per SonLVLAPI; used solely for the collision overlay renderer.
```

- [ ] **Step 1: Failing tests:** decode every `levels/*.bin` (dims ≤ 64×8? — BG files may differ; assert cells.length === width*height and full-file consumption), every `objpos/*.bin`, every `startpos/*.bin` top-level file; **byte-identical** re-encode for all three classes (`encode(decode(b))` equals `b` exactly — this is the plan's key fidelity gate).
- [ ] **Step 2: Run FAIL → implement → green.**
- [ ] **Step 3: tsc; commit** `feat(classic): s1 layout/objpos/startpos/colind/collision-shape codecs, byte-identical goldens`.

---

## Milestone 2 — Project layer

### Task 4: ProjectAdapter core + registry

**Files:**
- Create: `src/core/project/adapter.ts`, `src/core/project/report.ts`
- Test: `src/core/project/__tests__/adapter.test.ts`

```ts
// report.ts
export type EntryStatus = 'resolved' | 'missing' | 'ambiguous';
export interface ResolutionEntry { key: string; path: string; status: EntryStatus; detail?: string }
export interface ResolutionReport { entries: ResolutionEntry[]; resolved: number; total: number }

// adapter.ts — note: detect/open take a FileAccess so core stays fs-free
export interface FileAccess { exists(rel: string): Promise<boolean>; read(rel: string): Promise<Uint8Array>; list(relDir: string): Promise<string[]> }
export type ProjectType = 'aeon' | 's1';
export interface ProjectMatch { type: ProjectType; label: string }
export interface ProjectAdapter { readonly type: ProjectType; detect(fa: FileAccess): Promise<ProjectMatch | null>; open(fa: FileAccess, overrides?: ProjectOverrides): Promise<ProjectHandle> }
export interface CapabilityManifest { levels: 'chunk-hierarchy' | 'aeon' | null; sprites: boolean; objects: 'objpos' | 'json' | null; build: false }
export interface ProjectHandle { type: ProjectType; capabilities: CapabilityManifest; report: ResolutionReport; levels: ClassicLevelAccess | null }
export interface ProjectOverrides { paths?: Record<string, string> }   // sidecar .aurora/project.json shape
export function registerAdapter(a: ProjectAdapter): void;
export async function detectProject(fa: FileAccess): Promise<ProjectMatch | null>; // first match wins; fingerprints are disjoint
```

(`ClassicLevelAccess` is defined in Task 7; declare the interface name here with `list/read/write` members so both tasks compile — copy the signature block from Task 7.)

- [ ] **Step 1: Failing tests with an in-memory FileAccess fake:** registry returns null on empty dir; a stub adapter with fingerprint file `sonic.asm` detects only when present; report counts resolved/missing.
- [ ] **Step 2: Implement → green → tsc → commit** `feat(project): engine-agnostic ProjectAdapter registry + resolution report`.

### Task 5: S1 profile + S1ProjectAdapter.open

**Files:**
- Create: `src/core/project/profiles/s1.ts` (pure data), `src/core/project/s1/index.ts`
- Test: `src/core/project/__tests__/s1-adapter.test.ts`

Profile: zone table (GHZ/LZ/MZ/SLZ/SYZ/SBZ; LZ4 = SBZ3; act file stems `ghz1..3` etc.), per-zone entries derived from the SonLVL.rev01.ini ground truth in the spec §1 table: tiles (GHZ = two .nem files concatenated after decode), blocks, chunks, fgLayout per act, bgLayout per zone (REV01 variant preferred when both exist on disk, e.g. `syzbg (REV01).bin`), objpos per act (REV01 preferred), startpos, palette composition (each zone: `palette/Sonic.bin` line 0 + `palette/{Zone Name}.bin` lines 1–3; LZ/SBZ have act-variant palettes — encode exactly what the INI lists, read it at `"$S1DIR/Utility Project Files/SonLVL INI Files/SonLVL.rev01.ini"` while writing the profile, then hardcode), colind, animated art (artunc entries with VRAM slot offsets from the INI `animtilesN=file:offsetIdx:vramAddr:count` lines — store file, byteOffset, vramTileIndex, tileCount).

Fingerprint: `sonic.asm` ∧ `artnem/` ∧ `map256/` ∧ `levels/` all exist. Sidecar: read `.aurora/project.json` if present; `overrides.paths[key]` replaces a profile entry's path.

- [ ] **Step 1: Failing tests:** fake FileAccess mirroring stock layout → detect matches, open resolves all entries; delete one file from the fake → report shows it missing and the owning act flagged unavailable, open still succeeds; override redirects a path. Golden (skipIf): real s1disasm resolves 100% of profile entries — enumerate any misses in the assertion message.
- [ ] **Step 2: Implement → green → tsc → commit** `feat(project): bundled s1disasm profile + adapter open with loud resolution`.

---

## Milestone 3 — LevelDoc

### Task 6: LevelDoc model + invariants

**Files:**
- Create: `src/core/level-classic/model.ts`
- Test: `src/core/level-classic/__tests__/model.test.ts`

Types exactly as spec §2.2 (`LevelDoc`, `BlockDef`, `ChunkDef256` with 256 cells of `{block, xf, yf, solidity}`, `LayoutGrid`, `S1ObjectEntry` re-exported from the codec). Plus `validateLevelDoc(doc): string[]` returning human-readable violations of the §2.2 hard-limit list (layout ≤64×8, chunk id ≤ $FF, block id ≤ $3FF, cell/word ranges). Include word pack/unpack helpers: block cell word = `pri<<15 | pal<<13 | yf<<12 | xf<<11 | tile(11b)`; chunk cell word = `solidity<<14? — verify bit layout in SonLVLAPI S1 chunk reader and document it in the code`.

- [ ] Failing tests for pack/unpack round-trip + validator catches each limit → implement → commit `feat(classic): LevelDoc model + validation`.

### Task 7: s1-io read/write (files ⇄ LevelDoc)

**Files:**
- Create: `src/core/level-classic/s1-io.ts`
- Modify: `src/core/project/s1/index.ts` (wire `levels` accessor)
- Test: `src/core/level-classic/__tests__/s1-io.test.ts`

```ts
export interface ClassicLevelAccess {
  list(): ZoneActRef[];                          // {zone: 'GHZ', act: 1, label, available, reason?}
  read(ref: ZoneActRef): Promise<LevelDoc>;
  write(ref: ZoneActRef, doc: LevelDoc, dirty: DirtyDomains): Promise<WriteResult>;
}
export type DirtyDomains = Partial<Record<'tiles'|'blocks'|'chunks'|'fg'|'bg'|'objects'|'palette'|'colind'|'start', boolean>>;
export interface WriteResult { written: string[]; skipped: string[]; errors: {path: string; message: string}[] }
```

read(): decode per profile (concat GHZ tile files after nemesis decode; blit artunc animated art into `tiles` at `vramTileIndex*32`; compose palettes per rule; parse chunks into ChunkDef256). write(): encode only dirty domains; **self-check gate** — re-decode every encoded buffer and deep-compare against the source structure before returning it as writable; a mismatch goes in `errors` and the file is withheld. (Actual fs write + atomicity is Task 10, main process.)

- [ ] **Step 1: Failing tests:** GHZ1 golden (skipIf): read → tiles.length ≥ profile-declared count, fg dims match `levels/ghz1.bin` header, objects.length > 0, palette line 0 row 0 came from Sonic.bin. **Zero-edit round-trip over ALL acts of ALL six zones:** read → write(all-dirty) → uncompressed outputs byte-identical to disk originals; compressed outputs decompressed-identical. Self-check test: corrupt one encoded structure via a stubbed encoder → write withholds that file with an error.
- [ ] **Step 2: Implement → green → tsc → commit** `feat(classic): s1 level io with zero-edit round-trip goldens across all zones`.

### Task 8: Chunk prerender

**Files:**
- Create: `src/core/level-classic/render.ts`
- Test: `src/core/level-classic/__tests__/render.test.ts`

`renderChunk(doc, chunkId): Uint8ClampedArray` (256×256 RGBA) resolving chunk→block→tile with flips/palette/priority, transparent color-0. Follow the existing tileset-prerender implementation style (find it via `grep -rn "prerender" src/core src/renderer` and reuse its tile-blit helper if importable). Test: hand-built 2-tile doc renders expected pixels (assert specific pixel coordinates, all four flip combos).

- [ ] Failing test → implement → commit `feat(classic): chunk prerender`.

---

## Milestone 4 — UI read-only

### Task 9: classicProjectStore + open flow + report UI

**Files:**
- Create: `src/renderer/state/classicProjectStore.ts`
- Modify: main-process file IPC (find the existing project-open IPC in `src/main/` via `grep -rn "openProject\|dialog" src/main`), `src/renderer/shell/` open-menu wiring
- Test: `src/renderer/state/__tests__/classicProjectStore.test.ts`

File → Open Directory: main process supplies a real `FileAccess` rooted at the chosen dir → `detectProject` → aeon type keeps today's path untouched; s1 type populates `classicProjectStore` {handle, report, zoneTree}. Report UI: status-bar summary line ("70/70 level files resolved", warning color when <100%) opening a detail panel listing per-entry status. No behavior change for aeon opens (guard with existing tests).

- [ ] Store tests with fake handle → implement store → wire IPC + menu → manual smoke: `npm run dev`, open s1disasm, see zone tree + report. Commit `feat(ui): open-directory project detection + s1 project store + resolution report`.

### Task 10: Save IPC (atomic, mtime-guarded)

**Files:**
- Create: main-process save handler alongside the open IPC (same file/module pattern)
- Test: main-side test if the pattern exists; otherwise cover the pure guard logic in `src/core/project/save-guard.ts` + test

Behavior: for each `WriteResult.written` buffer: refuse if on-disk mtime ≠ mtime captured at open/last save (collect conflicts, write nothing on conflict — dialog lists files); else write tmp file in same dir + rename. Return per-file results to renderer.

- [ ] Guard-logic tests (fake mtimes) → implement → commit `feat(ipc): atomic mtime-guarded classic project save`.

### Task 11: ClassicLevelViewport read-only + zone/act tree + overlays

**Files:**
- Create: `src/renderer/components/classic/ClassicLevelViewport.tsx`, `ZoneActTree.tsx`
- Modify: `App.tsx` / shell mode wiring (classic project ⇒ Levels mode shows these instead of aeon map)
- Test: render-logic helpers only (viewport math), not DOM

Left dock: zone/act tree (zones expandable, unavailable acts greyed with reason tooltip). Viewport: chunk-grid canvas from Task 8 prerenders, FG/BG plane toggle, zoom/pan reusing the map-mode camera hook (find via `grep -rn "useViewportCamera\|camera" src/renderer/hooks`). Overlays (toggleable buttons matching map-mode overlay UI): collision (block→colind→shape height columns, reuse collision drawing helpers from the existing collision renderer), objects (marker + real frame via S1 sprite adapter where it resolves; obj $25 expands its ring row for display per spacing subtype — port count/spacing from SonLVLAPI ring def), start position marker.

- [ ] Implement → manual smoke on GHZ1/MZ1/SBZ1 vs SonLVL screenshots → commit `feat(ui): classic level viewport, zone tree, collision/object overlays`. **Take a screenshot for the morning report.**

---

## Milestone 5 — Editing + save

### Task 12: Classic editing commands on shared undo

**Files:**
- Create: `src/renderer/state/classicLevelStore.ts`
- Test: `src/renderer/state/__tests__/classicLevelStore.test.ts`

Commands (each = one undo step, follow editorStore command registration pattern exactly): `classic:set-layout-cells {plane, cells: {x,y,chunkId}[]}`, `classic:edit-chunk-cells {chunkId, cells: {index, word}[]}`, `classic:edit-block {blockId, def}`, `classic:edit-tiles {tileIndex, data}[]`, `classic:set-palette {line, colors}`, `classic:set-colind {blockId, value}[]`, `classic:set-objects {objects: S1ObjectEntry[]}` (whole-list replace — matches gesture granularity), `classic:set-start {x,y}`. Each command: validates via `validateLevelDoc` limits before applying (reject with message, no partial apply), marks its dirty domain, invalidates affected prerenders.

- [ ] Failing tests per command: apply → state + dirty flag; undo → exact prior state; validation rejection leaves state untouched. Implement → commit `feat(classic): editing commands with undo + dirty tracking`.

### Task 13: Editing UI — chunk picker, stamp tool, composer wiring, save

**Files:**
- Create: `src/renderer/components/classic/ChunkPicker.tsx`
- Modify: `ClassicLevelViewport.tsx` (stamp + select tools), Art-mode composer surfaces (wire chunk/block/tile editing to classic commands when a classic project is active — locate the chunk composer component via `grep -rn "composer" src/renderer/components`), save menu → Task 10 IPC
- Test: none beyond store tests (GUI); keep logic in store/commands

Bottom dock chunk picker (prerendered thumbnails, current selection); click-drag stamps layout cells (one undo step per drag gesture); right-click eyedrops chunk under cursor. Save (Ctrl+S) runs write → IPC → toast with written/conflict summary. Palette editing reuses the existing palette editor bound to `classic:set-palette`.

- [ ] Implement → **end-to-end gate:** edit GHZ1 layout, save, `cd /home/volence/sonic_hacks/s1disasm && lua build.lua` (or `build.bat` equivalent — use whichever runs on this machine; check README.md there), confirm ROM builds; boot in BlastEm (`emulators/blastem64-0.6.2/`) and screenshot the edit in-game. Commit `feat(classic): layout stamping, composer wiring, save-back — s1 ROM round-trip verified`.

---

## Milestone 6 — Objects + sprites + MCP

### Task 14: Object placement editing + library panel

**Files:**
- Create: `src/renderer/components/classic/ObjectLibraryPanel.tsx`, `src/core/project/profiles/s1-objects.ts` (id → name table; seed from `_ObjDef/obj.ini` names read once at authoring time, hardcode like the profile)
- Modify: `ClassicLevelViewport.tsx`, inspector dock
- Test: extend classicLevelStore tests for placement gestures (each gesture = one `classic:set-objects`)

Select/move (drag)/delete (Del)/place (drag from library). Inspector: id (dropdown w/ names), subtype (hex byte), xflip/yflip/respawn checkboxes, x/y numeric. Deliberately mirrors the P1 aeon entity-placement interaction vocabulary (spec §2.4).

- [ ] Implement → commit `feat(classic): object placement editing + s1 object library`.

### Task 15: Object art save-back

**Files:**
- Modify: sprite-mode save path (find S1 adapter write hook in `src/core/formats/sprite-format-adapter.ts` + `games/s1.ts`), main save IPC reuse
- Test: `src/core/formats/games/__tests__/s1-art-write.test.ts`

Edited object art frames → re-encode with `nemesisCompress` → write to the object's `artnem/*.nem` through the Task 10 guarded IPC. Round-trip test: decode `artnem/Signpost.nem`-like file (pick any real one) → re-encode → decompressed-identical. Mappings stay read-only: sprite mode shows a non-blocking "S1 mappings are read-only" notice where edit affordances would apply (match existing notice/toast styling).

- [ ] Implement → commit `feat(sprites): s1 object art nemesis save-back; mappings read-only notice`.

### Task 16: MCP tools

**Files:**
- Modify: `src/renderer/agent/agent-handler.ts` + the `EDITOR_METHODS` descriptor module it uses, `docs/MCP.md`
- Test: extend the existing agent-handler test pattern

Tools (thin wrappers over existing commands/stores — no new logic): `open_project {dir}`, `get_project_report`, `list_classic_levels`, `get_classic_level {zone, act}`, `set_layout_region {plane, x, y, chunkIds[][]}`, `edit_chunk {chunkId, cells}`, `edit_block {blockId, def}`, `place_object {entry}`, `move_object {index, x, y}`, `delete_object {index}`, `set_colind {entries}`, `save_project`.

- [ ] Tests per tool (happy + validation-rejection) → implement → update MCP.md table → commit `feat(mcp): classic project tools`.

---

## Milestone 7 — Prove the abstraction

### Task 17: Aeon behind ProjectAdapter

**Files:**
- Create: `src/core/project/aeon/index.ts`
- Modify: open flow from Task 9 (aeon branch now goes through `detectProject` too)
- Test: adapter detect/open tests with fake aeon tree; **full existing suite is the real gate**

`AeonProjectAdapter`: detect = aurora-schema `project.json`; open = wrap the existing s4 load path (call it, don't rewrite it), capabilities `{levels:'aeon', sprites:true, objects:'json', build:false}`, report from the existing load results. Zero behavior change: every pre-existing test stays green; manual open of the aeon project looks identical.

- [ ] Implement → `npm test` full suite → manual aeon open smoke → commit `refactor(project): aeon open path behind ProjectAdapter — zero behavior change`.

### Task 18: Docs + final sweep

**Files:**
- Modify: `docs/ROADMAP.md` (add this work as an active phase; note it pulls P8 Phase A/D forward and shares P1's placement vocabulary), `docs/MCP.md` (verify tool table), `docs/ART_SUITE.md` if it lists modes
- [ ] Full `npm test` + `npx tsc --noEmit` + `npm run build`; fix anything red.
- [ ] Commit `docs: roadmap + MCP entries for disasm-as-project phase`.

---

## Self-review notes (done at authoring)

- Spec coverage: §2.1→Tasks 4–5,9; §2.2→6,12; §2.3→1–3; §2.4→14–15; §2.5→16; §2.6→5,7,10; §2.7→17; M-gates §3→per-task gates; acceptance §4→Tasks 7 (goldens), 13 (ROM boot), 16 (MCP), 18 (docs). REV01 preference: Task 5. Sidecar: Task 5. Ring display expansion: Task 11.
- Deliberate deviations from skill defaults: UI tasks (11, 13, 14) carry behavioral checklists instead of literal component code — component code must follow Aurora's live patterns, which the worker reads in-repo; all logic that can be unit-tested is pushed into stores/core where tests are specified concretely.
- Two format details are flagged as verify-against-SonLVLAPI (objpos flag masks, chunk-word bit layout) rather than asserted — byte-identical round-trip goldens make any wrong guess fail loudly in Task 3/7.
