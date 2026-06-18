export const IPC_CHANNELS = {
  READ_BINARY_FILE: 'file:read-binary',
  OPEN_PROJECT: 'project:open',
  SELECT_DIRECTORY: 'dialog:select-directory',
  GET_RECENT_PROJECTS: 'projects:get-recent',
  ADD_RECENT_PROJECT: 'projects:add-recent',
  REMOVE_RECENT_PROJECT: 'projects:remove-recent',
  SAVE_FILE: 'file:save',
  WRITE_BINARY_FILE: 'file:write-binary',
  SELECT_FILES: 'dialog:select-files',
  LIST_PROJECT_FILES: 'file:list-project-files',
} as const;

export type IpcChannels = typeof IPC_CHANNELS;

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number; // timestamp
}
