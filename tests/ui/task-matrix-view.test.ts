// @vitest-environment jsdom
import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TaskIndex } from '../../src/index/task-index';
import { parseTaskFile } from '../../src/markdown/task-parser';
import { TaskMatrixView } from '../../src/ui/task-matrix-view';

const source = [
  '- [ ] 未整理 #task ^task-A1',
  '  - 状态:: 待办',
  '  - 分类:: 未分类',
  '',
  '- [ ] 长期任务 #task ^task-P1',
  '  - 状态:: 待办',
  '  - 分类:: 重要不紧急',
  '  - [x] 已完成步骤 #task ^task-C1',
  '    - 状态:: 已完成',
  '    - 分类:: 重要不紧急',
  '  - [ ] 下一步 #task ^task-C2',
  '    - 状态:: 待办',
  '    - 分类:: 重要不紧急',
].join('\n');

describe('TaskMatrixView', () => {
  it('renders unclassified inbox, four quadrants, progress and filters', async () => {
    const index = new TaskIndex();
    index.replaceFile('任务/a.md', parseTaskFile('任务/a.md', source));
    const service = {
      transition: vi.fn(), complete: vi.fn(), changeQuadrant: vi.fn(), update: vi.fn(),
    };
    const prompt = { chooseQuadrant: vi.fn().mockResolvedValue('important-urgent') };
    const view = new TaskMatrixView({} as WorkspaceLeaf, index, service, prompt, 3, () => '2026-07-15');

    await view.onOpen();

    expect(view.containerEl.textContent).toContain('未分类收件箱 · 1');
    for (const title of ['重要且紧急', '重要不紧急', '不重要但紧急', '不重要不紧急']) {
      expect(view.containerEl.textContent).toContain(title);
    }
    expect(view.containerEl.textContent).toContain('1/2');
    expect(view.containerEl.querySelector('[data-filter="query"]')).not.toBeNull();
  });

  it('forces classification before starting or completing an unclassified task', async () => {
    const index = new TaskIndex();
    index.replaceFile('任务/a.md', parseTaskFile('任务/a.md', source));
    const service = {
      transition: vi.fn().mockResolvedValue({}),
      complete: vi.fn().mockResolvedValue(undefined),
      changeQuadrant: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
    };
    const prompt = { chooseQuadrant: vi.fn().mockResolvedValue('important-urgent') };
    const view = new TaskMatrixView({} as WorkspaceLeaf, index, service, prompt, 3, () => '2026-07-15');
    await view.onOpen();

    view.containerEl.querySelector<HTMLButtonElement>('[data-task-id="task-A1"] [data-action="start"]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(prompt.chooseQuadrant).toHaveBeenCalledWith('task-A1');
    expect(service.changeQuadrant).toHaveBeenCalledWith('task-A1', 'important-urgent');
    expect(service.transition).toHaveBeenCalledWith('task-A1', 'in-progress');

    view.containerEl.querySelector<HTMLButtonElement>('[data-task-id="task-A1"] [data-action="complete"]')!.click();
    await Promise.resolve();
    expect(service.complete).toHaveBeenCalledWith('task-A1', 'important-urgent');
  });
});
