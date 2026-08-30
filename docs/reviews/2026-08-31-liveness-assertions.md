# O26 + O28 + O32 + O33 — four artifacts that asserted a liveness they could not know

**Branch** `fix/liveness-assertions` · **2026-08-31** · aurora
**Commits** `b86b05ab` (O32 identity), `fc7d4a1f` (O28 discovery file),
`822aeb2a` (O26 method gate), `f6d0ffd6` (O33 reply shape), `c1950fd4` (window
icon probe)

Four queue rows, one defect class. Each artifact said something was current,
alive, or in effect on evidence that could not establish it. The fourth is the
one worth keeping: **the class is not only about servers.**

---

## 1. The class

> **An artifact asserts a liveness it cannot know when the evidence it rests on
> would look identical if the claim were false.**

That is the same sentence the X-display parcel arrived at from the other end —
*the failure state and the success state emitted the same artifact*
(`2026-08-30-xvfb-display-leak.md` §9b) — and these four are what it looks like
when the claim is about currency rather than about a guard.

| | The artifact claimed | What it actually had |
|---|---|---|
| **O26** | "the emulator is the current binary" | the advertised **count** equalled `35`. A count is not a capability; it moved four times (35 → 52 → 53 → 55) during this parcel. |
| **O28** | "Aurora is listening on this port" | a **file existed**. Nothing removed it on any abrupt exit, so it named a dead pid after every run. |
| **O32** | "connected to the emulator" | a socket **accepted a handshake**. The socket chain selects a path, not a server; `serverName` is a deployment label the protocol forbids discriminating on. |
| **O33** | "the section's background is assigned" (`changed: true`) | a ref was **written to an editor file**. No generator reads it; nothing bakes it. |

**The general question that catches all four:**

> *If this were false, what would I be looking at — and would it look any
> different from what I am looking at now?*

Answer it for each and the fix names itself. A count would look the same on a
correct binary (O26). A file left by a corpse looks exactly like a file left by
a live app (O28). A legacy C++ server accepts the same handshake as the Rust one
(O32). An editor-only binding returns the same `changed: true` as one that
reaches a ROM (O33).

**Two of the four also carry the corollary.** When you cannot tell, saying so is
the answer, and it must be a THIRD state — never folded into either of the
first two. `identifyServer` returns `unidentified` rather than defaulting;
`requiredAetherMethods` throws `UNMEASURABLE` rather than returning an empty
set that would pass; the icon probe prints `UNMEAS`, which is neither a pass nor
a failure.

---

## 2. O26 — a version pin that refused every correct binary

`classic-playtest-harness.mjs` row 0, the row whose entire job is to make every
row below it mean something:

```js
check('0', '… advertises 35 methods (post-parser-drop binary)',
  elog.includes('listening on') && methods === '35', …);
if (methods !== '35') throw new Error('stale oracle-aether binary — aborting');
```

**The count went 35 → 52 → 53 → 55 while this fix was being written** — the last
two an hour apart on the same afternoon, as the oracle lane landed features. So
the assertion was inverted with respect to its own stated purpose: it threw on
every correct binary and passed only on a stale one.

### The fix: derive the SET, check it against the server's own reply

`scratchpad/lib/aether-methods.mjs`. Two derivations, kept apart so a failure
says which side wanted the method:

- **observer** — every `observer.call('emulator/…')` site in the harness file,
  plus the indirections a literal scan cannot see. There is exactly one:
  `observer.resolve()` issues `emulator/lookup_symbol`, and the harness never
  spells it. Listed with its reason rather than guessed — a regex cannot look
  through a method name.
- **client** — every `'emulator/…'` literal under `src/main/aether/` (tests
  excluded): what the **app under test** can put on the socket. A CDP harness
  drives the real Aurora, so the live-palette rows need `write_memory` and Build
  & Run needs `reload_rom` even though no harness line names either.

6 + 10 = 10 distinct, against 55 served. Row 0 now connects the observer FIRST
and reads its handshake, so the check runs against the list the server actually
advertised rather than a banner regex.

**`implementation` and `serverBuild.id` are RECORDED and compared against
nothing.** §2.1 calls the build id opaque and it carries profile, target and
features, so it moves on a documentation commit — an equality check there would
have been this same defect one level up.

### `npm run harness:aether-method-gate` — 9/9, against a real `oracle-aether`

