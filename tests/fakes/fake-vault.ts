export type FileEventHandler = (path: string) => void;
export type RenameEventHandler = (oldPath: string, newPath: string) => void;

export class FakeVault {
  readonly readCounts = new Map<string, number>();
  private readonly files = new Map<string, string>();
  private readonly createHandlers = new Set<FileEventHandler>();
  private readonly modifyHandlers = new Set<FileEventHandler>();
  private readonly renameHandlers = new Set<RenameEventHandler>();
  private readonly deleteHandlers = new Set<FileEventHandler>();
  private readonly processFailures = new Map<string, Error[]>();
  private readonly beforeProcessMutations = new Map<string, Array<(source: string) => string>>();
  private readonly processMutations = new Map<string, Array<(source: string) => string>>();

  constructor(files: Record<string, string> = {}) {
    for (const [path, source] of Object.entries(files)) this.files.set(path, source);
  }

  listMarkdownPaths(): string[] {
    return [...this.files.keys()];
  }

  async read(path: string): Promise<string> {
    this.readCounts.set(path, (this.readCounts.get(path) ?? 0) + 1);
    const source = this.files.get(path);
    if (source === undefined) throw new Error(`Missing fake file: ${path}`);
    return source;
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }

  async create(path: string, source: string): Promise<void> {
    if (this.files.has(path)) throw new Error(`Fake file already exists: ${path}`);
    this.files.set(path, source);
  }

  async process(path: string, update: (source: string) => string): Promise<void> {
    const failures = this.processFailures.get(path);
    const failure = failures?.shift();
    if (failure) throw failure;
    let source = this.files.get(path);
    if (source === undefined) throw new Error(`Missing fake file: ${path}`);
    const beforeMutations = this.beforeProcessMutations.get(path);
    const beforeMutation = beforeMutations?.shift();
    if (beforeMutation) {
      source = beforeMutation(source);
      this.files.set(path, source);
    }
    let updated = update(source);
    const mutations = this.processMutations.get(path);
    const mutation = mutations?.shift();
    if (mutation) updated = mutation(updated);
    this.files.set(path, updated);
  }

  failNextProcess(path: string, error: Error): void {
    const failures = this.processFailures.get(path) ?? [];
    failures.push(error);
    this.processFailures.set(path, failures);
  }

  mutateBeforeNextProcess(path: string, mutation: (source: string) => string): void {
    const mutations = this.beforeProcessMutations.get(path) ?? [];
    mutations.push(mutation);
    this.beforeProcessMutations.set(path, mutations);
  }

  mutateAfterNextProcess(path: string, mutation: (source: string) => string): void {
    const mutations = this.processMutations.get(path) ?? [];
    mutations.push(mutation);
    this.processMutations.set(path, mutations);
  }

  set(path: string, source: string): void {
    this.files.set(path, source);
  }

  deleteFile(path: string): void {
    this.files.delete(path);
  }

  onCreate(handler: FileEventHandler): () => void {
    this.createHandlers.add(handler);
    return () => this.createHandlers.delete(handler);
  }

  onModify(handler: FileEventHandler): () => void {
    this.modifyHandlers.add(handler);
    return () => this.modifyHandlers.delete(handler);
  }

  onRename(handler: RenameEventHandler): () => void {
    this.renameHandlers.add(handler);
    return () => this.renameHandlers.delete(handler);
  }

  onDelete(handler: FileEventHandler): () => void {
    this.deleteHandlers.add(handler);
    return () => this.deleteHandlers.delete(handler);
  }

  emitCreate(path: string): void {
    for (const handler of this.createHandlers) handler(path);
  }

  emitModify(path: string): void {
    for (const handler of this.modifyHandlers) handler(path);
  }

  emitRename(oldPath: string, newPath: string): void {
    for (const handler of this.renameHandlers) handler(oldPath, newPath);
  }

  emitDelete(path: string): void {
    for (const handler of this.deleteHandlers) handler(path);
  }
}
