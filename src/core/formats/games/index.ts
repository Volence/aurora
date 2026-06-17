import type { SpriteFormatAdapter, SpriteFormatId } from '../sprite-format-adapter';
import { s4Adapter } from './s4';

/** Registry of per-game sprite format adapters, keyed by format id. */
const ADAPTERS: Partial<Record<SpriteFormatId, SpriteFormatAdapter>> = {
  s4: s4Adapter,
};

export const ADAPTER_IDS = Object.keys(ADAPTERS) as SpriteFormatId[];

export function getAdapter(id: SpriteFormatId): SpriteFormatAdapter {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`no sprite format adapter registered for "${id}"`);
  return adapter;
}
