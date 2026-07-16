// @vitest-environment jsdom
import { Notice, type App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../src/domain/task';
import {
  MigrationError,
  type MigrationPlan,
} from '../../src/services/migration-service';
import {
  LegacyImportWizard,
  type LegacyImportWizardServicePort,
} from '../../src/ui/legacy-import-wizard';

const sourcePath = '任务/旧.md';
const otherPath = '任务/另一个.md';
const failedPath = '任务/无法读取.md';

const plan: MigrationPlan = {
  createdAt: '2026-07-15T00:00:00.000Z',
  failures: new Map(),
  sourceSnapshots: new Map(),
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

function reviewFileGroup(wizard: LegacyImportWizard, path: string): HTMLElement {
  return Array.from(
    wizard.contentEl.querySelectorAll<HTMLElement>('[data-import-file-group]'),
  ).find((group) => group.dataset.filePath === path)!;
}

function confirmFile(wizard: LegacyImportWizard, path: string): HTMLElement {
  return Array.from(
    wizard.contentEl.querySelectorAll<HTMLElement>('[data-confirm-file]'),
  ).find((file) => file.dataset.filePath === path)!;
}

function field<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  wizard: LegacyImportWizard,
  id: string,
  name: string,
): T {
  return wizard.contentEl.querySelector<T>(
    `[data-active-candidate="${id}"] [name="${name}"]`,
  )!;
}

function activateCandidate(wizard: LegacyImportWizard, id: string): void {
  row(wizard, id).click();
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

  it('shows an empty state when configured scan roots contain no eligible files', () => {
    const wizard = new LegacyImportWizard(
      {} as App,
      service({ listEligibleFiles: vi.fn(() => []) }),
      '备份/旧任务导入',
    );

    wizard.openWizard();

    expect(wizard.contentEl.textContent).toContain('当前任务扫描目录内没有可选的 Markdown 文件。');
    expect(wizard.contentEl.querySelector('[data-file-path]')).toBeNull();
    expect(action(wizard, 'continue').disabled).toBe(true);
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

  it('uses a fixed candidate list and one active editor while preserving corrections', async () => {
    const wizard = new LegacyImportWizard({} as App, service(), '备份/旧任务导入');

    await openReview(wizard);

    expect(wizard.contentEl.querySelector('.tmc-import-review-workspace')).not.toBeNull();
    expect(wizard.contentEl.querySelector('.tmc-import-candidate-list')).not.toBeNull();
    expect(wizard.contentEl.querySelectorAll('.tmc-import-editor-panel')).toHaveLength(1);
    expect(wizard.contentEl.querySelector('[data-active-candidate="checkbox"]')).not.toBeNull();
    change(field(wizard, 'checkbox', 'title'), '修正后的自动候选');

    activateCandidate(wizard, 'list');
    expect(wizard.contentEl.querySelectorAll('.tmc-import-editor-panel')).toHaveLength(1);
    expect(wizard.contentEl.querySelector('[data-active-candidate="list"]')).not.toBeNull();
    change(field(wizard, 'list', 'title'), '修正后的普通列表');

    activateCandidate(wizard, 'checkbox');
    expect(field(wizard, 'checkbox', 'title').value).toBe('修正后的自动候选');
    activateCandidate(wizard, 'list');
    expect(field(wizard, 'list', 'title').value).toBe('修正后的普通列表');
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

  it('groups every previewed file with a live selection count and activates one editor', async () => {
    const otherCandidate = {
      ...plan.files.get(sourcePath)![1],
      candidateId: 'other-list',
      sourcePath: otherPath,
      proposed: makeTask({
        id: 'task-B1',
        title: '另一个候选',
        plannedDate: '2026-07-16',
      }),
    };
    const groupedPlan: MigrationPlan = {
      ...plan,
      files: new Map([
        [sourcePath, plan.files.get(sourcePath)!],
        [otherPath, [otherCandidate]],
      ]),
    };
    const wizard = new LegacyImportWizard(
      {} as App,
      service({ preview: vi.fn().mockResolvedValue(groupedPlan) }),
      '备份/旧任务导入',
    );
    wizard.openWizard();
    fileSelection(wizard, sourcePath).click();
    fileSelection(wizard, otherPath).click();
    action(wizard, 'continue').click();
    await flushPromises();

    expect(reviewFileGroup(wizard, sourcePath).textContent).toContain(`${sourcePath} · 1 / 2`);
    expect(reviewFileGroup(wizard, otherPath).textContent).toContain(`${otherPath} · 0 / 1`);
    const listItem = row(wizard, 'other-list');
    expect(listItem.textContent).toContain('另一个候选');
    expect(listItem.textContent).toContain('第 6 行');
    expect(listItem.textContent).toContain('- 手动候选');
    expect(listItem.textContent).toContain('普通列表，仅作为候选');
    expect(listItem.querySelector('details')).toBeNull();

    activateCandidate(wizard, 'other-list');
    expect(wizard.contentEl.querySelector('[data-active-candidate="other-list"]'))
      .not.toBeNull();
    expect(field(wizard, 'other-list', 'title').value).toBe('另一个候选');

    candidateSelection(wizard, 'other-list').click();

    expect(reviewFileGroup(wizard, otherPath).textContent).toContain(`${otherPath} · 1 / 1`);
    expect(otherCandidate.originalText).toBe('- 手动候选');
    expect(otherCandidate.proposed.title).toBe('另一个候选');
  });

  it('shows source evidence for files that could not be previewed', async () => {
    const failedPlan: MigrationPlan = {
      ...plan,
      failures: new Map([[sourcePath, '读取失败：文件已移动']]),
      files: new Map([[sourcePath, []]]),
    };
    const wizard = new LegacyImportWizard(
      {} as App,
      service({ preview: vi.fn().mockResolvedValue(failedPlan) }),
      '备份/旧任务导入',
    );

    await openReview(wizard);

    const failures = wizard.contentEl.querySelector<HTMLElement>('[data-import-failures]');
    expect(failures?.textContent).toContain('无法读取的文件');
    expect(failures?.textContent).toContain(`${sourcePath}：读取失败：文件已移动`);
    expect(wizard.contentEl.querySelector('[data-candidate-id]')).toBeNull();
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

  it('applies cleared optional proposal fields as undefined values', async () => {
    const migrationService = service();
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    await openReview(wizard);

    change(field(wizard, 'checkbox', 'details'), '');
    change(field(wizard, 'checkbox', 'plannedDate'), '');
    change(field(wizard, 'checkbox', 'dueDate'), '');
    change(field(wizard, 'checkbox', 'project'), '');
    change(field(wizard, 'checkbox', 'tags'), '');
    action(wizard, 'continue').click();
    action(wizard, 'confirm').click();
    await flushPromises();

    const selections = vi.mocked(migrationService.apply).mock.calls[0]?.[1];
    expect(selections?.get('checkbox')).toMatchObject({
      details: undefined,
      plannedDate: undefined,
      dueDate: undefined,
      project: undefined,
      tags: [],
    });
  });

  it('ignores openWizard reentry while review is open and preserves the active session', async () => {
    const migrationService = service();
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    await openReview(wizard);
    change(field(wizard, 'checkbox', 'title'), '重入后保留');
    candidateSelection(wizard, 'list').click();

    wizard.openWizard();

    expect(wizard.contentEl.dataset.step).toBe('review');
    expect(field(wizard, 'checkbox', 'title').value).toBe('重入后保留');
    expect(candidateSelection(wizard, 'checkbox').checked).toBe(true);
    expect(candidateSelection(wizard, 'list').checked).toBe(true);
    expect(migrationService.listEligibleFiles).toHaveBeenCalledTimes(1);

    action(wizard, 'back').click();
    expect(fileSelection(wizard).checked).toBe(true);
    action(wizard, 'continue').click();
    await flushPromises();
    expect(field(wizard, 'checkbox', 'title').value).toBe('重入后保留');
    expect(candidateSelection(wizard, 'checkbox').checked).toBe(true);
    expect(candidateSelection(wizard, 'list').checked).toBe(true);
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

  it('opens the first invalid selected candidate in the shared editor', async () => {
    const wizard = new LegacyImportWizard({} as App, service(), '备份/旧任务导入');
    await openReview(wizard);
    candidateSelection(wizard, 'list').click();
    activateCandidate(wizard, 'list');
    change(field(wizard, 'list', 'title'), '   ');
    activateCandidate(wizard, 'checkbox');

    action(wizard, 'continue').click();

    expect(wizard.contentEl.dataset.step).toBe('review');
    expect(wizard.contentEl.querySelector('[data-active-candidate="list"]')).not.toBeNull();
    expect(field(wizard, 'list', 'title').getAttribute('aria-invalid')).toBe('true');
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

  it('confirms every explicitly selected file including zero selections and read failures', async () => {
    const completePlan: MigrationPlan = {
      ...plan,
      files: new Map([
        [sourcePath, plan.files.get(sourcePath)!],
        [otherPath, []],
      ]),
      failures: new Map([[failedPath, '读取失败：文件已移动']]),
    };
    const wizard = new LegacyImportWizard(
      {} as App,
      service({
        listEligibleFiles: vi.fn(() => [sourcePath, otherPath, failedPath]),
        preview: vi.fn().mockResolvedValue(completePlan),
      }),
      '备份/旧任务导入',
    );
    wizard.openWizard();
    fileSelection(wizard, sourcePath).click();
    fileSelection(wizard, otherPath).click();
    fileSelection(wizard, failedPath).click();
    action(wizard, 'continue').click();
    await flushPromises();
    action(wizard, 'continue').click();

    expect(confirmFile(wizard, sourcePath).textContent).toContain(`${sourcePath} · 1 / 2`);
    expect(confirmFile(wizard, otherPath).textContent).toContain(`${otherPath} · 0 / 0`);
    expect(confirmFile(wizard, failedPath).textContent).toContain(`${failedPath} · 0 / 0`);
    expect(confirmFile(wizard, failedPath).textContent).toContain('读取失败：文件已移动');
  });

  it('uses the current backup root when settings change before confirmation', async () => {
    let backupRoot = '备份/初始目录';
    const wizard = new LegacyImportWizard(
      {} as App,
      service(),
      () => backupRoot,
    );
    await openReview(wizard);

    backupRoot = '备份/更新目录';
    action(wizard, 'continue').click();

    expect(wizard.contentEl.textContent).toContain(
      '备份/更新目录/2026-07-15T00-00-00-000Z/任务/旧.md',
    );
    expect(wizard.contentEl.textContent).not.toContain('备份/初始目录/');
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
      '已导入 1 个任务。',
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
      wizard.contentEl.querySelector<HTMLElement>('[data-import-status]')?.textContent,
    ).toBe('正在导入任务…');
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

  it('shows the failed source path and message for a MigrationError in a multi-file apply', async () => {
    const otherCandidate = {
      ...plan.files.get(sourcePath)![0],
      candidateId: 'other-checkbox',
      sourcePath: otherPath,
      proposed: makeTask({
        id: 'task-B2',
        title: '另一个自动候选',
        plannedDate: '2026-07-16',
      }),
    };
    const multiFilePlan: MigrationPlan = {
      ...plan,
      files: new Map([
        [sourcePath, plan.files.get(sourcePath)!],
        [otherPath, [otherCandidate]],
      ]),
    };
    const migrationService = service({
      preview: vi.fn().mockResolvedValue(multiFilePlan),
      apply: vi.fn().mockRejectedValue(new MigrationError(
        'verification-failed',
        '迁移写入复核失败。',
        otherPath,
      )),
    });
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    wizard.openWizard();
    fileSelection(wizard, sourcePath).click();
    fileSelection(wizard, otherPath).click();
    action(wizard, 'continue').click();
    await flushPromises();
    action(wizard, 'continue').click();
    action(wizard, 'confirm').click();
    await flushPromises();

    const error = wizard.contentEl.querySelector<HTMLElement>('[data-import-error]');
    expect(error?.textContent).toContain(otherPath);
    expect(error?.textContent).toContain('迁移写入复核失败。');
    expect(migrationService.apply).toHaveBeenCalledTimes(1);
  });

  it('ignores reentry during pending apply and can retry after the apply rejects', async () => {
    let rejectFirst!: (error: Error) => void;
    const firstApply = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const apply = vi.fn()
      .mockImplementationOnce(() => firstApply)
      .mockResolvedValueOnce(undefined);
    const migrationService = service({ apply });
    const wizard = new LegacyImportWizard({} as App, migrationService, '备份/旧任务导入');
    await openConfirm(wizard);

    action(wizard, 'confirm').click();
    wizard.openWizard();

    expect(wizard.contentEl.dataset.step).toBe('confirm');
    expect(action(wizard, 'confirm').disabled).toBe(true);
    expect(migrationService.listEligibleFiles).toHaveBeenCalledTimes(1);
    rejectFirst(new Error('首次写入失败'));
    await flushPromises();

    expect(wizard.contentEl.textContent).toContain('首次写入失败');
    expect(action(wizard, 'confirm').disabled).toBe(false);
    action(wizard, 'confirm').click();
    await flushPromises();

    expect(apply).toHaveBeenCalledTimes(2);
    expect((Notice as unknown as { messages: string[] }).messages).toContain(
      '已导入 1 个任务。',
    );
    expect(document.body.contains(wizard.contentEl)).toBe(false);
  });
});
