/**
 * WHICH EMULATOR ANSWERED — and why this is not a question the socket can answer.
 *
 * Aurora resolves ONE unix socket path (`socket-path.ts`: `$ORACLE_SOCKET`,
 * `$EXODUS_SOCKET`, `$XDG_RUNTIME_DIR/oracle.sock`, `/tmp/oracle.sock`). No step
 * probes, there is no port and no server selector, and nothing in this client
 * chooses between implementations: **whoever holds that path first answers.**
 * "Default to the new core" is therefore not expressible as client config. The
 * only thing a client CAN do is assert what it got, and refuse when that is not
 * what it was built for. Until this module existed, Aurora silently proceeded
 * against anything that spoke the protocol.
 *
 * ── The field to read, and the two that lie ────────────────────────────────
 *
 * Read `implementation`. It is REQUIRED and drawn from a closed registry
 * (empyrean `contract/protocol.md` §2.1, registered 2026-08-26 by §11.23):
 *
 *     oracle-rs   the Rust `oracle-aether` server
 *     oracle-cpp  the legacy C++ `ControlSocket` server (Exodus port)
 *
 * and the registry is "extended only by amendment", so — the contract's own
 * words — *"a consumer's `implementation === 'oracle-rs'` has one meaning that
 * only an amendment can change."*
 *
 * **Never `serverName`.** §2.1 is explicit that it is a *deployment* label a
 * config may set, that two processes of the same implementation want
 * distinguishable ones, and that it *"MUST NOT be used to discriminate
 * implementations"*. It still returns `oracle-next` from the Rust core today,
 * which proves nothing about which core is running. THE CONTRACT NAMES THIS
 * REPO'S FAMILY OF PIN AS THE THING §11.23 LANDED TO KILL.
 *
 * **Never `serverBuild.id` for equality.** It is a tree identity extended by
 * build profile/target/features; it moves on a documentation commit, so an
 * equality check would be the O26 defect one level up — a pin that rejects
 * every correct binary. It is RECORDED here as provenance and compared against
 * nothing.
 *
 * ── What this actually asserts, and why a rename cannot break it ───────────
 *
 * It asserts a LINEAGE, on the one field whose value is not a deployment's to
 * choose. The rename axis in this protocol is `serverName`, and this module
 * does not read it: rename the deployment to anything and every verdict below
 * is unchanged. The one thing that *would* move `implementation` is a contract
 * amendment extending the registry — and that case is deliberately NOT a
 * refusal (`unregistered`, below), because Aurora's copy of the registry is
 * allowed to be older than the contract, and refusing a lineage this build has
 * simply never heard of would make a legitimate amendment an outage.
 *
 * Three verdicts, because two would fold "I could not tell" into one of the
 * answers — the exact shape this parcel exists to remove:
 *
 *   supported     the lineage this Aurora is built against. Connect.
 *   superseded    a registry lineage Aurora deliberately does not drive.
 *                 REFUSE — this is the case that used to proceed in silence.
 *   unidentified  no `implementation` at all. §2.1 makes it REQUIRED, so this
 *                 is either a pre-§11.23 server or not an Aether server.
 *                 REFUSE: it is precisely "cannot tell oracle-cpp from
 *                 oracle-rs", and proceeding is the defect.
 *   unregistered  a string this build does not know. LOUD, NOT FATAL — a
 *                 future amendment reads exactly like a forgery from here, and
 *                 only one of those two should cost the user their session.
 */

/** The lineage Aurora drives. A registry value (§2.1), not a deployment name. */
export const SUPPORTED_IMPLEMENTATION = 'oracle-rs';

/**
 * Registry lineages Aurora refuses, each with the reason in the refusal.
 *
 * A DENYLIST, NOT AN ALLOWLIST, and that is the rename-proofing: an allowlist
 * would refuse every future amendment, a denylist refuses only what has been
 * examined and ruled out. `oracle-cpp` is `oracle-old/` — reference-only since
 * the Rust core replaced it, and it serves a different (older) subset of the
 * surface, so a session against it fails later, further away, as features that
 * "stopped working".
 */
export const SUPERSEDED_IMPLEMENTATIONS: Readonly<Record<string, string>> = Object.freeze({
  'oracle-cpp': 'the legacy C++ ControlSocket server (oracle-old/), replaced by the Rust core '
    + 'and kept only as reference; it serves an older subset of the bus',
});

export type ServerIdentityVerdict = 'supported' | 'superseded' | 'unregistered' | 'unidentified';

