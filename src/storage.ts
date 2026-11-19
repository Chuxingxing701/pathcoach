/**
 * F9 local persistence: everything PathCoach writes lives in localStorage under
 * the `pathcoach.` prefix. Export/import moves the whole archive between browsers.
 */

const PREFIX = 'pathcoach.';

export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function remove(key: string): void {
  localStorage.removeItem(PREFIX + key);
}

/** All keys belonging to this app, without the prefix. */
export function archiveKeys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
  }
  return out.sort();
}

export interface Archive {
  app: 'pathcoach';
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

export function exportArchive(): Archive {
  const data: Record<string, unknown> = {};
  for (const key of archiveKeys()) data[key] = load(key);
  return { app: 'pathcoach', version: 1, exportedAt: new Date().toISOString(), data };
}

/** Returns the keys written. Throws on malformed input. */
export function importArchive(archive: unknown): string[] {
  const a = archive as Partial<Archive> | null;
  if (!a || a.app !== 'pathcoach' || typeof a.data !== 'object' || a.data === null) {
    throw new Error('not a PathCoach archive');
  }
  const written: string[] = [];
  for (const [key, value] of Object.entries(a.data)) {
    save(key, value);
    written.push(key);
  }
  return written;
}

/** Trigger a browser download of a JSON payload. */
export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
