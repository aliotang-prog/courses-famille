import { useMemo } from 'react';
import { ShoppingBasket } from 'lucide-react';
import type { Product, Store } from '../types';
import { NO_STORE_COLOR, NO_STORE_NAME, sumTotals } from '../shared/totals';
import { formatAmount } from '../lib/format';
import { ProductCard } from './ProductCard';
import { StoreBadge } from './ui/StoreBadge';

interface ProductListProps {
  products: Product[];
  stores: Store[];
  groupByStore: boolean;
  selectMode: boolean;
  selected: Set<string>;
  emptyHint: string;
  onToggleChecked: (p: Product) => void;
  onToggleSelected: (id: string) => void;
  onQuantity: (id: string, delta: number) => void;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  onUnskip: (p: Product) => void;
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** En attente d'abord (ordre alphabétique), puis achetés. */
export function sortProducts(list: Product[]): Product[] {
  const rank = (p: Product) => (p.skipped ? 2 : p.checked ? 1 : 0);
  return [...list].sort((a, b) => rank(a) - rank(b) || collator.compare(a.name, b.name));
}

export function ProductList(props: ProductListProps) {
  const { products, stores, groupByStore, emptyHint } = props;
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const groups = useMemo(() => {
    if (!groupByStore) return [{ key: 'all', store: null as Store | null, items: sortProducts(products) }];
    const out: { key: string; store: Store | null; items: Product[] }[] = [];
    for (const s of stores) {
      const items = products.filter((p) => p.storeId === s.id);
      if (items.length) out.push({ key: s.id, store: s, items: sortProducts(items) });
    }
    const orphans = products.filter((p) => !p.storeId || !storeById.has(p.storeId));
    if (orphans.length) out.push({ key: 'none', store: null, items: sortProducts(orphans) });
    return out;
  }, [products, stores, storeById, groupByStore]);

  if (!products.length) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-3xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <ShoppingBasket className="h-8 w-8" />
        </span>
        <p className="mt-4 font-semibold">Rien à afficher</p>
        <p className="mt-1 max-w-xs text-sm text-stone-500 dark:text-stone-400">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const t = sumTotals(g.items);
        return (
          <section key={g.key} aria-label={g.store?.name ?? (groupByStore ? NO_STORE_NAME : 'Articles')}>
            {groupByStore && (
              <div className="mb-2 flex items-center justify-between px-1">
                <StoreBadge name={g.store?.name ?? NO_STORE_NAME} color={g.store?.color ?? NO_STORE_COLOR} photo={g.store?.photo} size="md" />
                <span className="text-xs text-stone-500 tabular dark:text-stone-400">
                  <b className="font-semibold text-stone-700 dark:text-stone-200">{formatAmount(t.spent)}</b> / {formatAmount(t.estimated)} DH
                </span>
              </div>
            )}
            <ul className="space-y-2">
              {g.items.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  store={p.storeId ? storeById.get(p.storeId) : undefined}
                  showStore={!groupByStore}
                  selectMode={props.selectMode}
                  selected={props.selected.has(p.id)}
                  onToggleChecked={props.onToggleChecked}
                  onToggleSelected={props.onToggleSelected}
                  onQuantity={props.onQuantity}
                  onEdit={props.onEdit}
                  onDelete={props.onDelete}
                  onUnskip={props.onUnskip}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
