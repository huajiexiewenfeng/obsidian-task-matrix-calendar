import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
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
  DEFAULT_FILTER_STATE,
  deriveFilterOptions,
  toTaskFilters,
  type TaskWorkspaceFilterState,
} from './task-filter-state';

export const TASK_WORKSPACE_VIEW_TYPE = 'task-matrix-calendar-task-workspace';

export type TaskWorkspaceMode = 'tasks' | 'calendar';

export interface TaskWorkspaceServicePort {
  transition(id: string, target: TaskStatus): Promise<unknown>;
  complete(id: string, quadrant?: Exclude<TaskQuadrant, 'unclassified'>): Promise<void>;
  changeQuadrant(id: string, quadrant: TaskQuadrant): Promise<void>;
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

const QUADRANTS: Array<[Exclude<TaskQuadrant, 'unclassified'>, string]> = [
  ['important-urgent', '重要且紧急'],
  ['important-not-urgent', '重要不紧急'],
  ['not-important-urgent', '不重要但紧急'],
  ['not-important-not-urgent', '不重要不紧急'],
];

const STATUS_OPTIONS: Array<[TaskWorkspaceFilterState['status'], string]> = [
  ['active', '活动'],
  ['*', '全部'],
  ['todo', '待办'],
  ['in-progress', '进行中'],
  ['paused', '暂停'],
  ['done', '已完成'],
];

const RISK_OPTIONS: Array<[TaskWorkspaceFilterState['risk'], string]> = [
  ['*', '全部'],
  ['overdue', '已逾期'],
  ['due-today', '今天截止'],
  ['upcoming', '即将截止'],
  ['none', '无风险'],
];

export class TaskWorkspaceView extends ItemView {
  private unsubscribe?: () => void;
  private mode: TaskWorkspaceMode = 'tasks';
  private filters: TaskWorkspaceFilterState = { ...DEFAULT_FILTER_STATE };
  private calendarCursor: Date;
  private selectedDate: string;
  private importing = false;

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
    this.containerEl.append(this.renderHeader(), this.renderFilters());

    const content = document.createElement('main');
    content.dataset.workspaceMode = this.mode;
    if (this.mode === 'tasks') {
      this.renderTaskMatrix(content);
    } else {
      this.renderCalendar(content);
    }
    this.containerEl.append(content);
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'tmc-view-header';
    const heading = document.createElement('h2');
    heading.textContent = '任务中心';

    const create = document.createElement('button');
    create.type = 'button';
    create.dataset.action = 'new-task';
    create.textContent = '+ 新任务';
    create.addEventListener('click', () => this.form.openCreate());

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.dataset.action = 'import-legacy';
    importButton.textContent = '导入旧任务';
    importButton.disabled = this.importing;
    importButton.addEventListener('click', () => {
      if (this.importing) return;
      this.importing = true;
      importButton.disabled = true;
      void this.run(this.importAction).finally(() => {
        this.importing = false;
        this.render();
      });
    });

    const modes = document.createElement('div');
    modes.className = 'tmc-workspace-modes';
    modes.append(
      this.modeButton('tasks', '任务'),
      this.modeButton('calendar', '日历'),
    );
    header.append(heading, create, importButton, modes);
    return header;
  }

  private modeButton(mode: TaskWorkspaceMode, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = mode;
    button.textContent = label;
    button.classList.toggle('is-active', this.mode === mode);
    button.setAttribute('aria-pressed', String(this.mode === mode));
    button.addEventListener('click', () => this.setMode(mode));
    return button;
  }

  private renderFilters(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'tmc-filters';
    const search = document.createElement('input');
    search.type = 'search';
    search.dataset.filter = 'query';
    search.placeholder = '搜索标题、详情、项目、标签……';
    search.value = this.filters.query;
    search.addEventListener('input', () => {
      this.filters.query = search.value;
      this.render();
    });
    toolbar.append(search);

    const options = deriveFilterOptions(this.index.snapshot().tasks);
    toolbar.append(
      this.filterSelect(
        'project',
        this.filters.project,
        [['*', '项目：全部'], ...options.projects.map((project) => [project, project] as [string, string])],
        (value) => { this.filters.project = value; },
      ),
      this.filterSelect(
        'status',
        this.filters.status,
        STATUS_OPTIONS,
        (value) => { this.filters.status = value as TaskWorkspaceFilterState['status']; },
      ),
      this.filterSelect(
        'risk',
        this.filters.risk,
        RISK_OPTIONS,
        (value) => { this.filters.risk = value as TaskWorkspaceFilterState['risk']; },
      ),
      this.filterSelect(
        'source',
        this.filters.sourcePath,
        [['*', '来源：全部'], ...options.sourcePaths.map((path) => [path, path] as [string, string])],
        (value) => { this.filters.sourcePath = value; },
      ),
    );
    return toolbar;
  }

  private filterSelect(
    name: 'project' | 'status' | 'risk' | 'source',
    value: string,
    choices: ReadonlyArray<readonly [string, string]>,
    update: (value: string) => void,
  ): HTMLSelectElement {
    const select = document.createElement('select');
    select.dataset.filter = name;
    for (const [choice, label] of choices) {
      const option = document.createElement('option');
      option.value = choice;
      option.textContent = label;
      option.selected = choice === value;
      select.append(option);
    }
    select.addEventListener('change', () => {
      update(select.value);
      this.render();
    });
    return select;
  }

  private filteredTasks(): IndexedTask[] {
    return this.index
      .query(toTaskFilters(this.filters), this.today(), this.dueSoonDays)
      .filter((item) => !item.task.parentId);
  }

  private renderTaskMatrix(host: HTMLElement): void {
    const tasks = this.filteredTasks();
    const unclassified = tasks.filter((item) => item.task.quadrant === 'unclassified');
    host.append(this.renderSection(`未分类收件箱 · ${unclassified.length}`, 'unclassified', unclassified));

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
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading);
    section.addEventListener('dragover', (event) => event.preventDefault());
    section.addEventListener('drop', (event) => {
      event.preventDefault();
      const taskId = event.dataTransfer?.getData('text/task-matrix-calendar');
      if (taskId) void this.run(() => this.service.changeQuadrant(taskId, quadrant));
    });

    for (const indexed of tasks) {
      const card = renderTaskCard(
        section,
        indexed,
        this.progress(indexed),
        classifyDateRisk(indexed.task.dueDate, indexed.task.status, this.today(), this.dueSoonDays),
        this.actions(indexed),
      );
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/task-matrix-calendar', indexed.task.id);
      });
    }
    if (tasks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tmc-empty';
      empty.textContent = '暂无任务';
      section.append(empty);
    }
    return section;
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
      start: () => void this.run(async () => {
        if (indexed.task.quadrant === 'unclassified') {
          const quadrant = await this.prompt.chooseQuadrant(id);
          if (!quadrant) return;
          await this.service.changeQuadrant(id, quadrant);
        }
        await this.service.transition(id, 'in-progress');
      }),
      complete: () => void this.run(async () => {
        if (indexed.task.quadrant === 'unclassified') {
          const quadrant = await this.prompt.chooseQuadrant(id);
          if (!quadrant) return;
          await this.service.complete(id, quadrant);
          return;
        }
        await this.service.complete(id);
      }),
      pause: () => void this.run(() => this.service.transition(id, 'paused')),
      resume: () => void this.run(() => this.service.transition(id, 'in-progress')),
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
}
