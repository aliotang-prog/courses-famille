import { useMemo } from 'react';
import { Settings2 } from 'lucide-react';
import type { Product, Store } from '../types';
import { totalsByStore } from '../shared/totals';
import { formatAmount } from '../lib/format';
import { FitImage } from './ui/FitImage';

/** 'all' = tous, 'none' = sans magasin, sinon id du magasin. */
export type StoreFilterValue = string;

interface StoreFilterProps {
  stores: Store[];
  products: Product[];
  value: StoreFilterValue;
  onChange: (v: StoreFilterValue) => void;
  onManage?: () => void;
  large?: boolean;
  /** Affiche "dépensé / budgété" par enseigne. */
  showTotals?: boolean;
}

export function StoreFilter({ stores, products, value, onChange, onManage, large, showTotals = true }: StoreFilterProps) {
  const rows = useMemo(() => totalsByStore(products, stores), [products, stores]);
  const remainingAll = products.filter((p) => !p.checked && !p.skipped).length;
  const photoOf = (id: string | null) => (id ? (stores.find((s) => s.id === id)?.photo ?? null) : null);
  const h = large ? 'min-h-14 px-4 text-base' : 'min-h-11 px-3.5 text-sm';

  const chip = (active: boolean) =>
    `flex shrink-0 items-center gap-2 rounded-2xl border font-semibold transition active:scale-[0.97] ${h} ${
      active
        ? 'border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900'
        : 'border-stone-200 bg-white text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200'
    }`;

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar" role="tablist" aria-label="Filtrer par magasin">
      <button type="button" role="tab" aria-selected={value === 'all'} onClick={() => onChange('all')} className={chip(value === 'all')}>
        Tous
        <span className="rounded-full bg-stone-500/15 px-1.5 text-xs tabular">{remainingAll}</span>
      </button>
      {rows.map((r) => {
        const key = r.storeId ?? 'none';
        const active = value === key;
        const remaining = r.count - r.checkedCount;
        return (
          <button key={key} type="button" role="tab" aria-selected={active} onClick={() => onChange(key)} className={chip(active)}>
            {photoOf(r.storeId) ? (
              <FitImage src={photoOf(r.storeId)} className={`${large ? 'h-7 w-7' : 'h-6 w-6'} rounded-full`} style={{ boxShadow: `0 0 0 2px ${r.color}` }} />
            ) : (
              <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/70 dark:ring-stone-900/50" style={{ backgroundColor: r.color }} aria-hidden="true" />
            )}
            <span className="flex flex-col items-start leading-tight">
              <span className="flex items-center gap-1.5">
                {r.name}
                {r.count > 0 && <span className="rounded-full bg-stone-500/15 px-1.5 text-xs tabular">{remaining}</span>}
              </span>
              {showTotals && r.count > 0 && (
                <span className={`text-[10px] font-medium tabular ${active ? 'opacity-80' : 'text-stone-500 dark:text-stone-400'}`}>
                  {formatAmount(r.spent)} / {formatAmount(r.estimated)} DH
                </span>
              )}
            </span>
          </button>
        );
      })}
      {onManage && (
        <button type="button" onClick={onManage} className={`${chip(false)} border-dashed`} aria-label="Gérer les magasins">
          <Settings2 className="h-4 w-4" /> Magasins
        </button>
      )}
    </div>
  );
}

export function matchesStore(p: Product, filter: StoreFilterValue, stores: Store[]): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return p.storeId === null || !stores.some((s) => s.id === p.storeId);
  return p.storeId === filter;
}
