import {
  DEFAULT_FILTER_STATE,
  hasActiveFilters,
  type TaskWorkspaceFilterState,
} from './task-filter-state';

export type FilterName = 'project' | 'status' | 'risk' | 'source';

export interface SearchChange {
  query: string;
  restoreFocus: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: 'forward' | 'backward' | 'none';
}

export interface TaskFilterBarOptions {
  state: TaskWorkspaceFilterState;
  choices: { projects: string[]; sourcePaths: string[] };
  onSearch(change: SearchChange): void;
  onFilterChange(name: FilterName, value: string): void;
  onClear(): void;
}

const STATUS = [
  ['active', '活动'], ['*', '全部'], ['todo', '待办'],
  ['in-progress', '进行中'], ['paused', '暂停'], ['done', '已完成'],
] as const;

const RISK = [
  ['*', '全部'], ['overdue', '已逾期'], ['due-today', '今天'],
  ['upcoming', '即将到期'], ['none', '无风险'],
] as const;

function choiceLabel(
  choices: ReadonlyArray<readonly [string, string]>,
  value: string,
): string {
  return choices.find(([choice]) => choice === value)?.[1] ?? value;
}

function activeFilterLabels(state: TaskWorkspaceFilterState): string[] {
  const labels: string[] = [];
  if (state.query.trim()) labels.push(`搜索：${state.query.trim()}`);
  if (state.project !== DEFAULT_FILTER_STATE.project) labels.push(`项目：${state.project}`);
  if (state.status !== DEFAULT_FILTER_STATE.status) {
    labels.push(`状态：${choiceLabel(STATUS, state.status)}`);
  }
  if (state.risk !== DEFAULT_FILTER_STATE.risk) {
    labels.push(`截止：${choiceLabel(RISK, state.risk)}`);
  }
  if (state.sourcePath !== DEFAULT_FILTER_STATE.sourcePath) {
    labels.push(`来源：${state.sourcePath}`);
  }
  return labels;
}

function filterChip(
  name: FilterName,
  caption: string,
  value: string,
  defaultValue: string,
  choices: ReadonlyArray<readonly [string, string]>,
  onChange: TaskFilterBarOptions['onFilterChange'],
): HTMLLabelElement {
  const chip = document.createElement('label');
  chip.className = 'tmc-filter-chip';
  chip.classList.toggle('is-active', value !== defaultValue);

  const visibleCaption = document.createElement('span');
  visibleCaption.dataset.filterCaption = '';
  visibleCaption.textContent = name === 'risk' ? '截止' : caption;

  const select = document.createElement('select');
  select.dataset.filter = name;
  select.setAttribute('aria-label', caption);
  for (const [choice, label] of choices) {
    const option = document.createElement('option');
    option.value = choice;
    option.textContent = label;
    option.selected = choice === value;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(name, select.value));
  chip.append(visibleCaption, select);
  return chip;
}

export function renderTaskFilterBar(options: TaskFilterBarOptions): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'tmc-filter-bar';

  const searchField = document.createElement('label');
  searchField.className = 'tmc-search-field';
  const search = document.createElement('input');
  search.type = 'search';
  search.dataset.filter = 'query';
  search.setAttribute('aria-label', '搜索任务');
  search.placeholder = '搜索标题、详情、项目、标签……';
  search.value = options.state.query;
  search.addEventListener('input', () => {
    options.onSearch({
      query: search.value,
      restoreFocus: document.activeElement === search,
      selectionStart: search.selectionStart,
      selectionEnd: search.selectionEnd,
      selectionDirection: search.selectionDirection ?? 'none',
    });
  });
  searchField.append(search);

  const chips = document.createElement('div');
  chips.className = 'tmc-filter-chips';
  chips.append(
    filterChip(
      'project',
      '项目',
      options.state.project,
      DEFAULT_FILTER_STATE.project,
      [
        ['*', '全部'],
        ...options.choices.projects.map((project) => [project, project] as const),
      ],
      options.onFilterChange,
    ),
    filterChip(
      'status',
      '状态',
      options.state.status,
      DEFAULT_FILTER_STATE.status,
      STATUS,
      options.onFilterChange,
    ),
    filterChip(
      'risk',
      '截止风险',
      options.state.risk,
      DEFAULT_FILTER_STATE.risk,
      RISK,
      options.onFilterChange,
    ),
    filterChip(
      'source',
      '来源',
      options.state.sourcePath,
      DEFAULT_FILTER_STATE.sourcePath,
      [
        ['*', '全部'],
        ...options.choices.sourcePaths.map((path) => [path, path] as const),
      ],
      options.onFilterChange,
    ),
  );
  const controls = document.createElement('div');
  controls.className = 'tmc-filter-controls';
  controls.append(searchField, chips);
  bar.append(controls);

  if (hasActiveFilters(options.state)) {
    const active = document.createElement('div');
    active.className = 'tmc-filter-active';
    const activeCaption = document.createElement('span');
    activeCaption.textContent = '当前筛选';
    active.append(activeCaption);
    for (const label of activeFilterLabels(options.state)) {
      const chip = document.createElement('span');
      chip.dataset.activeFilter = '';
      chip.textContent = label;
      active.append(chip);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'tmc-clear-filters';
    clear.dataset.action = 'clear-filters';
    clear.textContent = '清除筛选';
    clear.addEventListener('click', options.onClear);
    active.append(clear);
    bar.append(active);
  }

  return bar;
}
