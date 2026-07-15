// @vitest-environment jsdom
import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../src/domain/task';
import { MigrationModal } from '../../src/ui/migration-modal';
import type { MigrationPlan } from '../../src/services/migration-service';

const plan: MigrationPlan = {
  createdAt: '2026-07-15T00:00:00.000Z',
  failures: new Map(),
  files: new Map([['任务/旧.md', [{
    candidateId: 'c1', sourcePath: '任务/旧.md', startLine: 2, endLine: 2,
    originalText: '- 旧任务 P1', proposed: makeTask({ id: 'task-A1', title: '旧任务', legacyPriority: 'P1' }),
    confidence: 'medium' as const,
  }]]]),
};

describe('MigrationModal', () => {
  it('previews without writing and confirms exactly selected candidates', async () => {
    const service = { preview: vi.fn().mockResolvedValue(plan), apply: vi.fn().mockResolvedValue(undefined) };
    const modal = new MigrationModal({} as App, service);

    await modal.preview(['任务/旧.md']);

    expect(service.apply).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain('- 旧任务 P1');
    expect(modal.contentEl.textContent).toContain('旧任务');
    expect(modal.contentEl.textContent).toContain('medium');
    expect(modal.contentEl.querySelector('[data-action="select-file"]')).not.toBeNull();
    expect(modal.contentEl.querySelector('[data-correction]')).not.toBeNull();
    const confirm = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="confirm"]')!;
    expect(confirm.disabled).toBe(true);
    modal.contentEl.querySelector<HTMLInputElement>('[data-candidate-id="c1"]')!.click();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await Promise.resolve();
    expect(service.apply).toHaveBeenCalledWith(plan, new Set(['c1']));
  });
});
