import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeTask } from '../../src/domain/task';
import { TaskIndex } from '../../src/index/task-index';
import { serializeTaskBlock } from '../../src/markdown/task-serializer';
import { ObsidianTaskRepository } from '../../src/persistence/obsidian-task-repository';
import { MigrationService } from '../../src/services/migration-service';
import { DEFAULT_SETTINGS, type TaskMatrixCalendarSettings } from '../../src/settings';
import { FakeVault } from '../fakes/fake-vault';

const path = '任务/旧日记.md';
const fixture = readFileSync(new URL('../fixtures/legacy-daily-tasks.md', import.meta.url), 'utf8');

function setup(
  source = fixture,
  settings: TaskMatrixCalendarSettings = DEFAULT_SETTINGS,
  vault: FakeVault = new FakeVault({ [path]: source }),
) {
  const index = new TaskIndex();
  const repository = new ObsidianTaskRepository(vault, index);
  let sequence = 0;
  const service = new MigrationService(repository, vault, settings, () => {
    sequence += 1;
    return `task-01M1G${sequence}`;
  }, () => '2026-07-15T06:00:00.000Z');
  return { vault, index, repository, service };
}

class RecordingVault extends FakeVault {
  readonly readPaths: string[] = [];

  override async read(path: string): Promise<string> {
    this.readPaths.push(path);
    return super.read(path);
  }
}

function setupWithFiles(
  files: Record<string, string>,
  settings: TaskMatrixCalendarSettings = DEFAULT_SETTINGS,
) {
  const vault = new RecordingVault(files);
  const index = new TaskIndex();
  const repository = new ObsidianTaskRepository(vault, index);
  let sequence = 0;
  const service = new MigrationService(
    repository,
    vault,
    settings,
    () => `task-SELECTED${++sequence}`,
    () => '2026-07-15T06:00:00.000Z',
  );
  return { vault, index, repository, service };
}

describe('MigrationService automatic discovery', () => {
  it('lists eligible files and previews only explicitly selected paths', async () => {
    const first = '任务/一.md';
    const second = '任务/二.md';
    const { service, vault } = setupWithFiles({
      [first]: '## 20260715\n- [ ] 第一项',
      [second]: '## 20260715\n- [ ] 第二项',
      '任务/任务回收站.md': '- [ ] 不应出现',
      '任务/任务备份/旧.md': '- [ ] 不应出现',
      '其他/外部.md': '- [ ] 不应出现',
    });

    expect(service.listEligibleFiles()).toEqual([first, second]);
    const plan = await service.preview([second]);
    expect([...plan.files.keys()]).toEqual([second]);
    expect(vault.readPaths).toEqual([second]);
  });

  it('does not scan when preview receives no paths', async () => {
    const { service, vault } = setupWithFiles({ '任务/一.md': '- [ ] 第一项' });
    const plan = await service.preview();
    expect(plan.files.size).toBe(0);
    expect(vault.readPaths).toEqual([]);
  });

  it('rejects an out-of-scope source at the service boundary', async () => {
    const { service } = setupWithFiles({ '其他/外部.md': '- [ ] 外部项' });
    await expect(service.preview(['其他/外部.md'])).rejects.toMatchObject({
      code: 'invalid-source',
      path: '其他/外部.md',
    });
  });

  it('enumerates eligible paths and continues after a read failure', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      scanRoots: ['Tasks'],
      excludeGlobs: ['**/skip*.md'],
      trashPath: 'Tasks/trash.md',
      backupRoot: 'Tasks/backups',
    };
    const goodPath = 'tasks/daily.md';
    const failedPath = 'Tasks/unreadable.md';
    const legacy = '# 2026-07-15\n- [ ] Legacy P1';
    class VaultWithUnreadablePath extends FakeVault {
      override listMarkdownPaths(): string[] {
        return [...super.listMarkdownPaths(), failedPath];
      }
    }
    const vault = new VaultWithUnreadablePath({
      [goodPath]: legacy,
      'Tasks/skip-note.md': legacy,
      'TASKS/TRASH.md': legacy,
      'tasks/BACKUPS/2026/old.md': legacy,
      'Other/outside.md': legacy,
    });
    const { service } = setup(legacy, settings, vault);

    const plan = await service.preview([goodPath, failedPath]);

    expect([...plan.files.keys()]).toEqual([goodPath]);
    expect(plan.files.get(goodPath)).toHaveLength(1);
    expect(plan.failures.get(failedPath)).toMatch(/Missing fake file/);
  });

  it('does not rediscover legacy-looking lines inside canonical task ranges', async () => {
    const root = DEFAULT_SETTINGS.scanRoots[0];
    const mixedPath = `${root}/mixed.md`;
    const canonical = serializeTaskBlock(makeTask({
      id: 'task-C1',
      title: 'Canonical P1',
      plannedDate: '2026-07-15',
    }), []);
    const source = ['# 2026-07-15', canonical, '- [ ] Legacy P2'].join('\n');
    const { service } = setup(source, DEFAULT_SETTINGS, new FakeVault({ [mixedPath]: source }));

    const plan = await service.preview([mixedPath]);

    expect(plan.files.get(mixedPath)?.map((candidate) => candidate.originalText)).toEqual([
      '- [ ] Legacy P2',
    ]);
  });

  it('applies corrections, preserves unselected text and generated IDs, and avoids duplicates', async () => {
    const root = DEFAULT_SETTINGS.scanRoots[0];
    const correctedPath = `${root}/corrected.md`;
    const source = '# 2026-07-15\n- [ ] First legacy P1\n- [ ] Keep legacy P2';
    const { service, vault, index } = setup(
      source,
      DEFAULT_SETTINGS,
      new FakeVault({ [correctedPath]: source }),
    );
    const plan = await service.preview([correctedPath]);
    const [candidate, unselected] = plan.files.get(correctedPath)!;
    const corrected = makeTask({
      ...candidate.proposed,
      id: 'task-Z9',
      title: 'Corrected title',
      details: 'Detail one\nDetail two',
      quadrant: 'important-not-urgent',
      dueDate: '2026-07-31',
    });

    await service.apply(plan, new Map([[candidate.candidateId, corrected]]));

    expect(await vault.read(correctedPath)).toContain(unselected.originalText);
    expect(index.get(candidate.proposed.id)?.task).toMatchObject({
      id: candidate.proposed.id,
      title: 'Corrected title',
      details: 'Detail one\nDetail two',
      quadrant: 'important-not-urgent',
      dueDate: '2026-07-31',
    });
    expect(index.get('task-Z9')).toBeUndefined();
    const secondPlan = await service.preview([correctedPath]);
    expect(secondPlan.files.get(correctedPath)?.map((item) => item.originalText)).toEqual([
      unselected.originalText,
    ]);
  });
});

