import { describe, it, expect, vi } from 'vitest';
import { handleRequest, capabilities } from '../../src/main/aether/adapter';
import type { JsonRpcRequest, JsonRpcSuccess, JsonRpcError } from '../../src/main/aether/protocol';

const forward = (impl: (p: { kind: string }) => unknown = () => ({ ok: true })) =>
  vi.fn(async (p: { kind: string }) => impl(p));

const req = (method: string, params?: unknown, id: number | undefined = 1): JsonRpcRequest =>
  ({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params });

describe('Aether adapter — handshake', () => {
  it('initialize advertises protocolVersion, methods, capabilities (D4)', async () => {
    const r = await handleRequest(req('initialize', { protocolVersion: 1 }), forward()) as JsonRpcSuccess;
    const res = r.result as ReturnType<typeof capabilities>;
    expect(res.protocolVersion).toBe(1);
    expect(res.serverName).toBe('aurora');
    expect(res.methods).toContain('editor/goto');
    expect(res.methods).toContain('editor/get_palette');
    expect(res.capabilities.events).toContain('editor/ready');
  });

  it('rejects an incompatible protocol version with -32015', async () => {
    const r = await handleRequest(req('initialize', { protocolVersion: 99 }), forward()) as JsonRpcError;
    expect(r.error.code).toBe(-32015);
    expect((r.error.data as { supported: number[] }).supported).toEqual([1]);
  });

  it('initialized is a notification — no response', async () => {
    expect(await handleRequest({ jsonrpc: '2.0', method: 'initialized' }, forward())).toBeNull();
  });

  it('editor/ping replies ok', async () => {
    const r = await handleRequest(req('editor/ping'), forward()) as JsonRpcSuccess;
    expect(r.result).toEqual({ ok: true });
  });
});

describe('Aether adapter — method dispatch', () => {
  it('forwards a known method as { kind, ...params } and returns the result', async () => {
    const fwd = forward((p) => ({ echoed: p }));
    const r = await handleRequest(req('editor/goto', { section: 2, x: 10, y: 5 }), fwd) as JsonRpcSuccess;
    expect(fwd).toHaveBeenCalledWith({ kind: 'goto', section: 2, x: 10, y: 5 });
    expect((r.result as { echoed: unknown }).echoed).toEqual({ kind: 'goto', section: 2, x: 10, y: 5 });
  });

  it('unknown method → -32601', async () => {
    const r = await handleRequest(req('editor/nope'), forward()) as JsonRpcError;
    expect(r.error.code).toBe(-32601);
  });

  it('invalid params → -32602 with issues, and does NOT forward', async () => {
    const fwd = forward();
    const r = await handleRequest(req('editor/goto', { section: 'two' }), fwd) as JsonRpcError;
    expect(r.error.code).toBe(-32602);
    expect(fwd).not.toHaveBeenCalled();
  });

  it('a bad envelope → -32600', async () => {
    const r = await handleRequest({ jsonrpc: '1.0', id: 1, method: 'x' } as unknown as JsonRpcRequest, forward()) as JsonRpcError;
    expect(r.error.code).toBe(-32600);
  });

  it('an internal forward failure → -32603', async () => {
    const fwd = vi.fn(async () => { throw new Error('boom'); });
    const r = await handleRequest(req('editor/get_palette'), fwd) as JsonRpcError;
    expect(r.error.code).toBe(-32603);
    expect(r.error.message).toBe('boom');
  });

  it('a notification call (no id) returns null even on success', async () => {
    expect(await handleRequest({ jsonrpc: '2.0', method: 'editor/get_palette', params: {} }, forward())).toBeNull();
  });
});
