import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Camera, Check, Filter, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import type { Product, ProductPatch, Store, Unit } from '../types';
import { UNITS } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { addMonths, productMonth } from '../shared/month';
import { boughtQty, lineTotal } from '../shared/totals';
import { formatDH, monthLabel, parseDecimal } from '../lib/format';
import { compressImage } from '../lib/image';
import { uid } from '../lib/id';
import { readString, writeString } from '../lib/storage';
import { FitImage } from './ui/FitImage';
import { ConfirmDialog } from './ui/ConfirmDialog';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const num = (n: number) => String(n).replace('.', ',');

type Status = 'todo' | 'partial' | 'done' | 'skipped';
const statusOf = (p: Product): Status => (p.skipped ? 'skipped' : p.checked ? 'done' : boughtQty(p) > 0 ? 'partial' : 'todo');
const STATUS_STYLE: Record<Status, string> = {
  todo: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  partial: 'bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
  done: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  skipped: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
};

type SortKey = 'name' | 'store' | 'price' | 'quantity' | 'total' | 'status';
interface Filters {
  q: string;
  store: string; // 'all' | 'none' | id
  status: 'all' | Status;
  month: 'all' | 'current' | 'next';
  ref: 'all' | 'in' | 'out';
  photo: 'all' | 'with' | 'without';
}
const NO_FILTERS: Filters = { q: '', store: 'all', status: 'all', month: 'all', ref: 'all', photo: 'all' };

const cell = 'h-9 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-sm outline-none hover:border-stone-200 focus:border-brand-500 focus:bg-white dark:hover:border-stone-700 dark:focus:bg-stone-900';

/** Champ texte/nombre de cellule : enregistré en quittant le champ ou avec Entrée, Échap annule. */
function CellInput({ value, onCommit, label, numeric, className = '', maxLength }: { value: string; onCommit: (v: string) => boolean | void; label: string; numeric?: boolean; className?: string; maxLength?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v === value) return;
    if (onCommit(v) === false) setV(value);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') {
      setV(value);
      requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
    }
  };
  return (
    <input
      className={`${cell} ${numeric ? 'text-right tabular' : ''} ${className}`}
      inputMode={numeric ? 'decimal' : undefined}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      aria-label={label}
      maxLength={maxLength}
    />
  );
}

interface RowProps {
  p: Product;
  stores: Store[];
  current: string;
  inRef: boolean;
  selected: boolean;
  onSelect: (id: string, on: boolean) => void;
  onDelete: (p: Product) => void;
  onError: (msg: string) => void;
}

