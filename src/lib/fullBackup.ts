import type { FamilyData } from '../types';
import { offerFile } from './download';

/** Transforme une photo /uploads/… en data URL pour que la sauvegarde soit autonome. */
async function inline(photo: string | null | undefined): Promise<string | null> {
  if (!photo) return null;
  if (photo.startsWith('data:') || !photo.startsWith('/uploads/')) return photo;
  try {
    const blob = await (await fetch(photo)).blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Sauvegarde complète (articles, référence, magasins, historique, réglages, photos) en .json. */
export async function exportFull(data: FamilyData): Promise<boolean> {
  const withPhotos = <T extends { photo?: string | null }>(list: T[]) => Promise.all(list.map(async (x) => ({ ...x, photo: await inline(x.photo) })));
  const full = {
    app: 'courses-famille',
    format: 1,
    exportedAt: new Date().toISOString(),
    data: {
      ...data,
      products: await withPhotos(data.products),
      stores: await withPhotos(data.stores),
      reference: await withPhotos(data.reference ?? []),
    },
  };
  const day = new Date().toISOString().slice(0, 10);
  return offerFile(`courses-famille-${data.code.toLowerCase()}-${day}.json`, JSON.stringify(full), 'application/json');
}

/** La restauration passe par le serveur (version web) : indisponible dans l'artefact Claude. */
export function canRestore(): boolean {
  return !(globalThis as { __cfBackend?: string }).__cfBackend;
}

export async function readBackupFile(file: File): Promise<Partial<FamilyData>> {
  const parsed = JSON.parse(await file.text()) as { app?: string; data?: Partial<FamilyData> };
  const d = parsed?.data;
  if (parsed?.app !== 'courses-famille' || !d || !Array.isArray(d.products)) throw new Error('Ce fichier n’est pas une sauvegarde Courses Famille.');
  return d;
}

/**
 * Restaure en deux temps : d'abord chaque photo (une requête par photo, petite),
 * puis les données avec les adresses des photos (une requête légère).
 */
export async function restoreFull(code: string, data: Partial<FamilyData>, onProgress?: (done: number, total: number) => void): Promise<void> {
  const lists = [data.products ?? [], data.stores ?? [], data.reference ?? []] as Array<Array<{ photo?: string | null }>>;
  const pending = [...new Set(lists.flat().map((x) => x.photo).filter((p): p is string => typeof p === 'string' && p.startsWith('data:')))];
  const urls = new Map<string, string | null>();
  let done = 0;
  const worker = async () => {
    for (let p = pending.shift(); p !== undefined; p = pending.shift()) {
      try {
        const r = await fetch(`/api/family/${encodeURIComponent(code)}/photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: p }) });
        urls.set(p, r.ok ? ((await r.json()) as { url: string }).url : null);
      } catch {
        urls.set(p, null);
      }
      onProgress?.(++done, urls.size + pending.length);
    }
  };
  onProgress?.(0, pending.length);
  await Promise.all([worker(), worker(), worker(), worker()]);
  const swap = <T extends { photo?: string | null }>(list: T[] | undefined) => (list ?? []).map((x) => (x.photo && urls.has(x.photo) ? { ...x, photo: urls.get(x.photo) ?? null } : x));
  data = { ...data, products: swap(data.products), stores: swap(data.stores), reference: swap(data.reference) };
  const res = await fetch(`/api/family/${encodeURIComponent(code)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Erreur ${res.status}`);
  }
}
