export type TaskStatus = 'todo' | 'in-progress' | 'paused' | 'done';

export type TaskQuadrant =
  | 'unclassified'
  | 'important-urgent'
  | 'important-not-urgent'
  | 'not-important-urgent'
  | 'not-important-not-urgent';

export type LegacyPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type DateRisk = 'none' | 'upcoming' | 'due-today' | 'overdue';

export interface TaskNode {
  id: string;
  title: string;
  details?: string;
  status: TaskStatus;
  quadrant: TaskQuadrant;
  sortOrder?: number;
  plannedDate?: string;
  dueDate?: string;
  project?: string;
  tags: string[];
  legacyPriority?: LegacyPriority;
  parentId?: string;
  childrenIds: string[];
}

export interface TaskLocation {
  sourcePath: string;
  startLine: number;
  endLine: number;
  indent: number;
  eol: '\n' | '\r\n';
  fingerprint: string;
}

export interface IndexedTask {
  task: TaskNode;
  location: TaskLocation;
}

export function compareTaskOrder(left: IndexedTask, right: IndexedTask): number {
  const leftOrder = left.task.sortOrder;
  const rightOrder = right.task.sortOrder;
  if (leftOrder === undefined && rightOrder === undefined) return 0;
  if (leftOrder === undefined) return 1;
  if (rightOrder === undefined) return -1;
  return leftOrder - rightOrder;
}

export interface TaskFilters {
  query?: string;
  quadrants?: TaskQuadrant[];
  statuses?: TaskStatus[];
  projects?: string[];
  tags?: string[];
  sourcePaths?: string[];
  risks?: DateRisk[];
}

export function makeTask(input: Pick<TaskNode, 'id' | 'title'> & Partial<TaskNode>): TaskNode {
  return {
    id: input.id,
    title: input.title,
    details: input.details,
    status: input.status ?? 'todo',
    quadrant: input.quadrant ?? 'unclassified',
    sortOrder: input.sortOrder,
    tags: input.tags ?? [],
    childrenIds: input.childrenIds ?? [],
    plannedDate: input.plannedDate,
    dueDate: input.dueDate,
    project: input.project,
    legacyPriority: input.legacyPriority,
    parentId: input.parentId,
  };
}
