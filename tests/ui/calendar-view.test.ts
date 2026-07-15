// @vitest-environment jsdom
import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../src/domain/task';
import { buildMonthModel, CalendarView } from '../../src/ui/calendar-view';
import { TaskIndex } from '../../src/index/task-index';

describe('buildMonthModel', () => {
  it('builds 42 cells with planned cards and deduplicated due markers', () => {
    const tasks = [
      makeTask({ id: 'task-A1', title: '计划', plannedDate: '2026-07-10' }),
      makeTask({ id: 'task-A2', title: '截止', dueDate: '2026-07-11' }),
      makeTask({ id: 'task-A3', title: '同日', plannedDate: '2026-07-12', dueDate: '2026-07-12' }),
      makeTask({ id: 'task-A4', title: '跨日', plannedDate: '2026-07-13', dueDate: '2026-07-15' }),
      makeTask({ id: 'task-A5', title: '无日期' }),
    ];

    const model = buildMonthModel(2026, 6, tasks, '2026-07-15');

    expect(model).toHaveLength(42);
    expect(model.find((cell) => cell.date === '2026-07-10')?.entries).toMatchObject([{ taskId: 'task-A1', kind: 'card' }]);
    expect(model.find((cell) => cell.date === '2026-07-11')?.entries).toMatchObject([{ taskId: 'task-A2', kind: 'card', deadline: true }]);
    expect(model.find((cell) => cell.date === '2026-07-12')?.entries).toHaveLength(1);
    expect(model.find((cell) => cell.date === '2026-07-12')?.entries[0]).toMatchObject({ deadline: true });
    expect(model.find((cell) => cell.date === '2026-07-15')?.entries).toMatchObject([{ taskId: 'task-A4', kind: 'due-marker' }]);
    expect(model.flatMap((cell) => cell.entries).some((entry) => entry.taskId === 'task-A5')).toBe(false);
  });
});

describe('CalendarView', () => {
  it('changes only planned date when a task is dropped on a day', async () => {
    const index = new TaskIndex();
    const service = { changePlannedDate: vi.fn().mockResolvedValue(undefined) };
    const view = new CalendarView({} as WorkspaceLeaf, index, service, () => '2026-07-15');
    await view.onOpen();
    const day = view.containerEl.querySelector<HTMLElement>('[data-date="2026-07-15"]')!;
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: { getData: () => 'task-A1' } });
    day.dispatchEvent(event);
    await Promise.resolve();
    expect(service.changePlannedDate).toHaveBeenCalledWith('task-A1', '2026-07-15');
  });
});
