// The Donors facet's state: which converted donor zone is open, and the marquee
// on it. (The paste half is the paste slice's; see the plan.)
//
// Everything here is READ-ONLY with respect to the project: the page reads
// aeon's derived donor trees and never writes under `donors/`.

import { create } from 'zustand';
import type { DonorListing, DonorZone, PxRect } from '../../core/formats/donors/donor-tree';
import { listDonors, loadDonorZone } from '../../core/formats/donors/donor-tree';
import { PLAYER_PALETTE_CANDIDATES } from '../../core/project/aeon/player-palette';
import { createIpcFileAccess } from './classic-file-access';
import type { FileAccess } from '../../core/project/adapter';

export interface DonorState {
  /** The project root this state was read from; a different root resets it. */
  root: string | null;
  listing: DonorListing | null;
  /** The listing could not be READ (not absent: absent is a listing state). */
  listingError: string | null;
  selected: { donor: string; zone: string } | null;
  zone: DonorZone | null;
  zoneError: string | null;
  loadingZone: boolean;
  /** CRAM line 0 for display (the character palette), or null when unread. */
  line0: Uint8Array | null;
  marquee: PxRect | null;

  refresh(root: string, fa?: FileAccess): Promise<void>;
  openZone(donor: string, zone: string, fa?: FileAccess): Promise<void>;
  setMarquee(r: PxRect | null): void;
  reset(): void;
}

const INITIAL = {
  root: null, listing: null, listingError: null, selected: null, zone: null, zoneError: null,
  loadingZone: false, line0: null, marquee: null,
};

async function readLine0(fa: FileAccess): Promise<Uint8Array | null> {
  for (const p of PLAYER_PALETTE_CANDIDATES) {
    try {
      if (!(await fa.exists(p))) continue;
      const b = await fa.read(p);
      return b.length >= 32 ? b.slice(0, 32) : null;
    } catch {
      // Display only: an unreadable character palette draws line 0 in grey and
      // the page says line-0 cells exist; it does not stop the zone drawing.
      return null;
    }
  }
  return null;
}

export const useDonorStore = create<DonorState>((set, get) => ({
  ...INITIAL,

  async refresh(root, fa = createIpcFileAccess(root)) {
    if (get().root !== root) set({ ...INITIAL, root });
    try {
      const listing = await listDonors(fa);
      const line0 = await readLine0(fa);
      set({ listing, listingError: null, line0 });
    } catch (e) {
      set({ listing: null, listingError: (e as Error).message });
    }
  },

  async openZone(donor, zone, fa) {
    const root = get().root;
    if (!root) return;
    const access = fa ?? createIpcFileAccess(root);
    set({ selected: { donor, zone }, loadingZone: true, zoneError: null, zone: null, marquee: null });
    try {
      const z = await loadDonorZone(access, donor, zone);
      // A second open that started after this one wins; do not overwrite it.
      const cur = get().selected;
      if (cur?.donor !== donor || cur?.zone !== zone) return;
      set({ zone: z, loadingZone: false });
    } catch (e) {
      set({ zoneError: (e as Error).message, loadingZone: false });
    }
  },

  setMarquee(r) { set({ marquee: r }); },

  reset() { set({ ...INITIAL }); },
}));
