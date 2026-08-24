// Wire protocol between the MCP server (main process) and the renderer's
// agent handler. Everything must be structured-clone serializable.

// Type-only imports (erased at compile) so the classic tool payloads reference
// the real core shapes and can never drift from the command signatures they feed.
import type { BlockDef } from '../core/level-classic/model';
import type { S1ObjectEntry } from '../core/formats/classic/s1-objpos';

export const AGENT_REQUEST_CHANNEL = 'agent:request';
export const AGENT_RESPONSE_CHANNEL = 'agent:response';

export interface NametableEntrySpec {
  tile: number;        // tileset index (0..tileset.length-1, <= 0x7FF)
  pal: number;         // palette line 0-3
  pri?: boolean;
  hf?: boolean;
  vf?: boolean;
}

export type AgentRequest =
  | { kind: 'get-project-info' }
  | { kind: 'get-palette' }
  | { kind: 'get-tiles'; start: number; count: number }
  | { kind: 'get-nametable-region'; section: number; x: number; y: number; w: number; h: number }
  | { kind: 'check-budget'; section?: number }
  | { kind: 'set-palette'; line: number; colors: number[] }   // 16 Genesis CRAM words
  | { kind: 'write-tiles'; tiles: number[][]; at?: number }   // each tile: 64 values 0-15
  | { kind: 'paint-region'; section: number; x: number; y: number; w: number; h: number; entries: NametableEntrySpec[] }
  | { kind: 'paint-collision'; section: number; plane: 'a' | 'b'; x: number; y: number; w: number; h: number; word: number }
  | { kind: 'save-chunk'; name: string; w: number; h: number; entries: NametableEntrySpec[]; collisionA?: number[]; collisionB?: number[] }
  | { kind: 'stamp-chunk'; chunkId: string; section: number; x: number; y: number }
  | { kind: 'goto'; section: number; x?: number; y?: number; zoom?: number }
  | { kind: 'get-bg' }
  // layout: the engine's 64x64 nametable (BG_LAYOUT_WORDS words), or the legacy
  // 64x32 shape (BG_LAYOUT_WORDS_LEGACY), which the engine's injector zero-pads
  // rather than refusing. tiles: 64 values 0-15 each, at most BG_TILE_CAPACITY
  // of them, indices local to this blob. The numbers themselves live in
  // core/formats/bg-override/bganim-consumer-contract.json and are read through
  // bg-override.ts — the handler and the MCP schema both derive from there,
  // and this comment deliberately names the constants rather than restating
  // their values (it was "64x32 words" and wrong, ROADMAP item 8).
  // name set: ADD to the BG library under a generated id (reply includes it)
  // instead of replacing the act default.
  | { kind: 'set-bg'; layout: number[]; tiles: number[][]; name?: string }
  | { kind: 'assign-section-bg'; section: number; bgId: string | null }  // null = act default
  | { kind: 'list-bgs' }
  // ---- The effects arc, wave 1 (empyrean AURORA_EFFECTS_SCHEMA.md §2/§3) ----
  // `scene` is deliberately UNTYPED on the wire — a whole scene definition
  // document, validated by the codec (parseEffectsScene) rather than by a shape
  // restated here. Enumerating the fields on this boundary would rebuild exactly
  // the field list core/formats/effects is built around not having, and would let
  // an agent's document silently lose a key the enumeration had not caught up
  // with. null deletes the scene.
  | { kind: 'list-effects-scenes' }
  | { kind: 'get-effects-scene'; id: string }
  | { kind: 'set-effects-scene'; id: string; scene: unknown | null }
  | { kind: 'assign-section-scene'; section: number; sceneId: string | null }  // null = act default
  // ---- Wave-1 surface 4: BgAnim bands (aeon EFFECTS_CONSUMER_CONTRACT §1.1/§1.2) ----
  //
  // PROMOTE IS THE PRIMARY OPERATION, not add. A band's slots are a PREFIX of
  // the tile blob, so adding one GROWS the blob — and the live document ships at
  // its capacity, where every add refuses. Promotion MOVES an existing static
  // range to the front instead, leaving `tiles.length` unchanged, so it is the
  // only door that works on a full document. `add` is kept for documents with
  // free slots and takes `phases` (8 banks of cols*rows tiles of 64 pixels);
  // omitted, the band arrives blank.
  //
  // Each of these is ONE undo step, and each goes through the same command
  // factories the panel's controls do — so the agent path and the human path
  // cannot diverge on a bound, a refusal, or what an undo restores.
  | { kind: 'list-bg-anim-bands' }
  | {
      kind: 'promote-bg-anim-band'; cols: number; rows: number; staticBase: number;
      driver?: string; rateShift?: number;
    }
  | { kind: 'demote-bg-anim-band'; band: number; staticBase?: number }
  | {
      kind: 'add-bg-anim-band'; cols: number; rows: number;
      phases?: number[][][]; driver?: string; rateShift?: number;
    }
  | { kind: 'remove-bg-anim-band'; band: number; blankReferencingCells?: boolean }
  | { kind: 'screenshot'; region?: { x: number; y: number; w: number; h: number }; showBg?: boolean }
  // ---- Classic (Sonic 1 disassembly) project surface (Task 16) ----
  // Thin wrappers over the classic open bridge + the Task-12 editing commands;
  // every mutation is one classic undo step. Batched shapes (arrays where the
  // commands take arrays) so an agent never loops single-cell calls.
  | { kind: 'classic-open-project'; dir: string }
  | { kind: 'classic-get-project-report' }
  | { kind: 'classic-list-levels' }
  | { kind: 'classic-get-level'; zone: string; act: number }
  | { kind: 'classic-set-layout-region'; plane: 'fg' | 'bg'; x: number; y: number; chunkIds: number[][] }
  | { kind: 'classic-edit-chunk'; chunkId: number; cells: { index: number; word: number }[] }
  | { kind: 'classic-edit-block'; blockId: number; def: BlockDef }
  | { kind: 'classic-add-chunk'; cells?: { index: number; word: number }[] }
  | { kind: 'classic-add-block'; def?: BlockDef }
  | { kind: 'classic-place-object'; entry: S1ObjectEntry }
  | { kind: 'classic-move-object'; index: number; x: number; y: number }
  | { kind: 'classic-delete-object'; index: number }
  | { kind: 'classic-set-colind'; entries: { blockId: number; value: number }[] }
  // Classic's collision-authoring tool, in the FACET's coordinates — a rectangle
  // of 16px FG CELLS. It sets the SHAPE on the BLOCK under each cell and never
  // touches solidity, which rides the chunk cell and stays `classic-edit-chunk`.
  //
  // NOT `paint-collision`: that kind is aeon's and means something else (a
  // collision-plane cell word including solidity, on a per-section plane).
  | { kind: 'classic-set-block-collision'; x: number; y: number; w: number; h: number;
      shape: number; mode?: 'link' | 'isolate'; dryRun?: boolean }
  | { kind: 'classic-set-palette'; line: number; colors: number[] }
  | { kind: 'classic-set-start'; x: number; y: number }
  | { kind: 'classic-save-project' }
  // ---- The art line (spec 2026-08-18) ----
  // Two pixel sources, one commit. `collision` stays a BOOLEAN on the wire: an
  // agent should not have to know the zone's colind table length to ask for
  // flat collision — the handler sources that from the open act (see
  // commitPixels, which turns the flag into { colindLength }).
  // ---- The playtest loop (§4.8) --------------------------------------------
  | { kind: 'aether-status' }
  | { kind: 'aether-connect'; connect?: boolean }
  | { kind: 'aether-push-palette'; line: number }
  | { kind: 'aether-warp'; x: number; y: number }
  | { kind: 'aether-build-run' }
  | { kind: 'classic-commit-canvas'; name: string; targets?: { chunkFileIndex: number | null }[];
      paletteResolution?: 'none' | 'use-act-colours' | 'adopt-into-zone';
      collision?: boolean; dryRun?: boolean }
  // NO `paletteResolution` on the import: an imported sheet is mapped against
  // the act's own palette by `sheetFromBytes`, using the planner's OWN
  // `flattenDocPalette` (sheet-import.ts re-exports it as `flattenActPalette`
  // rather than keeping a second copy), so its palette cannot drift from what
  // the planner compares it to, so the option is only ever read on a branch this
  // tool cannot reach. A knob that provably cannot turn is worse than no knob — doubly so
  // here, where the colour refusal's advice mentions widening the palette and
  // this would look like the lever for it.
  | { kind: 'classic-import-art-sheet'; path: string; targets?: { chunkFileIndex: number | null }[];
      collision?: boolean; dryRun?: boolean };

export interface AgentRequestEnvelope {
  id: number;
  payload: AgentRequest;
}

export interface AgentResponseEnvelope {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}
