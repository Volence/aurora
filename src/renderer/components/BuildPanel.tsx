import React from 'react';
import { T } from './ui';
import { useAetherStore } from '../state/aetherStore';

/**
 * The build output panel.
 *
 * IT OPENS WHEN A BUILD STARTS AND CLOSES ITSELF ON SUCCESS. The first version
 * opened only on failure, which meant pressing Build & Run produced no visible
 * change for however long the build took — indistinguishable from a dead
 * keybinding, and reported as exactly that. Success still gets out of the way;
 * it just does so at the END rather than by never appearing.
 *
 * A failure is the one moment the output is the most important thing on screen,
 * so it stays.
 *
 * The spec calls this "the single place 'the generator rejected my document'
 * appears, so make it good": the collision, screens, parallax and behaviour
 * generators all report here, and their messages are the difference between
 * fixing a level and guessing at it. Hence errors pulled to the top rather than
 * making someone scroll a wall of successful output to find the one red line.
 */
export default function BuildPanel(): React.ReactElement | null {
  const open = useAetherStore((s) => s.buildPanelOpen);
  const state = useAetherStore((s) => s.buildState);
  const output = useAetherStore((s) => s.buildOutput);
  const summary = useAetherStore((s) => s.buildSummary);
  const missingEnv = useAetherStore((s) => s.buildMissingEnv);
  const setOpen = useAetherStore((s) => s.setBuildPanelOpen);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  /**
   * Elapsed seconds while building.
   *
   * A real aeon build is ~30s, and build.sh's output is block-buffered when
   * stdout is a pipe rather than a terminal — so the panel can sit with the
   * word "Building…" and nothing else for half a minute, which reads as frozen.
   * A ticking counter is the cheapest possible proof of life, and it also tells
   * the owner what the build actually costs rather than leaving them to guess.
   */
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (state !== 'building') { setElapsed(0); return; }
    const started = performance.now();
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 250);
    return () => clearInterval(id);
  }, [state]);

  // Follow the tail while a build runs; stop fighting the user once it ends, so
  // they can read the failure without being yanked to the bottom.
  React.useEffect(() => {
    if (state === 'building' && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [output, state]);

  if (!open) return null;

  const isError = (l: string) => /\b(error|ERROR|failed|FAILED|cannot|refus)/.test(l);
  const errors = output.filter(isError);
  const rest = output.filter((l) => !isError(l));

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={{ ...styles.dot, background: state === 'failed' ? T.error : state === 'building' ? T.textLo : T.accent }} />
        <span style={styles.title}>
          {state === 'building' ? `Building… ${elapsed}s` : summary ?? 'Build'}
        </span>
        {missingEnv.length > 0 && (
          // The most common instant failure, and the one whose real cause is
          // invisible in the build's own output when it runs inside a GUI app:
          // a desktop-launched Electron inherits none of a terminal's exports.
          <span style={styles.env}>
            missing environment: {missingEnv.join(', ')}. Set them in project.json under
            {' '}<code style={styles.code}>buildEnv</code>, or launch Aurora from a shell that exports them
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" style={styles.close} onClick={() => setOpen(false)} title="Close (Esc)">✕</button>
      </div>
      <div ref={bodyRef} style={styles.body}>
        {errors.length > 0 && (
          <div style={styles.errBlock}>
            {errors.map((l, i) => <div key={`e${i}`} style={styles.errLine}>{l}</div>)}
          </div>
        )}
        {rest.map((l, i) => <div key={i} style={styles.line}>{l}</div>)}
        {output.length === 0 && state === 'building' && <div style={styles.line}>starting…</div>}
      </div>
    </div>
  );
}

/**
 * How tall the console is when it is open, and the ONE place that number lives.
 *
 * Capped at half the window (`maxHeight` below) so a short window is never all
 * console and no app — the panel is `flexShrink: 0`, which is what keeps it from
 * being squeezed away on a tall one.
 */
export const BUILD_CONSOLE_HEIGHT = 260;

const styles = {
  /**
   * A FLOW CHILD OF THE APP ROOT, NOT AN OVERLAY. This is the fix for the
   * defect the owner hit: he pressed Build, the console appeared, and the
   * right-hand properties column was cut off at the bottom with the Remove
   * button he needed underneath it and no way to scroll to it.
   *
   * It used to be `position: absolute; left: 0; right: 0; bottom: 22;
   * height: 260`, which has two independent faults:
   *
   *  1. AN ABSOLUTE BOX REMOVES NO SPACE FROM THE LAYOUT, so nothing behind it
   *     knows it exists. The properties column's scroller still measured itself
   *     against the full window height, so scrolling it to the very bottom left
   *     its last control sitting UNDER the console — visible through nothing,
   *     hit-tested to the console, and unreachable at every scroll position
   *     there is. Measured on the pre-fix tree with 16 layers authored: 94 of
   *     the column's 126 enabled controls could not be clicked, against 0 with
   *     the console closed (scratchpad/build-console-overlap-harness.mjs, rows
   *     3c/5b). The same arithmetic covered the bottom 260px of the map canvas
   *     and of the Explorer tree.
   *
   *  2. `bottom: 22` WAS A GUESS AT THE STATUS BAR'S HEIGHT, and it was wrong —
   *     the bar measures 24px, so the console already overlapped it by two.
   *     There is no constant to derive that number from because the status bar
   *     is a facet's slot inside EditorShell, four levels below this component.
   *     A number that cannot be derived is a number that will drift.
   *
   * As a flex item in the root column the height comes OUT of `styles.body`
   * (App.tsx), so the Explorer, the canvas and the properties column all
   * genuinely shrink and their scrollers re-measure. Every viewport in this app
   * sizes off a ResizeObserver or off flex, and nothing listens for a window
   * `resize` event, so the reflow needs no cooperation from any of them.
   *
   * WHAT THIS TRADES: the console now sits flush with the bottom of the window
   * and the status bar rides directly above it, where before the bar was at the
   * bottom and the console floated over everything else. Both bars stay fully
   * visible; the ordering is the only change. Keeping the bar at the very bottom
   * would mean mounting the console INSIDE EditorShell, and the console is
   * app-global — it has to work on the Home tab, which has no EditorShell.
   *
   * `position: relative` + `zIndex` survive only so the top border and the
   * shadow paint OVER the body above rather than being clipped by it. They no
   * longer position anything.
   */
  root: {
    position: 'relative' as const, zIndex: 40,
    height: BUILD_CONSOLE_HEIGHT, maxHeight: '50vh', flexShrink: 0,
    display: 'flex', flexDirection: 'column' as const,
    background: T.void, borderTop: `1px solid ${T.border}`, boxShadow: '0 -8px 24px rgba(0,0,0,0.45)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
    borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  title: { fontSize: T.tSm, color: T.textBase, fontWeight: T.wSemibold },
  env: { fontSize: T.t2xs, color: T.warning },
  code: { fontFamily: T.fontMono, color: T.textBase },
  close: {
    background: 'none', border: 'none', color: T.textLo, cursor: 'pointer',
    fontSize: T.tSm, padding: '0 4px',
  },
  body: {
    flex: 1, overflow: 'auto', padding: '6px 10px',
    fontFamily: T.fontMono, fontSize: T.t2xs, lineHeight: '15px', color: T.textLo,
  },
  // Errors first, boxed, so the thing that went wrong is not something you have
  // to hunt for in three hundred lines of success.
  errBlock: {
    marginBottom: 8, padding: '4px 6px',
    borderLeft: `2px solid ${T.error}`, background: 'rgba(255,0,0,0.06)',
  },
  errLine: { color: T.error, whiteSpace: 'pre-wrap' as const },
  line: { whiteSpace: 'pre-wrap' as const },
};
