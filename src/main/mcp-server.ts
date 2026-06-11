import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';
import { app as electronApp } from 'electron';
import type { BrowserWindow } from 'electron';
import { createServer } from 'http';
import type { Server } from 'http';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { requestAgent } from './agent-bridge';
import type { AgentRequest } from '../shared/agent-protocol';

const DEFAULT_PORT = 38473;

const entrySchema = z.object({
  tile: z.number().int().describe('tileset tile index'),
  pal: z.number().int().min(0).max(3).describe('palette line 0-3'),
  pri: z.boolean().optional().describe('VDP priority bit'),
  hf: z.boolean().optional().describe('horizontal flip'),
  vf: z.boolean().optional().describe('vertical flip'),
  coll: z.number().int().min(0).max(255).optional().describe('collision type; omit to keep existing'),
});

function buildServer(getWindow: () => BrowserWindow | null): McpServer {
  const server = new McpServer({ name: 'sonic-level-editor', version: '0.1.0' });

  const forward = async (payload: AgentRequest) => {
    const win = getWindow();
    if (!win) throw new Error('editor not ready (no window)');
    return requestAgent(win, payload);
  };

  const textResult = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  });

  server.registerTool('get_project_info',
    { description: 'Project, zone, act grid, sections, tileset size, chunk library, active section.' },
    async () => textResult(await forward({ kind: 'get-project-info' })));

  server.registerTool('get_palette',
    { description: 'The active 4x16 palette as RGB per line plus Genesis CRAM words (0000BBB0GGG0RRR0, ready to pass back to set_palette). Line 0 is sprite-reserved; index 0 of each line is transparent.' },
    async () => textResult(await forward({ kind: 'get-palette' })));

  server.registerTool('get_tiles',
    {
      description: 'Read raw 8x8 tiles as 64 palette indices each (max 256 per call).',
      inputSchema: { start: z.number().int().min(0), count: z.number().int().min(1).max(256) },
    },
    async ({ start, count }) => textResult(await forward({ kind: 'get-tiles', start, count })));

  server.registerTool('get_nametable_region',
    {
      description: 'Decoded nametable entries (tileIndex, palette, flips, priority, collision) for a tile-coordinate rectangle of a section.',
      inputSchema: {
        section: z.number().int().min(0), x: z.number().int().min(0), y: z.number().int().min(0),
        w: z.number().int().min(1).max(64), h: z.number().int().min(1).max(64),
      },
    },
    async (args) => textResult(await forward({ kind: 'get-nametable-region', ...args })));

  server.registerTool('check_budget',
    {
      description: 'Flip-aware unique-tile counts per section and per VRAM color group vs the 1024-tile FG pool. fits=false means export will fail.',
      inputSchema: { section: z.number().int().min(0).optional() },
    },
    async ({ section }) => textResult(await forward({ kind: 'check-budget', section })));

  server.registerTool('set_palette',
    {
      description: 'Write one palette line (1-3) as 16 Genesis CRAM words (0000BBB0GGG0RRR0, even channel values only). One undo step.',
      inputSchema: { line: z.number().int().min(1).max(3), colors: z.array(z.number().int()).length(16) },
    },
    async ({ line, colors }) => textResult(await forward({ kind: 'set-palette', line, colors })));

  server.registerTool('write_tiles',
    {
      description: 'Append or overwrite tileset tiles. Each tile is 64 pixel values 0-15 (index 0 = transparent). Omit "at" to append. One undo step. Reply flags tiles that duplicate an existing tile or its flip (reuse that index instead).',
      inputSchema: {
        tiles: z.array(z.array(z.number().int().min(0).max(15)).length(64)).min(1).max(128),
        at: z.number().int().min(0).optional(),
      },
    },
    async ({ tiles, at }) => textResult(await forward({ kind: 'write-tiles', tiles, at })));

  server.registerTool('paint_region',
    {
      description: 'Paint a w*h tile rectangle of a section with nametable entries (row-major). One undo step. Reply includes updated VRAM budget.',
      inputSchema: {
        section: z.number().int().min(0),
        x: z.number().int().min(0), y: z.number().int().min(0),
        w: z.number().int().min(1), h: z.number().int().min(1),
        entries: z.array(entrySchema),
      },
    },
    async (args) => textResult(await forward({ kind: 'paint-region', ...args })));

  server.registerTool('save_chunk',
    {
      description: 'Save a reusable w*h pattern into the chunk library (row-major entries). Returns the chunk id.',
      inputSchema: {
        name: z.string().min(1),
        w: z.number().int().min(1).max(64), h: z.number().int().min(1).max(64),
        entries: z.array(entrySchema),
      },
    },
    async (args) => textResult(await forward({ kind: 'save-chunk', ...args })));

  server.registerTool('stamp_chunk',
    {
      description: 'Stamp a library chunk onto a section at tile coordinates. One undo step.',
      inputSchema: {
        chunkId: z.string(), section: z.number().int().min(0),
        x: z.number().int().min(0), y: z.number().int().min(0),
      },
    },
    async (args) => textResult(await forward({ kind: 'stamp-chunk', ...args })));

  server.registerTool('goto',
    {
      description: 'Set the active section and scroll the shared viewport to tile coords (x,y) at optional zoom (0.125-8).',
      inputSchema: {
        section: z.number().int().min(0),
        x: z.number().int().min(0).optional(), y: z.number().int().min(0).optional(),
        zoom: z.number().min(0.125).max(8).optional(),
      },
    },
    async (args) => textResult(await forward({ kind: 'goto', ...args })));

  server.registerTool('get_bg',
    { description: 'Read the zone-wide background (Plane B): a 64x32 tile nametable plus its own tile blob (max 512 tiles) — a SEPARATE tile space from the FG tileset (loaded at VRAM slot 1024+). Nametable tile indices are local to the BG blob, not the zone tileset; both get_bg and set_bg use this local convention (engine VRAM-absolute files are normalized at load), so a get_bg result can be fed straight back to set_bg. Returns layout (2048 nametable words, row-major) and tiles (64 pixel values each), or nulls when the act has no background. Note: the editor renders Plane B once at world origin (512x256 px), so screenshots away from the origin will not show it.' },
    async () => textResult(await forward({ kind: 'get-bg' })));

  server.registerTool('set_bg',
    {
      description: 'Replace the zone-wide background (Plane B) wholesale: a 64x32 tile nametable (2048 row-major words) plus its tile blob (max 512 tiles of 64 pixel values 0-15). The BG is a SEPARATE 512-tile space from the FG tileset; nametable tile indices are local to the BG blob (index < tiles.length). Words use the VDP format (pal bits 13-14, vf bit 12, hf bit 11, tile bits 0-10). One undo step.',
      inputSchema: {
        layout: z.array(z.number().int().min(0).max(0xFFFF)).length(2048),
        tiles: z.array(z.array(z.number().int().min(0).max(15)).length(64)).min(1).max(512),
      },
    },
    async ({ layout, tiles }) => textResult(await forward({ kind: 'set-bg', layout, tiles })));

  server.registerTool('screenshot',
    {
      description: 'PNG of the map canvas (current viewport). Optional region crop in canvas pixels. Region coordinates are in canvas device pixels (the on-screen viewport canvas), not tile or world coordinates.',
      inputSchema: {
        region: z.object({
          x: z.number().int().min(0), y: z.number().int().min(0),
          w: z.number().int().min(1), h: z.number().int().min(1),
        }).optional(),
        showBg: z.boolean().optional().describe('render the background plane during capture'),
      },
    },
    async ({ region, showBg }) => {
      const result = await forward({ kind: 'screenshot', region, showBg }) as { pngBase64: string };
      return { content: [{ type: 'image' as const, data: result.pngBase64, mimeType: 'image/png' }] };
    });

  return server;
}

