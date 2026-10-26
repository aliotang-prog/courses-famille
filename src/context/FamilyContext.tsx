// Synchronisation temps réel d'une famille :
//  - cache local (localStorage) pour un démarrage instantané et le hors-ligne,
//  - mises à jour optimistes : chaque action est appliquée tout de suite en local
//    puis envoyée au serveur (file d'attente persistée, renvoyée après coupure),
//  - SSE : l'état serveur arrive en direct depuis les autres téléphones.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Action, ActionEnvelope, FamilyData } from '../types';
import { HttpError, eventsUrl, fetchFamily, postActions } from '../lib/api';
import { uid } from '../lib/id';
import { readJSON, readString, writeJSON, writeString } from '../lib/storage';
import { rebase } from '../shared/reducer';
import { FAMILY_CODE_RE, createFamily, normalizeFamilyCode } from '../shared/defaults';
import { monthKeyFromDate } from '../shared/month';

export type SyncStatus = 'connecting' | 'online' | 'offline';

interface FamilyCtx {
  code: string;
  setCode: (code: string) => boolean;
  data: FamilyData | null;
  status: SyncStatus;
  devices: number;
  pendingCount: number;
  dispatch: (action: Action) => void;
}

const Ctx = createContext<FamilyCtx | null>(null);

export const DEFAULT_FAMILY_CODE = 'FAMILLE-KASM';

function initialCode(): string {
  // Lien d'invitation : /?code=FAMILLE-XXXX
  const fromUrl = new URLSearchParams(window.location.search).get('code');
  if (fromUrl) {
    const c = normalizeFamilyCode(fromUrl);
    if (FAMILY_CODE_RE.test(c)) {
      writeString('cf:code', c);
      window.history.replaceState(null, '', window.location.pathname);
      return c;
    }
  }
  const saved = readString('cf:code');
  return saved && FAMILY_CODE_RE.test(saved) ? saved : DEFAULT_FAMILY_CODE;
}

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [code, setCodeState] = useState<string>(initialCode);

  const setCode = useCallback((raw: string) => {
    const c = normalizeFamilyCode(raw);
    if (!FAMILY_CODE_RE.test(c)) return false;
    writeString('cf:code', c);
    setCodeState(c);
    return true;
  }, []);

  // `key` : changer de code remonte entièrement la synchro (état, SSE, file d'attente).
  return (
    <SyncProvider key={code} code={code} setCode={setCode}>
      {children}
    </SyncProvider>
  );
}

