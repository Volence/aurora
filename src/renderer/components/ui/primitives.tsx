// src/renderer/components/ui/primitives.tsx
import React from 'react';
import { T } from './theme';

/**
 * A facet's right-hand column: A FULL-HEIGHT FLEX COLUMN THAT ITS SECTIONS
 * SHARE.
 *
 * EditorShell already hands this box a definite height — it is a flex item in
 * the `flex: 1; overflow: hidden` canvas row, so it stretches to the row — and
 * `minHeight: 0` is what lets that height actually bind. Without it a flex item
 * refuses to shrink below its content, so the column silently grows past the
 * bottom of the window and every "fill the remaining space" rule inside it
 * measures against a height nobody can see. That is what a `maxHeight: 260px`
 * cap on each list was standing in for, and why the cap looked necessary: `flex`
 * inside a column with no usable height does nothing, so a fixed pixel number
 * was the only thing left that worked.
 *
 * With the height bound, sections divide it (see ui/CollapsibleSection):
 *   - a CONTENT section (a form, a toggle row) takes its natural height and
 *     never stretches;
 *   - a LIST section (`variant="list"`) claims an equal share of whatever is
 *     left and scrolls inside that share, or takes its natural height if that
 *     is smaller and hands the surplus back.
 *
 * `scroll` stays, and is the escape hatch rather than the plan: a column whose
 * CONTENT sections alone over-subscribe it (SpriteMode mounts six) has nothing
 * left to divide, and scrolling the column is the correct degradation. When the
 * sections fit, nothing overflows and the scrollbar never appears.
 *
 * ═══ `scroll` IS VERTICAL. THE SIDEWAYS AXIS IS CLOSED ON PURPOSE ═══
 * (COLDREAD-C9-SELECT-WIDER, cold read 2026-09-05 C9.)
 *
 * It was `overflow: auto`, which is BOTH axes, and the horizontal half was
 * never anybody's design: a `Panel` sets a fixed `width` and is `flexShrink: 0`,
 * so its column has one width forever and everything in it is authored to fit
 * that width. A horizontal scrollbar here is always somebody's overflow bug.
 *
 * ⚠ AND IT DOES NOT MERELY LOOK WRONG — IT MOVES THE STICKY BOXES. A
 * `position: sticky; top: 0` child pins on the BLOCK axis only; on the inline
 * axis it rides the scroll like anything else, and its sticky-constraint
 * rectangle is its containing block, which in a scroll container is the CONTENT
 * box (`clientWidth`), so adding `left: 0` buys it no travel and cannot save it.
 * Measured in the running app (`npm run harness:coldread-fixes` `[9c]`,
 * 1680x1050, dpr 1): with 90px of overflow planted in the Effects column, three
 * sideways wheel notches carried the facet's pinned section strip 89px off the
 * left edge of its own scrollport — the strip the in-app guide annotates
 * "always there, never scrolls", taking the two condition glyphs with it. That
 * is the same mechanism the cold read hit at 10px; the guide's sentence is a
 * claim about the STRIP, so removing one over-wide child (the `<code>` path in
 * `column-layout.tsx`'s `Hint`) left the next one free to do it again.
 *
 * `hidden`, not `clip`: CSS Overflow 3 computes `clip` to `hidden` the moment
 * the other axis is `auto`, so the two spell the same used value here and
 * `hidden` says so plainly.
 *
 * ═══ AND `hidden` IS NOT ENOUGH — MEASURED 2026-09-06, THE DAY AFTER ═══
 *
 * The paragraph that stood here said the programmatic path "needs TWO defects
 * at once" and left it at that, with row `[9d]` cited as measuring the focus
 * half. `[9d]` was VACUOUS (it appended a button that wrapped onto the next
 * line and never went off-edge, so it passed on both sides of the fix). Made
 * to create its condition, it went RED ON THIS FIX: focusing a control past
 * the scrollport's right edge dragged the pinned strip **511px** out of view,
 * scrollLeft 512 — six times worse than the 89px the wheel managed, because a
 * scroll-into-view jumps the whole distance at once.
 *
 * A `hidden` box still scrolls programmatically, and the browser's own
 * scroll-into-view on focus IS that path — no author has to call anything.
 * `Tab` is enough. So the axis is now closed a second way: `onScroll` snaps
 * `scrollLeft` back to 0. The column has no inline scroll POSITION, not merely
 * no inline scroll gesture, which is the invariant the sticky strip actually
 * needs.
 *
 * ⚠ Kept from the old paragraph because it is still true and still the reason
 * this is defence in depth rather than the primary fix: the hazard needs a
 * child wider than the column before anything can be off-edge, and `[9a]` is
 * what fails on that. This handler is what makes the strip's guarantee hold
 * even when `[9a]`'s condition is violated.
 *
 * ⚠ CLIPPING IS QUIETER THAN SCROLLING, so the over-wide child must be caught
 * somewhere else: `[9a]` fails on any horizontal overflow in the Effects column
 * with its cards open, and it is the only instrument that sees one now.
 */
