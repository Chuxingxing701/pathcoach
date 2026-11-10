import type { CaseMeta, Manifest } from './types';

const BASE = '/data';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadManifest = () => getJson<Manifest>('manifest.json');
export const loadCase = (id: string) => getJson<CaseMeta>(`cases/${id}.json`);
