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
      onCreate,
      onImport,
      onModeChange,
    });

    expect(header.querySelector('h2')?.textContent).toBe('今天要推进什么？');
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
