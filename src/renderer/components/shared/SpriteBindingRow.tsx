import React from 'react';
import { T } from '../ui';

/**
 * "Preview sprite" picker — the footer aeon's object list puts under the rows.
 * Store-free and prop-driven (the port owns reading the bindings sidecar and
 * writing it back), so it is presentation only; it lives in shared/ for that
 * reason even though only the aeon port uses it today.
 */
export default function SpriteBindingRow({
  value, options, onChange,
}: {
  value: string;
  options: readonly string[];
  onChange(next: string): void;
}): React.ReactElement {
  return (
    <div style={styles.row}>
      <span style={styles.label}>Preview sprite</span>
      <select
        style={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title="Show this object as a sprite preview on the map"
      >
        <option value="">— none (box) —</option>
        {options.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    padding: '8px 12px', borderTop: `1px solid ${T.border}`, display: 'flex',
    flexDirection: 'column', gap: 4,
  },
  label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: T.textLo },
  select: {
    padding: '4px 6px', background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: 4, fontSize: T.tSm,
  },
};
