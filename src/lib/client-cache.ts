const RECORDS_DATA_VERSION_PREFIX = 'records-data-version';

interface SessionCacheEnvelope<T> {
  timestamp: number;
  version: string;
  value: T;
}

export function getRecordsDataVersion(deviceId: string): string {
  if (typeof window === 'undefined' || !deviceId) {
    return '0';
  }

  return localStorage.getItem(`${RECORDS_DATA_VERSION_PREFIX}:${deviceId}`) || '0';
}

export function bumpRecordsDataVersion(deviceId: string): string {
  const nextVersion = `${Date.now()}`;

  if (typeof window === 'undefined' || !deviceId) {
    return nextVersion;
  }

  localStorage.setItem(`${RECORDS_DATA_VERSION_PREFIX}:${deviceId}`, nextVersion);
  return nextVersion;
}

export function readSessionCache<T>(
  key: string,
  ttlMs: number,
  expectedVersion?: string
): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SessionCacheEnvelope<T>>;
    if (typeof parsed.timestamp !== 'number') {
      return null;
    }

    if (Date.now() - parsed.timestamp > ttlMs) {
      sessionStorage.removeItem(key);
      return null;
    }

    if (expectedVersion !== undefined && parsed.version !== expectedVersion) {
      return null;
    }

    return (parsed.value as T) ?? null;
  } catch {
    return null;
  }
}

export function writeSessionCache<T>(
  key: string,
  value: T,
  version: string = '0'
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const envelope: SessionCacheEnvelope<T> = {
      timestamp: Date.now(),
      version,
      value,
    };
    sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore storage write failures.
  }
}
