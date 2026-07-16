// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderTaskWorkspaceHeader } from '../../src/ui/task-workspace-header';

describe('renderTaskWorkspaceHeader', () => {
  it('renders one primary action, one secondary action, and segmented modes', () => {
    const onCreate = vi.fn();
    const onImport = vi.fn();
    const onModeChange = vi.fn();
    const header = renderTaskWorkspaceHeader({
      mode: 'tasks',
      importing: false,
      summary: { active: 14, dueRisk: 3, unclassified: 2 },
      onCreate,
      onImport,
      onModeChange,
    });

    expect(header.querySelector('h2')?.textContent).toBe('任务中心');
    expect(header.querySelector('[data-role="workspace-summary"]')?.textContent)
      .toBe('14 个活动任务 · 3 个临近截止 · 2 个待分类');
    expect(header.querySelector('[data-role="workspace-primary"] [data-action="new-task"]'))
      .toBeInstanceOf(HTMLButtonElement);
    expect(header.querySelector('[data-role="workspace-modes"] [aria-pressed="true"]')?.textContent)
      .toBe('任务');
    expect(header.querySelector('[data-action="new-task"]')?.classList)
      .toContain('mod-cta');
    expect(header.querySelector('[data-action="import-legacy"]')?.classList)
      .not.toContain('mod-cta');
    expect(header.querySelector('[data-mode="tasks"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(header.querySelector('[data-mode="calendar"]')?.getAttribute('aria-pressed')).toBe('false');

    header.querySelector<HTMLButtonElement>('[data-action="new-task"]')!.click();
    header.querySelector<HTMLButtonElement>('[data-action="import-legacy"]')!.click();
    header.querySelector<HTMLButtonElement>('[data-mode="calendar"]')!.click();
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith('calendar');
  });
});
