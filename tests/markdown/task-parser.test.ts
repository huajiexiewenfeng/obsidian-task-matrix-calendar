import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTaskFile } from '../../src/markdown/task-parser';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

describe('parseTaskFile', () => {
  it('parses a canonical parent and its children', () => {
    const result = parseTaskFile('任务/任务收件箱.md', fixture('canonical-tasks.md'));

    expect(result.schemaVersion).toBe(1);
    expect(result.tasks.map((item) => item.task.id)).toEqual([
      'task-01JZA1',
      'task-01JZA2',
      'task-01JZA3',
    ]);
    expect(result.tasks[0].task.childrenIds).toEqual(['task-01JZA2', 'task-01JZA3']);
    expect(result.tasks[1].task.parentId).toBe('task-01JZA1');
    expect(result.tasks[0].task.tags).toEqual(['Obsidian', '开源']);
    expect(result.tasks[0].task.details).toBe('第一行\n\n  保留前导空格');
    expect(result.tasks[0].task.plannedDate).toBe('2026-07-20');
    expect(result.tasks[0].task.dueDate).toBe('2026-07-31');
    expect(result.tasks[1].task.status).toBe('done');
    expect(result.tasks[2].task.status).toBe('in-progress');
    expect(result.issues).toEqual([]);
  });

  it('records exact source locations and line endings', () => {
    const result = parseTaskFile('任务/任务收件箱.md', fixture('canonical-tasks.md'));

    expect(result.eol).toBe('\n');
    expect(result.tasks[0].location).toMatchObject({
      sourcePath: '任务/任务收件箱.md',
      startLine: 4,
      endLine: 24,
      indent: 0,
      eol: '\n',
    });
    expect(result.tasks[0].location.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const changed = parseTaskFile(
      '任务/任务收件箱.md',
      fixture('canonical-tasks.md').replace('保留前导空格', '修改详情'),
    );
    expect(changed.tasks[0].location.fingerprint).not.toBe(
      result.tasks[0].location.fingerprint,
    );
    expect(changed.tasks[0].ownFingerprint).not.toBe(result.tasks[0].ownFingerprint);
  });

  it('marks malformed task blocks read-only with stable issue codes', () => {
    const result = parseTaskFile('任务/异常.md', fixture('invalid-tasks.md'));
    const codes = new Set(result.issues.map((issue) => issue.code));

    expect(codes).toEqual(
      new Set([
        'duplicate-id',
        'status-checkbox-conflict',
        'invalid-date',
        'unknown-task-content',
        'max-depth-exceeded',
        'missing-field',
      ]),
    );
    const affectedIds = new Set(result.issues.flatMap((issue) => issue.taskId ?? []));
    for (const task of result.tasks) {
      if (affectedIds.has(task.task.id)) {
        expect(task.readOnly).toBe(true);
      }
    }
  });

  it('parses positive safe sort orders and rejects invalid values', () => {
    const source = [
      '- [ ] 有序任务 #task ^task-0RDER1',
      '  - 状态:: 待办',
      '  - 分类:: 重要且紧急',
      '  - 排序:: 2048',
      '',
      '- [ ] 非法排序 #task ^task-0RDER2',
      '  - 状态:: 待办',
      '  - 分类:: 重要且紧急',
      '  - 排序:: 0',
    ].join('\n');

    const result = parseTaskFile('任务/排序.md', source);

    expect(result.tasks[0].task.sortOrder).toBe(2048);
    expect(result.tasks[0].readOnly).toBe(false);
    expect(result.tasks[1].task.sortOrder).toBeUndefined();
    expect(result.tasks[1].readOnly).toBe(true);
    expect(result.issues.at(-1)?.message).toBe('非法排序值：0');
  });
});
