import React from 'react';
import { useCanvasStore } from '../../state/canvasStore';
import CommitPlanView from './CommitPlanView';

/**
 * The canvas's commit panel: a `CommitPlanView` pointed at this document.
 *
 * Everything about targets, preview, refusals and applying lives in that view,
 * because an imported sheet commits through exactly the same machinery and two
 * copies would drift the first time a refusal's wording changed. All this does
 * is name the pixels.
 */
export default function CanvasCommitSection({ docId }: { docId: string }) {
  const doc = useCanvasStore((s) => s.docs.get(docId)?.doc);
  if (!doc) return null;
  return <CommitPlanView pixels={doc.pixels} palette={doc.palette} gridOrigin={doc.gridOrigin} />;
}
