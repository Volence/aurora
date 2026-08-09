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
  // 64x32 words; tiles: 64 values 0-15 each, indices local to this blob.
  // name set: ADD to the BG library under a generated id (reply includes it)
  // instead of replacing the act default.
  | { kind: 'set-bg'; layout: number[]; tiles: number[][]; name?: string }
  | { kind: 'assign-section-bg'; section: number; bgId: string | null }  // null = act default
  | { kind: 'list-bgs' }
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
  | { kind: 'classic-place-object'; entry: S1ObjectEntry }
  | { kind: 'classic-move-object'; index: number; x: number; y: number }
  | { kind: 'classic-delete-object'; index: number }
  | { kind: 'classic-set-colind'; entries: { blockId: number; value: number }[] }
  | { kind: 'classic-save-project' };

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
