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
  // THE TYPE SCALE, which theme.css generated and nothing used (VIS7): 227 inline
  // `fontSize:` sites hard-coded 13 different numbers while every step below sat
  // in :root untouched. Exposed as a whole scale, not step-by-step as callers
  // happen to need one, because a caller who reaches for 24px and finds no name
  // types 24 — which is how the scale got bypassed the first time.
  //
  // Sizes only. The generated `--text-*-line` companions stay unexposed: nothing
  // here sets a px line-height (the inline `lineHeight: 1` sites are ratios), and
  // bridging them would just move the unconsumed-token problem up a layer.
  //
  // NOT EVERY SIZE THE APP DRAWS HAS A STEP. The contract's floor is xs/11px
  // ("dense labels, table cells, register dumps") and Aurora's single most common
  // chrome size is 10px, 55 sites of it, with 9px and 8px below that. Those stay
  // raw numbers on purpose: tokens.json is the SUITE's contract, shared with
  // Seraph, so a step below xs is a suite decision and not Aurora's to forge.
  tXs: 'var(--text-xs-size)',       // 11px — dense labels, chips, readouts
  tSm: 'var(--text-sm-size)',       // 12px — secondary UI text
  tBase: 'var(--text-base-size)',   // 13px — default UI text
  tMd: 'var(--text-md-size)',       // 14px — emphasis / panel body
  tLg: 'var(--text-lg-size)',       // 16px — panel titles
  tXl: 'var(--text-xl-size)',       // 20px — section headers
  t2xl: 'var(--text-2xl-size)',     // 24px — window / tool titles
  wRegular: 'var(--weight-regular)', wMedium: 'var(--weight-medium)', wSemibold: 'var(--weight-semibold)',
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
