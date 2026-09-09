# The rig cannot see a native file dialog, and the absence looks exactly like an app defect

**Controller measurement, foreground, 2026-09-09.** Written because UX seat A filed
`F1` — *"`Open Project…` produced nothing observable"* — and **correctly refused to
attribute it**, naming the two candidates (a headless-Xvfb/portal artifact, or an app
defect) and saying it could not tell them apart. It is the seat's most expensive finding
by time burned, and it is the one a reader would most want to act on. So the attribution
was taken here rather than left open.

## The measurement

A **12-line Electron main script containing none of Aurora's code** — one
`BrowserWindow`, then `dialog.showOpenDialog(win, { properties: ['openDirectory'] })` —
launched through `spawnGuarded` under `xvfb-run -a -s '-screen 0 1280x900x24'`, exactly
the way a seat launches the app.

    PROBE: window shown, calling showOpenDialog
    PROBE: our display looks like :102
      win 2097155 900x600+190+150 name=''
    screen 1280 x 900
    PROBE: STILL PENDING after 8000ms — dialog did not resolve

The app window **is** on our display (900x600, the geometry asked for). No dialog window
appears anywhere on it, and **the promise never settles**. Reproduced twice.

## The verdict

**`F1` is an artifact of the headless rig, not a defect in Aurora's front door.** Nothing
in `ipc-handlers.ts` is reached: the hang is in Electron's own native directory dialog,
and the same hang occurs with Aurora entirely absent from the process.

**What SURVIVES the attribution, and it is the seat's own framing:** *one advertised entry
point, and no second door in the UI when it does not open.* That is a claim about the
design, not about the dialog, and it stands. What does not survive is the cost sentence —
a user on a real desktop gets a working dialog.

## The durable consequence — declare it, do not rediscover it

**No headless seat can evaluate any control whose behaviour is a native file dialog.** The
control is pressable, the app does not crash, nothing appears, and the promise hangs: the
signature is indistinguishable from a dead button. **Every future seat will find this and
file it, and each time it will look like a real defect**, because the seat is behaving
correctly and reporting honestly.

So it is a **declared exclusion of the rig**, in the charter, rather than a lesson each
seat learns by burning two minutes on it. This repo's own idiom, from
`check-harness-guards`: *an exemption nobody sees is a hole.* The inverse holds here — an
exclusion nobody declares is a finding factory.

**Not investigated, and deliberately not guessed at:** whether the cause is portal routing
or GTK failing headlessly. Portals ARE running on this box (pids 1717 / 1772 / 1811, in
the owner's session) and the journal shows **no** FileChooser traffic during either the
seat's run or these probes — which is evidence against the portal hypothesis and is not
proof of the other one. **The attribution question this note answers is "is it Aurora",
and the answer is no; "what is it instead" is open and costs nothing to leave open.**

---

## ⚠ AMENDMENT, same day: this note was written in the grammar that makes an exclusion go stale

**Raised by the sigil lane through the hub, and it lands on this document.** Everything above
is stated as a **permanent property of the rig**. It is not. It is **one measurement, on one
box, on one day, of an environment nobody controls** — and an exclusion list stated as fact
becomes the next finding factory, which is precisely the failure this note exists to prevent,
one level up.

### What is measured here, and it stands

Canary behind a real `.gitignore` entry (`dist/`), aurora session, 2026-09-09:

    grep -rl "$CANARY" .          → 0 hits          ← a clean, confident zero
    command grep -rl "$CANARY" .  → 1 hit
    type grep                     → shell function from ~/.claude/shell-snapshots/snapshot-zsh-…

Independently reproduced the same night by an agent in its own shell, same numbers. **So a
`grep -r` here can silently skip `dist/` and any other ignored path and report a zero
indistinguishable from a real absence.**

### ⚠ AND A CLAIM THIS SECTION ORIGINALLY MADE WAS FALSE — RETRACTED WITHIN THE HOUR

This section first said that a peer lane had measured **the opposite** in its own shell, and
concluded that **sessions on this machine differ in `grep` semantics**. **Both are withdrawn.**
That lane's shell behaves as ours does; **concurrent divergence was never demonstrated** and
must not be carried as established. I had already relayed it to two live agents, and corrected
them.

**How a false refutation passed three readers, which is the durable half.** The peer's canary
was hidden via `.git/info/exclude`, and its control was `git check-ignore` — **which answered
truthfully and unambiguously that GIT ignores the path.** But the instrument under test keys
on **`.gitignore` FILES**, not on git's full ignore resolution. **The control verified a TRUE
predicate that was not the INSTRUMENT'S predicate.** It passed while the canary stayed
invisible to the very thing it existed to make visible.

**The catching question is sharper than "did you run a control":** not *is my canary of the
right kind* — that was asked and answered correctly — but **by what mechanism exactly is my
canary visible to THIS instrument.** It lives in near-synonyms: *ignored-by-git* vs
*ignored-by-a-gitignore-file*, *tracked* vs *committed*, *on-disk* vs *staged*, *installed* vs
*on PATH*, *dirty* vs *unsaved*.

**Two reasons it propagated at speed, and they indict me as much as anyone:** a refutation
**feels like the rigorous act, so it draws less scrutiny than the claim it overturns** — I
amended this file and messaged two agents within minutes of receiving it. And it overturned a
rule *about false clean zeros* **using a false clean zero**, so it read as fitting the night's
theme. ⚠ **A result that confirms the local theme is not corroborated by fitting it.**

### The exclusion above is MUTABLE — and this part was never downstream of the bad number

The native-dialog finding is **dated 2026-09-09** and holds **on this box, under this
Electron, under xvfb-run**. Any of those moving can change it. **Re-measure at brief time
rather than copying it forward**, with the probe that produced it:

- 12 lines of Electron (`BrowserWindow` + `dialog.showOpenDialog`), launched through
  `spawnGuarded` under `xvfb-run`, enumerating windows on the run's own display with
  python-xlib. Under two minutes. **If a dialog window appears, this exclusion is retired and
  every finding filed under it is re-openable.**

**Sigil's sentence, which belongs at the top of any exclusion list including this one:** *an
exclusion list is itself a snapshot, so a list stated as fact becomes the next finding
factory.* Mark every value **MUTABLE with an instruction to re-measure**. **Its own grep rule
was true all along** — what failed was a refutation of it, which is a reminder that the
mutability discipline is about tense and re-measurement, not about distrusting the claim.
