import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { app as electronApp } from 'electron';
import type { BrowserWindow } from 'electron';
import { createServer } from 'http';
import type { Server } from 'http';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { requestAgent } from './agent-bridge';
import type { AgentRequest } from '../shared/agent-protocol';
import { EDITOR_METHODS } from './editor-methods';
import { handleRequest, addSubscriber, removeSubscriber } from './aether/adapter';

const DEFAULT_PORT = 38473;

function buildServer(getWindow: () => BrowserWindow | null): McpServer {
  const server = new McpServer({ name: 'aurora', version: '0.1.0' });

  const forward = async (payload: AgentRequest) => {
    const win = getWindow();
    if (!win) throw new Error('editor not ready (no window)');
    return requestAgent(win, payload);
  };

  const textResult = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  });

  // MCP tools are driven from the shared registry so they never drift from the
  // Aether `editor/*` surface (single source of methods).
  for (const m of EDITOR_METHODS) {
    const config = Object.keys(m.params).length > 0
      ? { description: m.description, inputSchema: m.params }
      : { description: m.description };
    server.registerTool(m.name, config, async (args: Record<string, unknown> = {}) => {
      const result = await forward({ kind: m.kind, ...args } as AgentRequest);
      if (m.result === 'image') {
        return { content: [{ type: 'image' as const, data: (result as { pngBase64: string }).pngBase64, mimeType: 'image/png' }] };
      }
      return textResult(result);
    });
  }

  return server;
}


let httpServer: Server | null = null;
let discoveryPaths: string[] = [];

// Aurora's discovery file moved from ~/.sonic-level-editor/ to ~/.aurora/ with the
// rename. We write BOTH during the transition window so existing bus/MCP clients
// pointing at the legacy path keep finding us; remove the legacy write once every
// client resolves ~/.aurora/mcp.json.
const DISCOVERY_DIR = '.aurora';
const LEGACY_DISCOVERY_DIR = '.sonic-level-editor';

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

  // ---- Aether adapter: the editor/* surface over the Aether envelope ----
  // JSON-RPC 2.0 (POST) + server-push events (SSE). Trusted local-developer
  // API: loopback bind + Origin/Host check, never remotely exposed (protocol D8).
  const loopbackOnly = (req: Request, res: Response, next: NextFunction) => {
    const loopback = /^(127\.0\.0\.1|localhost|\[::1\]|::1)(:\d+)?$/i;
    const host = req.headers.host ?? '';
    const origin = req.headers.origin;
    const hostOk = loopback.test(host);
    const originOk = !origin || loopback.test(origin.replace(/^https?:\/\//, ''));
    if (!hostOk || !originOk) { res.status(403).json({ error: 'loopback only (protocol D8)' }); return; }
    next();
  };
  const aetherForward = (payload: AgentRequest) => {
    const win = getWindow();
    if (!win) throw new Error('editor not ready (no window)');
    return requestAgent(win, payload);
  };
  exp.post('/aether', loopbackOnly, async (req, res) => {
    try {
      const result = await handleRequest(req.body, aetherForward);
      if (result === null) res.status(204).end();
      else res.json(result);
    } catch (e) {
      console.error('[aether] request failed:', e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'internal error' } });
    }
  });
  exp.get('/aether/events', loopbackOnly, (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    addSubscriber(res);
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'editor/ready', params: { serverName: 'aurora' } })}\n\n`);
    req.on('close', () => removeSubscriber(res));
  });

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

  const home = electronApp.getPath('home');
  const base = `http://127.0.0.1:${port}`;
  const contents = JSON.stringify({
    url: `${base}/mcp`, port, pid: process.pid,
    // Aether bus endpoints (how bus clients reach Aurora): JSON-RPC over POST,
    // events over SSE. Role-namespaced editor/* methods; protocol version 1.
    aether: `${base}/aether`,
    aetherEvents: `${base}/aether/events`,
    protocolVersion: 1,
  }, null, 2);
  discoveryPaths = [];
  for (const sub of [DISCOVERY_DIR, LEGACY_DISCOVERY_DIR]) {
    const dir = join(home, sub);
    try {
      mkdirSync(dir, { recursive: true });
      const p = join(dir, 'mcp.json');
      writeFileSync(p, contents);
      discoveryPaths.push(p);
    } catch (err) {
      console.error(`[mcp] could not write discovery file in ${dir}:`, err);
    }
  }
  console.log(`[mcp] listening on http://127.0.0.1:${port}/mcp`);
}

export function stopMcpServer(): void {
  if (httpServer) { httpServer.close(); httpServer = null; }
  for (const p of discoveryPaths) {
    try { rmSync(p); } catch { /* already gone */ }
  }
  discoveryPaths = [];
}
