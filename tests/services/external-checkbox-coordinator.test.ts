import { describe, expect, it } from 'vitest';
import { TaskIndex } from '../../src/index/task-index';
import { parseTaskFile } from '../../src/markdown/task-parser';
import {
  ObsidianTaskRepository,
  TaskWriteError,
} from '../../src/persistence/obsidian-task-repository';
import {
  ExternalCheckboxCoordinator,
  type ClassificationPromptPort,
} from '../../src/services/external-checkbox-coordinator';
import type { TaskQuadrant } from '../../src/domain/task';
import { FakeVault } from '../fakes/fake-vault';

const path = '任务/a.md';

function taskBlock(
  id: string,
  title: string,
  checked: boolean,
  status: '待办' | '已完成' = '待办',
  quadrant = '重要不紧急',
): string {
  return [
    `- [${checked ? 'x' : ' '}] ${title} #task ^${id}`,
    `  - 状态:: ${status}`,
    `  - 分类:: ${quadrant}`,
  ].join('\n');
}

class Prompt implements ClassificationPromptPort {
  calls: string[] = [];

  constructor(
    private readonly result: Exclude<TaskQuadrant, 'unclassified'> | null,
    private readonly beforeResolve?: () => void,
  ) {}

  async chooseQuadrant(taskId: string): Promise<Exclude<TaskQuadrant, 'unclassified'> | null> {
    this.calls.push(taskId);
    this.beforeResolve?.();
    return this.result;
  }
}

function setup(previous: string, prompt = new Prompt('important-urgent')) {
  const vault = new FakeVault({ [path]: previous });
  const index = new TaskIndex();
  index.replaceFile(path, parseTaskFile(path, previous));
  const repository = new ObsidianTaskRepository(vault, index);
  const coordinator = new ExternalCheckboxCoordinator(repository, index, prompt);
  return { vault, index, repository, coordinator, prompt };
}

describe('ExternalCheckboxCoordinator', () => {
  it('completes a classified todo after a checkbox-only edit', async () => {
    const previous = taskBlock('task-A1', '任务', false);
    const { vault, index, coordinator, prompt } = setup(previous);
    vault.set(path, previous.replace('[ ]', '[x]'));

    await coordinator.refreshPath(path);

    expect(index.get('task-A1')?.task.status).toBe('done');
    expect(await vault.read(path)).toContain('状态:: 已完成');
    expect(prompt.calls).toEqual([]);
  });

  it('prompts for classification and persists quadrant plus completion together', async () => {
    const previous = taskBlock('task-A1', '任务', false, '待办', '未分类');
    const { vault, index, coordinator, prompt } = setup(previous);
    vault.set(path, previous.replace('[ ]', '[x]'));

    await coordinator.refreshPath(path);

    expect(prompt.calls).toEqual(['task-A1']);
    expect(index.get('task-A1')?.task).toMatchObject({
      status: 'done',
      quadrant: 'important-urgent',
    });
  });

  it('restores the checkbox when classification is cancelled', async () => {
    const previous = taskBlock('task-A1', '任务', false, '待办', '未分类');
    const { vault, index, coordinator } = setup(previous, new Prompt(null));
    vault.set(path, previous.replace('[ ]', '[x]'));

    await coordinator.refreshPath(path);

    expect(await vault.read(path)).toContain('- [ ] 任务');
    expect(index.get('task-A1')?.task.status).toBe('todo');
  });

  it('restores a parent checkbox when unfinished children block completion', async () => {
    const previous = [
      '- [ ] 父任务 #task ^task-P1',
      '  - 状态:: 待办',
      '  - 分类:: 重要不紧急',
      '  - [ ] 子任务 #task ^task-C1',
      '    - 状态:: 待办',
      '    - 分类:: 重要不紧急',
    ].join('\n');
    const { vault, coordinator } = setup(previous);
    vault.set(path, previous.replace('- [ ] 父任务', '- [x] 父任务'));

    await coordinator.refreshPath(path);

    expect(await vault.read(path)).toContain('- [ ] 父任务');
    expect(await vault.read(path)).toContain('- [ ] 子任务');
  });

  it('reopens a completed task when its checkbox is cleared', async () => {
    const previous = taskBlock('task-A1', '任务', true, '已完成');
    const { vault, index, coordinator } = setup(previous);
    vault.set(path, previous.replace('[x]', '[ ]'));

    await coordinator.refreshPath(path);

    expect(index.get('task-A1')?.task.status).toBe('todo');
    expect(await vault.read(path)).toContain('状态:: 待办');
  });

  it('does not overwrite a second external edit that occurs during classification', async () => {
    const previous = taskBlock('task-A1', '原标题', false, '待办', '未分类');
    const { vault, coordinator } = setup(
      previous,
      new Prompt('important-urgent', () => {
        vault.set(path, previous.replace('[ ] 原标题', '[x] 新标题'));
      }),
    );
    vault.set(path, previous.replace('[ ]', '[x]'));

    await expect(coordinator.refreshPath(path)).rejects.toBeInstanceOf(TaskWriteError);

    expect(await vault.read(path)).toContain('新标题');
    expect(await vault.read(path)).toContain('状态:: 待办');
  });

  it('keeps ambiguous edits read-only without an automatic write', async () => {
    const previous = taskBlock('task-A1', '原标题', false);
    const { vault, index, coordinator } = setup(previous);
    const changed = previous.replace('[ ] 原标题', '[x] 新标题');
    vault.set(path, changed);

    await coordinator.refreshPath(path);

    expect(await vault.read(path)).toBe(changed);
    expect(index.snapshot().issues.map((issue) => issue.code)).toContain('status-checkbox-conflict');
    expect((index.get('task-A1') as { readOnly?: boolean }).readOnly).toBe(true);
  });

  it('reconciles a safe task even when another block is ambiguous', async () => {
    const previous = [
      taskBlock('task-A1', '安全任务', false),
      '',
      taskBlock('task-B1', '原标题', false),
    ].join('\n');
    const { vault, index, coordinator } = setup(previous);
    vault.set(
      path,
      previous.replace('[ ] 安全任务', '[x] 安全任务').replace('[ ] 原标题', '[x] 新标题'),
    );

    await coordinator.refreshPath(path);

    expect(index.get('task-A1')?.task.status).toBe('done');
    expect(index.get('task-B1')?.task.status).toBe('todo');
    expect((index.get('task-B1') as { readOnly?: boolean }).readOnly).toBe(true);
  });
});
