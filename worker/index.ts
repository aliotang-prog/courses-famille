// Courses Famille — version Cloudflare : Worker (API + temps réel) + D1 (données) + Assets (application).
// Même API que server.ts : l'application React fonctionne sans aucune modification.
//   GET  /api/family/:code            → données de la famille
//   POST /api/family/:code/actions    → applique une liste d'actions (idempotent)
//   POST /api/family/:code/restore    → restaure une sauvegarde complète (.json)
//   GET  /api/sync/events?code=…      → flux temps réel (Server-Sent Events)
//   GET  /uploads/:id                 → photo
import type { ActionEnvelope, ActionsResponse, FamilyData } from '../src/types';
import { MAX_ACTION_IDS, reduce } from '../src/shared/reducer';
import { FAMILY_CODE_RE, createFamily, defaultStores, normalizeFamilyCode } from '../src/shared/defaults';
import { isMonthKey, monthKeyFromDate } from '../src/shared/month';

// Types minimaux Cloudflare (évite une dépendance de types).
interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number };
}
interface D1Stmt {
  bind(...v: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
interface D1 {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<D1Result[]>;
}
interface Env {
  DB: D1;
  ASSETS: { fetch(req: Request): Promise<Response> };
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const MAX_BATCH = 100;
const MAX_BODY = 30 * 1024 * 1024;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readCode(raw: string | null | undefined): string | null {
  const code = normalizeFamilyCode(decodeURIComponent(String(raw ?? '')));
  return FAMILY_CODE_RE.test(code) ? code : null;
}

function normalizeFamily(raw: Partial<FamilyData>, code: string, version: number): FamilyData {
  const now = Date.now();
  return {
    code,
    version,
    currentMonth: isMonthKey(raw.currentMonth) ? raw.currentMonth : monthKeyFromDate(new Date()),
    stores: Array.isArray(raw.stores) ? raw.stores : defaultStores(now),
    products: Array.isArray(raw.products) ? raw.products : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    reference: Array.isArray(raw.reference) ? raw.reference : [],
    settings: {
      monthlyBudget: raw.settings?.monthlyBudget ?? null,
      syncReference: raw.settings?.syncReference !== false,
      backupSheetId: typeof raw.settings?.backupSheetId === 'string' ? raw.settings.backupSheetId : null,
      backupAt: typeof raw.settings?.backupAt === 'number' ? raw.settings.backupAt : null,
    },
    lastActionIds: Array.isArray(raw.lastActionIds) ? raw.lastActionIds.slice(-MAX_ACTION_IDS) : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
}

async function load(env: Env, code: string): Promise<FamilyData | null> {
  const row = await env.DB.prepare('SELECT version, data FROM families WHERE code = ?').bind(code).first<{ version: number; data: string }>();
  return row ? normalizeFamily(JSON.parse(row.data) as Partial<FamilyData>, code, row.version) : null;
}

/** Données de la famille (créée avec les magasins par défaut au premier accès). */
async function getFamily(env: Env, code: string): Promise<FamilyData> {
  const fam = await load(env, code);
  if (fam) return fam;
  const fresh = createFamily(code, monthKeyFromDate(new Date()), Date.now());
  await env.DB.prepare('INSERT OR IGNORE INTO families (code, version, data, updated) VALUES (?, ?, ?, ?)').bind(code, fresh.version, JSON.stringify(fresh), Date.now()).run();
  return (await load(env, code)) ?? fresh;
}

/** Écriture optimiste : n'aboutit que si personne n'a écrit entre-temps. */
async function save(env: Env, fam: FamilyData, expectedVersion: number): Promise<boolean> {
  const r = await env.DB.prepare('UPDATE families SET version = ?, data = ?, updated = ? WHERE code = ? AND version = ?')
    .bind(fam.version, JSON.stringify(fam), Date.now(), fam.code, expectedVersion)
    .run();
  return r.meta.changes === 1;
}

// ===================== Photos =====================

/** Empreinte du texte base64 (fonctions natives, peu coûteuses en CPU). */
async function sha(text: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** data:image/… → /uploads/<empreinte>.<ext> (une photo identique n'est stockée qu'une fois). */
async function persistPhoto(env: Env, code: string, photo: unknown): Promise<unknown> {
  if (typeof photo !== 'string') return photo;
  const m = DATA_URL_RE.exec(photo);
  if (!m) return photo;
  if (!m[2].length || (m[2].length * 3) / 4 > MAX_PHOTO_BYTES) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const id = `${await sha(m[2])}.${ext}`;
  await env.DB.prepare('INSERT OR IGNORE INTO photos (id, code, mime, b64, created) VALUES (?, ?, ?, ?, ?)').bind(id, code, `image/${m[1]}`, m[2], Date.now()).run();
  return `/uploads/${id}`;
}

async function extractPhotos(env: Env, code: string, e: ActionEnvelope): Promise<ActionEnvelope> {
  const a = e.action as unknown as Record<string, unknown> & { type: string };
  const fix = async (key: string) => {
    const obj = a[key] as Record<string, unknown> | undefined;
    if (!obj || typeof obj !== 'object' || !('photo' in obj)) return e;
    return { ...e, action: { ...a, [key]: { ...obj, photo: await persistPhoto(env, code, obj.photo) } } } as unknown as ActionEnvelope;
  };
  switch (a.type) {
    case 'product/add':
      return fix('product');
    case 'ref/add':
      return fix('item');
    case 'store/add':
      return fix('store');
    case 'product/update':
    case 'ref/update':
    case 'store/update':
      return fix('patch');
    default:
      return e;
  }
}

/** Supprime les photos de la famille qui ne sont plus utilisées (délai de grâce : 1 h). */
async function photosGc(env: Env, fam: FamilyData): Promise<void> {
  const used = new Set<string>();
  for (const it of [...fam.products, ...fam.stores, ...(fam.reference ?? [])]) if (it.photo?.startsWith('/uploads/')) used.add(it.photo.slice(9));
  const { results } = await env.DB.prepare('SELECT id FROM photos WHERE code = ? AND created < ?').bind(fam.code, Date.now() - 3_600_000).all<{ id: string }>();
  const dead = results.map((r) => r.id).filter((id) => !used.has(id));
  if (dead.length) await env.DB.batch(dead.map((id) => env.DB.prepare('DELETE FROM photos WHERE id = ? AND code = ?').bind(id, fam.code)));
}

// ===================== Actions =====================

async function applyActions(env: Env, ctx: Ctx, code: string, raw: unknown): Promise<Response> {
  if (!Array.isArray(raw) || raw.length > MAX_BATCH) return json({ error: `"actions" doit être un tableau (max ${MAX_BATCH})` }, 400);
  // Les photos sont extraites une seule fois, avant les éventuelles nouvelles tentatives.
  const prepared: Array<{ id: string; env?: ActionEnvelope }> = [];
  for (const r of raw as ActionEnvelope[]) {
    const id = typeof r?.id === 'string' ? r.id.slice(0, 64) : '';
    if (!id || !r.action || typeof r.action.type !== 'string') {
      prepared.push({ id });
      continue;
    }
    prepared.push({ id, env: await extractPhotos(env, code, { id, at: Date.now(), action: r.action }) });
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const start = await getFamily(env, code);
    let fam = start;
    const known = new Set(fam.lastActionIds);
    const processed: string[] = [];
    const rejected: string[] = [];
    let changed = false;
    let photoTouched = false;
    for (const p of prepared) {
      if (!p.env) {
        if (p.id) rejected.push(p.id);
        continue;
      }
      if (known.has(p.id)) {
        processed.push(p.id);
        continue;
      }
      try {
        const next = reduce(fam, p.env);
        known.add(p.id);
        processed.push(p.id);
        if (/^(product\/(add|update|delete)|bulk\/delete|store\/|ref\/|month\/close)/.test(p.env.action.type)) photoTouched = true;
        if (next === fam) continue;
        fam = { ...next, lastActionIds: [...next.lastActionIds, p.id].slice(-MAX_ACTION_IDS) };
        changed = true;
      } catch {
        rejected.push(p.id);
      }
    }
    if (changed) {
      fam = { ...fam, version: start.version + 1 };
      if (!(await save(env, fam, start.version))) {
        await sleep(40 + Math.random() * 120);
        continue; // quelqu'un a écrit entre-temps : on recommence sur la version à jour
      }
      if (photoTouched) ctx.waitUntil(photosGc(env, fam));
    }
    const body: ActionsResponse = { data: fam, processed, rejected };
    return json(body);
  }
  return json({ error: 'Trop de modifications simultanées, réessayez.' }, 503);
}

/** Restaure une sauvegarde complète (exportée depuis l'application). */
async function restore(env: Env, ctx: Ctx, code: string, body: unknown): Promise<Response> {
  const src = (body as { data?: Partial<FamilyData> })?.data;
  if (!src || typeof src !== 'object' || !Array.isArray(src.products)) return json({ error: 'Sauvegarde invalide.' }, 400);
  const withPhotos = async <T extends { photo?: string | null }>(list: T[] | undefined) =>
    Promise.all((list ?? []).map(async (x) => ({ ...x, photo: (await persistPhoto(env, code, x.photo ?? null)) as string | null })));
  const cur = await getFamily(env, code);
  const restored = normalizeFamily(
    {
      ...src,
      products: await withPhotos(src.products),
      stores: await withPhotos(src.stores),
      reference: await withPhotos(src.reference),
      lastActionIds: cur.lastActionIds,
      updatedAt: Date.now(),
    },
    code,
    cur.version + 1,
  );
  if (!(await save(env, restored, cur.version))) return json({ error: 'Modification en cours, réessayez.' }, 409);
  ctx.waitUntil(photosGc(env, restored));
  return json({ data: restored });
}

// ===================== Temps réel (SSE) =====================

function events(env: Env, ctx: Ctx, code: string): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  const send = (event: string, data: unknown) => w.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  const conn = crypto.randomUUID();

  const presence = async () => {
    const now = Date.now();
    await env.DB.prepare('INSERT INTO presence (code, conn, seen) VALUES (?, ?, ?) ON CONFLICT(code, conn) DO UPDATE SET seen = excluded.seen').bind(code, conn, now).run();
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM presence WHERE code = ? AND seen > ?').bind(code, now - 45_000).first<{ n: number }>();
    await send('presence', { devices: Math.max(1, r?.n ?? 1) });
  };

  const loop = (async () => {
    try {
      await w.write(enc.encode('retry: 1500\n\n'));
      let fam = await getFamily(env, code);
      let version = fam.version;
      await send('state', fam);
      await presence();
      // ~55 s par connexion, puis le navigateur se reconnecte tout seul.
      for (let i = 1; i <= 27; i++) {
        await sleep(2000);
        const row = await env.DB.prepare('SELECT version FROM families WHERE code = ?').bind(code).first<{ version: number }>();
        if (row && row.version !== version) {
          fam = await getFamily(env, code);
          version = fam.version;
          await send('state', fam);
        }
        if (i % 10 === 0) await presence();
        else if (i % 5 === 0) await w.write(enc.encode(`: ping ${Date.now()}\n\n`));
      }
    } catch {
      /* client parti */
    } finally {
      await env.DB.prepare('DELETE FROM presence WHERE code = ? AND conn = ?').bind(code, conn).run().catch(() => undefined);
      await env.DB.prepare('DELETE FROM presence WHERE seen < ?').bind(Date.now() - 600_000).run().catch(() => undefined);
      await w.close().catch(() => undefined);
    }
  })();
  ctx.waitUntil(loop);
  return new Response(readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } });
}

// ===================== Routeur =====================

async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw json({ error: 'Envoi trop volumineux.' }, 413);
  try {
    return await req.json();
  } catch {
    throw json({ error: 'JSON invalide.' }, 400);
  }
}

async function route(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const m = req.method;

  if (p.startsWith('/uploads/') && m === 'GET') {
    const id = p.slice(9);
    const row = await env.DB.prepare('SELECT mime, b64 FROM photos WHERE id = ?').bind(id).first<{ mime: string; b64: string }>();
    if (!row) return new Response('Photo introuvable', { status: 404 });
    const bin = Uint8Array.from(atob(row.b64), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=31536000, immutable' } });
  }
  if (p === '/api/health') return json({ ok: true, time: Date.now() });
  if (p === '/api/sync/events' && m === 'GET') {
    const code = readCode(url.searchParams.get('code'));
    return code ? events(env, ctx, code) : json({ error: 'Code famille invalide' }, 400);
  }
  const fm = /^\/api\/family\/([^/]+)(?:\/(actions|restore|photo))?$/.exec(p);
  if (fm) {
    const code = readCode(fm[1]);
    if (!code) return json({ error: 'Code famille invalide (3 à 32 caractères : A-Z, 0-9, -)' }, 400);
    if (!fm[2] && m === 'GET') return json(await getFamily(env, code));
    if (fm[2] === 'actions' && m === 'POST') return applyActions(env, ctx, code, ((await readJson(req)) as { actions?: unknown })?.actions);
    if (fm[2] === 'restore' && m === 'POST') return restore(env, ctx, code, await readJson(req));
    if (fm[2] === 'photo' && m === 'POST') {
      const url = await persistPhoto(env, code, ((await readJson(req)) as { photo?: unknown })?.photo);
      return typeof url === 'string' && url.startsWith('/uploads/') ? json({ url }) : json({ error: 'Photo invalide.' }, 400);
    }
  }
  return json({ error: 'Route API inconnue' }, 404);
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const p = new URL(req.url).pathname;
    if (!p.startsWith('/api/') && !p.startsWith('/uploads/')) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, ctx);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error(e);
      return json({ error: 'Erreur serveur' }, 500);
    }
  },
};
