import { useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Minus, Package, PartyPopper, Pencil, Plus, Search, ShoppingCart, Sun, Undo2, X } from 'lucide-react';
import type { Product, Store } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { boughtQty, remainingQty, round2, spentTotal, sumTotals } from '../shared/totals';
import { qtyStep } from '../shared/reducer';
import { formatAmount, formatDH, formatNumber, monthLabel } from '../lib/format';
import { tint } from '../lib/color';
import { inMonth } from '../shared/month';
import { StoreFilter, matchesStore } from './StoreFilter';
import type { StoreFilterValue } from './StoreFilter';
import { sortProducts } from './ProductList';
import { FitImage } from './ui/FitImage';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

interface ShoppingModeProps {
  initialStore: StoreFilterValue;
  /** Mois de la liste parcourue (en cours ou préparée à l'avance). */
  month: string;
  onClose: () => void;
  onEdit: (p: Product) => void;
  /** Ouvre le formulaire d'ajout (magasin du filtre pré-rempli). */
  onAdd: (storeId: string | null) => void;
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

/** Garde l'écran allumé pendant les courses (si le navigateur le permet : HTTPS/localhost). */
function useWakeLock(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;
    const acquire = async () => {
      try {
        sentinel = await wl.request('screen');
        if (disposed) void sentinel.release();
        else setActive(true);
      } catch {
        setActive(false);
      }
    };
    void acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
  return active;
}

function vibrate(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /[\p{L}\d]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Petite image carrée : la photo de l'article, sinon ses initiales sur la couleur du magasin. */
function Thumb({ p, color }: { p: Product; color: string }) {
  return (
    <span className="relative block aspect-square w-full overflow-hidden rounded-2xl" style={{ backgroundColor: tint(color, 0.16) }}>
      <FitImage
        src={p.photo}
        backdrop="blur"
        className="h-full w-full"
        fallback={
          <span className="flex h-full w-full items-center justify-center text-xl font-black tracking-tight" style={{ color }}>
            {initials(p.name) || <Package className="h-7 w-7" />}
          </span>
        }
      />
    </span>
  );
}

interface TileProps {
  product: Product;
  store: Store | undefined;
  selectedQty: number | undefined;
  onToggle: (p: Product) => void;
  onQty: (p: Product, qty: number) => void;
  onEdit: (p: Product) => void;
}

/** Tuile compacte « à acheter » : un appui coche, rien n'est enregistré avant « Valider ». */
function Tile({ product: p, store, selectedQty, onToggle, onQty, onEdit }: TileProps) {
  const selected = selectedQty !== undefined;
  const rest = remainingQty(p);
  const bought = boughtQty(p);
  const step = qtyStep(p.unit);
  const color = store?.color ?? '#78716c';

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => onToggle(p)}
        className={`block w-full rounded-3xl bg-white p-1.5 text-left shadow-sm transition active:scale-[0.97] dark:bg-stone-900 ${
          selected ? 'ring-[3px] ring-emerald-500' : 'ring-1 ring-stone-200/80 dark:ring-stone-800'
        }`}
        aria-pressed={selected}
        aria-label={`${selected ? 'Décocher' : 'Cocher'} ${p.name}`}
      >
        <span className="relative block">
          <Thumb p={p} color={color} />
          {selected && <span className="absolute inset-0 rounded-2xl bg-emerald-500/25" aria-hidden="true" />}
          <span
            className={`absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border-[2.5px] shadow transition ${
              selected ? 'animate-pop border-emerald-500 bg-emerald-500 text-white' : 'border-white bg-white/80 text-transparent dark:bg-stone-900/70'
            }`}
            aria-hidden="true"
          >
            <Check className="h-4 w-4" strokeWidth={3.5} />
          </span>
          {bought > 0 && (
            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-amber-400 px-1.5 py-px text-[10px] font-bold text-stone-900 shadow">
              {formatNumber(bought)}/{formatNumber(p.quantity)}
            </span>
          )}
        </span>
        <span className="block px-1 pb-0.5 pt-1.5">
          <span className="line-clamp-2 min-h-[2.1rem] text-[13px] font-bold leading-tight">{p.name}</span>
          <span className="mt-0.5 block truncate text-[12px] font-semibold text-stone-600 tabular dark:text-stone-300">
            {formatNumber(rest)} {p.unit} × {formatAmount(p.price)}
          </span>
          <span className="block text-[13px] font-black tabular">{formatDH(round2(p.price * (selected ? selectedQty! : rest)))}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onEdit(p)}
        className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-white/85 text-stone-600 shadow-sm dark:bg-stone-900/80 dark:text-stone-300"
        aria-label={`Modifier ${p.name}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {selected && rest > step && (
        <div className="mt-1 flex items-center justify-between rounded-2xl bg-emerald-50 p-0.5 dark:bg-emerald-950/40">
          <button
            type="button"
            onClick={() => onQty(p, Math.max(step, round3(selectedQty! - step)))}
            disabled={selectedQty! <= step}
            className="grid h-8 w-8 place-items-center rounded-full bg-white text-emerald-800 shadow-sm disabled:opacity-30 dark:bg-stone-800 dark:text-emerald-200"
            aria-label={`Prendre moins de ${p.name}`}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="text-center text-[11px] font-bold leading-tight text-emerald-900 tabular dark:text-emerald-100">
            {formatNumber(selectedQty!)}/{formatNumber(rest)}
          </span>
          <button
            type="button"
            onClick={() => onQty(p, Math.min(rest, round3(selectedQty! + step)))}
            disabled={selectedQty! >= rest}
            className="grid h-8 w-8 place-items-center rounded-full bg-white text-emerald-800 shadow-sm disabled:opacity-30 dark:bg-stone-800 dark:text-emerald-200"
            aria-label={`Prendre plus de ${p.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}

/** Mode « En rayon » : uniquement ce qu'il reste à acheter, en petites tuiles. */
export function ShoppingMode({ initialStore, month, onClose, onEdit, onAdd }: ShoppingModeProps) {
  const { data, dispatch } = useFamilyData();
  const [store, setStore] = useState<StoreFilterValue>(initialStore);
  const [view, setView] = useState<'todo' | 'done'>('todo');
  /** Recherche d'un article dans le rayon (nom ou notes, sans tenir compte des accents). */
  const [query, setQuery] = useState('');
  /** Sélection en cours : id → quantité prise maintenant. */
  const [selection, setSelection] = useState<Map<string, number>>(() => new Map());
  const awake = useWakeLock();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (store !== 'all' && store !== 'none' && !data.stores.some((s) => s.id === store)) setStore('all');
  }, [store, data.stores]);

