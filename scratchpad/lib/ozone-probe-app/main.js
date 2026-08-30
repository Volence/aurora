// ═══════════════════════════════════════════════════════════════════════════
// ozone-probe-app — the smallest Electron that can answer "which display
// server did you actually attach to?", and NOTHING else.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ IT CREATES NO BrowserWindow, AND THAT IS A SAFETY REQUIREMENT RATHER THAN
// a minimalism preference. The question this app exists to answer is whether a
// harness-launched Electron attaches to the OWNER'S live Wayland session
// instead of the harness's Xvfb. If the answer is yes — and it is — then any
// probe that created a window would have put that window on the desktop he is
// working at. A window-less client can attach, be asked what it sees, and
// leave, without ever presenting a surface to anyone's compositor.
//
// `screen.getAllDisplays()` is available after `app.whenReady()` without a
// window, and it is the whole measurement: run under an Xvfb of a deliberately
// distinctive geometry, an Electron that reports that geometry is on our Xvfb
// and an Electron that reports anything else is not.
//
// Argv contract: the LAST argument is the file to write the JSON report to.

const { app, screen } = require('electron');
const fs = require('fs');

const OUT = process.argv[process.argv.length - 1];

// Without this, Electron would quit on its own terms in some configurations
// before the report is written. There are no windows to close anyway.
app.on('window-all-closed', () => {});

app.whenReady().then(() => {
  let displays = null;
  let err = null;
  try {
    displays = screen.getAllDisplays().map((d) => ({
      id: d.id, width: d.size.width, height: d.size.height, scaleFactor: d.scaleFactor,
    }));
  } catch (e) {
    err = String(e);
  }
  fs.writeFileSync(OUT, JSON.stringify({
    ok: true,
    pid: process.pid,
    // The app's OWN view of its environment, so the report says what it saw
    // rather than what the launcher believes it passed.
    DISPLAY: process.env.DISPLAY ?? null,
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY ?? null,
    ELECTRON_OZONE_PLATFORM_HINT: process.env.ELECTRON_OZONE_PLATFORM_HINT ?? null,
    argv: process.argv,
    displays,
    err,
  }, null, 2));
  app.exit(0);
}).catch((e) => {
  // A failure to become ready is itself a result — never a silent absence.
  try {
    fs.writeFileSync(OUT, JSON.stringify({ ok: false, whenReadyError: String(e) }, null, 2));
  } catch { /* nothing left to do */ }
  app.exit(3);
});
