import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TaskIndex } from '../../src/index/task-index';
import { ObsidianTaskRepository } from '../../src/persistence/obsidian-task-repository';
import { MigrationService } from '../../src/services/migration-service';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeVault } from '../fakes/fake-vault';

const path = '任务/旧日记.md';
const fixture = readFileSync(new URL('../fixtures/legacy-daily-tasks.md', import.meta.url), 'utf8');

function setup(source = fixture) {
  const vault = new FakeVault({ [path]: source });
  const index = new TaskIndex();
  const repository = new ObsidianTaskRepository(vault, index);
  let sequence = 0;
  const service = new MigrationService(repository, vault, DEFAULT_SETTINGS, () => {
    sequence += 1;
    return `task-01M1G${sequence}`;
  }, () => '2026-07-15T06:00:00.000Z');
  return { vault, index, repository, service };
}

describe('MigrationService', () => {
  it('previews legacy candidates without writing and classifies confidence', async () => {
    const { service, vault } = setup();
    const before = await vault.read(path);

    const plan = await service.preview([path]);
    const candidates = plan.files.get(path)!;

    expect(await vault.read(path)).toBe(before);
    expect(candidates.map((item) => item.confidence)).toEqual([
      'high',
      'medium',
      'medium',
      'high',
      'low',
      'high',
    ]);
    expect(candidates.every((item) => item.proposed.quadrant === 'unclassified')).toBe(true);
    expect(candidates.map((item) => item.proposed.plannedDate)).toEqual([
      '2026-01-07',
      '2026-01-07',
      '2026-01-07',
      '2026-01-07',
      '2026-03-16',
      '2026-03-16',
    ]);
    expect(candidates.map((item) => item.proposed.legacyPriority)).toEqual([
      'P1', 'P2', undefined, 'P0', 'P4', 'P3',
    ]);
    expect(candidates.map((item) => item.proposed.status)).toEqual([
      'done', 'todo', 'todo', 'in-progress', 'todo', 'paused',
    ]);
    expect(candidates.some((item) => item.originalText.includes('无关说明'))).toBe(false);
  });

  it('backs up each selected file before replacing only selected candidates', async () => {
    const { service, vault, index } = setup();
    const plan = await service.preview([path]);
    const candidates = plan.files.get(path)!;
    const selected = new Set([candidates[0].candidateId, candidates[3].candidateId]);

    await service.apply(plan, selected);

    const backupPath = '任务/任务备份/2026-07-15T06-00-00-000Z/任务/旧日记.md';
    expect(await vault.read(backupPath)).toBe(fixture);
    const migrated = await vault.read(path);
    expect(migrated).toContain('<!-- obsidian-task-schema: 1 -->');
    expect(migrated).toContain(`^${candidates[0].proposed.id}`);
    expect(migrated).toContain(`^${candidates[3].proposed.id}`);
    expect(migrated).toContain('1. 准备方案 P2');
    expect(index.get(candidates[0].proposed.id)?.location.sourcePath).toBe(path);
  });

  it('restores the backup when post-write verification fails', async () => {
    const { service, vault } = setup();
    const plan = await service.preview([path]);
    const candidate = plan.files.get(path)![0];
    vault.mutateAfterNextProcess(path, (written) => written.replace('状态:: 已完成', '状态:: 未知'));

    await expect(service.apply(plan, new Set([candidate.candidateId]))).rejects.toMatchObject({
      code: 'verification-failed',
    });

    expect(await vault.read(path)).toBe(fixture);
  });

  it('refuses a stale plan without losing the newer source edit', async () => {
    const { service, vault } = setup();
    const plan = await service.preview([path]);
    const candidate = plan.files.get(path)![1];
    vault.set(path, fixture.replace('准备方案', '准备新方案'));

    await expect(service.apply(plan, new Set([candidate.candidateId]))).rejects.toMatchObject({
      code: 'stale-plan',
    });

    expect(await vault.read(path)).toContain('准备新方案');
  });
});
