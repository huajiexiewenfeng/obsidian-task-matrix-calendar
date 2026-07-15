import { Modal, Notice, type App } from 'obsidian';
import { normalizeDateInput } from '../domain/dates';
import { validateTaskDraft } from '../domain/rules';
import type { TaskNode } from '../domain/task';
import type {
  MigrationCandidate,
  MigrationPlan,
  MigrationService,
} from '../services/migration-service';
import { renderLegacyCandidateEditor } from './legacy-import-candidate-editor';

export type LegacyImportWizardServicePort = Pick<
  MigrationService,
  'listEligibleFiles' | 'preview' | 'apply'
>;

type WizardStep = 'select' | 'review' | 'confirm';

interface CandidateError {
  field: string;
  message: string;
}

function cloneTask(task: TaskNode): TaskNode {
  return {
    ...task,
    tags: [...task.tags],
    childrenIds: [...task.childrenIds],
  };
}

function backupTimestamp(value: string): string {
  return value.replace(/[:.]/g, '-');
}

function button(action: string, label: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.dataset.action = action;
  element.textContent = label;
  return element;
}

export class LegacyImportWizard extends Modal {
  private step: WizardStep = 'select';
  private files: string[] = [];
  private readonly selectedFiles = new Set<string>();
  private plan?: MigrationPlan;
  private readonly selectedCandidates = new Set<string>();
  private readonly corrections = new Map<string, TaskNode>();
  private pending = false;
  private loading = false;
  private errorMessage?: string;
  private readonly candidateErrors = new Map<string, CandidateError>();

  constructor(
    app: App,
    private readonly service: LegacyImportWizardServicePort,
    private readonly backupRoot: string,
  ) {
    super(app);
  }

  openWizard(): void {
    this.step = 'select';
    this.files = this.service.listEligibleFiles();
    this.selectedFiles.clear();
    this.selectedCandidates.clear();
    this.corrections.clear();
    this.plan = undefined;
    this.pending = false;
    this.loading = false;
    this.errorMessage = undefined;
    this.candidateErrors.clear();
    this.open();
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('task-matrix-calendar', 'tmc-import-wizard');
    this.contentEl.dataset.step = this.step;
    this.contentEl.append(this.renderProgress());
    if (this.step === 'select') this.renderSelectStep();
    else if (this.step === 'review') this.renderReviewStep();
    else this.renderConfirmStep();
  }

  private renderProgress(): HTMLElement {
    const progress = document.createElement('ol');
    progress.className = 'tmc-import-progress';
    const steps: Array<[WizardStep, string]> = [
      ['select', '1. 选择文件'],
      ['review', '2. 审阅候选'],
      ['confirm', '3. 确认写入'],
    ];
    for (const [step, label] of steps) {
      const item = document.createElement('li');
      item.textContent = label;
      if (step === this.step) item.dataset.current = 'true';
      progress.append(item);
    }
    return progress;
  }

