import { ItemView, MarkdownRenderer, Notice, type WorkspaceLeaf } from 'obsidian';
import { classifyDateRisk } from '../domain/dates';
import type { IndexedTask, TaskQuadrant, TaskStatus } from '../domain/task';
import type { TaskIndex } from '../index/task-index';
import type { ClassificationPromptPort } from '../services/external-checkbox-coordinator';
import {
  renderCalendarPanel,
  type CalendarPanelOptions,
} from './calendar-view';
import { renderTaskCard, type TaskCardActions } from './task-card';
import {
  renderTaskFilterBar,
  type FilterName,
  type SearchChange,
} from './task-filter-bar';
import {
  DEFAULT_FILTER_STATE,
  deriveFilterOptions,
  toTaskFilters,
  type TaskWorkspaceFilterState,
} from './task-filter-state';
import { renderTaskWorkspaceHeader } from './task-workspace-header';

export const TASK_WORKSPACE_VIEW_TYPE = 'task-matrix-calendar-task-workspace';

export type TaskWorkspaceMode = 'tasks' | 'calendar';

export interface TaskWorkspaceServicePort {
  transition(id: string, target: TaskStatus): Promise<unknown>;
  complete(id: string, quadrant?: Exclude<TaskQuadrant, 'unclassified'>): Promise<void>;
  changeQuadrant(id: string, quadrant: TaskQuadrant): Promise<void>;
  reorderWithinQuadrant(
    id: string,
    targetId?: string,
    position?: 'before' | 'after',
  ): Promise<void>;
  changePlannedDate(id: string, plannedDate?: string): Promise<void>;
}

export interface TaskWorkspaceFormPort {
  openCreate(): void;
  openEdit(indexed: IndexedTask): void;
}

export type TaskWorkspaceImportAction = () => Promise<unknown>;
export type TaskWorkspaceCalendarRenderer = (
  host: HTMLElement,
  options: CalendarPanelOptions,
) => void;

type TodayProvider = () => string;
type TaskAction = 'start' | 'complete' | 'pause' | 'resume';

const QUADRANTS: Array<[Exclude<TaskQuadrant, 'unclassified'>, string]> = [
  ['important-urgent', '重要且紧急'],
  ['important-not-urgent', '重要不紧急'],
  ['not-important-urgent', '不重要但紧急'],
  ['not-important-not-urgent', '不重要不紧急'],
];

