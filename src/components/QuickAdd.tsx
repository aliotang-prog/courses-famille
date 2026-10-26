import { useMemo, useRef, useState } from 'react';
import { ArrowUp, SlidersHorizontal } from 'lucide-react';
import type { Store } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { quickParse } from '../lib/quickParse';
import { formatDH, formatQty } from '../lib/format';
import { uid } from '../lib/id';
import { readString, writeString } from '../lib/storage';
import type { ProductDraft } from './ProductModal';

interface QuickAddProps {
  /** Magasin actif dans le filtre (prioritaire). */
  activeStoreId: string | null;
  /** Mois cible : null = mois en cours, sinon liste préparée à l'avance. */
  month: string | null;
  onOpenFull: (draft: ProductDraft) => void;
}

function storeName(stores: Store[], id: string | null) {
  return stores.find((s) => s.id === id);
}

/** Barre d'ajout rapide : « Tomates 2kg 8,5 » → ajouté en un geste. */
export function QuickAdd({ activeStoreId, month, onOpenFull }: QuickAddProps) {
  const { data, dispatch } = useFamilyData();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastStore, setLastStore] = useState<string | null>(() => readString('cf:lastStore'));

  // Choix manuel dans la liste déroulante (réinitialisé quand le filtre magasin change).
  const [picked, setPicked] = useState<{ for: string | null; id: string | null } | null>(null);

  const storeId = useMemo(() => {
    if (picked && picked.for === activeStoreId && (picked.id === null || data.stores.some((s) => s.id === picked.id))) return picked.id;
    if (activeStoreId && data.stores.some((s) => s.id === activeStoreId)) return activeStoreId;
    if (lastStore && data.stores.some((s) => s.id === lastStore)) return lastStore;
    return null;
  }, [picked, activeStoreId, lastStore, data.stores]);

  const parsed = useMemo(() => quickParse(text), [text]);
  const store = storeName(data.stores, storeId);

  const submit = () => {
    if (!parsed.name) return;
    const now = Date.now();
    dispatch({
      type: 'product/add',
      product: {
        id: uid(),
        name: parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1),
        price: parsed.price ?? 0,
        quantity: parsed.quantity ?? 1,
        unit: parsed.unit ?? 'pcs',
        storeId,
        checked: false,
        photo: null,
        notes: '',
        recurring: true,
        month,
        createdAt: now,
        updatedAt: now,
        checkedAt: null,
      },
      toReference: true,
    });
    setText('');
    inputRef.current?.focus();
  };

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-3 pt-2 backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/95">
      <div className="mx-auto max-w-2xl">
        {text.trim() && (
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 px-1 text-xs text-stone-500 tabular dark:text-stone-400" aria-live="polite">
            <span className="font-semibold text-stone-800 dark:text-stone-100">{parsed.name || '…'}</span>
            <span>· {formatQty(parsed.quantity ?? 1, parsed.unit ?? 'pcs')}</span>
            <span>· {parsed.price !== null ? `${formatDH(parsed.price)}/u` : 'prix à compléter'}</span>
            {store && <span>· {store.name}</span>}
          </div>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Ajouter un article</span>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex : Lait x6 7,5"
              className="h-12 w-full rounded-2xl bg-stone-100 pl-4 pr-3 outline-none ring-brand-500/25 placeholder:text-stone-400 focus:ring-4 dark:bg-stone-800"
              enterKeyHint="done"
              autoComplete="off"
            />
          </label>
          <select
            value={storeId ?? ''}
            onChange={(e) => {
              const v = e.target.value || null;
              setPicked({ for: activeStoreId, id: v });
              setLastStore(v);
              writeString('cf:lastStore', v ?? '');
            }}
            className="h-12 w-[5.5rem] shrink-0 truncate rounded-2xl bg-stone-100 px-2 text-sm font-semibold outline-none dark:bg-stone-800"
            aria-label="Magasin de l’article"
            style={store ? { boxShadow: `inset 4px 0 0 ${store.color}` } : undefined}
          >
            <option value="">Aucun</option>
            {data.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              onOpenFull({ name: parsed.name, price: parsed.price, quantity: parsed.quantity, unit: parsed.unit, storeId });
              setText('');
            }}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
            aria-label="Formulaire complet (photo, notes…)"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
          <button type="submit" disabled={!parsed.name} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-700 text-white shadow-sm transition active:scale-95 disabled:opacity-40 dark:bg-brand-600" aria-label="Ajouter">
            <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </div>
  );
}
