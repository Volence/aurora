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
