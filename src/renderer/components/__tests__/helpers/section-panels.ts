// WHICH COMPONENTS RENDER INSIDE A TITLED SECTION — derived from every call
// site of the section primitive itself.
//
// Extracted from panel-headings.test.ts, whose docblock is where the reasoning
// lives, and shared because a SECOND rule now needs the same list
// (panel-scrollers.test.ts). Both rules are about what a panel may do inside a
// titled section, and both were written after a hand-maintained list of panels
// missed one — so there must be exactly one derivation, or the next rule gets a
// third list to forget something in.
//
// The short version of why it is derived: `const PANELS = [three paths]` shipped
// aeon's Rings facet with its heading drawn twice, because RingPatternPalette
// was not one of the three. A guard that only checks what someone remembered is
// not a guard.
//
// ---------------------------------------------------------------------------
// AND WHY IT NO LONGER WALKS FACET MODULES (ROADMAP §5.1 item 18)
// ---------------------------------------------------------------------------
// Deriving from a hand-written list failed. Deriving from `workspace/facets/*`
// failed the SAME WAY one level up: the facet modules are where sections are
// *usually* declared, not where they are *defined to be* declared. A panel that
// groups its own sections — `<Panel><EffectsScenePanel /></Panel>`, with the
// four `<CollapsibleSection>`s inside the panel — was enumerated by neither
// rule, and the defect that escaped through that hole was 954px of layer cards
// painted over the SECTION ASSIGNMENT rows beneath them, invisible to ~4,000
// node tests.
//
// Both frames enumerate by what DEFINES a section slot rather than by what IS
// one. So this now scans **every .tsx under src/renderer for a
// `<CollapsibleSection>` call site**: the primitive and its consumers. A section
// cannot exist without one, so the enumeration is closed under composition
// depth — mounting a panel three components deeper does not remove it.
//
// Two consequences worth stating, because they are the honest residue:
//   * A section whose body is INLINE JSX (the effects panel) has no separate
//     panel file, so the DECLARING file is what the rules are checked against.
//     That is coarser than per-section but never blind.
//   * A `<CollapsibleSection>` rendered from a template string, a `React.
//     createElement` call, or a re-export under another name is still invisible.
//     `noSectionsOutsideTheScan` below is the tripwire for the last of those.
//
// A SOURCE scan, because these are .tsx and the renderer suite is node-only:
// nothing renders them, so nothing else can see either rule break.

import { expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';

/** `src/renderer/components` — panel paths are reported relative to it. */
export const COMPONENTS = join(__dirname, '..', '..');
/** `src/renderer` — the whole surface a section call site may live in. */
export const RENDERER = join(COMPONENTS, '..');

const read = (file: string): string => readFileSync(file, 'utf8');

const codeCache = new Map<string, string>();
/** A file's source with comments blanked — what every scan below reads. */
export function code(file: string): string {
  let c = codeCache.get(file);
  if (c === undefined) { c = stripComments(read(file)); codeCache.set(file, c); }
  return c;
}

/** Every .tsx under `src/renderer`, tests excluded — they render nothing. */
function rendererSources(dir: string = RENDERER): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...rendererSources(path));
    else if (entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Finding a call site, WITHOUT the regex that could not read half of them
// ---------------------------------------------------------------------------
// The previous derivation matched `<CollapsibleSection([^>]*)>`, and `[^>]*`
// stops at the first `>` in the source — including one inside a prop. Two of the
// effects panel's four sections carry `right={<IconButton icon={<span>Delete
// </span>} …/>}`, so the attribute scan ran into `<span>` and the match failed
// outright: those sections were unreadable even to a scan pointed at the right
// file. So the opening tag is found by BALANCING braces instead.

const TAG = 'CollapsibleSection';

/**
 * The source with its comments blanked out, quote-aware.
 *
 * Not cosmetic: EffectsScenePanel's own docblock quotes `<CollapsibleSection>
 * <Child` while explaining the bug this file's rewrite fixes, and a scan that
 * reads comments would have enrolled that sentence as a fifth, id-less section.
 * A guard that counts its subject out of prose is the same class of defect as
 * one that counts it out of the wrong directory.
 */
function stripComments(source: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += source[++i] ?? ''; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue; }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const skipped = source.slice(i, end === -1 ? source.length : end + 2);
      out += skipped.replace(/[^\n]/g, ' ');
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    out += c;
  }
  return out;
}

