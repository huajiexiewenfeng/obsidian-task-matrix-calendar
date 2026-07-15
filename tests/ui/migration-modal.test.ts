// @vitest-environment jsdom
import { Notice, type App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTask, type TaskNode } from '../../src/domain/task';
import type { MigrationPlan } from '../../src/services/migration-service';
import {
  MigrationModal,
  type MigrationModalServicePort,
} from '../../src/ui/migration-modal';

const plan: MigrationPlan = {
  createdAt: '2026-07-15T00:00:00.000Z',
  failures: new Map([['任务/无法读取.md', '没有读取权限']]),
  files: new Map([
    ['任务/旧.md', [
      {
        candidateId: 'c-high',
        sourcePath: '任务/旧.md',
        startLine: 2,
        endLine: 2,
        originalText: '- [ ] 高置信旧任务 P1',
        proposed: makeTask({
          id: 'task-A1',
          title: '高置信旧任务',
          details: '原详情',
          status: 'todo',
          plannedDate: '2026-07-15',
          dueDate: '2026-07-20',
          quadrant: 'unclassified',
          legacyPriority: 'P1',
        }),
        confidence: 'high' as const,
      },
      {
        candidateId: 'c-medium',
        sourcePath: '任务/旧.md',
        startLine: 3,
        endLine: 3,
        originalText: '- 中置信旧任务',
        proposed: makeTask({ id: 'task-A2', title: '中置信旧任务' }),
        confidence: 'medium' as const,
      },
    ]],
    ['任务/更旧.md', [{
      candidateId: 'c-low',
      sourcePath: '任务/更旧.md',
      startLine: 5,
      endLine: 5,
      originalText: '低置信旧任务 P4',
      proposed: makeTask({ id: 'task-A3', title: '低置信旧任务', legacyPriority: 'P4' }),
      confidence: 'low' as const,
    }]],
  ]),
};

