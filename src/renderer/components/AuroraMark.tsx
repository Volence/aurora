import React from 'react';

/**
 * The Aurora mark — a rayed eye-star (the radiant light-bringer), from the
 * Empyrean visual contract (megaforge/design/icons/aurora.svg). Tintable via
 * `currentColor`; defaults to the emerald accent. Use ≥32px for the full mark.
 * Kept as a component (not an <img>) so it inherits color and never hits CSP.
 */
export default function AuroraMark({ size = 20, color = 'var(--accent, #34D399)', title = 'Aurora' }: {
  size?: number; color?: string; title?: string;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={title}
      fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round"
    >
      <title>{title}</title>
      {/* shared halo */}
      <circle cx="48" cy="48" r="42" strokeWidth="1.4" />
      <circle cx="48" cy="48" r="38" strokeWidth="1" opacity="0.22" />
      {/* 16 radiating rays */}
      <g strokeWidth="1" opacity="0.42">
        <line x1="48" y1="9" x2="48" y2="20" /><line x1="48" y1="76" x2="48" y2="87" />
        <line x1="9" y1="48" x2="20" y2="48" /><line x1="76" y1="48" x2="87" y2="48" />
        <line x1="20.4" y1="20.4" x2="28.2" y2="28.2" /><line x1="75.6" y1="20.4" x2="67.8" y2="28.2" />
        <line x1="20.4" y1="75.6" x2="28.2" y2="67.8" /><line x1="75.6" y1="75.6" x2="67.8" y2="67.8" />
      </g>
      <g strokeWidth="1" opacity="0.22">
        <line x1="63.4" y1="10.1" x2="59.9" y2="20.4" /><line x1="85.9" y1="32.6" x2="75.6" y2="36.1" />
        <line x1="85.9" y1="63.4" x2="75.6" y2="59.9" /><line x1="63.4" y1="85.9" x2="59.9" y2="75.6" />
        <line x1="32.6" y1="85.9" x2="36.1" y2="75.6" /><line x1="10.1" y1="63.4" x2="20.4" y2="59.9" />
        <line x1="10.1" y1="32.6" x2="20.4" y2="36.1" /><line x1="32.6" y1="10.1" x2="36.1" y2="20.4" />
      </g>
      {/* 4-point radiant star */}
      <path d="M48 24 L54 42 L72 48 L54 54 L48 72 L42 54 L24 48 L42 42 Z" strokeWidth="1.8" />
      {/* the eye nested at the star's heart */}
      <path d="M36 48 Q48 39 60 48 Q48 57 36 48 Z" strokeWidth="1.4" />
      <circle cx="48" cy="48" r="3.4" fill={color} stroke="none" />
    </svg>
  );
}
