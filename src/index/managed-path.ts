import { minimatch } from 'minimatch';
import type { TaskMatrixCalendarSettings } from '../settings';
import { normalizeVaultPath } from '../settings';

function comparablePath(path: string): string {
  return normalizeVaultPath(path).toLocaleLowerCase();
}

function samePath(left: string, right: string): boolean {
  return comparablePath(left) === comparablePath(right);
}

function isWithin(path: string, root: string): boolean {
  const normalizedPath = comparablePath(path);
  const normalizedRoot = comparablePath(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function isManagedMarkdownPath(
  path: string,
  settings: TaskMatrixCalendarSettings,
): boolean {
  const normalized = normalizeVaultPath(path);
  if (!/\.md$/i.test(normalized)) return false;
  if (!settings.scanRoots.some((root) => isWithin(normalized, root))) return false;
  if (samePath(normalized, settings.trashPath)) return false;
  if (isWithin(normalized, settings.backupRoot)) return false;
  return !settings.excludeGlobs.some((glob) =>
    minimatch(normalized, glob, { dot: true, nocase: true }),
  );
}
