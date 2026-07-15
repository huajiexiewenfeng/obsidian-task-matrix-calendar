import type { ParseResult, ParsedTask } from '../markdown/task-parser';

export type CheckboxIntentKind = 'complete' | 'reopen';

export interface CheckboxIntent {
  taskId: string;
  kind: CheckboxIntentKind;
}

export interface CheckboxIntentResult {
  intents: CheckboxIntent[];
  ambiguousTaskIds: string[];
}

function taskIssues(result: ParseResult, taskId: string): string[] {
  return result.issues
    .filter((issue) => issue.taskId === taskId)
    .map((issue) => issue.code);
}

function byId(result: ParseResult): Map<string, ParsedTask> {
  return new Map(result.tasks.map((task) => [task.task.id, task]));
}

export function detectCheckboxIntents(
  previous: ParseResult,
  current: ParseResult,
): CheckboxIntentResult {
  const previousTasks = byId(previous);
  const intents: CheckboxIntent[] = [];
  const ambiguousTaskIds: string[] = [];

  for (const currentTask of current.tasks) {
    const previousTask = previousTasks.get(currentTask.task.id);
    if (!previousTask || previousTask.checkboxChecked === currentTask.checkboxChecked) {
      continue;
    }

    const previousIssues = taskIssues(previous, currentTask.task.id);
    const currentIssues = taskIssues(current, currentTask.task.id);
    const onlyExpectedConflict =
      previousIssues.length === 0 &&
      currentIssues.length === 1 &&
      currentIssues[0] === 'status-checkbox-conflict';
    if (
      previousTask.ownFingerprint !== currentTask.ownFingerprint ||
      !onlyExpectedConflict
    ) {
      ambiguousTaskIds.push(currentTask.task.id);
      continue;
    }

    intents.push({
      taskId: currentTask.task.id,
      kind: currentTask.checkboxChecked ? 'complete' : 'reopen',
    });
  }

  return { intents, ambiguousTaskIds };
}
