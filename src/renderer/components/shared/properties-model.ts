// The properties panel's port contract.
//
// Deliberately the thinnest port in `shared/`: every value the panel draws
// arrives ALREADY FORMATTED, as a label and a string. That is not laziness, it
// is the whole engine-neutrality argument in one shape — aeon's "Grid 8x4" comes
// from `act.gridWidth`, classic's equivalent would come from `doc.fg.width`, and
// a port that carried either of those structures would carry its engine with it.
// Rows are the largest thing both engines can agree on.
//
// No `versionKey` here, unlike ObjectListPort. That field exists there because
// the list renders a port-supplied Thumb component that reads a mutable Map on
// its own, so the neutral side needs a signal for a repaint it cannot otherwise
// derive. Nothing in this panel outlives the props: the strings ARE the render,
// so the provider re-rendering (on whatever clock its engine keeps) is already
// the whole repaint signal. A key with nothing to key would be dead weight.

/** One `label ....... value` line. `label` doubles as the row's render key, so
 *  keep them unique within one section — a duplicate makes React reuse the wrong
 *  row. (Aeon cannot produce one; a future port silently could.) */
export interface PropertyRow {
  readonly label: string;
  readonly value: string;
}

/**
 * A drop-down rendered under a section's rows — the ONLY interactive control
 * this panel has (aeon's per-section background override).
 *
 * `onChange` receives the raw option value; what an empty value MEANS is the
 * port's business, not the panel's.
 */
export interface PropertySelect {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  onChange(value: string): void;
}

/** A titled group of rows. `title` doubles as the render key, so keep them
 *  unique within one port. */
export interface PropertySection {
  readonly title: string;
  readonly rows: readonly PropertyRow[];
  readonly select?: PropertySelect;
}

/**
 * Everything `PropertiesPanel` draws.
 *
 * Note what is NOT here: the `showObjectSelection` flag stays a provider
 * argument (`useAeonPropertiesPort({ showObjectSelection: true })`) rather than
 * a port field. The neutral panel could not act on it if it had it — deciding
 * whether to show a selected object means knowing the object's type, subtype
 * and position, which is engine-shaped data the port is designed not to carry.
 * The decision is still made at the mount site, which is what mattered about it.
 */
export interface PropertiesPort {
  readonly sections: readonly PropertySection[];
  /** Shown INSTEAD of the sections when there are none — "nothing is loaded",
   *  as distinct from an engine that simply has no properties to show, which
   *  passes no message and renders nothing at all. */
  readonly emptyMessage?: string;
}
