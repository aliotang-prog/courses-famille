import { useEffect } from 'react';

export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Petit message éphémère au-dessus de la barre du bas (ex : « Supprimé · Annuler »). */
export function Toast({ toast, onDone, bottom = 'bottom-24' }: { toast: ToastState | null; onDone: () => void; bottom?: string }) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDone, 5000);
    return () => window.clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div className={`pointer-events-none fixed inset-x-0 ${bottom} z-50 flex justify-center px-4`} role="status">
      <div key={toast.id} className="pointer-events-auto flex animate-slide-up items-center gap-3 rounded-2xl bg-stone-900 py-2.5 pl-4 pr-2 text-sm text-white shadow-xl dark:bg-stone-100 dark:text-stone-900">
        <span>{toast.message}</span>
        {toast.actionLabel && toast.onAction && (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.();
              onDone();
            }}
            className="rounded-xl px-3 py-1.5 font-bold text-saffron-400 hover:bg-white/10 dark:text-brand-700 dark:hover:bg-black/5"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
