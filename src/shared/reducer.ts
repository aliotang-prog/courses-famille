// Réducteur PUR partagé client/serveur.
// - Le serveur l'utilise comme source de vérité.
// - Le client l'utilise pour les mises à jour optimistes (rebase des actions en attente).
import { UNITS } from '../types';
import type {
  ActionEnvelope,
  ArchivedItem,
  FamilyData,
  MonthArchive,
  Product,
  ProductPatch,
  RefItem,
  Store,
  Unit,
} from '../types';
import { addMonths, isMonthKey, productMonth } from './month';
import { NO_STORE_COLOR, NO_STORE_NAME, boughtQty, lineTotal, round2, sumTotals, totalsByStore } from './totals';

export const MAX_ACTION_IDS = 400;
export const MAX_NAME = 80;
export const MAX_NOTES = 300;

// ---------- Assainissement ----------

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function cleanNotes(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_NOTES) : '';
}

export function cleanPrice(v: unknown): number {
  return isFiniteNum(v) && v >= 0 ? Math.min(round2(v), 1_000_000) : 0;
}

export function cleanQty(v: unknown): number {
  if (!isFiniteNum(v) || v <= 0) return 1;
  return Math.min(Math.round(v * 1000) / 1000, 100_000);
}

export function cleanUnit(v: unknown): Unit {
  return (UNITS as readonly string[]).includes(v as string) ? (v as Unit) : 'pcs';
}

/** Photo acceptée : chemin local /uploads/… ou data URL image (base64). */
export function cleanPhoto(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  if (/^\/uploads\/[\w.-]+$/.test(v)) return v;
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
  return null;
}

export function cleanMonth(v: unknown): string | null {
  return isMonthKey(v) ? v : null;
}

export function cleanColor(v: unknown): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : NO_STORE_COLOR;
}

/** Pas d'ajustement +/- selon l'unité. */
export function qtyStep(unit: Unit): number {
  return unit === 'kg' || unit === 'L' ? 0.5 : 1;
}

function applyPatch(p: Product, patch: ProductPatch, at: number): Product {
  const next: Product = { ...p, updatedAt: at };
  if ('name' in patch) {
    const name = cleanText(patch.name, MAX_NAME);
    if (name) next.name = name;
  }
  if ('price' in patch) next.price = cleanPrice(patch.price);
  if ('quantity' in patch) next.quantity = cleanQty(patch.quantity);
  if ('unit' in patch) next.unit = cleanUnit(patch.unit);
  if ('storeId' in patch) next.storeId = typeof patch.storeId === 'string' ? patch.storeId : null;
  if ('notes' in patch) next.notes = cleanNotes(patch.notes);
  if ('recurring' in patch) next.recurring = Boolean(patch.recurring);
  // La photo n'est modifiée QUE si le patch la mentionne explicitement.
  if ('photo' in patch) next.photo = cleanPhoto(patch.photo);
  if ('month' in patch) next.month = cleanMonth(patch.month);
  if ('skipped' in patch) next.skipped = Boolean(patch.skipped);
  if ('refId' in patch) next.refId = typeof patch.refId === 'string' && patch.refId ? patch.refId : null;
  if ('boughtQty' in patch && isFiniteNum(patch.boughtQty)) next.boughtQty = Math.max(0, Math.round(patch.boughtQty * 1000) / 1000);
  if ('checked' in patch && typeof patch.checked === 'boolean' && patch.checked !== p.checked) {
    next.checked = patch.checked;
    next.checkedAt = patch.checked ? at : null;
    next.boughtQty = patch.checked ? next.quantity : 0;
    if (patch.checked) next.skipped = false;
  }
  return settleBought(next, at);
}

