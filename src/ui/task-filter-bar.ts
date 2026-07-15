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
  ['active', '状态：活动'], ['*', '状态：全部'], ['todo', '状态：待办'],
  ['in-progress', '状态：进行中'], ['paused', '状态：暂停'], ['done', '状态：已完成'],
] as const;

const RISK = [
  ['*', '截止：全部'], ['overdue', '截止：已逾期'], ['due-today', '截止：今天'],
  ['upcoming', '截止：即将到期'], ['none', '截止：无风险'],
] as const;

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

  const text = document.createElement('span');
  text.className = 'visually-hidden';
  text.dataset.filterLabel = '';
  text.textContent = caption;

  const select = document.createElement('select');
  select.dataset.filter = name;
  for (const [choice, label] of choices) {
    const option = document.createElement('option');
    option.value = choice;
    option.textContent = label;
    option.selected = choice === value;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(name, select.value));
  chip.append(text, select);
  return chip;
}

export function renderTaskFilterBar(options: TaskFilterBarOptions): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'tmc-filter-bar';

  const searchField = document.createElement('label');
  searchField.className = 'tmc-search-field';
  const searchCaption = document.createElement('span');
  searchCaption.className = 'visually-hidden';
  searchCaption.dataset.filterLabel = '';
  searchCaption.textContent = '搜索';
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
  searchField.append(searchCaption, search);

  const chips = document.createElement('div');
  chips.className = 'tmc-filter-chips';
  chips.append(
    filterChip(
      'project',
      '项目',
      options.state.project,
      DEFAULT_FILTER_STATE.project,
      [
        ['*', '项目：全部'],
        ...options.choices.projects.map((project) => [project, `项目：${project}`] as const),
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
        ['*', '来源：全部'],
        ...options.choices.sourcePaths.map((path) => [path, `来源：${path}`] as const),
      ],
      options.onFilterChange,
    ),
  );
  bar.append(searchField, chips);

  if (hasActiveFilters(options.state)) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'tmc-clear-filters';
    clear.dataset.action = 'clear-filters';
    clear.textContent = '清除筛选';
    clear.addEventListener('click', options.onClear);
    bar.append(clear);
  }

  return bar;
}
