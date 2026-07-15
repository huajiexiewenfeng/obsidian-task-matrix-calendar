import {
  makeTask,
  type IndexedTask,
  type LegacyPriority,
  type TaskQuadrant,
  type TaskStatus,
} from '../domain/task';
import { fingerprintTaskBlock } from './fingerprint';

export type ParseIssueCode =
  | 'duplicate-id'
  | 'status-checkbox-conflict'
  | 'invalid-date'
  | 'unknown-task-content'
  | 'max-depth-exceeded'
  | 'missing-field';

export interface ParseIssue {
  code: ParseIssueCode;
  path: string;
  line: number;
  taskId?: string;
  message: string;
}

export interface ParsedTask extends IndexedTask {
  readOnly: boolean;
  checkboxChecked: boolean;
  ownFingerprint: string;
}

export interface ParseResult {
  path: string;
  schemaVersion?: number;
  eol: '\n' | '\r\n';
  tasks: ParsedTask[];
  issues: ParseIssue[];
}

interface TaskLineMatch {
  indent: number;
  checked: boolean;
  title: string;
  id: string;
}

interface ParsedBranch {
  tasks: ParsedTask[];
  nextLine: number;
}

const TASK_LINE = /^( *)- \[([ xX])\] (.+?) #task \^(task-[0-9A-HJKMNP-TV-Z]+)\s*$/;
const PROPERTY_LINE = /^( *)- ([^:]+)::\s*(.*)$/;
const SCHEMA_MARKER = /^<!-- obsidian-task-schema: (\d+) -->$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const STATUS_BY_LABEL: Record<string, TaskStatus> = {
  待办: 'todo',
  进行中: 'in-progress',
  暂停: 'paused',
  已完成: 'done',
};

const QUADRANT_BY_LABEL: Record<string, TaskQuadrant> = {
  未分类: 'unclassified',
  重要且紧急: 'important-urgent',
  重要紧急: 'important-urgent',
  重要不紧急: 'important-not-urgent',
  不重要但紧急: 'not-important-urgent',
  不重要紧急: 'not-important-urgent',
  不重要不紧急: 'not-important-not-urgent',
};

function matchTaskLine(line: string): TaskLineMatch | null {
  const match = TASK_LINE.exec(line);
  if (!match) {
    return null;
  }
  return {
    indent: match[1].length,
    checked: match[2].toLowerCase() === 'x',
    title: match[3].trim(),
    id: match[4],
  };
}

function lineIndent(line: string): number {
  return /^( *)/.exec(line)?.[1].length ?? 0;
}

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseTags(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
}

function normalizeCheckbox(line: string): string {
  return line.replace(/^( *- \[)[ xX](\])/, '$1 $2');
}

