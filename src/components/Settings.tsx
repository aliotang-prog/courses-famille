import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Cloud,
  CloudUpload,
  Download,
  ExternalLink,
  FileSpreadsheet,
  LoaderCircle,
  Moon,
  Store as StoreIcon,
  Sun,
  Trash2,
  Undo2,
  Users,
  Wallet,
} from 'lucide-react';
import type { FamilyData } from '../types';
import { useFamilyData } from '../context/FamilyContext';
import { useTheme } from '../context/ThemeContext';
import { addMonths, productMonth } from '../shared/month';
import { formatDH, formatDate, monthLabel, parseDecimal } from '../lib/format';
import { backupAvailable, backupErrorMessage, backupToSheets, sheetUrl } from '../lib/googleBackup';
import { offerFile, storageLabel, toCsv } from '../lib/download';
import { templateCsv } from '../lib/importRows';
import { canRestore, exportFull, readBackupFile, restoreFull } from '../lib/fullBackup';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { FitImage } from './ui/FitImage';
import { ArticlesTable } from './ArticlesTable';

type Tab = 'articles' | 'magasins' | 'budget' | 'donnees';

interface SettingsProps {
  onClose: () => void;
  onManageStores: () => void;
  onFamily: () => void;
  onImport: () => void;
}

const num = (n: number) => String(n).replace('.', ',');

