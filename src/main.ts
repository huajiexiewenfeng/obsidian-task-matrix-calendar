import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type TaskMatrixCalendarSettings } from './settings';

export default class TaskMatrixCalendarPlugin extends Plugin {
  settings: TaskMatrixCalendarSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    const saved = (await this.loadData()) as Partial<TaskMatrixCalendarSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
