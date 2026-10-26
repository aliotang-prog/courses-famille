// Courses Famille — serveur autonome (Express + SSE + stockage fichier local).
// `npm run dev`  → API + SSE + front Vite (HMR) sur http://0.0.0.0:3000
// `npm start`    → même chose avec le build de production (dist/)
import express from 'express';
import type { Request, Response } from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ActionEnvelope, ActionsResponse, FamilyData } from './src/types';
import { MAX_ACTION_IDS, reduce } from './src/shared/reducer';
import { FAMILY_CODE_RE, createFamily, defaultStores, normalizeFamilyCode } from './src/shared/defaults';
import { isMonthKey, monthKeyFromDate } from './src/shared/month';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_BATCH = 100;

// ===================== Persistance : data/store.json =====================

interface StoreFile {
  schema: 1;
  families: Record<string, FamilyData>;
}

let db: StoreFile = { schema: 1, families: {} };

function normalizeFamily(raw: Partial<FamilyData>, code: string): FamilyData {
  const now = Date.now();
  return {
    code,
    version: typeof raw.version === 'number' ? raw.version : 1,
    currentMonth: isMonthKey(raw.currentMonth) ? raw.currentMonth : monthKeyFromDate(new Date()),
    stores: Array.isArray(raw.stores) ? raw.stores : defaultStores(now),
    products: Array.isArray(raw.products) ? raw.products : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    reference: Array.isArray(raw.reference) ? raw.reference : [],
    settings: { monthlyBudget: raw.settings?.monthlyBudget ?? null, syncReference: raw.settings?.syncReference !== false, backupSheetId: typeof raw.settings?.backupSheetId === 'string' ? raw.settings.backupSheetId : null, backupAt: typeof raw.settings?.backupAt === 'number' ? raw.settings.backupAt : null },
    lastActionIds: Array.isArray(raw.lastActionIds) ? raw.lastActionIds.slice(-MAX_ACTION_IDS) : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
}

async function loadStore(): Promise<void> {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(await fsp.readFile(STORE_FILE, 'utf8')) as Partial<StoreFile>;
    const families: Record<string, FamilyData> = {};
    for (const [code, fam] of Object.entries(parsed.families ?? {})) families[code] = normalizeFamily(fam, code);
    db = { schema: 1, families };
    console.log(`📦 ${Object.keys(families).length} famille(s) chargée(s) depuis ${path.relative(ROOT, STORE_FILE)}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await saveNow();
      console.log(`📦 Nouveau fichier de données : ${path.relative(ROOT, STORE_FILE)}`);
    } else {
      // Fichier corrompu : on le met de côté au lieu de l'écraser.
      const backup = `${STORE_FILE}.corrompu-${Date.now()}`;
      await fsp.rename(STORE_FILE, backup).catch(() => undefined);
      console.error(`⚠️  store.json illisible, sauvegardé sous ${backup}. Démarrage à vide.`);
      await saveNow();
    }
  }
}

let saveTimer: NodeJS.Timeout | null = null;
let saveChain: Promise<void> = Promise.resolve();

/** Écriture atomique (fichier temporaire + rename), sérialisée. */
function saveNow(): Promise<void> {
  saveChain = saveChain.then(async () => {
    const tmp = `${STORE_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
    await fsp.rename(tmp, STORE_FILE);
  }).catch((err) => console.error('Erreur de sauvegarde :', err));
  return saveChain;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow();
  }, 120);
}

function getFamily(code: string): FamilyData {
  let fam = db.families[code];
  if (!fam) {
    fam = createFamily(code, monthKeyFromDate(new Date()), Date.now());
    db.families[code] = fam;
    scheduleSave();
  }
  return fam;
}

// ===================== Photos (stockage local data/uploads) =====================

const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

async function persistPhoto(photo: unknown): Promise<unknown> {
  if (typeof photo !== 'string') return photo;
  const m = DATA_URL_RE.exec(photo);
  if (!m) return photo;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_PHOTO_BYTES) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = `${randomUUID()}.${ext}`;
  await fsp.writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

