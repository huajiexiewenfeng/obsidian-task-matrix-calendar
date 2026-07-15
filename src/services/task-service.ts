import { isValidIsoDate } from '../domain/dates';
import { createTaskId } from '../domain/id';
import { validateParentCompletion, validateTransition, type TaskRuleErrorCode } from '../domain/rules';
import {
  makeTask,
  type IndexedTask,
  type TaskNode,
  type TaskQuadrant,
  type TaskStatus,
} from '../domain/task';
import { TaskIndex } from '../index/task-index';
import type { TaskRepository } from '../persistence/obsidian-task-repository';
import type { TaskMatrixCalendarSettings } from '../settings';

export type TaskCommandErrorCode =
  | TaskRuleErrorCode
  | 'task-not-found'
  | 'invalid-title'
  | 'invalid-date'
  | 'child-move-not-supported'
  | 'parent-not-found';

export class TaskCommandError extends Error {
  constructor(
    readonly code: TaskCommandErrorCode,
    message: string,
    readonly taskId?: string,
  ) {
    super(message);
    this.name = 'TaskCommandError';
  }
}

export interface CreateTaskInput {
  title: string;
  details?: string;
  sourcePath?: string;
  parentId?: string;
  quadrant?: TaskQuadrant;
  project?: string;
  tags?: string[];
  plannedDate?: string;
  dueDate?: string;
}

type IdFactory = () => string;

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeDetails(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/\r\n?/g, '\n');
  return normalized.trim().length > 0 ? normalized : undefined;
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function validateDate(value: string | undefined): void {
  if (value && !isValidIsoDate(value)) {
    throw new TaskCommandError('invalid-date', `日期必须是有效的 YYYY-MM-DD：${value}`);
  }
}