/** Réglages : toutes les données de la famille, modifiables au même endroit. */
export function Settings({ onClose, onManageStores, onFamily, onImport }: SettingsProps) {
  const { data, dispatch, code } = useFamilyData();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>('articles');
  const [budget, setBudget] = useState(data.settings.monthlyBudget ? num(data.settings.monthlyBudget) : '');
  const [confirm, setConfirm] = useState<null | 'clear' | 'uncheck' | 'discard' | { month: string }>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const storeName = useMemo(() => new Map(data.stores.map((s) => [s.id, s.name])), [data.stores]);
  const [gAvail, setGAvail] = useState<boolean | null>(null);
  const [gBusy, setGBusy] = useState<string | null>(null);
  const [gMsg, setGMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fullMsg, setFullMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fullBusy, setFullBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState<{ name: string; data: Partial<FamilyData> } | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const doExportFull = async () => {
    setFullBusy(true);
    setFullMsg(null);
    try {
      const ok = await exportFull(data);
      setFullMsg(ok ? { ok: true, text: 'Sauvegarde complète téléchargée (avec les photos).' } : { ok: false, text: 'Téléchargement annulé.' });
    } catch {
      setFullMsg({ ok: false, text: 'La sauvegarde a échoué.' });
    } finally {
      setFullBusy(false);
    }
  };
  const pickRestore = async (file: File | undefined) => {
    if (!file) return;
    setFullMsg(null);
    try {
      setRestoreFile({ name: file.name, data: await readBackupFile(file) });
    } catch (e) {
      setFullMsg({ ok: false, text: e instanceof Error ? e.message : 'Fichier illisible.' });
    }
  };
  const doRestore = async () => {
    if (!restoreFile) return;
    setFullBusy(true);
    try {
      await restoreFull(code, restoreFile.data, (d, t) => setFullMsg({ ok: true, text: t ? `Envoi des photos… ${d}/${t}` : 'Restauration…' }));
      window.location.reload();
    } catch (e) {
      setFullMsg({ ok: false, text: e instanceof Error ? e.message : 'La restauration a échoué.' });
      setFullBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    void backupAvailable().then((v) => alive && setGAvail(v));
    return () => {
      alive = false;
    };
  }, []);
  const sheetId = data.settings.backupSheetId ?? null;
  const backup = async () => {
    if (gBusy) return;
    setGMsg(null);
    setGBusy('Connexion à Google…');
    try {
      const at = Date.now();
      const id = await backupToSheets(data, setGBusy);
      dispatch({ type: 'settings/update', patch: { backupSheetId: id, backupAt: at } });
      setGMsg({ ok: true, text: `Sauvegardé : ${data.products.length} articles, ${(data.reference ?? []).length} dans la référence, ${data.stores.length} magasins.` });
    } catch (e) {
      setGMsg({ ok: false, text: backupErrorMessage(e) });
    } finally {
      setGBusy(null);
    }
  };

  const exportCsv = async () => {
    const rows: Array<Array<string | number>> = [['Nom', 'Prix (DH)', 'Quantité', 'Unité', 'Magasin', 'Notes / marque', 'Acheté', 'Mois', 'Récurrent', 'Ignoré']];
    for (const p of data.products) {
      rows.push([
        p.name,
        p.price,
        p.quantity,
        p.unit,
        p.storeId ? (storeName.get(p.storeId) ?? '') : '',
        p.notes,
        p.checked ? 'oui' : 'non',
        monthLabel(productMonth(p, data.currentMonth)),
        p.recurring ? 'oui' : 'non',
        p.skipped ? 'oui' : 'non',
      ]);
    }
    const ok = await offerFile(`courses-${code.toLowerCase()}-${data.currentMonth}.csv`, toCsv(rows));
    setExportMsg(ok ? `${data.products.length} articles exportés.` : 'Export annulé.');
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${tab === t ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'bg-white text-stone-600 dark:bg-stone-900 dark:text-stone-300'}`}
    >
      {label}
    </button>
  );

  const card = 'rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-stone-800';
  const row = 'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/60';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 dark:bg-stone-950" role="region" aria-label="Réglages">
      <div className="pt-safe border-b border-stone-200 bg-stone-100/95 dark:border-stone-800 dark:bg-stone-950/95">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Retour à l’accueil">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-tight">Réglages</h2>
            <p className="flex items-center gap-1 truncate text-xs text-stone-500 dark:text-stone-400">
              <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> {storageLabel()}
            </p>
          </div>
        </div>
        <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 pb-3 no-scrollbar" role="tablist">
          {tabBtn('articles', `Articles (${data.products.length})`)}
          {tabBtn('magasins', `Magasins (${data.stores.length})`)}
          {tabBtn('budget', 'Budget & mois')}
          {tabBtn('donnees', 'Données')}
        </div>
      </div>

      <div className={`mx-auto w-full ${tab === 'articles' ? 'max-w-7xl' : 'max-w-2xl'} flex-1 overflow-y-auto overscroll-contain px-4 pb-16 pt-4`}>
        {tab === 'articles' && <ArticlesTable />}

        {tab === 'magasins' && (
          <div className={card}>
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {data.stores.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  {s.photo ? (
                    <FitImage src={s.photo} className="h-10 w-10 rounded-xl" style={{ boxShadow: `0 0 0 2px ${s.color}` }} />
                  ) : (
                    <span className="h-10 w-10 rounded-xl" style={{ backgroundColor: s.color }} />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                  <span className="text-xs text-stone-500">{data.products.filter((p) => p.storeId === s.id).length} articles</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={onManageStores} className="btn-primary mt-3 w-full">
              <StoreIcon className="h-5 w-5" /> Ajouter, renommer, couleur, photo, supprimer
            </button>
          </div>
        )}

        {tab === 'budget' && (
          <div className="space-y-4">
            <div className={card}>
              <label htmlFor="set-budget" className="label">
                <Wallet className="mr-1 inline h-3.5 w-3.5" /> Budget mensuel (DH)
              </label>
              <div className="flex gap-2">
                <input id="set-budget" className="field tabular" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="ex : 3000" />
                <button
                  type="button"
                  className="btn-primary shrink-0"
                  onClick={() => {
                    const v = parseDecimal(budget);
                    dispatch({ type: 'settings/update', patch: { monthlyBudget: Number.isFinite(v) && v > 0 ? v : null } });
                  }}
                >
                  Enregistrer
                </button>
              </div>
              <p className="mt-2 text-xs text-stone-500">Mois en cours : {monthLabel(data.currentMonth)}. Laissez vide pour ne pas suivre de budget.</p>
            </div>
            <div className={card}>
              <h3 className="mb-1 font-semibold">Mois en cours : {monthLabel(data.currentMonth)}</h3>
              <p className="mb-3 text-sm text-stone-500">
                Supprimer ce mois sans l’archiver : la liste de {monthLabel(addMonths(data.currentMonth, 1))} démarre avec le mois référence et les articles déjà préparés.
              </p>
              <button type="button" onClick={() => setConfirm('discard')} className="btn-danger w-full">
                <Trash2 className="h-5 w-5" /> Supprimer {monthLabel(data.currentMonth)}
              </button>
            </div>
            <div className={card}>
              <h3 className="mb-2 font-semibold">Mois archivés</h3>
              {data.history.length === 0 && <p className="text-sm text-stone-500">Aucun mois clôturé pour l’instant.</p>}
              <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                {[...data.history]
                  .sort((a, b) => b.month.localeCompare(a.month))
                  .map((h) => (
                    <li key={h.month} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{monthLabel(h.month)}</span>
                        <span className="text-xs text-stone-500 tabular">
                          {formatDH(h.spent)} dépensés · clôturé le {formatDate(h.archivedAt)}
                        </span>
                      </span>
                      <button type="button" onClick={() => setConfirm({ month: h.month })} className="grid h-10 w-10 place-items-center rounded-xl text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" aria-label={`Supprimer l’archive ${monthLabel(h.month)}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}

        {tab === 'donnees' && (
          <div className="space-y-4">
            <div className={card}>
              <div className="flex items-start gap-3 px-1">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Sauvegarde Google Sheets</span>
                  <span className="block text-sm text-stone-500 dark:text-stone-400">
                    Copie toutes les données (articles, mois référence, magasins, historique) dans une feuille Google à votre nom. Les photos restent dans l’appli.
                  </span>
                  {data.settings.backupAt ? (
                    <span className="mt-1 block text-xs text-stone-500">Dernière sauvegarde : {new Date(data.settings.backupAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  ) : null}
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => void backup()} disabled={Boolean(gBusy) || gAvail === false} className="btn-primary flex-1">
                  {gBusy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CloudUpload className="h-5 w-5" />}
                  {gBusy ?? (sheetId ? 'Mettre à jour la sauvegarde' : 'Sauvegarder vers Google Sheets')}
                </button>
                {sheetId && (
                  <a href={sheetUrl(sheetId)} target="_blank" rel="noreferrer" className="btn-secondary flex-1 justify-center">
                    <ExternalLink className="h-5 w-5" /> Ouvrir la feuille
                  </a>
                )}
              </div>
              {gAvail === false && <p className="mt-2 text-xs text-stone-500">Disponible quand l’appli est ouverte depuis Claude (connecteurs Google Sheets et Google Drive).</p>}
              {gMsg && (
                <p role="status" className={`mt-2 rounded-xl px-3 py-2 text-sm ${gMsg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'}`}>
                  {gMsg.text}
                </p>
              )}
            </div>
            <div className={card}>
              <button type="button" onClick={onFamily} className={row}>
                <Users className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Code famille</span>
                  <span className="block font-mono text-sm text-stone-500">{code}</span>
                </span>
              </button>
              <button type="button" onClick={toggleTheme} className={row}>
                {theme === 'dark' ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-stone-600" />}
                <span className="font-semibold">Mode {theme === 'dark' ? 'clair' : 'sombre'}</span>
              </button>
            </div>
            <div className={card}>
              <button type="button" onClick={onImport} className={row}>
                <FileSpreadsheet className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                <span className="font-semibold">Importer depuis Excel / CSV</span>
              </button>
              <button type="button" onClick={exportCsv} className={row}>
                <Download className="h-5 w-5 text-sky-700 dark:text-sky-400" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Exporter tous les articles (CSV pour Excel)</span>
                  {exportMsg && <span className="block text-xs text-stone-500">{exportMsg}</span>}
                </span>
              </button>
              <button type="button" onClick={() => void offerFile('modele-courses-famille.csv', templateCsv())} className={row}>
                <Download className="h-5 w-5 text-stone-500" />
                <span className="font-semibold">Télécharger un modèle Excel vide</span>
              </button>
            </div>
            <div className={card}>
              <button type="button" onClick={() => void doExportFull()} disabled={fullBusy} className={row}>
                {fullBusy ? <LoaderCircle className="h-5 w-5 animate-spin text-brand-700" /> : <Download className="h-5 w-5 text-brand-700 dark:text-brand-300" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Sauvegarde complète (.json)</span>
                  <span className="block text-xs text-stone-500">Tout : articles, mois référence, magasins, historique, réglages et photos.</span>
                </span>
              </button>
              {canRestore() && (
                <>
                  <button type="button" onClick={() => restoreInput.current?.click()} disabled={fullBusy} className={row}>
                    <Undo2 className="h-5 w-5 text-amber-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">Restaurer une sauvegarde (.json)</span>
                      <span className="block text-xs text-stone-500">Remplace toutes les données de la famille {code}.</span>
                    </span>
                  </button>
                  <input ref={restoreInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void pickRestore(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
                </>
              )}
              {fullMsg && (
                <p role="status" className={`mt-2 rounded-xl px-3 py-2 text-sm ${fullMsg.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'}`}>
                  {fullMsg.text}
                </p>
              )}
            </div>
            <div className={card}>
              <button type="button" onClick={() => setConfirm('uncheck')} className={row}>
                <Undo2 className="h-5 w-5 text-stone-600" />
                <span className="font-semibold">Tout remettre « à acheter »</span>
              </button>
              <button type="button" onClick={() => setConfirm('clear')} className={`${row} text-red-600 dark:text-red-400`}>
                <Trash2 className="h-5 w-5" />
                <span className="font-semibold">Supprimer tous les articles</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={restoreFile !== null}
        onClose={() => setRestoreFile(null)}
        danger
        title="Restaurer cette sauvegarde ?"
        confirmLabel="Restaurer"
        message={restoreFile ? `« ${restoreFile.name} » : ${restoreFile.data.products?.length ?? 0} articles, ${restoreFile.data.reference?.length ?? 0} dans la référence, ${restoreFile.data.stores?.length ?? 0} magasins. Les données actuelles de ${code} seront remplacées pour toute la famille.` : ''}
        onConfirm={() => void doRestore()}
      />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        danger={confirm === 'clear' || confirm === 'discard' || (typeof confirm === 'object' && confirm !== null)}
        title={
          confirm === 'clear'
            ? 'Supprimer tous les articles ?'
            : confirm === 'uncheck'
              ? 'Tout remettre à acheter ?'
              : confirm === 'discard'
                ? `Supprimer ${monthLabel(data.currentMonth)} ?`
                : 'Supprimer cette archive ?'
        }
        confirmLabel={confirm === 'uncheck' ? 'Confirmer' : 'Supprimer'}
        message={
          confirm === 'discard'
            ? `${monthLabel(data.currentMonth)} n’est pas archivé (ni récap, ni comparatif). Le mois en cours devient ${monthLabel(addMonths(data.currentMonth, 1))} : sa liste reprend les ${(data.reference ?? []).length} articles du mois référence, plus les articles déjà préparés, tous « à acheter ».`
            : confirm === 'clear'
            ? `Les ${data.products.length} articles seront supprimés pour toute la famille. Les magasins et les mois archivés sont conservés. Pensez à exporter avant.`
            : confirm === 'uncheck'
              ? 'Tous les articles achetés redeviennent « à acheter ».'
              : 'Le mois archivé disparaît de l’historique et du comparatif.'
        }
        onConfirm={() => {
          if (confirm === 'discard') dispatch({ type: 'month/close', fromMonth: data.currentMonth, archive: false });
          else if (confirm === 'clear') dispatch({ type: 'bulk/delete', ids: data.products.map((p) => p.id) });
          else if (confirm === 'uncheck') dispatch({ type: 'bulk/setChecked', ids: data.products.map((p) => p.id), checked: false });
          else if (confirm && typeof confirm === 'object') dispatch({ type: 'history/delete', month: confirm.month });
        }}
      />
    </div>
  );
}