/** Convertit les photos base64 des actions en fichiers locaux. */
async function extractPhotos(env: ActionEnvelope): Promise<ActionEnvelope> {
  const a = env.action;
  if (a.type === 'product/add' && a.product && 'photo' in a.product) {
    return { ...env, action: { ...a, product: { ...a.product, photo: (await persistPhoto(a.product.photo)) as string | null } } };
  }
  if (a.type === 'product/update' && a.patch && 'photo' in a.patch) {
    return { ...env, action: { ...a, patch: { ...a.patch, photo: (await persistPhoto(a.patch.photo)) as string | null } } };
  }
  if (a.type === 'ref/add' && a.item && 'photo' in a.item) {
    return { ...env, action: { ...a, item: { ...a.item, photo: (await persistPhoto(a.item.photo)) as string | null } } };
  }
  if (a.type === 'ref/update' && a.patch && 'photo' in a.patch) {
    return { ...env, action: { ...a, patch: { ...a.patch, photo: (await persistPhoto(a.patch.photo)) as string | null } } };
  }
  if (a.type === 'store/add' && a.store && 'photo' in a.store) {
    return { ...env, action: { ...a, store: { ...a.store, photo: (await persistPhoto(a.store.photo)) as string | null } } };
  }
  if (a.type === 'store/update' && a.patch && 'photo' in a.patch) {
    return { ...env, action: { ...a, patch: { ...a.patch, photo: (await persistPhoto(a.patch.photo)) as string | null } } };
  }
  return env;
}

let gcTimer: NodeJS.Timeout | null = null;

/** Supprime les photos qui ne sont plus référencées (après un délai de grâce). */
function scheduleUploadsGc(): void {
  if (gcTimer) return;
  gcTimer = setTimeout(async () => {
    gcTimer = null;
    const referenced = new Set<string>();
    for (const fam of Object.values(db.families)) {
      for (const item of [...fam.products, ...fam.stores, ...(fam.reference ?? [])]) {
        if (item.photo?.startsWith('/uploads/')) referenced.add(item.photo.slice('/uploads/'.length));
      }
    }
    const files = await fsp.readdir(UPLOAD_DIR).catch(() => [] as string[]);
    const now = Date.now();
    for (const f of files) {
      if (referenced.has(f)) continue;
      const full = path.join(UPLOAD_DIR, f);
      const st = await fsp.stat(full).catch(() => null);
      if (st && now - st.mtimeMs > 60_000) await fsp.unlink(full).catch(() => undefined);
    }
  }, 90_000);
}

// ===================== Temps réel : Server-Sent Events =====================

const clients = new Map<string, Set<Response>>();

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(code: string): void {
  const set = clients.get(code);
  if (!set) return;
  const fam = getFamily(code);
  for (const res of set) sse(res, 'state', fam);
}

function broadcastPresence(code: string): void {
  const set = clients.get(code);
  if (!set) return;
  for (const res of set) sse(res, 'presence', { devices: set.size });
}

// ===================== Application Express =====================

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

function readCode(raw: unknown): string | null {
  const code = normalizeFamilyCode(String(raw ?? ''));
  return FAMILY_CODE_RE.test(code) ? code : null;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, families: Object.keys(db.families).length, time: Date.now() });
});

