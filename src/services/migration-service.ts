import { createTaskId } from '../domain/id';
import type { TaskNode } from '../domain/task';
import { validateTaskDraft } from '../domain/rules';
import { isManagedMarkdownPath } from '../index/managed-path';
import { ensureSchemaMarker, serializeTaskBlock } from '../markdown/task-serializer';
import type { TaskRepository } from '../persistence/obsidian-task-repository';
import type { VaultProcessPort } from '../persistence/vault-port';
import { normalizeVaultPath, type TaskMatrixCalendarSettings } from '../settings';
import {
  extractLegacyCandidates,
  type MigrationCandidate,
} from './legacy-task-candidates';

export type { MigrationCandidate } from './legacy-task-candidates';

export interface MigrationFileSnapshot {
  readonly source: string;
}

export interface MigrationPlan {
  files: Map<string, MigrationCandidate[]>;
  failures: Map<string, string>;
  sourceSnapshots: ReadonlyMap<string, MigrationFileSnapshot>;
  createdAt: string;
}

export type MigrationErrorCode =
  | 'invalid-source'
  | 'invalid-candidate'
  | 'stale-plan'
  | 'verification-failed'
  | 'backup-failed';

export class MigrationError extends Error {
  readonly cause?: unknown;

  constructor(
    readonly code: MigrationErrorCode,
    message: string,
    readonly path: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'MigrationError';
    this.cause = cause;
  }
}

type IdFactory = () => string;
type Clock = () => string;

interface SelectedCandidate {
  candidate: MigrationCandidate;
  proposed: TaskNode;
}

type MigrationSelections = ReadonlyMap<string, TaskNode>;

function backupTimestamp(value: string): string {
  return value.replace(/[:.]/g, '-');
}

export class MigrationService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly vault: VaultProcessPort,
    private readonly settings: TaskMatrixCalendarSettings,
    private readonly makeId: IdFactory = createTaskId,
    private readonly now: Clock = () => new Date().toISOString(),
  ) {}

  listEligibleFiles(): string[] {
    const paths = new Map<string, string>();
    for (const path of this.vault.listMarkdownPaths()) {
      const normalized = normalizeVaultPath(path);
      if (!isManagedMarkdownPath(normalized, this.settings)) continue;
      const key = normalized.toLocaleLowerCase();
      if (!paths.has(key)) paths.set(key, normalized);
    }
    return [...paths.values()].sort((left, right) =>
      left.localeCompare(right, 'zh-CN-u-co-stroke'),
    );
  }

  async preview(paths: readonly string[] = []): Promise<MigrationPlan> {
    const eligible = new Map(
      this.listEligibleFiles().map((path) => [path.toLocaleLowerCase(), path]),
    );
    const selected = new Map<string, string>();
    for (const requested of paths) {
      const normalized = normalizeVaultPath(requested);
      const actual = eligible.get(normalized.toLocaleLowerCase());
      if (!actual) {
        throw new MigrationError(
          'invalid-source',
          '所选文件不在任务扫描目录内。',
          normalized,
        );
      }
      selected.set(actual.toLocaleLowerCase(), actual);
    }

    const files = new Map<string, MigrationCandidate[]>();
    const failures = new Map<string, string>();
    const sourceSnapshots = new Map<string, MigrationFileSnapshot>();
    for (const path of selected.values()) {
      try {
        const source = await this.vault.read(path);
        files.set(path, extractLegacyCandidates(path, source, this.makeId));
        sourceSnapshots.set(path, { source });
      } catch (error) {
        failures.set(path, error instanceof Error ? error.message : String(error));
      }
    }
    return { files, failures, sourceSnapshots, createdAt: this.now() };
  }

  async apply(plan: MigrationPlan, selections: MigrationSelections): Promise<void> {
    const selectedFiles: Array<[
      string,
      MigrationCandidate[],
      SelectedCandidate[],
    ]> = [];
    for (const [path, candidates] of plan.files) {
      const selected = candidates.flatMap((candidate): SelectedCandidate[] => {
        const correction = selections.get(candidate.candidateId);
        return correction
          ? [{ candidate, proposed: { ...correction, id: candidate.proposed.id } }]
          : [];
      });
      if (selected.length === 0) continue;
      selectedFiles.push([path, candidates, selected]);
    }
    for (const [path, , selected] of selectedFiles) {
      for (const { candidate, proposed } of selected) {
        const error = validateTaskDraft(proposed);
        if (error) {
          throw new MigrationError(
            'invalid-candidate',
            `${candidate.candidateId}：${error.message}`,
            path,
          );
        }
      }
    }
    for (const [path, candidates, selected] of selectedFiles) {
      await this.applyFile(
        path,
        candidates,
        selected,
        plan.sourceSnapshots.get(path),
        plan.createdAt,
      );
    }
  }

  private async applyFile(
    path: string,
    allCandidates: MigrationCandidate[],
    selected: SelectedCandidate[],
    previewSnapshot: MigrationFileSnapshot | undefined,
    createdAt: string,
  ): Promise<void> {
    const before = await this.vault.read(path);
    const backupPath = `${this.settings.backupRoot}/${backupTimestamp(createdAt)}/${path}`;
    try {
      await this.vault.create(backupPath, before);
    } catch (error) {
      throw new MigrationError('backup-failed', '创建迁移备份失败。', path, error);
    }

    if (!previewSnapshot || before !== previewSnapshot.source) {
      throw new MigrationError('stale-plan', '源文档已变化，请重新预览。', path);
    }

    let writeCompleted = false;
    try {
      await this.vault.process(path, (current) => {
        if (current !== before) {
          throw new MigrationError('stale-plan', '源文档已变化，请重新预览。', path);
        }
        const eol: '\n' | '\r\n' = current.includes('\r\n') ? '\r\n' : '\n';
        const lines = current.split(/\r\n|\n/);
        for (const selection of [...selected].sort(
          (a, b) => b.candidate.startLine - a.candidate.startLine,
        )) {
          const { candidate, proposed } = selection;
          const actual = lines.slice(candidate.startLine, candidate.endLine + 1).join(eol);
          if (actual !== candidate.originalText) {
            throw new MigrationError('stale-plan', '源文档已变化，请重新预览。', path);
          }
          lines.splice(
            candidate.startLine,
            candidate.endLine - candidate.startLine + 1,
            ...serializeTaskBlock(proposed, [], 0, eol).split(eol),
          );
        }
        return ensureSchemaMarker(lines.join(eol), eol);
      });
      writeCompleted = true;

      const verifiedSource = await this.vault.read(path);
      const verified = await this.repository.readAndParse(path);
      const selectedIds = new Set(selected.map((item) => item.proposed.id));
      const parsedIds = new Set(verified.tasks.map((item) => item.task.id));
      const unselected = allCandidates.filter(
        (item) => !selectedCandidateIdsFor(selected).has(item.candidateId),
      );
      const missingSelected = [...selectedIds].some((id) => !parsedIds.has(id));
      const changedUnselected = unselected.some((item) => !verifiedSource.includes(item.originalText));
      if (missingSelected || changedUnselected || verified.issues.length > 0) {
        throw new MigrationError('verification-failed', '迁移写入复核失败。', path);
      }
      await this.repository.refresh(path);
    } catch (error) {
      if (writeCompleted) await this.vault.process(path, () => before);
      if (error instanceof MigrationError) throw error;
      throw new MigrationError('verification-failed', '迁移失败，已恢复备份。', path, error);
    }
  }
}

function selectedCandidateIdsFor(selected: SelectedCandidate[]): Set<string> {
  return new Set(selected.map((item) => item.candidate.candidateId));
}
