import { useState } from 'react';
import { Check, Copy, Link2, LogIn, Shuffle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { useFamily } from '../context/FamilyContext';
import { FAMILY_CODE_RE, normalizeFamilyCode } from '../shared/defaults';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }
  // Repli pour http://192.168.x.x (pas de presse-papiers asynchrone hors HTTPS).
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

function randomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `FAMILLE-${Array.from(bytes, (b) => letters[b % letters.length]).join('')}`;
}

export function FamilyCodeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { code, setCode, devices, status } = useFamily();
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const link = `${window.location.origin}/?code=${encodeURIComponent(code)}`;
  const normalized = normalizeFamilyCode(draft);

  const copy = async (what: 'code' | 'link') => {
    if (await copyText(what === 'code' ? code : link)) {
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    }
  };

  const join = (value: string) => {
    if (!setCode(value)) {
      setError('Code invalide : 3 à 32 caractères (lettres, chiffres, tirets).');
      return;
    }
    setDraft('');
    setError(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Code famille">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Tous les téléphones qui utilisent ce code partagent la même liste, en temps réel.
      </p>

      <div className="mt-4 rounded-3xl bg-brand-50 p-4 text-center ring-1 ring-brand-200 dark:bg-brand-900/30 dark:ring-brand-800">
        <div className="font-mono text-2xl font-black tracking-widest text-brand-800 dark:text-brand-200">{code}</div>
        <div className="mt-1 text-xs text-brand-700/80 dark:text-brand-300/80">
          {status === 'online' ? `${devices} appareil${devices > 1 ? 's' : ''} connecté${devices > 1 ? 's' : ''} maintenant` : 'Hors-ligne pour le moment'}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => copy('code')} className="btn-secondary h-11 bg-white text-sm dark:bg-stone-800">
            {copied === 'code' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied === 'code' ? 'Copié' : 'Copier le code'}
          </button>
          <button type="button" onClick={() => copy('link')} className="btn-secondary h-11 bg-white text-sm dark:bg-stone-800">
            {copied === 'link' ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
            {copied === 'link' ? 'Copié' : 'Copier le lien'}
          </button>
        </div>
        <div className="mt-2 break-all text-[11px] text-stone-500 dark:text-stone-400">{link}</div>
      </div>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          join(draft);
        }}
      >
        <label htmlFor="join-code" className="label">
          Rejoindre une autre famille
        </label>
        <div className="flex gap-2">
          <input
            id="join-code"
            className="field font-mono uppercase"
            placeholder="FAMILLE-XXXX"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!FAMILY_CODE_RE.test(normalized) || normalized === code} aria-label="Rejoindre">
            <LogIn className="h-5 w-5" />
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      <button type="button" onClick={() => setDraft(randomCode())} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
        <Shuffle className="h-4 w-4" /> Générer un nouveau code privé
      </button>
    </Modal>
  );
}
