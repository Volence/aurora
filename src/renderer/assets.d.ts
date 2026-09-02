// Ambient declarations for non-code imports handled by the bundler (Vite).
// Standalone script file (no imports/exports) so the wildcard module
// declarations are global.
declare module '*.css';
declare module '*.svg';
// Vite's `?raw` suffix — the file's text, as a string. The in-app guide
// (components/guide/) reads docs/guides/*.md through it so the shipped page and
// the repository document are ONE file rather than two that drift.
declare module '*?raw' {
  const contents: string;
  export default contents;
}
