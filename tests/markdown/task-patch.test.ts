import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTaskFile } from '../../src/markdown/task-parser';
import { removeTaskBlock, replaceTaskBlock } from '../../src/markdown/task-patch';
import { serializeTaskBlock } from '../../src/markdown/task-serializer';

function canonicalSource(): string {
  return readFileSync(new URL('../fixtures/canonical-tasks.md', import.meta.url), 'utf8');
}

describe('guarded task patches', () => {
  it('replaces exactly one current task block and preserves unrelated prose', () => {
    const source = canonicalSource();
    const parsed = parseTaskFile('任务/任务收件箱.md', source);
    const parent = parsed.tasks[0];
    const children = parsed.tasks.slice(1).map((item) => item.task);
    const replacement = serializeTaskBlock(
      { ...parent.task, title: '发布插件新版' },
      children,
      parent.location.indent,
      parent.location.eol,
    );

    const result = replaceTaskBlock(source, parent, replacement);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toContain('- [ ] 发布插件新版 #task ^task-01JZA1');
      expect(result.source).toContain('任务块之后的普通段落必须保留。');
      expect(result.source).not.toContain('发布开源插件');
    }
  });

  it('rejects replacement when the current block fingerprint changed', () => {
    const source = canonicalSource();
    const parsed = parseTaskFile('任务/任务收件箱.md', source);
    const parent = parsed.tasks[0];
    const changedSource = source.replace('发布开源插件', '外部编辑后的标题');

    expect(replaceTaskBlock(changedSource, parent, 'replacement')).toEqual({
      ok: false,
      code: 'fingerprint-mismatch',
    });
  });

  it('removes a current task block without removing surrounding text', () => {
    const source = canonicalSource();
    const parent = parseTaskFile('任务/任务收件箱.md', source).tasks[0];
    const result = removeTaskBlock(source, parent);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).not.toContain('^task-01JZA1');
      expect(result.source).toContain('这是一段与任务无关的说明文字。');
      expect(result.source).toContain('任务块之后的普通段落必须保留。');
    }
  });
});
