import './styles/theme.css';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ensureAdaptersRegistered } from './state/classic-bridge';

// Register the project adapters exactly once, at renderer startup. The classic
// (disasm) project layer runs detect/open in the RENDERER (see
// classicProjectStore's header), so the adapter registry — which core
// detect/openProject consult — must be populated on this side. This is the
// renderer's startup init spot; it's the same lifecycle as App's one-time
// registerAgentHandler(). ensureAdaptersRegistered() is idempotent, so the
// bridge's defensive call on first open is a no-op after this.
ensureAdaptersRegistered();

// Dev/investigation-only: expose window.__dbg for the headless CDP harnesses when
// launched with VITE_AURORA_DEBUG=1. The import is behind the flag so the module
// (and the stores it references only for driving) is tree-shaken out otherwise.
if (import.meta.env.VITE_AURORA_DEBUG === '1') {
  void import('./debug-hooks').then((m) => m.installDebugHooks());
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
