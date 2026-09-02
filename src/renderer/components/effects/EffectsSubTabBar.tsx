// THE THREE JOBS, AS THREE BUTTONS — the owner's
// `three_sub_tabs_plus_section_strip` ruling (d-26b), the tab half.
//
// ═══ WHERE IT IS, AND WHY IT IS INSIDE THE STRIP ═══
//
// It renders as the LAST ROW OF THE STICKY SECTION STRIP, not as a sibling
// under it. The mockup draws the two as stacked permanent rows and both have to
// stay on screen from anywhere in the column — and there is exactly one
// mechanism in this column that makes a box permanent: `position: sticky` on a
// direct child of the scrolling `Panel` (SectionPicker.tsx's docblock carries
// the measurement, taken at top = -2,635px).
//
// TWO STICKY SIBLINGS AT `top: 0` DO NOT STACK — they occupy the same 0 and the
// later one paints over the earlier, so a second sticky box would have to know
// the first one's height, which is content-dependent (the strip grows a line
// when the act descriptor is readable). A wrapper around both was rejected for
// a sharper reason: it would make the STRIP's own `position: sticky` dead code,
// and `poisons-effects-section-strip.sh` poison 1 — which deletes that line and
// requires rows [2b] [2c] to go red — would silently start passing. A poison
// that stops discriminating is worse than the defect it was written for.
//
// So the bar is a row inside the strip's own sticky box, passed to
// `SectionPicker` as children. It inherits permanence from the mechanism that
// is already proven and already poisoned.
//
// ═══ THE BUTTONS ARE NOT CHIPS ═══
//
// A `Chip` is what the tool-options bar's verbs are, and one of them is
// `Parallax preview`. A tab that looked like it would have put two controls
// reading `Parallax` and `Parallax preview` in the same visual tier on one
// screen — which is defect (c) of the walkthrough, "things that look like
// repeats of each other", authored fresh. These are a segmented control: one
// bordered group, the active segment filled, `role="tab"` and `aria-selected`
// so what they are is stated rather than implied by colour.

import React from 'react';
import { T } from '../ui';
import { useEditorStore } from '../../state/editorStore';
import { EFFECTS_SUB_TABS, type EffectsSubTabId } from '../../providers/effects-sub-tabs';

export default function EffectsSubTabBar(): React.ReactElement {
  const active = useEditorStore((s) => s.effectsSubTab);
  const setTab = useEditorStore((s) => s.setEffectsSubTab);
  return (
    <div
      role="tablist"
      aria-label="Effects job"
      data-effects-sub-tabs=""
      style={{
        display: 'flex', gap: 0, marginTop: T.s1,
        border: `1px solid ${T.border}`, borderRadius: T.rMd, overflow: 'hidden',
      }}>
      {EFFECTS_SUB_TABS.map((tab) => (
        <TabButton key={tab.id} id={tab.id} label={tab.label} title={tab.blurb}
          active={tab.id === active} onClick={() => setTab(tab.id)} />
      ))}
    </div>
  );
}

function TabButton({ id, label, title, active, onClick }: {
  id: EffectsSubTabId; label: string; title: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-effects-sub-tab={id}
      title={title}
      onClick={onClick}
      style={{
        flex: 1, minWidth: 0, padding: `${T.s1} ${T.s2}`,
        background: active ? T.accent : T.raised,
        color: active ? T.onAccent : T.textLo,
        border: 'none',
        font: 'inherit', fontSize: T.tXs, lineHeight: 1.6,
        cursor: active ? 'default' : 'pointer',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</button>
  );
}
