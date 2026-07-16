import type {
  TaskNode,
  TaskQuadrant,
  TaskStatus,
} from '../domain/task';
import type { MigrationCandidate } from '../services/migration-service';

export interface LegacyCandidateEditorOptions {
  candidate: MigrationCandidate;
  corrected: TaskNode;
  selected: boolean;
  disabled: boolean;
  active?: boolean;
  error?: { field: string; message: string };
  onActivate?(): void;
  onSelected(selected: boolean): void;
  onChanged(task: TaskNode): void;
}

const STATUS_CHOICES: Array<[TaskStatus, string]> = [
  ['todo', '待办'],
  ['in-progress', '进行中'],
  ['paused', '暂停'],
  ['done', '已完成'],
];

const QUADRANT_CHOICES: Array<[TaskQuadrant, string]> = [
  ['unclassified', '未分类'],
  ['important-urgent', '重要且紧急'],
  ['important-not-urgent', '重要不紧急'],
  ['not-important-urgent', '不重要但紧急'],
  ['not-important-not-urgent', '不重要不紧急'],
];

function cloneTask(task: TaskNode): TaskNode {
  return {
    ...task,
    tags: [...task.tags],
    childrenIds: [...task.childrenIds],
  };
}

function textInput(name: string, value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.name = name;
  input.dataset.field = name;
  input.value = value;
  return input;
}

function selectInput<T extends string>(
  name: string,
  value: T,
  choices: Array<[T, string]>,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.name = name;
  select.dataset.field = name;
  for (const [choice, label] of choices) {
    const option = document.createElement('option');
    option.value = choice;
    option.textContent = label;
    option.selected = choice === value;
    select.append(option);
  }
  return select;
}

function field(
  label: string,
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  error?: LegacyCandidateEditorOptions['error'],
): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'tmc-form-field';
  const caption = document.createElement('span');
  caption.className = 'tmc-form-label';
  caption.textContent = label;
  wrapper.append(caption, control);
  if (error?.field === control.name) {
    control.setAttribute('aria-invalid', 'true');
    const message = document.createElement('span');
    message.className = 'tmc-form-error';
    message.dataset.candidateError = '';
    message.textContent = error.message;
    wrapper.append(message);
  }
  return wrapper;
}

function appendEvidence(host: HTMLElement, candidate: MigrationCandidate): void {
  const evidence = document.createElement('div');
  evidence.className = 'tmc-import-evidence';
  const location = document.createElement('div');
  location.className = 'tmc-import-location';
  location.textContent = `${candidate.sourcePath} · 第 ${candidate.startLine + 1} 行`;
  const original = document.createElement('pre');
  original.textContent = candidate.originalText;
  const reason = document.createElement('p');
  reason.textContent = candidate.recognition.reason;
  evidence.append(location, original, reason);
  host.append(evidence);
}

export function renderLegacyCandidateListItem(
  options: LegacyCandidateEditorOptions,
): HTMLElement {
  const row = document.createElement('article');
  row.className = 'tmc-import-candidate';
  row.dataset.candidateId = options.candidate.candidateId;
  row.dataset.active = String(Boolean(options.active));
  row.tabIndex = options.disabled ? -1 : 0;
  row.setAttribute('role', 'button');
  row.setAttribute('aria-pressed', String(Boolean(options.active)));

  const header = document.createElement('div');
  header.className = 'tmc-import-candidate-header';
  const selectionLabel = document.createElement('label');
  selectionLabel.className = 'tmc-import-candidate-selection';
  selectionLabel.addEventListener('click', (event) => event.stopPropagation());
  const selection = document.createElement('input');
  selection.type = 'checkbox';
  selection.dataset.selectionId = options.candidate.candidateId;
  selection.checked = options.selected;
  selection.disabled = options.disabled;
  selection.addEventListener('click', (event) => event.stopPropagation());
  selection.addEventListener('change', () => options.onSelected(selection.checked));
  const selectionText = document.createElement('span');
  selectionText.textContent = '导入';
  selectionLabel.append(selection, selectionText);

  const visibleTitle = document.createElement('strong');
  visibleTitle.dataset.candidateTitle = '';
  visibleTitle.textContent = options.corrected.title;
  header.append(selectionLabel, visibleTitle);
  row.append(header);
  appendEvidence(row, options.candidate);
  if (options.error) {
    const error = document.createElement('p');
    error.className = 'tmc-import-candidate-error';
    error.dataset.candidateError = '';
    error.textContent = options.error.message;
    row.append(error);
  }

  const activate = (): void => {
    if (!options.disabled) options.onActivate?.();
  };
  row.addEventListener('click', activate);
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activate();
  });
  return row;
}

