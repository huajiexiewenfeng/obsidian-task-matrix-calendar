import { classifyDateRisk } from '../domain/dates';
import type { IndexedTask, TaskFilters } from '../domain/task';
import type { ParseIssue, ParseResult, ParsedTask } from '../markdown/task-parser';

export interface IndexSnapshot {
  tasks: IndexedTask[];
  issues: ParseIssue[];
  revision: number;
}

type IndexListener = (snapshot: IndexSnapshot) => void;

function hasValues<T>(values: readonly T[] | undefined): values is readonly T[] {
  return Boolean(values && values.length > 0);
}

export class TaskIndex {
  private readonly files = new Map<string, ParseResult>();
  private readonly listeners = new Set<IndexListener>();
  private tasks: ParsedTask[] = [];
  private issues: ParseIssue[] = [];
  private tasksById = new Map<string, ParsedTask[]>();
  private revision = 0;

  replaceFile(path: string, result: ParseResult): void {
    this.files.set(path, result);
    this.rebuild();
  }

  removeFile(path: string): void {
    this.files.delete(path);
    this.rebuild();
  }

  get(id: string): IndexedTask | undefined {
    const matches = this.tasksById.get(id);
    return matches?.length === 1 ? matches[0] : undefined;
  }

  childrenOf(parentId: string): IndexedTask[] {
    return this.tasks.filter((item) => item.task.parentId === parentId);
  }

  query(
    filters: TaskFilters,
    today: string,
    dueSoonDays: number,
  ): IndexedTask[] {
    const query = filters.query?.trim().toLocaleLowerCase();
    return this.tasks.filter((item) => {
      const { task, location } = item;
      if (query) {
        const searchable = [task.title, task.project ?? '', ...task.tags]
          .join('\n')
          .toLocaleLowerCase();
        if (!searchable.includes(query)) return false;
      }
      if (hasValues(filters.quadrants) && !filters.quadrants.includes(task.quadrant)) return false;
      if (hasValues(filters.statuses) && !filters.statuses.includes(task.status)) return false;
      if (hasValues(filters.projects) && !task.project) return false;
      if (hasValues(filters.projects) && !filters.projects.includes(task.project as string)) return false;
      if (hasValues(filters.tags) && !filters.tags.every((tag) => task.tags.includes(tag))) return false;
      if (hasValues(filters.sourcePaths) && !filters.sourcePaths.includes(location.sourcePath)) return false;
      if (hasValues(filters.risks)) {
        const risk = classifyDateRisk(task.dueDate, task.status, today, dueSoonDays);
        if (!filters.risks.includes(risk)) return false;
      }
      return true;
    });
  }

  snapshot(): IndexSnapshot {
    return {
      tasks: [...this.tasks],
      issues: [...this.issues],
      revision: this.revision,
    };
  }

  subscribe(listener: IndexListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private rebuild(): void {
    const tasks: ParsedTask[] = [];
    const issues: ParseIssue[] = [];
    for (const result of this.files.values()) {
      tasks.push(...result.tasks.map((item) => ({ ...item })));
      issues.push(...result.issues);
    }

    const tasksById = new Map<string, ParsedTask[]>();
    for (const task of tasks) {
      const matches = tasksById.get(task.task.id) ?? [];
      matches.push(task);
      tasksById.set(task.task.id, matches);
    }

    for (const [id, duplicates] of tasksById) {
      if (duplicates.length < 2) continue;
      for (const duplicate of duplicates) {
        duplicate.readOnly = true;
        issues.push({
          code: 'duplicate-id',
          path: duplicate.location.sourcePath,
          line: duplicate.location.startLine,
          taskId: id,
          message: `任务 ID ${id} 在插件管理范围内重复。`,
        });
      }
    }

    this.tasks = tasks;
    this.issues = issues;
    this.tasksById = tasksById;
    this.revision += 1;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
