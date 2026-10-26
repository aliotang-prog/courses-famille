import { useMemo } from 'react';
import { BarChart3, BookMarked, FileSpreadsheet, LayoutList, Plus, Settings, ShoppingCart, Store as StoreIcon } from 'lucide-react';
import type { MonthKey, Product, Store } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { NO_STORE_COLOR, NO_STORE_NAME, sumTotals } from '../shared/totals';
import { addMonths, inMonth } from '../shared/month';
import { formatAmount, monthLabel } from '../lib/format';
import { readableText, tint } from '../lib/color';
import { BudgetSummary } from './BudgetSummary';
import { refTotal } from '../shared/reducer';
import { FitImage } from './ui/FitImage';

interface HomeProps {
  viewMonth: MonthKey | null;
  onViewMonth: (m: MonthKey | null) => void;
  /** Ouvre la liste filtrée sur un magasin ('all', 'none' ou id). */
  onOpenStore: (filter: string) => void;
  onShop: (filter: string) => void;
  onManageStores: () => void;
  onImport: () => void;
  onSettings: () => void;
  onAdd: () => void;
  onReference: () => void;
  onRecap: () => void;
}

function StoreTile({
  name,
  color,
  photo,
  products,
  onOpen,
  onShop,
}: {
  name: string;
  color: string;
  photo?: string | null;
  products: Product[];
  onOpen: () => void;
  onShop: () => void;
}) {
  const t = sumTotals(products);
  const todo = t.count - t.checkedCount;
  const pct = t.estimated ? Math.min(100, (t.spent / t.estimated) * 100) : 0;
  const initialsEl = (
    <span className="flex h-full w-full items-center justify-center text-4xl font-black tracking-tight" style={{ color: readableText(color) }}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
  return (
    <li className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200/80 dark:bg-stone-900 dark:ring-stone-800">
      <button type="button" onClick={onOpen} className="block text-left" aria-label={`Ouvrir la liste ${name}`}>
        <span className="relative block aspect-[4/3] w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}, ${tint(color, 0.55)})` }}>
          <FitImage src={photo} className="h-full w-full" fallback={initialsEl} />
          {todo > 0 && (
            <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-bold text-stone-900 shadow">
              {todo} à acheter
            </span>
          )}
          {t.count > 0 && todo === 0 && (
            <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white shadow">Terminé ✓</span>
          )}
        </span>
        <span className="block px-3 pt-2">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="truncate text-base font-bold">{name}</span>
          </span>
          <span className="mt-0.5 block text-xs text-stone-500 tabular dark:text-stone-400">
            {t.count ? (
              <>
                <b className="font-semibold text-stone-800 dark:text-stone-100">{formatAmount(t.spent)}</b> / {formatAmount(t.estimated)} DH
              </>
            ) : (
              'Aucun article'
            )}
          </span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
          </span>
        </span>
      </button>
      <div className="mt-auto flex gap-1 p-2">
        <button type="button" onClick={onOpen} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-stone-100 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">
          <LayoutList className="h-3.5 w-3.5" /> Liste
        </button>
        <button
          type="button"
          onClick={onShop}
          disabled={!todo}
          className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-saffron-400 text-xs font-bold text-stone-900 disabled:opacity-40"
          aria-label={`Faire les courses chez ${name}`}
        >
          <ShoppingCart className="h-3.5 w-3.5" /> En rayon
        </button>
      </div>
    </li>
  );
}

/** Page d'accueil : budget du mois et magasins en galerie. */
export function Home({ viewMonth, onViewMonth, onOpenStore, onShop, onManageStores, onImport, onSettings, onAdd, onReference, onRecap }: HomeProps) {
  const { data } = useFamilyData();
  const nextMonth = addMonths(data.currentMonth, 1);
  const listMonth = viewMonth === nextMonth ? nextMonth : data.currentMonth;
  const products = useMemo(() => data.products.filter((p) => inMonth(p, data.currentMonth, listMonth)), [data.products, data.currentMonth, listMonth]);
  const known = new Set(data.stores.map((s) => s.id));
  const orphans = products.filter((p) => !p.storeId || !known.has(p.storeId));
  const byStore = (s: Store) => products.filter((p) => p.storeId === s.id);

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={onAdd} className="flex flex-col items-center gap-1 rounded-2xl bg-brand-700 px-2 py-3 text-xs font-semibold text-white shadow-sm active:scale-[0.98] dark:bg-brand-600">
          <Plus className="h-5 w-5" /> Nouvel article
        </button>
        <button type="button" onClick={onImport} className="flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 text-xs font-semibold text-emerald-800 ring-1 ring-stone-200 active:scale-[0.98] dark:bg-stone-900 dark:text-emerald-300 dark:ring-stone-800">
          <FileSpreadsheet className="h-5 w-5" /> Importer Excel
        </button>
        <button type="button" onClick={onSettings} className="flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 active:scale-[0.98] dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-800">
          <Settings className="h-5 w-5" /> Réglages
        </button>
      </div>

      <section aria-label="Magasins">
        <div className="mb-2 flex items-end justify-between px-1">
          <h2 className="text-lg font-bold tracking-tight">Magasins · {monthLabel(listMonth)}</h2>
          <button type="button" onClick={() => onOpenStore('all')} className="text-sm font-semibold text-brand-700 dark:text-brand-300">
            Tous les articles ({products.filter((p) => !p.skipped).length})
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.stores.map((s) => (
            <StoreTile key={s.id} name={s.name} color={s.color} photo={s.photo} products={byStore(s)} onOpen={() => onOpenStore(s.id)} onShop={() => onShop(s.id)} />
          ))}
          {orphans.length > 0 && (
            <StoreTile name={NO_STORE_NAME} color={NO_STORE_COLOR} products={orphans} onOpen={() => onOpenStore('none')} onShop={() => onShop('none')} />
          )}
          <li>
            <button
              type="button"
              onClick={onManageStores}
              className="flex h-full min-h-[12rem] w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-stone-300 text-sm font-semibold text-stone-500 hover:bg-white dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-900"
            >
              <StoreIcon className="h-7 w-7" /> Ajouter ou modifier
              <span className="text-xs font-medium">un magasin, sa photo</span>
            </button>
          </li>
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onReference} className="rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-stone-200/80 active:scale-[0.99] dark:bg-stone-900 dark:ring-stone-800">
          <BookMarked className="h-6 w-6 text-brand-700 dark:text-brand-300" />
          <span className="mt-2 block font-bold">Mois référence</span>
          <span className="block text-xs text-stone-500 tabular dark:text-stone-400">
            {(data.reference ?? []).length} articles · {formatAmount(refTotal(data.reference ?? []))} DH
          </span>
        </button>
        <button type="button" onClick={onRecap} className="rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-stone-200/80 active:scale-[0.99] dark:bg-stone-900 dark:ring-stone-800">
          <BarChart3 className="h-6 w-6 text-saffron-500" />
          <span className="mt-2 block font-bold">Récap du mois</span>
          <span className="block text-xs text-stone-500 dark:text-stone-400">Comparé à la référence et aux autres mois</span>
        </button>
      </div>

      <BudgetSummary viewMonth={viewMonth} onViewMonth={onViewMonth} />
    </div>
  );
}
