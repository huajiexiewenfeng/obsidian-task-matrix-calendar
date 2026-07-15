// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { App, PluginManifest } from 'obsidian';
import TaskMatrixCalendarPlugin, { COMMANDS } from '../src/main';
import { CALENDAR_VIEW_TYPE } from '../src/ui/calendar-view';
import { TASK_MATRIX_VIEW_TYPE } from '../src/ui/task-matrix-view';

describe('plugin lifecycle', () => {
  it('registers views, commands, ribbon, settings and starts after layout ready', async () => {
    const plugin = new TaskMatrixCalendarPlugin({} as App, {} as PluginManifest);
    const layoutReady = vi.fn((callback: () => void) => callback());
    Object.assign(plugin, {
      app: {
        vault: {
          getMarkdownFiles: () => [],
          getAbstractFileByPath: () => null,
          on: vi.fn(() => ({})),
          offref: vi.fn(),
        },
        metadataCache: {},
        workspace: {
          onLayoutReady: layoutReady,
          getLeavesOfType: () => [],
          getLeaf: () => ({ setViewState: vi.fn() }),
          revealLeaf: vi.fn(),
        },
      },
    });

    await plugin.onload();
    await Promise.resolve();

    const recorded = plugin as unknown as {
      registeredViews: Array<{ type: string }>;
      registeredCommands: Array<{ id: string }>;
      ribbonIcons: unknown[];
      settingTabs: unknown[];
    };
    expect(recorded.registeredViews.map((item) => item.type)).toEqual([
      TASK_MATRIX_VIEW_TYPE,
      CALENDAR_VIEW_TYPE,
    ]);
    expect(recorded.registeredCommands.map((item) => item.id)).toEqual(Object.values(COMMANDS));
    expect(recorded.ribbonIcons).toHaveLength(1);
    expect(recorded.settingTabs).toHaveLength(1);
    expect(layoutReady).toHaveBeenCalledTimes(1);

    plugin.onunload();
  });
});