describe('MigrationService', () => {
  it('previews legacy candidates without writing and exposes recognition evidence', async () => {
    const { service, vault } = setup();
    const before = await vault.read(path);

    const plan = await service.preview([path]);
    const candidates = plan.files.get(path)!;

    expect(await vault.read(path)).toBe(before);
    expect(candidates.map((item) => item.recognition.kind)).toEqual([
      'checkbox', 'list-item', 'list-item',
    ]);
    expect(candidates.map((item) => item.recognition.defaultSelected)).toEqual([
      true, false, false,
    ]);
    expect(candidates.every((item) => item.proposed.quadrant === 'unclassified')).toBe(true);
    expect(candidates.map((item) => item.proposed.plannedDate)).toEqual([
      '2026-01-07',
      '2026-01-07',
      '2026-01-07',
    ]);
    expect(candidates.map((item) => item.proposed.legacyPriority)).toEqual([
      'P1', 'P2', undefined,
    ]);
    expect(candidates.map((item) => item.proposed.status)).toEqual([
      'done', 'todo', 'todo',
    ]);
    expect(candidates.some((item) => item.originalText.includes('无关说明'))).toBe(false);
  });

  it('validates every selected correction before creating any backup or writing any file', async () => {
    const root = DEFAULT_SETTINGS.scanRoots[0];
    const firstPath = `${root}/first-invalid-wave.md`;
    const secondPath = `${root}/second-invalid-wave.md`;
    const firstSource = '# 2026-07-15\n- [ ] First legacy P1';
    const secondSource = '# 2026-07-15\n- [ ] Second legacy P2';
    const vault = new FakeVault({
      [firstPath]: firstSource,
      [secondPath]: secondSource,
    });
    const { service } = setup(firstSource, DEFAULT_SETTINGS, vault);
    const plan = await service.preview([firstPath, secondPath]);
    const first = plan.files.get(firstPath)![0];
    const second = plan.files.get(secondPath)![0];
    const selections = new Map([
      [first.candidateId, first.proposed],
      [second.candidateId, makeTask({ ...second.proposed, title: '   ' })],
    ]);

    await expect(service.apply(plan, selections)).rejects.toMatchObject({
      code: 'invalid-candidate',
      path: secondPath,
    });

    expect(await vault.read(firstPath)).toBe(firstSource);
    expect(await vault.read(secondPath)).toBe(secondSource);
    expect(vault.listMarkdownPaths().sort()).toEqual([firstPath, secondPath].sort());
  });

  it('backs up each selected file before replacing only selected candidates', async () => {
    const { service, vault, index } = setup();
    const plan = await service.preview([path]);
    const candidates = plan.files.get(path)!;
    const selected = new Map([
      [candidates[0].candidateId, makeTask({
        ...candidates[0].proposed,
        quadrant: 'important-urgent',
      })],
      [candidates[2].candidateId, makeTask({
        ...candidates[2].proposed,
        quadrant: 'important-urgent',
      })],
    ]);

    await service.apply(plan, selected);

    const backupPath = '任务/任务备份/2026-07-15T06-00-00-000Z/任务/旧日记.md';
    expect(await vault.read(backupPath)).toBe(fixture);
    const migrated = await vault.read(path);
    expect(migrated).toContain('<!-- obsidian-task-schema: 1 -->');
    expect(migrated).toContain(`^${candidates[0].proposed.id}`);
    expect(migrated).toContain(`^${candidates[2].proposed.id}`);
    expect(migrated).toContain('1. 准备方案 P2');
    expect(index.get(candidates[0].proposed.id)?.location.sourcePath).toBe(path);
  });

  it('restores the backup when post-write verification fails', async () => {
    const { service, vault } = setup();
    const plan = await service.preview([path]);
    const candidate = plan.files.get(path)![0];
    const corrected = makeTask({ ...candidate.proposed, quadrant: 'important-urgent' });
    vault.mutateAfterNextProcess(path, (written) => written.replace('状态:: 已完成', '状态:: 未知'));

    await expect(
      service.apply(plan, new Map([[candidate.candidateId, corrected]])),
    ).rejects.toMatchObject({
      code: 'verification-failed',
    });

    expect(await vault.read(path)).toBe(fixture);
  });

  it('preserves a concurrent edit that arrives after the initial apply read', async () => {
    const { service, vault } = setup();
    const plan = await service.preview([path]);
    const candidate = plan.files.get(path)![0];
    const corrected = makeTask({ ...candidate.proposed, quadrant: 'important-urgent' });
    const newer = fixture.replace(candidate.originalText, `${candidate.originalText} concurrent`);
    vault.mutateBeforeNextProcess(path, () => newer);

    await expect(
      service.apply(plan, new Map([[candidate.candidateId, corrected]])),
    ).rejects.toMatchObject({
      code: 'stale-plan',
    });

    expect(await vault.read(path)).toBe(newer);
  });

  it('rolls back when pre-existing parse issues remain after writing', async () => {
    const brokenPath = `${DEFAULT_SETTINGS.scanRoots[0]}/broken.md`;
    const source = [
      '# 2026-07-15',
      '- [ ] Existing #task ^task-A1',
      '  - Unknown:: value',
      '- [ ] Legacy P1',
    ].join('\n');
    const { service, vault } = setup(
      source,
      DEFAULT_SETTINGS,
      new FakeVault({ [brokenPath]: source }),
    );
    const plan = await service.preview([brokenPath]);
    const candidate = plan.files.get(brokenPath)![0];

    await expect(
      service.apply(plan, new Map([[candidate.candidateId, candidate.proposed]])),
    ).rejects.toMatchObject({
      code: 'verification-failed',
    });

    expect(await vault.read(brokenPath)).toBe(source);
  });

  it('refuses a stale plan without losing the newer source edit', async () => {
    const { service, vault } = setup();
    const plan = await service.preview([path]);
    const candidate = plan.files.get(path)![1];
    vault.set(path, fixture.replace('准备方案', '准备新方案'));

    await expect(
      service.apply(plan, new Map([[candidate.candidateId, candidate.proposed]])),
    ).rejects.toMatchObject({
      code: 'stale-plan',
    });

    expect(await vault.read(path)).toContain('准备新方案');
  });
});
