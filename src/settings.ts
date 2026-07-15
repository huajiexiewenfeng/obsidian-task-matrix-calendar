export interface TaskMatrixCalendarSettings {
  scanRoots: string[];
  excludeGlobs: string[];
  inboxPath: string;
  trashPath: string;
  backupRoot: string;
  dueSoonDays: number;
}

export const DEFAULT_SETTINGS: TaskMatrixCalendarSettings = {
  scanRoots: ['任务'],
  excludeGlobs: [],
  inboxPath: '任务/任务收件箱.md',
  trashPath: '任务/任务回收站.md',
  backupRoot: '任务/任务备份',
  dueSoonDays: 3,
};
