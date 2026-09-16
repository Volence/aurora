// MIGRATE SECTIONS — the app's side of editor spec §4. Pure: an `Act` and the
// act's descriptor wiring in, a plan and a command out. No store reads, no
// React, no I/O, so the node suite drives the real decision rather than a copy
// of it (the rule `regions-aeon.ts` and `section-wiring.ts` both state).
//
// The WHAT is next door in `core/editing/migrate-sections.ts`, with §4's three
// superseded sentences answered in its header. This file is the assembly: which
// fields of the model feed it, which act key it writes, and the two states in
// which a migration is REFUSED before it is planned at all.
//
// ═══ WHY AN EXISTING DOCUMENT REFUSES ══════════════════════════════════════
//
// §4 describes the one-way trip from sidecars to a document and says nothing
// about running it twice. Running it over an act that already HAS regions would
// replace every authored rectangle with the section grid — recoverable through
// undo, but an author who painted for an hour would have to notice in time. So
// an act with a document refuses with a sentence that says what to do instead,
// and an act whose `regions.json` Aurora REFUSED refuses too: the model holds no
// regions there through no fault of the author's, and migrating would mean
// planning a write for a file the save is deliberately leaving alone.

import type { Act } from '../../core/model/s4-types';
import { SECTION_PIXEL_SIZE } from '../../core/model/s4-types';
import type { MigrateSectionsCommand } from '../../core/editing/commands';
import {
  planSectionMigration,
  type MigrationPlan,
  type MigrationSection,
  type MigrationUnkeyedRow,
  type MigrationConditionalRow,
} from '../../core/editing/migrate-sections';
import type { SectionRasterWiring } from '../../core/formats/effects/section-wiring';

/**
 * The regions document's `act` key, e.g. `ojz_act1`.
 *
 * ONE PLACE, because it is a value that crosses to aeon: the generator binds the
 * document to an act by it and aeon's own golden spells it this way. A second
 * composition somewhere else is how the file for act 1 comes to say `act1`.
 * Legality is the planner's check, not a silent repair here.
 */
export function actRegionsKey(zoneId: string, actId: string): string {
  return `${zoneId}_${actId}`;
}

/** What a migration would do to this act, and the command that does it. */
export interface MigrationOffer {
  plan: MigrationPlan;
  /** Null whenever the plan refuses. Never a partial command. */
  command: MigrateSectionsCommand | null;
}

/**
 * Plan the migration of ONE act, from the model the app has open.
 *
 * `wiring` is the act's `SectionRasterWiring`, which the load fills from aeon's
 * act descriptor. Its `descriptor.parsed` flag is carried through as
 * `presetsUsable`, so a descriptor Aurora could not read refuses the migration
 * with that sentence instead of migrating every section to no preset — "I could
 * not look" is never "there is nothing there".
 */
export function planActMigration(
  act: Act, zoneId: string, wiring: SectionRasterWiring,
): MigrationOffer {
  if (act.regions.unreadable !== null) {
    return {
      command: null,
      plan: {
        document: null,
        sidecars: [],
        notes: [],
        refusals: [
          `${act.regions.unreadable.path} exists and Aurora could not read it `
          + `(${act.regions.unreadable.reason}), so this act's regions are neither written nor `
          + 'removed by a save. Fix that file by hand and reopen the project; migrating now would '
          + 'plan a write the save is deliberately suppressing.',
        ],
      },
    };
  }
  if (act.regions.document !== null) {
    return {
      command: null,
      plan: {
        document: null,
        sidecars: [],
        notes: [],
        refusals: [
          `${act.id} already has ${act.regions.document.regions.length} `
          + `${act.regions.document.regions.length === 1 ? 'region' : 'regions'}. Migration builds `
          + 'a document FROM the section sidecars and would replace every one of them, so it '
          + 'refuses rather than overwrite authored work. Delete the regions first if that is '
          + 'what you mean.',
        ],
      },
    };
  }

  const sections: (MigrationSection | null)[] = act.sections.map((section, index) => (
    section === null ? null : {
      // The FLAT SLOT is the identity that matters — `row * gridWidth + col` is
      // how every other consumer maps a section to its cell (section-ops.ts) —
      // and `Section.index` is carried along with it rather than trusted in its
      // place, so a model whose two disagree refuses below instead of writing a
      // region over the wrong cell.
      index,
      sidecar: {
        sceneRef: section.sceneRef,
        rasterRef: section.rasterRef,
        bgLayoutRef: section.bgLayoutRef,
        paletteRef: section.paletteRef,
      },
    }
  ));
  const disagreeing = act.sections
    .map((section, index) => (section !== null && section.index !== index ? index : -1))
    .filter((i) => i >= 0);

  const unkeyed: MigrationUnkeyedRow[] = (wiring.unkeyedRows ?? []).map((row) => ({
    preset: row.preset,
    // `edges` is optional on the interface only because a hand-built wiring in a
    // test may omit it; an omission here is the same refusal a null is, and it
    // is spelled out rather than left to `undefined` reaching the planner.
    edges: row.edges ?? null,
    line: row.line,
    constructorName: row.constructorName,
  }));

  // The rows the reader left out because they sit inside a build condition.
  // NOT migrated (the 2026-09-16 ruling) and NOT refused (its 09:0xZ
  // amendment) — passed on only so the plan can say they were left out.
  const conditional: MigrationConditionalRow[] = (wiring.conditionalRows ?? []).map((row) => ({
    preset: row.preset,
    line: row.line,
    constructorName: row.constructorName,
    condition: row.condition,
  }));

  const plan = planSectionMigration({
    actKey: actRegionsKey(zoneId, act.id),
    gridWidth: act.gridWidth,
    gridHeight: act.gridHeight,
    sectionSize: SECTION_PIXEL_SIZE,
    sections,
    presets: wiring.bindings,
    presetsUsable: wiring.descriptor.parsed,
    presetsUnusableReason: wiring.descriptor.reason
      ?? `${wiring.descriptor.path} published no section bindings`,
    unkeyed,
    conditional,
  });

  if (disagreeing.length > 0) {
    plan.refusals.push(
      `${disagreeing.length} of this act's sections carry an \`index\` that is not their slot `
      + `(${disagreeing.join(', ')}), so which cell of the grid each one occupies cannot be read `
      + 'off either number with confidence',
    );
    plan.document = null;
    plan.sidecars = [];
  }

  if (plan.document === null || plan.refusals.length > 0) return { plan, command: null };

  return {
    plan,
    command: {
      type: 'migrate-sections',
      description: `Migrate ${act.id}'s ${plan.sidecars.length} sections to `
        + `${plan.document.regions.length} regions`,
      // Act-ambient: this command writes every section of the act, so there is
      // no one section to record it on (commands.ts).
      sectionIndex: -1,
      oldDocument: null,
      newDocument: plan.document,
      sections: plan.sidecars.map((s) => ({ index: s.index, old: s.old, next: s.next })),
    },
  };
}
