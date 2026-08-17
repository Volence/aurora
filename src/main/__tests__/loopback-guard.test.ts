import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { isLoopbackRequest, loopbackOnly } from '../loopback-guard';

/**
 * R13. `/mcp` was registered with no middleware while both `/aether` routes
 * wore this guard — and both dispatch the identical EDITOR_METHODS registry
 * (open_project → edit_chunk → save_project, with no confirmation on save).
 * The 127.0.0.1 bind does not close that: a page that resolves its own hostname
 * to 127.0.0.1 is same-origin to the browser, so nothing preflights and nothing
 * else says no.
 */
describe('isLoopbackRequest', () => {
  it.each([
    ['127.0.0.1:38473', undefined],
    ['localhost:38473', undefined],
    ['[::1]:38473', undefined],
    ['127.0.0.1', undefined],
    ['127.0.0.1:38473', 'http://localhost:38473'],
    ['localhost:38473', 'https://127.0.0.1'],
  ])('admits host %s origin %s', (host, origin) => {
    expect(isLoopbackRequest(host, origin)).toBe(true);
  });

  it.each([
    ['a rebound hostname', 'evil.example.com:38473', undefined],
    ['a rebound hostname with a loopback-looking suffix', '127.0.0.1.evil.com:38473', undefined],
    ['a loopback host with a remote origin', '127.0.0.1:38473', 'http://evil.example.com'],
    ['a LAN address', '192.168.1.10:38473', undefined],
    ['no host at all', undefined, undefined],
    ['a host that merely contains 127.0.0.1', 'foo127.0.0.1:38473', undefined],
  ])('refuses %s', (_label, host, origin) => {
    expect(isLoopbackRequest(host, origin)).toBe(false);
  });
});

describe('loopbackOnly middleware', () => {
  const call = (headers: Record<string, string | undefined>) => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json })) as unknown as Response['status'];
    const next = vi.fn() as NextFunction;
    loopbackOnly({ headers } as unknown as Request, { status } as Response, next);
    return { status, json, next };
  };

  it('passes a loopback request through', () => {
    const { next, status } = call({ host: '127.0.0.1:38473' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('403s a rebound one and does not call the route', () => {
    const { next, status, json } = call({ host: 'evil.example.com' });
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'loopback only (protocol D8)' });
  });
});
