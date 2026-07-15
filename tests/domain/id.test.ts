import { describe, expect, it } from 'vitest';
import { createTaskId } from '../../src/domain/id';

describe('createTaskId', () => {
  it('creates a task-prefixed Crockford Base32 ULID', () => {
    expect(createTaskId(1_752_537_600_000, () => 0)).toMatch(
      /^task-[0-9A-HJKMNP-TV-Z]{26}$/,
    );
  });

  it('creates unique ids across a batch', () => {
    const ids = new Set(Array.from({ length: 1_000 }, () => createTaskId()));
    expect(ids.size).toBe(1_000);
  });
});