export function Panel({ children, width, scroll = false, style }: {
  children: React.ReactNode; width?: number; scroll?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div
      onScroll={scroll ? (e): void => {
        // See "AND `hidden` IS NOT ENOUGH" above. Cheap by construction: in the
        // ordinary case scrollLeft is already 0 and this compares two numbers.
        const el = e.currentTarget;
        if (el.scrollLeft !== 0) el.scrollLeft = 0;
      } : undefined}
      style={{
      display: 'flex', flexDirection: 'column', minHeight: 0, background: T.void,
      borderLeft: `1px solid ${T.border}`, flexShrink: 0,
      ...(width ? { width } : {}),
      ...(scroll ? { overflowY: 'auto' as const, overflowX: 'hidden' as const } : {}),
      ...style,
    }}>{children}</div>
  );
}

/**
 * THE HORIZONTAL INSET EVERY DOCK IN THIS SHELL DRAWS ITS CHROME AT.
 *
 * It already existed as a number typed into PanelHeader (`${T.s2} ${T.s4}`) and
 * nowhere else, which is why a panel that renders its own body content had
 * nothing to derive an inset FROM: the Effects panel's inputs and selects ran
 * flush to x = the window's right edge because no shared thing said where the
 * edge was. Named here so a body and the header above it cannot come apart, and
 * so the value is a token rather than a pixel someone re-types.
 */
export const PANEL_INSET = T.s4;

/**
 * A section's body, inset to match the header directly above it.
 *
 * NOT folded into CollapsibleSection, deliberately: most panels in this tree
 * already pad themselves (CollisionPalette, RingPatternPalette, ArtBrowser,
 * PropertiesPanel all set their own `padding`), so an inset applied by the
 * section would double up on every one of them. A panel opts in.
 *
 * `minHeight: 0` + `flex: 1 1 auto` so a body inside a `variant="list"` section
 * still divides the column the way the section's own children used to — the
 * wrapper must be transparent to the flex model, not a new box in it.
 */
export function SectionBody({ children, style }: {
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: 0, flex: '1 1 auto',
      padding: `0 ${PANEL_INSET} ${PANEL_INSET}`, ...style,
    }}>{children}</div>
  );
}

export function PanelHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `${T.s2} ${PANEL_INSET}`, fontSize: T.t2xs, fontWeight: T.wSemibold, color: T.textLo,
      textTransform: 'uppercase', letterSpacing: 1, borderBottom: `1px solid ${T.border}`,
    }}>
      <span>{children}</span>{right}
    </div>
  );
}

export function ToolButton({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button title={label} aria-label={label} onClick={onClick} style={{
      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? T.accent : 'transparent', color: active ? T.onAccent : T.textLo,
      border: 'none', borderRadius: T.rMd, cursor: 'pointer',
    }}>{icon}</button>
  );
}

