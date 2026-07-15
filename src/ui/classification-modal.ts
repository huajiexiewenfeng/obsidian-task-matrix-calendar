import { Modal, type App } from 'obsidian';
import type { TaskQuadrant } from '../domain/task';
import type { ClassificationPromptPort } from '../services/external-checkbox-coordinator';

const CHOICES: Array<{ value: Exclude<TaskQuadrant, 'unclassified'>; label: string }> = [
  { value: 'important-urgent', label: '重要且紧急' },
  { value: 'important-not-urgent', label: '重要不紧急' },
  { value: 'not-important-urgent', label: '不重要但紧急' },
  { value: 'not-important-not-urgent', label: '不重要不紧急' },
];

export class ClassificationModal extends Modal implements ClassificationPromptPort {
  private resolveChoice?: (value: Exclude<TaskQuadrant, 'unclassified'> | null) => void;
  private settled = false;

  constructor(app: App) {
    super(app);
  }

  chooseQuadrant(taskId: string): Promise<Exclude<TaskQuadrant, 'unclassified'> | null> {
    void taskId;
    if (this.resolveChoice) this.resolveChoice(null);
    this.settled = false;
    const result = new Promise<Exclude<TaskQuadrant, 'unclassified'> | null>((resolve) => {
      this.resolveChoice = resolve;
    });
    this.open();
    return result;
  }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('task-matrix-calendar', 'tmc-classification-modal');
    const title = document.createElement('h2');
    title.textContent = '执行前请选择任务分类';
    this.contentEl.append(title);
    for (const choice of CHOICES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.quadrant = choice.value;
      button.textContent = choice.label;
      button.addEventListener('click', () => {
        this.settled = true;
        this.resolveChoice?.(choice.value);
        this.resolveChoice = undefined;
        this.close();
      });
      this.contentEl.append(button);
    }
  }

  onClose(): void {
    if (!this.settled) this.resolveChoice?.(null);
    this.resolveChoice = undefined;
    this.contentEl.replaceChildren();
  }
}
