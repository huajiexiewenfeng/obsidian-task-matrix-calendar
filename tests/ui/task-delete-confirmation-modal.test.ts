// @vitest-environment jsdom
import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TaskDeleteConfirmationModal } from '../../src/ui/task-delete-confirmation-modal';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('TaskDeleteConfirmationModal', () => {
  it('shows the task title and cancels without running the deletion', async () => {
    const modal = new TaskDeleteConfirmationModal({} as App);
    const action = vi.fn().mockResolvedValue(undefined);

    const result = modal.confirm('发布开源插件', action);

    expect(modal.contentEl.textContent).toContain('发布开源插件');
    expect(modal.contentEl.textContent).toContain('子任务');
    modal.contentEl.querySelector<HTMLButtonElement>('[data-action="cancel-delete"]')!.click();

    await expect(result).resolves.toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('locks both actions, submits once, and resolves true after success', async () => {
    const modal = new TaskDeleteConfirmationModal({} as App);
    const pending = deferred();
    const action = vi.fn(() => pending.promise);
    const result = modal.confirm('发布开源插件', action);
    const cancel = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="cancel-delete"]')!;
    const confirm = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')!;

    confirm.click();
    confirm.click();

    expect(action).toHaveBeenCalledTimes(1);
    expect(cancel.disabled).toBe(true);
    expect(confirm.disabled).toBe(true);
    pending.resolve();
    await expect(result).resolves.toBe(true);
  });

  it('reports a failed deletion, restores controls, and allows retry', async () => {
    const modal = new TaskDeleteConfirmationModal({} as App);
    const action = vi.fn()
      .mockRejectedValueOnce(new Error('回收站不可写'))
      .mockResolvedValueOnce(undefined);
    const result = modal.confirm('发布开源插件', action);
    const cancel = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="cancel-delete"]')!;
    const confirm = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')!;

    confirm.click();
    await vi.waitFor(() => {
      expect(modal.contentEl.querySelector('[data-delete-error]')?.textContent)
        .toContain('回收站不可写');
    });
    expect(cancel.disabled).toBe(false);
    expect(confirm.disabled).toBe(false);

    confirm.click();
    await expect(result).resolves.toBe(true);
    expect(action).toHaveBeenCalledTimes(2);
  });
});

