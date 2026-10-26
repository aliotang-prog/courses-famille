import type { MonthKey, Unit } from '../types';

const money = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });

/** 1234.5 → "1 234,50 DH" */
export function formatDH(n: number): string {
  return `${money.format(n || 0)} DH`;
}

/** Montant compact pour les puces : 1234.5 → "1 234,50" */
export function formatAmount(n: number): string {
  return money.format(n || 0);
}

export function formatQty(q: number, unit: Unit): string {
  return `${qty.format(q)} ${unit}`;
}

export function formatNumber(n: number): string {
  return qty.format(n);
}

/** "2026-10" → "Octobre 2026" */
export function monthLabel(m: MonthKey, short = false): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1, 1);
  const s = d.toLocaleDateString('fr-FR', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Saisie utilisateur "8,50" ou "8.5" → 8.5 */
export function parseDecimal(s: string): number {
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
