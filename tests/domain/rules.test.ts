import { describe, expect, it } from 'vitest';
import { makeTask } from '../../src/domain/task';
import { validateParentCompletion, validateTransition } from '../../src/domain/rules';

describe('task rules', () => {
  it('blocks starting an unclassified task', () => {
    const task = makeTask({ id: 'task-01', title: '整理任务' });
    expect(validateTransition(task, 'in-progress')).toEqual({
      code: 'classification-required',
      message: '任务进入进行中或完成前必须选择四象限分类。',
    });
  });

  it('allows classified todo to start and paused task to resume', () => {
    const todo = makeTask({ id: 'task-02', title: '设计方案', quadrant: 'important-not-urgent' });
    const paused = { ...todo, status: 'paused' as const };
    expect(validateTransition(todo, 'in-progress')).toBeNull();
    expect(validateTransition(paused, 'in-progress')).toBeNull();
  });

  it('allows classified todo and paused tasks to complete', () => {
    const todo = makeTask({
      id: 'task-03',
      title: '顺手完成的小任务',
      quadrant: 'not-important-not-urgent',
    });
    const paused = { ...todo, status: 'paused' as const };
    expect(validateTransition(todo, 'done')).toBeNull();
    expect(validateTransition(paused, 'done')).toBeNull();
  });

  it('requires classification before direct todo completion', () => {
    const task = makeTask({ id: 'task-04', title: '需要先分类' });
    expect(validateTransition(task, 'done')).toEqual({
      code: 'classification-required',
      message: '任务进入进行中或完成前必须选择四象限分类。',
    });
  });

  it('rejects transitions outside the state machine', () => {
    const task = makeTask({
      id: 'task-05',
      title: '非法流转',
      quadrant: 'important-urgent',
      status: 'done',
    });
    expect(validateTransition(task, 'paused')).toEqual({
      code: 'invalid-transition',
      message: '不能从已完成切换到暂停。',
    });
  });

  it('blocks a parent with unfinished children from completing', () => {
    const parent = makeTask({ id: 'task-parent', title: '长期任务' });
    const child = makeTask({ id: 'task-child', title: '子任务', parentId: parent.id });
    expect(validateParentCompletion(parent, [child])).toEqual({
      code: 'unfinished-children',
      message: '所有子任务完成后才能完成父任务。',
    });
  });

  it('allows parent completion when every child is done', () => {
    const parent = makeTask({ id: 'task-parent', title: '长期任务' });
    const child = makeTask({
      id: 'task-child',
      title: '子任务',
      parentId: parent.id,
      status: 'done',
    });
    expect(validateParentCompletion(parent, [child])).toBeNull();
  });
});
