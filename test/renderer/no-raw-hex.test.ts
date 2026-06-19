// test/renderer/no-raw-hex.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

// Ratchet: lower this toward 0 as components migrate to tokens (ui/theme.ts).
// It must only ever DECREASE. Final task sets it to 0.
const MAX_RAW_HEX = 164;

const ROOT = join(__dirname, '..', '..', 'src', 'renderer');
const HEX = /#[0-9a-fA-F]{6}\b/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

function countRawHex(): { total: number; perFile: Record<string, number> } {
  const perFile: Record<string, number> = {};
  let total = 0;
  for (const file of walk(ROOT)) {
    if (basename(file) === 'theme.css') continue; // tokens live here (it's .css anyway)
    const hits = (readFileSync(file, 'utf8').match(HEX) ?? []).length;
    if (hits) { perFile[file] = hits; total += hits; }
  }
  return { total, perFile };
}

describe('design-token guardrail', () => {
  it(`has no more than ${MAX_RAW_HEX} raw hex literals in src/renderer`, () => {
    const { total } = countRawHex();
    // eslint-disable-next-line no-console
    console.log(`[guardrail] raw hex literals in src/renderer = ${total} (ceiling ${MAX_RAW_HEX})`);
    expect(total).toBeLessThanOrEqual(MAX_RAW_HEX);
  });
});
