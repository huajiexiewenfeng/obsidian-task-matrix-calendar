import type { IndexedTask, TaskNode } from '../domain/task';
import { TaskIndex } from '../index/task-index';
import { removeTaskBlock, replaceTaskBlock } from '../markdown/task-patch';
import { parseTaskFile, type ParseResult, type ParsedTask } from '../markdown/task-parser';
import { ensureSchemaMarker, serializeTaskBlock } from '../markdown/task-serializer';
import type { VaultProcessPort } from './vault-port';

export type TaskWriteErrorCode =
  | 'task-location-invalid'
  | 'fingerprint-mismatch'
  | 'read-only-task'
  | 'duplicate-id'
  | 'write-failed'
  | 'rollback-failed';

export class TaskWriteError extends Error {
  readonly cause?: unknown;

  constructor(
    readonly code: TaskWriteErrorCode,
    readonly path: string,
    readonly taskId: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'TaskWriteError';
    this.cause = options?.cause;
  }
}

export interface TaskWriteOptions {
  intent?: 'checkbox-intent';
}

export interface TaskRepository {
  readAndParse(path: string): Promise<ParseResult>;
  append(path: string, task: TaskNode, children: TaskNode[]): Promise<void>;
  replace(
    indexed: IndexedTask,
    task: TaskNode,
    children: TaskNode[],
    options?: TaskWriteOptions,
  ): Promise<void>;
  remove(indexed: IndexedTask): Promise<string>;
  move(indexed: IndexedTask, targetPath: string): Promise<void>;
  refresh(path: string): Promise<void>;
}

function appendBlock(source: string, block: string, eol: '\n' | '\r\n'): string {
  const marked = ensureSchemaMarker(source, eol);
  if (!marked) return block;
  if (marked.endsWith(`${eol}${eol}`)) return `${marked}${block}`;
  if (marked.endsWith(eol)) return `${marked}${eol}${block}`;
  return `${marked}${eol}${eol}${block}`;
}

function blockText(source: string, indexed: IndexedTask): string {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return source
    .split(/\r\n|\n/)
    .slice(indexed.location.startLine, indexed.location.endLine + 1)
    .join(eol);
}

export class ObsidianTaskRepository implements TaskRepository {
  constructor(
    private readonly vault: VaultProcessPort,
    private readonly index: TaskIndex,
  ) {}

  async readAndParse(path: string): Promise<ParseResult> {
    return parseTaskFile(path, await this.vault.read(path));
  }

  async append(path: string, task: TaskNode, children: TaskNode[]): Promise<void> {
    if (!this.vault.exists(path)) {
      await this.vault.create(path, '');
    }
    try {
      await this.vault.process(path, (source) => {
        const current = parseTaskFile(path, source);
        if (current.tasks.some((item) => item.task.id === task.id)) {
          throw new TaskWriteError('duplicate-id', path, task.id, `任务 ID ${task.id} 已存在。`);
        }
        const block = serializeTaskBlock(task, children, 0, current.eol);
        return appendBlock(source, block, current.eol);
      });
    } catch (error) {
      throw this.asWriteError(error, path, task.id);
    }
  }

  async replace(
    indexed: IndexedTask,
    task: TaskNode,
    children: TaskNode[],
    options: TaskWriteOptions = {},
  ): Promise<void> {
    const parsed = indexed as ParsedTask;
    if (parsed.readOnly && options.intent !== 'checkbox-intent') {
      throw new TaskWriteError(
        'read-only-task',
        indexed.location.sourcePath,
        indexed.task.id,
        '任务包含格式问题，不能从界面覆盖。',
      );
    }
    const path = indexed.location.sourcePath;
    try {
      await this.vault.process(path, (source) => {
        const replacement = serializeTaskBlock(task, children, indexed.location.indent, indexed.location.eol);
        const result = replaceTaskBlock(source, indexed, replacement);
        if (!result.ok) {
          throw new TaskWriteError(result.code, path, task.id, '任务已被外部修改，请刷新后重试。');
        }
        return result.source;
      });
    } catch (error) {
      throw this.asWriteError(error, path, task.id);
    }
  }

  async remove(indexed: IndexedTask): Promise<string> {
    const path = indexed.location.sourcePath;
    let removed = '';
    try {
      await this.vault.process(path, (source) => {
        const result = removeTaskBlock(source, indexed);
        if (!result.ok) {
          throw new TaskWriteError(
            result.code,
            path,
            indexed.task.id,
            '任务已被外部修改，请刷新后重试。',
          );
        }
        removed = blockText(source, indexed);
        return result.source;
      });
      return removed;
    } catch (error) {
      throw this.asWriteError(error, path, indexed.task.id);
    }
  }

  async move(indexed: IndexedTask, targetPath: string): Promise<void> {
    const sourcePath = indexed.location.sourcePath;
    if (sourcePath === targetPath) return;

    const latestSource = await this.readAndParse(sourcePath);
    const latest = latestSource.tasks.find(
      (item) => item.task.id === indexed.task.id && item.location.fingerprint === indexed.location.fingerprint,
    );
    if (!latest) {
      throw new TaskWriteError(
        'fingerprint-mismatch',
        sourcePath,
        indexed.task.id,
        '任务已被外部修改，请刷新后重试。',
      );
    }
    const children = latestSource.tasks
      .filter((item) => item.task.parentId === latest.task.id)
      .map((item) => item.task);

    await this.append(targetPath, latest.task, children);
    try {
      await this.remove(latest);
    } catch (sourceError) {
      try {
        const target = await this.readAndParse(targetPath);
        const appended = target.tasks.find((item) => item.task.id === latest.task.id);
        if (!appended) throw new Error('Appended target block is missing.');
        await this.remove(appended);
      } catch (rollbackError) {
        throw new TaskWriteError(
          'rollback-failed',
          targetPath,
          latest.task.id,
          '源文件删除失败，且目标文件回滚失败。',
          { cause: new AggregateError([sourceError, rollbackError]) },
        );
      }
      throw this.asWriteError(sourceError, sourcePath, latest.task.id);
    }
  }

  async refresh(path: string): Promise<void> {
    if (!this.vault.exists(path)) {
      this.index.removeFile(path);
      return;
    }
    this.index.replaceFile(path, await this.readAndParse(path));
  }

  private asWriteError(error: unknown, path: string, taskId: string): TaskWriteError {
    if (error instanceof TaskWriteError) return error;
    return new TaskWriteError('write-failed', path, taskId, '写入任务文件失败。', {
      cause: error,
    });
  }
}
