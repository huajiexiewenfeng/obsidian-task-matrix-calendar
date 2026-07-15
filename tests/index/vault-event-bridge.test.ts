import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultEventBridge } from '../../src/index/vault-event-bridge';
import { FakeVault } from '../fakes/fake-vault';

describe('VaultEventBridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces repeated create and modify events per path', async () => {
    const vault = new FakeVault();
    const refresh = vi.fn(async () => undefined);
    const remove = vi.fn();
    const bridge = new VaultEventBridge(vault, refresh, remove, 75);
    bridge.start();

    vault.emitCreate('任务/a.md');
    vault.emitModify('任务/a.md');
    vault.emitModify('任务/a.md');
    await vi.advanceTimersByTimeAsync(74);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith('任务/a.md');
  });

  it('removes old paths on rename and delete and disposes handlers', async () => {
    const vault = new FakeVault();
    const refresh = vi.fn(async () => undefined);
    const remove = vi.fn();
    const bridge = new VaultEventBridge(vault, refresh, remove, 75);
    bridge.start();

    vault.emitRename('任务/a.md', '任务/b.md');
    expect(remove).toHaveBeenCalledWith('任务/a.md');
    await vi.advanceTimersByTimeAsync(75);
    expect(refresh).toHaveBeenCalledWith('任务/b.md');

    vault.emitModify('任务/b.md');
    vault.emitDelete('任务/b.md');
    expect(remove).toHaveBeenCalledWith('任务/b.md');
    await vi.advanceTimersByTimeAsync(75);
    expect(refresh).toHaveBeenCalledTimes(1);

    bridge.dispose();
    vault.emitModify('任务/c.md');
    await vi.advanceTimersByTimeAsync(75);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