export function renderLegacyCandidateEditorPanel(
  options: LegacyCandidateEditorOptions,
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'tmc-import-editor-panel';
  panel.dataset.activeCandidate = options.candidate.candidateId;

  const header = document.createElement('header');
  header.className = 'tmc-import-editor-header';
  const title = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'tmc-import-editor-eyebrow';
  eyebrow.textContent = '修正任务内容';
  const heading = document.createElement('h3');
  heading.textContent = options.corrected.title;
  title.append(eyebrow, heading);
  const status = document.createElement('span');
  status.className = 'tmc-import-selection-status';
  status.dataset.selected = String(options.selected);
  status.textContent = options.selected ? '已选中导入' : '未选中导入';
  header.append(title, status);
  panel.append(header);
  appendEvidence(panel, options.candidate);

  let current = cloneTask(options.corrected);
  const emit = (update: (task: TaskNode) => TaskNode): void => {
    current = cloneTask(update(current));
    options.onChanged(cloneTask(current));
  };
  const bind = (
    control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    update: (task: TaskNode, value: string) => TaskNode,
  ): void => {
    const changed = () => {
      emit((task) => update(task, control.value));
      if (control.name === 'title') heading.textContent = current.title;
    };
    control.addEventListener('input', changed);
    control.addEventListener('change', changed);
  };

  const titleInput = textInput('title', current.title);
  bind(titleInput, (task, value) => ({ ...task, title: value }));
  const details = document.createElement('textarea');
  details.name = 'details';
  details.dataset.field = 'details';
  details.rows = 6;
  details.value = current.details ?? '';
  bind(details, (task, value) => ({ ...task, details: value || undefined }));
  const statusInput = selectInput('status', current.status, STATUS_CHOICES);
  bind(statusInput, (task, value) => ({ ...task, status: value as TaskStatus }));
  const plannedDate = textInput('plannedDate', current.plannedDate ?? '');
  plannedDate.inputMode = 'numeric';
  plannedDate.placeholder = 'YYYYMMDD 或 YYYY-MM-DD';
  bind(plannedDate, (task, value) => ({ ...task, plannedDate: value || undefined }));
  const dueDate = textInput('dueDate', current.dueDate ?? '');
  dueDate.inputMode = 'numeric';
  dueDate.placeholder = 'YYYYMMDD 或 YYYY-MM-DD';
  bind(dueDate, (task, value) => ({ ...task, dueDate: value || undefined }));
  const quadrant = selectInput('quadrant', current.quadrant, QUADRANT_CHOICES);
  bind(quadrant, (task, value) => ({ ...task, quadrant: value as TaskQuadrant }));
  const project = textInput('project', current.project ?? '');
  bind(project, (task, value) => ({ ...task, project: value || undefined }));
  const tags = textInput('tags', current.tags.join(', '));
  bind(tags, (task, value) => ({
    ...task,
    tags: value.split(',').map((tag) => tag.trim()).filter(Boolean),
  }));

  const fields = document.createElement('div');
  fields.className = 'tmc-import-editor-fields tmc-form-grid';
  const detailsField = field('详情', details, options.error);
  detailsField.classList.add('tmc-form-field-wide');
  fields.append(
    field('标题', titleInput, options.error),
    detailsField,
    field('状态', statusInput, options.error),
    field('计划日期', plannedDate, options.error),
    field('截止日期', dueDate, options.error),
    field('四象限', quadrant, options.error),
    field('项目', project, options.error),
    field('标签（逗号分隔）', tags, options.error),
  );
  fields.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >('input, textarea, select').forEach((control) => {
    control.disabled = options.disabled;
  });
  panel.append(fields);
  return panel;
}
