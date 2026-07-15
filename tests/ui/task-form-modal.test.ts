// @vitest-environment jsdom
import type { App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTask, type IndexedTask, type TaskNode } from '../../src/domain/task';
import { TaskWriteError } from '../../src/persistence/obsidian-task-repository';
import { TaskCommandError } from '../../src/services/task-service';
import { TaskFormModal, type TaskFormServicePort } from '../../src/ui/task-form-modal';

function indexedTask(): IndexedTask {
  return {
    task: makeTask({
      id: 'task-A1',
      title: '已有任务',
      details: '第一行\n第二行',
      status: 'in-progress',
      quadrant: 'important-not-urgent',
      plannedDate: '2026-07-10',
      dueDate: '2026-07-20',
      project: '产品发布',
      tags: ['工作', '本周'],
    }),
    location: {
      sourcePath: '任务/收件箱.md',
      startLine: 1,
      endLine: 8,
      indent: 0,
      eol: '\n',
      fingerprint: 'fingerprint-A1',
    },
  };
}

function service(overrides: Partial<TaskFormServicePort> = {}): TaskFormServicePort {
  return {
    create: vi.fn().mockResolvedValue(makeTask({ id: 'task-new', title: '新任务' })),
    update: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function input(modal: TaskFormModal, name: string): HTMLInputElement {
  return modal.contentEl.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
}

function textarea(modal: TaskFormModal, name: string): HTMLTextAreaElement {
  return modal.contentEl.querySelector<HTMLTextAreaElement>(`textarea[name="${name}"]`)!;
}

function select(modal: TaskFormModal, name: string): HTMLSelectElement {
  return modal.contentEl.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
}

function save(modal: TaskFormModal): HTMLButtonElement {
  return modal.contentEl.querySelector<HTMLButtonElement>('[data-action="save"]')!;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('TaskFormModal', () => {
  it('opens create mode with all fields and create defaults', () => {
    const modal = new TaskFormModal({} as App, service(), () => '2026-07-15');

    modal.openCreate();

    expect(input(modal, 'title').value).toBe('');
    expect(textarea(modal, 'details').value).toBe('');
    expect(textarea(modal, 'details').rows).toBe(6);
    expect(select(modal, 'status').value).toBe('todo');
    expect(select(modal, 'status').disabled).toBe(true);
    expect(select(modal, 'status').selectedOptions[0]?.textContent).toBe('待办');
    expect(select(modal, 'quadrant').value).toBe('unclassified');
    expect(input(modal, 'plannedDate').value).toBe('2026-07-15');
    expect(input(modal, 'dueDate').value).toBe('');
    expect(input(modal, 'project').value).toBe('');
    expect(input(modal, 'tags').value).toBe('');
    expect(input(modal, 'plannedDate').type).toBe('text');
    expect(input(modal, 'plannedDate').inputMode).toBe('numeric');
    expect(input(modal, 'plannedDate').placeholder).toBe('YYYYMMDD 或 YYYY-MM-DD');
    expect(modal.contentEl.isConnected).toBe(true);
  });

  it('populates every field in edit mode', () => {
    const modal = new TaskFormModal({} as App, service(), () => '2026-07-15');

    modal.openEdit(indexedTask());

    expect(input(modal, 'title').value).toBe('已有任务');
    expect(textarea(modal, 'details').value).toBe('第一行\n第二行');
    expect(select(modal, 'status').value).toBe('in-progress');
    expect(select(modal, 'status').disabled).toBe(false);
    expect(select(modal, 'quadrant').value).toBe('important-not-urgent');
    expect(input(modal, 'plannedDate').value).toBe('2026-07-10');
    expect(input(modal, 'dueDate').value).toBe('2026-07-20');
    expect(input(modal, 'project').value).toBe('产品发布');
    expect(input(modal, 'tags').value).toBe('工作, 本周');
  });

  it('normalizes compact dates on blur and submits create exactly once', async () => {
    const create = vi.fn().mockResolvedValue(makeTask({ id: 'task-new', title: '新任务' }));
    const modal = new TaskFormModal({} as App, service({ create }), () => '2026-07-15');
    modal.openCreate();
    input(modal, 'title').value = '  新任务  ';
    textarea(modal, 'details').value = '第一行\n第二行';
    input(modal, 'plannedDate').value = '20260716';
    input(modal, 'plannedDate').dispatchEvent(new Event('blur'));
    input(modal, 'dueDate').value = '20260731';
    input(modal, 'project').value = ' 产品发布 ';
    input(modal, 'tags').value = '工作, 本周, 工作';

    expect(input(modal, 'plannedDate').value).toBe('2026-07-16');
    save(modal).click();
    await flushPromises();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      title: '新任务',
      details: '第一行\n第二行',
      quadrant: 'unclassified',
      plannedDate: '2026-07-16',
      dueDate: '2026-07-31',
      project: ' 产品发布 ',
      tags: ['工作', '本周', '工作'],
    });
    expect(modal.contentEl.isConnected).toBe(false);
  });

  it('submits edit exactly once and closes after success', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const modal = new TaskFormModal({} as App, service({ update }), () => '2026-07-15');
    modal.openEdit(indexedTask());
    input(modal, 'title').value = '更新任务';

    save(modal).click();
    await flushPromises();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('task-A1', expect.objectContaining({
      title: '更新任务',
      details: '第一行\n第二行',
    }));
    expect(modal.contentEl.isConnected).toBe(false);
  });

  it('shows field errors and does not submit invalid title or date values', () => {
    const create = vi.fn<() => Promise<TaskNode>>();
    const modal = new TaskFormModal({} as App, service({ create }), () => '2026-07-15');
    modal.openCreate();

    input(modal, 'title').value = '   ';
    save(modal).click();

    expect(create).not.toHaveBeenCalled();
    expect(input(modal, 'title').getAttribute('aria-invalid')).toBe('true');
    expect(modal.contentEl.querySelector('[data-form-error]')?.textContent).toContain('任务标题不能为空');

    input(modal, 'title').value = '新任务';
    input(modal, 'dueDate').value = '20260230';
    save(modal).click();

    expect(create).not.toHaveBeenCalled();
    expect(input(modal, 'title').hasAttribute('aria-invalid')).toBe(false);
    expect(input(modal, 'dueDate').getAttribute('aria-invalid')).toBe('true');
    expect(modal.contentEl.querySelector('[data-form-error]')?.textContent).toContain('有效日期');
    expect(modal.contentEl.isConnected).toBe(true);
  });

  it('disables save while pending and prevents duplicate submission', async () => {
    let resolveCreate!: (task: TaskNode) => void;
    const create = vi.fn().mockReturnValue(new Promise<TaskNode>((resolve) => {
      resolveCreate = resolve;
    }));
    const modal = new TaskFormModal({} as App, service({ create }), () => '2026-07-15');
    modal.openCreate();
    input(modal, 'title').value = '新任务';

    const saveButton = save(modal);
    saveButton.click();
    saveButton.click();

    expect(saveButton.disabled).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    resolveCreate(makeTask({ id: 'task-new', title: '新任务' }));
    await flushPromises();
    expect(modal.contentEl.isConnected).toBe(false);
  });

  it('stays open and displays a typed service failure', async () => {
    const create = vi.fn().mockRejectedValue(
      new TaskCommandError('invalid-title', '任务标题不能为空。'),
    );
    const modal = new TaskFormModal({} as App, service({ create }), () => '2026-07-15');
    modal.openCreate();
    input(modal, 'title').value = '新任务';

    save(modal).click();
    await flushPromises();

    expect(create).toHaveBeenCalledTimes(1);
    expect(modal.contentEl.querySelector('[data-form-error]')?.textContent).toBe('任务标题不能为空。');
    expect(modal.contentEl.isConnected).toBe(true);
    expect(save(modal).disabled).toBe(false);
  });

  it('shows write-conflict context, stays open, and re-enables save', async () => {
    const create = vi.fn().mockRejectedValue(new TaskWriteError(
      'fingerprint-mismatch',
      '任务/收件箱.md',
      'task-A1',
      '任务已被外部修改，请刷新后重试。',
    ));
    const modal = new TaskFormModal({} as App, service({ create }), () => '2026-07-15');
    modal.openCreate();
    input(modal, 'title').value = '新任务';

    save(modal).click();
    await flushPromises();

    const error = modal.contentEl.querySelector('[data-form-error]')?.textContent;
    expect(error).toContain('任务/收件箱.md');
    expect(error).toContain('task-A1');
    expect(modal.contentEl.isConnected).toBe(true);
    expect(save(modal).disabled).toBe(false);
  });
});