let httpServer: Server | null = null;
let discoveryPath: string | null = null;

export async function startMcpServer(getWindow: () => BrowserWindow | null): Promise<void> {
  const exp = express();
  exp.use(express.json({ limit: '16mb' }));

  // Stateless Streamable HTTP: fresh server+transport per POST (SDK-documented pattern)
  exp.post('/mcp', async (req, res) => {
    try {
      const server = buildServer(getWindow);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request failed:', err);
      if (!res.headersSent) res.status(500).json({ error: 'internal error' });
    }
  });
  exp.get('/mcp', (_req, res) => { res.status(405).end(); });
  exp.delete('/mcp', (_req, res) => { res.status(405).end(); });

  const listen = (port: number) => new Promise<number>((resolve, reject) => {
    const srv = createServer(exp);
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => {
      httpServer = srv;
      const addr = srv.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });

  let port: number;
  try {
    port = await listen(DEFAULT_PORT);
  } catch {
    port = await listen(0); // fallback to an ephemeral port
  }

  const dir = join(electronApp.getPath('home'), '.sonic-level-editor');
  mkdirSync(dir, { recursive: true });
  discoveryPath = join(dir, 'mcp.json');
  writeFileSync(discoveryPath, JSON.stringify({
    url: `http://127.0.0.1:${port}/mcp`, port, pid: process.pid,
  }, null, 2));
  console.log(`[mcp] listening on http://127.0.0.1:${port}/mcp`);
}

export function stopMcpServer(): void {
  if (httpServer) { httpServer.close(); httpServer = null; }
  if (discoveryPath) {
    try { rmSync(discoveryPath); } catch { /* already gone */ }
    discoveryPath = null;
  }
}
