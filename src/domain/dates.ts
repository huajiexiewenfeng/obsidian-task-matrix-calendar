import type { DateRisk, TaskStatus } from './task';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

function toEpochDay(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(timestamp / MILLISECONDS_PER_DAY);
}

export function isValidIsoDate(value: string): boolean {
  return toEpochDay(value) !== null;
}

export function normalizeDateInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = /^\d{8}$/.test(trimmed)
    ? `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
    : trimmed;
  if (!isValidIsoDate(normalized)) {
    throw new Error(`请输入有效日期（YYYYMMDD 或 YYYY-MM-DD）：${value}`);
  }
  return normalized;
}

export function classifyDateRisk(
  dueDate: string | undefined,
  status: TaskStatus,
  today: string,
  dueSoonDays: number,
): DateRisk {
  if (!dueDate || status === 'done') {
    return 'none';
  }

  const dueDay = toEpochDay(dueDate);
  const todayDay = toEpochDay(today);
  if (dueDay === null || todayDay === null) {
    return 'none';
  }

  const difference = dueDay - todayDay;
  if (difference < 0) {
    return 'overdue';
  }
  if (difference === 0) {
    return 'due-today';
  }

  const upcomingWindow = Math.max(0, Math.floor(dueSoonDays));
  return difference <= upcomingWindow ? 'upcoming' : 'none';
}
