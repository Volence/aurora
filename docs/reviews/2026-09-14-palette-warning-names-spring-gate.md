# The palette line 0 warning also names the spring's character-swap check

**2026-09-14 · branch `fix/palette-warning-names-spring-gate` off master `98989d4b` · queue row
PALETTE-WARNING-NAMES-SPRING-GATE** (the ROADMAP row is added by the controller at landing)

## The ruling

Hub, verbatim (empyrean `origin/main` `docs/OVERSEER.md` line 217, carried by empyrean `8a7476f`):

> 2026-09-14T00:24:36Z - HUB RULING under his 2026-09-13T07:1xZ goodnight words (aurora's question
> on PALETTE-LINE0, landed aurora 411f385e): the top-row save warning ALSO names aeon's
> `tools/spring_line0_gate.py`. That gate checks the spring's seven colour slots render the same as
> Sonic and as Knuckles, deriving from `SonicAndTails.bin` and `knuckles.bin`, so an edit there
> makes the spring change colour on a character swap and turns the gate red until the Knuckles
> palette matches. A warning that omits the one consequence that fails a build is incomplete. Hub's
> call because it is WHAT the warning lists, never how it reads: wording stays aurora's. Whether the
> gate itself should change when he really edits that row is aeon's, on its own tool, when it
> happens.

This closes the first "Noticed, not fixed" item of `docs/reviews/2026-09-13-palette-line0-save-warned.md`.

## What changed

- `src/core/project/aeon/shared-palette-warning.ts`: `SPRING_LINE0_GATE_PATH`,
  `scanSpringGate`, the `SpringGateScan` result, and the gate's paragraph. `sharedLine0Warning`
  now takes the gate scan as a **required** third argument, so no caller can forget to look.
- `src/renderer/providers/palette-line0-gate.ts`: both searches (embeds and the spring check) run
  in parallel through the same two IPC channels. The embed search's inline closures became
  `projectLister(basePath, extension)` and `projectReader(basePath)`, shared by both.
- Out of scope, and why (property 4): the agent refusal (`AGENT_LINE0_REFUSAL`,
  `src/core/agent/validation.ts`, `b382cedc`) and the save toast (`src/renderer/state/aeon-save.ts`,
  `b46933e3`) never read the embed list. `palette-line0-gate.ts` is the only consumer of
  `sharedLine0Warning` and `scanEmbeds` (grep over `src`, `test` and `scratchpad`). Neither was
  touched, and there is no second list.

## The derivation path

The gate's **path** is the one fixed input, because the ruling names that file. Everything else is
derived at warning time from the open project, on the embed list's precedent:

1. **Presence.** The same `listProjectSources` channel the embed list uses (`LIST_PROJECT_SOURCES`),
   asked for the gate's own extension (`.py`, read off the path). The file is named only when the
   listing contains it.
2. **Relevance.** The gate's text must hold the RESOLVED shared path as a quoted literal. The embed
   search has the same rule ("`<path>` exactly the file the load read"). Under the `sonic.bin`
   fallback, a check that reads only `SonicAndTails.bin` is not this edit's, and is not named
   (`reads-other-file`).
3. **Partner palette.** The gate's other quoted literals in exactly the resolved path's folder,
   full-line `#` comments skipped. At aeon `6bd8ed89` (committed revision, `git grep`) the gate quotes
   `"art/palettes/SonicAndTails.bin"` (line 68) and `"art/palettes/knuckles.bin"` (line 69), and
   its docstring (line 18) names both unquoted. So the derived partner is `art/palettes/knuckles.bin`,
   and Aurora never types `knuckles.bin`. `art/palettes/sonic.bin` exists at that revision and is
   never quoted, so under the fallback the check is correctly not named.
4. **Could not look.** The embed list's convention: "Aurora could NOT check ...", with the reason,
   and no name the listing did not find. The following are unmeasurable:
   - a listing that throws;
   - an unreadable folder ABOVE the gate (`.` or `tools`);
   - a capped listing that did not find it;
   - a listed gate that cannot be read.

   An unreadable folder elsewhere cannot hide the gate, so it does not hedge an "absent" answer
   (M16).
