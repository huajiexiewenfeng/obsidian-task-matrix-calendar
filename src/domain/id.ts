const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_ULID_TIME = 2 ** 48 - 1;

function encodeTime(timestamp: number): string {
  let remaining = BigInt(timestamp);
  let encoded = '';
  for (let index = 0; index < 10; index += 1) {
    encoded = CROCKFORD_BASE32[Number(remaining % 32n)] + encoded;
    remaining /= 32n;
  }
  return encoded;
}

function encodeRandom(random: () => number): string {
  let encoded = '';
  for (let index = 0; index < 16; index += 1) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('ULID random source must return a number in [0, 1).');
    }
    encoded += CROCKFORD_BASE32[Math.floor(value * 32)];
  }
  return encoded;
}

export function createTaskId(now: number = Date.now(), random: () => number = Math.random): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > MAX_ULID_TIME) {
    throw new RangeError('ULID timestamp must be a non-negative 48-bit integer.');
  }
  return `task-${encodeTime(now)}${encodeRandom(random)}`;
}
