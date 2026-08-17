import type { CanvasTool } from '../../state/canvasStore';

/**
 * Single-key tool selection for the origination canvas (UX-A3).
 *
 * The canvas shipped with no keyboard route to its tool bar — the one surface in
 * the app explicitly held to "robust enough that artists don't leave for
 * Aseprite", and changing tools meant a mouse trip to the dock every time.
 *
 * The letters are Aseprite's, because that is the muscle memory the artist walks
 * in with: B pencil, E eraser, G fill, I eyedropper, L line, U rectangle,
 * M marquee. `dither` is ours and takes D.
 *
 * Kept as data, apart from the component, so the bindings are testable without a
 * DOM (this suite is node-only and never mounts .tsx) and so the dock can print
 * each key in its own tooltip from the same source the handler reads.
 */
export const TOOL_KEYS: Record<CanvasTool, string> = {
  pencil: 'b',
  eraser: 'e',
  fill: 'g',
  eyedropper: 'i',
  line: 'l',
  rect: 'u',
  select: 'm',
  dither: 'd',
};

/** `TOOL_KEYS` inverted once, at module load, rather than per keystroke. */
const BY_KEY = new Map<string, CanvasTool>(
  (Object.entries(TOOL_KEYS) as Array<[CanvasTool, string]>).map(([tool, key]) => [key, tool]),
);

/**
 * The tool a keydown selects, or null if it selects none.
 *
 * MODIFIED KEYS ARE NEVER TOOLS. Ctrl+B, Ctrl+E, Cmd+L and Alt+I all mean
 * something to the app, the browser or the OS; a tool key that fired through a
 * modifier would change the tool under each of them, in silence, while the real
 * shortcut also ran. Shift is refused for the same reason rather than folded
 * away by `toLowerCase`.
 *
 * Callers still owe the typing guard — `isTypingTarget` — which is theirs
 * because they hold the event target and this module holds no DOM.
 */
export function toolForKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): CanvasTool | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  if (e.key.length !== 1) return null;
  return BY_KEY.get(e.key.toLowerCase()) ?? null;
}