/** Index of the `>` that closes the opening tag begun at `from`, or -1. */
function endOfOpeningTag(source: string, from: number): number {
  let depth = 0;
  let quote = '';
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; continue; }
    if (c === '>' && depth === 0) return i;
  }
  return -1;
}

/** One `<CollapsibleSection …>…</CollapsibleSection>` as raw source. */
interface Site { readonly attrs: string; readonly body: string }

function sectionSites(source: string): Site[] {
  const out: Site[] = [];
  const open = `<${TAG}`;
  const close = `</${TAG}>`;
  let i = 0;
  while ((i = source.indexOf(open, i)) !== -1) {
    const nameEnd = i + open.length;
    // `<CollapsibleSectionHeader` is a different component.
    if (/\w/.test(source[nameEnd] ?? '')) { i = nameEnd; continue; }
    const openEnd = endOfOpeningTag(source, nameEnd);
    if (openEnd === -1) { i = nameEnd; continue; }
    // Balance nested sections so an outer body stops at its OWN closing tag.
    let depth = 1;
    let scan = openEnd + 1;
    let end = -1;
    while (depth > 0) {
      const nextOpen = source.indexOf(open, scan);
      const nextClose = source.indexOf(close, scan);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) { depth++; scan = nextOpen + open.length; continue; }
      depth--;
      if (depth === 0) { end = nextClose; break; }
      scan = nextClose + close.length;
    }
    out.push({ attrs: source.slice(nameEnd, openEnd), body: end === -1 ? '' : source.slice(openEnd + 1, end) });
    i = openEnd + 1;
  }
  return out;
}

/** `foo="bar"` or `foo={`bar${x}`}` or `foo={expr}`, as written. */
function attr(attrs: string, name: string): string | null {
  const quoted = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  if (quoted) return quoted[1];
  const tmpl = attrs.match(new RegExp(`\\b${name}=\\{\`([^\`]*)\`\\}`));
  if (tmpl) return tmpl[1];
  const braced = attrs.match(new RegExp(`\\b${name}=\\{([^{}]*)\\}`));
  return braced ? braced[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** One `<CollapsibleSection …>` anywhere in the renderer, with what it declares. */
export interface SectionTag {
  /** The file that declares it, relative to `src/renderer`, for failure messages. */
  owner: string;
  /** `id="…"`, the panel-state key — the readable name for this slot. */
  id: string;
  /** `title=…` as written (a literal, or the expression inside the braces). */
  title: string;
  /** `variant="…"`, defaulting to `content` exactly as the component does. */
  variant: 'content' | 'list';
  /** The first component it mounts, as a JSX tag name — `(inline)` when its body
   *  is plain markup rather than a component. */
  child: string;
}

/** A section plus every panel file its body reaches. */
export interface FacetSection extends SectionTag {
  /** Absolute path of the declaring file. */
  ownerFile: string;
  /** The separate panel files its body mounts, transitively — absolute paths
   *  under components/, `panelName`-able. Empty when the body is inline JSX. */
  reaches: string[];
  /**
   * The style objects that render INSIDE this section and live in the declaring
   * file: the literals in its body, plus the module-level constants its body
   * refers to by name (`<SectionBody style={LIST_BODY}>`).
   *
   * Per-section rather than per-file, because a file is not a section. Five of
   * the six panels the widened enumeration first flagged were flagged for a
   * scroller that is the surface's OWN container — Explorer's tree scroller, the
   * setup tab's page scroller, two canvas wrappers — declared in a file that also
   * happens to declare a section. Whole-file attribution called every one of them
   * a section overflow. They are not, and a guard that says so is a guard whose
   * verdict and reason disagree.
   */
  styles: string[];
}

/** Where `name` is imported from in `source`, as a module specifier. */
function importSpecifier(source: string, name: string): string | null {
  const m = source.match(
    new RegExp(`import\\s+(?:${name}\\b[^;]*|\\{[^}]*\\b${name}\\b[^}]*\\})\\s+from\\s+['"]([^'"]+)['"]`),
  );
  return m ? m[1] : null;
}

/** Resolve a relative module specifier from `fromFile` to a real .tsx panel
 *  file, or null (a .ts module has no JSX to title or scroll anything with). */
function resolvePanel(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const abs = resolve(dirname(fromFile), spec);
  for (const candidate of [`${abs}.tsx`, join(abs, 'index.tsx')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every component this source renders — the capitalised JSX tags in it. */
function renderedComponents(source: string): string[] {
  return [...new Set([...source.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]))];
}

const isUi = (file: string): boolean => file.startsWith(join(COMPONENTS, 'ui') + sep);

/** Every panel file reachable from `entry`, itself included. */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    // ui/ is shared chrome (PanelHeader, fields) — reached from everything, and
    // never the data-driven thing a layout rule is about.
    if (isUi(file)) continue;
    const source = code(file);
    for (const name of renderedComponents(source)) {
      const spec = importSpecifier(source, name);
      const next = spec ? resolvePanel(file, spec) : null;
      if (next) queue.push(next);
    }
  }
  return [...seen].filter((f) => !isUi(f));
}

// ---------------------------------------------------------------------------
// The style objects that render inside one section
// ---------------------------------------------------------------------------

/**
 * Flat style blocks in a source, with `${…}` interpolations flattened first so a
 * template literal's braces cannot cut a block in half.
 *
 * Lives here rather than in each test because both rules and the per-section
 * resolution below must agree on what "a style object" is.
 */
export function styleBlocks(source: string): string[] {
  return (source.replace(/\$\{[^{}]*\}/g, 'X').match(/\{[^{}]*\}/g) ?? []);
}

/** The balanced `{…}` beginning at `open`, or null. */
function objectLiteral(source: string, open: number): string | null {
  let depth = 0;
  let quote = '';
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return source.slice(open, i + 1); }
  }
  return null;
}

