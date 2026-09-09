// Open the seat's PRIVATE PINNED aeon copy. The path is injected by the caller
// as window.__UXB_AEON (act.mjs step) rather than typed here.
await window.__dbg.aeon.open(window.__UXB_AEON);
for (let i = 0; i < 60; i++) {
  const s = window.__dbg.aeon.state();
  if (s && s.open) return { opened: true, ...s, waited: i * 300 };
  await new Promise(r => setTimeout(r, 300));
}
return { opened: false, state: window.__dbg.aeon.state() };