  private renderSelectStep(): void {
    const heading = document.createElement('h2');
    heading.textContent = '选择要导入的 Markdown 文件';
    const description = document.createElement('p');
    description.textContent = '只会扫描你明确勾选的文件，此步不会改写原文。';
    this.contentEl.append(heading, description);

    const list = document.createElement('div');
    list.className = 'tmc-import-file-list';
    if (this.files.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tmc-import-warning';
      empty.textContent = '当前任务扫描目录内没有可选的 Markdown 文件。';
      list.append(empty);
    }
    for (const path of this.files) {
      const item = document.createElement('label');
      item.className = 'tmc-import-file';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.filePath = path;
      checkbox.checked = this.selectedFiles.has(path);
      checkbox.disabled = this.loading || this.pending;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.selectedFiles.add(path);
        else this.selectedFiles.delete(path);
        const next = this.contentEl.querySelector<HTMLButtonElement>('[data-action="continue"]');
        if (next) next.disabled = this.selectedFiles.size === 0 || this.loading;
      });
      const pathLabel = document.createElement('span');
      pathLabel.textContent = path;
      item.append(checkbox, pathLabel);
      list.append(item);
    }
    this.contentEl.append(list);
    this.renderMessage();

    const actions = this.createActions();
    const back = button('back', '返回');
    back.disabled = true;
    const cancel = button('cancel', '取消');
    cancel.disabled = this.loading || this.pending;
    cancel.addEventListener('click', () => this.close());
    const next = button('continue', this.loading ? '正在读取…' : '继续');
    next.classList.add('mod-cta');
    next.disabled = this.selectedFiles.size === 0 || this.loading || this.pending;
    next.addEventListener('click', () => void this.loadReview());
    actions.append(back, cancel, next);
    this.contentEl.append(actions);
  }

  private async loadReview(): Promise<void> {
    if (this.loading || this.pending || this.selectedFiles.size === 0) return;
    this.loading = true;
    this.errorMessage = undefined;
    this.render();
    try {
      const plan = await this.service.preview([...this.selectedFiles]);
      this.plan = plan;
      for (const candidates of plan.files.values()) {
        for (const candidate of candidates) {
          if (this.corrections.has(candidate.candidateId)) continue;
          this.corrections.set(candidate.candidateId, cloneTask(candidate.proposed));
          if (candidate.recognition.defaultSelected) {
            this.selectedCandidates.add(candidate.candidateId);
          }
        }
      }
      this.candidateErrors.clear();
      this.step = 'review';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private renderReviewStep(): void {
    const heading = document.createElement('h2');
    heading.textContent = '审阅并修正导入候选';
    const description = document.createElement('p');
    description.textContent = '复选框候选默认选中；普通列表需要你手动选中。';
    const review = document.createElement('div');
    review.className = 'tmc-import-review';
    this.contentEl.append(heading, description);

    this.renderFailures(review);
    for (const candidate of this.currentCandidates()) {
      const corrected = this.corrections.get(candidate.candidateId)
        ?? cloneTask(candidate.proposed);
      review.append(renderLegacyCandidateEditor({
        candidate,
        corrected,
        selected: this.selectedCandidates.has(candidate.candidateId),
        disabled: this.pending,
        error: this.candidateErrors.get(candidate.candidateId),
        onSelected: (selected) => {
          if (this.pending) return;
          if (selected) this.selectedCandidates.add(candidate.candidateId);
          else {
            this.selectedCandidates.delete(candidate.candidateId);
            this.candidateErrors.delete(candidate.candidateId);
          }
          this.updateReviewContinue();
        },
        onChanged: (task) => {
          if (this.pending) return;
          this.corrections.set(candidate.candidateId, cloneTask(task));
          this.clearCandidateError(candidate.candidateId);
        },
      }));
    }
    if (this.currentCandidates().length === 0 && this.plan?.failures.size === 0) {
      const empty = document.createElement('p');
      empty.className = 'tmc-import-warning';
      empty.textContent = '所选文件中没有发现旧任务候选。';
      review.append(empty);
    }
    this.contentEl.append(review);
    this.renderMessage();

    const actions = this.createActions();
    const back = button('back', '返回选择文件');
    back.disabled = this.pending;
    back.addEventListener('click', () => {
      this.step = 'select';
      this.errorMessage = undefined;
      this.render();
    });
    const cancel = button('cancel', '取消');
    cancel.disabled = this.pending;
    cancel.addEventListener('click', () => this.close());
    const next = button('continue', '继续');
    next.classList.add('mod-cta');
    next.disabled = this.currentSelectedCandidates().length === 0 || this.pending;
    next.addEventListener('click', () => {
      if (!this.validateSelected()) return;
      this.step = 'confirm';
      this.errorMessage = undefined;
      this.render();
    });
    actions.append(back, cancel, next);
    this.contentEl.append(actions);
  }

  private renderConfirmStep(): void {
    const heading = document.createElement('h2');
    heading.textContent = '最终确认';
    const selected = this.currentSelectedCandidates();
    const checkboxCount = selected.filter(
      (candidate) => candidate.recognition.kind === 'checkbox',
    ).length;
    const listCount = selected.filter(
      (candidate) => candidate.recognition.kind === 'list-item',
    ).length;
    const summary = document.createElement('section');
    summary.className = 'tmc-import-summary';
    const count = document.createElement('p');
    count.textContent = `将导入 ${selected.length} 个候选：复选框 ${checkboxCount} 个，手动选中普通列表 ${listCount} 个。`;
    summary.append(count);

    const byPath = new Map<string, number>();
    for (const candidate of selected) {
      byPath.set(candidate.sourcePath, (byPath.get(candidate.sourcePath) ?? 0) + 1);
    }
    const timestamp = backupTimestamp(this.plan?.createdAt ?? '');
    for (const [path, candidateCount] of byPath) {
      const file = document.createElement('div');
      file.dataset.filePath = path;
      const source = document.createElement('strong');
      source.textContent = `${path} · ${candidateCount} 个`;
      const backup = document.createElement('div');
      backup.textContent = `备份副本：${this.backupRoot}/${timestamp}/${path}`;
      file.append(source, backup);
      summary.append(file);
    }
    const warning = document.createElement('p');
    warning.className = 'tmc-import-warning';
    warning.textContent = '写入行为：先备份原文，再仅改写所选候选；未选候选保持不变。';
    summary.append(warning);
    this.contentEl.append(heading, summary);
    this.renderMessage();

    const actions = this.createActions();
    const back = button('back', '返回审阅');
    back.disabled = this.pending;
    back.addEventListener('click', () => {
      if (this.pending) return;
      this.step = 'review';
      this.errorMessage = undefined;
      this.render();
    });
    const cancel = button('cancel', '取消');
    cancel.disabled = this.pending;
    cancel.addEventListener('click', () => {
      if (!this.pending) this.close();
    });
    const confirm = button('confirm', this.pending ? '正在导入…' : '确认导入');
    confirm.classList.add('mod-cta');
    confirm.disabled = this.pending || selected.length === 0;
    confirm.addEventListener('click', () => void this.applySelected());
    actions.append(back, cancel, confirm);
    this.contentEl.append(actions);
  }

  private validateSelected(): boolean {
    this.candidateErrors.clear();
    this.errorMessage = undefined;
    const selected = this.currentSelectedCandidates();
    if (selected.length === 0) {
      this.errorMessage = '请至少选择一个候选。';
      this.render();
      return false;
    }

    for (const candidate of selected) {
      const current = this.corrections.get(candidate.candidateId)
        ?? cloneTask(candidate.proposed);
      const corrected = cloneTask(current);
      try {
        corrected.plannedDate = normalizeDateInput(corrected.plannedDate ?? '');
      } catch (error) {
        this.candidateErrors.set(candidate.candidateId, {
          field: 'plannedDate',
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      try {
        corrected.dueDate = normalizeDateInput(corrected.dueDate ?? '');
      } catch (error) {
        this.candidateErrors.set(candidate.candidateId, {
          field: 'dueDate',
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      this.corrections.set(candidate.candidateId, corrected);
      const error = validateTaskDraft(corrected);
      if (!error) continue;
      this.candidateErrors.set(candidate.candidateId, {
        field: error.code === 'classification-required' ? 'quadrant' : 'title',
        message: error.message,
      });
    }
    if (this.candidateErrors.size === 0) return true;
    this.errorMessage = '请先修正所选候选中的错误。';
    this.render();
    return false;
  }

  private async applySelected(): Promise<void> {
    if (!this.plan || this.pending) return;
    if (!this.validateSelected()) {
      this.step = 'review';
      this.render();
      return;
    }
    const selections = new Map<string, TaskNode>();
    for (const candidate of this.currentSelectedCandidates()) {
      const corrected = this.corrections.get(candidate.candidateId);
      if (corrected) selections.set(candidate.candidateId, cloneTask(corrected));
    }

    this.pending = true;
    this.errorMessage = undefined;
    this.updatePendingControls();
    this.showStatus('正在导入旧任务…');
    try {
      await this.service.apply(this.plan, selections);
      new Notice(`已导入 ${selections.size} 个旧任务。`);
      this.close();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.showStatus('');
      this.showError(this.errorMessage);
    } finally {
      this.pending = false;
      this.updatePendingControls();
    }
  }

  private currentCandidates(): MigrationCandidate[] {
    if (!this.plan) return [];
    return [...this.plan.files.values()].flat();
  }

  private currentSelectedCandidates(): MigrationCandidate[] {
    return this.currentCandidates().filter(
      (candidate) => this.selectedCandidates.has(candidate.candidateId),
    );
  }

  private renderFailures(host: HTMLElement): void {
    if (!this.plan || this.plan.failures.size === 0) return;
    const failures = document.createElement('section');
    failures.className = 'tmc-import-warning';
    failures.dataset.importFailures = '';
    const heading = document.createElement('h3');
    heading.textContent = '无法读取的文件';
    failures.append(heading);
    for (const [path, message] of this.plan.failures) {
      const failure = document.createElement('div');
      failure.textContent = `${path}：${message}`;
      failures.append(failure);
    }
    host.append(failures);
  }

  private createActions(): HTMLElement {
    const actions = document.createElement('footer');
    actions.className = 'tmc-import-actions';
    return actions;
  }

  private renderMessage(): void {
    const status = document.createElement('div');
    status.dataset.importStatus = '';
    status.setAttribute('role', 'status');
    status.hidden = true;
    this.contentEl.append(status);
    if (this.errorMessage) this.showError(this.errorMessage);
  }

  private showStatus(message: string): void {
    const status = this.contentEl.querySelector<HTMLElement>('[data-import-status]');
    if (!status) return;
    status.hidden = !message;
    status.textContent = message;
  }

  private showError(message: string): void {
    this.contentEl.querySelector('[data-import-error]')?.remove();
    const error = document.createElement('div');
    error.dataset.importError = '';
    error.className = 'tmc-import-warning';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    const actions = this.contentEl.querySelector('.tmc-import-actions');
    if (actions) actions.before(error);
    else this.contentEl.append(error);
  }

  private clearCandidateError(candidateId: string): void {
    this.candidateErrors.delete(candidateId);
    const row = this.contentEl.querySelector<HTMLElement>(
      `[data-candidate-id="${candidateId}"]`,
    );
    row?.querySelector('[data-candidate-error]')?.remove();
    row?.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid');
  }

  private updateReviewContinue(): void {
    const next = this.contentEl.querySelector<HTMLButtonElement>('[data-action="continue"]');
    if (next) next.disabled = this.pending || this.currentSelectedCandidates().length === 0;
  }

  private updatePendingControls(): void {
    this.contentEl.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('button, input, textarea, select').forEach((control) => {
      control.disabled = this.pending;
    });
  }
}