  const storeById = useMemo(() => new Map(data.stores.map((s) => [s.id, s])), [data.stores]);
  const monthProducts = useMemo(() => data.products.filter((p) => inMonth(p, data.currentMonth, month)), [data.products, data.currentMonth, month]);
  const visible = useMemo(() => monthProducts.filter((p) => matchesStore(p, store, data.stores)), [monthProducts, data.stores, store]);
  const q = fold(query);
  const hit = useMemo(() => (p: Product) => !q || fold(p.name).includes(q) || fold(p.notes ?? '').includes(q), [q]);
  const allTodo = useMemo(() => visible.filter((p) => !p.checked && !p.skipped), [visible]);
  const todo = useMemo(() => sortProducts(allTodo.filter(hit)), [allTodo, hit]);
  const done = useMemo(() => sortProducts(visible.filter((p) => !p.skipped && (p.checked || boughtQty(p) > 0)).filter(hit)), [visible, hit]);
  const skipped = useMemo(() => sortProducts(visible.filter((p) => p.skipped).filter(hit)), [visible, hit]);
  /** Articles qui correspondent à la recherche mais dans un autre magasin (encore à acheter). */
  const elsewhere = useMemo(
    () => (q ? monthProducts.filter((p) => !p.checked && !p.skipped && hit(p) && !matchesStore(p, store, data.stores)) : []),
    [q, monthProducts, hit, store, data.stores],
  );
  const totals = useMemo(() => sumTotals(visible), [visible]);
  const remainingAmount = Math.max(0, round2(totals.estimated - totals.spent));
  const pct = totals.estimated ? (totals.spent / totals.estimated) * 100 : 0;
  const currentStore = store !== 'all' && store !== 'none' ? storeById.get(store) : undefined;

  // La sélection ne garde que des articles encore à acheter.
  useEffect(() => {
    setSelection((sel) => {
      if (!sel.size) return sel;
      const byId = new Map(data.products.map((p) => [p.id, p]));
      let changed = false;
      const next = new Map<string, number>();
      for (const [id, q] of sel) {
        const p = byId.get(id);
        const rest = p ? remainingQty(p) : 0;
        if (!p || p.checked || p.skipped || rest <= 0) {
          changed = true;
          continue;
        }
        const qq = Math.min(q, rest);
        if (qq !== q) changed = true;
        next.set(id, qq);
      }
      return changed ? next : sel;
    });
  }, [data.products]);

