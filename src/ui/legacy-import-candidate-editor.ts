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
  error?: { field: string; message: string };
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
  const caption = document.createElement('span');
  caption.textContent = label;
  wrapper.append(caption, control);
  if (error?.field === control.name) {
    control.setAttribute('aria-invalid', 'true');
    const message = document.createElement('span');
    message.dataset.candidateError = '';
    message.textContent = error.message;
    wrapper.append(message);
  }
  return wrapper;
}

export function renderLegacyCandidateEditor(
  options: LegacyCandidateEditorOptions,
): HTMLElement {
  const row = document.createElement('article');
  row.className = 'tmc-import-candidate';
  row.dataset.candidateId = options.candidate.candidateId;

  const selectionLabel = document.createElement('label');
  const selection = document.createElement('input');
  selection.type = 'checkbox';
  selection.dataset.selectionId = options.candidate.candidateId;
  selection.checked = options.selected;
  selection.disabled = options.disabled;
  selection.addEventListener('change', () => options.onSelected(selection.checked));
  const selectionText = document.createElement('span');
  selectionText.textContent = '导入这个候选';
  selectionLabel.append(selection, selectionText);

  const visibleTitle = document.createElement('strong');
  visibleTitle.dataset.candidateTitle = '';
  visibleTitle.textContent = options.corrected.title;

  const evidence = document.createElement('div');
  evidence.className = 'tmc-import-evidence';
  const location = document.createElement('div');
  location.textContent = `${options.candidate.sourcePath} · 第 ${options.candidate.startLine + 1} 行`;
  const original = document.createElement('pre');
  original.textContent = options.candidate.originalText;
  const reason = document.createElement('p');
  reason.textContent = options.candidate.recognition.reason;
  evidence.append(location, original, reason);

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
      if (control.name === 'title') visibleTitle.textContent = current.title;
    };
    control.addEventListener('input', changed);
    control.addEventListener('change', changed);
  };

  const title = textInput('title', current.title);
  bind(title, (task, value) => ({ ...task, title: value }));
  const details = document.createElement('textarea');
  details.name = 'details';
  details.dataset.field = 'details';
  details.rows = 4;
  details.value = current.details ?? '';
  bind(details, (task, value) => ({ ...task, details: value || undefined }));
  const status = selectInput('status', current.status, STATUS_CHOICES);
  bind(status, (task, value) => ({ ...task, status: value as TaskStatus }));
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
  fields.className = 'tmc-import-candidate-fields';
  fields.append(
    field('标题', title, options.error),
    field('详情', details, options.error),
    field('状态', status, options.error),
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

  const disclosure = document.createElement('details');
  disclosure.className = 'tmc-import-candidate-correction';
  const disclosureLabel = document.createElement('summary');
  disclosureLabel.textContent = '展开完整修正表单';
  disclosure.append(disclosureLabel, fields);

  row.append(selectionLabel, visibleTitle, evidence, disclosure);
  return row;
}
