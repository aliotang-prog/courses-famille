import type { FamilyData, Product } from '../types';
import { productMonth } from '../shared/month';
import { boughtQty, lineTotal, remainingQty, sumTotals } from '../shared/totals';
import { monthLabel } from './format';

export type Cell = string | number | boolean;
export interface SheetTab {
  title: string;
  rows: Cell[][];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const yes = (b: boolean) => (b ? 'oui' : 'non');
const dateFr = (ms: number) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

const status = (p: Product) => (p.skipped ? 'Ignoré' : p.checked ? 'Acheté' : boughtQty(p) > 0 ? 'Partiel' : 'À acheter');

/**
 * Les onglets de la sauvegarde Google Sheets : une image lisible de toutes les données.
 * Les photos ne sont pas copiées (trop lourdes pour une cellule) : la colonne Photo indique seulement oui / non.
 */
export function buildBackup(data: FamilyData, at = Date.now()): SheetTab[] {
  const storeName = new Map(data.stores.map((s) => [s.id, s.name]));
  const sName = (id: string | null) => (id ? (storeName.get(id) ?? '') : '');
  const refIds = new Set((data.reference ?? []).map((r) => r.id));
  const byName = (a: { name: string; storeId: string | null }, b: { name: string; storeId: string | null }) =>
    sName(a.storeId).localeCompare(sName(b.storeId), 'fr') || a.name.localeCompare(b.name, 'fr');

  const articles: Cell[][] = [
    ['Article', 'Magasin', 'Prix (DH)', 'Quantité', 'Unité', 'Total (DH)', 'Statut', 'Déjà acheté', 'Reste', 'Mois', 'Mois référence', 'Récurrent', 'Notes / marque', 'Photo', 'ID'],
    ...[...data.products].sort(byName).map((p) => [
      p.name,
      sName(p.storeId),
      p.price,
      p.quantity,
      p.unit,
      r2(lineTotal(p)),
      status(p),
      boughtQty(p),
      remainingQty(p),
      monthLabel(productMonth(p, data.currentMonth)),
      yes(Boolean(p.refId && refIds.has(p.refId))),
      yes(p.recurring),
      p.notes,
      yes(Boolean(p.photo)),
      p.id,
    ]),
  ];

  const reference: Cell[][] = [
    ['Article', 'Magasin', 'Prix (DH)', 'Quantité', 'Unité', 'Total (DH)', 'Notes / marque', 'Photo', 'ID'],
    ...[...(data.reference ?? [])].sort(byName).map((r) => [r.name, sName(r.storeId), r.price, r.quantity, r.unit, r2(r.price * r.quantity), r.notes, yes(Boolean(r.photo)), r.id]),
  ];

  const stores: Cell[][] = [['Magasin', 'Couleur', 'Logo / photo', 'Articles', 'Estimé (DH)', 'Dépensé (DH)', 'Reste (DH)', 'ID']];
  for (const s of data.stores) {
    const t = sumTotals(data.products.filter((p) => p.storeId === s.id && productMonth(p, data.currentMonth) === data.currentMonth));
    stores.push([s.name, s.color, yes(Boolean(s.photo)), t.count, r2(t.estimated), r2(t.spent), r2(t.estimated - t.spent), s.id]);
  }

  const history: Cell[][] = [['Mois', 'Budget (DH)', 'Référence (DH)', 'Prévu (DH)', 'Dépensé (DH)', 'Articles', 'Achetés', 'Clôturé le']];
  for (const h of [...data.history].sort((a, b) => b.month.localeCompare(a.month))) {
    history.push([monthLabel(h.month), h.budget ?? '', h.refEstimated ?? '', r2(h.estimated), r2(h.spent), h.itemCount, h.checkedCount, dateFr(h.archivedAt)]);
  }

  const cur = sumTotals(data.products.filter((p) => productMonth(p, data.currentMonth) === data.currentMonth));
  const refTotal = (data.reference ?? []).reduce((s, r) => s + r.price * r.quantity, 0);
  const infos: Cell[][] = [
    ['Courses Famille — sauvegarde', ''],
    ['Famille', data.code],
    ['Sauvegardé le', dateFr(at)],
    ['Mois en cours', monthLabel(data.currentMonth)],
    ['Budget mensuel (DH)', data.settings.monthlyBudget ?? ''],
    ['Mois référence (DH)', r2(refTotal)],
    ['Prévu ce mois (DH)', r2(cur.estimated)],
    ['Dépensé ce mois (DH)', r2(cur.spent)],
    ['Articles', data.products.length],
    ['Articles du mois référence', (data.reference ?? []).length],
    ['Magasins', data.stores.length],
    ['', ''],
    ['Les photos restent dans l’application (colonne « Photo » = oui / non).', ''],
  ];

  return [
    { title: 'Infos', rows: infos },
    { title: 'Articles', rows: articles },
    { title: 'Référence', rows: reference },
    { title: 'Magasins', rows: stores },
    { title: 'Historique', rows: history },
  ];
}