export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly index: TaskIndex,
    private readonly settings: TaskMatrixCalendarSettings,
    private readonly makeId: IdFactory = createTaskId,
  ) {}

  async create(input: CreateTaskInput): Promise<TaskNode> {
    const title = normalizeTitle(input.title);
    if (!title) throw new TaskCommandError('invalid-title', '任务标题不能为空。');
    validateDate(input.plannedDate);
    validateDate(input.dueDate);

    if (input.parentId) {
      const parent = this.required(input.parentId);
      const child = makeTask({
        id: this.makeId(),
        title,
        details: normalizeDetails(input.details),
        parentId: parent.task.id,
        quadrant: parent.task.quadrant,
        project: parent.task.project,
        tags: [...parent.task.tags],
      });
      const children = this.index.childrenOf(parent.task.id).map((item) => item.task);
      const updatedParent = {
        ...parent.task,
        childrenIds: [...parent.task.childrenIds, child.id],
      };
      await this.repository.replace(parent, updatedParent, [...children, child]);
      await this.repository.refresh(parent.location.sourcePath);
      return child;
    }

    const task = makeTask({
      id: this.makeId(),
      title,
      details: normalizeDetails(input.details),
      quadrant: input.quadrant,
      project: normalizeOptional(input.project),
      tags: normalizeTags(input.tags ?? []),
      plannedDate: input.plannedDate,
      dueDate: input.dueDate,
    });
    const path = input.sourcePath ?? this.settings.inboxPath;
    await this.repository.append(path, task, []);
    await this.repository.refresh(path);
    return task;
  }

  async update(
    id: string,
    patch: Partial<Omit<TaskNode, 'id' | 'childrenIds'>>,
  ): Promise<void> {
    const indexed = this.required(id);
    if (patch.parentId !== undefined && patch.parentId !== indexed.task.parentId) {
      throw new TaskCommandError('child-move-not-supported', '不能通过编辑改变任务的父级。', id);
    }
    const updated: TaskNode = {
      ...indexed.task,
      ...patch,
      title: patch.title === undefined ? indexed.task.title : normalizeTitle(patch.title),
      details:
        patch.details === undefined ? indexed.task.details : normalizeDetails(patch.details),
      project:
        patch.project === undefined ? indexed.task.project : normalizeOptional(patch.project),
      tags: patch.tags === undefined ? indexed.task.tags : normalizeTags(patch.tags),
      plannedDate:
        patch.plannedDate === undefined ? indexed.task.plannedDate : patch.plannedDate || undefined,
      dueDate: patch.dueDate === undefined ? indexed.task.dueDate : patch.dueDate || undefined,
      childrenIds: indexed.task.childrenIds,
    };
    if (!updated.title) throw new TaskCommandError('invalid-title', '任务标题不能为空。', id);
    validateDate(updated.plannedDate);
    validateDate(updated.dueDate);

    if (updated.status !== indexed.task.status) {
      this.assertTransition({ ...updated, status: indexed.task.status }, updated.status);
    }
    if (updated.status !== 'todo' && updated.quadrant === 'unclassified') {
      throw new TaskCommandError(
        'classification-required',
        '任务进入进行中或完成前必须选择四象限分类。',
        id,
      );
    }
    if (updated.status !== indexed.task.status) {
      if (updated.status === 'done') this.assertParentGate(updated);
    }
    await this.persist(indexed, updated);
  }

  async transition(
    id: string,
    target: TaskStatus,
  ): Promise<{ promptParentCompletion?: string }> {
    const indexed = this.required(id);
    this.assertTransition(indexed.task, target);
    const updated = { ...indexed.task, status: target };
    if (target === 'done') this.assertParentGate(updated);
    await this.persist(indexed, updated);

    if (target === 'done' && updated.parentId) {
      const siblings = this.index.childrenOf(updated.parentId);
      const parent = this.index.get(updated.parentId);
      if (parent && parent.task.status !== 'done' && siblings.every((item) => item.task.status === 'done')) {
        return { promptParentCompletion: parent.task.id };
      }
    }
    return {};
  }

  async complete(
    id: string,
    quadrantIfRequired?: Exclude<TaskQuadrant, 'unclassified'>,
  ): Promise<void> {
    const indexed = this.required(id);
    const quadrant =
      indexed.task.quadrant === 'unclassified' ? quadrantIfRequired : indexed.task.quadrant;
    if (!quadrant) {
      throw new TaskCommandError(
        'classification-required',
        '任务完成前必须选择四象限分类。',
        id,
      );
    }
    const updated = { ...indexed.task, quadrant, status: 'done' as const };
    this.assertTransition({ ...indexed.task, quadrant }, 'done');
    this.assertParentGate(updated);
    await this.persist(indexed, updated);
  }

  async changeQuadrant(id: string, quadrant: TaskQuadrant): Promise<void> {
    const indexed = this.required(id);
    await this.persist(indexed, { ...indexed.task, quadrant });
  }

  async changePlannedDate(id: string, plannedDate?: string): Promise<void> {
    validateDate(plannedDate);
    const indexed = this.required(id);
    await this.persist(indexed, { ...indexed.task, plannedDate });
  }

  async moveToFile(id: string, targetPath: string): Promise<void> {
    const indexed = this.required(id);
    if (indexed.task.parentId) {
      throw new TaskCommandError(
        'child-move-not-supported',
        '子任务不能脱离父任务单独移动。',
        id,
      );
    }
    const sourcePath = indexed.location.sourcePath;
    await this.repository.move(indexed, targetPath);
    await this.repository.refresh(sourcePath);
    await this.repository.refresh(targetPath);
  }

  private required(id: string): IndexedTask {
    const indexed = this.index.get(id);
    if (!indexed) throw new TaskCommandError('task-not-found', `找不到任务：${id}`, id);
    return indexed;
  }

  private async persist(indexed: IndexedTask, task: TaskNode): Promise<void> {
    const children = task.parentId
      ? []
      : this.index.childrenOf(task.id).map((item) => item.task);
    await this.repository.replace(indexed, task, children);
    await this.repository.refresh(indexed.location.sourcePath);
  }

  private assertTransition(task: TaskNode, target: TaskStatus): void {
    const error = validateTransition(task, target);
    if (error) throw new TaskCommandError(error.code, error.message, task.id);
  }

  private assertParentGate(task: TaskNode): void {
    if (task.childrenIds.length === 0) return;
    const error = validateParentCompletion(
      task,
      this.index.childrenOf(task.id).map((item) => item.task),
    );
    if (error) throw new TaskCommandError(error.code, error.message, task.id);
  }
}
