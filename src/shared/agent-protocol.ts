// Wire protocol between the MCP server (main process) and the renderer's
// agent handler. Everything must be structured-clone serializable.

export const AGENT_REQUEST_CHANNEL = 'agent:request';
export const AGENT_RESPONSE_CHANNEL = 'agent:response';

export interface NametableEntrySpec {
  tile: number;        // tileset index (0..tileset.length-1, <= 0x7FF)
  pal: number;         // palette line 0-3
  pri?: boolean;
  hf?: boolean;
  vf?: boolean;
  coll?: number;       // collision type 0-255; omitted = keep existing
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
  | { kind: 'save-chunk'; name: string; w: number; h: number; entries: NametableEntrySpec[] }
  | { kind: 'stamp-chunk'; chunkId: string; section: number; x: number; y: number }
  | { kind: 'goto'; section: number; x?: number; y?: number; zoom?: number }
  | { kind: 'get-bg' }
  | { kind: 'set-bg'; layout: number[]; tiles: number[][] }  // 64x32 words; tiles: 64 values 0-15 each, indices local to this blob
  | { kind: 'screenshot'; region?: { x: number; y: number; w: number; h: number }; showBg?: boolean };

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
