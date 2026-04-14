import { format as formatFns, toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * Get user timezone configuration
 * Priority: 1. User setting (future) 2. Browser auto-detection 3. Default UTC
 */
export function getUserTimezone(): string {
  // Future: could read from user settings stored in DB
  // For now, use browser's timezone via Intl API
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) return detected;
  }
  return 'UTC';
}

/**
 * Convert local date string to UTC date range
 * @param dateStr - Date in YYYY-MM-DD format (local time)
 * @param timezone - IANA timezone string (e.g., 'Asia/Shanghai', 'America/New_York')
 * @returns UTC start and end dates
 */
export function localDateToUTC(
  dateStr: string,
  timezone: string = getUserTimezone()
): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);

  // Create local start of day in the specified timezone
  const localStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  const localEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

  // Convert to UTC
  const utcStart = fromZonedTime(localStart, timezone);
  const utcEnd = fromZonedTime(localEnd, timezone);

  // Add 1 second to end to include the full day
  return {
    start: utcStart,
    end: new Date(utcEnd.getTime() + 1000),
  };
}

/**
 * Convert UTC date to local date in specified timezone
 */
export function utcToLocal(utcDate: Date, timezone: string = getUserTimezone()): Date {
  return toZonedTime(utcDate, timezone);
}

/**
 * Format date for display
 */
export function formatDate(
  date: Date,
  timezone: string = getUserTimezone(),
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options,
  };
  return formatFns(date, 'yyyy-MM-dd', { timeZone: timezone });
}

/**
 * Format datetime for display
 */
export function formatDateTime(
  date: Date,
  timezone: string = getUserTimezone()
): string {
  return formatFns(date, 'yyyy-MM-dd HH:mm:ss', { timeZone: timezone });
}

export { getUserTimezone as getTimezone };
