import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
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
import { loopbackOnly } from './loopback-guard';

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

/**
 * The port actually bound. Read at REQUEST time rather than captured, because
 * the transport's allow-lists are built per request and the port is only known
 * after `listen` resolves — a snapshot taken while wiring the routes would be
 * zero, which allows nothing and would 403 every legitimate call.
 */
let boundPort = 0;

const LOOPBACK_NAMES = ['127.0.0.1', 'localhost', '[::1]'];

/** Host header values this server answers to. */
function allowedHosts(): string[] {
  return LOOPBACK_NAMES.flatMap((h) => [`${h}:${boundPort}`, h]);
}

/** Origins allowed to reach it from a browser context. */
function allowedOrigins(): string[] {
  return LOOPBACK_NAMES.flatMap((h) => [
    `http://${h}:${boundPort}`, `https://${h}:${boundPort}`, `http://${h}`, `https://${h}`,
  ]);
}

// Aurora's discovery file moved from ~/.sonic-level-editor/ to ~/.aurora/ with the
// rename. We write BOTH during the transition window so existing bus/MCP clients
// pointing at the legacy path keep finding us; remove the legacy write once every
// client resolves ~/.aurora/mcp.json.
const DISCOVERY_DIR = '.aurora';
const LEGACY_DISCOVERY_DIR = '.sonic-level-editor';

/**
 * Every route this process serves, wired onto a fresh express app.
 *
 * Exported so the node suite can plant a rebound request against the REAL
 * routing table. Testing the middleware alone would not have caught the finding
 * this exists for: the guard was correct, and `/mcp` simply did not have it.
 */
export function buildMcpApp(getWindow: () => BrowserWindow | null): express.Express {
  const exp = express();
  exp.use(express.json({ limit: '16mb' }));

  // ---- EVERY route below wears `loopbackOnly` ----
  //
  // `/mcp` used to run bare while `/aether` wore the guard, under a comment
  // claiming the surface is "never remotely exposed". Both dispatch the SAME
  // EDITOR_METHODS registry — open_project, edit_chunk, save_project, and
  // save_project asks nobody — so the unguarded route was a way to rewrite the
  // user's disassembly from a rebound web page. See loopback-guard.ts for why
  // the 127.0.0.1 bind is not by itself an answer to that.
  //
  // Stateless Streamable HTTP: fresh server+transport per POST (SDK-documented
  // pattern). BOTH defences, not either: the middleware is Aurora's own rule
  // stated once for every route, and the transport's own protection defaults to
  // FALSE, so leaving it unset opted out of the SDK's. (The SDK marks these
  // options deprecated in favour of exactly the middleware above — which is why
  // the middleware is the primary and these are the backstop, not the reverse.)
  exp.post('/mcp', loopbackOnly, async (req, res) => {
    try {
      const server = buildServer(getWindow);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableDnsRebindingProtection: true,
        allowedHosts: allowedHosts(),
        allowedOrigins: allowedOrigins(),
      });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request failed:', err);
      if (!res.headersSent) res.status(500).json({ error: 'internal error' });
    }
  });
  exp.get('/mcp', loopbackOnly, (_req, res) => { res.status(405).end(); });
  exp.delete('/mcp', loopbackOnly, (_req, res) => { res.status(405).end(); });

  // ---- Aether adapter: the editor/* surface over the Aether envelope ----
  // JSON-RPC 2.0 (POST) + server-push events (SSE). Trusted local-developer
  // API: loopback bind + Origin/Host check, never remotely exposed (protocol D8).
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

  return exp;
}

export async function startMcpServer(getWindow: () => BrowserWindow | null): Promise<void> {
  const exp = buildMcpApp(getWindow);

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
  boundPort = port; // the allow-lists above are built from this, per request

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
