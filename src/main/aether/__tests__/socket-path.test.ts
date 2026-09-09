import { describe, it, expect } from 'vitest';
import { resolveSocketPath, SOCKET_PATH_MAX } from '../socket-path';

/**
 * The path order is oracle-next's, read from its own resolver
 * (`crates/oracle-aether/src/server.rs:66-78`) rather than from Aurora's spec,
 * which named only the third entry. A client that honours fewer entries than
 * the server connects to a socket the server did not open.
 */
describe('resolveSocketPath', () => {
  it('prefers $ORACLE_SOCKET above everything', () => {
    expect(resolveSocketPath({
      ORACLE_SOCKET: '/run/a.sock',
      EXODUS_SOCKET: '/run/b.sock',
      XDG_RUNTIME_DIR: '/run/user/1000',
    }).path).toBe('/run/a.sock');
  });

  it('falls back to the transitional $EXODUS_SOCKET', () => {
    expect(resolveSocketPath({
      EXODUS_SOCKET: '/run/b.sock',
      XDG_RUNTIME_DIR: '/run/user/1000',
    }).path).toBe('/run/b.sock');
  });

  it('then $XDG_RUNTIME_DIR/oracle.sock', () => {
    expect(resolveSocketPath({ XDG_RUNTIME_DIR: '/run/user/1000' }).path)
      .toBe('/run/user/1000/oracle.sock');
  });

  it('and finally /tmp/oracle.sock', () => {
    expect(resolveSocketPath({}).path).toBe('/tmp/oracle.sock');
  });

  it('ignores an empty env var rather than resolving to a bare suffix', () => {
    // An exported-but-empty ORACLE_SOCKET is a shell accident, not a request to
    // connect to ''. Treating it as set produced a connect to the empty path.
    expect(resolveSocketPath({ ORACLE_SOCKET: '', XDG_RUNTIME_DIR: '/run/user/1000' }).path)
      .toBe('/run/user/1000/oracle.sock');
  });

  /**
   * The server dies with a raw `path must be shorter than SUN_LEN` on an
   * over-long path, which says nothing about which path or what the limit is.
   * A client that can see the problem before connecting should say so.
   */
  it('flags a path too long for a unix socket, naming the limit', () => {
    const long = '/tmp/' + 'x'.repeat(200) + '/oracle.sock';
    const r = resolveSocketPath({ ORACLE_SOCKET: long });
    expect(r.path).toBe(long);
    expect(r.tooLong).toBe(true);
    expect(r.warning).toMatch(new RegExp(String(SOCKET_PATH_MAX)));
    expect(r.warning).toContain(long);
  });

  it('does not flag a normal path', () => {
    const r = resolveSocketPath({ XDG_RUNTIME_DIR: '/run/user/1000' });
    expect(r.tooLong).toBe(false);
    expect(r.warning).toBeNull();
  });

  /**
   * THE BOUNDARY ITSELF, which neither row above touches: one uses a path far
   * past the limit and the other one far under it, so relaxing `>=` to `>` left
   * the whole suite green (plant P44).
   *
   * The lengths are DERIVED from `SOCKET_PATH_MAX`, never typed out, so this
   * row follows the constant if the platform bound is ever revised.
   *
   * Which side the boundary falls on: `SOCKET_PATH_MAX` is the SIZE of
   * `sockaddr_un.sun_path` (104 on macOS/BSD, the smaller of the two bounds),
   * and the kernel stores the path with a terminating NUL inside it. So a path
   * of exactly that many bytes does NOT fit and must be refused, while one byte
   * fewer does. That is `>=`, and a path landing exactly on the limit is the
   * only input that can tell the two spellings apart.
   */
  it('refuses a path of exactly SOCKET_PATH_MAX bytes, and accepts one byte fewer', () => {
    const pathOf = (n: number) => `/${'a'.repeat(n - 1)}`;

    const atLimit = pathOf(SOCKET_PATH_MAX);
    // Anti-vacuous: the fixture really is the length this row is about.
    expect(Buffer.byteLength(atLimit, 'utf8')).toBe(SOCKET_PATH_MAX);
    expect(resolveSocketPath({ ORACLE_SOCKET: atLimit }).tooLong).toBe(true);

    const underLimit = pathOf(SOCKET_PATH_MAX - 1);
    expect(Buffer.byteLength(underLimit, 'utf8')).toBe(SOCKET_PATH_MAX - 1);
    const ok = resolveSocketPath({ ORACLE_SOCKET: underLimit });
    expect(ok.tooLong).toBe(false);
    expect(ok.warning).toBeNull();
  });

  it('reports which source won, so a wrong-socket connection is diagnosable', () => {
    expect(resolveSocketPath({ ORACLE_SOCKET: '/a' }).source).toBe('ORACLE_SOCKET');
    expect(resolveSocketPath({ EXODUS_SOCKET: '/b' }).source).toBe('EXODUS_SOCKET');
    expect(resolveSocketPath({ XDG_RUNTIME_DIR: '/c' }).source).toBe('XDG_RUNTIME_DIR');
    expect(resolveSocketPath({}).source).toBe('default');
  });
});
