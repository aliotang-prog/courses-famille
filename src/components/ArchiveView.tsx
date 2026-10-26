import { useMemo } from 'react';
import { ArrowLeft, Check, Circle, TrendingDown, TrendingUp } from 'lucide-react';
import type { MonthArchive } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { sumTotals } from '../shared/totals';
import { inMonth } from '../shared/month';
import { formatAmount, formatDH, formatDate, formatQty, monthLabel } from '../lib/format';
import { MonthComparison } from './MonthComparison';
import { StoreBadge } from './ui/StoreBadge';

/** Consultation (lecture seule) d'un mois archivé. */
export function ArchiveView({ archive, onBack }: { archive: MonthArchive; onBack: () => void }) {
  const { data } = useFamilyData();
  const sorted = useMemo(() => [...data.history].sort((a, b) => a.month.localeCompare(b.month)), [data.history]);
  const prev = sorted[sorted.findIndex((h) => h.month === archive.month) - 1];
  const live = useMemo(() => sumTotals(data.products.filter((p) => inMonth(p, data.currentMonth, data.currentMonth))), [data.products, data.currentMonth]);
  const diff = prev && prev.spent > 0 ? ((archive.spent - prev.spent) / prev.spent) * 100 : null;

  const points = [
    ...data.history.map((h) => ({ month: h.month, estimated: h.estimated, spent: h.spent })),
    { month: data.currentMonth, estimated: live.estimated, spent: live.spent, live: true },
  ];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
        <ArrowLeft className="h-4 w-4" /> Retour au mois en cours
      </button>

      <section className="card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Archive · clôturée le {formatDate(archive.archivedAt)}</div>
        <h2 className="mt-0.5 text-2xl font-bold">{monthLabel(archive.month)}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-brand-700 p-3 text-white dark:bg-brand-600">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-100">Dépensé</div>
            <div className="text-xl font-bold tabular">{formatDH(archive.spent)}</div>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3 dark:bg-stone-800/70">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Estimé</div>
            <div className="text-xl font-bold tabular">{formatDH(archive.estimated)}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600 dark:text-stone-300">
          <span>
            {archive.checkedCount}/{archive.itemCount} articles achetés
          </span>
          {archive.budget !== null && (
            <span className={archive.spent > archive.budget ? 'text-red-600 dark:text-red-400' : ''}>Budget {formatDH(archive.budget)}</span>
          )}
          {diff !== null && prev && (
            <span className={`inline-flex items-center gap-1 font-semibold ${diff > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {diff > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {diff > 0 ? '+' : ''}
              {diff.toFixed(1)} % vs {monthLabel(prev.month)}
            </span>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-3 font-semibold">Comparatif des mois</h3>
        <MonthComparison points={points} highlight={archive.month} />
      </section>

      <section className="card p-4">
        <h3 className="mb-3 font-semibold">Par enseigne</h3>
        <ul className="space-y-2">
          {archive.byStore
            .filter((s) => s.count > 0)
            .map((s) => (
              <li key={s.storeId ?? 'none'} className="flex items-center justify-between gap-3">
                <StoreBadge name={s.name} color={s.color} />
                <span className="text-sm tabular text-stone-600 dark:text-stone-300">
                  <b className="text-stone-900 dark:text-white">{formatAmount(s.spent)}</b> / {formatAmount(s.estimated)} DH
                </span>
              </li>
            ))}
        </ul>
      </section>

      <section className="card p-4">
        <h3 className="mb-3 font-semibold">Articles ({archive.items.length})</h3>
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {archive.items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              {it.checked ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-stone-300" />}
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${it.checked ? '' : 'text-stone-500'}`}>{it.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-stone-500 tabular">
                  <StoreBadge name={it.storeName} color={it.storeColor} size="xs" />
                  {formatQty(it.quantity, it.unit)} × {formatAmount(it.price)} DH
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular">{formatAmount(it.lineTotal)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
