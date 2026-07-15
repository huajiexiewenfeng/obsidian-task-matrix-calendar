import { PluginSettingTab, type App, type Plugin } from 'obsidian';
import {
  normalizeVaultPath,
  validateSettings,
  type TaskMatrixCalendarSettings,
} from '../settings';

export interface SettingsPluginPort {
  settings: TaskMatrixCalendarSettings;
  saveSettings(): Promise<void>;
}

export interface SettingsTrashPort {
  getStats(): Promise<{ entries: number; bytes: number; warn: boolean }>;
  emptyTrash(confirmation: 'EMPTY TRASH'): Promise<void>;
}

function formInput(name: string, value: string, type = 'text'): HTMLInputElement {
  const input = document.createElement('input');
  input.name = name;
  input.type = type;
  input.value = value;
  return input;
}

function row(label: string, input: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement('label');
  const caption = document.createElement('span');
  caption.textContent = label;
  wrapper.append(caption, input);
  return wrapper;
}

function list(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value.split(/[,\n]/).map((part) => normalizeVaultPath(part.trim())).filter(Boolean)) {
    const key = item.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export class TaskMatrixCalendarSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly settingsPlugin: SettingsPluginPort,
    private readonly trash: SettingsTrashPort,
    private readonly onSettingsChanged: () => Promise<void>,
  ) {
    super(app, settingsPlugin as unknown as Plugin);
  }

  display(): void {
    this.containerEl.replaceChildren();
    this.containerEl.classList.add('task-matrix-calendar', 'tmc-settings');
    const heading = document.createElement('h2');
    heading.textContent = '任务矩阵与日历设置';
    this.containerEl.append(heading);
    const settings = this.settingsPlugin.settings;
    const roots = formInput('scanRoots', settings.scanRoots.join(', '));
    const globs = formInput('excludeGlobs', settings.excludeGlobs.join(', '));
    const inbox = formInput('inboxPath', settings.inboxPath);
    const trashPath = formInput('trashPath', settings.trashPath);
    const backup = formInput('backupRoot', settings.backupRoot);
    const dueSoon = formInput('dueSoonDays', String(settings.dueSoonDays), 'number');
    this.containerEl.append(
      row('扫描目录', roots), row('排除规则', globs), row('默认收件箱', inbox),
      row('回收站文件', trashPath), row('迁移备份目录', backup), row('即将截止天数', dueSoon),
    );
    const errors = document.createElement('div');
    errors.className = 'tmc-settings-errors';
    this.containerEl.append(errors);
    const save = document.createElement('button');
    save.type = 'button';
    save.dataset.action = 'save-settings';
    save.textContent = '保存并重新扫描';
    save.addEventListener('click', () => {
      const next: TaskMatrixCalendarSettings = {
        scanRoots: list(roots.value),
        excludeGlobs: globs.value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean),
        inboxPath: normalizeVaultPath(inbox.value),
        trashPath: normalizeVaultPath(trashPath.value),
        backupRoot: normalizeVaultPath(backup.value),
        dueSoonDays: Number(dueSoon.value),
      };
      const issues = validateSettings(next);
      errors.replaceChildren();
      if (issues.length > 0) {
        for (const issue of issues) {
          const message = document.createElement('p');
          message.textContent = issue.message;
          errors.append(message);
        }
        return;
      }
      Object.assign(this.settingsPlugin.settings, next);
      void this.settingsPlugin.saveSettings().then(() => this.onSettingsChanged());
    });
    this.containerEl.append(save);

    const trashSection = document.createElement('section');
    trashSection.className = 'tmc-trash-settings';
    const stats = document.createElement('p');
    stats.dataset.role = 'trash-stats';
    trashSection.append(stats);
    const confirmation = formInput('trashConfirmation', '');
    const empty = document.createElement('button');
    empty.type = 'button';
    empty.dataset.action = 'empty-trash';
    empty.textContent = '清空回收站';
    empty.addEventListener('click', () => {
      if (confirmation.value !== 'EMPTY TRASH') return;
      void this.trash.emptyTrash('EMPTY TRASH').then(() => this.loadStats(stats));
    });
    trashSection.append(row('输入 EMPTY TRASH 以确认', confirmation), empty);
    this.containerEl.append(trashSection);
    void this.loadStats(stats);
  }

  private async loadStats(container: HTMLElement): Promise<void> {
    const stats = await this.trash.getStats();
    const size = (stats.bytes / 1024).toFixed(1);
    container.textContent = `回收站：${stats.entries} 项，${size} KiB${stats.warn ? '，超过 5 MiB，请考虑清理。' : ''}`;
  }
}
