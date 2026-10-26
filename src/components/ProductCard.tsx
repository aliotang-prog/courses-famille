import { memo } from 'react';
import { Check, EyeOff, Pencil, Repeat, Trash2 } from 'lucide-react';
import type { Product, Store } from '../types';
import { formatAmount, formatDH } from '../lib/format';
import { boughtQty, lineTotal } from '../shared/totals';
import { formatNumber } from '../lib/format';
import { ProductThumb } from './ui/ProductThumb';
import { QuantityStepper } from './ui/QuantityStepper';
import { StoreBadge } from './ui/StoreBadge';

interface ProductCardProps {
  product: Product;
  store: Store | undefined;
  showStore: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleChecked: (p: Product) => void;
  onToggleSelected: (id: string) => void;
  onQuantity: (id: string, delta: number) => void;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  onUnskip: (p: Product) => void;
}

export const ProductCard = memo(function ProductCard({
  product: p,
  store,
  showStore,
  selectMode,
  selected,
  onToggleChecked,
  onToggleSelected,
  onQuantity,
  onEdit,
  onDelete,
  onUnskip,
}: ProductCardProps) {
  const total = lineTotal(p);
  const bought = boughtQty(p);
  const partial = !p.checked && bought > 0;

  return (
    <li
      className={`flex items-center gap-3 rounded-2xl bg-white p-2.5 pr-3 transition dark:bg-stone-900 ${
        selected ? 'ring-2 ring-brand-500' : 'ring-1 ring-stone-200/80 dark:ring-stone-800'
      } ${(p.checked || p.skipped) && !selectMode ? 'opacity-60' : ''}`}
    >
      {selectMode ? (
        <button
          type="button"
          onClick={() => onToggleSelected(p.id)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 transition ${
            selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 dark:border-stone-600'
          }`}
          aria-pressed={selected}
          aria-label={`${selected ? 'Désélectionner' : 'Sélectionner'} ${p.name}`}
        >
          {selected && <Check className="h-5 w-5" strokeWidth={3} />}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onToggleChecked(p)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 transition active:scale-90 ${
            p.checked ? 'animate-pop border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 hover:border-brand-500 dark:border-stone-600'
          }`}
          aria-pressed={p.checked}
          aria-label={p.checked ? `Remettre ${p.name} en attente` : `Marquer ${p.name} comme acheté`}
        >
          {p.checked && <Check className="h-5 w-5" strokeWidth={3} />}
        </button>
      )}

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => (selectMode ? onToggleSelected(p.id) : onEdit(p))}
          className="flex w-full min-w-0 items-center gap-3 text-left"
          aria-label={selectMode ? undefined : `Ouvrir ${p.name}`}
        >
          <ProductThumb photo={p.photo} name={p.name} size={40} />
          <span className="min-w-0 flex-1">
            <span className={`flex items-center gap-1 font-semibold leading-snug ${p.checked ? 'line-through decoration-2' : ''}`}>
              <span className="truncate">{p.name}</span>
              {p.recurring && <Repeat className="h-3 w-3 shrink-0 text-stone-400" aria-label="récurrent" />}
            </span>
            {p.notes && <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{p.notes}</span>}
            {partial && (
              <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-px text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                Acheté {formatNumber(bought)}/{formatNumber(p.quantity)} {p.unit} · reste {formatNumber(Math.round((p.quantity - bought) * 1000) / 1000)}
              </span>
            )}
            {p.skipped && (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-px text-[11px] font-semibold text-stone-600 dark:bg-stone-700 dark:text-stone-300">
                <EyeOff className="h-3 w-3" /> Ignoré ce mois
              </span>
            )}
          </span>
          <span className="shrink-0 self-start text-[15px] font-bold tabular">{formatDH(total)}</span>
        </button>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-stone-500 tabular dark:text-stone-400">
            {showStore && store && <StoreBadge name={store.name} color={store.color} size="xs" className="shrink-0" />}
            <span className="truncate">
              {formatAmount(p.price)} DH/{p.unit}
            </span>
          </span>
          {!selectMode && p.skipped && (
            <button
              type="button"
              onClick={() => onUnskip(p)}
              className="h-8 shrink-0 rounded-full bg-stone-100 px-3 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200"
            >
              Rétablir
            </button>
          )}
          {!selectMode && !p.skipped && (
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => onEdit(p)}
                className="grid h-8 w-8 place-items-center rounded-full text-stone-500 transition active:scale-90 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                aria-label={`Modifier ${p.name}`}
                title="Modifier"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(p)}
                className="grid h-8 w-8 place-items-center rounded-full text-red-500 transition active:scale-90 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                aria-label={`Supprimer ${p.name}`}
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <QuantityStepper quantity={p.quantity} unit={p.unit} onDelta={(d) => onQuantity(p.id, d)} label={p.name} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
});