```
PASS [d1] the derivation is non-empty on BOTH sides, and says how many came from where
PASS [d2] the observer half really reads THIS FILE, and the client half really adds to it
PASS [w1] the harness itself uses the derived gate, and the `=== '35'` pin is gone from its code
PASS [d3] the resolve() indirection is included — a method the harness needs and never spells
PASS [u1] an empty scan THROWS by name on every side — it never returns a set that would pass
PASS [g1] against the LIVE server: every derived requirement is advertised
PASS [g2] the same handshake records WHICH core and WHICH build
PASS [r1] RED CONTROL — a requirement the server does not serve is reported MISSING BY NAME
PASS [x1] the pin this row replaced (`methods === '35'`) REFUSES this correct binary
```

`[x1]` is the defect demonstrated rather than described: the old rule, evaluated
against the live server, is `false`.

### Two rows were wrong when first written, and both are the parcel's own lesson

- **`[d2]`** asserted `observer ⊆ literals-in-harness` and went red, because the
  indirect method is *by construction* not a literal in that file.
- **`[w1]` stayed GREEN over a plant that restored the pin.** It scanned for
  `methods === '35'`; the plant wrote `bannerCount !== '35'`. **The row was
  matching a variable name, not the mistake.** It now refuses any comparison of
  a `*count`/`*methods`/`*advertised` identifier against a constant, proven red
  by both spellings. It also needed comments stripped first — the row-0 header
  quotes the old rule on purpose, and the raw scan reported a pin in code that
  no longer had one.

---

## 3. O28 — a discovery file whose presence was read as liveness

`~/.aurora/mcp.json` publishes the port and the PID of a running Aurora.
Removal hung off Electron's `will-quit` — the graceful exit and nothing else. A
`SIGTERM` (how every CDP harness ends a run, how a session manager ends an app)
terminates node without running it.

Verified before touching anything: the file named **pid 1383435**,
`/proc/1383435` did not exist, and nothing was bound on 38473. A previous
session closed this as a one-time cleanup; the cause was never fixed.

### Both halves, because neither is sufficient

**The writer** (`src/main/discovery-file.ts`, new, no electron import so it is
testable) installs an exit net over `exit` + `SIGINT`/`SIGTERM`/`SIGHUP`. Each
signal handler **uninstalls itself, cleans up, and re-raises the same signal** —
installing a SIGINT listener in node suppresses the default termination, and a
handler that only cleaned up would trade a stale file for an **unkillable
editor**.

**The reader**, because SIGKILL and a power cut are coverable by no writer.
`harness-guard.mjs` gains `livenessOf()`, and `describeDiscovery()` annotates
every printed line. Five harnesses print that line; a bare pid reads as "Aurora
is on 38473" to everyone who has ever looked at one. It is already visible in
this parcel's own runs:

```
guard: discovery snapshot taken before launch:
        /home/volence/.aurora/mcp.json 203B [pid 1383435 DEAD — STALE FILE] "{…}"
```

`resolveOwnedDiscovery()` now refuses a dead pid **in its own words** before
blaming descent. Descent would have refused it anyway — a corpse is in nobody's
`/proc` tree — but in the wrong words, and a refusal that misnames its reason
sends the reader somewhere else. Same lesson as the X parcel's §9a: it is not
enough that *something* refused.

### Readers found

| Reader | Verdict |
|---|---|
| `resolveOwnedDiscovery()` (harness-guard) | already correct — ownership by descent; the wording improved |
| `describeDiscovery()` / `readDiscoveryNow()` — 5 harness call sites | **fixed**: every line now carries `ALIVE` / `DEAD — STALE FILE` |
| `docs/MCP.md` § Connect, `README.md` | **fixed** — both told a human to use the port with no liveness caveat |
| `docs/MCP.md` § Discovery file | already said to check the pid; now says why, and what the writer does and does not cover |
| every other `scratchpad/` mention | a comment saying it no longer reads the file — `G3` forbids hand-reads |

### `npm run harness:discovery-exit-net` — 7/7, real signals to a real process

No Electron, no X: `discovery-file.ts` is bundled with esbuild and driven
directly, with `HOME` redirected to a temp dir.

```
PASS [n1] the discovery files EXIST while the child is up — the rows below are REMOVALS
PASS [r1] RED CONTROL — WITHOUT the exit net, SIGTERM leaves BOTH files
          left=2/2 exit={"signal":"SIGTERM"} · [pid 4132855 DEAD — STALE FILE]
PASS [g1] SIGTERM with the net: NO file survives, and the child still dies OF SIGTERM
PASS [g2] SIGINT: same
PASS [g3] a normal process.exit(0) — the `exit` listener, not the signal handlers
PASS [h1] SIGKILL leaves the files — no writer can cover it
PASS [h2] livenessOf calls h1's actual leftover DEAD, a live pid ALIVE, never blank
```