const Row = memo(function Row({ p, stores, current, inRef, selected, onSelect, onDelete, onError }: RowProps) {
  const { dispatch } = useFamilyData();
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (patch: ProductPatch) => dispatch({ type: 'product/update', id: p.id, patch });
  const st = statusOf(p);
  const next = addMonths(current, 1);
  const pm = productMonth(p, current);
  const store = stores.find((s) => s.id === p.storeId);

  const commitNum = (field: 'price' | 'quantity') => (raw: string) => {
    const v = parseDecimal(raw);
    if (!Number.isFinite(v) || v < 0 || (field === 'quantity' && v <= 0)) return false;
    if (v !== p[field]) update({ [field]: v });
  };

  const setStatus = (s: Status) => {
    if (s === st) return;
    if (s === 'skipped') return dispatch({ type: 'bulk/skip', ids: [p.id], skipped: true });
    if (p.skipped) dispatch({ type: 'bulk/skip', ids: [p.id], skipped: false });
    if (s === 'done') dispatch({ type: 'product/setChecked', id: p.id, checked: true });
    if (s === 'todo') {
      if (p.checked) dispatch({ type: 'product/setChecked', id: p.id, checked: false });
      else if (boughtQty(p) > 0) update({ boughtQty: 0 });
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      update({ photo: await compressImage(file) });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Photo illisible.');
    }
  };

  const td = 'border-b border-stone-100 px-1 py-1 align-middle dark:border-stone-800';
  const sticky = `sticky z-10 ${selected ? 'bg-brand-50 dark:bg-stone-800' : 'bg-white dark:bg-stone-900'}`;

  return (
    <tr className={`${selected ? 'bg-brand-50 dark:bg-stone-800' : ''} ${st === 'skipped' ? 'opacity-60' : ''}`}>
      <td className={`${td} ${sticky} left-0 w-10 min-w-10 max-w-10 text-center`}>
        <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={selected} onChange={(e) => onSelect(p.id, e.target.checked)} aria-label={`Sélectionner ${p.name}`} />
      </td>
      <td className={`${td} ${sticky} left-10 w-14 min-w-14 max-w-14`}>
        <button type="button" onClick={() => fileRef.current?.click()} className="group relative block h-10 w-10 overflow-hidden rounded-lg" aria-label={p.photo ? `Changer la photo de ${p.name}` : `Ajouter une photo à ${p.name}`} title="Changer la photo">
          <FitImage
            src={p.photo}
            className="h-10 w-10 rounded-lg ring-1 ring-black/5"
            fallback={
              <span className="grid h-10 w-10 place-items-center rounded-lg border border-dashed border-stone-300 text-stone-400 dark:border-stone-700">
                <Camera className="h-4 w-4" />
              </span>
            }
          />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      </td>
      <td className={`${td} ${sticky} left-24 min-w-[9.5rem] shadow-[6px_0_6px_-6px_rgba(0,0,0,0.15)]`}>
        <CellInput value={p.name} label={`Nom de ${p.name}`} className="font-semibold" maxLength={80} onCommit={(v) => (v.trim() ? update({ name: v.trim() }) : false)} />
      </td>
      <td className={`${td} min-w-[10.5rem]`}>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: store?.color ?? '#a8a29e' }} aria-hidden="true" />
          <select className={cell} value={p.storeId ?? ''} onChange={(e) => update({ storeId: e.target.value || null })} aria-label={`Magasin de ${p.name}`}>
            <option value="">Sans magasin</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </span>
      </td>
      <td className={`${td} w-24`}>
        <CellInput value={num(p.price)} numeric label={`Prix de ${p.name}`} onCommit={commitNum('price')} />
      </td>
      <td className={`${td} w-20`}>
        <CellInput value={num(p.quantity)} numeric label={`Quantité de ${p.name}`} onCommit={commitNum('quantity')} />
      </td>
      <td className={`${td} w-20`}>
        <select className={cell} value={p.unit} onChange={(e) => update({ unit: e.target.value as Unit })} aria-label={`Unité de ${p.name}`}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </td>
      <td className={`${td} w-28 whitespace-nowrap px-2 text-right text-sm font-bold tabular`}>{formatDH(lineTotal(p))}</td>
      <td className={`${td} min-w-[9.5rem]`}>
        <select className={`${cell} font-semibold ${STATUS_STYLE[st]}`} value={st} onChange={(e) => setStatus(e.target.value as Status)} aria-label={`Statut de ${p.name}`}>
          <option value="todo">À acheter</option>
          {st === 'partial' && <option value="partial">Partiel ({num(boughtQty(p))})</option>}
          <option value="done">Acheté</option>
          <option value="skipped">Ignoré ce mois</option>
        </select>
      </td>
      <td className={`${td} min-w-[9.5rem]`}>
        <select className={cell} value={pm === current ? '' : pm} onChange={(e) => update({ month: e.target.value || null })} aria-label={`Mois de ${p.name}`}>
          <option value="">{monthLabel(current)}</option>
          <option value={next}>{monthLabel(next)}</option>
        </select>
      </td>
      <td className={`${td} w-16 text-center`}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand-700"
          checked={inRef}
          onChange={(e) => (e.target.checked ? dispatch({ type: 'ref/fromProducts', ids: [p.id] }) : update({ refId: null }))}
          aria-label={`${p.name} dans le mois référence`}
        />
      </td>
      <td className={`${td} w-16 text-center`}>
        <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={p.recurring} onChange={(e) => update({ recurring: e.target.checked })} aria-label={`${p.name} récurrent`} />
      </td>
      <td className={`${td} min-w-[10rem]`}>
        <CellInput value={p.notes} label={`Notes de ${p.name}`} maxLength={300} onCommit={(v) => update({ notes: v.trim() })} />
      </td>
      <td className={`${td} w-11 text-center`}>
        <button type="button" onClick={() => onDelete(p)} className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" aria-label={`Supprimer ${p.name}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
});

