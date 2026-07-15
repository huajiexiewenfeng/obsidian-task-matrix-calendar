import { describe, expect, it, vi } from 'vitest';
import { TaskIndex } from '../../src/index/task-index';
import { parseTaskFile } from '../../src/markdown/task-parser';

interface BlockOptions {
  id: string;
  title: string;
  details?: string;
  status?: string;
  quadrant?: string;
  project?: string;
  tags?: string;
  dueDate?: string;
}

function result(path: string, options: BlockOptions) {
  const lines = [
    '<!-- obsidian-task-schema: 1 -->',
    '',
    `- [${options.status === '已完成' ? 'x' : ' '}] ${options.title} #task ^${options.id}`,
    `  - 状态:: ${options.status ?? '待办'}`,
    `  - 分类:: ${options.quadrant ?? '未分类'}`,
  ];
  if (options.project) lines.push(`  - 项目:: ${options.project}`);
  if (options.tags) lines.push(`  - 标签:: ${options.tags}`);
  if (options.dueDate) lines.push(`  - 截止日期:: ${options.dueDate}`);
  const parsed = parseTaskFile(path, lines.join('\n'));
  if (options.details !== undefined && parsed.tasks[0]) {
    parsed.tasks[0].task.details = options.details;
  }
  return parsed;
}

describe('TaskIndex', () => {
  it('replaces one file without changing tasks from another file', () => {
    const index = new TaskIndex();
    const listener = vi.fn();
    index.subscribe(listener);
    index.replaceFile('任务/a.md', result('任务/a.md', { id: 'task-A1', title: '任务 A' }));
    index.replaceFile('任务/b.md', result('任务/b.md', { id: 'task-B1', title: '任务 B' }));
    index.replaceFile('任务/a.md', result('任务/a.md', { id: 'task-A1', title: '任务 A 新版' }));

    expect(index.snapshot().tasks.map((item) => item.task.title).sort()).toEqual([
      '任务 A 新版',
      '任务 B',
    ]);
    expect(index.snapshot().revision).toBe(3);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('removes every task owned by one file', () => {
    const index = new TaskIndex();
    index.replaceFile('任务/a.md', result('任务/a.md', { id: 'task-A1', title: '任务 A' }));
    index.replaceFile('任务/b.md', result('任务/b.md', { id: 'task-B1', title: '任务 B' }));

    index.removeFile('任务/a.md');

    expect(index.snapshot().tasks.map((item) => item.task.id)).toEqual(['task-B1']);
  });

  it('marks duplicate ids across files and refuses ambiguous lookup', () => {
    const index = new TaskIndex();
    index.replaceFile('任务/a.md', result('任务/a.md', { id: 'task-SAME', title: '任务 A' }));
    index.replaceFile('任务/b.md', result('任务/b.md', { id: 'task-SAME', title: '任务 B' }));

    expect(index.snapshot().issues.filter((issue) => issue.code === 'duplicate-id')).toHaveLength(2);
    expect(index.get('task-SAME')).toBeUndefined();
  });

  it('combines text, quadrant, status, project, tag, source, and risk filters', () => {
    const index = new TaskIndex();
    index.replaceFile(
      '任务/开源.md',
      result('任务/开源.md', {
        id: 'task-0PEN1',
        title: '发布 Obsidian 插件',
        status: '进行中',
        quadrant: '重要且紧急',
        project: '开源',
        tags: 'obsidian, plugin',
        dueDate: '2026-07-18',
      }),
    );
    index.replaceFile('任务/其他.md', result('任务/其他.md', { id: 'task-07HER1', title: '其他' }));

    const matches = index.query(
      {
        query: 'obsidian',
        quadrants: ['important-urgent'],
        statuses: ['in-progress'],
        projects: ['开源'],
        tags: ['plugin'],
        sourcePaths: ['任务/开源.md'],
        risks: ['upcoming'],
      },
      '2026-07-15',
      3,
    );

    expect(matches.map((item) => item.task.id)).toEqual(['task-0PEN1']);
  });

  it('includes task details in text search', () => {
    const index = new TaskIndex();
    index.replaceFile('任务/details.md', result('任务/details.md', {
      id: 'task-DETA11',
      title: '发布插件',
      details: '第一行\n第二行需要复核',
    }));

    expect(index.query({ query: '第二行' }, '2026-07-15', 3).map((item) => item.task.id))
      .toEqual(['task-DETA11']);
  });
});
