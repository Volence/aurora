// Red-first plants for the map-remount-clear parcel. Usage (from the worktree
// root): node scratchpad/map-remount-plant.mjs <ID>
//
// Each plant is one or more exact-anchor replacements. An anchor that does not
// occur EXACTLY once refuses the whole plant before anything is written, so a
// plant that silently missed cannot be read as a green row. After writing, every
// edited file is read back from disk and the replacement is confirmed present.
// Restore is NOT done here: the caller restores from the committed baseline
// (git show HEAD:<path> > <path>) and checks `git status`.
import { readFileSync, writeFileSync } from 'node:fs';

const MV = 'src/renderer/components/MapViewport.tsx';
const ES = 'src/renderer/state/editorStore.ts';

const POINTER_LAST = '  // it fires on the change itself, mounted or not, and never on a mount.\n';
const SUB_CLEAR = '  useEditorStore.setState({ marquee: null, pasting: false });\n});';

const PLANTS = {
  // The fix taken out: the mount-running component effect put back.
  P1_REMOUNT_CLEAR: [{
    file: MV, anchor: POINTER_LAST,
    replace: POINTER_LAST
      + '  useEffect(() => {\n'
      + '    useEditorStore.getState().setMarquee(null);\n'
      + '    useEditorStore.getState().setPasting(false);\n'
      + '  }, [currentZoneId, currentActId]);\n',
  }],
  // The paste half alone: a mount-running effect that disarms paste and leaves
  // the marquee, so the bare-remount row's PASTE expectation is the one reached.
  P1b_REMOUNT_DISARMS_PASTE: [{
    file: MV, anchor: POINTER_LAST,
    replace: POINTER_LAST
      + '  useEffect(() => {\n'
      + '    useEditorStore.getState().setPasting(false);\n'
      + '  }, [currentZoneId, currentActId]);\n',
  }],
  // The subscription clears nothing.
  P2_SUB_NOOP: [{ file: ES, anchor: SUB_CLEAR, replace: '});' }],
  // Project identity dropped: keyed on zone and act alone, as the old effect was.
  P3_NO_CONFIG: [{ file: ES, anchor: 's.config === prev.config\n    && ', replace: '' }],
  // THE BRIEF'S PRESCRIBED SHAPE, emulated: no subscription; a component effect
  // (re-run on act, zone and project) compares the scope NOW with the scope the
  // state was ARMED in, recorded when the marquee or paste went on.
  P4_ARMED_IN_AT_MOUNT: [
    { file: ES, anchor: SUB_CLEAR, replace: '});' },
    {
      file: MV, anchor: 'export default function MapViewport() {\n',
      replace: 'let armedInScope: { config: unknown; zone: string | null; act: string | null } | null = null;\n'
        + 'useEditorStore.subscribe((e, prev) => {\n'
        + '  if ((e.marquee && !prev.marquee) || (e.pasting && !prev.pasting)) {\n'
        + '    const p = useProjectStore.getState();\n'
        + '    armedInScope = { config: p.config, zone: p.currentZoneId, act: p.currentActId };\n'
        + '  }\n'
        + '});\n'
        + 'export default function MapViewport() {\n',
    },
    {
      file: MV, anchor: POINTER_LAST,
      replace: POINTER_LAST
        + '  useEffect(() => {\n'
        + '    const p = useProjectStore.getState();\n'
        + '    const a = armedInScope;\n'
        + '    if (a && (a.config !== p.config || a.zone !== p.currentZoneId || a.act !== p.currentActId)) {\n'
        + '      useEditorStore.getState().setMarquee(null);\n'
        + '      useEditorStore.getState().setPasting(false);\n'
        + '    }\n'
        + '  }, [currentZoneId, currentActId, project]);\n',
    },
  ],
  // setTool no longer disarms paste.
  P5_SETTOOL_KEEPS_PASTE: [{
    file: ES,
    anchor: 'setTool: (tool) => set({ tool, selection: null, pasting: false }),',
    replace: 'setTool: (tool) => set({ tool, selection: null }),',
  }],
  // map-coverage-3's MD6: the marquee arm of abandonStaleGestures keeps the drag.
  P6_MD6_STALE_ARM_KEEPS_DRAG: [{
    file: MV,
    anchor: '        marqueeDragStart.current = null;\n'
      + '        marqueeDragLast.current = null;\n'
      + '        isMarqueeDragging.current = false;\n'
      + '        note(gestureStaleReason(status));\n',
    replace: '        note(gestureStaleReason(status));\n',
  }],
};

const id = process.argv[2];
const plant = PLANTS[id];
if (!plant) {
  console.error(`unknown plant ${id}; known: ${Object.keys(PLANTS).join(', ')}`);
  process.exit(2);
}

// Validate every anchor against the CURRENT contents, applying in order per file.
const contents = new Map();
for (const step of plant) {
  const text = contents.get(step.file) ?? readFileSync(step.file, 'utf8');
  const count = text.split(step.anchor).length - 1;
  if (count !== 1) {
    console.error(`REFUSED ${id}: anchor occurs ${count} times in ${step.file}:\n${step.anchor}`);
    process.exit(3);
  }
  contents.set(step.file, text.replace(step.anchor, () => step.replace));
}
for (const [file, text] of contents) writeFileSync(file, text);

// Read back from disk: the replacement must be there.
for (const step of plant) {
  const onDisk = readFileSync(step.file, 'utf8');
  if (step.replace !== '' && !onDisk.includes(step.replace)) {
    console.error(`READ-BACK FAILED ${id}: replacement not on disk in ${step.file}`);
    process.exit(4);
  }
}
console.log(`APPLIED ${id} (${plant.length} step(s)) to ${[...contents.keys()].join(', ')}`);
