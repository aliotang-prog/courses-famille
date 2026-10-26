// Transforme les lignes d'un tableau Excel/CSV en articles.
// Colonnes reconnues (ordre libre, en-têtes en français ou en anglais) :
//   Nom · Prix · Quantité · Unité · Magasin · Notes/Marque · Acheté
import type { Unit } from '../types';
import type { Cell, Grid } from './spreadsheet';

export type Field = 'name' | 'price' | 'quantity' | 'unit' | 'store' | 'notes' | 'checked';

export const FIELD_LABELS: Record<Field, string> = {
  name: 'Nom',
  price: 'Prix (DH)',
  quantity: 'Quantité',
  unit: 'Unité',
  store: 'Magasin',
  notes: 'Notes / marque',
  checked: 'Acheté',
};

const SYNONYMS: Record<Field, string[]> = {
  name: ['nom', 'article', 'articles', 'produit', 'produits', 'designation', 'libelle', 'item', 'name', 'product'],
  price: ['prix', 'prixunitaire', 'prixdh', 'prixunitairedh', 'pu', 'puttc', 'price', 'tarif', 'montant', 'cout', 'prixmad'],
  quantity: ['quantite', 'qte', 'qty', 'quantity', 'nombre', 'nb', 'qt'],
  unit: ['unite', 'unit', 'u', 'mesure'],
  store: ['magasin', 'magasins', 'enseigne', 'store', 'boutique', 'lieu', 'supermarche', 'shop'],
  notes: ['notes', 'note', 'marque', 'marques', 'remarque', 'remarques', 'commentaire', 'commentaires', 'description', 'brand'],
  checked: ['achete', 'achat', 'fait', 'statut', 'etat', 'coche', 'done', 'bought'],
};

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z]/g, '');

export interface ImportedRow {
  line: number;
  name: string;
  price: number;
  quantity: number;
  unit: Unit;
  storeName: string;
  notes: string;
  checked: boolean;
}

export interface ColumnInfo {
  index: number;
  /** Lettre Excel (A, B, C…). */
  letter: string;
  /** Texte de l'en-tête, s'il y en a un. */
  header: string;
  /** Quelques valeurs d'exemple. */
  samples: string[];
}

export type ColumnMap = Partial<Record<Field, number>>;

export interface MappedImport {
  rows: ImportedRow[];
  columns: ColumnMap;
  headerFound: boolean;
  /** Index (dans les lignes non vides) de la ligne d'en-tête, -1 si aucune. */
  headerIndex: number;
  columnInfo: ColumnInfo[];
  /** Lignes ignorées (sans nom). */
  skipped: number;
  /** Lignes de titre de groupe (ex : « CASABARATA ») utilisées comme magasin. */
  sections: string[];
}

const str = (c: Cell | undefined) => (c === null || c === undefined ? '' : String(c).trim());

/** "8,50 DH" → 8.5 ; 12 → 12 ; "" → null */
export function parseAmount(c: Cell | undefined): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  const s = str(c)
    .replace(/\s|\u00a0|\u202f/g, '')
    .replace(/(dh|mad|dhs|dirhams?)$/i, '')
    .replace(',', '.');
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const UNIT_MAP: Record<string, { unit: Unit; factor: number }> = {
  pcs: { unit: 'pcs', factor: 1 }, pc: { unit: 'pcs', factor: 1 }, piece: { unit: 'pcs', factor: 1 }, pieces: { unit: 'pcs', factor: 1 },
  p: { unit: 'pcs', factor: 1 }, u: { unit: 'pcs', factor: 1 }, unite: { unit: 'pcs', factor: 1 }, unites: { unit: 'pcs', factor: 1 },
  kg: { unit: 'kg', factor: 1 }, kilo: { unit: 'kg', factor: 1 }, kilos: { unit: 'kg', factor: 1 }, kilogramme: { unit: 'kg', factor: 1 },
  g: { unit: 'kg', factor: 0.001 }, gr: { unit: 'kg', factor: 0.001 }, gramme: { unit: 'kg', factor: 0.001 }, grammes: { unit: 'kg', factor: 0.001 },
  l: { unit: 'L', factor: 1 }, litre: { unit: 'L', factor: 1 }, litres: { unit: 'L', factor: 1 },
  cl: { unit: 'L', factor: 0.01 }, ml: { unit: 'L', factor: 0.001 },
  pack: { unit: 'pack', factor: 1 }, packs: { unit: 'pack', factor: 1 }, paquet: { unit: 'pack', factor: 1 }, paquets: { unit: 'pack', factor: 1 },
  boite: { unit: 'pack', factor: 1 }, boites: { unit: 'pack', factor: 1 }, lot: { unit: 'pack', factor: 1 },
};

