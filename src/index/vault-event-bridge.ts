export type FileEventHandler = (path: string) => void;
export type RenameEventHandler = (oldPath: string, newPath: string) => void;

export interface VaultEventPort {
  onCreate(handler: FileEventHandler): () => void;
  onModify(handler: FileEventHandler): () => void;
  onRename(handler: RenameEventHandler): () => void;
  onDelete(handler: FileEventHandler): () => void;
}

export class VaultEventBridge {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private disposers: Array<() => void> = [];

  constructor(
    private readonly events: VaultEventPort,
    private readonly refreshPath: (path: string) => Promise<void>,
    private readonly removePath: (path: string) => void,
    private readonly debounceMs = 75,
  ) {}

  start(): void {
    if (this.disposers.length > 0) return;
    this.disposers = [
      this.events.onCreate((path) => this.schedule(path)),
      this.events.onModify((path) => this.schedule(path)),
      this.events.onRename((oldPath, newPath) => {
        this.cancel(oldPath);
        this.removePath(oldPath);
        this.schedule(newPath);
      }),
      this.events.onDelete((path) => {
        this.cancel(path);
        this.removePath(path);
      }),
    ];
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private schedule(path: string): void {
    this.cancel(path);
    const timer = setTimeout(() => {
      this.timers.delete(path);
      void this.refreshPath(path);
    }, this.debounceMs);
    this.timers.set(path, timer);
  }

  private cancel(path: string): void {
    const timer = this.timers.get(path);
    if (timer) clearTimeout(timer);
    this.timers.delete(path);
  }
}
