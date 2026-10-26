import type { MonthKey } from '../types';

export function monthKeyFromDate(d: Date): MonthKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function isMonthKey(v: unknown): v is MonthKey {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKeyFromDate(d);
}

/** Mois effectif d'un article : son mois préparé s'il est postérieur, sinon le mois en cours. */
export function productMonth(p: { month?: MonthKey | null }, current: MonthKey): MonthKey {
  return p.month && isMonthKey(p.month) && p.month > current ? p.month : current;
}

/** L'article appartient-il à la liste du mois `view` ? */
export function inMonth(p: { month?: MonthKey | null }, current: MonthKey, view: MonthKey): boolean {
  return productMonth(p, current) === view;
}
