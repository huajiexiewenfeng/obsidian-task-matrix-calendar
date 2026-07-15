// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { parseTaskFile } from '../../src/markdown/task-parser';
import { TaskEditorDrawer } from '../../src/ui/task-editor-drawer';

const source = [
  '- [ ] 编辑任务 #task ^task-A1',
  '  - 状态:: 待办',
  '  - 分类:: 重要且紧急',
  '  - 项目:: 原项目',
].join('\n');

describe('TaskEditorDrawer', () => {
  it('renders fields and sends one typed update patch on save', async () => {
    const container = document.createElement('div');
    const service = { update: vi.fn().mockResolvedValue(undefined) };
    const trash = { moveToTrash: vi.fn().mockResolvedValue(undefined) };
    const locate = vi.fn();
    const drawer = new TaskEditorDrawer(container, service, trash, locate);
    drawer.open(parseTaskFile('任务/a.md', source).tasks[0]);

    const title = container.querySelector<HTMLInputElement>('[name="title"]')!;
    title.value = '修改标题';
    container.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await Promise.resolve();

    expect(container.textContent).toContain('任务/a.md');
    expect(service.update).toHaveBeenCalledTimes(1);
    expect(service.update).toHaveBeenCalledWith('task-A1', expect.objectContaining({
      title: '修改标题',
      quadrant: 'important-urgent',
    }));
    container.querySelector<HTMLButtonElement>('[data-action="locate"]')!.click();
    expect(locate).toHaveBeenCalledWith('task-A1');
  });
});
