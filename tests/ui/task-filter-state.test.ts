import { describe, expect, it } from 'vitest';
import { makeTask, type IndexedTask } from '../../src/domain/task';
import {
  DEFAULT_FILTER_STATE,
  deriveFilterOptions,
  hasActiveFilters,
  toTaskFilters,
} from '../../src/ui/task-filter-state';

function indexedTask(id: string, project: string | undefined, sourcePath: string): IndexedTask {
  return {
    task: makeTask({ id, title: id, project }),
    location: {
      sourcePath,
      startLine: 1,
      endLine: 1,
      indent: 0,
      eol: '\n',
      fingerprint: id,
    },
  };
}

describe('task filter state', () => {
  it('defaults to active tasks without emitting wildcard filters', () => {
    expect(DEFAULT_FILTER_STATE).toEqual({
      query: '',
      project: '*',
      status: 'active',
      risk: '*',
      sourcePath: '*',
    });
    expect(toTaskFilters(DEFAULT_FILTER_STATE)).toEqual({
      statuses: ['todo', 'in-progress', 'paused'],
    });
  });

  it('maps every concrete workspace filter to task-index filters', () => {
    expect(toTaskFilters({
      query: '第二行',
      project: '开源',
      status: 'done',
      risk: 'overdue',
      sourcePath: '任务/a.md',
    })).toEqual({
      query: '第二行',
      projects: ['开源'],
      statuses: ['done'],
      risks: ['overdue'],
      sourcePaths: ['任务/a.md'],
    });
  });

  it('omits a blank query and wildcard status', () => {
    expect(toTaskFilters({
      query: '   ',
      project: '*',
      status: '*',
      risk: '*',
      sourcePath: '*',
    })).toEqual({});
  });

  it('detects every individual departure from the default filter state', () => {
    expect(hasActiveFilters(DEFAULT_FILTER_STATE)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTER_STATE, query: '任务' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTER_STATE, project: 'Smarthub' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTER_STATE, status: '*' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTER_STATE, risk: 'overdue' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTER_STATE, sourcePath: '任务/a.md' })).toBe(true);
  });

  it('derives unique project and source options sorted for Chinese text', () => {
    const tasks = [
      indexedTask('task-1', '日常', '任务/z.md'),
      indexedTask('task-2', '开源', '任务/a.md'),
      indexedTask('task-3', '个人', '任务/m.md'),
      indexedTask('task-4', '开源', '任务/a.md'),
      indexedTask('task-5', undefined, '任务/z.md'),
    ];

    expect(deriveFilterOptions(tasks)).toEqual({
      projects: ['个人', '开源', '日常'],
      sourcePaths: ['任务/a.md', '任务/m.md', '任务/z.md'],
    });
  });
});
