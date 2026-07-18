import { setIcon } from 'obsidian';
import type { TaskNode, TaskStatus } from '../domain/task';

export interface CalendarEntry {
  taskId: string;
  title: string;
  kind: 'card' | 'due-marker';
  deadline: boolean;
  status: TaskStatus;
}

export interface CalendarDayCell {
  date: string;
  inMonth: boolean;
  today: boolean;
  entries: CalendarEntry[];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildMonthModel(
  year: number,
  month: number,
  tasks: readonly TaskNode[],
  today: string,
): CalendarDayCell[] {
  const first = new Date(Date.UTC(year, month, 1));
  const firstDayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - firstDayOffset);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const requiredCells = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;
  const visibleCells = Math.max(35, requiredCells);
  return Array.from({ length: visibleCells }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const value = isoDate(date);
    const entries: CalendarEntry[] = [];
    for (const task of tasks) {
      if (task.plannedDate === value) {
        entries.push({
          taskId: task.id,
          title: task.title,
          kind: 'card',
          deadline: task.dueDate === value,
          status: task.status,
        });
      } else if (!task.plannedDate && task.dueDate === value) {
        entries.push({
          taskId: task.id,
          title: task.title,
          kind: 'card',
          deadline: true,
          status: task.status,
        });
      } else if (task.dueDate === value) {
        entries.push({
          taskId: task.id,
          title: task.title,
          kind: 'due-marker',
          deadline: true,
          status: task.status,
        });
      }
    }
    return {
      date: value,
      inMonth: date.getUTCMonth() === month,
      today: value === today,
      entries,
    };
  });
}

export interface CalendarPanelOptions {
  cursor: Date;
  selectedDate: string;
  tasks: readonly TaskNode[];
  today: string;
  onChangeMonth(delta: number): void;
  onSelectDate(date: string): void;
  onEdit(taskId: string): void;
  onMove(taskId: string, plannedDate: string): void;
}

const CALENDAR_DRAG_TYPE = 'text/task-matrix-calendar';

function createTaskButton(
  taskId: string,
  label: string,
  status: TaskStatus,
  onEdit: (taskId: string) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.calendarTaskId = taskId;
  button.dataset.status = status;
  button.draggable = true;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onEdit(taskId);
  });
  button.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData(CALENDAR_DRAG_TYPE, taskId);
  });
  return button;
}

export function renderCalendarPanel(host: HTMLElement, options: CalendarPanelOptions): void {
  host.replaceChildren();
  host.classList.add('task-matrix-calendar', 'tmc-calendar-view');

  const header = document.createElement('header');
  header.className = 'tmc-calendar-toolbar';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.dataset.action = 'previous-month';
  previous.setAttribute('aria-label', '上个月');
  setIcon(previous, 'chevron-left');
  previous.addEventListener('click', () => options.onChangeMonth(-1));
  const title = document.createElement('h2');
  title.textContent = `${options.cursor.getUTCFullYear()} 年 ${options.cursor.getUTCMonth() + 1} 月`;
  const next = document.createElement('button');
  next.type = 'button';
  next.dataset.action = 'next-month';
  next.setAttribute('aria-label', '下个月');
  setIcon(next, 'chevron-right');
  next.addEventListener('click', () => options.onChangeMonth(1));
  header.append(previous, title, next);
  host.append(header);

  const model = buildMonthModel(
    options.cursor.getUTCFullYear(),
    options.cursor.getUTCMonth(),
    options.tasks,
    options.today,
  );
  const grid = document.createElement('div');
  grid.className = 'tmc-calendar-grid';
  for (const day of model) {
    const cell = document.createElement('section');
    cell.className = 'tmc-calendar-day';
    if (!day.inMonth) cell.classList.add('is-outside-month');
    if (day.today) cell.classList.add('is-today');
    if (day.date === options.selectedDate) cell.classList.add('is-selected');
    cell.dataset.date = day.date;
    cell.addEventListener('click', () => options.onSelectDate(day.date));
    const label = document.createElement('strong');
    label.textContent = String(Number(day.date.slice(-2)));
    cell.append(label);
    for (const entry of day.entries) {
      const item = createTaskButton(
        entry.taskId,
        `${entry.deadline ? '截止 · ' : ''}${entry.title}`,
        entry.status,
        options.onEdit,
      );
      item.className = `tmc-calendar-entry tmc-calendar-${entry.kind}`;
      cell.append(item);
    }
    cell.addEventListener('dragover', (event) => event.preventDefault());
    cell.addEventListener('drop', (event) => {
      event.preventDefault();
      const taskId = event.dataTransfer?.getData(CALENDAR_DRAG_TYPE);
      if (taskId) options.onMove(taskId, day.date);
    });
    grid.append(cell);
  }
  host.append(grid);

  const panels = document.createElement('aside');
  panels.className = 'tmc-calendar-panels';
  const taskById = new Map(options.tasks.map((task) => [task.id, task]));
  const selectedDay = document.createElement('section');
  selectedDay.dataset.role = 'selected-day';
  const selectedTitle = document.createElement('h3');
  selectedTitle.textContent = options.selectedDate;
  selectedDay.append(selectedTitle);
  const selectedCursor = new Date(`${options.selectedDate}T00:00:00Z`);
  const selectedModel = buildMonthModel(
    selectedCursor.getUTCFullYear(),
    selectedCursor.getUTCMonth(),
    options.tasks,
    options.today,
  );
  const selectedEntries = selectedModel.find((day) => day.date === options.selectedDate)?.entries ?? [];
  for (const entry of selectedEntries) {
    const task = taskById.get(entry.taskId);
    if (task) selectedDay.append(createTaskButton(task.id, task.title, task.status, options.onEdit));
  }
  panels.append(selectedDay);

  const unscheduled = document.createElement('section');
  unscheduled.dataset.role = 'unscheduled';
  const unscheduledTitle = document.createElement('h3');
  unscheduledTitle.textContent = '无日期';
  unscheduled.append(unscheduledTitle);
  for (const task of options.tasks.filter((item) => !item.plannedDate && !item.dueDate)) {
    unscheduled.append(createTaskButton(task.id, task.title, task.status, options.onEdit));
  }
  panels.append(unscheduled);
  host.append(panels);
}
