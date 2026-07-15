import { Modal, type App } from 'obsidian';
import type { MigrationPlan, MigrationService } from '../services/migration-service';

export type MigrationModalServicePort = Pick<MigrationService, 'preview' | 'apply'>;

export class MigrationModal extends Modal {
  private plan?: MigrationPlan;
  private readonly selected = new Set<string>();

  constructor(app: App, private readonly service: MigrationModalServicePort) {
    super(app);
  }

  async preview(paths: string[]): Promise<void> {
    this.plan = await this.service.preview(paths);
    this.selected.clear();
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
    for (const [path, candidates] of this.plan.files) {
      const group = document.createElement('section');
      const title = document.createElement('h3');
      title.textContent = path;
      const selectFile = document.createElement('button');
      selectFile.type = 'button';
      selectFile.dataset.action = 'select-file';
      selectFile.textContent = '选择本文件全部候选';
      selectFile.addEventListener('click', () => {
        for (const candidate of candidates) this.selected.add(candidate.candidateId);
        this.render();
      });
      group.append(title, selectFile);
      for (const candidate of candidates) {
        const row = document.createElement('div');
        row.className = 'tmc-migration-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.candidateId = candidate.candidateId;
        checkbox.checked = this.selected.has(candidate.candidateId);
        checkbox.addEventListener('click', () => {
          if (checkbox.checked) this.selected.add(candidate.candidateId);
          else this.selected.delete(candidate.candidateId);
          this.updateConfirm();
        });
        const original = document.createElement('pre');
        original.textContent = candidate.originalText;
        const proposed = document.createElement('pre');
        proposed.textContent = `${candidate.proposed.title}\n${candidate.proposed.plannedDate ?? ''}`;
        const confidence = document.createElement('span');
        confidence.textContent = candidate.confidence;
        const correction = document.createElement('input');
        correction.dataset.correction = candidate.candidateId;
        correction.value = candidate.proposed.title;
        correction.setAttribute('aria-label', '修正迁移标题');
        row.append(checkbox, original, proposed, confidence, correction);
        group.append(row);
      }
      this.contentEl.append(group);
    }
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.dataset.action = 'confirm';
    confirm.textContent = '确认迁移所选任务';
    confirm.addEventListener('click', () => {
      if (this.plan && this.selected.size > 0) void this.service.apply(this.plan, new Set(this.selected));
    });
    this.contentEl.append(confirm);
    this.updateConfirm();
  }

  private updateConfirm(): void {
    const confirm = this.contentEl.querySelector<HTMLButtonElement>('[data-action="confirm"]');
    if (confirm) confirm.disabled = this.selected.size === 0;
  }
}
