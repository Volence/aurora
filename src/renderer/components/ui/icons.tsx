// src/renderer/components/ui/icons.tsx
import React from 'react';

type IconProps = { size?: number };
const svg = (path: React.ReactNode) => ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
       stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

// Minimal set used by the tool docks + chrome. Add glyphs as tools need them.
export const IconPencil    = svg(<path d="M11 2l3 3-8 8H3v-3z" />);
export const IconEraser    = svg(<path d="M5 13h8M3 9l4-4 6 6-4 4H6z" />);
export const IconFill      = svg(<path d="M3 8l5-5 5 5-5 5z M13 11c1 1 1 2 0 2s-1-1 0-2z" />);
export const IconEyedrop   = svg(<path d="M10 3l3 3-6 6-3 1 1-3z" />);
export const IconLine      = svg(<path d="M3 13L13 3" />);
export const IconRect      = svg(<rect x="3" y="3" width="10" height="10" />);
export const IconSelect    = svg(<rect x="3" y="3" width="10" height="10" strokeDasharray="2 2" />);
export const IconDither    = svg(<path d="M3 3h2v2H3zM7 3h2v2H7zM11 3h2v2h-2zM5 7h2v2H5zM9 7h2v2H9zM3 11h2v2H3zM7 11h2v2H7zM11 11h2v2h-2z" fill="currentColor" stroke="none" />);
export const IconView      = svg(<><circle cx="8" cy="8" r="2.5" /><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" /></>);
export const IconStamp     = svg(<path d="M5 9h6l1 4H4zM6 9V5a2 2 0 014 0v4" />);
export const IconCollision = svg(<path d="M2 11l4-6 3 4 2-3 3 5z" />);
export const IconObject    = svg(<><rect x="4" y="4" width="8" height="8" /><path d="M4 4l8 8" /></>);
export const IconRing      = svg(<circle cx="8" cy="8" r="4.5" />);
export const IconUndo      = svg(<path d="M6 4L3 7l3 3M3 7h7a3 3 0 010 6H7" />);
export const IconRedo      = svg(<path d="M10 4l3 3-3 3M13 7H6a3 3 0 000 6h3" />);
export const IconChevron   = svg(<path d="M4 6l4 4 4-4" />);

// Shell chrome (Task 13): explorer groups, tab strip, filter, panel toggle.
export const IconHome    = svg(<path d="M3 8l5-5 5 5v5h-3.5v-3h-3v3H3z" />);
export const IconLayers  = svg(<><path d="M8 2l6 3-6 3-6-3z" /><path d="M2 8.5l6 3 6-3" /><path d="M2 11.5l6 3 6-3" /></>);
export const IconTools   = svg(<path d="M10 2a3.5 3.5 0 00-3.3 4.7L2 11.4V14h2.6l4.7-4.7A3.5 3.5 0 0014 6l-2 2-2-2 2-2a3.5 3.5 0 00-2-2z" />);
export const IconClock   = svg(<><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></>);
export const IconClose   = svg(<path d="M4 4l8 8M12 4l-8 8" />);
export const IconSearch  = svg(<><circle cx="7" cy="7" r="4" /><path d="M10 10l4 4" /></>);
export const IconPanelToggle = svg(<><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M6 3v10" /></>);