export class TaskWorkspaceView extends ItemView {
  private unsubscribe?: () => void;
  private mode: TaskWorkspaceMode = 'tasks';
  private filters: TaskWorkspaceFilterState = { ...DEFAULT_FILTER_STATE };
  private calendarCursor: Date;
  private selectedDate: string;
  private importing = false;
  private draggedTaskId?: string;
  private readonly pendingTaskActions = new Map<string, TaskAction>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly index: TaskIndex,
    private readonly service: TaskWorkspaceServicePort,
    private readonly prompt: ClassificationPromptPort,
    private readonly form: TaskWorkspaceFormPort,
    private readonly dueSoonDays: number,
    private readonly today: TodayProvider,
    private readonly importAction: TaskWorkspaceImportAction,
    private readonly calendarRenderer: TaskWorkspaceCalendarRenderer = renderCalendarPanel,
  ) {
    super(leaf);
    this.calendarCursor = new Date(`${today()}T00:00:00Z`);
    this.selectedDate = today();
  }

  getViewType(): string {
    return TASK_WORKSPACE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '任务中心';
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.index.subscribe(() => this.render());
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  setMode(mode: TaskWorkspaceMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.render();
  }

  private render(): void {
    this.containerEl.replaceChildren();
    this.containerEl.classList.add('task-matrix-calendar', 'tmc-task-workspace');
    this.containerEl.append(
      renderTaskWorkspaceHeader({
        mode: this.mode,
        importing: this.importing,
        summary: this.workspaceSummary(),
        onCreate: () => this.form.openCreate(),
        onImport: () => this.startImport(),
        onModeChange: (mode) => this.setMode(mode),
      }),
      renderTaskFilterBar({
        state: this.filters,
        choices: deriveFilterOptions(this.index.snapshot().tasks),
        onSearch: (change) => this.changeSearch(change),
        onFilterChange: (name, value) => this.changeFilter(name, value),
        onClear: () => {
          this.filters = { ...DEFAULT_FILTER_STATE };
          this.render();
        },
      }),
    );

    const content = document.createElement('main');
    content.dataset.workspaceMode = this.mode;
    if (this.mode === 'tasks') this.renderTaskMatrix(content);
    else this.renderCalendar(content);
    this.containerEl.append(content);
  }

  private workspaceSummary(): { active: number; dueRisk: number; unclassified: number } {
    const active = this.index.snapshot().tasks.filter(
      (item) => !item.task.parentId && item.task.status !== 'done',
    );
    return {
      active: active.length,
      dueRisk: active.filter((item) => classifyDateRisk(
        item.task.dueDate,
        item.task.status,
        this.today(),
        this.dueSoonDays,
      ) !== 'none').length,
      unclassified: active.filter((item) => item.task.quadrant === 'unclassified').length,
    };
  }

  private startImport(): void {
    if (this.importing) return;
    this.importing = true;
    const importButton = this.containerEl.querySelector<HTMLButtonElement>(
      '[data-action="import-legacy"]',
    );
    if (importButton) importButton.disabled = true;
    void this.run(this.importAction).finally(() => {
      this.importing = false;
      this.render();
    });
  }

  private changeSearch(change: SearchChange): void {
    this.filters.query = change.query;
    this.render();
    if (!change.restoreFocus) return;

    const replacement = this.containerEl.querySelector<HTMLInputElement>('[data-filter="query"]');
    replacement?.focus();
    if (change.selectionStart !== null && change.selectionEnd !== null) {
      replacement?.setSelectionRange(
        change.selectionStart,
        change.selectionEnd,
        change.selectionDirection,
      );
    }
  }

  private changeFilter(name: FilterName, value: string): void {
    if (name === 'project') this.filters.project = value;
    else if (name === 'status') this.filters.status = value as TaskWorkspaceFilterState['status'];
    else if (name === 'risk') this.filters.risk = value as TaskWorkspaceFilterState['risk'];
    else this.filters.sourcePath = value;
    this.render();
  }

  private filteredTasks(): IndexedTask[] {
    return this.index
      .query(toTaskFilters(this.filters), this.today(), this.dueSoonDays)
      .filter((item) => !item.task.parentId);
  }

  private renderTaskMatrix(host: HTMLElement): void {
    const tasks = this.filteredTasks();
    const unclassified = tasks.filter((item) => item.task.quadrant === 'unclassified');
    host.append(this.renderSection('未分类收件箱', 'unclassified', unclassified));

    const grid = document.createElement('div');
    grid.className = 'tmc-quadrant-grid';
    for (const [quadrant, title] of QUADRANTS) {
      grid.append(this.renderSection(
        title,
        quadrant,
        tasks.filter((item) => item.task.quadrant === quadrant),
      ));
    }
    host.append(grid);
  }

  private renderSection(title: string, quadrant: TaskQuadrant, tasks: IndexedTask[]): HTMLElement {
    const section = document.createElement('section');
    section.className = `tmc-task-section tmc-quadrant-${quadrant}`;
    section.dataset.quadrant = quadrant;
    const sectionHeader = document.createElement('header');
    sectionHeader.className = 'tmc-task-section-header';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const count = document.createElement('span');
    count.dataset.role = 'section-count';
    count.textContent = String(tasks.length);
    sectionHeader.append(heading, count);
    if (quadrant === 'unclassified') {
      const guidance = document.createElement('span');
      guidance.className = 'tmc-task-section-guidance';
      guidance.textContent = '执行前必须分类';
      sectionHeader.append(guidance);
    }
    section.append(sectionHeader);
    const taskList = document.createElement('div');
    taskList.className = 'tmc-task-list';
    taskList.dataset.role = 'task-list';
    section.append(taskList);
    section.addEventListener('dragover', (event) => event.preventDefault());
    section.addEventListener('drop', (event) => {
      event.preventDefault();
      const taskId = event.dataTransfer?.getData('text/task-matrix-calendar')
        || this.draggedTaskId;
      this.draggedTaskId = undefined;
      this.clearDropIndicators();
      if (!taskId) return;
      const dragged = this.index.get(taskId);
      if (dragged?.task.quadrant === quadrant) {
        void this.run(() => this.service.reorderWithinQuadrant(taskId));
      } else {
        void this.run(() => this.service.changeQuadrant(taskId, quadrant));
      }
    });

    for (const indexed of tasks) {
      const card = renderTaskCard(
        taskList,
        indexed,
        this.progress(indexed),
        classifyDateRisk(indexed.task.dueDate, indexed.task.status, this.today(), this.dueSoonDays),
        this.actions(indexed),
        this.pendingTaskActions.has(indexed.task.id),
        (container, markdown, sourcePath) => {
          void MarkdownRenderer.render(this.app, markdown, container, sourcePath, this);
        },
      );
      card.addEventListener('dragstart', (event) => {
        this.draggedTaskId = indexed.task.id;
        event.dataTransfer?.setData('text/task-matrix-calendar', indexed.task.id);
      });
      card.addEventListener('dragover', (event) => {
        const taskId = this.draggedTaskId
          || event.dataTransfer?.getData('text/task-matrix-calendar');
        const dragged = taskId ? this.index.get(taskId) : undefined;
        if (!dragged || dragged.task.quadrant !== quadrant) return;
        event.preventDefault();
        event.stopPropagation();
        this.clearDropIndicators();
        if (taskId === indexed.task.id) return;
        card.dataset.dropPosition = this.cardDropPosition(card, event);
      });
      card.addEventListener('drop', (event) => {
        const taskId = event.dataTransfer?.getData('text/task-matrix-calendar')
          || this.draggedTaskId;
        const dragged = taskId ? this.index.get(taskId) : undefined;
        if (!taskId || !dragged || dragged.task.quadrant !== quadrant) return;
        event.preventDefault();
        event.stopPropagation();
        const storedPosition = card.dataset.dropPosition;
        const position: 'before' | 'after' =
          storedPosition === 'before' || storedPosition === 'after'
            ? storedPosition
            : this.cardDropPosition(card, event);
        this.draggedTaskId = undefined;
        this.clearDropIndicators();
        if (taskId !== indexed.task.id) {
          void this.run(() => this.service.reorderWithinQuadrant(
            taskId,
            indexed.task.id,
            position,
          ));
        }
      });
      card.addEventListener('dragend', () => {
        this.draggedTaskId = undefined;
        this.clearDropIndicators();
      });
    }
    if (tasks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tmc-empty';
      empty.textContent = '暂无任务';
      taskList.append(empty);
    }
    return section;
  }

  private cardDropPosition(card: HTMLElement, event: DragEvent): 'before' | 'after' {
    const bounds = card.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
  }

  private clearDropIndicators(): void {
    this.containerEl.querySelectorAll<HTMLElement>('[data-drop-position]').forEach((element) => {
      delete element.dataset.dropPosition;
    });
  }

  private renderCalendar(host: HTMLElement): void {
    this.calendarRenderer(host, {
      cursor: this.calendarCursor,
      selectedDate: this.selectedDate,
      tasks: this.filteredTasks().map((item) => item.task),
      today: this.today(),
      onChangeMonth: (delta) => {
        this.calendarCursor = new Date(Date.UTC(
          this.calendarCursor.getUTCFullYear(),
          this.calendarCursor.getUTCMonth() + delta,
          1,
        ));
        this.render();
      },
      onSelectDate: (date) => {
        this.selectedDate = date;
        this.render();
      },
      onEdit: (taskId) => this.openTask(taskId),
      onMove: (taskId, plannedDate) => {
        void this.run(() => this.service.changePlannedDate(taskId, plannedDate));
      },
    });
  }

  private progress(indexed: IndexedTask): { done: number; total: number } {
    const children = this.index.childrenOf(indexed.task.id);
    return {
      done: children.filter((item) => item.task.status === 'done').length,
      total: children.length,
    };
  }

  private actions(indexed: IndexedTask): TaskCardActions {
    const id = indexed.task.id;
    return {
      open: () => this.openTask(id),
      openLink: (linktext, sourcePath) => {
        void this.app.workspace.openLinkText(linktext, sourcePath, false);
      },
      start: () => void this.runTaskAction(id, 'start', async () => {
        if (indexed.task.quadrant === 'unclassified') {
          const quadrant = await this.prompt.chooseQuadrant(id);
          if (!quadrant) return;
          await this.service.changeQuadrant(id, quadrant);
        }
        await this.service.transition(id, 'in-progress');
      }),
      complete: () => void this.runTaskAction(id, 'complete', async () => {
        if (indexed.task.quadrant === 'unclassified') {
          const quadrant = await this.prompt.chooseQuadrant(id);
          if (!quadrant) return;
          await this.service.complete(id, quadrant);
          return;
        }
        await this.service.complete(id);
      }),
      pause: () => void this.runTaskAction(
        id,
        'pause',
        () => this.service.transition(id, 'paused'),
      ),
      resume: () => void this.runTaskAction(
        id,
        'resume',
        () => this.service.transition(id, 'in-progress'),
      ),
    };
  }

  private openTask(taskId: string): void {
    const indexed = this.index.get(taskId);
    if (indexed) this.form.openEdit(indexed);
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`任务操作失败：${message}`);
      this.render();
    }
  }

  private async runTaskAction(
    taskId: string,
    actionName: TaskAction,
    action: () => Promise<unknown>,
  ): Promise<void> {
    if (this.pendingTaskActions.has(taskId)) return;
    this.pendingTaskActions.set(taskId, actionName);
    this.render();
    try {
      await this.run(action);
    } finally {
      if (this.pendingTaskActions.get(taskId) === actionName) {
        this.pendingTaskActions.delete(taskId);
      }
      this.render();
    }
  }
}
