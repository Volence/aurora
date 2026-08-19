/**
 * Where oracle-next's Aether socket lives.
 *
 * The order is the SERVER's, transcribed from its own resolver
 * (`oracle-next/crates/oracle-aether/src/server.rs:66-78`) rather than from
 * Aurora's 2026-07-03 spec, which named only `$XDG_RUNTIME_DIR/oracle.sock`.
 * A client honouring fewer entries than the server connects to a socket nobody
 * opened, and the symptom is an ENOENT that looks like "the emulator isn't
 * running".
 */

/**
 * `sockaddr_un.sun_path` is 108 bytes on Linux (104 on macOS/BSD); the kernel
 * refuses anything longer, and the server surfaces that as a bare
 * `path must be shorter than SUN_LEN` naming neither the path nor the limit.
 * We use the smaller bound so a path that works here works everywhere, and we
 * warn rather than refuse — the limit is the platform's to enforce, not ours.
 */
export const SOCKET_PATH_MAX = 104;

export type SocketPathSource = 'ORACLE_SOCKET' | 'EXODUS_SOCKET' | 'XDG_RUNTIME_DIR' | 'default';

export interface ResolvedSocketPath {
  path: string;
  /** Which entry in the chain supplied it — the first thing to check when a connect goes somewhere unexpected. */
  source: SocketPathSource;
  tooLong: boolean;
  /** Human-facing explanation when `tooLong`, else null. */
  warning: string | null;
}

/** An exported-but-empty var is a shell accident, not a request to connect to ''. */
const set = (v: string | undefined): v is string => typeof v === 'string' && v.length > 0;

export function resolveSocketPath(env: Record<string, string | undefined>): ResolvedSocketPath {
  let path: string;
  let source: SocketPathSource;

  if (set(env.ORACLE_SOCKET)) {
    path = env.ORACLE_SOCKET; source = 'ORACLE_SOCKET';
  } else if (set(env.EXODUS_SOCKET)) {
    // Transitional, from the Exodus-port era. Still honoured by the server.
    path = env.EXODUS_SOCKET; source = 'EXODUS_SOCKET';
  } else if (set(env.XDG_RUNTIME_DIR)) {
    path = `${env.XDG_RUNTIME_DIR}/oracle.sock`; source = 'XDG_RUNTIME_DIR';
  } else {
    path = '/tmp/oracle.sock'; source = 'default';
  }

  const tooLong = Buffer.byteLength(path, 'utf8') >= SOCKET_PATH_MAX;
  return {
    path,
    source,
    tooLong,
    warning: tooLong
      ? `Aether socket path is ${Buffer.byteLength(path, 'utf8')} bytes; a unix socket path must be under ${SOCKET_PATH_MAX}. ` +
        `Set ORACLE_SOCKET to something shorter. Path: ${path}`
      : null,
  };
}