/**
 * Every module-level style object in a file, by the name a JSX `style` prop
 * would refer to it as: `LIST_BODY`, and `styles.scanList` for the nested-record
 * form (`const styles = { scanList: {…}, canvasWrap: {…} }`), which is how
 * SpriteMode, Explorer and the setup tab all write theirs.
 */
function namedStyles(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of source.matchAll(/^(?:export )?const (\w+)(?::[^=]*)? = \{/gm)) {
    const literal = objectLiteral(source, m.index! + m[0].length - 1);
    if (!literal) continue;
    out.set(m[1], literal);
    for (const inner of literal.matchAll(/(\w+):\s*\{/g)) {
      const nested = objectLiteral(literal, inner.index! + inner[0].length - 1);
      if (nested) out.set(`${m[1]}.${inner[1]}`, nested);
    }
  }
  return out;
}

/** The `style` prop of one JSX opening tag: a name, an inline literal, or null. */
function styleProp(attrs: string): { ref?: string; inline?: string } | null {
  const at = attrs.search(/\bstyle=\{/);
  if (at === -1) return null;
  const open = attrs.indexOf('{', at);
  if (attrs[open + 1] === '{') {
    const inline = objectLiteral(attrs, open + 1);
    return inline ? { inline } : null;
  }
  const whole = objectLiteral(attrs, open);
  return whole ? { ref: whole.slice(1, -1).trim() } : null;
}

/**
 * Style objects handed to a wrapper that itself declares `minHeight: 0`.
 *
 * `<SectionBody style={LIST_BODY}>` renders one div carrying BOTH — so
 * `{ overflowY: 'auto' }` is bounded by the column even though the constant says
 * nothing about height. Read off the wrapper (see `shrinkableWrappers`) rather
 * than exempted by name.
 */
function wrapperShrunk(body: string, wrappers: string[]): Set<string> {
  const out = new Set<string>();
  for (const w of wrappers) {
    const open = `<${w}`;
    let i = 0;
    while ((i = body.indexOf(open, i)) !== -1) {
      const nameEnd = i + open.length;
      if (/\w/.test(body[nameEnd] ?? '')) { i = nameEnd; continue; }
      const end = endOfOpeningTag(body, nameEnd);
      if (end === -1) break;
      const prop = styleProp(body.slice(nameEnd, end));
      if (prop?.ref) out.add(prop.ref);
      if (prop?.inline) out.add(prop.inline);
      i = end + 1;
    }
  }
  return out;
}

/**
 * EVERY TITLED SECTION IN THE RENDERER, with its variant, the separate panel
 * files its body mounts, and the style objects that render inside it.
 *
 * The closure is why ChunkGrid is covered at all: no call site mounts it, it is
 * what ChunkLibrary and ChunkPicker are two-line adapters over, and it is the
 * panel that WAS drawing a second title and WAS growing to 900px. `styles` is
 * why the effects panel is covered: its four sections have no child panel to
 * resolve, their bodies are inline JSX, and a child-only walk sees nothing.
 */
export function deriveSections(): FacetSection[] {
  const files = rendererSources();
  const owners = files.filter((f) => code(f).includes(`<${TAG}`));
  // A rename or a move must not silently empty this, and — the item-18 lesson —
  // must not silently narrow it back to one directory either.
  expect(owners.length, 'no CollapsibleSection call sites found at all').toBeGreaterThan(0);
  const inFacets = owners.filter((f) => f.includes(join('workspace', 'facets') + sep));
  expect(inFacets.length, 'no facet module declares a section — the scan has drifted').toBeGreaterThan(0);
  expect(owners.length - inFacets.length,
    'every section call site is a facet module: the scan is back to the frame item 18 was about')
    .toBeGreaterThan(0);

  const wrappers = shrinkableWrappers();
  // Loud on unmeasurable: the merge below is only sound while the wrapper really
  // does confer shrinkability, and `SectionBody` is the one every inline-bodied
  // section in this tree goes through.
  expect(wrappers, 'no ui primitive declares minHeight: 0 — the wrapper merge would silently exempt nothing')
    .toContain('SectionBody');

  const sections: FacetSection[] = [];
  for (const file of files) {
    const source = code(file);
    const named = namedStyles(source);
    for (const site of sectionSites(source)) {
      const reaches = new Set<string>();
      for (const name of renderedComponents(site.body)) {
        const spec = importSpecifier(source, name);
        const panel = spec ? resolvePanel(file, spec) : null;
        if (panel && !isUi(panel)) for (const f of closure(panel)) reaches.add(f);
      }
      const shrunk = wrapperShrunk(site.body, wrappers);
      const styles: string[] = [];
      const add = (key: string, block: string) =>
        styles.push(shrunk.has(key) ? `{ minHeight: 0, ${block.slice(1, -1).trim()} }` : block);
      for (const block of styleBlocks(site.body)) add(block, block);
      for (const [name, block] of named) {
        if (new RegExp(`\\b${name.replace('.', '\\.')}\\b`).test(site.body)) add(name, block);
      }
      sections.push({
        owner: file.slice(RENDERER.length + 1),
        ownerFile: file,
        id: attr(site.attrs, 'id') ?? '(no id)',
        title: attr(site.attrs, 'title') ?? '(no title)',
        variant: /\bvariant="list"/.test(site.attrs) ? 'list' : 'content',
        child: site.body.match(/<([A-Z]\w*)/)?.[1] ?? '(inline)',
        reaches: [...reaches].sort(),
        styles,
      });
    }
  }
  return sections;
}

/**
 * The separate panel FILES mounted inside a titled section, transitively.
 *
 * A file here is section content end to end, so a whole-file rule may be applied
 * to it. The files that merely DECLARE a section are `deriveOwners()` — for
 * those, only the per-section `styles` are section content.
 */
export function derivePanels(): string[] {
  const found = new Set<string>();
  for (const section of deriveSections()) for (const f of section.reaches) found.add(f);
  return [...found].sort();
}

/** The files that declare a section, whether or not they also supply its body. */
export function deriveOwners(): string[] {
  return [...new Set(deriveSections().map((s) => s.ownerFile))].sort();
}

/** A derived panel path as it reads in a failure message. */
export const panelName = (file: string): string =>
  (file.startsWith(COMPONENTS + sep) ? file.slice(COMPONENTS.length + 1) : file.slice(RENDERER.length + 1));

// ---------------------------------------------------------------------------
// What a wrapper contributes
// ---------------------------------------------------------------------------

/**
 * The components in `components/ui` whose OWN style declares `minHeight: 0`.
 *
 * A style constant handed to one of them (`<SectionBody style={LIST_BODY}>`) is
 * bounded by the column even though the constant itself says nothing about
 * height — the shrink permission is one level up, in the wrapper. Read out of
 * the primitive rather than exempted by name, so a wrapper that stops declaring
 * it stops conferring it.
 */
export function shrinkableWrappers(): string[] {
  const source = read(join(COMPONENTS, 'ui', 'primitives.tsx'));
  const out: string[] = [];
  for (const m of source.matchAll(/export function (\w+)\(/g)) {
    const rest = source.slice(m.index! + m[0].length);
    const next = rest.search(/\nexport (?:function|const)\b/);
    if (/minHeight:\s*0\b/.test(next === -1 ? rest : rest.slice(0, next))) out.push(m[1]);
  }
  return out;
}