function service(overrides: Partial<MigrationModalServicePort> = {}): MigrationModalServicePort {
  return {
    preview: vi.fn().mockResolvedValue(plan),
    apply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function row(modal: MigrationModal, id: string): HTMLElement {
  return modal.contentEl.querySelector<HTMLElement>(`[data-candidate-id="${id}"]`)!;
}

function checkbox(modal: MigrationModal, id: string): HTMLInputElement {
  return row(modal, id).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
}

function field<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  modal: MigrationModal,
  id: string,
  name: string,
): T {
  return row(modal, id).querySelector<T>(`[name="${name}"]`)!;
}

function change(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function confirm(modal: MigrationModal): HTMLButtonElement {
  return modal.contentEl.querySelector<HTMLButtonElement>('[data-action="confirm"]')!;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.replaceChildren();
  (Notice as unknown as { messages: string[] }).messages.length = 0;
});

describe('MigrationModal', () => {
  it('discovers automatically, defaults only high-confidence rows, toggles files and renders failures', async () => {
    const migrationService = service();
    const modal = new MigrationModal({} as App, migrationService);

    await modal.preview();

    expect(migrationService.preview).toHaveBeenCalledWith();
    expect(checkbox(modal, 'c-high').checked).toBe(true);
    expect(checkbox(modal, 'c-medium').checked).toBe(false);
    expect(checkbox(modal, 'c-low').checked).toBe(false);
    expect(confirm(modal).disabled).toBe(false);
    expect(row(modal, 'c-high').textContent).toContain('- [ ] 高置信旧任务 P1');
    expect(modal.contentEl.textContent).toContain('任务/无法读取.md');
    expect(modal.contentEl.textContent).toContain('没有读取权限');

    const fileToggle = modal.contentEl.querySelector<HTMLButtonElement>(
      '[data-file-path="任务/旧.md"] [data-action="select-file"]',
    )!;
    fileToggle.click();
    expect(checkbox(modal, 'c-high').checked).toBe(true);
    expect(checkbox(modal, 'c-medium').checked).toBe(true);
    modal.contentEl.querySelector<HTMLButtonElement>(
      '[data-file-path="任务/旧.md"] [data-action="select-file"]',
    )!.click();
    expect(checkbox(modal, 'c-high').checked).toBe(false);
    expect(checkbox(modal, 'c-medium').checked).toBe(false);
  });

  it('renders every proposed field as an editable correction without mutating the plan', async () => {
    const migrationService = service();
    const modal = new MigrationModal({} as App, migrationService);
    const original = structuredClone(plan.files.get('任务/旧.md')![0].proposed);

    await modal.preview();

    expect(field(modal, 'c-high', 'title').value).toBe('高置信旧任务');
    expect(field<HTMLTextAreaElement>(modal, 'c-high', 'details').value).toBe('原详情');
    expect(field(modal, 'c-high', 'status').value).toBe('todo');
    expect(field(modal, 'c-high', 'plannedDate').value).toBe('2026-07-15');
    expect(field(modal, 'c-high', 'dueDate').value).toBe('2026-07-20');
    expect(field(modal, 'c-high', 'quadrant').value).toBe('unclassified');
    expect(field(modal, 'c-high', 'legacyPriority').value).toBe('P1');

    field(modal, 'c-high', 'title').value = '修正标题';
    change(field(modal, 'c-high', 'title'));
    field<HTMLTextAreaElement>(modal, 'c-high', 'details').value = '第一行\n第二行';
    change(field(modal, 'c-high', 'details'));
    field(modal, 'c-high', 'status').value = 'in-progress';
    change(field(modal, 'c-high', 'status'));
    field(modal, 'c-high', 'plannedDate').value = '20260716';
    change(field(modal, 'c-high', 'plannedDate'));
    field(modal, 'c-high', 'dueDate').value = '2026-07-31';
    change(field(modal, 'c-high', 'dueDate'));
    field(modal, 'c-high', 'quadrant').value = 'important-not-urgent';
    change(field(modal, 'c-high', 'quadrant'));
    field(modal, 'c-high', 'legacyPriority').value = 'P2';
    change(field(modal, 'c-high', 'legacyPriority'));
    confirm(modal).click();
    await flushPromises();

    expect(migrationService.apply).toHaveBeenCalledWith(plan, new Map([
      ['c-high', expect.objectContaining({
        title: '修正标题',
        details: '第一行\n第二行',
        status: 'in-progress',
        plannedDate: '2026-07-16',
        dueDate: '2026-07-31',
        quadrant: 'important-not-urgent',
        legacyPriority: 'P2',
      }) as TaskNode],
    ]));
    expect(plan.files.get('任务/旧.md')![0].proposed).toEqual(original);
    expect((Notice as unknown as { messages: string[] }).messages)
      .toEqual(['已导入 1 个旧任务。']);
    expect(modal.contentEl.isConnected).toBe(false);
  });

  it('submits exactly the selected corrected candidates', async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    const modal = new MigrationModal({} as App, service({ apply }));
    await modal.preview();
    checkbox(modal, 'c-high').click();
    checkbox(modal, 'c-medium').click();
    field(modal, 'c-medium', 'title').value = '只导入这个';
    change(field(modal, 'c-medium', 'title'));

    confirm(modal).click();
    await flushPromises();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(plan, new Map([
      ['c-medium', expect.objectContaining({ title: '只导入这个' }) as TaskNode],
    ]));
  });

  it('marks invalid selected dates inline and does not apply', async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    const modal = new MigrationModal({} as App, service({ apply }));
    await modal.preview();
    field(modal, 'c-high', 'dueDate').value = '20260230';
    change(field(modal, 'c-high', 'dueDate'));

    confirm(modal).click();

    expect(apply).not.toHaveBeenCalled();
    expect(field(modal, 'c-high', 'dueDate').getAttribute('aria-invalid')).toBe('true');
    expect(row(modal, 'c-high').querySelector('[data-candidate-error]')?.textContent)
      .toContain('有效日期');
    expect(modal.contentEl.isConnected).toBe(true);
  });

  it('locks selection, file toggles, editors and submit while apply is pending', async () => {
    let resolveApply!: () => void;
    const apply = vi.fn().mockReturnValue(new Promise<void>((resolve) => {
      resolveApply = resolve;
    }));
    const modal = new MigrationModal({} as App, service({ apply }));
    await modal.preview();

    const confirmButton = confirm(modal);
    const candidateToggle = checkbox(modal, 'c-high');
    const fileToggle = modal.contentEl.querySelector<HTMLButtonElement>(
      '[data-file-path="任务/旧.md"] [data-action="select-file"]',
    )!;
    const title = field(modal, 'c-high', 'title');
    confirmButton.click();

    expect(confirmButton.disabled).toBe(true);
    expect(candidateToggle.disabled).toBe(true);
    expect(fileToggle.disabled).toBe(true);
    expect(title.disabled).toBe(true);
    expect(modal.contentEl.querySelector('[data-migration-status]')?.textContent).toContain('正在导入');

    candidateToggle.click();
    fileToggle.click();
    title.value = '待处理期间不应改变';
    change(title);
    confirmButton.click();

    expect(checkbox(modal, 'c-high').checked).toBe(true);
    expect(checkbox(modal, 'c-medium').checked).toBe(false);
    expect(field(modal, 'c-high', 'title').value).toBe('高置信旧任务');
    expect(modal.contentEl.querySelector('[data-migration-status]')?.textContent)
      .toContain('正在导入');
    expect(confirm(modal).disabled).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    resolveApply();
    await flushPromises();
    expect((Notice as unknown as { messages: string[] }).messages)
      .toEqual(['已导入 1 个旧任务。']);
    expect(modal.contentEl.isConnected).toBe(false);
  });

  it('shows apply errors and restores the confirmation action', async () => {
    const apply = vi.fn().mockRejectedValue(new Error('写入复核失败'));
    const modal = new MigrationModal({} as App, service({ apply }));
    await modal.preview();

    confirm(modal).click();
    await flushPromises();

    expect(modal.contentEl.querySelector('[data-migration-error]')?.textContent)
      .toContain('写入复核失败');
    expect(modal.contentEl.isConnected).toBe(true);
    expect(confirm(modal).disabled).toBe(false);
    expect(checkbox(modal, 'c-high').disabled).toBe(false);
    expect(field(modal, 'c-high', 'title').disabled).toBe(false);
  });
});
