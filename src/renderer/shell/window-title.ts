// The window title, as a pure rule (census B-F3). WindowTitle.tsx reads the
// stores and hands this the three facts; this decides the string.
//
// WHY THE TITLE CARRIES AN UNSAVED MARKER. Closing a dirty level tab does not
// prompt and does not discard (owner card d-38, and tab-activation/dispatch.ts
// `disposeStacksForClosedTab`): the act stays resident, its edits stay unsaved,
// and reopening the tab shows them again. But the tab's dot was the only place
// the app said "unsaved", so after that close seat B's full-screen scan found
// nothing, while the store still held the edit. The title is the one surface
// that is on screen whatever tab is active and however the Explorer is folded.
//
// THE MARKER is a leading `● `, the convention of the editor this shell already
// borrows its chords from (Ctrl+Shift+P, Ctrl+Shift+B): VS Code puts a dot in
// front of the title while anything is unsaved. First, not last, so a taskbar
// that truncates the title keeps it.

export const UNSAVED_TITLE_MARKER = '●';

export interface WindowTitleFacts {
  /** The open project's name, or nothing when no project is open. */
  projectName: string | null | undefined;
  /** The active tab's title, or nothing on Home. */
  tabTitle: string | null | undefined;
  /** `hasUnsavedWork` over the dirty snapshot: any open document is dirty. */
  unsaved: boolean;
}

export function windowTitle({ projectName, tabTitle, unsaved }: WindowTitleFacts): string {
  const base = ['Aurora', projectName, tabTitle].filter(Boolean).join(' - ');
  return unsaved ? `${UNSAVED_TITLE_MARKER} ${base}` : base;
}
