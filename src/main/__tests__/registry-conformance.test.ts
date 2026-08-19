// EDITOR_METHODS is consumed by the MCP server (mcp-server.ts) and by the Aether
// adapter (aether/adapter.ts) so the two never drift — editor-methods.ts's own
// header calls that the keystone. It was true by construction and asserted
// nowhere; these are the assertions.
//
// ON THE kind -> HANDLER CASE MAPPING, read this before adding to it:
// TypeScript ALREADY guarantees it, twice over. `EditorMethod.kind` is typed
// `AgentRequest['kind']`, so a registry entry cannot name a kind outside the
// union; and agent-handler.ts closes its switch with `const exhaustive: never =
// req`, so the union cannot gain a member without a case. `npx tsc --noEmit -p
// tsconfig.json` is green on this tree and enforces both. What is NOT guaranteed
// is that anyone runs it: there is no `typecheck` script, and `vitest run` does
// not typecheck. So the case-label check below is a BACKSTOP wired into the real
// runner, and it is written to read the switch's actual case labels (anchored,
// one per line) rather than `src.includes(...)` — a bare substring search would
// be satisfied by the kind appearing in a comment, and this file's subject is
// precisely comments that claim what nothing checks.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { EDITOR_METHODS } from '../editor-methods';
import { capabilities } from '../aether/adapter';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

const HANDLER = '../renderer/agent/agent-handler.ts';
const ADAPTER = 'aether/adapter.ts';

/** Every `case '<label>':` the handler's switches actually open. */
function handlerCaseLabels(): Set<string> {
  const src = read(HANDLER);
  return new Set(Array.from(src.matchAll(/^\s*case '([^']+)':/gm), (m) => m[1]));
}

/**
 * Method names `handleRequest` answers BEFORE it reaches the registry dispatch
 * (`initialize`, `initialized`, `editor/ping`). Read out of the adapter rather
 * than hardcoded — a registry entry named after one of these would be
 * advertised by `capabilities()` and still never dispatch.
 */
function adapterReservedMethods(): Set<string> {
  const src = read(ADAPTER);
  return new Set(Array.from(src.matchAll(/req\.method === '([^']+)'/g), (m) => m[1]));
}

describe('registry conformance', () => {
  it('exposes every method on the Aether surface as editor/<name>', () => {
    const advertised = new Set(capabilities().methods);
    for (const m of EDITOR_METHODS) {
      expect(advertised.has(`editor/${m.name}`), `editor/${m.name} is not advertised`).toBe(true);
    }
  });

  it('has globally unique tool names — MCP registration requires it', () => {
    const names = EDITOR_METHODS.map((m) => m.name);
    expect(new Set(names).size, `duplicate tool name in ${names.join(', ')}`).toBe(names.length);
  });

  it('has globally unique kinds — two tools sharing one would silently dispatch alike', () => {
    // The copy-paste failure the name check cannot see: clone an entry, rename
    // it and its params, forget the `kind`. Both tools type-check, both are
    // advertised, and the new one runs the old one's handler on params it never
    // declared. `set_palette`/`set_level_palette` are the registry's own note
    // that a name and a kind are distinct axes.
    const byKind = new Map<string, string[]>();
    for (const m of EDITOR_METHODS) byKind.set(m.kind, [...(byKind.get(m.kind) ?? []), m.name]);
    const shared = [...byKind].filter(([, names]) => names.length > 1);
    expect(shared.map(([k, names]) => `${k} <- ${names.join(' + ')}`), 'tools sharing a kind').toEqual([]);
  });

  it('has a handler case for every method kind', () => {
    const cases = handlerCaseLabels();
    // Loud rather than green: if agent-handler.ts stops being a switch (a
    // dispatch table, say) this regex reads nothing and every assertion below
    // would pass by measuring an empty set.
    expect(cases.size, `read no case labels out of ${HANDLER} — this guard is blind`).toBeGreaterThan(20);
    for (const m of EDITOR_METHODS) {
      expect(cases.has(m.kind), `agent-handler.ts has no case for '${m.kind}'`).toBe(true);
    }
  });

  it('names every method in snake_case', () => {
    // The rename nothing else can see. The advertised-surface check reads the
    // same array the adapter does and the handler check keys on `kind`, so a
    // renamed tool stays self-consistent and silent — while every client that
    // called it by name breaks.
    for (const m of EDITOR_METHODS) {
      expect(m.name, `'${m.name}' is not a snake_case tool name`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('names no method the Aether adapter answers itself', () => {
    const reserved = adapterReservedMethods();
    expect(reserved.has('editor/ping'), 'adapter reserved-method scan found nothing to reserve').toBe(true);
    for (const m of EDITOR_METHODS) {
      expect(reserved.has(`editor/${m.name}`), `editor/${m.name} is shadowed by the adapter's own handler`).toBe(false);
    }
  });

  it('gives every method a description — an agent has nothing else to go on', () => {
    // The description is the ENTIRE spec an agent sees: it picks the tool and
    // shapes the call from this string. An empty one ships an invisible tool.
    for (const m of EDITOR_METHODS) {
      expect(m.description.trim(), `${m.name} has no description`).not.toBe('');
    }
  });

  it('declares every param as a zod schema', () => {
    // The adapter builds `z.object(m.params)` and MCP hands `m.params` to
    // registerTool as the input schema. A non-schema value in there is a
    // `z.ZodRawShape` type error only if it is not `any` — and it survives
    // module load either way, failing at the first call that parses params.
    for (const m of EDITOR_METHODS) {
      for (const [key, schema] of Object.entries(m.params)) {
        expect(schema instanceof z.ZodType, `${m.name}.${key} is not a zod schema`).toBe(true);
      }
    }
  });

  it('never names a param `kind` — it would hijack its own dispatch', () => {
    // BOTH consumers spread the params AFTER the discriminant:
    //   adapter.ts:73   forward({ kind: m.kind, ...parsed.data } as AgentRequest)
    //   mcp-server.ts:38 forward({ kind: m.kind, ...args }       as AgentRequest)
    // so a param called `kind` overwrites the routing key and sends the request
    // to some other handler entirely. The `as AgentRequest` on both lines is
    // what makes this invisible: unlike the kind->case mapping, there is NO
    // compiler backstop here at all.
    //
    // A caller cannot reach this — zod strips undeclared keys, so `parsed.data`
    // only ever holds what the entry itself declared. That is exactly why it
    // belongs here rather than in a runtime guard: the mistake is made by
    // whoever WRITES a registry entry, and it would ship green.
    for (const m of EDITOR_METHODS) {
      expect(Object.keys(m.params), `${m.name} declares a param named 'kind'`).not.toContain('kind');
    }
  });

  it('advertises the registry and nothing else', () => {
    // The other direction of the advertisement check. That one proves every
    // entry is reachable; this proves nothing UNREACHABLE is advertised. A
    // hand-added string in `capabilities().methods` is discoverable, dispatches
    // to METHOD_NOT_FOUND, and is otherwise completely silent — which matters
    // because the spec's own claim is that discovery IS the protocol.
    const expected = ['editor/ping', ...EDITOR_METHODS.map((m) => `editor/${m.name}`)];
    expect(new Set(capabilities().methods)).toEqual(new Set(expected));
  });
});
