import { describe, expect, it } from 'vitest';
import { makeTask } from '../../src/domain/task';
import { TaskIndex } from '../../src/index/task-index';
import { parseTaskFile } from '../../src/markdown/task-parser';
import {
  ObsidianTaskRepository,
  TaskWriteError,
} from '../../src/persistence/obsidian-task-repository';
import { FakeVault } from '../fakes/fake-vault';

const parent = makeTask({
  id: 'task-01JZA1',
  title: '父任务',
  quadrant: 'important-not-urgent',
  childrenIds: ['task-01JZA2'],
});
const child = makeTask({
  id: 'task-01JZA2',
  title: '子任务',
  quadrant: 'important-not-urgent',
  parentId: parent.id,
});

const source = [
  '<!-- obsidian-task-schema: 1 -->',
  '',
  '- [ ] 父任务 #task ^task-01JZA1',
  '  - 状态:: 待办',
  '  - 分类:: 重要不紧急',
  '  - [ ] 子任务 #task ^task-01JZA2',
  '    - 状态:: 待办',
  '    - 分类:: 重要不紧急',
].join('\n');

function setup(files: Record<string, string>) {
  const vault = new FakeVault(files);
  const index = new TaskIndex();
  for (const [path, text] of Object.entries(files)) {
    index.replaceFile(path, parseTaskFile(path, text));
  }
  return { vault, index, repository: new ObsidianTaskRepository(vault, index) };
}

describe('ObsidianTaskRepository', () => {
  it('appends a complete task block and inserts the schema marker', async () => {
    const { repository, vault } = setup({ '任务/收件箱.md': '# 收件箱\n' });

    await repository.append('任务/收件箱.md', parent, [child]);

    const written = await vault.read('任务/收件箱.md');
    expect(written).toContain('<!-- obsidian-task-schema: 1 -->');
    expect(written).toContain('- [ ] 父任务 #task ^task-01JZA1');
    expect(written).toContain('  - [ ] 子任务 #task ^task-01JZA2');
  });

  it('replaces and removes only when the latest block fingerprint matches', async () => {
    const { repository, vault, index } = setup({ '任务/项目.md': source });
    const indexed = index.get(parent.id)!;

    await repository.replace(indexed, { ...parent, title: '修改后' }, [child]);
    await repository.refresh('任务/项目.md');
    expect((await vault.read('任务/项目.md'))).toContain('修改后');

    const latest = index.get(parent.id)!;
    vault.set('任务/项目.md', (await vault.read('任务/项目.md')).replace('修改后', '外部修改'));
    await expect(repository.remove(latest)).rejects.toMatchObject({
      code: 'fingerprint-mismatch',
      path: '任务/项目.md',
      taskId: parent.id,
    });
  });

  it('removes and returns the exact parent block including children', async () => {
    const { repository, vault, index } = setup({ '任务/项目.md': source });

    const removed = await repository.remove(index.get(parent.id)!);

    expect(removed).toContain('父任务');
    expect(removed).toContain('子任务');
    expect(await vault.read('任务/项目.md')).not.toContain('task-01JZA1');
  });

  it('moves the whole parent block to another file', async () => {
    const { repository, vault, index } = setup({
      '任务/项目.md': source,
      '任务/归档.md': '# 归档\n',
    });

    await repository.move(index.get(parent.id)!, '任务/归档.md');

    expect(await vault.read('任务/项目.md')).not.toContain('task-01JZA1');
    const target = await vault.read('任务/归档.md');
    expect(target).toContain('task-01JZA1');
    expect(target).toContain('task-01JZA2');
  });

  it('rolls back the target append when source removal fails', async () => {
    const { repository, vault, index } = setup({
      '任务/项目.md': source,
      '任务/归档.md': '# 归档\n',
    });
    vault.failNextProcess('任务/项目.md', new Error('simulated source failure'));

    await expect(repository.move(index.get(parent.id)!, '任务/归档.md')).rejects.toBeInstanceOf(
      TaskWriteError,
    );

    expect(await vault.read('任务/项目.md')).toContain('task-01JZA1');
    expect(await vault.read('任务/归档.md')).not.toContain('task-01JZA1');
  });
});
