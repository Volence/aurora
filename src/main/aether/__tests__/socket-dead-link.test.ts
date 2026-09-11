import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AetherClient, describeSocketError } from '../client';

/**
 * What the client SURFACES at a dead link — measured against a real unix
 * socket, not a mock, because the whole question is which errno the OS hands
 * back and whether the client keeps it.
 *
 * The resolver (`socket-path.ts`) selects a path from env-var presence and
 * never probes; the ONLY thing that touches the filesystem is `net.connect`
 * in `bridge.ts`. So the error a user sees at a stale `/tmp/oracle.sock` is
 * whatever `connect()` reports, IF the client passes it through:
 *   - a socket FILE nobody is listening on → `ECONNREFUSED`
 *   - no file at all                       → `ENOENT`
 * Both fixtures are made here rather than assumed: the dead file is left by a
 * child that bound it and then SIGKILLed itself, exactly how a crashed server
 * leaves one. If this box cannot make a unix socket the suite says so loudly.
 *
 * Runner: `npx vitest run src/main/aether/__tests__/socket-dead-link.test.ts`
 */
describe('AetherClient at a dead link', () => {
  let dir: string;
  let dead: string;
  let absent: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aurora-dead-link-'));
    dead = join(dir, 'oracle.sock');
    absent = join(dir, 'never-bound.sock');
    const r = spawnSync(process.execPath, [
      '-e',
      `require('net').createServer().listen(${JSON.stringify(dead)}, () => process.kill(process.pid, 'SIGKILL'))`,
    ]);
    if (r.signal !== 'SIGKILL') {
      throw new Error(`fixture child did not die by SIGKILL (signal=${r.signal} status=${r.status}); ` +
        `stderr: ${r.stderr}`);
    }
    if (!statSync(dead).isSocket()) throw new Error(`fixture ${dead} is not a socket file`);
  });

  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  const client = (path: string) => new AetherClient({
    connect: () => net.connect(path),
    socketPath: path,
    log: () => {},
  });

  it('a socket FILE with no listener surfaces ECONNREFUSED naming the path', async () => {
    const c = client(dead);
    await expect(c.connect()).rejects.toThrow(/ECONNREFUSED/);
    await expect(c.connect().catch((e: Error) => e.message)).resolves.toContain(dead);
    expect(c.status).toBe('disconnected');
  });

  it('a path with no file surfaces ENOENT naming the path', async () => {
    const c = client(absent);
    await expect(c.connect()).rejects.toThrow(/ENOENT/);
    await expect(c.connect().catch((e: Error) => e.message)).resolves.toContain(absent);
    expect(c.status).toBe('disconnected');
  });

  /**
   * UX seat B, F4 (wording half): this text reaches a person verbatim, through
   * the renderer's refusal toast, and it used to read `Aether socket error:
   * connect ENOENT <path>`. Measured on the SAME two real fixtures as the rows
   * above, so the sentence is checked against the errno the OS really hands
   * back rather than against a code this file made up.
   */
  const messageAt = async (path: string): Promise<string> =>
    client(path).connect().then(() => 'CONNECTED (fixture broken)', (e: Error) => e.message);

  it('F4: no socket FILE reads as a sentence about an emulator, naming the path', async () => {
    const m = await messageAt(absent);
    expect(m).toBe(describeSocketError(Object.assign(new Error('x'), { code: 'ENOENT' }), absent));
    expect(m.startsWith(`No emulator is listening at ${absent}.`)).toBe(true);
    expect(m).toContain('no socket file');
    expect(m).not.toContain('Aether socket error');
  });

  it('F4: a file NOBODY ANSWERS ON reads differently, and still names the path', async () => {
    const m = await messageAt(dead);
    expect(m).toBe(describeSocketError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }), dead));
    expect(m.startsWith(`No emulator is listening at ${dead}.`)).toBe(true);
    expect(m).toContain('nothing answers on it');
    expect(m).not.toContain('Aether socket error');
  });

  it('F4: the two refusals stay DISTINGUISHABLE once their paths are taken out', async () => {
    const a = (await messageAt(absent)).split(absent).join('<path>');
    const d = (await messageAt(dead)).split(dead).join('<path>');
    expect(a).not.toBe(d);
  });
});

describe('describeSocketError: what it does NOT word', () => {
  it('CONTROL: an errno nobody measured keeps the raw relay, message and all', () => {
    const e = Object.assign(new Error('connect EACCES /tmp/x.sock'), { code: 'EACCES' });
    expect(describeSocketError(e, '/tmp/x.sock')).toBe('Aether socket error: connect EACCES /tmp/x.sock');
  });

  it('CONTROL: an error with no code at all keeps the raw relay', () => {
    expect(describeSocketError(new Error('boom'), '/tmp/x.sock')).toBe('Aether socket error: boom');
  });
});
