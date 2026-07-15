import {
  Notice,
  Plugin,
  TFile,
  TFolder,
  normalizePath,
  type TAbstractFile,
  type WorkspaceLeaf,
} from 'obsidian';
import { classifyDateRisk } from './domain/dates';
import { TaskIndex } from './index/task-index';
import { TaskScanner } from './index/task-scanner';
import { VaultEventBridge, type VaultEventPort } from './index/vault-event-bridge';
import { ObsidianTaskRepository } from './persistence/obsidian-task-repository';
import type { VaultProcessPort } from './persistence/vault-port';
import { ExternalCheckboxCoordinator } from './services/external-checkbox-coordinator';
import { MigrationService } from './services/migration-service';
import { TaskService } from './services/task-service';
import { TrashService } from './services/trash-service';
import {
  DEFAULT_SETTINGS,
  validateSettings,
  type TaskMatrixCalendarSettings,
} from './settings';
import { ClassificationModal } from './ui/classification-modal';
import { LegacyImportWizard } from './ui/legacy-import-wizard';
import { TaskMatrixCalendarSettingTab } from './ui/settings-tab';
import { TaskFormModal } from './ui/task-form-modal';
import {
  TASK_WORKSPACE_VIEW_TYPE,
  TaskWorkspaceView,
  type TaskWorkspaceMode,
} from './ui/task-workspace-view';

export const COMMANDS = {
  openTasks: 'open-task-matrix',
  openCalendar: 'open-task-calendar',
  migrate: 'migrate-legacy-tasks',
} as const;

class ObsidianVaultAdapter implements VaultProcessPort {
  constructor(private readonly plugin: TaskMatrixCalendarPlugin) {}

  listMarkdownPaths(): string[] {
    return this.plugin.app.vault.getMarkdownFiles().map((file) => file.path);
  }

  exists(path: string): boolean {
    return this.plugin.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  async read(path: string): Promise<string> {
    const file = this.file(path);
    return this.plugin.app.vault.read(file);
  }

  async create(path: string, source: string): Promise<void> {
    const normalized = normalizePath(path);
    await this.ensureParentFolders(normalized);
    await this.plugin.app.vault.create(normalized, source);
  }

  async process(path: string, update: (source: string) => string): Promise<void> {
    await this.plugin.app.vault.process(this.file(path), update);
  }

  private file(path: string): TFile {
    const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) throw new Error(`找不到 Markdown 文件：${path}`);
    return file;
  }

  private async ensureParentFolders(path: string): Promise<void> {
    const parts = path.split('/').slice(0, -1);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.plugin.app.vault.getAbstractFileByPath(current);
      if (!existing) await this.plugin.app.vault.createFolder(current);
      else if (!(existing instanceof TFolder)) throw new Error(`路径不是目录：${current}`);
    }
  }
}

class ObsidianVaultEvents implements VaultEventPort {
  constructor(private readonly plugin: TaskMatrixCalendarPlugin) {}

  onCreate(handler: (path: string) => void): () => void {
    const reference = this.plugin.app.vault.on('create', (file) => handler(file.path));
    return () => this.plugin.app.vault.offref(reference);
  }

  onModify(handler: (path: string) => void): () => void {
    const reference = this.plugin.app.vault.on('modify', (file) => handler(file.path));
    return () => this.plugin.app.vault.offref(reference);
  }

  onRename(handler: (oldPath: string, newPath: string) => void): () => void {
    const reference = this.plugin.app.vault.on('rename', (file, oldPath) => handler(oldPath, file.path));
    return () => this.plugin.app.vault.offref(reference);
  }

  onDelete(handler: (path: string) => void): () => void {
    const reference = this.plugin.app.vault.on('delete', (file: TAbstractFile) => handler(file.path));
    return () => this.plugin.app.vault.offref(reference);
  }
}

export default class TaskMatrixCalendarPlugin extends Plugin {
  settings: TaskMatrixCalendarSettings = { ...DEFAULT_SETTINGS };
  private eventBridge?: VaultEventBridge;
  private unsubscribeRisk?: () => void;

