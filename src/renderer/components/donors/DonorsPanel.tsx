// The Donors facet's right-hand column: which donor zone, what the marquee
// holds, and (the paste slice) where it goes.
//
// THE EMPTY STATE NAMES THE COMMAND. Donor trees are gitignored and DERIVED in
// aeon, so "no donors" is the ordinary state of a fresh checkout, and the one
// line that fixes it is the most useful thing this column can say
// (docs/reviews/2026-09-17-s2-donor-page-read-half-settled.md). Absent and
// empty are said differently because they are different facts: absent means
// the converter never ran here, empty means something is under donors/ that
// is not a converted zone.

import React from 'react';
import { Panel, CollapsibleSection, SectionBody } from '../ui';
import { Hint, NOTE, WARN } from '../effects/column-layout';
import { T } from '../ui/theme';
import { useDonorStore } from '../../state/donorStore';
import { useProjectStore } from '../../state/projectStore';
import { CONVERTER_COMMAND, rectCensus } from '../../../core/formats/donors/donor-tree';
import { marqueeReadout, onCollisionGrid, COLLISION_QUANTUM_PX, MARQUEE_SNAP_PX } from '../../../core/formats/donors/donor-marquee';
import DonorPasteSection from './DonorPasteSection';

const CODE: React.CSSProperties = {
  fontFamily: T.fontMono, fontSize: T.tXs, color: T.textHi, background: T.raised,
  padding: `${T.s1} ${T.s2}`, borderRadius: T.rSm, userSelect: 'text', overflowWrap: 'anywhere',
};

function ConvertCommand({ root }: { root: string }): React.ReactElement {
  return (
    <div data-donors-command style={{ display: 'flex', flexDirection: 'column', gap: T.s1 }}>
      <div style={CODE}>{CONVERTER_COMMAND}</div>
      <div style={NOTE}>run in {root}</div>
    </div>
  );
}

/** Re-read donors/ (after running the converter, say). Offered in every state. */
function LookAgain({ root }: { root: string }): React.ReactElement {
  return (
    <button type="button" data-donors-refresh
            onClick={() => { void useDonorStore.getState().refresh(root); }}
            style={{ font: 'inherit', fontSize: T.tXs, alignSelf: 'flex-start', background: 'none', marginTop: T.s2,
              border: 'none', color: T.textLo, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
      Look again
    </button>
  );
}

function DonorList(): React.ReactElement {
  const root = useProjectStore((s) => s.config?.basePath ?? null);
  const listing = useDonorStore((s) => s.listing);
  const listingError = useDonorStore((s) => s.listingError);
  const selected = useDonorStore((s) => s.selected);
  if (!root) return <Hint style={{ marginBottom: 0 }}>No aeon project is open.</Hint>;
  if (listingError) {
    return (
      <Hint tone="warning" style={{ marginBottom: 0 }}>
        Aurora could not look under the donors directory: {listingError}. That is not the same as there
        being none, so nothing here says there are none.
      </Hint>
    );
  }
  if (!listing) return <Hint style={{ marginBottom: 0 }}>Looking for converted donor zones...</Hint>;
  if (listing.state === 'absent') {
    return (
      <div data-donors-state="absent">
        <Hint style={{ marginBottom: T.s2 }}>
          No donor zones have been converted in this checkout: {listing.root}/ does not exist. The trees are
          derived and gitignored in aeon, so this is the normal state until the converter runs. It takes
          about a second:
        </Hint>
        <ConvertCommand root={root} />
        <LookAgain root={root} />
      </div>
    );
  }
  if (listing.state === 'empty') {
    return (
      <div data-donors-state="empty">
        <Hint style={{ marginBottom: T.s2 }}>
          {listing.root}/ exists but holds no converted zone (no directory in it carries a zone.json).
          {listing.strays.length > 0 && ` Found: ${listing.strays.join(', ')}.`} Re-run the converter:
        </Hint>
        <ConvertCommand root={root} />
        <LookAgain root={root} />
      </div>
    );
  }
  return (
    <div data-donors-state="present" style={{ display: 'flex', flexDirection: 'column', gap: T.s2 }}>
      {listing.donors.map((d) => (
        <div key={d.donor} data-donor={d.donor}>
          <div style={{ ...NOTE, marginBottom: T.s1 }}>{d.donor}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: T.s1 }}>
            {d.zones.map((z) => {
              const on = selected?.donor === d.donor && selected?.zone === z;
              return (
                <button key={z} type="button" data-donor-zone={`${d.donor}/${z}`}
                        onClick={() => void useDonorStore.getState().openZone(d.donor, z)}
                        style={{
                          font: 'inherit', fontSize: T.tSm, padding: `${T.s1} ${T.s3}`, borderRadius: T.rSm,
                          border: `1px solid ${on ? T.accent : T.border}`, cursor: 'pointer',
                          background: on ? T.raised : T.surface, color: on ? T.textHi : T.textBase,
                        }}>{z}</button>
              );
            })}
          </div>
        </div>
      ))}
      <LookAgain root={root} />
    </div>
  );
}