  const toggle = (p: Product) => {
    vibrate();
    setSelection((sel) => {
      const next = new Map(sel);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, remainingQty(p));
      return next;
    });
  };
  const setQty = (p: Product, qty: number) => setSelection((sel) => new Map(sel).set(p.id, qty));

  const selectedTotal = useMemo(() => {
    let t = 0;
    for (const p of allTodo) {
      const q = selection.get(p.id);
      if (q !== undefined) t += p.price * q;
    }
    return round2(t);
  }, [allTodo, selection]);

  const validate = () => {
    if (!selection.size) return;
    vibrate(30);
    dispatch({ type: 'bulk/buy', items: [...selection].map(([id, qty]) => ({ id, qty })) });
    setSelection(new Map());
  };

  const tab = (v: 'todo' | 'done', label: string, n: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === v}
      onClick={() => setView(v)}
      className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition ${
        view === v ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white' : 'text-stone-500 dark:text-stone-400'
      }`}
    >
      {label}
      <span className={`rounded-full px-2 text-xs tabular ${view === v ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'bg-stone-500/15'}`}>{n}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 dark:bg-stone-950" role="region" aria-label="Mode courses">
      <div className="pt-safe text-white" style={{ backgroundColor: currentStore?.color ?? '#115e59' }}>
        <div className="bg-black/25">
          <div className="mx-auto max-w-3xl px-4 pb-3 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-lg font-black leading-tight">{currentStore?.name ?? (store === 'none' ? 'Sans magasin' : 'Tous les magasins')}</div>
                <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                  En rayon · {monthLabel(month)}
                  {awake && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-px text-[10px]">
                      <Sun className="h-3 w-3" /> écran actif
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => onAdd(currentStore?.id ?? null)} className="inline-flex h-10 items-center gap-1 rounded-full bg-saffron-400 px-3 text-sm font-bold text-stone-900 transition active:scale-95">
                  <Plus className="h-4 w-4" strokeWidth={2.5} /> Article
                </button>
                <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 transition active:scale-95 hover:bg-white/25" aria-label="Quitter le mode courses">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-white/75">Reste à acheter</div>
                <div className="text-3xl font-black leading-tight tabular" aria-live="polite">
                  {formatAmount(remainingAmount)}
                  <span className="ml-1 text-base font-bold text-white/75">DH</span>
                </div>
              </div>
              <div className="text-right text-xs font-semibold text-white/85 tabular">
                <div>
                  <b className="text-2xl font-black text-white">{allTodo.length}</b> article{allTodo.length > 1 ? 's' : ''}
                </div>
                <div>Panier {formatDH(totals.spent)}</div>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-saffron-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-2 px-4 pt-3">
        <StoreFilter stores={data.stores} products={monthProducts} value={store} onChange={setStore} showTotals={false} />
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
            placeholder="Chercher un article…"
            enterKeyHint="search"
            autoComplete="off"
            className="h-12 w-full rounded-2xl border border-stone-200 bg-white pl-11 pr-12 text-base outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-stone-800 dark:bg-stone-900 [&::-webkit-search-cancel-button]:hidden"
            aria-label="Chercher un article dans le rayon"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Effacer la recherche">
              <X className="h-5 w-5" />
            </button>
          )}
        </label>
        <div className="flex gap-1 rounded-[1.25rem] bg-stone-200/70 p-1 dark:bg-stone-800" role="tablist" aria-label="Vue">
          {tab('todo', 'À acheter', todo.length)}
          {tab('done', 'Déjà acheté', done.length)}
        </div>
      </div>

      <div className={`mx-auto w-full max-w-3xl flex-1 overflow-y-auto overscroll-contain px-4 pt-3 ${selection.size ? 'pb-28' : 'pb-10'}`}>
        {q && elsewhere.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-900/30 dark:text-sky-100">
            <span className="min-w-0 flex-1">
              « {query.trim()} » aussi dans {[...new Set(elsewhere.map((p) => (p.storeId && storeById.get(p.storeId)?.name) || 'Sans magasin'))].join(', ')}
            </span>
            <button type="button" onClick={() => setStore('all')} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-sky-900 shadow-sm dark:bg-sky-950 dark:text-sky-100">
              Tous les magasins
            </button>
          </div>
        )}
        {view === 'todo' && q && todo.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-lg font-bold">Aucun article « {query.trim()} » à acheter ici</p>
            <button type="button" onClick={() => setQuery('')} className="mt-3 rounded-full bg-stone-200 px-4 py-2 text-sm font-semibold dark:bg-stone-800">
              Effacer la recherche
            </button>
          </div>
        )}
        {view === 'todo' &&
          !(q && todo.length === 0) &&
          (todo.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <PartyPopper className="h-10 w-10" />
              </span>
              <p className="mt-4 text-xl font-bold">{visible.length ? 'Tout est acheté ici !' : 'Aucun article ici'}</p>
              <p className="mt-1 text-stone-500 dark:text-stone-400">{visible.length ? `Panier : ${formatDH(totals.spent)}` : 'Choisissez un autre magasin ou ajoutez un article.'}</p>
            </div>
          ) : (
            <>
              <p className="mb-2 px-1 text-xs text-stone-500 dark:text-stone-400">Cochez ce que vous mettez dans le chariot, puis Valider : les articles validés disparaissent.</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {todo.map((p) => (
                  <Tile key={p.id} product={p} store={p.storeId ? storeById.get(p.storeId) : undefined} selectedQty={selection.get(p.id)} onToggle={toggle} onQty={setQty} onEdit={onEdit} />
                ))}
              </ul>
            </>
          ))}

        {view === 'done' && (
          <>
            {done.length === 0 && skipped.length === 0 && <p className="py-12 text-center text-stone-500">{q ? `Aucun article « ${query.trim()} » déjà acheté.` : 'Rien d’acheté pour l’instant.'}</p>}
            {done.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {done.map((p) => (
                  <li key={p.id} className="rounded-3xl bg-white p-1.5 shadow-sm ring-1 ring-stone-200/80 dark:bg-stone-900 dark:ring-stone-800">
                    <span className="relative block opacity-80">
                      <Thumb p={p} color={(p.storeId && storeById.get(p.storeId)?.color) || '#78716c'} />
                      <span className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white shadow">
                        <Check className="h-4 w-4" strokeWidth={3.5} />
                      </span>
                    </span>
                    <span className="block px-1 pt-1.5">
                      <span className="line-clamp-2 min-h-[2.1rem] text-[13px] font-bold leading-tight">{p.name}</span>
                      <span className="block text-[12px] font-semibold text-stone-600 tabular dark:text-stone-300">
                        {formatNumber(boughtQty(p))}/{formatNumber(p.quantity)} {p.unit}
                      </span>
                      <span className="block text-[13px] font-black tabular">{formatDH(spentTotal(p))}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'product/setChecked', id: p.id, checked: false })}
                      className="mt-1 flex h-8 w-full items-center justify-center gap-1 rounded-xl bg-stone-100 text-[11px] font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200"
                      aria-label={`Remettre ${p.name} à acheter`}
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Remettre
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {skipped.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-stone-500 dark:text-stone-400">
                  <EyeOff className="h-4 w-4" /> Ignorés ce mois ({skipped.length})
                </h3>
                <ul className="space-y-2">
                  {skipped.map((p) => (
                    <li key={p.id} className="flex min-h-[48px] items-center gap-3 rounded-2xl bg-white/60 p-2.5 dark:bg-stone-900/60">
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'bulk/skip', ids: [p.id], skipped: false })}
                        className="h-9 shrink-0 rounded-full bg-stone-100 px-3 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200"
                        aria-label={`Rétablir ${p.name}`}
                      >
                        Rétablir
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {selection.size > 0 && view === 'todo' && (
        <div className="pb-safe absolute inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 px-4 pt-3 backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/95">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <button type="button" onClick={() => setSelection(new Map())} className="btn-secondary h-14 w-14 shrink-0 px-0" aria-label="Annuler la sélection">
              <X className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={validate}
              aria-label={`Valider ${selection.size} achat${selection.size > 1 ? 's' : ''}`}
              className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-lg font-bold text-white shadow-lg transition active:scale-[0.98] hover:bg-emerald-700"
            >
              <ShoppingCart className="h-6 w-6 shrink-0" />
              <span className="whitespace-nowrap">Valider ({selection.size})</span>
              <span className="whitespace-nowrap rounded-full bg-white/20 px-2.5 py-0.5 text-base tabular">{formatDH(selectedTotal)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
