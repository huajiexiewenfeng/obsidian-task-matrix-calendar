import { validateParentCompletion, validateTransition } from '../domain/rules';
import type { TaskNode, TaskQuadrant } from '../domain/task';
import { detectCheckboxIntents, type CheckboxIntent } from '../index/checkbox-intent';
import { TaskIndex } from '../index/task-index';
import type { ParseResult, ParsedTask } from '../markdown/task-parser';
import type { TaskRepository } from '../persistence/obsidian-task-repository';

export interface ClassificationPromptPort {
  chooseQuadrant(taskId: string): Promise<Exclude<TaskQuadrant, 'unclassified'> | null>;
}

function taskById(result: ParseResult, taskId: string): ParsedTask | undefined {
  return result.tasks.find((item) => item.task.id === taskId);
}

function childrenOf(result: ParseResult, taskId: string): TaskNode[] {
  return result.tasks
    .filter((item) => item.task.parentId === taskId)
    .map((item) => item.task);
}

export class ExternalCheckboxCoordinator {
  constructor(
    private readonly repository: TaskRepository,
    private readonly index: TaskIndex,
    private readonly prompt: ClassificationPromptPort,
  ) {}

  async refreshPath(path: string): Promise<void> {
    const previous = this.index.file(path);
    const current = await this.repository.readAndParse(path);
    if (!previous) {
      this.index.replaceFile(path, current);
      return;
    }

    const detected = detectCheckboxIntents(previous, current);
    if (detected.intents.length === 0) {
      this.index.replaceFile(path, current);
      return;
    }

    try {
      for (const intent of detected.intents) {
        await this.reconcile(path, intent);
      }
    } catch (error) {
      this.index.replaceFile(path, await this.repository.readAndParse(path));
      throw error;
    }

    this.index.replaceFile(path, await this.repository.readAndParse(path));
  }

  private async reconcile(path: string, intent: CheckboxIntent): Promise<void> {
    const latest = await this.repository.readAndParse(path);
    const indexed = taskById(latest, intent.taskId);
    if (!indexed) return;
    const children = childrenOf(latest, indexed.task.id);

    if (intent.kind === 'reopen') {
      const ruleError = validateTransition(indexed.task, 'todo');
      if (ruleError) {
        await this.restoreStatusCheckbox(indexed, children);
        return;
      }
      await this.repository.replace(
        indexed,
        { ...indexed.task, status: 'todo' },
        children,
        { intent: 'checkbox-intent' },
      );
      return;
    }

    let quadrant = indexed.task.quadrant;
    if (quadrant === 'unclassified') {
      const selected = await this.prompt.chooseQuadrant(indexed.task.id);
      if (!selected) {
        await this.restoreStatusCheckbox(indexed, children);
        return;
      }
      quadrant = selected;
    }

    const classified = { ...indexed.task, quadrant };
    const transitionError = validateTransition(classified, 'done');
    const parentError = validateParentCompletion(classified, children);
    if (transitionError || parentError) {
      await this.restoreStatusCheckbox(indexed, children);
      return;
    }

    await this.repository.replace(
      indexed,
      { ...classified, status: 'done' },
      children,
      { intent: 'checkbox-intent' },
    );
  }

  private async restoreStatusCheckbox(indexed: ParsedTask, children: TaskNode[]): Promise<void> {
    await this.repository.replace(indexed, indexed.task, children, {
      intent: 'checkbox-intent',
    });
  }
}