export function IconButton({ icon, label, onClick, disabled }: {
  icon: React.ReactNode; label: string;
  /** The event is FORWARDED (d-27). React always handed it to this handler —
   *  `onClick` goes straight onto the `<button>` — but the type said `() =>
   *  void`, and TypeScript will not accept a one-parameter callback where a
   *  zero-parameter one is declared. So a destructive caller could not reach
   *  `e.currentTarget` to blur the button it just pressed without either
   *  widening this or blurring `document.activeElement` on faith. Widening is
   *  purely additive: every existing `() => …` caller still fits. See
   *  `ui/act-and-drop-focus.ts`. */
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean;
}) {
  return (
    <button title={label} aria-label={label} disabled={disabled} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.s2,
      padding: `${T.s2} ${T.s3}`, background: T.overlay, color: T.textBase,
      border: `1px solid ${T.border}`, borderRadius: T.rMd, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1, fontSize: T.tXs,
    }}>{icon}</button>
  );
}

export function Chip({ children, active, onClick, disabled, title, tone }: {
  children: React.ReactNode; active?: boolean;
  /** The event is FORWARDED — same reason as `IconButton`'s, see the note
   *  there and `ui/act-and-drop-focus.ts` (d-27). Widening only; every
   *  `() => …` caller still fits. NOTE the `if (!onClick)` branch below: a chip
   *  with no handler is a `<span>`, so this widening reaches only the chips
   *  that are already real `<button>`s. */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; title?: string;
  /** Colours the chip's border and text WITHOUT making it look active. A chip
   *  that is switched off while reporting a problem — the canvas's Clashes chip
   *  with the tint hidden — has to say so without claiming the tint is on. A
   *  named tone rather than a raw `style` prop, because one styling escape
   *  hatch on a shared primitive becomes every caller's private look. */
  tone?: 'warning';
}) {
  const toned = tone === 'warning' && !active;
  // ONE LOOK, TWO ELEMENTS, decided by whether the chip DOES anything.
  //
  // Every chip used to be a `<span onClick>`, which made every interactive chip
  // in the app mouse-only: no tab stop, no Enter, no Space, and nothing for a
  // screen reader to announce as pressable. Chips are not decoration here —
  // Undo/Redo, the grid toggles, the constraint switches and the palette-line
  // picker are all chips.
  //
  // A real `<button>` rather than role/tabIndex/onKeyDown by hand: the button
  // brings the tab stop, both activation keys, the disabled semantics AND the
  // :focus-visible ring with it, and none of those can then drift apart. The
  // non-interactive chips (readouts like "tiles: 12 new") stay spans, because a
  // button that does nothing is a worse lie than a span that does nothing.
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: T.s2, padding: `${T.s1} ${T.s3}`,
    background: active ? T.accent : T.raised,
    color: active ? T.onAccent : toned ? T.warning : T.textBase,
    border: `1px solid ${active ? T.accent : toned ? T.warning : T.border}`,
    borderRadius: T.rMd,
    fontSize: T.tXs, cursor: disabled ? 'default' : (onClick ? 'pointer' : 'default'),
    opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
  };
  if (!onClick) return <span title={title} style={style}>{children}</span>;
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={active === undefined ? undefined : active}
      onClick={disabled ? undefined : onClick}
      // The UA's own button styling is the only thing the span never had to
      // undo: font and line-height are inherited so a chip in a 13px bar is
      // still 11px, and `margin: 0` keeps the option bars' gaps exact.
      style={{ ...style, font: 'inherit', fontSize: T.tXs, lineHeight: 1, margin: 0, textAlign: 'left' }}
    >{children}</button>
  );
}

export function Divider() {
  return <span style={{ width: 1, height: 16, background: T.borderStrong, flexShrink: 0 }} />;
}

export function OptionBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: T.s4, height: 32, padding: `0 ${T.s4}`,
      background: T.surface, borderBottom: `1px solid ${T.border}`, color: T.textLo,
      fontSize: T.tXs, flexShrink: 0,
    }}>{children}</div>
  );
}

export function StatusBar({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <footer style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 24,
      padding: `0 ${T.s4}`, background: T.void, borderTop: `1px solid ${T.border}`,
      color: T.textLo, fontFamily: T.fontMono, fontSize: T.tXs, flexShrink: 0,
    }}>
      <span>{left}</span><span>{right}</span>
    </footer>
  );
}
