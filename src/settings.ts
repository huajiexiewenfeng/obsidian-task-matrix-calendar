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

export type SettingsField = keyof TaskMatrixCalendarSettings;

export interface SettingsValidationIssue {
  field: SettingsField;
  message: string;
}

export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

function isSafeVaultPath(path: string): boolean {
  const normalized = normalizeVaultPath(path);
  return Boolean(
    normalized &&
      !/^[A-Za-z]:/.test(normalized) &&
      !normalized.split('/').some((segment) => segment === '..' || segment === '.'),
  );
}

function isUnderRoot(path: string, root: string): boolean {
  const normalizedPath = normalizeVaultPath(path).toLocaleLowerCase();
  const normalizedRoot = normalizeVaultPath(root).toLocaleLowerCase();
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function validateSettings(
  settings: TaskMatrixCalendarSettings,
): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = [];
  const roots = settings.scanRoots.map(normalizeVaultPath).filter(Boolean);

  if (roots.length === 0 || settings.scanRoots.some((root) => !isSafeVaultPath(root))) {
    issues.push({ field: 'scanRoots', message: '扫描目录必须是 Vault 内的相对路径。' });
  }
  if (
    !isSafeVaultPath(settings.inboxPath) ||
    !roots.some((root) => isUnderRoot(settings.inboxPath, root))
  ) {
    issues.push({ field: 'inboxPath', message: '默认收件箱必须位于扫描目录内。' });
  }
  if (
    !isSafeVaultPath(settings.trashPath) ||
    normalizeVaultPath(settings.trashPath) === normalizeVaultPath(settings.inboxPath)
  ) {
    issues.push({ field: 'trashPath', message: '回收站必须是独立的 Vault 内文件。' });
  }
  if (
    !isSafeVaultPath(settings.backupRoot) ||
    [settings.inboxPath, settings.trashPath]
      .map(normalizeVaultPath)
      .includes(normalizeVaultPath(settings.backupRoot))
  ) {
    issues.push({ field: 'backupRoot', message: '备份目录必须是独立的 Vault 内目录。' });
  }
  if (!Number.isInteger(settings.dueSoonDays) || settings.dueSoonDays < 0) {
    issues.push({ field: 'dueSoonDays', message: '即将到期天数必须是非负整数。' });
  }

  return issues;
}