/** Ligne d'ajout rapide en haut du tableau. */
function AddRow({ stores, current, defaultStore }: { stores: Store[]; current: string; defaultStore: string | null }) {
  const { dispatch } = useFamilyData();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState<Unit>('pcs');
  const [storeId, setStoreId] = useState<string>(defaultStore ?? '');
  useEffect(() => setStoreId(defaultStore ?? ''), [defaultStore]);
  const nameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(() => wide());

  const add = () => {
    const n = name.trim();
    if (!n) return nameRef.current?.focus();
    const pr = parseDecimal(price);
    const q = parseDecimal(qty);
    const now = Date.now();
    dispatch({
      type: 'product/add',
      product: {
        id: uid(),
        name: n.charAt(0).toUpperCase() + n.slice(1),
        price: Number.isFinite(pr) && pr >= 0 ? pr : 0,
        quantity: Number.isFinite(q) && q > 0 ? q : 1,
        unit,
        storeId: storeId || null,
        checked: false,
        photo: null,
        notes: '',
        recurring: true,
        month: null,
        createdAt: now,
        updatedAt: now,
        checkedAt: null,
      },
      toReference: true,
    });
    setName('');
    setPrice('');
    setQty('1');
    nameRef.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Enter' && add();
  const box = 'h-9 w-full min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-sm outline-none focus:border-brand-500 dark:border-stone-700 dark:bg-stone-900';
  if (!open)
    return (
      <button type="button" onClick={() => { setOpen(true); requestAnimationFrame(() => nameRef.current?.focus()); }} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 text-sm font-semibold text-stone-600 dark:border-stone-700 dark:text-stone-300">
        <Plus className="h-4 w-4" /> Nouvel article
      </button>
    );
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200/70 sm:grid-cols-[2fr_1.4fr_1fr_0.8fr_0.9fr_auto] dark:bg-stone-900 dark:ring-stone-800">
      <input ref={nameRef} className={`${box} col-span-2 sm:col-span-1`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} placeholder="Nouvel article…" aria-label="Nom du nouvel article" maxLength={80} />
      <select className={box} value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Magasin du nouvel article">
        <option value="">Sans magasin</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input className={`${box} text-right tabular`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={onKey} placeholder="Prix DH" aria-label="Prix du nouvel article" />
      <input className={`${box} text-right tabular`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={onKey} aria-label="Quantité du nouvel article" />
      <select className={box} value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unité du nouvel article">
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <button type="button" onClick={add} className="btn-primary h-9 px-3 text-sm">
        <Plus className="h-4 w-4" /> Ajouter
      </button>
      <p className="col-span-2 text-xs text-stone-500 sm:col-span-6">Ajouté à {monthLabel(current)} et au mois référence.</p>
    </div>
  );
}

const FILTER_KEY = 'cf:tableFilters';
const wide = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 640px)').matches;

/** Tableau des articles : lignes × colonnes modifiables, filtres, tri et actions groupées. */
export function ArticlesTable() {
  const { data, dispatch } = useFamilyData();
  const [f, setF] = useState<Filters>(() => {
    try {
      const raw = readString(FILTER_KEY);
      return raw ? { ...NO_FILTERS, ...(JSON.parse(raw) as Partial<Filters>), q: '' } : NO_FILTERS;
    } catch {
      return NO_FILTERS;
    }
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'store', dir: 1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(() => wide());
  const [confirmDel, setConfirmDel] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { q: _q, ...rest } = f;
    void _q;
    writeString(FILTER_KEY, JSON.stringify(rest));
  }, [f]);

  const current = data.currentMonth;
  const next = addMonths(current, 1);
  const refIds = useMemo(() => new Set((data.reference ?? []).map((r) => r.id)), [data.reference]);
  const storeName = useMemo(() => new Map(data.stores.map((s) => [s.id, s.name])), [data.stores]);
  const rank: Record<Status, number> = { todo: 0, partial: 1, done: 2, skipped: 3 };

  const rows = useMemo(() => {
    const q = fold(f.q.trim());
    const out = data.products.filter((p) => {
      if (f.store === 'none' ? p.storeId && storeName.has(p.storeId) : f.store !== 'all' && p.storeId !== f.store) return false;
      if (f.status !== 'all' && statusOf(p) !== f.status) return false;
      const pm = productMonth(p, current);
      if (f.month === 'current' && pm !== current) return false;
      if (f.month === 'next' && pm === current) return false;
      const inRef = Boolean(p.refId && refIds.has(p.refId));
      if (f.ref === 'in' && !inRef) return false;
      if (f.ref === 'out' && inRef) return false;
      if (f.photo === 'with' && !p.photo) return false;
      if (f.photo === 'without' && p.photo) return false;
      if (q && !fold(p.name).includes(q) && !fold(p.notes).includes(q)) return false;
      return true;
    });
    const sName = (p: Product) => (p.storeId ? (storeName.get(p.storeId) ?? '~') : '~');
    const cmp: Record<SortKey, (a: Product, b: Product) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, 'fr'),
      store: (a, b) => sName(a).localeCompare(sName(b), 'fr') || a.name.localeCompare(b.name, 'fr'),
      price: (a, b) => a.price - b.price,
      quantity: (a, b) => a.quantity - b.quantity,
      total: (a, b) => lineTotal(a) - lineTotal(b),
      status: (a, b) => rank[statusOf(a)] - rank[statusOf(b)] || a.name.localeCompare(b.name, 'fr'),
    };
    return out.sort((a, b) => cmp[sort.key](a, b) * sort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.products, f, sort, storeName, refIds, current]);

  // La sélection ne garde que les lignes encore visibles.
  const visibleSel = useMemo(() => rows.filter((p) => sel.has(p.id)).map((p) => p.id), [rows, sel]);
  const total = rows.reduce((s, p) => s + (p.skipped ? 0 : lineTotal(p)), 0);
  const active = (Object.keys(NO_FILTERS) as Array<keyof Filters>).filter((k) => f[k] !== NO_FILTERS[k]).length;

  const onSelect = useMemo(
    () => (id: string, on: boolean) =>
      setSel((s) => {
        const n = new Set(s);
        if (on) n.add(id);
        else n.delete(id);
        return n;
      }),
    [],
  );
  const onDelete = useMemo(() => (p: Product) => setConfirmDel([p]), []);
  const allOn = rows.length > 0 && visibleSel.length === rows.length;

  const th = (label: string, key?: SortKey, extra = '') => (
    <th scope="col" className={`sticky top-0 z-20 border-b border-stone-200 bg-stone-50 px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 ${extra}`}>
      {key ? (
        <button type="button" className="inline-flex items-center gap-0.5 uppercase" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}>
          {label}
          {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      ) : (
        label
      )}
    </th>
  );
  const sel1 = 'h-10 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-2 text-sm dark:border-stone-700 dark:bg-stone-900';
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-3">
      <AddRow stores={data.stores} current={current} defaultStore={f.store !== 'all' && f.store !== 'none' ? f.store : null} />

      <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-stone-800">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Rechercher un article ou une note…" className="h-10 w-full rounded-xl border border-stone-200 bg-white pl-9 pr-8 text-sm outline-none focus:border-brand-500 dark:border-stone-700 dark:bg-stone-900" aria-label="Rechercher dans le tableau" />
            {f.q && (
              <button type="button" onClick={() => set('q', '')} className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-stone-400" aria-label="Effacer la recherche">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button type="button" onClick={() => setShowFilters((s) => !s)} className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ${showFilters ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'bg-stone-100 dark:bg-stone-800'}`} aria-expanded={showFilters}>
            <Filter className="h-4 w-4" /> Filtres{active ? ` (${active})` : ''}
          </button>
        </div>
        {showFilters && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <select className={sel1} value={f.store} onChange={(e) => set('store', e.target.value)} aria-label="Filtrer par magasin">
              <option value="all">Tous les magasins</option>
              {data.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="none">Sans magasin</option>
            </select>
            <select className={sel1} value={f.status} onChange={(e) => set('status', e.target.value as Filters['status'])} aria-label="Filtrer par statut">
              <option value="all">Tous les statuts</option>
              <option value="todo">À acheter</option>
              <option value="partial">Partiel</option>
              <option value="done">Acheté</option>
              <option value="skipped">Ignoré</option>
            </select>
            <select className={sel1} value={f.month} onChange={(e) => set('month', e.target.value as Filters['month'])} aria-label="Filtrer par mois">
              <option value="all">Tous les mois</option>
              <option value="current">{monthLabel(current)}</option>
              <option value="next">{monthLabel(next)}</option>
            </select>
            <select className={sel1} value={f.ref} onChange={(e) => set('ref', e.target.value as Filters['ref'])} aria-label="Filtrer par mois référence">
              <option value="all">Référence : tous</option>
              <option value="in">Dans la référence</option>
              <option value="out">Hors référence</option>
            </select>
            <select className={sel1} value={f.photo} onChange={(e) => set('photo', e.target.value as Filters['photo'])} aria-label="Filtrer par photo">
              <option value="all">Photo : tous</option>
              <option value="with">Avec photo</option>
              <option value="without">Sans photo</option>
            </select>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-stone-600 dark:text-stone-300">
            <b className="tabular">{rows.length}</b> / {data.products.length} articles · <b className="tabular">{formatDH(total)}</b>
          </span>
          {active > 0 && (
            <button type="button" onClick={() => setF(NO_FILTERS)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <RotateCcw className="h-3.5 w-3.5" /> Effacer les filtres
            </button>
          )}
        </div>
      </div>

      {visibleSel.length > 0 && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-2xl bg-stone-900 p-2 text-sm text-white shadow-lg dark:bg-white dark:text-stone-900">
          <span className="px-2 font-semibold">{visibleSel.length} sélectionné{visibleSel.length > 1 ? 's' : ''}</span>
          <button type="button" className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold dark:bg-stone-900/10" onClick={() => dispatch({ type: 'bulk/setChecked', ids: visibleSel, checked: true })}>
            <Check className="mr-1 inline h-4 w-4" />
            Acheté
          </button>
          <button type="button" className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold dark:bg-stone-900/10" onClick={() => dispatch({ type: 'bulk/setChecked', ids: visibleSel, checked: false })}>
            À acheter
          </button>
          <select
            className="h-8 rounded-lg bg-white/15 px-2 font-semibold text-inherit dark:bg-stone-900/10"
            value=""
            onChange={(e) => {
              if (e.target.value) dispatch({ type: 'bulk/move', ids: visibleSel, storeId: e.target.value === 'none' ? null : e.target.value });
            }}
            aria-label="Changer le magasin des articles sélectionnés"
          >
            <option value="">Magasin…</option>
            {data.stores.map((s) => (
              <option key={s.id} value={s.id} className="text-stone-900">
                {s.name}
              </option>
            ))}
            <option value="none" className="text-stone-900">
              Sans magasin
            </option>
          </select>
          <button type="button" className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white" onClick={() => setConfirmDel(data.products.filter((p) => visibleSel.includes(p.id)))}>
            <Trash2 className="mr-1 inline h-4 w-4" />
            Supprimer
          </button>
          <button type="button" className="ml-auto grid h-8 w-8 place-items-center rounded-lg" onClick={() => setSel(new Set())} aria-label="Annuler la sélection">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">
          {error}
        </p>
      )}

      <div className="max-h-[70dvh] overflow-auto rounded-2xl bg-white ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-stone-800">
        <table className="w-full min-w-[78rem] border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 w-10 min-w-10 max-w-10 border-b border-stone-200 bg-stone-50 px-1 text-center dark:border-stone-700 dark:bg-stone-800">
                <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={allOn} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((p) => p.id)) : new Set())} aria-label="Tout sélectionner" />
              </th>
              {th('Photo', undefined, 'left-10 z-30 w-14 min-w-14 max-w-14')}
              {th('Article', 'name', 'left-24 z-30')}
              {th('Magasin', 'store')}
              {th('Prix DH', 'price', 'text-right')}
              {th('Qté', 'quantity', 'text-right')}
              {th('Unité')}
              {th('Total', 'total', 'text-right')}
              {th('Statut', 'status')}
              {th('Mois')}
              {th('Réf.', undefined, 'text-center')}
              {th('Récur.', undefined, 'text-center')}
              {th('Notes / marque')}
              <th scope="col" className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800">
                <span className="sr-only">Supprimer</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Row
                key={p.id}
                p={p}
                stores={data.stores}
                current={current}
                inRef={Boolean(p.refId && refIds.has(p.refId))}
                selected={sel.has(p.id)}
                onSelect={onSelect}
                onDelete={onDelete}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="py-10 text-center text-sm text-stone-500">Aucun article ne correspond aux filtres.</p>}
      </div>
      <p className="px-1 text-xs text-stone-500 dark:text-stone-400">Touchez une case pour la modifier : enregistré dès que vous quittez la case (Entrée valide, Échap annule). Touchez la photo pour la changer. Faites glisser le tableau sur le côté pour voir toutes les colonnes.</p>

      <ConfirmDialog
        open={confirmDel !== null}
        onClose={() => setConfirmDel(null)}
        danger
        title={confirmDel && confirmDel.length === 1 ? `Supprimer « ${confirmDel[0].name} » ?` : `Supprimer ${confirmDel?.length ?? 0} articles ?`}
        confirmLabel="Supprimer"
        message="Les articles disparaissent de la liste de toute la famille. Le mois référence n’est pas modifié."
        onConfirm={() => {
          if (!confirmDel) return;
          dispatch({ type: 'bulk/delete', ids: confirmDel.map((p) => p.id) });
          setSel(new Set());
        }}
      />
    </div>
  );
}
