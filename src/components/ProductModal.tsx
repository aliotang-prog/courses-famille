import { useEffect, useRef, useState } from 'react';
import { Camera, EyeOff, ImagePlus, Repeat, Trash2, X } from 'lucide-react';
import type { Product, ProductPatch, Unit } from '../types';
import { UNITS } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { compressImage } from '../lib/image';
import { formatDH, parseDecimal } from '../lib/format';
import { uid } from '../lib/id';
import { round2 } from '../shared/totals';
import { addMonths } from '../shared/month';
import { monthLabel } from '../lib/format';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { FitImage } from './ui/FitImage';

export interface ProductDraft {
  name?: string;
  price?: number | null;
  quantity?: number | null;
  unit?: Unit | null;
  storeId?: string | null;
  month?: string | null;
}

interface ProductModalProps {
  open: boolean;
  /** Produit à modifier, ou null pour un nouvel article. */
  product: Product | null;
  /** Valeurs pré-remplies pour un nouvel article. */
  draft?: ProductDraft;
  onClose: () => void;
  onDeleted?: (p: Product) => void;
}

const UNIT_LABEL: Record<Unit, string> = { pcs: 'Pièces', kg: 'Kilo', L: 'Litre', pack: 'Pack' };

const toInput = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

export function ProductModal({ open, product, draft, onClose, onDeleted }: ProductModalProps) {
  const { data, dispatch } = useFamilyData();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<Unit>('pcs');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [recurring, setRecurring] = useState(true);
  const [month, setMonth] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Initialise le formulaire à l'ouverture uniquement (pas à chaque synchro).
  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? draft?.name ?? '');
    setPrice(toInput(product?.price ?? draft?.price ?? null));
    setQuantity(toInput(product?.quantity ?? draft?.quantity ?? 1));
    setUnit(product?.unit ?? draft?.unit ?? 'pcs');
    setStoreId(product ? product.storeId : (draft?.storeId ?? null));
    setNotes(product?.notes ?? '');
    setRecurring(product ? Boolean(product.refId && (data.reference ?? []).some((r) => r.id === product.refId)) : true);
    setMonth(product ? (product.month ?? null) : (draft?.month ?? null));
    setSkipped(Boolean(product?.skipped));
    setPhoto(product?.photo ?? null);
    setPhotoError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  const nextMonth = addMonths(data.currentMonth, 1);
  const priceNum = price.trim() ? parseDecimal(price) : 0;
  const qtyNum = parseDecimal(quantity);
  const valid = name.trim().length > 0 && Number.isFinite(priceNum) && priceNum >= 0 && Number.isFinite(qtyNum) && qtyNum > 0;
  const preview = valid ? round2(priceNum * qtyNum) : 0;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      setPhoto(await compressImage(file));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Photo illisible.');
    } finally {
      setPhotoBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  const save = () => {
    if (!valid) return;
    const now = Date.now();
    if (!product) {
      dispatch({
        type: 'product/add',
        product: {
          id: uid(),
          name: name.trim(),
          price: priceNum,
          quantity: qtyNum,
          unit,
          storeId,
          checked: false,
          photo,
          notes: notes.trim(),
          recurring: true,
          month,
          skipped,
          createdAt: now,
          updatedAt: now,
          checkedAt: null,
        },
        toReference: recurring,
      });
    } else {
      // On n'envoie QUE les champs modifiés (la photo n'est jamais touchée si l'utilisateur ne l'a pas changée).
      const patch: ProductPatch = {};
      if (name.trim() !== product.name) patch.name = name.trim();
      if (priceNum !== product.price) patch.price = priceNum;
      if (qtyNum !== product.quantity) patch.quantity = qtyNum;
      if (unit !== product.unit) patch.unit = unit;
      if (storeId !== product.storeId) patch.storeId = storeId;
      if (notes.trim() !== product.notes) patch.notes = notes.trim();
      const inRef = Boolean(product.refId && (data.reference ?? []).some((r) => r.id === product.refId));
      if (photo !== product.photo) patch.photo = photo;
      if (month !== (product.month ?? null)) patch.month = month;
      if (skipped !== Boolean(product.skipped)) patch.skipped = skipped;
      if (Object.keys(patch).length) dispatch({ type: 'product/update', id: product.id, patch });
      if (recurring && !inRef) dispatch({ type: 'ref/fromProducts', ids: [product.id] });
      if (!recurring && inRef) dispatch({ type: 'product/update', id: product.id, patch: { refId: null } });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Modifier l’article' : 'Nouvel article'}
      footer={
        <div className="flex items-center gap-2">
          {product && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="btn-secondary w-12 px-0 text-red-600 dark:text-red-400" aria-label="Supprimer l’article">
              <Trash2 className="h-5 w-5" />
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Annuler
          </button>
          <button type="button" onClick={save} disabled={!valid || photoBusy} className="btn-primary flex-[1.4]">
            {product ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <div className="flex gap-3">
          <div className="shrink-0">
            {photo ? (
              <div className="relative">
                <FitImage src={photo} alt="Photo de l’article" backdrop="blur" className="h-24 w-24 rounded-2xl ring-1 ring-black/5" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-stone-900 text-white shadow"
                  aria-label="Retirer la photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="grid h-24 w-24 grid-rows-2 gap-1 overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex items-center justify-center gap-1 bg-stone-100 text-xs font-semibold text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
                  disabled={photoBusy}
                >
                  <Camera className="h-4 w-4" /> Photo
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="flex items-center justify-center gap-1 bg-stone-100 text-xs font-semibold text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
                  disabled={photoBusy}
                >
                  <ImagePlus className="h-4 w-4" /> Galerie
                </button>
              </div>
            )}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="p-name" className="label">
              Nom
            </label>
            <input
              id="p-name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : Lait demi-écrémé"
              maxLength={80}
              autoFocus={!product}
              enterKeyHint="next"
            />
            {photoBusy && <p className="mt-1 text-xs text-stone-500">Préparation de la photo…</p>}
            {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
            {photo && product && photo !== product.photo && <p className="mt-1 text-xs text-brand-700 dark:text-brand-300">Nouvelle photo (enregistrée à la validation)</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="p-price" className="label">
              Prix unitaire
            </label>
            <div className="relative">
              <input id="p-price" className="field pr-12 tabular" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-stone-400">DH</span>
            </div>
          </div>
          <div>
            <label htmlFor="p-qty" className="label">
              Quantité
            </label>
            <input id="p-qty" className="field tabular" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" />
          </div>
        </div>

        <div>
          <span className="label">Unité</span>
          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-stone-800" role="radiogroup" aria-label="Unité">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                onClick={() => setUnit(u)}
                className={`h-10 rounded-xl text-sm font-semibold transition ${
                  unit === u ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-600 dark:text-white' : 'text-stone-500 dark:text-stone-400'
                }`}
                title={UNIT_LABEL[u]}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Magasin</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStoreId(null)}
              className={`h-9 rounded-full border px-3 text-sm font-semibold transition ${
                storeId === null ? 'border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900' : 'border-stone-200 dark:border-stone-700'
              }`}
            >
              Aucun
            </button>
            {data.stores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStoreId(s.id)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition ${
                  storeId === s.id ? 'border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900' : 'border-stone-200 dark:border-stone-700'
                }`}
                aria-pressed={storeId === s.id}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Liste du mois</span>
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-stone-800" role="radiogroup" aria-label="Liste du mois">
            {[
              { value: null, label: `${monthLabel(data.currentMonth)} (en cours)` },
              { value: nextMonth, label: `${monthLabel(nextMonth)} (à préparer)` },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={month === o.value}
                onClick={() => setMonth(o.value)}
                className={`min-h-10 rounded-xl px-2 py-1.5 text-[13px] font-semibold leading-tight transition ${
                  month === o.value ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-600 dark:text-white' : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="p-notes" className="label">
            Notes / marques
          </label>
          <textarea
            id="p-notes"
            className="field h-auto min-h-[76px] py-3"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ex : Centrale Danone, bouteille 1 L, sans lactose…"
            maxLength={300}
            rows={2}
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3 dark:bg-stone-800/60">
          <span className="flex items-center gap-3">
            <Repeat className="h-5 w-5 text-brand-700 dark:text-brand-300" />
            <span>
              <span className="block text-sm font-semibold">Dans le mois référence</span>
              <span className="block text-xs text-stone-500 dark:text-stone-400">
                Revient chaque mois. {data.settings.syncReference === false ? '' : 'Un changement de prix ou de quantité met à jour la référence.'}
              </span>
            </span>
          </span>
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-6 w-6 accent-brand-700" />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3 dark:bg-stone-800/60">
          <span className="flex items-center gap-3">
            <EyeOff className="h-5 w-5 text-stone-500" />
            <span>
              <span className="block text-sm font-semibold">Ignorer ce mois</span>
              <span className="block text-xs text-stone-500 dark:text-stone-400">Pas besoin cette fois : hors budget et hors liste à acheter</span>
            </span>
          </span>
          <input type="checkbox" checked={skipped} onChange={(e) => setSkipped(e.target.checked)} className="h-6 w-6 accent-brand-700" />
        </label>

        <div className="flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
          <span className="text-sm font-semibold">Total de la ligne</span>
          <span className="text-lg font-bold tabular">{formatDH(preview)}</span>
        </div>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>

      {product && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          danger
          title="Supprimer cet article ?"
          message={`« ${product.name} » sera retiré de la liste.`}
          confirmLabel="Supprimer"
          onConfirm={() => {
            dispatch({ type: 'product/delete', id: product.id });
            onDeleted?.(product);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
