import { makeTask, type LegacyPriority, type TaskNode, type TaskStatus } from '../domain/task';
import { createTaskId } from '../domain/id';
import { ensureSchemaMarker, serializeTaskBlock } from '../markdown/task-serializer';
import type { TaskRepository } from '../persistence/obsidian-task-repository';
import type { VaultProcessPort } from '../persistence/vault-port';
import type { TaskMatrixCalendarSettings } from '../settings';

export type MigrationConfidence = 'high' | 'medium' | 'low';

export interface MigrationCandidate {
  candidateId: string;
  sourcePath: string;
  startLine: number;
  endLine: number;
  originalText: string;
  proposed: TaskNode;
  confidence: MigrationConfidence;
}

export interface MigrationPlan {
  files: Map<string, MigrationCandidate[]>;
  createdAt: string;
}

export type MigrationErrorCode = 'stale-plan' | 'verification-failed' | 'backup-failed';

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

interface DateHeading {
  date: string;
}

const STATUS_MARKERS: Array<[RegExp, TaskStatus]> = [
  [/（完成）|\(完成\)/, 'done'],
  [/（进行中）|\(进行中\)/, 'in-progress'],
  [/（暂停）|\(暂停\)/, 'paused'],
];

function headingDate(line: string): DateHeading | null {
  const dashed = /^#{1,6}\s+(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(line);
  if (dashed) {
    return {
      date: `${dashed[1]}-${dashed[2].padStart(2, '0')}-${dashed[3].padStart(2, '0')}`,
    };
  }
  const compact = /^#{1,6}\s+(\d{4})(\d{2})(\d{2})\s*$/.exec(line);
  return compact ? { date: `${compact[1]}-${compact[2]}-${compact[3]}` } : null;
}

function statusFromLine(line: string, checkbox?: string): TaskStatus {
  if (checkbox?.toLowerCase() === 'x') return 'done';
  for (const [pattern, status] of STATUS_MARKERS) {
    if (pattern.test(line)) return status;
  }
  return 'todo';
}

function legacyPriority(line: string): LegacyPriority | undefined {
  return /\b(P[0-4])\b/.exec(line)?.[1] as LegacyPriority | undefined;
}

function cleanTitle(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]\s+\[[ xX]\]|[-*+]|\d+[.)])\s+/, '')
    .replace(/（(?:完成|进行中|暂停)）|\((?:完成|进行中|暂停)\)/g, '')
    .replace(/\s*\bP[0-4]\b\s*/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function candidateConfidence(line: string): MigrationConfidence | null {
  if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line) || STATUS_MARKERS.some(([pattern]) => pattern.test(line))) {
    return 'high';
  }
  if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) return 'medium';
  if (/\bP[0-4]\b/.test(line)) return 'low';
  return null;
}

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

  async preview(paths: string[]): Promise<MigrationPlan> {
    const files = new Map<string, MigrationCandidate[]>();
    for (const path of [...new Set(paths)]) {
      const source = await this.vault.read(path);
      const lines = source.split(/\r\n|\n/);
      const candidates: MigrationCandidate[] = [];
      let activeDate: string | undefined;
      for (let line = 0; line < lines.length; line += 1) {
        const heading = headingDate(lines[line]);
        if (heading) {
          activeDate = heading.date;
          continue;
        }
        if (!activeDate || !lines[line].trim()) continue;
        const confidence = candidateConfidence(lines[line]);
        if (!confidence) continue;
        const checkbox = /^\s*[-*+]\s+\[([ xX])\]/.exec(lines[line])?.[1];
        const title = cleanTitle(lines[line]);
        if (!title) continue;
        candidates.push({
          candidateId: `migration:${path}:${line}`,
          sourcePath: path,
          startLine: line,
          endLine: line,
          originalText: lines[line],
          proposed: makeTask({
            id: this.makeId(),
            title,
            status: statusFromLine(lines[line], checkbox),
            quadrant: 'unclassified',
            plannedDate: activeDate,
            legacyPriority: legacyPriority(lines[line]),
          }),
          confidence,
        });
      }
      files.set(path, candidates);
    }
    return { files, createdAt: this.now() };
  }

  async apply(plan: MigrationPlan, selectedCandidateIds: Set<string>): Promise<void> {
    for (const [path, candidates] of plan.files) {
      const selected = candidates.filter((item) => selectedCandidateIds.has(item.candidateId));
      if (selected.length === 0) continue;
      await this.applyFile(path, candidates, selected, plan.createdAt);
    }
  }

  private async applyFile(
    path: string,
    allCandidates: MigrationCandidate[],
    selected: MigrationCandidate[],
    createdAt: string,
  ): Promise<void> {
    const before = await this.vault.read(path);
    const backupPath = `${this.settings.backupRoot}/${backupTimestamp(createdAt)}/${path}`;
    try {
      await this.vault.create(backupPath, before);
    } catch (error) {
      throw new MigrationError('backup-failed', '创建迁移备份失败。', path, error);
    }

    try {
      await this.vault.process(path, (current) => {
        const eol: '\n' | '\r\n' = current.includes('\r\n') ? '\r\n' : '\n';
        const lines = current.split(/\r\n|\n/);
        for (const candidate of [...selected].sort((a, b) => b.startLine - a.startLine)) {
          const actual = lines.slice(candidate.startLine, candidate.endLine + 1).join(eol);
          if (actual !== candidate.originalText) {
            throw new MigrationError('stale-plan', '源文档已变化，请重新预览。', path);
          }
          lines.splice(
            candidate.startLine,
            candidate.endLine - candidate.startLine + 1,
            ...serializeTaskBlock(candidate.proposed, [], 0, eol).split(eol),
          );
        }
        return ensureSchemaMarker(lines.join(eol), eol);
      });

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
      await this.vault.process(path, () => before);
      if (error instanceof MigrationError) throw error;
      throw new MigrationError('verification-failed', '迁移失败，已恢复备份。', path, error);
    }
  }
}

function selectedCandidateIdsFor(selected: MigrationCandidate[]): Set<string> {
  return new Set(selected.map((item) => item.candidateId));
}
