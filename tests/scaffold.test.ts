import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('plugin scaffold', () => {
  it('declares the desktop plugin identity', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      id: 'task-matrix-calendar',
      name: 'Task Matrix Calendar',
      version: '0.1.0',
      minAppVersion: '1.12.7',
      isDesktopOnly: true,
    });
  });

  it('styles the released workspace with Obsidian theme variables', () => {
    const styles = readFileSync('styles.css', 'utf8');

    for (const selector of [
      '.tmc-mode-switch',
      '.tmc-task-form',
      '.tmc-calendar-sidebar',
      '.tmc-unscheduled-tasks',
      '.tmc-migration-errors',
      ':focus-visible',
    ]) {
      expect(styles).toContain(selector);
    }

    for (const emittedSelector of [
      '.tmc-workspace-modes',
      '.tmc-task-form-modal form',
      '.tmc-calendar-view',
      '[data-role="selected-day"]',
      '[data-role="unscheduled"]',
      '[data-migration-error]',
      '[data-form-error]',
      '.tmc-calendar-day.is-selected',
      '.task-matrix-calendar textarea',
      ':disabled',
    ]) {
      expect(styles).toContain(emittedSelector);
    }

    expect(styles).toContain('var(--text-normal)');
    expect(styles).toContain('var(--background-primary)');
    expect(styles).not.toContain('.tmc-drawer-');

    const foregroundAndBackgroundDeclarations = styles
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(?:color|background(?:-color)?):/.test(line));
    expect(foregroundAndBackgroundDeclarations.length).toBeGreaterThan(0);
    for (const declaration of foregroundAndBackgroundDeclarations) {
      expect(declaration).toContain('var(--');
    }
  });

  it('documents the released workspace, task form, and migration behavior', () => {
    const readme = readFileSync('README.md', 'utf8');

    for (const behavior of [
      '“任务 / 日历”在同一个任务工作区内切换并共享筛选状态。',
      '“+ 新任务”和“编辑”使用同一个弹窗；详情支持多行。',
      '开始日期可输入 `YYYYMMDD` 或 `YYYY-MM-DD`，保存为 `计划日期:: YYYY-MM-DD`。',
      '“导入旧任务”自动扫描设置中的任务目录；默认只勾选高置信度候选，确认前可修改识别结果。',
      '  - 详情::',
      '    > 第一行',
    ]) {
      expect(readme).toContain(behavior);
    }
    expect(readme).not.toContain('快速创建');
  });
});
