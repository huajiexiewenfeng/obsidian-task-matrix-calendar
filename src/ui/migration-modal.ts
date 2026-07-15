import { Modal, Notice, type App } from 'obsidian';
import { normalizeDateInput } from '../domain/dates';
import { validateTaskDraft } from '../domain/rules';
import type {
  LegacyPriority,
  TaskNode,
  TaskQuadrant,
  TaskStatus,
} from '../domain/task';
import type { MigrationPlan, MigrationService } from '../services/migration-service';

export type MigrationModalServicePort = Pick<MigrationService, 'preview' | 'apply'>;

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

const PRIORITY_CHOICES: Array<[LegacyPriority | '', string]> = [
  ['', '无'],
  ['P0', 'P0'],
  ['P1', 'P1'],
  ['P2', 'P2'],
  ['P3', 'P3'],
  ['P4', 'P4'],
];

function copyTask(task: TaskNode): TaskNode {
  return {
    ...task,
    tags: [...task.tags],
    childrenIds: [...task.childrenIds],
  };
}

function textInput(name: string, value: string): HTMLInputElement {
  const element = document.createElement('input');
  element.type = 'text';
  element.name = name;
  element.dataset.field = name;
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
  element.dataset.field = name;
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

export class MigrationModal extends Modal {
  private plan?: MigrationPlan;
  private readonly selected = new Set<string>();
  private readonly corrections = new Map<string, TaskNode>();
  private pending = false;

  constructor(app: App, private readonly service: MigrationModalServicePort) {
    super(app);
  }

  async preview(): Promise<void> {
    this.plan = await this.service.preview();
    this.pending = false;
    this.selected.clear();
    this.corrections.clear();
    for (const candidates of this.plan.files.values()) {
      for (const candidate of candidates) {
        this.corrections.set(candidate.candidateId, copyTask(candidate.proposed));
        if (candidate.confidence === 'high') this.selected.add(candidate.candidateId);
      }
    }
    this.open();
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('task-matrix-calendar', 'tmc-migration-modal');
    if (!this.plan) return;

    const heading = document.createElement('h2');
    heading.textContent = '旧任务迁移预览';
    this.contentEl.append(heading);
    this.renderFailures();

    for (const [path, candidates] of this.plan.files) {
      const group = document.createElement('section');
      group.dataset.filePath = path;
      const title = document.createElement('h3');
      title.textContent = path;
      const selectFile = document.createElement('button');
      selectFile.type = 'button';
      selectFile.dataset.action = 'select-file';
      const allSelected = candidates.length > 0
        && candidates.every((candidate) => this.selected.has(candidate.candidateId));
      selectFile.disabled = this.pending;
      selectFile.textContent = allSelected ? '取消选择本文件全部候选' : '选择本文件全部候选';
      selectFile.addEventListener('click', () => {
        if (this.pending) {
          this.render();
          return;
        }
        for (const candidate of candidates) {
          if (allSelected) this.selected.delete(candidate.candidateId);
          else this.selected.add(candidate.candidateId);
        }
        this.render();
      });
      group.append(title, selectFile);
      for (const candidate of candidates) {
        group.append(this.renderCandidate(candidate.candidateId, candidate.originalText, candidate.confidence));
      }
      this.contentEl.append(group);
    }

    const status = document.createElement('div');
    status.dataset.migrationStatus = '';
    status.hidden = true;
    status.setAttribute('role', 'status');
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.dataset.action = 'confirm';
    confirm.textContent = '确认迁移所选任务';
    confirm.addEventListener('click', () => {
      if (!confirm.disabled) void this.confirm();
    });
    this.contentEl.append(status, confirm);
    this.updatePendingControls();
    if (this.pending) this.showStatus('正在导入旧任务…');
  }

  private renderFailures(): void {
    if (!this.plan || this.plan.failures.size === 0) return;
    const failures = document.createElement('section');
    failures.dataset.migrationFailures = '';
    const heading = document.createElement('h3');
    heading.textContent = '无法读取的文件';
    failures.append(heading);
    for (const [path, message] of this.plan.failures) {
      const failure = document.createElement('div');
      failure.textContent = `${path}：${message}`;
      failures.append(failure);
    }
    this.contentEl.append(failures);
  }

  private renderCandidate(
    candidateId: string,
    originalText: string,
    confidenceValue: string,
  ): HTMLElement {
    const corrected = this.corrections.get(candidateId)!;
    const row = document.createElement('div');
    row.className = 'tmc-migration-row';
    row.dataset.candidateId = candidateId;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.selectionId = candidateId;
    checkbox.checked = this.selected.has(candidateId);
    checkbox.disabled = this.pending;
    checkbox.setAttribute('aria-label', '选择迁移候选');
    checkbox.addEventListener('change', () => {
      if (this.pending) {
        this.render();
        return;
      }
      if (checkbox.checked) this.selected.add(candidateId);
      else this.selected.delete(candidateId);
      this.updateConfirm();
    });

    const original = document.createElement('pre');
    original.textContent = originalText;
    const confidence = document.createElement('span');
    confidence.dataset.confidence = confidenceValue;
    confidence.textContent = confidenceValue;

    const editor = document.createElement('div');
    editor.className = 'tmc-migration-editor';
    const title = textInput('title', corrected.title);
    this.bindCorrection(title, candidateId, (task, value) => ({ ...task, title: value }));
    const details = document.createElement('textarea');
    details.name = 'details';
    details.dataset.field = 'details';
    details.rows = 4;
    details.value = corrected.details ?? '';
    this.bindCorrection(details, candidateId, (task, value) => ({ ...task, details: value }));
    const status = select('status', corrected.status, STATUS_CHOICES);
    this.bindCorrection(status, candidateId, (task, value) => ({
      ...task,
      status: value as TaskStatus,
    }));
    const plannedDate = this.dateInput('plannedDate', corrected.plannedDate ?? '');
    this.bindCorrection(plannedDate, candidateId, (task, value) => ({
      ...task,
      plannedDate: value || undefined,
    }));
    const dueDate = this.dateInput('dueDate', corrected.dueDate ?? '');
    this.bindCorrection(dueDate, candidateId, (task, value) => ({
      ...task,
      dueDate: value || undefined,
    }));
    const quadrant = select('quadrant', corrected.quadrant, QUADRANT_CHOICES);
    this.bindCorrection(quadrant, candidateId, (task, value) => ({
      ...task,
      quadrant: value as TaskQuadrant,
    }));
    const legacyPriority = select(
      'legacyPriority',
      corrected.legacyPriority ?? '',
      PRIORITY_CHOICES,
    );
    this.bindCorrection(legacyPriority, candidateId, (task, value) => ({
      ...task,
      legacyPriority: value ? value as LegacyPriority : undefined,
    }));
    for (const control of [
      title,
      details,
      status,
      plannedDate,
      dueDate,
      quadrant,
      legacyPriority,
    ]) {
      control.disabled = this.pending;
    }
    editor.append(
      field('标题', title),
      field('详情', details),
      field('状态', status),
      field('开始日期', plannedDate),
      field('截止日期', dueDate),
      field('四象限', quadrant),
      field('旧优先级', legacyPriority),
    );
    row.append(checkbox, original, confidence, editor);
    return row;
  }

  private dateInput(name: 'plannedDate' | 'dueDate', value: string): HTMLInputElement {
    const element = textInput(name, value);
    element.inputMode = 'numeric';
    element.placeholder = 'YYYYMMDD 或 YYYY-MM-DD';
    return element;
  }

  private bindCorrection(
    control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    candidateId: string,
    update: (task: TaskNode, value: string) => TaskNode,
  ): void {
    const updateCorrection = () => {
      if (this.pending) {
        this.render();
        return;
      }
      const current = this.corrections.get(candidateId);
      if (current) this.corrections.set(candidateId, update(current, control.value));
    };
    control.addEventListener('input', updateCorrection);
    control.addEventListener('change', updateCorrection);
  }

  private async confirm(): Promise<void> {
    if (!this.plan || this.pending) return;
    this.clearErrors();
    if (!this.normalizeSelectedDates()) return;
    if (!this.validateSelectedDrafts()) return;

    const selectedCorrections = new Map<string, TaskNode>();
    for (const id of this.selected) {
      const corrected = this.corrections.get(id);
      if (corrected) selectedCorrections.set(id, corrected);
    }
    this.pending = true;
    this.updatePendingControls();
    this.showStatus('正在导入旧任务…');
    try {
      await this.service.apply(this.plan, selectedCorrections);
      this.showStatus(`已导入 ${selectedCorrections.size} 个旧任务。`);
      new Notice(`已导入 ${selectedCorrections.size} 个旧任务。`);
      this.close();
    } catch (error) {
      this.showError(error instanceof Error ? error.message : String(error));
    } finally {
      this.pending = false;
      this.updatePendingControls();
    }
  }

  private normalizeSelectedDates(): boolean {
    let valid = true;
    for (const id of this.selected) {
      const corrected = this.corrections.get(id);
      if (!corrected) continue;
      let plannedDate = corrected.plannedDate;
      let dueDate = corrected.dueDate;
      try {
        plannedDate = normalizeDateInput(plannedDate ?? '');
        this.updateDateControl(id, 'plannedDate', plannedDate);
      } catch (error) {
        valid = false;
        this.showCandidateError(id, 'plannedDate', error);
      }
      try {
        dueDate = normalizeDateInput(dueDate ?? '');
        this.updateDateControl(id, 'dueDate', dueDate);
      } catch (error) {
        valid = false;
        this.showCandidateError(id, 'dueDate', error);
      }
      this.corrections.set(id, { ...corrected, plannedDate, dueDate });
    }
    return valid;
  }

  private validateSelectedDrafts(): boolean {
    let valid = true;
    for (const id of this.selected) {
      const corrected = this.corrections.get(id);
      if (!corrected) continue;
      const error = validateTaskDraft(corrected);
      if (!error) continue;
      valid = false;
      this.showCandidateError(
        id,
        error.code === 'classification-required' ? 'quadrant' : 'title',
        error.message,
      );
    }
    return valid;
  }

  private updateDateControl(
    candidateId: string,
    name: 'plannedDate' | 'dueDate',
    value: string | undefined,
  ): void {
    const control = this.contentEl.querySelector<HTMLInputElement>(
      `[data-candidate-id="${candidateId}"] [name="${name}"]`,
    );
    if (control) control.value = value ?? '';
  }

  private showCandidateError(
    candidateId: string,
    name: 'title' | 'quadrant' | 'plannedDate' | 'dueDate',
    error: unknown,
  ): void {
    const row = this.contentEl.querySelector<HTMLElement>(`[data-candidate-id="${candidateId}"]`);
    const control = row?.querySelector<HTMLElement>(`[name="${name}"]`);
    control?.setAttribute('aria-invalid', 'true');
    const message = document.createElement('div');
    message.dataset.candidateError = '';
    message.textContent = error instanceof Error ? error.message : String(error);
    control?.parentElement?.append(message);
  }

  private clearErrors(): void {
    this.contentEl.querySelectorAll('[data-candidate-error], [data-migration-error]')
      .forEach((element) => element.remove());
    this.contentEl.querySelectorAll('[aria-invalid]')
      .forEach((element) => element.removeAttribute('aria-invalid'));
  }

  private showStatus(message: string): void {
    const status = this.contentEl.querySelector<HTMLElement>('[data-migration-status]');
    if (!status) return;
    status.hidden = !message;
    status.textContent = message;
  }

  private showError(message: string): void {
    this.showStatus('');
    const error = document.createElement('div');
    error.dataset.migrationError = '';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    this.contentEl.querySelector('[data-action="confirm"]')?.before(error);
  }

  private updateConfirm(): void {
    const confirm = this.contentEl.querySelector<HTMLButtonElement>('[data-action="confirm"]');
    if (confirm) confirm.disabled = this.pending || this.selected.size === 0;
  }

  private updatePendingControls(): void {
    this.contentEl.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(
      '[data-action="select-file"], [data-selection-id], '
      + '.tmc-migration-editor input, .tmc-migration-editor textarea, '
      + '.tmc-migration-editor select',
    ).forEach((control) => {
      control.disabled = this.pending;
    });
    this.updateConfirm();
  }
}
