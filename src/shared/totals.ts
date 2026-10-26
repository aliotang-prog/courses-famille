import type { Product, Store, StoreTotals } from '../types';

export const NO_STORE_COLOR = '#78716c';
export const NO_STORE_NAME = 'Sans magasin';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lineTotal(p: Pick<Product, 'price' | 'quantity'>): number {
  return round2(p.price * p.quantity);
}

/** Quantité déjà achetée (toute la quantité si l'article est coché). */
export function boughtQty(p: Pick<Product, 'checked' | 'quantity' | 'boughtQty'>): number {
  if (p.checked) return p.quantity;
  return Math.min(p.quantity, Math.max(0, p.boughtQty ?? 0));
}

/** Quantité restant à acheter. */
export function remainingQty(p: Pick<Product, 'checked' | 'quantity' | 'boughtQty'>): number {
  return Math.round((p.quantity - boughtQty(p)) * 1000) / 1000;
}

/** Montant déjà dépensé pour cet article (achat partiel compris). */
export function spentTotal(p: Pick<Product, 'checked' | 'quantity' | 'boughtQty' | 'price'>): number {
  return round2(p.price * boughtQty(p));
}

/** Totaux d'une liste. Les articles ignorés ce mois-ci ne comptent pas. */
export function sumTotals(products: Product[]): { estimated: number; spent: number; count: number; checkedCount: number; skippedCount: number } {
  let estimated = 0;
  let spent = 0;
  let checkedCount = 0;
  let count = 0;
  let skippedCount = 0;
  for (const p of products) {
    if (p.skipped) {
      skippedCount++;
      continue;
    }
    count++;
    estimated += lineTotal(p);
    spent += spentTotal(p);
    if (p.checked) checkedCount++;
  }
  return { estimated: round2(estimated), spent: round2(spent), count, checkedCount, skippedCount };
}

/** Totaux par enseigne, dans l'ordre des magasins (+ "Sans magasin" s'il y a lieu). */
export function totalsByStore(products: Product[], stores: Store[]): StoreTotals[] {
  const known = new Set(stores.map((s) => s.id));
  const rows: StoreTotals[] = stores.map((s) => ({
    storeId: s.id,
    name: s.name,
    color: s.color,
    ...sumTotals(products.filter((p) => p.storeId === s.id)),
  }));
  const orphans = products.filter((p) => p.storeId === null || !known.has(p.storeId));
  if (orphans.length) {
    rows.push({ storeId: null, name: NO_STORE_NAME, color: NO_STORE_COLOR, ...sumTotals(orphans) });
  }
  return rows;
}
