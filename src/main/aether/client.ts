/**
 * Aurora's OUTBOUND Aether client — the half the suite audit named as its
 * keystone gap. Aurora already *serves* Aether (`adapter.ts`); this is the side
 * that talks to oracle-next, the emulator.
 *
 * Design spec: `docs/specs/2026-07-03-aether-client-playtest-design.md` §1 —
 * **read its §0 Corrections first**, which record what six weeks moved
 * underneath that document.
 *
 * Transport is deliberately injected (`connect`) rather than imported: every
 * behaviour worth testing here is framing, handshake ordering and cache
 * invalidation, none of which need a real socket, and a node-only suite cannot
 * open one anyway.
 */

import { PROTOCOL_VERSION, type JsonRpcResponse } from './protocol';

/** The slice of a socket this client needs. `net.Socket` satisfies it. */
export interface AetherSocket {
  write(data: string): void;
  end(): void;
  destroy(): void;
  on(event: 'data', fn: (chunk: Buffer) => void): unknown;
  on(event: 'connect' | 'close' | 'error', fn: (arg?: unknown) => void): unknown;
}

export type AetherStatus = 'disconnected' | 'connecting' | 'connected';

export interface AetherClientOptions {
  connect: () => AetherSocket;
  socketPath: string;
}

export interface RpcFailure extends Error { code: number; data?: unknown }

const rpcError = (code: number, message: string, data?: unknown): RpcFailure =>
  Object.assign(new Error(message), { code, data });

interface InitializeResult {
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: number;
  methods?: string[];
}

export class AetherClient {
  private readonly opts: AetherClientOptions;
  private sock: AetherSocket | null = null;
  private buf = '';
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private readonly eventSubs = new Set<(method: string, params: unknown) => void>();
  private readonly statusSubs = new Set<(status: AetherStatus) => void>();

  /**
   * Symbol → address, valid for ONE ROM image. Symbols provably move between
   * builds, so this is dropped on `romReloaded` and on any `load_symbols` we
   * issue — a stale entry is not degraded information, it is a confident lie
   * that lands a write in the wrong place.
   */
  private symbols = new Map<string, number>();

  private methods = new Set<string>();
  status: AetherStatus = 'disconnected';
  server: { name?: string; version?: string } = {};

  constructor(opts: AetherClientOptions) { this.opts = opts; }

  // -- lifecycle ------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.status !== 'disconnected') return;
    this.status = 'connecting';
    const sock = this.opts.connect();
    this.sock = sock;

    sock.on('data', (chunk) => this.onData(chunk));
    sock.on('close', () => this.onClose());
    sock.on('error', () => { /* close always follows; failing there keeps one path */ });

