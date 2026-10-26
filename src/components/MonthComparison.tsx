import type { MonthKey } from '../types';
import { formatAmount, monthLabel } from '../lib/format';

export interface MonthPoint {
  month: MonthKey;
  estimated: number;
  spent: number;
  live?: boolean;
}

/** Comparatif des derniers mois : barre pleine = dépensé, barre claire = estimé. */
export function MonthComparison({ points, highlight }: { points: MonthPoint[]; highlight?: MonthKey }) {
  const rows = [...points].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.spent, r.estimated)));

  if (rows.length < 2) {
    return (
      <p className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
        Le comparatif apparaîtra après la première clôture de mois.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-stone-500 dark:text-stone-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-600 dark:bg-brand-400" /> Dépensé
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-200 dark:bg-brand-900" /> Estimé
        </span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r, i) => {
          const prev = rows[i - 1];
          const diff = prev && prev.spent > 0 ? ((r.spent - prev.spent) / prev.spent) * 100 : null;
          const isHi = r.month === highlight;
          return (
            <li key={r.month} className="grid grid-cols-[4.25rem_1fr] items-center gap-2">
              <span className={`text-xs ${isHi ? 'font-bold text-stone-900 dark:text-white' : 'text-stone-500 dark:text-stone-400'}`}>
                {monthLabel(r.month, true)}
                {r.live && <span className="block text-[10px] font-medium text-brand-600 dark:text-brand-400">en cours</span>}
              </span>
              <div>
                <div className="relative h-3.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-brand-200 dark:bg-brand-900" style={{ width: `${(r.estimated / max) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-brand-600 dark:bg-brand-400" style={{ width: `${(r.spent / max) * 100}%` }} />
                </div>
                <div className="mt-0.5 flex justify-between text-[11px] tabular text-stone-500 dark:text-stone-400">
                  <span>
                    <b className="font-semibold text-stone-800 dark:text-stone-200">{formatAmount(r.spent)}</b> / {formatAmount(r.estimated)} DH
                  </span>
                  {diff !== null && Number.isFinite(diff) && (
                    <span className={diff > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                      {diff > 0 ? '+' : ''}
                      {diff.toFixed(0)} %
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
