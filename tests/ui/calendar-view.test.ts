// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../src/domain/task';
import { buildMonthModel, renderCalendarPanel } from '../../src/ui/calendar-view';

describe('buildMonthModel', () => {
  it('builds 42 cells with planned cards and deduplicated due markers', () => {
    const tasks = [
      makeTask({ id: 'task-A1', title: '计划', plannedDate: '2026-07-10', status: 'in-progress' }),
      makeTask({ id: 'task-A2', title: '截止', dueDate: '2026-07-11', status: 'paused' }),
      makeTask({ id: 'task-A3', title: '同日', plannedDate: '2026-07-12', dueDate: '2026-07-12' }),
      makeTask({ id: 'task-A4', title: '跨日', plannedDate: '2026-07-13', dueDate: '2026-07-15' }),
      makeTask({ id: 'task-A5', title: '无日期' }),
    ];

    const model = buildMonthModel(2026, 6, tasks, '2026-07-15');

    expect(model).toHaveLength(42);
    expect(model.find((cell) => cell.date === '2026-07-10')?.entries).toMatchObject([
      { taskId: 'task-A1', kind: 'card', status: 'in-progress' },
    ]);
    expect(model.find((cell) => cell.date === '2026-07-11')?.entries).toMatchObject([
      { taskId: 'task-A2', kind: 'card', deadline: true, status: 'paused' },
    ]);
    expect(model.find((cell) => cell.date === '2026-07-12')?.entries).toHaveLength(1);
    expect(model.find((cell) => cell.date === '2026-07-12')?.entries[0]).toMatchObject({ deadline: true });
    expect(model.find((cell) => cell.date === '2026-07-15')?.entries).toMatchObject([{ taskId: 'task-A4', kind: 'due-marker' }]);
    expect(model.flatMap((cell) => cell.entries).some((entry) => entry.taskId === 'task-A5')).toBe(false);
  });
});

describe('renderCalendarPanel', () => {
  const tasks = [
    makeTask({ id: 'task-A1', title: '选中日计划', plannedDate: '2026-07-15', status: 'in-progress' }),
    makeTask({ id: 'task-A2', title: '选中日截止', dueDate: '2026-07-15', status: 'paused' }),
    makeTask({ id: 'task-A3', title: '跨日截止', plannedDate: '2026-07-14', dueDate: '2026-07-15', status: 'done' }),
    makeTask({ id: 'task-A4', title: '无日期', status: 'todo' }),
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

    expect(host.querySelector('.tmc-calendar-toolbar [data-action="previous-month"]'))
      .not.toBeNull();
    expect(host.querySelector('.tmc-calendar-panels [data-role="selected-day"]'))
      .not.toBeNull();
    expect(host.querySelector('.tmc-calendar-panels [data-role="unscheduled"]'))
      .not.toBeNull();
    expect(host.querySelectorAll('[data-date]')).toHaveLength(42);
    expect(host.querySelector('[data-date="2026-07-15"]')?.classList.contains('is-selected')).toBe(true);
    expect(host.querySelector('[data-role="selected-day"]')?.textContent).toContain('2026-07-15');
    expect(host.querySelector('[data-role="selected-day"]')?.textContent).toContain('选中日计划');
    expect(host.querySelector('[data-role="selected-day"]')?.textContent).toContain('选中日截止');
    expect(host.querySelectorAll('[data-role="unscheduled"] [data-calendar-task-id]'))
      .toHaveLength(1);
    expect(host.querySelector('[data-role="unscheduled"]')?.textContent).toContain('无日期');
    expect(host.querySelector('[data-date="2026-07-15"] [data-calendar-task-id="task-A1"]')
      ?.getAttribute('data-status')).toBe('in-progress');
    expect(host.querySelector('[data-role="selected-day"] [data-calendar-task-id="task-A2"]')
      ?.getAttribute('data-status')).toBe('paused');
    expect(host.querySelector('[data-role="unscheduled"] [data-calendar-task-id="task-A4"]')
      ?.getAttribute('data-status')).toBe('todo');
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

  it('keeps selected-day tasks visible and editable when the cursor is in another month', () => {
    const host = document.createElement('div');
    const onEdit = vi.fn();
    renderCalendarPanel(host, {
      cursor: new Date(Date.UTC(2026, 7, 1)),
      selectedDate: '2026-07-15',
      tasks,
      today: '2026-07-15',
      onChangeMonth: vi.fn(),
      onSelectDate: vi.fn(),
      onEdit,
      onMove: vi.fn(),
    });

    const selectedTask = host.querySelector<HTMLButtonElement>(
      '[data-role="selected-day"] [data-calendar-task-id="task-A1"]',
    );
    expect(Array.from(
      host.querySelectorAll<HTMLElement>('[data-role="selected-day"] [data-calendar-task-id]'),
      (item) => item.dataset.calendarTaskId,
    )).toEqual(['task-A1', 'task-A2', 'task-A3']);
    expect(selectedTask?.textContent).toBe('选中日计划');
    selectedTask?.click();
    expect(onEdit).toHaveBeenCalledWith('task-A1');
  });
});
