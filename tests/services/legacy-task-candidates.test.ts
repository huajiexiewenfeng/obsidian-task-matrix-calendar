import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractLegacyCandidates } from '../../src/services/legacy-task-candidates';

const source = readFileSync(
  new URL('../fixtures/legacy-mixed-tasks.md', import.meta.url),
  'utf8',
);

describe('extractLegacyCandidates', () => {
  it('recognizes only checkbox and list syntax and exposes source evidence', () => {
    let next = 0;
    const candidates = extractLegacyCandidates(
      '任务/旧任务.md',
      source,
      () => `task-LEGACY${++next}`,
    );

    expect(candidates).toHaveLength(3);
    expect(candidates.map((item) => item.proposed.title)).toEqual([
      '明确待办', '普通列表', '编号列表',
    ]);
    expect(candidates.map((item) => item.recognition.kind)).toEqual([
      'checkbox', 'list-item', 'list-item',
    ]);
    expect(candidates.map((item) => item.recognition.defaultSelected)).toEqual([
      true, false, false,
    ]);
    expect(candidates[0]).toMatchObject({
      candidateId: 'migration:任务/旧任务.md:4',
      sourcePath: '任务/旧任务.md',
      startLine: 4,
      endLine: 4,
      originalText: '- [ ] 明确待办 P1',
      recognition: { reason: 'Markdown 复选框' },
      proposed: { plannedDate: '2026-07-15', status: 'todo', legacyPriority: 'P1' },
    });
    expect(candidates[1].proposed.status).toBe('in-progress');
    expect(candidates.some((item) => item.originalText === '普通正文 P0')).toBe(false);
    expect(candidates.map((item) => item.originalText)).not.toContain(
      '- [ ] 已受管任务 #task ^task-MANAGED1',
    );
    expect(candidates.map((item) => item.proposed.title)).not.toContain('已受管任务');
    expect(candidates.map((item) => item.startLine)).not.toContain(12);
  });

  it('maps a checked checkbox to done independently from the strict fixture', () => {
    const candidates = extractLegacyCandidates(
      '任务/已完成.md',
      '- [x] 明确完成（完成）',
      () => 'task-LEGACY1',
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      originalText: '- [x] 明确完成（完成）',
      recognition: {
        kind: 'checkbox',
        defaultSelected: true,
      },
      proposed: {
        title: '明确完成',
        status: 'done',
      },
    });
  });

  it('normalizes compact date headings for recognized list items only', () => {
    const candidates = extractLegacyCandidates(
      '任务/紧凑日期.md',
      '## 20260715\n- 普通列表 P4\n普通正文（暂停）',
      () => 'task-LEGACY1',
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      candidateId: 'migration:任务/紧凑日期.md:1',
      startLine: 1,
      endLine: 1,
      recognition: {
        kind: 'list-item',
        reason: '普通列表，仅作为候选',
        defaultSelected: false,
      },
      proposed: {
        id: 'task-LEGACY1',
        title: '普通列表',
        status: 'todo',
        plannedDate: '2026-07-15',
        legacyPriority: 'P4',
      },
    });
  });
});
