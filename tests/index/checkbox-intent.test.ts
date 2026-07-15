import { describe, expect, it } from 'vitest';
import { detectCheckboxIntents } from '../../src/index/checkbox-intent';
import { parseTaskFile } from '../../src/markdown/task-parser';

function parse(source: string) {
  return parseTaskFile('任务/a.md', source);
}

function block(id: string, title: string, checkbox: ' ' | 'x', status: string): string[] {
  return [
    `- [${checkbox}] ${title} #task ^${id}`,
    `  - 状态:: ${status}`,
    '  - 分类:: 重要不紧急',
  ];
}

describe('detectCheckboxIntents', () => {
  it('detects completion and reopening when only the checkbox changed', () => {
    const todo = block('task-A1', '任务 A', ' ', '待办').join('\n');
    const checked = block('task-A1', '任务 A', 'x', '待办').join('\n');
    expect(detectCheckboxIntents(parse(todo), parse(checked))).toEqual({
      intents: [{ taskId: 'task-A1', kind: 'complete' }],
      ambiguousTaskIds: [],
    });

    const done = block('task-A1', '任务 A', 'x', '已完成').join('\n');
    const unchecked = block('task-A1', '任务 A', ' ', '已完成').join('\n');
    expect(detectCheckboxIntents(parse(done), parse(unchecked)).intents).toEqual([
      { taskId: 'task-A1', kind: 'reopen' },
    ]);
  });

  it('keeps safe checkbox changes when another task changed ambiguously', () => {
    const previous = [...block('task-A1', '任务 A', ' ', '待办'), '', ...block('task-B1', '任务 B', ' ', '待办')].join('\n');
    const current = [...block('task-A1', '任务 A', 'x', '待办'), '', ...block('task-B1', '任务 B 新标题', 'x', '待办')].join('\n');

    expect(detectCheckboxIntents(parse(previous), parse(current))).toEqual({
      intents: [{ taskId: 'task-A1', kind: 'complete' }],
      ambiguousTaskIds: ['task-B1'],
    });
  });

  it('does not mark a parent ambiguous when only a child checkbox changed', () => {
    const previous = [
      '- [ ] 父任务 #task ^task-PARENT',
      '  - 状态:: 待办',
      '  - 分类:: 重要不紧急',
      '  - [ ] 子任务 #task ^task-CH7D',
      '    - 状态:: 待办',
      '    - 分类:: 重要不紧急',
    ].join('\n');
    const current = previous.replace('- [ ] 子任务', '- [x] 子任务');

    expect(detectCheckboxIntents(parse(previous), parse(current))).toEqual({
      intents: [{ taskId: 'task-CH7D', kind: 'complete' }],
      ambiguousTaskIds: [],
    });
  });
});
