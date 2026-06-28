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
