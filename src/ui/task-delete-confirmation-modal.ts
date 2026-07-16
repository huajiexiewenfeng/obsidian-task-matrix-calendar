import { Modal, type App } from 'obsidian';

export interface TaskDeletePromptPort {
  confirm(taskTitle: string, action: () => Promise<void>): Promise<boolean>;
}

export class TaskDeleteConfirmationModal extends Modal implements TaskDeletePromptPort {
  private taskTitle = '';
  private action?: () => Promise<void>;
  private resolveResult?: (confirmed: boolean) => void;
  private pending = false;
  private settled = false;

  constructor(app: App) {
    super(app);
  }

  confirm(taskTitle: string, action: () => Promise<void>): Promise<boolean> {
    if (this.resolveResult) return Promise.resolve(false);
    this.taskTitle = taskTitle;
    this.action = action;
    this.pending = false;
    this.settled = false;
    const result = new Promise<boolean>((resolve) => {
      this.resolveResult = resolve;
    });
    this.open();
    return result;
  }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('task-matrix-calendar', 'tmc-delete-confirmation-modal');

    const heading = document.createElement('h2');
    heading.textContent = '删除任务';
    const message = document.createElement('p');
    message.textContent = `确认将“${this.taskTitle}”移入回收站吗？`;
    const warning = document.createElement('p');
    warning.textContent = '如果这是父任务，它的子任务会作为同一个任务块一并移入回收站。';
    const error = document.createElement('div');
    error.dataset.deleteError = '';
    error.setAttribute('role', 'alert');

    const actions = document.createElement('footer');
    actions.className = 'tmc-delete-confirmation-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.dataset.action = 'cancel-delete';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => {
      if (!this.pending) this.close();
    });
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.dataset.action = 'confirm-delete';
    confirm.classList.add('mod-warning');
    confirm.textContent = '移入回收站';
    confirm.addEventListener('click', () => {
      if (!this.pending) void this.submit(cancel, confirm, error);
    });
    actions.append(cancel, confirm);
    this.contentEl.append(heading, message, warning, error, actions);
  }

  onClose(): void {
    if (!this.settled) this.resolveResult?.(false);
    this.taskTitle = '';
    this.action = undefined;
    this.resolveResult = undefined;
    this.pending = false;
    this.settled = false;
    this.contentEl.replaceChildren();
  }

  private async submit(
    cancel: HTMLButtonElement,
    confirm: HTMLButtonElement,
    error: HTMLElement,
  ): Promise<void> {
    const action = this.action;
    if (!action || this.pending) return;
    this.pending = true;
    error.textContent = '';
    cancel.disabled = true;
    confirm.disabled = true;
    try {
      await action();
      if (!this.resolveResult) return;
      this.settled = true;
      this.resolveResult(true);
      this.resolveResult = undefined;
      this.close();
    } catch (caught) {
      if (!this.resolveResult) return;
      error.textContent = caught instanceof Error ? caught.message : String(caught);
      cancel.disabled = false;
      confirm.disabled = false;
    } finally {
      this.pending = false;
    }
  }
}

