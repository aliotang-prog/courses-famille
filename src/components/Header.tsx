import { House as HomeIcon, Moon, Settings, ShoppingCart, Sun, Users } from 'lucide-react';
import { useFamilyData } from '../context/FamilyContext';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  onOpenFamily: () => void;
  onOpenShopping: () => void;
  onOpenSettings: () => void;
  /** Présent sur les pages secondaires : retour à l'accueil. */
  onHome?: () => void;
}

export function Header({ onOpenFamily, onOpenShopping, onOpenSettings, onHome }: HeaderProps) {
  const { code, status, devices, pendingCount } = useFamilyData();
  const { theme, toggleTheme } = useTheme();

  const dot =
    status === 'online' && !pendingCount ? 'bg-emerald-500' : status === 'offline' ? 'bg-amber-500' : 'bg-sky-500 animate-pulse';
  const statusText =
    status === 'offline'
      ? pendingCount
        ? `Hors-ligne · ${pendingCount} en attente`
        : 'Hors-ligne'
      : pendingCount
        ? 'Synchronisation…'
        : devices > 1
          ? `${devices} appareils connectés`
          : 'Synchronisé';

  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-stone-200/70 bg-stone-100/85 backdrop-blur-md dark:border-stone-800/70 dark:bg-stone-950/85">
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={onOpenFamily}
          className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl py-1 pr-2 text-left"
          aria-label={`Code famille ${code}. Ouvrir le partage`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-700 text-white shadow-sm dark:bg-brand-600">
            <Users className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-mono text-[15px] font-bold tracking-wide text-stone-900 group-active:opacity-70 dark:text-stone-50">
              {code}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
              <span className="truncate" aria-live="polite">
                {statusText}
              </span>
            </span>
          </span>
        </button>

        {onHome && (
          <button type="button" onClick={onHome} className="icon-btn" aria-label="Accueil">
            <HomeIcon className="h-5 w-5" />
          </button>
        )}
        <button type="button" onClick={toggleTheme} className="icon-btn hidden min-[420px]:grid" aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button type="button" onClick={onOpenSettings} className="icon-btn" aria-label="Réglages">
          <Settings className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onOpenShopping}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-saffron-400 px-3.5 text-sm font-bold text-stone-900 shadow-sm transition active:scale-95 hover:bg-saffron-500"
        >
          <ShoppingCart className="h-4 w-4" />
          <span>En rayon</span>
        </button>
      </div>
    </header>
  );
}
