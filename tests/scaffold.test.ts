import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('plugin scaffold', () => {
  it('declares the desktop plugin identity', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      id: 'task-matrix-calendar',
      name: 'Task Matrix Calendar',
      version: '0.1.0',
      minAppVersion: '1.12.7',
      isDesktopOnly: true,
    });
  });
});
