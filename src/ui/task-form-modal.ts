import { Modal, type App } from 'obsidian';
import { normalizeDateInput } from '../domain/dates';
import type { IndexedTask, TaskNode, TaskQuadrant, TaskStatus } from '../domain/task';
import { TaskWriteError } from '../persistence/obsidian-task-repository';
import type { CreateTaskInput } from '../services/task-service';

export interface TaskFormServicePort {
  create(input: CreateTaskInput): Promise<TaskNode>;
  update(id: string, patch: Partial<Omit<TaskNode, 'id' | 'childrenIds'>>): Promise<void>;
}

type FormMode = { kind: 'create' } | { kind: 'edit'; indexed: IndexedTask };

const STATUS_CHOICES: Array<[TaskStatus, string]> = [
  ['todo', '待办'],
  ['in-progress', '进行中'],
  ['paused', '暂停'],
  ['done', '已完成'],
];

const QUADRANT_CHOICES: Array<[TaskQuadrant, string]> = [
  ['unclassified', '未分类'],
  ['important-urgent', '重要且紧急'],
  ['important-not-urgent', '重要不紧急'],
  ['not-important-urgent', '不重要但紧急'],
  ['not-important-not-urgent', '不重要不紧急'],
];

function formErrorMessage(error: unknown): string {
  if (error instanceof TaskWriteError) {
    return `${error.message}（${error.path} · ${error.taskId}）`;
  }
  return error instanceof Error ? error.message : String(error);
}

function input(name: string, value = ''): HTMLInputElement {
  const element = document.createElement('input');
  element.name = name;
  element.type = 'text';
  element.value = value;
  return element;
}

function select<T extends string>(
  name: string,
  value: T,
  choices: Array<[T, string]>,
): HTMLSelectElement {
  const element = document.createElement('select');
  element.name = name;
  for (const [choice, label] of choices) {
    const option = document.createElement('option');
    option.value = choice;
    option.textContent = label;
    option.selected = choice === value;
    element.append(option);
  }
  return element;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement('label');
  const caption = document.createElement('span');
  caption.textContent = label;
  wrapper.append(caption, control);
  return wrapper;
}

export class TaskFormModal extends Modal {
  private mode: FormMode = { kind: 'create' };

  constructor(
    app: App,
    private readonly service: TaskFormServicePort,
    private readonly today: () => string,
  ) {
    super(app);
  }

  openCreate(): void {
    this.mode = { kind: 'create' };
    this.open();
  }

  openEdit(indexed: IndexedTask): void {
    this.mode = { kind: 'edit', indexed };
    this.open();
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.replaceChildren();
  }

  private render(): void {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('task-matrix-calendar', 'tmc-task-form-modal');
    const task = this.mode.kind === 'edit' ? this.mode.indexed.task : undefined;
    const heading = document.createElement('h2');
    heading.textContent = task ? '编辑任务' : '新建任务';
    const form = document.createElement('form');

    const title = input('title', task?.title ?? '');
    const details = document.createElement('textarea');
    details.name = 'details';
    details.rows = 6;
    details.value = task?.details ?? '';
    const status = select('status', task?.status ?? 'todo', STATUS_CHOICES);
    status.disabled = !task;
    const quadrant = select('quadrant', task?.quadrant ?? 'unclassified', QUADRANT_CHOICES);
    const plannedDate = this.dateInput('plannedDate', task?.plannedDate ?? (task ? '' : this.today()));
    const dueDate = this.dateInput('dueDate', task?.dueDate ?? '');
    const project = input('project', task?.project ?? '');
    const tags = input('tags', task?.tags.join(', ') ?? '');

    form.append(
      field('任务标题', title),
      field('详情', details),
      field('状态', status),
      field('四象限', quadrant),
      field('开始日期', plannedDate),
      field('截止日期', dueDate),
      field('项目', project),
      field('标签', tags),
    );

    const save = document.createElement('button');
    save.type = 'submit';
    save.dataset.action = 'save';
    save.textContent = '保存';
    form.append(save);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!save.disabled) void this.submit(form, save);
    });
    this.contentEl.append(heading, form);
  }

  private dateInput(name: 'plannedDate' | 'dueDate', value: string): HTMLInputElement {
    const element = input(name, value);
    element.inputMode = 'numeric';
    element.placeholder = 'YYYYMMDD 或 YYYY-MM-DD';
    element.addEventListener('blur', () => {
      this.clearErrors();
      try {
        element.value = normalizeDateInput(element.value) ?? '';
      } catch (error) {
        this.showError(formErrorMessage(error), name);
      }
    });
    return element;
  }

  private async submit(form: HTMLFormElement, save: HTMLButtonElement): Promise<void> {
    this.clearErrors();
    const values = new FormData(form);
    const title = String(values.get('title') ?? '').trim();
    if (!title) {
      this.showError('任务标题不能为空。', 'title');
      return;
    }

    let plannedDate: string | undefined;
    let dueDate: string | undefined;
    try {
      plannedDate = normalizeDateInput(String(values.get('plannedDate') ?? ''));
    } catch (error) {
      this.showError(formErrorMessage(error), 'plannedDate');
      return;
    }
    try {
      dueDate = normalizeDateInput(String(values.get('dueDate') ?? ''));
    } catch (error) {
      this.showError(formErrorMessage(error), 'dueDate');
      return;
    }

    const valuesToSave = {
      title,
      details: String(values.get('details') ?? ''),
      quadrant: String(values.get('quadrant')) as TaskQuadrant,
      plannedDate,
      dueDate,
      project: String(values.get('project') ?? ''),
      tags: String(values.get('tags') ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    save.disabled = true;
    try {
      if (this.mode.kind === 'create') {
        await this.service.create(valuesToSave);
      } else {
        await this.service.update(this.mode.indexed.task.id, {
          ...valuesToSave,
          status: String(values.get('status')) as TaskStatus,
        });
      }
      this.close();
    } catch (error) {
      this.showError(formErrorMessage(error));
    } finally {
      save.disabled = false;
    }
  }

  private clearErrors(): void {
    this.contentEl.querySelectorAll('[data-form-error]').forEach((element) => element.remove());
    this.contentEl.querySelectorAll('[aria-invalid]').forEach((element) => {
      element.removeAttribute('aria-invalid');
    });
  }

  private showError(message: string, fieldName?: string): void {
    const error = document.createElement('div');
    error.dataset.formError = '';
    error.textContent = message;
    if (fieldName) {
      const control = this.contentEl.querySelector<HTMLElement>(`[name="${fieldName}"]`);
      control?.setAttribute('aria-invalid', 'true');
      control?.parentElement?.append(error);
      return;
    }
    this.contentEl.querySelector('form')?.prepend(error);
  }
}
