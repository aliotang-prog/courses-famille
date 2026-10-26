import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, ListChecks, Loader2, Plus, Search, X } from 'lucide-react';
import type { MonthKey, Product } from './types';
import { useFamily, useFamilyData } from './context/FamilyContext';
import { Header } from './components/Header';
import { BudgetSummary } from './components/BudgetSummary';
import { StoreFilter, matchesStore } from './components/StoreFilter';
import type { StoreFilterValue } from './components/StoreFilter';
import { ProductList } from './components/ProductList';
import { ProductModal } from './components/ProductModal';
import type { ProductDraft } from './components/ProductModal';
import { QuickAdd } from './components/QuickAdd';
import { BulkActionBar } from './components/BulkActionBar';
import { StoreManager } from './components/StoreManager';
import { FamilyCodeModal } from './components/FamilyCodeModal';
import { ShoppingMode } from './components/ShoppingMode';
import { ArchiveView } from './components/ArchiveView';
import { Toast } from './components/ui/Toast';
import { ImportModal } from './components/ImportModal';
import { Home } from './components/Home';
import { Settings } from './components/Settings';
import { ReferencePage } from './components/ReferencePage';
import { RecapPage } from './components/RecapPage';
import { addMonths, inMonth } from './shared/month';
import type { ToastState } from './components/ui/Toast';

type Editing = { id: string | null; draft?: ProductDraft };

