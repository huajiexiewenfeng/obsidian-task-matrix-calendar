import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, validateSettings } from '../../src/settings';
import { TaskIndex } from '../../src/index/task-index';
import { TaskScanner, type MetadataHintProvider } from '../../src/index/task-scanner';
import { FakeVault } from '../fakes/fake-vault';

function task(id: string, title: string): string {
  return [
    '<!-- obsidian-task-schema: 1 -->',
    '',
    `- [ ] ${title} #task ^${id}`,
    '  - 状态:: 待办',
    '  - 分类:: 未分类',
  ].join('\n');
}

describe('TaskScanner', () => {
  it('deduplicates roots and always excludes trash and backup paths', async () => {
    const vault = new FakeVault({
      '任务/a.md': task('task-A1', '任务 A'),
      '任务/项目/b.md': task('task-B1', '任务 B'),
      '任务/忽略此文件.md': task('task-C1', '忽略'),
      '任务/任务回收站.md': task('task-D1', '回收站'),
      '任务/任务备份/2026/a.md': task('task-E1', '备份'),
      '其他/outside.md': task('task-F1', '范围外'),
    });
    const index = new TaskIndex();
    const hints: MetadataHintProvider = { getHints: vi.fn(() => null) };
    const scanner = new TaskScanner(
      vault,
      index,
      {
        ...DEFAULT_SETTINGS,
        scanRoots: ['任务', '任务/项目'],
        excludeGlobs: ['**/忽略*.md'],
      },
      hints,
    );

    await scanner.scanAll();

    expect(index.snapshot().tasks.map((item) => item.task.id).sort()).toEqual(['task-A1', 'task-B1']);
    expect(vault.readCounts).toEqual(new Map([['任务/a.md', 1], ['任务/项目/b.md', 1]]));
    expect(hints.getHints).toHaveBeenCalledTimes(2);
  });

  it('produces the same parse result when metadata hints are unavailable', async () => {
    const source = task('task-A1', '任务 A');
    const withHints = new TaskIndex();
    const withoutHints = new TaskIndex();
    await new TaskScanner(
      new FakeVault({ '任务/a.md': source }),
      withHints,
      DEFAULT_SETTINGS,
      { getHints: () => ({ listItems: [], blocks: [] }) },
    ).scanAll();
    await new TaskScanner(
      new FakeVault({ '任务/a.md': source }),
      withoutHints,
      DEFAULT_SETTINGS,
    ).scanAll();

    expect(withHints.snapshot()).toEqual(withoutHints.snapshot());
  });
});

describe('validateSettings', () => {
  it('accepts defaults and rejects unsafe vault paths and values', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual([]);
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        inboxPath: '../outside.md',
        trashPath: '../outside.md',
        backupRoot: '../outside.md',
        dueSoonDays: -1,
      }).map((issue) => issue.field),
    ).toEqual(expect.arrayContaining(['inboxPath', 'trashPath', 'backupRoot', 'dueSoonDays']));
  });
});
