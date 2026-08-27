# Build & play — the short version

Everything below was run and verified 2026-08-27. Aurora master is clean and pushed.

## The editor

```sh
cd ~/sonic_hacks/aurora
npm run dev            # source-served, picks up master as it is
```

Open the project at **`~/sonic_hacks/aeon`** (your live tree — no pinned copies any more).

## Build the ROM

Aurora's **Build & Run** does this for you. From a terminal it is:

```sh
cd ~/sonic_hacks/aeon
SIGIL_BUILD=~/sonic_hacks/sigil/target/release/sigil \
SIGIL_EMIT=~/sonic_hacks/sigil/target/release/emit_sound_blob \
AEON_SKDISASM_DIR=~/sonic_hacks/skdisasm \
FAST=1 DEBUG=1 ./build.sh
```

Last verified build: `crc=8af3f36e`, 735,490 bytes.

## Put a fresh ROM in the running emulator window

```sh
cd ~/sonic_hacks/aurora
ORACLE_SOCKET=/tmp/oracle-aurora-trunk.sock \
  node scratchpad/load-debug-rom.mjs \
  ~/sonic_hacks/aeon/s4.debug.bin ~/sonic_hacks/aeon/s4.debug.lst
```

Reloads in place — it does not kill the window. `scratchpad/verify-running.mjs` prints
the frame counter twice if you want proof it is actually running.

**If Aurora's own Build & Run builds but does not reload**, it is the socket: Aurora
reads `ORACLE_SOCKET` from its OWN process env, not from `project.json`, and a
desktop-launched Electron inherits nothing from a terminal. Launch it with
`scratchpad/aurora-linked.sh` instead.

## Two rules that will save you a confusing build failure

1. **A layer top must be 3..223 ONLY IF that layer carries a vsplit** — a vsplit lowers
   to a raster fire and a fire lands on a real scanline. A plain band layer may sit
   anywhere in the plane's **0..511**.
2. **`v_factor: 15` is LOCKED, not "the biggest shift."** Locked means Plane B does not
   track the camera vertically — which is what makes vsplits legal. Unlocked (0..14)
   maps tops through `((camY - v_center) >> v_factor) + v_offset`, and then tops are act
   world Y instead of plane rows.

## The assembler warning is noise

`WARNING: THE ASSEMBLER MAY NOT MATCH ITS SOURCE` is non-fatal and expected: sigil is
deliberately not relinking that binary while aeon holds a freeze on it.