/** `serverBuild` as §2.1 defines it. Recorded whole; never parsed, never compared. */
export interface ServerBuild {
  id: string;
  source?: string;
  dirty?: boolean;
}

export interface ServerIdentity {
  /** Exactly what arrived, or null when the server sent nothing usable. */
  implementation: string | null;
  /** Provenance only. §2.1: opaque — "compare for equality only, never parse". Aurora does neither. */
  serverBuild: ServerBuild | null;
  verdict: ServerIdentityVerdict;
  /**
   * Non-null exactly when the connection must be refused. The caller throws
   * this; it is a sentence, because "which emulator answered" is a question a
   * user can act on only if the answer names the two candidates.
   */
  refusal: string | null;
  /**
   * Non-null when something is worth saying and is NOT a refusal. Carried on
   * the handshake and surfaced in the status payload rather than logged into
   * the void — an unrecognised lineage that nobody ever sees is the same
   * silence this module replaces.
   */
  warning: string | null;
}

/** A one-line provenance string for logs and harness output. Never compared. */
export function describeBuild(b: ServerBuild | null): string {
  if (!b) return '(no serverBuild)';
  const dirty = b.dirty === true ? ' DIRTY' : '';
  return `${b.id}${b.source ? ` (${b.source})` : ''}${dirty}`;
}

interface InitializeIdentityFields {
  implementation?: unknown;
  serverBuild?: unknown;
}

function readBuild(raw: unknown): ServerBuild | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== 'string' || b.id.length === 0) return null;
  return {
    id: b.id,
    source: typeof b.source === 'string' ? b.source : undefined,
    dirty: typeof b.dirty === 'boolean' ? b.dirty : undefined,
  };
}

/**
 * Classify an `initialize` result. Pure, so the refusal can be proven without
 * a socket, and so the three verdicts can each be exercised on their own — a
 * row that only asserts "something refused" cannot tell which rule did it.
 */
export function identifyServer(init: InitializeIdentityFields): ServerIdentity {
  const serverBuild = readBuild(init.serverBuild);
  const raw = init.implementation;
  const implementation = typeof raw === 'string' && raw.length > 0 ? raw : null;

  if (implementation === null) {
    return {
      implementation: null,
      serverBuild,
      verdict: 'unidentified',
      refusal:
        'The Aether server did not say WHICH implementation it is. `implementation` is a required '
        + 'field of the initialize result (protocol.md §2.1), and without it Aurora cannot tell the '
        + `Rust core (${SUPPORTED_IMPLEMENTATION}) from the legacy C++ server — they resolve the same `
        + 'socket path and only the first to hold it answers. Refusing rather than guessing. '
        + `Build: ${describeBuild(serverBuild)}.`,
      warning: null,
    };
  }

  const supersededReason = SUPERSEDED_IMPLEMENTATIONS[implementation];
  if (supersededReason !== undefined) {
    return {
      implementation,
      serverBuild,
      verdict: 'superseded',
      refusal:
        `The Aether socket is held by "${implementation}" — ${supersededReason}. Aurora drives `
        + `"${SUPPORTED_IMPLEMENTATION}". Stop that server (or point ORACLE_SOCKET elsewhere) and `
        + `reconnect. Build: ${describeBuild(serverBuild)}.`,
      warning: null,
    };
  }

  if (implementation !== SUPPORTED_IMPLEMENTATION) {
    return {
      implementation,
      serverBuild,
      verdict: 'unregistered',
      refusal: null,
      warning:
        `The Aether server reports implementation "${implementation}", which this build of Aurora `
        + `does not know (it drives "${SUPPORTED_IMPLEMENTATION}"). That is either a protocol.md §2.1 `
        + 'registry amendment newer than this client — legitimate, and not a reason to refuse a '
        + 'session — or a server that is not what it claims. Proceeding, loudly. '
        + `Build: ${describeBuild(serverBuild)}.`,
    };
  }

  return {
    implementation,
    serverBuild,
    verdict: 'supported',
    refusal: null,
    // §2.1 requires `serverBuild` too. Its absence does not endanger a session
    // the way an unknown lineage does, but it is the provenance every harness
    // output and bug report wants, so say so once rather than print "(none)".
    warning: serverBuild === null
      ? `The Aether server identified itself as "${implementation}" but sent no serverBuild, which `
        + 'protocol.md §2.1 requires. Which build answered cannot be recorded for this session.'
      : null,
  };
}
