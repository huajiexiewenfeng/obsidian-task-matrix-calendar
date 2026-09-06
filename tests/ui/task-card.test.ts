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
  it('renders compact execution semantics and contextual actions', () => {
    const container = document.createElement('div');
    const indexed = parseTaskFile('任务/项目.md', source).tasks[0];
    indexed.task.details = '第一行详情\n第二行详情';
    const actions = {
      open: vi.fn(),
      openLink: vi.fn(),
      start: vi.fn(),
      complete: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };

    const card = renderTaskCard(container, indexed, { done: 2, total: 4 }, 'due-today', actions);

    expect(card.dataset.status).toBe('in-progress');
    expect(card.textContent).toContain('长期任务');
    expect(card.querySelector('.tmc-status-in-progress')?.textContent).toBe('进行中');
    expect(card.querySelector('.tmc-progress')?.textContent).toBe('2/4');
    expect(card.querySelector('.tmc-risk-due-today')?.textContent).toBe('今天截止');
    expect(card.textContent).not.toContain('来源：');
    expect(card.textContent).not.toContain('标签：');
    const description = card.querySelector('.tmc-task-description');
    expect(description?.textContent).toBe('第一行详情\n第二行详情');
    expect(description?.tagName).toBe('P');
    expect(card.querySelector('.tmc-task-card-main .tmc-task-title')).not.toBeNull();
    expect(card.querySelector('.tmc-task-details')?.textContent)
      .toBe('项目：开源插件 · 截止：2026-07-15');

    const trigger = card.querySelector<HTMLButtonElement>('[data-action="menu"]')!;
    const menu = card.querySelector<HTMLElement>('.tmc-task-actions')!;
    expect(trigger.getAttribute('aria-label')).toBe('任务操作');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);
    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu.hidden).toBe(false);

    const edit = menu.querySelector('[data-action="open"]') as HTMLButtonElement;
    expect(edit.getAttribute('aria-label')).toBe('编辑任务');
    edit.click();
    expect(actions.open).toHaveBeenCalledWith('task-P1');
    expect(menu.hidden).toBe(true);

    trigger.click();
    menu.querySelector<HTMLButtonElement>('[data-action="pause"]')!.click();
    expect(actions.pause).toHaveBeenCalledWith('task-P1');
    expect(menu.hidden).toBe(true);
  });

  it.each([
    ['todo', '待办'],
    ['in-progress', '进行中'],
    ['paused', '暂停'],
    ['done', '已完成'],
  ] as const)('emits stable styling hooks for %s tasks', (status, label) => {
    const container = document.createElement('div');
    const indexed = parseTaskFile('任务/项目.md', source).tasks[0];
    indexed.task.status = status;
    const actions = {
      open: vi.fn(),
      openLink: vi.fn(),
      start: vi.fn(),
      complete: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };

    const card = renderTaskCard(container, indexed, { done: 0, total: 0 }, 'none', actions);

    expect(card.dataset.status).toBe(status);
    expect(card.querySelector(`.tmc-status-${status}`)?.textContent).toBe(label);
  });

  it('renders details as Markdown and opens internal links without opening the task editor', () => {
    const container = document.createElement('div');
    const indexed = parseTaskFile('任务/项目.md', source).tasks[0];
    indexed.task.details = '说明见 [[发布说明]]\n![[附件/截图.png]]';
    const actions = {
      open: vi.fn(),
      openLink: vi.fn(),
      start: vi.fn(),
      complete: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const renderDetails = vi.fn((host: HTMLElement, markdown: string) => {
      host.dataset.markdown = markdown;
      const link = document.createElement('a');
      link.className = 'internal-link';
      link.dataset.href = '发布说明';
      link.textContent = '发布说明';
      host.append(link);
    });

    const card = renderTaskCard(
      container,
      indexed,
      { done: 0, total: 0 },
      'none',
      actions,
      false,
      renderDetails,
    );

    const description = card.querySelector<HTMLElement>('.tmc-task-description')!;
    expect(description.tagName).toBe('DIV');
    expect(description.dataset.markdown).toBe('说明见 [[发布说明]]\n![[附件/截图.png]]');
    expect(renderDetails).toHaveBeenCalledWith(
      description,
      indexed.task.details,
      '任务/项目.md',
    );

    description.querySelector<HTMLAnchorElement>('a.internal-link')!.click();

    expect(actions.openLink).toHaveBeenCalledWith('发布说明', '任务/项目.md');
    expect(actions.open).not.toHaveBeenCalled();
  });
});
