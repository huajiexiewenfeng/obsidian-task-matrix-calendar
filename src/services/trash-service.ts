import { fingerprintTaskBlock } from '../markdown/fingerprint';
import { parseTaskFile } from '../markdown/task-parser';
import type { TaskIndex } from '../index/task-index';
import type { TaskRepository } from '../persistence/obsidian-task-repository';
import type { VaultProcessPort } from '../persistence/vault-port';
import type { TaskMatrixCalendarSettings } from '../settings';

const START_PREFIX = '<!-- task-matrix-trash-entry:start ';
const END_PREFIX = '<!-- task-matrix-trash-entry:end ';
const FIVE_MIB = 5 * 1024 * 1024;

export type TrashServiceErrorCode =
  | 'task-not-found'
  | 'trash-entry-not-found'
  | 'duplicate-id'
  | 'confirmation-required'
  | 'fingerprint-mismatch'
  | 'invalid-trash-entry';

export class TrashServiceError extends Error {
  constructor(
    readonly code: TrashServiceErrorCode,
    message: string,
    readonly taskId?: string,
  ) {
    super(message);
    this.name = 'TrashServiceError';
  }
}

interface TrashEntry {
  taskId: string;
  originalPath: string;
  deletedAt: string;
  block: string;
  startLine: number;
  endLine: number;
  eol: '\n' | '\r\n';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseEntries(source: string): TrashEntry[] {
  const eol: '\n' | '\r\n' = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r\n|\n/);
  const entries: TrashEntry[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const start = /^<!-- task-matrix-trash-entry:start (task-[0-9A-HJKMNP-TV-Z]+) -->$/.exec(
      lines[index],
    );
    if (!start) continue;
    const taskId = start[1];
    const endPattern = new RegExp(`^${escapeRegExp(END_PREFIX + taskId)} -->$`);
    const endLine = lines.findIndex((line, candidate) => candidate > index && endPattern.test(line));
    if (endLine < 0) continue;
    const originalPath = lines[index + 1]?.replace(/^原路径::\s*/, '') ?? '';
    const originalId = lines[index + 2]?.replace(/^原任务ID::\s*/, '') ?? '';
    const deletedAt = lines[index + 3]?.replace(/^删除时间::\s*/, '') ?? '';
    if (!originalPath || originalId !== taskId || !deletedAt) {
      index = endLine;
      continue;
    }
    entries.push({
      taskId,
      originalPath,
      deletedAt,
      block: lines.slice(index + 4, endLine).join(eol),
      startLine: index,
      endLine,
      eol,
    });
    index = endLine;
  }
  return entries;
}

function appendEntry(source: string, entry: string, eol: '\n' | '\r\n'): string {
  if (!source) return entry;
  if (source.endsWith(`${eol}${eol}`)) return `${source}${entry}`;
  if (source.endsWith(eol)) return `${source}${eol}${entry}`;
  return `${source}${eol}${eol}${entry}`;
}

function rawBlock(source: string, startLine: number, endLine: number): string {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return source.split(/\r\n|\n/).slice(startLine, endLine + 1).join(eol);
}

