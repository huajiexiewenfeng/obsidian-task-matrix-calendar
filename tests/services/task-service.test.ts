import { describe, expect, it } from 'vitest';
import { TaskIndex } from '../../src/index/task-index';
import { TaskWriteError } from '../../src/persistence/obsidian-task-repository';
import { ObsidianTaskRepository } from '../../src/persistence/obsidian-task-repository';
import { TaskCommandError, TaskService } from '../../src/services/task-service';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeVault } from '../fakes/fake-vault';

function setup(source = '# 收件箱\n') {
  const inbox = DEFAULT_SETTINGS.inboxPath;
  const vault = new FakeVault({ [inbox]: source, '任务/其他.md': '# 其他\n' });
  const index = new TaskIndex();
  const repository = new ObsidianTaskRepository(vault, index);
  let sequence = 0;
  const service = new TaskService(repository, index, DEFAULT_SETTINGS, () => {
    sequence += 1;
    return `task-01JZB${sequence}`;
  });
  return { inbox, vault, index, repository, service };
}

describe('TaskService', () => {
  it('quick-creates a normalized unclassified todo in the inbox', async () => {
    const { service, repository, index, inbox } = setup();

    const created = await service.create({ title: '  写   方案  ', tags: [' 工作 ', '工作'] });

    expect(created).toMatchObject({
      title: '写 方案',
      status: 'todo',
      quadrant: 'unclassified',
      tags: ['工作'],
    });
    await repository.refresh(inbox);
    expect(index.get(created.id)?.task.title).toBe('写 方案');
  });

  it('creates a task with normalized detail line endings and preserved line whitespace', async () => {
    const { service } = setup();

    const created = await service.create({
      title: '含详情',
      details: '第一行\r\n\r\n  第二行',
      plannedDate: '2026-07-15',
    });

    expect(created.details).toBe('第一行\n\n  第二行');
  });

  it('normalizes updated details and clears blank-only details', async () => {
    const { service, index } = setup();
    const task = await service.create({ title: '编辑详情', details: '原详情' });

    await service.update(task.id, { details: '新详情\r  保留空格' });
    expect(index.get(task.id)?.task.details).toBe('新详情\n  保留空格');

    await service.update(task.id, { details: '  \r\n  ' });
    expect(index.get(task.id)?.task.details).toBeUndefined();
  });

  it('persists explicit clearing of both task dates', async () => {
    const { service, index } = setup();
    const task = await service.create({
      title: '清除日期',
      plannedDate: '2026-07-15',
      dueDate: '2026-07-31',
    });

    await service.update(task.id, { plannedDate: '', dueDate: '' });

    expect(index.get(task.id)?.task).toMatchObject({
      plannedDate: undefined,
      dueDate: undefined,
    });
  });

  it('rejects blank titles and invalid ISO dates before writing', async () => {
    const { service, vault, inbox } = setup();

    await expect(service.create({ title: '   ' })).rejects.toMatchObject({ code: 'invalid-title' });
    await expect(service.create({ title: '日期', dueDate: '2026-02-30' })).rejects.toMatchObject({
      code: 'invalid-date',
    });
    expect(await vault.read(inbox)).toBe('# 收件箱\n');
  });

  it('creates a child with inherited classification metadata and empty dates', async () => {
    const { service, index } = setup();
    const parent = await service.create({
      title: '长期任务',
      quadrant: 'important-not-urgent',
      project: '开源插件',
      tags: ['开发'],
      plannedDate: '2026-07-15',
      dueDate: '2026-08-01',
    });

    const child = await service.create({ title: '第一步', parentId: parent.id });

    expect(child).toMatchObject({
      parentId: parent.id,
      quadrant: 'important-not-urgent',
      project: '开源插件',
      tags: ['开发'],
      plannedDate: undefined,
      dueDate: undefined,
    });
    expect(index.get(parent.id)?.task.childrenIds).toEqual([child.id]);
  });

  it('enforces classification for start and supports pause, resume, cancel and reopen', async () => {
    const { service } = setup();
    const task = await service.create({ title: '工作流' });

    await expect(service.transition(task.id, 'in-progress')).rejects.toMatchObject({
      code: 'classification-required',
    });
    await service.changeQuadrant(task.id, 'important-urgent');
    await service.transition(task.id, 'in-progress');
    await service.transition(task.id, 'paused');
    await service.transition(task.id, 'in-progress');
    await service.transition(task.id, 'todo');
    await service.complete(task.id);
    await service.transition(task.id, 'todo');
  });

  it('allows a todo task to move back to unclassified', async () => {
    const { service, index } = setup();
    const task = await service.create({
      title: '重新归入收件箱',
      quadrant: 'important-urgent',
    });

    await service.changeQuadrant(task.id, 'unclassified');

    expect(index.get(task.id)?.task).toMatchObject({
      status: 'todo',
      quadrant: 'unclassified',
    });
  });

  it.each(['in-progress', 'paused', 'done'] as const)(
    'rejects moving a %s task to unclassified through changeQuadrant',
    async (status) => {
      const { service, index } = setup();
      const task = await service.create({
        title: '不能取消分类',
        quadrant: 'important-not-urgent',
      });
      if (status === 'done') {
        await service.complete(task.id);
      } else {
        await service.transition(task.id, 'in-progress');
        if (status === 'paused') await service.transition(task.id, 'paused');
      }

      await expect(service.changeQuadrant(task.id, 'unclassified')).rejects.toMatchObject({
        code: 'classification-required',
        taskId: task.id,
      });
      expect(index.get(task.id)?.task).toMatchObject({
        status,
        quadrant: 'important-not-urgent',
      });
    },
  );

  it('uses the merged quadrant when classifying and starting in one update', async () => {
    const { service, index } = setup();
    const task = await service.create({ title: '一步开始' });

    await service.update(task.id, {
      status: 'in-progress',
      quadrant: 'important-urgent',
    });

    expect(index.get(task.id)?.task).toMatchObject({
      status: 'in-progress',
      quadrant: 'important-urgent',
    });
  });

  it.each(['in-progress', 'done'] as const)(
    'rejects changing a %s task to unclassified',
    async (status) => {
      const { service, index } = setup();
      const task = await service.create({
        title: '保持分类',
        quadrant: 'important-not-urgent',
      });
      await service.transition(task.id, status);

      await expect(service.update(task.id, { quadrant: 'unclassified' })).rejects.toMatchObject({
        code: 'classification-required',
      });
      expect(index.get(task.id)?.task).toMatchObject({
        status,
        quadrant: 'important-not-urgent',
      });
    },
  );

  it('completes an unclassified todo only with a supplied quadrant in one write', async () => {
    const { service, index } = setup();
    const task = await service.create({ title: '直接完成' });

    await expect(service.complete(task.id)).rejects.toMatchObject({
      code: 'classification-required',
    });
    await service.complete(task.id, 'not-important-not-urgent');

    expect(index.get(task.id)?.task).toMatchObject({
      status: 'done',
      quadrant: 'not-important-not-urgent',
    });
  });

  it('blocks parent completion and suggests the parent when the final child completes', async () => {
    const { service } = setup();
    const parent = await service.create({ title: '父', quadrant: 'important-not-urgent' });
    const child = await service.create({ title: '子', parentId: parent.id });

    await expect(service.complete(parent.id)).rejects.toMatchObject({ code: 'unfinished-children' });
    const result = await service.transition(child.id, 'done');

    expect(result).toEqual({ promptParentCompletion: parent.id });
  });

  it('changes only the parent quadrant and only the planned date', async () => {
    const { service, index } = setup();
    const parent = await service.create({
      title: '父',
      quadrant: 'important-urgent',
      dueDate: '2026-08-01',
    });
    const child = await service.create({ title: '子', parentId: parent.id });

    await service.changeQuadrant(parent.id, 'important-not-urgent');
    await service.changePlannedDate(parent.id, '2026-07-20');

    expect(index.get(parent.id)?.task).toMatchObject({
      quadrant: 'important-not-urgent',
      plannedDate: '2026-07-20',
      dueDate: '2026-08-01',
    });
    expect(index.get(child.id)?.task.quadrant).toBe('important-urgent');
  });

  it('moves a whole parent block and refreshes both index paths', async () => {
    const { service, index } = setup();
    const parent = await service.create({ title: '移动', quadrant: 'important-not-urgent' });
    const child = await service.create({ title: '一起移动', parentId: parent.id });

    await service.moveToFile(parent.id, '任务/其他.md');

    expect(index.get(parent.id)?.location.sourcePath).toBe('任务/其他.md');
    expect(index.get(child.id)?.location.sourcePath).toBe('任务/其他.md');
  });

  it('does not refresh the index after a failed write', async () => {
    const { service, index, vault, inbox } = setup();
    const task = await service.create({ title: '冲突', quadrant: 'important-urgent' });
    const revision = index.snapshot().revision;
    vault.set(inbox, (await vault.read(inbox)).replace('冲突', '外部修改'));

    await expect(service.update(task.id, { project: '不会覆盖' })).rejects.toBeInstanceOf(
      TaskWriteError,
    );
    expect(index.snapshot().revision).toBe(revision);
    expect(index.get(task.id)?.task.project).toBeUndefined();
  });

  it('rejects moving a child independently', async () => {
    const { service } = setup();
    const parent = await service.create({ title: '父' });
    const child = await service.create({ title: '子', parentId: parent.id });

    await expect(service.moveToFile(child.id, '任务/其他.md')).rejects.toBeInstanceOf(
      TaskCommandError,
    );
  });
});
