import type { TaskWorkspaceMode } from './task-workspace-view';

export interface TaskWorkspaceHeaderOptions {
  mode: TaskWorkspaceMode;
  importing: boolean;
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
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'WORKSPACE';
  const heading = document.createElement('h2');
  heading.textContent = '今天要推进什么？';
  copy.append(eyebrow, heading);

  const actions = document.createElement('div');
  actions.className = 'tmc-workspace-actions';
  const importButton = action('导入旧任务', 'import-legacy', options.onImport);
  importButton.disabled = options.importing;
  const createButton = action('+ 新任务', 'new-task', options.onCreate);
  createButton.classList.add('mod-cta');
  actions.append(importButton, createButton);

  const modes = document.createElement('div');
  modes.className = 'tmc-workspace-modes';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '任务中心模式');
  for (const [mode, label] of [['tasks', '任务矩阵'], ['calendar', '日历']] as const) {
    const button = action(label, '', () => options.onModeChange(mode));
    delete button.dataset.action;
    button.dataset.mode = mode;
    button.setAttribute('aria-pressed', String(options.mode === mode));
    modes.append(button);
  }

  header.append(copy, actions, modes);
  return header;
}
