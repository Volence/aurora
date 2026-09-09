import { create } from 'zustand';

/**
 * Aether bus connection status, surfaced in the status bar as
 * `Aether ◇ <status>` (Empyrean chrome convention).
 *
 * This was a placeholder reporting `offline` until Aurora became a bus CLIENT.
 * It now is: `aetherStore.apply` drives this from the real outbound link's
 * status pushes. The badge turns emerald when that link is up.
 *
 * Kept as its own store rather than folded into `aetherStore` because the
 * status bar is engine-neutral and must not import the client's surface — the
 * same rule that moved the indicator out of MapStatusBar in the first place.
 *
 * ── THIS STORE CARRIES NO IDENTITY, AND THAT IS THE FIX ────────────────────
 *
 * It used to hold a `peer: string | null` fed from the handshake's
 * `serverName`, and the badge rendered it as `connected · <peer>`. That was a
 * field whose own producer says it is not an identity: protocol.md §2.1 makes
 * `serverName` a DEPLOYMENT label a config may set and forbids discriminating
 * on it, oracle's `engine.rs` comment beside the field says it "stays a
 * deployment label, and stops being an identity", and `docs/OVERSEER.md`
 * already ruled for this repo: read `implementation`, never `serverName`.
 *
 * AND IT WAS WORSE THAN NON-IDENTIFYING: IT WAS A STALE CONSTANT. Verified in
 * oracle's tree at `aca9e9a` on 2026-09-09 — `server_name` has exactly two
 * sites, the struct field and its default, and NOTHING sets it. There is no CLI
 * flag and no config path that moves it, so every oracle deployment that exists
 * sends the same hardcoded string, and that string is `oracle-next`: the repo's
 * PRE-RENAME name, retired on 2026-08-19. The badge's whole identity segment was
 * a four-month-old repo name, identical on every machine. The `'oracle'`
 * fallback beside it was never reached at all, because the key is always sent —
 * a plausible-looking name kept alive for a branch that cannot be taken.
 *
 * The record that CAN answer that question already lives in `aetherStore` —
 * `implementation`, `serverBuild`, `socketPath`, `identityWarning` — so the one
 * component that displays it reads it from there. Nothing is duplicated here,
 * because a second copy is a second thing to leave stale.
 */
export type BusStatus = 'offline' | 'connecting' | 'connected';

interface BusState {
  status: BusStatus;
  setBusStatus: (status: BusStatus) => void;
}

export const useBusStore = create<BusState>((set) => ({
  status: 'offline',
  setBusStatus: (status) => set({ status }),
}));