export function parseUnit(c: Cell | undefined): { unit: Unit; factor: number } | null {
  return UNIT_MAP[fold(str(c))] ?? null;
}

const TRUTHY = new Set(['oui', 'yes', 'x', '1', 'true', 'vrai', 'achete', 'fait', 'ok', 'done']);

export function columnLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const isNumeric = (c: Cell | undefined) => parseAmount(c) !== null || /^\s*\d+(?:[.,]\d+)?\s*[a-z]{1,6}\s*$/i.test(str(c));

/** Détection automatique de l'en-tête et des colonnes. */
function detect(rows: Grid): { headerIndex: number; columns: ColumnMap } {
  // 1) Une ligne d'en-tête connue parmi les 15 premières.
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const found: ColumnMap = {};
    rows[i].forEach((c, ci) => {
      const key = fold(str(c));
      if (!key) return;
      for (const f of Object.keys(SYNONYMS) as Field[]) {
        if (found[f] === undefined && (SYNONYMS[f].includes(key) || SYNONYMS[f].some((syn) => syn.length > 3 && key.startsWith(syn)))) {
          found[f] = ci;
          break;
        }
      }
    });
    if (Object.keys(found).length >= 2 && found.name !== undefined) return { headerIndex: i, columns: found };
  }

  // 2) Sans en-tête : on devine d'après le contenu.
  const width = Math.max(0, ...rows.map((r) => r.length));
  const stats = Array.from({ length: width }, (_, ci) => {
    let text = 0;
    let num = 0;
    let unit = 0;
    let sum = 0;
    const distinct = new Set<string>();
    for (const r of rows) {
      const c = r[ci];
      const v = str(c);
      if (!v) continue;
      if (parseUnit(c)) unit++;
      else if (isNumeric(c)) {
        num++;
        sum += parseAmount(c) ?? 0;
      } else {
        text++;
        distinct.add(fold(v));
      }
    }
    return { ci, text, num, unit, avg: num ? sum / num : 0, distinct: distinct.size };
  });
  const columns: ColumnMap = {};
  const byText = [...stats].filter((s) => s.text > 0).sort((a, b) => b.text - a.text || b.distinct - a.distinct || a.ci - b.ci);
  if (byText[0]) columns.name = byText[0].ci;
  const unitCol = stats.filter((s) => s.unit > s.text && s.unit > 0).sort((a, b) => b.unit - a.unit)[0];
  if (unitCol) columns.unit = unitCol.ci;
  const nums = stats.filter((s) => s.num > 0 && s.num >= s.text && s.ci !== columns.unit).sort((a, b) => b.num - a.num).slice(0, 2);
  if (nums.length === 2) {
    // La colonne aux plus grandes valeurs est en général le prix.
    const [hi, lo] = nums[0].avg >= nums[1].avg ? [nums[0], nums[1]] : [nums[1], nums[0]];
    columns.price = hi.ci;
    columns.quantity = lo.ci;
  } else if (nums.length === 1) columns.price = nums[0].ci;
  // Autres colonnes texte : peu de valeurs différentes → magasin, sinon notes.
  for (const s of byText.slice(1)) {
    if (columns.store === undefined && s.distinct <= Math.max(3, s.text / 3)) columns.store = s.ci;
    else if (columns.notes === undefined) columns.notes = s.ci;
  }
  return { headerIndex: -1, columns };
}

/**
 * Convertit le tableau en articles.
 * `override` : correspondance de colonnes choisie à la main dans l'aperçu.
 */