export function parseTaskFile(path: string, source: string): ParseResult {
  const eol: '\n' | '\r\n' = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r\n|\n/);
  const issues: ParseIssue[] = [];
  const readOnlyIds = new Set<string>();

  const addIssue = (
    code: ParseIssueCode,
    line: number,
    message: string,
    taskId?: string,
  ): void => {
    issues.push({ code, path, line, taskId, message });
    if (taskId) {
      readOnlyIds.add(taskId);
    }
  };

  const parseTaskAt = (
    startLine: number,
    parentId: string | undefined,
    depth: number,
  ): ParsedBranch => {
    const taskLine = matchTaskLine(lines[startLine]);
    if (!taskLine) {
      return { tasks: [], nextLine: startLine + 1 };
    }

    if (depth > 1) {
      addIssue(
        'max-depth-exceeded',
        startLine,
        '第一版只支持一层子任务。',
        taskLine.id,
      );
    }

    let status: TaskStatus | undefined;
    let quadrant: TaskQuadrant | undefined;
    let project: string | undefined;
    let plannedDate: string | undefined;
    let dueDate: string | undefined;
    let legacyPriority: LegacyPriority | undefined;
    let tags: string[] = [];
    let cursor = startLine + 1;
    let sawChild = false;
    const childIds: string[] = [];
    const descendants: ParsedTask[] = [];
    const seenFields = new Set<string>();
    const ownLines = [normalizeCheckbox(lines[startLine])];

    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.trim() === '') {
        break;
      }

      const indent = lineIndent(line);
      if (indent <= taskLine.indent) {
        break;
      }

      const childLine = matchTaskLine(line);
      if (childLine && childLine.indent === taskLine.indent + 2) {
        sawChild = true;
        const branch = parseTaskAt(cursor, taskLine.id, depth + 1);
        if (branch.tasks[0]) {
          childIds.push(branch.tasks[0].task.id);
          descendants.push(...branch.tasks);
        }
        cursor = branch.nextLine;
        continue;
      }

      const property = PROPERTY_LINE.exec(line);
      if (property && property[1].length === taskLine.indent + 2) {
        const label = property[2].trim();
        const value = property[3].trim();
        if (sawChild || seenFields.has(label)) {
          addIssue(
            'unknown-task-content',
            cursor,
            sawChild ? '父任务属性必须位于第一个子任务之前。' : `字段 ${label} 重复。`,
            taskLine.id,
          );
        }
        seenFields.add(label);
        if (!sawChild) {
          ownLines.push(line);
        }

        switch (label) {
          case '状态':
            status = STATUS_BY_LABEL[value];
            if (!status) {
              addIssue('unknown-task-content', cursor, `未知状态：${value}`, taskLine.id);
            }
            break;
          case '分类':
            quadrant = QUADRANT_BY_LABEL[value];
            if (!quadrant) {
              addIssue('unknown-task-content', cursor, `未知分类：${value}`, taskLine.id);
            }
            break;
          case '项目':
            project = value || undefined;
            break;
          case '标签':
            tags = parseTags(value);
            break;
          case '计划日期':
            plannedDate = value || undefined;
            if (plannedDate && !isValidIsoDate(plannedDate)) {
              addIssue('invalid-date', cursor, `非法计划日期：${value}`, taskLine.id);
            }
            break;
          case '截止日期':
            dueDate = value || undefined;
            if (dueDate && !isValidIsoDate(dueDate)) {
              addIssue('invalid-date', cursor, `非法截止日期：${value}`, taskLine.id);
            }
            break;
          case '旧优先级':
            if (/^P[0-4]$/.test(value)) {
              legacyPriority = value as LegacyPriority;
            } else if (value) {
              addIssue('unknown-task-content', cursor, `非法旧优先级：${value}`, taskLine.id);
            }
            break;
          default:
            addIssue('unknown-task-content', cursor, `未知任务字段：${label}`, taskLine.id);
        }
        cursor += 1;
        continue;
      }

      addIssue('unknown-task-content', cursor, '任务块包含无法识别的缩进内容。', taskLine.id);
      if (!sawChild) {
        ownLines.push(line);
      }
      cursor += 1;
    }

    if (!status) {
      addIssue('missing-field', startLine, '缺少有效的状态字段。', taskLine.id);
    }
    if (!quadrant) {
      addIssue('missing-field', startLine, '缺少有效的分类字段。', taskLine.id);
    }

    const resolvedStatus = status ?? 'todo';
    if (taskLine.checked !== (resolvedStatus === 'done')) {
      addIssue(
        'status-checkbox-conflict',
        startLine,
        'checkbox 与状态字段不一致。',
        taskLine.id,
      );
    }

    const endLine = Math.max(startLine, cursor - 1);
    const task = makeTask({
      id: taskLine.id,
      title: taskLine.title,
      status: resolvedStatus,
      quadrant: quadrant ?? 'unclassified',
      project,
      tags,
      plannedDate,
      dueDate,
      legacyPriority,
      parentId,
      childrenIds: childIds,
    });
    const parsed: ParsedTask = {
      task,
      location: {
        sourcePath: path,
        startLine,
        endLine,
        indent: taskLine.indent,
        eol,
        fingerprint: fingerprintTaskBlock(lines.slice(startLine, endLine + 1).join(eol)),
      },
      readOnly: readOnlyIds.has(taskLine.id),
      checkboxChecked: taskLine.checked,
      ownFingerprint: fingerprintTaskBlock(ownLines.join(eol)),
    };

    return { tasks: [parsed, ...descendants], nextLine: cursor };
  };

  const tasks: ParsedTask[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const taskLine = matchTaskLine(lines[cursor]);
    if (!taskLine) {
      cursor += 1;
      continue;
    }
    const branch = parseTaskAt(cursor, undefined, 0);
    tasks.push(...branch.tasks);
    cursor = branch.nextLine;
  }

  const tasksById = new Map<string, ParsedTask[]>();
  for (const task of tasks) {
    const duplicates = tasksById.get(task.task.id) ?? [];
    duplicates.push(task);
    tasksById.set(task.task.id, duplicates);
  }
  for (const [id, duplicates] of tasksById) {
    if (duplicates.length < 2) {
      continue;
    }
    for (const duplicate of duplicates) {
      addIssue('duplicate-id', duplicate.location.startLine, `任务 ID ${id} 重复。`, id);
      duplicate.readOnly = true;
    }
  }

  for (const task of tasks) {
    if (readOnlyIds.has(task.task.id)) {
      task.readOnly = true;
    }
  }

  let schemaVersion: number | undefined;
  for (const line of lines.slice(0, 20)) {
    const match = SCHEMA_MARKER.exec(line.trim());
    if (match) {
      schemaVersion = Number(match[1]);
      break;
    }
  }

  return { path, schemaVersion, eol, tasks, issues };
}
