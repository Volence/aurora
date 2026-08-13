// The ONE DocumentHistoryHub instance. Lives in its own import-free module so
// low-level stores (editorStore) and the runtime (project-runtime) can both
// reach it without an import cycle.

import { DocumentHistoryHub } from '../../core/editing/document-history';

export const documentHistoryHub = new DocumentHistoryHub();
