import type { TaskNode, TaskQuadrant, TaskStatus } from '../domain/task';

const SCHEMA_MARKER = '<!-- obsidian-task-schema: 1 -->';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  'in-progress': '进行中',
  paused: '暂停',
  done: '已完成',
};

const QUADRANT_LABELS: Record<TaskQuadrant, string> = {
  unclassified: '未分类',
  'important-urgent': '重要且紧急',
  'important-not-urgent': '重要不紧急',
  'not-important-urgent': '不重要但紧急',
  'not-important-not-urgent': '不重要不紧急',
};

function normalizedTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function serializeSingleTask(task: TaskNode, indent: number): string[] {
  const taskPrefix = ' '.repeat(indent);
  const fieldPrefix = ' '.repeat(indent + 2);
  const lines = [
    `${taskPrefix}- [${task.status === 'done' ? 'x' : ' '}] ${task.title} #task ^${task.id}`,
    `${fieldPrefix}- 状态:: ${STATUS_LABELS[task.status]}`,
    `${fieldPrefix}- 分类:: ${QUADRANT_LABELS[task.quadrant]}`,
  ];

  if (task.project) {
    lines.push(`${fieldPrefix}- 项目:: ${task.project}`);
  }
  const tags = normalizedTags(task.tags);
  if (tags.length > 0) {
    lines.push(`${fieldPrefix}- 标签:: ${tags.join(', ')}`);
  }
  if (task.plannedDate) {
    lines.push(`${fieldPrefix}- 计划日期:: ${task.plannedDate}`);
  }
  if (task.dueDate) {
    lines.push(`${fieldPrefix}- 截止日期:: ${task.dueDate}`);
  }
  if (task.legacyPriority) {
    lines.push(`${fieldPrefix}- 旧优先级:: ${task.legacyPriority}`);
  }

  return lines;
}

export function serializeTaskBlock(
  task: TaskNode,
  children: readonly TaskNode[],
  indent = 0,
  eol: '\n' | '\r\n' = '\n',
): string {
  const lines = serializeSingleTask(task, indent);
  for (const child of children) {
    lines.push(...serializeSingleTask(child, indent + 2));
  }
  return lines.join(eol);
}

export function ensureSchemaMarker(source: string, eol: '\n' | '\r\n'): string {
  const lines = source.split(/\r\n|\n/);
  if (lines.slice(0, 20).some((line) => line.trim() === SCHEMA_MARKER)) {
    return source;
  }

  let insertionIndex = lines.findIndex((line) => /#task \^task-/.test(line));
  if (lines[0]?.trim() === '---') {
    const closingIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
    if (closingIndex >= 0) {
      insertionIndex = closingIndex + 2;
    }
  }
  if (insertionIndex < 0) {
    insertionIndex = 0;
  }

  const insertion = [SCHEMA_MARKER];
  if (lines[insertionIndex] !== '' && lines.length > 0) {
    insertion.push('');
  }
  lines.splice(insertionIndex, 0, ...insertion);
  return lines.join(eol);
}
