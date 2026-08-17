// Neutral properties panel. Takes a port; imports no store and no command.
//
// The import list is the point of this file. The version it replaces
// (components/PropertiesPanel.tsx) read four stores and dispatched an aeon
// command straight from the background <select>'s onChange — and that dispatch
// THROWS when the focused document is not an aeon command history (spec §3.0.1,
// state/editorStore.ts:372-381), so mounting that panel in a classic facet and
// touching the drop-down was a hard crash, not a no-op. The write now arrives as
// `select.onChange` from the engine's port, and classic's port supplies no
// select at all.

import React from 'react';
import { T } from '../ui';
import type { PropertiesPort, PropertySection, PropertySelect } from './properties-model';

export default function PropertiesPanel({ port }: { port: PropertiesPort }): React.ReactElement | null {
  const empty = port.sections.length === 0;
  // A port with nothing to say and no message renders NOTHING — not an empty
  // bordered box. A facet that mounts this for an engine with no properties
  // should be showing no panel, not a hollow one.
  if (empty && !port.emptyMessage) return null;

  return (
    <div style={styles.container}>
      {/* No title of its own: every call site already wraps this in a
          CollapsibleSection titled "Properties" (layout/objects/rings/collision
          facets), and rendering a second header made the aeon panel read
          "PROPERTIES / PROPERTIES". The section header IS this panel's title. */}
      <div style={styles.content}>
        {empty
          ? <span style={styles.propLabel}>{port.emptyMessage}</span>
          : port.sections.map((section) => <Section key={section.title} section={section} />)}
      </div>
    </div>
  );
}

function Section({ section }: { section: PropertySection }): React.ReactElement {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{section.title}</div>
      {section.rows.map((row) => (
        <div key={row.label} style={styles.property}>
          <span style={styles.propLabel}>{row.label}</span>
          <span style={styles.propValue}>{row.value}</span>
        </div>
      ))}
      {section.select && <Select select={section.select} />}
    </div>
  );
}

function Select({ select }: { select: PropertySelect }): React.ReactElement {
  return (
    <div style={styles.property}>
      <span style={styles.propLabel}>{select.label}</span>
      <select
        style={styles.select}
        value={select.value}
        onChange={(e) => select.onChange(e.target.value)}
      >
        {select.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    background: T.surface,
    flexShrink: 0,
  },
  content: {
    flex: 1, overflow: 'auto', padding: 8,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: T.tXs, fontWeight: T.wSemibold, color: T.accent, marginBottom: 4,
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
  },
  property: {
    display: 'flex', justifyContent: 'space-between', padding: '2px 0',
    fontSize: T.tSm,
  },
  propLabel: {
    color: T.textBase,
  },
  propValue: {
    color: T.textHi, fontFamily: T.fontMono, fontSize: T.tXs,
  },
  select: {
    maxWidth: 120, fontSize: T.tXs,
    background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: 2,
  },
};
