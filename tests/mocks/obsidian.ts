export class Plugin {
  app: unknown;
  readonly registeredViews: Array<{ type: string; creator: unknown }> = [];
  readonly registeredCommands: Array<{ id: string; name?: string; callback?: () => void }> = [];
  readonly ribbonIcons: Array<{ icon: string; title: string; callback: () => void; element: HTMLElement }> = [];
  readonly settingTabs: unknown[] = [];

  async loadData(): Promise<unknown> {
    return null;
  }

  async saveData(): Promise<void> {
    return undefined;
  }

  registerView(type: string, creator: unknown): void {
    this.registeredViews.push({ type, creator });
  }

  addCommand(command: { id: string; name?: string; callback?: () => void }): void {
    this.registeredCommands.push(command);
  }

  addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement {
    const element = document.createElement('div');
    this.ribbonIcons.push({ icon, title, callback, element });
    return element;
  }

  addSettingTab(tab: unknown): void {
    this.settingTabs.push(tab);
  }
}

export class TAbstractFile {
  constructor(readonly path: string) {}
}

export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\//, '');
}

export class App {}

export class WorkspaceLeaf {}

export class ItemView {
  readonly containerEl = document.createElement('div');

  constructor(readonly leaf: WorkspaceLeaf) {}

  getViewType(): string {
    return '';
  }

  getDisplayText(): string {
    return '';
  }

  async onOpen(): Promise<void> {}

  async onClose(): Promise<void> {}
}

export class Modal {
  readonly contentEl = document.createElement('div');
  private opened = false;

  constructor(readonly app: App) {}

  open(): void {
    this.opened = true;
    this.onOpen();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.onClose();
  }

  onOpen(): void {}

  onClose(): void {}
}

export class Notice {
  constructor(readonly message: string) {}
}

export class PluginSettingTab {
  readonly containerEl = document.createElement('div');

  constructor(readonly app: App, readonly plugin: Plugin) {}

  display(): void {}
}
