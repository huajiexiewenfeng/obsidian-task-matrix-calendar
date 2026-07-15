import { describe, expect, it } from 'vitest';
import { classifyDateRisk, normalizeDateInput } from '../../src/domain/dates';

describe('normalizeDateInput', () => {
  it('normalizes compact dates to stored ISO dates', () => {
    expect(normalizeDateInput('20260715')).toBe('2026-07-15');
  });

  it('trims valid ISO dates', () => {
    expect(normalizeDateInput(' 2026-07-15 ')).toBe('2026-07-15');
  });

  it('returns undefined for blank input', () => {
    expect(normalizeDateInput('')).toBeUndefined();
  });

  it('rejects invalid calendar dates', () => {
    expect(() => normalizeDateInput('20260230')).toThrowError(/有效日期/);
  });
});

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
