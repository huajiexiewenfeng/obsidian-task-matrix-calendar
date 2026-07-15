import type { TaskMatrixCalendarSettings } from '../settings';
import { normalizeVaultPath } from '../settings';
import { parseTaskFile } from '../markdown/task-parser';
import type { TaskIndex } from './task-index';
import { isManagedMarkdownPath } from './managed-path';

export interface VaultReadPort {
  listMarkdownPaths(): string[];
  read(path: string): Promise<string>;
}

export interface MetadataHints {
  listItems: unknown[];
  blocks: unknown[];
}

export interface MetadataHintProvider {
  getHints(path: string): MetadataHints | null;
}

export class TaskScanner {
  private scannedPaths = new Set<string>();

  constructor(
    private readonly vault: VaultReadPort,
    private readonly index: TaskIndex,
    private readonly settings: TaskMatrixCalendarSettings,
    private readonly hints?: MetadataHintProvider,
  ) {}

  async scanAll(): Promise<void> {
    const paths = new Map<string, string>();
    for (const path of this.vault.listMarkdownPaths()) {
      const normalized = normalizeVaultPath(path);
      if (this.shouldScan(normalized) && !paths.has(normalized.toLocaleLowerCase())) {
        paths.set(normalized.toLocaleLowerCase(), path);
      }
    }

    const nextPaths = new Set<string>();
    for (const path of paths.values()) {
      const normalized = normalizeVaultPath(path);
      await this.scanPath(normalized, path);
      nextPaths.add(normalized);
    }
    for (const oldPath of this.scannedPaths) {
      if (!nextPaths.has(oldPath)) this.index.removeFile(oldPath);
    }
    this.scannedPaths = nextPaths;
  }

  async refreshPath(path: string): Promise<void> {
    const normalized = normalizeVaultPath(path);
    if (!this.shouldScan(normalized)) {
      this.index.removeFile(normalized);
      this.scannedPaths.delete(normalized);
      return;
    }
    await this.scanPath(normalized, path);
    this.scannedPaths.add(normalized);
  }

  isManagedPath(path: string): boolean {
    return this.shouldScan(normalizeVaultPath(path));
  }

  private async scanPath(indexPath: string, readPath: string): Promise<void> {
    this.hints?.getHints(indexPath);
    const source = await this.vault.read(readPath);
    this.index.replaceFile(indexPath, parseTaskFile(indexPath, source));
  }

  private shouldScan(path: string): boolean {
    return isManagedMarkdownPath(path, this.settings);
  }
}