app.get('/api/family/:code', (req: Request, res: Response) => {
  const code = readCode(req.params.code);
  if (!code) return void res.status(400).json({ error: 'Code famille invalide (3 à 32 caractères : A-Z, 0-9, -)' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(getFamily(code));
});

app.post('/api/family/:code/actions', async (req: Request, res: Response) => {
  const code = readCode(req.params.code);
  if (!code) return void res.status(400).json({ error: 'Code famille invalide' });
  const envs: unknown = req.body?.actions;
  if (!Array.isArray(envs) || envs.length > MAX_BATCH) {
    return void res.status(400).json({ error: `"actions" doit être un tableau (max ${MAX_BATCH})` });
  }

  let fam = getFamily(code);
  const known = new Set(fam.lastActionIds);
  const processed: string[] = [];
  const rejected: string[] = [];
  let changed = false;
  let photoTouched = false;

  for (const raw of envs as ActionEnvelope[]) {
    const id = typeof raw?.id === 'string' ? raw.id.slice(0, 64) : '';
    if (!id || !raw.action || typeof raw.action.type !== 'string') {
      if (id) rejected.push(id);
      continue;
    }
    if (known.has(id)) {
      processed.push(id); // déjà appliquée (renvoi après coupure réseau) → idempotent
      continue;
    }
    try {
      const env = await extractPhotos({ id, at: Date.now(), action: raw.action });
      const current = getFamily(code);
      const next = reduce(current, env);
      known.add(id);
      processed.push(id);
      const t = raw.action.type;
      if (/^(product\/(add|update|delete)|bulk\/delete|store\/|ref\/|month\/close)/.test(t)) photoTouched = true;
      if (next === current) continue; // action sans effet (déjà faite, cible supprimée…) : rien à diffuser
      fam = { ...next, lastActionIds: [...next.lastActionIds, id].slice(-MAX_ACTION_IDS) };
      db.families[code] = fam;
      changed = true;
    } catch (err) {
      console.error('Action rejetée', raw.action.type, err);
      rejected.push(id);
    }
  }

  if (changed) {
    fam = getFamily(code);
    fam = { ...fam, version: fam.version + 1 };
    db.families[code] = fam;
    scheduleSave();
    broadcast(code);
  }
  if (photoTouched) scheduleUploadsGc();
  const body: ActionsResponse = { data: getFamily(code), processed, rejected };
  res.json(body);
});

app.post('/api/family/:code/photo', async (req: Request, res: Response) => {
  const code = readCode(req.params.code);
  if (!code) return void res.status(400).json({ error: 'Code famille invalide' });
  const url = await persistPhoto(req.body?.photo);
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return void res.status(400).json({ error: 'Photo invalide.' });
  res.json({ url });
});

app.post('/api/family/:code/restore', async (req: Request, res: Response) => {
  const code = readCode(req.params.code);
  if (!code) return void res.status(400).json({ error: 'Code famille invalide' });
  const src = req.body?.data as Partial<FamilyData> | undefined;
  if (!src || !Array.isArray(src.products)) return void res.status(400).json({ error: 'Sauvegarde invalide.' });
  const withPhotos = async <T extends { photo?: string | null }>(list: T[] | undefined) =>
    Promise.all((list ?? []).map(async (x) => ({ ...x, photo: (await persistPhoto(x.photo ?? null)) as string | null })));
  const cur = getFamily(code);
  const fam = normalizeFamily(
    { ...src, products: await withPhotos(src.products), stores: await withPhotos(src.stores), reference: await withPhotos(src.reference), lastActionIds: cur.lastActionIds, version: cur.version + 1, updatedAt: Date.now() },
    code,
  );
  db.families[code] = fam;
  scheduleSave();
  broadcast(code);
  scheduleUploadsGc();
  res.json({ data: fam });
});

app.get('/api/sync/events', (req: Request, res: Response) => {
  const code = readCode(req.query.code);
  if (!code) return void res.status(400).json({ error: 'Code famille invalide' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  let set = clients.get(code);
  if (!set) clients.set(code, (set = new Set()));
  set.add(res);
  sse(res, 'state', getFamily(code));
  broadcastPresence(code);

  const ping = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    set!.delete(res);
    if (!set!.size) clients.delete(code);
    else broadcastPresence(code);
  });
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route API inconnue' });
});

// ===================== Front : Vite (dev) ou dist/ (prod) =====================

async function main(): Promise<void> {
  await loadStore();
  const server = http.createServer(app);

  if (IS_PROD) {
    const dist = path.join(ROOT, 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      console.error('❌ dist/ introuvable. Lancez d’abord : npm run build');
      process.exit(1);
    }
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: ROOT,
      appType: 'spa',
      server: { middlewareMode: true, hmr: { server } },
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, HOST, () => {
    console.log(`\n🛒 Courses Famille ${IS_PROD ? '(production)' : '(développement)'}`);
    console.log(`   Local   : http://localhost:${PORT}`);
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const n of nets ?? []) {
        if (n.family === 'IPv4' && !n.internal) console.log(`   Réseau  : http://${n.address}:${PORT}   ← à ouvrir sur les téléphones`);
      }
    }
    console.log(`   Données : ${path.relative(ROOT, STORE_FILE)}\n`);
  });

  scheduleUploadsGc();

  const shutdown = async () => {
    if (saveTimer) clearTimeout(saveTimer);
    await saveNow();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
