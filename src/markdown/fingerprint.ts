import { createHash } from 'node:crypto';

export function fingerprintTaskBlock(block: string): string {
  return createHash('sha256').update(block, 'utf8').digest('hex');
}