/** Recalcule l'état acheté après un changement de quantité ou d'achat partiel. */
function settleBought(p: Product, at: number): Product {
  if (p.checked) return p.boughtQty === p.quantity ? p : { ...p, boughtQty: p.quantity };
  const b = Math.max(0, Math.min(p.quantity, p.boughtQty ?? 0));
  if (b >= p.quantity && b > 0) return { ...p, checked: true, checkedAt: at, boughtQty: p.quantity, skipped: false };
  return b === (p.boughtQty ?? 0) ? p : { ...p, boughtQty: b };
}

export function sanitizeProduct(raw: Partial<Product>, at: number): Product | null {
  const name = cleanText(raw.name, MAX_NAME);
  if (!name || typeof raw.id !== 'string' || !raw.id) return null;
  const checked = Boolean(raw.checked);
  return {
    id: raw.id.slice(0, 64),
    name,
    price: cleanPrice(raw.price),
    quantity: cleanQty(raw.quantity),
    unit: cleanUnit(raw.unit),
    storeId: typeof raw.storeId === 'string' ? raw.storeId : null,
    checked,
    photo: cleanPhoto(raw.photo),
    notes: cleanNotes(raw.notes),
    recurring: raw.recurring === undefined ? true : Boolean(raw.recurring),
    month: cleanMonth(raw.month),
    boughtQty: checked ? cleanQty(raw.quantity) : isFiniteNum(raw.boughtQty) && raw.boughtQty > 0 ? Math.round(raw.boughtQty * 1000) / 1000 : 0,
    skipped: Boolean(raw.skipped) && !checked,
    refId: typeof raw.refId === 'string' && raw.refId ? raw.refId.slice(0, 80) : null,
    createdAt: isFiniteNum(raw.createdAt) ? raw.createdAt : at,
    updatedAt: at,
    checkedAt: checked ? at : null,
  };
}

// ---------- Mois référence ----------

const foldName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Clé d'identité d'un article : lien référence, sinon nom + magasin. */
const itemKey = (p: { name: string; storeId: string | null }) => `${foldName(p.name)}|${p.storeId ?? ''}`;

export function refTotal(reference: RefItem[]): number {
  return round2(reference.reduce((t, r) => t + r.price * r.quantity, 0));
}

function sanitizeRef(raw: Partial<RefItem>, at: number): RefItem | null {
  const name = cleanText(raw.name, MAX_NAME);
  if (!name || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id.slice(0, 80),
    name,
    price: cleanPrice(raw.price),
    quantity: cleanQty(raw.quantity),
    unit: cleanUnit(raw.unit),
    storeId: typeof raw.storeId === 'string' ? raw.storeId : null,
    notes: cleanNotes(raw.notes),
    photo: cleanPhoto(raw.photo),
    createdAt: isFiniteNum(raw.createdAt) ? raw.createdAt : at,
    updatedAt: at,
  };
}

function refFromProduct(p: Product, id: string, at: number): RefItem {
  return { id, name: p.name, price: p.price, quantity: p.quantity, unit: p.unit, storeId: p.storeId, notes: p.notes, photo: p.photo, createdAt: at, updatedAt: at };
}

/** Copie d'un article de référence dans la liste d'un mois (id déterministe : même résultat client/serveur). */
function productFromRef(r: RefItem, month: string | null, monthKey: string, at: number): Product {
  return {
    id: `${r.id}@${monthKey}`.slice(0, 120),
    name: r.name,
    price: r.price,
    quantity: r.quantity,
    unit: r.unit,
    storeId: r.storeId,
    checked: false,
    photo: r.photo,
    notes: r.notes,
    recurring: true,
    month,
    boughtQty: 0,
    skipped: false,
    refId: r.id,
    createdAt: at,
    updatedAt: at,
    checkedAt: null,
  };
}

const SYNC_FIELDS = ['name', 'price', 'quantity', 'unit', 'storeId', 'notes', 'photo'] as const;

