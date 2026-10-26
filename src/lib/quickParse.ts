import type { Unit } from '../types';

export interface QuickParsed {
  name: string;
  quantity: number | null;
  unit: Unit | null;
  price: number | null;
}

const UNIT_ALIASES: Record<string, Unit> = {
  pc: 'pcs', pcs: 'pcs', p: 'pcs', piece: 'pcs', pieces: 'pcs', pièce: 'pcs', pièces: 'pcs',
  kg: 'kg', kilo: 'kg', kilos: 'kg',
  l: 'L', litre: 'L', litres: 'L',
  pack: 'pack', packs: 'pack',
};

const num = (s: string) => parseFloat(s.replace(',', '.'));

/**
 * Ajout rapide en une ligne :
 *   "Tomates 2kg 8,5"     → Tomates · 2 kg · 8,50 DH
 *   "Lait x6 7.5dh"       → Lait · 6 pcs · 7,50 DH
 *   "Huile 5 L @ 95"      → Huile · 5 L · 95,00 DH
 *   "Pain"                → Pain
 */
export function quickParse(input: string): QuickParsed {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const out: QuickParsed = { name: '', quantity: null, unit: null, price: null };
  const rest: string[] = [];
  // Jetons ayant fixé la quantité : si une autre quantité suit (« Eau 1.5L 6 pack »),
  // la première redevient une partie du nom (→ « Eau 1.5L », 6 pack).
  let qtyTokens: string[] = [];
  const setQty = (q: number, unit: Unit | null, raw: string[]) => {
    if (qtyTokens.length) rest.push(...qtyTokens);
    out.quantity = q;
    out.unit = unit;
    qtyTokens = raw;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const low = t.toLowerCase();
    let m: RegExpExecArray | null;

    // Prix explicite : "8.5dh", "@8,5", "8,5DH"
    if ((m = /^@?(\d+(?:[.,]\d+)?)(?:dh|mad)$/i.exec(t)) || (m = /^@(\d+(?:[.,]\d+)?)$/.exec(t))) {
      out.price = num(m[1]);
      continue;
    }
    if (low === '@' && i + 1 < tokens.length && /^\d+(?:[.,]\d+)?$/.test(tokens[i + 1])) {
      out.price = num(tokens[++i]);
      continue;
    }
    // Quantité + unité collées : "2kg", "1.5L", "3pcs"
    if ((m = /^(\d+(?:[.,]\d+)?)([a-zà-ü]+)$/i.exec(t)) && UNIT_ALIASES[m[2].toLowerCase()]) {
      setQty(num(m[1]), UNIT_ALIASES[m[2].toLowerCase()], [t]);
      continue;
    }
    // "x6" / "6x"
    if ((m = /^x(\d+(?:[.,]\d+)?)$/i.exec(t)) || (m = /^(\d+(?:[.,]\d+)?)x$/i.exec(t))) {
      setQty(num(m[1]), out.unit, [t]);
      continue;
    }
    // Nombre suivi d'une unité séparée : "2 kg"
    if (/^\d+(?:[.,]\d+)?$/.test(t) && i + 1 < tokens.length && UNIT_ALIASES[tokens[i + 1].toLowerCase()]) {
      const u = tokens[++i];
      setQty(num(t), UNIT_ALIASES[u.toLowerCase()], [t, u]);
      continue;
    }
    // Unité seule après une quantité déjà vue
    if (out.quantity !== null && out.unit === null && UNIT_ALIASES[low] && rest.length) {
      out.unit = UNIT_ALIASES[low];
      continue;
    }
    rest.push(t);
  }

  // Un nombre nu en fin de saisie = prix (si le nom reste non vide).
  if (out.price === null && rest.length > 1 && /^\d+(?:[.,]\d+)?$/.test(rest[rest.length - 1])) {
    out.price = num(rest.pop() as string);
  }
  out.name = rest.join(' ');
  if (out.quantity !== null && !(out.quantity > 0)) out.quantity = null;
  if (out.price !== null && !(out.price >= 0)) out.price = null;
  return out;
}
