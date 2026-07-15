// @vitest-environment jsdom
import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TaskIndex } from '../../src/index/task-index';
import { parseTaskFile } from '../../src/markdown/task-parser';
import {
  TASK_WORKSPACE_VIEW_TYPE,
  TaskWorkspaceView,
} from '../../src/ui/task-workspace-view';

const activeSource = [
  '- [ ] 未分类任务 #task ^task-A1',
  '  - 详情:: 第一条详情',
  '  - 状态:: 待办',
  '  - 分类:: 未分类',
  '  - 项目:: Alpha',
  '  - 截止日期:: 2026-07-14',
  '',
  '- [ ] 今日任务 #task ^task-A2',
  '  - 状态:: 进行中',
  '  - 分类:: 重要且紧急',
  '  - 项目:: Beta',
  '  - 计划日期:: 2026-07-15',
  '  - 截止日期:: 2026-07-15',
].join('\n');

const secondarySource = [
  '- [ ] 即将截止 #task ^task-B1',
  '  - 状态:: 暂停',
  '  - 分类:: 重要不紧急',
  '  - 项目:: Alpha',
  '  - 截止日期:: 2026-07-17',
  '',
  '- [x] 已完成任务 #task ^task-B2',
  '  - 状态:: 已完成',
  '  - 分类:: 不重要不紧急',
  '  - 项目:: Beta',
].join('\n');

function setup(importAction = vi.fn().mockResolvedValue(undefined)) {
  const leaf = {} as WorkspaceLeaf;
  const index = new TaskIndex();
  index.replaceFile('任务/a.md', parseTaskFile('任务/a.md', activeSource));
  index.replaceFile('任务/b.md', parseTaskFile('任务/b.md', secondarySource));
  const service = {
    transition: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    changeQuadrant: vi.fn().mockResolvedValue(undefined),
    changePlannedDate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const prompt = { chooseQuadrant: vi.fn().mockResolvedValue('important-urgent') };
  const form = { openCreate: vi.fn(), openEdit: vi.fn() };
  const view = new TaskWorkspaceView(
    leaf,
    index,
    service,
    prompt,
    form,
    3,
    () => '2026-07-15',
    importAction,
  );
  return { view, leaf, index, service, prompt, form, importAction };
}

function visibleTaskIds(view: TaskWorkspaceView): string[] {
  return Array.from(
    view.containerEl.querySelectorAll<HTMLElement>('[data-task-id]'),
    (element) => element.dataset.taskId!,
  ).sort();
}

function changeFilter(view: TaskWorkspaceView, name: string, value: string): void {
  const select = view.containerEl.querySelector<HTMLSelectElement>(`select[data-filter="${name}"]`)!;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function dragEvent(type: string, taskId: string): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: () => taskId, setData: vi.fn() },
  });
  return event;
}

describe('TaskWorkspaceView', () => {
  it('uses one workspace for task creation and editing', async () => {
    const { view, leaf, form } = setup();
    const originalContainer = view.containerEl;

    await view.onOpen();

    expect(view.getViewType()).toBe(TASK_WORKSPACE_VIEW_TYPE);
    expect(view.containerEl.querySelector('[data-mode="tasks"]')).not.toBeNull();
    view.containerEl.querySelector<HTMLButtonElement>('[data-action="new-task"]')!.click();
    expect(form.openCreate).toHaveBeenCalledTimes(1);
    view.containerEl.querySelector<HTMLButtonElement>('[data-task-id="task-A1"] [data-action="open"]')!.click();
    expect(form.openEdit).toHaveBeenCalledWith(expect.objectContaining({
      task: expect.objectContaining({ id: 'task-A1' }),
    }));

    view.setMode('calendar');
    expect(view.containerEl).toBe(originalContainer);
    expect(view.leaf).toBe(leaf);
    view.containerEl.querySelector<HTMLButtonElement>('[data-calendar-task-id="task-A2"]')!.click();
    expect(form.openEdit).toHaveBeenLastCalledWith(expect.objectContaining({
      task: expect.objectContaining({ id: 'task-A2' }),
    }));
  });

  it('applies every select and preserves filter state across modes', async () => {
    const { view } = setup();
    await view.onOpen();
    expect(visibleTaskIds(view)).toEqual(['task-A1', 'task-A2', 'task-B1']);

    changeFilter(view, 'project', 'Alpha');
    expect(visibleTaskIds(view)).toEqual(['task-A1', 'task-B1']);
    changeFilter(view, 'project', '*');
    changeFilter(view, 'status', 'done');
    expect(visibleTaskIds(view)).toEqual(['task-B2']);
    changeFilter(view, 'status', 'active');
    changeFilter(view, 'risk', 'overdue');
    expect(visibleTaskIds(view)).toEqual(['task-A1']);
    changeFilter(view, 'risk', '*');
    changeFilter(view, 'source', '任务/b.md');
    expect(visibleTaskIds(view)).toEqual(['task-B1']);

    view.setMode('calendar');
    expect(view.containerEl.querySelector<HTMLSelectElement>('[data-filter="source"]')!.value)
      .toBe('任务/b.md');
    expect(view.containerEl.querySelectorAll('[data-calendar-task-id="task-B1"]').length).toBeGreaterThan(0);
    expect(view.containerEl.querySelector('[data-calendar-task-id="task-A2"]')).toBeNull();
    view.setMode('tasks');
    expect(view.containerEl.querySelector<HTMLSelectElement>('[data-filter="source"]')!.value)
      .toBe('任务/b.md');
    expect(visibleTaskIds(view)).toEqual(['task-B1']);
  });

  it('runs legacy import once and disables its button while pending', async () => {
    let finish!: () => void;
    const importAction = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { view } = setup(importAction);
    await view.onOpen();
    const button = view.containerEl.querySelector<HTMLButtonElement>('[data-action="import-legacy"]')!;

    button.click();
    button.click();

    expect(importAction).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(view.containerEl.querySelector<HTMLButtonElement>('[data-action="import-legacy"]')!.disabled)
      .toBe(false);
  });

  it('preserves classification gates, pause, resume, and quadrant drops', async () => {
    const { view, service, prompt } = setup();
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
    view.containerEl.querySelector<HTMLButtonElement>('[data-task-id="task-A2"] [data-action="pause"]')!.click();
    view.containerEl.querySelector<HTMLButtonElement>('[data-task-id="task-B1"] [data-action="resume"]')!.click();
    await Promise.resolve();
    expect(service.transition).toHaveBeenCalledWith('task-A2', 'paused');
    expect(service.transition).toHaveBeenCalledWith('task-B1', 'in-progress');

    view.containerEl.querySelector<HTMLElement>('[data-quadrant="not-important-urgent"]')!
      .dispatchEvent(dragEvent('drop', 'task-A1'));
    await Promise.resolve();
    expect(service.changeQuadrant).toHaveBeenCalledWith('task-A1', 'not-important-urgent');
  });

  it('routes calendar drops through the shared task service', async () => {
    const { view, service } = setup();
    await view.onOpen();
    view.setMode('calendar');

    view.containerEl.querySelector<HTMLElement>('[data-date="2026-07-20"]')!
      .dispatchEvent(dragEvent('drop', 'task-A1'));
    await Promise.resolve();

    expect(service.changePlannedDate).toHaveBeenCalledWith('task-A1', '2026-07-20');
  });
});