`[h1]` is a row rather than a footnote on purpose: the limit is why the reader
half exists.

### The plant that hung the instrument

Removing the re-raise turned the proof into an **infinite wait** — the child
swallowed SIGTERM and never exited. An instrument that reports a regression as
"still running" forever cannot fail, which is no better than a check that cannot
go red. Every wait is now bounded, SIGKILLs, and fails the row naming the cause:
`THE CHILD SWALLOWED SIGTERM: cleanup without a re-raise is an unkillable app`.

---

## 4. O32 — the row contained a category error, and it was the finding

The ask was "default to the new Oracle". **There is no port and no server
selector to change.** `src/main/aether/socket-path.ts` resolves one unix socket
path (`ORACLE_SOCKET`, `EXODUS_SOCKET`, `$XDG_RUNTIME_DIR/oracle.sock`,
`/tmp/oracle.sock`); a whole-client grep for port/host/localhost returns
nothing. **Whoever holds the path first answers**, and no client config can
change that. "Default to the new one" is unenforceable as stated.

What is real is asserting **what answered**.

### `serverName` was never a discriminator, and the code said it was

`client.ts`'s comment read: *"`serverName` IS a real discriminator today and not
an invented one."* The contract says the opposite. `empyrean/contract/protocol.md`
§2.1 (registered 2026-08-26 by §11.23) makes `serverName` a **deployment** label
a config may set, wanted distinct for two processes of one implementation, and
*"MUST NOT be used to discriminate implementations"*. The Rust core still
reports `oracle-next` there.

`oracle/crates/oracle-aether/src/build_info.rs` names this repo directly:

> *"This repo's own suite was doing precisely that (pinning
> `serverName == "oracle-next"`) until §11.23 landed."*

One row in `unserved.test.ts` was doing it, calling `serverName === 'oracle'`
"the other discriminator the two implementations differ on". It now asserts the
opposite property — that the lineage survives the rename.

### What the assertion really is, and why a rename cannot break it

`src/main/aether/server-identity.ts` reads `implementation`, §2.1's registry
value (`oracle-rs` | `oracle-cpp`), "extended only by amendment". Four verdicts,
because three of the alternatives are genuinely different situations:

| Verdict | Meaning | Action |
|---|---|---|
| `supported` | the lineage this Aurora drives | connect |
| `superseded` | a registry lineage ruled out (`oracle-cpp`) | **REFUSE** |
| `unidentified` | no `implementation` at all — cannot tell the two cores apart | **REFUSE** |
| `unregistered` | a lineage this build has not heard of | **LOUD, NOT FATAL** |

**A DENYLIST, NOT AN ALLOWLIST, and that is the rename-proofing.** The rename
axis in this protocol is `serverName`, which this module never reads: rename the
deployment to anything — including to the legacy server's own name — and every
verdict is byte-identical (asserted, six names including `undefined`). The only
thing that moves `implementation` is a §2.1 registry amendment, which is
legitimate and must not cost a user a session — so it is `unregistered`, and
`unregistered` proceeds.

Recorded on the handshake, in the one-line handshake log, in the IPC status
payload, in the renderer store, and in the agent's `aether_status` reply.

### Five plants, each restored

| Plant | Result |
|---|---|
| drop the client's refusal throw | both client refusal rows RED |
| empty the denylist | SUPERSEDED rows RED (`'unregistered'` instead) |
| make `unregistered` a refusal (an allowlist) | the LOUD-NOT-FATAL rows RED |
| read `serverName` instead of `implementation` | the rename row RED, naming the leak: `implementation: 'oracle-next'` |
| pin `serverBuild.id` for equality | exactly ONE row RED — its only witness |

The two existing fixtures omitted `implementation` and so described a server
nobody ships; corrected with shapes measured off a live `oracle-aether`. That
25 tests went red on the first run **is** the evidence the refusal has teeth.

### The window icon: 4/4 and one honest UNMEASURABLE

`npm run harness:window-icon` drives the real app on the **main-process** CDP
target and asks the running process whether it can decode the icon at the path
its own `app.getAppPath()` resolves — non-empty, 512x512, matching the file's
IHDR, with a red control on a path that does not exist.

**A CDP screenshot cannot answer this**, and saying so is the point:
`Page.captureScreenshot` captures the page, the icon lives on the window, and
under Xvfb there is no window manager and so no titlebar to photograph. A green
screenshot would have been the same artifact for "it works" and "I could not
look" — the defect, committed in the act of proving the defect.

