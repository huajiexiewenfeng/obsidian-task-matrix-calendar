// @vitest-environment jsdom
import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../src/domain/task';
import { buildMonthModel, CalendarView, renderCalendarPanel } from '../../src/ui/calendar-view';
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

describe('renderCalendarPanel', () => {
  const tasks = [
    makeTask({ id: 'task-A1', title: '选中日计划', plannedDate: '2026-07-15' }),
    makeTask({ id: 'task-A2', title: '选中日截止', dueDate: '2026-07-15' }),
    makeTask({ id: 'task-A3', title: '跨日截止', plannedDate: '2026-07-14', dueDate: '2026-07-15' }),
    makeTask({ id: 'task-A4', title: '无日期' }),
  ];

  function render() {
    const host = document.createElement('div');
    const callbacks = {
      onChangeMonth: vi.fn(),
      onSelectDate: vi.fn(),
      onEdit: vi.fn(),
      onMove: vi.fn(),
    };
    renderCalendarPanel(host, {
      cursor: new Date(Date.UTC(2026, 6, 1)),
      selectedDate: '2026-07-15',
      tasks,
      today: '2026-07-15',
      ...callbacks,
    });
    return { host, ...callbacks };
  }

  it('renders 42 day cells with selected-day and exactly unscheduled tasks', () => {
    const { host } = render();

    expect(host.querySelectorAll('[data-date]')).toHaveLength(42);
    expect(host.querySelector('[data-date="2026-07-15"]')?.classList.contains('is-selected')).toBe(true);
    expect(host.querySelector('[data-role="selected-day"]')?.textContent).toContain('2026-07-15');
    expect(host.querySelector('[data-role="selected-day"]')?.textContent).toContain('选中日计划');
    expect(host.querySelector('[data-role="selected-day"]')?.textContent).toContain('选中日截止');
    expect(host.querySelectorAll('[data-role="unscheduled"] [data-calendar-task-id]'))
      .toHaveLength(1);
    expect(host.querySelector('[data-role="unscheduled"]')?.textContent).toContain('无日期');
  });

  it('delegates month navigation, date selection, and task editing', () => {
    const { host, onChangeMonth, onSelectDate, onEdit } = render();

    host.querySelector<HTMLButtonElement>('[data-action="previous-month"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-action="next-month"]')!.click();
    host.querySelector<HTMLElement>('[data-date="2026-07-16"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-calendar-task-id="task-A1"]')!.click();

    expect(onChangeMonth).toHaveBeenNthCalledWith(1, -1);
    expect(onChangeMonth).toHaveBeenNthCalledWith(2, 1);
    expect(onSelectDate).toHaveBeenCalledWith('2026-07-16');
    expect(onEdit).toHaveBeenCalledWith('task-A1');
  });

  it('makes task cards draggable and drops by changing only the planned date', () => {
    const { host, onMove } = render();
    const unscheduled = host.querySelector<HTMLButtonElement>(
      '[data-role="unscheduled"] [data-calendar-task-id="task-A4"]',
    )!;
    const transfer = { setData: vi.fn(), getData: vi.fn(() => 'task-A4') };
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
    unscheduled.dispatchEvent(dragStart);
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: transfer });
    host.querySelector<HTMLElement>('[data-date="2026-07-20"]')!.dispatchEvent(drop);

    expect(unscheduled.draggable).toBe(true);
    expect(transfer.setData).toHaveBeenCalledWith('text/task-matrix-calendar', 'task-A4');
    expect(onMove).toHaveBeenCalledWith('task-A4', '2026-07-20');
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
