import React from 'react';
import { useProjectStore, getCurrentAct, getCurrentZone, getActiveLevel } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import { T } from './ui';

export default function PropertiesPanel() {
  const project = useProjectStore((s) => s.project);
  const vpX = useViewStore((s) => s.vpX);
  const vpY = useViewStore((s) => s.vpY);
  const zoom = useViewStore((s) => s.zoom);
  const selection = useEditorStore((s) => s.selection);
  const tool = useEditorStore((s) => s.tool);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  // Re-read the selected object's live coordinates after a committed edit and
  // during an in-flight drag (which mutates the object without a command).
  useHistoryVersion();
  useEditorStore((s) => s.liveEditVersion);

  const state = useProjectStore.getState();
  const zone = getCurrentZone(state);
  const act = getCurrentAct(state);

  if (!project || !act) {
    return (
      <div style={styles.container}>
        <div style={styles.content}><span style={styles.propLabel}>No act loaded.</span></div>
      </div>
    );
  }

  const section = act.sections[activeSectionIndex];

  // Get selected item details. Objects are deliberately absent: their read-only
  // block here was superseded by the real editor in the Objects facet
  // (shared/ObjectInspector + providers/object-inspector-aeon, stage-4 plan 3
  // task 5), and showing the same four values uneditably beside an editable form
  // is the dead chrome that panel design forbids. Rings still have no editor, so
  // their readout stays.
  let selectedRing = null;
  if (selection && section && selection.type === 'ring') {
    selectedRing = section.rings[selection.index];
  }

  return (
    <div style={styles.container}>
      {/* No title of its own: every call site already wraps this in a
          CollapsibleSection titled "Properties" (layout/objects/rings/collision
          facets), and rendering a second header made the aeon panel read
          "PROPERTIES / PROPERTIES". The section header IS this panel's title. */}
      <div style={styles.content}>
        {/* Selection details */}
        {selectedRing && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Selected Ring</div>
            <Property label="Section" value={String(activeSectionIndex)} />
            <Property label="Position" value={`${selectedRing.x}, ${selectedRing.y}`} />
          </div>
        )}

        {(tool === 'paint-tile' || tool === 'paint-block') && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Paint Tool</div>
            <Property label="Tile Index" value={String(useEditorStore.getState().selectedTileIndex)} />
            <Property label="Palette" value={String(useEditorStore.getState().selectedPaletteLine)} />
          </div>
        )}

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Project</div>
          <Property label="Name" value={project.name} />
          {zone && <Property label="Zone" value={zone.name} />}
          {act && <Property label="Act" value={act.id} />}
          {act && <Property label="Grid" value={`${act.gridWidth}x${act.gridHeight}`} />}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Active Section</div>
          <Property label="Index" value={String(activeSectionIndex)} />
          {section && (
            <>
              <Property label="Objects" value={String(section.objects.length)} />
              <Property label="Rings" value={String(section.rings.length)} />
              <div style={styles.property}>
                <span style={styles.propLabel}>Background</span>
                <select
                  style={styles.select}
                  value={section.bgLayoutRef ?? ''}
                  onChange={(e) => {
                    const newRef = e.target.value === '' ? null : e.target.value;
                    if (newRef === section.bgLayoutRef) return;
                    const level = getActiveLevel(useProjectStore.getState());
                    if (!level) return;
                    executeCommand({
                      type: 'set-section-bg',
                      description: `Section ${activeSectionIndex} background`,
                      sectionIndex: activeSectionIndex,
                      oldRef: section.bgLayoutRef,
                      newRef,
                    }, level);
                  }}
                >
                  <option value="">Act default</option>
                  {project.bgLibrary.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {!section && <Property label="Status" value="(empty)" />}
        </div>

        {zone && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Art</div>
            <Property label="Tiles" value={String(zone.tileset.tiles.length)} />
          </div>
        )}

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Viewport</div>
          <Property label="Position" value={`${Math.round(vpX)}, ${Math.round(vpY)}`} />
          <Property label="Zoom" value={`${Math.round(zoom * 100)}%`} />
        </div>
      </div>
    </div>
  );
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.property}>
      <span style={styles.propLabel}>{label}</span>
      <span style={styles.propValue}>{value}</span>
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
    fontSize: 11, fontWeight: 600, color: T.accent, marginBottom: 4,
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
  },
  property: {
    display: 'flex', justifyContent: 'space-between', padding: '2px 0',
    fontSize: 12,
  },
  propLabel: {
    color: T.textBase,
  },
  propValue: {
    color: T.textHi, fontFamily: 'monospace', fontSize: 11,
  },
  select: {
    maxWidth: 120, fontSize: 11,
    background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: 2,
  },
};
