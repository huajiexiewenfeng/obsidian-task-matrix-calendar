import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { TaskIndex } from '../src/index/task-index';
import { TaskScanner } from '../src/index/task-scanner';
import { VaultEventBridge } from '../src/index/vault-event-bridge';
import { DEFAULT_SETTINGS } from '../src/settings';
import { FakeVault } from './fakes/fake-vault';

function block(file: number, task: number): string {
  return [
    `- [ ] 任务 ${file}-${task} #task ^task-${file}A${task}`,
    '  - 状态:: 待办',
    '  - 分类:: 重要不紧急',
  ].join('\n');
}

describe('performance gates', () => {
  it('indexes 5,000 tasks from 1,000 files within 3 seconds', async () => {
    const files: Record<string, string> = {};
    for (let file = 0; file < 1_000; file += 1) {
      files[`任务/性能/${file}.md`] = Array.from({ length: 5 }, (_, task) => block(file, task)).join('\n\n');
    }
    const vault = new FakeVault(files);
    const index = new TaskIndex();
    const scanner = new TaskScanner(vault, index, DEFAULT_SETTINGS);
    const start = performance.now();
    await scanner.scanAll();
    const duration = performance.now() - start;
    expect(index.snapshot().tasks).toHaveLength(5_000);
    expect(duration, `full scan took ${duration.toFixed(1)} ms`).toBeLessThan(3_000);
  });

  it('debounces and refreshes one changed file within 200 ms', async () => {
    vi.useRealTimers();
    const path = '任务/a.md';
    const vault = new FakeVault({ [path]: block(1, 1) });
    const index = new TaskIndex();
    const scanner = new TaskScanner(vault, index, DEFAULT_SETTINGS);
    await scanner.scanAll();
    const bridge = new VaultEventBridge(vault, (changed) => scanner.refreshPath(changed), (deleted) => index.removeFile(deleted));
    bridge.start();
    const start = performance.now();
    vault.set(path, block(1, 1).replace('任务 1-1', '已修改'));
    vault.emitModify(path);
    await new Promise((resolve) => setTimeout(resolve, 110));
    const duration = performance.now() - start;
    bridge.dispose();
    expect(index.snapshot().tasks[0]?.task.title).toBe('已修改');
    expect(duration, `incremental refresh took ${duration.toFixed(1)} ms`).toBeLessThan(200);
  });
});
