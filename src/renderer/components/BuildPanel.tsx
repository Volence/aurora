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
          {state === 'building' ? 'Building…' : summary ?? 'Build'}
        </span>
        {missingEnv.length > 0 && (
          // The most common instant failure, and the one whose real cause is
          // invisible in the build's own output when it runs inside a GUI app:
          // a desktop-launched Electron inherits none of a terminal's exports.
          <span style={styles.env}>
            missing environment: {missingEnv.join(', ')} — set them in project.json under
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

const styles = {
  root: {
    position: 'absolute' as const, left: 0, right: 0, bottom: 22, height: 260, zIndex: 40,
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
