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
      '.tmc-workspace-header',
      '.tmc-filter-chip',
      '.tmc-filter-controls',
      '.tmc-filter-active',
      '.tmc-task-section-header',
      '.tmc-task-card-main',
      '.tmc-form-grid',
      '.tmc-form-section',
      '.tmc-import-progress',
      '.tmc-import-evidence',
      '.tmc-import-actions',
      '.tmc-import-review-workspace',
      '.tmc-import-candidate-list',
      '.tmc-import-editor-panel',
      '.tmc-calendar-panels',
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
    for (const obsoleteSelector of [
      '.tmc-mode-switch',
      '.tmc-calendar-layout',
      '.tmc-calendar-sidebar',
      '.tmc-unscheduled-tasks',
      '.tmc-migration-errors',
      '.tmc-source-path',
      '.tmc-form-error',
      '.tmc-migration-row',
      '[data-migration-failures]',
      '[data-migration-error]',
    ]) {
      expect(styles).not.toContain(obsoleteSelector);
    }
    expect(styles).not.toMatch(/\.tmc-task-form(?=[\s,{>:+~])/);

    const foregroundAndBackgroundDeclarations = styles
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(?:color|background(?:-color)?):/.test(line));
    expect(foregroundAndBackgroundDeclarations.length).toBeGreaterThan(0);
    for (const declaration of foregroundAndBackgroundDeclarations) {
      expect(declaration).toContain('var(--');
    }
  });

  it('keeps the import wizard within the viewport and splits review into two scrollable panes', () => {
    const styles = readFileSync('styles.css', 'utf8');

    expect(styles).toMatch(
      /\.tmc-import-wizard\s*\{[^}]*width:\s*min\(1240px,\s*calc\(100vw - 48px\)\)/s,
    );
    expect(styles).toMatch(
      /\.tmc-import-review-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(320px,\s*38%\)\s+minmax\(0,\s*62%\)/s,
    );
    expect(styles).toContain('overflow-x: hidden');
  });

  it('reflows controls from the task pane width instead of only the app viewport', () => {
    const styles = readFileSync('styles.css', 'utf8');

    expect(styles).toMatch(/\.tmc-task-workspace\s*\{[^}]*container-type:\s*inline-size;/s);
    expect(styles).toMatch(
      /@container\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.tmc-filter-controls\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    );
  });

  it('documents the released workspace, task form, and migration behavior', () => {
    const readme = readFileSync('README.md', 'utf8');

    for (const behavior of [
      '“任务矩阵 / 日历”在同一个任务工作区内切换并共享筛选状态。',
      '搜索与项目、状态、截止风险、来源筛选可以一键清除。',
      '“+ 新任务”和“编辑”使用同一个分组弹窗；详情支持多行。',
      '开始日期可输入 `YYYYMMDD` 或 `YYYY-MM-DD`，保存为 `计划日期:: YYYY-MM-DD`。',
      '旧任务导入先选择 Markdown 文件，再核对候选，最后确认备份与写入。',
      '复选框候选默认选中；普通列表候选默认不选中。',
      '最终确认时，插件会先为每个来源创建时间戳备份，再在写入事务中检查来源是否变化；过期计划会被拒绝且不会改动源文档。',
      '  - 详情::',
      '    > 第一行',
    ]) {
      expect(readme).toContain(behavior);
    }
    expect(readme).not.toContain('快速创建');
  });
});
