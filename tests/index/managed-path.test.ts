import { describe, expect, it } from 'vitest';
import { isManagedMarkdownPath } from '../../src/index/managed-path';
import { DEFAULT_SETTINGS } from '../../src/settings';

describe('isManagedMarkdownPath', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    scanRoots: ['Tasks'],
    excludeGlobs: ['**/Skip*.md'],
    trashPath: 'Tasks/Trash.md',
    backupRoot: 'Tasks/Backups',
  };

  it('matches roots case-insensitively while rejecting sibling roots and non-Markdown files', () => {
    expect(isManagedMarkdownPath('tasks/Project/Note.MD', settings)).toBe(true);
    expect(isManagedMarkdownPath('Tasks-Archive/Note.md', settings)).toBe(false);
    expect(isManagedMarkdownPath('Tasks/Note.txt', settings)).toBe(false);
  });

  it('applies excludes, trash, and backup rules case-insensitively', () => {
    expect(isManagedMarkdownPath('TASKS/Project/SKIP-this.md', settings)).toBe(false);
    expect(isManagedMarkdownPath('tasks/trash.MD', settings)).toBe(false);
    expect(isManagedMarkdownPath('tasks/BACKUPS/2026/Note.md', settings)).toBe(false);
  });
});
