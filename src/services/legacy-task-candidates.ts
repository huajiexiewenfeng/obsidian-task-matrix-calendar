import { createTaskId } from '../domain/id';
import { makeTask, type LegacyPriority, type TaskNode, type TaskStatus } from '../domain/task';
import { parseTaskFile } from '../markdown/task-parser';

export type MigrationRecognitionKind = 'checkbox' | 'list-item';

export interface MigrationRecognition {
  kind: MigrationRecognitionKind;
  reason: 'Markdown 复选框' | '普通列表，仅作为候选';
  defaultSelected: boolean;
}

export interface MigrationCandidate {
  candidateId: string;
  sourcePath: string;
  startLine: number;
  endLine: number;
  originalText: string;
  recognition: MigrationRecognition;
  proposed: TaskNode;
}

type IdFactory = () => string;

const CHECKBOX = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/;
const LIST_ITEM = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/;
const STATUS_MARKERS: Array<[RegExp, TaskStatus]> = [
  [/（完成）|\(完成\)/, 'done'],
  [/（进行中）|\(进行中\)/, 'in-progress'],
  [/（暂停）|\(暂停\)/, 'paused'],
];
const DASHED_DATE_HEADING = /^##\s+(\d{4})-(\d{1,2})-(\d{1,2})\s*$/;
const COMPACT_DATE_HEADING = /^##\s+(\d{4})(\d{2})(\d{2})\s*$/;
const LEGACY_PRIORITY = /\b(P[0-4])\b/;

function normalizeDateHeading(line: string): string | undefined {
  const match = DASHED_DATE_HEADING.exec(line) ?? COMPACT_DATE_HEADING.exec(line);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function occupiedTaskLines(path: string, source: string): Set<number> {
  const occupied = new Set<number>();
  for (const parsed of parseTaskFile(path, source).tasks) {
    for (let line = parsed.location.startLine; line <= parsed.location.endLine; line += 1) {
      occupied.add(line);
    }
  }
  return occupied;
}

function findStatus(content: string): TaskStatus | undefined {
  return STATUS_MARKERS.find(([marker]) => marker.test(content))?.[1];
}

function cleanTitle(content: string): string {
  let title = content;
  for (const [marker] of STATUS_MARKERS) {
    title = title.replace(marker, '');
  }
  return title.replace(LEGACY_PRIORITY, '').replace(/\s+/g, ' ').trim();
}

export function extractLegacyCandidates(
  path: string,
  source: string,
  makeId: IdFactory = createTaskId,
): MigrationCandidate[] {
  const lines = source.split(/\r\n|\n/);
  const occupied = occupiedTaskLines(path, source);
  const candidates: MigrationCandidate[] = [];
  let plannedDate: string | undefined;

  for (let line = 0; line < lines.length; line += 1) {
    plannedDate = normalizeDateHeading(lines[line]) ?? plannedDate;
    if (occupied.has(line)) {
      continue;
    }

    const checkbox = CHECKBOX.exec(lines[line]);
    const listItem = checkbox ? null : LIST_ITEM.exec(lines[line]);
    if (!checkbox && !listItem) {
      continue;
    }

    const content = (checkbox?.[2] ?? listItem?.[1]) as string;
    const markerStatus = findStatus(content);
    const checked = checkbox?.[1].toLowerCase() === 'x';
    const priority = LEGACY_PRIORITY.exec(content)?.[1] as LegacyPriority | undefined;
    const kind: MigrationRecognitionKind = checkbox ? 'checkbox' : 'list-item';

    candidates.push({
      candidateId: `migration:${path}:${line}`,
      sourcePath: path,
      startLine: line,
      endLine: line,
      originalText: lines[line],
      recognition: {
        kind,
        reason: checkbox ? 'Markdown 复选框' : '普通列表，仅作为候选',
        defaultSelected: Boolean(checkbox),
      },
      proposed: makeTask({
        id: makeId(),
        title: cleanTitle(content),
        status: checked ? 'done' : markerStatus ?? 'todo',
        plannedDate,
        legacyPriority: priority,
      }),
    });
  }

  return candidates;
}