  async onload(): Promise<void> {
    const saved = (await this.loadData()) as Partial<TaskMatrixCalendarSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      scanRoots: saved?.scanRoots ?? [...DEFAULT_SETTINGS.scanRoots],
      excludeGlobs: saved?.excludeGlobs ?? [],
    };
    if (validateSettings(this.settings).length > 0) {
      this.settings = { ...DEFAULT_SETTINGS, scanRoots: [...DEFAULT_SETTINGS.scanRoots], excludeGlobs: [] };
      new Notice('任务矩阵插件设置无效，已恢复默认设置。');
    }

    const index = new TaskIndex();
    const vault = new ObsidianVaultAdapter(this);
    const scanner = new TaskScanner(vault, index, this.settings);
    const repository = new ObsidianTaskRepository(vault, index);
    const prompt = new ClassificationModal(this.app);
    const taskService = new TaskService(repository, index, this.settings);
    const trashService = new TrashService(repository, index, vault, this.settings);
    const migrationService = new MigrationService(repository, vault, this.settings);
    const coordinator = new ExternalCheckboxCoordinator(repository, index, prompt);
    const taskFormModal = new TaskFormModal(this.app, taskService, today);
    const importWizard = new LegacyImportWizard(
      this.app,
      migrationService,
      () => this.settings.backupRoot,
    );
    this.registerView(
      TASK_WORKSPACE_VIEW_TYPE,
      (leaf) => new TaskWorkspaceView(
        leaf,
        index,
        taskService,
        prompt,
        taskFormModal,
        this.settings.dueSoonDays,
        today,
        () => Promise.resolve(importWizard.openWizard()),
      ),
    );

    const ribbon = this.addRibbonIcon('check-square', '打开任务中心', () => {
      void this.activateTaskWorkspace('tasks');
    });
    ribbon.classList.add('task-matrix-calendar-ribbon');
    this.unsubscribeRisk = index.subscribe((snapshot) => {
      const count = snapshot.tasks.filter((item) => {
        const risk = classifyDateRisk(item.task.dueDate, item.task.status, today(), this.settings.dueSoonDays);
        return risk === 'overdue' || risk === 'due-today';
      }).length;
      if (count > 0) ribbon.dataset.riskCount = String(count);
      else delete ribbon.dataset.riskCount;
    });

    this.addCommand({
      id: COMMANDS.openTasks,
      name: '打开任务中心',
      callback: () => void this.activateTaskWorkspace('tasks'),
    });
    this.addCommand({
      id: COMMANDS.openCalendar,
      name: '打开任务日历',
      callback: () => void this.activateTaskWorkspace('calendar'),
    });
    this.addCommand({
      id: COMMANDS.migrate,
      name: '导入旧任务',
      callback: () => importWizard.openWizard(),
    });
    this.addSettingTab(new TaskMatrixCalendarSettingTab(this.app, this, trashService, async () => scanner.scanAll()));

    this.app.workspace.onLayoutReady(() => {
      void this.startRuntime(scanner, coordinator, index);
    });
  }

  onunload(): void {
    this.eventBridge?.dispose();
    this.unsubscribeRisk?.();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateTaskWorkspace(mode: TaskWorkspaceMode): Promise<void> {
    let leaf: WorkspaceLeaf | undefined = this.app.workspace.getLeavesOfType(
      TASK_WORKSPACE_VIEW_TYPE,
    )[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: TASK_WORKSPACE_VIEW_TYPE, active: true });
    }
    const view = leaf.view;
    if (view instanceof TaskWorkspaceView) view.setMode(mode);
    await this.app.workspace.revealLeaf(leaf);
  }

  private async startRuntime(
    scanner: TaskScanner,
    coordinator: ExternalCheckboxCoordinator,
    index: TaskIndex,
  ): Promise<void> {
    try {
      await scanner.scanAll();
    } catch (error) {
      new Notice(`任务初始扫描失败：${error instanceof Error ? error.message : String(error)}`);
    }
    this.eventBridge = new VaultEventBridge(
      new ObsidianVaultEvents(this),
      async (path) => {
        if (scanner.isManagedPath(path)) await coordinator.refreshPath(path);
        else index.removeFile(path);
      },
      (path) => index.removeFile(path),
    );
    this.eventBridge.start();
  }
}

function today(): string {
  const local = new Date();
  const offset = local.getTimezoneOffset() * 60_000;
  return new Date(local.getTime() - offset).toISOString().slice(0, 10);
}
