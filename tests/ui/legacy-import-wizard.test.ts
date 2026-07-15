// @vitest-environment jsdom
import { Notice, type App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../src/domain/task';
import type { MigrationPlan } from '../../src/services/migration-service';
import {
  LegacyImportWizard,
  type LegacyImportWizardServicePort,
} from '../../src/ui/legacy-import-wizard';

const sourcePath = '任务/旧.md';
const otherPath = '任务/另一个.md';

const plan: MigrationPlan = {
  createdAt: '2026-07-15T00:00:00.000Z',
  failures: new Map(),
  files: new Map([[sourcePath, [
    {
      candidateId: 'checkbox',
      sourcePath,
      startLine: 4,
      endLine: 4,
      originalText: '- [ ] 自动候选',
      recognition: {
        kind: 'checkbox',
        reason: 'Markdown 复选框',
        defaultSelected: true,
      },
      proposed: makeTask({
        id: 'task-A1',
        title: '自动候选',
        plannedDate: '2026-07-15',
      }),
    },
    {
      candidateId: 'list',
      sourcePath,
      startLine: 5,
      endLine: 5,
      originalText: '- 手动候选',
      recognition: {
        kind: 'list-item',
        reason: '普通列表，仅作为候选',
        defaultSelected: false,
      },
      proposed: makeTask({
        id: 'task-A2',
        title: '手动候选',
        plannedDate: '2026-07-15',
      }),
    },
  ]]]),
};

function service(
  overrides: Partial<LegacyImportWizardServicePort> = {},
): LegacyImportWizardServicePort {
  return {
    listEligibleFiles: vi.fn(() => [sourcePath, otherPath]),
    preview: vi.fn().mockResolvedValue(plan),
    apply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fileSelection(wizard: LegacyImportWizard, path = sourcePath): HTMLInputElement {
  return wizard.contentEl.querySelector<HTMLInputElement>(
    `input[data-file-path="${path}"]`,
  )!;
}

function row(wizard: LegacyImportWizard, id: string): HTMLElement {
  return wizard.contentEl.querySelector<HTMLElement>(`[data-candidate-id="${id}"]`)!;
}

function candidateSelection(wizard: LegacyImportWizard, id: string): HTMLInputElement {
  return row(wizard, id).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
}

function field<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  wizard: LegacyImportWizard,
  id: string,
  name: string,
): T {
  return row(wizard, id).querySelector<T>(`[name="${name}"]`)!;
}

function action(wizard: LegacyImportWizard, name: string): HTMLButtonElement {
  return wizard.contentEl.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
}

function change(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value?: string,
): void {
  if (value !== undefined) element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function openReview(
  wizard: LegacyImportWizard,
): Promise<void> {
  wizard.openWizard();
  fileSelection(wizard).click();
  action(wizard, 'continue').click();
  await flushPromises();
  expect(wizard.contentEl.dataset.step).toBe('review');
}

async function openConfirm(wizard: LegacyImportWizard): Promise<void> {
  await openReview(wizard);
  action(wizard, 'continue').click();
  expect(wizard.contentEl.dataset.step).toBe('confirm');
}

afterEach(() => {
  document.body.replaceChildren();
  (Notice as unknown as { messages: string[] }).messages.length = 0;
});

describe('LegacyImportWizard', () => {
  it('opens on explicit file selection and keeps Continue disabled until a file is checked', () => {
    const wizard = new LegacyImportWizard({} as App, service(), '备份/旧任务导入');

    wizard.openWizard();

    expect(wizard.contentEl.dataset.step).toBe('select');
    expect(wizard.contentEl.textContent).toContain(sourcePath);
    expect(wizard.contentEl.textContent).toContain(otherPath);
    expect(action(wizard, 'continue').disabled).toBe(true);
    fileSelection(wizard).click();
    expect(action(wizard, 'continue').disabled).toBe(false);
  });

  it('previews exactly the checked files before opening review', async () => {
    const migrationService = service();
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    wizard.openWizard();
    fileSelection(wizard).click();

    action(wizard, 'continue').click();
    await flushPromises();

    expect(migrationService.preview).toHaveBeenCalledTimes(1);
    expect(migrationService.preview).toHaveBeenCalledWith([sourcePath]);
    expect(wizard.contentEl.dataset.step).toBe('review');
  });

  it('defaults checkbox candidates on and ordinary list candidates off', async () => {
    const wizard = new LegacyImportWizard({} as App, service(), '备份/旧任务导入');

    await openReview(wizard);

    expect(candidateSelection(wizard, 'checkbox').checked).toBe(true);
    expect(candidateSelection(wizard, 'list').checked).toBe(false);
  });

  it('shows source path, one-based line, exact source, reason, and proposed fields for every row', async () => {
    const wizard = new LegacyImportWizard({} as App, service(), '备份/旧任务导入');

    await openReview(wizard);

    expect(row(wizard, 'checkbox').textContent).toContain(sourcePath);
    expect(row(wizard, 'checkbox').textContent).toContain('第 5 行');
    expect(row(wizard, 'checkbox').textContent).toContain('- [ ] 自动候选');
    expect(row(wizard, 'checkbox').textContent).toContain('Markdown 复选框');
    expect(field(wizard, 'checkbox', 'title').value).toBe('自动候选');
    expect(row(wizard, 'list').textContent).toContain(sourcePath);
    expect(row(wizard, 'list').textContent).toContain('第 6 行');
    expect(row(wizard, 'list').textContent).toContain('- 手动候选');
    expect(row(wizard, 'list').textContent).toContain('普通列表，仅作为候选');
  });

  it('preserves all corrections and candidate selection after returning to unchanged files', async () => {
    const migrationService = service();
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    await openReview(wizard);

    change(field(wizard, 'checkbox', 'title'), '修正标题');
    change(field(wizard, 'checkbox', 'details'), '修正详情');
    change(field(wizard, 'checkbox', 'status'), 'in-progress');
    change(field(wizard, 'checkbox', 'plannedDate'), '20260716');
    change(field(wizard, 'checkbox', 'dueDate'), '2026-07-20');
    change(field(wizard, 'checkbox', 'quadrant'), 'important-urgent');
    change(field(wizard, 'checkbox', 'project'), '迁移项目');
    change(field(wizard, 'checkbox', 'tags'), '旧任务, 待复核');
    candidateSelection(wizard, 'checkbox').click();

    action(wizard, 'back').click();
    expect(wizard.contentEl.dataset.step).toBe('select');
    expect(fileSelection(wizard).checked).toBe(true);
    action(wizard, 'continue').click();
    await flushPromises();

    expect(migrationService.preview).toHaveBeenCalledTimes(2);
    expect(candidateSelection(wizard, 'checkbox').checked).toBe(false);
    expect(field(wizard, 'checkbox', 'title').value).toBe('修正标题');
    expect(field(wizard, 'checkbox', 'details').value).toBe('修正详情');
    expect(field(wizard, 'checkbox', 'status').value).toBe('in-progress');
    expect(field(wizard, 'checkbox', 'plannedDate').value).toBe('20260716');
    expect(field(wizard, 'checkbox', 'dueDate').value).toBe('2026-07-20');
    expect(field(wizard, 'checkbox', 'quadrant').value).toBe('important-urgent');
    expect(field(wizard, 'checkbox', 'project').value).toBe('迁移项目');
    expect(field(wizard, 'checkbox', 'tags').value).toBe('旧任务, 待复核');
  });

  it('does not leave review while a selected draft is invalid', async () => {
    const wizard = new LegacyImportWizard({} as App, service(), '备份/旧任务导入');
    await openReview(wizard);
    change(field(wizard, 'checkbox', 'title'), '   ');

    action(wizard, 'continue').click();

    expect(wizard.contentEl.dataset.step).toBe('review');
    expect(field(wizard, 'checkbox', 'title').getAttribute('aria-invalid')).toBe('true');
    expect(row(wizard, 'checkbox').textContent).toContain('任务标题不能为空。');
  });

  it('summarizes files, candidate kinds, backup copies, and write behavior before applying', async () => {
    const migrationService = service();
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    await openReview(wizard);
    candidateSelection(wizard, 'list').click();

    action(wizard, 'continue').click();

    expect(wizard.contentEl.dataset.step).toBe('confirm');
    expect(wizard.contentEl.textContent).toContain(sourcePath);
    expect(wizard.contentEl.textContent).toContain('将导入 2 个候选');
    expect(wizard.contentEl.textContent).toContain('复选框 1 个');
    expect(wizard.contentEl.textContent).toContain('手动选中普通列表 1 个');
    expect(wizard.contentEl.textContent).toContain(
      '备份/旧任务导入/2026-07-15T00-00-00-000Z/任务/旧.md',
    );
    expect(wizard.contentEl.textContent).toContain('先备份原文，再仅改写所选候选');
    expect(migrationService.apply).not.toHaveBeenCalled();
  });

  it('calls apply only from final confirmation with normalized corrected selections', async () => {
    const migrationService = service();
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    await openReview(wizard);
    change(field(wizard, 'checkbox', 'title'), '修正后候选');
    change(field(wizard, 'checkbox', 'plannedDate'), '20260716');
    action(wizard, 'continue').click();
    expect(migrationService.apply).not.toHaveBeenCalled();

    action(wizard, 'confirm').click();
    await flushPromises();

    expect(migrationService.apply).toHaveBeenCalledTimes(1);
    const [appliedPlan, selections] = vi.mocked(migrationService.apply).mock.calls[0];
    expect(appliedPlan).toBe(plan);
    expect(selections.get('checkbox')).toMatchObject({
      title: '修正后候选',
      plannedDate: '2026-07-16',
    });
    expect((Notice as unknown as { messages: string[] }).messages).toContain(
      '已导入 1 个旧任务。',
    );
    expect(document.body.contains(wizard.contentEl)).toBe(false);
  });

  it('cancels from every step without applying', async () => {
    for (const targetStep of ['select', 'review', 'confirm'] as const) {
      const migrationService = service();
      const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
      if (targetStep === 'select') wizard.openWizard();
      else if (targetStep === 'review') await openReview(wizard);
      else await openConfirm(wizard);

      action(wizard, 'cancel').click();

      expect(migrationService.apply).not.toHaveBeenCalled();
      expect(document.body.contains(wizard.contentEl)).toBe(false);
    }
  });

  it('locks every visible control and applies once while final confirmation is pending', async () => {
    let resolveApply!: () => void;
    const applyPromise = new Promise<void>((resolve) => {
      resolveApply = resolve;
    });
    const migrationService = service({ apply: vi.fn(() => applyPromise) });
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    await openConfirm(wizard);
    const finalConfirm = action(wizard, 'confirm');

    finalConfirm.click();
    finalConfirm.click();

    expect(migrationService.apply).toHaveBeenCalledTimes(1);
    expect(
      Array.from(wizard.contentEl.querySelectorAll<
        HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >('button, input, textarea, select')).every((control) => control.disabled),
    ).toBe(true);
    expect(action(wizard, 'back').disabled).toBe(true);
    expect(action(wizard, 'cancel').disabled).toBe(true);
    expect(finalConfirm.disabled).toBe(true);

    resolveApply();
    await flushPromises();
  });

  it('keeps the wizard open, reports apply errors, and restores controls', async () => {
    const migrationService = service({
      apply: vi.fn().mockRejectedValue(new Error('备份目录不可写')),
    });
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    await openConfirm(wizard);

    action(wizard, 'confirm').click();
    await flushPromises();

    expect(document.body.contains(wizard.contentEl)).toBe(true);
    expect(wizard.contentEl.textContent).toContain('备份目录不可写');
    expect(
      wizard.contentEl.querySelector<HTMLElement>('[data-import-status]')?.hidden,
    ).toBe(true);
    expect(action(wizard, 'confirm').disabled).toBe(false);
    expect(action(wizard, 'back').disabled).toBe(false);
    expect(action(wizard, 'cancel').disabled).toBe(false);
  });
});
