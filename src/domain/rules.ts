import type { TaskNode, TaskStatus } from './task';

export type TaskRuleErrorCode =
  | 'classification-required'
  | 'invalid-transition'
  | 'unfinished-children';

export interface TaskRuleError {
  code: TaskRuleErrorCode;
  message: string;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  'in-progress': '进行中',
  paused: '暂停',
  done: '已完成',
};

const TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  todo: new Set(['in-progress', 'done']),
  'in-progress': new Set(['paused', 'done', 'todo']),
  paused: new Set(['in-progress', 'done', 'todo']),
  done: new Set(['todo']),
};

export function validateTransition(task: TaskNode, target: TaskStatus): TaskRuleError | null {
  if (!TRANSITIONS[task.status].has(target)) {
    return {
      code: 'invalid-transition',
      message: `不能从${STATUS_LABELS[task.status]}切换到${STATUS_LABELS[target]}。`,
    };
  }

  if (
    task.status === 'todo' &&
    (target === 'in-progress' || target === 'done') &&
    task.quadrant === 'unclassified'
  ) {
    return {
      code: 'classification-required',
      message: '任务进入进行中或完成前必须选择四象限分类。',
    };
  }

  return null;
}

export function validateParentCompletion(
  parent: TaskNode,
  children: readonly TaskNode[],
): TaskRuleError | null {
  const hasUnfinishedChild = children.some(
    (child) => child.parentId === parent.id && child.status !== 'done',
  );
  if (!hasUnfinishedChild) {
    return null;
  }

  return {
    code: 'unfinished-children',
    message: '所有子任务完成后才能完成父任务。',
  };
}