/** Répercute sur la référence les changements faits sur un article lié (si l'option est active). */
function syncRef(data: FamilyData, before: Product | undefined, after: Product | undefined, at: number): RefItem[] {
  const reference = data.reference ?? [];
  if (data.settings.syncReference === false || !before || !after || !after.refId) return reference;
  const idx = reference.findIndex((r) => r.id === after.refId);
  if (idx < 0) return reference;
  const r = reference[idx];
  const patch: Partial<RefItem> = {};
  for (const f of SYNC_FIELDS) if (before[f] !== after[f] && r[f] !== after[f]) (patch as Record<string, unknown>)[f] = after[f];
  if (!Object.keys(patch).length) return reference;
  const out = reference.slice();
  out[idx] = { ...r, ...patch, updatedAt: at };
  return out;
}

// ---------- Archives mensuelles ----------

export function buildArchive(data: FamilyData, at: number): MonthArchive {
  const storeById = new Map(data.stores.map((s) => [s.id, s]));
  const products = data.products.filter((p) => productMonth(p, data.currentMonth) === data.currentMonth);
  const totals = sumTotals(products);
  const items: ArchivedItem[] = products.map((p) => {
    const s = p.storeId ? storeById.get(p.storeId) : undefined;
    return {
      name: p.name,
      price: p.price,
      quantity: p.quantity,
      unit: p.unit,
      storeName: s?.name ?? NO_STORE_NAME,
      storeColor: s?.color ?? NO_STORE_COLOR,
      checked: p.checked,
      lineTotal: lineTotal(p),
    };
  });
  return {
    month: data.currentMonth,
    archivedAt: at,
    estimated: totals.estimated,
    spent: totals.spent,
    budget: data.settings.monthlyBudget,
    refEstimated: refTotal(data.reference ?? []),
    itemCount: totals.count,
    checkedCount: totals.checkedCount,
    byStore: totalsByStore(products, data.stores),
    items,
  };
}

// ---------- Réducteur ----------

function mapIds(products: Product[], ids: string[], fn: (p: Product) => Product): Product[] {
  const set = new Set(ids);
  return products.map((p) => (set.has(p.id) ? fn(p) : p));
}

/**
 * Applique une action. Retourne la MÊME référence si l'action n'a aucun effet
 * (permet au serveur de ne pas incrémenter la version inutilement).
 */
