// @vitest-environment jsdom
import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { ClassificationModal } from '../../src/ui/classification-modal';

describe('ClassificationModal', () => {
  it('offers exactly four classified quadrants and resolves one selection', async () => {
    const modal = new ClassificationModal({} as App);
    const result = modal.chooseQuadrant('task-A1');
    const choices = modal.contentEl.querySelectorAll<HTMLButtonElement>('[data-quadrant]');
    expect(choices).toHaveLength(4);

    choices[1].click();

    await expect(result).resolves.toBe('important-not-urgent');
  });

  it('resolves null when cancelled', async () => {
    const modal = new ClassificationModal({} as App);
    const result = modal.chooseQuadrant('task-A1');

    modal.close();

    await expect(result).resolves.toBeNull();
  });
});
