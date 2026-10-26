import { memo, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarPlus, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { RefItem, Store, Unit } from '../types';
import { UNITS } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { addMonths, inMonth } from '../shared/month';
import { refTotal } from '../shared/reducer';
import { NO_STORE_COLOR, NO_STORE_NAME, round2 } from '../shared/totals';
import { formatAmount, formatDH, monthLabel, parseDecimal } from '../lib/format';
import { uid } from '../lib/id';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const num = (n: number) => String(n).replace('.', ',');
const field = 'h-10 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-2.5 text-sm outline-none focus:border-brand-500 dark:border-stone-700 dark:bg-stone-900';

/** Une ligne du mois référence, modifiable sur place (enregistrée en quittant le champ). */
const RefRow = memo(function RefRow({ r, stores }: { r: RefItem; stores: Store[] }) {
  const { dispatch } = useFamilyData();
  const [name, setName] = useState(r.name);
  const [price, setPrice] = useState(num(r.price));
  const [qty, setQty] = useState(num(r.quantity));
  useEffect(() => setName(r.name), [r.name]);
  useEffect(() => setPrice(num(r.price)), [r.price]);
  useEffect(() => setQty(num(r.quantity)), [r.quantity]);
  const update = (patch: Partial<RefItem>) => dispatch({ type: 'ref/update', id: r.id, patch });
  const commit = (raw: string, f: 'price' | 'quantity', reset: () => void) => {
    const v = parseDecimal(raw);
    if (!Number.isFinite(v) || v < 0 || (f === 'quantity' && v <= 0)) return reset();
    if (v !== r[f]) update({ [f]: v });
  };
  return (
    <li className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-stone-800">
      <div className="flex items-center gap-2">
        <input className={`${field} flex-1 font-semibold`} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => (name.trim() && name.trim() !== r.name ? update({ name: name.trim() }) : setName(r.name))} aria-label="Nom" maxLength={80} />
        <span className="w-24 shrink-0 text-right text-sm font-bold tabular">{formatDH(round2(r.price * r.quantity))}</span>
        <button type="button" onClick={() => dispatch({ type: 'ref/delete', ids: [r.id] })} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" aria-label={`Retirer ${r.name} de la référence`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_1fr_5rem] gap-2">
        <label className="relative">
          <input className={`${field} pr-9 tabular`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => commit(price, 'price', () => setPrice(num(r.price)))} aria-label={`Prix de référence de ${r.name}`} />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">DH</span>
        </label>
        <input className={`${field} tabular`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={() => commit(qty, 'quantity', () => setQty(num(r.quantity)))} aria-label={`Quantité de référence de ${r.name}`} />
        <select className={field} value={r.unit} onChange={(e) => update({ unit: e.target.value as Unit })} aria-label={`Unité de ${r.name}`}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <select className={`${field} mt-2`} value={r.storeId ?? ''} onChange={(e) => update({ storeId: e.target.value || null })} aria-label={`Magasin de ${r.name}`}>
        <option value="">Sans magasin</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </li>
  );
});

/** Mois référence : la liste type, reprise chaque mois avec ses prix et quantités. */
export function ReferencePage({ onClose }: { onClose: () => void }) {
  const { data, dispatch } = useFamilyData();
  const reference = useMemo(() => data.reference ?? [], [data.reference]);
  const [q, setQ] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStore, setNewStore] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const next = addMonths(data.currentMonth, 1);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const groups = useMemo(() => {
    const f = fold(q.trim());
    const items = reference.filter((r) => !f || fold(r.name).includes(f)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const known = new Set(data.stores.map((s) => s.id));
    const out = data.stores.map((s) => ({ key: s.id, name: s.name, color: s.color, items: items.filter((r) => r.storeId === s.id) }));
    out.push({ key: 'none', name: NO_STORE_NAME, color: NO_STORE_COLOR, items: items.filter((r) => !r.storeId || !known.has(r.storeId)) });
    return out.filter((g) => g.items.length);
  }, [reference, q, data.stores]);

  const missingIn = (month: string) => {
    const list = data.products.filter((p) => inMonth(p, data.currentMonth, month));
    const refs = new Set(list.map((p) => p.refId));
    const keys = new Set(list.map((p) => `${fold(p.name)}|${p.storeId ?? ''}`));
    return reference.filter((r) => !refs.has(r.id) && !keys.has(`${fold(r.name)}|${r.storeId ?? ''}`)).length;
  };
  const missingCurrent = missingIn(data.currentMonth);
  const missingNext = missingIn(next);
  const unlinked = data.products.filter((p) => inMonth(p, data.currentMonth, data.currentMonth) && !(p.refId && reference.some((r) => r.id === p.refId)));

  const add = () => {
    const name = newName.trim();
    const price = parseDecimal(newPrice || '0');
    if (!name || !Number.isFinite(price)) return;
    const now = Date.now();
    dispatch({ type: 'ref/add', item: { id: `ref-${uid()}`, name, price, quantity: 1, unit: 'pcs', storeId: newStore || null, notes: '', photo: null, createdAt: now, updatedAt: now } });
    setNewName('');
    setNewPrice('');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 dark:bg-stone-950" role="region" aria-label="Mois référence">
      <div className="pt-safe border-b border-stone-200 bg-stone-100/95 dark:border-stone-800 dark:bg-stone-950/95">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-tight">Mois référence</h2>
            <p className="text-xs text-stone-500 tabular dark:text-stone-400">
              {reference.length} articles · {formatDH(refTotal(reference))} par mois
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-16 pt-4">
        <div className="rounded-3xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:text-brand-100 dark:ring-brand-800">
          <p>
            La référence est votre liste type. Chaque nouveau mois commence avec ces articles, à leurs prix et quantités.
            {data.settings.syncReference === false
              ? ' Les changements faits dans un mois ne modifient pas la référence.'
              : ' Quand vous changez le prix ou la quantité d’un article dans un mois, la référence est mise à jour.'}
          </p>
          <label className="mt-3 flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-700"
              checked={data.settings.syncReference !== false}
              onChange={(e) => dispatch({ type: 'settings/update', patch: { syncReference: e.target.checked } })}
            />
            Mettre à jour la référence quand je change un prix ou une quantité
          </label>
        </div>

        {(missingCurrent > 0 || missingNext > 0 || unlinked.length > 0) && (
          <div className="space-y-2">
            {unlinked.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'ref/fromProducts', ids: unlinked.map((p) => p.id) });
                  setMsg(`${unlinked.length} article(s) de ${monthLabel(data.currentMonth)} ajoutés à la référence.`);
                }}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
              >
                <RefreshCw className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300" />
                <span className="min-w-0 flex-1 text-sm">
                  <b>Ajouter à la référence</b> les {unlinked.length} article(s) de {monthLabel(data.currentMonth)} qui n’y sont pas
                </span>
              </button>
            )}
            {[
              { month: null as string | null, label: monthLabel(data.currentMonth), n: missingCurrent },
              { month: next as string | null, label: monthLabel(next), n: missingNext },
            ]
              .filter((x) => x.n > 0)
              .map((x) => (
                <button
                  key={x.label}
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'ref/applyToMonth', month: x.month });
                    setMsg(`${x.n} article(s) de la référence ajoutés à ${x.label}.`);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
                >
                  <CalendarPlus className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                  <span className="min-w-0 flex-1 text-sm">
                    <b>Ajouter à {x.label}</b> les {x.n} article(s) de la référence absents de cette liste
                  </span>
                </button>
              ))}
          </div>
        )}
        {msg && <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{msg}</p>}

        <form
          className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-stone-800"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <span className="label">Ajouter un article à la référence</span>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <input className={field} placeholder="Nom" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nom du nouvel article de référence" />
            <input className={`${field} tabular`} placeholder="Prix" inputMode="decimal" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} aria-label="Prix du nouvel article de référence" />
          </div>
          <div className="mt-2 flex gap-2">
            <select className={field} value={newStore} onChange={(e) => setNewStore(e.target.value)} aria-label="Magasin du nouvel article de référence">
              <option value="">Sans magasin</option>
              {data.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!newName.trim()} className="btn-primary h-10 shrink-0 px-3 text-sm">
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
        </form>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans la référence…" className="h-11 w-full rounded-2xl border border-stone-200 bg-white pl-9 pr-3 outline-none focus:border-brand-500 dark:border-stone-800 dark:bg-stone-900" aria-label="Rechercher dans la référence" />
        </label>

        {groups.map((g) => (
          <section key={g.key}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="flex items-center gap-2 font-bold">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: g.color }} /> {g.name}
              </span>
              <span className="text-xs text-stone-500 tabular">{formatAmount(refTotal(g.items))} DH</span>
            </div>
            <ul className="space-y-2">
              {g.items.map((r) => (
                <RefRow key={r.id} r={r} stores={data.stores} />
              ))}
            </ul>
          </section>
        ))}
        {!reference.length && <p className="py-8 text-center text-sm text-stone-500">La référence est vide. Ajoutez les articles du mois en cours avec le bouton ci-dessus.</p>}
      </div>
    </div>
  );
}
