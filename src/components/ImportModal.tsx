import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, Upload } from 'lucide-react';
import type { Product, Store } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { STORE_COLORS } from '../shared/defaults';
import { addMonths, inMonth } from '../shared/month';
import { FIELD_LABELS, mapGrid, templateCsv } from '../lib/importRows';
import type { ColumnMap, Field, ImportedRow } from '../lib/importRows';
import type { Grid } from '../lib/spreadsheet';
import { readSpreadsheet } from '../lib/spreadsheet';
import { formatAmount, formatQty, monthLabel } from '../lib/format';
import { uid } from '../lib/id';
import { offerFile } from '../lib/download';
import { Modal } from './ui/Modal';
import { StoreBadge } from './ui/StoreBadge';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Mois proposé par défaut (null = mois en cours). */
  defaultMonth: string | null;
  onImported: (count: number) => void;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

type Status = 'new' | 'update';
interface PlannedRow extends ImportedRow {
  status: Status;
  store: Pick<Store, 'name' | 'color'> | null;
  storeKey: string | null;
  existing: Product | null;
}

export function ImportModal({ open, onClose, defaultMonth, onImported }: ImportModalProps) {
  const { data, dispatch } = useFamilyData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [grid, setGrid] = useState<Grid | null>(null);
  const [override, setOverride] = useState<{ columns: ColumnMap; headerIndex: number } | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState<string | null>(defaultMonth);
  const [mode, setMode] = useState<'update' | 'add'>('update');
  const [lastOpen, setLastOpen] = useState(false);

  // Réinitialise à chaque ouverture.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setFileName('');
      setGrid(null);
      setOverride(null);
      setShowColumns(false);
      setError(null);
      setMonth(defaultMonth);
    }
  }

  const parsed = useMemo(() => (grid ? mapGrid(grid, override ?? undefined) : null), [grid, override]);
  const nextMonth = addMonths(data.currentMonth, 1);
  const targetMonth = month ?? data.currentMonth;

  // Rapprochement avec les magasins et les articles existants.
  const plan = useMemo(() => {
    if (!parsed) return null;
    const storeByName = new Map(data.stores.map((s) => [fold(s.name), s]));
    const newStores = new Map<string, { name: string; color: string }>();
    let colorIdx = data.stores.length;
    const existingInMonth = data.products.filter((p) => inMonth(p, data.currentMonth, targetMonth));
    const rows: PlannedRow[] = parsed.rows.map((r) => {
      let store: Pick<Store, 'name' | 'color'> | null = null;
      let storeKey: string | null = null;
      if (r.storeName) {
        const k = fold(r.storeName);
        const known = storeByName.get(k);
        if (known) {
          store = known;
          storeKey = known.id;
        } else {
          if (!newStores.has(k)) newStores.set(k, { name: r.storeName, color: STORE_COLORS[colorIdx++ % STORE_COLORS.length] });
          store = newStores.get(k)!;
          storeKey = `new:${k}`;
        }
      }
      const existing =
        mode === 'update'
          ? (existingInMonth.find((p) => fold(p.name) === fold(r.name) && (storeKey?.startsWith('new:') ? false : (p.storeId ?? null) === storeKey)) ?? null)
          : null;
      return { ...r, store, storeKey, existing, status: existing ? 'update' : 'new' };
    });
    return { rows, newStores };
  }, [parsed, data.stores, data.products, data.currentMonth, targetMonth, mode]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setGrid(null);
    setOverride(null);
    setFileName(file.name);
    try {
      const g = await readSpreadsheet(file);
      const m = mapGrid(g);
      setGrid(g);
      if (!m.rows.length) {
        setShowColumns(true);
        setError('Aucun article reconnu automatiquement. Indiquez ci-dessous quelle colonne contient les noms des articles.');
      } else setShowColumns(!m.headerFound);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fichier illisible.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const doImport = () => {
    if (!plan) return;
    const now = Date.now();
    const newStoreIds = new Map<string, string>();
    for (const [k, s] of plan.newStores) {
      const id = uid();
      newStoreIds.set(`new:${k}`, id);
      dispatch({ type: 'store/add', store: { id, name: s.name, color: s.color, photo: null, createdAt: now } });
    }
    for (const r of plan.rows) {
      const storeId = r.storeKey ? (newStoreIds.get(r.storeKey) ?? r.storeKey) : null;
      if (r.existing) {
        dispatch({
          type: 'product/update',
          id: r.existing.id,
          patch: { price: r.price, quantity: r.quantity, unit: r.unit, ...(r.notes ? { notes: r.notes } : {}), ...(r.checked ? { checked: true } : {}) },
        });
      } else {
        dispatch({
          type: 'product/add',
          product: {
            id: uid(),
            name: r.name,
            price: r.price,
            quantity: r.quantity,
            unit: r.unit,
            storeId,
            checked: r.checked,
            photo: null,
            notes: r.notes,
            recurring: true,
            month,
            createdAt: now,
            updatedAt: now,
            checkedAt: null,
          },
          toReference: true,
        });
      }
    }
    onImported(plan.rows.length);
    onClose();
  };

  const downloadTemplate = () => void offerFile('modele-courses-famille.csv', templateCsv());

  const setColumn = (f: Field, value: string) => {
    if (!parsed) return;
    const columns: ColumnMap = { ...parsed.columns };
    if (value === '') delete columns[f];
    else {
      const ci = Number(value);
      // Une colonne ne sert qu'à un seul champ.
      for (const k of Object.keys(columns) as Field[]) if (columns[k] === ci) delete columns[k];
      columns[f] = ci;
    }
    setOverride({ columns, headerIndex: parsed.headerIndex });
    setError(null);
  };

  const counts = plan
    ? { add: plan.rows.filter((r) => r.status === 'new').length, upd: plan.rows.filter((r) => r.status === 'update').length, stores: plan.newStores.size }
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importer depuis Excel"
      size="lg"
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Annuler
          </button>
          <button type="button" onClick={doImport} disabled={!plan || !plan.rows.length} className="btn-primary flex-[1.6]">
            <Upload className="h-5 w-5" /> Importer {plan ? plan.rows.length : ''} article{plan && plan.rows.length > 1 ? 's' : ''}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-6 text-center transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
        >
          <FileSpreadsheet className="h-9 w-9 text-emerald-700 dark:text-emerald-400" />
          <span className="font-semibold">{busy ? 'Lecture du fichier…' : fileName ? `Fichier : ${fileName}` : 'Choisir un fichier Excel ou CSV'}</span>
          <span className="text-xs text-stone-500 dark:text-stone-400">.xlsx (Excel, Google Sheets, LibreOffice) ou .csv · première feuille</span>
        </button>
        <input ref={inputRef} id="import-file" type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

        {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

        {!parsed && (
          <div className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-600 dark:bg-stone-800/60 dark:text-stone-300">
            <p className="font-semibold text-stone-800 dark:text-stone-100">Colonnes reconnues (dans n’importe quel ordre)</p>
            <p className="mt-1">
              <b>Nom</b> · Prix (DH) · Quantité · Unité (pcs, kg, L, pack, g, cl…) · Magasin · Notes / marque · Acheté (oui/non)
            </p>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Sans ligne d’en-tête, l’ordre ci-dessus est utilisé. Les magasins inconnus sont créés automatiquement.</p>
            <button type="button" onClick={downloadTemplate} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-700 dark:text-brand-300">
              <Download className="h-4 w-4" /> Télécharger un modèle à remplir
            </button>
          </div>
        )}

        {parsed && plan && counts && (parsed.rows.length > 0 || parsed.columnInfo.length > 0) && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="label">Ajouter à la liste de</span>
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-stone-800" role="radiogroup" aria-label="Mois cible">
                  {[
                    { v: null, l: monthLabel(data.currentMonth) },
                    { v: nextMonth, l: monthLabel(nextMonth) },
                  ].map((o) => (
                    <button
                      key={o.l}
                      type="button"
                      role="radio"
                      aria-checked={month === o.v}
                      onClick={() => setMonth(o.v)}
                      className={`h-10 rounded-xl text-sm font-semibold ${month === o.v ? 'bg-white shadow-sm dark:bg-stone-600' : 'text-stone-500 dark:text-stone-400'}`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="label">Articles déjà dans la liste</span>
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-stone-800" role="radiogroup" aria-label="Articles existants">
                  {[
                    { v: 'update' as const, l: 'Mettre à jour' },
                    { v: 'add' as const, l: 'Ajouter en double' },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={mode === o.v}
                      onClick={() => setMode(o.v)}
                      className={`h-10 rounded-xl text-sm font-semibold ${mode === o.v ? 'bg-white shadow-sm dark:bg-stone-600' : 'text-stone-500 dark:text-stone-400'}`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">{counts.add} nouveau(x)</span>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">{counts.upd} mis à jour</span>
              {counts.stores > 0 && (
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                  {counts.stores} magasin(s) créé(s) : {[...plan.newStores.values()].map((s) => s.name).join(', ')}
                </span>
              )}
              {parsed.skipped > 0 && <span className="rounded-full bg-stone-200 px-2.5 py-1 text-stone-700 dark:bg-stone-700 dark:text-stone-200">{parsed.skipped} ligne(s) sans nom ignorée(s)</span>}
            </div>

            <div className="rounded-2xl ring-1 ring-stone-200 dark:ring-stone-800">
              <button type="button" onClick={() => setShowColumns((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm" aria-expanded={showColumns}>
                <span>
                  <b>Colonnes du fichier</b>
                  <span className="block text-xs text-stone-500 dark:text-stone-400">
                    {(Object.keys(parsed.columns) as Field[])
                      .sort((a, b) => parsed.columns[a]! - parsed.columns[b]!)
                      .map((f) => `${FIELD_LABELS[f]} = ${parsed.columnInfo.find((c) => c.index === parsed.columns[f])?.letter ?? '?'}`)
                      .join(' · ') || 'aucune'}
                    {!parsed.headerFound && ' · pas d’en-tête détecté'}
                  </span>
                </span>
                <ChevronDown className={`h-5 w-5 shrink-0 transition ${showColumns ? 'rotate-180' : ''}`} />
              </button>
              {showColumns && (
                <div className="grid gap-2 border-t border-stone-100 p-3 sm:grid-cols-2 dark:border-stone-800">
                  {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm">
                      <span className="w-28 shrink-0 font-semibold">{FIELD_LABELS[f]}</span>
                      <select
                        id={`col-${f}`}
                        value={parsed.columns[f] ?? ''}
                        onChange={(e) => setColumn(f, e.target.value)}
                        className="h-10 min-w-0 flex-1 rounded-xl bg-stone-100 px-2 text-sm outline-none dark:bg-stone-800"
                        aria-label={`Colonne pour ${FIELD_LABELS[f]}`}
                      >
                        <option value="">— aucune —</option>
                        {parsed.columnInfo.map((c) => (
                          <option key={c.index} value={c.index}>
                            {c.letter}
                            {c.header ? ` « ${c.header} »` : ''}
                            {c.samples.length ? ` : ${c.samples.join(', ').slice(0, 40)}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {parsed.sections.length > 0 && (
                    <p className="text-xs text-stone-500 sm:col-span-2 dark:text-stone-400">
                      Titres de groupe utilisés comme magasin : {parsed.sections.slice(0, 6).join(', ')}
                      {parsed.sections.length > 6 ? '…' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-2xl ring-1 ring-stone-200 dark:ring-stone-800">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Article</th>
                    <th className="px-3 py-2 font-semibold">Qté</th>
                    <th className="px-3 py-2 text-right font-semibold">Prix</th>
                    <th className="px-3 py-2 font-semibold">Magasin</th>
                    <th className="px-3 py-2 font-semibold">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {plan.rows.slice(0, 200).map((r) => (
                    <tr key={r.line}>
                      <td className="max-w-[12rem] px-3 py-2">
                        <span className="block truncate font-medium">{r.name}</span>
                        {r.notes && <span className="block truncate text-xs text-stone-500">{r.notes}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular">{formatQty(r.quantity, r.unit)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular">{formatAmount(r.price)}</td>
                      <td className="px-3 py-2">{r.store ? <StoreBadge name={r.store.name} color={r.store.color} size="xs" /> : <span className="text-xs text-stone-400">—</span>}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            r.status === 'new' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                          }`}
                        >
                          {r.status === 'new' ? 'Nouveau' : 'Mise à jour'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.rows.length > 200 && <p className="text-xs text-stone-500">Aperçu limité aux 200 premières lignes ({plan.rows.length} au total).</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
