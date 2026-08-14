import React, { useState } from 'react';
import { T } from './theme';
import { PanelHeader } from './primitives';
import { IconChevron } from './icons';
import { loadPanelState, savePanelState, isCollapsed, togglePanel } from '../../shell/panel-state';

/**
 * WHAT KIND OF SECTION THIS IS, which is the one thing the flex column cannot
 * work out for itself.
 *
 * `content` (the default) — a form, a readout, a row of toggles. Its height is
 * its content's, it never stretches, and giving it a share of the column would
 * only draw a taller empty box.
 *
 * `list` — a panel whose height is set by the DATA: the chunk grid, the object
 * list, the section nav, the ring patterns. It takes an equal share of whatever
 * the content sections leave and scrolls inside it, or its natural height if
 * that is smaller (in which case the surplus goes back to the other lists, or
 * stays at the bottom of the column if there are none).
 *
 * DECLARED, not inferred. The tempting alternative is a list of component names
 * the panel matches against, and this branch has now watched that pattern fail
 * three times: a hand-maintained list is only ever as complete as the last
 * person to remember it, and the failure is silent — a panel missing from the
 * list just quietly gets the wrong layout. A section is the thing that knows
 * whether its content is data-driven, so the section says so.
 */
export type SectionVariant = 'content' | 'list';

export function CollapsibleSection({ id, title, right, variant = 'content', defaultCollapsed = false, collapsedOverride, children }: {
  id: string; title: string; right?: React.ReactNode; defaultCollapsed?: boolean;
  /** See SectionVariant. Default `content` — the safe one; it cannot bury anything. */
  variant?: SectionVariant;
  /**
   * When defined, wins over both persisted state and defaultCollapsed (e.g. an
   * active filter force-expanding a group the user previously collapsed). The
   * header toggle becomes a no-op while overridden — it must not write through
   * to panel-state, or the user's persisted preference would be clobbered by a
   * click that only makes sense in the filtered view.
   */
  collapsedOverride?: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState(loadPanelState);
  const collapsed = collapsedOverride ?? isCollapsed(state, id, defaultCollapsed);
  // Re-load the latest persisted state on each toggle (instead of writing this
  // section's mount-time snapshot) so collapsing one section never clobbers
  // another section's persisted collapse state.
  const toggle = () => {
    if (collapsedOverride !== undefined) return; // overridden — not a real toggle
    const next = togglePanel(loadPanelState(), id, defaultCollapsed);
    savePanelState(next);
    setState(next);
  };
  // A COLLAPSED LIST IS A CONTENT SECTION. Its children are not rendered at
  // all, so a share of the column would be a share given to a lone header —
  // which is case 5 of the brief ("a collapsed section gives its space back")
  // falling out of the model rather than needing a rule.
  return (
    <div style={collapsed || variant !== 'list' ? CONTENT_SECTION : LIST_SECTION}>
      <div onClick={toggle} style={{ cursor: 'pointer' }}>
        <PanelHeader right={right}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-flex', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.1s', color: T.textLo }}>
              <IconChevron size={12} />
            </span>
            {title}
          </span>
        </PanelHeader>
      </div>
      {!collapsed && children}
    </div>
  );
}

/**
 * HOW SHORT A LIST SECTION MAY BE SQUEEZED BEFORE THE COLUMN SCROLLS INSTEAD.
 *
 * A share of the remaining space is the right answer until there is barely any
 * remaining space, and then it is not. Measured on aeon's Layout column: 721px
 * tall, with 601px of CONTENT sections in it (the Art browser's fixed 180px
 * canvas, and a Properties readout that is 396px of its own). That leaves 120px
 * for the lists — so the section nav got a 9px window onto a 67px grid, and
 * with the stamp tool armed the two lists took 60px each and showed 8px of
 * chunk wall. Technically bounded. Useless.
 *
 * So a list stops shrinking here and the DEFICIT BECOMES THE COLUMN'S: Panel
 * still declares `scroll`, and a column scrollbar that moves a section fully
 * into view is a far better failure than a section that is present but cannot
 * be read. That is the pre-existing behaviour of an over-subscribed column,
 * restored for the case that actually is one.
 *
 * 160 is a section header (25) plus a list's own toolbar or filter row (~22)
 * plus two rows of the tallest cell any of these panels draws (the chunk grid's
 * default 48px thumbnail). Two rows is the smallest thing that reads as a list
 * rather than as a clipped one.
 *
 * IT IS NOT THE OLD CAP WEARING A NEW NAME. A ceiling applies always and its
 * cost is dead space in every column with room to spare — which is what
 * SECTION_LIST_MAX_HEIGHT = 260 did, and why it is gone. A floor applies only
 * when the column is already too small for its own contents, and in every
 * column measured here (all four classic ones, aeon Objects, aeon Rings) it
 * never engages at all.
 *
 * The one place it shows: a list filtered down to a SINGLE row is padded to
 * 160px. Two rows and up already clear it (a 3-row object list measures 182px).
 */
const SECTION_LIST_MIN_HEIGHT = 160;

/** Natural height, never stretched, never squeezed. */
const CONTENT_SECTION: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', flexShrink: 0,
};

/**
 * `flex: 1 1 0` + `maxHeight: max-content` IS THE WHOLE MODEL, and the two
 * halves answer the two ways the column used to look wrong.
 *
 * `flex: 1 1 0` is what makes one list fill the column to the bottom and two
 * lists split what the content sections leave. That is the half the fixed cap
 * got wrong: with `maxHeight: 260` a lone chunk grid sat over half a screen of
 * dead column and scrolled anyway.
 *
 * `maxHeight: max-content` is what stops a SHORT list stretching into a tall
 * empty box — an object filter narrowed to two rows would otherwise get its
 * full share and draw the next header at the bottom of the screen. It is not
 * merely a clamp: flexbox freezes an item that hits its max and RE-DIVIDES the
 * remainder among the rest (CSS Flexbox §9.7), so the surplus from a short list
 * goes to the list that wants it, and only settles at the bottom of the column
 * when every list is satisfied. That is max-min fairness, for free, and it is
 * why the intrinsic keyword is doing real work here rather than being a fancy
 * spelling of `height: auto`.
 *
 * The floor is the third part, and it is the one thing here that is a number.
 * See SECTION_LIST_MIN_HEIGHT.
 */
const LIST_SECTION: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  flex: '1 1 0', minHeight: SECTION_LIST_MIN_HEIGHT, maxHeight: 'max-content',
};
