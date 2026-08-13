// Global vitest setup (registered in vitest.config's setupFiles): stands in for
// App.tsx's runtime-wiring effect, which is what registers the hub's undo-stack
// factories in the app. Without it every test that reaches a document history
// (activeHistory and everything downstream of it) would throw "No undo-stack
// factory registered", since the hub deliberately refuses to guess a stack type.
// Registration is idempotent and touches no store state.

import { registerHistoryFactories } from '../renderer/state/history-factories';

registerHistoryFactories();
