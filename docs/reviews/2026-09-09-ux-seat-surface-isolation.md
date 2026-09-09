# Isolate the SURFACE, not the process

**Branch** `parcel/ux-seat-surface-isolation`, base `d9fbf105`.
**Runner** `npm run harness:surface-isolation` → `scratchpad/surface-isolation-proof.mjs`.

The suite's shared isolation proof asks *"is there nothing on `:0`?"*. On a Wayland desktop that
reads **clean during the exact escape it is supposed to catch**. The oracle lane's 2026-08-29
record has all four facts at once: `DISPLAY=:91` set, the window **on the owner's real screen**,
the log saying `Wayland window`, and python-xlib finding **zero windows on the Xvfb**. "Nothing on
`:0`" was true and meant nothing, because the escape route was not X11.

So the question this parcel answers is not *which display variable did we set* but **which
display-server sockets is this process tree actually holding open right now**. An environ read is
a statement of intent; it cannot distinguish *"I set this"* from *"this took effect"*, and
`HAZARD 5` in `scratchpad/lib/harness-guard.mjs` is precisely the case where those two came apart.

---

## 1. The peer advice, and what of it held here

The brief carried two corrections from the oracle lane, both already measured in `HAZARD 5`, and
**both held**. Neither was re-derived by experiment on a windowed app:

- **`XDG_RUNTIME_DIR` at private scratch** is right about the mechanism — `wl_display_connect(NULL)`
  falls back to the literal `wayland-0` under it — and unusable as a remedy: Electron did not fall
  back to X11, it printed `Failed to connect to Wayland display` and **segfaulted (exit 139)**.
  Safe, because it fails closed; no run, because it fails.
- **`ELECTRON_OZONE_PLATFORM_HINT=x11` and `--ozone-platform-hint=x11`** do not work on Electron
  v41.2.1. `--ozone-platform=x11` is the one thing that does.

**What this parcel used the first of them for anyway:** `compositorSocketPaths()` derives the path
to test *for* from `XDG_RUNTIME_DIR` **and** the literal `wayland-0`, precisely because the
fallback exists. A check that only knew `$WAYLAND_DISPLAY` would go clean against the exact
fallback the hazard note warns about — see row `[r2]`, where it does.

**Where the advice does not reach:** it is all about the *remedy*. The half that was broken is the
*verification*, and that is what is built here.

---

## 2. What was measured

### 2.1 The finding: the obvious version of this check goes GREEN over an escaped app

The first draft resolved each fd's socket inode straight out of `/proc/net/unix`, on a
**measured but inverted** belief: that a client keeps the pathname it connected to. A node
server with one client connected puts three rows in the table —

```
St 01 inode A  /…/probe.sock     the LISTENING socket
St 03 inode B  (no path)
St 03 inode C  /…/probe.sock
```

— and read off inode order, `C` looks like the client. **It is the other way round.**
`unix_stream_connect` copies the listener's address onto the newly **accepted** socket; the
connecting client's own socket is never bound and carries no address at all.

Measured on the real thing rather than the toy: a window-less Electron launched the
pre-2026-08-30 way put **two fresh `/run/user/1000/wayland-0` rows** in `/proc/net/unix`, and
**not one fd anywhere in our own process tree pointed at either of them**, stable across 8 samples
over 20 s. Those two rows are the **compositor's** accepted ends. The escaping app's own fds were
`St 03` rows with no path, indistinguishable from the dozen mojo socketpairs beside them.

**Both halves of that draft were wrong in the same direction — towards a pass:**

1. the escape was invisible, because the client end has no address; and
2. a "presence" was nevertheless available, because the **Xvfb we launched is inside our own tree**
   and holds its own listening socket. So the verdict read `ISOLATED` — with the app sitting on the
   owner's compositor and never having spoken to the Xvfb at all.

It was caught **only because the RED row is required to reproduce and refused to**. A proof whose
red is optional would have shipped this.

**The fix.** `unixPeerMap()` reads the kernel's `unix_diag` table (`ss -x -a -n`) for
inode → peer inode; the *path* still comes from the single `/proc/net/unix` reader, so there is no
second place a path can be spelled differently. `surfaceCensus` now resolves an fd two ways —
`direct` (we are the listener or accepted end: this is how the Xvfb appears) or `peer` (we are the
connecting end: **the only way an escape is visible**) — and `surfaceVerdict` requires the positive
presence to come from a process that is **not** the Xvfb.

### 2.2 The rows

Full run, all rows, `14/14`, **elapsed 15.6 s — box uptime 59.5 h, load 23.00 22.74 17.82**.

