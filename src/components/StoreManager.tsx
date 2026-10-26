import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { compressImage } from '../lib/image';
import type { Store } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { STORE_COLORS } from '../shared/defaults';
import { totalsByStore } from '../shared/totals';
import { formatDH } from '../lib/format';
import { uid } from '../lib/id';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { StoreBadge } from './ui/StoreBadge';
import { FitImage } from './ui/FitImage';

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur du badge">
      {STORE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Couleur ${c}`}
          onClick={() => onChange(c)}
          className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-90 ${value === c ? 'ring-2 ring-stone-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-stone-900' : ''}`}
          style={{ backgroundColor: c }}
        >
          {value === c && <Check className="h-4 w-4 text-white" />}
        </button>
      ))}
    </div>
  );
}

/** Choix d'une photo ou d'un logo de magasin (galerie ou appareil photo). */
function StorePhotoPicker({ photo, onChange, label }: { photo: string | null | undefined; onChange: (p: string | null) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-stone-100 px-3 text-sm font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200"
        aria-label={`${photo ? 'Changer' : 'Ajouter'} la photo de ${label}`}
      >
        <ImagePlus className="h-4 w-4" /> {busy ? 'Préparation…' : photo ? 'Changer la photo' : 'Photo / logo'}
      </button>
      {photo && (
        <button type="button" onClick={() => onChange(null)} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-red-600 dark:text-red-400" aria-label={`Retirer la photo de ${label}`}>
          <X className="h-4 w-4" /> Retirer
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          setError(null);
          try {
            onChange(await compressImage(f, 400, 0.8));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Image illisible.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function StoreAvatar({ store, size = 36 }: { store: Pick<Store, 'color' | 'photo' | 'name'>; size?: number }) {
  return store.photo ? (
    <FitImage src={store.photo} alt={store.name} className="rounded-xl" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${store.color}` }} />
  ) : (
    <span className="block shrink-0 rounded-xl ring-2 ring-white dark:ring-stone-900" style={{ width: size, height: size, backgroundColor: store.color }} />
  );
}

function StoreRow({ store, estimated, spent, count }: { store: Store; estimated: number; spent: number; count: number }) {
  const { dispatch } = useFamilyData();
  const [name, setName] = useState(store.name);
  const [showColors, setShowColors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Renommage fait depuis un autre téléphone.
  useEffect(() => setName(store.name), [store.name]);

  const commitName = () => {
    const n = name.trim();
    if (n && n !== store.name) dispatch({ type: 'store/update', id: store.id, patch: { name: n } });
    else setName(store.name);
  };

  return (
    <li className="rounded-2xl bg-stone-50 p-3 dark:bg-stone-800/60">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowColors((v) => !v)}
          className="shrink-0 rounded-xl"
          aria-label={`Changer la couleur ou la photo de ${store.name}`}
          aria-expanded={showColors}
        >
          <StoreAvatar store={store} />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          maxLength={40}
          className="h-10 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 font-semibold outline-none focus:border-brand-500 focus:bg-white dark:focus:bg-stone-900"
          aria-label="Nom du magasin"
        />
        <button type="button" onClick={() => setConfirmDelete(true)} className="icon-btn text-red-600 dark:text-red-400" aria-label={`Supprimer ${store.name}`}>
          <Trash2 className="h-4.5 w-4.5" />
        </button>
      </div>
      <div className="mt-1 pl-11 text-xs text-stone-500 tabular dark:text-stone-400">
        {count} article{count > 1 ? 's' : ''} · Dépensé {formatDH(spent)} / Budgété {formatDH(estimated)}
      </div>
      {showColors && (
        <div className="mt-3 space-y-3 pl-11">
          <ColorPicker value={store.color} onChange={(c) => dispatch({ type: 'store/update', id: store.id, patch: { color: c } })} />
          <StorePhotoPicker photo={store.photo} label={store.name} onChange={(photo) => dispatch({ type: 'store/update', id: store.id, patch: { photo } })} />
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title={`Supprimer « ${store.name} » ?`}
        confirmLabel="Supprimer"
        onConfirm={() => dispatch({ type: 'store/delete', id: store.id })}
        message={
          count > 0
            ? `${count} article${count > 1 ? 's' : ''} de ce magasin passeront dans « Sans magasin ». Ils ne sont pas supprimés.`
            : 'Ce magasin ne contient aucun article.'
        }
      />
    </li>
  );
}

export function StoreManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, dispatch } = useFamilyData();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(STORE_COLORS[6]);
  const [photo, setPhoto] = useState<string | null>(null);
  const totals = useMemo(() => totalsByStore(data.products, data.stores), [data.products, data.stores]);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    dispatch({ type: 'store/add', store: { id: uid(), name: n, color, photo, createdAt: Date.now() } });
    setName('');
    setPhoto(null);
    setColor(STORE_COLORS[(STORE_COLORS.indexOf(color as (typeof STORE_COLORS)[number]) + 3) % STORE_COLORS.length]);
  };

  return (
    <Modal open={open} onClose={onClose} title="Magasins">
      <ul className="space-y-2">
        {data.stores.map((s) => {
          const t = totals.find((r) => r.storeId === s.id);
          return <StoreRow key={s.id} store={s} estimated={t?.estimated ?? 0} spent={t?.spent ?? 0} count={t?.count ?? 0} />;
        })}
        {!data.stores.length && <li className="py-4 text-center text-sm text-stone-500">Aucun magasin. Ajoutez-en un ci-dessous.</li>}
      </ul>

      <form
        className="mt-5 rounded-2xl border border-dashed border-stone-300 p-3 dark:border-stone-700"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="new-store" className="label">
          Nouveau magasin
        </label>
        <div className="flex gap-2">
          <input id="new-store" className="field" placeholder="ex : Aswak Assalam, Hanout…" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <button type="submit" className="btn-primary shrink-0" disabled={!name.trim()} aria-label="Ajouter le magasin">
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="mt-3">
          <StorePhotoPicker photo={photo} label="ce magasin" onChange={setPhoto} />
        </div>
        {name.trim() && (
          <div className="mt-3 text-sm text-stone-500">
            Aperçu : <StoreBadge name={name.trim()} color={color} photo={photo} />
          </div>
        )}
      </form>
    </Modal>
  );
}
