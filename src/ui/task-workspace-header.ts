import type { TaskWorkspaceMode } from './task-workspace-view';

export interface TaskWorkspaceSummary {
  active: number;
  dueRisk: number;
  unclassified: number;
}

export interface TaskWorkspaceHeaderOptions {
  mode: TaskWorkspaceMode;
  importing: boolean;
  summary: TaskWorkspaceSummary;
  onCreate(): void;
  onImport(): void;
  onModeChange(mode: TaskWorkspaceMode): void;
}

function action(label: string, name: string, callback: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = name;
  button.textContent = label;
  button.addEventListener('click', callback);
  return button;
}

export function renderTaskWorkspaceHeader(options: TaskWorkspaceHeaderOptions): HTMLElement {
  const header = document.createElement('header');
  header.className = 'tmc-workspace-header';

  const copy = document.createElement('div');
  copy.className = 'tmc-workspace-heading';
  const heading = document.createElement('h2');
  heading.textContent = '任务中心';
  const summary = document.createElement('p');
  summary.dataset.role = 'workspace-summary';
  summary.textContent = `${options.summary.active} 个活动任务 · ${options.summary.dueRisk} 个临近截止 · ${options.summary.unclassified} 个待分类`;
  copy.append(heading, summary);

  const actions = document.createElement('div');
  actions.className = 'tmc-workspace-actions';
  actions.dataset.role = 'workspace-primary';
  const importButton = action('导入旧任务', 'import-legacy', options.onImport);
  importButton.disabled = options.importing;
  const createButton = action('+ 新任务', 'new-task', options.onCreate);
  createButton.classList.add('mod-cta');
  actions.append(importButton, createButton);

  const modes = document.createElement('div');
  modes.className = 'tmc-workspace-modes';
  modes.dataset.role = 'workspace-modes';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '任务中心模式');
  for (const [mode, label] of [['tasks', '任务'], ['calendar', '日历']] as const) {
    const button = action(label, '', () => options.onModeChange(mode));
    delete button.dataset.action;
    button.dataset.mode = mode;
    button.setAttribute('aria-pressed', String(options.mode === mode));
    modes.append(button);
  }

  header.append(copy, modes, actions);
  return header;
}