| row | what it measures |
|---|---|
| `[r1]` | RED, window-less: the unpinned launch holds a live compositor connection |
| `[r2]` | **the thesis**: the environ read says isolated, the socket says escaped |
| `[g1]` | GREEN, window-less: guarded launch holds our X socket, no compositor |
| `[s1]` | **safety interlock** on the argv about to carry a window |
| `[w1]` | WINDOWED: a real Aurora enumerated **on our Xvfb** |
| `[w2]` | WINDOWED: that live tree holds our X socket and no compositor socket |
| `[n1]` | the window census reports blindness, not emptiness |
| `[b1]`–`[b7]` | every way this instrument can fail to look, each landing on UNKNOWN |

**`[r1]`** — the pre-2026-08-30 shape (`{...process.env}`, `delete env.DISPLAY`, under `xvfb-run`,
no Ozone flag), window-less:

```
pid 4167374 fd 41 -> /run/user/1000/wayland-0 (peer via peer inode 237998501)
pid 4167374 fd 42 -> /run/user/1000/wayland-0 (peer via peer inode 237998503)
verdict ESCAPED
the app ALSO reported it could see: 2844x1600@1.3502110242843628, 1920x1080@1
   (we asked Xvfb for 1001x777)
```

The second line is `HAZARD 5`'s own instrument agreeing: those are the owner's two real monitors.

**`[r2]`** — the same, with `WAYLAND_DISPLAY` deleted **as well**:

```
environ audit of the live app: DISPLAY=:101 WAYLAND_DISPLAY=null
   — a proof reading this concludes "no Wayland".
pid 4174160 fd 41 -> /run/user/1000/wayland-0 (peer via peer inode 238001756)
pid 4174160 fd 42 -> /run/user/1000/wayland-0 (peer via peer inode 238001758)
verdict ESCAPED
```

(All four blocks in this section are from the **same** `14/14` run, so the pids are comparable
across rows.)

**This is the parcel in one row.** Every variable an environment audit would read is clean. The
connection is there anyway.

**`[w1]`/`[w2]`** — the case `HAZARD 5` could only infer:

```
census of :101 — screen 1001x777 (asked Xvfb for 1001x777); 4 window(s),
   the app's is id 2097155 1000x776+0+0 viewable=true name="Aurora"
   class=["electron","Electron"]

11 process(es) in the tree, 19 named unix socket(s) held
   pid 4180783 fd 41 -> /tmp/.X11-unix/X101 (peer via peer inode 238033263)
   pid 4180783 fd 42 -> /tmp/.X11-unix/X101 (peer via peer inode 238038181)
   pid 4181003 fd 18 -> /tmp/.X11-unix/X101 (peer via peer inode 238021587)
   …
verdict ISOLATED
```

`[w1]` is a **presence**, deliberately: an isolation proof that only asserts *"nothing over there"*
passes just as well when nothing started at all. The screen geometry is asserted against the same
two constants handed to `xvfb-run`, so "we enumerated the right server" is derived, not assumed.

---

## 3. The red, three ways

**(a) The permanent red rows.** `[r1]` and `[r2]` are not one-off demonstrations; they run on
every invocation, and if the unpinned launch ever *fails* to reach the compositor the file reports
`UNMEASURABLE` and fails, in as many words: *"the [g1] row below therefore proves NOTHING here and
must not be read as a pass."*

**(b) The mutation, on disk, before its red run.** `pinOzoneToX11` neutered to the
pre-2026-08-30 behaviour:

```diff
 export function pinOzoneToX11(cmd, args) {
+  return args;                                      // MUTATION: pre-2026-08-30
   const a = [...args];
```

Run **`--windowless-only`**, `10/12`, exit 1. `[g1]` flipped from `ISOLATED` to:

```
pid 84407 fd 41 -> /run/user/1000/wayland-0 (peer via peer inode 238282718)
pid 84407 fd 43 -> /run/user/1000/wayland-0 (peer via peer inode 238282721)
verdict ESCAPED
```

and `[s1]` went red naming the position (`--ozone-platform=x11 at -1 (want 4)`). Restored with
`git checkout HEAD -- scratchpad/lib/harness-guard.mjs` from the committed baseline `e89ee80c`;
tree verified clean and the marker gone.

**(c) The interlock, watched refusing — without the mutation.** `[s1]` is a *safety interlock*,
not an assertion: it inspects the exact argv about to carry a window and **refuses the windowed
rows** when the pin is absent. Proving that by mutating the guard and then running the windowed
rows would leave an unpinned windowed Electron one interlock-bug away from the owner's live
desktop — **the interlock is the thing under test, so it cannot also be the thing relied on.** So
`SURFACE_PROOF_FORCE_UNPINNED=1` falsifies only the proof's own view of the argv, leaves the guard
intact, and the refusal branch spawns nothing:

```
FAIL     [s1] electron at 3, --ozone-platform=x11 at -1 (want 4)
REFUSED  [w1] the Ozone pin is absent or misplaced, so launching a WINDOWED app would
              risk putting it on the owner's live session. Refused rather than run.
REFUSED  [w2] see [w1] — no windowed launch happened.
```