function ZoneFacts(): React.ReactElement | null {
  const zone = useDonorStore((s) => s.zone);
  if (!zone) return null;
  const m = zone.manifest;
  return (
    <div data-donor-facts style={{ ...NOTE, marginTop: T.s2, marginBottom: 0 }}>
      {m.donor}/{m.zone}: {m.gridW} x {m.gridH} sections, {m.tilesetTiles} tiles; crop x {m.cropPx.x}..
      {m.cropPx.x + m.cropPx.w}, y {m.cropPx.y}..{m.cropPx.y + m.cropPx.h} px.
      {m.cramLine0PaintedCells !== null && m.cramLine0PaintedCells > 0 && (
        <span style={WARN}> {m.cramLine0PaintedCells} painted cells name CRAM line 0, the character
          palette aeon never lets a zone write: they draw in the character&apos;s colours here and in game.</span>
      )}
    </div>
  );
}

function Selection(): React.ReactElement {
  const zone = useDonorStore((s) => s.zone);
  const marquee = useDonorStore((s) => s.marquee);
  if (!zone) return <Hint style={{ marginBottom: 0 }}>Open a donor zone, then drag on it to mark a rectangle.</Hint>;
  if (!marquee) {
    return (
      <Hint style={{ marginBottom: 0 }}>
        Drag on the donor zone to mark a rectangle. It snaps to the {MARQUEE_SNAP_PX} px cell grid and stays inside the
        crop (the dimmed area is the converter&apos;s padding, which a paste may not take). Right-drag
        pans, the wheel zooms.
      </Hint>
    );
  }
  const c = rectCensus(zone, marquee);
  return (
    <div data-donor-selection>
      <div data-donor-readout style={{ ...CODE, marginBottom: T.s2 }}>{marqueeReadout(marquee)}</div>
      <div data-donor-census style={{ ...NOTE, marginBottom: T.s1 }}>
        {c.painted} of {c.cells} cells painted; collision: {c.solidA} solid cells on plane A, {c.solidB} on
        plane B.
      </div>
      {!onCollisionGrid(marquee) && (
        <div data-donor-grid-advisory style={{ ...WARN, marginBottom: 0 }}>
          The origin is not on the {COLLISION_QUANTUM_PX} px collision grid, so this rectangle cannot be
          pasted on a section boundary: aeon refuses a paste that moves collision by anything but a multiple
          of {COLLISION_QUANTUM_PX} px (R12). Move the marquee by {MARQUEE_SNAP_PX} px, or paste it off the grid with a reason.
        </div>
      )}
    </div>
  );
}

export default function DonorsPanel(): React.ReactElement {
  return (
    <Panel width={300} scroll column="aeon-donors">
      <CollapsibleSection id="aeon.donors.list" title="Donor zones">
        <SectionBody><DonorList /><ZoneFacts /></SectionBody>
      </CollapsibleSection>
      <CollapsibleSection id="aeon.donors.selection" title="Selection">
        <SectionBody><Selection /></SectionBody>
      </CollapsibleSection>
      <DonorPasteSection />
    </Panel>
  );
}
