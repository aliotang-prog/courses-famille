import { useState } from 'react';
import { CalendarClock, CheckCheck, ListChecks, Store as StoreIcon, Trash2, Undo2, X } from 'lucide-react';
import { addMonths } from '../shared/month';
import { monthLabel } from '../lib/format';
import { uid } from '../lib/id';
import { useFamilyData } from '../context/FamilyContext';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface BulkActionBarProps {
  /** Mois de la liste affichée. */
  listMonth: string;
  selected: Set<string>;
  visibleIds: string[];
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  onDeleted: (ids: string[]) => void;
}

/** Barre d'actions groupées (remplace la barre d'ajout en mode sélection). */
export function BulkActionBar({ listMonth, selected, visibleIds, onSelectAll, onClear, onExit, onDeleted }: BulkActionBarProps) {
  const { data, dispatch } = useFamilyData();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = [...selected];
  const n = ids.length;
  const nextMonth = addMonths(data.currentMonth, 1);
  const planning = listMonth === nextMonth;
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const action = 'flex flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-[11px] font-semibold transition active:scale-95 disabled:opacity-35';

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-3 pt-2 backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/95">
      <div className="mx-auto max-w-2xl">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-sm font-bold">
            {n} sélectionné{n > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={allSelected ? onClear : onSelectAll} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30">
              <ListChecks className="h-4 w-4" /> {allSelected ? 'Aucun' : 'Tout'}
            </button>
            <button type="button" onClick={onExit} className="icon-btn h-9 w-9" aria-label="Quitter la sélection">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          <button type="button" disabled={!n} onClick={() => dispatch({ type: 'bulk/setChecked', ids, checked: true })} className={`${action} bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200`}>
            <CheckCheck className="h-5 w-5" /> Acheté
          </button>
          <button type="button" disabled={!n} onClick={() => dispatch({ type: 'bulk/setChecked', ids, checked: false })} className={`${action} bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200`}>
            <Undo2 className="h-5 w-5" /> En attente
          </button>
          <label className={`${action} relative bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200 ${!n ? 'pointer-events-none opacity-35' : ''}`}>
            <StoreIcon className="h-5 w-5" /> Magasin
            <select
              className="absolute inset-0 cursor-pointer opacity-0"
              value=""
              disabled={!n}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                dispatch({ type: 'bulk/move', ids, storeId: v === '__none' ? null : v });
              }}
              aria-label="Déplacer vers le magasin"
            >
              <option value="">Déplacer vers…</option>
              {data.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__none">Sans magasin</option>
            </select>
          </label>
          <label className={`${action} relative bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 ${!n ? 'pointer-events-none opacity-35' : ''}`}>
            <CalendarClock className="h-5 w-5" /> Mois
            <select
              className="absolute inset-0 cursor-pointer opacity-0"
              value=""
              disabled={!n}
              onChange={(e) => {
                const v = e.target.value;
                const target = planning ? null : nextMonth;
                if (v === 'copy') dispatch({ type: 'bulk/copyToMonth', ids, month: target, newIds: ids.map(() => uid()) });
                if (v === 'move') dispatch({ type: 'bulk/setMonth', ids, month: target });
                if (v === 'skip') dispatch({ type: 'bulk/skip', ids, skipped: true });
                if (v === 'unskip') dispatch({ type: 'bulk/skip', ids, skipped: false });
              }}
              aria-label="Copier ou déplacer vers un autre mois"
            >
              <option value="">Mois…</option>
              <option value="copy">Copier vers {monthLabel(planning ? data.currentMonth : nextMonth)}</option>
              <option value="move">Déplacer vers {monthLabel(planning ? data.currentMonth : nextMonth)}</option>
              <option value="skip">Ignorer ce mois</option>
              <option value="unskip">Ne plus ignorer</option>
            </select>
          </label>
          <button type="button" disabled={!n} onClick={() => setConfirmDelete(true)} className={`${action} bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300`}>
            <Trash2 className="h-5 w-5" /> Supprimer
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title={`Supprimer ${n} article${n > 1 ? 's' : ''} ?`}
        message="Ils seront retirés de la liste pour toute la famille."
        confirmLabel="Supprimer"
        onConfirm={() => {
          dispatch({ type: 'bulk/delete', ids });
          onDeleted(ids);
        }}
      />
    </div>
  );
}