`11/14`. No window was launched.

---

## 4. Safety, and what was declined

The owner's desktop session is live on this box.

- Every launch goes through `spawnGuarded` **except** `[r1]`/`[r2]`, which must not (a guarded red
  is a comparison against itself) and are **window-less**: they drive `lib/ozone-probe-app`, which
  creates no `BrowserWindow` at all, so an Electron that attaches to his compositor still presents
  nothing to it. That is `HAZARD 5`'s own precedent, followed exactly.
- `/dev/uinput` untouched. No `xdotool`, `ydotool`, `wtype`, `dotool`, `xte`. **This proof
  dispatches no input at all.**
- The only display it ever names comes from the argv of an `Xvfb` **inside its own process tree**
  (`displayArtifacts`), never from a `DISPLAY` variable. `xvfb_window_census.py` takes the display
  as a required argument and has **no default**; there is no code path in it that reaches `:0`.
- The compositor socket path is derived from **our own inherited environment**
  (`XDG_RUNTIME_DIR`/`WAYLAND_DISPLAY`). His runtime directory is never listed, globbed or
  stat'd to discover sockets we were not already told about. `unixPeerMap` reads a kernel table in
  which his compositor's accepted socket appears the same way ours do: as a number in a list.
- **Declined:** running the mutation with a window, in any form. See §3(c) for what replaced it.

---

## 5. ⚠ What remains inferred

`HAZARD 5`'s honesty about its own limits is the standard; these are this parcel's.

1. **The unpinned WINDOWED case is still not measured, and must not be.** Every red row here is
   window-less. That an unpinned *windowed* Electron would put a window on the owner's screen
   remains an inference — a very strong one (`[r1]` measures the connection; a window is what a
   connected client is for) but an inference. Nothing here should be read as having tested it.

2. **`ISOLATED` is a claim about unix-domain display-server sockets, and nothing else.** A TCP
   connection to a remote X display (`DISPLAY=host:0`) would resolve to no unix row and be counted
   as `unresolved`. Not reachable in this rig — `xvfb-run` starts its Xvfb `-nolisten tcp` and the
   census reports the unresolved count on every run — but it is outside what the verdict proves.

3. **It is a point-in-time reading, not a continuous one.** The census samples once, after the
   window appears. An app that attached to the compositor, was measured, and connected afterwards
   would pass. Nothing observed suggests Chromium does that (`[r1]`'s connections were stable
   across 8 samples / 20 s), but the instrument is a snapshot.

4. **The `unresolved` bucket is argued, not proven empty of compositor connections.** An fd whose
   inode appears in neither the socket table nor the peer map is treated as *not a path connection*
   — TCP, netlink, a socketpair. That follows from the mechanism in §2.1, and the count is printed
   on every run so it cannot grow unnoticed; it is not independently verified per fd.

5. **`ss` is a new hard dependency of this proof, and its absence is BLIND rather than a pass.**
   `unixPeerMap()` returns `null` when `ss` is missing or its output parses to nothing, and
   `surfaceCensus` refuses to answer — row `[b6]` drives that path. But the proof does not run on a
   box without iproute2, and nothing in `npm test` covers it.

6. **This proof is not wired into `npm test`,** deliberately: it launches Electron four times and
   takes ~16 s. It is a named runner (`npm run harness:surface-isolation`). Nothing forces the
   ~110 other harnesses in this population to run it, so the guarantee it establishes is about the
   *guard module they all share*, not about each of their runs.

7. **Only `HAZARD 5`'s comment was updated.** The suite's shared "nothing on `:0`" proof lives in
   another repo. This packet does not change it, and a reader of *that* proof still gets the
   answer this parcel exists to say is not evidence. **Tagged for foreground follow-up.**

---

## 6. What landed

| path | what |
|---|---|
| `scratchpad/surface-isolation-proof.mjs` | the proof, 14 rows |
| `scratchpad/lib/harness-guard.mjs` | `unixSocketTable`, `unixPeerMap`, `compositorSocketPaths`, `surfaceCensus`, `surfaceVerdict`, `xSocketPath`, `isXvfbProcess`; `boundSocketPaths` now derives from the one reader; `HAZARD 5` updated |
| `scratchpad/lib/xvfb_window_census.py` | python-xlib window census, blindness-reporting, no default display |
| `scratchpad/lib/ozone-probe-app/main.js` | `OZONE_PROBE_HOLD_MS` hold mode, still window-less |
| `package.json` | `harness:surface-isolation` |

Regressions green with the module changed: `check-harness-guards` **252/252 clean, 0 failures**
(this file classified as a launcher, declared `allow-raw-launch`), `harness-guard-proof` **16/16**,
`xvfb-reap-proof` **22/22**, `check-cited-paths`, `check-doc-citations`, `check-peer-path-literals`,
`check-prose-constants` all OK.
