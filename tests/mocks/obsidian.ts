export class Plugin {
  async loadData(): Promise<unknown> {
    return null;
  }

  async saveData(): Promise<void> {
    return undefined;
  }
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
