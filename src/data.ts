import type { CaseAnswer, CaseMeta, Manifest, Split, Template } from './types';

const BASE = '/data';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadManifest = () => getJson<Manifest>('manifest.json');
export const loadCase = (id: string) => getCaseMeta(`cases/${id}.json`);

const metaCache = new Map<string, Promise<CaseMeta>>();
function getCaseMeta(path: string): Promise<CaseMeta> {
  let p = metaCache.get(path);
  if (!p) {
    p = getJson<CaseMeta>(path);
    metaCache.set(path, p);
  }
  return p;
}

/** Fetches every case file and returns the metas for one split (order = manifest order). */
export async function loadCasesBySplit(split: Split): Promise<CaseMeta[]> {
  const m = await loadManifest();
  const metas = await Promise.all(m.cases.map(loadCase));
  return metas.filter((c) => c.split === split);
}

const templateCache = new Map<string, Promise<Template>>();
export function loadTemplate(id: string): Promise<Template> {
  let p = templateCache.get(id);
  if (!p) {
    p = getJson<Template>(`templates/${id}.json`);
    templateCache.set(id, p);
  }
  return p;
}

/** Fetched only after the user has submitted — the payload reveals the label. */
export const loadAnswer = (id: string) => getJson<CaseAnswer>(`answers/${id}.json`);
