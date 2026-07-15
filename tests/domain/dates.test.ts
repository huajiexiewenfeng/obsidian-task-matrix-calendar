import { describe, expect, it } from 'vitest';
import { classifyDateRisk } from '../../src/domain/dates';

describe('classifyDateRisk', () => {
  const today = '2026-07-15';

  it('classifies overdue, today, and upcoming deadlines with day precision', () => {
    expect(classifyDateRisk('2026-07-14', 'todo', today, 3)).toBe('overdue');
    expect(classifyDateRisk('2026-07-15', 'todo', today, 3)).toBe('due-today');
    expect(classifyDateRisk('2026-07-18', 'todo', today, 3)).toBe('upcoming');
  });

  it('returns none outside the upcoming window', () => {
    expect(classifyDateRisk('2026-07-19', 'todo', today, 3)).toBe('none');
  });

  it('returns none without a deadline or for completed tasks', () => {
    expect(classifyDateRisk(undefined, 'todo', today, 3)).toBe('none');
    expect(classifyDateRisk('2026-07-14', 'done', today, 3)).toBe('none');
  });

  it('treats a negative upcoming window as zero', () => {
    expect(classifyDateRisk('2026-07-16', 'todo', today, -1)).toBe('none');
  });
});
