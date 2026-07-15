import type { IndexedTask } from '../domain/task';
import { fingerprintTaskBlock } from './fingerprint';

export type TaskPatchResult =
  | { ok: true; source: string }
  | { ok: false; code: 'task-location-invalid' | 'fingerprint-mismatch' };

interface CurrentBlock {
  eol: '\n' | '\r\n';
  lines: string[];
  block: string;
}

function currentBlock(source: string, indexed: IndexedTask): CurrentBlock | null {
  const eol: '\n' | '\r\n' = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r\n|\n/);
  const { startLine, endLine } = indexed.location;
  if (startLine < 0 || endLine < startLine || endLine >= lines.length) {
    return null;
  }
  return {
    eol,
    lines,
    block: lines.slice(startLine, endLine + 1).join(eol),
  };
}

function verifyCurrentBlock(source: string, indexed: IndexedTask): CurrentBlock | TaskPatchResult {
  const current = currentBlock(source, indexed);
  if (!current) {
    return { ok: false, code: 'task-location-invalid' };
  }
  if (fingerprintTaskBlock(current.block) !== indexed.location.fingerprint) {
    return { ok: false, code: 'fingerprint-mismatch' };
  }
  return current;
}

export function replaceTaskBlock(
  source: string,
  indexed: IndexedTask,
  replacement: string,
): TaskPatchResult {
  const current = verifyCurrentBlock(source, indexed);
  if ('ok' in current) {
    return current;
  }

  const replacementLines = replacement.split(/\r\n|\n/);
  current.lines.splice(
    indexed.location.startLine,
    indexed.location.endLine - indexed.location.startLine + 1,
    ...replacementLines,
  );
  return { ok: true, source: current.lines.join(current.eol) };
}

export function removeTaskBlock(source: string, indexed: IndexedTask): TaskPatchResult {
  const current = verifyCurrentBlock(source, indexed);
  if ('ok' in current) {
    return current;
  }

  current.lines.splice(
    indexed.location.startLine,
    indexed.location.endLine - indexed.location.startLine + 1,
  );
  return { ok: true, source: current.lines.join(current.eol) };
}