    try {
      const init = await this.request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        clientName: 'aurora',
        clientVersion: '0.1.0',
        clientCapabilities: { events: true },
      }) as InitializeResult;

      if (init.protocolVersion !== undefined && init.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(
          `Aether protocol mismatch: server speaks ${init.protocolVersion}, this client speaks ${PROTOCOL_VERSION}`,
        );
      }

      this.methods = new Set(init.methods ?? []);
      this.server = { name: init.serverName, version: init.serverVersion };

      // STEP TWO, AND IT IS NOT OPTIONAL. The server registers this connection
      // for events when `initialized` arrives, never on `initialize`
      // (oracle-next session.rs:91 -> server.rs:550). Send only the first and
      // you get a healthy connection that silently never receives an event.
      this.notify('initialized');
      this.status = 'connected';
      this.emitStatus();
    } catch (e) {
      this.teardown(e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  disconnect(): void {
    this.sock?.end();
    this.teardown(new Error('client disconnected'));
  }

  private onClose(): void { this.teardown(new Error('Aether socket disconnected')); }

  private teardown(reason: Error): void {
    const was = this.status;
    this.status = 'disconnected';
    this.sock = null;
    this.buf = '';
    this.methods.clear();
    this.symbols.clear();
    this.server = {};
    // Nothing else will ever answer these; leaving them pending hangs whatever
    // awaited them, which in a UI is a spinner that never stops.
    for (const { reject } of this.pending.values()) reject(reason);
    this.pending.clear();
    // TELL SOMEBODY. The link can die without anyone having asked it anything —
    // the emulator window is closed, the process is killed — and a client that
    // only reports its state when called leaves the UI showing "connected" for
    // a socket that is gone. Found in real use: closing the emulator left the
    // badge emerald.
    if (was !== 'disconnected') this.emitStatus();
  }

  private emitStatus(): void {
    for (const fn of this.statusSubs) fn(this.status);
  }

  /** Subscribe to connection-state changes, including ones nobody asked for. */
  onStatusChange(fn: (status: AetherStatus) => void): () => void {
    this.statusSubs.add(fn);
    return () => this.statusSubs.delete(fn);
  }

  // -- wire -----------------------------------------------------------------

  /**
   * NDJSON, so a chunk is not a message: the server may coalesce several into
   * one read or split one across two. Buffer until a newline, both directions.
   */
  private onData(chunk: Buffer): void {
    this.buf += chunk.toString('utf8');
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: JsonRpcResponse & { method?: string; params?: unknown };
      try { msg = JSON.parse(line); } catch { continue; }   // a malformed line is not worth killing the link over
      this.dispatch(msg);
    }
  }

  private dispatch(msg: JsonRpcResponse & { method?: string; params?: unknown }): void {
    if (msg.method !== undefined && msg.id === undefined) {
      // Server-initiated notification. `romReloaded` invalidates every address
      // we hold, so drop the table before any subscriber can act on the event
      // and resolve against it.
      if (msg.method === 'emulator/romReloaded') this.symbols.clear();
      for (const fn of this.eventSubs) fn(msg.method, msg.params);
      return;
    }
    const id = typeof msg.id === 'number' ? msg.id : NaN;
    const waiter = this.pending.get(id);
    if (!waiter) return;
    this.pending.delete(id);
    if ('error' in msg && msg.error) {
      waiter.reject(rpcError(msg.error.code, msg.error.message, msg.error.data));
    } else {
      waiter.resolve((msg as { result: unknown }).result);
    }
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const sock = this.sock;
    if (!sock) return Promise.reject(new Error('Aether client is not connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      sock.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  private notify(method: string, params?: unknown): void {
    this.sock?.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  /** Call a server method. Rejects with a `code` when the server refuses. */
  call(method: string, params?: unknown): Promise<unknown> {
    if (this.status !== 'connected' && method !== 'initialize') {
      return Promise.reject(new Error('Aether client is not connected'));
    }
    return this.request(method, params);
  }

  // -- capabilities ---------------------------------------------------------

  /**
   * Feature-detect against the server's advertised list — never against a
   * version number. oracle-next gates that list on a coverage check, so a
   * method appearing here is a method that answers.
   */
  hasMethod(method: string): boolean { return this.methods.has(method); }

  onEvent(fn: (method: string, params: unknown) => void): () => void {
    this.eventSubs.add(fn);
    return () => this.eventSubs.delete(fn);
  }

  // -- symbols --------------------------------------------------------------

  /**
   * Resolve a symbol to an address. THE ONLY WAY Aurora learns an address:
   * contract D7 makes clients resolve rather than hardcode, and the server
   * enforces it by accepting `symbol` targets directly.
   *
   * Note the spelling split, which is a real trap: `lookup_symbol` takes
   * `name`, while `read_memory`/`write_memory` take `symbol`.
   */
  async resolve(name: string): Promise<number> {
    const hit = this.symbols.get(name);
    if (hit !== undefined) return hit;

    const r = await this.call('emulator/lookup_symbol', { name }) as
      { addr?: string; exact?: boolean; ambiguous?: boolean };

    // An addr->name lookup answers with the nearest PRECEDING label plus a
    // displacement. Taking that for a name lookup would silently target
    // whatever sits before the symbol we asked for.
    if (r.exact === false) {
      throw new Error(`symbol ${name} did not resolve exactly (got ${r.addr ?? 'nothing'})`);
    }
    if (!r.addr) throw new Error(`symbol ${name} resolved to no address`);

    const addr = Number.parseInt(r.addr, 16);
    if (!Number.isFinite(addr)) throw new Error(`symbol ${name} resolved to an unparseable address ${r.addr}`);
    this.symbols.set(name, addr);
    return addr;
  }

  /**
   * Resolve `name` and add a byte displacement.
   *
   * This is arithmetic on purpose. `write_memory` takes a `symbol` target but
   * **silently ignores** an `offset`/`disp` alongside it and writes to the base
   * — verified against a live server by zeroing base and base+2, writing
   * 0xBEEF with `offset: 2`, and reading it back at base. `'Player_1+2'` is not
   * a symbol name either. So a displaced write resolves the base here and
   * passes a computed `addr`, which is still symbol-derived and still contains
   * no literal address.
   */
  async resolveOffset(name: string, displacement: number): Promise<number> {
    return (await this.resolve(name)) + displacement;
  }

  /** Load a listing and drop every cached address, since they just moved. */
  async loadSymbols(path: string): Promise<unknown> {
    const r = await this.call('emulator/load_symbols', { path });
    this.symbols.clear();
    return r;
  }
}
