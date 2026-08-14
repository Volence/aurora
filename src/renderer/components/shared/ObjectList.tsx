import React from 'react';
import { T, SECTION_LIST_MAX_HEIGHT } from '../ui';
import { filterRows, type ObjectListPort, type ObjectRow } from './object-list-model';

/**
 * The one object list both engines render (stage-4 plan 3). Replaces aeon's
 * ObjectPalette and classic's ObjectLibraryPanel, which were the same panel —
 * "filterable list of rows, click to arm one for placement" — differing only in
 * decoration.
 *
 * IT IMPORTS NO STORE, deliberately. Rows, selection, writes and the repaint
 * signal all arrive through `port`, supplied per engine by
 * `providers/object-list-{aeon,classic}.ts`. That is not stylistic: aeon's
 * command executor THROWS when the focused document is not aeon, so a neutral
 * component holding a direct store or command import would hard-crash classic
 * on the first click rather than degrade. The two engines also repaint
 * off different signals — aeon mutates its project in place and ticks a version
 * clock, classic swaps an immutable doc — so subscribing here could only ever be
 * right for one of them. Hence `port.versionKey`.
 *
 * Accessibility is classic's, kept: `role="listbox"` / `role="option"` /
 * `aria-selected`, and the arm target is its own `<button>` sibling inside the
 * row rather than the whole row, because a row that must also host the secondary
 * "edit art" button cannot itself be a button (nested buttons are invalid HTML).
 */
export default function ObjectList({
  port, label,
}: {
  port: ObjectListPort;
  /** Names the listbox for screen readers, e.g. "Object library". */
  label: string;
}): React.ReactElement {
  const [filter, setFilter] = React.useState('');
  const visible = filterRows(port.rows, filter);
  const { Thumb, Footer, secondaryAction } = port;

  return (
    // rootProps first: a port contributes behaviour (classic's facet claim), not
    // layout, and must not be able to override the list's own styling.
    <div {...port.rootProps} style={styles.container}>
      <div style={styles.header}>
        <input
          style={styles.filter}
          placeholder="Filter…"
          aria-label={`Filter ${label.toLowerCase()}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div style={styles.list} role="listbox" aria-label={label}>
        {visible.length === 0 && (
          // Two distinct empty states: nothing to list at all is a project
          // problem, no matches is a filter the user can clear.
          <div style={styles.empty}>
            {port.rows.length === 0 ? (port.emptyMessage ?? 'Nothing to show') : 'No matches'}
          </div>
        )}
        {visible.map((row) => (
          <Row
            key={row.key}
            row={row}
            selected={row.key === port.selectedKey}
            onSelect={port.select}
            Thumb={Thumb}
            versionKey={port.versionKey}
            secondaryAction={secondaryAction}
          />
        ))}
      </div>
      {Footer && <Footer />}
    </div>
  );
}

/**
 * Memoized, and it genuinely bites: every prop below is referentially stable
 * across a re-render of the enclosing panel column. Both ports build `rows`
 * (hence each `row`) and `Thumb` under useMemo, `onSelect` is a useCallback with
 * no deps (aeon) or a module-level function (classic), `secondaryAction` is a
 * module constant or undefined, and `selected`/`versionKey` are a boolean and a
 * string. So a re-render driven by something the list does not read — a
 * live-edit tick during an object drag, a viewport pan — re-runs ObjectList but
 * skips all ~82 classic rows, each ~5 elements deep.
 *
 * No canvas cost either way: the thumbnail is `<Thumb key={versionKey}>`, and
 * versionKey only changes when the art it draws actually republished.
 */
const Row = React.memo(function Row({
  row, selected, onSelect, Thumb, versionKey, secondaryAction,
}: {
  row: ObjectRow;
  selected: boolean;
  onSelect: (key: string | null) => void;
  Thumb: ObjectListPort['Thumb'];
  versionKey: string;
  secondaryAction: ObjectListPort['secondaryAction'];
}): React.ReactElement {
  return (
    <div
      role="option"
      aria-selected={selected}
      style={{ ...styles.row, ...(selected ? styles.rowSelected : {}) }}
    >
      <button
        type="button"
        onClick={() => onSelect(row.key)}
        title={row.title ?? row.label}
        style={styles.rowMain}
      >
        {Thumb && (
          <span style={styles.thumbWrap}>
            {/* Keyed on the port's version so an art republish repaints the
                canvas: the neutral side cannot know what invalidated it. */}
            {row.hasArt ? <Thumb key={versionKey} rowKey={row.key} /> : null}
          </span>
        )}
        <span style={{ ...styles.badge, ...(selected ? styles.badgeSelected : {}) }}>{row.badge}</span>
        <span style={styles.label}>{row.label}</span>
      </button>
      {secondaryAction && row.hasArt && (
        <button
          type="button"
          onClick={() => secondaryAction.run(row.key)}
          title={secondaryAction.title(row)}
          aria-label={secondaryAction.title(row)}
          style={{ ...styles.secondary, ...(selected ? styles.secondarySelected : {}) }}
        >
          {secondaryAction.icon}
        </button>
      )}
    </div>
  );
});

const THUMB = 28;

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  // Outside the scroller below, so the filter is always on screen with the rows
  // it filters. (It is `sticky` as well, which now only matters for the enclosing
  // Panel's own scroll — harmless, and one less thing to re-derive if the list
  // ever hosts its own header row.)
  header: {
    position: 'sticky', top: 0, zIndex: 1, background: T.void,
    padding: '6px 8px', borderBottom: `1px solid ${T.border}`,
  },
  filter: {
    width: '100%', boxSizing: 'border-box', padding: '4px 8px',
    background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd, fontSize: 12,
  },
  // Bounded, so the rows scroll INSIDE the section instead of growing it. This
  // list is one of three sections in classic's Layout column since the Objects
  // merge (workspace/facets/s1-facets.tsx); unbounded, 82 rows would push
  // whatever a later task adds below it off the bottom of the world — the same
  // failure that hid the palette editor under the chunk grid. See
  // SECTION_LIST_MAX_HEIGHT for why the cap is a fixed px and not a vh share.
  list: {
    display: 'flex', flexDirection: 'column', padding: 4, gap: 2,
    maxHeight: SECTION_LIST_MAX_HEIGHT, overflowY: 'auto',
  },
  empty: { padding: 12, color: T.textLo, fontSize: 12 },
  row: {
    display: 'flex', alignItems: 'center', gap: 4, width: '100%',
    padding: '2px 4px', background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
    borderRadius: T.rMd, textAlign: 'left', color: T.textBase,
  },
  rowSelected: { background: T.accent, borderColor: T.accent, color: T.onAccent },
  rowMain: {
    display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
    padding: '1px 2px', background: 'transparent', border: 'none',
    cursor: 'pointer', textAlign: 'left', color: 'inherit',
  },
  thumbWrap: {
    width: THUMB, height: THUMB, flexShrink: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    fontFamily: T.fontMono, fontSize: 10, color: T.textLo, minWidth: 30, maxWidth: 72,
    flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  badgeSelected: { color: T.onAccent },
  label: { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  secondary: {
    flexShrink: 0, padding: '2px 6px', background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: T.rMd, cursor: 'pointer',
    color: T.textLo, fontSize: 12, lineHeight: 1,
  },
  secondarySelected: { color: T.onAccent, borderColor: T.onAccent },
};
