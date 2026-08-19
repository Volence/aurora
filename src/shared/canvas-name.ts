// The one pattern a canvas's file stem must match — shared, like rel-path.ts,
// because two processes need the SAME rule for opposite reasons.
//
// The renderer enforces it as a GUARD: `loadCanvasFile`/`saveCanvasFile` build
// `.aurora/canvas/<name>.png` from it, so a name carrying `/` or `..` would
// address a file outside the canvas directory. A violation there is a fault and
// it throws.
//
// The main process states it as a SCHEMA: the `commit_canvas` tool declares
// `name` with this pattern, so a bad argument is rejected as INVALID_PARAMS
// (-32602) at the protocol edge, before the handler runs. Without that, the
// renderer's throw reaches an Aether client as INTERNAL (-32603) — "the server
// broke" for what is only a mistyped argument.
//
// ONE pattern, not two copies that agree today: a schema looser than the guard
// reintroduces exactly the -32603 it exists to remove, and a schema tighter
// than the guard refuses names the editor itself can save.
//
// No `g` flag — this instance is shared, and `lastIndex` would make a shared
// global-flagged RegExp answer differently on alternate calls.
export const CANVAS_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
