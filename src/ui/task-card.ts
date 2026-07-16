import { setIcon } from 'obsidian';
import type { DateRisk, IndexedTask, TaskQuadrant, TaskStatus } from '../domain/task';

export interface TaskCardActions {
  open(taskId: string): void;
  start(taskId: string): void;
  complete(taskId: string): void;
  pause(taskId: string): void;
  resume(taskId: string): void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  'in-progress': '进行中',
  paused: '暂停',
  done: '已完成',
};

const QUADRANT_LABELS: Record<TaskQuadrant, string> = {
  unclassified: '未分类',
  'important-urgent': '重要且紧急',
  'important-not-urgent': '重要不紧急',
  'not-important-urgent': '不重要但紧急',
  'not-important-not-urgent': '不重要不紧急',
};

const RISK_LABELS: Record<DateRisk, string> = {
  none: '',
  upcoming: '即将截止',
  'due-today': '今天截止',
  overdue: '已逾期',
};

function textElement(tag: keyof HTMLElementTagNameMap, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function actionButton(
  label: string,
  action: string,
  onClick: () => void,
  disabled: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

export function renderTaskCard(
  container: HTMLElement,
  indexed: IndexedTask,
  progress: { done: number; total: number },
  risk: DateRisk,
  actions: TaskCardActions,
  actionsDisabled = false,
): HTMLElement {
  const { task, location } = indexed;
  const card = document.createElement('article');
  card.className = 'tmc-task-card';
  card.dataset.taskId = task.id;
  card.tabIndex = 0;
  card.draggable = true;
  card.addEventListener('click', () => actions.open(task.id));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') actions.open(task.id);
  });

  const cardTop = document.createElement('div');
  cardTop.className = 'tmc-task-card-top';
  const main = document.createElement('div');
  main.className = 'tmc-task-card-main';
  main.append(textElement('h4', 'tmc-task-title', task.title));
  if (task.details) {
    main.append(textElement('p', 'tmc-task-description', task.details));
  }
  const edit = actionButton('', 'open', () => actions.open(task.id), actionsDisabled);
  edit.setAttribute('aria-label', '编辑任务');
  setIcon(edit, 'ellipsis');
  cardTop.append(main, edit);
  card.append(cardTop);

  const metadata = document.createElement('div');
  metadata.className = 'tmc-task-card-meta';
  const badges = document.createElement('div');
  badges.className = 'tmc-task-badges';
  badges.append(textElement('span', `tmc-status tmc-status-${task.status}`, STATUS_LABELS[task.status]));
  badges.append(textElement('span', 'tmc-quadrant-label', QUADRANT_LABELS[task.quadrant]));
  if (progress.total > 0) badges.append(textElement('span', 'tmc-progress', `${progress.done}/${progress.total}`));
  if (risk !== 'none') badges.append(textElement('span', `tmc-risk tmc-risk-${risk}`, RISK_LABELS[risk]));
  metadata.append(badges);

  if (progress.total > 0) {
    const progressBar = document.createElement('div');
    progressBar.className = 'tmc-task-progress-bar';
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', String(progress.total));
    progressBar.setAttribute('aria-valuenow', String(progress.done));
    const value = document.createElement('span');
    value.style.width = `${Math.round((progress.done / progress.total) * 100)}%`;
    progressBar.append(value);
    metadata.append(progressBar);
  }

  const details = [
    task.project && `项目：${task.project}`,
    task.tags.length > 0 && `标签：${task.tags.join('、')}`,
    task.plannedDate && `计划：${task.plannedDate}`,
    task.dueDate && `截止：${task.dueDate}`,
    `来源：${location.sourcePath}`,
  ].filter((item): item is string => Boolean(item));
  metadata.append(textElement('p', 'tmc-task-details', details.join(' · ')));
  card.append(metadata);

  const controls = document.createElement('div');
  controls.className = 'tmc-task-actions';
  if (task.status === 'todo') controls.append(actionButton(
    '开始',
    'start',
    () => actions.start(task.id),
    actionsDisabled,
  ));
  if (task.status === 'in-progress') controls.append(actionButton(
    '暂停',
    'pause',
    () => actions.pause(task.id),
    actionsDisabled,
  ));
  if (task.status === 'paused') controls.append(actionButton(
    '继续',
    'resume',
    () => actions.resume(task.id),
    actionsDisabled,
  ));
  if (task.status !== 'done') controls.append(actionButton(
    '完成',
    'complete',
    () => actions.complete(task.id),
    actionsDisabled,
  ));
  card.append(controls);
  container.append(card);
  return card;
}
