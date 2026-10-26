import { useMemo, useState } from 'react';
import { Archive, BarChart3, CalendarClock, ChevronDown, History, Pencil, Wallet } from 'lucide-react';
import type { MonthKey } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { sumTotals } from '../shared/totals';
import { addMonths, inMonth } from '../shared/month';
import { formatAmount, formatDH, monthLabel, parseDecimal } from '../lib/format';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Modal } from './ui/Modal';
import { MonthComparison } from './MonthComparison';

interface BudgetSummaryProps {
  /** null = mois en cours ; mois suivant = liste à préparer ; autre = archive. */
  viewMonth: MonthKey | null;
  onViewMonth: (m: MonthKey | null) => void;
}

export function BudgetSummary({ viewMonth, onViewMonth }: BudgetSummaryProps) {
  const { data, dispatch } = useFamilyData();
  const [showCompare, setShowCompare] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');

  const nextMonth = addMonths(data.currentMonth, 1);
  const planning = viewMonth === nextMonth;
  const listMonth = planning ? nextMonth : data.currentMonth;

  const currentProducts = useMemo(() => data.products.filter((p) => inMonth(p, data.currentMonth, data.currentMonth)), [data.products, data.currentMonth]);
  const nextProducts = useMemo(() => data.products.filter((p) => inMonth(p, data.currentMonth, nextMonth)), [data.products, data.currentMonth, nextMonth]);
  const currentTotals = useMemo(() => sumTotals(currentProducts), [currentProducts]);
  const totals = useMemo(() => (planning ? sumTotals(nextProducts) : currentTotals), [planning, nextProducts, currentTotals]);
  const remaining = Math.max(0, totals.estimated - totals.spent);
  const pct = totals.estimated > 0 ? Math.min(100, (totals.spent / totals.estimated) * 100) : 0;
  const budget = data.settings.monthlyBudget;
  const overBudget = budget !== null && totals.estimated > budget;

  const months = useMemo(() => [...data.history].map((h) => h.month).sort().reverse(), [data.history]);
  const points = useMemo(
    () => [
      ...data.history.map((h) => ({ month: h.month, estimated: h.estimated, spent: h.spent })),
      { month: data.currentMonth, estimated: currentTotals.estimated, spent: currentTotals.spent, live: true },
    ],
    [data.history, data.currentMonth, currentTotals],
  );

  const recurringChecked = currentProducts.filter((p) => p.checked && p.recurring).length;
  const oneOffChecked = currentProducts.filter((p) => p.checked && !p.recurring).length;

  const tab = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-start rounded-2xl px-3 py-2 text-left transition ${
      active ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white' : 'text-stone-500 dark:text-stone-400'
    }`;

  return (
    <section className="card p-4" aria-label="Budget du mois">
      <div className="flex gap-1 rounded-[1.25rem] bg-stone-100 p-1 dark:bg-stone-800" role="tablist" aria-label="Liste du mois">
        <button type="button" role="tab" aria-selected={!planning} onClick={() => onViewMonth(null)} className={tab(!planning)}>
          <span className="truncate text-sm font-bold">{monthLabel(data.currentMonth)}</span>
          <span className="text-[11px] font-medium">En cours · {currentProducts.length} art.</span>
        </button>
        <button type="button" role="tab" aria-selected={planning} onClick={() => onViewMonth(nextMonth)} className={tab(planning)}>
          <span className="flex items-center gap-1 truncate text-sm font-bold">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" /> {monthLabel(nextMonth)}
          </span>
          <span className="text-[11px] font-medium">À préparer · {nextProducts.length} art.</span>
        </button>
      </div>


      <div className="mt-3 flex items-center justify-between gap-2">
        {months.length > 0 ? (
          <label className="relative inline-flex min-w-0 items-center">
            <History className="pointer-events-none absolute left-3 h-4 w-4 text-stone-500" />
            <select
              value=""
              onChange={(e) => e.target.value && onViewMonth(e.target.value)}
              className="h-9 max-w-[12rem] appearance-none truncate rounded-full bg-stone-100 pl-9 pr-8 text-sm font-semibold outline-none ring-brand-500/30 focus:ring-4 dark:bg-stone-800"
              aria-label="Consulter un mois archivé"
            >
              <option value="">Historique</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} · archivé
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-stone-500" />
          </label>
        ) : (
          <span className="text-xs text-stone-500 dark:text-stone-400">Aucun mois archivé</span>
        )}
        <button
          type="button"
          onClick={() => setShowCompare((v) => !v)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${
            showCompare ? 'bg-brand-700 text-white dark:bg-brand-600' : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200'
          }`}
          aria-pressed={showCompare}
        >
          <BarChart3 className="h-4 w-4" /> Comparatif
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Estimé" value={totals.estimated} />
        <Stat label="Acheté" value={totals.spent} accent />
        <Stat label="Reste" value={remaining} />
      </div>

      <div className="mt-3">
        <div
          className="h-2.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression des achats"
        >
          <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <span>
            {totals.checkedCount}/{totals.count} articles achetés{planning ? ` · ${monthLabel(listMonth)}` : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setBudgetDraft(budget ? String(budget).replace('.', ',') : '');
              setEditBudget(true);
            }}
            className={`inline-flex items-center gap-1 font-semibold ${overBudget ? 'text-red-600 dark:text-red-400' : 'text-stone-600 dark:text-stone-300'}`}
          >
            <Wallet className="h-3.5 w-3.5" />
            {budget !== null ? (
              <span className="tabular">
                Budget {formatAmount(budget)} DH{overBudget ? ` · dépassé de ${formatAmount(totals.estimated - budget)}` : ''}
              </span>
            ) : (
              'Définir un budget'
            )}
            <Pencil className="h-3 w-3 opacity-60" />
          </button>
        </div>
      </div>

      {showCompare && (
        <div className="mt-4 border-t border-stone-100 pt-4 dark:border-stone-800">
          <MonthComparison points={points} highlight={data.currentMonth} />
        </div>
      )}

      {!planning && (
      <button
        type="button"
        onClick={() => setConfirmClose(true)}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 py-2.5 text-sm font-semibold text-stone-600 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800/60"
      >
        <Archive className="h-4 w-4" /> Clôturer {monthLabel(data.currentMonth)} et passer à {monthLabel(nextMonth)}
      </button>
      )}

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title={`Clôturer ${monthLabel(data.currentMonth)} ?`}
        confirmLabel="Clôturer le mois"
        onConfirm={() => dispatch({ type: 'month/close', fromMonth: data.currentMonth })}
        message={
          <ul className="space-y-2">
            <li>
              📦 Le mois est archivé : <b className="tabular">{formatDH(totals.spent)}</b> dépensés sur <b className="tabular">{formatDH(totals.estimated)}</b> estimés.
            </li>
            <li>🔁 {recurringChecked} article(s) récurrent(s) acheté(s) seront <b>décochés</b> pour {monthLabel(addMonths(data.currentMonth, 1))}.</li>
            <li>🧾 {oneOffChecked} achat(s) ponctuel(s) déjà effectué(s) seront retirés de la liste.</li>
            <li>📝 Les articles non achetés restent dans la liste.</li>
            {nextProducts.length > 0 && (
              <li>
                📅 Les {nextProducts.length} article(s) préparé(s) pour {monthLabel(nextMonth)} deviennent la liste du mois (sans doublon).
              </li>
            )}
          </ul>
        }
      />

      <Modal
        open={editBudget}
        onClose={() => setEditBudget(false)}
        title="Budget mensuel"
        size="sm"
        footer={
          <div className="flex gap-2">
            {budget !== null && (
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => {
                  dispatch({ type: 'settings/update', patch: { monthlyBudget: null } });
                  setEditBudget(false);
                }}
              >
                Retirer
              </button>
            )}
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => {
                const v = parseDecimal(budgetDraft);
                dispatch({ type: 'settings/update', patch: { monthlyBudget: Number.isFinite(v) && v > 0 ? v : null } });
                setEditBudget(false);
              }}
            >
              Enregistrer
            </button>
          </div>
        }
      >
        <label htmlFor="budget" className="label">
          Montant cible (DH)
        </label>
        <div className="relative">
          <input
            id="budget"
            className="field pr-14 text-lg font-semibold tabular"
            inputMode="decimal"
            placeholder="ex : 3000"
            value={budgetDraft}
            onChange={(e) => setBudgetDraft(e.target.value)}
            autoFocus
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-semibold text-stone-400">DH</span>
        </div>
        <p className="mt-2 text-sm text-stone-500">Une alerte s’affiche quand le total estimé dépasse ce montant.</p>
      </Modal>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl px-2.5 py-2.5 ${accent ? 'bg-brand-700 text-white dark:bg-brand-600' : 'bg-stone-50 dark:bg-stone-800/70'}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${accent ? 'text-brand-100' : 'text-stone-500 dark:text-stone-400'}`}>{label}</div>
      <div className="mt-0.5 truncate text-[17px] font-bold leading-tight tabular">{formatAmount(value)}</div>
      <div className={`text-[10px] font-semibold ${accent ? 'text-brand-100' : 'text-stone-400'}`}>DH</div>
    </div>
  );
}
