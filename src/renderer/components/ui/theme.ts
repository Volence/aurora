// src/renderer/components/ui/theme.ts
// Typed bridge to the Empyrean CSS custom properties in styles/theme.css.
// Use in inline styles: style={{ background: T.surface, color: T.textHi }}.
export const T = {
  void: 'var(--void)', surface: 'var(--surface)', raised: 'var(--raised)',
  overlay: 'var(--overlay)', border: 'var(--border)', borderStrong: 'var(--border-strong)',
  textHi: 'var(--text-hi)', textBase: 'var(--text-base)', textLo: 'var(--text-lo)', textFaint: 'var(--text-faint)',
  accent: 'var(--accent)',
  success: 'var(--success)', warning: 'var(--warning)', error: 'var(--error)', info: 'var(--info)',
  fontUi: 'var(--font-ui)', fontMono: 'var(--font-mono)',
  s1: 'var(--space-1)', s2: 'var(--space-2)', s3: 'var(--space-3)', s4: 'var(--space-4)',
  s5: 'var(--space-5)', s6: 'var(--space-6)', s7: 'var(--space-7)', s8: 'var(--space-8)',
  rSm: 'var(--radius-sm)', rMd: 'var(--radius-md)', rLg: 'var(--radius-lg)', rXl: 'var(--radius-xl)', rPill: 'var(--radius-pill)',
  // emerald accent on void surface — for primary buttons/active states
  onAccent: 'var(--void)',
} as const;

/**
 * THE STACKING ORDER, stated once.
 *
 * Not in theme.css because that file is generated from the Empyrean tokens and
 * these are Aurora's own layering, but named here for the same reason the
 * spacing scale is: the app had five hand-picked z-indexes and two of them
 * collided. A context menu and a modal both sat at 1000, so which one won was
 * whichever React rendered later, and the New Canvas dialog outranked the
 * import dialog for no reason anyone chose.
 *
 * Read top to bottom as what covers what:
 *
 *   menu      a dropdown anchored to its trigger, inside the page
 *   floating  a context menu / picker that escapes its container
 *   modal     a dialog that owns the screen until it is answered
 *   toast     always visible, even over a dialog — it reports what happened
 */
export const Z = {
  menu: 100,
  floating: 1000,
  modal: 1100,
  toast: 1300,
} as const;