5. **Not restated:** the spring's colour indices. The gate derives them from a nibble histogram of
   its art file, and Aurora does not repeat that derivation. The docstring's index list is not
   copied.

## The warning as rendered

Rendered through the real `sharedLine0Warning`, bundled with esbuild from this branch. The inputs are
the three embed sites and the derived partner at aeon `6bd8ed89`. `N` is the live `.emp` count. This
is the node rendering, not an on-screen capture; the on-screen run is the controller's (below).

**The project has the check** (new paragraph, between the embed list and the rebuild sentence):

> This project's check tools/spring_line0_gate.py also reads this file. It makes sure the spring
> looks the same whichever character you play, so the colours the spring uses on this row must
> match the same colours in art/palettes/knuckles.bin. If you change one of the spring's colours
> here, the spring will change colour when you switch character, and that check will fail until
> art/palettes/knuckles.bin is changed to match.

**The listing could not look** (example reason):

> Aurora could NOT check whether one of this project's own checks compares this row with another
> character's palette (the folder tools could not be read (EACCES: permission denied)). Assume an
> edit here may make such a check fail.

**The project has no such check, or it reads another file:** no paragraph. The body is
byte-for-byte the 2026-09-13 warning.

If the gate reads the file but has no partner literal in the folder, the name falls back to
"another character's palette file" (M13 pins that it is never empty).

**Wording call: "that check will fail", not "the build will fail".** At aeon `6bd8ed89` no build or
landing script invokes `tools/spring_line0_gate.py`. `git grep spring_line0_gate` over the whole
tree, excluding the gate itself, finds it only in `docs/`. Its handoff lists it as a check to run
for spring art. Saying the gate "fails the build" would be a claim Aurora cannot back. What aeon's
BUILD does refuse is recorded under "Noticed" below.

## Tests

`src/core/project/aeon/__tests__/shared-palette-warning.test.ts`: +10 rows, synthetic and in
memory. Each expected value is read off the planted gate text. The existing warning rows now pass
`{ kind: 'absent' }` through a `warn()` helper, and their assertions are unchanged.

`src/renderer/providers/__tests__/palette-line0-gate.test.ts`: +3 rows through the real gate,
stores and a loaded project, over in-memory listings. `listProjectSources` filters the in-memory
files by extension, and `rootUnreadableFor` makes one extension's listing report `.` unreadable.

No test reads a peer repo's working tree (review bar 19). The aeon facts above were read at the
committed revision `6bd8ed89` only.

### Red-first

Each mutation was written over `git show HEAD:<file>`, shown from disk (`git diff`), run against
the two test files, restored with `git show HEAD:<file> > <file>`, and checked with
`git diff --quiet`. Runner: `node <scratchpad>/redfirst.mjs`. It refuses a mutation whose `from`
text is not unique in the committed file.

Baselines:
- The first full pass ran at `b24c2062`.
- The second full pass, the one quoted here, ran at `35e66211`; source files are identical between
  the two.
- M16 and M17 ran at `35e66211`.

Every mutation restored clean.