function SyncProvider({ code, setCode, children }: { code: string; setCode: (c: string) => boolean; children: ReactNode }) {
  const cacheKey = `cf:data:${code}`;
  const pendingKey = `cf:pending:${code}`;

  const [server, setServer] = useState<FamilyData | null>(() => readJSON<FamilyData>(cacheKey));
  const [pending, setPending] = useState<ActionEnvelope[]>(() => readJSON<ActionEnvelope[]>(pendingKey) ?? []);
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [devices, setDevices] = useState(1);
  const [flushTick, setFlushTick] = useState(0);
  const flushing = useRef(false);
  const retryTimer = useRef<number | undefined>(undefined);

  /** Intègre un état serveur. `force` : état faisant autorité (connexion/reconnexion). */
  const acceptServer = useCallback((next: FamilyData, force = false) => {
    setServer((prev) => (!force && prev && next.version < prev.version ? prev : next));
    const known = new Set(next.lastActionIds);
    setPending((p) => {
      const left = p.filter((e) => !known.has(e.id));
      return left.length === p.length ? p : left;
    });
  }, []);

  // Persistance du cache et de la file d'attente.
  useEffect(() => {
    if (server && server.version > 0) writeJSON(cacheKey, server);
  }, [server, cacheKey]);
  useEffect(() => {
    writeJSON(pendingKey, pending);
  }, [pending, pendingKey]);

  // Chargement initial (le SSE envoie aussi l'état, ceci sert de filet de sécurité).
  useEffect(() => {
    let cancelled = false;
    fetchFamily(code)
      .then((d) => {
        if (!cancelled) acceptServer(d, true);
      })
      .catch(() => {
        if (cancelled) return;
        // Premier lancement hors-ligne : liste locale (version 0, remplacée dès la connexion).
        setServer((prev) => prev ?? { ...createFamily(code, monthKeyFromDate(new Date()), Date.now()), version: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [code, acceptServer]);

  // Server-Sent Events.
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnect: number | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setStatus((s) => (s === 'online' ? s : 'connecting'));
      es = new EventSource(eventsUrl(code));
      let first = true;
      es.addEventListener('state', (ev) => {
        try {
          acceptServer(JSON.parse((ev as MessageEvent<string>).data) as FamilyData, first);
          first = false;
          setStatus('online');
        } catch {
          /* message corrompu : ignoré */
        }
      });
      es.addEventListener('presence', (ev) => {
        try {
          setDevices((JSON.parse((ev as MessageEvent<string>).data) as { devices: number }).devices);
        } catch {
          /* ignore */
        }
      });
      es.onopen = () => {
        setStatus('online');
        setFlushTick((t) => t + 1);
      };
      es.onerror = () => {
        setStatus('offline');
        setDevices(1);
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          reconnect = window.setTimeout(connect, 3000);
        }
        // Sinon, EventSource se reconnecte tout seul (champ `retry`).
      };
    };

    connect();
    const onOnline = () => {
      setFlushTick((t) => t + 1);
      if (!es || es.readyState === EventSource.CLOSED) {
        window.clearTimeout(reconnect);
        connect();
      }
    };
    window.addEventListener('online', onOnline);
    return () => {
      disposed = true;
      window.clearTimeout(reconnect);
      window.removeEventListener('online', onOnline);
      es?.close();
    };
  }, [code, acceptServer]);

  // Envoi de la file d'attente (séquentiel, par lots).
  useEffect(() => {
    if (flushing.current || !pending.length) return;
    flushing.current = true;
    window.clearTimeout(retryTimer.current);
    const batch = pending.slice(0, 50);
    let failed = false;

    postActions(code, batch)
      .then((res) => {
        acceptServer(res.data);
        const done = new Set([...res.processed, ...res.rejected]);
        setPending((p) => p.filter((e) => !done.has(e.id)));
        setStatus('online');
      })
      .catch((err: unknown) => {
        if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
          // Requête invalide : on l'abandonne pour ne pas bloquer la file.
          const dropped = new Set(batch.map((e) => e.id));
          setPending((p) => p.filter((e) => !dropped.has(e.id)));
          return;
        }
        failed = true;
        setStatus('offline');
        retryTimer.current = window.setTimeout(() => setFlushTick((t) => t + 1), 4000);
      })
      .finally(() => {
        flushing.current = false;
        if (!failed) setFlushTick((t) => t + 1);
      });
  }, [pending, flushTick, code, acceptServer]);

  useEffect(() => () => window.clearTimeout(retryTimer.current), []);

  const dispatch = useCallback((action: Action) => {
    setPending((p) => [...p, { id: uid(), at: Date.now(), action }]);
  }, []);

  const data = useMemo(() => (server ? rebase(server, pending) : null), [server, pending]);

  const value = useMemo<FamilyCtx>(
    () => ({ code, setCode, data, status, devices, pendingCount: pending.length, dispatch }),
    [code, setCode, data, status, devices, pending.length, dispatch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily(): FamilyCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFamily doit être utilisé dans <FamilyProvider>');
  return v;
}

/** Version garantie non nulle (à utiliser sous l'écran de chargement). */
export function useFamilyData(): FamilyCtx & { data: FamilyData } {
  const v = useFamily();
  if (!v.data) throw new Error('Données famille non chargées');
  return v as FamilyCtx & { data: FamilyData };
}
