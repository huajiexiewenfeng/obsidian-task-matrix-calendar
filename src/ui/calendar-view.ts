import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type { TaskNode } from '../domain/task';
import type { TaskIndex } from '../index/task-index';

export const CALENDAR_VIEW_TYPE = 'task-matrix-calendar-calendar-view';

export interface CalendarEntry {
  taskId: string;
  title: string;
  kind: 'card' | 'due-marker';
  deadline: boolean;
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
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, offset) => {
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
        });
      } else if (!task.plannedDate && task.dueDate === value) {
        entries.push({ taskId: task.id, title: task.title, kind: 'card', deadline: true });
      } else if (task.dueDate === value) {
        entries.push({ taskId: task.id, title: task.title, kind: 'due-marker', deadline: true });
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

export interface CalendarTaskServicePort {
  changePlannedDate(id: string, plannedDate?: string): Promise<void>;
}

export class CalendarView extends ItemView {
  private unsubscribe?: () => void;
  private cursor: Date;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly index: TaskIndex,
    private readonly service: CalendarTaskServicePort,
    private readonly today: () => string,
  ) {
    super(leaf);
    this.cursor = new Date(`${today()}T00:00:00Z`);
  }

  getViewType(): string { return CALENDAR_VIEW_TYPE; }
  getDisplayText(): string { return '任务日历'; }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.index.subscribe(() => this.render());
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
  }

  private render(): void {
    this.containerEl.replaceChildren();
    this.containerEl.classList.add('task-matrix-calendar', 'tmc-calendar-view');
    const header = document.createElement('header');
    const previous = document.createElement('button');
    previous.textContent = '‹';
    previous.addEventListener('click', () => this.moveMonth(-1));
    const title = document.createElement('h2');
    title.textContent = `${this.cursor.getUTCFullYear()} 年 ${this.cursor.getUTCMonth() + 1} 月`;
    const next = document.createElement('button');
    next.textContent = '›';
    next.addEventListener('click', () => this.moveMonth(1));
    header.append(previous, title, next);
    this.containerEl.append(header);

    const grid = document.createElement('div');
    grid.className = 'tmc-calendar-grid';
    const tasks = this.index.snapshot().tasks.map((item) => item.task);
    const model = buildMonthModel(
      this.cursor.getUTCFullYear(),
      this.cursor.getUTCMonth(),
      tasks,
      this.today(),
    );
    for (const day of model) {
      const cell = document.createElement('section');
      cell.className = 'tmc-calendar-day';
      if (!day.inMonth) cell.classList.add('is-outside-month');
      if (day.today) cell.classList.add('is-today');
      cell.dataset.date = day.date;
      const label = document.createElement('strong');
      label.textContent = String(Number(day.date.slice(-2)));
      cell.append(label);
      for (const entry of day.entries) {
        const item = document.createElement(entry.kind === 'card' ? 'button' : 'span');
        item.className = `tmc-calendar-entry tmc-calendar-${entry.kind}`;
        item.textContent = `${entry.deadline ? '截止 · ' : ''}${entry.title}`;
        item.dataset.taskId = entry.taskId;
        cell.append(item);
      }
      cell.addEventListener('dragover', (event) => event.preventDefault());
      cell.addEventListener('drop', (event) => {
        event.preventDefault();
        const taskId = event.dataTransfer?.getData('text/task-matrix-calendar');
        if (taskId) void this.service.changePlannedDate(taskId, day.date);
      });
      grid.append(cell);
    }
    this.containerEl.append(grid);
  }

  private moveMonth(delta: number): void {
    this.cursor = new Date(Date.UTC(this.cursor.getUTCFullYear(), this.cursor.getUTCMonth() + delta, 1));
    this.render();
  }
}
