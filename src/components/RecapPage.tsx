import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Minus } from 'lucide-react';
import type { MonthKey, RefItem } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { addMonths, inMonth } from '../shared/month';
import { refTotal } from '../shared/reducer';
import { NO_STORE_NAME, lineTotal, round2, sumTotals } from '../shared/totals';
import { formatAmount, formatDH, formatNumber, monthLabel } from '../lib/format';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

interface Line {
  name: string;
  storeName: string;
  price: number;
  quantity: number;
  unit: string;
  total: number;
  spent: number;
  checked: boolean;
  skipped: boolean;
  ref: RefItem | undefined;
}

function Delta({ value, suffix = ' DH' }: { value: number; suffix?: string }) {
  if (Math.abs(value) < 0.005) {
    return (
      <span className="inline-flex items-center gap-0.5 text-stone-500">
        <Minus className="h-3.5 w-3.5" /> 0{suffix}
      </span>
    );
  }
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular ${up ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {up ? '+' : '−'}
      {formatAmount(Math.abs(value))}
      {suffix}
    </span>
  );
}

/** Récap d'un mois et comparatif avec le mois référence et les autres mois. */
export function RecapPage({ onClose }: { onClose: () => void }) {
  const { data } = useFamilyData();
  const reference = useMemo(() => data.reference ?? [], [data.reference]);
  const next = addMonths(data.currentMonth, 1);
  const [month, setMonth] = useState<MonthKey>(data.currentMonth);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const storeName = useMemo(() => new Map(data.stores.map((s) => [s.id, s.name])), [data.stores]);
  const refById = useMemo(() => new Map(reference.map((r) => [r.id, r])), [reference]);
  const refByName = useMemo(() => new Map(reference.map((r) => [fold(r.name), r])), [reference]);
  const refTot = refTotal(reference);

  const archive = data.history.find((h) => h.month === month);
  const live = month === data.currentMonth || month === next;

  const lines: Line[] = useMemo(() => {
    if (live) {
      return data.products
        .filter((p) => inMonth(p, data.currentMonth, month))
        .map((p) => ({
          name: p.name,
          storeName: (p.storeId && storeName.get(p.storeId)) || NO_STORE_NAME,
          price: p.price,
          quantity: p.quantity,
          unit: p.unit,
          total: lineTotal(p),
          spent: sumTotals([p]).spent,
          checked: p.checked,
          skipped: Boolean(p.skipped),
          ref: (p.refId && refById.get(p.refId)) || refByName.get(fold(p.name)),
        }));
    }
    return (archive?.items ?? []).map((it) => ({
      name: it.name,
      storeName: it.storeName,
      price: it.price,
      quantity: it.quantity,
      unit: it.unit,
      total: it.lineTotal,
      spent: it.checked ? it.lineTotal : 0,
      checked: it.checked,
      skipped: false,
      ref: refByName.get(fold(it.name)),
    }));
  }, [live, data.products, data.currentMonth, month, storeName, refById, refByName, archive]);

  const active = lines.filter((l) => !l.skipped);
  const estimated = live ? round2(active.reduce((t, l) => t + l.total, 0)) : (archive?.estimated ?? 0);
  const spent = live ? round2(active.reduce((t, l) => t + l.spent, 0)) : (archive?.spent ?? 0);
  const bought = active.filter((l) => l.checked).length;

  const priceChanges = lines.filter((l) => l.ref && Math.abs(l.ref.price - l.price) >= 0.005).sort((a, b) => Math.abs(b.price - (b.ref?.price ?? 0)) - Math.abs(a.price - (a.ref?.price ?? 0)));
  const qtyChanges = lines.filter((l) => l.ref && Math.abs(l.ref.quantity - l.quantity) >= 0.001);
  const outside = lines.filter((l) => !l.ref);
  const inMonthRefs = new Set(lines.map((l) => l.ref?.id).filter(Boolean));
  const missingRefs = reference.filter((r) => !inMonthRefs.has(r.id));

  // Par magasin : référence vs mois.
  const stores = useMemo(() => {
    const rows = new Map<string, { name: string; ref: number; est: number; spent: number }>();
    const row = (name: string) => {
      let r = rows.get(name);
      if (!r) rows.set(name, (r = { name, ref: 0, est: 0, spent: 0 }));
      return r;
    };
    for (const r of reference) row((r.storeId && storeName.get(r.storeId)) || NO_STORE_NAME).ref += r.price * r.quantity;
    for (const l of active) {
      const r = row(l.storeName);
      r.est += l.total;
      r.spent += l.spent;
    }
    return [...rows.values()].filter((r) => r.ref || r.est).sort((a, b) => b.est + b.ref - (a.est + a.ref));
  }, [reference, active, storeName]);

  // Comparatif : référence + tous les mois.
  const months = useMemo(() => {
    const cur = sumTotals(data.products.filter((p) => inMonth(p, data.currentMonth, data.currentMonth)));
    const nxt = sumTotals(data.products.filter((p) => inMonth(p, data.currentMonth, next)));
    const rows = [
      ...data.history.map((h) => ({ month: h.month, label: monthLabel(h.month), est: h.estimated, spent: h.spent, tag: 'archivé' })),
      { month: data.currentMonth, label: monthLabel(data.currentMonth), est: cur.estimated, spent: cur.spent, tag: 'en cours' },
    ];
    if (nxt.count) rows.push({ month: next, label: monthLabel(next), est: nxt.estimated, spent: nxt.spent, tag: 'à préparer' });
    return rows.sort((a, b) => a.month.localeCompare(b.month));
  }, [data.history, data.products, data.currentMonth, next]);
  const max = Math.max(1, refTot, ...months.map((m) => Math.max(m.est, m.spent)));

  const options = [...new Set([...data.history.map((h) => h.month), data.currentMonth, next])].sort();
  const card = 'rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-stone-800';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 dark:bg-stone-950" role="region" aria-label="Récap du mois">
      <div className="pt-safe border-b border-stone-200 bg-stone-100/95 dark:border-stone-800 dark:bg-stone-950/95">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-0 flex-1 text-lg font-bold tracking-tight">Récap & comparatif</h2>
        </div>
        <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 pb-3 no-scrollbar" role="tablist" aria-label="Mois">
          {options.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={month === m}
              onClick={() => setMonth(m)}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${month === m ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'bg-white text-stone-600 dark:bg-stone-900 dark:text-stone-300'}`}
            >
              {monthLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-16 pt-4">
        <section className={card}>
          <h3 className="text-xl font-bold">{monthLabel(month)}</h3>
          <p className="text-xs text-stone-500">
            {month === data.currentMonth ? 'Mois en cours' : month === next ? 'Mois à préparer' : 'Mois archivé'} · {bought}/{active.length} articles achetés
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-stone-50 p-2.5 dark:bg-stone-800/70">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Référence</div>
              <div className="text-base font-bold tabular">{formatAmount(refTot)}</div>
            </div>
            <div className="rounded-2xl bg-stone-50 p-2.5 dark:bg-stone-800/70">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Prévu</div>
              <div className="text-base font-bold tabular">{formatAmount(estimated)}</div>
            </div>
            <div className="rounded-2xl bg-brand-700 p-2.5 text-white dark:bg-brand-600">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-100">Dépensé</div>
              <div className="text-base font-bold tabular">{formatAmount(spent)}</div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Prévu vs référence</span>
              <Delta value={round2(estimated - refTot)} />
            </div>
            <div className="flex justify-between">
              <span>Dépensé vs référence</span>
              <Delta value={round2(spent - refTot)} />
            </div>
            {data.settings.monthlyBudget !== null && (
              <div className="flex justify-between">
                <span>Prévu vs budget ({formatAmount(data.settings.monthlyBudget)} DH)</span>
                <Delta value={round2(estimated - data.settings.monthlyBudget)} />
              </div>
            )}
          </div>
        </section>

        <section className={card}>
          <h3 className="mb-3 font-semibold">Comparatif des mois</h3>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand-600 dark:bg-brand-400" /> Dépensé
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand-200 dark:bg-brand-900" /> Prévu
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-0.5 bg-saffron-500" /> Référence {formatAmount(refTot)} DH
            </span>
          </div>
          <ul className="space-y-3">
            {months.map((m) => (
              <li key={m.month}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className={m.month === month ? 'font-bold' : ''}>
                    {m.label} <span className="text-stone-400">· {m.tag}</span>
                  </span>
                  <span className="tabular">
                    <b>{formatAmount(m.spent)}</b> / {formatAmount(m.est)} DH
                  </span>
                </div>
                <div className="relative mt-1 h-3.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-brand-200 dark:bg-brand-900" style={{ width: `${(m.est / max) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${(m.spent / max) * 100}%` }} />
                  {refTot > 0 && <div className="absolute inset-y-0 w-0.5 bg-saffron-500" style={{ left: `${(refTot / max) * 100}%` }} aria-hidden="true" />}
                </div>
                <div className="mt-0.5 text-right text-[11px]">
                  vs référence : <Delta value={round2((m.spent || m.est) - refTot)} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h3 className="mb-2 font-semibold">Par magasin</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-1.5 font-semibold">Magasin</th>
                  <th className="py-1.5 text-right font-semibold">Réf.</th>
                  <th className="py-1.5 text-right font-semibold">Prévu</th>
                  <th className="py-1.5 text-right font-semibold">Dépensé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular dark:divide-stone-800">
                {stores.map((r) => (
                  <tr key={r.name}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-right text-stone-500">{formatAmount(r.ref)}</td>
                    <td className="py-2 text-right">{formatAmount(r.est)}</td>
                    <td className="py-2 text-right font-semibold">{formatAmount(r.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={card}>
          <h3 className="mb-2 font-semibold">Prix différents de la référence ({priceChanges.length})</h3>
          {priceChanges.length === 0 && <p className="text-sm text-stone-500">Tous les prix sont ceux de la référence.</p>}
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {priceChanges.slice(0, 50).map((l) => (
              <li key={l.name + l.storeName} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <b>{l.name}</b> <span className="text-xs text-stone-500">· {l.storeName}</span>
                </span>
                <span className="shrink-0 text-xs text-stone-500 tabular">
                  {formatAmount(l.ref!.price)} → {formatAmount(l.price)}
                </span>
                <Delta value={round2(l.price - l.ref!.price)} />
              </li>
            ))}
          </ul>
        </section>

        {qtyChanges.length > 0 && (
          <section className={card}>
            <h3 className="mb-2 font-semibold">Quantités différentes de la référence ({qtyChanges.length})</h3>
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {qtyChanges.slice(0, 50).map((l) => (
                <li key={l.name + l.storeName} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold">{l.name}</span>
                  <span className="shrink-0 text-xs text-stone-500 tabular">
                    {formatNumber(l.ref!.quantity)} → {formatNumber(l.quantity)} {l.unit}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={card}>
          <h3 className="mb-2 font-semibold">Hors référence ({outside.length})</h3>
          {outside.length === 0 ? (
            <p className="text-sm text-stone-500">Aucun achat en dehors de la référence.</p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {outside.map((l) => (
                <li key={l.name + l.storeName} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {l.name} <span className="text-xs text-stone-500">· {l.storeName}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular">{formatDH(l.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {missingRefs.length > 0 && (
          <section className={card}>
            <h3 className="mb-2 font-semibold">Articles de la référence absents ce mois ({missingRefs.length})</h3>
            <p className="text-sm text-stone-500">{missingRefs.slice(0, 40).map((r) => r.name).join(', ')}{missingRefs.length > 40 ? '…' : ''}</p>
          </section>
        )}
      </div>
    </div>
  );
}