export class TrashService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly index: TaskIndex,
    private readonly vault: VaultProcessPort,
    private readonly settings: TaskMatrixCalendarSettings,
  ) {}

  async moveToTrash(taskId: string, deletedAt: string): Promise<void> {
    const indexed = this.index.get(taskId);
    if (!indexed) throw new TrashServiceError('task-not-found', `找不到任务：${taskId}`, taskId);
    if (indexed.task.parentId) {
      throw new TrashServiceError('invalid-trash-entry', '请通过父任务管理子任务。', taskId);
    }

    const source = await this.vault.read(indexed.location.sourcePath);
    const block = rawBlock(source, indexed.location.startLine, indexed.location.endLine);
    if (fingerprintTaskBlock(block) !== indexed.location.fingerprint) {
      throw new TrashServiceError('fingerprint-mismatch', '任务已被外部修改。', taskId);
    }

    await this.ensureTrashFile();
    const trashSource = await this.vault.read(this.settings.trashPath);
    const eol: '\n' | '\r\n' = trashSource.includes('\r\n') ? '\r\n' : indexed.location.eol;
    const entry = [
      `${START_PREFIX}${taskId} -->`,
      `原路径:: ${indexed.location.sourcePath}`,
      `原任务ID:: ${taskId}`,
      `删除时间:: ${deletedAt}`,
      block,
      `${END_PREFIX}${taskId} -->`,
    ].join(eol);

    await this.vault.process(this.settings.trashPath, (current) => appendEntry(current, entry, eol));
    try {
      await this.repository.remove(indexed);
    } catch (error) {
      await this.removeEntry(taskId);
      throw error;
    }
    await this.repository.refresh(indexed.location.sourcePath);
  }

  async restore(taskId: string): Promise<{ restoredPath: string }> {
    if (this.index.get(taskId)) {
      throw new TrashServiceError('duplicate-id', `活动任务中已存在 ID：${taskId}`, taskId);
    }
    const entry = await this.requiredEntry(taskId);
    const parsed = parseTaskFile(entry.originalPath, entry.block);
    const parent = parsed.tasks.find((item) => item.task.id === taskId && !item.task.parentId);
    if (!parent) {
      throw new TrashServiceError('invalid-trash-entry', '回收站任务块无法解析。', taskId);
    }
    const children = parsed.tasks
      .filter((item) => item.task.parentId === taskId)
      .map((item) => item.task);
    const targetPath = this.vault.exists(entry.originalPath)
      ? entry.originalPath
      : this.settings.inboxPath;

    await this.repository.append(targetPath, parent.task, children);
    try {
      await this.removeEntry(taskId);
    } catch (error) {
      const target = await this.repository.readAndParse(targetPath);
      const appended = target.tasks.find((item) => item.task.id === taskId);
      if (appended) await this.repository.remove(appended);
      throw error;
    }
    await this.repository.refresh(targetPath);
    return { restoredPath: targetPath };
  }

  async permanentlyDelete(taskId: string, confirmation: 'DELETE'): Promise<void> {
    if (confirmation !== 'DELETE') {
      throw new TrashServiceError('confirmation-required', '永久删除需要输入 DELETE。', taskId);
    }
    await this.requiredEntry(taskId);
    await this.removeEntry(taskId);
  }

  async getStats(): Promise<{ entries: number; bytes: number; warn: boolean }> {
    if (!this.vault.exists(this.settings.trashPath)) {
      return { entries: 0, bytes: 0, warn: false };
    }
    const source = await this.vault.read(this.settings.trashPath);
    const bytes = new TextEncoder().encode(source).byteLength;
    return { entries: parseEntries(source).length, bytes, warn: bytes > FIVE_MIB };
  }

  async emptyTrash(confirmation: 'EMPTY TRASH'): Promise<void> {
    if (confirmation !== 'EMPTY TRASH') {
      throw new TrashServiceError('confirmation-required', '清空回收站需要输入 EMPTY TRASH。');
    }
    if (!this.vault.exists(this.settings.trashPath)) return;
    await this.vault.process(this.settings.trashPath, () => '');
  }

  private async ensureTrashFile(): Promise<void> {
    if (!this.vault.exists(this.settings.trashPath)) {
      await this.vault.create(this.settings.trashPath, '');
    }
  }

  private async requiredEntry(taskId: string): Promise<TrashEntry> {
    if (!this.vault.exists(this.settings.trashPath)) {
      throw new TrashServiceError('trash-entry-not-found', `回收站中找不到任务：${taskId}`, taskId);
    }
    const entry = parseEntries(await this.vault.read(this.settings.trashPath)).find(
      (item) => item.taskId === taskId,
    );
    if (!entry) {
      throw new TrashServiceError('trash-entry-not-found', `回收站中找不到任务：${taskId}`, taskId);
    }
    return entry;
  }

  private async removeEntry(taskId: string): Promise<void> {
    await this.vault.process(this.settings.trashPath, (source) => {
      const entry = parseEntries(source).find((item) => item.taskId === taskId);
      if (!entry) {
        throw new TrashServiceError('trash-entry-not-found', `回收站中找不到任务：${taskId}`, taskId);
      }
      const lines = source.split(/\r\n|\n/);
      lines.splice(entry.startLine, entry.endLine - entry.startLine + 1);
      while (lines[entry.startLine] === '' && lines[entry.startLine - 1] === '') {
        lines.splice(entry.startLine, 1);
      }
      return lines.join(entry.eol).replace(/(?:\r?\n){2}$/, entry.eol);
    });
  }
}
