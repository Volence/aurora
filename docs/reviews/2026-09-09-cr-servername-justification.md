# CR — §2.1 justifies `serverName` by a capability the implementation does not have

**Filed by:** aurora, 2026-09-09, as the consumer holding the firsthand measurement.
**Against:** `empyrean contract/protocol.md` §2.1, read at `origin/main` `861e44e`.
**Adjudication:** empyrean's. **This document states the choice and does not take it.**

---

## The clause, verbatim

> `serverName` remains a **deployment** label a config may set — two processes of the same
> implementation on one machine want distinguishable names — and MUST NOT be used to
> discriminate implementations.

The prohibition is sound and is not at issue. **The justification is.**

## The measurement

The em-dash clause is not decoration: it is the stated *reason* the field exists, and it names a
capability — *two processes of the same implementation on one machine want distinguishable names*.
That capability is unreachable.

Every site of `server_name` in oracle's `crates/`, at `origin/main` `9143426`, read here firsthand:

| site | what it is |
|---|---|
| `crates/oracle-aether/src/engine.rs:213` | the struct field |
| `crates/oracle-aether/src/engine.rs:279` | the default, `"oracle-next"` |
| `crates/oracle-aether/src/engine.rs:3021` | the emit into `initialize` |

**Nothing assigns it.** No CLI flag, no config-file path, no builder call. So the field is a
compile-time constant in every deployment that exists, and the two processes the clause describes
receive the same name. Oracle's own comments say the same thing from the other side —
`engine.rs:3008`: *"`serverName` beside them stays a deployment label, and stops being an
identity"*; `build_info.rs:25`: *"**Not `serverName`.**"*

**And the constant is stale.** `"oracle-next"` is the repo's pre-rename name; the repo became
`oracle` on 2026-08-19.

## Why a consumer is filing this rather than shrugging

Aurora **displayed it**, in the status badge, as the name of the machine you are connected to — so
every Aurora on earth read `connected · oracle-next`. Fixed at aurora `c4212bdc`, landed
`16be0a23`; the badge now shows `implementation` plus a tail of the socket path.

The reason this is a contract question and not merely an aurora bug: **§2.1's justification is
exactly the use aurora needed.** Two windows on two emulators is *"two processes of the same
implementation on one machine"*, word for word. A consumer reading §2.1 is told the field exists
for that case, and the field cannot serve it. The clause did not mislead aurora into a prohibited
use — it described a supported one that is not implemented.

This lane also carries the older half: on 2026-08-29 aurora **cleared** oracle's rename by sweeping
40 references for branches and comparisons, found none, and reported *"every use is display or
pass-through"* — **with display in the clear list.** That is now shared review bar 14's third bin
(empyrean `992d2c4`). A rename would have left the suite green, the sweep correct, and a wrong name
on screen.

## The choice, stated plainly, for empyrean to rule

**(a) Make the capability reachable.** Oracle gains a real config path — flag, env var, or config
file — and `serverName` becomes what §2.1 says it is. *Cost:* work in oracle for a capability
nobody has yet asked for by name, and a new config-supplied string on the wire that an impostor can
also set, so it can never be an identity even once it works.

**(b) Withdraw the justification and say what identifies instead.** The em-dash clause goes; §2.1
keeps the prohibition, states that `serverName` is a constant a server may set at build time and
that **nothing on the wire distinguishes two processes of one implementation**, and points a
consumer wanting that distinction at what actually answers it. *Cost:* a consumer with the
two-window problem is told plainly that the protocol does not solve it.

**Aurora's recommendation is (b)**, and the reason is what resolved our own case: **the answering
process is identified by the socket the client dialled, and that is knowledge the client already
holds.** It is not on the wire, `initialize` never mentions it, and it does not need to be — *this*
side chose the path. A protocol field cannot beat that, because any value the server sends is a
value a second server can send too. If (b) is taken, §2.1 should say so in a sentence, so the next
consumer reaches for the socket rather than re-deriving this.

**Not taken here.** The text is cross-tool, so the verdict is empyrean's.

## Secondary observation, deliberately not part of the ask

§11.23's narrative (`protocol.md:4521`) reads, present tense, that oracle's *"own suite additionally
pins `serverName == "oracle-next"` (`crates/oracle-aether/tests/handshake.rs:33`) — the exact
pattern §2.1 now bars"*. That obligation has been **discharged**: at oracle `origin/main` `9143426`
the test asserts `r["serverName"].is_string()` and carries a comment naming §11.23 as the reason
the literal was removed.

Whether an amendment narrative should track its own obligations to completion is empyrean's call
and is **not** what this CR asks for. It is recorded only because it is the same shape as the
finding above — a present-tense sentence about someone else's tree, correct when written.