`[x1]` is printed as a third state, `UNMEAS`: whether the window server ends up
holding `_NET_WM_ICON` could not be read here (no WM, so `_NET_CLIENT_LIST` is
empty; no window-tree enumerator installed — `xwininfo`, `xdotool`, `wmctrl`,
`xlsclients` all absent; and `getNativeWindowHandle()` returns `01 00 00 00`
under this Ozone backend, not a usable XID). **Electron loads the icon; a
taskbar drawing it is unproven and tagged for foreground follow-up.**

⚠ Found doing it: **`delete env.DISPLAY` is not enough on a Wayland desktop.**
Electron's Ozone backend takes `WAYLAND_DISPLAY`, and the owner runs Wayland, so
a launch can land on his screen instead of our Xvfb. This probe deletes it and
sets `ELECTRON_OZONE_PLATFORM_HINT=x11`. **Whether the existing launchers
actually leak that way is NOT established** — flagged, not asserted.

---

## 5. O33 — the class is not only about servers

`assign_section_bg` returned a success reply for a binding **nothing bakes**.
The assignment is real — the ref is written, one undo step, the sidecar persists
it, the viewport composites it — and it reaches no ROM. No aeon generator reads
a per-section `bgLayoutRef`, the effects generator says so by name, and every
section of the shipped act still carries `sec_bg_layout: default`. So an agent
calls the tool, reads `changed: true`, and reasonably concludes the background
is in the game.

**No server, no socket, no process — and the same defect.** A reply that asserts
an effect it cannot know reached anything. This is the row that makes the class
a class rather than a note about emulator plumbing.

`list_effects_presets` had already solved the shape: a sentence where the scene
tools have a per-section column, because an all-nulls column reads as "assigned
to nothing" rather than "there is no assignment to make". Mirrored — with **one
difference that matters**: the preset tool omits its column because it would be
all-nulls forever, while `list_bgs`'s column IS meaningful. Copying the omission
would have **deleted** information an agent uses. The sentence travels *beside*
the column, never instead of it.

The words live in `src/core/formats/bg-binding.ts` — in `core/`, not beside
`PRESET_LIMITS` in `renderer/providers/`, because the published tool
**descriptions** (`editor-methods.ts`, main process) read the same constant and
main must not import the renderer. An agent reads the description before it ever
sees a reply.

### The plant that stayed green is the one that matters

Reply shape only; nothing about what is stored changed. A plant that returned
early **without executing the command** — the tempting out-of-scope "fix" —
left **every wording row green** and turned five behaviour rows red. That is
why half the new rows assert the behaviour did not move, and why the panel's
"Background" select was left alone: it has no equivalent wording to mirror, and
giving it a hint slot is a UI change this parcel did not take. Recorded as a gap
a future change can close in one line rather than by re-authoring the sentence.

---

## 6. Verification

| What | Result |
|---|---|
| `npm test` | **429 files passed / 2 skipped**, **5848 tests passed / 7 skipped, 0 failed** (baseline `2026-08-30`: 426 / 5817; +3 files, +31 rows = 14 identity + 9 discovery + 8 bg-binding) |
| `npm run check:harness-guards` | `156 clean / 156 classified (153 .mjs + 3 .sh) · 0 failure(s) · 0 unmeasurable` |
| `npm run harness:aether-method-gate` | **9/9**, real `oracle-aether` |
| `npm run harness:discovery-exit-net` | **7/7**, real signals |
| `npm run harness:window-icon` | **4/4 + 1 UNMEASURABLE**, real app under main-process CDP |
| `tsc --noEmit`, `npm run build` | clean |

Machine uptime at measurement: **4 days 15:34**. No emulator MCP tool was
called; every `oracle-aether` used here was spawned by the instrument that
killed it. **The owner's `~/.aurora/mcp.json` and its legacy twin were restored
byte-for-byte** (203 B each, the same dead pid 1383435 they carried at dispatch)
after unguarded ad-hoc probe runs left a different dead pid in them.

⚠ **The full `classic-playtest-harness.mjs` was NOT run.** It needs a built
`dist/`, an `electron` binary an agent worktree does not have, and it builds
inside `s1disasm`. Row 0's logic is proven against the real server by the gate
proof; rows 1–9 are untouched.

---

## 7. Still open

1. **The window icon is not proven to RENDER** — §4, `[x1]`. Foreground work:
   run Aurora in a real session and look.
2. **Whether existing launchers leak onto the owner's Wayland compositor** is a
   hypothesis, not a measurement (§4).
3. **The Properties panel does not say where a section BG binding stops** (§5).
   One line, once the select grows a hint slot.
4. **`serverName` remains in the status payload and the agent reply**, labelled
   as the deployment label it is. Removing it is a separate call: it is what a
   person named their process, and that is worth showing.
