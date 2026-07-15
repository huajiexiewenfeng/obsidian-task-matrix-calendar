import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeTask } from '../../src/domain/task';
import { parseTaskFile } from '../../src/markdown/task-parser';
import {
  ensureSchemaMarker,
  serializeTaskBlock,
} from '../../src/markdown/task-serializer';

function canonicalSource(): string {
  return readFileSync(new URL('../fixtures/canonical-tasks.md', import.meta.url), 'utf8');
}

describe('task serializer', () => {
  it('round trips multiline details with CRLF and leading spaces', () => {
    const details = '第一行\n\n  保留前导空格';
    const task = makeTask({ id: 'task-DETA11', title: '多行任务', details });
    const block = serializeTaskBlock(task, [], 0, '\r\n');

    expect(block).toContain(
      ['  - 详情::', '    > 第一行', '    >', '    >   保留前导空格'].join('\r\n'),
    );
    const parsed = parseTaskFile('任务/详情.md', block);
    expect(parsed.issues).toEqual([]);
    expect(parsed.tasks[0].task.details).toBe(details);
    expect(parsed.tasks[0].location.eol).toBe('\r\n');
  });

  it('uses canonical field order, CRLF, and deduplicated tags', () => {
    const task = makeTask({
      id: 'task-01JZA9',
      title: '发布插件',
      status: 'in-progress',
      quadrant: 'important-urgent',
      project: '开源',
      tags: ['obsidian', 'plugin', 'obsidian'],
      plannedDate: '2026-07-15',
      dueDate: '2026-07-18',
      legacyPriority: 'P1',
    });

    const serialized = serializeTaskBlock(task, [], 0, '\r\n');
    expect(serialized).toBe(
      [
        '- [ ] 发布插件 #task ^task-01JZA9',
        '  - 状态:: 进行中',
        '  - 分类:: 重要且紧急',
        '  - 项目:: 开源',
        '  - 标签:: obsidian, plugin',
        '  - 计划日期:: 2026-07-15',
        '  - 截止日期:: 2026-07-18',
        '  - 旧优先级:: P1',
      ].join('\r\n'),
    );
    expect(serialized).not.toMatch(/(?<!\r)\n/);
  });

  it('round trips a canonical parent and children without losing fields', () => {
    const original = parseTaskFile('任务/任务收件箱.md', canonicalSource());
    const parent = original.tasks[0].task;
    const children = original.tasks.slice(1).map((item) => item.task);
    const source = `<!-- obsidian-task-schema: 1 -->\n\n${serializeTaskBlock(parent, children)}`;
    const reparsed = parseTaskFile('任务/任务收件箱.md', source);

    expect(reparsed.issues).toEqual([]);
    expect(reparsed.tasks.map((item) => item.task)).toEqual(
      original.tasks.map((item) => item.task),
    );
  });

  it('inserts one schema marker after YAML frontmatter', () => {
    const source = ['---', 'title: 任务', '---', '', '- 普通列表'].join('\n');
    const marked = ensureSchemaMarker(source, '\n');

    expect(marked).toBe(
      ['---', 'title: 任务', '---', '<!-- obsidian-task-schema: 1 -->', '', '- 普通列表'].join(
        '\n',
      ),
    );
    expect(ensureSchemaMarker(marked, '\n')).toBe(marked);
  });
});
