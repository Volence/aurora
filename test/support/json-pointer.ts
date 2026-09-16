/**
 * JSON Pointer (RFC 6901) helpers, and single-pointer document surgery.
 *
 * WHY THESE EXIST. `test/formats/regions-vectors.test.ts` has to assert that a
 * contract reject vector is refused FOR ITS STATED REASON and not merely
 * refused, because a validator that refuses everything passes a reject-only
 * assertion. The reason is stated in the vectors as PROSE (`why`), which no
 * assertion can read, so the location is DERIVED instead: the vectors' own
 * $comment promises that "Each FAIL case perturbs a PASS document in exactly
 * ONE forbidden way", and a perturbation of exactly one place is undone by an
 * edit at exactly one place. Finding that place, by search, gives a pointer the
 * refusal must name, with nothing copied from a measurement and nothing typed
 * by hand.
 *
 * Nothing here mutates its input. Every function returns a fresh structure.
 */

/** Escape one path segment for use inside a pointer (RFC 6901 section 3). */
export function escapeSegment(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** The segments of a pointer, unescaped. The root pointer '' has none. */
export function pointerSegments(pointer: string): string[] {
  if (pointer === '') return [];
  return pointer.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** The pointer to the container of `pointer`. The root's parent is the root. */
export function parentPointer(pointer: string): string {
  const at = pointer.lastIndexOf('/');
  return at <= 0 ? '' : pointer.slice(0, at);
}

/** The last segment of a pointer, unescaped, or null for the root. */
export function lastSegment(pointer: string): string | null {
  const segs = pointerSegments(pointer);
  return segs.length === 0 ? null : segs[segs.length - 1];
}

/** How many segments deep a pointer is. The root is 0. */
export function pointerDepth(pointer: string): number {
  return pointerSegments(pointer).length;
}

/**
 * Every pointer into `value`, deepest last within each branch, EXCLUDING the
 * root. Array elements are pointed at by index, which is what makes a
 * single-element repair expressible.
 */
export function allPointers(value: unknown, base = '', out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      out.push(`${base}/${i}`);
      allPointers(item, `${base}/${i}`, out);
    });
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const here = `${base}/${escapeSegment(k)}`;
      out.push(here);
      allPointers(v, here, out);
    }
  }
  return out;
}

export interface Resolved {
  /** Whether the pointer resolves at all. Absent and "present but null" stay different answers. */
  present: boolean;
  value: unknown;
}

/** Resolve a pointer against a document. */
export function resolvePointer(value: unknown, pointer: string): Resolved {
  let cur: unknown = value;
  for (const s of pointerSegments(pointer)) {
    if (Array.isArray(cur)) {
      const i = Number(s);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return { present: false, value: undefined };
      cur = cur[i];
    } else if (typeof cur === 'object' && cur !== null && Object.prototype.hasOwnProperty.call(cur, s)) {
      cur = (cur as Record<string, unknown>)[s];
    } else {
      return { present: false, value: undefined };
    }
  }
  return { present: true, value: cur };
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Walk to the container of `pointer` in an already-cloned document. */
function container(doc: unknown, pointer: string): unknown {
  const segs = pointerSegments(pointer);
  segs.pop();
  let cur: unknown = doc;
  for (const s of segs) {
    cur = Array.isArray(cur) ? cur[Number(s)] : (cur as Record<string, unknown>)[s];
  }
  return cur;
}

/** A copy of `doc` with the value at `pointer` removed. An array element is spliced out. */
export function withoutPointer(doc: unknown, pointer: string): unknown {
  const out = deepClone(doc);
  const last = lastSegment(pointer);
  if (last === null) throw new Error('withoutPointer: the root pointer cannot be removed');
  const parent = container(out, pointer);
  if (Array.isArray(parent)) parent.splice(Number(last), 1);
  else delete (parent as Record<string, unknown>)[last];
  return out;
}

/** A copy of `doc` with `value` written at `pointer`. */
export function withPointer(doc: unknown, pointer: string, value: unknown): unknown {
  const out = deepClone(doc);
  const last = lastSegment(pointer);
  if (last === null) throw new Error('withPointer: refusing to replace the whole document');
  const parent = container(out, pointer);
  if (Array.isArray(parent)) parent[Number(last)] = deepClone(value);
  else (parent as Record<string, unknown>)[last] = deepClone(value);
  return out;
}
