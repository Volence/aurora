// src/renderer/components/home/OpenByPath.tsx
//
// THE SECOND DOOR (UX seat A, F1).
//
// The finding: Aurora advertises exactly one way in, `Open Project…`, it is a
// native `dialog.showOpenDialog`, and the seat that clicked it observed nothing
// at all - no dialog anywhere on the display, no page change, nothing on
// stderr, with the main process demonstrably answering an Aether request 4.7 ms
// into the outstanding click. That seat REFUSED to call the missing dialog an
// app defect, and this component does not either: a native modal under a
// headless X server with no window manager renders nothing and looks exactly
// like a dead button, which is a hazard this workspace has already paid for
// once. Nothing here depends on settling that question.
//
// WHAT DOES NOT DEPEND ON IT is the shape the seat actually hit: one entry
// point, native, and when it does not open there is no path field, no recents
// on a fresh profile and no drop target. A person whose desktop portal is
// misconfigured lands exactly where the seat landed with no way forward. This
// is the way forward.
//
// WHY A FIELD AND NOT `argv`, which was the seat's other suggestion. Three
// reasons, in the order they decided it:
//   1. The finding is a person stuck INSIDE the app. A directory on argv does
//      not remove that dead end, it replaces it with "quit, remember the flag,
//      relaunch" - and it is unavailable to the reader who is already looking
//      at the Home tab.
//   2. It costs the perimeter nothing. This field calls `onOpenPath`, which App
//      wires to `openProjectByPath` - literally the road the recents rows
//      already take, `useProject.openPath`, which awaits `confirmProjectOpen()`
//      before touching either store and is the one declared user door in
//      shell/__tests__/project-open-door-census.test.ts. A boot-time argv open
//      would be a NEW caller on that perimeter whose safety rests on "nothing
//      can be dirty at boot" - a census bet this repo's own open-guard header
//      records losing four times.
//   3. It buys argv's other advantage anyway. A CDP walk can type into an
//      `<input>` and press a button with real key and pointer events, which is
//      what the lens seats want; it does not need a debug build to get in.
//
// AND IT IS NOT A DEBUG DOOR. `window.__dbg.aeon.open` / `openDir` exist and are
// what the seat fell back to, but they ship only under VITE_AURORA_DEBUG and
// call the switch primitives raw with no guard at all. A door only a debug build
// has is exactly what F1 says is not enough.

import React, { useState } from 'react';
import { T } from '../ui';
import { submitTypedPath } from './typed-path-open';

export interface OpenByPathProps {
  /** App passes `openProjectByPath` (= useProject.openPath): the GUARDED road. */
  onOpenPath: (dir: string) => void;
  /** Shown above the field. Differs between "no project yet" and "switch". */
  label: string;
}

export default function OpenByPath({ onOpenPath, label }: OpenByPathProps): React.ReactElement {
  const [text, setText] = useState('');
  // The parser's own sentence, held until the next keystroke. Rendered in place
  // rather than toasted: a toast for a refusal about the field you are looking
  // at makes you read somewhere else and then expires, and this app's own
  // refusal style (seat A's F4, quoted approvingly) is to say the rule, the
  // legal shape and what the value still is, in front of the control.
  //
  // AND IT RENDERS BELOW THE ROW, WHICH IS SEAT A'S F4 AVOIDED RATHER THAN
  // REPEATED. F4 is a validation message that appeared BETWEEN two fields,
  // moving the next one 120 px under the reader's hand so their typing landed
  // appended to a value they thought they had replaced. A message inserted below
  // the only control in this group cannot move that control: the input keeps
  // focus and keeps its position, and everything that shifts is downstream
  // content nobody is mid-gesture on.
  const [refusal, setRefusal] = useState<string | null>(null);

  // The decision lives in typed-path-open.ts, where a node-only suite can
  // execute it; this component owns only the value, the key and the placement.
  function submit(): void { submitTypedPath(text, onOpenPath, setRefusal); }

  return (
    <div style={styles.wrap} data-testid="open-by-path">
      <div style={styles.label}>{label}</div>
      <div style={styles.row}>
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); if (refusal) setRefusal(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="/home/you/s1disasm"
          aria-label="Project directory path"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          style={styles.input}
        />
        <button onClick={submit} style={styles.go}>Open</button>
      </div>
      {refusal !== null && (
        <div style={styles.refusal} role="alert">{refusal}</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 },
  label: { fontSize: T.t2xs, color: T.textLo },
  row: { display: 'flex', gap: 6, alignItems: 'stretch' },
  input: {
    flex: 1, minWidth: 0, padding: '7px 10px', background: T.void,
    border: `1px solid ${T.border}`, borderRadius: T.rMd,
    color: T.textHi, fontSize: T.tSm, fontFamily: T.fontMono,
  },
  go: {
    padding: '7px 16px', background: T.raised, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd,
    fontSize: T.tSm, fontWeight: T.wMedium, cursor: 'pointer', flexShrink: 0,
  },
  refusal: { fontSize: T.t2xs, color: T.error, lineHeight: 1.45, maxWidth: 620 },
};
