import type { IndexedTask, TaskNode, TaskQuadrant, TaskStatus } from '../domain/task';

export interface TaskEditorServicePort {
  update(id: string, patch: Partial<Omit<TaskNode, 'id' | 'childrenIds'>>): Promise<void>;
  create?(input: { title: string; parentId?: string }): Promise<TaskNode>;
}

export interface TaskEditorTrashPort {
  moveToTrash(taskId: string, deletedAt: string): Promise<void>;
}

function field(label: string, input: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement('label');
  const caption = document.createElement('span');
  caption.textContent = label;
  wrapper.append(caption, input);
  return wrapper;
}

function input(name: string, value = '', type = 'text'): HTMLInputElement {
  const element = document.createElement('input');
  element.name = name;
  element.type = type;
  element.value = value;
  return element;
}

function select<T extends string>(name: string, value: T, choices: Array<[T, string]>): HTMLSelectElement {
  const element = document.createElement('select');
  element.name = name;
  for (const [choice, label] of choices) {
    const option = document.createElement('option');
    option.value = choice;
    option.textContent = label;
    option.selected = choice === value;
    element.append(option);
  }
  return element;
}

export class TaskEditorDrawer {
  private current?: IndexedTask;

  constructor(
    private readonly container: HTMLElement,
    private readonly service: TaskEditorServicePort,
    private readonly trash: TaskEditorTrashPort,
    private readonly locate: (taskId: string) => void,
  ) {}

  open(indexed: IndexedTask): void {
    this.current = indexed;
    const { task } = indexed;
    this.container.replaceChildren();
    this.container.className = 'tmc-editor-drawer';
    const heading = document.createElement('h3');
    heading.textContent = '编辑任务';
    const source = document.createElement('p');
    source.className = 'tmc-source-path';
    source.textContent = `来源：${indexed.location.sourcePath}`;
    this.container.append(heading, source);

    const title = input('title', task.title);
    const status = select<TaskStatus>('status', task.status, [
      ['todo', '待办'], ['in-progress', '进行中'], ['paused', '暂停'], ['done', '已完成'],
    ]);
    const quadrant = select<TaskQuadrant>('quadrant', task.quadrant, [
      ['unclassified', '未分类'], ['important-urgent', '重要且紧急'],
      ['important-not-urgent', '重要不紧急'], ['not-important-urgent', '不重要但紧急'],
      ['not-important-not-urgent', '不重要不紧急'],
    ]);
    const project = input('project', task.project ?? '');
    const tags = input('tags', task.tags.join(', '));
    const plannedDate = input('plannedDate', task.plannedDate ?? '', 'date');
    const dueDate = input('dueDate', task.dueDate ?? '', 'date');
    this.container.append(
      field('任务标题', title), field('状态', status), field('四象限', quadrant),
      field('计划日期', plannedDate), field('截止日期', dueDate), field('项目', project),
      field('标签', tags),
    );

    if (this.service.create) {
      const children = document.createElement('section');
      const childHeading = document.createElement('h4');
      childHeading.textContent = `子任务 · ${task.childrenIds.length}`;
      const childTitle = input('childTitle', '');
      childTitle.placeholder = '输入子任务标题';
      const addChild = document.createElement('button');
      addChild.type = 'button';
      addChild.dataset.action = 'add-child';
      addChild.textContent = '+ 添加子任务';
      addChild.addEventListener('click', () => {
        const value = childTitle.value.trim();
        if (value && this.current) {
          void this.service.create?.({ title: value, parentId: this.current.task.id });
          childTitle.value = '';
        }
      });
      children.append(childHeading, childTitle, addChild);
      this.container.append(children);
    }

    const controls = document.createElement('div');
    controls.className = 'tmc-drawer-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.dataset.action = 'save';
    save.textContent = '保存';
    save.addEventListener('click', () => {
      if (!this.current) return;
      void this.service.update(this.current.task.id, {
        title: title.value,
        status: status.value as TaskStatus,
        quadrant: quadrant.value as TaskQuadrant,
        project: project.value,
        tags: tags.value.split(',').map((tag) => tag.trim()).filter(Boolean),
        plannedDate: plannedDate.value || undefined,
        dueDate: dueDate.value || undefined,
      });
    });
    const locate = document.createElement('button');
    locate.type = 'button';
    locate.dataset.action = 'locate';
    locate.textContent = '在文档中定位';
    locate.addEventListener('click', () => this.current && this.locate(this.current.task.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.action = 'trash';
    remove.textContent = '移到回收站';
    remove.addEventListener('click', () => {
      if (this.current) void this.trash.moveToTrash(this.current.task.id, new Date().toISOString());
    });
    controls.append(save, locate, remove);
    this.container.append(controls);
  }
}
