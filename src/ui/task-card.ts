import { setIcon } from 'obsidian';
import type { DateRisk, IndexedTask, TaskStatus } from '../domain/task';

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
  const { task } = indexed;
  const card = document.createElement('article');
  card.className = 'tmc-task-card';
  card.dataset.taskId = task.id;
  card.dataset.status = task.status;
  card.tabIndex = 0;
  card.draggable = true;
  card.addEventListener('click', () => actions.open(task.id));
  card.addEventListener('keydown', (event) => {
    if (event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') actions.open(task.id);
  });

  const cardTop = document.createElement('div');
  cardTop.className = 'tmc-task-card-top';
  const main = document.createElement('div');
  main.className = 'tmc-task-card-main';
  main.append(textElement('h4', 'tmc-task-title', task.title));
  const badges = document.createElement('div');
  badges.className = 'tmc-task-badges';
  badges.append(textElement('span', `tmc-status tmc-status-${task.status}`, STATUS_LABELS[task.status]));
  if (progress.total > 0) badges.append(textElement('span', 'tmc-progress', `${progress.done}/${progress.total}`));
  if (risk !== 'none') badges.append(textElement('span', `tmc-risk tmc-risk-${risk}`, RISK_LABELS[risk]));

  const menuShell = document.createElement('div');
  menuShell.className = 'tmc-task-menu-shell';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.dataset.action = 'menu';
  trigger.disabled = actionsDisabled;
  trigger.setAttribute('aria-label', '任务操作');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  setIcon(trigger, 'ellipsis');

  const menu = document.createElement('div');
  menu.className = 'tmc-task-actions';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  const closeMenu = (): void => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  const appendMenuAction = (label: string, action: string, callback: () => void): void => {
    const button = actionButton(label, action, () => {
      closeMenu();
      callback();
    }, actionsDisabled);
    button.setAttribute('role', 'menuitem');
    menu.append(button);
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));
  });
  menuShell.addEventListener('click', (event) => event.stopPropagation());
  menuShell.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMenu();
    trigger.focus();
  });
  menuShell.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !menuShell.contains(next)) closeMenu();
  });

  appendMenuAction('编辑', 'open', () => actions.open(task.id));
  const edit = menu.querySelector<HTMLButtonElement>('[data-action="open"]');
  edit?.setAttribute('aria-label', '编辑任务');
  if (task.status === 'todo') appendMenuAction('开始', 'start', () => actions.start(task.id));
  if (task.status === 'in-progress') {
    appendMenuAction('暂停', 'pause', () => actions.pause(task.id));
  }
  if (task.status === 'paused') appendMenuAction('继续', 'resume', () => actions.resume(task.id));
  if (task.status !== 'done') {
    appendMenuAction('完成', 'complete', () => actions.complete(task.id));
  }

  menuShell.append(trigger, menu);
  cardTop.append(main, badges, menuShell);
  card.append(cardTop);

  if (task.details) card.append(textElement('p', 'tmc-task-description', task.details));

  const details = [
    task.project && `项目：${task.project}`,
    task.dueDate
      ? `截止：${task.dueDate}`
      : task.plannedDate && `计划：${task.plannedDate}`,
  ].filter((item): item is string => Boolean(item));
  if (details.length > 0) {
    card.append(textElement('p', 'tmc-task-details', details.join(' · ')));
  }
  container.append(card);
  return card;
}