export function reduce(data: FamilyData, env: ActionEnvelope): FamilyData {
  const { action, at } = env;
  const touch = (patch: Partial<FamilyData>): FamilyData => ({ ...data, ...patch, updatedAt: at });

  switch (action.type) {
    case 'product/add': {
      const product = sanitizeProduct(action.product, at);
      if (!product || data.products.some((p) => p.id === product.id)) return data;
      if (action.toReference && !product.refId) {
        const reference = data.reference ?? [];
        const same = reference.find((r) => itemKey(r) === itemKey(product));
        const ref = same ?? refFromProduct(product, `ref-${product.id}`.slice(0, 80), at);
        return touch({ products: [...data.products, { ...product, refId: ref.id }], reference: same ? reference : [...reference, ref] });
      }
      return touch({ products: [...data.products, product] });
    }
    case 'product/update': {
      const before = data.products.find((p) => p.id === action.id);
      if (!before) return data;
      const after = applyPatch(before, action.patch, at);
      return touch({ products: data.products.map((p) => (p.id === action.id ? after : p)), reference: syncRef(data, before, after, at) });
    }
    case 'product/delete': {
      if (!data.products.some((p) => p.id === action.id)) return data;
      return touch({ products: data.products.filter((p) => p.id !== action.id) });
    }
    case 'product/setChecked': {
      const target = data.products.find((p) => p.id === action.id);
      if (!target || target.checked === action.checked) return data;
      return touch({
        products: data.products.map((p) =>
          p.id === action.id
            ? { ...p, checked: action.checked, checkedAt: action.checked ? at : null, boughtQty: action.checked ? p.quantity : 0, skipped: action.checked ? false : p.skipped, updatedAt: at }
            : p,
        ),
      });
    }
    case 'product/quantity': {
      const target = data.products.find((p) => p.id === action.id);
      if (!target || !isFiniteNum(action.delta) || action.delta === 0) return data;
      const step = qtyStep(target.unit);
      const next = Math.round((target.quantity + action.delta) * 1000) / 1000;
      // On ne descend jamais sous un "pas" : pour retirer un article, on le supprime.
      const quantity = Math.max(step, next);
      if (quantity === target.quantity) return data;
      // Augmenter la quantité d'un article acheté : le surplus reste à acheter.
      const updated =
        target.checked && quantity > target.quantity
          ? { ...target, quantity, checked: false, checkedAt: null, boughtQty: target.quantity, updatedAt: at }
          : settleBought({ ...target, quantity, updatedAt: at }, at);
      return touch({
        products: data.products.map((p) => (p.id === action.id ? updated : p)),
        reference: syncRef(data, target, updated, at),
      });
    }
    case 'bulk/setChecked': {
      if (!Array.isArray(action.ids) || !action.ids.length) return data;
      return touch({
        products: mapIds(data.products, action.ids, (p) =>
          p.checked === action.checked
            ? p
            : { ...p, checked: action.checked, checkedAt: action.checked ? at : null, boughtQty: action.checked ? p.quantity : 0, skipped: action.checked ? false : p.skipped, updatedAt: at },
        ),
      });
    }
    case 'bulk/move': {
      if (!Array.isArray(action.ids) || !action.ids.length) return data;
      const storeId = action.storeId && data.stores.some((s) => s.id === action.storeId) ? action.storeId : null;
      return touch({
        products: mapIds(data.products, action.ids, (p) => (p.storeId === storeId ? p : { ...p, storeId, updatedAt: at })),
      });
    }
    case 'bulk/delete': {
      if (!Array.isArray(action.ids) || !action.ids.length) return data;
      const set = new Set(action.ids);
      return touch({ products: data.products.filter((p) => !set.has(p.id)) });
    }
    case 'bulk/buy': {
      if (!Array.isArray(action.items) || !action.items.length) return data;
      const qty = new Map<string, number>();
      for (const it of action.items) if (it && typeof it.id === 'string' && isFiniteNum(it.qty) && it.qty > 0) qty.set(it.id, it.qty);
      if (!qty.size) return data;
      return touch({
        products: data.products.map((p) => {
          const q = qty.get(p.id);
          if (q === undefined || p.checked) return p;
          const b = Math.round((boughtQty(p) + q) * 1000) / 1000;
          return settleBought({ ...p, boughtQty: b, skipped: false, updatedAt: at }, at);
        }),
      });
    }
    case 'bulk/skip': {
      if (!Array.isArray(action.ids) || !action.ids.length) return data;
      const skipped = Boolean(action.skipped);
      return touch({
        products: mapIds(data.products, action.ids, (p) => (Boolean(p.skipped) === skipped || (skipped && p.checked) ? p : { ...p, skipped, updatedAt: at })),
      });
    }
    case 'bulk/setMonth': {
      if (!Array.isArray(action.ids) || !action.ids.length) return data;
      const month = cleanMonth(action.month);
      const target = month && month > data.currentMonth ? month : null;
      return touch({
        products: mapIds(data.products, action.ids, (p) => ((p.month ?? null) === target ? p : { ...p, month: target, updatedAt: at })),
      });
    }
    case 'bulk/copyToMonth': {
      if (!Array.isArray(action.ids) || !Array.isArray(action.newIds) || action.ids.length !== action.newIds.length) return data;
      const month = cleanMonth(action.month);
      const target = month && month > data.currentMonth ? month : null;
      const existing = new Set(data.products.map((p) => p.id));
      const copies: Product[] = [];
      action.ids.forEach((id, i) => {
        const src = data.products.find((p) => p.id === id);
        const newId = typeof action.newIds[i] === 'string' ? action.newIds[i].slice(0, 64) : '';
        if (!src || !newId || existing.has(newId)) return;
        existing.add(newId);
        copies.push({ ...src, id: newId, month: target, checked: false, checkedAt: null, createdAt: at, updatedAt: at });
      });
      if (!copies.length) return data;
      return touch({ products: [...data.products, ...copies] });
    }
    case 'store/add': {
      const s = action.store;
      const name = cleanText(s?.name, 40);
      if (!s || typeof s.id !== 'string' || !name || data.stores.some((x) => x.id === s.id)) return data;
      const store: Store = {
        id: s.id.slice(0, 64),
        name,
        color: cleanColor(s.color),
        photo: cleanPhoto(s.photo),
        createdAt: isFiniteNum(s.createdAt) ? s.createdAt : at,
      };
      return touch({ stores: [...data.stores, store] });
    }
    case 'store/update': {
      if (!data.stores.some((s) => s.id === action.id)) return data;
      return touch({
        stores: data.stores.map((s) => {
          if (s.id !== action.id) return s;
          const name = 'name' in action.patch ? cleanText(action.patch.name, 40) : s.name;
          const color = 'color' in action.patch ? cleanColor(action.patch.color) : s.color;
          const photo = 'photo' in action.patch ? cleanPhoto(action.patch.photo) : (s.photo ?? null);
          return { ...s, name: name || s.name, color, photo };
        }),
      });
    }
    case 'store/delete': {
      if (!data.stores.some((s) => s.id === action.id)) return data;
      return touch({
        stores: data.stores.filter((s) => s.id !== action.id),
        products: data.products.map((p) => (p.storeId === action.id ? { ...p, storeId: null, updatedAt: at } : p)),
      });
    }
    case 'month/close': {
      // Garde-fou : deux téléphones qui clôturent en même temps ne clôturent qu'une fois.
      if (action.fromMonth !== data.currentMonth) return data;
      const archiveIt = action.archive !== false;
      const history = archiveIt
        ? [...data.history.filter((h) => h.month !== data.currentMonth), buildArchive(data, at)].sort((a, b) => a.month.localeCompare(b.month))
        : data.history;
      const nextMonth = addMonths(data.currentMonth, 1);
      const reference = data.reference ?? [];
      const current = data.products.filter((p) => productMonth(p, data.currentMonth) === data.currentMonth);
      const planned = data.products.filter((p) => productMonth(p, data.currentMonth) !== data.currentMonth);
      // 1) La liste préparée pour le mois suivant devient la liste du mois.
      const promoted = planned.map((p) => (p.month === nextMonth ? { ...p, month: null, updatedAt: at } : p));
      const present = new Set<string>();
      const refPresent = new Set<string>();
      for (const p of promoted) {
        if (p.month) continue;
        present.add(itemKey(p));
        if (p.refId) refPresent.add(p.refId);
      }
      // 2) Le mois référence : chaque article type revient (prix et quantité de la référence).
      const fromRef = reference
        .filter((r) => !refPresent.has(r.id) && !present.has(itemKey(r)))
        .map((r) => productFromRef(r, null, nextMonth, at));
      for (const p of fromRef) present.add(itemKey(p));
      // 3) Hors référence : non achetés conservés, récurrents achetés décochés, achats ponctuels retirés.
      const carried = current
        .filter((p) => !p.refId || !reference.some((r) => r.id === p.refId))
        .filter((p) => !p.checked || p.recurring)
        .map((p) => (p.checked || p.boughtQty || p.skipped ? { ...p, checked: false, checkedAt: null, boughtQty: 0, skipped: false, updatedAt: at } : p))
        .filter((p) => !present.has(itemKey(p)));
      return touch({ history, products: [...promoted, ...fromRef, ...carried], currentMonth: nextMonth });
    }
    case 'ref/add': {
      const item = sanitizeRef(action.item, at);
      const reference = data.reference ?? [];
      if (!item || reference.some((r) => r.id === item.id)) return data;
      return touch({ reference: [...reference, item] });
    }
    case 'ref/update': {
      const reference = data.reference ?? [];
      const r = reference.find((x) => x.id === action.id);
      if (!r) return data;
      const merged = sanitizeRef({ ...r, ...action.patch, id: r.id, createdAt: r.createdAt }, at);
      if (!merged) return data;
      return touch({ reference: reference.map((x) => (x.id === r.id ? merged : x)) });
    }
    case 'ref/delete': {
      const reference = data.reference ?? [];
      const ids = new Set(Array.isArray(action.ids) ? action.ids : []);
      if (!reference.some((r) => ids.has(r.id))) return data;
      return touch({
        reference: reference.filter((r) => !ids.has(r.id)),
        products: data.products.map((p) => (p.refId && ids.has(p.refId) ? { ...p, refId: null } : p)),
      });
    }
    case 'ref/fromProducts': {
      const reference = (data.reference ?? []).slice();
      const ids = new Set(Array.isArray(action.ids) ? action.ids : []);
      const byKey = new Map(reference.map((r) => [itemKey(r), r]));
      let changed = false;
      const products = data.products.map((p) => {
        if (!ids.has(p.id) || (p.refId && reference.some((r) => r.id === p.refId))) return p;
        let r = byKey.get(itemKey(p));
        if (!r) {
          r = refFromProduct(p, `ref-${p.id}`.slice(0, 80), at);
          reference.push(r);
          byKey.set(itemKey(r), r);
        }
        changed = true;
        return { ...p, refId: r.id, updatedAt: at };
      });
      return changed ? touch({ products, reference }) : data;
    }
    case 'ref/applyToMonth': {
      const reference = data.reference ?? [];
      const month = cleanMonth(action.month);
      const target = month && month > data.currentMonth ? month : null;
      const monthKey = target ?? data.currentMonth;
      const inList = data.products.filter((p) => productMonth(p, data.currentMonth) === monthKey);
      const keys = new Set(inList.map(itemKey));
      const refs = new Set(inList.map((p) => p.refId).filter(Boolean));
      const ids = new Set(data.products.map((p) => p.id));
      const added = reference
        .filter((r) => !refs.has(r.id) && !keys.has(itemKey(r)))
        .map((r) => productFromRef(r, target, monthKey, at))
        .filter((p) => !ids.has(p.id));
      return added.length ? touch({ products: [...data.products, ...added] }) : data;
    }
    case 'history/delete': {
      if (!data.history.some((h) => h.month === action.month)) return data;
      return touch({ history: data.history.filter((h) => h.month !== action.month) });
    }
    case 'settings/update': {
      const patch = action.patch ?? {};
      const settings = { ...data.settings };
      if ('monthlyBudget' in patch) {
        const b = patch.monthlyBudget;
        settings.monthlyBudget = isFiniteNum(b) && b > 0 ? round2(b) : null;
      }
      if ('syncReference' in patch) settings.syncReference = patch.syncReference !== false;
      if ('backupSheetId' in patch) {
        const id = patch.backupSheetId;
        settings.backupSheetId = typeof id === 'string' && /^[\w-]{10,120}$/.test(id) ? id : null;
      }
      if ('backupAt' in patch) settings.backupAt = isFiniteNum(patch.backupAt) && patch.backupAt > 0 ? Math.round(patch.backupAt) : null;
      return touch({ settings });
    }
    default:
      return data;
  }
}

/** Applique une liste d'actions en ignorant celles déjà intégrées (lastActionIds). */
export function rebase(data: FamilyData, pending: ActionEnvelope[]): FamilyData {
  if (!pending.length) return data;
  const known = new Set(data.lastActionIds);
  return pending.reduce((acc, env) => (known.has(env.id) ? acc : reduce(acc, env)), data);
}
