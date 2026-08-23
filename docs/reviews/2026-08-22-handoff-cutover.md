# Handoff — written for the session that boots into the emulator cutover

*2026-08-22. Written deliberately for a **specific** reader: the fresh Aurora overseer who boots
after the owner flips `mcp__oracle__*` from the legacy C++ server to oracle's Rust core and
relaunches every lane. **Aurora is the only tool in the suite that dials OUT on the bus**, so it is
the one that will notice first if anything is wrong.*

Queue is `docs/ROADMAP.md` §5.1 as always; this file is only what a boot into that moment needs and
that the queue does not say.

---

## 1. The cutover, and why a `/clear` is not enough

**Which server answers is decided by whoever launched a process on the socket chain first — not by
any config.** Both servers resolve `$ORACLE_SOCKET` → `$EXODUS_SOCKET` → `$XDG_RUNTIME_DIR/oracle.sock`
→ `/tmp/oracle.sock`. So a session can silently change which implementation it is talking to **with
no config change and no signal**.

**The MCP shim and the Aether server are independent, and only one of them is config.** This session's
`mcp__oracle__*` ran **oracle-old's Python shim** — a *client* — and every call it made reached a
**Rust `oracle-aether`**. Proven, not assumed: the Rust binary was launched from Aurora's cwd with a
**relative** argv and `emulator/status` echoed exactly that back, while the C++ process on the same
machine carries an absolute path. **A legacy shim already drives the Rust core; nobody had tested it.**

Consequences for you:

- The shim path is on the **process command line**, so a config change cannot reach a running session.
  **A full restart is required — `/clear` will not do it.**
- The banner's method count is the freshness tell. The release binary bannered **37** while source
  served **41**; it predated four landed methods. **A consumer measuring the bus against an installed
  binary gets the old answer with nothing announcing it.**

## 2. What the client now does when a method is unserved — and what it still does not

Landed as item 33 (`fix/aether-unserved-methods`). **`MethodNotServedError` carries `method`, `code`,
`detectedBy`, and BOTH detection routes are wired:**

1. **A pre-check against the advertised list** — no round trip, and critically **a doomed call never
   reaches a sequence that pauses the machine on its way down to failing.** A paused machine is a
   *state change* caused by a call that was always going to fail.
2. **A `-32601` reply mapped to the same class** — the advertised-but-unimplemented shape the list
   cannot see. Verified message shape from the real binary:
   `"no such method: emulator/write_vram"`.

Under oracle's CR-C item 23 (`methods` becomes a **warranty**), route 2 stops being a discovery
mechanism and becomes a **defect detector**. Keep it. That is its better use.

**Call sites that still default — enumerated, and each is a deliberate ruling, not an oversight.**
All 20 catch sites in `src/main/aether/` were enumerated *by what catches a bus call*: 11 made loud,
5 already loud, 4 ratified legitimate. The ones that still default:

- **A dead link still defaults quietly, everywhere.** That is correct: if the link is down nothing
  gets reloaded, pushed or warped anyway.
- **`build-run.ts` restore read** — behaviour still defaults (a build must not fail because the
  player's position could not be read), but the *reason* is now named. "No symbols" is a claim about
  the artist's listing and must not stand in for "the bus did not serve it".
- **`bridge.ts` aeon→classic fall-through** — a **legitimate discriminator**, kept. A failed
  `Pal_Base` resolve is genuinely *how the probe learns the listing is not aeon's*. Only the unserved
  arm is split off.

## 3. ⚠ The Build & Run `romPath` probe — not a bug today, latent with a named trigger

`build-run.ts` asks `emulator/status` for `romPath` to decide **which ROM flavour to build**. Read
that block's own comment: building the release flavour while the debug ROM runs reloads a file the
build never touched, the game comes back byte-identical, and the edit appears to have done nothing —
*"which is exactly what the owner saw."*

**oracle confirmed from the wire that `status.romPath` comes back RELATIVE** (`"../aeon/s4.debug.bin"`),
which is a **SHOULD-violation of their own `protocol.md:1799`** — whose stated rationale is that a
client who cannot see the path cannot tell which build it is looking at.

**Checked here, and it is currently safe, for a reason worth understanding rather than memorising:**

- The **flavour decision** is `runningRom.endsWith('.debug.bin')` — a **suffix test**, so relative is
  irrelevant to it.
- `romPath` and the `symbolsPath` derived from it by stem-swap are **only ever sent back to the
  server** (`reload_rom`, `load_symbols`) and returned in the result. **Round-tripping the server's own
  string to the server is safe** — it resolves in the same cwd that produced it. Arguably safer than
  absolutising it from Aurora's cwd, which need not be the same.

**The latent trap, which is the thing to carry:**

```
const romPath = runningRom ?? join(plan.cwd, plan.romPath);
```

**`romPath` is ABSOLUTE when derived from the plan and RELATIVE when it came from the server, and the
two are indistinguishable downstream.** Nothing resolves it locally today. **The first `existsSync`,
path comparison, or display added over it becomes wrong depending on a branch nobody can see** — and
it will be wrong only in the arm where a server happens to have been launched with a relative argv,
which is the arm that is hardest to reproduce deliberately.

## 4. Things that are true and easy to get wrong

- **`serverName` and `serverVersion` are BOTH config fields with hardcoded defaults.** Neither is
  identity. `serverVersion` is pinned `"0.0.0"` and has **never moved**. Aurora records both and
  **branches on neither** — 48 references, not one a comparison. Keep it that way until oracle's
  `serverBuild` lands, then **remove** the `methodCount` reliance rather than keeping it as
  belt-and-braces; it is booked as a workaround with a removal condition, not a convention.
- **A key-presence sniff on `romPath` would discriminate the two servers today** (legacy emits the key
  not at all). **Deliberately declined.** It would work, be undocumented, and outlive the parcel that
  obsoletes it — an unowned behavioural dependency on a field's *absence*.
- **Classify every item in `OVERSEER.md`'s coordination points as an ENGINE fact or a SERVER fact
  before trusting it.** Engine facts (live palette, warp mailbox, boot override, DEBUG debug-fly, boot
  zeroing work RAM, build flavours, the staleness gate) are unaffected by the cutover. Server facts
  (the two-message handshake, `require_paused`, fresh-headless-paused-at-frame-0, post-`reload_rom` RAM
  persistence, `reset` on the hosted build, the `.lst` third-`EQU` parser) are exposed and **each needs
  the implementation named beside it**. The `require_paused` list there was re-derived from oracle's
  **Rust** source and is **not known to hold on the legacy C++ server**.

## 5. The failure mode to watch for, and what to do

**Once the new server is the only one reachable, every failure presents as *Aurora* being broken**,
and the cheap path is bending the client around gaps. **Report the wall instead.** The owner's standing
directive: an instrument gap is a **named ask to the oracle lane**, not a workaround —
*"tell it to make sure to tell the oracle agent to build out any tools these other suite items/agents
might need, that's how we're getting robust."*

Sort every gap **satisfied-by-their-in-flight-work / composable-today / genuinely-new**; only the last
crosses the fence. `docs/reviews/2026-08-22-oracle-instrument-gaps.md` is the worked example — 19 gaps,
**one** genuinely new. An empty genuinely-new list is a good result; padding it costs another lane real
work.

**And escalate immediately if you ever get a plausible-looking answer from something that should not be
able to answer. That is strictly worse than a refusal**, and it is the one thing that will not announce
itself.
