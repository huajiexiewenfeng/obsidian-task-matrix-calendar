import type {
  DateRisk,
  IndexedTask,
  TaskFilters,
  TaskStatus,
} from '../domain/task';

export type StatusFilter = '*' | 'active' | TaskStatus;
export type RiskFilter = '*' | DateRisk;

export interface TaskWorkspaceFilterState {
  query: string;
  project: '*' | string;
  status: StatusFilter;
  risk: RiskFilter;
  sourcePath: '*' | string;
}

export const DEFAULT_FILTER_STATE: TaskWorkspaceFilterState = {
  query: '',
  project: '*',
  status: 'active',
  risk: '*',
  sourcePath: '*',
};

export function toTaskFilters(state: TaskWorkspaceFilterState): TaskFilters {
  return {
    ...(state.query.trim() ? { query: state.query } : {}),
    ...(state.project !== '*' ? { projects: [state.project] } : {}),
    ...(state.status === 'active'
      ? { statuses: ['todo', 'in-progress', 'paused'] as TaskStatus[] }
      : state.status !== '*' ? { statuses: [state.status] } : {}),
    ...(state.risk !== '*' ? { risks: [state.risk] } : {}),
    ...(state.sourcePath !== '*' ? { sourcePaths: [state.sourcePath] } : {}),
  };
}

export function deriveFilterOptions(tasks: readonly IndexedTask[]): {
  projects: string[];
  sourcePaths: string[];
} {
  const projects = new Set<string>();
  const sourcePaths = new Set<string>();

  for (const { task, location } of tasks) {
    if (task.project) projects.add(task.project);
    sourcePaths.add(location.sourcePath);
  }

  return {
    projects: [...projects].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    sourcePaths: [...sourcePaths].sort((left, right) => left.localeCompare(right, 'zh-CN')),
  };
}
