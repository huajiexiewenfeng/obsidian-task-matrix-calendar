import { describe, expect, it } from 'vitest';
import { TaskIndex } from '../../src/index/task-index';
import { parseTaskFile } from '../../src/markdown/task-parser';
import { ObsidianTaskRepository } from '../../src/persistence/obsidian-task-repository';
import { TrashService, TrashServiceError } from '../../src/services/trash-service';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeVault } from '../fakes/fake-vault';

const sourcePath = '任务/项目.md';
const source = [
  '<!-- obsidian-task-schema: 1 -->',
  '',
  '- [ ] 父任务 #task ^task-P1',
  '  - 状态:: 待办',
  '  - 分类:: 重要不紧急',
  '  - [x] 子任务 #task ^task-C1',
  '    - 状态:: 已完成',
  '    - 分类:: 重要不紧急',
].join('\n');

async function setup() {
  const vault = new FakeVault({
    [sourcePath]: source,
    [DEFAULT_SETTINGS.inboxPath]: '# 收件箱\n',
  });
  const index = new TaskIndex();
  index.replaceFile(sourcePath, parseTaskFile(sourcePath, source));
  const repository = new ObsidianTaskRepository(vault, index);
  const service = new TrashService(repository, index, vault, DEFAULT_SETTINGS);
  return { vault, index, repository, service };
}

describe('TrashService', () => {
  it('moves a complete parent/child block to visible trash metadata', async () => {
    const { service, vault, index } = await setup();

    await service.moveToTrash('task-P1', '2026-07-15T05:00:00.000Z');

    const trash = await vault.read(DEFAULT_SETTINGS.trashPath);
    expect(trash).toContain('原路径:: 任务/项目.md');
    expect(trash).toContain('原任务ID:: task-P1');
    expect(trash).toContain('删除时间:: 2026-07-15T05:00:00.000Z');
    expect(trash).toContain('task-C1');
    expect(await vault.read(sourcePath)).not.toContain('task-P1');
    expect(index.get('task-P1')).toBeUndefined();
  });

  it('restores to the original file or falls back to the inbox when it is missing', async () => {
    const first = await setup();
    await first.service.moveToTrash('task-P1', '2026-07-15T05:00:00.000Z');
    expect(await first.service.restore('task-P1')).toEqual({ restoredPath: sourcePath });
    expect(await first.vault.read(sourcePath)).toContain('task-C1');

    const second = await setup();
    await second.service.moveToTrash('task-P1', '2026-07-15T05:00:00.000Z');
    second.vault.deleteFile(sourcePath);
    expect(await second.service.restore('task-P1')).toEqual({
      restoredPath: DEFAULT_SETTINGS.inboxPath,
    });
    expect(await second.vault.read(DEFAULT_SETTINGS.inboxPath)).toContain('task-P1');
  });

  it('refuses restoration when an active managed task already uses the id', async () => {
    const { service, vault, repository } = await setup();
    await service.moveToTrash('task-P1', '2026-07-15T05:00:00.000Z');
    vault.set(DEFAULT_SETTINGS.inboxPath, source);
    await repository.refresh(DEFAULT_SETTINGS.inboxPath);

    await expect(service.restore('task-P1')).rejects.toMatchObject({ code: 'duplicate-id' });
  });

  it('requires exact confirmation before permanent deletion', async () => {
    const { service, vault } = await setup();
    await service.moveToTrash('task-P1', '2026-07-15T05:00:00.000Z');

    await expect(
      service.permanentlyDelete('task-P1', 'WRONG' as 'DELETE'),
    ).rejects.toBeInstanceOf(TrashServiceError);
    await service.permanentlyDelete('task-P1', 'DELETE');

    expect(await vault.read(DEFAULT_SETTINGS.trashPath)).not.toContain('task-P1');
  });

  it('reports entry count, UTF-8 bytes and warnings above 5 MiB', async () => {
    const { service, vault } = await setup();
    await service.moveToTrash('task-P1', '2026-07-15T05:00:00.000Z');
    const normal = await service.getStats();
    expect(normal.entries).toBe(1);
    expect(normal.bytes).toBeGreaterThan(0);
    expect(normal.warn).toBe(false);

    vault.set(DEFAULT_SETTINGS.trashPath, `${await vault.read(DEFAULT_SETTINGS.trashPath)}${'中'.repeat(1_800_000)}`);
    expect((await service.getStats()).warn).toBe(true);
  });

  it('requires exact confirmation before emptying the trash', async () => {
    const { service, vault } = await setup();
    await service.moveToTrash('task-P1', '2026-07-15T05:00:00.000Z');

    await expect(service.emptyTrash('NO' as 'EMPTY TRASH')).rejects.toMatchObject({
      code: 'confirmation-required',
    });
    await service.emptyTrash('EMPTY TRASH');

    expect(await vault.read(DEFAULT_SETTINGS.trashPath)).toBe('');
    expect(await service.getStats()).toEqual({ entries: 0, bytes: 0, warn: false });
  });
});
