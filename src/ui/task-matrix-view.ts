import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import { classifyDateRisk } from '../domain/dates';
import type { IndexedTask, TaskNode, TaskQuadrant, TaskStatus } from '../domain/task';
import type { TaskIndex } from '../index/task-index';
import type { ClassificationPromptPort } from '../services/external-checkbox-coordinator';
import { TaskEditorDrawer, type TaskEditorServicePort } from './task-editor-drawer';
import { renderTaskCard, type TaskCardActions } from './task-card';

export const TASK_MATRIX_VIEW_TYPE = 'task-matrix-calendar-task-view';

const QUADRANTS: Array<[Exclude<TaskQuadrant, 'unclassified'>, string]> = [
  ['important-urgent', '重要且紧急'],
  ['important-not-urgent', '重要不紧急'],
  ['not-important-urgent', '不重要但紧急'],
  ['not-important-not-urgent', '不重要不紧急'],
];

export interface TaskMatrixServicePort extends TaskEditorServicePort {
  transition(id: string, target: TaskStatus): Promise<unknown>;
  complete(id: string, quadrant?: Exclude<TaskQuadrant, 'unclassified'>): Promise<void>;
  changeQuadrant(id: string, quadrant: TaskQuadrant): Promise<void>;
  create?(input: { title: string; parentId?: string }): Promise<TaskNode>;
}

type TodayProvider = () => string;

export class TaskMatrixView extends ItemView {
  private unsubscribe?: () => void;
  private query = '';
  private readonly editor: TaskEditorDrawer;
  private readonly editorElement = document.createElement('div');

  constructor(
    leaf: WorkspaceLeaf,
    private readonly index: TaskIndex,
    private readonly service: TaskMatrixServicePort,
    private readonly prompt: ClassificationPromptPort,
    private readonly dueSoonDays: number,
    private readonly today: TodayProvider,
    trash: { moveToTrash(taskId: string, deletedAt: string): Promise<void> } = {
      moveToTrash: async () => undefined,
    },
    locate: (taskId: string) => void = () => undefined,
  ) {
    super(leaf);
    this.editor = new TaskEditorDrawer(
      this.editorElement,
      service,
      trash,
      locate,
    );
  }

  getViewType(): string {
    return TASK_MATRIX_VIEW_TYPE;
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

  private render(): void {
    this.containerEl.replaceChildren();
    this.containerEl.classList.add('task-matrix-calendar');
    const layout = document.createElement('div');
    layout.className = 'tmc-task-layout';
    const main = document.createElement('main');
    const drawerHost = document.createElement('aside');
    drawerHost.className = 'tmc-drawer-host';
    layout.append(main, drawerHost);
    this.containerEl.append(layout);

    const header = document.createElement('header');
    header.className = 'tmc-view-header';
    const heading = document.createElement('h2');
    heading.textContent = '任务中心';
    const create = document.createElement('button');
    create.type = 'button';
    create.textContent = '+ 新任务';
    create.dataset.action = 'create';
    const createTitle = document.createElement('input');
    createTitle.dataset.role = 'quick-create-title';
    createTitle.placeholder = '输入标题后快速创建';
    create.addEventListener('click', () => {
      const title = createTitle.value.trim();
      if (title && this.service.create) {
        void this.run(() => this.service.create?.({ title }) ?? Promise.resolve());
        createTitle.value = '';
      }
    });
    header.append(heading, createTitle, create);
    main.append(header, this.renderFilters());

    const tasks = this.index
      .query({ query: this.query }, this.today(), this.dueSoonDays)
      .filter((item) => !item.task.parentId);
    const unclassified = tasks.filter((item) => item.task.quadrant === 'unclassified');
    main.append(this.renderSection(`未分类收件箱 · ${unclassified.length}`, 'unclassified', unclassified));

    const grid = document.createElement('div');
    grid.className = 'tmc-quadrant-grid';
    for (const [quadrant, title] of QUADRANTS) {
      grid.append(this.renderSection(title, quadrant, tasks.filter((item) => item.task.quadrant === quadrant)));
    }
    main.append(grid);

    if (this.editorElement.childElementCount > 0) drawerHost.append(this.editorElement);
  }

  private renderFilters(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'tmc-filters';
    const search = document.createElement('input');
    search.type = 'search';
    search.dataset.filter = 'query';
    search.placeholder = '搜索标题、项目、标签……';
    search.value = this.query;
    search.addEventListener('input', () => {
      this.query = search.value;
      this.render();
    });
    toolbar.append(search);
    for (const label of ['项目：全部', '状态：活动', '截止风险', '来源文档']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      toolbar.append(button);
    }
    return toolbar;
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
    for (const task of tasks) {
      const card = renderTaskCard(
        section,
        task,
        this.progress(task),
        classifyDateRisk(task.task.dueDate, task.task.status, this.today(), this.dueSoonDays),
        this.actions(task),
      );
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/task-matrix-calendar', task.task.id);
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

  private progress(indexed: IndexedTask): { done: number; total: number } {
    const children = this.index.childrenOf(indexed.task.id);
    return { done: children.filter((item) => item.task.status === 'done').length, total: children.length };
  }

  private actions(indexed: IndexedTask): TaskCardActions {
    const id = indexed.task.id;
    return {
      open: () => this.openEditor(id),
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

  private openEditor(taskId: string): void {
    const indexed = this.index.get(taskId);
    const host = this.containerEl.querySelector<HTMLElement>('.tmc-drawer-host');
    if (!indexed || !host) return;
    this.editor.open(indexed);
    host.append(this.editorElement);
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