export function mapGrid(grid: Grid, override?: { columns: ColumnMap; headerIndex: number }): MappedImport {
  const rows = grid.filter((r) => r.some((c) => str(c) !== ''));
  if (!rows.length) return { rows: [], columns: {}, headerFound: false, headerIndex: -1, columnInfo: [], skipped: 0, sections: [] };

  const auto = detect(rows);
  const headerIndex = override ? override.headerIndex : auto.headerIndex;
  const columns = override ? override.columns : auto.columns;
  const headerFound = headerIndex >= 0;

  const width = Math.max(0, ...rows.map((r) => r.length));
  const body = rows.slice(headerIndex + 1);
  const columnInfo: ColumnInfo[] = Array.from({ length: width }, (_, i) => ({
    index: i,
    letter: columnLetter(i),
    header: headerFound ? str(rows[headerIndex][i]) : '',
    samples: body.map((r) => str(r[i])).filter(Boolean).slice(0, 3),
  })).filter((c) => c.header || c.samples.length);

  const out: ImportedRow[] = [];
  const sections: string[] = [];
  let skipped = 0;
  let section = '';
  body.forEach((r, idx) => {
    const get = (f: Field) => (columns[f] !== undefined ? r[columns[f]!] : undefined);
    const filled = r.map((c, i) => ({ v: str(c), i })).filter((x) => x.v);
    const name = str(get('name')).replace(/\s+/g, ' ').slice(0, 80);

    // Ligne de titre de groupe (ex : « CASABARATA », « Marjane : ») → magasin des lignes suivantes.
    // Repérée si le prix et la quantité sont vides et que le texte ressemble à un titre.
    const titleCell = name ? { v: name, i: columns.name! } : filled.length === 1 && !isNumeric(filled[0].v) ? filled[0] : null;
    if (titleCell && !str(get('price')) && !str(get('quantity')) && !str(get('store')) && body[idx + 1]) {
      const t = titleCell.v;
      const nextName = columns.name !== undefined ? str(body[idx + 1][columns.name]) : '';
      const looksLikeTitle = titleCell.i !== columns.name || /:$/.test(t) || (/[A-Z]{3}/.test(t) && t === t.toUpperCase());
      if (nextName && t.length <= 40 && looksLikeTitle) {
        section = t.replace(/:$/, '').trim();
        sections.push(section);
        return;
      }
    }
    if (!name || isNumeric(name)) {
      skipped++;
      return;
    }
    // Ligne de total : ignorée.
    if (/^(total|sous-?total|somme)\b/i.test(fold(name)) || /^total/i.test(name)) {
      skipped++;
      return;
    }

    // Quantité : "2", "2kg", "500 g", "1,5 L"
    let quantity = 1;
    let unit: Unit = 'pcs';
    let factor = 1;
    const rawQty = get('quantity');
    if (typeof rawQty === 'number') quantity = rawQty;
    else {
      const m = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zéè]*)\s*$/.exec(str(rawQty));
      if (m) {
        quantity = parseFloat(m[1].replace(',', '.'));
        const u = m[2] ? parseUnit(m[2]) : null;
        if (u) {
          unit = u.unit;
          factor = u.factor;
        }
      }
    }
    const u = parseUnit(get('unit'));
    if (u) {
      unit = u.unit;
      factor = u.factor;
    }
    quantity = Math.round(quantity * factor * 1000) / 1000;
    if (!(quantity > 0)) quantity = 1;
    const price = Math.max(0, Math.round((parseAmount(get('price')) ?? 0) * 100) / 100);
    const rawChecked = get('checked');
    out.push({
      line: idx + headerIndex + 2,
      name,
      price,
      quantity,
      unit,
      storeName: (str(get('store')) || section).slice(0, 40),
      notes: str(get('notes')).slice(0, 300),
      checked: rawChecked === true || TRUTHY.has(fold(str(rawChecked))),
    });
  });
  return { rows: out, columns, headerFound, headerIndex, columnInfo, skipped, sections };
}

/** Modèle CSV (séparateur « ; », UTF-8 avec BOM : s'ouvre directement dans Excel). */
export function templateCsv(): string {
  const lines = [
    ['Nom', 'Prix (DH)', 'Quantité', 'Unité', 'Magasin', 'Notes / marque'],
    ['Lait', '7,50', '6', 'pcs', 'BIM', 'Centrale 1 L'],
    ['Tomates', '8,50', '2', 'kg', 'Marché', ''],
    ['Huile', '95', '1', 'pcs', 'Marjane', 'Lesieur 5 L'],
    ['Eau minérale', '36', '2', 'pack', 'Carrefour', 'Sidi Ali 6 x 1,5 L'],
  ];
  return '﻿' + lines.map((l) => l.join(';')).join('\r\n') + '\r\n';
}
