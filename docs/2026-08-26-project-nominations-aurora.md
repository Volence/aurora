# Aurora's suite project nominations (PROJECTS-2) — banked in-tree

**Why this file exists, and it is the point of it.** On 2026-08-26 this lane sent the hub
four project nominations at 14:40:35Z. That reply left **no artifact anywhere in aurora** —
it lived only in the outbound message and in empyrean's accumulating doc. The session was
`/clear`ed. The next aurora session booted, read `docs/OVERSEER.md`, the protocol, the
ROADMAP, `lane-status.json`, `decisions.jsonl` and `lane-log.jsonl` — **every artifact this
repo has** — found nothing about nominations, and at 15:49Z sent the hub a second reply
saying *"none beyond EFFECTS-W1"*, contradicting its own lane an hour later. The hub caught
it because it held both.

This is shared-protocol bar 20 (*mail is not part of the tree, so no tree can surface a wrong
claim made in mail*) in its nastiest direction: not a wrong claim about **someone else's**
tree, but a **commitment this lane made about its own work**, invisible to its own successor.
No sweep, no audit, no cold read over aurora could have reached it. Only the recipient could,
and only because it happened to keep a ledger.

**The standing rule this establishes: a cross-lane commitment gets an in-tree artifact in the
SENDING repo before or with the send.** A reply that shapes the owner's ratification list is
not correspondence, it is a position, and a position that exists only in mail does not
survive a `/clear`.

## Ruling, 2026-08-26T15:51Z: the FIRST reply stands

The 14:40:35Z reply is authoritative. The 15:49Z reply is **withdrawn in full** — it was not a
retraction of anything, it was an uninformed duplicate written by a session that did not know
the first existed. Nothing in it was reasoned against the first; it simply had no access to it.

Recorded plainly rather than softened: the second reply's conclusion happened to be *near*-right
about one of the four and wrong about the other three, and it does not get to claim the near-hit
as reasoning.

## The four nominations, as sent, with their status re-verified today

Verbatim scope from the sent reply, with a firsthand re-check of anything that moved since.

1. **EFFECTS-W2** — "what you see is what the ROM builds": reconcile the two background blobs,
   then draw-on-preview. Lanes **aurora + aeon**. Ranked first.
   **AMENDED, and the amendment is smaller than it first looks — check before folding it.**
   The *aurora* half landed within the hour of the nomination: owner decision **d-12** ("the
   game's copy wins") and item 46, merged here at `2533489`, so the map canvas now paints
   `editor_bg_override.json` — the file the ROM is built from.
   The *aeon* half is **untouched**. Verified read-only against the aeon tree at `15037c74`
   on 2026-08-26T15:51Z: `tools/inject_editor_bg.py:203` still reads
   `OUT_DIR = .../games/sonic4/data/generated/ojz/act1`, hardcoded, so the override document
   governs act 1 **by convention**. A principled per-act binding is aeon's to design and
   nobody has designed it. That file last moved at aeon `bb5b8490`.
   **So EFFECTS-W2 remains a real cross-lane project with an intact aeon half. Do not fold it
   into EFFECTS-W1.** The tempting wrong move — and the one the second reply blundered toward —
   is to see the aurora half shipped and conclude the project is done.
2. **SPRITE-EXPORT** — Tails/Knuckles and the S4 sprite write side: auto-decomposition (frame to
   ≤4×4 hardware pieces, one palette line each, flip-aware pool), then mappings + DPLC export to
   aeon formats. Lanes **aurora + aeon**. Second; blocked by nothing. **Unchanged.**
3. **SCREENS** — game shell, menus, HUD, fonts. Lanes **aurora + aeon**. Aurora's ROADMAP §4.5
   records Aurora's mode as the LAST stage of the engine's plan (font/text, fade engine,
   interpreter, `screens_gen.py` come first); **aurora is not the opener**. **Unchanged.**
4. **OBJECT-BEHAVIORS** — typed per-placement params: properties panel as a typed form from each
   archetype's param schema, instance overrides, behavior picker; retire Aurora's TS entity
   exporter so the Python generators are sole authority. Lanes **aurora + aeon**. After or
   parallel to SCREENS; gated on the engine's sequencer + generator. **Unchanged.**

**Declined:** the mega-act level editor. §4.10 substrate landed early; what remains is smaller
than it sounds and aurora cannot size the aeon streaming half. Open to being overruled.

**Aurora-only horizon item:** PNG/asset import (§4.9, never specced) — nearest-palette-line
quantization with per-pixel error, optional auto-palette, flip-aware dedup, level art + sprite
frames. Against the owner's banked bar: artists don't leave for Aseprite, and import decides
whether outside work comes back.

## Playtest loop, link 4 — NOT a project, and now booked so it stops evaporating

The second reply floated link 4 (play-from-cursor + post-build position restore on the classic
s1disasm path) as a hedged candidate. **The hub ruled it is not a project, and this lane agrees:**
s1disasm is a donor/reference tree with no lane and no overseer, so no project can be scoped to
it. It is an **aurora queue item**.

Substance, from `docs/ROADMAP.md` §2.7b and `docs/reviews/2026-08-19-classic-playtest-links.md`
§6 items 8–9: S1 has no warp mailbox in any flavour, so F7 gates off symbol detection with a
classic-worded reason and position restore is absent by design. The only alternative is poking
`v_player` on a running machine, which is link 4's unmeasured spike.

## Process note that went out with the first reply, kept because it keeps being true

Items 41 and 42, built concurrently off one commit, were each correct alone and **wrong in
composition** — 42's eighth panel section ate most of 41's measured gain. Only re-verifying on
the merged tree caught it. Expect that shape wherever concurrent parcels share a surface.