/** Recherche insensible aux accents et à la casse. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export default function App() {
  const { data, code } = useFamily();
  if (!data) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
          <p className="mt-3 font-semibold">Connexion à la liste {code}…</p>
        </div>
      </div>
    );
  }
  return <MainScreen />;
}

function MainScreen() {
  const { data, dispatch } = useFamilyData();

  const [storeFilter, setStoreFilter] = useState<StoreFilterValue>('all');
  const [search, setSearch] = useState('');
  const [listView, setListView] = useState<'todo' | 'done'>('todo');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [shopping, setShopping] = useState(false);
  const [storesOpen, setStoresOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<MonthKey | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState<'home' | 'list'>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);

  // Filtre sur un magasin supprimé (ici ou sur un autre téléphone) → « Tous ».
  useEffect(() => {
    if (storeFilter !== 'all' && storeFilter !== 'none' && !data.stores.some((s) => s.id === storeFilter)) setStoreFilter('all');
  }, [storeFilter, data.stores]);

  // Retire de la sélection les articles qui n'existent plus.
  useEffect(() => {
    setSelected((sel) => {
      if (!sel.size) return sel;
      const ids = new Set(data.products.map((p) => p.id));
      const next = new Set([...sel].filter((id) => ids.has(id)));
      return next.size === sel.size ? sel : next;
    });
  }, [data.products]);

  // Mois affiché : en cours, suivant (liste préparée à l'avance) ou archive.
  const nextMonth = addMonths(data.currentMonth, 1);
  const planning = viewMonth === nextMonth;
  const listMonth = planning ? nextMonth : data.currentMonth;
  const archive = viewMonth && !planning ? data.history.find((h) => h.month === viewMonth) : undefined;
  useEffect(() => {
    if (viewMonth && viewMonth !== nextMonth && !data.history.some((h) => h.month === viewMonth)) setViewMonth(null);
  }, [viewMonth, nextMonth, data.history]);

  const monthProducts = useMemo(() => data.products.filter((p) => inMonth(p, data.currentMonth, listMonth)), [data.products, data.currentMonth, listMonth]);

  const visible = useMemo(() => {
    const q = fold(search.trim());
    return monthProducts.filter(
      (p) =>
        matchesStore(p, storeFilter, data.stores) &&
        (listView === 'todo' ? !p.checked && !p.skipped : p.checked || p.skipped || (p.boughtQty ?? 0) > 0) &&
        (!q || fold(p.name).includes(q) || fold(p.notes).includes(q)),
    );
  }, [monthProducts, data.stores, storeFilter, listView, search]);

  const visibleIds = useMemo(() => visible.map((p) => p.id), [visible]);

  const showToast = useCallback((t: Omit<ToastState, 'id'>) => setToast({ ...t, id: Date.now() }), []);
  const clearToast = useCallback(() => setToast(null), []);

  const restore = useCallback(
    (products: Product[]) => {
      for (const p of products) dispatch({ type: 'product/add', product: p });
    },
    [dispatch],
  );

  const onToggleChecked = useCallback((p: Product) => dispatch({ type: 'product/setChecked', id: p.id, checked: !p.checked }), [dispatch]);
  const onQuantity = useCallback((id: string, delta: number) => dispatch({ type: 'product/quantity', id, delta }), [dispatch]);
  const onEdit = useCallback((p: Product) => setEditing({ id: p.id }), []);
  const onUnskip = useCallback((p: Product) => dispatch({ type: 'bulk/skip', ids: [p.id], skipped: false }), [dispatch]);
  const onDelete = useCallback(
    (p: Product) => {
      dispatch({ type: 'product/delete', id: p.id });
      showToast({ message: `« ${p.name} » supprimé`, actionLabel: 'Annuler', onAction: () => restore([p]) });
    },
    [dispatch, showToast, restore],
  );
  const onToggleSelected = useCallback((id: string) => {
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const editingProduct = editing?.id ? (data.products.find((p) => p.id === editing.id) ?? null) : null;
  // Article supprimé par un autre téléphone pendant l'édition → on ferme.
  useEffect(() => {
    if (editing?.id && !editingProduct) setEditing(null);
  }, [editing, editingProduct]);

  const activeStoreId = storeFilter !== 'all' && storeFilter !== 'none' ? storeFilter : null;
  const filterLabel =
    storeFilter === 'all' ? '' : storeFilter === 'none' ? ' sans magasin' : ` chez ${data.stores.find((s) => s.id === storeFilter)?.name ?? ''}`;

  return (
    <div className="min-h-dvh">
      <Header
        onOpenFamily={() => setFamilyOpen(true)}
        onOpenShopping={() => setShopping(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onHome={page === 'list' ? () => setPage('home') : undefined}
      />

      <main className={`mx-auto max-w-2xl space-y-4 px-4 pt-4 ${archive || page === 'home' ? 'pb-10' : 'pb-40'}`}>
        {archive ? (
          <>
            <BudgetSummary viewMonth={viewMonth} onViewMonth={setViewMonth} />
            <ArchiveView archive={archive} onBack={() => setViewMonth(null)} />
          </>
        ) : page === 'home' ? (
          <Home
            viewMonth={viewMonth}
            onViewMonth={setViewMonth}
            onOpenStore={(f) => {
              setStoreFilter(f);
              setPage('list');
              window.scrollTo(0, 0);
            }}
            onShop={(f) => {
              setStoreFilter(f);
              setShopping(true);
            }}
            onManageStores={() => setStoresOpen(true)}
            onImport={() => setImportOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            onAdd={() => setEditing({ id: null, draft: { storeId: null, month: planning ? nextMonth : null } })}
            onReference={() => setRefOpen(true)}
            onRecap={() => setRecapOpen(true)}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage('home')} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold text-stone-700 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-800">
                <ArrowLeft className="h-4 w-4" /> Accueil
              </button>
              <h2 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">
                {storeFilter === 'all' ? 'Tous les articles' : storeFilter === 'none' ? 'Sans magasin' : (data.stores.find((st) => st.id === storeFilter)?.name ?? 'Articles')}
              </h2>
            </div>
            <BudgetSummary viewMonth={viewMonth} onViewMonth={setViewMonth} />
            <StoreFilter stores={data.stores} products={monthProducts} value={storeFilter} onChange={setStoreFilter} onManage={() => setStoresOpen(true)} />

            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-stone-400" />
                <span className="sr-only">Rechercher un article</span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un article, une marque…"
                  className="h-11 w-full rounded-2xl border border-stone-200 bg-white pl-10 pr-10 outline-none ring-brand-500/20 placeholder:text-stone-400 focus:border-brand-500 focus:ring-4 dark:border-stone-800 dark:bg-stone-900 [&::-webkit-search-cancel-button]:hidden"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-stone-400 hover:text-stone-700" aria-label="Effacer la recherche">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-stone-200 bg-white text-emerald-700 transition dark:border-stone-800 dark:bg-stone-900 dark:text-emerald-400"
                aria-label="Importer des articles depuis Excel"
                title="Importer depuis Excel"
              >
                <FileSpreadsheet className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border px-3 text-sm font-semibold transition ${
                  selectMode ? 'border-brand-700 bg-brand-700 text-white dark:border-brand-600 dark:bg-brand-600' : 'border-stone-200 bg-white text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200'
                }`}
                aria-pressed={selectMode}
                aria-label={selectMode ? 'Terminer la sélection' : 'Sélection multiple'}
              >
                <ListChecks className="h-4.5 w-4.5" />
                <span className="hidden min-[400px]:inline">{selectMode ? 'Terminer' : 'Sélection'}</span>
              </button>
            </div>

            <div className="flex gap-1 rounded-[1.25rem] bg-stone-200/70 p-1 dark:bg-stone-800" role="tablist" aria-label="Vue de la liste">
              {(
                [
                  ['todo', 'À acheter', monthProducts.filter((p) => matchesStore(p, storeFilter, data.stores) && !p.checked && !p.skipped).length],
                  ['done', 'Déjà acheté', monthProducts.filter((p) => matchesStore(p, storeFilter, data.stores) && (p.checked || p.skipped || (p.boughtQty ?? 0) > 0)).length],
                ] as const
              ).map(([v, label, n]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={listView === v}
                  onClick={() => setListView(v)}
                  className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition ${
                    listView === v ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white' : 'text-stone-500 dark:text-stone-400'
                  }`}
                >
                  {label}
                  <span className="rounded-full bg-stone-500/15 px-2 text-xs tabular">{n}</span>
                </button>
              ))}
            </div>

            {!selectMode && listView === 'todo' && (
              <button
                type="button"
                onClick={() => setEditing({ id: null, draft: { storeId: activeStoreId, month: planning ? nextMonth : null } })}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/60 py-3 font-semibold text-brand-800 transition active:scale-[0.99] hover:bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-200"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} /> Nouvel article
                <span className="text-xs font-medium opacity-70">photo, prix, magasin…</span>
              </button>
            )}

            <ProductList
              products={visible}
              stores={data.stores}
              groupByStore={storeFilter === 'all'}
              selectMode={selectMode}
              selected={selected}
              emptyHint={
                search
                  ? `Aucun article ne correspond à « ${search} »${filterLabel}.`
                  : monthProducts.length
                    ? listView === 'todo'
                      ? `Tout est acheté${filterLabel} 🎉`
                      : `Rien d’acheté${filterLabel} pour l’instant.`
                    : planning
                      ? 'La liste du mois prochain est vide. Ajoutez des articles en bas, importez un fichier Excel, ou copiez des articles du mois en cours (bouton Sélection).'
                      : 'Ajoutez votre premier article avec la barre en bas (« Lait x6 7,5 ») ou importez votre fichier Excel.'
              }
              onToggleChecked={onToggleChecked}
              onToggleSelected={onToggleSelected}
              onQuantity={onQuantity}
              onEdit={onEdit}
              onDelete={onDelete}
              onUnskip={onUnskip}
            />
          </>
        )}
      </main>

      {!archive &&
        page === 'list' &&
        (selectMode ? (
          <BulkActionBar
            listMonth={listMonth}
            selected={selected}
            visibleIds={visibleIds}
            onSelectAll={() => setSelected(new Set(visibleIds))}
            onClear={() => setSelected(new Set())}
            onExit={exitSelect}
            onDeleted={(ids) => {
              const removed = data.products.filter((p) => ids.includes(p.id));
              setSelected(new Set());
              showToast({ message: `${removed.length} article(s) supprimé(s)`, actionLabel: 'Annuler', onAction: () => restore(removed) });
            }}
          />
        ) : (
          <QuickAdd activeStoreId={activeStoreId} month={planning ? nextMonth : null} onOpenFull={(draft) => setEditing({ id: null, draft: { ...draft, month: planning ? nextMonth : null } })} />
        ))}

      <ProductModal
        open={editing !== null && (editing.id === null || editingProduct !== null)}
        product={editingProduct}
        draft={editing?.draft}
        onClose={() => setEditing(null)}
        onDeleted={(p) => showToast({ message: `« ${p.name} » supprimé`, actionLabel: 'Annuler', onAction: () => restore([p]) })}
      />
      <StoreManager open={storesOpen} onClose={() => setStoresOpen(false)} />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultMonth={planning ? nextMonth : null}
        onImported={(n) => showToast({ message: `${n} article(s) importé(s)` })}
      />
      <FamilyCodeModal open={familyOpen} onClose={() => setFamilyOpen(false)} />

      {shopping && (
        <ShoppingMode
          initialStore={storeFilter}
          month={listMonth}
          onClose={() => setShopping(false)}
          onEdit={onEdit}
          onAdd={(storeId) => setEditing({ id: null, draft: { storeId, month: planning ? nextMonth : null } })}
        />
      )}

      {refOpen && <ReferencePage onClose={() => setRefOpen(false)} />}
      {recapOpen && <RecapPage onClose={() => setRecapOpen(false)} />}

      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          onManageStores={() => setStoresOpen(true)}
          onFamily={() => setFamilyOpen(true)}
          onImport={() => setImportOpen(true)}
        />
      )}

      <Toast toast={toast} onDone={clearToast} bottom={page === 'home' ? 'bottom-6' : selectMode ? 'bottom-40' : 'bottom-24'} />
    </div>
  );
}
