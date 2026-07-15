// @vitest-environment jsdom
import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { TaskMatrixCalendarSettingTab } from '../../src/ui/settings-tab';

function setup() {
  const plugin = {
    settings: { ...DEFAULT_SETTINGS, scanRoots: [...DEFAULT_SETTINGS.scanRoots], excludeGlobs: [] },
    saveSettings: vi.fn().mockResolvedValue(undefined),
  };
  const trash = {
    getStats: vi.fn().mockResolvedValue({ entries: 2, bytes: 6 * 1024 * 1024, warn: true }),
    emptyTrash: vi.fn().mockResolvedValue(undefined),
  };
  const changed = vi.fn().mockResolvedValue(undefined);
  const tab = new TaskMatrixCalendarSettingTab({} as App, plugin, trash, changed);
  return { plugin, trash, changed, tab };
}

describe('TaskMatrixCalendarSettingTab', () => {
  it('shows validation errors and does not save invalid settings', async () => {
    const { tab, plugin } = setup();
    await tab.display();
    const inbox = tab.containerEl.querySelector<HTMLInputElement>('[name="inboxPath"]')!;
    inbox.value = '../外部.md';
    tab.containerEl.querySelector<HTMLButtonElement>('[data-action="save-settings"]')!.click();
    await Promise.resolve();
    expect(tab.containerEl.textContent).toContain('默认收件箱必须位于扫描目录内');
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it('normalizes valid paths, persists, rescans and guards empty trash', async () => {
    const { tab, plugin, trash, changed } = setup();
    await tab.display();
    tab.containerEl.querySelector<HTMLInputElement>('[name="scanRoots"]')!.value = '任务\\项目, 任务/项目';
    tab.containerEl.querySelector<HTMLInputElement>('[name="inboxPath"]')!.value = '任务\\项目\\收件箱.md';
    tab.containerEl.querySelector<HTMLButtonElement>('[data-action="save-settings"]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(plugin.settings.scanRoots).toEqual(['任务/项目']);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(changed).toHaveBeenCalled();
    expect(tab.containerEl.textContent).toContain('2 项');
    expect(tab.containerEl.textContent).toContain('超过 5 MiB');
    const empty = tab.containerEl.querySelector<HTMLButtonElement>('[data-action="empty-trash"]')!;
    empty.click();
    await Promise.resolve();
    expect(trash.emptyTrash).not.toHaveBeenCalled();
    tab.containerEl.querySelector<HTMLInputElement>('[name="trashConfirmation"]')!.value = 'EMPTY TRASH';
    empty.click();
    await Promise.resolve();
    expect(trash.emptyTrash).toHaveBeenCalledWith('EMPTY TRASH');
  });
});