| # | mutation (file) | red rows, assertion quoted |
|---|---|---|
| M1 | the named paragraph is never written (`shared-palette-warning.ts`) | 3: unit NAMED, unit NAMED-no-partner, e2e NAMED. `expected 'Heads up: …' to contain 'tools/spring_line0_gate.py'` |
| M2 | scan returns `present` where it found nothing | 2: unit ABSENT, e2e NOT NAMED. `expected { kind: 'present', …(2) } to deeply equal { kind: 'absent' }` |
| M3 | paragraph for every non-unmeasurable kind | 14, **by crash** (`TypeError: undefined is not iterable`). Not accepted as proof; see M3b |
| M3b | a well-formed named paragraph where it returned null | 2: unit NOT NAMED, e2e NOT NAMED. `absent: expected 'Heads up: …' not to contain 'tools/spring_line0_gate.py'` |
| M4 | unreadable folder above the check ignored | 2: unit UNMEASURABLE-above/capped (`unreadable .: expected { kind: 'absent' } to deeply equal { kind: 'unmeasurable', …(1) }`), e2e COULD NOT CHECK (`to contain 'could NOT check whether one of this p…'`) |
| M4b | capped listing ignored | 1: unit UNMEASURABLE-above/capped. `expected 'absent' to be 'unmeasurable'` |
| M5 | listing that throws read as absent | 1: unit UNMEASURABLE-throws. `expected { kind: 'absent' } to deeply equal { kind: 'unmeasurable', …(1) }` |
| M6 | listed but unreadable gate read as absent | 1: unit UNMEASURABLE-listed-unreadable, the same assertion |
| M7 | relevance rule removed | 1: unit READS ANOTHER FILE. `expected { kind: 'present', …(2) } to deeply equal { kind: 'reads-other-file', …(1) }` |
| M8 | same-folder partner filter removed | 1: unit PRESENT. `expected { kind: 'present', …(2) } to deeply equal { kind: 'present', …(2) }` (extra partners) |
| M9 | `#` comment skip removed | 1: unit PRESENT, the same assertion (`retired.bin` became a partner) |
| M10 | the gate module passes `{ kind: 'absent' }`, not its scan (`palette-line0-gate.ts`) | 2: e2e NAMED, e2e COULD NOT CHECK |
| M11 | the gate is looked for in the `.emp` listing (`palette-line0-gate.ts`) | 2: e2e NAMED, e2e COULD NOT CHECK |
| M13 | no partner renders as an empty name | 1: unit NAMED-no-partner. `to contain 'fail until another character\'s palet…'` |
| M14 | could-not-check writes nothing | 2: unit and e2e COULD NOT CHECK. `to contain 'could NOT check whether one of this p…'` |
| M15 | could-not-check names the gate file | 2: unit and e2e COULD NOT CHECK. `not to contain 'tools/spring_line0_gate.py'` |
| M16 | any unreadable folder anywhere hedges "absent" | 1: unit ABSENT. `expected { kind: 'unmeasurable', …(1) } to deeply equal { kind: 'absent' }` |
| M17 | an absent gate is read anyway | 1: unit ABSENT. `an absent check was read anyway: expected 1 to be +0` |

### If a row went green for a reason other than the property

- **e2e NAMED**
  - False green: the name comes from a hardcoded path, not the listing.
  - Ruled out: e2e NOT NAMED (the same fixture without the file) and e2e COULD NOT CHECK (the file
    on disk, the listing blind) both require it absent. The partner is a synthetic `partner.bin`,
    so a typed `knuckles.bin` cannot pass.
- **e2e NOT NAMED**
  - False green: the gate is never named anywhere.
  - Ruled out: the NAMED rows. Anti-vacuous: it asserts the embedder line, so the body is the real
    warning and not the refusal dialog.
- **e2e COULD NOT CHECK**
  - False green: **two messages sharing a phrase.** The embed list's own unmeasurable sentence also
    says "could NOT check".
  - Ruled out: only the `.py` listing is blind. The row asserts the embedder line (so the embed
    list was measured and cannot have said it), the gate-specific lead phrase, and exactly one
    "could NOT check" in the body. M14 drops only the gate's sentence and the row goes red.
- **unit PRESENT / ABSENT / UNMEASURABLE / READS ANOTHER FILE**
  - False green: a scan that answers one kind for everything.
  - Ruled out: each kind is asserted by a sibling row, and each rule has its own mutation
    (M2, M4, M4b, M5 to M9, M16, M17).
- **unit NAMED / NOT NAMED / COULD NOT CHECK (warning level)**
  - False green: a shared phrase.
  - Ruled out: the NAMED phrase ("whichever character you play") and the gate path appear only in
    the gate's paragraph, because the synthetic embed scan has no sites. COULD NOT CHECK is
    guarded as in the e2e row.

## Suite

