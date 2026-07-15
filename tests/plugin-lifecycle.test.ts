// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf, type App, type ItemView, type PluginManifest } from 'obsidian';
import TaskMatrixCalendarPlugin, { COMMANDS } from '../src/main';
import { LegacyImportWizard } from '../src/ui/legacy-import-wizard';
import {
  TASK_WORKSPACE_VIEW_TYPE,
  TaskWorkspaceView,
} from '../src/ui/task-workspace-view';

type RecordedPlugin = TaskMatrixCalendarPlugin & {
  registeredViews: Array<{
    type: string;
    creator: (leaf: WorkspaceLeaf) => ItemView;
  }>;
  registeredCommands: Array<{
    id: string;
    name?: string;
    callback?: () => unknown;
  }>;
  ribbonIcons: Array<{ callback: () => void }>;
  settingTabs: unknown[];
};

function setupPlugin() {
  const plugin = new TaskMatrixCalendarPlugin({} as App, {} as PluginManifest) as RecordedPlugin;
  const layoutReady = vi.fn((callback: () => void) => callback());
  const activeLeaves: WorkspaceLeaf[] = [];
  const leaf = new WorkspaceLeaf() as WorkspaceLeaf & {
    setViewState: ReturnType<typeof vi.fn>;
  };
  let setMode: ReturnType<typeof vi.spyOn> | undefined;
  leaf.setViewState = vi.fn(async () => {
    const registration = plugin.registeredViews.find(
      (item) => item.type === TASK_WORKSPACE_VIEW_TYPE,
    );
    if (!registration) throw new Error('workspace view was not registered');
    leaf.view = registration.creator(leaf);
    setMode = vi.spyOn(leaf.view as TaskWorkspaceView, 'setMode');
    activeLeaves.push(leaf);
  });
  const getLeavesOfType = vi.fn(() => activeLeaves);
  const getLeaf = vi.fn(() => leaf);
  const revealLeaf = vi.fn();
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
        getLeavesOfType,
        getLeaf,
        revealLeaf,
      },
    },
  });
  return {
    plugin,
    layoutReady,
    leaf,
    getLeaf,
    revealLeaf,
    setMode: () => setMode,
  };
}

describe('plugin lifecycle', () => {
  it('registers one workspace view plus commands, ribbon, settings and runtime', async () => {
    const { plugin, layoutReady } = setupPlugin();

    await plugin.onload();
    await Promise.resolve();

    expect(plugin.registeredViews.map((item) => item.type)).toEqual([TASK_WORKSPACE_VIEW_TYPE]);
    expect(plugin.registeredCommands.map((item) => item.id)).toEqual(Object.values(COMMANDS));
    expect(plugin.ribbonIcons).toHaveLength(1);
    expect(plugin.settingTabs).toHaveLength(1);
    expect(layoutReady).toHaveBeenCalledTimes(1);

    plugin.onunload();
  });

  it('routes task, calendar, and ribbon actions through one workspace leaf', async () => {
    const { plugin, getLeaf, revealLeaf, setMode } = setupPlugin();
    await plugin.onload();
    const openTasks = plugin.registeredCommands.find((item) => item.id === COMMANDS.openTasks)!;
    const openCalendar = plugin.registeredCommands.find((item) => item.id === COMMANDS.openCalendar)!;

    await openTasks.callback?.();
    expect(setMode()).toHaveBeenCalledWith('tasks');
    await openCalendar.callback?.();
    expect(setMode()).toHaveBeenCalledWith('calendar');
    plugin.ribbonIcons[0].callback();
    expect(setMode()).toHaveBeenLastCalledWith('tasks');

    expect(getLeaf).toHaveBeenCalledTimes(1);
    expect(revealLeaf).toHaveBeenCalledTimes(3);
    plugin.onunload();
  });

  it('uses the same import wizard from the command and workspace button', async () => {
    const openWizard = vi.spyOn(LegacyImportWizard.prototype, 'openWizard');
    const { plugin, leaf } = setupPlugin();
    await plugin.onload();
    const openTasks = plugin.registeredCommands.find((item) => item.id === COMMANDS.openTasks)!;
    const migrate = plugin.registeredCommands.find((item) => item.id === COMMANDS.migrate)!;

    await openTasks.callback?.();
    const workspace = leaf.view as TaskWorkspaceView;
    await workspace.onOpen();
    await migrate.callback?.();
    workspace.containerEl.querySelector<HTMLButtonElement>('[data-action="import-legacy"]')!.click();
    await Promise.resolve();

    expect(migrate.name).toBe('导入旧任务');
    expect(openWizard).toHaveBeenCalledTimes(2);
    expect(openWizard.mock.contexts[0]).toBe(openWizard.mock.contexts[1]);
    expect(openWizard).toHaveBeenNthCalledWith(1);
    expect(openWizard).toHaveBeenNthCalledWith(2);
    await workspace.onClose();
    plugin.onunload();
  });
});
