/**
 * CURRENCY for the OWNED donor fixture: is its SHAPE still the shape aeon's
 * converter writes?
 *
 * The fixture (test/fixtures/donors/, FXZ/zone.provenance.json) cannot be vendored at
 * a revision the way aeon's clip manifests are: a donor tree is gitignored and
 * DERIVED in aeon, so there is no committed zone.json to compare bytes against.
 * What aeon does publish is the program that writes one. So the pin is the
 * converter's blob: the key-path set recorded in the sidecar was measured from
 * real runs of that exact file, and this row reads the file at aeon
 * origin/master through git objects (never the live tree) and says whether it is
 * still the one measured.
 *
 * KNOWN LIMIT, stated: the key set can also move through modules the converter
 * imports (s2_donor, collision_pipeline), and a converter edit that leaves the
 * shape alone reds this row anyway. The first is what the opt-in fidelity rig
 * (booked in docs/superpowers/plans/2026-09-25-s2-donor-page.md) re-measures from a real run; the second
 * costs one re-measure, which the red message spells out.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { peerRepo, resolveRev, readAtRev } from '../support/peer-repo';

const SIDECAR = resolve(__dirname, '../fixtures/donors/aeon-root/games/sonic4/data/donors/s2disasm/FXZ/zone.provenance.json');
const AEON_TIP = 'origin/master';

interface Sidecar {
  aeon: { revision: string; converter_path: string; converter_blob: string };
  re_measure: string;
}

describe('CURRENCY: the owned donor fixture against the converter aeon publishes', () => {
  const side = JSON.parse(readFileSync(SIDECAR, 'utf8')) as Sidecar;

  it(`${side.aeon.converter_path} at aeon ${AEON_TIP} is the blob the fixture shape was measured from`, (ctx) => {
    expect(side.aeon.converter_blob).toMatch(/^[0-9a-f]{40}$/);
    const aeon = peerRepo('aeon');
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); CANNOT MEASURE '
        + `whether ${side.aeon.converter_path} is still blob ${side.aeon.converter_blob}`);
      return;
    }
    const tip = resolveRev(aeon, AEON_TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon}; CANNOT MEASURE the converter's currency`);
      return;
    }
    const at = readAtRev(aeon, tip, side.aeon.converter_path);
    expect(at.ok, at.ok ? '' : at.why).toBe(true);
    if (!at.ok) return;
    // Printed on every run, green or red: which revision was compared.
    process.stdout.write(`donor-fixture-currency: compared ${side.aeon.converter_path} at aeon ${AEON_TIP} = ${tip}, `
      + `blob ${at.blob}, against the pinned ${side.aeon.converter_blob} (measured at ${side.aeon.revision})\n`);
    expect(
      at.blob,
      'NOT AN AURORA REGRESSION: aeon\'s converter moved since the fixture shape was measured.\n'
      + `  pinned blob ${side.aeon.converter_blob} (aeon ${side.aeon.revision})\n`
      + `  aeon ${AEON_TIP} = ${tip} has blob ${at.blob}\n`
      + `  Re-measure: ${side.re_measure}`,
    ).toBe(side.aeon.converter_blob);
  });
});