`VITEST_MAX_WORKERS=4 npm test`, foreground, 2026-09-14T01:19:11Z to 01:20:08Z, on `35e66211`
(the code, tests and harness row; this packet is doc-only on top). The whole `&&` chain ran and
exited 0: every pre-vitest gate, `tsc --noEmit`, then vitest. **rc=0.**

- Test Files: 621 passed, 3 skipped (624)
- Tests: **9667 passed, 9 skipped (9676)**, 0 failed

`section-wiring.test.ts` and `preset-rebind-orphan.test.ts` passed. This branch adds 13 `it` rows.
The brief quoted 9603 at master. Master was not re-run here, so the rest of the difference is not
attributed. `scratchpad/check-harness-guards.mjs`: 286 clean of 287 classified, 0 failures. Its one
G9 line is the known `preset-schema-key-probe.mjs` misreport (ROADMAP row 175).

## On-screen: row 3h, for the controller

`scratchpad/palette-line0-warning-harness.mjs` gains **row 3h (ADDED 2026-09-14, NOT run by its
author; no Electron was launched)**.

- **Its gate path:** read out of `src/core/project/aeon/shared-palette-warning.ts`
  (`SPRING_LINE0_GATE_PATH`).
- **Its expectation:** from its own look at the aeon COPY, sharing no code with the app. Does the
  file exist there, and does it quote the resolved shared path?
- **The assertion:** the on-screen warning names the path exactly when both hold. Note `0b` prints
  which way it expects.

**Red-first plant for the controller's run:**

1. In `src/renderer/providers/palette-line0-gate.ts`, change
   `sharedLine0Warning(file.path, scan, gate)` to
   `sharedLine0Warning(file.path, scan, { kind: 'absent' })` (the node twin is M10).
2. Rebuild with `VITE_AURORA_DEBUG=1 npx electron-vite build`, and run against a copy that has the
   check. **3h must FAIL** with `tools/spring_line0_gate.py expected NAMED; missing in the warning`.
3. Restore from `HEAD`, rebuild, and rerun: 3h PASS. Every other row should still pass.

A second, optional look at the other branch: a copy with `tools/spring_line0_gate.py` deleted
should give 3h PASS as "NOT named".

## Noticed, not fixed

- **aeon's BUILD refuses far more line 0 edits than the gate does, and the warning does not say
  so.** At `6bd8ed89`:
  - `games/sonic4/data/characters/knuckles_data.emp:180` ensures `Pal_SonicTails` and
    `Pal_Knuckles` differ at exactly **4** line-0 slots.
  - `:197` to `:207` pin both palettes' dust greys (indices 4, 6 and 7) to fixed words.
  - `games/sonic4/objects/test_solid.emp:962` (the ensure over `SPRING_LINE0_BAD`, `git grep` at
    `6bd8ed89`) refuses any spring pixel on a slot the two palettes disagree about.

  So an edit to any slot where Sonic's and Knuckles' palettes agree today changes the mismatch
  count and fails aeon's build, not only the gate. A spring colour is one such slot, and so is a
  dust grey. The warning lists both files as embed sites but does not call them build refusals.
  Whether it should is WHAT the warning lists, so it is the hub's call. It is not built here.
- **The gate is not in any build script** (see the wording call). If aeon wires it into its build
  or landing, "will fail" stays true and could be strengthened.
- **The existing real-tree row in `shared-palette-warning.test.ts`** ("against aeon's real tree")
  reads aeon's WORKING TREE through `siblingPathOrUnresolved('aeon')`. That is contrary to review
  bar 19. `01a44d6e` moved the section-wiring rows to a pinned revision; this row was not moved.
  Left alone; it is not this row.
- **The literal scan is line-based.** A quoted palette path on one line inside a multi-line
  docstring would count as a literal, and could become a partner if it sat in the resolved path's
  folder. There is no such line at `6bd8ed89`.
- **Two listing walks** (`.emp` and `.py`) now run, in parallel, on the first line 0 edit per open
  project. Their cost was not measured.
