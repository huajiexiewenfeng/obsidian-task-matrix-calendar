// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { parseTaskFile } from '../../src/markdown/task-parser';
import { renderTaskCard } from '../../src/ui/task-card';

const source = [
  '- [ ] 长期任务 #task ^task-P1',
  '  - 状态:: 进行中',
  '  - 分类:: 重要不紧急',
  '  - 项目:: 开源插件',
  '  - 标签:: 开发, Obsidian',
  '  - 截止日期:: 2026-07-15',
].join('\n');

describe('renderTaskCard', () => {
  it('renders readable semantics, progress, source and actions', () => {
    const container = document.createElement('div');
    const indexed = parseTaskFile('任务/项目.md', source).tasks[0];
    indexed.task.details = '第一行详情\n第二行详情';
    const actions = { open: vi.fn(), start: vi.fn(), complete: vi.fn(), pause: vi.fn(), resume: vi.fn() };

    const card = renderTaskCard(container, indexed, { done: 2, total: 4 }, 'due-today', actions);

    expect(card.textContent).toContain('长期任务');
    expect(card.textContent).toContain('进行中');
    expect(card.textContent).toContain('2/4');
    expect(card.textContent).toContain('今天截止');
    expect(card.textContent).toContain('任务/项目.md');
    expect(card.textContent).toContain('开源插件');
    expect(card.textContent).toContain('开发');
    const description = card.querySelector('.tmc-task-description');
    expect(description?.textContent).toBe('第一行详情\n第二行详情');
    expect(description?.tagName).toBe('P');
    (card.querySelector('[data-action="open"]') as HTMLButtonElement).click();
    expect(actions.open).toHaveBeenCalledWith('task-P1');
  });
});
