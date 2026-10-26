import type { FamilyData, Store } from '../types';

export const STORE_COLORS = [
  '#dc2626', // rouge
  '#ea580c', // orange
  '#d97706', // ambre
  '#16a34a', // vert
  '#0d9488', // sarcelle
  '#0284c7', // bleu ciel
  '#2563eb', // bleu
  '#7c3aed', // violet
  '#db2777', // rose
  '#475569', // ardoise
] as const;

export const FAMILY_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

export function normalizeFamilyCode(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
}

export function defaultStores(now: number): Store[] {
  const base: Array<[string, string, string]> = [
    ['store-bim', 'BIM', '#dc2626'],
    ['store-marjane', 'Marjane', '#2563eb'],
    ['store-carrefour', 'Carrefour', '#0284c7'],
    ['store-marche', 'Marché', '#16a34a'],
    ['store-epicerie', 'Épicerie', '#d97706'],
  ];
  return base.map(([id, name, color], i) => ({ id, name, color, createdAt: now + i }));
}

export function createFamily(code: string, month: string, now: number): FamilyData {
  return {
    code,
    version: 1,
    currentMonth: month,
    stores: defaultStores(now),
    products: [],
    history: [],
    reference: [],
    settings: { monthlyBudget: null },
    lastActionIds: [],
    updatedAt: now,
  };
}
