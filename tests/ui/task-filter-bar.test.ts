// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTER_STATE } from '../../src/ui/task-filter-state';
import { renderTaskFilterBar } from '../../src/ui/task-filter-bar';

describe('renderTaskFilterBar', () => {
  it('renders accessible pill filters and clears non-default state', () => {
    const onFilterChange = vi.fn();
    const onClear = vi.fn();
    const bar = renderTaskFilterBar({
      state: { ...DEFAULT_FILTER_STATE, project: 'Smarthub', risk: 'overdue' },
      choices: { projects: ['Smarthub'], sourcePaths: ['任务/任务收件箱.md'] },
      onSearch: vi.fn(),
      onFilterChange,
      onClear,
    });

    expect(bar.querySelector('[data-filter="project"]')?.closest('.tmc-filter-chip')?.classList)
      .toContain('is-active');
    expect(bar.querySelector('[data-action="clear-filters"]')).not.toBeNull();
    expect(bar.querySelector('[data-filter="query"]')?.getAttribute('aria-label')).toBe('搜索任务');
    expect(bar.querySelector('.tmc-filter-controls')).not.toBeNull();
    expect(Array.from(bar.querySelectorAll('[data-filter-caption]'), (node) => node.textContent))
      .toEqual(['项目', '状态', '截止', '来源']);
    expect(Array.from(bar.querySelectorAll('[data-active-filter]'), (node) => node.textContent))
      .toEqual(['项目：Smarthub', '截止：已逾期']);

    const project = bar.querySelector<HTMLSelectElement>('[data-filter="project"]')!;
    project.value = '*';
    project.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onFilterChange).toHaveBeenCalledWith('project', '*');
    bar.querySelector<HTMLButtonElement>('[data-action="clear-filters"]')!.click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('reports focus and caret data for a search rerender', () => {
    const onSearch = vi.fn();
    const bar = renderTaskFilterBar({
      state: DEFAULT_FILTER_STATE,
      choices: { projects: [], sourcePaths: [] },
      onSearch,
      onFilterChange: vi.fn(),
      onClear: vi.fn(),
    });
    document.body.append(bar);
    const search = bar.querySelector<HTMLInputElement>('[data-filter="query"]')!;
    search.focus();
    search.value = '插件';
    search.setSelectionRange(2, 2);
    search.dispatchEvent(new InputEvent('input', { bubbles: true }));

    expect(onSearch).toHaveBeenCalledWith({
      query: '插件',
      restoreFocus: true,
      selectionStart: 2,
      selectionEnd: 2,
      selectionDirection: 'none',
    });
  });
});
